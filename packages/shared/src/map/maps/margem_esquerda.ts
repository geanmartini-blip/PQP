/**
 * Margem Esquerda (Fase 3), 104 x 160 tiles: o tamanho e as posições saem de regions.json (mapa da
 * região: x 0, y 110, w 104, h 160) e de places.json (pos de cada lugar, menos a origem da região).
 * "Casas baixas, hortas, mutirões e a feira. A Casa da Assembleia [...]. A Brigada Popular, num galpão
 * de trem; a Guarda Comunitária, com uma guarita por quarteirão; a Escola dos Saberes, debaixo de uma
 * figueira enorme; a Trupe do Povo, no antigo cinema."
 *
 * Norte (y pequeno) dá para o Juncal; leste, para o Rio Claro e a Usina da Ponte; sul, para o rio
 * que desce ao Delta (cais da travessia, onde o barco chega). Ruas de terra em grade, mata no norte e
 * no oeste, árvores soltas no gramado. Paleta da Esquerda: verde, terra e madeira.
 *
 * Convenções (as mesmas do Delta, mais as da Fase 3):
 * - lugar: kind 'lugar', ref = id do place; as sedes têm params.instituicao e ficam encostadas na porta;
 * - treinadores: kind 'npc', ref = id do treinador, params { instituicao, ala, base } (base = recebe a base);
 * - personagens da IA de facção: kind 'npc', ref = id de faction_ai.json, params.iaFaccao = true;
 * - alvos de 'interagir' (missions.json): params { interagir: alvo, acao } e ref = alvo; quadros em
 *   kind 'quadro_missoes', guaritas e subestações em kind 'porta' (a porta da guarita, da subestação);
 * - saídas: kind 'saida', ref = região (e mapa) de destino, params { para: mapId, spawn: markerId };
 * - entradas: kind 'spawn_jogador' com id próprio; o primeiro ('spawn', cais) é o padrão e a chegada
 *   da travessia.
 *
 * SUGESTÃO: o desenho, as ruas, o tamanho dos prédios, as guaritas, as subestações, os bandos (nível,
 * tamanho, afixos dos elites) e o bando de contrabandistas na borda do Juncal são do mapa; os docs só
 * dizem o que existe na margem.
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
  '.': { tile: Tile.Terra },
  ':': { tile: Tile.Grama },
  ';': { tile: Tile.Mato },
  s: { tile: Tile.Areia },
  '=': { tile: Tile.Madeira },
  '#': { tile: Tile.Parede },
  T: { tile: Tile.Arvore },
  o: { tile: Tile.Pedra },
  q: { tile: Tile.Maquina },
  D: { tile: Tile.Porta },
  // decoração
  '*': { tile: Tile.Grama, deco: Deco.Flor },
  b: { tile: Tile.AguaFunda, deco: Deco.Barco },
  j: { tile: Tile.AguaRasa, deco: Deco.Junco },
  c: { tile: Tile.Madeira, deco: Deco.Caixote },
  l: { tile: Tile.Madeira, deco: Deco.Lanterna },
  k: { tile: Tile.Grama, deco: Deco.Totem },
  x: { tile: Tile.Terra, deco: Deco.Horta },
  h: { tile: Tile.Terra, deco: Deco.Toldo },
  '-': { tile: Tile.Madeira, deco: Deco.Tabua },
};

const treinador = (id: string, instituicao: string, ala: string, base: boolean, x: number, y: number) =>
  mk(`npc_${id}`, 'npc', x, y, id, { instituicao, ala, base });
const ia = (id: string, x: number, y: number, lugar: string) => mk(`npc_${id}`, 'npc', x, y, id, { iaFaccao: true, lugar });
const sede = (place: string, instituicao: string, x: number, y: number) => mk(`lugar_${place}`, 'lugar', x, y, place, { instituicao });
const loja = (id: string, npc: string, x: number, y: number) => mk(id, 'loja', x, y, id, { npc });
const quadro = (instituicao: string, x: number, y: number) => mk(`quadro_${instituicao}`, 'quadro_missoes', x, y, `quadro_${instituicao}`, { instituicao });
const bando = (id: string, inimigo: string, n: number, level: number, x: number, y: number, extra: Record<string, unknown> = {}) =>
  mk(id, 'bando', x, y, undefined, { inimigos: [inimigo], n, level, ...extra });

function build(): AsciiMapDef {
  const c = new Canvas(W, H, ':');

  // mata no norte e no oeste; rio a leste (Rio Claro) e ao sul (descida para o Delta)
  c.rect(0, 0, 92, 8, 'T').rect(0, 0, 2, H, 'T');
  c.rect(92, 0, 2, H, 's').rect(94, 0, 3, H, ',').rect(97, 0, 7, H, '~');
  c.rect(2, 146, 92, 2, 's').rect(0, 148, 97, 4, ',').rect(0, 152, W, 8, '~');
  c.rect(0, 148, 2, 4, 'T').rect(0, 0, 97, 1, 'T');
  // mato na beira da mata
  c.rect(2, 8, 88, 1, ';');

  // ruas de terra
  c.rect(84, 1, 4, 12, '.'); // trilha para o Juncal
  c.rect(6, 10, 86, 3, '.'); // rua de cima
  c.rect(6, 10, 4, 122, '.'); // rua do oeste
  c.rect(88, 10, 4, 122, '.'); // rua da beira-rio
  for (const y of [36, 72, 100, 128]) c.rect(6, y, 86, 4, '.');
  c.rect(48, 13, 6, 23, '.'); // avenida de cima
  c.rect(48, 63, 6, 83, '.'); // avenida da Assembleia até o cais
  // ponte de madeira para a Usina da Ponte e cais da travessia
  c.rect(88, 54, 15, 4, '=');
  c.rect(48, 146, 8, 11, '=').set(48, 150, '-').set(55, 153, '-');
  c.set(46, 155, 'b').set(57, 156, 'b');
  c.set(95, 52, 'j').set(96, 60, 'j').set(30, 149, 'j').set(70, 150, 'j');

  // Brigada Popular: galpão de trem
  c.building(16, 18, 25, 15, '#', '=', [[27, 32], [28, 32]]);
  c.rect(17, 25, 23, 1, '-').set(38, 20, 'c').set(18, 20, 'c');
  // Guarda Comunitária
  c.building(62, 18, 25, 15, '#', '=', [[73, 32], [74, 32]]);
  c.set(64, 20, 'l').set(84, 20, 'l');
  // Casa da Assembleia (QG) e a praça na frente
  c.building(36, 44, 29, 19, '#', '=', [[49, 62], [50, 62]]);
  c.set(40, 47, 'l').set(60, 47, 'l').set(50, 46, 'l').rect(46, 55, 9, 1, '-');
  c.rect(36, 63, 29, 9, '.');
  c.set(37, 64, 'k').set(63, 64, 'k').set(37, 70, 'k').set(63, 70, 'k');
  // Rádio do Povo
  c.building(66, 62, 11, 9, '#', '=', [[70, 70], [71, 70]]);
  // murais de Lúcia Barreto (um muro pintado)
  c.rect(80, 44, 8, 2, '#');
  // figueira enorme e a Escola dos Saberes debaixo dela
  c.ellipse(24, 80, 10, 3, 'T');
  c.building(12, 84, 25, 15, '#', '=', [[23, 98], [24, 98]]);
  c.set(14, 86, 'l').set(34, 86, 'l');
  // Praça do Xadrez, com o palco
  c.rect(56, 78, 9, 18, '.').rect(57, 88, 7, 4, '=');
  for (const [x, y] of [[56, 78], [64, 78], [56, 95], [64, 95]] as const) c.set(x, y, 'o');
  // Trupe do Povo: antigo cinema
  c.building(66, 84, 21, 15, '#', '=', [[75, 98], [76, 98]]);
  c.rect(67, 85, 19, 1, '-');
  // feira de troca
  c.rect(40, 105, 32, 8, '.');
  for (const y of [106, 110]) for (const x0 of [42, 56, 64]) c.rect(x0, y, 5, 1, 'h');
  // Biblioteca Municipal
  c.building(26, 114, 15, 11, '#', '=', [[32, 124], [33, 124]]);
  c.set(28, 116, 'c').set(38, 116, 'c');
  // casas de mutirão e as hortas
  for (const x0 of [12, 22, 32]) c.building(x0, 133, 7, 6, '#', '=', [[x0 + 3, 138]]);
  c.rect(60, 134, 24, 8, 'x');
  // guaritas (2 x 2) e subestações (máquina 2 x 2)
  const guaritas: [number, number][] = [[10, 20], [42, 20], [10, 50], [84, 62], [10, 110], [84, 110], [44, 136]];
  for (const [x, y] of guaritas) c.rect(x, y, 2, 2, '#');
  const subestacoes: [number, number][] = [[20, 60], [78, 122], [66, 120]];
  for (const [x, y] of subestacoes) c.rect(x, y, 2, 2, 'q');

  const L = 'sede_brigada_popular', G = 'sede_guarda_comunitaria', E = 'sede_escola_dos_saberes', TP = 'sede_trupe_do_povo';
  const markers = [
    // entradas (a primeira é a padrão: o cais, onde o barco da travessia chega)
    mk('spawn', 'spawn_jogador', 51, 147, undefined, { chegada: 'travessia' }),
    mk('spawn_juncal', 'spawn_jogador', 85, 5, undefined, { de: 'juncal' }),
    mk('spawn_usina', 'spawn_jogador', 92, 55, undefined, { de: 'usina_da_ponte' }),
    // saídas
    mk('saida_juncal', 'saida', 85, 1, 'juncal', { para: 'juncal', spawn: 'spawn_esquerda' }),
    mk('saida_usina_da_ponte', 'saida', 101, 55, 'usina_da_ponte', { para: 'usina_da_ponte', spawn: 'spawn_esquerda' }),
    // SUGESTÃO: o barco do Toninho também desce de volta ao Delta
    mk('saida_delta', 'saida', 52, 155, 'delta', { para: 'delta', spawn: 'spawn', barco: true }),

    // Casa da Assembleia (QG)
    mk('lugar_casa_da_assembleia', 'lugar', 50, 63, 'casa_da_assembleia', { qg: 'casa_da_assembleia' }),
    ia('ilaria_vesta', 44, 49, 'casa_da_assembleia'),
    ia('lazzaro_prati', 50, 49, 'casa_da_assembleia'),
    ia('teodoro_rinaldi', 56, 49, 'casa_da_assembleia'),
    mk('npc_nayra_sundaram', 'npc', 50, 52, 'nayra_sundaram', { lugar: 'casa_da_assembleia' }),
    mk('quadro_de_instituicoes', 'quadro_missoes', 40, 58, 'quadro_de_instituicoes', { interagir: 'quadro_de_instituicoes', acao: 'escolher_instituicao', qg: 'casa_da_assembleia' }),
    mk('quadro_casa_da_assembleia', 'quadro_missoes', 44, 58, 'quadro_casa_da_assembleia', { qg: 'casa_da_assembleia' }),
    loja('loja_casa_da_assembleia', 'yusuf_adeyemi', 60, 58),
    mk('plantao_casa_da_assembleia', 'lugar', 56, 58, 'casa_da_assembleia', { servico: 'plantao' }),
    mk('espelho_da_benzedeira', 'maquina_visual', 40, 67, 'espelho_da_benzedeira', { lugar: 'casa_da_assembleia', npc: 'benzedeira_do_espelho' }),
    mk('npc_benzedeira_do_espelho', 'npc', 41, 68, 'benzedeira_do_espelho'),
    mk('pc_casa_da_assembleia', 'ponto_controle', 60, 67, 'pc_casa_da_assembleia'),

    // Brigada Popular (combatente)
    sede(L, 'brigada_popular', 28, 33),
    treinador('jacques', 'brigada_popular', 'cidadao_revolucionario', true, 20, 22),
    treinador('wesley', 'brigada_popular', 'peao_brabo', false, 26, 22),
    treinador('dev_kumar', 'brigada_popular', 'iogue_furioso', false, 32, 22),
    loja('loja_brigada_popular', 'jacques', 36, 29),
    quadro('brigada_popular', 20, 29),
    // Guarda Comunitária (atirador)
    sede(G, 'guarda_comunitaria', 74, 33),
    treinador('olga', 'guarda_comunitaria', 'babushka', true, 66, 22),
    treinador('batu', 'guarda_comunitaria', 'arqueiro_das_estepes', false, 72, 22),
    treinador('bazza', 'guarda_comunitaria', 'cacador_de_crocodilo', false, 78, 22),
    loja('loja_guarda_comunitaria', 'olga', 82, 29),
    quadro('guarda_comunitaria', 66, 29),
    ...guaritas.map(([x, y], i) => mk(`guarita_${i + 1}`, 'porta', x + 2, y + 1, 'guarita', { interagir: 'guarita', acao: 'fazer_ronda', lugar: G })),
    // Escola dos Saberes (elemental)
    sede(E, 'escola_dos_saberes', 24, 99),
    treinador('seamus', 'escola_dos_saberes', 'druida_rabugento', true, 16, 88),
    treinador('sigrid', 'escola_dos_saberes', 'bruxa_do_trovao', false, 24, 88),
    treinador('ayaan_quispe', 'escola_dos_saberes', 'curandeira_dos_andes', false, 32, 88),
    loja('loja_escola_dos_saberes', 'seamus', 32, 95),
    quadro('escola_dos_saberes', 16, 95),
    mk('posto_da_curandeira_da_escola', 'lugar', 24, 95, E, { servico: 'posto_da_curandeira' }),
    // Trupe do Povo (mascarado)
    sede(TP, 'trupe_do_povo', 76, 99),
    treinador('tiao', 'trupe_do_povo', 'malandro', true, 70, 88),
    treinador('el_relampago', 'trupe_do_povo', 'luchador_sagrado', false, 76, 88),
    treinador('donna_valentina', 'trupe_do_povo', 'diva_da_opera', false, 82, 88),
    loja('loja_trupe_do_povo', 'tiao', 82, 95),
    quadro('trupe_do_povo', 70, 95),

    // os outros lugares da margem
    mk('lugar_radio_do_povo', 'lugar', 71, 71, 'radio_do_povo'),
    ia('amara_okafor', 71, 65, 'radio_do_povo'),
    mk('lugar_praca_do_xadrez', 'lugar', 60, 82, 'praca_do_xadrez'),
    mk('lugar_murais_de_lucia_barreto', 'lugar', 84, 46, 'murais_de_lucia_barreto'),
    mk('lugar_feira_da_esquerda', 'lugar', 55, 107, 'feira_da_esquerda'),
    ia('yusuf_adeyemi', 58, 108, 'feira_da_esquerda'),
    mk('npc_vizinha_da_bracadeira', 'npc', 44, 108, 'vizinha_da_bracadeira'),
    mk('pc_feira', 'ponto_controle', 66, 111, 'pc_feira'),
    mk('lugar_biblioteca_municipal', 'lugar', 33, 125, 'biblioteca_municipal'),
    mk('lugar_mutiroes', 'lugar', 30, 141, 'mutiroes'),
    mk('moradia_mutiroes', 'moradia', 36, 141, 'mutiroes'),
    // SUGESTÃO: o Teodoro também aparece no canteiro do mutirão (missões roda_02 e mutirao_casa_propria)
    mk('npc_teodoro_rinaldi_mutirao', 'npc', 24, 141, 'teodoro_rinaldi', { iaFaccao: true, lugar: 'mutiroes' }),
    ...subestacoes.map(([x, y], i) => mk(`subestacao_esquerda_${i + 1}`, 'porta', x + 2, y + 1, 'subestacao', { interagir: 'subestacao', acao: 'religar', lugar: 'mutiroes' })),

    // bandos da margem (fiscais da comissão, nível 10 a 12) e elites
    bando('bando_fiscal_oeste', 'fiscal_da_comissao', 2, 10, 24, 56),
    bando('bando_fiscal_murais', 'fiscal_da_comissao', 3, 10, 76, 52),
    bando('bando_fiscal_biblioteca', 'fiscal_da_comissao', 2, 11, 16, 118),
    bando('bando_fiscal_beira_rio', 'fiscal_da_comissao', 3, 11, 80, 118),
    bando('bando_fiscal_hortas', 'fiscal_da_comissao', 3, 12, 76, 138),
    mk('elite_fiscal_blindado', 'inimigo', 30, 64, 'fiscal_da_comissao', { tier: 'elite', affixes: ['blindado'], level: 12 }),
    mk('elite_fiscal_da_religacao', 'inimigo', 84, 126, 'fiscal_da_comissao', { tier: 'elite', affixes: ['cura_os_outros'], level: 12 }),
    // SUGESTÃO: contrabandistas (região juncal em enemies.json) descem até a borda da mata
    bando('bando_contrabandista_borda', 'contrabandista', 3, 9, 78, 14, { sugestao: true }),
  ];

  c.scatter('T', 0.05, 101, ':', cellsOf(markers), 2);
  c.sprinkle('*', 0.03, 102, ':');
  c.sprinkle(';', 0.02, 103, ':');

  return {
    id: 'margem_esquerda',
    legend: LEGENDA,
    rows: c.rows(),
    regions: [{ regionId: 'margem_esquerda', x: 0, y: 0, w: W, h: H }],
    extraMarkers: markers,
  };
}

export const MARGEM_ESQUERDA: AsciiMapDef = build();
