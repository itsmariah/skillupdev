const { getSkillById } = require("./competencies");

// Semente do catálogo: os desafios originais, gravados no banco (versão 1) na primeira
// inicialização. Depois disso, o conteúdo é gerenciado pelo painel admin (content/catalog.js).

const OPEN_CHALLENGE_XP_MULTIPLIER = 1.2;

function createClosedChallenge({
  id,
  categoria,
  habilidades,
  titulo,
  pergunta,
  descricao,
  dica,
  respostas,
}) {
  return {
    id,
    tipo: "fechado",
    categoria,
    habilidades,
    titulo,
    pergunta,
    descricao,
    dica,
    respostas: respostas.map((resposta, index) => ({
      id: String.fromCharCode(97 + index),
      ...resposta,
    })),
  };
}

// Nos abertos, as habilidades são os critérios da avaliação: a IA dá uma nota para cada uma.
function createOpenChallenge({ id, categoria, habilidades, titulo, pergunta, descricao, dica }) {
  return {
    id,
    tipo: "aberto",
    categoria,
    habilidades,
    titulo,
    pergunta,
    descricao,
    criteriosAvaliacao: habilidades.map((skillId) => getSkillById(skillId).nome),
    dica,
    xpMultiplier: OPEN_CHALLENGE_XP_MULTIPLIER,
  };
}

const CHALLENGES = [
  createClosedChallenge({
    id: "communication-closed-1",
    categoria: "Comunicação",
    habilidades: ["empatia", "transparencia"],
    titulo: "Cliente Difícil",
    pergunta:
      "Um cliente envia uma mensagem irritado dizendo que o sistema caiu e está inútil. Como você responde?",
    descricao: "Escolha a alternativa que melhor se adequa à situação.",
    dica: "Priorize cordialidade e transparência. Comunicação técnica sem empatia não resolve conflito.",
    respostas: [
      {
        texto: "Não é problema nosso, deve ser sua rede.",
        xp: 5,
        feedback: "Essa resposta tende a piorar o conflito e passa pouca responsabilidade.",
      },
      {
        texto: "Entendo sua frustração. Vamos verificar e te atualizar.",
        xp: 100,
        feedback: "Boa escolha. Você acolhe a frustração e informa o próximo passo com clareza.",
      },
      {
        texto: "Responder com termos técnicos e complexos sobre servidor.",
        xp: 40,
        feedback: "Existe tentativa de explicar, mas faltam simplicidade e empatia para o momento.",
      },
    ],
  }),
  createClosedChallenge({
    id: "communication-closed-2",
    categoria: "Comunicação",
    habilidades: ["adaptacao-publico", "transparencia"],
    titulo: "Explicando Problema Técnico",
    pergunta:
      "Você precisa explicar para um gestor não técnico por que o deploy foi adiado. Como faz isso?",
    descricao: "Escolha a opção que torna a mensagem mais clara para quem não é técnico.",
    dica: "Traduzir complexidade técnica para linguagem simples é uma habilidade essencial para dev sênior.",
    respostas: [
      {
        texto: "Usar jargões técnicos e detalhar a stack inteira.",
        xp: 40,
        feedback:
          "A resposta pode ser correta tecnicamente, mas dificulta o entendimento do gestor.",
      },
      {
        texto: "Usar uma analogia simples e explicar o impacto do adiamento.",
        xp: 100,
        feedback: "Boa escolha. Você traduz o problema sem perder objetividade nem contexto.",
      },
      {
        texto: 'Dizer apenas "Não deu".',
        xp: 5,
        feedback: "Essa resposta não gera contexto nem confiança para a tomada de decisão.",
      },
    ],
  }),
  createClosedChallenge({
    id: "communication-closed-3",
    categoria: "Comunicação",
    habilidades: ["assertividade", "empatia"],
    titulo: "Feedback Construtivo",
    pergunta: "Um colega entregou um código ruim. Como você reage?",
    descricao: "Escolha a postura com mais respeito e efetividade.",
    dica: "Feedback construtivo combina especificidade com respeito, sem soar rude ou humilhante.",
    respostas: [
      {
        texto: "Criticar o código no grupo para todo mundo ver.",
        xp: 5,
        feedback: "Isso expõe a pessoa e tende a gerar defensividade em vez de aprendizado.",
      },
      {
        texto: "Conversar em privado, mostrar exemplos e sugerir melhorias.",
        xp: 100,
        feedback: "Boa escolha. A mensagem fica clara, respeitosa e orientada a melhoria real.",
      },
      {
        texto: "Refazer tudo sem falar nada.",
        xp: 40,
        feedback:
          "Resolve o curto prazo, mas perde a chance de desenvolver o colega e alinhar o time.",
      },
    ],
  }),
  createClosedChallenge({
    id: "teamwork-closed-1",
    categoria: "Trabalho em Equipe",
    habilidades: ["colaboracao", "priorizacao"],
    titulo: "Priorizar Tarefas com a Equipe",
    pergunta: "Sua equipe tem 6 tarefas e um prazo curto. Como organizar isso?",
    descricao: "Escolha a alternativa com mais colaboração e visão coletiva.",
    dica: "Colaboração melhora a qualidade da decisão e aumenta o comprometimento do time.",
    respostas: [
      {
        texto: "Escolher sozinho o que cada pessoa vai fazer.",
        xp: 40,
        feedback: "Pode parecer ágil, mas reduz alinhamento e o senso de participação do time.",
      },
      {
        texto: "Reunir o time, priorizar junto e delegar com clareza.",
        xp: 100,
        feedback:
          "Boa escolha. Essa postura fortalece alinhamento, foco e responsabilidade compartilhada.",
      },
      {
        texto: "Fazer primeiro as tarefas mais fáceis.",
        xp: 5,
        feedback: "Facilidade não significa prioridade. O time pode deixar o que importa de lado.",
      },
    ],
  }),
  createClosedChallenge({
    id: "teamwork-closed-2",
    categoria: "Trabalho em Equipe",
    habilidades: ["colaboracao", "empatia"],
    titulo: "Conflito entre Colegas",
    pergunta: "Dois devs discordam fortemente sobre uma decisão técnica. O que você faz?",
    descricao: "Escolha a resposta com mais neutralidade e capacidade de mediação.",
    dica: "Mediação vale mais do que polarização quando o objetivo é destravar o time.",
    respostas: [
      {
        texto: "Ignorar o conflito e deixar que eles se resolvam.",
        xp: 40,
        feedback: "Evita desgaste imediato, mas o impasse pode crescer e contaminar o trabalho.",
      },
      {
        texto: "Mediar a conversa e buscar critérios técnicos em comum.",
        xp: 100,
        feedback:
          "Boa escolha. Você ajuda o time a sair da disputa e voltar para a análise do problema.",
      },
      {
        texto: "Tomar o lado de quem você acha melhor.",
        xp: 5,
        feedback: "Escolher um lado cedo demais alimenta a polarização e enfraquece a colaboração.",
      },
    ],
  }),
  createClosedChallenge({
    id: "teamwork-closed-3",
    categoria: "Trabalho em Equipe",
    habilidades: ["colaboracao", "metodo-raciocinio"],
    titulo: "Decisão Coletiva",
    pergunta: "O time precisa escolher entre duas arquiteturas possíveis. Como conduzir a decisão?",
    descricao: "Escolha a opção com mais critério técnico e colaboração.",
    dica: "Decisão técnica precisa de critério. Pressa sozinha não substitui análise.",
    respostas: [
      {
        texto: "Votar rápido para decidir logo.",
        xp: 40,
        feedback: "Pode acelerar, mas corre o risco de simplificar uma decisão que merece análise.",
      },
      {
        texto: "Analisar prós e contras juntos antes de decidir.",
        xp: 100,
        feedback:
          "Boa escolha. O time decide com base em contexto, trade-offs e entendimento comum.",
      },
      {
        texto: "Deixar para depois sem nenhum critério definido.",
        xp: 5,
        feedback: "Postergar sem estrutura aumenta incerteza e dificulta o andamento do projeto.",
      },
    ],
  }),
  createClosedChallenge({
    id: "problem-solving-closed-1",
    categoria: "Resolução de Problemas",
    habilidades: ["investigacao", "controle-emocional-resiliencia"],
    titulo: "Produção Caiu",
    pergunta: "O sistema caiu em produção. Qual é sua primeira postura?",
    descricao: "Escolha a alternativa com mais método e controle da situação.",
    dica: "Em incidentes, metodologia vem antes do impulso. Diagnosticar bem reduz erro na correção.",
    respostas: [
      {
        texto: "Corrigir direto o que parecer mais provável.",
        xp: 40,
        feedback: "Agilidade é importante, mas agir sem diagnóstico pode piorar o incidente.",
      },
      {
        texto: "Diagnosticar, isolar o problema e agir com base no que foi observado.",
        xp: 100,
        feedback:
          "Boa escolha. Essa abordagem reduz risco e aumenta a chance de resolver com assertividade.",
      },
      {
        texto: "Esperar para ver se o sistema volta sozinho.",
        xp: 5,
        feedback:
          "Essa postura abandona a responsabilidade num momento crítico para produto e usuários.",
      },
    ],
  }),
  createClosedChallenge({
    id: "problem-solving-closed-2",
    categoria: "Resolução de Problemas",
    habilidades: ["priorizacao", "visao-tecnica"],
    titulo: "Bug Urgente vs Feature Nova",
    pergunta: "Um bug crítico e uma feature nova disputam seu tempo. O que você prioriza?",
    descricao: "Escolha o que faz mais sentido para o produto e para os usuários.",
    dica: "Estabilidade vem antes de novidade quando existe impacto real no uso do sistema.",
    respostas: [
      {
        texto: "Entregar a feature nova primeiro.",
        xp: 5,
        feedback:
          "Novidade sem estabilidade tende a piorar a experiência e a confiança do usuário.",
      },
      {
        texto: "Atacar primeiro o bug crítico.",
        xp: 100,
        feedback: "Boa escolha. Você protege a base do produto antes de investir em expansão.",
      },
      {
        texto: "Dividir o tempo em metade para cada um.",
        xp: 40,
        feedback: "Parece equilibrado, mas pode atrasar a resolução do problema mais sensível.",
      },
    ],
  }),
  createClosedChallenge({
    id: "problem-solving-closed-3",
    categoria: "Resolução de Problemas",
    habilidades: ["investigacao", "metodo-raciocinio"],
    titulo: "Estratégia de Solução",
    pergunta: "Você está lidando com um erro intermitente difícil. Como aborda a solução?",
    descricao: "Escolha a estratégia mais estruturada de investigação.",
    dica: "Investigação estruturada costuma vencer tentativa e erro no longo prazo.",
    respostas: [
      {
        texto: "Tentar várias mudanças na sorte até algo funcionar.",
        xp: 40,
        feedback: "Pode gerar pistas, mas sem estrutura fica difícil aprender e repetir a solução.",
      },
      {
        texto: "Usar logs, métricas e formular hipóteses antes de agir.",
        xp: 100,
        feedback:
          "Boa escolha. Você transforma um problema difuso em uma investigação orientada por evidências.",
      },
      {
        texto: "Reiniciar o servidor sempre que o erro aparecer.",
        xp: 5,
        feedback: "Isso mascara o problema e não cria entendimento sobre a causa real.",
      },
    ],
  }),
  createClosedChallenge({
    id: "time-management-closed-1",
    categoria: "Gestão de Tempo",
    habilidades: ["priorizacao", "planejamento-organizacao"],
    titulo: "Sprint Conflitante",
    pergunta: "Você recebeu 3 tasks urgentes ao mesmo tempo. Como decide o que fazer primeiro?",
    descricao: "Escolha a alternativa com melhor priorização.",
    dica: "Impacto e prazo são um bom ponto de partida para ordenar trabalho sob pressão.",
    respostas: [
      {
        texto: "Escolher uma aleatoriamente e começar.",
        xp: 5,
        feedback: "Sem critério, a chance de dedicar energia ao item errado cresce bastante.",
      },
      {
        texto: "Priorizar pelo impacto e pelo prazo de cada entrega.",
        xp: 100,
        feedback: "Boa escolha. Você cria ordem com base em valor e urgência reais.",
      },
      {
        texto: "Fazer primeiro as tarefas mais rápidas.",
        xp: 40,
        feedback:
          "Isso pode dar sensação de progresso, mas não garante que o principal foi tratado.",
      },
    ],
  }),
  createClosedChallenge({
    id: "time-management-closed-2",
    categoria: "Gestão de Tempo",
    habilidades: ["foco", "priorizacao"],
    titulo: "Interrupções",
    pergunta:
      "Você está focado em uma tarefa crítica quando chegam mensagens urgentes de diferentes colegas. O que você faz?",
    descricao: "Escolha a resposta com mais equilíbrio entre foco e responsividade.",
    dica: "Nem toda urgência é real. Saber filtrar interrupções protege o foco sem ignorar o que importa.",
    respostas: [
      {
        texto: "Parar tudo e responder a todas as mensagens imediatamente.",
        xp: 5,
        feedback: "Isso dispersa o foco e tende a prejudicar a tarefa mais importante do momento.",
      },
      {
        texto: "Avaliar a urgência real, responder o crítico e proteger o foco.",
        xp: 100,
        feedback:
          "Boa escolha. Você filtra sem ignorar e mantém o trabalho prioritário em andamento.",
      },
      {
        texto: "Ignorar todas as mensagens até terminar o que está fazendo.",
        xp: 40,
        feedback: "Protege o foco, mas pode atrasar algo realmente urgente sem você perceber.",
      },
    ],
  }),
  createClosedChallenge({
    id: "time-management-closed-3",
    categoria: "Gestão de Tempo",
    habilidades: ["planejamento-organizacao", "metodo-raciocinio"],
    titulo: "Estimar Esforço",
    pergunta: "Uma nova feature é desconhecida para o time. Como você estima o esforço?",
    descricao: "Escolha a forma mais segura de chegar a uma estimativa.",
    dica: "Quebrar o problema em partes reduz incerteza e melhora a qualidade da estimativa.",
    respostas: [
      {
        texto: "Chutar um número com base na intuição.",
        xp: 5,
        feedback: "Sem decomposição ou referência, a estimativa fica frágil e difícil de defender.",
      },
      {
        texto: "Quebrar em subtarefas e estimar cada parte.",
        xp: 100,
        feedback: "Boa escolha. Você reduz incerteza e cria visibilidade sobre o trabalho real.",
      },
      {
        texto: "Copiar uma estimativa antiga de outra demanda.",
        xp: 40,
        feedback:
          "Pode servir como referência, mas sozinho isso ignora as particularidades da feature atual.",
      },
    ],
  }),
  createClosedChallenge({
    id: "emotional-intelligence-closed-1",
    categoria: "Inteligência Emocional",
    habilidades: ["responsabilidade-maturidade", "controle-emocional-resiliencia"],
    titulo: "Receber Crítica",
    pergunta: "Você recebeu um code review duro. Como reage?",
    descricao: "Escolha a postura com mais maturidade emocional e foco em aprendizado.",
    dica: "Feedback difícil ainda pode virar crescimento quando você escuta com maturidade.",
    respostas: [
      {
        texto: "Entrar na defensiva para proteger o ego.",
        xp: 40,
        feedback: "A reação é humana, mas dificulta entendimento e colaboração no review.",
      },
      {
        texto: "Ouvir, fazer perguntas e extrair pontos de melhoria.",
        xp: 100,
        feedback: "Boa escolha. Você transforma tensão em aprendizado prático e evolução técnica.",
      },
      {
        texto: "Ignorar o feedback e seguir em frente.",
        xp: 5,
        feedback: "Ignorar corta a chance de evoluir e pode repetir os mesmos problemas depois.",
      },
    ],
  }),
  createClosedChallenge({
    id: "emotional-intelligence-closed-2",
    categoria: "Inteligência Emocional",
    habilidades: ["negociacao-prazos", "controle-emocional-resiliencia", "transparencia"],
    titulo: "Pressão",
    pergunta: "Você recebeu um prazo praticamente impossível. Como reage?",
    descricao: "Escolha a resposta com mais controle emocional e responsabilidade.",
    dica: "Negociar escopo ou prazo costuma ser melhor do que prometer o impossível e comprometer a entrega.",
    respostas: [
      {
        texto: "Entrar em pânico e tentar resolver depois.",
        xp: 40,
        feedback: "A pressão é real, mas essa reação reduz a clareza para negociar ou planejar.",
      },
      {
        texto: "Negociar escopo, prazo e riscos com transparência.",
        xp: 100,
        feedback:
          "Boa escolha. Você equilibra responsabilidade, realismo e compromisso com o resultado.",
      },
      {
        texto: "Prometer que vai entregar mesmo sabendo que não dá.",
        xp: 5,
        feedback: "Isso protege o momento, mas cria um problema maior lá na frente.",
      },
    ],
  }),
  createClosedChallenge({
    id: "emotional-intelligence-closed-3",
    categoria: "Inteligência Emocional",
    habilidades: ["controle-emocional-resiliencia", "responsabilidade-maturidade"],
    titulo: "Frustração de Projeto Falho",
    pergunta: "Uma entrega foi cancelada e o projeto falhou. Como lidar com isso?",
    descricao: "Escolha a atitude com mais resiliência e aprendizado.",
    dica: "Mesmo quando o projeto falha, ainda existe aprendizado sobre técnica, organização, prioridade e prazos.",
    respostas: [
      {
        texto: "Se culpar ou culpar terceiros imediatamente.",
        xp: 5,
        feedback: "Buscar culpados cedo demais fecha espaço para aprender com o que aconteceu.",
      },
      {
        texto: "Fazer um post-mortem e transformar a falha em aprendizado.",
        xp: 100,
        feedback: "Boa escolha. Você reconhece o impacto da falha sem desperdiçar o aprendizado.",
      },
      {
        texto: "Fingir que nada aconteceu e seguir como se estivesse tudo certo.",
        xp: 40,
        feedback:
          "Evita o desconforto imediato, mas impede a equipe de amadurecer com a experiência.",
      },
    ],
  }),
  createOpenChallenge({
    id: "communication-open-1",
    categoria: "Comunicação",
    titulo: "Alinhando Expectativas",
    pergunta:
      "Você percebe que o que o cliente pediu foi interpretado de formas diferentes pelos membros do time. Como comunicaria isso antes de continuar o desenvolvimento?",
    descricao: "Descreva como evitaria o retrabalho e alinharia o entendimento de todos.",
    habilidades: ["clareza-objetividade", "proatividade"],
  }),
  createOpenChallenge({
    id: "communication-open-2",
    categoria: "Comunicação",
    titulo: "Má Notícia",
    pergunta:
      "Um prazo importante não vai ser cumprido. Como você comunicaria isso ao gestor e ao cliente?",
    descricao: "Escreva como anunciaria o problema com responsabilidade e proposta de solução.",
    habilidades: ["transparencia", "responsabilidade-maturidade", "clareza-objetividade"],
  }),
  createOpenChallenge({
    id: "communication-open-3",
    categoria: "Comunicação",
    titulo: "Apresentação Técnica",
    pergunta:
      "Você precisa apresentar o progresso do projeto para um grupo de executivos sem background técnico. Como estruturaria essa comunicação?",
    descricao: "Descreva como adaptaria a linguagem e o conteúdo para esse público.",
    habilidades: ["adaptacao-publico", "clareza-objetividade"],
  }),
  createOpenChallenge({
    id: "teamwork-open-1",
    categoria: "Trabalho em Equipe",
    titulo: "Novo no Time",
    pergunta:
      "Um desenvolvedor júnior acabou de entrar no time no meio de uma sprint. Como você o integraria sem prejudicar as entregas?",
    descricao: "Descreva como equilibraria a integração da pessoa com o ritmo do time.",
    habilidades: ["acolhimento", "planejamento-organizacao", "colaboracao"],
  }),
  createOpenChallenge({
    id: "teamwork-open-2",
    categoria: "Trabalho em Equipe",
    titulo: "Colega que Não Entrega",
    pergunta:
      "Um membro do time repetidamente não entrega o que prometeu nas sprints. Como você abordaria essa situação?",
    descricao: "Explique como lidaria com isso sem ignorar e sem criar conflito desnecessário.",
    habilidades: ["assertividade", "empatia", "clareza-objetividade"],
  }),
  createOpenChallenge({
    id: "teamwork-open-3",
    categoria: "Trabalho em Equipe",
    titulo: "Time Remoto",
    pergunta:
      "O time está distribuído em fusos horários diferentes e tem dificuldade de se alinhar nas entregas. Como você melhoraria a colaboração?",
    descricao: "Descreva que mudanças de processo ou comunicação você proporia.",
    habilidades: ["planejamento-organizacao", "comunicacao-assincrona", "colaboracao"],
  }),
  createOpenChallenge({
    id: "problem-solving-open-1",
    categoria: "Resolução de Problemas",
    titulo: "Dívida Técnica",
    pergunta:
      "O código do projeto acumulou muita dívida técnica e está comprometendo a velocidade do time. Como você abordaria esse problema?",
    descricao: "Explique como priorizaria e comunicaria a necessidade de melhorias técnicas.",
    habilidades: ["visao-tecnica", "priorizacao", "clareza-objetividade"],
  }),
  createOpenChallenge({
    id: "problem-solving-open-2",
    categoria: "Resolução de Problemas",
    titulo: "Sistema Lento",
    pergunta:
      "Após um deploy, usuários começam a reclamar que o sistema ficou lento. Como você investigaria a causa?",
    descricao: "Descreva sua abordagem de diagnóstico passo a passo.",
    habilidades: ["investigacao", "metodo-raciocinio"],
  }),
  createOpenChallenge({
    id: "problem-solving-open-3",
    categoria: "Resolução de Problemas",
    titulo: "Requisito Ambíguo",
    pergunta:
      "Você recebeu uma especificação confusa que pode ser interpretada de formas muito diferentes. O que você faz antes de começar a desenvolver?",
    descricao: "Escreva como garantiria o entendimento correto antes de codar.",
    habilidades: ["clareza-objetividade", "proatividade"],
  }),
  createOpenChallenge({
    id: "time-management-open-1",
    categoria: "Gestão de Tempo",
    titulo: "Planejamento da Semana",
    pergunta:
      "Você tem uma semana com muitas entregas e reuniões previstas. Como planeja para garantir que o essencial seja feito?",
    descricao: "Descreva como organizaria os dias e protegeria o tempo para o que mais importa.",
    habilidades: ["planejamento-organizacao"],
  }),
  createOpenChallenge({
    id: "time-management-open-2",
    categoria: "Gestão de Tempo",
    titulo: "Dizer Não",
    pergunta:
      "Seu gestor pede que você encaixe mais uma tarefa numa semana já lotada. Como você responderia?",
    descricao: "Explique como negociaria sem comprometer o que já foi comprometido.",
    habilidades: ["assertividade", "negociacao-prazos", "planejamento-organizacao"],
  }),
  createOpenChallenge({
    id: "time-management-open-3",
    categoria: "Gestão de Tempo",
    titulo: "Tarefa Difícil",
    pergunta:
      "Você está evitando uma tarefa complexa e desconfortável há dias, mesmo sabendo que ela é importante. Como encararia isso?",
    descricao: "Descreva o que te trava e como você sairia do bloqueio.",
    habilidades: ["autoconhecimento", "planejamento-organizacao", "foco"],
  }),
  createOpenChallenge({
    id: "emotional-intelligence-open-1",
    categoria: "Inteligência Emocional",
    titulo: "Síndrome do Impostor",
    pergunta:
      "Você foi promovido mas sente que não é bom o suficiente para o novo cargo. Como lida com esse sentimento?",
    descricao: "Mostre como equilibraria autoconfiança com humildade sem se paralisar.",
    habilidades: [
      "autoconhecimento",
      "controle-emocional-resiliencia",
      "responsabilidade-maturidade",
    ],
  }),
  createOpenChallenge({
    id: "emotional-intelligence-open-2",
    categoria: "Inteligência Emocional",
    titulo: "Discordância com Gestor",
    pergunta:
      "Seu gestor descartou publicamente uma solução técnica sua sem justificar. Como você lidaria com isso?",
    descricao: "Explique como expressaria seu ponto de vista sem comprometer o relacionamento.",
    habilidades: ["controle-emocional-resiliencia", "assertividade", "responsabilidade-maturidade"],
  }),
  createOpenChallenge({
    id: "emotional-intelligence-open-3",
    categoria: "Inteligência Emocional",
    titulo: "Colega em Burnout",
    pergunta:
      "Você percebe que um colega está sobrecarregado e mostrando sinais claros de esgotamento. O que você faz?",
    descricao: "Descreva como apoiaria a pessoa e, se necessário, escalaria a situação.",
    habilidades: ["empatia", "responsabilidade-maturidade", "clareza-objetividade"],
  }),
];

const VALID_CHALLENGE_IDS = new Set(CHALLENGES.map((challenge) => challenge.id));

const ALL_CATEGORIES = [
  "Comunicação",
  "Trabalho em Equipe",
  "Resolução de Problemas",
  "Gestão de Tempo",
  "Inteligência Emocional",
];

function getChallengeById(challengeId) {
  return CHALLENGES.find((challenge) => challenge.id === challengeId);
}

module.exports = {
  OPEN_CHALLENGE_XP_MULTIPLIER,
  createClosedChallenge,
  createOpenChallenge,
  CHALLENGES,
  VALID_CHALLENGE_IDS,
  ALL_CATEGORIES,
  getChallengeById,
};
