(function attachSkillUpAdminBadges() {
  const RARITY_LABEL = { comum: "Comum", raro: "Raro", epico: "Épico", lendario: "Lendário" };

  const state = {
    badges: [],
    ruleTypes: [],
    competencies: [],
    difficulties: [],
    challenges: [],
    xpByRarity: {},
    current: null, // badge em edição (null = nova)
  };

  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setFeedback(message, type = "success") {
    window.skillUpAuth.setFeedback("badgeFeedback", message, type);
  }

  const ruleType = (tipo) => state.ruleTypes.find((type) => type.tipo === tipo);
  const difficultyName = (id) =>
    state.difficulties.find((difficulty) => difficulty.id === id)?.nome || id;
  const challengeTitle = (id) => state.challenges.find((item) => item.id === id)?.titulo || id;

  // Resumo legível da regra, para a lista.
  function describeRule(rule) {
    const type = ruleType(rule?.tipo);
    if (!type) return "Regra desconhecida";

    const details = [];
    if (rule.quantidade) details.push(`${rule.quantidade}`);
    if (rule.nivel) details.push(`nível ${rule.nivel}`);
    if (rule.competencia) details.push(rule.competencia);
    if (rule.dificuldade) details.push(difficultyName(rule.dificuldade));
    if (rule.desafios) details.push(rule.desafios.map(challengeTitle).join(", "));

    return details.length ? `${type.nome}: ${details.join(" · ")}` : type.nome;
  }

  // --- Lista ---

  function renderList() {
    const filter = $("filterActive").value;
    const visible = state.badges.filter(
      (badge) => !filter || (filter === "ativa" ? badge.active : !badge.active),
    );

    $("listCount").textContent = `${visible.length} de ${state.badges.length} badges`;
    $("badgeRows").innerHTML = visible.length
      ? visible
          .map(
            (badge) => `
        <tr>
          <td><strong>${escapeHtml(badge.name)}</strong></td>
          <td>${escapeHtml(describeRule(badge.rule))}</td>
          <td>${escapeHtml(RARITY_LABEL[badge.rarity] || badge.rarity)} (+${escapeHtml(state.xpByRarity[badge.rarity] ?? 0)} XP)</td>
          <td><span class="content-status status-${badge.active ? "publicado" : "arquivado"}">${badge.active ? "Ativa" : "Desativada"}</span></td>
          <td>${badge.earnedCount}</td>
          <td><button class="btn btn-sm btn-outline-primary" type="button" data-edit="${escapeHtml(badge.id)}">Editar<span class="visually-hidden"> ${escapeHtml(badge.name)}</span></button></td>
        </tr>`,
          )
          .join("")
      : `<tr><td colspan="6">Nenhuma badge com esse filtro.</td></tr>`;
  }

  async function loadList() {
    const data = await window.skillUpApi.request("/api/admin/badges");
    state.badges = data.badges;
    state.ruleTypes = data.regras.tipos;
    state.competencies = data.regras.competencias;
    state.difficulties = data.regras.dificuldades;
    state.challenges = data.desafios;
    state.xpByRarity = data.xpPorRaridade;
    renderList();
  }

  // --- Editor ---

  function showView(view) {
    $("listView").classList.toggle("d-none", view !== "list");
    $("editorView").classList.toggle("d-none", view !== "editor");
    $("newBadgeBtn").classList.toggle("d-none", view !== "list");
  }

  function options(items, selected, { emptyLabel } = {}) {
    const empty =
      emptyLabel !== undefined ? `<option value="">${escapeHtml(emptyLabel)}</option>` : "";
    return (
      empty +
      items
        .map(
          ({ value, label }) =>
            `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`,
        )
        .join("")
    );
  }

  // Campo de cada parâmetro do tipo de regra escolhido.
  function renderParamField(param, value) {
    const id = `param-${param.name}`;
    const optional = param.required ? "" : " (opcional)";
    const label = `<label for="${id}" class="form-label">${escapeHtml(param.label)}${optional}</label>`;

    if (param.kind === "inteiro") {
      return `<div class="mb-3">${label}<input id="${id}" data-param="${param.name}" type="number" class="form-control" min="${param.min}" max="${param.max}" step="1" value="${escapeHtml(value ?? "")}" ${param.required ? "required" : ""}></div>`;
    }

    if (param.kind === "competencia") {
      const items = state.competencies.map((name) => ({ value: name, label: name }));
      const emptyLabel = param.required ? undefined : "Qualquer competência";
      return `<div class="mb-3">${label}<select id="${id}" data-param="${param.name}" class="form-select">${options(items, value, { emptyLabel })}</select></div>`;
    }

    if (param.kind === "dificuldade") {
      const items = state.difficulties.map((difficulty) => ({
        value: difficulty.id,
        label: difficulty.nome,
      }));
      const emptyLabel = param.required ? undefined : "Qualquer nível";
      return `<div class="mb-3">${label}<select id="${id}" data-param="${param.name}" class="form-select">${options(items, value, { emptyLabel })}</select></div>`;
    }

    if (param.kind === "desafios") {
      const chosen = new Set(value || []);
      const groups = state.competencies
        .map((categoria) => {
          const items = state.challenges.filter((item) => item.categoria === categoria);
          if (!items.length) return "";
          return `<optgroup label="${escapeHtml(categoria)}">${items
            .map(
              (item) =>
                `<option value="${escapeHtml(item.id)}" ${chosen.has(item.id) ? "selected" : ""}>${escapeHtml(item.titulo)}${item.status === "publicado" ? "" : " (não publicado)"}</option>`,
            )
            .join("")}</optgroup>`;
        })
        .join("");
      return `<div class="mb-3">${label}<select id="${id}" data-param="${param.name}" class="form-select" multiple size="8" aria-describedby="${id}-hint">${groups}</select><p id="${id}-hint" class="form-hint">Segure Ctrl (ou Cmd) para escolher mais de um. Até 10.</p></div>`;
    }

    return "";
  }

  function renderRuleParams(rule = {}) {
    const type = ruleType($("fieldRuleType").value);
    $("ruleTypeHint").textContent = type?.descricao || "";
    $("ruleParams").innerHTML = (type?.params || [])
      .map((param) => renderParamField(param, rule[param.name]))
      .join("");
  }

  function readRule() {
    const rule = { tipo: $("fieldRuleType").value };
    for (const field of $("ruleParams").querySelectorAll("[data-param]")) {
      if (field.multiple) {
        rule[field.dataset.param] = [...field.selectedOptions].map((option) => option.value);
      } else if (field.value !== "") {
        rule[field.dataset.param] = field.type === "number" ? Number(field.value) : field.value;
      }
    }
    return rule;
  }

  function readForm() {
    return {
      name: $("fieldName").value,
      description: $("fieldDescription").value,
      rarity: $("fieldRarity").value,
      rule: readRule(),
    };
  }

  function renderPreview() {
    const { name, description, rarity } = readForm();
    $("preview").innerHTML = `
      <article class="badge-card unlocked rarity-${escapeHtml(rarity)}">
        <div class="badge-mark" aria-hidden="true">${escapeHtml(name.trim().charAt(0) || "?")}</div>
        <div class="badge-body">
          <h3 class="h4">${escapeHtml(name.trim() || "Nome da badge")}</h3>
          <p>${escapeHtml(description.trim() || "Descrição da badge.")}</p>
          <div class="badge-footer">
            <span class="badge-rarity rarity-${escapeHtml(rarity)}">${escapeHtml(RARITY_LABEL[rarity] || rarity)}</span>
            <span class="badge-status">+${escapeHtml(state.xpByRarity[rarity] ?? 0)} XP</span>
          </div>
        </div>
      </article>
    `;
  }

  function renderEditorStatus() {
    const badge = state.current;
    const toggle = $("toggleActiveBtn");

    if (!badge) {
      $("editorTitle").textContent = "Nova badge";
      $("editorStatus").textContent = "Ela é criada desativada. Revise e ative quando quiser.";
      toggle.classList.add("d-none");
      return;
    }

    $("editorTitle").textContent = badge.name;
    $("editorStatus").textContent =
      `${badge.active ? "Ativa" : "Desativada"} · conquistada por ${badge.earnedCount} ${badge.earnedCount === 1 ? "pessoa" : "pessoas"}`;
    toggle.classList.remove("d-none");
    toggle.textContent = badge.active ? "Desativar" : "Ativar";
    toggle.className = `btn ${badge.active ? "btn-outline-danger" : "btn-success"}`;
  }

  function openEditor(badge) {
    state.current = badge;
    $("editorErrors").classList.add("d-none");
    $("fieldName").value = badge?.name || "";
    $("fieldDescription").value = badge?.description || "";
    $("fieldRarity").value = badge?.rarity || "comum";
    $("fieldRuleType").value = badge?.rule?.tipo || state.ruleTypes[0].tipo;
    renderRuleParams(badge?.rule || {});
    renderEditorStatus();
    renderPreview();
    showView("editor");
    $("fieldName").focus();
  }

  function showErrors(error) {
    const box = $("editorErrors");
    const errors = error.payload?.errors;
    box.innerHTML = errors?.length
      ? `<p class="mb-1">${escapeHtml(error.message)}</p><ul class="mb-0">${errors.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : escapeHtml(error.message);
    box.classList.remove("d-none");
    box.focus();
  }

  async function handleSave(event) {
    event.preventDefault();
    $("editorErrors").classList.add("d-none");

    try {
      const data = state.current
        ? await window.skillUpApi.request(
            `/api/admin/badges/${encodeURIComponent(state.current.id)}`,
            { method: "PUT", body: readForm() },
          )
        : await window.skillUpApi.request("/api/admin/badges", {
            method: "POST",
            body: readForm(),
          });
      state.current = data.badge;
      renderEditorStatus();
      setFeedback(
        data.badge.active
          ? "Badge salva. Quem já cumpre a regra recebe a badge na próxima resposta ou no próximo acesso do dia."
          : "Badge salva (desativada).",
      );
    } catch (error) {
      showErrors(error);
    }
  }

  async function handleToggleActive() {
    const badge = state.current;
    if (!badge) return;

    const question = badge.active
      ? "Desativar esta badge? Quem já ganhou continua com ela; ninguém mais pode conquistá-la."
      : "Ativar esta badge? Ela passa a aparecer para todos, e quem já cumpre a regra recebe o XP bônus.";
    if (!confirm(question)) return;

    try {
      const data = await window.skillUpApi.request(
        `/api/admin/badges/${encodeURIComponent(badge.id)}/${badge.active ? "deactivate" : "activate"}`,
        { method: "POST" },
      );
      state.current = data.badge;
      renderEditorStatus();
      setFeedback(data.badge.active ? "Badge ativada." : "Badge desativada.");
    } catch (error) {
      setFeedback(error.message, "danger");
    }
  }

  async function backToList() {
    await loadList();
    showView("list");
  }

  async function init() {
    if (document.body.dataset.page !== "admin-badges") return;
    if (!window.skillUpAuth?.requireSession()) return;
    if (window.skillUpApi.getStoredUser()?.role !== "admin") {
      window.location.href = "dashboard.html";
      return;
    }

    $("logoutBtn").addEventListener("click", () => window.logout());
    $("newBadgeBtn").addEventListener("click", () => openEditor(null));
    $("backToListBtn").addEventListener("click", backToList);
    $("listFilters").addEventListener("input", renderList);
    $("badgeRows").addEventListener("click", (event) => {
      const id = event.target.closest("[data-edit]")?.dataset.edit;
      if (id) openEditor(state.badges.find((badge) => badge.id === id));
    });
    $("badgeForm").addEventListener("submit", handleSave);
    $("badgeForm").addEventListener("input", renderPreview);
    $("fieldRuleType").addEventListener("change", () => renderRuleParams());
    $("toggleActiveBtn").addEventListener("click", handleToggleActive);

    try {
      await loadList();
      $("fieldRarity").innerHTML = options(
        Object.keys(state.xpByRarity).map((rarity) => ({
          value: rarity,
          label: `${RARITY_LABEL[rarity] || rarity} (+${state.xpByRarity[rarity]} XP)`,
        })),
      );
      $("fieldRuleType").innerHTML = options(
        state.ruleTypes.map((type) => ({ value: type.tipo, label: type.nome })),
      );
    } catch (error) {
      setFeedback(error.message, "danger");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
