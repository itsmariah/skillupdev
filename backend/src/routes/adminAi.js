// Monitoramento da IA no painel admin: chamadas, erros, tokens, custo estimado e latência por
// recurso e por dia, e o custo do mês comparado ao orçamento (AI_MONTHLY_BUDGET_USD).
const express = require("express");

const {
  APP_TIMEZONE,
  AI_MONTHLY_BUDGET_USD,
  OPENAI_MODEL,
  OPENAI_PRICE_INPUT,
  OPENAI_PRICE_OUTPUT,
} = require("../config");
const db = require("../db");
const { authenticateRequest, requireRole } = require("../middleware/auth");
const { ROLES } = require("../services/roles");

const router = express.Router();

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;
// A partir desta fração do orçamento o painel mostra o alerta.
const BUDGET_WARNING_RATIO = 0.8;

const FEATURE_LABELS = {
  avaliacao: "Avaliação de respostas abertas",
  evolucao: "Comentário de evolução (refazer)",
  resumo: "Resumo do coach",
  geracao: "Geração de cenários",
};

router.get(
  "/api/admin/ai-usage",
  [authenticateRequest, requireRole(ROLES.ADMIN)],
  async (req, res) => {
    const requested = Number.parseInt(req.query.dias, 10);
    const days = Number.isInteger(requested)
      ? Math.min(Math.max(requested, 1), MAX_DAYS)
      : DEFAULT_DAYS;
    const since = new Date(Date.now() - days * DAY_MS);
    const usage = await db.summarizeAiUsage({ since, timeZone: APP_TIMEZONE });

    const budget = AI_MONTHLY_BUDGET_USD;
    const used = usage.month.costUsd;
    const ratio = budget ? used / budget : null;

    res.json({
      periodo: { dias: days, desde: since.toISOString(), fuso: APP_TIMEZONE },
      precos: {
        modelo: OPENAI_MODEL,
        entradaPorMilhao: OPENAI_PRICE_INPUT,
        saidaPorMilhao: OPENAI_PRICE_OUTPUT,
      },
      mes: {
        custoUsd: used,
        chamadas: usage.month.calls,
        orcamentoUsd: budget,
        percentual: ratio === null ? null : Math.round(ratio * 1000) / 10,
        alerta:
          ratio === null
            ? null
            : ratio >= 1
              ? "estourado"
              : ratio >= BUDGET_WARNING_RATIO
                ? "perto"
                : null,
      },
      porRecurso: usage.byFeature.map((item) => ({
        recurso: item.feature,
        nome: FEATURE_LABELS[item.feature] || item.feature,
        chamadas: item.calls,
        erros: item.errors,
        tokens: item.tokens,
        custoUsd: item.costUsd,
        latenciaMediaMs: item.avgLatencyMs,
        latenciaP95Ms: item.p95LatencyMs,
      })),
      porDia: usage.byDay.map((item) => ({
        dia: item.day,
        chamadas: item.calls,
        erros: item.errors,
        custoUsd: item.costUsd,
        latenciaMediaMs: item.avgLatencyMs,
      })),
      errosRecentes: usage.recentErrors.map((item) => ({
        recurso: FEATURE_LABELS[item.feature] || item.feature,
        erro: item.error,
        em: item.at,
      })),
    });
  },
);

module.exports = router;
