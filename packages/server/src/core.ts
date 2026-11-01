/**
 * GameServerCore: o servidor autoritativo sem transporte. O WorldRoom (Colyseus) e os testes
 * (canal em memória) falam com ele do mesmo jeito.
 *
 * Fluxo por tick (20 por segundo):
 *  1. cada sessão consome UMA entrada da fila (o cliente prevê um tick por entrada) e os comandos
 *     novos, com compensação de atraso (rewind = min(250 ms, rtt + 100 ms + 25 ms) em ticks: o
 *     cliente desenha os outros 100 ms atrás do que recebeu, que já chegou uma ida atrasado, e o
 *     comando leva mais uma ida e espera o tick);
 *     - posição e ack andam juntos: cada entrada é um passo, nunca dois. Fila vazia (a rede travou,
 *       que no TCP é como a perda aparece): o personagem não anda neste tick, nem pelo joystick
 *       velho nem pelo caminho do toque no chão (antes ele andava de novo com a entrada velha e
 *       depois aplicava as atrasadas, contando o movimento duas vezes);
 *     - fila com mais de INPUT_TARGET_BACKLOG + 1: até INPUT_CATCHUP_PER_TICK entradas extras andam
 *       na hora, as mais velhas primeiro (drena a rajada depois da travada em poucos ticks), pelo
 *       crédito de entradas, para ninguém andar mais rápido mandando mais de 20 por segundo;
 *     - comando com afterSeq (campo opcional, ver sanitizeCmd) espera o servidor ter andado essa
 *       entrada, para a posição e o A* saírem iguais aos do cliente;
 *  2. step() da simulação;
 *  3. renascimento dos inimigos, saída de quem caiu da conexão há muito tempo, gravação;
 *  4. um snapshot por cliente: entidades no raio de interesse, 'gone', avisos, zonas, eventos e HUD.
 *
 * Entradas: aceita as PlayerInput com seq maior que a última consumida (o cliente repete as 3
 * últimas). Comandos: dedupe por id (maior id processado = cack, mais um conjunto dos recentes).
 * Campos d/n/lk/lv: vão quando a entidade é nova para o cliente ou mudou, e se repetem a cada
 * INFO_REPEAT_TICKS até o cliente confirmar o tick (C2S_Input.ackTick); 'need' responde com 'info'
 * se mesmo assim faltar.
 * Eventos do tick (say, hit, xp...) vão só no snapshot daquele tick: o transporte de verdade é
 * WebSocket/TCP, que não perde mensagem (a perda vira atraso, ver netsim.ts).
 * Queda de conexão: o personagem fica no modo automático (Doutrina) por OFFLINE_AUTO_MS e depois sai;
 * o mesmo token retoma o mesmo personagem.
 */
import { randomUUID } from 'node:crypto';
import { getData } from '@pqp/shared/data';
import { findPath, getMap } from '@pqp/shared/map';
import {
  dequantizeAxis,
  INTEREST_RADIUS,
  INTERP_DELAY_MS,
  MAX_REWIND_MS,
  PROTOCOL_VERSION,
  type C2S_Hello,
  type C2S_Input,
  type C2S_Need,
  type EntSnap,
  type S2C_Info,
  type S2C_Pong,
  type S2C_Snapshot,
  type S2C_Welcome,
} from '@pqp/shared/net';
import {
  applyCommand,
  applyInput,
  canMove,
  createWorld,
  hasStatus,
  hudSnapshot,
  isHostile,
  moveSpeedOf,
  moveVelocity,
  msToTicks,
  spawnAlly,
  spawnPlayer,
  step,
  stepMovement,
  TICK_MS,
  TICK_RATE,
  velocityToward,
  type CombatEvent,
  type Entity,
  type PlayerCommand,
  type PlayerInput,
  type Vec,
  type World,
} from '@pqp/shared/sim';
import {
  CMD_HOLD_MAX_TICKS,
  DEFAULT_ARCHETYPE,
  DEFAULT_MAP_ID,
  DEFAULT_PLAYER_NAME,
  DEFAULT_WORLD_SEED,
  EVENT_MARGIN_TILES,
  GONE_REPEAT_TICKS,
  INFO_REPEAT_TICKS,
  INPUT_CATCHUP_PER_TICK,
  INPUT_CREDIT_MAX,
  INPUT_CREDIT_PER_TICK,
  INPUT_QUEUE_MAX,
  INPUT_TARGET_BACKLOG,
  MAX_CLIENT_RTT_MS,
  MAX_CMDS_PER_MSG,
  MAX_NAME_LENGTH,
  OFFLINE_AUTO_MS,
  RECENT_CMD_IDS,
  SAVE_EVERY_MS,
} from './config';
import type { PlayerRecord, Store } from './persistence/store';
import { sanitizeDoctrine } from './doctrine_guard';
import { baseEntSnap, eventOut, eventRefs, lookOf, telegraphOut, zoneOut } from './snapshot';
import { Spawner, type SpawnerOptions } from './spawner';

export interface CoreOptions {
  mapId?: string;
  seed?: number;
  /** persistência; sem ela, o progresso fica só na memória do processo */
  store?: Store;
  /** põe bandos, elite, chefe e NPCs dos marcadores (padrão true) */
  content?: boolean;
  /** companheiro de IA para cada jogador (padrão false; PQP_COMPANHEIRO=1 no servidor) */
  companions?: boolean;
  /** arquétipo de quem entra pela primeira vez (padrão peao_brabo) */
  defaultArchetype?: string;
  /** tempo no automático depois da queda de conexão antes de sair do mapa */
  offlineAutoMs?: number;
  interestRadius?: number;
  spawner?: SpawnerOptions;
  log?: (msg: string) => void;
}

interface SentInfo {
  d: string;
  n: string;
  lv: number;
  lk: string | undefined;
  /** tick em que estes valores foram mandados pela primeira vez */
  tick: number;
}

interface Session {
  sid: string;
  token: string;
  connected: boolean;
  /** última PlayerInput.seq consumida (-1 = nenhuma) */
  lastSeq: number;
  inputQ: PlayerInput[];
  lastInputTick: number;
  /** crédito de entradas (ver INPUT_CREDIT_PER_TICK) */
  credit: number;
  /** neste tick não havia entrada: o personagem não anda pelo caminho do toque no chão */
  paused: boolean;
  cack: number;
  recent: Set<number>;
  recentOrder: number[];
  cmdQ: HeldCmd[];
  rtt: number;
  /** último tick de snapshot que o cliente disse ter recebido */
  ackTick: number;
  sent: Map<number, SentInfo>;
  gone: Map<number, number>;
}

/** Comando na fila do servidor. */
interface HeldCmd {
  c: PlayerCommand;
  /** seq da última entrada que o cliente já tinha previsto quando criou o comando (opcional) */
  afterSeq?: number;
  /** tick em que chegou */
  since: number;
}

interface Slot {
  token: string;
  rec: PlayerRecord;
  entityId: number;
  companionId?: number;
  sid?: string;
  /** tick em que a conexão caiu (personagem no automático) */
  offlineSince?: number;
  autoBefore: boolean;
  lastLevel: number;
}

// SUGESTÃO: 'need' responde no máximo 64 ids por pedido.
const MAX_NEED_IDS = 64;

const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Nome limpo (sem controle, até MAX_NAME_LENGTH) ou undefined. */
export function cleanName(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME_LENGTH);
  return s.length > 0 ? s : undefined;
}

export function normalizeToken(v: unknown): { token: string; generated: boolean } {
  if (typeof v === 'string' && TOKEN_RE.test(v)) return { token: v, generated: false };
  return { token: randomUUID(), generated: true };
}

function sanitizeInput(raw: unknown): PlayerInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isInt(r['seq']) || r['seq'] < 0 || !isNum(r['mx']) || !isNum(r['my'])) return null;
  const clamp = (v: number) => Math.max(-127, Math.min(127, Math.round(v)));
  return { seq: r['seq'], mx: clamp(r['mx']), my: clamp(r['my']) };
}

const vec = (v: unknown): Vec | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  return isNum(o['x']) && isNum(o['y']) ? { x: o['x'], y: o['y'] } : undefined;
};

function sanitizeCmd(raw: unknown): PlayerCommand | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = r['id'];
  if (!isInt(id) || id <= 0) return null;
  switch (r['c']) {
    case 'habilidade': {
      const b = r['botao'];
      if (b !== 1 && b !== 2 && b !== 3 && b !== 'especial') return null;
      const at = vec(r['at']);
      return at ? { id, c: 'habilidade', botao: b, at } : { id, c: 'habilidade', botao: b };
    }
    case 'alvo':
    case 'ir_ate':
      if (!isNum(r['x']) || !isNum(r['y'])) return null;
      return { id, c: r['c'], x: r['x'], y: r['y'] };
    case 'item':
      return { id, c: 'item' };
    case 'auto':
      return typeof r['on'] === 'boolean' ? { id, c: 'auto', on: r['on'] } : null;
    case 'interagir':
      return isInt(r['entity']) ? { id, c: 'interagir', entity: r['entity'] } : null;
    case 'trocar_arquetipo':
      return typeof r['archetypeId'] === 'string' ? { id, c: 'trocar_arquetipo', archetypeId: r['archetypeId'] } : null;
    case 'doutrina': {
      // validação fechada: carta com tipo desconhecido travava o step de todo mundo
      const cards = r['cards'];
      if (!Array.isArray(cards)) return null;
      return { id, c: 'doutrina', cards: sanitizeDoctrine(cards, 5) };
    }
    default:
      return null;
  }
}

export class GameServerCore {
  readonly world: World;
  readonly mapId: string;
  readonly spawn: Vec;
  readonly spawner?: Spawner;
  /** eventos do último tick (testes e métricas) */
  lastEvents: CombatEvent[] = [];

  private readonly store?: Store;
  private readonly companions: boolean;
  private readonly defaultArchetype: string;
  private readonly offlineTicks: number;
  private readonly interestRadius: number;
  private readonly log: (msg: string) => void;
  private readonly sessions = new Map<string, Session>();
  private readonly slots = new Map<string, Slot>(); // token -> personagem no mundo
  private readonly records = new Map<string, PlayerRecord>(); // token -> último registro conhecido
  private kicked: string[] = [];
  private prevPos = new Map<number, [number, number]>();
  private baseCache = new Map<number, EntSnap>();
  private infoCache = new Map<number, { d: string; n: string; lv: number; lk: unknown; lkJson: string | undefined }>();
  private evCache = new Map<CombatEvent, CombatEvent>();

  constructor(opts: CoreOptions = {}) {
    this.mapId = opts.mapId ?? DEFAULT_MAP_ID;
    this.world = createWorld(getMap(this.mapId), opts.seed ?? DEFAULT_WORLD_SEED);
    this.world.pathfinder = findPath;
    if (opts.store) this.store = opts.store;
    this.companions = opts.companions ?? false;
    this.defaultArchetype = opts.defaultArchetype ?? DEFAULT_ARCHETYPE;
    this.offlineTicks = msToTicks(opts.offlineAutoMs ?? OFFLINE_AUTO_MS);
    this.interestRadius = opts.interestRadius ?? INTEREST_RADIUS;
    this.log = opts.log ?? ((m) => console.log(m));
    const sp = this.world.map.markers.find((m) => m.kind === 'spawn_jogador');
    this.spawn = sp ? { x: sp.x, y: sp.y } : { x: this.world.map.width / 2, y: this.world.map.height / 2 };
    if (opts.content !== false) {
      this.spawner = new Spawner(this.world, { log: this.log, ...(opts.spawner ?? {}) });
      this.spawner.populate();
    }
  }

  // -------------------------------------------------------------------------
  // Clientes

  /**
   * Carrega (ou cria) o registro no Store e entra. É o caminho do WorldRoom. Sem token válido, o
   * servidor gera um e devolve em welcome.token.
   */
  async join(sessionId: string, hello: C2S_Hello): Promise<S2C_Welcome> {
    const { token, generated } = normalizeToken(hello?.token);
    let rec: PlayerRecord | undefined;
    if (this.store && !this.slots.has(token) && !this.records.has(token)) {
      try {
        rec = await this.store.getOrCreatePlayer(token, cleanName(hello?.name) ?? DEFAULT_PLAYER_NAME);
      } catch (err) {
        this.log(`[core] store falhou para um token; seguindo sem persistência: ${String(err)}`);
      }
    }
    const wel = this.addClient(sessionId, { ...(hello ?? {}), token }, rec);
    if (generated) wel.token = token;
    return wel;
  }

  /**
   * Entra (ou volta) com um hello. Mesmo token = mesmo personagem: se ele ainda está no mundo (no
   * automático depois da queda), volta a ser controlado; senão nasce no spawn com o progresso do
   * registro. Uma sessão antiga do mesmo token é derrubada (takeKicked).
   */
  addClient(sessionId: string, hello: C2S_Hello, rec?: PlayerRecord): S2C_Welcome {
    const { token, generated } = normalizeToken(hello?.token);
    const name = cleanName(hello?.name);
    // a sessão já existia com outro token: solta o personagem anterior
    const prevSess = this.sessions.get(sessionId);
    if (prevSess && prevSess.token !== token) this.removeClient(sessionId);

    let slot = this.slots.get(token);
    if (slot && !this.world.entities.has(slot.entityId)) {
      this.slots.delete(token);
      slot = undefined;
    }
    if (slot) {
      if (slot.sid && slot.sid !== sessionId) {
        this.sessions.delete(slot.sid);
        this.kicked.push(slot.sid);
      }
      const e = this.world.entities.get(slot.entityId)!;
      if (name && name !== e.name) {
        e.name = name;
        slot.rec.name = name;
      }
    } else {
      const r = rec ? clone(rec) : this.records.get(token) ? clone(this.records.get(token)!) : { id: randomUUID(), token, name: name ?? DEFAULT_PLAYER_NAME, data: {} };
      r.token = token;
      if (name) r.name = name;
      slot = this.spawnSlot(r, hello?.archetypeId);
    }
    this.comeBack(slot);
    slot.sid = sessionId;

    let sess = this.sessions.get(sessionId);
    if (!sess) {
      sess = {
        sid: sessionId,
        token,
        connected: true,
        lastSeq: -1,
        inputQ: [],
        lastInputTick: this.world.tick,
        // SUGESTÃO: começa com 5 de crédito (a primeira rajada depois do welcome drena logo)
        credit: 5,
        paused: false,
        cack: 0,
        recent: new Set(),
        recentOrder: [],
        cmdQ: [],
        rtt: 0,
        ackTick: 0,
        sent: new Map(),
        gone: new Map(),
      };
      this.sessions.set(sessionId, sess);
    } else {
      // hello repetido na mesma sessão: o cliente pode ter perdido o estado, manda tudo de novo
      sess.connected = true;
      sess.sent.clear();
      sess.gone.clear();
    }
    this.persist(slot);
    const wel: S2C_Welcome = {
      you: slot.entityId,
      mapId: this.mapId,
      tick: this.world.tick,
      tickRate: TICK_RATE,
      protocol: PROTOCOL_VERSION,
    };
    if (generated) wel.token = token;
    return wel;
  }

  /** A conexão acabou de vez: o personagem fica no automático e sai depois de OFFLINE_AUTO_MS. */
  removeClient(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    this.sessions.delete(sessionId);
    const slot = this.slots.get(s.token);
    if (slot && slot.sid === sessionId) {
      slot.sid = undefined;
      this.goOffline(slot);
    }
  }

  /** Queda sem consentimento (o Colyseus espera a reconexão): automático, mas a sessão fica. */
  dropClient(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    s.connected = false;
    s.inputQ.length = 0;
    s.cmdQ.length = 0;
    s.paused = false;
    const slot = this.slots.get(s.token);
    if (slot && slot.sid === sessionId) this.goOffline(slot);
  }

  /** A mesma sessão voltou (reconexão do Colyseus). */
  resumeClient(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    s.connected = true;
    s.lastInputTick = this.world.tick;
    const slot = this.slots.get(s.token);
    if (slot && slot.sid === sessionId) this.comeBack(slot);
  }

  /** Sessões derrubadas porque o mesmo token entrou por outra (o adaptador fecha a conexão). */
  takeKicked(): string[] {
    const k = this.kicked;
    this.kicked = [];
    return k;
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /** id da entidade de uma sessão (testes e ferramentas). */
  entityOf(sessionId: string): Entity | undefined {
    const s = this.sessions.get(sessionId);
    const slot = s && this.slots.get(s.token);
    return slot ? this.world.entities.get(slot.entityId) : undefined;
  }

  /** Personagem de um token, conectado ou no automático. */
  entityOfToken(token: string): Entity | undefined {
    const slot = this.slots.get(token);
    return slot ? this.world.entities.get(slot.entityId) : undefined;
  }

  companionOf(sessionId: string): Entity | undefined {
    const s = this.sessions.get(sessionId);
    const slot = s && this.slots.get(s.token);
    return slot?.companionId !== undefined ? this.world.entities.get(slot.companionId) : undefined;
  }

  private goOffline(slot: Slot): void {
    const e = this.world.entities.get(slot.entityId);
    if (!e || slot.offlineSince !== undefined) return;
    slot.autoBefore = e.auto === true;
    slot.offlineSince = this.world.tick;
    e.auto = true;
    e.moveIntent = { x: 0, y: 0 };
    this.persist(slot);
  }

  private comeBack(slot: Slot): void {
    if (slot.offlineSince === undefined) return;
    const e = this.world.entities.get(slot.entityId);
    if (e) {
      e.auto = slot.autoBefore;
      e.moveIntent = { x: 0, y: 0 };
      e.moveTo = undefined;
      e.path = undefined;
    }
    slot.offlineSince = undefined;
  }

  private kitLevelMin(id: string): number {
    const D = getData();
    if (D.archetypesById.has(id)) return 12;
    if (D.classesById.has(id)) return 8;
    return 1;
  }

  private validKit(id: unknown): id is string {
    if (typeof id !== 'string') return false;
    const D = getData();
    return id === 'delta' || D.archetypesById.has(id) || D.classesById.has(id);
  }

  /** Nasce o personagem do registro no spawn. */
  private spawnSlot(rec: PlayerRecord, archetypeReq?: string): Slot {
    const d = rec.data ?? {};
    rec.data = d;
    const D = getData();
    const archetypeId =
      typeof archetypeReq === 'string' && D.archetypesById.has(archetypeReq) ? archetypeReq : this.validKit(d.archetypeId) ? d.archetypeId : this.defaultArchetype;
    const savedLevel = isInt(d.level) && d.level >= 1 && d.level <= 99 ? d.level : undefined;
    const level = savedLevel !== undefined ? Math.max(savedLevel, this.kitLevelMin(archetypeId)) : undefined;
    const side = d['side'] === 'esquerda' || d['side'] === 'direita' ? d['side'] : undefined;
    const e = spawnPlayer(this.world, {
      name: rec.name,
      archetypeId,
      ...(level !== undefined ? { level } : {}),
      x: this.spawn.x,
      y: this.spawn.y,
      playerId: rec.id,
      ...(side ? { side } : {}),
      ...(typeof d.slot3 === 'string' ? { slot3: d.slot3 } : {}),
    });
    if (isNum(d.xp)) e.xp = Math.max(0, d.xp);
    if (isNum(d.semente)) e.semente = d.semente;
    if (isNum(d.credito)) e.credito = d.credito;
    if (Array.isArray(d.inventory)) e.inventory = d.inventory.filter((x): x is string => typeof x === 'string');
    if (isInt(d.itemCount) && e.loadout) e.loadout.itemCount = Math.max(0, d.itemCount);
    // o registro pode ter cartas gravadas antes da validação: passam pelo mesmo filtro
    if (Array.isArray(d.doctrine)) e.doctrine = sanitizeDoctrine(d.doctrine, 5);
    e.auto = d.auto === true;
    const slot: Slot = { token: rec.token, rec, entityId: e.id, autoBefore: e.auto, lastLevel: e.level };
    if (this.companions) this.spawnCompanion(slot, e);
    this.slots.set(rec.token, slot);
    return slot;
  }

  /**
   * SUGESTÃO: o companheiro de IA do protótipo é o treinador da outra ala do template (quem é Peão
   * Brabo anda com o Li Wei como Idol, e vice-versa), no mesmo nível, seguindo só o seu jogador.
   */
  private spawnCompanion(slot: Slot, e: Entity): void {
    const trainerId = e.archetypeId === 'idol' ? 'wesley' : 'li_wei';
    const archetypeId = getData().trainersById.get(trainerId)?.archetype ?? (trainerId === 'wesley' ? 'peao_brabo' : 'idol');
    try {
      const c = spawnAlly(this.world, trainerId, e.x + 0.8, e.y, { archetypeId, level: Math.max(12, e.level) });
      const party = `grupo_${slot.rec.id}`;
      c.partyId = party;
      e.partyId = party;
      c.spawnX = this.spawn.x;
      c.spawnY = this.spawn.y;
      slot.companionId = c.id;
    } catch (err) {
      this.log(`[core] companheiro não nasceu: ${String(err)}`);
    }
  }

  /** Copia o estado do personagem para o registro. */
  private syncRecord(slot: Slot): void {
    const e = this.world.entities.get(slot.entityId);
    if (!e) return;
    const d = slot.rec.data;
    slot.rec.name = e.name;
    d.archetypeId = e.archetypeId ?? e.classId ?? 'delta';
    if (e.side) d['side'] = e.side;
    if (e.archetypeId && e.loadout?.b3) d.slot3 = e.loadout.b3;
    d.level = e.level;
    d.xp = Math.floor(e.xp ?? 0);
    d.semente = e.semente ?? 0;
    d.credito = e.credito ?? 0;
    d.inventory = [...(e.inventory ?? [])];
    d.itemCount = e.loadout?.itemCount ?? 0;
    d.doctrine = clone(e.doctrine ?? []);
    d.auto = slot.offlineSince !== undefined ? slot.autoBefore : e.auto === true;
  }

  private persist(slot: Slot): void {
    this.syncRecord(slot);
    const rec = clone(slot.rec);
    this.records.set(slot.token, rec);
    if (this.store) this.store.savePlayer(rec).catch((err) => this.log(`[core] falha ao salvar: ${String(err)}`));
  }

  /** Tira o personagem do mapa (depois do tempo no automático), com o progresso salvo. */
  private despawn(slot: Slot): void {
    this.persist(slot);
    this.world.entities.delete(slot.entityId);
    if (slot.companionId !== undefined) this.world.entities.delete(slot.companionId);
    this.slots.delete(slot.token);
    if (slot.sid) {
      this.sessions.delete(slot.sid);
      this.kicked.push(slot.sid);
    }
  }

  /** Grava todos agora (desligando o servidor). */
  async saveAll(): Promise<void> {
    for (const slot of this.slots.values()) this.persist(slot);
    await this.store?.flush();
  }

  // -------------------------------------------------------------------------
  // Entradas

  onInput(sessionId: string, msg: C2S_Input): void {
    const s = this.sessions.get(sessionId);
    if (!s || !s.connected || !msg || typeof msg !== 'object') return;
    if (isNum(msg.rtt)) s.rtt = Math.max(0, Math.min(MAX_CLIENT_RTT_MS, msg.rtt));
    if (isInt(msg.ackTick)) s.ackTick = Math.max(s.ackTick, Math.min(msg.ackTick, this.world.tick));
    // joystick: só seq maior que a última consumida; fila em ordem (drenada no tick)
    if (Array.isArray(msg.inputs)) {
      const ins = msg.inputs.slice(-8).map(sanitizeInput).filter((x): x is PlayerInput => x !== null);
      // cliente que recomeçou a contagem (aba recarregada na mesma sessão)
      if (ins.length > 0 && s.lastSeq > 1000 && ins.every((i) => i.seq + 1000 < s.lastSeq)) {
        s.lastSeq = -1;
        s.inputQ.length = 0;
      }
      for (const inp of ins) {
        if (inp.seq <= s.lastSeq || s.inputQ.some((q) => q.seq === inp.seq)) continue;
        s.inputQ.push(inp);
      }
      if (ins.length > 0) s.lastInputTick = this.world.tick;
      s.inputQ.sort((a, b) => a.seq - b.seq);
      while (s.inputQ.length > INPUT_QUEUE_MAX) s.inputQ.shift();
    }
    // comandos: cada id uma vez só
    if (Array.isArray(msg.cmds)) {
      const raw = msg.cmds.slice(0, MAX_CMDS_PER_MSG);
      const cmds: { c: PlayerCommand; afterSeq?: number }[] = [];
      for (const r of raw) {
        const c = sanitizeCmd(r);
        if (!c) continue;
        const after = (r as unknown as Record<string, unknown>)['afterSeq'];
        cmds.push(isInt(after) && after >= 0 ? { c, afterSeq: after } : { c });
      }
      cmds.sort((a, b) => a.c.id - b.c.id);
      for (const h of cmds) {
        const c = h.c;
        if (s.recent.has(c.id) || c.id <= s.cack - RECENT_CMD_IDS) continue;
        s.recent.add(c.id);
        s.recentOrder.push(c.id);
        while (s.recentOrder.length > RECENT_CMD_IDS) s.recent.delete(s.recentOrder.shift()!);
        if (c.id > s.cack) s.cack = c.id;
        s.cmdQ.push({ ...h, since: this.world.tick });
      }
    }
  }

  /** Responde 'need': as entidades pedidas que estão no raio, com todos os campos. */
  onNeed(sessionId: string, msg: C2S_Need): S2C_Info {
    const s = this.sessions.get(sessionId);
    const me = s && this.entityOf(sessionId);
    const out: S2C_Info = { ents: [] };
    if (!s || !me || !msg || !Array.isArray(msg.ids)) return out;
    for (const id of msg.ids.slice(0, MAX_NEED_IDS)) {
      if (!isInt(id)) continue;
      const e = this.world.entities.get(id);
      if (!e || e.dead || !this.visibleTo(me, e)) continue;
      const o = { ...baseEntSnap(this.world, e) };
      const info = this.infoOf(e);
      o.d = info.d;
      o.n = info.n;
      o.lv = info.lv;
      if (info.lk !== undefined) o.lk = info.lk;
      if (e.id === me.id && e.targetId !== undefined) o.tg = e.targetId;
      out.ents.push(o);
    }
    return out;
  }

  pong(t: unknown): S2C_Pong {
    return { t: isNum(t) ? t : 0, st: this.world.tick };
  }

  /** Ticks de compensação de atraso para os comandos desta sessão. */
  rewindTicksFor(sessionId: string): number {
    const s = this.sessions.get(sessionId);
    return s ? this.rewindTicks(s) : 0;
  }

  /**
   * O cliente desenha os outros em serverNow − INTERP_DELAY_MS, e o serverNow dele já está uma ida
   * atrás do servidor; o comando leva mais uma ida e espera, em média, meio tick. Total: RTT + 100 ms
   * + 25 ms, limitado a MAX_REWIND_MS.
   */
  private rewindTicks(s: Session): number {
    return Math.round(Math.min(MAX_REWIND_MS, s.rtt + INTERP_DELAY_MS + TICK_MS / 2) / TICK_MS);
  }

  /**
   * Anda um passo agora com o joystick de `inp` (entrada extra da drenagem ou diferença de uma
   * suposta). É o mesmo cálculo do movimento do step para o joystick (moveVelocity + stepMovement
   * com a velocidade efetiva), que o cliente também usa na previsão.
   */
  private moveNow(e: Entity, inp: PlayerInput): void {
    if (!canMove(e)) return;
    const speed = moveSpeedOf(e);
    let { vx, vy } = moveVelocity({ x: dequantizeAxis(inp.mx), y: dequantizeAxis(inp.my) }, speed);
    if (vx === 0 && vy === 0 && !e.auto) {
      // sem joystick: o passo do caminho do toque no chão (o cliente também prevê um por entrada),
      // igual ao do movimento do step. No automático, quem anda é a Doutrina, uma vez por tick.
      if (e.path && e.path.length > 0) {
        while (e.path.length > 0 && Math.hypot(e.x - e.path[0]!.x, e.y - e.path[0]!.y) < 0.15) e.path.shift();
        const wp = e.path[0] ?? e.moveTo;
        if (wp) ({ vx, vy } = velocityToward(e, wp.x, wp.y, speed, TICK_MS));
        if (e.path.length === 0) e.path = undefined;
      } else if (e.moveTo) {
        const v = velocityToward(e, e.moveTo.x, e.moveTo.y, speed, TICK_MS);
        if (v.dist < 0.1) e.moveTo = undefined;
        else ({ vx, vy } = v);
      }
    }
    if (vx === 0 && vy === 0) return;
    const p = stepMovement(this.world.map, e, vx, vy, TICK_MS);
    e.x = p.x;
    e.y = p.y;
  }

  /** Aplica os comandos da fila que já podem rodar (em ordem; o primeiro que espera segura os outros). */
  private flushCmds(s: Session, e: Entity, movedSeq: number, final: boolean): void {
    const w = this.world;
    let n = 0;
    for (const h of s.cmdQ) {
      const ready =
        h.afterSeq === undefined
          ? final
          : h.afterSeq <= movedSeq || w.tick - h.since >= CMD_HOLD_MAX_TICKS || h.afterSeq > s.lastSeq + INPUT_QUEUE_MAX;
      if (!ready) break;
      n++;
      try {
        applyCommand(w, e, h.c, { rewindTicks: this.rewindTicks(s) });
      } catch (err) {
        this.log(`[core] comando ${h.c.c} falhou: ${String(err)}`);
      }
    }
    if (n > 0) s.cmdQ.splice(0, n);
  }

  /** Entradas e comandos de uma sessão neste tick (ver o cabeçalho). */
  private consumeInputs(s: Session, e: Entity): void {
    const w = this.world;
    s.credit = Math.min(INPUT_CREDIT_MAX, s.credit + INPUT_CREDIT_PER_TICK);
    s.paused = false;
    // tudo até lastSeq já andou nos ticks anteriores
    let moved = s.lastSeq;
    this.flushCmds(s, e, moved, false);
    // drenagem: as entradas mais velhas além do alvo andam agora (a do tick anda no step)
    let extra = 0;
    while (s.inputQ.length > INPUT_TARGET_BACKLOG + 1 && extra < INPUT_CATCHUP_PER_TICK && s.credit >= 2) {
      const inp = s.inputQ.shift()!;
      applyInput(w, e, inp);
      this.moveNow(e, inp);
      s.lastSeq = moved = inp.seq;
      s.credit -= 1;
      extra++;
      this.flushCmds(s, e, moved, false);
    }
    // a entrada deste tick (anda no step)
    const inp = s.credit >= 1 ? s.inputQ.shift() : undefined;
    if (inp) {
      applyInput(w, e, inp);
      s.lastSeq = inp.seq;
      s.credit -= 1;
    } else {
      // fila vazia (a rede travou ou a aba parou): não anda neste tick, nem pelo joystick velho nem
      // pelo caminho do toque no chão, porque o ack não anda. A rajada que vier depois é drenada.
      if (e.moveIntent.x !== 0 || e.moveIntent.y !== 0) e.moveIntent = { x: 0, y: 0 };
      s.paused = true;
    }
    this.flushCmds(s, e, moved, true);
  }

  // -------------------------------------------------------------------------
  // Tick

  /** Um tick do servidor: entradas, simulação, mundo e um snapshot por cliente conectado. */
  tick(): Map<string, S2C_Snapshot> {
    const w = this.world;
    // eventos soltos pelos comandos (antes do step, que zera w.events) entram neste tick
    w.events = [];
    // 1. entradas e comandos
    for (const s of this.sessions.values()) {
      const slot = this.slots.get(s.token);
      const e = slot && slot.sid === s.sid ? w.entities.get(slot.entityId) : undefined;
      if (!e || !s.connected) continue;
      this.consumeInputs(s, e);
    }
    // 2. posições antes do passo (eventos de quem sai do mundo neste tick)
    this.prevPos.clear();
    for (const e of w.entities.values()) this.prevPos.set(e.id, [e.x, e.y]);
    // sem entrada neste tick, o caminho do toque no chão espera (o cliente prevê um passo por entrada)
    const parked: { e: Entity; path: Entity['path']; moveTo: Entity['moveTo'] }[] = [];
    for (const s of this.sessions.values()) {
      if (!s.paused || !s.connected) continue;
      const e = this.entityOf(s.sid);
      if (!e || e.auto || (!e.path && !e.moveTo)) continue;
      parked.push({ e, path: e.path, moveTo: e.moveTo });
      e.path = undefined;
      e.moveTo = undefined;
    }
    // 3. simulação
    const fromCommands = w.events;
    let stepped: CombatEvent[];
    try {
      stepped = step(w);
    } finally {
      for (const p of parked) {
        if (p.e.path === undefined && p.e.moveTo === undefined) {
          p.e.path = p.path;
          p.e.moveTo = p.moveTo;
        }
      }
    }
    const events = fromCommands.length > 0 ? [...fromCommands, ...stepped] : stepped;
    w.events = events;
    this.lastEvents = events;
    // 4. mundo: renascimento, quem caiu da conexão, gravação
    this.spawner?.tick();
    const saveTicks = msToTicks(SAVE_EVERY_MS);
    for (const slot of Array.from(this.slots.values())) {
      const e = w.entities.get(slot.entityId);
      if (!e) {
        this.slots.delete(slot.token);
        continue;
      }
      if (slot.offlineSince !== undefined && w.tick - slot.offlineSince >= this.offlineTicks) {
        this.despawn(slot);
        continue;
      }
      if (e.level !== slot.lastLevel) {
        slot.lastLevel = e.level;
        this.persist(slot);
      } else if (w.tick % saveTicks === 0) this.persist(slot);
    }
    // 5. snapshots
    this.baseCache.clear();
    this.infoCache.clear();
    this.evCache.clear();
    const out = new Map<string, S2C_Snapshot>();
    for (const s of this.sessions.values()) {
      if (!s.connected) continue;
      const snap = this.snapshotFor(s, events);
      if (snap) out.set(s.sid, snap);
    }
    return out;
  }

  /** Vale para este jogador: no raio, saque dele (ou de ninguém), inimigo invisível não aparece. */
  private visibleTo(me: Entity, e: Entity): boolean {
    if (e.id === me.id) return true;
    const dx = e.x - me.x, dy = e.y - me.y;
    if (dx * dx + dy * dy > this.interestRadius * this.interestRadius) return false;
    if (e.kind === 'loot' && e.loot?.forPlayerId !== undefined && e.loot.forPlayerId !== (me.playerId ?? `#${me.id}`)) return false;
    if (isHostile(me, e) && hasStatus(e, 'invisivel')) return false;
    return true;
  }

  private baseOf(e: Entity): EntSnap {
    let b = this.baseCache.get(e.id);
    if (!b) {
      b = baseEntSnap(this.world, e);
      this.baseCache.set(e.id, b);
    }
    return b;
  }

  private infoOf(e: Entity): { d: string; n: string; lv: number; lk: unknown; lkJson: string | undefined } {
    let i = this.infoCache.get(e.id);
    if (!i) {
      const rec = e.kind === 'player' && e.playerId ? this.recByPlayerId(e.playerId) : undefined;
      const lk = lookOf(e, rec);
      i = { d: e.defId, n: e.name, lv: e.level, lk, lkJson: lk === undefined ? undefined : JSON.stringify(lk) };
      this.infoCache.set(e.id, i);
    }
    return i;
  }

  private recByPlayerId(pid: string): PlayerRecord | undefined {
    for (const s of this.slots.values()) if (s.rec.id === pid) return s.rec;
    return undefined;
  }

  private snapshotFor(s: Session, events: CombatEvent[]): S2C_Snapshot | undefined {
    const w = this.world;
    const slot = this.slots.get(s.token);
    const me = slot ? w.entities.get(slot.entityId) : undefined;
    if (!me) return undefined;
    const now = w.tick;
    const R = this.interestRadius;
    const visible = new Set<number>();
    const ents: EntSnap[] = [];
    for (const e of w.entities.values()) {
      if (e.dead || !this.visibleTo(me, e)) continue;
      visible.add(e.id);
      const o: EntSnap = { ...this.baseOf(e) };
      if (e.id === me.id && e.targetId !== undefined) o.tg = e.targetId;
      const info = this.infoOf(e);
      const prev = s.sent.get(e.id);
      let full = false;
      if (!prev || prev.d !== info.d || prev.n !== info.n || prev.lv !== info.lv || prev.lk !== info.lkJson) {
        s.sent.set(e.id, { d: info.d, n: info.n, lv: info.lv, lk: info.lkJson, tick: now });
        full = true;
      } else if (s.ackTick < prev.tick && (now - prev.tick) % INFO_REPEAT_TICKS === 0) full = true;
      if (full) {
        o.d = info.d;
        o.n = info.n;
        o.lv = info.lv;
        if (info.lk !== undefined) o.lk = info.lk;
      }
      ents.push(o);
    }
    // quem saiu do raio ou do mundo
    for (const id of Array.from(s.sent.keys())) {
      if (visible.has(id)) continue;
      s.sent.delete(id);
      s.gone.set(id, now);
    }
    const gone: number[] = [];
    for (const [id, t0] of Array.from(s.gone)) {
      if (visible.has(id) || (s.ackTick >= t0 && t0 < now) || now - t0 > GONE_REPEAT_TICKS) {
        s.gone.delete(id);
        continue;
      }
      gone.push(id);
    }
    const near = (x: number, y: number, extra: number) => {
      const dx = x - me.x, dy = y - me.y, r = R + extra;
      return dx * dx + dy * dy <= r * r;
    };
    const tel = w.telegraphs.filter((t) => near(t.x, t.y, t.radius)).map(telegraphOut);
    const zones = w.zones.filter((z) => near(z.x, z.y, Math.max(z.radius, z.range ?? 0))).map(zoneOut);
    const ev: CombatEvent[] = [];
    const myPid = me.playerId ?? `#${me.id}`;
    for (const e of events) {
      if (e.t === 'loot_drop') {
        const l = w.entities.get(e.id);
        if (!l || (l.loot?.forPlayerId !== undefined && l.loot.forPlayerId !== myPid)) continue;
      }
      const refs = eventRefs(e);
      let ok = refs.ids.includes(me.id) || (refs.at !== undefined && near(refs.at[0], refs.at[1], EVENT_MARGIN_TILES));
      if (!ok) {
        for (const id of refs.ids) {
          const ent = w.entities.get(id);
          const p = ent ? [ent.x, ent.y] : this.prevPos.get(id);
          if (p && near(p[0]!, p[1]!, EVENT_MARGIN_TILES)) {
            ok = true;
            break;
          }
        }
      }
      if (!ok) continue;
      let c = this.evCache.get(e);
      if (!c) {
        c = eventOut(e);
        this.evCache.set(e, c);
      }
      ev.push(c);
    }
    const snap: S2C_Snapshot = { t: now, ack: s.lastSeq, cack: s.cack, ents, tel, zones, ev, hud: hudSnapshot(w, me) };
    if (gone.length > 0) snap.gone = gone;
    return snap;
  }

  // -------------------------------------------------------------------------

  stats(): { tick: number; players: number; online: number; entities: number } {
    let online = 0;
    for (const s of this.sessions.values()) if (s.connected) online++;
    return { tick: this.world.tick, players: this.slots.size, online, entities: this.world.entities.size };
  }
}
