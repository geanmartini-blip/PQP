/**
 * Peças do snapshot: entidade com chaves curtas (EntSnap), visual (lk), avisos e zonas
 * arredondados e o filtro de eventos por distância.
 */
import { getData } from '@pqp/shared/data';
import { quantize, type EntSnap, type S2C_Snapshot } from '@pqp/shared/net';
import { entityFlags, type CombatEvent, type Entity, type GroundZone, type Telegraph, type World } from '@pqp/shared/sim';
import type { Appearance, CharacterLook } from '@pqp/shared/game/types';

const KIND: Record<Entity['kind'], EntSnap['k']> = { player: 'p', npc: 'n', enemy: 'e', summon: 's', loot: 'l' };

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Parte da entidade que não depende de quem olha (calculada uma vez por tick). */
export function baseEntSnap(w: World, e: Entity): EntSnap {
  const hpMax = e.stats.hpMax;
  const s: EntSnap = {
    i: e.id,
    k: KIND[e.kind],
    x: quantize(e.x),
    y: quantize(e.y),
    f: e.facing,
    h: hpMax > 0 ? Math.max(0, Math.min(1000, Math.round((e.hp / hpMax) * 1000))) : 1000,
    fl: e.kind === 'loot' ? 0 : entityFlags(w, e),
  };
  if (e.shield > 0 && hpMax > 0) s.sh = Math.min(1000, Math.round((e.shield / hpMax) * 1000));
  if (e.tier === 'chefe' && e.targetId !== undefined) s.tg = e.targetId;
  return s;
}

/** Traje pelo nível (CLAUDE.md: Delta 1, uniforme 8, aprendiz 12, veterano 20). */
function outfitTier(e: Entity): CharacterLook['outfit']['tier'] {
  if (!e.classId) return 'delta';
  if (!e.archetypeId) return 'base';
  return e.level >= 20 ? 'veterano' : 'aprendiz';
}

/**
 * Visual do jogador da sala de protótipo (sandbox) no formato CharacterLook
 * (client/src/art/contract.ts): aparência padrão de appearance.json (ou a do registro) mais o
 * traje do arquétipo e do nível da entidade (o template troca de ala com Wesley e Li Wei).
 * Fora do protótipo, o visual vem do registro (game/visual.ts lookOf) em Entity.look.
 */
export function playerLook(e: Entity, ap?: Partial<Appearance>): CharacterLook {
  const D = getData();
  const p = D.appearance.padrao;
  const tier = outfitTier(e);
  const arch = e.archetypeId ? D.archetypesById.get(e.archetypeId) : undefined;
  const deltaPalette = Math.max(0, D.appearance.roupaInicial.cores.indexOf(ap?.palette ?? p.palette));
  const outfit: CharacterLook['outfit'] = { tier, palette: tier === 'delta' ? deltaPalette : 0 };
  if (arch) {
    outfit.archetypeId = arch.id;
    outfit.institutionId = arch.instituicao;
  }
  return {
    body: ap?.body ?? p.body,
    skin: ap?.skin ?? p.skin,
    face: ap?.face ?? p.face,
    hair: ap?.hair ?? p.hair,
    hairColor: ap?.hair_color ?? p.hair_color,
    details: [...(ap?.details ?? p.details)],
    outfit,
  };
}

/**
 * lk por tipo de entidade (o EntSnap.lk é `unknown`, documentado aqui):
 * - jogador: CharacterLook (Entity.look, que o núcleo põe a partir do registro; no protótipo, playerLook);
 * - inimigo com afixo: { affixes: string[] } (tier vem nos bits de fl);
 * - saque: { rarity?: string, currency?: 'semente' | 'credito' | 'ambas' };
 * - invocação: { side: 'esquerda' | 'direita' };
 * - NPC e companheiro: sem lk (o cliente usa npcSheet(d)).
 */
export function lookOf(e: Entity, ap?: Partial<Appearance>): unknown {
  switch (e.kind) {
    case 'player':
      return e.look ?? playerLook(e, ap);
    case 'enemy':
      return e.affixes && e.affixes.length > 0 ? { affixes: [...e.affixes] } : undefined;
    case 'loot': {
      const l = e.loot ?? {};
      const out: Record<string, unknown> = {};
      if (l.rarity) out['rarity'] = l.rarity;
      const s = (l.currency?.semente ?? 0) > 0, c = (l.currency?.credito ?? 0) > 0;
      if (s || c) out['currency'] = s && c ? 'ambas' : s ? 'semente' : 'credito';
      return Object.keys(out).length > 0 ? out : undefined;
    }
    case 'summon':
      return e.side ? { side: e.side } : undefined;
    default:
      return undefined;
  }
}

export function telegraphOut(t: Telegraph): Telegraph {
  const o: Telegraph = {
    id: t.id,
    sourceId: t.sourceId,
    abilityId: t.abilityId,
    shape: t.shape,
    x: r2(t.x),
    y: r2(t.y),
    radius: r2(t.radius),
    startTick: t.startTick,
    impactTick: t.impactTick,
  };
  if (t.dir !== undefined) o.dir = r3(t.dir);
  if (t.angleDeg !== undefined) o.angleDeg = t.angleDeg;
  if (t.targetId !== undefined) o.targetId = t.targetId;
  if (t.team !== undefined) o.team = t.team;
  return o;
}

export function zoneOut(z: GroundZone): S2C_Snapshot['zones'][number] {
  const o: S2C_Snapshot['zones'][number] = { i: z.id, a: z.abilityId, x: r2(z.x), y: r2(z.y), r: r2(z.radius), e: z.endTick, team: z.team };
  if (z.shape === 'cone') {
    o.s = 'cone';
    if (z.dir !== undefined) o.dir = r3(z.dir);
    if (z.angleDeg !== undefined) o.ang = z.angleDeg;
    if (z.range !== undefined) o.rg = r2(z.range);
  }
  return o;
}

/** Ids citados por um evento (para o filtro de interesse) e um ponto, quando o evento tem. */
export function eventRefs(ev: CombatEvent): { ids: number[]; at?: [number, number] } {
  switch (ev.t) {
    case 'cast':
      return ev.x !== undefined && ev.y !== undefined ? { ids: [ev.src], at: [ev.x, ev.y] } : { ids: [ev.src] };
    case 'hit':
    case 'miss':
    case 'heal':
    case 'shield':
      return { ids: [ev.src, ev.dst] };
    case 'status':
    case 'cc_slow':
    case 'down':
    case 'special_ready':
    case 'xp':
    case 'level':
    case 'currency':
      return { ids: [ev.dst] };
    case 'revive':
    case 'death':
      return { ids: ev.by !== undefined ? [ev.dst, ev.by] : [ev.dst] };
    case 'telegraph':
      return { ids: [ev.tel.sourceId], at: [ev.tel.x, ev.tel.y] };
    case 'loot_drop':
      return { ids: [ev.id] };
    case 'loot_pick':
      return { ids: [ev.id, ev.by] };
    case 'say':
      return { ids: [ev.src] };
  }
}

/** Cópia do evento com números arredondados (o aviso no chão vai como os de tel). */
export function eventOut(ev: CombatEvent): CombatEvent {
  if (ev.t === 'telegraph') return { t: 'telegraph', tel: telegraphOut(ev.tel) };
  let out: CombatEvent = ev;
  if (ev.t === 'hit' || ev.t === 'heal' || ev.t === 'shield') out = { ...ev, amount: ev.amount > 0 ? Math.max(1, Math.round(ev.amount)) : 0 };
  else if (ev.t === 'cast' && ev.x !== undefined && ev.y !== undefined) out = { ...ev, x: r2(ev.x), y: r2(ev.y) };
  // campos undefined viram null no msgpack: tira antes de mandar
  let copy: Record<string, unknown> | undefined;
  for (const [k, v] of Object.entries(out)) {
    if (v !== undefined) continue;
    copy ??= { ...(out as Record<string, unknown>) };
    delete copy[k];
  }
  return (copy as CombatEvent | undefined) ?? out;
}
