(function attachSkillUpApi() {
  // A sessão fica num cookie HttpOnly definido pelo servidor, fora do alcance deste script.
  // Aqui guardamos só uma cópia dos dados do usuário para exibir a interface.
  const USER_KEY = "skillup_user";
  const LEGACY_TOKEN_KEY = "skillup_token";

  // Token salvo por versões antigas, quando a sessão ficava no localStorage.
  window.localStorage.removeItem(LEGACY_TOKEN_KEY);

  function getApiOrigin() {
    return window.location.origin;
  }

  function getStoredUser() {
    const raw = window.localStorage.getItem(USER_KEY);

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  }

  // Indica se há um login feito neste navegador. Quem confirma a sessão é o servidor:
  // se o cookie tiver expirado, a próxima requisição responde 401.
  function hasSession() {
    return Boolean(getStoredUser());
  }

  function setSession(payload) {
    if (payload?.user) {
      window.localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
    }
  }

  function clearSession() {
    window.localStorage.removeItem(USER_KEY);
  }

  async function request(path, options = {}) {
    const method = options.method || "GET";
    const body = options.body;
    const headers = {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    };

    const response = await fetch(`${getApiOrigin()}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });

    const data = await response.json().catch(() => ({}));

    // Sessão expirada ou encerrada no servidor: limpa a cópia local e volta ao login.
    // As rotas de /api/auth/ ficam de fora porque nelas o 401 é "senha errada".
    if (response.status === 401 && !path.startsWith("/api/auth/")) {
      clearSession();
      window.location.href = "/pages/login.html";
    }

    if (!response.ok) {
      const error = new Error(data.message || "Não foi possível concluir a requisição.");
      error.status = response.status;
      error.payload = data;
      throw error;
    }

    return data;
  }

  window.skillUpApi = {
    clearSession,
    getApiOrigin,
    getStoredUser,
    hasSession,
    request,
    setSession,
    getConfig() {
      return request("/api/config");
    },
    getMe() {
      return request("/api/me");
    },
    getHistory() {
      return request("/api/me/history");
    },
    getChallenges() {
      return request("/api/challenges");
    },
    login(credentials) {
      return request("/api/auth/login", {
        method: "POST",
        body: credentials,
      });
    },
    forgotPassword(payload) {
      return request("/api/auth/forgot-password", {
        method: "POST",
        body: payload,
      });
    },
    logout() {
      return request("/api/auth/logout", {
        method: "POST",
      });
    },
    resetPassword(payload) {
      return request("/api/auth/reset-password", {
        method: "POST",
        body: payload,
      });
    },
    register(payload) {
      return request("/api/auth/register", {
        method: "POST",
        body: payload,
      });
    },
    validateResetToken(token) {
      const query = new URLSearchParams({ token });
      return request(`/api/auth/reset-password/validate?${query.toString()}`);
    },
    submitChallenge(challengeId, payload) {
      return request(`/api/challenges/${challengeId}/submit`, {
        method: "POST",
        body: payload,
      });
    },
    updateAvatar(avatarConfig) {
      return request("/api/me/avatar", {
        method: "PATCH",
        body: { avatarConfig },
      });
    },
    submitQuestionnaire(type, data) {
      return request("/api/study/questionnaire", {
        method: "POST",
        body: { type, data },
      });
    },
    getAdminStudyData() {
      return request("/api/admin/study-data");
    },
    getAdminStudyDataExportUrl() {
      return `${getApiOrigin()}/api/admin/study-data/export`;
    },
  };
})();
