const express = require("express");

const { MAX_NAME_LENGTH, MIN_PASSWORD_LENGTH } = require("../config");
const db = require("../db");
const { authenticateRequest, clearSessionCookie } = require("../middleware/auth");
const { accountSecurityLimiter } = require("../middleware/rateLimits");
const { buildAccountExport, exportFileName } = require("../services/account");
const { createPasswordHash, verifyPassword } = require("../services/auth");
const { normalizeAvatarConfig } = require("../services/gamification");
const { buildHistory } = require("../services/history");
const { ROLES, hasRole } = require("../services/roles");
const { buildUserResponse } = require("../services/users");

const router = express.Router();

// Ações que pedem a senha atual: o limite conta por usuário e só as tentativas erradas.
// Senha errada responde 403 (não 401): a sessão é válida e o frontend trata 401 como logout.
const passwordProtected = [authenticateRequest, accountSecurityLimiter];

router.get("/api/me", authenticateRequest, async (req, res) => {
  const attempts = await db.listAttemptsByUser(req.user.id);

  res.json({
    user: buildUserResponse(req.user, attempts),
  });
});

// Histórico de feedbacks (mais recentes primeiro) e números da evolução por categoria.
router.get("/api/me/history", authenticateRequest, async (req, res) => {
  res.json(buildHistory(await db.listAttemptsByUser(req.user.id)));
});

router.patch("/api/me/avatar", authenticateRequest, async (req, res) => {
  req.user.avatarConfig = normalizeAvatarConfig(req.body.avatarConfig || req.body, req.user.xp);
  await db.saveUser(req.user);
  const attempts = await db.listAttemptsByUser(req.user.id);

  res.json({
    message: "Avatar salvo com sucesso.",
    user: buildUserResponse(req.user, attempts),
  });
});

// --- Conta: perfil, senha, exportação e exclusão ---

router.patch("/api/me/profile", authenticateRequest, async (req, res) => {
  const nome = String(req.body.nome || "").trim();

  if (!nome) {
    return res.status(400).json({ message: "Informe seu nome." });
  }

  if (nome.length > MAX_NAME_LENGTH) {
    return res
      .status(400)
      .json({ message: `O nome pode ter no máximo ${MAX_NAME_LENGTH} caracteres.` });
  }

  req.user.nome = nome;
  await db.saveUser(req.user);
  const attempts = await db.listAttemptsByUser(req.user.id);

  res.json({
    message: "Perfil atualizado.",
    user: buildUserResponse(req.user, attempts),
  });
});

router.post("/api/me/password", passwordProtected, async (req, res) => {
  const senhaAtual = String(req.body.senhaAtual || "");
  const novaSenha = String(req.body.novaSenha || "");

  if (!verifyPassword(senhaAtual, req.user.passwordHash)) {
    return res.status(403).json({ message: "Senha atual incorreta." });
  }

  if (novaSenha.length < MIN_PASSWORD_LENGTH) {
    return res
      .status(400)
      .json({ message: `A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });
  }

  // Troca a senha e derruba as sessões dos outros dispositivos e os links de redefinição.
  // A sessão atual continua valendo.
  req.user.passwordHash = createPasswordHash(novaSenha);

  await db.getClient().transaction(async (tx) => {
    await db.saveUser(req.user, tx);
    await db.deleteOtherSessionsByUser(req.user.id, req.tokenHash, tx);
    await db.deleteResetTokensByUser(req.user.id, tx);
  });

  res.json({ message: "Senha alterada. As sessões em outros dispositivos foram encerradas." });
});

router.get("/api/me/export", authenticateRequest, async (req, res) => {
  const exportedAt = new Date();
  const [attempts, studyResponses] = await Promise.all([
    db.listAttemptsByUser(req.user.id),
    db.listStudyResponsesByUser(req.user.id),
  ]);

  res.setHeader("Content-Disposition", `attachment; filename=${exportFileName(exportedAt)}`);
  res.setHeader("Cache-Control", "no-store");
  res.json(buildAccountExport({ user: req.user, attempts, studyResponses, exportedAt }));
});

router.delete("/api/me", passwordProtected, async (req, res) => {
  const senha = String(req.body?.senha || "");

  if (!verifyPassword(senha, req.user.passwordHash)) {
    return res.status(403).json({ message: "Senha incorreta." });
  }

  // O admin não se exclui por aqui, para a plataforma não ficar sem administrador.
  if (hasRole(req.user, ROLES.ADMIN)) {
    return res
      .status(403)
      .json({ message: "Contas de administrador não podem ser excluídas por esta página." });
  }

  // Sessões, tentativas, badges, tokens e respostas do estudo saem junto (ON DELETE CASCADE).
  await db.deleteUser(req.user.id);
  clearSessionCookie(res);

  res.json({ message: "Conta excluída. Seus dados foram removidos." });
});

module.exports = router;
