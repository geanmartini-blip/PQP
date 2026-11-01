/**
 * Tileset de 32x32 (folha `tiles`): um ou mais quadros por valor de Tile (map/types.ts), com
 * variações, mais as árvores grandes, os quadros animados e a decoração. O chão do mundo não usa
 * mais estes quadros um a um: sai do terreno por bloco (terrain.ts, com transição entre materiais).
 * Os quadros daqui servem para a galeria, ícones e a camada animada (água, mato e neon).
 *
 * Quadros:
 * - `${tile}_${variante}`: amostra do tile (água, mato e neon com a variante = quadro da animação;
 *   paredes, portas, cercas, árvores e máquinas com a variante = estilo da região);
 * - `copa_21_${v}` e `arvore_${estilo}_${sub}`: árvore de 64x96 (2x3 tiles);
 * - `ov_rasa_${v}_${f}`, `ov_funda_${v}_${f}`, `ov_mato_${estilo}_${v}_${f}`, `ov_neon_${f}`: animação;
 * - `deco_${valor}`: decoração do mapa (TileMap.deco).
 */
import { Deco, Tile } from '@pqp/shared/map';
import { Pix } from './pixel';
import { packFrames, type SheetData } from './sheet';
import {
  glintFrame,
  MATO_FRAMES,
  matoFrame,
  neonFrame,
  OVERLAY_FRAMES,
  REGION_STYLE,
  renderTerrain,
  type Style,
  type TerrainSource,
  treeSprite,
  TREE_BASE_Y,
  TREE_H,
  TREE_W,
} from './terrain';

export const TILE_KEY = 'tiles';

/** Variações (ou quadros de animação) por tile. */
export const TILE_VARIANTS: Record<number, number> = {
  [Tile.Vazio]: 1,
  [Tile.Grama]: 4,
  [Tile.Terra]: 4,
  [Tile.Areia]: 4,
  [Tile.AguaRasa]: 4,
  [Tile.AguaFunda]: 4,
  [Tile.Madeira]: 3,
  [Tile.Concreto]: 4,
  [Tile.Asfalto]: 3,
  [Tile.PisoNeon]: 4,
  [Tile.Lama]: 3,
  [Tile.Mato]: 3,
  [Tile.Parede]: 3,
  [Tile.Arvore]: 3,
  [Tile.Pedra]: 2,
  [Tile.Cerca]: 2,
  [Tile.Grade]: 2,
  [Tile.Maquina]: 3,
  [Tile.Porta]: 3,
};

/** Tiles animados: a variante é o quadro da animação. */
export const ANIMATED_TILES: ReadonlySet<number> = new Set([Tile.AguaRasa, Tile.AguaFunda, Tile.PisoNeon]);
/** SUGESTÃO: 260 ms por quadro da água e do neon; o mato balança no mesmo passo. */
export const TILE_ANIM_MS = 260;

/** Variações de cada árvore por estilo. */
export const TREE_SUBS = 2;

const STYLED: ReadonlySet<number> = new Set([Tile.Parede, Tile.Porta, Tile.Arvore, Tile.Cerca, Tile.Maquina]);

/**
 * Nome do quadro para um tile do mapa: escolhe a variante pela posição (estável), pela região
 * (paredes, portas, cercas, árvores, máquinas) e pelo tempo (água e piso neon).
 */
export function tileFrame(tile: number, x: number, y: number, regionId?: string, timeMs = 0): string {
  const n = TILE_VARIANTS[tile] ?? 1;
  let v: number;
  if (ANIMATED_TILES.has(tile)) v = (Math.floor(timeMs / TILE_ANIM_MS) + ((x * 3 + y * 5) & 3)) % n;
  else if (STYLED.has(tile)) v = Math.min(n - 1, REGION_STYLE[regionId ?? ''] ?? ((x * 7 + y * 13) & 0x7fffffff) % n);
  else v = (((x * 73856093) ^ (y * 19349663)) >>> 0) % n;
  return `${tile}_${v}`;
}

/** Nome do quadro da árvore de um tile (estilo da região e variação pela posição). */
export function treeFrame(style: Style, x: number, y: number): string {
  return `arvore_${style}_${(((x * 92837111) ^ (y * 689287499)) >>> 0) % TREE_SUBS}`;
}

// ---------------------------------------------------------------------------

const OBJECT_TILES: ReadonlySet<number> = new Set([Tile.Parede, Tile.Arvore, Tile.Pedra, Tile.Cerca, Tile.Grade, Tile.Maquina, Tile.Porta]);

/** Amostra: o tile no centro de um mapa pequeno; objetos ficam sobre grama (ou concreto na Direita). */
function sampleSource(tile: number, style: Style): TerrainSource {
  const around = OBJECT_TILES.has(tile) ? (style === 1 ? Tile.Concreto : Tile.Grama) : tile;
  return {
    width: 64,
    height: 64,
    tile: (x, y) => (x === 0 && y === 0 ? tile : around),
    style: () => style,
  };
}

/** Desenho de um tile e variante (puro). */
export function drawTile(tile: number, v: number): Pix {
  const style: Style = STYLED.has(tile) ? (Math.min(2, v) as Style) : ((v % 3) as Style);
  const src = sampleSource(tile, style);
  // a variante desloca a amostra no mundo (outro pedaço do ruído); o tile fica em (0, 0)
  const shifted: TerrainSource = { ...src, tile: (x, y) => src.tile(x - v * 5, y - v * 3), style: src.style };
  const p = renderTerrain(shifted, v * 5, v * 3, 1, 1);
  if (tile === Tile.AguaRasa || tile === Tile.AguaFunda) p.blit(glintFrame(tile === Tile.AguaFunda, v % OVERLAY_FRAMES, 0), 0, 0);
  else if (tile === Tile.Mato) p.blit(matoFrame(0, v, 0), 0, 0);
  else if (tile === Tile.PisoNeon) p.blit(neonFrame(v % 4), 0, 0);
  else if (tile === Tile.Arvore) {
    // tronco da árvore visto no tile
    const t = treeSprite(style, 0);
    p.blit(t.crop(TREE_W / 2 - 16, TREE_BASE_Y - 26, 32, 32), 0, 0);
  }
  return p;
}

/** Desenho de uma decoração do mapa num tile de areia/grama (só a decoração por cima). */
function decoFrame(value: number): Pix {
  const ground = value === Deco.Concha ? Tile.Areia : value === Deco.Tabua ? Tile.Lama : Tile.Grama;
  const base: TerrainSource = { width: 3, height: 3, tile: () => ground, style: () => 0 };
  const withDeco: TerrainSource = { ...base, deco: (x, y) => (x === 0 && y === 0 ? value : 0) };
  const a = renderTerrain(base, 0, 0, 1, 1);
  const b = renderTerrain(withDeco, 0, 0, 1, 1);
  // só o que mudou
  const p = new Pix(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (a.get(x, y) !== b.get(x, y)) p.set(x, y, b.get(x, y));
  if (p.countOpaque() === 0) p.set(16, 16, b.get(16, 16));
  return p;
}

/** Todos os valores numéricos do enum Tile. */
export const TILE_VALUES: number[] = Object.values(Tile).filter((v): v is number => typeof v === 'number');

let tileCache: SheetData | undefined;

/** Folha do tileset inteiro (puro, em cache). */
export function buildTileset(): SheetData {
  if (tileCache) return tileCache;
  const items: { name: string; pix: Pix }[] = [];
  for (const t of TILE_VALUES) for (let v = 0; v < (TILE_VARIANTS[t] ?? 1); v++) items.push({ name: `${t}_${v}`, pix: drawTile(t, v) });
  for (let st = 0; st < 3; st++) {
    for (let sub = 0; sub < TREE_SUBS; sub++) items.push({ name: `arvore_${st}_${sub}`, pix: treeSprite(st as Style, sub) });
    items.push({ name: `copa_${Tile.Arvore}_${st}`, pix: treeSprite(st as Style, 0) });
  }
  for (let v = 0; v < 4; v++)
    for (let f = 0; f < OVERLAY_FRAMES; f++) {
      items.push({ name: `ov_rasa_${v}_${f}`, pix: glintFrame(false, f, v) });
      items.push({ name: `ov_funda_${v}_${f}`, pix: glintFrame(true, f, v) });
    }
  for (let st = 0; st < 3; st++) for (let v = 0; v < 3; v++) for (let f = 0; f < MATO_FRAMES; f++) items.push({ name: `ov_mato_${st}_${v}_${f}`, pix: matoFrame(st as Style, v, f) });
  for (let f = 0; f < 4; f++) items.push({ name: `ov_neon_${f}`, pix: neonFrame(f) });
  for (const [, value] of Object.entries(Deco)) if (value !== 0) items.push({ name: `deco_${value}`, pix: decoFrame(value) });
  tileCache = packFrames(TILE_KEY, items, 1024);
  return tileCache;
}

export { TREE_BASE_Y, TREE_H, TREE_W };
