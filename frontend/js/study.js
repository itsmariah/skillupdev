(function initStudy() {
  const STUDY_OPTED_OUT_KEY = "skillup_study_opted_out";
  const SUS_QUESTIONS = [
    { id: "s1",  text: "Eu usaria essa plataforma com frequência." },
    { id: "s2",  text: "Achei a plataforma desnecessariamente complexa." },
    { id: "s3",  text: "A plataforma foi fácil de usar." },
    { id: "s4",  text: "Eu precisaria de suporte técnico para usar esta plataforma." },
    { id: "s5",  text: "As funcionalidades estavam bem integradas." },
    { id: "s6",  text: "Havia muita inconsistência na plataforma." },
    { id: "s7",  text: "A maioria das pessoas aprenderia a usar rapidamente." },
    { id: "s8",  text: "A plataforma foi muito difícil de usar." },
    { id: "s9",  text: "Me senti confiante usando a plataforma." },
    { id: "s10", text: "Precisei aprender muitas coisas antes de conseguir usar." },
  ];

  const LIKERT_QUESTIONS = [
    { id: "desafiosInteressantes",  text: "Os desafios foram interessantes e motivadores." },
    { id: "feedbackUtil",           text: "O feedback da IA foi útil para o meu aprendizado." },
    { id: "reflexaoSoftSkills",     text: "A plataforma me ajudou a refletir sobre habilidades interpessoais." },
    { id: "usariaNovamente",        text: "Eu utilizaria essa plataforma novamente." },
    { id: "feedbackCoerente",       text: "Os feedbacks da IA foram coerentes com as respostas que dei." },
  ];

  function setFeedback(id, message, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `alert alert-${type}`;
    el.textContent = message;
    el.classList.remove("d-none");
  }

  function setBtn(id, loading, loadingText, idleText) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? loadingText : idleText;
  }

  // ─── PRÉ QUESTIONÁRIO ───────────────────────────────────────────────────────

  function buildPreForm() {
    if (document.body.dataset.page !== "questionnaire-pre") return;

    if (!window.skillUpAuth?.requireSession()) return;

    const token = window.skillUpApi.getToken();
    if (!token) return;

    window.skillUpApi.getMe().then((resp) => {
      if (resp.user?.studyPreDone) {
        window.location.href = "dashboard.html";
      }
    }).catch(() => {});

    window.sessionStorage.setItem("studyStartedAt", new Date().toISOString());

    document.getElementById("preForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      setBtn("preSubmitBtn", true, "Salvando...", "Começar o experimento →");

      const conhecimento = document.querySelector('input[name="conhecimento"]:checked')?.value;
      const expectativa   = document.querySelector('input[name="expectativa"]:checked')?.value;

      if (!conhecimento || !expectativa) {
        setFeedback("preFeedback", "Responda todas as perguntas antes de continuar.", "danger");
        setBtn("preSubmitBtn", false, "", "Começar o experimento →");
        return;
      }

      const data = {
        curso:                    document.getElementById("curso").value.trim(),
        semestre:                 document.getElementById("semestre").value,
        atuacao:                  document.getElementById("atuacao").value,
        usouPlataformaEducacional: document.getElementById("usouPlataforma").value,
        treinamentoSoftSkill:     document.getElementById("treinamentoSoftSkill").value,
        conhecimentoSoftSkills:   Number(conhecimento),
        expectativa:              Number(expectativa),
      };

      try {
        const resp = await window.skillUpApi.submitQuestionnaire("pre", data);
        window.skillUpApi.setSession({ user: resp.user });
        window.location.href = "dashboard.html";
      } catch (err) {
        setFeedback("preFeedback", err.message || "Erro ao salvar questionário.", "danger");
        setBtn("preSubmitBtn", false, "", "Começar o experimento →");
      }
    });
  }

  // ─── PÓS QUESTIONÁRIO ───────────────────────────────────────────────────────

  function buildSusTable() {
    const tbody = document.getElementById("susBody");
    if (!tbody) return;

    tbody.innerHTML = SUS_QUESTIONS.map((q) => `
      <tr>
        <td class="label-col">${q.text}</td>
        ${[1,2,3,4,5].map((v) => `
          <td style="text-align:center">
            <input type="radio" name="${q.id}" value="${v}" required>
          </td>
        `).join("")}
      </tr>
    `).join("");
  }

  function buildLikertQuestions() {
    const container = document.getElementById("likertQuestions");
    if (!container) return;

    container.innerHTML = LIKERT_QUESTIONS.map((q) => `
      <div class="mb-4">
        <label class="form-label">${q.text}</label>
        <div class="likert-group mt-2">
          ${[1,2,3,4,5].map((v) => `
            <div class="form-check">
              <input type="radio" name="${q.id}" id="${q.id}_${v}" value="${v}" required>
              <label class="form-check-label" for="${q.id}_${v}"><span>${v}</span></label>
            </div>
          `).join("")}
        </div>
        <div class="likert-labels"><span>Discordo totalmente</span><span>Concordo totalmente</span></div>
      </div>
    `).join("");
  }

  function buildPostForm() {
    if (document.body.dataset.page !== "questionnaire-post") return;

    if (!window.skillUpAuth?.requireSession()) return;

    buildSusTable();
    buildLikertQuestions();

    document.getElementById("postForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      setBtn("postSubmitBtn", true, "Enviando...", "Enviar avaliação e concluir experimento");

      const sus = {};
      SUS_QUESTIONS.forEach((q) => {
        const val = document.querySelector(`input[name="${q.id}"]:checked`)?.value;
        sus[q.id] = val ? Number(val) : null;
      });

      const allSusFilled = Object.values(sus).every((v) => v !== null);
      if (!allSusFilled) {
        setFeedback("postFeedback", "Responda todas as questões do SUS antes de continuar.", "danger");
        setBtn("postSubmitBtn", false, "", "Enviar avaliação e concluir experimento");
        return;
      }

      const likert = {};
      LIKERT_QUESTIONS.forEach((q) => {
        const val = document.querySelector(`input[name="${q.id}"]:checked`)?.value;
        likert[q.id] = val ? Number(val) : null;
      });

      const allLikertFilled = Object.values(likert).every((v) => v !== null);
      if (!allLikertFilled) {
        setFeedback("postFeedback", "Responda todas as perguntas de engajamento.", "danger");
        setBtn("postSubmitBtn", false, "", "Enviar avaliação e concluir experimento");
        return;
      }

      const feedbackVsGenerico = document.querySelector('input[name="feedbackVsGenerico"]:checked')?.value;
      if (!feedbackVsGenerico) {
        setFeedback("postFeedback", "Responda a pergunta sobre comparação do feedback.", "danger");
        setBtn("postSubmitBtn", false, "", "Enviar avaliação e concluir experimento");
        return;
      }

      likert.feedbackVsGenerico = Number(feedbackVsGenerico);

      const startedAt = window.sessionStorage.getItem("studyStartedAt");
      const timeSpentMinutes = startedAt
        ? Math.round((Date.now() - new Date(startedAt).getTime()) / 60000)
        : null;

      const storedUser = window.skillUpApi.getStoredUser();

      const data = {
        sus,
        likert,
        abertas: {
          gostou:              document.getElementById("gostou").value.trim(),
          melhorar:            document.getElementById("melhorar").value.trim(),
          feedbackCoerente:    document.getElementById("feedbackCoerenteAberto").value.trim(),
        },
        sessionStats: {
          timeSpentMinutes,
          challengesCompleted: storedUser?.completedChallenges ?? null,
          studyStartedAt: startedAt,
        },
      };

      try {
        const resp = await window.skillUpApi.submitQuestionnaire("post", data);
        window.skillUpApi.setSession({ user: resp.user });
        setFeedback("postFeedback", "Obrigado! Sua avaliação foi registrada com sucesso.", "success");
        document.getElementById("postSubmitBtn").disabled = true;
        window.sessionStorage.removeItem("studyStartedAt");
        setTimeout(() => { window.location.href = "dashboard.html"; }, 2000);
      } catch (err) {
        setFeedback("postFeedback", err.message || "Erro ao salvar questionário.", "danger");
        setBtn("postSubmitBtn", false, "", "Enviar avaliação e concluir experimento");
      }
    });
  }

  // ─── BANNER NO DASHBOARD/DESAFIOS ──────────────────────────────────────────

  function injectPostQuestionnaireBanner(user) {
    if (user.studyPostDone || !user.studyPreDone) return;
    if (user.completedChallenges < 10) return;
    if (document.getElementById("studyPostBanner")) return;

    const banner = document.createElement("div");
    banner.id = "studyPostBanner";
    banner.style.cssText = [
      "position:fixed; bottom:24px; right:24px; z-index:9999;",
      "background:linear-gradient(135deg,#059669,#0d9488);",
      "border-radius:14px; padding:1.1rem 1.4rem; max-width:360px;",
      "box-shadow:0 8px 32px rgba(0,0,0,0.4); color:white;",
      "animation: fadeInUp 0.4s ease;",
    ].join("");

    banner.innerHTML = `
      <style>
        @keyframes fadeInUp {
          from { opacity:0; transform:translateY(20px); }
          to   { opacity:1; transform:translateY(0); }
        }
      </style>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <strong style="font-size:0.95rem;">Etapa 2 desbloqueada!</strong>
          <p style="font-size:0.82rem; margin:6px 0 14px; opacity:0.9; line-height:1.5;">
            Você completou desafios suficientes para o estudo. Pode responder o questionário final agora ou continuar explorando a plataforma e responder quando quiser.
          </p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <a href="questionnaire-post.html" class="btn btn-sm btn-light" style="color:#065f46; font-weight:600;">
              Responder agora
            </a>
            <button id="studyPostBannerClose"
              class="btn btn-sm"
              style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:white;font-weight:600;">
              Continuar explorando
            </button>
          </div>
        </div>
        <button id="studyPostBannerDismiss"
          style="background:none;border:none;color:white;font-size:1.2rem;cursor:pointer;opacity:0.7;padding:0;flex-shrink:0;">✕</button>
      </div>
    `;

    document.body.appendChild(banner);
    document.getElementById("studyPostBannerClose")?.addEventListener("click", () => banner.remove());
    document.getElementById("studyPostBannerDismiss")?.addEventListener("click", () => banner.remove());
  }

  // ─── MODAL DE OPT-IN PÓS-ESTUDO ───────────────────────────────────────────

  function injectStudyOptInModal() {
    if (document.getElementById("studyOptInModal")) return;

    const overlay = document.createElement("div");
    overlay.id = "studyOptInModal";
    overlay.style.cssText = [
      "position:fixed; inset:0; z-index:10000;",
      "background:rgba(29,24,58,0.7);",
      "display:flex; align-items:center; justify-content:center; padding:20px;",
      "animation:fadeIn 0.25s ease;",
    ].join("");

    overlay.innerHTML = `
      <style>
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes slideUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
      </style>
      <div style="background:white; border-radius:20px; padding:2rem 2rem 1.75rem;
                  max-width:460px; width:100%; text-align:center;
                  box-shadow:0 24px 64px rgba(0,0,0,0.35);
                  animation:slideUp 0.3s ease;">
        <div style="font-size:2.2rem; margin-bottom:0.75rem;">🎓</div>
        <h3 style="color:#2c2457; font-weight:800; font-size:1.2rem; margin-bottom:0.6rem;">
          Estudo Piloto Encerrado
        </h3>
        <p style="color:#6b7280; font-size:0.9rem; line-height:1.65; margin-bottom:1.5rem;">
          O estudo piloto da SkillUp Dev foi finalizado. Caso queira, você ainda pode
          testar a plataforma e responder o questionário para ajudar os desenvolvedores
          na evolução contínua do projeto! :)
        </p>
        <div style="display:flex; gap:10px; justify-content:center;">
          <button id="studyOptInYes"
            style="flex:1; max-width:190px; padding:10px 16px; border-radius:10px; border:none;
                   background:linear-gradient(135deg,#5b6cff,#7a88ff); color:white;
                   font-weight:700; font-size:0.9rem; cursor:pointer;">
            Sim, quero participar!
          </button>
          <button id="studyOptInNo"
            style="flex:1; max-width:190px; padding:10px 16px; border-radius:10px;
                   border:1px solid #d1d5db; background:transparent; color:#6b7280;
                   font-weight:600; font-size:0.9rem; cursor:pointer;">
            Não, obrigado
          </button>
        </div>
        <p style="margin-top:1rem; font-size:0.75rem; color:#9ca3af;">
          Você pode acessar o questionário a qualquer momento pelo menu do dashboard.
        </p>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById("studyOptInYes")?.addEventListener("click", () => {
      overlay.remove();
      window.location.href = "questionnaire-pre.html";
    });

    document.getElementById("studyOptInNo")?.addEventListener("click", () => {
      localStorage.setItem(STUDY_OPTED_OUT_KEY, "1");
      overlay.remove();
    });
  }

  function checkAndShowStudyOptIn() {
    if (document.body.dataset.page !== "dashboard") return;
    if (localStorage.getItem(STUDY_OPTED_OUT_KEY)) return;

    const user = window.skillUpApi.getStoredUser();
    if (!user || user.studyPreDone) return;

    injectStudyOptInModal();
  }

  function checkAndShowPostBanner(user) {
    const page = document.body.dataset.page;
    if (!["challenges", "dashboard"].includes(page)) return;
    if (localStorage.getItem(STUDY_OPTED_OUT_KEY)) return;

    if (user) {
      injectPostQuestionnaireBanner(user);
      return;
    }

    const token = window.skillUpApi?.getToken();
    if (!token) return;

    window.skillUpApi.getMe().then((resp) => {
      if (resp?.user) injectPostQuestionnaireBanner(resp.user);
    }).catch(() => {});
  }

  window.skillUpStudy = { checkAndShowPostBanner };

  document.addEventListener("DOMContentLoaded", () => {
    buildPreForm();
    buildPostForm();
    checkAndShowStudyOptIn();
    if (document.body.dataset.page === "challenges") {
      checkAndShowPostBanner();
    }
  });
})();
