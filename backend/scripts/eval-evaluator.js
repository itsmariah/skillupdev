// Avalia o avaliador de IA sobre o conjunto fixo de casos (backend/evals/evaluator-cases.json).
// Uso: npm run eval:ai -- [opções]
//   --repeticoes N    roda cada caso N vezes (mede a variação da nota; padrão 1)
//   --concorrencia N  chamadas simultâneas à API (padrão 4)
//   --minimo 0.8      taxa mínima de notas na faixa; abaixo dela o script sai com erro
//   --salvar-base     grava este resultado como linha de base (backend/evals/baseline.json)
//   --heuristica      roda sem a API, com a análise de reserva (só para testar o script)
// Precisa de OPENAI_API_KEY (backend/.env). Não usa o banco: os desafios vêm da semente.
// Custo aproximado com gpt-4o-mini: alguns centavos de dólar por rodada (57 casos).
const fs = require("fs");
const path = require("path");

const { OPENAI_MODEL } = require("../src/config");
const { getChallengeById } = require("../src/content/catalog");
const { PROMPT_VERSION, evaluateOpenChallengeWithAI } = require("../src/services/evaluation");
const {
  BANDS,
  validateCases,
  runCases,
  summarize,
  compareWithBaseline,
} = require("../src/services/evaluatorEval");

const EVALS_DIR = path.join(__dirname, "..", "evals");
const CASES_FILE = path.join(EVALS_DIR, "evaluator-cases.json");
const BASELINE_FILE = path.join(EVALS_DIR, "baseline.json");
const REPORTS_DIR = path.join(EVALS_DIR, "reports");

function parseArgs(argv) {
  const options = {
    repeticoes: 1,
    concorrencia: 4,
    minimo: 0.8,
    salvarBase: false,
    heuristica: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--salvar-base") options.salvarBase = true;
    else if (arg === "--heuristica") options.heuristica = true;
    else if (["--repeticoes", "--concorrencia", "--minimo"].includes(arg)) {
      options[arg.slice(2)] = Number(argv[++index]);
    } else {
      throw new Error(`Opção desconhecida: ${arg}`);
    }
  }
  return options;
}

const percent = (value) => `${Math.round(value * 100)}%`;

function printReport(report, comparison) {
  const { resumo } = report;
  console.log(`\nPrompt ${report.promptVersion} · modelo ${report.modelo}`);
  console.log(
    `Na faixa esperada: ${resumo.naFaixa}/${resumo.avaliados} (${percent(resumo.taxaNaFaixa)})`,
  );
  for (const [band, data] of Object.entries(resumo.porFaixa)) {
    const [min, max] = BANDS[band];
    console.log(
      `  ${band.padEnd(6)} (${min}-${max}): ${data.naFaixa}/${data.casos} na faixa, nota média ${data.notaMedia ?? "—"}`,
    );
  }
  console.log(
    `Ordem fraca < boa < ideal: ${resumo.ordem.corretos}/${resumo.ordem.desafios} desafios`,
  );
  for (const violation of resumo.ordem.violacoes) {
    console.log(`  fora de ordem: ${violation.desafio} ${JSON.stringify(violation.notas)}`);
  }
  console.log(
    `Manipulação: ${resumo.manipulacao.detectadas}/${resumo.manipulacao.casos} detectadas, ${resumo.manipulacao.limitadas}/${resumo.manipulacao.casos} com nota baixa`,
  );
  if (resumo.retentativas.casos) {
    console.log(
      `Novas tentativas: ${resumo.retentativas.naFaixa}/${resumo.retentativas.casos} na faixa, deslocamento médio da nota pela tentativa anterior: ${resumo.retentativas.deslocamentoMedio ?? "—"} pontos`,
    );
  }
  if (report.repeticoes > 1) console.log(`Desvio médio entre repetições: ${resumo.desvioMedio}`);
  console.log(
    `Tokens: ${resumo.tokens} · latência média: ${resumo.latenciaMediaMs ?? "—"} ms · casos com erro: ${resumo.comErro}`,
  );

  const outside = report.resultados.filter((result) => result.nota !== null && !result.naFaixa);
  if (outside.length) {
    console.log("\nFora da faixa:");
    for (const result of outside) {
      console.log(
        `  ${result.id}: esperada ${result.faixa}, nota ${result.nota} (${result.faixaObtida})`,
      );
    }
  }
  const retries = report.resultados.filter((result) => result.feedbacks?.length);
  if (retries.length) {
    console.log("\nEvolução nas novas tentativas (para ler):");
    for (const result of retries) {
      const evolution = result.feedbacks[0].split(" O que foi bem:")[0];
      console.log(`  ${result.id}: ${evolution}`);
    }
  }
  for (const result of report.resultados.filter((item) => item.erros.length)) {
    console.log(`  erro em ${result.id}: ${result.erros[0]}`);
  }

  if (comparison) {
    const { antes, depois } = comparison.taxaNaFaixa;
    console.log(
      `\nComparação com a linha de base (${comparison.base.promptVersion} · ${comparison.base.modelo}): ${percent(antes)} → ${percent(depois)}`,
    );
    for (const change of comparison.casosQueMudaram) {
      console.log(
        `  ${change.id} (${change.faixa}): ${change.antes} → ${change.depois} (${change.delta > 0 ? "+" : ""}${change.delta})`,
      );
    }
    if (!comparison.casosQueMudaram.length) console.log("  nenhum caso mudou 10 pontos ou mais");
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.heuristica && !process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY não definida. Configure em backend/.env (ou use --heuristica).",
    );
  }

  const data = JSON.parse(fs.readFileSync(CASES_FILE, "utf8"));
  const errors = validateCases(data, getChallengeById);
  if (errors.length) throw new Error(`Casos inválidos:\n  ${errors.join("\n  ")}`);

  const evaluator = options.heuristica ? "heuristic" : "ai";
  if (options.heuristica) delete process.env.OPENAI_API_KEY;

  console.log(
    `${data.casos.length} casos × ${options.repeticoes} repetição(ões), avaliador: ${evaluator}`,
  );
  const resultados = await runCases({
    cases: data.casos,
    evaluate: evaluateOpenChallengeWithAI,
    getChallenge: getChallengeById,
    repetitions: options.repeticoes,
    concurrency: options.concorrencia,
    requireEvaluator: evaluator,
    onProgress: (done, total) => process.stdout.write(`\r  ${done}/${total}`),
  });

  const report = {
    geradoEm: new Date().toISOString(),
    avaliador: evaluator,
    promptVersion: options.heuristica ? null : PROMPT_VERSION,
    modelo: options.heuristica ? "heurística" : OPENAI_MODEL,
    repeticoes: options.repeticoes,
    resumo: summarize(resultados),
    resultados,
  };

  const baseline = fs.existsSync(BASELINE_FILE)
    ? JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"))
    : null;
  const comparison = baseline ? compareWithBaseline(report, baseline) : null;
  printReport(report, comparison);

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = report.geradoEm.replace(/[:.]/g, "-");
  const reportFile = path.join(REPORTS_DIR, `${stamp}-${evaluator}.json`);
  fs.writeFileSync(reportFile, JSON.stringify({ ...report, comparacao: comparison }, null, 2));
  console.log(`\nRelatório: ${path.relative(process.cwd(), reportFile)}`);

  if (options.salvarBase) {
    fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Linha de base salva em ${path.relative(process.cwd(), BASELINE_FILE)}`);
  }

  if (report.resumo.taxaNaFaixa < options.minimo || report.resumo.comErro > 0) {
    console.error(
      `\nAbaixo do mínimo (${percent(options.minimo)}) ou com erros: revise antes de publicar a mudança.`,
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
