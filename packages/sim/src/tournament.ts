/**
 * Torneios para o balanceamento (balance.calibracao):
 * - um_contra_um: todos os pares de arquétipos (sem espelho), n lutas por par, trocando de lado;
 * - grupo_contra_grupo: n lutas entre grupos sorteados, mais grupos de papel único (só tanque,
 *   só dano...) contra grupos misturados.
 * Relatório: taxa de vitória de cada arquétipo contra a média (empate vale meia), tempo médio,
 * empates e alerta para quem passar de vitoriaMaxContraMediaPct (55%).
 */
import { getData } from '@pqp/shared';
import { createRng } from '@pqp/shared/sim';
import { runMatch, referenceLevel, type MatchResult } from './match';

export type Modo = 'um_contra_um' | 'grupo_contra_grupo';

export interface TournamentConfig {
  modo: Modo;
  /** um_contra_um: lutas por par; grupo_contra_grupo: lutas sorteadas no total */
  n: number;
  seed?: number;
  /** arquétipos em jogo (padrão: os 24) */
  archetypes?: readonly string[];
  level?: number;
  maxSeconds?: number;
  distance?: number;
  /** carga inicial do Especial de todos (0 a 1; padrão 0) */
  specialStart?: number;
  /** grupo_contra_grupo: tamanho dos grupos (padrão 3) */
  groupSize?: number;
  /** grupo_contra_grupo: lutas de cada papel único contra misturados (padrão: max(4, n/4)); 0 desliga */
  roleMatches?: number;
  onProgress?: (done: number, total: number) => void;
}

export interface ArchetypeRow {
  id: string;
  name: string;
  classe: string;
  papel: string;
  margem: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  /** vitória contra a média, em %: (vitórias + empates/2) ÷ lutas */
  winPct: number;
  avgSeconds: number;
  /** passou do limite de vitória contra a média */
  alert: boolean;
}

export interface PairRow {
  a: string;
  b: string;
  games: number;
  winsA: number;
  winsB: number;
  draws: number;
  /** vitória de A sobre B, em % (empate vale meia) */
  pctA: number;
  avgSeconds: number;
}

export interface RoleRow {
  papel: string;
  games: number;
  wins: number;
  draws: number;
  winPct: number;
  alert: boolean;
}

export interface TournamentReport {
  modo: Modo;
  n: number;
  seed: number;
  level: number;
  games: number;
  draws: number;
  avgSeconds: number;
  limitPct: number;
  rows: ArchetypeRow[];
  pairs?: PairRow[];
  roles?: RoleRow[];
  /** frases de alerta (ex.: "idol vence 57,1% contra a média (limite 55%)") */
  alerts: string[];
}

interface Acc {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  secs: number;
}
const acc = (): Acc => ({ games: 0, wins: 0, losses: 0, draws: 0, secs: 0 });

function record(a: Acc, won: boolean | 'empate', secs: number): void {
  a.games++;
  a.secs += secs;
  if (won === 'empate') a.draws++;
  else if (won) a.wins++;
  else a.losses++;
}

const pctOf = (a: { games: number; wins: number; draws: number }) => (a.games > 0 ? ((a.wins + a.draws / 2) / a.games) * 100 : 0);
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Semente estável de cada luta (sem Math.random). */
const mix = (...xs: number[]) => {
  let h = 2166136261 >>> 0;
  for (const x of xs) {
    h ^= x >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h >>> 13;
  }
  return h >>> 0;
};

export function allArchetypes(): string[] {
  return Array.from(getData().archetypesById.keys());
}

export type SeriesOpts = Pick<TournamentConfig, 'seed' | 'level' | 'maxSeconds' | 'distance' | 'specialStart'>;

/**
 * Série de n lutas de A contra B (1 contra 1), trocando de lado a cada luta. A semente de cada
 * luta sai de (seed, a, b, k), então a mesma série dá sempre o mesmo resultado.
 */
export function runSeries(a: string, b: string, n: number, opts: SeriesOpts = {}, onMatch?: (r: MatchResult) => void): PairRow {
  const seed = opts.seed ?? 1;
  const row: PairRow = { a, b, games: 0, winsA: 0, winsB: 0, draws: 0, pctA: 0, avgSeconds: 0 };
  let secs = 0;
  for (let k = 0; k < n; k++) {
    const r = runMatch({
      a: [a],
      b: [b],
      seed: mix(seed, hashId(a), hashId(b), k),
      swap: k % 2 === 1,
      ...(opts.level !== undefined ? { level: opts.level } : {}),
      ...(opts.maxSeconds !== undefined ? { maxSeconds: opts.maxSeconds } : {}),
      ...(opts.distance !== undefined ? { distance: opts.distance } : {}),
      ...(opts.specialStart !== undefined ? { specialStart: opts.specialStart } : {}),
    });
    row.games++;
    secs += r.seconds;
    if (r.winner === 'a') row.winsA++;
    else if (r.winner === 'b') row.winsB++;
    else row.draws++;
    onMatch?.(r);
  }
  row.pctA = r1(row.games > 0 ? ((row.winsA + row.draws / 2) / row.games) * 100 : 0);
  row.avgSeconds = r1(row.games > 0 ? secs / row.games : 0);
  return row;
}

function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Torneio puro (sem saída na tela). */
export function runTournament(cfg: TournamentConfig): TournamentReport {
  const D = getData();
  const ids = [...(cfg.archetypes ?? allArchetypes())];
  for (const id of ids) if (!D.archetypesById.has(id)) throw new Error(`arquétipo não existe: ${id}`);
  const seed = cfg.seed ?? 1;
  const level = cfg.level ?? referenceLevel();
  const limit = D.balance.calibracao.vitoriaMaxContraMediaPct;
  const per = new Map<string, Acc>(ids.map((id) => [id, acc()]));
  const total = acc();
  const common = {
    level,
    ...(cfg.maxSeconds !== undefined ? { maxSeconds: cfg.maxSeconds } : {}),
    ...(cfg.distance !== undefined ? { distance: cfg.distance } : {}),
    ...(cfg.specialStart !== undefined ? { specialStart: cfg.specialStart } : {}),
  };
  const report: TournamentReport = { modo: cfg.modo, n: cfg.n, seed, level, games: 0, draws: 0, avgSeconds: 0, limitPct: limit, rows: [], alerts: [] };

  if (cfg.modo === 'um_contra_um') {
    const pairs: [string, string][] = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i]!, ids[j]!]);
    const totalGames = pairs.length * cfg.n;
    let done = 0;
    report.pairs = [];
    for (const [a, b] of pairs) {
      const row = runSeries(a, b, cfg.n, { seed, ...common }, (r) => {
        tally(r, [a], [b], per, total);
        done++;
        if (cfg.onProgress && (done % 50 === 0 || done === totalGames)) cfg.onProgress(done, totalGames);
      });
      report.pairs.push(row);
    }
  } else {
    const size = Math.max(1, cfg.groupSize ?? 3);
    const rng = createRng(mix(seed, 0x9e3779b9));
    const pick = (pool: readonly string[]) => Array.from({ length: size }, () => pool[rng.int(0, pool.length - 1)]!);
    const roleN = cfg.roleMatches ?? Math.max(4, Math.floor(cfg.n / 4));
    const roleList = roleN > 0 ? D.balance.calibracao.gruposDePapelUnico : [];
    const totalGames = cfg.n + roleList.length * roleN;
    let done = 0;
    const tick = () => {
      done++;
      if (cfg.onProgress && (done % 10 === 0 || done === totalGames)) cfg.onProgress(done, totalGames);
    };
    for (let k = 0; k < cfg.n; k++) {
      const A = pick(ids), B = pick(ids);
      const r = runMatch({ a: A, b: B, seed: mix(seed, 7, k), swap: k % 2 === 1, ...common });
      tally(r, A, B, per, total);
      tick();
    }
    report.roles = [];
    for (const papel of roleList) {
      const pool = ids.filter((id) => D.archetypesById.get(id)!.papel === papel);
      const row = { papel, games: 0, wins: 0, draws: 0, winPct: 0, alert: false };
      if (pool.length === 0) continue;
      for (let k = 0; k < roleN; k++) {
        const mono = pick(pool), mixed = pick(ids);
        const monoIsA = k % 2 === 0;
        const r = runMatch({ a: monoIsA ? mono : mixed, b: monoIsA ? mixed : mono, seed: mix(seed, hashId(papel), k), swap: k % 4 >= 2, ...common });
        row.games++;
        if (r.winner === 'empate') row.draws++;
        else if ((r.winner === 'a') === monoIsA) row.wins++;
        tick();
      }
      row.winPct = r1(pctOf(row));
      row.alert = row.winPct > limit;
      report.roles.push(row);
    }
  }

  report.games = total.games;
  report.draws = total.draws;
  report.avgSeconds = r1(total.games > 0 ? total.secs / total.games : 0);
  report.rows = ids
    .map((id) => {
      const a = per.get(id)!;
      const def = D.archetypesById.get(id)!;
      const winPct = r1(pctOf(a));
      return {
        id,
        name: def.name,
        classe: def.classe,
        papel: def.papel,
        margem: def.margem,
        games: a.games,
        wins: a.wins,
        losses: a.losses,
        draws: a.draws,
        winPct,
        avgSeconds: r1(a.games > 0 ? a.secs / a.games : 0),
        alert: winPct > limit,
      };
    })
    .sort((p, q) => q.winPct - p.winPct || p.id.localeCompare(q.id));
  const fmt = (v: number) => v.toFixed(1).replace('.', ',');
  for (const r of report.rows) if (r.alert) report.alerts.push(`${r.id} vence ${fmt(r.winPct)}% contra a média (limite ${limit}%)`);
  for (const r of report.roles ?? []) if (r.alert) report.alerts.push(`grupo só de ${r.papel} vence ${fmt(r.winPct)}% contra grupos misturados (limite ${limit}%)`);
  return report;
}

/** Soma o resultado de uma luta em cada arquétipo (uma vez por time em que aparece). */
function tally(r: MatchResult, A: readonly string[], B: readonly string[], per: Map<string, Acc>, total: Acc): void {
  total.games++;
  total.secs += r.seconds;
  if (r.winner === 'empate') total.draws++;
  for (const id of new Set(A)) record(per.get(id)!, r.winner === 'empate' ? 'empate' : r.winner === 'a', r.seconds);
  for (const id of new Set(B)) record(per.get(id)!, r.winner === 'empate' ? 'empate' : r.winner === 'b', r.seconds);
}
