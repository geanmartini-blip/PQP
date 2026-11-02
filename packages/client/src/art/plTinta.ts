/**
 * v0.4: a criação aparece no boneco base do PixelLab. A folha base tem paleta fechada (pele laranja,
 * cabelo castanho-escuro, camiseta cinza); cada cor dessas vira a pele, o cabelo e a cor da camiseta
 * do visual, com a mesma luz e sombra (a razão de luminância contra a cor de referência). Contorno,
 * olhos, calça e chinelo ficam como estão. Puro: roda no Node.
 */
import { getData } from '@pqp/shared';
import { type CharacterLook } from './contract';
import { findTier, paletteOfLook } from './character';
import { B, type Color, G, hex, R } from './pixel';

/** cores da folha base (public/pl/base/folha.png), por parte, e a de referência (a mais comum) */
const PELE_BASE = ['#fbb88a', '#e99b6d', '#dd8d61', '#ce7f54', '#b76b47', '#a45337', '#cd764f', '#9f5942', '#ba744f', '#7e452f', '#f4bf9f'];
const CABELO_BASE = ['#291a19', '#3e2c28', '#5a4641', '#54392e'];
const ROUPA_BASE = ['#afacaf', '#747275', '#c9c6c9', '#a5a2a8', '#adaaad', '#989699', '#b7b3b5', '#aeaaad', '#aeabad', '#7e817f', '#64656c', '#a8a4a7', '#5e5656'];

export interface Tinta {
  pele: string;
  cabelo: string;
  roupa: string;
}

/** A pele, o cabelo e a cor da camiseta deste visual (o padrão de appearance.json quando falta). */
export function tintaDe(look: CharacterLook): Tinta {
  const ap = getData().appearance;
  const pele = ap.peles.find((x) => x.id === look.skin || x.artKey === look.skin) ?? ap.peles.find((x) => x.id === ap.padrao.skin)!;
  const cab =
    ap.coresCabelo.find((x) => x.id === look.hairColor || x.artKey === look.hairColor) ??
    ap.coresCabelo.find((x) => x.id === ap.padrao.hair_color)!;
  const c = paletteOfLook(look, findTier(look))[0]!;
  const roupa = '#' + [R(c), G(c), B(c)].map((v) => v.toString(16).padStart(2, '0')).join('');
  return { pele: pele.hex.toLowerCase(), cabelo: cab.hex.toLowerCase(), roupa: roupa.toLowerCase() };
}

export const tintaKey = (t: Tinta): string => `${t.pele}${t.cabelo}${t.roupa}`.replace(/#/g, '');

const lum = (c: Color) => 0.299 * R(c) + 0.587 * G(c) + 0.114 * B(c);
const rgb24 = (c: Color) => ((R(c) << 16) | (G(c) << 8) | B(c)) >>> 0;

/**
 * Leva a cor alvo à luz da cor de origem: a sombra multiplica (razão de luminância) e o brilho soma a
 * diferença de luminância, para o cabelo escuro da base não estourar no branco.
 */
function naLuz(alvo: Color, origem: Color, ref: Color): [number, number, number] {
  const ch = [R(alvo), G(alvo), B(alvo)];
  const d = lum(origem) - lum(ref);
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  if (d <= 0) return ch.map((v) => cl((v * lum(origem)) / lum(ref))) as [number, number, number];
  return ch.map((v) => cl(v + d)) as [number, number, number];
}

/** Troca de cor: rgb da folha base (0xRRGGBB) → [r, g, b] do visual. */
export function trocaDeCor(t: Tinta): Map<number, [number, number, number]> {
  const m = new Map<number, [number, number, number]>();
  for (const [lista, alvo] of [[PELE_BASE, t.pele], [CABELO_BASE, t.cabelo], [ROUPA_BASE, t.roupa]] as const) {
    const ref = hex(lista[0]!);
    const a = hex(alvo);
    for (const s of lista) m.set(rgb24(hex(s)), naLuz(a, hex(s), ref));
  }
  return m;
}

/** O cabelo fica na cabeça: abaixo disto (fração da altura do quadro), o marrom-escuro é contorno da calça e do chinelo. */
const CABECA = 0.45;
const CABELO_RGB = new Set(CABELO_BASE.map((s) => rgb24(hex(s))));

/** Pinta os pixels RGBA (ImageData.data) da folha base com a tinta; a folha tem `largura` px e quadros de `alturaQuadro` px. */
export function pintar(px: Uint8ClampedArray, t: Tinta, largura = Infinity, alturaQuadro = Infinity): void {
  const m = trocaDeCor(t);
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3]! < 8) continue;
    const cor = (px[i]! << 16) | (px[i + 1]! << 8) | px[i + 2]!;
    const novo = m.get(cor);
    if (!novo) continue;
    if (CABELO_RGB.has(cor) && Math.floor(i / 4 / largura) % alturaQuadro >= alturaQuadro * CABECA) continue;
    px[i] = novo[0];
    px[i + 1] = novo[1];
    px[i + 2] = novo[2];
  }
}
