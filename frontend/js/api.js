(function attachSkillUpApi() {
  const TOKEN_KEY = "skillup_token";
  const USER_KEY = "skillup_user";
  const FALLBACK_ORIGIN = "http://localhost:3000";

  function getApiOrigin() {
    const currentOrigin = window.location.origin;
    const isHttpOrigin = /^https?:\/\//i.test(currentOrigin);
    const isLocalHost =
      window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

    if (isHttpOrigin && isLocalHost) {
      return currentOrigin;
    }

    return FALLBACK_ORIGIN;
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
      const error = new Error(data.message || "Nao foi possivel concluir a requisicao.");
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
    logout() {
      return request("/api/auth/logout", {
        method: "POST",
        auth: true,
      });
    },
    register(payload) {
      return request("/api/auth/register", {
        method: "POST",
        body: payload,
      });
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
  };
})();
