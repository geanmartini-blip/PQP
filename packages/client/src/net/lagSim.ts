/**
 * Simulador de rede ruim (puro, testável): atraso, variação e perda num sentido.
 *
 * O ?lag=200 da URL é o RTT: metade na ida e metade na volta. O jitter total também se divide:
 * cada sentido varia ±jitter/4 em volta do atraso, para o RTT variar ±jitter/2. A ordem de chegada é
 * mantida (o WebSocket é TCP: atrasa, mas não embaralha). A perda vale nos dois sentidos, só para
 * mensagens "perdíveis" (entradas, snapshots, ping): hello, welcome e pedidos de info passam sempre,
 * senão o protótipo travaria num handshake perdido, coisa que o TCP de verdade não faz.
 */

export interface LagOptions {
  /** RTT total simulado (ms) */
  lagMs: number;
  /** variação total do RTT (ms) */
  jitterMs: number;
  /** chance de perda por mensagem, em cada sentido */
  loss: number;
}

/** Atraso de um sentido a partir do RTT pedido. */
export function oneWay(o: LagOptions): { delayMs: number; jitterMs: number; loss: number } {
  return { delayMs: Math.max(0, o.lagMs) / 2, jitterMs: Math.max(0, o.jitterMs) / 2, loss: Math.max(0, Math.min(1, o.loss)) };
}

export const lagActive = (o: LagOptions) => o.lagMs > 0 || o.jitterMs > 0 || o.loss > 0;

/** RNG simples e semeável para testes (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Pending<T> {
  at: number;
  item: T;
}

/** Um sentido da rede simulada. */
export class LagChannel<T> {
  private q: Pending<T>[] = [];
  private head = 0;
  private lastAt = -Infinity;
  readonly stats = { sent: 0, dropped: 0, delivered: 0 };

  constructor(
    readonly delayMs: number,
    readonly jitterMs: number,
    readonly loss: number,
    private readonly rand: () => number = Math.random,
  ) {}

  /** Põe uma mensagem na rede. Devolve false se ela se perdeu. */
  push(item: T, now: number, droppable = true): boolean {
    this.stats.sent++;
    if (droppable && this.loss > 0 && this.rand() < this.loss) {
      this.stats.dropped++;
      return false;
    }
    const j = this.jitterMs > 0 ? (this.rand() * 2 - 1) * (this.jitterMs / 2) : 0;
    // mantém a ordem: ninguém chega antes de quem saiu antes
    const at = Math.max(now + Math.max(0, this.delayMs + j), this.lastAt);
    this.lastAt = at;
    this.q.push({ at, item });
    return true;
  }

  /** Entrega o que já chegou até `now`, em ordem. */
  drain(now: number, out: T[] = []): T[] {
    while (this.head < this.q.length && this.q[this.head]!.at <= now) {
      out.push(this.q[this.head]!.item);
      this.head++;
      this.stats.delivered++;
    }
    if (this.head > 64 && this.head * 2 > this.q.length) {
      this.q = this.q.slice(this.head);
      this.head = 0;
    }
    return out;
  }

  get size(): number {
    return this.q.length - this.head;
  }

  clear(): void {
    this.q = [];
    this.head = 0;
    this.lastAt = -Infinity;
  }
}
