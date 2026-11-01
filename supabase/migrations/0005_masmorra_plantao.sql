-- Fase 5 (servidor): plantão e masmorra.
-- O servidor guarda o plantão em world_state, chave 'plantao' (packages/server/src/duty_service.ts:
-- plantonistas no QG, plantões ativos e relatórios pendentes). As runs da masmorra vivem na memória do
-- processo (dungeon_service.ts); o que sobra delas é o event_log ('masmorra_entrada', 'masmorra_saida')
-- e os contadores do registro (masmorra:<id>, masmorra_chefe:<id>).
-- Este arquivo só espelha esse JSON em tabelas para painéis e consultas. Não foi testado contra um
-- Supabase de verdade (ver PENDENTE.md).

create table if not exists public.duty_assignment (
  id text primary key,                 -- DutyAssignment.id ('duty_<t>_<seq>')
  plantonista_id text not null,        -- player.id do dono do personagem de plantão
  levado_por text not null,            -- player.id de quem levou
  qg text not null,
  side text not null check (side in ('esquerda', 'direita')),
  destino text not null check (destino in ('masmorra', 'mapa', 'colosso', 'invasao')),
  run_id text null,
  inicio timestamptz not null,
  fim timestamptz null,
  status text not null check (status in ('ativo', 'encerrado')),
  ganho_xp numeric not null default 0,
  ganho_itens jsonb not null default '[]'::jsonb,
  ganho_semente numeric not null default 0,
  ganho_credito numeric not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists duty_assignment_plantonista_idx on public.duty_assignment (plantonista_id);
alter table public.duty_assignment enable row level security;

-- quem está de plantão no QG agora (só o que a tela do quadro precisa)
create table if not exists public.duty_roster (
  player_id text primary key,
  name text not null,
  side text not null,
  level int not null,
  class text null,
  archetype text null,
  cartas int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.duty_roster enable row level security;
drop policy if exists duty_roster_leitura on public.duty_roster;
create policy duty_roster_leitura on public.duty_roster for select using (true);

-- dungeon_run: resumo das runs a partir do event_log (entrada e saída)
create or replace view public.dungeon_run_log as
select
  e.data->>'run' as run_id,
  min(e.at) filter (where e.tipo = 'masmorra_entrada') as inicio,
  max(e.at) filter (where e.tipo = 'masmorra_saida') as fim,
  max((e.data->>'maisFundo')::int) filter (where e.tipo = 'masmorra_saida') as andar_mais_fundo,
  count(*) filter (where e.tipo = 'masmorra_saida') as saidas
from public.event_log e
where e.tipo in ('masmorra_entrada', 'masmorra_saida')
group by e.data->>'run';

-- ---------------------------------------------------------------------------
-- espelho: copia world_state 'plantao' para as tabelas acima (o worker chama depois de salvar)

create or replace function public.espelhar_plantao() returns void
language plpgsql security definer set search_path = public as $$
declare
  st jsonb;
begin
  select data into st from public.world_state where key = 'plantao';
  if st is null then return; end if;

  delete from public.duty_roster;
  insert into public.duty_roster (player_id, name, side, level, class, archetype, cartas, updated_at)
  select p.key, p.value->>'name', p.value->>'side', coalesce((p.value->>'level')::int, 1), p.value->>'class',
         p.value->>'archetype', coalesce(jsonb_array_length(p.value->'doctrine'), 0), now()
  from jsonb_each(coalesce(st->'plantonistas', '{}'::jsonb)) p
  where p.value->>'side' is not null;

  insert into public.duty_assignment (id, plantonista_id, levado_por, qg, side, destino, run_id, inicio, fim, status,
                                      ganho_xp, ganho_itens, ganho_semente, ganho_credito, updated_at)
  select a->>'id', a->>'plantonistaId', a->>'levadoPor', a->>'qg', a->>'side', a->>'destino', a->>'runId',
         to_timestamp(((a->>'inicio')::numeric) / 1000.0),
         case when a ? 'fim' then to_timestamp(((a->>'fim')::numeric) / 1000.0) end,
         a->>'status', coalesce((a->'ganhos'->>'xp')::numeric, 0), coalesce(a->'ganhos'->'itens', '[]'::jsonb),
         coalesce((a->'ganhos'->>'semente')::numeric, 0), coalesce((a->'ganhos'->>'credito')::numeric, 0), now()
  from (
    select jsonb_array_elements(coalesce(st->'ativos', '[]'::jsonb)) a
    union all
    select jsonb_array_elements(coalesce(r.value->'plantoes', '[]'::jsonb))
    from jsonb_each(coalesce(st->'relatorios', '{}'::jsonb)) r
  ) x
  on conflict (id) do update set fim = excluded.fim, status = excluded.status, ganho_xp = excluded.ganho_xp,
    ganho_itens = excluded.ganho_itens, ganho_semente = excluded.ganho_semente, ganho_credito = excluded.ganho_credito,
    updated_at = now();
end $$;
