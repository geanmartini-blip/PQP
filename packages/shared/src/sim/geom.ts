/** Geometria em tiles. Ângulo em radianos, 0 = direita, sentido horário (y para baixo). */
import type { Facing, Vec } from './types';

export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay);
export const distE = (a: Vec, b: Vec) => Math.hypot(b.x - a.x, b.y - a.y);
export const angleTo = (a: Vec, b: Vec) => Math.atan2(b.y - a.y, b.x - a.x);

const FACING_VEC: readonly Vec[] = [
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
  { x: 1, y: 0 },
];

export const facingVec = (f: Facing): Vec => FACING_VEC[f]!;
export const facingAngle = (f: Facing) => Math.atan2(FACING_VEC[f]!.y, FACING_VEC[f]!.x);

/** Direção dominante de um vetor (0 baixo, 1 esquerda, 2 cima, 3 direita). */
export function facingFrom(dx: number, dy: number, fallback: Facing): Facing {
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return fallback;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 3 : 1;
  return dy > 0 ? 0 : 2;
}

/** Diferença absoluta entre dois ângulos, em [0, π]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d < -Math.PI) d += 2 * Math.PI;
  if (d > Math.PI) d -= 2 * Math.PI;
  return Math.abs(d);
}

/**
 * Corpo (x, y, r) dentro do cone que sai de (ox, oy) na direção dir, com comprimento range e
 * abertura angleDeg. Quem encosta no lançador sempre conta.
 */
export function inCone(ox: number, oy: number, dir: number, range: number, angleDeg: number, x: number, y: number, r: number): boolean {
  const d = dist(ox, oy, x, y);
  if (d - r > range) return false;
  if (d <= r + 0.3) return true;
  const half = (angleDeg * Math.PI) / 360;
  // o raio do corpo alarga um pouco a borda do cone
  const slack = Math.asin(Math.min(1, r / d));
  return angleDiff(Math.atan2(y - oy, x - ox), dir) <= half + slack;
}

/** Distância do ponto (px, py) ao segmento (ax, ay)-(bx, by). */
export function pointSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return dist(px, py, ax, ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return dist(px, py, ax + t * dx, ay + t * dy);
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
