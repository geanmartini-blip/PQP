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
import { boatRoomMap, circleFree, findPath, getMap, hasMap, isBoatRoom, type TileMap } from '@pqp/shared/map';
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
import { GameState } from './gameState';
import { dungeonMapFor } from './dungeonMap';
import {
  GAME_MSG,
  type C2S_CriarPersonagem,
  type C2S_DialogoOpcao,
  type C2S_Falar,
  type C2S_MaquinaVisual,
  type C2S_MissaoAceitar,
  type C2S_Travessia,
  type C2S_TutorialPasso,
  type C2S_EscolherAla,
  type C2S_EscolherTalento,
  type C2S_TrocarSlot3,
  type C2S_Instituicao,
  type C2S_MissaoPagar,
  type C2S_Emote,
  type S2C_TrocarSala,
  type C2S_LojaComprar,
  type C2S_LojaVender,
  type C2S_MercadoListar,
  type C2S_FeiraAnunciar,
  type C2S_AppAnunciar,
  type C2S_MercadoComprar,
  type C2S_MercadoCancelar,
  type C2S_CambioCotar,
  type C2S_CambioTrocar,
  type C2S_CasaVisitar,
  type C2S_CasaComprarMovel,
  type C2S_CasaColocar,
  type C2S_CasaMover,
  type C2S_CasaMovel,
  type C2S_CasaVisitas,
  type C2S_CasaAlugar,
  type C2S_CasaAvancarFila,
  type C2S_Equipar,
  type C2S_Desequipar,
  type C2S_Melhorar,
  type C2S_FiltroRaridade,
  type C2S_DoutrinaDefinir,
  type C2S_Plantonista,
  type C2S_PlantaoDefinir,
  type C2S_MasmorraEntrar,
  type C2S_MasmorraEscolha,
} from '@pqp/shared/net';
import type { Bem, MercadoId, Moeda, PermissaoVisita, Rotacao } from '@pqp/shared/game/index';

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
  /** Fase 2: perfil, missões, diálogo e telas pedidas pelo servidor */
  readonly game = new GameState();
  /** controles do tutorial já avisados ao servidor nesta sessão */
  private sentControls = new Set<string>();
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
  /** Fase 3: sala (mapa) pedida no joinOrCreate depois de um 'trocar_sala' */
  roomMapId: string | undefined;
  /** troca de mapa em andamento (a tela de transição fica até o welcome do mapa novo) */
  mapChange: { to: string; at: number } | null = null;

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
    return {
      token: this.token,
      ...(this.opts.name ? { name: this.opts.name } : {}),
      ...(this.opts.archetypeId ? { archetypeId: this.opts.archetypeId } : {}),
      ...(this.roomMapId ? { mapId: this.roomMapId } : {}),
    };
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
      case GAME_MSG.trocarSala:
        this.onRoomChange(msg as S2C_TrocarSala);
        break;
      default:
        this.game.onMessage(type, msg, this.now);
    }
  }

  /**
   * 'trocar_sala' do servidor online (Fase 2/3): guarda o token, pede a sala do mapa novo e entra
   * de novo; o hello sai no onOpen(true). Sem rejoin (servidor local), o welcome novo já vem.
   */
  private onRoomChange(m: S2C_TrocarSala): void {
    if (!m || typeof m.mapId !== 'string') return;
    if (typeof m.token === 'string' && m.token.length > 4 && m.token !== this.token) {
      this.token = m.token;
      safeSet(this.opts.storage, TOKEN_KEY, m.token);
    }
    this.roomMapId = m.mapId;
    this.mapChange = { to: m.mapId, at: this.now };
    this.game.onMessage(GAME_MSG.trocarSala, m, this.now);
    if (this.transport.rejoin) {
      this.welcomed = false;
      this.transport.rejoin();
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
    // Fase 5: andar de masmorra (mapa gerado pela semente da run de 'masmorra_info')
    // travessia: o barco do Seu Jacó ('barco:<id>') é o mapa barco_travessia com o id da sala
    const map =
      this.opts.resolveMap?.(w.mapId) ?? (hasMap(w.mapId) ? getMap(w.mapId) : isBoatRoom(w.mapId) ? boatRoomMap(w.mapId) : dungeonMapFor(w.mapId, this.game.dungeon));
    if (!isBoatRoom(w.mapId)) this.game.boat = null;
    if (!map) {
      this.status = 'desconectado';
      this.statusInfo = `mapa desconhecido: ${w.mapId}`;
      return;
    }
    // mapa diferente do anterior: a tela de transição mostra o nome do lugar
    if (this.welcomed && this.world.mapId && this.world.mapId !== w.mapId) this.mapChange = { to: w.mapId, at: this.now };
    else if (this.mapChange && this.mapChange.to !== w.mapId) this.mapChange = { to: w.mapId, at: this.now };
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
    for (const ev of s.ev ?? []) {
      this.eventsOut.push(ev);
      // o "+N XP" do quadro do jogador vale também no protótipo (sem perfil)
      if (ev.t === 'xp' && ev.dst === this.world.you) this.game.onXp(ev.amount, this.now);
    }
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
      this.talkNow(entityId);
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
      this.talkNow(p.id);
    }
  }

  // ---------------------------------------------------------------------------
  // Fase 2: criação, Máquina de Visual, diálogo, missões, tutorial e travessia

  /**
   * Conversa pelas regras da Fase 2 (mensagem 'falar' e caixa de diálogo) quando o servidor manda
   * perfil; no modo de teste (?ala=) e no protótipo, o comando 'interagir' da simulação (fala solta
   * e troca de ala com Wesley e Li Wei).
   */
  get dialogMode(): boolean {
    return this.game.active && !this.opts.archetypeId;
  }

  private talkNow(entityId: number): void {
    if (this.dialogMode) {
      const e = this.world.ents.get(entityId);
      const m: C2S_Falar = { entity: entityId, ...(e?.defId ? { npcId: e.defId } : {}) };
      this.sendGame(GAME_MSG.falar, m);
    } else this.command({ c: 'interagir', entity: entityId });
  }

  /** Mensagem da Fase 2 (vai pelo mesmo canal; nunca se perde na rede simulada). */
  sendGame(type: string, msg: unknown): boolean {
    if (!this.welcomed) return false;
    this.transport.send(type, msg);
    return true;
  }

  createCharacter(name: string, appearance: C2S_CriarPersonagem['appearance']): boolean {
    const m: C2S_CriarPersonagem = { name, appearance };
    return this.sendGame(GAME_MSG.criarPersonagem, m);
  }

  visualMachine(change: C2S_MaquinaVisual['change'], maquina?: string): boolean {
    const m: C2S_MaquinaVisual = { change, ...(maquina ? { maquina } : {}) };
    return this.sendGame(GAME_MSG.maquinaVisual, m);
  }

  dialogOption(npcId: string, opcao: string): boolean {
    const m: C2S_DialogoOpcao = { npcId, opcao };
    return this.sendGame(GAME_MSG.dialogoOpcao, m);
  }

  acceptMission(id: string): boolean {
    const m: C2S_MissaoAceitar = { id };
    return this.sendGame(GAME_MSG.missaoAceitar, m);
  }

  crossRiver(side: string, institution: string, guide: string): boolean {
    const m: C2S_Travessia = { side, institution, guide };
    return this.sendGame(GAME_MSG.travessia, m);
  }

  /**
   * Controle do tutorial usado aqui no cliente (andar com o joystick, tocar no chão, auto-caminho,
   * trocar o alvo...). Cada um vai uma vez por sessão e só se o perfil ainda não tiver.
   */
  tutorialControl(controle: string, passo?: string): void {
    if (!this.game.active || this.sentControls.has(controle) || this.game.usedControl(controle)) return;
    this.sentControls.add(controle);
    this.game.localSteps.add('c:' + controle);
    if (passo) this.game.localSteps.add(passo);
    const m: C2S_TutorialPasso = { controle, ...(passo ? { passo } : {}) };
    this.sendGame(GAME_MSG.tutorialPasso, m);
  }

  /**
   * Auto-caminho até o alvo da missão (tocar no rastreador ou na seta): NPC visível anda e fala;
   * o resto vai pelo A* até o ponto. Devolve true se achou caminho.
   */
  autoPath(): boolean {
    const alvo = this.game.missions?.alvo;
    if (!alvo || !this.map || alvo.mapa !== this.world.mapId) return false;
    this.tutorialControl('auto_caminho', 'botao');
    if (alvo.npc) {
      let best: number | undefined;
      let bd = Infinity;
      const me = this.pred;
      for (const e of this.world.ents.values()) {
        if (e.kind !== 'n' || e.defId !== alvo.npc) continue;
        const d = me ? Math.hypot(e.x - me.x, e.y - me.y) : 0;
        if (d < bd) {
          bd = d;
          best = e.id;
        }
      }
      if (best !== undefined && this.interact(best)) return true;
    }
    if (alvo.x === undefined || alvo.y === undefined) return false;
    return this.goTo(alvo.x, alvo.y) !== null || this.goTo(alvo.x, alvo.y + 0.8) !== null;
  }

  // ---------------------------------------------------------------------------
  // Fase 3: ala, talentos, botão 3, instituição, emote e guia

  /** Pede as opções de ala, talentos pendentes e botões (resposta: game.progress). */
  requestProgress(): boolean {
    return this.sendGame(GAME_MSG.progressoOpcoes, {});
  }

  chooseArchetype(archetype: string): boolean {
    const m: C2S_EscolherAla = { archetype };
    return this.sendGame(GAME_MSG.escolherAla, m);
  }

  pickTalent(talent: string): boolean {
    const m: C2S_EscolherTalento = { talent };
    return this.sendGame(GAME_MSG.escolherTalento, m);
  }

  setSlot3(ability: string): boolean {
    const m: C2S_TrocarSlot3 = { ability };
    return this.sendGame(GAME_MSG.trocarSlot3, m);
  }

  /** Pede a tela da instituição (sem id: a do jogador). Resposta: game.institution. */
  requestInstitution(id?: string): boolean {
    const m: C2S_Instituicao = id ? { id } : {};
    return this.sendGame(GAME_MSG.instituicao, m);
  }

  payMission(missao?: string): boolean {
    const m: C2S_MissaoPagar = missao ? { missao } : {};
    return this.sendGame(GAME_MSG.missaoPagar, m);
  }

  emote(emote: string): boolean {
    const m: C2S_Emote = { emote };
    return this.sendGame(GAME_MSG.emote, m);
  }

  /** Conversa com o próprio guia (espírito ou IA de bolso): ele está sempre junto. */
  talkToGuide(): boolean {
    const m: C2S_Falar = { npcId: 'guia' };
    return this.sendGame(GAME_MSG.falar, m);
  }

  // ---------------------------------------------------------------------------
  // Fase 4: carteira, loja, feira, app, câmbio e casa (respostas: game.wallet, market, exchange, house, econ)

  requestWallet(): boolean {
    return this.sendGame(GAME_MSG.carteiraPedir, {});
  }

  payDebt(): boolean {
    return this.sendGame(GAME_MSG.dividaPagar, {});
  }

  shopBuy(loja: string, item: string, moeda?: Moeda): boolean {
    const m: C2S_LojaComprar = { loja, item, ...(moeda ? { moeda } : {}) };
    return this.sendGame(GAME_MSG.lojaComprar, m);
  }

  shopSell(loja: string, item: string, moeda?: Moeda): boolean {
    const m: C2S_LojaVender = { loja, item, ...(moeda ? { moeda } : {}) };
    return this.sendGame(GAME_MSG.lojaVender, m);
  }

  listMarket(mercado: MercadoId): boolean {
    const m: C2S_MercadoListar = { mercado };
    return this.sendGame(GAME_MSG.mercadoListar, m);
  }

  /** Anuncia na feira (Semente; item da tabela usa o preço da tabela) ou no app (Crédito). */
  announce(mercado: MercadoId, bem: Bem, preco: number): boolean {
    if (mercado === 'feira') {
      const m: C2S_FeiraAnunciar = { bem, preco };
      return this.sendGame(GAME_MSG.feiraAnunciar, m);
    }
    const m: C2S_AppAnunciar = { bem, preco };
    return this.sendGame(GAME_MSG.appAnunciar, m);
  }

  buyListing(mercado: MercadoId, anuncio: string): boolean {
    const m: C2S_MercadoComprar = { anuncio };
    return this.sendGame(mercado === 'feira' ? GAME_MSG.feiraComprar : GAME_MSG.appComprar, m);
  }

  cancelListing(anuncio: string): boolean {
    const m: C2S_MercadoCancelar = { anuncio };
    return this.sendGame(GAME_MSG.mercadoCancelar, m);
  }

  /** Retira as compras prontas da fila da feira. */
  pickUpFair(): boolean {
    return this.sendGame(GAME_MSG.feiraRetirar, {});
  }

  /** Recebe vendas, trocas e itens de anúncios vencidos. */
  collectMarket(): boolean {
    return this.sendGame(GAME_MSG.mercadoReceber, {});
  }

  quoteExchange(de?: Moeda, quantidade?: number): boolean {
    const m: C2S_CambioCotar = { ...(de ? { de } : {}), ...(quantidade !== undefined ? { quantidade } : {}) };
    return this.sendGame(GAME_MSG.cambioCotar, m);
  }

  exchangeMoney(de: Moeda, quantidade: number): boolean {
    const m: C2S_CambioTrocar = { de, quantidade };
    return this.sendGame(GAME_MSG.cambioTrocar, m);
  }

  requestHouse(): boolean {
    return this.sendGame(GAME_MSG.casaVer, {});
  }

  visitHouse(playerId: string): boolean {
    const m: C2S_CasaVisitar = { playerId };
    return this.sendGame(GAME_MSG.casaVisitar, m);
  }

  buyFurniture(movel: string, moeda?: Moeda): boolean {
    const m: C2S_CasaComprarMovel = { movel, ...(moeda ? { moeda } : {}) };
    return this.sendGame(GAME_MSG.casaComprarMovel, m);
  }

  placeFurniture(movel: string, x: number, y: number, rot?: Rotacao): boolean {
    const m: C2S_CasaColocar = { movel, x, y, ...(rot !== undefined ? { rot } : {}) };
    return this.sendGame(GAME_MSG.casaColocar, m);
  }

  moveFurniture(uid: number, x: number, y: number, rot?: Rotacao): boolean {
    const m: C2S_CasaMover = { uid, x, y, ...(rot !== undefined ? { rot } : {}) };
    return this.sendGame(GAME_MSG.casaMover, m);
  }

  rotateFurniture(uid: number): boolean {
    const m: C2S_CasaMovel = { uid };
    return this.sendGame(GAME_MSG.casaGirar, m);
  }

  removeFurniture(uid: number): boolean {
    const m: C2S_CasaMovel = { uid };
    return this.sendGame(GAME_MSG.casaTirar, m);
  }

  setVisits(permissao: PermissaoVisita): boolean {
    const m: C2S_CasaVisitas = { permissao };
    return this.sendGame(GAME_MSG.casaVisitas, m);
  }

  rentCapsule(tipo?: string): boolean {
    const m: C2S_CasaAlugar = tipo ? { tipo } : {};
    return this.sendGame(GAME_MSG.casaAlugar, m);
  }

  joinWaitingList(): boolean {
    return this.sendGame(GAME_MSG.casaListaEspera, {});
  }

  /** Atalho de teste (o servidor só aceita no modo de desenvolvimento). */
  advanceWaitingList(ciclos?: number): boolean {
    const m: C2S_CasaAvancarFila = ciclos !== undefined ? { ciclos } : {};
    return this.sendGame(GAME_MSG.casaAvancarFila, m);
  }

  // ---- Fase 5: itens, Doutrina, plantão, masmorra e facção ----

  requestItems(): boolean {
    return this.sendGame(GAME_MSG.itensPedir, {});
  }

  equip(itemId: string): boolean {
    const m: C2S_Equipar = { itemId };
    return this.sendGame(GAME_MSG.equipar, m);
  }

  unequip(slot: string): boolean {
    const m: C2S_Desequipar = { slot };
    return this.sendGame(GAME_MSG.desequipar, m);
  }

  /** benzer (Esquerda) ou calibrar (Direita) */
  improveItem(processo: 'benzimento' | 'calibracao', itemId: string, onde?: string): boolean {
    const m: C2S_Melhorar = { itemId, ...(onde ? { onde } : {}) };
    return this.sendGame(processo === 'benzimento' ? GAME_MSG.benzer : GAME_MSG.calibrar, m);
  }

  setLootFilter(raridade: C2S_FiltroRaridade['raridade'], vendaAutomatica?: boolean): boolean {
    const m: C2S_FiltroRaridade = { raridade, ...(vendaAutomatica !== undefined ? { vendaAutomatica } : {}) };
    return this.sendGame(GAME_MSG.filtroRaridade, m);
  }

  requestDoctrine(): boolean {
    return this.sendGame(GAME_MSG.doutrinaPedir, {});
  }

  setDoctrine(cards: C2S_DoutrinaDefinir['cards']): boolean {
    const m: C2S_DoutrinaDefinir = { cards };
    return this.sendGame(GAME_MSG.doutrinaDefinir, m);
  }

  requestDuty(): boolean {
    return this.sendGame(GAME_MSG.plantaoPedir, {});
  }

  takeOnDuty(plantonistaId: string): boolean {
    const m: C2S_Plantonista = { plantonistaId };
    return this.sendGame(GAME_MSG.plantaoLevar, m);
  }

  releaseOnDuty(plantonistaId: string): boolean {
    const m: C2S_Plantonista = { plantonistaId };
    return this.sendGame(GAME_MSG.plantaoDispensar, m);
  }

  setOwnDuty(on: boolean): boolean {
    const m: C2S_PlantaoDefinir = { on };
    return this.sendGame(GAME_MSG.plantaoDefinir, m);
  }

  enterDungeon(atalho?: boolean): boolean {
    const m: C2S_MasmorraEntrar = atalho ? { atalho } : {};
    return this.sendGame(GAME_MSG.masmorraEntrar, m);
  }

  leaveDungeon(): boolean {
    return this.sendGame(GAME_MSG.masmorraSair, {});
  }

  dungeonChoice(sala: number, opcao: string): boolean {
    const m: C2S_MasmorraEscolha = { sala, opcao };
    return this.sendGame(GAME_MSG.masmorraEscolha, m);
  }

  requestFaction(): boolean {
    return this.sendGame(GAME_MSG.faccaoPedir, {});
  }

  close(): void {
    this.transport.close();
  }
}
