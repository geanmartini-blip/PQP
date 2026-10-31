/**
 * Ajudantes para o snapshot (opcionais; o servidor pode montar o seu): HUD do próprio jogador e
 * bits de flag da entidade (EntSnap.fl).
 */
import { getData } from '../data';
import type { HudSnap } from '../net/protocol';
import { canAct, canMove, firstStatus, hasStatus, isDowned, maxStatusValue } from './entity';
import { effectiveMoveSpeed } from './movement';
import { xpToNext } from './stats';
import type { Entity, World } from './types';

/** HUD do jogador: vida, recurso, Especial (0..1000), recargas em ticks e mv/canMove para a previsão. */
export function hudSnapshot(w: World, e: Entity): HudSnap {
  const L = e.loadout;
  const itemAbility = L?.item ? getData().consumablesById.get(L.item)?.habilidade : undefined;
  const cdLeft = (id: string | undefined) => (id ? Math.max(0, Math.ceil((e.cooldowns[id] ?? 0) - w.tick)) : 0);
  const hud: HudSnap = {
    hp: Math.ceil(e.hp),
    hpMax: Math.round(e.stats.hpMax),
    shield: Math.round(e.shield),
    res: Math.floor(e.resource),
    resMax: Math.round(e.stats.resourceMax),
    special: Math.floor(e.special * 1000),
    cd: [cdLeft(L?.b1), cdLeft(L?.b2), cdLeft(L?.b3), 0, cdLeft(itemAbility)],
    gcd: Math.max(0, e.gcdUntil - w.tick),
    ab: [L?.b1 ?? '', L?.b2 ?? '', L?.b3 ?? '', L?.especial ?? '', ...(itemAbility ? [itemAbility] : [])] as HudSnap['ab'],
    itemCount: L?.itemCount ?? 0,
    xp: Math.floor(e.xp ?? 0),
    xpNext: xpToNext(e.level),
    level: e.level,
    auto: e.auto === true,
    mv: effectiveMoveSpeed(w, e),
    canMove: canMove(e),
    canAct: canAct(e),
  };
  if (e.targetId !== undefined) hud.target = e.targetId;
  if (e.downedUntil !== undefined) hud.downed = Math.max(0, (e.downedUntil - w.tick) * 50);
  if (e.archetypeId) hud.arch = e.archetypeId;
  if (e.classId) hud.cls = e.classId;
  return hud;
}

/**
 * Bits de EntSnap.fl: 1 movendo, 2 atacando, 4 caído, 8 invisível, 16 atordoado, 32 lento,
 * 64 provocando, 128 transformado, 256 elite, 512 chefe, 1024 imune.
 */
export function entityFlags(w: World, e: Entity): number {
  let f = 0;
  if (e.vel && (e.vel.x !== 0 || e.vel.y !== 0)) f |= 1;
  if ((e.lastBasicTick !== undefined && w.tick - e.lastBasicTick <= 6) || e.casting) f |= 2;
  if (isDowned(e)) f |= 4;
  if (hasStatus(e, 'invisivel')) f |= 8;
  if (hasStatus(e, 'atordoar') || hasStatus(e, 'derrubar')) f |= 16;
  if (maxStatusValue(e, 'lentidao') > 0) f |= 32;
  if (Array.from(w.entities.values()).some((o) => o.statuses.some((s) => s.kind === 'provocar' && s.sourceId === e.id))) f |= 64;
  if (hasStatus(e, 'transformar')) f |= 128;
  if (e.tier === 'elite') f |= 256;
  if (e.tier === 'chefe') f |= 512;
  if (firstStatus(e, 'imune')) f |= 1024;
  return f;
}
