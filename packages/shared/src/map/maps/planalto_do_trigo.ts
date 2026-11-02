/**
 * Planalto do Trigo (v0.4), 96 x 72 tiles: campos de trigo acima da Margem Esquerda, "onde as roças
 * coletivas alimentam a margem inteira e a comissão da colheita se reúne mais do que colhe".
 *
 * A Margem Esquerda entra pela trilha do sul. Estrada de terra em cruz; nos quatro quadrantes, o trigo
 * (mato alto) da Roça Coletiva; a leste, o Barracão da Comissão da Colheita e os silos da cota; a oeste,
 * o moinho velho. Três espantalhos-mestres (alvo da missão 'desbenzer') ficam no meio do trigo, e o
 * Espantalho-Mor espera no centro da roça do noroeste.
 *
 * Convenções: as mesmas de margem_esquerda.ts.
 *
 * SUGESTÃO: o mapa inteiro (desenho, lugares, bandos, chefe) é da v0.4; os docs só dizem o que é o
 * Planalto.
 */
import { Tile } from '../types';
import type { AsciiLegendEntry, AsciiMapDef } from './ascii';
import { Canvas, cellsOf, mk } from './canvas';
import { Deco } from './deco';

const W = 96;
const H = 72;

const LEGENDA: Record<string, AsciiLegendEntry> = {
  ',': { tile: Tile.AguaRasa },
  '~': { tile: Tile.AguaFunda },
  '.': { tile: Tile.Terra },
  ':': { tile: Tile.Grama },
  ';': { tile: Tile.Mato },
  '=': { tile: Tile.Madeira },
  '#': { tile: Tile.Parede },
  T: { tile: Tile.Arvore },
  o: { tile: Tile.Pedra },
  '+': { tile: Tile.Cerca },
  D: { tile: Tile.Porta },
  // decoração
  '*': { tile: Tile.Grama, deco: Deco.Flor },
  x: { tile: Tile.Terra, deco: Deco.Horta },
  c: { tile: Tile.Madeira, deco: Deco.Caixote },
  l: { tile: Tile.Terra, deco: Deco.Lanterna },
  k: { tile: Tile.Grama, deco: Deco.Totem },
};

const bando = (id: string, inimigo: string, n: number, level: number, x: number, y: number) => mk(id, 'bando', x, y, undefined, { inimigos: [inimigo], n, level });

function build(): AsciiMapDef {
  const c = new Canvas(W, H, ':');

  // mata em volta, com a trilha do sul aberta para a Margem Esquerda
  c.rect(0, 0, W, 2, 'T').rect(0, 0, 2, H, 'T').rect(W - 2, 0, 2, H, 'T').rect(0, H - 2, W, 2, 'T');
  // a roça: quatro quadrantes de trigo, cercados
  for (const [x, y, w, h] of [[5, 5, 36, 25], [55, 5, 36, 25], [5, 40, 36, 25], [55, 40, 18, 25]] as const) {
    c.rect(x, y, w, h, ';').frame(x - 1, y - 1, w + 2, h + 2, '+');
  }
  // estradas de terra em cruz e a trilha para a Margem
  c.rect(44, 2, 8, H - 4, '.').rect(2, 32, W - 4, 6, '.');
  c.rect(46, H - 2, 4, 1, '.');
  // passagens nas cercas para entrar no trigo
  for (const [x, y] of [[41, 16], [41, 50], [54, 16], [54, 50], [22, 30], [72, 30], [22, 39], [63, 39]] as const) c.rect(x, y, 2, 2, '.');
  // açude pequeno no meio do trigo do sudoeste, com uma beira de grama
  c.ellipse(16, 56, 6, 5, ':').ellipse(16, 56, 4, 3, ',').ellipse(16, 56, 2, 1, '~');
  // Barracão da Comissão da Colheita e a horta na frente
  c.building(76, 42, 16, 10, '#', '=', [[83, 51], [84, 51]]);
  c.set(78, 44, 'c').set(89, 44, 'c').rect(80, 46, 8, 1, '=');
  c.rect(76, 53, 16, 3, 'x');
  // silos da cota (torres de 3 x 3) e o moinho velho
  for (const [x, y] of [[78, 58], [83, 58], [88, 58]] as const) c.rect(x, y, 3, 3, '#');
  c.building(4, 32, 7, 6, '#', '=', [[10, 34]]);
  c.set(53, 34, 'l').set(43, 34, 'l').set(53, 66, 'l');
  c.set(46, 4, 'k').set(49, 4, 'k');
  // espantalhos-mestres no meio do trigo (pedra = poste do espantalho)
  const espantalhos: [number, number][] = [[34, 22], [70, 20], [28, 52]];
  for (const [x, y] of espantalhos) c.set(x, y, 'o');

  const markers = [
    // entrada (a primeira é a padrão) e a saída de volta para a Margem Esquerda
    mk('spawn_esquerda', 'spawn_jogador', 48, H - 6, undefined, { de: 'margem_esquerda' }),
    mk('saida_margem_esquerda', 'saida', 48, H - 2,'margem_esquerda', { para: 'margem_esquerda', spawn: 'spawn_planalto' }),
    // lugares
    mk('lugar_roca_coletiva', 'lugar', 30, 34, 'roca_coletiva'),
    mk('lugar_barracao_da_comissao', 'lugar', 84, 53, 'barracao_da_comissao'),
    mk('npc_presidenta_da_colheita', 'npc', 82, 54, 'presidenta_da_colheita', { lugar: 'barracao_da_comissao' }),
    mk('lugar_silos_do_planalto', 'lugar', 84, 63, 'silos_do_planalto'),
    mk('pc_planalto', 'ponto_controle', 48, 35, 'pc_planalto'),
    // alvos de 'desbenzer' (missão A Colheita e a aula de campo da Escola dos Saberes)
    ...espantalhos.map(([x, y], i) => mk(`espantalho_${i + 1}`, 'porta', x, y + 1, 'espantalho', { interagir: 'espantalho', acao: 'desbenzer', lugar: 'roca_coletiva' })),

    // inimigos: gafanhotos no trigo, espantalhos e fiscais perto dos silos
    bando('bando_gafanhoto_sul', 'gafanhoto_da_safra', 5, 6, 34, 58),
    bando('bando_gafanhoto_nordeste', 'gafanhoto_da_safra', 5, 6, 64, 10),
    bando('bando_gafanhoto_sudoeste', 'gafanhoto_da_safra', 5, 7, 32, 46),
    bando('bando_gafanhoto_estrada', 'gafanhoto_da_safra', 4, 6, 58, 35),
    bando('bando_espantalho_noroeste', 'espantalho_benzido', 2, 7, 26, 24),
    bando('bando_espantalho_nordeste', 'espantalho_benzido', 3, 8, 82, 22),
    bando('bando_espantalho_sudoeste', 'espantalho_benzido', 2, 7, 10, 46),
    bando('bando_fiscal_silos', 'fiscal_da_cota', 3, 8, 70, 60),
    bando('bando_fiscal_estrada', 'fiscal_da_cota', 2, 8, 62, 50),
    mk('elite_gafanhoto_rapido', 'inimigo', 66, 48, 'gafanhoto_da_safra', { tier: 'elite', affixes: ['rapido'], level: 8 }),
    // o chefe fica no canto do noroeste, longe do caminho das missões de nível 7
    mk('chefe_espantalho_mor', 'chefe', 10, 9, 'espantalho_mor'),
  ];

  c.scatter('T', 0.04, 501, ':', cellsOf(markers), 3);
  c.sprinkle('*', 0.06, 502, ':');

  return {
    id: 'planalto_do_trigo',
    legend: LEGENDA,
    rows: c.rows(),
    regions: [{ regionId: 'planalto_do_trigo', x: 0, y: 0, w: W, h: H }],
    extraMarkers: markers,
  };
}

export const PLANALTO_DO_TRIGO: AsciiMapDef = build();
