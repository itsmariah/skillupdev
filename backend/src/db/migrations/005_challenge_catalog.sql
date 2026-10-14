-- Conteúdo dos desafios no banco, com versões (auditoria, item 13; roadmap Fase 3).
-- challenges guarda a identidade e o estado; challenge_versions guarda o conteúdo de cada
-- versão. Versão publicada não muda: editar cria a próxima (um rascunho, até ser publicado).
-- Os 30 desafios que estavam no código entram como versão 1 na inicialização (semente).
CREATE TABLE challenges (
  id                 text PRIMARY KEY,
  tipo               text NOT NULL CHECK (tipo IN ('aberto', 'fechado')),
  status             text NOT NULL DEFAULT 'rascunho'
                     CHECK (status IN ('rascunho', 'publicado', 'arquivado')),
  published_version  integer,
  position           integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE challenge_versions (
  challenge_id  text NOT NULL REFERENCES challenges (id) ON DELETE CASCADE,
  version       integer NOT NULL CHECK (version >= 1),
  content       jsonb NOT NULL,
  created_by    text REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz,
  PRIMARY KEY (challenge_id, version)
);

-- Versão do desafio que a pessoa respondeu (o histórico mostra o enunciado daquela versão).
ALTER TABLE challenge_attempts ADD COLUMN challenge_version integer;
