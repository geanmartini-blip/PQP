/**
 * Efeitos da Fase 5 nas Galerias da Usina (entram na folha de efeitos de fx.ts):
 * - `fx_aviso_bomba`: aviso no chão da explosão da Bomba Descontrolada, com faixa de perigo e a
 *   contagem 3, 2, 1 no meio (quadro = progresso 0..7 até o estouro);
 * - `fx_succao`: espiral de ar puxando para o centro (sucção da turbina, depois do aviso);
 * - `fx_descarga`: arcos elétricos em círculo (descarga elétrica na água);
 * - `fx_agua_subindo`: lâmina d'água translúcida de um tile, para cobrir o chão que alagou.
 *
 * SUGESTÃO: os desenhos e as cores não estão nos docs; os tempos de aviso vêm de dungeons.json.
 */
import { drawGlyph } from './font';
import { C, hex, light, mix, Pix, withAlpha } from './pixel';

const RED = hex('#ff3a2a');
const HAZ = hex('#f0b81a');
const DARK = hex('#2a0608');

function frames(n: number, w: number, h: number, draw: (p: Pix, i: number) => void): Pix[] {
  return Array.from({ length: n }, (_, i) => {
    const p = new Pix(w, h);
    draw(p, i);
    return p;
  });
}

/** Aviso grande da Bomba: 96x96, borda listrada de perigo, enchimento crescendo e contagem. */
export function avisoBomba(): Pix[] {
  return frames(8, 96, 96, (p, i) => {
    const c = 48;
    const R = 47.5;
    p.ellipse(c, c, R, R, withAlpha(RED, 46 + i * 7));
    // enchimento que cresce até o estouro (os primeiros quadros ficam só com a contagem no meio)
    const r = R * ((i + 1) / 8);
    if (i > 0) {
      p.ellipse(c, c, r, r, withAlpha(hex('#ff7a3a'), 110));
      p.ring(c, c, r, r, 1, withAlpha(hex('#ffd0a0'), 170));
    } else p.ring(c, c, 20, 20, 1, withAlpha(hex('#ffd0a0'), 120));
    // faixa amarela e preta girando na borda
    for (let y = 0; y < 96; y++)
      for (let x = 0; x < 96; x++) {
        const dx = x + 0.5 - c;
        const dy = y + 0.5 - c;
        const d = Math.hypot(dx, dy);
        if (d > R || d < R - 4) continue;
        const a = Math.atan2(dy, dx) + i * 0.12;
        const stripe = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 28) % 2 === 0;
        p.set(x, y, stripe ? withAlpha(i % 2 ? light(HAZ, 0.3) : HAZ, 235) : withAlpha(hex('#1a1414'), 225));
      }
    p.ring(c, c, R, R, 1, withAlpha(DARK, 240));
    // contagem: 3 nos primeiros quadros, 2 no meio, 1 no fim
    const n = i < 3 ? '3' : i < 6 ? '2' : '1';
    const s = 4;
    const g = new Pix(96, 96);
    drawGlyph(g, c - Math.floor((5 * s) / 2), c - Math.floor((7 * s) / 2), n, i >= 6 && i % 2 ? C.pureWhite : hex('#ffe0a0'), s);
    g.outline({ color: withAlpha(DARK, 255) });
    g.outline({ color: withAlpha(DARK, 120) });
    p.blit(g, 0, 0);
  });
}

/** Sucção da turbina: braços de ar em espiral que giram para dentro. */
export function succao(): Pix[] {
  return frames(6, 64, 64, (p, i) => {
    p.ellipse(32, 32, 31.5, 31.5, withAlpha(hex('#8ab0c8'), 30));
    for (let arm = 0; arm < 4; arm++)
      for (let t = 0; t < 1; t += 0.02) {
        const a = arm * (Math.PI / 2) + t * 4.2 - i * (Math.PI / 12);
        const rr = 30 * (1 - t);
        const x = 32 + Math.cos(a) * rr;
        const y = 32 + Math.sin(a) * rr;
        const al = Math.round(60 + 160 * t);
        p.put(Math.floor(x), Math.floor(y), withAlpha(t > 0.7 ? C.pureWhite : hex('#b8d8e8'), al));
      }
    p.ring(32, 32, 31.5, 31.5, 1, withAlpha(hex('#c8e0f0'), 120 + (i % 2) * 60));
    p.disk(32, 32, 2.5, withAlpha(hex('#1a2a34'), 200));
  });
}

/** Descarga elétrica: arcos em zigue-zague entre pontos da borda e o centro. */
export function descarga(): Pix[] {
  return frames(4, 64, 64, (p, i) => {
    p.ellipse(32, 32, 31.5, 31.5, withAlpha(hex('#ffe23a'), 34 + (i % 2) * 18));
    p.ring(32, 32, 31.5, 31.5, 1, withAlpha(hex('#fff3a0'), 200));
    for (let k = 0; k < 5; k++) {
      const a = k * 1.2566 + i * 0.7;
      let x = 32;
      let y = 32;
      const steps = 6;
      for (let s = 1; s <= steps; s++) {
        const rr = (30 * s) / steps;
        const jit = ((k * 7 + s * 13 + i * 5) % 7) - 3;
        const nx = 32 + Math.cos(a) * rr + Math.cos(a + 1.57) * jit;
        const ny = 32 + Math.sin(a) * rr + Math.sin(a + 1.57) * jit;
        p.line(x, y, nx, ny, withAlpha(s < 3 ? C.pureWhite : hex('#ffe23a'), 230));
        p.line(x + 1, y, nx + 1, ny, withAlpha(hex('#3ac8ff'), 90));
        x = nx;
        y = ny;
      }
    }
    p.disk(32, 32, 3, withAlpha(C.pureWhite, 220));
  });
}

/** Lâmina de água subindo por cima do chão (translúcida, ondinhas andando). */
export function aguaSubindo(): Pix[] {
  return frames(4, 32, 32, (p, i) => {
    const base = hex('#2a6a80');
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const w = Math.sin((x + i * 4) / 5 + y / 7) + Math.sin((y - i * 2) / 4);
        p.set(x, y, withAlpha(mix(base, hex('#5aa8c0'), w > 1.2 ? 0.7 : 0.15), w > 1.2 ? 170 : 120));
      }
    for (let k = 0; k < 3; k++) p.hline((k * 11 + i * 3) % 28, ((k * 11 + i * 3) % 28) + 3, (k * 9 + 5) % 30, withAlpha(hex('#c8f0f8'), 180));
  });
}
