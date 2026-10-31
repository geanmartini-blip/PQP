/**
 * Um tick da simulação (50 ms), nesta ordem:
 *  1. intenções (alvos que sumiram, joystick)   8. zonas e campos
 *  2. IA (tickAi) e Doutrina (tickDoctrine)      9. estados: dano contínuo e expiração
 *  3. movimento                                 10. recurso, carga do Especial, recargas, regeneração
 *  4. alvo automático                           11. caído, levantar e volta ao QG
 *  5. ataque básico automático                  12. XP, saque e moeda (e coleta)
 *  6. habilidades em carga e pendentes          13. invocações, expiração e limpeza
 *  7. avisos no chão que chegaram no impacto    14. histórico de posições
 * Os eventos do tick ficam em w.events e são o retorno.
 *
 * ATENÇÃO: step() zera w.events no começo. Eventos soltos por applyCommand ENTRE dois steps (o
 * 'cast' de um botão, a fala de um NPC) somem se quem chama não guardar antes: o servidor
 * (server/src/core.ts) e o servidor local do cliente (client/src/net/localServer.ts) guardam e
 * juntam ao retorno do step seguinte. O simulador não chama applyCommand (luta pela Doutrina).
 */
import { getData } from '../data';
import { circleFree } from '../map/grid';
import { doBasicAttack, effectiveRange, tickCasting, tickTelegraphs, tickZones } from './abilities';
import { tickAi } from './ai';
import { resourceMaxOf, respawnAtHq, reviveEntity, specialFactor } from './combat';
import { bal, ENEMY_SEPARATION_PER_TICK, JOYSTICK_DEADZONE } from './constants';
import { tickDoctrine } from './doctrine';
import { canMove, entityList, getEnt, isPartyMember, isUp, statPts } from './entity';
import { dist, facingFrom } from './geom';
import { moveVelocity, stepMovement, velocityToward } from './movement';
import { tickPickup, tickRewards } from './rewards';
import { cooldownRate, moveSpeedOf } from './stats';
import { tickStatuses } from './statusTick';
import { tickSummons } from './summons';
import { autoTarget } from './targeting';
import { msToTicks, TICK_MS, TICK_RATE, type CombatEvent, type Entity, type World } from './types';
import { emit, recordHistory } from './world';

export function step(w: World): CombatEvent[] {
  w.tick++;
  w.events = [];
  // 1. intenções
  for (const e of entityList(w)) {
    if (e.targetId !== undefined && !w.entities.has(e.targetId)) e.targetId = undefined;
  }
  // 2. IA e Doutrina
  for (const e of entityList(w)) {
    if (e.kind === 'enemy') tickAi(w, e);
    else if (e.auto && isPartyMember(e)) tickDoctrine(w, e);
  }
  // 3. movimento
  movementPhase(w);
  // 4. alvo automático
  for (const e of entityList(w)) {
    if (isPartyMember(e) || e.kind === 'enemy') autoTarget(w, e);
  }
  // 5. básico automático
  for (const e of entityList(w)) {
    if ((isPartyMember(e) || e.kind === 'enemy') && isUp(e)) doBasicAttack(w, e);
  }
  // 6. carga curta e pendentes
  tickCasting(w);
  // 7. avisos no chão
  tickTelegraphs(w);
  // 8. zonas
  tickZones(w);
  // 9. estados
  tickStatuses(w);
  // 10. recurso, Especial, recargas
  resourcePhase(w);
  // 11. caído e levantar
  downedPhase(w);
  // 12. XP, saque e moeda
  tickRewards(w);
  tickPickup(w);
  // 13. invocações e limpeza
  tickSummons(w);
  cleanup(w);
  // 14. histórico
  recordHistory(w);
  return w.events;
}

// ---------------------------------------------------------------------------

function movementPhase(w: World): void {
  const D = getData();
  for (const e of entityList(w)) {
    if (e.kind === 'loot' || e.kind === 'summon' || (e.kind === 'npc' && e.team === 'neutros')) continue;
    if (!canMove(e)) {
      e.vel = { x: 0, y: 0 };
      continue;
    }
    const speed = moveSpeedOf(e);
    let vx = 0, vy = 0;
    const joy = Math.hypot(e.moveIntent.x, e.moveIntent.y) >= JOYSTICK_DEADZONE;
    if (joy) {
      ({ vx, vy } = moveVelocity(e.moveIntent, speed));
    } else if (e.path && e.path.length > 0) {
      while (e.path.length > 0 && dist(e.x, e.y, e.path[0]!.x, e.path[0]!.y) < 0.15) e.path.shift();
      const wp = e.path[0] ?? e.moveTo;
      if (wp) ({ vx, vy } = velocityToward(e, wp.x, wp.y, speed, TICK_MS));
      if (e.path.length === 0) e.path = undefined;
    } else if (e.moveTo) {
      const v = velocityToward(e, e.moveTo.x, e.moveTo.y, speed, TICK_MS);
      if (v.dist < 0.1) e.moveTo = undefined;
      else ({ vx, vy } = v);
    } else if (e.pendingCast) {
      const p = e.pendingCast;
      const a = D.abilities.get(p.abilityId);
      const t = getEnt(w, p.targetId);
      const goal = t ? { x: t.x, y: t.y, r: t.radius } : p.at ? { x: p.at.x, y: p.at.y, r: 0 } : undefined;
      if (a && goal) {
        const range = effectiveRange(e, a);
        if (dist(e.x, e.y, goal.x, goal.y) - e.radius - goal.r > range - 0.2) ({ vx, vy } = velocityToward(e, goal.x, goal.y, speed, TICK_MS));
      }
    }
    if (e.kind === 'enemy' && e.moveTo && dist(e.x, e.y, e.moveTo.x, e.moveTo.y) < 0.1) e.moveTo = undefined;
    if (vx !== 0 || vy !== 0) {
      const p = stepMovement(w.map, e, vx, vy, TICK_MS);
      e.x = p.x;
      e.y = p.y;
      e.facing = facingFrom(vx, vy, e.facing);
    } else {
      const t = getEnt(w, e.targetId);
      if (t) e.facing = facingFrom(t.x - e.x, t.y - e.y, e.facing);
    }
    e.vel = { x: vx, y: vy };
  }
  // separação suave entre inimigos (o bando não vira um ponto só)
  const foes = entityList(w).filter((e) => e.kind === 'enemy' && isUp(e) && e.ai?.['imovel'] !== true);
  for (let i = 0; i < foes.length; i++) {
    for (let j = i + 1; j < foes.length; j++) {
      const a = foes[i]!, b = foes[j]!;
      const d = dist(a.x, a.y, b.x, b.y);
      const min = a.radius + b.radius;
      if (d >= min || d < 1e-6) continue;
      const push = Math.min(ENEMY_SEPARATION_PER_TICK, (min - d) / 2);
      const ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
      if (circleFree(w.map, a.x - ux * push, a.y - uy * push, a.radius)) {
        a.x -= ux * push;
        a.y -= uy * push;
      }
      if (circleFree(w.map, b.x + ux * push, b.y + uy * push, b.radius)) {
        b.x += ux * push;
        b.y += uy * push;
      }
    }
  }
}

function resourcePhase(w: World): void {
  const b = bal();
  const esp = b.especial;
  const regen = b.combate.regenForaDeCombate;
  for (const e of entityList(w)) {
    if (e.kind === 'loot' || e.dead) continue;
    // recargas andam pelo fator da Velocidade e pelos reforços de recarga
    const rate = cooldownRate(e);
    for (const k of Object.keys(e.cooldowns)) {
      const ready = e.cooldowns[k]!;
      if (ready <= w.tick) {
        delete e.cooldowns[k];
        continue;
      }
      if (Math.abs(rate - 1) > 1e-9) e.cooldowns[k] = ready - (rate - 1);
    }
    if (!isUp(e)) continue;
    // recurso da classe
    const rmax = resourceMaxOf(e);
    if (rmax > 0 && e.resource < rmax) {
      e.resource = Math.min(rmax, e.resource + (e.stats.resourceRegenPerS / TICK_RATE) * (1 + statPts(e, 'resourceRegen') / 100));
    }
    if (!isPartyMember(e)) continue;
    // carga do Especial: pontos no banco, soltos respeitando teto e piso por segundo
    if (e.loadout?.especial && e.special < 1) {
      const inCombat = e.lastCombatTick !== undefined && w.tick - e.lastCombatTick <= msToTicks(regen.aposMs);
      const active = e.lastActiveTick !== undefined && w.tick - e.lastActiveTick <= msToTicks(esp.janelaAtivoMs);
      const f = specialFactor(e);
      const bonus = 1 + statPts(e, 'specialCharge') / 100;
      let bank = e.specialBank ?? 0;
      if (inCombat) bank += (esp.porSegundoEmCombate / TICK_RATE) * bonus;
      const teto = (esp.tetoPorS * f * bonus) / TICK_RATE;
      const piso = (esp.pisoPorSAtivo * f * bonus) / TICK_RATE;
      let release = Math.min(bank, teto);
      bank -= release;
      if (active && release < piso) release = piso;
      e.specialBank = bank;
      if (release > 0) {
        e.special = Math.min(1, e.special + release / (esp.cargaMax * f));
        if (e.special >= 1) {
          e.special = 1;
          e.specialBank = 0;
          emit(w, { t: 'special_ready', dst: e.id });
        }
      }
    }
    // regeneração fora de combate
    const idle = e.lastCombatTick === undefined || w.tick - e.lastCombatTick >= msToTicks(regen.aposMs);
    // (direto na vida: sem evento 'heal' a cada tick e sem contar como "curou" para o Especial)
    if (idle && e.hp < e.stats.hpMax) e.hp = Math.min(e.stats.hpMax, e.hp + ((regen.pctVidaPorS / 100) * e.stats.hpMax) / TICK_RATE);
  }
}

function downedPhase(w: World): void {
  const c = bal().combate;
  const all = entityList(w);
  for (const e of all) {
    if (e.downedUntil === undefined || e.dead) continue;
    const helper = all.find((o) => o.id !== e.id && o.team === e.team && isUp(o) && isPartyMember(o) && dist(o.x, o.y, e.x, e.y) <= c.levantarRaioTiles);
    if (helper) {
      e.reviveProgressMs = (e.reviveProgressMs ?? 0) + TICK_MS;
      if (e.reviveProgressMs >= c.levantarMs) {
        reviveEntity(w, e, c.levantarVidaPct, helper);
        continue;
      }
    } else e.reviveProgressMs = 0; // SUGESTÃO: sair de perto zera o progresso
    if (w.tick >= e.downedUntil) respawnAtHq(w, e);
  }
}

function cleanup(w: World): void {
  for (const e of entityList(w)) {
    const gone =
      (e.kind === 'loot' && (e.dead || (e.expiresTick !== undefined && w.tick >= e.expiresTick))) ||
      (e.kind === 'summon' && e.dead) ||
      (e.kind === 'enemy' && e.dead && (e.ai?.['rewarded'] === true));
    if (gone) w.entities.delete(e.id);
  }
}

/** Avança n ticks (testes e simulador). Devolve todos os eventos. */
export function stepN(w: World, n: number): CombatEvent[] {
  const out: CombatEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...step(w));
  return out;
}
