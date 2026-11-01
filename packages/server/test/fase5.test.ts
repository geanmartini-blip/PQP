/**
 * Servidor da Fase 5: masmorra em grupo (sala por andar, escada, chefe do 5º, saída e atalho),
 * plantão (sair com on_duty, levar o plantonista, saque no relatório), tick de facção com aviso no
 * mapa e influência dos abates, encontros com IA, itens (equipar) e o automático na queda de conexão.
 */
import { describe, expect, it } from 'vitest';
import { getData } from '@pqp/shared/data';
import { GAME_MSG, type S2C_AvisoMapa, type S2C_ItensInfo, type S2C_MasmorraInfo, type S2C_PlantaoInfo, type S2C_TrocarSala } from '@pqp/shared/net';
import { getMap } from '@pqp/shared/map';
import { defaultAppearance } from '@pqp/shared/game/appearance';
import { migratePlayerRecord } from '@pqp/shared/game/record';
import { FLAG_ENTROU } from '@pqp/shared/game/ala';
import { spawnLoot, type Entity } from '@pqp/shared/sim';
import { onZeroHp } from '@pqp/shared/sim/combat';
import { spawnEnemy } from '@pqp/shared/sim/spawn';
import type { PlayerRecord } from '@pqp/shared/game/types';
import { LIMIAR_DONO, itemNivel, shortcutOf, type WorldEvent } from '@pqp/shared/game/index';
import { CityService } from '../src/city_service';
import { dungeonMapId, parseDungeonMap } from '../src/dungeon_service';
import { setArrival } from '../src/handoff';
import { MemoryStore } from '../src/persistence/store';
import { Harness, type Bot } from './harness';

const D = getData();

function margemRecord(id: string, side: 'esquerda' | 'direita', level = 14): PlayerRecord {
  const inst = side === 'esquerda' ? 'brigada_popular' : 'torcida_furia_neon';
  const cls = D.institutionsById.get(inst)!.classe;
  const rec = migratePlayerRecord({ id, name: `Morador ${id.slice(-2)}`, data: { archetypeId: cls, level } }, id);
  rec.appearance = defaultAppearance();
  rec.level = level;
  rec.side = side;
  rec.institution = inst;
  rec.story_flags.push(FLAG_ENTROU);
  rec.guide_id = D.guides.guias.find((g) => g.margem === side)!.id;
  return rec;
}

/**
 * Influência inicial do ponto disputado no teste ponta a ponta: os abates das Galerias (cerca de +24)
 * levam a Esquerda acima do limite; o ponto só vira no tick de facção.
 */
const INF0 = { esquerda: 50, direita: 50 };

const uid = (n: number) => `cccccccc-5555-4555-8555-${String(n).padStart(12, '0')}`;
const seedRec = (store: MemoryStore, token: string, rec: PlayerRecord) => store.savePlayer({ id: rec.id, token, name: rec.name, data: rec });
const tickAsync = () => new Promise((r) => setTimeout(r, 0));
const logOf = <T>(bot: Bot, type: string): T[] => bot.robot.gameLog.filter((g) => g.type === type).map((g) => g.msg as T);
const lastOf = <T>(bot: Bot, type: string): T | undefined => logOf<T>(bot, type).at(-1);

function testCity(store: MemoryStore, faccaoMin = 5) {
  const clock = { t: 10_000_000 };
  const city = new CityService({ store, now: () => clock.t, cicloMin: 10, faccaoMin, log: () => undefined });
  return { clock, city };
}

function teleport(h: Harness, bot: Bot, x: number, y: number): void {
  const e = h.core.entityOf(bot.sid)!;
  e.x = x;
  e.y = y;
  e.moveTo = undefined;
  e.path = undefined;
}

function killHostiles(h: Harness, by: Entity): void {
  for (const e of Array.from(h.world.entities.values())) {
    if (e.dead || e.kind !== 'enemy') continue;
    e.hp = 0;
    onZeroHp(h.world, e, by);
  }
}

function healAll(h: Harness): void {
  for (const e of h.world.entities.values()) {
    if (e.kind !== 'player' || e.dead) continue;
    e.downedUntil = undefined;
    e.hp = e.stats.hpMax;
  }
}

/** Deixa os inimigos com 1 de vida: o ataque automático derruba pelo caminho normal (eventos, influência). */
function weakenHostiles(h: Harness): void {
  for (const e of h.world.entities.values()) if (!e.dead && e.kind === 'enemy' && e.hp > 1) e.hp = 1;
}

/** Visita cada sala, escolhe a primeira opção dos eventos e derruba o que nascer, até a escada abrir. */
function clearFloor(h: Harness, bot: Bot, real = false): void {
  const d = h.core.dungeon!;
  const st = d.state;
  const me = () => h.core.entityOf(bot.sid)!;
  for (const rs of st.rooms) {
    const r = st.floor.layout.rooms[rs.idx]!;
    for (let i = 0; i < 2400 && !rs.limpa; i++) {
      teleport(h, bot, r.cx, r.cy);
      h.tick(1);
      if (rs.esperandoEscolha) {
        const op = st.floor.templates[rs.idx]!.evento!.opcoes[0]!;
        h.game(bot, GAME_MSG.masmorraEscolha, { sala: rs.idx, opcao: op.id });
      }
      if (real) weakenHostiles(h);
      else killHostiles(h, me());
      healAll(h);
    }
    expect(rs.limpa, `sala ${rs.idx} (${r.tipo}) do andar ${st.floor.andar}`).toBe(true);
  }
  h.runUntil(() => st.escadaAberta, 200);
  expect(st.escadaAberta).toBe(true);
}

describe('masmorra em grupo', () => {
  it('entra pela Usina com o grupo, desce até o 5º, vence o chefe, sai com as recompensas e volta pelo atalho', async () => {
    const store = new MemoryStore();
    const { city } = testCity(store);
    const tA = 'tok-fase5-masm-aaaa';
    const tB = 'tok-fase5-masm-bbbb';
    const a = margemRecord(uid(1), 'esquerda');
    const b = margemRecord(uid(2), 'esquerda');
    await seedRec(store, tA, a);
    await seedRec(store, tB, b);
    setArrival(tA, 'usina_da_ponte');
    setArrival(tB, 'usina_da_ponte');
    const hu = new Harness({ mapId: 'usina_da_ponte', content: false, store, city });
    const ua = await hu.connectAsync({ token: tA, seed: 701 });
    const ub = await hu.connectAsync({ token: tB, seed: 702 });
    const ent = getMap('usina_da_ponte').markers.find((m) => m.kind === 'masmorra')!;
    teleport(hu, ua, ent.x, ent.y);
    teleport(hu, ub, ent.x + 1, ent.y);

    // na entrada, com o outro por perto: os dois vão
    hu.game(ua, GAME_MSG.masmorraEntrar, {});
    hu.drain();
    await tickAsync();
    hu.drain();
    const run = city.dungeons.runOf(a.id)!;
    expect(run).toBeDefined();
    expect(run.grupo.map((m) => m.playerId).sort()).toEqual([a.id, b.id].sort());
    const info0 = lastOf<S2C_MasmorraInfo>(ua, GAME_MSG.masmorraInfo)!;
    expect(info0).toMatchObject({ ativa: true, runId: run.id, andar: 1, seed: run.seed });
    const tr = lastOf<S2C_TrocarSala>(ub, GAME_MSG.trocarSala)!;
    expect(tr.mapId).toBe(dungeonMapId(run.id, 1));
    expect(hu.core.entityOf(ua.sid)).toBeUndefined();

    let bossKilled = false;
    let lastHarness: Harness | undefined;
    let botA: Bot | undefined;
    for (let andar = 1; andar <= 5; andar++) {
      const mapId = dungeonMapId(run.id, andar);
      const hd = new Harness({ mapId, dungeon: parseDungeonMap(mapId)!, content: false, store, city });
      const da = await hd.connectAsync({ token: tA, seed: 710 + andar });
      const db = await hd.connectAsync({ token: tB, seed: 720 + andar });
      expect(hd.core.entityOf(da.sid), `jogador A no andar ${andar}`).toBeDefined();
      expect(hd.core.entityOf(db.sid), `jogador B no andar ${andar}`).toBeDefined();
      expect(lastOf<S2C_MasmorraInfo>(da, GAME_MSG.masmorraInfo)?.andar).toBe(andar);
      clearFloor(hd, da);
      if (andar === 5) {
        expect(hd.core.dungeon!.state.floor.boss).toBe('bomba_descontrolada');
        bossKilled = hd.core.dungeon!.state.bossVencido;
      }
      // a escada leva o grupo todo para o andar seguinte
      const s = hd.core.dungeon!.state.floor.layout.stairs;
      hd.runUntil(() => {
        if (hd.core.entityOf(da.sid)) teleport(hd, da, s.x, s.y);
        return hd.core.entityOf(da.sid) === undefined;
      }, 200);
      await tickAsync();
      hd.drain();
      expect(lastOf<S2C_TrocarSala>(db, GAME_MSG.trocarSala)?.mapId).toBe(dungeonMapId(run.id, andar + 1));
      lastHarness = hd;
      botA = da;
    }
    expect(bossKilled).toBe(true);
    expect(run.ultimoChefeVencido).toBe(5);
    expect(run.andar).toBe(6);
    expect(lastHarness).toBeDefined();
    expect(botA).toBeDefined();

    // 6º andar: sai pela mensagem e recebe o guardado
    const m6 = dungeonMapId(run.id, 6);
    const h6 = new Harness({ mapId: m6, dungeon: parseDungeonMap(m6)!, content: false, store, city });
    const sa = await h6.connectAsync({ token: tA, seed: 731 });
    expect(h6.core.entityOf(sa.sid)).toBeDefined();
    const xpAntes = h6.core.recordOf(sa.sid)!.xp + h6.core.recordOf(sa.sid)!.level * 1e6;
    h6.game(sa, GAME_MSG.masmorraSair, {});
    await tickAsync();
    h6.drain();
    expect(lastOf<S2C_TrocarSala>(sa, GAME_MSG.trocarSala)?.mapId).toBe('usina_da_ponte');
    const saved = (await store.findPlayerById(a.id))!.data;
    expect(saved.counters['masmorra_chefe:galerias_da_usina']).toBe(5);
    expect(saved.unlocks).toContain('atalho_galerias');
    expect(saved.xp + saved.level * 1e6).toBeGreaterThan(xpAntes);
    expect(run.grupo.find((m) => m.playerId === a.id)?.saiu).toBe(true);

    // atalho: volta direto para o 6º (o andar depois do último chefe vencido)
    setArrival(tA, 'usina_da_ponte');
    const hu2 = new Harness({ mapId: 'usina_da_ponte', content: false, store, city });
    const u2 = await hu2.connectAsync({ token: tA, seed: 741 });
    teleport(hu2, u2, ent.x, ent.y);
    hu2.game(u2, GAME_MSG.masmorraEntrar, { atalho: true });
    const run2 = city.dungeons.runOf(a.id)!;
    expect(run2.id).not.toBe(run.id);
    expect(run2.andarInicial).toBe(6);
  }, 120_000);

  it('não entra longe da entrada nem num andar de outra run', async () => {
    const store = new MemoryStore();
    const { city } = testCity(store);
    const t = 'tok-fase5-masm-cccc';
    const r = margemRecord(uid(3), 'direita');
    await seedRec(store, t, r);
    setArrival(t, 'usina_da_ponte');
    const hu = new Harness({ mapId: 'usina_da_ponte', content: false, store, city });
    const u = await hu.connectAsync({ token: t, seed: 751 });
    hu.game(u, GAME_MSG.masmorraEntrar, {});
    expect(city.dungeons.runs.size).toBe(0);
    expect(u.robot.gameLog.some((g) => g.type === GAME_MSG.aviso && String((g.msg as { texto: string }).texto).includes('entrada'))).toBe(true);
    // run de outro grupo: a sala do andar manda de volta
    const c = city.dungeons.create([{ playerId: 'outro', papel: 'jogador' }]);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const mapId = dungeonMapId(c.run.id, 1);
    setArrival(t, mapId);
    const hd = new Harness({ mapId, dungeon: parseDungeonMap(mapId)!, content: false, store, city });
    const d = await hd.connectAsync({ token: t, seed: 752 });
    expect(hd.core.entityOf(d.sid)).toBeUndefined();
    expect(lastOf<S2C_TrocarSala>(d, GAME_MSG.trocarSala)?.mapId).toBe('margem_direita');
  });
});

describe('plantão', () => {
  it('quem sai com on_duty fica no QG; outro da margem leva, ele luta pela Doutrina e o saque vai para o registro dele', async () => {
    const store = new MemoryStore();
    const { city } = testCity(store);
    const tP = 'tok-fase5-plant-pppp';
    const tT = 'tok-fase5-plant-tttt';
    const p = margemRecord(uid(11), 'esquerda', 16);
    const t = margemRecord(uid(12), 'esquerda');
    await seedRec(store, tP, p);
    await seedRec(store, tT, t);
    const h = new Harness({ mapId: 'margem_esquerda', content: false, store, city, offlineAutoMs: 1000 });
    const bp = await h.connectAsync({ token: tP, seed: 801 });
    const cards = [{ se: { t: 'minha_vida_abaixo', pct: 40 }, faca: { t: 'fugir' } }, { se: { t: 'sempre' }, faca: { t: 'focar_mais_perto' } }];
    h.game(bp, GAME_MSG.doutrinaDefinir, { cards });
    expect(lastOf<{ cards: unknown[] }>(bp, GAME_MSG.doutrinaInfo)?.cards).toHaveLength(2);
    h.game(bp, GAME_MSG.doutrinaDefinir, { cards: [...cards, ...cards, ...cards] });
    expect(lastOf<{ cards: unknown[] }>(bp, GAME_MSG.doutrinaInfo)?.cards).toHaveLength(2);
    h.game(bp, GAME_MSG.plantaoDefinir, { on: true });
    expect(lastOf<S2C_PlantaoInfo>(bp, GAME_MSG.plantaoInfo)?.emPlantao).toBe(true);
    h.disconnect(bp);
    // no automático até o tempo esgotar; depois sai do mapa e fica de plantão
    expect(h.core.entityOfToken(tP)?.auto).toBe(true);
    h.tick(30);
    expect(h.core.entityOfToken(tP)).toBeUndefined();
    expect(city.duty.recordOf(p.id)).toBeDefined();

    const bt = await h.connectAsync({ token: tT, seed: 802 });
    h.game(bt, GAME_MSG.plantaoPedir, {});
    const info = lastOf<S2C_PlantaoInfo>(bt, GAME_MSG.plantaoInfo)!;
    expect(info.disponiveis.map((x) => x.id)).toContain(p.id);
    expect(info.disponiveis.find((x) => x.id === p.id)?.cartas).toBe(2);
    h.game(bt, GAME_MSG.plantaoLevar, { plantonistaId: p.id });
    const ally = Array.from(h.world.entities.values()).find((e) => e.playerId === p.id)!;
    expect(ally).toBeDefined();
    expect(ally.onDuty).toBe(true);
    expect(ally.auto).toBe(true);
    expect(ally.doctrine).toHaveLength(2);
    expect(ally.partyId).toBe(h.core.entityOf(bt.sid)!.partyId);
    expect(lastOf<S2C_PlantaoInfo>(bt, GAME_MSG.plantaoInfo)?.levados.map((x) => x.id)).toEqual([p.id]);
    // ninguém mais leva o mesmo
    expect(city.duty.list('esquerda').map((r) => r.id)).not.toContain(p.id);

    // luta: o plantonista derruba um inimigo pela Doutrina, e o saque no nome dele vai para o relatório
    const foe = spawnEnemy(h.world, D.enemies.inimigos.find((x) => x.tier === 'normal')!.id, ally.x + 1.2, ally.y, { level: 5 });
    foe.hp = 1;
    const ITEM = D.items.itens.find((x) => x.rarity === 'raro')!.id;
    spawnLoot(h.world, ally.x, ally.y, { itemId: ITEM, rarity: 'raro', forPlayerId: p.id }, 'item');
    h.runUntil(() => foe.dead === true || !h.world.entities.has(foe.id), 200);
    h.tick(3);
    const a = city.duty.ofTaker(t.id)[0]!;
    expect(a.ganhos.itens).toContain(ITEM);
    expect(foe.dead || !h.world.entities.has(foe.id)).toBe(true);

    h.game(bt, GAME_MSG.plantaoDispensar, { plantonistaId: p.id });
    expect(Array.from(h.world.entities.values()).some((e) => e.playerId === p.id && !e.dead)).toBe(false);
    expect(city.duty.ofTaker(t.id)).toHaveLength(0);

    // o dono volta: relatório no registro
    const bp2 = await h.connectAsync({ token: tP, seed: 803 });
    const rec = h.core.recordOf(bp2.sid)!;
    expect(rec.inventory).toContain(ITEM);
    expect(bp2.robot.gameLog.some((g) => g.type === GAME_MSG.aviso && String((g.msg as { texto: string }).texto).startsWith('Relatório do plantão'))).toBe(true);
    expect(city.duty.recordOf(p.id)).toBeUndefined();
  });

  it('não leva plantonista da outra margem', async () => {
    const store = new MemoryStore();
    const { city } = testCity(store);
    const p = margemRecord(uid(21), 'direita');
    p.on_duty = true;
    city.duty.offer(p);
    const t = margemRecord(uid(22), 'esquerda');
    await seedRec(store, 'tok-fase5-plant-xxxx', t);
    const h = new Harness({ mapId: 'margem_esquerda', content: false, store, city });
    const bt = await h.connectAsync({ token: 'tok-fase5-plant-xxxx', seed: 811 });
    h.game(bt, GAME_MSG.plantaoPedir, {});
    expect(lastOf<S2C_PlantaoInfo>(bt, GAME_MSG.plantaoInfo)?.disponiveis).toHaveLength(0);
    h.game(bt, GAME_MSG.plantaoLevar, { plantonistaId: p.id });
    expect(Array.from(h.world.entities.values()).some((e) => e.playerId === p.id)).toBe(false);
  });
});

describe('IA de facção e influência', () => {
  it('o tick de facção gera aviso no mapa para quem está na sala', async () => {
    const store = new MemoryStore();
    const { city, clock } = testCity(store, 1);
    const tk = 'tok-fase5-facc-aaaa';
    await seedRec(store, tk, margemRecord(uid(31), 'direita'));
    const h = new Harness({ mapId: 'margem_direita', content: false, store, city });
    const bot = await h.connectAsync({ token: tk, seed: 901 });
    const ciclo0 = city.faction.state.ciclo;
    clock.t += 61_000;
    const res = city.faction.tick();
    h.drain();
    expect(res.ticks).toBe(1);
    expect(city.faction.state.ciclo).toBe(ciclo0 + 1);
    expect(res.eventos.length).toBeGreaterThan(0);
    const avisos = logOf<S2C_AvisoMapa>(bot, GAME_MSG.avisoMapa);
    expect(avisos.map((x) => x.id)).toEqual(expect.arrayContaining(res.eventos.map((e) => e.id)));
    // o estado foi gravado e o combate lê os medidores
    expect(await store.loadWorld('faccao')).toBeDefined();
    expect(h.world.regionState).toBeDefined();
    expect(city.events.some((e) => e.tipo === 'world_event')).toBe(true);
    h.game(bot, GAME_MSG.faccaoPedir, {});
    expect(lastOf<{ ciclo: number }>(bot, GAME_MSG.faccaoInfo)?.ciclo).toBe(ciclo0 + 1);
  });

  it('abate na região soma influência da margem de quem lutou', async () => {
    const store = new MemoryStore();
    const { city } = testCity(store);
    const tk = 'tok-fase5-facc-bbbb';
    await seedRec(store, tk, margemRecord(uid(32), 'esquerda'));
    const h = new Harness({ mapId: 'margem_esquerda', content: false, store, city });
    const bot = await h.connectAsync({ token: tk, seed: 902 });
    const me = h.core.entityOf(bot.sid)!;
    const reg = h.world.map.regions.find((r) => me.x >= r.x && me.x < r.x + r.w && me.y >= r.y && me.y < r.y + r.h)!.regionId;
    const antes = city.faction.state.regioes[reg]!.influencia.esquerda;
    // o ataque básico automático derruba os inimigos (os eventos da morte passam pelas regras no tick)
    for (let i = 0; i < 4; i++) {
      const foe = spawnEnemy(h.world, D.enemies.inimigos.find((x) => x.tier === 'normal')!.id, me.x + 1.2, me.y, { level: 5 });
      foe.hp = 1;
      h.runUntil(() => foe.dead === true || !h.world.entities.has(foe.id), 200);
      me.hp = me.stats.hpMax;
    }
    expect(city.faction.state.regioes[reg]!.influencia.esquerda).toBeGreaterThan(antes);
  });
});

describe('encontros com IA', () => {
  it('nascem no mapa da margem na janela de horário', async () => {
    const store = new MemoryStore();
    const { city } = testCity(store);
    const h = new Harness({ mapId: 'margem_esquerda', content: false, store, city, encounters: true });
    h.tick(1);
    expect(h.core.encounterEntities().length).toBeGreaterThan(0);
    const ids = h.core.encounterEntities();
    expect(ids.every((id) => h.world.entities.has(id))).toBe(true);
  });
});

describe('itens no servidor', () => {
  it('equipa um item da mochila: registro, atributos da entidade e tela de itens', async () => {
    const store = new MemoryStore();
    const { city } = testCity(store);
    const tk = 'tok-fase5-item-aaaa';
    const rec = margemRecord(uid(41), 'esquerda', 20);
    const item = D.items.itens.find((x) => (x.classLock === null || x.classLock === rec.class) && x.nivelMin <= rec.level && (x.margem === null || x.margem === 'esquerda'))!;
    rec.inventory = [item.id];
    await seedRec(store, tk, rec);
    const h = new Harness({ mapId: 'margem_esquerda', content: false, store, city });
    const bot = await h.connectAsync({ token: tk, seed: 951 });
    h.game(bot, GAME_MSG.equipar, { itemId: item.id });
    const view = lastOf<S2C_ItensInfo>(bot, GAME_MSG.itensInfo)!;
    expect(Object.values(view.equipados).map((v) => v?.id)).toContain(item.id);
    const r = h.core.recordOf(bot.sid)!;
    expect(r.equipment[item.slot]).toBe(item.id);
    expect(r.inventory).not.toContain(item.id);
    const e = h.core.entityOf(bot.sid)!;
    if (Object.keys(view.total).length > 0) expect(e.equipPct).toBeDefined();
    // item que não tem: erro e nada muda
    h.game(bot, GAME_MSG.equipar, { itemId: 'nao_existe' });
    expect(h.core.recordOf(bot.sid)!.equipment[item.slot]).toBe(item.id);
    h.game(bot, GAME_MSG.filtroRaridade, { raridade: 'raro', vendaAutomatica: true });
    expect(e.lootFilter).toBe('raro');
    h.game(bot, GAME_MSG.desequipar, { slot: item.slot });
    expect(h.core.recordOf(bot.sid)!.inventory).toContain(item.id);
    expect(e.equipPct).toBeUndefined();
  });
});

describe('ponta a ponta da Fase 5', () => {
  it('grupo de 2 + plantonista: Galerias até o 5º, chefe, saque raro, equipa, benze e calibra; o tick de facção vira o ponto pela influência e avisa', async () => {
    const store = new MemoryStore();
    const { city, clock } = testCity(store, 1);
    const tA = 'tok-fase5-p2p-aaaa';
    const tB = 'tok-fase5-p2p-bbbb';
    const tC = 'tok-fase5-p2p-cccc';
    const a = margemRecord(uid(61), 'esquerda', 20);
    const b = margemRecord(uid(62), 'esquerda', 20);
    const p = margemRecord(uid(63), 'esquerda', 18);
    // A pode benzer: reputação na instituição e uma lição aprendida
    a.counters['reputacao:brigada_popular'] = 60;
    a.counters['visitas:museu_da_cidade_unida'] = 1;
    p.doctrine = [{ se: { t: 'sempre' }, faca: { t: 'focar_mais_perto' } }] as PlayerRecord['doctrine'];
    p.on_duty = true;
    await seedRec(store, tA, a);
    await seedRec(store, tB, b);
    city.duty.offer(p);

    // o ponto da Direita na Usina começa disputado; a influência dos abates é da Esquerda
    const PT = 'pc_ponte_direita';
    const ponto0 = city.faction.state.pontos[PT]!;
    expect(ponto0.dono).toBe('direita');
    ponto0.influencia = { esquerda: INF0.esquerda, direita: INF0.direita };

    // ---- Usina: A leva o plantonista, o grupo entra nas Galerias ----
    setArrival(tA, 'usina_da_ponte');
    setArrival(tB, 'usina_da_ponte');
    const hu = new Harness({ mapId: 'usina_da_ponte', content: false, store, city });
    const ua = await hu.connectAsync({ token: tA, seed: 1701 });
    const ub = await hu.connectAsync({ token: tB, seed: 1702 });
    hu.game(ua, GAME_MSG.plantaoLevar, { plantonistaId: p.id });
    expect(city.duty.ofTaker(a.id).map((x) => x.plantonistaId)).toEqual([p.id]);
    const ent = getMap('usina_da_ponte').markers.find((m) => m.kind === 'masmorra')!;
    teleport(hu, ua, ent.x, ent.y);
    teleport(hu, ub, ent.x + 1, ent.y);
    hu.game(ua, GAME_MSG.masmorraEntrar, {});
    hu.drain();
    await tickAsync();
    hu.drain();
    const run = city.dungeons.runOf(a.id)!;
    expect(run).toBeDefined();
    expect(run.grupo.map((m) => `${m.playerId}:${m.papel}`).sort()).toEqual([`${a.id}:jogador`, `${b.id}:jogador`, `${p.id}:plantonista`].sort());
    expect(lastOf<S2C_TrocarSala>(ub, GAME_MSG.trocarSala)?.mapId).toBe(dungeonMapId(run.id, 1));

    // ---- andares 1 a 5: o plantonista vem junto em cada sala; chefe no 5º ----
    for (let andar = 1; andar <= 5; andar++) {
      const mapId = dungeonMapId(run.id, andar);
      const hd = new Harness({ mapId, dungeon: parseDungeonMap(mapId)!, content: false, store, city });
      const da = await hd.connectAsync({ token: tA, seed: 1710 + andar });
      const db = await hd.connectAsync({ token: tB, seed: 1720 + andar });
      expect(hd.core.entityOf(da.sid), `A no andar ${andar}`).toBeDefined();
      expect(hd.core.entityOf(db.sid), `B no andar ${andar}`).toBeDefined();
      const plant = Array.from(hd.world.entities.values()).find((e) => e.playerId === p.id);
      expect(plant?.onDuty, `plantonista no andar ${andar}`).toBe(true);
      expect(plant?.partyId).toBe(hd.core.entityOf(da.sid)!.partyId);
      clearFloor(hd, da, true);
      if (andar === 5) {
        expect(hd.core.dungeon!.state.floor.boss).toBe('bomba_descontrolada');
        expect(hd.core.dungeon!.state.bossVencido).toBe(true);
      }
      const s = hd.core.dungeon!.state.floor.layout.stairs;
      hd.runUntil(() => {
        if (hd.core.entityOf(da.sid)) teleport(hd, da, s.x, s.y);
        return hd.core.entityOf(da.sid) === undefined;
      }, 200);
      await tickAsync();
      hd.drain();
      expect(lastOf<S2C_TrocarSala>(db, GAME_MSG.trocarSala)?.mapId).toBe(dungeonMapId(run.id, andar + 1));
    }
    expect(run.ultimoChefeVencido).toBe(5);

    // ---- sai pelo 6º com o guardado (A e o plantonista dele) ----
    const m6 = dungeonMapId(run.id, 6);
    const h6 = new Harness({ mapId: m6, dungeon: parseDungeonMap(m6)!, content: false, store, city });
    const sa = await h6.connectAsync({ token: tA, seed: 1731 });
    h6.game(sa, GAME_MSG.masmorraSair, {});
    await tickAsync();
    h6.drain();
    expect(lastOf<S2C_TrocarSala>(sa, GAME_MSG.trocarSala)?.mapId).toBe('usina_da_ponte');
    expect(run.grupo.find((m) => m.playerId === p.id)?.saiu).toBe(true);
    const saved = (await store.findPlayerById(a.id))!.data;
    expect(saved.unlocks).toContain('atalho_galerias');
    // o atalho da entrada vale para a próxima descida
    expect(shortcutOf(saved)).toBe(5);

    // ---- saque com item raro que A pode vestir ----
    const raro = saved.inventory.find((id) => {
      const it = D.itemsById.get(id);
      return it?.rarity === 'raro' && (it.classLock === null || it.classLock === saved.class) && it.nivelMin <= saved.level && it.margem !== 'direita';
    });
    expect(raro, `item raro no saque: ${saved.inventory.join(', ')}`).toBeDefined();

    // ---- volta na Usina: equipa e benze ----
    setArrival(tA, 'usina_da_ponte');
    const hu2 = new Harness({ mapId: 'usina_da_ponte', content: false, store, city });
    const u2 = await hu2.connectAsync({ token: tA, seed: 1741 });
    hu2.game(u2, GAME_MSG.equipar, { itemId: raro! });
    const slotRaro = D.itemsById.get(raro!)!.slot;
    expect(hu2.core.recordOf(u2.sid)!.equipment[slotRaro]).toBe(raro);
    expect(lastOf<S2C_ItensInfo>(u2, GAME_MSG.itensInfo)!.equipados[slotRaro]?.id).toBe(raro);
    const hpSem = hu2.core.entityOf(u2.sid)!.stats.hpMax;
    // calibrar é da Direita: recusa
    hu2.game(u2, GAME_MSG.calibrar, { itemId: raro! });
    expect(itemNivel(hu2.core.recordOf(u2.sid)!, raro!)).toBe(0);
    hu2.game(u2, GAME_MSG.benzer, { itemId: raro!, onde: 'brigada_popular' });
    expect(hu2.core.recordOf(u2.sid)!.counters[`benzimento_fila:${raro}`]).toBeGreaterThan(clock.t);
    clock.t += 31_000;
    hu2.game(u2, GAME_MSG.itensPedir, {});
    expect(itemNivel(hu2.core.recordOf(u2.sid)!, raro!)).toBe(1);
    expect(hu2.core.entityOf(u2.sid)!.stats.hpMax).toBeGreaterThanOrEqual(hpSem);

    // ---- calibração na Direita, com um raro da Direita ----
    const c = margemRecord(uid(64), 'direita', 20);
    const raroDir = D.items.itens.find((x) => x.rarity === 'raro' && x.margem === 'direita' && (x.classLock === null || x.classLock === c.class) && x.nivelMin <= c.level)!;
    c.inventory = [raroDir.id];
    c.credito = 200;
    await seedRec(store, tC, c);
    const hr = new Harness({ mapId: 'margem_direita', content: false, store, city });
    const rc = await hr.connectAsync({ token: tC, seed: 1751 });
    hr.game(rc, GAME_MSG.equipar, { itemId: raroDir.id });
    hr.game(rc, GAME_MSG.calibrar, { itemId: raroDir.id, onde: 'torcida_furia_neon' });
    expect(itemNivel(hr.core.recordOf(rc.sid)!, raroDir.id)).toBe(1);
    expect(hr.core.recordOf(rc.sid)!.credito).toBe(200 - getData().items.calibracao.niveis[0]!.custoCredito!);

    // ---- facção: os abates nas Galerias somaram influência da Esquerda no ponto ----
    const inf = city.faction.state.pontos[PT]!;
    expect(inf.influencia.esquerda).toBeGreaterThan(INF0.esquerda);
    expect(inf.influencia.esquerda).toBeGreaterThanOrEqual(LIMIAR_DONO);
    // antes do tick o dono não muda
    expect(inf.dono).toBe('direita');
    clock.t = city.faction.state.proximoTickEm;
    const res = city.faction.tick();
    hu2.drain();
    hr.drain();
    expect(res.ticks).toBe(1);
    expect(res.trocas).toContainEqual({ ponto: PT, de: 'direita', para: 'esquerda' });
    const troca: WorldEvent | undefined = res.eventos.find((ev) => ev.tipo === 'troca_de_dono' && ev.ponto === PT);
    expect(troca, 'o tick de facção virou o ponto').toBeDefined();
    expect(city.faction.state.pontos[PT]!.dono).toBe('esquerda');
    expect(logOf<S2C_AvisoMapa>(u2, GAME_MSG.avisoMapa).map((x) => x.id)).toContain(troca!.id);
    expect(hr.core.entityOf(rc.sid)).toBeDefined();
    expect(logOf<S2C_AvisoMapa>(rc, GAME_MSG.avisoMapa).map((x) => x.id)).toContain(troca!.id);
  }, 180_000);
});

describe('queda de conexão', () => {
  it('o personagem segue pela Doutrina no automático e volta a ser controlado ao reconectar', async () => {
    const store = new MemoryStore();
    const { city } = testCity(store);
    const tk = 'tok-fase5-queda-aaaa';
    await seedRec(store, tk, margemRecord(uid(51), 'esquerda'));
    const h = new Harness({ mapId: 'margem_esquerda', content: false, store, city, offlineAutoMs: 5000 });
    const bot = await h.connectAsync({ token: tk, seed: 961 });
    h.game(bot, GAME_MSG.doutrinaDefinir, { cards: [{ se: { t: 'sempre' }, faca: { t: 'focar_mais_perto' } }] });
    const e = h.core.entityOf(bot.sid)!;
    expect(e.auto).toBe(false);
    h.core.dropClient(bot.sid);
    expect(e.auto).toBe(true);
    expect(e.doctrine).toHaveLength(1);
    h.tick(40);
    expect(h.core.entityOfToken(tk)).toBe(e);
    h.core.resumeClient(bot.sid);
    expect(e.auto).toBe(false);
  });
});
