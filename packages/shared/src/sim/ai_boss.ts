/**
 * Chefe: fases pela vida (fala, habilidades da fase, reforços que repetem e efeitos ao entrar),
 * provocação respeitada mesmo virando lentidão, e volta à primeira fase quando reinicia.
 */
import { getData } from '../data';
import { circleFree } from '../map/grid';
import { enemyMind } from './ai_state';
import { getEnt, hpRatio, isTargetableBy } from './entity';
import { getHook } from './hooks';
import { enemyAi, spawnEnemy } from './spawn';
import { tauntSource } from './targeting';
import { msToTicks, type Entity, type World } from './types';
import { emit } from './world';

/** Fases de chefe pela vida: fala, habilidades, reforços (e repetição) e aoEntrar (gancho). */
export function bossPhases(w: World, e: Entity): void {
  const ai = enemyAi(e);
  const fases = getData().enemiesById.get(e.defId)?.fases ?? [];
  if (fases.length === 0) return;
  const pct = hpRatio(e) * 100;
  let idx = ai.phase;
  while (idx + 1 < fases.length && pct < fases[idx + 1]!.vidaAbaixoPct) idx++;
  if (idx !== ai.phase) {
    ai.phase = idx;
    ai.phaseSince = w.tick;
    const f = fases[idx]!;
    ai.abilities = f.habilidades;
    if (f.fala) emit(w, { t: 'say', src: e.id, text: f.fala });
    spawnReinforcements(w, e, f.reforcos ?? []);
    for (const ef of f.aoEntrar ?? []) {
      if (ef.kind === 'gancho') getHook(ef.gancho)({ w, caster: e, effect: ef, targets: [e], point: { x: e.x, y: e.y }, params: ef.params ?? {} });
    }
    ai.nextReinforceTick = f.reforcosACadaS ? w.tick + msToTicks(f.reforcosACadaS * 1000) : undefined;
  } else if (ai.nextReinforceTick !== undefined && w.tick >= ai.nextReinforceTick) {
    const f = fases[idx]!;
    spawnReinforcements(w, e, f.reforcos ?? []);
    ai.nextReinforceTick = w.tick + msToTicks((f.reforcosACadaS ?? 20) * 1000);
  }
}

/** Chefe reiniciado (coleira): volta para a primeira fase, sem reforços pendentes. */
export function resetBoss(w: World, e: Entity): void {
  const ai = enemyAi(e);
  const fases = getData().enemiesById.get(e.defId)?.fases ?? [];
  if (fases.length === 0) return;
  ai.phase = 0;
  ai.phaseSince = w.tick;
  ai.abilities = fases[0]!.habilidades;
  ai.nextReinforceTick = undefined;
}

/** Reforços em volta do chefe: entram no bando dele, acordados e no mesmo alvo. */
function spawnReinforcements(w: World, boss: Entity, list: { inimigo: string; quantidade: number }[]): void {
  const bm = enemyMind(boss);
  let k = 0;
  const total = list.reduce((s, r) => s + r.quantidade, 0);
  for (const r of list) {
    for (let i = 0; i < r.quantidade; i++, k++) {
      const a = (k / Math.max(1, total)) * Math.PI * 2 + w.rng.next();
      let x = boss.x + Math.cos(a) * (boss.radius + 1.8), y = boss.y + Math.sin(a) * (boss.radius + 1.8);
      if (!circleFree(w.map, x, y, 0.5)) {
        x = boss.x;
        y = boss.y;
      }
      const m = spawnEnemy(w, r.inimigo, x, y);
      m.spawnX = boss.spawnX ?? boss.x;
      m.spawnY = boss.spawnY ?? boss.y;
      const mm = enemyMind(m);
      mm.packId = bm.packId ?? `chefe_${boss.id}`;
      mm.leaderId = boss.id;
      const t = getEnt(w, bm.chaseId ?? boss.targetId);
      if (t && isTargetableBy(m, t)) {
        mm.state = 'combate';
        mm.chaseId = t.id;
        m.targetId = t.id;
      }
    }
  }
  bm.packId ??= `chefe_${boss.id}`;
}

const tauntCache = new Map<string, boolean>();

/** O id de habilidade (ou de invocação 'invocacao:<id>') provoca? */
export function isTauntSource(abilityId: string): boolean {
  const hit = tauntCache.get(abilityId);
  if (hit !== undefined) return hit;
  const D = getData();
  let effects: readonly { kind: string; cc?: string; efeitos?: unknown }[] = [];
  if (abilityId.startsWith('invocacao:')) effects = D.summonsById.get(abilityId.slice('invocacao:'.length))?.effects ?? [];
  else effects = D.abilities.get(abilityId)?.effects ?? [];
  const walk = (list: readonly { kind: string; cc?: string; efeitos?: unknown }[]): boolean =>
    list.some((x) => (x.kind === 'controle' && x.cc === 'provocar') || (x.kind === 'campo' && Array.isArray(x.efeitos) && walk(x.efeitos as never)));
  const v = walk(effects);
  tauntCache.set(abilityId, v);
  return v;
}

/**
 * Quem provocou este inimigo. Normal e elite: o estado 'provocar'. Chefe: a provocação virou
 * lentidão (regra do motor, com abilityId '<habilidade>:cc'), mas ele ainda vai em quem provocou
 * enquanto a lentidão durar.
 */
export function tauntOf(w: World, e: Entity): Entity | undefined {
  const t = tauntSource(w, e);
  if (t) return t;
  if (e.tier !== 'chefe') return undefined;
  for (let i = e.statuses.length - 1; i >= 0; i--) {
    const s = e.statuses[i]!;
    if (s.kind !== 'lentidao' || !s.abilityId || !s.abilityId.endsWith(':cc')) continue;
    if (!isTauntSource(s.abilityId.slice(0, -3))) continue;
    const src = getEnt(w, s.sourceId);
    if (src && isTargetableBy(e, src)) return src;
  }
  return undefined;
}
