const rateLimit = require("express-rate-limit");

const { findActiveSession, findUserById } = require("../db");
const { hashToken } = require("../services/auth");

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Tente novamente em 15 minutos." },
});

async function authenticateRequest(req, res, next) {
  const authorization = String(req.headers.authorization || "");

  if (!authorization.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token de acesso não informado." });
  }

  const rawToken = authorization.slice("Bearer ".length).trim();
  const tokenHash = hashToken(rawToken);
  const session = await findActiveSession(tokenHash);

  if (!session) {
    return res.status(401).json({ message: "Sessão inválida ou expirada." });
  }

  const user = await findUserById(session.userId);

  if (!user) {
    return res.status(401).json({ message: "Usuário da sessão não encontrado." });
  }

  req.user = user;
  req.tokenHash = tokenHash;

  next();
}

function requireAdmin(req, res, next) {
  if (!req.user.isAdmin) {
    return res.status(403).json({ message: "Acesso restrito ao administrador." });
  }
  next();
}

module.exports = {
  authRateLimiter,
  authenticateRequest,
  requireAdmin,
};
