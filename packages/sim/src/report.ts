/** Relatório do simulador em texto (português, números com vírgula). */
import type { PairRow, TournamentReport } from './tournament';

const num = (v: number, d = 1) => v.toFixed(d).replace('.', ',');
const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const lpad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);

const MODO_NOME = { um_contra_um: '1 contra 1', grupo_contra_grupo: 'grupo contra grupo' } as const;

export function formatReport(r: TournamentReport): string {
  const out: string[] = [];
  out.push(`Simulador de balanceamento: ${MODO_NOME[r.modo]}, nível ${r.level}, semente ${r.seed}`);
  out.push(`${r.games} lutas (${r.modo === 'um_contra_um' ? `${r.n} por par` : `${r.n} sorteadas`}), ${r.draws} empates (${num(r.games ? (r.draws / r.games) * 100 : 0)}%), luta média de ${num(r.avgSeconds)} s`);
  out.push('');
  out.push(`${pad('arquétipo', 24)}${pad('papel', 9)}${pad('classe', 11)}${lpad('lutas', 7)}${lpad('vitórias', 10)}${lpad('empates', 9)}${lpad('% média', 9)}${lpad('tempo', 8)}`);
  for (const x of r.rows) {
    out.push(
      `${pad(x.id, 24)}${pad(x.papel, 9)}${pad(x.classe, 11)}${lpad(String(x.games), 7)}${lpad(String(x.wins), 10)}${lpad(String(x.draws), 9)}${lpad(num(x.winPct) + '%', 9)}${lpad(num(x.avgSeconds) + 's', 8)}${x.alert ? '  << ALERTA' : ''}`,
    );
  }
  if (r.roles && r.roles.length > 0) {
    out.push('');
    out.push('Grupos de papel único contra grupos misturados:');
    for (const x of r.roles) out.push(`  só ${pad(x.papel, 10)} ${lpad(String(x.games), 5)} lutas  ${lpad(num(x.winPct) + '%', 7)}${x.alert ? '  << ALERTA' : ''}`);
  }
  out.push('');
  if (r.alerts.length === 0) out.push(`Nenhum arquétipo acima de ${r.limitPct}% contra a média.`);
  else for (const a of r.alerts) out.push(`ALERTA: ${a}`);
  return out.join('\n');
}

export function formatSeries(p: PairRow): string {
  return [
    `${p.a} contra ${p.b}: ${p.games} lutas`,
    `  ${p.a}: ${p.winsA} vitórias | ${p.b}: ${p.winsB} vitórias | empates: ${p.draws}`,
    `  ${p.a} vence ${num(p.pctA)}% (empate vale meia); luta média de ${num(p.avgSeconds)} s`,
  ].join('\n');
}
