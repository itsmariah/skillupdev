// Conexão com o banco. Com DATABASE_URL usa PostgreSQL (Neon em produção);
// sem ela, usa o PGlite: um Postgres embutido para desenvolvimento local e testes.
// As duas opções expõem a mesma interface: query, exec e transaction.
const { DATABASE_URL, PGLITE_DATA_DIR } = require("../config");

function createPostgresClient() {
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });

  const wrap = (connection) => ({
    query: (text, params) => connection.query(text, params),
    exec: (text) => connection.query(text),
  });

  return {
    kind: "postgres",
    ...wrap(pool),
    async transaction(fn) {
      const connection = await pool.connect();

      try {
        await connection.query("BEGIN");
        const result = await fn(wrap(connection));
        await connection.query("COMMIT");
        return result;
      } catch (error) {
        await connection.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        connection.release();
      }
    },
    close: () => pool.end(),
  };
}

function createPgliteClient() {
  // Em hospedagem, cair no PGlite significaria gravar dados num disco temporário.
  if (process.env.NODE_ENV === "production" || process.env.RENDER) {
    throw new Error("DATABASE_URL não definida. Em produção o banco precisa ser PostgreSQL.");
  }

  let PGlite;
  try {
    ({ PGlite } = require("@electric-sql/pglite"));
  } catch (error) {
    throw new Error(
      "DATABASE_URL não definida e PGlite não instalado. Rode npm install ou defina DATABASE_URL.",
      { cause: error },
    );
  }

  const database = new PGlite(PGLITE_DATA_DIR);

  const wrap = (connection) => ({
    query: (text, params) => connection.query(text, params),
    exec: (text) => connection.exec(text),
  });

  return {
    kind: "pglite",
    ...wrap(database),
    transaction: (fn) => database.transaction((tx) => fn(wrap(tx))),
    close: () => database.close(),
  };
}

let client = null;

function getClient() {
  if (!client) {
    client = DATABASE_URL ? createPostgresClient() : createPgliteClient();
  }

  return client;
}

async function closeClient() {
  if (client) {
    await client.close();
    client = null;
  }
}

function isUniqueViolation(error) {
  return error?.code === "23505";
}

module.exports = {
  getClient,
  closeClient,
  isUniqueViolation,
};
