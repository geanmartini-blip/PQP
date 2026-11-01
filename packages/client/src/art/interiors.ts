/**
 * Interiores das moradias (Fase 4), puros:
 * - casa de mutirão (Esquerda): piso de tábuas de madeira e paredes de barro com tijolo aparecendo
 *   onde o reboco caiu, viga de madeira e as assinaturas dos vizinhos na parede;
 * - cápsula (Direita): piso de concreto com juntas e parede de chapas de metal com rebite e neon.
 *
 * O quarto sai inteiro num buffer: parede do fundo com WALL_H px acima do piso, paredes laterais de
 * SIDE px e a borda da frente de FRONT px. O piso começa em (floorX, floorY) e cada tile da grade da
 * casa tem 32 px; um móvel na grade (tx, ty) vai em (floorX + tx × 32, floorY + ty × 32 − up).
 *
 * SUGESTÃO: o desenho não está nos docs; sai de housing.json (casa de mutirão, cápsula de aluguel)
 * e das paletas de Arte.md.
 */
import { getData } from '@pqp/shared';
import { C, type Color, hex, light, mix, Pix, prng, shade, withAlpha } from './pixel';

export type InteriorStyle = 'mutirao' | 'capsula';

export const INTERIOR_WALL_H = 48;
export const INTERIOR_SIDE = 8;
export const INTERIOR_FRONT = 6;
const T = 32;

export interface InteriorData {
  pix: Pix;
  style: InteriorStyle;
  tilesW: number;
  tilesH: number;
  floorX: number;
  floorY: number;
}

/** Estilo do interior de um tipo de moradia (housing.json): Esquerda = mutirão, Direita = cápsula. */
export function interiorStyleFor(housingTypeOrStyle: string): InteriorStyle {
  if (housingTypeOrStyle === 'mutirao' || housingTypeOrStyle === 'capsula') return housingTypeOrStyle;
  const t = getData().housing.tipos.find((x) => x.id === housingTypeOrStyle);
  if (t) return t.side === 'direita' ? 'capsula' : 'mutirao';
  return /capsula|apartamento|direita/.test(housingTypeOrStyle) ? 'capsula' : 'mutirao';
}

/** Tamanho em tiles de um tipo de moradia (housing.json), ou o padrão do estilo. */
export function interiorTiles(housingTypeOrStyle: string): { w: number; h: number } {
  const t = getData().housing.tipos.find((x) => x.id === housingTypeOrStyle);
  if (t) return { w: t.tamanho.w, h: t.tamanho.h };
  return interiorStyleFor(housingTypeOrStyle) === 'capsula' ? { w: 3, h: 5 } : { w: 9, h: 8 };
}

// ---------------------------------------------------------------------------
// mutirão

const PLANK = [hex('#6b4429'), hex('#7e5230'), hex('#8a5a32'), hex('#966438')] as const;
const BARRO = hex('#b8865a');
const TIJOLO = hex('#a8503a');

function mutiraoFloor(p: Pix, x0: number, y0: number, w: number, h: number, rnd: () => number): void {
  const ph = 8;
  for (let row = 0; row * ph < h; row++) {
    let x = -Math.floor(rnd() * 40);
    while (x < w) {
      const len = 34 + Math.floor(rnd() * 40);
      const col = PLANK[Math.floor(rnd() * PLANK.length)]!;
      for (let yy = 0; yy < ph && row * ph + yy < h; yy++)
        for (let xx = Math.max(0, x); xx < Math.min(w, x + len); xx++) {
          let c = col;
          if (yy === 0) c = light(col, 0.12);
          if (yy === ph - 1) c = PLANK[0];
          if ((xx * 7 + yy * 13 + row * 3) % 23 === 0) c = shade(col, 0.88);
          p.set(x0 + xx, y0 + row * ph + yy, c);
        }
      if (x > 0) {
        p.vline(x0 + x, y0 + row * ph, y0 + row * ph + ph - 2, hex('#4e3019'));
        p.put(x0 + x + 2, y0 + row * ph + 3, hex('#3a3a3e'));
        p.put(x0 + x - 3, y0 + row * ph + 3, hex('#3a3a3e'));
      }
      x += len;
    }
  }
}

function mutiraoWall(p: Pix, x0: number, y0: number, w: number, h: number, rnd: () => number): void {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const n = rnd();
      p.set(x0 + x, y0 + y, n < 0.08 ? shade(BARRO, 0.88) : n > 0.94 ? light(BARRO, 0.1) : BARRO);
    }
  // tijolo aparecendo onde o reboco caiu
  const patches = Math.max(2, Math.floor(w / 70));
  for (let k = 0; k < patches; k++) {
    const px = Math.floor(rnd() * (w - 30));
    const py = 8 + Math.floor(rnd() * (h - 26));
    const pw = 16 + Math.floor(rnd() * 12);
    const phh = 8 + Math.floor(rnd() * 6);
    for (let y = 0; y < phh; y++)
      for (let x = 0; x < pw; x++) {
        const edge = (x === 0 || x === pw - 1 || y === 0 || y === phh - 1) && rnd() < 0.5;
        if (edge) continue;
        const bx = (x + ((y >> 2) % 2) * 3) % 6;
        const mortar = y % 4 === 3 || bx === 5;
        p.set(x0 + px + x, y0 + py + y, mortar ? hex('#c8b090') : (x + y) % 5 === 0 ? shade(TIJOLO, 0.85) : TIJOLO);
      }
    p.hline(x0 + px, x0 + px + pw - 1, y0 + py + phh, shade(BARRO, 0.75));
  }
  // assinaturas dos vizinhos (uma escrita errada, riscada)
  for (let k = 0; k < Math.max(3, Math.floor(w / 40)); k++) {
    const sx = x0 + 6 + Math.floor(rnd() * (w - 24));
    const sy = y0 + 18 + Math.floor(rnd() * (h - 30));
    let yy = sy;
    for (let i = 0; i < 9; i++) {
      yy += rnd() < 0.5 ? -1 : 1;
      yy = Math.max(sy - 2, Math.min(sy + 2, yy));
      p.put(sx + i, yy, hex('#5a3a20'));
    }
    if (k === 1) p.line(sx - 1, sy, sx + 10, sy, hex('#a8463f'));
  }
  // viga em cima e rodapé de madeira
  p.box(x0, y0, x0 + w - 1, y0 + 5, PLANK[0]);
  p.hline(x0, x0 + w - 1, y0 + 5, hex('#3a2414'));
  p.hline(x0, x0 + w - 1, y0, PLANK[2]);
  for (let x = 12; x < w; x += 48) p.box(x0 + x, y0 + 6, x0 + x + 5, y0 + h - 1, PLANK[1]);
  p.box(x0, y0 + h - 4, x0 + w - 1, y0 + h - 1, PLANK[0]);
  p.hline(x0, x0 + w - 1, y0 + h - 4, PLANK[2]);
  // janelinha com céu a cada 4 tiles
  for (let x = 40; x + 24 < w; x += 128) {
    p.box(x0 + x, y0 + 12, x0 + x + 20, y0 + 30, PLANK[0]);
    p.box(x0 + x + 2, y0 + 14, x0 + x + 18, y0 + 28, hex('#8ac8e8'));
    p.box(x0 + x + 2, y0 + 23, x0 + x + 18, y0 + 28, hex('#5e9e3a'));
    p.vline(x0 + x + 10, y0 + 14, y0 + 28, PLANK[0]);
    p.hline(x0 + x + 2, x0 + x + 18, y0 + 21, PLANK[0]);
  }
}

// ---------------------------------------------------------------------------
// cápsula

const CONC = [hex('#4e4e4c'), hex('#5e5e5b'), hex('#6a6a66'), hex('#767671')] as const;
const METAL = [hex('#2e3238'), hex('#3e444c'), hex('#4c535c'), hex('#5c646e'), hex('#8a929c')] as const;

function capsulaFloor(p: Pix, x0: number, y0: number, w: number, h: number, rnd: () => number): void {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const n = rnd();
      let c: Color = n < 0.1 ? CONC[0] : n < 0.5 ? CONC[1] : n < 0.92 ? CONC[2] : CONC[3];
      if (x % T === 0 || y % T === 0) c = shade(CONC[0], 0.85);
      if (x % T === 1 || y % T === 1) c = CONC[3];
      p.set(x0 + x, y0 + y, c);
    }
  // manchas (o rio entra pelo ralo)
  for (let k = 0; k < Math.max(1, Math.floor((w * h) / 9000)); k++) {
    const cx = x0 + 10 + rnd() * (w - 20);
    const cy = y0 + 10 + rnd() * (h - 20);
    p.ellipse(cx, cy, 5 + rnd() * 5, 3 + rnd() * 3, withAlpha(hex('#3a4a2a'), 70));
  }
  // ralo
  p.box(x0 + w - 12, y0 + h - 12, x0 + w - 6, y0 + h - 6, METAL[0]);
  for (let k = 0; k < 3; k++) p.hline(x0 + w - 11, x0 + w - 7, y0 + h - 11 + k * 2, METAL[3]);
}

function capsulaWall(p: Pix, x0: number, y0: number, w: number, h: number): void {
  const pw = 16;
  for (let x = 0; x < w; x++) {
    const k = x % pw;
    const base = METAL[1 + (Math.floor(x / pw) % 2)]!;
    for (let y = 0; y < h; y++) {
      let c = base;
      if (k === 0) c = METAL[0];
      else if (k === 1) c = METAL[3];
      else if (y > h * 0.55) c = shade(base, 0.92);
      p.set(x0 + x, y0 + y, c);
    }
    if (k === 3 || k === pw - 3) {
      p.set(x0 + x, y0 + 8, METAL[4]);
      p.set(x0 + x, y0 + h - 8, METAL[4]);
    }
  }
  p.hline(x0, x0 + w - 1, y0 + Math.round(h * 0.55), METAL[0]);
  // neon: ciano no alto, rosa no rodapé
  p.box(x0, y0 + 2, x0 + w - 1, y0 + 3, C.neonCyan);
  p.box(x0, y0, x0 + w - 1, y0 + 1, withAlpha(C.neonCyan, 110));
  p.box(x0, y0 + 4, x0 + w - 1, y0 + 6, withAlpha(C.neonCyan, 60));
  p.box(x0, y0 + h - 3, x0 + w - 1, y0 + h - 2, C.neonPink);
  p.box(x0, y0 + h - 6, x0 + w - 1, y0 + h - 4, withAlpha(C.neonPink, 60));
  // tela de aviso do aluguel e grade de ventilação
  const sx = x0 + Math.max(4, Math.floor(w / 2) - 10);
  p.box(sx, y0 + 12, sx + 20, y0 + 24, hex('#0e1424'));
  p.box(sx + 1, y0 + 13, sx + 19, y0 + 23, hex('#2a1238'));
  p.box(sx + 3, y0 + 15, sx + 9, y0 + 16, C.neonPink);
  p.box(sx + 3, y0 + 19, sx + 16, y0 + 20, C.neonCyan);
  p.disk(sx + 17, y0 + 15.5, 1.5, C.red);
  const vx = x0 + 6;
  p.box(vx, y0 + 12, vx + 10, y0 + 20, METAL[0]);
  for (let k = 0; k < 4; k++) p.hline(vx + 1, vx + 9, y0 + 13 + k * 2, METAL[3]);
}

// ---------------------------------------------------------------------------

/** Monta o quarto inteiro (puro). `tilesW` × `tilesH` é a grade do piso. */
export function buildInterior(style: InteriorStyle, tilesW: number, tilesH: number): InteriorData {
  const fw = Math.max(1, tilesW) * T;
  const fh = Math.max(1, tilesH) * T;
  const W = fw + 2 * INTERIOR_SIDE;
  const H = fh + INTERIOR_WALL_H + INTERIOR_FRONT;
  const p = new Pix(W, H);
  const fx = INTERIOR_SIDE;
  const fy = INTERIOR_WALL_H;
  const rnd = prng(`interior_${style}_${tilesW}x${tilesH}`);
  if (style === 'mutirao') {
    mutiraoFloor(p, fx, fy, fw, fh, rnd);
    mutiraoWall(p, fx, 0, fw, INTERIOR_WALL_H, rnd);
  } else {
    capsulaFloor(p, fx, fy, fw, fh, rnd);
    capsulaWall(p, fx, 0, fw, INTERIOR_WALL_H);
    // brilho rosa do rodapé no piso
    for (let k = 0; k < 5; k++) p.hline(fx, fx + fw - 1, fy + k, withAlpha(C.neonPink, 40 - k * 8));
  }
  // sombra de canto (a parede do fundo e as laterais escurecem o piso)
  for (let k = 0; k < 6; k++) {
    p.hline(fx, fx + fw - 1, fy + k, withAlpha(C.black, 70 - k * 11));
    p.vline(fx + k, fy, fy + fh - 1, withAlpha(C.black, 50 - k * 8));
    p.vline(fx + fw - 1 - k, fy, fy + fh - 1, withAlpha(C.black, 30 - k * 5));
  }
  // paredes laterais e a da frente, vistas de cima (só o topo)
  const top = style === 'mutirao' ? light(BARRO, 0.12) : METAL[3];
  const edge = style === 'mutirao' ? PLANK[0] : METAL[0];
  const sideFace = style === 'mutirao' ? shade(BARRO, 0.82) : METAL[2];
  p.box(0, 0, INTERIOR_SIDE - 1, H - 1, top);
  p.box(W - INTERIOR_SIDE, 0, W - 1, H - 1, top);
  p.box(0, H - INTERIOR_FRONT, W - 1, H - 1, top);
  p.box(INTERIOR_SIDE - 2, 0, INTERIOR_SIDE - 1, fy - 1, sideFace);
  p.box(W - INTERIOR_SIDE, 0, W - INTERIOR_SIDE + 1, fy - 1, sideFace);
  p.frame(0, 0, W - 1, H - 1, edge);
  p.vline(INTERIOR_SIDE - 1, fy, H - INTERIOR_FRONT, edge);
  p.vline(W - INTERIOR_SIDE, fy, H - INTERIOR_FRONT, edge);
  p.hline(INTERIOR_SIDE - 1, W - INTERIOR_SIDE, H - INTERIOR_FRONT, edge);
  if (style === 'capsula') {
    p.vline(INTERIOR_SIDE - 3, 2, H - 3, withAlpha(C.neonCyan, 200));
    p.vline(W - INTERIOR_SIDE + 2, 2, H - 3, withAlpha(C.neonCyan, 200));
    p.hline(3, W - 4, H - 3, withAlpha(C.neonPink, 200));
  } else {
    for (let y = 6; y < H - 4; y += 10) {
      p.hline(1, INTERIOR_SIDE - 2, y, mix(top, PLANK[0], 0.35));
      p.hline(W - INTERIOR_SIDE + 1, W - 2, y, mix(top, PLANK[0], 0.35));
    }
  }
  return { pix: p, style, tilesW, tilesH, floorX: fx, floorY: fy };
}
