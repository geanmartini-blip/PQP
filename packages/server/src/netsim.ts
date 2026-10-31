/**
 * Simulação de rede ruim (atraso, perda e variação), sempre com RNG semeado.
 *
 * - LinkSim: usado pelo WorldRoom com timers de verdade. Configurado por ambiente:
 *   PQP_LAG_MS = RTT extra (metade na entrada, metade na saída), PQP_LOSS = fração de mensagens
 *   descartadas (entradas e snapshots), PQP_JITTER_MS = variação extra opcional por mensagem,
 *   PQP_NET_SEED = semente (padrão 1).
 * - MemoryChannel: canal em memória com relógio virtual, para os testes (sem timers).
 */
import { createRng } from '@pqp/shared/sim';
import type { Rng } from '@pqp/shared/sim';

export interface LinkConfig {
  /** RTT extra em ms (metade em cada sentido) */
  lagMs: number;
  /** fração 0..1 de mensagens com perda (entradas e snapshots) */
  loss: number;
  /** variação extra de 0 a jitterMs por mensagem */
  jitterMs: number;
  seed: number;
}

const num = (v: string | undefined, def: number) => {
  const n = v === undefined || v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : def;
};

export function linkConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LinkConfig {
  return {
    lagMs: Math.max(0, num(env['PQP_LAG_MS'], 0)),
    loss: Math.min(0.9, Math.max(0, num(env['PQP_LOSS'], 0))),
    jitterMs: Math.max(0, num(env['PQP_JITTER_MS'], 0)),
    seed: num(env['PQP_NET_SEED'], 1) | 0,
  };
}

/** Um sentido do enlace com timers de verdade. */
export class LinkSim {
  private rng: Rng;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  dropped = 0;
  passed = 0;

  constructor(
    readonly cfg: LinkConfig,
    seedOffset = 0,
  ) {
    this.rng = createRng((cfg.seed + seedOffset * 7919) | 0);
  }

  get active(): boolean {
    return this.cfg.lagMs > 0 || this.cfg.loss > 0 || this.cfg.jitterMs > 0;
  }

  /** Atraso deste sentido em ms, ou null se a mensagem se perdeu (só quando `lossy`). */
  plan(lossy: boolean): number | null {
    if (lossy && this.cfg.loss > 0 && this.rng.next() < this.cfg.loss) {
      this.dropped++;
      return null;
    }
    this.passed++;
    return this.cfg.lagMs / 2 + (this.cfg.jitterMs > 0 ? this.rng.next() * this.cfg.jitterMs : 0);
  }

  /** Roda `fn` depois do atraso (ou nunca, se perdeu). Sem simulação, roda na hora. */
  run(lossy: boolean, fn: () => void): void {
    if (!this.active) {
      fn();
      return;
    }
    const d = this.plan(lossy);
    if (d === null) return;
    if (d <= 0) {
      fn();
      return;
    }
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, d);
    this.timers.add(t);
  }

  /** Cancela o que estiver em trânsito (sala fechando). */
  dispose(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}

// ---------------------------------------------------------------------------

export interface ChannelOptions {
  /** atraso de um sentido em ms (metade do RTT) */
  delayMs: number;
  /** fração 0..1 de mensagens perdidas */
  loss?: number;
  /** variação extra de 0 a jitterMs */
  jitterMs?: number;
  /** fração 0..1 de mensagens entregues duas vezes */
  duplicate?: number;
  seed: number;
}

/**
 * Canal em memória com relógio virtual: send(msg, agora) e receive(agora) devolve o que chegou.
 * A mensagem é copiada (JSON) para o receptor não dividir objeto com quem mandou, como na rede.
 */
export class MemoryChannel<T> {
  private rng: Rng;
  private q: { at: number; n: number; msg: T }[] = [];
  private n = 0;
  sent = 0;
  dropped = 0;

  constructor(readonly opts: ChannelOptions) {
    this.rng = createRng(opts.seed);
  }

  send(msg: T, nowMs: number): void {
    this.sent++;
    if ((this.opts.loss ?? 0) > 0 && this.rng.next() < (this.opts.loss ?? 0)) {
      this.dropped++;
      return;
    }
    const copies = (this.opts.duplicate ?? 0) > 0 && this.rng.next() < (this.opts.duplicate ?? 0) ? 2 : 1;
    for (let i = 0; i < copies; i++) {
      const jitter = (this.opts.jitterMs ?? 0) > 0 ? this.rng.next() * (this.opts.jitterMs ?? 0) : 0;
      this.q.push({ at: nowMs + this.opts.delayMs + jitter, n: this.n++, msg: JSON.parse(JSON.stringify(msg)) as T });
    }
  }

  /** Mensagens que já chegaram até `nowMs`, na ordem de chegada. */
  receive(nowMs: number): T[] {
    if (this.q.length === 0) return [];
    const due = this.q.filter((m) => m.at <= nowMs).sort((a, b) => a.at - b.at || a.n - b.n);
    if (due.length === 0) return [];
    this.q = this.q.filter((m) => m.at > nowMs);
    return due.map((m) => m.msg);
  }

  get inFlight(): number {
    return this.q.length;
  }
}
