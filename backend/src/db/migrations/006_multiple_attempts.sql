-- Várias tentativas por desafio (roadmap Fase 3). Sai a restrição de uma tentativa por
-- desafio; entra o número da tentativa, único por usuário e desafio (dois envios simultâneos
-- não viram a mesma tentativa). As tentativas existentes são a tentativa 1.
ALTER TABLE challenge_attempts ADD COLUMN attempt_number integer NOT NULL DEFAULT 1;
ALTER TABLE challenge_attempts DROP CONSTRAINT challenge_attempts_user_id_challenge_id_key;
ALTER TABLE challenge_attempts
  ADD CONSTRAINT challenge_attempts_user_challenge_attempt_key
  UNIQUE (user_id, challenge_id, attempt_number);
CREATE INDEX challenge_attempts_user_challenge_idx ON challenge_attempts (user_id, challenge_id);
