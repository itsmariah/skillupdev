(function attachSkillUpAuth() {
  const DAILY_REWARD_KEY = "skillup_last_daily_reward";

  // --- Helpers de UI ---

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

  function setElementText(elementId, message) {
    const element = document.getElementById(elementId);
    if (!element) {
      return;
    }

    element.textContent = message;
  }

  function setButtonState(button, loading, loadingText, idleText) {
    if (!button) {
      return;
    }

    button.disabled = loading;
    button.textContent = loading ? loadingText : idleText;
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

  // --- Sessão ---

  function requireSession() {
    const token = window.skillUpApi?.getToken();

    if (!token) {
      window.location.href = "login.html";
      return false;
    }

    return true;
  }

  function resolvePostLoginRedirect(user) {
    if (user.isAdmin) return "admin.html";
    return "dashboard.html";
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

  // --- Recuperação de senha ---

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
    previewLink.textContent = "Abrir tela de redefinição";
    previewExpiry.textContent = payload.previewExpiresAt
      ? `Link de teste válido até ${formatDateTime(payload.previewExpiresAt)}.`
      : "";
    preview.classList.remove("d-none");
  }

  // --- Handlers de formulários ---

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
      window.location.href = resolvePostLoginRedirect(payload.user);
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
      setFeedback("registerFeedback", "As senhas não coincidem.", "danger");
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
      window.location.href = resolvePostLoginRedirect(payload.user);
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
    setButtonState(button, true, "Enviando...", "Enviar link de recuperação");

    try {
      const payload = await window.skillUpApi.forgotPassword({ email });
      setFeedback("forgotPasswordFeedback", payload.message, "success");
      renderForgotPasswordPreview(payload);
    } catch (error) {
      setFeedback("forgotPasswordFeedback", error.message, "danger");
    } finally {
      setButtonState(button, false, "Enviando...", "Enviar link de recuperação");
    }
  }

  async function loadResetPasswordPage() {
    if (document.body.dataset.page !== "reset-password") {
      return;
    }

    const token = getQueryParam("token");

    if (!token) {
      setFormAvailability("resetPasswordForm", false);
      setFeedback("resetPasswordFeedback", "Link de recuperação inválido ou incompleto.", "danger");
      setElementText("resetPasswordStatus", "Solicite um novo link para redefinir sua senha.");
      return;
    }

    setElementText("resetPasswordStatus", "Validando link de recuperação...");

    try {
      const payload = await window.skillUpApi.validateResetToken(token);
      const expirationLabel = payload.expiresAt
        ? ` O link expira em ${formatDateTime(payload.expiresAt)}.`
        : "";

      setElementText(
        "resetPasswordStatus",
        `Link válido para ${payload.emailHint || "sua conta"}.${expirationLabel}`
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
      setFeedback("resetPasswordFeedback", "Link de recuperação inválido ou incompleto.", "danger");
      return;
    }

    if (senha !== confirmarSenha) {
      setFeedback("resetPasswordFeedback", "As senhas não coincidem.", "danger");
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

  // --- Init ---

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

    document.getElementById("toggleSenhaIcon")?.addEventListener("click", () => togglePassword("senha", "toggleSenhaIcon"));
    document.getElementById("toggleConfirmarSenhaIcon")?.addEventListener("click", () => togglePassword("confirmarSenha", "toggleConfirmarSenhaIcon"));
    document.getElementById("toggleNovaSenhaIcon")?.addEventListener("click", () => togglePassword("novaSenha", "toggleNovaSenhaIcon"));
    document.getElementById("toggleConfirmarNovaSenhaIcon")?.addEventListener("click", () => togglePassword("confirmarNovaSenha", "toggleConfirmarNovaSenhaIcon"));

    loadResetPasswordPage();
  });

  // --- Exports ---

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
    setFeedback,
    clearFeedback,
    setButtonState,
    readAndClearDailyReward,
  };
})();
