-- Cenários gerados por IA (roadmap Fase 4). A IA só cria rascunhos: generation guarda como a
-- versão foi gerada (modelo, prompt, parâmetros, quem pediu) e fica nula nas versões escritas
-- por pessoas. published_by registra quem publicou cada versão; para versões geradas, publicar
-- exige confirmar a revisão, então é também quem revisou.
ALTER TABLE challenge_versions ADD COLUMN generation jsonb;
ALTER TABLE challenge_versions ADD COLUMN published_by text REFERENCES users (id) ON DELETE SET NULL;
