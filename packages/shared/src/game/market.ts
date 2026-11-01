/**
 * Fase 4: feira de troca (Esquerda) e app do Consórcio (Direita), em funções puras sobre um
 * MarketState serializável que o servidor guarda (JSON). `now` vem de fora (ms).
 *
 * Feira (economy.json feira):
 * - anúncio entre jogadores sem taxa, pago em Semente ou em troca de itens (até maxItensPorLado);
 * - item da tabela (precosTabelados) sai pelo preço da tabela; o resto tem preço livre até
 *   tetoLivreMult × o preço de referência;
 * - compra de item da tabela entra na fila: fica pronta depois de esperaPorPessoaS por pessoa à
 *   frente (até esperaMaxS) e se retira com retirarEntregas, mesmo depois de sair;
 * - limites por jogador: LIMITE_ANUNCIOS_FEIRA anúncios e LIMITE_FILA lugares na fila.
 *
 * App (economy.json app):
 * - anúncio com preço livre em Crédito; na venda, o Consórcio tira taxaConsorcioPct + os pontos da
 *   faixa de score do vendedor (taxaAppPp) e a taxaConveniencia;
 * - preço sugerido = referência em Crédito × preço dinâmico de NPC (procura e oferta em `npc`);
 * - venda dá o evento de score venda_no_app ao vendedor.
 *
 * Quem vende pode estar fora: o que ele recebe (moeda, itens de troca, item vencido, score) fica em
 * `pendencias` até receberPendencias. O bem anunciado sai do registro na hora (fica guardado no
 * anúncio) e volta se o anúncio for cancelado ou vencer.
 */
import { getData } from '../data';
import {
  darBem,
  faixaScore,
  nomeDoBem,
  pagar,
  precoReferencia,
  receber,
  scoreEvento,
  temBem,
  tirarBem,
  type Bem,
} from './economy';
import { multDinamico, type NpcDemanda, type PrecoCtx } from './shop';
import type { Check, Moeda, PlayerRecord } from './types';

export type MercadoId = 'feira' | 'app';

/** SUGESTÃO: anúncios ativos por jogador na feira e no app, e compras na fila da feira. */
export const LIMITE_ANUNCIOS_FEIRA = 6;
export const LIMITE_ANUNCIOS_APP = 10;
export const LIMITE_FILA = 5;

export interface Anuncio {
  id: string;
  mercado: MercadoId;
  vendedor: string;
  vendedorNome: string;
  bem: Bem;
  /** preço (Semente na feira, Crédito no app); null = troca */
  preco: number | null;
  moeda: Moeda;
  /** o que o vendedor pede em troca (só na feira) */
  trocaPor: Bem[] | null;
  /** app: taxa em % fixada quando o anúncio foi feito (faixa de score do vendedor) */
  taxaPct: number;
  /** item da tabela da feira (entra na fila) */
  tabelado: boolean;
  criadoEm: number;
  expiraEm: number;
}

export interface Pendencia {
  semente: number;
  credito: number;
  bens: Bem[];
  /** eventos de score a aplicar ao receber */
  score: string[];
  avisos: string[];
}

export interface Entrega {
  id: string;
  jogador: string;
  bem: Bem;
  prontoEm: number;
}

export interface MarketState {
  versao: 1;
  seq: number;
  anuncios: Anuncio[];
  /** fila da feira (compras de item da tabela) */
  entregas: Entrega[];
  pendencias: Record<string, Pendencia>;
  /** procura e oferta das lojas de NPC e do app (preço dinâmico), zeradas a cada ciclo da cidade */
  npc: NpcDemanda;
}

export const novoMercado = (): MarketState => ({ versao: 1, seq: 1, anuncios: [], entregas: [], pendencias: {}, npc: {} });

/** Lê um MarketState salvo (tolerante). */
export function migrarMercado(raw: unknown): MarketState {
  const m = novoMercado();
  if (typeof raw !== 'object' || raw === null) return m;
  const r = raw as Partial<MarketState>;
  return {
    versao: 1,
    seq: typeof r.seq === 'number' ? r.seq : 1,
    anuncios: Array.isArray(r.anuncios) ? r.anuncios : [],
    entregas: Array.isArray(r.entregas) ? r.entregas : [],
    pendencias: typeof r.pendencias === 'object' && r.pendencias !== null ? r.pendencias : {},
    npc: typeof r.npc === 'object' && r.npc !== null ? r.npc : {},
  };
}

const PRODUCAO_MS = (): number => getData().factionAi.regras.decisao.cicloProducaoMin * 60_000;

function novoId(m: MarketState, p: string): string {
  return `${p}${m.seq++}`;
}

function pendencia(m: MarketState, jogador: string): Pendencia {
  return (m.pendencias[jogador] ??= { semente: 0, credito: 0, bens: [], score: [], avisos: [] });
}

const ativos = (m: MarketState, mercado: MercadoId, now: number) => m.anuncios.filter((a) => a.mercado === mercado && a.expiraEm > now);

function bemValido(b: Bem): Check {
  const D = getData();
  if (b.tipo === 'recurso') {
    if (!Number.isInteger(b.quantidade) || b.quantidade <= 0) return { ok: false, erro: 'Quantidade inválida.' };
    return { ok: true };
  }
  if (b.tipo === 'movel') return D.furnitureById.has(b.id) ? { ok: true } : { ok: false, erro: 'Móvel desconhecido.' };
  return precoReferencia(b, 'semente') !== null ? { ok: true } : { ok: false, erro: 'Item desconhecido.' };
}

/** Item da tabela da feira? */
export const tabeladoFeira = (b: Bem): boolean => b.tipo !== 'movel' && getData().economy.feira.precosTabelados.some((t) => t.id === b.id);

/** Teto de preço livre na feira (Semente). */
export function tetoFeira(b: Bem): number {
  const ref = precoReferencia(b, 'semente') ?? 1;
  return Math.max(1, Math.floor(ref * getData().economy.feira.vendas.tetoLivreMult));
}

// ---------------------------------------------------------------------------
// feira

export interface AnunciarFeiraReq {
  bem: Bem;
  /** preço em Semente (ignorado para item da tabela, que usa a tabela) */
  preco?: number;
  /** troca direta: o que pede em troca */
  trocaPor?: Bem[];
}

export function anunciarFeira(m: MarketState, rec: PlayerRecord, req: AnunciarFeiraReq, now: number): Check & { anuncio?: Anuncio } {
  const F = getData().economy.feira;
  if (rec.side !== 'esquerda') return { ok: false, erro: 'A feira é das Raízes. Do outro lado tem o app.' };
  const v = bemValido(req.bem);
  if (!v.ok) return v;
  const troca = req.trocaPor && req.trocaPor.length > 0 ? req.trocaPor : null;
  if (troca) {
    if (troca.length > F.trocaDireta.maxItensPorLado) return { ok: false, erro: `Na troca vão até ${F.trocaDireta.maxItensPorLado} coisas por lado.` };
    for (const t of troca) {
      const tv = bemValido(t);
      if (!tv.ok) return tv;
    }
  }
  if (ativos(m, 'feira', now).filter((a) => a.vendedor === rec.id).length >= LIMITE_ANUNCIOS_FEIRA) {
    return { ok: false, erro: `Limite de ${LIMITE_ANUNCIOS_FEIRA} anúncios na feira. A comissão de barracas agradece.` };
  }
  const tabelado = tabeladoFeira(req.bem);
  let preco: number | null = null;
  if (!troca) {
    if (tabelado) preco = precoReferencia(req.bem, 'semente')!;
    else {
      preco = Math.floor(req.preco ?? 0);
      if (preco < 1) return { ok: false, erro: 'Ponha um preço.' };
      const teto = tetoFeira(req.bem);
      if (preco > teto) return { ok: false, erro: `Na feira o teto é ${teto} Sementes. Especulação é coisa da outra margem.` };
    }
  }
  const t = tirarBem(rec, req.bem);
  if (!t.ok) return t;
  const a: Anuncio = {
    id: novoId(m, 'f'),
    mercado: 'feira',
    vendedor: rec.id,
    vendedorNome: rec.name,
    bem: req.bem,
    preco,
    moeda: 'semente',
    trocaPor: troca,
    taxaPct: F.vendas.taxaPct,
    tabelado,
    criadoEm: now,
    expiraEm: now + F.vendas.anuncioDuraCiclosProducao * PRODUCAO_MS(),
  };
  m.anuncios.push(a);
  return { ok: true, anuncio: a };
}

/** Pessoas na fila da feira agora (compras ainda não prontas). */
export const filaFeira = (m: MarketState, now: number): number => m.entregas.filter((e) => e.prontoEm > now).length;

export function comprarFeira(
  m: MarketState,
  rec: PlayerRecord,
  anuncioId: string,
  now: number,
): Check & { anuncio?: Anuncio; entrega?: { id: string; prontoEm: number; posicao: number } } {
  const F = getData().economy.feira;
  const a = m.anuncios.find((x) => x.id === anuncioId && x.mercado === 'feira');
  if (!a || a.expiraEm <= now) return { ok: false, erro: 'Esse anúncio não está mais na feira.' };
  if (a.vendedor === rec.id) return { ok: false, erro: 'Comprar de você mesmo é coisa de acionista.' };
  if (a.tabelado && m.entregas.filter((e) => e.jogador === rec.id).length >= LIMITE_FILA) {
    return { ok: false, erro: `Você já tem ${LIMITE_FILA} lugares na fila. Retire antes de pegar outro.` };
  }
  const p = pendencia(m, a.vendedor);
  if (a.trocaPor) {
    for (const t of a.trocaPor) if (!temBem(rec, t)) return { ok: false, erro: `Falta ${nomeDoBem(t)} para a troca.` };
    for (const t of a.trocaPor) {
      tirarBem(rec, t);
      p.bens.push(t);
    }
  } else {
    const pg = pagar(rec, 'semente', a.preco ?? 0);
    if (!pg.ok) return pg;
    p.semente += a.preco ?? 0;
  }
  p.avisos.push(`${rec.name} levou ${nomeDoBem(a.bem)} na feira.`);
  m.anuncios = m.anuncios.filter((x) => x !== a);
  if (a.tabelado) {
    const frente = filaFeira(m, now);
    const espera = Math.min(F.fila.esperaMaxS, F.fila.esperaPorPessoaS * (frente + 1)) * 1000;
    const e: Entrega = { id: novoId(m, 'e'), jogador: rec.id, bem: a.bem, prontoEm: now + espera };
    m.entregas.push(e);
    return { ok: true, anuncio: a, entrega: { id: e.id, prontoEm: e.prontoEm, posicao: frente + 1 } };
  }
  darBem(rec, a.bem);
  return { ok: true, anuncio: a };
}

/** Entrega as compras da fila que já ficaram prontas. */
export function retirarEntregas(m: MarketState, rec: PlayerRecord, now: number): { bens: Bem[]; aguardando: { id: string; prontoEm: number }[] } {
  const bens: Bem[] = [];
  const aguardando: { id: string; prontoEm: number }[] = [];
  m.entregas = m.entregas.filter((e) => {
    if (e.jogador !== rec.id) return true;
    if (e.prontoEm > now) {
      aguardando.push({ id: e.id, prontoEm: e.prontoEm });
      return true;
    }
    darBem(rec, e.bem);
    bens.push(e.bem);
    return false;
  });
  return { bens, aguardando };
}

// ---------------------------------------------------------------------------
// app

/** Taxa do app em % para um vendedor (Consórcio + faixa de score). */
export const taxaAppPct = (vendedor: PlayerRecord): number => Math.max(0, getData().economy.app.taxaConsorcioPct + faixaScore(vendedor).taxaAppPp);

/** Quanto o Consórcio fica de uma venda no app. */
export function taxaApp(preco: number, pct: number): number {
  return Math.min(preco, Math.ceil((preco * pct) / 100) + getData().economy.app.taxaConveniencia);
}

/** Preço sugerido no app (referência em Crédito × preço dinâmico). */
export function precoSugeridoApp(m: MarketState, b: Bem, ctx: PrecoCtx = {}): number | null {
  const ref = precoReferencia(b, 'credito');
  if (ref === null) return null;
  return Math.max(1, Math.round(ref * multDinamico(m.npc, b.id, ctx)));
}

export function anunciarApp(m: MarketState, rec: PlayerRecord, req: { bem: Bem; preco: number }, now: number): Check & { anuncio?: Anuncio } {
  const A = getData().economy.app;
  if (rec.side !== 'direita') return { ok: false, erro: 'O app é do Consórcio. Na Esquerda tem a feira.' };
  const v = bemValido(req.bem);
  if (!v.ok) return v;
  const preco = Math.floor(req.preco);
  if (!Number.isFinite(preco) || preco < 1) return { ok: false, erro: 'Ponha um preço.' };
  if (ativos(m, 'app', now).filter((a) => a.vendedor === rec.id).length >= LIMITE_ANUNCIOS_APP) {
    return { ok: false, erro: `Limite de ${LIMITE_ANUNCIOS_APP} anúncios. Assine o Plano Lojista para mais. (Brincadeira. Por enquanto.)` };
  }
  const t = tirarBem(rec, req.bem);
  if (!t.ok) return t;
  const a: Anuncio = {
    id: novoId(m, 'a'),
    mercado: 'app',
    vendedor: rec.id,
    vendedorNome: rec.name,
    bem: req.bem,
    preco,
    moeda: 'credito',
    trocaPor: null,
    taxaPct: taxaAppPct(rec),
    tabelado: false,
    criadoEm: now,
    expiraEm: now + A.lojinha.anuncioDuraCiclosProducao * PRODUCAO_MS(),
  };
  m.anuncios.push(a);
  return { ok: true, anuncio: a };
}

export function comprarApp(m: MarketState, rec: PlayerRecord, anuncioId: string, now: number): Check & { anuncio?: Anuncio; taxa?: number } {
  const a = m.anuncios.find((x) => x.id === anuncioId && x.mercado === 'app');
  if (!a || a.expiraEm <= now) return { ok: false, erro: 'Anúncio indisponível. Mas temos ofertas parecidas!' };
  if (a.vendedor === rec.id) return { ok: false, erro: 'Comprar de você mesmo é coisa de acionista.' };
  const preco = a.preco ?? 0;
  const pg = pagar(rec, 'credito', preco);
  if (!pg.ok) return pg;
  const taxa = taxaApp(preco, a.taxaPct);
  const p = pendencia(m, a.vendedor);
  p.credito += preco - taxa;
  p.score.push('venda_no_app');
  p.avisos.push(`${rec.name} comprou ${nomeDoBem(a.bem)} no app. Taxa do Consórcio: ${taxa} Cr.`);
  m.anuncios = m.anuncios.filter((x) => x !== a);
  darBem(rec, a.bem);
  return { ok: true, anuncio: a, taxa };
}

// ---------------------------------------------------------------------------
// comum

/** Cancela um anúncio próprio: o bem volta. */
export function cancelarAnuncio(m: MarketState, rec: PlayerRecord, anuncioId: string): Check {
  const a = m.anuncios.find((x) => x.id === anuncioId);
  if (!a || a.vendedor !== rec.id) return { ok: false, erro: 'Anúncio não encontrado.' };
  m.anuncios = m.anuncios.filter((x) => x !== a);
  darBem(rec, a.bem);
  return { ok: true };
}

/** Anúncios vencidos saem e o bem vai para as pendências do vendedor. Devolve quantos venceram. */
export function expirarAnuncios(m: MarketState, now: number): number {
  const venc = m.anuncios.filter((a) => a.expiraEm <= now);
  for (const a of venc) {
    const p = pendencia(m, a.vendedor);
    p.bens.push(a.bem);
    p.avisos.push(`Seu anúncio de ${nomeDoBem(a.bem)} venceu. O item voltou.`);
  }
  m.anuncios = m.anuncios.filter((a) => a.expiraEm > now);
  return venc.length;
}

/** Recebe o que o jogador tem a receber do mercado (vendas, trocas, itens de anúncios vencidos). */
export function receberPendencias(m: MarketState, rec: PlayerRecord): Pendencia | null {
  const p = m.pendencias[rec.id];
  if (!p) return null;
  delete m.pendencias[rec.id];
  if (p.semente > 0) receber(rec, 'semente', p.semente);
  if (p.credito > 0) receber(rec, 'credito', p.credito);
  for (const b of p.bens) darBem(rec, b);
  for (const s of p.score) scoreEvento(rec, s);
  return p;
}

export interface AnuncioView {
  id: string;
  mercado: MercadoId;
  vendedor: string;
  vendedorNome: string;
  bem: Bem;
  nome: string;
  preco: number | null;
  moeda: Moeda;
  trocaPor: { bem: Bem; nome: string }[] | null;
  tabelado: boolean;
  expiraEm: number;
  meu: boolean;
}

export interface MercadoView {
  mercado: MercadoId;
  anuncios: AnuncioView[];
  /** pessoas na fila da feira */
  fila: number;
  /** minhas compras na fila */
  minhasEntregas: { id: string; nome: string; prontoEm: number }[];
  /** taxa do app para mim, em % (só no app) */
  taxaPct: number;
  limiteAnuncios: number;
  meusAnuncios: number;
}

export function mercadoView(m: MarketState, mercado: MercadoId, viewer: PlayerRecord, now: number): MercadoView {
  const list = ativos(m, mercado, now);
  return {
    mercado,
    anuncios: list.map((a) => ({
      id: a.id,
      mercado: a.mercado,
      vendedor: a.vendedor,
      vendedorNome: a.vendedorNome,
      bem: a.bem,
      nome: nomeDoBem(a.bem),
      preco: a.preco,
      moeda: a.moeda,
      trocaPor: a.trocaPor ? a.trocaPor.map((b) => ({ bem: b, nome: nomeDoBem(b) })) : null,
      tabelado: a.tabelado,
      expiraEm: a.expiraEm,
      meu: a.vendedor === viewer.id,
    })),
    fila: filaFeira(m, now),
    minhasEntregas: m.entregas.filter((e) => e.jogador === viewer.id).map((e) => ({ id: e.id, nome: nomeDoBem(e.bem), prontoEm: e.prontoEm })),
    taxaPct: mercado === 'app' ? taxaAppPct(viewer) : 0,
    limiteAnuncios: mercado === 'app' ? LIMITE_ANUNCIOS_APP : LIMITE_ANUNCIOS_FEIRA,
    meusAnuncios: list.filter((a) => a.vendedor === viewer.id).length,
  };
}

/** Novo ciclo da cidade no mercado: o preço dinâmico volta ao normal. */
export function resetPrecosNpc(m: MarketState): void {
  m.npc = {};
}
