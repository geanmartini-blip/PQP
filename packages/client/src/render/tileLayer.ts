/**
 * Chão do mapa como Tilemap estático do Phaser (só desenha os tiles na tela).
 *
 * O tileset da arte é uma folha com quadros nomeados; aqui ela vira uma grade de 32x32 (textura
 * 'tiles_grid') com uma célula por (tile, variante) que o mapa usa. Água e piso neon são animados
 * sem mexer no mapa: cada (tile, fase) tem uma célula, e a cada TILE_ANIM_MS só essas células são
 * redesenhadas (tileFrame usa fase = (3x + 5y) & 3).
 *
 * As copas das árvores (48x40, por cima de quem passa) são imagens com profundidade pelo y quando
 * ficam perto de chão andável; as do meio da mata vão num Blitter barato, abaixo dos bonecos.
 */
import * as Phaser from 'phaser';
import { isSolidTile, Tile, type TileMap } from '@pqp/shared/map';
import { ANIMATED_TILES, TILE_ANIM_MS, TILE_KEY, TILE_PX, TILE_VARIANTS, tileFrame } from '../art/index';
import { DEPTH } from './depth';

export const GRID_KEY = 'tiles_grid';
const COLS = 16;
// SUGESTÃO: blocos de 16x16 tiles para as copas do meio da mata.
export const CANOPY_CHUNK = 16;

export interface TileLayerView {
  floor: Phaser.Tilemaps.TilemapLayer;
  deco?: Phaser.Tilemaps.TilemapLayer;
  canopies: Phaser.GameObjects.Image[];
  update(timeMs: number): void;
  /** liga só as copas perto da câmera */
  cull(view: Phaser.Geom.Rectangle): void;
  destroy(): void;
}

/** Região de um tile (o primeiro retângulo que contém). */
export function regionAt(map: TileMap, x: number, y: number): string | undefined {
  for (const r of map.regions) if (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h) return r.regionId;
  return undefined;
}

interface Cell {
  /** quadro fixo, ou tile animado com fase */
  frame?: string;
  anim?: { tile: number; phase: number };
}

export function buildTileLayer(scene: Phaser.Scene, map: TileMap): TileLayerView {
  const src = scene.textures.get(TILE_KEY);
  const srcImg = src.getSourceImage() as HTMLCanvasElement | HTMLImageElement;
  const cells: Cell[] = [];
  const index = new Map<string, number>();
  const cellFor = (key: string, c: Cell) => {
    let i = index.get(key);
    if (i === undefined) {
      i = cells.length;
      cells.push(c);
      index.set(key, i);
    }
    return i;
  };
  const W = map.width, H = map.height;
  const floorData: number[][] = [];
  const decoData: number[][] = [];
  let hasDeco = false;
  for (let y = 0; y < H; y++) {
    const row: number[] = [];
    const drow: number[] = [];
    for (let x = 0; x < W; x++) {
      const t = map.tiles[y * W + x]!;
      if (ANIMATED_TILES.has(t)) {
        const phase = (x * 3 + y * 5) & 3;
        row.push(cellFor(`a${t}_${phase}`, { anim: { tile: t, phase } }));
      } else {
        const f = tileFrame(t, x, y, regionAt(map, x, y));
        row.push(cellFor(f, { frame: src.has(f) ? f : `${t}_0` }));
      }
      const d = map.deco?.[y * W + x] ?? 0;
      if (d > 0 && src.has(`deco_${d}`)) {
        drow.push(cellFor(`deco_${d}`, { frame: `deco_${d}` }));
        hasDeco = true;
      } else drow.push(-1);
    }
    floorData.push(row);
    decoData.push(drow);
  }

  // grade de células
  if (scene.textures.exists(GRID_KEY)) scene.textures.remove(GRID_KEY);
  const rows = Math.max(1, Math.ceil(cells.length / COLS));
  const grid = scene.textures.createCanvas(GRID_KEY, COLS * TILE_PX, rows * TILE_PX)!;
  const ctx = grid.getContext();
  ctx.imageSmoothingEnabled = false;
  const drawCell = (i: number, frameName: string) => {
    const fr = src.get(frameName);
    const dx = (i % COLS) * TILE_PX, dy = Math.floor(i / COLS) * TILE_PX;
    ctx.clearRect(dx, dy, TILE_PX, TILE_PX);
    ctx.drawImage(srcImg, fr.cutX, fr.cutY, Math.min(TILE_PX, fr.cutWidth), Math.min(TILE_PX, fr.cutHeight), dx, dy, TILE_PX, TILE_PX);
  };
  const animCells: { i: number; tile: number; phase: number }[] = [];
  cells.forEach((c, i) => {
    if (c.frame) drawCell(i, c.frame);
    else if (c.anim) {
      animCells.push({ i, ...c.anim });
      drawCell(i, `${c.anim.tile}_${c.anim.phase % (TILE_VARIANTS[c.anim.tile] ?? 1)}`);
    }
  });
  grid.refresh();
  grid.setFilter(Phaser.Textures.FilterMode.NEAREST);

  const tm = scene.make.tilemap({ data: floorData, tileWidth: TILE_PX, tileHeight: TILE_PX });
  const ts = tm.addTilesetImage(GRID_KEY, GRID_KEY, TILE_PX, TILE_PX, 0, 0)!;
  const floor = tm.createLayer(0, ts, 0, 0)!;
  floor.setDepth(DEPTH.floor);
  let deco: Phaser.Tilemaps.TilemapLayer | undefined;
  let tmDeco: Phaser.Tilemaps.Tilemap | undefined;
  if (hasDeco) {
    tmDeco = scene.make.tilemap({ data: decoData, tileWidth: TILE_PX, tileHeight: TILE_PX });
    const tsd = tmDeco.addTilesetImage(GRID_KEY, GRID_KEY, TILE_PX, TILE_PX, 0, 0)!;
    deco = tmDeco.createLayer(0, tsd, 0, 0)!;
    deco.setDepth(DEPTH.deco);
  }

  // copas: perto do chão andável viram imagens com profundidade; as do meio da mata, Blitter em
  // blocos de CANOPY_CHUNK×CANOPY_CHUNK tiles (o Blitter não recorta pela câmera: só os blocos perto
  // da tela ficam ligados)
  const canopies: Phaser.GameObjects.Image[] = [];
  const chunks = new Map<number, { b: Phaser.GameObjects.Blitter; cx: number; cy: number }>();
  const chunkCols = Math.ceil(W / CANOPY_CHUNK);
  const blitterAt = (x: number, y: number) => {
    const cx = Math.floor(x / CANOPY_CHUNK), cy = Math.floor(y / CANOPY_CHUNK);
    const k = cy * chunkCols + cx;
    let c = chunks.get(k);
    if (!c) {
      c = { b: scene.add.blitter(0, 0, TILE_KEY).setDepth(DEPTH.canopyFar), cx, cy };
      chunks.set(k, c);
    }
    return c.b;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (map.tiles[y * W + x] !== Tile.Arvore) continue;
      const v = tileFrame(Tile.Arvore, x, y, regionAt(map, x, y)).split('_')[1] ?? '0';
      const frame = `copa_${Tile.Arvore}_${v}`;
      if (!src.has(frame)) continue;
      // copa centrada no tronco, subindo meio tile
      const px = x * TILE_PX - 8, py = y * TILE_PX - 18;
      let open = false;
      for (let dy = -1; dy <= 2 && !open; dy++) for (let dx = -1; dx <= 1 && !open; dx++) if (!isSolidTile(map, x + dx, y + dy)) open = true;
      if (open) {
        const img = scene.add.image(px, py, TILE_KEY, frame).setOrigin(0, 0);
        img.setDepth(DEPTH.entity + (y + 1) * TILE_PX);
        canopies.push(img);
      } else blitterAt(x, y).create(px, py, frame);
    }
  }
  const chunkPx = CANOPY_CHUNK * TILE_PX;

  let lastStep = -1;
  return {
    floor,
    ...(deco ? { deco } : {}),
    canopies,
    update(timeMs: number) {
      if (animCells.length === 0) return;
      const k = Math.floor(timeMs / TILE_ANIM_MS);
      if (k === lastStep) return;
      lastStep = k;
      for (const c of animCells) {
        const n = TILE_VARIANTS[c.tile] ?? 1;
        drawCell(c.i, `${c.tile}_${(k + c.phase) % n}`);
      }
      grid.refresh();
    },
    cull(view: Phaser.Geom.Rectangle) {
      const x0 = view.x - 64, y0 = view.y - 64, x1 = view.right + 64, y1 = view.bottom + 64;
      for (const c of canopies) {
        const vis = c.x < x1 && c.x + 48 > x0 && c.y < y1 && c.y + 40 > y0;
        if (c.visible !== vis) c.setVisible(vis);
      }
      // bloco de copas: a área dele (mais a copa que passa da borda) cruza a tela?
      for (const c of chunks.values()) {
        const bx = c.cx * chunkPx - 8, by = c.cy * chunkPx - 18;
        const vis = bx < x1 && bx + chunkPx + 48 > x0 && by < y1 && by + chunkPx + 40 > y0;
        if (c.b.visible !== vis) c.b.setVisible(vis);
      }
    },
    destroy() {
      floor.destroy();
      deco?.destroy();
      tm.destroy();
      tmDeco?.destroy();
      for (const c of canopies) c.destroy();
      for (const c of chunks.values()) c.b.destroy();
    },
  };
}
