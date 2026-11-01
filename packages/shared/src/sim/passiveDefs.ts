/**
 * Fase 3: talentos e guia na simulação, parte só de dados (sem mexer no mundo).
 *
 * - Passivos de talento (talents.json, efeito ou efeitoPorArquetipo) e o bônus do guia
 *   (guides.json) de uma entidade: Entity.talents e Entity.guideId.
 * - Modificações de habilidade dos talentos viram uma habilidade derivada com id próprio, que
 *   se descreve sozinho: `<base>@<arquetipo>:<talento1>+<talento2>`. O mapa de habilidades de
 *   getData() aprende a montar esse id na hora (lookup preguiçoso, com cache), então o servidor, o
 *   servidor local e o HUD do cliente acham a habilidade pelo mesmo id do botão, sem precisar
 *   registrar nada. A recarga, o custo, o raio e os efeitos que o talento muda valem pelo motor de
 *   sempre (abilities.ts).
 * - Números condicionais que dependem do alvo (Execução, Golpe Inicial, Milagre, Mira) entram na
 *   hora do golpe por condStatPts (combat.ts).
 *
 * Nada aqui usa Math.random nem Date.
 */
import { getData } from '../data';
import { flattenEffects, type Ability, type Effect, type Passive } from '../schema/ability';
import type { AbilityMod, Talent, TalentEffect } from '../schema/talent';
import { hpRatio, hasStatus } from './entity';
import type { Entity, Loadout } from './types';

// ---------------------------------------------------------------------------
// Passivos

/** Passivo com a origem (chave estável para recargas e estados): 'talento:<id>:<i>' ou 'guia:<id>:<i>'. */
export interface SourcedPassive {
  key: string;
  /** 'talento' ou 'guia' */
  fonte: 'talento' | 'guia';
  /** id do talento ou do guia */
  id: string;
  p: Passive;
}

/** Efeito do talento para o arquétipo (talento-chave tem um por lado do par). */
export function talentEffectFor(t: Talent, archetypeId?: string): TalentEffect | undefined {
  if (t.efeito) return t.efeito;
  if (archetypeId && t.efeitoPorArquetipo) return (t.efeitoPorArquetipo as Record<string, TalentEffect | undefined>)[archetypeId];
  return undefined;
}

const cache = new WeakMap<Entity, { sig: string; list: SourcedPassive[] }>();

const sigOf = (e: Entity) => `${(e.talents ?? []).join('+')}|${e.guideId ?? ''}|${e.archetypeId ?? ''}`;

/** Passivos de talento e de guia da entidade (vazio para quem não tem nenhum). */
export function sourcedPassivesOf(e: Entity): SourcedPassive[] {
  if ((!e.talents || e.talents.length === 0) && !e.guideId) return [];
  const sig = sigOf(e);
  const c = cache.get(e);
  if (c && c.sig === sig) return c.list;
  const D = getData();
  const list: SourcedPassive[] = [];
  for (const tid of e.talents ?? []) {
    const t = D.talentsById.get(tid);
    if (!t) continue;
    const ef = talentEffectFor(t, e.archetypeId);
    (ef?.passivos ?? []).forEach((p, i) => list.push({ key: `talento:${tid}:${i}`, fonte: 'talento', id: tid, p }));
  }
  if (e.guideId) {
    const g = D.guidesById.get(e.guideId);
    (g?.bonus ?? []).forEach((p, i) => list.push({ key: `guia:${g!.id}:${i}`, fonte: 'guia', id: g!.id, p }));
  }
  cache.set(e, { sig, list });
  return list;
}

/** Só os passivos (combat.passivesOf soma estes aos dos afixos). */
export const talentPassivesOf = (e: Entity): Passive[] => sourcedPassivesOf(e).map((s) => s.p);

/** Condição que depende do alvo do golpe (ou da cura). */
const TARGET_CONDS = ['alvoVidaAbaixoPct', 'alvoVidaAcimaPct', 'alvoMarcado', 'alvoMarcadoPorTalento', 'contraElitesEChefes'] as const;

export const hasTargetCondition = (p: Passive) => !!p.condicao && TARGET_CONDS.some((k) => p.condicao![k] !== undefined);

/** Número fixo, sem condição: entra em stats.pct ao nascer (o gancho junto, quando houver, é à parte). */
export const isFlatNumber = (p: Passive) => p.kind === 'numero' && !!p.stats?.length && !p.condicao;

/**
 * Bônus condicional de um StatKey (pontos percentuais) de `src` contra `dst` agora: números de
 * talento e guia cuja condição olha o alvo (vida do alvo, alvo marcado, elite ou chefe).
 */
export function condStatPts(src: Entity, dst: Entity, key: string): number {
  const list = sourcedPassivesOf(src);
  if (list.length === 0) return 0;
  let t = 0;
  for (const { p } of list) {
    if (p.kind !== 'numero' || !p.stats || !hasTargetCondition(p)) continue;
    const c = p.condicao!;
    if (c.alvoVidaAbaixoPct !== undefined && !(hpRatio(dst) * 100 < c.alvoVidaAbaixoPct)) continue;
    if (c.alvoVidaAcimaPct !== undefined && !(hpRatio(dst) * 100 > c.alvoVidaAcimaPct)) continue;
    if ((c.alvoMarcado || c.alvoMarcadoPorTalento) && !hasStatus(dst, 'marca')) continue;
    if (c.contraElitesEChefes && !(dst.tier === 'elite' || dst.tier === 'chefe')) continue;
    for (const s of p.stats) if (s.stat === key) t += s.pct;
  }
  return t;
}

/** Soma em stats.pct (fração) os números fixos de talento e guia. Chame uma vez, ao nascer. */
export function applyFlatPassiveNumbers(e: Entity): void {
  for (const { p } of sourcedPassivesOf(e)) {
    if (!isFlatNumber(p)) continue;
    for (const s of p.stats!) e.stats.pct[s.stat] = (e.stats.pct[s.stat] ?? 0) + s.pct / 100;
  }
}

// ---------------------------------------------------------------------------
// Habilidades derivadas pelos talentos

const SEP = '@';

/** Id base de um id de habilidade (tira o sufixo dos talentos). */
export const baseAbilityId = (id: string): string => {
  const i = id.indexOf(SEP);
  return i < 0 ? id : id.slice(0, i);
};

/** Modificações dos talentos para uma habilidade, na ordem dos talentos. */
function modsFor(base: string, archetypeId: string | undefined, talents: readonly string[]): AbilityMod[] {
  const D = getData();
  const out: AbilityMod[] = [];
  for (const tid of talents) {
    const t = D.talentsById.get(tid);
    if (!t) continue;
    for (const m of talentEffectFor(t, archetypeId)?.modificacoes ?? []) if (m.habilidade === base) out.push(m);
  }
  return out;
}

/** Talentos (da lista) que mudam a habilidade. */
function talentsTouching(base: string, archetypeId: string | undefined, talents: readonly string[]): string[] {
  return talents.filter((tid) => modsFor(base, archetypeId, [tid]).length > 0);
}

/**
 * Id da habilidade com os talentos aplicados: o id base quando nenhum talento mexe nela, ou
 * `<base>@<arquetipo>:<t1>+<t2>`.
 */
export function derivedAbilityId(id: string, archetypeId: string | undefined, talents: readonly string[] | undefined): string {
  const base = baseAbilityId(id);
  if (!id || !talents || talents.length === 0) return base;
  const touching = talentsTouching(base, archetypeId, talents);
  if (touching.length === 0) return base;
  return `${base}${SEP}${archetypeId ?? ''}:${touching.join('+')}`;
}

type Num = number;
const op = (cur: unknown, m: AbilityMod): unknown => {
  if (m.valor !== undefined) return m.valor;
  if (typeof cur !== 'number') return cur;
  if (m.mult !== undefined) return (cur as Num) * m.mult;
  if (m.soma !== undefined) return (cur as Num) + m.soma;
  return cur;
};

/** Lê e grava um campo com ponto (ex.: 'salto.saltos'). */
function setPath(obj: Record<string, unknown>, path: string, m: AbilityMod): void {
  const parts = path.split('.');
  let o: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const nx = o[parts[i]!];
    if (typeof nx !== 'object' || nx === null) return;
    o = nx as Record<string, unknown>;
  }
  const k = parts[parts.length - 1]!;
  if (o[k] === undefined && m.valor === undefined) return;
  o[k] = op(o[k], m);
}

/** Campos da própria habilidade que um talento pode mudar. */
const ABILITY_FIELDS = new Set(['radius', 'range', 'cooldownS', 'cost', 'castMs', 'telegraphMs', 'angleDeg', 'cargaS']);

/** Aplica uma modificação numa cópia da habilidade. Ganchos de modificação ficam sem efeito (registrar em hooks). */
export function applyAbilityMod(a: Ability, m: AbilityMod): void {
  const rec = a as unknown as Record<string, unknown>;
  if (m.campo && !m.efeito) {
    if (ABILITY_FIELDS.has(m.campo)) setPath(rec, m.campo, m);
  } else if (m.campo && m.efeito) {
    for (const ef of flattenEffects(a.effects)) {
      if (ef.kind !== m.efeito) continue;
      if (m.stat && (ef as { stat?: string }).stat !== m.stat) continue;
      setPath(ef as unknown as Record<string, unknown>, m.campo, m);
    }
  }
  if (m.efeitosExtras?.length) a.effects.push(...(JSON.parse(JSON.stringify(m.efeitosExtras)) as Effect[]));
}

const derivedCache = new Map<string, Ability | null>();

/** Monta a habilidade derivada a partir do id (null se o id não for derivado ou não existir). */
export function buildDerivedAbility(id: string, lookupBase: (id: string) => Ability | undefined): Ability | null {
  if (derivedCache.has(id)) return derivedCache.get(id)!;
  const i = id.indexOf(SEP);
  let out: Ability | null = null;
  if (i > 0) {
    const base = lookupBase(id.slice(0, i));
    const rest = id.slice(i + 1);
    const j = rest.indexOf(':');
    if (base && j >= 0) {
      const arch = rest.slice(0, j) || undefined;
      const talents = rest.slice(j + 1).split('+').filter(Boolean);
      const a = JSON.parse(JSON.stringify(base)) as Ability;
      a.id = id;
      for (const m of modsFor(base.id, arch, talents)) applyAbilityMod(a, m);
      out = a;
    }
  }
  derivedCache.set(id, out);
  return out;
}

const INSTALLED = Symbol.for('pqp.derivedAbilities');

/**
 * Ensina o mapa de habilidades de getData() a achar os ids derivados. Idempotente. Roda ao
 * carregar este módulo (combat.ts e spawn.ts importam), então qualquer getData().abilities.get
 * acha a habilidade do botão.
 */
export function installDerivedAbilities(): void {
  const m = getData().abilities as Map<string, Ability> & { [INSTALLED]?: boolean };
  if (m[INSTALLED]) return;
  const get = Map.prototype.get.bind(m) as (k: string) => Ability | undefined;
  const has = Map.prototype.has.bind(m) as (k: string) => boolean;
  Object.defineProperty(m, 'get', {
    configurable: true,
    value: (k: string) => get(k) ?? (k.includes(SEP) ? (buildDerivedAbility(k, get) ?? undefined) : undefined),
  });
  Object.defineProperty(m, 'has', {
    configurable: true,
    value: (k: string) => has(k) || (k.includes(SEP) && buildDerivedAbility(k, get) !== null),
  });
  Object.defineProperty(m, INSTALLED, { value: true });
}

installDerivedAbilities();

/**
 * Troca os ids dos botões pelos derivados dos talentos da entidade, e o Especial pela virada
 * quando um talento manda (substituiEspecial, fora do piloto).
 */
export function applyTalentLoadout(e: Entity): void {
  const l = e.loadout;
  if (!l) return;
  const talents = e.talents ?? [];
  const D = getData();
  for (const tid of talents) {
    const t = D.talentsById.get(tid);
    const sub = t ? talentEffectFor(t, e.archetypeId)?.substituiEspecial : undefined;
    if (sub && D.abilities.has(sub)) l.especial = sub;
  }
  if (talents.length === 0) return;
  for (const k of ['b1', 'b2', 'b3', 'especial', 'basico'] as const satisfies readonly (keyof Loadout)[]) {
    const id = l[k];
    if (id) l[k] = derivedAbilityId(id, e.archetypeId, talents);
  }
}
