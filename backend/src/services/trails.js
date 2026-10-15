// Trilhas: cada competência é uma trilha com três níveis (básico, intermediário, avançado).
// O básico está sempre liberado; cada nível seguinte libera quando a pessoa conclui 75% dos
// desafios publicados do nível anterior (3 de 4). Concluir é ter respondido ao menos uma vez,
// com qualquer nota: a nota aparece no feedback e o refazer existe para melhorar.
// Um desafio já respondido continua liberado para refazer, mesmo que o nível esteja bloqueado
// (quem respondeu antes das trilhas existirem não perde nada).
const { COMPETENCIES, DIFFICULTIES } = require("../content/competencies");
const { getChallenges } = require("../content/catalog");

const TRAIL_UNLOCK_RATIO = 0.75;

const requiredToUnlock = (total) => Math.ceil(total * TRAIL_UNLOCK_RATIO);

function buildTrail(competency, challenges, answeredIds) {
  const ofCompetency = challenges.filter((challenge) => challenge.categoria === competency.nome);
  let previousLevelMet = true;

  const niveis = DIFFICULTIES.map((difficulty) => {
    const desafios = ofCompetency
      .filter((challenge) => challenge.dificuldade === difficulty.id)
      .map((challenge) => ({
        id: challenge.id,
        titulo: challenge.titulo,
        tipo: challenge.tipo,
        concluido: answeredIds.has(challenge.id),
      }));
    const concluidos = desafios.filter((desafio) => desafio.concluido).length;
    const necessarios = requiredToUnlock(desafios.length);
    const liberado = previousLevelMet;

    // Nível vazio não trava a trilha: quem vem depois herda a situação dele.
    previousLevelMet = liberado && concluidos >= necessarios;

    return {
      dificuldade: difficulty.id,
      nome: difficulty.nome,
      total: desafios.length,
      concluidos,
      necessarios,
      liberado,
      desafios: desafios.map((desafio) => ({
        ...desafio,
        liberado: liberado || desafio.concluido,
      })),
    };
  });

  const desafios = niveis.flatMap((nivel) => nivel.desafios);
  const proximo = desafios.find((desafio) => desafio.liberado && !desafio.concluido) || null;

  return {
    id: competency.id,
    nome: competency.nome,
    descricao: competency.descricao,
    total: desafios.length,
    concluidos: desafios.filter((desafio) => desafio.concluido).length,
    proximoId: proximo ? proximo.id : null,
    niveis,
  };
}

// attempts: tentativas da pessoa (qualquer tentativa conta como resposta).
// Só entram competências com desafio publicado, como no resto da interface.
function buildTrails(attempts, challenges = getChallenges()) {
  const answeredIds = new Set((attempts || []).map((attempt) => attempt.challengeId));

  return COMPETENCIES.map((competency) => buildTrail(competency, challenges, answeredIds)).filter(
    (trail) => trail.total > 0,
  );
}

// Ids dos desafios que a pessoa pode responder agora.
function getUnlockedChallengeIds(attempts, challenges = getChallenges()) {
  const unlocked = new Set();

  for (const trail of buildTrails(attempts, challenges)) {
    for (const nivel of trail.niveis) {
      for (const desafio of nivel.desafios) {
        if (desafio.liberado) unlocked.add(desafio.id);
      }
    }
  }

  return unlocked;
}

module.exports = {
  TRAIL_UNLOCK_RATIO,
  requiredToUnlock,
  buildTrails,
  getUnlockedChallengeIds,
};
