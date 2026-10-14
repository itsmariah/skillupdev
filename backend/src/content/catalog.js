// Catálogo de desafios em memória. A fonte é o banco (tabelas challenges/challenge_versions),
// carregado na inicialização e recarregado quando o admin publica ou arquiva. Antes da carga
// (testes de unidade, scripts), o catálogo usa a semente de content/challenges.js.
// A interface é síncrona, como era quando os desafios ficavam só no código.
const {
  CHALLENGES: SEED_CHALLENGES,
  createClosedChallenge,
  createOpenChallenge,
} = require("./challenges");
const { COMPETENCIES } = require("./competencies");

const CATEGORIES = COMPETENCIES.map((competency) => competency.nome);

let published = [];
let publishedById = new Map();
let versionsByKey = new Map();

const versionKey = (id, version) => `${id}@${version}`;

// Conteúdo editável de um desafio (o que vai para challenge_versions.content).
function contentOf(challenge) {
  const content = {
    categoria: challenge.categoria,
    habilidades: [...challenge.habilidades],
    titulo: challenge.titulo,
    pergunta: challenge.pergunta,
    descricao: challenge.descricao || "",
    dica: challenge.dica || "",
  };

  if (challenge.tipo === "fechado") {
    content.respostas = challenge.respostas.map(({ id, texto, xp, feedback }) => ({
      id,
      texto,
      xp,
      feedback,
    }));
  }

  return content;
}

// Monta o objeto de desafio usado pelas regras (mesmo formato da semente) a partir do banco.
function buildChallenge({ id, tipo, version, content }) {
  const base =
    tipo === "aberto"
      ? createOpenChallenge({ id, ...content })
      : createClosedChallenge({ id, ...content });

  return { ...base, dica: content.dica || undefined, version };
}

// entries: [{ id, tipo, status, publishedVersion, position, versions: [{ version, content }] }]
function setCatalog(entries) {
  const nextVersions = new Map();
  const nextPublished = [];

  for (const entry of [...entries].sort((a, b) => a.position - b.position)) {
    for (const { version, content } of entry.versions) {
      nextVersions.set(
        versionKey(entry.id, version),
        buildChallenge({ id: entry.id, tipo: entry.tipo, version, content }),
      );
    }

    if (entry.status === "publicado" && entry.publishedVersion) {
      nextPublished.push(nextVersions.get(versionKey(entry.id, entry.publishedVersion)));
    }
  }

  versionsByKey = nextVersions;
  published = nextPublished;
  publishedById = new Map(nextPublished.map((challenge) => [challenge.id, challenge]));
}

function seedEntries() {
  return SEED_CHALLENGES.map((challenge, index) => ({
    id: challenge.id,
    tipo: challenge.tipo,
    status: "publicado",
    publishedVersion: 1,
    position: index + 1,
    versions: [{ version: 1, content: contentOf(challenge) }],
  }));
}

setCatalog(seedEntries());

// Desafios publicados, na ordem de exibição.
function getChallenges() {
  return published;
}

// Versão publicada atual (null para rascunho, arquivado ou inexistente).
function getChallengeById(id) {
  return publishedById.get(id) || null;
}

// Uma versão específica (histórico e exportação). Sem versão, cai na publicada atual.
function getChallengeVersion(id, version) {
  return (
    (version && versionsByKey.get(versionKey(id, version))) ||
    getChallengeById(id) ||
    [...versionsByKey.values()].filter((item) => item.id === id).pop() ||
    null
  );
}

function isPublished(id) {
  return publishedById.has(id);
}

function getCategories() {
  return CATEGORIES;
}

function countPublishedByCategory(categoria) {
  return published.filter((challenge) => challenge.categoria === categoria).length;
}

module.exports = {
  contentOf,
  buildChallenge,
  setCatalog,
  seedEntries,
  getChallenges,
  getChallengeById,
  getChallengeVersion,
  isPublished,
  getCategories,
  countPublishedByCategory,
};
