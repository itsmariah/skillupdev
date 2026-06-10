(function attachSkillUpApi() {
  const TOKEN_KEY = "skillup_token";
  const USER_KEY = "skillup_user";

  function getApiOrigin() {
    return window.location.origin;
  }

  function getToken() {
    return window.localStorage.getItem(TOKEN_KEY) || "";
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

  function setSession(payload) {
    if (payload?.token) {
      window.localStorage.setItem(TOKEN_KEY, payload.token);
    }

    if (payload?.user) {
      window.localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
    }
  }

  function clearSession() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  }

  async function request(path, options = {}) {
    const method = options.method || "GET";
    const body = options.body;
    const auth = options.auth || false;
    const headers = {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    };

    if (auth && getToken()) {
      headers.Authorization = `Bearer ${getToken()}`;
    }

    const response = await fetch(`${getApiOrigin()}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => ({}));

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
    getToken,
    request,
    setSession,
    getMe() {
      return request("/api/me", { auth: true });
    },
    getChallenges() {
      return request("/api/challenges", { auth: true });
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
        auth: true,
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
        auth: true,
      });
    },
    updateAvatar(avatarConfig) {
      return request("/api/me/avatar", {
        method: "PATCH",
        body: { avatarConfig },
        auth: true,
      });
    },
    submitQuestionnaire(type, data) {
      return request("/api/study/questionnaire", {
        method: "POST",
        body: { type, data },
        auth: true,
      });
    },
    getAdminStudyData() {
      return request("/api/admin/study-data", { auth: true });
    },
    getAdminStudyDataExportUrl() {
      return `${getApiOrigin()}/api/admin/study-data/export`;
    },
  };
})();
