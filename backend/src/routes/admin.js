const express = require("express");

const db = require("../db");
const { authenticateRequest, requireAdmin } = require("../middleware/auth");
const { calcSusScore, susClassification } = require("../services/study");

const router = express.Router();

router.get("/api/admin/study-data", authenticateRequest, requireAdmin, async (req, res) => {
  const responses = await db.listStudyResponses();
  const users = await db.listUsers();
  const attemptCounts = await db.countAttemptsByUser();

  const preResponses = responses.filter((r) => r.type === "pre");
  const postResponses = responses.filter((r) => r.type === "post");

  const susScores = postResponses
    .filter((r) => r.data?.sus)
    .map((r) => calcSusScore(r.data.sus));

  const avgSus = susScores.length
    ? Math.round(susScores.reduce((a, b) => a + b, 0) / susScores.length)
    : null;

  const likertKeys = [
    "desafiosInteressantes",
    "feedbackUtil",
    "reflexaoSoftSkills",
    "usariaNovamente",
    "feedbackCoerente",
    "feedbackVsGenerico",
  ];

  const likertAverages = {};
  for (const key of likertKeys) {
    const vals = postResponses
      .map((r) => Number(r.data?.likert?.[key]))
      .filter((v) => v >= 1 && v <= 5);
    likertAverages[key] = vals.length
      ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
      : null;
  }

  function buildVersionSummary(preResp, postResp) {
    const sus = postResp.filter((r) => r.data?.sus).map((r) => calcSusScore(r.data.sus));
    const avgSusV = sus.length ? Math.round(sus.reduce((a, b) => a + b, 0) / sus.length) : null;
    const lkAvg = {};
    for (const key of likertKeys) {
      const vals = postResp.map((r) => Number(r.data?.likert?.[key])).filter((v) => v >= 1 && v <= 5);
      lkAvg[key] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
    }
    return {
      participantCount: new Set([...preResp.map((r) => r.userId), ...postResp.map((r) => r.userId)]).size,
      preCompletedCount: preResp.length,
      postCompletedCount: postResp.length,
      avgSusScore: avgSusV,
      susClassification: avgSusV !== null ? susClassification(avgSusV) : null,
      likertAverages: lkAvg,
    };
  }

  const v2UserIds = new Set(
    users.filter((u) => (u.studyVersion || 1) === 2).map((u) => u.id)
  );
  const v1Pre  = preResponses.filter((r) => !v2UserIds.has(r.userId));
  const v1Post = postResponses.filter((r) => !v2UserIds.has(r.userId));
  const v2Pre  = preResponses.filter((r) => v2UserIds.has(r.userId));
  const v2Post = postResponses.filter((r) => v2UserIds.has(r.userId));

  const participantCount = new Set([
    ...preResponses.map((r) => r.userId),
    ...postResponses.map((r) => r.userId),
  ]).size;

  const participants = users
    .filter((u) => !u.isAdmin && (u.studyPreDone || u.studyPostDone))
    .map((u) => {
      const pre = preResponses.find((r) => r.userId === u.id);
      const post = postResponses.find((r) => r.userId === u.id);
      return {
        id: u.id,
        nome: u.nome,
        email: u.email,
        studyVersion: u.studyVersion || 1,
        studyPreDone: Boolean(u.studyPreDone),
        studyPostDone: Boolean(u.studyPostDone),
        challengesCompleted: attemptCounts.get(u.id) || 0,
        preSubmittedAt: pre?.submittedAt || null,
        postSubmittedAt: post?.submittedAt || null,
        preData: pre?.data || null,
        postData: post?.data || null,
        susScore: post?.data?.sus ? calcSusScore(post.data.sus) : null,
      };
    });

  return res.json({
    summary: {
      participantCount,
      preCompletedCount: preResponses.length,
      postCompletedCount: postResponses.length,
      avgSusScore: avgSus,
      susClassification: avgSus !== null ? susClassification(avgSus) : null,
      likertAverages,
      v1: buildVersionSummary(v1Pre, v1Post),
      v2: buildVersionSummary(v2Pre, v2Post),
    },
    openAnswers: postResponses.map((r) => ({
      userName: r.userName,
      submittedAt: r.submittedAt,
      studyVersion: v2UserIds.has(r.userId) ? 2 : 1,
      gostou: r.data?.abertas?.gostou || "",
      melhorar: r.data?.abertas?.melhorar || "",
      feedbackCoerente: r.data?.abertas?.feedbackCoerente || "",
    })),
    participants,
  });
});

router.get("/api/admin/study-data/export", authenticateRequest, requireAdmin, async (req, res) => {
  const responses = await db.listStudyResponses();
  const postResponses = responses.filter((r) => r.type === "post");

  const header = [
    "Nome", "Email", "SubmitData",
    "SUS_S1","SUS_S2","SUS_S3","SUS_S4","SUS_S5",
    "SUS_S6","SUS_S7","SUS_S8","SUS_S9","SUS_S10","SUS_Score",
    "Likert_Desafios","Likert_Feedback","Likert_Reflexao",
    "Likert_Usaria","Likert_Coerencia","Likert_FeedbackVsGenerico",
    "Aberta_Gostou","Aberta_Melhorar","Aberta_FeedbackCoerente",
    "TempoEstudo_min","DesafiosConcluidos",
  ];

  const rows = postResponses.map((r) => {
    const sus = r.data?.sus || {};
    const lik = r.data?.likert || {};
    const ab = r.data?.abertas || {};
    const stats = r.data?.sessionStats || {};
    const susScore = sus.s1 ? calcSusScore(sus) : "";
    const csvStr = (v) => `"${String(v || "").replace(/"/g, '""')}"`;
    return [
      csvStr(r.userName), csvStr(r.userEmail), csvStr(r.submittedAt),
      sus.s1||"", sus.s2||"", sus.s3||"", sus.s4||"", sus.s5||"",
      sus.s6||"", sus.s7||"", sus.s8||"", sus.s9||"", sus.s10||"", susScore,
      lik.desafiosInteressantes||"", lik.feedbackUtil||"", lik.reflexaoSoftSkills||"",
      lik.usariaNovamente||"", lik.feedbackCoerente||"", lik.feedbackVsGenerico||"",
      csvStr(ab.gostou), csvStr(ab.melhorar), csvStr(ab.feedbackCoerente),
      stats.timeSpentMinutes||"", stats.challengesCompleted||"",
    ];
  });

  const csv = [header, ...rows].map((row) => row.join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=estudo_piloto.csv");
  return res.send("﻿" + csv);
});

router.delete("/api/admin/users/:id", authenticateRequest, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const user = await db.findUserById(id);

  if (!user) {
    return res.status(404).json({ message: "Usuário não encontrado." });
  }

  if (user.isAdmin) {
    return res.status(403).json({ message: "Não é possível excluir um administrador." });
  }

  // Sessões, tentativas, badges, tokens e respostas do estudo saem junto (ON DELETE CASCADE).
  await db.deleteUser(id);
  return res.json({ message: "Participante excluído com sucesso." });
});

module.exports = router;
