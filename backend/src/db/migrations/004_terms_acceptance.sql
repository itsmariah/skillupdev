-- Registro do aceite dos Termos de uso e da Política de privacidade (LGPD).
-- Fica nulo para contas criadas antes da exigência do aceite no cadastro.
ALTER TABLE users ADD COLUMN terms_version text;
ALTER TABLE users ADD COLUMN terms_accepted_at timestamptz;
