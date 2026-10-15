// Semente das badges: gravada no banco na primeira inicialização com a migração 009.
// Depois disso, as badges são editadas no painel admin (aba Badges).
// As 12 primeiras são as badges originais (antes ficavam no código, com uma função cada),
// agora como regras; o comportamento é o mesmo. As demais entram desativadas: são sugestões
// para as trilhas e as competências novas, para revisar e ativar no painel.
const BADGE_XP = { comum: 50, raro: 100, epico: 200, lendario: 400 };
const RARITIES = Object.keys(BADGE_XP);

const completeCompetency = (id, name, competencia) => ({
  id,
  name,
  description: `Complete todos os desafios de ${competencia}.`,
  rarity: "raro",
  rule: { tipo: "competencia_completa", competencia },
  active: false,
});

const SEED_BADGES = [
  // Comum
  {
    id: "first-mission",
    name: "Primeira Missão",
    description: "Conclua seu primeiro desafio na plataforma.",
    rarity: "comum",
    rule: { tipo: "desafios_concluidos", quantidade: 1 },
    active: true,
  },
  {
    id: "communicator-beginner",
    name: "Comunicador Iniciante",
    description: "Complete 3 desafios de Comunicação.",
    rarity: "comum",
    rule: { tipo: "desafios_concluidos", quantidade: 3, competencia: "Comunicação" },
    active: true,
  },
  {
    id: "explorer",
    name: "Explorador",
    description: "Complete ao menos 1 desafio em 3 categorias diferentes.",
    rarity: "comum",
    rule: { tipo: "competencias_exploradas", quantidade: 3 },
    active: true,
  },
  // Raro
  {
    id: "collaborative-dev",
    name: "Dev Colaborativo",
    description: "Complete todos os desafios de Trabalho em Equipe.",
    rarity: "raro",
    rule: { tipo: "competencia_completa", competencia: "Trabalho em Equipe" },
    active: true,
  },
  {
    id: "time-master",
    name: "Mestre do Tempo",
    description: "Complete todos os desafios de Gestão de Tempo.",
    rarity: "raro",
    rule: { tipo: "competencia_completa", competencia: "Gestão de Tempo" },
    active: true,
  },
  {
    id: "conflict-mediator",
    name: "Mediador de Conflitos",
    description: "Obtenha resposta ideal nos dois desafios de conflito entre colegas.",
    rarity: "raro",
    rule: { tipo: "ideal_nos_desafios", desafios: ["teamwork-closed-2", "teamwork-open-2"] },
    active: true,
  },
  // Épico
  {
    id: "specialist",
    name: "Especialista",
    description: "Complete todos os desafios de 4 categorias diferentes.",
    rarity: "epico",
    rule: { tipo: "competencias_completas", quantidade: 4 },
    active: true,
  },
  {
    id: "perfectionist",
    name: "Perfeccionista",
    description: "Acumule 15 respostas ideais no total.",
    rarity: "epico",
    rule: { tipo: "respostas_ideais", quantidade: 15 },
    active: true,
  },
  {
    id: "leader-in-formation",
    name: "Líder em Formação",
    description: "Alcance o nível 3.",
    rarity: "epico",
    rule: { tipo: "nivel_xp", nivel: 3 },
    active: true,
  },
  // Lendário
  {
    id: "legendary-streak",
    name: "Sequência Lendária",
    description: "Alcance 5 respostas ideais consecutivas.",
    rarity: "lendario",
    rule: { tipo: "sequencia_perfeita", quantidade: 5 },
    active: true,
  },
  {
    id: "full-dev",
    name: "360° Dev",
    description: "Complete todos os desafios da plataforma.",
    rarity: "lendario",
    rule: { tipo: "todos_os_desafios" },
    active: true,
  },
  {
    id: "soft-skill-master",
    name: "Soft Skill Master",
    description: "Alcance o nível máximo da plataforma.",
    rarity: "lendario",
    rule: { tipo: "nivel_xp", nivel: 5 },
    active: true,
  },
  // Sugestões (desativadas): competências e trilhas
  completeCompetency("clear-voice", "Voz Clara", "Comunicação"),
  completeCompetency("root-cause-hunter", "Caçador de Causas", "Resolução de Problemas"),
  completeCompetency("calm-mind", "Mente Serena", "Inteligência Emocional"),
  completeCompetency("team-reference", "Referência do Time", "Liderança"),
  completeCompetency("lifelong-learner", "Aprendiz Constante", "Adaptabilidade e Aprendizado"),
  completeCompetency("questioner", "Questionador", "Pensamento Crítico"),
  completeCompetency("ethical-compass", "Bússola Ética", "Ética Profissional"),
  completeCompetency("bridge-builder", "Ponte entre Pessoas", "Feedback e Conflitos"),
  {
    id: "first-advanced",
    name: "Primeiro Avançado",
    description: "Conclua seu primeiro desafio de nível avançado.",
    rarity: "raro",
    rule: { tipo: "desafios_concluidos", quantidade: 1, dificuldade: "avancado" },
    active: false,
  },
  {
    id: "advanced-veteran",
    name: "Veterano dos Avançados",
    description: "Conclua 10 desafios de nível avançado.",
    rarity: "epico",
    rule: { tipo: "desafios_concluidos", quantidade: 10, dificuldade: "avancado" },
    active: false,
  },
  {
    id: "all-trails-explorer",
    name: "Explorador de Trilhas",
    description: "Conclua ao menos 1 desafio em todas as 10 competências.",
    rarity: "raro",
    rule: { tipo: "competencias_exploradas", quantidade: 10 },
    active: false,
  },
  {
    id: "solid-foundation",
    name: "Base Sólida",
    description: "Conclua 20 desafios de nível básico.",
    rarity: "raro",
    rule: { tipo: "desafios_concluidos", quantidade: 20, dificuldade: "basico" },
    active: false,
  },
];

module.exports = { BADGE_XP, RARITIES, SEED_BADGES };
