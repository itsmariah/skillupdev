// Gerenciamento de conteúdo pelo painel admin: rascunho → publicação, com versões.
// Versão publicada não muda; editar cria (ou atualiza) um rascunho até ser publicado.
const express = require("express");

const db = require("../db");
const { DIFFICULTIES, buildPublicTaxonomy } = require("../content/competencies");
const { authenticateRequest, requireRole } = require("../middleware/auth");
const { validateChallengeContent, createChallengeId } = require("../services/content");
const { findBadgesRequiringChallenge } = require("../services/gamification");
const { ROLES } = require("../services/roles");

const router = express.Router();

const adminOnly = [authenticateRequest, requireRole(ROLES.ADMIN)];

function invalid(res, errors) {
  return res.status(400).json({ message: "O desafio tem campos inválidos.", errors });
}

async function respondWithChallenge(res, id, status = 200) {
  const challenge = await db.findChallengeForAdmin(id);
  return res.status(status).json({
    challenge: { ...challenge, badgesDependentes: findBadgesRequiringChallenge(id) },
  });
}

router.get("/api/admin/challenges", adminOnly, async (_req, res) => {
  res.json({
    challenges: await db.listChallengesForAdmin(),
    competencias: buildPublicTaxonomy(),
    dificuldades: DIFFICULTIES,
  });
});

router.get("/api/admin/challenges/:id", adminOnly, async (req, res) => {
  if (!(await db.findChallengeForAdmin(req.params.id))) {
    return res.status(404).json({ message: "Desafio não encontrado." });
  }
  return respondWithChallenge(res, req.params.id);
});

// Novo desafio: nasce como rascunho (não aparece para ninguém até ser publicado).
router.post("/api/admin/challenges", adminOnly, async (req, res) => {
  const tipo = String(req.body.tipo || "");
  const { errors, content } = validateChallengeContent(tipo, req.body.content);
  if (errors.length > 0) {
    return invalid(res, errors);
  }

  const id = createChallengeId(content.titulo);
  await db.insertChallengeDraft({ id, tipo, content, createdBy: req.user.id });
  return respondWithChallenge(res, id, 201);
});

// Salva o rascunho (cria a próxima versão se o desafio estava só publicado).
router.put("/api/admin/challenges/:id/draft", adminOnly, async (req, res) => {
  const current = await db.findChallengeForAdmin(req.params.id);
  if (!current) {
    return res.status(404).json({ message: "Desafio não encontrado." });
  }

  const { errors, content } = validateChallengeContent(current.tipo, req.body.content);
  if (errors.length > 0) {
    return invalid(res, errors);
  }

  await db.saveChallengeDraft({ id: current.id, content, createdBy: req.user.id });
  return respondWithChallenge(res, current.id);
});

router.delete("/api/admin/challenges/:id/draft", adminOnly, async (req, res) => {
  const result = await db.discardChallengeDraft(req.params.id);

  if (result === "missing") {
    return res.status(404).json({ message: "Desafio não encontrado." });
  }
  if (result === "none") {
    return res.status(409).json({ message: "Este desafio não tem rascunho." });
  }
  if (result === "deleted") {
    return res.json({
      message: "Rascunho descartado. O desafio nunca foi publicado e foi removido.",
    });
  }
  return respondWithChallenge(res, req.params.id);
});

router.post("/api/admin/challenges/:id/publish", adminOnly, async (req, res) => {
  const version = await db.publishChallengeDraft(req.params.id);
  if (!version) {
    return res.status(409).json({ message: "Não há rascunho para publicar." });
  }

  await db.reloadCatalog();
  return respondWithChallenge(res, req.params.id);
});

// Arquivar tira o desafio da lista; tentativas, XP e histórico de quem respondeu continuam.
router.post("/api/admin/challenges/:id/archive", adminOnly, async (req, res) => {
  if (!(await db.setChallengeStatus(req.params.id, "arquivado"))) {
    return res.status(409).json({ message: "Só desafios já publicados podem ser arquivados." });
  }

  await db.reloadCatalog();
  return respondWithChallenge(res, req.params.id);
});

router.post("/api/admin/challenges/:id/unarchive", adminOnly, async (req, res) => {
  if (!(await db.setChallengeStatus(req.params.id, "publicado"))) {
    return res.status(409).json({ message: "Só desafios já publicados podem voltar." });
  }

  await db.reloadCatalog();
  return respondWithChallenge(res, req.params.id);
});

module.exports = router;
