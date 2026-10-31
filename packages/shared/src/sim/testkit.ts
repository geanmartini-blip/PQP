/**
 * Kit para testes e para o simulador de balanceamento: arena com borda de parede e utilidades.
 * Importar por '@pqp/shared/sim/testkit' (não entra no index).
 */
import { makeMap, setTile } from '../map/grid';
import { Tile, type TileMap } from '../map/types';
import type { Entity, World } from './types';

/** Arena w×h de grama com parede na borda. */
export function arena(w = 30, h = 30): TileMap {
  const m = makeMap('arena', w, h, Tile.Grama);
  for (let x = 0; x < w; x++) {
    setTile(m, x, 0, Tile.Parede);
    setTile(m, x, h - 1, Tile.Parede);
  }
  for (let y = 0; y < h; y++) {
    setTile(m, 0, y, Tile.Parede);
    setTile(m, w - 1, y, Tile.Parede);
  }
  return m;
}

/** Retângulo de tiles. */
export function fill(m: TileMap, x0: number, y0: number, x1: number, y1: number, t: Tile): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setTile(m, x, y, t);
}

/** Deixa um inimigo parado (sem andar), para testes de alcance e posição. */
export function freeze(e: Entity): void {
  e.ai = { ...(e.ai ?? {}), imovel: true };
  e.moveTo = undefined;
  e.path = undefined;
}

/** Retrato estável do mundo para comparar determinismo. */
export function worldDigest(w: World): string {
  const ents = Array.from(w.entities.values()).map((e) => ({ ...e }));
  return JSON.stringify({
    tick: w.tick,
    rng: w.rng.state(),
    nextId: w.nextId,
    ents,
    tel: w.telegraphs,
    zones: w.zones,
  });
}
