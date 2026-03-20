/* CONTROLE DE INTERAÇÕES DA LANDING PAGE */

document.addEventListener("DOMContentLoaded", () => {

    /* NAVBAR DINÂMICA */
    const navbar = document.querySelector(".navbar");

    if (navbar) {
        window.addEventListener("scroll", () => {

            if (window.scrollY > 50) {
                navbar.classList.add("navbar-scrolled");
            } else {
                navbar.classList.remove("navbar-scrolled");
            }

        });
    }

    /* BACKGROUND COM PARTÍCULAS */
    const container = document.getElementById("code-particles");

    if (container) {

        const symbols = [
            "{ }", "< >", "</>", "( )",
            "[ ]", "==", "!=", "&&", "||", "=>"
        ];

        for (let i = 0; i < 40; i++) {

            const span = document.createElement("span");

            span.classList.add("code-symbol");

            // Seleção aleatória de símbolos
            span.innerText = symbols[Math.floor(Math.random() * symbols.length)];

            // Distribuição horizontal aleatória
            span.style.left = Math.random() * 100 + "vw";

            // Velocidade variável para naturalidade
            span.style.animationDuration = (10 + Math.random() * 20) + "s";

            // Tamanho variável
            span.style.fontSize = (18 + Math.random() * 20) + "px";

            container.appendChild(span);
        }
    }

});

/* LOGIN PAGE */
    /*FUNÇÃO PARA TOGGLE DE SENHA */
    function toggleSenha() {
    const input = document.getElementById("senha");
    const icon = document.getElementById("toggleSenhaIcon");

    if (input.type === "password") {
        input.type = "text";

        icon.src = "../assets/icons/eye.svg";
        icon.classList.add("active");

    } else {
        input.type = "password";

        icon.src = "../assets/icons/eye-slash.svg";
        icon.classList.remove("active");
    }
    }

    /* VALIDAÇÃO DE FORMULÁRIO */
    document.addEventListener("DOMContentLoaded", () => {

    const forms = document.querySelectorAll(".needs-validation");

    forms.forEach(form => {
        form.addEventListener("submit", event => {

        if (!form.checkValidity()) {
            event.preventDefault();
            event.stopPropagation();
        }

        form.classList.add("was-validated");
        });
    });

    });