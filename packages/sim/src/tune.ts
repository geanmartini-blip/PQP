/**
 * Afinador do balanceamento (ferramenta de calibração, não roda no jogo). Mexe nos dados em
 * memória e roda os torneios até cada arquétipo ficar perto de 50% contra a média:
 * - P (por par Esquerda/Direita, que divide a mesma linha da tabela): multiplica Vida e Ataque;
 *   segue o erro do 1 contra 1 do par;
 * - Qs (por arquétipo): números de força das 2 habilidades marca que miram um só (alvo, si,
 *   aliado): mult, cura, escudo, reforço, marca, redução; segue a diferença dentro do par no 1 contra 1;
 * - Qg (por arquétipo): os mesmos números nos efeitos de área, de caminho e nas invocações (mais
 *   a vida delas e a provocação delas); segue o erro do grupo contra grupo.
 * A recarga de cada habilidade marca é dividida por √Q do seu tipo (entre 6 e 20 s).
 * Imprime os multiplicadores; quem passa para os JSON é a pessoa (com sugestaoCampos).
 *
 *   npx tsx packages/sim/src/tune.ts [iterações] [n por par] [semente] [estado.json]
 *   PQP_TUNE_GROUP_N=600 (lutas de grupo por iteração), PQP_TUNE_K=0.1 (ganho),
 *   PQP_TUNE_OUT=arquivo (salva o estado a cada iteração), PQP_TUNE_EVAL=1 (só avalia)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { getData } from '@pqp/shared';
import { runTournament } from './tournament';
import { formatReport } from './report';

type Num = Record<string, unknown>;

const POWER_KEYS = new Set(['mult', 'multPorTick', 'pctVidaMax', 'danoRecebidoPct', 'attackMult']);
const PCT_KINDS = new Set(['reforco', 'reducao_dano', 'devolver_dano']);
const GROUP_TARGETS = new Set(['inimigos_area', 'aliados_area', 'inimigos_caminho']);

interface Snap {
  obj: Num;
  key: string;
  orig: number;
  min?: number;
  cap?: number;
  group: boolean;
}

function collect(node: unknown, out: Snap[], inSummon: boolean, kind?: string): void {
  if (Array.isArray(node)) {
    for (const x of node) collect(x, out, inSummon, kind);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const o = node as Num;
  const k = typeof o['kind'] === 'string' ? (o['kind'] as string) : kind;
  // devolver dano rende com o número de atacantes: conta como grupo
  const group = inSummon || GROUP_TARGETS.has(o['target'] as string) || o['radius'] !== undefined || k === 'devolver_dano';
  for (const [key, v] of Object.entries(o)) {
    if (typeof v === 'number') {
      if (POWER_KEYS.has(key) && v > 0) out.push({ obj: o, key, orig: v, group });
      else if (key === 'pct' && k && PCT_KINDS.has(k) && v > 0) out.push({ obj: o, key, orig: v, cap: k === 'reducao_dano' ? 80 : 300, group });
      else if (key === 'pct' && k === 'lentidao' && v > 0) out.push({ obj: o, key, orig: v, cap: 70, group });
      else if (key === 'duracaoMs' && k === 'controle' && o['cc'] === 'provocar' && inSummon) out.push({ obj: o, key, orig: v, min: 500, cap: 4000, group: true });
    } else if (typeof v === 'object' && key !== 'visual') collect(v, out, inSummon, k);
  }
}

export interface TuneState {
  P: Record<string, number>;
  Qs: Record<string, number>;
  Qg: Record<string, number>;
  /** por par: pontos tirados da Defesa e postos no Ataque (não mexe no orçamento) */
  R?: Record<string, number>;
  /**
   * por par: Vida × V e Ataque ÷ V. No 1 contra 1 pesa menos (vida × ataque fica igual); no
   * grupo pesa mais (medido: V 1,4 no Cowboy tirou uns 13 pontos do 1 contra 1 e 16 do grupo).
   */
  V?: Record<string, number>;
}

export function makeTuner() {
  const D = getData();
  const B = D.balance.atributosArquetipo as Record<string, { vida: number; ataque: number; defesa: number; par: string }>;
  const origStat = Object.fromEntries(Object.entries(B).map(([id, s]) => [id, { vida: s.vida, ataque: s.ataque, defesa: s.defesa }]));
  const pairKey = (id: string) => [id, B[id]!.par].sort().join('+');
  const power = new Map<string, Snap[]>();
  const cds = new Map<string, { obj: Num; orig: number; group: boolean }[]>();
  for (const a of D.archetypes) {
    const snaps: Snap[] = [];
    const cd: { obj: Num; orig: number; group: boolean }[] = [];
    for (const abId of [a.habilidadesMarca.marca_1, a.habilidadesMarca.marca_2]) {
      const ab = D.abilities.get(abId) as unknown as Num;
      const mine: Snap[] = [];
      collect(ab['effects'], mine, false);
      let summon = false;
      for (const ef of ab['effects'] as Num[]) {
        if (ef['kind'] !== 'invocar') continue;
        const s = D.summonsById.get(ef['invocacao'] as string) as unknown as Num | undefined;
        if (!s) continue;
        summon = true;
        if ((s['attackMult'] as number) > 0) mine.push({ obj: s, key: 'attackMult', orig: s['attackMult'] as number, group: true });
        mine.push({ obj: s, key: 'hpPct', orig: s['hpPct'] as number, cap: 150, group: true });
        collect(s['effects'], mine, true);
      }
      snaps.push(...mine);
      cd.push({ obj: ab, orig: ab['cooldownS'] as number, group: summon || ab['type'] !== 'travada' && mine.some((x) => x.group) });
    }
    power.set(a.id, snaps);
    cds.set(a.id, cd);
  }
  const apply = (st: TuneState) => {
    for (const [id, s] of Object.entries(B)) {
      const p = st.P[pairKey(id)] ?? 1;
      const r = st.R?.[pairKey(id)] ?? 0;
      const v = st.V?.[pairKey(id)] ?? 1;
      s.vida = origStat[id]!.vida * p * v;
      s.ataque = (origStat[id]!.ataque * p) / v + r;
      s.defesa = origStat[id]!.defesa - r;
    }
    for (const [id, snaps] of power) {
      const qs = st.Qs[id] ?? 1, qg = st.Qg[id] ?? 1;
      for (const sn of snaps) sn.obj[sn.key] = Math.max(sn.min ?? 0, Math.min(sn.cap ?? Infinity, sn.orig * (sn.group ? qg : qs)));
      for (const c of cds.get(id)!) c.obj['cooldownS'] = Math.max(6, Math.min(20, c.orig / Math.sqrt(c.group ? qg : qs)));
    }
  };
  return { apply, pairKey, ids: D.archetypes.map((a) => a.id), B, power, cds, origStat };
}

const isMain = typeof process !== 'undefined' && process.argv[1] && /tune\.ts$/.test(process.argv[1]);
if (isMain) {
  const [itS, nS, seedS, initS] = process.argv.slice(2);
  const iters = Number(itS ?? 8), n = Number(nS ?? 6), seed = Number(seedS ?? 11);
  const t = makeTuner();
  const init = initS ? (JSON.parse(readFileSync(initS, 'utf8').replace(/^﻿/, '')) as Partial<TuneState> & { Q?: Record<string, number> }) : {};
  // estado antigo com um Q só vale para os dois
  const st: TuneState = { P: init.P ?? {}, Qs: init.Qs ?? { ...init.Q }, Qg: init.Qg ?? { ...init.Q }, R: init.R ?? {}, V: init.V ?? {} };
  const gN = Number(process.env['PQP_TUNE_GROUP_N'] ?? 600);
  if (process.env['PQP_TUNE_EVAL'] === '1') {
    t.apply(st);
    // experimento: PQP_TUNE_SET="ability:recarga.effects.1.pctVidaMax=0;summon:robo_geladeira.hpPct=1"
    for (const item of (process.env['PQP_TUNE_SET'] ?? '').split(';').filter(Boolean)) {
      const [lhs, val] = item.split('=');
      const [kind, rest] = lhs!.split(':');
      const [id, ...path] = rest!.split('.');
      const D0 = getData();
      let o = (kind === 'summon' ? D0.summonsById.get(id!) : kind === 'stat' ? D0.balance.atributosArquetipo[id!] : D0.abilities.get(id!)) as unknown as Num;
      for (const p of path.slice(0, -1)) o = o[p] as Num;
      o[path[path.length - 1]!] = Number(val);
    }
    const r1 = runTournament({ modo: 'um_contra_um', n, seed });
    const rg = runTournament({ modo: 'grupo_contra_grupo', n: gN, seed });
    console.log(formatReport(r1));
    console.log(formatReport(rg));
    process.exit(0);
  }
  const out = process.env['PQP_TUNE_OUT'];
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const fmt = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r3(v)]));
  const dump = () => JSON.stringify({ P: fmt(st.P), Qs: fmt(st.Qs), Qg: fmt(st.Qg), R: fmt(st.R ?? {}), V: fmt(st.V ?? {}) });
  const D = getData();
  // limites para o resultado continuar parecido com o doc (sem dano de 50 de vida e área ×3)
  const clampQ = (v: number) => Math.max(0.2, Math.min(2.5, v));
  const clampP = (v: number) => Math.max(0.45, Math.min(1.4, v));
  for (const m of [st.Qs, st.Qg]) for (const k of Object.keys(m)) m[k] = clampQ(m[k]!);
  for (const k of Object.keys(st.P)) st.P[k] = clampP(st.P[k]!);
  for (let it = 0; it < iters; it++) {
    t.apply(st);
    // semente fixa (PQP_TUNE_FIXED=1): o alvo vira determinístico e o afinador não anda atrás do ruído
    const sd = process.env['PQP_TUNE_FIXED'] === '1' ? seed : seed + it;
    const r1 = runTournament({ modo: 'um_contra_um', n, seed: sd });
    const rg = runTournament({ modo: 'grupo_contra_grupo', n: gN, seed: sd });
    const w1 = Object.fromEntries(r1.rows.map((r) => [r.id, r.winPct]));
    const wg = Object.fromEntries(rg.rows.map((r) => [r.id, r.winPct]));
    const roleErr = Object.fromEntries((rg.roles ?? []).map((r) => [r.papel, r.winPct - 50]));
    const row = (rows: { id: string; winPct: number }[]) => rows.map((r) => `${r.id.slice(0, 8)} ${r.winPct}`).join(', ');
    console.error(
      `iteração ${it}: 1v1 máx ${Math.max(...r1.rows.map((r) => r.winPct))} | grupo máx ${Math.max(...rg.rows.map((r) => r.winPct))} | papéis ${(rg.roles ?? []).map((r) => `${r.papel} ${r.winPct}`).join(' ')}\n  1v1: ${row(r1.rows)}\n  grupo: ${row(rg.rows)}`,
    );
    // a vitória contra a média é quase um degrau da força (no 1 contra 1 ganha quase sempre o mais forte): ganho pequeno
    const k = Number(process.env['PQP_TUNE_K'] ?? 0.1) / (1 + it * 0.08);
    const seen = new Set<string>();
    for (const id of t.ids) {
      const pk = t.pairKey(id);
      if (seen.has(pk)) continue;
      seen.add(pk);
      const other = t.B[id]!.par;
      const avg = (w1[id]! + w1[other]!) / 2;
      // só o teto importa: com um do par acima de 53%, o par desce pelo maior
      // sobe até o primeiro teto bater (1 contra 1 ou grupo, de qualquer um do par)
      const avgG = (wg[id]! + wg[other]!) / 2;
      const cap = Number(process.env['PQP_TUNE_CAP'] ?? 53);
      const ePair = Math.max(avg - 50, Math.max(w1[id]!, w1[other]!) - cap, Math.max(wg[id]!, wg[other]!) - cap, avgG - 50);
      st.P[pk] = clampP((st.P[pk] ?? 1) * Math.exp((-k * ePair) / 50));
      // grupo acima e 1 contra 1 abaixo: tira Defesa e põe Ataque (tanque aguenta grupo; dano decide duelo)
      const egPair = (wg[id]! + wg[other]! - 100) / 2;
      const def0 = Math.min(t.origStat[id]!.defesa, t.origStat[other]!.defesa);
      // medido: Vida↑/Ataque↓ derruba mais o grupo que o 1 contra 1; então 1 contra 1 alto e grupo baixo pede V menor
      st.V![pk] = Math.max(0.6, Math.min(1.6, (st.V![pk] ?? 1) * Math.exp((-Number(process.env['PQP_TUNE_VG'] ?? 0.3) * (avg - 50 - egPair)) / 50)));
      const rGain = Number(process.env['PQP_TUNE_R'] ?? 0); // 0 desliga (1 ponto de Ataque mexe demais no 1 contra 1)
      if (rGain > 0) st.R![pk] = Math.max(-6, Math.min(def0 - 3, (st.R![pk] ?? 0) + rGain * (egPair - (avg - 50))));
      for (const x of [id, other]) {
        st.Qs[x] = clampQ((st.Qs[x] ?? 1) * Math.exp((-1.2 * k * (w1[x]! - avg)) / 50));
        const eg = wg[x]! - 50 + 0.5 * (roleErr[D.archetypesById.get(x)!.papel] ?? 0);
        // o grupo dilui o peso de cada um (1 de 3): ganho maior
        // kit só de área ou invocação (Engenheira, Babushka...): a diferença do 1 contra 1 dentro do par também vai no Qg
        const singles = t.power.get(x)!.filter((s) => !s.group).length;
        const pairPart = (singles === 0 ? 1.2 : 0.5) * (w1[x]! - avg);
        st.Qg[x] = clampQ((st.Qg[x] ?? 1) * Math.exp((-k * (Number(process.env['PQP_TUNE_GG'] ?? 6) * eg + pairPart)) / 50));
      }
    }
    if (out) writeFileSync(out, dump());
  }
  console.log(dump());
}
