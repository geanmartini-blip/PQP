/** Buffer de interpolação, relógio do servidor, passo fixo e RTT. */
import { describe, expect, it } from 'vitest';
import { FixedStep } from '../src/net/fixedStep';
import { EXTRAPOLATE_MAX_MS, InterpBuffer, ServerClock, SNAP_TELEPORT_TILES, type Sample } from '../src/net/interpolation';
import { RttMeter } from '../src/net/rtt';

const S = (): Sample => ({ t: 0, x: 0, y: 0 });

describe('InterpBuffer', () => {
  it('interpola entre duas amostras', () => {
    const b = new InterpBuffer();
    b.push(0, 0, 0);
    b.push(50, 1, 2);
    const o = S();
    b.sample(25, o);
    expect(o.x).toBeCloseTo(0.5);
    expect(o.y).toBeCloseTo(1);
    b.sample(-10, o);
    expect(o.x).toBe(0);
  });

  it('extrapola pouco quando falta pacote e depois segura', () => {
    const b = new InterpBuffer();
    b.push(0, 0, 0);
    b.push(50, 0.25, 0);
    const o = S();
    b.sample(100, o);
    expect(o.x).toBeCloseTo(0.5);
    b.sample(50 + EXTRAPOLATE_MAX_MS + 500, o);
    expect(o.x).toBeCloseTo(0.25 + (0.25 / 50) * EXTRAPOLATE_MAX_MS);
  });

  it('ignora amostra fora de ordem e acha o par certo com buraco no meio', () => {
    const b = new InterpBuffer();
    b.push(0, 0, 0);
    b.push(100, 2, 0); // o snapshot do tick 1 se perdeu
    b.push(50, 9, 9); // chegou atrasado: ignorado
    b.push(150, 3, 0);
    const o = S();
    b.sample(50, o);
    expect(o.x).toBeCloseTo(1);
    b.sample(125, o);
    expect(o.x).toBeCloseTo(2.5);
    expect(b.length).toBe(3);
  });

  it('salto grande é teletransporte, não deslizada', () => {
    const b = new InterpBuffer();
    b.push(0, 0, 0);
    b.push(50, SNAP_TELEPORT_TILES + 6, 0);
    const o = S();
    b.sample(25, o);
    expect(o.x).toBe(0);
    b.sample(50, o);
    expect(o.x).toBe(SNAP_TELEPORT_TILES + 6);
  });

  it('é circular e não cresce', () => {
    const b = new InterpBuffer();
    for (let i = 0; i < 100; i++) b.push(i * 50, i, 0);
    expect(b.length).toBe(32);
    const o = S();
    b.sample(99 * 50 - 25, o);
    expect(o.x).toBeCloseTo(98.5);
  });
});

describe('ServerClock', () => {
  it('acompanha o servidor com atraso de interpolação e nunca volta', () => {
    const c = new ServerClock(100);
    // snapshots do tick k chegam em 100 + 50k ms locais (atraso de 100 ms)
    for (let k = 0; k < 40; k++) c.onSnapshot(k, 100 + 50 * k + (k % 2 ? 15 : -15));
    const now = 100 + 50 * 39;
    // agora do servidor ≈ tick 39 (39 × 50 = 1950)
    expect(Math.abs(c.serverNow(now) - 1950)).toBeLessThan(20);
    const r1 = c.renderTime(now);
    expect(Math.abs(r1 - 1850)).toBeLessThan(20);
    c.onSnapshot(40, now + 10);
    expect(c.renderTime(now)).toBeGreaterThanOrEqual(r1);
  });

  it('pula direto quando o relógio muda muito (reconexão)', () => {
    const c = new ServerClock(100);
    c.onSnapshot(10, 1000);
    c.onSnapshot(5000, 2000);
    expect(c.serverNow(2000)).toBeCloseTo(5000 * 50);
  });
});

describe('FixedStep', () => {
  it('passos de 50 ms com alpha entre eles', () => {
    const f = new FixedStep(50);
    expect(f.advance(16)).toBe(0);
    expect(f.alpha).toBeCloseTo(16 / 50);
    expect(f.advance(16)).toBe(0);
    expect(f.advance(20)).toBe(1);
    expect(f.alpha).toBeCloseTo(2 / 50);
    // aba voltando do fundo: não roda centenas de passos
    expect(f.advance(10000)).toBe(5);
  });
});

describe('RttMeter', () => {
  it('média móvel do ping', () => {
    const r = new RttMeter();
    r.onPong(0, 200);
    expect(r.value).toBe(200);
    for (let i = 0; i < 50; i++) r.onPong(0, 100);
    expect(r.rounded).toBe(100);
  });
});
