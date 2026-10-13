const express = require("express");
const crypto = require("crypto");

const { SESSION_TTL_MS, MAX_NAME_LENGTH } = require("../config");
const { purgeExpiredPasswordResetTokens, readDatabase, writeDatabase } = require("../db");
const { normalizeEmail } = require("../lib/text");
const { authRateLimiter, authenticateRequest } = require("../middleware/auth");
const {
  createPasswordHash,
  verifyPassword,
  createToken,
  hashToken,
  createPasswordResetToken,
  findPasswordResetToken,
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

router.post("/api/auth/register", authRateLimiter, async (req, res) => {
  const nome = String(req.body.nome || "").trim();
  const email = normalizeEmail(req.body.email);
  const senha = String(req.body.senha || "");

  if (!nome || !email || !senha) {
    return res.status(400).json({ message: "Preencha nome, email e senha." });
  }

  if (nome.length > MAX_NAME_LENGTH) {
    return res.status(400).json({ message: `O nome pode ter no máximo ${MAX_NAME_LENGTH} caracteres.` });
  }

  if (senha.length < 6) {
    return res.status(400).json({ message: "A senha precisa ter pelo menos 6 caracteres." });
  }

  const database = await readDatabase();
  const emailExists = database.users.some((item) => item.email === email);

  if (emailExists) {
    return res.status(409).json({ message: "Não foi possível criar a conta. Verifique os dados e tente novamente." });
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
  syncBadges(user, database);

  const token = createToken();

  database.users.push(user);
  database.sessions.push({
    tokenHash: hashToken(token),
    userId: user.id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });

  await writeDatabase(database);

  return res.status(201).json({
    message: "Conta criada com sucesso.",
    token,
    dailyLoginReward,
    user: buildUserResponse(user, database),
  });
});

router.post("/api/auth/login", authRateLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const senha = String(req.body.senha || "");

  if (!email || !senha) {
    return res.status(400).json({ message: "Informe email e senha." });
  }

  const database = await readDatabase();
  const user = database.users.find((item) => item.email === email);

  if (!user || !verifyPassword(senha, user.passwordHash)) {
    return res.status(401).json({ message: "Email ou senha inválidos." });
  }

  const dailyLoginReward = applyDailyLoginReward(user);
  syncBadges(user, database);

  const token = createToken();
  database.sessions.push({
    tokenHash: hashToken(token),
    userId: user.id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });

  await writeDatabase(database);

  return res.json({
    message: "Login realizado com sucesso.",
    token,
    dailyLoginReward,
    user: buildUserResponse(user, database),
  });
});

router.post("/api/auth/forgot-password", authRateLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!email) {
    return res.status(400).json({ message: "Informe um e-mail válido." });
  }

  const database = await readDatabase();
  const removedExpiredTokens = purgeExpiredPasswordResetTokens(database);
  const user = database.users.find((item) => item.email === email);
  const response = {
    message: "Se existir uma conta com este email, enviaremos as instruções de recuperação.",
  };

  if (user) {
    database.passwordResetTokens = (database.passwordResetTokens || []).filter(
      (resetToken) => resetToken.userId !== user.id
    );

    const { rawToken, record } = createPasswordResetToken(user.id);
    database.passwordResetTokens.push(record);
    await writeDatabase(database);

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
        "Envio de e-mail não configurado. Defina EMAIL_PROVIDER, EMAIL_FROM e RESEND_API_KEY."
      );
    }

    return res.json(response);
  }

  if (removedExpiredTokens) {
    await writeDatabase(database);
  }

  return res.json(response);
});

router.get("/api/auth/reset-password/validate", authRateLimiter, async (req, res) => {
  const token = String(req.query.token || "").trim();

  if (!token) {
    return res.status(400).json({ message: "Token de recuperação não informado." });
  }

  const database = await readDatabase();
  const removedExpiredTokens = purgeExpiredPasswordResetTokens(database);
  const resetToken = findPasswordResetToken(database, token);

  if (removedExpiredTokens) {
    await writeDatabase(database);
  }

  if (!resetToken) {
    return res.status(400).json({ message: "Link de recuperação inválido ou expirado." });
  }

  const user = database.users.find((item) => item.id === resetToken.userId);

  if (!user) {
    return res.status(400).json({ message: "Link de recuperação inválido ou expirado." });
  }

  return res.json({
    message: "Link de recuperação válido.",
    emailHint: maskEmail(user.email),
    expiresAt: resetToken.expiresAt,
  });
});

router.post("/api/auth/reset-password", authRateLimiter, async (req, res) => {
  const token = String(req.body.token || "").trim();
  const senha = String(req.body.senha || "");

  if (!token) {
    return res.status(400).json({ message: "Token de recuperação não informado." });
  }

  if (senha.length < 6) {
    return res.status(400).json({ message: "A senha precisa ter pelo menos 6 caracteres." });
  }

  const database = await readDatabase();
  const removedExpiredTokens = purgeExpiredPasswordResetTokens(database);

  const resetToken = findPasswordResetToken(database, token);

  if (!resetToken) {
    if (removedExpiredTokens) {
      await writeDatabase(database);
    }
    return res.status(400).json({ message: "Link de recuperação inválido ou expirado." });
  }

  const user = database.users.find((item) => item.id === resetToken.userId);

  if (!user) {
    return res.status(400).json({ message: "Link de recuperação inválido ou expirado." });
  }

  user.passwordHash = createPasswordHash(senha);
  database.sessions = database.sessions.filter((session) => session.userId !== user.id);
  database.passwordResetTokens = database.passwordResetTokens.filter(
    (item) => item.userId !== user.id
  );

  await writeDatabase(database);

  return res.json({
    message: "Senha redefinida com sucesso. Faça login com a nova senha.",
  });
});

router.post("/api/auth/logout", authenticateRequest, async (req, res) => {
  req.database.sessions = req.database.sessions.filter((s) => s.tokenHash !== req.tokenHash);
  await writeDatabase(req.database);

  res.json({ message: "Sessão encerrada com sucesso." });
});

module.exports = router;
