(function () {
  let challenges = [];
  let currentChallengeIndex = 0;
  // Modos da página:
  // - ?desafio=ID abre um desafio específico (refazer pelo histórico ou escolher na trilha);
  // - ?trilha=ID segue a trilha de uma competência, do básico ao avançado;
  // - sem parâmetro, o treino livre sorteia entre os desafios liberados.
  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get("desafio");
  const trailId = params.get("trilha");
  let singleMode = false;
  let retryMode = false;
  let trail = null;
  // Aviso de nível recém-liberado, mostrado acima do próximo desafio da trilha.
  let levelNotice = "";

  const DIFFICULTY_LABEL = {
    basico: "Básico",
    intermediario: "Intermediário",
    avancado: "Avançado",
  };

  document.addEventListener("DOMContentLoaded", async () => {
    if (!window.skillUpAuth?.requireSession()) {
      return;
    }

    document.getElementById("logoutBtn")?.addEventListener("click", () => window.logout());

    const nextButton = document.getElementById("nextBtn");
    if (nextButton) {
      nextButton.addEventListener("click", goToNextChallenge);
    }

    await loadChallenges();
  });

  async function loadChallenges() {
    try {
      if (trailId) {
        await loadTrailQueue();
        return;
      }

      const payload = await window.skillUpApi.getChallenges();

      if (requestedId) {
        loadSingleChallenge(payload.challenges.find((item) => item.id === requestedId));
        return;
      }

      loadFreePractice(payload.challenges);
    } catch (error) {
      renderError(`Não foi possível carregar os desafios. ${error.message}`);
    }
  }

  function loadSingleChallenge(requested) {
    singleMode = true;

    if (!requested) {
      renderError("Desafio não encontrado. Ele pode ter sido arquivado.");
      return;
    }

    if (!requested.liberado) {
      renderLockedState(requested);
      return;
    }

    retryMode = requested.tentativas > 0;
    challenges = [requested];
    currentChallengeIndex = 0;
    renderCurrentChallenge();
  }

  // Treino livre: intercala dois fechados e um aberto, só entre os desafios liberados.
  function loadFreePractice(allChallenges) {
    const filtered = allChallenges.filter(
      (challenge) => challenge.liberado && !challenge.completed,
    );
    const closed = filtered.filter((c) => c.tipo === "fechado").sort(() => Math.random() - 0.5);
    const open = filtered.filter((c) => c.tipo === "aberto").sort(() => Math.random() - 0.5);
    challenges = [];
    let ci = 0,
      oi = 0;
    while (ci < closed.length || oi < open.length) {
      if (ci < closed.length) challenges.push(closed[ci++]);
      if (ci < closed.length) challenges.push(closed[ci++]);
      if (oi < open.length) challenges.push(open[oi++]);
    }
    currentChallengeIndex = 0;

    if (!challenges.length) {
      renderFinishedState();
      return;
    }

    renderCurrentChallenge();
  }

  // Trilha: a fila é recalculada a cada desafio, porque responder pode liberar o próximo nível.
  async function loadTrailQueue() {
    const [trailsPayload, challengesPayload] = await Promise.all([
      window.skillUpApi.getTrails(),
      window.skillUpApi.getChallenges(),
    ]);
    const previous = trail;
    trail = trailsPayload.trilhas.find((item) => item.id === trailId) || null;

    if (!trail) {
      renderError("Trilha não encontrada.");
      return;
    }

    levelNotice = describeNewLevels(previous, trail);

    const byId = new Map(challengesPayload.challenges.map((item) => [item.id, item]));
    challenges = trail.niveis
      .flatMap((nivel) => nivel.desafios)
      .filter((desafio) => desafio.liberado && !desafio.concluido)
      .map((desafio) => byId.get(desafio.id))
      .filter(Boolean);
    currentChallengeIndex = 0;

    if (!challenges.length) {
      renderFinishedState();
      return;
    }

    renderCurrentChallenge();
  }

  function describeNewLevels(before, after) {
    if (!before) {
      return "";
    }

    const unlocked = after.niveis.filter(
      (nivel, index) => nivel.liberado && !before.niveis[index]?.liberado,
    );
    return unlocked.length
      ? `Nível ${unlocked.map((nivel) => nivel.nome).join(" e ")} liberado na trilha de ${after.nome}.`
      : "";
  }

  function renderProgress() {
    const el = document.getElementById("challengeProgress");
    if (!el) return;
    const total = challenges.length;
    if (trail) {
      el.textContent = `Trilha ${trail.nome}: ${trail.concluidos} de ${trail.total} concluídos`;
      return;
    }
    if (!total || singleMode) {
      el.textContent = "";
      return;
    }
    el.textContent = `Treino livre: desafio ${currentChallengeIndex + 1} de ${total}`;
  }

  function renderCurrentChallenge() {
    renderProgress();
    const challenge = challenges[currentChallengeIndex];
    const nextButton = document.getElementById("nextBtn");
    const categoryElement = document.getElementById("categoria");
    const questionElement = document.getElementById("pergunta");
    const descriptionElement = document.getElementById("descricao");
    const answersContainer = document.getElementById("respostas");
    const feedbackElement = document.getElementById("feedback");

    if (!challenge || !nextButton || !categoryElement || !questionElement || !descriptionElement) {
      return;
    }

    const level = DIFFICULTY_LABEL[challenge.dificuldade];
    categoryElement.textContent = [challenge.categoria, challenge.titulo, level]
      .filter(Boolean)
      .join(" | ");
    questionElement.textContent = challenge.pergunta;
    descriptionElement.textContent = buildChallengeDescription(challenge);
    answersContainer.innerHTML = "";
    feedbackElement.innerHTML = "";
    nextButton.classList.add("d-none");
    nextButton.textContent = retryMode
      ? "Voltar ao histórico"
      : singleMode
        ? "Voltar às trilhas"
        : "Próximo desafio";

    if (challenge.tipo === "fechado") {
      renderClosedChallenge(challenge, answersContainer);
    } else {
      renderOpenChallenge(challenge, answersContainer);
    }

    renderRetryNotice(challenge, answersContainer);
    renderLevelNotice(answersContainer);
  }

  function renderLevelNotice(container) {
    if (!levelNotice) {
      return;
    }

    const notice = document.createElement("p");
    notice.className = "level-notice";
    notice.setAttribute("role", "status");
    notice.textContent = levelNotice;
    container.prepend(notice);
    levelNotice = "";
  }

  // Aviso antes de refazer: o que a nova tentativa vale.
  function renderRetryNotice(challenge, container) {
    if (!challenge.tentativas) {
      return;
    }

    const notice = document.createElement("p");
    notice.className = "retry-notice";
    notice.textContent =
      challenge.tipo === "aberto"
        ? `Nova tentativa (sua melhor nota: ${challenge.melhorNota}). Você ganha XP só se a nota subir de faixa; a nota das habilidades passa a ser a desta tentativa.`
        : "Revisão: esta resposta não vale XP nem muda a nota do desafio. Serve para rever a situação e o feedback.";
    container.prepend(notice);
  }

  function renderClosedChallenge(challenge, container) {
    const shuffledAnswers = [...challenge.respostas].sort(() => Math.random() - 0.5);

    shuffledAnswers.forEach((answer) => {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "challenge-option";
      button.textContent = answer.texto;
      button.addEventListener("click", async () => {
        await submitClosedChallenge(challenge.id, answer.id);
      });

      container.appendChild(button);
    });
  }

  const MIN_ANSWER_LENGTH = 30;

  function renderOpenChallenge(_challenge, container) {
    container.innerHTML = `
    <p id="aiNotice" class="ai-notice">
      Sua resposta será avaliada por inteligência artificial (OpenAI). Não inclua nomes reais,
      contatos ou outros dados pessoais. A nota é uma estimativa para apoiar seu aprendizado.
      <a href="privacy.html#ia">Saiba mais</a>
    </p>
    <label for="respostaUsuario" class="visually-hidden">Sua resposta</label>
    <textarea
      id="respostaUsuario"
      aria-describedby="aiNotice answerCounter"
      class="form-control challenge-textarea"
      placeholder="Digite sua resposta aqui..."
      maxlength="3000"
    ></textarea>
    <div id="answerCounter" class="answer-counter">
      0 / ${MIN_ANSWER_LENGTH} caracteres mínimos
    </div>
    <button
      id="submitOpenChallenge"
      class="btn btn-primary challenge-submit-btn"
      type="button"
    >
      Enviar resposta
    </button>
  `;

    const textarea = document.getElementById("respostaUsuario");
    const counter = document.getElementById("answerCounter");

    textarea?.addEventListener("input", () => {
      const len = textarea.value.trim().length;
      const ok = len >= MIN_ANSWER_LENGTH;
      counter.textContent = ok
        ? `${len} caracteres`
        : `${len} / ${MIN_ANSWER_LENGTH} caracteres mínimos`;
      counter.classList.toggle("is-ok", ok);
    });

    document.getElementById("submitOpenChallenge")?.addEventListener("click", async (e) => {
      await submitOpenChallenge(e.currentTarget);
    });
  }

  async function submitClosedChallenge(challengeId, answerId) {
    const buttons = document.querySelectorAll(".challenge-option");
    buttons.forEach((button) => {
      button.disabled = true;
    });

    try {
      const payload = await window.skillUpApi.submitChallenge(challengeId, {
        respostaId: answerId,
      });

      window.skillUpAuth?.updateStoredUser(payload.user);
      window.skillUpStudy?.checkAndShowPostBanner(payload.user);
      renderResult(payload.result);
    } catch (error) {
      buttons.forEach((button) => {
        button.disabled = false;
      });
      renderError(error.message);
    }
  }

  async function submitOpenChallenge(button) {
    const challenge = challenges[currentChallengeIndex];
    const feedbackElement = document.getElementById("feedback");
    const textarea = document.getElementById("respostaUsuario");
    const text = textarea?.value.trim() || "";

    if (!challenge || !feedbackElement || !textarea) {
      return;
    }

    if (!text) {
      renderError("Digite uma resposta antes de enviar.");
      return;
    }

    if (text.length < MIN_ANSWER_LENGTH) {
      renderError(`Elabore melhor sua resposta. Mínimo de ${MIN_ANSWER_LENGTH} caracteres.`);
      return;
    }

    button.disabled = true;
    button.textContent = "Analisando...";
    feedbackElement.innerHTML = `
    <div class="feedback-box">
      <div class="ai-loading">
        <div class="ai-loading-dots">
          <span></span><span></span><span></span>
        </div>
        <span class="ai-loading-text">A IA está lendo sua resposta...</span>
      </div>
    </div>
  `;

    try {
      const payload = await window.skillUpApi.submitChallenge(challenge.id, {
        texto: text,
      });

      window.skillUpAuth?.updateStoredUser(payload.user);
      window.skillUpStudy?.checkAndShowPostBanner(payload.user);
      textarea.disabled = true;
      button.classList.add("d-none");
      renderResult(payload.result);
    } catch (error) {
      button.disabled = false;
      button.textContent = "Enviar resposta";
      renderError(error.message);
    }
  }

  // Feedback e consequência vêm do servidor (inclusive da saída da IA): sempre escapar antes de usar em innerHTML.
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderResult(result) {
    const feedbackElement = document.getElementById("feedback");
    const nextButton = document.getElementById("nextBtn");

    if (!feedbackElement || !nextButton) {
      return;
    }

    const badgeXpLines = Array.isArray(result.unlockedBadges)
      ? result.unlockedBadges
          .filter((b) => b.xpBonus > 0)
          .map(
            (b) =>
              `<li><span>Badge: ${escapeHtml(b.name)}</span><strong>+${escapeHtml(b.xpBonus)} XP</strong></li>`,
          )
          .join("")
      : "";

    const breakdownMarkup = Array.isArray(result.xpBreakdown)
      ? result.xpBreakdown
          .map((item) => {
            const signal = item.xp > 0 ? "+" : "";
            return `<li><span>${escapeHtml(item.label)}</span><strong>${signal}${escapeHtml(item.xp)} XP</strong></li>`;
          })
          .join("") + badgeXpLines
      : "";

    const badgesMarkup =
      Array.isArray(result.unlockedBadges) && result.unlockedBadges.length > 0
        ? `
        <div class="result-badges">
          ${result.unlockedBadges
            .map((badge) => `<span class="badge-pill">${escapeHtml(badge.name)}</span>`)
            .join("")}
        </div>
      `
        : "";

    const attemptNote = result.revisao
      ? "Revisão registrada: sem XP, e a nota do desafio continua a da primeira resposta."
      : result.tentativa > 1
        ? result.xpGanho > 0
          ? `Tentativa ${result.tentativa}: você subiu de faixa e ganhou a diferença de XP.`
          : `Tentativa ${result.tentativa}: sem XP, porque a nota não subiu de faixa em relação à sua melhor.`
        : "";

    feedbackElement.innerHTML = `
    <div class="feedback-box">
      <p class="feedback-score">
        ${escapeHtml(getQualityLabel(result.qualityTier))} | Nota: ${escapeHtml(result.nota)} | XP ganho: ${escapeHtml(result.xpGanho)}
      </p>
      ${attemptNote ? `<p class="feedback-attempt-note">${escapeHtml(attemptNote)}</p>` : ""}
      <p>${escapeHtml(result.feedback)}</p>
      ${
        result.evaluator === "heuristic"
          ? `<p class="feedback-evaluator-note">A avaliação por IA não estava disponível agora. Esta nota veio de uma análise automática simplificada.</p>`
          : ""
      }
      <p class="feedback-consequence"><strong>Consequência:</strong> ${escapeHtml(result.consequence)}</p>
      ${breakdownMarkup ? `<ul class="result-breakdown">${breakdownMarkup}</ul>` : ""}
      ${badgesMarkup}
    </div>
    <div id="reflectionSlot" class="mt-3"></div>
  `;

    window.skillUpReflection?.mount(
      document.getElementById("reflectionSlot"),
      { id: result.tentativaId, qualityTier: result.qualityTier },
      null,
      { headingLevel: 2 },
    );

    nextButton.classList.remove("d-none");
  }

  function renderError(message) {
    const feedbackElement = document.getElementById("feedback");

    if (!feedbackElement) {
      return;
    }

    feedbackElement.innerHTML = `
    <div class="feedback-box">
      <p>${escapeHtml(message)}</p>
    </div>
  `;
  }

  function buildChallengeDescription(challenge) {
    const parts = [];

    if (challenge.descricao) {
      parts.push(challenge.descricao);
    }

    // Valores calculados no servidor com as mesmas regras do XP (inclui o multiplicador dos abertos).
    // Numa nova tentativa a regra é outra (só a melhora paga); o aviso de tentativa explica.
    const rewards = challenge.tentativas ? null : challenge.recompensas;
    if (rewards) {
      parts.push(
        `Recompensas: +${rewards.conclusionXp} XP por concluir. Resposta ideal: +${rewards.idealTotalXp} XP no total. ` +
          `Bônus de +${rewards.perfectStreakBonusXp} XP a cada ${rewards.perfectStreakTarget} respostas ideais seguidas.`,
      );
    }

    const skills = (challenge.habilidades || []).map((skill) => skill.nome);
    if (skills.length > 0) {
      parts.push(
        challenge.tipo === "aberto"
          ? `A IA avalia cada habilidade: ${skills.join(", ")}.`
          : `Habilidades trabalhadas: ${skills.join(", ")}.`,
      );
    }

    return parts.join(" ");
  }

  function getQualityLabel(qualityTier) {
    if (qualityTier === "ideal") {
      return "Resposta ideal";
    }

    if (qualityTier === "medium") {
      return "Boa resposta";
    }

    return "Resposta em desenvolvimento";
  }

  function renderFinishedState() {
    const categoryElement = document.getElementById("categoria");
    const questionElement = document.getElementById("pergunta");
    const descriptionElement = document.getElementById("descricao");
    const answersContainer = document.getElementById("respostas");
    const feedbackElement = document.getElementById("feedback");
    const nextButton = document.getElementById("nextBtn");

    if (!categoryElement || !questionElement || !descriptionElement || !answersContainer) {
      return;
    }

    renderProgress();

    if (trail) {
      categoryElement.textContent = "Trilha concluída";
      questionElement.textContent = `Você concluiu a trilha de ${trail.nome}.`;
      descriptionElement.textContent =
        "Escolha outra competência nas trilhas ou refaça os desafios abertos para melhorar suas notas.";
    } else {
      categoryElement.textContent = "Missão concluída";
      questionElement.textContent = "Você respondeu todos os desafios liberados.";
      descriptionElement.textContent =
        "Os próximos níveis abrem conforme você avança em cada trilha. Veja o que falta em Trilhas.";
    }
    answersContainer.innerHTML = "";

    if (feedbackElement) {
      feedbackElement.innerHTML = `
      <div class="feedback-box">
        <p>Quer melhorar uma nota? No <a href="history.html">Histórico</a>, refaça os desafios abertos: a melhora rende XP.</p>
      </div>
    `;
    }

    if (nextButton) {
      nextButton.textContent = "Ver trilhas";
      nextButton.classList.remove("d-none");
      nextButton.onclick = () => {
        window.location.href = "trails.html";
      };
    }
  }

  // Desafio de nível ainda bloqueado (link direto ou trilha desatualizada).
  function renderLockedState(challenge) {
    const level = DIFFICULTY_LABEL[challenge.dificuldade] || "";
    document.getElementById("categoria").textContent = [challenge.categoria, level]
      .filter(Boolean)
      .join(" | ");
    document.getElementById("pergunta").textContent = "Este desafio ainda está bloqueado.";
    document.getElementById("descricao").textContent =
      `Conclua mais desafios do nível anterior da trilha de ${challenge.categoria} para liberar o nível ${level}.`;

    const nextButton = document.getElementById("nextBtn");
    if (nextButton) {
      nextButton.textContent = "Ver trilhas";
      nextButton.classList.remove("d-none");
      nextButton.onclick = () => {
        window.location.href = "trails.html";
      };
    }
  }

  async function goToNextChallenge() {
    if (retryMode) {
      window.location.href = "history.html";
      return;
    }

    if (singleMode) {
      window.location.href = "trails.html";
      return;
    }

    if (trail) {
      try {
        await loadTrailQueue();
      } catch (error) {
        renderError(`Não foi possível carregar a trilha. ${error.message}`);
      }
      return;
    }

    currentChallengeIndex += 1;

    if (currentChallengeIndex >= challenges.length) {
      renderFinishedState();
      return;
    }

    renderCurrentChallenge();
  }
})();
