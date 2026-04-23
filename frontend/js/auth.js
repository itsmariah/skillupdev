(function attachSkillUpAuth() {
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

    window.localStorage.setItem("userName", user.nome || user.usuario || "Dev");
    window.localStorage.setItem("xp", String(user.xp || 0));
    window.localStorage.setItem("nivel", String(user.level || 1));
    window.localStorage.setItem("skillup_user", JSON.stringify(user));
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
        usuario: document.getElementById("usuario")?.value.trim() || "",
        email: document.getElementById("email")?.value.trim() || "",
        senha,
      });

      window.skillUpApi.setSession(payload);
      updateStoredUser(payload.user);
      window.location.href = "dashboard.html";
    } catch (error) {
      setFeedback("registerFeedback", error.message, "danger");
      setButtonState(button, false, "Criando conta...", "Criar conta");
    }
  }

  function renderDashboard(user) {
    const nameElement = document.getElementById("userName");
    const levelElement = document.getElementById("userLevel");
    const xpSummaryElement = document.getElementById("xpSummary");
    const progressBarElement = document.getElementById("progressBar");
    const challengeCountElement = document.getElementById("challengeCount");
    const pendingCountElement = document.getElementById("pendingCount");
    const profileNickElement = document.getElementById("profileNick");

    if (nameElement) {
      nameElement.textContent = user.nome || user.usuario || "Dev";
    }

    if (levelElement) {
      levelElement.textContent = `Nivel ${user.level}`;
    }

    if (xpSummaryElement) {
      xpSummaryElement.textContent = `${user.currentLevelXp} XP / ${user.nextLevelXp} XP`;
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

    if (profileNickElement) {
      profileNickElement.textContent = user.usuario || "-";
    }
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
      window.location.href = "login.html";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");

    if (loginForm) {
      loginForm.addEventListener("submit", handleLoginSubmit);
    }

    if (registerForm) {
      registerForm.addEventListener("submit", handleRegisterSubmit);
    }

    loadDashboard();
  });

  window.toggleSenha = function toggleSenha() {
    togglePassword("senha", "toggleSenhaIcon");
  };

  window.toggleConfirmarSenha = function toggleConfirmarSenha() {
    togglePassword("confirmarSenha", "toggleConfirmarSenhaIcon");
  };

  window.logout = logout;
  window.skillUpAuth = {
    requireSession,
    updateStoredUser,
  };
})();
