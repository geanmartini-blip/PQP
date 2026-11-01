/**
 * Chefe: fases pela vida (fala, habilidades da fase, reforços que repetem e efeitos ao entrar),
 * provocação respeitada mesmo virando lentidão, e volta à primeira fase quando reinicia.
 */
import { getData } from '../data';
import { circleFree } from '../map/grid';
import { enemyMind, type EnemyMind } from './ai_state';
import { getEnt, hpRatio, isTargetableBy, isUp } from './entity';
import { getHook } from './hooks';
import { enemyAi, spawnEnemy } from './spawn';
import { tauntSource } from './targeting';
import { msToTicks, type Entity, type World } from './types';
import { emit } from './world';

/**
 * Fases de chefe pela vida: fala, habilidades, reforços (e repetição) e aoEntrar (gancho). Um
 * golpe que cruza dois limiares passa por todas as fases do meio, uma a uma (fala, reforços e
 * aoEntrar de cada). Os reforços que repetem (reforcosACadaS) só repõem até o teto da fase.
 */
export function bossPhases(w: World, e: Entity): void {
  const ai = enemyAi(e);
  const fases = getData().enemiesById.get(e.defId)?.fases ?? [];
  if (fases.length === 0) return;
  const pct = hpRatio(e) * 100;
  let idx = ai.phase;
  while (idx + 1 < fases.length && pct < fases[idx + 1]!.vidaAbaixoPct) idx++;
  if (idx !== ai.phase) {
    for (let p = ai.phase + 1; p <= idx; p++) {
      const f = fases[p]!;
      ai.phase = p;
      ai.phaseSince = w.tick;
      ai.abilities = f.habilidades;
      if (f.fala) emit(w, { t: 'say', src: e.id, text: f.fala });
      spawnReinforcements(w, e, f.reforcos ?? []);
      for (const ef of f.aoEntrar ?? []) {
        if (ef.kind === 'gancho') getHook(ef.gancho)({ w, caster: e, effect: ef, targets: [e], point: { x: e.x, y: e.y }, params: ef.params ?? {} });
      }
      ai.nextReinforceTick = f.reforcosACadaS ? w.tick + msToTicks(f.reforcosACadaS * 1000) : undefined;
    }
  } else if (ai.nextReinforceTick !== undefined && w.tick >= ai.nextReinforceTick) {
    const f = fases[idx]!;
    const room = reinforcementCap(fases, idx) - reinforcementsOf(w, e).length;
    if (room > 0) spawnReinforcements(w, e, f.reforcos ?? [], room);
    ai.nextReinforceTick = w.tick + msToTicks((f.reforcosACadaS ?? 20) * 1000);
  }
}

/**
 * Teto de reforços vivos ao mesmo tempo na fase idx: a soma dos reforços das fases até ela (os que
 * a luta teria trazido até aqui). SUGESTÃO: os docs não dão teto; sem ele, a fase que repete
 * reforços enche o mapa e vira fazenda de XP.
 */
export function reinforcementCap(fases: readonly { reforcos?: { quantidade: number }[] | undefined }[], idx: number): number {
  let n = 0;
  for (let p = 0; p <= idx && p < fases.length; p++) for (const r of fases[p]!.reforcos ?? []) n += r.quantidade;
  return n;
}

/** Reforços vivos de um chefe. */
export function reinforcementsOf(w: World, boss: Entity): Entity[] {
  const out: Entity[] = [];
  for (const o of w.entities.values()) if (o.kind === 'enemy' && !o.dead && enemyAi(o).reinforcementOf === boss.id) out.push(o);
  return out;
}

/** O reforço some do mapa sem dar XP nem saque (vai embora: o chefe não está mais na luta). */
export function dismissReinforcement(e: Entity): void {
  e.dead = true;
  e.casting = undefined;
  e.pendingCast = undefined;
  enemyAi(e).rewarded = true;
}

/**
 * Reforço cujo chefe saiu da luta (morreu, sumiu ou está voltando pela coleira) e que também já
 * saiu do combate (perdeu o alvo ou voltou pela coleira): vai embora. SUGESTÃO: os docs não dizem
 * o que acontece com os capangas do chefe depois da luta.
 */
export function reinforcementOrphaned(w: World, e: Entity, m: EnemyMind): boolean {
  const bossId = enemyAi(e).reinforcementOf;
  if (bossId === undefined || m.state === 'combate') return false;
  const boss = getEnt(w, bossId);
  return !boss || !isUp(boss) || enemyMind(boss).state === 'voltando';
}

/** Chefe reiniciado (coleira): volta para a primeira fase, sem reforços pendentes, e os reforços vão embora. */
export function resetBoss(w: World, e: Entity): void {
  const ai = enemyAi(e);
  const fases = getData().enemiesById.get(e.defId)?.fases ?? [];
  if (fases.length === 0) return;
  ai.phase = 0;
  ai.phaseSince = w.tick;
  ai.abilities = fases[0]!.habilidades;
  ai.nextReinforceTick = undefined;
  for (const r of reinforcementsOf(w, e)) dismissReinforcement(r);
}

// SUGESTÃO: reforço nasce a 1,8 tile da borda do chefe (num ponto que caiba um corpo de 0,5 tile).
const REINFORCE_RING_TILES = 1.8;
const REINFORCE_FREE_RADIUS = 0.5;

/** Reforços em volta do chefe (até `limit`): entram no bando dele, acordados e no mesmo alvo. */
function spawnReinforcements(w: World, boss: Entity, list: { inimigo: string; quantidade: number }[], limit = Infinity): void {
  const bm = enemyMind(boss);
  let k = 0;
  const total = Math.min(limit, list.reduce((s, r) => s + r.quantidade, 0));
  for (const r of list) {
    for (let i = 0; i < r.quantidade && k < total; i++, k++) {
      const a = (k / Math.max(1, total)) * Math.PI * 2 + w.rng.next();
      let x = boss.x + Math.cos(a) * (boss.radius + REINFORCE_RING_TILES), y = boss.y + Math.sin(a) * (boss.radius + REINFORCE_RING_TILES);
      if (!circleFree(w.map, x, y, REINFORCE_FREE_RADIUS)) {
        x = boss.x;
        y = boss.y;
      }
      const m = spawnEnemy(w, r.inimigo, x, y);
      m.spawnX = boss.spawnX ?? boss.x;
      m.spawnY = boss.spawnY ?? boss.y;
      enemyAi(m).reinforcementOf = boss.id;
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
