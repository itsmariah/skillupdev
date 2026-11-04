// Avaliação do avaliador (Fase 4): roda o avaliador de respostas abertas sobre um conjunto
// fixo de casos (backend/evals/evaluator-cases.json) e mede se as notas caem na faixa
// esperada, se a ordem fraca < boa < ideal se mantém em cada desafio e se as tentativas de
// manipulação são pegas. Rodar a cada mudança de prompt ou de modelo (npm run eval:ai).
// As funções recebem o avaliador por parâmetro: os testes usam um falso, sem chamar a API.
const { OPEN_CHALLENGE_IDEAL_SCORE, OPEN_CHALLENGE_MEDIUM_SCORE } = require("./gamification");

// Mesma régua da rubrica do prompt e das faixas de qualidade.
const BANDS = {
  fraca: [0, OPEN_CHALLENGE_MEDIUM_SCORE - 1],
  boa: [OPEN_CHALLENGE_MEDIUM_SCORE, OPEN_CHALLENGE_IDEAL_SCORE - 1],
  ideal: [OPEN_CHALLENGE_IDEAL_SCORE, 100],
};
const BAND_ORDER = ["fraca", "boa", "ideal"];
// Diferença a partir da qual um caso aparece na comparação com a linha de base.
const BASELINE_DELTA = 10;

function validateCases(data, getChallenge) {
  const errors = [];
  const cases = Array.isArray(data?.casos) ? data.casos : [];
  const ids = new Set();

  if (cases.length === 0) errors.push("Nenhum caso no arquivo.");

  for (const item of cases) {
    const label = item?.id || "(sem id)";
    if (!item?.id) errors.push("Caso sem id.");
    else if (ids.has(item.id)) errors.push(`${label}: id repetido.`);
    ids.add(item?.id);

    const challenge = getChallenge(item?.desafio);
    if (!challenge) errors.push(`${label}: desafio "${item?.desafio}" não existe.`);
    else if (challenge.tipo !== "aberto") errors.push(`${label}: o desafio não é aberto.`);

    if (!(item?.faixa in BANDS)) errors.push(`${label}: faixa deve ser fraca, boa ou ideal.`);
    if (!String(item?.resposta || "").trim()) errors.push(`${label}: resposta vazia.`);
    if (item?.manipulacao && item.faixa !== "fraca") {
      errors.push(`${label}: caso de manipulação precisa esperar a faixa fraca.`);
    }
  }

  return errors;
}

const average = (values) => values.reduce((total, value) => total + value, 0) / values.length;

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function bandOf(score) {
  return BAND_ORDER.find((band) => score >= BANDS[band][0] && score <= BANDS[band][1]);
}

// Roda cada caso `repetitions` vezes, com no máximo `concurrency` chamadas ao mesmo tempo.
// evaluate({ resposta, challenge }) devolve { nota, evaluation }. Se `requireEvaluator` for
// definido (ex.: "ai"), uma avaliação feita por outro avaliador (a reserva heurística, quando
// a IA falha) conta como erro, para a falha não passar despercebida.
async function runCases({
  cases,
  evaluate,
  getChallenge,
  repetitions = 1,
  concurrency = 4,
  requireEvaluator = null,
  onProgress = () => {},
}) {
  const jobs = cases.flatMap((item) =>
    Array.from({ length: repetitions }, (_, round) => ({ item, round })),
  );
  const runs = new Map(cases.map((item) => [item.id, []]));
  let next = 0;
  let finished = 0;

  async function worker() {
    while (next < jobs.length) {
      const { item } = jobs[next++];
      let run;
      try {
        const result = await evaluate({
          resposta: item.resposta,
          challenge: getChallenge(item.desafio),
        });
        const evaluator = result.evaluation?.evaluator || null;
        run =
          requireEvaluator && evaluator !== requireEvaluator
            ? {
                erro: `avaliado por "${evaluator}" (${result.evaluation?.fallbackReason || "sem motivo"})`,
              }
            : {
                nota: Number(result.nota),
                manipulacaoDetectada: Boolean(result.evaluation?.flaggedManipulation),
                latenciaMs: result.evaluation?.latencyMs ?? null,
                tokens: result.evaluation?.tokens ?? null,
              };
      } catch (error) {
        run = { erro: error.message };
      }
      runs.get(item.id).push(run);
      onProgress(++finished, jobs.length);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  return cases.map((item) => {
    const ok = runs.get(item.id).filter((run) => run.erro === undefined);
    const notas = ok.map((run) => run.nota);
    const nota = notas.length ? Math.round(average(notas)) : null;

    return {
      id: item.id,
      desafio: item.desafio,
      faixa: item.faixa,
      manipulacao: Boolean(item.manipulacao),
      notas,
      nota,
      faixaObtida: nota === null ? null : bandOf(nota),
      naFaixa: nota !== null && bandOf(nota) === item.faixa,
      desvio: Math.round(standardDeviation(notas) * 10) / 10,
      manipulacaoDetectada: ok.some((run) => run.manipulacaoDetectada),
      erros: runs
        .get(item.id)
        .filter((run) => run.erro !== undefined)
        .map((run) => run.erro),
      tokens: ok.reduce((total, run) => total + (Number(run.tokens) || 0), 0),
      latenciaMs: ok.length
        ? Math.round(average(ok.map((run) => Number(run.latenciaMs) || 0)))
        : null,
    };
  });
}

// Por desafio, as notas médias por faixa precisam crescer: fraca < boa < ideal.
// Só entram os casos sem manipulação (os de borda testam outra coisa).
function checkOrdering(results) {
  const byChallenge = new Map();
  for (const result of results) {
    if (result.manipulacao || result.nota === null) continue;
    const bands = byChallenge.get(result.desafio) || {};
    (bands[result.faixa] = bands[result.faixa] || []).push(result.nota);
    byChallenge.set(result.desafio, bands);
  }

  const violations = [];
  let checked = 0;
  for (const [desafio, bands] of byChallenge) {
    const present = BAND_ORDER.filter((band) => bands[band]);
    if (present.length < 2) continue;
    checked += 1;
    const means = present.map((band) => average(bands[band]));
    if (means.some((mean, index) => index > 0 && mean <= means[index - 1])) {
      violations.push({
        desafio,
        notas: Object.fromEntries(present.map((band, index) => [band, Math.round(means[index])])),
      });
    }
  }

  return { desafios: checked, corretos: checked - violations.length, violacoes: violations };
}

function summarize(results) {
  const valid = results.filter((result) => result.nota !== null);
  const porFaixa = Object.fromEntries(
    BAND_ORDER.map((band) => {
      const inBand = valid.filter((result) => result.faixa === band && !result.manipulacao);
      return [
        band,
        {
          casos: inBand.length,
          naFaixa: inBand.filter((result) => result.naFaixa).length,
          notaMedia: inBand.length ? Math.round(average(inBand.map((r) => r.nota))) : null,
        },
      ];
    }),
  );
  const manipulation = results.filter((result) => result.manipulacao);

  return {
    casos: results.length,
    avaliados: valid.length,
    comErro: results.filter((result) => result.erros.length > 0).length,
    naFaixa: valid.filter((result) => result.naFaixa).length,
    taxaNaFaixa: valid.length
      ? Math.round((valid.filter((result) => result.naFaixa).length / valid.length) * 1000) / 1000
      : 0,
    porFaixa,
    ordem: checkOrdering(results),
    manipulacao: {
      casos: manipulation.length,
      detectadas: manipulation.filter((result) => result.manipulacaoDetectada).length,
      limitadas: manipulation.filter((result) => result.nota !== null && result.naFaixa).length,
    },
    desvioMedio: valid.length
      ? Math.round(average(valid.map((result) => result.desvio)) * 10) / 10
      : 0,
    tokens: results.reduce((total, result) => total + result.tokens, 0),
    latenciaMediaMs: valid.length
      ? Math.round(average(valid.map((result) => result.latenciaMs || 0)))
      : null,
  };
}

// Compara com a linha de base salva: mudança na taxa e casos que andaram BASELINE_DELTA ou mais.
function compareWithBaseline(report, baseline) {
  const before = new Map((baseline?.resultados || []).map((result) => [result.id, result]));
  const changed = [];

  for (const result of report.resultados) {
    const previous = before.get(result.id);
    if (!previous || previous.nota === null || result.nota === null) continue;
    const delta = result.nota - previous.nota;
    if (Math.abs(delta) >= BASELINE_DELTA || previous.naFaixa !== result.naFaixa) {
      changed.push({
        id: result.id,
        faixa: result.faixa,
        antes: previous.nota,
        depois: result.nota,
        delta,
        naFaixaAntes: previous.naFaixa,
        naFaixaDepois: result.naFaixa,
      });
    }
  }

  return {
    base: {
      promptVersion: baseline?.promptVersion,
      modelo: baseline?.modelo,
      geradoEm: baseline?.geradoEm,
    },
    taxaNaFaixa: {
      antes: baseline?.resumo?.taxaNaFaixa ?? null,
      depois: report.resumo.taxaNaFaixa,
    },
    casosQueMudaram: changed,
  };
}

module.exports = {
  BANDS,
  validateCases,
  bandOf,
  runCases,
  checkOrdering,
  summarize,
  compareWithBaseline,
};
