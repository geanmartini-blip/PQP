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
