/**
 * Fase 5: a IA de facção no servidor. Um EstadoFaccao por processo (game/influence.ts), guardado no
 * Store com a chave 'faccao' (FileStore: .data/world.json; Supabase: world_state, espelhado nas
 * tabelas pela função public.espelhar_faccao(), supabase/migrations/0004_faccao.sql).
 *
 * - tick(now): tickFaccao com o rng do ciclo (sementeDoTick); os avisos novos vão para todas as salas
 *   (GAME_MSG.avisoMapa), os medidores para a cidade (aplicarFaccaoNaCidade) e o regionState para o
 *   combate de cada sala (regionStateParaCombate). O app.ts chama a cada FACTION_CHECK_MS.
 * - somar(ev): influência dos jogadores (matar, missão, plantão, comércio), com os mesmos avisos.
 * - info(now): o painel dos pontos (S2C_FaccaoInfo).
 * A duração do tick vem de PQP_TICK_FACCAO_MIN; sem ela, FACTION_TICK_MIN_DEV (5) fora de produção e
 * a do faction_ai.json (60) em produção. O relógio é o da cidade (injetável nos testes).
 */
import { createRng } from '@pqp/shared/sim';
import {
  aplicarFaccaoNaCidade,
  emApagao,
  liderDe,
  LIMIAR_DONO,
  migrarEstadoFaccao,
  nomeDaRegiao,
  nomeDoPonto,
  novoEstadoFaccao,
  regionStateParaCombate,
  saqueDisponivel,
  sementeDoTick,
  somarInfluencia,
  tickFaccao,
  tickFaccaoMin,
  type EstadoFaccao,
  type EventoInfluencia,
  type TickFaccaoResult,
  type WorldEvent,
} from '@pqp/shared/game/index';
import type { S2C_AvisoMapa, S2C_FaccaoInfo } from '@pqp/shared/net';
import { DEFAULT_WORLD_SEED, FACTION_TICK_MIN_DEV } from './config';
import type { Store } from './persistence/store';

export const FACTION_KEY = 'faccao';

/** Duração do tick de facção do servidor (minutos). */
export function serverFactionTickMin(env: NodeJS.ProcessEnv = process.env): number {
  const v = env['PQP_TICK_FACCAO_MIN'];
  if (v !== undefined && v !== '') return tickFaccaoMin(v);
  return env['NODE_ENV'] === 'production' ? tickFaccaoMin() : FACTION_TICK_MIN_DEV;
}

/** WorldEvent -> aviso do mapa. */
export function avisoDoEvento(ev: WorldEvent): S2C_AvisoMapa {
  return {
    id: ev.id,
    tipo: ev.tipo,
    texto: ev.texto,
    ...(ev.lado ? { lado: ev.lado } : {}),
    ...(ev.lider ? { lider: ev.lider } : {}),
    ...(ev.regiao ? { regiao: ev.regiao } : {}),
    ...(ev.ponto ? { ponto: ev.ponto } : {}),
  };
}

export interface FactionServiceOptions {
  store?: Store;
  now: () => number;
  log: (m: string) => void;
  tickMin?: number;
  seed?: number;
  /** avisos novos (a cidade repassa às salas) */
  onEvents: (evs: WorldEvent[], estado: EstadoFaccao) => void;
  /** os medidores mudaram (a cidade copia e grava) */
  onMeters: (estado: EstadoFaccao) => void;
}

export class FactionService {
  state: EstadoFaccao;
  readonly tickMin: number;
  private readonly o: FactionServiceOptions;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(o: FactionServiceOptions) {
    this.o = o;
    this.tickMin = o.tickMin ?? serverFactionTickMin();
    this.state = novoEstadoFaccao(o.now(), this.tickMin);
  }

  async load(): Promise<void> {
    if (!this.o.store?.loadWorld) return;
    try {
      const raw = await this.o.store.loadWorld(FACTION_KEY);
      if (raw !== undefined) this.state = migrarEstadoFaccao(raw, this.o.now(), this.tickMin);
    } catch (err) {
      this.o.log(`[faccao] não consegui ler o estado: ${String(err)}`);
    }
    this.o.onMeters(this.state);
  }

  save(): void {
    if (!this.o.store?.saveWorld) return;
    this.o.store.saveWorld(FACTION_KEY, JSON.parse(JSON.stringify(this.state))).catch((err) => this.o.log(`[faccao] falha ao salvar: ${String(err)}`));
  }

  /** O que o combate lê (World.regionState). */
  regionState(): ReturnType<typeof regionStateParaCombate> {
    return regionStateParaCombate(this.state);
  }

  /** Roda os ticks vencidos até `now`. */
  tick(now: number = this.o.now()): TickFaccaoResult {
    const rng = createRng(sementeDoTick(this.o.seed ?? DEFAULT_WORLD_SEED, this.state.ciclo));
    const res = tickFaccao(this.state, now, rng);
    this.state = res.estado;
    if (res.ticks > 0) {
      this.o.onMeters(this.state);
      this.save();
    }
    if (res.eventos.length > 0) this.o.onEvents(res.eventos, this.state);
    return res;
  }

  /** Influência de um evento de jogo. Devolve os avisos novos (já espalhados). */
  somar(ev: EventoInfluencia): WorldEvent[] {
    const r = somarInfluencia({ ...this.state, agora: Math.max(this.state.agora, this.o.now()) }, ev);
    this.state = r.estado;
    if (Object.keys(r.somado).length > 0 || r.eventos.length > 0) this.save();
    if (r.eventos.length > 0) {
      this.o.onMeters(this.state);
      this.o.onEvents(r.eventos, this.state);
    }
    return r.eventos;
  }

  /** Painel dos pontos de controle (S2C_FaccaoInfo). */
  info(now: number = this.o.now()): S2C_FaccaoInfo {
    const e = this.state;
    return {
      ciclo: e.ciclo,
      proximoTickEm: e.proximoTickEm,
      agora: now,
      lideres: (['esquerda', 'direita'] as const).map((lado) => {
        const l = liderDe(lado);
        return { lado, id: l.id, nome: l.name };
      }),
      regioes: Object.entries(e.regioes).map(([id, r]) => ({ id, nome: nomeDaRegiao(id), energia: r.energia, poluicao: r.poluicao, apagao: emApagao(r), influencia: { ...r.influencia } })),
      pontos: Object.values(e.pontos).map((p) => ({ id: p.id, nome: nomeDoPonto(p.id), regiao: p.regiao, dono: p.dono, influencia: { ...p.influencia }, saqueDisponivel: saqueDisponivel(e, p.id) })),
      eventos: e.eventos.slice(-20).map(avisoDoEvento),
      limiar: LIMIAR_DONO,
    };
  }

  start(everyMs: number): void {
    this.stop();
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch (err) {
        this.o.log(`[faccao] tick falhou: ${err instanceof Error ? err.stack : String(err)}`);
      }
    }, everyMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}

/** Mexe só nos medidores da cidade (a cidade grava). */
export const copiarMedidores = aplicarFaccaoNaCidade;
