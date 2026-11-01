/**
 * Chegada do barco no cais (cena curta em DOM, por cima do mundo). A travessia de verdade é jogável
 * no mapa do barco (game/barco.ts); esta cena só fecha a viagem: o barco encosta na margem escolhida
 * com a fala de chegada do Seu Jacó, enquanto o mapa da margem carrega por trás. Tocar pula.
 *
 * Desenho em pixel num canvas pequeno escalado sem suavizar: rio com brilho, as duas margens nas
 * paletas dos docs (Esquerda verde, terra e madeira; Direita neon sobre concreto), o barco com o
 * boneco e a fumaça da usina ao fundo.
 */
import { getData } from '@pqp/shared';
import { el } from './styles';

// SUGESTÃO: a chegada dura 2,5 s (a viagem já foi jogada no barco); cada fala fica 2,3 s.
export const BOAT_MS = 2500;
export const BOAT_LINE_MS = 2300;
const W = 96;
const H = 128;

const CSS = `
#pqp-ui .f5-barco { position: absolute; inset: 0; z-index: 10; pointer-events: auto; background: #0d0b10; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
#pqp-ui .f5-barco canvas { width: min(84vw, 360px); aspect-ratio: ${W} / ${H}; image-rendering: pixelated; border: 3px solid #140c16; box-shadow: 0 0 0 3px #6a4a70; }
#pqp-ui .f5-barco .fala { max-width: min(88vw, 380px); min-height: 60px; padding: 8px 12px; background: #fff6e0; color: #140c16; border: 3px solid #140c16; font-size: 15px; }
#pqp-ui .f5-barco .fala b { display: block; font-size: 12px; color: #6a3a70; }
#pqp-ui .f5-barco .pula { font-size: 12px; color: #c8c0d0; }
`;

let cssDone = false;
function injectCss(): void {
  if (cssDone || typeof document === 'undefined') return;
  const st = document.createElement('style');
  st.id = 'pqp-ui-f5-barco-css';
  st.textContent = CSS;
  document.head.appendChild(st);
  cssDone = true;
}

/** Falas da travessia: as do guia nos dados (saudação, dica) e uma de chegada. */
export function boatLines(guideId: string | null, side: string | null): { nome: string; texto: string }[] {
  const g = guideId ? getData().guides.guias.find((x) => x.id === guideId) : undefined;
  const nome = g?.name ?? (side === 'direita' ? 'IA de bolso' : 'Espírito guia');
  const of = (sit: string) => g?.falas.find((f) => f.situacao === sit)?.texto;
  const out: { nome: string; texto: string }[] = [];
  const a = of('saudacao');
  if (a) out.push({ nome, texto: a });
  const b = of('aleatoria') ?? of('dica_combate');
  if (b) out.push({ nome, texto: b });
  // SUGESTÃO: fala de chegada do Seu Jacó
  out.push({ nome: 'Seu Jacó', texto: side === 'direita' ? 'Torre do Consórcio à vista. A passagem foi cortesia; o resto é por assinatura.' : 'Casa da Assembleia à vista. Desce devagar que o cais é de mutirão.' });
  return out;
}

export class BoatScene {
  private box: HTMLDivElement | null = null;
  private cv: HTMLCanvasElement | null = null;
  private fala: HTMLDivElement | null = null;
  private start = 0;
  private side: 'esquerda' | 'direita' = 'esquerda';
  private lines: { nome: string; texto: string }[] = [];
  private lineIdx = -1;

  constructor(private readonly root: HTMLElement) {
    injectCss();
  }

  get isOpen(): boolean {
    return this.box !== null;
  }

  play(side: string | null, guideId: string | null, now: number): void {
    this.close();
    this.side = side === 'direita' ? 'direita' : 'esquerda';
    // só a fala de chegada: o guia já falou no barco
    this.lines = boatLines(guideId, side).slice(-1);
    this.lineIdx = -1;
    this.start = now;
    const box = el('div', 'f5-barco');
    const cv = el('canvas', 'px');
    cv.width = W;
    cv.height = H;
    box.appendChild(cv);
    this.fala = el('div', 'fala');
    box.appendChild(this.fala);
    // SUGESTÃO: dica de pular
    box.appendChild(el('div', 'pula', 'Toque para pular'));
    box.addEventListener('click', (ev) => {
      ev.preventDefault();
      this.close();
    });
    this.root.appendChild(box);
    this.box = box;
    this.cv = cv;
  }

  close(): void {
    this.box?.remove();
    this.box = null;
    this.cv = null;
    this.fala = null;
  }

  update(now: number): void {
    if (!this.box || !this.cv) return;
    const t = now - this.start;
    if (t >= BOAT_MS) {
      this.close();
      return;
    }
    const li = Math.min(this.lines.length - 1, Math.floor(t / BOAT_LINE_MS));
    if (li !== this.lineIdx && this.fala) {
      this.lineIdx = li;
      const l = this.lines[li];
      this.fala.innerHTML = '';
      if (l) {
        this.fala.appendChild(el('b', '', l.nome));
        this.fala.appendChild(el('span', '', l.texto));
      }
    }
    // começa no fim da viagem: o barco já vem perto da margem e encosta
    this.draw(0.6 + (0.4 * t) / BOAT_MS, t);
  }

  /** Um quadro: k = 0 (saindo do Delta, embaixo) a 1 (chegando na margem). */
  private draw(k: number, t: number): void {
    const ctx = this.cv!.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const px = (x: number, y: number, w: number, h: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), w, h);
    };
    // rio
    px(0, 0, W, H, '#2a5a7a');
    for (let y = 0; y < H; y += 4) for (let x = (y * 7) % 11; x < W; x += 13) if (((x + y + Math.floor(t / 180)) & 7) === 0) px(x, y, 3, 1, '#6aa8c8');
    // margem esquerda (verde, terra, madeira) e direita (concreto e neon)
    px(0, 0, 18, H, '#4a7a34');
    px(16, 0, 3, H, '#8a6a3a');
    for (let y = 6; y < H; y += 18) {
      px(4, y, 8, 8, '#2e5a22');
      px(7, y + 8, 2, 4, '#6a4a2a');
    }
    px(W - 18, 0, 18, H, '#5a5a66');
    px(W - 19, 0, 2, H, '#3a3a46');
    for (let y = 4; y < H; y += 16) {
      px(W - 14, y, 10, 10, '#2a2a3a');
      px(W - 13, y + 2, 8, 2, (Math.floor(t / 300) + y) % 3 === 0 ? '#ff40c8' : '#40e8ff');
    }
    // ponte e usina ao fundo (fumaça)
    px(18, 8, W - 36, 4, '#7a7a86');
    for (let x = 22; x < W - 22; x += 8) px(x, 12, 2, 6, '#5a5a66');
    const fy = 2 - ((t / 90) % 6);
    px(W / 2 - 1, fy, 3, 3, '#c8c0d0');
    px(W / 2 + 2, fy - 3, 2, 2, '#a098a8');
    // barco: sai de baixo no meio e sobe em diagonal para a margem escolhida
    const toX = this.side === 'esquerda' ? 22 : W - 42;
    const x = W / 2 - 10 + (toX - (W / 2 - 10)) * k;
    const y = H - 22 - (H - 52) * k + Math.sin(t / 220) * 1.2;
    // rastro
    px(x + 4, y + 14, 12, 1, '#a8d8f0');
    px(x + 7, y + 17, 6, 1, '#a8d8f0');
    // casco
    px(x, y + 8, 20, 4, '#6a4a2a');
    px(x + 2, y + 12, 16, 2, '#4a3018');
    px(x, y + 8, 20, 1, '#a07a4a');
    // boneco (cabeça grande, estilo dos bonecos) e o barqueiro com a vara
    px(x + 5, y + 1, 6, 5, '#e8b890');
    px(x + 5, y, 6, 2, '#3a2418');
    px(x + 6, y + 6, 4, 3, this.side === 'esquerda' ? '#6aa040' : '#40c8e8');
    px(x + 13, y + 3, 4, 4, '#c89870');
    px(x + 13, y + 7, 4, 2, '#8a5a3a');
    px(x + 18, y - 4, 1, 14, '#c8a050');
  }
}
