/**
 * Regras da Fase 4 (shared/game): carteira e score, loja de NPC (compra e venda), feira e app
 * (taxa, fila e preço dinâmico), câmbio na ponte, moradia (lista de espera, mutirão, aluguel e
 * despejo), móveis em grade, visitas e o ciclo da cidade.
 */
import { describe, expect, it } from 'vitest';
import { getData } from '../src/data';
import {
  alugarCapsula,
  anunciarApp,
  anunciarFeira,
  applyRewards,
  applyTravessia,
  avancarListaDeEspera,
  cabe,
  cancelarAnuncio,
  carteiraView,
  casaView,
  colocarMovel,
  comprarApp,
  comprarFeira,
  comprarMovel,
  comprarNaLoja,
  convidar,
  cotacao,
  cotarTroca,
  createCharacter,
  creditarGanho,
  defaultAppearance,
  definirVisitas,
  deltaChainMissions,
  economiaOf,
  expirarAnuncios,
  faixaScore,
  FLAG_BRUNO,
  girarMovel,
  LIMITE_ANUNCIOS_FEIRA,
  mercadoView,
  migratePlayerRecord,
  moverMovel,
  multDinamico,
  newPlayerRecord,
  novaCidade,
  novoCambio,
  novoMercado,
  pagar,
  pagarDivida,
  precoLoja,
  precoSugeridoApp,
  receberPendencias,
  refreshMissions,
  retirarEntregas,
  scoreEvento,
  setFlag,
  sincronizarComCidade,
  taxaApp,
  tickCidade,
  tirarMovel,
  trocarMoeda,
  venderNaLoja,
  virarCicloCarteira,
  virarCiclos,
  visitarCasa,
  type PlayerRecord,
} from '../src/game/index';
import { GAME_MSG } from '../src/net/game';

type Side = 'esquerda' | 'direita';
const INST: Record<Side, string> = { esquerda: 'brigada_popular', direita: 'torcida_furia_neon' };
const GUIA: Record<Side, string> = { esquerda: 'curupira', direita: 'byte' };

function crossed(side: Side, id = `p_${side}`): PlayerRecord {
  const rec = newPlayerRecord(id, 'Visitante');
  expect(createCharacter(rec, `Zé ${id.replace(/[^a-zA-Z]/g, '')}`, defaultAppearance()).ok).toBe(true);
  rec.missions = { ativas: [], concluidas: deltaChainMissions().filter((m) => m !== 'travessia_08'), progresso: {} };
  setFlag(rec, FLAG_BRUNO);
  refreshMissions(rec);
  expect(applyTravessia(rec, { side, institution: INST[side], guide: GUIA[side] }).ok).toBe(true);
  return rec;
}

const T0 = 1_000_000;

describe('carteira e score', () => {
  it('saldo inicial da margem, pagar sem saldo falha sem mexer', () => {
    const e = crossed('esquerda');
    const d = crossed('direita');
    expect(e.semente).toBe(120);
    expect(d.credito).toBe(120);
    expect(d.score).toBe(500);
    const p = pagar(e, 'semente', 500);
    expect(p.ok).toBe(false);
    expect(e.semente).toBe(120);
    expect(pagar(e, 'semente', 20).ok).toBe(true);
    expect(e.semente).toBe(100);
  });

  it('ganho de missão e de saque entra na moeda da margem (cotação base); no Delta, como veio', () => {
    const d = crossed('direita');
    const c0 = d.credito;
    const r = applyRewards(d, [{ kind: 'recurso', recurso: 'semente', quantidade: 10 }]);
    expect(d.credito).toBe(c0 + 20);
    expect(d.semente).toBe(0);
    expect(r.recursos.credito).toBe(20);
    const e = crossed('esquerda');
    expect(creditarGanho(e, 'credito', 10)).toEqual({ moeda: 'semente', quantidade: 5 });
    const delta = newPlayerRecord('dd', 'Delta');
    creditarGanho(delta, 'credito', 7);
    expect(delta.credito).toBe(7);
  });

  it('score: sobe pago, cai atrasado, limite por ciclo, teto 0..1000, só na Direita', () => {
    const d = crossed('direita');
    expect(scoreEvento(d, 'aluguel_em_dia')).toBe(10);
    expect(scoreEvento(d, 'aluguel_em_dia')).toBe(0);
    virarCicloCarteira(d);
    expect(scoreEvento(d, 'aluguel_em_dia')).toBe(10);
    expect(d.score).toBe(520);
    expect(scoreEvento(d, 'atraso_aluguel')).toBe(-40);
    expect(faixaScore(d).id).toBe('regular');
    d.score = 990;
    scoreEvento(d, 'quitar_divida');
    expect(d.score).toBe(1000);
    expect(faixaScore(d).id).toBe('premium');
    d.score = 10;
    scoreEvento(d, 'despejo');
    expect(d.score).toBe(0);
    const e = crossed('esquerda');
    expect(scoreEvento(e, 'despejo')).toBe(0);
    expect(carteiraView(e).score).toBeNull();
  });

  it('dívida: pagar quita e dá quitar_divida', () => {
    const d = crossed('direita');
    economiaOf(d).divida = 50;
    d.credito = 30;
    const p1 = pagarDivida(d);
    expect(p1.ok && p1.resta).toBe(20);
    d.credito = 100;
    const s0 = d.score;
    expect(pagarDivida(d).resta).toBe(0);
    expect(d.credito).toBe(80);
    expect(d.score).toBe(s0 + 40);
  });
});

describe('loja de NPC: compra e venda', () => {
  it('Esquerda tabelada: compra tira Semente e entrega; raro trancado pela patente; vende a 40%', () => {
    const e = crossed('esquerda');
    const c = comprarNaLoja(e, 'loja_brigada_popular', 'cabeca_combatente_esquerda_comum');
    expect(c.ok).toBe(true);
    expect(e.semente).toBe(80);
    expect(e.inventory).toContain('cabeca_combatente_esquerda_comum');
    const raro = comprarNaLoja(e, 'loja_brigada_popular', 'cabeca_combatente_esquerda_raro');
    expect(raro.ok).toBe(false);
    const v = venderNaLoja(e, 'loja_brigada_popular', 'cabeca_combatente_esquerda_comum');
    expect(v.ok && v.valor).toBe(16);
    expect(e.semente).toBe(96);
    expect(e.inventory).not.toContain('cabeca_combatente_esquerda_comum');
    expect(venderNaLoja(e, 'loja_brigada_popular', 'cabeca_combatente_esquerda_comum').ok).toBe(false);
  });

  it('poção vai para o botão de item; sem saldo não compra', () => {
    const e = crossed('esquerda');
    const n = e.item_count;
    expect(comprarNaLoja(e, 'loja_brigada_popular', 'pocao').ok).toBe(true);
    expect(e.item_count).toBe(n + 1);
    e.semente = 0;
    expect(comprarNaLoja(e, 'loja_brigada_popular', 'pocao').ok).toBe(false);
    expect(e.item_count).toBe(n + 1);
  });

  it('Direita dinâmica: taxa da loja, procura sobe o preço, score muda a taxa', () => {
    const d = crossed('direita');
    const shop = getData().shopsById.get('loja_torcida_furia_neon')!;
    const it0 = shop.itens.find((x) => x.tipo === 'consumivel' && x.item !== 'pocao') ?? shop.itens[0]!;
    const m = novoMercado();
    const p0 = precoLoja(d, shop.id, it0.item, { mercado: m })!;
    expect(p0.moeda).toBe('credito');
    expect(p0.taxaPct).toBe(shop.taxaPct);
    d.credito = 10_000;
    for (let i = 0; i < 5; i++) expect(comprarNaLoja(d, shop.id, it0.item, { mercado: m }).ok).toBe(true);
    const p1 = precoLoja(d, shop.id, it0.item, { mercado: m })!;
    expect(p1.valor).toBeGreaterThanOrEqual(p0.valor);
    expect(multDinamico(m.npc, it0.item)).toBeGreaterThan(multDinamico({}, it0.item));
    d.score = 900;
    const premium = precoLoja(d, shop.id, it0.item, { mercado: m })!;
    d.score = 100;
    const negativado = precoLoja(d, shop.id, it0.item, { mercado: m })!;
    expect(premium.valor).toBeLessThan(negativado.valor);
  });
});

describe('feira de troca (Esquerda)', () => {
  it('item da tabela pelo preço da tabela, sem taxa, com fila e retirada depois', () => {
    const m = novoMercado();
    const a = crossed('esquerda', 'a');
    const b = crossed('esquerda', 'b');
    a.resources.comida = 10;
    const an = anunciarFeira(m, a, { bem: { tipo: 'recurso', id: 'comida', quantidade: 5 }, preco: 999 }, T0);
    expect(an.ok).toBe(true);
    expect(an.anuncio!.preco).toBe(20);
    expect(a.resources.comida).toBe(5);
    const c = comprarFeira(m, b, an.anuncio!.id, T0);
    expect(c.ok).toBe(true);
    expect(b.semente).toBe(100);
    expect(c.entrega!.posicao).toBe(1);
    expect(c.entrega!.prontoEm).toBe(T0 + getData().economy.feira.fila.esperaPorPessoaS * 1000);
    expect(retirarEntregas(m, b, T0 + 1000).bens).toHaveLength(0);
    expect(retirarEntregas(m, b, T0 + 60_000).bens).toHaveLength(1);
    expect(b.resources.comida).toBe(5);
    const p = receberPendencias(m, a);
    expect(p?.semente).toBe(20);
    expect(a.semente).toBe(140);
    expect(receberPendencias(m, a)).toBeNull();
  });

  it('a segunda compra espera mais na fila', () => {
    const m = novoMercado();
    const a = crossed('esquerda', 'a');
    const b = crossed('esquerda', 'b');
    const c = crossed('esquerda', 'c');
    a.resources.pecas = 4;
    const x1 = anunciarFeira(m, a, { bem: { tipo: 'recurso', id: 'pecas', quantidade: 2 } }, T0).anuncio!;
    const x2 = anunciarFeira(m, a, { bem: { tipo: 'recurso', id: 'pecas', quantidade: 2 } }, T0).anuncio!;
    const e1 = comprarFeira(m, b, x1.id, T0).entrega!;
    const e2 = comprarFeira(m, c, x2.id, T0).entrega!;
    expect(e2.posicao).toBe(2);
    expect(e2.prontoEm).toBeGreaterThan(e1.prontoEm);
  });

  it('preço livre com teto, troca direta por item, limite de anúncios e cancelar', () => {
    const m = novoMercado();
    const a = crossed('esquerda', 'a');
    const b = crossed('esquerda', 'b');
    a.inventory.push('cabeca_combatente_esquerda_comum', 'peito_combatente_esquerda_comum');
    b.inventory.push('arma_combatente_esquerda_comum');
    expect(anunciarFeira(m, a, { bem: { tipo: 'item', id: 'cabeca_combatente_esquerda_comum' }, preco: 1_000_000 }, T0).ok).toBe(false);
    const t = anunciarFeira(m, a, { bem: { tipo: 'item', id: 'cabeca_combatente_esquerda_comum' }, trocaPor: [{ tipo: 'item', id: 'arma_combatente_esquerda_comum' }] }, T0);
    expect(t.ok).toBe(true);
    const sem = crossed('esquerda', 'c');
    expect(comprarFeira(m, sem, t.anuncio!.id, T0).ok).toBe(false);
    expect(comprarFeira(m, b, t.anuncio!.id, T0).ok).toBe(true);
    expect(b.inventory).toContain('cabeca_combatente_esquerda_comum');
    expect(b.inventory).not.toContain('arma_combatente_esquerda_comum');
    receberPendencias(m, a);
    expect(a.inventory).toContain('arma_combatente_esquerda_comum');
    // limite
    a.resources.comida = 100;
    for (let i = 0; i < LIMITE_ANUNCIOS_FEIRA; i++) expect(anunciarFeira(m, a, { bem: { tipo: 'recurso', id: 'comida', quantidade: 1 } }, T0).ok).toBe(true);
    expect(anunciarFeira(m, a, { bem: { tipo: 'recurso', id: 'comida', quantidade: 1 } }, T0).ok).toBe(false);
    const meu = mercadoView(m, 'feira', a, T0).anuncios.find((x) => x.meu)!;
    expect(cancelarAnuncio(m, a, meu.id).ok).toBe(true);
    expect(a.resources.comida).toBe(100 - LIMITE_ANUNCIOS_FEIRA + 1);
    // Direita não anuncia na feira
    const d = crossed('direita');
    d.resources.comida = 1;
    expect(anunciarFeira(m, d, { bem: { tipo: 'recurso', id: 'comida', quantidade: 1 } }, T0).ok).toBe(false);
  });

  it('anúncio vencido devolve o bem pelas pendências', () => {
    const m = novoMercado();
    const a = crossed('esquerda', 'a');
    a.resources.comida = 1;
    const an = anunciarFeira(m, a, { bem: { tipo: 'recurso', id: 'comida', quantidade: 1 } }, T0).anuncio!;
    expect(expirarAnuncios(m, an.expiraEm)).toBe(1);
    receberPendencias(m, a);
    expect(a.resources.comida).toBe(1);
  });
});

describe('app do Consórcio (Direita)', () => {
  it('taxa do Consórcio na venda, score do vendedor, venda_no_app', () => {
    const m = novoMercado();
    const c = crossed('direita', 'c');
    const d = crossed('direita', 'd');
    c.inventory.push('peito_combatente_direita_comum');
    const an = anunciarApp(m, c, { bem: { tipo: 'item', id: 'peito_combatente_direita_comum' }, preco: 100 }, T0);
    expect(an.ok).toBe(true);
    expect(an.anuncio!.taxaPct).toBe(12);
    const b = comprarApp(m, d, an.anuncio!.id, T0);
    expect(b.ok).toBe(true);
    expect(b.taxa).toBe(12 + 1);
    expect(d.credito).toBe(20);
    expect(d.inventory).toContain('peito_combatente_direita_comum');
    const s0 = c.score;
    receberPendencias(m, c);
    expect(c.credito).toBe(120 + 87);
    expect(c.score).toBe(s0 + 2);
  });

  it('score premium paga menos taxa; negativado paga mais', () => {
    const c = crossed('direita', 'c');
    c.score = 900;
    const m = novoMercado();
    c.inventory.push('peito_combatente_direita_comum');
    expect(anunciarApp(m, c, { bem: { tipo: 'item', id: 'peito_combatente_direita_comum' }, preco: 100 }, T0).anuncio!.taxaPct).toBe(8);
    expect(taxaApp(100, 17)).toBe(18);
  });

  it('preço sugerido segue o preço dinâmico (procura sobe)', () => {
    const m = novoMercado();
    const b = { tipo: 'recurso' as const, id: 'chopindita' as const, quantidade: 1 };
    const p0 = precoSugeridoApp(m, b)!;
    m.npc['chopindita'] = { procura: 10, oferta: 0 };
    expect(precoSugeridoApp(m, b)!).toBeGreaterThan(p0);
    m.npc['chopindita'] = { procura: 0, oferta: 10 };
    expect(precoSugeridoApp(m, b)!).toBeLessThan(p0);
  });

  it('Esquerda não anuncia no app', () => {
    const e = crossed('esquerda');
    e.resources.comida = 1;
    expect(anunciarApp(novoMercado(), e, { bem: { tipo: 'recurso', id: 'comida', quantidade: 1 }, preco: 5 }, T0).ok).toBe(false);
  });
});

describe('câmbio na ponte', () => {
  it('cotação base com o mapa neutro e spread nos dois sentidos', () => {
    const ex = novoCambio();
    expect(cotacao(ex)).toBeCloseTo(2);
    expect(cotarTroca(ex, 'semente', 100).recebe).toBe(190);
    expect(cotarTroca(ex, 'credito', 211).recebe).toBe(100);
  });

  it('volume mexe na cotação de forma determinística; limite por ciclo', () => {
    const run = () => {
      const ex = novoCambio();
      const e = crossed('esquerda');
      e.semente = 5000;
      const t1 = trocarMoeda(ex, e, 'semente', 1000);
      const t2 = trocarMoeda(ex, e, 'semente', 500);
      return { t1, t2, ex, e };
    };
    const a = run();
    const b = run();
    expect(a.t1.ok && a.t2.ok).toBe(true);
    expect(a.t1.troca!.recebe).toBe(1900);
    expect(a.t2.troca!.cotacao).toBeLessThan(a.t1.troca!.cotacao);
    expect(a.t2.troca!.recebe).toBe(b.t2.troca!.recebe);
    expect(a.e.credito).toBe(1900 + a.t2.troca!.recebe);
    // limite de 2000 Sementes por ciclo
    expect(trocarMoeda(a.ex, a.e, 'semente', 600).ok).toBe(false);
    virarCicloCarteira(a.e);
    expect(trocarMoeda(a.ex, a.e, 'semente', 600).ok).toBe(true);
    // sem saldo
    expect(trocarMoeda(a.ex, a.e, 'semente', 999_999).ok).toBe(false);
  });

  it('mapa: influência da Esquerda valoriza a Semente; apagão (pouca energia) também', () => {
    const ex = novoCambio();
    expect(cotacao(ex, { influenciaEsq: 80 })).toBeGreaterThan(cotacao(ex));
    expect(cotacao(ex, { energiaDir: 10 })).toBeGreaterThan(cotacao(ex));
  });
});

describe('moradia: lista de espera, mutirão, aluguel e despejo', () => {
  it('Esquerda: rede no galpão e lista; a casa sai depois dos ciclos', () => {
    const c = novaCidade(T0, 10);
    const e = crossed('esquerda');
    sincronizarComCidade(e, c);
    expect(e.home?.tipo).toBe('rede_no_galpao');
    expect(e.home?.espera?.ciclosRestantes).toBe(3);
    expect(e.home_id).toBe(`casa_${e.id}`);
    tickCidade(c, T0 + 10 * 60_000, [e]);
    expect(e.home?.espera?.ciclosRestantes).toBe(2);
    tickCidade(c, T0 + 30 * 60_000, [e]);
    expect(e.home?.tipo).toBe('casa_da_lista');
    expect(e.home?.espera ?? null).toBeNull();
  });

  it('atalho de teste e casa de mutirão pelo desbloqueio', () => {
    const c = novaCidade(T0, 10);
    const e = crossed('esquerda');
    sincronizarComCidade(e, c);
    e.inventory.push('movel:banco_de_madeira');
    expect(colocarMovel(e, 'banco_de_madeira', 0, 0).ok).toBe(true);
    avancarListaDeEspera(e);
    expect(e.home?.tipo).toBe('casa_da_lista');
    expect(e.home?.moveis).toHaveLength(1);
    e.unlocks.push('casa_propria');
    sincronizarComCidade(e, c);
    expect(e.home?.tipo).toBe('casa_de_mutirao');
  });

  it('Direita: cápsula com o 1º ciclo pago, aluguel em dia sobe o score', () => {
    const c = novaCidade(T0, 10);
    const d = crossed('direita');
    sincronizarComCidade(d, c);
    expect(d.home?.tipo).toBe('capsula');
    const s0 = d.score;
    tickCidade(c, T0 + 10 * 60_000, [d]);
    expect(d.credito).toBe(120 - 80);
    expect(d.score).toBe(s0 + 10);
  });

  it('atraso vira dívida, score cai; 3 atrasos dão despejo leve com móveis no inventário', () => {
    const c = novaCidade(T0, 10);
    const d = crossed('direita');
    sincronizarComCidade(d, c);
    d.inventory.push('movel:ring_light');
    expect(colocarMovel(d, 'ring_light', 1, 1).ok).toBe(true);
    d.credito = 0;
    const s0 = d.score;
    virarCiclos(c, 1);
    sincronizarComCidade(d, c);
    expect(d.home?.atraso).toBe(1);
    expect(economiaOf(d).divida).toBe(80);
    expect(d.score).toBeLessThan(s0);
    virarCiclos(c, 2);
    const s = sincronizarComCidade(d, c);
    expect(d.home).toBeNull();
    expect(d.home_id).toBeNull();
    expect(d.inventory).toContain('movel:ring_light');
    expect(s.avisos.join(' ')).toMatch(/depósito|inventário/);
    // não ganha outra cápsula de graça; aluga depois de quitar
    sincronizarComCidade(d, c);
    expect(d.home).toBeNull();
    d.credito = 1000;
    expect(alugarCapsula(d).ok).toBe(false);
    pagarDivida(d);
    expect(alugarCapsula(d).ok).toBe(true);
    expect(d.home?.tipo).toBe('capsula');
  });
});

describe('móveis em grade', () => {
  function casa(): PlayerRecord {
    const e = crossed('esquerda');
    sincronizarComCidade(e, novaCidade(T0));
    avancarListaDeEspera(e); // casa da lista, 7x7
    return e;
  }

  it('comprar vai para o inventário; colocar dentro da grade e sem colisão', () => {
    const e = casa();
    expect(comprarMovel(e, 'mesa_da_roda').ok).toBe(true);
    expect(e.semente).toBe(60);
    expect(e.inventory).toContain('movel:mesa_da_roda');
    expect(colocarMovel(e, 'mesa_da_roda', 5, 5).ok).toBe(false); // passa da parede (3x3 em 7x7)
    expect(colocarMovel(e, 'mesa_da_roda', 2, 2).ok).toBe(true);
    e.inventory.push('movel:banco_de_madeira');
    expect(colocarMovel(e, 'banco_de_madeira', 3, 3).ok).toBe(false); // bate na mesa
    expect(colocarMovel(e, 'banco_de_madeira', 0, 0).ok).toBe(true);
    expect(colocarMovel(e, 'banco_de_madeira', 0, 6).ok).toBe(false); // não tem no inventário
  });

  it('girar troca largura e altura; não gira se não couber; mover e tirar', () => {
    const e = casa();
    e.inventory.push('movel:rede_de_varanda', 'movel:banco_de_madeira');
    const r = colocarMovel(e, 'rede_de_varanda', 0, 6).movel!; // 3x1 na última linha
    expect(girarMovel(e, r.uid).ok).toBe(false); // em pé (1x3) passaria do chão
    expect(moverMovel(e, r.uid, 0, 0).ok).toBe(true);
    expect(girarMovel(e, r.uid).ok).toBe(true);
    expect(e.home!.moveis[0]!.rot).toBe(1);
    expect(cabe(e.home!, 'banco_de_madeira', 0, 2, 0).ok).toBe(false); // a rede em pé ocupa x=0, y=0..2
    expect(cabe(e.home!, 'banco_de_madeira', 1, 0, 0).ok).toBe(true);
    expect(tirarMovel(e, r.uid).ok).toBe(true);
    expect(e.home!.moveis).toHaveLength(0);
    expect(e.inventory).toContain('movel:rede_de_varanda');
  });

  it('móvel de parede: camada própria, encostado no fundo', () => {
    const e = casa();
    e.inventory.push('movel:retrato_da_nayra', 'movel:cadeira_de_balanco');
    expect(colocarMovel(e, 'retrato_da_nayra', 2, 3).ok).toBe(false);
    expect(colocarMovel(e, 'retrato_da_nayra', 2, 0).ok).toBe(true);
    expect(colocarMovel(e, 'cadeira_de_balanco', 2, 0).ok).toBe(true);
  });

  it('limite de móveis da moradia', () => {
    const e = crossed('esquerda');
    sincronizarComCidade(e, novaCidade(T0)); // rede no galpão 3x3, até 3 móveis
    for (let i = 0; i < 4; i++) e.inventory.push('movel:horta_em_vaso');
    expect(colocarMovel(e, 'horta_em_vaso', 0, 0).ok).toBe(true);
    expect(colocarMovel(e, 'horta_em_vaso', 1, 0).ok).toBe(true);
    expect(colocarMovel(e, 'horta_em_vaso', 2, 0).ok).toBe(true);
    const r = colocarMovel(e, 'horta_em_vaso', 0, 1);
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.erro).toMatch(/Limite/);
  });

  it('patente tranca móvel; casa salva sobrevive à migração', () => {
    const d = crossed('direita');
    sincronizarComCidade(d, novaCidade(T0));
    d.credito = 5000;
    expect(comprarMovel(d, 'cama_flutuante').ok).toBe(false);
    expect(comprarMovel(d, 'capsula_de_sono').ok).toBe(true);
    expect(colocarMovel(d, 'capsula_de_sono', 0, 0, 0).ok).toBe(true);
    const back = migratePlayerRecord(JSON.parse(JSON.stringify(d)));
    expect(back.home).toEqual(d.home);
    expect(back.economia?.moradiaDada).toBe(true);
  });
});

describe('visitas', () => {
  it('margem por padrão, só leitura; outra margem só a convite; so_eu e grupo', () => {
    const c = novaCidade(T0);
    const dono = crossed('esquerda', 'dono');
    const viz = crossed('esquerda', 'viz');
    const out = crossed('direita', 'out');
    sincronizarComCidade(dono, c);
    dono.inventory.push('movel:horta_em_vaso');
    colocarMovel(dono, 'horta_em_vaso', 1, 1);
    const v = visitarCasa(dono, viz);
    expect(v.ok).toBe(true);
    expect(v.casa!.somenteLeitura).toBe(true);
    expect(v.casa!.moveis).toHaveLength(1);
    expect(v.casa!.guardados).toBeUndefined();
    expect(visitarCasa(dono, out).ok).toBe(false);
    convidar(dono, out.id);
    expect(visitarCasa(dono, out).ok).toBe(true);
    definirVisitas(dono, 'so_eu');
    expect(visitarCasa(dono, viz).ok).toBe(false);
    definirVisitas(dono, 'grupo');
    expect(visitarCasa(dono, viz).ok).toBe(false);
    expect(visitarCasa(dono, viz, { mesmoGrupo: true }).ok).toBe(true);
    expect(casaView(dono)!.somenteLeitura).toBe(false);
  });
});

describe('ciclo da cidade', () => {
  it('reset do preço dinâmico e do câmbio na virada; anúncios vencem no tick', () => {
    const c = novaCidade(T0, 10);
    c.mercado.npc['comida'] = { procura: 5, oferta: 0 };
    c.cambio.volumeLiquidoS = 900;
    const a = crossed('esquerda', 'a');
    a.resources.comida = 1;
    anunciarFeira(c.mercado, a, { bem: { tipo: 'recurso', id: 'comida', quantidade: 1 } }, T0);
    const r0 = tickCidade(c, T0 + 60_000);
    expect(r0.ciclosNovos).toBe(0);
    expect(c.mercado.npc['comida']).toBeDefined();
    const r = tickCidade(c, T0 + 25 * 60_000);
    expect(r.ciclosNovos).toBe(2);
    expect(c.ciclo).toBe(2);
    expect(c.mercado.npc).toEqual({});
    expect(c.cambio.volumeLiquidoS).toBe(0);
    const longe = tickCidade(c, T0 + 365 * 24 * 3600_000);
    expect(longe.anunciosVencidos).toBe(1);
  });

  it('mensagens novas em GAME_MSG, sem nome repetido', () => {
    const vals = Object.values(GAME_MSG);
    expect(new Set(vals).size).toBe(vals.length);
    for (const k of ['lojaComprar', 'lojaVender', 'feiraAnunciar', 'feiraComprar', 'appAnunciar', 'appComprar', 'cambioTrocar', 'casaColocar', 'casaGirar', 'casaVisitar', 'casaInfo', 'carteira']) {
      expect(GAME_MSG).toHaveProperty(k);
    }
  });
});
