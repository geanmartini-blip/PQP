/**
 * Servidor local (?offline=1): o objetivo "Toque num inimigo para trocar o alvo (0/2)" do Delta conta
 * os dois toques. Antes, o 2º comando 'alvo' era descartado (o controle já estava aprendido) e a
 * missão Briga no Mangue parava em 1/2, travando o tutorial.
 */
import { describe, expect, it } from 'vitest';
import { getData } from '@pqp/shared';
import { currentObjectives, onGameEvent, type GameEvent } from '@pqp/shared/game/index';
import { GAME_MSG, MSG } from '@pqp/shared/net';
import { LocalServer, type RecordStore } from '../src/net/localServer';

const D = getData();
const memStore = (): RecordStore => {
  const data = new Map<string, string>();
  return { load: (id) => (data.has(id) ? JSON.parse(data.get(id)!) : null), save: (id, rec) => void data.set(id, JSON.stringify(rec)) };
};
const times = (n: number, ev: GameEvent): GameEvent[] => Array.from({ length: n }, () => ev);

describe('servidor local: tutorial do alvo', () => {
  it('conta os 2 toques de trocar o alvo na Briga no Mangue', () => {
    const s = new LocalServer({ store: memStore(), noEnemies: true, encounters: false });
    s.receive(MSG.hello, { token: 'tok_tutorial_alvo', name: 'Zé' });
    s.receive(GAME_MSG.criarPersonagem, { name: 'Zé do Alvo', appearance: { ...D.appearance.padrao, details: [] } });
    const rec = s.rec!;
    // mesmo caminho do teste de regras até a Briga no Mangue
    const evs: GameEvent[] = [
      { t: 'talk', npcId: 'seu_jaco' },
      { t: 'control', controle: 'andar_joystick' },
      { t: 'control', controle: 'tocar_no_chao' },
      { t: 'arrive', placeId: 'palafitas_do_delta' },
      { t: 'arrive', placeId: 'cais_do_delta' },
      { t: 'control', controle: 'auto_caminho' },
      { t: 'arrive', placeId: 'palafitas_do_delta' },
      ...times(3, { t: 'kill', enemyId: 'siri_do_mangue' }),
    ];
    for (const ev of evs) onGameEvent(rec, ev);
    const briga = () => currentObjectives(rec).find((c) => c.missao.id === 'delta_03_briga_no_mangue');
    expect(briga()?.indice).toBe(0);
    s.take();
    let seq = 0;
    for (let id = 1; id <= 2; id++) {
      s.receive(MSG.input, { inputs: [{ seq: ++seq, mx: 0, my: 0 }], cmds: [{ id, c: 'alvo', x: 1, y: 1 }], ackTick: 0, rtt: 0 });
      s.tick();
    }
    expect(briga()?.indice).toBe(1);
  });
});
