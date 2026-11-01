/**
 * Tela da travessia (nível 8): as duas margens lado a lado, com as paletas e a fala do Seu Jacó;
 * depois a instituição (4 cartões com a classe e uma linha); depois o guia (espíritos na Esquerda,
 * IAs de bolso na Direita); e a confirmação. "Atravessar" manda a mensagem 'travessia'.
 */
import type * as Phaser from 'phaser';
import type { ArtApi } from '../../art/contract';
import type { TravessiaOptions } from '@pqp/shared/game/travessia';
import { back, choice, institutionSwatches, newTravessia, pickGuide, pickInstitution, pickSide, sideOf, sideSwatches, type TravessiaState } from '../travessiaModel';
import { button, el } from './styles';
import { drawFrame } from './sprite';

export interface TravessiaDeps {
  scene: () => Phaser.Scene | undefined;
  art: ArtApi;
  onConfirm: (c: { side: string; institution: string; guide: string }) => void;
  onCancel: () => void;
}

export class TravessiaScreen {
  private box: HTMLDivElement | null = null;
  private s: TravessiaState | null = null;
  private erro: HTMLDivElement | null = null;
  private emblems: { cv: HTMLCanvasElement; id: string }[] = [];
  private waiting = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly deps: TravessiaDeps,
  ) {}

  get isOpen(): boolean {
    return this.box !== null;
  }

  open(opcoes: TravessiaOptions): void {
    this.close();
    this.s = newTravessia(opcoes);
    this.waiting = false;
    this.box = el('div', 'modal');
    this.root.appendChild(this.box);
    this.render();
  }

  close(): void {
    this.box?.remove();
    this.box = null;
    this.s = null;
    this.emblems = [];
  }

  showError(text: string): void {
    this.waiting = false;
    if (this.erro) this.erro.textContent = text;
    this.render();
  }

  private render(): void {
    const s = this.s!;
    const box = this.box!;
    const keepErr = this.erro?.textContent ?? '';
    box.innerHTML = '';
    this.emblems = [];
    const side = sideOf(s);
    // SUGESTÃO: títulos dos passos da travessia
    const titles = { margem: 'De que margem você vai ser?', instituicao: 'Onde você vai entrar?', guia: s.side === 'direita' ? 'Escolha a sua IA de bolso' : 'Escolha o seu espírito guia', confirmar: 'Tudo certo?' } as const;
    box.appendChild(el('h1', 'sombra', titles[s.step]));
    if (!s.opcoes.pode) box.appendChild(el('div', 'erro', s.opcoes.motivo ?? ''));
    const erro = el('div', 'erro', keepErr);
    this.erro = erro;

    if (s.step === 'margem') {
      const row = el('div', 'tv-margens');
      for (const m of s.opcoes.margens) {
        const c = el('div', `tv-margem ${m.side} rola`);
        c.appendChild(el('h2', '', m.name));
        c.appendChild(el('div', 'sub', m.sociedade));
        const cores = el('div', 'tv-cores');
        for (const hex of sideSwatches(m.side)) {
          const sw = el('span');
          sw.style.background = hex;
          cores.appendChild(sw);
        }
        c.appendChild(cores);
        if (m.falaJaco[0]) c.appendChild(el('div', 'tv-fala', `Seu Jacó: "${m.falaJaco[0]}"`));
        const moeda = m.moedaInicial;
        c.appendChild(el('div', 'sub', m.side === 'esquerda' ? `Começa com ${moeda.semente} Semente` : `Começa com ${moeda.credito} Crédito`));
        for (const ex of moeda.extras) c.appendChild(el('div', 'sub', ex));
        c.addEventListener('click', () => {
          if (!s.opcoes.pode) return;
          pickSide(s, m.side);
          this.render();
        });
        row.appendChild(c);
      }
      box.appendChild(row);
    } else if (s.step === 'instituicao' && side) {
      const list = el('div', 'tv-lista rola');
      for (const i of side.instituicoes) {
        const card = el('button', `tv-cartao ${side.side}`);
        card.type = 'button';
        const cv = el('canvas', 'px');
        this.emblems.push({ cv, id: i.id });
        card.appendChild(cv);
        const txt = el('div', '');
        const b = el('b', '', i.name);
        txt.appendChild(b);
        txt.appendChild(el('span', 'cl', i.classeName));
        txt.appendChild(el('p', '', i.predio));
        txt.appendChild(el('p', '', `Entrada: ${i.missaoEntrada}`));
        const cores = el('div', 'tv-cores');
        for (const hex of institutionSwatches(i.id)) {
          const sw = el('span');
          sw.style.background = hex;
          cores.appendChild(sw);
        }
        txt.appendChild(cores);
        card.appendChild(txt);
        card.addEventListener('click', () => {
          pickInstitution(s, i.id);
          this.render();
        });
        list.appendChild(card);
      }
      box.appendChild(list);
    } else if (s.step === 'guia' && side) {
      const list = el('div', 'tv-lista rola');
      for (const g of side.guias) {
        const card = el('button', `tv-cartao ${side.side}`);
        card.type = 'button';
        const txt = el('div', '');
        txt.appendChild(el('b', '', g.name));
        if (g.origem) txt.appendChild(el('span', 'cl', g.origem));
        txt.appendChild(el('p', '', g.bonusTexto));
        if (g.saudacao) txt.appendChild(el('p', '', `"${g.saudacao}"`));
        card.appendChild(txt);
        card.addEventListener('click', () => {
          pickGuide(s, g.id);
          this.render();
        });
        list.appendChild(card);
      }
      box.appendChild(list);
    } else if (s.step === 'confirmar' && side) {
      const inst = side.instituicoes.find((i) => i.id === s.institution);
      const guia = side.guias.find((g) => g.id === s.guide);
      const p = el('div', `tv-margem ${side.side}`);
      p.style.flex = '0 0 auto';
      p.appendChild(el('h2', '', side.name));
      p.appendChild(el('div', 'tv-fala', `${inst?.name ?? ''} (${inst?.classeName ?? ''})`));
      p.appendChild(el('div', 'tv-fala', `Guia: ${guia?.name ?? ''}`));
      // SUGESTÃO: aviso de que a escolha é para valer (troca de lado fica fora do piloto)
      p.appendChild(el('div', 'sub', 'Não tem volta no piloto: a margem é para valer.'));
      box.appendChild(p);
      const spacer = el('div', '');
      spacer.style.flex = '1';
      box.appendChild(spacer);
    }
    box.appendChild(erro);
    const baixo = el('div', 'ed-baixo');
    baixo.appendChild(
      button(s.step === 'margem' ? 'Agora não' : 'Voltar', 'sec', () => {
        if (!back(s)) this.deps.onCancel();
        else this.render();
      }),
    );
    if (s.step === 'confirmar') {
      const ok = button('Atravessar', 'ok', () => {
        const c = choice(s);
        if (!c || this.waiting) return;
        this.waiting = true;
        ok.disabled = true;
        this.deps.onConfirm(c);
      });
      baixo.appendChild(ok);
    }
    box.appendChild(baixo);
  }

  update(): void {
    if (this.emblems.length === 0) return;
    const scene = this.deps.scene();
    if (!scene) return;
    for (const e of this.emblems) {
      try {
        drawFrame(scene, e.cv, this.deps.art.emblem(scene, e.id), undefined, 0.75);
      } catch {
        // sem emblema: o cartão fica só com o texto
      }
    }
    this.emblems = [];
  }
}
