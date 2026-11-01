/**
 * Telas da Fase 5 em DOM, com botões grandes:
 * - mochila e equipamento (6 slots), benzer ou calibrar, filtro de raridade do saque;
 * - editor de Doutrina (até 5 cartas, a ordem é a prioridade);
 * - quadro do plantão no QG (levar e dispensar plantonistas);
 * - masmorra: botão de entrada, faixa do andar atual, escada e escolha da sala de evento;
 * - faixa no topo com os avisos do mapa (world_event da IA de facção);
 * - painel dos pontos de controle e da influência.
 *
 * Nada aqui decide regra: as telas mostram o que o servidor mandou ('itens_info', 'doutrina_info',
 * 'plantao_info', 'masmorra_info', 'faccao_info', 'aviso_mapa') e mandam os pedidos.
 */
import type * as Phaser from 'phaser';
import { getData } from '@pqp/shared';
import type { DoctrineCard } from '@pqp/shared/sim';
import type { S2C_AvisoMapa } from '@pqp/shared/net';
import type { ItemView } from '@pqp/shared/game/equipment';
import type { ArtApi } from '../../art/contract';
import type { GameClient } from '../../game/GameClient';
import {
  ACTION_LABEL,
  bumpCond,
  cardText,
  COND_LABEL,
  cycleAction,
  cycleButton,
  cycleCond,
  fase5Spots,
  moveCard,
  newCard,
  RARITY_LABEL,
  rarityCss,
  SLOT_LABEL,
  spotText,
  statsText,
  type ActionId,
  type CondId,
  type Fase5Spot,
} from '../fase5Model';
import { button, el } from './styles';
import { drawFrame } from './sprite';

// SUGESTÃO: cada aviso do mapa fica 5 s na faixa; o painel da facção se atualiza a cada 5 s.
export const MAP_ALERT_MS = 5000;
export const FACTION_REFRESH_MS = 5000;

const CSS = `
#pqp-ui .f5-andar { position: absolute; pointer-events: none; height: 32px; display: flex; align-items: center; gap: 6px; padding: 0 8px; overflow: hidden;
  background: #140c16cc; border: 2px solid #c8a050; box-shadow: 0 2px 0 #0008; white-space: nowrap; }
#pqp-ui .f5-andar b { color: #ffd060; font-size: 13px; }
#pqp-ui .f5-andar span { font-size: 12px; color: #fff6e0; overflow: hidden; text-overflow: ellipsis; }
#pqp-ui .perto-col .btn.pisca { background: #ffd060; animation: pqpPisca 0.9s ease-in-out infinite alternate; }
#pqp-ui .f5-slots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
#pqp-ui .f5-slot { pointer-events: auto; min-height: 92px; border: 3px solid #140c16; background: #2a1e30; color: #fff6e0; font: bold 12px 'Trebuchet MS', Verdana, sans-serif;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 4px; box-shadow: inset 0 0 0 3px var(--cor, #4a3a52); cursor: pointer; touch-action: manipulation; text-align: center; }
#pqp-ui .f5-slot.sel { outline: 3px solid #ffd060; }
#pqp-ui .f5-slot canvas { width: 48px; height: 48px; image-rendering: pixelated; }
#pqp-ui .f5-slot small { color: #c8c0d0; font-weight: normal; font-size: 11px; }
#pqp-ui .f5-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 3px solid #140c16; background: #3a2a40; box-shadow: inset 4px 0 0 var(--cor, #888); }
#pqp-ui .f5-item canvas { flex: 0 0 auto; width: 48px; height: 48px; image-rendering: pixelated; }
#pqp-ui .f5-item .col { flex: 1; min-width: 0; font-size: 13px; }
#pqp-ui .f5-item b { color: var(--cor, #ffe8a0); font-size: 14px; }
#pqp-ui .f5-item small { display: block; color: #c8c0d0; font-size: 12px; }
#pqp-ui .f5-item .btn { flex: 0 0 auto; min-width: 84px; }
#pqp-ui .f5-filtro { display: flex; gap: 4px; flex-wrap: wrap; }
#pqp-ui .f5-filtro .btn { flex: 1 1 20%; min-height: 44px; font-size: 13px; padding: 4px; }
#pqp-ui .f5-filtro .btn.on { background: #ffd060; }
#pqp-ui .f5-carta { padding: 8px; border: 3px solid #140c16; background: #3a2a40; display: flex; flex-direction: column; gap: 6px; }
#pqp-ui .f5-carta .topo { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #ffd060; }
#pqp-ui .f5-carta .lin { display: flex; gap: 6px; align-items: center; }
#pqp-ui .f5-carta .lin > .btn:first-of-type { flex: 1; text-align: left; }
#pqp-ui .f5-carta .rot { flex: 0 0 34px; font-size: 12px; font-weight: bold; color: #c8c0d0; }
#pqp-ui .f5-carta .mini { min-width: 44px; padding: 4px 6px; }
#pqp-ui .f5-carta .frase { font-size: 12px; color: #d8d0e0; font-style: italic; }
#pqp-ui .f5-barra { position: relative; height: 14px; border: 2px solid #140c16; background: #24182a; overflow: hidden; }
#pqp-ui .f5-barra i { position: absolute; top: 0; bottom: 0; }
#pqp-ui .f5-barra i.e { left: 0; background: #6aa040; }
#pqp-ui .f5-barra i.d { right: 0; background: #40c8e8; }
#pqp-ui .f5-barra i.m { left: 50%; width: 2px; background: #ffd060; }
#pqp-ui .f5-dono { display: inline-block; padding: 1px 6px; font-size: 11px; font-weight: bold; background: #140c16; color: #c8c0d0; margin-left: 6px; }
#pqp-ui .f5-dono.esquerda { color: #b8e090; }
#pqp-ui .f5-dono.direita { color: #80f0ff; }
#pqp-ui .f5-dono.apagao { color: #ffb0a0; }
`;

let cssDone = false;
function injectCss(): void {
  if (cssDone || typeof document === 'undefined') return;
  const st = document.createElement('style');
  st.id = 'pqp-ui-f5-css';
  st.textContent = CSS;
  document.head.appendChild(st);
  cssDone = true;
}

export type Fase5Screen = 'itens' | 'doutrina' | 'plantao' | 'faccao' | 'evento';

export interface Fase5Frame {
  selfTile: { x: number; y: number } | null;
  free: boolean;
  /** Z1: faixa do rastreador (px de CSS): a linha do andar da masmorra entra no lugar dele */
  band?: { x: number; y: number; w: number };
  /** a barra do chefe ocupa a faixa agora */
  bossOn?: boolean;
}

const SLOTS = ['cabeca', 'peito', 'calca', 'arma', 'calcado', 'adorno'] as const;

export class Fase5Ui {
  private modal: HTMLDivElement | null = null;
  private kind: Fase5Screen | null = null;
  private shownKey = '';
  /** botões de perto (plantão, masmorra) e da masmorra (descer, sair): entram na coluna de perto do HUD */
  readonly near: HTMLDivElement;
  private nearSig = '';
  private floorBox: HTMLDivElement;
  private floorSig = '';
  readonly floorBtns: HTMLDivElement;
  private icons: { cv: HTMLCanvasElement; id: string; arch?: string }[] = [];
  // estado das telas (não vem do servidor)
  private selSlot: string | null = null;
  private cards: DoctrineCard[] = [];
  private cardsDirty = false;
  private cardsSrc: unknown = null;
  private lastFaction = 0;
  private eventShown = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly gc: GameClient,
    private readonly art: ArtApi,
    private readonly scene: () => Phaser.Scene | undefined,
  ) {
    injectCss();
    this.near = el('div', 'f5-perto');
    this.near.style.display = 'none';
    root.appendChild(this.near);
    this.floorBtns = el('div', 'f5-andar-bts');
    this.floorBtns.style.display = 'none';
    root.appendChild(this.floorBtns);
    this.floorBox = el('div', 'f5-andar');
    this.floorBox.style.display = 'none';
    root.appendChild(this.floorBox);
  }

  /** A masmorra mostra a linha do andar na faixa do topo (o rastreador de missão sai). */
  get floorLineOn(): boolean {
    return this.floorBox.style.display !== 'none';
  }

  get isOpen(): boolean {
    return this.modal !== null;
  }

  get screen(): Fase5Screen | null {
    return this.kind;
  }

  open(kind: Fase5Screen): void {
    this.close();
    this.kind = kind;
    this.modal = el('div', 'modal');
    this.root.appendChild(this.modal);
    if (kind === 'itens') this.gc.requestItems();
    if (kind === 'doutrina') {
      this.cardsDirty = false;
      this.cardsSrc = null;
      this.cards = (this.gc.game.doctrine?.cards ?? []).map((c) => ({ ...c }));
      this.gc.requestDoctrine();
    }
    if (kind === 'plantao') this.gc.requestDuty();
    if (kind === 'faccao') {
      this.gc.requestFaction();
      this.lastFaction = performance.now();
    }
    this.shownKey = this.dataKey();
    this.render();
  }

  close(): void {
    this.modal?.remove();
    this.modal = null;
    this.kind = null;
    this.shownKey = '';
    this.icons = [];
  }

  /** A cada quadro. */
  update(now: number, f: Fase5Frame): void {
    const g = this.gc.game;
    const p = g.profile;
    this.updateBanner(now);
    const onMargin = !!p && p.criado && p.stage === 'margem';
    this.updateNear(f, onMargin);
    this.updateFloor(f, onMargin);
    // sala de evento na masmorra: abre a escolha uma vez por sala
    const ev = g.dungeon?.ativa ? g.dungeon.evento : undefined;
    const evKey = ev ? `${g.dungeon?.runId}|${g.dungeon?.andar}|${ev.sala}` : '';
    if (ev && evKey !== this.eventShown && f.free && !this.modal) {
      this.eventShown = evKey;
      this.open('evento');
    }
    if (!this.modal) return;
    if (this.kind === 'evento' && !ev) {
      this.close();
      return;
    }
    if (this.kind === 'faccao' && now - this.lastFaction > FACTION_REFRESH_MS) {
      this.lastFaction = now;
      this.gc.requestFaction();
    }
    // Doutrina: a cópia local acompanha o servidor enquanto não foi mexida
    if (this.kind === 'doutrina' && g.doctrine && g.doctrine !== this.cardsSrc) {
      this.cardsSrc = g.doctrine;
      if (!this.cardsDirty) this.cards = g.doctrine.cards.map((c) => ({ ...c }));
    }
    const key = this.dataKey();
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.render();
    }
    this.drawIcons();
  }

  // ---------------------------------------------------------------------------
  // HUD

  private updateNear(f: Fase5Frame, onMargin: boolean): void {
    const g = this.gc.game;
    let spots: Fase5Spot[] = [];
    if (f.free && !this.modal && onMargin && !g.inDungeon && f.selfTile) spots = fase5Spots(this.gc.map, f.selfTile.x, f.selfTile.y, g.profile?.side ?? null);
    this.near.style.display = spots.length > 0 ? '' : 'none';
    const sig = JSON.stringify(spots);
    if (sig === this.nearSig) return;
    this.nearSig = sig;
    this.near.innerHTML = '';
    for (const s of spots) {
      this.near.appendChild(
        button(spotText(s), 'ok', () => {
          if (s.kind === 'masmorra') this.gc.enterDungeon();
          else this.open('plantao');
        }),
      );
    }
  }

  /**
   * Masmorra: a linha do andar (andar, salas, chefe) fica na faixa do rastreador, no topo; os botões
   * (descer a escada, sair) entram na coluna de perto, à direita do FALAR.
   */
  private updateFloor(f: Fase5Frame, onMargin: boolean): void {
    const d = this.gc.game.dungeon;
    const on = !!d?.ativa && onMargin && f.free && !this.modal;
    const line = on && !!f.band && !f.bossOn;
    this.floorBox.style.display = line ? '' : 'none';
    this.floorBtns.style.display = on ? '' : 'none';
    if (!on || !d) return;
    if (f.band) {
      const s = this.floorBox.style;
      s.left = `${Math.round(f.band.x)}px`;
      s.top = `${Math.round(f.band.y)}px`;
      s.maxWidth = `${Math.round(f.band.w)}px`;
    }
    const limpas = (d.salas ?? []).filter((s) => s.limpa).length;
    const sig = JSON.stringify([d.andar, d.nome, d.escadaAberta, d.chefe, limpas, d.salas?.length, d.guardadas, d.grupo?.length]);
    if (sig === this.floorSig) return;
    this.floorSig = sig;
    this.floorBox.innerHTML = '';
    this.floorBox.appendChild(el('b', '', `${d.andar}º andar`));
    // SUGESTÃO: textos da linha do andar (curtos: uma linha só)
    const linhas: string[] = [`salas ${limpas}/${d.salas?.length ?? 0}`];
    if (d.chefe) linhas.push(d.chefe.vencido ? `${d.chefe.nome}: vencido` : `chefe: ${d.chefe.nome}`);
    if ((d.guardadas ?? 0) > 0) linhas.push(`${d.guardadas} guardadas`);
    if ((d.grupo?.length ?? 1) > 1) linhas.push(`grupo de ${d.grupo?.length ?? 1}`);
    this.floorBox.appendChild(el('span', '', linhas.join(' · ')));
    this.floorBtns.innerHTML = '';
    if (d.escadaAberta && d.escada) {
      const esc = d.escada;
      this.floorBtns.appendChild(button('Descer a escada', 'pisca', () => this.gc.goTo(esc.x, esc.y)));
    }
    this.floorBtns.appendChild(button('Sair da masmorra', 'sec', () => this.gc.leaveDungeon()));
  }

  /** Aviso do mapa: entra na fila da faixa de mensagens (Z2), em vez de tapar o quadro de vida. */
  private updateBanner(now: number): void {
    for (let a = this.gc.game.takeMapAlert(); a; a = this.gc.game.takeMapAlert()) this.pushAlert(a, now);
  }

  private pushAlert(a: S2C_AvisoMapa, now: number): void {
    const D = getData();
    const sub: string[] = [];
    if (a.lider) sub.push(D.factionCharactersById.get(a.lider)?.name ?? a.lider);
    if (a.regiao) sub.push(D.regionsById.get(a.regiao)?.name ?? a.regiao);
    this.gc.game.pushToast(a.texto, 'mapa', now, sub.length > 0 ? sub.join(' · ') : undefined, a.tipo === 'apagao' ? 'apagao' : (a.lado ?? ''));
  }

  // ---------------------------------------------------------------------------
  // telas

  private dataKey(): string {
    const g = this.gc.game;
    switch (this.kind) {
      case 'itens':
        return JSON.stringify([g.itens, this.selSlot, g.profile?.credito, g.profile?.archetype]);
      case 'doutrina':
        return JSON.stringify([this.cards, g.doctrine, g.profile?.loadout]);
      case 'plantao':
        return JSON.stringify([g.duty]);
      case 'faccao':
        return JSON.stringify([g.faction]);
      case 'evento':
        return JSON.stringify([g.dungeon?.evento]);
      default:
        return '';
    }
  }

  private render(): void {
    const box = this.modal;
    if (!box || !this.kind) return;
    box.innerHTML = '';
    this.icons = [];
    switch (this.kind) {
      case 'itens':
        this.renderItems(box);
        break;
      case 'doutrina':
        this.renderDoctrine(box);
        break;
      case 'plantao':
        this.renderDuty(box);
        break;
      case 'faccao':
        this.renderFaction(box);
        break;
      case 'evento':
        this.renderEvent(box);
        break;
    }
    if (this.kind !== 'evento') {
      const baixo = el('div', 'ed-baixo');
      baixo.appendChild(button('Fechar', 'sec', () => this.close()));
      box.appendChild(baixo);
    }
    this.drawIcons();
  }

  private icon(id: string): HTMLCanvasElement {
    const cv = el('canvas', 'px');
    cv.width = 48;
    cv.height = 48;
    const arch = this.gc.game.profile?.archetype ?? undefined;
    this.icons.push({ cv, id, ...(arch ? { arch } : {}) });
    return cv;
  }

  private drawIcons(): void {
    const scene = this.scene();
    if (!scene || this.icons.length === 0) return;
    const rest: typeof this.icons = [];
    for (const ic of this.icons) {
      try {
        const key = this.art.itemIcon(scene, ic.id, ic.arch);
        if (!drawFrame(scene, ic.cv, key, undefined, 1)) rest.push(ic);
      } catch {
        // sem arte: fica só o texto
      }
    }
    this.icons = rest;
  }

  // ---- mochila e equipamento ----

  private renderItems(box: HTMLDivElement): void {
    box.appendChild(el('h1', 'sombra', 'Mochila'));
    const v = this.gc.game.itens;
    if (!v) {
      box.appendChild(el('div', 'sub', 'Abrindo a mochila...'));
      return;
    }
    const total = Object.entries(v.total).map(([stat, pct]) => ({ stat, pct }));
    box.appendChild(el('div', 'sub', total.length > 0 ? `Equipado: ${statsText(total)}` : 'Nada equipado ainda. O traje da ala manda no visual; cada peça muda a sua parte.'));
    const slots = el('div', 'f5-slots');
    for (const s of SLOTS) {
      const it = v.equipados[s];
      const b = el('button', `f5-slot${this.selSlot === s ? ' sel' : ''}`);
      b.type = 'button';
      if (it) b.style.setProperty('--cor', rarityCss(it.rarity));
      if (it) b.appendChild(this.icon(it.id));
      b.appendChild(el('span', '', it ? it.name : SLOT_LABEL[s] ?? s));
      b.appendChild(el('small', '', it ? `${SLOT_LABEL[s]} · ${RARITY_LABEL[it.rarity] ?? it.rarity}` : 'vazio'));
      b.addEventListener('click', (ev) => {
        ev.preventDefault();
        this.selSlot = this.selSlot === s ? null : s;
        this.shownKey = '';
      });
      slots.appendChild(b);
    }
    box.appendChild(slots);
    const list = el('div', 'f3-lista');
    box.appendChild(list);
    const sel = this.selSlot ? v.equipados[this.selSlot as (typeof SLOTS)[number]] : undefined;
    if (sel) this.itemRow(list, sel, true);
    // mochila (do slot escolhido primeiro)
    const mochila = [...v.mochila].sort((a, b) => Number(b.slot === this.selSlot) - Number(a.slot === this.selSlot) || a.slot.localeCompare(b.slot));
    if (mochila.length === 0) list.appendChild(el('div', 'sub', 'Mochila vazia. Saque de bando e masmorra cai aqui.'));
    for (const it of mochila) this.itemRow(list, it, false);
    // filtro de raridade da coleta automática
    const fb = el('div', 'f3-bloco');
    fb.appendChild(el('h2', '', 'Saque automático: pegar a partir de'));
    const fl = el('div', 'f5-filtro');
    for (const r of getData().loot.coleta.filtros as readonly string[]) {
      fl.appendChild(button(RARITY_LABEL[r] ?? r, v.filtro === r ? 'on' : 'sec', () => this.gc.setLootFilter(r as 'comum', v.vendaAutomatica)));
    }
    fb.appendChild(fl);
    const L = getData().loot.vendaAutomatica;
    if (L.opcional) {
      fb.appendChild(button(v.vendaAutomatica ? 'Venda automática: ligada' : 'Venda automática: desligada', v.vendaAutomatica ? 'ok' : 'sec', () => this.gc.setLootFilter(v.filtro as 'comum', !v.vendaAutomatica)));
    }
    list.appendChild(fb);
  }

  private itemRow(list: HTMLElement, it: ItemView, vestido: boolean): void {
    const r = el('div', 'f5-item');
    r.style.setProperty('--cor', rarityCss(it.rarity));
    r.appendChild(this.icon(it.id));
    const col = el('div', 'col');
    col.appendChild(el('b', '', `${it.name}${it.melhoria.nivel > 0 ? ` +${it.melhoria.nivel}` : ''}`));
    col.appendChild(el('small', '', `${SLOT_LABEL[it.slot] ?? it.slot} · ${RARITY_LABEL[it.rarity] ?? it.rarity}${it.classLock ? ` · ${getData().classesById.get(it.classLock)?.name ?? it.classLock}` : ''}`));
    if (it.stats.length > 0) col.appendChild(el('small', '', statsText(it.stats)));
    if (it.efeito) col.appendChild(el('small', '', it.efeito));
    if (it.visual) col.appendChild(el('small', '', `Visual: ${it.visual}`));
    if (!vestido && it.motivo) col.appendChild(el('small', '', it.motivo));
    r.appendChild(col);
    const bts = el('div', 'f3-botoes');
    bts.style.flexDirection = 'column';
    if (vestido) bts.appendChild(button('Tirar', 'sec', () => this.gc.unequip(it.slot)));
    else {
      const b = button('Vestir', 'ok', () => this.gc.equip(it.id));
      b.disabled = it.podeVestir === false;
      bts.appendChild(b);
    }
    // benzer (Esquerda) ou calibrar (Direita)
    const m = it.melhoria;
    if (m.processo && m.proximo) {
      const now = Date.now();
      const naFila = m.prontoEm !== undefined && m.prontoEm > now;
      // SUGESTÃO: textos dos botões de melhoria
      const txt = m.processo === 'benzimento' ? (naFila ? `Benzendo (${Math.ceil((m.prontoEm! - now) / 1000)} s)` : 'Benzer') : `Calibrar (${m.proximo.custoCredito ?? 0} Cr)`;
      const b = button(txt, '', () => this.gc.improveItem(m.processo!, it.id));
      b.disabled = naFila;
      bts.appendChild(b);
    } else if (m.processo && m.nivel >= m.max && m.max > 0) bts.appendChild(el('small', '', 'Nível máximo'));
    r.appendChild(bts);
    list.appendChild(r);
  }

  // ---- Doutrina ----

  private setCards(c: DoctrineCard[]): void {
    this.cards = c;
    this.cardsDirty = true;
  }

  private renderDoctrine(box: HTMLDivElement): void {
    const max = this.gc.game.doctrine?.max ?? 5;
    box.appendChild(el('h1', 'sombra', 'Doutrina'));
    // SUGESTÃO: explicação curta da Doutrina
    box.appendChild(el('div', 'sub', `Até ${max} cartas. A de cima manda. Vale no automático, no plantão e na queda de conexão.`));
    const list = el('div', 'f3-lista');
    box.appendChild(list);
    if (this.cards.length === 0) list.appendChild(el('div', 'sub', 'Sem cartas: o automático usa a Doutrina padrão do papel.'));
    this.cards.forEach((c, i) => {
      const card = el('div', 'f5-carta');
      const topo = el('div', 'topo');
      topo.appendChild(el('span', '', `Carta ${i + 1}`));
      const ctl = el('div', 'lin');
      const up = button('▲', 'sec mini', () => this.setCards(moveCard(this.cards, i, -1)));
      up.disabled = i === 0;
      const dn = button('▼', 'sec mini', () => this.setCards(moveCard(this.cards, i, 1)));
      dn.disabled = i === this.cards.length - 1;
      ctl.appendChild(up);
      ctl.appendChild(dn);
      ctl.appendChild(button('✕', 'sec mini', () => this.setCards(this.cards.filter((_, k) => k !== i))));
      topo.appendChild(ctl);
      card.appendChild(topo);
      // SE
      const se = el('div', 'lin');
      se.appendChild(el('span', 'rot', 'SE'));
      se.appendChild(button(COND_LABEL[c.se.t as CondId] ?? c.se.t, '', () => this.setCards(this.cards.map((x, k) => (k === i ? cycleCond(x) : x)))));
      const sx = c.se as Record<string, unknown>;
      if (c.se.t === 'minha_vida_abaixo' || c.se.t === 'aliado_vida_abaixo') this.stepper(se, `${String(sx['pct'])}%`, (d) => this.setCards(this.cards.map((x, k) => (k === i ? bumpCond(x, 'pct', d) : x))));
      card.appendChild(se);
      if (c.se.t === 'inimigos_perto_min') {
        const l2 = el('div', 'lin');
        l2.appendChild(el('span', 'rot', ''));
        this.stepper(l2, `${String(sx['n'])} inimigos`, (d) => this.setCards(this.cards.map((x, k) => (k === i ? bumpCond(x, 'n', d) : x))));
        this.stepper(l2, `${String(sx['raio'])} tiles`, (d) => this.setCards(this.cards.map((x, k) => (k === i ? bumpCond(x, 'raio', d) : x))));
        card.appendChild(l2);
      }
      // FAÇA
      const fa = el('div', 'lin');
      fa.appendChild(el('span', 'rot', 'FAÇA'));
      fa.appendChild(button(ACTION_LABEL[c.faca.t as ActionId] ?? c.faca.t, '', () => this.setCards(this.cards.map((x, k) => (k === i ? cycleAction(x) : x)))));
      if (c.faca.t === 'usar_botao') fa.appendChild(button(`Botão ${c.faca.botao}`, 'sec', () => this.setCards(this.cards.map((x, k) => (k === i ? cycleButton(x) : x)))));
      card.appendChild(fa);
      card.appendChild(el('div', 'frase', cardText(c)));
      list.appendChild(card);
    });
    const acoes = el('div', 'f3-botoes');
    const add = button('+ Carta', '', () => this.setCards([...this.cards, newCard()]));
    add.disabled = this.cards.length >= max;
    acoes.appendChild(add);
    const save = button(this.cardsDirty ? 'Salvar' : 'Salva', 'ok', () => {
      this.gc.setDoctrine(this.cards.map((c) => ({ ...c })));
      this.cardsDirty = false;
      this.shownKey = '';
    });
    save.disabled = !this.cardsDirty;
    acoes.appendChild(save);
    box.appendChild(acoes);
  }

  private stepper(parent: HTMLElement, label: string, on: (d: number) => void): void {
    parent.appendChild(button('−', 'sec mini', () => on(-1)));
    parent.appendChild(el('span', 'rot', label));
    parent.appendChild(button('+', 'sec mini', () => on(1)));
  }

  // ---- plantão ----

  private renderDuty(box: HTMLDivElement): void {
    const d = this.gc.game.duty;
    const qg = d?.qg ? getData().institutions.qgs.find((q) => q.id === d.qg) : undefined;
    box.appendChild(el('h1', 'sombra', 'Quadro do plantão'));
    box.appendChild(el('div', 'sub', qg ? `${qg.name}: quem saiu do jogo fica aqui, lutando pela Doutrina.` : 'Plantão do QG'));
    const list = el('div', 'f3-lista');
    box.appendChild(list);
    if (!d) {
      list.appendChild(el('div', 'sub', 'Lendo o quadro...'));
      return;
    }
    const cheio = d.levados.length + 1 >= d.grupoMax;
    const bl = el('div', 'f3-bloco');
    bl.appendChild(el('h2', '', `No seu grupo (${d.levados.length + 1}/${d.grupoMax})`));
    if (d.levados.length === 0) bl.appendChild(el('p', '', 'Só você. Plantonista dá XP em grupo, com metade para o dono.'));
    list.appendChild(bl);
    for (const v of d.levados) {
      const r = el('div', 'f4-linha');
      const col = el('div', 'col');
      col.appendChild(el('b', '', v.nome));
      col.appendChild(el('small', '', `Nível ${v.nivel} · ${v.ala ?? v.classe ?? ''} · ${v.cartas} cartas`));
      r.appendChild(col);
      r.appendChild(button('Dispensar', 'sec', () => this.gc.releaseOnDuty(v.id)));
      list.appendChild(r);
    }
    const b2 = el('div', 'f3-bloco');
    b2.appendChild(el('h2', '', 'De plantão no QG'));
    if (d.disponiveis.length === 0) b2.appendChild(el('p', '', 'Ninguém de plantão agora. Até o plantão tem fila.'));
    list.appendChild(b2);
    for (const v of d.disponiveis) {
      const r = el('div', 'f4-linha');
      const col = el('div', 'col');
      col.appendChild(el('b', '', v.nome));
      col.appendChild(el('small', '', `Nível ${v.nivel} · ${v.ala ?? v.classe ?? ''} · ${v.cartas} cartas`));
      r.appendChild(col);
      const b = button('Levar', 'ok', () => this.gc.takeOnDuty(v.id));
      b.disabled = cheio;
      r.appendChild(b);
      list.appendChild(r);
    }
    const acoes = el('div', 'f3-botoes');
    if (d.emPlantao !== undefined) {
      acoes.appendChild(button(d.emPlantao ? 'Ao sair: fico de plantão' : 'Ao sair: não fico de plantão', d.emPlantao ? 'ok' : 'sec', () => this.gc.setOwnDuty(!d.emPlantao)));
    }
    acoes.appendChild(button('Minha Doutrina', '', () => this.open('doutrina')));
    box.appendChild(acoes);
  }

  // ---- facção ----

  private renderFaction(box: HTMLDivElement): void {
    const f = this.gc.game.faction;
    box.appendChild(el('h1', 'sombra', 'Pontos de controle'));
    if (!f) {
      box.appendChild(el('div', 'sub', 'Lendo o mapa...'));
      return;
    }
    const min = Math.max(0, Math.ceil((f.proximoTickEm - f.agora) / 60000));
    box.appendChild(el('div', 'sub', `${f.lideres.map((l) => l.nome).join(' x ')} · ciclo ${f.ciclo} · próximo em ${min} min`));
    const pan = el('div', 'f3-painel');
    box.appendChild(pan);
    const bar = (e: number, d: number, limiar?: number) => {
      const b = el('div', 'f5-barra');
      const tot = Math.max(1, limiar ? limiar : e + d);
      const ie = el('i', 'e');
      ie.style.width = `${Math.min(100, (e / tot) * (limiar ? 50 : 100))}%`;
      const id = el('i', 'd');
      id.style.width = `${Math.min(100, (d / tot) * (limiar ? 50 : 100))}%`;
      b.appendChild(ie);
      b.appendChild(id);
      if (limiar) b.appendChild(el('i', 'm'));
      return b;
    };
    for (const r of f.regioes) {
      const bl = el('div', 'f3-bloco');
      const h = el('h2', '', r.nome);
      if (r.apagao) h.appendChild(el('span', 'f5-dono apagao', 'APAGÃO'));
      bl.appendChild(h);
      bl.appendChild(el('p', '', `Energia ${r.energia} · Poluição ${r.poluicao}`));
      bl.appendChild(bar(r.influencia.esquerda, r.influencia.direita));
      bl.appendChild(el('small', '', `Influência: Esquerda ${r.influencia.esquerda} · Direita ${r.influencia.direita}`));
      for (const pt of f.pontos.filter((x) => x.regiao === r.id)) {
        const pp = el('p', '', pt.nome);
        pp.appendChild(el('span', `f5-dono ${pt.dono}`, pt.dono === 'neutra' ? 'neutro' : pt.dono === 'esquerda' ? 'Esquerda' : 'Direita'));
        bl.appendChild(pp);
        bl.appendChild(bar(pt.influencia.esquerda, pt.influencia.direita, f.limiar));
        bl.appendChild(el('small', '', `${pt.influencia.esquerda} x ${pt.influencia.direita} (vira dono com ${f.limiar}, no próximo tick) · saque livre ${pt.saqueDisponivel}`));
      }
      pan.appendChild(bl);
    }
    const ev = el('div', 'f3-bloco');
    ev.appendChild(el('h2', '', 'Avisos recentes'));
    if (f.eventos.length === 0) ev.appendChild(el('p', '', 'Nada ainda. Os líderes estão em reunião.'));
    for (const e of f.eventos) ev.appendChild(el('p', '', e.texto));
    pan.appendChild(ev);
  }

  // ---- sala de evento ----

  private renderEvent(box: HTMLDivElement): void {
    const d = this.gc.game.dungeon;
    const ev = d?.evento;
    const sala = d?.salas?.find((s) => s.idx === ev?.sala);
    box.appendChild(el('h1', 'sombra', sala?.nome ?? 'Sala'));
    box.appendChild(el('div', 'sub', 'Escolha uma:'));
    const list = el('div', 'f3-lista');
    box.appendChild(list);
    for (const o of ev?.opcoes ?? []) {
      const b = button(o.texto, '', () => {
        this.gc.dungeonChoice(ev!.sala, o.id);
        this.close();
      });
      b.style.textAlign = 'left';
      list.appendChild(b);
    }
  }
}
