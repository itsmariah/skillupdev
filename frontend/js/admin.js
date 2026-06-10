(function initAdmin() {
  const LIKERT_LABELS = {
    desafiosInteressantes: "Os desafios foram interessantes e motivadores",
    feedbackUtil:          "O feedback da IA foi útil para o aprendizado",
    reflexaoSoftSkills:    "Ajudou a refletir sobre habilidades interpessoais",
    usariaNovamente:       "Usaria a plataforma novamente",
    feedbackCoerente:      "Feedbacks da IA foram coerentes",
    feedbackVsGenerico:    "Feedback IA vs feedback genérico",
  };

  function susClass(score) {
    if (score >= 85) return "sus-excellent";
    if (score >= 71) return "sus-good";
    if (score >= 51) return "sus-ok";
    return "sus-bad";
  }

  function statusBadge(done) {
    return done
      ? '<span class="status-badge status-done">Concluído</span>'
      : '<span class="status-badge status-pending">Pendente</span>';
  }

  function hide(id) { document.getElementById(id)?.classList.add("d-none"); }
  function show(id) { document.getElementById(id)?.classList.remove("d-none"); }

  function renderSummaryCards(summary) {
    const container = document.getElementById("summaryCards");
    if (!container) return;

    const cards = [
      { value: summary.participantCount,   label: "Participantes",                helper: "Total de usuários no estudo" },
      { value: summary.preCompletedCount,  label: "Questionários Pré",            helper: "Etapa 1 concluída" },
      { value: summary.postCompletedCount, label: "Questionários Pós",            helper: "Etapa 2 concluída" },
      { value: summary.avgSusScore !== null ? summary.avgSusScore : "—", label: "SUS Score Médio", helper: "Usabilidade (0–100)" },
    ];

    container.innerHTML = cards.map((c) => `
      <div class="col-6 col-md-3">
        <div class="dashboard-box stat-card">
          <p class="stat-label">${c.label}</p>
          <h3>${c.value}</h3>
          <p class="stat-helper">${c.helper}</p>
        </div>
      </div>
    `).join("");
  }

  function renderSusBlock(summary) {
    const el = document.getElementById("susBlock");
    if (!el) return;

    if (summary.avgSusScore === null) {
      el.innerHTML = '<p class="text-muted text-center py-3">Nenhum dado ainda</p>';
      return;
    }

    const cls = susClass(summary.avgSusScore);
    el.innerHTML = `
      <div class="admin-sus-score">${summary.avgSusScore}</div>
      <div><span class="sus-badge ${cls}">${summary.susClassification}</span></div>
      <p class="mt-3 mb-0 text-muted" style="font-size:0.82rem;">de um máximo de 100 pontos</p>
    `;
  }

  function renderLikertBlock(summary) {
    const el = document.getElementById("likertBlock");
    if (!el) return;

    const rows = Object.entries(LIKERT_LABELS).map(([key, label]) => {
      const avg = summary.likertAverages?.[key];
      const display = avg !== null && avg !== undefined ? avg.toFixed(1) : "—";
      const pct = avg !== null && avg !== undefined ? ((avg - 1) / 4) * 100 : 0;
      return `
        <div class="mini-row" style="gap:12px; display:flex; align-items:center; border-radius:8px; margin-bottom:6px;">
          <span style="flex:1; font-size:0.85rem;">${label}</span>
          <div class="likert-bar-track" style="min-width:80px; max-width:140px;">
            <div class="likert-bar-fill" style="width:${pct}%;"></div>
          </div>
          <span class="likert-score">${display}<span style="font-size:0.7rem; color:#9ca3af;">/5</span></span>
        </div>
      `;
    }).join("");

    el.innerHTML = rows || '<p class="text-muted">Nenhum dado ainda</p>';
  }

  function renderOpenAnswers(openAnswers) {
    const el = document.getElementById("openAnswersBlock");
    if (!el) return;

    if (!openAnswers.length) {
      el.innerHTML = '<p class="text-muted text-center py-3 mb-0">Nenhuma resposta aberta ainda.</p>';
      return;
    }

    el.innerHTML = openAnswers.map((r) => `
      <div class="open-answer-card">
        <div class="open-answer-user">${escapeHtml(r.userName)} &mdash; ${new Date(r.submittedAt).toLocaleDateString("pt-BR")}</div>
        ${r.gostou ? `<div class="open-answer-label">O que mais gostou</div><div class="open-answer-text">"${escapeHtml(r.gostou)}"</div>` : ""}
        ${r.melhorar ? `<div class="open-answer-label">O que melhoraria</div><div class="open-answer-text">"${escapeHtml(r.melhorar)}"</div>` : ""}
        ${r.feedbackCoerente ? `<div class="open-answer-label">Sobre o feedback da IA</div><div class="open-answer-text">"${escapeHtml(r.feedbackCoerente)}"</div>` : ""}
      </div>
    `).join("");
  }

  function renderParticipants(participants) {
    const tbody = document.getElementById("participantsTable");
    const noMsg = document.getElementById("noParticipants");
    if (!tbody) return;

    if (!participants.length) {
      tbody.innerHTML = "";
      noMsg?.classList.remove("d-none");
      return;
    }

    noMsg?.classList.add("d-none");
    tbody.innerHTML = participants.map((p) => `
      <tr>
        <td><strong style="color:#2c2457">${escapeHtml(p.nome)}</strong></td>
        <td class="text-muted" style="font-size:0.82rem;">${escapeHtml(p.email)}</td>
        <td><strong style="color:#2c2457">${p.challengesCompleted}</strong></td>
        <td>${statusBadge(p.studyPreDone)}</td>
        <td>${statusBadge(p.studyPostDone)}</td>
        <td>${p.susScore !== null ? `<strong style="color:#2c2457">${p.susScore}</strong>` : '<span class="text-muted">—</span>'}</td>
      </tr>
    `).join("");
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function load() {
    hide("adminContent");
    hide("adminError");
    show("adminLoading");

    try {
      const data = await window.skillUpApi.getAdminStudyData();

      renderSummaryCards(data.summary);
      renderSusBlock(data.summary);
      renderLikertBlock(data.summary);
      renderOpenAnswers(data.openAnswers);
      renderParticipants(data.participants);

      const exportBtn = document.getElementById("btnExport");
      if (exportBtn) {
        exportBtn.removeAttribute("href");
        exportBtn.addEventListener("click", async (ev) => {
          ev.preventDefault();
          try {
            const token = window.skillUpApi.getToken();
            const origin = window.skillUpApi.getApiOrigin();
            const response = await fetch(`${origin}/api/admin/study-data/export`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) throw new Error("Falha ao exportar.");
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "estudo_piloto.csv";
            a.click();
            URL.revokeObjectURL(url);
          } catch (err) {
            alert("Erro ao exportar: " + (err.message || ""));
          }
        });
      }

      hide("adminLoading");
      show("adminContent");
    } catch (err) {
      hide("adminLoading");
      const errEl = document.getElementById("adminError");
      if (errEl) {
        errEl.textContent = err.message || "Erro ao carregar dados.";
        errEl.classList.remove("d-none");
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (document.body.dataset.page !== "admin") return;

    if (!window.skillUpAuth?.requireSession()) return;

    if (!window.skillUpApi.getStoredUser()?.isAdmin) {
      window.location.href = "dashboard.html";
      return;
    }

    document.getElementById("logoutBtn")?.addEventListener("click", () => window.logout());
    document.getElementById("btnRefresh")?.addEventListener("click", load);

    window.adminApp = { load };
    load();
  });
})();
