import { describe, expect, it } from 'vitest';
import { circleFree, hasLineOfSight, makeMap, setTile } from '../src/map/grid';
import { Tile } from '../src/map/types';
import { createRng } from '../src/sim/rng';

describe('grade do mapa', () => {
  const m = makeMap('t', 10, 10);
  for (let y = 0; y < 10; y++) setTile(m, 5, y, y === 9 ? Tile.Grama : Tile.Parede);
  setTile(m, 2, 2, Tile.Pedra);

  it('parede bloqueia a visão, pedra não', () => {
    expect(hasLineOfSight(m, 1.5, 1.5, 8.5, 1.5)).toBe(false);
    expect(hasLineOfSight(m, 1.5, 2.5, 3.5, 2.5)).toBe(true);
    expect(hasLineOfSight(m, 1.5, 9.5, 8.5, 9.5)).toBe(true);
  });

  it('círculo encosta em tile sólido', () => {
    expect(circleFree(m, 4.5, 4.5, 0.4)).toBe(true);
    expect(circleFree(m, 4.8, 4.5, 0.4)).toBe(false);
    expect(circleFree(m, -0.1, 4.5, 0.3)).toBe(false);
  });

  it('rng é determinístico', () => {
    const a = createRng(42), b = createRng(42);
    const xs = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});
