const express = require("express");

const { writeDatabase } = require("../db");
const { authenticateRequest } = require("../middleware/auth");
const { normalizeAvatarConfig } = require("../services/gamification");
const { buildUserResponse } = require("../services/users");

const router = express.Router();

router.get("/api/me", authenticateRequest, async (req, res) => {
  res.json({
    user: buildUserResponse(req.user, req.database),
  });
});

router.patch("/api/me/avatar", authenticateRequest, async (req, res) => {
  req.user.avatarConfig = normalizeAvatarConfig(req.body.avatarConfig || req.body, req.user.xp);
  await writeDatabase(req.database);

  res.json({
    message: "Avatar salvo com sucesso.",
    user: buildUserResponse(req.user, req.database),
  });
});

module.exports = router;
