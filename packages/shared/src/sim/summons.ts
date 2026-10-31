/**
 * Comportamentos genéricos das invocações (summons.json) e expiração (fase 13 do step).
 * - ataca_mais_perto: fica parado e bate no inimigo mais perto a cada tickMs.
 * - provoca / aura / muralha: aplica os efeitos em volta a cada tickMs (provocar, reforço...).
 * - cura_menos_vida: aplica os efeitos (cura no mais ferido, cuspe no inimigo mais perto).
 * - distrai: inimigos no raio largam o dono e batem nela (não é controle, sem imunidade).
 * - luta_ao_lado: segue o dono e bate no alvo dele.
 * - absorve: não age (o passivo do dono manda o dano para ela).
 * Invocação com rebuildMs volta depois de destruída, enquanto durar.
 */
import { getData } from '../data';
import type { Effect } from '../schema/ability';
import { applyBuff, applyControl, applyShield, applyStatus, dealDamage, heal, healAmount, lowestHpAlly, pullToward } from './combat';
import { getEnt, isFriendly, isHostile, isTargetableBy, isUp } from './entity';
import { dist } from './geom';
import { stepMovement, velocityToward } from './movement';
import type { SummonAi } from './spawn';
import { canSee, nearestVisibleHostile } from './targeting';
import { msToTicks, TICK_MS, type Entity, type World } from './types';
import { emit } from './world';

const sai = (e: Entity) => e.ai as unknown as SummonAi;

export function tickSummons(w: World): void {
  const D = getData();
  for (const s of Array.from(w.entities.values())) {
    if (s.kind !== 'summon') continue;
    const st = sai(s);
    const owner = getEnt(w, s.ownerId);
    if (s.expiresTick !== undefined && w.tick >= s.expiresTick) {
      s.dead = true;
      continue;
    }
    if (!owner || owner.dead) {
      s.dead = true;
      continue;
    }
    if (s.dead && !st.rebuilding) {
      // destruída: refaz depois de rebuildMs, se ainda dá tempo
      if (st.rebuildMs && (s.expiresTick ?? 0) > w.tick + msToTicks(st.rebuildMs)) {
        s.dead = false;
        s.hp = 0;
        st.rebuilding = true;
        st.rebuildTick = w.tick + msToTicks(st.rebuildMs);
        (s.ai as Record<string, unknown>)['rebuilding'] = true;
      }
      continue;
    }
    if (st.rebuilding) {
      if (w.tick >= (st.rebuildTick ?? 0)) {
        st.rebuilding = false;
        s.hp = s.stats.hpMax;
        emit(w, { t: 'revive', dst: s.id });
      }
      continue;
    }
    const def = D.summonsById.get(s.defId);
    if (!def) continue;
    // segue o dono
    if (def.behavior === 'luta_ao_lado' && isUp(s)) {
      const tgt = getEnt(w, owner.targetId);
      const goal = tgt && isTargetableBy(s, tgt) ? tgt : owner;
      const stop = goal === owner ? 1.5 : Math.max(0.6, def.range);
      const d = dist(s.x, s.y, goal.x, goal.y) - goal.radius - s.radius;
      if (d > stop) {
        const v = velocityToward(s, goal.x, goal.y, s.stats.moveSpeed, TICK_MS);
        const p = stepMovement(w.map, s, v.vx, v.vy, TICK_MS);
        s.x = p.x;
        s.y = p.y;
        s.vel = { x: v.vx, y: v.vy };
      } else s.vel = { x: 0, y: 0 };
    }
    if (def.behavior === 'distrai') {
      for (const o of w.entities.values()) {
        if (o.kind === 'enemy' && isHostile(s, o) && o.targetId === owner.id && dist(s.x, s.y, o.x, o.y) <= def.radius) o.targetId = s.id;
      }
    }
    if (!def.tickMs || w.tick < st.nextTick) continue;
    st.nextTick = w.tick + msToTicks(def.tickMs);
    switch (def.behavior) {
      case 'ataca_mais_perto': {
        const t = nearestVisibleHostile(w, s, def.range);
        if (t && s.stats.attack > 0) {
          dealDamage(w, s, t, 1, { ranged: def.range >= 2 });
          emit(w, { t: 'cast', src: s.id, ability: s.defId, target: t.id });
        }
        break;
      }
      case 'luta_ao_lado': {
        const t = getEnt(w, owner.targetId);
        const tgt = t && isTargetableBy(s, t) && dist(s.x, s.y, t.x, t.y) - t.radius - s.radius <= Math.max(1, def.range) && canSee(w, s, t) ? t : nearestVisibleHostile(w, s, Math.max(1, def.range));
        if (tgt && s.stats.attack > 0) {
          dealDamage(w, s, tgt, 1, { ranged: def.range >= 2 });
          emit(w, { t: 'cast', src: s.id, ability: s.defId, target: tgt.id });
        }
        break;
      }
      case 'provoca':
      case 'aura':
      case 'muralha':
      case 'cura_menos_vida':
        for (const ef of def.effects) summonEffect(w, s, owner, ef, def.radius, def.range);
        if (def.behavior === 'provoca' && s.stats.attack > 0) {
          const t = nearestVisibleHostile(w, s, Math.max(1, def.range));
          if (t) dealDamage(w, s, t, 1);
        }
        break;
      default:
        break;
    }
  }
}

/** Efeito de invocação: área no raio da invocação (ou no raio próprio) ou alvo único. */
function summonEffect(w: World, s: Entity, owner: Entity, ef: Effect, radius: number, range: number): void {
  const r = ef.radius ?? radius;
  const sel = ef.target ?? 'inimigos_area';
  const abilityId = `invocacao:${s.defId}`;
  let targets: Entity[] = [];
  if (sel === 'aliado_menos_vida') {
    const t = lowestHpAlly(w, s, Math.max(range, 2), false);
    if (t && t.id !== s.id) targets = [t];
  } else if (sel === 'inimigo_mais_perto') {
    const t = nearestVisibleHostile(w, s, Math.max(range, 1));
    if (t) targets = [t];
  } else {
    for (const t of w.entities.values()) {
      if (t.id === s.id || !isUp(t) || t.kind === 'loot' || t.kind === 'summon') continue;
      if (dist(s.x, s.y, t.x, t.y) - t.radius > r) continue;
      if (sel === 'inimigos_area' ? !isTargetableBy(s, t) : !isFriendly(s, t)) continue;
      if (!canSee(w, s, t)) continue;
      targets.push(t);
    }
  }
  for (const t of targets) {
    switch (ef.kind) {
      case 'dano':
        dealDamage(w, s, t, ef.mult);
        break;
      case 'cura':
        heal(w, s, t, healAmount(w, owner, t, ef));
        break;
      case 'controle':
        applyControl(w, t, s, ef.cc, ef.duracaoMs, { abilityId });
        break;
      case 'reforco':
        applyBuff(w, t, s, ef.stat, ef.pct, ef.duracaoMs, abilityId);
        break;
      case 'lentidao':
        applyStatus(w, t, s, { kind: 'lentidao', durationMs: ef.duracaoMs, value: ef.pct, abilityId });
        break;
      case 'escudo':
        applyShield(w, t, s, (ef.pctVidaMax / 100) * t.stats.hpMax, ef.duracaoMs, abilityId);
        break;
      case 'puxar':
        pullToward(w, t, s.x, s.y, ef.tiles ?? 1);
        break;
      default:
        break;
    }
  }
}
