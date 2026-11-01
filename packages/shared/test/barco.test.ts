/**
 * Travessia de barco (game/barco.ts): embarque só depois do Bruno Ferro no 8, a sala do barco, a
 * viagem até a ponte com as falas do Seu Jacó, a escolha, a aula (ondas, Especial, passos dos
 * botões, tempo máximo) e a chegada no cais certo de cada margem. Tudo por ticks, sem relógio.
 */
import { describe, expect, it } from 'vitest';
import { getData } from '../src/data';
import {
  AULA_STEPS,
  applyTravessia,
  boardBoat,
  boatButtonOf,
  boatInfo,
  boatOnCast,
  boatOnChosen,
  boatRoomOf,
  boatTick,
  boatWaveSpot,
  BOAT_TUNING,
  canBoard,
  createCharacter,
  defaultAppearance,
  deltaChainMissions,
  dialogOptions,
  FLAG_AULA,
  FLAG_BRUNO,
  FLAG_EMBARCOU,
  newBoatState,
  newPlayerRecord,
  refreshMissions,
  type BoatAction,
  type BoatState,
  type PlayerRecord,
} from '../src/game/index';
import { ARRIVAL_MAP_BY_SIDE, BOAT_WAVE_POINTS, boatOwnerOf, boatRoomId, boatRoomMap, getMap, isBoatRoom } from '../src/map/index';
import { circleFree } from '../src/map/grid';
import { AGGRO_RADIUS } from '../src/sim/constants';

const D = getData();
const RATE = 20;

/** Registro no Delta, cadastrado; `pronto` = Bruno Ferro derrotado e nível 8 (estágio travessia). */
function deltaRec(pronto: boolean, id = 'jogador-barco-1'): PlayerRecord {
  const rec = newPlayerRecord(id, 'Visitante');
  expect(createCharacter(rec, 'Maria Remo', defaultAppearance()).ok).toBe(true);
  if (!pronto) return rec;
  rec.missions = { ativas: [], concluidas: deltaChainMissions().filter((m) => m !== 'travessia_08'), progresso: {} };
  rec.story_flags.push(FLAG_BRUNO);
  rec.level = 8;
  rec.xp = 0;
  rec.stage = 'travessia';
  refreshMissions(rec);
  return rec;
}

const choiceOf = (side: 'esquerda' | 'direita') => ({
  side,
  institution: D.institutions.instituicoes.find((i) => i.margem === side)!.id,
  guide: D.guides.guias.find((g) => g.margem === side)!.id,
});

/** Roda o barco de `from` até `to` ticks, com as entidades da onda vivas segundo `alive`. */
function run(st: BoatState, rec: PlayerRecord, from: number, to: number, alive: (id: number) => boolean = () => false): BoatAction[] {
  const out: BoatAction[] = [];
  for (let t = from; t <= to; t++) out.push(...boatTick(st, rec, { tick: t, tickRate: RATE, vivo: alive }));
  return out;
}

describe('embarque', () => {
  it('só depois do Bruno Ferro e no nível 8; liga travessia_embarcou e a sala do barco é do jogador', () => {
    const cedo = deltaRec(false);
    expect(canBoard(cedo).ok).toBe(false);
    expect(boardBoat(cedo).ok).toBe(false);
    expect(dialogOptions(cedo, 'seu_jaco').map((o) => o.id)).not.toContain('travessia');
    // Bruno derrotado, mas ainda no 7
    cedo.story_flags.push(FLAG_BRUNO);
    expect(canBoard(cedo).ok).toBe(false);
    expect(boatRoomOf(cedo)).toBeUndefined();

    const rec = deltaRec(true);
    expect(canBoard(rec).ok).toBe(true);
    expect(dialogOptions(rec, 'seu_jaco').find((o) => o.id === 'travessia')?.texto).toBe('Embarcar na travessia');
    const b = boardBoat(rec);
    expect(b.ok).toBe(true);
    expect(b.resultado.flags).toEqual([FLAG_EMBARCOU]);
    expect(rec.story_flags).toContain(FLAG_EMBARCOU);
    // no barco, a mesma opção abre a escolha
    expect(dialogOptions(rec, 'seu_jaco').find((o) => o.id === 'travessia')?.texto).toBe('Escolher a margem');
    const room = boatRoomOf(rec)!;
    expect(room).toBe(boatRoomId(rec.id));
    expect(isBoatRoom(room)).toBe(true);
    expect(boatOwnerOf(room)).toBe(rec.id);
    // depois de escolher, volta para a margem (não para o barco)
    expect(applyTravessia(rec, choiceOf('esquerda')).ok).toBe(true);
    expect(boatRoomOf(rec)).toBeUndefined();
    expect(boardBoat(rec).ok).toBe(false);
  });

  it('o mapa do barco: convés andável cercado de rio, o Seu Jacó no leme e as ondas em cima do convés', () => {
    const m = boatRoomMap('barco:x');
    expect(m.id).toBe('barco:x');
    expect(m.tiles).toBe(getMap('barco_travessia').tiles);
    const spawn = m.markers.find((k) => k.kind === 'spawn_jogador')!;
    expect(circleFree(m, spawn.x, spawn.y, 0.35)).toBe(true);
    expect(m.markers.some((k) => k.kind === 'npc' && k.ref === 'seu_jaco')).toBe(true);
    for (const p of BOAT_WAVE_POINTS) expect(circleFree(m, p.x, p.y, 0.45), `${p.x},${p.y}`).toBe(true);
    // convés de cerca de 10 x 18: a linha do spawn tem 10 tiles andáveis
    let livres = 0;
    for (let x = 0; x < m.width; x++) if (circleFree(m, x + 0.5, spawn.y, 0.3)) livres++;
    expect(livres).toBe(10);
    // as bordas do mapa são rio (onde o cliente desenha as margens rolando)
    expect(circleFree(m, 1.5, spawn.y, 0.3)).toBe(false);
    expect(circleFree(m, m.width - 1.5, spawn.y, 0.3)).toBe(false);
  });
});

describe('viagem e escolha', () => {
  it('o Seu Jacó comenta os botões e as margens; na altura da ponte abre a escolha', () => {
    const rec = deltaRec(true);
    boardBoat(rec);
    const st = newBoatState(100);
    expect(boatInfo(st, { tick: 100, tickRate: RATE }).ponteEmS).toBe(BOAT_TUNING.viagemS);
    const ate = run(st, rec, 100, 100 + BOAT_TUNING.viagemS * RATE - 1);
    expect(st.fase).toBe('viagem');
    const falas = ate.filter((a): a is Extract<BoatAction, { t: 'fala' }> => a.t === 'fala').map((a) => a.fala);
    expect(falas.map((f) => f.situacao)).toEqual(['travessia_habilidades', 'travessia_esquerda', 'travessia_direita']);
    expect(falas.every((f) => f.nome === 'Seu Jacó' && f.texto.length > 0)).toBe(true);
    expect(ate.some((a) => a.t === 'escolha')).toBe(false);
    const ponte = run(st, rec, 100 + BOAT_TUNING.viagemS * RATE, 100 + BOAT_TUNING.viagemS * RATE);
    expect(st.fase).toBe('escolha');
    const esc = ponte.find((a): a is Extract<BoatAction, { t: 'escolha' }> => a.t === 'escolha')!;
    expect(esc.opcoes.pode).toBe(true);
    expect(esc.opcoes.margens.map((m) => m.side)).toEqual(['esquerda', 'direita']);
    expect(ponte).toContainEqual({ t: 'evento', ev: { t: 'arrive', regionId: 'usina_da_ponte', deBarco: true } });
    expect(boatInfo(st).dica?.id).toBe('barco_escolha');
    // esperando a escolha, nada acontece
    expect(run(st, rec, 400, 2000)).toEqual([]);
    // botão usado antes da aula não conta
    expect(boatOnCast(st, rec, '1')).toEqual([]);
  });

  it('a escolha começa a aula: Especial cheio, o guia se apresenta e ensina o botão 1', () => {
    const rec = deltaRec(true);
    boardBoat(rec);
    const st = newBoatState(0);
    run(st, rec, 0, BOAT_TUNING.viagemS * RATE);
    expect(applyTravessia(rec, choiceOf('direita')).ok).toBe(true);
    // botões da classe (níveis 8 a 11) liberados
    expect(rec.loadout.botoes?.length).toBe(3);
    const a = boatOnChosen(st, rec, 300);
    expect(st.fase).toBe('aula');
    expect(a[0]).toEqual({ t: 'especial' });
    const falas = a.filter((x): x is Extract<BoatAction, { t: 'fala' }> => x.t === 'fala').map((x) => x.fala);
    const guia = D.guidesById.get(rec.guide_id!)!;
    expect(falas.every((f) => f.nome === guia.name)).toBe(true);
    expect(falas.at(-1)?.situacao).toBe('aula_1');
    expect(boatInfo(st).dica?.id).toBe(AULA_STEPS[0]!.id);
    // chamar de novo não recomeça
    expect(boatOnChosen(st, rec, 301)).toEqual([]);
  });
});

describe('aula e chegada', () => {
  for (const side of ['esquerda', 'direita'] as const) {
    it(`ondas, os 4 botões e a chegada no cais da ${side}`, () => {
      const rec = deltaRec(true, `jogador-${side}`);
      boardBoat(rec);
      const st = newBoatState(0);
      let t = BOAT_TUNING.viagemS * RATE;
      run(st, rec, 0, t);
      applyTravessia(rec, choiceOf(side));
      boatOnChosen(st, rec, t);
      // a primeira onda espera ondaAtrasoS
      const alive = new Set<number>();
      let nextId = 1;
      const spawnAll = (acts: BoatAction[]) => {
        for (const a of acts) {
          if (a.t !== 'onda') continue;
          for (const g of a.inimigos) {
            expect(D.enemiesById.has(g.inimigo)).toBe(true);
            expect(g.nivel).toBe(rec.level - BOAT_TUNING.nivelAbaixo);
            for (let i = 0; i < g.quantidade; i++) {
              alive.add(nextId);
              st.inimigos.push(nextId++);
            }
          }
        }
      };
      const vivo = (id: number) => alive.has(id);
      expect(run(st, rec, t + 1, t + BOAT_TUNING.ondaAtrasoS * RATE - 1, vivo).some((a) => a.t === 'onda')).toBe(false);
      t += BOAT_TUNING.ondaAtrasoS * RATE;
      spawnAll(run(st, rec, t, t, vivo));
      expect(st.ondas).toBe(1);
      expect(alive.size).toBe(BOAT_TUNING.ondas[0]!.quantidade);
      // com inimigo vivo, a próxima onda não vem
      expect(run(st, rec, t + 1, t + 200, vivo).some((a) => a.t === 'onda')).toBe(false);
      t += 200;
      // os botões 1, 2 e 3 durante a luta
      for (const b of ['1', '2', '3'] as const) boatOnCast(st, rec, b);
      expect(st.passos).toEqual(['aula_botao_1', 'aula_botao_2', 'aula_botao_3']);
      // onda 1 limpa: a 2 vem depois do intervalo
      alive.clear();
      let acts = run(st, rec, t + 1, t + BOAT_TUNING.ondaIntervaloS * RATE + 1, vivo);
      spawnAll(acts);
      t += BOAT_TUNING.ondaIntervaloS * RATE + 1;
      expect(st.ondas).toBe(2);
      // o Especial e a onda 2 limpa: a aula acaba e o barco encosta
      const fim = boatOnCast(st, rec, 'especial');
      expect(fim.some((a) => a.t === 'info')).toBe(true);
      expect(boatOnCast(st, rec, 'especial')).toEqual([]);
      alive.clear();
      acts = run(st, rec, t + 1, t + 1, vivo);
      expect(st.fase).toBe('chegada');
      const falas = acts.filter((a): a is Extract<BoatAction, { t: 'fala' }> => a.t === 'fala').map((a) => a.fala.situacao);
      expect(falas).toEqual(['aula_fim', 'travessia_despedida']);
      t += 1;
      acts = run(st, rec, t + 1, t + BOAT_TUNING.chegadaS * RATE, vivo);
      expect(acts).toContainEqual({ t: 'chegar', mapId: ARRIVAL_MAP_BY_SIDE[side], spawn: 'spawn' });
      expect(st.fase).toBe('fim');
      expect(rec.story_flags).toContain(FLAG_AULA);
      expect(getMap(ARRIVAL_MAP_BY_SIDE[side]).markers.some((m) => m.kind === 'spawn_jogador' && m.id === 'spawn')).toBe(true);
    });
  }

  it('faltou botão com as ondas acabadas: volta onda; no tempo máximo o barco chega mesmo assim', () => {
    const rec = deltaRec(true);
    boardBoat(rec);
    const st = newBoatState(0);
    run(st, rec, 0, BOAT_TUNING.viagemS * RATE);
    applyTravessia(rec, choiceOf('esquerda'));
    const t0 = BOAT_TUNING.viagemS * RATE;
    boatOnChosen(st, rec, t0);
    // ninguém vivo (as ondas morrem na hora) e nenhum botão: as ondas giram
    const acts = run(st, rec, t0 + 1, t0 + BOAT_TUNING.aulaMaxS * RATE - 1);
    expect(acts.filter((a) => a.t === 'onda').length).toBeGreaterThan(BOAT_TUNING.ondas.length);
    expect(st.fase).toBe('aula');
    run(st, rec, t0 + BOAT_TUNING.aulaMaxS * RATE, t0 + BOAT_TUNING.aulaMaxS * RATE);
    expect(st.fase).toBe('chegada');
    const fim = run(st, rec, t0 + BOAT_TUNING.aulaMaxS * RATE + 1, t0 + (BOAT_TUNING.aulaMaxS + BOAT_TUNING.chegadaS) * RATE + 1);
    expect(fim).toContainEqual({ t: 'chegar', mapId: 'margem_esquerda', spawn: 'spawn' });
    // a aula não foi feita até o fim
    expect(rec.story_flags).not.toContain(FLAG_AULA);
  });

  it('o botão vem do loadout do evento cast', () => {
    const e = { loadout: { b1: 'a', b2: 'b', b3: 'c', especial: 'd' } };
    expect(boatButtonOf(e, 'a')).toBe('1');
    expect(boatButtonOf(e, 'c')).toBe('3');
    expect(boatButtonOf(e, 'd')).toBe('especial');
    expect(boatButtonOf(e, 'basico')).toBeUndefined();
  });

  it('a onda nasce no convés, livre e dentro do aggro de quem está no leme ou no meio', () => {
    const map = getMap('barco_travessia');
    const jaco = map.markers.find((m) => m.ref === 'seu_jaco')!;
    const spawn = map.markers.find((m) => m.kind === 'spawn_jogador')!;
    for (const pl of [{ x: jaco.x, y: jaco.y + 0.8 }, { x: spawn.x, y: spawn.y }, { x: 5.6, y: 22 }, { x: 14.4, y: 9 }]) {
      for (let i = 0; i < 6; i++) {
        const p = boatWaveSpot(map, i, pl);
        expect(circleFree(map, p.x, p.y, 0.45)).toBe(true);
        expect(Math.hypot(p.x - pl.x, p.y - pl.y)).toBeLessThanOrEqual(AGGRO_RADIUS + 0.5);
      }
    }
  });

  it('é determinístico: a mesma viagem dá as mesmas ações', () => {
    const go = () => {
      const rec = deltaRec(true);
      boardBoat(rec);
      const st = newBoatState(7);
      const out = run(st, rec, 7, 7 + BOAT_TUNING.viagemS * RATE);
      applyTravessia(rec, choiceOf('direita'));
      out.push(...boatOnChosen(st, rec, 300), ...run(st, rec, 301, 900));
      return JSON.stringify(out);
    };
    expect(go()).toBe(go());
  });

  it('reconexão: estado de barco novo de quem já escolheu vai direto para a aula', () => {
    const rec = deltaRec(true);
    boardBoat(rec);
    applyTravessia(rec, choiceOf('esquerda'));
    const st = newBoatState(0);
    const a = run(st, rec, 0, 0);
    expect(st.fase).toBe('aula');
    expect(a[0]).toEqual({ t: 'especial' });
  });
});
