const express = require("express");
const crypto = require("crypto");

const { SESSION_TTL_MS, MAX_NAME_LENGTH, MIN_PASSWORD_LENGTH } = require("../config");
const db = require("../db");
const { normalizeEmail } = require("../lib/text");
const { setSessionCookie, clearSessionCookie, authenticateRequest } = require("../middleware/auth");
const {
  loginIpLimiter,
  loginAccountLimiter,
  registerLimiter,
  forgotPasswordIpLimiter,
  forgotPasswordAccountLimiter,
  resetPasswordLimiter,
} = require("../middleware/rateLimits");
const {
  createPasswordHash,
  verifyPassword,
  createToken,
  hashToken,
  createPasswordResetToken,
} = require("../services/auth");
const {
  shouldExposeResetPreview,
  buildPasswordResetUrl,
  maskEmail,
  isRealEmailConfigured,
  sendPasswordResetEmail,
} = require("../services/email");
const {
  DEFAULT_AVATAR,
  createDefaultGamificationState,
  syncBadges,
  applyDailyLoginReward,
} = require("../services/gamification");
const { hydrateUser, buildUserResponse } = require("../services/users");

const router = express.Router();

// Limites por IP e por conta (e-mail informado), nesta ordem.
const loginLimiters = [loginIpLimiter, loginAccountLimiter];
const forgotPasswordLimiters = [forgotPasswordIpLimiter, forgotPasswordAccountLimiter];

function createSession(userId) {
  const token = createToken();
  const createdAt = new Date();

  return {
    token,
    record: {
      tokenHash: hashToken(token),
      userId,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + SESSION_TTL_MS).toISOString(),
    },
  };
}

const PASSWORD_TOO_SHORT_MESSAGE = `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;

const REGISTER_CONFLICT_MESSAGE =
  "Não foi possível criar a conta. Verifique os dados e tente novamente.";

router.post("/api/auth/register", registerLimiter, async (req, res) => {
  const nome = String(req.body.nome || "").trim();
  const email = normalizeEmail(req.body.email);
  const senha = String(req.body.senha || "");

  if (!nome || !email || !senha) {
    return res.status(400).json({ message: "Preencha nome, email e senha." });
  }

  if (nome.length > MAX_NAME_LENGTH) {
    return res
      .status(400)
      .json({ message: `O nome pode ter no máximo ${MAX_NAME_LENGTH} caracteres.` });
  }

  if (senha.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ message: PASSWORD_TOO_SHORT_MESSAGE });
  }

  if (await db.findUserByEmail(email)) {
    return res.status(409).json({ message: REGISTER_CONFLICT_MESSAGE });
  }

  const user = hydrateUser({
    id: crypto.randomUUID(),
    nome,
    email,
    passwordHash: createPasswordHash(senha),
    xp: 0,
    nivel: 1,
    badges: [],
    avatarConfig: DEFAULT_AVATAR,
    gamification: createDefaultGamificationState(),
    createdAt: new Date().toISOString(),
  });

  const dailyLoginReward = applyDailyLoginReward(user);
  syncBadges(user, []);

  const session = createSession(user.id);

  try {
    await db.getClient().transaction(async (tx) => {
      await db.insertUser(user, tx);
      await db.insertSession(session.record, tx);
    });
  } catch (error) {
    // Dois cadastros simultâneos com o mesmo e-mail: o segundo esbarra na restrição única.
    if (db.isUniqueViolation(error)) {
      return res.status(409).json({ message: REGISTER_CONFLICT_MESSAGE });
    }
    throw error;
  }

  setSessionCookie(res, session.token);

  return res.status(201).json({
    message: "Conta criada com sucesso.",
    dailyLoginReward,
    user: buildUserResponse(user, []),
  });
});

router.post("/api/auth/login", loginLimiters, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const senha = String(req.body.senha || "");

  if (!email || !senha) {
    return res.status(400).json({ message: "Informe email e senha." });
  }

  const user = await db.findUserByEmail(email);

  if (!user || !verifyPassword(senha, user.passwordHash)) {
    return res.status(401).json({ message: "Email ou senha inválidos." });
  }

  const attempts = await db.listAttemptsByUser(user.id);
  const dailyLoginReward = applyDailyLoginReward(user);
  syncBadges(user, attempts);

  const session = createSession(user.id);

  await db.getClient().transaction(async (tx) => {
    await db.saveUser(user, tx);
    await db.insertSession(session.record, tx);
  });
  await db.purgeExpiredSessions();

  setSessionCookie(res, session.token);

  return res.json({
    message: "Login realizado com sucesso.",
    dailyLoginReward,
    user: buildUserResponse(user, attempts),
  });
});

router.post("/api/auth/forgot-password", forgotPasswordLimiters, async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!email) {
    return res.status(400).json({ message: "Informe um e-mail válido." });
  }

  await db.purgeExpiredResetTokens();
  const user = await db.findUserByEmail(email);
  const response = {
    message: "Se existir uma conta com este email, enviaremos as instruções de recuperação.",
  };

  if (user) {
    const { rawToken, record } = createPasswordResetToken(user.id);

    await db.getClient().transaction(async (tx) => {
      await db.deleteResetTokensByUser(user.id, tx);
      await db.insertResetToken(record, tx);
    });

    // A resposta ao cliente é sempre a mesma, exista ou não a conta, para não revelar
    // quais e-mails estão cadastrados. Falhas de envio ficam só no log.
    if (isRealEmailConfigured()) {
      try {
        await sendPasswordResetEmail({
          user,
          req,
          rawToken,
          expiresAt: record.expiresAt,
        });
      } catch (error) {
        console.error("Falha ao enviar email de recuperação:", error);
      }
    } else if (shouldExposeResetPreview()) {
      response.message =
        "Email real não configurado neste ambiente. Use o link de teste abaixo para validar o fluxo.";
      response.previewResetUrl = buildPasswordResetUrl(req, rawToken);
      response.previewExpiresAt = record.expiresAt;
      return res.json(response);
    } else {
      console.error(
        "Envio de e-mail não configurado. Defina EMAIL_PROVIDER, EMAIL_FROM e RESEND_API_KEY.",
      );
    }
  }

  return res.json(response);
});

router.get("/api/auth/reset-password/validate", resetPasswordLimiter, async (req, res) => {
  const token = String(req.query.token || "").trim();

  if (!token) {
    return res.status(400).json({ message: "Token de recuperação não informado." });
  }

  const resetToken = await db.findActiveResetToken(hashToken(token));
  const user = resetToken ? await db.findUserById(resetToken.userId) : null;

  if (!resetToken || !user) {
    return res.status(400).json({ message: "Link de recuperação inválido ou expirado." });
  }

  return res.json({
    message: "Link de recuperação válido.",
    emailHint: maskEmail(user.email),
    expiresAt: resetToken.expiresAt,
  });
});

router.post("/api/auth/reset-password", resetPasswordLimiter, async (req, res) => {
  const token = String(req.body.token || "").trim();
  const senha = String(req.body.senha || "");

  if (!token) {
    return res.status(400).json({ message: "Token de recuperação não informado." });
  }

  if (senha.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ message: PASSWORD_TOO_SHORT_MESSAGE });
  }

  const resetToken = await db.findActiveResetToken(hashToken(token));
  const user = resetToken ? await db.findUserById(resetToken.userId) : null;

  if (!resetToken || !user) {
    return res.status(400).json({ message: "Link de recuperação inválido ou expirado." });
  }

  // Troca a senha, derruba todas as sessões e invalida os links de redefinição.
  user.passwordHash = createPasswordHash(senha);

  await db.getClient().transaction(async (tx) => {
    await db.saveUser(user, tx);
    await db.deleteSessionsByUser(user.id, tx);
    await db.deleteResetTokensByUser(user.id, tx);
  });
  clearSessionCookie(res);

  return res.json({
    message: "Senha redefinida com sucesso. Faça login com a nova senha.",
  });
});

router.post("/api/auth/logout", authenticateRequest, async (req, res) => {
  await db.deleteSession(req.tokenHash);
  clearSessionCookie(res);

  res.json({ message: "Sessão encerrada com sucesso." });
});

module.exports = router;
