/**
 * Fase 5 no cliente: estado com as mensagens novas, modelo das telas (cartas da Doutrina, pertos),
 * mapa do andar montado pela semente igual ao do servidor, falas do barco e o servidor local
 * rodando as regras de shared/game (itens, filtro, Doutrina, plantão, masmorra e facção).
 */
import { describe, expect, it } from 'vitest';
import { getData } from '@pqp/shared';
import { FLAG_BRUNO, raiseToLevel, validarDoutrina, type CidadeState } from '@pqp/shared/game/index';
import { getMap } from '@pqp/shared/map';
import {
  GAME_MSG,
  MSG,
  type S2C_AvisoMapa,
  type S2C_DoutrinaInfo,
  type S2C_FaccaoInfo,
  type S2C_ItensInfo,
  type S2C_MasmorraInfo,
  type S2C_PlantaoInfo,
  type S2C_Welcome,
} from '@pqp/shared/net';
import type { DoctrineCard } from '@pqp/shared/sim';
import { GameState } from '../src/game/gameState';
import { dungeonMapFor, isDungeonMapId } from '../src/game/dungeonMap';
import { LocalServer, type RecordStore } from '../src/net/localServer';
import { boatLines } from '../src/ui/dom/boatScene';
import { bumpCond, cardText, condOf, cycleAction, cycleButton, cycleCond, fase5Spots, moveCard, newCard } from '../src/ui/fase5Model';

const D = getData();
const okLook = () => ({ ...D.appearance.padrao, details: [] as string[] });
const memStore = (): RecordStore => {
  const data = new Map<string, string>();
  return { load: (id) => (data.has(id) ? JSON.parse(data.get(id)!) : null), save: (id, rec) => void data.set(id, JSON.stringify(rec)) };
};
const all = <T>(out: [string, unknown][], type: string): T[] => out.filter(([t]) => t === type).map(([, m]) => m as T);
const lastOf = <T>(out: [string, unknown][], type: string): T | undefined => all<T>(out, type).pop();

function onMargin(side: 'esquerda' | 'direita', clock = { t: 0 }) {
  let city: unknown = null;
  let fac: unknown = null;
  const s = new LocalServer({
    store: memStore(),
    noEnemies: true,
    // atalho de teste: a travessia direta do Delta (o barco tem o teste dele em barco.test.ts)
    atalhoTravessia: true,
    encounters: false,
    clock: () => clock.t,
    cityStore: { load: () => city, save: (c: CidadeState) => void (city = JSON.parse(JSON.stringify(c))) },
    factionStore: { load: () => fac, save: (e) => void (fac = JSON.parse(JSON.stringify(e))) },
    factionTickMin: 1,
  });
  s.receive(MSG.hello, { token: `tok_f5_${side}`, name: 'Zé' });
  s.receive(GAME_MSG.criarPersonagem, { name: 'Zé da Silva', appearance: okLook() });
  const rec = s.rec!;
  rec.story_flags.push(FLAG_BRUNO);
  raiseToLevel(rec, 12);
  const inst = D.institutions.instituicoes.find((i) => i.margem === side)!;
  const guia = D.guides.guias.find((g) => g.margem === side)!;
  s.receive(GAME_MSG.travessia, { side, institution: inst.id, guide: guia.id });
  s.take();
  return { s, rec, clock, fac: () => fac };
}

type Priv = { changeMap(to: string, spawnId?: string): void };

describe('GameState (Fase 5)', () => {
  it('guarda itens, masmorra, Doutrina, plantão e facção; avisos do mapa em fila sem repetir', () => {
    const g = new GameState();
    g.onMessage(GAME_MSG.itensInfo, { equipados: {}, mochila: [], total: {}, filtro: 'comum', vendaAutomatica: false }, 0);
    expect(g.itens?.filtro).toBe('comum');
    g.onMessage(GAME_MSG.masmorraInfo, { ativa: true, andar: 2, seed: 9 }, 0);
    expect(g.inDungeon).toBe(true);
    g.onMessage(GAME_MSG.doutrinaInfo, { cards: [], max: 5 }, 0);
    expect(g.doctrine?.max).toBe(5);
    g.onMessage(GAME_MSG.plantaoInfo, { qg: 'x', disponiveis: [], levados: [], grupoMax: 4 }, 0);
    expect(g.duty?.grupoMax).toBe(4);
    const a: S2C_AvisoMapa = { id: 'ev1', tipo: 'acao_ia', texto: 'Lazzaro aumentou o preço.' };
    g.onMessage(GAME_MSG.avisoMapa, a, 1);
    g.onMessage(GAME_MSG.avisoMapa, a, 2);
    expect(g.mapAlerts).toHaveLength(1);
    expect(g.takeMapAlert()?.texto).toBe(a.texto);
    expect(g.takeMapAlert()).toBeUndefined();
  });
});

describe('modelo das telas da Fase 5', () => {
  it('cartas do editor são sempre válidas para validarDoutrina', () => {
    let c: DoctrineCard = newCard();
    const cards: DoctrineCard[] = [];
    for (let i = 0; i < 9; i++) {
      c = cycleCond(c);
      cards.push(c);
    }
    for (let i = 0; i < 10; i++) {
      c = cycleAction(c);
      cards.push(cycleButton(c));
    }
    for (let i = 0; i < cards.length; i += 5) expect(validarDoutrina(cards.slice(i, i + 5)).ok).toBe(true);
  });

  it('números da carta ficam nas faixas; frase legível; mover troca a ordem', () => {
    let c: DoctrineCard = { se: condOf('minha_vida_abaixo'), faca: { t: 'fugir' } };
    for (let i = 0; i < 30; i++) c = bumpCond(c, 'pct', 1);
    expect((c.se as { pct: number }).pct).toBe(95);
    expect(cardText(c)).toBe('Se minha vida abaixo de 95%: recuar');
    const a = newCard();
    const b: DoctrineCard = { se: { t: 'especial_pronto' }, faca: { t: 'usar_especial' } };
    expect(moveCard([a, b], 1, -1)).toEqual([b, a]);
    expect(moveCard([a, b], 0, -1)).toEqual([a, b]);
  });

  it('pertos: entrada das Galerias na Usina e quadro do plantão no QG da margem', () => {
    const usina = getMap('usina_da_ponte');
    const mk = usina.markers.find((m) => m.kind === 'masmorra')!;
    expect(fase5Spots(usina, mk.x, mk.y, 'esquerda').some((s) => s.kind === 'masmorra')).toBe(true);
    const esq = getMap('margem_esquerda');
    const qg = esq.markers.find((m) => m.kind === 'lugar' && typeof (m.params as Record<string, unknown> | undefined)?.['qg'] === 'string');
    if (qg) expect(fase5Spots(esq, qg.x, qg.y, 'esquerda').some((s) => s.kind === 'plantao')).toBe(true);
  });

  it('barco: falas do guia dos dados e a chegada', () => {
    const g = D.guides.guias.find((x) => x.margem === 'direita')!;
    const l = boatLines(g.id, 'direita');
    expect(l.length).toBeGreaterThanOrEqual(2);
    expect(l[0]!.nome).toBe(g.name);
  });
});

describe('servidor local da Fase 5', () => {
  it('itens: vestir muda o visual e os atributos; filtro de raridade vale na entidade', () => {
    const { s, rec } = onMargin('esquerda');
    const it = D.items.itens.find((i) => !i.classLock && (!i.margem || i.margem === 'esquerda') && (i.nivelMin ?? 1) <= rec.level)!;
    rec.inventory.push(it.id);
    s.receive(GAME_MSG.itensPedir, {});
    expect(lastOf<S2C_ItensInfo>(s.take(), GAME_MSG.itensInfo)?.mochila.some((x) => x.id === it.id)).toBe(true);
    s.receive(GAME_MSG.equipar, { itemId: it.id });
    const out = s.take();
    const v = lastOf<S2C_ItensInfo>(out, GAME_MSG.itensInfo)!;
    expect(Object.values(v.equipados).some((x) => x?.id === it.id)).toBe(true);
    expect(s.player!.look?.items?.length ?? 0).toBeGreaterThan(0);
    s.receive(GAME_MSG.filtroRaridade, { raridade: 'raro' });
    s.take();
    expect(s.player!.lootFilter).toBe('raro');
    s.receive(GAME_MSG.desequipar, { slot: it.slot });
    expect(Object.keys(lastOf<S2C_ItensInfo>(s.take(), GAME_MSG.itensInfo)!.equipados)).toHaveLength(0);
  });

  it('Doutrina: grava até 5 cartas e passa para a entidade; 6 é recusado', () => {
    const { s } = onMargin('direita');
    const cards: DoctrineCard[] = [newCard(), { se: { t: 'minha_vida_abaixo', pct: 30 }, faca: { t: 'fugir' } }];
    s.receive(GAME_MSG.doutrinaDefinir, { cards });
    expect(lastOf<S2C_DoutrinaInfo>(s.take(), GAME_MSG.doutrinaInfo)?.cards).toHaveLength(2);
    expect(s.player!.doctrine).toHaveLength(2);
    s.receive(GAME_MSG.doutrinaDefinir, { cards: Array.from({ length: 6 }, newCard) });
    const out = s.take();
    expect(all<{ tipo: string }>(out, GAME_MSG.aviso).some((a) => a.tipo === 'erro')).toBe(true);
    expect(lastOf<S2C_DoutrinaInfo>(out, GAME_MSG.doutrinaInfo)?.cards).toHaveLength(2);
  });

  it('plantão: o quadro lista os vizinhos; levar nasce aliado no grupo; dispensar tira', () => {
    const { s } = onMargin('esquerda');
    s.receive(GAME_MSG.plantaoPedir, {});
    const q = lastOf<S2C_PlantaoInfo>(s.take(), GAME_MSG.plantaoInfo)!;
    expect(q.disponiveis.length).toBe(3);
    const id = q.disponiveis[0]!.id;
    s.receive(GAME_MSG.plantaoLevar, { plantonistaId: id });
    const q2 = lastOf<S2C_PlantaoInfo>(s.take(), GAME_MSG.plantaoInfo)!;
    expect(q2.levados.map((x) => x.id)).toEqual([id]);
    const ally = [...s.w.entities.values()].find((e) => e.onDuty && e.playerId === id)!;
    expect(ally).toBeDefined();
    expect(ally.partyId).toBe(s.player!.partyId);
    for (let i = 0; i < 5; i++) s.tick();
    s.receive(GAME_MSG.plantaoDispensar, { plantonistaId: id });
    s.take();
    expect([...s.w.entities.values()].some((e) => e.onDuty)).toBe(false);
  });

  it('masmorra: entra pela Usina, o cliente monta o mesmo andar, desce a escada e sai com o guardado', () => {
    const { s, rec } = onMargin('esquerda');
    (s as unknown as Priv).changeMap('usina_da_ponte');
    const mk = s.w.map.markers.find((m) => m.kind === 'masmorra')!;
    s.player!.x = mk.x;
    s.player!.y = mk.y;
    s.take();
    s.receive(GAME_MSG.masmorraEntrar, {});
    let out = s.take();
    const iInfo = out.findIndex(([t]) => t === GAME_MSG.masmorraInfo);
    const iWel = out.findIndex(([t]) => t === MSG.welcome);
    expect(iInfo).toBeGreaterThanOrEqual(0);
    expect(iInfo).toBeLessThan(iWel);
    const info = out[iInfo]![1] as S2C_MasmorraInfo;
    const wel = out[iWel]![1] as S2C_Welcome;
    expect(info.ativa).toBe(true);
    expect(info.andar).toBe(1);
    expect(wel.mapId).toBe(info.mapId);
    expect(isDungeonMapId(wel.mapId)).toBe(true);
    // o cliente monta o andar pela semente: o mesmo mapa
    const cm = dungeonMapFor(wel.mapId, info)!;
    expect(cm.width).toBe(s.w.map.width);
    expect(Array.from(cm.tiles)).toEqual(Array.from(s.w.map.tiles));
    // escada aberta: pisar nela desce
    s.floorSt!.escadaAberta = true;
    const st = s.floorSt!.floor.layout.stairs;
    s.player!.x = st.x;
    s.player!.y = st.y;
    s.tick();
    out = s.take();
    expect(lastOf<S2C_MasmorraInfo>(out, GAME_MSG.masmorraInfo)?.andar).toBe(2);
    expect(s.run?.andarMaisFundo).toBe(1);
    // sai pelo botão: recebe o guardado e volta para a Usina
    s.receive(GAME_MSG.masmorraSair, {});
    out = s.take();
    const fim = lastOf<S2C_MasmorraInfo>(out, GAME_MSG.masmorraInfo)!;
    expect(fim.ativa).toBe(false);
    expect(fim.fim).toBe('saiu');
    expect(lastOf<S2C_Welcome>(out, MSG.welcome)?.mapId).toBe('usina_da_ponte');
    expect(rec.counters['masmorra:galerias_da_usina']).toBe(1);
  });

  it('facção: painel com regiões e pontos; o ciclo roda pelo relógio e manda avisos do mapa', () => {
    const clock = { t: 0 };
    const { s, fac } = onMargin('direita', clock);
    s.receive(GAME_MSG.faccaoPedir, {});
    const f = lastOf<S2C_FaccaoInfo>(s.take(), GAME_MSG.faccaoInfo)!;
    expect(f.regioes.length).toBeGreaterThan(0);
    expect(f.lideres.map((l) => l.lado)).toEqual(['esquerda', 'direita']);
    const ciclo = s.faccao.ciclo;
    clock.t += 3 * 60_000;
    for (let i = 0; i < 20; i++) s.tick();
    const out = s.take();
    expect(s.faccao.ciclo).toBeGreaterThan(ciclo);
    expect(all<S2C_AvisoMapa>(out, GAME_MSG.avisoMapa).length).toBeGreaterThan(0);
    expect(fac()).not.toBeNull();
    expect(s.w.regionState).toBeDefined();
  });
});
