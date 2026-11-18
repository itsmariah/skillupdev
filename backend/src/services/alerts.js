// Alertas de erro por webhook (opcional): com ALERT_WEBHOOK_URL definido, erros graves viram
// uma mensagem num canal (Discord ou Slack: o corpo leva "content" e "text", e cada um usa o
// seu). Sem a variável, nada é enviado e os erros ficam só no log.
//
// Para não inundar o canal: o mesmo tipo de alerta sai no máximo uma vez a cada
// ALERT_COOLDOWN_MS, e no total no máximo MAX_ALERTS_PER_HOUR por hora. A mensagem leva o
// código da requisição e o erro, nunca dados de quem usou.
const { logger } = require("../lib/logger");

const ALERT_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_ALERTS_PER_HOUR = 20;
const ALERT_TIMEOUT_MS = 5000;
const MAX_MESSAGE_LENGTH = 1500;

const lastSentByKey = new Map();
let sentTimestamps = [];

function resetAlerts() {
  lastSentByKey.clear();
  sentTimestamps = [];
}

function shouldSend(key, now) {
  const last = lastSentByKey.get(key);
  if (last && now - last < ALERT_COOLDOWN_MS) return false;
  sentTimestamps = sentTimestamps.filter((time) => now - time < 60 * 60 * 1000);
  if (sentTimestamps.length >= MAX_ALERTS_PER_HOUR) return false;
  lastSentByKey.set(key, now);
  sentTimestamps.push(now);
  return true;
}

function buildMessage({ title, error, details = {} }) {
  const environment = process.env.RENDER_SERVICE_NAME || process.env.NODE_ENV || "local";
  const lines = [
    `🚨 SkillUp Dev (${environment}): ${title}`,
    error ? `Erro: ${error.name || "Error"}: ${error.message}` : null,
    ...Object.entries(details)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => `${key}: ${value}`),
  ].filter(Boolean);
  return lines.join("\n").slice(0, MAX_MESSAGE_LENGTH);
}

// key agrupa alertas do mesmo tipo (ex.: "500:/api/challenges/:id/submit", "ai-fallback").
// Devolve true se o alerta foi enviado. Nunca lança: alerta é melhor esforço.
async function sendAlert({ key, title, error, details }, { now = Date.now() } = {}) {
  const url = String(process.env.ALERT_WEBHOOK_URL || "").trim();
  if (!url || !shouldSend(key || title, now)) return false;

  const text = buildMessage({ title, error, details });
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text, text }),
      signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.warn("Webhook de alerta respondeu com erro.", { status: response.status });
      return false;
    }
    return true;
  } catch (sendError) {
    logger.warn("Não foi possível enviar o alerta.", { reason: sendError.message });
    return false;
  }
}

module.exports = {
  ALERT_COOLDOWN_MS,
  MAX_ALERTS_PER_HOUR,
  sendAlert,
  buildMessage,
  resetAlerts,
};
