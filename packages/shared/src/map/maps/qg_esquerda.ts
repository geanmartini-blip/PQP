/**
 * Chegada da travessia na Margem Esquerda (Fase 2). Mapa mínimo de 40 x 50 tiles que a Fase 3
 * expande. regions.json: "Casas baixas, hortas, mutirões e a feira. A Casa da Assembleia [...]. A
 * Brigada Popular, num galpão de trem; a Guarda Comunitária, com uma guarita por quarteirão; a Escola
 * dos Saberes, debaixo de uma figueira enorme; a Trupe do Povo, no antigo cinema."
 *
 * Lê-se de baixo para cima: o barco chega no trapiche (spawn), a areia da margem, as hortas, as quatro
 * instituições em volta da rua de terra (porta virada para a rua e um marcador 'lugar' na porta), a
 * praça com o Espelho da Benzedeira (Máquina de Visual da Esquerda) e a Casa da Assembleia no alto.
 * Paleta da Esquerda: natureza, terra e madeira (região margem_esquerda).
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
  '.': { tile: Tile.Terra },
  ':': { tile: Tile.Grama },
  ';': { tile: Tile.Mato },
  s: { tile: Tile.Areia },
  '=': { tile: Tile.Madeira },
  '#': { tile: Tile.Parede },
  T: { tile: Tile.Arvore },
  o: { tile: Tile.Pedra },
  D: { tile: Tile.Porta },
  // decoração
  '*': { tile: Tile.Grama, deco: Deco.Flor },
  '@': { tile: Tile.Areia, deco: Deco.Concha },
  '-': { tile: Tile.Madeira, deco: Deco.Tabua },
  b: { tile: Tile.AguaFunda, deco: Deco.Barco },
  c: { tile: Tile.Madeira, deco: Deco.Caixote },
  l: { tile: Tile.Madeira, deco: Deco.Lanterna },
  k: { tile: Tile.Grama, deco: Deco.Totem },
  x: { tile: Tile.Terra, deco: Deco.Horta },
  // marcadores
  P: { tile: Tile.Madeira, marker: { id: 'spawn', kind: 'spawn_jogador', params: { chegada: 'travessia' } } },
  Q: { tile: Tile.Madeira, marker: { id: 'lugar_casa_da_assembleia', kind: 'lugar', ref: 'casa_da_assembleia', params: { qg: 'casa_da_assembleia' } } },
  M: {
    tile: Tile.Grama,
    marker: { id: 'espelho_da_benzedeira', kind: 'maquina_visual', ref: 'espelho_da_benzedeira', params: { lugar: 'casa_da_assembleia', npc: 'benzedeira_do_espelho' } },
  },
  N: { tile: Tile.Grama, marker: { id: 'npc_benzedeira_do_espelho', kind: 'npc', ref: 'benzedeira_do_espelho' } },
  '1': { tile: Tile.Grama, marker: sede('sede_brigada_popular', 'brigada_popular') },
  '2': { tile: Tile.Grama, marker: sede('sede_guarda_comunitaria', 'guarda_comunitaria') },
  '3': { tile: Tile.Grama, marker: sede('sede_escola_dos_saberes', 'escola_dos_saberes') },
  '4': { tile: Tile.Grama, marker: sede('sede_trupe_do_povo', 'trupe_do_povo') },
};

// prettier-ignore
const LINHAS: readonly string[] = [
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT', // 0
  'TT::::::*:::::::::::::::::::::*:::::::TT',
  'TT::::::::####################::::::::TT',
  'TT:k::::::#==================#::::::k:TT',
  'TT::::::::#===l==========l===#::::::::TT',
  'TT::::::::#==================#::::::::TT', // 5
  'TT::xxx:::#========Q=========#:::xxx::TT',
  'TT::xxx:::#==================#:::xxx::TT',
  'TT::::::::#====-=============#::::::::TT',
  'TT::::::::#########DD#########::::::::TT',
  'TT::::::::::................::::::::::TT', // 10
  'TT;:::::MN::................::::::::;TTT',
  'TT::::::::::................::::::::::TT',
  'TT::::*:::::....o.......o...::::::*:::TT',
  'TT::::::::::................::::::::::TT',
  'TT##########::............::##########TT', // 15
  'TT#========#::............::#========#TT',
  'TT#===c====#::............::#====c===#TT',
  'TT#========#::............::#========#TT',
  'TT#========D1:............:2D========#TT',
  'TT#========D::............::D========#TT', // 20
  'TT#========#::............::#========#TT',
  'TT##########::............::##########TT',
  'TT::::::::::::............::::::::::::TT',
  'TT::TTTTTT::::............::::::::::::TT',
  'TT:TTTTTTTT:::............::::::::::::TT', // 25
  'TT::TTTTTT::::............::::*:::::::TT',
  'TT##########::............::##########TT',
  'TT#========#::............::#========#TT',
  'TT#==l=====#::............::#---=====#TT',
  'TT#========D3:............:4D========#TT', // 30
  'TT#========D::............::D========#TT',
  'TT#========#::............::#---=====#TT',
  'TT##########::............::##########TT',
  'TT::::::::::::............::::::::::::TT',
  'TT;:::::*:::::............::::::::;:::TT', // 35
  'TT::::xxxx::::............::::xxxx::::TT',
  'TT::::xxxx::::............::::xxxx::::TT',
  'TT;;::::::::::............::::::::::;;TT',
  'TTT:::::::T:::............:T::::::::TTTT',
  'TTTT::::::::::............:::::::::TTTTT', // 40
  'TTTTTsssssssss............ssssssssTTTTTT',
  'TTTTssss@sssssss........ssssssssssssTTTT',
  'TT,,ssssssssssssssssssssssssssssssss,,TT',
  '~~,,,,,,,,,,,,,,========,,,,,,,,,,,,,,~~',
  '~~~~,,,,,,,,,,,,========,,,,,,,,,,,,~~~~', // 45
  '~~~~~~,,,,,,,,,,==P=====,,,,,,,,,,~~~~~~',
  '~~~~~~~~,,,,,,,,========,,,,,,,,~~~~~~~~',
  '~~~~~~~~~~~~~~~~========~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~b~~~~~~~~~~~~~~~~~~~~~~~~',
];

export const QG_ESQUERDA: AsciiMapDef = {
  id: 'qg_esquerda',
  legend: LEGENDA,
  rows: LINHAS,
  regions: [{ regionId: 'margem_esquerda', x: 0, y: 0, w: 40, h: 50 }],
};
