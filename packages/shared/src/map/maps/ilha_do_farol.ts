/**
 * Ilha do Farol (v0.4), 48 x 40 tiles: "a antiga rádio da cidade unida. De lá a Eco transmite,
 * ninguém sabe como". Área neutra pequena, no meio do Rio Claro, que se alcança de barco pela barragem
 * da Usina da Ponte.
 *
 * Ilha de areia e grama com o píer no sul. No alto, o farol; no meio, o prédio do Arquivo da rádio,
 * com as três antenas em volta (alvo da missão 'sintonizar'). Enguias na água rasa e os homens do
 * Sombra rondando o arquivo.
 *
 * Convenções: as mesmas de margem_esquerda.ts.
 *
 * SUGESTÃO: o mapa inteiro (desenho, píer, antenas, bandos) é da v0.4; os docs só dizem o que é a ilha.
 */
import { Tile } from '../types';
import type { AsciiLegendEntry, AsciiMapDef } from './ascii';
import { Canvas, cellsOf, mk } from './canvas';
import { Deco } from './deco';

const W = 48;
const H = 40;

const LEGENDA: Record<string, AsciiLegendEntry> = {
  '~': { tile: Tile.AguaFunda },
  ',': { tile: Tile.AguaRasa },
  s: { tile: Tile.Areia },
  ':': { tile: Tile.Grama },
  '.': { tile: Tile.Terra },
  '=': { tile: Tile.Madeira },
  '#': { tile: Tile.Parede },
  T: { tile: Tile.Arvore },
  o: { tile: Tile.Pedra },
  q: { tile: Tile.Maquina },
  D: { tile: Tile.Porta },
  // decoração
  '*': { tile: Tile.Grama, deco: Deco.Flor },
  j: { tile: Tile.AguaRasa, deco: Deco.Junco },
  b: { tile: Tile.AguaFunda, deco: Deco.Barco },
  l: { tile: Tile.Madeira, deco: Deco.Lanterna },
  c: { tile: Tile.Madeira, deco: Deco.Caixote },
};

const bando = (id: string, inimigo: string, n: number, level: number, x: number, y: number) => mk(id, 'bando', x, y, undefined, { inimigos: [inimigo], n, level });

function build(): AsciiMapDef {
  const c = new Canvas(W, H, '~');

  // a ilha: água rasa, areia e grama
  c.ellipse(24, 19, 21, 16, ',');
  c.ellipse(24, 19, 18, 13, 's');
  c.ellipse(24, 18, 15, 10, ':');
  // píer no sul, com o barco amarrado
  c.rect(22, 30, 4, 9, '=').set(21, 37, 'b').set(26, 37, 'b').set(25, 33, 'l');
  // trilha do píer até o farol
  c.rect(23, 6, 2, 25, '.');
  // o farol (torre redonda) no alto
  c.building(20, 3, 8, 7, '#', '=', [[23, 9], [24, 9]]);
  c.set(21, 4, 'l').set(26, 4, 'l');
  // o Arquivo da rádio no meio, com as antenas em volta
  c.building(12, 13, 10, 8, '#', '=', [[21, 16], [21, 17]]);
  c.set(13, 14, 'c').set(13, 19, 'c');
  const antenas: [number, number][] = [[30, 13], [33, 20], [16, 24]];
  for (const [x, y] of antenas) c.set(x, y, 'q');
  c.set(36, 14, 'o').set(10, 22, 'o');

  const markers = [
    // entrada (a primeira é a padrão: o píer) e o barco de volta para a barragem da Usina
    mk('spawn', 'spawn_jogador', 24, 31, undefined, { de: 'usina_da_ponte' }),
    mk('saida_usina_da_ponte', 'saida', 24, 38, 'usina_da_ponte', { para: 'usina_da_ponte', spawn: 'spawn_ilha', barco: true }),
    // lugares
    mk('lugar_farol_da_ilha', 'lugar', 24, 10, 'farol_da_ilha'),
    mk('npc_faroleiro_aposentado', 'npc', 26, 11, 'faroleiro_aposentado', { lugar: 'farol_da_ilha' }),
    mk('lugar_arquivo_da_ilha_do_farol', 'lugar', 22, 17, 'arquivo_da_ilha_do_farol'),
    mk('pc_ilha_do_farol', 'ponto_controle', 24, 24, 'pc_ilha_do_farol'),
    // antenas da rádio velha (alvo de 'sintonizar')
    ...antenas.map(([x, y], i) => mk(`antena_do_farol_${i + 1}`, 'porta', x, y + 1, 'antena_do_farol', { interagir: 'antena_do_farol', acao: 'sintonizar', lugar: 'farol_da_ilha' })),

    // inimigos: enguias na beira, homens do Sombra em volta do arquivo
    bando('bando_enguia_leste', 'enguia_eletrica', 3, 10, 41, 19),
    bando('bando_enguia_oeste', 'enguia_eletrica', 3, 10, 6, 17),
    bando('bando_enguia_sul', 'enguia_eletrica', 3, 10, 14, 32),
    bando('bando_mercenario_arquivo', 'mercenario_do_sombra', 3, 11, 16, 11),
    bando('bando_mercenario_antenas', 'mercenario_do_sombra', 2, 11, 34, 24),
    mk('elite_mercenario_blindado', 'inimigo', 10, 18, 'mercenario_do_sombra', { tier: 'elite', affixes: ['blindado'], level: 12 }),
  ];

  c.scatter('T', 0.05, 701, ':', cellsOf(markers), 2);
  c.sprinkle('*', 0.06, 702, ':');
  c.sprinkle('j', 0.2, 703, ',');

  return {
    id: 'ilha_do_farol',
    legend: LEGENDA,
    rows: c.rows(),
    regions: [{ regionId: 'ilha_do_farol', x: 0, y: 0, w: W, h: H }],
    extraMarkers: markers,
  };
}

export const ILHA_DO_FAROL: AsciiMapDef = build();
