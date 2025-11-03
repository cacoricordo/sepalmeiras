// ===== ⚽ Tactical AI v11.7 - SE Palmeiras =====
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

// === WebSocket sync ===
io.on("connection", (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.id}`);

  socket.on("player-move", (data) => {
    if (data && data.id) socket.broadcast.emit("player-move", data);
  });

  socket.on("ball-move", (data) => {
    if (data && data.id) socket.broadcast.emit("ball-move", data);
  });

  socket.on("path_draw", (data) => {
    if (data && Array.isArray(data.path) && data.path.length > 1) {
      socket.broadcast.emit("path_draw", data);
    }
  });

  socket.on("disconnect", () => {
    console.log(`❌ Cliente saiu: ${socket.id}`);
  });
});

// === Servir frontend ===
app.use(express.static(__dirname));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.use(cors());
app.use(bodyParser.json());

// === Constantes ===
const FIELD_WIDTH = 600;
const FIELD_HEIGHT = 300;

// === Detecta fase tática simples ===
function detectTacticalPhase(players, ball, possession) {
  if (!players?.length || !ball) return "meio-campo";

  const avgX = players.reduce((a, p) => a + p.left, 0) / players.length;
  const spreadX = Math.max(...players.map(p => p.left)) - Math.min(...players.map(p => p.left));

  if (possession === "verde") {
    if (avgX < 200 && spreadX > 300) return "ataque-intenso";
    if (avgX < 300) return "construção";
    return "transição";
  } else {
    if (avgX > 400 && spreadX < 250) return "bloco-baixo";
    if (avgX > 320) return "bloco-médio";
    return "reação-defensiva";
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
  ]
};

// === Escolhe formação FIFA conforme fase ===
function pickFormationByPhase(tacticalPhase) {
  switch (tacticalPhase) {
    case "ataque-intenso": return "4-2-4";
    case "construção": return "4-3-3";
    case "transição": return "4-2-3-1";
    case "bloco-baixo": return "5-4-1";
    case "bloco-médio": return "4-5-1";
    case "reação-defensiva": return "4-4-2";
    default: return "4-3-3";
  }
}

// === IA controla o time verde/red (Palmeiras) ===
function buildGreenFromFormation(formationKey, ball, phase = 'defesa') {
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
    const jitter = Math.random() * 8 - 4;
    let baseX;

    if (phase === "ataque") {
      // Palmeiras em posse → avança para o ataque (direita → esquerda)
      baseX = pos.zone[0] + offsetX;
    } else {
      // Palmeiras sem posse → recua (defende à direita)
      baseX = FIELD_WIDTH - pos.zone[0] - offsetX;
    }

    baseX = Math.max(20, Math.min(FIELD_WIDTH - 20, baseX));
    greenAI.push({ id: pos.id, left: baseX, top: pos.zone[1] + jitter });
  }

  // Goleiro fixo no gol da direita
  const gkTop = ball && typeof ball.top === "number"
    ? FIELD_HEIGHT / 2 + (ball.top - FIELD_HEIGHT / 2) * 0.3
    : FIELD_HEIGHT / 2;
  greenAI.unshift({ id: 1, left: FIELD_WIDTH - 10, top: gkTop });

  return { greenAI };
}

// === Endpoint principal: /ai/analyze ===
app.post("/ai/analyze", async (req, res) => {
  try {
    const { green = [], black = [], ball = {}, possession = "preto" } = req.body;
    const players = green; // Palmeiras é o foco da IA

    // Palmeiras defende à direita e ataca à esquerda
    const phase = possession === "verde" ? "ataque" : "defesa";
    const tacticalPhase = detectTacticalPhase(players, ball, possession);
    const detectedFormation = pickFormationByPhase(tacticalPhase);
    const { greenAI } = buildGreenFromFormation(detectedFormation, ball, phase);

    const spreadX = Math.max(...players.map(p => p.left)) - Math.min(...players.map(p => p.left));
    const spreadY = Math.max(...players.map(p => p.top)) - Math.min(...players.map(p => p.top));
    const bloco = spreadX < 250 ? "baixo" : spreadX < 350 ? "médio" : "alto";
    const compactacao = spreadY < 160 ? "curta" : spreadY < 250 ? "média" : "larga";

    let coachComment = `O Palmeiras joga num ${detectedFormation}, fase ${tacticalPhase}.`;

    if (process.env.OPENROUTER_KEY) {
      try {
        const prompt = `
O Palmeiras defende à direita e ataca à esquerda.
Está na fase ${tacticalPhase}, jogando num ${detectedFormation}.
Bloco ${bloco}, compactação ${compactacao}.
A bola está com o time ${possession === "verde" ? "do Palmeiras" : "adversário"}.
Fala como Abel Ferreira, descrevendo o comportamento tático do Palmeiras nesta fase em 3 linhas curtas.
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
                content: `Tu és Abel Ferreira, treinador do Palmeiras. Fala como treinador, com análise tática objetiva.`
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

    res.json({ detectedFormation, green: greenAI, coachComment });
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
httpServer.listen(PORT, () => console.log(`🚀 AI TÁTICA v11.7 (Palmeiras) rodando na porta ${PORT}`));

