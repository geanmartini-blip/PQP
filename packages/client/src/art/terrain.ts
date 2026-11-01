/**
 * Terreno desenhado por bloco (puro, sem Phaser): o chão de um retângulo de tiles vira um buffer
 * de pixels com textura de ruído controlado em coordenadas do mundo (nada se repete por tile) e
 * transição entre materiais por pixel, um "blob" que resolve os 47 casos de borda e canto de uma vez:
 * o material de prioridade maior avança sobre o vizinho com borda irregular pelo ruído.
 *
 * Por cima do chão: espuma e degradê na borda da água, areia molhada, franja de grama, frente da
 * palafita com estacas e sombra na água, paredes no estilo Tibia (topo e face), pedras com volume,
 * cercas com sombra, decoração espalhada pelo hash do tile (flores, conchas, caranguejinhos, tábuas
 * soltas, redes de pesca, lampiões com luz) e as sombras das árvores. As árvores grandes (2x3 tiles)
 * e os quadros animados (reflexo da água, mato que balança, piso neon) saem daqui também.
 *
 * Um bloco é independente dos outros: tudo depende só do mapa e da posição no mundo, então dois
 * blocos vizinhos emendam sem costura (testado).
 *
 * SUGESTÃO: paletas, larguras de transição, frequência e escolha da decoração não estão nos docs
 * (só "Esquerda em verde, terra e madeira; Direita em neon sobre concreto"; Delta é palafita e mangue).
 */
import { Deco, Tile } from '@pqp/shared/map';
import { bayer, hash01, hashInt, nz, rampIndex } from './noise';
import { C, type Color, hex, light, mix, OUTLINE_BASE, Pix, shade, withAlpha } from './pixel';

export const TPX = 32;

/** Estilo visual por região: 0 Esquerda (mata, taipa), 1 Direita (concreto, neon), 2 Delta e Usina (palafita, mangue). */
export type Style = 0 | 1 | 2;

/** SUGESTÃO: estilo de cada região (os docs dão só as paletas por margem). */
export const REGION_STYLE: Record<string, Style> = {
  margem_esquerda: 0,
  juncal: 0,
  planalto_do_trigo: 0,
  serra_da_chopindita: 0,
  margem_direita: 1,
  vale_das_chamines: 1,
  mirante: 1,
  usina_da_ponte: 1,
  delta: 2,
  rio_claro: 2,
  ilha_do_farol: 2,
};

export function styleOfRegion(regionId: string | undefined): Style {
  return REGION_STYLE[regionId ?? ''] ?? 0;
}

/** O que o renderizador precisa do mapa. Fora dos limites, repete a borda. */
export interface TerrainSource {
  width: number;
  height: number;
  tile(x: number, y: number): number;
  style(x: number, y: number): Style;
  deco?(x: number, y: number): number;
}

// ---------------------------------------------------------------------------
// materiais

export const M = {
  VAZIO: 0,
  FUNDA: 1,
  RASA: 2,
  LAMA: 3,
  AREIA: 4,
  TERRA: 5,
  GRAMA: 6,
  MATO: 7,
  MADEIRA: 8,
  CONCRETO: 9,
  ASFALTO: 10,
  NEON: 11,
} as const;

const NATURAL = [false, true, true, true, true, true, true, true, false, false, false, false];
/** prioridade da transição: o maior avança sobre o menor */
const PRIO = [0, 1, 2, 3, 4, 5, 6, 6, 0, 0, 0, 0];
/**
 * Limiar do campo suave por nível de prioridade: abaixo de 0,5 o material avança sobre o vizinho
 * (a água rasa faz uma plataforma larga sobre a funda; a areia avança um pouco sobre a água).
 */
const THR = [0.5, 0.5, 0.28, 0.42, 0.38, 0.45, 0.42];
const isWater = (m: number) => m === M.FUNDA || m === M.RASA;
const isGrass = (m: number) => m === M.GRAMA || m === M.MATO;

const TILE_MAT: Record<number, number> = {
  [Tile.Vazio]: M.VAZIO,
  [Tile.Grama]: M.GRAMA,
  [Tile.Terra]: M.TERRA,
  [Tile.Areia]: M.AREIA,
  [Tile.AguaRasa]: M.RASA,
  [Tile.AguaFunda]: M.FUNDA,
  [Tile.Madeira]: M.MADEIRA,
  [Tile.Concreto]: M.CONCRETO,
  [Tile.Asfalto]: M.ASFALTO,
  [Tile.PisoNeon]: M.NEON,
  [Tile.Lama]: M.LAMA,
  [Tile.Mato]: M.MATO,
};

/** Objetos sólidos desenhados sobre um chão que vem dos vizinhos. */
const OBJECT_TILES: ReadonlySet<number> = new Set([Tile.Parede, Tile.Arvore, Tile.Pedra, Tile.Cerca, Tile.Grade, Tile.Maquina, Tile.Porta]);
const isWallish = (t: number) => t === Tile.Parede || t === Tile.Porta;

// ---------------------------------------------------------------------------
// paletas (escuro -> claro)

const P = (...hs: string[]) => hs.map((h) => hex(h));
const GRASS: Color[][] = [
  P('#2c5e26', '#3a7a30', '#4b923a', '#62aa47', '#86c45c'),
  P('#45522f', '#55653a', '#677845', '#7c8a50', '#97a062'),
  P('#34552a', '#436a31', '#567f39', '#6c9442', '#8aaa55'),
];
const TERRA_P: Color[][] = [
  P('#5a3b24', '#70492c', '#865a35', '#9c6c41', '#b48352'),
  P('#5e5246', '#706356', '#837566', '#968877', '#ab9d8a'),
  P('#5c4028', '#704e31', '#85603b', '#997146', '#ae8656'),
];
const AREIA_P = P('#b39361', '#c9a972', '#dabd86', '#e6cf9c', '#f1e0b6');
const LAMA_P = P('#33251a', '#433022', '#533d2a', '#624a33', '#73593e');
const RASA_P = P('#2a6a8e', '#337ba0', '#3f8db2', '#4f9fc2', '#68b4d2');
const FUNDA_P = P('#132f50', '#183c62', '#1f4a74', '#285a86', '#336a96');
const CONC_P = P('#666664', '#767672', '#86867f', '#96968e', '#aaaaa0');
const ASF_P = P('#24262a', '#2b2d31', '#33353a', '#3c3e43', '#47494e');
const WOOD_P = P('#4e3019', '#68422a', '#7e5332', '#93653d', '#ab7b4b', '#c4935e');
const WOOD_GAP = hex('#1e130b');
const NEON_BASE = P('#121019', '#16141f', '#1b1926', '#211e2e');
const FOAM = hex('#eef8f2');
const FOAM2 = hex('#c4e6ea');
export const SHADOW_TINT = hex('#120e24');
const LAMP_LIGHT = hex('#ffd27a');

// ---------------------------------------------------------------------------
// textura de cada material numa posição do mundo

function wood(st: Style, wx: number, wy: number): Color {
  const board = wy >> 3;
  const r = wy & 7;
  if (r === 7) return WOOD_GAP;
  const off = hashInt(0, board, 3) & 31;
  const xx = wx + off;
  const seg = xx >> 5;
  const sx = xx & 31;
  if (sx === 0) return WOOD_P[0]!;
  const ti = 2 + (hashInt(seg, board, 5) % 3);
  let c = WOOD_P[ti]!;
  if (r === 0) c = WOOD_P[ti + 1]!;
  else if (r === 6) c = WOOD_P[ti - 1]!;
  else if (nz(xx >> 2, board * 40 + r * 3, 2) > 0.66) c = WOOD_P[ti - 1]!;
  // pregos nas pontas da tábua, com brilho em cima
  if (sx === 2 || sx === 29) {
    if (r === 2) return hex('#a29ea6');
    if (r === 3) return hex('#2c282e');
  }
  if (sx === 13 && r === 3 && hashInt(seg, board, 9) % 5 === 0) return WOOD_P[0]!; // nó da madeira
  if (st === 2 && nz(wx, wy, 3) > 0.7) c = mix(c, hex('#8c8274'), 0.35); // madeira gasta de beira de rio
  return c;
}

/** Cor do chão de um material (sem transição). */
export function groundColor(mat: number, st: Style, wx: number, wy: number): Color {
  switch (mat) {
    case M.GRAMA:
    case M.MATO: {
      // o mato tem o mesmo chão da grama (a diferença são os tufos animados por cima)
      const pal = GRASS[st]!;
      const v = nz(wx, wy) * 0.7 + nz(wx, wy, 3) * 0.3;
      const h = hashInt(wx, wy, 11) & 255;
      const thr = 14;
      if (h < thr) return pal[4]!;
      if ((hashInt(wx, wy - 1, 11) & 255) < thr) return pal[0]!;
      return pal[rampIndex(v, 4, wx, wy)]!;
    }
    case M.TERRA: {
      const pal = TERRA_P[st]!;
      const cell = hash01(wx >> 2, wy >> 2, 21);
      if (cell < 0.07) {
        const lx = wx & 3;
        const ly = wy & 3;
        if (ly === 1 && (lx === 1 || lx === 2)) return lx === 1 ? pal[4]! : pal[3]!;
        if (ly === 2 && (lx === 1 || lx === 2)) return pal[0]!;
      }
      return pal[rampIndex(nz(wx, wy, 1), 4, wx, wy)]!;
    }
    case M.AREIA: {
      const h = hashInt(wx, wy, 13) & 255;
      if (h < 3) return AREIA_P[0]!;
      if (h < 5) return hex('#fff8e6');
      const r = (wy + Math.floor(nz(wx, wy, 1) * 10)) % 6;
      if (r === 0 && (h & 7) < 5) return AREIA_P[4]!;
      if (r === 1 && (h & 7) < 3) return AREIA_P[1]!;
      return AREIA_P[rampIndex(nz(wx, wy, 2) * 0.85 + 0.1, 4, wx, wy)]!;
    }
    case M.LAMA: {
      // poça d'água: reflexo do céu, beira clara em cima à esquerda e escura embaixo à direita
      const p = nz(wx + 300, wy + 150, 2);
      if (p > 0.7) {
        if (nz(wx + 299, wy + 149, 2) <= 0.7) return LAMA_P[0]!;
        if (nz(wx + 301, wy + 151, 2) <= 0.7) return hex('#9aaab4');
        if ((hashInt(wx, wy, 17) & 31) < 2) return hex('#a8b8c2');
        return p > 0.76 ? hex('#56666f') : hex('#64747e');
      }
      return LAMA_P[rampIndex(nz(wx, wy), 4, wx, wy)]!;
    }
    case M.RASA: {
      const row = wy & 7;
      const k = wy >> 3;
      const off = (wx + k * 13 + Math.floor(nz(wx, wy, 2) * 12)) % 24;
      if (row === 0 && off < 5) return RASA_P[4]!;
      if (row === 1 && off > 0 && off < 5) return RASA_P[1]!;
      return RASA_P[rampIndex(nz(wx, wy, 1) * 0.75 + 0.12, 4, wx, wy)]!;
    }
    case M.FUNDA: {
      const row = wy % 10;
      const k = Math.floor(wy / 10);
      const off = (wx + k * 17 + Math.floor(nz(wx, wy, 2) * 14)) % 30;
      if (row === 0 && off < 4) return FUNDA_P[4]!;
      if (row === 1 && off > 0 && off < 4) return FUNDA_P[0]!;
      return FUNDA_P[rampIndex(nz(wx, wy, 1) * 0.75 + 0.1, 4, wx, wy)]!;
    }
    case M.MADEIRA:
      return wood(st, wx, wy);
    case M.CONCRETO: {
      const lx = wx & 15;
      const ly = wy & 15;
      if (lx === 0 || ly === 0) return CONC_P[0]!;
      if (lx === 1 || ly === 1) return CONC_P[4]!;
      const slab = hash01(wx >> 4, wy >> 4, 23);
      if (slab < 0.18 && lx === ((ly * 3 + 5) & 15)) return CONC_P[0]!; // rachadura
      let c = CONC_P[rampIndex(nz(wx, wy, 2) * 0.55 + 0.25, 4, wx, wy)]!;
      if (nz(wx + 77, wy + 33, 3) > 0.72) c = shade(c, 0.88); // mancha
      return c;
    }
    case M.ASFALTO: {
      const v = nz(wx, wy, 1) * 0.5 + hash01(wx, wy, 29) * 0.5;
      return ASF_P[rampIndex(v, 5, wx, wy, 0.4)]!;
    }
    case M.NEON: {
      const lx = wx & 15;
      const ly = wy & 15;
      if (lx === 0 || ly === 0) return mix(C.neonCyan, NEON_BASE[0]!, 0.62);
      if (lx === 1 && ly === 1) return mix(C.neonPink, NEON_BASE[1]!, 0.5);
      return NEON_BASE[rampIndex(nz(wx, wy, 2), 4, wx, wy)]!;
    }
    default:
      return hex('#0c0c14');
  }
}

// ---------------------------------------------------------------------------
// sombras e luz (máscaras por pixel do bloco)

class Layer {
  readonly shadow: Uint8Array;
  readonly lamp: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.shadow = new Uint8Array(w * h);
    this.lamp = new Uint8Array(w * h);
  }
  dark(x: number, y: number, s: number): void {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (this.shadow[i]! < s) this.shadow[i] = s;
  }
  /** elipse de sombra com borda pontilhada (macia) */
  ellipse(cx: number, cy: number, rx: number, ry: number, s: number): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= 1) continue;
        if (d < 0.7) this.dark(x, y, s);
        else if (bayer(x, y) > (d - 0.7) / 0.3) this.dark(x, y, Math.round(s * 0.6));
      }
  }
  light(cx: number, cy: number, r: number): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
        if (d >= 1) continue;
        const v = Math.round(255 * (1 - d) * (0.7 + bayer(x, y) * 0.3));
        const i = y * this.w + x;
        if (this.lamp[i]! < v) this.lamp[i] = v;
      }
  }
}

// ---------------------------------------------------------------------------
// objetos de tile (32x32 transparentes, em cache)

const objCache = new Map<string, Pix>();
function cached(key: string, make: () => Pix): Pix {
  let p = objCache.get(key);
  if (!p) {
    p = make();
    objCache.set(key, p);
  }
  return p;
}

/** Parede no estilo Tibia: com parede ao sul vira topo; senão mostra a face da frente. */
function wallPix(st: Style, n: boolean, s: boolean, e: boolean, w: boolean, v: number, tx = 0, ty = 0): Pix {
  // o ruído usa a posição no mundo: telhados e paredes não se repetem tile a tile
  const ox = tx * TPX;
  const oy = ty * TPX;
  return cached(`w${st}${+n}${+s}${+e}${+w}${v}_${tx}_${ty}`, () => {
    const p = new Pix(TPX, TPX);
    const faceTop = s ? TPX : 12;
    // topo (telhado/beirada)
    for (let y = 0; y < faceTop; y++)
      for (let x = 0; x < TPX; x++) {
        let c: Color;
        if (st === 1) c = mix(hex('#9aa0aa'), hex('#b8bec8'), nz(x + ox, y + oy, 2) > 0.5 ? 0.6 : 0.2);
        else if (st === 2) {
          // telha de zinco ondulada: crista clara, vale escuro e ferrugem
          const k = x % 5;
          c = [hex('#b4bcc2'), hex('#949ca4'), hex('#848c94'), hex('#6c747c'), hex('#8c949c')][k]!;
          const rust = nz(x + ox, (y + oy) * 2 + 7, 1);
          if (rust > 0.62) c = mix(c, hex('#a0582e'), rust > 0.72 ? 0.6 : 0.3);
          if (y % 16 === 15) c = shade(c, 0.8); // emenda das folhas
        } else {
          c = mix(hex('#a8744a'), hex('#c49060'), nz(x + ox, y + oy + 11, 1));
          if ((x + y * 3) % 7 === 0) c = shade(c, 0.9);
        }
        p.set(x, y, c);
      }
    if (!n) p.hline(0, TPX - 1, 0, st === 1 ? hex('#e4e8ee') : st === 2 ? hex('#c8d0d6') : hex('#e0b888'));
    if (!s) {
      p.hline(0, TPX - 1, faceTop - 1, shade(p.get(0, faceTop - 2), 0.75));
      // face da frente
      for (let y = faceTop; y < TPX; y++)
        for (let x = 0; x < TPX; x++) {
          const fy = y - faceTop;
          let c: Color;
          if (st === 1) {
            c = fy < 2 ? hex('#7e828c') : hex('#686c76');
            const wx = x % 16;
            if (fy >= 3 && fy <= 13 && wx >= 3 && wx <= 12) {
              c = hex('#1e2c48');
              if (wx - 3 === fy - 3 || wx - 4 === fy - 3) c = withAlpha(mix(c, C.neonCyan, 0.45), 255); // reflexo
              if (fy === 3 || wx === 3) c = hex('#2e4068');
            }
            if (fy === 17) c = v % 2 ? C.neonPink : C.neonCyan;
          } else if (st === 2) {
            // tábuas em pé com fresta
            const px = x % 6;
            c = px === 5 ? WOOD_GAP : mix(WOOD_P[2]!, WOOD_P[3]!, ((x / 6) | 0) % 2 ? 0.2 : 0.7);
            if (px === 0) c = WOOD_P[4]!;
            if ((fy === 3 || fy === 15) && px === 2) c = hex('#2c282e');
            if (nz(x + ox, (y + oy) * 3, 1) > 0.7 && px !== 5) c = shade(c, 0.86);
          } else {
            // tijolo e taipa
            const row = (fy / 4) | 0;
            const bx = (x + (row % 2) * 4) % 8;
            c = row % 2 ? hex('#a65a3a') : hex('#b26640');
            if (fy % 4 === 3 || bx === 0) c = hex('#6e3a28');
            else if (fy % 4 === 0) c = light(c, 0.12);
            if (nz(x + ox, y + oy + 40, 2) > 0.7) c = mix(c, hex('#4e8a36'), 0.7); // trepadeira
          }
          p.set(x, y, c);
        }
      p.hline(0, TPX - 1, TPX - 1, OUTLINE_BASE);
    }
    if (!e) p.vline(TPX - 1, 0, TPX - 1, shade(p.get(TPX - 2, 4), 0.62));
    if (!w) p.vline(0, 0, faceTop - 1, light(p.get(1, 4), 0.15));
    return p;
  });
}

function doorPix(st: Style, inWall: boolean, v: number): Pix {
  return cached(`d${st}${+inWall}${v}`, () => {
    const p = inWall ? wallPix(st, false, false, true, true, v).clone() : new Pix(TPX, TPX);
    if (st === 1) {
      p.rect(6, 6, 20, 26, withAlpha(hex('#6ab8d8'), 200));
      p.vline(16, 6, 31, hex('#3a3e46'));
      p.frame(5, 5, 26, 31, hex('#3a3e46'));
      p.hline(7, 24, 8, withAlpha(C.pureWhite, 160));
      p.hline(6, 25, 4, C.neonCyan);
      return p;
    }
    const wd = st === 2 ? hex('#7a4e2a') : hex('#8a5a32');
    p.rect(7, 4, 18, 28, wd);
    for (let x = 11; x < 24; x += 4) p.vline(x, 5, 31, shade(wd, 0.8));
    p.frame(6, 3, 25, 31, OUTLINE_BASE);
    p.hline(7, 24, 4, light(wd, 0.25));
    p.set(21, 18, C.gold);
    p.set(21, 17, light(C.gold, 0.4));
    if (!inWall) {
      p.rect(8, 27, 16, 4, hex('#a8463f')); // capacho
      p.hline(8, 23, 28, hex('#d8a040'));
    }
    return p;
  });
}

const STONE_P = P('#3e3a36', '#5a554e', '#787166', '#968e80', '#b6ad9c', '#d4ccba');

function stonePix(st: Style, v: number): Pix {
  return cached(`s${st}${v}`, () => {
    const p = new Pix(TPX, TPX);
    const rocks: [number, number, number, number][] = v === 0 ? [[16, 19, 12, 9.5]] : [[12, 20, 9, 7.5], [22, 23, 7, 5.5], [21, 14, 5, 4]];
    for (const [cx, cy, rx, ry] of rocks)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const nx = (x + 0.5 - cx) / rx;
          const ny = (y + 0.5 - cy) / ry;
          const d2 = nx * nx + ny * ny * 1.05 + (hash01(x, y, 41 + v) - 0.5) * 0.08;
          if (d2 >= 1) continue;
          const nzv = Math.sqrt(Math.max(0, 1 - d2));
          const l = -0.55 * nx - 0.62 * ny + 0.6 * nzv;
          let k = rampIndex(l * 0.5 + 0.45, 6, x, y, 0.7);
          if (hash01(x, y, 43) < 0.06) k = Math.max(0, k - 1);
          let c = STONE_P[k]!;
          if (st !== 1 && ny < -0.35 && nz(x * 3 + v * 7, y * 3, 1) > 0.52) c = mix(c, hex('#5a8a3a'), 0.75); // musgo
          p.set(x, y, c);
        }
    // rachadura
    p.line(12, 16, 15, 21, STONE_P[1]!);
    p.outlineSelective();
    return p;
  });
}

function fencePix(st: Style, n: boolean, e: boolean, s: boolean, w: boolean): Pix {
  return cached(`f${st}${+n}${+e}${+s}${+w}`, () => {
    const p = new Pix(TPX, TPX);
    const col = st === 1 ? hex('#9aa0a8') : hex('#8a5a32');
    const dk = shade(col, 0.66);
    const lt = light(col, 0.25);
    const horiz = e || w || !(n || s);
    if (horiz) {
      const x0 = w ? 0 : 13;
      const x1 = e ? 31 : 18;
      for (const ry of [12, 20]) {
        p.box(x0, ry, x1, ry + 2, col);
        p.hline(x0, x1, ry, lt);
        p.hline(x0, x1, ry + 2, dk);
      }
    }
    if (n || s) {
      const y0 = n ? 0 : 8;
      const y1 = s ? 31 : 26;
      p.box(14, y0, 17, y1, col);
      p.vline(14, y0, y1, lt);
      p.vline(17, y0, y1, dk);
    }
    // mourão
    p.box(13, 6, 18, 27, col);
    p.vline(13, 6, 27, lt);
    p.vline(18, 6, 27, dk);
    p.hline(13, 18, 6, lt);
    if (st !== 1) {
      p.set(15, 9, dk); // veio da madeira
      p.set(16, 15, dk);
    } else {
      for (let x = 0; x < TPX; x += 3) if (horiz) p.set(x, 9 + (x % 2), C.metal); // arame
    }
    p.outlineSelective();
    return p;
  });
}

function gradePix(n: boolean, e: boolean, s: boolean, w: boolean): Pix {
  return cached(`g${+n}${+e}${+s}${+w}`, () => {
    const p = new Pix(TPX, TPX);
    const col = hex('#4e525a');
    const lt = hex('#8a909a');
    const horiz = e || w || !(n || s);
    if (horiz) {
      p.box(0, 4, 31, 5, col);
      p.box(0, 25, 31, 26, col);
      for (let x = 1; x < TPX; x += 4) {
        p.vline(x, 2, 27, col);
        p.vline(x + 1, 2, 27, lt);
        p.set(x, 1, lt);
      }
    } else {
      p.box(13, 0, 18, 31, col);
      for (let y = 1; y < TPX; y += 4) p.hline(13, 18, y, lt);
    }
    p.outlineSelective();
    return p;
  });
}

function machinePix(v: number): Pix {
  return cached(`m${v}`, () => {
    const p = new Pix(TPX, TPX);
    const body = v === 2 ? hex('#2a2e3a') : hex('#6a6e76');
    p.rect(2, 5, 28, 25, body);
    p.rect(2, 5, 28, 4, light(body, 0.25));
    p.vline(29, 5, 29, shade(body, 0.6));
    p.hline(2, 29, 29, shade(body, 0.6));
    if (v === 0) {
      p.ring(16, 19, 9, 9, 2, hex('#8a5a3a'));
      for (let k = 0; k < 4; k++) p.line(16, 19, 16 + Math.cos(k * 1.57 + 0.4) * 8, 19 + Math.sin(k * 1.57 + 0.4) * 8, hex('#9aa0a8'));
      p.disk(16, 19, 2, hex('#c8ccd2'));
    } else if (v === 1) {
      for (let y = 11; y < 27; y += 3) p.hline(5, 17, y, shade(body, 0.7));
      p.rect(20, 11, 7, 7, hex('#2a2a2a'));
      p.set(22, 13, C.red);
      p.set(24, 13, C.neonGreen);
      p.rect(21, 21, 5, 5, C.warn);
      p.set(23, 23, C.ink);
    } else {
      p.rect(5, 10, 22, 12, hex('#0e1018'));
      for (let x = 7; x < 25; x += 3) p.vline(x, 20 - ((x * 7) % 9), 20, x % 2 ? C.neonCyan : C.neonPink);
      p.rect(6, 24, 4, 3, C.neonGreen);
    }
    p.outlineSelective();
    return p;
  });
}

// ---------------------------------------------------------------------------
// decoração espalhada

type DecoKind = 'flores' | 'pedrinhas' | 'cogumelo' | 'concha' | 'caranguejo' | 'estrela' | 'pegadas' | 'tabua' | 'junco' | 'rede' | 'lampiao' | 'balde' | 'vitoria_regia' | 'tufo' | 'none';

/** Decoração de um tile: a do mapa (TileMap.deco) ou uma escolha estável pelo hash. */
export function decoFor(src: TerrainSource, x: number, y: number, mat: number, st: Style): DecoKind {
  const md = src.deco?.(x, y) ?? 0;
  if (md === Deco.Flor) return 'flores';
  if (md === Deco.Concha) return 'concha';
  if (md === Deco.Tabua) return 'tabua';
  if (md > 0) return 'pedrinhas';
  const t = src.tile(x, y);
  if (OBJECT_TILES.has(t)) return 'none';
  const r = hashInt(x, y, 101) % 1000;
  const near = (pred: (m: number) => boolean) =>
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dy]) => pred(TILE_MAT[src.tile(x + dx!, y + dy!)] ?? -1));
  switch (mat) {
    case M.GRAMA:
      if (r < 45) return 'flores';
      if (r < 75) return 'pedrinhas';
      if (r < 88 && st !== 1) return 'cogumelo';
      return 'none';
    case M.MATO:
      return r < 30 ? 'flores' : 'none';
    case M.AREIA:
      if (r < 50) return 'concha';
      if (r < 85 && near(isWater)) return 'caranguejo';
      if (r < 100) return 'estrela';
      if (r < 130) return 'pedrinhas';
      return 'none';
    case M.LAMA:
      if (r < 40) return 'pegadas';
      if (r < 65) return 'tabua';
      if (r < 95) return 'junco';
      return 'none';
    case M.TERRA:
      if (r < 60) return 'pedrinhas';
      if (r < 80) return 'tufo';
      return 'none';
    case M.MADEIRA: {
      const w = near(isWater);
      if (r < 25) return 'tabua';
      if (r < 50 && w) return 'rede';
      if (r < 68 && w) return 'lampiao';
      if (r < 78) return 'balde';
      return 'none';
    }
    case M.RASA:
      if (r < 35 && st !== 1) return 'vitoria_regia';
      if (r < 55 && near((m) => NATURAL[m]! && !isWater(m))) return 'junco';
      return 'none';
    default:
      return 'none';
  }
}

/** Desenha a decoração no buffer do bloco; (ox, oy) = canto do tile no buffer. */
function drawDeco(out: Pix, kind: DecoKind, ox: number, oy: number, wx: number, wy: number, st: Style): void {
  const h = hashInt(wx, wy, 103);
  const px = ox + 6 + (h % 18);
  const py = oy + 8 + ((h >>> 8) % 16);
  const put = (x: number, y: number, c: Color) => out.put(x, y, c);
  switch (kind) {
    case 'flores': {
      const sets = st === 1 ? ['#f0e060', '#f4f0f0'] : st === 2 ? ['#f4f0f0', '#f0e060', '#e8a0c8'] : ['#f0e060', '#f4f0f0', '#e86a8a', '#9a7af0'];
      const n = 3 + (h % 3);
      for (let k = 0; k < n; k++) {
        const hk = hashInt(wx * 7 + k, wy, 107);
        const x = ox + 4 + (hk % 24);
        const y = oy + 5 + ((hk >>> 8) % 22);
        const c = hex(sets[(hk >>> 16) % sets.length]!);
        put(x, y + 1, GRASS[st]![0]!);
        put(x, y + 2, GRASS[st]![1]!);
        put(x - 1, y, c);
        put(x + 1, y, shade(c, 0.85));
        put(x, y - 1, light(c, 0.3));
        put(x, y + 1, shade(c, 0.8));
        put(x, y, hex('#e8a020'));
      }
      break;
    }
    case 'pedrinhas':
      for (let k = 0; k < 3; k++) {
        const hk = hashInt(wx + k * 5, wy, 109);
        const x = ox + 4 + (hk % 24);
        const y = oy + 4 + ((hk >>> 8) % 24);
        put(x, y, STONE_P[4]!);
        put(x + 1, y, STONE_P[3]!);
        put(x, y + 1, STONE_P[1]!);
        put(x + 1, y + 1, STONE_P[0]!);
      }
      break;
    case 'cogumelo': {
      // SUGESTÃO: cogumelinho vermelho de mata
      const cap = hex('#c83a2a');
      out.hline(px - 2, px + 2, py, cap);
      out.hline(px - 1, px + 1, py - 1, cap);
      put(px - 1, py - 1, light(cap, 0.3));
      put(px + 1, py, C.white);
      put(px - 1, py, C.white);
      put(px, py + 1, hex('#efe6cf'));
      put(px, py + 2, hex('#cfc6af'));
      put(px + 1, py + 2, withAlpha(SHADOW_TINT, 120));
      break;
    }
    case 'concha': {
      const c = hex(['#f0e0d8', '#e8c8b8', '#f4d8c0'][h % 3]!);
      out.hline(px - 2, px + 2, py, c);
      out.hline(px - 1, px + 1, py - 1, c);
      put(px, py - 2, c);
      put(px - 1, py, shade(c, 0.82));
      put(px + 1, py, shade(c, 0.82));
      put(px, py + 1, hex('#c8a890'));
      put(px + 2, py + 1, withAlpha(SHADOW_TINT, 90));
      break;
    }
    case 'caranguejo': {
      // caranguejinho: corpo laranja, olhos de palito e pinças
      const c = hex('#d8582e');
      out.hline(px - 2, px + 2, py, c);
      out.hline(px - 1, px + 1, py - 1, light(c, 0.2));
      out.hline(px - 1, px + 1, py + 1, shade(c, 0.75));
      put(px - 1, py - 2, C.ink);
      put(px + 1, py - 2, C.ink);
      put(px - 3, py - 1, c);
      put(px + 3, py - 1, c);
      put(px - 3, py + 1, shade(c, 0.7));
      put(px + 3, py + 1, shade(c, 0.7));
      out.hline(px - 2, px + 2, py + 2, withAlpha(SHADOW_TINT, 90));
      break;
    }
    case 'estrela': {
      const c = hex('#e8803a');
      put(px, py - 2, c);
      out.hline(px - 2, px + 2, py, c);
      put(px, py - 1, c);
      put(px - 1, py + 1, c);
      put(px + 1, py + 1, c);
      put(px - 2, py + 2, shade(c, 0.8));
      put(px + 2, py + 2, shade(c, 0.8));
      put(px, py, light(c, 0.3));
      break;
    }
    case 'pegadas':
      for (let k = 0; k < 4; k++) {
        const x = ox + 6 + k * 6;
        const y = oy + 10 + (k % 2) * 6 + (h % 6);
        put(x, y, LAMA_P[0]!);
        put(x + 1, y, LAMA_P[0]!);
        put(x, y + 1, LAMA_P[0]!);
        put(x + 1, y - 1, LAMA_P[4]!);
      }
      break;
    case 'tabua': {
      const x0 = ox + 4 + (h % 8);
      const y0 = oy + 8 + ((h >>> 8) % 14);
      const c = WOOD_P[2 + (h % 2)]!;
      out.box(x0 + 1, y0 + 4, x0 + 15, y0 + 4, withAlpha(SHADOW_TINT, 110));
      out.box(x0, y0, x0 + 14, y0 + 3, c);
      out.hline(x0, x0 + 14, y0, light(c, 0.2));
      out.hline(x0, x0 + 14, y0 + 3, shade(c, 0.7));
      put(x0 + 2, y0 + 1, hex('#a29ea6'));
      put(x0 + 2, y0 + 2, hex('#2c282e'));
      put(x0 + 9, y0 + 2, shade(c, 0.8));
      break;
    }
    case 'junco':
      for (let k = 0; k < 5; k++) {
        const x = ox + 4 + ((h >>> (k * 3)) % 24);
        const hgt = 3 + ((h >>> (k * 2)) % 4);
        const y = oy + 16 + ((h >>> k) % 12);
        for (let j = 0; j < hgt; j++) put(x, y - j, j === hgt - 1 ? hex('#a8b860') : hex('#4e7a32'));
        put(x + 1, y, withAlpha(SHADOW_TINT, 90));
      }
      break;
    case 'tufo':
      for (let k = -2; k <= 2; k++) put(px + k, py - (2 - Math.abs(k)), Math.abs(k) === 2 ? hex('#4e7a32') : hex('#6a9a3e'));
      break;
    case 'rede': {
      // rede de pesca secando no deque, com boias
      const x0 = ox + 6 + (h % 6);
      const y0 = oy + 8 + ((h >>> 8) % 8);
      const c = hex('#d8ccaa');
      for (let y = 0; y < 10; y++)
        for (let x = 0; x < 16; x++) if ((x + y) % 4 === 0 || (x - y + 16) % 4 === 0) put(x0 + x, y0 + y, (x + y) % 2 ? c : shade(c, 0.85));
      put(x0, y0, hex('#e8702a'));
      put(x0 + 15, y0, hex('#e8702a'));
      put(x0 + 8, y0 + 9, hex('#e8702a'));
      break;
    }
    case 'lampiao': {
      const x = ox + 24;
      const y = oy + 6;
      out.box(x, y + 4, x, y + 14, hex('#3a2a1e'));
      out.box(x - 2, y, x + 2, y + 4, hex('#2a2a2e'));
      out.box(x - 1, y + 1, x + 1, y + 3, hex('#ffd860'));
      put(x - 1, y + 1, C.pureWhite);
      out.hline(x - 2, x + 2, y - 1, hex('#4a4a52'));
      out.hline(x + 1, x + 2, y + 15, withAlpha(SHADOW_TINT, 120));
      break;
    }
    case 'balde': {
      // SUGESTÃO: balde de isca
      const c = hex('#3a7ab0');
      out.box(px - 2, py - 2, px + 2, py + 2, c);
      out.hline(px - 2, px + 2, py - 2, light(c, 0.3));
      out.vline(px + 2, py - 2, py + 2, shade(c, 0.7));
      out.hline(px - 1, px + 1, py - 1, hex('#203a50'));
      out.hline(px - 1, px + 3, py + 3, withAlpha(SHADOW_TINT, 110));
      break;
    }
    case 'vitoria_regia': {
      const c = hex('#4e9a3a');
      out.ellipse(px + 0.5, py + 0.5, 3.5, 2.2, c);
      put(px + 1, py, RASA_P[2]!);
      put(px + 2, py, RASA_P[2]!);
      put(px - 2, py, light(c, 0.3));
      if (h % 3 === 0) {
        put(px - 1, py - 1, hex('#f4a8c8'));
        put(px, py - 1, hex('#ffd8e8'));
      }
      break;
    }
    case 'none':
      break;
  }
}

// ---------------------------------------------------------------------------
// render do bloco

const N8: [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

/** Material do chão sob um objeto: o mais comum entre os vizinhos que não são objeto. */
function groundUnder(src: TerrainSource, x: number, y: number, st: Style, t: number): number {
  const count = new Map<number, number>();
  for (const [dx, dy] of N8.slice(0, 4)) {
    const nt = src.tile(x + dx, y + dy);
    if (OBJECT_TILES.has(nt)) continue;
    const m = TILE_MAT[nt];
    if (m === undefined || m === M.VAZIO || isWater(m)) continue;
    count.set(m, (count.get(m) ?? 0) + 1);
  }
  let best = -1;
  let bn = 0;
  for (const [m, n] of count) if (n > bn || (n === bn && PRIO[m]! > (PRIO[best] ?? -1))) [best, bn] = [m, n];
  if (best >= 0) return best;
  if (t === Tile.Grade || t === Tile.Maquina || st === 1) return M.CONCRETO;
  return M.GRAMA;
}

/**
 * Desenha o chão de tw x th tiles a partir de (tx0, ty0). Saída: buffer opaco de tw*32 x th*32.
 * Árvores (o tronco e a copa) ficam de fora: são sprites com profundidade (treeSprite).
 */
export function renderTerrain(src: TerrainSource, tx0: number, ty0: number, tw: number, th: number): Pix {
  const PAD = 2;
  const gw = tw + PAD * 2;
  const gh = th + PAD * 2;
  const tiles = new Uint8Array(gw * gh);
  const mats = new Uint8Array(gw * gh);
  const sts = new Uint8Array(gw * gh);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      const x = tx0 + i - PAD;
      const y = ty0 + j - PAD;
      const t = src.tile(x, y);
      const st = src.style(x, y);
      tiles[j * gw + i] = t;
      sts[j * gw + i] = st;
      mats[j * gw + i] = OBJECT_TILES.has(t) ? groundUnder(src, x, y, st, t) : (TILE_MAT[t] ?? M.VAZIO);
    }
  const W = tw * TPX;
  const H = th * TPX;
  const out = new Pix(W, H);
  const d = out.data;
  const lay = new Layer(W, H);
  const setI = (i: number, c: Color) => {
    d[i] = c >>> 24;
    d[i + 1] = (c >>> 16) & 255;
    d[i + 2] = (c >>> 8) & 255;
    d[i + 3] = 255;
  };

  // 1) chão com transições. Para cada nível de prioridade, um campo suave entre os centros dos 4
  // tiles em volta do pixel (bilinear com smoothstep) mais ruído; o maior nível que passa do limiar
  // ganha o pixel. Isso arredonda cantos de fora e de dentro e deixa a borda orgânica em todos os
  // casos (o "blob" de 47 casos sem tabela). Materiais construídos (madeira, concreto...) não entram:
  // têm borda reta.
  const cw = [0, 0, 0, 0];
  const cm = [0, 0, 0, 0];
  const cs = [0, 0, 0, 0];
  const lvlMargin = new Float32Array(8);
  for (let ty = 0; ty < th; ty++)
    for (let tx = 0; tx < tw; tx++) {
      const gi = (ty + PAD) * gw + tx + PAD;
      const own = mats[gi]!;
      const st = sts[gi]! as Style;
      const wx0 = (tx0 + tx) * TPX;
      const wy0 = (ty0 + ty) * TPX;
      for (let q = 0; q < 4; q++) {
        const qx = q & 1;
        const qy = q >> 1;
        const g00 = gi + (qy === 0 ? -gw : 0) + (qx === 0 ? -1 : 0);
        const gs = [g00, g00 + 1, g00 + gw, g00 + gw + 1];
        let same = true;
        for (let k = 0; k < 4; k++) {
          const m = mats[gs[k]!]!;
          cm[k] = NATURAL[own] && NATURAL[m] ? m : own;
          cs[k] = NATURAL[own] && NATURAL[m] ? sts[gs[k]!]! : st;
          if (cm[k] !== own && !(isGrass(cm[k]!) && isGrass(own))) same = false;
        }
        let minP = 99;
        let maxP = -1;
        for (let k = 0; k < 4; k++) {
          minP = Math.min(minP, PRIO[cm[k]!]!);
          maxP = Math.max(maxP, PRIO[cm[k]!]!);
        }
        for (let ly = qy * 16; ly < qy * 16 + 16; ly++)
          for (let lx = qx * 16; lx < qx * 16 + 16; lx++) {
            const wx = wx0 + lx;
            const wy = wy0 + ly;
            const i = ((ty * TPX + ly) * W + tx * TPX + lx) * 4;
            if (same) {
              setI(i, groundColor(own, st, wx, wy));
              continue;
            }
            let u = (lx + 0.5) / TPX + (qx === 0 ? 0.5 : -0.5);
            let v = (ly + 0.5) / TPX + (qy === 0 ? 0.5 : -0.5);
            u = u * u * (3 - 2 * u);
            v = v * v * (3 - 2 * v);
            cw[0] = (1 - u) * (1 - v);
            cw[1] = u * (1 - v);
            cw[2] = (1 - u) * v;
            cw[3] = u * v;
            let res = -1;
            let rst = st;
            let margin = 99;
            lvlMargin.fill(-99);
            for (let L = maxP; L > minP; L--) {
              let f = 0;
              let present = false;
              for (let k = 0; k < 4; k++) {
                const p = PRIO[cm[k]!]!;
                if (p >= L) f += cw[k]!;
                if (p === L) present = true;
              }
              if (!present) continue;
              f += (nz(wx + L * 57, wy + L * 31, 3) - 0.5) * 0.46 + (hash01(wx, wy, L) - 0.5) * 0.05;
              const mg = (f - THR[L]!) * TPX;
              lvlMargin[L] = mg;
              if (mg > 0) {
                let bw = -1;
                for (let k = 0; k < 4; k++)
                  if (PRIO[cm[k]!] === L && cw[k]! > bw) {
                    bw = cw[k]!;
                    res = cm[k]!;
                    rst = cs[k]! as Style;
                  }
                margin = mg;
                break;
              }
            }
            if (res < 0) {
              let bw = -1;
              for (let k = 0; k < 4; k++)
                if (PRIO[cm[k]!] === minP && cw[k]! > bw) {
                  bw = cw[k]!;
                  res = cm[k]!;
                  rst = cs[k]! as Style;
                }
            }
            let c = groundColor(res, rst, wx, wy);
            let landM = -99;
            for (let L = 3; L <= 6; L++) landM = Math.max(landM, lvlMargin[L]!);
            const grassM = lvlMargin[6]!;
            if (isWater(res)) {
              if (landM > -1.4) c = (hashInt(wx, wy, 61) & 3) === 0 ? FOAM2 : FOAM;
              else if (landM > -3.2) c = (hashInt(wx, wy, 61) & 1) === 0 || landM > -2.2 ? mix(c, FOAM2, 0.55) : c;
              else if (landM > -7) c = mix(c, RASA_P[4]!, 0.2);
              if (res === M.FUNDA && lvlMargin[2]! > -8) c = mix(c, RASA_P[1]!, ((lvlMargin[2]! + 8) / 8) * 0.5);
            } else if (minP <= 2 && margin < 3) {
              // terra na beira da água: areia molhada e beira escura
              c = mix(c, hex('#4a3e2e'), margin < 1.3 ? 0.42 : 0.22);
            }
            if (isGrass(res) && minP < 6 && margin < 1.3) c = GRASS[rst]![0]!;
            else if (!isGrass(res) && grassM > -1.8 && (hashInt(wx, wy, 67) & 3) < 2) c = GRASS[st]![1]!;
            else if (res === M.TERRA && minP < 5 && margin < 1.1) c = TERRA_P[rst]![0]!;
            setI(i, c);
          }
      }
    }

  // 2) palafita: frente do deque, estacas e sombra; sombra de parede
  for (let ty = 0; ty < th; ty++)
    for (let tx = 0; tx < tw; tx++) {
      const gi = (ty + PAD) * gw + tx + PAD;
      const t = tiles[gi]!;
      const own = mats[gi]!;
      const ox = tx * TPX;
      const oy = ty * TPX;
      const north = tiles[gi - gw]!;
      const west = tiles[gi - 1]!;
      if (t !== Tile.Madeira && !isWallish(t) && north === Tile.Madeira) {
        for (let lx = 0; lx < TPX; lx++) {
          out.set(ox + lx, oy, WOOD_P[1]!);
          out.set(ox + lx, oy + 1, WOOD_P[0]!);
          out.set(ox + lx, oy + 2, WOOD_GAP);
        }
        for (let r = 3; r < 11; r++) for (let lx = 0; lx < TPX; lx++) lay.dark(ox + lx, oy + r, 150 - (r - 3) * 16);
        if (isWater(own) || own === M.LAMA) {
          for (const px of [5, 21]) {
            if ((hashInt(tx0 + tx, ty0 + ty, px) & 3) === 0) continue;
            for (let r = 3; r < 13; r++) {
              out.set(ox + px, oy + r, WOOD_P[3]!);
              out.set(ox + px + 1, oy + r, WOOD_P[1]!);
              out.set(ox + px + 2, oy + r, WOOD_P[0]!);
            }
            if (isWater(own)) {
              out.set(ox + px - 1, oy + 13, FOAM2);
              out.set(ox + px + 3, oy + 13, FOAM2);
              out.hline(ox + px, ox + px + 2, oy + 13, RASA_P[4]!);
            }
          }
        }
      }
      if (t !== Tile.Madeira && !isWallish(t) && west === Tile.Madeira && isWater(own)) for (let ly = 0; ly < TPX; ly++) for (let k = 0; k < 3; k++) lay.dark(ox + k, oy + ly, 110 - k * 25);
      if (!isWallish(t)) {
        if (isWallish(west)) for (let ly = 0; ly < TPX; ly++) for (let k = 0; k < 5; k++) lay.dark(ox + k, oy + ly, 120 - k * 20);
        if (isWallish(north)) for (let lx = 0; lx < TPX; lx++) for (let k = 0; k < 3; k++) lay.dark(ox + lx, oy + k, 100 - k * 30);
      }
    }

  // 3) decoração e sombras de objetos (inclui a borda de 2 tiles: sombras e luzes atravessam blocos)
  for (let ty = -PAD; ty < th + PAD; ty++)
    for (let tx = -PAD; tx < tw + PAD; tx++) {
      const gi = (ty + PAD) * gw + tx + PAD;
      const t = tiles[gi]!;
      const st = sts[gi]! as Style;
      const ox = tx * TPX;
      const oy = ty * TPX;
      const wx = tx0 + tx;
      const wy = ty0 + ty;
      const inside = tx >= 0 && ty >= 0 && tx < tw && ty < th;
      if (t === Tile.Arvore) {
        lay.ellipse(ox + 22, oy + 26, 24, 8.5, 120);
        lay.ellipse(ox + 16, oy + 28, 8, 3, 170);
      } else if (t === Tile.Pedra) {
        const sp = stonePix(st, hashInt(wx, wy, 5) & 1);
        shadowOf(lay, sp, ox + 3, oy + 3, 115);
      } else if (t === Tile.Cerca || t === Tile.Grade || t === Tile.Maquina) {
        shadowOf(lay, objectPix(src, wx, wy, t, st), ox + 2, oy + 3, 100);
      }
      const kind = decoFor(src, wx, wy, mats[gi]!, st);
      if (kind === 'lampiao') lay.light(ox + 24.5, oy + 8.5, 18);
      if (inside && kind !== 'none' && kind !== 'lampiao') drawDeco(out, kind, ox, oy, wx * TPX, wy * TPX, st);
    }

  // 4) aplica sombra
  for (let p = 0, i = 0; p < W * H; p++, i += 4) {
    const s = lay.shadow[p]!;
    if (s === 0) continue;
    const c = mix(((d[i]! << 24) | (d[i + 1]! << 16) | (d[i + 2]! << 8) | 255) >>> 0, SHADOW_TINT, (s / 255) * 0.62);
    setI(i, c);
  }

  // 5) objetos e lampiões (por cima da sombra)
  for (let ty = 0; ty < th; ty++)
    for (let tx = 0; tx < tw; tx++) {
      const gi = (ty + PAD) * gw + tx + PAD;
      const t = tiles[gi]!;
      const st = sts[gi]! as Style;
      const wx = tx0 + tx;
      const wy = ty0 + ty;
      if (OBJECT_TILES.has(t) && t !== Tile.Arvore) out.blit(objectPix(src, wx, wy, t, st), tx * TPX, ty * TPX);
      if (decoFor(src, wx, wy, mats[gi]!, st) === 'lampiao') drawDeco(out, 'lampiao', tx * TPX, ty * TPX, wx * TPX, wy * TPX, st);
    }

  // 6) luz quente dos lampiões
  for (let p = 0, i = 0; p < W * H; p++, i += 4) {
    const l = lay.lamp[p]!;
    if (l === 0) continue;
    const t = (l / 255) * 0.42;
    d[i] = d[i]! + (255 - d[i]!) * t * 0.95;
    d[i + 1] = d[i + 1]! + (((LAMP_LIGHT >>> 16) & 255) - d[i + 1]!) * t * 0.7;
    d[i + 2] = d[i + 2]! + (((LAMP_LIGHT >>> 8) & 255) - d[i + 2]!) * t * 0.35;
  }
  return out;
}

function shadowOf(lay: Layer, p: Pix, ox: number, oy: number, s: number): void {
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.alphaAt(x, y) > 0) lay.dark(ox + x, oy + y, s);
}

/** Sprite 32x32 de um objeto de tile (parede, porta, pedra, cerca, grade, máquina), pelos vizinhos. */
export function objectPix(src: TerrainSource, x: number, y: number, t: number, st: Style): Pix {
  const v = hashInt(x, y, 5);
  const nb = (dx: number, dy: number) => src.tile(x + dx, y + dy);
  switch (t) {
    case Tile.Parede:
      return wallPix(st, isWallish(nb(0, -1)), isWallish(nb(0, 1)), isWallish(nb(1, 0)), isWallish(nb(-1, 0)), v & 1, x, y);
    case Tile.Porta:
      return doorPix(st, nb(-1, 0) === Tile.Parede || nb(1, 0) === Tile.Parede, v & 1);
    case Tile.Pedra:
      return stonePix(st, v & 1);
    case Tile.Cerca:
      return fencePix(st, nb(0, -1) === Tile.Cerca, nb(1, 0) === Tile.Cerca, nb(0, 1) === Tile.Cerca, nb(-1, 0) === Tile.Cerca);
    case Tile.Grade:
      return gradePix(nb(0, -1) === Tile.Grade, nb(1, 0) === Tile.Grade, nb(0, 1) === Tile.Grade, nb(-1, 0) === Tile.Grade);
    case Tile.Maquina:
      return machinePix(st === 1 ? 2 : v % 2);
    default:
      return new Pix(TPX, TPX);
  }
}

// ---------------------------------------------------------------------------
// árvores grandes (2x3 tiles), desenhadas por cima de quem passa atrás

export const TREE_W = 64;
export const TREE_H = 96;
/** linha do chão (base do tronco) dentro do sprite da árvore */
export const TREE_BASE_Y = 90;

const LEAF: Color[][] = [
  P('#173d1c', '#215226', '#2d6a2e', '#3b8436', '#4f9e40', '#72ba52'),
  P('#2a3a2a', '#374a34', '#46593e', '#566a48', '#687c54', '#86966a'),
  P('#1e3a20', '#284a26', '#355c2c', '#446e34', '#56823c', '#74984c'),
];
const BARK: Color[][] = [P('#2e1c10', '#4a2e1a', '#64402a', '#7e5638'), P('#2e2a26', '#46403a', '#5e564c', '#78705e'), P('#2c2418', '#463a28', '#605036', '#7a6a4a')];

/** Árvore de 64x96: 0 mata da Esquerda, 1 árvore de cidade num canteiro, 2 mangue com raízes. */
export function treeSprite(style: Style, sub: number): Pix {
  return cached(`tree${style}_${sub}`, () => {
    const p = new Pix(TREE_W, TREE_H);
    const bark = BARK[style]!;
    const leaf = LEAF[style]!;
    const cx = 32;
    const gy = TREE_BASE_Y;
    const seed = style * 10 + sub;
    // tronco
    const trunkTop = style === 2 ? 52 : 48;
    const tw = style === 1 ? 3 : 4;
    for (let y = trunkTop; y <= gy; y++) {
      const flare = style === 0 ? Math.max(0, y - (gy - 5)) : 0;
      for (let x = cx - tw - flare; x <= cx + tw - 1 + flare; x++) {
        const u = (x - (cx - tw - flare)) / (2 * (tw + flare));
        let k = u < 0.25 ? 3 : u < 0.6 ? 2 : u < 0.85 ? 1 : 0;
        if ((x * 3 + ((y / 3) | 0)) % 5 === 0 && k > 0) k--; // casca
        p.set(x, y, bark[k]!);
      }
    }
    if (style === 2) {
      // raízes do mangue em arco até o chão
      const roots = [-22, -14, -6, 6, 14, 22];
      for (const [ri, dx] of roots.entries()) {
        const x0 = cx + dx * 0.25;
        const y0 = 60 + (ri % 2) * 4;
        for (let t = 0; t <= 1.0001; t += 0.04) {
          const x = x0 + (cx + dx - x0) * t;
          const y = y0 + (gy + 2 - y0) * t * t - Math.sin(t * Math.PI) * 6;
          p.set(Math.round(x), Math.round(y), bark[2]!);
          p.set(Math.round(x) + 1, Math.round(y), bark[1]!);
        }
      }
    }
    if (style === 1) {
      // canteiro de concreto
      p.box(cx - 10, gy - 2, cx + 9, gy + 3, CONC_P[2]!);
      p.hline(cx - 10, cx + 9, gy - 2, CONC_P[4]!);
      p.hline(cx - 8, cx + 7, gy - 1, TERRA_P[1]![1]!);
      p.vline(cx + 9, gy - 2, gy + 3, CONC_P[0]!);
    }
    // galhos
    p.line(cx, trunkTop + 6, cx - 9, trunkTop - 4, bark[2]!);
    p.line(cx + 1, trunkTop + 4, cx + 10, trunkTop - 6, bark[1]!);
    // copa em camadas (cachos de trás para a frente)
    const clusters: [number, number, number][] = [];
    const n = style === 1 ? 6 : 9;
    for (let k = 0; k < n; k++) {
      const a = hash01(k, sub, seed + 3);
      const b = hash01(k, sub, seed + 5);
      const spread = style === 2 ? 26 : style === 1 ? 14 : 20;
      const x = cx + (a - 0.5) * 2 * spread;
      const y = (style === 2 ? 34 : style === 1 ? 30 : 26) + (b - 0.5) * (style === 2 ? 18 : 26) + (k / n) * 10;
      const r = (style === 1 ? 9 : 11) + hash01(k, sub, seed + 7) * (style === 1 ? 4 : 6);
      clusters.push([x, y, r]);
    }
    clusters.push([cx, style === 2 ? 36 : 30, style === 1 ? 14 : 17]);
    clusters.sort((q, r) => q[1] - r[1]);
    const owner = new Int8Array(TREE_W * TREE_H).fill(-1);
    clusters.forEach(([x0, y0, r], ci) => {
      const ry = style === 2 ? r * 0.72 : r * 0.88;
      for (let y = Math.floor(y0 - ry - 1); y <= y0 + ry + 1; y++)
        for (let x = Math.floor(x0 - r - 1); x <= x0 + r + 1; x++) {
          if (x < 0 || y < 0 || x >= TREE_W || y >= TREE_H) continue;
          const dx = (x + 0.5 - x0) / r;
          const dy = (y + 0.5 - y0) / ry;
          const dd = dx * dx + dy * dy + (hash01(x, y, seed + 11) - 0.5) * 0.22;
          if (dd < 1) owner[y * TREE_W + x] = ci;
        }
    });
    for (let y = 0; y < TREE_H; y++)
      for (let x = 0; x < TREE_W; x++) {
        const ci = owner[y * TREE_W + x]!;
        if (ci < 0) continue;
        const [x0, y0, r] = clusters[ci]!;
        const ry = style === 2 ? r * 0.72 : r * 0.88;
        const dx = (x + 0.5 - x0) / r;
        const dy = (y + 0.5 - y0) / ry;
        let l = 0.62 - dx * 0.32 - dy * 0.42;
        // oclusão: logo abaixo de um cacho da frente fica mais escuro
        const below = y + 2 < TREE_H ? owner[(y + 2) * TREE_W + x]! : -1;
        if (below >= 0 && below !== ci && clusters[below]![1] > y0) l -= 0.12;
        const above = y - 1 >= 0 ? owner[(y - 1) * TREE_W + x]! : -1;
        if (above >= 0 && above !== ci) l -= 0.18;
        // textura de folha: tufinhos claros e buracos escuros
        const h = hashInt(x, y, seed + 13) & 255;
        if (h < 22) l += 0.22;
        else if (h > 236) l -= 0.25;
        let k = rampIndex(l, 6, x, y, 0.9);
        if (k > 4 && hash01(x >> 1, y >> 1, seed) < 0.5) k = 4;
        p.set(x, y, leaf[k]!);
      }
    // frutinhas na mata e cipós no mangue
    if (style === 0)
      for (let k = 0; k < 6; k++) {
        const x = 14 + (hashInt(k, sub, 17) % 36);
        const y = 14 + (hashInt(k, sub, 19) % 30);
        if (owner[y * TREE_W + x]! >= 0) {
          p.set(x, y, hex('#d8402e'));
          p.set(x, y - 1, hex('#ff8a6a'));
        }
      }
    if (style === 2)
      for (let k = 0; k < 7; k++) {
        const x = 8 + (hashInt(k, sub, 23) % 48);
        let y = 30;
        while (y < 80 && owner[y * TREE_W + x]! >= 0) y++;
        if (y >= 80 || y < 36) continue;
        const len = 6 + (hashInt(k, sub, 29) % 10);
        for (let j = 0; j < len; j++) p.set(x + (j > len / 2 ? 1 : 0), y + j, j % 3 === 0 ? leaf[2]! : bark[1]!);
      }
    p.outlineSelective();
    return p;
  });
}

// ---------------------------------------------------------------------------
// quadros animados por cima do chão (transparentes, 32x32)

export const OVERLAY_FRAMES = 4;
export const MATO_FRAMES = 4;

/** Brilhos da água que andam: 4 quadros, fase pela posição. */
export function glintFrame(deep: boolean, f: number, v: number): Pix {
  return cached(`gl${+deep}${f}${v}`, () => {
    const p = new Pix(TPX, TPX);
    const c = deep ? withAlpha(FUNDA_P[4]!, 230) : withAlpha(hex('#d8f0f4'), 220);
    const c2 = deep ? withAlpha(RASA_P[2]!, 170) : withAlpha(RASA_P[4]!, 200);
    for (let k = 0; k < 3; k++) {
      const hx = hashInt(k, v, deep ? 71 : 73);
      const x = (hx % 26) + ((f * 2) % 6);
      const y = 3 + ((hx >>> 8) % 26);
      const life = (f + k) % OVERLAY_FRAMES;
      const len = [1, 3, 4, 2][life]!;
      for (let i = 0; i < len; i++) p.set(x + i, y, i === 0 || i === len - 1 ? c2 : c);
      if (life === 2) p.set(x + 1, y - 1, withAlpha(C.pureWhite, deep ? 120 : 200));
    }
    return p;
  });
}

/** Tufos de mato que balançam (quadro f), variante v. */
export function matoFrame(st: Style, v: number, f: number): Pix {
  return cached(`mt${st}${v}${f}`, () => {
    const p = new Pix(TPX, TPX);
    const pal = GRASS[st]!;
    const sway = [0, 1, 0, -1][f]!;
    for (let k = 0; k < 7; k++) {
      const h = hashInt(k, v, 79 + st);
      const x = 3 + (h % 26);
      const base = 10 + ((h >>> 8) % 20);
      const hgt = 5 + ((h >>> 16) % 5);
      for (let j = 0; j < hgt; j++) {
        const top = j / hgt;
        const xx = x + Math.round(sway * top * top * 1.6) + (k % 2 && j > hgt - 3 ? 1 : 0);
        p.set(xx, base - j, j === hgt - 1 ? pal[4]! : j > hgt / 2 ? pal[3]! : pal[1]!);
        if (j < hgt - 2) p.set(xx + 1, base - j, pal[0]!);
      }
      p.set(x + 1, base + 1, withAlpha(SHADOW_TINT, 100));
    }
    return p;
  });
}

/** Pulso de neon correndo pela grade do piso. */
export function neonFrame(f: number): Pix {
  return cached(`ne${f}`, () => {
    const p = new Pix(TPX, TPX);
    const cols = [C.neonCyan, C.neonPink, C.neonPurple, C.neonCyan];
    const c = cols[f]!;
    const k = f * 8;
    for (let i = 0; i < 3; i++) {
      p.set((k + i) % 32, 0, withAlpha(c, 255 - i * 70));
      p.set(16, (k + i) % 32, withAlpha(c, 255 - i * 70));
      p.set(0, (k + 16 + i) % 32, withAlpha(c, 200 - i * 60));
    }
    p.set(1, 1, withAlpha(light(c, 0.5), 200));
    return p;
  });
}

/** Tipo de quadro animado de um tile (para a camada de animação), ou null. */
export function overlayKind(tile: number): 'rasa' | 'funda' | 'mato' | 'neon' | null {
  if (tile === Tile.AguaRasa) return 'rasa';
  if (tile === Tile.AguaFunda) return 'funda';
  if (tile === Tile.Mato) return 'mato';
  if (tile === Tile.PisoNeon) return 'neon';
  return null;
}

/** Fonte de terreno de um mapa uniforme (um tile só), para o tileset e testes. */
export function uniformSource(tile: number, style: Style = 0): TerrainSource {
  return { width: 3, height: 3, tile: () => tile, style: () => style };
}

/** Limpa os caches puros (testes). */
export function clearTerrainCache(): void {
  objCache.clear();
}
