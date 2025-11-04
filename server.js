// server.js — AI Tática v12.1.2 (Render + Realtime WebSocket)
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: [
      "https://www.osinvictos.com.br",
      "https://osinvictos.com.br",
      "https://sepalmeiras.onrender.com",
      "*"
    ],
    methods: ["GET", "POST"]
  }
});

// === Configuração de diretórios ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === Middleware ===
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// === Serve o frontend ===
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// === Constantes ===
const FIELD_WIDTH = 600;
const FIELD_HEIGHT = 300;

const FORMATIONS = {
  // =========================
  // 4-4-2
  // =========================
  "4-4-2": [
    // DEFESA — laterais + zaga (zone.x pequenos → vão para a DIREITA após espelho)
    { id:13, zone:[ 80, 80] }, { id:14, zone:[ 80,220] },  // laterais
    { id:15, zone:[110,130] }, { id:16, zone:[110,170] },  // zagueiros

    // MEIO — 4 em linha
    { id:17, zone:[190, 80] }, { id:18, zone:[190,130] },
    { id:19, zone:[190,170] }, { id:20, zone:[190,220] },

    // ATAQUE — dupla
    { id:21, zone:[280,120] }, { id:22, zone:[280,180] }
  ],

  // =========================
  // 4-3-3
  // =========================
  "4-3-3": [
    // DEFESA
    { id:13, zone:[ 80, 80] }, { id:14, zone:[ 80,220] },
    { id:15, zone:[110,130] }, { id:16, zone:[110,170] },

    // MEIO — 3 por dentro
    { id:17, zone:[200,100] }, { id:18, zone:[200,150] }, { id:19, zone:[200,200] },

    // ATAQUE — pontas + 9
    { id:20, zone:[300, 80] }, { id:21, zone:[300,150] }, { id:22, zone:[300,220] }
  ],

  // =========================
  // 4-2-3-1
  // =========================
  "4-2-3-1": [
    // DEFESA
    { id:13, zone:[ 80, 80] }, { id:14, zone:[ 80,220] },
    { id:15, zone:[110,130] }, { id:16, zone:[110,170] },

    // VOLANTES (dupla)
    { id:17, zone:[210,120] }, { id:18, zone:[210,180] },

    // MEIAS (linha de 3)
    { id:19, zone:[250, 90] }, { id:20, zone:[250,150] }, { id:21, zone:[250,210] },

    // CENTROAVANTE
    { id:22, zone:[310,150] }
  ],

  // =========================
  // 3-5-2
  // =========================
  "3-5-2": [
    // DEFESA — 3 zagueiros
    { id:13, zone:[110,100] }, { id:14, zone:[110,150] }, { id:15, zone:[110,200] },

    // ALAS
    { id:16, zone:[160, 70] }, { id:17, zone:[160,230] },

    // MEIO — 3
    { id:18, zone:[210,110] }, { id:19, zone:[210,150] }, { id:20, zone:[210,190] },

    // ATAQUE — dupla
    { id:21, zone:[300,120] }, { id:22, zone:[300,180] }
  ],

  // =========================
  // 5-4-1
  // =========================
  "5-4-1": [
    // DEFESA — linha de 5
    { id:13, zone:[ 70, 90] }, { id:14, zone:[ 70,210] },
    { id:15, zone:[100,130] }, { id:16, zone:[100,170] }, { id:17, zone:[ 85,150] },

    // MEIO — 4
    { id:18, zone:[190,100] }, { id:19, zone:[190,200] },
    { id:20, zone:[210,130] }, { id:21, zone:[210,170] },

    // 9 isolado
    { id:22, zone:[300,150] }
  ],

  // =========================
  // 5-3-2
  // =========================
  "5-3-2": [
    // DEFESA — 5
    { id:13, zone:[ 70, 90] }, { id:14, zone:[ 70,210] },
    { id:15, zone:[100,150] },
    { id:16, zone:[ 85,110] }, { id:17, zone:[ 85,190] },

    // MEIO — 3
    { id:18, zone:[210,120] }, { id:19, zone:[210,180] }, { id:20, zone:[210,150] },

    // ATAQUE — dupla
    { id:21, zone:[300,120] }, { id:22, zone:[300,180] }
  ]
};


// === IA: Detector geométrico FIFA 2D ===
function detectOpponentFormationAdvanced(players) {
  if (!players || players.length < 8) return "4-2";

  const sortedByX = [...players].sort((a,b) => a.left - b.left);
  const noGK = sortedByX.slice(1); // drop leftmost

 const sorted = [...noGK].sort((a, b) => a.top - b.top);
  const lines = [];
  for (const p of sorted) {
    let line = lines.find(l => Math.abs(l.centerY - p.top) <= 50); // tolerância ligeiramente maior
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

  // Mapeia assinaturas comuns (sem GK)
  if (["4-4-2","4-3-3","4-2-3-1","5-4-1","5-3-2","3-5-2"].includes(signature)) return signature;

  // Fallback por terços (sem GK) — menos enviesado
  const FIELD_THIRD = 600 / 3; // mantém coerente com seu FIELD_WIDTH
  const def = noGK.filter(p => p.left < FIELD_THIRD).length;
  const mid = noGK.filter(p => p.left >= FIELD_THIRD && p.left < FIELD_THIRD * 2).length;
  const att = noGK.filter(p => p.left >= FIELD_THIRD * 2).length;
  const shape = `${def}-${mid}-${att}`;

  if (def >= 5 && att <= 1) return "5-4-1";
  if (def === 4 && mid === 4 && att === 2) return "4-4-2";
  if (def === 4 && mid === 3 && att === 3) return "4-3-3";
  if (def === 4 && mid === 2 && att === 4) return "4-2-4";
  if (def === 3 && mid === 5 && att === 2) return "3-5-2";

  // Último fallback neutro (melhor que fixar 4-4-2)
  return "4-2-3-1";
}

// === Fase / Bloco / Compactação ===
function detectPhase(possession, opponentFormation) {
  if (possession === "verde") return { phase: "Ataque", bloco: "Alto", compactacao: "Larga" };
  if (["5-4-1", "4-5-1"].includes(opponentFormation)) return { phase: "Defesa", bloco: "Baixo", compactacao: "Curta" };
  if (["4-4-2", "4-3-3"].includes(opponentFormation)) return { phase: "Transição", bloco: "Médio", compactacao: "Média" };
  return { phase: "Defesa", bloco: "Baixo", compactacao: "Curta" };
}

// === Contra-formação ===
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

// === Monta o Palmeiras (direita → esquerda) ===
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

    greenAI.push({
      id: 23,
      left: FIELD_WIDTH - 15,     // fixo no gol direito
      top: FIELD_HEIGHT / 2       // apenas desce/sobe pela IA Vision
    });

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

// === Endpoint IA ===
app.post("/ai/analyze", async (req, res) => {
  try {
    const { green = [], black = [], ball = {}, possession = "preto" } = req.body;
    const opponentFormation = (req.body.opponentFormationVision && req.body.opponentFormationVision !== "null")
    ? req.body.opponentFormationVision
    : detectOpponentFormationAdvanced(black);
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

// === IA VISUAL + AÇÃO TÁTICA REAL ===
app.post("/ai/vision-tactic", async (req, res) => {
  try {
    const { fieldImage, possession, ball } = req.body;
    const apiKey = process.env.OPENROUTER_KEY;

    if (!apiKey) return res.status(500).json({ error: "OPENROUTER_KEY ausente" });

    console.log("📸 Imagem recebida, enviando para análise Vision...");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "qwen/qwen2.5-vl-32b-instruct",
        messages: [
          {
            role: "system",
            content: `
              Você é um analista tático especialista em Palmeiras.
              Interprete a imagem como futebol real.
              Retorne EXATAMENTE neste JSON:

              {
                "formation_opponent": "4-4-2",
                "formation_palmeiras": "4-3-3",
                "phase": "ataque" | "defesa" | "transicao",
                "comment": "texto curto"
              }

              Não use markdown. Apenas JSON puro.
            `
          },
          {
            role: "user",
            content: [
              { type: "text", text: `A posse é do time ${possession}. Aqui está a imagem:` },
              { type: "input_image", image_data: fieldImage }
            ]
          }
        ]
      })
    });

    const data = await response.json();
    console.log("📦 Resposta Vision:", JSON.stringify(data, null, 2));

    let parsed;
    try {
      parsed = JSON.parse(data?.choices?.[0]?.message?.content);
    } catch {
      return res.json({ error: "Visão não retornou JSON estruturado." });
    }

    console.log("🧠 Visão interpretou:", parsed);

    // 🔥 MOVE O PALMEIRAS AUTOMATICAMENTE
    const { formation_palmeiras, phase } = parsed;
    const { greenAI } = buildGreenFromFormation(
      formation_palmeiras ?? "4-3-3",
      ball,
      phase === "ataque" ? "ataque" : "defesa"
    );

return res.json({
  opponentFormation: parsed.formation_opponent || null,
  detectedFormation: formation_palmeiras || null,
  phase: parsed.phase || null,
  green: greenAI,
  coachComment: parsed.comment || ""
});

  } catch (err) {
    console.error("❌ Erro /ai/vision-tactic:", err);
    res.status(500).json({ error: "Falha na análise visual", details: err.message });
  }
});



// === Socket.IO realtime ===
io.on("connection", (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.id}`);

  socket.on("player-move", (data) => socket.broadcast.emit("player-move", data));
  socket.on("ball-move", (data) => socket.broadcast.emit("ball-move", data));
  socket.on("path_draw", (data) => socket.broadcast.emit("path_draw", data));

  socket.on("disconnect", () => console.log(`❌ Cliente saiu: ${socket.id}`));
});

// === Endpoint de chat do Abel (usando OpenRouter) ===
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;
    const apiKey = process.env.OPENROUTER_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "OPENROUTER_KEY ausente no servidor" });
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Tu és Abel Ferreira, treinador do Palmeiras. Fala com intensidade, energia e análise tática avançada." },
          { role: "user", content: message }
        ],
        temperature: 0.8,
        max_tokens: 180
      })
    });

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content || "O Abel ficou em silêncio...";
    res.json({ reply });

  } catch (err) {
    console.error("Erro no /api/chat:", err);
    res.status(500).json({ error: "Falha na comunicação com o Abel", details: err.message });
  }
});


// === Inicializa Render ===
const PORT = process.env.PORT || 10000;
httpServer.listen(PORT, () => console.log(`✅ AI TÁTICA v12.1.2 + Realtime rodando na porta ${PORT}`));
