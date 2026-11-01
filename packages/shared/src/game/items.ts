/**
 * Fase 5: itens do piloto (items.json e uniques.json), em regra pura.
 *
 * - 6 slots, um item de cada; comum e raro (itens-base) e os 2 únicos do piloto.
 * - Atributos em % sobre o atributo do personagem (atributosBase); o raro soma 1 ou 2 extras do
 *   poolExtras do slot; benzimento e calibração multiplicam os valores (bonusStatsPct); item da outra
 *   margem vale regras.outraMargem.multiplicadorStats.
 * - Visual: o traje da ala é a base e cada item muda a sua parte dentro do estilo da ala
 *   (regras.resolucaoVisual). Item sem classe adota o estilo da ala. A raridade aparece no sufixo.
 *
 * Nada aqui usa Math.random nem Date.
 */
import { getData } from '../data';
import type { Item, Unique } from '../schema/item';
import type { CharacterLook, PlayerRecord, SideId } from './types';

export const ITEM_SLOTS = ['cabeca', 'peito', 'arma', 'calcado', 'adorno'] as const;
export type ItemSlotId = (typeof ITEM_SLOTS)[number];
export type Raridade = 'comum' | 'raro' | 'unico' | 'set';
export const RARIDADES: readonly Raridade[] = ['comum', 'raro', 'unico', 'set'];

export type ItemDef = { kind: 'base'; def: Item } | { kind: 'unico'; def: Unique };

/** Definição de um item equipável (item-base ou único); undefined para consumível, material e móvel. */
export function itemDefOf(id: string): ItemDef | undefined {
  const D = getData();
  const it = D.itemsById.get(id);
  if (it) return { kind: 'base', def: it };
  const u = D.uniquesById.get(id);
  if (u) return { kind: 'unico', def: u };
  return undefined;
}

export const isEquipavel = (id: string): boolean => itemDefOf(id) !== undefined;

export const rarityOf = (id: string): Raridade | undefined => itemDefOf(id)?.def.rarity;

export const slotOf = (id: string): ItemSlotId | undefined => itemDefOf(id)?.def.slot as ItemSlotId | undefined;

/** Margem do item: null para os do Delta e os únicos (que não têm margem). */
export function margemDoItem(id: string): SideId | null {
  const d = itemDefOf(id);
  return d?.kind === 'base' ? d.def.margem : null;
}

// ---------------------------------------------------------------------------
// Atributos

export interface StatPct {
  stat: string;
  pct: number;
}

/** Hash FNV-1a de 32 bits (semente estável por id de item). */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 com a semente dada (mesmo algoritmo de sim/rng.ts, sem importar a simulação). */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Extras do raro: 1 ou 2 atributos do poolExtras do slot (raridades.raro.atributosExtras, com
 * chanceSegundoExtra), sem repetir atributo.
 * SUGESTÃO: os extras são fixos por item (sorteados pela semente do id, sem estado por cópia), e o
 * valor é o meio da faixa min..max, arredondado.
 */
export function rareExtrasOf(item: Item): StatPct[] {
  if (item.rarity !== 'raro') return [];
  const D = getData();
  const slot = D.items.slots.find((s) => s.id === item.slot);
  const rar = D.items.raridades.find((r) => r.id === 'raro')!;
  const lim = item.atributosExtras ?? rar.atributosExtras;
  if (!slot || lim.max <= 0) return [];
  const rnd = seeded(hash32(item.id));
  let n = Math.max(1, lim.min);
  while (n < lim.max && rnd() < (rar.chanceSegundoExtra ?? 0.5)) n++;
  const pool = [...slot.poolExtras];
  const out: StatPct[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const k = Math.floor(rnd() * pool.length);
    const r = pool.splice(k, 1)[0]!;
    out.push({ stat: r.stat, pct: Math.round((r.min + r.max) / 2) });
  }
  return out;
}

/** Atributos do item sem melhoria: base (+ extras do raro). */
export function baseStatsOf(id: string): StatPct[] {
  const d = itemDefOf(id);
  if (!d) return [];
  const base = d.def.stats.map((s) => ({ stat: s.stat, pct: s.pct }));
  return d.kind === 'base' ? [...base, ...rareExtrasOf(d.def)] : base;
}

// ---------------------------------------------------------------------------
// Benzimento e calibração (o nível guardado no registro)

export type Processo = 'benzimento' | 'calibracao';

/** Chave do nível de melhoria do item em rec.counters. SUGESTÃO: o nível vale para o tipo de item do jogador (sem estado por cópia). */
export const NIVEL_KEY = (id: string) => `item_nivel:${id}`;

export const itemNivel = (rec: PlayerRecord, id: string): number => rec.counters[NIVEL_KEY(id)] ?? 0;

/**
 * Qual processo melhora o item para quem é deste lado: Esquerda = benzimento, Direita = calibração.
 * Item do Delta e único (sem margem) seguem o lado de quem usa (aceitaItensDoDelta).
 * SUGESTÃO: o único conta como item sem margem.
 */
export function processoDoItem(id: string, side: SideId | null): Processo | null {
  const D = getData();
  const m = margemDoItem(id);
  if (m === 'esquerda') return 'benzimento';
  if (m === 'direita') return 'calibracao';
  if (!itemDefOf(id)) return null;
  if (side === 'esquerda' && D.items.benzimento.aceitaItensDoDelta) return 'benzimento';
  if (side === 'direita' && D.items.calibracao.aceitaItensDoDelta) return 'calibracao';
  return null;
}

export const growthDef = (p: Processo) => (p === 'benzimento' ? getData().items.benzimento : getData().items.calibracao);

/** Nível máximo de melhoria do item (nivelMaxPorRaridade). */
export function nivelMaxDoItem(id: string): number {
  const r = rarityOf(id);
  if (!r) return 0;
  return getData().items.benzimento.nivelMaxPorRaridade[r] ?? 0;
}

/** Bônus da melhoria em % (bonusStatsPct do nível). */
export function bonusMelhoriaPct(rec: PlayerRecord, id: string): number {
  const n = itemNivel(rec, id);
  if (n <= 0) return 0;
  const p = processoDoItem(id, rec.side);
  if (!p) return 0;
  return growthDef(p).niveis[n - 1]?.bonusStatsPct ?? 0;
}

/**
 * Atributos finais do item no corpo deste jogador: base (+ extras) × (1 + bônus da melhoria) e,
 * se for da outra margem, × outraMargem.multiplicadorStats. Uma casa decimal.
 */
export function itemStatsOf(rec: PlayerRecord, id: string): StatPct[] {
  const D = getData();
  let mult = 1 + bonusMelhoriaPct(rec, id) / 100;
  const m = margemDoItem(id);
  if (m && rec.side && m !== rec.side) mult *= D.items.regras.outraMargem.multiplicadorStats;
  return baseStatsOf(id).map((s) => ({ stat: s.stat, pct: Math.round(s.pct * mult * 10) / 10 }));
}

// ---------------------------------------------------------------------------
// Visual por ala

type AlaVisual = ReturnType<typeof getData>['items']['visualPorArquetipo'][keyof ReturnType<typeof getData>['items']['visualPorArquetipo']];
const alaVisual = (arch: string): AlaVisual | undefined => (getData().items.visualPorArquetipo as Record<string, AlaVisual | undefined>)[arch];

/** Sufixo de arte da raridade (raridades[].sufixoArte). */
export const sufixoArte = (r: Raridade): string => getData().items.raridades.find((x) => x.id === r)?.sufixoArte ?? r;

/**
 * Chave de arte do item no corpo deste jogador (regras.resolucaoVisual e visualSemAla):
 * - único: visualProprio.chaveArte;
 * - com ala: override do item para a ala, ou visualPorArquetipo[ala].slots[slot].chaveArte + '_' + sufixo
 *   (item sem classe adota o estilo da ala);
 * - 8 a 11 (instituição sem ala): '<instituicao>_<slot>_<sufixo>';
 * - Delta: 'delta_<slot>_<sufixo>'.
 */
export function itemArtKey(rec: PlayerRecord, id: string): string | undefined {
  const d = itemDefOf(id);
  if (!d) return undefined;
  if (d.kind === 'unico') return d.def.visualProprio.chaveArte;
  const it = d.def;
  const suf = sufixoArte(it.rarity);
  const arch = rec.archetype;
  if (arch) {
    const ov = (it.visualPorArquetipo as Record<string, string | undefined> | undefined)?.[arch];
    if (ov) return ov;
    const sv = alaVisual(arch)?.slots[it.slot];
    if (sv) return `${sv.chaveArte}_${suf}`;
  }
  if (rec.institution) return `${rec.institution}_${it.slot}_${suf}`;
  return `delta_${it.slot}_${suf}`;
}

/** Texto do visual do slot na ala (comum ou raro), para a tela; o único usa a descrição própria. */
export function itemVisualText(rec: PlayerRecord, id: string): string | undefined {
  const d = itemDefOf(id);
  if (!d) return undefined;
  if (d.kind === 'unico') return d.def.visualProprio.descricao;
  const sv = rec.archetype ? alaVisual(rec.archetype)?.slots[d.def.slot] : undefined;
  return sv ? sv[d.def.rarity] : d.def.name;
}

/** Camada do item no CharacterLook: slot, raridade e a arte dentro do estilo da ala. */
export function lookItemOf(rec: PlayerRecord, slot: string, id: string): NonNullable<CharacterLook['items']>[number] | undefined {
  const r = rarityOf(id);
  if (!r) return undefined;
  const art = itemArtKey(rec, id);
  return { slot, rarity: r, ...(art ? { art } : {}) };
}
