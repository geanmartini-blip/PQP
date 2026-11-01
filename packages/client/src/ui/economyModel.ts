/**
 * Modelo puro das telas da Fase 4 (testável sem DOM): o que mostrar na carteira, na loja, no
 * mercado e na casa, que lugar do mapa está perto, que tela um NPC abre e o tile tocado na grade.
 * Nada aqui decide regra: preço final, estoque e permissão são do servidor. Os preços mostrados
 * aqui são a tabela (loja dinâmica mostra "~" porque o caixa aplica o preço do momento).
 */
import { getData } from '@pqp/shared';
import { MOVEL_PREFIX, nomeDoBem, precoReferencia, type Bem, type Moeda } from '@pqp/shared/game/index';
import type { TileMap } from '@pqp/shared/map';
import type { S2C_Perfil } from '@pqp/shared/net';

export type Side = 'esquerda' | 'direita';

/** Moeda da margem (sem margem: Semente, a do Delta). */
export const sideMoeda = (side: string | null | undefined): Moeda => (side === 'direita' ? 'credito' : 'semente');

/** Abreviação da moeda. */
export const moedaCurta = (m: Moeda): string => (m === 'semente' ? 'S' : 'Cr');

/** Texto curto da carteira no HUD: a moeda da margem. */
export function walletLabel(p: Pick<S2C_Perfil, 'side' | 'semente' | 'credito'> & { divida?: number }): string {
  const m = sideMoeda(p.side);
  const v = m === 'semente' ? p.semente : p.credito;
  return `${v} ${moedaCurta(m)}${(p.divida ?? 0) > 0 ? ' !' : ''}`;
}

// ---------------------------------------------------------------------------
// bens do jogador

export interface Good {
  /** id do inventário ('movel:<id>' no móvel) ou do recurso */
  invId: string;
  bem: Bem;
  nome: string;
  /** quantos tem */
  qtd: number;
}

const RECURSOS = ['comida', 'pecas', 'chopindita', 'energia'] as const;

/** Bens para vender e anunciar: itens do inventário agrupados e recursos com saldo. */
export function goodsOf(inventario: readonly string[] | undefined, resources: Partial<Record<string, number>> | undefined): Good[] {
  const out: Good[] = [];
  const count = new Map<string, number>();
  for (const id of inventario ?? []) count.set(id, (count.get(id) ?? 0) + 1);
  for (const [id, n] of count) {
    const bem: Bem = id.startsWith(MOVEL_PREFIX) ? { tipo: 'movel', id: id.slice(MOVEL_PREFIX.length) } : { tipo: 'item', id };
    out.push({ invId: id, bem, nome: nomeDoBem(bem), qtd: n });
  }
  for (const r of RECURSOS) {
    const n = Math.floor(resources?.[r] ?? 0);
    if (n <= 0) continue;
    const bem: Bem = { tipo: 'recurso', id: r, quantidade: 1 };
    out.push({ invId: r, bem, nome: getData().economy.recursos.find((x) => x.id === r)?.name ?? r, qtd: n });
  }
  return out;
}

/** O bem com a quantidade pedida (recurso); item e móvel são sempre 1. */
export function withQty(b: Bem, q: number): Bem {
  return b.tipo === 'recurso' ? { ...b, quantidade: Math.max(1, Math.floor(q)) } : b;
}

/** Preço sugerido de um anúncio: tabela da feira ou referência na moeda do mercado. */
export function suggestedPrice(b: Bem, mercado: 'feira' | 'app'): number {
  return Math.max(1, Math.round(precoReferencia(b, mercado === 'feira' ? 'semente' : 'credito') ?? 1));
}

/** Item da tabela da feira (sai pelo preço da tabela, e a compra entra na fila). */
export function fairFixed(b: Bem): boolean {
  return b.tipo !== 'movel' && getData().economy.feira.precosTabelados.some((t) => t.id === b.id);
}

// ---------------------------------------------------------------------------
// loja de NPC

/** Moeda da loja: a pedida, se aceita; senão a da margem; senão a primeira (igual a shop.ts). */
export function shopMoeda(shopId: string, side: string | null | undefined, pedida?: Moeda): Moeda {
  const s = getData().shopsById.get(shopId);
  const aceita = (s?.moedas ?? ['semente']) as readonly string[];
  if (pedida && aceita.includes(pedida)) return pedida;
  const m = side === 'direita' ? 'credito' : side === 'esquerda' ? 'semente' : undefined;
  if (m && aceita.includes(m)) return m;
  return aceita[0] as Moeda;
}

export interface ShopRow {
  item: string;
  nome: string;
  moeda: Moeda;
  preco: number;
  /** preço dinâmico: o caixa cobra o do momento */
  aprox: boolean;
  liberado: boolean;
  patenteMin?: string;
}

function rankOrdem(side: string | null | undefined, id: string | null | undefined): number {
  const soc = getData().societies.sociedades.find((s) => s.side === side);
  return soc?.patentes.find((p) => p.id === id)?.ordem ?? 0;
}

/** O que a loja vende, com o preço da tabela na moeda certa. */
export function shopRows(shopId: string, p: Pick<S2C_Perfil, 'side' | 'rank'> | null): ShopRow[] {
  const s = getData().shopsById.get(shopId);
  if (!s) return [];
  const side = p?.side ?? null;
  const moeda = shopMoeda(shopId, side);
  const mine = rankOrdem(side, p?.rank);
  const rows: ShopRow[] = [];
  for (const it of s.itens) {
    const preco = (it.preco as Partial<Record<Moeda, number>>)[moeda];
    if (preco === undefined) continue;
    const min = (it as { patenteMin?: string }).patenteMin;
    const liberado = !min || rankOrdem(side, min) <= mine;
    rows.push({ item: it.item, nome: nomeDoBem({ tipo: 'item', id: it.item }), moeda, preco: Math.ceil(preco), aprox: s.regraPreco === 'dinamico', liberado, ...(min ? { patenteMin: min } : {}) });
  }
  return rows;
}

/** Quanto a loja paga por um bem (estimativa igual a precoVenda: 40% da tabela ou da referência). */
export function sellEstimate(shopId: string, b: Bem, side: string | null | undefined): { moeda: Moeda; valor: number } | null {
  const D = getData();
  const s = D.shopsById.get(shopId);
  if (!s) return null;
  const moeda = shopMoeda(shopId, side);
  const e = s.itens.find((x) => x.item === b.id);
  const tab = e ? (e.preco as Partial<Record<Moeda, number>>)[moeda] : undefined;
  const ref = tab ?? precoReferencia(b.tipo === 'recurso' ? { ...b, quantidade: 1 } : b, moeda);
  if (ref === null || ref === undefined) return null;
  return { moeda, valor: Math.max(1, Math.floor(ref * D.economy.lojasNpc.compraDoJogadorPct)) };
}

// ---------------------------------------------------------------------------
// lugares perto e NPCs

export type Spot = { kind: 'loja'; shop: string } | { kind: 'casa' } | { kind: 'feira' } | { kind: 'app' } | { kind: 'cambio' };

// SUGESTÃO: perto = 2,2 tiles da loja e da porta; 4 tiles do lugar (feira, shopping, câmbio).
export const SPOT_RADIUS = 2.2;
export const PLACE_SPOT_RADIUS = 4;

/** Lado do mapa (a moradia do mapa é da margem dele). */
export const mapSide = (mapId: string): Side | null => (mapId === 'margem_esquerda' || mapId === 'qg_esquerda' ? 'esquerda' : mapId === 'margem_direita' || mapId === 'qg_direita' ? 'direita' : null);

const PLACE_SPOTS: Record<string, Spot['kind']> = { feira_da_esquerda: 'feira', shopping: 'app', cambio_da_ponte: 'cambio' };

/** Telas que o lugar onde o jogador está abre (loja, porta de casa, feira, app, câmbio). */
export function nearSpots(map: TileMap, x: number, y: number, side: string | null | undefined): Spot[] {
  const out: Spot[] = [];
  const seen = new Set<string>();
  const add = (s: Spot) => {
    const k = s.kind === 'loja' ? `loja:${s.shop}` : s.kind;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(s);
  };
  for (const m of map.markers) {
    const d = Math.hypot(m.x - x, m.y - y);
    if (m.kind === 'loja' && m.ref && d <= SPOT_RADIUS && getData().shopsById.has(m.ref)) add({ kind: 'loja', shop: m.ref });
    else if (m.kind === 'moradia' && d <= SPOT_RADIUS && side && mapSide(map.id) === side) add({ kind: 'casa' });
    else if (m.kind === 'lugar' && m.ref && d <= PLACE_SPOT_RADIUS) {
      const k = PLACE_SPOTS[m.ref];
      if (k === 'feira' && side !== 'esquerda') continue;
      if (k === 'app' && side !== 'direita') continue;
      if (k) add({ kind: k } as Spot);
    }
  }
  return out;
}

// SUGESTÃO: quem abre o quê no diálogo (o cambista e a Dalva, o entregador, a feira e o mutirão).
const NPC_SPOTS: Record<string, Spot['kind']> = {
  cambista_da_ponte: 'cambio',
  dalva_rocha: 'cambio',
  entregador_de_app: 'app',
  vizinha_da_bracadeira: 'feira',
  teodoro_rinaldi: 'casa',
};
/** Raio em volta do jogador em que a loja do NPC conta (ele fala na porta da loja). */
export const NPC_SHOP_RADIUS = 6;

/** Telas que a conversa com um NPC oferece (a loja dele, se ela estiver ali; câmbio; app; feira). */
export function npcSpots(npcId: string, map: TileMap | null, x: number, y: number, side: string | null | undefined): Spot[] {
  const out: Spot[] = [];
  const D = getData();
  for (const s of D.shops.lojas) {
    if (s.npc !== npcId) continue;
    const mk = map?.markers.find((m) => m.kind === 'loja' && m.ref === s.id);
    if (mk && Math.hypot(mk.x - x, mk.y - y) <= NPC_SHOP_RADIUS) out.push({ kind: 'loja', shop: s.id });
  }
  const k = NPC_SPOTS[npcId];
  if (k === 'feira' && side === 'esquerda') out.push({ kind: 'feira' });
  else if (k === 'app' && side === 'direita') out.push({ kind: 'app' });
  else if (k === 'cambio') out.push({ kind: 'cambio' });
  else if (k === 'casa' && side === 'esquerda' && map && mapSide(map.id) === 'esquerda') out.push({ kind: 'casa' });
  // o Yusuf também está na feira
  if (npcId === 'yusuf_adeyemi' && side === 'esquerda' && map?.markers.some((m) => m.kind === 'lugar' && m.ref === 'feira_da_esquerda' && Math.hypot(m.x - x, m.y - y) <= NPC_SHOP_RADIUS)) out.push({ kind: 'feira' });
  return out;
}

/** Texto do botão de cada tela. SUGESTÃO: textos curtos. */
export function spotLabel(s: Spot): string {
  switch (s.kind) {
    case 'loja':
      return getData().shopsById.get(s.shop)?.name ?? 'Loja';
    case 'casa':
      return 'Entrar em casa';
    case 'feira':
      return 'Feira de troca';
    case 'app':
      return 'Abrir o app';
    case 'cambio':
      return 'Câmbio';
  }
}

// ---------------------------------------------------------------------------
// casa

/** Tile da grade sob um toque no canvas (coordenadas de CSS dentro do elemento). */
export function tileAt(
  cssX: number,
  cssY: number,
  elW: number,
  elH: number,
  tex: { w: number; h: number; floorX: number; floorY: number; tilesW: number; tilesH: number },
): { x: number; y: number } | null {
  if (elW <= 0 || elH <= 0) return null;
  const px = (cssX / elW) * tex.w - tex.floorX;
  const py = (cssY / elH) * tex.h - tex.floorY;
  const x = Math.floor(px / 32), y = Math.floor(py / 32);
  if (x < 0 || y < 0 || x >= tex.tilesW || y >= tex.tilesH) return null;
  return { x, y };
}

/** Móvel colocado que cobre o tile (o de cima, desenhado por último, ganha). */
export function furnitureAt<T extends { uid: number; x: number; y: number; w: number; h: number; parede: boolean }>(moveis: readonly T[], tx: number, ty: number): T | undefined {
  let best: T | undefined;
  for (const m of moveis) if (tx >= m.x && tx < m.x + m.w && ty >= m.y && ty < m.y + m.h && (!best || m.y + m.h >= best.y + best.h)) best = m;
  return best;
}

/** Móveis à venda para a margem (os do estilo dela e os do Delta), mais baratos primeiro. */
export function furnitureCatalog(side: string | null | undefined): { id: string; nome: string; moeda: Moeda; preco: number; w: number; h: number; parede: boolean; piada: string }[] {
  const m = sideMoeda(side);
  return getData()
    .furniture.filter((f) => f.estilo === 'delta' || f.estilo === side)
    .map((f) => {
      const p = f.preco.find((x) => x.moeda === m) ?? f.preco[0]!;
      return { id: f.id, nome: f.name, moeda: p.moeda, preco: p.valor, w: f.tamanho.w, h: f.tamanho.h, parede: f.parede === true, piada: f.piada };
    })
    .sort((a, b) => a.preco - b.preco);
}

/** Permissões de visita na ordem do botão. */
export const VISIT_ORDER = ['so_eu', 'grupo', 'margem', 'todos'] as const;
export const VISIT_LABEL: Record<string, string> = { so_eu: 'Só eu', grupo: 'Meu grupo', margem: 'Minha margem', todos: 'Todo mundo' };
export const nextVisit = (v: string): (typeof VISIT_ORDER)[number] => VISIT_ORDER[(Math.max(0, VISIT_ORDER.indexOf(v as (typeof VISIT_ORDER)[number])) + 1) % VISIT_ORDER.length]!;
