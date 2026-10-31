/**
 * Servidor local (puro): roda a simulação de shared no próprio navegador e fala o mesmo protocolo
 * do servidor de jogo. Serve para ?offline=1 (jogar sem servidor, no celular ou no PC) e para os
 * testes de previsão com atraso. Não substitui o servidor autoritativo: é um espelho simplificado
 * dele para um jogador só.
 *
 * Regras de rede que ele segue (iguais às que o cliente espera do servidor):
 * - entradas numa fila, uma por tick (ack = última seq aplicada);
 * - comandos com id maior que o último processado (cack), na ordem;
 * - snapshot completo a cada tick, com d/n/lk/lv só para quem é novo (ou mudou);
 * - compensação: rewind de rtt/2, até 250 ms.
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
  createWorld,
  entityFlags,
  hudSnapshot,
  spawnEnemy,
  spawnNpc,
  spawnPack,
  spawnPlayer,
  step,
  TICK_MS,
  TICK_RATE,
  type CombatEvent,
  type Entity,
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
// SUGESTÃO: fila de entradas maior que isto descarta as mais velhas (o cliente atrasou demais).
const MAX_INPUT_BACKLOG = 4;

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
  private cack = 0;
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
    if (!p) return;
    this.rtt = Math.max(0, m.rtt || 0);
    const lastQueued = this.inputs.length > 0 ? this.inputs[this.inputs.length - 1]!.seq : this.lastSeq;
    for (const inp of m.inputs ?? []) if (inp.seq > lastQueued && inp.seq > this.lastSeq) this.inputs.push(inp);
    // o jogador vê os outros meia ida mais INTERP_DELAY_MS no passado (igual ao servidor de jogo)
    const rewindTicks = Math.round(Math.min(MAX_REWIND_MS, this.rtt / 2 + INTERP_DELAY_MS) / TICK_MS);
    for (const c of m.cmds ?? []) {
      if (c.id <= this.cack) continue;
      this.cack = c.id;
      // eventos soltos pelo comando (fala do treinador, 'cast' da habilidade) saem fora do step(),
      // que zera w.events no começo: guarda para o próximo snapshot
      const before = this.w.events.length;
      applyCommand(this.w, p, c, { rewindTicks });
      for (let i = before; i < this.w.events.length; i++) this.cmdEvents.push(this.w.events[i]!);
    }
  }

  /** Um tick do servidor: aplica uma entrada, roda a simulação e manda o snapshot. */
  tick(): void {
    const p = this.player;
    if (p) {
      if (this.inputs.length > MAX_INPUT_BACKLOG) this.inputs.splice(0, this.inputs.length - 2);
      const inp = this.inputs.shift();
      if (inp) {
        applyInput(this.w, p, inp);
        this.lastSeq = inp.seq;
      }
    }
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
