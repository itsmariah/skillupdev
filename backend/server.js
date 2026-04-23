const crypto = require("crypto");
const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const express = require("express");
const cors = require("cors");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
const XP_PER_LEVEL = 200;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPEN_CHALLENGE_XP_MULTIPLIER = 1.2;

function normalizeTextValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function createClosedChallenge({
  id,
  categoria,
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

function createOpenChallenge({
  id,
  categoria,
  titulo,
  pergunta,
  descricao,
  criteriosAvaliacao,
  dica,
}) {
  return {
    id,
    tipo: "aberto",
    categoria,
    titulo,
    pergunta,
    descricao,
    criteriosAvaliacao,
    dica,
    xpMultiplier: OPEN_CHALLENGE_XP_MULTIPLIER,
  };
}

const CHALLENGES = [
  createClosedChallenge({
    id: "communication-closed-1",
    categoria: "Comunicacao",
    titulo: "Cliente Dificil",
    pergunta:
      "Um cliente envia uma mensagem irritado dizendo que o sistema caiu e esta inutil. Como voce responde?",
    descricao: "Escolha a alternativa que melhor se adequa a situacao.",
    dica:
      "Priorize cordialidade e transparencia. Comunicacao tecnica sem empatia nao resolve conflito.",
    respostas: [
      {
        texto: "Nao e problema nosso, deve ser sua rede.",
        xp: 5,
        feedback: "Essa resposta tende a piorar o conflito e passa pouca responsabilidade.",
      },
      {
        texto: "Entendo sua frustracao. Vamos verificar e te atualizar.",
        xp: 100,
        feedback: "Boa escolha. Voce acolhe a frustracao e informa o proximo passo com clareza.",
      },
      {
        texto: "Responder com termos tecnicos e complexos sobre servidor.",
        xp: 40,
        feedback: "Existe tentativa de explicar, mas faltam simplicidade e empatia para o momento.",
      },
    ],
  }),
  createClosedChallenge({
    id: "communication-closed-2",
    categoria: "Comunicacao",
    titulo: "Explicando Problema Tecnico",
    pergunta:
      "Voce precisa explicar para um gestor nao tecnico por que o deploy foi adiado. Como faz isso?",
    descricao: "Escolha a opcao que torna a mensagem mais clara para quem nao e tecnico.",
    dica:
      "Traduzir complexidade tecnica para linguagem simples e uma habilidade essencial para dev senior.",
    respostas: [
      {
        texto: "Usar jargoes tecnicos e detalhar a stack inteira.",
        xp: 40,
        feedback: "A resposta pode ser correta tecnicamente, mas dificulta o entendimento do gestor.",
      },
      {
        texto: "Usar uma analogia simples e explicar o impacto do adiamento.",
        xp: 100,
        feedback: "Boa escolha. Voce traduz o problema sem perder objetividade nem contexto.",
      },
      {
        texto: 'Dizer apenas "Nao deu".',
        xp: 5,
        feedback: "Essa resposta nao gera contexto nem confianca para a tomada de decisao.",
      },
    ],
  }),
  createClosedChallenge({
    id: "communication-closed-3",
    categoria: "Comunicacao",
    titulo: "Feedback Construtivo",
    pergunta: "Um colega entregou um codigo ruim. Como voce reage?",
    descricao: "Escolha a postura com mais respeito e efetividade.",
    dica:
      "Feedback construtivo combina especificidade com respeito, sem soar rude ou humilhante.",
    respostas: [
      {
        texto: "Criticar o codigo no grupo para todo mundo ver.",
        xp: 5,
        feedback: "Isso expoe a pessoa e tende a gerar defensividade em vez de aprendizado.",
      },
      {
        texto: "Conversar em privado, mostrar exemplos e sugerir melhorias.",
        xp: 100,
        feedback: "Boa escolha. A mensagem fica clara, respeitosa e orientada a melhoria real.",
      },
      {
        texto: "Refazer tudo sem falar nada.",
        xp: 40,
        feedback: "Resolve o curto prazo, mas perde a chance de desenvolver o colega e alinhar o time.",
      },
    ],
  }),
  createClosedChallenge({
    id: "teamwork-closed-1",
    categoria: "Trabalho em Equipe",
    titulo: "Priorizar Tarefas com a Equipe",
    pergunta: "Sua equipe tem 6 tarefas e um prazo curto. Como organizar isso?",
    descricao: "Escolha a alternativa com mais colaboracao e visao coletiva.",
    dica: "Colaboracao melhora a qualidade da decisao e aumenta o comprometimento do time.",
    respostas: [
      {
        texto: "Escolher sozinho o que cada pessoa vai fazer.",
        xp: 40,
        feedback: "Pode parecer agil, mas reduz alinhamento e o senso de participacao do time.",
      },
      {
        texto: "Reunir o time, priorizar junto e delegar com clareza.",
        xp: 100,
        feedback: "Boa escolha. Essa postura fortalece alinhamento, foco e responsabilidade compartilhada.",
      },
      {
        texto: "Fazer primeiro as tarefas mais faceis.",
        xp: 5,
        feedback: "Facilidade nao significa prioridade. O time pode deixar o que importa de lado.",
      },
    ],
  }),
  createClosedChallenge({
    id: "teamwork-closed-2",
    categoria: "Trabalho em Equipe",
    titulo: "Conflito entre Colegas",
    pergunta: "Dois devs discordam fortemente sobre uma decisao tecnica. O que voce faz?",
    descricao: "Escolha a resposta com mais neutralidade e capacidade de mediacao.",
    dica: "Mediacao vale mais do que polarizacao quando o objetivo e destravar o time.",
    respostas: [
      {
        texto: "Ignorar o conflito e deixar que eles se resolvam.",
        xp: 40,
        feedback: "Evita desgaste imediato, mas o impasse pode crescer e contaminar o trabalho.",
      },
      {
        texto: "Mediar a conversa e buscar criterios tecnicos em comum.",
        xp: 100,
        feedback: "Boa escolha. Voce ajuda o time a sair da disputa e voltar para a analise do problema.",
      },
      {
        texto: "Tomar o lado de quem voce acha melhor.",
        xp: 5,
        feedback: "Escolher um lado cedo demais alimenta a polarizacao e enfraquece a colaboracao.",
      },
    ],
  }),
  createClosedChallenge({
    id: "teamwork-closed-3",
    categoria: "Trabalho em Equipe",
    titulo: "Decisao Coletiva",
    pergunta: "O time precisa escolher entre duas arquiteturas possiveis. Como conduzir a decisao?",
    descricao: "Escolha a opcao com mais criterio tecnico e colaboracao.",
    dica: "Decisao tecnica precisa de criterio. Pressa sozinha nao substitui analise.",
    respostas: [
      {
        texto: "Votar rapido para decidir logo.",
        xp: 40,
        feedback: "Pode acelerar, mas corre o risco de simplificar uma decisao que merece analise.",
      },
      {
        texto: "Analisar pros e contras juntos antes de decidir.",
        xp: 100,
        feedback: "Boa escolha. O time decide com base em contexto, trade-offs e entendimento comum.",
      },
      {
        texto: "Deixar para depois sem nenhum criterio definido.",
        xp: 5,
        feedback: "Postergar sem estrutura aumenta incerteza e dificulta o andamento do projeto.",
      },
    ],
  }),
  createClosedChallenge({
    id: "problem-solving-closed-1",
    categoria: "Resolucao de Problemas",
    titulo: "Producao Caiu",
    pergunta: "O sistema caiu em producao. Qual e sua primeira postura?",
    descricao: "Escolha a alternativa com mais metodo e controle da situacao.",
    dica: "Em incidentes, metodologia vem antes do impulso. Diagnosticar bem reduz erro na correcao.",
    respostas: [
      {
        texto: "Corrigir direto o que parecer mais provavel.",
        xp: 40,
        feedback: "Agilidade e importante, mas agir sem diagnostico pode piorar o incidente.",
      },
      {
        texto: "Diagnosticar, isolar o problema e agir com base no que foi observado.",
        xp: 100,
        feedback: "Boa escolha. Essa abordagem reduz risco e aumenta a chance de resolver com assertividade.",
      },
      {
        texto: "Esperar para ver se o sistema volta sozinho.",
        xp: 5,
        feedback: "Essa postura abandona a responsabilidade num momento critico para produto e usuarios.",
      },
    ],
  }),
  createClosedChallenge({
    id: "problem-solving-closed-2",
    categoria: "Resolucao de Problemas",
    titulo: "Bug Urgente vs Feature Nova",
    pergunta: "Um bug critico e uma feature nova disputam seu tempo. O que voce prioriza?",
    descricao: "Escolha o que faz mais sentido para o produto e para os usuarios.",
    dica: "Estabilidade vem antes de novidade quando existe impacto real no uso do sistema.",
    respostas: [
      {
        texto: "Entregar a feature nova primeiro.",
        xp: 5,
        feedback: "Novidade sem estabilidade tende a piorar a experiencia e a confianca do usuario.",
      },
      {
        texto: "Atacar primeiro o bug critico.",
        xp: 100,
        feedback: "Boa escolha. Voce protege a base do produto antes de investir em expansao.",
      },
      {
        texto: "Dividir o tempo em metade para cada um.",
        xp: 40,
        feedback: "Parece equilibrado, mas pode atrasar a resolucao do problema mais sensivel.",
      },
    ],
  }),
  createClosedChallenge({
    id: "problem-solving-closed-3",
    categoria: "Resolucao de Problemas",
    titulo: "Estrategia de Solucao",
    pergunta: "Voce esta lidando com um erro intermitente dificil. Como aborda a solucao?",
    descricao: "Escolha a estrategia mais estruturada de investigacao.",
    dica: "Investigacao estruturada costuma vencer tentativa e erro no longo prazo.",
    respostas: [
      {
        texto: "Tentar varias mudancas na sorte ate algo funcionar.",
        xp: 40,
        feedback: "Pode gerar pistas, mas sem estrutura fica dificil aprender e repetir a solucao.",
      },
      {
        texto: "Usar logs, metricas e formular hipoteses antes de agir.",
        xp: 100,
        feedback: "Boa escolha. Voce transforma um problema difuso em uma investigacao orientada por evidencias.",
      },
      {
        texto: "Reiniciar o servidor sempre que o erro aparecer.",
        xp: 5,
        feedback: "Isso mascara o problema e nao cria entendimento sobre a causa real.",
      },
    ],
  }),
  createClosedChallenge({
    id: "time-management-closed-1",
    categoria: "Gestao de Tempo",
    titulo: "Sprint Conflitante",
    pergunta: "Voce recebeu 3 tasks urgentes ao mesmo tempo. Como decide o que fazer primeiro?",
    descricao: "Escolha a alternativa com melhor priorizacao.",
    dica: "Impacto e prazo sao um bom ponto de partida para ordenar trabalho sob pressao.",
    respostas: [
      {
        texto: "Escolher uma aleatoriamente e comecar.",
        xp: 5,
        feedback: "Sem criterio, a chance de dedicar energia ao item errado cresce bastante.",
      },
      {
        texto: "Priorizar pelo impacto e pelo prazo de cada entrega.",
        xp: 100,
        feedback: "Boa escolha. Voce cria ordem com base em valor e urgencia reais.",
      },
      {
        texto: "Fazer primeiro as tarefas mais rapidas.",
        xp: 40,
        feedback: "Isso pode dar sensacao de progresso, mas nao garante que o principal foi tratado.",
      },
    ],
  }),
  createClosedChallenge({
    id: "time-management-closed-2",
    categoria: "Gestao de Tempo",
    titulo: "Prioridades",
    pergunta: "Existem muitas demandas simultaneas. Como voce organiza as prioridades?",
    descricao: "Escolha a resposta com mais criterio e capacidade de organizacao.",
    dica:
      "Comparar urgencia com impacto ajuda a fugir do caos quando tudo parece importante.",
    respostas: [
      {
        texto: "Tentar fazer tudo ao mesmo tempo.",
        xp: 5,
        feedback: "Isso aumenta troca de contexto e tende a reduzir qualidade e previsibilidade.",
      },
      {
        texto: "Usar uma matriz de urgencia x impacto.",
        xp: 100,
        feedback: "Boa escolha. Voce transforma pressao difusa em uma fila mais racional de execucao.",
      },
      {
        texto: "Seguir apenas a ordem de chegada das demandas.",
        xp: 40,
        feedback: "A ordem de chegada ajuda um pouco, mas nao substitui criterio de negocio e risco.",
      },
    ],
  }),
  createClosedChallenge({
    id: "time-management-closed-3",
    categoria: "Gestao de Tempo",
    titulo: "Estimar Esforco",
    pergunta: "Uma nova feature e desconhecida para o time. Como voce estima o esforco?",
    descricao: "Escolha a forma mais segura de chegar a uma estimativa.",
    dica: "Quebrar o problema em partes reduz incerteza e melhora a qualidade da estimativa.",
    respostas: [
      {
        texto: "Chutar um numero com base na intuicao.",
        xp: 5,
        feedback: "Sem decomposicao ou referencia, a estimativa fica fragil e dificil de defender.",
      },
      {
        texto: "Quebrar em subtarefas e estimar cada parte.",
        xp: 100,
        feedback: "Boa escolha. Voce reduz incerteza e cria visibilidade sobre o trabalho real.",
      },
      {
        texto: "Copiar uma estimativa antiga de outra demanda.",
        xp: 40,
        feedback: "Pode servir como referencia, mas sozinho isso ignora as particularidades da feature atual.",
      },
    ],
  }),
  createClosedChallenge({
    id: "emotional-intelligence-closed-1",
    categoria: "Inteligencia Emocional",
    titulo: "Receber Critica",
    pergunta: "Voce recebeu um code review duro. Como reage?",
    descricao: "Escolha a postura com mais maturidade emocional e foco em aprendizado.",
    dica: "Feedback dificil ainda pode virar crescimento quando voce escuta com maturidade.",
    respostas: [
      {
        texto: "Entrar na defensiva para proteger o ego.",
        xp: 40,
        feedback: "A reacao e humana, mas dificulta entendimento e colaboracao no review.",
      },
      {
        texto: "Ouvir, fazer perguntas e extrair pontos de melhoria.",
        xp: 100,
        feedback: "Boa escolha. Voce transforma tensao em aprendizado pratico e evolucao tecnica.",
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
    categoria: "Inteligencia Emocional",
    titulo: "Pressao",
    pergunta: "Voce recebeu um prazo praticamente impossivel. Como reage?",
    descricao: "Escolha a resposta com mais controle emocional e responsabilidade.",
    dica:
      "Negociar escopo ou prazo costuma ser melhor do que prometer o impossivel e comprometer a entrega.",
    respostas: [
      {
        texto: "Entrar em panico e tentar resolver depois.",
        xp: 40,
        feedback: "A pressao e real, mas essa reacao reduz a clareza para negociar ou planejar.",
      },
      {
        texto: "Negociar escopo, prazo e riscos com transparencia.",
        xp: 100,
        feedback: "Boa escolha. Voce equilibra responsabilidade, realismo e compromisso com o resultado.",
      },
      {
        texto: "Prometer que vai entregar mesmo sabendo que nao da.",
        xp: 5,
        feedback: "Isso protege o momento, mas cria um problema maior la na frente.",
      },
    ],
  }),
  createClosedChallenge({
    id: "emotional-intelligence-closed-3",
    categoria: "Inteligencia Emocional",
    titulo: "Frustracao de Projeto Falho",
    pergunta: "Uma entrega foi cancelada e o projeto falhou. Como lidar com isso?",
    descricao: "Escolha a atitude com mais resiliencia e aprendizado.",
    dica:
      "Mesmo quando o projeto falha, ainda existe aprendizado sobre tecnica, organizacao, prioridade e prazos.",
    respostas: [
      {
        texto: "Se culpar ou culpar terceiros imediatamente.",
        xp: 5,
        feedback: "Buscar culpados cedo demais fecha espaco para aprender com o que aconteceu.",
      },
      {
        texto: "Fazer um post-mortem e transformar a falha em aprendizado.",
        xp: 100,
        feedback: "Boa escolha. Voce reconhece o impacto da falha sem desperdicar o aprendizado.",
      },
      {
        texto: "Fingir que nada aconteceu e seguir como se estivesse tudo certo.",
        xp: 40,
        feedback: "Evita o desconforto imediato, mas impede a equipe de amadurecer com a experiencia.",
      },
    ],
  }),
  createOpenChallenge({
    id: "communication-open-1",
    categoria: "Comunicacao",
    titulo: "Cliente Dificil",
    pergunta:
      "Um cliente esta irritado dizendo que o sistema esta inutil e exige resposta imediata. Como voce responderia?",
    descricao: "Responda com suas palavras, como se estivesse falando com o cliente.",
    criteriosAvaliacao: ["empatia", "clareza", "postura emocional"],
  }),
  createOpenChallenge({
    id: "communication-open-2",
    categoria: "Comunicacao",
    titulo: "Explicacao Tecnica",
    pergunta:
      "Voce precisa explicar para um gestor nao tecnico por que o deploy foi adiado. Como explicaria?",
    descricao: "Escreva uma resposta simples, objetiva e facil de entender.",
    criteriosAvaliacao: ["simplificacao", "didatica", "ausencia de jargao"],
  }),
  createOpenChallenge({
    id: "communication-open-3",
    categoria: "Comunicacao",
    titulo: "Feedback Construtivo",
    pergunta:
      "Um colega entregou um codigo com varios problemas. Como voce daria esse feedback?",
    descricao: "Escreva como voce abordaria a conversa com respeito e clareza.",
    criteriosAvaliacao: ["respeito", "clareza", "assertividade"],
  }),
  createOpenChallenge({
    id: "teamwork-open-1",
    categoria: "Trabalho em Equipe",
    titulo: "Priorizacao em Equipe",
    pergunta:
      "Sua equipe tem varias tarefas e pouco tempo. Como voce organizaria isso junto ao time?",
    descricao: "Descreva como voce conduziria a organizacao do trabalho com o grupo.",
    criteriosAvaliacao: ["colaboracao", "lideranca", "organizacao"],
  }),
  createOpenChallenge({
    id: "teamwork-open-2",
    categoria: "Trabalho em Equipe",
    titulo: "Conflito entre Colegas",
    pergunta:
      "Dois desenvolvedores estao em conflito sobre uma decisao tecnica. Como voce lidaria com essa situacao?",
    descricao: "Explique como mediaria a situacao sem reforcar a polarizacao.",
    criteriosAvaliacao: ["mediacao", "neutralidade", "comunicacao"],
  }),
  createOpenChallenge({
    id: "teamwork-open-3",
    categoria: "Trabalho em Equipe",
    titulo: "Decisao Coletiva",
    pergunta:
      "Existem duas possiveis solucoes tecnicas para um problema. Como voce conduziria a decisao em equipe?",
    descricao: "Mostre como equilibraria analise tecnica e colaboracao.",
    criteriosAvaliacao: ["pensamento critico", "colaboracao", "analise"],
  }),
  createOpenChallenge({
    id: "problem-solving-open-1",
    categoria: "Resolucao de Problemas",
    titulo: "Sistema Fora do Ar",
    pergunta: "O sistema caiu em producao. Quais seriam seus primeiros passos?",
    descricao: "Escreva como voce reagiria nos primeiros minutos do incidente.",
    criteriosAvaliacao: ["organizacao", "metodo", "priorizacao"],
  }),
  createOpenChallenge({
    id: "problem-solving-open-2",
    categoria: "Resolucao de Problemas",
    titulo: "Bug vs Feature",
    pergunta:
      "Voce tem um bug critico e uma nova feature para entregar. Como decide o que fazer primeiro?",
    descricao: "Explique qual criterio usaria para decidir.",
    criteriosAvaliacao: ["priorizacao", "visao de produto", "responsabilidade"],
  }),
  createOpenChallenge({
    id: "problem-solving-open-3",
    categoria: "Resolucao de Problemas",
    titulo: "Erro Dificil",
    pergunta:
      "Voce esta lidando com um erro intermitente dificil de reproduzir. Como abordaria a solucao?",
    descricao: "Descreva sua estrategia de investigacao.",
    criteriosAvaliacao: ["investigacao", "uso de dados", "raciocinio logico"],
  }),
  createOpenChallenge({
    id: "time-management-open-1",
    categoria: "Gestao de Tempo",
    titulo: "Muitas Tarefas",
    pergunta:
      "Voce recebeu varias tarefas urgentes ao mesmo tempo. Como organiza seu trabalho?",
    descricao: "Explique como decide a ordem e protege seu foco.",
    criteriosAvaliacao: ["planejamento", "priorizacao", "gestao de tempo"],
  }),
  createOpenChallenge({
    id: "time-management-open-2",
    categoria: "Gestao de Tempo",
    titulo: "Prioridades",
    pergunta:
      "Como voce decide o que e mais importante quando tudo parece urgente?",
    descricao: "Descreva seu criterio de comparacao entre as demandas.",
    criteriosAvaliacao: ["analise de impacto", "criterio", "organizacao"],
  }),
  createOpenChallenge({
    id: "time-management-open-3",
    categoria: "Gestao de Tempo",
    titulo: "Estimativa",
    pergunta:
      "Voce precisa estimar o tempo de uma tarefa desconhecida. Como faz isso?",
    descricao: "Escreva como voce reduziria incerteza antes de estimar.",
    criteriosAvaliacao: ["planejamento", "decomposicao", "analise"],
  }),
  createOpenChallenge({
    id: "emotional-intelligence-open-1",
    categoria: "Inteligencia Emocional",
    titulo: "Receber Critica",
    pergunta:
      "Voce recebeu um feedback negativo em um code review. Como reage?",
    descricao: "Mostre como lidaria com a situacao sem perder maturidade.",
    criteriosAvaliacao: ["maturidade", "aprendizado", "controle emocional"],
  }),
  createOpenChallenge({
    id: "emotional-intelligence-open-2",
    categoria: "Inteligencia Emocional",
    titulo: "Pressao",
    pergunta:
      "Voce recebeu um prazo praticamente impossivel. Como reage?",
    descricao: "Explique como manteria responsabilidade sem prometer o impossivel.",
    criteriosAvaliacao: ["controle emocional", "negociacao", "responsabilidade"],
  }),
  createOpenChallenge({
    id: "emotional-intelligence-open-3",
    categoria: "Inteligencia Emocional",
    titulo: "Projeto Falhou",
    pergunta:
      "Um projeto em que voce trabalhou falhou. Como voce lida com isso?",
    descricao: "Descreva como transformaria a experiencia em aprendizado.",
    criteriosAvaliacao: ["aprendizado", "resiliencia", "reflexao"],
  }),
];

const VALID_CHALLENGE_IDS = new Set(CHALLENGES.map((challenge) => challenge.id));

const CRITERIA_KEYWORDS = {
  empatia: ["entendo", "compreendo", "desculpe", "ajudar", "obrigado"],
  clareza: ["objetivo", "claro", "explicar", "resumo", "passo"],
  "postura emocional": ["calma", "tranquilo", "serenidade", "entendo", "vamos"],
  simplificacao: ["simples", "analogia", "exemplo", "facil", "resumindo"],
  didatica: ["passo", "etapa", "explico", "porque", "impacto"],
  "ausencia de jargao": ["simples", "claro", "sem termo tecnico", "facil"],
  respeito: ["respeito", "podemos", "sugiro", "percebi", "melhorar"],
  assertividade: ["direto", "objetivo", "proponho", "precisa", "recomendo"],
  colaboracao: ["equipe", "junto", "time", "alinhar", "colaborar"],
  lideranca: ["organizar", "delegar", "priorizar", "direcionar", "coordenar"],
  organizacao: ["plano", "ordem", "etapas", "mapear", "organizar"],
  mediacao: ["ouvir", "mediar", "consenso", "facilitar", "conciliar"],
  neutralidade: ["ambos", "criterios", "sem lado", "equilibrio", "imparcial"],
  comunicacao: ["alinhar", "conversar", "explicar", "escutar", "mensagem"],
  "pensamento critico": ["trade-off", "impacto", "criterio", "risco", "beneficio"],
  analise: ["pros", "contras", "avaliar", "comparar", "criterio"],
  metodo: ["diagnosticar", "isolar", "confirmar", "validar", "hipotese"],
  priorizacao: ["priorizar", "impacto", "urgencia", "ordem", "primeiro"],
  "visao de produto": ["usuario", "produto", "negocio", "impacto", "valor"],
  responsabilidade: ["assumir", "comunicar", "resolver", "acompanhar", "compromisso"],
  investigacao: ["log", "hipotese", "causa", "evidencia", "investigar"],
  "uso de dados": ["metrica", "log", "dado", "observacao", "monitoramento"],
  "raciocinio logico": ["hipotese", "causa", "teste", "validar", "evidencia"],
  planejamento: ["planejar", "mapear", "etapa", "estimar", "organizar"],
  "gestao de tempo": ["agenda", "bloco", "priorizar", "prazo", "foco"],
  "analise de impacto": ["impacto", "risco", "valor", "dependencia", "resultado"],
  criterio: ["criterio", "avaliar", "comparar", "decidir", "peso"],
  decomposicao: ["quebrar", "subtarefa", "etapa", "dividir", "bloco"],
  maturidade: ["ouvir", "aprender", "refletir", "melhorar", "aceitar"],
  aprendizado: ["aprender", "ajustar", "evoluir", "melhorar", "licao"],
  "controle emocional": ["calma", "respirar", "equilibrio", "serenidade", "controle"],
  negociacao: ["negociar", "escopo", "prazo", "alinhamento", "combinar"],
  resiliencia: ["seguir", "reconstruir", "adaptar", "recuperar", "persistir"],
  reflexao: ["refletir", "entender", "analisar", "post-mortem", "aprendizado"],
};

app.use(cors());
app.use(express.json());
app.use(express.static(FRONTEND_DIR));

let writeQueue = Promise.resolve();

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(createEmptyDatabase(), null, 2));
  }
}

function createEmptyDatabase() {
  return {
    users: [],
    sessions: [],
    challengeAttempts: [],
  };
}

async function readDatabase() {
  ensureDataFile();

  try {
    const raw = await fsPromises.readFile(DATA_FILE, "utf8");
    if (!raw.trim()) {
      return createEmptyDatabase();
    }

    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      challengeAttempts: Array.isArray(parsed.challengeAttempts) ? parsed.challengeAttempts : [],
    };
  } catch (error) {
    console.error("Erro ao ler banco local:", error);
    return createEmptyDatabase();
  }
}

async function writeDatabase(data) {
  ensureDataFile();

  writeQueue = writeQueue.then(() =>
    fsPromises.writeFile(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8")
  );

  return writeQueue;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) {
    return false;
  }

  const [salt, hash] = storedHash.split(":");
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");

  if (candidate.length !== hash.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

function calculateLevel(xp) {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

function getProgress(xp) {
  const safeXp = Number(xp) || 0;
  const currentLevelXp = safeXp % XP_PER_LEVEL;

  return {
    xp: safeXp,
    level: calculateLevel(safeXp),
    currentLevelXp,
    nextLevelXp: XP_PER_LEVEL,
    progressPercent: Math.round((currentLevelXp / XP_PER_LEVEL) * 100),
  };
}

function buildUserResponse(user, database) {
  const progress = getProgress(user.xp);
  const completedChallenges = database.challengeAttempts.filter(
    (attempt) => attempt.userId === user.id && VALID_CHALLENGE_IDS.has(attempt.challengeId)
  ).length;

  return {
    id: user.id,
    nome: user.nome,
    usuario: user.usuario,
    email: user.email,
    ...progress,
    completedChallenges,
    totalChallenges: CHALLENGES.length,
    pendingChallenges: Math.max(CHALLENGES.length - completedChallenges, 0),
  };
}

function buildPublicChallenge(challenge, completedAttempt) {
  return {
    id: challenge.id,
    tipo: challenge.tipo,
    categoria: challenge.categoria,
    titulo: challenge.titulo,
    pergunta: challenge.pergunta,
    descricao: challenge.descricao,
    dica: challenge.dica || null,
    criteriosAvaliacao: challenge.criteriosAvaliacao || [],
    respostas:
      challenge.tipo === "fechado"
        ? challenge.respostas.map((resposta) => ({
            id: resposta.id,
            texto: resposta.texto,
          }))
        : [],
    completed: Boolean(completedAttempt),
    lastResult: completedAttempt
      ? {
          nota: completedAttempt.score,
          feedback: completedAttempt.feedback,
          xpGanho: completedAttempt.xpAwarded,
          respondidoEm: completedAttempt.createdAt,
        }
      : null,
  };
}

function getChallengeById(challengeId) {
  return CHALLENGES.find((challenge) => challenge.id === challengeId);
}

function getCriteriaMatches(answer, criteria) {
  const normalizedAnswer = normalizeTextValue(answer);
  const uniqueCriteria = Array.from(new Set((criteria || []).map(normalizeTextValue)));

  return uniqueCriteria.filter((criterion) => {
    const keywords = CRITERIA_KEYWORDS[criterion] || [];
    return keywords.some((keyword) => normalizedAnswer.includes(normalizeTextValue(keyword)));
  });
}

function buildHeuristicFeedback(answer, criteria = []) {
  const cleanAnswer = String(answer || "").trim();
  const normalizedAnswer = normalizeTextValue(cleanAnswer);
  const words = cleanAnswer.split(/\s+/).filter(Boolean);
  const generalKeywords = [
    "entendo",
    "vamos",
    "alinhar",
    "explicar",
    "impacto",
    "resolver",
    "priorizar",
    "organizar",
  ];
  const matchedCriteria = getCriteriaMatches(cleanAnswer, criteria);
  const missingCriteria = (criteria || []).filter(
    (criterion) => !matchedCriteria.includes(normalizeTextValue(criterion))
  );

  let score = 35;

  if (words.length >= 12) score += 15;
  if (words.length >= 24) score += 10;
  if (words.length >= 40) score += 10;
  if (generalKeywords.some((keyword) => normalizedAnswer.includes(keyword))) score += 10;
  score += Math.min(matchedCriteria.length * 10, 30);

  const finalScore = Math.max(35, Math.min(score, 100));

  let feedback =
    "Sua resposta esta no caminho certo, mas ainda pode ganhar mais estrutura e objetividade.";

  if (finalScore >= 85) {
    feedback =
      "Boa resposta. Voce demonstrou maturidade, contexto e um encaminhamento claro para a situacao.";
  } else if (finalScore >= 65) {
    feedback =
      "A resposta mostra boa intencao e uma linha de raciocinio util, mas ainda pode ficar mais forte.";
  }

  if (missingCriteria.length > 0) {
    feedback += ` Reforce especialmente ${missingCriteria.slice(0, 2).join(" e ")}.`;
  }

  return {
    nota: finalScore,
    feedback,
  };
}

function extractJsonObject(text) {
  const rawText = String(text || "").trim();

  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch (_error) {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch (_secondError) {
      return null;
    }
  }
}

async function evaluateOpenChallengeWithAI({ resposta, challenge }) {
  const criteria = Array.isArray(challenge.criteriosAvaliacao) && challenge.criteriosAvaliacao.length
    ? challenge.criteriosAvaliacao
    : ["clareza", "empatia", "adequacao ao cenario"];

  if (!process.env.OPENAI_API_KEY) {
    return buildHeuristicFeedback(resposta, criteria);
  }

  const prompt = [
    "Avalie a resposta de um usuario em um desafio de soft skills.",
    `Categoria: ${challenge.categoria}`,
    `Titulo do desafio: ${challenge.titulo}`,
    `Pergunta: ${challenge.pergunta}`,
    `Resposta do usuario: ${resposta}`,
    "",
    "Considere especialmente estes criterios:",
    ...criteria.map((criterion) => `- ${criterion}`),
    "",
    "O feedback deve ser funcional, especifico, educativo e curto.",
    'Retorne apenas JSON valido no formato {"nota": 0-100, "feedback": "texto curto"}',
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI retornou status ${response.status}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = extractJsonObject(content);

    if (!parsed) {
      throw new Error("Nao foi possivel interpretar o JSON da avaliacao.");
    }

    return {
      nota: Math.max(0, Math.min(Number(parsed.nota) || 0, 100)),
      feedback:
        String(parsed.feedback || "").trim() ||
        "Sua resposta foi avaliada, mas o feedback voltou vazio.",
    };
  } catch (error) {
    console.error("Erro ao avaliar resposta com IA. Usando fallback local.", error);
    return buildHeuristicFeedback(resposta, criteria);
  }
}

async function authenticateRequest(req, res, next) {
  const authorization = String(req.headers.authorization || "");

  if (!authorization.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token de acesso nao informado." });
  }

  const token = authorization.slice("Bearer ".length).trim();
  const database = await readDatabase();
  const session = database.sessions.find((item) => item.token === token);

  if (!session) {
    return res.status(401).json({ message: "Sessao invalida ou expirada." });
  }

  const user = database.users.find((item) => item.id === session.userId);

  if (!user) {
    return res.status(401).json({ message: "Usuario da sessao nao encontrado." });
  }

  req.database = database;
  req.user = user;
  req.token = token;

  next();
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "skillupdev-backend",
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/auth/register", async (req, res) => {
  const nome = String(req.body.nome || "").trim();
  const usuario = String(req.body.usuario || "").trim();
  const email = normalizeEmail(req.body.email);
  const senha = String(req.body.senha || "");

  if (!nome || !usuario || !email || !senha) {
    return res.status(400).json({ message: "Preencha nome, usuario, email e senha." });
  }

  if (senha.length < 6) {
    return res.status(400).json({ message: "A senha precisa ter pelo menos 6 caracteres." });
  }

  const database = await readDatabase();
  const emailExists = database.users.some((item) => item.email === email);
  const usernameExists = database.users.some(
    (item) => item.usuario.toLowerCase() === usuario.toLowerCase()
  );

  if (emailExists) {
    return res.status(409).json({ message: "Ja existe uma conta com este email." });
  }

  if (usernameExists) {
    return res.status(409).json({ message: "Este nickname ja esta em uso." });
  }

  const user = {
    id: crypto.randomUUID(),
    nome,
    usuario,
    email,
    passwordHash: createPasswordHash(senha),
    xp: 0,
    nivel: 1,
    createdAt: new Date().toISOString(),
  };

  const token = createToken();

  database.users.push(user);
  database.sessions.push({
    token,
    userId: user.id,
    createdAt: new Date().toISOString(),
  });

  await writeDatabase(database);

  return res.status(201).json({
    message: "Conta criada com sucesso.",
    token,
    user: buildUserResponse(user, database),
  });
});

app.post("/api/auth/login", async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const senha = String(req.body.senha || "");

  if (!email || !senha) {
    return res.status(400).json({ message: "Informe email e senha." });
  }

  const database = await readDatabase();
  const user = database.users.find((item) => item.email === email);

  if (!user || !verifyPassword(senha, user.passwordHash)) {
    return res.status(401).json({ message: "Email ou senha invalidos." });
  }

  database.sessions = database.sessions.filter((item) => item.userId !== user.id);

  const token = createToken();
  database.sessions.push({
    token,
    userId: user.id,
    createdAt: new Date().toISOString(),
  });

  await writeDatabase(database);

  return res.json({
    message: "Login realizado com sucesso.",
    token,
    user: buildUserResponse(user, database),
  });
});

app.post("/api/auth/logout", authenticateRequest, async (req, res) => {
  req.database.sessions = req.database.sessions.filter((session) => session.token !== req.token);
  await writeDatabase(req.database);

  res.json({ message: "Sessao encerrada com sucesso." });
});

app.get("/api/me", authenticateRequest, async (req, res) => {
  res.json({
    user: buildUserResponse(req.user, req.database),
  });
});

app.get("/api/challenges", authenticateRequest, async (req, res) => {
  const userAttempts = req.database.challengeAttempts.filter(
    (attempt) => attempt.userId === req.user.id && VALID_CHALLENGE_IDS.has(attempt.challengeId)
  );

  res.json({
    challenges: CHALLENGES.map((challenge) =>
      buildPublicChallenge(
        challenge,
        userAttempts.find((attempt) => attempt.challengeId === challenge.id)
      )
    ),
  });
});

app.post("/api/challenges/:challengeId/submit", authenticateRequest, async (req, res) => {
  const challenge = getChallengeById(req.params.challengeId);

  if (!challenge) {
    return res.status(404).json({ message: "Desafio nao encontrado." });
  }

  const existingAttempt = req.database.challengeAttempts.find(
    (attempt) => attempt.userId === req.user.id && attempt.challengeId === challenge.id
  );

  if (existingAttempt) {
    return res.status(409).json({
      message: "Este desafio ja foi concluido.",
      result: {
        nota: existingAttempt.score,
        feedback: existingAttempt.feedback,
        xpGanho: existingAttempt.xpAwarded,
      },
      user: buildUserResponse(req.user, req.database),
    });
  }

  let result;
  let answer;

  if (challenge.tipo === "fechado") {
    const respostaId = String(req.body.respostaId || "").trim();
    const resposta = challenge.respostas.find((item) => item.id === respostaId);

    if (!resposta) {
      return res.status(400).json({ message: "Opcao de resposta invalida." });
    }

    answer = resposta.texto;
    result = {
      nota: resposta.xp,
      feedback: challenge.dica
        ? `${resposta.feedback} Dica: ${challenge.dica}`
        : resposta.feedback,
      xpGanho: resposta.xp,
    };
  } else {
    const texto = String(req.body.texto || "").trim();

    if (!texto) {
      return res.status(400).json({ message: "Digite uma resposta antes de enviar." });
    }

    answer = texto;
    const evaluation = await evaluateOpenChallengeWithAI({
      resposta: texto,
      challenge,
    });
    const xpGanho = Math.min(
      120,
      Math.max(0, Math.round(evaluation.nota * (challenge.xpMultiplier || 1)))
    );

    result = {
      nota: evaluation.nota,
      feedback: evaluation.feedback,
      xpGanho,
    };
  }

  req.user.xp = (Number(req.user.xp) || 0) + result.xpGanho;
  req.user.nivel = calculateLevel(req.user.xp);

  req.database.challengeAttempts.push({
    id: crypto.randomUUID(),
    userId: req.user.id,
    challengeId: challenge.id,
    challengeType: challenge.tipo,
    answer,
    feedback: result.feedback,
    score: result.nota,
    xpAwarded: result.xpGanho,
    createdAt: new Date().toISOString(),
  });

  await writeDatabase(req.database);

  return res.json({
    message: "Desafio avaliado com sucesso.",
    result,
    user: buildUserResponse(req.user, req.database),
  });
});

app.listen(PORT, () => {
  console.log(`SkillUp Dev backend online em http://localhost:${PORT}`);
});
