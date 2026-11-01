/**
 * Fase 5: influência, pontos de controle, saque de 20%, IA de facção (Lazzaro Prati e Rolf Halvorsen),
 * determinismo do tick e os modificadores de margem no combate.
 */
import { describe, expect, it } from 'vitest';
import {
  ACOES_FACCAO,
  LIMIAR_DONO,
  bonusDoDono,
  clonar,
  consolidarDonos,
  decidirLider,
  liderDe,
  medidoresCidadeDaFaccao,
  novoEstadoFaccao,
  pesosDaFaccao,
  produzirPontosMut,
  regionStateParaCombate,
  saqueDisponivel,
  saquearPonto,
  somarInfluencia,
  tickFaccao,
  tickFaccaoMin,
  type EstadoFaccao,
} from '../src/game/index';
import { createRng } from '../src/sim/rng';
import { marginPct } from '../src/sim/combat';
import type { Entity, World } from '../src/sim/types';

const T0 = 1_000_000;

describe('influência e pontos de controle', () => {
  it('missões da Direita viram o posto neutro do Juncal ao passar do limite', () => {
    let e = novoEstadoFaccao(T0);
    const orig = clonar(e);
    expect(e.pontos.pc_clareira_do_juncal!.dono).toBe('neutra');
    let trocou = false;
    for (let i = 0; i < 20 && !trocou; i++) {
      const s = somarInfluencia(e, { fonte: 'missao', lado: 'direita', regiao: 'juncal', qtd: 50 });
      // a influência dos jogadores não vira o ponto sozinha: a troca sai no tick (consolidarDonos)
      expect(s.trocas).toHaveLength(0);
      const r = consolidarDonos(s.estado);
      e = r.estado;
      if (r.trocas.length) {
        trocou = true;
        expect(r.trocas[0]).toEqual({ ponto: 'pc_clareira_do_juncal', de: 'neutra', para: 'direita' });
        expect(r.eventos[0]!.tipo).toBe('troca_de_dono');
        expect(r.eventos[0]!.texto).toContain('Posto da Clareira');
      }
    }
    expect(trocou).toBe(true);
    expect(e.pontos.pc_clareira_do_juncal!.dono).toBe('direita');
    expect(e.pontos.pc_clareira_do_juncal!.influencia.direita).toBeGreaterThanOrEqual(LIMIAR_DONO);
    // não mexe no estado recebido
    expect(orig.pontos.pc_clareira_do_juncal!.dono).toBe('neutra');
  });

  it('o ponto com dono só vira quando a outra margem passa do limite e do dono', () => {
    let e = novoEstadoFaccao(T0);
    expect(e.pontos.pc_feira!.dono).toBe('esquerda');
    const passos: string[] = [];
    for (let i = 0; i < 30; i++) {
      const r = consolidarDonos(somarInfluencia(e, { fonte: 'missao', lado: 'direita', regiao: 'margem_esquerda', ponto: 'pc_feira', qtd: 3 }).estado);
      e = r.estado;
      passos.push(e.pontos.pc_feira!.dono);
      const inf = e.pontos.pc_feira!.influencia;
      expect(inf.esquerda + inf.direita).toBeLessThanOrEqual(100);
    }
    expect(e.pontos.pc_feira!.dono).toBe('direita');
    // o outro ponto da região não foi tocado
    expect(e.pontos.pc_casa_da_assembleia!.dono).toBe('esquerda');
    // levou várias missões, não uma
    expect(passos.indexOf('direita')).toBeGreaterThan(3);
  });

  it('a influência dos jogadores acumula e o tick de facção vira o ponto com o aviso', () => {
    let e = novoEstadoFaccao(T0, 1);
    for (let i = 0; i < 10; i++) e = somarInfluencia(e, { fonte: 'missao', lado: 'esquerda', regiao: 'usina_da_ponte', ponto: 'pc_ponte_direita', qtd: 2 }).estado;
    const p = e.pontos.pc_ponte_direita!;
    expect(p.influencia.esquerda).toBeGreaterThanOrEqual(LIMIAR_DONO);
    expect(p.dono).toBe('direita');
    const r = tickFaccao(e, e.proximoTickEm, createRng(5));
    expect(r.ticks).toBe(1);
    expect(r.trocas).toContainEqual({ ponto: 'pc_ponte_direita', de: 'direita', para: 'esquerda' });
    expect(r.eventos.some((ev) => ev.tipo === 'troca_de_dono' && ev.ponto === 'pc_ponte_direita')).toBe(true);
    expect(r.estado.pontos.pc_ponte_direita!.dono).toBe('esquerda');
  });

  it('cada fonte soma o seu: matar, missão, plantão e comércio', () => {
    const e = novoEstadoFaccao(T0);
    const base = e.pontos.pc_cais_do_delta!.influencia.esquerda;
    const soma = (ev: Parameters<typeof somarInfluencia>[1]) => somarInfluencia(e, ev).somado.pc_cais_do_delta ?? 0;
    expect(soma({ fonte: 'matar', lado: 'esquerda', regiao: 'delta', qtd: 8 })).toBeCloseTo(2);
    expect(soma({ fonte: 'missao', lado: 'esquerda', regiao: 'delta' })).toBeCloseTo(3);
    expect(soma({ fonte: 'plantao', lado: 'esquerda', regiao: 'delta', qtd: 2 })).toBeCloseTo(2);
    expect(soma({ fonte: 'comercio', lado: 'esquerda', regiao: 'delta', qtd: 500 })).toBeCloseTo(5);
    // teto por evento
    expect(soma({ fonte: 'matar', lado: 'esquerda', regiao: 'delta', qtd: 1000 })).toBeCloseTo(8);
    expect(e.pontos.pc_cais_do_delta!.influencia.esquerda).toBe(base);
  });

  it('a IA tem limite diário de influência por região', () => {
    let e = novoEstadoFaccao(T0);
    let total = 0;
    for (let i = 0; i < 5; i++) {
      const r = somarInfluencia(e, { fonte: 'ia', lado: 'esquerda', regiao: 'delta', qtd: 6 });
      e = r.estado;
      total += r.somado.pc_cais_do_delta ?? 0;
    }
    expect(total).toBeCloseTo(10);
  });

  it('o dono ganha bônus de produção e de preço', () => {
    const e = novoEstadoFaccao(T0);
    expect(bonusDoDono(e, 'direita', 'margem_direita')).toEqual({ pontos: 2, producaoPct: 20, precoPct: -10 });
    expect(bonusDoDono(e, 'esquerda', 'margem_direita')).toEqual({ pontos: 0, producaoPct: 0, precoPct: 0 });
    const p = clonar(e);
    produzirPontosMut(p);
    expect(p.pontos.pc_torre_do_consorcio!.produzidoNoCiclo).toBe(12);
    expect(p.pontos.pc_cais_do_delta!.produzidoNoCiclo).toBe(0);
  });
});

describe('saque máximo de 20%', () => {
  const comEstoque = (): EstadoFaccao => {
    const e = novoEstadoFaccao(T0);
    const p = e.pontos.pc_shopping!;
    p.estoque = 500;
    p.produzidoNoCiclo = 100;
    return e;
  };

  it('leva no máximo 20% do que o ponto produziu no ciclo', () => {
    const e = comEstoque();
    expect(saqueDisponivel(e, 'pc_shopping')).toBe(20);
    const r1 = saquearPonto(e, 'pc_shopping', 'esquerda', 15);
    expect(r1.levou).toBe(15);
    const r2 = saquearPonto(r1.estado, 'pc_shopping', 'esquerda', 999);
    expect(r2.levou).toBe(5);
    const r3 = saquearPonto(r2.estado, 'pc_shopping', 'esquerda', 1);
    expect(r3.levou).toBe(0);
    expect(r3.erro).toBeTruthy();
    expect(r2.estado.pontos.pc_shopping!.estoque).toBe(480);
    expect(r2.evento?.tipo).toBe('saque');
  });

  it('o dono não saqueia o próprio ponto e o ciclo novo zera o saque', () => {
    const e = comEstoque();
    expect(saquearPonto(e, 'pc_shopping', 'direita', 10).levou).toBe(0);
    const r = saquearPonto(e, 'pc_shopping', 'esquerda', 50);
    expect(r.levou).toBe(20);
    const t = tickFaccao(r.estado, r.estado.proximoTickEm, createRng(1));
    expect(t.estado.pontos.pc_shopping!.saqueadoNoCiclo).toBe(0);
    expect(saqueDisponivel(t.estado, 'pc_shopping')).toBe(Math.floor(t.estado.pontos.pc_shopping!.produzidoNoCiclo * 0.2));
  });
});

describe('IA de facção', () => {
  it('Lazzaro Prati comanda a Esquerda e Rolf Halvorsen a Direita', () => {
    expect(liderDe('esquerda')).toMatchObject({ id: 'lazzaro_prati', perfil: 'agressivo' });
    expect(liderDe('direita')).toMatchObject({ id: 'rolf_halvorsen', perfil: 'defensivo' });
  });

  it('Lazzaro, agressivo, prefere campanha e quase não faz mutirão', () => {
    const e = novoEstadoFaccao(T0);
    const w = pesosDaFaccao(e, 'esquerda');
    const max = Math.max(...ACOES_FACCAO.map((a) => w[a]));
    expect(w.campanha).toBe(max);
    expect(w.mutirao).toBeLessThan(1);
    expect(w.aumentar_preco).toBe(0);
  });

  it('Rolf só ataca com certeza: sem 80% no alvo, reforça', () => {
    const e = novoEstadoFaccao(T0);
    const w = pesosDaFaccao(e, 'direita');
    expect(w.campanha).toBe(0);
    expect(w.patrulha).toBe(Math.max(...ACOES_FACCAO.map((a) => w[a])));
    expect(w.mutirao).toBe(0);
    // com vantagem esmagadora na clareira, a campanha aparece
    const v = clonar(e);
    v.pontos.pc_clareira_do_juncal!.influencia = { esquerda: 5, direita: 55 };
    expect(pesosDaFaccao(v, 'direita').campanha).toBeGreaterThan(0);
  });

  it('apagão na Direita puxa investimento e preço dinâmico', () => {
    const e = novoEstadoFaccao(T0);
    const a = clonar(e);
    a.regioes.margem_direita!.energia = 5;
    const w0 = pesosDaFaccao(e, 'direita');
    const w1 = pesosDaFaccao(a, 'direita');
    expect(w1.investimento).toBeGreaterThan(w0.investimento * 3);
    expect(w1.aumentar_preco).toBeGreaterThan(w0.aumentar_preco);
    // a Esquerda faz discurso com o apagão do outro lado
    expect(pesosDaFaccao(a, 'esquerda').propaganda).toBeGreaterThanOrEqual(pesosDaFaccao(e, 'esquerda').propaganda);
    let inv0 = 0;
    let inv1 = 0;
    for (let s = 1; s <= 300; s++) {
      if (decidirLider(e, 'direita', createRng(s)).includes('investimento')) inv0++;
      if (decidirLider(a, 'direita', createRng(s)).includes('investimento')) inv1++;
    }
    expect(inv1).toBeGreaterThan(inv0);
  });

  it('poluição na Esquerda puxa energia limpa', () => {
    const e = novoEstadoFaccao(T0);
    const limpo = clonar(e);
    limpo.regioes.margem_esquerda!.poluicao = 0;
    const sujo = clonar(e);
    sujo.regioes.margem_esquerda!.poluicao = 4;
    expect(pesosDaFaccao(sujo, 'esquerda').investimento).toBeGreaterThan(pesosDaFaccao(limpo, 'esquerda').investimento);
  });

  it('cada margem só escolhe as ações dela', () => {
    for (let s = 1; s <= 100; s++) {
      const e = novoEstadoFaccao(T0);
      const esq = decidirLider(e, 'esquerda', createRng(s));
      const dir = decidirLider(e, 'direita', createRng(s));
      expect(esq).toHaveLength(2);
      expect(new Set(esq).size).toBe(2);
      expect(esq).not.toContain('aumentar_preco');
      expect(dir).not.toContain('mutirao');
      expect(dir).not.toContain('campanha');
    }
  });

  it('o tick gera avisos do mapa curtos, com o líder e a ação', () => {
    const e = novoEstadoFaccao(T0);
    const t = tickFaccao(e, e.proximoTickEm, createRng(42));
    expect(t.ticks).toBe(1);
    expect(t.decisoes).toHaveLength(4);
    const ia = t.eventos.filter((w) => w.tipo === 'acao_ia');
    expect(ia).toHaveLength(4);
    for (const w of ia) {
      expect(w.texto.length).toBeGreaterThan(10);
      expect(w.texto.length).toBeLessThan(160);
      expect(w.texto).not.toMatch(/\{\w+\}/);
      expect(w.sugestao).toBe(true);
      expect(['lazzaro_prati', 'rolf_halvorsen']).toContain(w.lider);
    }
    expect(t.estado.eventos.length).toBeGreaterThanOrEqual(4);
    expect(t.estado.ciclo).toBe(1);
  });

  it('apagão novo vira aviso', () => {
    const e = novoEstadoFaccao(T0);
    e.regioes.juncal!.energia = 12; // volta para 5 (regions.json) de 2 em 2: cai para 10, que é apagão
    const t = tickFaccao(e, e.proximoTickEm, createRng(3));
    expect(t.eventos.some((w) => w.tipo === 'apagao' && w.regiao === 'juncal')).toBe(true);
  });

  it('é determinístico pela semente e roda os ciclos vencidos', () => {
    const e = novoEstadoFaccao(T0);
    const now = e.proximoTickEm + 2 * e.tickMs + 10;
    const a = tickFaccao(e, now, createRng(777));
    const b = tickFaccao(e, now, createRng(777));
    expect(a.ticks).toBe(3);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const outras = [1, 2, 3, 4, 5].map((s) => JSON.stringify(tickFaccao(e, now, createRng(s)).decisoes));
    expect(new Set(outras).size).toBeGreaterThan(1);
    // o estado recebido não muda
    expect(e.ciclo).toBe(0);
    expect(a.estado.proximoTickEm).toBe(e.proximoTickEm + 3 * e.tickMs);
    // sem ciclo vencido, nada acontece
    expect(tickFaccao(a.estado, now, createRng(1)).ticks).toBe(0);
  });

  it('muitos ciclos vencidos: roda no máximo 24 e alinha o relógio', () => {
    const e = novoEstadoFaccao(T0);
    const now = e.proximoTickEm + 100 * e.tickMs;
    const t = tickFaccao(e, now, createRng(9));
    expect(t.ticks).toBe(24);
    expect(t.estado.proximoTickEm).toBeGreaterThan(now);
  });

  it('o tick é de 60 min por padrão e configurável', () => {
    expect(tickFaccaoMin()).toBe(60);
    expect(tickFaccaoMin('15')).toBe(15);
    expect(tickFaccaoMin('x')).toBe(60);
    expect(novoEstadoFaccao(0, 15).tickMs).toBe(15 * 60_000);
  });
});

describe('modificadores de margem', () => {
  const mundo = (e: EstadoFaccao, regionId: string): World =>
    ({ map: { regions: [{ regionId, x: 0, y: 0, w: 100, h: 100 }] }, regionState: regionStateParaCombate(e) }) as unknown as World;
  const ent = (side: 'esquerda' | 'direita'): Entity => ({ side, x: 5, y: 5 }) as unknown as Entity;

  it('Direita: +10% com energia, -20% no apagão, +5% na cidade', () => {
    const e = novoEstadoFaccao(T0);
    expect(marginPct(mundo(e, 'margem_direita'), ent('direita'))).toBe(15);
    e.regioes.margem_direita!.energia = 5;
    expect(marginPct(mundo(e, 'margem_direita'), ent('direita'))).toBe(-15);
    e.regioes.margem_direita!.energia = 30; // nem energia nem apagão
    expect(marginPct(mundo(e, 'margem_direita'), ent('direita'))).toBe(5);
  });

  it('Esquerda: +10% com poluição 0, -10% por ponto, +5% na natureza', () => {
    const e = novoEstadoFaccao(T0);
    expect(marginPct(mundo(e, 'juncal'), ent('esquerda'))).toBe(15);
    expect(marginPct(mundo(e, 'margem_esquerda'), ent('esquerda'))).toBe(-10);
    e.regioes.margem_esquerda!.poluicao = 3;
    expect(marginPct(mundo(e, 'margem_esquerda'), ent('esquerda'))).toBe(-30);
    e.regioes.delta!.poluicao = 0;
    expect(marginPct(mundo(e, 'delta'), ent('esquerda'))).toBe(15);
  });

  it('os medidores da facção chegam na cidade', () => {
    const e = novoEstadoFaccao(T0);
    expect(medidoresCidadeDaFaccao(e)).toMatchObject({ apagaoDir: false, energiaDir: 80, influenciaEsq: 85 });
    e.regioes.margem_direita!.energia = 3;
    expect(medidoresCidadeDaFaccao(e).apagaoDir).toBe(true);
    expect(regionStateParaCombate(e).margem_direita).toEqual({ energia: false, apagao: true, poluicao: 4 });
  });
});
