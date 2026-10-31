/**
 * Fase de estados do step: dano contínuo, cura contínua, puxão contínuo, passivos de intervalo
 * (afixo Cura os Outros) e expiração.
 */
import type { Effect } from '../schema/ability';
import { applyStatus, dealDamage, heal, healAmount, passivesOf, pullToward, removeStatuses } from './combat';
import { getEnt, isDamageable, isFriendly, isHostile, isUp } from './entity';
import { dist } from './geom';
import { msToTicks, type Entity, type World } from './types';
import { enemyAi } from './spawn';

export function tickStatuses(w: World): void {
  for (const e of Array.from(w.entities.values())) {
    if (e.kind === 'loot') continue;
    if (e.statuses.length > 0 && isUp(e)) {
      for (const s of [...e.statuses]) {
        // o último tick do dano/cura contínuo cai no próprio endTick (6 s com tick de 1 s = 6 golpes)
        if (s.endTick < w.tick) continue;
        if (s.kind === 'dano_continuo') {
          const next = Number(s.data?.['nextTick'] ?? w.tick);
          if (w.tick < next) continue;
          s.data = { ...s.data, nextTick: next + Math.max(1, msToTicks(Number(s.data?.['tickMs'] ?? 1000))) };
          const src = getEnt(w, s.sourceId);
          if (!src) continue;
          dealDamage(w, src, e, s.value, { ...(s.abilityId ? { abilityId: s.abilityId } : {}), noCrit: true });
          if (s.data?.['pulaEntreProximos'] === true) spreadDot(w, e, src, s.abilityId, s.value, s.endTick, s.data);
          if (!isUp(e)) break;
        } else if (s.kind === 'cura_continua') {
          const next = Number(s.data?.['nextTick'] ?? w.tick);
          if (w.tick < next) continue;
          s.data = { ...s.data, nextTick: next + Math.max(1, msToTicks(Number(s.data?.['tickMs'] ?? 1000))) };
          const src = getEnt(w, s.sourceId) ?? e;
          heal(w, src, e, (s.value / 100) * e.stats.hpMax, s.abilityId ? { abilityId: s.abilityId } : {});
        } else if (s.kind === 'puxar') {
          const cx = Number(s.data?.['cx']), cy = Number(s.data?.['cy']);
          const speed = Number(s.data?.['speed'] ?? 2);
          pullToward(w, e, cx, cy, speed / 20);
        }
      }
    }
    if (isUp(e) && e.kind === 'enemy' && e.affixes && e.affixes.length > 0) tickIntervalPassives(w, e);
    if (e.statuses.some((s) => s.endTick <= w.tick)) removeStatuses(w, e, (s) => s.endTick <= w.tick);
  }
}

/** Vírus em Rede: a cada tick o dano contínuo passa para um inimigo próximo que ainda não tem. */
function spreadDot(w: World, from: Entity, src: Entity, abilityId: string | undefined, value: number, endTick: number, data: Record<string, unknown>): void {
  const alcance = Number(data['pulaAlcance'] ?? 3);
  let best: Entity | undefined;
  let bd = Infinity;
  for (const t of w.entities.values()) {
    if (t.id === from.id || !isHostile(src, t) || !isDamageable(t)) continue;
    if (t.statuses.some((s) => s.kind === 'dano_continuo' && s.sourceId === src.id && s.abilityId === abilityId)) continue;
    const d = dist(from.x, from.y, t.x, t.y);
    if (d <= alcance && d < bd) {
      bd = d;
      best = t;
    }
  }
  if (!best) return;
  const remainingMs = Math.max(50, (endTick - w.tick) * 50);
  applyStatus(w, best, src, { kind: 'dano_continuo', durationMs: remainingMs, value, ...(abilityId ? { abilityId } : {}), data: { ...data, nextTick: w.tick + Math.max(1, msToTicks(Number(data['tickMs'] ?? 1000))) } });
}

/** Passivo 'gatilho' com trigger 'intervalo' dos afixos (ex.: Cura os Outros a cada 6 s). */
function tickIntervalPassives(w: World, e: Entity): void {
  const ai = enemyAi(e);
  ai.passiveTicks ??= {};
  passivesOf(e).forEach((p, i) => {
    if (p.kind !== 'gatilho' || p.trigger !== 'intervalo' || !p.intervaloS || !p.efeitos) return;
    const key = String(i);
    const next = ai.passiveTicks![key] ?? w.tick + msToTicks(p.intervaloS * 1000);
    if (w.tick < next) {
      ai.passiveTicks![key] = next;
      return;
    }
    ai.passiveTicks![key] = w.tick + msToTicks(p.intervaloS * 1000);
    for (const ef of p.efeitos) applyPassiveEffect(w, e, ef, p.raio ?? 4);
  });
}

/** Efeitos simples de passivo em volta (cura de aliados, dano em inimigos). */
function applyPassiveEffect(w: World, e: Entity, ef: Effect, raio: number): void {
  const r = ef.radius ?? raio;
  const sel = ef.target ?? 'aliados_area';
  for (const t of Array.from(w.entities.values())) {
    if (!isUp(t) || t.kind === 'loot' || t.kind === 'summon') continue;
    if (dist(e.x, e.y, t.x, t.y) - t.radius > r) continue;
    const friend = isFriendly(e, t);
    if (sel === 'aliados_area_sem_self' && (!friend || t.id === e.id)) continue;
    if (sel === 'aliados_area' && !friend) continue;
    if (sel === 'inimigos_area' && !isHostile(e, t)) continue;
    if (ef.kind === 'cura') heal(w, e, t, healAmount(w, e, t, ef));
    else if (ef.kind === 'dano') dealDamage(w, e, t, ef.mult);
  }
}
