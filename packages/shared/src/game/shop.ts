/**
 * Fase 4: a loja de NPC compra e vende de verdade (shops.json).
 *
 * Decisões:
 * - A moeda é a pedida, se a loja aceitar; senão a da margem do jogador; senão a primeira da loja.
 * - Loja 'tabelado' (Esquerda, Delta) cobra o preço da tabela. Loja 'dinamico' (Direita) cobra o
 *   preço × preço dinâmico (economy.json app.precoDinamico, com procura e oferta guardadas no
 *   MarketState.npc) × (1 + (taxaPct + pontos da faixa de score) / 100). O dinâmico fica dentro de
 *   ±variacaoPct da loja quando ela tem variacaoPct. // SUGESTÃO: a faixa do score de quem compra
 *   mexe na taxa da loja, igual à taxa do app.
 * - Loja 'contrabando' cobra o preço da tabela, sem taxa.
 * - Item com patenteMin acima da patente não sai (shopView.liberado).
 * - Entrega: equipamento vai para o inventário; a poção soma no botão de item (item_count); outro
 *   consumível vai para o inventário; material que é recurso vai para os recursos. // SUGESTÃO
 * - A loja compra qualquer coisa com preço de referência, a compraDoJogadorPct (40%) do preço da
 *   tabela desta loja ou, se ela não vende o item, do preço de referência (economy.ts). Vender para
 *   loja dinâmica soma oferta no preço dinâmico.
 */
import { getData } from '../data';
import { bemDe, darBem, faixaScore, nomeDoBem, pagar, precoReferencia, receber, tirarBem, type Bem } from './economy';
import { shopView } from './institutions';
import type { MarketState } from './market';
import { emptyResult, type Check, type GameResult, type Moeda, type PlayerRecord } from './types';

/** Medidores que mexem no preço dinâmico (do mapa; padrão: normal, sem apagão). */
export interface PrecoCtx {
  /** índice de preço de vida (100 = normal) */
  precoDeVida?: number;
  apagao?: boolean;
  chovendo?: boolean;
}

export type NpcDemanda = Record<string, { procura: number; oferta: number }>;

/** Multiplicador do preço dinâmico (fórmula de economy.json app.precoDinamico). */
export function multDinamico(npc: NpcDemanda | undefined, itemId: string, ctx: PrecoCtx = {}): number {
  const P = getData().economy.app.precoDinamico;
  const n = npc?.[itemId] ?? { procura: 0, oferta: 0 };
  let m = 1 + (P.kDemanda * (n.procura - n.oferta)) / Math.max(1, n.procura + n.oferta);
  m *= (ctx.precoDeVida ?? 100) / 100;
  if (ctx.apagao) m *= P.apagaoMult;
  m *= ctx.chovendo ? P.chuvaMult : P.semChuvaMult;
  return Math.max(P.min, Math.min(P.max, m));
}

type ShopDef = NonNullable<ReturnType<ReturnType<typeof getData>['shopsById']['get']>>;

function moedaDaLoja(rec: PlayerRecord, s: ShopDef, pedida?: Moeda): Moeda {
  const aceita = s.moedas as readonly string[];
  if (pedida && aceita.includes(pedida)) return pedida;
  const margem = rec.side === 'direita' ? 'credito' : rec.side === 'esquerda' ? 'semente' : undefined;
  if (margem && aceita.includes(margem)) return margem;
  return aceita[0] as Moeda;
}

export interface PrecoLoja {
  moeda: Moeda;
  /** preço final cobrado */
  valor: number;
  /** preço da tabela da loja */
  base: number;
  /** multiplicador dinâmico (1 nas tabeladas) */
  dinamico: number;
  /** taxa em % (loja + faixa do score) */
  taxaPct: number;
}

/** Preço de um item desta loja para o jogador. null = a loja não vende. */
export function precoLoja(rec: PlayerRecord, shopId: string, itemId: string, opts: { mercado?: MarketState; ctx?: PrecoCtx; moeda?: Moeda } = {}): PrecoLoja | null {
  const s = getData().shopsById.get(shopId);
  const e = s?.itens.find((x) => x.item === itemId);
  if (!s || !e) return null;
  const moeda = moedaDaLoja(rec, s, opts.moeda);
  const base = (e.preco as Partial<Record<Moeda, number>>)[moeda];
  if (base === undefined) return null;
  if (s.regraPreco !== 'dinamico') return { moeda, valor: Math.ceil(base), base, dinamico: 1, taxaPct: 0 };
  let din = multDinamico(opts.mercado?.npc, itemId, opts.ctx);
  if (s.variacaoPct > 0) din = Math.max(1 - s.variacaoPct / 100, Math.min(1 + s.variacaoPct / 100, din));
  const taxaPct = Math.max(0, s.taxaPct + faixaScore(rec).taxaAppPp);
  return { moeda, valor: Math.max(1, Math.ceil(base * din * (1 + taxaPct / 100))), base, dinamico: din, taxaPct };
}

/** Compra um item na loja. Tira a moeda e entrega o item. */
export function comprarNaLoja(
  rec: PlayerRecord,
  shopId: string,
  itemId: string,
  opts: { mercado?: MarketState; ctx?: PrecoCtx; moeda?: Moeda } = {},
): Check & { resultado: GameResult; moeda?: Moeda; valor?: number } {
  const r = emptyResult();
  const D = getData();
  const s = D.shopsById.get(shopId);
  if (!s) return { ok: false, erro: 'Loja não encontrada.', resultado: r };
  const e = s.itens.find((x) => x.item === itemId);
  if (!e) return { ok: false, erro: 'Essa loja não vende isso.', resultado: r };
  const view = shopView(rec, shopId)?.itens.find((x) => x.item === itemId);
  if (view && !view.liberado) return { ok: false, erro: 'Sua patente ainda não libera esse item.', resultado: r };
  const p = precoLoja(rec, shopId, itemId, opts);
  if (!p) return { ok: false, erro: 'Essa loja não aceita essa moeda.', resultado: r };
  const pg = pagar(rec, p.moeda, p.valor);
  if (!pg.ok) return { ...pg, resultado: r };
  r.recursos[p.moeda] = -p.valor;
  // entrega
  if (e.tipo === 'consumivel' && itemId === 'pocao') rec.item_count += 1;
  else {
    const b: Bem = e.tipo === 'material' ? (bemDe(itemId) ?? { tipo: 'item', id: itemId }) : { tipo: 'item', id: itemId };
    darBem(rec, b);
    if (b.tipo === 'recurso') r.recursos[b.id] = (r.recursos[b.id] ?? 0) + b.quantidade;
    else r.itens.push(itemId);
  }
  if (s.regraPreco === 'dinamico' && opts.mercado) {
    const n = (opts.mercado.npc[itemId] ??= { procura: 0, oferta: 0 });
    n.procura += 1;
  }
  r.mudou = true;
  r.avisos.push(`Comprou ${nomeDoBem({ tipo: 'item', id: itemId })} por ${p.valor} ${p.moeda === 'semente' ? 'S' : 'Cr'}.`);
  return { ok: true, resultado: r, moeda: p.moeda, valor: p.valor };
}

/** Quanto a loja paga por um item do jogador (null = não compra). */
export function precoVenda(rec: PlayerRecord, shopId: string, itemId: string, moedaPedida?: Moeda): { moeda: Moeda; valor: number } | null {
  const D = getData();
  const s = D.shopsById.get(shopId);
  if (!s) return null;
  const b = bemDe(itemId);
  if (!b) return null;
  const moeda = moedaDaLoja(rec, s, moedaPedida);
  const e = s.itens.find((x) => x.item === itemId);
  const tab = e ? (e.preco as Partial<Record<Moeda, number>>)[moeda] : undefined;
  const ref = tab ?? precoReferencia(b.tipo === 'recurso' ? { ...b, quantidade: 1 } : b, moeda);
  if (ref === null || ref === undefined) return null;
  return { moeda, valor: Math.max(1, Math.floor(ref * D.economy.lojasNpc.compraDoJogadorPct)) };
}

/** Vende um item (ou 1 unidade de recurso) para a loja. */
export function venderNaLoja(
  rec: PlayerRecord,
  shopId: string,
  itemId: string,
  opts: { mercado?: MarketState; moeda?: Moeda } = {},
): Check & { resultado: GameResult; moeda?: Moeda; valor?: number } {
  const r = emptyResult();
  const s = getData().shopsById.get(shopId);
  if (!s) return { ok: false, erro: 'Loja não encontrada.', resultado: r };
  const b = bemDe(itemId, 1);
  if (!b) return { ok: false, erro: 'A loja não compra isso.', resultado: r };
  const p = precoVenda(rec, shopId, itemId, opts.moeda);
  if (!p) return { ok: false, erro: 'A loja não compra isso.', resultado: r };
  const t = tirarBem(rec, b);
  if (!t.ok) return { ...t, resultado: r };
  receber(rec, p.moeda, p.valor);
  r.recursos[p.moeda] = p.valor;
  if (s.regraPreco === 'dinamico' && opts.mercado) {
    const n = (opts.mercado.npc[itemId] ??= { procura: 0, oferta: 0 });
    n.oferta += 1;
  }
  r.mudou = true;
  r.avisos.push(`Vendeu ${nomeDoBem(b)} por ${p.valor} ${p.moeda === 'semente' ? 'S' : 'Cr'}.`);
  return { ok: true, resultado: r, moeda: p.moeda, valor: p.valor };
}
