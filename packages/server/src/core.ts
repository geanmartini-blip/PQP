/**
 * GameServerCore: o servidor autoritativo de UM mapa, sem transporte. O WorldRoom (Colyseus, uma
 * sala por mapa) e os testes (canal em memória) falam com ele do mesmo jeito.
 *
 * Fluxo por tick (20 por segundo):
 *  1. cada sessão consome UMA entrada da fila (o cliente prevê um tick por entrada) e os comandos
 *     novos, com compensação de atraso (rewind = min(250 ms, rtt + 100 ms + 25 ms) em ticks: o
 *     cliente desenha os outros 100 ms atrás do que recebeu, que já chegou uma ida atrasado, e o
 *     comando leva mais uma ida e espera o tick);
 *     - posição e ack andam juntos: cada entrada é um passo, nunca dois. Fila vazia (a rede travou,
 *       que no TCP é como a perda aparece): o personagem não anda neste tick, nem pelo joystick
 *       velho nem pelo caminho do toque no chão;
 *     - fila com mais de INPUT_TARGET_BACKLOG + 1: até INPUT_CATCHUP_PER_TICK entradas extras andam
 *       na hora, as mais velhas primeiro, pelo crédito de entradas;
 *     - comando com afterSeq espera o servidor ter andado essa entrada;
 *  2. step() da simulação;
 *  3. Fase 2: os eventos do tick (xp, level, death, cast, loot_pick, revive) e os lugares, regiões
 *     e marcadores por perto alimentam as regras de shared/game (missões, tutorial, story_flags);
 *  4. renascimento dos inimigos, saída de quem caiu da conexão há muito tempo, gravação;
 *  5. um snapshot por cliente: entidades no raio de interesse, 'gone', avisos, zonas, eventos e HUD.
 *
 * Fase 2 (registro e regras):
 * - o registro é o PlayerRecord de shared/game (version 2), carregado do Store e migrado;
 * - sem personagem (criado=false): a sessão recebe 'perfil' e espera 'criar_personagem'; só então
 *   o personagem nasce e o 'welcome' sai (com o token gerado, se foi o caso);
 * - personagem de outro mapa (o mapa vem do estágio: Delta até a travessia, depois o QG da
 *   margem): 'trocar_sala' com o mapId certo, sem nascer aqui;
 * - mensagens de jogo (GAME_MSG) entram por onGameMessage e as respostas saem pela caixa de saída
 *   (takeOutbox), que o adaptador manda na ordem;
 * - o registro é a fonte de nível, XP, estágio, missões e visual; a entidade é a fonte de moedas,
 *   inventário, poções, Doutrina e automático (pull antes de cada regra, push depois);
 * - grava a cada mudança (o Store faz o debounce) e a cada SAVE_EVERY_MS.
 * - sala do protótipo (SANDBOX_MAPS): o personagem template da Fase 1 (hello.archetypeId), sem
 *   registro no Store nem regras de jogo, para os testes de combate e de rede.
 *
 * Entradas: aceita as PlayerInput com seq maior que a última consumida (o cliente repete as 3
 * últimas). Comandos: dedupe por id (maior id processado = cack, mais um conjunto dos recentes).
 * Campos d/n/lk/lv: vão quando a entidade é nova para o cliente ou mudou, e se repetem a cada
 * INFO_REPEAT_TICKS até o cliente confirmar o tick (C2S_Input.ackTick); 'need' responde com 'info'
 * se mesmo assim faltar.
 * Queda de conexão: o personagem fica no modo automático (Doutrina) por OFFLINE_AUTO_MS e depois sai;
 * o mesmo token retoma o mesmo personagem.
 */
import { randomUUID } from 'node:crypto';
import { getData } from '@pqp/shared/data';
import { findPath, getMap, START_MAP } from '@pqp/shared/map';
import {
  dequantizeAxis,
  GAME_MSG,
  INTEREST_RADIUS,
  INTERP_DELAY_MS,
  MAX_REWIND_MS,
  MSG,
  PROTOCOL_VERSION,
  type C2S_CriarPersonagem,
  type C2S_DialogoOpcao,
  type C2S_Falar,
  type C2S_Hello,
  type C2S_Input,
  type C2S_MaquinaVisual,
  type C2S_MissaoAceitar,
  type C2S_Need,
  type C2S_Travessia,
  type C2S_TutorialPasso,
  type EntSnap,
  type S2C_Dialogo,
  type S2C_Info,
  type S2C_MissaoEstado,
  type S2C_Pong,
  type S2C_Snapshot,
  type S2C_TrocarSala,
  type S2C_Welcome,
} from '@pqp/shared/net';
import {
  applyCommand,
  applyInput,
  canMove,
  createWorld,
  downEntity,
  hasStatus,
  hudSnapshot,
  isHostile,
  moveSpeedOf,
  moveVelocity,
  msToTicks,
  npcInReach,
  setArchetype,
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
import { relevel } from '@pqp/shared/sim/spawn';
import { lookOf as recordLook, nearVisualMachine, applyVisualMachine } from '@pqp/shared/game/visual';
import { newPlayerRecord, profileOf, simKitOf } from '@pqp/shared/game/record';
import { gainXp, isDeltaRookie, simLevelCap } from '@pqp/shared/game/progression';
import { acceptMission, currentObjectives, missionStatus, onGameEvent } from '@pqp/shared/game/missions';
import { controlesLiberados, TUTORIAL_STEPS } from '@pqp/shared/game/tutorial';
import { dialogOption, dialogOptions, talkTo, type Dialog } from '@pqp/shared/game/dialog';
import { applyTravessia, createCharacter } from '@pqp/shared/game/travessia';
import type { GameEvent, GameResult, PlayerRecord } from '@pqp/shared/game/types';
import { TutorialControl } from '@pqp/shared/schema/mission';
import {
  AREA_CHECK_TICKS,
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
  INTERACT_MARKER_RADIUS_TILES,
  JACO_DOWN_COOLDOWN_MS,
  MAX_CLIENT_RTT_MS,
  MAX_CMDS_PER_MSG,
  MAX_NAME_LENGTH,
  OFFLINE_AUTO_MS,
  PLACE_LEAVE_RADIUS_TILES,
  PLACE_RADIUS_TILES,
  RECENT_CMD_IDS,
  SANDBOX_MAPS,
  SAVE_EVERY_MS,
  TRAVESSIA_REACH_TILES,
} from './config';
import type { Store, StoredPlayer } from './persistence/store';
import { sanitizeDoctrine } from './doctrine_guard';
import { areaMarkers, avisosOf, botaoOf, controlOfBotao, interactAction, isResource, killParticipants, mapForRecord, rollRewardItems, wantsControl, type AreaMarkers } from './game_bridge';
import { baseEntSnap, eventOut, eventRefs, lookOf, telegraphOut, zoneOut } from './snapshot';
import { Spawner, type SpawnerOptions } from './spawner';

export interface CoreOptions {
  mapId?: string;
  seed?: number;
  /** persistência; sem ela, o progresso fica só na memória do processo */
  store?: Store;
  /** põe bandos, elite, chefe e NPCs dos marcadores (padrão true) */
  content?: boolean;
  /** companheiro de IA (treinador) para cada jogador (padrão false; PQP_COMPANHEIRO=1 no servidor) */
  companions?: boolean;
  /**
   * o Seu Jacó acompanha quem ainda está no Delta (padrão: só no mapa do Delta, fora da sandbox).
   * Ele conta no grupo e cai no objetivo "Seu Jacó caiu!" para o jogador levantar.
   */
  jaco?: boolean;
  /** sala do protótipo: personagem template, sem registro nem regras (padrão: mapId em SANDBOX_MAPS) */
  sandbox?: boolean;
  /** arquétipo do template da sandbox (padrão peao_brabo) */
  defaultArchetype?: string;
  /** tempo no automático depois da queda de conexão antes de sair do mapa */
  offlineAutoMs?: number;
  interestRadius?: number;
  spawner?: SpawnerOptions;
  log?: (msg: string) => void;
}

/** Mensagem que o adaptador manda para uma sessão (na ordem da caixa). */
export interface OutMsg {
  sid: string;
  type: string;
  msg: unknown;
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
  /** registro sem personagem criado: espera 'criar_personagem' */
  pending?: PlayerRecord;
  /** o token foi gerado pelo servidor e ainda não foi entregue no welcome */
  tokenToSend?: boolean;
  /** mandada para outra sala (trocar_sala): não tem personagem aqui */
  movedTo?: string;
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
  /** personagem template da sala do protótipo (sem regras nem Store) */
  sandbox: boolean;
  entityId: number;
  companionId?: number;
  sid?: string;
  /** tick em que a conexão caiu (personagem no automático) */
  offlineSince?: number;
  autoBefore: boolean;
  lastLevel: number;
  /** mudou desde a última gravação */
  dirty: boolean;
  /** perfil e estado das missões a mandar no fim do tick ou da mensagem */
  notify: boolean;
  /** eventos de jogo detectados nas entradas e comandos, aplicados depois do step */
  queued: GameEvent[];
  /** lugar atual (undefined = ainda não conferido) */
  place?: string | null;
  region?: string;
  /** marcadores de interação em que o jogador está dentro */
  inside: Set<string>;
  stickDown: boolean;
  hadTarget: boolean;
  jacoDownAt?: number;
  lastDialog?: Dialog;
}

// SUGESTÃO: 'need' responde no máximo 64 ids por pedido.
const MAX_NEED_IDS = 64;

const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const CONTROLS = new Set<string>(TutorialControl.options);
const STEPS = new Set<string>(TUTORIAL_STEPS.map((s) => s.id));

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
  /** sala do protótipo: template da Fase 1, sem registro nem regras */
  readonly sandbox: boolean;
  /** eventos do último tick (testes e métricas) */
  lastEvents: CombatEvent[] = [];

  private readonly store?: Store;
  private readonly companions: boolean;
  private readonly jaco: boolean;
  private readonly defaultArchetype: string;
  private readonly offlineTicks: number;
  private readonly interestRadius: number;
  private readonly log: (msg: string) => void;
  private readonly areas: AreaMarkers;
  private readonly sessions = new Map<string, Session>();
  private readonly slots = new Map<string, Slot>(); // token -> personagem no mundo
  private readonly records = new Map<string, PlayerRecord>(); // token -> último registro conhecido (sem Store e sandbox)
  private kicked: string[] = [];
  private outbox: OutMsg[] = [];
  private prevPos = new Map<number, [number, number]>();
  private baseCache = new Map<number, EntSnap>();
  private infoCache = new Map<number, { d: string; n: string; lv: number; lk: unknown; lkJson: string | undefined }>();
  private evCache = new Map<CombatEvent, CombatEvent>();

  constructor(opts: CoreOptions = {}) {
    this.mapId = opts.mapId ?? DEFAULT_MAP_ID;
    this.world = createWorld(getMap(this.mapId), opts.seed ?? DEFAULT_WORLD_SEED);
    this.world.pathfinder = findPath;
    if (opts.store) this.store = opts.store;
    this.sandbox = opts.sandbox ?? SANDBOX_MAPS.includes(this.mapId);
    this.companions = opts.companions ?? false;
    this.jaco = opts.jaco ?? (!this.sandbox && this.mapId === START_MAP);
    this.defaultArchetype = opts.defaultArchetype ?? DEFAULT_ARCHETYPE;
    this.offlineTicks = msToTicks(opts.offlineAutoMs ?? OFFLINE_AUTO_MS);
    this.interestRadius = opts.interestRadius ?? INTEREST_RADIUS;
    this.log = opts.log ?? ((m) => console.log(m));
    this.areas = areaMarkers(this.world.map);
    const sp = this.world.map.markers.find((m) => m.kind === 'spawn_jogador');
    this.spawn = sp ? { x: sp.x, y: sp.y } : { x: this.world.map.width / 2, y: this.world.map.height / 2 };
    if (opts.content !== false) {
      this.spawner = new Spawner(this.world, { log: this.log, ...(opts.spawner ?? {}) });
      this.spawner.populate();
    }
  }

  // -------------------------------------------------------------------------
  // Caixa de saída (mensagens de jogo, welcome tardio, trocar_sala)

  /** Mensagens prontas para mandar, na ordem (o adaptador chama depois de cada mensagem e de cada tick). */
  takeOutbox(): OutMsg[] {
    const o = this.outbox;
    this.outbox = [];
    return o;
  }

  private send(sid: string | undefined, type: string, msg: unknown): void {
    if (sid !== undefined) this.outbox.push({ sid, type, msg });
  }

  // -------------------------------------------------------------------------
  // Clientes

  /**
   * Carrega (ou cria) o registro no Store e entra. É o caminho do WorldRoom. Sem token válido, o
   * servidor gera um e devolve em welcome.token (ou em trocar_sala.token). Devolve null quando o
   * personagem ainda não existe (espera 'criar_personagem') ou é de outro mapa (trocar_sala).
   * `explicit`: o cliente pediu esta sala pelo mapId (a sandbox só aceita assim).
   */
  async join(sessionId: string, hello: C2S_Hello, opts: { explicit?: boolean } = {}): Promise<S2C_Welcome | null> {
    const { token, generated } = normalizeToken(hello?.token);
    const h: C2S_Hello = { ...(hello ?? {}), token };
    if (this.sandbox && opts.explicit !== false) {
      const w = this.addClient(sessionId, h);
      if (w && generated) w.token = token;
      return w;
    }
    let row: StoredPlayer | undefined;
    if (this.store && !this.slots.has(token)) {
      try {
        row = await this.store.getOrCreatePlayer(token, cleanName(hello?.name) ?? DEFAULT_PLAYER_NAME);
      } catch (err) {
        this.log(`[core] store falhou para um token; seguindo sem persistência: ${String(err)}`);
      }
    }
    if (this.sandbox) {
      // sala do protótipo sem pedido explícito: manda para o mapa do registro
      const rec = row?.data ?? this.records.get(token) ?? newPlayerRecord(randomUUID(), DEFAULT_PLAYER_NAME);
      this.redirect(this.ensureSession(sessionId, token), mapForRecord(rec), 'registro', generated);
      return null;
    }
    return this.addClient(sessionId, h, row?.data, { generated });
  }

  /**
   * Entra (ou volta) com um hello. Mesmo token = mesmo personagem: se ele ainda está no mundo (no
   * automático depois da queda), volta a ser controlado; senão nasce no spawn com o progresso do
   * registro. Uma sessão antiga do mesmo token é derrubada (takeKicked). Fora da sandbox, devolve
   * null quando falta criar o personagem ou ele é de outro mapa (as mensagens vão pela caixa).
   */
  addClient(sessionId: string, hello: C2S_Hello, rec?: PlayerRecord, opts: { generated?: boolean } = {}): S2C_Welcome | null {
    const { token, generated: gen0 } = normalizeToken(hello?.token);
    const generated = gen0 || opts.generated === true;
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
      if (slot.sandbox && name && name !== e.name) {
        e.name = name;
        slot.rec.name = name;
      }
    } else if (this.sandbox) {
      const r = rec ? clone(rec) : this.records.get(token) ? clone(this.records.get(token)!) : newPlayerRecord(randomUUID(), name ?? DEFAULT_PLAYER_NAME);
      if (name) r.name = name;
      r.criado = true;
      slot = this.spawnSlot(token, r, true, hello?.archetypeId);
    } else {
      const r = rec ? clone(rec) : this.records.get(token) ? clone(this.records.get(token)!) : newPlayerRecord(randomUUID(), name ?? DEFAULT_PLAYER_NAME);
      const sess = this.ensureSession(sessionId, token);
      const target = mapForRecord(r);
      if (target !== this.mapId) {
        this.redirect(sess, target, 'registro', generated);
        return null;
      }
      if (!r.criado) {
        sess.pending = r;
        if (generated) sess.tokenToSend = true;
        this.records.set(token, clone(r));
        this.send(sessionId, GAME_MSG.perfil, profileOf(r, controlesLiberados(r)));
        return null;
      }
      slot = this.spawnSlot(token, r, false);
    }
    this.comeBack(slot);
    slot.sid = sessionId;
    const sess = this.ensureSession(sessionId, token);
    sess.pending = undefined;
    sess.movedTo = undefined;
    this.persist(slot);
    const wel = this.welcomeOf(slot);
    if (generated || sess.tokenToSend) wel.token = token;
    sess.tokenToSend = undefined;
    if (!slot.sandbox) slot.notify = true;
    this.flushNotify();
    return wel;
  }

  private welcomeOf(slot: Slot): S2C_Welcome {
    return { you: slot.entityId, mapId: this.mapId, tick: this.world.tick, tickRate: TICK_RATE, protocol: PROTOCOL_VERSION };
  }

  private ensureSession(sessionId: string, token: string): Session {
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
      sess.token = token;
      sess.connected = true;
      sess.sent.clear();
      sess.gone.clear();
    }
    return sess;
  }

  /** Manda a sessão para a sala de outro mapa. */
  private redirect(sess: Session, mapId: string, motivo: S2C_TrocarSala['motivo'], generated: boolean): void {
    sess.movedTo = mapId;
    sess.pending = undefined;
    const msg: S2C_TrocarSala = { mapId, motivo };
    if (generated || sess.tokenToSend) msg.token = sess.token;
    this.send(sess.sid, GAME_MSG.trocarSala, msg);
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

  /** Personagem de uma sessão (testes e ferramentas). */
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

  /** Registro do jogador de uma sessão (o do personagem no mundo, ou o que espera a criação). */
  recordOf(sessionId: string): PlayerRecord | undefined {
    const s = this.sessions.get(sessionId);
    if (!s) return undefined;
    const slot = this.slots.get(s.token);
    if (slot) {
      this.pull(slot);
      return slot.rec;
    }
    return s.pending;
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
  private spawnSlot(token: string, rec: PlayerRecord, sandbox: boolean, archetypeReq?: string): Slot {
    const D = getData();
    let e: Entity;
    const side = rec.side ?? undefined;
    if (sandbox) {
      const saved = rec.archetype ?? rec.class ?? undefined;
      const kit = typeof archetypeReq === 'string' && D.archetypesById.has(archetypeReq) ? archetypeReq : this.validKit(saved) ? saved : this.defaultArchetype;
      const level = Math.max(Math.max(1, Math.min(99, Math.floor(rec.level))), this.kitLevelMin(kit));
      e = spawnPlayer(this.world, {
        name: rec.name,
        archetypeId: kit,
        level,
        x: this.spawn.x,
        y: this.spawn.y,
        playerId: rec.id,
        xp: Math.max(0, rec.xp),
        ...(side ? { side } : {}),
        ...(rec.loadout.slot3_ability ? { slot3: rec.loadout.slot3_ability } : {}),
      });
    } else {
      const cap = simLevelCap(rec);
      e = spawnPlayer(this.world, {
        name: rec.name,
        archetypeId: simKitOf(rec),
        level: Math.max(1, Math.floor(rec.level)),
        xp: Math.max(0, rec.xp),
        x: this.spawn.x,
        y: this.spawn.y,
        playerId: rec.id,
        look: recordLook(rec),
        ...(cap !== undefined ? { levelCap: cap } : {}),
        ...(isDeltaRookie(rec) ? { deltaRookie: true } : {}),
        ...(side ? { side } : {}),
        ...(rec.archetype && rec.loadout.slot3_ability ? { slot3: rec.loadout.slot3_ability } : {}),
      });
    }
    e.semente = Math.max(0, rec.semente);
    e.credito = Math.max(0, rec.credito);
    e.inventory = rec.inventory.filter((x): x is string => typeof x === 'string');
    if (e.loadout) e.loadout.itemCount = Math.max(0, Math.floor(rec.item_count));
    // o registro pode ter cartas gravadas antes da validação: passam pelo mesmo filtro
    e.doctrine = sanitizeDoctrine(Array.isArray(rec.doctrine) ? rec.doctrine : [], 5);
    e.auto = rec.auto === true;
    const slot: Slot = {
      token,
      rec,
      sandbox,
      entityId: e.id,
      autoBefore: e.auto,
      lastLevel: e.level,
      dirty: false,
      notify: false,
      queued: [],
      inside: new Set(),
      stickDown: false,
      hadTarget: false,
    };
    if (!sandbox && this.jaco && rec.stage !== 'margem') this.spawnJaco(slot, e);
    else if (this.companions) this.spawnCompanion(slot, e);
    this.slots.set(token, slot);
    return slot;
  }

  /**
   * SUGESTÃO: o companheiro de IA do protótipo é o treinador da outra ala do template (quem é Peão
   * Brabo anda com o Li Wei como Idol, e vice-versa), no mesmo nível, seguindo só o seu jogador.
   */
  private spawnCompanion(slot: Slot, e: Entity): void {
    const trainerId = e.archetypeId === 'idol' ? 'wesley' : 'li_wei';
    const archetypeId = getData().trainersById.get(trainerId)?.archetype ?? (trainerId === 'wesley' ? 'peao_brabo' : 'idol');
    this.addCompanion(slot, e, trainerId, archetypeId, Math.max(12, e.level));
  }

  /**
   * Decisão da Fase 2: o Seu Jacó acompanha quem está no Delta (Sistemas.md: "só luta em grupo dá
   * XP"; o Seu Jacó é o companheiro de IA do novato). Luta com o kit do Delta, no nível do jogador.
   */
  private spawnJaco(slot: Slot, e: Entity): void {
    const c = this.addCompanion(slot, e, 'seu_jaco', 'delta', Math.max(1, e.level));
    if (c) c.name = getData().npcsById.get('seu_jaco')?.name ?? 'Seu Jacó';
  }

  private addCompanion(slot: Slot, e: Entity, defId: string, kit: string, level: number): Entity | undefined {
    try {
      const c = spawnAlly(this.world, defId, e.x + 0.8, e.y, { archetypeId: kit, level });
      const party = `grupo_${slot.rec.id}`;
      c.partyId = party;
      e.partyId = party;
      c.spawnX = this.spawn.x;
      c.spawnY = this.spawn.y;
      slot.companionId = c.id;
      return c;
    } catch (err) {
      this.log(`[core] companheiro não nasceu: ${String(err)}`);
      return undefined;
    }
  }

  // -------------------------------------------------------------------------
  // Registro <-> entidade

  /** Entidade -> registro: moedas, inventário, poções, Doutrina e automático (e, na sandbox, kit e nível). */
  private pull(slot: Slot): void {
    const e = this.world.entities.get(slot.entityId);
    if (!e) return;
    const r = slot.rec;
    r.semente = Math.max(0, Math.round(e.semente ?? 0));
    r.credito = Math.max(0, Math.round(e.credito ?? 0));
    r.inventory = [...(e.inventory ?? [])];
    r.item_count = e.loadout?.itemCount ?? 0;
    r.doctrine = clone(e.doctrine ?? []);
    r.auto = slot.offlineSince !== undefined ? slot.autoBefore : e.auto === true;
    if (slot.sandbox) {
      r.name = e.name;
      r.level = e.level;
      r.xp = Math.floor(e.xp ?? 0);
      r.archetype = e.archetypeId ?? null;
      r.class = e.classId ?? null;
      r.side = e.side ?? null;
      if (e.archetypeId && e.loadout?.b3) r.loadout.slot3_ability = e.loadout.b3;
    }
  }

  /** Registro -> entidade: kit, nível, XP, teto, novato do Delta, visual, nome, moedas e poções. */
  private push(slot: Slot): void {
    if (slot.sandbox) return;
    const e = this.world.entities.get(slot.entityId);
    if (!e) return;
    const w = this.world;
    const r = slot.rec;
    const kit = simKitOf(r);
    const cur = e.archetypeId ?? e.classId ?? 'delta';
    if (kit !== cur) {
      if (r.side) e.side = r.side;
      try {
        setArchetype(w, e, kit, r.loadout.slot3_ability ?? undefined);
      } catch (err) {
        this.log(`[core] kit ${kit} falhou: ${String(err)}`);
      }
    }
    if (e.level !== r.level) relevel(w, e, r.level);
    e.xp = Math.max(0, r.xp);
    const cap = simLevelCap(r);
    if (cap === undefined) delete e.levelCap;
    else e.levelCap = cap;
    if (isDeltaRookie(r)) e.deltaRookie = true;
    else delete e.deltaRookie;
    e.look = recordLook(r);
    e.name = r.name;
    e.semente = r.semente;
    e.credito = r.credito;
    e.inventory = [...r.inventory];
    if (e.loadout) e.loadout.itemCount = r.item_count;
    slot.lastLevel = e.level;
  }

  private persist(slot: Slot): Promise<void> {
    this.pull(slot);
    slot.dirty = false;
    const rec = clone(slot.rec);
    this.records.set(slot.token, rec);
    if (slot.sandbox || !this.store) return Promise.resolve();
    return this.store.savePlayer({ id: rec.id, token: slot.token, name: rec.name, data: rec }).catch((err) => this.log(`[core] falha ao salvar: ${String(err)}`));
  }

  /** Tira o personagem (e o companheiro) do mapa. */
  private removeSlot(slot: Slot): void {
    this.world.entities.delete(slot.entityId);
    if (slot.companionId !== undefined) this.world.entities.delete(slot.companionId);
    this.slots.delete(slot.token);
  }

  /** Tira o personagem do mapa (depois do tempo no automático), com o progresso salvo. */
  private despawn(slot: Slot): void {
    this.persist(slot);
    this.removeSlot(slot);
    if (slot.sid) {
      this.sessions.delete(slot.sid);
      this.kicked.push(slot.sid);
    }
  }

  /** Grava todos agora (desligando o servidor). */
  async saveAll(): Promise<void> {
    await Promise.all(Array.from(this.slots.values()).map((s) => this.persist(s)));
    await this.store?.flush();
  }

  // -------------------------------------------------------------------------
  // Regras de jogo (Fase 2)

  /** Aplica o resultado de uma regra: saque das recompensas, entidade, avisos, gravação e perfil. */
  private applyResult(slot: Slot, r: GameResult): void {
    const e = this.world.entities.get(slot.entityId);
    for (const x of r.itensParaRolar) if (e) rollRewardItems(this.world, e, x.tabela, x.quantidade);
    if (r.mudou || r.niveis.length > 0 || r.estagio) {
      this.push(slot);
      slot.dirty = true;
      slot.notify = true;
    }
    for (const a of avisosOf(r)) this.send(slot.sid, GAME_MSG.aviso, a);
  }

  /** Evento de jogo para o registro do slot (com pull antes). */
  private gameEvent(slot: Slot, ev: GameEvent, grupo?: { personagens: number; aoVivo: number }): void {
    if (slot.sandbox) return;
    this.pull(slot);
    this.applyResult(slot, onGameEvent(slot.rec, ev, grupo ? { grupo } : {}));
  }

  /** Perfil e estado das missões de quem mudou; grava quem mudou (o Store faz o debounce). */
  private flushNotify(): void {
    for (const slot of this.slots.values()) {
      if (slot.notify) {
        slot.notify = false;
        if (slot.sid) {
          this.send(slot.sid, GAME_MSG.perfil, profileOf(slot.rec, controlesLiberados(slot.rec, currentObjectives(slot.rec).map((c) => c.objetivo))));
          this.send(slot.sid, GAME_MSG.missaoEstado, this.missionStateOf(slot));
        }
      }
      if (slot.dirty) this.persist(slot);
    }
  }

  private missionStateOf(slot: Slot): S2C_MissaoEstado {
    const e = this.world.entities.get(slot.entityId);
    return missionStatus(slot.rec, this.world.map, e ? { x: e.x, y: e.y } : undefined) as S2C_MissaoEstado;
  }

  private aviso(sid: string, texto: string): void {
    this.send(sid, GAME_MSG.aviso, { texto, tipo: 'erro' });
  }

  /**
   * Mensagem de jogo do cliente (GAME_MSG: criar_personagem, maquina_visual, falar, dialogo_opcao,
   * missao_aceitar, travessia, tutorial_passo). As respostas vão para a caixa de saída.
   */
  onGameMessage(sessionId: string, type: string, raw: unknown): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    try {
      if (type === GAME_MSG.criarPersonagem) {
        this.onCreate(s, raw as C2S_CriarPersonagem);
        return;
      }
      const slot = this.slots.get(s.token);
      const e = slot && slot.sid === sessionId ? this.world.entities.get(slot.entityId) : undefined;
      if (!slot || !e || slot.sandbox) return;
      this.pull(slot);
      const m = isObj(raw) ? raw : {};
      switch (type) {
        case GAME_MSG.maquinaVisual:
          this.onVisual(slot, e, m as unknown as C2S_MaquinaVisual);
          break;
        case GAME_MSG.falar:
          this.onTalk(slot, e, m as C2S_Falar);
          break;
        case GAME_MSG.dialogoOpcao:
          this.onDialogOption(slot, e, m as unknown as C2S_DialogoOpcao);
          break;
        case GAME_MSG.missaoAceitar: {
          const id = (m as unknown as C2S_MissaoAceitar).id;
          const a = acceptMission(slot.rec, typeof id === 'string' ? id : '');
          if (a.ok) this.applyResult(slot, a.resultado);
          else this.aviso(sessionId, a.erro);
          break;
        }
        case GAME_MSG.travessia:
          this.onTravessia(slot, e, m as unknown as C2S_Travessia);
          break;
        case GAME_MSG.tutorialPasso: {
          const t = m as C2S_TutorialPasso;
          if (typeof t.passo === 'string' && STEPS.has(t.passo)) this.gameEvent(slot, { t: 'tutorial', passo: t.passo });
          if (typeof t.controle === 'string' && CONTROLS.has(t.controle)) this.gameEvent(slot, { t: 'control', controle: t.controle });
          break;
        }
        default:
          break;
      }
    } catch (err) {
      this.log(`[core] mensagem ${type} falhou: ${err instanceof Error ? err.stack : String(err)}`);
    } finally {
      this.flushNotify();
    }
  }

  /** Cadastro do Delta: valida nome e aparência, nasce o personagem e manda o welcome. */
  private onCreate(s: Session, msg: C2S_CriarPersonagem): void {
    const rec = s.pending;
    if (!rec) {
      if (this.slots.has(s.token)) this.aviso(s.sid, 'Personagem já cadastrado. Para mudar o visual, use a Máquina de Visual.');
      return;
    }
    const m = isObj(msg) ? msg : ({} as C2S_CriarPersonagem);
    const r = createCharacter(rec, m.name, m.appearance);
    if (!r.ok) {
      this.aviso(s.sid, r.erro);
      this.send(s.sid, GAME_MSG.perfil, profileOf(rec, controlesLiberados(rec)));
      return;
    }
    s.pending = undefined;
    const target = mapForRecord(rec);
    if (target !== this.mapId) {
      // não acontece com os mapas do piloto (criação é no Delta); fica por segurança
      this.records.set(s.token, clone(rec));
      void this.store?.savePlayer({ id: rec.id, token: s.token, name: rec.name, data: clone(rec) });
      this.redirect(s, target, 'registro', s.tokenToSend === true);
      return;
    }
    const slot = this.spawnSlot(s.token, rec, false);
    slot.sid = s.sid;
    s.lastSeq = -1;
    s.inputQ.length = 0;
    s.sent.clear();
    s.gone.clear();
    const wel = this.welcomeOf(slot);
    if (s.tokenToSend) wel.token = s.token;
    s.tokenToSend = undefined;
    this.send(s.sid, MSG.welcome, wel);
    slot.dirty = true;
    slot.notify = true;
    this.applyResult(slot, r.resultado);
  }

  private onVisual(slot: Slot, e: Entity, msg: C2S_MaquinaVisual): void {
    const where = { map: this.world.map, x: e.x, y: e.y };
    const change = isObj(msg.change) ? msg.change : {};
    const id = typeof msg.maquina === 'string' ? msg.maquina : nearVisualMachine(where);
    if (!id) {
      this.aviso(slot.sid!, 'Chegue perto de uma Máquina de Visual.');
      return;
    }
    const chk = applyVisualMachine(slot.rec, change, id, where);
    if (!chk.ok) {
      this.aviso(slot.sid!, chk.erro);
      return;
    }
    this.push(slot);
    slot.dirty = true;
    slot.notify = true;
    this.gameEvent(slot, { t: 'interact', alvo: id, acao: 'usar' });
  }

  /** NPC ao alcance (por entidade ou id de dados) e a conversa. */
  private onTalk(slot: Slot, e: Entity, msg: C2S_Falar): void {
    const q: { entity?: number; npcId?: string } = {};
    if (isInt(msg.entity)) q.entity = msg.entity;
    if (typeof msg.npcId === 'string') q.npcId = msg.npcId;
    if (q.entity === undefined && q.npcId === undefined) return;
    const n = npcInReach(this.world, e, q);
    if (!n) {
      this.aviso(slot.sid!, 'Chegue mais perto para conversar.');
      return;
    }
    this.talk(slot, n.defId);
  }

  private talk(slot: Slot, npcId: string): void {
    this.pull(slot);
    const t = talkTo(slot.rec, npcId);
    slot.lastDialog = t.dialogo;
    this.send(slot.sid, GAME_MSG.dialogo, t.dialogo satisfies S2C_Dialogo);
    this.applyResult(slot, t.resultado);
  }

  private onDialogOption(slot: Slot, e: Entity, msg: C2S_DialogoOpcao): void {
    const npcId = typeof msg.npcId === 'string' ? msg.npcId : '';
    const opcao = typeof msg.opcao === 'string' ? msg.opcao : '';
    if (!npcInReach(this.world, e, { npcId })) {
      this.aviso(slot.sid!, 'Chegue mais perto para conversar.');
      return;
    }
    this.pull(slot);
    const res = dialogOption(slot.rec, npcId, opcao);
    if (!res.ok) {
      this.aviso(slot.sid!, res.erro ?? 'Opção indisponível.');
      return;
    }
    this.applyResult(slot, res.resultado);
    if (opcao === 'tchau') return;
    const base: Dialog = slot.lastDialog && slot.lastDialog.npc === npcId ? slot.lastDialog : { npc: npcId, nome: npcId, contexto: 'opcao', fala: '', opcoes: [] };
    const d: S2C_Dialogo = { ...base, opcoes: dialogOptions(slot.rec, npcId) };
    if (res.abrir) d.abrir = res.abrir;
    slot.lastDialog = { ...base, opcoes: d.opcoes };
    this.send(slot.sid, GAME_MSG.dialogo, d);
    if (res.abrir?.tela === 'travessia') this.send(slot.sid, GAME_MSG.travessiaOpcoes, res.abrir.opcoes);
  }

  /** Perto do Seu Jacó ou da saída do cais. */
  private atCrossing(e: Entity): boolean {
    if (npcInReach(this.world, e, { npcId: 'seu_jaco' })) return true;
    return this.areas.travessia.some((m) => Math.hypot(m.x - e.x, m.y - e.y) <= TRAVESSIA_REACH_TILES);
  }

  /** Travessia: aplica a escolha, grava e manda o jogador para a sala do QG da margem. */
  private onTravessia(slot: Slot, e: Entity, msg: C2S_Travessia): void {
    if (!this.atCrossing(e)) {
      this.aviso(slot.sid!, 'Vá até o cais: o Seu Jacó leva no barco.');
      return;
    }
    this.pull(slot);
    const res = applyTravessia(slot.rec, { side: String(msg.side ?? ''), institution: String(msg.institution ?? ''), guide: String(msg.guide ?? '') });
    if (!res.ok) {
      this.aviso(slot.sid!, res.erro);
      return;
    }
    const sid = slot.sid;
    for (const a of avisosOf(res.resultado)) this.send(sid, GAME_MSG.aviso, a);
    const rec = slot.rec;
    const target = mapForRecord(rec);
    if (sid) this.send(sid, GAME_MSG.perfil, profileOf(rec, controlesLiberados(rec, currentObjectives(rec).map((c) => c.objetivo))));
    if (target === this.mapId) {
      this.push(slot);
      slot.dirty = true;
      slot.notify = true;
      return;
    }
    // o personagem sai deste mapa: grava antes de mandar trocar de sala (a sala da margem lê o Store)
    slot.notify = false;
    const saved = this.persist(slot);
    this.removeSlot(slot);
    const sess = sid ? this.sessions.get(sid) : undefined;
    if (sess) sess.movedTo = target;
    void saved.then(() => {
      if (sid && this.sessions.get(sid)?.movedTo === target) this.send(sid, GAME_MSG.trocarSala, { mapId: target, motivo: 'travessia' } satisfies S2C_TrocarSala);
    });
  }

  /** Eventos da simulação deste tick para as regras (só fora da sandbox). */
  private processGameEvents(events: CombatEvent[], before: Map<number, Entity>): void {
    const byEnt = new Map<number, Slot>();
    for (const s of this.slots.values()) if (!s.sandbox) byEnt.set(s.entityId, s);
    if (byEnt.size === 0) return;
    const w = this.world;
    for (const slot of byEnt.values()) {
      // eventos detectados nas entradas e nos comandos
      if (slot.queued.length > 0) {
        const q = slot.queued;
        slot.queued = [];
        for (const ev of q) this.gameEvent(slot, ev);
      }
      // alvo automático travou num inimigo
      const e = w.entities.get(slot.entityId);
      const tgt = e?.targetId !== undefined ? w.entities.get(e.targetId) : undefined;
      const has = !!tgt && tgt.kind === 'enemy';
      if (has && !slot.hadTarget) this.gameEvent(slot, { t: 'control', controle: 'alvo_automatico' });
      slot.hadTarget = has;
    }
    for (const ev of events) {
      switch (ev.t) {
        case 'xp': {
          const slot = byEnt.get(ev.dst);
          if (!slot) break;
          this.pull(slot);
          this.applyResult(slot, gainXp(slot.rec, ev.amount));
          break;
        }
        case 'level': {
          const slot = byEnt.get(ev.dst);
          if (slot) this.gameEvent(slot, { t: 'level', level: ev.level });
          break;
        }
        case 'cast': {
          const slot = byEnt.get(ev.src);
          const e = slot && w.entities.get(slot.entityId);
          const b = e ? botaoOf(e, ev.ability) : undefined;
          if (!slot || !b) break;
          this.gameEvent(slot, { t: 'ability', botao: b, habilidade: ev.ability });
          this.gameEvent(slot, { t: 'control', controle: controlOfBotao(b) });
          break;
        }
        case 'death': {
          const enemy = w.entities.get(ev.dst) ?? before.get(ev.dst);
          if (!enemy || enemy.kind !== 'enemy') break;
          const parts = killParticipants(w, enemy, ev.by);
          const aoVivo = Math.max(1, parts.filter((p) => p.kind === 'player' && !p.onDuty).length);
          for (const p of parts) {
            const slot = byEnt.get(p.id);
            if (!slot) continue;
            this.gameEvent(slot, { t: 'kill', enemyId: enemy.defId, tier: enemy.tier ?? 'normal' }, { personagens: parts.length, aoVivo });
          }
          break;
        }
        case 'loot_pick': {
          const slot = byEnt.get(ev.by);
          if (!slot) break;
          const l = (w.entities.get(ev.id) ?? before.get(ev.id))?.loot;
          const e = w.entities.get(slot.entityId);
          if (l?.currency) this.gameEvent(slot, { t: 'pickup', chave: 'moeda', quantidade: 1 });
          if (l?.itemId) {
            if (isResource(l.itemId) && e) {
              // material de saque vai para os recursos do registro, não para o inventário
              const i = (e.inventory ?? []).lastIndexOf(l.itemId);
              if (i >= 0) e.inventory!.splice(i, 1);
              this.pull(slot);
              slot.rec.resources[l.itemId] = (slot.rec.resources[l.itemId] ?? 0) + 1;
              slot.dirty = true;
              this.gameEvent(slot, { t: 'pickup', itemId: l.itemId, recurso: l.itemId, quantidade: 1 });
            } else this.gameEvent(slot, { t: 'pickup', itemId: l.itemId, chave: l.itemId, quantidade: 1 });
          }
          if (!l?.currency && !l?.itemId) this.gameEvent(slot, { t: 'pickup', quantidade: 1 });
          this.gameEvent(slot, { t: 'control', controle: 'saque' });
          break;
        }
        case 'revive': {
          const slot = ev.by !== undefined ? byEnt.get(ev.by) : undefined;
          if (slot) this.gameEvent(slot, { t: 'control', controle: 'reanimar' });
          break;
        }
        default:
          break;
      }
    }
  }

  /** Lugares, regiões e marcadores de interação por perto; o Seu Jacó que cai no objetivo de reanimar. */
  private checkAreas(): void {
    const w = this.world;
    for (const slot of this.slots.values()) {
      if (slot.sandbox) continue;
      const e = w.entities.get(slot.entityId);
      if (!e || e.dead) continue;
      // lugar
      let best: string | null = null;
      let bd = Infinity;
      for (const mk of this.areas.places) {
        const d = Math.hypot(mk.x - e.x, mk.y - e.y);
        if (d <= PLACE_RADIUS_TILES && d < bd) {
          bd = d;
          best = mk.ref!;
        }
      }
      if (best === null && slot.place) {
        const cur = slot.place;
        if (this.areas.places.some((mk) => mk.ref === cur && Math.hypot(mk.x - e.x, mk.y - e.y) <= PLACE_LEAVE_RADIUS_TILES)) best = cur;
      }
      if (best !== slot.place) {
        const first = slot.place === undefined;
        slot.place = best;
        if (!first || best !== null) this.gameEvent(slot, { t: 'arrive', placeId: best });
      }
      // região
      const reg = w.map.regions.find((r) => e.x >= r.x && e.x < r.x + r.w && e.y >= r.y && e.y < r.y + r.h)?.regionId;
      if (reg !== slot.region) {
        slot.region = reg;
        if (reg) this.gameEvent(slot, { t: 'arrive', regionId: reg });
      }
      // marcadores de interação (a fila do posto)
      for (const mk of this.areas.interacts) {
        const d = Math.hypot(mk.x - e.x, mk.y - e.y);
        const alvo = mk.params!['interagir'] as string;
        if (d <= INTERACT_MARKER_RADIUS_TILES) {
          if (slot.inside.has(mk.id)) continue;
          slot.inside.add(mk.id);
          this.gameEvent(slot, { t: 'interact', alvo, acao: interactAction(slot.rec, alvo, mk) });
        } else if (d > INTERACT_MARKER_RADIUS_TILES + 1) slot.inside.delete(mk.id);
      }
      // "Seu Jacó caiu! Fique 3 s do lado dele": o Seu Jacó que acompanha cai para o jogador levantar
      if (slot.companionId !== undefined && wantsControl(slot.rec, 'reanimar')) {
        const c = w.entities.get(slot.companionId);
        const cd = msToTicks(JACO_DOWN_COOLDOWN_MS);
        if (c && !c.dead && c.downedUntil === undefined && (slot.jacoDownAt === undefined || w.tick - slot.jacoDownAt >= cd)) {
          c.x = e.x + 1;
          c.y = e.y;
          downEntity(w, c);
          slot.jacoDownAt = w.tick;
        }
      }
    }
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
   * Anda um passo agora com o joystick de `inp` (entrada extra da drenagem). É o mesmo cálculo do
   * movimento do step para o joystick (moveVelocity + stepMovement com a velocidade efetiva), que o
   * cliente também usa na previsão.
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

  /**
   * Um comando: fora da sandbox, tocar num NPC abre a conversa (talkTo, sem trocar a ala) e a troca
   * de arquétipo direta não existe; os controles usados vão para o tutorial e as missões.
   */
  private runCommand(s: Session, e: Entity, c: PlayerCommand): void {
    const slot = this.slots.get(s.token);
    const rules = slot && !slot.sandbox ? slot : undefined;
    if (rules) {
      if (c.c === 'trocar_arquetipo') return;
      if (c.c === 'interagir') {
        const n = npcInReach(this.world, e, { entity: c.entity });
        if (n) this.talk(rules, n.defId);
        return;
      }
    }
    applyCommand(this.world, e, c, { rewindTicks: this.rewindTicks(s) });
    if (!rules) return;
    if (c.c === 'ir_ate') rules.queued.push({ t: 'control', controle: 'tocar_no_chao' });
    else if (c.c === 'alvo') rules.queued.push({ t: 'control', controle: 'trocar_alvo' });
    else if (c.c === 'auto' && c.on) rules.queued.push({ t: 'control', controle: 'modo_automatico' });
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
        this.runCommand(s, e, h.c);
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
    // joystick apertado agora (tutorial: andar_joystick)
    const slot = this.slots.get(s.token);
    if (slot && !slot.sandbox && inp) {
      const down = inp.mx !== 0 || inp.my !== 0;
      if (down && !slot.stickDown) slot.queued.push({ t: 'control', controle: 'andar_joystick' });
      slot.stickDown = down;
    }
  }

  // -------------------------------------------------------------------------
  // Tick

  /** Um tick do servidor: entradas, simulação, regras, mundo e um snapshot por cliente conectado. */
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
    // 2. posições antes do passo (eventos de quem sai do mundo neste tick) e as entidades (saque e
    // inimigo que saem do mundo no step ainda servem para as regras)
    this.prevPos.clear();
    const before = new Map<number, Entity>();
    for (const e of w.entities.values()) {
      this.prevPos.set(e.id, [e.x, e.y]);
      if (e.kind === 'loot' || e.kind === 'enemy') before.set(e.id, e);
    }
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
    // 4. regras de jogo (Fase 2)
    if (!this.sandbox) {
      try {
        this.processGameEvents(events, before);
        if (w.tick % AREA_CHECK_TICKS === 0) this.checkAreas();
      } catch (err) {
        this.log(`[core] regras falharam: ${err instanceof Error ? err.stack : String(err)}`);
      }
    }
    // 5. mundo: renascimento, quem caiu da conexão, gravação
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
        slot.dirty = true;
      } else if (w.tick % saveTicks === 0) slot.dirty = true;
    }
    this.flushNotify();
    // 6. snapshots
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
      const lk = lookOf(e, rec?.appearance);
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
    const me = slot && slot.sid === s.sid ? w.entities.get(slot.entityId) : undefined;
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

  stats(): { mapId: string; sandbox: boolean; tick: number; players: number; online: number; entities: number } {
    let online = 0;
    for (const s of this.sessions.values()) if (s.connected) online++;
    return { mapId: this.mapId, sandbox: this.sandbox, tick: this.world.tick, players: this.slots.size, online, entities: this.world.entities.size };
  }
}
