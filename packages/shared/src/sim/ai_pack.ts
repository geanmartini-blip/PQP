/**
 * Bandos: nascer em grupo (bando.min a bando.max, escolta e promoção a elite pela
 * promocaoElite.chancePorBando) e acordar junto (quem apanha ou vê chama o bando).
 * O núcleo não forma bandos sozinho: o servidor (ou o spawner do mapa) chama spawnPack.
 */
import { getData } from '../data';
import { circleFree } from '../map/grid';
import { enemyMind, AI_TUNING } from './ai_state';
import { isUp } from './entity';
import { dist } from './geom';
import { spawnEnemy } from './spawn';
import type { Entity, World } from './types';

export interface SpawnPackOpts {
  /** quantos do inimigo principal (padrão: sorteio entre bando.min e bando.max) */
  n?: number;
  /** nível acima do base */
  level?: number;
  /** chance de um do bando nascer elite (padrão: promocaoElite.chancePorBando); só para tier normal */
  eliteChance?: number;
  /** jogadores na luta (chefe) */
  players?: number;
  /** afastamento entre os membros, em tiles */
  spread?: number;
  /** id do bando (padrão: bando_<id do primeiro>) */
  packId?: string;
  /** sem escolta */
  noEscort?: boolean;
}

/** Ponto livre perto de (x, y) para o k-ésimo membro (anel em volta). */
function slotAround(w: World, x: number, y: number, k: number, spread: number, r: number): { x: number; y: number } {
  if (k === 0 && circleFree(w.map, x, y, r)) return { x, y };
  for (let ring = 1; ring <= 3; ring++) {
    const ang = k * 2.39996323 + ring;
    const px = x + Math.cos(ang) * spread * ring, py = y + Math.sin(ang) * spread * ring;
    if (circleFree(w.map, px, py, r)) return { x: px, y: py };
  }
  return { x, y };
}

/**
 * Nasce um bando de `enemyId` em volta de (x, y), com escolta e, às vezes, um elite promovido
 * (sorteio pelo RNG do mundo). Todos ganham o mesmo packId; a escolta guarda quem ela protege.
 */
export function spawnPack(w: World, enemyId: string, x: number, y: number, opts: SpawnPackOpts = {}): Entity[] {
  const D = getData();
  const def = D.enemiesById.get(enemyId);
  if (!def) throw new Error(`inimigo não existe: ${enemyId}`);
  const n = opts.n ?? w.rng.int(def.bando.min, def.bando.max);
  const spread = opts.spread ?? 1.2;
  const chance = opts.eliteChance ?? D.enemies.promocaoElite.chancePorBando;
  const eliteIdx = def.tier === 'normal' && n > 0 && w.rng.next() < chance ? w.rng.int(0, n - 1) : -1;
  const out: Entity[] = [];
  let k = 0;
  for (let i = 0; i < n; i++, k++) {
    const p = slotAround(w, x, y, k, spread, def.raioCorpoTiles);
    out.push(
      spawnEnemy(w, enemyId, p.x, p.y, {
        ...(i === eliteIdx ? { tier: 'elite' as const } : {}),
        ...(opts.level !== undefined ? { level: opts.level } : {}),
        ...(opts.players !== undefined ? { players: opts.players } : {}),
      }),
    );
  }
  const leader = out[0];
  if (!opts.noEscort && leader) {
    for (const esc of def.escolta ?? []) {
      const q = w.rng.int(esc.min, esc.max);
      const edef = D.enemiesById.get(esc.inimigo)!;
      for (let i = 0; i < q; i++, k++) {
        const p = slotAround(w, x, y, k, spread, edef.raioCorpoTiles);
        const m = spawnEnemy(w, esc.inimigo, p.x, p.y, opts.level !== undefined ? { level: opts.level } : {});
        enemyMind(m).leaderId = leader.id;
        out.push(m);
      }
    }
  }
  const packId = opts.packId ?? `bando_${leader?.id ?? w.tick}`;
  for (const e of out) enemyMind(e).packId = packId;
  return out;
}

/** Companheiros de bando de `e`: mesmo packId; sem packId, os inimigos do time a até packCallRadius. */
export function packMates(w: World, e: Entity): Entity[] {
  const m = enemyMind(e);
  const out: Entity[] = [];
  for (const o of w.entities.values()) {
    if (o.id === e.id || o.kind !== 'enemy' || o.team !== e.team || !isUp(o)) continue;
    const om = enemyMind(o);
    if (m.packId !== undefined && om.packId === m.packId) out.push(o);
    else if (m.packId === undefined && om.packId === undefined && dist(e.x, e.y, o.x, o.y) <= AI_TUNING.packCallRadius) out.push(o);
    else if (m.leaderId === o.id || om.leaderId === e.id) out.push(o);
  }
  return out;
}
