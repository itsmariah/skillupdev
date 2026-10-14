// Importação de um lote de desafios como rascunho (escritos fora do painel, revisados nele).
// Valida o lote inteiro antes de gravar: com qualquer erro, nada entra. Desafios que já existem
// (mesmo título na mesma competência) são pulados, então rodar duas vezes não duplica.
const { validateChallengeContent, createChallengeId } = require("../services/content");
const { insertChallengeDraftRows } = require("./challenges");

async function findExistingTitles(db) {
  const { rows } = await db.query(`
    SELECT DISTINCT content->>'categoria' AS categoria, content->>'titulo' AS titulo
    FROM challenge_versions
  `);
  return new Set(rows.map((row) => `${row.categoria}::${row.titulo}`));
}

// batch: { lote, desafios: [{ tipo, categoria, dificuldade, habilidades, titulo, ... }] }
async function importChallengeDrafts(batch, db) {
  const items = Array.isArray(batch?.desafios) ? batch.desafios : null;
  if (!items || items.length === 0) {
    throw new Error('Arquivo em formato inesperado: falta a lista "desafios".');
  }

  const validated = items.map((item, index) => {
    const { tipo, ...input } = item || {};
    const { errors, content } = validateChallengeContent(tipo, input);
    return { index, tipo, content, errors };
  });

  const invalid = validated.filter((item) => item.errors.length > 0);
  if (invalid.length > 0) {
    const details = invalid
      .map(
        (item) =>
          `  #${item.index + 1} (${item.content?.titulo || "sem título"}): ${item.errors.join(" ")}`,
      )
      .join("\n");
    throw new Error(`O lote tem desafios inválidos. Nada foi gravado.\n${details}`);
  }

  const report = { lote: batch.lote || null, criados: [], pulados: [] };

  await db.transaction(async (tx) => {
    const existing = await findExistingTitles(tx);

    for (const item of validated) {
      const key = `${item.content.categoria}::${item.content.titulo}`;
      if (existing.has(key)) {
        report.pulados.push(item.content.titulo);
        continue;
      }

      const id = createChallengeId(item.content.titulo);
      await insertChallengeDraftRows(
        { id, tipo: item.tipo, content: item.content, createdBy: null },
        tx,
      );
      existing.add(key);
      report.criados.push({
        id,
        titulo: item.content.titulo,
        dificuldade: item.content.dificuldade,
      });
    }
  });

  return report;
}

module.exports = {
  importChallengeDrafts,
};
