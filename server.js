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
  cors: {
    origin: [
      "https://www.osinvictos.com.br",
      "https://osinvictos.com.br"
    ],
    methods: ["GET", "POST"]
  }
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

if (signature.includes("4-4-2")) return "4-4-2";
if (signature.includes("3-5-2")) return "3-5-2";
if (signature.includes("4-2-3-1")) return "4-2-3-1";
if (signature.includes("3-4-3")) return "3-4-3";
if (signature.includes("4-3-3")) return "4-3-3";

// fallback baseado na média da largura dos clusters
if (clusters.length <= 3) return "3-5-2";
if (clusters.length === 4) return "4-4-2";
if (clusters.length >= 5) return "4-3-3";
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

    const players = black.length ? black : green;
    if (!players.length) return res.status(400).json({ error: "Nenhum jogador recebido" });

    // === 📊 Cálculos geométricos base ===
    const xs = players.map(p => p.left);
    const ys = players.map(p => p.top);
    const avgX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const avgY = ys.reduce((a, b) => a + b, 0) / ys.length;
    const spreadX = Math.max(...xs) - Math.min(...xs);
    const spreadY = Math.max(...ys) - Math.min(...ys);
    const CENTER_Y = FIELD_HEIGHT / 2;

    // === 🧩 Inferência tática básica ===
    let detectedFormation = detectFormationAdvanced(players);

    let bloco = "baixo";
    if (avgX > 250 && avgX <= 350) bloco = "médio";
    else if (avgX > 350) bloco = "alto";

    let compactacao = "curta";
    if (spreadX > 220) compactacao = "média";
    if (spreadX > 300) compactacao = "larga";

    const linhaMedia = avgX < 200 ? "recuada" : avgX < 350 ? "intermediária" : "avançada";

    let pressao = "baixa";
    if (avgX > CENTER_X && compactacao !== "larga") pressao = "alta";
    else if (avgX > CENTER_X * 0.8) pressao = "média";

    // === ⚖️ Análise de assimetria tática ===
    const topPlayers = players.filter(p => p.top < CENTER_Y);
    const bottomPlayers = players.filter(p => p.top > CENTER_Y);
    const diff = Math.abs(topPlayers.length - bottomPlayers.length);

    let assimetria = "simétrica";
    if (diff >= 2) {
      assimetria = topPlayers.length > bottomPlayers.length ? "ataque pela direita" : "ataque pela esquerda";
    } else if (spreadY > 180) {
      assimetria = "muito espaçado verticalmente";
    }

    // === 🧮 Superioridade numérica ===
    // Calcula se há mais jogadores próximos à bola
    const nearBall = players.filter(p => {
      const dx = Math.abs(p.left - ball.left);
      const dy = Math.abs(p.top - ball.top);
      return Math.sqrt(dx * dx + dy * dy) < 80;
    });
    const superioridade = nearBall.length >= 3
      ? "superioridade numérica"
      : nearBall.length === 2
      ? "igualdade local"
      : "inferioridade próxima da bola";

    // === 🔺 Triângulos de apoio ===
    function detectTriangles(players) {
      let triangles = 0;
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          for (let k = j + 1; k < players.length; k++) {
            const a = players[i], b = players[j], c = players[k];
            const area =
              Math.abs(a.left * (b.top - c.top) + b.left * (c.top - a.top) + c.left * (a.top - b.top)) / 2;
            if (area > 100 && area < 2000) triangles++;
          }
        }
      }
      return triangles;
    }
    const triangulos = detectTriangles(players);
    const apoioTatico =
      triangulos > 8 ? "excelente formação de triângulos de apoio" :
      triangulos > 4 ? "boa conexão entre setores" :
      "poucas linhas de passe ativas";

    // === 🎯 Determinar fase do jogo ===
    let phase = "neutro";
    if (ball.left > CENTER_X && black.some(p => p.left > CENTER_X - 50)) phase = "defesa";
    else if (ball.left < CENTER_X && green.some(p => p.left < CENTER_X - 50)) phase = "ataque";
    else if (black.every(p => p.left < CENTER_X - 50)) phase = "avançado";

    // === 🔴 Cria o time adversário (para visual) ===
    const { red } = buildRedFromFormation(detectedFormation, ball);

    // === 🧩 Monta relatório tático completo ===
    const tacticalSummary = `
    Formação: ${detectedFormation}
    Bloco: ${bloco}
    Compactação: ${compactacao}
    Linha média: ${linhaMedia}
    Pressão: ${pressao}
    Assimetria: ${assimetria}
    Superioridade: ${superioridade}
    Triângulos: ${apoioTatico}
    Fase: ${phase}
    `;

    // === 🧠 Treinador comenta ===
    const apiKey = process.env.OPENROUTER_KEY;
    let coachComment = `O adversário joga em ${detectedFormation}, com bloco ${bloco}, compactação ${compactacao}, linha ${linhaMedia}, pressão ${pressao}, ${assimetria}, e ${superioridade}. Observa-se ${apoioTatico}. Estamos na fase ${phase}.`;

    if (apiKey) {
      try {
        const prompt = `
        ${tacticalSummary}
        Fala como Abel Ferreira, treinador do Palmeiras.
        Faz uma análise emocional, racional e tática.
        Destaca a mentalidade, equilíbrio e leitura de jogo.
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
                Fala em português de Portugal com intensidade e clareza.
                Dá uma leitura tática completa: mentalidade, organização, e reação emocional.
                `
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
        console.error("❌ Erro ao consultar OpenAI:", err);
      }
    }

    // === ✅ Resposta final ===
    res.json({
      detectedFormation,
      bloco,
      compactacao,
      linhaMedia,
      pressao,
      assimetria,
      superioridade,
      apoioTatico,
      phase,
      coachComment,
      red
    });

  } catch (err) {
    console.error("❌ Erro geral no /ai/analyze:", err);
    res.status(500).json({ error: "Erro interno na análise tática" });
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


