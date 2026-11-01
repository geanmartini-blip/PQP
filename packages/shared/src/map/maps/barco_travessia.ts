/**
 * Barco do Seu Jacó na travessia do nível 8 (Narrativa.md: "Seu Jacó leva você de barco até a
 * ponte"). Mapa pequeno, uma instância por jogador (sala 'barco:<id do jogador>', registry.ts).
 *
 * 20 x 38 tiles: o convés de madeira (10 x 18 andáveis, com a proa em cima e o leme embaixo),
 * cercado pela amurada (Cerca) e pelo Rio Claro. As margens não ficam no mapa: nas 3 colunas de cada
 * lado o cliente desenha as faixas rolando (Esquerda com mato e fogueira, Direita com concreto e
 * neon), para o barco parecer subir o rio (client/src/render/boatScroll.ts).
 *
 * SUGESTÃO: o desenho do barco, o tamanho e os pontos das ondas da aula são do mapa; os docs só dizem
 * que o Seu Jacó leva o novato de barco até a ponte e que as habilidades são ensinadas no barco.
 */
import { Tile } from '../types';
import type { AsciiLegendEntry, AsciiMapDef } from './ascii';
import { Deco } from './deco';

const LEGENDA: Record<string, AsciiLegendEntry> = {
  '~': { tile: Tile.AguaFunda },
  '=': { tile: Tile.Madeira },
  '+': { tile: Tile.Cerca },
  c: { tile: Tile.Madeira, deco: Deco.Caixote },
  r: { tile: Tile.Madeira, deco: Deco.Rede },
  l: { tile: Tile.Madeira, deco: Deco.Lanterna },
  P: { tile: Tile.Madeira, marker: { id: 'spawn', kind: 'spawn_jogador' } },
  // o Seu Jacó no leme, na popa
  J: { tile: Tile.Madeira, marker: { id: 'npc_seu_jaco_leme', kind: 'npc', ref: 'seu_jaco', params: { leme: true } } },
};

// prettier-ignore
const LINHAS: readonly string[] = [
  '~~~~~~~~~~~~~~~~~~~~', // 0
  '~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~++~~~~~~~~~', // proa
  '~~~~~~~~+==+~~~~~~~~',
  '~~~~~~~+====+~~~~~~~', // 5
  '~~~~~~+==l===+~~~~~~',
  '~~~~~+========+~~~~~',
  '~~~~+==========+~~~~',
  '~~~~+========r=+~~~~',
  '~~~~+==========+~~~~', // 10
  '~~~~+==========+~~~~',
  '~~~~+==========+~~~~',
  '~~~~+==========+~~~~',
  '~~~~+=====P====+~~~~',
  '~~~~+==========+~~~~', // 15
  '~~~~+==========+~~~~',
  '~~~~+==========+~~~~',
  '~~~~+==========+~~~~',
  '~~~~+=c========+~~~~',
  '~~~~+==========+~~~~', // 20
  '~~~~+==========+~~~~',
  '~~~~+==========+~~~~',
  '~~~~+=====J====+~~~~',
  '~~~~+=c======c=+~~~~',
  '~~~~~++++++++++~~~~~', // 25 popa
  '~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~',
  // rio a mais atrás da popa: com o zoom de meio passo do barco a tela do celular mostra ~34 tiles
  // de altura, e sem estas linhas o rodapé ficava preto
  '~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~', // 30
  '~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~', // 35
  '~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~',
];

export const BARCO_TRAVESSIA: AsciiMapDef = {
  id: 'barco_travessia',
  legend: LEGENDA,
  rows: LINHAS,
  regions: [{ regionId: 'rio_claro', x: 0, y: 0, w: 20, h: 38 }],
};

/** Colunas (em tiles) de cada faixa de margem que o cliente desenha rolando: [0, 3) e [17, 20). */
export const BOAT_SHORE_TILES = 3;

/**
 * Pontos do convés onde nascem os inimigos da aula (perto da proa e dos lados, longe do leme).
 * SUGESTÃO: os bichos do rio sobem pela proa; os capangas do Capataz abordam pelos lados.
 */
export const BOAT_WAVE_POINTS: readonly { x: number; y: number }[] = [
  { x: 10, y: 7.5 },
  { x: 7, y: 8.5 },
  { x: 13, y: 8.5 },
  { x: 6, y: 11.5 },
  { x: 14, y: 11.5 },
  { x: 10, y: 9.5 },
];
