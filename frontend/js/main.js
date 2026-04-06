/* LANDING PAGE */

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
/* FIM LANDING PAGE */

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

    /* LOADING BOTÃO 'ENTRANDO...' */
    const form = document.querySelector("form");
    const btn = document.getElementById("loginBtn");

    form.addEventListener("submit", function(e) {

        e.preventDefault();

        btn.innerText = "Entrando...";
        btn.disabled = true;

        // simulação de login
        setTimeout(() => {
            btn.innerText = "Entrar";
            btn.disabled = false;
            alert("Login realizado (simulação)");
        }, 2000);

    });

    /* FEEDBACK DE ERRO */
    const email = document.getElementById("email");
    const senha = document.getElementById("senha");

    email.addEventListener("input", () => {
        if (!email.checkValidity()) {
            email.style.borderColor = "#ff4d4d";
        } else {
            email.style.borderColor = "#28a745";
        }
    });

    senha.addEventListener("input", () => {
        if (senha.value.length < 6) {
            senha.style.borderColor = "#ff4d4d";
        } else {
            senha.style.borderColor = "#28a745";
        }
    });
/* FIM LOGIN PAGE */

/* REGISTRATION PAGE */
    /* REGISTER */
    const registerForm = document.getElementById("registerForm");

    if (registerForm) {

        const btn = document.getElementById("registerBtn");
        const senha = document.getElementById("senha");
        const confirmarSenha = document.getElementById("confirmarSenha");

        registerForm.addEventListener("submit", function(e) {
            e.preventDefault();

            // valida senha
            if (senha.value !== confirmarSenha.value) {
                alert("As senhas não coincidem!");
                return;
            }

            btn.innerText = "Criando conta...";
            btn.disabled = true;

            setTimeout(() => {
                btn.innerText = "Criar conta";
                btn.disabled = false;
                alert("Conta criada (simulação)");
            }, 2000);
        });

    }
/* FIM REGISTRATION PAGE */

/* DASHBOARD PAGE */
     /* SIMULAÇÃO USUÁRIO */
        document.addEventListener("DOMContentLoaded", () => {

            const nome = localStorage.getItem("userName");

            if (nome) {
                document.getElementById("userName").innerText = nome;
            }

        });

        /* LOGOUT */

        function logout() {
            localStorage.clear();
            window.location.href = "login.html";
        }
/* FIM DASHBOARD PAGE */

    /* DESAFIOS */

    const desafios = [
    {
        pergunta: "Você discorda de um colega em uma reunião. O que faz?",
        respostas: [
        { texto: "Ignorar a situação", xp: 10, feedback: "Evitar conflitos pode prejudicar o time." },
        { texto: "Responder de forma agressiva", xp: 30, feedback: "Comunicação agressiva não é ideal." },
        { texto: "Dialogar com respeito", xp: 100, feedback: "Ótima escolha! Comunicação assertiva é essencial." }
        ]
    },
    {
        pergunta: "Você recebeu um feedback negativo. Como reage?",
        respostas: [
        { texto: "Ignora", xp: 10, feedback: "Isso impede seu crescimento." },
        { texto: "Fica chateado mas escuta", xp: 50, feedback: "Você está no caminho certo." },
        { texto: "Agradece e aplica melhorias", xp: 100, feedback: "Excelente mentalidade de crescimento!" }
        ]
    }
    ];

    let desafioAtual = 0;

    /* embaralhar */
    function embaralhar(lista) {
        return lista.sort(() => Math.random() - 0.5);
    }

    /* mostrar desafio */
    function carregarDesafio() {

        const desafio = desafios[desafioAtual];

        document.getElementById("pergunta").innerText = desafio.pergunta;

        const respostasDiv = document.getElementById("respostas");
        respostasDiv.innerHTML = "";

        const respostas = embaralhar([...desafio.respostas]);

        respostas.forEach(resp => {

            const btn = document.createElement("button");

            btn.className = "btn btn-outline-primary resposta-btn";
            btn.innerText = resp.texto;

            btn.onclick = () => responder(resp);

            respostasDiv.appendChild(btn);
        });

    }

    /* responder */
    function responder(resp) {

        const feedbackDiv = document.getElementById("feedback");
        const nextBtn = document.getElementById("nextBtn");

        // desabilitar botões
        document.querySelectorAll(".resposta-btn").forEach(btn => {
            btn.disabled = true;
        });

        // salvar XP
        let xp = parseInt(localStorage.getItem("xp")) || 0;
        xp += resp.xp;
        localStorage.setItem("xp", xp);

        // feedback visual
        if (resp.xp >= 100) {
            feedbackDiv.className = "feedback-certo";
        } else if (resp.xp >= 50) {
            feedbackDiv.className = "feedback-medio";
        } else {
            feedbackDiv.className = "feedback-ruim";
        }

        feedbackDiv.innerText = `${resp.feedback} (+${resp.xp} XP)`;

        nextBtn.classList.remove("d-none");
    }

    /* próximo desafio */
    document.addEventListener("DOMContentLoaded", () => {

        if (document.getElementById("pergunta")) {

            carregarDesafio();

            document.getElementById("nextBtn").addEventListener("click", () => {

                desafioAtual++;

                if (desafioAtual >= desafios.length) {
                    alert("Você completou todos os desafios! 🎉");
                    window.location.href = "dashboard.html";
                    return;
                }

                document.getElementById("feedback").innerText = "";
                document.getElementById("nextBtn").classList.add("d-none");

                carregarDesafio();
            });
        }

    });