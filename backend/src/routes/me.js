const express = require("express");

const db = require("../db");
const { authenticateRequest } = require("../middleware/auth");
const { normalizeAvatarConfig } = require("../services/gamification");
const { buildUserResponse } = require("../services/users");

const router = express.Router();

router.get("/api/me", authenticateRequest, async (req, res) => {
  const attempts = await db.listAttemptsByUser(req.user.id);

  res.json({
    user: buildUserResponse(req.user, attempts),
  });
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

module.exports = router;
