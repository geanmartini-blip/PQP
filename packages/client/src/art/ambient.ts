/**
 * Clima da cena (lado Phaser), barato para 60 fps: 3 objetos fixos e 16 partículas.
 * - Luz ambiente por região: um retângulo do tamanho da tela em MULTIPLY, quente e verde na
 *   Esquerda, frio sobre concreto na Direita, dourado no Delta; a troca de região é suave.
 * - Vinheta leve: textura 64x64 esticada (filtro linear) sobre a vista da câmera.
 * - Partículas: vagalumes na mata e no mangue (Esquerda e Delta), poeira neon na Direita.
 *
 * Nada é criado por quadro: só posição, alpha e cor mudam. Usa a vista da câmera (worldView), então
 * funciona com qualquer zoom.
 */
import * as Phaser from 'phaser';
import { DEPTH } from '../render/depth';
import { uploadPix } from './index';
import { hex, Pix, withAlpha } from './pixel';
import type { Style, TerrainSource } from './terrain';

// SUGESTÃO: cores da luz ambiente, força da vinheta e número de partículas não estão nos docs.
const TINT: Record<Style, [number, number, number]> = {
  0: [244, 255, 228],
  1: [222, 228, 255],
  2: [255, 242, 218],
};
const PARTICLES = 16;
const VIGNETTE_KEY = 'amb_vinheta';

export interface Ambient {
  update(timeMs: number, view: Phaser.Geom.Rectangle): void;
  destroy(): void;
}

function makeTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(VIGNETTE_KEY)) {
    const p = new Pix(64, 64);
    const ink = hex('#0a0814');
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const dx = (x + 0.5 - 32) / 32;
        const dy = (y + 0.5 - 32) / 32;
        const d = Math.sqrt(dx * dx * 0.8 + dy * dy * 0.6);
        const a = d < 0.62 ? 0 : Math.min(1, (d - 0.62) / 0.5) ** 1.7 * 120;
        p.set(x, y, withAlpha(ink, a));
      }
    uploadPix(scene, VIGNETTE_KEY, p, true);
  }
  const dot = (key: string, core: string, glow: string) => {
    if (scene.textures.exists(key)) return;
    const p = new Pix(7, 7);
    p.ellipse(3.5, 3.5, 3.4, 3.4, withAlpha(hex(glow), 60));
    p.ellipse(3.5, 3.5, 2, 2, withAlpha(hex(glow), 150));
    p.set(3, 3, hex(core));
    p.set(3, 2, withAlpha(hex(core), 200));
    uploadPix(scene, key, p);
  };
  dot('amb_vagalume', '#fbffc0', '#c8f05a');
  dot('amb_neon_c', '#e8ffff', '#2ee6f0');
  dot('amb_neon_p', '#ffe8f6', '#ff3ea5');
}

interface Mote {
  s: Phaser.GameObjects.Image;
  x: number;
  y: number;
  ph: number;
  kind: 'vagalume' | 'neon';
}

export function createAmbient(scene: Phaser.Scene, src: TerrainSource): Ambient {
  makeTextures(scene);
  const tint = scene.add.rectangle(0, 0, 8, 8, 0xffffff).setOrigin(0, 0).setDepth(DEPTH.ambient).setBlendMode(Phaser.BlendModes.MULTIPLY);
  const vig = scene.add.image(0, 0, VIGNETTE_KEY).setOrigin(0, 0).setDepth(DEPTH.ambient + 5);
  let cur: [number, number, number] = [255, 255, 255];
  let seed = 0x2f6e2b1;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const motes: Mote[] = [];
  for (let i = 0; i < PARTICLES; i++) {
    const s = scene.add.image(-100, -100, 'amb_vagalume').setDepth(DEPTH.particles).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    motes.push({ s, x: -1e9, y: -1e9, ph: rnd() * Math.PI * 2, kind: 'vagalume' });
  }
  let lastT = 0;
  return {
    update(t, view) {
      const dt = Math.min(100, Math.max(0, t - lastT));
      lastT = t;
      // luz da região sob o centro da câmera
      const tx = Math.floor(view.centerX / 32);
      const ty = Math.floor(view.centerY / 32);
      const st = src.style(tx, ty);
      const want = TINT[st];
      for (let k = 0; k < 3; k++) cur[k] = cur[k]! + (want[k]! - cur[k]!) * Math.min(1, dt / 900);
      tint.setPosition(view.x - 2, view.y - 2).setSize(view.width + 4, view.height + 4);
      tint.setFillStyle((Math.round(cur[0]) << 16) | (Math.round(cur[1]) << 8) | Math.round(cur[2]));
      vig.setPosition(view.x, view.y).setDisplaySize(view.width, view.height);
      // partículas
      const kind: Mote['kind'] = st === 1 ? 'neon' : 'vagalume';
      for (const [i, m] of motes.entries()) {
        const out = m.x < view.x - 16 || m.x > view.right + 16 || m.y < view.y - 16 || m.y > view.bottom + 16;
        if (out || m.kind !== kind) {
          m.x = view.x + rnd() * view.width;
          m.y = view.y + rnd() * view.height;
          m.kind = kind;
          m.s.setTexture(kind === 'neon' ? (i % 2 ? 'amb_neon_c' : 'amb_neon_p') : 'amb_vagalume');
        }
        const k = dt / 16;
        if (kind === 'vagalume') {
          m.x += Math.sin(t * 0.0007 + m.ph) * 0.35 * k;
          m.y += Math.cos(t * 0.0009 + m.ph * 1.3) * 0.25 * k;
        } else {
          m.x += Math.sin(t * 0.0004 + m.ph) * 0.15 * k;
          m.y -= 0.12 * k;
        }
        const a = kind === 'vagalume' ? Math.max(0, Math.sin(t * 0.0025 + m.ph * 3)) : 0.35 + 0.25 * Math.sin(t * 0.002 + m.ph);
        m.s.setPosition(Math.round(m.x), Math.round(m.y)).setAlpha(a).setVisible(a > 0.05);
      }
    },
    destroy() {
      tint.destroy();
      vig.destroy();
      for (const m of motes) m.s.destroy();
    },
  };
}
