/**
 * Executor de habilidades: os 6 tipos (travada, em_volta, area_alvo, cone, campo, aliado), todos
 * os kinds de Effect e os seletores de alvo. Ninguém mira à mão:
 * - travada acerta o alvo travado (sem alvo, pega o inimigo visível mais perto ou é recusada);
 * - area_alvo cai no alvo (ou onde o jogador arrastou, até o alcance);
 * - cone aponta sozinho para o alvo; em_volta sai de quem lança;
 * - campo fica no chão (no alvo, ou em quem lança quando range = 0);
 * - aliado vai no aliado tocado, no mais perto ou no mais ferido, conforme o seletor.
 * Sem alvo, área e cone saem na direção em que o personagem olha. Fora do alcance, o personagem
 * anda sozinho até o alcance e lança (pendingCast, expira em PENDING_CAST_MS).
 * Respeita recarga, custo, recarga global, castMs, telegraphMs, raio, ângulo e alcance.
 */
import { getData } from '../data';
import { circleFree, hasLineOfSight } from '../map/grid';
import { HIT_TOLERANCE_TILES, MAX_REWIND_MS } from '../net/protocol';
import type { Ability, Effect } from '../schema/ability';
import './builtinHooks';
import {
  addSpecialPts,
  applyBuff,
  applyControl,
  applyShield,
  applyStatus,
  dealDamage,
  heal,
  healAmount,
  pullToward,
  pushFrom,
  removeStatuses,
  resourceDef,
  resourceMaxOf,
  reviveEntity,
} from './combat';
import {
  ACQUIRE_RADIUS,
  bal,
  IMPLICIT_GROUP_TILES,
  LANE_HALF_WIDTH,
  PENDING_CAST_MS,
  RETREAT_SCAN_TILES,
  SELECTOR_FALLBACK_RANGE,
  SUMMON_FREE_RADIUS,
  SUMMON_RING_TILES,
  SUMMON_SPAWN_TILES,
  VIEW_RADIUS,
} from './constants';
import {
  canAct,
  canBasic,
  firstStatus,
  getEnt,
  HARMFUL_STATUS,
  hasStatus,
  hpRatio,
  isDamageable,
  isFriendly,
  isHostile,
  isPartyMember,
  isTargetableBy,
  isUp,
  statPts,
} from './entity';
import { angleTo, dist, facingAngle, facingFrom, inCone, pointSegDist } from './geom';
import { getHook } from './hooks';
import { moveBody } from './movement';
import { spawnLoot, spawnSummon } from './spawn';
import { basicIntervalTicks, ritmoMult } from './stats';
import { canSee, nearestVisibleHostile } from './targeting';
import { msToTicks, type Entity, type GroundZone, type Team, type Telegraph, type Vec, type World } from './types';
import { emit, historicalPos, newId } from './world';

export interface CastOpts {
  /** ponto arrastado (só posiciona áreas; é limitado ao alcance) */
  at?: Vec;
  /** alvo escolhido (aliado tocado, ou inimigo diferente do travado) */
  targetId?: number;
  /** compensação de atraso: confere alcance e visão do alvo na posição de N ticks atrás */
  rewindTicks?: number;
}

type Shape = { kind: 'circulo'; x: number; y: number; radius: number } | { kind: 'cone'; x: number; y: number; dir: number; range: number; angleDeg: number } | { kind: 'alvo' };

interface Plan {
  targetId?: number;
  point: Vec;
  dir: number;
  /** origem fixa (avisos no chão: a área não segue quem lançou) */
  origin?: Vec;
}

/** Contexto de resolução dos efeitos de uma habilidade (ou de um tick de campo). */
interface Ctx {
  w: World;
  caster: Entity;
  ability: Ability;
  team: Team;
  point: Vec;
  origin: Vec;
  dir: number;
  targetId?: number;
  shape: Shape;
  range: number;
  pathFrom?: Vec;
  pathTo?: Vec;
  /** quem foi atingido (inimigo ou aliado), para a carga do Especial */
  hit: Set<number>;
  /** Turnê Mundial: reforço de área pega o grupo todo */
  groupBuff?: boolean;
  /** este ctx é um tick de campo */
  zone?: GroundZone;
  /** a origem é fixa (aviso no chão): empurrão e puxão saem dela, não de onde quem lançou está agora */
  fixedOrigin?: boolean;
}

const ab = (id: string) => getData().abilities.get(id);

/** Alcance real da habilidade para quem lança (rangeDoAlcance usa o Alcance da tabela). */
export function effectiveRange(e: Entity, a: Ability): number {
  const r = a.rangeDoAlcance ? e.stats.range : a.range;
  return r * (1 + statPts(e, 'range') / 100);
}

/**
 * Alcance que o personagem precisa atingir (borda a borda) para a habilidade pegar o alvo: o
 * alcance real, menos o raio de quem lança no cone (o cone sai do centro do corpo).
 */
export function approachRange(e: Entity, a: Ability): number {
  return effectiveRange(e, a) - (a.type === 'cone' ? e.radius : 0);
}

const areaMult = (e: Entity) => Math.max(0.25, 1 + statPts(e, 'areaSize') / 100);

/** Borda a borda: dist − raio de quem lança − raio do alvo <= alcance + tolerância. */
const within = (e: Entity, x: number, y: number, r: number, range: number, tol = 0) => dist(e.x, e.y, x, y) - e.radius - r <= range + tol;

/** Dano à distância (projétil, tiro): bloqueado por Muralha de Escudos. */
const isRanged = (e: Entity, a: Ability) => (a.type === 'travada' || a.type === 'area_alvo' || a.type === 'campo') && effectiveRange(e, a) >= 2;

/** Ponto à frente de quem lança, recuado até ter linha de visão. */
function frontPoint(w: World, e: Entity, dirAng: number, range: number): Vec {
  for (let d = range; d > 0; d -= 0.5) {
    const x = e.x + Math.cos(dirAng) * d, y = e.y + Math.sin(dirAng) * d;
    if (hasLineOfSight(w.map, e.x, e.y, x, y)) return { x, y };
  }
  return { x: e.x, y: e.y };
}

/** Ponto arrastado limitado ao alcance e à linha de visão. */
function clampPoint(w: World, e: Entity, at: Vec, range: number): Vec {
  const d = dist(e.x, e.y, at.x, at.y);
  const a = Math.atan2(at.y - e.y, at.x - e.x);
  if (d <= range && hasLineOfSight(w.map, e.x, e.y, at.x, at.y)) return { x: at.x, y: at.y };
  return frontPoint(w, e, a, Math.min(d, range));
}

/** Alvo hostil: o pedido, o travado ou o inimigo visível mais perto no alcance. */
function hostileTarget(w: World, e: Entity, opts: CastOpts, range: number): Entity | undefined {
  const t = getEnt(w, opts.targetId ?? e.targetId);
  if (t && isTargetableBy(e, t)) return t;
  return nearestVisibleHostile(w, e, range);
}

/** O alvo está no alcance e à vista agora, ou estava há rewindTicks (com tolerância de 1 tile). */
function reachable(w: World, e: Entity, t: Entity, range: number, rewindTicks: number): boolean {
  if (within(e, t.x, t.y, t.radius, range) && canSee(w, e, t)) return true;
  if (rewindTicks > 0) {
    const h = historicalPos(w, t.id, Math.min(rewindTicks, msToTicks(MAX_REWIND_MS)));
    if (h && within(e, h[0], h[1], t.radius, range, HIT_TOLERANCE_TILES) && hasLineOfSight(w.map, e.x, e.y, h[0], h[1])) return true;
  }
  return false;
}

type PlanResult = { kind: 'ok'; plan: Plan } | { kind: 'approach'; targetId?: number } | { kind: 'fail' };

/** Decide alvo, ponto e direção da habilidade (ou pede para andar até o alcance). */
function planCast(w: World, e: Entity, a: Ability, opts: CastOpts): PlanResult {
  const range = effectiveRange(e, a);
  const rewind = opts.rewindTicks ?? 0;
  const face = facingAngle(e.facing);
  switch (a.type) {
    case 'travada': {
      const t = hostileTarget(w, e, opts, range);
      if (!t) return { kind: 'fail' };
      if (!reachable(w, e, t, range, rewind)) return { kind: 'approach', targetId: t.id };
      return { kind: 'ok', plan: { targetId: t.id, point: { x: t.x, y: t.y }, dir: angleTo(e, t) } };
    }
    case 'area_alvo':
    case 'campo': {
      if (a.type === 'campo' && a.range <= 0) {
        const t = hostileTarget(w, e, opts, Math.max(range, a.radius));
        return { kind: 'ok', plan: { targetId: t?.id, point: { x: e.x, y: e.y }, dir: t ? angleTo(e, t) : face } };
      }
      if (opts.at) {
        const p = clampPoint(w, e, opts.at, range);
        return { kind: 'ok', plan: { targetId: e.targetId, point: p, dir: Math.atan2(p.y - e.y, p.x - e.x) } };
      }
      const t = getEnt(w, opts.targetId ?? e.targetId);
      if (t && isTargetableBy(e, t)) {
        if (!reachable(w, e, t, range, rewind)) return { kind: 'approach', targetId: t.id };
        return { kind: 'ok', plan: { targetId: t.id, point: { x: t.x, y: t.y }, dir: angleTo(e, t) } };
      }
      return { kind: 'ok', plan: { point: frontPoint(w, e, face, range), dir: face } };
    }
    case 'cone': {
      // alvo travado (ou o inimigo visível mais perto a até ACQUIRE_RADIUS): fora do alcance, anda
      // até lá como a travada; sem inimigo nenhum, sai na direção em que o personagem olha
      // (o cone mede do centro de quem lança: approachRange; sem compensação de atraso, porque o
      // cone resolve agora nas posições atuais e erraria quem só estava no alcance 250 ms atrás)
      const t = hostileTarget(w, e, opts, Math.max(range, ACQUIRE_RADIUS));
      if (t && !reachable(w, e, t, approachRange(e, a), 0)) return { kind: 'approach', targetId: t.id };
      return { kind: 'ok', plan: { targetId: t?.id, point: { x: e.x, y: e.y }, dir: t ? angleTo(e, t) : face } };
    }
    case 'em_volta': {
      const t = getEnt(w, e.targetId);
      return { kind: 'ok', plan: { targetId: t && isTargetableBy(e, t) ? t.id : undefined, point: { x: e.x, y: e.y }, dir: t ? angleTo(e, t) : face } };
    }
    case 'aliado': {
      const t = getEnt(w, opts.targetId);
      const ok = t && isFriendly(e, t) && isUp(t) && within(e, t.x, t.y, t.radius, Math.max(range, 0.5));
      return { kind: 'ok', plan: { targetId: ok ? t!.id : undefined, point: { x: e.x, y: e.y }, dir: face } };
    }
  }
}

/** Custo com o modificador resourceCost (negativo = mais barato). */
const costOf = (e: Entity, a: Ability) => a.cost * Math.max(0, 1 + statPts(e, 'resourceCost') / 100);

/** A habilidade está no botão de item e há consumível? */
function itemSlotOk(e: Entity, a: Ability): boolean {
  if (a.slot !== 'item' || !e.loadout?.item) return true;
  const c = getData().consumablesById.get(e.loadout.item);
  if (c?.habilidade !== a.id) return true;
  return (e.loadout.itemCount ?? 0) > 0;
}

/**
 * Usa uma habilidade. Devolve true quando aceitou: lançou agora, começou a carga (castMs), pôs o
 * aviso no chão, ou ficou esperando o alcance (o personagem anda até lá; custo e recarga só são
 * pagos quando sai). Devolve false se recusou: recarga, recarga global, custo, Especial sem
 * carga, controle, morto/caído, sem consumível, travada sem alvo visível.
 */
export function castAbility(w: World, caster: Entity, abilityId: string, opts: CastOpts = {}): boolean {
  return tryCast(w, caster, abilityId, opts, false);
}

function tryCast(w: World, e: Entity, abilityId: string, opts: CastOpts, fromPending: boolean): boolean {
  const a = ab(abilityId);
  if (!a || !isUp(e) || !canAct(e) || e.casting) return false;
  const especial = a.slot === 'especial' || a.slot === 'virada';
  if (especial && e.special < 1) return false;
  if (a.slot !== 'basico' && a.slot !== 'item' && w.tick < e.gcdUntil) return false;
  if ((e.cooldowns[a.id] ?? 0) > w.tick) return false;
  if (costOf(e, a) > e.resource + 1e-9) return false;
  if (!itemSlotOk(e, a)) return false;
  const r = planCast(w, e, a, opts);
  if (r.kind === 'fail') return false;
  if (r.kind === 'approach') {
    if (!fromPending || !e.pendingCast) {
      e.pendingCast = {
        abilityId: a.id,
        ...(r.targetId !== undefined ? { targetId: r.targetId } : {}),
        ...(opts.at ? { at: opts.at } : {}),
        untilTick: w.tick + msToTicks(PENDING_CAST_MS),
      };
    }
    if (r.targetId !== undefined && e.targetId === undefined) e.targetId = r.targetId;
    return true;
  }
  if (!fromPending) e.pendingCast = undefined;
  commit(w, e, a, r.plan);
  return true;
}

/** Paga e solta: custo, recarga, recarga global, carga do Especial, consumível, evento. */
function commit(w: World, e: Entity, a: Ability, plan: Plan): void {
  const c = bal().combate;
  e.resource = Math.max(0, e.resource - costOf(e, a));
  if (a.cooldownS > 0) e.cooldowns[a.id] = w.tick + msToTicks(a.cooldownS * 1000);
  if (a.slot !== 'basico' && a.slot !== 'item') e.gcdUntil = w.tick + msToTicks(c.recargaGlobalMs);
  if (a.slot === 'especial' || a.slot === 'virada') {
    e.special = 0;
    e.specialBank = 0;
  }
  if (a.slot === 'item' && e.loadout?.item && getData().consumablesById.get(e.loadout.item)?.habilidade === a.id) {
    e.loadout.itemCount = Math.max(0, (e.loadout.itemCount ?? 0) - 1);
  }
  e.pendingCast = undefined;
  if (plan.targetId !== undefined || a.type !== 'em_volta') {
    e.facing = facingFrom(Math.cos(plan.dir), Math.sin(plan.dir), e.facing);
  }
  emit(w, { t: 'cast', src: e.id, ability: a.id, ...(plan.targetId !== undefined ? { target: plan.targetId } : {}), x: plan.point.x, y: plan.point.y });
  if (a.castMs > 0) {
    e.casting = { abilityId: a.id, readyTick: w.tick + msToTicks(a.castMs), point: plan.point, dir: plan.dir, ...(plan.targetId !== undefined ? { targetId: plan.targetId } : {}) };
    return;
  }
  release(w, e, a, plan);
}

/** Depois da carga: põe o aviso no chão ou resolve na hora. */
function release(w: World, e: Entity, a: Ability, plan: Plan): void {
  if (a.telegraphMs > 0) {
    const tel = telegraphFor(w, e, a, plan);
    w.telegraphs.push(tel);
    emit(w, { t: 'telegraph', tel });
    return;
  }
  resolveAbility(w, e, a, plan);
}

/** Aviso no chão: círculo (em volta, área, campo) ou cone, preso onde foi lançado. */
function telegraphFor(w: World, e: Entity, a: Ability, plan: Plan): Telegraph {
  const range = effectiveRange(e, a);
  const base = { id: newId(w), sourceId: e.id, abilityId: a.id, startTick: w.tick, impactTick: w.tick + msToTicks(a.telegraphMs), team: e.team, ...(plan.targetId !== undefined ? { targetId: plan.targetId } : {}) };
  if (a.type === 'cone') return { ...base, shape: 'cone', x: e.x, y: e.y, radius: range, dir: plan.dir, angleDeg: a.angleDeg ?? 90 };
  const center = a.type === 'em_volta' ? { x: e.x, y: e.y } : plan.point;
  return { ...base, shape: 'circulo', x: center.x, y: center.y, radius: Math.max(a.radius, 1) * areaMult(e) };
}

// ---------------------------------------------------------------------------
// Resolução

function makeCtx(w: World, e: Entity, a: Ability, plan: Plan): Ctx {
  const range = effectiveRange(e, a);
  const origin = plan.origin ?? { x: e.x, y: e.y };
  const am = areaMult(e);
  let shape: Shape;
  switch (a.type) {
    case 'em_volta':
      shape = { kind: 'circulo', x: origin.x, y: origin.y, radius: a.radius * am };
      break;
    case 'area_alvo':
    case 'campo':
      shape = { kind: 'circulo', x: plan.point.x, y: plan.point.y, radius: a.radius * am };
      break;
    case 'cone':
      shape = { kind: 'cone', x: origin.x, y: origin.y, dir: plan.dir, range: range, angleDeg: a.angleDeg ?? 90 };
      break;
    case 'aliado':
      shape = { kind: 'circulo', x: origin.x, y: origin.y, radius: Math.max(a.radius, range) };
      break;
    default:
      shape = { kind: 'alvo' };
  }
  const ctx: Ctx = { w, caster: e, ability: a, team: e.team, point: { ...plan.point }, origin, dir: plan.dir, shape, range, hit: new Set() };
  if (plan.targetId !== undefined) ctx.targetId = plan.targetId;
  if (plan.origin) ctx.fixedOrigin = true;
  const turne = firstStatus(e, 'turne_mundial');
  if (turne && turne.data?.['habilidade'] === a.id) ctx.groupBuff = true;
  return ctx;
}

/** Resolve todos os efeitos agora. Devolve quantos foram atingidos. */
export function resolveAbility(w: World, e: Entity, a: Ability, plan: Plan): number {
  const ctx = makeCtx(w, e, a, plan);
  a.effects.forEach((eff, i) => applyEffect(ctx, eff, i));
  if (ctx.groupBuff && firstStatus(e, 'turne_mundial')?.data?.['zerarRecargas'] !== false) {
    // Turnê Mundial: cada Fanchant do show zera as recargas do grupo (menos o próprio Fanchant)
    for (const m of groupOf(w, e, false)) {
      if (m.id === e.id) {
        for (const k of Object.keys(m.cooldowns)) if (k !== a.id) delete m.cooldowns[k];
      } else m.cooldowns = {};
    }
  }
  if (ctx.hit.size > 0 && a.slot !== 'basico' && !ctx.zone) addSpecialPts(e, bal().especial.porHabilidadeQueAcerta);
  return ctx.hit.size;
}

const HARMFUL_KINDS = new Set(['dano', 'dano_continuo', 'controle', 'lentidao', 'empurrar', 'puxar', 'marca', 'derrubar_moeda', 'explode_ao_morrer']);

function defaultSelector(ctx: Ctx, eff: Effect): string {
  if (HARMFUL_KINDS.has(eff.kind)) return ctx.ability.type === 'travada' && eff.radius === undefined ? 'alvo' : 'inimigos_area';
  if (ctx.ability.type === 'aliado') return 'aliado_menos_vida';
  return 'self';
}

/**
 * Membros do grupo de `e`: com partyId, quem tem o mesmo partyId; sem grupo, um grupo implícito
 * de quem também está sem grupo (jogadores e companheiros do time) a até IMPLICIT_GROUP_TILES
 * (nunca o mapa inteiro: reforço de grupo, Turnê Mundial e a cura da Doutrina não vão atrás de
 * estranhos longe).
 */
export function groupOf(w: World, e: Entity, includeDowned: boolean): Entity[] {
  const out: Entity[] = [];
  for (const m of w.entities.values()) {
    if (m.team !== e.team || m.dead) continue;
    if (m.id !== e.id) {
      if (!isPartyMember(m)) continue;
      if (e.partyId !== undefined ? m.partyId !== e.partyId : m.partyId !== undefined || dist(e.x, e.y, m.x, m.y) > IMPLICIT_GROUP_TILES) continue;
    }
    if (!includeDowned && m.downedUntil !== undefined) continue;
    out.push(m);
  }
  return out;
}

function inShape(ctx: Ctx, shape: Shape, t: Entity): boolean {
  const map = ctx.w.map;
  if (shape.kind === 'circulo') {
    if (dist(shape.x, shape.y, t.x, t.y) - t.radius > shape.radius) return false;
    return hasLineOfSight(map, shape.x, shape.y, t.x, t.y);
  }
  if (shape.kind === 'cone') {
    if (!inCone(shape.x, shape.y, shape.dir, shape.range, shape.angleDeg, t.x, t.y, t.radius)) return false;
    return hasLineOfSight(map, shape.x, shape.y, t.x, t.y);
  }
  return t.id === ctx.targetId;
}

/** Quem recebe o efeito, pelo seletor (ability.ts, TargetSelector). */
function selectTargets(ctx: Ctx, eff: Effect): Entity[] {
  const { w, caster } = ctx;
  let sel = eff.target ?? defaultSelector(ctx, eff);
  if (ctx.groupBuff && eff.kind === 'reforco' && (sel === 'aliados_area' || sel === 'aliados_area_sem_self')) sel = 'grupo';
  const allowDowned = eff.kind === 'levantar';
  const okFriend = (t: Entity) => isFriendly(caster, t) && t.kind !== 'loot' && !t.dead && (allowDowned ? true : t.downedUntil === undefined);
  const okFoe = (t: Entity) => t.id !== caster.id && isHostile(caster, t) && isDamageable(t);
  const shape: Shape = eff.radius !== undefined ? { kind: 'circulo', x: ctx.point.x, y: ctx.point.y, radius: eff.radius * areaMult(caster) } : ctx.shape;
  const selRange = ctx.range > 0 ? ctx.range : ctx.ability.radius > 0 ? ctx.ability.radius : SELECTOR_FALLBACK_RANGE;
  const all = Array.from(w.entities.values());
  switch (sel) {
    case 'self':
      return isUp(caster) || allowDowned ? [caster] : [];
    case 'alvo': {
      const t = getEnt(w, ctx.targetId);
      if (!t) return [];
      if (ctx.ability.type === 'aliado') return okFriend(t) ? [t] : [];
      if (!okFoe(t)) return [];
      // aviso no chão: o alvo só leva se continuou dentro da área
      if (ctx.zone === undefined && ctx.shape.kind !== 'alvo' && ctx.ability.telegraphMs > 0 && !inShape(ctx, ctx.shape, t)) return [];
      return [t];
    }
    case 'inimigos_area': {
      if (shape.kind === 'alvo') {
        const t = getEnt(w, ctx.targetId);
        return t && okFoe(t) ? [t] : [];
      }
      return all.filter((t) => okFoe(t) && !hasStatus(t, 'invisivel') && inShape(ctx, shape, t));
    }
    case 'aliados_area':
    case 'aliados_area_sem_self': {
      const s = shape.kind === 'alvo' ? ({ kind: 'circulo', x: caster.x, y: caster.y, radius: Math.max(2, selRange) } as Shape) : shape;
      return all.filter((t) => okFriend(t) && t.kind !== 'summon' && (sel === 'aliados_area' || t.id !== caster.id) && inShape(ctx, s, t));
    }
    case 'grupo':
      return groupOf(w, caster, allowDowned).filter((t) => okFriend(t));
    case 'aliado_menos_vida': {
      const picked = getEnt(w, ctx.targetId);
      if (picked && okFriend(picked) && picked.kind !== 'summon') return [picked];
      let best: Entity | undefined;
      for (const t of all) {
        if (!okFriend(t) || t.kind === 'summon') continue;
        if (dist(caster.x, caster.y, t.x, t.y) - t.radius > selRange) continue;
        if (!best || hpRatio(t) < hpRatio(best) - 1e-9) best = t;
      }
      return best ? [best] : [];
    }
    case 'aliado_mais_perto': {
      const picked = getEnt(w, ctx.targetId);
      if (picked && okFriend(picked) && picked.id !== caster.id && picked.kind !== 'summon') return [picked];
      let best: Entity | undefined;
      let bd = Infinity;
      for (const t of all) {
        if (!okFriend(t) || t.id === caster.id || t.kind === 'summon') continue;
        const d = dist(caster.x, caster.y, t.x, t.y) - t.radius;
        if (d <= selRange && d < bd) {
          bd = d;
          best = t;
        }
      }
      return best ? [best] : [];
    }
    case 'inimigo_mais_perto': {
      const t = nearestVisibleHostile(w, caster, selRange);
      return t ? [t] : [];
    }
    case 'inimigos_a_vista':
      return all.filter((t) => isTargetableBy(caster, t) && dist(caster.x, caster.y, t.x, t.y) - t.radius <= VIEW_RADIUS && canSee(w, caster, t));
    case 'inimigos_caminho': {
      const from = ctx.pathFrom ?? { x: caster.x, y: caster.y };
      let to = ctx.pathTo;
      if (!to) {
        const len = Math.max(ctx.range, 1);
        to = { x: caster.x + Math.cos(ctx.dir) * len, y: caster.y + Math.sin(ctx.dir) * len };
      }
      // avanço (bateNoCaminho): o corredor vai de onde saiu até onde parou; tiro que atravessa
      // (perfura): de quem lança até o fim do alcance, passando pelo alvo
      const hits = all.filter((t) => {
        if (!okFoe(t) || hasStatus(t, 'invisivel')) return false;
        if (pointSegDist(t.x, t.y, from.x, from.y, to!.x, to!.y) > t.radius + LANE_HALF_WIDTH) return false;
        return hasLineOfSight(w.map, from.x, from.y, t.x, t.y);
      });
      const tgt = getEnt(w, ctx.targetId);
      if (tgt && okFoe(tgt) && !hits.includes(tgt)) hits.push(tgt);
      hits.sort((p, q) => dist(from.x, from.y, p.x, p.y) - dist(from.x, from.y, q.x, q.y) || p.id - q.id);
      return hits;
    }
  }
  return [];
}

/** Aplica um efeito (com chance) aos alvos do seletor. */
function applyEffect(ctx: Ctx, eff: Effect, index: number): void {
  const { w, caster, ability: a } = ctx;
  if (eff.chance !== undefined && w.rng.next() >= eff.chance) return;
  switch (eff.kind) {
    case 'avanco':
      doDash(ctx, eff.salto === true);
      return;
    case 'recuo':
      doRetreat(ctx, eff.tiles, eff.de);
      return;
    case 'campo':
      createZone(ctx, eff, index);
      return;
    case 'invocar':
      doSummon(ctx, eff.invocacao, eff.duracaoMs, eff.max, eff.quantidade ?? 1);
      return;
    case 'gancho': {
      const targets = eff.target ? selectTargets(ctx, eff) : [caster];
      getHook(eff.gancho)({ w, caster, ability: a, effect: eff, targets, point: ctx.point, params: eff.params ?? {} });
      return;
    }
    case 'dano':
      doDamage(ctx, eff);
      return;
  }
  const targets = selectTargets(ctx, eff);
  const abilityId = a.id;
  for (const t of targets) {
    switch (eff.kind) {
      case 'dano_continuo':
        applyStatus(w, t, caster, {
          kind: 'dano_continuo',
          durationMs: eff.duracaoMs,
          value: eff.multPorTick,
          abilityId,
          data: {
            tickMs: eff.tickMs,
            nextTick: w.tick + msToTicks(eff.tickMs),
            ...(eff.pulaAoMorrer ? { pulaAoMorrer: true } : {}),
            ...(eff.pulaAlcance !== undefined ? { pulaAlcance: eff.pulaAlcance } : {}),
            ...(eff.pulaEntreProximos ? { pulaEntreProximos: true } : {}),
          },
        });
        ctx.hit.add(t.id);
        break;
      case 'cura': {
        const got = heal(w, caster, t, healAmount(w, caster, t, eff), { abilityId });
        if (got > 0) ctx.hit.add(t.id);
        break;
      }
      case 'cura_continua':
        applyStatus(w, t, caster, { kind: 'cura_continua', durationMs: eff.duracaoMs, value: eff.pctVidaMaxPorTick, abilityId, data: { tickMs: eff.tickMs, nextTick: w.tick + msToTicks(eff.tickMs) } });
        ctx.hit.add(t.id);
        break;
      case 'escudo': {
        let amount = (eff.pctVidaMax / 100) * t.stats.hpMax * (1 + statPts(caster, 'shield') / 100);
        if (eff.divididoEntreAliados && targets.length > 1) amount /= targets.length;
        applyShield(w, t, caster, amount, eff.duracaoMs, abilityId, {
          ...(eff.devolvePct ? { devolvePct: eff.devolvePct } : {}),
          ...(eff.seguraProjeteis ? { seguraProjeteis: true } : {}),
        });
        ctx.hit.add(t.id);
        break;
      }
      case 'reducao_dano':
        applyStatus(w, t, caster, { kind: 'reducao_dano', durationMs: eff.duracaoMs, value: eff.pct, abilityId });
        ctx.hit.add(t.id);
        break;
      case 'devolver_dano':
        applyStatus(w, t, caster, { kind: 'devolver_dano', durationMs: eff.duracaoMs, value: eff.pct, abilityId });
        ctx.hit.add(t.id);
        break;
      case 'controle': {
        const r = applyControl(w, t, caster, eff.cc, eff.duracaoMs, { abilityId, ...(eff.quebraAoApanhar ? { quebraAoApanhar: true } : {}) });
        if (r !== 'resistiu') ctx.hit.add(t.id);
        break;
      }
      case 'lentidao':
        applyStatus(w, t, caster, { kind: 'lentidao', durationMs: eff.duracaoMs, value: eff.pct, abilityId });
        ctx.hit.add(t.id);
        break;
      case 'empurrar': {
        // Rodeio: o empurrão com raio próprio numa travada é para quem está em volta do alvo
        if (a.type === 'travada' && eff.radius !== undefined && t.id === ctx.targetId) break;
        const c = pushCenter(ctx, eff.radius !== undefined);
        pushFrom(w, t, c.x, c.y, eff.tiles, ctx.dir);
        ctx.hit.add(t.id);
        break;
      }
      case 'puxar': {
        // sem paraCentro: puxa para quem lançou (com aviso no chão, para onde ele estava ao lançar)
        const c = eff.paraCentro ? ctx.point : casterOrigin(ctx);
        if (eff.duracaoMs) {
          const d = dist(t.x, t.y, c.x, c.y);
          const tiles = eff.tiles ?? d;
          applyStatus(w, t, caster, { kind: 'puxar', durationMs: eff.duracaoMs, value: 1, abilityId, data: { cx: c.x, cy: c.y, speed: Math.max(1, (tiles * 1000) / eff.duracaoMs) } });
        } else pullToward(w, t, c.x, c.y, eff.tiles ?? 2);
        ctx.hit.add(t.id);
        break;
      }
      case 'reforco':
        applyBuff(w, t, caster, eff.stat, eff.pct, eff.duracaoMs, abilityId, eff.acumulaMax);
        ctx.hit.add(t.id);
        break;
      case 'marca':
        applyStatus(w, t, caster, {
          kind: 'marca',
          durationMs: eff.duracaoMs,
          value: eff.danoRecebidoPct,
          abilityId,
          data: { team: caster.team, ...(eff.soDoLancador ? { soDoLancador: true } : {}), ...(eff.pulaAoMorrer ? { pulaAoMorrer: true } : {}) },
        });
        ctx.hit.add(t.id);
        break;
      case 'transformar':
        applyStatus(w, t, caster, {
          kind: 'transformar',
          durationMs: eff.duracaoMs,
          value: 1,
          abilityId,
          data: {
            ...(eff.basico ? { basico: eff.basico } : {}),
            ...(eff.tirosExtras ? { tirosExtras: eff.tirosExtras, tirosExtrasMult: eff.tirosExtrasMult ?? 0.5 } : {}),
          },
        });
        for (const r of eff.reforcos ?? []) applyBuff(w, t, caster, r.stat, r.pct, eff.duracaoMs, abilityId);
        ctx.hit.add(t.id);
        break;
      case 'invisivel': {
        applyStatus(w, t, caster, { kind: 'invisivel', durationMs: eff.duracaoMs, value: 1, abilityId });
        // quem mirava nele perde o alvo
        for (const o of w.entities.values()) if (o.targetId === t.id && o.team !== t.team) o.targetId = undefined;
        if (eff.copia) {
          const def = getData().summonsById.get(eff.copia);
          if (def) spawnSummon(w, t, def.id, t.x, t.y, def.duracaoMs ?? eff.duracaoMs);
        }
        ctx.hit.add(t.id);
        break;
      }
      case 'imune': {
        const any = eff.aDano || eff.aControle || eff.aEmpurrao || eff.aDanoDistancia;
        const data = any
          ? { ...(eff.aDano ? { aDano: true } : {}), ...(eff.aControle ? { aControle: true } : {}), ...(eff.aEmpurrao ? { aEmpurrao: true } : {}), ...(eff.aDanoDistancia ? { aDanoDistancia: true } : {}) }
          : { aDano: true, aControle: true };
        applyStatus(w, t, caster, { kind: 'imune', durationMs: eff.duracaoMs, value: 1, abilityId, data });
        ctx.hit.add(t.id);
        break;
      }
      case 'recurso':
        t.resource = Math.min(resourceMaxOf(t), t.resource + (eff.pct / 100) * resourceMaxOf(t));
        ctx.hit.add(t.id);
        break;
      case 'derrubar_moeda': {
        const moeda = caster.side === 'direita' ? 'credito' : 'semente';
        const ang = w.rng.next() * Math.PI * 2;
        spawnLoot(w, t.x + Math.cos(ang) * 0.5, t.y + Math.sin(ang) * 0.5, { currency: { [moeda]: eff.quantidade } }, moeda === 'credito' ? 'Crédito' : 'Semente');
        ctx.hit.add(t.id);
        break;
      }
      case 'explode_ao_morrer':
        applyStatus(w, t, caster, { kind: 'explode_ao_morrer', durationMs: eff.janelaMs, value: 1, abilityId, data: { mult: eff.mult, raio: eff.raio } });
        ctx.hit.add(t.id);
        break;
      case 'limpar':
        removeStatuses(w, t, (s) => HARMFUL_STATUS.includes(s.kind));
        ctx.hit.add(t.id);
        break;
      case 'zerar_recargas':
        t.cooldowns = {};
        ctx.hit.add(t.id);
        break;
      case 'levantar':
        if (t.downedUntil !== undefined) {
          reviveEntity(w, t, eff.pctVida, caster);
          ctx.hit.add(t.id);
        }
        break;
      case 'segurar_vida':
        applyStatus(w, t, caster, { kind: 'segurar_vida', durationMs: eff.duracaoMs, value: eff.vidaMin, abilityId });
        ctx.hit.add(t.id);
        break;
    }
  }
}

/**
 * Centro do empurrão: quem lança (em volta, cone) ou o ponto de efeito (área, raio próprio). Com
 * aviso no chão ou campo, sai da origem marcada (quem lançou pode ter andado durante o aviso).
 */
function pushCenter(ctx: Ctx, ownRadius: boolean): Vec {
  const t = ctx.ability.type;
  if (ownRadius || t === 'area_alvo' || t === 'campo') return ctx.point;
  return ctx.zone ? ctx.origin : casterOrigin(ctx);
}

/**
 * Onde quem lançou estava para o efeito: em volta e cone com aviso no chão saem do ponto marcado
 * no lançamento (a origem do aviso); o resto sai de onde ele está agora.
 */
function casterOrigin(ctx: Ctx): Vec {
  const t = ctx.ability.type;
  if (ctx.fixedOrigin && (t === 'em_volta' || t === 'cone')) return ctx.origin;
  return { x: ctx.caster.x, y: ctx.caster.y };
}

function doDamage(ctx: Ctx, eff: Extract<Effect, { kind: 'dano' }>): void {
  const { w, caster, ability: a } = ctx;
  const ranged = isRanged(caster, a);
  // Für Wissenschaft!: com essa chance, a explosão cai em volta de quem lançou
  if (eff.culatra && w.rng.next() < eff.culatra.chance) {
    const r = Math.max(2, a.radius) * areaMult(caster);
    // SUGESTÃO: a culatra acerta quem lançou e os aliados dele em volta, com culatra.mult
    for (const t of Array.from(w.entities.values())) {
      if (!isDamageable(t) || t.team !== caster.team || t.kind === 'loot') continue;
      if (dist(caster.x, caster.y, t.x, t.y) - t.radius > r) continue;
      dealDamage(w, caster, t, eff.culatra.mult, { abilityId: a.id, friendlyFire: true, noCrit: true });
    }
    return;
  }
  const targets = selectTargets(ctx, eff);
  const hits = eff.hits ?? 1;
  for (const t of targets) {
    for (let h = 0; h < hits; h++) {
      if (!isDamageable(t)) break;
      if (dealDamage(w, caster, t, eff.mult, { abilityId: a.id, ranged, ...(a.slot === 'basico' ? { basic: true } : {}) }) > 0) ctx.hit.add(t.id);
    }
  }
  // raio que salta para mais N inimigos, perdendo quedaPct a cada salto
  if (eff.salto && targets.length > 0) {
    const done = new Set(targets.map((t) => t.id));
    let last = targets[targets.length - 1]!;
    let mult = eff.mult;
    for (let s = 0; s < eff.salto.saltos; s++) {
      mult *= 1 - (eff.salto.quedaPct ?? 0) / 100;
      let next: Entity | undefined;
      let bd = Infinity;
      for (const t of w.entities.values()) {
        if (done.has(t.id) || !isTargetableBy(caster, t)) continue;
        const d = dist(last.x, last.y, t.x, t.y) - t.radius;
        if (d <= eff.salto.alcance && d < bd && hasLineOfSight(w.map, last.x, last.y, t.x, t.y)) {
          bd = d;
          next = t;
        }
      }
      if (!next) break;
      done.add(next.id);
      if (dealDamage(w, caster, next, mult, { abilityId: a.id, ranged }) > 0) ctx.hit.add(next.id);
      last = next;
    }
  }
}

/** Avanço ou salto até o alvo travado (para encostado nele). Guarda o caminho para inimigos_caminho. */
function doDash(ctx: Ctx, salto: boolean): void {
  const { w, caster } = ctx;
  const t = getEnt(w, ctx.targetId);
  if (!t) return;
  const from = { x: caster.x, y: caster.y };
  const dx = t.x - caster.x, dy = t.y - caster.y;
  const d = Math.hypot(dx, dy);
  const go = d - (t.radius + caster.radius + 0.05);
  if (go > 0 && !(caster.kind === 'enemy' && caster.ai?.['imovel'] === true)) {
    const ux = dx / d, uy = dy / d;
    const dest = { x: caster.x + ux * go, y: caster.y + uy * go };
    if (salto && circleFree(w.map, dest.x, dest.y, caster.radius)) {
      caster.x = dest.x;
      caster.y = dest.y;
    } else {
      const p = moveBody(w.map, caster.x, caster.y, caster.radius, ux * go, uy * go);
      caster.x = p.x;
      caster.y = p.y;
    }
    caster.facing = facingFrom(dx, dy, caster.facing);
  }
  ctx.pathFrom = from;
  ctx.pathTo = { x: caster.x, y: caster.y };
  ctx.point = { x: t.x, y: t.y };
}

/** Recuo: para longe do inimigo mais perto, ou na direção do joystick. */
function doRetreat(ctx: Ctx, tiles: number, de: 'inimigo_mais_perto' | 'joystick'): void {
  const { w, caster } = ctx;
  let ux = 0, uy = 0;
  const mi = caster.moveIntent;
  if (de === 'joystick' && Math.hypot(mi.x, mi.y) > 0.15) {
    const l = Math.hypot(mi.x, mi.y);
    ux = mi.x / l;
    uy = mi.y / l;
  } else {
    const foe = nearestVisibleHostile(w, caster, RETREAT_SCAN_TILES);
    if (foe) {
      const l = Math.hypot(caster.x - foe.x, caster.y - foe.y) || 1;
      ux = (caster.x - foe.x) / l;
      uy = (caster.y - foe.y) / l;
    } else {
      const a = facingAngle(caster.facing) + Math.PI;
      ux = Math.cos(a);
      uy = Math.sin(a);
    }
  }
  const p = moveBody(w.map, caster.x, caster.y, caster.radius, ux * tiles, uy * tiles);
  caster.x = p.x;
  caster.y = p.y;
}

/** Invoca até `max` do mesmo tipo (o mais antigo sai). */
function doSummon(ctx: Ctx, summonId: string, durationMs: number, max: number, qty: number): void {
  const { w, caster, ability: a } = ctx;
  const mine = Array.from(w.entities.values())
    .filter((s) => s.kind === 'summon' && s.ownerId === caster.id && s.defId === summonId && !s.dead)
    .sort((p, q) => p.id - q.id);
  while (mine.length + qty > max && mine.length > 0) {
    const old = mine.shift()!;
    old.dead = true;
    old.expiresTick = w.tick;
  }
  const base = a.type === 'campo' && a.range > 0 ? ctx.point : { x: caster.x + Math.cos(ctx.dir) * SUMMON_SPAWN_TILES, y: caster.y + Math.sin(ctx.dir) * SUMMON_SPAWN_TILES };
  for (let k = 0; k < qty; k++) {
    let x = base.x, y = base.y;
    if (qty > 1) {
      const ang = (k / qty) * Math.PI * 2;
      x += Math.cos(ang) * SUMMON_RING_TILES;
      y += Math.sin(ang) * SUMMON_RING_TILES;
    }
    if (!circleFree(w.map, x, y, SUMMON_FREE_RADIUS)) {
      x = caster.x;
      y = caster.y;
    }
    spawnSummon(w, caster, summonId, x, y, durationMs);
    ctx.hit.add(caster.id);
  }
}

/** Campo no chão: círculo no ponto, ou cone que acompanha quem lança (segueLancador). */
function createZone(ctx: Ctx, eff: Extract<Effect, { kind: 'campo' }>, index: number): void {
  const { w, caster, ability: a } = ctx;
  const cone = a.type === 'cone';
  const follows = eff.segueLancador === true;
  const at = cone || a.type === 'em_volta' || (a.type === 'campo' && a.range <= 0) ? { x: caster.x, y: caster.y } : ctx.point;
  const z: GroundZone = {
    id: newId(w),
    sourceId: caster.id,
    team: caster.team,
    abilityId: a.id,
    x: at.x,
    y: at.y,
    radius: cone ? ctx.range : a.radius * areaMult(caster),
    startTick: w.tick,
    endTick: w.tick + msToTicks(eff.duracaoMs),
    tickMs: eff.tickMs,
    nextTick: w.tick,
    shape: cone ? 'cone' : 'circulo',
    effectIndex: index,
    dir: ctx.dir,
  };
  if (follows) z.followsId = caster.id;
  if (cone) {
    z.range = ctx.range;
    z.angleDeg = a.angleDeg ?? 90;
  }
  w.zones.push(z);
  ctx.hit.add(caster.id);
}

// ---------------------------------------------------------------------------
// Fases do step: carga curta, habilidade pendente, avisos no chão, campos e ataque básico

/** Carga curta (castMs) que terminou; habilidade pendente que entrou no alcance (ou expirou). */
export function tickCasting(w: World): void {
  for (const e of Array.from(w.entities.values())) {
    if (e.casting && w.tick >= e.casting.readyTick) {
      const c = e.casting;
      e.casting = undefined;
      const a = ab(c.abilityId);
      if (a && isUp(e) && canAct(e)) release(w, e, a, { point: c.point, dir: c.dir, ...(c.targetId !== undefined ? { targetId: c.targetId } : {}) });
    }
    if (e.pendingCast) {
      const p = e.pendingCast;
      if (w.tick > p.untilTick || !isUp(e)) {
        e.pendingCast = undefined;
        continue;
      }
      if (p.targetId !== undefined) {
        const t = getEnt(w, p.targetId);
        if (!t || !isTargetableBy(e, t)) {
          e.pendingCast = undefined;
          continue;
        }
      }
      const ok = tryCast(w, e, p.abilityId, { ...(p.targetId !== undefined ? { targetId: p.targetId } : {}), ...(p.at ? { at: p.at } : {}) }, true);
      if (!ok) e.pendingCast = undefined;
    }
  }
}

/** Avisos no chão que chegaram em impactTick: a área cai onde foi marcada. */
export function tickTelegraphs(w: World): void {
  const due = w.telegraphs.filter((t) => w.tick >= t.impactTick);
  if (due.length === 0) return;
  w.telegraphs = w.telegraphs.filter((t) => w.tick < t.impactTick);
  for (const tel of due) {
    if (tel.power) {
      explodePower(w, tel);
      continue;
    }
    const src = getEnt(w, tel.sourceId);
    const a = ab(tel.abilityId);
    if (!src || !a || src.dead) continue;
    const point = { x: tel.x, y: tel.y };
    resolveAbility(w, src, a, { point, dir: tel.dir ?? 0, origin: point, ...(tel.targetId !== undefined ? { targetId: tel.targetId } : {}) });
  }
}

/** Explosão de quem já caiu (afixo explode_ao_morrer): fonte fictícia com a força guardada. */
function explodePower(w: World, tel: Telegraph): void {
  const p = tel.power!;
  const src = ghost(tel);
  for (const t of Array.from(w.entities.values())) {
    if (!isDamageable(t) || t.team === (tel.team ?? src.team) || t.team === 'neutros') continue;
    if (dist(tel.x, tel.y, t.x, t.y) - t.radius > tel.radius) continue;
    if (!hasLineOfSight(w.map, tel.x, tel.y, t.x, t.y)) continue;
    dealDamage(w, src, t, p.mult, { abilityId: tel.abilityId, friendlyFire: true });
  }
}

function ghost(tel: Telegraph): Entity {
  return {
    id: tel.sourceId,
    kind: 'enemy',
    team: tel.team ?? 'inimigos',
    defId: 'fantasma',
    name: '',
    level: tel.power?.level ?? 1,
    x: tel.x,
    y: tel.y,
    radius: 0.3,
    facing: 0,
    moveIntent: { x: 0, y: 0 },
    hp: 0,
    shield: 0,
    resource: 0,
    special: 0,
    stats: { hpMax: 1, attack: tel.power?.attack ?? 0, defense: 0, speed: 10, range: 1, moveSpeed: 0, attackIntervalMs: 1000, critChance: 0, critDamage: 1.5, evasion: 0, resourceMax: 0, resourceRegenPerS: 0, pct: {} },
    statuses: [],
    ccImmuneUntil: 0,
    cooldowns: {},
    gcdUntil: 0,
    nextBasicTick: 0,
    dead: true,
  };
}

/** Campos no chão: reaplicam os efeitos a cada tickMs; o cone que segue gira para o alvo de quem lançou. */
export function tickZones(w: World): void {
  const keep: GroundZone[] = [];
  for (const z of w.zones) {
    if (w.tick >= z.endTick) continue;
    const src = getEnt(w, z.sourceId);
    if (!src || src.dead) continue;
    keep.push(z);
    if (z.followsId !== undefined) {
      const f = getEnt(w, z.followsId);
      if (f) {
        z.x = f.x;
        z.y = f.y;
      }
    }
    if (w.tick < z.nextTick) continue;
    z.nextTick += Math.max(1, msToTicks(z.tickMs));
    const a = ab(z.abilityId);
    const campo = a?.effects[z.effectIndex ?? a.effects.findIndex((e) => e.kind === 'campo')];
    if (!a || !campo || campo.kind !== 'campo') continue;
    let dir = z.dir ?? 0;
    const tgt = getEnt(w, src.targetId);
    if (z.shape === 'cone' && z.followsId !== undefined) {
      dir = tgt && isTargetableBy(src, tgt) ? angleTo(src, tgt) : facingAngle(src.facing);
      z.dir = dir;
    }
    const shape: Shape =
      z.shape === 'cone'
        ? { kind: 'cone', x: z.x, y: z.y, dir, range: z.range ?? z.radius, angleDeg: z.angleDeg ?? 90 }
        : { kind: 'circulo', x: z.x, y: z.y, radius: z.radius };
    const ctx: Ctx = {
      w,
      caster: src,
      ability: a,
      team: z.team,
      point: { x: z.x, y: z.y },
      origin: { x: z.x, y: z.y },
      dir,
      shape,
      range: z.range ?? effectiveRange(src, a),
      hit: new Set(),
      zone: z,
      ...(tgt ? { targetId: tgt.id } : {}),
    };
    campo.efeitos.forEach((eff, i) => applyEffect(ctx, eff, i));
  }
  w.zones = keep;
}

/**
 * Ataque básico automático no alvo travado quando ele está no alcance e à vista, inclusive
 * andando. Transformado, o básico vira cone, em volta ou golpe mais forte; tirosExtras dispara
 * projéteis a mais. Confuso, bate em alguém a esmo.
 */
export function doBasicAttack(w: World, e: Entity): void {
  const basicId = e.loadout?.basico ?? (e.ai?.['basic'] as string | undefined);
  if (!basicId || !canBasic(e) || w.tick < e.nextBasicTick || e.casting) return;
  const a = ab(basicId);
  if (!a) return;
  const range = effectiveRange(e, a);
  let t = getEnt(w, e.targetId);
  let friendlyFire = false;
  if (hasStatus(e, 'confundir') || hasStatus(e, 'tontura')) {
    const pool = Array.from(w.entities.values()).filter((o) => o.id !== e.id && isDamageable(o) && o.team !== 'neutros' && within(e, o.x, o.y, o.radius, range) && canSee(w, e, o));
    t = pool.length > 0 ? pool[w.rng.int(0, pool.length - 1)] : undefined;
    friendlyFire = true;
  }
  if (!t || !isDamageable(t) || (!friendlyFire && !isTargetableBy(e, t))) return;
  if (!within(e, t.x, t.y, t.radius, range) || !canSee(w, e, t)) return;

  e.nextBasicTick = w.tick + basicIntervalTicks(e);
  e.lastBasicTick = w.tick;
  e.facing = facingFrom(t.x - e.x, t.y - e.y, e.facing);
  emit(w, { t: 'cast', src: e.id, ability: a.id, target: t.id });
  const ranged = isRanged(e, a);
  let hits = 0;
  const tr = firstStatus(e, 'transformar');
  const basico = tr?.data?.['basico'] as { type: 'cone' | 'em_volta' | 'travada'; mult: number; raio?: number; anguloGraus?: number } | undefined;
  if (friendlyFire) {
    if (dealDamage(w, e, t, basicMult(a), { abilityId: a.id, ranged, basic: true, friendlyFire: true }) > 0) hits++;
  } else if (basico) {
    const dir = angleTo(e, t);
    const raio = basico.raio ?? 2;
    for (const o of Array.from(w.entities.values())) {
      if (!isTargetableBy(e, o)) continue;
      const inside =
        basico.type === 'cone'
          ? inCone(e.x, e.y, dir, raio, basico.anguloGraus ?? 90, o.x, o.y, o.radius)
          : basico.type === 'em_volta'
            ? dist(e.x, e.y, o.x, o.y) - o.radius <= raio
            : o.id === t.id;
      if (inside && hasLineOfSight(w.map, e.x, e.y, o.x, o.y) && dealDamage(w, e, o, basico.mult, { abilityId: a.id, basic: true }) > 0) hits++;
    }
  } else {
    hits += resolveAbility(w, e, a, { targetId: t.id, point: { x: t.x, y: t.y }, dir: angleTo(e, t) });
  }
  const extra = Number(tr?.data?.['tirosExtras'] ?? 0);
  for (let k = 0; k < extra && isDamageable(t); k++) {
    if (dealDamage(w, e, t, Number(tr?.data?.['tirosExtrasMult'] ?? 0.5), { abilityId: a.id, ranged, basic: true }) > 0) hits++;
  }
  if (hits > 0) {
    // v0.3: golpe mais lento vale mais Especial e recurso, para o ritmo do começo não mudar a conta
    const rm = ritmoMult(e.level);
    addSpecialPts(e, bal().especial.porAcertoBasico * rm);
    const res = resourceDef(e);
    if (res?.ganhoPorAcertoBasico) e.resource = Math.min(resourceMaxOf(e), e.resource + res.ganhoPorAcertoBasico * rm);
  }
}

const basicMult = (a: Ability) => {
  const d = a.effects.find((x) => x.kind === 'dano');
  return d && d.kind === 'dano' ? d.mult : 1;
};
