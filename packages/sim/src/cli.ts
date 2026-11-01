/**
 * Simulador de balanceamento na linha de comando (opções em args.ts).
 *
 *   npm run sim -- --modo 1v1 --n 500 --a peao_brabo --b idol
 *   npm run sim -- --todos --n 200
 *   npm run sim -w @pqp/sim -- --modo grupo --n 300 --grupo 4 --seed 7 --json
 *
 * Com --a e --b: série de n lutas desse par. Com --todos: todos os arquétipos nos modos de
 * balance.calibracao.modos (1 contra 1 com n lutas por par; grupo contra grupo com n lutas).
 */
import { getData } from '@pqp/shared';
import { parseArgs } from './args';
import { formatReport, formatSeries } from './report';
import { allArchetypes, runSeries, runTournament, type Modo, type TournamentConfig, type TournamentReport } from './tournament';

function progress(label: string) {
  let last = -1;
  return (done: number, total: number) => {
    const pct = Math.floor((done / total) * 100);
    if (pct === last || (pct % 5 !== 0 && done !== total)) return;
    last = pct;
    process.stderr.write(`\r${label}: ${done}/${total} lutas (${pct}%)${done === total ? '\n' : ''}`);
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2), process.env);
  const n = args.n ?? 100;
  const base = {
    ...(args.seed !== undefined ? { seed: args.seed } : {}),
    ...(args.nivel !== undefined ? { level: args.nivel } : {}),
    ...(args.tempo !== undefined ? { maxSeconds: args.tempo } : {}),
    ...(args.distancia !== undefined ? { distance: args.distancia } : {}),
    ...(args.especial !== undefined ? { specialStart: args.especial } : {}),
  };
  if (args.a && args.b && !args.todos && !args.arquetipos) {
    const row = runSeries(args.a, args.b, n, base);
    console.log(args.json ? JSON.stringify(row, null, 2) : formatSeries(row));
    return;
  }
  const modos: Modo[] = args.modo ? [args.modo] : args.todos ? [...getData().balance.calibracao.modos] : ['um_contra_um'];
  const archetypes = args.arquetipos ?? allArchetypes();
  const reports: TournamentReport[] = [];
  for (const modo of modos) {
    const cfg: TournamentConfig = {
      modo,
      n,
      archetypes,
      ...base,
      ...(args.grupo !== undefined ? { groupSize: args.grupo } : {}),
      onProgress: progress(modo === 'um_contra_um' ? '1 contra 1' : 'grupo contra grupo'),
    };
    const rep = runTournament(cfg);
    reports.push(rep);
    if (!args.json) console.log(formatReport(rep) + '\n');
  }
  // alerta é aviso, não erro: a saída continua 0 (o teste de regressão do torneio é que trava)
  if (args.json) console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
}

try {
  main();
} catch (err) {
  console.error(`erro: ${(err as Error).message}`);
  process.exitCode = 1;
}
