/**
 * Simulação de rede ruim (atraso, perda e variação), sempre com RNG semeado.
 *
 * O transporte de verdade é WebSocket sobre TCP: nada se perde e nada sai de ordem. A "perda de
 * pacote" do TCP aparece como TRAVADA: o pacote perdido é retransmitido depois de ~RTO, e ele e
 * tudo o que veio depois chegam juntos, em rajada. Por isso o modo padrão é 'travada':
 * - cada mensagem, com probabilidade `loss`, segura a entrega por mais `stallMs` (padrão 250 ms);
 * - a ordem é sempre mantida (uma mensagem nunca chega antes da anterior), inclusive com variação.
 * O modo 'descarte' (mensagem some, como UDP) fica como opção para testar a robustez do protocolo.
 *
 * - LinkSim: usado pelo WorldRoom com timers de verdade, uma fila em ordem por cliente. Ambiente:
 *   PQP_LAG_MS = RTT extra (metade na entrada, metade na saída), PQP_LOSS = fração de mensagens com
 *   perda (entradas e snapshots), PQP_LOSS_MODE = travada (padrão) | descarte, PQP_STALL_MS = tempo
 *   da travada (padrão 250), PQP_JITTER_MS = variação extra opcional por mensagem, PQP_NET_SEED =
 *   semente (padrão 1).
 * - MemoryChannel: canal em memória com relógio virtual, para os testes (sem timers).
 */
import { createRng } from '@pqp/shared/sim';
import type { Rng } from '@pqp/shared/sim';

export type LossMode = 'travada' | 'descarte';

// SUGESTÃO: retransmissão do TCP depois de 250 ms (RTO típico com 200 ms de RTT).
export const DEFAULT_STALL_MS = 250;

export interface LinkConfig {
  /** RTT extra em ms (metade em cada sentido) */
  lagMs: number;
  /** fração 0..1 de mensagens com perda (entradas e snapshots) */
  loss: number;
  /** variação extra de 0 a jitterMs por mensagem (sem embaralhar a ordem) */
  jitterMs: number;
  seed: number;
  /** como a perda aparece (padrão 'travada', como no TCP). Adição: opcional. */
  lossMode?: LossMode;
  /** duração da travada em ms (padrão DEFAULT_STALL_MS). Adição: opcional. */
  stallMs?: number;
}

const num = (v: string | undefined, def: number) => {
  const n = v === undefined || v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : def;
};

export function linkConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LinkConfig {
  const cfg: LinkConfig = {
    lagMs: Math.max(0, num(env['PQP_LAG_MS'], 0)),
    loss: Math.min(0.9, Math.max(0, num(env['PQP_LOSS'], 0))),
    jitterMs: Math.max(0, num(env['PQP_JITTER_MS'], 0)),
    seed: num(env['PQP_NET_SEED'], 1) | 0,
  };
  if (env['PQP_LOSS_MODE'] === 'descarte' || env['PQP_LOSS_MODE'] === 'travada') cfg.lossMode = env['PQP_LOSS_MODE'];
  if (env['PQP_STALL_MS'] !== undefined && env['PQP_STALL_MS'] !== '') cfg.stallMs = Math.max(0, num(env['PQP_STALL_MS'], DEFAULT_STALL_MS));
  return cfg;
}

/** Um sentido do enlace com timers de verdade, com uma fila em ordem por chave (cliente). */
export class LinkSim {
  private rng: Rng;
  private queues = new Map<string, { at: number; fn: () => void }[]>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** quando a última mensagem de cada chave chega (ms do relógio do processo) */
  private lastAt = new Map<string, number>();
  dropped = 0;
  stalled = 0;
  passed = 0;

  constructor(
    readonly cfg: LinkConfig,
    seedOffset = 0,
    private readonly clock: () => number = () => performance.now(),
  ) {
    this.rng = createRng((cfg.seed + seedOffset * 7919) | 0);
  }

  get active(): boolean {
    return this.cfg.lagMs > 0 || this.cfg.loss > 0 || this.cfg.jitterMs > 0;
  }

  get mode(): LossMode {
    return this.cfg.lossMode ?? 'travada';
  }

  /**
   * Atraso deste sentido em ms, sem contar a ordem, ou null se a mensagem se perdeu (só no modo
   * 'descarte' e só quando `lossy`). No modo 'travada', a perda soma stallMs.
   */
  plan(lossy: boolean): number | null {
    let extra = 0;
    if (lossy && this.cfg.loss > 0 && this.rng.next() < this.cfg.loss) {
      if (this.mode === 'descarte') {
        this.dropped++;
        return null;
      }
      this.stalled++;
      extra = this.cfg.stallMs ?? DEFAULT_STALL_MS;
    }
    this.passed++;
    return this.cfg.lagMs / 2 + (this.cfg.jitterMs > 0 ? this.rng.next() * this.cfg.jitterMs : 0) + extra;
  }

  /**
   * Roda `fn` depois do atraso (ou nunca, se perdeu no modo 'descarte'). As mensagens da mesma
   * `key` saem na ordem em que entraram (como numa conexão TCP). Sem simulação, roda na hora.
   */
  run(lossy: boolean, fn: () => void, key = ''): void {
    if (!this.active) {
      fn();
      return;
    }
    const d = this.plan(lossy);
    if (d === null) return;
    const now = this.clock();
    const at = Math.max(now + d, this.lastAt.get(key) ?? 0);
    this.lastAt.set(key, at);
    let q = this.queues.get(key);
    if (!q) this.queues.set(key, (q = []));
    q.push({ at, fn });
    if (q.length === 1) this.arm(key);
  }

  private arm(key: string): void {
    const q = this.queues.get(key);
    if (!q || q.length === 0) return;
    const wait = Math.max(0, q[0]!.at - this.clock());
    const t = setTimeout(() => {
      this.timers.delete(key);
      const now = this.clock();
      // tudo o que já venceu sai junto, na ordem (a rajada depois da travada)
      while (q.length > 0 && q[0]!.at <= now + 0.5) {
        const m = q.shift()!;
        try {
          m.fn();
        } catch {
          // quem recebe trata os próprios erros; a fila segue
        }
      }
      if (q.length > 0) this.arm(key);
      else this.queues.delete(key);
    }, wait);
    this.timers.set(key, t);
  }

  /** Esquece uma chave (cliente saiu). */
  forget(key: string): void {
    const t = this.timers.get(key);
    if (t) clearTimeout(t);
    this.timers.delete(key);
    this.queues.delete(key);
    this.lastAt.delete(key);
  }

  /** Cancela o que estiver em trânsito (sala fechando). */
  dispose(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.queues.clear();
    this.lastAt.clear();
  }
}

// ---------------------------------------------------------------------------

export interface ChannelOptions {
  /** atraso de um sentido em ms (metade do RTT) */
  delayMs: number;
  /** fração 0..1 de mensagens com perda (travada ou descarte, ver lossMode) */
  loss?: number;
  /** como a perda aparece (padrão 'travada', como no TCP). Adição: opcional. */
  lossMode?: LossMode;
  /** duração da travada em ms (padrão DEFAULT_STALL_MS). Adição: opcional. */
  stallMs?: number;
  /** variação extra de 0 a jitterMs (sem embaralhar, a não ser com reorder) */
  jitterMs?: number;
  /** deixa a variação embaralhar a ordem (rede sem garantia de ordem; padrão false). Adição: opcional. */
  reorder?: boolean;
  /** fração 0..1 de mensagens entregues duas vezes */
  duplicate?: number;
  seed: number;
}

/**
 * Canal em memória com relógio virtual: send(msg, agora) e receive(agora) devolve o que chegou.
 * A mensagem é copiada (JSON) para o receptor não dividir objeto com quem mandou, como na rede.
 * Por padrão modela o TCP: em ordem, e a perda vira travada seguida de rajada.
 */
export class MemoryChannel<T> {
  private rng: Rng;
  private q: { at: number; n: number; msg: T }[] = [];
  private n = 0;
  private lastAt = -Infinity;
  sent = 0;
  dropped = 0;
  stalled = 0;

  constructor(readonly opts: ChannelOptions) {
    this.rng = createRng(opts.seed);
  }

  send(msg: T, nowMs: number): void {
    this.sent++;
    let extra = 0;
    if ((this.opts.loss ?? 0) > 0 && this.rng.next() < (this.opts.loss ?? 0)) {
      if ((this.opts.lossMode ?? 'travada') === 'descarte') {
        this.dropped++;
        return;
      }
      this.stalled++;
      extra = this.opts.stallMs ?? DEFAULT_STALL_MS;
    }
    const copies = (this.opts.duplicate ?? 0) > 0 && this.rng.next() < (this.opts.duplicate ?? 0) ? 2 : 1;
    for (let i = 0; i < copies; i++) {
      const jitter = (this.opts.jitterMs ?? 0) > 0 ? this.rng.next() * (this.opts.jitterMs ?? 0) : 0;
      let at = nowMs + this.opts.delayMs + jitter + extra;
      if (!this.opts.reorder) at = Math.max(at, this.lastAt);
      this.lastAt = Math.max(this.lastAt, at);
      this.q.push({ at, n: this.n++, msg: JSON.parse(JSON.stringify(msg)) as T });
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
