(function attachSkillUpAdminAi() {
  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const integer = new Intl.NumberFormat("pt-BR");

  // Custos de IA costumam ser frações de centavo: mais casas quando o valor é pequeno.
  function usd(value) {
    if (value === null || value === undefined) return "—";
    const digits = value > 0 && value < 0.01 ? 4 : 2;
    return Number(value).toLocaleString("pt-BR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  function seconds(ms) {
    if (ms === null || ms === undefined) return "—";
    return `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
  }

  function formatDay(day) {
    const [year, month, date] = day.split("-");
    return `${date}/${month}/${year}`;
  }

  function renderMonth(data) {
    const { mes, precos } = data;
    const items = [
      ["Custo estimado", `US$ ${usd(mes.custoUsd)}`],
      ["Chamadas", integer.format(mes.chamadas)],
      [
        "Orçamento",
        mes.orcamentoUsd === null
          ? "não definido"
          : `US$ ${usd(mes.orcamentoUsd)} (${mes.percentual.toLocaleString("pt-BR")}% usado)`,
      ],
    ];
    $("monthSummary").innerHTML = items
      .map(
        ([label, value]) => `
        <div>
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>`,
      )
      .join("");

    $("priceNote").textContent =
      `Estimativa com o preço do ${precos.modelo}: US$ ${usd(precos.entradaPorMilhao)} por milhão de tokens de entrada e US$ ${usd(precos.saidaPorMilhao)} de saída. Confira na fatura da OpenAI.`;

    const alert = $("budgetAlert");
    alert.className = "alert mt-3";
    if (mes.alerta === "estourado") {
      alert.classList.add("alert-danger");
      alert.textContent = `O custo do mês passou do orçamento (${mes.percentual.toLocaleString("pt-BR")}%). A IA continua funcionando: o orçamento só gera este aviso.`;
    } else if (mes.alerta === "perto") {
      alert.classList.add("alert-warning");
      alert.textContent = `O custo do mês já chegou a ${mes.percentual.toLocaleString("pt-BR")}% do orçamento.`;
    } else {
      alert.classList.add("d-none");
    }
  }

  function renderFeatures(rows) {
    $("featureRows").innerHTML = rows.length
      ? rows
          .map(
            (row) => `
        <tr>
          <th scope="row">${escapeHtml(row.nome)}</th>
          <td class="text-end">${integer.format(row.chamadas)}</td>
          <td class="text-end">${integer.format(row.erros)}${
            row.chamadas
              ? ` <span class="text-muted">(${Math.round((row.erros / row.chamadas) * 100)}%)</span>`
              : ""
          }</td>
          <td class="text-end">${integer.format(row.tokens)}</td>
          <td class="text-end">${usd(row.custoUsd)}</td>
          <td class="text-end">${seconds(row.latenciaMediaMs)}</td>
          <td class="text-end">${seconds(row.latenciaP95Ms)}</td>
        </tr>`,
          )
          .join("")
      : '<tr><td colspan="7">Nenhuma chamada no período.</td></tr>';
  }

  function renderDays(rows) {
    $("dayRows").innerHTML = rows.length
      ? rows
          .map(
            (row) => `
        <tr>
          <th scope="row">${escapeHtml(formatDay(row.dia))}</th>
          <td class="text-end">${integer.format(row.chamadas)}</td>
          <td class="text-end">${integer.format(row.erros)}</td>
          <td class="text-end">${usd(row.custoUsd)}</td>
          <td class="text-end">${seconds(row.latenciaMediaMs)}</td>
        </tr>`,
          )
          .join("")
      : '<tr><td colspan="5">Nenhuma chamada no período.</td></tr>';
  }

  function renderErrors(rows) {
    $("errorList").innerHTML = rows.length
      ? rows
          .map(
            (row) => `
        <li>
          <strong>${escapeHtml(row.recurso)}</strong>
          <span>${escapeHtml(row.erro || "erro")}</span>
          <small>${escapeHtml(new Date(row.em).toLocaleString("pt-BR"))}</small>
        </li>`,
          )
          .join("")
      : "<li>Nenhum erro no período.</li>";
  }

  async function load() {
    try {
      const data = await window.skillUpApi.request(
        `/api/admin/ai-usage?dias=${encodeURIComponent($("periodSelect").value)}`,
      );
      renderMonth(data);
      renderFeatures(data.porRecurso);
      renderDays(data.porDia);
      renderErrors(data.errosRecentes);
      $("dayNote").textContent = `Mais recentes primeiro. Dias no fuso ${data.periodo.fuso}.`;
    } catch (error) {
      window.skillUpAuth.setFeedback("aiFeedback", error.message, "danger");
    }
  }

  function init() {
    if (document.body.dataset.page !== "admin-ai") return;
    if (!window.skillUpAuth?.requireSession()) return;
    if (window.skillUpApi.getStoredUser()?.role !== "admin") {
      window.location.href = "dashboard.html";
      return;
    }

    $("logoutBtn").addEventListener("click", () => window.logout());
    $("periodSelect").addEventListener("change", load);
    load();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
