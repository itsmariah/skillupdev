// Chamada à API de chat da OpenAI com saída estruturada (JSON Schema estrito), usada pelo
// avaliador e pelo resumo de evolução. Timeout em OPENAI_TIMEOUT_MS.
const { OPENAI_MODEL, OPENAI_TIMEOUT_MS } = require("../config");

function extractJsonObject(text) {
  const rawText = String(text || "").trim();

  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch (_error) {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch (_secondError) {
      return null;
    }
  }
}

// Uma chamada à OpenAI com saída em JSON Schema. Devolve o JSON lido e a resposta bruta.
async function callOpenAI(messages, schema) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.2,
      response_format: { type: "json_schema", json_schema: schema },
    }),
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`OpenAI retornou status ${response.status}`);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message;

  if (message?.refusal) {
    throw new Error("O modelo recusou o pedido.");
  }

  return { parsed: extractJsonObject(message?.content), data };
}

module.exports = { callOpenAI, extractJsonObject };
