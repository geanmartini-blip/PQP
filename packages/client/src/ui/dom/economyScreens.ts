/**
 * Telas da Fase 4 em DOM, com botões grandes: carteira, loja de NPC (comprar e vender), feira
 * (Esquerda) e app (Direita), câmbio na ponte e a casa (interior em grade e modo decorar).
 * Também o botão da carteira no topo e os botões de "perto" (loja, porta de casa, feira, app,
 * câmbio) que aparecem quando o jogador chega no lugar.
 *
 * Nada aqui decide regra: as telas mostram o que o servidor mandou ('carteira', 'mercado_info',
 * 'cambio_info', 'casa_info', 'economia_resultado') e mandam os pedidos.
 */
import type * as Phaser from 'phaser';
import { getData } from '@pqp/shared';
import { valorAluguel, type MercadoId, type Moeda } from '@pqp/shared/game/index';
import type { S2C_CasaInfo } from '@pqp/shared/net';
import type { ArtApi } from '../../art/contract';
import type { GameClient } from '../../game/GameClient';
import {
  fairFixed,
  furnitureAt,
  furnitureCatalog,
  goodsOf,
  moedaCurta,
  nearSpots,
  nextVisit,
  sellEstimate,
  shopRows,
  sideMoeda,
  spotLabel,
  suggestedPrice,
  tileAt,
  VISIT_LABEL,
  walletLabel,
  withQty,
  type Good,
  type Spot,
} from '../economyModel';
import { button, el } from './styles';

// SUGESTÃO: a linha de resultado fica 4 s na tela.
export const RESULT_MS = 4000;

const CSS = `
#pqp-ui .f4-perto { position: absolute; left: 50%; transform: translateX(-50%); bottom: 46%; display: flex; gap: 6px; pointer-events: none; }
#pqp-ui .f4-perto .btn { pointer-events: auto; }
#pqp-ui .f4-carteira { min-width: 72px; }
#pqp-ui .f4-carteira.alerta { background: #ffb0a0; animation: pqpPisca 0.9s ease-in-out infinite alternate; }
#pqp-ui .f4-abas { display: flex; gap: 6px; }
#pqp-ui .f4-abas .btn { flex: 1; }
#pqp-ui .f4-linha { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 3px solid #140c16; background: #3a2a40;
  box-shadow: inset -3px -3px 0 #24182a, inset 3px 3px 0 #5a4a62; font-size: 14px; }
#pqp-ui .f4-linha.esquerda { background: #34442a; box-shadow: inset -3px -3px 0 #22301a, inset 3px 3px 0 #56703e; }
#pqp-ui .f4-linha.direita { background: #262636; box-shadow: inset -3px -3px 0 #16162a, inset 3px 3px 0 #3a5a7a; }
#pqp-ui .f4-linha.sel { outline: 3px solid #ffd060; }
#pqp-ui .f4-linha .col { flex: 1; min-width: 0; }
#pqp-ui .f4-linha b { color: #ffe8a0; }
#pqp-ui .f4-linha small { display: block; color: #c8c0d0; font-size: 12px; }
#pqp-ui .f4-linha .btn { flex: 0 0 auto; min-width: 96px; }
#pqp-ui .f4-qtd { display: flex; align-items: center; justify-content: center; gap: 6px; }
#pqp-ui .f4-qtd .v { min-width: 86px; text-align: center; font-size: 20px; font-weight: bold; color: #ffe8a0; }
#pqp-ui .f4-grande { font-size: 18px; text-align: center; margin: 4px 0; }
#pqp-ui .f4-res { font-size: 14px; text-align: center; min-height: 18px; color: #b8f0a8; }
#pqp-ui .f4-res.erro { color: #ffb0a0; }
#pqp-ui .f4-casa { flex: 0 1 auto; min-height: 0; display: flex; justify-content: center; pointer-events: auto; touch-action: none; }
#pqp-ui .f4-casa canvas { max-width: 100%; max-height: 44vh; border: 3px solid #140c16; background: #140c16; }
#pqp-ui .f4-guardados { display: flex; gap: 6px; overflow-x: auto; pointer-events: auto; touch-action: pan-x; padding-bottom: 2px; min-height: 52px; }
#pqp-ui .f4-guardados .btn { flex: 0 0 auto; font-size: 13px; }
#pqp-ui .f4-guardados .btn.on { background: #ffd060; }
`;

let cssDone = false;
function injectCss(): void {
  if (cssDone || typeof document === 'undefined') return;
  const st = document.createElement('style');
  st.id = 'pqp-ui-f4-css';
  st.textContent = CSS;
  document.head.appendChild(st);
  cssDone = true;
}

export type Fase4Screen = { tela: 'carteira' } | { tela: 'loja'; shop: string } | { tela: 'mercado'; mercado: MercadoId } | { tela: 'cambio' } | { tela: 'casa' };

export interface Fase4Frame {
  /** posição desenhada do próprio personagem (tiles) */
  selfTile: { x: number; y: number } | null;
  /** a interface está livre (sem diálogo nem outra tela) */
  free: boolean;
}

/** Tela aberta a partir de um lugar ou NPC. */
export function screenOfSpot(s: Spot): Fase4Screen {
  switch (s.kind) {
    case 'loja':
      return { tela: 'loja', shop: s.shop };
    case 'feira':
      return { tela: 'mercado', mercado: 'feira' };
    case 'app':
      return { tela: 'mercado', mercado: 'app' };
    case 'cambio':
      return { tela: 'cambio' };
    case 'casa':
      return { tela: 'casa' };
  }
}

const moedaNome = (m: Moeda, n = 2): string => (m === 'semente' ? (n === 1 ? 'Semente' : 'Sementes') : n === 1 ? 'Crédito' : 'Créditos');

export class Fase4Ui {
  /** botão da carteira (entra na linha do topo da Fase 3) */
  readonly walletChip: HTMLButtonElement;
  private modal: HTMLDivElement | null = null;
  private scr: Fase4Screen | null = null;
  private res: HTMLDivElement | null = null;
  private shownKey = '';
  private near: HTMLDivElement;
  private nearSig = '';
  private walletSig = '';
  // estado das telas (não vem do servidor)
  private tab: 'comprar' | 'vender' | 'lista' | 'anunciar' = 'comprar';
  private pick: Good | null = null;
  private qtd = 1;
  private preco = 1;
  private de: Moeda = 'semente';
  private troca = 50;
  private decorar = false;
  private catalogo = false;
  private selGuardado: string | null = null;
  private selUid: number | null = null;
  private lastQuote = '';
  private houseArt: { w: number; h: number; floorX: number; floorY: number; tilesW: number; tilesH: number } | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly gc: GameClient,
    private readonly art: ArtApi,
    private readonly scene: () => Phaser.Scene | undefined,
  ) {
    injectCss();
    this.walletChip = button('', 'f4-carteira', () => this.open({ tela: 'carteira' }));
    this.near = el('div', 'f4-perto');
    this.near.style.display = 'none';
    root.appendChild(this.near);
  }

  get isOpen(): boolean {
    return this.modal !== null;
  }

  get screen(): Fase4Screen | null {
    return this.scr;
  }

  open(s: Fase4Screen): void {
    this.close();
    this.scr = s;
    this.modal = el('div', 'modal');
    this.root.appendChild(this.modal);
    this.tab = s.tela === 'loja' ? 'comprar' : 'lista';
    this.pick = null;
    this.qtd = 1;
    this.decorar = false;
    this.catalogo = false;
    this.selGuardado = null;
    this.selUid = null;
    this.lastQuote = '';
    const p = this.gc.game.profile;
    this.de = sideMoeda(p?.side);
    this.gc.requestWallet();
    if (s.tela === 'mercado') this.gc.listMarket(s.mercado);
    if (s.tela === 'cambio') this.quote();
    if (s.tela === 'casa') this.gc.requestHouse();
    this.shownKey = this.dataKey();
    this.render();
  }

  close(): void {
    this.modal?.remove();
    this.modal = null;
    this.scr = null;
    this.res = null;
    this.shownKey = '';
    this.houseArt = null;
  }

  /** A cada quadro. */
  update(now: number, f: Fase4Frame): void {
    this.updateWallet();
    this.updateNear(f);
    if (!this.modal) return;
    const key = this.dataKey();
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.render();
    }
    // linha do último resultado
    const r = this.gc.game.econ;
    if (this.res) {
      const on = r && now - r.at < RESULT_MS;
      const txt = on ? (r.ok ? (r.texto ?? 'Feito.') : (r.erro ?? 'Não deu.')) : '';
      if (this.res.textContent !== txt) this.res.textContent = txt;
      this.res.classList.toggle('erro', !!on && !r.ok);
    }
  }

  // ---------------------------------------------------------------------------
  // HUD: carteira e botões de perto

  private updateWallet(): void {
    const p = this.gc.game.profile;
    if (!p) return;
    const label = walletLabel(p);
    const alerta = (p.divida ?? 0) > 0 || (p.casa?.atraso ?? 0) > 0;
    const sig = `${label}|${alerta}`;
    if (sig === this.walletSig) return;
    this.walletSig = sig;
    this.walletChip.textContent = label;
    this.walletChip.classList.toggle('alerta', alerta);
  }

  private updateNear(f: Fase4Frame): void {
    const p = this.gc.game.profile;
    const map = this.gc.map;
    let spots: Spot[] = [];
    if (f.free && !this.modal && p && p.criado && p.stage === 'margem' && map && f.selfTile) spots = nearSpots(map, f.selfTile.x, f.selfTile.y, p.side);
    this.near.style.display = spots.length > 0 ? '' : 'none';
    const sig = JSON.stringify(spots);
    if (sig === this.nearSig) return;
    this.nearSig = sig;
    this.near.innerHTML = '';
    for (const s of spots.slice(0, 2)) this.near.appendChild(button(spotLabel(s), 'ok', () => this.open(screenOfSpot(s))));
  }

  // ---------------------------------------------------------------------------
  // telas

  /** O que a tela aberta mostra (só redesenha se mudar). */
  private dataKey(): string {
    const g = this.gc.game;
    const p = g.profile;
    const base = [this.tab, this.pick?.invId, this.qtd, this.preco, this.de, this.troca, this.decorar, this.catalogo, this.selGuardado, this.selUid];
    const money = [p?.semente, p?.credito, p?.divida, p?.score, g.wallet, p?.resources];
    switch (this.scr?.tela) {
      case 'carteira':
        return JSON.stringify([base, money, p?.casa]);
      case 'loja':
        return JSON.stringify([base, money, p?.rank]);
      case 'mercado':
        return JSON.stringify([base, money, g.market]);
      case 'cambio':
        return JSON.stringify([base, money, g.exchange]);
      case 'casa':
        return JSON.stringify([base, money, g.house, p?.casa]);
      default:
        return '';
    }
  }

  private render(): void {
    const box = this.modal;
    const s = this.scr;
    if (!box || !s) return;
    box.innerHTML = '';
    this.res = el('div', 'f4-res');
    switch (s.tela) {
      case 'carteira':
        this.renderWallet(box);
        break;
      case 'loja':
        this.renderShop(box, s.shop);
        break;
      case 'mercado':
        this.renderMarket(box, s.mercado);
        break;
      case 'cambio':
        this.renderExchange(box);
        break;
      case 'casa':
        this.renderHouse(box);
        break;
    }
    box.appendChild(this.res);
    const baixo = el('div', 'ed-baixo');
    // SUGESTÃO: texto do botão de fechar
    baixo.appendChild(button('Fechar', 'sec', () => this.close()));
    box.appendChild(baixo);
  }

  private side(): string | null {
    return this.gc.game.profile?.side ?? null;
  }

  private list(box: HTMLElement): HTMLDivElement {
    const l = el('div', 'f3-lista');
    box.appendChild(l);
    return l;
  }

  private row(list: HTMLElement, title: string, sub: string, btn?: HTMLButtonElement, sel = false): HTMLDivElement {
    const r = el('div', `f4-linha ${this.side() ?? ''}${sel ? ' sel' : ''}`);
    const col = el('div', 'col');
    col.appendChild(el('b', '', title));
    if (sub) col.appendChild(el('small', '', sub));
    r.appendChild(col);
    if (btn) r.appendChild(btn);
    list.appendChild(r);
    return r;
  }

  private goods(): Good[] {
    const g = this.gc.game;
    return goodsOf(g.wallet?.inventario, g.profile?.resources);
  }

  // ---- carteira ----

  private renderWallet(box: HTMLDivElement): void {
    const p = this.gc.game.profile;
    const w = this.gc.game.wallet;
    box.appendChild(el('h1', 'sombra', 'Carteira'));
    if (!p) return;
    const pan = el('div', 'f3-painel');
    const bloco = (titulo: string, linhas: string[]) => {
      const b = el('div', 'f3-bloco');
      b.appendChild(el('h2', '', titulo));
      for (const l of linhas) b.appendChild(el('p', '', l));
      pan.appendChild(b);
      return b;
    };
    bloco('Saldo', [`${p.semente} Sementes`, `${p.credito} Créditos`]);
    if (p.side === 'direita') {
      const fx = w?.faixa ?? p.faixaScore;
      const linhas = [`Score: ${p.score}${fx ? ` (${fx.name})` : ''}`];
      if (w?.faixa?.piada) linhas.push(w.faixa.piada);
      if (w?.faixa) linhas.push(`Taxa do app: ${w.faixa.taxaAppPp >= 0 ? '+' : ''}${w.faixa.taxaAppPp} pontos`);
      bloco('Crédito com score', linhas);
    }
    const divida = w?.divida ?? p.divida ?? 0;
    if (divida > 0) {
      const b = bloco('Dívida', [`Você deve ${divida} Créditos. O score agradece se pagar.`]);
      b.appendChild(button(`Pagar dívida`, 'ok', () => this.gc.payDebt()));
    }
    if (w) bloco('Câmbio neste ciclo', [`${w.cambioUsadoCiclo} de ${w.cambioLimiteCiclo} Sementes trocadas`]);
    const casa = p.casa;
    const tipo = casa ? getData().housing.tipos.find((t) => t.id === casa.tipo) : undefined;
    const cl: string[] = [];
    if (tipo) cl.push(tipo.name);
    if (casa?.espera) cl.push(`Lista de espera: faltam ${casa.espera} ciclos.`);
    if (casa && casa.atraso > 0) cl.push(`Aluguel atrasado: ${casa.atraso} ciclos. Despejo com 3.`);
    if (tipo?.aluguel) cl.push(`Aluguel: ${tipo.aluguel.porCiclo} Créditos por ciclo.`);
    if (!casa) cl.push(p.side === 'direita' ? 'Sem moradia. Alugue uma cápsula nos prédios de cápsulas.' : 'Sem moradia ainda.');
    bloco('Moradia', cl);
    const n = this.goods().reduce((s, x) => s + (x.bem.tipo === 'recurso' ? 0 : x.qtd), 0);
    bloco('Inventário', [`${n} coisas guardadas`]);
    const acoes = el('div', 'f3-botoes');
    if (p.side === 'direita') acoes.appendChild(button('Abrir o app', '', () => this.open({ tela: 'mercado', mercado: 'app' })));
    acoes.appendChild(button('Receber vendas', '', () => this.gc.collectMarket()));
    pan.appendChild(acoes);
    box.appendChild(pan);
  }

  // ---- loja ----

  private renderShop(box: HTMLDivElement, shopId: string): void {
    const D = getData();
    const s = D.shopsById.get(shopId);
    const p = this.gc.game.profile;
    box.appendChild(el('h1', 'sombra', s?.name ?? 'Loja'));
    const m = sideMoeda(p?.side);
    box.appendChild(el('div', 'sub', `Você tem ${m === 'semente' ? p?.semente : p?.credito} ${moedaNome(m)}`));
    const abas = el('div', 'f4-abas');
    abas.appendChild(button('Comprar', this.tab === 'comprar' ? '' : 'sec', () => this.setTab('comprar')));
    abas.appendChild(button('Vender', this.tab === 'vender' ? '' : 'sec', () => this.setTab('vender')));
    box.appendChild(abas);
    const list = this.list(box);
    if (this.tab === 'comprar') {
      const rows = shopRows(shopId, p);
      if (s?.regraPreco === 'dinamico') list.appendChild(el('div', 'sub', 'Preço dinâmico: o caixa cobra o preço do momento, com taxa.'));
      for (const r of rows) {
        const b = button(`${r.aprox ? '~' : ''}${r.preco} ${moedaCurta(r.moeda)}`, 'ok', () => this.gc.shopBuy(shopId, r.item, r.moeda));
        b.disabled = !r.liberado;
        this.row(list, r.nome, r.liberado ? '' : `Precisa da patente ${r.patenteMin ?? ''}`, b);
      }
      if (rows.length === 0) list.appendChild(el('div', 'sub', 'Nada à venda na sua moeda.'));
    } else {
      const goods = this.goods();
      for (const g of goods) {
        const est = sellEstimate(shopId, g.bem, p?.side);
        if (!est) continue;
        const b = button(`+${est.valor} ${moedaCurta(est.moeda)}`, '', () => this.gc.shopSell(shopId, g.invId, est.moeda));
        this.row(list, g.nome, `Você tem ${g.qtd}`, b);
      }
      if (list.childElementCount === 0) list.appendChild(el('div', 'sub', this.gc.game.wallet ? 'Nada que a loja compre.' : 'Carregando...'));
    }
  }

  private setTab(t: Fase4Ui['tab']): void {
    this.tab = t;
    this.pick = null;
  }

  // ---- feira e app ----

  private renderMarket(box: HTMLDivElement, mercado: MercadoId): void {
    const g = this.gc.game;
    const p = g.profile;
    const mv = g.market && g.market.mercado === mercado ? g.market : null;
    // SUGESTÃO: títulos da feira e do app
    box.appendChild(el('h1', 'sombra', mercado === 'feira' ? 'Feira de troca' : 'App do Consórcio'));
    const moeda: Moeda = mercado === 'feira' ? 'semente' : 'credito';
    const saldo = moeda === 'semente' ? p?.semente : p?.credito;
    const info = [`Você tem ${saldo ?? 0} ${moedaNome(moeda)}`];
    if (mv && mercado === 'app') info.push(`taxa do app ${mv.taxaPct}%`);
    if (mv && mercado === 'feira' && mv.fila > 0) info.push(`fila: ${mv.fila}`);
    box.appendChild(el('div', 'sub', info.join(' - ')));
    const abas = el('div', 'f4-abas');
    abas.appendChild(button('Anúncios', this.tab === 'lista' ? '' : 'sec', () => this.setTab('lista')));
    abas.appendChild(button(`Anunciar${mv ? ` (${mv.meusAnuncios}/${mv.limiteAnuncios})` : ''}`, this.tab === 'anunciar' ? '' : 'sec', () => this.setTab('anunciar')));
    box.appendChild(abas);
    if (!mv) {
      box.appendChild(el('div', 'sub', 'Carregando...'));
      box.appendChild(this.list(box));
      return;
    }
    if (this.tab === 'anunciar') return this.renderAnnounce(box, mercado);
    const list = this.list(box);
    if (mercado === 'feira' && mv.minhasEntregas.length > 0) {
      const b = button('Retirar', 'ok', () => this.gc.pickUpFair());
      this.row(list, `Na fila: ${mv.minhasEntregas.map((e) => e.nome).join(', ')}`, 'Fica pronto depois de quem está na frente.', b);
    }
    for (const a of mv.anuncios) {
      const preco = a.preco !== null ? `${a.preco} ${moedaCurta(a.moeda)}` : `troca por ${(a.trocaPor ?? []).map((t) => t.nome).join(' + ')}`;
      const sub = `${a.meu ? 'Seu anúncio' : a.vendedorNome}${a.tabelado ? ' - preço da tabela, entra na fila' : ''}`;
      const b = a.meu ? button('Cancelar', 'sec', () => this.gc.cancelListing(a.id)) : button(a.preco !== null ? 'Comprar' : 'Trocar', 'ok', () => this.gc.buyListing(mercado, a.id));
      this.row(list, `${a.nome} - ${preco}`, sub, b);
    }
    if (mv.anuncios.length === 0) list.appendChild(el('div', 'sub', 'Nenhum anúncio agora.'));
    const acoes = el('div', 'f3-botoes');
    acoes.appendChild(button('Atualizar', 'sec', () => this.gc.listMarket(mercado)));
    acoes.appendChild(button('Receber vendas', 'sec', () => this.gc.collectMarket()));
    box.appendChild(acoes);
  }

  private renderAnnounce(box: HTMLDivElement, mercado: MercadoId): void {
    const pick = this.pick;
    if (!pick) {
      const list = this.list(box);
      for (const g of this.goods()) {
        this.row(list, g.nome, `Você tem ${g.qtd}`, button('Escolher', '', () => this.choose(g, mercado)));
      }
      if (list.childElementCount === 0) list.appendChild(el('div', 'sub', this.gc.game.wallet ? 'Nada para anunciar. Vá caçar, colega.' : 'Carregando...'));
      return;
    }
    const pan = el('div', 'f3-painel');
    pan.appendChild(el('div', 'f4-grande', pick.nome));
    const bem = withQty(pick.bem, this.qtd);
    if (pick.bem.tipo === 'recurso' && pick.qtd > 1) {
      pan.appendChild(el('div', 'sub', 'Quantidade'));
      pan.appendChild(this.stepper(String(this.qtd), (d) => (this.qtd = Math.max(1, Math.min(pick.qtd, this.qtd + d))), [1, 5]));
    }
    const fixo = mercado === 'feira' && fairFixed(bem);
    const moeda: Moeda = mercado === 'feira' ? 'semente' : 'credito';
    if (fixo) pan.appendChild(el('div', 'f4-grande', `Preço da tabela: ${suggestedPrice(bem, 'feira')} ${moedaNome(moeda)}`));
    else {
      pan.appendChild(el('div', 'sub', `Preço (sugerido ${suggestedPrice(bem, mercado)})`));
      pan.appendChild(this.stepper(`${this.preco} ${moedaCurta(moeda)}`, (d) => (this.preco = Math.max(1, this.preco + d)), [1, 10]));
    }
    if (mercado === 'app' && this.gc.game.market) pan.appendChild(el('div', 'sub', `O Consórcio fica com ${this.gc.game.market.taxaPct}% e a taxa de conveniência.`));
    const acoes = el('div', 'f3-botoes');
    acoes.appendChild(button('Voltar', 'sec', () => (this.pick = null)));
    acoes.appendChild(
      button('Anunciar', 'ok', () => {
        this.gc.announce(mercado, bem, fixo ? suggestedPrice(bem, 'feira') : this.preco);
        this.pick = null;
        this.tab = 'lista';
      }),
    );
    pan.appendChild(acoes);
    box.appendChild(pan);
  }

  private choose(g: Good, mercado: MercadoId): void {
    this.pick = g;
    this.qtd = 1;
    this.preco = suggestedPrice(g.bem, mercado);
  }

  /** − valor + com dois passos (pequeno e grande). */
  private stepper(value: string, change: (d: number) => void, steps: [number, number]): HTMLDivElement {
    const q = el('div', 'f4-qtd');
    const b = (t: string, d: number) => button(t, 'sec', () => change(d));
    q.appendChild(b(`-${steps[1]}`, -steps[1]));
    q.appendChild(b(`-${steps[0]}`, -steps[0]));
    q.appendChild(el('div', 'v', value));
    q.appendChild(b(`+${steps[0]}`, steps[0]));
    q.appendChild(b(`+${steps[1]}`, steps[1]));
    return q;
  }

  // ---- câmbio ----

  private quote(): void {
    const sig = `${this.de}|${this.troca}`;
    if (sig === this.lastQuote) return;
    this.lastQuote = sig;
    this.gc.quoteExchange(this.de, this.troca);
  }

  private renderExchange(box: HTMLDivElement): void {
    const g = this.gc.game;
    const p = g.profile;
    const ex = g.exchange;
    box.appendChild(el('h1', 'sombra', 'Câmbio da Ponte'));
    box.appendChild(el('div', 'sub', `Você tem ${p?.semente ?? 0} Sementes e ${p?.credito ?? 0} Créditos`));
    const pan = el('div', 'f3-painel');
    if (ex) {
      pan.appendChild(el('div', 'f4-grande', `1 Semente = ${ex.taxa.cotacao.toFixed(2)} Créditos`));
      pan.appendChild(el('div', 'sub', `Spread ${ex.taxa.spreadPct}% - trocado no ciclo: ${ex.usadoCiclo} de ${ex.taxa.limitePorCicloSemente} Sementes`));
    } else pan.appendChild(el('div', 'sub', 'Carregando...'));
    const abas = el('div', 'f4-abas');
    const setDe = (m: Moeda) => {
      this.de = m;
      this.quote();
    };
    abas.appendChild(button('Semente → Crédito', this.de === 'semente' ? '' : 'sec', () => setDe('semente')));
    abas.appendChild(button('Crédito → Semente', this.de === 'credito' ? '' : 'sec', () => setDe('credito')));
    pan.appendChild(abas);
    const saldo = this.de === 'semente' ? (p?.semente ?? 0) : (p?.credito ?? 0);
    pan.appendChild(
      this.stepper(`${this.troca} ${moedaCurta(this.de)}`, (d) => {
        this.troca = Math.max(1, this.troca + d);
        this.quote();
      }, [10, 100]),
    );
    const tudo = button(`Tudo (${saldo})`, 'sec', () => {
      this.troca = Math.max(1, saldo);
      this.quote();
    });
    pan.appendChild(tudo);
    const c = ex?.cotacao;
    if (c && c.de === this.de && c.quantidade === this.troca) pan.appendChild(el('div', 'f4-grande', `Você recebe ${c.recebe} ${moedaNome(c.para, c.recebe)} (taxa ${c.taxa})`));
    const ok = button('Trocar', 'ok', () => {
      this.gc.exchangeMoney(this.de, this.troca);
      this.lastQuote = '';
    });
    ok.disabled = saldo < this.troca;
    pan.appendChild(ok);
    box.appendChild(pan);
  }

  // ---- casa ----

  private renderHouse(box: HTMLDivElement): void {
    const g = this.gc.game;
    const p = g.profile;
    const h = g.house;
    // a casa do servidor; sem casa (o perfil diz), as opções para conseguir uma
    if (h && (h.somenteLeitura || p?.casa)) return this.renderHouseView(box, h);
    box.appendChild(el('h1', 'sombra', 'Moradia'));
    const pan = el('div', 'f3-painel');
    if (p?.casa) pan.appendChild(el('div', 'sub', 'Carregando...'));
    else if (p?.side === 'direita') {
      const v = valorAluguel('capsula');
      // SUGESTÃO: textos da moradia sem casa
      pan.appendChild(el('div', 'sub', 'Sem moradia. Os prédios de cápsulas têm vaga (sempre têm).'));
      pan.appendChild(button(`Alugar cápsula (${v} Cr por ciclo)`, 'ok', () => this.gc.rentCapsule('capsula')));
      if ((p.divida ?? 0) > 0) pan.appendChild(button(`Pagar dívida (${p.divida} Cr)`, '', () => this.gc.payDebt()));
    } else {
      pan.appendChild(el('div', 'sub', 'Sem moradia. A Assembleia tem uma lista para isso.'));
      pan.appendChild(button('Entrar na lista de espera', 'ok', () => this.gc.joinWaitingList()));
    }
    box.appendChild(pan);
  }

  private renderHouseView(box: HTMLDivElement, h: S2C_CasaInfo): void {
    const own = !h.somenteLeitura;
    box.appendChild(el('h1', 'sombra', own ? h.name : `Casa de ${h.donoNome}`));
    const info: string[] = [`${h.moveis.length}/${h.moveisMax} móveis`, `descanso +${h.descansoPct}%`];
    if (own && h.espera) info.push(`lista de espera: ${h.espera} ciclos`);
    if (own && h.aluguel) info.push(`aluguel ${h.aluguel} Cr`);
    if (own && (h.atraso ?? 0) > 0) info.push(`ATRASO ${h.atraso}`);
    box.appendChild(el('div', 'sub', info.join(' - ')));
    // a grade
    const wrap = el('div', 'f4-casa');
    const cv = el('canvas', 'px');
    wrap.appendChild(cv);
    box.appendChild(wrap);
    this.drawHouse(cv, h);
    if (own && this.decorar) {
      cv.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        const r = cv.getBoundingClientRect();
        if (this.houseArt) this.onHouseTap(h, tileAt(ev.clientX - r.left, ev.clientY - r.top, r.width, r.height, this.houseArt));
      });
    }
    if (!own) return;
    if (this.catalogo) return this.renderCatalog(box);
    const acoes = el('div', 'f3-botoes');
    if (this.decorar) {
      // guardados: tocar escolhe, tocar no chão coloca
      const counts = new Map<string, number>();
      for (const id of h.guardados ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
      const strip = el('div', 'f4-guardados');
      for (const [id, n] of counts) {
        const nome = getData().furnitureById.get(id)?.name ?? id;
        const b = button(`${nome}${n > 1 ? ` x${n}` : ''}`, this.selGuardado === id ? 'on' : 'sec', () => {
          this.selGuardado = this.selGuardado === id ? null : id;
          this.selUid = null;
        });
        strip.appendChild(b);
      }
      if (counts.size === 0) strip.appendChild(el('div', 'sub', 'Nada guardado. Compre móveis ou tire algum da casa.'));
      box.appendChild(strip);
      const sel = this.selUid !== null ? h.moveis.find((m) => m.uid === this.selUid) : undefined;
      // SUGESTÃO: dica do modo decorar
      box.appendChild(el('div', 'sub', this.selGuardado ? 'Toque no chão para colocar.' : sel ? `${sel.name}: toque no chão para mover.` : 'Toque num móvel guardado ou na casa.'));
      if (sel) {
        acoes.appendChild(button('Girar', '', () => this.gc.rotateFurniture(sel.uid)));
        acoes.appendChild(
          button('Tirar', '', () => {
            this.gc.removeFurniture(sel.uid);
            this.selUid = null;
          }),
        );
      }
      acoes.appendChild(button('Comprar móveis', '', () => (this.catalogo = true)));
      acoes.appendChild(
        button('Pronto', 'ok', () => {
          this.decorar = false;
          this.selGuardado = null;
          this.selUid = null;
        }),
      );
    } else {
      acoes.appendChild(button('Decorar', 'ok', () => (this.decorar = true)));
      acoes.appendChild(button(`Visitas: ${VISIT_LABEL[h.visitas] ?? h.visitas}`, 'sec', () => this.gc.setVisits(nextVisit(h.visitas))));
      if ((h.atraso ?? 0) > 0 || (this.gc.game.profile?.divida ?? 0) > 0) acoes.appendChild(button('Pagar dívida', '', () => this.gc.payDebt()));
      if (h.espera && devShortcuts()) acoes.appendChild(button('Andar a fila (teste)', 'sec', () => this.gc.advanceWaitingList()));
    }
    box.appendChild(acoes);
  }

  private renderCatalog(box: HTMLDivElement): void {
    const p = this.gc.game.profile;
    const list = this.list(box);
    for (const f of furnitureCatalog(p?.side)) {
      const b = button(`${f.preco} ${moedaCurta(f.moeda)}`, 'ok', () => {
        this.gc.buyFurniture(f.id, f.moeda);
        this.selGuardado = f.id;
        this.selUid = null;
        this.catalogo = false;
      });
      this.row(list, f.nome, `${f.w}x${f.h}${f.parede ? ', de parede' : ''} - ${f.piada}`, b);
    }
    const acoes = el('div', 'f3-botoes');
    acoes.appendChild(button('Voltar', 'sec', () => (this.catalogo = false)));
    box.appendChild(acoes);
  }

  private onHouseTap(h: S2C_CasaInfo, t: { x: number; y: number } | null): void {
    if (!t) return;
    if (this.selGuardado) {
      const id = this.selGuardado;
      const mv = getData().furnitureById.get(id);
      this.gc.placeFurniture(id, t.x, mv?.parede ? 0 : t.y, 0);
      this.selGuardado = (h.guardados ?? []).filter((x) => x === id).length > 1 ? id : null;
      this.shownKey = '';
      return;
    }
    const hit = furnitureAt(h.moveis, t.x, t.y);
    if (hit) {
      this.selUid = hit.uid === this.selUid ? null : hit.uid;
      this.shownKey = '';
      return;
    }
    if (this.selUid !== null) {
      const sel = h.moveis.find((m) => m.uid === this.selUid);
      if (sel) this.gc.moveFurniture(sel.uid, t.x, sel.parede ? 0 : t.y);
      this.shownKey = '';
    }
  }

  /** Interior e móveis da arte da Fase 4; sem arte, uma grade simples. */
  private drawHouse(cv: HTMLCanvasElement, h: S2C_CasaInfo): void {
    const scene = this.scene();
    const S = 2;
    let drawn = false;
    if (scene) {
      try {
        const it = this.art.interior(scene, h.tipo, h.w, h.h);
        this.houseArt = { w: it.w, h: it.h, floorX: it.floorX, floorY: it.floorY, tilesW: it.tilesW, tilesH: it.tilesH };
        cv.width = it.w * S;
        cv.height = it.h * S;
        const ctx = cv.getContext('2d');
        if (ctx && blit(scene, ctx, it.key, undefined, 0, 0, S)) {
          const fs = h.moveis
            .map((m) => ({ m, a: this.art.furniture(scene, m.id, m.rot) }))
            .sort((a, b) => (a.a.flat !== b.a.flat ? (a.a.flat ? -1 : 1) : a.a.wall !== b.a.wall ? (a.a.wall ? -1 : 1) : a.m.y + a.a.footH - (b.m.y + b.a.footH)));
          for (const { m, a } of fs) blit(scene, ctx, a.key, a.frame, (it.floorX + m.x * 32) * S, (it.floorY + m.y * 32 - a.up) * S, S);
          this.drawSelection(ctx, h, it.floorX, it.floorY, S);
          drawn = true;
        }
      } catch {
        drawn = false;
      }
    }
    if (!drawn) this.drawPlainHouse(cv, h);
  }

  private drawSelection(ctx: CanvasRenderingContext2D, h: S2C_CasaInfo, fx: number, fy: number, S: number): void {
    if (!this.decorar) return;
    ctx.strokeStyle = '#ffffff22';
    ctx.lineWidth = 1;
    for (let x = 0; x <= h.w; x++) {
      ctx.beginPath();
      ctx.moveTo((fx + x * 32) * S, fy * S);
      ctx.lineTo((fx + x * 32) * S, (fy + h.h * 32) * S);
      ctx.stroke();
    }
    for (let y = 0; y <= h.h; y++) {
      ctx.beginPath();
      ctx.moveTo(fx * S, (fy + y * 32) * S);
      ctx.lineTo((fx + h.w * 32) * S, (fy + y * 32) * S);
      ctx.stroke();
    }
    const sel = this.selUid !== null ? h.moveis.find((m) => m.uid === this.selUid) : undefined;
    if (sel) {
      ctx.strokeStyle = '#ffd060';
      ctx.lineWidth = 4;
      ctx.strokeRect((fx + sel.x * 32) * S + 2, (fy + sel.y * 32) * S + 2, sel.w * 32 * S - 4, sel.h * 32 * S - 4);
    }
  }

  private drawPlainHouse(cv: HTMLCanvasElement, h: S2C_CasaInfo): void {
    const T = 32, fx = 8, fy = 48;
    this.houseArt = { w: h.w * T + 16, h: h.h * T + 54, floorX: fx, floorY: fy, tilesW: h.w, tilesH: h.h };
    cv.width = this.houseArt.w;
    cv.height = this.houseArt.h;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = h.side === 'direita' ? '#2a2a3a' : '#6a4a2a';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = h.side === 'direita' ? '#3a3a4e' : '#a8804a';
    ctx.fillRect(fx, fy, h.w * T, h.h * T);
    for (const m of h.moveis) {
      ctx.fillStyle = m.parede ? '#4a7ac8' : '#c8a050';
      ctx.fillRect(fx + m.x * T + 2, fy + m.y * T + 2, m.w * T - 4, m.h * T - 4);
      ctx.fillStyle = '#140c16';
      ctx.font = '10px sans-serif';
      ctx.fillText(m.name.slice(0, 8), fx + m.x * T + 4, fy + m.y * T + 14);
    }
    this.drawSelection(ctx, h, fx, fy, 1);
  }
}

/** Atalhos de teste (andar a fila) só no offline ou com ?dev=1. */
function devShortcuts(): boolean {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '');
    return q.has('offline') || q.has('dev');
  } catch {
    return false;
  }
}

/** Desenha um quadro de textura do Phaser num contexto 2D, em escala inteira. */
function blit(scene: Phaser.Scene, ctx: CanvasRenderingContext2D, key: string, frame: string | undefined, dx: number, dy: number, scale: number): boolean {
  if (!scene.textures.exists(key)) return false;
  const tex = scene.textures.get(key);
  const f = frame !== undefined && tex.has(frame) ? tex.get(frame) : tex.get();
  const src = f.source.image as CanvasImageSource | undefined;
  if (!src) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, f.cutX, f.cutY, f.cutWidth, f.cutHeight, dx, dy, f.cutWidth * scale, f.cutHeight * scale);
  return true;
}
