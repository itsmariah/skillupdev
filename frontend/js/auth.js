(function attachSkillUpAuth() {
  const DAILY_REWARD_KEY = "skillup_last_daily_reward";
  let dashboardUser = null;

  function setFeedback(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (!element) {
      return;
    }

    element.className = `alert alert-${type}`;
    element.textContent = message;
    element.classList.remove("d-none");
  }

  function clearFeedback(elementId) {
    const element = document.getElementById(elementId);
    if (!element) {
      return;
    }

    element.textContent = "";
    element.className = "alert d-none";
  }

  function updateStoredUser(user) {
    if (!user) {
      return;
    }

    window.localStorage.setItem("userName", user.nome || "Dev");
    window.localStorage.setItem("xp", String(user.xp || 0));
    window.localStorage.setItem("nivel", String(user.level || 1));
    window.localStorage.setItem("skillup_user", JSON.stringify(user));
  }

  function setElementText(elementId, message) {
    const element = document.getElementById(elementId);
    if (!element) {
      return;
    }

    element.textContent = message;
  }

  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name) || "";
  }

  function formatDateTime(dateValue) {
    const parsedDate = new Date(dateValue);

    if (Number.isNaN(parsedDate.getTime())) {
      return "";
    }

    return parsedDate.toLocaleString("pt-BR");
  }

  function setFormAvailability(formId, enabled) {
    const form = document.getElementById(formId);
    if (!form) {
      return;
    }

    Array.from(form.elements || []).forEach((field) => {
      field.disabled = !enabled;
    });
  }

  function hideForgotPasswordPreview() {
    const preview = document.getElementById("forgotPasswordPreview");
    if (!preview) {
      return;
    }

    preview.classList.add("d-none");
    setElementText("forgotPasswordPreviewLink", "");
    setElementText("forgotPasswordPreviewExpiry", "");
  }

  function renderForgotPasswordPreview(payload) {
    const preview = document.getElementById("forgotPasswordPreview");
    const previewLink = document.getElementById("forgotPasswordPreviewLink");
    const previewExpiry = document.getElementById("forgotPasswordPreviewExpiry");

    if (!preview || !previewLink || !payload?.previewResetUrl) {
      hideForgotPasswordPreview();
      return;
    }

    previewLink.href = payload.previewResetUrl;
    previewLink.textContent = "Abrir tela de redefinicao";
    previewExpiry.textContent = payload.previewExpiresAt
      ? `Link de teste valido ate ${formatDateTime(payload.previewExpiresAt)}.`
      : "";
    preview.classList.remove("d-none");
  }

  function togglePassword(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);

    if (!input || !icon) {
      return;
    }

    const shouldShowPassword = input.type === "password";
    input.type = shouldShowPassword ? "text" : "password";
    icon.src = shouldShowPassword ? "../assets/icons/eye.svg" : "../assets/icons/eye-slash.svg";
  }

  function requireSession() {
    const token = window.skillUpApi?.getToken();

    if (!token) {
      window.location.href = "login.html";
      return false;
    }

    return true;
  }

  function setButtonState(button, loading, loadingText, idleText) {
    if (!button) {
      return;
    }

    button.disabled = loading;
    button.textContent = loading ? loadingText : idleText;
  }

  function storeDailyReward(reward) {
    if (!reward) {
      return;
    }

    window.sessionStorage.setItem(DAILY_REWARD_KEY, JSON.stringify(reward));
  }

  function readAndClearDailyReward() {
    const raw = window.sessionStorage.getItem(DAILY_REWARD_KEY);
    if (!raw) {
      return null;
    }

    window.sessionStorage.removeItem(DAILY_REWARD_KEY);

    try {
      return JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const button = document.getElementById("loginBtn");
    const email = document.getElementById("email")?.value.trim() || "";
    const senha = document.getElementById("senha")?.value || "";

    clearFeedback("loginFeedback");
    setButtonState(button, true, "Entrando...", "Entrar");

    try {
      const payload = await window.skillUpApi.login({ email, senha });
      window.skillUpApi.setSession(payload);
      updateStoredUser(payload.user);
      storeDailyReward(payload.dailyLoginReward);
      form.reset();
      window.location.href = "dashboard.html";
    } catch (error) {
      setFeedback("loginFeedback", error.message, "danger");
      setButtonState(button, false, "Entrando...", "Entrar");
    }
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault();

    const senha = document.getElementById("senha")?.value || "";
    const confirmarSenha = document.getElementById("confirmarSenha")?.value || "";
    const button = document.getElementById("registerBtn");

    clearFeedback("registerFeedback");

    if (senha !== confirmarSenha) {
      setFeedback("registerFeedback", "As senhas nao coincidem.", "danger");
      return;
    }

    setButtonState(button, true, "Criando conta...", "Criar conta");

    try {
      const payload = await window.skillUpApi.register({
        nome: document.getElementById("nome")?.value.trim() || "",
        email: document.getElementById("email")?.value.trim() || "",
        senha,
      });

      window.skillUpApi.setSession(payload);
      updateStoredUser(payload.user);
      storeDailyReward(payload.dailyLoginReward);
      window.location.href = "dashboard.html";
    } catch (error) {
      setFeedback("registerFeedback", error.message, "danger");
      setButtonState(button, false, "Criando conta...", "Criar conta");
    }
  }

  async function handleForgotPasswordSubmit(event) {
    event.preventDefault();

    const button = document.getElementById("forgotPasswordBtn");
    const email = document.getElementById("forgotPasswordEmail")?.value.trim() || "";

    clearFeedback("forgotPasswordFeedback");
    hideForgotPasswordPreview();
    setButtonState(button, true, "Enviando...", "Enviar link de recuperacao");

    try {
      const payload = await window.skillUpApi.forgotPassword({ email });
      setFeedback("forgotPasswordFeedback", payload.message, "success");
      renderForgotPasswordPreview(payload);
    } catch (error) {
      setFeedback("forgotPasswordFeedback", error.message, "danger");
    } finally {
      setButtonState(button, false, "Enviando...", "Enviar link de recuperacao");
    }
  }

  async function loadResetPasswordPage() {
    if (document.body.dataset.page !== "reset-password") {
      return;
    }

    const token = getQueryParam("token");

    if (!token) {
      setFormAvailability("resetPasswordForm", false);
      setFeedback("resetPasswordFeedback", "Link de recuperacao invalido ou incompleto.", "danger");
      setElementText("resetPasswordStatus", "Solicite um novo link para redefinir sua senha.");
      return;
    }

    setElementText("resetPasswordStatus", "Validando link de recuperacao...");

    try {
      const payload = await window.skillUpApi.validateResetToken(token);
      const expirationLabel = payload.expiresAt
        ? ` O link expira em ${formatDateTime(payload.expiresAt)}.`
        : "";

      setElementText(
        "resetPasswordStatus",
        `Link valido para ${payload.emailHint || "sua conta"}.${expirationLabel}`
      );
      setFormAvailability("resetPasswordForm", true);
    } catch (error) {
      setFormAvailability("resetPasswordForm", false);
      setFeedback("resetPasswordFeedback", error.message, "danger");
      setElementText("resetPasswordStatus", "Solicite um novo link para tentar novamente.");
    }
  }

  async function handleResetPasswordSubmit(event) {
    event.preventDefault();

    const token = getQueryParam("token");
    const senha = document.getElementById("novaSenha")?.value || "";
    const confirmarSenha = document.getElementById("confirmarNovaSenha")?.value || "";
    const button = document.getElementById("resetPasswordBtn");

    clearFeedback("resetPasswordFeedback");

    if (!token) {
      setFeedback("resetPasswordFeedback", "Link de recuperacao invalido ou incompleto.", "danger");
      return;
    }

    if (senha !== confirmarSenha) {
      setFeedback("resetPasswordFeedback", "As senhas nao coincidem.", "danger");
      return;
    }

    setButtonState(button, true, "Salvando...", "Salvar nova senha");

    try {
      const payload = await window.skillUpApi.resetPassword({ token, senha });
      setFeedback("resetPasswordFeedback", payload.message, "success");
      setElementText("resetPasswordStatus", "Senha atualizada. Redirecionando para o login...");
      event.currentTarget.reset();
      setFormAvailability("resetPasswordForm", false);
      window.setTimeout(() => {
        window.location.href = "login.html";
      }, 1500);
    } catch (error) {
      setFeedback("resetPasswordFeedback", error.message, "danger");
    } finally {
      setButtonState(button, false, "Salvando...", "Salvar nova senha");
    }
  }

  function renderRewardBanner(user) {
    const banner = document.getElementById("rewardBanner");
    if (!banner) {
      return;
    }

    const reward = readAndClearDailyReward();

    if (reward) {
      banner.textContent = `${reward.label}: +${reward.xp} XP recebidos hoje.`;
      banner.className = "dashboard-banner";
      banner.classList.remove("d-none");
      return;
    }

    if (user?.gamification?.dailyLoginAwardedToday) {
      banner.textContent = "Bonus diario ja contabilizado hoje. Continue a sequencia.";
      banner.className = "dashboard-banner dashboard-banner-muted";
      banner.classList.remove("d-none");
      return;
    }

    banner.classList.add("d-none");
  }

  function renderProgressSummary(user) {
    const nameElement = document.getElementById("userName");
    const levelElement = document.getElementById("userLevel");
    const levelDescriptionElement = document.getElementById("levelDescription");
    const xpSummaryElement = document.getElementById("xpSummary");
    const nextLevelHintElement = document.getElementById("nextLevelHint");
    const progressBarElement = document.getElementById("progressBar");
    const challengeCountElement = document.getElementById("challengeCount");
    const pendingCountElement = document.getElementById("pendingCount");
    const badgeCountElement = document.getElementById("badgeCount");
    const perfectStreakCountElement = document.getElementById("perfectStreakCount");
    const dailyLoginStreakElement = document.getElementById("dailyLoginStreakCount");
    const idealAnswerCountElement = document.getElementById("idealAnswerCount");
    const userLevelMirrorElement = document.getElementById("userLevelMirror");

    if (nameElement) {
      nameElement.textContent = user.nome || "Dev";
    }

    if (levelElement) {
      levelElement.textContent = `Nivel ${user.level} | ${user.levelLabel}`;
    }

    if (levelDescriptionElement) {
      levelDescriptionElement.textContent = user.isMaxLevel
        ? "Voce chegou ao topo atual da trilha de soft skills."
        : `Faltam ${user.xpToNextLevel} XP para avancar para o proximo nivel.`;
    }

    if (xpSummaryElement) {
      xpSummaryElement.textContent = user.isMaxLevel
        ? `${user.xp} XP totais | Nivel maximo`
        : `${user.currentLevelXp} XP / ${user.nextLevelXp} XP`;
    }

    if (nextLevelHintElement) {
      nextLevelHintElement.textContent = user.isMaxLevel
        ? "Novos desafios agora servem para badges, avatar e consistencia."
        : "Respostas ideais e sequencias perfeitas aceleram a progressao.";
    }

    if (progressBarElement) {
      progressBarElement.style.width = `${user.progressPercent}%`;
      progressBarElement.setAttribute("aria-valuenow", String(user.progressPercent));
    }

    if (challengeCountElement) {
      challengeCountElement.textContent = `${user.completedChallenges}/${user.totalChallenges}`;
    }

    if (pendingCountElement) {
      pendingCountElement.textContent = String(user.pendingChallenges);
    }

    if (badgeCountElement) {
      badgeCountElement.textContent = String(user.gamification?.totalBadges || 0);
    }

    if (perfectStreakCountElement) {
      perfectStreakCountElement.textContent = String(user.gamification?.perfectStreak || 0);
    }

    if (dailyLoginStreakElement) {
      dailyLoginStreakElement.textContent = String(user.gamification?.dailyLoginStreak || 0);
    }

    if (idealAnswerCountElement) {
      idealAnswerCountElement.textContent = String(user.gamification?.idealAnswers || 0);
    }

    if (userLevelMirrorElement) {
      userLevelMirrorElement.textContent = user.levelLabel || `Nivel ${user.level}`;
    }
  }

  function renderBadgeCatalog(user) {
    const badgeGrid = document.getElementById("badgeGrid");
    if (!badgeGrid) {
      return;
    }

    const badgeCatalog = Array.isArray(user.badgeCatalog) ? user.badgeCatalog : [];

    if (badgeCatalog.length === 0) {
      badgeGrid.innerHTML = '<p class="dashboard-empty">Nenhuma badge configurada ainda.</p>';
      return;
    }

    badgeGrid.innerHTML = badgeCatalog
      .map((badge) => {
        const statusLabel = badge.unlocked ? "Desbloqueada" : "Bloqueada";
        return `
          <article class="badge-card ${badge.unlocked ? "unlocked" : "locked"}">
            <div class="badge-mark">${badge.name.charAt(0)}</div>
            <div>
              <h4>${badge.name}</h4>
              <p>${badge.description}</p>
              <span class="badge-status">${statusLabel}</span>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderCategoryProgress(user) {
    const container = document.getElementById("categoryProgress");
    if (!container) {
      return;
    }

    const progressList = Array.isArray(user.categoryProgress) ? user.categoryProgress : [];

    container.innerHTML = progressList
      .map((item) => {
        const percent = item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0;
        return `
          <div class="category-progress-item">
            <div class="category-progress-header">
              <strong>${item.categoria}</strong>
              <span>${item.completed}/${item.total}</span>
            </div>
            <div class="progress">
              <div class="progress-bar" style="width: ${percent}%"></div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function getAvatarOptions(key) {
    return dashboardUser?.avatarCatalog?.[key] || [];
  }

  function populateAvatarSelect(selectId, options, selectedValue) {
    const select = document.getElementById(selectId);
    if (!select) {
      return;
    }

    select.innerHTML = options
      .map((option) => {
        const levelSuffix = option.unlocked ? "" : ` (Nivel ${option.minLevel})`;
        const disabledAttr = option.unlocked ? "" : "disabled";
        const selectedAttr = option.id === selectedValue ? "selected" : "";
        return `<option value="${option.id}" ${disabledAttr} ${selectedAttr}>${option.label}${levelSuffix}</option>`;
      })
      .join("");
  }

  function getColorMeta(colorId) {
    return getAvatarOptions("cor").find((color) => color.id === colorId) || {
      value: "#5b6cff",
      secondary: "#8994ff",
    };
  }

  function readAvatarFormConfig() {
    return {
      cabelo: document.getElementById("avatarHair")?.value || "short",
      roupa: document.getElementById("avatarOutfit")?.value || "hoodie",
      cor: document.getElementById("avatarColor")?.value || "indigo",
      acessorio: document.getElementById("avatarAccessory")?.value || "none",
    };
  }

  function renderAvatarPreview(config) {
    const preview = document.getElementById("avatarPreview");
    if (!preview) {
      return;
    }

    const colorMeta = getColorMeta(config.cor);

    preview.className = `avatar-preview hair-${config.cabelo} outfit-${config.roupa} accessory-${config.acessorio}`;
    preview.style.setProperty("--avatar-primary", colorMeta.value || "#5b6cff");
    preview.style.setProperty("--avatar-secondary", colorMeta.secondary || "#8994ff");
  }

  function renderColorSwatches(colors, selectedId) {
    const container = document.getElementById("avatarColorSwatches");
    const select = document.getElementById("avatarColor");
    if (!container || !select) return;

    container.innerHTML = colors
      .map((color) => {
        const isSelected = color.id === selectedId ? "selected" : "";
        const disabledAttr = color.unlocked ? "" : "disabled";
        const title = color.unlocked ? color.label : `${color.label} (Nível ${color.minLevel})`;
        return `<button
          type="button"
          class="avatar-swatch ${isSelected}"
          data-color-id="${color.id}"
          style="--swatch-color: ${color.value};"
          title="${title}"
          ${disabledAttr}
        ></button>`;
      })
      .join("");

    container.querySelectorAll(".avatar-swatch:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", () => {
        select.value = btn.dataset.colorId;
        select.dispatchEvent(new Event("change"));
        container.querySelectorAll(".avatar-swatch").forEach((s) => s.classList.remove("selected"));
        btn.classList.add("selected");
      });
    });
  }

  function renderAvatarBuilder(user) {
    const avatarConfig = user.avatarConfig || {
      cabelo: "short",
      roupa: "hoodie",
      cor: "indigo",
      acessorio: "none",
    };

    populateAvatarSelect("avatarHair", getAvatarOptions("cabelo"), avatarConfig.cabelo);
    populateAvatarSelect("avatarOutfit", getAvatarOptions("roupa"), avatarConfig.roupa);
    populateAvatarSelect("avatarColor", getAvatarOptions("cor"), avatarConfig.cor);
    renderColorSwatches(getAvatarOptions("cor"), avatarConfig.cor);
    populateAvatarSelect("avatarAccessory", getAvatarOptions("acessorio"), avatarConfig.acessorio);
    renderAvatarPreview(avatarConfig);
  }

  function bindAvatarControls() {
    const form = document.getElementById("avatarForm");
    if (!form || form.dataset.bound === "true") {
      return;
    }

    form.dataset.bound = "true";
    form.addEventListener("submit", handleAvatarSubmit);

    ["avatarHair", "avatarOutfit", "avatarColor", "avatarAccessory"].forEach((fieldId) => {
      const field = document.getElementById(fieldId);
      if (!field) {
        return;
      }

      field.addEventListener("change", () => {
        renderAvatarPreview(readAvatarFormConfig());
      });
    });
  }

  async function handleAvatarSubmit(event) {
    event.preventDefault();

    const button = document.getElementById("avatarSaveBtn");
    const avatarConfig = readAvatarFormConfig();

    clearFeedback("avatarFeedback");
    setButtonState(button, true, "Salvando...", "Salvar avatar");

    try {
      const payload = await window.skillUpApi.updateAvatar(avatarConfig);
      dashboardUser = payload.user;
      updateStoredUser(payload.user);
      renderAvatarBuilder(payload.user);
      renderProgressSummary(payload.user);
      renderBadgeCatalog(payload.user);
      renderCategoryProgress(payload.user);
      setFeedback("avatarFeedback", payload.message || "Avatar salvo com sucesso.", "success");
    } catch (error) {
      setFeedback("avatarFeedback", error.message, "danger");
    } finally {
      setButtonState(button, false, "Salvando...", "Salvar avatar");
    }
  }

  function renderDashboard(user) {
    dashboardUser = user;
    renderRewardBanner(user);
    renderProgressSummary(user);
    renderBadgeCatalog(user);
    renderCategoryProgress(user);
    renderAvatarBuilder(user);
    bindAvatarControls();
  }

  async function loadDashboard() {
    if (document.body.dataset.page !== "dashboard") {
      return;
    }

    if (!requireSession()) {
      return;
    }

    try {
      const payload = await window.skillUpApi.getMe();
      updateStoredUser(payload.user);
      renderDashboard(payload.user);
    } catch (_error) {
      window.skillUpApi.clearSession();
      window.location.href = "login.html";
    }
  }

  async function logout() {
    try {
      if (window.skillUpApi?.getToken()) {
        await window.skillUpApi.logout();
      }
    } catch (_error) {
      // Ignora erro de rede para nao travar o logout local.
    } finally {
      window.skillUpApi.clearSession();
      window.localStorage.removeItem("userName");
      window.localStorage.removeItem("xp");
      window.localStorage.removeItem("nivel");
      window.sessionStorage.removeItem(DAILY_REWARD_KEY);
      window.location.href = "login.html";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");
    const forgotPasswordForm = document.getElementById("forgotPasswordForm");
    const resetPasswordForm = document.getElementById("resetPasswordForm");

    if (loginForm) {
      loginForm.addEventListener("submit", handleLoginSubmit);
    }

    if (registerForm) {
      registerForm.addEventListener("submit", handleRegisterSubmit);
    }

    if (forgotPasswordForm) {
      forgotPasswordForm.addEventListener("submit", handleForgotPasswordSubmit);
    }

    if (resetPasswordForm) {
      setFormAvailability("resetPasswordForm", false);
      resetPasswordForm.addEventListener("submit", handleResetPasswordSubmit);
    }

    loadDashboard();
    loadResetPasswordPage();
  });

  window.toggleSenha = function toggleSenha() {
    togglePassword("senha", "toggleSenhaIcon");
  };

  window.toggleConfirmarSenha = function toggleConfirmarSenha() {
    togglePassword("confirmarSenha", "toggleConfirmarSenhaIcon");
  };

  window.toggleNovaSenha = function toggleNovaSenha() {
    togglePassword("novaSenha", "toggleNovaSenhaIcon");
  };

  window.toggleConfirmarNovaSenha = function toggleConfirmarNovaSenha() {
    togglePassword("confirmarNovaSenha", "toggleConfirmarNovaSenhaIcon");
  };

  window.logout = logout;
  window.skillUpAuth = {
    requireSession,
    updateStoredUser,
  };
})();
