/**
 * Texturas de efeito em pixel: marcador de alvo, avisos no chão (círculo, cone, linha) com borda
 * que enche, zonas no chão, faíscas de golpe, folhas, glitch, brilho de saque, anel de carga,
 * espíritos, notificações, saque no chão e a fonte bitmap dos números.
 *
 * Cada efeito é uma textura com quadros '0', '1', ... (FX_INFO diz quantos, o tamanho e a origem).
 * O Encanto é folha e brilho verde; a máquina é faísca, glitch e neon.
 */
import { drawGlyph, FONT_CHARS, FONT_H, FONT_W, fontText } from './font';
import { C, type Color, hex, light, mix, Pix, prng, shade, withAlpha } from './pixel';
import { packFrames, type SheetData } from './sheet';

export interface FxInfo {
  frames: number;
  w: number;
  h: number;
  /** origem sugerida (setOrigin) */
  ox: number;
  oy: number;
  /** quadros por segundo da animação `${key}:play:0`; 0 = sem animação */
  fps: number;
  loop: boolean;
  /** para que serve, em poucas palavras */
  uso: string;
}

const RED = hex('#ff3a2a');
const WARN_FILL = withAlpha(RED, 70);
const WARN_EDGE = withAlpha(RED, 200);
const WARN_CORE = withAlpha(hex('#ff6a4a'), 120);

function frames(n: number, w: number, h: number, draw: (p: Pix, i: number) => void): Pix[] {
  return Array.from({ length: n }, (_, i) => {
    const p = new Pix(w, h);
    draw(p, i);
    return p;
  });
}

// ---------------------------------------------------------------------------

function alvo(color: Color): Pix[] {
  return frames(2, 32, 16, (p, i) => {
    const rx = i ? 13 : 14;
    const ry = i ? 5.5 : 6;
    p.ring(16, 8, rx, ry, 1.2, withAlpha(color, 230));
    p.ring(16, 8, rx - 2, ry - 1.5, 1, withAlpha(color, 90));
    // cantoneiras
    for (const [x, y, dx] of [
      [1, 4, 1],
      [30, 4, -1],
      [1, 11, 1],
      [30, 11, -1],
    ] as const) {
      p.put(x, y, withAlpha(C.pureWhite, 220));
      p.put(x + dx, y, withAlpha(C.pureWhite, 220));
    }
  });
}

/** Aviso em círculo: borda forte e um disco interno que cresce com o progresso. */
function avisoCirculo(): Pix[] {
  return frames(8, 64, 64, (p, i) => {
    p.ellipse(32, 32, 31.5, 31.5, WARN_FILL);
    const r = 31.5 * ((i + 1) / 8);
    p.ellipse(32, 32, r, r, WARN_CORE);
    p.ring(32, 32, 31.5, 31.5, 2, WARN_EDGE);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      p.put(Math.round(32 + Math.cos(a) * 27), Math.round(32 + Math.sin(a) * 27), withAlpha(C.pureWhite, 90));
    }
  });
}

/** Aviso em cone com ápice no meio da borda esquerda, apontando para a direita (ângulo 0). */
function avisoCone(deg: number): Pix[] {
  const half = (deg * Math.PI) / 360;
  return frames(8, 64, 64, (p, i) => {
    const R = 63;
    const prog = R * ((i + 1) / 8);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const dx = x + 0.5;
        const dy = y + 0.5 - 32;
        const d = Math.hypot(dx, dy);
        const a = Math.abs(Math.atan2(dy, dx));
        if (d > R || a > half) continue;
        const edge = d > R - 2 || a > half - 1.6 / Math.max(d, 1);
        p.put(x, y, edge ? WARN_EDGE : d <= prog ? WARN_CORE : WARN_FILL);
      }
  });
}

function avisoLinha(): Pix[] {
  return frames(8, 64, 16, (p, i) => {
    p.rect(0, 0, 64, 16, WARN_FILL);
    p.rect(0, 0, Math.round(64 * ((i + 1) / 8)), 16, WARN_CORE);
    p.frame(0, 0, 63, 15, WARN_EDGE);
    for (let x = 6 + ((i * 2) % 8); x < 60; x += 8) {
      p.put(x, 7, withAlpha(C.pureWhite, 130));
      p.put(x + 1, 8, withAlpha(C.pureWhite, 130));
      p.put(x, 9, withAlpha(C.pureWhite, 130));
    }
  });
}

function zona(kind: 'esquerda' | 'direita' | 'inimiga'): Pix[] {
  const base = kind === 'esquerda' ? hex('#6ad85a') : kind === 'direita' ? C.neonCyan : hex('#b03ad8');
  return frames(2, 64, 64, (p, i) => {
    p.ellipse(32, 32, 31.5, 31.5, withAlpha(base, 50));
    p.ring(32, 32, 31.5, 31.5, 1.5, withAlpha(base, 170));
    const rnd = prng(`zona${kind}${i}`);
    if (kind === 'esquerda') {
      for (let k = 0; k < 14; k++) {
        const a = rnd() * Math.PI * 2;
        const d = rnd() * 26;
        const x = Math.round(32 + Math.cos(a) * d);
        const y = Math.round(32 + Math.sin(a) * d);
        p.put(x, y, withAlpha(C.leaf, 200));
        p.put(x + 1, y - 1, withAlpha(hex('#9cf08a'), 200));
      }
    } else if (kind === 'direita') {
      for (let k = 4 + i * 4; k < 64; k += 8) {
        for (let t = 0; t < 64; t++) {
          if (Math.hypot(k - 32, t - 32) < 30) p.put(k, t, withAlpha(base, 60));
          if (Math.hypot(t - 32, k - 32) < 30) p.put(t, k, withAlpha(base, 60));
        }
      }
    } else {
      for (let k = 0; k < 10; k++) p.disk(10 + rnd() * 44, 10 + rnd() * 44, 1.5, withAlpha(light(base, 0.3), 140));
    }
  });
}

function faisca(): Pix[] {
  return frames(4, 16, 16, (p, i) => {
    const r = [3, 6, 7, 5][i]!;
    const col = i < 2 ? C.pureWhite : C.warn;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + (i % 2) * 0.4;
      const len = k % 2 ? r * 0.6 : r;
      p.line(8, 8, 8 + Math.cos(a) * len, 8 + Math.sin(a) * len, withAlpha(col, i === 3 ? 140 : 255));
    }
    if (i < 2) p.disk(8, 8, 1.8, C.pureWhite);
  });
}

function golpeEsquerda(): Pix[] {
  return frames(4, 24, 24, (p, i) => {
    const rnd = prng('golpeE');
    for (let k = 0; k < 7; k++) {
      const a = rnd() * Math.PI * 2;
      const d = 2 + i * 3 + rnd() * 2;
      const x = Math.round(12 + Math.cos(a) * d);
      const y = Math.round(12 + Math.sin(a) * d);
      const c = k % 2 ? C.leaf : hex('#9cf08a');
      p.put(x, y, withAlpha(c, 255 - i * 50));
      p.put(x + 1, y, withAlpha(shade(c, 0.7), 255 - i * 50));
    }
    if (i < 2) p.ring(12, 12, 3 + i * 3, 3 + i * 3, 1, withAlpha(hex('#c8ffb0'), 180));
  });
}

function golpeDireita(): Pix[] {
  return frames(4, 24, 24, (p, i) => {
    const rnd = prng(`golpeD${i}`);
    for (let k = 0; k < 3; k++) {
      let x = 12;
      let y = 12;
      for (let s = 0; s < 3 + i; s++) {
        const nx = x + Math.round((rnd() - 0.5) * 8);
        const ny = y + Math.round((rnd() - 0.5) * 8);
        p.line(x, y, nx, ny, k === 0 ? C.pureWhite : C.neonCyan);
        x = nx;
        y = ny;
      }
    }
    if (i === 0) p.disk(12, 12, 2.5, C.pureWhite);
  });
}

function folhas(): Pix[] {
  return frames(4, 16, 16, (p, i) => {
    for (let k = 0; k < 3; k++) {
      const x = 3 + k * 5 + ((i + k) % 2);
      const y = (2 + i * 3 + k * 4) % 14;
      const c = k % 2 ? C.leaf : hex('#8ad86a');
      p.put(x, y, c);
      p.put(x + 1, y, c);
      p.put(x + (i % 2), y + 1, shade(c, 0.7));
    }
  });
}

function glitch(): Pix[] {
  return frames(4, 32, 32, (p, i) => {
    const rnd = prng(`glitch${i}`);
    for (let k = 0; k < 6; k++) {
      const w = 4 + Math.floor(rnd() * 14);
      const x = Math.floor(rnd() * (32 - w));
      const y = Math.floor(rnd() * 30);
      const c = [C.neonCyan, C.neonPink, C.pureWhite, C.neonGreen][k % 4]!;
      p.rect(x, y, w, 1 + (k % 2), withAlpha(c, 180));
    }
  });
}

function saque(): Pix[] {
  return frames(4, 16, 16, (p, i) => {
    const r = [2, 5, 7, 4][i]!;
    p.line(8 - r, 8, 8 + r, 8, withAlpha(C.pureWhite, 220));
    p.line(8, 8 - r, 8, 8 + r, withAlpha(C.pureWhite, 220));
    p.put(8, 8, C.warn);
    if (i === 2) {
      p.put(5, 5, withAlpha(C.warn, 200));
      p.put(11, 11, withAlpha(C.warn, 200));
    }
  });
}

function anelCarga(): Pix[] {
  return frames(12, 48, 48, (p, i) => {
    p.ring(24, 24, 22, 22, 3, withAlpha(C.ink, 140));
    const prog = (i + 1) / 12;
    for (let y = 0; y < 48; y++)
      for (let x = 0; x < 48; x++) {
        const dx = x + 0.5 - 24;
        const dy = y + 0.5 - 24;
        const d = Math.hypot(dx, dy);
        if (d > 22 || d < 19) continue;
        let a = Math.atan2(dx, -dy) / (Math.PI * 2);
        if (a < 0) a += 1;
        if (a <= prog) p.put(x, y, i === 11 ? C.warn : mix(C.neonCyan, C.warn, a));
      }
  });
}

function espirito(): Pix[] {
  return frames(4, 16, 16, (p, i) => {
    const y = 6 + (i % 2);
    p.ellipse(8, y, 4, 4, withAlpha(hex('#9cf08a'), 120));
    p.poly([[4, y], [12, y], [9 + (i % 2), 15], [7, 12]], withAlpha(hex('#9cf08a'), 90));
    p.put(6, y - 1, withAlpha(C.pureWhite, 220));
    p.put(9, y - 1, withAlpha(C.pureWhite, 220));
  });
}

function notificacao(): Pix[] {
  return frames(2, 12, 12, (p, i) => {
    p.box(1, 1 - i, 10, 8 - i, C.neonPink);
    p.frame(1, 1 - i, 10, 8 - i, shade(C.neonPink, 0.6));
    p.put(3, 9 - i, C.neonPink);
    p.vline(5, 2 - i, 5 - i, C.pureWhite);
    p.vline(6, 2 - i, 5 - i, C.pureWhite);
    p.put(5, 7 - i, C.pureWhite);
    p.put(6, 7 - i, C.pureWhite);
  });
}

function coracao(): Pix[] {
  return frames(2, 9, 8, (p, i) => {
    const c = i ? C.neonPink : hex('#ff6ab8');
    p.disk(2.5, 2.5, 2.3, c);
    p.disk(6.5, 2.5, 2.3, c);
    p.poly([[0.5, 3], [8.5, 3], [4.5, 7.5]], c);
    p.put(2, 1, C.pureWhite);
  });
}

function nota(): Pix[] {
  return frames(2, 8, 10, (p, i) => {
    const c = i ? C.neonCyan : C.pureWhite;
    p.vline(5, 1, 7, c);
    p.hline(5, 7, 1, c);
    p.put(7, 2, c);
    p.disk(3.5, 8, 2, c);
  });
}

function onda(): Pix[] {
  return frames(3, 16, 16, (p, i) => {
    for (let k = 0; k <= i; k++) {
      const r = 3 + k * 4;
      for (let a = -0.9; a <= 0.9; a += 0.08) p.put(Math.round(2 + Math.cos(a) * r), Math.round(8 + Math.sin(a) * r), withAlpha(C.neonCyan, 230 - k * 50));
    }
  });
}

function confete(): Pix[] {
  return frames(4, 16, 16, (p, i) => {
    const rnd = prng('confete');
    const cols = [C.neonPink, C.neonCyan, C.warn, C.neonGreen, C.pureWhite];
    for (let k = 0; k < 10; k++) {
      const x = Math.floor(rnd() * 15);
      const y = (Math.floor(rnd() * 15) + i * 3) % 16;
      p.put(x, y, cols[k % cols.length]!);
      if (k % 3 === 0) p.put(x + 1, y, cols[k % cols.length]!);
    }
  });
}

function atordoado(): Pix[] {
  return frames(3, 20, 8, (p, i) => {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + i * 0.7;
      const x = Math.round(10 + Math.cos(a) * 8);
      const y = Math.round(4 + Math.sin(a) * 2.5);
      p.put(x, y, C.warn);
      p.put(x - 1, y, withAlpha(C.warn, 160));
      p.put(x + 1, y, withAlpha(C.warn, 160));
      p.put(x, y - 1, withAlpha(C.warn, 160));
      p.put(x, y + 1, withAlpha(C.warn, 160));
    }
  });
}

function escudo(): Pix[] {
  return frames(2, 40, 52, (p, i) => {
    p.ellipse(20, 28, 18, 23, withAlpha(hex('#8ad8ff'), 50));
    p.ring(20, 28, 18, 23, 1, withAlpha(hex('#c8f0ff'), i ? 200 : 140));
    p.line(10, 14 + i, 14, 10 + i, withAlpha(C.pureWhite, 200));
  });
}

function cura(): Pix[] {
  return frames(4, 16, 16, (p, i) => {
    const y = 10 - i * 2;
    const c = withAlpha(hex('#6aff6a'), 240 - i * 40);
    p.rect(6, y, 3, 7, c);
    p.rect(4, y + 2, 7, 3, c);
  });
}

function poeira(): Pix[] {
  return frames(4, 12, 8, (p, i) => {
    for (let k = 0; k < 3; k++) p.disk(2 + k * 3 + i, 5 - (k % 2), 1.4 + i * 0.3, withAlpha(hex('#c8b890'), 200 - i * 45));
  });
}

function cruz(): Pix[] {
  return frames(2, 9, 9, (p, i) => {
    const c = i ? hex('#4ae04a') : hex('#9cf09c');
    p.rect(3, 0, 3, 9, c);
    p.rect(0, 3, 9, 3, c);
  });
}

function pavio(): Pix[] {
  return frames(2, 8, 10, (p, i) => {
    p.line(1, 9, 4, 4, hex('#3a3a3a'));
    p.put(4 + i, 3, C.warn);
    p.put(5, 2 - i, C.red);
    p.put(3, 2, withAlpha(C.pureWhite, 200));
  });
}

function sombra(): Pix[] {
  return frames(1, 24, 8, (p) => p.ellipse(12, 4, 11.5, 3.5, withAlpha(C.black, 80)));
}

/** Saquinho de saque no chão, com a cor da raridade. */
function lootBag(col: Color): Pix[] {
  return frames(2, 16, 16, (p, i) => {
    p.ellipse(8, 14, 6, 1.5, withAlpha(C.black, 70));
    p.ellipse(8, 10, 5.5, 4.5, hex('#a8845a'));
    p.box(6, 3, 10, 5, hex('#8a6a42'));
    p.hline(5, 11, 6, col);
    p.outline();
    if (i) p.put(11, 3, withAlpha(light(col, 0.5), 230));
    p.put(6, 9, light(hex('#a8845a'), 0.3));
  });
}

function coin(col: Color, glyph: 'semente' | 'credito'): Pix[] {
  return frames(2, 12, 12, (p, i) => {
    p.ellipse(6, 6, i ? 4 : 5.5, 5.5, col);
    p.ring(6, 6, i ? 4 : 5.5, 5.5, 1, shade(col, 0.6));
    if (glyph === 'semente') {
      p.put(5, 5, C.leaf);
      p.put(6, 4, C.leaf);
      p.vline(6, 5, 7, C.leafDark);
    } else {
      p.vline(6, 3, 8, C.pureWhite);
      p.put(5, 4, C.pureWhite);
      p.put(7, 7, C.pureWhite);
    }
  });
}

// ---------------------------------------------------------------------------

export const CONE_ANGLES = [60, 70, 90, 120] as const;

/** Cone mais próximo do ângulo pedido (as habilidades usam 60, 70 e 90 graus). */
export function coneKeyFor(deg: number): string {
  let best: number = CONE_ANGLES[0];
  for (const a of CONE_ANGLES) if (Math.abs(a - deg) < Math.abs(best - deg)) best = a;
  return `fx_aviso_cone_${best}`;
}

const DEFS: Record<string, [() => Pix[], Omit<FxInfo, 'frames' | 'w' | 'h'>]> = {
  fx_alvo: [() => alvo(hex('#ff4a3a')), { ox: 0.5, oy: 0.5, fps: 4, loop: true, uso: 'marcador sob o alvo travado (inimigo)' }],
  fx_alvo_aliado: [() => alvo(hex('#5ae05a')), { ox: 0.5, oy: 0.5, fps: 4, loop: true, uso: 'marcador sob o aliado escolhido' }],
  fx_sombra: [sombra, { ox: 0.5, oy: 0.5, fps: 0, loop: false, uso: 'sombra no chão sob bonecos e voadores' }],
  fx_aviso_circulo: [avisoCirculo, { ox: 0.5, oy: 0.5, fps: 0, loop: false, uso: 'aviso de área em círculo; quadro = progresso 0..7 até o impacto; escala = raio' }],
  ...Object.fromEntries(
    CONE_ANGLES.map((a) => [`fx_aviso_cone_${a}`, [() => avisoCone(a), { ox: 0, oy: 0.5, fps: 0, loop: false, uso: `aviso em cone de ${a} graus, ápice na origem, apontando para o ângulo 0; girar pela direção` }]]),
  ),
  fx_aviso_linha: [avisoLinha, { ox: 0, oy: 0.5, fps: 0, loop: false, uso: 'aviso em linha; quadro = progresso; escala x = comprimento' }],
  fx_zona_esquerda: [() => zona('esquerda'), { ox: 0.5, oy: 0.5, fps: 3, loop: true, uso: 'campo aliado da Esquerda (folhas)' }],
  fx_zona_direita: [() => zona('direita'), { ox: 0.5, oy: 0.5, fps: 3, loop: true, uso: 'campo aliado da Direita (grade neon)' }],
  fx_zona_inimiga: [() => zona('inimiga'), { ox: 0.5, oy: 0.5, fps: 3, loop: true, uso: 'campo de inimigo' }],
  fx_faisca: [faisca, { ox: 0.5, oy: 0.5, fps: 16, loop: false, uso: 'faísca de golpe' }],
  fx_golpe_esquerda: [golpeEsquerda, { ox: 0.5, oy: 0.5, fps: 14, loop: false, uso: 'acerto do Encanto (folhas)' }],
  fx_golpe_direita: [golpeDireita, { ox: 0.5, oy: 0.5, fps: 14, loop: false, uso: 'acerto da máquina (faíscas)' }],
  fx_folhas: [folhas, { ox: 0.5, oy: 0.5, fps: 8, loop: true, uso: 'folhas do Encanto' }],
  fx_glitch: [glitch, { ox: 0.5, oy: 0.5, fps: 12, loop: true, uso: 'glitch da máquina e hologramas' }],
  fx_saque: [saque, { ox: 0.5, oy: 0.5, fps: 8, loop: true, uso: 'brilho de saque no chão' }],
  fx_anel_carga: [anelCarga, { ox: 0.5, oy: 0.5, fps: 0, loop: false, uso: 'anel de carga (Especial, reanimar): quadro = progresso 0..11' }],
  fx_espirito: [espirito, { ox: 0.5, oy: 1, fps: 6, loop: true, uso: 'espírito translúcido' }],
  fx_notificacao: [notificacao, { ox: 0.5, oy: 1, fps: 4, loop: true, uso: 'notificação pipocando' }],
  fx_coracao: [coracao, { ox: 0.5, oy: 0.5, fps: 4, loop: true, uso: 'corações (Fanchant, cura)' }],
  fx_nota: [nota, { ox: 0.5, oy: 0.5, fps: 4, loop: true, uso: 'nota musical' }],
  fx_onda: [onda, { ox: 0, oy: 0.5, fps: 10, loop: true, uso: 'onda sonora' }],
  fx_confete: [confete, { ox: 0.5, oy: 0.5, fps: 8, loop: true, uso: 'chuva de confete (Encore)' }],
  fx_atordoado: [atordoado, { ox: 0.5, oy: 1, fps: 8, loop: true, uso: 'estrelinhas de atordoado sobre a cabeça' }],
  fx_escudo: [escudo, { ox: 0.5, oy: 1, fps: 4, loop: true, uso: 'bolha de escudo' }],
  fx_cura: [cura, { ox: 0.5, oy: 1, fps: 10, loop: false, uso: 'cruz verde subindo (cura)' }],
  fx_poeira: [poeira, { ox: 0.5, oy: 1, fps: 10, loop: true, uso: 'rastro de poeira (afixo rápido)' }],
  fx_cruz_verde: [cruz, { ox: 0.5, oy: 1, fps: 3, loop: true, uso: 'cruz piscando (afixo cura os outros)' }],
  fx_pavio: [pavio, { ox: 0.5, oy: 1, fps: 6, loop: true, uso: 'pavio aceso (afixo explode ao morrer)' }],
  loot_comum: [() => lootBag(hex('#c9c9c9')), { ox: 0.5, oy: 0.8, fps: 3, loop: true, uso: 'saque comum no chão' }],
  loot_raro: [() => lootBag(hex('#4aa3ff')), { ox: 0.5, oy: 0.8, fps: 3, loop: true, uso: 'saque raro no chão' }],
  loot_unico: [() => lootBag(hex('#e8a33a')), { ox: 0.5, oy: 0.8, fps: 3, loop: true, uso: 'saque único no chão' }],
  loot_set: [() => lootBag(hex('#b05aff')), { ox: 0.5, oy: 0.8, fps: 3, loop: true, uso: 'saque de set no chão' }],
  loot_semente: [() => coin(hex('#c89a4a'), 'semente'), { ox: 0.5, oy: 0.8, fps: 4, loop: true, uso: 'Semente no chão' }],
  loot_credito: [() => coin(hex('#3a8ad8'), 'credito'), { ox: 0.5, oy: 0.8, fps: 4, loop: true, uso: 'Crédito no chão' }],
};

export const FX_KEYS = Object.keys(DEFS);

let fxCache: { sheets: SheetData[]; info: Record<string, FxInfo> } | undefined;

/** Todas as folhas de efeito (puro, em cache). Quadros '0', '1', ... */
export function buildFx(): { sheets: SheetData[]; info: Record<string, FxInfo> } {
  if (fxCache) return fxCache;
  const sheets: SheetData[] = [];
  const info: Record<string, FxInfo> = {};
  for (const [key, [make, meta]] of Object.entries(DEFS)) {
    const fs = make();
    const sh = packFrames(
      key,
      fs.map((pix, i) => ({ name: String(i), pix })),
      1024,
    );
    sh.originX = meta.ox;
    sh.originY = meta.oy;
    sheets.push(sh);
    info[key] = { ...meta, frames: fs.length, w: fs[0]!.w, h: fs[0]!.h };
  }
  fxCache = { sheets, info };
  return fxCache;
}

// ---------------------------------------------------------------------------
// fonte bitmap (números de dano, rótulos)

export const FONT_KEY = 'fonte_pixel';
/** Célula de cada letra com contorno: 5x7 + 1 px de cada lado. */
export const FONT_CELL_W = FONT_W + 2;
export const FONT_CELL_H = FONT_H + 2;
export const FONT_PER_ROW = 16;

/** Textura da fonte: letras brancas com contorno escuro, prontas para tingir no Phaser. */
export function buildFontPix(): Pix {
  const rows = Math.ceil(FONT_CHARS.length / FONT_PER_ROW);
  const p = new Pix(FONT_PER_ROW * FONT_CELL_W, rows * FONT_CELL_H);
  for (let i = 0; i < FONT_CHARS.length; i++) {
    const ch = FONT_CHARS[i]!;
    const x = (i % FONT_PER_ROW) * FONT_CELL_W;
    const y = Math.floor(i / FONT_PER_ROW) * FONT_CELL_H;
    const cell = new Pix(FONT_CELL_W, FONT_CELL_H);
    if (ch !== ' ') drawGlyph(cell, 1, 1, ch, C.pureWhite);
    cell.outline({ color: hex('#140c16'), diagonal: true });
    p.blit(cell, x, y);
  }
  return p;
}

export { fontText };
