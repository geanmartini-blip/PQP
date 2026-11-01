/**
 * Núcleo da simulação de combate: determinístico, 20 ticks/s, tudo em tiles.
 * Usado pelo servidor autoritativo, pelo simulador de balanceamento e pela previsão do cliente.
 */
export * from './types';
export * from './rng';
export { createWorld, addEntity, recordHistory, historicalPos, emit } from './world';
export { stepMovement, moveVelocity, effectiveMoveSpeed, moveBody, velocityToward } from './movement';
export { canMove, canAct, canBasic, isHostile, isFriendly, isDamageable, isTargetableBy, isPartyMember, hasStatus, statPts } from './entity';
export {
  spawnPlayer,
  setArchetype,
  spawnEnemy,
  spawnAlly,
  spawnNpc,
  spawnSummon,
  spawnLoot,
  loadoutFor,
  type SpawnPlayerOpts,
  type SpawnEnemyOpts,
} from './spawn';
export { applyInput, applyCommand, switchTrainer, inCombat, npcInReach } from './commands';
export { step, stepN, pruneAttackers } from './step';
export { autoTarget, retargetTap, nearestVisibleHostile, canSee, basicRangeOf } from './targeting';
export { castAbility, effectiveRange, approachRange, resolveAbility, groupOf, type CastOpts } from './abilities';
export { registerHook, getHook, hasHook, hookNames, noopHook, type HookContext, type HookFn } from './hooks';
export {
  dealDamage,
  heal,
  healAmount,
  applyStatus,
  applyControl,
  applyShield,
  applyBuff,
  removeStatuses,
  pushFrom,
  pullToward,
  reviveEntity,
  downEntity,
  respawnAtHq,
  marginPct,
  type DamageOpts,
  type StatusSpec,
  type ControlResult,
} from './combat';
export { xpToNext, speedFactor, statRowAt, resolveKit, moveSpeedOf, cooldownRate, basicIntervalTicks } from './stats';
export { grantXp, resolveLootTable, pickupAction, lootFilterOf, autoSellOf } from './rewards';
export { tickAi } from './ai';
// bandos (integração da Fase 1): o spawner do servidor forma os bandos por aqui
export { spawnPack, packMates, type SpawnPackOpts } from './ai_pack';
export { tickDoctrine } from './doctrine';
export { hudSnapshot, entityFlags } from './hud';
export * as SIM_TUNING from './constants';
