/**
 * Floresta do Juncal (Fase 3), 92 x 120 tiles: a região de regions.json (x 90, y 50, w 46, h 60) em
 * escala 2, com as posições de places.json e structures.json na mesma escala. "Mata fechada entre as
 * margens, casa do Curupira e caminho dos contrabandistas."
 *
 * Mata fechada cortada por trilhas de terra. A Margem Esquerda entra pelo canto de baixo à esquerda,
 * a Margem Direita pela borda leste. No noroeste, a clareira da Mata do Curupira; no meio, a Clareira
 * do Juncal (posto de controle); no sudeste, o acampamento do Capataz na Trilha dos Contrabandistas,
 * com paliçada, o paiol, o balcão do contrabando e o próprio Bruno Ferro, o Capataz.
 *
 * Convenções: as mesmas de margem_esquerda.ts.
 *
 * SUGESTÃO: o desenho, a escala 2, o lago, o paiol e os bandos (nível, tamanho, afixos) são do mapa.
 */
import { Tile } from '../types';
import type { AsciiLegendEntry, AsciiMapDef } from './ascii';
import { Canvas, cellsOf, mk } from './canvas';
import { Deco } from './deco';

const W = 92;
const H = 120;

const LEGENDA: Record<string, AsciiLegendEntry> = {
  '~': { tile: Tile.AguaFunda },
  ',': { tile: Tile.AguaRasa },
  '.': { tile: Tile.Terra },
  ':': { tile: Tile.Grama },
  ';': { tile: Tile.Mato },
  '%': { tile: Tile.Lama },
  '=': { tile: Tile.Madeira },
  '#': { tile: Tile.Parede },
  T: { tile: Tile.Arvore },
  o: { tile: Tile.Pedra },
  '+': { tile: Tile.Cerca },
  D: { tile: Tile.Porta },
  // decoração
  '*': { tile: Tile.Grama, deco: Deco.Flor },
  j: { tile: Tile.AguaRasa, deco: Deco.Junco },
  c: { tile: Tile.Madeira, deco: Deco.Caixote },
  l: { tile: Tile.Terra, deco: Deco.Lanterna },
  k: { tile: Tile.Grama, deco: Deco.Totem },
};

const bando = (id: string, inimigo: string, n: number, level: number, x: number, y: number) => mk(id, 'bando', x, y, undefined, { inimigos: [inimigo], n, level });

function build(): AsciiMapDef {
  const c = new Canvas(W, H, 'T');

  // clareiras
  c.ellipse(20, 40, 9, 8, ':'); // Mata do Curupira
  c.ellipse(44, 60, 8, 6, ';'); // Clareira do Juncal
  c.ellipse(14, 110, 6, 5, ':'); // entrada da Esquerda
  c.ellipse(15, 88, 4, 3, ','); // lago com junco
  c.ellipse(15, 88, 2, 1, '~');
  c.ellipse(74, 30, 7, 5, ';'); // mato alto a nordeste
  c.ellipse(30, 100, 5, 4, '%'); // lamaçal, na beira do atalho
  // trilhas de terra
  c.rect(8, 70, 3, 49, '.'); // da Esquerda para o norte
  c.rect(8, 70, 40, 3, '.');
  c.rect(42, 30, 3, 43, '.');
  c.rect(18, 30, 27, 3, '.'); // para a Mata do Curupira
  c.rect(44, 57, 47, 3, '.'); // para a Direita
  c.rect(62, 59, 3, 26, '.'); // para o acampamento
  c.rect(10, 104, 49, 3, '.'); // atalho dos contrabandistas
  c.rect(56, 102, 3, 3, '.');
  c.rect(60, 30, 3, 28, '.').rect(60, 30, 15, 3, '.'); // para o mato alto
  // acampamento do Capataz: paliçada com portões, paiol e balcão
  c.rect(52, 84, 28, 20, '.').frame(52, 84, 28, 20, '+');
  c.rect(62, 84, 3, 1, '.').rect(56, 103, 3, 1, '.');
  c.building(70, 86, 8, 6, '#', '=', [[73, 91], [74, 91]]);
  c.set(72, 87, 'c').set(75, 87, 'c').set(72, 89, 'c');
  c.rect(58, 88, 4, 1, '=');
  c.set(53, 85, 'l').set(78, 85, 'l').set(53, 102, 'l').set(78, 102, 'l');
  // totens do Curupira
  c.set(14, 36, 'k').set(26, 36, 'k').set(20, 46, 'k');

  const markers = [
    // entradas (a primeira é a padrão)
    mk('spawn_esquerda', 'spawn_jogador', 9, 113, undefined, { de: 'margem_esquerda' }),
    mk('spawn_direita', 'spawn_jogador', 86, 58, undefined, { de: 'margem_direita' }),
    // saídas
    mk('saida_margem_esquerda', 'saida', 9, 118, 'margem_esquerda', { para: 'margem_esquerda', spawn: 'spawn_juncal' }),
    mk('saida_margem_direita', 'saida', 90, 58, 'margem_direita', { para: 'margem_direita', spawn: 'spawn_juncal' }),
    // Mata do Curupira
    mk('lugar_mata_do_curupira', 'lugar', 20, 40, 'mata_do_curupira'),
    mk('npc_curupira', 'npc', 22, 38, 'curupira', { guia: true, lugar: 'mata_do_curupira' }),
    // Clareira do Juncal
    mk('pc_clareira_do_juncal', 'ponto_controle', 44, 60, 'pc_clareira_do_juncal'),
    // Trilha dos Contrabandistas: o Capataz e o contrabando
    mk('lugar_trilha_dos_contrabandistas', 'lugar', 64, 94, 'trilha_dos_contrabandistas'),
    mk('npc_bruno_ferro', 'npc', 64, 92, 'bruno_ferro', { lugar: 'trilha_dos_contrabandistas', capataz: true }),
    mk('loja_contrabando_juncal', 'loja', 60, 90, 'loja_contrabando_juncal', { npc: 'bruno_ferro' }),
    mk('npc_vendedor_de_chopindita_barata', 'npc', 57, 90, 'vendedor_de_chopindita_barata', { lugar: 'trilha_dos_contrabandistas' }),
    mk('deposito_do_capataz', 'lugar', 73, 92, 'trilha_dos_contrabandistas', { deposito: 'deposito_do_capataz' }),

    // inimigos da mata
    bando('bando_cobra_curupira', 'cobra_do_juncal', 2, 7, 14, 44),
    bando('bando_cobra_trilha', 'cobra_do_juncal', 2, 7, 30, 31),
    bando('bando_cobra_mato_alto', 'cobra_do_juncal', 3, 9, 74, 30),
    bando('bando_contrabandista_entrada', 'contrabandista', 2, 6, 9, 82),
    bando('bando_contrabandista_clareira', 'contrabandista', 3, 6, 38, 62),
    bando('bando_contrabandista_atalho', 'contrabandista', 3, 7, 40, 105),
    mk('elite_contrabandista_rapido', 'inimigo', 50, 64, 'contrabandista', { tier: 'elite', affixes: ['rapido'], level: 10 }),
    bando('bando_capanga_acampamento', 'capanga_do_capataz', 3, 6, 58, 98),
    bando('bando_cao_acampamento', 'cao_de_guarda_do_capataz', 2, 6, 72, 98),
    bando('bando_cao_portao', 'cao_de_guarda_do_capataz', 3, 7, 63, 76),
  ];

  c.scatter('T', 0.05, 401, ':;', cellsOf(markers), 2);
  c.sprinkle('*', 0.06, 402, ':');
  c.sprinkle('j', 0.3, 403, ',');

  return {
    id: 'juncal',
    legend: LEGENDA,
    rows: c.rows(),
    regions: [{ regionId: 'juncal', x: 0, y: 0, w: W, h: H }],
    extraMarkers: markers,
  };
}

export const JUNCAL: AsciiMapDef = build();
