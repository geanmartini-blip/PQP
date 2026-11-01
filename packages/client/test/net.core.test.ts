/**
 * O GameClient de verdade (previsão, reconciliação, fila de comandos) ligado ao GameServerCore de
 * verdade (server/src/core.ts), com 200 ms de RTT, variação e 2% de perda nos dois sentidos. O teste
 * do LocalServer (net.prediction.test.ts) não prova nada sobre o servidor autoritativo: este prova.
 *
 * O núcleo entra por import() dinâmico com caminho em variável: o tsc do cliente não confere o código
 * do servidor (que usa módulos do Node), só o Vitest carrega.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { MSG, type C2S_Hello, type C2S_Input, type C2S_Need, type S2C_Snapshot } from '@pqp/shared/net';
import { TICK_MS } from '@pqp/shared/sim';
import { GameClient } from '../src/game/GameClient';
import { mulberry32 } from '../src/net/lagSim';
import { LaggedTransport, type Transport } from '../src/net/transport';

interface CoreLike {
  addClient(sid: string, hello: C2S_Hello): { you: number; mapId: string; tick: number; tickRate: number; protocol: number; token?: string };
  onInput(sid: string, msg: C2S_Input): void;
  onNeed(sid: string, msg: C2S_Need): unknown;
  pong(t: unknown): unknown;
  tick(): Map<string, S2C_Snapshot>;
  entityOf(sid: string): { x: number; y: number } | undefined;
  dropClient(sid: string): void;
  resumeClient(sid: string): void;
}

let CoreCtor: new (opts: Record<string, unknown>) => CoreLike;

beforeAll(async () => {
  const path = '../../server/src/core';
  const mod = (await import(/* @vite-ignore */ path)) as { GameServerCore: typeof CoreCtor };
  CoreCtor = mod.GameServerCore;
});

/** Transporte em memória até o núcleo: ticks a 20 Hz pelo relógio do teste. */
class CoreTransport implements Transport {
  onMessage: Transport['onMessage'] = () => {};
  onStatus: Transport['onStatus'] = () => {};
  onOpen: Transport['onOpen'] = () => {};
  private last: number | undefined;
  private acc = 0;
  open = false;

  constructor(
    readonly core: CoreLike,
    readonly sid: string,
  ) {}

  connect(): void {
    this.open = true;
    this.onStatus('conectado');
    this.onOpen(true);
  }

  send(type: string, msg: unknown): void {
    if (!this.open) return;
    switch (type) {
      case MSG.hello:
        this.onMessage(MSG.welcome, this.core.addClient(this.sid, msg as C2S_Hello));
        break;
      case MSG.input:
        this.core.onInput(this.sid, msg as C2S_Input);
        break;
      case MSG.ping:
        this.onMessage(MSG.pong, this.core.pong((msg as { t?: unknown }).t));
        break;
      case MSG.need:
        this.onMessage(MSG.info, this.core.onNeed(this.sid, msg as C2S_Need));
        break;
    }
  }

  pump(now: number): void {
    if (this.last === undefined) this.last = now;
    this.acc += Math.max(0, now - this.last);
    this.last = now;
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      const snaps = this.core.tick();
      const s = snaps.get(this.sid);
      if (s && this.open) this.onMessage(MSG.snap, s);
    }
  }

  close(): void {
    this.open = false;
  }
}

function session(opts: { lag: number; loss: number; jitter: number; seed: number }) {
  const core = new CoreCtor({ content: false, log: () => {} });
  const inner = new CoreTransport(core, 'sessao_1');
  let now = 0;
  const lagged = new LaggedTransport(inner, { lagMs: opts.lag, jitterMs: opts.jitter, loss: opts.loss }, () => now, mulberry32(opts.seed));
  const store = new Map<string, string>([['pqp_token', 'token_de_teste_core_1']]);
  const gc = new GameClient(lagged, { name: 'Teste', storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) } });
  gc.connect();
  const frame = 1000 / 60;
  const errors: number[] = [];
  const run = (ms: number, intent: { x: number; y: number }) => {
    gc.intent.x = intent.x;
    gc.intent.y = intent.y;
    const end = now + ms;
    while (now < end) {
      now += frame;
      gc.update(frame, now);
      if (gc.pred?.initialized && gc.pred.stats.reconciles > 0) errors.push(gc.pred.stats.lastError);
    }
  };
  return { gc, core, inner, run, errors };
}

describe('GameClient + GameServerCore com rede ruim', () => {
  it('200 ms de RTT, variação e 2% de perda: a previsão bate com o servidor autoritativo', () => {
    const { gc, core, run, errors } = session({ lag: 200, loss: 0.02, jitter: 20, seed: 11 });
    run(1200, { x: 0, y: 0 });
    expect(gc.welcomed).toBe(true);
    expect(gc.pred?.initialized).toBe(true);
    const start = { ...core.entityOf('sessao_1')! };
    errors.length = 0;
    run(1500, { x: 1, y: 0 });
    // andou de verdade no servidor
    expect(Math.hypot(core.entityOf('sessao_1')!.x - start.x, core.entityOf('sessao_1')!.y - start.y)).toBeGreaterThan(2);
    run(1500, { x: 0.7, y: -0.7 });
    run(1200, { x: -1, y: -0.3 });
    run(1000, { x: 0, y: 1 });
    run(1500, { x: 0, y: 0 });
    const pred = gc.pred!;
    const me = core.entityOf('sessao_1')!;
    // parado: a previsão converge para o servidor
    expect(Math.hypot(pred.x - me.x, pred.y - me.y)).toBeLessThan(0.02);
    expect(errors.length).toBeGreaterThan(300);
    const sorted = errors.slice().sort((a, b) => a - b);
    const p99 = sorted[Math.floor(sorted.length * 0.99)]!;
    expect(p99).toBeLessThan(0.1);
    expect(pred.stats.teleports).toBe(0);
    expect(gc.cmds.size).toBe(0);
  });

  it('comando com atraso chega uma vez (troca de alvo/auto) e o ack anda', () => {
    const { gc, run } = session({ lag: 200, loss: 0.02, jitter: 20, seed: 3 });
    run(1200, { x: 0, y: 0 });
    gc.setAuto(true);
    run(1500, { x: 0, y: 0 });
    expect(gc.world.hud?.auto).toBe(true);
    expect(gc.cmds.size).toBe(0);
    gc.setAuto(false);
    run(1500, { x: 0, y: 0 });
    expect(gc.world.hud?.auto).toBe(false);
  });

  it('queda: o cliente não anda de mentira; na volta segue o servidor sem teletransporte longo', () => {
    const { gc, core, inner, run } = session({ lag: 200, loss: 0, jitter: 0, seed: 4 });
    run(1200, { x: 0, y: 0 });
    const x0 = gc.pred!.x;
    // o servidor viu a queda (personagem no automático) e o transporte avisou
    core.dropClient('sessao_1');
    inner.open = false;
    inner.onStatus('reconectando', 'teste');
    run(1500, { x: 1, y: 0 });
    expect(gc.pred!.x).toBe(x0);
    // volta a mesma sessão
    core.resumeClient('sessao_1');
    inner.open = true;
    inner.onStatus('conectado');
    inner.onOpen(false);
    run(1500, { x: 0, y: 0 });
    const me = core.entityOf('sessao_1')!;
    expect(Math.hypot(gc.pred!.x - me.x, gc.pred!.y - me.y)).toBeLessThan(0.05);
  });
});
