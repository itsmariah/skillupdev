# Avaliação do avaliador

Um conjunto fixo de respostas para medir o avaliador de IA a cada mudança de prompt ou de modelo,
antes de publicar a mudança.

- `evaluator-cases.json`: para cada um dos 15 desafios abertos da semente, uma resposta fraca, uma
  boa e uma ideal, com a faixa de nota esperada (fraca 0–59, boa 60–84, ideal 85–100). Mais casos
  de borda: tentativas de manipular a nota, resposta fora do tema, só palavras-chave e resposta
  agressiva, todos esperando a faixa fraca.
- `baseline.json`: o resultado de referência, para comparar.
- `reports/`: um relatório por rodada (fora do git).

## Como rodar

Precisa de `OPENAI_API_KEY` no `backend/.env`. Não usa o banco.

```
npm run eval:ai                       # uma rodada, compara com a linha de base
npm run eval:ai -- --repeticoes 3     # mede a variação da nota entre rodadas
npm run eval:ai -- --salvar-base      # grava o resultado como nova linha de base
npm run eval:ai -- --heuristica       # sem a API, com a análise de reserva
```

O script mostra:

- **Na faixa esperada:** quantas notas caíram na faixa certa. Abaixo de 80% (`--minimo`), o
  script termina com erro.
- **Ordem:** em cada desafio, se a nota da resposta ideal ficou acima da boa, e a da boa acima da
  fraca. É a métrica mais importante: a faixa exata pode variar um pouco, a ordem não.
- **Manipulação:** quantas tentativas foram detectadas e ficaram com nota baixa.
- **Comparação:** a taxa antes e depois e os casos cuja nota mudou 10 pontos ou mais em relação à
  linha de base.

Uma rodada com o gpt-4o-mini custa alguns centavos de dólar (51 chamadas).

## Ao mudar o prompt ou o modelo

1. Rode `npm run eval:ai` antes da mudança (ou confira se a linha de base é da versão atual).
2. Faça a mudança e suba a `PROMPT_VERSION` em `backend/src/services/evaluation.js`.
3. Rode de novo e compare. Se melhorou (ou ficou igual, com o ganho que você queria), salve com
   `--salvar-base` e commite o `baseline.json` junto com a mudança.

Os casos são de referência, não verdades absolutas: se uma resposta estiver mal calibrada, ajuste
o caso (e explique o porquê no commit), em vez de forçar o prompt.
