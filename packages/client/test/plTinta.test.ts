/**
 * v0.4: a pele, o cabelo e a camiseta da criação pintam o boneco base do PixelLab.
 */
import { describe, expect, it } from 'vitest';
import { getData } from '@pqp/shared';
import { defaultLook } from '../src/art/character';
import { pintar, tintaDe, tintaKey, trocaDeCor } from '../src/art/plTinta';

describe('tinta do boneco base', () => {
  it('a cor de referência vira exatamente a cor escolhida, e as sombras ficam mais escuras', () => {
    const t = { pele: '#4b2815', cabelo: '#ff4fb4', roupa: '#3e7ea8' };
    const m = trocaDeCor(t);
    expect(m.get(0xfbb88a)).toEqual([0x4b, 0x28, 0x15]);
    expect(m.get(0x291a19)).toEqual([0xff, 0x4f, 0xb4]);
    expect(m.get(0xafacaf)).toEqual([0x3e, 0x7e, 0xa8]);
    const sombra = m.get(0xa45337)!;
    expect(sombra[0]).toBeLessThan(0x4b);
    // contorno e olhos ficam como estão
    expect(m.has(0x1d1414)).toBe(false);
    expect(m.has(0xf8f7f6)).toBe(false);
  });

  it('pinta só os pixels da paleta base', () => {
    const px = new Uint8ClampedArray([0xfb, 0xb8, 0x8a, 255, 0x1d, 0x14, 0x14, 255, 0xfb, 0xb8, 0x8a, 0]);
    pintar(px, { pele: '#e8735a', cabelo: '#1e1a1a', roupa: '#e9e4d6' });
    expect([...px.slice(0, 4)]).toEqual([0xe8, 0x73, 0x5a, 255]);
    expect([...px.slice(4, 8)]).toEqual([0x1d, 0x14, 0x14, 255]);
    expect([...px.slice(8, 12)]).toEqual([0xfb, 0xb8, 0x8a, 0]);
  });

  it('o visual escolhido muda a tinta; o padrão usa o appearance.json', () => {
    const ap = getData().appearance;
    const padrao = tintaDe(defaultLook());
    expect(padrao.pele).toBe(ap.peles.find((p) => p.id === ap.padrao.skin)!.hex.toLowerCase());
    expect(padrao.cabelo).toBe(ap.coresCabelo.find((c) => c.id === ap.padrao.hair_color)!.hex.toLowerCase());
    const outro = tintaDe({ ...defaultLook(), skin: 'vermelho_de_sol', hairColor: 'rosa_neon', outfit: { tier: 'delta', palette: 2 } });
    expect(outro).toEqual({ pele: '#e8735a', cabelo: '#ff4fb4', roupa: '#f07a2e' });
    expect(tintaKey(outro)).not.toBe(tintaKey(padrao));
  });
});
