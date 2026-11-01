/**
 * Chão do mapa em blocos estáticos: cada bloco de CHUNK_TILES x CHUNK_TILES tiles é desenhado uma
 * vez pelo terreno puro (art/terrain.ts: textura, transições, palafita, sombras, decoração) e vira
 * uma textura de canvas com uma imagem. Só os blocos perto da câmera existem: são gerados sob
 * demanda (no máximo um por quadro depois do primeiro) e os mais antigos fora da tela são
 * descartados (LRU), para caber na memória do celular.
 *
 * Por cima do chão, uma camada de Tilemap só com o que anima: brilho da água, mato que balança e
 * piso neon. Cada (tipo, variante, fase) é uma célula da textura 'tiles_grid'; a cada TILE_ANIM_MS
 * só essas células são redesenhadas.
 *
 * Árvores (64x96, 2x3 tiles) são imagens com profundidade pelo y do tronco quando ficam perto de
 * chão andável (a copa cobre quem passa atrás); as do meio da mata vão num Blitter barato por bloco.
 * O clima (luz por região, vinheta e partículas) vem de art/ambient.ts.
 */
import * as Phaser from 'phaser';
import { isSolidTile, type MapMarker, Tile, type TileMap } from '@pqp/shared/map';
import { createAmbient, type Ambient } from '../art/ambient';
import { facadeFrame, propForDeco, propFrame, propIsFlat, propsTexture, renderGalerias, TILE_ANIM_MS, TILE_KEY, TILE_PX, uploadPix } from '../art/index';
import { isDungeonMapId } from '../game/dungeonMap';
import { MATO_FRAMES, OVERLAY_FRAMES, overlayKind, renderTerrain, styleOfRegion, type Style, type TerrainSource, TREE_BASE_Y, TREE_H } from '../art/terrain';
import { hashInt } from '../art/noise';
import { treeFrame } from '../art/tiles';
import { desenhaPlChao, PL_POR_CIMA, PL_PROP_ESCALA, plArvoreFrame, plArvores, plMatoKey, plPropKey, temPlMato, usaPlChao } from '../art/plChao';
import { DEPTH } from './depth';

export const GRID_KEY = 'tiles_grid';
const COLS = 16;
/** SUGESTÃO: blocos de 8x8 tiles (256 px); até 40 blocos na memória (~10 MB). */
export const CHUNK_TILES = 8;
const MAX_CHUNKS = 40;
// SUGESTÃO: blocos de 16x16 tiles para as árvores do meio da mata.
export const CANOPY_CHUNK = 16;

export interface TileLayerView {
  overlay?: Phaser.Tilemaps.TilemapLayer;
  canopies: Phaser.GameObjects.Image[];
  update(timeMs: number): void;
  /** liga só as copas e os blocos perto da câmera; gera os que faltam */
  cull(view: Phaser.Geom.Rectangle): void;
  destroy(): void;
}

/** Região de um tile (o primeiro retângulo que contém). */
export function regionAt(map: TileMap, x: number, y: number): string | undefined {
  for (const r of map.regions) if (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h) return r.regionId;
  return undefined;
}

/** O mapa como fonte do terreno (estilo por região, em cache por tile). */
export function mapSource(map: TileMap): TerrainSource {
  const W = map.width;
  const H = map.height;
  const styles = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) styles[y * W + x] = styleOfRegion(regionAt(map, x, y));
  const cl = (v: number, n: number) => (v < 0 ? 0 : v >= n ? n - 1 : v);
  return {
    width: W,
    height: H,
    tile: (x, y) => map.tiles[cl(y, H) * W + cl(x, W)]!,
    style: (x, y) => styles[cl(y, H) * W + cl(x, W)]! as Style,
    deco: (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : (map.deco?.[y * W + x] ?? 0)),
  };
}

/** Prop automático de uma região num tile (SUGESTÃO: ponte de metal na Usina, junco no Juncal). */
export function regionProp(map: TileMap, x: number, y: number): string | undefined {
  const t = map.tiles[y * map.width + x];
  const reg = regionAt(map, x, y);
  if (reg === 'usina_da_ponte' && t === Tile.Madeira) return 'ponte_metal';
  if (reg === 'juncal' && t === Tile.AguaRasa && (hashInt(x, y, 157) & 7) === 0) return 'junco';
  return undefined;
}

/** Id da fachada de um marcador 'lugar' (instituição ou QG), se houver. */
export function facadeIdOf(m: MapMarker): string | undefined {
  if (m.kind !== 'lugar') return undefined;
  const p = (m.params ?? {}) as Record<string, unknown>;
  if (typeof p['instituicao'] === 'string') return p['instituicao'];
  if (typeof p['qg'] === 'string') return p['qg'];
  return undefined;
}

/** Props da camada de decoração, das regiões e as fachadas das sedes, como imagens com profundidade. */
function buildProps(scene: Phaser.Scene, map: TileMap, plChao: boolean): Phaser.GameObjects.Image[] {
  const key = propsTexture(scene);
  const tex = scene.textures.get(key);
  const out: Phaser.GameObjects.Image[] = [];
  const add = (prop: string, x: number, y: number) => {
    // v0.3: enfeite do PixelLab, quando o mapa já tem o chão novo
    if (plChao && scene.textures.exists(plPropKey(prop))) {
      // os grandes (toldo, barco) ocupam mais de um tile: um a cada dois na fileira, um só na coluna
      const dv = (xx: number, yy: number) => (xx < 0 || yy < 0 ? 0 : (map.deco?.[yy * map.width + xx] ?? 0));
      const aqui = dv(x, y);
      if (aqui && (prop === 'toldo' || prop === 'barco')) {
        if (dv(x, y - 1) === aqui) return;
        let n = 0;
        for (let xx = x - 1; dv(xx, y) === aqui; xx--) n++;
        if (n % 2 === 1) return;
      }
      const flat = propIsFlat(prop);
      const fh = scene.textures.get(plPropKey(prop)).getSourceImage().height * PL_PROP_ESCALA;
      const bx = x * TILE_PX + 16;
      const by = flat ? y * TILE_PX + 16 + Math.ceil(fh / 2) : y * TILE_PX + 30;
      const img = scene.add.image(bx, by, plPropKey(prop)).setOrigin(0.5, 1).setScale(PL_PROP_ESCALA);
      img.setDepth(flat ? DEPTH.deco : DEPTH.entity + by);
      out.push(img);
      return;
    }
    const frame = propFrame(prop, x, y);
    if (!tex.has(frame)) return;
    const fh = tex.get(frame).height;
    const flat = propIsFlat(prop);
    const bx = x * TILE_PX + 16;
    // raso: centrado no tile; alto: a base perto da borda de baixo do tile
    const by = flat ? y * TILE_PX + 16 + Math.ceil(fh / 2) : y * TILE_PX + 30;
    const img = scene.add.image(bx, by, key, frame).setOrigin(0.5, 1);
    img.setDepth(flat ? DEPTH.deco : DEPTH.entity + by);
    out.push(img);
  };
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      // v0.3: tufos de mato do PixelLab, com profundidade (quem passa atrás fica escondido)
      const mato = plChao && map.tiles[y * map.width + x] === Tile.Mato ? plMatoKey(scene, x, y) : undefined;
      if (mato) {
        const by = y * TILE_PX + 28 + (hashInt(x, y, 97) & 3);
        const img = scene.add.image(x * TILE_PX + 16 + ((hashInt(x, y, 91) & 7) - 3), by, mato).setOrigin(0.5, 1).setScale(PL_PROP_ESCALA);
        img.setFlipX((hashInt(x, y, 89) & 1) === 1).setDepth(DEPTH.entity + by);
        out.push(img);
      }
      const dv = map.deco?.[y * map.width + x] ?? 0;
      const prop = (dv > 0 ? propForDeco(dv) : undefined) ?? regionProp(map, x, y);
      if (prop) add(prop, x, y);
    }
  for (const m of map.markers) {
    const id = facadeIdOf(m);
    if (!id || !tex.has(facadeFrame(id))) continue;
    const bx = Math.round(m.x * TILE_PX);
    const by = Math.round(m.y * TILE_PX) + 12;
    out.push(scene.add.image(bx, by, key, facadeFrame(id)).setOrigin(0.5, 1).setDepth(DEPTH.entity + by));
  }
  return out;
}

let layerSeq = 0;

interface Chunk {
  key: string;
  img: Phaser.GameObjects.Image;
  used: number;
}

export function buildTileLayer(scene: Phaser.Scene, map: TileMap): TileLayerView {
  const seq = ++layerSeq;
  const src = mapSource(map);
  const dungeon = isDungeonMapId(map.id);
  const W = map.width;
  const H = map.height;
  const tex = scene.textures.get(TILE_KEY);
  const srcImg = tex.getSourceImage() as HTMLCanvasElement | HTMLImageElement;
  // v0.3: chão do PixelLab (a água já vem desenhada, sem o brilho procedural por cima)
  const plChao = !dungeon && usaPlChao(scene, map);
  const plMato = plChao && temPlMato(scene);

  // ---------------- camada animada
  interface Cell {
    frames: string[];
    phase: number;
  }
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
  const ovData: number[][] = [];
  let anyOverlay = false;
  for (let y = 0; y < H; y++) {
    const row: number[] = [];
    for (let x = 0; x < W; x++) {
      const t = map.tiles[y * W + x]!;
      const kind = overlayKind(t);
      if (!kind || (plChao && (kind === 'rasa' || kind === 'funda' || (kind === 'mato' && plMato)))) {
        row.push(-1);
        continue;
      }
      const phase = (x * 3 + y * 5) & 3;
      const v = hashInt(x, y, 81) & 3;
      let key: string;
      let frames: string[];
      if (kind === 'rasa' || kind === 'funda') {
        key = `${kind}_${v}_${phase}`;
        frames = Array.from({ length: OVERLAY_FRAMES }, (_, f) => `ov_${kind}_${v}_${f}`);
      } else if (kind === 'mato') {
        const st = src.style(x, y);
        const mv = v % 3;
        key = `mato_${st}_${mv}_${phase}`;
        frames = Array.from({ length: MATO_FRAMES }, (_, f) => `ov_mato_${st}_${mv}_${f}`);
      } else {
        key = `neon_${phase}`;
        frames = [0, 1, 2, 3].map((f) => `ov_neon_${f}`);
      }
      row.push(cellFor(key, { frames, phase }));
      anyOverlay = true;
    }
    ovData.push(row);
  }
  let overlay: Phaser.Tilemaps.TilemapLayer | undefined;
  let tm: Phaser.Tilemaps.Tilemap | undefined;
  let grid: Phaser.Textures.CanvasTexture | undefined;
  let ctx: CanvasRenderingContext2D | undefined;
  const drawCell = (i: number, frameName: string) => {
    if (!ctx || !tex.has(frameName)) return;
    const fr = tex.get(frameName);
    const dx = (i % COLS) * TILE_PX;
    const dy = Math.floor(i / COLS) * TILE_PX;
    ctx.clearRect(dx, dy, TILE_PX, TILE_PX);
    ctx.drawImage(srcImg, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, dx, dy, TILE_PX, TILE_PX);
  };
  if (anyOverlay) {
    if (scene.textures.exists(GRID_KEY)) scene.textures.remove(GRID_KEY);
    const rows = Math.max(1, Math.ceil(cells.length / COLS));
    grid = scene.textures.createCanvas(GRID_KEY, COLS * TILE_PX, rows * TILE_PX)!;
    ctx = grid.getContext();
    ctx.imageSmoothingEnabled = false;
    cells.forEach((c, i) => drawCell(i, c.frames[c.phase % c.frames.length]!));
    grid.refresh();
    grid.setFilter(Phaser.Textures.FilterMode.NEAREST);
    tm = scene.make.tilemap({ data: ovData, tileWidth: TILE_PX, tileHeight: TILE_PX });
    const ts = tm.addTilesetImage(GRID_KEY, GRID_KEY, TILE_PX, TILE_PX, 0, 0)!;
    overlay = tm.createLayer(0, ts, 0, 0)!;
    overlay.setDepth(DEPTH.deco);
  }

  // ---------------- blocos do chão
  const CPX = CHUNK_TILES * TILE_PX;
  const chunkCols = Math.ceil(W / CHUNK_TILES);
  const chunkRows = Math.ceil(H / CHUNK_TILES);
  const chunks = new Map<number, Chunk>();
  let frameNo = 0;
  let firstCull = true;
  const makeChunk = (cx: number, cy: number): Chunk => {
    const tx0 = cx * CHUNK_TILES;
    const ty0 = cy * CHUNK_TILES;
    const tw = Math.min(CHUNK_TILES, W - tx0);
    const th = Math.min(CHUNK_TILES, H - ty0);
    // Fase 5: andar das Galerias com o tileset próprio (parede com face, poça de chopindita)
    const pix = dungeon ? renderGalerias(src, tx0, ty0, tw, th) : renderTerrain(src, tx0, ty0, tw, th);
    const key = `terreno_${seq}_${cx}_${cy}`;
    uploadPix(scene, key, pix);
    if (plChao) {
      const ct = scene.textures.get(key) as Phaser.Textures.CanvasTexture;
      // objetos (pedra, cerca, porta): o mesmo bloco sem eles, para recortar só o desenho do objeto
      const temObjeto = (() => {
        for (let y = ty0; y < ty0 + th; y++) for (let x = tx0; x < tx0 + tw; x++) if (PL_POR_CIMA.has(map.tiles[y * W + x]!)) return true;
        return false;
      })();
      // no lugar do objeto, o chão do vizinho de baixo (ou de cima), para o resto da célula não mudar
      const chaoSob = (x: number, y: number): number => {
        for (const dy of [1, -1]) {
          const t = src.tile(x, y + dy);
          if (!PL_POR_CIMA.has(t)) return t;
        }
        return Tile.Grama;
      };
      const semObjeto = temObjeto ? renderTerrain({ ...src, tile: (x, y) => (PL_POR_CIMA.has(src.tile(x, y)) ? chaoSob(x, y) : src.tile(x, y)) }, tx0, ty0, tw, th) : undefined;
      desenhaPlChao(scene, ct.getContext(), map, tx0, ty0, tw, th, semObjeto?.data);
      ct.refresh();
    }
    const img = scene.add.image(tx0 * TILE_PX, ty0 * TILE_PX, key).setOrigin(0, 0).setDepth(DEPTH.floor);
    return { key, img, used: frameNo };
  };
  const dropChunk = (k: number) => {
    const c = chunks.get(k);
    if (!c) return;
    c.img.destroy();
    if (scene.textures.exists(c.key)) scene.textures.remove(c.key);
    chunks.delete(k);
  };

  // ---------------- árvores
  const canopies: Phaser.GameObjects.Image[] = [];
  // v0.3: nos mapas com chão do PixelLab, as árvores também são do PixelLab
  const plArv = plChao ? plArvores(scene) : undefined;
  const arvKey = plArv ?? TILE_KEY;
  const blitters = new Map<number, { b: Phaser.GameObjects.Blitter; cx: number; cy: number }>();
  const bCols = Math.ceil(W / CANOPY_CHUNK);
  const blitterAt = (x: number, y: number) => {
    const cx = Math.floor(x / CANOPY_CHUNK);
    const cy = Math.floor(y / CANOPY_CHUNK);
    const k = cy * bCols + cx;
    let c = blitters.get(k);
    if (!c) {
      c = { b: scene.add.blitter(0, 0, arvKey).setDepth(DEPTH.canopyFar), cx, cy };
      blitters.set(k, c);
    }
    return c.b;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (map.tiles[y * W + x] !== Tile.Arvore) continue;
      const frame = plArv ? plArvoreFrame(x, y) : treeFrame(src.style(x, y), x, y);
      if (!scene.textures.get(arvKey).has(frame)) continue;
      const flip = (hashInt(x, y, 83) & 1) === 1;
      // base do tronco no meio do tile, perto da borda de baixo
      const bx = x * TILE_PX + 16;
      const by = y * TILE_PX + 28;
      let open = false;
      for (let dy = -3; dy <= 1 && !open; dy++) for (let dx = -1; dx <= 1 && !open; dx++) if (!isSolidTile(map, x + dx, y + dy)) open = true;
      if (open) {
        const img = scene.add.image(bx, by + (TREE_H - TREE_BASE_Y), arvKey, frame).setOrigin(0.5, 1).setFlipX(flip);
        img.setDepth(DEPTH.entity + by);
        canopies.push(img);
      } else {
        const bob = blitterAt(x, y).create(bx - 32, by - TREE_BASE_Y, frame);
        bob.setFlipX(flip);
      }
    }
  const bPx = CANOPY_CHUNK * TILE_PX;

  // ---------------- props das margens e fachadas (Fase 3, art/landmarks.ts)
  const props = buildProps(scene, map, plChao);

  // ---------------- clima
  const ambient: Ambient = createAmbient(scene, src);

  let lastStep = -1;
  let lastTime = 0;
  return {
    ...(overlay ? { overlay } : {}),
    canopies,
    update(timeMs: number) {
      lastTime = timeMs;
      if (!grid) return;
      const k = Math.floor(timeMs / TILE_ANIM_MS);
      if (k === lastStep) return;
      lastStep = k;
      cells.forEach((c, i) => drawCell(i, c.frames[(k + c.phase) % c.frames.length]!));
      grid.refresh();
    },
    cull(view: Phaser.Geom.Rectangle) {
      frameNo++;
      const x0 = view.x - 64;
      const y0 = view.y - 64;
      const x1 = view.right + 64;
      const y1 = view.bottom + 64;
      // blocos: os da tela já; a margem de um bloco, um por quadro
      const cx0 = Math.max(0, Math.floor(x0 / CPX));
      const cy0 = Math.max(0, Math.floor(y0 / CPX));
      const cx1 = Math.min(chunkCols - 1, Math.floor(x1 / CPX));
      const cy1 = Math.min(chunkRows - 1, Math.floor(y1 / CPX));
      let budget = firstCull ? Infinity : 1;
      firstCull = false;
      for (let cy = cy0; cy <= cy1; cy++)
        for (let cx = cx0; cx <= cx1; cx++) {
          const k = cy * chunkCols + cx;
          let c = chunks.get(k);
          if (!c) {
            c = makeChunk(cx, cy);
            chunks.set(k, c);
            budget--;
          }
          c.used = frameNo;
        }
      if (budget > 0)
        outer: for (let cy = Math.max(0, cy0 - 1); cy <= Math.min(chunkRows - 1, cy1 + 1); cy++)
          for (let cx = Math.max(0, cx0 - 1); cx <= Math.min(chunkCols - 1, cx1 + 1); cx++) {
            const k = cy * chunkCols + cx;
            if (chunks.has(k)) continue;
            const c = makeChunk(cx, cy);
            c.used = frameNo - 1;
            c.img.setVisible(false);
            chunks.set(k, c);
            if (--budget <= 0) break outer;
          }
      for (const c of chunks.values()) {
        const vis = c.used === frameNo;
        if (c.img.visible !== vis) c.img.setVisible(vis);
      }
      if (chunks.size > MAX_CHUNKS) {
        const old = [...chunks.entries()].filter(([, c]) => c.used !== frameNo).sort((a, b) => a[1].used - b[1].used);
        for (const [k] of old.slice(0, chunks.size - MAX_CHUNKS)) dropChunk(k);
      }
      for (const c of canopies) {
        const vis = c.x + 32 > x0 && c.x - 32 < x1 && c.y > y0 && c.y - TREE_H < y1;
        if (c.visible !== vis) c.setVisible(vis);
      }
      for (const c of props) {
        const vis = c.x + 32 > x0 && c.x - 32 < x1 && c.y > y0 && c.y - 64 < y1;
        if (c.visible !== vis) c.setVisible(vis);
      }
      for (const c of blitters.values()) {
        const bx = c.cx * bPx - 32;
        const by = c.cy * bPx - TREE_BASE_Y;
        const vis = bx < x1 && bx + bPx + 64 > x0 && by < y1 && by + bPx + TREE_H > y0;
        if (c.b.visible !== vis) c.b.setVisible(vis);
      }
      ambient.update(lastTime, view);
    },
    destroy() {
      overlay?.destroy();
      tm?.destroy();
      for (const k of [...chunks.keys()]) dropChunk(k);
      for (const c of canopies) c.destroy();
      for (const c of props) c.destroy();
      for (const c of blitters.values()) c.b.destroy();
      ambient.destroy();
    },
  };
}
