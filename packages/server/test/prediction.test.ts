/**
 * Previsão do cliente contra o GameServerCore com rede de TCP simulada (em ordem; a perda vira
 * travada de ~250 ms seguida de rajada). O "cliente" aqui é um previsor mínimo igual ao do pacote
 * client (prediction.ts): um passo de stepMovement por entrada, e no snapshot volta à posição do
 * servidor no ack e reaplica as entradas sem ack. O erro medido é o puxão que o jogador veria.
 *
 * Regressão dos achados: o servidor andava de novo com a entrada velha quando a fila esvaziava e
 * depois aplicava as atrasadas (movimento contado duas vezes), e a fila nunca drenava.
 */
import { describe, expect, it } from 'vitest';
import { POS_SCALE, quantizeAxis, dequantizeAxis, type C2S_Input, type S2C_Snapshot } from '@pqp/shared/net';
import { moveSpeedOf, moveVelocity, SIM_TUNING, stepMovement, TICK_MS, type DoctrineCard, type PlayerCommand, type PlayerInput, type Vec } from '@pqp/shared/sim';
import { GameServerCore } from '../src/core';
import { MemoryChannel, type LossMode } from '../src/netsim';

/** entrada guardada para reaplicar: joystick e, no auto-caminho, o ponto seguido */
interface Pred extends PlayerInput {
  wp?: Vec;
}

interface RunOpts {
  loss: number;
  lossMode?: LossMode;
  stallMs?: number;
  jitterMs?: number;
  seed: number;
  /** travada forçada: a cada `everyMs`, as duas direções seguram tudo por `forMs` */
  periodic?: { everyMs: number; forMs: number };
}

function session(o: RunOpts) {
  const core = new GameServerCore({ content: false, log: () => undefined });
  const sid = 'p1';
  const wel = core.addClient(sid, { token: 'tok-previsao-0001' });
  const ch = { delayMs: 100, loss: o.loss, jitterMs: o.jitterMs ?? 0, ...(o.lossMode ? { lossMode: o.lossMode } : {}), ...(o.stallMs ? { stallMs: o.stallMs } : {}) };
  const up = new MemoryChannel<C2S_Input>({ ...ch, seed: o.seed });
  const down = new MemoryChannel<S2C_Snapshot>({ ...ch, seed: o.seed + 1 });
  const body = { x: 0, y: 0, radius: SIM_TUNING.PLAYER_RADIUS };
  const st = {
    now: 0,
    seq: 0,
    init: false,
    x: 0,
    y: 0,
    mv: 0,
    canMove: true,
    lastTick: -1,
    hist: [] as Pred[],
    last3: [] as PlayerInput[],
    pending: [] as PlayerCommand[],
    afterSeqOf: new Map<number, number>(),
    nextCmd: 1,
    errs: [] as number[],
    qlens: [] as number[],
    snaps: [] as S2C_Snapshot[],
    /** auto-caminho previsto (como o Predictor.setPath do cliente) */
    path: null as Vec[] | null,
    moveTo: null as Vec | null,
  };
  /** igual a towardVelocity do cliente (e velocityToward do núcleo) */
  const toward = (x: number, y: number, tx: number, ty: number) => {
    const dx = tx - x, dy = ty - y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6 || st.mv <= 0) return { vx: 0, vy: 0, dist: d };
    const maxStep = (st.mv * TICK_MS) / 1000;
    const s = d < maxStep ? (d / maxStep) * st.mv : st.mv;
    return { vx: (dx / d) * s, vy: (dy / d) * s, dist: d };
  };
  const replay = (inp: Pred, x: number, y: number) => {
    if (!st.canMove) return { x, y };
    let { vx, vy } = moveVelocity({ x: dequantizeAxis(inp.mx), y: dequantizeAxis(inp.my) }, st.mv);
    if (vx === 0 && vy === 0 && inp.wp) ({ vx, vy } = toward(x, y, inp.wp.x, inp.wp.y));
    if (vx === 0 && vy === 0) return { x, y };
    body.x = x;
    body.y = y;
    return stepMovement(core.world.map, body, vx, vy, TICK_MS);
  };
  /** ponto do caminho seguido neste passo (sem joystick), como no Predictor.step do cliente */
  const pathWaypoint = (): Vec | undefined => {
    if (st.path) {
      while (st.path.length > 0 && Math.hypot(st.x - st.path[0]!.x, st.y - st.path[0]!.y) < 0.15) st.path.shift();
      const wp = st.path[0] ?? st.moveTo ?? undefined;
      if (st.path.length === 0) st.path = null;
      return wp ? { x: wp.x, y: wp.y } : undefined;
    }
    if (st.moveTo) {
      if (toward(st.x, st.y, st.moveTo.x, st.moveTo.y).dist < 0.1) {
        st.moveTo = null;
        return undefined;
      }
      return { x: st.moveTo.x, y: st.moveTo.y };
    }
    return undefined;
  };
  const held: { at: number; m: C2S_Input }[] = [];
  const heldDown: { at: number; m: S2C_Snapshot }[] = [];
  const stalledAt = (t: number) => !!o.periodic && t % o.periodic.everyMs < o.periodic.forMs;
  /** um tick de 50 ms: cliente prevê e manda, servidor recebe e simula, cliente reconcilia */
  const tick = (ix: number, iy: number) => {
    st.now += 50;
    const t = st.now;
    if (st.init) {
      const inp: Pred = { seq: st.seq++, mx: quantizeAxis(ix), my: quantizeAxis(iy) };
      if (Math.hypot(ix, iy) >= SIM_TUNING.JOYSTICK_DEADZONE) st.path = st.moveTo = null;
      else {
        const wp = pathWaypoint();
        if (wp) inp.wp = wp;
      }
      const p = replay(inp, st.x, st.y);
      st.x = p.x;
      st.y = p.y;
      st.hist.push(inp);
      st.last3.push({ seq: inp.seq, mx: inp.mx, my: inp.my });
      if (st.last3.length > 3) st.last3.shift();
      const cmds = st.pending.map((c) => (st.afterSeqOf.has(c.id) ? { ...c, afterSeq: st.afterSeqOf.get(c.id) } : c)) as PlayerCommand[];
      up.send({ inputs: [...st.last3], cmds, ackTick: Math.max(0, st.lastTick), rtt: 200 }, t);
    }
    // travada forçada: tudo o que chega fica parado e sai junto depois (TCP)
    for (const m of up.receive(t)) held.push({ at: t, m });
    if (!stalledAt(t)) while (held.length > 0) core.onInput(sid, held.shift()!.m);
    const snaps = core.tick();
    const sess = (core as unknown as { sessions: Map<string, { inputQ: unknown[] }> }).sessions.get(sid)!;
    st.qlens.push(sess.inputQ.length);
    const s = snaps.get(sid);
    if (s) down.send(s, t);
    for (const m of down.receive(t)) heldDown.push({ at: t, m });
    if (stalledAt(t)) return;
    while (heldDown.length > 0) {
      const snap = heldDown.shift()!.m;
      if (snap.t <= st.lastTick) continue;
      st.lastTick = snap.t;
      st.snaps.push(snap);
      st.pending = st.pending.filter((c) => c.id > snap.cack);
      const me = snap.ents.find((e) => e.i === wel.you);
      if (!me) continue;
      st.mv = snap.hud.mv;
      st.canMove = snap.hud.canMove;
      const sx = me.x / POS_SCALE, sy = me.y / POS_SCALE;
      if (!st.init) {
        st.init = true;
        st.x = sx;
        st.y = sy;
        continue;
      }
      st.hist = st.hist.filter((h) => h.seq > snap.ack);
      let x = sx, y = sy;
      for (const h of st.hist) ({ x, y } = replay(h, x, y));
      st.errs.push(Math.hypot(st.x - x, st.y - y));
      if (process.env['PQP_DEBUG_PRED'] && Math.hypot(st.x - x, st.y - y) > 0.05) {
        console.log(`t=${t} snap=${snap.t} ack=${snap.ack} seq=${st.seq} err=${Math.hypot(st.x - x, st.y - y).toFixed(3)} hist=${st.hist.map((h) => `${h.seq}:${h.mx},${h.my}${h.wp ? 'w' : ''}`).join(' ')}`);
      }
      st.x = x;
      st.y = y;
    }
  };
  /** o comando vai com afterSeq = a última seq que o cliente já previu */
  const command = (body: Omit<PlayerCommand, 'id'>, withAfterSeq: boolean): number => {
    const id = st.nextCmd++;
    st.pending.push({ ...body, id } as PlayerCommand);
    if (withAfterSeq) st.afterSeqOf.set(id, st.seq - 1);
    return id;
  };
  const followPath = (path: Vec[], dest: Vec) => {
    st.path = path.map((p) => ({ x: p.x, y: p.y }));
    st.moveTo = { x: dest.x, y: dest.y };
  };
  return { core, st, tick, command, followPath, up, down, you: wel.you };
}

const report = (name: string, r: ReturnType<typeof session>) => {
  if (!process.env['PQP_DEBUG_PRED']) return;
  const q = r.st.qlens;
  console.log(`[${name}] p99=${pct(r.st.errs, 0.99).toFixed(3)} max=${Math.max(...r.st.errs).toFixed(3)} filaMédia=${(q.reduce((a, b) => a + b, 0) / q.length).toFixed(2)} filaMax=${Math.max(...q)}`);
};

const pct = (a: number[], p: number) => {
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
};

/** Anda num quadrado (730 ms por lado), sem parar, por `laps` voltas. */
function square(r: ReturnType<typeof session>, laps: number) {
  for (let k = 0; k < laps; k++) {
    for (const [x, y] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ] as const) {
      for (let i = 0; i < 15; i++) r.tick(x, y);
    }
  }
}

describe('previsão contra o servidor com rede de TCP (200 ms de RTT)', () => {
  it('2% de perda virando travadas: o erro de previsão fica pequeno e a fila não acumula', () => {
    const r = session({ loss: 0.02, seed: 101 });
    for (let i = 0; i < 20; i++) r.tick(0, 0);
    square(r, 12); // ~36 s andando
    report('2% travadas', r);
    expect(r.st.errs.length).toBeGreaterThan(500);
    expect(r.down.stalled + r.up.stalled).toBeGreaterThan(10);
    // antes da correção: p99 ~0,55 tile e a fila presa em ~1,8 depois de cada travada.
    // Agora o erro é só o arredondamento da posição no snapshot (0,01 tile).
    expect(Math.max(...r.st.errs)).toBeLessThan(0.02);
    expect(r.st.qlens.reduce((a, b) => a + b, 0) / r.st.qlens.length).toBeLessThan(0.1);
  });

  it('travada forçada de 250 ms a cada 2,5 s: nenhum puxão e a fila volta a 0', () => {
    const r = session({ loss: 0, seed: 102, periodic: { everyMs: 2500, forMs: 250 } });
    for (let i = 0; i < 20; i++) r.tick(0, 0);
    square(r, 12);
    report('travada 250/2500', r);
    expect(Math.max(...r.st.errs)).toBeLessThan(0.02);
    expect(Math.max(...r.st.qlens)).toBeLessThanOrEqual(4);
    expect(r.st.qlens.reduce((a, b) => a + b, 0) / r.st.qlens.length).toBeLessThan(0.15);
  });

  it('travada longa (600 ms): a rajada drena em poucos ticks, sem puxão', () => {
    const r = session({ loss: 0, seed: 103, periodic: { everyMs: 5000, forMs: 600 } });
    for (let i = 0; i < 20; i++) r.tick(0, 0);
    square(r, 6);
    report('travada 600/5000', r);
    expect(Math.max(...r.st.qlens)).toBeLessThanOrEqual(12);
    expect(Math.max(...r.st.qlens.slice(-60))).toBe(0);
    expect(Math.max(...r.st.errs)).toBeLessThan(0.02);
  });

  it('sem perda, sem variação: previsão exata (só o arredondamento da posição)', () => {
    const r = session({ loss: 0, seed: 104 });
    for (let i = 0; i < 20; i++) r.tick(0, 0);
    square(r, 3);
    expect(Math.max(...r.st.errs)).toBeLessThan(0.02);
    expect(Math.max(...r.st.qlens)).toBe(0);
  });

  it('variação de 40 ms sem embaralhar: sem puxão', () => {
    const r = session({ loss: 0, jitterMs: 40, seed: 105 });
    for (let i = 0; i < 20; i++) r.tick(0, 0);
    square(r, 6);
    report('variação 40', r);
    expect(Math.max(...r.st.errs)).toBeLessThan(0.02);
  });

  it('toque no chão (ir_ate) com travadas: o caminho anda junto com as entradas, sem puxão', () => {
    const r = session({ loss: 0, seed: 107, periodic: { everyMs: 1500, forMs: 250 } });
    for (let i = 0; i < 20; i++) r.tick(0, 0);
    const e = r.core.entityOf('p1')!;
    const dest = { x: 30.5, y: 60.5 }; // terra firme, depois das palafitas (o A* contorna)
    const path = r.core.world.pathfinder!(r.core.world.map, { x: r.st.x, y: r.st.y }, dest, e.radius);
    expect(path && path.length > 0).toBe(true);
    r.followPath(path!, dest);
    r.command({ c: 'ir_ate', x: dest.x, y: dest.y } as Omit<PlayerCommand, 'id'>, true);
    for (let i = 0; i < 300; i++) r.tick(0, 0);
    report('ir_ate com travadas', r);
    expect(Math.hypot(e.x - dest.x, e.y - dest.y)).toBeLessThan(0.3);
    expect(Math.max(...r.st.errs)).toBeLessThan(0.05);
  });

  it('quem manda entradas mais rápido que 20 por segundo não anda mais rápido (crédito)', () => {
    const core = new GameServerCore({ content: false, log: () => undefined });
    core.addClient('c', { token: 'tok-pressa-00001' });
    const e = core.entityOf('c')!;
    for (let i = 0; i < 20; i++) core.tick();
    const x0 = e.x;
    let seq = 0;
    // 3 entradas novas por tick, sempre para a direita, por 30 ticks (1,5 s)
    for (let t = 0; t < 30; t++) {
      const ins = [0, 1, 2].map(() => ({ seq: seq++, mx: 127, my: 0 }));
      core.onInput('c', { inputs: ins, cmds: [], ackTick: 0, rtt: 0 });
      core.tick();
    }
    const step = (moveSpeedOf(e) * TICK_MS) / 1000;
    const walked = Math.abs(e.x - x0) / step;
    // honesto: 30 passos; com 3x de entradas daria 90. Passam só a rajada do crédito (até 20) e 5%.
    expect(walked).toBeGreaterThan(29);
    expect(walked).toBeLessThan(30 * 1.05 + 20 + 1);
    // e daí em diante, um passo por tick: 30 ticks a mais andam ~31,5 passos, não 90
    const x1 = e.x;
    for (let t = 0; t < 30; t++) {
      const ins = [0, 1, 2].map(() => ({ seq: seq++, mx: -127, my: 0 }));
      core.onInput('c', { inputs: ins, cmds: [], ackTick: 0, rtt: 0 });
      core.tick();
    }
    expect(Math.abs(e.x - x1) / step).toBeLessThan(30 * 1.05 + 1.5);
  });
});

describe('comando amarrado à entrada (afterSeq)', () => {
  it('o comando espera o servidor andar a entrada que o cliente já tinha previsto', () => {
    const core = new GameServerCore({ content: false, log: () => undefined });
    core.addClient('c', { token: 'tok-afterseq-0001' });
    const e = core.entityOf('c')!;
    core.tick();
    // 4 entradas chegam juntas (rajada) com um comando criado depois da seq 3
    const ins = [0, 1, 2, 3].map((seq) => ({ seq, mx: 127, my: 0 }));
    core.onInput('c', { inputs: ins, cmds: [{ id: 1, c: 'auto', on: true, afterSeq: 3 } as unknown as PlayerCommand], ackTick: 0, rtt: 0 });
    let appliedAtTick = -1;
    for (let t = 0; t < 8; t++) {
      core.tick();
      if (e.auto && appliedAtTick < 0) appliedAtTick = t;
    }
    // tick 0: drena as seqs 0 e 1 na hora e a 2 anda no step; tick 1: a 3 anda no step;
    // tick 2: o comando roda, com a posição depois da seq 3
    expect(appliedAtTick).toBe(2);
    // depois, sem entradas novas, o servidor não supõe nada: o ack fica na última que andou
    expect(core.tick().get('c')!.ack).toBe(3);
  });

  it('sem afterSeq, o comando roda no tick em que chega (como antes)', () => {
    const core = new GameServerCore({ content: false, log: () => undefined });
    core.addClient('c', { token: 'tok-afterseq-0002' });
    const e = core.entityOf('c')!;
    core.onInput('c', { inputs: [{ seq: 0, mx: 0, my: 0 }], cmds: [{ id: 1, c: 'auto', on: true }], ackTick: 0, rtt: 0 });
    core.tick();
    expect(e.auto).toBe(true);
  });

  it('afterSeq que nunca chega não segura o comando para sempre', () => {
    const core = new GameServerCore({ content: false, log: () => undefined });
    core.addClient('c', { token: 'tok-afterseq-0003' });
    const e = core.entityOf('c')!;
    core.onInput('c', { inputs: [{ seq: 0, mx: 0, my: 0 }], cmds: [{ id: 1, c: 'auto', on: true, afterSeq: 5 } as unknown as PlayerCommand], ackTick: 0, rtt: 0 });
    for (let t = 0; t < 12; t++) core.tick();
    expect(e.auto).toBe(true);
  });

  it('comando criado andando, com travadas: com afterSeq, a posição do servidor no comando é a prevista', () => {
    // o jogador anda e cria o comando logo depois de prever a seq k; o servidor tem que rodar o
    // comando com a posição depois de k (o 'interagir' confere o raio e o 'ir_ate' faz o A* dela)
    const r = session({ loss: 0, seed: 106, periodic: { everyMs: 1000, forMs: 250 } });
    for (let i = 0; i < 30; i++) r.tick(0, 0);
    const e = r.core.entityOf('p1')!;
    // espia a fila de comandos do servidor: guarda a posição quando um comando roda
    const c = r.core as unknown as { flushCmds: (...a: unknown[]) => void; sessions: Map<string, { cmdQ: unknown[] }> };
    const orig = c.flushCmds.bind(r.core);
    const ranAt: { x: number; y: number }[] = [];
    c.flushCmds = (...a: unknown[]) => {
      const q = c.sessions.get('p1')!.cmdQ;
      const n0 = q.length;
      orig(...a);
      for (let i = q.length; i < n0; i++) ranAt.push({ x: e.x, y: e.y });
    };
    const predicted: { x: number; y: number }[] = [];
    for (let k = 0; k < 8; k++) {
      for (let i = 0; i < 6 + k; i++) r.tick(k % 2 === 0 ? 1 : -1, k % 3 === 0 ? 0.5 : 0);
      predicted.push({ x: r.st.x, y: r.st.y });
      const cards: DoctrineCard[] = [{ se: { t: 'sempre' }, faca: { t: 'usar_botao', botao: ((k % 3) + 1) as 1 | 2 | 3 } }];
      r.command({ c: 'doutrina', cards } as Omit<PlayerCommand, 'id'>, true);
      for (let i = 0; i < 4; i++) r.tick(k % 2 === 0 ? 1 : -1, 0);
    }
    for (let i = 0; i < 30; i++) r.tick(0, 0);
    expect(ranAt.length).toBe(8);
    for (let k = 0; k < 8; k++) expect(Math.hypot(ranAt[k]!.x - predicted[k]!.x, ranAt[k]!.y - predicted[k]!.y)).toBeLessThan(0.12);
  });
});
