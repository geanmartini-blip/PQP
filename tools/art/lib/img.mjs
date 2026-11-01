// Núcleo do gerador de pixel art: imagem RGBA, primitivas, rampas de cor com hue shift,
// sombreamento com luz de cima à esquerda, contorno escuro colorido, normal map e PNG.
// Cores são inteiros 0xRRGGBB (opacas); null/-1 = transparente.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export class Img {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
  }
  in(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  /** Pinta um pixel. a = alfa 0..255. */
  px(x, y, c, a = 255) {
    x |= 0;
    y |= 0;
    if (!this.in(x, y)) return;
    const i = (y * this.w + x) * 4;
    if (c === null || c === -1) {
      this.d[i + 3] = 0;
      return;
    }
    if (a < 255 && this.d[i + 3] > 0) {
      const t = a / 255;
      this.d[i] = this.d[i] * (1 - t) + ((c >> 16) & 255) * t;
      this.d[i + 1] = this.d[i + 1] * (1 - t) + ((c >> 8) & 255) * t;
      this.d[i + 2] = this.d[i + 2] * (1 - t) + (c & 255) * t;
      this.d[i + 3] = Math.max(this.d[i + 3], a);
      return;
    }
    this.d[i] = (c >> 16) & 255;
    this.d[i + 1] = (c >> 8) & 255;
    this.d[i + 2] = c & 255;
    this.d[i + 3] = a;
  }
  get(x, y) {
    if (!this.in(x, y)) return null;
    const i = (y * this.w + x) * 4;
    if (this.d[i + 3] === 0) return null;
    return (this.d[i] << 16) | (this.d[i + 1] << 8) | this.d[i + 2];
  }
  alpha(x, y) {
    return this.in(x, y) ? this.d[(y * this.w + x) * 4 + 3] : 0;
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }
  /** Elipse cheia. f(x, y, nx, ny) opcional devolve a cor por pixel (nx, ny = posição normalizada -1..1). */
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny > 1) continue;
        // função que devolve null = pula o pixel (não apaga)
        const v = typeof c === 'function' ? c(x, y, nx, ny) : c;
        if (v !== null || typeof c !== 'function') this.px(x, y, v);
      }
  }
  line(x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  /** Polígono cheio (regra par-ímpar). c pode ser função (x, y). */
  poly(pts, c) {
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const yc = y + 0.5;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.px(x, y, typeof c === 'function' ? c(x, y) : c);
    }
  }
  /** Copia outra imagem por cima (respeita alfa). */
  blit(src, dx, dy, { flipX = false, sx = 0, sy = 0, w = src.w, h = src.h } = {}) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const xx = flipX ? sx + w - 1 - x : sx + x;
        const i = ((sy + y) * src.w + xx) * 4;
        const a = src.d[i + 3];
        if (a === 0) continue;
        const c = (src.d[i] << 16) | (src.d[i + 1] << 8) | src.d[i + 2];
        this.px(dx + x, dy + y, c, a);
      }
  }
  clone() {
    const o = new Img(this.w, this.h);
    o.d.set(this.d);
    return o;
  }
  /** Aplica f(c, x, y) => cor nova em todo pixel opaco. */
  map(f) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const c = this.get(x, y);
        if (c !== null) this.px(x, y, f(c, x, y), this.alpha(x, y));
      }
    return this;
  }
}

// ---------- cor ----------
export const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
export const pack = (r, g, b) => ((clamp(r) << 16) | (clamp(g) << 8) | clamp(b)) >>> 0;
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

export function toHsl(c) {
  let [r, g, b] = rgb(c).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
export function fromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return pack(f(0) * 255, f(8) * 255, f(4) * 255);
}
/** Gira o matiz em direção a um alvo (graus), no máximo `amt` graus. */
function hueToward(h, target, amt) {
  let d = ((target - h + 540) % 360) - 180;
  return h + Math.sign(d) * Math.min(Math.abs(d), amt);
}
/** Escurece com hue shift para o azul-violeta (sombra) ou clareia para o amarelo (luz). k em -1..1. */
export function shift(c, k) {
  const [h, s, l] = toHsl(c);
  if (k < 0) return fromHsl(hueToward(h, 250, 18 * -k), s * (1 + 0.15 * -k), l * (1 + 0.62 * k));
  return fromHsl(hueToward(h, 55, 14 * k), s * (1 - 0.1 * k), l + (1 - l) * 0.55 * k);
}
/** Rampa de n tons, do mais escuro ao mais claro, com a base no meio-claro. */
export function ramp(base, n = 4) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i - (n - 2)) / (n - 1); // n=4: -0.67, -0.33, 0, 0.33
    out.push(t === 0 ? base : shift(base, t * 1.35));
  }
  return out;
}
export const mix = (a, b, t) => {
  const A = rgb(a), B = rgb(b);
  return pack(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
};
/** Cor do contorno de um material: bem escura, mesma família. */
export const outlineOf = (c) => {
  const [h, s, l] = toHsl(c);
  return fromHsl(hueToward(h, 260, 25), Math.min(1, s * 0.9 + 0.1), Math.min(0.16, l * 0.35));
};

// ---------- ruído e dither ----------
export function hash(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function vnoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
/** Escolhe um tom da rampa a partir de v (0..1) com dither de Bayer nas transições. */
export function pick(r, v, x, y, dither = 0.5) {
  const f = Math.max(0, Math.min(1, v)) * (r.length - 1);
  const i = Math.floor(f);
  const t = 0.5 + (bayer(x, y) - 0.5) * dither;
  return r[Math.min(r.length - 1, f - i > t ? i + 1 : i)];
}

// ---------- sombreamento ----------
const L = (() => { const v = [-0.55, -0.7, 0.45]; const n = Math.hypot(...v); return v.map((a) => a / n); })();
/** Luz difusa para uma normal (nx, ny para baixo/direita, nz para fora). 0..1 */
export function lightAt(nx, ny, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))) {
  return Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
}
/** Elipse sombreada como esfera (luz de cima à esquerda). */
export function ball(img, cx, cy, rx, ry, r, { dither = 0.6, bias = 0 } = {}) {
  img.ellipse(cx, cy, rx, ry, (x, y, nx, ny) => pick(r, lightAt(nx * 0.9, ny * 0.9) * 0.95 + bias, x, y, dither));
}
/** Cilindro vertical sombreado (troncos, barris, pernas). */
export function cyl(img, x, y, w, h, r, { dither = 0.5, bias = 0 } = {}) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const nx = ((i + 0.5) / w) * 2 - 1;
      img.px(x + i, y + j, pick(r, lightAt(nx * 0.95, -0.15) + bias, x + i, y + j, dither));
    }
}

// ---------- contorno ----------
/**
 * Contorno externo colorido: cada pixel transparente vizinho (4 lados) de um opaco recebe a cor
 * de contorno do vizinho. `skipBottom` deixa a base sem contorno (peças que encostam no chão).
 */
export function outline(img, { color = null, diag = false } = {}) {
  const src = img.clone();
  const nb = diag ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      if (src.alpha(x, y) > 0) continue;
      for (const [dx, dy] of nb) {
        const c = src.alpha(x + dx, y + dy) > 128 ? src.get(x + dx, y + dy) : null;
        if (c !== null) {
          img.px(x, y, color ?? outlineOf(c));
          break;
        }
      }
    }
  return img;
}
export const lum = (c) => { const [r, g, b] = rgb(c); return 0.299 * r + 0.587 * g + 0.114 * b; };

// ---------- normal map ----------
/**
 * Normal map a partir da forma: altura = distância até a borda do alfa (bisel) + um pouco do
 * brilho do pixel. Bom o bastante para a luz do Phaser dar volume sem pintar normal à mão.
 * `flat` = 1 deixa tudo virado para a câmera (pisos).
 */
export function normalMap(img, { bevel = 3, lumK = 0.6, flat = 0 } = {}) {
  const H = new Float32Array(img.w * img.h);
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      if (img.alpha(x, y) === 0) continue;
      let d = bevel;
      for (let r = 1; r <= bevel && d === bevel; r++)
        for (let k = -r; k <= r; k++)
          if (!img.alpha(x + k, y - r) || !img.alpha(x + k, y + r) || !img.alpha(x - r, y + k) || !img.alpha(x + r, y + k)) { d = r - 1; break; }
      H[y * img.w + x] = d / bevel + (lum(img.get(x, y)) / 255) * lumK;
    }
  const out = new Img(img.w, img.h);
  const h = (x, y) => (img.in(x, y) ? H[y * img.w + x] : 0);
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      if (img.alpha(x, y) === 0) { out.px(x, y, 0x8080ff, 0); continue; }
      let nx = (h(x - 1, y) - h(x + 1, y)) * (1 - flat);
      let ny = (h(x, y - 1) - h(x, y + 1)) * (1 - flat);
      const nz = 1;
      const n = Math.hypot(nx, ny, nz);
      out.px(x, y, pack(((nx / n) * 0.5 + 0.5) * 255, ((-ny / n) * 0.5 + 0.5) * 255, ((nz / n) * 0.5 + 0.5) * 255), 255);
    }
  return out;
}

// ---------- PNG ----------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function encodePng(img) {
  const raw = Buffer.alloc((img.w * 4 + 1) * img.h);
  for (let y = 0; y < img.h; y++) {
    raw[y * (img.w * 4 + 1)] = 0;
    Buffer.from(img.d.buffer, y * img.w * 4, img.w * 4).copy(raw, y * (img.w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
export function savePng(img, path) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(img));
}

// ---------- atlas ----------
/**
 * Junta quadros numa folha (atlas JSON hash do Phaser). frames: [{ name, img }].
 * Grava <base>.png, <base>_n.png (normal map), <base>.json e, se houver, <base>_e.png (emissivo).
 */
export function saveAtlas(base, frames, { cols = 8, normal = {}, emissive = null } = {}) {
  const fw = Math.max(...frames.map((f) => f.img.w));
  const fh = Math.max(...frames.map((f) => f.img.h));
  const rows = Math.ceil(frames.length / cols);
  const c = Math.min(cols, frames.length);
  const sheet = new Img(c * fw, rows * fh);
  const nsheet = new Img(c * fw, rows * fh);
  const esheet = emissive ? new Img(c * fw, rows * fh) : null;
  const json = { frames: {}, meta: { image: base.split('/').pop() + '.png', size: { w: sheet.w, h: sheet.h }, scale: '1' } };
  frames.forEach((f, k) => {
    const x = (k % cols) * fw, y = Math.floor(k / cols) * fh;
    sheet.blit(f.img, x, y);
    nsheet.blit(f.normal ?? normalMap(f.img, normal), x, y);
    if (esheet && f.emissive) esheet.blit(f.emissive, x, y);
    json.frames[f.name] = { frame: { x, y, w: f.img.w, h: f.img.h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: f.img.w, h: f.img.h }, sourceSize: { w: f.img.w, h: f.img.h } };
  });
  savePng(sheet, base + '.png');
  savePng(nsheet, base + '_n.png');
  if (esheet) savePng(esheet, base + '_e.png');
  writeFileSync(base + '.json', JSON.stringify(json));
}
/** Imagem única com normal map (e emissivo opcional). */
export function saveSprite(base, img, { normal = {}, normalImg = null, emissive = null } = {}) {
  savePng(img, base + '.png');
  savePng(normalImg ?? normalMap(img, normal), base + '_n.png');
  if (emissive) savePng(emissive, base + '_e.png');
}
