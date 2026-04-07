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

    /* LÓGICA DE XP E NÍVEL */
            function adicionarXp(valor) {
            const xpAtual = parseInt(localStorage.getItem("xp")) || 0;
            const novoXp = xpAtual + valor;

            localStorage.setItem("xp", novoXp);

            const nivel = calcularNivel(novoXp);
            localStorage.setItem("nivel", nivel);
        }

        function calcularNivel(xp) {
            return Math.floor(xp / 200) + 1;
        }
/* FIM DASHBOARD PAGE */

    /* DESAFIOS */

    const desafios = [
    {
        id: 1,
        tipo: "fechado",
        categoria: "Comunicação",
        pergunta: "Um cliente está irritado dizendo que o sistema caiu. Como você responde?",
        descricao: "Escolha a alternativa que melhor se adequa à situação.",
        respostas: [
        {
            texto: "Não é problema nosso, deve ser sua rede.",
            xp: 5,
            feedback: "Essa resposta tende a piorar o conflito e demonstra pouca empatia."
        },
        {
            texto: "Entendo sua frustração. Vamos verificar e te atualizar.",
            xp: 100,
            feedback: "Ótima escolha. Você demonstrou empatia, transparência e postura profissional."
        },
        {
            texto: "Explicar em termos técnicos complexos sobre servidor.",
            xp: 40,
            feedback: "Há intenção de explicar, mas faltou clareza e empatia."
        }
        ]
    },
    {
        id: 2,
        tipo: "aberto",
        categoria: "Comunicação",
        pergunta: "Como você responderia a um cliente irritado com a instabilidade do sistema?",
        descricao: "Escreva sua resposta com suas próprias palavras. A IA vai avaliar clareza, empatia e profissionalismo."
    }
    ];

    /* lógica principal */
    let desafioAtualIndex = 0;

    document.addEventListener("DOMContentLoaded", () => {
        const perguntaEl = document.getElementById("pergunta");

        if (!perguntaEl) return;

        carregarDesafio();

        const nextBtn = document.getElementById("nextBtn");
        nextBtn.addEventListener("click", proximoDesafio);
    });

    function carregarDesafio() {
        const desafio = desafios[desafioAtualIndex];

        document.getElementById("categoria").textContent = desafio.categoria;
        document.getElementById("pergunta").textContent = desafio.pergunta;
        document.getElementById("descricao").textContent = desafio.descricao || "";

        document.getElementById("feedback").innerHTML = "";
        document.getElementById("nextBtn").classList.add("d-none");

        const respostasContainer = document.getElementById("respostas");
        respostasContainer.innerHTML = "";

        if (desafio.tipo === "fechado") {
            renderizarDesafioFechado(desafio, respostasContainer);
        } else if (desafio.tipo === "aberto") {
            renderizarDesafioAberto(desafio, respostasContainer);
        }
    }

    /* render desafio fechado */
            function embaralharRespostas(lista) {
            return [...lista].sort(() => Math.random() - 0.5);
        }

        function renderizarDesafioFechado(desafio, container) {
            const respostas = embaralharRespostas(desafio.respostas);

            respostas.forEach((resposta) => {
                const botao = document.createElement("button");
                botao.className = "challenge-option";
                botao.textContent = resposta.texto;

                botao.addEventListener("click", () => {
                    responderDesafioFechado(resposta);
                });

                container.appendChild(botao);
            });
        }

        function responderDesafioFechado(resposta) {
            adicionarXp(resposta.xp);

            document.getElementById("feedback").innerHTML = `
                <div class="feedback-box">
                    <p class="feedback-score">XP ganho: ${resposta.xp}</p>
                    <p>${resposta.feedback}</p>
                </div>
            `;

            desabilitarOpcoesFechadas();
            document.getElementById("nextBtn").classList.remove("d-none");
        }

        function desabilitarOpcoesFechadas() {
            document.querySelectorAll(".challenge-option").forEach((btn) => {
                btn.disabled = true;
            });
        }

    /* render desafio aberto com IA */
        function renderizarDesafioAberto(desafio, container) {
        container.innerHTML = `
            <textarea
                id="respostaUsuario"
                class="form-control challenge-textarea"
                placeholder="Digite sua resposta aqui..."
            ></textarea>

            <button id="submitOpenChallenge" class="btn btn-primary challenge-submit-btn">
                Enviar resposta
            </button>
        `;

        const submitBtn = document.getElementById("submitOpenChallenge");

        submitBtn.addEventListener("click", async () => {
            await responderDesafioAberto(submitBtn);
        });
    }

    /* responder desafio aberto */
        async function responderDesafioAberto(botao) {
        const textarea = document.getElementById("respostaUsuario");
        const texto = textarea.value.trim();
        const desafio = desafios[desafioAtualIndex];

        if (!texto) {
            document.getElementById("feedback").innerHTML = `
                <div class="feedback-box">
                    <p>Digite uma resposta antes de enviar.</p>
                </div>
            `;
            return;
        }

        botao.disabled = true;
        botao.textContent = "Analisando...";

        document.getElementById("feedback").innerHTML = `
            <div class="feedback-box">
                <p>Analisando sua resposta com IA...</p>
            </div>
        `;

        try {
            const resultado = await enviarRespostaIA(texto, desafio);

            adicionarXp(resultado.nota);

            document.getElementById("feedback").innerHTML = `
                <div class="feedback-box">
                    <p class="feedback-score">XP ganho: ${resultado.nota}</p>
                    <p>${resultado.feedback}</p>
                </div>
            `;

            textarea.disabled = true;
            botao.classList.add("d-none");
            document.getElementById("nextBtn").classList.remove("d-none");
        } catch (error) {
            document.getElementById("feedback").innerHTML = `
                <div class="feedback-box">
                    <p>Não foi possível avaliar sua resposta agora. Tente novamente.</p>
                </div>
            `;

            botao.disabled = false;
            botao.textContent = "Enviar resposta";
            console.error(error);
        }
    }

    /* lógica de próximo desafio */
        function proximoDesafio() {
        desafioAtualIndex++;

        if (desafioAtualIndex >= desafios.length) {
            window.location.href = "dashboard.html";
            return;
        }

        carregarDesafio();
    }

    /* FIM DESAFIOS */

    /* implementação IA */
    async function enviarRespostaIA(texto) {

    const response = await fetch("http://localhost:3000/avaliar", {
        method: "POST",
        headers: {
        "Content-Type": "application/json"
        },
        body: JSON.stringify({ resposta: texto })
    });

    return await response.json();
    }

    /* ligando com a página de desafios */
    async function enviarResposta() {

    const texto = document.getElementById("respostaUsuario").value;

    const resultado = await enviarRespostaIA(texto);

    mostrarFeedbackIA(resultado);
    }

    /* mostrando resultado */
    function mostrarFeedbackIA(data) {

    const feedbackDiv = document.getElementById("feedback");

    feedbackDiv.innerHTML = `
        <p><strong>XP ganho:</strong> ${data.nota}</p>
        <p>${data.feedback}</p>
    `;

    let xp = parseInt(localStorage.getItem("xp")) || 0;
    xp += data.nota;

    localStorage.setItem("xp", xp);
    }