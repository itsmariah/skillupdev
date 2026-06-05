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
const DEFAULT_DATA_FILE = path.join(__dirname, "data", "db.json");
const DATA_FILE = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : DEFAULT_DATA_FILE;
const DATA_DIR = path.dirname(DATA_FILE);
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPEN_CHALLENGE_XP_MULTIPLIER = 1.2;
const PASSWORD_RESET_TTL_MINUTES = 30;
const PASSWORD_RESET_TTL_MS = PASSWORD_RESET_TTL_MINUTES * 60 * 1000;
const RESEND_API_URL = process.env.RESEND_API_URL || "https://api.resend.com/emails";

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
  critériosAvaliacao,
  dica,
}) {
  return {
    id,
    tipo: "aberto",
    categoria,
    titulo,
    pergunta,
    descricao,
    critériosAvaliacao,
    dica,
    xpMultiplier: OPEN_CHALLENGE_XP_MULTIPLIER,
  };
}

const CHALLENGES = [
  createClosedChallenge({
    id: "communication-closed-1",
    categoria: "Comunicação",
    titulo: "Cliente Difícil",
    pergunta:
      "Um cliente envia uma mensagem irritado dizendo que o sistema caiu e está inútil. Como você responde?",
    descricao: "Escolha a alternativa que melhor se adequa à situação.",
    dica:
      "Priorize cordialidade e transparência. Comunicação técnica sem empatia não resolve conflito.",
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
    titulo: "Explicando Problema Técnico",
    pergunta:
      "Você precisa explicar para um gestor não técnico por que o deploy foi adiado. Como faz isso?",
    descricao: "Escolha a opção que torna a mensagem mais clara para quem não é técnico.",
    dica:
      "Traduzir complexidade técnica para linguagem simples é uma habilidade essencial para dev sênior.",
    respostas: [
      {
        texto: "Usar jargões técnicos e detalhar a stack inteira.",
        xp: 40,
        feedback: "A resposta pode ser correta tecnicamente, mas dificulta o entendimento do gestor.",
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
    titulo: "Feedback Construtivo",
    pergunta: "Um colega entregou um código ruim. Como você reage?",
    descricao: "Escolha a postura com mais respeito e efetividade.",
    dica:
      "Feedback construtivo combina especificidade com respeito, sem soar rude ou humilhante.",
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
        feedback: "Resolve o curto prazo, mas perde a chance de desenvolver o colega e alinhar o time.",
      },
    ],
  }),
  createClosedChallenge({
    id: "teamwork-closed-1",
    categoria: "Trabalho em Equipe",
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
        feedback: "Boa escolha. Essa postura fortalece alinhamento, foco e responsabilidade compartilhada.",
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
        feedback: "Boa escolha. Você ajuda o time a sair da disputa e voltar para a análise do problema.",
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
        feedback: "Boa escolha. O time decide com base em contexto, trade-offs e entendimento comum.",
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
        feedback: "Boa escolha. Essa abordagem reduz risco e aumenta a chance de resolver com assertividade.",
      },
      {
        texto: "Esperar para ver se o sistema volta sozinho.",
        xp: 5,
        feedback: "Essa postura abandona a responsabilidade num momento crítico para produto e usuários.",
      },
    ],
  }),
  createClosedChallenge({
    id: "problem-solving-closed-2",
    categoria: "Resolução de Problemas",
    titulo: "Bug Urgente vs Feature Nova",
    pergunta: "Um bug crítico e uma feature nova disputam seu tempo. O que você prioriza?",
    descricao: "Escolha o que faz mais sentido para o produto e para os usuários.",
    dica: "Estabilidade vem antes de novidade quando existe impacto real no uso do sistema.",
    respostas: [
      {
        texto: "Entregar a feature nova primeiro.",
        xp: 5,
        feedback: "Novidade sem estabilidade tende a piorar a experiência e a confiança do usuário.",
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
        feedback: "Boa escolha. Você transforma um problema difuso em uma investigação orientada por evidências.",
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
        feedback: "Isso pode dar sensação de progresso, mas não garante que o principal foi tratado.",
      },
    ],
  }),
  createClosedChallenge({
    id: "time-management-closed-2",
    categoria: "Gestão de Tempo",
    titulo: "Prioridades",
    pergunta: "Existem muitas demandas simultâneas. Como você organiza as prioridades?",
    descricao: "Escolha a resposta com mais critério e capacidade de organização.",
    dica:
      "Comparar urgência com impacto ajuda a fugir do caos quando tudo parece importante.",
    respostas: [
      {
        texto: "Tentar fazer tudo ao mesmo tempo.",
        xp: 5,
        feedback: "Isso aumenta troca de contexto e tende a reduzir qualidade e previsibilidade.",
      },
      {
        texto: "Usar uma matriz de urgência x impacto.",
        xp: 100,
        feedback: "Boa escolha. Você transforma pressão difusa em uma fila mais racional de execução.",
      },
      {
        texto: "Seguir apenas a ordem de chegada das demandas.",
        xp: 40,
        feedback: "A ordem de chegada ajuda um pouco, mas não substitui critério de negócio e risco.",
      },
    ],
  }),
  createClosedChallenge({
    id: "time-management-closed-3",
    categoria: "Gestão de Tempo",
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
        feedback: "Pode servir como referência, mas sozinho isso ignora as particularidades da feature atual.",
      },
    ],
  }),
  createClosedChallenge({
    id: "emotional-intelligence-closed-1",
    categoria: "Inteligência Emocional",
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
    titulo: "Pressão",
    pergunta: "Você recebeu um prazo praticamente impossível. Como reage?",
    descricao: "Escolha a resposta com mais controle emocional e responsabilidade.",
    dica:
      "Negociar escopo ou prazo costuma ser melhor do que prometer o impossível e comprometer a entrega.",
    respostas: [
      {
        texto: "Entrar em pânico e tentar resolver depois.",
        xp: 40,
        feedback: "A pressão é real, mas essa reação reduz a clareza para negociar ou planejar.",
      },
      {
        texto: "Negociar escopo, prazo e riscos com transparência.",
        xp: 100,
        feedback: "Boa escolha. Você equilibra responsabilidade, realismo e compromisso com o resultado.",
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
    titulo: "Frustração de Projeto Falho",
    pergunta: "Uma entrega foi cancelada e o projeto falhou. Como lidar com isso?",
    descricao: "Escolha a atitude com mais resiliência e aprendizado.",
    dica:
      "Mesmo quando o projeto falha, ainda existe aprendizado sobre técnica, organização, prioridade e prazos.",
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
        feedback: "Evita o desconforto imediato, mas impede a equipe de amadurecer com a experiência.",
      },
    ],
  }),
  createOpenChallenge({
    id: "communication-open-1",
    categoria: "Comunicação",
    titulo: "Cliente Difícil",
    pergunta:
      "Um cliente está irritado dizendo que o sistema está inútil e exige resposta imediata. Como você responderia?",
    descricao: "Responda com suas palavras, como se estivesse falando com o cliente.",
    critériosAvaliacao: ["empatia", "clareza", "postura emocional"],
  }),
  createOpenChallenge({
    id: "communication-open-2",
    categoria: "Comunicação",
    titulo: "Explicação Técnica",
    pergunta:
      "Você precisa explicar para um gestor não técnico por que o deploy foi adiado. Como explicaria?",
    descricao: "Escreva uma resposta simples, objetiva e fácil de entender.",
    critériosAvaliacao: ["simplificação", "didática", "ausência de jargão"],
  }),
  createOpenChallenge({
    id: "communication-open-3",
    categoria: "Comunicação",
    titulo: "Feedback Construtivo",
    pergunta:
      "Um colega entregou um código com vários problemas. Como você daria esse feedback?",
    descricao: "Escreva como você abordaria a conversa com respeito e clareza.",
    critériosAvaliacao: ["respeito", "clareza", "assertividade"],
  }),
  createOpenChallenge({
    id: "teamwork-open-1",
    categoria: "Trabalho em Equipe",
    titulo: "Priorização em Equipe",
    pergunta:
      "Sua equipe tem várias tarefas e pouco tempo. Como você organizaria isso junto ao time?",
    descricao: "Descreva como você conduziria a organização do trabalho com o grupo.",
    critériosAvaliacao: ["colaboração", "liderança", "organização"],
  }),
  createOpenChallenge({
    id: "teamwork-open-2",
    categoria: "Trabalho em Equipe",
    titulo: "Conflito entre Colegas",
    pergunta:
      "Dois desenvolvedores estão em conflito sobre uma decisão técnica. Como você lidaria com essa situação?",
    descricao: "Explique como mediaria a situação sem reforçar a polarização.",
    critériosAvaliacao: ["mediação", "neutralidade", "comunicação"],
  }),
  createOpenChallenge({
    id: "teamwork-open-3",
    categoria: "Trabalho em Equipe",
    titulo: "Decisão Coletiva",
    pergunta:
      "Existem duas possíveis soluções técnicas para um problema. Como você conduziria a decisão em equipe?",
    descricao: "Mostre como equilibraria análise técnica e colaboração.",
    critériosAvaliacao: ["pensamento crítico", "colaboração", "análise"],
  }),
  createOpenChallenge({
    id: "problem-solving-open-1",
    categoria: "Resolução de Problemas",
    titulo: "Sistema Fora do Ar",
    pergunta: "O sistema caiu em produção. Quais seriam seus primeiros passos?",
    descricao: "Escreva como você reagiria nos primeiros minutos do incidente.",
    critériosAvaliacao: ["organização", "método", "priorização"],
  }),
  createOpenChallenge({
    id: "problem-solving-open-2",
    categoria: "Resolução de Problemas",
    titulo: "Bug vs Feature",
    pergunta:
      "Você tem um bug crítico e uma nova feature para entregar. Como decide o que fazer primeiro?",
    descricao: "Explique qual critério usaria para decidir.",
    critériosAvaliacao: ["priorização", "visão de produto", "responsabilidade"],
  }),
  createOpenChallenge({
    id: "problem-solving-open-3",
    categoria: "Resolução de Problemas",
    titulo: "Erro Difícil",
    pergunta:
      "Você está lidando com um erro intermitente difícil de reproduzir. Como abordaria a solução?",
    descricao: "Descreva sua estratégia de investigação.",
    critériosAvaliacao: ["investigação", "uso de dados", "raciocínio lógico"],
  }),
  createOpenChallenge({
    id: "time-management-open-1",
    categoria: "Gestão de Tempo",
    titulo: "Muitas Tarefas",
    pergunta:
      "Você recebeu várias tarefas urgentes ao mesmo tempo. Como organiza seu trabalho?",
    descricao: "Explique como decide a ordem e protege seu foco.",
    critériosAvaliacao: ["planejamento", "priorização", "gestão de tempo"],
  }),
  createOpenChallenge({
    id: "time-management-open-2",
    categoria: "Gestão de Tempo",
    titulo: "Prioridades",
    pergunta:
      "Como você decide o que é mais importante quando tudo parece urgente?",
    descricao: "Descreva seu critério de comparação entre as demandas.",
    critériosAvaliacao: ["análise de impacto", "critério", "organização"],
  }),
  createOpenChallenge({
    id: "time-management-open-3",
    categoria: "Gestão de Tempo",
    titulo: "Estimativa",
    pergunta:
      "Você precisa estimar o tempo de uma tarefa desconhecida. Como faz isso?",
    descricao: "Escreva como você reduziria incerteza antes de estimar.",
    critériosAvaliacao: ["planejamento", "decomposição", "análise"],
  }),
  createOpenChallenge({
    id: "emotional-intelligence-open-1",
    categoria: "Inteligência Emocional",
    titulo: "Receber Crítica",
    pergunta:
      "Você recebeu um feedback negativo em um code review. Como reage?",
    descricao: "Mostre como lidaria com a situação sem perder maturidade.",
    critériosAvaliacao: ["maturidade", "aprendizado", "controle emocional"],
  }),
  createOpenChallenge({
    id: "emotional-intelligence-open-2",
    categoria: "Inteligência Emocional",
    titulo: "Pressão",
    pergunta:
      "Você recebeu um prazo praticamente impossível. Como reage?",
    descricao: "Explique como manteria responsabilidade sem prometer o impossível.",
    critériosAvaliacao: ["controle emocional", "negociação", "responsabilidade"],
  }),
  createOpenChallenge({
    id: "emotional-intelligence-open-3",
    categoria: "Inteligência Emocional",
    titulo: "Projeto Falhou",
    pergunta:
      "Um projeto em que você trabalhou falhou. Como você lida com isso?",
    descricao: "Descreva como transformaria a experiência em aprendizado.",
    critériosAvaliacao: ["aprendizado", "resiliência", "reflexão"],
  }),
];

const VALID_CHALLENGE_IDS = new Set(CHALLENGES.map((challenge) => challenge.id));
const CHALLENGE_COMPLETION_XP = 100;
const IDEAL_ANSWER_BONUS_XP = 50;
const LOW_QUALITY_ADJUSTMENT_XP = -40;
const DAILY_LOGIN_XP = 10;
const PERFECT_STREAK_TARGET = 3;
const PERFECT_STREAK_BONUS_XP = 30;
const OPEN_CHALLENGE_IDEAL_SCORE = 85;
const OPEN_CHALLENGE_MEDIUM_SCORE = 60;

const LEVELS = [
  { level: 1, title: "Trainee Soft Skills", minXp: 0 },
  { level: 2, title: "Colaborador", minXp: 250 },
  { level: 3, title: "Profissional Colaborativo", minXp: 550 },
  { level: 4, title: "Dev Influente", minXp: 950 },
  { level: 5, title: "Soft Skill Master", minXp: 1400 },
];

const DEFAULT_AVATAR = {
  cabelo: "short",
  roupa: "hoodie",
  cor: "indigo",
  acessorio: "none",
  tom: "warm",
  cabelo_cor: "dark",
  expressao: "happy",
};

const AVATAR_CATALOG = {
  cabelo: [
    { id: "short",    label: "Curto",          minLevel: 1 },
    { id: "curly",    label: "Cacheado",        minLevel: 1 },
    { id: "long",     label: "Longo",           minLevel: 1 },
    { id: "wavy",     label: "Ondulado",        minLevel: 2 },
    { id: "braids",   label: "Tranças",         minLevel: 2 },
    { id: "ponytail", label: "Rabo de cavalo",  minLevel: 3 },
    { id: "bun",      label: "Coque",           minLevel: 3 },
    { id: "spiky",    label: "Pontudo",         minLevel: 4 },
    { id: "mohawk",   label: "Moicano",         minLevel: 5 },
  ],
  roupa: [
    { id: "hoodie", label: "Moletom", minLevel: 1 },
    { id: "jacket", label: "Jaqueta", minLevel: 1 },
    { id: "blazer", label: "Blazer", minLevel: 3 },
    { id: "cape", label: "Capa tech", minLevel: 5 },
  ],
  cor: [
    { id: "indigo", label: "Indigo", value: "#5b6cff", secondary: "#8994ff", minLevel: 1 },
    { id: "teal", label: "Teal", value: "#0ea5a1", secondary: "#58d7cf", minLevel: 1 },
    { id: "sunset", label: "Sunset", value: "#f97316", secondary: "#fdba74", minLevel: 2 },
    { id: "rose", label: "Rose", value: "#e11d48", secondary: "#fb7185", minLevel: 3 },
    { id: "gold", label: "Gold", value: "#d4a017", secondary: "#f5d36f", minLevel: 5 },
  ],
  acessorio: [
    { id: "none", label: "Nenhum", minLevel: 1 },
    { id: "glasses", label: "Óculos", minLevel: 1 },
    { id: "headset", label: "Headset", minLevel: 2 },
    { id: "badge", label: "Broche", minLevel: 3 },
    { id: "crown", label: "Coroa", minLevel: 5 },
  ],
  tom: [
    { id: "warm",   label: "Quente",    skin: "#f2c7a5", neck: "#e6b792", minLevel: 1 },
    { id: "light",  label: "Clara",     skin: "#f9e0c6", neck: "#f0c8a8", minLevel: 1 },
    { id: "medium", label: "Média",     skin: "#d4a574", neck: "#bf9060", minLevel: 1 },
    { id: "tan",    label: "Bronzeada", skin: "#b07850", neck: "#976640", minLevel: 1 },
    { id: "dark",   label: "Escura",    skin: "#8d5524", neck: "#7a4a1e", minLevel: 1 },
  ],
  cabelo_cor: [
    { id: "dark",   label: "Preto",    value: "#2d2842", minLevel: 1 },
    { id: "brown",  label: "Castanho", value: "#6b4226", minLevel: 1 },
    { id: "blonde", label: "Loiro",    value: "#d4a017", minLevel: 1 },
    { id: "red",    label: "Ruivo",    value: "#b83221", minLevel: 2 },
    { id: "blue",   label: "Azul",     value: "#5b6cff", minLevel: 3 },
    { id: "pink",   label: "Rosa",     value: "#e11d48", minLevel: 4 },
  ],
  expressao: [
    { id: "happy",     label: "Alegre",   minLevel: 1 },
    { id: "cool",      label: "Cool",     minLevel: 1 },
    { id: "focused",   label: "Focado",   minLevel: 2 },
    { id: "surprised", label: "Surpreso", minLevel: 3 },
  ],
};

const BADGE_DEFINITIONS = [
  {
    id: "communicator-beginner",
    name: "Comunicador Iniciante",
    description: "Complete 3 desafios de Comunicação.",
    theme: "communication",
    predicate(context) {
      return countAttemptsByCategory(context.attempts, "Comunicação") >= 3;
    },
  },
  {
    id: "conflict-mediator",
    name: "Mediador de Conflitos",
    description: "Tenha uma resposta ideal no desafio de conflito entre colegas.",
    theme: "teamwork",
    predicate(context) {
      return (
        hasIdealAttempt(context.attempts, "teamwork-closed-2") ||
        hasIdealAttempt(context.attempts, "teamwork-open-2")
      );
    },
  },
  {
    id: "sprint-master",
    name: "Mestre da Sprint",
    description: "Complete todos os desafios de Gestão de Tempo.",
    theme: "time",
    predicate(context) {
      return countAttemptsByCategory(context.attempts, "Gestão de Tempo") >= 6;
    },
  },
  {
    id: "collaborative-dev",
    name: "Dev Colaborativo",
    description: "Complete ao menos 4 desafios de Trabalho em Equipe.",
    theme: "teamwork",
    predicate(context) {
      return countAttemptsByCategory(context.attempts, "Trabalho em Equipe") >= 4;
    },
  },
  {
    id: "leader-in-formation",
    name: "Líder em Formação",
    description: "Alcance o nível 3.",
    theme: "leadership",
    predicate(context) {
      return context.level >= 3;
    },
  },
];

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
  neutralidade: ["ambos", "critérios", "sem lado", "equilibrio", "imparcial"],
  comunicacao: ["alinhar", "conversar", "explicar", "escutar", "mensagem"],
  "pensamento critico": ["trade-off", "impacto", "critério", "risco", "beneficio"],
  analise: ["pros", "contras", "avaliar", "comparar", "critério"],
  metodo: ["diagnosticar", "isolar", "confirmar", "validar", "hipotese"],
  priorizacao: ["priorizar", "impacto", "urgência", "ordem", "primeiro"],
  "visao de produto": ["usuário", "produto", "negócio", "impacto", "valor"],
  responsabilidade: ["assumir", "comunicar", "resolver", "acompanhar", "compromisso"],
  investigacao: ["log", "hipotese", "causa", "evidencia", "investigar"],
  "uso de dados": ["metrica", "log", "dado", "observacao", "monitoramento"],
  "raciocinio logico": ["hipotese", "causa", "teste", "validar", "evidencia"],
  planejamento: ["planejar", "mapear", "etapa", "estimar", "organizar"],
  "gestao de tempo": ["agenda", "bloco", "priorizar", "prazo", "foco"],
  "analise de impacto": ["impacto", "risco", "valor", "dependencia", "resultado"],
  criterio: ["critério", "avaliar", "comparar", "decidir", "peso"],
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
    passwordResetTokens: [],
  };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getTodayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function isYesterdayKey(dateKey, todayKey = getTodayKey()) {
  if (!dateKey) {
    return false;
  }

  const today = new Date(`${todayKey}T00:00:00.000Z`);
  today.setUTCDate(today.getUTCDate() - 1);

  return dateKey === today.toISOString().slice(0, 10);
}

function getLevelDetails(xp) {
  const safeXp = Math.max(Number(xp) || 0, 0);
  let currentLevel = LEVELS[0];

  for (const level of LEVELS) {
    if (safeXp >= level.minXp) {
      currentLevel = level;
    }
  }

  return currentLevel;
}

function getNextLevel(level) {
  return LEVELS.find((item) => item.level === level + 1) || null;
}

function calculateLevel(xp) {
  return getLevelDetails(xp).level;
}

function buildAvatarCatalog(level) {
  return Object.fromEntries(
    Object.entries(AVATAR_CATALOG).map(([key, options]) => [
      key,
      options.map((option) => ({
        ...option,
        unlocked: option.minLevel <= level,
      })),
    ])
  );
}

function getFallbackAvatarOption(category, level) {
  const options = AVATAR_CATALOG[category] || [];
  return options.find((option) => option.minLevel <= level) || options[0];
}

function normalizeAvatarSelection(category, selectedId, level) {
  const options = AVATAR_CATALOG[category] || [];
  const selected = options.find((option) => option.id === selectedId && option.minLevel <= level);

  if (selected) {
    return selected.id;
  }

  return getFallbackAvatarOption(category, level)?.id || "";
}

function normalizeAvatarConfig(config, xp) {
  const level = getLevelDetails(xp).level;
  const source = config || DEFAULT_AVATAR;

  return {
    cabelo: normalizeAvatarSelection("cabelo", source.cabelo, level),
    roupa: normalizeAvatarSelection("roupa", source.roupa, level),
    cor: normalizeAvatarSelection("cor", source.cor, level),
    acessorio: normalizeAvatarSelection("acessorio", source.acessorio, level),
    tom: normalizeAvatarSelection("tom", source.tom || "warm", level),
    cabelo_cor: normalizeAvatarSelection("cabelo_cor", source.cabelo_cor || "dark", level),
    expressao: normalizeAvatarSelection("expressao", source.expressao || "happy", level),
  };
}

function createDefaultGamificationState() {
  return {
    perfectStreak: 0,
    dailyLoginStreak: 0,
    lastDailyLoginDate: null,
    idealAnswers: 0,
    lastRewardAt: null,
  };
}

function hydrateUser(user) {
  const xp = Math.max(Number(user?.xp) || 0, 0);
  const level = calculateLevel(xp);
  const nome = String(user?.nome || user?.usuário || "Dev").trim();

  return {
    ...user,
    nome,
    email: normalizeEmail(user?.email),
    usuário: user?.usuário || null,
    xp,
    nivel: level,
    badges: Array.isArray(user?.badges) ? user.badges.filter((badge) => badge?.id) : [],
    avatarConfig: normalizeAvatarConfig(user?.avatarConfig, xp),
    gamification: {
      ...createDefaultGamificationState(),
      ...(user?.gamification || {}),
    },
  };
}

function deriveQualityTier(score, challengeType = "aberto") {
  const safeScore = Number(score) || 0;

  if (challengeType === "fechado") {
    if (safeScore >= 85) {
      return "ideal";
    }

    if (safeScore >= 40) {
      return "medium";
    }

    return "low";
  }

  if (safeScore >= OPEN_CHALLENGE_IDEAL_SCORE) {
    return "ideal";
  }

  if (safeScore >= OPEN_CHALLENGE_MEDIUM_SCORE) {
    return "medium";
  }

  return "low";
}

function hydrateAttempt(attempt) {
  const challenge = getChallengeById(attempt?.challengeId);
  const score = Number(attempt?.score) || 0;
  const qualityTier =
    attempt?.qualityTier || deriveQualityTier(score, challenge?.tipo || attempt?.challengeType);

  return {
    ...attempt,
    score,
    xpAwarded: Number(attempt?.xpAwarded) || 0,
    xpBreakdown: Array.isArray(attempt?.xpBreakdown) ? attempt.xpBreakdown : [],
    category: attempt?.category || challenge?.categoria || "",
    qualityTier,
    wasIdeal:
      typeof attempt?.wasIdeal === "boolean" ? attempt.wasIdeal : qualityTier === "ideal",
    unlockedBadges: Array.isArray(attempt?.unlockedBadges) ? attempt.unlockedBadges : [],
  };
}

function hydratePasswordResetToken(resetToken) {
  return {
    id: String(resetToken?.id || crypto.randomUUID()),
    userId: String(resetToken?.userId || ""),
    tokenHash: String(resetToken?.tokenHash || ""),
    createdAt: String(resetToken?.createdAt || new Date().toISOString()),
    expiresAt: String(resetToken?.expiresAt || new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString()),
  };
}

function isPasswordResetTokenExpired(resetToken, now = Date.now()) {
  const expiresAt = Date.parse(resetToken?.expiresAt || "");
  return Number.isNaN(expiresAt) || expiresAt <= now;
}

function purgeExpiredPasswordResetTokens(database) {
  const previousLength = Array.isArray(database.passwordResetTokens)
    ? database.passwordResetTokens.length
    : 0;

  database.passwordResetTokens = (database.passwordResetTokens || []).filter(
    (resetToken) => !isPasswordResetTokenExpired(resetToken)
  );

  return database.passwordResetTokens.length !== previousLength;
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
      users: Array.isArray(parsed.users) ? parsed.users.map(hydrateUser) : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      challengeAttempts: Array.isArray(parsed.challengeAttempts)
        ? parsed.challengeAttempts.map(hydrateAttempt)
        : [],
      passwordResetTokens: Array.isArray(parsed.passwordResetTokens)
        ? parsed.passwordResetTokens.map(hydratePasswordResetToken)
        : [],
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

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createPasswordResetToken(userId) {
  const rawToken = createToken();
  const createdAt = new Date();

  return {
    rawToken,
    record: {
      id: crypto.randomUUID(),
      userId,
      tokenHash: hashToken(rawToken),
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + PASSWORD_RESET_TTL_MS).toISOString(),
    },
  };
}

function findPasswordResetToken(database, rawToken) {
  const tokenHash = hashToken(rawToken);

  return (database.passwordResetTokens || []).find((resetToken) => {
    if (!resetToken?.tokenHash || resetToken.tokenHash.length !== tokenHash.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(resetToken.tokenHash, "hex"),
      Buffer.from(tokenHash, "hex")
    );
  });
}

function shouldExposeResetPreview(req) {
  const hostname = String(req.hostname || "").toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function getAppBaseUrl(req) {
  const fallbackUrl = `${req.protocol}://${req.get("host")}`;
  return String(process.env.APP_BASE_URL || fallbackUrl)
    .trim()
    .replace(/\/+$/, "");
}

function buildPasswordResetUrl(req, rawToken) {
  return `${getAppBaseUrl(req)}/pages/reset_password.html?token=${encodeURIComponent(
    rawToken
  )}`;
}

function maskEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  const [localPart, domain] = normalizedEmail.split("@");

  if (!localPart || !domain) {
    return normalizedEmail;
  }

  const visibleLocal = localPart.slice(0, Math.min(2, localPart.length));
  return `${visibleLocal}${"*".repeat(Math.max(localPart.length - visibleLocal.length, 1))}@${domain}`;
}

function getEmailProvider() {
  const provider = normalizeTextValue(process.env.EMAIL_PROVIDER);

  if (provider) {
    return provider;
  }

  if (String(process.env.RESEND_API_KEY || "").trim()) {
    return "resend";
  }

  return "";
}

function getEmailFrom() {
  return String(process.env.EMAIL_FROM || "").trim();
}

function getEmailReplyTo() {
  return String(process.env.EMAIL_REPLY_TO || "").trim();
}

function isRealEmailConfigured() {
  return getEmailProvider() === "resend" && Boolean(process.env.RESEND_API_KEY && getEmailFrom());
}

function buildPasswordResetEmail({ user, req, rawToken, expiresAt }) {
  const resetUrl = buildPasswordResetUrl(req, rawToken);
  const safeName = escapeHtml(user.nome || "Dev");
  const expirationLabel = formatDisplayDate(expiresAt);
  const supportEmail = escapeHtml(getEmailReplyTo() || getEmailFrom());
  const safeResetUrl = escapeHtml(resetUrl);

  return {
    resetUrl,
    subject: "Redefina sua senha na SkillUp Dev",
    text: [
      `Olá, ${user.nome || "Dev"}!`,
      "",
      "Recebemos um pedido para redefinir sua senha na SkillUp Dev.",
      `Use este link: ${resetUrl}`,
      `Validade: ${expirationLabel}`,
      "",
      "Se você não solicitou a redefinição, ignore este email.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;background:#f5f7ff;padding:32px;color:#2c2457;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:20px;padding:32px;box-shadow:0 16px 40px rgba(44,36,87,0.12);">
          <p style="font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:#5b6cff;font-weight:700;margin:0 0 12px;">
            Recuperação de senha
          </p>
          <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;">Oi, ${safeName}</h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#4b4f70;">
            Recebemos um pedido para redefinir sua senha na SkillUp Dev.
          </p>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#4b4f70;">
            Clique no botão abaixo para criar uma nova senha. Esse link expira em <strong>${escapeHtml(
              expirationLabel
            )}</strong>.
          </p>
          <p style="margin:0 0 28px;">
            <a href="${safeResetUrl}" style="display:inline-block;background:linear-gradient(135deg,#5b6cff,#7a88ff);color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:700;">
              Redefinir senha
            </a>
          </p>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#6b6f8c;">
            Se o botão não abrir, copie e cole este link no navegador:
          </p>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;word-break:break-word;">
            <a href="${safeResetUrl}" style="color:#5b6cff;">${safeResetUrl}</a>
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#7b809d;">
            Se você não solicitou essa troca, ignore este email. Em caso de dúvida, fale com ${supportEmail}.
          </p>
        </div>
      </div>
    `,
  };
}

function formatDisplayDate(dateValue) {
  const parsedDate = new Date(dateValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return "alguns minutos";
  }

  return parsedDate.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

async function sendEmailWithResend({ to, subject, html, text }) {
  const payload = {
    from: getEmailFrom(),
    to: [to],
    subject,
    html,
    text,
  };

  const replyTo = getEmailReplyTo();
  if (replyTo) {
    payload.reply_to = replyTo;
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const reason = data?.message || data?.error || `status ${response.status}`;
    throw new Error(`Resend não aceitou o envio (${reason}).`);
  }

  return data;
}

async function sendPasswordResetEmail({ user, req, rawToken, expiresAt }) {
  const provider = getEmailProvider();
  const emailContent = buildPasswordResetEmail({ user, req, rawToken, expiresAt });

  if (provider === "resend") {
    return sendEmailWithResend({
      to: user.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
  }

  throw new Error("Provedor de email não suportado para envio real.");
}

function getUserAttempts(userId, database) {
  return database.challengeAttempts.filter(
    (attempt) => attempt.userId === userId && VALID_CHALLENGE_IDS.has(attempt.challengeId)
  );
}

function countAttemptsByCategory(attempts, category) {
  return attempts.filter((attempt) => attempt.category === category).length;
}

function hasIdealAttempt(attempts, challengeId) {
  return attempts.some((attempt) => attempt.challengeId === challengeId && attempt.wasIdeal);
}

function getProgress(xp) {
  const safeXp = Math.max(Number(xp) || 0, 0);
  const currentLevel = getLevelDetails(safeXp);
  const nextLevel = getNextLevel(currentLevel.level);

  if (!nextLevel) {
    return {
      xp: safeXp,
      level: currentLevel.level,
      levelLabel: currentLevel.title,
      currentLevelXp: safeXp - currentLevel.minXp,
      nextLevelXp: safeXp,
      xpToNextLevel: 0,
      progressPercent: 100,
      isMaxLevel: true,
    };
  }

  const levelSpan = nextLevel.minXp - currentLevel.minXp;
  const currentLevelXp = safeXp - currentLevel.minXp;

  return {
    xp: safeXp,
    level: currentLevel.level,
    levelLabel: currentLevel.title,
    currentLevelXp,
    nextLevelXp: levelSpan,
    xpToNextLevel: Math.max(nextLevel.minXp - safeXp, 0),
    progressPercent: Math.min(100, Math.round((currentLevelXp / levelSpan) * 100)),
    isMaxLevel: false,
  };
}

function buildBadgeCatalog(user, database) {
  const attempts = getUserAttempts(user.id, database);
  const level = getLevelDetails(user.xp).level;
  const savedBadges = new Map((user.badges || []).map((badge) => [badge.id, badge]));
  const context = { attempts, level };

  return BADGE_DEFINITIONS.map((definition) => {
    const savedBadge = savedBadges.get(definition.id);
    const unlocked = Boolean(savedBadge) || definition.predicate(context);

    return {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      theme: definition.theme,
      unlocked,
      earnedAt: savedBadge?.earnedAt || null,
    };
  });
}

function syncBadges(user, database) {
  const attempts = getUserAttempts(user.id, database);
  const level = getLevelDetails(user.xp).level;
  const existingIds = new Set((user.badges || []).map((badge) => badge.id));
  const unlockedNow = [];

  for (const definition of BADGE_DEFINITIONS) {
    if (definition.predicate({ attempts, level }) && !existingIds.has(definition.id)) {
      const badge = {
        id: definition.id,
        earnedAt: new Date().toISOString(),
      };

      user.badges.push(badge);
      existingIds.add(definition.id);
      unlockedNow.push({
        id: definition.id,
        name: definition.name,
        description: definition.description,
        theme: definition.theme,
        unlocked: true,
        earnedAt: badge.earnedAt,
      });
    }
  }

  return unlockedNow;
}

function buildCategoryProgress(attempts) {
  return Array.from(new Set(CHALLENGES.map((challenge) => challenge.categoria))).map((categoria) => {
    const total = CHALLENGES.filter((challenge) => challenge.categoria === categoria).length;
    const completed = countAttemptsByCategory(attempts, categoria);

    return {
      categoria,
      completed,
      total,
    };
  });
}

function buildUserResponse(user, database) {
  const progress = getProgress(user.xp);
  const attempts = getUserAttempts(user.id, database);
  const badgeCatalog = buildBadgeCatalog(user, database);
  const unlockedBadges = badgeCatalog.filter((badge) => badge.unlocked);

  return {
    id: user.id,
    nome: user.nome,
    usuário: user.usuário,
    email: user.email,
    ...progress,
    completedChallenges: attempts.length,
    totalChallenges: CHALLENGES.length,
    pendingChallenges: Math.max(CHALLENGES.length - attempts.length, 0),
    categoryProgress: buildCategoryProgress(attempts),
    badges: unlockedBadges,
    badgeCatalog,
    avatarConfig: normalizeAvatarConfig(user.avatarConfig, user.xp),
    avatarCatalog: buildAvatarCatalog(progress.level),
    gamification: {
      perfectStreak: Number(user.gamification?.perfectStreak) || 0,
      dailyLoginStreak: Number(user.gamification?.dailyLoginStreak) || 0,
      idealAnswers: Number(user.gamification?.idealAnswers) || 0,
      dailyLoginAwardedToday: user.gamification?.lastDailyLoginDate === getTodayKey(),
      totalBadges: unlockedBadges.length,
    },
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
    critériosAvaliacao: challenge.critériosAvaliacao || [],
    recompensas: {
      conclusionXp: CHALLENGE_COMPLETION_XP,
      idealBonusXp: IDEAL_ANSWER_BONUS_XP,
      perfectStreakBonusXp: PERFECT_STREAK_BONUS_XP,
    },
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
          qualityTier: completedAttempt.qualityTier,
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

  return uniqueCriteria.filter((critérion) => {
    const keywords = CRITERIA_KEYWORDS[critérion] || [];
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
    (critérion) => !matchedCriteria.includes(normalizeTextValue(critérion))
  );

  let score = 35;

  if (words.length >= 12) score += 15;
  if (words.length >= 24) score += 10;
  if (words.length >= 40) score += 10;
  if (generalKeywords.some((keyword) => normalizedAnswer.includes(keyword))) score += 10;
  score += Math.min(matchedCriteria.length * 10, 30);

  const finalScore = Math.max(35, Math.min(score, 100));

  let feedback =
    "Sua resposta está no caminho certo, mas ainda pode ganhar mais estrutura e objetividade.";

  if (finalScore >= OPEN_CHALLENGE_IDEAL_SCORE) {
    feedback =
      "Boa resposta. Você demonstrou maturidade, contexto e um encaminhamento claro para a situação.";
  } else if (finalScore >= OPEN_CHALLENGE_MEDIUM_SCORE) {
    feedback =
      "A resposta mostra boa intenção e uma linha de raciocínio útil, mas ainda pode ficar mais forte.";
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
  const criteria =
    Array.isArray(challenge.critériosAvaliacao) && challenge.critériosAvaliacao.length
      ? challenge.critériosAvaliacao
      : ["clareza", "empatia", "adequacao ao cenário"];

  if (!process.env.OPENAI_API_KEY) {
    return buildHeuristicFeedback(resposta, criteria);
  }

  const prompt = [
    "Avalie a resposta de um usuário em um desafio de soft skills.",
    `Categoria: ${challenge.categoria}`,
    `Titulo do desafio: ${challenge.titulo}`,
    `Pergunta: ${challenge.pergunta}`,
    `Resposta do usuário: ${resposta}`,
    "",
    "Considere especialmente estes critérios:",
    ...criteria.map((critérion) => `- ${critérion}`),
    "",
    "O feedback deve ser funcional, específico, educativo e curto.",
    'Retorne apenas JSON válido no formato {"nota": 0-100, "feedback": "texto curto"}',
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
      throw new Error("Não foi possível interpretar o JSON da avaliação.");
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

function applyDailyLoginReward(user) {
  const todayKey = getTodayKey();

  if (user.gamification.lastDailyLoginDate === todayKey) {
    return null;
  }

  user.xp += DAILY_LOGIN_XP;
  user.nivel = calculateLevel(user.xp);
  user.avatarConfig = normalizeAvatarConfig(user.avatarConfig, user.xp);
  user.gamification.dailyLoginStreak = isYesterdayKey(user.gamification.lastDailyLoginDate, todayKey)
    ? (Number(user.gamification.dailyLoginStreak) || 0) + 1
    : 1;
  user.gamification.lastDailyLoginDate = todayKey;
  user.gamification.lastRewardAt = new Date().toISOString();

  return {
    label: "Login diário",
    xp: DAILY_LOGIN_XP,
  };
}

function buildChallengeConsequence(qualityTier) {
  if (qualityTier === "ideal") {
    return "Sua decisão tende a aumentar a confiança, reduzir atrito e melhorar o resultado do cenário.";
  }

  if (qualityTier === "medium") {
    return "Sua escolha pode funcionar parcialmente, mas ainda deixa espaço para ruído, retrabalho ou tensão.";
  }

  return "Sua resposta tende a ampliar o problema ou reduzir a confiança das pessoas envolvidas.";
}

function buildXpBreakdown(qualityTier, streakBonusXp) {
  const qualityAdjustmentXp =
    qualityTier === "ideal" ? IDEAL_ANSWER_BONUS_XP : qualityTier === "low" ? LOW_QUALITY_ADJUSTMENT_XP : 0;

  const breakdown = [
    { label: "Desafio concluído", xp: CHALLENGE_COMPLETION_XP },
    { label: "Qualidade da resposta", xp: qualityAdjustmentXp },
  ];

  if (streakBonusXp > 0) {
    breakdown.push({
      label: `Sequência perfeita x${PERFECT_STREAK_TARGET}`,
      xp: streakBonusXp,
    });
  }

  return breakdown;
}

function buildChallengeResult({ challenge, score, feedback, previousStreak }) {
  const qualityTier = deriveQualityTier(score, challenge.tipo);
  const nextPerfectStreak = qualityTier === "ideal" ? previousStreak + 1 : 0;
  const streakBonusXp =
    nextPerfectStreak > 0 && nextPerfectStreak % PERFECT_STREAK_TARGET === 0
      ? PERFECT_STREAK_BONUS_XP
      : 0;
  const xpBreakdown = buildXpBreakdown(qualityTier, streakBonusXp);
  const xpGanho = xpBreakdown.reduce((total, item) => total + item.xp, 0);

  return {
    challengeId: challenge.id,
    qualityTier,
    wasIdeal: qualityTier === "ideal",
    feedback,
    nota: score,
    consequence: buildChallengeConsequence(qualityTier),
    xpBreakdown,
    xpGanho,
    perfectStreak: nextPerfectStreak,
  };
}

async function authenticateRequest(req, res, next) {
  const authorization = String(req.headers.authorization || "");

  if (!authorization.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token de acesso não informado." });
  }

  const token = authorization.slice("Bearer ".length).trim();
  const database = await readDatabase();
  const session = database.sessions.find((item) => item.token === token);

  if (!session) {
    return res.status(401).json({ message: "Sessão inválida ou expirada." });
  }

  const user = database.users.find((item) => item.id === session.userId);

  if (!user) {
    return res.status(401).json({ message: "Usuário da sessão não encontrado." });
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
  const email = normalizeEmail(req.body.email);
  const senha = String(req.body.senha || "");

  if (!nome || !email || !senha) {
    return res.status(400).json({ message: "Preencha nome, email e senha." });
  }

  if (senha.length < 6) {
    return res.status(400).json({ message: "A senha precisa ter pelo menos 6 caracteres." });
  }

  const database = await readDatabase();
  const emailExists = database.users.some((item) => item.email === email);

  if (emailExists) {
    return res.status(409).json({ message: "Já existe uma conta com este email." });
  }

  const user = hydrateUser({
    id: crypto.randomUUID(),
    nome,
    email,
    passwordHash: createPasswordHash(senha),
    xp: 0,
    nivel: 1,
    badges: [],
    avatarConfig: DEFAULT_AVATAR,
    gamification: createDefaultGamificationState(),
    createdAt: new Date().toISOString(),
  });

  const dailyLoginReward = applyDailyLoginReward(user);
  syncBadges(user, database);

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
    dailyLoginReward,
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
    return res.status(401).json({ message: "Email ou senha inválidos." });
  }

  database.sessions = database.sessions.filter((item) => item.userId !== user.id);

  const dailyLoginReward = applyDailyLoginReward(user);
  syncBadges(user, database);

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
    dailyLoginReward,
    user: buildUserResponse(user, database),
  });
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!email) {
    return res.status(400).json({ message: "Informe um e-mail válido." });
  }

  const database = await readDatabase();
  const removedExpiredTokens = purgeExpiredPasswordResetTokens(database);
  const user = database.users.find((item) => item.email === email);
  const response = {
    message: "Se existir uma conta com este email, enviaremos as instruções de recuperação.",
  };

  if (user) {
    database.passwordResetTokens = (database.passwordResetTokens || []).filter(
      (resetToken) => resetToken.userId !== user.id
    );

    const { rawToken, record } = createPasswordResetToken(user.id);
    database.passwordResetTokens.push(record);
    await writeDatabase(database);

    if (isRealEmailConfigured()) {
      try {
        await sendPasswordResetEmail({
          user,
          req,
          rawToken,
          expiresAt: record.expiresAt,
        });
      } catch (error) {
        console.error("Falha ao enviar email de recuperação:", error);
        return res.status(502).json({
          message:
            "Não foi possível enviar o email de recuperação agora. Confira a configuração de email e tente novamente.",
        });
      }

      response.message =
        "Se existir uma conta com este email, enviamos um link de recuperação. Verifique sua caixa de entrada e a pasta de spam.";
      return res.json(response);
    }

    if (shouldExposeResetPreview(req)) {
      response.message =
        "Email real não configurado neste ambiente. Use o link de teste abaixo para validar o fluxo.";
      response.previewResetUrl = buildPasswordResetUrl(req, rawToken);
      response.previewExpiresAt = record.expiresAt;
      return res.json(response);
    }

    return res.status(503).json({
      message:
        "Envio de e-mail não configurado no servidor. Defina as variáveis EMAIL_PROVIDER, EMAIL_FROM e RESEND_API_KEY.",
    });
  }

  if (removedExpiredTokens) {
    await writeDatabase(database);
  }

  return res.json(response);
});

app.get("/api/auth/reset-password/validate", async (req, res) => {
  const token = String(req.query.token || "").trim();

  if (!token) {
    return res.status(400).json({ message: "Token de recuperação não informado." });
  }

  const database = await readDatabase();
  const removedExpiredTokens = purgeExpiredPasswordResetTokens(database);
  const resetToken = findPasswordResetToken(database, token);

  if (removedExpiredTokens) {
    await writeDatabase(database);
  }

  if (!resetToken) {
    return res.status(400).json({ message: "Link de recuperação inválido ou expirado." });
  }

  const user = database.users.find((item) => item.id === resetToken.userId);

  if (!user) {
    return res.status(400).json({ message: "Link de recuperação inválido ou expirado." });
  }

  return res.json({
    message: "Link de recuperação válido.",
    emailHint: maskEmail(user.email),
    expiresAt: resetToken.expiresAt,
  });
});

app.post("/api/auth/reset-password", async (req, res) => {
  const token = String(req.body.token || "").trim();
  const senha = String(req.body.senha || "");

  if (!token) {
    return res.status(400).json({ message: "Token de recuperação não informado." });
  }

  if (senha.length < 6) {
    return res.status(400).json({ message: "A senha precisa ter pelo menos 6 caracteres." });
  }

  const database = await readDatabase();
  const removedExpiredTokens = purgeExpiredPasswordResetTokens(database);

  const resetToken = findPasswordResetToken(database, token);

  if (!resetToken) {
    if (removedExpiredTokens) {
      await writeDatabase(database);
    }
    return res.status(400).json({ message: "Link de recuperação inválido ou expirado." });
  }

  const user = database.users.find((item) => item.id === resetToken.userId);

  if (!user) {
    return res.status(400).json({ message: "Link de recuperação inválido ou expirado." });
  }

  user.passwordHash = createPasswordHash(senha);
  database.sessions = database.sessions.filter((session) => session.userId !== user.id);
  database.passwordResetTokens = database.passwordResetTokens.filter(
    (item) => item.userId !== user.id
  );

  await writeDatabase(database);

  return res.json({
    message: "Senha redefinida com sucesso. Faça login com a nova senha.",
  });
});

app.post("/api/auth/logout", authenticateRequest, async (req, res) => {
  req.database.sessions = req.database.sessions.filter((session) => session.token !== req.token);
  await writeDatabase(req.database);

  res.json({ message: "Sessão encerrada com sucesso." });
});

app.get("/api/me", authenticateRequest, async (req, res) => {
  res.json({
    user: buildUserResponse(req.user, req.database),
  });
});

app.patch("/api/me/avatar", authenticateRequest, async (req, res) => {
  req.user.avatarConfig = normalizeAvatarConfig(req.body.avatarConfig || req.body, req.user.xp);
  await writeDatabase(req.database);

  res.json({
    message: "Avatar salvo com sucesso.",
    user: buildUserResponse(req.user, req.database),
  });
});

app.get("/api/challenges", authenticateRequest, async (req, res) => {
  const userAttempts = getUserAttempts(req.user.id, req.database);

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
    return res.status(404).json({ message: "Desafio não encontrado." });
  }

  const existingAttempt = req.database.challengeAttempts.find(
    (attempt) => attempt.userId === req.user.id && attempt.challengeId === challenge.id
  );

  if (existingAttempt) {
    return res.status(409).json({
      message: "Este desafio já foi concluído.",
      result: {
        nota: existingAttempt.score,
        feedback: existingAttempt.feedback,
        consequence: existingAttempt.consequence,
        xpGanho: existingAttempt.xpAwarded,
        qualityTier: existingAttempt.qualityTier,
        xpBreakdown: existingAttempt.xpBreakdown,
        unlockedBadges: existingAttempt.unlockedBadges,
      },
      user: buildUserResponse(req.user, req.database),
    });
  }

  let answer = "";
  let score = 0;
  let feedback = "";

  if (challenge.tipo === "fechado") {
    const respostaId = String(req.body.respostaId || "").trim();
    const resposta = challenge.respostas.find((item) => item.id === respostaId);

    if (!resposta) {
      return res.status(400).json({ message: "Opção de resposta inválida." });
    }

    answer = resposta.texto;
    score = resposta.xp;
    feedback = challenge.dica ? `${resposta.feedback} Dica: ${challenge.dica}` : resposta.feedback;
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

    score = evaluation.nota;
    feedback = evaluation.feedback;
  }

  const result = buildChallengeResult({
    challenge,
    score,
    feedback,
    previousStreak: Number(req.user.gamification?.perfectStreak) || 0,
  });

  req.user.xp = Math.max(0, Number(req.user.xp) + result.xpGanho);
  req.user.nivel = calculateLevel(req.user.xp);
  req.user.avatarConfig = normalizeAvatarConfig(req.user.avatarConfig, req.user.xp);
  req.user.gamification.perfectStreak = result.perfectStreak;

  if (result.wasIdeal) {
    req.user.gamification.idealAnswers = (Number(req.user.gamification.idealAnswers) || 0) + 1;
  }

  const attemptRecord = {
    id: crypto.randomUUID(),
    userId: req.user.id,
    challengeId: challenge.id,
    challengeType: challenge.tipo,
    category: challenge.categoria,
    answer,
    feedback: result.feedback,
    consequence: result.consequence,
    score: result.nota,
    qualityTier: result.qualityTier,
    wasIdeal: result.wasIdeal,
    xpAwarded: result.xpGanho,
    xpBreakdown: result.xpBreakdown,
    unlockedBadges: [],
    createdAt: new Date().toISOString(),
  };

  req.database.challengeAttempts.push(attemptRecord);

  const unlockedBadges = syncBadges(req.user, req.database);
  attemptRecord.unlockedBadges = unlockedBadges;

  await writeDatabase(req.database);

  return res.json({
    message: "Desafio avaliado com sucesso.",
    result: {
      nota: result.nota,
      feedback: result.feedback,
      consequence: result.consequence,
      xpGanho: result.xpGanho,
      qualityTier: result.qualityTier,
      wasIdeal: result.wasIdeal,
      perfectStreak: result.perfectStreak,
      xpBreakdown: result.xpBreakdown,
      unlockedBadges,
    },
    user: buildUserResponse(req.user, req.database),
  });
});

app.listen(PORT, () => {
  console.log(`SkillUp Dev backend online em http://localhost:${PORT}`);
});
