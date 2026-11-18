// Chamada à API de chat da OpenAI com saída estruturada (JSON Schema estrito), usada pelo
// avaliador, pelo resumo de evolução e pela geração de cenários. Timeout em OPENAI_TIMEOUT_MS.
// Cada chamada é registrada para o monitoramento de custo e latência (painel admin, aba IA).
const {
  OPENAI_MODEL,
  OPENAI_TIMEOUT_MS,
  OPENAI_PRICE_INPUT,
  OPENAI_PRICE_OUTPUT,
} = require("../config");
const { logger } = require("../lib/logger");

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

// O app liga o registro no banco com setUsageRecorder; sem isso (scripts, testes de unidade)
// nada é gravado. Só números: nenhum conteúdo enviado ou recebido, nem quem fez o pedido.
let usageRecorder = null;

function setUsageRecorder(recorder) {
  usageRecorder = recorder;
}

// Custo estimado em dólares a partir dos tokens e do preço por milhão (config).
function estimateCostUsd(promptTokens, completionTokens) {
  if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens)) return null;
  return (promptTokens * OPENAI_PRICE_INPUT + completionTokens * OPENAI_PRICE_OUTPUT) / 1e6;
}

function buildUsageEntry(feature, data, startedAt, error) {
  const promptTokens = Number(data?.usage?.prompt_tokens);
  const completionTokens = Number(data?.usage?.completion_tokens);
  const totalTokens = Number(data?.usage?.total_tokens);
  const hasTokens = Number.isFinite(promptTokens) && Number.isFinite(completionTokens);
  const errorText = error
    ? error.name === "TimeoutError" || error.name === "AbortError"
      ? "timeout"
      : String(error.message)
    : null;

  return {
    feature,
    model: data?.model || OPENAI_MODEL,
    ok: !error,
    error: errorText ? errorText.slice(0, 200) : null,
    promptTokens: hasTokens ? promptTokens : null,
    completionTokens: hasTokens ? completionTokens : null,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : null,
    latencyMs: Date.now() - startedAt,
    costUsd: hasTokens ? estimateCostUsd(promptTokens, completionTokens) : null,
  };
}

async function recordUsage(entry) {
  if (!usageRecorder) return;
  try {
    await usageRecorder(entry);
  } catch (error) {
    // Falha no registro não pode atrapalhar a avaliação de ninguém.
    logger.warn("Não foi possível registrar o uso da IA.", { reason: error.message });
  }
}

// Uma chamada à OpenAI com saída em JSON Schema. Devolve o JSON lido e a resposta bruta.
// feature identifica o recurso no monitoramento (avaliacao, evolucao, resumo, geracao).
async function callOpenAI(messages, schema, { feature = "outro" } = {}) {
  const startedAt = Date.now();
  let data = null;

  try {
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

    data = await response.json();
    const message = data?.choices?.[0]?.message;

    if (message?.refusal) {
      throw new Error("O modelo recusou o pedido.");
    }

    const result = { parsed: extractJsonObject(message?.content), data };
    await recordUsage(buildUsageEntry(feature, data, startedAt, null));
    return result;
  } catch (error) {
    await recordUsage(buildUsageEntry(feature, data, startedAt, error));
    throw error;
  }
}

module.exports = { callOpenAI, extractJsonObject, setUsageRecorder, estimateCostUsd };
