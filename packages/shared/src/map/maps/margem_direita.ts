/**
 * Margem Direita (Fase 3), 104 x 160 tiles: o tamanho e as posições saem de regions.json (mapa da
 * região: x 136, y 50, w 104, h 160) e de places.json (pos de cada lugar, menos a origem da região).
 * "Torres, trens suspensos e telões. A Torre do Consórcio, de vidro espelhado [...]. A sede da Fúria
 * Neon, colada no estádio; o batalhão da PM, com estúdio de gravação próprio; a Universidade Neon, com
 * catraca por mensalidade; a Agência Neon, onde todo mundo é talento até o contrato acabar. O
 * shopping, os prédios de cápsulas [...]."
 *
 * Oeste dá para o Juncal (no alto, atrás da grade) e para a Usina da Ponte (a ponte de concreto, mais
 * abaixo, perto da Fúria Neon e do estádio); sul, para o rio que desce ao Delta (cais da travessia).
 * Avenidas de asfalto em grade, calçadas de concreto, piso neon dentro dos prédios, hologramas,
 * letreiros, geradores e lixo. Paleta da Direita: neon sobre concreto, sem árvore.
 *
 * Convenções: as mesmas de margem_esquerda.ts.
 *
 * SUGESTÃO: o desenho, as avenidas, o tamanho dos prédios, a catraca, as subestações e os bandos
 * (nível, tamanho, afixos dos elites) são do mapa; os docs só dizem o que existe na margem.
 */
import { Tile } from '../types';
import type { AsciiLegendEntry, AsciiMapDef } from './ascii';
import { Canvas, cellsOf, mk } from './canvas';
import { Deco } from './deco';

const W = 104;
const H = 160;

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
  o: { tile: Tile.Pedra },
  D: { tile: Tile.Porta },
  // decoração
  b: { tile: Tile.AguaFunda, deco: Deco.Barco },
  v: { tile: Tile.Concreto, deco: Deco.Letreiro },
  h: { tile: Tile.PisoNeon, deco: Deco.Holograma },
  z: { tile: Tile.Asfalto, deco: Deco.Lixo },
  Z: { tile: Tile.Concreto, deco: Deco.Lixo },
  c: { tile: Tile.Concreto, deco: Deco.Caixote },
};

const treinador = (id: string, instituicao: string, ala: string, base: boolean, x: number, y: number) =>
  mk(`npc_${id}`, 'npc', x, y, id, { instituicao, ala, base });
const ia = (id: string, x: number, y: number, lugar: string) => mk(`npc_${id}`, 'npc', x, y, id, { iaFaccao: true, lugar });
const sede = (place: string, instituicao: string, x: number, y: number) => mk(`lugar_${place}`, 'lugar', x, y, place, { instituicao });
const loja = (id: string, npc: string, x: number, y: number) => mk(id, 'loja', x, y, id, { npc });
const quadro = (instituicao: string, x: number, y: number) => mk(`quadro_${instituicao}`, 'quadro_missoes', x, y, `quadro_${instituicao}`, { instituicao });
const alvo = (id: string, acao: string, x: number, y: number, lugar: string) => mk(id, 'quadro_missoes', x, y, id, { interagir: id, acao, lugar });
const bando = (id: string, inimigo: string, n: number, level: number, x: number, y: number) => mk(id, 'bando', x, y, undefined, { inimigos: [inimigo], n, level });

function build(): AsciiMapDef {
  const c = new Canvas(W, H, '.');

  // bordas: grade no norte e no leste; no oeste, o mato do Juncal atrás da grade e depois o rio
  c.rect(0, 0, 6, 61, ';').rect(6, 1, 1, 60, 'g');
  c.rect(0, 61, 5, 99, '~').rect(5, 61, 2, 99, ',');
  c.rect(0, 151, W, 2, ',').rect(0, 151, 1, 2, '~').rect(0, 153, W, 7, '~');
  c.rect(0, 0, W, 1, 'g').rect(0, 0, 1, 61, 'g').rect(W - 1, 0, 1, 153, 'g');

  // avenidas de asfalto
  c.rect(50, 1, 6, 62, '_').rect(50, 81, 6, 65, '_');
  c.rect(9, 26, 4, 121, '_').rect(94, 26, 4, 95, '_');
  c.rect(1, 26, 97, 4, '_'); // sai para o Juncal pela abertura da grade
  for (const y of [56, 86, 116]) c.rect(9, y, 89, 4, '_');
  // ponte de concreto para a Usina da Ponte e cais da travessia
  c.rect(1, 116, 8, 4, '.');
  c.rect(48, 146, 9, 11, '.');
  c.set(46, 155, 'b').set(58, 156, 'b');

  // Rádio Velha, esquecida entre duas torres
  c.building(80, 10, 11, 11, '#', '.', [[85, 20], [86, 20]]);
  c.rect(78, 4, 2, 6, '#').rect(91, 4, 2, 6, '#');
  // Universidade Neon, com catraca
  c.building(18, 32, 27, 19, '#', 'n', [[31, 50], [32, 50]]);
  for (const x of [28, 29, 30, 33, 34, 35]) c.set(x, 48, 'g');
  c.set(20, 34, 'h').set(42, 34, 'h');
  // Batalhão da PM, com estúdio de gravação
  c.building(62, 32, 27, 19, '#', 'n', [[75, 50], [76, 50]]);
  c.rect(82, 33, 6, 1, 'h');
  // Hospital Antigo (fechado entre duas clínicas)
  c.building(16, 64, 19, 17, '#', '.', [[25, 80], [26, 80]]);
  c.set(18, 66, 'c').set(32, 66, 'c');
  // Torre do Consórcio (QG), com o gerador, e a praça neon na frente
  c.building(38, 63, 31, 18, '#', 'n', [[52, 80], [53, 80]]);
  c.rect(40, 65, 2, 2, 'q').rect(65, 65, 2, 2, 'q');
  c.set(46, 65, 'h').set(60, 65, 'h').set(53, 65, 'h');
  c.rect(38, 81, 31, 5, 'n').set(39, 82, 'h').set(67, 82, 'h');
  // Sede da Fúria Neon, colada na ponte do estádio
  c.building(14, 92, 23, 19, '#', 'n', [[25, 110], [26, 110]]);
  c.set(16, 94, 'h').set(34, 94, 'h');
  // Agência Neon, com telões
  c.building(62, 92, 29, 19, '#', 'n', [[75, 110], [76, 110]]);
  c.rect(64, 93, 25, 1, 'h');
  // Shopping
  c.building(58, 122, 25, 13, '#', 'n', [[69, 134], [70, 134]]);
  c.set(60, 124, 'h').set(80, 124, 'h').set(70, 124, 'h');
  // Prédios de Cápsulas, porta para o oeste
  c.building(88, 122, 13, 25, '#', 'n', [[88, 133], [88, 134]]);
  c.rect(90, 127, 9, 1, '#').rect(90, 130, 9, 1, '#').rect(94, 127, 1, 4, 'n');
  // Ferro-Velho: montes de sucata
  c.rect(14, 124, 21, 23, '.');
  // subestações (máquina 2 x 2) e geradores soltos
  const subestacoes: [number, number][] = [[40, 124], [40, 140], [76, 140]];
  for (const [x, y] of subestacoes) c.rect(x, y, 2, 2, 'q');
  for (const [x, y] of [[100, 40], [100, 100]] as const) c.rect(x, y, 2, 2, 'q');

  const markers = [
    // entradas (a primeira é a padrão: o cais, onde o barco da travessia chega)
    mk('spawn', 'spawn_jogador', 52, 148, undefined, { chegada: 'travessia' }),
    mk('spawn_juncal', 'spawn_jogador', 5, 27, undefined, { de: 'juncal' }),
    mk('spawn_usina', 'spawn_jogador', 6, 117, undefined, { de: 'usina_da_ponte' }),
    // saídas
    mk('saida_juncal', 'saida', 1, 27, 'juncal', { para: 'juncal', spawn: 'spawn_direita' }),
    mk('saida_usina_da_ponte', 'saida', 2, 117, 'usina_da_ponte', { para: 'usina_da_ponte', spawn: 'spawn_direita' }),
    // SUGESTÃO: o barco também desce de volta ao Delta
    mk('saida_delta', 'saida', 52, 155, 'delta', { para: 'delta', spawn: 'spawn', barco: true }),

    // Torre do Consórcio (QG)
    mk('lugar_torre_do_consorcio', 'lugar', 53, 81, 'torre_do_consorcio', { qg: 'torre_do_consorcio' }),
    ia('rolf_halvorsen', 46, 68, 'torre_do_consorcio'),
    ia('viktor_sahl', 53, 68, 'torre_do_consorcio'),
    ia('mateo_silva_park', 60, 68, 'torre_do_consorcio'),
    mk('npc_kenji_albrecht', 'npc', 53, 72, 'kenji_albrecht', { lugar: 'torre_do_consorcio' }),
    mk('quadro_de_instituicoes', 'quadro_missoes', 42, 76, 'quadro_de_instituicoes', { interagir: 'quadro_de_instituicoes', acao: 'escolher_instituicao', qg: 'torre_do_consorcio' }),
    alvo('termos_de_uso', 'aceitar', 46, 76, 'torre_do_consorcio'),
    mk('quadro_torre_do_consorcio', 'quadro_missoes', 50, 76, 'quadro_torre_do_consorcio', { qg: 'torre_do_consorcio' }),
    mk('plantao_torre_do_consorcio', 'lugar', 58, 76, 'torre_do_consorcio', { servico: 'plantao' }),
    loja('loja_torre_do_consorcio', 'mateo_silva_park', 64, 76),
    mk('cabine_neon', 'maquina_visual', 42, 83, 'cabine_neon', { lugar: 'torre_do_consorcio', npc: 'funcionario_da_cabine_neon' }),
    mk('npc_funcionario_da_cabine_neon', 'npc', 43, 84, 'funcionario_da_cabine_neon'),
    mk('pc_torre_do_consorcio', 'ponto_controle', 64, 83, 'pc_torre_do_consorcio'),

    // Torcida Fúria Neon (combatente)
    sede('sede_torcida_furia_neon', 'torcida_furia_neon', 26, 111),
    treinador('edson', 'torcida_furia_neon', 'o_fiel', true, 18, 96),
    treinador('takeshi', 'torcida_furia_neon', 'sumo_cibernetico', false, 25, 96),
    treinador('thalysson', 'torcida_furia_neon', 'monstro_da_academia', false, 32, 96),
    loja('loja_torcida_furia_neon', 'edson', 32, 106),
    quadro('torcida_furia_neon', 18, 106),
    // PM do Consórcio (atirador)
    sede('sede_pm_do_consorcio', 'pm_do_consorcio', 76, 51),
    treinador('dusty', 'pm_do_consorcio', 'cowboy_cromado', true, 66, 36),
    treinador('big_mo', 'pm_do_consorcio', 'tropa_de_choque', false, 72, 36),
    treinador('chidi', 'pm_do_consorcio', 'diretor_de_nollywood', false, 80, 36),
    alvo('prova_do_concurso', 'responder', 66, 46, 'sede_pm_do_consorcio'),
    alvo('contrato_da_pm', 'assinar', 72, 46, 'sede_pm_do_consorcio'),
    quadro('pm_do_consorcio', 80, 46),
    loja('loja_pm_do_consorcio', 'dusty', 84, 46),
    // Universidade Neon (elemental)
    sede('sede_universidade_neon', 'universidade_neon', 32, 51),
    treinador('klaus', 'universidade_neon', 'doktor_klaus', true, 22, 36),
    treinador('mei_lin_zhao', 'universidade_neon', 'engenheira_de_gambiarra', false, 30, 36),
    treinador('brooke', 'universidade_neon', 'coach_de_bem_estar', false, 38, 36),
    alvo('vestibular', 'responder', 22, 44, 'sede_universidade_neon'),
    quadro('universidade_neon', 30, 42),
    loja('loja_universidade_neon', 'klaus', 40, 44),
    // Agência Neon (mascarado)
    sede('sede_agencia_neon', 'agencia_neon', 76, 111),
    treinador('katia', 'agencia_neon', 'atendente_imortal', true, 66, 96),
    treinador('kaua_ferreira', 'agencia_neon', 'hacker_da_aldeia', false, 73, 96),
    treinador('li_wei', 'agencia_neon', 'idol', false, 80, 96),
    ia('klara_lindqvist', 86, 96, 'sede_agencia_neon'),
    alvo('palco_de_audicao', 'fazer_audicao', 70, 104, 'sede_agencia_neon'),
    alvo('contrato_de_exclusividade', 'assinar', 78, 104, 'sede_agencia_neon'),
    quadro('agencia_neon', 66, 106),
    loja('loja_agencia_neon', 'katia', 86, 106),

    // os outros lugares da margem
    mk('lugar_shopping', 'lugar', 70, 135, 'shopping'),
    mk('pc_shopping', 'ponto_controle', 78, 137, 'pc_shopping'),
    mk('npc_entregador_de_app', 'npc', 64, 137, 'entregador_de_app'),
    mk('lugar_predios_de_capsulas', 'lugar', 87, 134, 'predios_de_capsulas'),
    mk('moradia_predios_de_capsulas', 'moradia', 86, 137, 'predios_de_capsulas'),
    alvo('extrato_do_app', 'ler', 92, 140, 'predios_de_capsulas'),
    mk('lugar_hospital_antigo', 'lugar', 26, 81, 'hospital_antigo'),
    mk('lugar_ferro_velho', 'lugar', 24, 135, 'ferro_velho'),
    mk('lugar_radio_velha', 'lugar', 85, 21, 'radio_velha'),
    ...subestacoes.map(([x, y], i) => mk(`subestacao_direita_${i + 1}`, 'porta', x + 2, y + 1, 'subestacao', { interagir: 'subestacao', acao: 'religar', lugar: 'predios_de_capsulas' })),

    // bandos da margem (drones de cobrança, nível 10 a 12) e elites
    bando('bando_drone_universidade', 'drone_de_cobranca', 3, 10, 30, 58),
    bando('bando_drone_pm', 'drone_de_cobranca', 2, 10, 86, 58),
    bando('bando_drone_hospital', 'drone_de_cobranca', 3, 10, 11, 72),
    bando('bando_drone_beira', 'drone_de_cobranca', 4, 11, 95, 72),
    bando('bando_drone_ponte', 'drone_de_cobranca', 3, 11, 44, 118),
    bando('bando_drone_ferro_velho', 'drone_de_cobranca', 3, 12, 24, 141),
    mk('elite_drone_explosivo', 'inimigo', 30, 20, 'drone_de_cobranca', { tier: 'elite', affixes: ['explode_ao_morrer'], level: 12 }),
    mk('elite_drone_das_capsulas', 'inimigo', 80, 146, 'drone_de_cobranca', { tier: 'elite', affixes: ['cura_os_outros'], level: 12 }),
  ];

  // sucata no ferro-velho, lixo e letreiros na calçada
  const avoid = cellsOf(markers);
  // sucata só dentro do ferro-velho (x 14 a 34, y 124 a 146): marca a área, espalha e desmarca
  c.replace(14, 124, 21, 23, '.', 'F');
  c.scatter('o', 0.18, 201, 'F', avoid, 1);
  c.replace(14, 124, 21, 23, 'F', '.');
  c.sprinkle('z', 0.02, 202, '_');
  c.sprinkle('Z', 0.01, 203, '.');
  c.sprinkle('v', 0.006, 204, '.');
  c.sprinkle(':', 0.08, 205, ';');

  return {
    id: 'margem_direita',
    legend: LEGENDA,
    rows: c.rows(),
    regions: [{ regionId: 'margem_direita', x: 0, y: 0, w: W, h: H }],
    extraMarkers: markers,
  };
}

export const MARGEM_DIREITA: AsciiMapDef = build();
