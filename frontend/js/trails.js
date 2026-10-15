// Página de trilhas: uma trilha por competência, com o progresso de cada nível e o que já
// está liberado. As regras de desbloqueio ficam no servidor (backend/src/services/trails.js).
(function attachSkillUpTrails() {
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const icon = (name, className = "") => window.skillUpIcons?.icon(name, className) || "";

  // Por que um nível está bloqueado: quanto falta no nível anterior (o primeiro com desafios).
  function lockReason(trail, index) {
    const previous = trail.niveis
      .slice(0, index)
      .reverse()
      .find((nivel) => nivel.total > 0);

    if (!previous || !previous.liberado) {
      return "Libere o nível anterior primeiro.";
    }

    const missing = Math.max(previous.necessarios - previous.concluidos, 0);
    return `Conclua mais ${missing} ${missing === 1 ? "desafio" : "desafios"} do nível ${previous.nome}.`;
  }

  function levelStatus(trail, nivel, index) {
    if (!nivel.liberado) {
      return { className: "is-locked", label: lockReason(trail, index) };
    }
    if (nivel.concluidos === nivel.total) {
      return { className: "is-done", label: "Nível concluído" };
    }
    return { className: "is-open", label: "Liberado" };
  }

  function renderLevel(trail, nivel, index) {
    if (nivel.total === 0) {
      return "";
    }

    const status = levelStatus(trail, nivel, index);
    const percent = Math.round((nivel.concluidos / nivel.total) * 100);
    const statusIcon =
      status.className === "is-locked"
        ? icon("lock")
        : status.className === "is-done"
          ? icon("check")
          : "";

    return `
      <li class="trail-level ${status.className}">
        <div class="trail-level-header">
          <span class="trail-level-name">${escapeHtml(nivel.nome)}</span>
          <span class="trail-level-count">${nivel.concluidos} de ${nivel.total}</span>
        </div>
        <div class="progress" role="progressbar" aria-label="Progresso no nível ${escapeHtml(nivel.nome)}"
          aria-valuemin="0" aria-valuemax="${nivel.total}" aria-valuenow="${nivel.concluidos}">
          <div class="progress-bar" style="width: ${percent}%"></div>
        </div>
        <p class="trail-level-status">${statusIcon}<span>${escapeHtml(status.label)}</span></p>
      </li>
    `;
  }

  function renderChallengeLink(desafio) {
    const title = escapeHtml(desafio.titulo);
    const type = desafio.tipo === "aberto" ? "Resposta aberta" : "Múltipla escolha";

    if (!desafio.liberado) {
      return `<li class="trail-challenge is-locked">${icon("lock")}<span>${title}</span><span class="trail-challenge-type">${type}</span></li>`;
    }

    const href = `challenges.html?desafio=${encodeURIComponent(desafio.id)}`;
    const action = desafio.concluido
      ? desafio.tipo === "aberto"
        ? "Refazer"
        : "Revisar"
      : "Fazer";

    return `
      <li class="trail-challenge ${desafio.concluido ? "is-done" : ""}">
        ${desafio.concluido ? icon("check") : ""}
        <a href="${href}">${title}</a>
        <span class="trail-challenge-type">${type} · ${action}</span>
      </li>
    `;
  }

  function renderChallengeList(trail) {
    const groups = trail.niveis
      .filter((nivel) => nivel.total > 0)
      .map(
        (nivel) => `
          <h3 class="trail-challenges-level">${escapeHtml(nivel.nome)}</h3>
          <ul class="trail-challenges">${nivel.desafios.map(renderChallengeLink).join("")}</ul>
        `,
      )
      .join("");

    return `
      <details class="trail-details">
        <summary>Ver desafios da trilha</summary>
        ${groups}
      </details>
    `;
  }

  function renderAction(trail) {
    const href = `challenges.html?trilha=${encodeURIComponent(trail.id)}`;

    if (!trail.proximoId) {
      return `<p class="trail-done">${icon("trophy")}<span>Trilha concluída</span></p>`;
    }

    const label = trail.concluidos === 0 ? "Começar trilha" : "Continuar trilha";
    return `<a class="btn btn-primary" href="${href}">${label}<span class="visually-hidden"> de ${escapeHtml(trail.nome)}</span></a>`;
  }

  function renderTrail(trail) {
    const categoryIcon = window.skillUpIcons?.categoryIcon(trail.nome, "category-icon") || "";

    return `
      <article class="dashboard-panel trail-card" aria-labelledby="trilha-${escapeHtml(trail.id)}">
        <div class="trail-card-header">
          <div>
            <h2 id="trilha-${escapeHtml(trail.id)}" class="h4 category-name">${categoryIcon}${escapeHtml(trail.nome)}</h2>
            <p>${escapeHtml(trail.descricao)}</p>
          </div>
          <p class="trail-total"><strong>${trail.concluidos}</strong> de ${trail.total}</p>
        </div>
        <ol class="trail-levels">
          ${trail.niveis.map((nivel, index) => renderLevel(trail, nivel, index)).join("")}
        </ol>
        <div class="trail-actions">${renderAction(trail)}</div>
        ${renderChallengeList(trail)}
      </article>
    `;
  }

  async function loadTrails() {
    if (document.body.dataset.page !== "trails") {
      return;
    }

    if (!window.skillUpAuth.requireSession()) {
      return;
    }

    document.getElementById("logoutBtn")?.addEventListener("click", () => window.logout());

    const list = document.getElementById("trailsList");

    try {
      const { trilhas } = await window.skillUpApi.getTrails();
      list.innerHTML = trilhas.length
        ? trilhas.map(renderTrail).join("")
        : `<p class="dashboard-empty">Nenhuma trilha disponível no momento.</p>`;
    } catch (error) {
      list.innerHTML = `<div class="dashboard-panel"><p class="dashboard-empty">${escapeHtml(error.message || "Não foi possível carregar as trilhas.")}</p></div>`;
    } finally {
      document.getElementById("trailsLoading")?.remove();
    }
  }

  document.addEventListener("DOMContentLoaded", loadTrails);
})();
