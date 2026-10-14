// Validação do conteúdo de desafios editado pelo admin. São as mesmas regras que os testes
// de conteúdo garantiam quando os desafios ficavam no código: um desafio inválido quebraria
// o XP, as badges ou a avaliação, então ele não é salvo.
const { getSkillById } = require("../content/competencies");
const { getCategories } = require("../content/catalog");

const TYPES = ["aberto", "fechado"];
const CLOSED_ANSWER_XP = [5, 40, 100];
const LIMITS = { titulo: 80, pergunta: 600, descricao: 400, dica: 300, texto: 300, feedback: 500 };
const MIN_SKILLS = 1;
const MAX_SKILLS = 3;

const clean = (value) => String(value ?? "").trim();

function checkText(errors, label, value, max, { required = true } = {}) {
  if (required && !value) {
    errors.push(`${label}: obrigatório.`);
  } else if (value.length > max) {
    errors.push(`${label}: no máximo ${max} caracteres.`);
  }
}

// Devolve o conteúdo normalizado (só os campos conhecidos, com espaços aparados) e os erros.
function validateChallengeContent(tipo, input = {}) {
  const errors = [];

  if (!TYPES.includes(tipo)) {
    return { errors: ["Tipo inválido: use aberto ou fechado."], content: null };
  }

  const content = {
    categoria: clean(input.categoria),
    habilidades: Array.isArray(input.habilidades) ? input.habilidades.map(clean) : [],
    titulo: clean(input.titulo),
    pergunta: clean(input.pergunta),
    descricao: clean(input.descricao),
    dica: clean(input.dica),
  };

  if (!getCategories().includes(content.categoria)) {
    errors.push("Categoria: escolha uma das competências existentes.");
  }

  checkText(errors, "Título", content.titulo, LIMITS.titulo);
  checkText(errors, "Cenário", content.pergunta, LIMITS.pergunta);
  checkText(errors, "Descrição", content.descricao, LIMITS.descricao, { required: false });
  checkText(errors, "Dica", content.dica, LIMITS.dica, { required: false });

  const uniqueSkills = new Set(content.habilidades);
  if (content.habilidades.length < MIN_SKILLS || content.habilidades.length > MAX_SKILLS) {
    errors.push(`Habilidades: escolha de ${MIN_SKILLS} a ${MAX_SKILLS}.`);
  } else if (uniqueSkills.size !== content.habilidades.length) {
    errors.push("Habilidades: não repita a mesma habilidade.");
  }
  for (const skillId of content.habilidades) {
    if (!getSkillById(skillId)) {
      errors.push(`Habilidades: "${skillId}" não existe na taxonomia.`);
    }
  }

  if (tipo === "fechado") {
    const answers = Array.isArray(input.respostas) ? input.respostas : [];
    content.respostas = answers.map((answer, index) => ({
      id: String.fromCharCode(97 + index),
      texto: clean(answer?.texto),
      xp: Number(answer?.xp),
      feedback: clean(answer?.feedback),
    }));

    const xpValues = content.respostas.map((answer) => answer.xp).sort((a, b) => a - b);
    if (
      content.respostas.length !== CLOSED_ANSWER_XP.length ||
      xpValues.some((xp, index) => xp !== CLOSED_ANSWER_XP[index])
    ) {
      errors.push("Alternativas: são exatamente 3, uma de cada nível (5, 40 e 100 XP).");
    }

    content.respostas.forEach((answer, index) => {
      checkText(errors, `Alternativa ${index + 1}, texto`, answer.texto, LIMITS.texto);
      checkText(errors, `Alternativa ${index + 1}, feedback`, answer.feedback, LIMITS.feedback);
    });
  }

  return { errors, content };
}

// Id legível e estável para desafios novos: título em minúsculas, sem acentos, + sufixo.
function createChallengeId(titulo, random = Math.random) {
  const slug = clean(titulo)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Math.floor(random() * 36 ** 4)
    .toString(36)
    .padStart(4, "0");

  return `${slug || "desafio"}-${suffix}`;
}

module.exports = {
  CLOSED_ANSWER_XP,
  validateChallengeContent,
  createChallengeId,
};
