/** Mundo da simulação: criação, ids, eventos e histórico de posições. */
import type { TileMap } from '../map/types';
import { HISTORY_TICKS } from './constants';
import { createRng } from './rng';
import type { CombatEvent, CombatStats, Entity, EntityKind, Team, World } from './types';

/** Mundo vazio num mapa, com RNG semeado. O tick começa em 0; cada step() avança 1. */
export function createWorld(map: TileMap, seed: number): World {
  return {
    tick: 0,
    rng: createRng(seed),
    map,
    entities: new Map(),
    telegraphs: [],
    zones: [],
    nextId: 1,
    events: [],
    history: [],
  };
}

export const newId = (w: World) => w.nextId++;

export function emit(w: World, ev: CombatEvent): void {
  w.events.push(ev);
}

/** Stats neutros (NPC, saque). */
export function blankStats(hp = 1): CombatStats {
  return {
    hpMax: hp,
    attack: 0,
    defense: 0,
    speed: 10,
    range: 1,
    moveSpeed: 0,
    attackIntervalMs: 1000,
    critChance: 0,
    critDamage: 1.5,
    evasion: 0,
    resourceMax: 0,
    resourceRegenPerS: 0,
    pct: {},
  };
}

/** Cria e registra uma entidade com os padrões do contrato. */
export function addEntity(
  w: World,
  base: { kind: EntityKind; team: Team; defId: string; name: string; x: number; y: number; radius: number; stats: CombatStats; level?: number },
): Entity {
  const e: Entity = {
    id: newId(w),
    kind: base.kind,
    team: base.team,
    defId: base.defId,
    name: base.name,
    level: base.level ?? 1,
    x: base.x,
    y: base.y,
    radius: base.radius,
    facing: 0,
    moveIntent: { x: 0, y: 0 },
    hp: base.stats.hpMax,
    shield: 0,
    resource: base.stats.resourceMax,
    special: 0,
    stats: base.stats,
    statuses: [],
    ccImmuneUntil: 0,
    cooldowns: {},
    gcdUntil: 0,
    nextBasicTick: 0,
    dead: false,
    spawnX: base.x,
    spawnY: base.y,
  };
  w.entities.set(e.id, e);
  return e;
}

/** Guarda as posições deste tick (todas as entidades menos saque) e descarta o que passou de HISTORY_TICKS. */
export function recordHistory(w: World): void {
  const pos = new Map<number, [number, number]>();
  for (const e of w.entities.values()) if (e.kind !== 'loot') pos.set(e.id, [e.x, e.y]);
  w.history.push({ tick: w.tick, pos });
  while (w.history.length > HISTORY_TICKS) w.history.shift();
}

/** Posição de uma entidade há `rewindTicks` ticks (a mais antiga guardada, se faltar histórico). */
export function historicalPos(w: World, id: number, rewindTicks: number): [number, number] | undefined {
  if (rewindTicks <= 0 || w.history.length === 0) return undefined;
  const want = w.tick - rewindTicks;
  let best: { tick: number; pos: Map<number, [number, number]> } | undefined;
  for (const h of w.history) {
    if (h.tick <= want) best = h;
  }
  best ??= w.history[0];
  return best?.pos.get(id);
}
