/**
 * Caixa de diálogo embaixo: retrato, nome, fala (letra por letra) e botões de opção.
 * Toque na caixa: completa a fala; com a fala inteira e sem opção além de "tchau", fecha.
 */
import type * as Phaser from 'phaser';
import type { ArtApi } from '../../art/contract';
import type { S2C_Dialogo } from '@pqp/shared/net';
import { button, el } from './styles';
import { drawFrame } from './sprite';

// SUGESTÃO: 45 letras por segundo na fala.
export const DIALOG_CPS = 45;

export interface DialogDeps {
  scene: () => Phaser.Scene | undefined;
  art: ArtApi;
  onOption: (npcId: string, opcao: string) => void;
  onClose: () => void;
  /** Fase 4: botões a mais do cliente (abrir a loja, o câmbio, a feira...) para este NPC */
  extras?: (npcId: string) => { texto: string; onTap: () => void }[];
}

export class DialogBox {
  private box: HTMLDivElement | null = null;
  private fala: HTMLDivElement | null = null;
  private opsBox: HTMLDivElement | null = null;
  private d: S2C_Dialogo | null = null;
  private t0 = 0;
  private full = false;
  private portraitDone = false;
  private cv: HTMLCanvasElement | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly deps: DialogDeps,
  ) {}

  get isOpen(): boolean {
    return this.box !== null;
  }

  get current(): S2C_Dialogo | null {
    return this.d;
  }

  open(d: S2C_Dialogo, now: number): void {
    this.close();
    this.d = d;
    this.t0 = now;
    this.full = d.fala.length === 0;
    this.portraitDone = false;
    const box = el('div', 'dlg painel');
    const topo = el('div', 'dlg-topo');
    const ret = el('div', 'dlg-retrato');
    const cv = el('canvas', 'px');
    ret.appendChild(cv);
    this.cv = cv;
    topo.appendChild(ret);
    const col = el('div', '');
    col.style.flex = '1';
    col.appendChild(el('div', 'dlg-nome sombra', d.nome));
    const fala = el('div', 'dlg-fala sombra', '');
    this.fala = fala;
    col.appendChild(fala);
    // Fase 3: o bordão do treinador (vira emote) e a missão da ala que ele dá
    if (d.bordao) {
      const b = el('div', 'dlg-toque', `Bordão: "${d.bordao}"${d.emote?.novo ? ' (novo emote!)' : ''}`);
      b.style.textAlign = 'left';
      col.appendChild(b);
    }
    if (d.missaoAla) {
      const m = el('div', 'dlg-toque', `${d.missaoAla.estado === 'ativa' ? 'Em andamento' : 'Missão'}: ${d.missaoAla.name}`);
      m.style.textAlign = 'left';
      col.appendChild(m);
    }
    topo.appendChild(col);
    box.appendChild(topo);
    const ops = el('div', 'dlg-ops');
    this.opsBox = ops;
    box.appendChild(ops);
    // SUGESTÃO: dica de toque
    box.appendChild(el('div', 'dlg-toque', 'toque para continuar'));
    box.addEventListener('click', () => this.tap());
    this.box = box;
    this.root.appendChild(box);
  }

  private tap(): void {
    if (!this.d) return;
    if (!this.full) {
      this.full = true;
      return;
    }
    if (this.d.opcoes.every((o) => o.tipo === 'tchau')) this.deps.onClose();
  }

  private renderOptions(): void {
    const d = this.d!;
    const ops = this.opsBox!;
    ops.innerHTML = '';
    for (const x of this.deps.extras?.(d.npc) ?? []) ops.appendChild(button(x.texto, 'ok', x.onTap));
    for (const o of d.opcoes) {
      ops.appendChild(
        button(o.texto, o.tipo === 'tchau' ? 'sec' : o.tipo === 'travessia' || o.tipo === 'escolher_ala' ? 'ok' : '', () => {
          if (o.tipo === 'tchau') this.deps.onClose();
          else this.deps.onOption(d.npc, o.id);
        }),
      );
    }
  }

  close(): void {
    this.box?.remove();
    this.box = null;
    this.d = null;
    this.fala = null;
    this.opsBox = null;
    this.cv = null;
  }

  update(now: number): void {
    const d = this.d;
    if (!d || !this.fala) return;
    if (!this.portraitDone && this.cv) {
      const scene = this.deps.scene();
      if (scene) {
        try {
          const key = this.deps.art.portrait(scene, d.npc);
          this.portraitDone = drawFrame(scene, this.cv, key, undefined, 1);
        } catch {
          this.portraitDone = true;
        }
      }
    }
    const n = this.full ? d.fala.length : Math.min(d.fala.length, Math.floor(((now - this.t0) / 1000) * DIALOG_CPS));
    if (n >= d.fala.length) this.full = true;
    const txt = d.fala.slice(0, n);
    if (this.fala.textContent !== txt) this.fala.textContent = txt;
    if (this.full && this.opsBox && this.opsBox.childElementCount === 0 && (d.opcoes.length > 0 || (this.deps.extras?.(d.npc).length ?? 0) > 0)) this.renderOptions();
  }
}
