/**
 * Chegada da travessia na Margem Direita (Fase 2). Mapa mínimo de 40 x 50 tiles que a Fase 3
 * expande. regions.json: "Torres, trens suspensos e telões. A Torre do Consórcio, de vidro espelhado
 * [...]. A sede da Fúria Neon, colada no estádio; o batalhão da PM, com estúdio de gravação próprio;
 * a Universidade Neon, com catraca por mensalidade; a Agência Neon, onde todo mundo é talento até o
 * contrato acabar."
 *
 * Lê-se de baixo para cima: o barco chega no cais de concreto (spawn), a avenida de asfalto sobe entre
 * as quatro instituições (porta virada para a avenida e um marcador 'lugar' na porta), a calçada com a
 * Cabine Neon (Máquina de Visual da Direita) e a Torre do Consórcio no alto, com piso neon e
 * hologramas. Geradores, grades e lixo na calçada. Paleta da Direita: neon sobre concreto (região
 * margem_direita).
 *
 * SUGESTÃO: o desenho, o tamanho e a posição de cada prédio são do mapa; os docs só dizem quais
 * prédios existem e como cada um é.
 */
import { Tile } from '../types';
import type { AsciiLegendEntry, AsciiMapDef } from './ascii';
import { Deco } from './deco';

const sede = (place: string, instituicao: string) => ({
  id: `lugar_${place}`,
  kind: 'lugar' as const,
  ref: place,
  params: { instituicao },
});

const LEGENDA: Record<string, AsciiLegendEntry> = {
  '~': { tile: Tile.AguaFunda },
  ',': { tile: Tile.AguaRasa },
  '.': { tile: Tile.Concreto },
  _: { tile: Tile.Asfalto },
  n: { tile: Tile.PisoNeon },
  ':': { tile: Tile.Grama },
  ';': { tile: Tile.Mato },
  '#': { tile: Tile.Parede },
  g: { tile: Tile.Grade },
  q: { tile: Tile.Maquina },
  D: { tile: Tile.Porta },
  // decoração
  b: { tile: Tile.AguaFunda, deco: Deco.Barco },
  v: { tile: Tile.Concreto, deco: Deco.Letreiro },
  h: { tile: Tile.PisoNeon, deco: Deco.Holograma },
  z: { tile: Tile.Asfalto, deco: Deco.Lixo },
  // marcadores
  P: { tile: Tile.Concreto, marker: { id: 'spawn', kind: 'spawn_jogador', params: { chegada: 'travessia' } } },
  Q: { tile: Tile.PisoNeon, marker: { id: 'lugar_torre_do_consorcio', kind: 'lugar', ref: 'torre_do_consorcio', params: { qg: 'torre_do_consorcio' } } },
  M: {
    tile: Tile.Concreto,
    marker: { id: 'cabine_neon', kind: 'maquina_visual', ref: 'cabine_neon', params: { lugar: 'torre_do_consorcio', npc: 'funcionario_da_cabine_neon' } },
  },
  N: { tile: Tile.Concreto, marker: { id: 'npc_funcionario_da_cabine_neon', kind: 'npc', ref: 'funcionario_da_cabine_neon' } },
  '1': { tile: Tile.Concreto, marker: sede('sede_torcida_furia_neon', 'torcida_furia_neon') },
  '2': { tile: Tile.Concreto, marker: sede('sede_pm_do_consorcio', 'pm_do_consorcio') },
  '3': { tile: Tile.Concreto, marker: sede('sede_universidade_neon', 'universidade_neon') },
  '4': { tile: Tile.Concreto, marker: sede('sede_agencia_neon', 'agencia_neon') },
};

// prettier-ignore
const LINHAS: readonly string[] = [
  'gggggggggggggggggggggggggggggggggggggggg', // 0
  'g.......v.......................v......g',
  'g.........####################.........g',
  'g.........#nnnnnnnnnnnnnnnnnn#.........g',
  'g.qq......#nnhnnnnnnnnnnnnhnn#......qq.g',
  'g.qq......#nnnnnnnnnnnnnnnnnn#......qq.g', // 5
  'g.........#nnnnnnnnQnnnnnnnnn#.........g',
  'g.........#nnnnnnnnnnnnnnnnnn#.........g',
  'g.........#nnnnnnnnnnnnnnnnnn#.........g',
  'g.........#########DD#########.........g',
  'g.............____________.............g', // 10
  'g.....MN......____________........v....g',
  'g.............____________.............g',
  'g.:::.........______z_____..........::.g',
  'g.............____________.............g',
  'g###########..____________..###########g', // 15
  'g#nnnnnnnnn#..____________..#nnnnnnnnn#g',
  'g#nnnvnnnnn#..____________..#nnnnnvnnn#g',
  'g#nnnnnnnnn#..____________..#nnnnnnnnn#g',
  'g#nnnnnnnnnD1.____________.2Dnnnnnnnnn#g',
  'g#nnnnnnnnnD..____________..Dnnnnnnnnn#g', // 20
  'g#nnnnnnnnn#..____________..#nnnnnnnnn#g',
  'g###########..____________..###########g',
  'g.............____________.............g',
  'g.q...........____z_______..........q..g',
  'g;;;..........____________.............g', // 25
  'g.............____________......ggg....g',
  'g###########..____________..###########g',
  'g#nnnnnnnnn#..____________..#nnnnnnnnn#g',
  'g#nnqnnnnnn#..____________..#nnhnnnhnn#g',
  'g#nnnnnnnnnD3.____________.4Dnnnnnnnnn#g', // 30
  'g#nnnnnnnnnD..____________..Dnnnnnnnnn#g',
  'g#nnnnnnnnn#..____________..#nnnnnnnnn#g',
  'g###########..____________..###########g',
  'g.............____________.............g',
  'g.v...........____________..........v..g', // 35
  'g.....q.......______z_____.......q.....g',
  'g.............____________.............g',
  'g.......gggg..____________..gggg.......g',
  'g.............____________.............g',
  'g......................................g', // 40
  'g.v.................v..................g',
  'g......................................g',
  'g......................................g',
  '~~,,,,,,,,,,,,,,........,,,,,,,,,,,,,,~~',
  '~~~~,,,,,,,,,,,,........,,,,,,,,,,,,~~~~', // 45
  '~~~~~~,,,,,,,,,,..P.....,,,,,,,,,,~~~~~~',
  '~~~~~~~~,,,,,,,,........,,,,,,,,~~~~~~~~',
  '~~~~~~~~~~~~~~~~........~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~b~~~~~~~~~~~~~~~~~~~~~~~~',
];

export const QG_DIREITA: AsciiMapDef = {
  id: 'qg_direita',
  legend: LEGENDA,
  rows: LINHAS,
  regions: [{ regionId: 'margem_direita', x: 0, y: 0, w: 40, h: 50 }],
};
