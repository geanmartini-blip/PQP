/**
 * Contrato do mapa em tiles. 1 unidade = 1 tile = 32 px.
 * O mapa é contínuo; o movimento é livre (float), os tiles só dizem o que é sólido e o que bloqueia a visão.
 */

export enum Tile {
  Vazio = 0,
  Grama = 1,
  Terra = 2,
  Areia = 3,
  AguaRasa = 4, // anda devagar
  AguaFunda = 5, // sólido (não anda), não bloqueia visão
  Madeira = 6, // assoalho, palafita, ponte de madeira
  Concreto = 7,
  Asfalto = 8,
  PisoNeon = 9,
  Lama = 10, // anda devagar
  Mato = 11, // vegetação baixa, não bloqueia
  Parede = 20, // sólido e opaco
  Arvore = 21, // sólido e opaco
  Pedra = 22, // sólido, não opaco (dá para ver por cima)
  Cerca = 23, // sólido, não opaco
  Grade = 24, // sólido, não opaco
  Maquina = 25, // sólido e opaco (turbina, gerador)
  Porta = 26, // passável, marca entrada de prédio
}

export interface TileInfo {
  solid: boolean;
  opaque: boolean;
  /** multiplicador de velocidade ao andar por cima */
  speed: number;
  /** natureza (bônus da Esquerda) ou cidade (bônus da Direita) é da região, não do tile */
  water?: boolean;
  mud?: boolean;
}

export const TILE_INFO: Record<number, TileInfo> = {
  [Tile.Vazio]: { solid: true, opaque: false, speed: 0 },
  [Tile.Grama]: { solid: false, opaque: false, speed: 1 },
  [Tile.Terra]: { solid: false, opaque: false, speed: 1 },
  [Tile.Areia]: { solid: false, opaque: false, speed: 0.95 },
  [Tile.AguaRasa]: { solid: false, opaque: false, speed: 0.6, water: true },
  [Tile.AguaFunda]: { solid: true, opaque: false, speed: 0, water: true },
  [Tile.Madeira]: { solid: false, opaque: false, speed: 1 },
  [Tile.Concreto]: { solid: false, opaque: false, speed: 1 },
  [Tile.Asfalto]: { solid: false, opaque: false, speed: 1 },
  [Tile.PisoNeon]: { solid: false, opaque: false, speed: 1 },
  [Tile.Lama]: { solid: false, opaque: false, speed: 0.6, mud: true },
  [Tile.Mato]: { solid: false, opaque: false, speed: 0.9 },
  [Tile.Parede]: { solid: true, opaque: true, speed: 0 },
  [Tile.Arvore]: { solid: true, opaque: true, speed: 0 },
  [Tile.Pedra]: { solid: true, opaque: false, speed: 0 },
  [Tile.Cerca]: { solid: true, opaque: false, speed: 0 },
  [Tile.Grade]: { solid: true, opaque: false, speed: 0 },
  [Tile.Maquina]: { solid: true, opaque: true, speed: 0 },
  [Tile.Porta]: { solid: false, opaque: false, speed: 1 },
};

export interface MapMarker {
  id: string;
  kind: 'spawn_jogador' | 'npc' | 'inimigo' | 'bando' | 'chefe' | 'maquina_visual' | 'loja' | 'quadro_missoes' | 'porta' | 'saida' | 'masmorra' | 'lugar' | 'ponto_controle' | 'moradia';
  x: number;
  y: number;
  /** id do npc, inimigo, lugar, instituição etc. */
  ref?: string;
  params?: Record<string, unknown>;
}

export interface RegionRect {
  regionId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TileMap {
  id: string;
  width: number;
  height: number;
  /** tiles[y * width + x] */
  tiles: Uint8Array;
  /** decoração por cima (só visual): 0 = nada */
  deco?: Uint8Array;
  regions: RegionRect[];
  markers: MapMarker[];
}
