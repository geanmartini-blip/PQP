/**
 * Joystick flutuante (puro): nasce onde o polegar toca e o vetor vai de -1 a 1 em cada eixo.
 * Passando do raio, a base acompanha o dedo (o polegar nunca "sai" do joystick).
 * A zona morta em pixels evita andar num toque rápido.
 */

// SUGESTÃO: raio do curso do joystick em px de tela e zona morta.
export const JOY_RADIUS_PX = 56;
export const JOY_DEAD_PX = 8;
/** toque mais curto que isto e com pouco movimento é toque, não joystick */
export const TAP_MAX_MS = 260;
export const TAP_MAX_MOVE_PX = 12;

export interface JoyState {
  /** base (onde o polegar tocou, ou arrastada) */
  ox: number;
  oy: number;
  /** dedo */
  px: number;
  py: number;
  /** vetor -1..1 (|v| <= 1) */
  x: number;
  y: number;
}

/** Vetor do joystick para o dedo em (px, py), com base em (ox, oy). */
export function joystickVector(ox: number, oy: number, px: number, py: number, radius = JOY_RADIUS_PX, dead = JOY_DEAD_PX): { x: number; y: number; mag: number } {
  const dx = px - ox, dy = py - oy;
  const d = Math.hypot(dx, dy);
  if (d <= dead || d === 0) return { x: 0, y: 0, mag: 0 };
  const mag = Math.min(1, d / radius);
  return { x: (dx / d) * mag, y: (dy / d) * mag, mag };
}

/** Atualiza o joystick com o dedo em (px, py): a base segue o dedo além do raio. */
export function updateJoystick(s: JoyState, px: number, py: number, radius = JOY_RADIUS_PX, dead = JOY_DEAD_PX): JoyState {
  s.px = px;
  s.py = py;
  const dx = px - s.ox, dy = py - s.oy;
  const d = Math.hypot(dx, dy);
  if (d > radius) {
    s.ox = px - (dx / d) * radius;
    s.oy = py - (dy / d) * radius;
  }
  const v = joystickVector(s.ox, s.oy, px, py, radius, dead);
  s.x = v.x;
  s.y = v.y;
  return s;
}

export function newJoystick(x: number, y: number): JoyState {
  return { ox: x, oy: y, px: x, py: y, x: 0, y: 0 };
}

/** Teclado (WASD ou setas) para vetor: diagonais normalizadas. */
export function keysVector(left: boolean, right: boolean, up: boolean, down: boolean): { x: number; y: number } {
  const x = (right ? 1 : 0) - (left ? 1 : 0);
  const y = (down ? 1 : 0) - (up ? 1 : 0);
  if (x !== 0 && y !== 0) return { x: x * Math.SQRT1_2, y: y * Math.SQRT1_2 };
  return { x, y };
}

/** Foi um toque (curto e parado) e não um arrasto? */
export function isTap(durationMs: number, movedPx: number): boolean {
  return durationMs <= TAP_MAX_MS && movedPx <= TAP_MAX_MOVE_PX;
}
