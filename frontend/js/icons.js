// Ícones do sprite SVG (assets/icons/sprite.svg) para uso nos scripts das páginas.
(function attachSkillUpIcons() {
  const SPRITE_URL = "/assets/icons/sprite.svg";

  const CATEGORY_ICON = {
    Comunicação: "message",
    "Trabalho em Equipe": "users",
    "Resolução de Problemas": "puzzle",
    "Gestão de Tempo": "clock",
    "Inteligência Emocional": "heart",
  };

  // Decorativo por padrão (aria-hidden); o texto ao lado é que dá o significado.
  function icon(name, className = "") {
    return `<svg class="ui-icon ${className}" aria-hidden="true" focusable="false"><use href="${SPRITE_URL}#icon-${name}"></use></svg>`;
  }

  function categoryIcon(categoria, className = "") {
    return icon(CATEGORY_ICON[categoria] || "target", className);
  }

  window.skillUpIcons = { icon, categoryIcon };
})();
