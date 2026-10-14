(function () {
  let challenges = [];
  let currentChallengeIndex = 0;
  // ?desafio=ID abre um desafio específico (inclusive já respondido) para refazer.
  let retryMode = false;

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
      const payload = await window.skillUpApi.getChallenges();
      const requestedId = new URLSearchParams(window.location.search).get("desafio");
      const requested = payload.challenges.find((challenge) => challenge.id === requestedId);

      if (requested) {
        retryMode = true;
        challenges = [requested];
        currentChallengeIndex = 0;
        renderCurrentChallenge();
        return;
      }

      const filtered = payload.challenges.filter((challenge) => !challenge.completed);
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
    } catch (error) {
      renderError(`Não foi possível carregar os desafios. ${error.message}`);
    }
  }

  function renderProgress() {
    const el = document.getElementById("challengeProgress");
    if (!el) return;
    const total = challenges.length;
    if (!total || retryMode) {
      el.textContent = "";
      return;
    }
    el.textContent = `Desafio ${currentChallengeIndex + 1} de ${total}`;
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

    categoryElement.textContent = challenge.titulo
      ? `${challenge.categoria} | ${challenge.titulo}`
      : challenge.categoria;
    questionElement.textContent = challenge.pergunta;
    descriptionElement.textContent = buildChallengeDescription(challenge);
    answersContainer.innerHTML = "";
    feedbackElement.innerHTML = "";
    nextButton.classList.add("d-none");
    nextButton.textContent = retryMode ? "Voltar ao histórico" : "Próximo desafio";

    if (challenge.tipo === "fechado") {
      renderClosedChallenge(challenge, answersContainer);
    } else {
      renderOpenChallenge(challenge, answersContainer);
    }

    renderRetryNotice(challenge, answersContainer);
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
  `;

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

    const progressEl = document.getElementById("challengeProgress");
    if (progressEl) progressEl.textContent = "";

    categoryElement.textContent = "Missão concluída";
    questionElement.textContent = "Você finalizou todos os desafios disponíveis.";
    descriptionElement.textContent =
      "Volte ao dashboard para acompanhar níveis, badges, avatar e a sua evolução por categoria.";
    answersContainer.innerHTML = "";

    if (feedbackElement) {
      feedbackElement.innerHTML = `
      <div class="feedback-box">
        <p>Quer melhorar uma nota? No <a href="history.html">Histórico</a>, refaça os desafios abertos: a melhora rende XP.</p>
      </div>
    `;
    }

    if (nextButton) {
      nextButton.textContent = "Voltar ao dashboard";
      nextButton.classList.remove("d-none");
      nextButton.onclick = () => {
        window.location.href = "dashboard.html";
      };
    }
  }

  function goToNextChallenge() {
    if (retryMode) {
      window.location.href = "history.html";
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
