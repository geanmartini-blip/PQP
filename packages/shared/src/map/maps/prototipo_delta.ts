/**
 * Mapa do protótipo da Fase 1: um pedaço do Delta (Narrativa.md, "O Delta: níveis 1 a 7").
 * "Rio abaixo, a vila de palafitas onde todo mundo começa e onde ninguém tem lado."
 *
 * 56 x 84 tiles, em retrato. Lê-se de baixo para cima:
 * - Sul (y 62 a 81): as palafitas sobre água rasa, o cadastro do Seu Jacó, o spawn, Wesley e Li Wei
 *   e o cais que entra na água funda. Duas passarelas levam à terra firme (a do meio e a da esquerda).
 * - Mangue (y 44 a 61): lamaçal, canal de água rasa com ponte de tábua, lagoa funda e árvores.
 *   Dois bandos de siris, um em cada lado da trilha.
 * - Acampamento do Capataz (y 29 a 43): curral cercado com porteiras, galpão, pedras e lama.
 *   Dois bandos de capangas e o Cobrador (elite) entre os dois portões do muro.
 * - Muro (y 27 e 28) com dois portões: caminhos alternativos para a arena.
 * - Arena (y 2 a 26): clareira de terra e areia cercada de árvores, aberta para desviar dos avisos
 *   no chão, com o trapiche onde Bruno Ferro amarrou o barco do vizinho.
 *
 * SUGESTÃO: o desenho do mapa, a posição de cada coisa e o tamanho dos bandos são do protótipo;
 * os docs só dizem que o Delta é uma vila de palafitas e que o chefe do nível 7 é Bruno Ferro.
 */
import { Tile } from '../types';
import type { AsciiLegendEntry, AsciiMapDef } from './ascii';
import { Deco } from './deco';

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
  // marcadores
  P: { tile: Tile.Madeira, marker: { id: 'spawn', kind: 'spawn_jogador' } },
  W: { tile: Tile.Madeira, marker: { id: 'npc_wesley', kind: 'npc', ref: 'wesley' } },
  L: { tile: Tile.Madeira, marker: { id: 'npc_li_wei', kind: 'npc', ref: 'li_wei' } },
  J: { tile: Tile.Madeira, marker: { id: 'npc_seu_jaco', kind: 'npc', ref: 'seu_jaco' } },
  C: { tile: Tile.Madeira, marker: { id: 'lugar_cais', kind: 'lugar', ref: 'cais_do_delta' } },
  V: { tile: Tile.Madeira, marker: { id: 'lugar_palafitas', kind: 'lugar', ref: 'palafitas_do_delta' } },
  // SUGESTÃO: n de cada bando, dentro do mínimo e máximo de enemies.json (siri 3 a 5, capanga 2 a 3).
  '1': { tile: Tile.Lama, marker: { id: 'bando_siri_lamacal', kind: 'bando', params: { inimigos: ['siri_do_mangue'], n: 3 } } },
  '2': { tile: Tile.Grama, marker: { id: 'bando_siri_canal', kind: 'bando', params: { inimigos: ['siri_do_mangue'], n: 4 } } },
  '3': { tile: Tile.Terra, marker: { id: 'bando_capanga_curral', kind: 'bando', params: { inimigos: ['capanga_do_capataz'], n: 2 } } },
  '4': { tile: Tile.Terra, marker: { id: 'bando_capanga_galpao', kind: 'bando', params: { inimigos: ['capanga_do_capataz'], n: 3 } } },
  // SUGESTÃO: o afixo do Cobrador (blindado está entre os afixosPossiveis dele).
  E: {
    tile: Tile.Terra,
    marker: { id: 'elite_cobrador', kind: 'inimigo', ref: 'cobrador_do_capataz', params: { tier: 'elite', affixes: ['blindado'] } },
  },
  B: { tile: Tile.Areia, marker: { id: 'chefe_bruno_ferro', kind: 'chefe', ref: 'bruno_ferro_chefe' } },
};

// prettier-ignore
const LINHAS: readonly string[] = [
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~', // 0
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~====~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~==========~~~~~~~~~~~~~~~~~~~~~~~',
  '~~TTTTTTTTTTTTTTTTTTT..==========....TTTTTTTTTTTTTTTTT~~',
  '~~TTTTTTTTTTTTTTTT.....==========.....T.TTTTTTTTTTTTTT~~', // 5
  '~~TTTTTTTTTTTTT..o.....................o....TTTTTTTTTT~~',
  '~~TTTTTTTTT...................................TTTTTTTT~~',
  '~~TTTTTTTT............s.ssssssssss............TTTTTTTT~~',
  '~~TTTTTTTTo.........sssssssssssssssss.........TT.TTTTT~~',
  '~~TTTTTT........s.ssss@ssssssssssss@ssss......o.TTTTTT~~', // 10
  '~~TTTTTT.......sssssssssssssssssssssssssss........TTTT~~',
  '~~TTTTTT.....ssssssssssssssssssssssssssss@........TTTT~~',
  '~~TTTTT.......ssssssssssssssssssssssssssssss......TTTT~~',
  '~~TTTTT......sssssssssssssssBsssssssssssssss......TTTT~~',
  '~~TTTTT......sssssssssssssssssssss@sssssssss......TTTT~~', // 15
  '~~TTTTT......ssssssss@sssssssss@sssssssssss.......TTTT~~',
  '~~TTTTTT.....sssssssssssssssssssssssssssssss......TTTT~~',
  '~~TTTTT.......ssssssssssssssssssssssssssssss.....TTTTT~~',
  '~~TTTTT.T......ssssssss@ssssssssssssssssss......TTTTTT~~',
  '~~TTTTTTT.........sssssssssssssssssssssss........TTTTT~~', // 20
  '~~TTTTTTT.To........ssssssss@ssssss@ss.......o.TTTTTTT~~',
  '~~TTTTTTT.TT............sssss@s.s.ss...........TTTTTTT~~',
  '~~TTTTTTTTTT..................................TTTTTTTT~~',
  '~~TTTTTTTTTTTTT...........................T.TTTTTTTTTT~~',
  '~~TTTTTTTTTTTTTT.T....................TT.TTTTTTTTTTTTT~~', // 25
  '~~TTTTTTTTTTTTTTTT......TT............TTTTTTTTTTTTTTTT~~',
  '~~################....############....################~~',
  '~~################....############....################~~',
  '~~:::*:::::;::::::;:::;;:::::;::;:;;:::::;:;:;::;::;::~~',
  '~~:;;:;::::::::::;*.:;o:.....o...:..#######:::::::::;*~~', // 30
  '~~;:::::::::...............E........#######::::o::::T:~~',
  '~~;:**::::::........................#######...:*::::T:~~',
  '~~;::::+++++++++++++................#######...o..:::T:~~',
  '~~:T;:.+...........+................###D###......:oTT;~~',
  '~~:T::.+...........+.........o.....................TTT~~', // 35
  '~~:T::.+................................o..o.......TTT~~',
  '~~;TT:.+.....3...................o.................TTT~~',
  '~~TTT::+..............o.......%...o................TT:~~',
  '~~TTT::+...........+....o...%%%%%..o........4.....::T:~~',
  '~~:T:;;+;::........+.......%%%%%%%......o.....::::;:T:~~', // 40
  '~~:T:::++++++...++++....T...%%%%%.o.......:.::T;::::T;~~',
  '~~:T:::;::;::::;;:;::..TTT..o.%%..::;o:::::::TTT::::;:~~',
  '~~::~;:;:;:;::::;::::::;T*;::::::::::::;:;:::;T:;;~:::~~',
  '~~:~~~::;:::;:::::*;;T;:;:;..;:::::::;:T:;:::T**~~~~~:~~',
  '~~~~~~~::::::*:::T:;TTT::*:..;::;:::;TTTTT:::;:~~~~~~~~~', // 45
  '~~~~~~~::::::*:;TTTTTTTT::;..:;::::::;:T:::::;~~~~~~~~~~',
  '~~~~~~~;;:::*;:::T::TTT::::..=:::;::::::::::;:~~~~~~~~~~',
  '~~;~~~T:::::;T;::::;:T,,,,,..=,,,,,,::::::;:::~~~~~~~~~~',
  '~~,:~TTT;::;T:;::,,,,,,,,,,=..,,,,,,,,,,;;:::;:~~~~~~~~~',
  '~~,,,,T,,,,,,,,,,,,,,,,,,,,=..,,,,,,,,,,,,,,,,,,~~~~~,~~', // 50
  '~~,,,,,,,,,,,,,,,,,,,::T:*:=..:::::;,,,,,,,,,,,,,~~~,,~~',
  '~~:,,,,,,,,,,,,,,%::*:;::::=..;::::::;::,,,,,,,,,,,,,,~~',
  '~~:;:*%%%%%%%%%%%%%:T:;T;:::;..:::;:::T;:;2*::::T:;:::~~',
  '~~;:*:%%%%%%%%%%%%%%*:;::::::..::;::;:::;::::;:TTTT:::~~',
  '~~:::%%%%_%%%%%%%%%%:::T::;:;...TT::::;:::;:T:TTTTT:::~~', // 55
  '~~;::%%%%%_%1%%%%%%%:;:T;;:::...=:T;:;;::TTTTT:TTT::::~~',
  '~~:;:;%__%%%%%%%%%%:::TTT::;:...=:*T:*;:::TTTTT:T:::::~~',
  '~~:;::::_%%%%%%%%%::::;T:::::...=TTTTT::*::TTT:::*:::;~~',
  '~~:s::;ss%%%%%%s:::::ssTss:s:...=ssTss:ss::sT@ss:s::*s~~',
  '~~sss::==s::sss:;s:s::ss;ss:s...=@;ss:s:s;s:ss;:::;*ss~~', // 60
  '~~sssss@ssss@ssss@sssssssssssssss@ssssssssssssssssssss~~',
  '~~,,,,,==,,,,,,,,,,,,,,,,,,,,,===,,,,,,,,,,,,,,,,,,,,,~~',
  '~~,,,~~==,,,,,,,,,,,########,,===,,,,,,,,,,,,,,,,,,,,,~~',
  '~~,~~~~==~,,,,,,,,,,#======#,,===,,,,,,,,,,,,,,,,,,,,,~~',
  '~~,~~~~==~,######,,,#======#,,===,,,,,,######,,,,,,,,,~~', // 65
  '~~~~~~~==~~######,,,#===J==#,,===,,,,,,######,,,,~~~,,~~',
  '~~,~~~~==~,######,,,#======#,,===,,,,,,######,,,~~~~~,~~',
  '~~,~~~~==~,######,,,####D###,,===,,,,,,######,,~~~~~~~~~',
  '~~,,,~~====######======================######=~~~~~~~~~~',
  '~~,,,,,=======================================~~~~~~~~~~', // 70
  '~~,,,,,,,,=============W=======L==============~~~~~~~~~~',
  '~~,,,,,,,,====V===-========P==================,~~~~~~~~~',
  '~~,,,,,,,,====================================,~~~~~~,~~',
  '~~,,,,,,,,=========================-==========,,,~~,,,~~',
  '~~,,,,,,,,====================================,,,,,,,,~~', // 75
  '~~,,,,,,,,++++++++++++++++===+++++++++++++++++,,,,,,,,~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~===~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~===~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~=C=~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~===~~~~~~~~~~~~~~~~~~~~~~~~~~~', // 80
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
];

export const PROTOTIPO_DELTA: AsciiMapDef = {
  id: 'prototipo_delta',
  legend: LEGENDA,
  rows: LINHAS,
  regions: [{ regionId: 'delta', x: 0, y: 0, w: 56, h: 84 }],
};
