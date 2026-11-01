// Ajudantes para desenhar bonecos chibi 32x48: regiões sombreadas (luz de cima à esquerda),
// membros em tubo, olhos com brilho e preview ampliado.
import { Img, bayer, lightAt, ramp } from './img.mjs';

/** Índice na rampa a partir de v (0..1) com dither de Bayer. */
export function idx(n, v, x, y, dither = 0.3) {
  const f = Math.max(0, Math.min(1, v)) * (n - 1);
  const i = Math.floor(f);
  return Math.min(n - 1, f - i > 0.5 + (bayer(x, y) - 0.5) * dither ? i + 1 : i);
}
const ci = (r, i) => r[Math.max(0, Math.min(r.length - 1, i))];

/** Valor de luz de uma caixa: claro em cima à esquerda, escuro embaixo à direita. */
export function shadeV(x, y, x0, y0, x1, y1, k = 1) {
  const u = (x - x0) / Math.max(1, x1 - x0);
  const t = (y - y0) / Math.max(1, y1 - y0);
  return 0.98 - 0.55 * u * k - 0.3 * t;
}

/**
 * Retângulo sombreado (inclusivo). o.pat(x, y, i) => i ajusta o índice (xadrez, listras);
 * o.bias soma luz; o.v(x, y) substitui o valor.
 */
export function box(img, x0, y0, x1, y1, r, o = {}) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const v = o.v ? o.v(x, y) : shadeV(x, y, x0, y0, x1, y1, o.k ?? 1) + (o.bias ?? 0);
      let i = idx(r.length, v, x, y, o.dither ?? 0.3);
      if (o.pat) i = o.pat(x, y, i);
      img.px(x, y, ci(r, i));
    }
}
/** Polígono sombreado pela própria caixa delimitadora. */
export function shape(img, pts, r, o = {}) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  img.poly(pts, (x, y) => {
    const v = o.v ? o.v(x, y) : shadeV(x, y, x0, y0, x1, y1, o.k ?? 1) + (o.bias ?? 0);
    let i = idx(r.length, v, x, y, o.dither ?? 0.3);
    if (o.pat) i = o.pat(x, y, i);
    return ci(r, i);
  });
}
/** Elipse em que f pode devolver null para pular o pixel (Img.ellipse apagaria). */
export function ellipseIf(img, cx, cy, rx, ry, f) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      const c = f(x, y, nx, ny);
      if (c !== null && c !== undefined) img.px(x, y, c);
    }
}
/** Elipse sombreada como volume. */
export function blob(img, cx, cy, rx, ry, r, o = {}) {
  img.ellipse(cx, cy, rx, ry, (x, y, nx, ny) => {
    let i = idx(r.length, 0.28 + lightAt(nx * 0.85, ny * 0.85) * 0.95 + (o.bias ?? 0), x, y, o.dither ?? 0.4);
    if (o.pat) i = o.pat(x, y, i);
    return ci(r, i);
  });
}
/** Membro em tubo de (x0,y0) a (x1,y1), espessura w. */
export function limb(img, x0, y0, x1, y1, w, r, o = {}) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1;
  const rad = w / 2;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
    img.ellipse(cx, cy, rad, rad, (x, y, nx) => {
      let i = idx(r.length, 0.18 + lightAt(nx * 0.9, -0.2) + (o.bias ?? 0), x, y, 0.3);
      if (o.pat) i = o.pat(x, y, i);
      return ci(r, i);
    });
  }
}
/** Olho 2x3: íris, pupila e brilho no canto de cima à esquerda. */
export function eye(img, x, y, iris, { h = 3, w = 2 } = {}) {
  const ir = ramp(iris, 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) img.px(x + i, y + j, j === 0 ? ir[0] : j === h - 1 ? ir[2] : ir[1]);
  img.px(x, y, 0x1a1020);
  if (w > 1) img.px(x + 1, y, 0x1a1020);
  img.px(x, y + 1, 0xffffff);
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
          out.rect((ox + x) * scale, (oy + y) * scale, scale, scale, c ?? e);
        }
    });
    row += Math.ceil(g.length / cols);
  }
  return out;
}
