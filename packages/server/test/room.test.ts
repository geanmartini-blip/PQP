/**
 * WorldRoom de verdade: sobe express + Colyseus numa porta aleatória e conecta com @colyseus/sdk
 * no Node (WebSocket nativo do Node 24). Confere hello, welcome, snap, HUD, ping e /health.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { CLOSE_CODE, MSG, type S2C_Pong, type S2C_Snapshot, type S2C_Welcome } from '@pqp/shared/net';
import { startServer, type Running } from '../src/app';
import { RobotClient } from '../src/bot/robot';
import { MemoryStore } from '../src/persistence/store';

let srv: Running;
const store = new MemoryStore();

beforeAll(async () => {
  srv = await startServer({
    port: 0,
    host: '127.0.0.1',
    store,
    serveClient: false,
    log: () => undefined,
    // sem rede simulada aqui, mesmo que o ambiente tenha PQP_LAG_MS (o atraso é testado no core.test)
    room: { link: { lagMs: 0, loss: 0, jitterMs: 0 } },
  });
});

afterAll(async () => {
  await srv?.close();
});

const waitFor = async (cond: () => boolean, ms = 5000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('tempo esgotado esperando a condição');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe('WorldRoom (Colyseus 0.18)', () => {
  it('GET /health responde', async () => {
    const res = await fetch(`http://127.0.0.1:${srv.port}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; store: string };
    expect(body.ok).toBe(true);
    expect(body.store).toBe('memoria');
  });

  it("hello → welcome → snap com HUD; o joystick move o personagem; ping → pong", async () => {
    const client = new Client(`http://127.0.0.1:${srv.port}`);
    const room: Room = await client.joinOrCreate('mundo');
    const robot = new RobotClient('tok-sala-real-01', 'Robô de Verdade');
    let welcome: S2C_Welcome | undefined;
    let pong: S2C_Pong | undefined;
    const snaps: S2C_Snapshot[] = [];
    room.onMessage(MSG.welcome, (w: S2C_Welcome) => {
      welcome = w;
      robot.onWelcome(w);
    });
    room.onMessage(MSG.snap, (s: S2C_Snapshot) => {
      snaps.push(s);
      robot.onSnapshot(s);
    });
    room.onMessage(MSG.pong, (p: S2C_Pong) => (pong = p));
    room.onMessage(MSG.info, () => undefined);
    room.send(MSG.hello, robot.hello());
    await waitFor(() => welcome !== undefined);
    expect(welcome!.mapId).toBe('prototipo_delta');
    expect(welcome!.tickRate).toBe(20);
    expect(welcome!.protocol).toBe(1);
    expect(welcome!.token).toBeUndefined(); // o token veio do cliente
    await waitFor(() => snaps.length >= 3);
    const s = snaps[snaps.length - 1]!;
    expect(s.hud.hp).toBeGreaterThan(0);
    expect(s.hud.mv).toBeGreaterThan(0);
    expect(s.hud.canMove).toBe(true);
    expect(s.hud.arch).toBe('peao_brabo');
    expect(s.hud.cls).toBe('combatente');
    expect(s.hud.ab.length).toBeGreaterThanOrEqual(4);
    expect(s.ents.some((e) => e.i === welcome!.you)).toBe(true);
    expect(robot.me()?.d).toBe('peao_brabo');
    const x0 = robot.pos(robot.you)!.x;

    // anda para a direita por ~1 s mandando uma entrada a cada 50 ms
    robot.setStick(1, 0);
    const timer = setInterval(() => room.send(MSG.input, robot.makeInput()), 50);
    try {
      await waitFor(() => (robot.pos(robot.you)?.x ?? x0) > x0 + 1.5, 4000);
      expect(robot.lastAck).toBeGreaterThan(5);
    } finally {
      clearInterval(timer);
    }

    room.send(MSG.ping, { t: 123 });
    await waitFor(() => pong !== undefined);
    expect(pong!.t).toBe(123);
    expect(pong!.st).toBeGreaterThan(0);

    // hello sem token: o servidor gera um
    const c2 = new Client(`http://127.0.0.1:${srv.port}`);
    const room2: Room = await c2.joinOrCreate('mundo');
    let w2: S2C_Welcome | undefined;
    room2.onMessage(MSG.welcome, (w: S2C_Welcome) => (w2 = w));
    room2.onMessage(MSG.snap, () => undefined);
    room2.send(MSG.hello, { token: '' });
    await waitFor(() => w2 !== undefined);
    expect(typeof w2!.token).toBe('string');
    expect(w2!.you).not.toBe(welcome!.you);
    await room2.leave(true);
    await room.leave(true);
  });

  it('sair e entrar de novo com o mesmo token retoma o personagem', async () => {
    const join = async () => {
      const c = new Client(`http://127.0.0.1:${srv.port}`);
      const room: Room = await c.joinOrCreate('mundo');
      let w: S2C_Welcome | undefined;
      room.onMessage(MSG.welcome, (x: S2C_Welcome) => (w = x));
      room.onMessage(MSG.snap, () => undefined);
      room.send(MSG.hello, { token: 'tok-sala-volta-01', name: 'Volta' });
      await waitFor(() => w !== undefined);
      return { room, w: w! };
    };
    const a = await join();
    await a.room.leave(true);
    await new Promise((r) => setTimeout(r, 150));
    const b = await join();
    expect(b.w.you).toBe(a.w.you);
    await b.room.leave(true);
  });

  it('o mesmo token em outro aparelho derruba o primeiro com CLOSE_CODE.outroAparelho, sem reconexão', async () => {
    const join = async () => {
      const c = new Client(`http://127.0.0.1:${srv.port}`);
      const room: Room = await c.joinOrCreate('mundo');
      let w: S2C_Welcome | undefined;
      room.onMessage(MSG.welcome, (x: S2C_Welcome) => (w = x));
      room.onMessage(MSG.snap, () => undefined);
      room.send(MSG.hello, { token: 'tok-sala-dois-aparelhos', name: 'Dois' });
      await waitFor(() => w !== undefined);
      return { room, w: w! };
    };
    const a = await join();
    let leftCode: number | undefined;
    let dropped = false;
    a.room.onLeave((code: number) => (leftCode = code));
    a.room.onDrop(() => (dropped = true));
    const b = await join();
    expect(b.w.you).toBe(a.w.you);
    await waitFor(() => leftCode !== undefined);
    expect(leftCode).toBe(CLOSE_CODE.outroAparelho);
    expect(dropped).toBe(false); // o SDK não tenta reconectar
    // o segundo continua recebendo o personagem
    let snaps = 0;
    b.room.onMessage(MSG.snap, () => snaps++);
    await waitFor(() => snaps >= 3);
    await b.room.leave(true);
  });
});
