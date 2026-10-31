/**
 * Cliente robô, sem transporte: faz o que o cliente real fará na rede.
 * - manda a cada tick um C2S_Input com as 3 últimas entradas do joystick (seq crescente);
 * - reenvia cada comando em todas as mensagens até o snapshot confirmar (cack >= id);
 * - guarda as entidades com d/n/lk/lv e pede 'need' para quem apareceu sem eles;
 * - ignora snapshot velho (chegou fora de ordem) e tira quem veio em 'gone'.
 * Usado pelos testes (canal em memória) e pelo script de carga (bot/run.ts, com @colyseus/sdk).
 */
import { dequantize, quantizeAxis, type C2S_Hello, type C2S_Input, type EntSnap, type HudSnap, type S2C_Info, type S2C_Snapshot, type S2C_Welcome } from '@pqp/shared/net';
import type { CombatEvent, PlayerCommand, PlayerInput } from '@pqp/shared/sim';

/** Comando sem id (o robô numera). */
export type CommandBody = PlayerCommand extends infer C ? (C extends { id: number } ? Omit<C, 'id'> : never) : never;

export interface KnownEnt extends EntSnap {
  d?: string;
  n?: string;
  lv?: number;
  lk?: unknown;
}

export class RobotClient {
  you?: number;
  welcome?: S2C_Welcome;
  hud?: HudSnap;
  lastTick = -1;
  ents = new Map<number, KnownEnt>();
  /** eventos recebidos (todos os snapshots que chegaram) */
  events: { t: number; ev: CombatEvent }[] = [];
  snapsReceived = 0;
  /** último snapshot aceito (cru, como chegou) */
  lastSnap?: S2C_Snapshot;
  /** ids que já vieram em 'gone' */
  goneSeen = new Set<number>();
  /** RTT informado ao servidor (ms) */
  rtt = 0;
  stick = { x: 0, y: 0 };

  private seq = 0;
  private history: PlayerInput[] = [];
  private nextCmdId = 1;
  private pending: PlayerCommand[] = [];
  private cack = 0;
  private ack = -1;
  private needAsked = new Map<number, number>();

  constructor(
    readonly token: string,
    readonly name = 'Robô',
    readonly archetypeId?: string,
  ) {}

  hello(): C2S_Hello {
    return { token: this.token, name: this.name, ...(this.archetypeId ? { archetypeId: this.archetypeId } : {}) };
  }

  onWelcome(w: S2C_Welcome): void {
    this.welcome = w;
    this.you = w.you;
  }

  /** Joystick em -1..1 (o robô quantiza como o cliente). */
  setStick(x: number, y: number): void {
    const l = Math.hypot(x, y);
    this.stick = l > 1 ? { x: x / l, y: y / l } : { x, y };
  }

  /** Enfileira um comando; ele vai em toda mensagem até o servidor confirmar. Devolve o id. */
  command(body: CommandBody): number {
    const id = this.nextCmdId++;
    this.pending.push({ ...body, id } as PlayerCommand);
    return id;
  }

  hasPending(c?: PlayerCommand['c']): boolean {
    return c ? this.pending.some((p) => p.c === c) : this.pending.length > 0;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  get lastAck(): number {
    return this.ack;
  }

  get lastCack(): number {
    return this.cack;
  }

  /** Mensagem deste tick: nova entrada do joystick, as 3 últimas, comandos pendentes, ack e RTT. */
  makeInput(): C2S_Input {
    const inp: PlayerInput = { seq: this.seq++, mx: quantizeAxis(this.stick.x), my: quantizeAxis(this.stick.y) };
    this.history.push(inp);
    if (this.history.length > 3) this.history.shift();
    return { inputs: [...this.history], cmds: [...this.pending], ackTick: Math.max(0, this.lastTick), rtt: this.rtt };
  }

  /** Processa um snapshot. Devolve os ids que precisam de 'need'. */
  onSnapshot(s: S2C_Snapshot): number[] {
    if (s.t <= this.lastTick) return [];
    this.lastTick = s.t;
    this.snapsReceived++;
    this.lastSnap = s;
    for (const id of s.gone ?? []) this.goneSeen.add(id);
    this.ack = s.ack;
    if (s.cack > this.cack) this.cack = s.cack;
    this.pending = this.pending.filter((p) => p.id > this.cack);
    this.hud = s.hud;
    for (const id of s.gone ?? []) this.ents.delete(id);
    const seen = new Set<number>();
    for (const e of s.ents) {
      seen.add(e.i);
      const prev = this.ents.get(e.i);
      const merged: KnownEnt = { ...(prev ?? {}), ...e };
      this.ents.set(e.i, merged);
    }
    // snapshot é completo no raio: quem não veio saiu (mesmo que o 'gone' tenha se perdido)
    for (const id of Array.from(this.ents.keys())) if (!seen.has(id)) this.ents.delete(id);
    for (const ev of s.ev) this.events.push({ t: s.t, ev });
    return this.missing();
  }

  onInfo(info: S2C_Info): void {
    for (const e of info.ents) {
      const prev = this.ents.get(e.i);
      this.ents.set(e.i, { ...(prev ?? {}), ...e });
      this.needAsked.delete(e.i);
    }
  }

  /** Entidades conhecidas sem defId (o snapshot com 'd' se perdeu); pede de novo a cada 10 ticks. */
  missing(): number[] {
    const out: number[] = [];
    for (const e of this.ents.values()) {
      if (e.d !== undefined) {
        this.needAsked.delete(e.i);
        continue;
      }
      const asked = this.needAsked.get(e.i);
      if (asked !== undefined && this.lastTick - asked < 10) continue;
      this.needAsked.set(e.i, this.lastTick);
      out.push(e.i);
    }
    return out;
  }

  me(): KnownEnt | undefined {
    return this.you !== undefined ? this.ents.get(this.you) : undefined;
  }

  /** Posição em tiles de uma entidade conhecida. */
  pos(id: number | undefined): { x: number; y: number } | undefined {
    const e = id !== undefined ? this.ents.get(id) : undefined;
    return e ? { x: dequantize(e.x), y: dequantize(e.y) } : undefined;
  }

  /** Eventos de um tipo que chegaram. */
  eventsOf<T extends CombatEvent['t']>(t: T): Extract<CombatEvent, { t: T }>[] {
    return this.events.filter((x) => x.ev.t === t).map((x) => x.ev as Extract<CombatEvent, { t: T }>);
  }
}

// ---------------------------------------------------------------------------
// Cérebros simples (o que um jogador faria só com o polegar)

/** Anda com o joystick até (x, y) em tiles; para a 0,3 tile. Devolve true quando chegou. */
export function steerTo(r: RobotClient, x: number, y: number, stopAt = 0.3): boolean {
  const p = r.pos(r.you);
  if (!p) return false;
  const dx = x - p.x, dy = y - p.y;
  const d = Math.hypot(dx, dy);
  if (d <= stopAt) {
    r.setStick(0, 0);
    return true;
  }
  // devagar perto do ponto para não passar do alvo com o atraso
  const k = d < 1 ? Math.max(0.3, d) : 1;
  r.setStick((dx / d) * k, (dy / d) * k);
  return false;
}

/**
 * Luta só com o alvo automático e os botões: anda até o alvo que o servidor travou, aperta o botão
 * pronto (1, 2, 3) e o Especial quando brilha. Nunca escolhe alvo nem mira.
 */
export function fightBrain(meleeRange = 1.2): (r: RobotClient) => void {
  let lastPressTick = -100;
  return (r) => {
    const hud = r.hud;
    const me = r.pos(r.you);
    if (!hud || !me) return;
    const t = r.pos(hud.target);
    if (!t) {
      r.setStick(0, 0);
      return;
    }
    const dx = t.x - me.x, dy = t.y - me.y;
    const d = Math.hypot(dx, dy);
    if (d > meleeRange) r.setStick(dx / d, dy / d);
    else r.setStick(0, 0);
    // um aperto por vez, e espera a resposta (o HUD chega com o atraso da rede)
    if (r.hasPending('habilidade') || r.lastTick - lastPressTick < 8 || hud.gcd > 0) return;
    if (hud.special >= 1000 && hud.ab[3]) {
      r.command({ c: 'habilidade', botao: 'especial' });
      lastPressTick = r.lastTick;
      return;
    }
    for (const b of [1, 2, 3] as const) {
      if (hud.ab[b - 1] && hud.cd[b - 1] === 0) {
        r.command({ c: 'habilidade', botao: b });
        lastPressTick = r.lastTick;
        return;
      }
    }
  };
}
