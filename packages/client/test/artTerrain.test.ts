/**
 * Testes do terreno por bloco, das árvores, da camada animada e do sombreamento (funções puras).
 */
import { describe, expect, it } from 'vitest';
import { Tile } from '@pqp/shared/map';
import { buildCharacterSheet, defaultLook } from '../src/art/character';
import { asciiSource, DEMO_CITY_ROWS, DEMO_ROWS } from '../src/art/demoMap';
import { buildFx, SHADOW_WIDTHS, shadowFrameFor } from '../src/art/fx';
import { hashInt, noiseField, nz } from '../src/art/noise';
import { B, G, hex, luma, Pix, R, shadeDiff } from '../src/art/pixel';
import { frameOf } from '../src/art/sheet';
import { overlayKind, renderTerrain, styleOfRegion, type TerrainSource, treeSprite, TREE_H, TREE_W } from '../src/art/terrain';
import { buildTileset, treeFrame } from '../src/art/tiles';

function sameRegion(a: Pix, ax: number, ay: number, b: Pix, bx: number, by: number, w: number, h: number): boolean {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (a.get(ax + x, ay + y) !== b.get(bx + x, by + y)) return false;
  return true;
}

function grid(rows: string[], legend: Record<string, number>, style: 0 | 1 | 2 = 2): TerrainSource {
  const h = rows.length;
  const w = rows[0]!.length;
  const cl = (v: number, n: number) => (v < 0 ? 0 : v >= n ? n - 1 : v);
  return { width: w, height: h, tile: (x, y) => legend[rows[cl(y, h)]![cl(x, w)]!]!, style: () => style };
}

describe('ruído', () => {
  it('campo 512x512 em 0..1, periódico e determinístico', () => {
    const f = noiseField();
    expect(f.length).toBe(512 * 512);
    let lo = 1;
    let hi = 0;
    for (const v of f) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
    expect(nz(5, 7)).toBe(nz(5 + 512, 7 - 512));
    expect(hashInt(3, 4, 5)).toBe(hashInt(3, 4, 5));
    expect(hashInt(3, 4, 5)).not.toBe(hashInt(4, 3, 5));
  });
});

describe('terreno por bloco', () => {
  const demo = asciiSource(DEMO_ROWS, 2);

  it('é opaco, do tamanho pedido e determinístico', () => {
    const a = renderTerrain(demo, 0, 0, 8, 8);
    const b = renderTerrain(demo, 0, 0, 8, 8);
    expect([a.w, a.h]).toEqual([256, 256]);
    expect(a.countOpaque(255)).toBe(256 * 256);
    expect(sameRegion(a, 0, 0, b, 0, 0, 256, 256)).toBe(true);
  });

  it('blocos vizinhos emendam sem costura (mesmos pixels que um bloco grande)', () => {
    for (const src of [demo, asciiSource(DEMO_CITY_ROWS, 1)]) {
      const big = renderTerrain(src, 0, 0, 16, 8);
      const left = renderTerrain(src, 0, 0, 8, 8);
      const right = renderTerrain(src, 8, 0, 8, 8);
      expect(sameRegion(big, 0, 0, left, 0, 0, 256, 256)).toBe(true);
      expect(sameRegion(big, 256, 0, right, 0, 0, 256, 256)).toBe(true);
      const top = renderTerrain(src, 4, 8, 8, 8);
      const tall = renderTerrain(src, 4, 4, 8, 12);
      expect(sameRegion(tall, 0, 128, top, 0, 0, 256, 256)).toBe(true);
    }
  });

  it('a borda entre grama e areia é irregular (não segue a grade do tile)', () => {
    const src = grid(['gggsss', 'gggsss', 'gggsss', 'gggsss'], { g: Tile.Grama, s: Tile.Areia });
    const p = renderTerrain(src, 0, 0, 6, 4);
    const xs = new Set<number>();
    for (let y = 0; y < p.h; y++) {
      let x = 40;
      while (x < 150 && G(p.get(x, y)) > R(p.get(x, y))) x++;
      xs.add(x);
    }
    expect(xs.size).toBeGreaterThanOrEqual(4);
    expect([...xs].some((x) => x !== 96)).toBe(true);
  });

  it('água tem espuma na beira da terra e degradê da rasa para a funda', () => {
    const src = grid(['~~~~~', '~,,,~', '~,s,~', '~,,,~', '~~~~~'], { '~': Tile.AguaFunda, ',': Tile.AguaRasa, s: Tile.Areia });
    const p = renderTerrain(src, 0, 0, 5, 5);
    let foam = 0;
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++) {
        const c = p.get(x, y);
        if (R(c) > 180 && G(c) > 210 && B(c) > 210) foam++;
      }
    expect(foam).toBeGreaterThan(40);
    // a rasa avança sobre a funda: o centro do tile fundo é escuro, a beira dele já é mais clara
    expect(luma(p.get(16, 16))).toBeLessThan(luma(p.get(16, 31)) + 40);
  });

  it('palafita: frente do deque e sombra na água logo abaixo da madeira', () => {
    const src = grid(['===', '===', ',,,', ',,,'], { '=': Tile.Madeira, ',': Tile.AguaRasa });
    const p = renderTerrain(src, 0, 0, 3, 4);
    const under = luma(p.get(40, 64 + 5));
    const open = luma(p.get(40, 64 + 28));
    expect(under).toBeLessThan(open);
    // a borda da frente é madeira escura
    expect(R(p.get(40, 65))).toBeGreaterThan(B(p.get(40, 65)));
  });

  it('objetos: parede com face, pedra, cerca e porta mudam o desenho; estilo pela região', () => {
    const plain = renderTerrain(grid(['::::', '::::', '::::'], { ':': Tile.Grama }), 1, 1, 1, 1);
    for (const t of [Tile.Parede, Tile.Pedra, Tile.Cerca, Tile.Porta, Tile.Grade, Tile.Maquina]) {
      const p = renderTerrain(grid([':::', `:o:`, ':::'], { ':': Tile.Grama, o: t }), 1, 1, 1, 1);
      expect(sameRegion(p, 0, 0, plain, 0, 0, 32, 32), String(t)).toBe(false);
    }
    expect(styleOfRegion('margem_direita')).toBe(1);
    expect(styleOfRegion('delta')).toBe(2);
    expect(styleOfRegion('margem_esquerda')).toBe(0);
  });
});

describe('árvores e camada animada', () => {
  it('árvore 2x3 tiles (64x96) nos 3 estilos, com contorno escuro', () => {
    for (const st of [0, 1, 2] as const) {
      const t = treeSprite(st, 0);
      expect([t.w, t.h]).toEqual([TREE_W, TREE_H]);
      expect(t.countOpaque()).toBeGreaterThan(1200);
      let bad = 0;
      for (let y = 0; y < t.h; y++)
        for (let x = 0; x < t.w; x++) {
          if (t.alphaAt(x, y) !== 255) continue;
          const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => t.inside(x + dx!, y + dy!) && t.alphaAt(x + dx!, y + dy!) === 0);
          if (edge && luma(t.get(x, y)) > 90) bad++;
        }
      expect(bad).toBe(0);
    }
    expect(treeSprite(2, 0).countOpaque()).not.toBe(treeSprite(0, 0).countOpaque());
  });

  it('o tileset tem árvores, quadros animados (água, mato, neon) e decoração', () => {
    const names = new Set(buildTileset().frames.map((f) => f.name));
    for (let x = 0; x < 6; x++) expect(names.has(treeFrame(2, x, x * 3))).toBe(true);
    for (const n of ['ov_rasa_0_0', 'ov_funda_3_3', 'ov_mato_2_1_3', 'ov_neon_2', 'deco_1', 'deco_2', 'deco_3', 'copa_21_0']) expect(names.has(n), n).toBe(true);
    expect(overlayKind(Tile.AguaRasa)).toBe('rasa');
    expect(overlayKind(Tile.Mato)).toBe('mato');
    expect(overlayKind(Tile.Grama)).toBeNull();
  });
});

describe('sombreamento e sombras', () => {
  it('shadeDiff clareia em cima, escurece embaixo e não mexe em traço de 1 px', () => {
    const before = new Pix(12, 12);
    const p = before.clone();
    const c = hex('#808080');
    p.rect(2, 2, 6, 6, c);
    p.hline(1, 10, 10, c);
    shadeDiff(p, before);
    expect(luma(p.get(4, 2))).toBeGreaterThan(luma(c));
    expect(luma(p.get(4, 7))).toBeLessThan(luma(c));
    expect(p.get(5, 10)).toBe(c);
  });

  it('sombra no chão em várias larguras, sempre em escala 1', () => {
    const sh = buildFx().sheets.find((s) => s.key === 'fx_sombra')!;
    expect(sh.frames.length).toBe(SHADOW_WIDTHS.length);
    SHADOW_WIDTHS.forEach((w, i) => expect(frameOf(sh, String(i)).w).toBe(w));
    expect(shadowFrameFor(24)).toBe('3');
    expect(shadowFrameFor(200)).toBe(String(SHADOW_WIDTHS.length - 1));
  });

  it('boneco com sombreamento de verdade: muitos tons no quadro parado', () => {
    const f = frameOf(buildCharacterSheet(defaultLook()), 'parado_0_0');
    const tones = new Set<number>();
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.alphaAt(x, y) === 255) tones.add(f.get(x, y));
    expect(tones.size).toBeGreaterThan(24);
  });
});
