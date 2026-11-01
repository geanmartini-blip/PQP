/**
 * Texturas do HUD geradas uma vez (canvas 2D) e reaproveitadas: fundo dos botões (normal e
 * apertado), pizza de recarga e anel de carga em folhas de quadros, disco cinza, joystick, painéis
 * dos quadros e a seta do rumo. Assim o HUD só tem Image e Sprite: nada de Graphics refeito (e
 * triangulado) a cada quadro.
 *
 * Tudo em pixels de canvas; a chave inclui o tamanho e a cor.
 */
import * as Phaser from 'phaser';

// SUGESTÃO: 24 fatias na pizza de recarga e 40 passos no anel de carga do Especial.
export const PIE_FRAMES = 24;
export const RING_FRAMES = 40;

const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, frames?: { n: number; fw: number }): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
  if (!tex) return key;
  const ctx = tex.getContext();
  draw(ctx);
  if (frames) for (let i = 0; i < frames.n; i++) tex.add(String(i), 0, i * frames.fw, 0, frames.fw, Math.ceil(h));
  tex.refresh();
  return key;
}

/** Fundo do botão redondo de raio `r` (sombra, disco, contorno escuro e filete claro). */
export function buttonTex(scene: Phaser.Scene, r: number, color: number, pressed: boolean, px = 1): string {
  const pad = Math.ceil(4 * px);
  const size = 2 * r + 2 * pad;
  return canvasTex(scene, `ui_btn_${r}_${color.toString(16)}_${pressed ? 1 : 0}_${px}`, size, size, (ctx) => {
    const c = size / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(c + 2 * px, c + 3 * px, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css(pressed ? 0x4a3a52 : color, 0.88);
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3 * px;
    ctx.strokeStyle = css(0x140c16);
    ctx.beginPath();
    ctx.arc(c, c, r - 1.5 * px, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1 * px;
    ctx.strokeStyle = css(0x8a7a92, 0.9);
    ctx.beginPath();
    ctx.arc(c, c, r - 3.5 * px, 0, Math.PI * 2);
    ctx.stroke();
  });
}

/** Pizza de recarga: quadro i = fatia de (i+1)/PIE_FRAMES, começando em cima, no sentido horário. */
export function pieSheet(scene: Phaser.Scene, r: number): string {
  const size = 2 * r;
  return canvasTex(
    scene,
    `ui_pie_${r}`,
    size * PIE_FRAMES,
    size,
    (ctx) => {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      for (let i = 0; i < PIE_FRAMES; i++) {
        const cx = i * size + r, cy = r;
        const frac = (i + 1) / PIE_FRAMES;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2, false);
        ctx.closePath();
        ctx.fill();
      }
    },
    { n: PIE_FRAMES, fw: size },
  );
}

/** Quadro da pizza para a fração `frac` (0 < frac <= 1). */
export const pieFrame = (frac: number) => String(Math.max(0, Math.min(PIE_FRAMES - 1, Math.ceil(frac * PIE_FRAMES) - 1)));

/** Disco liso (cinza do botão sem poder usar). */
export function discTex(scene: Phaser.Scene, r: number, color: number, alpha: number): string {
  return canvasTex(scene, `ui_disc_${r}_${color.toString(16)}_${Math.round(alpha * 100)}`, 2 * r, 2 * r, (ctx) => {
    ctx.fillStyle = css(color, alpha);
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Anel de carga: quadro i = arco de (i+1)/RING_FRAMES, por cima de um anel escuro. */
export function ringSheet(scene: Phaser.Scene, r: number, color: number, px = 1): string {
  const w = Math.ceil(5 * px);
  const R = r + Math.ceil(3 * px);
  const size = 2 * (R + w);
  return canvasTex(
    scene,
    `ui_ring_${r}_${color.toString(16)}_${px}`,
    size * RING_FRAMES,
    size,
    (ctx) => {
      for (let i = 0; i < RING_FRAMES; i++) {
        const cx = i * size + size / 2, cy = size / 2;
        ctx.lineWidth = 5 * px;
        ctx.strokeStyle = css(0x140c16, 0.9);
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 4 * px;
        ctx.strokeStyle = css(color);
        ctx.beginPath();
        ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + ((i + 1) / RING_FRAMES) * Math.PI * 2, false);
        ctx.stroke();
      }
    },
    { n: RING_FRAMES, fw: size },
  );
}

export const ringFrame = (frac: number) => String(Math.max(0, Math.min(RING_FRAMES - 1, Math.ceil(frac * RING_FRAMES) - 1)));

/** Círculo com contorno (base e botão do joystick). */
export function ringDiscTex(scene: Phaser.Scene, r: number, fill: number, fillA: number, stroke: number, strokeA: number, lw: number): string {
  const size = 2 * r + 2 * lw;
  return canvasTex(scene, `ui_rd_${r}_${fill.toString(16)}_${stroke.toString(16)}_${lw}`, size, size, (ctx) => {
    const c = size / 2;
    ctx.fillStyle = css(fill, fillA);
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.strokeStyle = css(stroke, strokeA);
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  });
}

/** Painel de canto arredondado (fundo dos quadros do jogador e do alvo). */
export function panelTex(scene: Phaser.Scene, w: number, h: number, border: number, px = 1): string {
  return canvasTex(scene, `ui_panel_${w}x${h}_${border.toString(16)}`, w, h, (ctx) => {
    const r = 6 * px, lw = 2 * px;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(r + lw / 2, lw / 2);
      ctx.arcTo(w - lw / 2, lw / 2, w - lw / 2, h - lw / 2, r);
      ctx.arcTo(w - lw / 2, h - lw / 2, lw / 2, h - lw / 2, r);
      ctx.arcTo(lw / 2, h - lw / 2, lw / 2, lw / 2, r);
      ctx.arcTo(lw / 2, lw / 2, w - lw / 2, lw / 2, r);
      ctx.closePath();
    };
    path();
    ctx.fillStyle = css(0x140c16, 0.78);
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.strokeStyle = css(border);
    ctx.stroke();
  });
}

/** Seta (aponta para a direita; gire com setRotation) com contorno escuro. */
export function arrowTex(scene: Phaser.Scene, size: number): string {
  return canvasTex(scene, `ui_seta_${size}`, size, size, (ctx) => {
    const s = size;
    ctx.beginPath();
    ctx.moveTo(s * 0.92, s * 0.5);
    ctx.lineTo(s * 0.3, s * 0.12);
    ctx.lineTo(s * 0.3, s * 0.34);
    ctx.lineTo(s * 0.08, s * 0.34);
    ctx.lineTo(s * 0.08, s * 0.66);
    ctx.lineTo(s * 0.3, s * 0.66);
    ctx.lineTo(s * 0.3, s * 0.88);
    ctx.closePath();
    ctx.fillStyle = css(0xffe23a);
    ctx.fill();
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.strokeStyle = css(0x140c16);
    ctx.stroke();
  });
}

/** Engrenagem simples (botão do modo de ajuste), desenhada dentro de um quadrado de `size`. */
export function gearTex(scene: Phaser.Scene, size: number): string {
  return canvasTex(scene, `ui_engrenagem_${size}`, size, size, (ctx) => {
    const c = size / 2, R = size * 0.42, r = size * 0.3, teeth = 8;
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const rr = i % 2 === 0 ? R : r;
      const a0 = a - Math.PI / (teeth * 2) / 1.4, a1 = a + Math.PI / (teeth * 2) / 1.4;
      ctx.lineTo(c + Math.cos(a0) * rr, c + Math.sin(a0) * rr);
      ctx.lineTo(c + Math.cos(a1) * rr, c + Math.sin(a1) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = css(0xd8d0e0);
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.strokeStyle = css(0x140c16);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c, c, size * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = css(0x2a2230);
    ctx.fill();
  });
}
