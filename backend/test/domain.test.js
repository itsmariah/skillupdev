// Testes de caracterização das regras de domínio: registram o comportamento atual
// para servir de rede de segurança durante a refatoração (Fase 1 do roadmap).
// Quando um teste documenta um problema conhecido da auditoria, isso está indicado no nome.
const test = require("node:test");
const assert = require("node:assert/strict");

const { CHALLENGES } = require("../src/content/challenges");
const {
  LEVELS,
  BADGE_XP,
  DEFAULT_AVATAR,
  AVATAR_CATALOG,
  DAILY_LOGIN_XP,
  PERFECT_STREAK_BONUS_XP,
  getTodayKey,
  isYesterdayKey,
  calculateLevel,
  getProgress,
  normalizeAvatarConfig,
  deriveQualityTier,
  buildChallengeResult,
  syncBadges,
  buildBadgeCatalog,
  applyDailyLoginReward,
} = require("../src/services/gamification");
const { hydrateUser } = require("../src/services/users");
const { buildHeuristicFeedback, extractJsonObject } = require("../src/services/evaluation");
const { createPasswordHash, verifyPassword } = require("../src/services/auth");
const { calcSusScore, susClassification } = require("../src/services/study");

const closedChallenge = CHALLENGES.find((challenge) => challenge.tipo === "fechado");
const openChallenge = CHALLENGES.find((challenge) => challenge.tipo === "aberto");

function createUser(overrides = {}) {
  return hydrateUser({ id: "user-1", nome: "Dev", email: "dev@teste.com", ...overrides });
}

function createAttempt(challenge, overrides = {}) {
  return {
    userId: "user-1",
    challengeId: challenge.id,
    category: challenge.categoria,
    wasIdeal: false,
    ...overrides,
  };
}

test.describe("deriveQualityTier", () => {
  test("desafio fechado: 100 é ideal, 40 é médio, 5 é baixo", () => {
    assert.equal(deriveQualityTier(100, "fechado"), "ideal");
    assert.equal(deriveQualityTier(85, "fechado"), "ideal");
    assert.equal(deriveQualityTier(40, "fechado"), "medium");
    assert.equal(deriveQualityTier(5, "fechado"), "low");
  });

  test("desafio aberto: ideal a partir de 85 e médio a partir de 60", () => {
    assert.equal(deriveQualityTier(85, "aberto"), "ideal");
    assert.equal(deriveQualityTier(84, "aberto"), "medium");
    assert.equal(deriveQualityTier(60, "aberto"), "medium");
    assert.equal(deriveQualityTier(59, "aberto"), "low");
  });

  test("nota inválida conta como zero", () => {
    assert.equal(deriveQualityTier("abc", "aberto"), "low");
    assert.equal(deriveQualityTier(undefined, "fechado"), "low");
  });
});

test.describe("buildChallengeResult — XP", () => {
  const cases = [
    { challenge: closedChallenge, score: 100, tier: "ideal", xp: 100 },
    { challenge: closedChallenge, score: 40, tier: "medium", xp: 40 },
    { challenge: closedChallenge, score: 5, tier: "low", xp: 30 },
    { challenge: openChallenge, score: 90, tier: "ideal", xp: 120 },
    { challenge: openChallenge, score: 70, tier: "medium", xp: 48 },
    { challenge: openChallenge, score: 30, tier: "low", xp: 36 },
  ];

  for (const { challenge, score, tier, xp } of cases) {
    test(`${challenge.tipo}, nota ${score}: ${tier} com ${xp} XP`, () => {
      const result = buildChallengeResult({ challenge, score, feedback: "", previousStreak: 0 });

      assert.equal(result.qualityTier, tier);
      assert.equal(result.wasIdeal, tier === "ideal");
      assert.equal(result.xpGanho, xp);
      assert.equal(
        result.xpGanho,
        result.xpBreakdown.reduce((total, item) => total + item.xp, 0)
      );
    });
  }
});

test.describe("buildChallengeResult — sequência perfeita", () => {
  test("a 5ª resposta ideal seguida dá bônus de sequência", () => {
    const result = buildChallengeResult({
      challenge: closedChallenge,
      score: 100,
      feedback: "",
      previousStreak: 4,
    });

    assert.equal(result.perfectStreak, 5);
    assert.equal(result.xpGanho, 100 + PERFECT_STREAK_BONUS_XP);
  });

  test("o bônus se repete a cada múltiplo de 5", () => {
    const tenth = buildChallengeResult({ challenge: closedChallenge, score: 100, feedback: "", previousStreak: 9 });
    const sixth = buildChallengeResult({ challenge: closedChallenge, score: 100, feedback: "", previousStreak: 5 });

    assert.equal(tenth.xpGanho, 100 + PERFECT_STREAK_BONUS_XP);
    assert.equal(sixth.xpGanho, 100);
  });

  test("resposta média em desafio fechado zera a sequência", () => {
    const result = buildChallengeResult({ challenge: closedChallenge, score: 40, feedback: "", previousStreak: 3 });
    assert.equal(result.perfectStreak, 0);
  });

  test("resposta média em desafio aberto mantém a sequência", () => {
    const result = buildChallengeResult({ challenge: openChallenge, score: 70, feedback: "", previousStreak: 3 });
    assert.equal(result.perfectStreak, 3);
  });

  test("resposta baixa zera a sequência em qualquer tipo", () => {
    const result = buildChallengeResult({ challenge: openChallenge, score: 10, feedback: "", previousStreak: 3 });
    assert.equal(result.perfectStreak, 0);
  });
});

test.describe("níveis e progresso", () => {
  test("calculateLevel respeita os limites da tabela de níveis", () => {
    for (const level of LEVELS) {
      assert.equal(calculateLevel(level.minXp), level.level);

      if (level.minXp > 0) {
        assert.equal(calculateLevel(level.minXp - 1), level.level - 1);
      }
    }
  });

  test("XP negativo ou inválido fica no nível 1", () => {
    assert.equal(calculateLevel(-50), 1);
    assert.equal(calculateLevel("abc"), 1);
  });

  test("getProgress calcula o avanço dentro do nível", () => {
    const progress = getProgress(750);

    assert.equal(progress.level, 2);
    assert.equal(progress.currentLevelXp, 350);
    assert.equal(progress.nextLevelXp, 700);
    assert.equal(progress.xpToNextLevel, 350);
    assert.equal(progress.progressPercent, 50);
    assert.equal(progress.isMaxLevel, false);
  });

  test("getProgress no nível máximo fica em 100%", () => {
    const maxLevel = LEVELS[LEVELS.length - 1];
    const progress = getProgress(maxLevel.minXp + 1000);

    assert.equal(progress.level, maxLevel.level);
    assert.equal(progress.isMaxLevel, true);
    assert.equal(progress.progressPercent, 100);
    assert.equal(progress.xpToNextLevel, 0);
  });
});

test.describe("normalizeAvatarConfig", () => {
  test("sem configuração usa o avatar padrão", () => {
    assert.deepEqual(normalizeAvatarConfig(null, 0), DEFAULT_AVATAR);
  });

  test("item bloqueado para o nível volta para a primeira opção liberada", () => {
    const locked = AVATAR_CATALOG.cabelo.find((option) => option.minLevel > 1);
    const config = normalizeAvatarConfig({ ...DEFAULT_AVATAR, cabelo: locked.id }, 0);

    assert.equal(config.cabelo, AVATAR_CATALOG.cabelo[0].id);
  });

  test("item liberado pelo nível é mantido", () => {
    const locked = AVATAR_CATALOG.cabelo.find((option) => option.minLevel > 1);
    const levelXp = LEVELS.find((level) => level.level === locked.minLevel).minXp;
    const config = normalizeAvatarConfig({ ...DEFAULT_AVATAR, cabelo: locked.id }, levelXp);

    assert.equal(config.cabelo, locked.id);
  });

  test("id inexistente volta para a primeira opção", () => {
    const config = normalizeAvatarConfig({ ...DEFAULT_AVATAR, roupa: "nao-existe" }, 0);
    assert.equal(config.roupa, AVATAR_CATALOG.roupa[0].id);
  });
});

test.describe("badges", () => {
  test("primeira tentativa desbloqueia 'Primeira Missão' e soma o XP da raridade", () => {
    const user = createUser();
    const unlocked = syncBadges(user, [createAttempt(closedChallenge)]);

    assert.deepEqual(unlocked.map((badge) => badge.id), ["first-mission"]);
    assert.equal(unlocked[0].xpBonus, BADGE_XP.comum);
    assert.equal(user.xp, BADGE_XP.comum);
    assert.equal(user.badges.length, 1);
  });

  test("badge já conquistada não é concedida de novo", () => {
    const user = createUser();
    const attempts = [createAttempt(closedChallenge)];

    syncBadges(user, attempts);
    const secondRun = syncBadges(user, attempts);

    assert.deepEqual(secondRun, []);
    assert.equal(user.xp, BADGE_XP.comum);
  });

  test("tentativas de desafios que não existem mais não contam", () => {
    const user = createUser();
    const attempts = [{ ...createAttempt(closedChallenge), challengeId: "desafio-removido" }];

    assert.deepEqual(syncBadges(user, attempts), []);
  });

  test("'Líder em Formação' é concedida ao alcançar o nível 3", () => {
    const user = createUser({ xp: LEVELS.find((level) => level.level === 3).minXp });
    const unlocked = syncBadges(user, []);

    assert.ok(unlocked.some((badge) => badge.id === "leader-in-formation"));
  });

  test("'Mediador de Conflitos' exige ideal nos dois desafios de conflito", () => {
    const user = createUser();
    const closedConflict = CHALLENGES.find((challenge) => challenge.id === "teamwork-closed-2");
    const openConflict = CHALLENGES.find((challenge) => challenge.id === "teamwork-open-2");

    const onlyOne = [createAttempt(closedConflict, { wasIdeal: true })];
    assert.ok(!syncBadges(user, onlyOne).some((badge) => badge.id === "conflict-mediator"));

    const both = [
      createAttempt(closedConflict, { wasIdeal: true }),
      createAttempt(openConflict, { wasIdeal: true }),
    ];
    assert.ok(syncBadges(user, both).some((badge) => badge.id === "conflict-mediator"));
  });

  test("buildBadgeCatalog lista todas as badges e marca as desbloqueadas", () => {
    const user = createUser();
    const catalog = buildBadgeCatalog(user, [createAttempt(closedChallenge)]);

    assert.ok(catalog.length > 0);
    assert.equal(catalog.find((badge) => badge.id === "first-mission").unlocked, true);
    assert.equal(catalog.find((badge) => badge.id === "full-dev").unlocked, false);
  });
});

test.describe("login diário", () => {
  const today = getTodayKey();
  const yesterday = (() => {
    const date = new Date(`${today}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return getTodayKey(date);
  })();

  test("não dá XP duas vezes no mesmo dia", () => {
    const user = createUser({ gamification: { lastDailyLoginDate: today, dailyLoginStreak: 2 } });

    assert.equal(applyDailyLoginReward(user), null);
    assert.equal(user.xp, 0);
  });

  test("login no dia seguinte soma XP e aumenta a sequência", () => {
    const user = createUser({ gamification: { lastDailyLoginDate: yesterday, dailyLoginStreak: 2 } });
    const reward = applyDailyLoginReward(user);

    assert.equal(reward.xp, DAILY_LOGIN_XP);
    assert.equal(user.xp, DAILY_LOGIN_XP);
    assert.equal(user.gamification.dailyLoginStreak, 3);
    assert.equal(user.gamification.lastDailyLoginDate, today);
  });

  test("depois de pular um dia a sequência recomeça em 1", () => {
    const user = createUser({ gamification: { lastDailyLoginDate: "2020-01-01", dailyLoginStreak: 7 } });
    applyDailyLoginReward(user);

    assert.equal(user.gamification.dailyLoginStreak, 1);
  });

  test("isYesterdayKey funciona na virada de mês", () => {
    assert.equal(isYesterdayKey("2026-02-28", "2026-03-01"), true);
    assert.equal(isYesterdayKey("2026-02-27", "2026-03-01"), false);
    assert.equal(isYesterdayKey(null, "2026-03-01"), false);
  });

  test("problema conhecido (auditoria, item 17): o dia vira em UTC, às 21h no Brasil", () => {
    assert.equal(getTodayKey(new Date("2026-10-13T22:00:00-03:00")), "2026-10-14");
  });
});

test.describe("avaliação heurística (fallback da IA)", () => {
  test("resposta curta recebe a nota mínima e pede mais desenvolvimento", () => {
    const result = buildHeuristicFeedback("ok", ["empatia"]);

    assert.equal(result.nota, 35);
    assert.match(result.feedback, /muito curta/);
  });

  test("a nota fica sempre entre 35 e 100", () => {
    const longAnswer = Array.from({ length: 60 }, () => "entendo empatia clareza alinhar").join(" ");
    const result = buildHeuristicFeedback(longAnswer, ["empatia", "clareza", "comunicação"]);

    assert.ok(result.nota >= 35 && result.nota <= 100);
  });

  test("resposta mais longa não recebe nota menor que uma curta", () => {
    const short = buildHeuristicFeedback("Eu conversaria com a equipe sobre o problema.", []);
    const long = buildHeuristicFeedback(
      "Eu conversaria com a equipe sobre o problema, explicaria o impacto no prazo, ouviria as preocupações de cada pessoa e proporia um plano para priorizar as tarefas mais críticas da sprint.",
      []
    );

    assert.ok(long.nota >= short.nota);
  });
});

test.describe("extractJsonObject", () => {
  test("lê JSON puro", () => {
    assert.deepEqual(extractJsonObject('{"nota": 80, "feedback": "ok"}'), { nota: 80, feedback: "ok" });
  });

  test("lê JSON cercado de texto ou bloco de código", () => {
    const text = 'Aqui está:\n```json\n{"nota": 70, "feedback": "bom"}\n```';
    assert.deepEqual(extractJsonObject(text), { nota: 70, feedback: "bom" });
  });

  test("devolve null para texto vazio ou inválido", () => {
    assert.equal(extractJsonObject(""), null);
    assert.equal(extractJsonObject("sem json aqui"), null);
    assert.equal(extractJsonObject("{quebrado"), null);
  });
});

test.describe("senha", () => {
  test("hash confere com a senha certa e rejeita a errada", () => {
    const hash = createPasswordHash("senha-segura");

    assert.equal(verifyPassword("senha-segura", hash), true);
    assert.equal(verifyPassword("outra-senha", hash), false);
  });

  test("o mesmo texto gera hashes diferentes (salt aleatório)", () => {
    assert.notEqual(createPasswordHash("igual"), createPasswordHash("igual"));
  });

  test("hash ausente ou malformado é rejeitado", () => {
    assert.equal(verifyPassword("x", undefined), false);
    assert.equal(verifyPassword("x", "sem-separador"), false);
  });
});

test.describe("SUS (estudo piloto)", () => {
  const answers = (odd, even) =>
    Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [`s${index + 1}`, (index + 1) % 2 === 1 ? odd : even])
    );

  test("respostas extremas dão 0 e 100; neutras dão 50", () => {
    assert.equal(calcSusScore(answers(5, 1)), 100);
    assert.equal(calcSusScore(answers(1, 5)), 0);
    assert.equal(calcSusScore(answers(3, 3)), 50);
  });

  test("comportamento atual: sem respostas o resultado é 25", () => {
    assert.equal(calcSusScore({}), 25);
  });

  test("classificação por faixa", () => {
    assert.equal(susClassification(97.9), "Excelente");
    assert.equal(susClassification(71), "Bom");
    assert.equal(susClassification(51), "Razoável");
    assert.equal(susClassification(50), "Ruim");
  });
});
