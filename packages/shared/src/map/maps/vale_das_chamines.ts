/**
 * Vale das Chaminés (v0.4), 96 x 72 tiles: abaixo da Margem Direita, "as fábricas do Consórcio soltam
 * fumaça dia e noite, e o colaborador do turno da noite paga a própria máscara de ar".
 *
 * A Margem Direita entra pela avenida do oeste. Avenidas de asfalto em grade, pátios de concreto, a
 * Fábrica de Baterias no norte (com a linha de montagem: três esteiras, alvo da missão 'desligar'),
 * chaminés soltas, o Refeitório do Turno da Noite no sudeste, a Estação de Máscaras no sudoeste e o
 * canal poluído no sul. O Relógio de Ponto fica no pátio da fábrica.
 *
 * Convenções: as mesmas de margem_esquerda.ts.
 *
 * SUGESTÃO: o mapa inteiro (desenho, lugares, bandos, chefe) é da v0.4; os docs só dizem o que é o Vale.
 */
import { Tile } from '../types';
import type { AsciiLegendEntry, AsciiMapDef } from './ascii';
import { Canvas, cellsOf, mk } from './canvas';
import { Deco } from './deco';

const W = 96;
const H = 72;

const LEGENDA: Record<string, AsciiLegendEntry> = {
  '~': { tile: Tile.AguaFunda },
  ',': { tile: Tile.AguaRasa },
  '.': { tile: Tile.Concreto },
  _: { tile: Tile.Asfalto },
  n: { tile: Tile.PisoNeon },
  '#': { tile: Tile.Parede },
  g: { tile: Tile.Grade },
  q: { tile: Tile.Maquina },
  D: { tile: Tile.Porta },
  // decoração
  v: { tile: Tile.Concreto, deco: Deco.Letreiro },
  h: { tile: Tile.PisoNeon, deco: Deco.Holograma },
  z: { tile: Tile.Asfalto, deco: Deco.Lixo },
  Z: { tile: Tile.Concreto, deco: Deco.Lixo },
  c: { tile: Tile.Concreto, deco: Deco.Caixote },
};

const bando = (id: string, inimigo: string, n: number, level: number, x: number, y: number) => mk(id, 'bando', x, y, undefined, { inimigos: [inimigo], n, level });

function build(): AsciiMapDef {
  const c = new Canvas(W, H, '.');

  // canal poluído no sul; grade em volta
  c.rect(0, 62, W, 3, ',').rect(0, 65, W, 7, '~');
  c.rect(0, 0, W, 1, 'g').rect(W - 1, 0, 1, 65, 'g').rect(0, 0, 1, 65, 'g');
  // avenidas de asfalto
  c.rect(1, 34, W - 2, 5, '_'); // a avenida do oeste, que vem da Margem Direita
  c.rect(30, 1, 5, 60, '_').rect(64, 1, 5, 60, '_');
  c.rect(1, 56, W - 2, 4, '_');
  // Fábrica de Baterias, com a linha de montagem (máquinas) e as três esteiras
  c.building(38, 4, 24, 24, '#', 'n', [[49, 27], [50, 27]]);
  for (const y of [9, 15, 21]) c.rect(41, y, 18, 1, 'q');
  c.set(40, 6, 'h').set(59, 6, 'h');
  // chaminés soltas (torres de 2 x 2)
  for (const [x, y] of [[8, 6], [20, 12], [76, 6], [86, 18], [10, 24], [80, 44]] as const) c.rect(x, y, 2, 2, '#');
  // galpões
  c.building(4, 42, 20, 11, '#', '.', [[13, 42], [14, 42]]); // Estação de Máscaras
  c.set(6, 44, 'c').set(21, 44, 'c');
  c.building(72, 42, 20, 11, '#', 'n', [[81, 42], [82, 42]]); // Refeitório do Turno da Noite
  c.set(74, 44, 'h').set(89, 44, 'h');
  c.building(38, 42, 22, 11, '#', '.', [[48, 42], [49, 42]]); // almoxarifado
  c.set(40, 44, 'c').set(57, 44, 'c').set(48, 48, 'c');
  // geradores e letreiros
  for (const [x, y] of [[26, 4], [72, 28], [12, 30]] as const) c.rect(x, y, 2, 2, 'q');
  c.set(36, 33, 'v').set(70, 33, 'v').set(28, 40, 'v');
  const esteiras: [number, number][] = [[45, 10], [50, 16], [55, 22]];

  const markers = [
    // entrada (a primeira é a padrão) e a saída de volta para a Margem Direita
    mk('spawn_direita', 'spawn_jogador', 5, 36, undefined, { de: 'margem_direita' }),
    mk('saida_margem_direita', 'saida', 1, 36,'margem_direita', { para: 'margem_direita', spawn: 'spawn_vale' }),
    // lugares
    mk('lugar_fabrica_de_baterias', 'lugar', 49, 29, 'fabrica_de_baterias'),
    mk('lugar_refeitorio_do_turno', 'lugar', 81, 40, 'refeitorio_do_turno'),
    mk('npc_gerente_de_turno', 'npc', 84, 40, 'gerente_de_turno', { lugar: 'refeitorio_do_turno' }),
    mk('lugar_estacao_de_mascaras', 'lugar', 13, 40, 'estacao_de_mascaras'),
    mk('pc_vale', 'ponto_controle', 48, 36, 'pc_vale'),
    // alvos de 'desligar' (missão O Turno da Noite e o estágio da Universidade Neon)
    ...esteiras.map(([x, y], i) => mk(`esteira_${i + 1}`, 'porta', x, y, 'esteira', { interagir: 'esteira', acao: 'desligar', lugar: 'fabrica_de_baterias' })),

    // inimigos: ratos nos pátios, robôs na fábrica, supervisores perto do refeitório
    bando('bando_rato_oeste', 'rato_de_duto', 5, 6, 16, 18),
    bando('bando_rato_canal', 'rato_de_duto', 5, 6, 46, 58),
    bando('bando_rato_leste', 'rato_de_duto', 4, 7, 84, 30),
    bando('bando_rato_avenida', 'rato_de_duto', 4, 6, 22, 36),
    bando('bando_robo_fabrica_1', 'robo_de_linha', 2, 7, 44, 12),
    bando('bando_robo_fabrica_2', 'robo_de_linha', 3, 8, 54, 18),
    bando('bando_robo_patio', 'robo_de_linha', 2, 7, 76, 26),
    bando('bando_supervisor_refeitorio', 'supervisor_de_meta', 3, 8, 74, 58),
    bando('bando_supervisor_almoxarifado', 'supervisor_de_meta', 2, 8, 48, 40),
    mk('elite_rato_rapido', 'inimigo', 24, 58, 'rato_de_duto', { tier: 'elite', affixes: ['rapido'], level: 8 }),
    // o chefe fica no pátio do nordeste, longe do caminho das missões de nível 7
    mk('chefe_relogio_de_ponto', 'chefe', 84, 10, 'relogio_de_ponto'),
  ];

  c.sprinkle('z', 0.03, 601, '_');
  c.sprinkle('Z', 0.015, 602, '.');

  return {
    id: 'vale_das_chamines',
    legend: LEGENDA,
    rows: c.rows(),
    regions: [{ regionId: 'vale_das_chamines', x: 0, y: 0, w: W, h: H }],
    extraMarkers: markers,
  };
}

export const VALE_DAS_CHAMINES: AsciiMapDef = build();
