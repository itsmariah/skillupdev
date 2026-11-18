// Recomendação do próximo passo (roadmap Fase 4). Regras fixas, sem IA: dá para explicar cada
// sugestão e não custa nada. Até RECOMMENDATION_LIMIT desafios diferentes, nesta ordem:
//   1. habilidade: um desafio novo que exercita a habilidade com a nota mais baixa;
//   2. refazer: o desafio aberto com a pior última nota (abaixo da faixa boa), que pode
//      render XP pela melhora;
//   3. liberar: um desafio do nível que está perto de liberar o próximo numa trilha;
//   4. começar: o primeiro desafio de uma trilha ainda não começada.
// Só entram desafios liberados (as trilhas valem aqui também).
const { getChallenges } = require("../content/catalog");
const { DIFFICULTIES } = require("../content/competencies");
const {
  OPEN_CHALLENGE_IDEAL_SCORE,
  OPEN_CHALLENGE_MEDIUM_SCORE,
  latestAttemptPerChallenge,
} = require("./gamification");
const { buildSkillScores } = require("./history");
const { buildTrails } = require("./trails");

const RECOMMENDATION_LIMIT = 3;
// "Perto de liberar": faltam até este número de desafios no nível.
const NEAR_UNLOCK_GAP = 2;

const difficultyOrder = (id) => DIFFICULTIES.findIndex((difficulty) => difficulty.id === id);
const plural = (count, one, many) => (count === 1 ? one : many);

function describeChallenge(challenge, trail) {
  return {
    desafio: {
      id: challenge.id,
      titulo: challenge.titulo,
      tipo: challenge.tipo,
      dificuldade: challenge.dificuldade,
    },
    trilha: { id: trail.id, nome: trail.nome },
  };
}

// Habilidades com nota, da mais baixa para a mais alta (só as abaixo de ideal).
function weakestSkills(currentAttempts) {
  return buildSkillScores(currentAttempts)
    .flatMap((competency) => competency.habilidades)
    .filter((skill) => skill.score !== null && skill.score < OPEN_CHALLENGE_IDEAL_SCORE)
    .sort((a, b) => a.score - b.score);
}

function buildRecommendations(attempts, { challenges = getChallenges() } = {}) {
  const byId = new Map(challenges.map((challenge) => [challenge.id, challenge]));
  const trails = buildTrails(attempts, challenges);
  const trailOf = new Map(
    trails.flatMap((trail) =>
      trail.niveis.flatMap((nivel) => nivel.desafios.map((desafio) => [desafio.id, trail])),
    ),
  );
  // Desafios liberados e ainda não respondidos, do mais fácil para o mais difícil.
  const fresh = trails
    .flatMap((trail) => trail.niveis.flatMap((nivel) => nivel.desafios))
    .filter((desafio) => desafio.liberado && !desafio.concluido)
    .map((desafio) => byId.get(desafio.id))
    .filter(Boolean)
    .sort((a, b) => difficultyOrder(a.dificuldade) - difficultyOrder(b.dificuldade));
  const current = latestAttemptPerChallenge(attempts || []);

  const picked = [];
  const add = (challenge, item) => {
    if (picked.length >= RECOMMENDATION_LIMIT || !challenge) return;
    if (picked.some((entry) => entry.desafio.id === challenge.id)) return;
    picked.push({ ...item, ...describeChallenge(challenge, trailOf.get(challenge.id)) });
  };

  // 1. A habilidade mais fraca que tem desafio novo disponível.
  for (const skill of weakestSkills(current)) {
    const challenge = fresh.find((item) => item.habilidades?.includes(skill.id));
    if (challenge) {
      add(challenge, {
        tipo: "habilidade",
        motivo: `Sua nota em ${skill.nome} está em ${skill.score}, a mais baixa entre as suas habilidades.`,
        habilidade: { id: skill.id, nome: skill.nome, score: skill.score },
      });
      break;
    }
  }

  // 2. O aberto com a pior última nota, se ainda está abaixo da faixa boa.
  const toRetry = current
    .filter((attempt) => attempt.challengeType === "aberto" && byId.has(attempt.challengeId))
    .filter((attempt) => Number(attempt.score) < OPEN_CHALLENGE_MEDIUM_SCORE)
    .sort((a, b) => Number(a.score) - Number(b.score))[0];
  if (toRetry) {
    add(byId.get(toRetry.challengeId), {
      tipo: "refazer",
      motivo: `Sua última nota aqui foi ${toRetry.score}. Refazer pode render XP pela melhora.`,
    });
  }

  // 3. A trilha mais perto de liberar o próximo nível.
  const nearUnlock = trails
    .flatMap((trail) =>
      trail.niveis.slice(0, -1).map((nivel, index) => ({
        trail,
        nivel,
        next: trail.niveis[index + 1],
        gap: nivel.necessarios - nivel.concluidos,
      })),
    )
    .filter(({ nivel, next, gap }) => nivel.liberado && !next.liberado && next.total > 0)
    .filter(({ gap }) => gap > 0 && gap <= NEAR_UNLOCK_GAP)
    .sort((a, b) => a.gap - b.gap);
  for (const { nivel, next, gap, trail } of nearUnlock) {
    const target = nivel.desafios.find((desafio) => !desafio.concluido);
    if (target) {
      add(byId.get(target.id), {
        tipo: "liberar",
        motivo: `${plural(gap, "Falta", "Faltam")} ${gap} ${plural(gap, "desafio", "desafios")} do ${nivel.nome.toLowerCase()} para liberar o ${next.nome.toLowerCase()} em ${trail.nome}.`,
      });
    }
  }

  // 4. Trilhas ainda não começadas (ou, para quem está começando, qualquer trilha).
  for (const trail of trails.filter((item) => item.concluidos === 0)) {
    const first = trail.proximoId && byId.get(trail.proximoId);
    add(first, {
      tipo: "comecar",
      motivo: current.length
        ? `Você ainda não começou a trilha ${trail.nome}.`
        : `Comece pelo básico de ${trail.nome}.`,
    });
  }

  return picked;
}

module.exports = {
  RECOMMENDATION_LIMIT,
  NEAR_UNLOCK_GAP,
  buildRecommendations,
};
