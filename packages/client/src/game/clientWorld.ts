/**
 * Estado do mundo do lado do cliente (puro): o que os snapshots disseram, com um buffer de
 * interpolação por entidade. Não desenha nada; as cenas leem daqui.
 *
 * Snapshots são completos por tick (sem delta), então um perdido não estraga nada. O que só vem
 * quando a entidade é nova (d, n, lk, lv) pode se perder: aí o id entra em `unknown` e o cliente
 * pede de novo com MSG.need.
 */
import { dequantize, type EntSnap, type HudSnap, type S2C_Snapshot, type S2C_Welcome } from '@pqp/shared/net';
import { TICK_MS, type CombatEvent, type Telegraph } from '@pqp/shared/sim';
import { InterpBuffer } from '../net/interpolation';

// SUGESTÃO: entidade que some de 20 snapshots seguidos (1 s) sem 'gone' é descartada.
export const STALE_TICKS = 20;
// SUGESTÃO: fila de eventos guardada para as cenas (se a aba dormir, não cresce sem fim).
const MAX_EVENTS = 400;

export interface ClientEnt {
  id: number;
  kind: EntSnap['k'];
  defId?: string;
  name?: string;
  lk?: unknown;
  /** muda quando lk muda (a cena refaz a folha do boneco) */
  lkVersion: number;
  lv?: number;
  /** última posição do servidor (tiles) */
  x: number;
  y: number;
  f: EntSnap['f'];
  /** vida por mil */
  h: number;
  sh: number;
  fl: number;
  tg?: number;
  lastTick: number;
  buf: InterpBuffer;
}

export type ZoneSnap = S2C_Snapshot['zones'][number];

export class ClientWorld {
  you = -1;
  mapId = '';
  tickRate = 20;
  /** tick do último snapshot aceito */
  tick = -1;
  ack = 0;
  cack = 0;
  readonly ents = new Map<number, ClientEnt>();
  tel: Telegraph[] = [];
  zones: ZoneSnap[] = [];
  hud: HudSnap | undefined;
  readonly unknown = new Set<number>();
  private events: CombatEvent[] = [];
  readonly stats = { snaps: 0, stale: 0, gaps: 0 };

  applyWelcome(w: S2C_Welcome): void {
    this.you = w.you;
    this.mapId = w.mapId;
    this.tickRate = w.tickRate || 20;
    this.tick = -1;
    this.ack = 0;
    this.cack = 0;
    this.ents.clear();
    this.unknown.clear();
    this.tel = [];
    this.zones = [];
    this.hud = undefined;
    this.events = [];
  }

  /** Aplica um snapshot. Devolve false se for velho (fora de ordem ou repetido). */
  applySnapshot(s: S2C_Snapshot): boolean {
    if (s.t <= this.tick) {
      this.stats.stale++;
      return false;
    }
    if (this.tick >= 0 && s.t > this.tick + 1) this.stats.gaps++;
    this.tick = s.t;
    this.ack = s.ack;
    this.cack = s.cack;
    this.stats.snaps++;
    const tMs = s.t * TICK_MS;
    for (const es of s.ents) this.upsert(es, s.t, tMs);
    if (s.gone) for (const id of s.gone) this.remove(id);
    this.tel = s.tel ?? [];
    this.zones = s.zones ?? [];
    this.hud = s.hud;
    if (s.ev && s.ev.length > 0) {
      for (const ev of s.ev) this.events.push(ev);
      if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    }
    this.prune();
    return true;
  }

  /** Resposta a MSG.need: dados completos das entidades. */
  applyInfo(list: readonly EntSnap[]): void {
    for (const es of list) {
      const e = this.ents.get(es.i);
      if (!e) continue;
      this.fillStatic(e, es);
      if (e.defId !== undefined) this.unknown.delete(e.id);
    }
  }

  private fillStatic(e: ClientEnt, es: EntSnap): void {
    if (es.d !== undefined) e.defId = es.d;
    if (es.n !== undefined) e.name = es.n;
    if (es.lv !== undefined) e.lv = es.lv;
    if (es.lk !== undefined) {
      e.lk = es.lk;
      e.lkVersion++;
    }
  }

  private upsert(es: EntSnap, tick: number, tMs: number): void {
    let e = this.ents.get(es.i);
    const x = dequantize(es.x), y = dequantize(es.y);
    if (!e) {
      e = { id: es.i, kind: es.k, lkVersion: 0, x, y, f: es.f, h: es.h, sh: es.sh ?? 0, fl: es.fl, lastTick: tick, buf: new InterpBuffer() };
      this.ents.set(es.i, e);
    }
    e.kind = es.k;
    this.fillStatic(e, es);
    if (e.defId === undefined) this.unknown.add(e.id);
    e.x = x;
    e.y = y;
    e.f = es.f;
    e.h = es.h;
    e.sh = es.sh ?? 0;
    e.fl = es.fl;
    if (es.tg !== undefined) e.tg = es.tg;
    else delete e.tg;
    e.lastTick = tick;
    e.buf.push(tMs, x, y);
  }

  remove(id: number): void {
    this.ents.delete(id);
    this.unknown.delete(id);
  }

  /** Descarta quem não aparece há STALE_TICKS (um 'gone' perdido). */
  prune(): void {
    for (const e of this.ents.values()) if (this.tick - e.lastTick > STALE_TICKS) this.remove(e.id);
  }

  /** Eventos novos desde a última chamada (as cenas mostram números, falas e faíscas). */
  drainEvents(out: CombatEvent[] = []): CombatEvent[] {
    for (const ev of this.events) out.push(ev);
    this.events.length = 0;
    return out;
  }

  self(): ClientEnt | undefined {
    return this.ents.get(this.you);
  }

  /** Ids que precisam de info (defId perdido), no máximo `max` por pedido. */
  needList(max = 16): number[] {
    const out: number[] = [];
    for (const id of this.unknown) {
      if (!this.ents.has(id)) {
        this.unknown.delete(id);
        continue;
      }
      out.push(id);
      if (out.length >= max) break;
    }
    return out;
  }
}

/** Bits de EntSnap.fl (protocol.ts). */
export const FL = {
  movendo: 1,
  atacando: 2,
  caido: 4,
  invisivel: 8,
  atordoado: 16,
  lento: 32,
  provocando: 64,
  transformado: 128,
  elite: 256,
  chefe: 512,
  imune: 1024,
} as const;
