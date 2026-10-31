import { describe, it, expect } from 'vitest';
import { GAME_NAME, TILE } from '../src/index';

describe('smoke', () => {
  it('exports constants', () => {
    expect(GAME_NAME).toBe('Ponte que Partiu');
    expect(TILE).toBe(32);
  });
});
