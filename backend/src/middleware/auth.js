const { IS_PRODUCTION, SESSION_TTL_MS } = require("../config");
const { findActiveSession, findUserById } = require("../db");
const { hashToken } = require("../services/auth");

// O token da sessão vive só num cookie HttpOnly: o JavaScript da página não consegue lê-lo.
// Em produção o prefixo __Host- obriga Secure, Path=/ e nenhum Domain.
const SESSION_COOKIE = IS_PRODUCTION ? "__Host-skillup_session" : "skillup_session";

const sessionCookieOptions = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: "lax",
  path: "/",
};

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, { ...sessionCookieOptions, maxAge: SESSION_TTL_MS });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions);
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator > -1 && part.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch (_error) {
        return "";
      }
    }
  }

  return "";
}

async function authenticateRequest(req, res, next) {
  const rawToken = readCookie(req, SESSION_COOKIE);

  if (!rawToken) {
    return res.status(401).json({ message: "Sessão não iniciada. Faça login." });
  }

  const tokenHash = hashToken(rawToken);
  const session = await findActiveSession(tokenHash);
  const user = session ? await findUserById(session.userId) : null;

  if (!user) {
    clearSessionCookie(res);
    return res.status(401).json({ message: "Sessão inválida ou expirada." });
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
  SESSION_COOKIE,
  setSessionCookie,
  clearSessionCookie,
  authenticateRequest,
  requireAdmin,
};
