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

  function getSkinMeta(skinId) {
    return getAvatarOptions("tom").find((t) => t.id === skinId) || {
      skin: "#f2c7a5",
      neck: "#e6b792",
    };
  }

  function getHairColorMeta(hairColorId) {
    return getAvatarOptions("cabelo_cor").find((c) => c.id === hairColorId) || {
      value: "#2d2842",
    };
  }

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function readAvatarFormConfig() {
    return {
      cabelo: document.getElementById("avatarHair")?.value || "short",
      roupa: document.getElementById("avatarOutfit")?.value || "hoodie",
      cor: document.getElementById("avatarColor")?.value || "indigo",
      acessorio: document.getElementById("avatarAccessory")?.value || "none",
      tom: document.getElementById("avatarSkin")?.value || "warm",
      cabelo_cor: document.getElementById("avatarHairColor")?.value || "dark",
      expressao: document.getElementById("avatarMood")?.value || "happy",
    };
  }

  function renderAvatarPreview(config) {
    const preview = document.getElementById("avatarPreview");
    if (!preview) {
      return;
    }

    const colorMeta = getColorMeta(config.cor);
    const skinMeta = getSkinMeta(config.tom || "warm");
    const hairColorMeta = getHairColorMeta(config.cabelo_cor || "dark");
    const primary = colorMeta.value || "#5b6cff";

    preview.className = [
      "avatar-preview",
      `hair-${config.cabelo}`,
      `outfit-${config.roupa}`,
      `accessory-${config.acessorio}`,
      `mood-${config.expressao || "happy"}`,
    ].join(" ");

    preview.style.setProperty("--avatar-primary", primary);
    preview.style.setProperty("--avatar-secondary", colorMeta.secondary || "#8994ff");
    preview.style.setProperty("--avatar-skin", skinMeta.skin || "#f2c7a5");
    preview.style.setProperty("--avatar-skin-neck", skinMeta.neck || "#e6b792");
    preview.style.setProperty("--avatar-hair", hairColorMeta.value || "#2d2842");
    preview.style.setProperty("--avatar-bg-start", hexToRgba(primary, 0.35));
    preview.style.setProperty("--avatar-bg-end", hexToRgba(primary, 0.05));
    preview.style.setProperty("--avatar-glow", hexToRgba(primary, 0.25));
  }

  // --- Avatar: renderização dos controles ---

  function populateAvatarSelect(selectId, options, selectedValue) {
    const select = document.getElementById(selectId);
    if (!select) {
      return;
    }

    select.innerHTML = options
      .map((option) => {
        const levelSuffix = option.unlocked ? "" : ` (Nível ${option.minLevel})`;
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

  function renderSkinSwatches(tones, selectedId) {
    const container = document.getElementById("avatarSkinSwatches");
    const select = document.getElementById("avatarSkin");
    if (!container || !select) {
      return;
    }

    container.innerHTML = tones
      .map((tone) => {
        const isSelected = tone.id === selectedId ? "selected" : "";
        const disabledAttr = tone.unlocked ? "" : "disabled";
        const title = tone.unlocked ? tone.label : `${tone.label} (Nível ${tone.minLevel})`;
        return `<button
          type="button"
          class="avatar-swatch ${isSelected}"
          data-skin-id="${tone.id}"
          style="--swatch-color: ${tone.skin};"
          title="${title}"
          ${disabledAttr}
        ></button>`;
      })
      .join("");

    container.querySelectorAll(".avatar-swatch:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", () => {
        select.value = btn.dataset.skinId;
        select.dispatchEvent(new Event("change"));
        container.querySelectorAll(".avatar-swatch").forEach((s) => s.classList.remove("selected"));
        btn.classList.add("selected");
      });
    });
  }

  function renderHairColorSwatches(colors, selectedId) {
    const container = document.getElementById("avatarHairColorSwatches");
    const select = document.getElementById("avatarHairColor");
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
          data-hair-color-id="${color.id}"
          style="--swatch-color: ${color.value};"
          title="${title}"
          ${disabledAttr}
        ></button>`;
      })
      .join("");

    container.querySelectorAll(".avatar-swatch:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", () => {
        select.value = btn.dataset.hairColorId;
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
      tom: "warm",
      cabelo_cor: "dark",
      expressao: "happy",
    };

    populateAvatarSelect("avatarHair", getAvatarOptions("cabelo"), avatarConfig.cabelo);
    populateAvatarSelect("avatarOutfit", getAvatarOptions("roupa"), avatarConfig.roupa);
    populateAvatarSelect("avatarColor", getAvatarOptions("cor"), avatarConfig.cor);
    renderColorSwatches(getAvatarOptions("cor"), avatarConfig.cor);
    populateAvatarSelect("avatarAccessory", getAvatarOptions("acessorio"), avatarConfig.acessorio);
    populateAvatarSelect("avatarMood", getAvatarOptions("expressao"), avatarConfig.expressao);
    populateAvatarSelect("avatarSkin", getAvatarOptions("tom"), avatarConfig.tom);
    renderSkinSwatches(getAvatarOptions("tom"), avatarConfig.tom);
    populateAvatarSelect("avatarHairColor", getAvatarOptions("cabelo_cor"), avatarConfig.cabelo_cor);
    renderHairColorSwatches(getAvatarOptions("cabelo_cor"), avatarConfig.cabelo_cor);
    renderAvatarPreview(avatarConfig);
  }

  function bindAvatarControls() {
    const form = document.getElementById("avatarForm");
    if (!form || form.dataset.bound === "true") {
      return;
    }

    form.dataset.bound = "true";
    form.addEventListener("submit", handleAvatarSubmit);

    ["avatarHair", "avatarOutfit", "avatarColor", "avatarAccessory", "avatarSkin", "avatarHairColor", "avatarMood"].forEach((fieldId) => {
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
      banner.textContent = "Bônus diário já contabilizado hoje. Continue a sequência.";
      banner.className = "dashboard-banner dashboard-banner-muted";
      banner.classList.remove("d-none");
      return;
    }

    banner.classList.add("d-none");
  }

  function renderProgressSummary(user) {
    const textFields = {
      userName: user.nome || "Dev",
      userLevel: `Nível ${user.level} | ${user.levelLabel}`,
      levelDescription: user.isMaxLevel
        ? "Você chegou ao topo atual da trilha de soft skills."
        : `Faltam ${user.xpToNextLevel} XP para avançar para o próximo nível.`,
      xpSummary: user.isMaxLevel
        ? `${user.xp} XP totais | Nível máximo`
        : `${user.currentLevelXp} XP / ${user.nextLevelXp} XP`,
      nextLevelHint: user.isMaxLevel
        ? "Novos desafios agora servem para badges, avatar e consistência."
        : "Respostas ideais e sequências perfeitas aceleram a progressão.",
      challengeCount: `${user.completedChallenges}/${user.totalChallenges}`,
      pendingCount: String(user.pendingChallenges),
      badgeCount: String(user.gamification?.totalBadges || 0),
      perfectStreakCount: String(user.gamification?.perfectStreak || 0),
      dailyLoginStreakCount: String(user.gamification?.dailyLoginStreak || 0),
      idealAnswerCount: String(user.gamification?.idealAnswers || 0),
      userLevelMirror: user.levelLabel || `Nível ${user.level}`,
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

  const RARITY_LABEL = {
    comum:    "Comum",
    raro:     "Raro",
    epico:    "Épico",
    lendario: "Lendário",
  };

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

    const rarityOrder = { comum: 0, raro: 1, epico: 2, lendario: 3 };
    const sorted = [...badgeCatalog].sort(
      (a, b) => (rarityOrder[a.rarity] ?? 0) - (rarityOrder[b.rarity] ?? 0)
    );

    badgeGrid.innerHTML = sorted
      .map((badge) => {
        const rarity = badge.rarity || "comum";
        const statusLabel = badge.unlocked ? "Desbloqueada" : "Bloqueada";
        const rarityLabel = RARITY_LABEL[rarity] || rarity;
        return `
          <article class="badge-card ${badge.unlocked ? "unlocked" : "locked"} rarity-${rarity}">
            <div class="badge-mark">${badge.name.charAt(0)}</div>
            <div class="badge-body">
              <h4>${badge.name}</h4>
              <p>${badge.description}</p>
              <div class="badge-footer">
                <span class="badge-rarity rarity-${rarity}">${rarityLabel}</span>
                <span class="badge-status">${statusLabel}</span>
              </div>
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
      window.skillUpStudy?.checkAndShowPostBanner(payload.user);
    } catch (_error) {
      window.skillUpApi.clearSession();
      window.location.href = "login.html";
    }
  }

  document.addEventListener("DOMContentLoaded", loadDashboard);
})();
