import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json());

const FIELD_WIDTH = 600;
const FIELD_HEIGHT = 300;

// === Banco de formações base (para o Palmeiras) ===
const FORMATIONS = {
  "4-4-2": [
    { id:13, zone:[70,80] }, { id:14, zone:[70,220] },
    { id:15, zone:[100,130] }, { id:16, zone:[100,170] },
    { id:17, zone:[200,80] }, { id:18, zone:[200,130] },
    { id:19, zone:[200,170] }, { id:20, zone:[200,220] },
    { id:21, zone:[320,120] }, { id:22, zone:[320,180] }
  ],
  "4-3-3": [
    { id:13, zone:[80,80] }, { id:14, zone:[80,220] },
    { id:15, zone:[100,130] }, { id:16, zone:[100,170] },
    { id:17, zone:[210,100] }, { id:18, zone:[210,150] }, { id:19, zone:[210,200] },
    { id:20, zone:[320,80] }, { id:21, zone:[330,150] }, { id:22, zone:[320,220] }
  ],
  "4-2-3-1": [
    { id:13, zone:[70,80] }, { id:14, zone:[70,220] },
    { id:15, zone:[100,130] }, { id:16, zone:[100,170] },
    { id:17, zone:[170,110] }, { id:18, zone:[170,190] },
    { id:19, zone:[230,80] }, { id:20, zone:[230,150] }, { id:21, zone:[230,220] },
    { id:22, zone:[320,150] }
  ],
  "3-5-2": [
    { id:13, zone:[70,100] }, { id:14, zone:[70,150] }, { id:15, zone:[70,200] },
    { id:16, zone:[130,60] }, { id:17, zone:[130,240] },
    { id:18, zone:[180,100] }, { id:19, zone:[180,150] }, { id:20, zone:[180,200] },
    { id:21, zone:[320,120] }, { id:22, zone:[320,180] }
  ],
  "4-5-1": [
    { id:13, zone:[70,80] }, { id:14, zone:[70,220] },
    { id:15, zone:[100,110] }, { id:16, zone:[100,150] }, { id:17, zone:[100,190] },
    { id:18, zone:[170,100] }, { id:19, zone:[170,200] },
    { id:20, zone:[250,130] }, { id:21, zone:[320,150] }, { id:22, zone:[320,180] }
  ],
  "5-4-1": [
    { id:13, zone:[60,70] }, { id:14, zone:[60,230] },
    { id:15, zone:[80,130] }, { id:16, zone:[80,170] }, { id:17, zone:[100,150] },
    { id:18, zone:[160,100] }, { id:19, zone:[160,200] },
    { id:20, zone:[230,130] }, { id:21, zone:[300,120] }, { id:22, zone:[300,180] }
  ],
  "5-3-2": [
    { id:13, zone:[60,90] }, { id:14, zone:[60,210] },
    { id:15, zone:[90,150] },
    { id:16, zone:[130,80] }, { id:17, zone:[130,220] },
    { id:18, zone:[180,120] }, { id:19, zone:[180,180] },
    { id:20, zone:[250,100] }, { id:21, zone:[320,120] }, { id:22, zone:[320,180] }
  ]
};

// === Detector geométrico de formação adversária (time preto) ===
function detectOpponentFormationAdvanced(black) {
  if (!black || black.length < 8) return "4-4-2";
  const sorted = [...black].sort((a, b) => a.left - b.left);
  const FIELD_THIRD = FIELD_WIDTH / 3;

  const defense = sorted.filter(p => p.left < FIELD_THIRD);
  const midfield = sorted.filter(p => p.left >= FIELD_THIRD && p.left < FIELD_THIRD * 2);
  const attack = sorted.filter(p => p.left >= FIELD_THIRD * 2);

  const avgX = (arr) => arr.reduce((a, p) => a + p.left, 0) / arr.length;
  const defAvg = avgX(defense);
  const midAvg = avgX(midfield);

  // Meias recuados = bloco baixo
  if (midAvg < 200 && defense.length >= 3 && midfield.length >= 3) {
    return defense.length + midfield.length >= 5 ? "5-4-1" : "4-5-1";
  }

  const avgGap = (arr) => {
    if (arr.length < 2) return 999;
    const gaps = [];
    for (let i = 1; i < arr.length; i++) gaps.push(Math.abs(arr[i].top - arr[i - 1].top));
    return gaps.reduce((a, b) => a + b, 0) / gaps.length;
  };

  const defGap = avgGap(defense);
  const midGap = avgGap(midfield);
  const attGap = avgGap(attack);
  const defenders = defense.length;
  const mids = midfield.length;
  const forwards = attack.length;

  if (defGap <= 70 && mids === 3 && attGap <= 70 && forwards === 3) return "4-3-3";
  if (defGap <= 70 && mids === 4 && forwards === 2) return "4-4-2";
  if (defGap <= 70 && mids === 5 && forwards === 1) return "4-5-1";
  if (defenders === 5 && mids === 4 && forwards === 1) return "5-4-1";
  if (defenders === 5 && mids === 3 && forwards === 2) return "5-3-2";
  if (defenders === 3 && mids >= 5 && forwards === 2) return "3-5-2";
  if (defenders === 4 && mids === 2 && forwards === 4) return "4-2-4";
  if (defenders === 4 && mids === 2 && forwards === 3) return "4-2-3-1";
  if (defenders === 3 && mids === 4 && forwards === 3) return "3-4-3";
  return "4-3-3";
}

// === Define formação do Palmeiras conforme adversário e posse ===
function chooseCounterFormation(opponentFormation, possession) {
  if (possession === "verde") {
    switch (opponentFormation) {
      case "5-3-2":
      case "5-4-1": return "4-2-3-1";
      case "4-4-2": return "4-3-3";
      case "3-4-3": return "4-2-4";
      case "3-5-2": return "4-2-3-1";
      default: return "4-3-3";
    }
  } else {
    switch (opponentFormation) {
      case "4-3-3": return "4-5-1";
      case "4-2-3-1": return "4-4-2";
      case "3-5-2": return "5-4-1";
      case "3-4-3": return "5-3-2";
      default: return "4-4-2";
    }
  }
}

// === Palmeiras joga da DIREITA → ESQUERDA (goleiro 23 fixo) ===
function buildGreenFromFormation(formationKey, ball, phase = "defesa") {
  const formation = FORMATIONS[formationKey] || FORMATIONS["4-3-3"];
  const greenAI = [];
  let offsetX = 0;
  switch (formationKey) {
    case "5-4-1": offsetX = 40; break;
    case "4-5-1": offsetX = 20; break;
    case "4-2-4": offsetX = 100; break;
    case "3-5-2": offsetX = 60; break;
  }

  for (const pos of formation) {
    const jitter = Math.random() * 6 - 3;
    let baseX;
    if (phase === "ataque") {
      baseX = FIELD_WIDTH - pos.zone[0] - offsetX;
    } else {
      baseX = FIELD_WIDTH - pos.zone[0] + offsetX;
    }
    baseX = Math.max(20, Math.min(FIELD_WIDTH - 20, baseX));
    greenAI.push({ id: pos.id, left: baseX, top: pos.zone[1] + jitter });
  }

  // Goleiro 23 fixo à direita
  const gkTop = FIELD_HEIGHT / 2;
  greenAI.push({ id: 23, left: FIELD_WIDTH - 10, top: gkTop });
  return { greenAI };
}

// === Fase tática e compactação ===
function detectPhase(possession, opponentFormation) {
  if (possession === "verde") {
    return { phase: "Ataque", bloco: "Alto", compactacao: "Larga" };
  }
  if (["5-4-1", "4-5-1"].includes(opponentFormation))
    return { phase: "Defesa", bloco: "Baixo", compactacao: "Curta" };
  if (["4-4-2", "4-3-3"].includes(opponentFormation))
    return { phase: "Transição", bloco: "Médio", compactacao: "Média" };
  return { phase: "Defesa", bloco: "Baixo", compactacao: "Curta" };
}

// === Rota principal de análise IA ===
app.post("/ai/analyze", async (req, res) => {
  try {
    const { green, black, ball, possession } = req.body;

    const opponentFormation = detectOpponentFormationAdvanced(black);
    const detectedFormation = chooseCounterFormation(opponentFormation, possession);
    const { greenAI } = buildGreenFromFormation(
      detectedFormation,
      ball,
      possession === "verde" ? "ataque" : "defesa"
    );

    const { phase, bloco, compactacao } = detectPhase(possession, opponentFormation);

    const coachComment = `O adversário joga num ${opponentFormation}. 
    Nós estamos em ${phase.toLowerCase()} com um bloco ${bloco.toLowerCase()} e compactação ${compactacao.toLowerCase()}, 
    reagindo em ${detectedFormation}.`;

    res.json({
      opponentFormation,
      detectedFormation,
      phase,
      bloco,
      compactacao,
      coachComment,
      green: greenAI
    });
  } catch (err) {
    console.error("Erro IA:", err);
    res.status(500).json({ error: "Erro interno IA", details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ IA Tática Palmeiras v12.0 rodando na porta ${PORT}`));

