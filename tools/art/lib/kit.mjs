// Kit modular do cenário: materiais (madeira, blocos, musgo, metal), cachos de copa, toldos listrados
// e a camada emissiva (o que brilha: janela, neon, runa, chama). Tudo por cima de Img da lib.
import { Img, ball, cyl, hash, vnoise, pick, shift, outlineOf, lightAt } from './img.mjs';

export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sprite com camada emissiva paralela. */
export class Spr {
  constructor(w, h) {
    this.img = new Img(w, h);
    this.E = new Img(w, h);
    this.hasE = false;
  }
  glow(x, y, c) {
    this.img.px(x, y, c);
    this.E.px(x, y, c);
    this.hasE = true;
  }
  /** Retângulo emissivo com gradiente vertical de cores (do topo para baixo). */
  glowRect(x, y, w, h, cols) {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const t = h > 1 ? j / (h - 1) : 0;
        this.glow(x + i, y + j, cols[Math.min(cols.length - 1, Math.floor(t * cols.length))]);
      }
  }
}

/** Escurece pixels já pintados numa área (sombra projetada), com dither na borda. */
export function darken(img, x, y, w, h, k = -0.45, fade = 0) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const c = img.get(x + i, y + j);
      if (c === null) continue;
      if (fade && j >= h - fade && hash(x + i, y + j, 3) < (j - (h - fade)) / fade) continue;
      img.px(x + i, y + j, shift(c, k));
    }
}

/**
 * Tábuas de madeira com veio, junta escura, borda iluminada e pregos.
 * dir 'v' = tábuas em pé (junta vertical), 'h' = deitadas.
 */
export function wood(img, x, y, w, h, r, { dir = 'v', pw = 6, seed = 1, nails = true, bias = 0 } = {}) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const across = dir === 'v' ? i : j;
      const along = dir === 'v' ? j : i;
      const k = Math.floor(across / pw);
      const p = across % pw;
      const off = hash(k, 0, seed) * 40;
      const grain = vnoise((along + off) * 0.18, p * 0.9 + k * 7, seed) - 0.5;
      let v = 0.42 + (hash(k, 1, seed) - 0.5) * 0.22 + grain * 0.35 + bias;
      if (p === 0) v += 0.22; // borda de cima/esquerda pega luz
      if (p === pw - 1) v = 0.0; // junta
      // nó da madeira
      const kx = Math.floor(hash(k, 2, seed) * 30);
      if (Math.abs(along - kx) + Math.abs(p - pw / 2) < 1.6 && hash(k, 3, seed) < 0.35) v = 0.05;
      let c = pick(r, v, x + i, y + j, 0.4);
      if (nails && p === Math.floor(pw / 2) && (along === 2 || along === (dir === 'v' ? h : w) - 3)) c = 0x2a2230;
      img.px(x + i, y + j, c);
    }
}

/** Blocos de pedra em amarração, com junta escura e bisel (luz de cima à esquerda). */
export function blocks(img, x, y, w, h, r, { bw = 10, bh = 6, seed = 2, mortar = null, bias = 0, rough = 0.35 } = {}) {
  const m = mortar ?? shift(r[0], -0.4);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const row = Math.floor(j / bh);
      const off = (row % 2) * Math.floor(bw / 2) + Math.floor(hash(row, 9, seed) * 3);
      const col = Math.floor((i + off) / bw);
      const lx = (i + off) % bw;
      const ly = j % bh;
      let c;
      if (lx === 0 || ly === 0) c = m;
      else {
        const tone = (hash(col, row, seed) - 0.5) * 0.25;
        let v = 0.5 + tone + (vnoise((x + i) * 0.4, (y + j) * 0.4, seed) - 0.5) * rough + bias;
        if (ly === 1 || lx === 1) v += 0.3;
        if (ly === bh - 1 || lx === bw - 1) v -= 0.3;
        c = pick(r, v, x + i, y + j, 0.5);
      }
      img.px(x + i, y + j, c);
    }
}

/** Superfície com ruído (laje, terra, chapa). */
export function noisy(img, x, y, w, h, r, { seed = 3, scale = 0.3, amp = 0.5, base = 0.5, dither = 0.6 } = {}) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const v = base + (vnoise((x + i) * scale, (y + j) * scale, seed) - 0.5) * amp + (hash(x + i, y + j, seed) - 0.5) * 0.12;
      img.px(x + i, y + j, pick(r, v, x + i, y + j, dither));
    }
}

/** Bolota com aro escuro embaixo: o "cacho" de copa e de musgo, que separa as camadas. */
export function clump(img, cx, cy, rx, ry, r, { bias = 0, rim = true } = {}) {
  if (rim) img.ellipse(cx + 0.4, cy + 1.2, rx, ry, shift(r[0], -0.25));
  ball(img, cx, cy, rx, ry, r, { bias, dither: 0.7 });
  // brilho no alto à esquerda
  const hx = Math.round(cx - rx * 0.4), hy = Math.round(cy - ry * 0.45);
  if (rx >= 4) {
    img.px(hx, hy, shift(r[r.length - 1], 0.45));
    img.px(hx + 1, hy, shift(r[r.length - 1], 0.2));
  }
}

/** Copa em cachos dentro de uma elipse: bolotas de trás (em cima) para a frente (embaixo). */
export function canopy(img, cx, cy, rx, ry, r, { n = 18, rmin = 5, rmax = 9, seed = 4, bias = 0 } = {}) {
  const R = rng(seed);
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R());
    const br = rmin + R() * (rmax - rmin);
    pts.push([cx + Math.cos(a) * d * (rx - br * 0.6), cy + Math.sin(a) * d * (ry - br * 0.6), br]);
  }
  // base cheia para não sobrar buraco
  img.ellipse(cx, cy + 1, rx * 0.8, ry * 0.8, r[1]);
  pts.sort((a, b) => a[1] - b[1]);
  for (const [x, y, br] of pts) {
    const b = bias + (cy - y) / (ry * 4) + (cx - x) / (rx * 6);
    clump(img, x, y, br, br * 0.85, r, { bias: b });
  }
}

/** Toldo listrado inclinado (vista 3/4), com borda recortada em meia-lua. */
export function awning(img, x, y, w, h, colA, colB, { stripe = 6, scallop = true } = {}) {
  for (let j = 0; j < h; j++) {
    const t = j / Math.max(1, h - 1);
    for (let i = 0; i < w; i++) {
      const s = Math.floor(i / stripe) % 2;
      const r = s ? colB : colA;
      const p = i % stripe;
      let v = 0.75 - t * 0.35 + (p === 0 ? 0.12 : 0) - (p === stripe - 1 ? 0.12 : 0);
      if (j === 0) v = 0.95;
      img.px(x + i, y + j, pick(r, v, x + i, y + j, 0.5));
    }
  }
  if (scallop)
    for (let i = 0; i < w; i++) {
      const s = Math.floor(i / stripe) % 2;
      const r = s ? colB : colA;
      const p = (i % stripe) + 0.5 - stripe / 2;
      const d = Math.round(Math.sqrt(Math.max(0, (stripe / 2) ** 2 - p * p)) * 0.7);
      for (let k = 0; k < d; k++) img.px(x + i, y + h + k, k === d - 1 ? r[0] : r[1]);
    }
}

/** Poste/viga cilíndrica. */
export const post = (img, x, y, w, h, r, o) => cyl(img, x, y, w, h, r, o);

/** Faixa de perigo diagonal amarela e preta. */
export function hazard(img, x, y, w, h, yel, blk = [0x1c1a22, 0x2a2730, 0x3a3640, 0x4a4650]) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const s = Math.floor((i + j) / 4) % 2;
      const r = s ? blk : yel;
      const v = 0.75 - (j / h) * 0.4 + (j === 0 ? 0.2 : 0);
      img.px(x + i, y + j, pick(r, v, x + i, y + j, 0.3));
    }
}

/** Chama de lampião (emissiva), 3 px de largura. */
export function flame(s, cx, cy) {
  const F = [0xfff6c8, 0xffd25a, 0xff9a2a, 0xe0561a];
  s.glow(cx, cy - 2, F[2]);
  s.glow(cx, cy - 1, F[1]);
  s.glow(cx - 1, cy, F[2]); s.glow(cx, cy, F[0]); s.glow(cx + 1, cy, F[2]);
  s.glow(cx - 1, cy + 1, F[1]); s.glow(cx, cy + 1, F[0]); s.glow(cx + 1, cy + 1, F[1]);
  s.glow(cx, cy + 2, F[1]);
}

export const AMBAR = [0xfff2b8, 0xffd27a, 0xffb648, 0xf08a2a];
export const CIANO = [0xe8ffff, 0x9ff6ff, 0x3ee6f0, 0x18a8c8];
export const MAGENTA = [0xffd0f4, 0xff7ae0, 0xf03cc8, 0xa8208c];
export { lightAt, outlineOf, shift };
