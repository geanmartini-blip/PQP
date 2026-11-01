-- Ponte que Partiu: IA de facção, pontos de controle e influência (Fase 5).
--
-- O estado vivo fica num JSON só, como a cidade: world_state chave 'faccao' (EstadoFaccao de
-- packages/shared/src/game/influence.ts). O worker do servidor roda tickFaccao(estado, now, rng)
-- a cada ciclo de produção (60 min, faction_ai.json cicloProducaoMin; PQP_TICK_FACCAO_MIN muda) e
-- espelha o resultado nestas tabelas para painéis, histórico e o Realtime dos avisos do mapa.
-- Não foi testado contra um Supabase de verdade (não há conta ainda; ver PENDENTE.md).

-- ---------------------------------------------------------------------------
-- líderes de IA (npc_leader): quem comanda cada margem

create table if not exists public.npc_leader (
  id text primary key,                 -- id de faction_ai.json personagens
  name text not null,
  side text not null check (side in ('esquerda', 'direita')),
  perfil text not null,
  comanda boolean not null default false,
  cargo text null,
  updated_at timestamptz not null default now()
);
alter table public.npc_leader enable row level security;
drop policy if exists npc_leader_leitura on public.npc_leader;
create policy npc_leader_leitura on public.npc_leader for select using (true);

insert into public.npc_leader (id, name, side, perfil, comanda, cargo) values
  ('lazzaro_prati', 'Lazzaro Prati', 'esquerda', 'agressivo', true, 'lideranca'),
  ('rolf_halvorsen', 'Rolf Halvorsen', 'direita', 'defensivo', true, 'lideranca')
on conflict (id) do update set comanda = excluded.comanda, cargo = excluded.cargo, updated_at = now();

-- ---------------------------------------------------------------------------
-- medidores por região

create table if not exists public.region_meters (
  region_id text primary key,
  energia numeric not null default 50,
  poluicao numeric not null default 0,
  opiniao numeric not null default 0,
  preco_de_vida numeric not null default 100,
  influencia_esquerda numeric not null default 0,
  influencia_direita numeric not null default 0,
  ciclo int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.region_meters enable row level security;
drop policy if exists region_meters_leitura on public.region_meters;
create policy region_meters_leitura on public.region_meters for select using (true);

-- ---------------------------------------------------------------------------
-- pontos de controle

create table if not exists public.control_point (
  id text primary key,                 -- id de structures.json instancias
  region_id text not null,
  dono text not null default 'neutra' check (dono in ('esquerda', 'direita', 'neutra')),
  influencia_esquerda numeric not null default 0 check (influencia_esquerda between 0 and 100),
  influencia_direita numeric not null default 0 check (influencia_direita between 0 and 100),
  estoque numeric not null default 0,
  produzido_no_ciclo numeric not null default 0,
  saqueado_no_ciclo numeric not null default 0,
  -- saque máximo de 20% do que o ponto produziu no ciclo (structures.json regras.saqueMaxPct)
  constraint control_point_saque_max check (saqueado_no_ciclo <= produzido_no_ciclo * 0.2 + 0.0001),
  constraint control_point_influencia_soma check (influencia_esquerda + influencia_direita <= 100.0001),
  updated_at timestamptz not null default now()
);
alter table public.control_point enable row level security;
drop policy if exists control_point_leitura on public.control_point;
create policy control_point_leitura on public.control_point for select using (true);

-- ---------------------------------------------------------------------------
-- log de influência (cada ação de jogador ou da IA que somou)

create table if not exists public.influence_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  fonte text not null check (fonte in ('matar', 'missao', 'plantao', 'comercio', 'ia')),
  side text not null check (side in ('esquerda', 'direita')),
  region_id text not null,
  control_point_id text null,
  player_id uuid null,
  qtd numeric not null default 1,
  somado numeric not null default 0
);
create index if not exists influence_log_region_at_idx on public.influence_log (region_id, at desc);
create index if not exists influence_log_player_at_idx on public.influence_log (player_id, at desc);
alter table public.influence_log enable row level security;

-- ---------------------------------------------------------------------------
-- avisos do mapa (world_event): ações da IA, troca de dono, apagão, saque

create table if not exists public.world_event (
  id text primary key,                 -- WorldEvent.id ('we_<ciclo>_<seq>')
  ciclo int not null,
  at timestamptz not null default now(),
  tipo text not null check (tipo in ('acao_ia', 'troca_de_dono', 'apagao', 'saque')),
  side text null,
  leader_id text null references public.npc_leader (id),
  acao text null,
  region_id text null,
  control_point_id text null,
  texto text not null,
  sugestao boolean not null default true
);
create index if not exists world_event_at_idx on public.world_event (at desc);
alter table public.world_event enable row level security;
drop policy if exists world_event_leitura on public.world_event;
create policy world_event_leitura on public.world_event for select using (true);

-- avisos do mapa pelo Realtime (o resto do jogo vai pelo Colyseus)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.world_event;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- espelho: copia world_state 'faccao' para as tabelas acima (o worker chama depois de salvar)

create or replace function public.espelhar_faccao() returns void
language plpgsql security definer set search_path = public as $$
declare
  st jsonb;
begin
  select data into st from public.world_state where key = 'faccao';
  if st is null then return; end if;

  insert into public.region_meters (region_id, energia, poluicao, opiniao, preco_de_vida, influencia_esquerda, influencia_direita, ciclo, updated_at)
  select r.key, (r.value->>'energia')::numeric, (r.value->>'poluicao')::numeric, (r.value->>'opiniao')::numeric,
         (r.value->>'precoDeVida')::numeric, (r.value->'influencia'->>'esquerda')::numeric,
         (r.value->'influencia'->>'direita')::numeric, coalesce((st->>'ciclo')::int, 0), now()
  from jsonb_each(st->'regioes') r
  on conflict (region_id) do update set energia = excluded.energia, poluicao = excluded.poluicao, opiniao = excluded.opiniao,
    preco_de_vida = excluded.preco_de_vida, influencia_esquerda = excluded.influencia_esquerda,
    influencia_direita = excluded.influencia_direita, ciclo = excluded.ciclo, updated_at = now();

  insert into public.control_point (id, region_id, dono, influencia_esquerda, influencia_direita, estoque, produzido_no_ciclo, saqueado_no_ciclo, updated_at)
  select p.key, p.value->>'regiao', p.value->>'dono', (p.value->'influencia'->>'esquerda')::numeric,
         (p.value->'influencia'->>'direita')::numeric, (p.value->>'estoque')::numeric,
         (p.value->>'produzidoNoCiclo')::numeric, (p.value->>'saqueadoNoCiclo')::numeric, now()
  from jsonb_each(st->'pontos') p
  on conflict (id) do update set dono = excluded.dono, influencia_esquerda = excluded.influencia_esquerda,
    influencia_direita = excluded.influencia_direita, estoque = excluded.estoque,
    produzido_no_ciclo = excluded.produzido_no_ciclo, saqueado_no_ciclo = excluded.saqueado_no_ciclo, updated_at = now();

  insert into public.world_event (id, ciclo, at, tipo, side, leader_id, acao, region_id, control_point_id, texto, sugestao)
  select ev->>'id', (ev->>'ciclo')::int, to_timestamp(((ev->>'em')::numeric) / 1000.0), ev->>'tipo', ev->>'lado',
         ev->>'lider', ev->>'acao', ev->>'regiao', ev->>'ponto', ev->>'texto', coalesce((ev->>'sugestao')::boolean, true)
  from jsonb_array_elements(coalesce(st->'eventos', '[]'::jsonb)) ev
  where (ev->>'lider') is null or exists (select 1 from public.npc_leader l where l.id = ev->>'lider')
  on conflict (id) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- pg_cron: tick de facção a cada 60 min.
-- A regra (tickFaccao) é TypeScript e roda no worker do servidor (Node). No Supabase, o pg_cron chama
-- uma Edge Function que roda o mesmo código. Depende da conta e da URL do projeto (PENDENTE.md), então
-- fica comentado:
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule(
--   'pqp_tick_faccao',
--   '0 * * * *',
--   $cron$
--     select net.http_post(
--       url := 'https://<projeto>.supabase.co/functions/v1/tick-faccao',
--       headers := jsonb_build_object('Authorization', 'Bearer <service_role>', 'Content-Type', 'application/json'),
--       body := '{}'::jsonb
--     );
--     select public.espelhar_faccao();
--   $cron$
-- );
--
-- Limpeza dos avisos antigos (não depende de conta, mas precisa do pg_cron ligado):
-- select cron.schedule('pqp_limpa_world_event', '30 4 * * *',
--   $cron$ delete from public.world_event where at < now() - interval '14 days' $cron$);
