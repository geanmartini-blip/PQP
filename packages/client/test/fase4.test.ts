/**
 * Fase 4 no cliente: o estado com as mensagens de economia, o modelo das telas (carteira, loja,
 * lugares perto, NPC que abre tela, grade da casa) e o servidor local rodando as regras de
 * shared/game (loja, feira com fila, app com taxa, câmbio, moradia, móveis e ciclo da cidade).
 */
import { describe, expect, it } from 'vitest';
import { getData } from '@pqp/shared';
import { FLAG_BRUNO, raiseToLevel, type CidadeState } from '@pqp/shared/game/index';
import { getMap } from '@pqp/shared/map';
import { GAME_MSG, MSG, type S2C_CambioInfo, type S2C_CasaInfo, type S2C_EconomiaResultado, type S2C_MercadoInfo } from '@pqp/shared/net';
import { GameState, type CarteiraInfo } from '../src/game/gameState';
import { LocalServer, NPC_SELLERS, type RecordStore } from '../src/net/localServer';
import { furnitureAt, furnitureCatalog, goodsOf, nearSpots, nextVisit, npcSpots, sellEstimate, shopRows, tileAt, walletLabel } from '../src/ui/economyModel';

const D = getData();
const okLook = () => ({ ...D.appearance.padrao, details: [] as string[] });
const memStore = (): RecordStore => {
  const data = new Map<string, string>();
  return { load: (id) => (data.has(id) ? JSON.parse(data.get(id)!) : null), save: (id, rec) => void data.set(id, JSON.stringify(rec)) };
};

const all = <T>(out: [string, unknown][], type: string): T[] => out.filter(([t]) => t === type).map(([, m]) => m as T);
const lastOf = <T>(out: [string, unknown][], type: string): T | undefined => all<T>(out, type).pop();

/** Personagem já atravessado, na margem, com relógio controlado. */
function onMargin(side: 'esquerda' | 'direita', clock = { t: 0 }) {
  let city: unknown = null;
  const s = new LocalServer({
    store: memStore(),
    noEnemies: true,
    // atalho de teste: a travessia direta do Delta (o barco tem o teste dele em barco.test.ts)
    atalhoTravessia: true,
    clock: () => clock.t,
    cityStore: { load: () => city, save: (c: CidadeState) => void (city = JSON.parse(JSON.stringify(c))) },
    cityCycleMin: 10,
  });
  s.receive(MSG.hello, { token: `tok_f4_${side}`, name: 'Zé' });
  s.receive(GAME_MSG.criarPersonagem, { name: 'Zé da Silva', appearance: okLook() });
  const rec = s.rec!;
  rec.story_flags.push(FLAG_BRUNO);
  raiseToLevel(rec, 8);
  const inst = D.institutions.instituicoes.find((i) => i.margem === side)!;
  const guia = D.guides.guias.find((g) => g.margem === side)!;
  s.receive(GAME_MSG.travessia, { side, institution: inst.id, guide: guia.id });
  const out = s.take();
  return { s, rec, inst, out, clock, city: () => city };
}

describe('GameState (Fase 4)', () => {
  it('guarda carteira, mercado, câmbio, casa e o resultado; erro vira aviso e lastError', () => {
    const g = new GameState();
    g.onMessage(GAME_MSG.carteira, { semente: 5, credito: 0, inventario: ['x'] }, 0);
    expect(g.wallet?.inventario).toEqual(['x']);
    g.onMessage(GAME_MSG.mercadoInfo, { mercado: 'feira', anuncios: [] }, 0);
    expect(g.market?.mercado).toBe('feira');
    g.onMessage(GAME_MSG.cambioInfo, { taxa: { cotacao: 2 }, usadoCiclo: 0 }, 0);
    expect(g.exchange?.taxa.cotacao).toBe(2);
    g.onMessage(GAME_MSG.casaInfo, { dono: 'a', moveis: [] }, 0);
    expect(g.house?.dono).toBe('a');
    g.onMessage(GAME_MSG.economiaResultado, { acao: 'loja_comprar', ok: false, erro: 'Faltam 3 Sementes.' }, 10);
    expect(g.lastError?.texto).toBe('Faltam 3 Sementes.');
    expect(g.toasts.at(-1)?.tipo).toBe('erro');
    g.onMessage(GAME_MSG.economiaResultado, { acao: 'loja_comprar', ok: true, texto: 'Comprou.' }, 20);
    expect(g.econ?.ok).toBe(true);
    expect(g.toasts.at(-1)?.texto).toBe('Comprou.');
  });
});

describe('modelo das telas da Fase 4', () => {
  it('carteira no HUD na moeda da margem, com alerta de dívida', () => {
    expect(walletLabel({ side: 'esquerda', semente: 30, credito: 9 })).toBe('30 S');
    expect(walletLabel({ side: 'direita', semente: 30, credito: 9, divida: 4 })).toBe('9 Cr !');
  });

  it('bens agrupados do inventário e recursos; estimativa de venda a 40%', () => {
    const goods = goodsOf(['pao_da_feira', 'pao_da_feira', 'movel:banco_de_madeira'], { comida: 3, pecas: 0 });
    expect(goods.find((g) => g.invId === 'pao_da_feira')?.qtd).toBe(2);
    expect(goods.find((g) => g.invId === 'movel:banco_de_madeira')?.bem).toEqual({ tipo: 'movel', id: 'banco_de_madeira' });
    expect(goods.find((g) => g.invId === 'comida')?.qtd).toBe(3);
    expect(goods.some((g) => g.invId === 'pecas')).toBe(false);
    const est = sellEstimate('loja_brigada_popular', { tipo: 'item', id: 'pao_da_feira' }, 'esquerda');
    expect(est?.moeda).toBe('semente');
    expect(est!.valor).toBeGreaterThanOrEqual(1);
  });

  it('loja: preço da tabela na moeda da margem; a dinâmica marca aproximado', () => {
    const esq = shopRows('loja_brigada_popular', { side: 'esquerda', rank: null });
    expect(esq.length).toBeGreaterThan(0);
    expect(esq.every((r) => r.moeda === 'semente' && !r.aprox)).toBe(true);
    const dir = shopRows('loja_torre_do_consorcio', { side: 'direita', rank: null });
    expect(dir.every((r) => r.moeda === 'credito' && r.aprox)).toBe(true);
  });

  it('lugares perto: loja, porta da casa, feira, câmbio; NPC da loja e o cambista abrem tela', () => {
    const me = getMap('margem_esquerda');
    const loja = me.markers.find((m) => m.kind === 'loja' && m.ref === 'loja_brigada_popular')!;
    expect(nearSpots(me, loja.x, loja.y, 'esquerda')).toContainEqual({ kind: 'loja', shop: 'loja_brigada_popular' });
    const porta = me.markers.find((m) => m.kind === 'moradia')!;
    expect(nearSpots(me, porta.x, porta.y, 'esquerda')).toContainEqual({ kind: 'casa' });
    expect(nearSpots(me, porta.x, porta.y, 'direita')).not.toContainEqual({ kind: 'casa' });
    const feira = me.markers.find((m) => m.kind === 'lugar' && m.ref === 'feira_da_esquerda')!;
    expect(nearSpots(me, feira.x, feira.y, 'esquerda')).toContainEqual({ kind: 'feira' });
    expect(npcSpots('jacques', me, loja.x, loja.y, 'esquerda')).toContainEqual({ kind: 'loja', shop: 'loja_brigada_popular' });
    const us = getMap('usina_da_ponte');
    const cam = us.markers.find((m) => m.kind === 'lugar' && m.ref === 'cambio_da_ponte')!;
    expect(nearSpots(us, cam.x, cam.y, 'direita')).toContainEqual({ kind: 'cambio' });
    expect(npcSpots('cambista_da_ponte', us, cam.x, cam.y, 'esquerda')).toContainEqual({ kind: 'cambio' });
  });

  it('grade da casa: toque vira tile, móvel sob o toque, catálogo e visitas', () => {
    const tex = { w: 9 * 32 + 16, h: 8 * 32 + 54, floorX: 8, floorY: 48, tilesW: 9, tilesH: 8 };
    expect(tileAt(8 + 40, 48 + 70, tex.w, tex.h, tex)).toEqual({ x: 1, y: 2 });
    expect(tileAt(2, 2, tex.w, tex.h, tex)).toBeNull();
    // o elemento com a metade do tamanho
    expect(tileAt((8 + 40) / 2, (48 + 70) / 2, tex.w / 2, tex.h / 2, tex)).toEqual({ x: 1, y: 2 });
    const mv = [{ uid: 1, x: 1, y: 1, w: 3, h: 1, parede: false }];
    expect(furnitureAt(mv, 3, 1)?.uid).toBe(1);
    expect(furnitureAt(mv, 4, 1)).toBeUndefined();
    const cat = furnitureCatalog('direita');
    expect(cat.length).toBeGreaterThan(10);
    expect(cat.every((f) => f.moeda === 'credito')).toBe(true);
    expect(nextVisit('margem')).toBe('todos');
    expect(nextVisit('todos')).toBe('so_eu');
  });
});

describe('servidor local com as regras da Fase 4', () => {
  it('a travessia dá a moradia inicial e a carteira vem com o inventário', () => {
    const { s, rec, out } = onMargin('esquerda');
    expect(rec.home?.espera?.ciclosRestantes).toBeGreaterThan(0);
    const w = lastOf<CarteiraInfo>(out, GAME_MSG.carteira)!;
    expect(w.moedaDaMargem).toBe('semente');
    rec.inventory.push('pao_da_feira');
    s.receive(GAME_MSG.carteiraPedir, {});
    expect(lastOf<CarteiraInfo>(s.take(), GAME_MSG.carteira)?.inventario).toContain('pao_da_feira');
  });

  it('loja da instituição: compra tira Semente; venda devolve 40%', () => {
    const { s, rec } = onMargin('esquerda');
    const row = shopRows('loja_brigada_popular', { side: 'esquerda', rank: rec.rank }).find((r) => r.liberado)!;
    rec.semente = row.preco + 5;
    s.receive(GAME_MSG.lojaComprar, { loja: 'loja_brigada_popular', item: row.item });
    let out = s.take();
    const r = lastOf<S2C_EconomiaResultado>(out, GAME_MSG.economiaResultado)!;
    expect(r.ok, r.erro).toBe(true);
    expect(rec.semente).toBe(5);
    expect(all(out, GAME_MSG.perfil).length).toBeGreaterThan(0);
    // sem dinheiro: erro
    s.receive(GAME_MSG.lojaComprar, { loja: 'loja_brigada_popular', item: row.item });
    expect(lastOf<S2C_EconomiaResultado>(s.take(), GAME_MSG.economiaResultado)?.ok).toBe(false);
    // vender o que comprou (se foi para o inventário)
    if (rec.inventory.includes(row.item)) {
      s.receive(GAME_MSG.lojaVender, { loja: 'loja_brigada_popular', item: row.item });
      out = s.take();
      expect(lastOf<S2C_EconomiaResultado>(out, GAME_MSG.economiaResultado)?.ok).toBe(true);
      expect(rec.semente).toBeGreaterThan(5);
    }
  });

  it('feira: anúncios dos vizinhos, compra da tabela entra na fila e se retira depois', () => {
    const clock = { t: 1000 };
    const { s, rec } = onMargin('esquerda', clock);
    s.seedMarket();
    s.receive(GAME_MSG.mercadoListar, { mercado: 'feira' });
    const mv = lastOf<S2C_MercadoInfo>(s.take(), GAME_MSG.mercadoInfo)!;
    expect(mv.anuncios.length).toBeGreaterThanOrEqual(3);
    expect(mv.anuncios.every((a) => a.vendedor === NPC_SELLERS.feira.id)).toBe(true);
    const tab = mv.anuncios.find((a) => a.tabelado)!;
    rec.semente = 100;
    s.receive(GAME_MSG.feiraComprar, { anuncio: tab.id });
    const r = lastOf<S2C_EconomiaResultado>(s.take(), GAME_MSG.economiaResultado)!;
    expect(r.ok, r.erro).toBe(true);
    expect(r.entrega?.posicao).toBe(1);
    // ainda não ficou pronto
    s.receive(GAME_MSG.feiraRetirar, {});
    expect(lastOf<S2C_EconomiaResultado>(s.take(), GAME_MSG.economiaResultado)?.ok).toBe(false);
    clock.t = r.entrega!.prontoEm + 1;
    s.receive(GAME_MSG.feiraRetirar, {});
    expect(lastOf<S2C_EconomiaResultado>(s.take(), GAME_MSG.economiaResultado)?.ok).toBe(true);
    // anunciar algo próprio e cancelar
    rec.inventory.push('movel:banco_de_madeira');
    s.receive(GAME_MSG.feiraAnunciar, { bem: { tipo: 'movel', id: 'banco_de_madeira' }, preco: 10 });
    const mv2 = lastOf<S2C_MercadoInfo>(s.take(), GAME_MSG.mercadoInfo)!;
    const meu = mv2.anuncios.find((a) => a.meu)!;
    expect(meu.preco).toBe(10);
    expect(rec.inventory).not.toContain('movel:banco_de_madeira');
    s.receive(GAME_MSG.mercadoCancelar, { anuncio: meu.id });
    s.take();
    expect(rec.inventory).toContain('movel:banco_de_madeira');
  });

  it('app: compra em Crédito; a feira recusa quem é da Direita', () => {
    const { s, rec } = onMargin('direita');
    s.seedMarket();
    s.receive(GAME_MSG.mercadoListar, { mercado: 'app' });
    const mv = lastOf<S2C_MercadoInfo>(s.take(), GAME_MSG.mercadoInfo)!;
    expect(mv.taxaPct).toBeGreaterThan(0);
    const a = mv.anuncios[0]!;
    rec.credito = 500;
    s.receive(GAME_MSG.appComprar, { anuncio: a.id });
    expect(lastOf<S2C_EconomiaResultado>(s.take(), GAME_MSG.economiaResultado)?.ok).toBe(true);
    expect(rec.credito).toBe(500 - a.preco!);
    rec.inventory.push('pao_da_feira');
    s.receive(GAME_MSG.feiraAnunciar, { bem: { tipo: 'item', id: 'pao_da_feira' } });
    expect(lastOf<S2C_EconomiaResultado>(s.take(), GAME_MSG.economiaResultado)?.ok).toBe(false);
  });

  it('câmbio: cotação e troca com spread e limite do ciclo', () => {
    const { s, rec } = onMargin('esquerda');
    rec.semente = 100;
    s.receive(GAME_MSG.cambioCotar, { de: 'semente', quantidade: 50 });
    const info = lastOf<S2C_CambioInfo>(s.take(), GAME_MSG.cambioInfo)!;
    expect(info.cotacao?.recebe).toBeGreaterThan(0);
    expect(info.cotacao!.recebe).toBeLessThan(50 * info.taxa.cotacao);
    const cr0 = rec.credito;
    s.receive(GAME_MSG.cambioTrocar, { de: 'semente', quantidade: 50 });
    const out = s.take();
    expect(lastOf<S2C_EconomiaResultado>(out, GAME_MSG.economiaResultado)?.ok).toBe(true);
    expect(rec.semente).toBe(50);
    expect(rec.credito).toBe(cr0 + info.cotacao!.recebe);
    expect(lastOf<S2C_CambioInfo>(out, GAME_MSG.cambioInfo)?.usadoCiclo).toBe(50);
  });

  it('casa da Esquerda: lista de espera anda (atalho), móveis colocados, girados e tirados', () => {
    const { s, rec } = onMargin('esquerda');
    s.receive(GAME_MSG.casaAvancarFila, {});
    let out = s.take();
    expect(lastOf<S2C_EconomiaResultado>(out, GAME_MSG.economiaResultado)?.ok).toBe(true);
    const casa = lastOf<S2C_CasaInfo>(out, GAME_MSG.casaInfo)!;
    expect(casa.espera ?? null).toBeNull();
    expect(casa.tipo).toBe(D.housing.listaDeEspera.moradiaFinal);
    rec.semente = 500;
    s.receive(GAME_MSG.casaComprarMovel, { movel: 'banco_de_madeira' });
    s.take();
    expect(rec.inventory).toContain('movel:banco_de_madeira');
    s.receive(GAME_MSG.casaColocar, { movel: 'banco_de_madeira', x: 1, y: 2, rot: 0 });
    out = s.take();
    let c = lastOf<S2C_CasaInfo>(out, GAME_MSG.casaInfo)!;
    expect(c.moveis).toHaveLength(1);
    const uid = c.moveis[0]!.uid;
    s.receive(GAME_MSG.casaGirar, { uid });
    c = lastOf<S2C_CasaInfo>(s.take(), GAME_MSG.casaInfo)!;
    expect(c.moveis[0]!.rot).toBe(1);
    s.receive(GAME_MSG.casaMover, { uid, x: 2, y: 3 });
    c = lastOf<S2C_CasaInfo>(s.take(), GAME_MSG.casaInfo)!;
    expect([c.moveis[0]!.x, c.moveis[0]!.y]).toEqual([2, 3]);
    s.receive(GAME_MSG.casaTirar, { uid });
    c = lastOf<S2C_CasaInfo>(s.take(), GAME_MSG.casaInfo)!;
    expect(c.moveis).toHaveLength(0);
    expect(c.guardados).toContain('banco_de_madeira');
    s.receive(GAME_MSG.casaVisitas, { permissao: 'todos' });
    expect(lastOf<S2C_CasaInfo>(s.take(), GAME_MSG.casaInfo)?.visitas).toBe('todos');
  });

  it('cápsula da Direita: o ciclo da cidade cobra o aluguel e avisa; sem saldo vira dívida', () => {
    const clock = { t: 0 };
    const { s, rec, city } = onMargin('direita', clock);
    expect(rec.home?.tipo).toBe('capsula');
    rec.credito = 1000;
    clock.t = 10 * 60_000 + 1;
    for (let i = 0; i < 20; i++) s.tick();
    let out = s.take();
    expect(rec.credito).toBeLessThan(1000);
    expect(all<{ texto: string }>(out, GAME_MSG.aviso).some((a) => /Aluguel/.test(a.texto))).toBe(true);
    expect((city() as CidadeState).ciclo).toBe(1);
    rec.credito = 0;
    clock.t = 2 * 10 * 60_000 + 2;
    for (let i = 0; i < 20; i++) s.tick();
    out = s.take();
    expect(rec.economia?.divida ?? 0).toBeGreaterThan(0);
    expect(rec.home?.atraso).toBe(1);
    // paga a dívida
    rec.credito = 1000;
    s.receive(GAME_MSG.dividaPagar, {});
    expect(lastOf<S2C_EconomiaResultado>(s.take(), GAME_MSG.economiaResultado)?.ok).toBe(true);
    expect(rec.economia?.divida ?? 0).toBe(0);
  });
});
