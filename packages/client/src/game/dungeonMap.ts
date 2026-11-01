/**
 * Mapa do andar da masmorra do lado do cliente. O andar não está no registro de mapas: sai de
 * buildDungeonFloor(andar, seed, dungeonId), a mesma função do servidor, com a semente da run que
 * veio em 'masmorra_info'. Mesma semente e andar = o mesmo mapa nos dois lados.
 */
import { buildDungeonFloor, GALERIAS } from '@pqp/shared/game/dungeon';
import type { TileMap } from '@pqp/shared/map';
import type { S2C_MasmorraInfo } from '@pqp/shared/net';

let cache: { key: string; map: TileMap } | null = null;

/** O id é de um andar de masmorra ('<dungeonId>:<andar>'). */
export function isDungeonMapId(id: string | null | undefined): boolean {
  return typeof id === 'string' && /^[a-z_]+:\d+$/.test(id);
}

/** Monta (ou devolve do cache) o mapa do andar `id`, se a run informada for desse andar. */
export function dungeonMapFor(id: string, info: S2C_MasmorraInfo | null | undefined): TileMap | undefined {
  if (!isDungeonMapId(id) || !info || info.seed === undefined) return undefined;
  const [dungeonId, n] = id.split(':') as [string, string];
  const andar = Number(n);
  const key = `${dungeonId}|${andar}|${info.seed}`;
  if (cache?.key === key) return cache.map;
  try {
    const floor = buildDungeonFloor(andar, info.seed, dungeonId || GALERIAS);
    if (floor.layout.map.id !== id) return undefined;
    cache = { key, map: floor.layout.map };
    return floor.layout.map;
  } catch {
    return undefined;
  }
}
