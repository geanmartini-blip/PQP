-- Ponte que Partiu: economia, moradia e o ciclo da cidade (Fase 4).
--
-- O servidor (packages/server/src/persistence/store.ts, SupabaseStore) grava:
-- - o registro do jogador inteiro em players.data (como na 0002): carteira (semente, credito,
--   score, economia.divida, economia.cambioCiclo), inventário com os móveis guardados
--   ('movel:<id>') e a casa (home: tipo, móveis, visitas, convidados, espera, atraso);
-- - o estado global da cidade em world_state, chave 'cidade' (CidadeState de
--   packages/shared/src/game/city.ts: ciclo, mercado da feira e do app, câmbio, medidores);
-- - o log de economia em event_log (loja_compra, loja_venda, feira_anuncio, feira_compra,
--   app_anuncio, app_compra, cambio_troca, movel_compra, aluguel_inicio, divida_paga,
--   mercado_recebido, casa_entrada, ciclo_cidade, ciclo_jogador...).
-- As views abaixo só leem esse JSON para painéis e para a IA de facção.
-- Não foi testado contra um Supabase de verdade (não há conta ainda; ver PENDENTE.md).

-- ---------------------------------------------------------------------------
-- estado global (a cidade)

create table if not exists public.world_state (
  key text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.world_state enable row level security;

-- ---------------------------------------------------------------------------
-- log de economia

create table if not exists public.event_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  tipo text not null,
  player_id uuid null,
  map_id text null,
  data jsonb not null default '{}'::jsonb
);
create index if not exists event_log_tipo_at_idx on public.event_log (tipo, at desc);
create index if not exists event_log_player_at_idx on public.event_log (player_id, at desc);
alter table public.event_log enable row level security;

-- ---------------------------------------------------------------------------
-- carteira: colunas geradas em players para consulta

alter table public.players
  add column if not exists semente int generated always as (coalesce((data->>'semente')::int, 0)) stored,
  add column if not exists credito int generated always as (coalesce((data->>'credito')::int, 0)) stored,
  add column if not exists score int generated always as (coalesce((data->>'score')::int, 0)) stored,
  add column if not exists divida int generated always as (coalesce((data->'economia'->>'divida')::int, 0)) stored,
  add column if not exists home_tipo text generated always as (data->'home'->>'tipo') stored;

create index if not exists players_home_tipo_idx on public.players (home_tipo);

create or replace view public.player_wallet as
select id, name, side, semente, credito, score, divida,
       coalesce((data->'economia'->>'cambioCiclo')::int, 0) as cambio_ciclo,
       coalesce((data->'economia'->>'ciclo')::int, 0) as ciclo_visto
from public.players
where criado;

-- ---------------------------------------------------------------------------
-- moradia

create or replace view public.player_home as
select id, name, side,
       data->'home'->>'tipo' as tipo,
       data->'home'->>'visitas' as visitas,
       jsonb_array_length(coalesce(data->'home'->'moveis', '[]'::jsonb)) as moveis,
       (data->'home'->'espera'->>'ciclosRestantes')::int as espera_ciclos,
       coalesce((data->'home'->>'atraso')::int, 0) as atraso,
       (data->'home'->>'aluguelUltimo')::int as aluguel
from public.players
where data->'home' is not null and jsonb_typeof(data->'home') = 'object';

-- ---------------------------------------------------------------------------
-- mercado (feira e app) e câmbio, lidos da cidade

create or replace view public.market_listing as
select a->>'id' as id,
       a->>'mercado' as mercado,
       (a->>'vendedor')::uuid as vendedor,
       a->>'vendedorNome' as vendedor_nome,
       a->'bem' as bem,
       (a->>'preco')::int as preco,
       a->>'moeda' as moeda,
       a->'trocaPor' as troca_por,
       (a->>'tabelado')::boolean as tabelado,
       to_timestamp(((a->>'expiraEm')::bigint) / 1000.0) as expira_em
from public.world_state w,
     jsonb_array_elements(coalesce(w.data->'mercado'->'anuncios', '[]'::jsonb)) as a
where w.key = 'cidade';

create or replace view public.exchange_state as
select (data->>'ciclo')::int as ciclo,
       to_timestamp(((data->>'cicloIniciouEm')::bigint) / 1000.0) as ciclo_iniciou_em,
       ((data->>'cicloMs')::bigint) / 60000.0 as ciclo_min,
       (data->'cambio'->>'volumeLiquidoS')::numeric as volume_liquido_s,
       (data->'cambio'->>'volumeTotalS')::numeric as volume_total_s,
       data->'medidores' as medidores
from public.world_state
where key = 'cidade';

-- ---------------------------------------------------------------------------
-- ciclo da cidade pelo pg_cron
--
-- No piloto, quem vira o ciclo é o servidor de jogo (CityService.tick a cada 5 s, com a duração de
-- PQP_CICLO_CIDADE_MIN; padrão 10 minutos): ele aplica aluguel, lista de espera e anúncios vencidos
-- nos registros online e acerta quem entra depois. A função abaixo só marca no banco que o ciclo
-- deveria ter virado (para painéis e para quando o servidor estiver fora); o servidor alinha pelo
-- próprio relógio ao ler a cidade.

create or replace function public.pqp_virar_ciclo_cidade() returns void
language plpgsql security definer as $$
declare
  c jsonb;
  inicio bigint;
  dur bigint;
  agora bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  select data into c from public.world_state where key = 'cidade' for update;
  if c is null then return; end if;
  inicio := coalesce((c->>'cicloIniciouEm')::bigint, agora);
  dur := greatest(1, coalesce((c->>'cicloMs')::bigint, 600000));
  while agora >= inicio + dur loop
    inicio := inicio + dur;
    c := jsonb_set(c, '{ciclo}', to_jsonb(coalesce((c->>'ciclo')::int, 0) + 1));
    -- o preço dinâmico de NPC e o volume do câmbio zeram na virada (city.ts tickCidade)
    c := jsonb_set(c, '{mercado,npc}', '{}'::jsonb, true);
    c := jsonb_set(c, '{cambio}', '{"volumeLiquidoS":0,"volumeTotalS":0}'::jsonb, true);
  end loop;
  c := jsonb_set(c, '{cicloIniciouEm}', to_jsonb(inicio));
  update public.world_state set data = c, updated_at = now() where key = 'cidade';
  insert into public.event_log (tipo, data) values ('ciclo_cidade_cron', jsonb_build_object('ciclo', c->'ciclo'));
end;
$$;

-- Depende do projeto Supabase com a extensão pg_cron ligada (ver PENDENTE.md). Descomente lá:
-- create extension if not exists pg_cron;
-- select cron.schedule('pqp_ciclo_cidade', '*/10 * * * *', $$select public.pqp_virar_ciclo_cidade()$$);
