-- Registro de quem avaliou cada tentativa (auditoria, itens 4 e 14).
-- evaluator: 'ai' (OpenAI), 'heuristic' (fallback local) ou 'closed' (alternativa com gabarito).
-- Fica nulo nas tentativas importadas do formato antigo, em que essa informação não existia.
-- evaluation: modelo, versão do prompt, notas por critério, sinal de manipulação, latência e tokens.
ALTER TABLE challenge_attempts ADD COLUMN evaluator text;
ALTER TABLE challenge_attempts ADD COLUMN evaluation jsonb;
