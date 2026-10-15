// Badges pelo painel admin: criar, editar, ativar e desativar. Não há exclusão: quem já
// ganhou uma badge continua com ela, mesmo desativada ou com a regra alterada.
// Badge nova nasce desativada; ao ativar (ou mudar a regra de uma ativa), quem já cumpre a
// regra recebe a badge na próxima resposta ou no próximo acesso.
const express = require("express");

const db = require("../db");
const { BADGE_XP } = require("../content/badges");
const { buildPublicRuleTypes } = require("../content/badgeRules");
const { authenticateRequest, requireRole } = require("../middleware/auth");
const { validateBadge, createBadgeId } = require("../services/badges");
const { ROLES } = require("../services/roles");

const router = express.Router();

const adminOnly = [authenticateRequest, requireRole(ROLES.ADMIN)];

function invalid(res, errors) {
  return res.status(400).json({ message: "A badge tem campos inválidos.", errors });
}

async function knownChallengeIds() {
  return new Set((await db.listChallengesForAdmin()).map((challenge) => challenge.id));
}

async function respondWithBadge(res, id, status = 200) {
  return res.status(status).json({ badge: await db.findBadgeForAdmin(id) });
}

router.get("/api/admin/badges", adminOnly, async (_req, res) => {
  const challenges = await db.listChallengesForAdmin();
  res.json({
    badges: await db.listBadgesForAdmin(),
    regras: buildPublicRuleTypes(),
    xpPorRaridade: BADGE_XP,
    desafios: challenges.map(({ id, titulo, categoria, status }) => ({
      id,
      titulo,
      categoria,
      status,
    })),
  });
});

router.post("/api/admin/badges", adminOnly, async (req, res) => {
  const { errors, badge } = validateBadge(req.body, await knownChallengeIds());
  if (errors.length > 0) {
    return invalid(res, errors);
  }

  const id = createBadgeId(badge.name);
  await db.insertBadge({ id, ...badge, updatedBy: req.user.id });
  await db.reloadBadges();
  return respondWithBadge(res, id, 201);
});

router.put("/api/admin/badges/:id", adminOnly, async (req, res) => {
  if (!(await db.findBadgeForAdmin(req.params.id))) {
    return res.status(404).json({ message: "Badge não encontrada." });
  }

  const { errors, badge } = validateBadge(req.body, await knownChallengeIds());
  if (errors.length > 0) {
    return invalid(res, errors);
  }

  await db.updateBadge({ id: req.params.id, ...badge, updatedBy: req.user.id });
  await db.reloadBadges();
  return respondWithBadge(res, req.params.id);
});

for (const [action, active] of [
  ["activate", true],
  ["deactivate", false],
]) {
  router.post(`/api/admin/badges/:id/${action}`, adminOnly, async (req, res) => {
    if (!(await db.setBadgeActive(req.params.id, active, req.user.id))) {
      return res.status(404).json({ message: "Badge não encontrada." });
    }

    await db.reloadBadges();
    return respondWithBadge(res, req.params.id);
  });
}

module.exports = router;
