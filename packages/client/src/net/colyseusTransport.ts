/**
 * Transporte pelo Colyseus (@colyseus/sdk 0.18): entra na sala 'mundo' e repassa as mensagens.
 *
 * Reconexão:
 * - queda curta: a reconexão automática do SDK devolve a mesma sessão (onDrop → onReconnect), e o
 *   servidor deixa o personagem no modo automático enquanto isso;
 * - sessão perdida (onLeave sem ser pedido): entra de novo na sala com o mesmo token, com espera
 *   crescente (0,5 s a 5 s), e manda hello outra vez;
 * - derrubado porque o mesmo token entrou em outro aparelho (CLOSE_CODE.outroAparelho): não volta.
 */
import { Client, type Room } from '@colyseus/sdk';
import { CLOSE_CODE } from '@pqp/shared/net';
import type { NetStatus, Transport } from './transport';

// SUGESTÃO: nome da sala do mapa aberto e espera entre tentativas de reconexão.
export const ROOM_NAME = 'mundo';
const RETRY_MIN_MS = 500;
const RETRY_MAX_MS = 5000;

const noop = () => {};

export class ColyseusTransport implements Transport {
  onMessage: Transport['onMessage'] = noop;
  onStatus: Transport['onStatus'] = noop;
  onOpen: Transport['onOpen'] = noop;
  private client: Client;
  private room: Room | undefined;
  private closed = false;
  private retries = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private joining = false;

  constructor(
    readonly endpoint: string,
    private readonly joinOptions: () => Record<string, unknown>,
  ) {
    this.client = new Client(endpoint);
  }

  connect(): void {
    this.closed = false;
    void this.join();
  }

  private status(s: NetStatus, info?: string): void {
    this.onStatus(s, info);
  }

  private async join(): Promise<void> {
    if (this.closed || this.joining) return;
    this.joining = true;
    this.status(this.retries === 0 ? 'conectando' : 'reconectando');
    try {
      const room = await this.client.joinOrCreate(ROOM_NAME, this.joinOptions());
      this.joining = false;
      if (this.closed) {
        void room.leave(true);
        return;
      }
      this.room = room;
      this.retries = 0;
      // entradas antigas não servem depois da queda: guarda pouco
      room.reconnection.maxEnqueuedMessages = 2;
      room.reconnection.minUptime = 1000;
      room.onMessage('*', (type: string | number, payload: unknown) => this.onMessage(String(type), payload));
      room.onDrop(() => this.status('reconectando', 'conexão caiu'));
      room.onReconnect(() => {
        this.status('conectado');
        this.onOpen(false);
      });
      room.onLeave((code: number) => {
        if (this.room !== room) return;
        this.room = undefined;
        if (this.closed) {
          this.status('desconectado');
          return;
        }
        // o mesmo personagem entrou por outro aparelho (ou aba): voltar sozinho derrubaria o outro,
        // e os dois ficariam se derrubando. Para aqui; recarregar a página entra de novo.
        if (code === CLOSE_CODE.outroAparelho) {
          this.closed = true;
          this.status('desconectado', 'Você entrou em outro aparelho. Recarregue para jogar aqui.');
          return;
        }
        this.status('reconectando', `saiu da sala (${code})`);
        this.scheduleRetry();
      });
      room.onError((code: number, message?: string) => this.status('reconectando', `erro ${code}${message ? ': ' + message : ''}`));
      this.status('conectado');
      this.onOpen(true);
    } catch (err) {
      this.joining = false;
      this.status('reconectando', err instanceof Error ? err.message : String(err));
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    if (this.closed || this.timer !== undefined) return;
    const delay = Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** Math.min(this.retries, 6));
    this.retries++;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.join();
    }, delay);
  }

  /** Quantas tentativas seguidas falharam (a tela de conexão oferece o modo offline). */
  get failures(): number {
    return this.retries;
  }

  send(type: string, msg: unknown): void {
    const r = this.room;
    if (!r) return;
    try {
      r.send(type, msg);
    } catch {
      // conexão fechando: a mensagem se perde, as entradas são repetidas na próxima
    }
  }

  close(): void {
    this.closed = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    const r = this.room;
    this.room = undefined;
    if (r) void r.leave(true);
    this.status('desconectado');
  }
}
