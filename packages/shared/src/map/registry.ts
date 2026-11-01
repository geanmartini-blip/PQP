/**
 * Registro dos mapas por id. Cada mapa é construído uma vez e guardado em cache.
 *
 * O TileMap do cache é compartilhado por quem chamar getMap: trate como somente leitura. Quem
 * precisa mudar tiles (porta que abre, teste) usa buildMap, que devolve uma cópia nova.
 *
 * Mapas:
 * - prototipo_delta: o pedaço do Delta da Fase 1 (os testes de combate e de rede usam);
 * - delta: o Delta completo, níveis 1 a 7, com o cais da travessia (Fase 2);
 * - qg_esquerda e qg_direita: chegada da travessia em cada margem (Fase 2; a Fase 3 expande).
 */
import type { TileMap } from './types';
import { buildAsciiMap } from './maps/ascii';
import { DELTA } from './maps/delta';
import { PROTOTIPO_DELTA } from './maps/prototipo_delta';
import { QG_DIREITA } from './maps/qg_direita';
import { QG_ESQUERDA } from './maps/qg_esquerda';

const BUILDERS: Readonly<Record<string, () => TileMap>> = {
  prototipo_delta: () => buildAsciiMap(PROTOTIPO_DELTA),
  delta: () => buildAsciiMap(DELTA),
  qg_esquerda: () => buildAsciiMap(QG_ESQUERDA),
  qg_direita: () => buildAsciiMap(QG_DIREITA),
};

/** Mapa de chegada da travessia por margem escolhida. */
export const ARRIVAL_MAP_BY_SIDE: Readonly<Record<'esquerda' | 'direita', string>> = {
  esquerda: 'qg_esquerda',
  direita: 'qg_direita',
};

/** Mapa onde todo personagem novo começa (níveis 1 a 7). */
export const START_MAP = 'delta';

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
