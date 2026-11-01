-- Ponte que Partiu: registro do jogador da Fase 2 (criação, Delta, travessia).
-- A tabela continua a mesma da 0001: `data` agora guarda o PlayerRecord inteiro das regras
-- (packages/shared/src/game/types.ts, version 2): aparência, estágio, margem, instituição, classe,
-- guia, nível, XP, missões, tutorial, story_flags, moedas etc.
-- O servidor migra na leitura as linhas antigas (Fase 1) e grava no formato novo
-- (packages/server/src/persistence/store.ts, migrateRow), então nada precisa ser convertido aqui.
--
-- Esta migração só acrescenta colunas geradas para consulta (painéis, IA de facção, contagens por
-- margem) e um índice por estágio e margem. Não foi testada contra um Supabase de verdade (não há
-- conta ainda; ver PENDENTE.md).

alter table public.players
  add column if not exists record_version int generated always as (coalesce((data->>'version')::int, 1)) stored,
  add column if not exists stage text generated always as (data->>'stage') stored,
  add column if not exists side text generated always as (data->>'side') stored,
  add column if not exists level int generated always as (coalesce((data->>'level')::int, 1)) stored,
  add column if not exists criado boolean generated always as (coalesce((data->>'criado')::boolean, false)) stored;

create index if not exists players_stage_side_idx on public.players (stage, side);
