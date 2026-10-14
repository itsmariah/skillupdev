-- Dificuldade dos desafios (base das trilhas da Fase 3). Fica no conteúdo versionado
-- (challenge_versions.content.dificuldade). Para o que já existe, a classificação é acrescentada
-- às versões atuais sem criar versões novas: só entra o campo, o enunciado não muda.
-- Fechados são básicos; dos abertos originais, um por competência é avançado; o resto,
-- intermediário (inclusive desafios criados no painel antes desta migração).
UPDATE challenge_versions v
SET content = v.content || jsonb_build_object(
  'dificuldade',
  CASE
    WHEN c.tipo = 'fechado' THEN 'basico'
    WHEN v.challenge_id IN ('communication-open-2', 'teamwork-open-2', 'problem-solving-open-1', 'time-management-open-2', 'emotional-intelligence-open-2') THEN 'avancado'
    ELSE 'intermediario'
  END
)
FROM challenges c
WHERE c.id = v.challenge_id AND NOT (v.content ? 'dificuldade');
