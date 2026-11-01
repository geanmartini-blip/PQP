/**
 * Mapinha de demonstração do terreno (galeria e testes): todos os materiais, transições, palafita
 * sobre a água, casa, cerca, pedras, mato e árvores, nos 3 estilos (Esquerda, Direita, Delta).
 * SUGESTÃO: só visual, não é um lugar do jogo.
 */
import { Tile } from '@pqp/shared/map';
import type { Style, TerrainSource } from './terrain';

const LEG: Record<string, number> = {
  '~': Tile.AguaFunda,
  ',': Tile.AguaRasa,
  '.': Tile.Terra,
  ':': Tile.Grama,
  ';': Tile.Mato,
  '%': Tile.Lama,
  s: Tile.Areia,
  '=': Tile.Madeira,
  '#': Tile.Parede,
  T: Tile.Arvore,
  o: Tile.Pedra,
  '+': Tile.Cerca,
  D: Tile.Porta,
  c: Tile.Concreto,
  a: Tile.Asfalto,
  n: Tile.PisoNeon,
  g: Tile.Grade,
  m: Tile.Maquina,
};

// prettier-ignore
export const DEMO_ROWS: readonly string[] = [
  '~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~,,,,,,~~~~~~~~,,,,~~~~',
  '~,,ssss,,,~~~~,,,sss,,~~',
  '~,sss::ss,,,,,,ss:::s,~~',
  '~,s:::T::s======s::T:s,~',
  '~,s:T:;;:s======s:;;:s,~',
  '~,s::;;;:ss====ss:;o:s,~',
  '~,,s:...:::::::::...s,,~',
  '~~,s:.o..%%%%%::.T.:s,~~',
  '~~,s:...%%%%%%%:...:s,~~',
  '~~,,s::::%%%%:::::::s,~~',
  '~~~,ss::+++++++::T:ss,~~',
  '~~~,,s:+:;;:;;+::::s,,~~',
  '~~~~,s:+:o::T:+::::s,~~~',
  '~~~~,ss+++::+++::ss,,~~~',
  '~~~~~,,ssss::sssss,,~~~~',
  '~~~~~~~,,,====,,,,~~~~~~',
  '~~~~~~~,######,,,,~~~~~~',
  '~~~~~~~,#====#,,~~~~~~~~',
  '~~~~~~~,##D###,~~~~~~~~~',
  '~~~~~~~,,====,,~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~',
];

// prettier-ignore
export const DEMO_CITY_ROWS: readonly string[] = [
  'cccccccccccccccc',
  'c####cccc####ccc',
  'c####cccc#D##ccc',
  'cccccccccccccccc',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'ccTcccnnnnccTccc',
  'ccccccnnnncgggcc',
  '::::ccnnnncmmccc',
  ':T::cccccccccc::',
];

/** Fonte de terreno de um desenho ASCII num estilo. */
export function asciiSource(rows: readonly string[], style: Style): TerrainSource {
  const h = rows.length;
  const w = rows[0]!.length;
  const cl = (v: number, n: number) => (v < 0 ? 0 : v >= n ? n - 1 : v);
  return {
    width: w,
    height: h,
    tile: (x, y) => LEG[rows[cl(y, h)]![cl(x, w)]!] ?? Tile.Grama,
    style: () => style,
  };
}
