// Encerramento gracioso: com SIGTERM (o que o Render manda a cada deploy), o servidor fecha o
// banco e sai com código 0. No Windows não há SIGTERM de verdade (o kill encerra à força),
// então o teste roda só no CI (Linux) e em macOS.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { spawn } = require("child_process");

const SERVER = path.join(__dirname, "..", "server.js");

test(
  "SIGTERM: para de aceitar conexões, fecha o banco e sai com 0",
  { skip: process.platform === "win32" && "sem SIGTERM real no Windows", timeout: 30000 },
  async () => {
    const port = 39000 + Math.floor(Math.random() * 900);
    const child = spawn(process.execPath, [SERVER], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: "",
        PGLITE_DATA_DIR: "memory://",
        OPENAI_API_KEY: "",
        PORT: String(port),
        LOG_LEVEL: "info",
        LOG_FORMAT: "json",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));

    for (let i = 0; i < 100 && !output.includes("online"); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(output.includes("online"), output);

    const health = await fetch(`http://localhost:${port}/api/health`);
    assert.equal(health.status, 200);

    const exited = new Promise((resolve) => child.on("exit", (code) => resolve(code)));
    child.kill("SIGTERM");
    assert.equal(await exited, 0, output);
    assert.match(output, /Encerrando o servidor/);
  },
);
