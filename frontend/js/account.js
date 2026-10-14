(function attachSkillUpAccount() {
  const auth = () => window.skillUpAuth;

  function formatMemberSince(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "Gerencie seus dados de perfil."
      : `Na SkillUp Dev desde ${date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}.`;
  }

  function renderProfile(user) {
    document.getElementById("profileName").value = user.nome || "";
    document.getElementById("profileEmail").value = user.email || "";
    document.querySelectorAll(".account-username").forEach((input) => {
      input.value = user.email || "";
    });
    document.getElementById("memberSince").textContent = formatMemberSince(user.createdAt);

    // O admin não se exclui por esta página (o servidor também recusa).
    if (user.role === "admin") {
      document.getElementById("deleteBtn").disabled = true;
      auth().setFeedback(
        "deleteFeedback",
        "Contas de administrador não podem ser excluídas por esta página.",
        "info",
      );
    }
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();
    const button = document.getElementById("profileSaveBtn");
    const nome = document.getElementById("profileName").value.trim();

    auth().clearFeedback("profileFeedback");

    if (!nome) {
      auth().setFeedback("profileFeedback", "Informe seu nome.", "danger");
      document.getElementById("profileName").focus();
      return;
    }

    auth().setButtonState(button, true, "Salvando...", "Salvar perfil");

    try {
      const payload = await window.skillUpApi.updateProfile({ nome });
      auth().updateStoredUser(payload.user);
      auth().setFeedback("profileFeedback", payload.message, "success");
    } catch (error) {
      auth().setFeedback("profileFeedback", error.message, "danger");
    } finally {
      auth().setButtonState(button, false, "Salvando...", "Salvar perfil");
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = document.getElementById("passwordSaveBtn");
    const senhaAtual = document.getElementById("currentPassword").value;
    const novaSenha = document.getElementById("newPassword").value;
    const confirmacao = document.getElementById("confirmNewPassword").value;

    auth().clearFeedback("passwordFeedback");

    if (!senhaAtual || !novaSenha) {
      auth().setFeedback("passwordFeedback", "Preencha a senha atual e a nova senha.", "danger");
      return;
    }

    if (novaSenha !== confirmacao) {
      auth().setFeedback(
        "passwordFeedback",
        "A confirmação não confere com a nova senha.",
        "danger",
      );
      document.getElementById("confirmNewPassword").focus();
      return;
    }

    auth().setButtonState(button, true, "Trocando...", "Trocar senha");

    try {
      const payload = await window.skillUpApi.changePassword({ senhaAtual, novaSenha });
      form.reset();
      auth().setFeedback("passwordFeedback", payload.message, "success");
    } catch (error) {
      auth().setFeedback("passwordFeedback", error.message, "danger");
    } finally {
      auth().setButtonState(button, false, "Trocando...", "Trocar senha");
    }
  }

  async function handleExport() {
    const button = document.getElementById("exportBtn");
    auth().clearFeedback("exportFeedback");
    auth().setButtonState(button, true, "Preparando arquivo...", "Baixar meus dados");

    try {
      const data = await window.skillUpApi.exportAccount();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `skillupdev-meus-dados-${String(data.exportadoEm || "").slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      auth().setFeedback("exportFeedback", "Download iniciado.", "success");
    } catch (error) {
      auth().setFeedback("exportFeedback", error.message, "danger");
    } finally {
      auth().setButtonState(button, false, "Preparando arquivo...", "Baixar meus dados");
    }
  }

  async function handleDeleteSubmit(event) {
    event.preventDefault();
    const button = document.getElementById("deleteBtn");
    const confirmed = document.getElementById("deleteConfirm").checked;
    const senha = document.getElementById("deletePassword").value;

    auth().clearFeedback("deleteFeedback");

    if (!confirmed) {
      auth().setFeedback("deleteFeedback", "Marque a confirmação para continuar.", "danger");
      document.getElementById("deleteConfirm").focus();
      return;
    }

    if (!senha) {
      auth().setFeedback("deleteFeedback", "Digite sua senha para confirmar.", "danger");
      document.getElementById("deletePassword").focus();
      return;
    }

    auth().setButtonState(button, true, "Excluindo...", "Excluir minha conta");

    try {
      await window.skillUpApi.deleteAccount({ senha });
      auth().clearLocalSession();
      window.location.href = "../index.html";
    } catch (error) {
      auth().setFeedback("deleteFeedback", error.message, "danger");
      auth().setButtonState(button, false, "Excluindo...", "Excluir minha conta");
    }
  }

  async function loadAccount() {
    if (document.body.dataset.page !== "account") {
      return;
    }

    if (!auth().requireSession()) {
      return;
    }

    document.getElementById("logoutBtn")?.addEventListener("click", () => window.logout());
    document.getElementById("profileForm").addEventListener("submit", handleProfileSubmit);
    document.getElementById("passwordForm").addEventListener("submit", handlePasswordSubmit);
    document.getElementById("exportBtn").addEventListener("click", handleExport);
    document.getElementById("deleteForm").addEventListener("submit", handleDeleteSubmit);

    try {
      const payload = await window.skillUpApi.getMe();
      auth().updateStoredUser(payload.user);
      renderProfile(payload.user);
    } catch (error) {
      auth().setFeedback("profileFeedback", error.message, "danger");
    }
  }

  document.addEventListener("DOMContentLoaded", loadAccount);
})();
