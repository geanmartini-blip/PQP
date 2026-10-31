/** Simulador de atraso e perda e fila de comandos com ack. */
import { describe, expect, it } from 'vitest';
import { MSG } from '@pqp/shared/net';
import { CommandQueue, MAX_PENDING_COMMANDS } from '../src/net/commandQueue';
import { LagChannel, lagActive, mulberry32, oneWay } from '../src/net/lagSim';
import { LaggedTransport, type Transport } from '../src/net/transport';

describe('LagChannel', () => {
  it('atrasa cada mensagem pela metade do lag', () => {
    const o = oneWay({ lagMs: 200, jitterMs: 0, loss: 0 });
    expect(o.delayMs).toBe(100);
    const ch = new LagChannel<number>(o.delayMs, o.jitterMs, o.loss, mulberry32(1));
    ch.push(1, 0);
    ch.push(2, 10);
    expect(ch.drain(99)).toEqual([]);
    expect(ch.drain(100)).toEqual([1]);
    expect(ch.drain(109)).toEqual([]);
    expect(ch.drain(110)).toEqual([2]);
    expect(ch.size).toBe(0);
  });

  it('com variação, o atraso fica na faixa e a ordem é mantida', () => {
    const o = oneWay({ lagMs: 200, jitterMs: 40, loss: 0 });
    const ch = new LagChannel<number>(o.delayMs, o.jitterMs, 0, mulberry32(7));
    const sentAt: number[] = [];
    for (let i = 0; i < 500; i++) {
      sentAt.push(i * 5);
      ch.push(i, i * 5);
    }
    const got: { v: number; at: number }[] = [];
    for (let t = 0; t <= 4000; t++) for (const v of ch.drain(t)) got.push({ v, at: t });
    expect(got.map((g) => g.v)).toEqual(Array.from({ length: 500 }, (_, i) => i));
    for (const g of got) {
      const d = g.at - sentAt[g.v]!;
      // 100 ± 10 ms (jitter de 40 no RTT = ±10 em cada sentido), mais a espera de quem saiu antes
      expect(d).toBeGreaterThanOrEqual(90);
      expect(d).toBeLessThanOrEqual(121);
    }
  });

  it('perde perto da taxa pedida, e só o que pode ser perdido', () => {
    const ch = new LagChannel<number>(0, 0, 0.02, mulberry32(3));
    let lost = 0;
    for (let i = 0; i < 20000; i++) if (!ch.push(i, 0)) lost++;
    expect(lost / 20000).toBeGreaterThan(0.015);
    expect(lost / 20000).toBeLessThan(0.025);
    const solid = new LagChannel<number>(0, 0, 0.9, mulberry32(3));
    for (let i = 0; i < 100; i++) expect(solid.push(i, 0, false)).toBe(true);
    expect(solid.drain(0).length).toBe(100);
  });

  it('lagActive', () => {
    expect(lagActive({ lagMs: 0, jitterMs: 0, loss: 0 })).toBe(false);
    expect(lagActive({ lagMs: 200, jitterMs: 0, loss: 0 })).toBe(true);
    expect(lagActive({ lagMs: 0, jitterMs: 0, loss: 0.02 })).toBe(true);
  });
});

describe('LaggedTransport', () => {
  it('atrasa ida e volta e não perde hello nem welcome', () => {
    const sent: [string, unknown][] = [];
    const inner: Transport = {
      connect() {},
      close() {},
      send(t, m) {
        sent.push([t, m]);
      },
      onMessage: () => {},
      onStatus: () => {},
      onOpen: () => {},
    };
    let now = 0;
    const lt = new LaggedTransport(inner, { lagMs: 200, jitterMs: 0, loss: 0.999 }, () => now, mulberry32(5));
    const got: string[] = [];
    lt.onMessage = (t) => got.push(t);
    lt.send(MSG.hello, {});
    lt.send(MSG.input, {});
    inner.onMessage(MSG.welcome, {});
    inner.onMessage(MSG.snap, {});
    now = 99;
    lt.pump(now);
    expect(sent).toEqual([]);
    now = 100;
    lt.pump(now);
    expect(sent.map((s) => s[0])).toEqual([MSG.hello]);
    expect(got).toEqual([MSG.welcome]);
  });
});

describe('CommandQueue', () => {
  it('dá ids crescentes e reenvia até o ack', () => {
    const q = new CommandQueue();
    const a = q.push({ c: 'auto', on: true });
    const b = q.push({ c: 'item' });
    const c = q.push({ c: 'alvo', x: 1, y: 2 });
    expect([a.id, b.id, c.id]).toEqual([1, 2, 3]);
    expect(q.list().map((x) => x.id)).toEqual([1, 2, 3]);
    expect(q.ack(0)).toBe(0);
    expect(q.ack(2)).toBe(2);
    expect(q.list().map((x) => x.id)).toEqual([3]);
    // ack velho (snapshot fora de ordem) não faz nada
    expect(q.ack(1)).toBe(0);
    expect(q.list().length).toBe(1);
    expect(q.ack(3)).toBe(1);
    expect(q.size).toBe(0);
  });

  it('não volta os ids numa sessão nova e tem teto', () => {
    const q = new CommandQueue();
    q.push({ c: 'item' });
    q.clear();
    expect(q.push({ c: 'item' }).id).toBe(2);
    for (let i = 0; i < MAX_PENDING_COMMANDS + 10; i++) q.push({ c: 'item' });
    expect(q.size).toBe(MAX_PENDING_COMMANDS);
    // os que ficaram são os mais novos
    expect(q.list()[q.size - 1]!.id).toBe(q.peekNextId() - 1);
  });
});
