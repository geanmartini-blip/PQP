/**
 * Registro dos mapas por id. Cada mapa é construído uma vez e guardado em cache.
 *
 * O TileMap do cache é compartilhado por quem chamar getMap: trate como somente leitura. Quem
 * precisa mudar tiles (porta que abre, teste) usa buildMap, que devolve uma cópia nova.
 *
 * Mapas:
 * - prototipo_delta: o pedaço do Delta da Fase 1 (os testes de combate e de rede usam);
 * - delta: o Delta completo, níveis 1 a 7, com o cais da travessia (Fase 2);
 * - margem_esquerda e margem_direita: as duas margens, com o QG, as 4 instituições e os treinadores
 *   (Fase 3); a travessia chega no cais de cada uma;
 * - usina_da_ponte: a ponte entre as margens, a barragem e a entrada das Galerias (Fase 3);
 * - juncal: a mata do Curupira e a trilha dos contrabandistas do Capataz (Fase 3);
 * - barco_travessia: o barco do Seu Jacó no nível 8. Roda numa sala por jogador ('barco:<id>'):
 *   boatRoomMap(id) devolve o mesmo mapa com o id da sala.
 *
 * Apelidos: qg_esquerda e qg_direita eram as chegadas da Fase 2. Viraram apelidos das margens, para
 * registros salvos e salas antigas continuarem abrindo: getMap('qg_esquerda') devolve margem_esquerda
 * (com id 'margem_esquerda'). listMaps() lista só os ids canônicos.
 */
import type { TileMap } from './types';
import { buildAsciiMap } from './maps/ascii';
import { BARCO_TRAVESSIA } from './maps/barco_travessia';
import { DELTA } from './maps/delta';
import { JUNCAL } from './maps/juncal';
import { MARGEM_DIREITA } from './maps/margem_direita';
import { MARGEM_ESQUERDA } from './maps/margem_esquerda';
import { PROTOTIPO_DELTA } from './maps/prototipo_delta';
import { USINA_DA_PONTE } from './maps/usina_da_ponte';

const BUILDERS: Readonly<Record<string, () => TileMap>> = {
  prototipo_delta: () => buildAsciiMap(PROTOTIPO_DELTA),
  delta: () => buildAsciiMap(DELTA),
  margem_esquerda: () => buildAsciiMap(MARGEM_ESQUERDA),
  margem_direita: () => buildAsciiMap(MARGEM_DIREITA),
  usina_da_ponte: () => buildAsciiMap(USINA_DA_PONTE),
  juncal: () => buildAsciiMap(JUNCAL),
  barco_travessia: () => buildAsciiMap(BARCO_TRAVESSIA),
};

/** Mapa do barco da travessia (nível 8). */
export const BOAT_MAP = 'barco_travessia';
/** Prefixo da sala do barco, uma por jogador: 'barco:<id do jogador>'. */
export const BOAT_ROOM_PREFIX = 'barco:';
export const boatRoomId = (playerId: string): string => `${BOAT_ROOM_PREFIX}${playerId}`;
export const isBoatRoom = (id: string | null | undefined): boolean => typeof id === 'string' && id.startsWith(BOAT_ROOM_PREFIX) && id.length > BOAT_ROOM_PREFIX.length;
/** Id do jogador dono da sala do barco. */
export const boatOwnerOf = (roomId: string): string => roomId.slice(BOAT_ROOM_PREFIX.length);

/** O mapa do barco com o id da sala (tiles e marcadores do cache: somente leitura). */
export function boatRoomMap(roomId: string): TileMap {
  return { ...getMap(BOAT_MAP), id: roomId };
}

/** Ids antigos que apontam para um mapa canônico. */
export const MAP_ALIASES: Readonly<Record<string, string>> = {
  qg_esquerda: 'margem_esquerda',
  qg_direita: 'margem_direita',
};

/** Id canônico do mapa (resolve os apelidos; id desconhecido volta igual). */
export function resolveMapId(id: string): string {
  return Object.prototype.hasOwnProperty.call(MAP_ALIASES, id) ? MAP_ALIASES[id]! : id;
}

/** Mapa de chegada da travessia por margem escolhida. */
export const ARRIVAL_MAP_BY_SIDE: Readonly<Record<'esquerda' | 'direita', string>> = {
  esquerda: 'margem_esquerda',
  direita: 'margem_direita',
};

/** Mapa onde todo personagem novo começa (níveis 1 a 7). */
export const START_MAP = 'delta';

const cache = new Map<string, TileMap>();

/** ids canônicos de todos os mapas registrados (sem os apelidos) */
export function listMaps(): string[] {
  return Object.keys(BUILDERS);
}

/** true para id canônico ou apelido. */
export function hasMap(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILDERS, resolveMapId(id));
}

/** Constrói uma cópia nova do mapa, fora do cache. Aceita apelido. Lança erro se o id não existir. */
export function buildMap(id: string): TileMap {
  if (!hasMap(id)) throw new Error(`mapa desconhecido: '${id}' (existem: ${listMaps().join(', ')})`);
  return BUILDERS[resolveMapId(id)]!();
}

/** Mapa do cache (construído na primeira chamada). Aceita apelido. Lança erro se o id não existir. Somente leitura. */
export function getMap(id: string): TileMap {
  const key = resolveMapId(id);
  let m = cache.get(key);
  if (!m) {
    m = buildMap(key);
    cache.set(key, m);
  }
  return m;
}
