/**
 * story_flags da Fase 5: a expedição nas Galerias (entrar_masmorra e vencer_andar) anda com a run
 * e liga galerias_bomba_desarmada ao vencer o 5º andar.
 */
import { describe, expect, it } from 'vitest';
import { acceptMission, advanceFloor, claimRunRewards, createDungeonRun, hasFlag, newPlayerRecord, setFlag, type PlayerRecord } from '../src/game';

function rec(id: string): PlayerRecord {
  const r = newPlayerRecord(id, id);
  r.criado = true;
  r.stage = 'margem';
  r.side = 'esquerda';
  r.institution = 'brigada_popular';
  r.class = 'combatente';
  r.archetype = 'peao_brabo';
  r.level = 14;
  setFlag(r, 'entrou_instituicao');
  setFlag(r, 'margem_esquerda');
  return r;
}

describe('story_flags da Fase 5: expedição nas Galerias', () => {
  it('entrar conta; só vencer o 5º conclui a missão e liga galerias_bomba_desarmada', () => {
    const a = rec('a');
    expect(acceptMission(a, 'expedicao_galerias_esquerda').ok).toBe(true);

    // run curta: entrou e venceu o 1º andar; a missão anda, mas não acaba
    const curta = createDungeonRun({ id: 'r1', seed: 5, grupo: [{ playerId: 'a', papel: 'jogador' }, { playerId: 'b', papel: 'jogador' }], now: 0 });
    if (!curta.ok) throw new Error('run');
    advanceFloor(curta.run);
    const r1 = claimRunRewards(a, curta.run);
    expect(r1.avancos.some((x) => x.missao === 'expedicao_galerias_esquerda' && x.objetivo === 0)).toBe(true);
    expect(a.missions.ativas).toContain('expedicao_galerias_esquerda');
    expect(hasFlag(a, 'galerias_bomba_desarmada')).toBe(false);

    // run até o chefe do 5º
    const funda = createDungeonRun({ id: 'r2', seed: 6, grupo: [{ playerId: 'a', papel: 'jogador' }, { playerId: 'b', papel: 'jogador' }], now: 10 });
    if (!funda.ok) throw new Error('run');
    for (let i = 0; i < 5; i++) advanceFloor(funda.run, { primeiraVez: true });
    claimRunRewards(a, funda.run);
    expect(a.missions.concluidas).toContain('expedicao_galerias_esquerda');
    expect(hasFlag(a, 'galerias_bomba_desarmada')).toBe(true);
  });

  it('a masmorra de outra id não conta', () => {
    const a = rec('a');
    acceptMission(a, 'expedicao_galerias_esquerda');
    const run = createDungeonRun({ id: 'r', seed: 1, grupo: [{ playerId: 'a', papel: 'jogador' }], now: 0 });
    if (!run.ok) throw new Error('run');
    run.run.dungeonId = 'outra_masmorra';
    const r = claimRunRewards(a, run.run);
    expect(r.avancos).toEqual([]);
  });
});
