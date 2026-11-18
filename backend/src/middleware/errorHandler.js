// Fim da cadeia do Express: rota de API inexistente vira 404 em JSON, e qualquer erro não
// tratado vira 500 em JSON com o código da requisição (para quem usa informar ao suporte).
// O log leva a pilha completa; o alerta (se configurado) leva só o essencial.
const { logger } = require("../lib/logger");
const { sendAlert } = require("../services/alerts");

function apiNotFound(req, res, next) {
  if (!req.path.startsWith("/api/")) return next();
  return res.status(404).json({ message: "Rota não encontrada." });
}

// JSON malformado e corpo grande demais chegam aqui com status 4xx do body-parser.
function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  const status = Number(error.status || error.statusCode);
  if (status >= 400 && status < 500) {
    return res.status(status).json({
      message: status === 413 ? "Conteúdo grande demais." : "Requisição inválida.",
    });
  }

  const route = req.route?.path ? `${req.baseUrl || ""}${req.route.path}` : req.path;
  logger.error("Erro não tratado na requisição.", {
    requestId: req.id,
    method: req.method,
    route,
    userId: req.user?.id,
    err: error,
  });
  sendAlert({
    key: `500:${req.method} ${route}`,
    title: "erro 500 numa requisição",
    error,
    details: { Rota: `${req.method} ${route}`, Código: req.id },
  });

  return res.status(500).json({
    message: `Erro interno. Se continuar, informe o código ${req.id}.`,
    requestId: req.id,
  });
}

module.exports = { apiNotFound, errorHandler };
