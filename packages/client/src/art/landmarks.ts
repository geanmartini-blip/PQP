/**
 * Props das margens e fachadas das instituições (Fase 3), puros como o resto da arte:
 * - Esquerda: totens, hortas, bandeirolas, casas de mutirão, lanternas, toldo da feira, caixotes;
 * - Direita: telões, cápsulas, letreiros de neon, hologramas, postes de neon, lixo;
 * - Usina: turbinas, cabos e ponte de metal;
 * - Juncal: junco e barcos.
 * Cada prop é um sprite com a base no chão (origem embaixo, no meio): os altos entram na ordem por y
 * com os bonecos; os rasos (horta, lixo, cabo, ponte) ficam logo acima do chão.
 *
 * O mapa pede um prop pela camada de decoração (TileMap.deco): o nome do valor em Deco
 * (map/maps/deco.ts) é casado com o nome do prop, então valor novo com nome conhecido já aparece.
 * As fachadas saem dos marcadores 'lugar' com params.instituicao (ou params.qg).
 *
 * SUGESTÃO: o desenho de cada prop e de cada fachada não está nos docs; sai das descrições dos
 * prédios em institutions.json ("galpão de trem", "guarita por quarteirão", "debaixo de uma
 * figueira enorme", "antigo cinema", "colada no estádio", "estúdio de gravação", "catraca por
 * mensalidade", "todo mundo é talento") e das paletas de Arte.md.
 */
import { getData } from '@pqp/shared';
import { Deco } from '@pqp/shared/map';
import { drawText, textWidth } from './font';
import { buildEmblem } from './icons';
import { hashInt } from './noise';
import { C, type Color, hex, light, mix, Pix, shade, withAlpha } from './pixel';
import { packFrames, type SheetData } from './sheet';

export const PROP_KEY = 'props';
/** variações de cada prop */
export const PROP_VARIANTS = 2;

interface PropDef {
  w: number;
  h: number;
  /** raso: fica no chão, abaixo dos bonecos */
  flat?: boolean;
  /** margem do prop (para a galeria) */
  group: 'esquerda' | 'direita' | 'usina' | 'juncal' | 'geral';
  draw: (p: Pix, v: number) => void;
}

const WOOD = [hex('#4e3019'), hex('#6b4429'), hex('#8a5a32'), hex('#a8743f'), hex('#c4935e')];
const CONC = [hex('#4a4a48'), hex('#666664'), hex('#86867f'), hex('#a4a49c')];
const STEEL = [hex('#2e3238'), hex('#4a5058'), hex('#6e767e'), hex('#9aa2aa'), hex('#c8ced4')];
const W = C.pureWhite;
const INK = C.ink;

function plank(p: Pix, x0: number, y0: number, x1: number, y1: number, v: number): void {
  for (let y = y0; y <= y1; y++) {
    const c = WOOD[1 + ((y + v) % 3 === 0 ? 0 : 1)]!;
    p.hline(x0, x1, y, (y - y0) % 4 === 3 ? WOOD[0]! : c);
  }
}

function glowDisk(p: Pix, cx: number, cy: number, r: number, c: Color): void {
  for (let k = 3; k >= 1; k--) p.disk(cx, cy, r * (k / 3) + 1, withAlpha(c, 40 + (3 - k) * 50));
}

// ---------------------------------------------------------------------------
// catálogo

export const PROPS: Record<string, PropDef> = {
  // ------------------------------------------------------------ Esquerda
  totem: {
    w: 24,
    h: 56,
    group: 'esquerda',
    draw: (p, v) => {
      // totem entalhado de 3 cabeças, com folhas e olhos de Encanto
      p.box(8, 6, 16, 55, WOOD[2]!);
      p.vline(8, 6, 55, WOOD[3]!);
      p.vline(16, 6, 55, WOOD[1]!);
      const eyes = v ? hex('#9cf08a') : hex('#f0d060');
      for (let k = 0; k < 3; k++) {
        const y = 10 + k * 15;
        p.hline(6, 18, y + 11, WOOD[0]!);
        p.box(10, y + 2, 11, y + 3, eyes);
        p.box(13, y + 2, 14, y + 3, eyes);
        p.hline(10, 14, y + 7, WOOD[0]!);
        p.put(12, y + 5, WOOD[4]!);
      }
      // asas de cima e folhas
      p.poly([[8, 8], [1, 3], [3, 10]], WOOD[3]!);
      p.poly([[16, 8], [23, 3], [21, 10]], WOOD[3]!);
      p.ellipse(12, 3, 4, 3, C.leaf);
      p.put(11, 1, light(C.leaf, 0.4));
      p.hline(5, 19, 55, WOOD[0]!);
    },
  },
  bandeirola: {
    w: 64,
    h: 40,
    group: 'esquerda',
    draw: (p, v) => {
      // dois mastros de bambu com a corda de bandeirinhas de festa da Assembleia
      for (const x of [2, 61]) {
        p.box(x, 4, x + 1, 39, hex('#b8a050'));
        p.put(x, 4, hex('#d8c070'));
      }
      const cols = [hex('#a8463f'), hex('#5e9e3a'), hex('#e8c040'), hex('#f1e6c8'), hex('#3a8ac0')];
      for (let x = 3; x <= 60; x++) {
        const y = 6 + Math.round(Math.sin(((x - 3) / 57) * Math.PI) * 7);
        p.put(x, y, hex('#3a2a1e'));
        if ((x - 3) % 6 === 1) {
          const c = cols[((x - 3) / 6 + v) % cols.length | 0]!;
          p.poly([[x, y + 1], [x + 4, y + 1], [x + 2, y + 6]], c);
          p.put(x + 1, y + 2, light(c, 0.3));
        }
      }
    },
  },
  horta: {
    w: 32,
    h: 30,
    flat: true,
    group: 'esquerda',
    draw: (p, v) => {
      // canteiro de madeira com 3 fileiras: couve, alface e tomate
      p.box(1, 4, 30, 29, hex('#4a3020'));
      p.frame(0, 3, 31, 29, WOOD[2]!);
      p.hline(0, 31, 29, WOOD[0]!);
      for (let r = 0; r < 3; r++)
        for (let k = 0; k < 4; k++) {
          const cx = 5 + k * 7 + (r % 2);
          const cy = 9 + r * 7;
          const kind = (r + v) % 3;
          if (kind === 0) {
            p.ellipse(cx, cy, 3, 2.4, hex('#3e8a32'));
            p.put(cx - 1, cy - 1, hex('#7ac85a'));
          } else if (kind === 1) {
            p.ellipse(cx, cy, 2.6, 2.2, hex('#8ad04a'));
            p.put(cx, cy, hex('#c8f08a'));
          } else {
            p.vline(cx, cy - 3, cy + 1, hex('#3e6a2a'));
            p.disk(cx - 1, cy, 1.4, C.red);
            p.disk(cx + 1, cy - 2, 1.2, hex('#e85a3a'));
          }
        }
      // plaquinha "SEU NOME NA LISTA"
      p.box(26, 0, 31, 4, C.paper);
      p.vline(28, 4, 8, WOOD[1]!);
    },
  },
  casa_mutirao: {
    w: 64,
    h: 62,
    group: 'esquerda',
    draw: (p, v) => {
      // casa de mutirão: taipa, tábuas desiguais, telhado de palha, faixa "MUTIRAO" e a fila
      p.box(6, 26, 57, 61, hex('#b88a5a'));
      for (let y = 28; y < 61; y += 5) p.hline(6, 57, y, shade(hex('#b88a5a'), 0.85));
      plank(p, 6, 26, 15, 61, v);
      plank(p, 48, 26, 57, 61, v + 1);
      p.poly([[1, 28], [32, 6], [63, 28]], hex('#c8a858'));
      for (let k = 0; k < 14; k++) p.line(4 + k * 4.2, 27, 32, 8, shade(hex('#c8a858'), 0.8));
      p.hline(1, 63, 28, hex('#8a6a30'));
      // porta e janela
      p.box(27, 42, 37, 61, WOOD[1]!);
      p.frame(27, 42, 37, 61, WOOD[0]!);
      p.put(35, 52, C.gold);
      p.box(42, 39, 50, 46, hex('#3a5a6a'));
      p.frame(42, 39, 50, 46, WOOD[0]!);
      p.vline(46, 39, 46, WOOD[0]!);
      // faixa
      p.box(9, 29, 54, 37, C.paper);
      drawTextFit(p, 9, 30, 46, 'MUTIRAO', hex('#a8463f'));
      // número na lista de espera
      p.box(17, 44, 23, 49, hex('#e8dcc0'));
      drawTextFit(p, 17, 45, 7, String(300 + ((v * 47) % 99)), INK);
    },
  },
  lanterna: {
    w: 16,
    h: 42,
    group: 'esquerda',
    draw: (p) => {
      p.box(7, 10, 8, 41, WOOD[1]!);
      p.hline(4, 11, 41, WOOD[0]!);
      p.hline(5, 10, 3, hex('#3a3a40'));
      p.box(4, 4, 11, 11, hex('#2a2a2e'));
      p.box(5, 5, 10, 10, hex('#ffd860'));
      p.put(6, 6, W);
      glowDisk(p, 7.5, 7.5, 7, hex('#ffd27a'));
    },
  },
  toldo: {
    w: 48,
    h: 44,
    group: 'esquerda',
    draw: (p, v) => {
      // barraca da feira de troca: toldo listrado, balcão com cestos
      for (const x of [3, 44]) p.box(x, 10, x + 1, 43, WOOD[1]!);
      const a = v ? hex('#5e9e3a') : hex('#a8463f');
      for (let x = 0; x < 48; x++) for (let y = 4; y < 14; y++) p.set(x, y, ((x >> 2) & 1) === 0 ? a : C.paper);
      for (let x = 0; x < 48; x += 4) p.poly([[x, 14], [x + 4, 14], [x + 2, 17]], ((x >> 2) & 1) === 0 ? a : C.paper);
      p.box(2, 30, 45, 36, WOOD[2]!);
      p.hline(2, 45, 30, WOOD[3]!);
      p.box(2, 37, 45, 43, WOOD[1]!);
      for (let k = 0; k < 4; k++) {
        p.ellipse(8 + k * 10, 28, 4, 2.5, hex('#c8a060'));
        p.disk(7 + k * 10, 26, 1.5, [C.red, hex('#e8a020'), C.leaf, hex('#a85a2a')][k]!);
        p.disk(9 + k * 10, 26, 1.5, [hex('#e85a3a'), C.warn, hex('#7ac85a'), hex('#c87a3a')][k]!);
      }
    },
  },
  caixote: {
    w: 22,
    h: 20,
    group: 'geral',
    draw: (p, v) => {
      p.box(1, 4, 20, 19, WOOD[2]!);
      p.frame(1, 4, 20, 19, WOOD[0]!);
      p.line(2, 5, 19, 18, WOOD[1]!);
      p.hline(1, 20, 4, WOOD[4]!);
      if (v) {
        p.disk(7, 3, 2, hex('#e8a020'));
        p.disk(12, 2, 2, C.red);
      }
    },
  },
  rede: {
    w: 32,
    h: 18,
    flat: true,
    group: 'juncal',
    draw: (p) => {
      const c = hex('#d8ccaa');
      for (let y = 0; y < 14; y++) for (let x = 0; x < 30; x++) if ((x + y) % 4 === 0 || (x - y + 32) % 4 === 0) p.put(x + 1, y + 2, (x + y) % 2 ? c : shade(c, 0.85));
      for (const [x, y] of [[1, 2], [30, 2], [15, 15]] as const) p.disk(x, y, 1.5, hex('#e8702a'));
    },
  },

  // ------------------------------------------------------------ Direita
  telao: {
    w: 64,
    h: 64,
    group: 'direita',
    draw: (p, v) => {
      // telão da Agência num poste de concreto: propaganda com preço dinâmico
      p.box(29, 34, 34, 63, CONC[1]!);
      p.vline(29, 34, 63, CONC[2]!);
      p.box(1, 2, 62, 36, hex('#16141f'));
      p.frame(1, 2, 62, 36, STEEL[2]!);
      const bg = v ? hex('#3a1450') : hex('#102a40');
      p.box(3, 4, 60, 34, bg);
      for (let y = 4; y < 35; y += 2) p.hline(3, 60, y, withAlpha(W, 18));
      const neon = v ? C.neonPink : C.neonCyan;
      drawTextFit(p, 5, 7, 54, v ? 'SOMOS UMA' : 'PRECO DE', W);
      drawTextFit(p, 5, 16, 54, v ? 'FAMILIA' : 'AGORA', neon);
      // gráfico subindo e o "+% "
      for (let k = 0; k < 6; k++) p.box(40 + k * 3, 32 - k * 2 - (k % 2), 41 + k * 3, 32, C.neonGreen);
      drawTextFit(p, 5, 25, 30, '+15%', C.warn);
      p.box(1, 37, 62, 38, withAlpha(neon, 150));
    },
  },
  capsula: {
    w: 48,
    h: 60,
    group: 'direita',
    draw: (p, v) => {
      // prédio de cápsulas de aluguel: 3 andares de cápsulas, cada uma com a luz de "OCUPADO"
      p.box(1, 2, 46, 59, CONC[1]!);
      p.frame(1, 2, 46, 59, CONC[0]!);
      for (let r = 0; r < 4; r++)
        for (let k = 0; k < 2; k++) {
          const x0 = 4 + k * 21;
          const y0 = 5 + r * 13;
          p.box(x0, y0, x0 + 18, y0 + 10, hex('#22242c'));
          p.ellipse(x0 + 9, y0 + 5, 7, 4, hex('#2a3a4a'));
          const lit = (r + k + v) % 3 !== 0;
          p.ellipse(x0 + 9, y0 + 5, 5, 2.5, lit ? withAlpha(hex('#ffd27a'), 200) : hex('#1a2430'));
          p.put(x0 + 16, y0 + 2, lit ? C.red : C.neonGreen);
        }
      p.hline(1, 46, 2, CONC[3]!);
      p.box(3, 1, 44, 4, hex('#14121c'));
      drawTextFit(p, 4, 51, 40, 'POR H', C.neonCyan);
    },
  },
  letreiro: {
    w: 48,
    h: 34,
    group: 'direita',
    draw: (p, v) => {
      for (const x of [6, 40]) p.box(x, 20, x + 1, 33, STEEL[1]!);
      p.box(0, 0, 47, 20, hex('#14121c'));
      p.frame(0, 0, 47, 20, STEEL[1]!);
      const c = v ? C.neonPink : C.neonPurple;
      p.frame(2, 2, 45, 18, c);
      drawTextFit(p, 4, 4, 40, v ? 'ABERTO' : '24H', light(c, 0.4));
      drawTextFit(p, 4, 12, 40, v ? 'TAXA 9%' : 'SCORE', C.neonCyan);
      glowDisk(p, 24, 10, 8, withAlpha(c, 120));
    },
  },
  holograma: {
    w: 32,
    h: 52,
    group: 'direita',
    draw: (p, v) => {
      // projetor no chão e um influencer holográfico sorrindo
      p.ellipse(16, 49, 9, 3, STEEL[1]!);
      p.ellipse(16, 48, 6, 2, C.neonCyan);
      const c = withAlpha(v ? C.neonPink : C.neonCyan, 120);
      p.poly([[10, 47], [22, 47], [26, 6], [6, 6]], withAlpha(C.neonCyan, 30));
      p.disk(16, 14, 6, c);
      p.box(10, 21, 22, 38, c);
      p.box(7, 22, 9, 32, c);
      p.box(23, 18, 25, 26, c);
      p.box(12, 39, 14, 46, c);
      p.box(18, 39, 20, 46, c);
      for (let y = 6; y < 47; y += 3) p.hline(5, 27, y, withAlpha(W, 40));
      p.put(14, 13, W);
      p.put(18, 13, W);
      p.hline(14, 18, 16, W);
    },
  },
  poste_neon: {
    w: 20,
    h: 52,
    group: 'direita',
    draw: (p, v) => {
      p.box(9, 6, 10, 51, STEEL[1]!);
      p.vline(9, 6, 51, STEEL[2]!);
      p.hline(6, 13, 51, STEEL[0]!);
      p.box(3, 3, 16, 6, STEEL[0]!);
      const c = v ? C.neonPink : C.neonCyan;
      p.hline(4, 15, 6, c);
      glowDisk(p, 9.5, 8, 7, withAlpha(c, 140));
      // câmera do Consórcio no poste
      p.box(11, 16, 15, 19, INK);
      p.put(15, 17, C.red);
    },
  },
  lixo: {
    w: 28,
    h: 20,
    flat: true,
    group: 'direita',
    draw: (p, v) => {
      p.ellipse(9, 13, 7, 6, hex('#22242a'));
      p.put(7, 9, hex('#4a4e56'));
      p.box(8, 6, 10, 8, hex('#3a3e46'));
      p.ellipse(19, 15, 6, 4, hex('#2a2e34'));
      // copo de app e boleto amassado
      p.box(22, 7, 25, 12, v ? C.neonPink : hex('#ff6a13'));
      p.hline(22, 25, 7, W);
      p.box(3, 16, 8, 19, C.paper);
      p.hline(4, 7, 17, INK);
    },
  },

  // ------------------------------------------------------------ Usina
  turbina: {
    w: 64,
    h: 64,
    group: 'usina',
    draw: (p, v) => {
      // turbina da Usina da Ponte: carcaça de aço, rotor com pás e luzes de aviso
      p.box(4, 24, 59, 63, STEEL[1]!);
      p.frame(4, 24, 59, 63, STEEL[0]!);
      for (let y = 28; y < 63; y += 6) p.hline(5, 58, y, STEEL[2]!);
      p.disk(32, 28, 22, STEEL[0]!);
      p.disk(32, 28, 20, STEEL[2]!);
      p.disk(32, 28, 17, hex('#1a1e24'));
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + v * 0.5;
        p.poly(
          [
            [32, 28],
            [32 + Math.cos(a - 0.25) * 16, 28 + Math.sin(a - 0.25) * 16],
            [32 + Math.cos(a + 0.15) * 16, 28 + Math.sin(a + 0.15) * 16],
          ],
          STEEL[3]!,
        );
      }
      p.disk(32, 28, 4, STEEL[4]!);
      p.put(31, 27, W);
      // cor de chope da chopindita no visor e a faixa de alerta
      for (let x = 6; x < 58; x++) p.set(x, 58, ((x >> 2) & 1) === 0 ? C.warn : INK);
      p.box(46, 44, 55, 52, hex('#2a1a0a'));
      p.box(47, 45, 54, 51, hex('#e8a830'));
      p.hline(47, 54, 45, hex('#fff0c0'));
      for (const x of [8, 55]) p.disk(x, 27, 1.5, C.red);
    },
  },
  cabo: {
    w: 32,
    h: 16,
    flat: true,
    group: 'usina',
    draw: (p, v) => {
      // cabos grossos no chão, presos por grampos
      for (let k = 0; k < 2; k++)
        for (let x = 0; x < 32; x++) {
          const y = 5 + k * 5 + Math.round(Math.sin((x + v * 7 + k * 9) / 5) * 1.5);
          p.set(x, y, k ? hex('#2a2a30') : hex('#3a2a20'));
          p.set(x, y + 1, k ? hex('#18181c') : hex('#22160e'));
          if (x % 9 === 4) p.box(x, y - 1, x + 1, y + 2, STEEL[3]!);
        }
      p.put(28, 4, C.warn);
    },
  },
  ponte_metal: {
    w: 32,
    h: 32,
    flat: true,
    group: 'usina',
    draw: (p) => {
      // grade de aço da ponte da Usina, com rebites e o rio aparecendo pelas frestas
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, (x % 4 === 0 || y % 4 === 0) ? STEEL[1]! : withAlpha(hex('#1f4a74'), 110));
      p.hline(0, 31, 0, STEEL[3]!);
      p.hline(0, 31, 31, STEEL[0]!);
      for (const x of [2, 14, 26]) {
        p.put(x, 2, STEEL[4]!);
        p.put(x, 29, STEEL[4]!);
      }
    },
  },
  torre_cabos: {
    w: 40,
    h: 64,
    group: 'usina',
    draw: (p) => {
      // torre de transmissão em treliça, com os isoladores
      p.line(6, 63, 18, 4, STEEL[1]!);
      p.line(33, 63, 21, 4, STEEL[1]!);
      for (let y = 10; y < 63; y += 8) {
        const t = (y - 4) / 59;
        const xl = 18 - t * 12;
        const xr = 21 + t * 12;
        p.hline(Math.round(xl), Math.round(xr), y, STEEL[2]!);
        p.line(xl, y, xr, y + 8, STEEL[0]!);
      }
      p.hline(2, 37, 12, STEEL[2]!);
      p.hline(6, 33, 22, STEEL[2]!);
      for (const x of [3, 36, 7, 32]) p.box(x, x < 10 || x > 30 ? 13 : 23, x + 1, (x < 10 || x > 30 ? 13 : 23) + 3, hex('#8ac0e0'));
      p.disk(19.5, 3, 1.5, C.red);
    },
  },

  // ------------------------------------------------------------ Juncal
  junco: {
    w: 28,
    h: 30,
    group: 'juncal',
    draw: (p, v) => {
      for (let k = 0; k < 9; k++) {
        const x = 2 + ((k * 7 + v * 3) % 24);
        const hgt = 14 + ((k * 5) % 13);
        for (let j = 0; j < hgt; j++) p.put(x + (j > hgt - 5 ? (k % 2 ? 1 : -1) : 0), 29 - j, j === hgt - 1 ? hex('#a8b860') : j > hgt - 5 ? hex('#6a9a3e') : hex('#4e7a32'));
        if (k % 3 === 0) p.box(x, 29 - hgt - 2, x + 1, 29 - hgt + 1, hex('#7a4a2a'));
      }
      p.ellipse(14, 29, 12, 1.5, withAlpha(hex('#132f50'), 120));
    },
  },
  barco: {
    w: 48,
    h: 26,
    group: 'juncal',
    draw: (p, v) => {
      // canoa de contrabando com lona por cima e um remo
      const hull = v ? hex('#3a6e8c') : hex('#a8463f');
      p.poly([[1, 10], [47, 10], [42, 21], [6, 21]], hull);
      p.hline(1, 47, 10, light(hull, 0.3));
      p.hline(6, 42, 21, shade(hull, 0.6));
      p.box(4, 11, 44, 13, WOOD[2]!);
      p.ellipse(22, 8, 12, 4, hex('#5a6a3a'));
      p.hline(12, 32, 8, hex('#7a8a4a'));
      p.line(34, 3, 46, 20, WOOD[3]!);
      p.ellipse(24, 23, 22, 2.5, withAlpha(hex('#eef8f2'), 110));
    },
  },
};

/** Texto que cabe na largura (escala 1; corta letras se precisar). */
function drawTextFit(p: Pix, x: number, y: number, w: number, text: string, c: Color): void {
  let t = text;
  while (t.length > 1 && textWidth(t, 1) > w) t = t.slice(0, -1);
  drawText(p, x + Math.max(0, Math.floor((w - textWidth(t, 1)) / 2)), y, t, c, 1);
}

// ---------------------------------------------------------------------------
// decoração do mapa -> prop

/** Apelidos: nome normalizado do valor em Deco -> prop. */
const DECO_ALIASES: Record<string, string> = {
  totem: 'totem',
  bandeirola: 'bandeirola',
  bandeirolas: 'bandeirola',
  horta: 'horta',
  casamutirao: 'casa_mutirao',
  mutirao: 'casa_mutirao',
  casa: 'casa_mutirao',
  lanterna: 'lanterna',
  lampiao: 'lanterna',
  toldo: 'toldo',
  barraca: 'toldo',
  caixote: 'caixote',
  rede: 'rede',
  telao: 'telao',
  capsula: 'capsula',
  capsulas: 'capsula',
  letreiro: 'letreiro',
  neon: 'letreiro',
  holograma: 'holograma',
  poste: 'poste_neon',
  posteneon: 'poste_neon',
  lixo: 'lixo',
  turbina: 'turbina',
  cabo: 'cabo',
  cabos: 'cabo',
  pontemetal: 'ponte_metal',
  metal: 'ponte_metal',
  torre: 'torre_cabos',
  torrecabos: 'torre_cabos',
  junco: 'junco',
  barco: 'barco',
};

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

let decoMap: Map<number, string> | undefined;

/** Prop de um valor de decoração do mapa (undefined: o terreno desenha, como Flor, Concha e Tábua). */
export function propForDeco(value: number): string | undefined {
  if (!decoMap) {
    decoMap = new Map();
    for (const [name, val] of Object.entries(Deco)) {
      const prop = DECO_ALIASES[norm(name)];
      if (prop && typeof val === 'number') decoMap.set(val, prop);
    }
  }
  return decoMap.get(value);
}

/** Quadro do prop (variação estável pela posição). */
export function propFrame(prop: string, x: number, y: number): string {
  return `prop_${prop}_${hashInt(x, y, 151) % PROP_VARIANTS}`;
}

/** Quadro da fachada de uma instituição ou QG. */
export const facadeFrame = (id: string) => `fachada_${id}`;

/** O prop é raso (fica no chão, abaixo dos bonecos)? */
export const propIsFlat = (prop: string) => PROPS[prop]?.flat === true;

function drawProp(prop: string, v: number): Pix {
  const def = PROPS[prop]!;
  const p = new Pix(def.w, def.h);
  def.draw(p, v);
  p.outline({ minAlpha: 160 });
  return p;
}

// ---------------------------------------------------------------------------
// fachadas

/** SUGESTÃO: os textos das placas das fachadas. */
const FACADE_TEXT: Record<string, string> = {
  brigada_popular: 'BRIGADA',
  guarda_comunitaria: 'GUARDA',
  escola_dos_saberes: 'ESCOLA',
  trupe_do_povo: 'CINEMA',
  torcida_furia_neon: 'FURIA',
  pm_do_consorcio: 'BATALHAO',
  universidade_neon: 'UNI NEON',
  agencia_neon: 'AGENCIA',
  casa_da_assembleia: 'PLENARIA',
  torre_do_consorcio: 'TORRE',
};

/** Emblema 64x64 reduzido para 24x24 (amostra do vizinho mais perto). */
function smallEmblem(id: string, size = 24): Pix {
  const e = buildEmblem(id);
  const out = new Pix(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out.set(x, y, e.get(Math.floor(((x + 0.5) * e.w) / size), Math.floor(((y + 0.5) * e.h) / size)));
  return out;
}

/**
 * Fachada 64x64 na porta da sede: a placa com o emblema e o nome, e o elemento que faz o prédio
 * ser reconhecido de longe.
 */
export function buildFacade(id: string): Pix {
  const d = getData();
  const inst = d.institutionsById.get(id);
  const side = String(inst?.margem ?? (id === 'torre_do_consorcio' ? 'direita' : 'esquerda'));
  const left = !side.includes('direita');
  const accent = inst ? hex(inst.corDestaque.hex) : left ? hex('#5b6b2e') : C.neonPink;
  const p = new Pix(64, 64);
  const post = left ? WOOD[1]! : STEEL[1]!;
  // elemento próprio de cada prédio (atrás da placa)
  switch (id) {
    case 'brigada_popular':
      // galpão de trem: arco de tijolo, trilhos e o sino da estação
      p.box(4, 8, 59, 40, hex('#8a3a2a'));
      p.disk(32, 22, 22, hex('#a8463f'));
      p.box(14, 22, 49, 40, hex('#2a1a14'));
      for (let y = 10; y < 40; y += 4) p.hline(4, 9, y, hex('#6a2a1e'));
      for (const x of [22, 41]) p.vline(x, 40, 63, STEEL[2]!);
      for (let y = 44; y < 64; y += 5) p.hline(18, 45, y, WOOD[1]!);
      p.disk(32, 5, 3, C.gold);
      break;
    case 'guarda_comunitaria':
      // guarita de quarteirão com o binóculo na janela
      p.box(36, 10, 60, 50, hex('#6a7a3a'));
      p.poly([[34, 12], [48, 2], [62, 12]], hex('#4a5a2a'));
      p.box(40, 18, 56, 30, hex('#2a3a4a'));
      p.box(44, 22, 52, 25, INK);
      p.disk(45, 23.5, 1.5, hex('#8ac0e0'));
      p.disk(51, 23.5, 1.5, hex('#8ac0e0'));
      for (let x = 36; x < 61; x += 4) p.set(x, 46, accent);
      break;
    case 'escola_dos_saberes':
      // galho da figueira enorme por cima, com livros pendurados
      p.ellipse(32, 10, 31, 11, hex('#3a7a30'));
      p.ellipse(18, 8, 12, 7, hex('#4b923a'));
      p.ellipse(46, 12, 12, 6, hex('#2c5e26'));
      p.box(56, 10, 61, 63, hex('#6a4a2a'));
      for (const x of [12, 26, 40]) {
        p.vline(x, 14, 22, hex('#3a2a1e'));
        p.box(x - 3, 22, x + 3, 27, [hex('#a8463f'), hex('#3a8ac0'), hex('#e8c040')][x % 3]!);
      }
      break;
    case 'trupe_do_povo':
      // marquise do antigo cinema com lâmpadas
      p.box(0, 4, 63, 18, hex('#5a1a2a'));
      p.frame(0, 4, 63, 18, C.gold);
      for (let x = 2; x < 63; x += 4) {
        p.put(x, 6, C.warn);
        p.put(x, 16, C.warn);
      }
      drawTextFit(p, 2, 8, 60, 'HOJE: TUDO', C.paper);
      p.box(6, 18, 9, 63, hex('#3a1a1e'));
      p.box(54, 18, 57, 63, hex('#3a1a1e'));
      break;
    case 'torcida_furia_neon':
      // arquibancada colada no estádio e o refletor
      for (let k = 0; k < 4; k++) p.box(0, 10 + k * 6, 63, 14 + k * 6, k % 2 ? CONC[1]! : CONC[2]!);
      for (let x = 2; x < 62; x += 6) p.box(x, 8, x + 3, 12, accent);
      p.box(56, 0, 62, 6, STEEL[2]!);
      glowDisk(p, 59, 3, 6, withAlpha(W, 160));
      p.box(4, 2, 30, 7, C.neonGreen);
      drawTextFit(p, 4, 1, 27, 'GOL', INK);
      break;
    case 'pm_do_consorcio':
      // batalhão com estúdio: luz de "GRAVANDO" e câmera
      p.box(2, 6, 61, 34, CONC[1]!);
      p.frame(2, 6, 61, 34, CONC[0]!);
      p.box(40, 9, 58, 15, hex('#3a0a0a'));
      drawTextFit(p, 40, 9, 19, 'REC', C.red);
      p.disk(42, 12, 1.5, C.red);
      p.box(6, 10, 14, 15, INK);
      p.box(14, 11, 17, 14, STEEL[2]!);
      p.put(7, 11, C.red);
      break;
    case 'universidade_neon':
      // catraca por mensalidade na frente
      p.box(4, 4, 59, 30, hex('#22283a'));
      for (let x = 6; x < 58; x += 5) p.vline(x, 6, 28, withAlpha(C.neonCyan, 60));
      for (const x of [10, 50]) {
        p.box(x - 3, 42, x + 3, 62, STEEL[2]!);
        p.hline(x - 3, x + 9, 50, C.warn);
        p.put(x, 44, C.neonGreen);
      }
      break;
    case 'agencia_neon':
      // estrela de neon gigante e tapete vermelho de talento
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const b = -Math.PI / 2 + ((k + 1) * Math.PI) / 5;
        const r1 = k % 2 ? 7 : 16;
        const r2 = k % 2 ? 16 : 7;
        p.line(32 + Math.cos(a) * r1, 14 + Math.sin(a) * r1, 32 + Math.cos(b) * r2, 14 + Math.sin(b) * r2, C.neonPink);
      }
      p.poly([[24, 63], [40, 63], [36, 44], [28, 44]], hex('#b02a3a'));
      break;
    case 'casa_da_assembleia':
      // estandarte com as fitas e a urna de voto
      p.box(14, 2, 49, 36, hex('#5b6b2e'));
      for (let k = 0; k < 5; k++) p.vline(16 + k * 7, 36, 42 + (k % 2) * 3, [C.red, C.warn, C.paper, C.leaf, hex('#3a8ac0')][k]!);
      p.box(26, 48, 38, 60, WOOD[2]!);
      p.hline(29, 35, 49, INK);
      break;
    case 'torre_do_consorcio':
      p.box(18, 0, 45, 40, hex('#2a4a6a'));
      for (let y = 2; y < 40; y += 4) p.hline(20, 43, y, withAlpha(C.neonCyan, 120));
      p.box(24, 48, 40, 60, CONC[2]!);
      drawTextFit(p, 24, 52, 17, 'VIP', C.gold);
      break;
  }
  // placa nos dois postes, com emblema e nome
  for (const x of [8, 54]) p.box(x, 34, x + 2, 63, post);
  p.box(4, 24, 59, 46, left ? WOOD[2]! : hex('#16141f'));
  p.frame(4, 24, 59, 46, left ? WOOD[0]! : accent);
  if (!left) p.frame(5, 25, 58, 45, withAlpha(accent, 120));
  // emblema pendurado em cima da placa; o nome ocupa a placa toda
  p.blit(smallEmblem(id, 18), 23, 8);
  drawTextFit(p, 6, 30, 52, FACADE_TEXT[id] ?? id.slice(0, 8).toUpperCase(), left ? C.paper : light(accent, 0.3));
  p.hline(8, 55, 40, mix(accent, left ? WOOD[2]! : INK, 0.3));
  p.outline({ minAlpha: 160 });
  return p;
}

/** Todas as ids com fachada: as 8 instituições e os 2 QGs. */
export function facadeIds(): string[] {
  const d = getData();
  return [...d.institutions.instituicoes.map((i) => i.id), 'casa_da_assembleia', 'torre_do_consorcio'];
}

let propCache: SheetData | undefined;

/** Folha dos props e fachadas (puro, em cache): quadros `prop_${nome}_${v}` e `fachada_${id}`. */
export function buildPropSheet(): SheetData {
  if (propCache) return propCache;
  const items: { name: string; pix: Pix }[] = [];
  for (const name of Object.keys(PROPS)) for (let v = 0; v < PROP_VARIANTS; v++) items.push({ name: `prop_${name}_${v}`, pix: drawProp(name, v) });
  for (const id of facadeIds()) items.push({ name: facadeFrame(id), pix: buildFacade(id) });
  propCache = packFrames(PROP_KEY, items, 1024);
  return propCache;
}

/** Props por grupo (galeria). */
export function propsByGroup(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [name, def] of Object.entries(PROPS)) (out[def.group] ??= []).push(name);
  return out;
}
