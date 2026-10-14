# Lotes de desafios (rascunhos)

Desafios escritos fora do painel entram aqui, um arquivo JSON por lote, e são importados no
banco como **rascunho**. Rascunhos não aparecem para ninguém: a revisão e a publicação
acontecem no painel admin, aba **Conteúdo**.

## Como importar

```
npm run content:import -- backend/content-drafts/lote-01-comunicacao.json
```

- O destino é o banco de `DATABASE_URL` (com a connection string do Neon, é a produção). Sem
  `DATABASE_URL`, vai para o PGlite local. O script mostra o banco de destino antes de gravar.
- O lote inteiro é validado antes: se qualquer desafio tiver erro, nada é gravado.
- Desafios que já existem (mesmo título na mesma competência) são pulados, então rodar de novo
  não duplica.

Depois de importar: no painel, filtre por **Nunca publicados**, revise cada desafio na prévia,
ajuste o que quiser e publique.

## Formato

```json
{
  "lote": "01 - Comunicação",
  "desafios": [
    {
      "tipo": "fechado",
      "categoria": "Comunicação",
      "dificuldade": "basico",
      "habilidades": ["clareza-objetividade", "transparencia"],
      "titulo": "...",
      "pergunta": "O cenário",
      "descricao": "Orientação curta (opcional)",
      "dica": "Princípio por trás da resposta ideal (opcional; nos fechados, só aparece depois)",
      "respostas": [
        { "texto": "...", "xp": 100, "feedback": "..." },
        { "texto": "...", "xp": 40, "feedback": "..." },
        { "texto": "...", "xp": 5, "feedback": "..." }
      ]
    }
  ]
}
```

As regras são as mesmas do painel (`backend/src/services/content.js`): competência e habilidades
da taxonomia (`backend/src/content/competencies.js`), de 1 a 3 habilidades, dificuldade
`basico`, `intermediario` ou `avancado`, e nos fechados exatamente 3 alternativas de 5, 40 e
100 XP. Os testes (`backend/test/draft-import.test.js`) validam todos os lotes desta pasta.

## Régua de dificuldade

- **Básico**: situação clara, um interlocutor, uma resposta claramente melhor.
- **Intermediário**: interesses em conflito, duas habilidades em jogo, um trade-off a explicar.
- **Avançado**: ambiguidade, várias partes, pressão e nenhuma resposta óbvia (de preferência aberto).
