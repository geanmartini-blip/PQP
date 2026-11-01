/**
 * Arte da Fase 4: móveis do catálogo em todas as rotações, interiores da casa de mutirão e da
 * cápsula, e os ícones de UI (moedas, câmbio, feira, app, casa, decorar, girar, tirar).
 */
import { describe, expect, it } from 'vitest';
import { getData } from '@pqp/shared';
import { buildFurniture, buildFurnitureSheet, FURNITURE_ART, furnitureByStyle, furnitureFootprint, furnitureFrame, furnitureInfo, furnitureRot, furnitureRots } from '../src/art/furniture';
import { buildIcon } from '../src/art/icons';
import { buildInterior, INTERIOR_FRONT, INTERIOR_SIDE, INTERIOR_WALL_H, interiorStyleFor, interiorTiles } from '../src/art/interiors';
import { type Pix } from '../src/art/pixel';
import { UI_ICON_IDS } from '../src/art/uiIcons';

const d = getData();

function sig(p: Pix): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < p.data.length; i++) {
    h ^= p.data[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return `${p.w}x${p.h}:${(h >>> 0).toString(16)}`;
}

describe('móveis', () => {
  it('todo móvel do catálogo tem desenho próprio, com cerca de 15 por margem', () => {
    for (const m of d.furniture) expect(FURNITURE_ART[m.id], m.id).toBeDefined();
    const by = furnitureByStyle();
    expect(by.esquerda.length).toBeGreaterThanOrEqual(15);
    expect(by.direita.length).toBeGreaterThanOrEqual(15);
  });

  it('cada rotação tem o tamanho da pegada girada e desenho visível', () => {
    for (const m of d.furniture) {
      for (let r = 0; r < furnitureRots(m.id); r++) {
        const info = furnitureInfo(m.id, r);
        const pix = buildFurniture(m.id, r);
        expect([pix.w, pix.h], `${m.id}/${r}`).toEqual([info.w, info.h]);
        expect(info.w).toBe(info.footW * 32);
        expect(info.h).toBe(info.footH * 32 + info.up);
        expect(pix.countOpaque(200), `${m.id}/${r}`).toBeGreaterThan(40);
      }
    }
  });

  it('as rotações ímpares trocam a pegada; parede não gira', () => {
    expect(furnitureFootprint('rede_de_varanda', 0)).toEqual({ w: 3, h: 1 });
    expect(furnitureFootprint('rede_de_varanda', 1)).toEqual({ w: 1, h: 3 });
    expect(furnitureFootprint('capsula_de_sono', 1)).toEqual({ w: 2, h: 1 });
    expect(furnitureRots('telao_de_parede')).toBe(1);
    expect(furnitureFootprint('telao_de_parede', 1)).toEqual({ w: 3, h: 1 });
    // 2 rotações repetem 0 e 1; a 3 é o espelho da 1
    expect(furnitureRot('banco_de_madeira', 2)).toBe(0);
    expect(furnitureFrame('banco_de_madeira', 3)).toBe('mov_banco_de_madeira_1');
    expect(sig(buildFurniture('cadeira_de_balanco', 3))).toBe(sig(buildFurniture('cadeira_de_balanco', 1).flipX()));
  });

  it('girar muda o desenho dos móveis com mais de uma rotação', () => {
    for (const m of d.furniture) {
      const n = furnitureRots(m.id);
      if (n < 2) continue;
      const sigs = new Set(Array.from({ length: n }, (_, r) => sig(buildFurniture(m.id, r))));
      expect(sigs.size, m.id).toBe(n === 4 ? 4 : 2);
    }
  });

  it('os desenhos são diferentes entre si e a folha tem todos os quadros', () => {
    const seen = new Set(d.furniture.map((m) => sig(buildFurniture(m.id, 0))));
    expect(seen.size).toBe(d.furniture.length);
    const sh = buildFurnitureSheet();
    const names = new Set(sh.frames.map((f) => f.name));
    for (const m of d.furniture) for (let r = 0; r < furnitureRots(m.id); r++) expect(names.has(`mov_${m.id}_${r}`), m.id).toBe(true);
    expect(sh.pix.w).toBeLessThanOrEqual(1024);
  });

  it('id fora do catálogo cai no caixote reserva', () => {
    const p = buildFurniture('movel_que_nao_existe');
    expect([p.w, p.h]).toEqual([32, 48]);
    expect(p.countOpaque()).toBeGreaterThan(40);
  });
});

describe('interiores', () => {
  it('mutirão e cápsula têm o tamanho da grade com paredes e são diferentes', () => {
    const a = buildInterior('mutirao', 9, 8);
    const b = buildInterior('capsula', 9, 8);
    expect([a.pix.w, a.pix.h]).toEqual([9 * 32 + 2 * INTERIOR_SIDE, 8 * 32 + INTERIOR_WALL_H + INTERIOR_FRONT]);
    expect([a.floorX, a.floorY]).toEqual([INTERIOR_SIDE, INTERIOR_WALL_H]);
    expect(a.pix.countOpaque()).toBe(a.pix.w * a.pix.h);
    expect(sig(a.pix)).not.toBe(sig(b.pix));
    // determinístico
    expect(sig(buildInterior('capsula', 3, 5).pix)).toBe(sig(buildInterior('capsula', 3, 5).pix));
  });

  it('o estilo e o tamanho saem do tipo de moradia', () => {
    for (const t of d.housing.tipos) {
      expect(interiorStyleFor(t.id), t.id).toBe(t.side === 'direita' ? 'capsula' : 'mutirao');
      expect(interiorTiles(t.id)).toEqual({ w: t.tamanho.w, h: t.tamanho.h });
    }
  });
});

describe('ícones de UI', () => {
  it('os 9 ícones existem, são 48x48 e diferentes', () => {
    expect(UI_ICON_IDS.length).toBe(9);
    const sigs = new Set<string>();
    for (const id of UI_ICON_IDS) {
      const p = buildIcon(id);
      expect([p.w, p.h]).toEqual([48, 48]);
      expect(p.countOpaque(), id).toBeGreaterThan(300);
      sigs.add(sig(p));
    }
    expect(sigs.size).toBe(9);
  });
});
