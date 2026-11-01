/**
 * Fase 4: carteira. Semente (Esquerda) e Crédito (Direita) ficam no registro (rec.semente,
 * rec.credito); o score do Crédito em rec.score; dívida e limites do ciclo em rec.economia.
 *
 * Decisões:
 * - Saldo nunca fica abaixo de zero: o que não dá para pagar vira dívida (rec.economia.divida),
 *   que é o "ficar no negativo" do score.
 * - Só quem é da Direita tem score (economy.json moedas[].temScore). Para quem não é, as contas que
 *   dependem do score usam o score inicial. // SUGESTÃO
 * - Ganho em moeda da outra margem (missão, saque) entra na moeda da margem do jogador pela cotação
 *   base do câmbio (2 Créditos por Semente), arredondado e com no mínimo 1. No Delta (sem margem),
 *   entra como veio. // SUGESTÃO
 * - Preço de referência de qualquer coisa vendável: precoBase do item, consumível ou único, a
 *   tabela da feira para recursos e materiais, o preço do móvel. Em Crédito, vale base × cotação
 *   base quando só há preço em Semente.
 */
import { getData } from '../data';
import type { Resource } from '../schema/world';
import type { Check, EconomiaState, Moeda, PlayerRecord } from './types';

export const MOEDAS: readonly Moeda[] = ['semente', 'credito'];

export const nomeMoeda = (m: Moeda, plural = true): string => (m === 'semente' ? (plural ? 'Sementes' : 'Semente') : plural ? 'Créditos' : 'Crédito');

/** Prefixo dos móveis guardados no inventário ('movel:<id do catálogo>'). */
export const MOVEL_PREFIX = 'movel:';
export const movelInvId = (id: string): string => `${MOVEL_PREFIX}${id}`;

export const novaEconomia = (ciclo = 0): EconomiaState => ({ ciclo, divida: 0, scoreCiclo: {}, cambioCiclo: 0, moradiaDada: false });

/** Estado da carteira do registro (cria e completa o que faltar). */
export function economiaOf(rec: PlayerRecord): EconomiaState {
  const e = (rec.economia ??= novaEconomia());
  e.ciclo ??= 0;
  e.divida ??= 0;
  e.scoreCiclo ??= {};
  e.cambioCiclo ??= 0;
  e.moradiaDada ??= false;
  return e;
}

export const moedaDaMargem = (rec: PlayerRecord): Moeda | null => (rec.side === 'direita' ? 'credito' : rec.side === 'esquerda' ? 'semente' : null);

export const saldo = (rec: PlayerRecord, m: Moeda): number => (m === 'semente' ? rec.semente : rec.credito);

function somar(rec: PlayerRecord, m: Moeda, q: number): void {
  if (m === 'semente') rec.semente = Math.max(0, rec.semente + q);
  else rec.credito = Math.max(0, rec.credito + q);
}

/** Tira `valor` (arredondado para cima) da moeda; falha sem mexer se não tiver saldo. */
export function pagar(rec: PlayerRecord, m: Moeda, valor: number): Check {
  const v = Math.ceil(valor);
  if (!Number.isFinite(v) || v < 0) return { ok: false, erro: 'Valor inválido.' };
  const s = saldo(rec, m);
  if (s < v) return { ok: false, erro: `Faltam ${v - s} ${nomeMoeda(m, v - s !== 1)}.` };
  somar(rec, m, -v);
  return { ok: true };
}

/** Põe `valor` (arredondado para baixo) na moeda. */
export function receber(rec: PlayerRecord, m: Moeda, valor: number): number {
  const v = Math.max(0, Math.floor(valor));
  somar(rec, m, v);
  return v;
}

/** Cotação base do câmbio: Créditos por 1 Semente. */
export const cotacaoBase = (): number => getData().economy.cambio.base;

/** Converte um valor nominal entre as moedas pela cotação base (mínimo 1 quando há valor). */
export function converterBase(q: number, de: Moeda, para: Moeda): number {
  if (de === para || q <= 0) return q;
  const v = de === 'credito' ? q / cotacaoBase() : q * cotacaoBase();
  return Math.max(1, Math.round(v));
}

/** Em que moeda e quanto entra um ganho para este registro (moeda da margem; Delta como veio). */
export function ganhoNaMoedaDaMargem(rec: PlayerRecord, moeda: Moeda, q: number): { moeda: Moeda; quantidade: number } {
  const alvo = moedaDaMargem(rec);
  if (!alvo || alvo === moeda) return { moeda, quantidade: q };
  return { moeda: alvo, quantidade: converterBase(q, moeda, alvo) };
}

/** Credita um ganho de missão ou de saque na moeda da margem. Devolve o que entrou. */
export function creditarGanho(rec: PlayerRecord, moeda: Moeda, q: number): { moeda: Moeda; quantidade: number } {
  const g = ganhoNaMoedaDaMargem(rec, moeda, q);
  receber(rec, g.moeda, g.quantidade);
  return g;
}

/** Saque em moedas ({ semente, credito } do evento 'currency' da simulação) na moeda da margem. */
export function saqueNaMoedaDaMargem(rec: PlayerRecord, c: { semente?: number; credito?: number }): { semente: number; credito: number } {
  const out = { semente: 0, credito: 0 };
  for (const m of MOEDAS) {
    const q = c[m] ?? 0;
    if (q <= 0) continue;
    const g = ganhoNaMoedaDaMargem(rec, m, q);
    out[g.moeda] += g.quantidade;
  }
  return out;
}

// ---------------------------------------------------------------------------
// score

/**
 * Eventos de score fora de economy.json. // SUGESTÃO: 'no_negativo' é o ciclo que termina com
 * dívida (o "fica no negativo" do briefing).
 */
export const SCORE_EVENTOS_EXTRA: readonly { id: string; name: string; delta: number; limitePorCiclo: number }[] = [
  { id: 'no_negativo', name: 'Ciclo terminado no negativo', delta: -20, limitePorCiclo: 0 }, // SUGESTÃO
];

export const temScore = (rec: PlayerRecord): boolean => rec.side === 'direita';

/** Score que vale nas contas (taxa do app, desconto): o do registro na Direita, o inicial fora dela. */
export const scoreEfetivo = (rec: PlayerRecord): number => (temScore(rec) ? rec.score : getData().economy.score.inicial);

export type FaixaScore = ReturnType<typeof getData>['economy']['score']['faixas'][number];

export function faixaDoScore(score: number): FaixaScore {
  const f = getData().economy.score.faixas;
  return f.find((x) => score >= x.min && score <= x.max) ?? (score < f[0]!.min ? f[0]! : f[f.length - 1]!);
}

export const faixaScore = (rec: PlayerRecord): FaixaScore => faixaDoScore(scoreEfetivo(rec));

/**
 * Aplica um evento de score (economy.json score.sobe/cai, ou SCORE_EVENTOS_EXTRA), com o limite
 * por ciclo e o teto de 0 a 1000. Devolve os pontos que de fato entraram (0 fora da Direita).
 */
export function scoreEvento(rec: PlayerRecord, id: string, vezes = 1): number {
  if (!temScore(rec)) return 0;
  const S = getData().economy.score;
  const ev = [...S.sobe, ...S.cai, ...SCORE_EVENTOS_EXTRA].find((x) => x.id === id);
  if (!ev) return 0;
  const e = economiaOf(rec);
  let delta = ev.delta * vezes;
  const lim = ev.limitePorCiclo ?? 0;
  const usado = e.scoreCiclo[id] ?? 0;
  if (lim > 0) delta = Math.sign(delta) * Math.min(Math.abs(delta), Math.max(0, lim - usado));
  const novo = Math.max(S.min, Math.min(S.max, rec.score + delta));
  const aplicado = novo - rec.score;
  rec.score = novo;
  if (aplicado !== 0) e.scoreCiclo[id] = usado + Math.abs(aplicado);
  return aplicado;
}

/** Quita a dívida com o Crédito que houver. Quitar tudo dá o evento quitar_divida. */
export function pagarDivida(rec: PlayerRecord): Check & { pago: number; resta: number } {
  const e = economiaOf(rec);
  if (e.divida <= 0) return { ok: false, erro: 'Você não deve nada. Por enquanto.', pago: 0, resta: 0 };
  const pago = Math.min(e.divida, rec.credito);
  if (pago <= 0) return { ok: false, erro: `Faltam ${e.divida} Créditos.`, pago: 0, resta: e.divida };
  rec.credito -= pago;
  e.divida -= pago;
  if (e.divida === 0) {
    scoreEvento(rec, 'quitar_divida');
    if (rec.home) rec.home.atraso = 0;
  }
  return { ok: true, pago, resta: e.divida };
}

/** Novo ciclo da cidade na carteira: zera os limites do ciclo. */
export function virarCicloCarteira(rec: PlayerRecord): void {
  const e = economiaOf(rec);
  e.scoreCiclo = {};
  e.cambioCiclo = 0;
}

// ---------------------------------------------------------------------------
// bens (o que se compra, vende e anuncia)

const RESOURCES: readonly string[] = ['energia', 'chopindita', 'comida', 'pecas'];
export const isResource = (id: string): id is Exclude<Resource, 'semente' | 'credito'> => RESOURCES.includes(id);

/** Um bem: item do inventário, recurso (com quantidade) ou móvel guardado. */
export type Bem = { tipo: 'item'; id: string } | { tipo: 'recurso'; id: Resource; quantidade: number } | { tipo: 'movel'; id: string };

export function temBem(rec: PlayerRecord, b: Bem): boolean {
  if (b.tipo === 'recurso') return b.quantidade > 0 && isResource(b.id) && (rec.resources[b.id] ?? 0) >= b.quantidade;
  const inv = b.tipo === 'movel' ? movelInvId(b.id) : b.id;
  return rec.inventory.includes(inv);
}

/** Tira o bem do registro (falha sem mexer se não tiver). */
export function tirarBem(rec: PlayerRecord, b: Bem): Check {
  if (!temBem(rec, b)) return { ok: false, erro: 'Você não tem isso.' };
  if (b.tipo === 'recurso') rec.resources[b.id] = (rec.resources[b.id] ?? 0) - b.quantidade;
  else {
    const inv = b.tipo === 'movel' ? movelInvId(b.id) : b.id;
    rec.inventory.splice(rec.inventory.lastIndexOf(inv), 1);
  }
  return { ok: true };
}

export function darBem(rec: PlayerRecord, b: Bem): void {
  if (b.tipo === 'recurso') rec.resources[b.id] = (rec.resources[b.id] ?? 0) + b.quantidade;
  else rec.inventory.push(b.tipo === 'movel' ? movelInvId(b.id) : b.id);
}

/** Bem a partir de um id do inventário (ou de um recurso). */
export function bemDe(id: string, quantidade = 1): Bem | null {
  if (id.startsWith(MOVEL_PREFIX)) return getData().furnitureById.has(id.slice(MOVEL_PREFIX.length)) ? { tipo: 'movel', id: id.slice(MOVEL_PREFIX.length) } : null;
  if (isResource(id)) return { tipo: 'recurso', id, quantidade: Math.max(1, Math.floor(quantidade)) };
  return precoReferencia({ tipo: 'item', id }, 'semente') !== null ? { tipo: 'item', id } : null;
}

export function nomeDoBem(b: Bem): string {
  const D = getData();
  if (b.tipo === 'movel') return D.furnitureById.get(b.id)?.name ?? b.id;
  if (b.tipo === 'recurso') return `${b.quantidade}× ${D.economy.recursos.find((r) => r.id === b.id)?.name ?? b.id}`;
  return D.itemsById.get(b.id)?.name ?? D.consumablesById.get(b.id)?.name ?? D.uniquesById.get(b.id)?.name ?? D.economy.feira.precosTabelados.find((t) => t.id === b.id)?.name ?? b.id;
}

/** Preço de referência de um bem numa moeda (por unidade × quantidade). null = sem valor conhecido. */
export function precoReferencia(b: Bem, m: Moeda): number | null {
  const D = getData();
  const q = b.tipo === 'recurso' ? b.quantidade : 1;
  const tab = D.economy.feira.precosTabelados.find((t) => t.id === b.id);
  if (b.tipo !== 'movel' && tab) return (m === 'semente' ? tab.precoSemente : tab.precoBaseCredito) * q;
  if (b.tipo === 'movel') {
    const mv = D.furnitureById.get(b.id);
    if (!mv) return null;
    const p = mv.preco.find((x) => x.moeda === m);
    if (p) return p.valor;
    return converterBase(mv.preco[0]!.valor, mv.preco[0]!.moeda, m);
  }
  if (b.tipo === 'recurso') return null;
  const base = D.itemsById.get(b.id)?.precoBase ?? D.consumablesById.get(b.id)?.precoBase ?? D.uniquesById.get(b.id)?.precoBase;
  if (base === undefined) return null;
  return m === 'semente' ? base : converterBase(base, 'semente', 'credito');
}

/** Resumo da carteira para a tela. */
export interface CarteiraView {
  semente: number;
  credito: number;
  score: number | null;
  faixa: { id: string; name: string; taxaAppPp: number; piada?: string } | null;
  divida: number;
  moedaDaMargem: Moeda | null;
  cambioUsadoCiclo: number;
  cambioLimiteCiclo: number;
}

export function carteiraView(rec: PlayerRecord): CarteiraView {
  const e = economiaOf(rec);
  const f = faixaScore(rec);
  return {
    semente: rec.semente,
    credito: rec.credito,
    score: temScore(rec) ? rec.score : null,
    faixa: temScore(rec) ? { id: f.id, name: f.name, taxaAppPp: f.taxaAppPp, ...(f.piada ? { piada: f.piada } : {}) } : null,
    divida: e.divida,
    moedaDaMargem: moedaDaMargem(rec),
    cambioUsadoCiclo: e.cambioCiclo,
    cambioLimiteCiclo: getData().economy.cambio.limitePorCicloSemente,
  };
}
