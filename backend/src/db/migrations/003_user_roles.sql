-- Papéis de usuário no lugar do booleano is_admin (auditoria, Fase 1).
-- Novos papéis entram ampliando a lista do CHECK (e ROLES em src/services/roles.js).
ALTER TABLE users ADD COLUMN role text NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin'));
UPDATE users SET role = 'admin' WHERE is_admin;
ALTER TABLE users DROP COLUMN is_admin;
