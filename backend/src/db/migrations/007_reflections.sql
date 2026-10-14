-- Diário de reflexão (roadmap Fase 3): texto opcional que a pessoa escreve depois do feedback
-- de uma tentativa. Privado: só a própria pessoa vê e edita; entra na exportação dos dados.
ALTER TABLE challenge_attempts ADD COLUMN reflection text;
ALTER TABLE challenge_attempts ADD COLUMN reflection_updated_at timestamptz;
