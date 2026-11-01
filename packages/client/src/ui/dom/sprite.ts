/**
 * Desenha um quadro de uma textura do Phaser (folha de boneco, retrato, emblema) num canvas do DOM,
 * em escala inteira e sem suavizar. As texturas são as da ArtApi (art/contract.ts).
 */
import type * as Phaser from 'phaser';

/** Desenha o quadro `frame` da textura `key` em `cv` (tamanho do canvas = quadro × escala). */
export function drawFrame(scene: Phaser.Scene, cv: HTMLCanvasElement, key: string, frame: string | undefined, scale: number): boolean {
  if (!scene.textures.exists(key)) return false;
  const tex = scene.textures.get(key);
  const f = frame !== undefined && tex.has(frame) ? tex.get(frame) : tex.get();
  const src = f.source.image as CanvasImageSource | undefined;
  if (!src) return false;
  const w = Math.round(f.cutWidth * scale), h = Math.round(f.cutHeight * scale);
  if (cv.width !== w) cv.width = w;
  if (cv.height !== h) cv.height = h;
  const ctx = cv.getContext('2d');
  if (!ctx) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(src, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, w, h);
  return true;
}

/** Quadros de andar de uma folha de boneco: `andando_${dir}_${i}` (dir 0 baixo, 1 esquerda, 2 cima, 3 direita). */
export const walkFrame = (dir: number, i: number): string => `andando_${dir}_${i}`;
export const idleFrame = (dir: number, i = 0): string => `parado_${dir}_${i}`;

/**
 * Prévia girando: a cada `turnMs` muda a direção (baixo, esquerda, cima, direita); o andar toca a
 * ~8 quadros por segundo. Devolve o quadro do instante `t` (ms).
 */
export function spinFrame(t: number, turnMs = 1400, walkFrames = 6, fps = 8): { dir: number; frame: string } {
  const order = [0, 1, 2, 3];
  const dir = order[Math.floor(t / turnMs) % 4]!;
  const i = Math.floor((t / 1000) * fps) % walkFrames;
  return { dir, frame: walkFrame(dir, i) };
}
