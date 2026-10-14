// Papéis de usuário: regra de resolução e migração do antigo is_admin.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");

const { ROLES, resolveRole, hasRole } = require("../src/services/roles");
const { hydrateUser } = require("../src/services/users");

const migration = (name) =>
  fs.readFileSync(path.join(__dirname, "..", "src", "db", "migrations", name), "utf8");

test("papel válido é mantido; registros antigos usam isAdmin; o resto vira user", () => {
  assert.equal(resolveRole({ role: "admin" }), ROLES.ADMIN);
  assert.equal(resolveRole({ role: "user", isAdmin: true }), ROLES.USER);
  assert.equal(resolveRole({ isAdmin: true }), ROLES.ADMIN);
  assert.equal(resolveRole({ role: "superadmin" }), ROLES.USER);
  assert.equal(resolveRole(null), ROLES.USER);
});

test("hasRole aceita uma lista de papéis", () => {
  assert.equal(hasRole({ role: "admin" }, ROLES.ADMIN), true);
  assert.equal(hasRole({ role: "user" }, ROLES.ADMIN), false);
  assert.equal(hasRole({ role: "user" }, ROLES.USER, ROLES.ADMIN), true);
});

test("hydrateUser troca isAdmin por role", () => {
  const user = hydrateUser({ id: "u1", email: "a@b.com", isAdmin: true });
  assert.equal(user.role, ROLES.ADMIN);
  assert.equal("isAdmin" in user, false);
});

test("migração 003 converte is_admin em role e recusa papéis desconhecidos", async () => {
  const database = new PGlite("memory://");

  try {
    await database.exec(migration("001_initial.sql"));
    await database.exec(`
      INSERT INTO users (id, nome, email, password_hash, is_admin) VALUES
        ('a', 'Admin', 'admin@teste.com', 'x', true),
        ('b', 'Pessoa', 'pessoa@teste.com', 'x', false);
    `);
    await database.exec(migration("003_user_roles.sql"));

    const { rows } = await database.query("SELECT id, role FROM users ORDER BY id");
    assert.deepEqual(rows, [
      { id: "a", role: "admin" },
      { id: "b", role: "user" },
    ]);

    await assert.rejects(() =>
      database.query("UPDATE users SET role = 'superadmin' WHERE id = 'b'"),
    );
  } finally {
    await database.close();
  }
});
