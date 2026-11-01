/**
 * Entradas hostis ou velhas não derrubam o mundo: Doutrina com carta desconhecida (que travava o
 * step de todo mundo), cartas gravadas no Store antes da validação, e campos d/n/lk/lv que não se
 * repetem em todo tick enquanto o cliente não confirma.
 */
import { describe, expect, it } from 'vitest';
import type { PlayerCommand } from '@pqp/shared/sim';
import { defaultAppearance } from '@pqp/shared/game/appearance';
import { createCharacter } from '@pqp/shared/game/travessia';
import { GameServerCore } from '../src/core';
import { sanitizeDoctrine, sanitizeDoctrineCard } from '../src/doctrine_guard';
import { MemoryStore } from '../src/persistence/store';

describe('Doutrina validada no servidor', () => {
  it('carta com faca desconhecida não trava o mundo: o outro jogador continua andando', () => {
    const errs: string[] = [];
    const core = new GameServerCore({ content: false, log: (m) => errs.push(m) });
    core.addClient('a', { token: 'tok-doutrina-aaaa' });
    core.addClient('b', { token: 'tok-doutrina-bbbb' });
    const a = core.entityOf('a')!;
    const b = core.entityOf('b')!;
    const bad = [
      { se: { t: 'sempre' }, faca: { t: 'dancar' } },
      { se: { t: 'inventada' }, faca: { t: 'fugir' } },
      { se: { t: 'minha_vida_abaixo', pct: 'muito' }, faca: { t: 'fugir' } },
      { se: { t: 'sempre' }, faca: { t: 'usar_botao', botao: 7 } },
    ];
    core.onInput('a', { inputs: [{ seq: 0, mx: 0, my: 0 }], cmds: [{ id: 1, c: 'doutrina', cards: bad } as unknown as PlayerCommand, { id: 2, c: 'auto', on: true }], ackTick: 0, rtt: 0 });
    const x0 = b.x;
    let snaps = 0;
    for (let t = 0; t < 20; t++) {
      core.onInput('b', { inputs: [{ seq: t, mx: 127, my: 0 }], cmds: [], ackTick: 0, rtt: 0 });
      snaps += core.tick().size;
    }
    expect(a.auto).toBe(true);
    expect(a.doctrine).toEqual([]);
    expect(b.x - x0).toBeGreaterThan(2);
    expect(snaps).toBe(40);
    expect(errs.filter((m) => m.includes('falhou'))).toEqual([]);
  });

  it('cartas boas passam reconstruídas (campos extras somem) e o máximo é 5', () => {
    const good = { se: { t: 'inimigos_perto_min', n: 2, raio: 3, lixo: 1 }, faca: { t: 'usar_botao', botao: 2, extra: 'x' } };
    expect(sanitizeDoctrineCard(good)).toEqual({ se: { t: 'inimigos_perto_min', n: 2, raio: 3 }, faca: { t: 'usar_botao', botao: 2 } });
    expect(sanitizeDoctrineCard({ se: { t: 'minha_vida_abaixo', pct: 25 }, faca: { t: 'fugir' } })).toEqual({ se: { t: 'minha_vida_abaixo', pct: 25 }, faca: { t: 'fugir' } });
    expect(sanitizeDoctrineCard({ se: { t: 'minha_vida_abaixo', pct: Infinity }, faca: { t: 'fugir' } })).toBeNull();
    expect(sanitizeDoctrineCard({ se: { t: 'inimigos_perto_min', n: 1.5, raio: 3 }, faca: { t: 'fugir' } })).toBeNull();
    expect(sanitizeDoctrineCard(null)).toBeNull();
    const many = Array.from({ length: 9 }, () => ({ se: { t: 'sempre' }, faca: { t: 'focar_mais_perto' } }));
    expect(sanitizeDoctrine(many).length).toBe(5);
    expect(sanitizeDoctrine('nada')).toEqual([]);
  });

  it('Doutrina ruim gravada no Store (de antes da validação) é limpa ao nascer', async () => {
    const store = new MemoryStore();
    const rec = await store.getOrCreatePlayer('tok-registro-velho', 'Seu Zé');
    expect(createCharacter(rec.data, 'Seu Zé', defaultAppearance()).ok).toBe(true);
    rec.data.doctrine = [{ se: { t: 'sempre' }, faca: { t: 'dancar' } }, { se: { t: 'especial_pronto' }, faca: { t: 'usar_especial' } }] as never;
    rec.data.auto = true;
    await store.savePlayer(rec);
    // o Store só vale fora da sala do protótipo: o personagem criado entra no Delta
    const core = new GameServerCore({ mapId: 'delta', content: false, jaco: false, log: () => undefined, store });
    await core.join('s', { token: 'tok-registro-velho' });
    const e = core.entityOf('s')!;
    expect(e.doctrine).toEqual([{ se: { t: 'especial_pronto' }, faca: { t: 'usar_especial' } }]);
    for (let t = 0; t < 10; t++) core.tick();
    expect(e.auto).toBe(true);
  });
});

describe('banda: d/n/lk/lv até o ack', () => {
  it('sem ack, os campos se repetem a cada 4 ticks, não em todo tick', () => {
    const core = new GameServerCore({ content: true, log: () => undefined });
    core.addClient('a', { token: 'tok-banda-000001' });
    const wesley = Array.from(core.world.entities.values()).find((e) => e.defId === 'wesley')!;
    const withD: number[] = [];
    for (let t = 0; t < 13; t++) {
      core.onInput('a', { inputs: [{ seq: t, mx: 0, my: 0 }], cmds: [], ackTick: 0, rtt: 0 });
      const s = core.tick().get('a')!;
      if (s.ents.find((e) => e.i === wesley.id)?.d !== undefined) withD.push(t);
    }
    expect(withD).toEqual([0, 4, 8, 12]);
    // com o ack do primeiro, param de vez
    const s0 = core.world.tick;
    core.onInput('a', { inputs: [{ seq: 13, mx: 0, my: 0 }], cmds: [], ackTick: s0, rtt: 0 });
    for (let t = 0; t < 8; t++) {
      const s = core.tick().get('a')!;
      expect(s.ents.find((e) => e.i === wesley.id)?.d).toBeUndefined();
    }
  });
});
