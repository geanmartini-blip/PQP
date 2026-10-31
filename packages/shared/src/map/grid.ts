/**
 * Consulta de tiles e linha de visão. Usado pela simulação, pelo caminho (A*) e pelo cliente.
 * Coordenadas em tiles (float). O tile (tx, ty) cobre [tx, tx+1) x [ty, ty+1).
 */
import { TILE_INFO, Tile, type TileInfo, type TileMap } from './types';

const OUT: TileInfo = TILE_INFO[Tile.Vazio]!;

export const inBounds = (m: TileMap, tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < m.width && ty < m.height;

/** Tile na célula (tx, ty). Fora do mapa = Vazio (sólido). */
export function tileAt(m: TileMap, tx: number, ty: number): Tile {
  if (!inBounds(m, tx, ty)) return Tile.Vazio;
  return m.tiles[ty * m.width + tx] as Tile;
}

export function infoAt(m: TileMap, tx: number, ty: number): TileInfo {
  if (!inBounds(m, tx, ty)) return OUT;
  return TILE_INFO[m.tiles[ty * m.width + tx]!] ?? OUT;
}

export const isSolidTile = (m: TileMap, tx: number, ty: number) => infoAt(m, tx, ty).solid;
export const isOpaqueTile = (m: TileMap, tx: number, ty: number) => infoAt(m, tx, ty).opaque;

/** Multiplicador de velocidade no ponto (x, y) em tiles. */
export const speedAt = (m: TileMap, x: number, y: number) => infoAt(m, Math.floor(x), Math.floor(y)).speed;

/** true se um círculo (x, y, r) não encosta em nenhum tile sólido. */
export function circleFree(m: TileMap, x: number, y: number, r: number): boolean {
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
  const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!isSolidTile(m, tx, ty)) continue;
      const cx = Math.max(tx, Math.min(x, tx + 1));
      const cy = Math.max(ty, Math.min(y, ty + 1));
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy < r * r) return false;
    }
  }
  return true;
}

/**
 * Linha de visão entre dois pontos (centros, em tiles). Bloqueia em tile opaco (parede, árvore,
 * máquina). Pedra, cerca, grade e água funda não bloqueiam a visão. Percorre as células com DDA.
 * As células de origem e destino não contam (quem está encostado na parede ainda vê).
 */
export function hasLineOfSight(m: TileMap, ax: number, ay: number, bx: number, by: number): boolean {
  let tx = Math.floor(ax), ty = Math.floor(ay);
  const ex = Math.floor(bx), ey = Math.floor(by);
  const dx = bx - ax, dy = by - ay;
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? tx + 1 - ax : ax - tx) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? ty + 1 - ay : ay - ty) * tDeltaY : Infinity;
  let guard = Math.abs(ex - tx) + Math.abs(ey - ty) + 2;
  while ((tx !== ex || ty !== ey) && guard-- > 0) {
    if (tMaxX < tMaxY) {
      tMaxX += tDeltaX;
      tx += stepX;
    } else {
      tMaxY += tDeltaY;
      ty += stepY;
    }
    if (tx === ex && ty === ey) break;
    if (isOpaqueTile(m, tx, ty)) return false;
  }
  return true;
}

/** Cria um TileMap vazio preenchido com um tile (útil em testes). */
export function makeMap(id: string, width: number, height: number, fill: Tile = Tile.Grama): TileMap {
  return { id, width, height, tiles: new Uint8Array(width * height).fill(fill), regions: [], markers: [] };
}

export function setTile(m: TileMap, tx: number, ty: number, t: Tile): void {
  if (inBounds(m, tx, ty)) m.tiles[ty * m.width + tx] = t;
}
