/**
 * Servidor da Fase 3: saídas entre os mapas (troca de sala com a entrada certa), apelidos qg_*,
 * treinadores e NPCs dos mapas, ala no 12, talento salvo e aplicado ao renascer, botão 3, emote
 * espalhado, guia e a tela da instituição. Núcleo com robôs em canais em memória.
 */
import { describe, expect, it } from 'vitest';
import { getData } from '@pqp/shared/data';
import { GAME_MSG, type S2C_Emote, type S2C_InstituicaoInfo, type S2C_ProgressoOpcoes } from '@pqp/shared/net';
import { getMap } from '@pqp/shared/map';
import { defaultAppearance } from '@pqp/shared/game/appearance';
import { migratePlayerRecord } from '@pqp/shared/game/record';
import { FLAG_ENTROU } from '@pqp/shared/game/ala';
import { objectiveNeeds } from '@pqp/shared/game/missions';
import type { PlayerRecord } from '@pqp/shared/game/types';
import { GameServerCore } from '../src/core';
import { MemoryStore } from '../src/persistence/store';
import { Harness, type Bot } from './harness';
import { spawnEnemy } from '@pqp/shared/sim';
import { relevel } from '@pqp/shared/sim/spawn';
import { applyTravessia, createCharacter, deltaChainMissions, FLAG_BRUNO, lookOf, newPlayerRecord, pendingTalentLevels, raiseToLevel, refreshMissions, setFlag } from '@pqp/shared/game/index';
import { fightBrain } from '../src/bot/robot';

const D = getData();
const INST = 'brigada_popular';

/** Registro da Margem Esquerda, na Brigada Popular, com a missão de entrada feita e o guia. */
function margemRecord(id: string, level: number): PlayerRecord {
  const cls = D.institutionsById.get(INST)!.classe;
  // registro da Fase 1 com classe: vira 'margem' com o Delta e a travessia feitos
  const rec = migratePlayerRecord({ id, name: 'Brigadista', data: { archetypeId: cls, level } }, id);
  expect(rec.criado).toBe(true);
  expect(rec.stage).toBe('margem');
  rec.appearance = defaultAppearance();
  rec.level = level;
  rec.institution = INST;
  rec.story_flags.push(FLAG_ENTROU);
  rec.guide_id = D.guides.guias.find((g) => g.margem === 'esquerda')!.id;
  return rec;
}

async function seed(store: MemoryStore, token: string, rec: PlayerRecord): Promise<void> {
  await store.savePlayer({ id: rec.id, token, name: rec.name, data: rec });
}

function teleport(h: Harness, bot: Bot, x: number, y: number): void {
  const e = h.core.entityOf(bot.sid)!;
  e.x = x;
  e.y = y;
  e.moveTo = undefined;
  e.path = undefined;
}

const markerOf = (mapId: string, id: string) => {
  const m = getMap(mapId).markers.find((x) => x.id === id);
  if (!m) throw new Error(`marcador ${id} não existe em ${mapId}`);
  return m;
};

const lastOf = <T>(bot: Bot, type: string): T | undefined => bot.robot.gameLog.filter((g) => g.type === type).at(-1)?.msg as T | undefined;

describe('mapas da Fase 3 no servidor', () => {
  it('a saída da margem troca de sala e o personagem nasce na entrada certa da Usina da Ponte', async () => {
    const store = new MemoryStore();
    const token = 'tok-fase3-saida-0001';
    await seed(store, token, margemRecord('aaaaaaaa-1111-4111-8111-000000000001', 9));
    const h = new Harness({ mapId: 'margem_esquerda', content: false, store });
    const bot = await h.connectAsync({ token, seed: 401 });
    expect(bot.robot.welcome?.mapId).toBe('margem_esquerda');
    // nasce no cais (o spawn padrão, chegada da travessia)
    const cais = markerOf('margem_esquerda', 'spawn');
    const e = h.core.entityOf(bot.sid)!;
    expect(Math.hypot(e.x - cais.x, e.y - cais.y)).toBeLessThan(1);
    // na saída logo depois de nascer não vale (espera 2 s)
    const saida = markerOf('margem_esquerda', 'saida_usina_da_ponte');
    teleport(h, bot, saida.x, saida.y);
    h.tick(10);
    expect(bot.robot.trocarSala).toBeUndefined();
    h.tick(40);
    await new Promise((r) => setTimeout(r, 0));
    h.tick(2);
    expect(bot.robot.trocarSala).toEqual({ mapId: 'usina_da_ponte', motivo: 'registro' });
    expect(h.core.entityOf(bot.sid)).toBeUndefined();
    // a sala da Usina recebe na entrada da Esquerda
    const h2 = new Harness({ mapId: 'usina_da_ponte', content: false, store });
    const b2 = await h2.connectAsync({ token, seed: 402 });
    expect(b2.robot.welcome?.mapId).toBe('usina_da_ponte');
    const sp = markerOf('usina_da_ponte', 'spawn_esquerda');
    const e2 = h2.core.entityOf(b2.sid)!;
    expect(Math.hypot(e2.x - sp.x, e2.y - sp.y)).toBeLessThan(1);
    expect(e2.classId).toBe(D.institutionsById.get(INST)!.classe);
    // entrar de novo sem pedir a sala (sem chegada pendente): volta para casa, a margem
    const h3 = new Harness({ mapId: 'usina_da_ponte', content: false, store });
    const b3 = await h3.connectAsync({ token: 'tok-fase3-saida-0001', seed: 403 });
    expect(b3.robot.you).toBeUndefined();
    expect(b3.robot.trocarSala).toEqual({ mapId: 'margem_esquerda', motivo: 'registro' });
  });

  it('pedir a sala (trocar_sala) vale para quem já atravessou; quem está no Delta volta para o Delta', async () => {
    const store = new MemoryStore();
    await seed(store, 'tok-fase3-juncal-01', margemRecord('aaaaaaaa-1111-4111-8111-000000000002', 9));
    const core = new GameServerCore({ mapId: 'juncal', content: false, log: () => undefined, store });
    const w = await core.join('a', { token: 'tok-fase3-juncal-01' }, { explicit: true });
    expect(w?.mapId).toBe('juncal');
    // personagem do Delta pedindo o Juncal
    expect(await core.join('b', { token: 'tok-fase3-juncal-02' }, { explicit: true })).toBeNull();
    expect(core.takeOutbox().find((o) => o.sid === 'b' && o.type === GAME_MSG.trocarSala)?.msg).toEqual({ mapId: 'delta', motivo: 'registro' });
  });

  it('o núcleo aceita o apelido qg_direita e roda a Margem Direita', () => {
    const h = new Harness({ mapId: 'qg_direita', content: false });
    expect(h.core.mapId).toBe('margem_direita');
    expect(h.world.map.id).toBe('margem_direita');
  });

  it('todos os treinadores e NPCs dos marcadores nascem, com o nome dos dados', () => {
    for (const mapId of ['margem_esquerda', 'margem_direita', 'usina_da_ponte', 'juncal']) {
      const h = new Harness({ mapId, content: true });
      const npcs = Array.from(h.world.entities.values()).filter((x) => x.kind === 'npc');
      const want = getMap(mapId).markers.filter((m) => m.kind === 'npc');
      expect(npcs.length).toBe(want.length);
      for (const n of npcs) expect(n.name).not.toBe(n.defId);
    }
    // os 12 treinadores de cada margem
    const esq = new Harness({ mapId: 'margem_esquerda', content: true });
    const ids = new Set(Array.from(esq.world.entities.values()).map((x) => x.defId));
    for (const t of D.trainers.filter((x) => D.institutionsById.get(x.institution)?.margem === 'esquerda')) expect(ids.has(t.id)).toBe(true);
  });
});

describe('objetivo sobreviver', () => {
  it('conta os segundos de pé e solta as ondas da missão perto do jogador', async () => {
    const store = new MemoryStore();
    const token = 'tok-fase3-sobrevive-1';
    const rec = margemRecord('aaaaaaaa-1111-4111-8111-000000000008', 9);
    const id = 'roda_02_primeiro_mutirao';
    const m = D.missionsById.get(id)!;
    const idx = m.objetivos.findIndex((o) => o.tipo === 'sobreviver');
    rec.missions.ativas = [id];
    rec.missions.progresso[id] = m.objetivos.map((o, k) => (k < idx ? objectiveNeeds(o) : objectiveNeeds(o).map(() => 0)));
    await seed(store, token, rec);
    const h = new Harness({ mapId: 'margem_esquerda', content: false, store });
    const bot = await h.connectAsync({ token, seed: 441 });
    const enemies0 = Array.from(h.world.entities.values()).filter((x) => x.kind === 'enemy').length;
    bot.brain = () => {
      const e = h.core.entityOf(bot.sid);
      if (e && !e.dead && e.downedUntil === undefined) e.hp = e.stats.hpMax;
    };
    h.tick(20 * 6);
    const prog = h.core.recordOf(bot.sid)!.missions.progresso[id]![idx]![0]!;
    expect(prog).toBeGreaterThanOrEqual(4);
    expect(Array.from(h.world.entities.values()).filter((x) => x.kind === 'enemy').length).toBeGreaterThan(enemies0);
  });
});

describe('ala, talentos, botão 3, emote e guia', () => {
  it('ala no 10: recusa antes do 10 e longe do treinador; perto de quem recebe a base, escolhe e troca o kit', async () => {
    const store = new MemoryStore();
    const token = 'tok-fase3-ala-0001';
    await seed(store, token, margemRecord('aaaaaaaa-1111-4111-8111-000000000003', 9));
    const h = new Harness({ mapId: 'margem_esquerda', content: true, store });
    const bot = await h.connectAsync({ token, seed: 411 });
    const inst = D.institutionsById.get(INST)!;
    const ala = inst.alas[0]!;
    const base = markerOf('margem_esquerda', `npc_${inst.baseTrainer}`);
    teleport(h, bot, base.x + 0.8, base.y);
    h.tick(2);
    h.game(bot, GAME_MSG.escolherAla, { archetype: ala });
    expect(bot.robot.avisos.at(-1)?.tipo).toBe('erro');
    expect(h.core.recordOf(bot.sid)!.archetype).toBeNull();
    // nível 10, mas longe
    h.core.recordOf(bot.sid)!.level = 10;
    teleport(h, bot, base.x + 20, base.y + 20);
    h.game(bot, GAME_MSG.escolherAla, { archetype: ala });
    expect(bot.robot.avisos.at(-1)?.texto).toContain('treinador');
    expect(h.core.recordOf(bot.sid)!.archetype).toBeNull();
    // perto
    teleport(h, bot, base.x + 0.8, base.y);
    h.game(bot, GAME_MSG.progressoOpcoes, {});
    expect(lastOf<S2C_ProgressoOpcoes>(bot, GAME_MSG.progressoInfo)?.ala.pode).toBe(true);
    h.game(bot, GAME_MSG.escolherAla, { archetype: ala });
    const rec = h.core.recordOf(bot.sid)!;
    expect(rec.archetype).toBe(ala);
    const e = h.core.entityOf(bot.sid)!;
    expect(e.archetypeId).toBe(ala);
    expect(e.level).toBe(10);
    expect(e.loadout?.b1).toBe(D.archetypesById.get(ala)!.habilidadesMarca.marca_1);
    expect(bot.robot.perfil?.archetype).toBe(ala);
    // a escolha fica gravada
    await h.core.saveAll();
    expect((await store.getOrCreatePlayer(token)).data.archetype).toBe(ala);
    // botão 3: outra habilidade da classe
    const cls = D.classesById.get(inst.classe)!;
    const outra = cls.abilities.find((a) => a !== e.loadout?.b3)!;
    h.game(bot, GAME_MSG.trocarSlot3, { ability: outra });
    expect(h.core.entityOf(bot.sid)!.loadout?.b3.split('@')[0]).toBe(outra);
    h.game(bot, GAME_MSG.trocarSlot3, { ability: 'nao_existe' });
    expect(bot.robot.avisos.at(-1)?.tipo).toBe('erro');
  });

  it('talento salvo e aplicado ao renascer (e já na entidade viva)', async () => {
    const store = new MemoryStore();
    const token = 'tok-fase3-talento-01';
    await seed(store, token, margemRecord('aaaaaaaa-1111-4111-8111-000000000004', 10));
    const h = new Harness({ mapId: 'margem_esquerda', content: false, store, offlineAutoMs: 1000 });
    const bot = await h.connectAsync({ token, seed: 421 });
    expect(bot.robot.perfil?.talentosPendentes).toContain(10);
    h.game(bot, GAME_MSG.progressoOpcoes, {});
    const prog = lastOf<S2C_ProgressoOpcoes>(bot, GAME_MSG.progressoInfo)!;
    const t10 = prog.talentos.find((t) => t.nivel === 10)!;
    expect(t10.opcoes.length).toBeGreaterThan(0);
    const pick = t10.opcoes[0]!.id;
    h.game(bot, GAME_MSG.escolherTalento, { talent: 'nao_existe' });
    expect(bot.robot.avisos.at(-1)?.tipo).toBe('erro');
    h.game(bot, GAME_MSG.escolherTalento, { talent: pick });
    expect(h.core.recordOf(bot.sid)!.talent_picks).toEqual([pick]);
    expect(h.core.entityOf(bot.sid)!.talents).toEqual([pick]);
    expect(bot.robot.perfil?.talentos).toEqual([pick]);
    // o mesmo nível não escolhe duas vezes
    if (t10.opcoes[1]) {
      h.game(bot, GAME_MSG.escolherTalento, { talent: t10.opcoes[1].id });
      expect(h.core.recordOf(bot.sid)!.talent_picks).toEqual([pick]);
    }
    // cai de vez, sai do mapa e grava; servidor novo, mesmo Store: nasce com o talento e o guia
    h.disconnect(bot);
    h.tick(40);
    expect(h.core.entityOfToken(token)).toBeUndefined();
    await store.flush();
    expect((await store.getOrCreatePlayer(token)).data.talent_picks).toEqual([pick]);
    const h2 = new Harness({ mapId: 'margem_esquerda', content: false, store });
    const b2 = await h2.connectAsync({ token, seed: 422 });
    const e2 = h2.core.entityOf(b2.sid)!;
    expect(e2.talents).toEqual([pick]);
    expect(e2.guideId).toBe(h2.core.recordOf(b2.sid)!.guide_id);
  });

  it('o bordão do treinador vira emote e vai para quem está perto; o guia conversa de qualquer lugar', async () => {
    const store = new MemoryStore();
    const tokA = 'tok-fase3-emote-0001', tokB = 'tok-fase3-emote-0002', tokC = 'tok-fase3-emote-0003';
    await seed(store, tokA, margemRecord('aaaaaaaa-1111-4111-8111-000000000005', 9));
    await seed(store, tokB, margemRecord('aaaaaaaa-1111-4111-8111-000000000006', 9));
    await seed(store, tokC, margemRecord('aaaaaaaa-1111-4111-8111-000000000007', 9));
    const h = new Harness({ mapId: 'margem_esquerda', content: true, store });
    const a = await h.connectAsync({ token: tokA, seed: 431 });
    const b = await h.connectAsync({ token: tokB, seed: 432 });
    const c = await h.connectAsync({ token: tokC, seed: 433 });
    const inst = D.institutionsById.get(INST)!;
    const tr = D.trainersById.get(inst.baseTrainer)!;
    // sem o bordão: recusa
    h.game(a, GAME_MSG.emote, { emote: tr.emote.id });
    expect(a.robot.avisos.at(-1)?.tipo).toBe('erro');
    // conversa com quem recebe a base: libera o emote
    const base = markerOf('margem_esquerda', `npc_${inst.baseTrainer}`);
    teleport(h, a, base.x + 0.8, base.y);
    teleport(h, b, base.x + 2, base.y);
    teleport(h, c, base.x + 60, base.y + 60);
    h.tick(2);
    h.game(a, GAME_MSG.falar, { npcId: inst.baseTrainer });
    expect(a.robot.dialogo?.emote?.id).toBe(tr.emote.id);
    expect(a.robot.perfil?.emotes).toContain(tr.emote.id);
    h.game(a, GAME_MSG.emote, { emote: tr.emote.id });
    const ea = lastOf<S2C_Emote>(a, GAME_MSG.emote);
    const eb = lastOf<S2C_Emote>(b, GAME_MSG.emote);
    expect(ea?.emote).toBe(tr.emote.id);
    expect(eb?.entity).toBe(a.robot.you);
    expect(eb?.texto).toBe(tr.emote.texto);
    expect(lastOf<S2C_Emote>(c, GAME_MSG.emote)).toBeUndefined();
    // o guia: conversa sem estar perto de ninguém
    h.game(c, GAME_MSG.falar, { npcId: 'guia' });
    expect(c.robot.dialogo?.guia).toBe(true);
    expect(c.robot.dialogo?.nome).toBe(D.guidesById.get(h.core.recordOf(c.sid)!.guide_id!)!.name);
    // a tela da instituição
    h.game(c, GAME_MSG.instituicao, {});
    const info = lastOf<S2C_InstituicaoInfo>(c, GAME_MSG.instituicaoInfo);
    expect(info?.id).toBe(INST);
    expect(info?.missaoEntrada.id).toBe(inst.missaoEntrada.id);
  });
});

// ---------------------------------------------------------------------------
// Fluxo completo da Fase 3 (com atalhos de XP):
// chegar à margem → missão de entrada (com a ida ao Juncal) → 10 com talento → 12 com ala →
// 15 e 20 com talentos → andar pela saída até a Usina da Ponte e voltar.

/** Registro recém-atravessado para a Esquerda, na Brigada Popular (Delta feito sem jogar). */
function crossedRecord(id: string) {
  const rec = newPlayerRecord(id, 'Visitante');
  expect(createCharacter(rec, 'Zé da Brigada', defaultAppearance()).ok).toBe(true);
  rec.missions = { ativas: [], concluidas: deltaChainMissions().filter((m) => m !== 'travessia_08'), progresso: {} };
  setFlag(rec, FLAG_BRUNO);
  rec.level = 8;
  rec.xp = 0;
  refreshMissions(rec);
  const guia = D.guides.guias.find((g) => g.margem === 'esquerda')!.id;
  expect(applyTravessia(rec, { side: 'esquerda', institution: INST, guide: guia }).ok).toBe(true);
  return rec;
}

const npcEnt = (h: Harness, defId: string) => {
  const n = Array.from(h.world.entities.values()).find((x) => x.kind === 'npc' && x.defId === defId);
  if (!n) throw new Error(`NPC ${defId} não nasceu em ${h.core.mapId}`);
  return n;
};

/** Mantém o jogador de pé (a luta aqui é o caminho, não o balanceamento). */
const keepAlive = (h: Harness, bot: Bot) => () => {
  const e = h.core.entityOf(bot.sid);
  if (e && !e.dead && e.downedUntil === undefined) e.hp = e.stats.hpMax;
};

/** Toca no chão em cima da saída (auto-caminho) e anda até o servidor trocar de sala. */
async function walkOut(h: Harness, bot: Bot, exit: { x: number; y: number }, maxTicks = 600): Promise<void> {
  const alive = keepAlive(h, bot);
  bot.brain = alive;
  h.tick(2);
  bot.robot.command({ c: 'ir_ate', x: exit.x, y: exit.y });
  const t = h.runUntil(() => h.core.entityOf(bot.sid) === undefined, maxTicks);
  expect(t, `não saiu por (${exit.x}, ${exit.y}) em ${h.core.mapId}`).toBeGreaterThanOrEqual(0);
  bot.brain = undefined;
  await new Promise((r) => setTimeout(r, 0));
  h.tick(1);
}

describe('fluxo completo da Fase 3', () => {
  it('margem → entrada na Brigada (com o Juncal) → 10 talento → 12 ala → 15 e 20 talentos → Usina e volta', async () => {
    const store = new MemoryStore();
    const token = 'tok-fase3-fluxo-completo-01';
    await seed(store, token, crossedRecord('aaaaaaaa-1111-4111-8111-0000000000f3'));
    const inst = D.institutionsById.get(INST)!;

    // --- chegada: nasce no cais da Margem Esquerda, com a classe da instituição
    const h = new Harness({ mapId: 'margem_esquerda', content: true, store });
    const bot = await h.connectAsync({ token, seed: 501 });
    expect(bot.robot.welcome?.mapId).toBe('margem_esquerda');
    const rec = () => h.core.recordOf(bot.sid)!;
    expect(rec().stage).toBe('margem');
    expect(h.core.entityOf(bot.sid)!.classId).toBe(inst.classe);
    expect(rec().story_flags).not.toContain(FLAG_ENTROU);
    bot.brain = keepAlive(h, bot);

    // --- A Roda: Casa da Assembleia e a Ilaria
    const casa = markerOf('margem_esquerda', 'lugar_casa_da_assembleia');
    teleport(h, bot, casa.x, casa.y);
    h.tick(6); // lugares e regiões são conferidos a cada AREA_CHECK_TICKS
    const ilaria = npcEnt(h, 'ilaria_vesta');
    teleport(h, bot, ilaria.x + 0.8, ilaria.y);
    h.tick(2);
    h.game(bot, GAME_MSG.falar, { npcId: 'ilaria_vesta' });
    expect(rec().missions.concluidas, JSON.stringify(rec().missions)).toContain('roda_01_apresentacao');
    expect(rec().missions.ativas).toContain(inst.missaoEntrada.id);

    // --- entrada: o galpão da Brigada e o discurso na roda (escolha pelo diálogo do Jacques)
    const sede = markerOf('margem_esquerda', 'lugar_sede_brigada_popular');
    teleport(h, bot, sede.x, sede.y);
    h.tick(6);
    const jacques = npcEnt(h, inst.baseTrainer);
    teleport(h, bot, jacques.x + 0.8, jacques.y);
    h.tick(2);
    h.game(bot, GAME_MSG.falar, { npcId: inst.baseTrainer });
    expect(bot.robot.dialogo?.opcoes.map((o) => o.id)).toContain('escolha:pratico');
    h.game(bot, GAME_MSG.dialogoOpcao, { npcId: inst.baseTrainer, opcao: 'escolha:pratico' });

    // --- a borda do Juncal: anda pela saída do norte
    const spJ = markerOf('margem_esquerda', 'spawn_juncal');
    teleport(h, bot, spJ.x, spJ.y);
    await walkOut(h, bot, markerOf('margem_esquerda', 'saida_juncal'));
    expect(bot.robot.trocarSala).toEqual({ mapId: 'juncal', motivo: 'registro' });

    const hj = new Harness({ mapId: 'juncal', content: false, store });
    const bj = await hj.connectAsync({ token, seed: 502 });
    expect(bj.robot.welcome?.mapId).toBe('juncal');
    const ej = hj.core.entityOf(bj.sid)!;
    const spE = markerOf('juncal', 'spawn_esquerda');
    expect(Math.hypot(ej.x - spE.x, ej.y - spE.y)).toBeLessThan(1);
    hj.tick(6);
    const recJ = () => hj.core.recordOf(bj.sid)!;
    // a região do Juncal conta e o objetivo agora é a briga
    const ent = D.missionsById.get(inst.missaoEntrada.id)!;
    const iBriga = ent.objetivos.findIndex((o) => o.tipo === 'derrotar');
    expect(recJ().missions.progresso[ent.id]?.[iBriga - 1]).toEqual(objectiveNeeds(ent.objetivos[iBriga - 1]!));

    // --- a briga de verdade: 6 contrabandistas e 1 elite rápido (vida cortada: atalho de teste)
    const foes = [
      ...Array.from({ length: 6 }, (_, k) => spawnEnemy(hj.world, 'contrabandista', ej.x + Math.cos(k) * 1.8, ej.y - 2 + Math.sin(k) * 1.2)),
      spawnEnemy(hj.world, 'contrabandista', ej.x, ej.y - 3, { tier: 'elite', affixes: ['rapido'] }),
    ];
    for (const f of foes) f.hp = 1;
    const brain = fightBrain();
    const aliveJ = keepAlive(hj, bj);
    bj.brain = (r) => {
      aliveJ();
      brain(r);
    };
    expect(hj.runUntil(() => foes.every((f) => f.dead || !hj.world.entities.has(f.id)), 3000)).toBeGreaterThanOrEqual(0);
    bj.brain = undefined;
    bj.robot.setStick(0, 0);
    hj.tick(4);
    expect(recJ().missions.concluidas).toContain(ent.id);
    expect(recJ().story_flags).toEqual(expect.arrayContaining([FLAG_ENTROU, `entrou_${INST}`]));
    expect(recJ().unlocks).toEqual(expect.arrayContaining(['classe', 'uniforme_instituicao']));
    expect(recJ().counters[`reputacao:${INST}`]).toBe(100);

    // --- volta para a margem pela trilha do Juncal
    hj.tick(40); // a saída só vale 2 s depois de nascer
    await walkOut(hj, bj, markerOf('juncal', 'saida_margem_esquerda'));
    expect(bj.robot.trocarSala).toEqual({ mapId: 'margem_esquerda', motivo: 'registro' });

    const hm = new Harness({ mapId: 'margem_esquerda', content: true, store });
    const bm = await hm.connectAsync({ token, seed: 503 });
    const recM = () => hm.core.recordOf(bm.sid)!;
    const em = () => hm.core.entityOf(bm.sid)!;
    expect(Math.hypot(em().x - spJ.x, em().y - spJ.y)).toBeLessThan(1);
    expect(recM().story_flags).toContain(FLAG_ENTROU);
    bm.brain = keepAlive(hm, bm);
    hm.tick(2);

    /** Atalho de XP: sobe o registro e a entidade viva para o nível. */
    const subir = (lvl: number) => {
      raiseToLevel(recM(), lvl);
      relevel(hm.world, em(), lvl);
      expect(recM().level).toBe(lvl);
      expect(em().level).toBe(lvl);
    };
    /** Escolhe a primeira opção de talento do nível pela tela de progresso. */
    const talento = (lvl: number): string => {
      hm.game(bm, GAME_MSG.progressoOpcoes, {});
      const prog = lastOf<S2C_ProgressoOpcoes>(bm, GAME_MSG.progressoInfo)!;
      const t = prog.talentos.find((x) => x.nivel === lvl);
      expect(t?.opcoes.length, `talentos do ${lvl}`).toBeGreaterThan(0);
      const pick = t!.opcoes[0]!.id;
      hm.game(bm, GAME_MSG.escolherTalento, { talent: pick });
      expect(recM().talent_picks).toContain(pick);
      expect(em().talents).toContain(pick);
      return pick;
    };

    // --- 10: talento de instituição
    subir(10);
    const t10 = talento(10);

    // --- 12: a ala com quem recebe a base
    subir(12);
    const jm = npcEnt(hm, inst.baseTrainer);
    teleport(hm, bm, jm.x + 0.8, jm.y);
    hm.tick(2);
    const ala = inst.alas[0]!;
    hm.game(bm, GAME_MSG.escolherAla, { archetype: ala });
    expect(recM().archetype).toBe(ala);
    expect(em().archetypeId).toBe(ala);
    expect(em().loadout?.b1).toBe(D.archetypesById.get(ala)!.habilidadesMarca.marca_1);
    expect(lookOf(recM()).outfit.tier).toBe('aprendiz');
    // o talento do 10 continua na entidade depois da troca de kit
    expect(em().talents).toContain(t10);

    // --- 15 e 20: papel e talento-chave
    subir(15);
    const t15 = talento(15);
    subir(20);
    const t20 = talento(20);
    expect(recM().talent_picks).toEqual([t10, t15, t20]);
    expect(lookOf(recM()).outfit.tier).toBe('veterano');
    expect(pendingTalentLevels(recM())).toEqual([]);

    // --- anda pela saída do leste até a Usina da Ponte
    const spU = markerOf('margem_esquerda', 'spawn_usina');
    teleport(hm, bm, spU.x, spU.y);
    await walkOut(hm, bm, markerOf('margem_esquerda', 'saida_usina_da_ponte'));
    expect(bm.robot.trocarSala).toEqual({ mapId: 'usina_da_ponte', motivo: 'registro' });

    const hu = new Harness({ mapId: 'usina_da_ponte', content: false, store });
    const bu = await hu.connectAsync({ token, seed: 504 });
    expect(bu.robot.welcome?.mapId).toBe('usina_da_ponte');
    const eu = hu.core.entityOf(bu.sid)!;
    const spUE = markerOf('usina_da_ponte', 'spawn_esquerda');
    expect(Math.hypot(eu.x - spUE.x, eu.y - spUE.y)).toBeLessThan(1);
    // tudo veio junto: nível, ala, talentos e guia
    expect(eu.level).toBe(20);
    expect(eu.archetypeId).toBe(ala);
    expect(eu.talents).toEqual([t10, t15, t20]);
    expect(eu.guideId).toBe(hu.core.recordOf(bu.sid)!.guide_id);

    // --- e volta andando para a margem
    hu.tick(40);
    await walkOut(hu, bu, markerOf('usina_da_ponte', 'saida_margem_esquerda'));
    expect(bu.robot.trocarSala).toEqual({ mapId: 'margem_esquerda', motivo: 'registro' });
    const hb = new Harness({ mapId: 'margem_esquerda', content: false, store });
    const bb = await hb.connectAsync({ token, seed: 505 });
    const eb = hb.core.entityOf(bb.sid)!;
    expect(Math.hypot(eb.x - spU.x, eb.y - spU.y)).toBeLessThan(1);
    expect(eb.archetypeId).toBe(ala);
    expect(eb.talents).toEqual([t10, t15, t20]);
    await hb.core.saveAll();
    await store.flush();
    const saved = (await store.getOrCreatePlayer(token)).data;
    expect(saved).toMatchObject({ stage: 'margem', side: 'esquerda', institution: INST, archetype: ala, level: 20 });
    expect(saved.talent_picks).toEqual([t10, t15, t20]);
  });
});
