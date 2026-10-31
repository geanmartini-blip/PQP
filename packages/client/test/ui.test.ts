/** Zoom da câmera, posição dos botões e dicas do primeiro minuto. */
import { describe, expect, it } from 'vitest';
import { BUTTON_MIN_PX, computeZoom, hitCircle, hudLayout, type Circle } from '../src/ui/layout';
import { AIM_TIP_MS, STYLE_TIP_DELAY_MS, Tips, TIPS_KEY } from '../src/ui/tips';

describe('computeZoom', () => {
  it('mostra de 11 a 13 tiles com zoom inteiro ou meio-inteiro', () => {
    for (const w of [360, 375, 390, 412, 430, 768, 820, 1024]) {
      const z = computeZoom(w);
      expect(z * 2).toBe(Math.round(z * 2));
      const tiles = w / (32 * z);
      // "~11 a 13": quando nenhum meio-inteiro cai na faixa (430 px), fica o mais perto
      expect(tiles).toBeGreaterThanOrEqual(10.5);
      expect(tiles).toBeLessThanOrEqual(13.5);
    }
  });
});

describe('hudLayout', () => {
  const overlaps = (a: Circle, b: Circle) => Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r;
  for (const [W, H] of [
    [360, 740],
    [390, 844],
    [430, 932],
    [768, 1024],
  ] as const) {
    it(`botões grandes, na tela, sem se encostar e na metade direita (${W}x${H})`, () => {
      const L = hudLayout(W, H, 20);
      const all = [L.b1, L.b2, L.b3, L.especial, L.item, L.auto, L.falar];
      for (const c of [L.b1, L.b2, L.b3, L.especial, L.item, L.falar]) expect(c.r * 2).toBeGreaterThanOrEqual(BUTTON_MIN_PX);
      expect(L.especial.r).toBeGreaterThan(L.b1.r);
      for (const c of all) {
        expect(c.x - c.r).toBeGreaterThanOrEqual(W / 2);
        expect(c.x + c.r).toBeLessThanOrEqual(W);
        expect(c.y + c.r).toBeLessThanOrEqual(H - 20);
      }
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(overlaps(all[i]!, all[j]!)).toBe(false);
      expect(hitCircle(L.especial, L.especial.x + L.especial.r + 3, L.especial.y)).toBe(true);
    });
  }
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
