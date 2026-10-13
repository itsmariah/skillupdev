-- Esquema inicial: equivalente ao antigo documento JSON único (users, sessions,
-- challengeAttempts, passwordResetTokens, study_responses), agora em tabelas.
-- Ids são texto para aceitar os registros importados do formato antigo.

CREATE TABLE users (
  id                     text PRIMARY KEY,
  nome                   text NOT NULL,
  email                  text NOT NULL UNIQUE,
  legacy_username        text,
  password_hash          text NOT NULL,
  is_admin               boolean NOT NULL DEFAULT false,
  xp                     integer NOT NULL DEFAULT 0,
  nivel                  integer NOT NULL DEFAULT 1,
  avatar_config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  perfect_streak         integer NOT NULL DEFAULT 0,
  daily_login_streak     integer NOT NULL DEFAULT 0,
  last_daily_login_date  text,
  ideal_answers          integer NOT NULL DEFAULT 0,
  last_reward_at         timestamptz,
  study_pre_done         boolean NOT NULL DEFAULT false,
  study_post_done        boolean NOT NULL DEFAULT false,
  study_version          integer,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_badges (
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  badge_id   text NOT NULL,
  earned_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);

CREATE TABLE sessions (
  token_hash  text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);

-- Por enquanto, uma tentativa por desafio (a restrição única impede XP em dobro).
-- Quando houver novas tentativas (Fase 3 do roadmap), a restrição sai.
CREATE TABLE challenge_attempts (
  id               text PRIMARY KEY,
  user_id          text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  challenge_id     text NOT NULL,
  challenge_type   text,
  category         text NOT NULL DEFAULT '',
  answer           text NOT NULL DEFAULT '',
  feedback         text NOT NULL DEFAULT '',
  consequence      text,
  score            double precision NOT NULL DEFAULT 0,
  quality_tier     text NOT NULL,
  was_ideal        boolean NOT NULL DEFAULT false,
  xp_awarded       integer NOT NULL DEFAULT 0,
  xp_breakdown     jsonb NOT NULL DEFAULT '[]'::jsonb,
  unlocked_badges  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, challenge_id)
);

CREATE TABLE password_reset_tokens (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE TABLE study_responses (
  id             text PRIMARY KEY,
  user_id        text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  user_name      text,
  user_email     text,
  type           text NOT NULL CHECK (type IN ('pre', 'post')),
  study_version  integer,
  submitted_at   timestamptz NOT NULL DEFAULT now(),
  data           jsonb NOT NULL,
  UNIQUE (user_id, type)
);
