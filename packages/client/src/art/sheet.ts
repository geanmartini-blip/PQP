/**
 * Folha de sprite pura: um buffer de pixels com quadros nomeados. O lado Phaser (index.ts) só
 * sobe o buffer como CanvasTexture e registra os quadros com estes nomes.
 */
import { ANIMS, type AnimName } from './contract';
import { Pix } from './pixel';

export interface FrameRect {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SheetData {
  key: string;
  pix: Pix;
  frames: FrameRect[];
  /** tamanho de cada quadro (todos iguais numa folha de animação) */
  frameW: number;
  frameH: number;
  /**
   * Ponto do quadro que fica no chão, sob o centro da entidade (0..1). Para bonecos e inimigos,
   * o centro de baixo: setOrigin(originX, originY).
   */
  originX: number;
  originY: number;
  /** quadros por animação (para registerAnims) */
  anims?: Partial<Record<AnimName, number>>;
}

export const ANIM_NAMES = Object.keys(ANIMS) as AnimName[];
export const DIRS = [0, 1, 2, 3] as const;
export type Dir = (typeof DIRS)[number];

/** Nome do quadro de animação do contrato: `${anim}_${dir}_${i}`. */
export const frameName = (anim: AnimName, dir: number, i: number) => `${anim}_${dir}_${i}`;

/** Quantos quadros cada animação tem, na ordem de ANIMS. */
export const TOTAL_FRAMES_PER_DIR = ANIM_NAMES.reduce((s, a) => s + ANIMS[a], 0);

/**
 * Monta uma folha de animação com 4 direções a partir de uma função que desenha cada quadro.
 * Layout: uma linha por (anim, dir), até 6 colunas.
 */
export function buildAnimSheet(
  key: string,
  frameW: number,
  frameH: number,
  draw: (anim: AnimName, dir: Dir, i: number) => Pix,
  originX = 0.5,
  originY = 1,
): SheetData {
  const cols = Math.max(...ANIM_NAMES.map((a) => ANIMS[a]));
  const rows = ANIM_NAMES.length * 4;
  const pix = new Pix(cols * frameW, rows * frameH);
  const frames: FrameRect[] = [];
  let row = 0;
  for (const anim of ANIM_NAMES) {
    for (const dir of DIRS) {
      for (let i = 0; i < ANIMS[anim]; i++) {
        const f = draw(anim, dir, i);
        const x = i * frameW;
        const y = row * frameH;
        pix.blit(f, x + Math.floor((frameW - f.w) / 2), y + (frameH - f.h));
        frames.push({ name: frameName(anim, dir, i), x, y, w: frameW, h: frameH });
      }
      row++;
    }
  }
  return { key, pix, frames, frameW, frameH, originX, originY, anims: { ...ANIMS } };
}

/** Empacota quadros soltos (de tamanhos variados) em linhas, com 1 px de folga. */
export function packFrames(key: string, items: { name: string; pix: Pix }[], maxW = 1024): SheetData {
  let x = 0;
  let y = 0;
  let rowH = 0;
  const placed: { name: string; pix: Pix; x: number; y: number }[] = [];
  let width = 0;
  for (const it of items) {
    if (x + it.pix.w > maxW) {
      x = 0;
      y += rowH + 1;
      rowH = 0;
    }
    placed.push({ ...it, x, y });
    x += it.pix.w + 1;
    width = Math.max(width, x);
    rowH = Math.max(rowH, it.pix.h);
  }
  const pix = new Pix(Math.max(1, width), Math.max(1, y + rowH));
  const frames: FrameRect[] = [];
  for (const p of placed) {
    pix.blit(p.pix, p.x, p.y);
    frames.push({ name: p.name, x: p.x, y: p.y, w: p.pix.w, h: p.pix.h });
  }
  const f0 = items[0]?.pix;
  return { key, pix, frames, frameW: f0?.w ?? 0, frameH: f0?.h ?? 0, originX: 0.5, originY: 0.5 };
}

/** Recorta um quadro da folha (para testes e retratos). */
export function frameOf(sheet: SheetData, name: string): Pix {
  const f = sheet.frames.find((r) => r.name === name);
  if (!f) throw new Error(`quadro não existe: ${sheet.key}/${name}`);
  return sheet.pix.crop(f.x, f.y, f.w, f.h);
}
