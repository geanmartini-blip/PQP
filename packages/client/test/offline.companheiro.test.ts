/**
 * Offline solo (versão instalável): nas margens um treinador anda junto como IA, para a luta contar
 * como grupo (só luta em grupo dá XP). Sem ele, quem jogasse sozinho no celular nunca subia de nível
 * depois da travessia.
 */
import { describe, expect, it } from 'vitest';
import { getData } from '@pqp/shared';
import { FLAG_BRUNO, raiseToLevel } from '@pqp/shared/game/index';
import { GAME_MSG, MSG } from '@pqp/shared/net';
import { spawnEnemy } from '@pqp/shared/sim';
import { LocalServer, type RecordStore } from '../src/net/localServer';

const D = getData();
const memStore = (): RecordStore => {
  const data = new Map<string, string>();
  return { load: (id) => (data.has(id) ? JSON.parse(data.get(id)!) : null), save: (id, rec) => void data.set(id, JSON.stringify(rec)) };
};

function naMargem() {
  const s = new LocalServer({ store: memStore(), noEnemies: true, encounters: false, atalhoTravessia: true });
  s.receive(MSG.hello, { token: 'tok_companheiro', name: 'Zé' });
  s.receive(GAME_MSG.criarPersonagem, { name: 'Zé Sozinho', appearance: { ...D.appearance.padrao, details: [] } });
  const rec = s.rec!;
  rec.story_flags.push(FLAG_BRUNO);
  raiseToLevel(rec, 8);
  const inst = D.institutions.instituicoes.find((i) => i.margem === 'esquerda')!;
  const guide = D.guides.guias.find((g) => g.margem === 'esquerda')!;
  s.receive(GAME_MSG.travessia, { side: 'esquerda', institution: inst.id, guide: guide.id });
  s.take();
  return { s, rec, inst };
}

describe('offline solo: companheiro nas margens', () => {
  it('nasce um treinador da instituição no mesmo grupo do jogador', () => {
    const { s, inst } = naMargem();
    expect(s.mapId).toBe('margem_esquerda');
    const p = s.player!;
    const c = [...s.w.entities.values()].find((e) => e.kind === 'npc' && e.partyId !== undefined && e.partyId === p.partyId);
    expect(c).toBeDefined();
    expect(D.trainersById.get(c!.defId)?.archetype).toBe(inst.alas[0]);
  });

  it('derrotar um inimigo com o companheiro junto dá XP', () => {
    const { s, rec } = naMargem();
    const p = s.player!;
    const xp0 = rec.xp;
    const lvl0 = rec.level;
    const inimigo = D.enemies.inimigos?.[0]?.id ?? [...D.enemiesById.keys()][0]!;
    const e = spawnEnemy(s.w, inimigo, p.x + 1, p.y);
    e.hp = 1;
    let seq = 0;
    for (let i = 0; i < 200 && !e.dead; i++) {
      s.receive(MSG.input, { inputs: [{ seq: ++seq, mx: 0, my: 0 }], cmds: [], ackTick: 0, rtt: 0 });
      s.tick();
    }
    for (let i = 0; i < 5; i++) s.tick();
    expect(e.dead).toBe(true);
    expect(rec.level > lvl0 || rec.xp > xp0).toBe(true);
  });
});
