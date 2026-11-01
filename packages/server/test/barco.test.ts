/**
 * Travessia de barco no servidor: embarcar só depois do Bruno Ferro no 8, a sala do barco de cada
 * jogador ('barco:<id>'), a viagem até a ponte, a escolha no barco, os botões da classe e o Especial
 * cheio, a aula com as ondas e a chegada no cais certo de cada margem, e a reconexão no meio.
 * Núcleo com robôs em canais em memória (200 ms de RTT e 2% de perda).
 */
import { describe, expect, it } from 'vitest';
import { getData } from '@pqp/shared/data';
import { GAME_MSG, type S2C_FalaGuia, type S2C_TrocarSala } from '@pqp/shared/net';
import { ARRIVAL_MAP_BY_SIDE, boatRoomId, getMap } from '@pqp/shared/map';
import { defaultAppearance } from '@pqp/shared/game/appearance';
import { createCharacter } from '@pqp/shared/game/travessia';
import { deltaChainMissions, newPlayerRecord } from '@pqp/shared/game/record';
import { refreshMissions } from '@pqp/shared/game/missions';
import { FLAG_EMBARCOU } from '@pqp/shared/game/barco';
import type { PlayerRecord } from '@pqp/shared/game/types';
import { MemoryStore } from '../src/persistence/store';
import { Harness, type Bot } from './harness';
import { boardRoom, doAula, embark, nextTask, sailToBridge } from './boat';

const D = getData();
let seq = 0;

/** Registro no Delta; `pronto` = Bruno Ferro derrotado e nível 8; `embarcou` = já no barco. */
function record(o: { pronto: boolean; embarcou?: boolean }): PlayerRecord {
  const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
  const rec = newPlayerRecord(id, 'Visitante');
  expect(createCharacter(rec, 'Zé do Barco', defaultAppearance()).ok).toBe(true);
  if (!o.pronto) {
    rec.level = 7;
    return rec;
  }
  rec.missions = { ativas: [], concluidas: deltaChainMissions().filter((m) => m !== 'travessia_08'), progresso: {} };
  rec.story_flags.push('delta_cadastro_feito', 'delta_bruno_ferro_derrotado');
  if (o.embarcou) rec.story_flags.push(FLAG_EMBARCOU);
  rec.level = 8;
  rec.xp = 0;
  rec.stage = 'travessia';
  refreshMissions(rec);
  return rec;
}

async function saved(store: MemoryStore, rec: PlayerRecord, token: string): Promise<void> {
  await store.savePlayer({ id: rec.id, token, name: rec.name, data: rec });
}

const choice = (side: 'esquerda' | 'direita') => ({
  side,
  institution: D.institutions.instituicoes.find((i) => i.margem === side)!.id,
  guide: D.guides.guias.find((g) => g.margem === side)!.id,
});

const falasOf = (bot: Bot): S2C_FalaGuia[] => bot.robot.gameLog.filter((m) => m.type === GAME_MSG.falaGuia).map((m) => m.msg as S2C_FalaGuia);

/** Põe o robô ao lado do Seu Jacó no leme. */
function nearJaco(h: Harness, bot: Bot): void {
  const jaco = [...h.world.entities.values()].find((e) => e.kind === 'npc' && e.defId === 'seu_jaco')!;
  const e = h.core.entityOf(bot.sid)!;
  e.x = jaco.x;
  e.y = jaco.y - 1;
  e.moveTo = undefined;
  e.path = undefined;
}

describe('embarque no Delta', () => {
  it('só depois do Bruno Ferro e no nível 8; embarcado, o Delta manda para o barco', async () => {
    const store = new MemoryStore();
    // antes do Bruno: sem a opção, e o pedido direto é recusado
    const cedo = record({ pronto: false });
    await saved(store, cedo, 'tok-barco-cedo-01');
    const h0 = new Harness({ mapId: 'delta', content: true, store });
    const b0 = await h0.connectAsync({ token: 'tok-barco-cedo-01', seed: 501 });
    h0.tick(3);
    h0.game(b0, GAME_MSG.falar, { npcId: 'seu_jaco' });
    expect(b0.robot.dialogo?.opcoes.map((o) => o.id)).not.toContain('travessia');
    h0.game(b0, GAME_MSG.dialogoOpcao, { npcId: 'seu_jaco', opcao: 'travessia' });
    await nextTask();
    h0.tick(2);
    expect(b0.robot.avisos.at(-1)?.tipo).toBe('erro');
    expect(b0.robot.trocarSala).toBeUndefined();
    // e a sala do barco não aceita quem não embarcou: volta para o Delta
    const { bot: bx } = await boardRoom(boatRoomId(cedo.id), store, 'tok-barco-cedo-01', 502);
    expect(bx.robot.you).toBeUndefined();
    expect(bx.robot.trocarSala).toEqual({ mapId: 'delta', motivo: 'registro' });

    // pronto: embarca
    const rec = record({ pronto: true });
    const token = 'tok-barco-pronto-01';
    await saved(store, rec, token);
    const h = new Harness({ mapId: 'delta', content: true, store });
    const bot = await h.connectAsync({ token, seed: 503 });
    h.tick(3);
    const room = await embark(h, bot);
    expect(room).toBe(boatRoomId(rec.id));
    expect(bot.robot.trocarSala).toEqual({ mapId: room!, motivo: 'travessia' } satisfies S2C_TrocarSala);
    const row = (await store.getOrCreatePlayer(token)).data;
    expect(row.story_flags).toContain(FLAG_EMBARCOU);
    expect(row.stage).toBe('travessia');
    // voltar ao Delta (recarregou a página) leva de volta ao barco
    const h2 = new Harness({ mapId: 'delta', content: false, store });
    const b2 = await h2.connectAsync({ token, seed: 504 });
    expect(b2.robot.you).toBeUndefined();
    expect(b2.robot.trocarSala).toEqual({ mapId: room, motivo: 'registro' });
    // o barco é só do dono
    const outro = record({ pronto: true, embarcou: true });
    await saved(store, outro, 'tok-barco-outro-01');
    const { bot: bo } = await boardRoom(room!, store, 'tok-barco-outro-01', 505);
    expect(bo.robot.you).toBeUndefined();
    expect(bo.robot.trocarSala?.mapId).toBe(boatRoomId(outro.id));
  });
});

describe('o barco', () => {
  it('viagem com as falas do Seu Jacó, a escolha na altura da ponte e os botões da classe depois dela', async () => {
    const store = new MemoryStore();
    const rec = record({ pronto: true, embarcou: true });
    const token = 'tok-barco-escolha-1';
    await saved(store, rec, token);
    const { h, bot } = await boardRoom(boatRoomId(rec.id), store, token, 511);
    expect(bot.robot.welcome?.mapId).toBe(boatRoomId(rec.id));
    expect(bot.robot.barco?.fase).toBe('viagem');
    expect(bot.robot.barco?.ponteEmS).toBeGreaterThan(0);
    expect(h.core.companionOf(bot.sid)).toBeUndefined();
    // antes da ponte: escolher é recusado; o Seu Jacó pede calma
    const c = choice('direita');
    h.game(bot, GAME_MSG.travessia, c);
    expect(bot.robot.avisos.at(-1)?.tipo).toBe('erro');
    nearJaco(h, bot);
    h.tick(2);
    h.game(bot, GAME_MSG.falar, { npcId: 'seu_jaco' });
    expect(bot.robot.dialogo?.opcoes.find((o) => o.id === 'travessia')?.texto).toBe('Escolher a margem');
    h.game(bot, GAME_MSG.dialogoOpcao, { npcId: 'seu_jaco', opcao: 'travessia' });
    expect(bot.robot.travessia).toBeUndefined();
    expect(bot.robot.avisos.at(-1)?.tipo).toBe('info');
    // a ponte: falas do Seu Jacó sobre as duas margens e a tela da escolha
    expect(sailToBridge(h, bot)).toBeGreaterThan(0);
    expect(bot.robot.travessia?.pode).toBe(true);
    expect(bot.robot.barco?.dica?.id).toBe('barco_escolha');
    const jaco = falasOf(bot).filter((f) => f.guia === 'seu_jaco').map((f) => f.situacao);
    expect(jaco).toEqual(expect.arrayContaining(['travessia_esquerda', 'travessia_direita']));
    // fechou a tela sem escolher: tocar no Seu Jacó abre de novo
    bot.robot.travessia = undefined;
    h.game(bot, GAME_MSG.dialogoOpcao, { npcId: 'seu_jaco', opcao: 'travessia' });
    const tela = (): { pode: boolean } | undefined => bot.robot.travessia;
    expect(tela()?.pode).toBe(true);
    // escolhe: margem, classe e os botões liberados; o Especial começa cheio
    const e = h.core.entityOf(bot.sid)!;
    e.auto = true;
    h.game(bot, GAME_MSG.travessia, c);
    // a aula é com o polegar: o automático desliga
    expect(e.auto).toBe(false);
    expect(bot.robot.perfil?.stage).toBe('margem');
    expect(bot.robot.perfil?.side).toBe('direita');
    expect(bot.robot.perfil?.controlesLiberados).toEqual(expect.arrayContaining(['habilidades', 'especial']));
    const inst = D.institutionsById.get(c.institution)!;
    expect(e.classId).toBe(inst.classe);
    expect(e.loadout?.b1 && e.loadout.b2 && e.loadout.b3 && e.loadout.especial).toBeTruthy();
    expect(e.special).toBe(1);
    expect(bot.robot.barco?.fase).toBe('aula');
    expect(bot.robot.barco?.dica?.id).toBe('aula_botao_1');
    // o HUD mostra os 3 botões e o Especial pronto
    h.tick(10);
    expect(bot.robot.hud?.ab.filter(Boolean).length).toBeGreaterThanOrEqual(4);
    expect(bot.robot.hud?.special).toBe(1000);
    // o guia recém-escolhido fala na aula
    const guia = D.guidesById.get(c.guide)!;
    expect(falasOf(bot).some((f) => f.nome === guia.name && f.situacao === 'aula_1')).toBe(true);
    // escolher de novo é recusado
    h.game(bot, GAME_MSG.travessia, choice('esquerda'));
    expect(bot.robot.avisos.at(-1)?.tipo).toBe('erro');
    expect(h.core.recordOf(bot.sid)!.side).toBe('direita');
  });

  for (const side of ['esquerda', 'direita'] as const) {
    it(`a aula (ondas e botões) acaba e o barco chega no cais da ${side}`, async () => {
      const store = new MemoryStore();
      const rec = record({ pronto: true, embarcou: true });
      const token = `tok-barco-aula-${side}`;
      await saved(store, rec, token);
      const { h, bot } = await boardRoom(boatRoomId(rec.id), store, token, side === 'esquerda' ? 521 : 522);
      const sailTicks = sailToBridge(h, bot);
      expect(sailTicks).toBeGreaterThan(0);
      h.game(bot, GAME_MSG.travessia, choice(side));
      const took = await doAula(h, bot);
      expect(took).toBeGreaterThan(0);
      // as duas ondas subiram no convés e caíram
      const mortos = h.eventsOf('death').filter((d) => d.by !== undefined).length;
      expect(mortos).toBeGreaterThanOrEqual(5);
      // o guia ensinou os botões; a dica andou
      expect(falasOf(bot).filter((f) => f.situacao.startsWith('aula_')).length).toBeGreaterThanOrEqual(2);
      expect(bot.robot.barco?.passos).toBe(4);
      // antes do tempo máximo da aula (90 s)
      expect(took).toBeLessThan(90 * 20);
      // chegou: troca de sala para a margem, no cais
      expect(bot.robot.trocarSala).toEqual({ mapId: ARRIVAL_MAP_BY_SIDE[side], motivo: 'travessia' });
      const row = (await store.getOrCreatePlayer(token)).data;
      expect(row.stage).toBe('margem');
      expect(row.side).toBe(side);
      expect(row.story_flags).toContain('travessia_feita');
      const hm = new Harness({ mapId: ARRIVAL_MAP_BY_SIDE[side], content: false, store });
      const bm = await hm.connectAsync({ token, seed: 530 });
      expect(bm.robot.welcome?.mapId).toBe(ARRIVAL_MAP_BY_SIDE[side]);
      const cais = getMap(ARRIVAL_MAP_BY_SIDE[side]).markers.find((m) => m.kind === 'spawn_jogador' && m.id === 'spawn')!;
      const e = hm.core.entityOf(bm.sid)!;
      expect(Math.hypot(e.x - cais.x, e.y - cais.y)).toBeLessThan(1);
      // fora do barco, o Especial não começa cheio
      expect(e.special).toBeLessThan(1);
    });
  }
});

describe('reconexão no barco', () => {
  it('sem escolher: o barco espera quem caiu; voltando, a escolha abre de novo; caindo de vez, volta ao barco', async () => {
    const store = new MemoryStore();
    const rec = record({ pronto: true, embarcou: true });
    const token = 'tok-barco-reconecta-1';
    await saved(store, rec, token);
    const { h, bot } = await boardRoom(boatRoomId(rec.id), store, token, 541, 30_000);
    h.tick(20);
    // caiu na viagem: o barco espera (mais tempo que a viagem inteira)
    h.disconnect(bot);
    h.tick(400);
    const b2 = await h.connectAsync({ token, seed: 542 });
    expect(b2.robot.you).toBeDefined();
    expect(b2.robot.barco?.fase).toBe('viagem');
    expect(b2.robot.barco?.ponteEmS).toBeGreaterThan(5);
    // na ponte, cai e volta: a tela da escolha vem de novo
    expect(sailToBridge(h, b2)).toBeGreaterThan(0);
    h.disconnect(b2);
    h.tick(5);
    const b3 = await h.connectAsync({ token, seed: 543 });
    expect(b3.robot.barco?.fase).toBe('escolha');
    expect(b3.robot.travessia?.pode).toBe(true);
    // cai de vez: sai pelo prazo, grava ainda na travessia; o Delta manda de volta ao barco (viagem nova)
    h.disconnect(b3);
    h.tick(620);
    expect(h.core.entityOfToken(token)).toBeUndefined();
    const row = (await store.getOrCreatePlayer(token)).data;
    expect(row.stage).toBe('travessia');
    const hd = new Harness({ mapId: 'delta', content: false, store });
    const bd = await hd.connectAsync({ token, seed: 544 });
    expect(bd.robot.trocarSala).toEqual({ mapId: boatRoomId(rec.id), motivo: 'registro' });
    const { bot: bn } = await boardRoom(boatRoomId(rec.id), store, token, 545);
    expect(bn.robot.barco?.fase).toBe('viagem');
  });

  it('depois de escolher: caindo no meio da aula, volta direto para a margem escolhida', async () => {
    const store = new MemoryStore();
    const rec = record({ pronto: true, embarcou: true });
    const token = 'tok-barco-reconecta-2';
    await saved(store, rec, token);
    const { h, bot } = await boardRoom(boatRoomId(rec.id), store, token, 551, 2000);
    expect(sailToBridge(h, bot)).toBeGreaterThan(0);
    h.game(bot, GAME_MSG.travessia, choice('esquerda'));
    // a escolha já foi gravada
    expect((await store.getOrCreatePlayer(token)).data.stage).toBe('margem');
    h.tick(60);
    h.disconnect(bot);
    h.tick(80);
    expect(h.core.entityOfToken(token)).toBeUndefined();
    await nextTask();
    // o barco não aceita mais: manda para a margem
    const { bot: bb } = await boardRoom(boatRoomId(rec.id), store, token, 552);
    expect(bb.robot.you).toBeUndefined();
    expect(bb.robot.trocarSala).toEqual({ mapId: 'margem_esquerda', motivo: 'registro' });
    const hd = new Harness({ mapId: 'delta', content: false, store });
    const bd = await hd.connectAsync({ token, seed: 553 });
    expect(bd.robot.trocarSala).toEqual({ mapId: 'margem_esquerda', motivo: 'registro' });
    const hm = new Harness({ mapId: 'margem_esquerda', content: false, store });
    const bm = await hm.connectAsync({ token, seed: 554 });
    expect(bm.robot.welcome?.mapId).toBe('margem_esquerda');
    expect(hm.core.entityOf(bm.sid)!.classId).toBe(D.institutionsById.get(choice('esquerda').institution)!.classe);
  });
});
