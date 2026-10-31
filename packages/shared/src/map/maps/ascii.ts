/**
 * Mapas escritos como linhas ASCII com legenda, convertidos para TileMap.
 *
 * Cada caractere é uma célula. A legenda diz o tile da célula, a decoração opcional e, se for um
 * marcador, o marcador (sem x e y). Marcadores ficam no centro da célula (x + 0,5, y + 0,5) e cada
 * caractere de marcador só pode aparecer uma vez no mapa, para o id não repetir.
 */
import type { MapMarker, RegionRect, TileMap } from '../types';
import { Tile } from '../types';

export interface AsciiLegendEntry {
  tile: Tile;
  /** valor de Deco (maps/deco.ts); 0 ou ausente = sem decoração */
  deco?: number;
  /** marcador posto no centro da célula */
  marker?: Omit<MapMarker, 'x' | 'y'>;
}

export interface AsciiMapDef {
  id: string;
  legend: Readonly<Record<string, AsciiLegendEntry>>;
  /** linhas de cima para baixo, todas com a mesma largura */
  rows: readonly string[];
  regions: RegionRect[];
  /** marcadores extras com posição livre (fora da grade de caracteres) */
  extraMarkers?: MapMarker[];
}

/** Converte a definição ASCII num TileMap novo. Lança erro em linha torta, caractere sem legenda ou marcador repetido. */
export function buildAsciiMap(def: AsciiMapDef): TileMap {
  const height = def.rows.length;
  if (height === 0) throw new Error(`mapa ${def.id}: sem linhas`);
  const width = def.rows[0]!.length;
  const tiles = new Uint8Array(width * height);
  const deco = new Uint8Array(width * height);
  const markers: MapMarker[] = [];
  const seenMarker = new Set<string>();
  let anyDeco = false;

  for (let y = 0; y < height; y++) {
    const row = def.rows[y]!;
    if (row.length !== width) throw new Error(`mapa ${def.id}: linha ${y} tem ${row.length} colunas, esperado ${width}`);
    for (let x = 0; x < width; x++) {
      const ch = row[x]!;
      const e = def.legend[ch];
      if (!e) throw new Error(`mapa ${def.id}: caractere '${ch}' sem legenda em (${x}, ${y})`);
      tiles[y * width + x] = e.tile;
      if (e.deco) {
        deco[y * width + x] = e.deco;
        anyDeco = true;
      }
      if (e.marker) {
        if (seenMarker.has(ch)) throw new Error(`mapa ${def.id}: marcador '${ch}' repetido em (${x}, ${y})`);
        seenMarker.add(ch);
        const m: MapMarker = { ...e.marker, x: x + 0.5, y: y + 0.5 };
        if (e.marker.params) m.params = structuredClone(e.marker.params);
        markers.push(m);
      }
    }
  }
  for (const m of def.extraMarkers ?? []) markers.push({ ...m });

  const map: TileMap = { id: def.id, width, height, tiles, regions: def.regions.map((r) => ({ ...r })), markers };
  if (anyDeco) map.deco = deco;
  return map;
}
