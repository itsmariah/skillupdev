(function () {
let challenges = [];
let currentChallengeIndex = 0;

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
    const filtered = payload.challenges.filter((challenge) => !challenge.completed);
    const closed = filtered.filter((c) => c.tipo === "fechado").sort(() => Math.random() - 0.5);
    const open = filtered.filter((c) => c.tipo === "aberto").sort(() => Math.random() - 0.5);
    challenges = [];
    let ci = 0, oi = 0;
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
  if (!total) { el.textContent = ""; return; }
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
  nextButton.textContent = "Próximo desafio";

  if (challenge.tipo === "fechado") {
    renderClosedChallenge(challenge, answersContainer);
    return;
  }

  renderOpenChallenge(challenge, answersContainer);
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
    <textarea
      id="respostaUsuario"
      class="form-control challenge-textarea"
      placeholder="Digite sua resposta aqui..."
      maxlength="3000"
    ></textarea>
    <div id="answerCounter" style="font-size:0.78rem;color:#9ca3af;text-align:right;margin-top:4px;">
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
  const counter  = document.getElementById("answerCounter");

  textarea?.addEventListener("input", () => {
    const len = textarea.value.trim().length;
    const ok  = len >= MIN_ANSWER_LENGTH;
    counter.textContent = ok
      ? `${len} caracteres`
      : `${len} / ${MIN_ANSWER_LENGTH} caracteres mínimos`;
    counter.style.color = ok ? "#10b981" : "#9ca3af";
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
      <p>Analisando sua resposta...</p>
    </div>
  `;

  try {
    const payload = await window.skillUpApi.submitChallenge(challenge.id, {
      texto: text,
    });

    window.skillUpAuth?.updateStoredUser(payload.user);
    textarea.disabled = true;
    button.classList.add("d-none");
    renderResult(payload.result);
  } catch (error) {
    button.disabled = false;
    button.textContent = "Enviar resposta";
    renderError(error.message);
  }
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
        .map((b) => `<li><span>Badge: ${b.name}</span><strong>+${b.xpBonus} XP</strong></li>`)
        .join("")
    : "";

  const breakdownMarkup = Array.isArray(result.xpBreakdown)
    ? result.xpBreakdown
        .map((item) => {
          const signal = item.xp > 0 ? "+" : "";
          return `<li><span>${item.label}</span><strong>${signal}${item.xp} XP</strong></li>`;
        })
        .join("") + badgeXpLines
    : "";

  const badgesMarkup =
    Array.isArray(result.unlockedBadges) && result.unlockedBadges.length > 0
      ? `
        <div class="result-badges">
          ${result.unlockedBadges
            .map((badge) => `<span class="badge-pill">${badge.name}</span>`)
            .join("")}
        </div>
      `
      : "";

  feedbackElement.innerHTML = `
    <div class="feedback-box">
      <p class="feedback-score">
        ${getQualityLabel(result.qualityTier)} | Nota: ${result.nota} | XP ganho: ${result.xpGanho}
      </p>
      <p>${result.feedback}</p>
      <p class="feedback-consequence"><strong>Consequência:</strong> ${result.consequence}</p>
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
      <p>${message}</p>
    </div>
  `;
}

function buildChallengeDescription(challenge) {
  const parts = [];

  if (challenge.descricao) {
    parts.push(challenge.descricao);
  }

  if (challenge.tipo === "fechado") {
    parts.push(
      "Recompensas: +40 XP por concluir. Resposta ideal: +100 XP total. Bônus de +80 XP a cada 5 respostas ideais seguidas."
    );
  } else {
    parts.push(
      "Recompensas: +48 XP por concluir. Resposta ideal: +120 XP total. Bônus de +80 XP a cada 5 respostas ideais seguidas."
    );
  }

  if (challenge.tipo === "aberto" && Array.isArray(challenge.criteriosAvaliacao)) {
    const criteria = challenge.criteriosAvaliacao.filter(Boolean);
    if (criteria.length > 0) {
      parts.push(`IA avalia: ${criteria.join(", ")}.`);
    }
  }

  if (challenge.tipo === "fechado" && challenge.dica) {
    parts.push(`Dica: ${challenge.dica}`);
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
        <p>Agora é um bom momento para revisar badges desbloqueadas e personalizar o avatar.</p>
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
  currentChallengeIndex += 1;

  if (currentChallengeIndex >= challenges.length) {
    renderFinishedState();
    return;
  }

  renderCurrentChallenge();
}
})();
