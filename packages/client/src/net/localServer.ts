/**
 * Servidor local (puro): roda a simulação de shared no próprio navegador e fala o mesmo protocolo
 * do servidor de jogo. Serve para ?offline=1 (jogar sem servidor, no celular ou no PC) e para os
 * testes de previsão com atraso. Não substitui o servidor autoritativo: é um espelho simplificado
 * dele para um jogador só.
 *
 * Regras de rede que ele segue (as mesmas do GameServerCore, server/src/core.ts):
 * - entradas: só seq maior que a última consumida e ainda não enfileirada, fila em ordem de seq;
 *   uma por tick (ack = última seq aplicada); com mais de INPUT_TARGET_BACKLOG esperando, até
 *   INPUT_CATCHUP_PER_TICK extras andam na hora, pagas por um crédito de entradas (ninguém anda
 *   mais rápido mandando mais entradas); a fila corta as mais velhas em INPUT_QUEUE_MAX;
 * - sem entrada por STALE_INPUT_TICKS, o joystick volta ao centro;
 * - comandos: cada id uma vez só (cack = maior id visto, mais um conjunto dos recentes), guardados
 *   na chegada e aplicados no tick, depois da entrada e antes do step();
 * - snapshot completo a cada tick, com d/n/lk/lv só para quem é novo (ou mudou);
 * - compensação: rewind de RTT + INTERP_DELAY_MS + meio tick, até 250 ms.
 * O que o núcleo faz e este espelho não faz: entrada suposta quando a fila esvazia, comando com
 * afterSeq, vários jogadores, persistência. O teste net.core.test.ts liga o GameClient ao núcleo de
 * verdade.
 */
import { findPath, getMap, type TileMap } from '@pqp/shared/map';
import {
  INTEREST_RADIUS,
  INTERP_DELAY_MS,
  MAX_REWIND_MS,
  MSG,
  PROTOCOL_VERSION,
  quantize,
  type C2S_Hello,
  type C2S_Input,
  type C2S_Ping,
  type EntSnap,
  type S2C_Snapshot,
  type S2C_Welcome,
} from '@pqp/shared/net';
import {
  applyCommand,
  applyInput,
  canMove,
  createWorld,
  entityFlags,
  hudSnapshot,
  moveSpeedOf,
  moveVelocity,
  spawnEnemy,
  spawnNpc,
  spawnPack,
  spawnPlayer,
  step,
  stepMovement,
  TICK_MS,
  TICK_RATE,
  type CombatEvent,
  type Entity,
  type PlayerCommand,
  type PlayerInput,
  type World,
} from '@pqp/shared/sim';
import { circleFree } from '@pqp/shared/map';
import { getData } from '@pqp/shared';
import { archetypeLook, defaultLook } from '../art/character';

// SUGESTÃO: bando morto volta em 30 s; o chefe em 60 s.
export const RESPAWN_BAND_MS = 30000;
export const RESPAWN_BOSS_MS = 60000;
// SUGESTÃO: ala inicial do personagem template do protótipo.
export const DEFAULT_ARCHETYPE = 'peao_brabo';
// SUGESTÃO: os mesmos números do servidor (server/src/config.ts): fila alvo de 1 entrada, até 2
// extras por tick, crédito de 1,05 por tick até 20, fila de no máximo 40, joystick ao centro depois
// de 10 ticks sem entrada, 128 ids de comando lembrados, 16 comandos lidos por mensagem.
export const INPUT_TARGET_BACKLOG = 1;
export const INPUT_CATCHUP_PER_TICK = 2;
export const INPUT_CREDIT_PER_TICK = 1.05;
export const INPUT_CREDIT_MAX = 20;
export const INPUT_QUEUE_MAX = 40;
export const STALE_INPUT_TICKS = 10;
export const RECENT_CMD_IDS = 128;
export const MAX_CMDS_PER_MSG = 16;

export type Outgoing = [string, unknown];

interface Group {
  markerId: string;
  kind: 'bando' | 'inimigo' | 'chefe';
  ref: string;
  x: number;
  y: number;
  n: number;
  params: Record<string, unknown>;
  ids: number[];
  deadSince?: number;
}

const KIND_CODE: Record<Entity['kind'], EntSnap['k']> = { player: 'p', npc: 'n', enemy: 'e', summon: 's', loot: 'l' };

export interface LocalServerOpts {
  mapId?: string;
  seed?: number;
  /** sem inimigos (testes de movimento) */
  noEnemies?: boolean;
  /** mapa pronto (testes) em vez de getMap(mapId) */
  map?: TileMap;
}

export class LocalServer {
  readonly w: World;
  readonly mapId: string;
  player: Entity | undefined;
  private spawn = { x: 1.5, y: 1.5 };
  private inputs: PlayerInput[] = [];
  private lastSeq = 0;
  private lastInputTick = 0;
  private credit = INPUT_CREDIT_MAX;
  private cack = 0;
  private recent = new Set<number>();
  private recentOrder: number[] = [];
  private cmdQ: PlayerCommand[] = [];
  private rtt = 0;
  private known = new Set<number>();
  private sentLv = new Map<number, number>();
  private sentLook = new Map<number, string>();
  private groups: Group[] = [];
  private outbox: Outgoing[] = [];
  private cmdEvents: CombatEvent[] = [];
  private token = '';

  constructor(opts: LocalServerOpts = {}) {
    this.mapId = opts.map?.id ?? opts.mapId ?? 'prototipo_delta';
    const map = opts.map ?? getMap(this.mapId);
    this.w = createWorld(map, opts.seed ?? 7);
    this.w.pathfinder = (m, from, to, r) => findPath(m, from, to, r);
    this.populate(map, opts.noEnemies === true);
  }

  private populate(map: TileMap, noEnemies: boolean): void {
    for (const m of map.markers) {
      if (m.kind === 'spawn_jogador') this.spawn = { x: m.x, y: m.y };
      else if (m.kind === 'npc' && m.ref) spawnNpc(this.w, m.ref, m.x, m.y);
      else if (!noEnemies && (m.kind === 'bando' || m.kind === 'inimigo' || m.kind === 'chefe')) {
        const params = (m.params ?? {}) as Record<string, unknown>;
        const list = params['inimigos'];
        const ref = m.ref ?? (Array.isArray(list) ? String(list[0]) : '');
        if (!ref || !getData().enemiesById.has(ref)) continue;
        const g: Group = { markerId: m.id, kind: m.kind, ref, x: m.x, y: m.y, n: m.kind === 'bando' ? Number(params['n'] ?? 3) : 1, params, ids: [] };
        this.groups.push(g);
        this.spawnGroup(g);
      }
    }
  }

  private spawnGroup(g: Group): void {
    g.ids = [];
    g.deadSince = undefined;
    const tier = g.params['tier'] as 'normal' | 'elite' | 'chefe' | undefined;
    const affixes = Array.isArray(g.params['affixes']) ? (g.params['affixes'] as string[]) : undefined;
    // bando: como o spawner do servidor (spawnPack: mesmo packId, escolta, promoção a elite)
    if (g.kind === 'bando') {
      for (const e of spawnPack(this.w, g.ref, g.x, g.y, { n: g.n, packId: g.markerId })) g.ids.push(e.id);
      return;
    }
    for (let i = 0; i < g.n; i++) {
      // bando em roda em volta do marcador, só onde cabe
      let x = g.x, y = g.y;
      if (g.n > 1) {
        const a = (i / g.n) * Math.PI * 2;
        const cx = g.x + Math.cos(a) * 1.2, cy = g.y + Math.sin(a) * 1.2;
        if (circleFree(this.w.map, cx, cy, 0.45)) {
          x = cx;
          y = cy;
        }
      }
      const e = spawnEnemy(this.w, g.ref, x, y, { ...(tier ? { tier } : {}), ...(affixes ? { affixes } : {}) });
      g.ids.push(e.id);
    }
  }

  /** Mensagem do cliente. */
  receive(type: string, msg: unknown): void {
    switch (type) {
      case MSG.hello:
        this.onHello(msg as C2S_Hello);
        break;
      case MSG.input:
        this.onInput(msg as C2S_Input);
        break;
      case MSG.ping:
        this.outbox.push([MSG.pong, { t: (msg as C2S_Ping).t, st: this.w.tick }]);
        break;
      case MSG.need: {
        const ids = ((msg as { ids?: number[] })?.ids ?? []).filter((id) => this.w.entities.has(id));
        this.outbox.push([MSG.info, { ents: ids.map((id) => this.entSnap(this.w.entities.get(id)!, true)) }]);
        break;
      }
    }
  }

  private onHello(h: C2S_Hello): void {
    this.token = h.token || 'convidado';
    if (!this.player) {
      const arch = h.archetypeId && getData().archetypesById.has(h.archetypeId) ? h.archetypeId : DEFAULT_ARCHETYPE;
      this.player = spawnPlayer(this.w, { name: h.name || 'Visitante', archetypeId: arch, x: this.spawn.x, y: this.spawn.y, playerId: this.token });
    }
    this.known.clear();
    this.sentLv.clear();
    this.sentLook.clear();
    const welcome: S2C_Welcome & { token: string } = {
      you: this.player.id,
      mapId: this.mapId,
      tick: this.w.tick,
      tickRate: TICK_RATE,
      protocol: PROTOCOL_VERSION,
      token: this.token,
    };
    this.outbox.push([MSG.welcome, welcome]);
  }

  private onInput(m: C2S_Input): void {
    const p = this.player;
    if (!p || !m || typeof m !== 'object') return;
    if (typeof m.rtt === 'number' && Number.isFinite(m.rtt)) this.rtt = Math.max(0, Math.min(2000, m.rtt));
    // joystick: só seq maior que a última consumida e ainda não enfileirada, fila em ordem
    if (Array.isArray(m.inputs)) {
      const ins = m.inputs.slice(-8);
      for (const inp of ins) {
        if (!inp || typeof inp.seq !== 'number' || inp.seq <= this.lastSeq || this.inputs.some((q) => q.seq === inp.seq)) continue;
        this.inputs.push({ seq: inp.seq, mx: inp.mx, my: inp.my });
      }
      if (ins.length > 0) this.lastInputTick = this.w.tick;
      this.inputs.sort((a, b) => a.seq - b.seq);
      while (this.inputs.length > INPUT_QUEUE_MAX) this.inputs.shift();
    }
    // comandos: cada id uma vez só; aplicados no próximo tick
    if (Array.isArray(m.cmds)) {
      const cmds = m.cmds.slice(0, MAX_CMDS_PER_MSG).filter((c) => c && Number.isInteger(c.id) && c.id > 0);
      cmds.sort((a, b) => a.id - b.id);
      for (const c of cmds) {
        if (this.recent.has(c.id) || c.id <= this.cack - RECENT_CMD_IDS) continue;
        this.recent.add(c.id);
        this.recentOrder.push(c.id);
        while (this.recentOrder.length > RECENT_CMD_IDS) this.recent.delete(this.recentOrder.shift()!);
        if (c.id > this.cack) this.cack = c.id;
        this.cmdQ.push(c);
      }
    }
  }

  /** Anda um passo agora com o joystick (entrada extra da drenagem), como o moveNow do núcleo. */
  private moveNow(e: Entity): void {
    if (!canMove(e)) return;
    const { vx, vy } = moveVelocity(e.moveIntent, moveSpeedOf(e));
    if (vx === 0 && vy === 0) return;
    const p = stepMovement(this.w.map, e, vx, vy, TICK_MS);
    e.x = p.x;
    e.y = p.y;
  }

  /** Entradas do tick: as extras da drenagem andam na hora; a do tick anda no step. */
  private consumeInputs(p: Entity): void {
    this.credit = Math.min(INPUT_CREDIT_MAX, this.credit + INPUT_CREDIT_PER_TICK);
    let extra = 0;
    while (this.inputs.length > INPUT_TARGET_BACKLOG + 1 && extra < INPUT_CATCHUP_PER_TICK && this.credit >= 2) {
      const inp = this.inputs.shift()!;
      applyInput(this.w, p, inp);
      this.moveNow(p);
      this.lastSeq = inp.seq;
      this.credit -= 1;
      extra++;
    }
    const inp = this.inputs.shift();
    if (inp) {
      applyInput(this.w, p, inp);
      this.lastSeq = inp.seq;
      this.credit -= 1;
    } else if (this.w.tick - this.lastInputTick > STALE_INPUT_TICKS && (p.moveIntent.x !== 0 || p.moveIntent.y !== 0)) {
      p.moveIntent = { x: 0, y: 0 };
    }
  }

  /** Ticks de compensação, como o núcleo: RTT + atraso de interpolação + meio tick, até 250 ms. */
  private rewindTicks(): number {
    return Math.round(Math.min(MAX_REWIND_MS, this.rtt + INTERP_DELAY_MS + TICK_MS / 2) / TICK_MS);
  }

  /** Um tick do servidor: entrada e comandos, simulação e snapshot. */
  tick(): void {
    const p = this.player;
    this.w.events = [];
    if (p) {
      this.consumeInputs(p);
      if (this.cmdQ.length > 0) {
        const rewindTicks = this.rewindTicks();
        for (const c of this.cmdQ) applyCommand(this.w, p, c, { rewindTicks });
        this.cmdQ = [];
      }
    }
    // eventos soltos pelos comandos (fala do treinador, 'cast') saem antes do step(), que zera w.events
    for (const e of this.w.events) this.cmdEvents.push(e);
    const stepEv = step(this.w);
    const ev = this.cmdEvents.length > 0 ? [...this.cmdEvents, ...stepEv] : stepEv;
    this.cmdEvents = [];
    this.respawns();
    if (p) this.outbox.push([MSG.snap, this.snapshot(p, ev)]);
  }

  private respawns(): void {
    const now = this.w.tick;
    for (const g of this.groups) {
      const alive = g.ids.some((id) => {
        const e = this.w.entities.get(id);
        return e !== undefined && !e.dead;
      });
      if (alive) continue;
      if (g.deadSince === undefined) g.deadSince = now;
      const wait = (g.kind === 'chefe' ? RESPAWN_BOSS_MS : RESPAWN_BAND_MS) / TICK_MS;
      if (now - g.deadSince >= wait) this.spawnGroup(g);
    }
  }

  /** lk como o servidor de jogo manda (server/src/snapshot.ts): jogador, afixos, saque, lado. */
  private lookOf(e: Entity): unknown {
    switch (e.kind) {
      case 'player':
        return e.archetypeId ? archetypeLook(e.archetypeId, 'aprendiz') : defaultLook();
      case 'enemy':
        return e.affixes && e.affixes.length > 0 ? { affixes: [...e.affixes] } : undefined;
      case 'loot': {
        const l = e.loot ?? {};
        const s = (l.currency?.semente ?? 0) > 0, c = (l.currency?.credito ?? 0) > 0;
        const out: Record<string, unknown> = {};
        if (l.rarity) out['rarity'] = l.rarity;
        if (s || c) out['currency'] = s && c ? 'ambas' : s ? 'semente' : 'credito';
        return Object.keys(out).length > 0 ? out : undefined;
      }
      case 'summon':
        return e.side ? { side: e.side } : undefined;
      default:
        return undefined;
    }
  }

  private entSnap(e: Entity, full: boolean): EntSnap {
    const s: EntSnap = {
      i: e.id,
      k: KIND_CODE[e.kind],
      x: quantize(e.x),
      y: quantize(e.y),
      f: e.facing,
      h: e.stats.hpMax > 0 ? Math.max(0, Math.min(1000, Math.round((e.hp / e.stats.hpMax) * 1000))) : 0,
      fl: entityFlags(this.w, e),
    };
    if (e.shield > 0 && e.stats.hpMax > 0) s.sh = Math.min(1000, Math.round((e.shield / e.stats.hpMax) * 1000));
    if (e.targetId !== undefined && (e === this.player || e.tier === 'chefe')) s.tg = e.targetId;
    const lk = this.lookOf(e);
    const lkKey = lk === undefined ? '' : JSON.stringify(lk);
    if (full) {
      s.d = e.defId;
      s.n = e.name;
      s.lv = e.level;
      if (lk !== undefined) s.lk = lk;
    } else {
      if (this.sentLv.get(e.id) !== e.level) s.lv = e.level;
      if (lk !== undefined && this.sentLook.get(e.id) !== lkKey) s.lk = lk;
    }
    this.sentLv.set(e.id, e.level);
    if (lk !== undefined) this.sentLook.set(e.id, lkKey);
    return s;
  }

  private snapshot(p: Entity, ev: CombatEvent[]): S2C_Snapshot {
    const R2 = INTEREST_RADIUS * INTEREST_RADIUS;
    const ents: EntSnap[] = [];
    const seen = new Set<number>();
    for (const e of this.w.entities.values()) {
      const dx = e.x - p.x, dy = e.y - p.y;
      if (e !== p && dx * dx + dy * dy > R2) continue;
      const isNew = !this.known.has(e.id);
      ents.push(this.entSnap(e, isNew));
      seen.add(e.id);
    }
    const gone: number[] = [];
    for (const id of this.known) if (!seen.has(id)) gone.push(id);
    for (const id of gone) {
      this.known.delete(id);
      this.sentLv.delete(id);
      this.sentLook.delete(id);
    }
    for (const id of seen) this.known.add(id);
    const near = (x: number, y: number) => (x - p.x) ** 2 + (y - p.y) ** 2 <= R2;
    const snap: S2C_Snapshot = {
      t: this.w.tick,
      ack: this.lastSeq,
      cack: this.cack,
      ents,
      tel: this.w.telegraphs.filter((t) => near(t.x, t.y)).map((t) => ({ ...t })),
      zones: this.w.zones
        .filter((z) => near(z.x, z.y))
        .map((z) => ({
          i: z.id,
          a: z.abilityId,
          x: z.x,
          y: z.y,
          r: z.radius,
          e: z.endTick,
          team: z.team,
          ...(z.shape === 'cone' ? { s: 'cone' as const, ...(z.dir !== undefined ? { dir: z.dir } : {}), ...(z.angleDeg !== undefined ? { ang: z.angleDeg } : {}), ...(z.range !== undefined ? { rg: z.range } : {}) } : {}),
        })),
      ev: ev.map((e) => ({ ...e })) as CombatEvent[],
      hud: hudSnapshot(this.w, p),
    };
    if (gone.length > 0) snap.gone = gone;
    return snap;
  }

  /** Mensagens prontas para o cliente (esvazia a caixa). */
  take(): Outgoing[] {
    const out = this.outbox;
    this.outbox = [];
    return out;
  }
}
