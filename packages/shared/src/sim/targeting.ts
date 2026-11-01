/**
 * Alvo automático e troca de alvo por toque.
 * - Trava no inimigo mais perto que esteja à vista (linha de visão), nunca atrás de parede.
 * - Mantém o alvo atual enquanto ele continua válido e no alcance do básico; fora do alcance do
 *   básico, o alvo automático passa para o inimigo visível mais perto (closerHostile).
 * - O alvo escolhido por toque só cai quando morre ou fica fora de vista por MANUAL_TARGET_LOSE_MS.
 * - Provocado trava em quem provocou.
 */
import { getData } from '../data';
import { hasLineOfSight } from '../map/grid';
import { bal, ACQUIRE_RADIUS, DROP_RADIUS, MANUAL_TARGET_LOSE_MS, RETARGET_CLOSER_TILES } from './constants';
import { getEnt, isTargetableBy, isUp, statPts, statusesOf } from './entity';
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
      // alvo automático: segue o inimigo mais perto à vista quando o atual saiu do alcance do básico
      if (!e.manualTarget && e.kind !== 'enemy') {
        const better = closerHostile(w, e, cur);
        if (better) {
          e.targetId = better.id;
          return better.id;
        }
      }
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

/** Distância borda a borda. */
const gap = (a: Entity, b: Entity) => dist(a.x, a.y, b.x, b.y) - a.radius - b.radius;

/** Alcance do ataque básico de `e` (o mesmo cálculo de effectiveRange em abilities.ts). */
export function basicRangeOf(e: Entity): number {
  const id = e.loadout?.basico ?? (e.ai?.['basic'] as string | undefined);
  const a = id ? getData().abilities.get(id) : undefined;
  const r = !a ? e.stats.range : a.rangeDoAlcance ? e.stats.range : a.range;
  return r * (1 + statPts(e, 'range') / 100);
}

/**
 * Troca do alvo automático (não manual): com o atual fora do alcance do básico, vai para o inimigo
 * visível mais perto se ele estiver no alcance do básico, ou se estiver RETARGET_CLOSER_TILES mais
 * perto que o atual (a folga evita ficar trocando entre dois quase à mesma distância). Com o atual
 * no alcance, não troca.
 */
function closerHostile(w: World, e: Entity, cur: Entity): Entity | undefined {
  const reach = basicRangeOf(e);
  const dCur = gap(e, cur);
  if (dCur <= reach) return undefined;
  const near = nearestVisibleHostile(w, e, ACQUIRE_RADIUS);
  if (!near || near.id === cur.id) return undefined;
  const dNear = gap(e, near);
  return dNear <= reach || dCur - dNear >= RETARGET_CLOSER_TILES ? near : undefined;
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
