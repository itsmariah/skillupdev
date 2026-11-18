-- Monitoramento da IA (roadmap Fase 4): uma linha por chamada à OpenAI, com recurso, modelo,
-- tokens, latência, sucesso ou erro e custo estimado no momento da chamada. Sem conteúdo e sem
-- quem fez o pedido: o painel mostra totais, não pessoas.
CREATE TABLE ai_usage (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  feature            text NOT NULL,
  model              text NOT NULL,
  ok                 boolean NOT NULL,
  error              text,
  prompt_tokens      integer,
  completion_tokens  integer,
  total_tokens       integer,
  latency_ms         integer NOT NULL,
  cost_usd           numeric(12, 6),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_usage_created_at_idx ON ai_usage (created_at);
