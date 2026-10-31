/**
 * Previsão e reconciliação do próprio movimento (pura, testável).
 *
 * A cada passo fixo de 50 ms o cliente cria uma PlayerInput (seq crescente) e já anda com ela, com
 * o mesmo stepMovement e moveVelocity do servidor e a velocidade que o servidor mandou (hud.mv,
 * hud.canMove). No "tocar no chão" o cliente também segue o caminho do A* como o servidor faz
 * (pontos a menos de 0,15 tile caem, para a menos de 0,1 tile do destino).
 *
 * Quando chega o snapshot: volta para a posição do servidor no ack (última seq processada), tira o
 * que já foi confirmado e reaplica as entradas sem ack. A diferença entre onde o boneco estava
 * desenhado e a posição corrigida vira um deslocamento visual que some em ~100 ms (sem tranco). Se o
 * erro passar de 2 tiles (empurrão grande, volta ao QG), teletransporta.
 *
 * Quando o servidor mexe no personagem sem joystick (modo automático, avanço, habilidade pendente,
 * empurrão), as entradas são zero e a reaplicação não anda: o boneco segue a posição do servidor,
 * suavizado.
 */
import { dequantizeAxis, quantizeAxis } from '@pqp/shared/net';
import { moveVelocity, SIM_TUNING, stepMovement, TICK_MS, type PlayerInput, type Vec } from '@pqp/shared/sim';
import type { TileMap } from '@pqp/shared/map';

// SUGESTÃO: erro acima disto (tiles) teletransporta em vez de suavizar.
export const TELEPORT_ERROR_TILES = 2;
// SUGESTÃO: constante de tempo da correção visual; e^(-100/33) ≈ 5% sobra depois de 100 ms.
export const ERROR_DECAY_TAU_MS = 33;
// SUGESTÃO: entradas guardadas sem ack (3 s a 20 Hz). Mais que isso, o servidor parou de confirmar.
export const MAX_HISTORY = 60;

/** Entrada guardada para reaplicar: o joystick quantizado e, no auto-caminho, o ponto seguido. */
export interface PredInput {
  seq: number;
  mx: number;
  my: number;
  /** ponto do caminho seguido neste passo (sem joystick) */
  wp?: Vec;
}

/** Igual a velocityToward do núcleo: vai até o ponto e freia para não passar dele neste passo. */
export function towardVelocity(x: number, y: number, tx: number, ty: number, speed: number, dtMs: number): { vx: number; vy: number; dist: number } {
  const dx = tx - x, dy = ty - y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6 || speed <= 0) return { vx: 0, vy: 0, dist: d };
  const maxStep = (speed * dtMs) / 1000;
  const s = d < maxStep ? (d / maxStep) * speed : speed;
  return { vx: (dx / d) * s, vy: (dy / d) * s, dist: d };
}

export class Predictor {
  /** posição prevista no passo atual e no anterior (tiles) */
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  /** deslocamento visual que está sendo corrigido aos poucos */
  errX = 0;
  errY = 0;
  /** velocidade do último passo (tiles/s), para a animação e a direção */
  vx = 0;
  vy = 0;
  /** velocidade e permissão vindas do servidor */
  mv = 0;
  canMove = true;
  initialized = false;
  /** última seq confirmada */
  ack = 0;
  /** contagem de correções (diagnóstico e testes) */
  readonly stats = { reconciles: 0, teleports: 0, lastError: 0, maxError: 0 };

  private history: PredInput[] = [];
  private path: Vec[] | null = null;
  private moveTo: Vec | null = null;
  private body = { x: 0, y: 0, radius: SIM_TUNING.PLAYER_RADIUS };

  constructor(
    private map: TileMap,
    readonly radius = SIM_TUNING.PLAYER_RADIUS,
  ) {
    this.body.radius = radius;
  }

  setMap(map: TileMap): void {
    this.map = map;
  }

  /** Coloca o boneco na posição do servidor sem suavizar (primeiro snapshot, sessão nova). */
  reset(x: number, y: number): void {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.errX = this.errY = 0;
    this.vx = this.vy = 0;
    this.history = [];
    this.path = null;
    this.moveTo = null;
    this.initialized = true;
  }

  /** Começa a seguir um caminho (o mesmo que o servidor vai calcular no ir_ate). */
  setPath(path: readonly Vec[] | null, dest: Vec): void {
    this.path = path && path.length > 0 ? path.map((p) => ({ x: p.x, y: p.y })) : null;
    this.moveTo = { x: dest.x, y: dest.y };
  }

  clearPath(): void {
    this.path = null;
    this.moveTo = null;
  }

  get following(): boolean {
    return this.path !== null || this.moveTo !== null;
  }

  get pendingInputs(): number {
    return this.history.length;
  }

  /** Destino do auto-caminho, se houver (para o marcador no chão). */
  get destination(): Vec | null {
    return this.moveTo;
  }

  /**
   * Um passo fixo com a entrada `input` (joystick já quantizado). Guarda a entrada para reaplicar.
   */
  step(input: PlayerInput): void {
    this.prevX = this.x;
    this.prevY = this.y;
    const rec: PredInput = { seq: input.seq, mx: input.mx, my: input.my };
    const ix = dequantizeAxis(input.mx), iy = dequantizeAxis(input.my);
    let vx = 0, vy = 0;
    if (this.initialized && this.canMove) {
      if (Math.hypot(ix, iy) >= SIM_TUNING.JOYSTICK_DEADZONE) {
        // joystick cancela o auto-caminho, como no servidor
        this.path = null;
        this.moveTo = null;
        ({ vx, vy } = moveVelocity({ x: ix, y: iy }, this.mv));
      } else if (this.path) {
        while (this.path.length > 0 && Math.hypot(this.x - this.path[0]!.x, this.y - this.path[0]!.y) < 0.15) this.path.shift();
        const wp = this.path[0] ?? this.moveTo;
        if (wp) {
          rec.wp = { x: wp.x, y: wp.y };
          ({ vx, vy } = towardVelocity(this.x, this.y, wp.x, wp.y, this.mv, TICK_MS));
        }
        if (this.path.length === 0) this.path = null;
      } else if (this.moveTo) {
        const v = towardVelocity(this.x, this.y, this.moveTo.x, this.moveTo.y, this.mv, TICK_MS);
        if (v.dist < 0.1) this.moveTo = null;
        else {
          rec.wp = { x: this.moveTo.x, y: this.moveTo.y };
          vx = v.vx;
          vy = v.vy;
        }
      }
    }
    this.vx = vx;
    this.vy = vy;
    if (vx !== 0 || vy !== 0) {
      this.body.x = this.x;
      this.body.y = this.y;
      const p = stepMovement(this.map, this.body, vx, vy, TICK_MS);
      this.x = p.x;
      this.y = p.y;
    }
    this.history.push(rec);
    if (this.history.length > MAX_HISTORY) this.history.splice(0, this.history.length - MAX_HISTORY);
  }

  /** Reaplica uma entrada guardada a partir de (x, y). */
  private replay(rec: PredInput, x: number, y: number): Vec {
    if (!this.canMove) return { x, y };
    const ix = dequantizeAxis(rec.mx), iy = dequantizeAxis(rec.my);
    let vx = 0, vy = 0;
    if (Math.hypot(ix, iy) >= SIM_TUNING.JOYSTICK_DEADZONE) ({ vx, vy } = moveVelocity({ x: ix, y: iy }, this.mv));
    else if (rec.wp) ({ vx, vy } = towardVelocity(x, y, rec.wp.x, rec.wp.y, this.mv, TICK_MS));
    if (vx === 0 && vy === 0) return { x, y };
    this.body.x = x;
    this.body.y = y;
    return stepMovement(this.map, this.body, vx, vy, TICK_MS);
  }

  /**
   * Snapshot do servidor: posição (tiles) no ack, velocidade e permissão atuais.
   * Devolve o erro encontrado (tiles) e se teletransportou.
   */
  reconcile(sx: number, sy: number, ack: number, mv: number, canMove: boolean): { error: number; teleported: boolean } {
    this.mv = mv;
    this.canMove = canMove;
    if (!this.initialized) {
      this.reset(sx, sy);
      this.ack = ack;
      return { error: 0, teleported: true };
    }
    if (ack > this.ack) this.ack = ack;
    // tira o que o servidor já processou
    let i = 0;
    while (i < this.history.length && this.history[i]!.seq <= this.ack) i++;
    if (i > 0) this.history.splice(0, i);
    // reaplica o resto a partir da posição do servidor
    let x = sx, y = sy;
    for (const rec of this.history) ({ x, y } = this.replay(rec, x, y));
    const dx = this.x - x, dy = this.y - y;
    const err = Math.hypot(dx, dy);
    this.stats.reconciles++;
    this.stats.lastError = err;
    if (err > this.stats.maxError) this.stats.maxError = err;
    if (err > TELEPORT_ERROR_TILES) {
      this.stats.teleports++;
      this.x = this.prevX = x;
      this.y = this.prevY = y;
      this.errX = this.errY = 0;
      this.path = null;
      this.moveTo = null;
      return { error: err, teleported: true };
    }
    if (err > 1e-9) {
      // o desenho não pula: o erro vira deslocamento visual e some aos poucos
      this.errX += dx;
      this.errY += dy;
      this.prevX -= dx;
      this.prevY -= dy;
      this.x = x;
      this.y = y;
    }
    return { error: err, teleported: false };
  }

  /** Some com o erro visual aos poucos (chamar a cada quadro). */
  decay(dtMs: number): void {
    if (this.errX === 0 && this.errY === 0) return;
    const k = Math.exp(-Math.max(0, dtMs) / ERROR_DECAY_TAU_MS);
    this.errX *= k;
    this.errY *= k;
    if (Math.abs(this.errX) < 1e-4 && Math.abs(this.errY) < 1e-4) this.errX = this.errY = 0;
  }

  /** Posição para desenhar: interpola entre os passos e soma o erro que ainda sobra. */
  render(alpha: number, out: Vec): Vec {
    out.x = this.prevX + (this.x - this.prevX) * alpha + this.errX;
    out.y = this.prevY + (this.y - this.prevY) * alpha + this.errY;
    return out;
  }
}

/** Joystick (-1..1) quantizado para PlayerInput. */
export function makeInput(seq: number, ix: number, iy: number): PlayerInput {
  return { seq, mx: quantizeAxis(ix), my: quantizeAxis(iy) };
}
