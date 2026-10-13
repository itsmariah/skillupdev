const express = require("express");
const crypto = require("crypto");

const { MIN_OPEN_ANSWER_LENGTH, MAX_OPEN_ANSWER_LENGTH } = require("../config");
const { CHALLENGES, getChallengeById } = require("../content/challenges");
const db = require("../db");
const { authenticateRequest } = require("../middleware/auth");
const { evaluateOpenChallengeWithAI } = require("../services/evaluation");
const {
  CHALLENGE_COMPLETION_XP,
  IDEAL_ANSWER_BONUS_XP,
  PERFECT_STREAK_BONUS_XP,
  calculateLevel,
  normalizeAvatarConfig,
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
  const userAttempts = await db.listAttemptsByUser(req.user.id);

  res.json({
    challenges: CHALLENGES.map((challenge) =>
      buildPublicChallenge(
        challenge,
        userAttempts.find((attempt) => attempt.challengeId === challenge.id),
      ),
    ),
  });
});

// Envios em andamento por usuário+desafio. A restrição única no banco já impede XP em dobro;
// isto evita avaliar com a IA (e pagar por) duas respostas simultâneas do mesmo desafio.
const submissionsInFlight = new Set();

router.post("/api/challenges/:challengeId/submit", authenticateRequest, async (req, res) => {
  const challenge = getChallengeById(req.params.challengeId);

  if (!challenge) {
    return res.status(404).json({ message: "Desafio não encontrado." });
  }

  const submissionKey = `${req.user.id}:${challenge.id}`;

  if (submissionsInFlight.has(submissionKey)) {
    return res
      .status(409)
      .json({ message: "Sua resposta para este desafio já está sendo avaliada." });
  }

  submissionsInFlight.add(submissionKey);

  try {
    return await handleChallengeSubmission(req, res, challenge);
  } finally {
    submissionsInFlight.delete(submissionKey);
  }
});

async function respondAlreadyCompleted(res, user, existingAttempt) {
  const attempts = await db.listAttemptsByUser(user.id);

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
      evaluator: existingAttempt.evaluator,
    },
    user: buildUserResponse(user, attempts),
  });
}

async function handleChallengeSubmission(req, res, challenge) {
  const existingAttempt = await db.findAttempt(req.user.id, challenge.id);

  if (existingAttempt) {
    return respondAlreadyCompleted(res, req.user, existingAttempt);
  }

  let answer = "";
  let score = 0;
  let feedback = "";
  let evaluation = { evaluator: "closed" };

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
      return res.status(400).json({
        message: `Elabore melhor sua resposta. Mínimo de ${MIN_OPEN_ANSWER_LENGTH} caracteres.`,
      });
    }

    if (texto.length > MAX_OPEN_ANSWER_LENGTH) {
      return res
        .status(400)
        .json({ message: `A resposta pode ter no máximo ${MAX_OPEN_ANSWER_LENGTH} caracteres.` });
    }

    answer = texto;
    const aiResult = await evaluateOpenChallengeWithAI({
      resposta: texto,
      challenge,
    });

    score = aiResult.nota;
    feedback = aiResult.feedback;
    evaluation = aiResult.evaluation;
  }

  let outcome;

  try {
    // A avaliação da IA fica fora da transação para não segurar a trava durante a chamada.
    // Dentro dela, o usuário é relido com FOR UPDATE: XP e sequência partem do estado atual.
    outcome = await db.getClient().transaction(async (tx) => {
      const user = await db.findUserById(req.user.id, tx, { forUpdate: true });
      const previousAttempts = await db.listAttemptsByUser(user.id, tx);

      const result = buildChallengeResult({
        challenge,
        score,
        feedback,
        previousStreak: Number(user.gamification?.perfectStreak) || 0,
      });

      user.xp = Math.max(0, Number(user.xp) + result.xpGanho);
      user.nivel = calculateLevel(user.xp);
      user.avatarConfig = normalizeAvatarConfig(user.avatarConfig, user.xp);
      user.gamification.perfectStreak = result.perfectStreak;

      if (result.wasIdeal) {
        user.gamification.idealAnswers = (Number(user.gamification.idealAnswers) || 0) + 1;
      }

      const attemptRecord = {
        id: crypto.randomUUID(),
        userId: user.id,
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
        evaluator: evaluation.evaluator,
        evaluation,
        createdAt: new Date().toISOString(),
      };

      const attempts = [...previousAttempts, attemptRecord];
      const unlockedBadges = syncBadges(user, attempts);
      attemptRecord.unlockedBadges = unlockedBadges;

      await db.insertAttempt(attemptRecord, tx);
      await db.saveUser(user, tx);

      return { user, attempts, result, unlockedBadges };
    });
  } catch (error) {
    if (db.isUniqueViolation(error)) {
      const attempt = await db.findAttempt(req.user.id, challenge.id);
      return respondAlreadyCompleted(res, req.user, attempt);
    }
    throw error;
  }

  const { user, attempts, result, unlockedBadges } = outcome;

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
      evaluator: evaluation.evaluator,
    },
    user: buildUserResponse(user, attempts),
  });
}

module.exports = router;
