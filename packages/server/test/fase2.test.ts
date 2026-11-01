/**
 * Servidor da Fase 2: criação de personagem, Máquina de Visual, missão concluída por kill,
 * travessia que troca o mapa e o registro, e reconexão que mantém o progresso. Núcleo com robôs
 * em canais em memória (200 ms de RTT e 2% de perda nas entradas e snapshots; as mensagens de jogo
 * chegam na hora).
 */
import { describe, expect, it } from 'vitest';
import { getData } from '@pqp/shared/data';
import { GAME_MSG } from '@pqp/shared/net';
import { getMap } from '@pqp/shared/map';
import { spawnEnemy, spawnLoot } from '@pqp/shared/sim';
import { relevel } from '@pqp/shared/sim/spawn';
import { gainXp } from '@pqp/shared/game/progression';
import { defaultAppearance } from '@pqp/shared/game/appearance';
import { createCharacter } from '@pqp/shared/game/travessia';
import { deltaChainMissions, newPlayerRecord } from '@pqp/shared/game/record';
import { refreshMissions } from '@pqp/shared/game/missions';
import type { CharacterLook } from '@pqp/shared/game/types';
import { fightBrain, steerTo } from '../src/bot/robot';
import { GameServerCore } from '../src/core';
import { MemoryStore } from '../src/persistence/store';
import { Harness, type Bot } from './harness';
import { boardRoom, doAula, embark, sailToBridge } from './boat';

const DELTA = getMap('delta');
const marker = (id: string) => {
  const m = DELTA.markers.find((x) => x.id === id);
  if (!m) throw new Error(`marcador ${id} não existe no Delta`);
  return m;
};

/** Teleporta o personagem do robô (testes: pula a caminhada). */
function teleport(h: Harness, bot: Bot, x: number, y: number): void {
  const e = h.core.entityOf(bot.sid)!;
  e.x = x;
  e.y = y;
  e.moveTo = undefined;
  e.path = undefined;
}

function create(h: Harness, bot: Bot, name = 'Zé do Remo') {
  const ap = { ...defaultAppearance(), hair: getData().appearance.cortes[3]!.id };
  h.game(bot, GAME_MSG.criarPersonagem, { name, appearance: ap });
  return ap;
}

describe('criação de personagem', () => {
  it('sem personagem: perfil criado=false e nada no mapa; criar_personagem valida, nasce no Delta e manda o welcome', () => {
    const h = new Harness({ mapId: 'delta', content: false });
    const bot = h.connect({ seed: 201 });
    expect(bot.robot.you).toBeUndefined();
    expect(bot.robot.perfil?.criado).toBe(false);
    expect(h.core.entityOf(bot.sid)).toBeUndefined();
    h.tick(3);
    expect(bot.robot.snapsReceived).toBe(0);
    // nome inválido: recusa com aviso e continua sem personagem
    h.game(bot, GAME_MSG.criarPersonagem, { name: 'x', appearance: defaultAppearance() });
    expect(bot.robot.avisos.some((a) => a.tipo === 'erro')).toBe(true);
    expect(bot.robot.you).toBeUndefined();
    // aparência inválida também
    h.game(bot, GAME_MSG.criarPersonagem, { name: 'Zé do Remo', appearance: { ...defaultAppearance(), face: 'nao_existe' } });
    expect(bot.robot.you).toBeUndefined();
    const ap = create(h, bot);
    expect(bot.robot.you).toBeDefined();
    expect(bot.robot.welcome?.mapId).toBe('delta');
    expect(bot.robot.perfil?.criado).toBe(true);
    expect(bot.robot.perfil?.name).toBe('Zé do Remo');
    expect(bot.robot.perfil?.stage).toBe('delta');
    expect(bot.robot.missao?.ativas.map((m) => m.id)).toContain('delta_01_cadastro');
    expect(bot.robot.missao?.alvo?.npc).toBe('seu_jaco');
    const e = h.core.entityOf(bot.sid)!;
    expect(e.defId).toBe('delta');
    expect(e.level).toBe(1);
    expect(e.deltaRookie).toBe(true);
    expect(e.levelCap).toBe(7);
    // o Seu Jacó acompanha no Delta
    expect(h.core.companionOf(bot.sid)?.defId).toBe('seu_jaco');
    // o visual vai no lk do snapshot
    h.tick(10);
    const lk = bot.robot.me()?.lk as CharacterLook | undefined;
    expect(lk?.hair).toBe(ap.hair);
    expect(lk?.outfit.tier).toBe('delta');
    // cadastrar de novo é recusado
    const n = bot.robot.avisos.length;
    create(h, bot, 'Outro Nome');
    expect(bot.robot.avisos.length).toBe(n + 1);
    expect(h.core.recordOf(bot.sid)?.name).toBe('Zé do Remo');
  });

  it('hello sem token no Delta: o token gerado chega no welcome depois do cadastro', async () => {
    const core = new GameServerCore({ mapId: 'delta', content: false, log: () => undefined, store: new MemoryStore() });
    expect(await core.join('s', { token: '' })).toBeNull();
    const out1 = core.takeOutbox();
    expect(out1.some((o) => o.type === GAME_MSG.perfil)).toBe(true);
    core.onGameMessage('s', GAME_MSG.criarPersonagem, { name: 'Dona Cida', appearance: defaultAppearance() });
    const wel = core.takeOutbox().find((o) => o.type === 'welcome')?.msg as { token?: string; you: number } | undefined;
    expect(wel?.token).toMatch(/[0-9a-f-]{36}/);
    expect(core.entityOf('s')?.id).toBe(wel?.you);
  });
});

describe('Máquina de Visual', () => {
  it('muda só perto da máquina; o visual novo vai no lk e conta no objetivo opcional do cadastro', () => {
    const h = new Harness({ mapId: 'delta', content: false });
    const bot = h.connect({ seed: 202 });
    create(h, bot);
    const novo = getData().appearance.cortes[7]!.id;
    // longe
    const mq = marker('maquina_visual_delta');
    teleport(h, bot, mq.x + 10, mq.y);
    h.game(bot, GAME_MSG.maquinaVisual, { change: { hair: novo }, maquina: 'maquina_visual_delta' });
    expect(bot.robot.avisos.at(-1)?.tipo).toBe('erro');
    expect(h.core.recordOf(bot.sid)!.appearance.hair).not.toBe(novo);
    // perto (sem dizer qual máquina: o servidor acha a mais perto)
    teleport(h, bot, mq.x, mq.y + 0.5);
    h.game(bot, GAME_MSG.maquinaVisual, { change: { hair: novo, palette: 'delta_azul_rio' } });
    const rec = h.core.recordOf(bot.sid)!;
    expect(rec.appearance.hair).toBe(novo);
    expect(rec.appearance.palette).toBe('delta_azul_rio');
    expect(bot.robot.perfil?.look.hair).toBe(novo);
    expect(rec.missions.progresso['delta_01_cadastro']?.[1]).toEqual([1]);
    h.tick(10);
    const lk = bot.robot.me()?.lk as CharacterLook | undefined;
    expect(lk?.hair).toBe(novo);
    expect(lk?.outfit.palette).toBe(1);
    // campo fora da lista (a silhueta) é recusado
    h.game(bot, GAME_MSG.maquinaVisual, { change: { archetype: 'idol' } });
    expect(bot.robot.avisos.at(-1)?.tipo).toBe('erro');
  });
});

describe('missões no servidor', () => {
  it('o cadastro anda com conversa, joystick, toque no chão e lugar; o remo termina com 3 siris derrotados', () => {
    const h = new Harness({ mapId: 'delta', content: false });
    const bot = h.connect({ seed: 203, rttMs: 200, loss: 0.02 });
    create(h, bot);
    const rec = () => h.core.recordOf(bot.sid)!;
    // fala com o Seu Jacó que acompanha (está ao lado)
    h.tick(2);
    h.game(bot, GAME_MSG.falar, { npcId: 'seu_jaco' });
    expect(bot.robot.dialogo?.npc).toBe('seu_jaco');
    expect(bot.robot.dialogo?.fala.length).toBeGreaterThan(0);
    expect(rec().missions.progresso['delta_01_cadastro']?.[0]).toEqual([1]);
    // joystick e toque no chão
    bot.brain = (r) => r.setStick(1, 0);
    h.tick(12);
    bot.brain = (r) => r.setStick(0, 0);
    h.tick(10);
    expect(rec().tutorial.controles).toContain('andar_joystick');
    const e = h.core.entityOf(bot.sid)!;
    bot.robot.command({ c: 'ir_ate', x: e.x, y: e.y + 1 });
    h.tick(20);
    expect(rec().tutorial.controles).toContain('tocar_no_chao');
    // vai até a palafita do Seu Jacó
    const pal = marker('lugar_palafitas_do_delta');
    teleport(h, bot, pal.x, pal.y);
    h.tick(12);
    expect(rec().missions.concluidas).toContain('delta_01_cadastro');
    expect(rec().story_flags).toContain('delta_cadastro_feito');
    expect(rec().missions.ativas).toContain('delta_02_remar');
    expect(bot.robot.avisos.some((a) => a.texto.startsWith('Missão concluída'))).toBe(true);
    // remar: cais, auto-caminho, palafitas
    const cais = marker('lugar_cais_do_delta');
    teleport(h, bot, cais.x, cais.y);
    h.tick(12);
    h.game(bot, GAME_MSG.tutorialPasso, { controle: 'auto_caminho' });
    teleport(h, bot, pal.x, pal.y);
    h.tick(12);
    const m2 = bot.robot.missao?.ativas.find((m) => m.id === 'delta_02_remar');
    expect(m2?.indice).toBe(3);
    expect(bot.robot.missao?.alvo?.missao).toBe('delta_02_remar');
    // 3 siris no barco: o ataque é sozinho (alvo automático e básico)
    const xp0 = rec().xp + rec().level * 1000;
    for (let i = 0; i < 3; i++) {
      const me = h.core.entityOf(bot.sid)!;
      const siri = spawnEnemy(h.world, 'siri_do_mangue', me.x + 0.9, me.y);
      siri.hp = 1;
      bot.brain = fightBrain();
      const took = h.runUntil(() => siri.dead || !h.world.entities.has(siri.id), 400);
      expect(took).toBeGreaterThanOrEqual(0);
      h.tick(3);
    }
    bot.brain = undefined;
    h.tick(5);
    expect(rec().missions.concluidas).toContain('delta_02_remar');
    expect(rec().story_flags).toContain('delta_aprendeu_remar');
    expect(rec().tutorial.controles).toContain('alvo_automatico');
    // a recompensa de grupo (o Seu Jacó conta) deu XP; o registro e a entidade andam juntos
    expect(rec().xp + rec().level * 1000).toBeGreaterThan(xp0);
    const me = h.core.entityOf(bot.sid)!;
    expect(me.level).toBe(rec().level);
    expect(me.xp).toBe(rec().xp);
    expect(rec().missions.ativas).toContain('delta_03_briga_no_mangue');
  });
});

/** Registro pronto para a travessia: Delta feito, Bruno Ferro derrotado, nível 8. */
function readyToCross(id: string) {
  const rec = newPlayerRecord(id, 'Visitante');
  expect(createCharacter(rec, 'Maria Remo', defaultAppearance()).ok).toBe(true);
  rec.missions = { ativas: [], concluidas: deltaChainMissions().filter((m) => m !== 'travessia_08'), progresso: {} };
  rec.story_flags.push('delta_cadastro_feito', 'delta_aprendeu_remar', 'delta_aprendeu_lutar', 'delta_aprendeu_item', 'delta_aprendeu_desconfiar', 'delta_chegou_ao_cais', 'delta_bruno_ferro_derrotado');
  rec.level = 8;
  rec.xp = 0;
  rec.stage = 'travessia';
  refreshMissions(rec);
  return rec;
}

describe('travessia', () => {
  it('embarca no Delta, escolhe no barco e chega no QG: o registro troca (margem, instituição, classe, guia)', async () => {
    const store = new MemoryStore();
    const token = 'tok-travessia-0001';
    const rec = readyToCross('11111111-2222-4333-8444-555555555555');
    await store.savePlayer({ id: rec.id, token, name: rec.name, data: rec });
    const h = new Harness({ mapId: 'delta', content: true, store });
    const bot = await h.connectAsync({ token, seed: 204 });
    expect(bot.robot.welcome?.mapId).toBe('delta');
    expect(bot.robot.perfil?.stage).toBe('travessia');
    h.tick(5);
    const D = getData();
    const inst = D.institutions.instituicoes.find((i) => i.margem === 'esquerda')!;
    const guide = D.guides.guias.find((g) => g.margem === 'esquerda')!;
    // no Delta, a escolha direta é recusada: ela é no barco, na altura da ponte
    h.game(bot, GAME_MSG.travessia, { side: 'esquerda', institution: inst.id, guide: guide.id });
    expect(bot.robot.avisos.at(-1)?.tipo).toBe('erro');
    expect(h.core.recordOf(bot.sid)!.stage).toBe('travessia');
    // longe do Seu Jacó e do cais: embarcar é recusado
    const comp = h.core.companionOf(bot.sid)!;
    h.world.entities.delete(comp.id);
    const jacoCais = marker('npc_seu_jaco_cais');
    teleport(h, bot, jacoCais.x + 30, jacoCais.y + 30);
    h.game(bot, GAME_MSG.dialogoOpcao, { npcId: 'seu_jaco', opcao: 'travessia' });
    expect(bot.robot.avisos.at(-1)?.tipo).toBe('erro');
    expect(bot.robot.trocarSala).toBeUndefined();
    // no cais, com o Seu Jacó: embarca e vai para o barco dele
    teleport(h, bot, jacoCais.x + 0.9, jacoCais.y);
    const eid = bot.robot.you!;
    const room = await embark(h, bot);
    expect(room).toBe(`barco:${rec.id}`);
    expect(h.world.entities.has(eid)).toBe(false);
    expect(h.core.entityOf(bot.sid)).toBeUndefined();
    // no barco: viaja até a ponte, escolhe errado (guia da outra margem) e depois certo
    const { h: hb, bot: bb } = await boardRoom(room!, store, token, 214);
    expect(bb.robot.welcome?.mapId).toBe(room);
    expect(sailToBridge(hb, bb)).toBeGreaterThan(0);
    expect(bb.robot.travessia?.pode).toBe(true);
    const guideDir = D.guides.guias.find((g) => g.margem === 'direita')!;
    hb.game(bb, GAME_MSG.travessia, { side: 'esquerda', institution: inst.id, guide: guideDir.id });
    expect(bb.robot.avisos.at(-1)?.tipo).toBe('erro');
    hb.game(bb, GAME_MSG.travessia, { side: 'esquerda', institution: inst.id, guide: guide.id });
    expect(bb.robot.perfil?.stage).toBe('margem');
    // a aula e a chegada: Fase 3, a chegada é a Margem Esquerda (qg_esquerda virou apelido dela)
    expect(await doAula(hb, bb)).toBeGreaterThanOrEqual(0);
    expect(bb.robot.trocarSala).toEqual({ mapId: 'margem_esquerda', motivo: 'travessia' });
    expect(hb.core.entityOf(bb.sid)).toBeUndefined();
    // o registro gravado já é da margem
    const saved = (await store.getOrCreatePlayer(token)).data;
    expect(saved.stage).toBe('margem');
    expect(saved.side).toBe('esquerda');
    expect(saved.institution).toBe(inst.id);
    expect(saved.class).toBe(inst.classe);
    expect(saved.guide_id).toBe(guide.id);
    expect(saved.story_flags).toContain('travessia_feita');
    // a sala do QG da Esquerda recebe o personagem
    const h2 = new Harness({ mapId: 'qg_esquerda', content: true, store });
    const b2 = await h2.connectAsync({ token, seed: 205 });
    // o núcleo criado pelo apelido roda a margem de verdade
    expect(b2.robot.welcome?.mapId).toBe('margem_esquerda');
    const e2 = h2.core.entityOf(b2.sid)!;
    expect(e2.classId).toBe(inst.classe);
    expect(e2.side).toBe('esquerda');
    expect(e2.level).toBe(8);
    expect(e2.levelCap).toBeUndefined();
    expect(e2.deltaRookie).toBeUndefined();
    expect(e2.loadout?.b1).toBeTruthy();
    expect(h2.core.companionOf(b2.sid)).toBeUndefined();
    h2.tick(10);
    const lk = b2.robot.me()?.lk as CharacterLook | undefined;
    expect(lk?.outfit.tier).toBe('base');
    expect(lk?.outfit.institutionId).toBe(inst.id);
    // voltar à sala do Delta manda para o QG
    const h3 = new Harness({ mapId: 'delta', content: false, store });
    const b3 = await h3.connectAsync({ token, seed: 206 });
    expect(b3.robot.you).toBeUndefined();
    expect(b3.robot.trocarSala).toEqual({ mapId: 'margem_esquerda', motivo: 'registro' });
  });

  it('a sala do protótipo (sandbox) sem pedido explícito manda para o mapa do registro', async () => {
    const core = new GameServerCore({ content: false, log: () => undefined, store: new MemoryStore() });
    expect(core.sandbox).toBe(true);
    expect(await core.join('a', { token: 'tok-sandbox-redir-1' }, { explicit: false })).toBeNull();
    expect(core.takeOutbox().find((o) => o.type === GAME_MSG.trocarSala)?.msg).toEqual({ mapId: 'delta', motivo: 'registro' });
    const w = await core.join('b', { token: 'tok-sandbox-redir-2', archetypeId: 'idol' }, { explicit: true });
    expect(w?.mapId).toBe('prototipo_delta');
    expect(core.entityOf('b')?.archetypeId).toBe('idol');
  });
});

// ---------------------------------------------------------------------------
// Fluxo completo: criar personagem → Delta 1 a 7 → Bruno Ferro → nível 8 → travessia → QG

/** Teleporta o jogador e o Seu Jacó que acompanha (o Jacó fica ao lado). */
function moveParty(h: Harness, bot: Bot, x: number, y: number): void {
  teleport(h, bot, x, y);
  const c = h.core.companionOf(bot.sid);
  if (c && !c.dead) {
    c.x = x + 0.8;
    c.y = y;
    c.moveTo = undefined;
    c.path = undefined;
  }
}

/** Mantém o jogador vivo (atalho de teste: a luta aqui é o caminho, não o balanceamento). */
function keepAlive(h: Harness, bot: Bot): void {
  const e = h.core.entityOf(bot.sid);
  if (e && !e.dead && e.downedUntil === undefined) e.hp = e.stats.hpMax;
}

/**
 * Luta de verdade com o alvo automático e os botões, contra inimigos que nascem ao lado. Atalho de
 * teste: vida dos inimigos cortada (`hp`), para a luta não levar minutos.
 */
function fight(h: Harness, bot: Bot, spot: { x: number; y: number }, specs: { id: string; n: number; tier?: 'normal' | 'elite' | 'chefe'; hp?: number }[], maxTicks = 3000): number {
  moveParty(h, bot, spot.x, spot.y);
  h.tick(2);
  const foes: ReturnType<typeof spawnEnemy>[] = [];
  let k = 0;
  for (const s of specs) {
    for (let i = 0; i < s.n; i++, k++) {
      const a = (k / 8) * Math.PI * 2;
      const f = spawnEnemy(h.world, s.id, spot.x + Math.cos(a) * 1.6, spot.y + Math.sin(a) * 1.6, s.tier ? { tier: s.tier } : {});
      f.hp = Math.min(f.hp, s.hp ?? 1);
      foes.push(f);
    }
  }
  const brain = fightBrain();
  bot.brain = (r) => {
    keepAlive(h, bot);
    brain(r);
  };
  const took = h.runUntil(() => foes.every((f) => f.dead || !h.world.entities.has(f.id)), maxTicks);
  bot.brain = undefined;
  bot.robot.setStick(0, 0);
  h.tick(4);
  return took;
}

/** Vida baixa e toque na poção até a missão andar (a poção pode estar em recarga). */
function drinkPotion(h: Harness, bot: Bot, missionId: string, maxTicks = 800): number {
  let last = -100;
  bot.brain = (r) => {
    const e = h.core.entityOf(bot.sid);
    if (e) e.hp = Math.max(1, Math.round(e.stats.hpMax * 0.2));
    if (!r.hasPending('item') && r.lastTick - last > 20) {
      r.command({ c: 'item' });
      last = r.lastTick;
    }
  };
  const t = h.runUntil(() => h.core.recordOf(bot.sid)!.missions.concluidas.includes(missionId), maxTicks);
  bot.brain = undefined;
  return t;
}

describe('fluxo completo da Fase 2', () => {
  it('criar personagem → missões do Delta → nível 7 → Bruno Ferro → nível 8 → travessia → QG da Esquerda', async () => {
    const store = new MemoryStore();
    const token = 'tok-fluxo-completo-0001';
    const h = new Harness({ mapId: 'delta', content: false, store });
    const bot = await h.connectAsync({ token, seed: 301, rttMs: 200, loss: 0.02 });
    expect(bot.robot.perfil?.criado).toBe(false);
    const rec = () => h.core.recordOf(bot.sid)!;
    const done = (id: string) => rec().missions.concluidas.includes(id);
    const arena = marker('chefe_bruno_ferro');
    const pal = marker('lugar_palafitas_do_delta');
    const cais = marker('lugar_cais_do_delta');

    // --- criação
    create(h, bot, 'Zé Travessia');
    expect(bot.robot.you).toBeDefined();
    expect(rec().stage).toBe('delta');
    expect(rec().level).toBe(1);
    h.tick(4);

    // --- 1: cadastro (conversa, espelho opcional, joystick, toque no chão, palafita)
    h.game(bot, GAME_MSG.falar, { npcId: 'seu_jaco' });
    const mq = marker('maquina_visual_delta');
    moveParty(h, bot, mq.x, mq.y + 0.5);
    h.tick(2);
    h.game(bot, GAME_MSG.maquinaVisual, { change: { hair_color: getData().appearance.coresCabelo[2]!.id } });
    bot.brain = (r) => r.setStick(0, 1);
    h.tick(8);
    bot.brain = (r) => r.setStick(0, 0);
    h.tick(8);
    const e0 = h.core.entityOf(bot.sid)!;
    bot.robot.command({ c: 'ir_ate', x: e0.x, y: e0.y - 1 });
    h.tick(20);
    moveParty(h, bot, pal.x, pal.y);
    h.tick(12);
    expect(done('delta_01_cadastro')).toBe(true);

    // --- 2: remar (cais, auto-caminho, palafitas, 3 siris)
    moveParty(h, bot, cais.x, cais.y);
    h.tick(12);
    h.game(bot, GAME_MSG.tutorialPasso, { controle: 'auto_caminho' });
    moveParty(h, bot, pal.x, pal.y);
    h.tick(12);
    expect(fight(h, bot, arena, [{ id: 'siri_do_mangue', n: 3 }])).toBeGreaterThanOrEqual(0);
    expect(done('delta_02_remar')).toBe(true);

    // --- 3: briga no mangue (trocar alvo 2x, 6 siris, 3 saques)
    moveParty(h, bot, arena.x, arena.y);
    h.tick(2);
    for (let i = 0; i < 2; i++) {
      const me = h.core.entityOf(bot.sid)!;
      bot.robot.command({ c: 'alvo', x: me.x + 1, y: me.y });
      h.tick(10);
    }
    expect(fight(h, bot, arena, [{ id: 'siri_do_mangue', n: 6 }])).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < 3 && !done('delta_03_briga_no_mangue'); i++) {
      const me = h.core.entityOf(bot.sid)!;
      spawnLoot(h.world, me.x + 0.2, me.y, { currency: { semente: 1 } });
      h.tick(10);
    }
    h.tick(20);
    expect(done('delta_03_briga_no_mangue')).toBe(true);

    // --- 4: mosquitos (12) e a poção
    expect(fight(h, bot, arena, [{ id: 'mosquito_do_delta', n: 12 }])).toBeGreaterThanOrEqual(0);
    const potions0 = h.core.entityOf(bot.sid)!.loadout!.itemCount ?? 0;
    expect(potions0).toBeGreaterThan(0);
    expect(drinkPotion(h, bot, 'delta_04_mosquito_nao_negocia')).toBeGreaterThanOrEqual(0);
    expect(done('delta_04_mosquito_nao_negocia')).toBe(true);

    // --- 5: chopindita barata (feira, escolha no diálogo, capangas + elite, poção)
    const feira = marker('lugar_feira_de_pulgas');
    moveParty(h, bot, feira.x, feira.y);
    h.tick(12);
    h.game(bot, GAME_MSG.falar, { npcId: 'seu_jaco' });
    expect(bot.robot.dialogo?.opcoes.map((o) => o.id)).toContain('escolha:desconfiar');
    h.game(bot, GAME_MSG.dialogoOpcao, { npcId: 'seu_jaco', opcao: 'escolha:desconfiar' });
    expect(fight(h, bot, arena, [{ id: 'capanga_do_capataz', n: 5 }, { id: 'capanga_do_capataz', n: 1, tier: 'elite' }])).toBeGreaterThanOrEqual(0);
    expect(drinkPotion(h, bot, 'delta_05_chopindita_barata')).toBeGreaterThanOrEqual(0);
    expect(rec().item_count).toBe(potions0 - 2);
    expect(done('delta_05_chopindita_barata')).toBe(true);

    // --- 6: a fila e o boleto (fila, automático, cobradores e capangas, levantar o Seu Jacó)
    const fila = marker('fila_do_posto_do_delta');
    moveParty(h, bot, fila.x, fila.y);
    h.tick(12);
    bot.robot.command({ c: 'auto', on: true });
    h.tick(10);
    bot.robot.command({ c: 'auto', on: false });
    h.tick(10);
    expect(fight(h, bot, arena, [{ id: 'cobrador_do_capataz', n: 4 }, { id: 'capanga_do_capataz', n: 3 }])).toBeGreaterThanOrEqual(0);
    // o Seu Jacó cai ao lado; ficar 3 s perto levanta
    bot.brain = (r) => {
      keepAlive(h, bot);
      const c = h.core.companionOf(bot.sid);
      if (c && c.downedUntil !== undefined) steerTo(r, c.x, c.y, 0.7);
      else r.setStick(0, 0);
    };
    const revived = h.runUntil(() => done('delta_06_a_fila_e_o_boleto'), 400);
    bot.brain = undefined;
    expect(revived).toBeGreaterThanOrEqual(0);
    expect(h.eventsOf('revive').length).toBeGreaterThan(0);

    // --- nível 7 antes do chefe (o teto do Delta é o 7)
    // só com os inimigos pedidos pelas missões (sem os bandos do mapa) o novato chega no 6
    expect(rec().level).toBeGreaterThanOrEqual(5);
    if (rec().level < 7) {
      // atalho de teste: o XP que os bandos do mapa dariam
      const e = h.core.entityOf(bot.sid)!;
      gainXp(rec(), 1_000_000);
      expect(rec().level).toBe(7);
      relevel(h.world, e, 7);
      e.xp = rec().xp;
    }
    expect(rec().level).toBe(7);
    expect(h.core.entityOf(bot.sid)!.levelCap).toBe(7);
    // XP a mais não passa do 7 sem o Bruno Ferro
    gainXp(rec(), 1_000_000);
    expect(rec().level).toBe(7);

    // --- 7: o barco do vizinho (cais, capangas, Bruno Ferro, devolver o barco)
    moveParty(h, bot, cais.x, cais.y);
    h.tick(12);
    expect(fight(h, bot, arena, [{ id: 'capanga_do_capataz', n: 4 }, { id: 'cobrador_do_capataz', n: 2 }])).toBeGreaterThanOrEqual(0);
    const tel0 = h.eventsOf('telegraph').length;
    // chefe com vida cortada, mas com tempo para soltar o aviso no chão
    const bossHp = 400;
    expect(fight(h, bot, arena, [{ id: 'bruno_ferro_chefe', n: 1, tier: 'chefe', hp: bossHp }], 6000)).toBeGreaterThanOrEqual(0);
    expect(h.eventsOf('telegraph').length).toBeGreaterThan(tel0);
    expect(rec().missions.ativas).toContain('delta_07_o_barco_do_vizinho');
    moveParty(h, bot, cais.x, cais.y);
    h.tick(4);
    h.game(bot, GAME_MSG.falar, { npcId: 'seu_jaco' });
    expect(done('delta_07_o_barco_do_vizinho')).toBe(true);
    expect(rec().story_flags).toContain('delta_bruno_ferro_derrotado');

    // --- nível 8 e a travessia ativa
    expect(rec().level).toBe(8);
    expect(rec().stage).not.toBe('margem');
    h.tick(4);
    expect(h.core.entityOf(bot.sid)!.level).toBe(8);
    // o 8 segura até atravessar
    expect(h.core.entityOf(bot.sid)!.levelCap).toBe(8);
    expect(rec().missions.ativas).toContain('travessia_08');
    for (const m of deltaChainMissions().filter((x) => x !== 'travessia_08')) expect(rec().missions.concluidas).toContain(m);

    // --- travessia: falar com o Seu Jacó no cais, embarcar, viajar até a ponte e escolher no barco
    h.game(bot, GAME_MSG.falar, { npcId: 'seu_jaco' });
    expect(bot.robot.dialogo?.opcoes.map((o) => o.id)).toContain('travessia');
    const pid = rec().id;
    const room = await embark(h, bot);
    expect(room).toBe(`barco:${pid}`);
    expect(h.core.entityOf(bot.sid)).toBeUndefined();
    const { h: hb, bot: bb } = await boardRoom(room!, store, token, 303);
    expect(sailToBridge(hb, bb)).toBeGreaterThan(0);
    expect(bb.robot.travessia?.pode).toBe(true);
    const esq = bb.robot.travessia!.margens.find((m) => m.side === 'esquerda')!;
    expect(esq.instituicoes.length).toBe(4);
    const inst = esq.instituicoes[0]!;
    const guia = esq.guias[0]!;
    hb.game(bb, GAME_MSG.travessia, { side: 'esquerda', institution: inst.id, guide: guia.id });
    expect(bb.robot.perfil?.stage).toBe('margem');
    expect(await doAula(hb, bb)).toBeGreaterThanOrEqual(0);
    expect(bb.robot.trocarSala).toEqual({ mapId: 'margem_esquerda', motivo: 'travessia' });

    // --- chega no QG da Esquerda com tudo gravado
    await store.flush();
    const h2 = new Harness({ mapId: 'qg_esquerda', content: true, store });
    const b2 = await h2.connectAsync({ token, seed: 302 });
    expect(b2.robot.welcome?.mapId).toBe('margem_esquerda');
    const r2 = h2.core.recordOf(b2.sid)!;
    expect(r2.name).toBe('Zé Travessia');
    expect(r2.stage).toBe('margem');
    expect(r2.side).toBe('esquerda');
    expect(r2.institution).toBe(inst.id);
    expect(r2.class).toBe(inst.classe);
    expect(r2.guide_id).toBe(guia.id);
    expect(r2.level).toBe(8);
    expect(r2.story_flags).toEqual(expect.arrayContaining(['delta_bruno_ferro_derrotado', 'travessia_feita', 'margem_esquerda']));
    expect(r2.missions.concluidas).toContain('travessia_08');
    expect(r2.missions.ativas.length).toBeGreaterThan(0);
    const e2 = h2.core.entityOf(b2.sid)!;
    expect(e2.classId).toBe(inst.classe);
    expect(e2.level).toBe(8);
    const qgSpawn = getMap('qg_esquerda').markers.find((m) => m.kind === 'spawn_jogador')!;
    expect(Math.hypot(e2.x - qgSpawn.x, e2.y - qgSpawn.y)).toBeLessThan(1);
    h2.tick(10);
    expect(b2.robot.snapsReceived).toBeGreaterThan(0);
    expect((b2.robot.me()?.lk as CharacterLook | undefined)?.outfit.tier).toBe('base');
  }, 60_000);
});

describe('reconexão', () => {
  it('voltar com o mesmo token (no mundo ou depois de reiniciar o servidor) mantém o progresso', async () => {
    const store = new MemoryStore();
    const token = 'tok-reconecta-0001';
    const h = new Harness({ mapId: 'delta', content: false, store, offlineAutoMs: 2000 });
    const a = await h.connectAsync({ token, seed: 207 });
    create(h, a, 'Dona Cida');
    h.tick(2);
    h.game(a, GAME_MSG.falar, { npcId: 'seu_jaco' });
    const e = h.core.entityOf(a.sid)!;
    e.semente = (e.semente ?? 0) + 17;
    const sem = e.semente;
    h.tick(5);
    // cai e volta ainda no automático: mesmo personagem
    h.disconnect(a);
    h.tick(10);
    const b = await h.connectAsync({ token, seed: 208 });
    expect(b.robot.you).toBe(e.id);
    expect(b.robot.perfil?.name).toBe('Dona Cida');
    // cai de vez: sai do mapa depois do prazo e grava
    h.disconnect(b);
    h.tick(60);
    expect(h.core.entityOfToken(token)).toBeUndefined();
    await store.flush();
    // servidor novo, mesmo Store
    const h2 = new Harness({ mapId: 'delta', content: false, store });
    const c = await h2.connectAsync({ token, seed: 209 });
    expect(c.robot.you).toBeDefined();
    expect(c.robot.perfil?.criado).toBe(true);
    expect(c.robot.perfil?.name).toBe('Dona Cida');
    const rec = h2.core.recordOf(c.sid)!;
    expect(rec.missions.progresso['delta_01_cadastro']?.[0]).toEqual([1]);
    expect(rec.counters['fala:seu_jaco:cadastro_ficha']).toBe(1);
    expect(h2.core.entityOf(c.sid)!.semente).toBe(sem);
    expect(c.robot.missao?.ativas[0]?.id).toBe('delta_01_cadastro');
  });
});
