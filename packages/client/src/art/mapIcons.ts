/**
 * Marcas de mapa da Fase 5 (entram na folha de efeitos de fx.ts):
 * - crachá "DE PLANTÃO" sobre a cabeça do plantonista (personagem offline lutando pela Doutrina),
 *   um por margem: `fx_plantao_esquerda`, `fx_plantao_direita`, `fx_plantao_neutro`;
 * - ícone de ponto de controle por margem: `fx_ponto_esquerda` (mastro de madeira com bandeira de
 *   pano e folha), `fx_ponto_direita` (antena com bandeira holográfica e luz piscando) e
 *   `fx_ponto_neutro` (mastro sem dono, bandeira branca rasgada), mais `fx_ponto_disputa`
 *   (as duas bandeiras se empurrando).
 *
 * SUGESTÃO: os desenhos não estão nos docs (só o crachá "de plantão" está no pedido da fase).
 */
import { C, type Color, hex, light, Pix, shade, withAlpha } from './pixel';

export type MapSide = 'esquerda' | 'direita' | 'neutro';

function frames(n: number, w: number, h: number, draw: (p: Pix, i: number) => void): Pix[] {
  return Array.from({ length: n }, (_, i) => {
    const p = new Pix(w, h);
    draw(p, i);
    return p;
  });
}

// letra miúda legível de 3x5 para o crachá (só as letras que ele usa)
const MINI: Record<string, number[]> = {
  D: [6, 5, 5, 5, 6],
  E: [7, 4, 6, 4, 7],
  P: [6, 5, 6, 4, 4],
  L: [4, 4, 4, 4, 7],
  A: [2, 5, 7, 5, 5],
  N: [5, 7, 7, 7, 5],
  T: [7, 2, 2, 2, 2],
  O: [2, 5, 5, 5, 2],
};

/** Escreve em letra 3x5; devolve a largura usada. */
export function miniText(p: Pix, x: number, y: number, text: string, c: Color): number {
  let cx = x;
  for (const ch of text) {
    const g = MINI[ch];
    if (g) for (let r = 0; r < 5; r++) for (let b = 0; b < 3; b++) if (g[r]! & (4 >> b)) p.set(cx + b, y + r, c);
    cx += 4;
  }
  return cx - x - 1;
}

const SIDE_BAND: Record<MapSide, Color> = {
  esquerda: hex('#5b8e3a'),
  direita: C.neonCyan,
  neutro: hex('#e0b030'),
};

/** Crachá "DE PLANTÃO" pendurado no cordão, com a luz vermelha de "em serviço" piscando. */
export function plantaoBadge(side: MapSide): Pix[] {
  return frames(2, 36, 24, (p, i) => {
    const band = SIDE_BAND[side];
    // cordão
    p.line(11, 0, 15, 5, shade(band, 0.7));
    p.line(24, 0, 20, 5, shade(band, 0.7));
    p.box(16, 4, 19, 6, C.metal);
    // cartão
    const bob = i;
    p.box(1, 6 + bob, 34, 21 + bob, hex('#f4f0e6'));
    p.box(1, 6 + bob, 34, 8 + bob, band);
    p.frame(1, 6 + bob, 34, 21 + bob, hex('#3a3440'));
    // "DE" em cima, "PLANTÃO" embaixo (o til no segundo A)
    const ink = hex('#2a2430');
    miniText(p, 4, 9 + bob, 'DE', ink);
    miniText(p, 4, 15 + bob, 'PLANTAO', ink);
    const tx = 4 + 5 * 4;
    p.set(tx, 14 + bob, ink);
    p.set(tx + 1, 13 + bob, ink);
    p.set(tx + 2, 14 + bob, ink);
    p.set(tx + 3, 13 + bob, ink);
    // luz de "em serviço"
    p.disk(29, 11 + bob, 2.2, i ? hex('#ff3a2a') : hex('#7a1a14'));
    if (i) p.set(28, 10 + bob, light(hex('#ff3a2a'), 0.6));
    p.outline({ color: withAlpha(hex('#140c16'), 255), minAlpha: 200 });
  });
}

/** Ícone de ponto de controle: 32x40, origem nos pés do mastro. */
export function controlPoint(side: MapSide | 'disputa'): Pix[] {
  return frames(4, 32, 40, (p, i) => {
    // base: pedras na Esquerda, sapata de concreto na Direita
    p.ellipse(16, 37, 11, 3, withAlpha(hex('#000000'), 90));
    if (side === 'esquerda') {
      for (const [x, r] of [
        [11, 3.2],
        [16, 3.8],
        [21, 3],
      ] as const)
        p.ellipse(x, 35, r, 2.4, hex('#7a6a5a'));
    } else if (side === 'direita') {
      p.box(10, 33, 22, 37, hex('#6e6a64'));
      p.hline(10, 22, 33, hex('#8a857c'));
    } else p.box(12, 34, 20, 37, hex('#5a5a5e'));
    // mastro
    const pole = side === 'esquerda' ? hex('#7a5232') : side === 'direita' ? hex('#8e949c') : hex('#9a9aa0');
    p.box(15, 4, 16, 35, pole);
    p.vline(15, 4, 35, light(pole, 0.3));
    const wave = [0, 1, 0, -1][i]!;
    const flag = (x0: number, dir: 1 | -1, col: Color, holo: boolean) => {
      for (let k = 0; k < 12; k++) {
        const x = x0 + dir * k;
        const off = Math.round(Math.sin((k + i * 3) / 3) * 1.2) + (k > 6 ? wave : 0);
        for (let y = 5; y <= 14; y++) {
          const c = holo ? withAlpha(y % 2 ? col : light(col, 0.35), 200) : y > 11 ? shade(col, 0.8) : col;
          p.put(x, y + off, c);
        }
      }
    };
    if (side === 'esquerda') {
      flag(17, 1, hex('#5b8e3a'), false);
      // folha bordada
      p.ellipse(22, 9 + (i === 1 ? 1 : 0), 2.5, 1.6, hex('#c8e0a0'));
      p.set(21, 10, hex('#3a6a2a'));
    } else if (side === 'direita') {
      flag(17, 1, C.neonCyan, true);
      // antena com luz piscando no topo
      p.box(14, 1, 17, 3, hex('#5a5e66'));
      p.set(15, 0, i % 2 ? hex('#ff3ea5') : hex('#7a1a4a'));
      p.set(16, 0, i % 2 ? hex('#ff3ea5') : hex('#7a1a4a'));
      p.hline(18 + i, 21 + i, 9, withAlpha(C.pureWhite, 200)); // grafismo do holograma
    } else if (side === 'neutro') {
      flag(17, 1, hex('#e8e4d6'), false);
      // rasgo na ponta
      p.set(28, 8, 0);
      p.set(27, 9, 0);
      p.set(28, 12, 0);
    } else {
      // disputa: uma bandeira de cada lado do mastro
      flag(14, -1, hex('#5b8e3a'), false);
      flag(17, 1, C.neonCyan, true);
      p.set(15, 2, i % 2 ? C.warn : C.pureWhite);
    }
    p.outlineSelective(150);
  });
}
