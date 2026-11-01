/**
 * Transporte de mensagens do cliente (interface) e o embrulho que simula rede ruim.
 * Implementações: ColyseusTransport (servidor de verdade) e LocalTransport (servidor no navegador).
 */
import { MSG } from '@pqp/shared/net';
import { LagChannel, lagActive, oneWay, type LagOptions } from './lagSim';

export type NetStatus = 'conectando' | 'conectado' | 'reconectando' | 'desconectado';

export interface Transport {
  connect(): void;
  send(type: string, msg: unknown): void;
  close(): void;
  /** entrega o que já chegou (rede simulada); chamado a cada quadro */
  pump?(now: number): void;
  /**
   * Fase 3: sai da sala atual e entra de novo (troca de sala por mapa, 'trocar_sala'). As opções do
   * joinOrCreate vêm de novo de joinOptions(), que já leva o mapId novo. Só o Colyseus precisa.
   */
  rejoin?(): void;
  /** mensagem do servidor */
  onMessage: (type: string, msg: unknown) => void;
  onStatus: (s: NetStatus, info?: string) => void;
  /** sessão aberta: `fresh` = sessão nova (mandar hello); false = a mesma sessão voltou */
  onOpen: (fresh: boolean) => void;
}

const noop = () => {};

/** Mensagens que podem se perder na rede simulada (o resto passa sempre, ver lagSim.ts). */
export const DROPPABLE: ReadonlySet<string> = new Set([MSG.input, MSG.snap, MSG.ping, MSG.pong]);

/** Embrulha um transporte com atraso, variação e perda nos dois sentidos. */
export class LaggedTransport implements Transport {
  onMessage: Transport['onMessage'] = noop;
  onStatus: Transport['onStatus'] = noop;
  onOpen: Transport['onOpen'] = noop;
  readonly up: LagChannel<[string, unknown]>;
  readonly down: LagChannel<[string, unknown]>;
  private buf: [string, unknown][] = [];

  constructor(
    readonly inner: Transport,
    opts: LagOptions,
    private readonly clock: () => number = () => performance.now(),
    rand: () => number = Math.random,
  ) {
    const o = oneWay(opts);
    this.up = new LagChannel(o.delayMs, o.jitterMs, o.loss, rand);
    this.down = new LagChannel(o.delayMs, o.jitterMs, o.loss, rand);
    inner.onMessage = (type, msg) => {
      this.down.push([type, msg], this.clock(), DROPPABLE.has(type));
    };
    inner.onStatus = (s, info) => this.onStatus(s, info);
    inner.onOpen = (fresh) => {
      this.up.clear();
      this.down.clear();
      this.onOpen(fresh);
    };
  }

  static wrapIfNeeded(t: Transport, opts: LagOptions): Transport {
    return lagActive(opts) ? new LaggedTransport(t, opts) : t;
  }

  connect(): void {
    this.inner.connect();
  }

  send(type: string, msg: unknown): void {
    this.up.push([type, msg], this.clock(), DROPPABLE.has(type));
  }

  close(): void {
    this.inner.close();
  }

  rejoin(): void {
    this.up.clear();
    this.down.clear();
    this.inner.rejoin?.();
  }

  pump(now = this.clock()): void {
    this.buf.length = 0;
    this.up.drain(now, this.buf);
    for (const [t, m] of this.buf) this.inner.send(t, m);
    this.buf.length = 0;
    this.down.drain(now, this.buf);
    for (const [t, m] of this.buf) this.onMessage(t, m);
    this.inner.pump?.(now);
  }
}
