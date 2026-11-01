/**
 * Sonda de balanceamento: roda lutas de A contra B e soma, por lado, o dano de cada habilidade,
 * a cura, os escudos e quantas vezes cada botão saiu. Serve para achar a causa de um par torto
 * (alcance, dano por segundo, cura, escudo, provocação).
 *
 *   npx tsx packages/sim/src/probe.ts peao_brabo idol 10
 */
import { createRng } from '@pqp/shared/sim';
import { step } from '@pqp/shared/sim';
import { setupMatch, MATCH_DEFAULTS } from './match';
import { readFileSync } from 'node:fs';
import { makeTuner, type TuneState } from './tune';

export interface ProbeSide {
  id: string;
  wins: number;
  damage: Record<string, number>;
  casts: Record<string, number>;
  heal: number;
  shield: number;
  firstHitTick: number[];
}

export function probe(a: string, b: string, n: number, seed = 1): { a: ProbeSide; b: ProbeSide; avgSeconds: number } {
  const mk = (id: string): ProbeSide => ({ id, wins: 0, damage: {}, casts: {}, heal: 0, shield: 0, firstHitTick: [] });
  const sa = mk(a), sb = mk(b);
  const rng = createRng(seed);
  let secs = 0;
  for (let k = 0; k < n; k++) {
    const { w, A, B } = setupMatch({ a: a.split(','), b: b.split(','), seed: rng.int(1, 1e9), swap: k % 2 === 1 });
    const side = new Map<number, ProbeSide>();
    for (const e of A) side.set(e.id, sa);
    for (const e of B) side.set(e.id, sb);
    const of = (id: number) => side.get(id) ?? side.get(w.entities.get(id)?.ownerId ?? -1);
    const first = new Map<ProbeSide, number>();
    const max = MATCH_DEFAULTS.maxSeconds * 20;
    const up = (e: (typeof A)[number]) => !e.dead && e.downedUntil === undefined;
    while (w.tick < max) {
      for (const ev of step(w)) {
        if (ev.t === 'hit') {
          const s = of(ev.src);
          if (!s) continue;
          const key = ev.ability ?? '?';
          s.damage[key] = (s.damage[key] ?? 0) + ev.amount;
          if (!first.has(s)) first.set(s, w.tick);
        } else if (ev.t === 'cast') {
          const s = of(ev.src);
          if (s) s.casts[ev.ability] = (s.casts[ev.ability] ?? 0) + 1;
        } else if (ev.t === 'heal') {
          const s = of(ev.src);
          if (s) s.heal += ev.amount;
        } else if (ev.t === 'shield') {
          const s = of(ev.src);
          if (s) s.shield += ev.amount;
        }
      }
      if (!A.some(up) || !B.some(up)) break;
    }
    if (A.some(up) && !B.some(up)) sa.wins++;
    else if (B.some(up) && !A.some(up)) sb.wins++;
    secs += w.tick / 20;
    for (const [s, t] of first) s.firstHitTick.push(t);
  }
  return { a: sa, b: sb, avgSeconds: secs / n };
}

const isMain = typeof process !== 'undefined' && process.argv[1] && /probe\.ts$/.test(process.argv[1]);
if (isMain) {
  const [a, b, nStr, stateFile] = process.argv.slice(2);
  if (stateFile) {
    const s = JSON.parse(readFileSync(stateFile, 'utf8').replace(/^﻿/, '')) as TuneState;
    makeTuner().apply({ P: s.P ?? {}, Qs: s.Qs ?? {}, Qg: s.Qg ?? {}, R: s.R ?? {}, V: s.V ?? {} });
  }
  const r = probe(a!, b!, Number(nStr ?? 10));
  const n = Number(nStr ?? 10);
  const show = (s: ProbeSide) => {
    const tot = Object.values(s.damage).reduce((x, y) => x + y, 0);
    const avgFirst = s.firstHitTick.length ? s.firstHitTick.reduce((x, y) => x + y, 0) / s.firstHitTick.length / 20 : NaN;
    console.log(`${s.id}: vitórias ${s.wins}/${n}, dano/luta ${(tot / n).toFixed(0)}, dps ${(tot / n / r.avgSeconds).toFixed(1)}, cura/luta ${(s.heal / n).toFixed(0)}, escudo/luta ${(s.shield / n).toFixed(0)}, 1º acerto ${avgFirst.toFixed(2)}s`);
    for (const [k, v] of Object.entries(s.damage).sort((p, q) => q[1] - p[1])) console.log(`   dano ${k}: ${(v / n).toFixed(0)}`);
    console.log(`   lances: ${Object.entries(s.casts).map(([k, v]) => `${k} ${(v / n).toFixed(1)}`).join(', ')}`);
  };
  console.log(`luta média ${r.avgSeconds.toFixed(1)} s`);
  show(r.a);
  show(r.b);
}
