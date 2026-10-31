/**
 * Fila de comandos com ack (pura). Cada comando ganha um id crescente e é reenviado em toda
 * mensagem de entrada até o snapshot confirmar (S2C_Snapshot.cack >= id). O servidor ignora ids já
 * processados, então reenviar não duplica efeito.
 *
 * Os ids nunca voltam para trás, nem numa reconexão: se o servidor lembrar do cack antigo, os
 * comandos novos continuam valendo.
 */
import type { PlayerCommand } from '@pqp/shared/sim';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type CommandBody = DistributiveOmit<PlayerCommand, 'id'>;

// SUGESTÃO: teto de comandos esperando ack (com 200 ms de ping cabem uns 4 por segundo de toque).
export const MAX_PENDING_COMMANDS = 24;

export class CommandQueue {
  private nextId = 1;
  private pending: PlayerCommand[] = [];
  /** maior id confirmado */
  acked = 0;

  /** Enfileira um comando novo e devolve com id. */
  push(body: CommandBody): PlayerCommand {
    const cmd = { ...body, id: this.nextId++ } as PlayerCommand;
    this.pending.push(cmd);
    // se o servidor sumiu, não acumula para sempre: os mais velhos perdem a vez
    if (this.pending.length > MAX_PENDING_COMMANDS) this.pending.splice(0, this.pending.length - MAX_PENDING_COMMANDS);
    return cmd;
  }

  /** O servidor confirmou até `cack`: tira da fila. Devolve quantos saíram. */
  ack(cack: number): number {
    if (!(cack > this.acked)) return 0;
    this.acked = cack;
    const before = this.pending.length;
    let i = 0;
    while (i < this.pending.length && this.pending[i]!.id <= cack) i++;
    if (i > 0) this.pending.splice(0, i);
    return before - this.pending.length;
  }

  /** Comandos a mandar na próxima mensagem (todos os sem ack). */
  list(): readonly PlayerCommand[] {
    return this.pending;
  }

  get size(): number {
    return this.pending.length;
  }

  /** Esquece o que estava esperando (sessão nova). Mantém a contagem de ids. */
  clear(): void {
    this.pending = [];
    this.acked = 0;
  }

  /** Próximo id (para testes e diagnóstico). */
  peekNextId(): number {
    return this.nextId;
  }
}
