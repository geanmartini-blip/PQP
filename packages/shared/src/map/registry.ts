/**
 * Registro dos mapas por id. Cada mapa é construído uma vez e guardado em cache.
 *
 * O TileMap do cache é compartilhado por quem chamar getMap: trate como somente leitura. Quem
 * precisa mudar tiles (porta que abre, teste) usa buildMap, que devolve uma cópia nova.
 */
import type { TileMap } from './types';
import { buildAsciiMap } from './maps/ascii';
import { PROTOTIPO_DELTA } from './maps/prototipo_delta';

const BUILDERS: Readonly<Record<string, () => TileMap>> = {
  prototipo_delta: () => buildAsciiMap(PROTOTIPO_DELTA),
};

const cache = new Map<string, TileMap>();

/** ids de todos os mapas registrados */
export function listMaps(): string[] {
  return Object.keys(BUILDERS);
}

export function hasMap(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILDERS, id);
}

/** Constrói uma cópia nova do mapa, fora do cache. Lança erro se o id não existir. */
export function buildMap(id: string): TileMap {
  if (!hasMap(id)) throw new Error(`mapa desconhecido: '${id}' (existem: ${listMaps().join(', ')})`);
  return BUILDERS[id]!();
}

/** Mapa do cache (construído na primeira chamada). Lança erro se o id não existir. Somente leitura. */
export function getMap(id: string): TileMap {
  let m = cache.get(id);
  if (!m) {
    m = buildMap(id);
    cache.set(id, m);
  }
  return m;
}
