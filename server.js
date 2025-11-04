// server.js — AI Tática v12.1.1 (Render Ready)
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();

// === Configuração de diretórios ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === Middleware básico ===
app.use(cors());
app.use(bodyParser.json());

// === Servir frontend (index.html + assets) ===
app.use(express.static(__dirname));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// === Constantes de campo ===
const FIELD_WIDTH = 600;
const FIELD_HEIGHT = 300;

// === Banco de formações base ===
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

// === Detector geométrico FIFA 2D ===
function detectOpponentFormationAdvanced(players) {
  if (!players || players.length < 8) return "4-4-2";

  // Ordena por Y
  const sorted = [...players].sort((a, b) => a.top - b.top);
  const lines = [];

  // Agrupa por Y (≤ 60px de diferença)
  for (const p of sorted) {
    let line = lines.find(l => Math.abs(l.centerY - p.top) <= 60);
    if (line) {
      line.players.push(p);
      line.centerY = (line.centerY * (line.players.length - 1) + p.top) / line.players.length;
    } else {
      lines.push({ players: [p], centerY: p.top });
    }
  }

  lines.sort((a, b) => a.centerY - b.centerY);
  const counts = lines.map(l => l.players.length);
  const signature = counts.join("-");

  if (signature.startsWith("4-3-3")) return "4-3-3";
  if (signature.startsWith("4-4-2")) return "4-4-2";
  if (signature.startsWith("3-5-2")) return "3-5-2";
  if (signature.startsWith("5-4-1")) return "5-4-1";
  if (signature.startsWith("4-2-3-1")) return "4-2-3-1";
  if (signature.startsWith("5-3-2")) return "5-3-2";
  if (signature.startsWith("4-5-1")) return "4-5-1";
  if (signature.startsWith("3-4-3")) return "3-4-3";

  const FIELD_THIRD = FIELD_WIDTH / 3;
  const def = players.filter(p => p.left < FIELD_THIRD);
  const mid = players.filter(p => p.left >= FIELD_THIRD && p.left < FIELD_THIRD * 2);
  const att = players.filter(p => p.left >= FIELD_THIRD * 2);
  const shape = `${def.length}-${mid.length}-${att.length}`;
  return shape === "4-3-3" || shape === "4-4-2" ? shape : "4-4-2";
}

// === Define contra-formação ===
function chooseCounterFormation(opponentFormation, possession) {
  if (possession === "verde") {
    switch (opponentFormation) {
      case "5-4-1": case "5-3-2": return "4-2-3-1";
      case "4-4-2": return "4-3-3";
      case "3-5-2": return "4-2-3-1";
      case "3-4-3": return "4-2-4";
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

// === Fase, bloco, compactação ===
function detectPhase(possession, opponentFormation) {
  if (possession === "verde") return { phase: "Ataque", bloco: "Alto", compactacao: "Larga" };
  if (["5-4-1", "4-5-1"].includes(opponentFormation)) return { phase: "Defesa", bloco: "Baixo", compactacao: "Curta" };
  if (["4-4-2", "4-3-3"].includes(opponentFormation)) return { phase: "Transição", bloco: "Médio", compactacao: "Média" };
  return { phase: "Defesa", bloco: "Baixo", compactacao: "Curta" };
}

// === Palmeiras joga da DIREITA → ESQUERDA ===
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
    const jitter = Math.random() * 4 - 2;
    let baseX = phase === "ataque"
      ? FIELD_WIDTH - pos.zone[0] - offsetX
      : FIELD_WIDTH - pos.zone[0] + offsetX;
    baseX = Math.max(20, Math.min(FIELD_WIDTH - 20, baseX));
    greenAI.push({ id: pos.id, left: baseX, top: pos.zone[1] + jitter });
  }

  greenAI.push({ id: 23, left: FIELD_WIDTH - 10, top: FIELD_HEIGHT / 2 });
  return { greenAI };
}

// === Fala do Abel ===
let lastFormation = "";
let lastPhase = "";
function abelSpeech(opponentFormation, detectedFormation, phase, bloco, compactacao) {
  const intro = ["Repara comigo:", "É claro o que está acontecendo:", "Eles mudaram o jogo:", "A gente sabe como reagir:"];
  const corpo = [`Eles estão num ${opponentFormation}, e nós estamos num ${detectedFormation}.`, `Adaptamos pro ${detectedFormation} contra o ${opponentFormation}.`];
  const contexto = [`Fase ${phase.toLowerCase()}, bloco ${bloco.toLowerCase()}, compactação ${compactacao.toLowerCase()}.`];
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  return `${pick(intro)} ${pick(corpo)} ${pick(contexto)}`;
}

// === Rota principal ===
app.post("/ai/analyze", async (req, res) => {
  try {
    const { green = [], black = [], ball = {}, possession = "preto" } = req.body;
    const opponentFormation = detectOpponentFormationAdvanced(black);
    const detectedFormation = chooseCounterFormation(opponentFormation, possession);
    const { greenAI } = buildGreenFromFormation(detectedFormation, ball, possession === "verde" ? "ataque" : "defesa");
    const { phase, bloco, compactacao } = detectPhase(possession, opponentFormation);

    let coachComment = "";
    if (opponentFormation !== lastFormation || phase !== lastPhase) {
      coachComment = abelSpeech(opponentFormation, detectedFormation, phase, bloco, compactacao);
      lastFormation = opponentFormation;
      lastPhase = phase;
    }

    res.json({ opponentFormation, detectedFormation, phase, bloco, compactacao, coachComment, green: greenAI });
  } catch (err) {
    console.error("Erro /ai/analyze", err);
    res.status(500).json({ error: "Erro interno IA", details: err.message });
  }
});

// === Inicializa ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ AI TÁTICA v12.1.1 rodando na porta ${PORT}`));

