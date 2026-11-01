/**
 * Móveis da moradia (Fase 4), estilo Habbo, puros como o resto da arte. Cada móvel do catálogo
 * (data/furniture.json) tem 1, 2 ou 4 rotações, vistos de cima levemente inclinados como o mapa.
 *
 * Quadro de um móvel: largura = tiles da pegada × 32 e altura = tiles da pegada × 32 + `up`, onde `up`
 * é quanto o móvel sobe acima da pegada. Para pôr na casa: imagem com origem (0, 0) em
 * (tx × 32, ty × 32 − up) e profundidade pela linha de baixo da pegada (ty + footH).
 * Itens de parede (parede: true) desenham na parede acima da pegada e não giram.
 *
 * Rotação: 0 de frente (virado para baixo), 1 virado para a esquerda, 2 de costas, 3 para a direita.
 * Nas rotações ímpares a pegada troca largura por altura. Móvel com 2 rotações repete 0 e 1; com 1,
 * é simétrico (pegada quadrada). A 3 é o espelho da 1.
 *
 * SUGESTÃO: o desenho de cada móvel não está nos docs; sai do nome e da piada no catálogo e das
 * paletas de Arte.md (Esquerda em verde, terra e madeira; Direita em neon sobre concreto).
 */
import { getData } from '@pqp/shared';
import { drawText, textWidth } from './font';
import { C, type Color, hex, light, mix, Pix, shade, withAlpha } from './pixel';
import { packFrames, type SheetData } from './sheet';

export const FURNITURE_KEY = 'moveis';
const T = 32;

const WOOD = [hex('#4e3019'), hex('#6b4429'), hex('#8a5a32'), hex('#a8743f'), hex('#c4935e')] as const;
const STRAW = [hex('#7a5a22'), hex('#b8943e'), hex('#d8b860'), hex('#ecd690')] as const;
const CLAY = [hex('#6a3220'), hex('#a8542e'), hex('#c87a48'), hex('#e0a070')] as const;
const STEEL = [hex('#2e3238'), hex('#4a5058'), hex('#6e767e'), hex('#9aa2aa'), hex('#c8ced4')] as const;
const WHITE = [hex('#a8aeb8'), hex('#d4d8e0'), hex('#eef0f4')] as const;
const DARK = [hex('#16141c'), hex('#24222c'), hex('#383644')] as const;
const PINK = hex('#ff4ab0');
const CYAN = C.neonCyan;
const NGREEN = C.neonGreen;
const PURPLE = C.neonPurple;
const SHADOW = hex('#000000', 56);

/** Contexto de desenho: `p` leva contorno; `sh` fica por baixo (sombra, brilho no chão); `gl` por cima, sem contorno. */
export interface FCtx {
  p: Pix;
  sh: Pix;
  gl: Pix;
  rot: number;
  /** pegada em px já girada */
  W: number;
  H: number;
  up: number;
}

interface FurnDef {
  rots: 1 | 2 | 4;
  up: number;
  draw: (c: FCtx) => void;
}

interface Faces {
  tx0: number;
  ty0: number;
  tx1: number;
  ty1: number;
  fx0: number;
  fy0: number;
  fx1: number;
  fy1: number;
}

/** y de tela de um ponto do chão (fy) a uma altura (elev). */
const S = (c: FCtx, fy: number, elev = 0) => Math.round(c.up + fy - elev);

/**
 * Caixa sobre o chão: retângulo da pegada (x, y, w, d) em px, altura h, apoiada em z. Desenha o
 * tampo (claro) e a frente; devolve os retângulos das duas faces em coordenadas de tela.
 */
function box(c: FCtx, x: number, y: number, w: number, d: number, h: number, col: Color, z = 0, top?: Color): Faces {
  const p = c.p;
  const ty = Math.round(c.up + y - h - z);
  const tc = top ?? light(col, 0.2);
  x = Math.round(x);
  w = Math.round(w);
  d = Math.round(d);
  if (d > 0) {
    p.box(x, ty, x + w - 1, ty + d - 1, tc);
    p.hline(x, x + w - 1, ty, light(tc, 0.18));
  }
  const fy = ty + d;
  if (h > 0) {
    p.box(x, fy, x + w - 1, fy + h - 1, col);
    if (w > 2) p.vline(x + w - 1, fy, fy + h - 1, shade(col, 0.8));
    p.hline(x, x + w - 1, fy + h - 1, shade(col, 0.72));
  }
  return { tx0: x, ty0: ty, tx1: x + w - 1, ty1: ty + d - 1, fx0: x, fy0: fy, fx1: x + w - 1, fy1: fy + h - 1 };
}

function shadow(c: FCtx, x: number, y: number, w: number, d: number): void {
  c.sh.ellipse(x + w / 2, c.up + y + d / 2 + 1, w / 2 + 1.5, d / 2 + 1.5, SHADOW);
}

/** Cilindro em pé: centro do chão (cx, cy), raio r, altura h. Devolve o y de tela do tampo. */
function cylinder(c: FCtx, cx: number, cy: number, r: number, h: number, col: Color, top: Color, z = 0): number {
  const by = c.up + cy - z;
  const ty = by - h;
  const ry = Math.max(1.5, r * 0.45);
  const x0 = Math.ceil(cx - r - 0.5);
  const x1 = Math.ceil(cx + r - 0.5) - 1;
  c.p.ellipse(cx, by, r, ry, shade(col, 0.72));
  c.p.box(x0, Math.round(ty), x1, Math.round(by), col);
  c.p.vline(x0, Math.round(ty), Math.round(by), light(col, 0.15));
  c.p.vline(x1, Math.round(ty), Math.round(by), shade(col, 0.78));
  c.p.vline(x1 - 1, Math.round(ty), Math.round(by), shade(col, 0.88));
  c.p.ellipse(cx, ty, r, ry, top);
  return Math.round(ty);
}

function glowDisk(p: Pix, cx: number, cy: number, r: number, col: Color): void {
  for (let k = 3; k >= 1; k--) p.disk(cx, cy, r * (k / 3) + 0.5, withAlpha(col, 26 + (3 - k) * 30));
}

/** Gira um buffer por um ângulo pequeno (quadro torto), vizinho mais próximo. */
function rotatePix(src: Pix, ang: number): Pix {
  const out = new Pix(src.w + 4, src.h + 4);
  const cx = out.w / 2;
  const cy = out.h / 2;
  const cs = Math.cos(-ang);
  const sn = Math.sin(-ang);
  for (let y = 0; y < out.h; y++)
    for (let x = 0; x < out.w; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const sx = Math.floor(dx * cs - dy * sn + src.w / 2);
      const sy = Math.floor(dx * sn + dy * cs + src.h / 2);
      const col = src.get(sx, sy);
      if ((col & 255) > 0) out.set(x, y, col);
    }
  return out;
}

function textFit(p: Pix, x: number, y: number, w: number, text: string, col: Color): void {
  let t = text;
  while (t.length > 1 && textWidth(t, 1) - 1 > w) t = t.slice(0, -1);
  drawText(p, x + Math.max(0, Math.floor((w - textWidth(t, 1) + 1) / 2)), y, t, col, 1);
}

/** Retângulo deitado no meio da pegada, no eixo comprido. */
function inset(c: FCtx, short: number, m = 3): [number, number, number, number, boolean] {
  const hz = c.W >= c.H;
  if (hz) return [m, Math.round((c.H - short) / 2), c.W - 2 * m, short, true];
  return [Math.round((c.W - short) / 2), m, short, c.H - 2 * m, false];
}

// ---------------------------------------------------------------------------
// formas comuns: cadeira, cama, cápsula

interface ChairOpt {
  seat: Color;
  back: Color;
  leg: Color;
  z: number;
  backH: number;
  m?: number;
  arm?: Color;
  base?: 'pernas' | 'balanco' | 'rodinhas' | 'bloco';
}

/** Cadeira genérica nas rotações 0, 1 e 2 (a 3 sai espelhada). Devolve as faces do encosto. */
function chair(c: FCtx, o: ChairOpt): Faces {
  const m = o.m ?? 7;
  const x = m;
  const y = m + 1;
  const w = c.W - 2 * m;
  const d = c.H - 2 * m - 1;
  shadow(c, x, y, w, d);
  const base = o.base ?? 'pernas';
  if (base === 'balanco') {
    const k = shade(o.leg, 0.85);
    if (c.rot % 2 === 0)
      for (const lx of [x, x + w - 2]) {
        box(c, lx, y - 2, 2, d + 4, 2, k);
        c.p.put(lx, S(c, y - 3, 2), k);
        c.p.put(lx, S(c, y + d + 1, 1), k);
      }
    else
      for (const ly of [y, y + d - 2]) {
        box(c, x - 3, ly, w + 6, 2, 2, k);
        c.p.put(x - 4, S(c, ly, 3), k);
        c.p.put(x + w + 3, S(c, ly, 3), k);
      }
  }
  if (base === 'rodinhas') {
    const cx = x + w / 2;
    const cy = y + d / 2;
    for (const [ax, ay] of [
      [-6, 0],
      [6, 0],
      [-4, 4],
      [4, 4],
      [0, -3],
    ] as const) {
      c.p.line(cx, S(c, cy, 1), cx + ax, S(c, cy + ay, 1), STEEL[1]);
      c.p.disk(cx + ax, S(c, cy + ay, 0), 1.2, DARK[0]);
    }
    box(c, cx - 1, cy - 1, 2, 2, o.z, STEEL[2]);
  } else if (base === 'bloco') {
    box(c, x + 1, y + 1, w - 2, d - 2, o.z, shade(o.seat, 0.7));
  } else {
    const lz = base === 'balanco' ? o.z - 2 : o.z;
    for (const [lx, ly] of [
      [x + 1, y + 1],
      [x + w - 3, y + 1],
      [x + 1, y + d - 3],
      [x + w - 3, y + d - 3],
    ] as const)
      box(c, lx, ly, 2, 2, lz, o.leg, base === 'balanco' ? 2 : 0);
  }
  const seat = box(c, x, y, w, d, 3, o.seat, o.z);
  c.p.hline(seat.tx0 + 1, seat.tx1 - 1, seat.ty0 + 1, light(o.seat, 0.3));
  const t = 3;
  const zb = o.z + 3;
  const arms = () => {
    if (!o.arm) return;
    if (c.rot % 2 === 0) {
      box(c, x - 1, y, 3, d, 6, o.arm, zb);
      box(c, x + w - 2, y, 3, d, 6, o.arm, zb);
    } else {
      box(c, x, y - 1, w, 3, 6, o.arm, zb);
      box(c, x, y + d - 2, w, 3, 6, o.arm, zb);
    }
  };
  if (c.rot !== 2) arms();
  let back: Faces;
  if (c.rot === 0) back = box(c, x, y, w, t, o.backH, o.back, zb);
  else if (c.rot === 2) back = box(c, x, y + d - t, w, t, o.backH, o.back, zb);
  else back = box(c, x + w - t, y, t, d, o.backH, o.back, zb);
  if (c.rot === 2) arms();
  return back;
}

interface BedOpt {
  frame: Color;
  mat: Color;
  blanket: Color;
  pillow: Color;
  z: number;
  frameH: number;
  headH: number;
  pattern?: (p: Pix, x: number, y: number) => Color | undefined;
}

/** Cama: cabeceira do lado oposto ao que o móvel encara. */
function bed(c: FCtx, o: BedOpt): void {
  const x = 3;
  const y = 4;
  const w = c.W - 6;
  const d = c.H - 7;
  shadow(c, x, y, w, d);
  const head = () => {
    if (c.rot === 0) box(c, x, y - 1, w, 3, o.headH + o.frameH, o.frame, o.z);
    else if (c.rot === 2) box(c, x, y + d - 2, w, 3, o.headH + o.frameH, o.frame, o.z);
    else box(c, x + w - 3, y, 3, d, o.headH + o.frameH, o.frame, o.z);
  };
  if (o.z > 0) for (const [lx, ly] of [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + d - 4], [x + w - 4, y + d - 4]] as const) box(c, lx, ly, 2, 2, o.z, STEEL[1]);
  if (c.rot === 0) head();
  box(c, x, y, w, d, o.frameH, o.frame, o.z);
  const mt = box(c, x + 1, y + 1, w - 2, d - 2, 3, shade(o.mat, 0.9), o.z + o.frameH, o.mat);
  // travesseiro e coberta: a cabeceira fica em cima (0), embaixo (2) ou à direita (1)
  const mw = mt.tx1 - mt.tx0 + 1;
  const mh = mt.ty1 - mt.ty0 + 1;
  if (c.rot % 2 === 0) {
    const py = c.rot === 0 ? mt.ty0 + 2 : mt.ty1 - 8;
    c.p.box(mt.tx0 + 3, py, mt.tx1 - 3, py + 5, o.pillow);
    c.p.hline(mt.tx0 + 3, mt.tx1 - 3, py, light(o.pillow, 0.3));
    c.p.hline(mt.tx0 + 3, mt.tx1 - 3, py + 5, shade(o.pillow, 0.8));
    const by0 = c.rot === 0 ? mt.ty0 + Math.round(mh * 0.42) : mt.ty0;
    const by1 = c.rot === 0 ? mt.fy1 : mt.ty0 + Math.round(mh * 0.56);
    for (let yy = by0; yy <= by1; yy++)
      for (let xx = mt.tx0 - 1; xx <= mt.tx1 + 1; xx++) c.p.put(xx, yy, o.pattern?.(c.p, xx, yy) ?? o.blanket);
    c.p.hline(mt.tx0 - 1, mt.tx1 + 1, by0, light(o.blanket, 0.25));
  } else {
    const px = mt.tx1 - 8;
    c.p.box(px, mt.ty0 + 2, px + 5, mt.ty1 - 2, o.pillow);
    c.p.vline(px, mt.ty0 + 2, mt.ty1 - 2, light(o.pillow, 0.3));
    const bx1 = mt.tx0 + Math.round(mw * 0.55);
    for (let yy = mt.ty0; yy <= mt.fy1 + 1; yy++)
      for (let xx = mt.tx0 - 1; xx <= bx1; xx++) c.p.put(xx, yy, o.pattern?.(c.p, xx, yy) ?? o.blanket);
    c.p.vline(bx1, mt.ty0, mt.fy1 + 1, shade(o.blanket, 0.8));
  }
  if (c.rot !== 0) head();
}

// ---------------------------------------------------------------------------
// catálogo de desenhos (ids de data/furniture.json)

const PATCH = [hex('#a8463f'), hex('#5e9e3a'), hex('#e8c040'), hex('#3a8ac0'), hex('#c87a48'), hex('#8a5aa8'), hex('#f1e6c8')];

export const FURNITURE_ART: Record<string, FurnDef> = {
  // ============================================================ Esquerda
  rede_de_varanda: {
    rots: 2,
    up: 22,
    draw: (c) => {
      const cols = [hex('#c8463a'), hex('#e8b838'), hex('#4e9a3a'), hex('#3a7ac0')];
      if (c.W > c.H) {
        shadow(c, 8, 12, c.W - 16, 10);
        box(c, 2, 14, 4, 4, 30, WOOD[1]);
        const x0 = 6;
        const x1 = c.W - 7;
        for (let x = x0; x <= x1; x++) {
          const t = (x - x0) / (x1 - x0);
          const sag = Math.sin(t * Math.PI);
          const yt = S(c, 14, 26) + 2 + Math.round(sag * 15);
          const th = 2 + Math.round(sag * 5);
          for (let k = 0; k <= th; k++) c.p.put(x, yt + k, k === th ? shade(cols[(x >> 3) % 4]!, 0.7) : cols[(x >> 3) % 4]!);
          if (sag > 0.2 && x % 2 === 0) c.p.put(x, yt + th + 1, C.paper);
        }
        c.p.line(4, S(c, 14, 28), x0, S(c, 14, 26) + 2, STRAW[3]);
        c.p.line(c.W - 4, S(c, 14, 28), x1, S(c, 14, 26) + 2, STRAW[3]);
        box(c, c.W - 6, 14, 4, 4, 30, WOOD[1]);
      } else {
        shadow(c, 10, 8, 12, c.H - 16);
        box(c, 14, 2, 4, 4, 30, WOOD[1]);
        const y0 = 8;
        const y1 = c.H - 10;
        for (let y = y0; y <= y1; y++) {
          const t = (y - y0) / (y1 - y0);
          const sag = Math.sin(t * Math.PI);
          const sy = S(c, y, 24 - sag * 12);
          const hw = 3 + Math.round(sag * 5);
          c.p.hline(16 - hw, 16 + hw, sy, cols[(y >> 3) % 4]!);
          c.p.hline(16 - hw, 16 + hw, sy + 1, cols[(y >> 3) % 4]!);
          c.p.put(16 + hw, sy, shade(cols[(y >> 3) % 4]!, 0.75));
        }
        box(c, 14, c.H - 6, 4, 4, 30, WOOD[1]);
      }
    },
  },
  banco_de_madeira: {
    rots: 2,
    up: 14,
    draw: (c) => {
      const [x, y, w, d, hz] = inset(c,9, 4);
      shadow(c, x, y, w, d);
      const z = 8;
      const legs: [number, number, number][] = [
        [x + 1, y + 1, z],
        [x + w - 3, y + 1, z],
        [x + 1, y + d - 3, z - 2],
        [x + w - 3, y + d - 3, z],
      ];
      for (const [lx, ly, lz] of legs) box(c, lx, ly, 2, 2, lz, WOOD[1], z - lz);
      // calço de papel (uma ata dobrada) sob a perna curta
      box(c, x, y + d - 4, 4, 3, 2, C.paper);
      const s = box(c, x, y, w, d, 3, WOOD[2], z, WOOD[3]);
      if (hz) for (let yy = s.ty0 + 3; yy < s.ty1; yy += 3) c.p.hline(s.tx0 + 1, s.tx1 - 1, yy, WOOD[1]);
      else for (let xx = s.tx0 + 3; xx < s.tx1; xx += 3) c.p.vline(xx, s.ty0 + 1, s.ty1, WOOD[1]);
    },
  },
  mesa_da_roda: {
    rots: 1,
    up: 10,
    draw: (c) => {
      const toco = (cx: number, cy: number) => {
        cylinder(c, cx, cy, 6, 9, WOOD[1], WOOD[3]);
        c.p.ring(cx, S(c, cy, 9), 3.5, 1.6, 1, WOOD[2]);
      };
      shadow(c, 10, 14, 76, 70);
      toco(48, 8);
      toco(8, 50);
      toco(88, 50);
      box(c, 42, 44, 12, 8, 14, WOOD[0]);
      const cy = S(c, 46, 16);
      c.p.ellipse(48, cy + 3, 38, 30, WOOD[1]);
      c.p.ellipse(48, cy, 38, 30, WOOD[2]);
      c.p.ring(48, cy, 28, 22, 1, shade(WOOD[2], 0.86));
      c.p.ring(48, cy, 16, 12, 1, shade(WOOD[2], 0.86));
      c.p.ellipse(36, cy - 14, 10, 4, withAlpha(WOOD[4], 120));
      // papéis da ata, cuia de chimarrão e caneca
      c.p.box(28, cy - 8, 42, cy + 2, C.paper);
      for (let k = 0; k < 4; k++) c.p.hline(30, 40, cy - 6 + k * 2, hex('#8a8070'));
      c.p.ellipse(62, cy + 4, 5, 4, hex('#6a8a3a'));
      c.p.ellipse(62, cy + 2, 3, 1.5, hex('#3e5a22'));
      c.p.vline(64, cy - 4, cy + 2, C.silver);
      cylinder(c, 54, 34, 2.5, 4, C.white, hex('#5a3a20'), 16);
      toco(48, 92);
    },
  },
  retrato_da_nayra: {
    rots: 1,
    up: 44,
    draw: (c) => {
      const pr = new Pix(20, 24);
      pr.box(0, 0, 19, 23, C.gold);
      pr.frame(0, 0, 19, 23, C.goldDark);
      pr.box(2, 2, 17, 21, hex('#c8a060'));
      pr.ellipse(10, 21, 7, 5, hex('#3e7a3a'));
      pr.ellipse(10, 10, 4.5, 5.5, hex('#8a5a3a'));
      pr.disk(10, 4.5, 3, hex('#1e1416'));
      pr.box(6, 5, 14, 7, hex('#1e1416'));
      pr.set(8, 10, C.ink);
      pr.set(12, 10, C.ink);
      pr.hline(9, 11, 13, hex('#6a2a2a'));
      pr.box(15, 16, 16, 17, C.red);
      const rp = rotatePix(pr, 0.14);
      c.p.line(16, 2, 9, 8, C.ink);
      c.p.line(16, 2, 23, 7, C.ink);
      c.p.put(16, 2, C.goldDark);
      c.p.blit(rp, 4, 6);
    },
  },
  horta_em_vaso: {
    rots: 1,
    up: 22,
    draw: (c) => {
      shadow(c, 7, 16, 18, 10);
      const v = box(c, 7, 16, 18, 10, 10, CLAY[1], 0, CLAY[2]);
      c.p.box(v.tx0 + 1, v.ty0 + 1, v.tx1 - 1, v.ty1, hex('#4a3020'));
      c.p.hline(v.fx0, v.fx1, v.fy0 + 2, CLAY[0]);
      const greens = [hex('#2e6e2a'), hex('#3e8a32'), hex('#5aa83e')];
      const leaves: [number, number, number, number][] = [
        [11, -4, 5, 3.5],
        [21, -5, 5, 3.5],
        [16, -9, 5.5, 4],
        [12, -12, 4, 3],
        [20, -13, 4, 3],
      ];
      for (const [k, [lx, ly, rx, ry]] of leaves.entries()) {
        const col = greens[k % 3]!;
        c.p.ellipse(lx, v.ty0 + ly + 4, rx, ry, col);
        c.p.line(lx, v.ty0 + ly + 4 + ry - 1, 16, v.ty0 + 3, shade(col, 0.7));
        c.p.put(lx - 1, v.ty0 + ly + 3, light(col, 0.35));
      }
      // furinho de lagarta (a discussão de quem é a couve)
      c.p.put(16, v.ty0 - 5, hex('#1e3a14'));
    },
  },
  esteira_de_palha: {
    rots: 1,
    up: 2,
    draw: (c) => {
      const x0 = 4;
      const x1 = c.W - 5;
      const y0 = c.up + 4;
      const y1 = c.up + c.H - 5;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const a = ((x >> 2) + (y >> 2)) & 1;
          const k = a ? (x + y) % 4 === 0 : (x - y) % 4 === 0;
          c.p.set(x, y, k ? STRAW[0] : a ? STRAW[2] : STRAW[1]);
        }
      c.p.frame(x0, y0, x1, y1, STRAW[0]);
      for (let y = y0 + 1; y < y1; y += 2) {
        c.p.hline(x0 - 3, x0 - 1, y, STRAW[3]);
        c.p.hline(x1 + 1, x1 + 3, y, STRAW[3]);
      }
    },
  },
  cadeira_de_balanco: {
    rots: 4,
    up: 26,
    draw: (c) => {
      const b = chair(c, { seat: WOOD[2], back: WOOD[3], leg: WOOD[1], z: 8, backH: 16, base: 'balanco', m: 8 });
      if (b.fx1 - b.fx0 > 6) for (let x = b.fx0 + 2; x < b.fx1 - 1; x += 3) c.p.vline(x, b.fy0 + 2, b.fy1 - 1, WOOD[1]);
      // almofada de crochê
      if (c.rot === 0) c.p.box(b.fx0 + 2, b.fy1 + 1, b.fx1 - 2, b.fy1 + 4, hex('#c8463a'));
    },
  },
  bau_entalhado: {
    rots: 2,
    up: 16,
    draw: (c) => {
      const [x, y, w, d] = inset(c,14, 4);
      shadow(c, x, y, w, d);
      const f = box(c, x, y, w, d, 13, WOOD[1], 0, WOOD[2]);
      c.p.hline(f.fx0, f.fx1, f.fy0 + 3, WOOD[0]);
      c.p.hline(f.tx0, f.tx1, f.ty1 - 1, light(WOOD[2], 0.15));
      // entalhe em zigue-zague
      for (let xx = f.fx0 + 2; xx <= f.fx1 - 2; xx++) c.p.put(xx, f.fy0 + 7 + (((xx >> 1) & 1) === 0 ? 0 : 1), WOOD[3]);
      for (const xx of [f.fx0, f.fx1 - 1]) c.p.box(xx, f.fy0, xx + 1, f.fy1, STEEL[2]);
      const mx = Math.round((f.fx0 + f.fx1) / 2);
      c.p.box(mx - 2, f.fy0 + 2, mx + 1, f.fy0 + 6, C.gold);
      c.p.put(mx - 1, f.fy0 + 4, C.ink);
    },
  },
  fogao_a_lenha: {
    rots: 2,
    up: 40,
    draw: (c) => {
      const [x, y, w, d, hz] = inset(c,16, 3);
      shadow(c, x, y, w, d);
      const f = box(c, x, y, w, d, 14, CLAY[1], 0, hex('#2a2626'));
      for (let k = 0; k < 10; k++) c.p.put(f.fx0 + ((k * 7) % (w - 2)) + 1, f.fy0 + 2 + ((k * 5) % 10), CLAY[2]);
      const bs: [number, number][] = hz
        ? [
            [x + w * 0.3, y + d / 2],
            [x + w * 0.62, y + d / 2],
          ]
        : [
            [x + w / 2, y + d * 0.35],
            [x + w / 2, y + d * 0.68],
          ];
      for (const [bx, by] of bs) c.p.ring(bx, S(c, by, 14), 4.5, 3, 1, hex('#5a5452'));
      // panela de feijão
      const [px, py] = bs[0]!;
      const pt = cylinder(c, px, py, 4.5, 6, hex('#3a3a3e'), hex('#5a3418'), 14);
      c.p.put(Math.round(px) - 1, pt, hex('#7a4a28'));
      for (let k = 0; k < 3; k++) c.gl.disk(px + (k % 2 ? 2 : -1), pt - 4 - k * 4, 2 + k * 0.4, withAlpha(C.white, 80 - k * 20));
      // boca do fogo
      const mx = hz ? f.fx0 + 4 : f.fx0 + 5;
      c.p.box(mx, f.fy0 + 5, mx + 8, f.fy1 - 2, hex('#1a0e0a'));
      c.p.box(mx + 2, f.fy1 - 4, mx + 6, f.fy1 - 2, hex('#e8701a'));
      c.p.put(mx + 4, f.fy1 - 5, hex('#ffd040'));
      c.gl.disk(mx + 4, f.fy1 - 3, 4, withAlpha(hex('#ff9a3a'), 60));
      // chaminé
      box(c, x + w - 7, y + 1, 4, 3, 24, STEEL[1], 14, STEEL[0]);
    },
  },
  tambor_da_roda: {
    rots: 1,
    up: 18,
    draw: (c) => {
      shadow(c, 8, 14, 16, 8);
      const ty = cylinder(c, 16, 18, 8, 14, hex('#a8542e'), hex('#e8dcb8'));
      const by = S(c, 18);
      c.p.hline(9, 22, ty + 3, C.red);
      c.p.hline(9, 22, by - 2, C.red);
      for (let x = 9; x <= 21; x += 4) {
        c.p.line(x, ty + 4, x + 2, by - 3, C.paper);
        c.p.line(x + 2, ty + 4, x, by - 3, C.paper);
      }
      c.p.ring(16, ty, 8, 3.6, 1, hex('#b8a888'));
      c.p.line(19, by + 3, 27, by - 1, WOOD[3]);
    },
  },
  lamparina_benzida: {
    rots: 1,
    up: 24,
    draw: (c) => {
      shadow(c, 9, 14, 14, 10);
      const s = box(c, 10, 15, 12, 9, 8, WOOD[1], 0, WOOD[2]);
      c.p.ellipse(16, s.ty0 + 3, 5, 2.5, CLAY[2]);
      c.p.ellipse(16, s.ty0 + 2, 3.5, 1.4, CLAY[0]);
      c.p.put(20, s.ty0 + 1, CLAY[3]);
      const fy = s.ty0 - 2;
      c.p.box(15, fy - 3, 16, fy, hex('#c8f070'));
      c.p.put(15, fy - 4, hex('#f0ff9a'));
      c.p.put(16, fy - 1, hex('#ffe060'));
      glowDisk(c.gl, 16, fy - 2, 10, hex('#c8f08a'));
      for (const [gx, gy] of [[8, fy - 6], [24, fy - 2], [11, fy + 4]] as const) c.gl.put(gx, gy, hex('#e8ff9a', 200));
    },
  },
  estante_de_atas: {
    rots: 2,
    up: 44,
    draw: (c) => {
      const hz = c.W > c.H;
      const [x, y, w, d] = hz ? [3, 18, c.W - 6, 9] : [10, 3, 12, c.H - 6];
      shadow(c, x, y, w, d);
      const f = box(c, x, y, w, d, 40, WOOD[1], 0, WOOD[2]);
      const rows = 4;
      const rh = Math.floor((f.fy1 - f.fy0) / rows);
      for (let r = 0; r < rows; r++) {
        const sy = f.fy0 + r * rh;
        c.p.box(f.fx0 + 2, sy + 2, f.fx1 - 2, sy + rh - 1, WOOD[0]);
        c.p.hline(f.fx0, f.fx1, sy + rh, WOOD[3]);
        for (let xx = f.fx0 + 3; xx < f.fx1 - 2; xx += 3) {
          const hh = 3 + ((xx * 7 + r * 3) % 4);
          const pc = (xx + r) % 3 === 0 ? hex('#e8d8a8') : C.paper;
          c.p.box(xx, sy + rh - hh, xx + 1, sy + rh - 1, pc);
        }
      }
      // atas empilhadas no tampo
      c.p.box(f.tx0 + 2, f.ty0 - 3, f.tx0 + 8, f.ty0 + 1, C.paper);
      c.p.hline(f.tx0 + 2, f.tx0 + 8, f.ty0 - 1, hex('#b8ae98'));
    },
  },
  cama_de_palha: {
    rots: 4,
    up: 16,
    draw: (c) =>
      bed(c, {
        frame: WOOD[1],
        mat: STRAW[2],
        blanket: PATCH[0]!,
        pillow: hex('#f1e6c8'),
        z: 0,
        frameH: 6,
        headH: 8,
        pattern: (_p, x, y) => PATCH[((x >> 2) * 3 + (y >> 2) * 5) % PATCH.length]!,
      }),
  },
  quadro_de_cotas: {
    rots: 1,
    up: 44,
    draw: (c) => {
      c.p.box(4, 4, 59, 36, WOOD[1]);
      c.p.box(6, 6, 57, 34, hex('#c8a070'));
      c.p.box(9, 8, 54, 32, C.paper);
      drawText(c.p, 11, 10, 'COTAS', hex('#a8463f'));
      drawText(c.p, 43, 10, 'EU', C.ink);
      // a sua cota (pequena) e a do vizinho (enorme)
      const base = 31;
      for (const [bx, bh, col] of [
        [12, 4, hex('#5e9e3a')],
        [20, 6, hex('#5e9e3a')],
        [28, 5, hex('#5e9e3a')],
        [40, 13, hex('#a8463f')],
      ] as const) {
        c.p.box(bx, base - bh, bx + (bx === 40 ? 9 : 5), base, col);
      }
      c.p.hline(10, 53, base + 1, C.ink);
      for (const [px, py] of [[8, 7], [55, 7]] as const) c.p.box(px, py, px + 1, py + 1, C.red);
    },
  },
  bandeira_do_raiz_fc: {
    rots: 1,
    up: 44,
    draw: (c) => {
      c.p.box(3, 5, 60, 6, WOOD[2]);
      c.p.disk(3, 5.5, 1.8, WOOD[3]);
      c.p.disk(60, 5.5, 1.8, WOOD[3]);
      for (let x = 6; x <= 57; x++) {
        const off = Math.round(Math.sin(x / 7) * 1.5);
        for (let y = 7; y <= 33; y++) {
          const yy = y + off;
          const band = Math.abs(x - 6 - (y - 7) * 1.9) < 5;
          let col = band ? hex('#8a5a32') : hex('#3e8a32');
          if (Math.sin(x / 7) > 0.7) col = light(col, 0.12);
          if (Math.sin(x / 7) < -0.7) col = shade(col, 0.85);
          c.p.set(x, yy, col);
        }
      }
      drawText(c.p, 20, 15, 'RAIZ', C.white);
      drawText(c.p, 26, 24, 'FC', hex('#e8c040'));
      for (let x = 7; x <= 57; x += 3) c.p.put(x, 35 + Math.round(Math.sin(x / 7) * 1.5), hex('#e8c040'));
    },
  },
  tapete_de_retalhos: {
    rots: 2,
    up: 2,
    draw: (c) => {
      const x0 = 3;
      const y0 = c.up + 3;
      const x1 = c.W - 4;
      const y1 = c.up + c.H - 4;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const i = (x - x0) >> 3;
          const j = (y - y0) >> 3;
          const col = PATCH[(i * 3 + j * 5 + ((i * j) % 2)) % PATCH.length]!;
          const seam = (x - x0) % 8 === 0 || (y - y0) % 8 === 0;
          c.p.set(x, y, seam ? ((x + y) % 2 === 0 ? C.paper : shade(col, 0.8)) : (x + y) % 7 === 0 ? shade(col, 0.88) : col);
        }
      c.p.frame(x0, y0, x1, y1, hex('#5a3a20'));
    },
  },
  filtro_de_barro: {
    rots: 1,
    up: 30,
    draw: (c) => {
      shadow(c, 8, 14, 16, 8);
      cylinder(c, 16, 18, 7.5, 12, CLAY[2], CLAY[1]);
      const t2 = cylinder(c, 16, 18, 7, 11, CLAY[2], CLAY[3], 12);
      c.p.hline(9, 22, S(c, 18, 12), CLAY[0]);
      c.p.ellipse(16, t2 - 1, 3, 1.4, CLAY[1]);
      c.p.box(15, t2 - 4, 16, t2 - 1, CLAY[0]);
      // torneira e gota
      c.p.box(11, S(c, 18, 5), 13, S(c, 18, 4), STEEL[3]);
      c.p.put(11, S(c, 18, 3), STEEL[2]);
      c.gl.put(11, S(c, 18, 1), hex('#8ad8f0', 220));
    },
  },
  altar_dos_espiritos: {
    rots: 2,
    up: 32,
    draw: (c) => {
      const [x, y, w, d, hz] = inset(c,12, 3);
      shadow(c, x, y, w, d);
      const f = box(c, x, y, w, d, 10, WOOD[1], 0, C.paper);
      c.p.box(f.fx0, f.fy0, f.fx1, f.fy0 + 3, C.paper);
      for (let xx = f.fx0; xx <= f.fx1; xx += 2) c.p.put(xx, f.fy0 + 4, C.red);
      c.p.hline(f.tx0, f.tx1, f.ty0 + 1, C.red);
      const along = (t: number): [number, number] => (hz ? [x + w * t, y + d / 2] : [x + w / 2, y + d * t]);
      for (const t of [0.12, 0.88]) {
        const [vx, vy] = along(t);
        const top = box(c, vx - 1, vy - 1, 2, 2, 6, C.paper, 10);
        c.p.put(Math.round(vx) - 1, top.ty0 - 2, hex('#ffd040'));
        c.p.put(Math.round(vx) - 1, top.ty0 - 1, hex('#ff8a20'));
        glowDisk(c.gl, vx - 0.5, top.ty0 - 2, 5, hex('#ffd27a'));
      }
      const [mx, my] = along(0.5);
      const tt = box(c, mx - 3, my - 2, 6, 3, 13, WOOD[2], 10, WOOD[3]);
      c.p.put(tt.fx0 + 1, tt.fy0 + 3, hex('#9cf08a'));
      c.p.put(tt.fx1 - 1, tt.fy0 + 3, hex('#9cf08a'));
      c.p.hline(tt.fx0 + 1, tt.fx1 - 1, tt.fy0 + 7, WOOD[0]);
      for (const [t, col] of [[0.3, hex('#e8c040')], [0.7, hex('#d84a8a')]] as const) {
        const [fx, fy] = along(t);
        c.p.disk(fx, S(c, fy, 12), 1.6, col);
        c.p.put(Math.round(fx), S(c, fy, 10), C.leaf);
      }
      for (const [gx, gy, r] of [[mx - 8, tt.ty0 - 6, 2.2], [mx + 7, tt.ty0 - 10, 1.8], [mx, tt.ty0 - 14, 1.5]] as const) c.gl.disk(gx, gy, r, hex('#9cf08a', 110));
    },
  },
  megafone_de_lata: {
    rots: 4,
    up: 14,
    draw: (c) => {
      shadow(c, 7, 12, 18, 12);
      const tin = STEEL[3];
      if (c.rot === 0) {
        c.p.box(14, S(c, 22, 4), 17, S(c, 22, 0), STEEL[1]);
        c.p.ellipse(16, S(c, 16, 9), 9, 8, tin);
        c.p.ring(16, S(c, 16, 9), 9, 8, 1, STEEL[4]);
        c.p.ellipse(16, S(c, 16, 9), 6, 5, STEEL[0]);
        c.p.ellipse(16, S(c, 16, 9), 2, 1.7, STEEL[1]);
        c.p.hline(8, 11, S(c, 16, 9) - 6, C.red);
      } else if (c.rot === 2) {
        c.p.ellipse(16, S(c, 14, 10), 9, 8, tin);
        c.p.poly([[9, S(c, 14, 10)], [23, S(c, 14, 10)], [18, S(c, 22, 6)], [14, S(c, 22, 6)]], STEEL[2]);
        c.p.disk(16, S(c, 22, 6), 2.2, DARK[1]);
        c.p.box(14, S(c, 18, 4), 17, S(c, 18, 0), STEEL[1]);
      } else {
        // virado para a esquerda: boca larga à esquerda
        const cy = S(c, 18, 8);
        c.p.poly([[6, cy - 8], [24, cy - 2], [24, cy + 2], [6, cy + 8]], tin);
        c.p.poly([[6, cy - 8], [24, cy - 2], [24, cy - 1], [6, cy - 5]], STEEL[4]);
        c.p.ellipse(6, cy, 2.2, 8, STEEL[2]);
        c.p.ellipse(5.5, cy, 1.2, 6, STEEL[0]);
        c.p.box(24, cy - 2, 27, cy + 1, DARK[1]);
        c.p.box(15, cy + 3, 17, S(c, 20, 0), STEEL[1]);
        c.p.vline(12, cy - 5, cy + 5, C.red);
      }
    },
  },
  painel_solar_de_quintal: {
    rots: 2,
    up: 26,
    draw: (c) => {
      const hz = c.W > c.H;
      const x0 = hz ? 4 : 5;
      const x1 = c.W - (hz ? 5 : 6);
      shadow(c, x0, 6, x1 - x0, c.H - 12);
      const yb = c.H - 8;
      const yt = 6;
      // pernas de trás (altas) e da frente (baixas)
      for (const lx of [x0 + 2, x1 - 3]) {
        box(c, lx, yt, 2, 2, 22, STEEL[1]);
        box(c, lx, yb, 2, 2, 8, STEEL[1]);
      }
      const top = S(c, yt, 24);
      const bot = S(c, yb, 10);
      c.p.poly([[x0, top], [x1 + 1, top], [x1 + 1, bot], [x0, bot]], STEEL[4]);
      c.p.poly([[x0 + 1, top + 1], [x1, top + 1], [x1, bot - 1], [x0 + 1, bot - 1]], hex('#1e3a6a'));
      const cols = hz ? 6 : 3;
      for (let k = 1; k < cols; k++) c.p.vline(Math.round(x0 + ((x1 - x0) * k) / cols), top + 1, bot - 1, hex('#4a6aa8'));
      for (let yy = top + 4; yy < bot; yy += 4) c.p.hline(x0 + 1, x1, yy, hex('#4a6aa8'));
      c.p.line(x0 + 3, bot - 2, x0 + 9, top + 2, hex('#8ab0e8'));
      c.p.line(x0 + 5, bot - 2, x0 + 11, top + 2, hex('#8ab0e8'));
      // a lâmpada que ele alimenta
      c.p.line(x1, bot, x1 + 1, S(c, c.H - 3), DARK[1]);
      c.p.disk(x1 + 1, S(c, c.H - 3, 2), 1.6, hex('#fff0a0'));
    },
  },

  // ============================================================ Direita
  capsula_de_sono: {
    rots: 2,
    up: 18,
    draw: (c) => {
      const vt = c.H > c.W;
      shadow(c, 3, 3, c.W - 6, c.H - 6);
      const [x, y, w, d] = vt ? [4, 4, c.W - 8, c.H - 8] : [4, 4, c.W - 8, c.H - 8];
      const f = box(c, x, y, w, d, 7, WHITE[0], 0, WHITE[1]);
      c.p.hline(f.fx0 + 1, f.fx1 - 1, f.fy0 + 3, PINK);
      c.gl.hline(f.fx0 + 1, f.fx1 - 1, f.fy0 + 4, withAlpha(PINK, 90));
      const e = 7;
      if (vt) {
        c.p.capsule(16, S(c, y + 8, e + 4), 16, S(c, y + d - 8, e + 4), w - 2, WHITE[2], WHITE[1]);
        c.p.capsule(16, S(c, y + 9, e + 9), 16, S(c, y + d / 2, e + 9), w - 8, withAlpha(CYAN, 150));
        c.p.line(12, S(c, y + 10, e + 9), 12, S(c, y + d / 2 - 3, e + 9), withAlpha(C.white, 200));
        c.p.box(13, S(c, y + d - 12, e + 4), 19, S(c, y + d - 9, e + 4), DARK[1]);
        c.p.hline(14, 18, S(c, y + d - 11, e + 4), CYAN);
      } else {
        const cy = S(c, y + d / 2, e + 4);
        c.p.capsule(x + 8, cy, x + w - 8, cy, d + 2, WHITE[2], WHITE[1]);
        c.p.capsule(x + 9, cy - 4, x + w / 2, cy - 4, d - 6, withAlpha(CYAN, 150));
        c.p.line(x + 10, cy - 7, x + w / 2 - 3, cy - 7, withAlpha(C.white, 200));
        c.p.box(x + w - 14, cy - 1, x + w - 9, cy + 3, DARK[1]);
        c.p.vline(x + w - 12, cy, cy + 2, CYAN);
      }
    },
  },
  ring_light: {
    rots: 1,
    up: 44,
    draw: (c) => {
      shadow(c, 6, 18, 20, 10);
      const base = S(c, 22);
      for (const [lx, ly] of [[6, base + 2], [26, base + 2], [16, base + 6]] as const) c.p.line(16, base - 6, lx, ly, STEEL[1]);
      c.p.box(15, S(c, 20, 50), 16, base - 5, STEEL[2]);
      const ry = S(c, 20, 54);
      c.p.ring(16, ry, 11, 11, 3, hex('#fff6e8'));
      c.p.ring(16, ry, 11, 11, 1, STEEL[3]);
      c.p.box(14, ry - 4, 18, ry + 4, DARK[0]);
      c.p.put(16, ry - 3, CYAN);
      for (let k = 0; k < 3; k++) c.gl.ring(16, ry, 13 + k * 1.5, 13 + k * 1.5, 1.5, withAlpha(hex('#fff2c8'), 80 - k * 24));
    },
  },
  purificador_respiro_premium: {
    rots: 1,
    up: 32,
    draw: (c) => {
      shadow(c, 8, 14, 16, 9);
      const ty = cylinder(c, 16, 18, 7, 26, WHITE[1], WHITE[2]);
      for (let yy = ty + 6; yy < S(c, 18) - 3; yy += 2) c.p.hline(11, 20, yy, WHITE[0]);
      c.p.ring(16, ty, 5, 2.2, 1, CYAN);
      c.gl.ellipse(16, ty - 1, 6, 3, withAlpha(CYAN, 70));
      c.p.box(13, ty + 3, 18, ty + 4, CYAN);
      // etiqueta do boleto da assinatura
      c.p.line(22, ty + 4, 25, ty + 9, DARK[1]);
      c.p.box(24, ty + 9, 28, ty + 14, PINK);
      c.p.hline(25, 27, ty + 11, C.white);
    },
  },
  letreiro_neon_gratidao: {
    rots: 1,
    up: 44,
    draw: (c) => {
      const txt = 'GRATIDAO';
      const tw = textWidth(txt) - 1;
      const tx = Math.round((64 - tw) / 2);
      const ty = 15;
      c.p.box(tx - 4, ty - 4, tx + tw + 3, ty + 10, withAlpha(DARK[1], 230));
      for (const sx of [tx - 2, tx + tw + 1]) c.p.box(sx, ty - 6, sx + 1, ty - 4, STEEL[2]);
      const glow = new Pix(64, 44);
      drawText(glow, tx, ty, txt, PINK);
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1]] as const) c.gl.blit(glow, ox, oy, { alpha: 0.35 });
      drawText(c.gl, tx, ty, txt, hex('#ffb8e0'));
      c.gl.hline(tx, tx + tw, ty + 9, withAlpha(CYAN, 200));
      c.gl.disk(tx + tw / 2, ty + 3, 22, withAlpha(PINK, 18));
    },
  },
  poltrona_ergonomica_led: {
    rots: 4,
    up: 34,
    draw: (c) => {
      const b = chair(c, { seat: DARK[2], back: DARK[1], leg: STEEL[1], z: 10, backH: 20, base: 'rodinhas', arm: DARK[0], m: 7 });
      if (b.fx1 - b.fx0 > 6) {
        c.p.vline(b.fx0 + 2, b.fy0 + 1, b.fy1 - 1, PINK);
        c.p.vline(b.fx1 - 2, b.fy0 + 1, b.fy1 - 1, CYAN);
        c.p.box(b.fx0 + 4, b.fy0 + 2, b.fx1 - 4, b.fy0 + 5, hex('#e83a6a'));
        c.gl.vline(b.fx0 + 2, b.fy0, b.fy1, withAlpha(PINK, 80));
      } else {
        c.p.vline(b.fx0 + 1, b.fy0 + 1, b.fy1 - 1, PINK);
        c.p.vline(b.tx0 + 1, b.ty0, b.ty1, CYAN);
      }
    },
  },
  mesa_de_vidro_espelhado: {
    rots: 1,
    up: 16,
    draw: (c) => {
      shadow(c, 4, 6, c.W - 8, c.H - 12);
      for (const [lx, ly] of [[7, 9], [c.W - 9, 9], [7, c.H - 9], [c.W - 9, c.H - 9]] as const) box(c, lx, ly, 2, 2, 12, STEEL[4]);
      const g = box(c, 4, 6, c.W - 8, c.H - 12, 2, withAlpha(hex('#7ad8e8'), 210), 12, withAlpha(hex('#bff4fa'), 150));
      c.p.frame(g.tx0, g.ty0, g.tx1, g.ty1, hex('#e8fcff'));
      c.p.hline(g.fx0, g.fx1, g.fy1, STEEL[3]);
      for (let k = 0; k < 3; k++) c.p.line(g.tx0 + 6 + k * 9, g.ty1 - 2, g.tx0 + 16 + k * 9, g.ty0 + 2, withAlpha(C.white, 150));
      // as digitais de todo mundo
      for (const [fx, fy] of [[20, 14], [44, 22], [30, 30], [50, 12]] as const) c.p.ring(fx, g.ty0 + fy - 6, 2, 1.6, 1, withAlpha(hex('#5a8a96'), 150));
    },
  },
  telao_de_parede: {
    rots: 1,
    up: 44,
    draw: (c) => {
      c.p.box(3, 3, 92, 38, DARK[0]);
      c.p.box(5, 5, 90, 34, hex('#0e1a3a'));
      for (let x = 10; x < 90; x += 10) c.p.vline(x, 6, 33, hex('#18284e'));
      for (let y = 10; y < 34; y += 6) c.p.hline(6, 89, y, hex('#18284e'));
      const pts: [number, number][] = [[8, 31], [20, 28], [30, 29], [42, 23], [52, 25], [64, 16], [74, 18], [86, 8]];
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, ay] = pts[i]!;
        const [bx, by] = pts[i + 1]!;
        c.gl.line(ax, ay, bx, by, NGREEN);
        c.gl.line(ax, ay + 1, bx, by + 1, withAlpha(NGREEN, 120));
      }
      drawText(c.p, 9, 7, 'KENJI', CYAN);
      drawText(c.p, 60, 26, '+300%', NGREEN);
      c.p.hline(30, 66, 38, PINK);
      c.gl.hline(30, 66, 39, withAlpha(PINK, 90));
      c.gl.box(5, 5, 90, 34, withAlpha(CYAN, 14));
    },
  },
  geladeira_inteligente: {
    rots: 1,
    up: 40,
    draw: (c) => {
      shadow(c, 5, 16, 22, 12);
      const f = box(c, 5, 16, 22, 12, 42, WHITE[1], 0, WHITE[2]);
      const split = f.fy0 + 12;
      c.p.hline(f.fx0, f.fx1, split, WHITE[0]);
      c.p.box(f.fx1 - 3, f.fy0 + 3, f.fx1 - 2, split - 3, STEEL[3]);
      c.p.box(f.fx1 - 3, split + 3, f.fx1 - 2, split + 14, STEEL[3]);
      // tela com o anúncio do leite e crédito
      const sx = f.fx0 + 3;
      const sy = split + 4;
      c.p.box(sx, sy, sx + 11, sy + 9, DARK[0]);
      c.p.box(sx + 1, sy + 1, sx + 10, sy + 8, hex('#3a1a4a'));
      c.p.box(sx + 2, sy + 3, sx + 4, sy + 7, C.white);
      c.p.put(sx + 3, sy + 2, C.white);
      c.p.hline(sx + 2, sx + 4, sy + 5, hex('#3a8ac0'));
      c.p.box(sx + 6, sy + 3, sx + 9, sy + 4, NGREEN);
      c.p.box(sx + 6, sy + 6, sx + 9, sy + 7, PINK);
      c.p.disk(sx + 10, sy, 1.5, C.red);
      c.gl.box(sx + 1, sy + 1, sx + 10, sy + 8, withAlpha(PINK, 30));
    },
  },
  robo_aspirador: {
    rots: 1,
    up: 8,
    draw: (c) => {
      c.sh.ellipse(16, S(c, 20), 12, 6, SHADOW);
      for (let k = 0; k < 4; k++) c.sh.put(4 + k * 2, S(c, 24 + (k % 2)), hex('#5a5a5a', 90));
      const cy = S(c, 18, 3);
      c.p.ellipse(16, cy + 3, 11, 6.5, DARK[0]);
      c.p.ellipse(16, cy, 11, 6.5, DARK[2]);
      c.p.ring(16, cy, 11, 6.5, 1, STEEL[2]);
      c.p.ring(16, cy, 7, 4, 1, DARK[1]);
      c.p.box(12, cy - 2, 20, cy + 1, hex('#3a1a4a'));
      for (let x = 13; x <= 19; x += 2) c.p.put(x, cy - 1, PINK);
      c.p.put(16, cy - 5, CYAN);
      c.gl.disk(16, cy - 5, 2.5, withAlpha(CYAN, 90));
    },
  },
  aquario_holografico: {
    rots: 2,
    up: 32,
    draw: (c) => {
      const [x, y, w, d] = inset(c,11, 3);
      shadow(c, x, y, w, d);
      box(c, x, y, w, d, 8, DARK[1], 0, DARK[2]);
      const g = box(c, x, y, w, d, 20, withAlpha(hex('#2ac8e0'), 120), 8, withAlpha(hex('#8af4ff'), 110));
      c.p.frame(g.fx0, g.ty0, g.fx1, g.fy1, STEEL[3]);
      c.p.hline(g.tx0, g.tx1, g.ty1 + 1, STEEL[3]);
      const fish: [number, number, Color][] = [
        [g.fx0 + 6, g.fy0 + 6, PINK],
        [g.fx0 + (g.fx1 - g.fx0) * 0.6, g.fy0 + 12, hex('#ffe23a')],
        [g.fx0 + (g.fx1 - g.fx0) * 0.35, g.fy0 + 15, CYAN],
      ];
      for (const [fx, fy, col] of fish) {
        if (fx > g.fx1 - 4) continue;
        c.gl.ellipse(fx, fy, 3, 1.8, withAlpha(col, 230));
        c.gl.poly([[fx - 3, fy], [fx - 6, fy - 2], [fx - 6, fy + 2]], withAlpha(col, 200));
        c.gl.put(Math.round(fx) + 1, Math.round(fy) - 1, C.ink);
      }
      for (let yy = g.fy0 + 1; yy < g.fy1; yy += 2) c.gl.hline(g.fx0 + 1, g.fx1 - 1, yy, withAlpha(C.white, 22));
    },
  },
  cofre_biometrico: {
    rots: 1,
    up: 26,
    draw: (c) => {
      shadow(c, 6, 14, 20, 12);
      const f = box(c, 6, 14, 20, 12, 22, STEEL[2], 0, STEEL[3]);
      c.p.frame(f.fx0 + 2, f.fy0 + 2, f.fx1 - 2, f.fy1 - 2, STEEL[1]);
      const px = f.fx0 + 5;
      const py = f.fy0 + 6;
      c.p.box(px, py, px + 6, py + 7, hex('#0e2a3a'));
      for (let k = 0; k < 3; k++) c.p.ring(px + 3.5, py + 4, 1 + k * 1.2, 1.2 + k * 1.3, 1, CYAN);
      c.gl.box(px - 1, py - 1, px + 7, py + 8, withAlpha(CYAN, 40));
      c.p.box(f.fx1 - 5, py + 1, f.fx1 - 4, py + 6, STEEL[4]);
      c.p.put(f.fx1 - 4, f.fy0 + 3, C.red);
      for (const [rx, ry] of [[f.fx0 + 1, f.fy0 + 1], [f.fx1 - 1, f.fy0 + 1], [f.fx0 + 1, f.fy1 - 1], [f.fx1 - 1, f.fy1 - 1]] as const) c.p.put(rx, ry, STEEL[4]);
    },
  },
  quadro_de_metas: {
    rots: 1,
    up: 44,
    draw: (c) => {
      c.p.box(4, 4, 59, 36, STEEL[3]);
      c.p.box(6, 6, 57, 34, C.pureWhite);
      drawText(c.p, 8, 8, 'META', C.red);
      drawText(c.p, 34, 8, '110%', hex('#3a6ac0'));
      for (const [k, bh] of [6, 9, 13, 18].entries()) c.p.box(10 + k * 9, 32 - bh, 15 + k * 9, 32, hex('#3a8ac0'));
      c.p.line(10, 30, 52, 14, C.red);
      c.p.line(10, 31, 52, 15, C.red);
      c.p.poly([[50, 10], [57, 13], [52, 18]], C.red);
      c.p.box(14, 36, 50, 37, STEEL[2]);
      c.p.box(20, 35, 25, 35, C.red);
      c.p.box(28, 35, 33, 35, hex('#3a6ac0'));
    },
  },
  cama_flutuante: {
    rots: 4,
    up: 22,
    draw: (c) => {
      c.sh.ellipse(c.W / 2, c.up + c.H / 2 + 1, c.W / 2 - 6, c.H / 2 - 7, withAlpha(CYAN, 70));
      box(c, 8, 9, c.W - 16, c.H - 18, 1, DARK[2], 0, DARK[1]);
      bed(c, { frame: hex('#e8e8f0'), mat: hex('#f4f4fa'), blanket: hex('#6a3ac8'), pillow: C.pureWhite, z: 10, frameH: 4, headH: 12 });
      c.gl.ellipse(c.W / 2, S(c, c.H / 2, 4), c.W / 2 - 8, 3, withAlpha(CYAN, 60));
    },
  },
  luminaria_drone: {
    rots: 1,
    up: 40,
    draw: (c) => {
      c.sh.ellipse(16, S(c, 18), 8, 4, withAlpha(hex('#fff2a0'), 70));
      c.sh.ellipse(16, S(c, 18), 4, 2, SHADOW);
      const dy = S(c, 18, 34);
      c.gl.poly([[14, dy + 3], [18, dy + 3], [24, S(c, 18)], [8, S(c, 18)]], withAlpha(hex('#fff2a0'), 34));
      for (const [ax, ay] of [[-8, -3], [8, -3], [-8, 3], [8, 3]] as const) {
        c.p.line(16, dy, 16 + ax, dy + ay, DARK[2]);
        c.p.ellipse(16 + ax, dy + ay - 1, 4.5, 1.4, withAlpha(STEEL[3], 210));
      }
      c.p.box(13, dy - 2, 19, dy + 2, DARK[1]);
      c.p.box(14, dy + 3, 18, dy + 4, hex('#fff2a0'));
      c.p.put(18, dy - 1, C.red);
    },
  },
  tapete_de_led: {
    rots: 2,
    up: 2,
    draw: (c) => {
      const x0 = 3;
      const y0 = c.up + 3;
      const x1 = c.W - 4;
      const y1 = c.up + c.H - 4;
      c.p.box(x0, y0, x1, y1, DARK[0]);
      const lit = [DARK[2], CYAN, PINK, PURPLE, DARK[2]];
      for (let y = y0 + 2, j = 0; y + 4 <= y1; y += 6, j++)
        for (let x = x0 + 2, i = 0; x + 4 <= x1; x += 6, i++) {
          const col = lit[(i + j * 2) % lit.length]!;
          c.p.box(x, y, x + 4, y + 4, col);
          if (col !== DARK[2]) {
            c.p.put(x, y, light(col, 0.5));
            c.gl.box(x - 1, y - 1, x + 5, y + 5, withAlpha(col, 30));
          }
        }
      c.p.frame(x0, y0, x1, y1, CYAN);
    },
  },
  bandeira_do_neon_fc: {
    rots: 1,
    up: 44,
    draw: (c) => {
      c.p.box(3, 5, 60, 6, STEEL[3]);
      for (let x = 6; x <= 57; x++) {
        const off = Math.round(Math.sin(x / 6) * 1.2);
        for (let y = 7; y <= 33; y++) {
          const band = Math.abs(57 - x - (y - 7) * 1.9) < 4;
          c.p.set(x, y + off, band ? PINK : x < 8 || x > 55 ? CYAN : hex('#1a1a28'));
        }
      }
      drawText(c.p, 9, 11, 'NEON', CYAN);
      drawText(c.p, 9, 20, 'FC', C.white);
      c.p.box(37, 22, 55, 31, hex('#ffe23a'));
      drawText(c.p, 38, 23, 'BET', C.ink);
    },
  },
  cafeteira_por_assinatura: {
    rots: 1,
    up: 30,
    draw: (c) => {
      shadow(c, 7, 14, 18, 12);
      const s = box(c, 7, 14, 18, 12, 12, WHITE[1], 0, WHITE[2]);
      c.p.hline(s.fx0 + 2, s.fx1 - 2, s.fy0 + 4, WHITE[0]);
      const m = box(c, 10, 15, 12, 7, 14, DARK[1], 12, DARK[2]);
      c.p.box(m.fx0 + 2, m.fy0 + 2, m.fx0 + 7, m.fy0 + 5, hex('#0e2a3a'));
      c.p.box(m.fx0 + 3, m.fy0 + 3, m.fx0 + 6, m.fy0 + 4, CYAN);
      c.p.box(m.fx1 - 3, m.fy0 + 7, m.fx1 - 2, m.fy0 + 8, STEEL[3]);
      cylinder(c, 18.5, 22, 2, 3, C.pureWhite, hex('#4a2a18'), 12);
      for (let k = 0; k < 2; k++) c.gl.disk(18 + k, m.fy1 - 2 - k * 4, 1.6, withAlpha(C.white, 70));
      c.p.put(m.fx0 + 1, m.fy0 + 1, PINK);
    },
  },
  espelho_com_filtro: {
    rots: 1,
    up: 44,
    draw: (c) => {
      c.p.ellipse(16, 20, 10.5, 14.5, PINK);
      c.p.ellipse(16, 20, 8.5, 12.5, hex('#d8eef8'));
      c.p.line(11, 26, 19, 10, C.pureWhite);
      c.p.line(13, 28, 21, 12, withAlpha(C.pureWhite, 160));
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        c.gl.disk(16 + Math.cos(a) * 11.5, 20 + Math.sin(a) * 15.5, 1.2, hex('#fff2c8', 230));
      }
      // filtro: coraçãozinho e brilhos
      c.p.disk(19, 17, 1.4, PINK);
      c.p.disk(21, 17, 1.4, PINK);
      c.p.poly([[17.6, 17.5], [22.4, 17.5], [20, 21]], PINK);
      for (const [sx, sy] of [[11, 14], [14, 24]] as const) {
        c.gl.hline(sx - 1, sx + 1, sy, C.pureWhite);
        c.gl.vline(sx, sy - 1, sy + 1, C.pureWhite);
      }
    },
  },
  planta_de_plastico_neon: {
    rots: 1,
    up: 30,
    draw: (c) => {
      shadow(c, 9, 16, 14, 8);
      const ty = cylinder(c, 16, 20, 6, 9, WHITE[2], hex('#7a7a84'));
      const dk = hex('#16a83a');
      const leaves: [number, number, number, number][] = [
        [16, ty, 8, ty - 16],
        [16, ty, 24, ty - 15],
        [16, ty, 16, ty - 20],
        [16, ty, 5, ty - 7],
        [16, ty, 27, ty - 6],
      ];
      for (const [ax, ay, bx, by] of leaves) {
        c.p.capsule(ax, ay, bx, by, 4, NGREEN, dk);
        c.p.line(ax, ay, bx, by, dk);
        c.gl.capsule(ax, ay, bx, by, 7, withAlpha(NGREEN, 30));
      }
      // a etiqueta de preço que nunca saiu
      c.p.line(24, ty - 15, 26, ty - 10, DARK[1]);
      c.p.box(25, ty - 10, 29, ty - 7, C.pureWhite);
      c.p.put(27, ty - 9, PINK);
    },
  },
  poltrona_de_massagem: {
    rots: 4,
    up: 34,
    draw: (c) => {
      const leather = hex('#4a2e2e');
      const b = chair(c, { seat: leather, back: hex('#5a3838'), leg: STEEL[1], z: 8, backH: 22, base: 'bloco', arm: hex('#2e1c1c'), m: 6 });
      if (b.fx1 - b.fx0 > 6) {
        for (let y = b.fy0 + 3; y < b.fy1 - 1; y += 5) c.p.hline(b.fx0 + 2, b.fx1 - 2, y, shade(leather, 0.75));
        c.p.box(b.fx0 + 3, b.fy0 + 1, b.fx1 - 3, b.fy0 + 4, hex('#6a4444'));
      }
      // ficha da massagem por minuto, brilhando no braço
      const ax = c.rot === 1 ? 10 : 6;
      const ay = S(c, c.rot === 1 ? 8 : 16, 17);
      c.p.box(ax, ay, ax + 2, ay + 1, hex('#ffe23a'));
      c.gl.disk(ax + 1, ay, 2.5, withAlpha(hex('#ffe23a'), 80));
    },
  },

  // ============================================================ Delta
  barril_de_iscas: {
    rots: 1,
    up: 24,
    draw: (c) => {
      shadow(c, 7, 14, 18, 9);
      const ty = cylinder(c, 16, 18, 8, 16, WOOD[2], WOOD[1]);
      const by = S(c, 18);
      for (let x = 10; x <= 22; x += 3) c.p.vline(x, ty + 2, by - 1, WOOD[1]);
      for (const yy of [ty + 4, by - 4]) c.p.hline(8, 23, yy, STEEL[1]);
      c.p.ellipse(16, ty, 6.5, 2.6, hex('#2a3a3a'));
      c.p.poly([[17, ty], [21, ty - 6], [24, ty - 4], [19, ty + 1]], hex('#8aa8b8'));
      c.p.poly([[21, ty - 6], [20, ty - 10], [25, ty - 7]], hex('#6a8898'));
      for (const [fx, fy] of [[9, ty - 8], [13, ty - 12], [23, ty - 13]] as const) c.gl.put(fx, fy, C.ink);
    },
  },
  remo_de_parede: {
    rots: 1,
    up: 44,
    draw: (c) => {
      c.p.capsule(9, 4, 21, 28, 3, WOOD[3], WOOD[1]);
      c.p.capsule(8, 3, 10, 6, 4, WOOD[1]);
      c.p.poly([[19, 25], [25, 23], [29, 37], [24, 40]], hex('#3a7ac0'));
      c.p.poly([[26, 33], [29, 37], [24, 40], [23, 36]], C.red);
      for (const [px, py] of [[12, 10], [19, 24]] as const) c.p.box(px, py, px + 1, py + 1, STEEL[2]);
    },
  },
  caixote_de_mesa: {
    rots: 1,
    up: 16,
    draw: (c) => {
      shadow(c, 5, 12, 22, 14);
      const f = box(c, 5, 12, 22, 14, 12, WOOD[2], 0, WOOD[3]);
      for (let yy = f.fy0 + 3; yy < f.fy1; yy += 4) c.p.hline(f.fx0 + 1, f.fx1 - 1, yy, WOOD[0]);
      for (let xx = f.tx0 + 5; xx < f.tx1; xx += 6) c.p.vline(xx, f.ty0 + 1, f.ty1, WOOD[1]);
      c.p.ellipse(f.tx0 + 6, f.ty0 + 7, 4.5, 3, C.pureWhite);
      c.p.ellipse(f.tx0 + 6, f.ty0 + 7, 2.5, 1.6, hex('#8a5a2a'));
      c.p.box(f.tx1 - 9, f.ty0 + 3, f.tx1 - 2, f.ty0 + 9, STEEL[2]);
      c.p.box(f.tx1 - 8, f.ty0 + 4, f.tx1 - 3, f.ty0 + 6, CYAN);
    },
  },
  rede_de_pesca: {
    rots: 1,
    up: 44,
    draw: (c) => {
      const rope = hex('#8a7a4a');
      c.p.hline(4, 59, 5, WOOD[2]);
      const yb = (x: number) => 30 + Math.round(Math.sin(((x - 4) / 55) * Math.PI) * 6);
      for (let k = -8; k < 16; k++)
        for (let x = 4; x <= 59; x++) {
          const ya = 5 + (x - 4) - k * 6;
          const yc = 5 - (x - 4) + k * 6 + 30;
          if (ya > 5 && ya < yb(x)) c.p.put(x, ya, rope);
          if (yc > 5 && yc < yb(x)) c.p.put(x, yc, rope);
        }
      for (let x = 8; x <= 56; x += 12) c.p.ellipse(x, 6, 2.5, 2, hex('#e8701a'));
      // um boleto pescado
      c.p.box(36, 16, 47, 23, C.paper);
      for (let x = 37; x <= 46; x += 2) c.p.vline(x, 20, 22, C.ink);
      c.p.hline(37, 43, 17, hex('#8a8070'));
    },
  },
  ventilador_de_palafita: {
    rots: 4,
    up: 34,
    draw: (c) => {
      shadow(c, 9, 16, 14, 8);
      c.p.ellipse(16, S(c, 20), 6, 2.6, STEEL[1]);
      c.p.box(15, S(c, 20, 22), 16, S(c, 20, 1), STEEL[2]);
      const hy = S(c, 20, 30);
      const tape = hex('#b8b8b0');
      if (c.rot === 0 || c.rot === 2) {
        c.p.disk(16, hy, 10, withAlpha(STEEL[3], 70));
        c.p.ring(16, hy, 10, 10, 1, STEEL[3]);
        if (c.rot === 0) {
          for (let k = 0; k < 3; k++) {
            const a = (k / 3) * Math.PI * 2 + 0.3;
            c.p.ellipse(16 + Math.cos(a) * 5, hy + Math.sin(a) * 5, 3.4, 3.4, hex('#7ab8d8'));
          }
          for (let k = 0; k < 4; k++) c.p.line(16 - 9 + k * 6, hy - 6, 16 - 9 + k * 6, hy + 6, withAlpha(STEEL[2], 160));
          c.p.disk(16, hy, 2, C.red);
        } else c.p.disk(16, hy, 5, STEEL[1]);
        c.p.line(9, hy - 6, 22, hy + 7, tape);
        c.p.line(10, hy - 6, 23, hy + 7, tape);
      } else {
        c.p.ellipse(10, hy, 3, 10, withAlpha(STEEL[3], 110));
        c.p.ring(10, hy, 3, 10, 1, STEEL[3]);
        c.p.box(12, hy - 3, 20, hy + 3, STEEL[1]);
        c.p.vline(16, hy - 3, hy + 3, tape);
      }
    },
  },
  lampiao_do_delta: {
    rots: 1,
    up: 28,
    draw: (c) => {
      shadow(c, 9, 16, 14, 8);
      cylinder(c, 16, 20, 6, 4, hex('#3e5a3a'), hex('#5a7a4a'));
      const gy = S(c, 20, 12);
      c.p.ellipse(16, gy, 5.5, 7, hex('#ffd890', 170));
      c.p.box(15, gy - 1, 16, gy + 3, hex('#ff9a3a'));
      c.p.put(15, gy - 2, hex('#ffe060'));
      for (const xx of [11, 21]) c.p.vline(xx, gy - 6, gy + 6, hex('#3e5a3a'));
      c.p.poly([[9, gy - 6], [23, gy - 6], [18, gy - 11], [14, gy - 11]], hex('#3e5a3a'));
      c.p.ring(16, gy - 13, 4, 3, 1, STEEL[1]);
      glowDisk(c.gl, 16, gy, 12, hex('#ffd27a'));
    },
  },
  boia_lembranca_do_delta: {
    rots: 1,
    up: 6,
    draw: (c) => {
      shadow(c, 3, 10, 26, 16);
      const cy = S(c, 18, 2);
      const orange = hex('#f06a1a');
      for (let y = cy - 10; y <= cy + 12; y++)
        for (let x = 2; x <= 30; x++) {
          for (const [oy, dark] of [[2, true], [0, false]] as const) {
            const px = x + 0.5 - 16;
            const py = y + 0.5 - (cy + oy);
            const o = (px / 13) ** 2 + (py / 8.5) ** 2;
            const i = (px / 6.5) ** 2 + (py / 4) ** 2;
            if (o < 1 && i >= 1) {
              const ang = Math.atan2(py * 1.5, px);
              const seg = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8) % 2;
              const col = seg ? orange : C.white;
              c.p.set(x, y, dark ? shade(col, 0.7) : col);
            }
          }
        }
      c.p.ring(16, cy, 9.5, 6, 1, withAlpha(hex('#c8b890'), 230));
    },
  },
};

// ---------------------------------------------------------------------------
// render, folha e consultas

/** Desenho reserva (caixote com as iniciais) para um id sem arte própria. */
function fallbackDraw(id: string): FurnDef {
  return {
    rots: 1,
    up: 16,
    draw: (c) => {
      shadow(c, 4, 4, c.W - 8, c.H - 8);
      const f = box(c, 4, 6, c.W - 8, c.H - 10, 12, WOOD[2], 0, WOOD[3]);
      textFit(c.p, f.fx0, f.fy0 + 3, f.fx1 - f.fx0, id.slice(0, 2).toUpperCase(), WOOD[0]);
    },
  };
}

function def(id: string): FurnDef {
  return FURNITURE_ART[id] ?? fallbackDraw(id);
}

function catalogSize(id: string): { w: number; h: number; parede: boolean; flat: boolean } {
  const m = getData().furnitureById.get(id);
  return { w: m?.tamanho.w ?? 1, h: m?.tamanho.h ?? 1, parede: m?.parede === true, flat: m?.categoria === 'chao' };
}

/** Quantas rotações o móvel tem (1, 2 ou 4). Itens de parede: 1. */
export function furnitureRots(id: string): number {
  return catalogSize(id).parede ? 1 : def(id).rots;
}

/** Rotação normalizada (0..3) para o quadro que existe. */
export function furnitureRot(id: string, rot = 0): number {
  const r = ((Math.round(rot) % 4) + 4) % 4;
  const n = furnitureRots(id);
  return n === 4 ? r : n === 2 ? r % 2 : 0;
}

/** Pegada em tiles na rotação pedida (as ímpares trocam largura e altura; parede não gira). */
export function furnitureFootprint(id: string, rot = 0): { w: number; h: number } {
  const s = catalogSize(id);
  const r = ((Math.round(rot) % 4) + 4) % 4;
  return !s.parede && r % 2 === 1 ? { w: s.h, h: s.w } : { w: s.w, h: s.h };
}

/** Nome do quadro na folha `moveis`. */
export const furnitureFrame = (id: string, rot = 0) => `mov_${id}_${furnitureRot(id, rot)}`;

export interface FurnitureInfo {
  frame: string;
  rot: number;
  rots: number;
  footW: number;
  footH: number;
  up: number;
  w: number;
  h: number;
  flat: boolean;
  wall: boolean;
}

export function furnitureInfo(id: string, rot = 0): FurnitureInfo {
  const r = furnitureRot(id, rot);
  const fp = furnitureFootprint(id, rot);
  const up = def(id).up;
  const s = catalogSize(id);
  return { frame: furnitureFrame(id, rot), rot: r, rots: furnitureRots(id), footW: fp.w, footH: fp.h, up, w: fp.w * T, h: fp.h * T + up, flat: s.flat, wall: s.parede };
}

/** Desenha um móvel numa rotação (puro). */
export function buildFurniture(id: string, rot = 0): Pix {
  const r = furnitureRot(id, rot);
  const d = def(id);
  if (r === 3) return buildFurniture(id, 1).flipX();
  const fp = furnitureFootprint(id, r);
  const W = fp.w * T;
  const H = fp.h * T;
  const c: FCtx = { p: new Pix(W, H + d.up), sh: new Pix(W, H + d.up), gl: new Pix(W, H + d.up), rot: r, W, H, up: d.up };
  d.draw(c);
  c.p.outlineSelective();
  const out = new Pix(W, H + d.up);
  out.blit(c.sh, 0, 0);
  out.blit(c.p, 0, 0);
  out.blit(c.gl, 0, 0);
  return out;
}

/** Ids do catálogo por estilo (para a galeria e a loja). */
export function furnitureByStyle(): Record<'esquerda' | 'direita' | 'delta', string[]> {
  const out: Record<'esquerda' | 'direita' | 'delta', string[]> = { esquerda: [], direita: [], delta: [] };
  for (const m of getData().furniture) out[m.estilo].push(m.id);
  return out;
}

/** Folha com todos os móveis do catálogo em todas as rotações (quadros `mov_${id}_${rot}`). */
export function buildFurnitureSheet(): SheetData {
  const items: { name: string; pix: Pix }[] = [];
  for (const m of getData().furniture) {
    const n = furnitureRots(m.id);
    for (let r = 0; r < n; r++) items.push({ name: `mov_${m.id}_${r}`, pix: buildFurniture(m.id, r) });
  }
  const sh = packFrames(FURNITURE_KEY, items, 1024);
  return { ...sh, originX: 0, originY: 0 };
}

/** Mistura simples para tons de destaque (usada pela galeria). */
export const furnitureTint = (side: 'esquerda' | 'direita' | 'delta'): Color => (side === 'esquerda' ? mix(WOOD[2], C.leaf, 0.3) : side === 'direita' ? CYAN : hex('#c8a060'));
