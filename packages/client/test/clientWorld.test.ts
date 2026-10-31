/** Estado do mundo no cliente: snapshots fora de ordem, info perdida, 'gone' perdido. */
import { describe, expect, it } from 'vitest';
import type { EntSnap, HudSnap, S2C_Snapshot } from '@pqp/shared/net';
import { ClientWorld, STALE_TICKS } from '../src/game/clientWorld';

const hud: HudSnap = { hp: 10, hpMax: 10, shield: 0, res: 0, resMax: 0, special: 0, cd: [0, 0, 0, 0, 0], gcd: 0, ab: ['', '', '', ''], itemCount: 0, xp: 0, xpNext: 10, level: 1, auto: false, mv: 4, canMove: true };
const ent = (i: number, x: number, extra: Partial<EntSnap> = {}): EntSnap => ({ i, k: 'e', x: x * 100, y: 500, f: 0, h: 1000, fl: 0, ...extra });
const snap = (t: number, ents: EntSnap[], extra: Partial<S2C_Snapshot> = {}): S2C_Snapshot => ({ t, ack: t, cack: 0, ents, tel: [], zones: [], ev: [], hud, ...extra });

describe('ClientWorld', () => {
  it('ignora snapshot velho e conta buracos', () => {
    const w = new ClientWorld();
    w.applyWelcome({ you: 1, mapId: 'm', tick: 0, tickRate: 20, protocol: 1 });
    expect(w.applySnapshot(snap(10, [ent(2, 1, { d: 'siri_do_mangue', n: 'Siri' })]))).toBe(true);
    expect(w.applySnapshot(snap(9, []))).toBe(false);
    expect(w.applySnapshot(snap(12, [ent(2, 2)]))).toBe(true);
    expect(w.stats.gaps).toBe(1);
    const e = w.ents.get(2)!;
    expect(e.defId).toBe('siri_do_mangue');
    expect(e.x).toBeCloseTo(2);
    expect(e.buf.length).toBe(2);
  });

  it('pede info quando o snapshot com d se perdeu, e para de pedir depois', () => {
    const w = new ClientWorld();
    w.applyWelcome({ you: 1, mapId: 'm', tick: 0, tickRate: 20, protocol: 1 });
    w.applySnapshot(snap(1, [ent(5, 1)]));
    expect(w.needList()).toEqual([5]);
    w.applyInfo([ent(5, 1, { d: 'capanga_do_capataz', n: 'Capanga', lv: 3 })]);
    expect(w.needList()).toEqual([]);
    expect(w.ents.get(5)!.lv).toBe(3);
  });

  it('remove por gone e por sumiço (gone perdido)', () => {
    const w = new ClientWorld();
    w.applyWelcome({ you: 1, mapId: 'm', tick: 0, tickRate: 20, protocol: 1 });
    w.applySnapshot(snap(1, [ent(2, 1, { d: 'a' }), ent(3, 1, { d: 'b' })]));
    w.applySnapshot(snap(2, [ent(3, 1)], { gone: [2] }));
    expect(w.ents.has(2)).toBe(false);
    w.applySnapshot(snap(3 + STALE_TICKS, []));
    expect(w.ents.has(3)).toBe(false);
  });

  it('eventos ficam na fila até alguém ler', () => {
    const w = new ClientWorld();
    w.applyWelcome({ you: 1, mapId: 'm', tick: 0, tickRate: 20, protocol: 1 });
    w.applySnapshot(snap(1, [], { ev: [{ t: 'say', src: 2, text: 'oi' }] }));
    expect(w.drainEvents().length).toBe(1);
    expect(w.drainEvents().length).toBe(0);
  });
});
