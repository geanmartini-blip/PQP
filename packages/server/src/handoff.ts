/**
 * Fase 3: passagem entre as salas de mapa. Quem sai por uma 'saida' do mapa vai para outra sala
 * (trocar_sala) e precisa nascer na entrada certa do mapa de destino (params.spawn da saída). As
 * salas rodam no mesmo processo, então a chegada fica aqui, por token, até a sala de destino ler.
 *
 * Também diz em que mapas o registro pode estar (o mapa "de casa" é o de mapForRecord):
 * - Delta e travessia: só o Delta (e o próprio barco, 'barco:<id>', até escolher a margem);
 * - margem: as duas margens, a Usina da Ponte, o Juncal e o Delta (de barco).
 *   SUGESTÃO: visitar a outra margem é livre no piloto (a troca de lado é que fica fora).
 */
import { getData } from '@pqp/shared/data';
import { boatOwnerOf, isBoatRoom, resolveMapId, START_MAP } from '@pqp/shared/map';
import type { PlayerRecord } from '@pqp/shared/game/types';
import { isHouseMap } from './house';

export interface Arrival {
  mapId: string;
  /** id do marcador spawn_jogador do destino */
  spawn?: string;
}

// SUGESTÃO: no máximo 5000 chegadas pendentes (as mais velhas caem).
const MAX_PENDING = 5000;
const pending = new Map<string, Arrival>();

/** Guarda a chegada de um token no mapa de destino. */
export function setArrival(token: string, mapId: string, spawn?: string): void {
  pending.delete(token);
  pending.set(token, { mapId: resolveMapId(mapId), ...(spawn ? { spawn } : {}) });
  while (pending.size > MAX_PENDING) pending.delete(pending.keys().next().value!);
}

/** Há chegada pendente deste token para este mapa? */
export function hasArrival(token: string, mapId: string): boolean {
  return pending.get(token)?.mapId === resolveMapId(mapId);
}

/** Lê e apaga a chegada do token neste mapa (undefined: nasce no spawn padrão). */
export function takeArrival(token: string, mapId: string): Arrival | undefined {
  const a = pending.get(token);
  if (!a || a.mapId !== resolveMapId(mapId)) return undefined;
  pending.delete(token);
  return a;
}

/** Mapas da Fase 3 abertos para quem já atravessou. */
export const MARGEM_MAPS: readonly string[] = [
  'margem_esquerda',
  'margem_direita',
  'usina_da_ponte',
  'juncal',
  // v0.4: as áreas novas do early game
  'planalto_do_trigo',
  'vale_das_chamines',
  'ilha_do_farol',
  START_MAP,
];

/** O personagem do registro pode estar neste mapa? */
export function mapAllowed(rec: PlayerRecord, mapId: string): boolean {
  const id = resolveMapId(mapId);
  // travessia: o barco ('barco:<id>') é só do dono e só até escolher a margem
  if (isBoatRoom(id)) return rec.criado && boatOwnerOf(id) === rec.id && rec.stage !== 'margem';
  if (!rec.criado || rec.stage !== 'margem' || !rec.side) return id === START_MAP;
  // Fase 4: a sala de uma casa ('casa:<id>'); a permissão do dono é conferida pela sala
  // Fase 5: andar da masmorra ('masmorra:<run>:<andar>'); quem é do grupo é conferido pela sala
  if (id.startsWith('masmorra:')) return true;
  if (isHouseMap(id)) return true;
  return MARGEM_MAPS.includes(id);
}

/** Nome de exibição de um NPC de marcador (treinador, npcs.json, IA de facção ou guia). */
export function npcDisplayName(ref: string): string | undefined {
  const D = getData();
  return D.trainersById.get(ref)?.name ?? D.npcsById.get(ref)?.name ?? D.factionCharactersById.get(ref)?.name ?? D.guidesById.get(ref)?.name;
}
