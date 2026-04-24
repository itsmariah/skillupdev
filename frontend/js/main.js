document.addEventListener("DOMContentLoaded", () => {
  const navbar = document.querySelector(".navbar");

  if (navbar) {
    const syncNavbarHeight = () => {
      document.documentElement.style.setProperty(
        "--navbar-height",
        `${navbar.offsetHeight}px`
      );
    };

    const handleNavbarScroll = () => {
      if (window.scrollY > 50) {
        navbar.classList.add("navbar-scrolled");
      } else {
        navbar.classList.remove("navbar-scrolled");
      }
    };

    syncNavbarHeight();
    handleNavbarScroll();

    window.addEventListener("resize", syncNavbarHeight);
    window.addEventListener("scroll", handleNavbarScroll, { passive: true });
  }

  const container = document.getElementById("code-particles");

  if (!container) {
    return;
  }

  const symbols = ["{ }", "< >", "</>", "( )", "[ ]", "==", "!=", "&&", "||", "=>"];

  for (let index = 0; index < 40; index += 1) {
    const span = document.createElement("span");

    span.classList.add("code-symbol");
    span.innerText = symbols[Math.floor(Math.random() * symbols.length)];
    span.style.left = `${Math.random() * 100}vw`;
    span.style.animationDuration = `${10 + Math.random() * 20}s`;
    span.style.fontSize = `${18 + Math.random() * 20}px`;

    container.appendChild(span);
  }
});
