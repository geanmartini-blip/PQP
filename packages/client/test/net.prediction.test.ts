/**
 * Previsão e reconciliação: unidade (Predictor) e integração (GameClient + servidor local com
 * 200 ms de RTT, variação e 2% de perda nos dois sentidos).
 */
import { describe, expect, it } from 'vitest';
import { makeMap, setTile, Tile, type TileMap } from '@pqp/shared/map';
import { MSG } from '@pqp/shared/net';
import { stepMovement, moveVelocity, TICK_MS } from '@pqp/shared/sim';
import { GameClient, unstick } from '../src/game/GameClient';
import { actionTick } from '../src/net/interpolation';
import { mulberry32 } from '../src/net/lagSim';
import { LocalServer } from '../src/net/localServer';
import { LocalTransport } from '../src/net/localTransport';
import { makeInput, Predictor, TELEPORT_ERROR_TILES } from '../src/net/prediction';
import { LaggedTransport } from '../src/net/transport';

function arena(w = 40, h = 40, trainer = false): TileMap {
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
  // a troca de ala só vale perto do treinador da ala (shared/sim TRAINER_SWITCH_RADIUS)
  if (trainer) m.markers.push({ id: 'npc_li_wei', kind: 'npc', ref: 'li_wei', x: 8.5, y: 13.5 });
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
function runSession(opts: { lag: number; loss: number; jitter: number; seed: number; trainer?: boolean }) {
  const map = arena(40, 40, opts.trainer === true);
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
    const { gc, local, run, store } = runSession({ lag: 120, loss: 0.02, jitter: 10, seed: 2, trainer: true });
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

/** Cliente ligado direto no servidor local (sem atraso), para mexer no status do transporte. */
function directSession() {
  const map = arena();
  const local = new LocalTransport({ map, noEnemies: true });
  const gc = new GameClient(local, { name: 'Teste', resolveMap: (id) => (id === map.id ? map : undefined) });
  gc.connect();
  let now = 0;
  const frame = 1000 / 60;
  const drawn: { x: number; y: number; snap: boolean }[] = [];
  const run = (ms: number, intent = { x: 0, y: 0 }) => {
    gc.intent.x = intent.x;
    gc.intent.y = intent.y;
    const end = now + ms;
    while (now < end) {
      now += frame;
      gc.update(frame, now);
      const o = { x: 0, y: 0 };
      if (gc.selfRender(o)) drawn.push({ x: o.x, y: o.y, snap: gc.serverDriven });
    }
  };
  return { gc, local, run, drawn };
}

describe('queda de conexão', () => {
  it('reconectando: o boneco não anda de mentira e nada sai; na volta a previsão recomeça', () => {
    const { gc, local, run } = directSession();
    run(500);
    expect(gc.pred?.initialized).toBe(true);
    const x0 = gc.pred!.x;
    const sent = gc.stats.inputsSent;
    local.onStatus('reconectando', 'teste');
    expect(gc.live).toBe(false);
    run(1000, { x: 1, y: 0 });
    expect(gc.pred!.x).toBe(x0);
    expect(gc.stats.inputsSent).toBe(sent);
    local.onStatus('conectado');
    local.onOpen(false);
    expect(gc.resumes).toBe(1);
    expect(gc.pred!.pendingInputs).toBe(0);
    run(500, { x: 1, y: 0 });
    expect(gc.pred!.x).toBeGreaterThan(x0 + 0.5);
    expect(gc.stats.inputsSent).toBeGreaterThan(sent);
  });
});

describe('boneco movido só pelo servidor', () => {
  it('ir_ate sem previsão: desenha pelos snapshots, sem andar em pulsos de 20 Hz', () => {
    const { gc, run, drawn } = directSession();
    run(500);
    // o servidor anda sozinho (como no avanço até o alcance ou no automático): o cliente não sabe o caminho
    gc.command({ c: 'ir_ate', x: 18.5, y: 10.5 });
    drawn.length = 0;
    run(1200);
    const snapFrames = drawn.filter((d) => d.snap).length;
    expect(snapFrames).toBeGreaterThan(30);
    // passos por quadro no meio do trajeto (fora a aceleração e a chegada)
    const mid = drawn.slice(15, 55);
    const steps = mid.slice(1).map((d, i) => Math.hypot(d.x - mid[i]!.x, d.y - mid[i]!.y));
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
    expect(mean).toBeGreaterThan(0.03);
    // em pulsos, o passo logo depois do snapshot é bem maior que a média e o do fim, bem menor;
    // interpolado, fica perto da média
    // (medido: antes da correção 1,71 e 0,52; com o buffer, ~1,1 e ~0,94)
    expect(Math.max(...steps)).toBeLessThan(mean * 1.3);
    expect(Math.min(...steps)).toBeGreaterThan(mean * 0.75);
    run(1500);
    const last = drawn[drawn.length - 1]!;
    expect(Math.hypot(last.x - 18.5, last.y - 10.5)).toBeLessThan(0.2);
    // parou: volta para a previsão sem salto
    expect(gc.serverDriven).toBe(false);
    expect(Math.hypot(last.x - gc.pred!.x, last.y - gc.pred!.y)).toBeLessThan(0.05);
  });

  it('a troca para a previsão (joystick) não pula', () => {
    const { gc, run, drawn } = directSession();
    run(500);
    gc.command({ c: 'ir_ate', x: 18.5, y: 10.5 });
    run(600);
    const before = drawn[drawn.length - 1]!;
    expect(before.snap).toBe(true);
    run(1000 / 60, { x: 0, y: 1 });
    const after = drawn[drawn.length - 1]!;
    expect(after.snap).toBe(false);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(0.15);
  });
});

describe('LocalServer segue as regras de entrada e comando do núcleo', () => {
  const hello = (s: LocalServer) => {
    s.receive(MSG.hello, { token: 'teste_token_123' });
    s.take();
  };
  it('entradas fora de ordem e repetidas: cada seq anda uma vez, em ordem', () => {
    const s = new LocalServer({ map: arena(), noEnemies: true });
    hello(s);
    const inp = (seq: number) => ({ seq, mx: 127, my: 0 });
    const acks: number[] = [];
    const tick = () => {
      s.tick();
      const snap = s.take().find(([t]) => t === 'snap')![1] as { ack: number };
      acks.push(snap.ack);
    };
    s.receive(MSG.input, { inputs: [inp(2), inp(1)], cmds: [], ackTick: 0, rtt: 0 });
    s.receive(MSG.input, { inputs: [inp(1), inp(2)], cmds: [], ackTick: 0, rtt: 0 });
    tick();
    tick();
    // a repetida (2) não anda de novo
    s.receive(MSG.input, { inputs: [inp(2), inp(3)], cmds: [], ackTick: 0, rtt: 0 });
    tick();
    tick();
    expect(acks).toEqual([1, 2, 3, 3]);
  });

  it('fila longa é drenada: até 2 entradas extras por tick', () => {
    const s = new LocalServer({ map: arena(), noEnemies: true });
    hello(s);
    s.receive(MSG.input, { inputs: Array.from({ length: 6 }, (_, i) => ({ seq: i + 1, mx: 0, my: 0 })), cmds: [], ackTick: 0, rtt: 0 });
    s.tick();
    const snap = s.take().find(([t]) => t === 'snap')![1] as { ack: number };
    expect(snap.ack).toBe(3);
  });

  it('comando é aplicado no tick (não na chegada) e cada id uma vez só', () => {
    const s = new LocalServer({ map: arena(), noEnemies: true });
    hello(s);
    s.receive(MSG.input, { inputs: [], cmds: [{ id: 1, c: 'auto', on: true }], ackTick: 0, rtt: 0 });
    expect(s.player!.auto === true).toBe(false);
    s.tick();
    expect(s.player!.auto).toBe(true);
    // o cliente repete o comando até o ack: não aplica de novo (nem com outro conteúdo)
    s.receive(MSG.input, { inputs: [], cmds: [{ id: 1, c: 'auto', on: false }], ackTick: 0, rtt: 0 });
    s.tick();
    expect(s.player!.auto).toBe(true);
    // comando fora de ordem (id menor que o maior visto, mas novo) ainda vale
    s.receive(MSG.input, { inputs: [], cmds: [{ id: 3, c: 'auto', on: false }], ackTick: 0, rtt: 0 });
    s.receive(MSG.input, { inputs: [], cmds: [{ id: 2, c: 'auto', on: true }], ackTick: 0, rtt: 0 });
    s.tick();
    // aplicados em ordem de chegada no tick: 3 (desliga) e depois 2 (liga)
    expect(s.player!.auto).toBe(true);
  });
});

describe('actionTick', () => {
  it('avisos no chão no tempo em que a entrada de agora anda: RTT + fila à frente do último snapshot', () => {
    // último snapshot do tick 100 (5000 ms), RTT de 200 ms, 1 tick de fila
    expect(actionTick(5000, 200)).toBeCloseTo(100 + 4 + 1, 9);
    expect(actionTick(5000, 0, 0)).toBe(100);
    expect(actionTick(5000, -50, 0)).toBe(100);
  });
});
