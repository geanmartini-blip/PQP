-- Ponte que Partiu: tabela dos jogadores (Fase 1).
-- Usada pelo SupabaseStore (packages/server/src/persistence/store.ts) quando SUPABASE_URL e
-- SUPABASE_SERVICE_KEY existem. Sem elas, o servidor grava em .data/players.json (FileStore).
--
-- O token é o login de convidado: gerado no aparelho (ou pelo servidor) até o Supabase Auth entrar.
-- data guarda o subconjunto do modelo `player` (PlayerData em store.ts): archetypeId, level, xp,
-- semente, credito, inventory, doctrine, auto, appearance, palette...
-- Não foi testado contra um Supabase de verdade (não há conta ainda; ver PENDENTE.md).

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  name text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- o servidor usa a service key (ignora RLS); ninguém mais lê ou grava direto
alter table public.players enable row level security;
