/**
 * v0.3: a jornada nova do 1 ao 20 (Delta 1-4, balsa no 5, ala no 10, cabeceira da Ponte no 19), o
 * conjunto da classe dado pelas missões e o ritmo do começo do combate.
 */
import { describe, expect, it } from 'vitest';
import { enemyById, getData } from '../src/data';
import { ALA_LEVEL, applyRewards, conjuntoDaClasse, DELTA_MAX_LEVEL, lookOf, newPlayerRecord, TRAVESSIA_LEVEL } from '../src/game';
import { getMap, listMaps } from '../src/map/registry';
import { ritmoMult } from '../src/sim/stats';

const D = getData();
const refs = new Set(listMaps().flatMap((id) => getMap(id).markers.map((m) => m.ref ?? m.id)));

describe('jornada do 1 ao 20', () => {
  it('marcos: Delta até o 4, balsa no 5, ala no 10', () => {
    expect([DELTA_MAX_LEVEL, TRAVESSIA_LEVEL, ALA_LEVEL]).toEqual([4, 5, 10]);
    expect(D.missionsById.get('travessia_08')!.nivel).toBe(5);
    expect(D.missionsById.get('escolha_da_ala_esquerda')!.nivel).toBe(10);
  });

  it('as missões do piloto até o 19 apontam para lugares, NPCs e inimigos que existem nos mapas', () => {
    for (const m of D.missions.missoes) {
      if (!m.emPiloto || m.nivel > 19) continue;
      for (const o of m.objetivos as { tipo: string; lugar?: string; npc?: string; inimigos?: { inimigo: string }[] }[]) {
        if (o.tipo === 'ir_ate' && o.lugar) expect(refs.has(o.lugar), `${m.id}: ${o.lugar}`).toBe(true);
        for (const i of o.inimigos ?? []) expect(enemyById(i.inimigo), `${m.id}: ${i.inimigo}`).toBeDefined();
      }
    }
  });

  for (const side of ['esquerda', 'direita'] as const) {
    it(`${side}: as flags levam da ala até a cabeceira, e o caminho dá as 5 peças da classe`, () => {
      const flags = new Set(['entrou_instituicao', `margem_${side}`, 'travessia_feita', 'delta_bruno_ferro_derrotado']);
      const feitas = new Set<string>();
      for (let mudou = true; mudou; ) {
        mudou = false;
        for (const m of D.missions.missoes) {
          if (!m.emPiloto || feitas.has(m.id) || (m.margem && m.margem !== side)) continue;
          if (!m.requerFlags.every((f) => flags.has(f))) continue;
          feitas.add(m.id);
          mudou = true;
          for (const f of m.ligaFlags) flags.add(f);
          for (const o of m.objetivos as { opcoes?: { ligaFlags?: string[] }[] }[]) for (const op of o.opcoes ?? []) for (const f of op.ligaFlags ?? []) flags.add(f);
        }
      }
      expect(feitas.has(`cabeceira_da_ponte_${side}`)).toBe(true);
      const slots = new Set(
        [...feitas].flatMap((id) => D.missionsById.get(id)!.recompensas.solo.flatMap((w) => (w.kind === 'item' && w.slotDaClasse ? [w.slotDaClasse] : []))),
      );
      expect([...slots].sort()).toEqual(['adorno', 'arma', 'cabeca', 'calcado', 'peito']);
    });
  }

  it('a peça da classe sai da classe e da margem do jogador; sem classe, nada', () => {
    const rec = newPlayerRecord('p', 'Zé');
    applyRewards(rec, [{ kind: 'item', slotDaClasse: 'arma', raridade: 'comum' }]);
    expect(rec.inventory).toEqual([]);
    rec.class = 'combatente';
    rec.side = 'direita';
    const r = applyRewards(rec, [{ kind: 'item', slotDaClasse: 'peito', raridade: 'comum' }]);
    expect(rec.inventory).toEqual(['peito_combatente_direita_comum']);
    expect(r.itens).toEqual(['peito_combatente_direita_comum']);
  });

  it('conjunto da classe: completo só com as 5 peças da classe e da margem', () => {
    const rec = newPlayerRecord('p', 'Zé');
    rec.class = 'combatente';
    rec.side = 'esquerda';
    const ids = ['cabeca', 'peito', 'arma', 'calcado', 'adorno'].map((s) => `${s}_combatente_esquerda_comum`);
    for (const [i, id] of ids.entries()) rec.equipment[['cabeca', 'peito', 'arma', 'calcado', 'adorno'][i]!] = id;
    expect(conjuntoDaClasse(rec).completo).toBe(true);
    expect(lookOf(rec).outfit.conjunto).toBe(true);
    rec.equipment['peito'] = 'peito_combatente_direita_comum';
    expect(conjuntoDaClasse(rec)).toMatchObject({ completo: false });
    expect(lookOf(rec).outfit.conjunto).toBeUndefined();
    expect(conjuntoDaClasse(rec).pecas).not.toContain('peito');
  });
});

describe('ritmo do começo', () => {
  it('o básico é 1,4x mais lento e mais forte até o 10 e volta ao normal no 20', () => {
    expect(ritmoMult(1)).toBeCloseTo(1.4);
    expect(ritmoMult(10)).toBeCloseTo(1.4);
    expect(ritmoMult(15)).toBeCloseTo(1.2);
    expect(ritmoMult(20)).toBe(1);
  });
});
