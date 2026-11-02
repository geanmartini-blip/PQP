/**
 * v0.4: a pele, o cabelo e a camiseta da criação pintam o boneco base do PixelLab.
 */
import { describe, expect, it } from 'vitest';
import { getData } from '@pqp/shared';
import { defaultLook } from '../src/art/character';
import { pintar, tintaDe, tintaKey, trocaDeCor } from '../src/art/plTinta';
import { CABELO_NOVO, cortar, CORTES_PL } from '../src/art/plCorte';
import FOLHAS from '../src/art/plBonecos.json';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

/** PNG RGBA de 8 bits, sem entrelaçar (como as folhas do PixelLab) */
function readPng(path: string): { w: number; h: number; data: Uint8ClampedArray } {
  const b = readFileSync(path);
  let o = 8;
  let w = 0, h = 0;
  const idat: Buffer[] = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o);
    const tipo = b.toString('ascii', o + 4, o + 8);
    const d = b.subarray(o + 8, o + 8 + len);
    if (tipo === 'IHDR') {
      w = d.readUInt32BE(0);
      h = d.readUInt32BE(4);
      if (d[8] !== 8 || d[9] !== 6) throw new Error('só RGBA de 8 bits');
    }
    if (tipo === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const st = w * 4;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (st + 1)]!;
    for (let i = 0; i < st; i++) {
      const a = i >= 4 ? out[y * st + i - 4]! : 0;
      const up = y > 0 ? out[(y - 1) * st + i]! : 0;
      const c = i >= 4 && y > 0 ? out[(y - 1) * st + i - 4]! : 0;
      let v = raw[y * (st + 1) + 1 + i]!;
      if (f === 1) v += a;
      else if (f === 2) v += up;
      else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) {
        const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      out[y * st + i] = v & 255;
    }
  }
  return { w, h, data: out };
}

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
    expect(outro).toEqual({ pele: '#e8735a', cabelo: '#ff4fb4', roupa: '#f07a2e', corte: ap.padrao.hair });
    expect(tintaKey(outro)).not.toBe(tintaKey(padrao));
    expect(tintaKey({ ...outro, corte: 'careca' })).not.toBe(tintaKey(outro));
  });
});

describe('corte de cabelo no boneco base', () => {
  const folha = readPng(resolve(__dirname, '../public/pl/base/folha.png'));
  const { w, h } = FOLHAS.base;
  const CABELO = new Set([0x291a19, 0x3e2c28, 0x5a4641, 0x54392e, ...CABELO_NOVO]);
  /** pixels de cabelo e opacos no alto do 1º quadro (de frente) */
  const conta = (px: Uint8ClampedArray) => {
    let cabelo = 0, opaco = 0;
    for (let y = 0; y < h * 0.25; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * folha.w + x) * 4;
        if (px[i + 3]! < 8) continue;
        opaco++;
        if (CABELO.has((px[i]! << 16) | (px[i + 1]! << 8) | px[i + 2]!)) cabelo++;
      }
    return { cabelo, opaco };
  };
  const base = conta(folha.data);

  it('o padrão (curtinho social) e corte desconhecido deixam a folha como está', () => {
    for (const corte of [getData().appearance.padrao.hair, 'nao_existe']) {
      const px = new Uint8ClampedArray(folha.data);
      cortar(px, corte, folha.w, w, h);
      expect(px).toEqual(folha.data);
    }
  });

  it('os 19 outros cortes de appearance.json mudam a folha', () => {
    const ids = getData().appearance.cortes.map((c) => c.id).filter((id) => id !== getData().appearance.padrao.hair);
    expect([...CORTES_PL].sort()).toEqual([...ids].sort());
  });

  it('careca tira quase todo o cabelo; black power aumenta o volume', () => {
    const careca = new Uint8ClampedArray(folha.data);
    cortar(careca, 'careca', folha.w, w, h);
    expect(conta(careca).cabelo).toBeLessThan(base.cabelo * 0.1);
    const bp = new Uint8ClampedArray(folha.data);
    cortar(bp, 'black_power', folha.w, w, h);
    expect(conta(bp).opaco).toBeGreaterThan(base.opaco * 1.2);
  });

  it('o cabelo comprido desenhado pega a cor do cabelo abaixo da cabeça', () => {
    const px = new Uint8ClampedArray(folha.data);
    pintar(px, { pele: '#fbb88a', cabelo: '#ff4fb4', roupa: '#afacaf', corte: 'liso_comprido' }, folha.w, h, w);
    // costas (linha 2): no meio das costas, abaixo de 45% do quadro, tem cabelo rosa
    let rosa = 0;
    for (let y = Math.ceil(h * 0.45); y < h * 0.6; y++)
      for (let x = 0; x < w; x++) {
        const i = ((2 * h + y) * folha.w + x) * 4;
        if (px[i + 3]! > 8 && px[i]! > 200 && px[i + 1]! < 120 && px[i + 2]! > 140) rosa++;
      }
    expect(rosa).toBeGreaterThan(50);
  });
});
