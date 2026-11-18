// Logger estruturado, sem dependências. Em produção (ou LOG_FORMAT=json) cada linha é um JSON
// ({ time, level, msg, ...campos }), que o Render guarda e permite filtrar. No desenvolvimento,
// uma linha legível. Escreve pelo console (os testes conseguem silenciá-lo como antes).
//
// Nada de dados pessoais nos logs: campos com nomes sensíveis são mascarados, e quem chama
// registra ids (usuário, requisição), não nomes, e-mails ou textos de resposta.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const SENSITIVE_KEY = /pass|senha|token|secret|cookie|authorization|api[-_]?key/i;
const MAX_DEPTH = 4;

function resolveSettings(env = process.env) {
  const production = env.NODE_ENV === "production" || Boolean(env.RENDER);
  const defaultLevel = env.NODE_ENV === "test" ? "warn" : "info";
  const level = String(env.LOG_LEVEL || "")
    .trim()
    .toLowerCase();
  const format = String(env.LOG_FORMAT || "")
    .trim()
    .toLowerCase();
  return {
    level: level in LEVELS ? level : defaultLevel,
    json: format ? format === "json" : production,
  };
}

let settings = resolveSettings();

function configureLogger(env) {
  settings = resolveSettings(env);
}

function serializeError(error) {
  return {
    name: error.name,
    message: error.message,
    ...(error.code ? { code: error.code } : {}),
    ...(error.status ? { status: error.status } : {}),
    stack: error.stack,
  };
}

// Cópia segura dos campos: erros viram objeto, chaves sensíveis viram "[oculto]".
function sanitize(value, depth = 0) {
  if (value instanceof Error) return serializeError(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[...]";
  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[oculto]" : sanitize(item, depth + 1),
    ]),
  );
}

function write(level, msg, fields = {}) {
  if (LEVELS[level] < LEVELS[settings.level]) return;
  const clean = sanitize(fields);
  const output = level === "error" ? console.error : level === "warn" ? console.warn : console.log;

  if (settings.json) {
    output(JSON.stringify({ time: new Date().toISOString(), level, msg, ...clean }));
    return;
  }

  const { err, ...rest } = clean;
  const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : "";
  output(`[${level}] ${msg}${extra}${err?.stack ? `\n${err.stack}` : ""}`);
}

const logger = {
  debug: (msg, fields) => write("debug", msg, fields),
  info: (msg, fields) => write("info", msg, fields),
  warn: (msg, fields) => write("warn", msg, fields),
  error: (msg, fields) => write("error", msg, fields),
};

module.exports = {
  LEVELS,
  logger,
  configureLogger,
  sanitize,
};
