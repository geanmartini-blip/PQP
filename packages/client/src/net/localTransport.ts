/**
 * Transporte para o servidor local (?offline=1): o LocalServer roda os ticks dentro do pump(),
 * pelo relógio que o jogo passa, a 20 ticks por segundo. Sem timers: determinístico nos testes.
 */
import { TICK_MS } from '@pqp/shared/sim';
import { LocalServer, type LocalServerOpts } from './localServer';
import type { Transport } from './transport';

const noop = () => {};
// SUGESTÃO: no máximo 10 ticks recuperados de uma vez (aba voltando do fundo).
const MAX_CATCHUP_TICKS = 10;

export class LocalTransport implements Transport {
  onMessage: Transport['onMessage'] = noop;
  onStatus: Transport['onStatus'] = noop;
  onOpen: Transport['onOpen'] = noop;
  readonly server: LocalServer;
  private last: number | undefined;
  private acc = 0;
  private open = false;

  constructor(opts: LocalServerOpts = {}) {
    this.server = new LocalServer(opts);
  }

  connect(): void {
    this.open = true;
    this.onStatus('conectado', 'servidor local');
    this.onOpen(true);
  }

  send(type: string, msg: unknown): void {
    if (!this.open) return;
    this.server.receive(type, msg);
    this.flush();
  }

  private flush(): void {
    for (const [t, m] of this.server.take()) this.onMessage(t, m);
  }

  pump(now: number): void {
    if (!this.open) return;
    if (this.last === undefined) this.last = now;
    this.acc += Math.max(0, now - this.last);
    this.last = now;
    let n = 0;
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      if (n++ >= MAX_CATCHUP_TICKS) {
        this.acc = 0;
        break;
      }
      this.server.tick();
      this.flush();
    }
  }

  close(): void {
    this.open = false;
    this.onStatus('desconectado');
  }
}
