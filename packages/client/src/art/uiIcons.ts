/**
 * Ícones de interface da Fase 4 (48x48, puros): moedas (Semente e Crédito), câmbio, feira, app,
 * casa, decorar, girar e tirar. Pedidos pela ArtApi.icon com o prefixo `ui_` (ex.: `ui_semente`).
 * As moedas saem sem moldura (ficam bem ao lado de um número); os de ação têm o botão quadrado.
 *
 * SUGESTÃO: o desenho dos ícones não está nos docs; sai de societies.json/economy.json (Semente da
 * Esquerda, Crédito com score da Direita, feira de troca, app com taxa) e das paletas de Arte.md.
 */
import { drawText, textWidth } from './font';
import { C, type Color, hex, light, Pix, shade, withAlpha } from './pixel';

export const UI_ICON_IDS = ['ui_semente', 'ui_credito', 'ui_cambio', 'ui_feira', 'ui_app', 'ui_casa', 'ui_decorar', 'ui_girar', 'ui_tirar'] as const;
export type UiIconId = (typeof UI_ICON_IDS)[number];

const N = 48;
const LEAF = hex('#5ec04a');
const LEAF_D = hex('#2e6e2a');
const WOOD = hex('#8a5a32');

export function isUiIcon(id: string): boolean {
  return (UI_ICON_IDS as readonly string[]).includes(id);
}

/** Moeda da Semente desenhada em (cx, cy) com raio r. */
function semente(p: Pix, cx: number, cy: number, r: number): void {
  p.disk(cx, cy + 1.5, r, hex('#5a3a20'));
  p.disk(cx, cy, r, hex('#a8743f'));
  p.ring(cx, cy, r, r, Math.max(1, r * 0.14), hex('#6b4429'));
  p.disk(cx - r * 0.3, cy - r * 0.35, r * 0.3, withAlpha(hex('#e8c890'), 140));
  // semente brotando
  const s = r / 15;
  p.ellipse(cx, cy + 5 * s, 4.5 * s, 3.4 * s, hex('#5a3a20'));
  p.ellipse(cx - 1 * s, cy + 4.4 * s, 2 * s, 1.2 * s, hex('#8a5a32'));
  p.capsule(cx, cy + 3 * s, cx, cy - 4 * s, Math.max(1.2, 1.6 * s), LEAF_D);
  p.ellipse(cx - 4.5 * s, cy - 5 * s, 4.4 * s, 2.4 * s, LEAF);
  p.ellipse(cx + 4.5 * s, cy - 7 * s, 4.4 * s, 2.4 * s, LEAF);
  p.put(Math.round(cx - 6 * s), Math.round(cy - 6 * s), light(LEAF, 0.4));
}

/** Moeda do Crédito: ficha de chip com o C cortado, neon sobre preto. */
function credito(p: Pix, cx: number, cy: number, r: number): void {
  p.disk(cx, cy + 1.5, r, hex('#0a0a12'));
  p.disk(cx, cy, r, hex('#22222e'));
  p.ring(cx, cy, r, r, Math.max(1, r * 0.13), C.neonCyan);
  p.ring(cx, cy, r * 0.72, r * 0.72, 1, withAlpha(C.neonPink, 200));
  const s = r / 15;
  // C grosso e a barra do cifrão
  p.ring(cx, cy, 7 * s, 7 * s, Math.max(1.5, 2.4 * s), C.pureWhite);
  p.box(Math.round(cx + 2 * s), Math.round(cy - 3 * s), Math.round(cx + 8 * s), Math.round(cy + 3 * s), hex('#22222e'));
  p.box(Math.round(cx - 0.5 * s), Math.round(cy - 10 * s), Math.round(cx + 0.8 * s), Math.round(cy + 10 * s), C.neonCyan);
  // trilhas de circuito
  for (const a of [0.4, 2.2, 3.8, 5.4]) {
    const x = cx + Math.cos(a) * r * 0.86;
    const y = cy + Math.sin(a) * r * 0.86;
    p.put(Math.round(x), Math.round(y), C.neonPink);
  }
}

function button(p: Pix, bg: Color, rim: Color): void {
  p.box(2, 3, N - 3, N - 2, shade(bg, 0.55));
  p.box(2, 2, N - 3, N - 4, bg);
  p.box(4, 4, N - 5, N - 6, light(bg, 0.06));
  p.hline(4, N - 5, 3, light(bg, 0.3));
  p.frame(1, 1, N - 2, N - 2, rim);
  for (const [x, y] of [[1, 1], [N - 2, 1], [1, N - 2], [N - 2, N - 2]] as const) p.set(x, y, 0);
}

function arrow(p: Pix, x0: number, y0: number, x1: number, y1: number, col: Color, w = 3): void {
  p.capsule(x0, y0, x1, y1, w, col);
  const a = Math.atan2(y1 - y0, x1 - x0);
  const h = 5;
  p.poly(
    [
      [x1 + Math.cos(a) * h, y1 + Math.sin(a) * h],
      [x1 + Math.cos(a + 2.1) * h, y1 + Math.sin(a + 2.1) * h],
      [x1 + Math.cos(a - 2.1) * h, y1 + Math.sin(a - 2.1) * h],
    ],
    col,
  );
}

function draw(id: UiIconId): Pix {
  const p = new Pix(N, N);
  const art = new Pix(N, N);
  switch (id) {
    case 'ui_semente':
      semente(art, 24, 23, 19);
      break;
    case 'ui_credito':
      credito(art, 24, 23, 19);
      break;
    case 'ui_cambio': {
      button(p, hex('#3a3242'), hex('#16121a'));
      semente(art, 15, 19, 9);
      credito(art, 33, 29, 9);
      arrow(art, 26, 11, 36, 15, C.warn, 2.5);
      arrow(art, 22, 38, 12, 33, C.warn, 2.5);
      break;
    }
    case 'ui_feira': {
      button(p, hex('#3e5a32'), hex('#1a2614'));
      for (let x = 7; x <= 40; x++) for (let y = 9; y <= 17; y++) art.set(x, y, ((x - 7) >> 2) % 2 === 0 ? hex('#a8463f') : C.paper);
      for (let x = 7; x < 41; x += 4) art.poly([[x, 18], [x + 4, 18], [x + 2, 21]], ((x - 7) >> 2) % 2 === 0 ? hex('#a8463f') : C.paper);
      art.box(9, 18, 10, 39, WOOD);
      art.box(37, 18, 38, 39, WOOD);
      art.box(8, 31, 39, 38, WOOD);
      art.hline(8, 39, 31, light(WOOD, 0.3));
      for (const [k, col] of [C.red, hex('#e8a020'), LEAF].entries()) {
        art.ellipse(15 + k * 9, 29, 4, 2.6, hex('#c8a060'));
        art.disk(14 + k * 9, 27, 1.8, col);
        art.disk(16 + k * 9, 27.5, 1.6, col);
      }
      break;
    }
    case 'ui_app': {
      button(p, hex('#22242e'), hex('#0a0a10'));
      art.box(14, 5, 33, 42, hex('#16141c'));
      art.box(16, 9, 31, 37, hex('#2a1238'));
      art.box(21, 39, 26, 40, hex('#5a5a66'));
      // sacola de compras e a taxa
      art.box(19, 17, 28, 27, C.neonPink);
      art.ring(23.5, 17, 3, 3, 1, C.neonCyan);
      art.box(19, 17, 28, 17, light(C.neonPink, 0.3));
      const t = '%';
      drawText(art, 16 + Math.round((15 - textWidth(t)) / 2) + 1, 29, t, C.neonCyan);
      art.disk(31, 9, 3, C.red);
      break;
    }
    case 'ui_casa': {
      button(p, hex('#4a3a2e'), hex('#1e1610'));
      art.poly([[6, 22], [24, 7], [42, 22]], hex('#c8a858'));
      for (let k = 0; k < 7; k++) art.line(9 + k * 5, 21, 24, 9, shade(hex('#c8a858'), 0.8));
      art.box(10, 22, 37, 41, hex('#b88a5a'));
      art.box(20, 28, 27, 41, hex('#6b4429'));
      art.put(25, 35, C.gold);
      art.box(30, 26, 35, 31, hex('#8ac8e8'));
      art.box(12, 26, 17, 31, hex('#8ac8e8'));
      art.box(33, 9, 36, 16, hex('#5a5a5a'));
      break;
    }
    case 'ui_decorar': {
      button(p, hex('#5a3a5e'), hex('#1e1220'));
      // poltrona e o pincel com brilho
      art.box(9, 22, 30, 32, hex('#a8463f'));
      art.box(9, 14, 30, 22, hex('#c85a4a'));
      art.box(6, 20, 10, 34, hex('#8a3a32'));
      art.box(29, 20, 33, 34, hex('#8a3a32'));
      art.box(9, 34, 11, 39, WOOD);
      art.box(28, 34, 30, 39, WOOD);
      art.capsule(39, 7, 30, 22, 3, WOOD);
      art.capsule(30, 22, 27, 27, 4.5, hex('#e8c040'));
      for (const [sx, sy] of [[38, 28], [16, 8]] as const) {
        art.hline(sx - 2, sx + 2, sy, C.pureWhite);
        art.vline(sx, sy - 2, sy + 2, C.pureWhite);
      }
      break;
    }
    case 'ui_girar': {
      button(p, hex('#2e4a5a'), hex('#0e1a22'));
      art.ring(24, 25, 14, 14, 4, C.white);
      for (let y = 6; y <= 20; y++) for (let x = 26; x <= 40; x++) if (x - 26 > (y - 6) * 0.2) art.set(x, y, 0);
      art.poly([[25, 4], [34, 11], [25, 18]], C.white);
      art.ellipse(24, 25, 5, 3, hex('#c8a060'));
      break;
    }
    case 'ui_tirar': {
      button(p, hex('#5a2e2e'), hex('#220e0e'));
      // caixa de mudança com a seta entrando
      art.poly([[8, 24], [24, 20], [40, 24], [24, 28]], hex('#d8a868'));
      art.poly([[8, 24], [24, 28], [24, 42], [8, 38]], hex('#b8864a'));
      art.poly([[24, 28], [40, 24], [40, 38], [24, 42]], hex('#9a6a38'));
      art.line(24, 28, 24, 42, hex('#7a5028'));
      arrow(art, 24, 4, 24, 17, C.white, 4);
      break;
    }
  }
  art.outline({ minAlpha: 100 });
  p.blit(art, 0, 0);
  return p;
}

/** Ícone de interface 48x48 (puro). Id desconhecido devolve um quadro vazio. */
export function buildUiIcon(id: string): Pix {
  return isUiIcon(id) ? draw(id as UiIconId) : new Pix(N, N);
}
