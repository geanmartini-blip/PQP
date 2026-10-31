/**
 * Letras em pixel. Duas coisas:
 * - microText: "letra miúda" das estampas (1 px por letra, padrão estável por caractere). Num boneco
 *   de 32x48 não cabe texto legível; o que importa é a estampa aparecer e ser sempre a mesma.
 * - FONT_5x7: fonte de 5x7 para números de dano, rótulos da galeria e a fonte bitmap do HUD.
 */
import type { Color } from './pixel';
import type { Pix } from './pixel';

/** Escreve letra miúda dentro de uma caixa (w x linhas), quebrando nas palavras. */
export function microText(pix: Pix, x: number, y: number, w: number, lines: number, text: string, c: Color): void {
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  let cx = 0;
  let line = 0;
  for (const word of words) {
    const len = Math.min(word.length, w);
    if (cx > 0 && cx + len > w) {
      line++;
      cx = 0;
    }
    if (line >= lines) return;
    for (let i = 0; i < len; i++) {
      // cada letra vira 1 pixel; algumas ficam vazadas, estável por caractere
      const code = word.charCodeAt(i);
      if (code % 5 !== 0) pix.put(x + cx, y + line * 2, c);
      cx++;
    }
    cx++;
  }
}

/** Fonte 5x7 (maiúsculas sem acento, dígitos e alguns sinais). Cada letra: 7 linhas de 5 bits. */
const G: Record<string, number[]> = {
  '0': [14, 17, 19, 21, 25, 17, 14],
  '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 2, 4, 8, 31],
  '3': [30, 1, 1, 14, 1, 1, 30],
  '4': [2, 6, 10, 18, 31, 2, 2],
  '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14],
  '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 2, 12],
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [28, 18, 17, 17, 17, 18, 28],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 17, 25, 21, 19, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  '+': [0, 4, 4, 31, 4, 4, 0],
  '-': [0, 0, 0, 31, 0, 0, 0],
  '!': [4, 4, 4, 4, 4, 0, 4],
  '?': [14, 17, 1, 2, 4, 0, 4],
  '%': [24, 25, 2, 4, 8, 19, 3],
  '.': [0, 0, 0, 0, 0, 12, 12],
  ',': [0, 0, 0, 0, 12, 4, 8],
  ':': [0, 12, 12, 0, 12, 12, 0],
  '/': [1, 1, 2, 4, 8, 16, 16],
  '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8],
  x: [0, 0, 17, 10, 4, 10, 17],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

/** Caracteres da fonte, na ordem da textura da fonte bitmap. */
export const FONT_CHARS = ' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+-!?%.,:/()x';
export const FONT_W = 5;
export const FONT_H = 7;

const ACCENTS: Record<string, string> = { Á: 'A', À: 'A', Â: 'A', Ã: 'A', É: 'E', Ê: 'E', Í: 'I', Ó: 'O', Ô: 'O', Õ: 'O', Ú: 'U', Ç: 'C', Ñ: 'N', Å: 'A' };

/** Normaliza para a fonte: maiúsculas e sem acento. */
export function fontText(s: string): string {
  return s
    .toUpperCase()
    .split('')
    .map((ch) => ACCENTS[ch] ?? ch)
    .map((ch) => (G[ch] ? ch : ch === 'X' ? 'X' : ' '))
    .join('');
}

export function drawGlyph(pix: Pix, x: number, y: number, ch: string, c: Color, scale = 1): void {
  const g = G[ch] ?? G['?']!;
  for (let r = 0; r < 7; r++)
    for (let b = 0; b < 5; b++)
      if ((g[r]! >> (4 - b)) & 1)
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) pix.put(x + b * scale + sx, y + r * scale + sy, c);
}

/** Escreve um texto na fonte 5x7 (espaço de 1 px entre letras). Devolve a largura. */
export function drawText(pix: Pix, x: number, y: number, text: string, c: Color, scale = 1): number {
  const t = fontText(text);
  let cx = x;
  for (const ch of t) {
    drawGlyph(pix, cx, y, ch, c, scale);
    cx += (FONT_W + 1) * scale;
  }
  return cx - x;
}

export const textWidth = (text: string, scale = 1) => fontText(text).length * (FONT_W + 1) * scale;
