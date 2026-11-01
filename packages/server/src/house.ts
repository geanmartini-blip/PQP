/**
 * Fase 4: a casa do jogador é uma sala própria, 'casa:<id do dono>', com um mapa pequeno montado
 * aqui pelo tipo da moradia (housing.json tamanho). Sem combate e sem conteúdo: só gente andando,
 * os móveis (casa_info) e a porta de saída.
 *
 * Layout do mapa (o cliente monta o mesmo a partir de casa_info w × h e side):
 * - largura w + 2, altura h + 3, tudo Parede;
 * - interior em x 1..w, y 1..h: Madeira na Esquerda, PisoNeon na Direita;
 * - porta (Porta) em (px, h + 1) com px = 1 + floor((w - 1) / 2), e o degrau de fora (o mesmo piso)
 *   em (px, h + 2), onde fica o marcador 'saida' (params.para = margem da casa, params.spawn = id do
 *   marcador 'moradia' de lá);
 * - nasce em 'spawn' (px, max(1, h - 1)), 3 tiles acima da saída.
 * Os móveis não bloqueiam o passo. // SUGESTÃO: no piloto, móvel é só visual (e descanso).
 */
import { getMap, Tile, type MapMarker, type TileMap } from '@pqp/shared/map';
import { tipoMoradia } from '@pqp/shared/game/housing';
import type { PlayerRecord } from '@pqp/shared/game/types';

export const HOUSE_PREFIX = 'casa:';

export const houseMapId = (ownerId: string): string => `${HOUSE_PREFIX}${ownerId}`;

export const isHouseMap = (id: unknown): id is string => typeof id === 'string' && id.startsWith(HOUSE_PREFIX) && id.length > HOUSE_PREFIX.length;

export const ownerOfHouseMap = (id: string): string => id.slice(HOUSE_PREFIX.length);

/** Mapa da margem e marcador 'moradia' da porta das casas de cada lado. */
export const HOUSE_DOOR_MAP: Readonly<Record<'esquerda' | 'direita', string>> = {
  esquerda: 'margem_esquerda',
  direita: 'margem_direita',
};

/** Margem de um mapa ('margem_esquerda' -> 'esquerda'), ou undefined. */
export function sideOfMap(mapId: string): 'esquerda' | 'direita' | undefined {
  if (mapId === HOUSE_DOOR_MAP.esquerda) return 'esquerda';
  if (mapId === HOUSE_DOOR_MAP.direita) return 'direita';
  return undefined;
}

/** A porta das casas de uma margem: mapa e o primeiro marcador 'moradia' dele. */
export function houseDoor(side: 'esquerda' | 'direita'): { mapId: string; marker: MapMarker | undefined } {
  const mapId = HOUSE_DOOR_MAP[side];
  return { mapId, marker: getMap(mapId).markers.find((m) => m.kind === 'moradia') };
}

/** Lado da casa do registro (pelo tipo da moradia; sem casa, o lado do jogador). */
export function houseSide(rec: PlayerRecord): 'esquerda' | 'direita' {
  const t = rec.home ? tipoMoradia(rec.home.tipo) : undefined;
  const s = t?.side ?? rec.side;
  return s === 'direita' ? 'direita' : 'esquerda';
}

/** Mapa da sala da casa do dono (layout no cabeçalho). */
export function buildHouseMap(owner: PlayerRecord): TileMap {
  const t = owner.home ? tipoMoradia(owner.home.tipo) : undefined;
  const w = Math.max(2, t?.tamanho.w ?? 3);
  const h = Math.max(2, t?.tamanho.h ?? 3);
  const side = houseSide(owner);
  const floor = side === 'direita' ? Tile.PisoNeon : Tile.Madeira;
  const W = w + 2;
  const H = h + 3;
  const tiles = new Uint8Array(W * H).fill(Tile.Parede);
  for (let y = 1; y <= h; y++) for (let x = 1; x <= w; x++) tiles[y * W + x] = floor;
  const px = 1 + Math.floor((w - 1) / 2);
  tiles[(h + 1) * W + px] = Tile.Porta;
  tiles[(h + 2) * W + px] = floor;
  const door = houseDoor(side);
  const markers: MapMarker[] = [
    { id: 'spawn', kind: 'spawn_jogador', x: px + 0.5, y: Math.max(1, h - 1) + 0.5 },
    {
      id: 'saida_casa',
      kind: 'saida',
      x: px + 0.5,
      y: h + 2 + 0.5,
      ref: door.mapId,
      params: { para: door.mapId, ...(door.marker ? { spawn: door.marker.id } : {}), casa: true },
    },
  ];
  return { id: houseMapId(owner.id), width: W, height: H, tiles, regions: [], markers };
}
