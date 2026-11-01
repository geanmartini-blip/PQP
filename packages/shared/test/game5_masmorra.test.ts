/**
 * Fase 5: masmorra (gerador, salas, chefe, dungeon_run), plantão (levar, Doutrina, relatório) e
 * encontros com IA no mapa.
 */
import { describe, expect, it } from 'vitest';
import {
  advanceFloor,
  aplicarRelatorio,
  atStairs,
  bossOfFloor,
  buildDungeonFloor,
  claimRunRewards,
  createDungeonRun,
  definirDoutrina,
  encerrarPlantao,
  encounterWindow,
  entrarEmPlantao,
  failRun,
  floorRooms,
  floorScaling,
  isBossFloor,
  leaveRun,
  levarPlantonista,
  newPlayerRecord,
  partyWiped,
  plantonistasDisponiveis,
  qgDaMargem,
  rollEncounters,
  spawnEncounter,
  spawnPlantonista,
  startDungeonFloor,
  tickDungeonFloor,
  tickEncounters,
  tickPlantao,
  validarDoutrina,
  type DungeonFloorEvent,
  type DutyAssignment,
  type PlayerRecord,
} from '../src/game';
import { findPath } from '../src/map/path';
import { getMap } from '../src/map/registry';
import { createWorld, dealDamage, spawnEnemy, spawnPlayer, step, type DoctrineCard, type Entity } from '../src/sim';
import { tickDoctrine } from '../src/sim/doctrine';
import { worldDigest } from '../src/sim/testkit';
import { downEntity } from '../src/sim/combat';

function margemRec(id: string, side: 'esquerda' | 'direita', archetype = side === 'esquerda' ? 'peao_brabo' : 'idol'): PlayerRecord {
  const r = newPlayerRecord(id, id);
  r.criado = true;
  r.stage = 'margem';
  r.side = side;
  r.archetype = archetype;
  r.class = side === 'esquerda' ? 'combatente' : 'mascarado';
  r.level = 14;
  return r;
}

describe('Masmorra: gerador de andar', () => {
  it('é determinístico pela semente e muda com a semente', () => {
    const a = buildDungeonFloor(3, 1234);
    const b = buildDungeonFloor(3, 1234);
    const c = buildDungeonFloor(3, 999);
    expect(Array.from(a.layout.map.tiles)).toEqual(Array.from(b.layout.map.tiles));
    expect(a.layout.rooms).toEqual(b.layout.rooms);
    expect(Array.from(a.layout.map.tiles)).not.toEqual(Array.from(c.layout.map.tiles));
  });

  it('tem cerca de 40x40, entrada e escada, e dá para chegar à escada (andares 1 a 12)', () => {
    for (let andar = 1; andar <= 12; andar++) {
      for (const seed of [1, 7, 42, 2024]) {
        const f = buildDungeonFloor(andar, seed);
        const m = f.layout.map;
        expect(m.width).toBe(40);
        expect(m.height).toBe(40);
        expect(m.markers.some((k) => k.id === 'entrada' && k.kind === 'spawn_jogador')).toBe(true);
        expect(m.markers.some((k) => k.id === 'escada')).toBe(true);
        const path = findPath(m, f.layout.entrance, f.layout.stairs, 0.35);
        expect(path, `andar ${andar} semente ${seed}`).not.toBeNull();
        // a saída também é alcançável
        expect(findPath(m, f.layout.entrance, f.layout.exit, 0.35)).not.toBeNull();
      }
    }
  });

  it('usa as salas de dungeons.json nos andares 1 a 5 e sorteia depois (sem fundo)', () => {
    expect(floorRooms(1, 5).map((s) => s.id)).toEqual(['gal_corredor_de_manutencao', 'gal_armario_do_turno', 'gal_casa_de_bombas']);
    const f8 = floorRooms(8, 5);
    expect(f8.length).toBeGreaterThanOrEqual(3);
    expect(f8.length).toBeLessThanOrEqual(5);
    expect(floorRooms(8, 5).map((s) => s.id)).toEqual(f8.map((s) => s.id));
    // a escala sobe por andar
    expect(floorScaling(10).vidaMult).toBeGreaterThan(floorScaling(5).vidaMult);
    expect(floorScaling(2).vidaMult).toBeGreaterThan(floorScaling(1).vidaMult);
  });

  it('chefe a cada 5 andares: o do 5º é A Bomba Descontrolada; o 10º tem chefe pelo gerador', () => {
    expect(isBossFloor(5)).toBe(true);
    expect(isBossFloor(4)).toBe(false);
    expect(bossOfFloor(5)).toBe('bomba_descontrolada');
    expect(bossOfFloor(10)).toBeDefined();
    const f10 = buildDungeonFloor(10, 3);
    expect(f10.layout.rooms[f10.layout.rooms.length - 1]!.tipo).toBe('chefe');
    expect(f10.boss).toBeDefined();
  });
});

describe('Masmorra: andar na simulação', () => {
  it('a sala acorda quando o grupo entra, nasce bando escalado e a escada abre quando tudo limpa', () => {
    const f = buildDungeonFloor(2, 77);
    const w = createWorld(f.layout.map, 1);
    const p = spawnPlayer(w, { name: 'A', archetypeId: 'peao_brabo', level: 14, x: f.layout.entrance.x, y: f.layout.entrance.y, playerId: 'a' });
    const st = startDungeonFloor(f);
    const evs: DungeonFloorEvent[] = [];
    for (let i = 1; i < f.layout.rooms.length; i++) {
      const r = f.layout.rooms[i]!;
      p.x = r.cx;
      p.y = r.cy;
      for (let k = 0; k < 400; k++) {
        evs.push(...tickDungeonFloor(w, st));
        // limpa na marra o que nasceu
        for (const e of w.entities.values()) if (e.kind === 'enemy' && !e.dead) e.dead = true;
        // sala de evento: escolhe a primeira opção
        const rs = st.rooms[i]!;
        if (rs.esperandoEscolha) {
          rs.esperandoEscolha = false;
          rs.limpa = true;
        }
        w.tick++;
        if (st.rooms[i]!.limpa) break;
      }
      expect(st.rooms[i]!.limpa).toBe(true);
    }
    evs.push(...tickDungeonFloor(w, st));
    expect(evs.some((e) => e.t === 'sala_ativa')).toBe(true);
    expect(evs.some((e) => e.t === 'onda')).toBe(true);
    expect(st.escadaAberta).toBe(true);
    p.x = f.layout.stairs.x;
    p.y = f.layout.stairs.y;
    expect(atStairs(w, st)?.id).toBe(p.id);
  });

  it('inimigos do andar fundo nascem mais fortes que no 1º', () => {
    const mk = (andar: number) => {
      const f = buildDungeonFloor(andar, 5);
      const w = createWorld(f.layout.map, 2);
      const st = startDungeonFloor(f);
      const idx = f.templates.findIndex((t) => t?.tipo === 'combate');
      const r = f.layout.rooms[idx]!;
      spawnPlayer(w, { name: 'A', archetypeId: 'peao_brabo', level: 14, x: r.cx, y: r.cy, playerId: 'a' });
      for (let k = 0; k < 200; k++) {
        tickDungeonFloor(w, st);
        w.tick++;
        if (st.rooms[idx]!.vivos.length > 0) break;
      }
      const e = w.entities.get(st.rooms[idx]!.vivos[0]!)!;
      return { hp: e.stats.hpMax, level: e.level, defId: e.defId };
    };
    const a = mk(1), b = mk(9);
    expect(b.level).toBeGreaterThan(a.level);
    expect(b.hp).toBeGreaterThan(a.hp * 0.99);
  });

  it('no 5º, a sala do chefe nasce A Bomba Descontrolada, que avisa no chão antes do golpe', () => {
    const f = buildDungeonFloor(5, 11);
    expect(f.boss).toBe('bomba_descontrolada');
    const w = createWorld(f.layout.map, 3);
    const st = startDungeonFloor(f);
    const last = f.layout.rooms[f.layout.rooms.length - 1]!;
    // marca as outras salas como limpas
    for (const rs of st.rooms.slice(0, -1)) {
      rs.ativa = true;
      rs.limpa = true;
    }
    const p = spawnPlayer(w, { name: 'A', archetypeId: 'peao_brabo', level: 14, x: last.cx + 2, y: last.cy + 1, playerId: 'a' });
    p.hp = p.stats.hpMax = 1e7;
    const evs = tickDungeonFloor(w, st);
    const ch = evs.find((e) => e.t === 'chefe');
    expect(ch && ch.t === 'chefe' && ch.inimigo).toBe('bomba_descontrolada');
    const boss = w.entities.get(st.bossId!)!;
    expect(boss.tier).toBe('chefe');
    let telegraph = false;
    for (let k = 0; k < 600 && !telegraph; k++) {
      step(w);
      tickDungeonFloor(w, st);
      telegraph = w.events.some((e) => e.t === 'telegraph' && e.tel.sourceId === boss.id && e.tel.impactTick - e.tel.startTick >= 16);
    }
    expect(telegraph).toBe(true);
    // chefe cai: a escada abre
    expect(st.escadaAberta).toBe(false);
    boss.dead = true;
    const ev2 = tickDungeonFloor(w, st);
    expect(ev2.some((e) => e.t === 'chefe_vencido')).toBe(true);
    expect(st.escadaAberta).toBe(true);
  });

  it('grupo todo caído = run falha', () => {
    const f = buildDungeonFloor(1, 1);
    const w = createWorld(f.layout.map, 1);
    const p = spawnPlayer(w, { name: 'A', archetypeId: 'peao_brabo', level: 14, x: f.layout.entrance.x, y: f.layout.entrance.y, playerId: 'a' });
    expect(partyWiped(w)).toBe(false);
    downEntity(w, p);
    expect(partyWiped(w)).toBe(true);
  });
});

describe('Masmorra: dungeon_run e recompensas', () => {
  it('cria a run com até 4, e recusa 5 ou grupo sem jogador', () => {
    const g = (n: number) => Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, papel: 'jogador' as const }));
    expect(createDungeonRun({ id: 'r', seed: 1, grupo: g(4), now: 0 }).ok).toBe(true);
    expect(createDungeonRun({ id: 'r', seed: 1, grupo: g(5), now: 0 }).ok).toBe(false);
    expect(createDungeonRun({ id: 'r', seed: 1, grupo: [{ playerId: 'x', papel: 'plantonista' }], now: 0 }).ok).toBe(false);
  });

  it('vencer andares guarda materiais; XP só em grupo; chefe do 5º dá as recompensas de chefe', () => {
    const solo = createDungeonRun({ id: 'solo', seed: 9, grupo: [{ playerId: 'a', papel: 'jogador' }], now: 100 });
    const grupo = createDungeonRun({ id: 'g', seed: 9, grupo: [{ playerId: 'b', papel: 'jogador' }, { playerId: 'c', papel: 'plantonista' }], now: 100 });
    if (!solo.ok || !grupo.ok) throw new Error('run');
    for (let i = 0; i < 5; i++) {
      advanceFloor(solo.run, { primeiraVez: true });
      advanceFloor(grupo.run, { primeiraVez: true });
    }
    expect(solo.run.andar).toBe(6);
    expect(solo.run.ultimoChefeVencido).toBe(5);
    const a = margemRec('a', 'esquerda'), b = margemRec('b', 'esquerda'), c = margemRec('c', 'esquerda');
    const xp0 = (r: PlayerRecord) => r.level * 1e6 + r.xp;
    const ax = xp0(a), bx = xp0(b), cx = xp0(c);
    const ra = claimRunRewards(a, solo.run);
    const rb = claimRunRewards(b, grupo.run);
    const rc = claimRunRewards(c, grupo.run);
    expect(ra.xp).toBe(0);
    expect(xp0(a)).toBe(ax);
    expect(a.resources.pecas).toBeGreaterThan(0);
    expect(ra.itensParaRolar.some((x) => x.tabela === 'loot_chefe_galerias')).toBe(true);
    expect(a.unlocks).toContain('atalho_galerias');
    expect(rb.xp).toBeGreaterThan(0);
    expect(xp0(b)).toBeGreaterThan(bx);
    // plantonista ganha metade
    expect(rc.xp).toBe(Math.round(rb.xp / 2));
    expect(xp0(c)).toBeGreaterThan(cx);
    expect(a.counters['masmorra:galerias_da_usina']).toBe(5);
  });

  it('morte e saída: falha guarda o que já venceu; sem jogador ao vivo a run acaba', () => {
    const r = createDungeonRun({ id: 'r', seed: 3, grupo: [{ playerId: 'a', papel: 'jogador' }, { playerId: 'b', papel: 'jogador' }], now: 0 });
    if (!r.ok) throw new Error('run');
    advanceFloor(r.run);
    failRun(r.run, 50);
    expect(r.run.status).toBe('falhou');
    expect(r.run.recompensas['a']!.length).toBeGreaterThan(0);
    const r2 = createDungeonRun({ id: 'r2', seed: 3, grupo: [{ playerId: 'a', papel: 'jogador' }, { playerId: 'b', papel: 'jogador' }], now: 0 });
    if (!r2.ok) throw new Error('run');
    leaveRun(r2.run, 'a', 10);
    expect(r2.run.status).toBe('ativa');
    leaveRun(r2.run, 'b', 20);
    expect(r2.run.status).toBe('saiu');
    expect(r2.run.fim).toBe(20);
  });
});

describe('Plantão', () => {
  it('a Doutrina valida até 5 cartas', () => {
    const c: DoctrineCard = { se: { t: 'sempre' }, faca: { t: 'focar_mais_perto' } };
    expect(validarDoutrina([c, c, c, c, c]).ok).toBe(true);
    expect(validarDoutrina([c, c, c, c, c, c]).ok).toBe(false);
    expect(validarDoutrina([{ se: { t: 'nada' }, faca: { t: 'fugir' } }]).ok).toBe(false);
    expect(validarDoutrina([{ se: { t: 'minha_vida_abaixo', pct: 300 }, faca: { t: 'fugir' } }]).ok).toBe(false);
    expect(validarDoutrina([{ se: { t: 'sempre' }, faca: { t: 'usar_botao', botao: 4 } }]).ok).toBe(false);
    const v = validarDoutrina([{ se: { t: 'minha_vida_abaixo', pct: 30, lixo: 1 }, faca: { t: 'fugir' } }]);
    expect(v.ok && v.cards[0]).toEqual({ se: { t: 'minha_vida_abaixo', pct: 30 }, faca: { t: 'fugir' } });
    const rec = margemRec('x', 'esquerda');
    expect(definirDoutrina(rec, [c]).ok).toBe(true);
    expect(rec.doctrine).toEqual([c]);
  });

  it('plantonista fica no QG da margem e é levado por alguém da mesma margem', () => {
    const dono = margemRec('dono', 'esquerda');
    const outro = margemRec('outro', 'direita');
    const quem = margemRec('quem', 'esquerda');
    expect(entrarEmPlantao(newPlayerRecord('novo', 'novo')).ok).toBe(false);
    expect(entrarEmPlantao(dono).ok).toBe(true);
    expect(qgDaMargem('esquerda')).toBe('casa_da_assembleia');
    const as: DutyAssignment[] = [];
    expect(plantonistasDisponiveis([dono, quem, outro], 'esquerda', as).map((r) => r.id)).toEqual(['dono']);
    expect(levarPlantonista(outro, dono, as, { id: 'd0', now: 0, destino: 'masmorra' }).ok).toBe(false);
    expect(levarPlantonista(quem, dono, as, { id: 'd0', now: 0, destino: 'masmorra', grupoAtual: 4 }).ok).toBe(false);
    const l = levarPlantonista(quem, dono, as, { id: 'd1', now: 0, destino: 'masmorra', runId: 'r1' });
    if (!l.ok) throw new Error(l.erro);
    as.push(l.assignment);
    expect(l.assignment.qg).toBe('casa_da_assembleia');
    expect(plantonistasDisponiveis([dono], 'esquerda', as)).toEqual([]);
    expect(levarPlantonista(quem, dono, as, { id: 'd2', now: 0, destino: 'masmorra' }).ok).toBe(false);
  });

  it('o plantonista nasce aliado, luta pela Doutrina dele, conta para o XP do grupo e manda relatório', () => {
    const dono = margemRec('dono', 'esquerda');
    dono.doctrine = [{ se: { t: 'sempre' }, faca: { t: 'focar_mais_perto' } }];
    entrarEmPlantao(dono);
    const quem = margemRec('quem', 'esquerda');
    const l = levarPlantonista(quem, dono, [], { id: 'd1', now: 1000, destino: 'mapa' });
    if (!l.ok) throw new Error(l.erro);
    const a = l.assignment;
    const map = getMap('prototipo_delta');
    const spawn = map.markers.find((m) => m.kind === 'spawn_jogador')!;
    const w = createWorld(map, 5);
    const lider = spawnPlayer(w, { name: 'quem', archetypeId: 'peao_brabo', level: 14, x: spawn.x, y: spawn.y, playerId: 'quem' });
    lider.partyId = 'g1';
    const pl: Entity = spawnPlantonista(w, dono, spawn.x + 1, spawn.y, { partyId: 'g1', assignment: a });
    expect(pl.onDuty).toBe(true);
    expect(pl.auto).toBe(true);
    expect(pl.team).toBe('aliados');
    expect(pl.doctrine).toEqual(dono.doctrine);
    const foe = spawnEnemy(w, 'siri_do_mangue', spawn.x + 3, spawn.y, { level: 20 });
    foe.stats.hpMax = foe.hp = 400;
    // luta: a Doutrina escolhe o alvo e bate
    let hit = false;
    for (let k = 0; k < 400 && !foe.dead; k++) {
      step(w);
      tickPlantao(w, a);
      if (w.events.some((e) => e.t === 'hit' && e.src === pl.id)) hit = true;
    }
    expect(hit).toBe(true);
    if (!foe.dead) dealDamage(w, lider, foe, 1e9);
    for (let k = 0; k < 5; k++) {
      step(w);
      tickPlantao(w, a);
    }
    expect(foe.dead).toBe(true);
    // grupo (líder + plantonista): XP para os dois, plantonista com metade
    expect(a.ganhos.xp).toBeGreaterThan(0);
    encerrarPlantao(a, 9000);
    expect(a.status).toBe('encerrado');
    const xpAntes = dono.level * 1e6 + dono.xp;
    const rel = aplicarRelatorio(dono, a);
    expect(rel.xp).toBeGreaterThan(0);
    expect(dono.level * 1e6 + dono.xp).toBeGreaterThan(xpAntes);
    void tickDoctrine;
  });
});

describe('Encontros com IA no mapa', () => {
  it('nasce determinístico por região e horário do servidor', () => {
    const map = getMap('margem_esquerda');
    const now = 1_700_000_000_000;
    const a = rollEncounters(map, 'margem_esquerda', now, 42);
    const b = rollEncounters(map, 'margem_esquerda', now + 1000, 42);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
    expect(encounterWindow(now)).toBe(encounterWindow(now + 1000));
    // outras janelas variam
    const outras = [1, 2, 3, 4, 5, 6].map((k) => JSON.stringify(rollEncounters(map, 'margem_esquerda', now + k * 600_000, 42)));
    expect(new Set(outras).size).toBeGreaterThan(1);
  });

  it('patrulha nasce como bando contra; personagem de IA luta junto ou contra', () => {
    const map = getMap('margem_esquerda');
    const kinds = new Set<string>();
    let found = { patrulha: false, coop: false, contra: false };
    for (let k = 0; k < 60 && !(found.patrulha && found.coop && found.contra); k++) {
      for (const spec of rollEncounters(map, 'margem_esquerda', k * 600_000, 7)) {
        const w = createWorld(map, 1);
        const ents = spawnEncounter(w, spec);
        expect(ents.length).toBeGreaterThan(0);
        kinds.add(spec.kind);
        if (spec.kind === 'patrulha') {
          expect(ents.every((e) => e.kind === 'enemy' && e.team === 'inimigos')).toBe(true);
          found.patrulha = true;
        } else {
          const e = ents[0]!;
          expect(e.auto).toBe(true);
          if (spec.postura === 'coop') {
            expect(e.team).toBe('aliados');
            expect(spec.side).toBe('esquerda');
            found.coop = true;
          } else {
            expect(e.team).toBe('inimigos');
            expect(spec.side).toBe('direita');
            found.contra = true;
          }
        }
      }
    }
    expect(found).toEqual({ patrulha: true, coop: true, contra: true });
  });

  it('personagem de IA rival que cai se rende', () => {
    const map = getMap('margem_esquerda');
    let spec = undefined as ReturnType<typeof rollEncounters>[number] | undefined;
    for (let k = 0; k < 80 && !spec; k++) spec = rollEncounters(map, 'margem_esquerda', k * 600_000, 3).find((s) => s.postura === 'contra' && s.kind === 'personagem_ia');
    expect(spec).toBeDefined();
    const w = createWorld(map, 1);
    const [e] = spawnEncounter(w, spec!);
    downEntity(w, e!);
    expect(tickEncounters(w)).toEqual([spec!.id]);
    expect(e!.dead).toBe(true);
  });

  it('mesmo andar e mesma semente dão o mesmo mundo depois de ticks', () => {
    const run = () => {
      const f = buildDungeonFloor(4, 21);
      const w = createWorld(f.layout.map, 9);
      const st = startDungeonFloor(f);
      const r = f.layout.rooms[1]!;
      spawnPlayer(w, { name: 'A', archetypeId: 'peao_brabo', level: 14, x: r.cx, y: r.cy, playerId: 'a' });
      for (let k = 0; k < 60; k++) {
        step(w);
        tickDungeonFloor(w, st);
      }
      return worldDigest(w);
    };
    expect(run()).toEqual(run());
  });
});
