/**
 * Motivos dos ícones das 48 habilidades marca dos arquétipos (Fase 3), desenhados num quadro de
 * 24x24 a partir de (x, y). Cada um sai do adereço ou da pose descrita em Arte.md.
 *
 * SUGESTÃO: o desenho de cada ícone não está nos docs; a escolha do motivo segue o nome da
 * habilidade e a ficha da ala.
 */
import { C, type Color, hex, light, Pix, shade, withAlpha } from './pixel';

type MotifFn = (p: Pix, x: number, y: number, accent: Color) => void;

const W = C.pureWhite;
const INK = C.ink;
const WOOD = hex('#8a5a32');
const WOOD_D = hex('#5a3a20');

function clear(p: Pix, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) p.set(x, y, 0);
}

export const MARK_MOTIFS: Record<string, MotifFn> = {
  lotus: (p, x, y) => {
    for (const [dx, dy, r] of [[-6, 2, 4], [6, 2, 4], [0, -2, 5]] as const) p.ellipse(x + 12 + dx, y + 12 + dy, r * 0.7, r, hex('#8ab8f0'));
    p.ellipse(x + 12, y + 17, 10, 3, hex('#4a8ad8'));
    p.ring(x + 12, y + 12, 11, 10, 1, withAlpha(hex('#9ad0ff'), 180));
  },
  tigre: (p, x, y) => {
    p.ellipse(x + 12, y + 13, 9, 8, hex('#e8902a'));
    p.disk(x + 5, y + 5, 3, hex('#e8902a'));
    p.disk(x + 19, y + 5, 3, hex('#e8902a'));
    for (const k of [-5, 0, 5]) p.line(x + 12 + k, y + 6, x + 12 + k * 0.6, y + 10, INK);
    p.put(x + 8, y + 12, W);
    p.put(x + 16, y + 12, W);
    p.box(x + 9, y + 17, x + 15, y + 19, hex('#f4e8d0'));
    p.put(x + 12, y + 16, INK);
  },
  cadeira: (p, x, y) => {
    for (const ox of [2, 13]) {
      p.box(x + ox, y + 4, x + ox + 1, y + 20, hex('#2a2a30'));
      p.ellipse(x + ox + 4, y + 12, 5, 2, hex('#a8463f'));
      p.box(x + ox + 7, y + 12, x + ox + 8, y + 20, hex('#2a2a30'));
      p.ring(x + ox + 3, y + 6, 3, 3, 1, hex('#2a2a30'));
    }
  },
  placa: (p, x, y, a) => {
    p.box(x + 11, y + 12, x + 13, y + 23, WOOD);
    p.box(x + 2, y + 2, x + 22, y + 13, hex('#f1e6c8'));
    p.frame(x + 2, y + 2, x + 22, y + 13, WOOD_D);
    for (let k = 0; k < 3; k++) p.hline(x + 5, x + 19 - k * 3, y + 5 + k * 3, a);
  },
  xale: (p, x, y) => {
    p.poly([[x + 1, y + 4], [x + 23, y + 4], [x + 12, y + 23]], hex('#c86a8a'));
    for (let k = 0; k < 5; k++) p.line(x + 3 + k * 4, y + 5, x + 12, y + 21, withAlpha(hex('#f4d0e0'), 180));
    for (let k = 0; k < 6; k++) p.vline(x + 2 + k * 4, y + 2, y + 4, hex('#f4d0e0'));
  },
  flecha: (p, x, y) => {
    p.ring(x + 12, y + 12, 10, 10, 1, withAlpha(W, 120));
    p.line(x + 3, y + 21, x + 20, y + 4, hex('#c8a070'));
    p.poly([[x + 21, y + 2], [x + 22, y + 9], [x + 15, y + 3]], C.silver);
    p.line(x + 3, y + 21, x + 1, y + 17, hex('#e8e0c8'));
    p.line(x + 3, y + 21, x + 7, y + 23, hex('#e8e0c8'));
  },
  ferradura: (p, x, y) => {
    p.ring(x + 12, y + 11, 9, 9, 3, C.silver);
    clear(p, x + 9, y + 15, x + 15, y + 23);
    for (const [dx, dy] of [[-7, 4], [7, 4], [-8, -2], [8, -2]] as const) p.put(x + 12 + dx, y + 11 + dy, INK);
    for (let k = 0; k < 3; k++) p.hline(x + 1, x + 5, y + 18 + k * 2, withAlpha(W, 150));
  },
  croco: (p, x, y) => {
    p.poly([[x + 1, y + 10], [x + 18, y + 7], [x + 23, y + 12], [x + 18, y + 17], [x + 1, y + 14]], hex('#4e8a3a'));
    for (let k = 0; k < 5; k++) p.put(x + 5 + k * 3, y + 9 + (k % 2), W);
    p.hline(x + 2, x + 18, y + 12, shade(hex('#4e8a3a'), 0.6));
    p.put(x + 17, y + 8, C.warn);
    p.box(x + 4, y + 16, x + 14, y + 22, W);
    p.box(x + 5, y + 17, x + 13, y + 21, hex('#e8402a'));
  },
  pedras: (p, x, y) => {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const cx = x + 12 + Math.cos(a) * 8;
      const cy = y + 13 + Math.sin(a) * 6;
      p.box(Math.round(cx - 2), Math.round(cy - 4), Math.round(cx + 1), Math.round(cy + 2), hex('#8a8a84'));
      p.vline(Math.round(cx - 2), Math.round(cy - 4), Math.round(cy + 2), hex('#b8b8b0'));
    }
    p.ellipse(x + 12, y + 14, 4, 2, withAlpha(C.leaf, 200));
  },
  exclamacao: (p, x, y) => {
    p.ellipse(x + 12, y + 18, 11, 4, C.leaf);
    p.box(x + 10, y + 1, x + 14, y + 12, C.red);
    p.box(x + 10, y + 14, x + 14, y + 17, C.red);
    p.vline(x + 10, y + 1, y + 12, light(C.red, 0.4));
  },
  chifre: (p, x, y) => {
    p.poly([[x + 2, y + 6], [x + 10, y + 4], [x + 22, y + 20], [x + 18, y + 22]], hex('#e8d8b0'));
    p.line(x + 3, y + 7, x + 19, y + 21, hex('#b8a070'));
    for (const [dx, dy] of [[1, 2], [5, 0], [8, 3], [3, -1]] as const) p.put(x + dx, y + dy + 1, C.warn);
    p.hline(x + 2, x + 10, y + 5, hex('#f0c040'));
  },
  confete: (p, x, y) => {
    const cs = [C.neonPink, C.warn, C.neonCyan, C.leaf, W];
    for (let k = 0; k < 16; k++) p.box(x + ((k * 7) % 22), y + ((k * 11) % 20), x + ((k * 7) % 22) + 1, y + ((k * 11) % 20) + 1, cs[k % cs.length]!);
    p.poly([[x + 14, y + 2], [x + 9, y + 12], [x + 13, y + 12], [x + 10, y + 22], [x + 18, y + 9], [x + 14, y + 9]], C.warn);
  },
  gota: (p, x, y) => {
    p.poly([[x + 12, y + 1], [x + 5, y + 14], [x + 19, y + 14]], hex('#4aa8e8'));
    p.disk(x + 12, y + 15, 7, hex('#4aa8e8'));
    p.disk(x + 9, y + 13, 2, withAlpha(W, 220));
    p.hline(x + 9, x + 15, y + 22, withAlpha(hex('#9ad8ff'), 200));
  },
  lhama: (p, x, y) => {
    p.box(x + 4, y + 12, x + 17, y + 18, hex('#e8dcc0'));
    p.box(x + 14, y + 3, x + 18, y + 13, hex('#e8dcc0'));
    p.box(x + 18, y + 4, x + 21, y + 6, hex('#e8dcc0'));
    for (const lx of [5, 8, 13, 16]) p.vline(x + lx, y + 18, y + 22, hex('#c8b890'));
    p.put(x + 16, y + 4, INK);
    p.box(x + 4, y + 13, x + 17, y + 14, C.red);
    p.disk(x + 23, y + 6, 1.5, withAlpha(hex('#c8f0ff'), 230));
  },
  luchador: (p, x, y) => {
    p.ellipse(x + 12, y + 12, 9, 10, hex('#a8463f'));
    p.poly([[x + 12, y + 2], [x + 8, y + 12], [x + 12, y + 11], [x + 10, y + 22], [x + 16, y + 10], [x + 12, y + 10]], C.gold);
    p.ellipse(x + 7, y + 11, 2.5, 1.5, W);
    p.ellipse(x + 17, y + 11, 2.5, 1.5, W);
  },
  taca: (p, x, y) => {
    p.poly([[x + 5, y + 3], [x + 19, y + 3], [x + 12, y + 12]], withAlpha(hex('#d8f0ff'), 220));
    p.vline(x + 12, y + 12, y + 20, hex('#d8f0ff'));
    p.hline(x + 8, x + 16, y + 21, hex('#d8f0ff'));
    p.line(x + 9, y + 4, x + 13, y + 9, INK);
    p.line(x + 13, y + 9, x + 11, y + 11, INK);
    for (let k = 0; k < 3; k++) p.ring(x + 12, y + 8, 6 + k * 3, 5 + k * 3, 1, withAlpha(W, 160 - k * 40));
  },
  moeda: (p, x, y) => {
    p.disk(x + 12, y + 12, 9, C.gold);
    p.ring(x + 12, y + 12, 9, 9, 1, shade(C.gold, 0.6));
    p.ellipse(x + 12, y + 12, 3, 5, C.leaf);
    p.vline(x + 12, y + 8, y + 16, C.leafDark);
    p.put(x + 8, y + 7, W);
  },
  barriga: (p, x, y) => {
    p.disk(x + 12, y + 13, 10, C.silver);
    p.disk(x + 12, y + 13, 6, W);
    p.ring(x + 12, y + 13, 6, 6, 1, INK);
    p.line(x + 12, y + 13, x + 16, y + 9, C.red);
    for (const dx of [-11, 10]) p.box(x + 12 + dx, y + 6, x + 13 + dx, y + 20, hex('#5a5e66'));
  },
  bola: (p, x, y) => {
    p.disk(x + 12, y + 12, 9, W);
    p.poly([[x + 12, y + 8], [x + 15, y + 11], [x + 14, y + 15], [x + 10, y + 15], [x + 9, y + 11]], INK);
    for (const [dx, dy] of [[0, -9], [8, -3], [6, 7], [-6, 7], [-8, -3]] as const) p.put(x + 12 + dx, y + 12 + dy, INK);
    for (let k = 0; k < 3; k++) p.hline(x, x + 3, y + 8 + k * 4, withAlpha(W, 160));
  },
  chama: (p, x, y) => {
    p.box(x + 10, y + 13, x + 14, y + 23, hex('#d8402a'));
    p.poly([[x + 12, y + 1], [x + 6, y + 12], [x + 18, y + 12]], hex('#ff8a2a'));
    p.poly([[x + 12, y + 5], [x + 9, y + 12], [x + 15, y + 12]], C.warn);
    p.disk(x + 12, y + 7, 9, withAlpha(hex('#ff5a3a'), 60));
  },
  haltere: (p, x, y) => {
    p.box(x + 5, y + 11, x + 19, y + 13, C.silver);
    for (const ox of [1, 19]) p.box(x + ox, y + 5, x + ox + 4, y + 19, hex('#3a3a46'));
    p.vline(x + 2, y + 5, y + 19, hex('#6a6a76'));
    p.disk(x + 20, y + 3, 2.5, C.neonPink);
  },
  prancheta: (p, x, y) => {
    p.box(x + 4, y + 3, x + 20, y + 23, WOOD);
    p.box(x + 6, y + 6, x + 18, y + 21, W);
    p.box(x + 9, y + 1, x + 15, y + 4, C.silver);
    for (let k = 0; k < 4; k++) {
      p.hline(x + 8, x + 16, y + 9 + k * 3, hex('#5a5e66'));
      p.put(x + 17, y + 9 + k * 3, k === 3 ? C.red : C.leaf);
    }
  },
  cordao: (p, x, y) => {
    for (const ox of [2, 19]) {
      p.box(x + ox, y + 6, x + ox + 2, y + 22, C.gold);
      p.disk(x + ox + 1, y + 5, 2, C.gold);
    }
    for (let i = 0; i < 16; i++) p.box(x + 4 + i, y + 9 + Math.round(Math.sin((i / 15) * Math.PI) * 5), x + 4 + i, y + 10 + Math.round(Math.sin((i / 15) * Math.PI) * 5), hex('#b02a3a'));
  },
  revolver: (p, x, y) => {
    p.box(x + 4, y + 8, x + 20, y + 12, C.silver);
    p.box(x + 6, y + 12, x + 10, y + 21, WOOD);
    p.disk(x + 13, y + 12, 3, hex('#8a8e96'));
    p.line(x + 20, y + 10, x + 24, y + 10, C.red);
    p.put(x + 23, y + 9, withAlpha(C.red, 160));
  },
  sol: (p, x, y) => {
    p.disk(x + 12, y + 10, 6, C.warn);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      p.line(x + 12 + Math.cos(a) * 8, y + 10 + Math.sin(a) * 8, x + 12 + Math.cos(a) * 10, y + 10 + Math.sin(a) * 10, C.warn);
    }
    p.hline(x + 1, x + 23, y + 21, hex('#c8a060'));
    p.disk(x + 18, y + 19, 2.5, withAlpha(hex('#a8c060'), 220));
  },
  claquete: (p, x, y) => {
    p.box(x + 3, y + 10, x + 21, y + 22, INK);
    p.poly([[x + 3, y + 9], [x + 21, y + 4], [x + 22, y + 8], [x + 4, y + 13]], W);
    for (let k = 0; k < 4; k++) p.line(x + 6 + k * 4, y + 12 - k, x + 8 + k * 4, y + 7 - k, INK);
    p.hline(x + 5, x + 19, y + 16, W);
  },
  camera: (p, x, y) => {
    p.box(x + 2, y + 8, x + 16, y + 19, hex('#3a3a46'));
    p.poly([[x + 16, y + 11], [x + 23, y + 7], [x + 23, y + 20], [x + 16, y + 16]], hex('#5a5e66'));
    p.disk(x + 6, y + 5, 3, hex('#3a3a46'));
    p.disk(x + 12, y + 5, 3, hex('#3a3a46'));
    p.disk(x + 4, y + 10, 1.2, C.red);
  },
  chave: (p, x, y) => {
    p.line(x + 4, y + 20, x + 16, y + 8, C.silver);
    p.line(x + 5, y + 20, x + 17, y + 8, C.silver);
    p.ring(x + 18, y + 6, 4, 4, 2, C.silver);
    clear(p, x + 18, y + 2, x + 21, y + 5);
    for (const [dx, dy] of [[1, 0], [-2, 3], [3, 4]] as const) p.put(x + 4 + dx, y + 20 + dy - 3, C.warn);
  },
  geladeira: (p, x, y) => {
    p.box(x + 6, y + 1, x + 18, y + 20, hex('#e8ecf0'));
    p.hline(x + 6, x + 18, y + 8, hex('#a8b0b8'));
    p.vline(x + 16, y + 3, y + 6, hex('#5a5e66'));
    p.vline(x + 16, y + 10, y + 15, hex('#5a5e66'));
    p.disk(x + 8, y + 22, 1.5, INK);
    p.disk(x + 16, y + 22, 1.5, INK);
    p.box(x + 5, y + 20, x + 19, y + 21, hex('#c86a2a'));
    p.put(x + 9, y + 4, C.neonCyan);
    p.put(x + 12, y + 4, C.neonCyan);
  },
  frasco: (p, x, y) => {
    p.box(x + 10, y + 2, x + 14, y + 9, hex('#c8d8e0'));
    p.poly([[x + 10, y + 9], [x + 14, y + 9], [x + 21, y + 22], [x + 3, y + 22]], hex('#6ae84a'));
    p.disk(x + 9, y + 17, 1.5, withAlpha(W, 220));
    p.disk(x + 15, y + 5, 2, withAlpha(hex('#c8ffb0'), 200));
    p.disk(x + 18, y + 1, 1.5, withAlpha(hex('#c8ffb0'), 170));
  },
  garrafa: (p, x, y) => {
    p.box(x + 8, y + 5, x + 16, y + 22, withAlpha(hex('#9ad8ff'), 230));
    p.box(x + 9, y + 2, x + 15, y + 5, C.neonPink);
    p.box(x + 8, y + 12, x + 16, y + 22, hex('#4aa8e8'));
    p.vline(x + 9, y + 6, y + 20, withAlpha(W, 200));
    p.disk(x + 4, y + 8, 1.5, C.neonPink);
    p.disk(x + 20, y + 14, 1.5, C.neonPink);
  },
  carregando: (p, x, y) => {
    p.ring(x + 12, y + 9, 7, 7, 2, withAlpha(W, 120));
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + k * 0.5;
      p.disk(x + 12 + Math.cos(a) * 7, y + 9 + Math.sin(a) * 7, 1.2, C.neonCyan);
    }
    p.frame(x + 1, y + 18, x + 23, y + 23, W);
    p.box(x + 3, y + 20, x + 20, y + 21, C.neonCyan);
  },
  inseto: (p, x, y) => {
    for (const [ox, oy] of [[3, 3], [13, 9], [5, 15]] as const) {
      p.box(x + ox + 1, y + oy, x + ox + 5, y + oy + 5, C.neonGreen);
      p.put(x + ox + 2, y + oy + 1, INK);
      p.put(x + ox + 4, y + oy + 1, INK);
      for (const dy of [1, 3, 5]) {
        p.put(x + ox, y + oy + dy, C.neonGreen);
        p.put(x + ox + 6, y + oy + dy, C.neonGreen);
      }
    }
  },
  servidor: (p, x, y) => {
    p.box(x + 5, y + 6, x + 19, y + 23, hex('#2a2a30'));
    for (let k = 0; k < 4; k++) {
      p.hline(x + 7, x + 17, y + 9 + k * 4, hex('#4a4a56'));
      p.put(x + 16, y + 9 + k * 4, k % 2 ? C.neonGreen : C.red);
    }
    p.poly([[x + 8, y + 7], [x + 11, y], [x + 13, y + 5], [x + 16, y + 1], [x + 17, y + 7]], hex('#ff8a2a'));
    p.poly([[x + 10, y + 7], [x + 12, y + 3], [x + 15, y + 7]], C.warn);
  },
};

/** Habilidade marca -> motivo (as que não estão aqui usam os motivos de icons.ts). */
export const MARK_ABILITY_MOTIF: Record<string, string> = {
  respiracao: 'lotus',
  fim_da_paz: 'tigre',
  as_barricadas: 'cadeira',
  greve_geral: 'placa',
  voce_esta_muito_magro: 'sopa',
  xale_de_la: 'xale',
  tiro_girando: 'flecha',
  galope: 'ferradura',
  crikey: 'croco',
  armadilha_de_laco: 'laco',
  circulo_de_pedras: 'pedras',
  sai_do_meu_gramado: 'exclamacao',
  skal: 'chifre',
  fim_de_festa: 'confete',
  agua_da_nascente: 'gota',
  lhama_cuspidora: 'lhama',
  la_mascara_no_cae: 'luchador',
  voadora: 'bota',
  aria_amaldicoada: 'nota',
  nota_aguda: 'taca',
  rasteira: 'moeda',
  gingado: 'chapeu',
  barriga_hidraulica: 'barriga',
  empurrao: 'onda',
  invasao_de_campo: 'bola',
  sinalizador: 'chama',
  bora_monstro: 'haltere',
  live_motivacional: 'coracao',
  nome_na_lista: 'prancheta',
  cordao_de_isolamento: 'cordao',
  yeehaw_exe: 'revolver',
  duelo_ao_meio_dia: 'sol',
  corta: 'claquete',
  plano_sequencia: 'camera',
  funciona_nao_pergunta: 'chave',
  robo_geladeira: 'geladeira',
  experimento_instavel: 'frasco',
  fur_wissenschaft: 'raio',
  vibracoes_positivas: 'coracao',
  detox: 'garrafa',
  aguarde_na_linha: 'carregando',
  protocolo: 'escudo',
  virus_em_rede: 'inseto',
  derrubada: 'servidor',
};
