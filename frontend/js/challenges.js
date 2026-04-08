/* CHALLENGES PAGE */

        /* DESAFIOS
        - Desafios fechados e abertos
        - Integração com backend/IA
        - Cálculo de XP e nível
        */

        /* BASE DE DESAFIOS */
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

        /* ESTADO GLOBAL DA PÁGINA */
        let desafioAtualIndex = 0;

        /* INICIALIZAÇÃO */
        document.addEventListener("DOMContentLoaded", () => {
            const perguntaEl = document.getElementById("pergunta");
            const nextBtn = document.getElementById("nextBtn");

            if (!perguntaEl || !nextBtn) return;

            carregarDesafio();

            nextBtn.addEventListener("click", proximoDesafio);
        });

        /* CARREGAR DESAFIO ATUAL */
        function carregarDesafio() {
            const desafio = desafios[desafioAtualIndex];

            if (!desafio) return;

            const categoriaEl = document.getElementById("categoria");
            const perguntaEl = document.getElementById("pergunta");
            const descricaoEl = document.getElementById("descricao");
            const respostasContainer = document.getElementById("respostas");
            const feedbackEl = document.getElementById("feedback");
            const nextBtn = document.getElementById("nextBtn");

            categoriaEl.textContent = desafio.categoria;
            perguntaEl.textContent = desafio.pergunta;
            descricaoEl.textContent = desafio.descricao || "";

            respostasContainer.innerHTML = "";
            feedbackEl.innerHTML = "";
            nextBtn.classList.add("d-none");

            if (desafio.tipo === "fechado") {
                renderizarDesafioFechado(desafio, respostasContainer);
            } else if (desafio.tipo === "aberto") {
                renderizarDesafioAberto(desafio, respostasContainer);
            }
        }

        /* DESAFIO FECHADO */
        function embaralharRespostas(lista) {
            return [...lista].sort(() => Math.random() - 0.5);
        }

        function renderizarDesafioFechado(desafio, container) {
            const respostas = embaralharRespostas(desafio.respostas);

            respostas.forEach((resposta) => {
                const botao = document.createElement("button");
                botao.className = "challenge-option";
                botao.textContent = resposta.texto;
                botao.type = "button";

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

        /* DESAFIO ABERTO */
        function renderizarDesafioAberto(desafio, container) {
            container.innerHTML = `
                <textarea
                    id="respostaUsuario"
                    class="form-control challenge-textarea"
                    placeholder="Digite sua resposta aqui..."
                ></textarea>

                <button
                    id="submitOpenChallenge"
                    class="btn btn-primary challenge-submit-btn"
                    type="button"
                >
                    Enviar resposta
                </button>
            `;

            const submitBtn = document.getElementById("submitOpenChallenge");

            submitBtn.addEventListener("click", async () => {
                await responderDesafioAberto(submitBtn);
            });
        }

        async function responderDesafioAberto(botao) {
            const textarea = document.getElementById("respostaUsuario");
            const texto = textarea.value.trim();
            const desafio = desafios[desafioAtualIndex];
            const feedbackEl = document.getElementById("feedback");

            if (!texto) {
                feedbackEl.innerHTML = `
                    <div class="feedback-box">
                        <p>Digite uma resposta antes de enviar.</p>
                    </div>
                `;
                return;
            }

            botao.disabled = true;
            botao.textContent = "Analisando...";

            feedbackEl.innerHTML = `
                <div class="feedback-box">
                    <p>Analisando sua resposta com IA...</p>
                </div>
            `;

            try {
                const resultado = await enviarRespostaIA(texto, desafio);

                adicionarXp(resultado.nota);

                feedbackEl.innerHTML = `
                    <div class="feedback-box">
                        <p class="feedback-score">XP ganho: ${resultado.nota}</p>
                        <p>${resultado.feedback}</p>
                    </div>
                `;

                textarea.disabled = true;
                botao.classList.add("d-none");
                document.getElementById("nextBtn").classList.remove("d-none");
            } catch (error) {
                    feedbackEl.innerHTML = `
                        <div class="feedback-box">
                            <p>Não foi possível avaliar sua resposta agora.</p>
                            <p class="feedback-text">Detalhe: ${error.message}</p>
                        </div>
                    `;

                    botao.disabled = false;
                    botao.textContent = "Enviar resposta";
                    console.error("Erro ao avaliar resposta com IA:", error);
                }
        }

        /*BACKEND / IA */
        async function enviarRespostaIA(texto, desafio) {
            const response = await fetch("http://localhost:3000/avaliar", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    resposta: texto,
                    categoria: desafio.categoria,
                    pergunta: desafio.pergunta
                })
            });

            if (!response.ok) {
                throw new Error("Erro ao avaliar resposta com a IA.");
            }

            return await response.json();
        }

        /* XP E NÍVEL */
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

        /* PRÓXIMO DESAFIO */
        function proximoDesafio() {
            desafioAtualIndex++;

            if (desafioAtualIndex >= desafios.length) {
                window.location.href = "dashboard.html";
                return;
            }

            carregarDesafio();
        }