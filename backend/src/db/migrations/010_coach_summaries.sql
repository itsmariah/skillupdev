-- Resumo de evolução (roadmap Fase 4): um texto curto do coach por pessoa, gerado pela IA a
-- partir das notas (não das respostas). Fica guardado para não chamar a IA a cada visita ao
-- dashboard; attempts_count diz com quantas tentativas ele foi gerado (se houver mais agora,
-- está desatualizado). Sai junto com a conta e entra na exportação dos dados.
CREATE TABLE coach_summaries (
  user_id         text PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  summary         jsonb NOT NULL,
  attempts_count  integer NOT NULL,
  evaluator       text NOT NULL,
  meta            jsonb,
  generated_at    timestamptz NOT NULL DEFAULT now()
);
