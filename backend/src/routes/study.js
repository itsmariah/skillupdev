const express = require("express");
const crypto = require("crypto");

const { STUDY_ENABLED, STUDY_MIN_CHALLENGES, STUDY_VERSION } = require("../config");
const db = require("../db");
const { authenticateRequest } = require("../middleware/auth");
const { filterValidAttempts } = require("../services/gamification");
const { buildUserResponse } = require("../services/users");

const router = express.Router();

const ALREADY_SUBMITTED_MESSAGE = "Questionário já respondido.";

// Com o estudo desligado, as rotas dele não existem para quem usa a plataforma.
// Os dados já coletados continuam no painel admin.
function requireStudyEnabled(_req, res, next) {
  if (!STUDY_ENABLED) {
    return res.status(404).json({ message: "O estudo não está ativo." });
  }
  next();
}

router.post(
  "/api/study/questionnaire",
  requireStudyEnabled,
  authenticateRequest,
  async (req, res) => {
    const type = String(req.body.type || "");
    const data = req.body.data;

    if (!["pre", "post"].includes(type)) {
      return res
        .status(400)
        .json({ message: "Tipo de questionário inválido. Use 'pre' ou 'post'." });
    }

    if (!data || typeof data !== "object") {
      return res.status(400).json({ message: "Dados do questionário não informados." });
    }

    if (await db.findStudyResponse(req.user.id, type)) {
      return res.status(409).json({ message: ALREADY_SUBMITTED_MESSAGE });
    }

    const attempts = await db.listAttemptsByUser(req.user.id);

    if (type === "post" && filterValidAttempts(attempts).length < STUDY_MIN_CHALLENGES) {
      return res.status(403).json({
        message: `Complete ao menos ${STUDY_MIN_CHALLENGES} desafios antes de responder o questionário final.`,
      });
    }

    const record = {
      id: crypto.randomUUID(),
      userId: req.user.id,
      userName: req.user.nome,
      userEmail: req.user.email,
      type,
      studyVersion: type === "pre" ? STUDY_VERSION : req.user.studyVersion || 1,
      submittedAt: new Date().toISOString(),
      data,
    };

    if (type === "pre") {
      req.user.studyPreDone = true;
      req.user.studyVersion = STUDY_VERSION;
    } else {
      req.user.studyPostDone = true;
    }

    try {
      await db.getClient().transaction(async (tx) => {
        await db.insertStudyResponse(record, tx);
        await db.saveUser(req.user, tx);
      });
    } catch (error) {
      if (db.isUniqueViolation(error)) {
        return res.status(409).json({ message: ALREADY_SUBMITTED_MESSAGE });
      }
      throw error;
    }

    return res.json({
      message: "Questionário salvo com sucesso.",
      user: buildUserResponse(req.user, attempts),
    });
  },
);

module.exports = router;
