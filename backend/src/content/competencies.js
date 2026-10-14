// Taxonomia de soft skills: 5 competências (as categorias dos desafios), cada uma com suas
// habilidades. Cada habilidade tem uma rubrica em três faixas, usada no prompt da IA, e
// palavras-chave para a análise automática de reserva (quando a IA está indisponível).
// Um desafio de qualquer categoria pode exercitar habilidades de outras competências.

const COMPETENCIES = [
  {
    id: "comunicacao",
    nome: "Comunicação",
    descricao: "Fazer a mensagem certa chegar à pessoa certa, do jeito certo.",
    habilidades: [
      {
        id: "clareza-objetividade",
        nome: "Clareza e objetividade",
        descricao: "Dizer o essencial de forma direta e fácil de entender.",
        rubrica: {
          fraca: "Mensagem vaga, confusa ou que deixa a outra pessoa sem saber o que fazer.",
          boa: "Mensagem compreensível, mas com rodeios ou faltando um ponto importante.",
          ideal: "Mensagem direta e completa: contexto, ponto principal e próximo passo claros.",
        },
        palavrasChave: ["objetivo", "claro", "explicar", "resumo", "passo", "alinhar", "mensagem"],
      },
      {
        id: "adaptacao-publico",
        nome: "Adaptação ao público",
        descricao: "Ajustar linguagem e nível de detalhe a quem está ouvindo.",
        rubrica: {
          fraca: "Usa jargão ou detalhes técnicos que o público não acompanha.",
          boa: "Simplifica, mas sem conectar ao que importa para quem ouve.",
          ideal: "Traduz o técnico em impacto e exemplos que fazem sentido para o público.",
        },
        palavrasChave: [
          "simples",
          "analogia",
          "exemplo",
          "impacto",
          "resumindo",
          "sem termo tecnico",
        ],
      },
      {
        id: "transparencia",
        nome: "Transparência",
        descricao: "Compartilhar problemas, riscos e limites cedo e com honestidade.",
        rubrica: {
          fraca: "Esconde, adia ou minimiza o problema.",
          boa: "Informa o problema, mas sem impacto ou próximos passos.",
          ideal: "Informa cedo, explica o impacto e propõe um caminho.",
        },
        palavrasChave: [
          "transparente",
          "honesto",
          "informar",
          "avisar",
          "risco",
          "atraso",
          "impacto",
        ],
      },
      {
        id: "assertividade",
        nome: "Assertividade",
        descricao: "Defender uma posição ou dar um retorno difícil com firmeza e respeito.",
        rubrica: {
          fraca: "Fica em silêncio, cede sem argumento ou é agressivo.",
          boa: "Se posiciona, mas de forma vaga ou sem propor alternativa.",
          ideal: "Se posiciona com clareza e respeito, com argumento e alternativa concreta.",
        },
        palavrasChave: [
          "direto",
          "proponho",
          "precisa",
          "recomendo",
          "respeito",
          "sugiro",
          "percebi",
        ],
      },
    ],
  },
  {
    id: "trabalho-em-equipe",
    nome: "Trabalho em Equipe",
    descricao: "Construir resultados junto com outras pessoas.",
    habilidades: [
      {
        id: "colaboracao",
        nome: "Colaboração",
        descricao: "Envolver as pessoas, construir acordos e dividir o trabalho.",
        rubrica: {
          fraca: "Decide ou resolve sozinho, sem envolver quem é afetado.",
          boa: "Envolve o time, mas sem acordos claros sobre quem faz o quê.",
          ideal: "Envolve as pessoas certas, busca consenso e combina responsabilidades.",
        },
        palavrasChave: ["equipe", "junto", "time", "alinhar", "colaborar", "consenso", "mediar"],
      },
      {
        id: "acolhimento",
        nome: "Acolhimento",
        descricao: "Fazer quem chega ou tem dificuldade se sentir parte do time.",
        rubrica: {
          fraca: "Deixa a pessoa se virar sozinha.",
          boa: "Oferece ajuda pontual, sem um plano de integração.",
          ideal: "Cria espaço seguro, apresenta pessoas e contexto e acompanha a evolução.",
        },
        palavrasChave: [
          "acolher",
          "apresentar",
          "ajudar",
          "integrar",
          "mentor",
          "acompanhar",
          "duvida",
        ],
      },
      {
        id: "comunicacao-assincrona",
        nome: "Comunicação assíncrona",
        descricao: "Manter o time alinhado por escrito, sem depender de reuniões.",
        rubrica: {
          fraca: "Informação espalhada ou só em conversas, sem registro.",
          boa: "Registra por escrito, mas sem rotina ou combinados claros.",
          ideal: "Define canais, rotina e registros que deixam todos alinhados sem reunião.",
        },
        palavrasChave: [
          "documentar",
          "registrar",
          "canal",
          "status",
          "escrito",
          "atualizacao",
          "rotina",
        ],
      },
    ],
  },
  {
    id: "resolucao-de-problemas",
    nome: "Resolução de Problemas",
    descricao: "Entender o problema antes de agir e chegar a soluções sustentáveis.",
    habilidades: [
      {
        id: "investigacao",
        nome: "Investigação",
        descricao: "Buscar evidências e a causa real antes de concluir.",
        rubrica: {
          fraca: "Age por palpite, sem olhar dados ou fazer perguntas.",
          boa: "Coleta algumas informações, mas tira conclusões cedo.",
          ideal: "Usa logs, dados e perguntas para chegar à causa antes de agir.",
        },
        palavrasChave: [
          "log",
          "hipotese",
          "causa",
          "evidencia",
          "investigar",
          "metrica",
          "perguntar",
        ],
      },
      {
        id: "metodo-raciocinio",
        nome: "Método e raciocínio lógico",
        descricao: "Quebrar o problema em partes e avançar por etapas verificáveis.",
        rubrica: {
          fraca: "Tenta várias coisas ao mesmo tempo, sem ordem.",
          boa: "Segue uma ordem, mas sem validar cada etapa.",
          ideal: "Decompõe o problema, testa hipóteses e valida cada passo.",
        },
        palavrasChave: [
          "diagnosticar",
          "isolar",
          "validar",
          "testar",
          "etapa",
          "quebrar",
          "comparar",
        ],
      },
      {
        id: "visao-tecnica",
        nome: "Visão técnica",
        descricao: "Pesar custos, riscos e benefícios técnicos de cada caminho.",
        rubrica: {
          fraca: "Ignora riscos ou consequências técnicas.",
          boa: "Cita riscos técnicos, sem ligar ao impacto no produto.",
          ideal: "Compara caminhos por custo, risco e impacto e justifica a escolha.",
        },
        palavrasChave: [
          "risco",
          "trade-off",
          "custo",
          "arquitetura",
          "manutencao",
          "qualidade",
          "impacto",
        ],
      },
      {
        id: "proatividade",
        nome: "Proatividade",
        descricao: "Antecipar problemas e agir antes que alguém peça.",
        rubrica: {
          fraca: "Espera o problema crescer ou alguém mandar agir.",
          boa: "Age quando percebe o problema, mas sem prevenir os próximos.",
          ideal: "Antecipa o problema, age cedo e propõe como evitar que se repita.",
        },
        palavrasChave: [
          "antecipar",
          "propor",
          "iniciativa",
          "prevenir",
          "antes",
          "sugerir",
          "levantar",
        ],
      },
    ],
  },
  {
    id: "gestao-de-tempo",
    nome: "Gestão de Tempo",
    descricao: "Organizar o trabalho para entregar o que importa no prazo.",
    habilidades: [
      {
        id: "planejamento-organizacao",
        nome: "Planejamento e organização",
        descricao: "Transformar o trabalho em um plano com etapas e prazos.",
        rubrica: {
          fraca: "Começa sem plano e descobre os problemas no caminho.",
          boa: "Tem um plano geral, sem etapas ou estimativas.",
          ideal: "Divide em etapas, estima, reserva tempo e revisa o plano.",
        },
        palavrasChave: ["planejar", "mapear", "etapa", "estimar", "organizar", "agenda", "bloco"],
      },
      {
        id: "priorizacao",
        nome: "Priorização",
        descricao: "Decidir o que vem primeiro pelo impacto e pela urgência real.",
        rubrica: {
          fraca: "Faz o que aparece primeiro ou o que é mais fácil.",
          boa: "Prioriza, mas sem critério explícito.",
          ideal: "Prioriza por impacto e urgência e comunica o que fica para depois.",
        },
        palavrasChave: [
          "priorizar",
          "impacto",
          "urgencia",
          "ordem",
          "primeiro",
          "critico",
          "prazo",
        ],
      },
      {
        id: "foco",
        nome: "Foco",
        descricao: "Proteger o tempo de trabalho profundo das interrupções.",
        rubrica: {
          fraca: "Atende tudo na hora e perde o fio da tarefa principal.",
          boa: "Tenta se concentrar, sem uma estratégia para as interrupções.",
          ideal: "Reserva blocos de foco e combina como as interrupções serão tratadas.",
        },
        palavrasChave: [
          "foco",
          "bloco",
          "concentrar",
          "interrupcao",
          "notificacao",
          "pausa",
          "proteger",
        ],
      },
      {
        id: "negociacao-prazos",
        nome: "Negociação de prazos e escopo",
        descricao: "Ajustar prazo, escopo ou recursos quando a conta não fecha.",
        rubrica: {
          fraca: "Aceita o impossível ou recusa sem explicar.",
          boa: "Aponta que não cabe, sem propor alternativa.",
          ideal: "Mostra o impacto e oferece opções de escopo, prazo ou prioridade.",
        },
        palavrasChave: [
          "negociar",
          "escopo",
          "prazo",
          "alternativa",
          "combinar",
          "trade-off",
          "realista",
        ],
      },
    ],
  },
  {
    id: "inteligencia-emocional",
    nome: "Inteligência Emocional",
    descricao: "Reconhecer e lidar com as próprias emoções e as dos outros.",
    habilidades: [
      {
        id: "autoconhecimento",
        nome: "Autoconhecimento",
        descricao: "Reconhecer os próprios limites, gatilhos e pontos fortes.",
        rubrica: {
          fraca: "Não reconhece o que sente ou culpa só o contexto.",
          boa: "Reconhece o que sente, sem ligar isso à forma de agir.",
          ideal: "Nomeia o que sente, entende o porquê e ajusta a forma de agir.",
        },
        palavrasChave: [
          "reconhecer",
          "perceber",
          "sinto",
          "limite",
          "refletir",
          "aprender",
          "pontos fortes",
        ],
      },
      {
        id: "controle-emocional-resiliencia",
        nome: "Controle emocional e resiliência",
        descricao: "Manter a calma sob pressão e se recuperar de reveses.",
        rubrica: {
          fraca: "Reage por impulso ou trava diante do problema.",
          boa: "Mantém a calma, mas sem um plano para seguir em frente.",
          ideal: "Mantém a calma, processa o revés e transforma em aprendizado.",
        },
        palavrasChave: [
          "calma",
          "respirar",
          "equilibrio",
          "seguir",
          "adaptar",
          "recuperar",
          "aprendizado",
        ],
      },
      {
        id: "empatia",
        nome: "Empatia",
        descricao: "Entender o ponto de vista e o momento da outra pessoa.",
        rubrica: {
          fraca: "Ignora ou julga o que a outra pessoa está vivendo.",
          boa: "Reconhece o sentimento do outro, sem oferecer apoio concreto.",
          ideal: "Escuta, valida o sentimento e oferece apoio adequado ao momento.",
        },
        palavrasChave: ["entendo", "compreendo", "ouvir", "escutar", "apoio", "ajudar", "sentir"],
      },
      {
        id: "responsabilidade-maturidade",
        nome: "Responsabilidade e maturidade",
        descricao: "Assumir a própria parte e agir com profissionalismo.",
        rubrica: {
          fraca: "Transfere a culpa ou evita o assunto.",
          boa: "Assume a responsabilidade, sem plano de correção.",
          ideal: "Assume a sua parte, corrige o rumo e acompanha até resolver.",
        },
        palavrasChave: [
          "assumir",
          "responsabilidade",
          "resolver",
          "acompanhar",
          "compromisso",
          "corrigir",
        ],
      },
    ],
  },
];

// Níveis de dificuldade dos desafios (base das trilhas).
// Básico: situação clara, um interlocutor, uma resposta claramente melhor.
// Intermediário: interesses em conflito, duas habilidades em jogo, um trade-off a explicar.
// Avançado: ambiguidade, várias partes, pressão e nenhuma resposta óbvia (quase sempre aberto).
const DIFFICULTIES = [
  { id: "basico", nome: "Básico" },
  { id: "intermediario", nome: "Intermediário" },
  { id: "avancado", nome: "Avançado" },
];
const DIFFICULTY_IDS = DIFFICULTIES.map((difficulty) => difficulty.id);

const SKILLS = COMPETENCIES.flatMap((competency) =>
  competency.habilidades.map((skill) => ({ ...skill, competencia: competency.id })),
);
const SKILLS_BY_ID = new Map(SKILLS.map((skill) => [skill.id, skill]));
const COMPETENCY_BY_NAME = new Map(COMPETENCIES.map((competency) => [competency.nome, competency]));

function getSkillById(id) {
  return SKILLS_BY_ID.get(id) || null;
}

function getCompetencyByName(nome) {
  return COMPETENCY_BY_NAME.get(nome) || null;
}

// Versão pública (API): sem as palavras-chave, que só servem à análise de reserva.
function buildPublicTaxonomy() {
  return COMPETENCIES.map((competency) => ({
    id: competency.id,
    nome: competency.nome,
    descricao: competency.descricao,
    habilidades: competency.habilidades.map(({ id, nome, descricao, rubrica }) => ({
      id,
      nome,
      descricao,
      rubrica,
    })),
  }));
}

module.exports = {
  DIFFICULTIES,
  DIFFICULTY_IDS,
  COMPETENCIES,
  SKILLS,
  getSkillById,
  getCompetencyByName,
  buildPublicTaxonomy,
};
