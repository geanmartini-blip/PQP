/**
 * Usina da Ponte (Fase 3), 100 x 56 tiles: a região de regions.json (x 96, y 150, w 48, h 24) em
 * escala 2, com as posições de places.json e structures.json na mesma escala. "O coração da cidade,
 * metade ponte e metade barragem, com um posto de controle de cada margem nas pontas."
 *
 * O Rio Claro corre no meio; a ponte atravessa de oeste (Margem Esquerda, barranco de grama) a leste
 * (Margem Direita, cais de concreto). Em cima da ponte, o Estádio das Margens, o Marco do Tenente
 * Vidal e o Câmbio; embaixo, a barragem com as turbinas e a escada de manutenção que desce para as
 * Galerias da Usina; o Museu no barranco oeste e o Teatro Abandonado na cabeceira leste.
 *
 * Convenções: as mesmas de margem_esquerda.ts. Os postos de controle ficam nas pontas, cada um com o
 * alvo 'posto_de_controle_rival' (colar o cartaz) do lado.
 *
 * SUGESTÃO: o desenho, a escala 2, os bandos (nível, tamanho, afixos), os cambistas do Capataz no
 * estádio (capanga_do_capataz é de delta e juncal em enemies.json) e o Sombra na escada das galerias
 * são do mapa.
 */
import { Tile } from '../types';
import type { AsciiLegendEntry, AsciiMapDef } from './ascii';
import { Canvas, cellsOf, mk } from './canvas';
import { Deco } from './deco';

const W = 100;
const H = 56;

const LEGENDA: Record<string, AsciiLegendEntry> = {
  '~': { tile: Tile.AguaFunda },
  ',': { tile: Tile.AguaRasa },
  '.': { tile: Tile.Concreto },
  _: { tile: Tile.Asfalto },
  ':': { tile: Tile.Grama },
  a: { tile: Tile.Grama },
  t: { tile: Tile.Terra },
  '=': { tile: Tile.Madeira },
  '#': { tile: Tile.Parede },
  T: { tile: Tile.Arvore },
  o: { tile: Tile.Pedra },
  g: { tile: Tile.Grade },
  q: { tile: Tile.Maquina },
  D: { tile: Tile.Porta },
  // decoração
  '*': { tile: Tile.Grama, deco: Deco.Flor },
  j: { tile: Tile.AguaRasa, deco: Deco.Junco },
  h: { tile: Tile.Concreto, deco: Deco.Toldo },
  v: { tile: Tile.Concreto, deco: Deco.Letreiro },
  z: { tile: Tile.Asfalto, deco: Deco.Lixo },
  c: { tile: Tile.Concreto, deco: Deco.Caixote },
};

const bando = (id: string, inimigo: string, n: number, level: number, x: number, y: number, extra: Record<string, unknown> = {}) =>
  mk(id, 'bando', x, y, undefined, { inimigos: [inimigo], n, level, ...extra });

function build(): AsciiMapDef {
  const c = new Canvas(W, H, '~');

  // barrancos: grama a oeste (Esquerda), concreto a leste (Direita), água rasa na beira
  c.rect(1, 1, 13, 54, ':').rect(14, 1, 1, 54, ',');
  c.rect(86, 1, 13, 54, '.').rect(85, 1, 1, 54, ',');
  c.rect(1, 1, 2, 54, 'T').rect(1, 24, 2, 4, ':');
  // a ponte
  c.rect(10, 18, 80, 16, '.').rect(10, 24, 80, 4, '_');
  c.rect(10, 18, 80, 1, 'g').rect(10, 33, 16, 1, 'g').rect(74, 33, 16, 1, 'g');
  c.rect(10, 18, 4, 1, '.').rect(86, 18, 4, 1, '.').rect(47, 18, 6, 1, '.');
  // Estádio das Margens, em cima da ponte
  c.rect(34, 2, 33, 16, '.');
  c.building(36, 3, 29, 14, '#', 'a', [[49, 16], [50, 16]]);
  c.rect(38, 5, 25, 1, 't').rect(38, 14, 25, 1, 't');
  // Museu da Cidade Unida, no barranco oeste
  c.building(3, 3, 10, 9, '#', '=', [[6, 11], [7, 11]]);
  // Marco do Tenente Vidal e Câmbio da Ponte
  c.set(28, 19, 'o');
  c.rect(54, 19, 5, 1, 'h');
  // barragem: passarela, turbinas, corredor e a plataforma da escada das galerias
  c.rect(26, 34, 48, 2, '.').rect(26, 36, 48, 4, 'q').rect(46, 36, 3, 6, '.');
  c.rect(38, 42, 20, 8, '.').rect(58, 42, 12, 8, ',');
  c.set(66, 43, 'j').set(60, 48, 'j');
  // v0.4: píer da barragem, de onde sai o barco para a Ilha do Farol
  c.rect(64, 47, 3, 8, '=');
  // Teatro Abandonado, na cabeceira leste
  c.building(87, 38, 11, 11, '#', '=', [[91, 38], [92, 38]]);
  c.set(95, 44, 'c');

  const markers = [
    // entradas (a primeira é a padrão)
    mk('spawn_esquerda', 'spawn_jogador', 5, 26, undefined, { de: 'margem_esquerda' }),
    mk('spawn_direita', 'spawn_jogador', 94, 26, undefined, { de: 'margem_direita' }),
    // saídas
    mk('saida_margem_esquerda', 'saida', 1, 26, 'margem_esquerda', { para: 'margem_esquerda', spawn: 'spawn_usina' }),
    mk('saida_margem_direita', 'saida', 98, 26, 'margem_direita', { para: 'margem_direita', spawn: 'spawn_usina' }),
    mk('spawn_ilha', 'spawn_jogador', 65, 49, undefined, { de: 'ilha_do_farol' }),
    mk('saida_ilha_do_farol', 'saida', 65, 54, 'ilha_do_farol', { para: 'ilha_do_farol', spawn: 'spawn', barco: true }),
    // pontos de controle nas pontas e o cartaz do lado
    mk('pc_ponte_esquerda', 'ponto_controle', 8, 22, 'pc_ponte_esquerda', { margem: 'esquerda' }),
    mk('pc_ponte_direita', 'ponto_controle', 91, 22, 'pc_ponte_direita', { margem: 'direita' }),
    mk('cartaz_pc_ponte_esquerda', 'porta', 8, 30, 'posto_de_controle_rival', { interagir: 'posto_de_controle_rival', acao: 'colar_cartaz', ponto: 'pc_ponte_esquerda' }),
    mk('cartaz_pc_ponte_direita', 'porta', 91, 30, 'posto_de_controle_rival', { interagir: 'posto_de_controle_rival', acao: 'colar_cartaz', ponto: 'pc_ponte_direita' }),
    // lugares
    mk('lugar_estadio_das_margens', 'lugar', 50, 9, 'estadio_das_margens'),
    mk('lugar_museu_da_cidade_unida', 'lugar', 7, 12, 'museu_da_cidade_unida'),
    mk('lugar_marco_do_tenente_vidal', 'lugar', 28, 21, 'marco_do_tenente_vidal'),
    mk('lugar_cambio_da_ponte', 'lugar', 56, 21, 'cambio_da_ponte'),
    mk('npc_cambista_da_ponte', 'npc', 58, 21, 'cambista_da_ponte', { lugar: 'cambio_da_ponte' }),
    mk('lugar_barragem_da_usina', 'lugar', 40, 34, 'barragem_da_usina'),
    mk('npc_dalva_rocha', 'npc', 36, 34, 'dalva_rocha', { lugar: 'barragem_da_usina' }),
    mk('painel_de_distribuicao', 'quadro_missoes', 52, 34, 'painel_de_distribuicao', { interagir: 'painel_de_distribuicao', acao: 'ler', lugar: 'barragem_da_usina' }),
    mk('lugar_entrada_galerias_da_usina', 'lugar', 48, 44, 'entrada_galerias_da_usina'),
    mk('masmorra_galerias_da_usina', 'masmorra', 48, 47, 'galerias_da_usina', { lugar: 'entrada_galerias_da_usina' }),
    mk('lugar_teatro_abandonado', 'lugar', 92, 37, 'teatro_abandonado'),
    // SUGESTÃO: o Seu Jacó amarra o barco na ponte (npcs.json: delta e usina_da_ponte)
    mk('npc_seu_jaco_ponte', 'npc', 16, 30, 'seu_jaco', { lugar: 'usina_da_ponte' }),
    // SUGESTÃO: o Sombra vigia a escada das galerias
    mk('npc_o_sombra', 'npc', 54, 48, 'o_sombra', { lugar: 'entrada_galerias_da_usina' }),

    // inimigos: mercenários do Sombra na ponte, turbina na passarela, enguias na água rasa
    bando('bando_mercenario_oeste', 'mercenario_do_sombra', 2, 10, 34, 29),
    bando('bando_mercenario_leste', 'mercenario_do_sombra', 3, 11, 72, 22),
    bando('bando_mercenario_galerias', 'mercenario_do_sombra', 2, 10, 42, 46),
    bando('bando_turbina_passarela', 'turbina_desgovernada', 1, 10, 66, 31),
    bando('bando_enguia_da_barragem', 'enguia_eletrica', 3, 10, 64, 46),
    // SUGESTÃO: os cambistas do Capataz no estádio (missão de entrada da Torcida Fúria Neon)
    bando('bando_cambista_estadio', 'capanga_do_capataz', 3, 6, 42, 9, { sugestao: true }),
    mk('elite_cambista_blindado', 'inimigo', 58, 9, 'capanga_do_capataz', { tier: 'elite', affixes: ['blindado'], level: 10, sugestao: true }),
  ];

  c.scatter('T', 0.06, 301, ':', cellsOf(markers), 2);
  c.sprinkle('*', 0.05, 302, ':');
  c.sprinkle('z', 0.03, 303, '_');
  c.sprinkle('v', 0.01, 304, '.');

  return {
    id: 'usina_da_ponte',
    legend: LEGENDA,
    rows: c.rows(),
    regions: [{ regionId: 'usina_da_ponte', x: 0, y: 0, w: W, h: H }],
    extraMarkers: markers,
  };
}

export const USINA_DA_PONTE: AsciiMapDef = build();
