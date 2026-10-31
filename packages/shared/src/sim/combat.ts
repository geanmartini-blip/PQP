/**
 * Regras de combate: estados, controle com imunidade, escudo, dano, cura, empurrão, caído e morte.
 *
 * Dano (balance.dano): ataque × mult × K ÷ (K + defesa) × (1 + vantagem) × (1 + bônus) × crítico ×
 * (1 ± variação), K = defesaKBase + defesaKPorNivel × nível do atacante, mínimo danoMinimo.
 * Bônus do mesmo tipo somam (dano causado; dano recebido do alvo; marca; margem) e tipos
 * diferentes multiplicam. A redução de dano vem depois, e o escudo absorve o que sobrar.
 */
import { getData } from '../data';
import type { Passive } from '../schema/ability';
import { bal, MAX_DAMAGE_REDUCTION_PCT, SPECIAL_BANK_MAX_S } from './constants';
import {
  CC_NO_ABILITY,
  firstStatus,
  getEnt,
  hasStatus,
  hpRatio,
  isDamageable,
  isFriendly,
  isHostile,
  isPartyMember,
  isUp,
  statPts,
  statusesOf,
  sumStatusValue,
} from './entity';
import { dist } from './geom';
import { moveBody } from './movement';
import { msToTicks, type Entity, type StatusInstance, type World } from './types';
import { emit, newId } from './world';

// ---------------------------------------------------------------------------
// Estados

export interface StatusSpec {
  kind: string;
  durationMs: number;
  value: number;
  abilityId?: string;
  data?: Record<string, unknown>;
  /** acumula até max (reforço com acumulaMax); sem isso, reaplicar só renova */
  stack?: { max: number };
}

/**
 * Aplica um estado. Reaplicar o mesmo tipo, da mesma fonte e da mesma habilidade só renova a
 * duração (e acumula, se `stack`); o escudo nunca recarrega o valor (ability.ts, convenções).
 */
export function applyStatus(w: World, target: Entity, source: Entity | undefined, spec: StatusSpec): StatusInstance {
  const sourceId = source?.id ?? 0;
  const endTick = w.tick + Math.max(1, msToTicks(spec.durationMs));
  const ex = target.statuses.find((s) => s.kind === spec.kind && s.sourceId === sourceId && s.abilityId === spec.abilityId);
  if (ex) {
    if (endTick > ex.endTick) ex.endTick = endTick;
    if (spec.stack && (ex.stacks ?? 1) < spec.stack.max) ex.stacks = (ex.stacks ?? 1) + 1;
    if (spec.kind !== 'escudo' && spec.value > ex.value) ex.value = spec.value;
    if (spec.kind === 'puxar' && spec.data) ex.data = { ...ex.data, ...spec.data };
    return ex;
  }
  const s: StatusInstance = {
    uid: newId(w),
    kind: spec.kind,
    sourceId,
    startTick: w.tick,
    endTick,
    value: spec.value,
  };
  if (spec.abilityId !== undefined) s.abilityId = spec.abilityId;
  if (spec.stack) s.stacks = 1;
  if (spec.data) s.data = spec.data;
  target.statuses.push(s);
  if (spec.kind === 'escudo') recomputeShield(target);
  emit(w, { t: 'status', dst: target.id, kind: spec.kind, on: true });
  return s;
}

/** Tira estados que casam com o filtro; avisa e desfaz o que precisa (reforço de vida, escudo). */
export function removeStatuses(w: World, e: Entity, pred: (s: StatusInstance) => boolean): void {
  const keep: StatusInstance[] = [];
  const gone: StatusInstance[] = [];
  for (const s of e.statuses) (pred(s) ? gone : keep).push(s);
  if (gone.length === 0) return;
  e.statuses = keep;
  for (const s of gone) {
    onStatusEnd(e, s);
    emit(w, { t: 'status', dst: e.id, kind: s.kind, on: false });
  }
  recomputeShield(e);
}

/** Efeito colateral do fim de um estado. */
function onStatusEnd(e: Entity, s: StatusInstance): void {
  if (s.kind === 'reforco:hp') {
    const add = Number(s.data?.['hpAdd'] ?? 0);
    e.stats.hpMax = Math.max(1, e.stats.hpMax - add);
    if (e.hp > e.stats.hpMax) e.hp = e.stats.hpMax;
  }
}

export function recomputeShield(e: Entity): void {
  e.shield = sumStatusValue(e, 'escudo');
}

/** Reforço de um atributo (StatKey) em pontos percentuais. 'hp' aumenta a vida máxima na hora. */
export function applyBuff(w: World, target: Entity, source: Entity | undefined, stat: string, pct: number, durationMs: number, abilityId?: string, acumulaMax?: number): void {
  const dur = durationMs * (1 + (source ? statPts(source, 'buffDuration') : 0) / 100);
  const kind = `reforco:${stat}`;
  const existed = target.statuses.some((s) => s.kind === kind && s.sourceId === (source?.id ?? 0) && s.abilityId === abilityId);
  const st = applyStatus(w, target, source, { kind, durationMs: dur, value: pct, abilityId, ...(acumulaMax ? { stack: { max: acumulaMax } } : {}) });
  if (stat === 'hp' && !existed) {
    const add = target.stats.hpMax * (pct / 100);
    target.stats.hpMax += add;
    target.hp += add;
    st.data = { ...st.data, hpAdd: add };
  }
}

// ---------------------------------------------------------------------------
// Passivos de afixo (e, depois, de talento, guia e item)

/** Passivos ativos da entidade: hoje, os dos afixos de elite. */
export function passivesOf(e: Entity): Passive[] {
  if (!e.affixes || e.affixes.length === 0) return [];
  const out: Passive[] = [];
  for (const id of e.affixes) {
    const af = getData().enemies.afixos.find((a) => a.id === id);
    if (af) out.push(...af.passivos);
  }
  return out;
}

/** Tem uma regra-gancho passiva (ex.: 'imune_empurrao' do afixo Blindado). */
export const hasRule = (e: Entity, gancho: string) => passivesOf(e).some((p) => p.kind === 'regra' && p.gancho === gancho);

// ---------------------------------------------------------------------------
// Margem (Encanto x máquina)

/** Região do ponto pelo retângulo do mapa (o primeiro que contém o ponto). */
export function regionAt(w: World, x: number, y: number): string | undefined {
  for (const r of w.map.regions) if (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h) return r.regionId;
  return undefined;
}

/** % de margem (ataque, defesa e cura) pela região onde a entidade está. */
export function marginPct(w: World, e: Entity): number {
  if (!e.side) return 0;
  const em = bal().encantoMaquina;
  const regionId = regionAt(w, e.x, e.y);
  if (!regionId) return 0;
  const rs = w.regionState?.[regionId];
  let pct = 0;
  for (const m of em.modificadores) {
    const v = e.side === 'esquerda' ? m.esquerdaPct : m.direitaPct;
    if (v === 0) continue;
    switch (m.condicao) {
      case 'natureza':
      case 'cidade':
        if (m.regioes?.includes(regionId as never)) pct += v;
        break;
      case 'energia':
        if (rs?.energia) pct += v;
        break;
      case 'apagao':
        if (rs?.apagao) pct += v;
        break;
      case 'poluicao_zero':
        if (rs && rs.poluicao === 0) pct += v;
        break;
      case 'por_ponto_poluicao':
        if (rs) pct += v * rs.poluicao;
        break;
    }
  }
  return Math.max(em.combinacao.pisoPct, Math.min(em.combinacao.tetoPct, pct));
}

// ---------------------------------------------------------------------------
// Especial

/** Soma pontos de carga do Especial (o teto e o piso por segundo são aplicados no step). */
export function addSpecialPts(e: Entity, pts: number): void {
  if (!e.loadout?.especial || pts <= 0 || e.special >= 1) return;
  const bonus = 1 + statPts(e, 'specialCharge') / 100;
  const cap = bal().especial.tetoPorS * SPECIAL_BANK_MAX_S * specialFactor(e) * bonus;
  e.specialBank = Math.min(cap, (e.specialBank ?? 0) + pts * bonus);
}

/** cargaS ÷ cargaReferenciaS do Especial no botão (1 sem Especial). */
export function specialFactor(e: Entity): number {
  const id = e.loadout?.especial;
  if (!id) return 1;
  const a = getData().abilities.get(id);
  return (a?.cargaS ?? bal().especial.cargaReferenciaS) / bal().especial.cargaReferenciaS;
}

const markActive = (w: World, e: Entity) => {
  e.lastActiveTick = w.tick;
};
const markCombat = (w: World, e: Entity) => {
  e.lastCombatTick = w.tick;
};

// ---------------------------------------------------------------------------
// Controle

export type ControlResult = 'aplicado' | 'lentidao' | 'resistiu';

/**
 * Controle de 1 a 2 s (provocar até 4 s; quebraAoApanhar até 6 s; bônus até 4 s), com imunidade
 * de imunidadeControleMs depois. Provocar não dá nem respeita a imunidade. Em chefe vira lentidão
 * de controleViraLentidaoPct pela mesma duração e solta cc_slow.
 */
export function applyControl(
  w: World,
  target: Entity,
  source: Entity | undefined,
  cc: string,
  durationMs: number,
  opts: { abilityId?: string; quebraAoApanhar?: boolean } = {},
): ControlResult {
  const c = bal().combate;
  if (!isUp(target) || target.kind === 'loot' || target.team === 'neutros') return 'resistiu';
  const imune = firstStatus(target, 'imune');
  if (imune && imune.data?.['aControle'] === true) return 'resistiu';

  const bonusPct = source ? statPts(source, 'ccDuration') : 0;
  let dur = durationMs * (1 + bonusPct / 100);
  const limit = cc === 'provocar' ? c.provocarMaxMs : opts.quebraAoApanhar ? c.controleQuebravelMaxMs : bonusPct > 0 ? c.controleComBonusMaxMs : c.controleMs.max;
  dur = Math.min(dur, Math.max(durationMs, limit));
  dur *= 1 - Math.min(90, Math.max(0, statPts(target, 'ccResist'))) / 100;

  if (target.kind === 'enemy' && target.tier === 'chefe') {
    const def = getData().enemiesById.get(target.defId);
    const pct = def?.controleViraLentidaoPct ?? c.chefeLentidaoPct;
    applyStatus(w, target, source, { kind: 'lentidao', durationMs: dur, value: pct, abilityId: opts.abilityId ? `${opts.abilityId}:cc` : 'cc' });
    emit(w, { t: 'cc_slow', dst: target.id });
    return 'lentidao';
  }

  const limited = cc !== 'provocar';
  if (limited && target.ccImmuneUntil > w.tick) return 'resistiu';
  applyStatus(w, target, source, {
    kind: cc,
    durationMs: dur,
    value: 1,
    abilityId: opts.abilityId,
    ...(opts.quebraAoApanhar ? { data: { quebraAoApanhar: true } } : {}),
  });
  if (limited) target.ccImmuneUntil = w.tick + msToTicks(dur) + msToTicks(c.imunidadeControleMs);
  if ((CC_NO_ABILITY as readonly string[]).includes(cc)) {
    target.casting = undefined;
  }
  if (cc === 'provocar' && source && target.kind === 'enemy') {
    target.targetId = source.id;
  }
  return 'aplicado';
}

// ---------------------------------------------------------------------------
// Escudo

/** Escudo: reaplicar pela mesma fonte e habilidade só renova a duração, nunca o valor gasto. */
export function applyShield(w: World, target: Entity, source: Entity | undefined, amount: number, durationMs: number, abilityId?: string, data?: Record<string, unknown>): void {
  if (!isUp(target)) return;
  const ex = target.statuses.find((s) => s.kind === 'escudo' && s.sourceId === (source?.id ?? 0) && s.abilityId === abilityId);
  if (ex) {
    const end = w.tick + Math.max(1, msToTicks(durationMs));
    if (end > ex.endTick) ex.endTick = end;
    return;
  }
  applyStatus(w, target, source, { kind: 'escudo', durationMs, value: amount, abilityId, ...(data ? { data } : {}) });
  if (source && source.team === target.team) {
    addSpecialPts(source, (amount / target.stats.hpMax) * 100 * bal().especial.porPctVidaCurada);
    markActive(w, source);
  }
  emit(w, { t: 'shield', src: source?.id ?? 0, dst: target.id, amount: Math.round(amount) });
}

// ---------------------------------------------------------------------------
// Dano

export interface DamageOpts {
  abilityId?: string;
  /** dano à distância (projétil, tiro): bloqueado por 'imune' com aDanoDistancia */
  ranged?: boolean;
  noCrit?: boolean;
  /** dano fixo, sem fórmula (devolução de dano) */
  raw?: number;
  /** já é devolução: não devolve de novo */
  reflected?: boolean;
  /** ataque básico (para a carga e o recurso) */
  basic?: boolean;
  /** confusão: pode acertar quem é do mesmo time */
  friendlyFire?: boolean;
  /** crítico garantido */
  forceCrit?: boolean;
}

/** Quem leva o crédito do golpe (a invocação passa para o dono). */
export const creditId = (src: Entity) => (src.kind === 'summon' && src.ownerId !== undefined ? src.ownerId : src.id);

/**
 * Dano de `src` em `dst` com a fórmula do balance. Devolve o dano causado (0 = errou ou imune).
 * Solta 'hit' ou 'miss' e cuida de escudo, devolução, controle que quebra, caído e morte.
 */
export function dealDamage(w: World, src: Entity, dst: Entity, mult: number, opts: DamageOpts = {}): number {
  if (!isDamageable(dst)) return 0;
  if (!opts.friendlyFire && !opts.reflected && !isHostile(src, dst)) return 0;
  const imune = firstStatus(dst, 'imune');
  if (imune && (imune.data?.['aDano'] === true || (opts.ranged && imune.data?.['aDanoDistancia'] === true))) {
    emit(w, { t: 'miss', src: src.id, dst: dst.id });
    return 0;
  }

  const b = bal();
  let amount: number;
  let crit = false;
  if (opts.raw !== undefined) {
    amount = opts.raw;
  } else {
    // erro: cego erra; esquiva do alvo menos precisão do atacante
    if (hasStatus(src, 'cegar')) {
      emit(w, { t: 'miss', src: src.id, dst: dst.id });
      return 0;
    }
    const evasion = dst.stats.evasion + statPts(dst, 'evasion') / 100 - statPts(src, 'accuracy') / 100;
    if (evasion > 0 && w.rng.next() < evasion) {
      emit(w, { t: 'miss', src: src.id, dst: dst.id });
      return 0;
    }
    const atk = src.stats.attack * Math.max(0, 1 + statPts(src, 'attack') / 100) * (1 + marginPct(w, src) / 100);
    const def = dst.stats.defense * Math.max(0, 1 + statPts(dst, 'defense') / 100) * (1 + marginPct(w, dst) / 100);
    const K = b.dano.defesaKBase + b.dano.defesaKPorNivel * src.level;
    amount = atk * mult * (K / (K + Math.max(0, def)));
    // vantagem entre classes: só de jogador (ou IA de classe) para jogador
    if (src.classId && dst.classId && src.kind !== 'enemy' && dst.kind !== 'enemy') {
      const vc = b.vantagemClasse as Record<string, Record<string, number> | undefined>;
      amount *= 1 + (vc[src.classId]?.[dst.classId] ?? 0) / 100;
    }
    amount *= 1 + statPts(src, 'damage') / 100;
    amount *= Math.max(0, 1 + statPts(dst, 'damageTaken') / 100);
    amount *= 1 + markPts(dst, src) / 100;
    const critChance = src.stats.critChance + statPts(src, 'crit') / 100;
    if (!opts.noCrit && (opts.forceCrit || w.rng.next() < critChance)) {
      crit = true;
      amount *= src.stats.critDamage + statPts(src, 'critDamage') / 100;
    }
    const v = b.dano.variacaoPct / 100;
    amount *= 1 + (w.rng.next() * 2 - 1) * v;
    amount = Math.max(b.dano.danoMinimo, amount);
  }
  const red = Math.min(MAX_DAMAGE_REDUCTION_PCT, sumStatusValue(dst, 'reducao_dano'));
  amount *= 1 - red / 100;
  amount = Math.max(opts.raw !== undefined ? 0 : b.dano.danoMinimo, Math.round(amount));
  if (amount <= 0) return 0;

  // escudo absorve antes da vida
  let rest = amount;
  for (const s of statusesOf(dst, 'escudo')) {
    if (rest <= 0) break;
    if (s.value <= 0) continue;
    const take = Math.min(s.value, rest);
    s.value -= take;
    rest -= take;
    const dev = Number(s.data?.['devolvePct'] ?? 0);
    if (dev > 0 && !opts.reflected && src.id !== dst.id) {
      dealDamage(w, dst, src, 0, { raw: (take * dev) / 100, reflected: true, noCrit: true });
    }
  }
  recomputeShield(dst);

  const before = dst.hp;
  dst.hp -= rest;
  const hold = firstStatus(dst, 'segurar_vida');
  if (hold && dst.hp < hold.value) dst.hp = Math.min(before, hold.value);

  emit(w, {
    t: 'hit',
    src: src.id,
    dst: dst.id,
    amount,
    ...(crit ? { crit: true } : {}),
    ...(opts.abilityId ? { ability: opts.abilityId } : {}),
    ...(damageKindOf(src) ? { kind: damageKindOf(src)! } : {}),
  });

  // contabilidade de combate
  const cid = creditId(src);
  dst.attackers ??= {};
  dst.attackers[cid] = w.tick;
  markCombat(w, dst);
  markActive(w, dst);
  markCombat(w, src);
  markActive(w, src);
  const owner = cid !== src.id ? getEnt(w, cid) : undefined;
  if (owner) {
    markCombat(w, owner);
    markActive(w, owner);
  }
  const lostPct = (Math.max(0, before - dst.hp) / dst.stats.hpMax) * 100;
  if (lostPct > 0) {
    addSpecialPts(dst, lostPct * b.especial.porPctVidaPerdida);
    const res = resourceDef(dst);
    if (res?.ganhoPorPctVidaPerdida) dst.resource = Math.min(resourceMaxOf(dst), dst.resource + lostPct * res.ganhoPorPctVidaPerdida);
  }

  // controle que acaba no primeiro golpe
  if (dst.statuses.some((s) => s.data?.['quebraAoApanhar'] === true)) {
    removeStatuses(w, dst, (s) => s.data?.['quebraAoApanhar'] === true);
  }
  // devolver dano (Barriga Hidráulica)
  const devolve = sumStatusValue(dst, 'devolver_dano');
  if (devolve > 0 && !opts.reflected && src.id !== dst.id && isUp(src)) {
    dealDamage(w, dst, src, 0, { raw: (amount * devolve) / 100, reflected: true, noCrit: true });
  }
  // Desconstruído: cada golpe que ele segura cura um aliado
  const desc = firstStatus(dst, 'desconstruido');
  if (desc) {
    const pct = Number(desc.data?.['curaPctVidaMaxPorGolpe'] ?? 5);
    const ally = lowestHpAlly(w, dst, 8, true);
    if (ally) heal(w, dst, ally, (pct / 100) * ally.stats.hpMax, { abilityId: desc.abilityId });
  }

  if (dst.hp <= 0) onZeroHp(w, dst, src);
  return amount;
}

/** Soma das marcas no alvo que valem para este atacante (do time dele; soDoLancador só para a fonte). */
function markPts(dst: Entity, src: Entity): number {
  let t = 0;
  const cid = creditId(src);
  for (const s of dst.statuses) {
    if (s.kind !== 'marca') continue;
    if (s.data?.['soDoLancador'] === true) {
      if (s.sourceId === cid) t += s.value;
    } else if (s.data?.['team'] === undefined || s.data['team'] === src.team) t += s.value;
  }
  return t;
}

function damageKindOf(src: Entity): 'impacto' | 'perfurante' | 'energia' | 'espirito' | undefined {
  if (!src.classId) return undefined;
  return getData().classesById.get(src.classId)?.damageType;
}

// ---------------------------------------------------------------------------
// Cura

/** Cura de pctVidaMax da vida do alvo, ou ataque × mult × (1 + 25% × Cura). Com bônus de cura e de margem. */
export function healAmount(w: World, src: Entity, dst: Entity, eff: { pctVidaMax?: number; mult?: number }): number {
  const b = bal();
  let a =
    eff.pctVidaMax !== undefined
      ? (eff.pctVidaMax / 100) * dst.stats.hpMax
      : src.stats.attack * (eff.mult ?? 0) * (1 + (b.dano.curaPorPontoCuraPct / 100) * (src.attr?.cura ?? 0));
  a *= 1 + statPts(src, 'healing') / 100;
  a *= 1 + marginPct(w, src) / 100;
  return Math.max(0, a);
}

/** Cura `amount` (até a vida máxima). Devolve quanto curou de fato. */
export function heal(w: World, src: Entity, dst: Entity, amount: number, opts: { abilityId?: string } = {}): number {
  if (!isUp(dst) || dst.kind === 'loot') return 0;
  amount *= Math.max(0, 1 + statPts(dst, 'healingTaken') / 100);
  const real = Math.max(0, Math.min(dst.stats.hpMax - dst.hp, amount));
  dst.hp += real;
  if (real > 0) {
    emit(w, { t: 'heal', src: src.id, dst: dst.id, amount: Math.round(real * 10) / 10 });
    markActive(w, src);
    if (isFriendly(src, dst)) addSpecialPts(src, (real / dst.stats.hpMax) * 100 * bal().especial.porPctVidaCurada);
  }
  void opts;
  return real;
}

/** Aliado com menor % de vida a até `range` tiles (inclui `from` se includeSelf). */
export function lowestHpAlly(w: World, from: Entity, range: number, includeSelf: boolean): Entity | undefined {
  let best: Entity | undefined;
  for (const e of w.entities.values()) {
    if (!isUp(e) || !isFriendly(from, e) || e.kind === 'loot') continue;
    if (!includeSelf && e.id === from.id) continue;
    if (e.kind === 'summon') continue;
    if (dist(from.x, from.y, e.x, e.y) > range) continue;
    if (!best || hpRatio(e) < hpRatio(best)) best = e;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Recurso

export function resourceDef(e: Entity) {
  if (!e.classId || !e.side) return undefined;
  return getData().classesById.get(e.classId)?.resource[e.side];
}

export const resourceMaxOf = (e: Entity) => e.stats.resourceMax * (1 + statPts(e, 'resourceMax') / 100);

// ---------------------------------------------------------------------------
// Empurrar e puxar

/** Pode ser deslocado à força: não é chefe, nem imóvel, nem imune a empurrão (Yokozuna, Blindado). */
export function canBeDisplaced(e: Entity): boolean {
  if (!isUp(e) || e.kind === 'loot' || e.kind === 'summon' || e.team === 'neutros') return false;
  if (e.kind === 'enemy' && e.tier === 'chefe') return false; // SUGESTÃO: chefe não é empurrado nem puxado
  if (e.ai?.['imovel'] === true) return false;
  const im = firstStatus(e, 'imune');
  if (im && im.data?.['aEmpurrao'] === true) return false;
  if (hasRule(e, 'imune_empurrao')) return false;
  return true;
}

/** Empurra para longe de (cx, cy) por `tiles`, com colisão. */
export function pushFrom(w: World, e: Entity, cx: number, cy: number, tiles: number, fallbackDir?: number): void {
  if (!canBeDisplaced(e)) return;
  let dx = e.x - cx, dy = e.y - cy;
  let d = Math.hypot(dx, dy);
  if (d < 1e-4) {
    const a = fallbackDir ?? 0;
    dx = Math.cos(a);
    dy = Math.sin(a);
    d = 1;
  }
  const p = moveBody(w.map, e.x, e.y, e.radius, (dx / d) * tiles, (dy / d) * tiles);
  e.x = p.x;
  e.y = p.y;
}

/** Puxa para (cx, cy) por até `tiles` (sem passar do ponto), com colisão. */
export function pullToward(w: World, e: Entity, cx: number, cy: number, tiles: number): void {
  if (!canBeDisplaced(e)) return;
  const dx = cx - e.x, dy = cy - e.y;
  const d = Math.hypot(dx, dy);
  const stopAt = e.radius + 0.1;
  if (d <= stopAt) return;
  const step = Math.min(tiles, d - stopAt);
  const p = moveBody(w.map, e.x, e.y, e.radius, (dx / d) * step, (dy / d) * step);
  e.x = p.x;
  e.y = p.y;
}

// ---------------------------------------------------------------------------
// Caído, levantar e morte

/**
 * Vida zerou. Jogador e companheiro caem por aliadoCaidoMs (30 s); inimigo e invocação morrem.
 * Na morte: explosão marcada (Derrubada), afixo explode_ao_morrer (aviso no chão) e dano contínuo
 * ou marca que pulam para o inimigo mais perto.
 */
export function onZeroHp(w: World, e: Entity, by: Entity | undefined): void {
  if (e.dead || e.downedUntil !== undefined) return;
  e.hp = 0;
  if (isPartyMember(e)) {
    downEntity(w, e);
    return;
  }
  e.dead = true;
  e.casting = undefined;
  e.pendingCast = undefined;
  emit(w, { t: 'death', dst: e.id, ...(by ? { by: creditId(by) } : {}) });

  // Derrubada: se o alvo cair dentro da janela, explode em área
  for (const s of statusesOf(e, 'explode_ao_morrer')) {
    const src = getEnt(w, s.sourceId);
    if (!src) continue;
    const raio = Number(s.data?.['raio'] ?? 2.5);
    const mult = Number(s.data?.['mult'] ?? 1);
    for (const t of Array.from(w.entities.values())) {
      if (t.id === e.id || !isHostile(src, t) || !isDamageable(t)) continue;
      if (dist(e.x, e.y, t.x, t.y) - t.radius <= raio) dealDamage(w, src, t, mult, { abilityId: s.abilityId });
    }
  }
  // pula para o inimigo mais perto (Maldição ou Vírus)
  for (const s of e.statuses) {
    if (s.data?.['pulaAoMorrer'] !== true) continue;
    if (s.kind !== 'dano_continuo' && s.kind !== 'marca') continue;
    const src = getEnt(w, s.sourceId);
    if (!src) continue;
    const alcance = Number(s.data?.['pulaAlcance'] ?? 4);
    const next = nearestOther(w, e, src, alcance);
    if (!next) continue;
    const remainingMs = Math.max(50, (s.endTick - w.tick) * 50);
    applyStatus(w, next, src, { kind: s.kind, durationMs: remainingMs, value: s.value, abilityId: s.abilityId, data: { ...s.data, nextTick: w.tick + 1 } });
  }
  // afixo Explode ao Morrer: pisca com aviso no chão e explode depois
  for (const p of passivesOf(e)) {
    if (p.kind !== 'regra' || !p.efeitos) continue;
    for (const ef of p.efeitos) {
      if (ef.kind !== 'explode_ao_morrer') continue;
      const tel = {
        id: newId(w),
        sourceId: e.id,
        abilityId: 'afixo_explode_ao_morrer',
        shape: 'circulo' as const,
        x: e.x,
        y: e.y,
        radius: ef.raio,
        startTick: w.tick,
        impactTick: w.tick + msToTicks(ef.janelaMs),
        team: e.team,
        power: { attack: e.stats.attack, level: e.level, mult: ef.mult },
      };
      w.telegraphs.push(tel);
      emit(w, { t: 'telegraph', tel });
    }
  }
}

/** Inimigo de `src` mais perto de `from`, a até `range` tiles e diferente de `from`. */
function nearestOther(w: World, from: Entity, src: Entity, range: number): Entity | undefined {
  let best: Entity | undefined;
  let bd = Infinity;
  for (const t of w.entities.values()) {
    if (t.id === from.id || !isHostile(src, t) || !isDamageable(t)) continue;
    const d = dist(from.x, from.y, t.x, t.y);
    if (d <= range && d < bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

export function downEntity(w: World, e: Entity): void {
  const c = bal().combate;
  e.hp = 0;
  e.downedUntil = w.tick + msToTicks(c.aliadoCaidoMs);
  e.reviveProgressMs = 0;
  e.casting = undefined;
  e.pendingCast = undefined;
  e.moveTo = undefined;
  e.path = undefined;
  e.targetId = undefined;
  e.manualTarget = false;
  removeStatuses(w, e, () => true);
  emit(w, { t: 'down', dst: e.id });
}

/** Levanta com pct% da vida. */
export function reviveEntity(w: World, e: Entity, pct: number, by?: Entity): void {
  if (e.downedUntil === undefined || e.dead) return;
  e.downedUntil = undefined;
  e.reviveProgressMs = 0;
  e.hp = Math.max(1, (pct / 100) * e.stats.hpMax);
  emit(w, { t: 'revive', dst: e.id, ...(by ? { by: by.id } : {}) });
}

/**
 * Ninguém levantou a tempo: volta ao QG (balance.combate.aoExpirarCaido = 'volta_ao_qg'). No
 * protótipo, o QG é o ponto onde nasceu (spawnX, spawnY). Perde perdePctDoXpDoNivel do XP do nível
 * (sem descer de nível; sem perda até semPerdaAteNivel; plantonista não perde).
 */
export function respawnAtHq(w: World, e: Entity): void {
  const morte = getData().progression.morte;
  emit(w, { t: 'death', dst: e.id });
  e.downedUntil = undefined;
  e.reviveProgressMs = 0;
  e.x = e.spawnX ?? e.x;
  e.y = e.spawnY ?? e.y;
  e.hp = e.stats.hpMax;
  e.resource = resourceMaxOf(e);
  e.vel = { x: 0, y: 0 };
  if (e.kind === 'player' && e.level > morte.semPerdaAteNivel && !(e.onDuty && !morte.plantonistaPerdeXp)) {
    const f = getData().progression.xp.formula;
    const need = Math[f.arredondamento](f.base * Math.pow(e.level, f.expoente));
    e.xp = Math.max(0, (e.xp ?? 0) - Math.round((need * morte.perdePctDoXpDoNivel) / 100));
  }
}
