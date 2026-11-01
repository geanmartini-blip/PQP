/** Densidade, zoom da câmera, posição dos botões, modo de ajuste, seta do rumo e dicas. */
import { describe, expect, it } from 'vitest';
import { getMap } from '@pqp/shared/map';
import { FONT_CELL_W } from '../src/art/fx';
import { COMPASS_MIN_TILES, nearestEnemyMarker } from '../src/ui/compass';
import {
  applyOffsets,
  BUTTON_MIN_PX,
  circlesOverlap,
  clampButton,
  computeZoom,
  edgeArrow,
  fpsLimitFor,
  hitCircle,
  hudLayout,
  MOVABLE,
  offsetOf,
  parseOffsets,
  pickDpr,
  serializeOffsets,
  worldTextScale,
  type Circle,
} from '../src/ui/layout';
import { AIM_TIP_MS, STYLE_TIP_DELAY_MS, Tips, TIPS_KEY } from '../src/ui/tips';

describe('pickDpr e fpsLimitFor', () => {
  it('usa a densidade do aparelho até 3, ou a da URL', () => {
    expect(pickDpr(1)).toBe(1);
    expect(pickDpr(2.625)).toBe(2.625);
    expect(pickDpr(3.5)).toBe(3);
    expect(pickDpr(undefined)).toBe(1);
    expect(pickDpr(0.75)).toBe(1);
    expect(pickDpr(3, 1)).toBe(1);
    expect(pickDpr(3, 2)).toBe(2);
  });

  it('teto de ~60 fps em telas de 120 e 144 Hz, nenhum em 60 e 90', () => {
    expect(fpsLimitFor(60)).toBe(0);
    expect(fpsLimitFor(90)).toBe(0);
    // o Phaser chama o quadro quando o delta acumulado passa de 1000/teto: em 120 Hz, a cada 2
    const every = (hz: number) => {
      const lim = fpsLimitFor(hz);
      let acc = 0, calls = 0;
      for (let i = 0; i < hz; i++) {
        acc += 1000 / hz;
        if (acc >= 1000 / lim) {
          calls++;
          acc = 0;
        }
      }
      return calls;
    };
    expect(every(120)).toBe(60);
    expect(every(144)).toBe(72);
  });
});

describe('computeZoom', () => {
  it('zoom inteiro, de 9,5 a 14 tiles de largura nos celulares em pé (qualquer densidade)', () => {
    for (const w of [360, 375, 390, 412, 430]) {
      for (const dpr of [1, 2, 2.625, 2.75, 3]) {
        const W = Math.round(w * dpr), H = Math.round(w * 2.1 * dpr);
        const z = computeZoom(W, H);
        expect(Number.isInteger(z)).toBe(true);
        const tiles = W / (32 * z);
        expect(tiles).toBeGreaterThanOrEqual(9.5);
        expect(tiles).toBeLessThanOrEqual(14);
      }
    }
  });

  it('tela larga mostra mais mundo em vez de ampliar: pelo menos 14 tiles de altura', () => {
    for (const [W, H] of [
      [1280, 720],
      [1920, 1080],
      [1024, 768],
    ] as const) {
      const z = computeZoom(W, H);
      expect(Number.isInteger(z)).toBe(true);
      expect(H / (32 * z)).toBeGreaterThanOrEqual(14);
    }
    expect(computeZoom(1280, 720)).toBe(1);
    // tablet em pé: 12 tiles
    expect(computeZoom(768, 1024)).toBe(2);
  });

  it('texto do mundo com ~2 px de CSS por pixel da fonte, inteiro', () => {
    expect(worldTextScale(1, 1)).toBe(2);
    expect(worldTextScale(2.625, 3)).toBe(2);
    expect(worldTextScale(3, 3)).toBe(2);
  });
});

describe('hudLayout', () => {
  const overlaps = (a: Circle, b: Circle) => circlesOverlap(a, b);
  for (const [w, h, dpr] of [
    [360, 740, 1],
    [375, 812, 1],
    [390, 844, 3],
    [412, 915, 2.625],
    [430, 932, 3],
    [768, 1024, 2],
  ] as const) {
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    it(`botões grandes, na tela, sem se encostar e na metade direita (${w}x${h} @${dpr})`, () => {
      const L = hudLayout(W, H, 20, 0, dpr);
      expect(L.px).toBe(dpr);
      const movable = [L.b1, L.b2, L.b3, L.especial, L.item, L.auto, L.falar];
      const all = [...movable, L.ala, L.ajuste];
      // todos com pelo menos 56 px de CSS, inclusive AUTO, ALA e a engrenagem
      for (const c of all) expect(c.r * 2).toBeGreaterThanOrEqual(BUTTON_MIN_PX * dpr - 1);
      expect(L.especial.r).toBeGreaterThan(L.b1.r);
      for (const c of movable) {
        expect(c.x - c.r).toBeGreaterThanOrEqual(W / 2);
        expect(c.x + c.r).toBeLessThanOrEqual(W);
        expect(c.y + c.r).toBeLessThanOrEqual(H - 20 * dpr);
      }
      for (const c of all) {
        expect(c.x - c.r).toBeGreaterThanOrEqual(0);
        expect(c.x + c.r).toBeLessThanOrEqual(W);
      }
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(overlaps(all[i]!, all[j]!)).toBe(false);
      expect(hitCircle(L.especial, L.especial.x + L.especial.r + 3, L.especial.y)).toBe(true);
      // ALA e a engrenagem ficam abaixo dos quadros, e a barra do chefe abaixo deles
      expect(L.ala.y - L.ala.r).toBeGreaterThanOrEqual(L.target.y + L.target.h);
      expect(L.ajuste.y - L.ajuste.r).toBeGreaterThanOrEqual(L.player.y + L.player.h);
      expect(L.boss.y).toBeGreaterThan(L.ala.y + L.ala.r);
    });

    it(`texto do HUD legível e dentro dos quadros (${w}x${h} @${dpr})`, () => {
      const L = hudLayout(W, H, 0, 0, dpr);
      // letra com pelo menos 14 px de CSS de largura de célula (2 px por pixel da fonte)
      expect(Number.isInteger(L.ts)).toBe(true);
      expect(L.charW / dpr).toBeGreaterThanOrEqual(FONT_CELL_W * 1.8);
      // o número da vida cabe na barra ("1234/1234") e o nome tem pelo menos 8 letras
      expect(L.player.chars).toBeGreaterThanOrEqual(9);
      expect(L.target.chars).toBeGreaterThanOrEqual(6);
      const P = L.player;
      for (const r of [P.hpBar, P.resBar, P.xpBar]) {
        expect(r.x).toBeGreaterThanOrEqual(P.x);
        expect(r.x + r.w).toBeLessThanOrEqual(P.x + P.w + 1);
        expect(r.y + r.h).toBeLessThanOrEqual(P.y + P.h + 1);
      }
      expect(P.level.y + L.lineH).toBeLessThanOrEqual(P.y + P.h + 1);
      const T = L.target;
      expect(T.hpBar.x + T.hpBar.w).toBeLessThanOrEqual(T.x + T.w + 1);
      expect(T.level.y + L.lineH).toBeLessThanOrEqual(T.y + T.h + 1);
      // os dois quadros não se encostam
      expect(P.x + P.w).toBeLessThan(T.x);
    });

    it(`dica da mira em cima do Falar, sem cobrir o botão (${w}x${h} @${dpr})`, () => {
      const L = hudLayout(W, H, 0, 0, dpr);
      const m = L.tips.mira;
      expect(m.oy).toBe(1);
      // a base da dica fica acima do topo do Falar
      expect(m.y).toBeLessThanOrEqual(L.falar.y - L.falar.r);
      // e na metade direita (a esquerda é do joystick)
      expect(m.x - m.wrap / 2).toBeGreaterThanOrEqual(W / 2 - 1);
      expect(m.x + m.wrap / 2).toBeLessThanOrEqual(W);
    });
  }
});

describe('modo de ajuste dos botões', () => {
  const W = 375, H = 812;
  it('deslocamentos guardados mudam o botão de lugar, presos na metade direita', () => {
    const L = hudLayout(W, H);
    const A = applyOffsets(L, { b1: { dx: -8, dy: 0 }, item: { dx: -1000, dy: -1000 } }, W, H);
    expect(A.b1.x).toBe(L.b1.x - 8);
    expect(A.b1.y).toBe(L.b1.y);
    // não invade o joystick nem sobe nos quadros
    expect(A.item.x - A.item.r).toBeGreaterThanOrEqual(W / 2);
    expect(A.item.y - A.item.r).toBeGreaterThanOrEqual(H * 0.3);
    // o resto fica igual
    expect(A.especial).toEqual(L.especial);
  });

  it('vale em outra densidade (deslocamento em px de CSS)', () => {
    const L1 = hudLayout(W, H, 0, 0, 1);
    const L3 = hudLayout(W * 3, H * 3, 0, 0, 3);
    const o = { b2: { dx: -30, dy: -20 } };
    const A1 = applyOffsets(L1, o, W, H), A3 = applyOffsets(L3, o, W * 3, H * 3);
    expect(Math.abs(A3.b2.x / 3 - A1.b2.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(A3.b2.y / 3 - A1.b2.y)).toBeLessThanOrEqual(1);
  });

  it('clampButton prende dentro da tela e acima da área segura', () => {
    const c = clampButton({ x: 9999, y: 9999, r: 30 }, W, H, 20);
    expect(c.x + c.r).toBeLessThanOrEqual(W);
    expect(c.y + c.r).toBeLessThanOrEqual(H - 20);
    const d = clampButton({ x: 0, y: 0, r: 30 }, W, H);
    expect(d.x - d.r).toBeGreaterThanOrEqual(W / 2);
  });

  it('ida e volta pelo armazenamento; lixo é ignorado', () => {
    const L = hudLayout(W, H);
    const moved = { ...L.b3, x: L.b3.x - 25, y: L.b3.y + 10 };
    const off = { b3: offsetOf(L.b3, moved, 1) };
    const raw = serializeOffsets(off);
    expect(parseOffsets(raw)).toEqual({ b3: { dx: -25, dy: 10 } });
    expect(parseOffsets('{nao e json')).toEqual({});
    expect(parseOffsets(null)).toEqual({});
    expect(parseOffsets(JSON.stringify({ b1: { dx: 'x', dy: 2 }, hack: { dx: 1, dy: 1 }, b2: { dx: 1e9, dy: -3 } }))).toEqual({ b2: { dx: 4000, dy: -3 } });
    // sem deslocamento não guarda nada
    expect(serializeOffsets({ b1: { dx: 0, dy: 0 } })).toBe('{}');
    expect(MOVABLE).toContain('especial');
  });
});

describe('seta do rumo', () => {
  it('no mapa do protótipo, o bando mais perto do spawn fica fora da tela (precisa da seta)', () => {
    const map = getMap('prototipo_delta');
    const spawn = map.markers.find((m) => m.kind === 'spawn_jogador')!;
    const m = nearestEnemyMarker(map.markers, spawn.x, spawn.y);
    expect(m).toBeDefined();
    expect(m!.d).toBeGreaterThan(COMPASS_MIN_TILES);
    expect(map.markers.some((k) => k.kind === 'chefe' && Math.hypot(k.x - spawn.x, k.y - spawn.y) < m!.d - 1e-6)).toBe(false);
  });

  it('prefere bando a chefe; sem bando, aponta o chefe', () => {
    const ms = [
      { kind: 'chefe', x: 1, y: 0 },
      { kind: 'bando', x: 10, y: 0 },
      { kind: 'npc', x: 0.5, y: 0 },
    ];
    expect(nearestEnemyMarker(ms, 0, 0)).toMatchObject({ x: 10, y: 0 });
    expect(nearestEnemyMarker([ms[0]!], 0, 0)).toMatchObject({ x: 1, y: 0 });
    expect(nearestEnemyMarker([], 0, 0)).toBeUndefined();
  });

  it('a seta fica na borda certa, dentro da margem', () => {
    const W = 400, H = 800, m = 30;
    const right = edgeArrow(W, H, 1000, 0, m);
    expect(right.x).toBeCloseTo(W - m, 6);
    expect(right.y).toBeCloseTo(H / 2, 6);
    const up = edgeArrow(W, H, 0, -1000, m, 100);
    expect(up.y).toBeCloseTo(100 + m, 6);
    const downLeft = edgeArrow(W, H, -500, 500, m, 0, 200);
    expect(downLeft.x).toBeGreaterThanOrEqual(m - 1e-6);
    expect(downLeft.y).toBeLessThanOrEqual(H - 200 - m + 1e-6);
    expect(downLeft.angle).toBeCloseTo((3 * Math.PI) / 4, 6);
  });
});

describe('Tips', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };

  it('começa pela de andar e some quando o jogador faz', () => {
    const t = new Tips(mem());
    expect(t.active({ now: 0, hasTarget: false, enemiesVisible: 0 })).toEqual(['andar']);
    t.mark('andar', 100);
    expect(t.active({ now: 200, hasTarget: false, enemiesVisible: 0 })).toEqual([]);
    // a de trocar de estilo vem depois de andar um pouco, fora da briga
    expect(t.active({ now: 100 + STYLE_TIP_DELAY_MS + 1, hasTarget: false, enemiesVisible: 0 })).toEqual(['estilo']);
    expect(t.active({ now: 100 + STYLE_TIP_DELAY_MS + 2, hasTarget: false, enemiesVisible: 1 })).toEqual([]);
  });

  it('o rumo aparece até o primeiro alvo e não volta', () => {
    const t = new Tips(mem());
    expect(t.active({ now: 0, hasTarget: false, enemiesVisible: 0, enemyFar: true })).toEqual(['andar', 'rumo']);
    expect(t.wantsCompass).toBe(true);
    // com inimigo à vista a dica sai da frente (a seta também)
    expect(t.active({ now: 10, hasTarget: false, enemiesVisible: 1, enemyFar: true })).toEqual(['andar']);
    t.active({ now: 20, hasTarget: true, enemiesVisible: 1 });
    expect(t.wantsCompass).toBe(false);
    expect(t.active({ now: 30, hasTarget: false, enemiesVisible: 0, enemyFar: true })).not.toContain('rumo');
  });

  it('mira some sozinha, alvo aparece com 2 inimigos, no máximo 2 na tela', () => {
    const t = new Tips(mem());
    const a = t.active({ now: 0, hasTarget: true, enemiesVisible: 3 });
    expect(a).toEqual(['andar', 'mira']);
    t.mark('andar', 0);
    expect(t.active({ now: 10, hasTarget: true, enemiesVisible: 3 })).toEqual(['mira', 'alvo']);
    expect(t.active({ now: AIM_TIP_MS + 20, hasTarget: true, enemiesVisible: 3 })).toEqual(['alvo']);
  });

  it('fica guardado no aparelho e sobrevive sem armazenamento', () => {
    const s = mem();
    const t = new Tips(s);
    t.mark('andar');
    t.mark('alvo');
    expect(s.m.get(TIPS_KEY)).toBe('andar,alvo');
    const t2 = new Tips(s);
    expect(t2.done.has('alvo')).toBe(true);
    const broken = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    };
    const t3 = new Tips(broken);
    t3.mark('andar');
    expect(t3.done.has('andar')).toBe(true);
  });
});
