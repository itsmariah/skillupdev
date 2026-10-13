const express = require("express");
const crypto = require("crypto");

const { STUDY_MIN_CHALLENGES, STUDY_VERSION } = require("../config");
const { writeDatabase } = require("../db");
const { authenticateRequest } = require("../middleware/auth");
const { getUserAttempts } = require("../services/gamification");
const { buildUserResponse } = require("../services/users");

const router = express.Router();

router.post("/api/study/questionnaire", authenticateRequest, async (req, res) => {
  const type = String(req.body.type || "");
  const data = req.body.data;

  if (!["pre", "post"].includes(type)) {
    return res.status(400).json({ message: "Tipo de questionário inválido. Use 'pre' ou 'post'." });
  }

  if (!data || typeof data !== "object") {
    return res.status(400).json({ message: "Dados do questionário não informados." });
  }

  if (!req.database.study_responses) {
    req.database.study_responses = [];
  }

  const alreadySubmitted = req.database.study_responses.some(
    (r) => r.userId === req.user.id && r.type === type
  );

  if (alreadySubmitted) {
    return res.status(409).json({ message: "Questionário já respondido." });
  }

  if (type === "post") {
    const attempts = getUserAttempts(req.user.id, req.database);
    if (attempts.length < STUDY_MIN_CHALLENGES) {
      return res.status(403).json({
        message: `Complete ao menos ${STUDY_MIN_CHALLENGES} desafios antes de responder o questionário final.`,
      });
    }
  }

  const record = {
    id: crypto.randomUUID(),
    userId: req.user.id,
    userName: req.user.nome,
    userEmail: req.user.email,
    type,
    studyVersion: type === "pre" ? STUDY_VERSION : (req.user.studyVersion || 1),
    submittedAt: new Date().toISOString(),
    data,
  };

  req.database.study_responses.push(record);

  if (type === "pre") {
    req.user.studyPreDone = true;
    req.user.studyVersion = STUDY_VERSION;
  } else {
    req.user.studyPostDone = true;
  }

  await writeDatabase(req.database);

  return res.json({
    message: "Questionário salvo com sucesso.",
    user: buildUserResponse(req.user, req.database),
  });
});

module.exports = router;
