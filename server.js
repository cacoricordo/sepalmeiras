// ===== ⚽ Tactical AI 4.2.2-FIX =====
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";

dotenv.config();

// === Configura servidor HTTP e WebSocket ===
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

io.on("connection", (socket) => {
  console.log("🔌 Novo cliente conectado");

  // 🟢 Quando um jogador for movido (drag)
  socket.on("player-move", (data) => {
    // retransmite para todos os outros clientes (menos quem enviou)
    socket.broadcast.emit("player-move", data);
  });

  // ⚽ Quando a bola for movida
  socket.on("ball-move", (data) => {
    socket.broadcast.emit("ball-move", data);
  });

  socket.on("disconnect", () => console.log("❌ Cliente desconectado"));
});

// === Suporte a caminhos absolutos (necessário para Render e ES Modules) ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === Servir o frontend estático (index.html + assets) ===
app.use(express.static(__dirname));

// === Rota padrão: abre o index.html ===
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});


app.use(cors());
app.use(bodyParser.json());

// === Constantes do campo ===
const FIELD_WIDTH = 600;
const FIELD_HEIGHT = 300;
const CENTER_X = FIELD_WIDTH / 2;

// === Função de detecção de formação (simplificada) ===
function detectFormationAdvanced(players) {
  if (!players || players.length < 8) return "4-3-3";

  const RADIUS = 100;
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

  if (signature.startsWith("4-4-2")) return "4-4-2";
  if (signature.startsWith("3-5-2")) return "3-5-2";
  if (signature.startsWith("4-2-3-1")) return "4-2-3-1";
  if (signature.startsWith("3-4-3")) return "3-4-3";
  if (signature.startsWith("4-3-3")) return "4-3-3";

  return "4-4-2";
}

// === Formações base ===
const FORMATIONS = {
  "4-4-2": [
    { id:13, zone:[70, 80] }, { id:14, zone:[70, 220] },
    { id:15, zone:[100, 130] }, { id:16, zone:[100, 170] },
    { id:17, zone:[200, 80] }, { id:18, zone:[200, 130] },
    { id:19, zone:[200, 170] }, { id:20, zone:[200, 220] },
    { id:21, zone:[320, 120] }, { id:22, zone:[320, 180] }
  ],
  "4-3-3": [
    { id:13, zone:[80,80] }, { id:14, zone:[80,220] },
    { id:15, zone:[100,130] }, { id:16, zone:[100,170] },
    { id:17, zone:[210,100] }, { id:18, zone:[210,150] }, { id:19, zone:[210,200] },
    { id:20, zone:[320,80] }, { id:21, zone:[330,150] }, { id:22, zone:[320,220] }
  ]
};

// === Gera o time vermelho ===
function buildRedFromFormation(formationKey, ball) {
  const formation = FORMATIONS[formationKey] || FORMATIONS["4-3-3"];
  const red = [];

  for (const pos of formation) {
    const jitter = Math.random() * 8 - 4;
    red.push({
      id: pos.id,
      left: FIELD_WIDTH - pos.zone[0],
      top: pos.zone[1] + jitter
    });
  }

  // Goleiro acompanha 30% do movimento vertical da bola
  const gkTop = ball && typeof ball.top === "number"
    ? FIELD_HEIGHT / 2 + (ball.top - FIELD_HEIGHT / 2) * 0.3
    : FIELD_HEIGHT / 2;

  red.unshift({
    id: 23,
    left: FIELD_WIDTH - 10,
    top: gkTop
  });

  return { red };
}

// === Endpoint principal ===
app.post("/ai/analyze", async (req, res) => {
  try {
    const { green = [], black = [], ball = {} } = req.body;
    console.log("[AI ANALYZE] Recebi:", { greenCount: green.length, blackCount: black.length, ball });

    const detectedFormation = detectFormationAdvanced(black.length ? black : green);
    const { red } = buildRedFromFormation(detectedFormation, ball);

    // === Fase simples ===
    let phase = "neutro";
    if (ball.left > CENTER_X && black.some(p => p.left > CENTER_X - 50)) phase = "defesa";
    else if (ball.left < CENTER_X && green.some(p => p.left < CENTER_X - 50)) phase = "ataque";
    else if (black.every(p => p.left < CENTER_X - 50)) phase = "avançado";

// === Abel Ferreira, treinador do Palmeiras ===
let coachComment = `O adversário joga em ${detectedFormation}, e nós estamos na fase ${phase}.`;

const apiKey = process.env.OPENROUTER_KEY;
if (apiKey) {
  try {
    const prompt = `
    O time adversário joga num ${detectedFormation} e está na fase ${phase}.
    Comenta a situação como Abel Ferreira, treinador da Sociedade Esportiva Palmeiras — fala em português de Portugal, com intensidade, clareza e mentalidade competitiva.
    Analisa o jogo com foco em disciplina, equilíbrio e mentalidade vencedora.
    `;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { 
            role: "system", 
            content: `
            Tu és Abel Ferreira, treinador da Sociedade Esportiva Palmeiras.
            Fala em português de Portugal, com intensidade, inteligência e convicção.
            És um técnico moderno, exigente e apaixonado pelo jogo, que valoriza o trabalho, o coletivo e o equilíbrio emocional.

            — A tua personalidade:
              * Líder forte, disciplinado e competitivo.
              * Misturas emoção e racionalidade: és estratega, mas também movido por paixão.
              * Fala com convicção e energia, com o sotaque português característico.
              * Gostas de frases diretas, filosóficas e de impacto.

            — O teu estilo de fala:
              * Direto e sincero, mas com base em raciocínio tático.
              * Usa expressões como:
                - “Isto é futebol, não é PlayStation.”
                - “O jogo é emocional, físico e mental.”
                - “Temos de saber sofrer e competir.”
                - “Aqui, o coletivo é que vence.”
              * Alterna entre tom calmo e firmeza emocional.
              * Sempre fala com propósito, como num discurso de vestiário.

            — Filosofia:
              * Acreditas que o futebol é sobre mentalidade e método.
              * O treino espelha o jogo.
              * Não toleras falta de foco nem individualismo.
              * Valoriza a disciplina, o trabalho e o equilíbrio entre razão e emoção.

            — Exemplo:
            “O futebol é feito de escolhas, e as escolhas definem quem somos.
            Podemos perder, sim — mas nunca perder a atitude, o foco e o compromisso.”

            Responde sempre em português de Portugal, com intensidade, racionalidade e foco no coletivo, como o verdadeiro Abel Ferreira.
            ` 
          },
          { role: "user", content: prompt }
        ],
        max_tokens: 120,
        temperature: 0.8
      })
    });

    const data = await response.json();
    coachComment = data?.choices?.[0]?.message?.content?.trim() || coachComment;
  } catch (err) {
    console.warn('[AI ANALYZE] OpenRouter falhou:', err.message);
  }
}


    // === Envia resultado para o front-end
    res.json({ detectedFormation, phase, red, coachComment });

    // 🔁 Opcional: envia pelo WebSocket também
    io.emit("tactical-analysis", { detectedFormation, phase, red, coachComment });

  } catch (err) {
    console.error("[AI ANALYZE ERROR]", err);
    res.status(500).json({ error: "Erro interno na IA" });
  }
});

// === Endpoint de Chat com Abel Ferreira (Palmeiras) ===
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Mensagem ausente." });

    const apiKey = process.env.OPENROUTER_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Chave OPENROUTER_KEY ausente." });
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
          {
            role: "system",
            content: `
            Tu és Abel Ferreira, treinador da Sociedade Esportiva Palmeiras.

            Fala em português de Portugal, com intensidade, inteligência e clareza.  
            És um técnico moderno, exigente e apaixonado pelo jogo, que valoriza o trabalho, o coletivo e o equilíbrio emocional.

            — A tua personalidade:
              * Líder forte, disciplinado e competitivo.
              * Exigente com o grupo, mas sempre justo.
              * Misturas emoção e racionalidade: és estratega, mas também movido por paixão.
              * Falas com convicção, energia e aquele sotaque lusitano característico.
              * Gostas de frases de impacto e metáforas que refletem filosofia e mentalidade.

            — O teu estilo de falar:
              * Direto, sincero e pedagógico.
              * Costumas usar expressões típicas:
                - “Isto é futebol, não é PlayStation.”
                - “Trabalho, dedicação e foco — é assim que se ganha.”
                - “O jogo é emocional, físico e mental.”
                - “Temos de saber sofrer e competir.”
                - “Aqui ninguém joga sozinho, o coletivo é que vence.”
              * Fala como se estivesse numa coletiva ou palestra para o grupo: com energia e propósito.
              * Usa pausas, repete palavras para dar ênfase e transmite autoridade natural.

            — Filosofia:
              * Acreditas na preparação e na disciplina como caminho para a vitória.
              * Não toleras falta de foco ou vaidade individual.
              * Valorizas a mentalidade forte, a leitura do jogo e a intensidade até o último minuto.
              * Dizes que “o treino é o espelho do jogo”.

            — Exemplo:
            “O futebol é feito de escolhas, e as escolhas definem quem somos.  
            Aqui, trabalhamos com seriedade, intensidade e compromisso.  
            Podemos perder jogos, mas nunca perder a atitude.”

            Responde sempre em português de Portugal, com intensidade, convicção e foco na mentalidade competitiva, como o verdadeiro Abel Ferreira.
            `
          },
          { role: "user", content: message }
        ],
        max_tokens: 180,
        temperature: 0.8
      })
    });

    const data = await response.json();
    const reply =
      data?.choices?.[0]?.message?.content?.trim() ||
      "Abel respira fundo, olha para o relvado e diz: 'Calma... o jogo ainda não acabou.'";

    res.json({ reply });

  } catch (err) {
    console.error("[CHAT ERROR]", err);
    res.status(500).json({ error: "Falha na conversa com Abel Ferreira." });
  }
});


// === Inicialização do Servidor ===
const PORT = process.env.PORT || 10000;
httpServer.listen(PORT, () =>
  console.log(`🚀 AI Tática 4.2.2-FIX (WebSocket + Abel Ferreira) rodando na porta ${PORT}`)
);


