// Limites de requisição. Os contadores ficam em memória: valem para uma única instância
// do servidor (o caso do Render hoje) e zeram a cada reinício.
const rateLimit = require("express-rate-limit");

const { normalizeEmail } = require("../lib/text");

const MINUTE = 60 * 1000;

function createLimiter({ windowMs, limit, message, ...options }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message },
    ...options,
  });
}

// Limite por conta: a chave é o e-mail informado, então trocar de IP não ajuda a
// testar senhas de uma mesma conta. Quem não informa e-mail cai numa chave só.
const byEmail = (req) => `email:${normalizeEmail(req.body?.email) || "-"}`;
const byUser = (req) => `user:${req.user.id}`;

// Teto geral por IP para toda a API.
const apiLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 300,
  message: "Muitas requisições. Tente novamente em alguns minutos.",
});

const loginIpLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 20,
  message: "Muitas tentativas de login. Tente novamente em 15 minutos.",
});

// Só tentativas que falharam contam para a conta.
const loginAccountLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 5,
  keyGenerator: byEmail,
  skipSuccessfulRequests: true,
  message: "Muitas tentativas de login nesta conta. Tente novamente em 15 minutos.",
});

const registerLimiter = createLimiter({
  windowMs: 60 * MINUTE,
  limit: 5,
  message: "Muitos cadastros a partir desta rede. Tente novamente mais tarde.",
});

const forgotPasswordIpLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 5,
  message: "Muitos pedidos de recuperação. Tente novamente em 15 minutos.",
});

// Evita encher a caixa de entrada de alguém com e-mails de recuperação.
const forgotPasswordAccountLimiter = createLimiter({
  windowMs: 60 * MINUTE,
  limit: 3,
  keyGenerator: byEmail,
  message: "Muitos pedidos de recuperação para este e-mail. Tente novamente mais tarde.",
});

const resetPasswordLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  message: "Muitas tentativas. Tente novamente em 15 minutos.",
});

// Por conta (depois da autenticação): cada envio aberto pode custar uma chamada à OpenAI.
const challengeSubmitLimiter = createLimiter({
  windowMs: 10 * MINUTE,
  limit: 20,
  keyGenerator: byUser,
  message: "Muitos envios em pouco tempo. Aguarde alguns minutos e tente de novo.",
});

module.exports = {
  apiLimiter,
  loginIpLimiter,
  loginAccountLimiter,
  registerLimiter,
  forgotPasswordIpLimiter,
  forgotPasswordAccountLimiter,
  resetPasswordLimiter,
  challengeSubmitLimiter,
};
