(function attachSkillUpHistory() {
  const QUALITY_LABEL = {
    ideal: "Resposta ideal",
    medium: "Boa resposta",
    low: "Em desenvolvimento",
  };

  const EVALUATOR_NOTE = {
    ai: "Avaliada por IA, critério a critério.",
    heuristic:
      "A IA não estava disponível nesta resposta. A nota veio de uma análise automática simplificada.",
    closed: "Múltipla escolha: cada alternativa tem nota e feedback definidos.",
  };

  // Rótulos que a avaliação da IA usa para separar o feedback em partes.
  const FEEDBACK_SECTIONS = ["O que foi bem", "O que faltou", "Como melhorar"];

  let historyItems = [];

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  }

  // "O que foi bem: ... O que faltou: ..." vira uma lista com uma parte por linha.
  function renderFeedback(feedback) {
    const pattern = new RegExp(`(${FEEDBACK_SECTIONS.join("|")}):\\s*`, "g");
    const parts = String(feedback || "").split(pattern);

    if (parts.length < 3) {
      return `<p>${escapeHtml(feedback)}</p>`;
    }

    const items = [];
    for (let index = 1; index < parts.length; index += 2) {
      items.push(
        `<li><strong>${escapeHtml(parts[index])}:</strong> ${escapeHtml(parts[index + 1].trim())}</li>`,
      );
    }

    return `<ul class="history-feedback-parts">${items.join("")}</ul>`;
  }

  function renderCriteria(criteriaScores) {
    if (!criteriaScores?.length) {
      return "";
    }

    const rows = criteriaScores
      .map(
        (item) => `
          <li>
            <div class="category-progress-header">
              <span>${escapeHtml(item.criterio)}</span>
              <strong>${escapeHtml(item.nota)}</strong>
            </div>
            <div class="progress" role="img" aria-label="${escapeHtml(item.criterio)}: nota ${escapeHtml(item.nota)} de 100">
              <div class="progress-bar" style="width: ${Number(item.nota) || 0}%"></div>
            </div>
          </li>
        `,
      )
      .join("");

    return `
      <h3 class="history-subtitle">Nota por critério</h3>
      <ul class="history-criteria">${rows}</ul>
    `;
  }

  // Botão só na tentativa mais recente de cada desafio que ainda está disponível.
  function retryButton(item, isLatest) {
    if (!isLatest || !item.disponivel) {
      return "";
    }
    const label = item.tipo === "aberto" ? "Refazer para melhorar" : "Revisar";
    return `<a class="btn btn-sm btn-outline-primary" href="challenges.html?desafio=${encodeURIComponent(item.challengeId)}">${label}</a>`;
  }

  function renderItem(item, isLatest) {
    const tier = QUALITY_LABEL[item.qualityTier] ? item.qualityTier : "low";
    const typeLabel = item.tipo === "aberto" ? "Resposta aberta" : "Múltipla escolha";
    const evaluatorNote = EVALUATOR_NOTE[item.evaluator] || "";

    return `
      <details class="history-item">
        <summary>
          <span class="history-item-main">
            <span class="history-item-title">${escapeHtml(item.titulo)}</span>
            <span class="history-item-meta">
              ${window.skillUpIcons.categoryIcon(item.categoria, "category-icon")}
              ${escapeHtml(item.categoria)} · ${typeLabel} · ${escapeHtml(formatDate(item.respondidoEm))}${item.tentativa > 1 ? ` · Tentativa ${escapeHtml(item.tentativa)}${item.revisao ? " (revisão)" : ""}` : ""}
            </span>
          </span>
          <span class="history-score tier-${tier}">
            <strong>${escapeHtml(item.nota)}</strong>
            <span>${QUALITY_LABEL[tier]}</span>
          </span>
        </summary>

        <div class="history-item-body">
          <h3 class="history-subtitle">Cenário</h3>
          <p>${escapeHtml(item.pergunta)}</p>

          <h3 class="history-subtitle">Sua resposta</h3>
          <p class="history-answer">${escapeHtml(item.resposta)}</p>

          <h3 class="history-subtitle">Feedback</h3>
          ${renderFeedback(item.feedback)}

          ${renderCriteria(item.criteriaScores)}

          ${item.consequence ? `<p class="history-consequence"><strong>Consequência:</strong> ${escapeHtml(item.consequence)}</p>` : ""}

          <p class="history-footnote">
            +${escapeHtml(item.xpGanho)} XP${evaluatorNote ? ` · ${escapeHtml(evaluatorNote)}` : ""}
          </p>
          <div class="reflection-slot" data-attempt-id="${escapeHtml(item.id)}"></div>
          ${retryButton(item, isLatest)}
        </div>
      </details>
    `;
  }

  const SORTERS = {
    recent: (a, b) => String(b.respondidoEm).localeCompare(String(a.respondidoEm)),
    oldest: (a, b) => String(a.respondidoEm).localeCompare(String(b.respondidoEm)),
    best: (a, b) => b.nota - a.nota,
    worst: (a, b) => a.nota - b.nota,
  };

  function renderList() {
    const list = document.getElementById("historyList");
    const count = document.getElementById("historyCount");
    if (!list) {
      return;
    }

    if (historyItems.length === 0) {
      count.textContent = "";
      list.innerHTML = `
        <p class="dashboard-empty">
          Você ainda não concluiu nenhum desafio. Os feedbacks aparecem aqui assim que você responder o primeiro.
          <a href="challenges.html">Começar agora</a>
        </p>
      `;
      return;
    }

    const category = document.getElementById("filterCategory")?.value || "";
    const type = document.getElementById("filterType")?.value || "";
    const order = document.getElementById("filterOrder")?.value || "recent";

    const visible = historyItems
      .filter((item) => (!category || item.categoria === category) && (!type || item.tipo === type))
      .sort(SORTERS[order] || SORTERS.recent);

    count.textContent =
      visible.length === historyItems.length
        ? `${visible.length} ${visible.length === 1 ? "feedback" : "feedbacks"}`
        : `${visible.length} de ${historyItems.length} feedbacks`;

    // Tentativa mais recente de cada desafio (a lista da API vem da mais nova para a mais antiga).
    const latestIds = new Set();
    const seen = new Set();
    for (const item of historyItems) {
      if (!seen.has(item.challengeId)) {
        seen.add(item.challengeId);
        latestIds.add(item.id);
      }
    }

    list.innerHTML = visible.length
      ? visible.map((item) => renderItem(item, latestIds.has(item.id))).join("")
      : '<p class="dashboard-empty">Nenhum feedback com esses filtros.</p>';

    list.querySelectorAll(".reflection-slot").forEach((slot) => {
      const item = historyItems.find((entry) => entry.id === slot.dataset.attemptId);
      window.skillUpReflection?.mount(slot, item, (reflexao, reflexaoEm) => {
        item.reflexao = reflexao;
        item.reflexaoEm = reflexaoEm;
      });
    });
  }

  function renderSummary(evolution) {
    const trend = evolution.trend;
    const fields = {
      historyCompleted: `${evolution.completed}/${evolution.totalChallenges}`,
      historyAverage: evolution.averageScore === null ? "—" : String(evolution.averageScore),
      historyTrend: trend ? `${trend.delta > 0 ? "+" : ""}${trend.delta}` : "—",
      historyTrendHelper: trend
        ? `Média dos últimos ${trend.window} desafios (${trend.recentAverage}) contra os ${trend.window} anteriores (${trend.previousAverage}).`
        : "Aparece a partir de 4 desafios.",
    };

    Object.entries(fields).forEach(([id, text]) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = text;
      }
    });
  }

  function populateCategoryFilter(evolution) {
    const select = document.getElementById("filterCategory");
    if (!select) {
      return;
    }

    evolution.byCategory
      .filter((item) => item.completed > 0)
      .forEach((item) => {
        const option = document.createElement("option");
        option.value = item.categoria;
        option.textContent = item.categoria;
        select.appendChild(option);
      });
  }

  async function loadHistory() {
    if (document.body.dataset.page !== "history") {
      return;
    }

    if (!window.skillUpAuth.requireSession()) {
      return;
    }

    document.getElementById("logoutBtn")?.addEventListener("click", () => window.logout());
    document.getElementById("historyFilters")?.addEventListener("change", renderList);

    try {
      const payload = await window.skillUpApi.getHistory();
      historyItems = Array.isArray(payload.items) ? payload.items : [];
      renderSummary(payload.evolution);
      populateCategoryFilter(payload.evolution);
      renderList();
    } catch (error) {
      const list = document.getElementById("historyList");
      if (list) {
        list.innerHTML = `<p class="dashboard-empty">${escapeHtml(error.message || "Não foi possível carregar o histórico.")}</p>`;
      }
    } finally {
      document.getElementById("historyLoading")?.remove();
    }
  }

  document.addEventListener("DOMContentLoaded", loadHistory);
})();
