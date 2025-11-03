// ===== ⚽ Tactical AI v11.8 - Palmeiras contra o adversário =====
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import path from "path";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === Servidor HTTP + WebSocket ===
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: [
      "https://www.osinvictos.com.br",
      "https://osinvictos.com.br"
    ],
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.id}`);
  socket.on("player-move", (data) => { if (data?.id) socket.broadcast.emit("player-move", data); });
  socket.on("ball-move", (data) => { if (data?.id) socket.broadcast.emit("ball-move", data); });
  socket.on("path_draw", (data) => {
    if (data?.path?.length > 1) socket.broadcast.emit("path_draw", data);
  });
  socket.on("disconnect", () => console.log(`❌ Cliente saiu: ${socket.id}`));
});

// === Servir frontend ===
app.use(express.static(__dirname));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.use(cors());
app.use(bodyParser.json());

// === Constantes ===
const FIELD_WIDTH = 600;
const FIELD_HEIGHT = 300;

function detectOpponentFormationAdvanced(black) {
  if (!black || black.length < 8) return "4-4-2";

  // Ordena por posição X (esquerda → direita)
  const sorted = [...black].sort((a, b) => a.left - b.left);
  const FIELD_THIRD = FIELD_WIDTH / 3;

  // === 1️⃣ Divide em setores (defesa, meio, ataque) ===
  const defense = sorted.filter(p => p.left < FIELD_THIRD);
  const midfield = sorted.filter(p => p.left >= FIELD_THIRD && p.left < FIELD_THIRD * 2);
  const attack = sorted.filter(p => p.left >= FIELD_THIRD * 2);

  // === 2️⃣ Calcula profundidade média em relação ao goleiro adversário ===
  const avgX = (arr) => arr.reduce((a, p) => a + p.left, 0) / arr.length;
  const defAvg = avgX(defense);
  const midAvg = avgX(midfield);
  const attAvg = avgX(attack);

  // Se os meias (10,3,4,8) estão muito recuados (~150–200px do gol adversário)
  // então eles compõem momentaneamente uma linha de 4 defensores.
  if (midAvg < 200 && defense.length >= 3 && midfield.length >= 3) {
    // Fundir defesa + meio = nova linha de 4 ou 5
    return defense.length + midfield.length >= 5 ? "5-4-1" : "4-5-1";
  }

  // === 3️⃣ Continua com a leitura padrão ===
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




// === Escolhe formação do Palmeiras para neutralizar o adversário ===
function chooseCounterFormation(opponentFormation, possession) {
  // Palmeiras tem posse — busca superioridade ofensiva
  if (possession === "verde") {
    switch (opponentFormation) {
      case "5-3-2":
      case "5-4-1": return "4-2-3-1"; // paciência + amplitude
      case "4-4-2": return "4-3-3";   // quebra linha de 4
      case "3-4-3": return "4-2-4";   // largura máxima
      case "3-5-2": return "4-2-3-1"; // infiltra pelo meio
      default: return "4-3-3";
    }
  }

  // Adversário tem posse — Palmeiras se protege
  switch (opponentFormation) {
    case "4-3-3": return "4-5-1";     // congestiona meio
    case "4-2-3-1": return "4-4-2";   // dupla de pressão alta
    case "3-5-2": return "5-4-1";     // linha de 5
    case "3-4-3": return "5-3-2";     // espelhamento defensivo
    default: return "4-4-2";
  }
}

// === Formações base ===
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

// === Gera o time do Palmeiras ===
// === Palmeiras (verde/red) joga da DIREITA → ESQUERDA ===
// === Palmeiras (verde/red) joga da DIREITA → ESQUERDA ===
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

  // Gera jogadores de linha (13 a 22)
  for (const pos of formation) {
    const jitter = Math.random() * 6 - 3;
    let baseX;

    if (phase === "ataque") {
      // Palmeiras avança da direita para a esquerda
      baseX = FIELD_WIDTH - pos.zone[0] - offsetX;
    } else {
      // Palmeiras recua (defende à direita)
      baseX = FIELD_WIDTH - pos.zone[0] + offsetX;
    }

    baseX = Math.max(20, Math.min(FIELD_WIDTH - 20, baseX));
    greenAI.push({ id: pos.id, left: baseX, top: pos.zone[1] + jitter });
  }

  // Goleiro 23 fixo no gol da direita (não se move com a bola)
  const gkTop = FIELD_HEIGHT / 2;
  greenAI.push({ id: 23, left: FIELD_WIDTH - 10, top: gkTop });

  return { greenAI };
}

// === Endpoint principal /ai/analyze ===
app.post("/ai/analyze", async (req, res) => {
  try {
    const { green = [], black = [], ball = {}, possession = "preto" } = req.body;

    const opponentFormation = detectOpponentFormationAdvanced(black);
    const detectedFormation = chooseCounterFormation(opponentFormation, possession);
    const { greenAI } = buildGreenFromFormation(detectedFormation, ball, possession === "verde" ? "ataque" : "defesa");

    let coachComment = `Adversário em ${opponentFormation}. Palmeiras responde em ${detectedFormation}.`;

    if (process.env.OPENROUTER_KEY) {
      try {
        const prompt = `
O adversário está num ${opponentFormation}.
O Palmeiras responde em ${detectedFormation}.
A bola está com o time ${possession === "verde" ? "do Palmeiras" : "adversário"}.
Fala como Abel Ferreira sobre como o Palmeiras se organiza taticamente para neutralizar o adversário.
`;

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENROUTER_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "Tu és Abel Ferreira, treinador do Palmeiras. Fala em português de Portugal, com intensidade e precisão tática."
              },
              { role: "user", content: prompt }
            ],
            max_tokens: 200,
            temperature: 0.8
          })
        });

        const data = await response.json();
        coachComment = data?.choices?.[0]?.message?.content || coachComment;
      } catch (err) {
        console.error("Erro ao chamar OpenRouter:", err);
      }
    }

    res.json({ opponentFormation, detectedFormation, green: greenAI, coachComment });
  } catch (err) {
    console.error("Erro /ai/analyze", err);
    res.status(500).json({ error: "Erro interno na análise" });
  }
});

// === Chat do Abel Ferreira ===
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;
    const apiKey = process.env.OPENROUTER_KEY;
    if (!apiKey) return res.status(500).json({ error: "OPENROUTER_KEY ausente" });

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Tu és Abel Ferreira, treinador do Palmeiras. Fala com intensidade e clareza tática." },
          { role: "user", content: message }
        ],
        max_tokens: 180,
        temperature: 0.8
      })
    });

    const data = await response.json();
    res.json({ reply: data?.choices?.[0]?.message?.content || "O Abel ficou em silêncio..." });
  } catch (err) {
    console.error("Chat Error", err);
    res.status(500).json({ error: "Falha na conversa" });
  }
});

// === Inicialização ===
const PORT = process.env.PORT || 10000;
httpServer.listen(PORT, () => console.log(`🚀 AI TÁTICA v11.8 rodando na porta ${PORT}`));

