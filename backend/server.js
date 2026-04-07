const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

/* ROTA DE AVALIAÇÃO IA */
app.post("/avaliar", async (req, res) => {

  const { resposta } = req.body;

  try {

    const respostaIA = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: `
    Avalie a seguinte resposta de soft skill:

    "${resposta}"

    Critérios:
    - Comunicação
    - Clareza
    - Empatia
    - Profissionalismo

    Retorne APENAS em JSON:
    {
    "nota": número de 0 a 100,
    "feedback": "texto curto"
    }
    `
            }
            ]
        })
        });

        const data = await respostaIA.json();

        const texto = data.choices[0].message.content;

        const resultado = JSON.parse(texto);

        res.json(resultado);

    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: "Erro na IA" });
    }

    });

    app.listen(3000, () => {
    console.log("🔥 Servidor rodando em http://localhost:3000");
    });
    /* FIM ROTA IA */