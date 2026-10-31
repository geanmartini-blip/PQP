/** Joystick, teclado e configuração pela URL. */
import { describe, expect, it } from 'vitest';
import { dequantizeAxis, quantizeAxis } from '@pqp/shared/net';
import { moveVelocity, SIM_TUNING } from '@pqp/shared/sim';
import { parseConfig, resolveEndpoint } from '../src/config';
import { isTap, JOY_DEAD_PX, JOY_RADIUS_PX, joystickVector, keysVector, newJoystick, updateJoystick } from '../src/input/joystick';
import { makeInput } from '../src/net/prediction';

describe('joystick', () => {
  it('zona morta, curso parcial e teto em 1', () => {
    expect(joystickVector(0, 0, JOY_DEAD_PX - 1, 0).mag).toBe(0);
    const half = joystickVector(0, 0, JOY_RADIUS_PX / 2, 0);
    expect(half.x).toBeCloseTo(0.5);
    const far = joystickVector(0, 0, 0, -JOY_RADIUS_PX * 3);
    expect(far.y).toBeCloseTo(-1);
    expect(Math.hypot(far.x, far.y)).toBeLessThanOrEqual(1 + 1e-9);
    const diag = joystickVector(0, 0, 100, 100);
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1);
  });

  it('a base segue o dedo passando do raio', () => {
    const j = newJoystick(100, 100);
    updateJoystick(j, 100 + JOY_RADIUS_PX * 2, 100);
    expect(j.ox).toBeCloseTo(100 + JOY_RADIUS_PX);
    expect(j.x).toBeCloseTo(1);
    // voltando um pouco, já anda para o outro lado sem precisar voltar até o começo
    updateJoystick(j, j.ox - JOY_RADIUS_PX / 2, 100);
    expect(j.x).toBeCloseTo(-0.5);
  });

  it('o vetor quantizado anda igual no cliente e no servidor', () => {
    const v = joystickVector(0, 0, 30, -40);
    const inp = makeInput(1, v.x, v.y);
    expect(inp.mx).toBe(quantizeAxis(v.x));
    const a = moveVelocity({ x: dequantizeAxis(inp.mx), y: dequantizeAxis(inp.my) }, 5);
    expect(Math.hypot(a.vx, a.vy)).toBeCloseTo(5 * Math.min(1, 50 / JOY_RADIUS_PX), 1);
    // zona morta do joystick em pixels fica abaixo da zona morta da simulação
    expect(JOY_DEAD_PX / JOY_RADIUS_PX).toBeLessThanOrEqual(SIM_TUNING.JOYSTICK_DEADZONE);
  });

  it('teclado: diagonal normalizada', () => {
    const d = keysVector(false, true, true, false);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
    expect(keysVector(true, true, false, false)).toEqual({ x: 0, y: 0 });
  });

  it('toque x arrasto', () => {
    expect(isTap(120, 4)).toBe(true);
    expect(isTap(600, 4)).toBe(false);
    expect(isTap(100, 40)).toBe(false);
  });
});

describe('config', () => {
  const dev = { protocol: 'http:', hostname: '192.168.0.10', host: '192.168.0.10:5173', port: '5173' };
  const prod = { protocol: 'http:', hostname: '192.168.0.10', host: '192.168.0.10:2567', port: '2567' };
  it('servidor na 2567 no dev, mesma origem no build, ou ?server', () => {
    expect(resolveEndpoint(null, dev)).toBe('http://192.168.0.10:2567');
    expect(resolveEndpoint(null, prod)).toBe('http://192.168.0.10:2567');
    expect(resolveEndpoint('10.0.0.2:3000', dev)).toBe('http://10.0.0.2:3000');
    expect(resolveEndpoint('wss://jogo.exemplo/', dev)).toBe('https://jogo.exemplo');
    expect(resolveEndpoint(null, { ...prod, protocol: 'https:', host: 'x.y', port: '' })).toBe('https://x.y');
  });

  it('lag, perda e variação', () => {
    const c = parseConfig('?lag=200&loss=0.02&jitter=20&debug=1', dev);
    expect(c.lag).toBe(200);
    expect(c.loss).toBeCloseTo(0.02);
    expect(c.jitter).toBe(20);
    expect(c.debug).toBe(true);
    expect(c.gallery).toBe(false);
    const z = parseConfig('?lag=abc&loss=7', dev);
    expect(z.lag).toBe(0);
    expect(z.loss).toBe(0.9);
  });
});
