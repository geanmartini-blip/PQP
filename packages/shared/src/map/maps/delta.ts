/**
 * Mapa do Delta, níveis 1 a 7 (Narrativa.md, "O Delta: níveis 1 a 7"; places.json e regions.json,
 * região delta). "Rio abaixo, a vila de palafitas onde todo mundo começa e onde ninguém tem lado."
 *
 * 90 x 140 tiles, em retrato. O norte (y pequeno) dá para o rio, rumo à ponte. Do spawn para fora:
 * - Vila (y 84 a 107): deque de palafitas sobre água rasa. Cadastro do Delta (Seu Jacó e o Espelho
 *   do Cadastro, maquina_visual_delta), o spawn na porta do cadastro, a palafita do Seu Jacó, a banca
 *   do vendedor do Delta e o cais a oeste, com o barco da travessia (saída) e o Toninho.
 * - Mangue (y 108 a 137), ao sul: lama, mato, juncos, canais e lagoas. Siris perto da vila (1 e 2)
 *   e mosquitos mais fundo (2 e 3), com um siri elite no fim do lamaçal.
 * - Porto (y 58 a 83), ao norte, depois do canal com ponte de tábua: posto do Delta com a fila,
 *   ringue, bar do porto e a feira de pulgas no deque leste. Capangas (3 a 5), cobradores e o
 *   capanga elite blindado da missão da chopindita.
 * - Acampamento do Capataz (y 31 a 57): curral, galpão, lamaçal, capangas e o Cobrador elite.
 * - Arena (y 2 a 30): paliçada com dois portões, clareira de terra e areia cercada de mata e o
 *   trapiche onde Bruno Ferro amarrou o barco do vizinho. Chefe bruno_ferro_chefe, nível 7.
 *
 * Convenções que outros módulos usam:
 * - lugar: marcador kind 'lugar' com ref = id do place (places.json);
 * - alvo de objetivo 'interagir' (missions.json): marcador com id = alvo
 *   (maquina_visual_delta, fila_do_posto_do_delta);
 * - saída da travessia: kind 'saida', params.travessia = true;
 * - bandos e inimigos com params.level (nível absoluto, nunca abaixo do nível base do inimigo).
 *
 * SUGESTÃO: o desenho do mapa, a posição de cada coisa, o nível e o tamanho de cada bando e os afixos
 * dos elites são do mapa; os docs só dizem o que existe no Delta (places.json, missions.json) e que o
 * chefe do nível 7 é Bruno Ferro.
 */
import { Tile } from '../types';
import type { AsciiLegendEntry, AsciiMapDef } from './ascii';
import { Deco } from './deco';

const bando = (id: string, inimigo: string, n: number, level: number) => ({
  id,
  kind: 'bando' as const,
  params: { inimigos: [inimigo], n, level },
});

const LEGENDA: Record<string, AsciiLegendEntry> = {
  // terreno
  '~': { tile: Tile.AguaFunda },
  ',': { tile: Tile.AguaRasa },
  '.': { tile: Tile.Terra },
  ':': { tile: Tile.Grama },
  ';': { tile: Tile.Mato },
  '%': { tile: Tile.Lama },
  s: { tile: Tile.Areia },
  '=': { tile: Tile.Madeira },
  '#': { tile: Tile.Parede },
  T: { tile: Tile.Arvore },
  o: { tile: Tile.Pedra },
  '+': { tile: Tile.Cerca },
  D: { tile: Tile.Porta },
  // decoração (só visual)
  '*': { tile: Tile.Grama, deco: Deco.Flor },
  '@': { tile: Tile.Areia, deco: Deco.Concha },
  _: { tile: Tile.Lama, deco: Deco.Tabua },
  '-': { tile: Tile.Madeira, deco: Deco.Tabua },
  b: { tile: Tile.AguaFunda, deco: Deco.Barco },
  j: { tile: Tile.AguaRasa, deco: Deco.Junco },
  r: { tile: Tile.Madeira, deco: Deco.Rede },
  c: { tile: Tile.Madeira, deco: Deco.Caixote },
  l: { tile: Tile.Madeira, deco: Deco.Lanterna },
  h: { tile: Tile.Madeira, deco: Deco.Toldo },

  // vila
  P: { tile: Tile.Madeira, marker: { id: 'spawn', kind: 'spawn_jogador' } },
  K: { tile: Tile.Madeira, marker: { id: 'lugar_cadastro_do_delta', kind: 'lugar', ref: 'cadastro_do_delta' } },
  M: {
    tile: Tile.Madeira,
    marker: { id: 'maquina_visual_delta', kind: 'maquina_visual', ref: 'maquina_visual_delta', params: { lugar: 'cadastro_do_delta', npc: 'seu_jaco' } },
  },
  J: { tile: Tile.Madeira, marker: { id: 'npc_seu_jaco', kind: 'npc', ref: 'seu_jaco', params: { lugar: 'cadastro_do_delta' } } },
  V: { tile: Tile.Madeira, marker: { id: 'lugar_palafitas_do_delta', kind: 'lugar', ref: 'palafitas_do_delta' } },
  H: { tile: Tile.Madeira, marker: { id: 'npc_vendedor_do_delta', kind: 'npc', ref: 'vendedor_do_delta' } },
  // cais e barco da travessia
  C: { tile: Tile.Madeira, marker: { id: 'lugar_cais_do_delta', kind: 'lugar', ref: 'cais_do_delta' } },
  // SUGESTÃO: um segundo Seu Jacó no cais (places.json põe o seu_jaco no cais e no cadastro); o
  // servidor pode mostrar só um dos dois conforme a missão.
  Y: { tile: Tile.Madeira, marker: { id: 'npc_seu_jaco_cais', kind: 'npc', ref: 'seu_jaco', params: { lugar: 'cais_do_delta' } } },
  X: {
    tile: Tile.Madeira,
    marker: { id: 'saida_travessia', kind: 'saida', ref: 'usina_da_ponte', params: { travessia: true, lugar: 'cais_do_delta', destinos: ['qg_esquerda', 'qg_direita'] } },
  },
  N: { tile: Tile.Madeira, marker: { id: 'npc_toninho_do_barco', kind: 'npc', ref: 'toninho_do_barco' } },
  Z: { tile: Tile.Madeira, marker: { id: 'pc_cais_do_delta', kind: 'ponto_controle', ref: 'pc_cais_do_delta' } },
  // porto
  Q: { tile: Tile.Terra, marker: { id: 'lugar_posto_do_delta', kind: 'lugar', ref: 'posto_do_delta' } },
  U: {
    tile: Tile.Terra,
    marker: { id: 'fila_do_posto_do_delta', kind: 'lugar', ref: 'posto_do_delta', params: { interagir: 'fila_do_posto_do_delta' } },
  },
  R: { tile: Tile.Areia, marker: { id: 'lugar_ringue_do_porto', kind: 'lugar', ref: 'ringue_do_porto' } },
  A: { tile: Tile.Terra, marker: { id: 'lugar_bar_do_porto', kind: 'lugar', ref: 'bar_do_porto' } },
  F: { tile: Tile.Madeira, marker: { id: 'lugar_feira_de_pulgas', kind: 'lugar', ref: 'feira_de_pulgas' } },
  G: { tile: Tile.Madeira, marker: { id: 'npc_vendedor_de_chopindita_barata', kind: 'npc', ref: 'vendedor_de_chopindita_barata', params: { lugar: 'feira_de_pulgas' } } },

  // SUGESTÃO: n e nível de cada bando (n dentro do mínimo e máximo de enemies.json), do nível 1 perto
  // da vila ao 6 no curral do Capataz.
  // mangue
  '1': { tile: Tile.Terra, marker: bando('bando_siri_beira', 'siri_do_mangue', 3, 1) },
  '2': { tile: Tile.Lama, marker: bando('bando_siri_lamacal', 'siri_do_mangue', 4, 1) },
  '3': { tile: Tile.Lama, marker: bando('bando_siri_canal', 'siri_do_mangue', 5, 2) },
  '4': { tile: Tile.Lama, marker: bando('bando_mosquito_brejo', 'mosquito_do_delta', 5, 2) },
  '5': { tile: Tile.Lama, marker: bando('bando_mosquito_leste', 'mosquito_do_delta', 6, 2) },
  '6': { tile: Tile.Lama, marker: bando('bando_mosquito_fundo', 'mosquito_do_delta', 7, 2) },
  e: {
    tile: Tile.Lama,
    marker: { id: 'elite_siri_do_fundo', kind: 'inimigo', ref: 'siri_do_mangue', params: { tier: 'elite', affixes: ['rapido'], level: 3 } },
  },
  // porto
  '7': { tile: Tile.Grama, marker: bando('bando_capanga_estrada', 'capanga_do_capataz', 2, 2) },
  '8': { tile: Tile.Madeira, marker: bando('bando_capanga_feira', 'capanga_do_capataz', 3, 3) },
  '9': { tile: Tile.Grama, marker: bando('bando_capanga_posto', 'capanga_do_capataz', 3, 3) },
  W: {
    tile: Tile.Madeira,
    marker: { id: 'elite_capanga_da_feira', kind: 'inimigo', ref: 'capanga_do_capataz', params: { tier: 'elite', affixes: ['blindado'], level: 4 } },
  },
  // cobrador normal (missão do posto: "cobrador_do_capataz, tier normal"), com a escolta de enemies.json
  I: { tile: Tile.Grama, marker: { id: 'cobrador_do_posto_norte', kind: 'inimigo', ref: 'cobrador_do_capataz', params: { tier: 'normal', level: 5 } } },
  L: { tile: Tile.Grama, marker: { id: 'cobrador_do_posto_sul', kind: 'inimigo', ref: 'cobrador_do_capataz', params: { tier: 'normal', level: 5 } } },
  // acampamento do Capataz
  '0': { tile: Tile.Terra, marker: bando('bando_capanga_curral', 'capanga_do_capataz', 3, 4) },
  O: { tile: Tile.Terra, marker: { id: 'cobrador_do_galpao', kind: 'inimigo', ref: 'cobrador_do_capataz', params: { tier: 'normal', level: 6 } } },
  E: {
    tile: Tile.Terra,
    marker: { id: 'elite_cobrador', kind: 'inimigo', ref: 'cobrador_do_capataz', params: { tier: 'elite', affixes: ['blindado'], level: 6 } },
  },
  // arena
  B: { tile: Tile.Areia, marker: { id: 'chefe_bruno_ferro', kind: 'chefe', ref: 'bruno_ferro_chefe', params: { arena: 'arena_do_capataz' } } },
};

// prettier-ignore
const LINHAS: readonly string[] = [
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~', // 0
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~===~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~b===~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~b===~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,===,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~~~~~~', // 5
  '~~,,,,TTTTTTssssssssssssssssssssssssssssssssss===sssssssssssssssssssssssssssssTTTTTT,,,,~~',
  '~~,,,TTTTTTTssssssssssssss@sssssssssssssssssss===sssssssssss@sssssssssssssssssTTTTTTT,,,~~',
  '~~,,TTTTTTTT;;ssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss;;TTTTTTTT,,~~',
  '~~,,TTTTTTTTT.ssssssssssssssssssssossssssssss.ssssssssssssssssssssssssssssssTTTTTTTTTT,,~~',
  '~~,,TTTTTTTT..ssssss.sssssssssssssssssssssssssssss@sssssssssssssssssss..oTTTTTTTTTTTTT,,~~', // 10
  '~~,,TTTTTTT.o.ssssssssssssssss@sssssssssssssssssssssssssssss.sssssssssssss.TTTTTTTTTTT,,~~',
  '~~,,TTTTTTT.....ssssssssssssssssssssssssossssssssssssssssssssssss..........TTTTTTTTTTT,,~~',
  '~~,,TTTTTT.;.....ssssssssssssssssss@ssssssssssssssssssssss..................;TTTTTTTTT,,~~',
  '~~,,TTTTTT........ssssssssssosssssssssssssssssssssssssssssssssosssssss.......TTTTTTTTT,,~~',
  '~~,,TTTTTT.o.....sssssssssssssssssssssssssssBsssssssssssssssssssssssssss.....TTTTTTTTT,,~~', // 15
  '~~,,TTTTTT......ssssssssssssss@sssssssssssssssssssssssssssssssssss...........TTTTTTTTT,,~~',
  '~~,,TTTTTTT......sssssssssosssssssssssssssssssssssss@sssssssssssssss.o......TTTTTTTTTT,,~~',
  '~~,,TTTTTTT;......ssssssssssssssssssssssosssssssssssssssssssssssss..........TTTTTTTTTT,,~~',
  '~~,,TTTTTTTT........ssssssssssssss@ssssssssssssssssssssssssso..............TTTTTTTTTTT,,~~',
  '~~,,TTTTTTTTo.........ssssssssssssssssssssssssssssssssssss................;TTTTTTTTTTT,,~~', // 20
  '~~,,TTTTTTTTT...........ssssss.sssssssssssssssssss.......................TTTTTTTTTTTTT,,~~',
  '~~,,TTTTTTTTTT;.........................o...............................TTTTTTTTTTTTTT,,~~',
  '~~,,TTTTTTTTTTT.............T...............................o.........TTTTTTTTTTTTTTTT,,~~',
  '~~,,TTTTTTTTTTTTT;................;...............................;TTTTTTTTTTTTTTTTTTT,,~~',
  '~~,,TTTTTTTTTTTTTTT.................TT..........................TTTTTTTTTTTTTTTTTTTTTT,,~~', // 25
  '~~,,TTTTTTTTTTTTTTTTT;;;......................................;;;TTTTTTTTTTTTTTTTTTTTT,,~~',
  '~~,,TTTTTTTTTTTTTTTTTTTT.......TTTTTTTTTTTTTTTTTTTTTTTT.......TTTTTTTTTTTTTTTTTTTTTTTT,,~~',
  '~~,,TTTTTTTTTTTTTTTTTTTT.......TTTTTTTTTTTTTTTTTTTTTTTT.......TTTTTTTTTTTTTTTTTTTTTTTT,,~~',
  '~~,,####################.......########################.......########################,,~~',
  '~~,,####################.......########################.......########################,,~~', // 30
  '~~,,:::::*::::::::::::::.......:::::::::;::::::::::::::.......::::::::::*:::::::::::::,,~~',
  '~~,,;:::::::;:::::::::::........;;;;::::::::::::::::::.........:::::::::::::::::;:::::,,~~',
  '~~,,::+++++++++++++++++:........::::::::o:::::::::::...........:::::::::::::::::::::::,,~~',
  '~~,,::+...............+:........::::::::::::......:::::################:::::::::::::::,,~~',
  '~~,,::+...............+.....................E..........#==============#...............,,~~', // 35
  '~~,,;;+.....o.........+.................o..............#======-=======#.....;;;;;;;;;;,,~~',
  '~~,,::+........0.......................................#==============#...............,,~~',
  '~~,,::+................................................#=======r======#...............,,~~',
  '~~,,::+...............+............o...................#==============#:::::::::::::::,,~~',
  '~~,,::+...%%%%........+................................#######D########:::::::::::::::,,~~', // 40
  '~~,,;;+...............+.............%%%%%%%%%%........................::::::::::::::::,,~~',
  '~~,,::+...............+...........%%%%%%%%%%%%%%............O...........::::::::::::::,,~~',
  '~~,,::++++++....+++++++..........%%%%%%%_%%%%%%%%.................o.......::::::::::::,,~~',
  '~~,,;;;;::::....::::::::..........%%%%%%%%%%%%%%........::::::::::::::::::::::::::::::,,~~',
  '~~,,::::::*::....;;;;;;;...........%%%%%%%%%%%......;;;;;;::::::::::::T:::::::::::::::,,~~', // 45
  '~~,,::::T:::.....:::::::::..........%%............::::::::::::::TT::::::::::::::::::::,,~~',
  '~~,,:::TTT:::.....::::::::::::......................::::::::::TTTT::::::::::::::::::::,,~~',
  '~~,,;;TTTT::::.....;:;::::::............o.........::::::::::TTTTTT::::::::::::::::::::,,~~',
  '~~,,::::;;;;::::::....::::::::::::::..........::::::::::::;;;;::::::::::::*:::::::::::,,~~',
  '~~,,:TTTT:::::::*:::::::::::::::::::.........:::::::::::::::TTTT::::::::::::::::::::::,,~~', // 50
  '~~,,TTTTTT::::::::::;::::::::::::::::........:::::::,,,,,,::::::::::::::::::::::::::::,,~~',
  '~~,,TTTTTTT;;;::::::::::T::::::::::::........:::::,,,~~~~,,,::::::::::::*:::::::::::::,,~~',
  '~~,,TTTTTT::::::::::::TT:::::::::::::........:::::,~~~~~~~,,,:::::::::::::::::::::::::,,~~',
  '~~,,;;;;T:::::::::*::::::::::::::::::........::::::,,,,,,,,,j:::::::::::::::::::::::::,,~~',
  '~~,,::::::::;:::::::::::::::::o:::::::.......:::::::::::::::::::::::::::::::::::::::::,,~~', // 55
  '~~,,::::::::::::::::::::::::::::::::..........::::::::::::::::::::;:::::::::::::::::::,,~~',
  '~~,,;;::::::::::::::*:::::::::::::::..........::::::::::::::::::::::::::::::::::T:::::,,~~',
  '~~,,::###############:::::::::::::::..........:::##############:::::::::::::::::::::::,,~~',
  '~~,,::#=============#:::::::::::::::..........:::#============#:::::::::::::::::::::::,,~~',
  '~~,,::#===c=========#:::::::::::::::..........:::#===cc=======#:::,,,,,,,,,,,,,,,,,,,,,,~~', // 60
  '~~,,::#=============#:::::::::::::::..........:::#============#::,,,,,,,,,,,,,,,,,,,,,,,~~',
  '~~,,::#=======l=====#:::::::I:::::::..........:::#======l=====#:,,,,,,==============,,,,~~',
  '~~,,::#=============#:::::::::::::::..........:::#============#:,,,,==================,,~~',
  '~~,,::#=============#:::::::::::::::..........:::#######D######=======================,,~~',
  '~~,,::#=============#:::::::::::::::....................A.....========hh====hh========,,~~', // 65
  '~~,,::#######D#######:::::::::::::::..........................========================,,~~',
  '~~,,:::::::.UQ.:::::;:::::::::::::::..........::::o:::::::::::====h=====F=====h=======,,~~',
  '~~,,::::..........::::::::::::::::::..........::::::::::::::::======G===========W=====,,~~',
  '~~,,::::::9:::::::::::;:::::::::::::..........::::::::::::::==========================,,~~',
  '~~,,;;::::::::::::::::::+++++++++++:..........::::::*:::::::====hh========8===========,,~~', // 70
  '~~,,::::::::*:::::::::::+sssssssss+...........::::::::::::============================,,~~',
  '~~,,::::::::::::::::L:::+sssssssss+...........::::::::::,,,,==========================,,~~',
  '~~,,;;;;::::::::::::::::+ssssRssss............::::::::,,,,,,==========c===============,,~~',
  '~~,,::::::::::::o:::::::+sssssssss............::::::,,,,,,,,,,========================,,~~',
  '~~,,::::::::::::::::::::+sssssssss+...........::::::,,,,,,,,,,,,======================,,~~', // 75
  '~~,,::::::*:::::::::::::+++++++++++:::........::::,,,,,,,,,,,,,,,,==============,,,,,,,,~~',
  '~~,,;;::::::::::::::::::::::::7:::::::........::,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~~',
  '~~,,ssss::::::::::::;:::::::::::::::::........ssss,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~~',
  '~~,,,,ssssssss@sssssssssssssssssssssss........ssssss,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~~',
  '~~,,,,,,,,ssssssssss,,,,,,,,,,,,,,,,,,=========,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~~', // 80
  '~~~~,,,,,,,,j,,,,,,,,,,,,,,,,,~~~~~~~~=========~~~~~~~~~,,,,,,,,,,,,,,j,,,,,,,,,,,,,,,,,~~',
  '~~~~,,,,,,~~~~~~~~~~~~~~~~~~~~~~~~~~~~=========~~~~~~~~~~~~~~~~~~~,,,,,,,,,,,,,,,,,,,,,,~~',
  '~~~~,,,,~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~=========~~~~~~~~~~~~~~~~~~~~~~~,,,,,,,,,,,,,,,,,,~~',
  '~~,,,,,,,,====,,,,,,,,,,,,,,,,,,,,,,,,=========,,,,,,,,,,,,,,,,,,,,,,,====,,,,,,,,,,,,,,~~',
  '~~,,,,,,========,,,,,,,,,,,,,,,,,,,,=============,,,,,,,,,,,,,,,,,,,========,,,,,,,,,,,,~~', // 85
  '~~,,,,,,==========================================================,,========,,,,,,,,,,,,~~',
  '~~,,,,,,=#######========================#############=====########,,========,,,,,,,,,,,,~~',
  '~~,,,,,,=#=====#========================#==M========#=====#======#,,========,,,,,,,,,,,,~~',
  '~~,,,,,,=#=====#========================#===========#=====#======#,,========,,,,,,,,,,,,~~',
  '~~,,,,,,=#=====#========-===============#=======K===#-====#======#,,========,,,,,,,,,,,,~~', // 90
  '~~,,,,,,=###D###========================#=====J=====#=====###D####,,========,,,,,,,,,,,,~~',
  '~~,,,,,,================================#===c=======#=============,,========,,,,,,,,,,,,~~',
  '~~,,,,==================================#===========#=================#########,,,,,,,,,~~',
  '~~,,,,================#########=========######D######=================#=======#,,,,,,,,,~~',
  '~~,,,,================#=======#===============P=======================#=======#,,,,,,,,,~~', // 95
  '~~,,,,================#=======#=============================hhhhh=====#=======#,,,,,,,,,~~',
  '~~,,,,================#====r==#===============================H=======#=======#,,,,,,,,,~~',
  '~~,,,,================####D####=======================================####D####,,,,,,,,,~~',
  '~~,,======================V=======================================,,,,,,,,,,,,,,,,,,,,,,~~',
  '~~b~====Y=========================================,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~~', // 100
  '~~b~=X=C======Z=====,,,,,,,,,,,,========,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~~',
  '~~~~========N=======,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~~',
  '~~~~-===============,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~~',
  '~~~~~~,,,,,,,,,,,,,,======,,,,,,,,,,,,,,========,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~~',
  '~~~~~~~~,,,,,,,,,,,,======,,,,~~~~~~~~~~========~~~~~~~~~~,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~~', // 105
  '~~~~,,,,,,,,,,,,,,,,======,,~~~~~~~~~~~~========~~~~~~~~~~~~~~~~,,,,,,,,,,,,,,,,,,,,,,,,~~',
  '~~,,,,ssssssssssssss======ssssssssssssss========ssssssssssssssssss,,,,,,,,,,,,,,,,,,,,,,~~',
  '~~,,ssssss;;;;::::::......::::::::;;;;..........::::::::;;;;;;ssssssss@sssssssssssssss,,~~',
  '~~,,;;;;T:::%%%%%%;;......;;;;;;T;;;;;..........;;;;;;TTT;;;;;;;::::::::::*:::::::::::,,~~',
  '~~,,TTT;;;%%%%%%%%%%%%.....;;;%%%%%%............;;;;%%%%%%%%;;;;;;T:::::::::::::::::::,,~~', // 110
  '~~,,TTTT%%%%%%_%%%%%%%%%....%%%%%%%%%%%%.......%%%%%%%%%%%%%%%;;;;;;;;TT;;;;;;;;;;;;;;,,~~',
  '~~,,TTTT;;;;%%%%%%%%;;;;;;....1.....%%%%......;;;;;;;;%%%%2%%%%%;;;;;;;;;;TTTT;;;;;;;;,,~~',
  '~~,,TT;;;;;;%%%%%%%%................%%%%%%;;;;;;;;%%%%%%%%%%%%%%%%;;;;;;TTTTTTTT;;;;;;,,~~',
  '~~,,;;;;TTT,,,,,,,,,%%%%%%........;;;;,,,,,,,,,,j,,,,,%%%%%%%%%%;;;;;;TTTTTTTTTTTT;;;;,,~~',
  '~~,,TTTTTT,,,,~~~~,,,,%%%%%%......,,,,,,~~~~~~,,,,,,%%%%%%%%::::::::TTTTTTTTTTTTTTTT;;,,~~', // 115
  '~~,,TTTTTTTT,,~~~~~,,,;;;;........,,,,,,~~~~~~~,,,;;;;;;::::::::::TTTTTT::::::::::::::,,~~',
  '~~,,TTTTTT;;;;,,,,j,,,;;;;;;......,,,,,,,,~~~~,,,,TTTT;;;;;;%%%%%%%%%%;;;;;;;;;;;;;;;;,,~~',
  '~~,,;;TTT%%%%%%%;;;;;;TT;;;;......;;;;;;,,,,,,;;;;TTTTTT;;;;;;%%%%%%%%%%;;;;;;TTTT;;;;,,~~',
  '~~,,;;;;%%%%%%%%%%%%;;;;;;..........%%%%%%%%;;;;;;;;TT;;;;;;%%%%%%%%%%%%%%;;;;;;TTTT;;,,~~',
  '~~,,T;;;%%%%%%%%%%%%%%%%............%%%%%%::::::::;;;;;;%%%%%%%%%%%%%%%%%%%%;;;;;;;;;;,,~~', // 120
  '~~,,TT;;%%%%%_%%%%%%;;;;;;........::::::::::%%%%%%%%;;;;;;%%%%%%%%_%%%%%%%%%%%;;;;;;;;,,~~',
  '~~,,TTT;;;%%%%%%3%%%%%;;;;;;......;;;;;;%%%%%%%%4%%%%%%%;;;;;;%%%%%%%%%%5%%%%%TTTT;;;;,,~~',
  '~~,,TTTT;;%%%%%%%%%%%%%%;;;;......;;%%%%%%%%%%%%%%%%%%%%%%;;;;;;%%%%%%%%%%%%%%TTTTTT;;,,~~',
  '~~,,TTTTT;;;%%%%%%%%%%;;;;TT......;;;;;;%%%%%%%%%%%%%%;;;;;;;;%%%%%%%%%%%%;;;;;;TTTTTT,,~~',
  '~~,,TTTTTT,,,,,,;;;;;;TTTT;;......,,,,,,,,;;;;;;TTTT;;;;;;,,,,,,,,;;;;;;TTTTTTTTTTTTTT,,~~', // 125
  '~~,,TTTT,,,,,,~~~,,,;;;;::::......,,,,~~~~~~,,;;;;;;TT;;;;,,,,~~~~,,,,;;;;;;TTTTTTTTTT,,~~',
  '~~,,TTTT,,,,~~~~~~,,,,;;;;;;......,,,~~~~~~~~,,,;;;;;;;;;;,,~~~~~~~,,,;;;;;;;;TTTTTTTT,,~~',
  '~~,,TTTTT,,,,j,,,,;;;;;;;;........;;,,,,j,,,,,;;;;;;;;;;,,,,,,j,,,,,;;;;;;;;;;;;TTTTTT,,~~',
  '~~,,TTTTTT;;;;;;;;%%%%%%;;;;......;;;;;;;;;;%%%%%%;;;;;;;;;;%%%%%%%%%%;;;;;;;;TTTTTTTT,,~~',
  '~~,,TTTT;;;;;;%%%%%%%%_%%%%%......%%%%%%%%%%%%%%;;;;;;%%%%%%%%%%%%;;;;;;;;;;TTTTTTTTTT,,~~', // 130
  '~~,,TTTT;;;;%%%%%%%%%%%%%%%%%%%%%%%%;;;;;;;;%%%%%%%%%%%%%%_%%%%%%%%%%%;;;;TTTTTTTTTTTT,,~~',
  '~~,,TTTT;;;;%%%%%%%%%%%%%%%%%%6%%%%%%%%%;;;;;;%%%%%%%%%%%%%%e%%%%%%%%%;;;;TTTTTTTTTTTT,,~~',
  '~~,,TTTTT;;;%%%%%%%%%%%%%%%%%%%%%%%%%%;;;;;;%%%%%%%%%%%%%%%%%%%%%%%%;;;;TTTTTTTTTTTTTT,,~~',
  '~~,,TTTTTT;;;;%%%%%%;;;;;;%%%%%%%%%%TT;;;;;;;;%%%%%%%%%%%%%%%%%%%%;;;;TTTTTTTTTTTTTTTT,,~~',
  '~~,,TTTTTTTT;;;;;;TTTT;;;;;;;;TTTT;;;;;;;;;;;;;;;;TTTT;;;;;;;;;;TTTTTTTTTTTTTTTTTTTTTT,,~~', // 135
  '~~,,TTTTTTTTTTTT;;TTTTTTTTTTTTTTTT;;;;;;TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT,,~~',
  '~~,,TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT,,~~',
  '~~,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
];

export const DELTA: AsciiMapDef = {
  id: 'delta',
  legend: LEGENDA,
  rows: LINHAS,
  regions: [{ regionId: 'delta', x: 0, y: 0, w: 90, h: 140 }],
};
