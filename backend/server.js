const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

/* ROTA DE AVALIAÇÃO IA */
    aapp.post("/avaliar", async (req, res) => {
      const { resposta, categoria, pergunta } = req.body;

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
    Avalie a resposta de um usuário em um desafio de soft skills.

    Categoria: ${categoria}
    Pergunta: ${pergunta}
    Resposta do usuário: ${resposta}

    Avalie considerando:
    - clareza
    - empatia
    - profissionalismo
    - adequação ao cenário

    Retorne APENAS em JSON válido, no formato:
    {
      "nota": número de 0 a 100,
      "feedback": "texto curto com feedback construtivo"
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
    /* FIM ROTA IA */