const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: ["node_modules/", "backend/data/"],
  },
  js.configs.recommended,
  {
    rules: {
      // Argumentos e erros não usados são comuns em handlers do Express e em catch.
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    files: ["backend/**/*.js", "eslint.config.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node,
    },
  },
  {
    // Front sem bundler: scripts comuns carregados pelas páginas, que se comunicam via window.
    files: ["frontend/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        ...globals.browser,
        bootstrap: "readonly",
      },
    },
  },
];
