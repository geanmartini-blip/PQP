/**
 * Alvo automático e troca de alvo por toque.
 * - Trava no inimigo mais perto que esteja à vista (linha de visão), nunca atrás de parede.
 * - Mantém o alvo atual enquanto ele continua válido.
 * - O alvo escolhido por toque só cai quando morre ou fica fora de vista por MANUAL_TARGET_LOSE_MS.
 * - Provocado trava em quem provocou.
 */
import { hasLineOfSight } from '../map/grid';
import { bal, ACQUIRE_RADIUS, DROP_RADIUS, MANUAL_TARGET_LOSE_MS } from './constants';
import { getEnt, isTargetableBy, isUp, statusesOf } from './entity';
import { dist } from './geom';
import { msToTicks, type Entity, type World } from './types';
import { historicalPos } from './world';

/** `a` vê o centro de `b` (sem tile opaco no meio). */
export const canSee = (w: World, a: Entity, b: Entity) => hasLineOfSight(w.map, a.x, a.y, b.x, b.y);

/** Inimigo visível mais perto de `e`, a até `radius` tiles (borda a borda). */
export function nearestVisibleHostile(w: World, e: Entity, radius: number, exclude?: Set<number>): Entity | undefined {
  let best: Entity | undefined;
  let bd = Infinity;
  for (const t of w.entities.values()) {
    if (!isTargetableBy(e, t)) continue;
    if (exclude?.has(t.id)) continue;
    const d = dist(e.x, e.y, t.x, t.y) - t.radius;
    if (d > radius || d >= bd) continue;
    if (!canSee(w, e, t)) continue;
    bd = d;
    best = t;
  }
  return best;
}

/** Quem provocou `e` (provocação ativa mais nova, com a fonte ainda válida). */
export function tauntSource(w: World, e: Entity): Entity | undefined {
  const ts = statusesOf(e, 'provocar');
  for (let i = ts.length - 1; i >= 0; i--) {
    const src = getEnt(w, ts[i]!.sourceId);
    if (src && isTargetableBy(e, src)) return src;
  }
  return undefined;
}

/**
 * Atualiza e devolve o alvo de `e`. Jogador e companheiro: trava sozinho no inimigo visível mais
 * perto (ACQUIRE_RADIUS). Inimigo: a IA escolhe o alvo; aqui só cai o alvo que não vale mais.
 */
export function autoTarget(w: World, e: Entity): number | undefined {
  if (!isUp(e)) {
    e.targetId = undefined;
    return undefined;
  }
  const taunt = tauntSource(w, e);
  if (taunt) {
    e.targetId = taunt.id;
    e.manualTarget = false;
    e.targetLostTick = undefined;
    return taunt.id;
  }
  const cur = getEnt(w, e.targetId);
  if (cur && isTargetableBy(e, cur)) {
    const visible = dist(e.x, e.y, cur.x, cur.y) - cur.radius <= DROP_RADIUS && canSee(w, e, cur);
    if (visible) {
      e.targetLostTick = undefined;
      return cur.id;
    }
    if (e.manualTarget) {
      e.targetLostTick ??= w.tick;
      if (w.tick - e.targetLostTick < msToTicks(MANUAL_TARGET_LOSE_MS)) return cur.id;
    }
  }
  // alvo atual não vale mais
  e.targetId = undefined;
  e.manualTarget = false;
  e.targetLostTick = undefined;
  if (e.kind === 'enemy') return undefined;
  const t = nearestVisibleHostile(w, e, ACQUIRE_RADIUS);
  if (t) e.targetId = t.id;
  return e.targetId;
}

/**
 * Toque na tela: trava no inimigo mais perto do ponto tocado, num raio de raioTrocaAlvoTiles
 * (1,5 tile, mais o raio do corpo), que `e` consiga ver. Com rewindTicks, confere as posições que
 * o jogador via (histórico). Devolve o id travado, ou undefined se não havia inimigo ali.
 */
export function retargetTap(w: World, e: Entity, x: number, y: number, rewindTicks = 0): number | undefined {
  const r = bal().combate.raioTrocaAlvoTiles;
  let best: Entity | undefined;
  let bd = Infinity;
  for (const t of w.entities.values()) {
    if (!isTargetableBy(e, t)) continue;
    const h = rewindTicks > 0 ? historicalPos(w, t.id, rewindTicks) : undefined;
    const tx = h ? h[0] : t.x, ty = h ? h[1] : t.y;
    const d = dist(x, y, tx, ty);
    if (d > r + t.radius || d >= bd) continue;
    if (!hasLineOfSight(w.map, e.x, e.y, tx, ty) && !canSee(w, e, t)) continue;
    bd = d;
    best = t;
  }
  if (!best) return undefined;
  e.targetId = best.id;
  e.manualTarget = true;
  e.targetLostTick = undefined;
  return best.id;
}
