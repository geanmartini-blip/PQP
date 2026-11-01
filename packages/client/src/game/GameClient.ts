/**
 * Cliente de jogo sem interface (sem Phaser): rede, previsão, fila de comandos e estado do mundo.
 * As cenas leem daqui e chamam os métodos de ação (andar, tocar, botões). Testável no Node com o
 * LocalTransport e o LaggedTransport.
 *
 * A cada passo fixo de 50 ms: cria a PlayerInput (seq), anda na previsão e manda C2S_Input com as
 * 3 últimas entradas e todos os comandos sem ack. A cada snapshot: reconcilia, confirma comandos e
 * guarda o estado para o desenho.
 */
import { getData } from '@pqp/shared';
import { circleFree, findPath, getMap, hasMap, type TileMap } from '@pqp/shared/map';
import {
  dequantize,
  MSG,
  type C2S_Hello,
  type C2S_Input,
  type EntSnap,
  type S2C_Pong,
  type S2C_Snapshot,
  type S2C_Welcome,
} from '@pqp/shared/net';
import { SIM_TUNING, type CombatEvent, type PlayerCommand, type PlayerInput, type Vec } from '@pqp/shared/sim';
import { CommandQueue, type CommandBody } from '../net/commandQueue';
import { FixedStep } from '../net/fixedStep';
import { actionTick, ServerClock, type Sample } from '../net/interpolation';
import { makeInput, Predictor, TELEPORT_ERROR_TILES } from '../net/prediction';
import { RttMeter } from '../net/rtt';
import type { NetStatus, Transport } from '../net/transport';
import { ClientWorld, FL } from './clientWorld';

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export const TOKEN_KEY = 'pqp_token';
// SUGESTÃO: ping a cada 1 s; pedido de info a cada 0,3 s no máximo.
export const PING_EVERY_MS = 1000;
export const NEED_EVERY_MS = 300;
// SUGESTÃO: a escolha de alvo por toque aparece na hora e vale por RTT + 300 ms até o servidor confirmar.
export const LOCAL_TARGET_GRACE_MS = 300;
// SUGESTÃO: ir até um NPC para falar desiste depois de 8 s.
export const PENDING_INTERACT_MS = 8000;
// SUGESTÃO: o próprio boneco movido só pelo servidor (avanço, automático, empurrão) é desenhado pelo
// buffer de snapshots 50 ms atrás do último, e a troca entre previsão e snapshots se mistura em ~100 ms.
export const SELF_INTERP_DELAY_MS = 50;
export const SELF_BLEND_TAU_MS = 35;

/** Tenta ler/gravar no armazenamento sem quebrar (aba privada, armazenamento bloqueado). */
export function safeGet(s: StorageLike | undefined, k: string): string | null {
  try {
    return s ? s.getItem(k) : null;
  } catch {
    return null;
  }
}
export function safeSet(s: StorageLike | undefined, k: string, v: string): void {
  try {
    s?.setItem(k, v);
  } catch {
    // sem armazenamento: o token vale só nesta aba
  }
}

/** Token de convidado aleatório (fora da simulação, Math.random é permitido). */
export function newGuestToken(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return 'g_' + c.randomUUID().replace(/-/g, '');
  let s = 'g_';
  for (let i = 0; i < 24; i++) s += Math.floor(Math.random() * 36).toString(36);
  return s;
}

/** Posição livre mais perto (a posição quantizada do snapshot pode encostar 0,005 tile na parede). */
export function unstick(map: TileMap, x: number, y: number, r: number): Vec {
  if (circleFree(map, x, y, r)) return { x, y };
  for (const d of [0.006, 0.012, 0.025]) {
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const nx = x + Math.cos(a) * d, ny = y + Math.sin(a) * d;
      if (circleFree(map, nx, ny, r)) return { x: nx, y: ny };
    }
  }
  return { x, y };
}

export interface Notice {
  text: string;
  at: number;
}

export interface GameClientOpts {
  name?: string;
  archetypeId?: string;
  storage?: StorageLike;
  /** relógio local em ms (padrão: o tempo do último quadro) */
  now?: () => number;
  /** mapa por id fora do registro (testes, servidor local) */
  resolveMap?: (id: string) => TileMap | undefined;
}

export class GameClient {
  readonly world = new ClientWorld();
  readonly clock = new ServerClock();
  readonly rtt = new RttMeter();
  readonly cmds = new CommandQueue();
  readonly fixed = new FixedStep();
  pred: Predictor | null = null;
  map: TileMap | null = null;
  status: NetStatus = 'desconectado';
  statusInfo = '';
  welcomed = false;
  token: string;
  /** joystick ou teclado (-1..1), lido a cada passo */
  readonly intent: Vec = { x: 0, y: 0 };
  readonly notices: Notice[] = [];
  /** quantas mensagens de entrada e snapshots passaram (diagnóstico) */
  readonly stats = { inputsSent: 0, snapsIn: 0, welcomes: 0 };

  private seq = 0;
  private lastInputs: PlayerInput[] = [];
  private lastPing = -Infinity;
  private lastNeed = -Infinity;
  private now = 0;
  private localTarget: { id: number; until: number } | undefined;
  private pendingInteract: { id: number; until: number } | undefined;
  private welcomeListeners: (() => void)[] = [];
  private eventsOut: CombatEvent[] = [];
  /** desenho do próprio boneco: previsão ou snapshots (servidor movendo sozinho) */
  private selfMode: 'pred' | 'snap' = 'pred';
  private readonly blend = { x: 0, y: 0 };
  private readonly lastDrawn = { x: 0, y: 0, ok: false };
  private selfSnapT = -Infinity;
  private readonly selfSample: Sample = { t: 0, x: 0, y: 0 };
  /** quantas vezes a mesma sessão voltou depois de uma queda (diagnóstico e testes) */
  resumes = 0;

  constructor(
    readonly transport: Transport,
    private readonly opts: GameClientOpts = {},
  ) {
    const saved = safeGet(opts.storage, TOKEN_KEY);
    this.token = saved && saved.length > 4 ? saved : newGuestToken();
    if (!saved) safeSet(opts.storage, TOKEN_KEY, this.token);
    transport.onMessage = (t, m) => this.onMessage(t, m);
    transport.onStatus = (s, info) => {
      this.status = s;
      this.statusInfo = info ?? '';
    };
    transport.onOpen = (fresh) => {
      if (fresh) this.sendHello();
      else this.onResume();
    };
  }

  /**
   * A mesma sessão voltou depois da queda: as entradas guardadas não chegaram (o servidor zerou a
   * fila e pôs o personagem no automático), então a previsão recomeça do próximo snapshot.
   */
  private onResume(): void {
    this.resumes++;
    this.lastInputs = [];
    this.pred?.clearHistory();
  }

  /** Conectado de verdade (fora da queda): só assim a previsão anda e as entradas saem. */
  get live(): boolean {
    return this.status === 'conectado';
  }

  /** Opções do joinOrCreate (o servidor também recebe o token aqui). */
  joinOptions(): Record<string, unknown> {
    return { token: this.token, ...(this.opts.name ? { name: this.opts.name } : {}), ...(this.opts.archetypeId ? { archetypeId: this.opts.archetypeId } : {}) };
  }

  connect(): void {
    this.transport.connect();
  }

  onWelcome(fn: () => void): void {
    this.welcomeListeners.push(fn);
  }

  private sendHello(): void {
    const h: C2S_Hello = { token: this.token };
    if (this.opts.name) h.name = this.opts.name;
    if (this.opts.archetypeId) h.archetypeId = this.opts.archetypeId;
    this.transport.send(MSG.hello, h);
  }

  // ---------------------------------------------------------------------------
  // mensagens do servidor

  private onMessage(type: string, msg: unknown): void {
    // mensagens do WebSocket chegam fora do quadro: hora de chegada pelo relógio de verdade
    if (this.opts.now) this.now = this.opts.now();
    switch (type) {
      case MSG.welcome:
        this.onWelcomeMsg(msg as S2C_Welcome & { token?: string });
        break;
      case MSG.snap:
        this.onSnap(msg as S2C_Snapshot);
        break;
      case MSG.pong: {
        const p = msg as S2C_Pong;
        if (typeof p?.t === 'number') this.rtt.onPong(p.t, this.now);
        break;
      }
      case MSG.info: {
        const m = msg as { ents?: EntSnap[] } | EntSnap[];
        const list = Array.isArray(m) ? m : (m?.ents ?? []);
        this.world.applyInfo(list);
        break;
      }
      case MSG.notice:
      case MSG.chat: {
        const text = typeof msg === 'string' ? msg : String((msg as { text?: unknown })?.text ?? '');
        if (text) this.pushNotice(text);
        break;
      }
    }
  }

  pushNotice(text: string): void {
    this.notices.push({ text, at: this.now });
    if (this.notices.length > 6) this.notices.shift();
  }

  private onWelcomeMsg(w: S2C_Welcome & { token?: string }): void {
    // o token do servidor tem precedência sobre o do aparelho
    if (typeof w.token === 'string' && w.token.length > 0 && w.token !== this.token) {
      this.token = w.token;
      safeSet(this.opts.storage, TOKEN_KEY, w.token);
    }
    const map = this.opts.resolveMap?.(w.mapId) ?? (hasMap(w.mapId) ? getMap(w.mapId) : undefined);
    if (!map) {
      this.status = 'desconectado';
      this.statusInfo = `mapa desconhecido: ${w.mapId}`;
      return;
    }
    this.world.applyWelcome(w);
    this.map = map;
    this.pred = new Predictor(this.map);
    this.clock.reset();
    this.cmds.clear();
    this.lastInputs = [];
    this.localTarget = undefined;
    this.pendingInteract = undefined;
    this.selfMode = 'pred';
    this.blend.x = this.blend.y = 0;
    this.lastDrawn.ok = false;
    this.selfSnapT = -Infinity;
    this.welcomed = true;
    this.stats.welcomes++;
    for (const fn of this.welcomeListeners) fn();
  }

  private onSnap(s: S2C_Snapshot): void {
    if (!this.welcomed || !this.world.applySnapshot(s)) return;
    this.stats.snapsIn++;
    this.clock.onSnapshot(s.t, this.now);
    this.cmds.ack(s.cack);
    for (const ev of s.ev ?? []) this.eventsOut.push(ev);
    const me = s.ents.find((e) => e.i === this.world.you);
    if (me && this.pred && this.map) {
      const p = unstick(this.map, dequantize(me.x), dequantize(me.y), this.pred.radius);
      this.pred.reconcile(p.x, p.y, s.ack, s.hud.mv, s.hud.canMove);
    }
  }

  // ---------------------------------------------------------------------------
  // laço

  /** Chamar a cada quadro com o tempo do quadro e o relógio local (ms). */
  update(dtMs: number, now: number): void {
    this.now = now;
    this.transport.pump?.(now);
    const n = this.fixed.advance(dtMs);
    for (let i = 0; i < n; i++) this.fixedTick();
    if (this.welcomed) {
      if (now - this.lastPing >= PING_EVERY_MS) {
        this.lastPing = now;
        this.transport.send(MSG.ping, { t: now });
      }
      if (this.world.unknown.size > 0 && now - this.lastNeed >= NEED_EVERY_MS) {
        this.lastNeed = now;
        const ids = this.world.needList();
        if (ids.length > 0) this.transport.send(MSG.need, { ids });
      }
      this.tickPendingInteract();
    }
    this.pred?.decay(dtMs);
    if (this.blend.x !== 0 || this.blend.y !== 0) {
      const k = Math.exp(-Math.max(0, dtMs) / SELF_BLEND_TAU_MS);
      this.blend.x *= k;
      this.blend.y *= k;
      if (Math.abs(this.blend.x) < 1e-4 && Math.abs(this.blend.y) < 1e-4) this.blend.x = this.blend.y = 0;
    }
  }

  private fixedTick(): void {
    if (!this.welcomed || !this.pred) return;
    // conexão caída: as entradas não chegariam (o servidor põe o personagem no automático); o
    // boneco fica parado em vez de andar "de mentira" e teletransportar na volta
    if (!this.live) {
      this.pred.hold();
      return;
    }
    const input = makeInput(++this.seq, this.intent.x, this.intent.y);
    this.pred.step(input);
    if (Math.hypot(this.intent.x, this.intent.y) >= SIM_TUNING.JOYSTICK_DEADZONE) this.pendingInteract = undefined;
    this.lastInputs.push(input);
    if (this.lastInputs.length > 3) this.lastInputs.shift();
    const msg: C2S_Input = { inputs: this.lastInputs.slice(), cmds: this.cmds.list().slice(), ackTick: Math.max(0, this.world.tick), rtt: this.rtt.rounded };
    this.transport.send(MSG.input, msg);
    this.stats.inputsSent++;
  }

  /** Eventos de combate novos (para números, faíscas e falas). */
  drainEvents(out: CombatEvent[] = []): CombatEvent[] {
    for (const e of this.eventsOut) out.push(e);
    this.eventsOut.length = 0;
    this.world.drainEvents();
    return out;
  }

  /**
   * Quem anda com o próprio boneco agora é só o servidor (avanço até o alcance, modo automático,
   * empurrão): ele se move, sem joystick, sem caminho próprio e sem entrada local sem ack que ande.
   */
  get serverDriven(): boolean {
    const p = this.pred;
    const me = this.world.self();
    if (!p || !me || (me.fl & FL.movendo) === 0) return false;
    if (Math.hypot(this.intent.x, this.intent.y) >= SIM_TUNING.JOYSTICK_DEADZONE) return false;
    return !p.following && !p.hasPendingMotion && me.buf.length > 0;
  }

  /**
   * Posição desenhada do próprio personagem (tiles). Normalmente a prevista; quando o servidor move
   * o boneco sozinho, pelo buffer de snapshots (como os outros, com atraso menor), para não andar
   * em pulsos de 20 Hz. A troca de um para o outro se mistura aos poucos.
   */
  selfRender(out: Vec): Vec | null {
    const p = this.pred;
    if (!p || !p.initialized) return null;
    const snap = this.serverDriven;
    let x: number, y: number;
    if (snap) {
      let t = this.clock.serverNow(this.now) - SELF_INTERP_DELAY_MS;
      // nunca volta no tempo (salvo um relógio refeito, mais de 1 s para trás)
      if (t < this.selfSnapT && t > this.selfSnapT - 1000) t = this.selfSnapT;
      this.selfSnapT = t;
      this.world.self()!.buf.sample(t, this.selfSample);
      x = this.selfSample.x;
      y = this.selfSample.y;
    } else {
      p.render(this.fixed.alpha, out);
      x = out.x;
      y = out.y;
    }
    const mode = snap ? 'snap' : 'pred';
    if (mode !== this.selfMode) {
      this.selfMode = mode;
      if (this.lastDrawn.ok) {
        this.blend.x = this.lastDrawn.x - x;
        this.blend.y = this.lastDrawn.y - y;
        // salto grande (volta ao QG) não se mistura
        if (Math.hypot(this.blend.x, this.blend.y) > TELEPORT_ERROR_TILES) this.blend.x = this.blend.y = 0;
      }
    }
    out.x = x + this.blend.x;
    out.y = y + this.blend.y;
    this.lastDrawn.x = out.x;
    this.lastDrawn.y = out.y;
    this.lastDrawn.ok = true;
    return out;
  }

  /** Tick do servidor (fracionário) em que uma entrada feita agora anda: o tempo dos avisos no chão. */
  actionTickNow(): number {
    return actionTick(this.clock.serverNow(this.now), this.rtt.value);
  }

  /** Alvo atual: o escolhido por toque (enquanto o servidor não confirma) ou o do HUD. */
  currentTarget(): number | undefined {
    const lt = this.localTarget;
    if (lt && this.now < lt.until) {
      if (this.world.hud?.target === lt.id) this.localTarget = undefined;
      return lt.id;
    }
    this.localTarget = undefined;
    return this.world.hud?.target;
  }

  // ---------------------------------------------------------------------------
  // ações

  command(body: CommandBody): PlayerCommand | undefined {
    if (!this.welcomed) return undefined;
    return this.cmds.push(body);
  }

  /** Tocar no chão: caminho do A* (o mesmo do servidor) e comando ir_ate. Devolve o destino. */
  goTo(x: number, y: number): Vec | null {
    if (!this.pred || !this.map || !this.pred.initialized) return null;
    const from = { x: this.pred.x, y: this.pred.y };
    const path = findPath(this.map, from, { x, y }, this.pred.radius);
    if (!path || path.length === 0) return null;
    const dest = path[path.length - 1]!;
    this.command({ c: 'ir_ate', x: dest.x, y: dest.y });
    this.pred.setPath(path, dest);
    this.pendingInteract = undefined;
    return dest;
  }

  /** Tocar num inimigo: troca o alvo (o servidor confere com a posição que você via). */
  tapTarget(x: number, y: number, entityId?: number): void {
    this.command({ c: 'alvo', x, y });
    if (entityId !== undefined) this.localTarget = { id: entityId, until: this.now + this.rtt.value + LOCAL_TARGET_GRACE_MS };
  }

  /** Botão de habilidade; devolve o comando (o id serve para a recarga prevista no HUD). */
  useAbility(botao: 1 | 2 | 3 | 'especial', at?: Vec): PlayerCommand | undefined {
    return this.command(at ? { c: 'habilidade', botao, at: { x: at.x, y: at.y } } : { c: 'habilidade', botao });
  }

  useItem(): void {
    this.command({ c: 'item' });
  }

  setAuto(on: boolean): void {
    this.command({ c: 'auto', on });
  }

  switchArchetype(archetypeId: string): void {
    if (getData().archetypesById.has(archetypeId)) this.command({ c: 'trocar_arquetipo', archetypeId });
  }

  /** Falar com um NPC: perto, fala na hora; longe, anda até ele e fala ao chegar. */
  interact(entityId: number): boolean {
    const e = this.world.ents.get(entityId);
    if (!e || !this.pred) return false;
    if (this.inTalkRange(e.x, e.y)) {
      this.command({ c: 'interagir', entity: entityId });
      return true;
    }
    if (this.goTo(e.x, e.y + 0.8) || this.goTo(e.x, e.y)) {
      this.pendingInteract = { id: entityId, until: this.now + PENDING_INTERACT_MS };
      return true;
    }
    return false;
  }

  /** Perto o bastante para conversar (raio do comando interagir, com folga de 0,2 tile). */
  inTalkRange(x: number, y: number): boolean {
    if (!this.pred) return false;
    const reach = SIM_TUNING.INTERACT_RADIUS + SIM_TUNING.NPC_RADIUS + this.pred.radius - 0.2;
    return Math.hypot(x - this.pred.x, y - this.pred.y) <= reach;
  }

  private tickPendingInteract(): void {
    const p = this.pendingInteract;
    if (!p) return;
    const e = this.world.ents.get(p.id);
    if (!e || this.now > p.until) {
      this.pendingInteract = undefined;
      return;
    }
    if (this.inTalkRange(e.x, e.y)) {
      this.pendingInteract = undefined;
      this.command({ c: 'interagir', entity: p.id });
    }
  }

  close(): void {
    this.transport.close();
  }
}
