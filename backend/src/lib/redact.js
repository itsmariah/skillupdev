// Remoção de dados pessoais de textos livres antes de enviá-los a um serviço externo (a IA).
// O texto guardado na conta não muda: só a cópia enviada passa por aqui.
// Os padrões são conservadores (formatos brasileiros comuns) para não estragar respostas
// normais: anos, prazos e números pequenos não são tocados.

// A ordem importa: CNPJ antes de cartão (14 dígitos), cartão antes de telefone e telefone
// antes de CPF (um celular sem formatação também tem 11 dígitos).
const PATTERNS = [
  { key: "email", label: "[e-mail]", regex: /[\p{L}\d._%+-]+@[\p{L}\d-]+(?:\.[\p{L}\d-]+)+/gu },
  { key: "cnpj", label: "[CNPJ]", regex: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g },
  { key: "cartao", label: "[cartão]", regex: /\b(?:\d{4}[ -]?){3}\d{1,7}\b/g },
  // Telefone com DDD (10 ou 11 dígitos), com ou sem +55, parênteses, espaço ou hífen.
  {
    key: "telefone",
    label: "[telefone]",
    regex: /(?:\+?55[\s-]?)?(?:\(\d{2}\)|\b\d{2})[\s-]?9?\d{4}[\s-]?\d{4}\b/g,
  },
  { key: "cpf", label: "[CPF]", regex: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g },
];

const MIN_NAME_PART = 3;
// Partículas que não identificam ninguém sozinhas.
const NAME_PARTICLES = new Set(["da", "de", "do", "das", "dos", "e"]);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Partes do nome com 3 letras ou mais, como foram escritas (com a inicial maiúscula). A busca
// diferencia maiúsculas: "Clara" (nome) sai, "clara" (comunicação clara) fica.
function nameParts(names) {
  const parts = new Set();
  for (const name of names || []) {
    for (const raw of String(name || "").split(/\s+/)) {
      const part = raw.replace(/[^\p{L}'-]/gu, "");
      if (part.length < MIN_NAME_PART || NAME_PARTICLES.has(part.toLowerCase())) continue;
      parts.add(part.charAt(0).toUpperCase() + part.slice(1));
      parts.add(part.toUpperCase());
    }
  }
  return [...parts].sort((a, b) => b.length - a.length);
}

// Devolve o texto sem os dados pessoais e quantos de cada tipo foram trocados.
function redactPersonalData(text, { names = [] } = {}) {
  let result = String(text ?? "");
  const counts = {};
  const count = (key) => {
    counts[key] = (counts[key] || 0) + 1;
  };

  for (const { key, label, regex } of PATTERNS) {
    result = result.replace(regex, () => {
      count(key);
      return label;
    });
  }

  const parts = nameParts(names);
  if (parts.length) {
    const nameRegex = new RegExp(
      `(?<![\\p{L}\\d])(?:${parts.map(escapeRegex).join("|")})(?![\\p{L}\\d])`,
      "gu",
    );
    result = result.replace(nameRegex, () => {
      count("nome");
      return "[nome]";
    });
  }

  return { text: result, counts };
}

// Soma as contagens de várias chamadas (ex.: resposta atual + anterior).
function mergeCounts(...list) {
  const total = {};
  for (const counts of list) {
    for (const [key, value] of Object.entries(counts || {})) {
      total[key] = (total[key] || 0) + value;
    }
  }
  return total;
}

module.exports = {
  redactPersonalData,
  mergeCounts,
};
