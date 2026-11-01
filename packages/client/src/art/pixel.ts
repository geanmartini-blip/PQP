/**
 * Buffer de pixels puro (RGBA em Uint8ClampedArray) e primitivas de desenho.
 * Nada aqui depende do Phaser nem do DOM: roda no Node para os testes.
 *
 * Cores são inteiros 0xRRGGBBAA (sem sinal). Coordenadas em pixel inteiro; formas com centro
 * contínuo usam o centro do pixel em (x + 0,5, y + 0,5).
 */

export type Color = number;

export const TRANSPARENT: Color = 0;

export function rgba(r: number, g: number, b: number, a = 255): Color {
  return (((r & 255) << 24) | ((g & 255) << 16) | ((b & 255) << 8) | (a & 255)) >>> 0;
}

/** '#rrggbb' (ou 'rrggbb') para cor; alpha opcional 0..255. */
export function hex(h: string, a = 255): Color {
  const s = h.startsWith('#') ? h.slice(1) : h;
  const n = parseInt(s.slice(0, 6), 16);
  if (Number.isNaN(n)) return rgba(255, 0, 255, a);
  return rgba((n >> 16) & 255, (n >> 8) & 255, n & 255, a);
}

export const R = (c: Color) => (c >>> 24) & 255;
export const G = (c: Color) => (c >>> 16) & 255;
export const B = (c: Color) => (c >>> 8) & 255;
export const A = (c: Color) => c & 255;

export function withAlpha(c: Color, a: number): Color {
  return ((c & 0xffffff00) | (Math.max(0, Math.min(255, Math.round(a))) & 255)) >>> 0;
}

/** Mistura linear de duas cores (t = 0 devolve a, t = 1 devolve b). */
export function mix(a: Color, b: Color, t: number): Color {
  const u = 1 - t;
  return rgba(
    Math.round(R(a) * u + R(b) * t),
    Math.round(G(a) * u + G(b) * t),
    Math.round(B(a) * u + B(b) * t),
    Math.round(A(a) * u + A(b) * t),
  );
}

/** Escurece (f < 1) mantendo alpha. */
export function shade(c: Color, f = 0.72): Color {
  return rgba(Math.round(R(c) * f), Math.round(G(c) * f), Math.round(B(c) * f), A(c));
}

/** Clareia em direção ao branco. */
export function light(c: Color, t = 0.25): Color {
  return rgba(
    Math.round(R(c) + (255 - R(c)) * t),
    Math.round(G(c) + (255 - G(c)) * t),
    Math.round(B(c) + (255 - B(c)) * t),
    A(c),
  );
}

/** Luminância perceptiva 0..255. */
export function luma(c: Color): number {
  return 0.299 * R(c) + 0.587 * G(c) + 0.114 * B(c);
}

/** Cor base do contorno escuro (Tibia/Habbo). */
export const OUTLINE_BASE: Color = hex('#140c16');

/** Cor do contorno de um pixel vizinho: o próprio tom, bem escurecido. */
export function outlineOf(c: Color): Color {
  return withAlpha(mix(c, OUTLINE_BASE, 0.78), 255);
}

/** FNV-1a 32 bits de uma string, em hexadecimal. */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** JSON estável (chaves ordenadas), para hash de visual. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`;
}

/** Gerador pseudoaleatório determinístico (mulberry32) para texturas de tile e afins. Não é o RNG da simulação. */
export function prng(seed: number | string): () => number {
  let a = typeof seed === 'string' ? parseInt(hashString(seed), 16) : seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Pix {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): Color {
    if (!this.inside(x, y)) return 0;
    const i = (y * this.w + x) * 4;
    const d = this.data;
    return ((d[i]! << 24) | (d[i + 1]! << 16) | (d[i + 2]! << 8) | d[i + 3]!) >>> 0;
  }

  alphaAt(x: number, y: number): number {
    if (!this.inside(x, y)) return 0;
    return this.data[(y * this.w + x) * 4 + 3]!;
  }

  /** Grava a cor sem misturar. */
  set(x: number, y: number, c: Color): void {
    x |= 0;
    y |= 0;
    if (!this.inside(x, y)) return;
    const i = (y * this.w + x) * 4;
    const d = this.data;
    d[i] = (c >>> 24) & 255;
    d[i + 1] = (c >>> 16) & 255;
    d[i + 2] = (c >>> 8) & 255;
    d[i + 3] = c & 255;
  }

  /** Pinta por cima com mistura de alpha (source-over). */
  put(x: number, y: number, c: Color): void {
    const a = c & 255;
    if (a === 0) return;
    if (a === 255) return this.set(x, y, c);
    x |= 0;
    y |= 0;
    if (!this.inside(x, y)) return;
    const i = (y * this.w + x) * 4;
    const d = this.data;
    const sa = a / 255;
    const da = d[i + 3]! / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    d[i] = (((c >>> 24) & 255) * sa + d[i]! * da * (1 - sa)) / oa;
    d[i + 1] = (((c >>> 16) & 255) * sa + d[i + 1]! * da * (1 - sa)) / oa;
    d[i + 2] = (((c >>> 8) & 255) * sa + d[i + 2]! * da * (1 - sa)) / oa;
    d[i + 3] = oa * 255;
  }

  /** Pinta só onde já existe pixel opaco (para estampas e sombras sobre roupa). */
  paint(x: number, y: number, c: Color): void {
    if (this.alphaAt(x | 0, y | 0) === 0) return;
    this.put(x, y, c);
  }

  rect(x: number, y: number, w: number, h: number, c: Color): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, c);
  }

  /** Retângulo pelas bordas inclusivas. */
  box(x0: number, y0: number, x1: number, y1: number, c: Color): void {
    const ax = Math.min(x0, x1);
    const bx = Math.max(x0, x1);
    const ay = Math.min(y0, y1);
    const by = Math.max(y0, y1);
    for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) this.put(x, y, c);
  }

  frame(x0: number, y0: number, x1: number, y1: number, c: Color): void {
    this.hline(x0, x1, y0, c);
    this.hline(x0, x1, y1, c);
    this.vline(x0, y0, y1, c);
    this.vline(x1, y0, y1, c);
  }

  hline(x0: number, x1: number, y: number, c: Color): void {
    const a = Math.min(x0, x1);
    const b = Math.max(x0, x1);
    for (let x = a; x <= b; x++) this.put(x, y, c);
  }

  vline(x: number, y0: number, y1: number, c: Color): void {
    const a = Math.min(y0, y1);
    const b = Math.max(y0, y1);
    for (let y = a; y <= b; y++) this.put(x, y, c);
  }

  /** Linha de Bresenham entre pixels inteiros. */
  line(x0: number, y0: number, x1: number, y1: number, c: Color): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 512; guard++) {
      this.put(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** Elipse cheia com centro contínuo. */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Color): void {
    const x0 = Math.floor(cx - rx - 1);
    const x1 = Math.ceil(cx + rx + 1);
    const y0 = Math.floor(cy - ry - 1);
    const y1 = Math.ceil(cy + ry + 1);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / Math.max(rx, 0.01);
        const dy = (y + 0.5 - cy) / Math.max(ry, 0.01);
        if (dx * dx + dy * dy < 1) this.put(x, y, c);
      }
  }

  /** Anel (borda de elipse) com espessura em px. */
  ring(cx: number, cy: number, rx: number, ry: number, thick: number, c: Color): void {
    const x0 = Math.floor(cx - rx - 1);
    const x1 = Math.ceil(cx + rx + 1);
    const y0 = Math.floor(cy - ry - 1);
    const y1 = Math.ceil(cy + ry + 1);
    const irx = Math.max(rx - thick, 0.01);
    const iry = Math.max(ry - thick, 0.01);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - cx;
        const py = y + 0.5 - cy;
        const o = (px / rx) ** 2 + (py / ry) ** 2;
        const i = (px / irx) ** 2 + (py / iry) ** 2;
        if (o < 1 && i >= 1) this.put(x, y, c);
      }
  }

  disk(cx: number, cy: number, r: number, c: Color): void {
    this.ellipse(cx, cy, r, r, c);
  }

  /**
   * Segmento grosso (cápsula) de (x0,y0) a (x1,y1), coordenadas contínuas, largura w.
   * Com `edge`, o pixel da borda do lado +x da normal ganha essa cor (sombra de 1 px).
   */
  capsule(x0: number, y0: number, x1: number, y1: number, w: number, c: Color, edge?: Color): void {
    const r = w / 2;
    const minX = Math.floor(Math.min(x0, x1) - r - 1);
    const maxX = Math.ceil(Math.max(x0, x1) + r + 1);
    const minY = Math.floor(Math.min(y0, y1) - r - 1);
    const maxY = Math.ceil(Math.max(y0, y1) + r + 1);
    const vx = x1 - x0;
    const vy = y1 - y0;
    const len2 = vx * vx + vy * vy;
    const len = Math.sqrt(len2) || 1;
    // normal apontando para +x da tela
    let nx = -vy / len;
    let ny = vx / len;
    if (nx < 0 || (nx === 0 && ny < 0)) {
      nx = -nx;
      ny = -ny;
    }
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5 - x0;
        const py = y + 0.5 - y0;
        let t = len2 > 0 ? (px * vx + py * vy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const dx = px - t * vx;
        const dy = py - t * vy;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r) {
          const side = dx * nx + dy * ny;
          this.put(x, y, edge !== undefined && side > r - 1.05 ? edge : c);
        }
      }
  }

  /** Polígono cheio (regra par-ímpar), vértices contínuos. */
  poly(pts: readonly [number, number][], c: Color): void {
    if (pts.length < 3) return;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const sy = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        if (a[1] <= sy === b[1] <= sy) continue;
        xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k]! - 0.5); x <= Math.floor(xs[k + 1]! - 0.5); x++) this.put(x, y, c);
      }
    }
  }

  /** Copia outro buffer por cima (source-over). */
  blit(src: Pix, dx: number, dy: number, opts: { flipX?: boolean; alpha?: number; tint?: Color } = {}): void {
    const am = opts.alpha ?? 1;
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        let c = src.get(opts.flipX ? src.w - 1 - x : x, y);
        if ((c & 255) === 0) continue;
        if (opts.tint !== undefined) c = withAlpha(mix(c, opts.tint, 0.55), c & 255);
        if (am !== 1) c = withAlpha(c, (c & 255) * am);
        this.put(dx + x, dy + y, c);
      }
  }

  /** Copia por baixo do que já existe (destination-over). */
  blitUnder(src: Pix, dx: number, dy: number): void {
    const tmp = new Pix(this.w, this.h);
    tmp.blit(src, dx, dy);
    tmp.blit(this, 0, 0);
    this.data.set(tmp.data);
  }

  clone(): Pix {
    const p = new Pix(this.w, this.h);
    p.data.set(this.data);
    return p;
  }

  flipX(): Pix {
    const p = new Pix(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) p.set(this.w - 1 - x, y, this.get(x, y));
    return p;
  }

  /** Escala por vizinho mais próximo. */
  scaleNearest(sx: number, sy = sx): Pix {
    const w = Math.max(1, Math.round(this.w * sx));
    const h = Math.max(1, Math.round(this.h * sy));
    const p = new Pix(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) p.set(x, y, this.get(Math.min(this.w - 1, Math.floor(x / sx)), Math.min(this.h - 1, Math.floor(y / sy))));
    return p;
  }

  /** Recorte. */
  crop(x: number, y: number, w: number, h: number): Pix {
    const p = new Pix(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) p.set(i, j, this.get(x + i, y + j));
    return p;
  }

  /**
   * Contorno de 1 px: todo pixel transparente vizinho (4 direções) de um pixel opaco
   * (alpha >= minAlpha) vira a cor do contorno. `color` fixa a cor; sem ela, usa o tom
   * escurecido do vizinho.
   */
  outline(opts: { color?: Color; minAlpha?: number; diagonal?: boolean } = {}): void {
    const minA = opts.minAlpha ?? 200;
    const w = this.w;
    const h = this.h;
    const src = this.clone();
    const dirs = opts.diagonal
      ? [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [-1, 1],
          [1, -1],
          [-1, -1],
        ]
      : [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (src.alphaAt(x, y) >= minA) continue;
        let n: Color | undefined;
        for (const [ox, oy] of dirs) {
          if (src.alphaAt(x + ox!, y + oy!) >= minA) {
            n = src.get(x + ox!, y + oy!);
            break;
          }
        }
        if (n === undefined) continue;
        const oc = opts.color ?? outlineOf(n);
        const under = src.get(x, y);
        this.set(x, y, (under & 255) > 0 ? mix(under, oc, 0.85) | 255 : oc);
      }
  }

  /**
   * Contorno seletivo de 1 px: escuro por fora, no tom do vizinho. O lado de cima e da esquerda
   * (de onde vem a luz) fica um pouco mais claro que o de baixo e da direita.
   */
  outlineSelective(minAlpha = 200): void {
    const w = this.w;
    const h = this.h;
    const src = this.clone();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (src.alphaAt(x, y) >= minAlpha) continue;
        // vizinho opaco: embaixo/direita = este pixel fica do lado da luz
        let n: Color | undefined;
        let lit = false;
        if (src.alphaAt(x, y + 1) >= minAlpha) {
          n = src.get(x, y + 1);
          lit = true;
        } else if (src.alphaAt(x + 1, y) >= minAlpha) {
          n = src.get(x + 1, y);
          lit = true;
        } else if (src.alphaAt(x, y - 1) >= minAlpha) n = src.get(x, y - 1);
        else if (src.alphaAt(x - 1, y) >= minAlpha) n = src.get(x - 1, y);
        if (n === undefined) continue;
        const oc = withAlpha(mix(n, OUTLINE_BASE, lit ? 0.7 : 0.86), 255);
        const under = src.get(x, y);
        this.set(x, y, (under & 255) > 0 ? mix(under, oc, 0.85) | 255 : oc);
      }
  }

  /** Quantos pixels têm alpha > 0. */
  countOpaque(minAlpha = 1): number {
    let n = 0;
    for (let i = 3; i < this.data.length; i += 4) if (this.data[i]! >= minAlpha) n++;
    return n;
  }

  /** Caixa dos pixels visíveis: [x0, y0, x1, y1] ou null. */
  bounds(minAlpha = 1): [number, number, number, number] | null {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (this.alphaAt(x, y) >= minAlpha) {
          if (x < x0) x0 = x;
          if (y < y0) y0 = y;
          if (x > x1) x1 = x;
          if (y > y1) y1 = y;
        }
    return x1 < 0 ? null : [x0, y0, x1, y1];
  }
}

/** Luz quente (de cima e da esquerda) e sombra fria: o sombreamento com troca de matiz da pixel art. */
export const LIGHT_WARM: Color = hex('#fff2c8');
export const SHADOW_COOL: Color = hex('#2a1e46');

/**
 * Sombreamento em 3 tons do que foi desenhado entre `before` e `after` (a máscara são os pixels
 * opacos que mudaram). Luz de cima à esquerda: borda de cima e da esquerda clareia (canto com
 * highlight), borda de baixo e da direita escurece em duas faixas. Traços de 1 px (letra miúda,
 * costura) ficam como estão: só sombreia onde a forma tem pelo menos 2 px de espessura.
 * Devolve quantos pixels havia na máscara.
 */
export function shadeDiff(after: Pix, before: Pix | null, strength = 1): number {
  const w = after.w;
  const h = after.h;
  const a = after.data;
  const b = before?.data;
  const mask = new Uint8Array(w * h);
  let n = 0;
  for (let i = 0, p = 0; p < w * h; p++, i += 4) {
    if (a[i + 3]! < 255) continue;
    if (b && a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2] && a[i + 3] === b[i + 3]) continue;
    mask[p] = 1;
    n++;
  }
  if (n < 6) return n;
  const m = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const out: [number, Color][] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] !== 1) continue;
      const up = m(x, y - 1);
      const dn = m(x, y + 1);
      const lf = m(x - 1, y);
      const rt = m(x + 1, y);
      const c = after.get(x, y);
      let t = 0;
      let to = LIGHT_WARM;
      if (!up && dn) t = !lf && rt ? 0.34 : 0.2;
      else if (!lf && rt && up && dn) t = 0.12;
      if (!dn && up) {
        to = SHADOW_COOL;
        t = 0.3;
      } else if (!rt && lf) {
        to = SHADOW_COOL;
        t = 0.24;
      } else if (up && dn && lf && rt) {
        // segunda faixa de sombra (3 tons: luz, base, meia-sombra, sombra)
        if (!m(x + 2, y) || !m(x, y + 2)) {
          to = SHADOW_COOL;
          t = 0.12;
        }
      }
      if (t > 0) out.push([y * w + x, withAlpha(mix(c, to, t * strength), 255)]);
    }
  for (const [p, c] of out) after.set(p % w, Math.floor(p / w), c);
  return n;
}

/** Cores de apoio usadas em todo o gerador. */
export const C = {
  black: hex('#140c16'),
  ink: hex('#221a24'),
  white: hex('#f6f2ea'),
  pureWhite: hex('#ffffff'),
  eye: hex('#1c1420'),
  eyeWhite: hex('#f4f0e8'),
  mouth: hex('#7a3434'),
  tooth: hex('#f4f0e4'),
  gold: hex('#e8b830'),
  goldDark: hex('#a8781a'),
  silver: hex('#c4cad2'),
  red: hex('#d83a3a'),
  green: hex('#5ec04a'),
  leaf: hex('#4fa83a'),
  leafDark: hex('#2e6e2a'),
  neonCyan: hex('#2ee6f0'),
  neonPink: hex('#ff3ea5'),
  neonGreen: hex('#3eff6a'),
  neonPurple: hex('#a43bff'),
  wood: hex('#8a5a32'),
  woodDark: hex('#5a3a20'),
  paper: hex('#efe6cf'),
  metal: hex('#8e949c'),
  metalDark: hex('#5a5e66'),
  warn: hex('#ffc21a'),
  blood: hex('#a8263a'),
  shadow: hex('#000000', 70),
} as const;
