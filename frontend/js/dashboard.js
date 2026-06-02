(function attachSkillUpDashboard() {
  let dashboardUser = null;

  // --- Avatar: leitura e preview ---

  function getAvatarOptions(key) {
    return dashboardUser?.avatarCatalog?.[key] || [];
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

  // --- Avatar: renderização dos controles ---

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

  function renderColorSwatches(colors, selectedId) {
    const container = document.getElementById("avatarColorSwatches");
    const select = document.getElementById("avatarColor");
    if (!container || !select) {
      return;
    }

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

    window.skillUpAuth.clearFeedback("avatarFeedback");
    window.skillUpAuth.setButtonState(button, true, "Salvando...", "Salvar avatar");

    try {
      const payload = await window.skillUpApi.updateAvatar(avatarConfig);
      dashboardUser = payload.user;
      window.skillUpAuth.updateStoredUser(payload.user);
      renderAvatarBuilder(payload.user);
      renderProgressSummary(payload.user);
      renderBadgeCatalog(payload.user);
      renderCategoryProgress(payload.user);
      window.skillUpAuth.setFeedback("avatarFeedback", payload.message || "Avatar salvo com sucesso.", "success");
    } catch (error) {
      window.skillUpAuth.setFeedback("avatarFeedback", error.message, "danger");
    } finally {
      window.skillUpAuth.setButtonState(button, false, "Salvando...", "Salvar avatar");
    }
  }

  // --- Renderização do dashboard ---

  function renderRewardBanner(user) {
    const banner = document.getElementById("rewardBanner");
    if (!banner) {
      return;
    }

    const reward = window.skillUpAuth.readAndClearDailyReward();

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
    const textFields = {
      userName: user.nome || "Dev",
      userLevel: `Nivel ${user.level} | ${user.levelLabel}`,
      levelDescription: user.isMaxLevel
        ? "Voce chegou ao topo atual da trilha de soft skills."
        : `Faltam ${user.xpToNextLevel} XP para avancar para o proximo nivel.`,
      xpSummary: user.isMaxLevel
        ? `${user.xp} XP totais | Nivel maximo`
        : `${user.currentLevelXp} XP / ${user.nextLevelXp} XP`,
      nextLevelHint: user.isMaxLevel
        ? "Novos desafios agora servem para badges, avatar e consistencia."
        : "Respostas ideais e sequencias perfeitas aceleram a progressao.",
      challengeCount: `${user.completedChallenges}/${user.totalChallenges}`,
      pendingCount: String(user.pendingChallenges),
      badgeCount: String(user.gamification?.totalBadges || 0),
      perfectStreakCount: String(user.gamification?.perfectStreak || 0),
      dailyLoginStreakCount: String(user.gamification?.dailyLoginStreak || 0),
      idealAnswerCount: String(user.gamification?.idealAnswers || 0),
      userLevelMirror: user.levelLabel || `Nivel ${user.level}`,
    };

    Object.entries(textFields).forEach(([id, text]) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = text;
      }
    });

    const progressBar = document.getElementById("progressBar");
    if (progressBar) {
      progressBar.style.width = `${user.progressPercent}%`;
      progressBar.setAttribute("aria-valuenow", String(user.progressPercent));
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

    if (!window.skillUpAuth.requireSession()) {
      return;
    }

    try {
      const payload = await window.skillUpApi.getMe();
      window.skillUpAuth.updateStoredUser(payload.user);
      renderDashboard(payload.user);
    } catch (_error) {
      window.skillUpApi.clearSession();
      window.location.href = "login.html";
    }
  }

  document.addEventListener("DOMContentLoaded", loadDashboard);
})();
