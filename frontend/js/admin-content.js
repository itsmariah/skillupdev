(function attachSkillUpAdminContent() {
  const MAX_SKILLS = 3;
  const ANSWER_LEVELS = [
    { xp: 100, label: "Ideal (100 XP)" },
    { xp: 40, label: "Boa (40 XP)" },
    { xp: 5, label: "Fraca (5 XP)" },
  ];

  const state = {
    taxonomy: [],
    difficulties: [],
    challenges: [],
    current: null, // detalhe do desafio em edição (null = novo)
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
    window.skillUpAuth.setFeedback("contentFeedback", message, type);
  }

  function difficultyName(id) {
    return state.difficulties.find((difficulty) => difficulty.id === id)?.nome || "—";
  }

  function skillName(id) {
    for (const competency of state.taxonomy) {
      const skill = competency.habilidades.find((item) => item.id === id);
      if (skill) return skill.nome;
    }
    return id;
  }

  // --- Lista ---

  function statusLabel(item) {
    if (item.status === "arquivado") return "Arquivado";
    if (item.status === "rascunho") return "Rascunho (nunca publicado)";
    return item.hasDraft
      ? `Publicado (v${item.publishedVersion}) · rascunho pendente`
      : `Publicado (v${item.publishedVersion})`;
  }

  function matchesFilters(item) {
    const status = $("filterStatus").value;
    const category = $("filterCategory").value;
    const difficulty = $("filterDifficulty").value;
    const search = $("filterSearch").value.trim().toLowerCase();

    if (status === "pendente" && !(item.status === "publicado" && item.hasDraft)) return false;
    if (status && status !== "pendente" && item.status !== status) return false;
    if (category && item.categoria !== category) return false;
    if (difficulty && item.dificuldade !== difficulty) return false;
    if (search && !String(item.titulo).toLowerCase().includes(search)) return false;
    return true;
  }

  function renderList() {
    const visible = state.challenges.filter(matchesFilters);
    $("listCount").textContent = `${visible.length} de ${state.challenges.length} desafios`;
    $("challengeRows").innerHTML = visible.length
      ? visible
          .map(
            (item) => `
        <tr>
          <td><strong>${escapeHtml(item.titulo)}</strong></td>
          <td>${escapeHtml(item.categoria)}</td>
          <td>${escapeHtml(difficultyName(item.dificuldade))}</td>
          <td>${item.tipo === "aberto" ? "Aberto" : "Múltipla escolha"}</td>
          <td><span class="content-status status-${escapeHtml(item.status)}">${escapeHtml(statusLabel(item))}</span></td>
          <td>${item.attempts}</td>
          <td>
            <button class="btn btn-sm btn-outline-primary" type="button" data-edit="${escapeHtml(item.id)}"
              aria-label="Editar ${escapeHtml(item.titulo)}">Editar</button>
          </td>
        </tr>`,
          )
          .join("")
      : '<tr><td colspan="7">Nenhum desafio com esses filtros.</td></tr>';

    $("challengeRows")
      .querySelectorAll("[data-edit]")
      .forEach((button) => button.addEventListener("click", () => openEditor(button.dataset.edit)));
  }

  async function loadList() {
    const data = await window.skillUpApi.request("/api/admin/challenges");
    state.challenges = data.challenges;
    state.taxonomy = data.competencias;
    state.difficulties = data.dificuldades;
    renderList();
  }

  // --- Editor ---

  function selectedType() {
    return document.querySelector('input[name="tipo"]:checked').value;
  }

  function renderSkillOptions(selected = []) {
    $("skillOptions").innerHTML = state.taxonomy
      .map(
        (competency) => `
      <div class="skill-group">
        <p class="skill-group-title">${escapeHtml(competency.nome)}</p>
        ${competency.habilidades
          .map(
            (skill) => `
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="skill-${skill.id}" value="${skill.id}"
              ${selected.includes(skill.id) ? "checked" : ""}>
            <label class="form-check-label" for="skill-${skill.id}" title="${escapeHtml(skill.descricao)}">
              ${escapeHtml(skill.nome)}
            </label>
          </div>`,
          )
          .join("")}
      </div>`,
      )
      .join("");
    enforceSkillLimit();
  }

  // Com 3 marcadas, as outras ficam indisponíveis.
  function enforceSkillLimit() {
    const boxes = [...$("skillOptions").querySelectorAll('input[type="checkbox"]')];
    const full = boxes.filter((box) => box.checked).length >= MAX_SKILLS;
    boxes.forEach((box) => {
      box.disabled = full && !box.checked;
    });
  }

  function renderAnswerFields(answers = []) {
    const rows = [0, 1, 2].map(
      (index) => answers[index] || { texto: "", feedback: "", xp: ANSWER_LEVELS[index].xp },
    );
    $("answerFields").innerHTML = rows
      .map(
        (answer, index) => `
      <fieldset class="answer-fieldset">
        <legend class="fs-6">Alternativa ${index + 1}</legend>
        <div class="mb-2">
          <label class="form-label" for="answerText${index}">Texto</label>
          <input id="answerText${index}" class="form-control" maxlength="300" value="${escapeHtml(answer.texto)}">
        </div>
        <div class="mb-2">
          <label class="form-label" for="answerFeedback${index}">Feedback</label>
          <textarea id="answerFeedback${index}" class="form-control" rows="2" maxlength="500">${escapeHtml(answer.feedback)}</textarea>
        </div>
        <div>
          <label class="form-label" for="answerXp${index}">Nível</label>
          <select id="answerXp${index}" class="form-select">
            ${ANSWER_LEVELS.map(
              (level) =>
                `<option value="${level.xp}" ${Number(answer.xp) === level.xp ? "selected" : ""}>${level.label}</option>`,
            ).join("")}
          </select>
        </div>
      </fieldset>`,
      )
      .join("");
  }

  function toggleTypeFields() {
    $("answersField").classList.toggle("d-none", selectedType() !== "fechado");
  }

  function readForm() {
    const content = {
      categoria: $("fieldCategoria").value,
      dificuldade: $("fieldDificuldade").value,
      titulo: $("fieldTitulo").value,
      pergunta: $("fieldPergunta").value,
      descricao: $("fieldDescricao").value,
      dica: $("fieldDica").value,
      habilidades: [...$("skillOptions").querySelectorAll("input:checked")].map((box) => box.value),
    };

    if (selectedType() === "fechado") {
      content.respostas = [0, 1, 2].map((index) => ({
        texto: $(`answerText${index}`).value,
        feedback: $(`answerFeedback${index}`).value,
        xp: Number($(`answerXp${index}`).value),
      }));
    }

    return content;
  }

  function fillForm(tipo, content) {
    document.querySelector(`input[name="tipo"][value="${tipo}"]`).checked = true;
    $("fieldCategoria").value = content?.categoria || state.taxonomy[0]?.nome || "";
    $("fieldDificuldade").value = content?.dificuldade || "basico";
    $("fieldTitulo").value = content?.titulo || "";
    $("fieldPergunta").value = content?.pergunta || "";
    $("fieldDescricao").value = content?.descricao || "";
    $("fieldDica").value = content?.dica || "";
    renderSkillOptions(content?.habilidades || []);
    renderAnswerFields(content?.respostas || []);
    toggleTypeFields();
    renderPreview();
  }

  function renderPreview() {
    const content = readForm();
    const tipo = selectedType();
    const skills = content.habilidades.map(skillName);
    const answers =
      tipo === "fechado"
        ? `<ul class="content-preview-answers">${content.respostas
            .map(
              (answer) =>
                `<li>${escapeHtml(answer.texto) || "<em>(alternativa sem texto)</em>"}</li>`,
            )
            .join("")}</ul>`
        : '<div class="content-preview-textarea">Campo de resposta aberta</div>';

    $("preview").innerHTML = `
      <p class="challenge-category mb-1">${escapeHtml(content.categoria)}${content.titulo ? ` | ${escapeHtml(content.titulo)}` : ""}</p>
      <p class="form-hint mb-2">Nível: ${escapeHtml(difficultyName(content.dificuldade))}</p>
      <p class="content-preview-question">${escapeHtml(content.pergunta) || "<em>(cenário)</em>"}</p>
      ${content.descricao ? `<p>${escapeHtml(content.descricao)}</p>` : ""}
      ${skills.length ? `<p class="form-hint">${tipo === "aberto" ? "A IA avalia cada habilidade" : "Habilidades trabalhadas"}: ${escapeHtml(skills.join(", "))}.</p>` : ""}
      ${answers}
    `;
  }

  function renderEditorState() {
    const current = state.current;
    const isNew = !current;

    $("editorTitle").textContent = isNew ? "Novo desafio" : "Editar desafio";
    document.querySelectorAll('input[name="tipo"]').forEach((radio) => {
      radio.disabled = !isNew;
    });

    $("publishBtn").disabled = isNew || !current.draft;
    $("discardBtn").disabled = isNew || !current.draft;
    $("archiveBtn").classList.toggle("d-none", isNew || !current.publishedVersion);
    $("archiveBtn").textContent = current?.status === "arquivado" ? "Restaurar" : "Arquivar";

    $("editorStatus").textContent = isNew
      ? "Ao salvar, o desafio fica como rascunho e só aparece depois de publicado."
      : [
          current.status === "arquivado"
            ? "Arquivado: não aparece para ninguém."
            : current.publishedVersion
              ? `Publicado na versão ${current.publishedVersion}.`
              : "Ainda não publicado.",
          current.draft ? `Editando o rascunho da versão ${current.draft.version}.` : "",
          current.attempts ? `${current.attempts} tentativa(s) registradas.` : "",
        ]
          .filter(Boolean)
          .join(" ");

    const badges = current?.badgesDependentes || [];
    $("badgeWarning").classList.toggle("d-none", badges.length === 0);
    $("badgeWarning").textContent = badges.length
      ? `Atenção: a badge ${badges.map((badge) => `"${badge.name}"`).join(", ")} depende deste desafio. Arquivá-lo torna a badge inalcançável.`
      : "";

    $("versionsPanel").classList.toggle("d-none", isNew);
    $("versionList").innerHTML = isNew
      ? ""
      : current.versions
          .map((version) => {
            const when = new Date(version.publishedAt || version.createdAt).toLocaleString("pt-BR");
            const label = version.isPublished
              ? "publicada (atual)"
              : version.publishedAt
                ? "publicada"
                : "rascunho";
            return `<li>Versão ${version.version}: ${label} · ${escapeHtml(when)}${version.createdBy ? ` · ${escapeHtml(version.createdBy)}` : ""}</li>`;
          })
          .join("");
  }

  function showErrors(errors) {
    const box = $("editorErrors");
    if (!errors?.length) {
      box.classList.add("d-none");
      box.innerHTML = "";
      return;
    }
    box.innerHTML = `<p class="mb-1"><strong>Corrija antes de salvar:</strong></p><ul class="mb-0">${errors
      .map((error) => `<li>${escapeHtml(error)}</li>`)
      .join("")}</ul>`;
    box.classList.remove("d-none");
    box.focus();
  }

  function showView(view) {
    $("listView").classList.toggle("d-none", view !== "list");
    $("editorView").classList.toggle("d-none", view !== "editor");
    window.skillUpAuth.clearFeedback("contentFeedback");
  }

  async function openEditor(id) {
    showErrors(null);
    state.current = null;

    if (id) {
      const data = await window.skillUpApi.request(
        `/api/admin/challenges/${encodeURIComponent(id)}`,
      );
      state.current = data.challenge;
      fillForm(state.current.tipo, state.current.draft?.content || state.current.published);
    } else {
      fillForm("aberto", null);
    }

    renderEditorState();
    showView("editor");
    $("fieldTitulo").focus();
  }

  async function saveDraft() {
    showErrors(null);
    const content = readForm();

    try {
      const data = state.current
        ? await window.skillUpApi.request(
            `/api/admin/challenges/${encodeURIComponent(state.current.id)}/draft`,
            {
              method: "PUT",
              body: { content },
            },
          )
        : await window.skillUpApi.request("/api/admin/challenges", {
            method: "POST",
            body: { tipo: selectedType(), content },
          });
      state.current = data.challenge;
      renderEditorState();
      return true;
    } catch (error) {
      showErrors(error.payload?.errors || [error.message]);
      return false;
    }
  }

  async function runAction(path, method = "POST") {
    const data = await window.skillUpApi.request(
      `/api/admin/challenges/${encodeURIComponent(state.current.id)}${path}`,
      { method },
    );
    if (data.challenge) {
      state.current = data.challenge;
      renderEditorState();
    }
    return data;
  }

  async function handleSave(event) {
    event.preventDefault();
    if (await saveDraft()) {
      setFeedback("Rascunho salvo. Ele só aparece para as pessoas depois de publicado.");
    }
  }

  async function handlePublish() {
    if (!(await saveDraft())) return;
    try {
      await runAction("/publish");
      setFeedback(`Versão ${state.current.publishedVersion} publicada.`);
    } catch (error) {
      setFeedback(error.message, "danger");
    }
  }

  async function handleDiscard() {
    if (!confirm("Descartar o rascunho? As alterações não publicadas serão perdidas.")) return;
    try {
      const data = await runAction("/draft", "DELETE");
      if (!data.challenge) {
        await backToList(data.message);
        return;
      }
      fillForm(state.current.tipo, state.current.published);
      setFeedback("Rascunho descartado.");
    } catch (error) {
      setFeedback(error.message, "danger");
    }
  }

  async function handleArchive() {
    const archiving = state.current.status !== "arquivado";
    const badges = state.current.badgesDependentes || [];
    const warning =
      archiving && badges.length
        ? `\n\nA badge ${badges.map((badge) => `"${badge.name}"`).join(", ")} ficará inalcançável.`
        : "";
    const question = archiving
      ? `Arquivar este desafio? Ele sai da lista, mas tentativas, XP e histórico de quem respondeu continuam.${warning}`
      : "Restaurar este desafio? Ele volta a aparecer para todos.";
    if (!confirm(question)) return;

    try {
      await runAction(archiving ? "/archive" : "/unarchive");
      setFeedback(archiving ? "Desafio arquivado." : "Desafio restaurado.");
    } catch (error) {
      setFeedback(error.message, "danger");
    }
  }

  async function backToList(message) {
    await loadList();
    showView("list");
    if (message) setFeedback(message);
  }

  async function init() {
    if (document.body.dataset.page !== "admin-content") return;
    if (!window.skillUpAuth?.requireSession()) return;
    if (window.skillUpApi.getStoredUser()?.role !== "admin") {
      window.location.href = "dashboard.html";
      return;
    }

    $("logoutBtn").addEventListener("click", () => window.logout());
    $("newChallengeBtn").addEventListener("click", () => openEditor(null));
    $("backToListBtn").addEventListener("click", () => backToList());
    $("listFilters").addEventListener("input", renderList);
    $("challengeForm").addEventListener("submit", handleSave);
    $("challengeForm").addEventListener("input", renderPreview);
    $("challengeForm").addEventListener("change", (event) => {
      if (event.target.name === "tipo") toggleTypeFields();
      if (event.target.closest("#skillOptions")) enforceSkillLimit();
      renderPreview();
    });
    $("publishBtn").addEventListener("click", handlePublish);
    $("discardBtn").addEventListener("click", handleDiscard);
    $("archiveBtn").addEventListener("click", handleArchive);

    try {
      await loadList();
      const categories = state.taxonomy.map((competency) => competency.nome);
      $("fieldCategoria").innerHTML = categories
        .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
        .join("");
      const difficultyOptions = state.difficulties
        .map(
          (difficulty) =>
            `<option value="${escapeHtml(difficulty.id)}">${escapeHtml(difficulty.nome)}</option>`,
        )
        .join("");
      $("fieldDificuldade").innerHTML = difficultyOptions;
      $("filterDifficulty").innerHTML += difficultyOptions;
      $("filterCategory").innerHTML += categories
        .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
        .join("");
    } catch (error) {
      setFeedback(error.message, "danger");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
