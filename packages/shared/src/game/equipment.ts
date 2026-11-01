/**
 * Fase 5: equipamento do jogador (rec.equipment, slot -> id), benzimento, calibração e filtro de
 * raridade da coleta. Regra pura, compartilhada pelo servidor e pelo servidor local:
 *
 *   equipar(rec, itemId)          // classe travada, nível mínimo, um de cada slot
 *   desequipar(rec, slot)
 *   benzer(rec, itemId, now)      // Esquerda: reputação e lições, sem moeda, com fila
 *   calibrar(rec, itemId)         // Direita: paga em Crédito, na hora
 *   setFiltroRaridade(rec, 'raro')
 *   spawnPlayer(w, { ..., ...simSpawnExtrasOf(rec) })  // leva simEquipOf(rec) para o combate
 *
 * O nível de melhoria, a fila da benzedeira e o filtro ficam em rec.counters (persistem sem campo
 * novo no registro). Nada aqui usa Math.random nem Date: `now` vem por parâmetro.
 */
import { getData } from '../data';
import type { EquipStats } from '../sim/stats';
import { pagar } from './economy';
import {
  baseStatsOf,
  growthDef,
  itemArtKey,
  itemDefOf,
  itemNivel,
  itemStatsOf,
  itemVisualText,
  ITEM_SLOTS,
  NIVEL_KEY,
  nivelMaxDoItem,
  processoDoItem,
  rarityOf,
  RARIDADES,
  slotOf,
  type ItemSlotId,
  type Processo,
  type Raridade,
  type StatPct,
} from './items';
import { reputationOf } from './ranks';
import type { Check, PlayerRecord } from './types';

// ---------------------------------------------------------------------------
// Equipar e desequipar

const possui = (rec: PlayerRecord, id: string) => rec.inventory.includes(id) || Object.values(rec.equipment).includes(id);

/** Pode vestir o item: existe, está no inventário, é da classe (ou sem classe) e o nível alcança. */
export function canEquip(rec: PlayerRecord, id: string): Check {
  const d = itemDefOf(id);
  if (!d) return { ok: false, erro: 'Isso não se veste.' };
  if (!rec.inventory.includes(id)) return { ok: false, erro: 'Você não tem esse item na mochila.' };
  const lock = d.def.classLock;
  if (lock && lock !== rec.class) {
    const nome = getData().classesById.get(lock)?.name ?? lock;
    return { ok: false, erro: `${d.def.name} é de ${nome}. Itens de outra classe não podem ser usados.` };
  }
  if (rec.level < d.def.nivelMin) return { ok: false, erro: `${d.def.name} pede nível ${d.def.nivelMin}.` };
  return { ok: true };
}

/** Veste o item no slot dele; o que estava lá volta para a mochila. */
export function equipar(rec: PlayerRecord, id: string): Check & { slot?: ItemSlotId; saiu?: string } {
  const c = canEquip(rec, id);
  if (!c.ok) return c;
  const slot = slotOf(id)!;
  rec.inventory.splice(rec.inventory.indexOf(id), 1);
  const saiu = rec.equipment[slot];
  if (saiu) rec.inventory.push(saiu);
  rec.equipment[slot] = id;
  return { ok: true, slot, ...(saiu ? { saiu } : {}) };
}

/** Tira o item do slot e guarda na mochila. */
export function desequipar(rec: PlayerRecord, slot: string): Check & { item?: string } {
  const id = rec.equipment[slot];
  if (!id) return { ok: false, erro: 'Não tem nada nesse slot.' };
  delete rec.equipment[slot];
  rec.inventory.push(id);
  return { ok: true, item: id };
}

/** Itens vestidos que valem agora (classe e nível conferidos de novo: troca de classe não quebra nada). */
function equipadosValidos(rec: PlayerRecord): [string, string][] {
  return Object.entries(rec.equipment).filter(([, id]) => {
    const d = itemDefOf(id);
    return !!d && (!d.def.classLock || d.def.classLock === rec.class) && rec.level >= d.def.nivelMin;
  });
}

/** Soma dos atributos do equipamento, em pontos percentuais por StatKey (com melhoria e outra margem). */
export function equipmentStats(rec: PlayerRecord): Record<string, number> {
  const D = getData();
  const out: Record<string, number> = {};
  const add = (s: StatPct) => {
    out[s.stat] = Math.round(((out[s.stat] ?? 0) + s.pct) * 10) / 10;
  };
  for (const [, id] of equipadosValidos(rec)) {
    for (const s of itemStatsOf(rec, id)) add(s);
    // números fixos (sem condição) de único e adorno entram aqui; o resto é passivo na simulação
    const ps = D.uniquesById.get(id)?.passivos ?? (D.itemsById.get(id)?.efeito ? [D.itemsById.get(id)!.efeito!] : []);
    for (const p of ps) if (p.kind === 'numero' && !p.condicao) for (const s of p.stats ?? []) add({ stat: s.stat, pct: s.pct });
  }
  return out;
}

/** Itens vestidos com passivo (únicos e adornos com efeito). */
export function equipmentPassiveItems(rec: PlayerRecord): string[] {
  const D = getData();
  return equipadosValidos(rec)
    .map(([, id]) => id)
    .filter((id) => (D.uniquesById.get(id)?.passivos.length ?? 0) > 0 || !!D.itemsById.get(id)?.efeito);
}

/** O que o equipamento leva para a simulação (spawnPlayer opts.equipment); undefined sem nada vestido. */
export function simEquipOf(rec: PlayerRecord): EquipStats | undefined {
  const pct = equipmentStats(rec);
  const items = equipmentPassiveItems(rec);
  if (Object.keys(pct).length === 0 && items.length === 0) return undefined;
  return { pct, items };
}

// ---------------------------------------------------------------------------
// Benzimento e calibração

/** Chave da fila da benzedeira em rec.counters: valor = instante (ms) em que fica pronto. */
export const FILA_KEY = (id: string) => `benzimento_fila:${id}`;

/**
 * Lições aprendidas nos Lugares que ensinam: degraus de lição (lessons.json, tipo 'licao') já
 * alcançados pelas visitas (counters 'visitas:<lugar>').
 * SUGESTÃO: cada degrau alcançado conta uma lição.
 */
export function licoesAprendidas(rec: PlayerRecord): number {
  let n = 0;
  for (const l of getData().lessons.licoes) {
    if (l.tipo !== 'licao') continue;
    const v = rec.counters[`visitas:${l.lugar}`] ?? 0;
    for (const d of l.degraus ?? []) if (v >= d.visitas) n++;
  }
  return n;
}

export interface MelhoriaInfo {
  processo: Processo | null;
  nivel: number;
  max: number;
  bonusPct: number;
  proximo?: { nivel: number; bonusStatsPct: number; custoCredito?: number; reputacaoMin?: number; licoesMin?: number; filaS?: number };
  /** benzimento na fila: instante (ms) em que fica pronto */
  prontoEm?: number;
}

export function melhoriaInfo(rec: PlayerRecord, id: string): MelhoriaInfo {
  const processo = processoDoItem(id, rec.side);
  const nivel = itemNivel(rec, id);
  const max = nivelMaxDoItem(id);
  const g = processo ? growthDef(processo) : undefined;
  const bonusPct = nivel > 0 ? (g?.niveis[nivel - 1]?.bonusStatsPct ?? 0) : 0;
  const prox = g && nivel < max ? g.niveis[nivel] : undefined;
  const fila = rec.counters[FILA_KEY(id)];
  return {
    processo,
    nivel,
    max,
    bonusPct,
    ...(prox
      ? {
          proximo: {
            nivel: prox.nivel,
            bonusStatsPct: prox.bonusStatsPct,
            ...(prox.custoCredito !== undefined ? { custoCredito: prox.custoCredito } : {}),
            ...(prox.reputacaoMin !== undefined ? { reputacaoMin: prox.reputacaoMin } : {}),
            ...(prox.licoesMin !== undefined ? { licoesMin: prox.licoesMin } : {}),
            ...(prox.filaS !== undefined ? { filaS: prox.filaS } : {}),
          },
        }
      : {}),
    ...(fila !== undefined ? { prontoEm: fila } : {}),
  };
}

/** Confere o que vale para os dois processos: margem certa, item seu, lugar certo e teto do nível. */
function checkMelhoria(rec: PlayerRecord, id: string, p: Processo, onde?: string): Check {
  const g = growthDef(p);
  const d = itemDefOf(id);
  if (!d) return { ok: false, erro: 'Isso não se melhora.' };
  if (!possui(rec, id)) return { ok: false, erro: 'Você não tem esse item.' };
  if (rec.side !== g.margem) {
    return { ok: false, erro: p === 'benzimento' ? 'A benzedeira só atende quem é da Margem Esquerda.' : 'Calibração só para clientes do Consórcio.' };
  }
  if (processoDoItem(id, rec.side) !== p) {
    return { ok: false, erro: p === 'benzimento' ? 'Só itens da Esquerda (ou do Delta) passam pela benzedeira.' : 'Só itens da Direita (ou do Delta) entram na calibração.' };
  }
  if (onde !== undefined && !g.onde.includes(onde)) return { ok: false, erro: `${g.name} não se faz aqui.` };
  if (itemNivel(rec, id) >= nivelMaxDoItem(id)) return { ok: false, erro: `${d.def.name} já está no nível máximo.` };
  return { ok: true };
}

/** Conclui os benzimentos da fila que já ficaram prontos; devolve os ids que subiram de nível. */
export function concluirBenzimentos(rec: PlayerRecord, now: number): string[] {
  const out: string[] = [];
  for (const [k, t] of Object.entries(rec.counters)) {
    if (!k.startsWith('benzimento_fila:') || t > now) continue;
    const id = k.slice('benzimento_fila:'.length);
    delete rec.counters[k];
    const max = nivelMaxDoItem(id);
    const n = itemNivel(rec, id);
    if (n < max) rec.counters[NIVEL_KEY(id)] = n + 1;
    out.push(id);
  }
  return out;
}

/**
 * Benzimento (Esquerda): a benzedeira olha a reputação e as lições (não gasta nenhuma das duas) e
 * não cobra moeda (items.json benzimento.descricao). O item entra na fila por filaS e continua
 * usável; o nível sobe quando concluirBenzimentos(rec, now) passa do prontoEm.
 * SUGESTÃO: uma peça por vez na fila; `onde`, quando vem, tem de ser um dos lugares de benzimento.onde.
 */
export function benzer(rec: PlayerRecord, id: string, now: number, onde?: string): Check & { prontoEm?: number; nivel?: number } {
  concluirBenzimentos(rec, now);
  const c = checkMelhoria(rec, id, 'benzimento', onde);
  if (!c.ok) return c;
  const naFila = Object.entries(rec.counters).find(([k]) => k.startsWith('benzimento_fila:'));
  if (naFila) {
    const nome = itemDefOf(naFila[0].slice('benzimento_fila:'.length))?.def.name ?? 'outra peça';
    return { ok: false, erro: `A benzedeira ainda está com ${nome}. Volte em ${Math.ceil((naFila[1] - now) / 1000)} s.` };
  }
  const g = growthDef('benzimento');
  const nivel = itemNivel(rec, id) + 1;
  const lv = g.niveis[nivel - 1]!;
  const rep = reputationOf(rec);
  if (rep < (lv.reputacaoMin ?? 0)) return { ok: false, erro: `A benzedeira pede reputação ${lv.reputacaoMin} (você tem ${rep}).` };
  const lic = licoesAprendidas(rec);
  if (lic < (lv.licoesMin ?? 0)) return { ok: false, erro: `A benzedeira pede ${lv.licoesMin} lições aprendidas (você tem ${lic}).` };
  const prontoEm = now + (lv.filaS ?? 0) * 1000;
  rec.counters[FILA_KEY(id)] = prontoEm;
  if ((lv.filaS ?? 0) <= 0) concluirBenzimentos(rec, now);
  return { ok: true, prontoEm, nivel };
}

/** Calibração (Direita): paga custoCredito em Crédito e sobe um nível na hora. */
export function calibrar(rec: PlayerRecord, id: string, onde?: string): Check & { nivel?: number; pago?: number } {
  const c = checkMelhoria(rec, id, 'calibracao', onde);
  if (!c.ok) return c;
  const nivel = itemNivel(rec, id) + 1;
  const custo = growthDef('calibracao').niveis[nivel - 1]!.custoCredito ?? 0;
  const p = pagar(rec, 'credito', custo);
  if (!p.ok) return p;
  rec.counters[NIVEL_KEY(id)] = nivel;
  return { ok: true, nivel, pago: custo };
}

// ---------------------------------------------------------------------------
// Filtro de raridade da coleta (loot.json coleta.filtros) e venda automática

const FILTRO_KEY = 'filtro_raridade';
const VENDA_KEY = 'venda_automatica';

export function filtroRaridadeOf(rec: PlayerRecord): Raridade {
  const i = rec.counters[FILTRO_KEY];
  const r = i !== undefined ? RARIDADES[i] : undefined;
  return r ?? (getData().loot.coleta.filtroPadrao as Raridade);
}

export function vendaAutomaticaOf(rec: PlayerRecord): boolean {
  const v = rec.counters[VENDA_KEY];
  return v === undefined ? getData().loot.vendaAutomatica.padraoLigada : v === 1;
}

/** Guarda o filtro (e a venda automática) no registro; a sala aplica na entidade (lootFilter/autoSell). */
export function setFiltroRaridade(rec: PlayerRecord, raridade: string, vendaAutomatica?: boolean): Check {
  const filtros = getData().loot.coleta.filtros as readonly string[];
  if (!filtros.includes(raridade)) return { ok: false, erro: 'Filtro de raridade desconhecido.' };
  rec.counters[FILTRO_KEY] = RARIDADES.indexOf(raridade as Raridade);
  if (vendaAutomatica !== undefined) rec.counters[VENDA_KEY] = vendaAutomatica ? 1 : 0;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tela de itens (S2C itens_info)

export interface ItemView {
  id: string;
  name: string;
  slot: ItemSlotId;
  rarity: Raridade;
  classLock: string | null;
  /** atributos finais no corpo deste jogador */
  stats: StatPct[];
  /** atributos sem melhoria */
  base: StatPct[];
  arte?: string;
  visual?: string;
  efeito?: string;
  melhoria: MelhoriaInfo;
  /** pode vestir agora (só na mochila) */
  podeVestir?: boolean;
  motivo?: string;
}

function viewOf(rec: PlayerRecord, id: string, naMochila: boolean): ItemView | null {
  const d = itemDefOf(id);
  if (!d) return null;
  const arte = itemArtKey(rec, id);
  const visual = itemVisualText(rec, id);
  const efeito = d.kind === 'unico' ? d.def.efeito : d.def.efeitoTexto;
  const v: ItemView = {
    id,
    name: d.def.name,
    slot: d.def.slot as ItemSlotId,
    rarity: rarityOf(id)!,
    classLock: d.def.classLock,
    stats: itemStatsOf(rec, id),
    base: baseStatsOf(id),
    ...(arte ? { arte } : {}),
    ...(visual ? { visual } : {}),
    ...(efeito ? { efeito } : {}),
    melhoria: melhoriaInfo(rec, id),
  };
  if (naMochila) {
    const c = canEquip(rec, id);
    v.podeVestir = c.ok;
    if (!c.ok) v.motivo = c.erro;
  }
  return v;
}

export interface ItensView {
  equipados: Partial<Record<ItemSlotId, ItemView>>;
  mochila: ItemView[];
  total: Record<string, number>;
  filtro: Raridade;
  vendaAutomatica: boolean;
}

/**
 * v0.3, conjunto da classe: quais dos 5 slots estão com peça da classe e da margem do jogador. Com as
 * 5, o boneco vira a versão inicial da ala (parecido com o líder, como o Peão Brabo). Sugestão.
 */
export function conjuntoDaClasse(rec: PlayerRecord): { pecas: ItemSlotId[]; completo: boolean } {
  const pecas = ITEM_SLOTS.filter((s) => {
    const d = rec.equipment[s] ? itemDefOf(rec.equipment[s]!) : undefined;
    return !!d && !!rec.class && d.def.classLock === rec.class && (('margem' in d.def ? d.def.margem : null) ?? rec.side) === rec.side;
  });
  return { pecas, completo: pecas.length === ITEM_SLOTS.length };
}

export function itensView(rec: PlayerRecord): ItensView {
  const equipados: Partial<Record<ItemSlotId, ItemView>> = {};
  for (const [slot, id] of Object.entries(rec.equipment)) {
    const v = viewOf(rec, id, false);
    if (v) equipados[slot as ItemSlotId] = v;
  }
  const mochila: ItemView[] = [];
  for (const id of new Set(rec.inventory)) {
    const v = viewOf(rec, id, true);
    if (v) mochila.push(v);
  }
  return { equipados, mochila, total: equipmentStats(rec), filtro: filtroRaridadeOf(rec), vendaAutomatica: vendaAutomaticaOf(rec) };
}
