/**
 * Previsão e reconciliação: unidade (Predictor) e integração (GameClient + servidor local com
 * 200 ms de RTT, variação e 2% de perda nos dois sentidos).
 */
import { describe, expect, it } from 'vitest';
import { makeMap, setTile, Tile, type TileMap } from '@pqp/shared/map';
import { stepMovement, moveVelocity, TICK_MS } from '@pqp/shared/sim';
import { GameClient, unstick } from '../src/game/GameClient';
import { mulberry32 } from '../src/net/lagSim';
import { LocalTransport } from '../src/net/localTransport';
import { makeInput, Predictor, TELEPORT_ERROR_TILES } from '../src/net/prediction';
import { LaggedTransport } from '../src/net/transport';

function arena(w = 40, h = 40): TileMap {
  const m = makeMap('teste_arena', w, h, Tile.Grama);
  for (let x = 0; x < w; x++) {
    setTile(m, x, 0, Tile.Parede);
    setTile(m, x, h - 1, Tile.Parede);
  }
  for (let y = 0; y < h; y++) {
    setTile(m, 0, y, Tile.Parede);
    setTile(m, w - 1, y, Tile.Parede);
  }
  // um muro no meio para escorregar e para o A* contornar
  for (let y = 5; y < 30; y++) setTile(m, 20, y, Tile.Parede);
  for (let x = 25; x < 30; x++) setTile(m, x, 12, Tile.Lama);
  m.markers.push({ id: 'spawn', kind: 'spawn_jogador', x: 10.5, y: 10.5 });
  return m;
}

describe('Predictor', () => {
  it('sem atraso, a reconciliação com o servidor não acha erro', () => {
    const map = arena();
    const p = new Predictor(map);
    p.reconcile(10.5, 10.5, 0, 5, true);
    // "servidor" de mentira: mesma função, uma entrada por tick
    let sx = 10.5, sy = 10.5;
    for (let seq = 1; seq <= 40; seq++) {
      const inp = makeInput(seq, 1, seq > 20 ? -0.6 : 0.3);
      p.step(inp);
      const v = moveVelocity({ x: inp.mx / 127, y: inp.my / 127 }, 5);
      ({ x: sx, y: sy } = stepMovement(map, { x: sx, y: sy, radius: p.radius }, v.vx, v.vy, TICK_MS));
      const r = p.reconcile(sx, sy, seq, 5, true);
      expect(r.error).toBeLessThan(1e-9);
    }
    expect(p.pendingInputs).toBe(0);
  });

  it('com ack atrasado, reaplica o que falta e chega no mesmo lugar', () => {
    const map = arena();
    const p = new Predictor(map);
    p.reconcile(10.5, 10.5, 0, 5, true);
    const server: { x: number; y: number }[] = [{ x: 10.5, y: 10.5 }];
    for (let seq = 1; seq <= 30; seq++) {
      const inp = makeInput(seq, 1, 0.5);
      p.step(inp);
      const prev = server[seq - 1]!;
      const v = moveVelocity({ x: inp.mx / 127, y: inp.my / 127 }, 5);
      server.push(stepMovement(map, { x: prev.x, y: prev.y, radius: p.radius }, v.vx, v.vy, TICK_MS));
    }
    // o snapshot que chega agora é de 4 entradas atrás
    const s = server[26]!;
    const r = p.reconcile(s.x, s.y, 26, 5, true);
    expect(r.error).toBeLessThan(1e-9);
    expect(p.pendingInputs).toBe(4);
    expect(p.x).toBeCloseTo(server[30]!.x, 9);
  });

  it('corrige erro pequeno aos poucos (~100 ms) e teletransporta erro grande', () => {
    const map = arena();
    const p = new Predictor(map);
    p.reconcile(10.5, 10.5, 0, 5, true);
    p.step(makeInput(1, 0, 0));
    p.reconcile(11, 10.5, 1, 5, true);
    const o = { x: 0, y: 0 };
    p.render(1, o);
    // o desenho não pulou
    expect(o.x).toBeCloseTo(10.5, 6);
    for (let t = 0; t < 100; t += 16) p.decay(16);
    p.render(1, o);
    expect(Math.abs(o.x - 11)).toBeLessThan(0.05);
    // erro grande
    p.step(makeInput(2, 0, 0));
    const r = p.reconcile(11 + TELEPORT_ERROR_TILES + 1, 10.5, 2, 5, true);
    expect(r.teleported).toBe(true);
    p.render(1, o);
    expect(o.x).toBeCloseTo(11 + TELEPORT_ERROR_TILES + 1, 6);
  });

  it('parado pelo servidor (atordoado) não anda na previsão', () => {
    const map = arena();
    const p = new Predictor(map);
    p.reconcile(10.5, 10.5, 0, 0, false);
    p.step(makeInput(1, 1, 0));
    expect(p.x).toBe(10.5);
  });

  it('segue o caminho como o servidor e para no destino', () => {
    const map = arena();
    const p = new Predictor(map);
    p.reconcile(10.5, 10.5, 0, 5, true);
    p.setPath([{ x: 12.5, y: 10.5 }], { x: 12.5, y: 10.5 });
    for (let s = 1; s <= 30; s++) p.step(makeInput(s, 0, 0));
    expect(p.x).toBeCloseTo(12.5, 3);
    expect(p.following).toBe(false);
  });

  it('unstick tira a posição quantizada de dentro da parede', () => {
    const map = arena();
    // encostado no muro x=20 pela esquerda, 0,004 para dentro
    const u = unstick(map, 20 - 0.35 + 0.004, 10.5, 0.35);
    expect(u.x).toBeLessThanOrEqual(20 - 0.35);
  });
});

/** Roda o cliente e o servidor local juntos, com quadros de 16,7 ms. */
function runSession(opts: { lag: number; loss: number; jitter: number; seed: number }) {
  const map = arena();
  const local = new LocalTransport({ map, noEnemies: true });
  let now = 0;
  const lagged = new LaggedTransport(local, { lagMs: opts.lag, jitterMs: opts.jitter, loss: opts.loss }, () => now, mulberry32(opts.seed));
  const store = new Map<string, string>();
  const gc = new GameClient(lagged, {
    name: 'Teste',
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
    resolveMap: (id) => (id === map.id ? map : undefined),
  });
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
      if (gc.pred?.initialized) errors.push(gc.pred.stats.lastError);
    }
  };
  return { gc, local, run, errors, store };
}

describe('GameClient com servidor local e rede ruim', () => {
  it('200 ms de RTT, variação e 2% de perda: previsão bate com o servidor', () => {
    const { gc, local, run, errors } = runSession({ lag: 200, loss: 0.02, jitter: 20, seed: 11 });
    run(1000, { x: 0, y: 0 });
    expect(gc.welcomed).toBe(true);
    expect(gc.pred?.initialized).toBe(true);
    run(1500, { x: 1, y: 0 }); // até o muro e escorrega
    run(1500, { x: 0.7, y: 0.7 });
    run(1200, { x: -1, y: -0.3 });
    run(1500, { x: 0, y: 0 }); // para e espera tudo chegar
    const pred = gc.pred!;
    const server = local.server.player!;
    // parado: a previsão converge para o servidor
    expect(Math.hypot(pred.x - server.x, pred.y - server.y)).toBeLessThan(0.02);
    // durante o movimento, a maioria das correções é mínima (perda de 2 entradas seguidas é rara)
    const big = errors.filter((e) => e > 0.3).length;
    expect(big / errors.length).toBeLessThan(0.02);
    const sorted = errors.slice().sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length * 0.9)]!).toBeLessThan(0.02);
    expect(pred.stats.teleports).toBe(0);
    // comandos e entradas confirmados
    expect(gc.cmds.size).toBe(0);
    expect(gc.rtt.value).toBeGreaterThan(150);
    expect(gc.rtt.value).toBeLessThan(260);
  });

  it('tocar no chão: o caminho contorna o muro, nos dois lados', () => {
    const { gc, local, run } = runSession({ lag: 200, loss: 0.02, jitter: 20, seed: 5 });
    run(800, { x: 0, y: 0 });
    const dest = gc.goTo(24.5, 10.5);
    expect(dest).not.toBeNull();
    run(9000, { x: 0, y: 0 });
    const s = local.server.player!;
    expect(Math.hypot(s.x - 24.5, s.y - 10.5)).toBeLessThan(0.2);
    expect(Math.hypot(gc.pred!.x - s.x, gc.pred!.y - s.y)).toBeLessThan(0.05);
  });

  it('o token fica guardado e o comando de troca de ala chega uma vez', () => {
    const { gc, local, run, store } = runSession({ lag: 120, loss: 0.02, jitter: 10, seed: 2 });
    run(600, { x: 0, y: 0 });
    expect(store.get('pqp_token')).toBe(gc.token);
    expect(local.server.player!.archetypeId).toBe('peao_brabo');
    gc.switchArchetype('idol');
    run(1500, { x: 0, y: 0 });
    expect(local.server.player!.archetypeId).toBe('idol');
    expect(gc.world.hud?.arch).toBe('idol');
    expect(gc.cmds.size).toBe(0);
  });
});
