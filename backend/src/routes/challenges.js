const express = require("express");
const crypto = require("crypto");

const { MIN_OPEN_ANSWER_LENGTH, MAX_OPEN_ANSWER_LENGTH } = require("../config");
const { getChallenges, getChallengeById } = require("../content/catalog");
const { buildPublicTaxonomy, getSkillById } = require("../content/competencies");
const db = require("../db");
const { authenticateRequest } = require("../middleware/auth");
const { challengeSubmitLimiter } = require("../middleware/rateLimits");
const { evaluateOpenChallengeWithAI } = require("../services/evaluation");
const {
  buildRewardSummary,
  calculateLevel,
  normalizeAvatarConfig,
  syncBadges,
  buildChallengeResult,
  buildRetryResult,
  isReviewAttempt,
} = require("../services/gamification");
const { buildTrails, getUnlockedChallengeIds } = require("../services/trails");
const { buildUserResponse } = require("../services/users");

const router = express.Router();

function buildPublicChallenge(challenge, attempts, unlockedIds) {
  const counted = attempts.filter((attempt) => !isReviewAttempt(attempt));
  const latest = attempts[attempts.length - 1];
  const best = counted.reduce(
    (top, attempt) => (!top || Number(attempt.score) > Number(top.score) ? attempt : top),
    null,
  );

  return {
    id: challenge.id,
    tipo: challenge.tipo,
    categoria: challenge.categoria,
    dificuldade: challenge.dificuldade,
    habilidades: challenge.habilidades.map((skillId) => {
      const skill = getSkillById(skillId);
      return { id: skill.id, nome: skill.nome, competencia: skill.competencia };
    }),
    titulo: challenge.titulo,
    pergunta: challenge.pergunta,
    descricao: challenge.descricao,
    criteriosAvaliacao: challenge.criteriosAvaliacao || [],
    // A dica não vai antes da resposta: nos desafios fechados ela aponta a alternativa ideal.
    // Ela aparece no feedback, depois de responder.
    recompensas: buildRewardSummary(challenge),
    respostas:
      challenge.tipo === "fechado"
        ? challenge.respostas.map((resposta) => ({
            id: resposta.id,
            texto: resposta.texto,
          }))
        : [],
    completed: counted.length > 0,
    // Nível da trilha liberado (ou desafio já respondido, que sempre pode ser refeito).
    liberado: unlockedIds.has(challenge.id),
    tentativas: attempts.length,
    melhorNota: best ? best.score : null,
    // Abertos: refazer pode render XP pela melhora. Fechados: refazer é só revisão.
    refazer: attempts.length > 0 ? (challenge.tipo === "aberto" ? "melhorar" : "revisar") : null,
    lastResult: latest
      ? {
          nota: latest.score,
          feedback: latest.feedback,
          xpGanho: latest.xpAwarded,
          qualityTier: latest.qualityTier,
          respondidoEm: latest.createdAt,
          tentativa: latest.attemptNumber,
        }
      : null,
  };
}

// Taxonomia pública: competências, habilidades e rubricas (o que cada faixa significa).
router.get("/api/competencies", (_req, res) => {
  res.json({ competencias: buildPublicTaxonomy() });
});

router.get("/api/challenges", authenticateRequest, async (req, res) => {
  const userAttempts = await db.listAttemptsByUser(req.user.id);
  const unlockedIds = getUnlockedChallengeIds(userAttempts);

  res.json({
    challenges: getChallenges().map((challenge) =>
      buildPublicChallenge(
        challenge,
        userAttempts.filter((attempt) => attempt.challengeId === challenge.id),
        unlockedIds,
      ),
    ),
  });
});

// Trilhas por competência: progresso por nível e o que está liberado.
router.get("/api/trails", authenticateRequest, async (req, res) => {
  const userAttempts = await db.listAttemptsByUser(req.user.id);
  res.json({ trilhas: buildTrails(userAttempts) });
});

// Envios em andamento por usuário+desafio. O número da tentativa é único no banco, então dois
// envios simultâneos não viram a mesma tentativa; isto evita avaliar com a IA (e pagar por)
// duas respostas simultâneas do mesmo desafio.
const submissionsInFlight = new Set();

// O limite vem depois da autenticação porque conta por usuário.
const submitGuards = [authenticateRequest, challengeSubmitLimiter];

router.post("/api/challenges/:challengeId/submit", submitGuards, async (req, res) => {
  const challenge = getChallengeById(req.params.challengeId);

  if (!challenge) {
    return res.status(404).json({ message: "Desafio não encontrado." });
  }

  // A trava da trilha vale no servidor também, não só na interface.
  const unlockedIds = getUnlockedChallengeIds(await db.listAttemptsByUser(req.user.id));
  if (!unlockedIds.has(challenge.id)) {
    return res.status(403).json({
      message:
        "Este desafio ainda está bloqueado. Conclua mais desafios do nível anterior da trilha.",
    });
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

async function handleChallengeSubmission(req, res, challenge) {
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
      const previousForChallenge = previousAttempts.filter(
        (attempt) => attempt.challengeId === challenge.id,
      );
      const isRetry = previousForChallenge.length > 0;

      // Primeira resposta: regras de sempre (XP, sequência perfeita). Nova tentativa: XP só
      // pela melhora nos abertos, revisão sem XP nos fechados, sequência inalterada.
      const result = isRetry
        ? buildRetryResult({ challenge, score, feedback, previousAttempts: previousForChallenge })
        : buildChallengeResult({
            challenge,
            score,
            feedback,
            previousStreak: Number(user.gamification?.perfectStreak) || 0,
          });

      user.xp = Math.max(0, Number(user.xp) + result.xpGanho);
      user.nivel = calculateLevel(user.xp);
      user.avatarConfig = normalizeAvatarConfig(user.avatarConfig, user.xp);

      if (!isRetry) {
        user.gamification.perfectStreak = result.perfectStreak;
      }

      // Respostas ideais contam desafios: só a primeira vez que um desafio chega a ideal.
      if (isRetry ? result.firstIdeal : result.wasIdeal) {
        user.gamification.idealAnswers = (Number(user.gamification.idealAnswers) || 0) + 1;
      }

      const attemptRecord = {
        id: crypto.randomUUID(),
        userId: user.id,
        challengeId: challenge.id,
        challengeVersion: challenge.version,
        attemptNumber:
          previousForChallenge.reduce(
            (max, attempt) => Math.max(max, Number(attempt.attemptNumber) || 1),
            0,
          ) + 1,
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
      return res.status(409).json({
        message: "Outra resposta para este desafio acabou de ser registrada. Atualize a página.",
      });
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
      perfectStreak: user.gamification.perfectStreak,
      tentativa: attempts[attempts.length - 1].attemptNumber,
      tentativaId: attempts[attempts.length - 1].id,
      revisao: Boolean(result.review),
      melhorFaixaAnterior: result.previousBestTier || null,
      xpBreakdown: result.xpBreakdown,
      unlockedBadges,
      evaluator: evaluation.evaluator,
    },
    user: buildUserResponse(user, attempts),
  });
}

module.exports = router;
