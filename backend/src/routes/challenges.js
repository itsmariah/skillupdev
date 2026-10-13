const express = require("express");
const crypto = require("crypto");

const { MIN_OPEN_ANSWER_LENGTH, MAX_OPEN_ANSWER_LENGTH } = require("../config");
const { CHALLENGES, getChallengeById } = require("../content/challenges");
const { writeDatabase } = require("../db");
const { authenticateRequest } = require("../middleware/auth");
const { evaluateOpenChallengeWithAI } = require("../services/evaluation");
const {
  CHALLENGE_COMPLETION_XP,
  IDEAL_ANSWER_BONUS_XP,
  PERFECT_STREAK_BONUS_XP,
  calculateLevel,
  normalizeAvatarConfig,
  getUserAttempts,
  syncBadges,
  buildChallengeResult,
} = require("../services/gamification");
const { buildUserResponse } = require("../services/users");

const router = express.Router();

function buildPublicChallenge(challenge, completedAttempt) {
  return {
    id: challenge.id,
    tipo: challenge.tipo,
    categoria: challenge.categoria,
    titulo: challenge.titulo,
    pergunta: challenge.pergunta,
    descricao: challenge.descricao,
    dica: challenge.dica || null,
    criteriosAvaliacao: challenge.criteriosAvaliacao || [],
    recompensas: {
      conclusionXp: CHALLENGE_COMPLETION_XP,
      idealBonusXp: IDEAL_ANSWER_BONUS_XP,
      perfectStreakBonusXp: PERFECT_STREAK_BONUS_XP,
    },
    respostas:
      challenge.tipo === "fechado"
        ? challenge.respostas.map((resposta) => ({
            id: resposta.id,
            texto: resposta.texto,
          }))
        : [],
    completed: Boolean(completedAttempt),
    lastResult: completedAttempt
      ? {
          nota: completedAttempt.score,
          feedback: completedAttempt.feedback,
          xpGanho: completedAttempt.xpAwarded,
          qualityTier: completedAttempt.qualityTier,
          respondidoEm: completedAttempt.createdAt,
        }
      : null,
  };
}

router.get("/api/challenges", authenticateRequest, async (req, res) => {
  const userAttempts = getUserAttempts(req.user.id, req.database);

  res.json({
    challenges: CHALLENGES.map((challenge) =>
      buildPublicChallenge(
        challenge,
        userAttempts.find((attempt) => attempt.challengeId === challenge.id)
      )
    ),
  });
});

// Envios em andamento por usuário+desafio. Sem isso, duas requisições simultâneas passam
// pela checagem de tentativa existente enquanto aguardam a IA e ambas gravam XP.
// Vale para uma única instância; com banco relacional vira restrição única.
const submissionsInFlight = new Set();

router.post("/api/challenges/:challengeId/submit", authenticateRequest, async (req, res) => {
  const challenge = getChallengeById(req.params.challengeId);

  if (!challenge) {
    return res.status(404).json({ message: "Desafio não encontrado." });
  }

  const submissionKey = `${req.user.id}:${challenge.id}`;

  if (submissionsInFlight.has(submissionKey)) {
    return res.status(409).json({ message: "Sua resposta para este desafio já está sendo avaliada." });
  }

  submissionsInFlight.add(submissionKey);

  try {
    return await handleChallengeSubmission(req, res, challenge);
  } finally {
    submissionsInFlight.delete(submissionKey);
  }
});

async function handleChallengeSubmission(req, res, challenge) {
  const existingAttempt = req.database.challengeAttempts.find(
    (attempt) => attempt.userId === req.user.id && attempt.challengeId === challenge.id
  );

  if (existingAttempt) {
    return res.status(409).json({
      message: "Este desafio já foi concluído.",
      result: {
        nota: existingAttempt.score,
        feedback: existingAttempt.feedback,
        consequence: existingAttempt.consequence,
        xpGanho: existingAttempt.xpAwarded,
        qualityTier: existingAttempt.qualityTier,
        xpBreakdown: existingAttempt.xpBreakdown,
        unlockedBadges: existingAttempt.unlockedBadges,
      },
      user: buildUserResponse(req.user, req.database),
    });
  }

  let answer = "";
  let score = 0;
  let feedback = "";

  if (challenge.tipo === "fechado") {
    const respostaId = String(req.body.respostaId || "").trim();
    const resposta = challenge.respostas.find((item) => item.id === respostaId);

    if (!resposta) {
      return res.status(400).json({ message: "Opção de resposta inválida." });
    }

    answer = resposta.texto;
    score = resposta.xp;
    feedback = challenge.dica ? `${resposta.feedback} Dica: ${challenge.dica}` : resposta.feedback;
  } else {
    const texto = String(req.body.texto || "").trim();

    if (!texto) {
      return res.status(400).json({ message: "Digite uma resposta antes de enviar." });
    }

    if (texto.length < MIN_OPEN_ANSWER_LENGTH) {
      return res.status(400).json({ message: `Elabore melhor sua resposta. Mínimo de ${MIN_OPEN_ANSWER_LENGTH} caracteres.` });
    }

    if (texto.length > MAX_OPEN_ANSWER_LENGTH) {
      return res.status(400).json({ message: `A resposta pode ter no máximo ${MAX_OPEN_ANSWER_LENGTH} caracteres.` });
    }

    answer = texto;
    const evaluation = await evaluateOpenChallengeWithAI({
      resposta: texto,
      challenge,
    });

    score = evaluation.nota;
    feedback = evaluation.feedback;
  }

  const result = buildChallengeResult({
    challenge,
    score,
    feedback,
    previousStreak: Number(req.user.gamification?.perfectStreak) || 0,
  });

  req.user.xp = Math.max(0, Number(req.user.xp) + result.xpGanho);
  req.user.nivel = calculateLevel(req.user.xp);
  req.user.avatarConfig = normalizeAvatarConfig(req.user.avatarConfig, req.user.xp);
  req.user.gamification.perfectStreak = result.perfectStreak;

  if (result.wasIdeal) {
    req.user.gamification.idealAnswers = (Number(req.user.gamification.idealAnswers) || 0) + 1;
  }

  const attemptRecord = {
    id: crypto.randomUUID(),
    userId: req.user.id,
    challengeId: challenge.id,
    challengeType: challenge.tipo,
    category: challenge.categoria,
    answer,
    feedback: result.feedback,
    consequence: result.consequence,
    score: result.nota,
    qualityTier: result.qualityTier,
    wasIdeal: result.wasIdeal,
    xpAwarded: result.xpGanho,
    xpBreakdown: result.xpBreakdown,
    unlockedBadges: [],
    createdAt: new Date().toISOString(),
  };

  req.database.challengeAttempts.push(attemptRecord);

  const unlockedBadges = syncBadges(req.user, req.database);
  attemptRecord.unlockedBadges = unlockedBadges;

  await writeDatabase(req.database);

  return res.json({
    message: "Desafio avaliado com sucesso.",
    result: {
      nota: result.nota,
      feedback: result.feedback,
      consequence: result.consequence,
      xpGanho: result.xpGanho,
      qualityTier: result.qualityTier,
      wasIdeal: result.wasIdeal,
      perfectStreak: result.perfectStreak,
      xpBreakdown: result.xpBreakdown,
      unlockedBadges,
    },
    user: buildUserResponse(req.user, req.database),
  });
}

module.exports = router;
