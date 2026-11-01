/**
 * Servidor da Fase 4: loja de NPC (comprar e vender), feira entre jogadores de salas diferentes,
 * câmbio na ponte, aluguel cobrado no ciclo da cidade, decorar a casa e visitar a casa de outro
 * jogador (sala 'casa:<id>'), e a persistência da cidade e do log de economia no FileStore.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { getData } from '@pqp/shared/data';
import { GAME_MSG, type S2C_CambioInfo, type S2C_CasaInfo, type S2C_Carteira, type S2C_EconomiaResultado, type S2C_MercadoInfo } from '@pqp/shared/net';
import { getMap, TILE_INFO } from '@pqp/shared/map';
import { defaultAppearance } from '@pqp/shared/game/appearance';
import { migratePlayerRecord } from '@pqp/shared/game/record';
import { FLAG_ENTROU } from '@pqp/shared/game/ala';
import { cotarTroca } from '@pqp/shared/game/index';
import { valorAluguel } from '@pqp/shared/game/housing';
import { spawnLoot } from '@pqp/shared/sim';
import type { PlayerRecord } from '@pqp/shared/game/types';
import { CityService } from '../src/city_service';
import { setArrival } from '../src/handoff';
import { buildHouseMap, houseMapId } from '../src/house';
import { FileStore, MemoryStore } from '../src/persistence/store';
import { Harness, type Bot } from './harness';

const D = getData();

function margemRecord(id: string, side: 'esquerda' | 'direita', level = 12): PlayerRecord {
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

const seed = (store: MemoryStore | FileStore, token: string, rec: PlayerRecord) => store.savePlayer({ id: rec.id, token, name: rec.name, data: rec });

const markerOf = (mapId: string, id: string) => {
  const m = getMap(mapId).markers.find((x) => x.id === id);
  if (!m) throw new Error(`marcador ${id} não existe em ${mapId}`);
  return m;
};

function teleport(h: Harness, bot: Bot, x: number, y: number): void {
  const e = h.core.entityOf(bot.sid)!;
  e.x = x;
  e.y = y;
  e.moveTo = undefined;
  e.path = undefined;
}

const lastOf = <T>(bot: Bot, type: string): T | undefined => bot.robot.gameLog.filter((g) => g.type === type).at(-1)?.msg as T | undefined;
const result = (bot: Bot) => lastOf<S2C_EconomiaResultado>(bot, GAME_MSG.economiaResultado);
const tickAsync = () => new Promise((r) => setTimeout(r, 0));

/** Cidade com relógio de teste. */
function testCity(store: MemoryStore | FileStore) {
  const clock = { t: 1_000_000 };
  const city = new CityService({ store, now: () => clock.t, cicloMin: 10, log: () => undefined });
  return { clock, city };
}

const uid = (n: number) => `bbbbbbbb-4444-4444-8444-${String(n).padStart(12, '0')}`;

describe('loja de NPC no servidor', () => {
  it('compra e vende no balcão; longe do balcão não vende', async () => {
    const store = new MemoryStore();
    const { city } = testCity(store);
    const token = 'tok-fase4-loja-0001';
    const rec = margemRecord(uid(1), 'esquerda');
    rec.semente = 100;
    await seed(store, token, rec);
    const h = new Harness({ mapId: 'margem_esquerda', content: false, store, city });
    const bot = await h.connectAsync({ token, seed: 501 });
    const ITEM = D.shopsById.get('loja_brigada_popular')!.itens[0]!.item;

    h.game(bot, GAME_MSG.lojaComprar, { loja: 'loja_brigada_popular', item: ITEM });
    expect(result(bot)).toMatchObject({ acao: GAME_MSG.lojaComprar, ok: false });

    const balcao = markerOf('margem_esquerda', 'loja_brigada_popular');
    teleport(h, bot, balcao.x, balcao.y);
    h.game(bot, GAME_MSG.lojaComprar, { loja: 'loja_brigada_popular', item: ITEM });
    expect(result(bot)).toMatchObject({ ok: true });
    const preco = D.shopsById.get('loja_brigada_popular')!.itens[0]!.preco.semente!;
    let r = h.core.recordOf(bot.sid)!;
    expect(r.semente).toBe(100 - preco);
    expect(r.inventory).toContain(ITEM);
    expect(lastOf<S2C_Carteira>(bot, GAME_MSG.carteira)?.semente).toBe(100 - preco);
    expect(h.core.entityOf(bot.sid)!.semente).toBe(100 - preco);

    h.game(bot, GAME_MSG.lojaVender, { loja: 'loja_brigada_popular', item: ITEM });
    expect(result(bot)).toMatchObject({ ok: true });
    r = h.core.recordOf(bot.sid)!;
    expect(r.inventory).not.toContain(ITEM);
    expect(r.semente).toBe(100 - preco + Math.floor(preco * D.economy.lojasNpc.compraDoJogadorPct));
    expect(city.events.map((e) => e.tipo)).toEqual(expect.arrayContaining(['loja_compra', 'loja_venda']));
    // o Store recebeu os eventos
    expect(store.events.some((e) => e.tipo === 'loja_compra' && e.jogador === rec.id)).toBe(true);
  });
});

describe('feira entre jogadores', () => {
  it('o anúncio de um jogador é comprado por outro, de outra sala, e o vendedor recebe na hora', async () => {
    const store = new MemoryStore();
    const { city } = testCity(store);
    const ITEM = 'cabeca_combatente_esquerda_raro';
    const a = margemRecord(uid(11), 'esquerda');
    a.inventory = [ITEM];
    a.semente = 10;
    const b = margemRecord(uid(12), 'esquerda');
    b.semente = 200;
    await seed(store, 'tok-fase4-feira-vend', a);
    await seed(store, 'tok-fase4-feira-comp', b);
    const hA = new Harness({ mapId: 'margem_esquerda', content: false, store, city });
    const hB = new Harness({ mapId: 'margem_esquerda', content: false, store, city });
    const botA = await hA.connectAsync({ token: 'tok-fase4-feira-vend', seed: 511 });
    const botB = await hB.connectAsync({ token: 'tok-fase4-feira-comp', seed: 512 });
    const feira = markerOf('margem_esquerda', 'lugar_feira_da_esquerda');
    teleport(hA, botA, feira.x, feira.y);
    teleport(hB, botB, feira.x + 1, feira.y);

    hA.game(botA, GAME_MSG.feiraAnunciar, { bem: { tipo: 'item', id: ITEM }, preco: 100 });
    expect(result(botA)).toMatchObject({ ok: true });
    expect(hA.core.recordOf(botA.sid)!.inventory).not.toContain(ITEM);

    hB.game(botB, GAME_MSG.mercadoListar, { mercado: 'feira' });
    const lista = lastOf<S2C_MercadoInfo>(botB, GAME_MSG.mercadoInfo)!;
    const anuncio = lista.anuncios.find((x) => x.bem.id === ITEM)!;
    expect(anuncio).toMatchObject({ preco: 100, vendedor: a.id, meu: false });

    hB.game(botB, GAME_MSG.feiraComprar, { anuncio: anuncio.id });
    expect(result(botB)).toMatchObject({ ok: true });
    expect(hB.core.recordOf(botB.sid)!.inventory).toContain(ITEM);
    expect(hB.core.recordOf(botB.sid)!.semente).toBe(100);
    // o vendedor está em outra sala: recebe pela cidade, com aviso
    hA.drain();
    expect(hA.core.recordOf(botA.sid)!.semente).toBe(110);
    expect(botA.robot.gameLog.some((g) => g.type === GAME_MSG.aviso && String((g.msg as { texto: string }).texto).includes('levou'))).toBe(true);
    expect(city.state.mercado.anuncios).toHaveLength(0);
    expect(city.events.map((e) => e.tipo)).toEqual(expect.arrayContaining(['feira_anuncio', 'feira_compra', 'mercado_recebido']));
    // comprar de si mesmo não vale; anúncio que não existe também não
    hB.game(botB, GAME_MSG.feiraComprar, { anuncio: anuncio.id });
    expect(result(botB)).toMatchObject({ ok: false });
  });
});

describe('câmbio na ponte', () => {
  it('troca Semente por Crédito no câmbio da Usina; longe dele, não', async () => {
    const store = new MemoryStore();
    const { city } = testCity(store);
    const token = 'tok-fase4-cambio-01';
    const rec = margemRecord(uid(21), 'esquerda');
    rec.semente = 500;
    rec.credito = 0;
    await seed(store, token, rec);
    setArrival(token, 'usina_da_ponte');
    const h = new Harness({ mapId: 'usina_da_ponte', content: false, store, city });
    const bot = await h.connectAsync({ token, seed: 521 });
    expect(bot.robot.welcome?.mapId).toBe('usina_da_ponte');

    const casa = markerOf('usina_da_ponte', 'lugar_cambio_da_ponte');
    teleport(h, bot, casa.x + 30, casa.y);
    h.game(bot, GAME_MSG.cambioTrocar, { de: 'semente', quantidade: 100 });
    expect(result(bot)).toMatchObject({ ok: false });

    h.game(bot, GAME_MSG.cambioCotar, { de: 'semente', quantidade: 100 });
    const info = lastOf<S2C_CambioInfo>(bot, GAME_MSG.cambioInfo)!;
    const esperado = cotarTroca(city.state.cambio, 'semente', 100, city.state.medidores).recebe;
    expect(info.cotacao?.recebe).toBe(esperado);
    expect(esperado).toBeGreaterThan(0);

    teleport(h, bot, casa.x, casa.y);
    h.game(bot, GAME_MSG.cambioTrocar, { de: 'semente', quantidade: 100 });
    expect(result(bot)).toMatchObject({ ok: true });
    const r = h.core.recordOf(bot.sid)!;
    expect(r.semente).toBe(400);
    expect(r.credito).toBe(esperado);
    expect(city.state.cambio.volumeLiquidoS).toBe(100);
    expect(lastOf<S2C_CambioInfo>(bot, GAME_MSG.cambioInfo)?.usadoCiclo).toBe(100);
    expect(city.events.some((e) => e.tipo === 'cambio_troca')).toBe(true);
  });
});

describe('aluguel no ciclo da cidade', () => {
  it('a cápsula da Direita cobra a cada ciclo; sem saldo, atrasa e o despejo vem no 3º atraso', async () => {
    const store = new MemoryStore();
    const { clock, city } = testCity(store);
    const token = 'tok-fase4-aluguel-1';
    const rec = margemRecord(uid(31), 'direita');
    rec.credito = 200;
    await seed(store, token, rec);
    const h = new Harness({ mapId: 'margem_direita', content: false, store, city });
    const bot = await h.connectAsync({ token, seed: 531 });
    expect(bot.robot.welcome?.mapId).toBe('margem_direita');
    // chegou: cápsula com o 1º ciclo pago
    expect(h.core.recordOf(bot.sid)!.home?.tipo).toBe('capsula');
    expect(h.core.recordOf(bot.sid)!.credito).toBe(200);

    const aluguel = D.housing.tipos.find((t) => t.id === 'capsula')!.aluguel!.porCiclo;
    clock.t += 10 * 60_000;
    const t1 = city.tick();
    expect(t1.ciclosNovos).toBe(1);
    h.drain();
    expect(h.core.recordOf(bot.sid)!.credito).toBe(200 - aluguel);
    expect(h.core.entityOf(bot.sid)!.credito).toBe(200 - aluguel);
    expect(lastOf<S2C_Carteira>(bot, GAME_MSG.carteira)?.credito).toBe(200 - aluguel);

    // sem saldo: 3 ciclos de atraso e despejo
    h.core.entityOf(bot.sid)!.credito = 0;
    for (let i = 0; i < 3; i++) {
      clock.t += 10 * 60_000;
      city.tick();
    }
    h.drain();
    const r = h.core.recordOf(bot.sid)!;
    expect(r.home).toBeNull();
    expect(r.economia?.divida ?? 0).toBeGreaterThan(0);
    expect(city.events.filter((e) => e.tipo === 'ciclo_jogador' && e.jogador === rec.id).length).toBeGreaterThanOrEqual(4);
    expect(city.events.some((e) => e.tipo === 'ciclo_cidade')).toBe(true);
  });

  it('quem estava fora acerta os ciclos ao entrar', async () => {
    const store = new MemoryStore();
    const { clock, city } = testCity(store);
    const token = 'tok-fase4-aluguel-2';
    const rec = margemRecord(uid(32), 'direita');
    rec.credito = 500;
    await seed(store, token, rec);
    const h = new Harness({ mapId: 'margem_direita', content: false, store, city });
    const bot = await h.connectAsync({ token, seed: 532 });
    h.disconnect(bot);
    h.tick(1);
    // sai do mapa (no automático até OFFLINE_AUTO_MS): força a saída
    await h.core.saveAll();
    const h2 = new Harness({ mapId: 'margem_direita', content: false, store, city });
    h.core.dispose();
    clock.t += 2 * 10 * 60_000;
    city.tick();
    const b2 = await h2.connectAsync({ token, seed: 533 });
    const aluguel = D.housing.tipos.find((t) => t.id === 'capsula')!.aluguel!.porCiclo;
    expect(h2.core.recordOf(b2.sid)!.credito).toBe(500 - 2 * aluguel);
  });
});

describe('decorar e visitar a casa', () => {
  it('o dono decora, a visita entra pela porta na sala casa:<id>, vê a casa ao vivo e sai pela porta', async () => {
    const store = new MemoryStore();
    const { city } = testCity(store);
    const A = margemRecord(uid(41), 'esquerda');
    A.semente = 300;
    const B = margemRecord(uid(42), 'esquerda');
    const C = margemRecord(uid(43), 'esquerda');
    await seed(store, 'tok-fase4-casa-dono', A);
    await seed(store, 'tok-fase4-casa-visi', B);
    await seed(store, 'tok-fase4-casa-terc', C);
    const hA = new Harness({ mapId: 'margem_esquerda', content: false, store, city, dev: true });
    const hB = new Harness({ mapId: 'margem_esquerda', content: false, store, city });
    const botA = await hA.connectAsync({ token: 'tok-fase4-casa-dono', seed: 541 });
    const botB = await hB.connectAsync({ token: 'tok-fase4-casa-visi', seed: 542 });

    // chegou na Esquerda: rede no galpão e lista de espera; o atalho de teste dá a casa da lista
    expect(hA.core.recordOf(botA.sid)!.home?.tipo).toBe('rede_no_galpao');
    hA.game(botA, GAME_MSG.casaAvancarFila, {});
    expect(result(botA)).toMatchObject({ ok: true });
    expect(hA.core.recordOf(botA.sid)!.home?.tipo).toBe('casa_da_lista');
    // sem o modo de desenvolvimento, o atalho não vale
    hB.game(botB, GAME_MSG.casaAvancarFila, {});
    expect(result(botB)).toMatchObject({ ok: false });

    // decorar: compra e já põe, gira
    hA.game(botA, GAME_MSG.casaComprarMovel, { movel: 'banco_de_madeira', colocar: { x: 1, y: 1 } });
    expect(result(botA)).toMatchObject({ ok: true });
    let casa = lastOf<S2C_CasaInfo>(botA, GAME_MSG.casaInfo)!;
    expect(casa.moveis).toHaveLength(1);
    expect(casa.somenteLeitura).toBe(false);
    const movelUid = casa.moveis[0]!.uid;
    hA.game(botA, GAME_MSG.casaGirar, { uid: movelUid });
    expect(result(botA)).toMatchObject({ ok: true });
    casa = lastOf<S2C_CasaInfo>(botA, GAME_MSG.casaInfo)!;
    expect(casa.moveis[0]).toMatchObject({ rot: 1, w: 1, h: 2 });
    hA.game(botA, GAME_MSG.casaMover, { uid: movelUid, x: 3, y: 2 });
    expect(hA.core.recordOf(botA.sid)!.home!.moveis[0]).toMatchObject({ x: 3, y: 2, rot: 1 });
    hA.game(botA, GAME_MSG.casaMover, { uid: movelUid, x: 99, y: 2 });
    expect(result(botA)).toMatchObject({ ok: false });

    // visita longe da porta: só mostra a casa
    hB.game(botB, GAME_MSG.casaVisitar, { playerId: A.id });
    await hB.core.idle();
    hB.drain();
    expect(result(botB)).toMatchObject({ ok: true });
    expect(lastOf<S2C_CasaInfo>(botB, GAME_MSG.casaInfo)).toMatchObject({ dono: A.id, somenteLeitura: true });
    expect(botB.robot.trocarSala).toBeUndefined();

    // perto da porta das moradias: entra na sala da casa
    const porta = markerOf('margem_esquerda', 'moradia_mutiroes');
    teleport(hB, botB, porta.x, porta.y + 3);
    hB.game(botB, GAME_MSG.casaVisitar, { playerId: A.id });
    await hB.core.idle();
    await tickAsync();
    hB.drain();
    expect(botB.robot.trocarSala).toEqual({ mapId: houseMapId(A.id), motivo: 'registro' });
    expect(hB.core.entityOf(botB.sid)).toBeUndefined();

    const owner = (await city.findRecord(A.id))!;
    const hCasa = new Harness({ mapId: houseMapId(A.id), map: buildHouseMap(owner), house: { owner }, content: false, store, city });
    const b2 = await hCasa.connectAsync({ token: 'tok-fase4-casa-visi', seed: 543 });
    expect(b2.robot.welcome?.mapId).toBe(houseMapId(A.id));
    expect(lastOf<S2C_CasaInfo>(b2, GAME_MSG.casaInfo)).toMatchObject({ dono: A.id, somenteLeitura: true, w: 7, h: 7 });
    expect(lastOf<S2C_CasaInfo>(b2, GAME_MSG.casaInfo)!.moveis).toHaveLength(1);

    // o dono decora de fora: quem está na casa vê na hora
    hA.game(botA, GAME_MSG.casaTirar, { uid: movelUid });
    expect(result(botA)).toMatchObject({ ok: true });
    hCasa.drain();
    expect(lastOf<S2C_CasaInfo>(b2, GAME_MSG.casaInfo)!.moveis).toHaveLength(0);
    expect(hA.core.recordOf(botA.sid)!.inventory).toContain('movel:banco_de_madeira');

    // a visita sai pela porta da casa e volta para a frente das moradias
    hCasa.tick(45);
    const saida = buildHouseMap(owner).markers.find((m) => m.kind === 'saida')!;
    teleport(hCasa, b2, saida.x, saida.y);
    hCasa.tick(10);
    await tickAsync();
    hCasa.drain();
    expect(b2.robot.trocarSala).toEqual({ mapId: 'margem_esquerda', motivo: 'registro' });
    const hB2 = new Harness({ mapId: 'margem_esquerda', content: false, store, city });
    const b3 = await hB2.connectAsync({ token: 'tok-fase4-casa-visi', seed: 544 });
    const eB = hB2.core.entityOf(b3.sid)!;
    expect(Math.hypot(eB.x - porta.x, eB.y - porta.y)).toBeLessThan(1);
    // nasceu na porta: não volta para a casa sem sair e entrar de novo
    hB2.tick(60);
    expect(b3.robot.trocarSala).toBeUndefined();

    // trancada: só o dono
    hA.game(botA, GAME_MSG.casaVisitas, { permissao: 'so_eu' });
    expect(result(botA)).toMatchObject({ ok: true });
    const hC = new Harness({ mapId: 'margem_esquerda', content: false, store, city });
    const botC = await hC.connectAsync({ token: 'tok-fase4-casa-terc', seed: 545 });
    hC.game(botC, GAME_MSG.casaVisitar, { playerId: A.id });
    await hC.core.idle();
    hC.drain();
    expect(result(botC)).toMatchObject({ ok: false });
    // convidado entra mesmo trancada
    hA.game(botA, GAME_MSG.casaVisitas, { convidar: C.id });
    hC.game(botC, GAME_MSG.casaVisitar, { playerId: A.id });
    await hC.core.idle();
    hC.drain();
    expect(result(botC)).toMatchObject({ ok: true });

    // o dono entra pela porta andando até ela
    hA.tick(45);
    teleport(hA, botA, porta.x, porta.y);
    hA.tick(10);
    await tickAsync();
    hA.drain();
    expect(botA.robot.trocarSala).toEqual({ mapId: houseMapId(A.id), motivo: 'registro' });
    expect(city.events.some((e) => e.tipo === 'casa_entrada' && e.jogador === A.id)).toBe(true);
  });

  it('o mapa da casa tem o nascimento e a saída andáveis, e a porta no meio da parede de baixo', () => {
    const rec = margemRecord(uid(51), 'direita');
    rec.home = { tipo: 'capsula', moveis: [], seq: 1, visitas: 'margem', convidados: [], espera: null };
    const m = buildHouseMap(rec);
    expect(m.id).toBe(houseMapId(rec.id));
    expect(m.width).toBe(3 + 2);
    expect(m.height).toBe(5 + 3);
    for (const mk of m.markers) {
      const t = m.tiles[Math.floor(mk.y) * m.width + Math.floor(mk.x)]!;
      expect(TILE_INFO[t]!.solid).toBe(false);
    }
    const saida = m.markers.find((x) => x.kind === 'saida')!;
    expect(saida.params).toMatchObject({ para: 'margem_direita', spawn: 'moradia_predios_de_capsulas' });
  });
});

describe('ponta a ponta da Fase 4', () => {
  const semCasa = (rec: PlayerRecord) => {
    rec.home = null;
    rec.economia = { ciclo: 0, divida: 0, scoreCiclo: {}, cambioCiclo: 0, moradiaDada: true };
  };
  const proximoCiclo = (clock: { t: number }, city: CityService) => {
    clock.t += 10 * 60_000;
    return city.tick();
  };

  it('Esquerda: ganha Semente, compra na loja, anuncia na feira, outro compra, câmbio, fila do mutirão, casa, decora e recebe visita', async () => {
    const store = new MemoryStore();
    const { clock, city } = testCity(store);
    const A = margemRecord(uid(71), 'esquerda');
    A.semente = 0;
    semCasa(A);
    const B = margemRecord(uid(72), 'esquerda');
    B.semente = 300;
    await seed(store, 'tok-fase4-ponta-aaa', A);
    await seed(store, 'tok-fase4-ponta-bbb', B);
    const hA = new Harness({ mapId: 'margem_esquerda', content: false, store, city });
    const hB = new Harness({ mapId: 'margem_esquerda', content: false, store, city });
    const botA = await hA.connectAsync({ token: 'tok-fase4-ponta-aaa', seed: 571 });
    const botB = await hB.connectAsync({ token: 'tok-fase4-ponta-bbb', seed: 572 });
    expect(hA.core.recordOf(botA.sid)!.home ?? null).toBeNull();

    // 1. ganha Semente: saque de moedas no chão, coletado sozinho
    const eA = hA.core.entityOf(botA.sid)!;
    spawnLoot(hA.world, eA.x, eA.y, { currency: { semente: 300 }, forPlayerId: eA.playerId ?? `#${eA.id}` }, 'Moedas');
    hA.tick(10);
    expect(hA.core.entityOf(botA.sid)!.semente).toBe(300);

    // 2. compra na loja da Brigada, no balcão
    const loja = D.shopsById.get('loja_brigada_popular')!;
    const ITEM = loja.itens[0]!.item;
    const precoLoja = loja.itens[0]!.preco.semente!;
    const balcao = markerOf('margem_esquerda', 'loja_brigada_popular');
    teleport(hA, botA, balcao.x, balcao.y);
    hA.game(botA, GAME_MSG.lojaComprar, { loja: loja.id, item: ITEM });
    expect(result(botA)).toMatchObject({ ok: true });
    expect(hA.core.recordOf(botA.sid)!.semente).toBe(300 - precoLoja);
    expect(hA.core.recordOf(botA.sid)!.inventory).toContain(ITEM);

    // 3. anuncia na feira
    const feira = markerOf('margem_esquerda', 'lugar_feira_da_esquerda');
    teleport(hA, botA, feira.x, feira.y);
    teleport(hB, botB, feira.x + 1, feira.y);
    hA.game(botA, GAME_MSG.feiraAnunciar, { bem: { tipo: 'item', id: ITEM }, preco: precoLoja });
    expect(result(botA)).toMatchObject({ ok: true });
    expect(hA.core.recordOf(botA.sid)!.inventory).not.toContain(ITEM);

    // 4. outro jogador compra
    hB.game(botB, GAME_MSG.mercadoListar, { mercado: 'feira' });
    const anuncio = lastOf<S2C_MercadoInfo>(botB, GAME_MSG.mercadoInfo)!.anuncios.find((x) => x.bem.id === ITEM && x.vendedor === A.id)!;
    expect(anuncio).toBeDefined();
    const precoFeira = anuncio.preco!;
    expect(precoFeira).toBeGreaterThan(0);
    hB.game(botB, GAME_MSG.feiraComprar, { anuncio: anuncio.id });
    expect(result(botB)).toMatchObject({ ok: true });
    expect(hB.core.recordOf(botB.sid)!.inventory).toContain(ITEM);
    expect(hB.core.recordOf(botB.sid)!.semente).toBe(300 - precoFeira);
    hA.drain();
    const recebido = hA.core.recordOf(botA.sid)!.semente - (300 - precoLoja);
    // a feira não tem taxa: o vendedor recebe o preço cheio
    expect(recebido).toBe(precoFeira);

    // 5. entra na fila do mutirão (lista de espera da Assembleia)
    hA.game(botA, GAME_MSG.casaListaEspera, {});
    expect(result(botA)).toMatchObject({ ok: true });
    const L = D.housing.listaDeEspera;
    expect(hA.core.recordOf(botA.sid)!.home).toMatchObject({ tipo: L.moradiaProvisoria, espera: { ciclosRestantes: L.ciclosBase } });
    hA.game(botA, GAME_MSG.casaListaEspera, {});
    expect(result(botA)).toMatchObject({ ok: false });

    // 6. troca no câmbio: vai até a Usina pela saída do mapa
    hA.tick(45);
    const saida = markerOf('margem_esquerda', 'saida_usina_da_ponte');
    teleport(hA, botA, saida.x, saida.y);
    hA.tick(10);
    await hA.core.idle();
    await tickAsync();
    hA.drain();
    expect(botA.robot.trocarSala?.mapId).toBe('usina_da_ponte');
    const hU = new Harness({ mapId: 'usina_da_ponte', content: false, store, city });
    const botU = await hU.connectAsync({ token: 'tok-fase4-ponta-aaa', seed: 573 });
    expect(botU.robot.welcome?.mapId).toBe('usina_da_ponte');
    const antesCambio = hU.core.recordOf(botU.sid)!;
    const sAntes = antesCambio.semente;
    expect(sAntes).toBe(300 - precoLoja + recebido);
    const cambio = markerOf('usina_da_ponte', 'lugar_cambio_da_ponte');
    teleport(hU, botU, cambio.x, cambio.y);
    const esperado = cotarTroca(city.state.cambio, 'semente', 100, city.state.medidores).recebe;
    hU.game(botU, GAME_MSG.cambioTrocar, { de: 'semente', quantidade: 100 });
    expect(result(botU)).toMatchObject({ ok: true });
    expect(hU.core.recordOf(botU.sid)!.semente).toBe(sAntes - 100);
    expect(hU.core.recordOf(botU.sid)!.credito).toBe(A.credito + esperado);

    // 7. ganha a casa: a lista anda um ciclo por vez até sair a casa da lista
    for (let i = 0; i < L.ciclosBase - 1; i++) proximoCiclo(clock, city);
    hU.drain();
    expect(hU.core.recordOf(botU.sid)!.home).toMatchObject({ tipo: L.moradiaProvisoria, espera: { ciclosRestantes: 1 } });
    proximoCiclo(clock, city);
    hU.drain();
    expect(hU.core.recordOf(botU.sid)!.home?.tipo).toBe(L.moradiaFinal);
    expect(hU.core.recordOf(botU.sid)!.home?.espera ?? null).toBeNull();

    // 8. decora: compra o banco e põe na casa
    const banco = D.furnitureById.get('banco_de_madeira')!;
    const precoBanco = (banco.preco.find((p) => p.moeda === 'semente') ?? banco.preco[0]!).valor;
    const sAntesMovel = hU.core.recordOf(botU.sid)!.semente;
    hU.game(botU, GAME_MSG.casaComprarMovel, { movel: 'banco_de_madeira', colocar: { x: 2, y: 2 } });
    expect(result(botU)).toMatchObject({ ok: true });
    expect(hU.core.recordOf(botU.sid)!.semente).toBe(sAntesMovel - precoBanco);
    expect(hU.core.recordOf(botU.sid)!.home!.moveis).toMatchObject([{ id: 'banco_de_madeira', x: 2, y: 2 }]);

    // 9. outro visita e vê o banco
    hB.game(botB, GAME_MSG.casaVisitar, { playerId: A.id });
    await hB.core.idle();
    hB.drain();
    expect(result(botB)).toMatchObject({ ok: true });
    const vista = lastOf<S2C_CasaInfo>(botB, GAME_MSG.casaInfo)!;
    expect(vista).toMatchObject({ dono: A.id, somenteLeitura: true });
    expect(vista.moveis.map((m) => m.id)).toEqual(['banco_de_madeira']);

    const tipos = city.events.map((e) => e.tipo);
    expect(tipos).toEqual(expect.arrayContaining(['loja_compra', 'feira_anuncio', 'feira_compra', 'cambio_troca', 'ciclo_cidade']));
    hA.core.dispose();
    hB.core.dispose();
    hU.core.dispose();
  });

  it('Direita: aluga a cápsula, o ciclo cobra e, sem pagar, vem o despejo', async () => {
    const store = new MemoryStore();
    const { clock, city } = testCity(store);
    const R = margemRecord(uid(81), 'direita');
    R.rank = 'colaborador'; // a patente inicial da Direita (a cápsula pede colaborador)
    semCasa(R);
    const aluguel = valorAluguel('capsula');
    R.credito = 2 * aluguel;
    await seed(store, 'tok-fase4-ponta-ddd', R);
    const h = new Harness({ mapId: 'margem_direita', content: false, store, city });
    const bot = await h.connectAsync({ token: 'tok-fase4-ponta-ddd', seed: 581 });
    expect(h.core.recordOf(bot.sid)!.home ?? null).toBeNull();

    // aluga: paga o primeiro ciclo
    h.game(bot, GAME_MSG.casaAlugar, { tipo: 'capsula' });
    expect(result(bot), JSON.stringify(result(bot))).toMatchObject({ ok: true });
    expect(h.core.recordOf(bot.sid)!.home?.tipo).toBe('capsula');
    expect(h.core.recordOf(bot.sid)!.credito).toBe(aluguel);

    // o ciclo cobra: em dia
    proximoCiclo(clock, city);
    h.drain();
    let r = h.core.recordOf(bot.sid)!;
    expect(r.credito).toBe(0);
    expect(r.home).toMatchObject({ tipo: 'capsula', atraso: 0 });
    expect(r.economia?.divida).toBe(0);

    // sem saldo: atrasa 1, 2 e, no 3º, despejo
    proximoCiclo(clock, city);
    h.drain();
    r = h.core.recordOf(bot.sid)!;
    expect(r.home).toMatchObject({ tipo: 'capsula', atraso: 1 });
    expect(r.economia?.divida).toBe(aluguel);
    proximoCiclo(clock, city);
    h.drain();
    expect(h.core.recordOf(bot.sid)!.home).toMatchObject({ atraso: 2 });
    proximoCiclo(clock, city);
    h.drain();
    r = h.core.recordOf(bot.sid)!;
    expect(r.home).toBeNull();
    expect(r.economia?.divida).toBe(3 * aluguel);
    expect(lastOf<S2C_Carteira>(bot, GAME_MSG.carteira)?.divida).toBe(3 * aluguel);
    // despejado e devendo: não aluga de novo sem quitar
    h.game(bot, GAME_MSG.casaAlugar, { tipo: 'capsula' });
    expect(result(bot)).toMatchObject({ ok: false });
    h.core.dispose();
  });
});

describe('persistência da cidade e do log', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pqp-fase4-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('o FileStore guarda a cidade (world.json), o log (events.jsonl) e acha o jogador pelo id', async () => {
    const file = path.join(dir, 'players.json');
    const s1 = new FileStore(file, 10);
    const rec = margemRecord(uid(61), 'esquerda');
    rec.inventory = ['cabeca_combatente_esquerda_raro'];
    await seed(s1, 'tok-fase4-arquivo-1', rec);
    const { city } = testCity(s1);
    await city.load();
    // um anúncio na feira, direto pelas regras, e a cidade salva
    const { anunciarFeira } = await import('@pqp/shared/game/index');
    expect(anunciarFeira(city.state.mercado, rec, { bem: { tipo: 'item', id: 'cabeca_combatente_esquerda_raro' }, preco: 50 }, city.now()).ok).toBe(true);
    city.logEvent('feira_anuncio', rec.id, { preco: 50 });
    await city.flush();

    const s2 = new FileStore(file, 10);
    const c2 = new CityService({ store: s2, now: () => 1_000_000, cicloMin: 10, log: () => undefined });
    await c2.load();
    expect(c2.state.mercado.anuncios).toHaveLength(1);
    expect((await s2.findPlayerById(rec.id))?.token).toBe('tok-fase4-arquivo-1');
    const lines = readFileSync(path.join(dir, 'events.jsonl'), 'utf8').trim().split('\n');
    expect(JSON.parse(lines.at(-1)!)).toMatchObject({ tipo: 'feira_anuncio', jogador: rec.id });
  });
});
