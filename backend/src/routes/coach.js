// Coach (roadmap Fase 4): próximo passo recomendado e resumo de evolução.
// A recomendação é calculada a cada pedido (regras, sem custo). O resumo usa a IA, então fica
// guardado e só é gerado de novo quando a pessoa pede e há tentativas novas desde o último.
const express = require("express");

const db = require("../db");
const { authenticateRequest } = require("../middleware/auth");
const { coachSummaryLimiter } = require("../middleware/rateLimits");
const {
  MIN_CHALLENGES_FOR_SUMMARY,
  canSummarize,
  generateCoachSummary,
} = require("../services/coachSummary");
const { buildRecommendations } = require("../services/recommendation");

const router = express.Router();

function buildCoachResponse(attempts, stored) {
  const podeGerar = canSummarize(attempts);

  return {
    recomendacoes: buildRecommendations(attempts),
    resumo: stored
      ? {
          ...stored.summary,
          geradoEm: stored.generatedAt,
          avaliador: stored.evaluator,
        }
      : null,
    // Há tentativas novas desde o resumo guardado.
    resumoDesatualizado: Boolean(stored) && attempts.length > stored.attemptsCount,
    podeGerarResumo: podeGerar,
    minimoDeDesafios: MIN_CHALLENGES_FOR_SUMMARY,
  };
}

router.get("/api/me/coach", authenticateRequest, async (req, res) => {
  const [attempts, stored] = await Promise.all([
    db.listAttemptsByUser(req.user.id),
    db.findCoachSummary(req.user.id),
  ]);
  res.json(buildCoachResponse(attempts, stored));
});

// Um pedido de resumo por pessoa de cada vez (evita duas chamadas à IA com dois cliques).
const summariesInFlight = new Set();

router.post(
  "/api/me/coach/summary",
  [authenticateRequest, coachSummaryLimiter],
  async (req, res) => {
    const userId = req.user.id;
    const [attempts, stored] = await Promise.all([
      db.listAttemptsByUser(userId),
      db.findCoachSummary(userId),
    ]);

    if (!canSummarize(attempts)) {
      return res.status(400).json({
        message: `Responda pelo menos ${MIN_CHALLENGES_FOR_SUMMARY} desafios para gerar o resumo.`,
      });
    }

    // Nada mudou desde o último resumo: devolve o guardado, sem chamar a IA.
    if (stored && attempts.length <= stored.attemptsCount) {
      return res.json(buildCoachResponse(attempts, stored));
    }

    if (summariesInFlight.has(userId)) {
      return res.status(409).json({ message: "Seu resumo já está sendo gerado." });
    }

    summariesInFlight.add(userId);
    try {
      const generated = await generateCoachSummary(attempts, buildRecommendations(attempts));
      const saved = await db.saveCoachSummary({
        userId,
        summary: generated.summary,
        attemptsCount: attempts.length,
        evaluator: generated.evaluator,
        meta: generated.meta,
      });
      return res.json(buildCoachResponse(attempts, saved));
    } finally {
      summariesInFlight.delete(userId);
    }
  },
);

module.exports = router;
