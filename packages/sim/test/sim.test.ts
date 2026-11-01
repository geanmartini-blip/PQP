import { describe, expect, it } from 'vitest';
import { parseArgs, runMatch, runSeries, runTournament, formatReport, setupMatch, referenceLevel } from '../src';

describe('runMatch', () => {
  it('é determinístico com a mesma semente', () => {
    const cfg = { a: ['peao_brabo'], b: ['idol'], seed: 42 };
    const r1 = runMatch(cfg);
    const r2 = runMatch(cfg);
    expect(r2).toEqual(r1);
    expect(r1.winner).not.toBe('empate');
    expect(r1.damageA + r1.damageB).toBeGreaterThan(0);
  });

  it('monta a luta no nível de referência, no automático, em times opostos', () => {
    const { w, A, B } = setupMatch({ a: ['cowboy_cromado'], b: ['iogue_furioso', 'idol'], seed: 1 });
    expect(A).toHaveLength(1);
    expect(B).toHaveLength(2);
    for (const e of [...A, ...B]) {
      expect(e.level).toBe(referenceLevel());
      expect(e.auto).toBe(true);
      expect(e.loadout?.itemCount).toBe(0);
    }
    expect(A[0]!.team).not.toBe(B[0]!.team);
    expect(new Set(B.map((e) => e.partyId)).size).toBe(1);
    expect(w.tick).toBe(0);
  });

  it('sorteia o começo pela semente: vida de 60 a 100%, botões em recarga; jitter false volta ao começo limpo', () => {
    const { A, B, w } = setupMatch({ a: ['babushka'], b: ['tropa_de_choque'], seed: 7 });
    for (const e of [...A, ...B]) {
      expect(e.hp / e.stats.hpMax).toBeGreaterThanOrEqual(0.6 - 1e-9);
      expect(e.hp / e.stats.hpMax).toBeLessThanOrEqual(1);
      const ids = [e.loadout!.b1, e.loadout!.b2, e.loadout!.b3].filter(Boolean);
      for (const id of ids) expect(e.cooldowns[id] ?? 0).toBeGreaterThanOrEqual(w.tick);
    }
    expect(setupMatch({ a: ['babushka'], b: ['tropa_de_choque'], seed: 7 }).A[0]!.hp).toBe(A[0]!.hp);
    const limpo = setupMatch({ a: ['babushka'], b: ['tropa_de_choque'], seed: 7, jitter: false });
    expect(limpo.A[0]!.hp).toBe(limpo.A[0]!.stats.hpMax);
  });

  it('grupo contra grupo termina com um vencedor e respeita o tempo máximo', () => {
    const r = runMatch({ a: ['peao_brabo', 'curandeira_dos_andes', 'cowboy_cromado'], b: ['sumo_cibernetico', 'coach_de_bem_estar', 'arqueiro_das_estepes'], seed: 3 });
    expect(['a', 'b', 'empate']).toContain(r.winner);
    expect(r.seconds).toBeLessThanOrEqual(120);
    const curto = runMatch({ a: ['peao_brabo'], b: ['sumo_cibernetico'], seed: 3, maxSeconds: 1 });
    expect(curto.winner).toBe('empate');
    expect(curto.ticks).toBe(20);
  });
});

describe('torneio', () => {
  it('um contra um pequeno roda e soma certo', () => {
    const ids = ['peao_brabo', 'idol', 'cowboy_cromado'];
    const rep = runTournament({ modo: 'um_contra_um', n: 2, archetypes: ids, seed: 5 });
    expect(rep.games).toBe(3 * 2);
    expect(rep.pairs).toHaveLength(3);
    expect(rep.rows).toHaveLength(3);
    for (const r of rep.rows) {
      expect(r.games).toBe(4);
      expect(r.wins + r.losses + r.draws).toBe(r.games);
      expect(r.alert).toBe(r.winPct > rep.limitPct);
    }
    expect(rep.limitPct).toBe(55);
    // soma das vitórias = lutas decididas
    expect(rep.rows.reduce((s, r) => s + r.wins, 0)).toBe(rep.games - rep.draws);
    // mesma semente, mesmo relatório
    expect(runTournament({ modo: 'um_contra_um', n: 2, archetypes: ids, seed: 5 })).toEqual(rep);
    const txt = formatReport(rep);
    expect(txt).toContain('1 contra 1');
    expect(txt).toContain('peao_brabo');
  });

  it('grupo contra grupo pequeno roda, com grupos de papel único', () => {
    const rep = runTournament({ modo: 'grupo_contra_grupo', n: 4, groupSize: 2, seed: 9, roleMatches: 2 });
    expect(rep.games).toBe(4);
    expect(rep.roles?.map((r) => r.papel)).toEqual(['tanque', 'dano']);
    for (const r of rep.roles!) expect(r.games).toBe(2);
    expect(rep.rows).toHaveLength(24);
  });

  it('série de um par troca de lado e é reproduzível', () => {
    const s1 = runSeries('peao_brabo', 'idol', 4, { seed: 2 });
    const s2 = runSeries('peao_brabo', 'idol', 4, { seed: 2 });
    expect(s1).toEqual(s2);
    expect(s1.winsA + s1.winsB + s1.draws).toBe(4);
  });
});

describe('critério de pronto: nenhum arquétipo acima de 55% contra a média', () => {
  /**
   * Com n pequeno a taxa de cada arquétipo tem ruído de amostra (erro padrão √(p(1−p)/lutas)):
   * a trava rápida aceita o limite mais 2 erros padrão, para pegar arquétipo forte de verdade
   * sem falhar por sorteio. A conferência cheia (limite seco, n grande) é a de PQP_BALANCO=1.
   */
  const limite = (lutas: number, limitPct: number) => limitPct + 2 * 100 * Math.sqrt(0.25 / Math.max(1, lutas));
  const acima = (rows: { id: string; winPct: number; games: number }[], limitPct: number) =>
    rows.filter((r) => r.winPct > limite(r.games, limitPct)).map((r) => `${r.id} ${r.winPct}% em ${r.games} lutas`);

  it('trava: 1 contra 1 e grupo contra grupo sem arquétipo nem papel acima de 55% (n pequeno, semente fixa)', () => {
    const r1 = runTournament({ modo: 'um_contra_um', n: 4, seed: 3 });
    expect(r1.games).toBe(((24 * 23) / 2) * 4);
    expect(acima(r1.rows, r1.limitPct)).toEqual([]);
    const rg = runTournament({ modo: 'grupo_contra_grupo', n: 120, seed: 3, roleMatches: 24 });
    expect(acima(rg.rows, rg.limitPct)).toEqual([]);
    expect(acima((rg.roles ?? []).map((r) => ({ id: r.papel, winPct: r.winPct, games: r.games })), rg.limitPct)).toEqual([]);
    expect(r1.alerts.length).toBe(r1.rows.filter((r) => r.alert).length);
  }, 20000);

  // conferência cheia, com o limite seco: PQP_BALANCO=1 npx vitest run packages/sim (alguns minutos)
  it.runIf(process.env['PQP_BALANCO'] === '1')(
    'o torneio de 1 contra 1 e o de grupo não têm alertas (n grande)',
    () => {
      const r1 = runTournament({ modo: 'um_contra_um', n: 20, seed: 3 });
      const rg = runTournament({ modo: 'grupo_contra_grupo', n: 4000, seed: 3 });
      expect([...r1.alerts, ...rg.alerts]).toEqual([]);
    },
    1800000,
  );

  it('carga inicial do Especial (specialStart) para o Especial pesar nas lutas curtas', () => {
    const { A, B } = setupMatch({ a: ['peao_brabo'], b: ['idol'], seed: 1, specialStart: 1 });
    expect(A[0]!.special).toBe(1);
    expect(B[0]!.special).toBe(1);
    expect(setupMatch({ a: ['peao_brabo'], b: ['idol'], seed: 1 }).A[0]!.special).toBe(0);
    expect(parseArgs(['--especial', '1'])).toEqual({ especial: 1 });
    expect(() => parseArgs(['--especial', '2'])).toThrow();
  });
});

describe('argumentos', () => {
  it('lê as opções normais', () => {
    expect(parseArgs(['--modo', '1v1', '--n', '500', '--a', 'peao_brabo', '--b', 'idol'])).toEqual({ modo: 'um_contra_um', n: 500, a: 'peao_brabo', b: 'idol' });
    expect(parseArgs(['--todos', '--n=200'])).toEqual({ todos: true, n: 200 });
    expect(() => parseArgs(['--a', 'nao_existe'])).toThrow();
  });

  it('lê os valores soltos que o npm repassa sem "--"', () => {
    // npm run sim -- --modo 1v1 --n 500 --a peao_brabo --b idol, pela raiz
    expect(parseArgs(['1v1', '500', 'peao_brabo', 'idol'], { npm_config_modo: 'true', npm_config_b: 'true' })).toEqual({ modo: 'um_contra_um', n: 500, a: 'peao_brabo', b: 'idol' });
    // npm run sim -- --todos --n 200, pela raiz
    expect(parseArgs(['200'], { npm_config_todos: 'true' })).toEqual({ n: 200, todos: true });
  });
});
