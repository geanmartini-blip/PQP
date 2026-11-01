/**
 * Ruído controlado para texturas: hash inteiro por posição e um campo de ruído de valor (fbm)
 * de 512x512 que se repete sem emenda. Gerado uma vez; amostrar custa uma leitura de array.
 * Puro e determinístico (sem Math.random): roda no Node para os testes.
 */

/** Hash inteiro (32 bits) de uma posição e semente. */
export function hashInt(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash 0..1 de uma posição e semente. */
export function hash01(x: number, y: number, seed = 0): number {
  return hashInt(x, y, seed) / 4294967296;
}

export const NOISE_N = 512;
const MASK = NOISE_N - 1;
let field: Float32Array | undefined;

/** Campo fbm 512x512 normalizado para 0..1, periódico nas duas direções. */
export function noiseField(): Float32Array {
  if (field) return field;
  const N = NOISE_N;
  const f = new Float32Array(N * N);
  // espaçamento da grade e peso de cada oitava
  const octaves: [number, number][] = [
    [64, 0.42],
    [32, 0.26],
    [16, 0.16],
    [8, 0.1],
    [4, 0.06],
  ];
  for (const [sp, wgt] of octaves) {
    const cells = N / sp;
    const lat = new Float32Array(cells * cells);
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) lat[j * cells + i] = hash01(i, j, sp * 31 + 7);
    for (let y = 0; y < N; y++) {
      const fy = y / sp;
      const iy = Math.floor(fy);
      let ty = fy - iy;
      ty = ty * ty * (3 - 2 * ty);
      const y0 = (iy % cells) * cells;
      const y1 = ((iy + 1) % cells) * cells;
      for (let x = 0; x < N; x++) {
        const fx = x / sp;
        const ix = Math.floor(fx);
        let tx = fx - ix;
        tx = tx * tx * (3 - 2 * tx);
        const x0 = ix % cells;
        const x1 = (ix + 1) % cells;
        const a = lat[y0 + x0]! + (lat[y0 + x1]! - lat[y0 + x0]!) * tx;
        const b = lat[y1 + x0]! + (lat[y1 + x1]! - lat[y1 + x0]!) * tx;
        f[y * N + x] = f[y * N + x]! + (a + (b - a) * ty) * wgt;
      }
    }
  }
  // estica para 0..1
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < f.length; i++) {
    lo = Math.min(lo, f[i]!);
    hi = Math.max(hi, f[i]!);
  }
  const k = 1 / Math.max(1e-6, hi - lo);
  for (let i = 0; i < f.length; i++) f[i] = (f[i]! - lo) * k;
  field = f;
  return f;
}

/** Ruído suave 0..1 numa posição de pixel do mundo. `ch` escolhe um canal (deslocado e transposto). */
export function nz(x: number, y: number, ch = 0): number {
  const f = field ?? noiseField();
  if (ch === 0) return f[((y & MASK) << 9) | (x & MASK)]!;
  if (ch === 1) return f[(((x + 211) & MASK) << 9) | ((y + 97) & MASK)]!;
  if (ch === 2) return f[(((y + 331) & MASK) << 9) | ((x + 157) & MASK)]!;
  return f[(((x * 2 + 59) & MASK) << 9) | ((y * 2 + 401) & MASK)]!;
}

/** Matriz de Bayer 4x4 (0..1) para pontilhar entre tons. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export function bayer(x: number, y: number): number {
  return BAYER[((y & 3) << 2) | (x & 3)]!;
}

/** Índice de tom numa rampa de n cores com pontilhado (v em 0..1). */
export function rampIndex(v: number, n: number, x: number, y: number, dither = 0.8): number {
  const k = Math.floor(v * n + (bayer(x, y) - 0.5) * dither);
  return k < 0 ? 0 : k >= n ? n - 1 : k;
}
