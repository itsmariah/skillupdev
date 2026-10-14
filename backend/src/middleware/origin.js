// Proteção contra CSRF. Com a sessão em cookie, o navegador manda o cookie sozinho; o
// SameSite=Lax já barra a maioria dos envios vindos de outros sites, e esta checagem fecha
// o resto: requisições que alteram dados e trazem um Origin de outro site são recusadas.
// Sem Origin (curl, scripts, testes) não há navegador envolvido, então não há CSRF.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function createSameOriginCheck(allowedOrigins = []) {
  const allowed = new Set(allowedOrigins);

  return function requireSameOrigin(req, res, next) {
    const origin = req.get("origin");

    if (SAFE_METHODS.has(req.method) || !origin || allowed.has(origin)) {
      return next();
    }

    let originHost = null;
    try {
      originHost = new URL(origin).host;
    } catch (_error) {
      // "null" ou valor malformado: tratado como outra origem.
    }

    if (originHost && originHost === req.get("host")) {
      return next();
    }

    return res.status(403).json({ message: "Origem da requisição não permitida." });
  };
}

module.exports = {
  createSameOriginCheck,
};
