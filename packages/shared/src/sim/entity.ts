/**
 * Consultas puras sobre entidades: estados, atributos somados, times e capacidade de agir.
 * Nada aqui muda o mundo.
 */
import type { Entity, StatusInstance, World } from './types';

/** Controles que impedem andar. */
export const CC_NO_MOVE = ['atordoar', 'prender', 'derrubar'] as const;
/** Controles que impedem usar habilidade. */
export const CC_NO_ABILITY = ['atordoar', 'derrubar', 'silenciar'] as const;
/** Controles que impedem o ataque básico. */
export const CC_NO_BASIC = ['atordoar', 'derrubar'] as const;
/** Estados ruins que o efeito 'limpar' tira. */
export const HARMFUL_STATUS = ['atordoar', 'prender', 'derrubar', 'cegar', 'confundir', 'provocar', 'silenciar', 'tontura', 'lentidao', 'dano_continuo', 'marca', 'puxar'];
export const CC_KINDS = ['atordoar', 'prender', 'derrubar', 'cegar', 'confundir', 'provocar', 'silenciar', 'tontura'];

export const hasStatus = (e: Entity, kind: string) => e.statuses.some((s) => s.kind === kind);
export const statusesOf = (e: Entity, kind: string): StatusInstance[] => e.statuses.filter((s) => s.kind === kind);
export const firstStatus = (e: Entity, kind: string): StatusInstance | undefined => e.statuses.find((s) => s.kind === kind);

/** Maior valor entre os estados de um tipo (lentidões não somam: vale a mais forte). */
export function maxStatusValue(e: Entity, kind: string): number {
  let m = 0;
  for (const s of e.statuses) if (s.kind === kind && s.value > m) m = s.value;
  return m;
}

/** Soma dos valores (com acúmulos) dos estados de um tipo. */
export function sumStatusValue(e: Entity, kind: string): number {
  let t = 0;
  for (const s of e.statuses) if (s.kind === kind) t += s.value * (s.stacks ?? 1);
  return t;
}

/**
 * Bônus de um StatKey em pontos percentuais (15 = +15%): o fixo de stats.pct (guardado em fração,
 * 0.15) mais os reforços ativos ('reforco:<stat>').
 */
export function statPts(e: Entity, key: string): number {
  return (e.stats.pct[key] ?? 0) * 100 + sumStatusValue(e, `reforco:${key}`);
}

export const isDowned = (e: Entity) => e.downedUntil !== undefined;
/** Vivo e de pé. */
export const isUp = (e: Entity) => !e.dead && e.downedUntil === undefined;

/** Personagem que luta (jogador, companheiro de IA, inimigo ou invocação). */
export const isCombatant = (e: Entity) => e.kind !== 'loot' && e.team !== 'neutros';

export function isHostile(a: Entity, b: Entity): boolean {
  return a.team !== b.team && a.team !== 'neutros' && b.team !== 'neutros';
}
export const isFriendly = (a: Entity, b: Entity) => a.team === b.team && a.team !== 'neutros';

/** Pode levar dano agora (vivo, de pé, lutador e destrutível). */
export function isDamageable(e: Entity): boolean {
  if (!isUp(e) || !isCombatant(e)) return false;
  if (e.kind === 'summon' && e.ai?.['indestrutivel'] === true) return false;
  if (e.ai?.['rebuilding'] === true) return false;
  return true;
}

/** Pode ser travado como alvo por `by` (hostil, vivo, visível). Não confere distância nem visão. */
export function isTargetableBy(by: Entity, t: Entity): boolean {
  return t.id !== by.id && isHostile(by, t) && isDamageable(t) && !hasStatus(t, 'invisivel');
}

/** Jogador e companheiro de IA (contam como grupo, caem e levantam). */
export const isPartyMember = (e: Entity) => (e.kind === 'player' || (e.kind === 'npc' && e.team !== 'neutros')) && !!e.loadout;

/** Pode se mexer: falso se atordoado, preso, derrubado, caído ou morto. */
export function canMove(e: Entity): boolean {
  if (!isUp(e)) return false;
  for (const s of e.statuses) if ((CC_NO_MOVE as readonly string[]).includes(s.kind)) return false;
  return true;
}

/** Pode usar habilidade: falso se atordoado, derrubado, silenciado, caído ou morto (preso ainda age). */
export function canAct(e: Entity): boolean {
  if (!isUp(e)) return false;
  for (const s of e.statuses) if ((CC_NO_ABILITY as readonly string[]).includes(s.kind)) return false;
  return true;
}

/** Pode soltar o ataque básico: silenciado e preso ainda batem. */
export function canBasic(e: Entity): boolean {
  if (!isUp(e)) return false;
  for (const s of e.statuses) if ((CC_NO_BASIC as readonly string[]).includes(s.kind)) return false;
  return true;
}

export const hpRatio = (e: Entity) => (e.stats.hpMax > 0 ? e.hp / e.stats.hpMax : 0);

/** Entidade por id, se ainda existir. */
export const getEnt = (w: World, id: number | undefined): Entity | undefined => (id === undefined ? undefined : w.entities.get(id));

/** Lista estável (ordem de criação) para iterar enquanto o mapa muda. */
export const entityList = (w: World): Entity[] => Array.from(w.entities.values());
