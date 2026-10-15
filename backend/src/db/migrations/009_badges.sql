-- Badges configuráveis (roadmap Fase 3). Antes, cada badge era uma função no código; agora
-- é uma linha com uma regra de um tipo conhecido (backend/src/content/badgeRules.js), editada
-- no painel admin. A semente (content/badges.js) entra na primeira inicialização.
-- Badge não é apagada, só desativada: quem já ganhou (user_badges) continua com ela.
CREATE TABLE badges (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  description  text NOT NULL,
  rarity       text NOT NULL CHECK (rarity IN ('comum', 'raro', 'epico', 'lendario')),
  rule         jsonb NOT NULL,
  active       boolean NOT NULL DEFAULT false,
  position     integer NOT NULL DEFAULT 0,
  updated_by   text REFERENCES users (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
