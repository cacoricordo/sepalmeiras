// ===== ⚽ Tactical AI 11.3 - SE Palmeiras =====
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

// === Servidor HTTP e WebSocket ===
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

// === SOCKET.IO HANDLERS ===
io.on("connection", (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.id}`);

  // Movimento dos jogadores
  socket.on("player-move", (data) => {
    if (data && data.id) socket.broadcast.emit("player-move", data);
  });

  // Movimento da bola
  socket.on("ball-move", (data) => {
    if (data && data.id) socket.broadcast.emit("ball-move", data);
  });

  // Desenhos táticos (Pen Mode Pro Sync)
  socket.on("path_draw", (data) => {
    if (data && Array.isArray(data.path) && data.path.length > 1) {
      console.log(`✏️  Traço recebido de ${socket.id} (${data.path.length} pontos)`);
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
const CENTER_X = FIELD_WIDTH / 2;

// === Detecta formação ===
function detectFormationAdvanced(players) {
  if (!players || players.length < 8) return "4-3-3";
  const spreadX = Math.max(...players.map(p => p.left)) - Math.min(...players.map(p => p.left));
  const RADIUS = spreadX < 250 ? 50 : 100;
  const clusters = [];

  function findCluster(px, py) {
    for (const c of clusters) {
      const dx = px - c.centerX;
      const dy = py - c.centerY;
      if (Math.sqrt(dx * dx + dy * dy) < RADIUS) return c;
    }
    return null;
  }

  for (const p of players) {
    const c = findCluster(p.left, p.top);
    if (c) {
      c.players.push(p);
      c.centerX = (c.centerX * (c.players.length - 1) + p.left) / c.players.length;
      c.centerY = (c.centerY * (c.players.length - 1) + p.top) / c.players.length;
    } else {
      clusters.push({ players: [p], centerX: p.left, centerY: p.top });
    }
  }

  clusters.sort((a, b) => a.centerX - b.centerX);
  const counts = clusters.map(c => c.players.length);
  const signature = counts.join("-");

  if (signature.includes("1-1-8")) return "1-1-8";
  if (signature.includes("W.M")) return "W.M";
  if (signature.includes("4-2-4")) return "4-2-4";
  if (signature.includes("4-2-3-1")) return "4-2-3-1";
  if (signature.includes("4-4-2")) return "4-4-2";
  if (signature.includes("3-5-2")) return "3-5-2";
  if (signature.includes("3-4-3")) return "3-4-3";
  if (signature.includes("4-3-3")) return "4-3-3";

  if (clusters.length <= 3) return "3-5-2";
  if (clusters.length === 4) return "4-4-2";
  if (clusters.length >= 5) return "4-3-3";
  return "4-4-2";
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
  "3-5-2": [
    { id:13, zone:[70,100] }, { id:14, zone:[70,150] }, { id:15, zone:[70,200] },
    { id:16, zone:[130,60] }, { id:17, zone:[130,240] },
    { id:18, zone:[180,100] }, { id:19, zone:[180,150] }, { id:20, zone:[180,200] },
    { id:21, zone:[320,120] }, { id:22, zone:[320,180] }
  ],
  "4-2-3-1": [
    { id:13, zone:[70,80] }, { id:14, zone:[70,220] },
    { id:15, zone:[100,130] }, { id:16, zone:[100,170] },
    { id:17, zone:[170,110] }, { id:18, zone:[170,190] },
    { id:19, zone:[230,80] }, { id:20, zone:[230,150] }, { id:21, zone:[230,220] },
    { id:22, zone:[320,150] }
  ],
  "1-1-8": [
    { id:13, zone:[40,150] }, { id:14, zone:[90,150] },
    { id:15, zone:[160,40] }, { id:16, zone:[160,90] }, { id:17, zone:[160,140] },
    { id:18, zone:[160,190] }, { id:19, zone:[220,60] }, { id:20, zone:[220,120] },
    { id:21, zone:[220,180] }, { id:22, zone:[220,240] }
  ],
  "W.M": [
    { id:13, zone:[70,80] }, { id:14, zone:[70,150] }, { id:15, zone:[70,220] },
    { id:16, zone:[130,100] }, { id:17, zone:[130,200] },
    { id:18, zone:[200,120] }, { id:19, zone:[200,180] },
    { id:20, zone:[300,80] }, { id:21, zone:[310,150] }, { id:22, zone:[300,220] }
  ],
  "4-2-4": [
    { id:13, zone:[70,80] }, { id:14, zone:[70,220] },
    { id:15, zone:[100,130] }, { id:16, zone:[100,170] },
    { id:17, zone:[180,120] }, { id:18, zone:[180,180] },
    { id:19, zone:[280,60] }, { id:20, zone:[280,120] },
    { id:21, zone:[280,180] }, { id:22, zone:[280,240] }
  ]
};

// === Gera time vermelho com offset tático ===
function buildRedFromFormation(formationKey, ball, phase = 'defesa') {
  const formation = FORMATIONS[formationKey] || FORMATIONS["4-3-3"];
  const red = [];

  let offsetX = 0;
  switch (formationKey) {
    case "1-1-8": offsetX = 160; break;
    case "4-2-4": offsetX = 100; break;
    case "W.M": offsetX = 60; break;
    case "3-5-2": offsetX = 30; break;
  }

  for (const pos of formation) {
    const jitter = Math.random() * 8 - 4;
    let baseX;

    if (phase === "ataque") {
      // Palmeiras em posse → adversário recua (defende à direita)
      baseX = FIELD_WIDTH - pos.zone[0] - offsetX;
    } else {
      // Palmeiras sem posse → adversário avança (ataca da esquerda)
      baseX = pos.zone[0] + offsetX;
    }

    baseX = Math.max(20, Math.min(FIELD_WIDTH - 20, baseX));
    red.push({ id: pos.id, left: baseX, top: pos.zone[1] + jitter });
  }

  const gkTop = ball && typeof ball.top === "number"
    ? FIELD_HEIGHT / 2 + (ball.top - FIELD_HEIGHT / 2) * 0.3
    : FIELD_HEIGHT / 2;

  // Goleiro fixo no gol da direita
  red.unshift({ id: 23, left: FIELD_WIDTH - 10, top: gkTop });

  return { red };
}

// === Endpoint /ai/analyze ===
app.post("/ai/analyze", async (req, res) => {
  try {
    // corrige spelling e pega possession
    const { green = [], black = [], ball = {}, possession = 'preto' } = req.body;
    const players = (black && black.length) ? black : green;
    if (!players.length) return res.status(400).json({ error: "Nenhum jogador recebido" });

// === Determine fase tática ===
// Palmeiras joga com defesa à direita, ataque à esquerda
// Se Palmeiras (verde) tem a posse → ataque
// Caso contrário → defesa
const phase = possession === 'verde' ? 'ataque' : 'defesa';
const detectedFormation = detectFormationAdvanced(players);
const { red } = buildRedFromFormation(detectedFormation, ball, phase);


    // spread / bloco / compactacao
    const spreadX = Math.max(...players.map(p => p.left)) - Math.min(...players.map(p => p.left));
    const spreadY = Math.max(...players.map(p => p.top)) - Math.min(...players.map(p => p.top));
    const bloco = spreadX < 250 ? "baixo" : spreadX < 350 ? "médio" : "alto";
    const compactacao = spreadY < 160 ? "curta" : spreadY < 250 ? "média" : "larga";

    let coachComment = `O adversário joga num ${detectedFormation}, bloco ${bloco}, compactação ${compactacao}.`;

    if (process.env.OPENROUTER_KEY) {
      try {
        const prompt = `
O adversário está em bloco ${bloco} com compactação ${compactacao}.
A bola está em posse do time ${possession === 'verde' ? 'verdes (Palmeiras)' : 'preto (adversário)'}.
Se o Palmeiras tem a posse, descreve como o Abel faria o time adversário (time preto) reagir defensivamente.
Se o Palmeiras não tem a posse, descreve ajustes ofensivos para aproveitar espaço.
Devolve um comentário tático curto.
        `;

        // chama OpenRouter (mantém sua implementação)
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
                content: `Tu és Abel Ferreira, treinador do Palmeiras. Analisa formações e faz recomendações táticas.`
              },
              { role: "user", content: prompt }
            ],
            max_tokens: 180,
            temperature: 0.8
          })
        });

        const data = await response.json();
        coachComment = data?.choices?.[0]?.message?.content || coachComment;
      } catch (err) {
        console.error("Erro ao chamar OpenAI:", err);
      }
    }

    res.json({ detectedFormation, red, coachComment });
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
          { role: "system", content: "Tu és Abel Ferreira, treinador do Palmeiras. Fala em português de Portugal com intensidade e clareza." },
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
httpServer.listen(PORT, () => console.log(`🚀 AI TÁTICA 11.3 rodando na porta ${PORT}`));

