/**
 * Fase 4: a cidade no servidor. Um estado só por processo (CidadeState de shared/game/city.ts: o
 * mercado da feira e do app, o câmbio da ponte e os medidores), guardado no Store com a chave
 * 'cidade' (FileStore: .data/world.json; Supabase: tabela world_state).
 *
 * - As salas (GameServerCore, uma por mapa e uma por casa) se registram aqui: as operações de
 *   mercado e câmbio de qualquer sala mexem no mesmo estado.
 * - tick(now): tickCidade com os registros de quem está nas salas (anúncios vencidos, virada do
 *   ciclo, aluguel, lista de espera); quem estava fora acerta ao entrar (sincronizarComCidade).
 *   O app.ts chama a cada CITY_TICK_MS; a duração do ciclo vem de PQP_CICLO_CIDADE_MIN (padrão 10).
 * - deliverPending(): o que o mercado deve a quem está online (venda na feira, no app, item vencido)
 *   entra na hora.
 * - logEvent: o log de economia (event_log), no Store e nos últimos EVENT_LOG_MEMORY na memória.
 * - findRecord(id): registro de um jogador (online em alguma sala, a última casa vista ou o Store),
 *   para visitar casas.
 * O relógio é injetável (testes); o padrão é Date.now. As regras recebem `now` daqui.
 */
import { cicloCidadeMin, migrarCidade, novaCidade, tickCidade, type CidadeState, type TickCidadeResult } from '@pqp/shared/game/city';
import type { PrecoCtx } from '@pqp/shared/game/shop';
import type { PlayerRecord } from '@pqp/shared/game/types';
import { CITY_CYCLE_MIN_DEFAULT, EVENT_LOG_MEMORY } from './config';
import type { EconomyLogEvent, Store } from './persistence/store';

/** O que a cidade pede de cada sala (GameServerCore implementa). */
export interface CityCore {
  readonly mapId: string;
  /** registros dos personagens da sala (já com o pull da entidade), vivos: tickCidade mexe neles */
  cityRecords(): PlayerRecord[];
  /** depois do tick da cidade: entidade, perfil, carteira e avisos de quem mudou */
  afterCityTick(r: TickCidadeResult): void;
  /** entrega as pendências do mercado de quem está na sala */
  receivePendingAll(): void;
  /** registro vivo de um jogador desta sala */
  liveRecordOf(playerId: string): PlayerRecord | undefined;
  /** a casa de alguém mudou (decoração, visitas): a sala da casa avisa quem está dentro */
  houseChanged(owner: PlayerRecord): void;
}

export interface CityServiceOptions {
  store?: Store;
  /** relógio em ms (padrão Date.now) */
  now?: () => number;
  /** duração do ciclo em minutos (padrão PQP_CICLO_CIDADE_MIN ou CITY_CYCLE_MIN_DEFAULT) */
  cicloMin?: number;
  log?: (m: string) => void;
}

export const CITY_KEY = 'cidade';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Ciclo da cidade do servidor: PQP_CICLO_CIDADE_MIN ou 10 minutos. */
export function serverCycleMin(env: NodeJS.ProcessEnv = process.env): number {
  return cicloCidadeMin(env['PQP_CICLO_CIDADE_MIN'] ?? CITY_CYCLE_MIN_DEFAULT);
}

export class CityService {
  state: CidadeState;
  readonly cicloMin: number;
  readonly events: EconomyLogEvent[] = [];
  private readonly store?: Store;
  private readonly clock: () => number;
  private readonly log: (m: string) => void;
  private readonly cores = new Set<CityCore>();
  /** última versão conhecida das casas (quem entrou numa casa, quem decorou) */
  private readonly houses = new Map<string, PlayerRecord>();
  /** passes de visita: quem foi liberado pela sala de origem para entrar na casa (visitante -> dono) */
  private readonly passes = new Map<string, string>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(opts: CityServiceOptions = {}) {
    if (opts.store) this.store = opts.store;
    this.clock = opts.now ?? (() => Date.now());
    this.log = opts.log ?? ((m) => console.log(m));
    this.cicloMin = opts.cicloMin ?? serverCycleMin();
    this.state = novaCidade(this.clock(), this.cicloMin);
  }

  now(): number {
    return this.clock();
  }

  /** Lê a cidade salva no Store (sem nada, fica a nova). */
  async load(): Promise<void> {
    if (!this.store?.loadWorld) return;
    try {
      const raw = await this.store.loadWorld(CITY_KEY);
      if (raw !== undefined) this.state = migrarCidade(raw, this.now(), this.cicloMin);
    } catch (err) {
      this.log(`[cidade] não consegui ler a cidade: ${String(err)}`);
    }
  }

  register(core: CityCore): void {
    this.cores.add(core);
  }

  unregister(core: CityCore): void {
    this.cores.delete(core);
  }

  /** Grava a cidade (o Store faz o debounce). */
  save(): void {
    if (!this.store?.saveWorld) return;
    this.store.saveWorld(CITY_KEY, clone(this.state)).catch((err) => this.log(`[cidade] falha ao salvar: ${String(err)}`));
  }

  /** Evento no log de economia. */
  logEvent(tipo: string, jogador?: string, dados?: Record<string, unknown>, mapa?: string): void {
    const ev: EconomyLogEvent = { at: this.now(), tipo, ...(jogador ? { jogador } : {}), ...(mapa ? { mapa } : {}), ...(dados ? { dados } : {}) };
    this.events.push(ev);
    if (this.events.length > EVENT_LOG_MEMORY) this.events.splice(0, this.events.length - EVENT_LOG_MEMORY);
    this.store?.logEvents?.([ev]).catch((err) => this.log(`[cidade] falha no log: ${String(err)}`));
  }

  /** Preço dinâmico pelos medidores da cidade. */
  precoCtx(): PrecoCtx {
    const m = this.state.medidores;
    return { ...(m.precoDeVidaDir !== undefined ? { precoDeVida: m.precoDeVidaDir } : {}), ...(m.apagaoDir ? { apagao: true } : {}), ...(m.chovendo ? { chovendo: true } : {}) };
  }

  /** Tick da cidade com os registros de todas as salas. */
  tick(now: number = this.now()): TickCidadeResult {
    const recs: PlayerRecord[] = [];
    const seen = new Set<string>();
    for (const c of this.cores) {
      for (const r of c.cityRecords()) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        recs.push(r);
      }
    }
    const res = tickCidade(this.state, now, recs);
    for (const c of this.cores) c.afterCityTick(res);
    if (res.ciclosNovos > 0) {
      this.logEvent('ciclo_cidade', undefined, { ciclo: this.state.ciclo, novos: res.ciclosNovos, anunciosVencidos: res.anunciosVencidos });
    }
    for (const [id, avisos] of Object.entries(res.porJogador)) this.logEvent('ciclo_jogador', id, { ciclo: this.state.ciclo, avisos });
    if (res.ciclosNovos > 0 || res.anunciosVencidos > 0) {
      this.deliverPending();
      this.save();
    }
    return res;
  }

  /** Liga o tick num intervalo (servidor). */
  start(everyMs: number): void {
    this.stop();
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch (err) {
        this.log(`[cidade] tick falhou: ${err instanceof Error ? err.stack : String(err)}`);
      }
    }, everyMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Entrega as pendências do mercado em todas as salas. */
  deliverPending(): void {
    for (const c of this.cores) c.receivePendingAll();
  }

  /** Registro de um jogador: numa sala agora, a última casa vista, ou do Store. */
  async findRecord(playerId: string): Promise<PlayerRecord | undefined> {
    for (const c of this.cores) {
      const r = c.liveRecordOf(playerId);
      if (r) return clone(r);
    }
    const h = this.houses.get(playerId);
    if (h) return clone(h);
    try {
      const row = await this.store?.findPlayerById?.(playerId);
      return row?.data;
    } catch (err) {
      this.log(`[cidade] busca do jogador falhou: ${String(err)}`);
      return undefined;
    }
  }

  /** Guarda a versão da casa do dono (quem vai entrar nela; a sala nova lê daqui). */
  rememberHouse(owner: PlayerRecord): void {
    this.houses.set(owner.id, clone(owner));
  }

  /** A casa do dono mudou: guarda e avisa as salas (a sala da casa repassa a quem está dentro). */
  houseChanged(owner: PlayerRecord): void {
    this.rememberHouse(owner);
    for (const c of this.cores) c.houseChanged(owner);
  }

  /** A sala de origem liberou a visita (com o grupo conferido lá). */
  grantPass(visitorId: string, ownerId: string): void {
    this.passes.set(visitorId, ownerId);
  }

  /** O visitante tem passe para esta casa? (o passe vale uma vez) */
  takePass(visitorId: string, ownerId: string): boolean {
    if (this.passes.get(visitorId) !== ownerId) return false;
    this.passes.delete(visitorId);
    return true;
  }

  async flush(): Promise<void> {
    this.save();
    await this.store?.flush();
  }
}
