/**
 * Interpolação dos outros (pura): cada entidade guarda as posições do snapshot pelo tempo do
 * servidor (tick × 50 ms), e o desenho lê INTERP_DELAY_MS no passado. Se faltar pacote, extrapola
 * pela última velocidade por pouco tempo e depois segura.
 *
 * ServerClock estima o "agora" do servidor a partir da chegada dos snapshots (média móvel do
 * deslocamento entre o relógio local e o do servidor) e nunca anda para trás.
 */
import { INTERP_DELAY_MS } from '@pqp/shared/net';
import { TICK_MS } from '@pqp/shared/sim';

// SUGESTÃO: extrapolação máxima quando falta snapshot (cobre 2 a 3 pacotes perdidos seguidos).
export const EXTRAPOLATE_MAX_MS = 150;
// SUGESTÃO: salto maior que isto entre dois snapshots é teletransporte (volta ao QG): não interpola.
export const SNAP_TELEPORT_TILES = 4;
/** amostras guardadas por entidade (~1,6 s a 20 Hz) */
export const INTERP_CAPACITY = 32;

export interface Sample {
  t: number;
  x: number;
  y: number;
}

/** Buffer circular de posições por tempo do servidor (ms). */
export class InterpBuffer {
  private ts = new Float64Array(INTERP_CAPACITY);
  private xs = new Float64Array(INTERP_CAPACITY);
  private ys = new Float64Array(INTERP_CAPACITY);
  private start = 0;
  private n = 0;

  get length(): number {
    return this.n;
  }

  private idx(i: number): number {
    return (this.start + i) % INTERP_CAPACITY;
  }

  /** Acrescenta uma posição. Amostra fora de ordem ou repetida é ignorada. */
  push(t: number, x: number, y: number): void {
    if (this.n > 0) {
      const last = this.idx(this.n - 1);
      if (t <= this.ts[last]!) {
        if (t === this.ts[last]) {
          this.xs[last] = x;
          this.ys[last] = y;
        }
        return;
      }
    }
    if (this.n === INTERP_CAPACITY) {
      this.start = (this.start + 1) % INTERP_CAPACITY;
      this.n--;
    }
    const i = this.idx(this.n);
    this.ts[i] = t;
    this.xs[i] = x;
    this.ys[i] = y;
    this.n++;
  }

  newest(out: Sample): boolean {
    if (this.n === 0) return false;
    const i = this.idx(this.n - 1);
    out.t = this.ts[i]!;
    out.x = this.xs[i]!;
    out.y = this.ys[i]!;
    return true;
  }

  /**
   * Posição no tempo `t` (ms do servidor), em `out`. Entre duas amostras interpola; depois da
   * última extrapola até EXTRAPOLATE_MAX_MS e segura; antes da primeira devolve a primeira.
   * Devolve false se o buffer está vazio.
   */
  sample(t: number, out: Sample): boolean {
    const n = this.n;
    if (n === 0) return false;
    const first = this.idx(0);
    if (n === 1 || t <= this.ts[first]!) {
      out.t = t;
      out.x = this.xs[first]!;
      out.y = this.ys[first]!;
      if (n === 1) return true;
      return true;
    }
    const lastI = this.idx(n - 1);
    if (t >= this.ts[lastI]!) {
      const prevI = this.idx(n - 2);
      const dt = this.ts[lastI]! - this.ts[prevI]!;
      const ex = Math.min(t - this.ts[lastI]!, EXTRAPOLATE_MAX_MS);
      const dx = this.xs[lastI]! - this.xs[prevI]!, dy = this.ys[lastI]! - this.ys[prevI]!;
      out.t = t;
      if (dt > 0 && ex > 0 && Math.hypot(dx, dy) < SNAP_TELEPORT_TILES) {
        out.x = this.xs[lastI]! + (dx / dt) * ex;
        out.y = this.ys[lastI]! + (dy / dt) * ex;
      } else {
        out.x = this.xs[lastI]!;
        out.y = this.ys[lastI]!;
      }
      return true;
    }
    // procura de trás para frente (o tempo pedido fica perto do fim)
    for (let k = n - 2; k >= 0; k--) {
      const a = this.idx(k);
      if (this.ts[a]! <= t) {
        const b = this.idx(k + 1);
        const ta = this.ts[a]!, tb = this.ts[b]!;
        const ax = this.xs[a]!, ay = this.ys[a]!, bx = this.xs[b]!, by = this.ys[b]!;
        out.t = t;
        if (Math.hypot(bx - ax, by - ay) >= SNAP_TELEPORT_TILES) {
          // teletransporte: fica no ponto antigo até a hora do novo
          out.x = ax;
          out.y = ay;
        } else {
          const u = tb > ta ? (t - ta) / (tb - ta) : 1;
          out.x = ax + (bx - ax) * u;
          out.y = ay + (by - ay) * u;
        }
        return true;
      }
    }
    out.t = t;
    out.x = this.xs[first]!;
    out.y = this.ys[first]!;
    return true;
  }

  clear(): void {
    this.n = 0;
    this.start = 0;
  }
}

// SUGESTÃO: peso da média móvel do relógio do servidor (0,1 = segue em ~10 snapshots).
const CLOCK_ALPHA = 0.1;
// SUGESTÃO: diferença maior que isto (ms) faz o relógio pular direto (reconexão, aba voltando).
const CLOCK_RESYNC_MS = 1000;

/** Estimativa do tempo do servidor (ms = tick × 50) a partir do relógio local. */
export class ServerClock {
  private offset = 0;
  private ready = false;
  private lastRender = -Infinity;
  delayMs: number;

  constructor(delayMs = INTERP_DELAY_MS) {
    this.delayMs = delayMs;
  }

  get synced(): boolean {
    return this.ready;
  }

  /** Um snapshot do tick `tick` chegou no instante local `now`. */
  onSnapshot(tick: number, now: number): void {
    const sample = tick * TICK_MS - now;
    if (!this.ready || Math.abs(sample - this.offset) > CLOCK_RESYNC_MS) {
      this.offset = sample;
      this.ready = true;
      this.lastRender = -Infinity;
      return;
    }
    this.offset += (sample - this.offset) * CLOCK_ALPHA;
  }

  /** Tempo do servidor estimado agora (o último snapshot que deveria ter chegado). */
  serverNow(now: number): number {
    return now + this.offset;
  }

  /** Tempo em que os outros são desenhados: serverNow − atraso de interpolação, sem voltar. */
  renderTime(now: number): number {
    const t = this.serverNow(now) - this.delayMs;
    if (t < this.lastRender) return this.lastRender;
    this.lastRender = t;
    return t;
  }

  reset(): void {
    this.ready = false;
    this.offset = 0;
    this.lastRender = -Infinity;
  }
}
