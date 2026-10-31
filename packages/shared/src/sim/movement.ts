/**
 * Movimento livre estilo arcade, sem grade: velocidade em tiles/s, corpo circular contra tiles
 * sólidos, resolução por eixo (escorrega na parede) e subpassos para não atravessar nada.
 *
 * stepMovement e moveVelocity são puras e não dependem de World: o cliente usa as mesmas para
 * prever o próprio movimento (com hud.mv e hud.canMove), e o servidor usa para decidir a posição.
 */
import { circleFree, speedAt } from '../map/grid';
import type { TileMap } from '../map/types';
import { JOYSTICK_DEADZONE } from './constants';
import { canMove } from './entity';
import { moveSpeedOf } from './stats';
import type { Entity, Vec, World } from './types';

/** Maior deslocamento por subpasso: metade do raio, entre 0,05 e 0,25 tile. */
const subStep = (r: number) => Math.max(0.05, Math.min(0.25, r * 0.5));

/**
 * Desloca um corpo (x, y, r) por (dx, dy) com colisão: cada subpasso tenta o eixo X e depois o Y;
 * o eixo bloqueado encosta na parede (bisseção) e o outro continua, o que faz escorregar.
 * Não aplica o multiplicador do tile (empurrões e avanços usam direto).
 */
export function moveBody(map: TileMap, x: number, y: number, r: number, dx: number, dy: number): Vec {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / subStep(r)));
  const sx = dx / n, sy = dy / n;
  for (let i = 0; i < n; i++) {
    if (sx !== 0) x = tryAxis(map, x, y, r, sx, true);
    if (sy !== 0) y = tryAxis(map, x, y, r, sy, false);
  }
  return { x, y };
}

function tryAxis(map: TileMap, x: number, y: number, r: number, d: number, isX: boolean): number {
  const free = (t: number) => (isX ? circleFree(map, x + d * t, y, r) : circleFree(map, x, y + d * t, r));
  if (free(1)) return (isX ? x : y) + d;
  // encosta: maior fração livre, por bisseção
  let lo = 0, hi = 1;
  for (let k = 0; k < 5; k++) {
    const mid = (lo + hi) / 2;
    if (free(mid)) lo = mid;
    else hi = mid;
  }
  return (isX ? x : y) + d * lo;
}

/**
 * Integra a velocidade (tiles/s) por dtMs, com o multiplicador do tile sob o centro (água rasa e
 * lama deixam mais lento) e colisão por eixo. PURA: mesmo resultado no cliente e no servidor.
 */
export function stepMovement(map: TileMap, body: { x: number; y: number; radius: number }, vx: number, vy: number, dtMs: number): Vec {
  if (vx === 0 && vy === 0) return { x: body.x, y: body.y };
  const m = speedAt(map, body.x, body.y);
  const mult = m > 0 ? m : 1; // centro num tile sólido (preso): anda normal para sair
  const dt = dtMs / 1000;
  return moveBody(map, body.x, body.y, body.radius, vx * mult * dt, vy * mult * dt);
}

/**
 * Velocidade a partir do joystick (-1..1): |intent| > 1 vira 1, a zona morta vira 0, e o curso
 * parcial anda mais devagar (analógico). O cliente usa junto com hud.mv.
 */
export function moveVelocity(intent: Vec, moveSpeed: number): { vx: number; vy: number } {
  const len = Math.hypot(intent.x, intent.y);
  if (len < JOYSTICK_DEADZONE) return { vx: 0, vy: 0 };
  const k = (len > 1 ? 1 / len : 1) * moveSpeed;
  return { vx: intent.x * k, vy: intent.y * k };
}

/** Velocidade de deslocamento efetiva agora (tiles/s), com lentidão e reforços; 0 se não pode andar. */
export function effectiveMoveSpeed(_w: World, e: Entity): number {
  if (!canMove(e)) return 0;
  return moveSpeedOf(e);
}

/** Velocidade para ir até um ponto, freando para não passar dele neste tick. */
export function velocityToward(e: Entity, tx: number, ty: number, speed: number, dtMs: number): { vx: number; vy: number; dist: number } {
  const dx = tx - e.x, dy = ty - e.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6 || speed <= 0) return { vx: 0, vy: 0, dist: d };
  const maxStep = (speed * dtMs) / 1000;
  const s = d < maxStep ? (d / maxStep) * speed : speed;
  return { vx: (dx / d) * s, vy: (dy / d) * s, dist: d };
}
