/**
 * Cartão de habilidade de primeira vez, em DOM: aparece sozinho quando a habilidade entra num botão
 * pela primeira vez, ao lado esquerdo do arco de botões (embaixo, nunca no centro), com uma seta para
 * o botão. Mostra o ícone, o nome, o tipo em palavra simples, o que faz em 1 linha, a recarga, o
 * custo e o gesto ("segure e arraste" nas áreas).
 *
 * Não pega toque (pointer-events: none): o joystick e o segurar-e-arrastar dos botões continuam
 * iguais. Tocar e segurar o botão nunca abre explicação; a lista inteira fica no MENU > Habilidades.
 */
import type * as Phaser from 'phaser';
import { getData } from '@pqp/shared';
import type { ArtApi } from '../../art/contract';
import { browserStorage } from '../../game/runtime';
import { AbilityIntroQueue, type CardSlot } from '../abilityIntro';
import { centerZone } from '../layout';
import { abilityCardText } from '../progressModel';
import { el } from './styles';
import { drawFrame } from './sprite';

export interface CardButton {
  id: string | undefined;
  /** centro e raio do botão em px de CSS */
  x: number;
  y: number;
  r: number;
}

export interface CardFrame {
  slots: Record<CardSlot, CardButton>;
  free: boolean;
  cw: number;
  ch: number;
  /** nome do recurso da classe (Fôlego, Bateria...) para o custo */
  resourceName?: string;
  side?: 'esquerda' | 'direita' | null;
}

export class AbilityCard {
  readonly queue = new AbilityIntroQueue(browserStorage());
  private readonly box: HTMLDivElement;
  private shown = '';
  private icon: { cv: HTMLCanvasElement; id: string } | null = null;

  constructor(
    root: HTMLElement,
    private readonly art: ArtApi,
    private readonly scene: () => Phaser.Scene | undefined,
  ) {
    this.box = el('div', 'hab-cartao');
    this.box.style.display = 'none';
    root.appendChild(this.box);
  }

  /** O cartão está na tela agora (a seta do tutorial espera: as duas setas se cruzavam em cima do 1). */
  get visible(): boolean {
    return this.box.style.display !== 'none' && this.queue.cur !== null;
  }

  /** O jogador usou o botão: o cartão dele some. */
  used(slot: CardSlot): void {
    this.queue.used(slot);
  }

  update(now: number, f: CardFrame): void {
    const ids: Partial<Record<CardSlot, string | undefined>> = {};
    for (const s of Object.keys(f.slots) as CardSlot[]) ids[s] = f.slots[s].id;
    const cur = this.queue.update(now, ids, f.free);
    const ab = cur ? getData().abilities.get(cur.id) : undefined;
    if (!cur || !ab) {
      if (this.box.style.display !== 'none') this.box.style.display = 'none';
      this.shown = '';
      return;
    }
    const b = f.slots[cur.slot];
    const key = `${cur.slot}|${cur.id}|${Math.round(b.x)}|${Math.round(b.y)}|${f.cw}`;
    if (key !== this.shown) {
      this.shown = key;
      this.render(ab.id, f);
      this.place(b, f);
    }
    this.box.style.display = '';
    this.drawIcon();
  }

  private render(id: string, f: CardFrame): void {
    const ab = getData().abilities.get(id)!;
    const t = abilityCardText(ab, f.resourceName, f.side);
    this.box.innerHTML = '';
    const cv = el('canvas', 'px');
    cv.width = 48;
    cv.height = 48;
    this.box.appendChild(cv);
    this.icon = { cv, id };
    const col = el('div', 'col');
    const h = el('div', '');
    h.appendChild(el('b', '', t.name));
    h.appendChild(el('span', 'tag', t.tipo));
    col.appendChild(h);
    if (t.linha) col.appendChild(el('div', 'l', t.linha));
    if (t.numeros) col.appendChild(el('div', 'n', t.numeros));
    // SUGESTÃO: o gesto só aparece nas áreas (tocar é o padrão)
    if (t.gesto !== 'Toque') col.appendChild(el('div', 'g', 'Segure e arraste para posicionar'));
    this.box.appendChild(col);
  }

  /** À esquerda do arco, na altura do botão, abaixo da zona livre do centro e dentro da tela. */
  private place(b: CardButton, f: CardFrame): void {
    const xs = Object.values(f.slots).filter((s) => s.id);
    const arcLeft = Math.min(...xs.map((s) => s.x - s.r));
    const right = Math.max(120, arcLeft - 14);
    const w = Math.min(260, right - 8);
    const s = this.box.style;
    s.left = `${Math.round(right - w)}px`;
    s.width = `${Math.round(w)}px`;
    // mede a altura já com o texto
    s.top = '0px';
    s.display = '';
    const h = this.box.offsetHeight || 80;
    const z = centerZone(f.cw, f.ch);
    const minTop = z.y + z.h + 8;
    const maxTop = f.ch - h - 8;
    const top = Math.max(minTop, Math.min(maxTop, b.y - h / 2));
    s.top = `${Math.round(top)}px`;
    // a seta aponta para a altura do botão
    s.setProperty('--seta', `${Math.round(Math.max(10, Math.min(h - 10, b.y - top)))}px`);
  }

  private drawIcon(): void {
    const ic = this.icon;
    const scene = this.scene();
    if (!ic || !scene) return;
    try {
      if (drawFrame(scene, ic.cv, this.art.icon(scene, ic.id), undefined, 1)) this.icon = null;
    } catch {
      this.icon = null;
    }
  }
}
