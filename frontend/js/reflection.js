// Diário de reflexão: campo opcional depois do feedback de uma tentativa. Usado na página do
// desafio (logo após o resultado) e no Histórico (para escrever ou editar depois).
(function attachSkillUpReflection() {
  const MAX_LENGTH = 1000;

  // A pergunta muda conforme o resultado: consolidar o que deu certo ou planejar o ajuste.
  function promptFor(qualityTier) {
    return qualityTier === "ideal"
      ? "O que fez essa resposta funcionar e como você levaria isso para o seu trabalho?"
      : "O que você faria diferente numa próxima vez?";
  }

  function formatSavedAt(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  // container: elemento onde o diário é montado. attempt: { id, qualityTier, reflexao, reflexaoEm }.
  // onSaved(reflexao, reflexaoEm): avisa a página para atualizar o próprio estado.
  // headingLevel: nível do título, para seguir a hierarquia da página (padrão: h3).
  function mount(container, attempt, onSaved, { headingLevel = 3 } = {}) {
    if (!container || !attempt?.id) {
      return;
    }

    const fieldId = `reflection-${attempt.id}`;
    const hintId = `${fieldId}-hint`;
    const statusId = `${fieldId}-status`;

    container.innerHTML = `
      <form class="reflection-box" novalidate>
        <h${headingLevel} class="history-subtitle">Diário de reflexão</h${headingLevel}>
        <label class="reflection-prompt" for="${fieldId}">${promptFor(attempt.qualityTier)}</label>
        <textarea id="${fieldId}" class="form-control" rows="3" maxlength="${MAX_LENGTH}"
          aria-describedby="${hintId}"></textarea>
        <p id="${hintId}" class="form-hint">
          Opcional e privado: só você vê. <span class="reflection-counter"></span>
        </p>
        <div class="d-flex align-items-center gap-3 flex-wrap">
          <button class="btn btn-sm btn-outline-primary" type="submit">Salvar reflexão</button>
          <span id="${statusId}" class="reflection-status" role="status"></span>
        </div>
      </form>
    `;

    const form = container.querySelector("form");
    const textarea = container.querySelector("textarea");
    const counter = container.querySelector(".reflection-counter");
    const status = container.querySelector(".reflection-status");
    const button = container.querySelector("button");

    textarea.value = attempt.reflexao || "";
    const updateCounter = () => {
      counter.textContent = `${textarea.value.length}/${MAX_LENGTH} caracteres.`;
    };
    updateCounter();
    if (attempt.reflexaoEm) {
      status.textContent = `Salva em ${formatSavedAt(attempt.reflexaoEm)}.`;
    }

    textarea.addEventListener("input", () => {
      updateCounter();
      status.textContent = "";
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      button.disabled = true;
      status.textContent = "Salvando...";

      try {
        const payload = await window.skillUpApi.saveReflection(attempt.id, textarea.value);
        status.textContent = payload.reflexao
          ? `Salva em ${formatSavedAt(payload.reflexaoEm)}.`
          : "Reflexão apagada.";
        onSaved?.(payload.reflexao, payload.reflexaoEm);
      } catch (error) {
        status.textContent = error.message || "Não foi possível salvar.";
      } finally {
        button.disabled = false;
      }
    });
  }

  window.skillUpReflection = { mount, promptFor };
})();
