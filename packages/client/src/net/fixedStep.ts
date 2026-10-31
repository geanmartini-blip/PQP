/**
 * Passo fixo (puro): a simulação local roda em passos de 50 ms (o tick do servidor) e o desenho a
 * 60 fps interpola entre o passo anterior e o atual pelo `alpha`.
 */
import { TICK_MS } from '@pqp/shared/sim';

// SUGESTÃO: no máximo 5 passos por quadro (aba voltando do fundo não trava o jogo recuperando).
export const MAX_STEPS_PER_FRAME = 5;

export class FixedStep {
  private acc = 0;

  constructor(readonly stepMs = TICK_MS) {}

  /** Soma o tempo do quadro e devolve quantos passos rodar agora. */
  advance(dtMs: number): number {
    if (!(dtMs > 0)) return 0;
    this.acc += dtMs;
    let n = Math.floor(this.acc / this.stepMs);
    if (n > MAX_STEPS_PER_FRAME) {
      n = MAX_STEPS_PER_FRAME;
      this.acc = 0;
    } else this.acc -= n * this.stepMs;
    return n;
  }

  /** Fração do passo atual já vivida (0..1), para interpolar o desenho. */
  get alpha(): number {
    return Math.max(0, Math.min(1, this.acc / this.stepMs));
  }

  reset(): void {
    this.acc = 0;
  }
}
