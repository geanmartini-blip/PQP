/**
 * XP, saque e moeda (fase 12 do step).
 * - Só luta em grupo dá XP: 2 ou mais personagens do mesmo lado na luta (plantonista e IA contam);
 *   cada jogador ao vivo a mais dá +15% para todos; plantonista ganha metade e não conta no bônus.
 * - Solo dá itens e materiais: cada jogador que participou rola o próprio saque (loot.json).
 * - O saque cai no chão como entidade 'loot'; quem encosta pega (raioColetaSaqueTiles).
 */
import { getData } from '../data';
import { groupXp } from '../game/progression';
import type { LootTable } from '../schema/item';
import { bal, XP_PARTICIPATION_MS, XP_PARTICIPATION_RADIUS } from './constants';
import { isPartyMember, isUp, statPts } from './entity';
import { dist } from './geom';
import { enemyAi, relevel, spawnLoot } from './spawn';
import { xpToNext } from './stats';
import { msToTicks, type Entity, type World } from './types';
import { emit } from './world';

/** Tabela de saque com a variante da região ou da masmorra (ex.: loot_normal_delta), se existir. */
export function resolveLootTable(base: string, enemyId: string): LootTable | undefined {
  const D = getData();
  const def = D.enemiesById.get(enemyId);
  const cands: string[] = [];
  if (def?.masmorra) cands.push(`${base}_${def.masmorra.id.split('_')[0]}`);
  for (const r of def?.regioes ?? []) cands.push(`${base}_${r}`);
  cands.push(base);
  for (const id of cands) {
    const t = D.lootTablesById.get(id);
    if (t) return t;
  }
  return undefined;
}

/** Quem participou da luta contra `enemy`: jogadores e companheiros que bateram nele ou estavam perto. */
function participants(w: World, enemy: Entity): Entity[] {
  const out: Entity[] = [];
  const recent = msToTicks(XP_PARTICIPATION_MS);
  for (const e of w.entities.values()) {
    if (!isPartyMember(e) || e.team === enemy.team || e.dead) continue;
    const hit = enemy.attackers?.[e.id];
    const near = isUp(e) && dist(e.x, e.y, enemy.x, enemy.y) <= XP_PARTICIPATION_RADIUS;
    if ((hit !== undefined && w.tick - hit <= recent) || near) out.push(e);
  }
  return out;
}

/** Dá XP a um jogador e sobe de nível quantas vezes precisar. */
export function grantXp(w: World, e: Entity, amount: number): void {
  if (amount <= 0) return;
  e.xp = (e.xp ?? 0) + amount;
  emit(w, { t: 'xp', dst: e.id, amount });
  // Fase 2: teto de nível (Delta 7 até o Bruno Ferro, travessia 8); o XP passa do teto e fica guardado
  while ((e.xp ?? 0) >= xpToNext(e.level) && (e.levelCap === undefined || e.level < e.levelCap)) {
    e.xp = (e.xp ?? 0) - xpToNext(e.level);
    relevel(w, e, e.level + 1);
    emit(w, { t: 'level', dst: e.id, level: e.level });
  }
}

/** Recompensas dos inimigos que caíram e ainda não foram pagos. */
export function tickRewards(w: World): void {
  const c = bal().combate;
  for (const enemy of Array.from(w.entities.values())) {
    if (enemy.kind !== 'enemy' || !enemy.dead) continue;
    const ai = enemyAi(enemy);
    if (ai.rewarded) continue;
    ai.rewarded = true;
    const parts = participants(w, enemy);
    // XP: só em grupo (regra em game/progression.ts groupXp). Fase 2: quem ainda está no Delta
    // (deltaRookie) tem o Seu Jacó junto, então a luta dele conta como grupo.
    const live = parts.filter((p) => p.kind === 'player' && !p.onDuty).length;
    for (const p of parts) {
      if (p.kind !== 'player') continue;
      if (parts.length < c.grupoMin && !p.deltaRookie) continue;
      const amount = groupXp(ai.xp, { personagens: parts.length, aoVivo: live, plantonista: !!p.onDuty, xpPct: statPts(p, 'xp') }, { delta: !!p.deltaRookie });
      grantXp(w, p, amount);
    }
    // saque: rolagem individual, para cada jogador que participou (solo também)
    const table = resolveLootTable(ai.lootTable, enemy.defId);
    if (!table) continue;
    for (const p of parts) if (p.kind === 'player') rollLoot(w, enemy, p, table);
  }
}

/** Uma rolagem de saque para um jogador: moedas, itens, materiais e consumíveis. */
function rollLoot(w: World, enemy: Entity, p: Entity, t: LootTable): void {
  const D = getData();
  const owner = p.playerId ?? `#${p.id}`;
  const lootMult = 1 + statPts(p, 'loot') / 100;
  const drop = (loot: NonNullable<Entity['loot']>, name?: string) => {
    const a = w.rng.next() * Math.PI * 2;
    const r = 0.3 + w.rng.next() * 0.6;
    spawnLoot(w, enemy.x + Math.cos(a) * r, enemy.y + Math.sin(a) * r, { ...loot, forPlayerId: owner }, name);
  };
  // moedas
  let semente = 0, credito = 0;
  for (const m of t.moedas) {
    if (w.rng.next() >= m.chance) continue;
    const q = w.rng.int(m.min, m.max);
    const moeda = m.moeda === 'da_margem' ? (p.side === 'direita' ? 'credito' : 'semente') : m.moeda;
    if (moeda === 'credito') credito += q;
    else semente += q;
  }
  if (semente > 0 || credito > 0) drop({ currency: { ...(semente > 0 ? { semente } : {}), ...(credito > 0 ? { credito } : {}) } }, 'Moedas');
  // itens
  const nivelMax = p.level + D.loot.rolagem.margemDeNivel;
  for (let r = 0; r < t.rolagensItem; r++) {
    if (w.rng.next() >= Math.min(1, t.chanceItem * lootMult)) continue;
    const rarity = pickRarity(w, t);
    if (rarity === 'unico') {
      const pool = t.unicos.map((id) => D.uniquesById.get(id)).filter((u) => u && u.nivelMin <= nivelMax);
      if (pool.length === 0) continue;
      const u = pool[w.rng.int(0, pool.length - 1)]!;
      drop({ itemId: u.id, rarity: 'unico' }, u.name);
      continue;
    }
    if (rarity !== 'comum' && rarity !== 'raro') continue;
    const pool = D.items.itens.filter((it) => {
      if (it.rarity !== rarity || it.nivelMin > nivelMax) return false;
      if (t.filtroItens.margem === 'delta' ? it.margem !== null : it.margem !== (p.side ?? null)) return false;
      if (t.filtroItens.classe === 'geral') return it.classLock === null;
      return it.classLock === null || it.classLock === p.classId;
    });
    if (pool.length === 0) continue;
    const it = pool[w.rng.int(0, pool.length - 1)]!;
    drop({ itemId: it.id, rarity }, it.name);
  }
  // materiais e consumíveis
  for (const m of t.materiais) {
    if (w.rng.next() >= m.chance) continue;
    const q = w.rng.int(m.min, m.max);
    for (let k = 0; k < q; k++) drop({ itemId: m.id }, m.id);
  }
  for (const cns of t.consumiveis) {
    if (w.rng.next() >= cns.chance) continue;
    drop({ itemId: cns.id }, D.consumablesById.get(cns.id)?.name ?? cns.id);
  }
}

function pickRarity(w: World, t: LootTable): string {
  const r = w.rng.next();
  let acc = 0;
  for (const k of ['comum', 'raro', 'unico', 'set'] as const) {
    acc += t.chancePorRaridade[k] ?? 0;
    if (r < acc) return k;
  }
  return 'comum';
}

const RARITY_ORDER = ['comum', 'raro', 'unico', 'set'] as const;
const rarityRank = (r: string | undefined) => {
  const i = RARITY_ORDER.indexOf((r ?? 'comum') as (typeof RARITY_ORDER)[number]);
  return i < 0 ? 0 : i;
};

/** Filtro de raridade em uso (o do jogador, ou loot.json coleta.filtroPadrao). */
export const lootFilterOf = (p: Entity) => p.lootFilter ?? getData().loot.coleta.filtroPadrao;
/** Venda automática ligada (a do jogador, ou loot.json vendaAutomatica.padraoLigada). */
export const autoSellOf = (p: Entity) => p.autoSell ?? getData().loot.vendaAutomatica.padraoLigada;

/**
 * O que a coleta faz com este saque para este jogador: 'pegar', 'vender' (venda automática) ou
 * 'deixar' (abaixo do filtro de raridade). Moedas, materiais e consumíveis passam sempre
 * (coleta.moedasEMateriaisSempre); o filtro vale para itens com raridade.
 */
export function pickupAction(p: Entity, l: Entity): 'pegar' | 'vender' | 'deixar' {
  const L = getData().loot;
  const loot = l.loot ?? {};
  // moedas, materiais e consumíveis não têm raridade: passam sempre (coleta.moedasEMateriaisSempre)
  if (!loot.itemId || loot.rarity === undefined) return 'pegar';
  const sell = autoSellOf(p) && (L.vendaAutomatica.raridades as readonly string[]).includes(loot.rarity);
  if (sell) return 'vender';
  return rarityRank(loot.rarity) >= rarityRank(lootFilterOf(p)) ? 'pegar' : 'deixar';
}

/**
 * Coleta automática: jogador de pé encosta no saque (dele ou de ninguém) e pega, respeitando o
 * filtro de raridade; o que está abaixo do filtro fica no chão (some com o tempo), ou vai para a
 * venda automática quando ela está ligada.
 */
export function tickPickup(w: World): void {
  const r = bal().combate.raioColetaSaqueTiles;
  const loots = Array.from(w.entities.values()).filter((e) => e.kind === 'loot' && !e.dead);
  if (loots.length === 0) return;
  const players = Array.from(w.entities.values()).filter((e) => e.kind === 'player' && isUp(e));
  for (const l of loots) {
    for (const p of players) {
      const owner = p.playerId ?? `#${p.id}`;
      if (l.loot?.forPlayerId !== undefined && l.loot.forPlayerId !== owner) continue;
      if (dist(p.x, p.y, l.x, l.y) > r + p.radius) continue;
      const act = pickupAction(p, l);
      if (act === 'deixar') continue;
      if (act === 'vender') sell(w, p, l);
      else pickUp(w, p, l);
      break;
    }
  }
}

/**
 * Venda automática: o item vira moeda da margem, precoBase × fracaoDoPrecoBase (precoBase é em
 * Semente; em Crédito multiplica pela cotação base do câmbio, economy.cambio.base).
 * SUGESTÃO: sem margem (Delta) paga em Semente; arredonda para baixo, mínimo 1.
 */
function sell(w: World, p: Entity, l: Entity): void {
  const D = getData();
  const id = l.loot?.itemId;
  const preco = (id && (D.itemsById.get(id)?.precoBase ?? D.uniquesById.get(id)?.precoBase)) || 0;
  const v = D.loot.vendaAutomatica;
  // v.moeda é sempre 'da_margem' (esquema)
  const moeda = p.side === 'direita' ? 'credito' : 'semente';
  const mult = moeda === 'credito' ? D.economy.cambio.base : 1;
  const amount = Math.max(1, Math.floor(preco * v.fracaoDoPrecoBase * mult));
  l.dead = true;
  emit(w, { t: 'loot_pick', id: l.id, by: p.id });
  if (moeda === 'credito') {
    p.credito = (p.credito ?? 0) + amount;
    emit(w, { t: 'currency', dst: p.id, credito: amount });
  } else {
    p.semente = (p.semente ?? 0) + amount;
    emit(w, { t: 'currency', dst: p.id, semente: amount });
  }
}

function pickUp(w: World, p: Entity, l: Entity): void {
  const loot = l.loot ?? {};
  l.dead = true;
  emit(w, { t: 'loot_pick', id: l.id, by: p.id });
  if (loot.currency) {
    p.semente = (p.semente ?? 0) + (loot.currency.semente ?? 0);
    p.credito = (p.credito ?? 0) + (loot.currency.credito ?? 0);
    emit(w, { t: 'currency', dst: p.id, ...(loot.currency.semente ? { semente: loot.currency.semente } : {}), ...(loot.currency.credito ? { credito: loot.currency.credito } : {}) });
  }
  if (loot.itemId) {
    if (p.loadout?.item === loot.itemId) p.loadout.itemCount = (p.loadout.itemCount ?? 0) + 1;
    else (p.inventory ??= []).push(loot.itemId);
  }
}
