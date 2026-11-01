/**
 * Arte da travessia de barco (pura, sem Phaser): as duas margens que passam pelos lados do barco e a
 * espuma do rio. O mapa do barco (shared/map/maps/barco_travessia.ts) só tem o convés e a água; o
 * render/boatScroll.ts desenha estas faixas rolando para baixo, e o barco parece subir o rio.
 *
 * - Margem Esquerda (Arte.md: verde, terra e madeira): mato, grama, trilha de terra, praia de areia,
 *   árvore e fogueira com fumaça (Narrativa.md: "fumaça de fogueira, tambor e uma assembleia").
 * - Margem Direita (neon sobre concreto): cais de concreto, asfalto, piso neon, prédio com janela
 *   acesa, letreiro de neon e drone (Narrativa.md: "neon, drones e propaganda").
 * - Placa de plano de saúde pintada no casco (Narrativa.md: "propaganda de plano de saúde pintada no
 *   casco do barco").
 *
 * As faixas repetem em y sem emenda (a fonte do terreno é periódica). SUGESTÃO: o desenho de cada
 * margem, a altura da faixa e a posição de cada coisa.
 */
import { Tile } from '@pqp/shared/map';
import { hex, Pix, type Color } from './pixel';
import { renderTerrain, TPX, type Style, type TerrainSource } from './terrain';

/** Largura da faixa de cada margem (tiles), a mesma de BOAT_SHORE_TILES. */
export const SHORE_COLS = 3;
/** Altura da faixa (tiles) antes de repetir. */
export const SHORE_ROWS = 12;

const G = Tile.Grama, MT = Tile.Mato, TE = Tile.Terra, AR = Tile.Areia, AF = Tile.AguaFunda;
const CO = Tile.Concreto, AS = Tile.Asfalto, NE = Tile.PisoNeon;

// prettier-ignore
const LEFT: readonly number[][] = [
  [MT, G, AR], [MT, G, AR], [G, TE, AR], [G, TE, AR],
  [MT, MT, AR], [MT, G, G], [G, G, AR], [TE, TE, AR],
  [MT, G, AR], [MT, MT, AR], [G, G, AR], [MT, G, AR],
];
// prettier-ignore
const RIGHT: readonly number[][] = [
  [CO, AS, CO], [CO, AS, NE], [CO, AS, NE], [CO, AS, CO],
  [CO, CO, CO], [CO, AS, CO], [CO, AS, NE], [CO, AS, CO],
  [CO, CO, CO], [CO, AS, NE], [CO, AS, NE], [CO, AS, CO],
];

/**
 * Fonte de terreno periódica em y de uma margem. Do lado do barco, fora da faixa, é o rio (a
 * transição da praia ou do cais para a água fica dentro da faixa); do lado de fora, repete a borda.
 */
export function shoreSource(side: 'esquerda' | 'direita'): TerrainSource {
  const rows = side === 'esquerda' ? LEFT : RIGHT;
  const cy = (y: number) => ((y % SHORE_ROWS) + SHORE_ROWS) % SHORE_ROWS;
  const own: Style = side === 'esquerda' ? 0 : 1;
  const isRiver = (x: number) => (side === 'esquerda' ? x >= SHORE_COLS : x < 0);
  const cx = (x: number) => (x < 0 ? 0 : x >= SHORE_COLS ? SHORE_COLS - 1 : x);
  return {
    width: SHORE_COLS,
    height: SHORE_ROWS,
    tile: (x, y) => (isRiver(x) ? AF : rows[cy(y)]![cx(x)]!),
    // o rio tem o estilo do mapa do barco (região rio_claro)
    style: (x) => (isRiver(x) ? 2 : own),
  };
}

const C = {
  tronco: hex('#5a3a22'),
  copa: hex('#2e5a22'),
  copaLuz: hex('#4a7a34'),
  lenha: hex('#6a4a2a'),
  lenhaEsc: hex('#3a2418'),
  fogo: hex('#ff8a20'),
  fogoLuz: hex('#ffe23a'),
  brasa: hex('#c83a1a'),
  fumaca: hex('#c8c0d0', 170),
  fumaca2: hex('#a098a8', 120),
  tambor: hex('#8a5a3a'),
  couro: hex('#e8d0a0'),
  predio: hex('#2a2a3a'),
  predioBorda: hex('#14141e'),
  janelaA: hex('#40e8ff'),
  janelaB: hex('#ffe060'),
  neonA: hex('#ff40c8'),
  neonB: hex('#40e8ff'),
  drone: hex('#1e1e28'),
  droneLuz: hex('#ff3a3a'),
  sombra: hex('#120e24', 90),
  espuma: hex('#d8f0ff', 150),
  espuma2: hex('#a8d8f0', 110),
  placa: hex('#f4f0f8'),
  cruz: hex('#ff40c8'),
} as const;

function tree(p: Pix, x: number, y: number): void {
  p.ellipse(x + 1, y + 22, 9, 3, C.sombra);
  p.rect(x - 1, y + 12, 4, 10, C.tronco);
  p.ellipse(x + 1, y + 6, 10, 9, C.copa);
  p.ellipse(x - 2, y + 3, 5, 4, C.copaLuz);
}

function campfire(p: Pix, x: number, y: number): void {
  p.ellipse(x, y + 7, 9, 3, C.sombra);
  p.line(x - 7, y + 6, x + 7, y + 2, C.lenha);
  p.line(x - 7, y + 2, x + 7, y + 6, C.lenhaEsc);
  p.ellipse(x, y, 4, 5, C.fogo);
  p.ellipse(x, y + 1, 2, 3, C.fogoLuz);
  p.set(x - 3, y + 4, C.brasa);
  p.set(x + 3, y + 3, C.brasa);
  // fumaça subindo (para cima da faixa; a rolagem faz ela "ficar para trás")
  p.ellipse(x + 1, y - 10, 3, 3, C.fumaca);
  p.ellipse(x + 3, y - 17, 4, 3, C.fumaca2);
  p.ellipse(x, y - 24, 3, 2, C.fumaca2);
}

function drum(p: Pix, x: number, y: number): void {
  p.ellipse(x, y + 6, 6, 2, C.sombra);
  p.rect(x - 4, y - 2, 9, 8, C.tambor);
  p.ellipse(x, y - 2, 4.5, 1.5, C.couro);
  p.line(x - 4, y + 1, x + 4, y + 4, C.lenhaEsc);
}

function building(p: Pix, x: number, y: number, w: number, h: number): void {
  p.rect(x + 3, y + h, w, 3, C.sombra);
  p.rect(x, y, w, h, C.predio);
  p.frame(x, y, x + w - 1, y + h - 1, C.predioBorda);
  for (let j = y + 4; j < y + h - 4; j += 6)
    for (let i = x + 3; i < x + w - 3; i += 5) p.rect(i, j, 2, 3, ((i * 7 + j * 3) & 3) === 0 ? C.janelaB : C.janelaA);
}

function neonSign(p: Pix, x: number, y: number): void {
  p.rect(x, y, 22, 11, hex('#14141e'));
  p.frame(x, y, x + 21, y + 10, C.neonA);
  p.hline(x + 4, x + 17, y + 4, C.neonB);
  p.hline(x + 4, x + 12, y + 7, C.neonB);
  // o "+" do plano de saúde
  p.rect(x + 15, y + 6, 3, 1, C.neonA);
  p.rect(x + 16, y + 5, 1, 3, C.neonA);
}

function drone(p: Pix, x: number, y: number): void {
  p.ellipse(x, y + 12, 5, 2, C.sombra);
  p.rect(x - 3, y - 1, 7, 3, C.drone);
  p.hline(x - 7, x - 4, y - 2, C.drone);
  p.hline(x + 4, x + 7, y - 2, C.drone);
  p.set(x, y + 2, C.droneLuz);
}

/** Faixa de uma margem: SHORE_COLS x SHORE_ROWS tiles, repetível em y. */
export function boatShorePix(side: 'esquerda' | 'direita'): Pix {
  const p = renderTerrain(shoreSource(side), 0, 0, SHORE_COLS, SHORE_ROWS);
  const T = TPX;
  if (side === 'esquerda') {
    tree(p, 12, 4 * T + 2);
    tree(p, 14, 9 * T + 6);
    tree(p, 10, 0 * T + 4);
    campfire(p, 1 * T + 18, 2 * T + 18);
    drum(p, 1 * T + 2, 3 * T + 10);
    campfire(p, 1 * T + 14, 7 * T + 20);
    drum(p, 1 * T + 26, 8 * T + 14);
  } else {
    building(p, 2 * T - 2, 0 * T + 6, 34, 52);
    building(p, 2 * T, 6 * T + 10, 32, 60);
    neonSign(p, 1 * T + 2, 4 * T + 8);
    neonSign(p, 1 * T + 4, 10 * T + 4);
    drone(p, 18, 2 * T + 10);
    drone(p, 26, 8 * T + 20);
  }
  return p;
}

/** Espuma do rio (transparente), repetível nos dois sentidos: o rastro que passa ao lado do casco. */
export function boatFoamPix(): Pix {
  const W = 64, H = 96;
  const p = new Pix(W, H);
  const dash = (x: number, y: number, n: number, c: Color) => p.hline(x, x + n - 1, y, c);
  const pts: [number, number, number][] = [
    [6, 4, 7], [40, 14, 5], [22, 27, 9], [52, 38, 6], [10, 49, 5], [33, 61, 8], [48, 74, 5], [16, 85, 7],
  ];
  for (const [x, y, n] of pts) {
    dash(x, y, n, C.espuma);
    dash(x + 2, y + 2, Math.max(2, n - 3), C.espuma2);
  }
  return p;
}

/** Placa do plano de saúde pintada no casco (12 x 10). */
export function hullAdPix(): Pix {
  const p = new Pix(14, 10);
  p.rect(0, 0, 14, 10, C.placa);
  p.frame(0, 0, 13, 9, C.cruz);
  p.rect(5, 2, 4, 6, C.cruz);
  p.rect(3, 4, 8, 2, C.cruz);
  return p;
}
