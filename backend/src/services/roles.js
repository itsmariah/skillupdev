// Papéis de usuário. Substituem o antigo booleano isAdmin e abrem espaço para novos papéis
// (por exemplo, quem só gerencia conteúdo) sem mexer no esquema de novo: basta incluir o
// valor aqui e na restrição CHECK da tabela users.
const ROLES = Object.freeze({
  USER: "user",
  ADMIN: "admin",
});

const VALID_ROLES = new Set(Object.values(ROLES));

// Aceita registros antigos (isAdmin: true) e cai em "user" para qualquer valor desconhecido.
function resolveRole(user) {
  if (VALID_ROLES.has(user?.role)) {
    return user.role;
  }

  return user?.isAdmin ? ROLES.ADMIN : ROLES.USER;
}

function hasRole(user, ...roles) {
  return roles.includes(resolveRole(user));
}

module.exports = {
  ROLES,
  resolveRole,
  hasRole,
};
