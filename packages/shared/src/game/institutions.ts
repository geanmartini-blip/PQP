/**
 * Fase 3: as 8 instituições (institutions.json). Cada uma tem quem treina a base, as 3 alas com os
 * treinadores, a loja (shops.json), o quadro de missões, as patentes e a missão de entrada.
 *
 * Decisões:
 * - O quadro de missões é uma lista montada dos dados: a missão de entrada, as missões dadas pelos
 *   treinadores da instituição (ou por 'treinador_da_base') e a missão A Ala da margem.
 * - A loja mostra os itens de shops.json com o preço na moeda da margem; item com patenteMin acima
 *   da patente do jogador aparece trancado. A compra é da Fase 4 (economia).
 * - O objetivo 'pagar' (mensalidade da Universidade Neon) se paga por payObjective, que tira a
 *   moeda e manda o evento 'pay'.
 */
import { getData } from '../data';
import { currentObjectives, missionAvailable, onGameEvent } from './missions';
import { rankOrder, rankView, type RankView } from './ranks';
import { emptyResult, type Check, type GameResult, type PlayerRecord } from './types';

export interface ShopItemView {
  item: string;
  tipo: string;
  preco: Partial<Record<'semente' | 'credito', number>>;
  patenteMin?: string;
  liberado: boolean;
}

export interface ShopView {
  id: string;
  name: string;
  npc?: string;
  moedas: string[];
  regraPreco: string;
  taxaPct: number;
  itens: ShopItemView[];
}

export interface BoardEntry {
  id: string;
  name: string;
  resumo: string;
  nivel: number;
  dadaPor?: string;
  estado: 'disponivel' | 'ativa' | 'concluida' | 'bloqueada';
  motivo?: string;
}

export interface InstitutionInfo {
  id: string;
  name: string;
  margem: string;
  classe: string;
  classeName: string;
  predio: string;
  /** quem treina a base (recebe quem entra) */
  baseTrainer: { id: string; name: string };
  treinadores: { id: string; name: string; archetype: string; archetypeName: string; recebeBase: boolean }[];
  patentes: string[];
  missaoEntrada: { id: string; texto: string; estado: BoardEntry['estado'] };
  loja: ShopView | null;
  quadro: BoardEntry[];
  /** patente do jogador, se for desta instituição */
  minhaPatente: RankView | null;
}

/** Loja da instituição (ou qualquer loja de shops.json pelo id). */
export function shopView(rec: PlayerRecord, shopId: string): ShopView | null {
  const D = getData();
  const s = D.shopsById.get(shopId);
  if (!s) return null;
  const soc = rec.side ? D.societies.sociedades.find((x) => x.side === rec.side) : undefined;
  const ordem = rankOrder(rec);
  return {
    id: s.id,
    name: s.name,
    ...(s.npc ? { npc: s.npc } : {}),
    moedas: [...s.moedas],
    regraPreco: s.regraPreco,
    taxaPct: s.taxaPct,
    itens: s.itens.map((it) => {
      const min = (it as { patenteMin?: string }).patenteMin;
      const minOrdem = min ? (soc?.patentes.find((p) => p.id === min)?.ordem ?? 99) : 0;
      return {
        item: it.item,
        tipo: it.tipo,
        preco: { ...(it.preco as Partial<Record<'semente' | 'credito', number>>) },
        ...(min ? { patenteMin: min } : {}),
        liberado: minOrdem <= ordem,
      };
    }),
  };
}

function boardEntry(rec: PlayerRecord, id: string): BoardEntry | null {
  const m = getData().missionsById.get(id);
  if (!m || !m.emPiloto) return null;
  const av = missionAvailable(rec, id);
  const estado: BoardEntry['estado'] = rec.missions.ativas.includes(id) ? 'ativa' : rec.missions.concluidas.includes(id) ? 'concluida' : av.ok ? 'disponivel' : 'bloqueada';
  return {
    id,
    name: m.name,
    resumo: m.resumo,
    nivel: m.nivel,
    ...(m.dadaPor ? { dadaPor: m.dadaPor } : {}),
    estado,
    ...(estado === 'bloqueada' && !av.ok ? { motivo: av.erro } : {}),
  };
}

/** Quadro de missões da instituição. */
export function missionBoard(rec: PlayerRecord, institutionId: string): BoardEntry[] {
  const D = getData();
  const inst = D.institutionsById.get(institutionId);
  if (!inst) return [];
  const trainers = new Set(D.trainers.filter((t) => t.institution === inst.id).map((t) => t.id));
  const ids: string[] = [inst.missaoEntrada.id];
  for (const m of D.missions.missoes) {
    if (ids.includes(m.id) || !m.emPiloto) continue;
    const mine = m.instituicao === inst.id || (m.margem === inst.margem && m.dadaPor !== undefined && (trainers.has(m.dadaPor) || m.dadaPor === 'treinador_da_base'));
    if (mine) ids.push(m.id);
  }
  return ids.map((id) => boardEntry(rec, id)).filter((x): x is BoardEntry => x !== null);
}

/** Tudo da instituição para a tela do prédio. */
export function institutionInfo(rec: PlayerRecord, institutionId: string | null = rec.institution): InstitutionInfo | null {
  const D = getData();
  const inst = institutionId ? D.institutionsById.get(institutionId) : undefined;
  if (!inst) return null;
  const base = D.trainersById.get(inst.baseTrainer);
  const entrada = boardEntry(rec, inst.missaoEntrada.id);
  return {
    id: inst.id,
    name: inst.name,
    margem: inst.margem,
    classe: inst.classe,
    classeName: D.classesById.get(inst.classe)?.name ?? inst.classe,
    predio: inst.predio.descricao,
    baseTrainer: { id: inst.baseTrainer, name: base?.name ?? inst.baseTrainer },
    treinadores: inst.alas.map((a) => {
      const arch = D.archetypesById.get(a)!;
      const tr = D.trainersById.get(arch.treinador);
      return { id: arch.treinador, name: tr?.name ?? arch.treinador, archetype: a, archetypeName: arch.name, recebeBase: tr?.recebeBase === true };
    }),
    patentes: [...inst.patentes],
    missaoEntrada: { id: inst.missaoEntrada.id, texto: inst.missaoEntrada.texto, estado: entrada?.estado ?? 'bloqueada' },
    loja: shopView(rec, inst.loja),
    quadro: missionBoard(rec, inst.id),
    minhaPatente: rec.institution === inst.id ? rankView(rec) : null,
  };
}

/**
 * Paga o objetivo 'pagar' atual (de uma missão ativa, ou da pedida): tira a moeda e manda o
 * evento 'pay' para a missão andar.
 */
export function payObjective(rec: PlayerRecord, missionId?: string): Check & { resultado: GameResult } {
  const r = emptyResult();
  const cur = currentObjectives(rec).find((c) => c.objetivo.tipo === 'pagar' && (missionId === undefined || c.missao.id === missionId));
  if (!cur || cur.objetivo.tipo !== 'pagar') return { ok: false, erro: 'Nada para pagar agora.', resultado: r };
  const o = cur.objetivo;
  const saldo = o.moeda === 'semente' ? rec.semente : rec.credito;
  if (saldo < o.quantidade) return { ok: false, erro: `Faltam ${o.quantidade - saldo} ${o.moeda === 'semente' ? 'Sementes' : 'Créditos'}.`, resultado: r };
  if (o.moeda === 'semente') rec.semente -= o.quantidade;
  else rec.credito -= o.quantidade;
  r.recursos[o.moeda] = -o.quantidade;
  const ev = onGameEvent(rec, { t: 'pay', moeda: o.moeda, quantidade: o.quantidade });
  ev.recursos[o.moeda] = (ev.recursos[o.moeda] ?? 0) - o.quantidade;
  return { ok: true, resultado: ev };
}
