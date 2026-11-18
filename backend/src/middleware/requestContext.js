// Contexto de cada requisição: um id (aceita o X-Request-Id do proxy, se for seguro, ou gera
// um), devolvido no header da resposta, e uma linha de log por chamada à API com método, rota,
// status, duração e o id do usuário (se houver sessão). Sem query string nem corpo: podem ter
// dados pessoais.
const crypto = require("crypto");

const { logger } = require("../lib/logger");

const SAFE_REQUEST_ID = /^[\w.-]{8,100}$/;
// Rotas consultadas o tempo todo por monitores: não poluem o log.
const QUIET_PATHS = new Set(["/api/health"]);

function requestContext(req, res, next) {
  const incoming = req.get("x-request-id");
  req.id = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
  res.set("X-Request-Id", req.id);

  if (!req.path.startsWith("/api/") || QUIET_PATHS.has(req.path)) {
    return next();
  }

  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const fields = {
      requestId: req.id,
      method: req.method,
      // Rota com parâmetros (/api/challenges/:challengeId/submit) quando houver; senão o caminho.
      route: req.route?.path ? `${req.baseUrl || ""}${req.route.path}` : req.path,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
      userId: req.user?.id,
    };
    // 4xx (sessão expirada, validação, 404) é rotina: info. Os 500 já têm um log próprio, com
    // a pilha (errorHandler).
    if (res.statusCode < 500) logger.info("Requisição", fields);
  });

  return next();
}

module.exports = { requestContext };
