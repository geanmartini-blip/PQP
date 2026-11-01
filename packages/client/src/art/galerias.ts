/**
 * Tileset das Galerias da Usina (Fase 5): túnel de concreto e rocha, cabos, poças de chopindita
 * brilhando, grades, turbinas quebradas e a escada para o andar de baixo. Folha `tiles_galerias`.
 *
 * Os tiles da masmorra usam os mesmos valores de Tile (map/types.ts); `galeriasFrame` traduz cada
 * valor para um quadro daqui. SUGESTÃO: a tradução (Lama = poça de chopindita, Mato = cabos no chão,
 * Porta = escada para baixo, PisoNeon = grelha de dreno, Madeira = passarela de chapa) não está nos
 * docs; serve até o gerador de andares ter tiles próprios.
 *
 * Quadros (32x32, salvo a turbina grande de 64x64):
 * - `gal_chao_${v}` (4), `gal_parede_topo_${v}` (2), `gal_parede_face_${v}` (3),
 *   `gal_rocha_topo_${v}` (2), `gal_rocha_face_${v}` (2), `gal_cabos_${v}` (3), `gal_grade_${v}` (2),
 *   `gal_maquina_${v}` (3), `gal_grelha`, `gal_passarela`, `gal_vazio`;
 * - animados (variante = quadro): `gal_poca_${f}` (4), `gal_agua_${f}` (4), `gal_funda_${f}` (4),
 *   `gal_escada_${f}` (4), `gal_turbina_grande_${f}` (4, 64x64).
 */
import { Tile } from '@pqp/shared/map';
import { bayer, hashInt, nz, rampIndex } from './noise';
import { C, type Color, hex, light, mix, Pix, shade, withAlpha } from './pixel';
import { packFrames, type SheetData } from './sheet';

export const GALERIAS_KEY = 'tiles_galerias';
/** SUGESTÃO: 220 ms por quadro da poça, da água e da escada. */
export const GALERIAS_ANIM_MS = 220;
export const GALERIAS_ANIM_FRAMES = 4;

// paleta (SUGESTÃO: concreto frio, rocha de terra, chopindita cor de chope)
const CONCRETO = [hex('#2c2b2e'), hex('#3d3c3e'), hex('#4f4d4d'), hex('#615e5b'), hex('#75716b'), hex('#8a857c')];
const ROCHA = [hex('#2a2220'), hex('#3c302a'), hex('#4f4036'), hex('#645142'), hex('#7a6350'), hex('#937a62')];
const CHOPE = [hex('#7a4208'), hex('#b0660e'), hex('#e09a1c'), hex('#f6c040'), hex('#ffe08a'), hex('#fff6d0')];
const AGUA = [hex('#0e2228'), hex('#163640'), hex('#1e4a56'), hex('#2a6070'), hex('#4a8a98'), hex('#8ac8d0')];
const METAL = [hex('#25282e'), hex('#3a3e46'), hex('#555a62'), hex('#727880'), hex('#959ba2'), hex('#c4cad2')];
const FERRUGEM = hex('#8a4e2a');
const HAZ = hex('#f0b81a');
const HAZ_DK = hex('#1c1a1a');

const ANIM_TILES: ReadonlySet<number> = new Set([Tile.AguaRasa, Tile.AguaFunda, Tile.Lama, Tile.Porta]);
const SOLID_TOP: ReadonlySet<number> = new Set([Tile.Parede, Tile.Pedra, Tile.Vazio, Tile.Maquina]);

/** Tiles das Galerias que animam (a variante do quadro anda com o tempo). */
export const GALERIAS_ANIMATED: ReadonlySet<number> = ANIM_TILES;

// ---------------------------------------------------------------------------
// apoio

/** Textura de ruído numa rampa, contínua entre tiles (amostra o ruído pela posição do mundo). */
function noiseFill(p: Pix, ramp: Color[], ox: number, oy: number, lo = 0.25, span = 0.5, ch = 0): void {
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const v = nz(ox + x, oy + y, ch) * 0.75 + nz((ox + x) * 3, (oy + y) * 3, (ch + 1) & 3) * 0.25;
      p.set(x, y, ramp[rampIndex(lo + v * span, ramp.length, x, y, 0.9)]!);
    }
}

/** Rachadura: passeio aleatório estável com borda clara de um lado. */
function crack(p: Pix, x: number, y: number, len: number, seed: number, dark: Color, lit: Color): void {
  let cx = x;
  let cy = y;
  for (let k = 0; k < len; k++) {
    p.set(cx, cy, dark);
    p.put(cx + 1, cy + 1, withAlpha(lit, 120));
    const h = hashInt(k, seed, 51) % 6;
    if (h < 3) cx++;
    else if (h < 5) cy++;
    else cx--;
  }
}

function concreteFloor(v: number): Pix {
  const p = new Pix(32, 32);
  noiseFill(p, CONCRETO, v * 37, v * 53, 0.42, 0.32);
  // emenda das placas de concreto
  p.hline(0, 31, 0, CONCRETO[1]!);
  p.hline(0, 31, 1, CONCRETO[4]!);
  p.vline(0, 0, 31, CONCRETO[1]!);
  p.vline(1, 1, 31, withAlpha(CONCRETO[4]!, 160));
  if (v === 1) crack(p, 6, 8, 18, v + 3, CONCRETO[0]!, CONCRETO[5]!);
  if (v === 2) {
    // mancha de óleo e um parafuso de chumbador
    p.ellipse(19, 20, 7, 4, withAlpha(hex('#1a1614'), 110));
    p.ellipse(18, 19, 4, 2, withAlpha(hex('#3a3040'), 90));
    p.put(16, 18, withAlpha(hex('#6a5a8a'), 120));
  }
  if (v === 3) {
    crack(p, 20, 4, 10, 9, CONCRETO[0]!, CONCRETO[5]!);
    // limo da umidade
    for (let y = 22; y < 31; y++) for (let x = 3; x < 14; x++) if (bayer(x, y) < 0.35 - (y - 22) * 0.02 + 0.2) p.put(x, y, withAlpha(hex('#4a6a3a'), 90));
  }
  for (const [bx, by] of [
    [5, 5],
    [27, 27],
  ] as const) {
    p.set(bx, by, CONCRETO[0]!);
    p.set(bx - 1, by - 1, CONCRETO[5]!);
  }
  return p;
}

function wallTop(ramp: Color[], v: number, seed: number): Pix {
  const p = new Pix(32, 32);
  noiseFill(p, ramp, seed + v * 41, seed + v * 13, 0.12, 0.3, 2);
  p.frame(0, 0, 31, 31, withAlpha(ramp[0]!, 200));
  if (ramp === CONCRETO) {
    // ponta de vergalhão aparecendo
    for (const [x, y] of [
      [8 + v * 6, 10],
      [22 - v * 4, 21],
    ] as const) {
      p.set(x, y, FERRUGEM);
      p.set(x + 1, y, shade(FERRUGEM, 0.6));
    }
  }
  return p;
}

function concreteFace(v: number): Pix {
  const p = new Pix(32, 32);
  // beirada de cima (o topo do muro) e a face com degradê escurecendo para baixo
  noiseFill(p, CONCRETO, v * 29 + 400, v * 11, 0.3, 0.32, 1);
  for (let y = 0; y < 32; y++) {
    const t = y < 6 ? 0 : (y - 6) / 26;
    for (let x = 0; x < 32; x++) {
      const c = p.get(x, y);
      p.set(x, y, y < 6 ? light(shade(c, 0.85), 0.12) : withAlpha(mix(c, hex('#1a1820'), 0.15 + t * 0.35), 255));
    }
  }
  p.hline(0, 31, 5, CONCRETO[5]!);
  p.hline(0, 31, 6, CONCRETO[0]!);
  // juntas da forma de concreto
  for (let y = 14; y < 32; y += 9) p.hline(0, 31, y, withAlpha(CONCRETO[0]!, 140));
  p.hline(0, 31, 31, hex('#141218'));
  if (v === 0) {
    // placa de perigo listrada
    p.box(9, 12, 22, 20, HAZ_DK);
    for (let x = 10; x <= 21; x++) for (let y = 13; y <= 19; y++) if ((((x + y) >> 1) & 1) === 0) p.set(x, y, HAZ);
    p.frame(9, 12, 22, 20, shade(HAZ, 0.5));
  } else if (v === 1) {
    // cano horizontal pingando
    p.capsule(-2, 17, 34, 17, 5, METAL[2]!, METAL[0]!);
    p.hline(0, 31, 16, METAL[4]!);
    p.box(14, 14, 16, 20, METAL[1]!);
    p.put(15, 22, withAlpha(AGUA[4]!, 200));
    p.put(15, 25, withAlpha(AGUA[5]!, 160));
    for (let x = 2; x < 30; x += 7) p.put(x, 19, FERRUGEM);
  } else {
    // feixe de cabos presos na parede
    const cols = [hex('#1e1c20'), hex('#b83a2e'), hex('#2a2a30'), hex('#d8a020')];
    cols.forEach((c, k) => p.capsule(-1, 12 + k * 2, 33, 13 + k * 2 + (k % 2), 2, c));
    for (const x of [6, 18, 29]) p.box(x, 11, x + 1, 20, METAL[3]!);
  }
  return p;
}

/** Rocha da escavação: blocos com volume (luz de cima à esquerda). */
function rockFace(v: number, face: boolean): Pix {
  const p = new Pix(32, 32);
  noiseFill(p, ROCHA, 900 + v * 23, 300 + v * 31, 0.1, 0.25, 3);
  const n = 5 + v;
  for (let k = 0; k < n; k++) {
    const h = hashInt(k, v, face ? 77 : 78);
    const cx = 3 + (h % 26);
    const cy = (face ? 8 : 3) + ((h >>> 8) % (face ? 20 : 26));
    const rx = 4 + ((h >>> 16) % 4);
    const ry = 3 + ((h >>> 20) % 3);
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        const d = nx * nx + ny * ny;
        if (d >= 1) continue;
        const l = -0.55 * nx - 0.7 * ny + 0.4 * Math.sqrt(1 - d);
        p.set(x, y, ROCHA[rampIndex(0.35 + l * 0.45, ROCHA.length, x, y, 0.8)]!);
      }
  }
  if (face) {
    p.hline(0, 31, 31, hex('#120e0e'));
    for (let x = 0; x < 32; x++) p.put(x, 30, withAlpha(hex('#120e0e'), 120));
    // veio de chopindita na rocha
    if (v === 1)
      for (let k = 0; k < 6; k++) {
        p.set(10 + k * 2, 16 + (k % 2), CHOPE[3]!);
        p.put(10 + k * 2, 15 + (k % 2), withAlpha(CHOPE[5]!, 160));
      }
  }
  return p;
}

function cables(v: number): Pix {
  const p = concreteFloor(v % 4);
  const routes: [number, number, number, number, Color][][] = [
    [
      [-2, 9, 34, 14, hex('#1e1c20')],
      [-2, 12, 34, 19, hex('#b83a2e')],
    ],
    [
      [8, -2, 13, 34, hex('#1e1c20')],
      [12, -2, 19, 34, hex('#2a5ab8')],
      [16, -2, 23, 34, hex('#d8a020')],
    ],
    [
      [-2, 20, 18, 14, hex('#1e1c20')],
      [18, 14, 34, 22, hex('#1e1c20')],
    ],
  ];
  for (const [x0, y0, x1, y1, c] of routes[v % routes.length]!) {
    p.capsule(x0, y0 + 1, x1, y1 + 1, 3, withAlpha(hex('#000000'), 80)); // sombra
    p.capsule(x0, y0, x1, y1, 2.6, c, shade(c, 0.55));
    p.line(x0, y0 - 1, x1, y1 - 1, withAlpha(light(c, 0.4), 150));
  }
  if (v === 2) {
    // ponta solta faiscando
    p.put(18, 12, C.pureWhite);
    p.put(19, 11, withAlpha(C.warn, 220));
    p.put(17, 11, withAlpha(C.neonCyan, 200));
  }
  return p;
}

/** Poça de chopindita: âmbar com brilho que pulsa e espuma girando. */
function puddle(f: number): Pix {
  const p = concreteFloor(0);
  const pulse = [0, 1, 2, 1][f]!;
  // halo de luz no concreto
  p.ellipse(16, 17, 15, 11, withAlpha(CHOPE[3]!, 34 + pulse * 10));
  p.ellipse(16, 17, 11, 8, withAlpha(CHOPE[1]!, 255));
  for (let y = 9; y < 26; y++)
    for (let x = 4; x < 28; x++) {
      const dx = (x + 0.5 - 16) / 11;
      const dy = (y + 0.5 - 17) / 8;
      const d = dx * dx + dy * dy;
      if (d >= 1) continue;
      const v = 0.75 - d * 0.55 + (nz(x * 4 + f * 3, y * 4, 1) - 0.5) * 0.3 + pulse * 0.04;
      p.set(x, y, CHOPE[rampIndex(v, CHOPE.length, x, y, 0.7)]!);
    }
  p.ring(16, 17, 11, 8, 1, CHOPE[0]!);
  // espuma e reflexo
  const a = (f * Math.PI) / 2;
  for (let k = 0; k < 3; k++) {
    const x = Math.round(16 + Math.cos(a + k * 2.1) * 6);
    const y = Math.round(16 + Math.sin(a + k * 2.1) * 3.5);
    p.set(x, y, CHOPE[5]!);
    p.put(x + 1, y, withAlpha(CHOPE[5]!, 150));
  }
  p.hline(10, 14, 12, withAlpha(C.pureWhite, 150));
  return p;
}

/** Água da galeria alagada: ondinhas que andam; a funda é mais escura e sem fundo visível. */
function water(f: number, deep: boolean): Pix {
  const p = new Pix(32, 32);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const v = (deep ? 0.18 : 0.38) + nz(x + f * 2, y + f, 2) * 0.28 + Math.sin((x + y * 0.5 + f * 4) / 4) * 0.04;
      p.set(x, y, AGUA[rampIndex(v, AGUA.length, x, y, 0.8)]!);
    }
  if (!deep) {
    // concreto aparecendo pelo fundo raso
    for (let y = 0; y < 32; y += 8) p.hline(0, 31, (y + 3) % 32, withAlpha(CONCRETO[3]!, 50));
  }
  for (let k = 0; k < 4; k++) {
    const x = (k * 9 + f * 3) % 30;
    const y = (k * 7 + 4) % 30;
    p.hline(x, x + 3, y, withAlpha(AGUA[5]!, deep ? 110 : 170));
  }
  return p;
}

/** Grade de ferro: barras verticais com corrimão e sombra no chão. */
function grate(v: number): Pix {
  const p = concreteFloor(v + 1);
  p.box(0, 27, 31, 29, withAlpha(hex('#000000'), 70));
  const bar = v === 1 ? mix(METAL[2]!, FERRUGEM, 0.45) : METAL[2]!;
  for (let x = 2; x < 32; x += 5) {
    const bend = v === 1 && x === 17 ? 2 : 0;
    p.capsule(x, 4, x + bend, 27, 2, bar, shade(bar, 0.6));
    p.vline(x - 1, 5, 26, withAlpha(light(bar, 0.35), 160));
  }
  p.box(0, 3, 31, 5, METAL[3]!);
  p.hline(0, 31, 3, METAL[5]!);
  p.hline(0, 31, 6, METAL[0]!);
  p.box(0, 18, 31, 19, METAL[2]!);
  if (v === 1) {
    // plaquinha "PROIBIDO" torta
    p.box(9, 9, 15, 13, hex('#e8e0d0'));
    p.hline(10, 14, 11, hex('#c83a2e'));
  }
  return p;
}

function drainGrate(): Pix {
  const p = concreteFloor(2);
  p.box(5, 5, 26, 26, METAL[1]!);
  for (let y = 7; y < 25; y += 3) p.hline(7, 24, y, METAL[0]!);
  for (let y = 8; y < 25; y += 3) p.hline(7, 24, y, METAL[3]!);
  p.frame(5, 5, 26, 26, METAL[4]!);
  p.hline(5, 26, 26, METAL[0]!);
  // brilho de chopindita lá embaixo
  for (let y = 9; y < 25; y += 6) p.put(12 + (y % 5), y, withAlpha(CHOPE[3]!, 170));
  return p;
}

function walkway(): Pix {
  const p = new Pix(32, 32);
  p.rect(0, 0, 32, 32, METAL[2]!);
  // chapa xadrez antiderrapante
  for (let y = 2; y < 32; y += 4) for (let x = (y >> 2) % 2 ? 1 : 3; x < 32; x += 4) {
    p.set(x, y, METAL[4]!);
    p.set(x + 1, y + 1, METAL[0]!);
  }
  p.hline(0, 31, 0, METAL[5]!);
  p.hline(0, 31, 31, METAL[0]!);
  for (const x of [3, 28]) for (const y of [3, 28]) p.set(x, y, METAL[1]!);
  return p;
}

/** Carcaça de turbina quebrada (1 tile): rotor torto, pás quebradas e fita de interditado. */
function machine(v: number): Pix {
  const p = concreteFloor(v);
  p.ellipse(16, 27, 14, 4, withAlpha(hex('#000000'), 90));
  p.box(3, 8, 28, 27, METAL[1]!);
  p.ellipse(16, 8, 12.5, 4, METAL[3]!);
  p.ring(16, 8, 12.5, 4, 1, METAL[4]!);
  for (let x = 3; x <= 28; x++) p.set(x, 27, METAL[0]!);
  for (let x = 3; x <= 28; x++) if ((x + v) % 6 < 3) p.set(x, 21, HAZ);
  p.hline(3, 28, 22, HAZ_DK);
  // rotor exposto com pás quebradas
  p.disk(16, 15, 6, METAL[0]!);
  for (let k = 0; k < 4; k++) {
    const a = k * 1.57 + v * 0.5;
    const len = k === v ? 2 : 5;
    p.line(16, 15, 16 + Math.cos(a) * len, 15 + Math.sin(a) * len, METAL[4]!);
  }
  p.disk(16, 15, 1.5, FERRUGEM);
  // escorrido de ferrugem
  for (let y = 9; y < 20; y++) p.put(6 + v * 7, y, withAlpha(FERRUGEM, 140 - y * 5));
  if (v === 2) {
    p.put(24, 4, withAlpha(hex('#9a9a9a'), 120));
    p.put(25, 2, withAlpha(hex('#b0b0b0'), 90));
  }
  return p;
}

/** Turbina grande quebrada (2x2): uma pá ainda gira aos trancos e solta faísca. */
function bigTurbine(f: number): Pix {
  const p = new Pix(64, 64);
  p.ellipse(32, 56, 28, 6, withAlpha(hex('#000000'), 100));
  // base
  p.box(10, 44, 53, 56, METAL[1]!);
  p.hline(10, 53, 44, METAL[4]!);
  for (let x = 10; x <= 53; x++) if (x % 8 < 4) p.set(x, 52, HAZ);
  p.hline(10, 53, 53, HAZ_DK);
  // carcaça redonda
  for (let y = 4; y < 50; y++)
    for (let x = 6; x < 58; x++) {
      const dx = (x + 0.5 - 32) / 25;
      const dy = (y + 0.5 - 27) / 22;
      const d = dx * dx + dy * dy;
      if (d >= 1 || d < 0.62) continue;
      const l = -0.5 * dx - 0.7 * dy;
      p.set(x, y, METAL[rampIndex(0.45 + l * 0.4, METAL.length, x, y, 0.8)]!);
    }
  p.ellipse(32, 27, 19.5, 17, hex('#121418'));
  // pás: três tortas paradas e uma que dá trancos
  const a0 = [0, 0.35, 0.35, 0.9][f]!;
  for (let k = 0; k < 5; k++) {
    if (k === 3) continue; // pá que caiu
    const a = (k * Math.PI * 2) / 5 + (k === 0 ? a0 : 0.12 * k);
    const len = k === 1 ? 10 : 16;
    p.capsule(32, 27, 32 + Math.cos(a) * len, 27 + Math.sin(a) * len, 4, k === 0 ? METAL[4]! : mix(METAL[3]!, FERRUGEM, 0.3), METAL[1]!);
  }
  p.disk(32, 27, 4.5, METAL[2]!);
  p.disk(31, 26, 1.6, METAL[5]!);
  // pá caída no chão
  p.capsule(40, 54, 54, 50, 4, mix(METAL[3]!, FERRUGEM, 0.5), METAL[0]!);
  // plaquinhas de patrimônio das duas margens
  p.box(13, 46, 18, 49, hex('#5b8e3a'));
  p.box(45, 46, 50, 49, C.neonCyan);
  // faísca quando a pá dá o tranco
  if (f === 1 || f === 3) {
    p.put(47, 18, C.pureWhite);
    p.put(48, 17, withAlpha(C.warn, 230));
    p.put(46, 16, withAlpha(C.neonCyan, 200));
    p.put(49, 19, withAlpha(C.warn, 180));
  }
  p.outlineSelective(200);
  return p;
}

/** Escada para o andar de baixo: degraus que escurecem, faixa de perigo e seta pulsando. */
function stairs(f: number): Pix {
  const p = new Pix(32, 32);
  for (let k = 0; k < 6; k++) {
    const y = 4 + k * 4;
    const c = mix(CONCRETO[4]!, hex('#08070a'), k / 6);
    p.box(4, y, 27, y + 3, c);
    p.hline(4, 27, y, light(c, 0.2));
  }
  p.box(4, 28, 27, 31, hex('#08070a'));
  // faixa amarela e preta em volta
  for (let x = 0; x < 32; x++)
    for (const y of [0, 1, 2]) p.set(x, y, ((x + y) >> 1) % 2 ? HAZ : HAZ_DK);
  for (let y = 0; y < 32; y++)
    for (const x of [0, 1, 2, 29, 30, 31]) p.set(x, y, ((x + y) >> 1) % 2 ? HAZ : HAZ_DK);
  // seta para baixo (pulsa)
  const glow = [0.2, 0.45, 0.7, 0.55][f]!;
  const arrow = withAlpha(light(HAZ, glow), 230);
  const ay = 9 + [0, 1, 2, 1][f]!;
  p.box(14, ay, 17, ay + 6, arrow);
  p.poly([[10, ay + 6], [22, ay + 6], [16, ay + 12]], arrow);
  return p;
}

function voidTile(): Pix {
  const p = new Pix(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, bayer(x, y) < 0.06 ? hex('#16141a') : hex('#0a090c'));
  return p;
}

// ---------------------------------------------------------------------------
// folha e tradução Tile -> quadro

/** Quantos quadros (ou variantes) cada família tem. */
export const GALERIAS_VARIANTS: Record<string, number> = {
  chao: 4,
  parede_topo: 2,
  parede_face: 3,
  rocha_topo: 2,
  rocha_face: 2,
  cabos: 3,
  grade: 2,
  maquina: 3,
  poca: 4,
  agua: 4,
  funda: 4,
  escada: 4,
  turbina_grande: 4,
};

/** Todos os quadros das Galerias (puro). */
export function galeriasFrames(): { name: string; pix: Pix }[] {
  const out: { name: string; pix: Pix }[] = [];
  const add = (name: string, n: number, f: (i: number) => Pix) => {
    for (let i = 0; i < n; i++) out.push({ name: `gal_${name}_${i}`, pix: f(i) });
  };
  add('chao', 4, concreteFloor);
  add('parede_topo', 2, (v) => wallTop(CONCRETO, v, 600));
  add('parede_face', 3, concreteFace);
  add('rocha_topo', 2, (v) => rockFace(v, false));
  add('rocha_face', 2, (v) => rockFace(v, true));
  add('cabos', 3, cables);
  add('grade', 2, grate);
  add('maquina', 3, machine);
  add('poca', 4, puddle);
  add('agua', 4, (f) => water(f, false));
  add('funda', 4, (f) => water(f, true));
  add('escada', 4, stairs);
  add('turbina_grande', 4, bigTurbine);
  out.push({ name: 'gal_grelha', pix: drainGrate() });
  out.push({ name: 'gal_passarela', pix: walkway() });
  out.push({ name: 'gal_vazio', pix: voidTile() });
  return out;
}

let cache: SheetData | undefined;
let byName: Map<string, Pix> | undefined;

/** Folha `tiles_galerias` (puro, em cache). */
export function buildGaleriasTileset(): SheetData {
  if (cache) return cache;
  const fs = galeriasFrames();
  byName = new Map(fs.map((f) => [f.name, f.pix]));
  cache = packFrames(GALERIAS_KEY, fs, 1024);
  cache.frameW = 32;
  cache.frameH = 32;
  cache.originX = 0;
  cache.originY = 0;
  return cache;
}

/** Desenho de um quadro pelo nome (puro). */
export function galeriasPix(name: string): Pix | undefined {
  buildGaleriasTileset();
  return byName!.get(name);
}

/**
 * Quadro das Galerias para um tile do andar. `below` é o tile de baixo: parede e rocha mostram a
 * face quando embaixo é chão. Água, poça e escada animam pelo tempo.
 */
export function galeriasFrame(tile: number, x: number, y: number, timeMs = 0, below?: number): string {
  const h = hashInt(x, y, 913);
  const anim = (Math.floor(timeMs / GALERIAS_ANIM_MS) + ((x * 3 + y * 5) & 3)) % GALERIAS_ANIM_FRAMES;
  const faceOf = below === undefined || !SOLID_TOP.has(below);
  switch (tile) {
    case Tile.Vazio:
      return 'gal_vazio';
    case Tile.Parede:
      return faceOf ? `gal_parede_face_${h % 3}` : `gal_parede_topo_${h % 2}`;
    case Tile.Pedra:
    case Tile.Arvore:
      return faceOf ? `gal_rocha_face_${h % 2}` : `gal_rocha_topo_${h % 2}`;
    case Tile.Grade:
    case Tile.Cerca:
      return `gal_grade_${h % 2}`;
    case Tile.Maquina:
      return `gal_maquina_${h % 3}`;
    case Tile.Porta:
      return `gal_escada_${Math.floor(timeMs / GALERIAS_ANIM_MS) % GALERIAS_ANIM_FRAMES}`;
    case Tile.AguaRasa:
      return `gal_agua_${anim}`;
    case Tile.AguaFunda:
      return `gal_funda_${anim}`;
    case Tile.Lama:
      return `gal_poca_${anim}`;
    case Tile.Mato:
      return `gal_cabos_${h % 3}`;
    case Tile.Madeira:
      return 'gal_passarela';
    case Tile.PisoNeon:
      return 'gal_grelha';
    default:
      return `gal_chao_${h % 4}`;
  }
}

/** Fonte de tiles para o bloco (a mesma forma do TerrainSource do mundo). */
export interface GaleriasSource {
  width: number;
  height: number;
  tile(x: number, y: number): number;
}

/** Bloco do andar já desenhado (estático: os animados saem no quadro 0). Fora do mapa é vazio. */
export function renderGalerias(src: GaleriasSource, tx: number, ty: number, tw: number, th: number): Pix {
  const p = new Pix(tw * 32, th * 32);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= src.width || y >= src.height ? Tile.Vazio : src.tile(x, y));
  for (let y = ty; y < ty + th; y++)
    for (let x = tx; x < tx + tw; x++) {
      const f = galeriasPix(galeriasFrame(at(x, y), x, y, 0, at(x, y + 1)));
      if (f) p.blit(f, (x - tx) * 32, (y - ty) * 32);
    }
  return p;
}
