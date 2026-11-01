// Ajudantes para desenhar bonecos chibi 48x64 (versão 2): camadas com borda sombreada por dentro
// (selout), volumes sombreados com luz de cima à esquerda, olhos grandes de anime, cabelo em mechas
// e preview ampliado.
import { Img, bayer, lightAt, shift } from './img.mjs';

/** Índice na rampa a partir de v (0..1) com dither de Bayer. */
export function idx(n, v, x, y, dither = 0.35) {
  const f = Math.max(0, Math.min(1, v)) * (n - 1);
  const i = Math.floor(f);
  return Math.min(n - 1, f - i > 0.5 + (bayer(x, y) - 0.5) * dither ? i + 1 : i);
}
export const ci = (r, i) => r[Math.max(0, Math.min(r.length - 1, i))];
const tone = (r, v, x, y, d, pat) => {
  let i = idx(r.length, v, x, y, d);
  if (pat) i = pat(x, y, i);
  return i === null ? null : ci(r, i);
};

/**
 * Camada: desenha numa imagem à parte e cola na principal. A borda da camada escurece por dentro
 * nos lados de baixo e da direita (sombra), e nos outros lados só onde encosta em outra peça
 * (linha interna entre materiais). Dá volume e separa as partes sem contorno preto.
 */
export function lay(main, draw, { edge = 0.42, inner = 0.3 } = {}) {
  const L = new Img(main.w, main.h);
  draw(L);
  const src = L.clone();
  for (let y = 0; y < L.h; y++)
    for (let x = 0; x < L.w; x++) {
      const c = src.get(x, y);
      if (c === null) continue;
      const out = (dx, dy) => src.alpha(x + dx, y + dy) === 0;
      if (out(1, 0) || out(0, 1)) L.px(x, y, shift(c, -edge));
      else if ((out(-1, 0) && main.alpha(x - 1, y)) || (out(0, -1) && main.alpha(x, y - 1))) L.px(x, y, shift(c, -inner));
    }
  main.blit(L, 0, 0);
  return L;
}

/** Elipse cheia sombreada como volume; f(x,y,nx,ny) opcional ajusta (pat devolve índice ou null). */
export function E(img, cx, cy, rx, ry, r, { bias = 0, d = 0.35, pat = null, k = 0.95, base = 0.22 } = {}) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      const c = tone(r, base + lightAt(nx * 0.88, ny * 0.88) * k + bias, x, y, d, pat ? (xx, yy, i) => pat(xx, yy, i, nx, ny) : null);
      if (c !== null) img.px(x, y, c);
    }
}
/** Retângulo arredondado com sombreamento de cilindro (horizontal) e queda para baixo. */
export function RR(img, x0, y0, x1, y1, r, { bias = 0, d = 0.35, pat = null, rad = 1, vy = 0.35, cyl = 0.85 } = {}) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const cx = Math.min(x - x0, x1 - x), cy = Math.min(y - y0, y1 - y);
      if (rad > 0 && cx + cy < rad) continue;
      const nx = ((x + 0.5 - x0) / (x1 - x0 + 1)) * 2 - 1;
      const ny = ((y + 0.5 - y0) / (y1 - y0 + 1)) * 2 - 1;
      const c = tone(r, 0.2 + lightAt(nx * cyl, ny * vy) + bias, x, y, d, pat ? (xx, yy, i) => pat(xx, yy, i, nx, ny) : null);
      if (c !== null) img.px(x, y, c);
    }
}
/** Polígono sombreado pela própria caixa (luz de cima à esquerda). */
export function P(img, pts, r, { bias = 0, d = 0.35, pat = null, cyl = 0.8, vy = 0.5 } = {}) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  img.poly(pts, (x, y) => {
    const nx = ((x + 0.5 - x0) / Math.max(1, x1 - x0)) * 2 - 1;
    const ny = ((y + 0.5 - y0) / Math.max(1, y1 - y0)) * 2 - 1;
    const c = tone(r, 0.2 + lightAt(nx * cyl, ny * vy) + bias, x, y, d, pat ? (xx, yy, i) => pat(xx, yy, i, nx, ny) : null);
    return c ?? img.get(x, y);
  });
}
/** Membro em tubo de (x0,y0) a (x1,y1), espessura w (sombreado como cilindro). */
export function T(img, x0, y0, x1, y1, w, r, { bias = 0, pat = null } = {}) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1;
  const rad = w / 2;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
    for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++)
      for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
        const nx = (x + 0.5 - cx) / rad, ny = (y + 0.5 - cy) / rad;
        if (nx * nx + ny * ny > 1) continue;
        const c = tone(r, 0.2 + lightAt(nx * 0.9, -0.15) + bias, x, y, 0.3, pat);
        if (c !== null) img.px(x, y, c);
      }
  }
}

/**
 * Olho grande de chibi, 4x5: cílio em cima, esclera do lado de fora, íris em 3 tons, pupila e
 * brilho de 2 px em cima à esquerda. side = -1 olho esquerdo (da tela), 1 direito, 0 perfil.
 */
export function eye(img, x, y, ir, side = -1, { lash = 0x24121a, white = 0xf6f0ee, h = 5 } = {}) {
  const w = side === 0 ? 3 : 4;
  const outer = side === -1 ? 0 : w - 1;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      let c;
      if (j === 0) c = lash;
      else if (side !== 0 && i === outer) c = j === h - 1 ? 0xd8c8c8 : white;
      else c = j <= 1 ? ir[0] : j >= h - 1 ? ir[3] : j === h - 2 ? ir[2] : ir[1];
      img.px(x + i, y + j, c);
    }
  // cílio passa 1 px para fora; pupila; brilho
  img.px(side === 1 ? x + w : x - 1, y, lash);
  if (side === 1) img.px(x + w, y + 1, lash); else if (side === -1) img.px(x - 1, y + 1, lash);
  const ix0 = side === -1 ? x + 1 : x; // começo da íris
  img.px(ix0 + 1, y + 2, 0x140a10);
  img.px(ix0 + 1, y + 3, ci(ir, 0));
  img.px(ix0, y + 1, 0xffffff);
  img.px(ix0, y + 2, 0xffffff);
  img.px(ix0 + 2, y + h - 2, shift(ir[3], 0.5));
}

/** Preview: todos os quadros em grade, ampliados. */
export function preview(groups, scale = 4, cols = 12, bg = 0x101624) {
  const all = groups.flat();
  const cw = Math.max(...all.map((f) => f.img.w)) + 4;
  const ch = Math.max(...all.map((f) => f.img.h)) + 4;
  const rows = groups.reduce((a, g) => a + Math.ceil(g.length / cols), 0);
  const out = new Img(cols * cw * scale, rows * ch * scale);
  out.rect(0, 0, out.w, out.h, bg);
  let row = 0;
  for (const g of groups) {
    g.forEach((f, k) => {
      const ox = (k % cols) * cw + 2, oy = (row + Math.floor(k / cols)) * ch + 2;
      for (let y = 0; y < f.img.h; y++)
        for (let x = 0; x < f.img.w; x++) {
          const c = f.img.get(x, y);
          const e = f.emissive ? f.emissive.get(x, y) : null;
          if (c === null && e === null) continue;
          out.rect((ox + x) * scale, (oy + y) * scale, scale, scale, e ?? c);
        }
    });
    row += Math.ceil(g.length / cols);
  }
  return out;
}
