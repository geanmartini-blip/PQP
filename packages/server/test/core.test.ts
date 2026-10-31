/**
 * Servidor autoritativo com rede ruim simulada: 200 ms de RTT e 2% de perda (canais em memória
 * semeados), robôs que mandam as 3 últimas entradas por tick e reenviam comandos até o cack.
 */
import { describe, expect, it } from 'vitest';
import { getData } from '@pqp/shared/data';
import { INTEREST_RADIUS, POS_SCALE } from '@pqp/shared/net';
import { cooldownRate, downEntity, effectiveRange, grantXp, packMates, spawnEnemy, xpToNext, type Entity } from '@pqp/shared/sim';
import { freeze } from '@pqp/shared/sim/testkit';
import { fightBrain, steerTo } from '../src/bot/robot';
import { GameServerCore } from '../src/core';
import { MemoryStore } from '../src/persistence/store';
import { Harness } from './harness';

const SPAWN = { x: 27.5, y: 72.5 };
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('movimento com 200 ms e 2% de perda', () => {
  it('o jogador anda com o joystick e a posição do servidor chega ao destino', () => {
    const h = new Harness({ content: false });
    const bot = h.connect({ seed: 11 });
    const dest = { x: 38.5, y: 72.5 }; // cais de madeira, linha livre
    bot.brain = (r) => void steerTo(r, dest.x, dest.y, 0.2);
    const e = h.core.entityOf(bot.sid)!;
    expect(dist(e, SPAWN)).toBeLessThan(0.01);
    const took = h.runUntil(() => dist(e, dest) < 0.4, 400);
    expect(took).toBeGreaterThan(0);
    // solta o joystick: o servidor para perto do destino e o ack acompanha as entradas
    bot.brain = (r) => r.setStick(0, 0);
    h.tick(20);
    expect(dist(e, dest)).toBeLessThan(0.6);
    expect(bot.robot.lastAck).toBeGreaterThan(took);
    // o snapshot que o robô tem bate com o servidor
    const p = bot.robot.pos(bot.robot.you)!;
    expect(dist(p, e)).toBeLessThan(0.05);
  });

  it('com variação de 60 ms (pacotes fora de ordem) ainda chega e para', () => {
    const h = new Harness({ content: false });
    const bot = h.connect({ seed: 13, jitterMs: 60 });
    const dest = { x: 18.5, y: 74.5 };
    bot.brain = (r) => void steerTo(r, dest.x, dest.y, 0.2);
    const e = h.core.entityOf(bot.sid)!;
    expect(h.runUntil(() => dist(e, dest) < 0.4, 500)).toBeGreaterThan(0);
    bot.brain = (r) => r.setStick(0, 0);
    h.tick(20);
    expect(dist(e, dest)).toBeLessThan(0.6);
  });

  it('tocar no chão (ir_ate) usa o caminho A* do servidor e chega', () => {
    const h = new Harness({ content: false });
    const bot = h.connect({ seed: 12 });
    const e = h.core.entityOf(bot.sid)!;
    const dest = { x: 30.5, y: 60.5 }; // terra firme, depois das palafitas
    bot.robot.command({ c: 'ir_ate', x: dest.x, y: dest.y });
    const took = h.runUntil(() => dist(e, dest) < 0.3, 600);
    expect(took).toBeGreaterThan(0);
    expect(bot.robot.pendingCount).toBe(0);
  });
});

describe('comandos com id', () => {
  it('um comando executa exatamente uma vez apesar de perda, duplicação e repetição', () => {
    const h = new Harness({ content: false });
    const bot = h.connect({ seed: 21, loss: 0.1, duplicate: 0.3 });
    const e = h.core.entityOf(bot.sid)!;
    e.hp = e.stats.hpMax * 0.4;
    const before = e.loadout!.itemCount!;
    const id = bot.robot.command({ c: 'item' });
    h.runUntil(() => bot.robot.pendingCount === 0, 100);
    expect(bot.robot.lastCack).toBeGreaterThanOrEqual(id);
    // passa a recarga da poção (10 s) e o mesmo comando chega de novo (pacote velho repetido)
    h.tick(240);
    for (let i = 0; i < 5; i++) h.core.onInput(bot.sid, { inputs: [], cmds: [{ id, c: 'item' }], ackTick: 0, rtt: 200 });
    h.tick(5);
    expect(e.loadout!.itemCount).toBe(before - 1);
    const casts = h.eventsOf('cast').filter((c) => c.src === e.id && c.ability === 'usar_pocao');
    expect(casts.length).toBe(1);
    // um comando novo (id maior) ainda funciona
    bot.robot.command({ c: 'item' });
    h.tick(20);
    expect(e.loadout!.itemCount).toBe(before - 2);
  });

  it('a recarga é respeitada mesmo apertando o botão sem parar', () => {
    const h = new Harness({ content: false });
    const bot = h.connect({ seed: 31 });
    const e = h.core.entityOf(bot.sid)!;
    const dummy = spawnEnemy(h.world, 'turbina_desgovernada', SPAWN.x + 2.5, SPAWN.y);
    freeze(dummy);
    dummy.hp = dummy.stats.hpMax = 1e7;
    let t = 0;
    let sawCd = false;
    bot.brain = (r) => {
      if (t++ % 3 === 0) r.command({ c: 'habilidade', botao: 2 });
      if ((r.hud?.cd[1] ?? 0) > 0) sawCd = true;
    };
    h.tick(600); // 30 s
    const ab = e.loadout!.b2;
    const casts = h.eventsOf('cast').filter((c) => c.src === e.id && c.ability === ab);
    expect(casts.length).toBeGreaterThanOrEqual(2);
    const cdTicks = getData().abilities.get(ab)!.cooldownS * 20;
    const minGap = Math.floor(cdTicks / cooldownRate(e)) - 2;
    for (let i = 1; i < casts.length; i++) expect(casts[i]!.tick - casts[i - 1]!.tick).toBeGreaterThanOrEqual(minGap);
    expect(sawCd).toBe(true);
    // nenhum comando ficou sem confirmação
    expect(bot.robot.pendingCount).toBeLessThanOrEqual(1);
  });
});

describe('combate só com alvo automático e botões', () => {
  it('o robô mata um inimigo sem escolher alvo nem mirar', () => {
    const h = new Harness({ content: false });
    const bot = h.connect({ seed: 41 });
    const me = h.core.entityOf(bot.sid)!;
    const siri = spawnEnemy(h.world, 'siri_do_mangue', SPAWN.x + 4, SPAWN.y);
    bot.brain = fightBrain();
    const took = h.runUntil(() => !h.world.entities.has(siri.id) || siri.dead, 900);
    expect(took).toBeGreaterThan(0);
    expect(h.eventsOf('death').some((d) => d.dst === siri.id)).toBe(true);
    // o robô ficou sabendo pela rede
    h.tick(10);
    expect(bot.robot.eventsOf('death').some((d) => d.dst === siri.id)).toBe(true);
    // e usou os botões (não só o básico automático)
    expect(h.eventsOf('cast').some((c) => c.src === me.id && [me.loadout!.b1, me.loadout!.b2, me.loadout!.b3].includes(c.ability))).toBe(true);
  });
});

describe('compensação de atraso', () => {
  /**
   * Idol parado; turbina parada dentro do alcance do botão 3 e, 3 ticks (150 ms) antes do comando,
   * longe. Com 200 ms de RTT o rewind é de 4 ticks (100 + 100 ms) e vê o alvo dentro; com RTT 0 é
   * de 2 ticks (só a interpolação de 100 ms) e já o vê longe.
   */
  function setup(rtt: number) {
    const core = new GameServerCore({ content: false, log: () => undefined });
    core.addClient('a', { token: 'tok-rewind-0001', archetypeId: 'idol' });
    const p = core.entityOf('a')!;
    const ab = getData().abilities.get(p.loadout!.b3)!;
    expect(ab.type).toBe('travada');
    const range = effectiveRange(p, ab);
    const s = spawnEnemy(core.world, 'turbina_desgovernada', 0, p.y);
    freeze(s);
    s.hp = s.stats.hpMax = 1e7;
    const at = (edge: number) => p.x + p.radius + s.radius + edge;
    s.x = at(range - 0.5);
    for (let i = 0; i < 10; i++) core.tick();
    expect(p.targetId).toBe(s.id);
    s.x = at(range + 3); // o alvo andou: agora está 3 tiles fora do alcance
    core.tick();
    core.tick();
    core.tick();
    core.onInput('a', { inputs: [], cmds: [{ id: 1, c: 'habilidade', botao: 3 }], ackTick: core.world.tick, rtt });
    core.tick();
    return { core, p, s };
  }
  const dot = (e: Entity) => e.statuses.find((x) => x.kind === 'dano_continuo');

  it('com 200 ms de RTT, acerta onde o alvo estava na tela do jogador', () => {
    const { core, p, s } = setup(200);
    expect(core.rewindTicksFor('a')).toBe(4);
    expect(dot(s)).toBeDefined();
    expect(p.pendingCast).toBeUndefined();
  });

  it('sem atraso informado, o mesmo comando não acerta na hora (fica esperando o alcance)', () => {
    const { core, s, p } = setup(0);
    expect(core.rewindTicksFor('a')).toBe(2);
    expect(dot(s)).toBeUndefined();
    expect(p.pendingCast).toBeDefined();
  });
});

describe('snapshot por raio de interesse', () => {
  it('só traz entidades perto; quem sai vem em gone e quem entra vem com d e n', () => {
    const h = new Harness({ content: true });
    const bot = h.connect({ seed: 51 });
    const me = h.core.entityOf(bot.sid)!;
    const boss = Array.from(h.world.entities.values()).find((e) => e.defId === 'bruno_ferro_chefe')!;
    const wesley = Array.from(h.world.entities.values()).find((e) => e.defId === 'wesley')!;
    expect(boss).toBeDefined();
    h.tick(20);
    const snap = bot.robot.lastSnap!;
    const R = INTEREST_RADIUS;
    for (const e of snap.ents) {
      const d = Math.hypot(e.x / POS_SCALE - me.x, e.y / POS_SCALE - me.y);
      expect(d).toBeLessThanOrEqual(R + 0.01);
    }
    expect(snap.ents.some((e) => e.i === boss.id)).toBe(false);
    expect(bot.robot.ents.get(wesley.id)?.d).toBe('wesley');
    expect(bot.robot.ents.get(wesley.id)?.n).toBeTruthy();
    // depois da confirmação, d/n/lk/lv não se repetem
    expect(snap.ents.every((e) => e.d === undefined)).toBe(true);
    // o HUD completo para a previsão
    expect(snap.hud.mv).toBeGreaterThan(0);
    expect(snap.hud.canMove).toBe(true);
    expect(snap.hud.arch).toBe('peao_brabo');
    expect(snap.hud.cls).toBe('combatente');
    // o visual do jogador vai em lk (CharacterLook)
    const lk = bot.robot.ents.get(me.id)?.lk as { outfit?: { tier?: string; archetypeId?: string } } | undefined;
    expect(lk?.outfit?.archetypeId).toBe('peao_brabo');
    expect(lk?.outfit?.tier).toBe('aprendiz');

    // leva o jogador para a arena do chefe
    me.x = 28.5;
    me.y = 24.5;
    me.moveTo = undefined;
    me.path = undefined;
    h.tick(12);
    expect(bot.robot.ents.get(boss.id)?.d).toBe('bruno_ferro_chefe');
    expect(bot.robot.ents.has(wesley.id)).toBe(false);
    expect(bot.robot.goneSeen.has(wesley.id)).toBe(true);
    const last = bot.robot.lastSnap!;
    for (const e of last.ents) expect(Math.hypot(e.x / POS_SCALE - me.x, e.y / POS_SCALE - me.y)).toBeLessThanOrEqual(R + 0.01);
  });

  it("'need' devolve 'info' com todos os campos", () => {
    const h = new Harness({ content: true });
    const bot = h.connect({ seed: 52 });
    h.tick(3);
    const wesley = Array.from(h.world.entities.values()).find((e) => e.defId === 'wesley')!;
    const info = h.core.onNeed(bot.sid, { ids: [wesley.id, 999999] });
    expect(info.ents.length).toBe(1);
    expect(info.ents[0]!.d).toBe('wesley');
    expect(info.ents[0]!.n).toBeTruthy();
    expect(info.ents[0]!.lv).toBeGreaterThanOrEqual(1);
  });
});

describe('queda de conexão e volta', () => {
  it('reconectar com o mesmo token retoma o mesmo personagem; depois do prazo ele sai e volta pelo registro', () => {
    const h = new Harness({ content: false, offlineAutoMs: 3000 });
    const a = h.connect({ token: 'tok-volta-0001', seed: 61 });
    const e = h.core.entityOf(a.sid)!;
    a.brain = (r) => r.setStick(1, 0);
    h.tick(30);
    a.brain = (r) => r.setStick(0, 0);
    h.tick(10);
    const px = e.x;
    expect(px).toBeGreaterThan(SPAWN.x + 1);
    // cai: fica no automático no mesmo lugar
    h.disconnect(a);
    h.tick(10);
    expect(h.world.entities.get(e.id)).toBe(e);
    expect(e.auto).toBe(true);
    // volta com o mesmo token
    const b = h.reconnect(a, { seed: 62 });
    expect(b.robot.you).toBe(e.id);
    expect(e.auto).toBe(false);
    expect(Math.abs(e.x - px)).toBeLessThan(0.5);
    h.tick(10);
    expect(b.robot.me()?.d).toBe('peao_brabo');
    // ganha um nível e cai de novo; passa do prazo e sai do mapa
    grantXp(h.world, e, xpToNext(e.level) + 7);
    const lvl = e.level;
    expect(lvl).toBe(13);
    h.disconnect(b);
    h.tick(70);
    expect(h.world.entities.has(e.id)).toBe(false);
    expect(h.core.entityOfToken('tok-volta-0001')).toBeUndefined();
    // volta: personagem novo no spawn, com o progresso
    const c = h.reconnect(a, { seed: 63 });
    const e2 = h.core.entityOf(c.sid)!;
    expect(e2.id).not.toBe(e.id);
    expect(e2.level).toBe(lvl);
    expect(e2.xp).toBe(7);
    expect(dist(e2, SPAWN)).toBeLessThan(0.01);
  });

  it('a mesma sessão que caiu e voltou (reconexão do Colyseus) retoma sem hello', () => {
    const core = new GameServerCore({ content: false, log: () => undefined });
    core.addClient('x', { token: 'tok-drop-00001' });
    const e = core.entityOf('x')!;
    core.dropClient('x');
    expect(e.auto).toBe(true);
    expect(core.tick().has('x')).toBe(false);
    core.resumeClient('x');
    expect(e.auto).toBe(false);
    expect(core.tick().has('x')).toBe(true);
  });

  it('o mesmo token em outra sessão derruba a antiga', () => {
    const core = new GameServerCore({ content: false, log: () => undefined });
    const w1 = core.addClient('x1', { token: 'tok-dois-aparelhos' });
    const w2 = core.addClient('x2', { token: 'tok-dois-aparelhos' });
    expect(w2.you).toBe(w1.you);
    expect(core.takeKicked()).toEqual(['x1']);
    expect(core.hasSession('x1')).toBe(false);
  });

  it('hello sem token: o servidor gera um e devolve no welcome', async () => {
    const core = new GameServerCore({ content: false, log: () => undefined, store: new MemoryStore() });
    const w = await core.join('s', { token: '' });
    expect(typeof w.token).toBe('string');
    expect(w.token!.length).toBeGreaterThanOrEqual(8);
    const w2 = await core.join('t', { token: 'tok-valido-123' });
    expect(w2.token).toBeUndefined();
  });

  it('o progresso volta depois de reiniciar o servidor (Store)', async () => {
    const store = new MemoryStore();
    const c1 = new GameServerCore({ content: false, log: () => undefined, store });
    await c1.join('s', { token: 'tok-reinicio-01', name: 'Dona Cida' });
    const e = c1.entityOf('s')!;
    grantXp(c1.world, e, xpToNext(e.level) * 1 + 3);
    e.semente = 42;
    c1.removeClient('s');
    await c1.saveAll();
    const c2 = new GameServerCore({ content: false, log: () => undefined, store });
    await c2.join('s2', { token: 'tok-reinicio-01' });
    const e2 = c2.entityOf('s2')!;
    expect(e2.name).toBe('Dona Cida');
    expect(e2.level).toBe(13);
    expect(e2.semente).toBe(42);
  });
});

describe('caído', () => {
  it('ninguém levantou em 30 s: volta para o spawn com a vida cheia', () => {
    const h = new Harness({ content: false });
    const bot = h.connect({ seed: 81 });
    const e = h.core.entityOf(bot.sid)!;
    e.x = SPAWN.x + 8;
    downEntity(h.world, e);
    h.tick(10);
    expect(bot.robot.hud?.downed).toBeGreaterThan(0);
    expect(bot.robot.hud?.canMove).toBe(false);
    h.tick(600);
    expect(e.downedUntil).toBeUndefined();
    expect(dist(e, SPAWN)).toBeLessThan(0.01);
    expect(e.hp).toBe(e.stats.hpMax);
  });
});

describe('conteúdo do mapa', () => {
  it('bandos, elite, chefe e NPCs nascem pelos marcadores e o inimigo renasce', () => {
    const core = new GameServerCore({ log: () => undefined, spawner: { respawnMs: { normal: 1000 } } });
    const enemies = Array.from(core.world.entities.values()).filter((e) => e.kind === 'enemy');
    expect(enemies.filter((e) => e.defId === 'siri_do_mangue').length).toBe(7);
    expect(enemies.filter((e) => e.defId === 'capanga_do_capataz').length).toBe(5);
    const cob = enemies.find((e) => e.defId === 'cobrador_do_capataz')!;
    expect(cob.tier).toBe('elite');
    expect(cob.affixes).toEqual(['blindado']);
    expect(enemies.some((e) => e.defId === 'bruno_ferro_chefe' && e.tier === 'chefe')).toBe(true);
    const npcs = Array.from(core.world.entities.values()).filter((e) => e.kind === 'npc');
    expect(npcs.map((n) => n.defId).sort()).toEqual(expect.arrayContaining(['li_wei', 'wesley']));
    // mata o bando do lamaçal e espera o renascimento
    const g = core.spawner!.groups.find((x) => x.markerId === 'bando_siri_lamacal')!;
    const ids = g.slots.map((s) => s.entityId!);
    for (const id of ids) {
      const e = core.world.entities.get(id)!;
      e.hp = 0;
      e.dead = true;
    }
    for (let i = 0; i < 30; i++) core.tick();
    expect(ids.every((id) => !core.world.entities.has(id))).toBe(true);
    const now = g.slots.map((s) => s.entityId!);
    expect(now.every((id) => core.world.entities.get(id)?.dead === false)).toBe(true);
  });

  it('bando de um inimigo só nasce por spawnPack: mesmo packId (id do marcador) e renasce como bando', () => {
    const core = new GameServerCore({ log: () => undefined, spawner: { respawnMs: { normal: 1000 } } });
    const g = core.spawner!.groups.find((x) => x.markerId === 'bando_siri_canal')!;
    expect(g.pack).toBeDefined();
    expect(g.slots.length).toBe(4);
    const members = g.slots.map((s) => core.world.entities.get(s.entityId!)!);
    for (const m of members) {
      const mates = packMates(core.world, m).map((o) => o.id).sort();
      expect(mates).toEqual(members.filter((o) => o.id !== m.id).map((o) => o.id).sort());
    }
    for (const m of members) {
      m.hp = 0;
      m.dead = true;
    }
    for (let i = 0; i < 30; i++) core.tick();
    expect(g.slots.length).toBe(4);
    const again = g.slots.map((s) => core.world.entities.get(s.entityId!)!);
    expect(again.every((e) => e && !e.dead && e.defId === 'siri_do_mangue')).toBe(true);
    expect(packMates(core.world, again[0]!).length).toBe(3);
  });

  it('companheiro de IA opcional segue o jogador', () => {
    const h = new Harness({ content: false, companions: true });
    const bot = h.connect({ seed: 71 });
    const comp = h.core.companionOf(bot.sid)!;
    expect(comp.kind).toBe('npc');
    expect(comp.defId).toBe('li_wei');
    expect(comp.auto).toBe(true);
    bot.brain = (r) => r.setStick(1, 0);
    h.tick(40);
    const me = h.core.entityOf(bot.sid)!;
    expect(dist(me, comp)).toBeLessThan(4.5);
  });
});
