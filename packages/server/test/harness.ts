/**
 * Banco de testes do servidor: GameServerCore + robôs ligados por canais em memória com atraso e
 * perda semeados, num relógio virtual de 50 ms por tick. Não é um arquivo de teste (sem .test).
 */
import type { C2S_Input, C2S_Need, S2C_Info, S2C_Snapshot } from '@pqp/shared/net';
import type { CombatEvent } from '@pqp/shared/sim';
import { RobotClient } from '../src/bot/robot';
import { GameServerCore, type CoreOptions } from '../src/core';
import { MemoryChannel } from '../src/netsim';

type Up = { k: 'in'; m: C2S_Input } | { k: 'need'; m: C2S_Need };
type Down = { k: 'snap'; m: S2C_Snapshot } | { k: 'info'; m: S2C_Info };

export interface BotOptions {
  token?: string;
  name?: string;
  archetypeId?: string;
  /** RTT da rede (ms); metade em cada sentido */
  rttMs?: number;
  loss?: number;
  jitterMs?: number;
  duplicate?: number;
  seed?: number;
}

export interface Bot {
  sid: string;
  robot: RobotClient;
  up: MemoryChannel<Up>;
  down: MemoryChannel<Down>;
  brain?: (r: RobotClient) => void;
  online: boolean;
}

let sidCounter = 0;

export class Harness {
  readonly core: GameServerCore;
  nowMs = 0;
  bots: Bot[] = [];
  /** todos os eventos da simulação, com o tick */
  serverEvents: { t: number; ev: CombatEvent }[] = [];

  constructor(opts: CoreOptions = {}) {
    this.core = new GameServerCore({ log: () => undefined, ...opts });
  }

  get world() {
    return this.core.world;
  }

  /** Conecta um robô (hello e welcome são confiáveis; entradas e snapshots passam pelo canal ruim). */
  connect(o: BotOptions = {}): Bot {
    const sid = `s${++sidCounter}`;
    const seed = o.seed ?? sidCounter * 101;
    const half = (o.rttMs ?? 200) / 2;
    const chan = { delayMs: half, loss: o.loss ?? 0.02, jitterMs: o.jitterMs ?? 0, duplicate: o.duplicate ?? 0 };
    const robot = new RobotClient(o.token ?? `tok-${sid}-abcdef`, o.name ?? `Robô ${sid}`, o.archetypeId);
    robot.rtt = o.rttMs ?? 200;
    const bot: Bot = {
      sid,
      robot,
      up: new MemoryChannel<Up>({ ...chan, seed }),
      down: new MemoryChannel<Down>({ ...chan, seed: seed + 1 }),
      online: true,
    };
    robot.onWelcome(this.core.addClient(sid, robot.hello()));
    this.bots.push(bot);
    return bot;
  }

  /** Reconecta com o mesmo token numa sessão nova (o robô recomeça como um cliente novo). */
  reconnect(bot: Bot, o: BotOptions = {}): Bot {
    const nb = this.connect({ ...o, token: bot.robot.token, name: bot.robot.name });
    return nb;
  }

  disconnect(bot: Bot): void {
    bot.online = false;
    this.core.removeClient(bot.sid);
  }

  /** n ticks: robôs pensam e mandam, servidor recebe e simula, robôs recebem. */
  tick(n = 1): void {
    for (let i = 0; i < n; i++) this.tickOnce();
  }

  /** Roda até `cond` ou até `maxTicks`. Devolve quantos ticks rodou. */
  runUntil(cond: () => boolean, maxTicks: number): number {
    for (let i = 0; i < maxTicks; i++) {
      if (cond()) return i;
      this.tickOnce();
    }
    return cond() ? maxTicks : -1;
  }

  private tickOnce(): void {
    this.nowMs += 50;
    const t = this.nowMs;
    for (const b of this.bots) {
      if (!b.online || b.robot.you === undefined) continue;
      b.brain?.(b.robot);
      b.up.send({ k: 'in', m: b.robot.makeInput() }, t);
    }
    for (const b of this.bots) {
      if (!b.online) continue;
      for (const msg of b.up.receive(t)) {
        if (msg.k === 'in') this.core.onInput(b.sid, msg.m);
        else {
          const info = this.core.onNeed(b.sid, msg.m);
          if (info.ents.length > 0) b.down.send({ k: 'info', m: info }, t);
        }
      }
    }
    const snaps = this.core.tick();
    for (const ev of this.core.lastEvents) this.serverEvents.push({ t: this.world.tick, ev });
    for (const b of this.bots) {
      if (!b.online) continue;
      const s = snaps.get(b.sid);
      if (s) b.down.send({ k: 'snap', m: s }, t);
      for (const msg of b.down.receive(t)) {
        if (msg.k === 'snap') {
          const need = b.robot.onSnapshot(msg.m);
          // 'need' vai pelo mesmo canal ruim (aqui pode se perder; o robô pede de novo em 10 ticks)
          if (need.length > 0) b.up.send({ k: 'need', m: { ids: need } }, t);
        } else b.robot.onInfo(msg.m);
      }
    }
  }

  /** Eventos da simulação de um tipo. */
  eventsOf<T extends CombatEvent['t']>(t: T): (Extract<CombatEvent, { t: T }> & { tick: number })[] {
    return this.serverEvents.filter((x) => x.ev.t === t).map((x) => ({ ...(x.ev as Extract<CombatEvent, { t: T }>), tick: x.t }));
  }
}
