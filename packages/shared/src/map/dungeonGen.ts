/**
 * Gerador de andar de masmorra por semente (Fase 5): salas e corredores num mapa de cerca de 40x40,
 * com os tiles do mapa normal (concreto, parede, máquina, água rasa). O movimento continua livre:
 * a grade só diz o que é sólido.
 *
 * Como funciona:
 * - o mapa é dividido em 3x3 células de 13 tiles; as salas seguem um caminho em "cobra" pelas
 *   células (virado, espelhado e deslocado pela semente), então duas salas seguidas são sempre
 *   vizinhas e o corredor entre elas é curto;
 * - cada sala ocupa uma célula, com tamanho tirado do modelo (metade do tamanho do dungeons.json,
 *   entre 7 e 11 tiles) e posição sorteada dentro da célula;
 * - corredores em L com 3 tiles de largura ligam cada sala à próxima;
 * - sala 0 é a entrada (spawn_jogador 'entrada' e saída 'saida'); a última tem a escada ('escada').
 *
 * Puro: não lê dados nem usa Math.random. Quem escolhe as salas é game/dungeon.ts.
 *
 * SUGESTÃO: 3x3 células de 13 tiles, salas de 7 a 11 tiles, corredores de 3 tiles, pilares de
 * máquina nas salas de armadilha e de chefe e água rasa nas salas de armadilha.
 */
import { createRng } from '../sim/rng';
import type { Rng } from '../sim/types';
import { makeMap, setTile } from './grid';
import { Tile, type MapMarker, type TileMap } from './types';

export const DUNGEON_CELLS = 3;
export const DUNGEON_CELL_TILES = 13;
/** 1 de borda + 3 células de 13 = 40 */
export const DUNGEON_MAP_TILES = 1 + DUNGEON_CELLS * DUNGEON_CELL_TILES;
export const DUNGEON_ROOM_MIN = 7;
export const DUNGEON_ROOM_MAX = 11;
export const DUNGEON_CORRIDOR = 3;
/** salas por andar no máximo (as 9 células) */
export const DUNGEON_MAX_ROOMS = DUNGEON_CELLS * DUNGEON_CELLS;

/** Pedido de sala para o gerador. */
export interface RoomRequest {
  templateId: string;
  tipo: string;
  name?: string;
  /** tamanho do modelo em tiles (dungeons.json tamanho) */
  w: number;
  h: number;
}

/** Sala gerada, em tiles. */
export interface GenRoom {
  idx: number;
  templateId: string;
  tipo: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** centro (float) */
  cx: number;
  cy: number;
}

export interface FloorLayout {
  map: TileMap;
  seed: number;
  rooms: GenRoom[];
  entrance: { x: number; y: number };
  exit: { x: number; y: number };
  stairs: { x: number; y: number };
}

export interface LayoutOpts {
  /** id do TileMap (ex.: galerias_da_usina:3) */
  mapId?: string;
  /** região do mapa (bônus de natureza/cidade): padrão usina_da_ponte */
  regionId?: string;
  floorTile?: Tile;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Ordem das células em cobra, virada/espelhada pela semente. */
function snakeOrder(rng: Rng): { cx: number; cy: number }[] {
  const transpose = rng.next() < 0.5, flipX = rng.next() < 0.5, flipY = rng.next() < 0.5;
  const out: { cx: number; cy: number }[] = [];
  for (let r = 0; r < DUNGEON_CELLS; r++) {
    for (let k = 0; k < DUNGEON_CELLS; k++) {
      const c = r % 2 === 0 ? k : DUNGEON_CELLS - 1 - k;
      let cx = transpose ? r : c, cy = transpose ? c : r;
      if (flipX) cx = DUNGEON_CELLS - 1 - cx;
      if (flipY) cy = DUNGEON_CELLS - 1 - cy;
      out.push({ cx, cy });
    }
  }
  return out;
}

function carveRect(m: TileMap, x0: number, y0: number, w: number, h: number, t: Tile): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x > 0 && y > 0 && x < m.width - 1 && y < m.height - 1) setTile(m, x, y, t);
}

/** Corredor em L de largura DUNGEON_CORRIDOR entre dois centros. */
function carveCorridor(m: TileMap, ax: number, ay: number, bx: number, by: number, horizFirst: boolean, t: Tile): void {
  const half = Math.floor(DUNGEON_CORRIDOR / 2);
  const hline = (x0: number, x1: number, y: number) => carveRect(m, Math.min(x0, x1) - half, y - half, Math.abs(x1 - x0) + DUNGEON_CORRIDOR, DUNGEON_CORRIDOR, t);
  const vline = (y0: number, y1: number, x: number) => carveRect(m, x - half, Math.min(y0, y1) - half, DUNGEON_CORRIDOR, Math.abs(y1 - y0) + DUNGEON_CORRIDOR, t);
  if (horizFirst) {
    hline(ax, bx, ay);
    vline(ay, by, bx);
  } else {
    vline(ay, by, ax);
    hline(ax, bx, by);
  }
}

/** Enfeites que não fecham caminho: pilares nos cantos e água rasa no meio (passável). */
function decorate(m: TileMap, r: GenRoom, rng: Rng): void {
  const corners = [
    [r.x + 1, r.y + 1],
    [r.x + r.w - 2, r.y + 1],
    [r.x + 1, r.y + r.h - 2],
    [r.x + r.w - 2, r.y + r.h - 2],
  ] as const;
  if (r.tipo === 'chefe' || r.tipo === 'armadilha') for (const [x, y] of corners) setTile(m, x, y, Tile.Maquina);
  if (r.tipo === 'armadilha') {
    const pw = clamp(rng.int(3, r.w - 4), 2, r.w - 4), ph = clamp(rng.int(2, r.h - 4), 2, r.h - 4);
    carveRect(m, Math.floor(r.cx - pw / 2), Math.floor(r.cy - ph / 2), pw, ph, Tile.AguaRasa);
  }
}

/**
 * Gera o andar. `rooms[0]` é a entrada; a última sala recebe a escada. Mais de 9 salas: as que
 * sobram são ignoradas.
 */
export function generateFloorLayout(seed: number, rooms: readonly RoomRequest[], opts: LayoutOpts = {}): FloorLayout {
  const rng = createRng(seed);
  const size = DUNGEON_MAP_TILES;
  const floor = opts.floorTile ?? Tile.Concreto;
  const m = makeMap(opts.mapId ?? `masmorra:${seed}`, size, size, Tile.Parede);
  const list = rooms.slice(0, DUNGEON_MAX_ROOMS);
  const order = snakeOrder(rng);
  const start = rng.int(0, DUNGEON_MAX_ROOMS - Math.max(1, list.length));
  const gen: GenRoom[] = list.map((req, i) => {
    const cell = order[start + i]!;
    const w = clamp(Math.round(req.w / 2), DUNGEON_ROOM_MIN, DUNGEON_ROOM_MAX);
    const h = clamp(Math.round(req.h / 2), DUNGEON_ROOM_MIN, DUNGEON_ROOM_MAX);
    const ox = 1 + cell.cx * DUNGEON_CELL_TILES, oy = 1 + cell.cy * DUNGEON_CELL_TILES;
    const x = ox + 1 + rng.int(0, DUNGEON_ROOM_MAX - w);
    const y = oy + 1 + rng.int(0, DUNGEON_ROOM_MAX - h);
    return { idx: i, templateId: req.templateId, tipo: req.tipo, name: req.name ?? req.templateId, x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  });
  for (const r of gen) carveRect(m, r.x, r.y, r.w, r.h, floor);
  for (let i = 1; i < gen.length; i++) {
    const a = gen[i - 1]!, b = gen[i]!;
    carveCorridor(m, Math.floor(a.cx), Math.floor(a.cy), Math.floor(b.cx), Math.floor(b.cy), rng.next() < 0.5, floor);
  }
  for (const r of gen) decorate(m, r, rng);
  const first = gen[0]!, last = gen[gen.length - 1]!;
  const entrance = { x: first.cx, y: first.cy };
  const exit = { x: first.x + 1.5, y: first.y + 1.5 };
  // chefe no centro da última sala; a escada fica mais embaixo, para não nascer em cima dele
  const stairs = last.tipo === 'chefe' ? { x: last.cx, y: last.y + last.h - 1.5 } : { x: last.cx, y: last.cy };
  // a saída e a escada nunca ficam num tile sólido (pilar)
  for (const p of [exit, stairs]) setTile(m, Math.floor(p.x), Math.floor(p.y), floor);
  const markers: MapMarker[] = [
    { id: 'entrada', kind: 'spawn_jogador', x: entrance.x, y: entrance.y },
    { id: 'saida', kind: 'saida', x: exit.x, y: exit.y, params: { sairDaMasmorra: true } },
    { id: 'escada', kind: 'saida', x: stairs.x, y: stairs.y, params: { escada: true } },
    ...gen.map((r): MapMarker => ({ id: `sala_${r.idx}`, kind: 'lugar', x: r.cx, y: r.cy, ref: r.templateId, params: { tipo: r.tipo, x: r.x, y: r.y, w: r.w, h: r.h } })),
  ];
  m.markers = markers;
  m.regions = [{ regionId: opts.regionId ?? 'usina_da_ponte', x: 0, y: 0, w: size, h: size }];
  return { map: m, seed, rooms: gen, entrance, exit, stairs };
}

/** Sala que contém o ponto (com 0,5 tile de folga para a porta), ou undefined no corredor. */
export function roomAt(layout: Pick<FloorLayout, 'rooms'>, x: number, y: number, margin = 0): GenRoom | undefined {
  return layout.rooms.find((r) => x >= r.x - margin && x <= r.x + r.w + margin && y >= r.y - margin && y <= r.y + r.h + margin);
}
