function calcSusScore(sus) {
  const odd = [1, 3, 5, 7, 9];
  const even = [2, 4, 6, 8, 10];
  let total = 0;
  for (const i of odd) total += (Number(sus[`s${i}`]) || 1) - 1;
  for (const i of even) total += 5 - (Number(sus[`s${i}`]) || 3);
  return Math.round(total * 2.5);
}

function susClassification(score) {
  if (score >= 85) return "Excelente";
  if (score >= 71) return "Bom";
  if (score >= 51) return "Razoável";
  return "Ruim";
}

module.exports = {
  calcSusScore,
  susClassification,
};
