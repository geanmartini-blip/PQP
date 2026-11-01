/**
 * Fase 4: câmbio na ponte (economy.json cambio), Semente ↔ Crédito com spread.
 *
 * cotação (Créditos por 1 Semente) = fórmula do mapa (influência, energia, preço de vida) ×
 * efeito do volume, limitada a [min, max]. Comprar Crédito paga cotação × (1 − spread); comprar
 * Semente custa cotação × (1 + spread).
 *
 * Efeito do volume (determinístico): o câmbio guarda o volume líquido do ciclo em Semente
 * (vendida por Crédito menos comprada). // SUGESTÃO: cada CAMBIO_VOLUME_ESCALA Sementes líquidas
 * vendidas tiram CAMBIO_K_VOLUME da cotação (Semente sobrando vale menos), até ±CAMBIO_VOLUME_MAX.
 * O volume zera a cada ciclo da cidade. A troca usa a cotação de antes dela.
 *
 * Limite por jogador por ciclo: limitePorCicloSemente, em Semente equivalente (rec.economia).
 */
import { getData } from '../data';
import { economiaOf, nomeMoeda } from './economy';
import type { Check, Moeda, PlayerRecord } from './types';

export const CAMBIO_K_VOLUME = 0.05; // SUGESTÃO
export const CAMBIO_VOLUME_ESCALA = 1000; // SUGESTÃO
export const CAMBIO_VOLUME_MAX = 0.25; // SUGESTÃO

export interface ExchangeState {
  /** Semente vendida por Crédito menos Semente comprada, neste ciclo */
  volumeLiquidoS: number;
  /** total trocado no ciclo, em Semente equivalente (só informação) */
  volumeTotalS: number;
}

export const novoCambio = (): ExchangeState => ({ volumeLiquidoS: 0, volumeTotalS: 0 });

/** Medidores do mapa que mexem na cotação (padrão: tudo no meio, cotação = base). */
export interface CambioCtx {
  influenciaEsq?: number;
  energiaDir?: number;
  precoDeVidaDir?: number;
  precoDeVidaEsq?: number;
}

/** Cotação do mapa, sem o volume. */
export function cotacaoDoMapa(ctx: CambioCtx = {}): number {
  const C = getData().economy.cambio;
  const inf = ctx.influenciaEsq ?? 50;
  const en = ctx.energiaDir ?? 50;
  const pvD = ctx.precoDeVidaDir ?? 100;
  const pvE = ctx.precoDeVidaEsq ?? 100;
  const c = C.base * (1 + (C.kInfluencia * (inf - 50)) / 50) * (1 - (C.kEnergia * (en - 50)) / 50) * Math.pow(pvD / Math.max(1, pvE), C.kPrecoDeVida);
  return Math.max(C.min, Math.min(C.max, c));
}

export function efeitoVolume(e: ExchangeState): number {
  const v = (CAMBIO_K_VOLUME * e.volumeLiquidoS) / CAMBIO_VOLUME_ESCALA;
  return 1 - Math.max(-CAMBIO_VOLUME_MAX, Math.min(CAMBIO_VOLUME_MAX, v));
}

/** Cotação média agora (Créditos por 1 Semente), com o volume. */
export function cotacao(e: ExchangeState, ctx: CambioCtx = {}): number {
  const C = getData().economy.cambio;
  return Math.max(C.min, Math.min(C.max, cotacaoDoMapa(ctx) * efeitoVolume(e)));
}

/** exchange_rate do modelo de dados: o que a placa da ponte mostra. */
export interface ExchangeRate {
  /** Créditos por 1 Semente, no meio */
  cotacao: number;
  /** quantos Créditos você recebe por 1 Semente */
  creditoPorSemente: number;
  /** quantos Créditos custa 1 Semente */
  custoSementeEmCredito: number;
  spreadPct: number;
  volumeLiquidoS: number;
  limitePorCicloSemente: number;
}

export function exchangeRate(e: ExchangeState, ctx: CambioCtx = {}): ExchangeRate {
  const C = getData().economy.cambio;
  const c = cotacao(e, ctx);
  const s = C.spreadPct / 100;
  return {
    cotacao: c,
    creditoPorSemente: c * (1 - s),
    custoSementeEmCredito: c * (1 + s),
    spreadPct: C.spreadPct,
    volumeLiquidoS: e.volumeLiquidoS,
    limitePorCicloSemente: C.limitePorCicloSemente,
  };
}

export interface CotacaoTroca {
  de: Moeda;
  para: Moeda;
  quantidade: number;
  recebe: number;
  cotacao: number;
  /** spread que fica com a prefeitura da ponte, na moeda de destino */
  taxa: number;
  /** valor da troca em Semente equivalente (conta no limite do ciclo) */
  sementeEq: number;
}

/** Quanto sai uma troca de `quantidade` da moeda `de`. */
export function cotarTroca(e: ExchangeState, de: Moeda, quantidade: number, ctx: CambioCtx = {}): CotacaoTroca {
  const s = getData().economy.cambio.spreadPct / 100;
  const c = cotacao(e, ctx);
  const q = Math.max(0, Math.floor(quantidade));
  if (de === 'semente') {
    const bruto = q * c;
    const recebe = Math.floor(bruto * (1 - s));
    return { de, para: 'credito', quantidade: q, recebe, cotacao: c, taxa: Math.round(bruto - recebe), sementeEq: q };
  }
  const bruto = q / c;
  const recebe = Math.floor(q / (c * (1 + s)));
  return { de, para: 'semente', quantidade: q, recebe, cotacao: c, taxa: Math.round(bruto - recebe), sementeEq: Math.ceil(bruto) };
}

/** Troca na ponte: tira `quantidade` de `de` e põe o convertido na outra moeda. */
export function trocarMoeda(e: ExchangeState, rec: PlayerRecord, de: Moeda, quantidade: number, ctx: CambioCtx = {}): Check & { troca?: CotacaoTroca } {
  const C = getData().economy.cambio;
  if (de !== 'semente' && de !== 'credito') return { ok: false, erro: 'Moeda inválida.' };
  const t = cotarTroca(e, de, quantidade, ctx);
  if (t.quantidade < 1) return { ok: false, erro: 'Diga quanto quer trocar.' };
  const saldo = de === 'semente' ? rec.semente : rec.credito;
  if (saldo < t.quantidade) return { ok: false, erro: `Faltam ${t.quantidade - saldo} ${nomeMoeda(de)}.` };
  if (t.recebe < 1) return { ok: false, erro: 'Isso não dá nem 1 da outra moeda. A ponte agradece a doação, mas recusa.' };
  const ec = economiaOf(rec);
  if (ec.cambioCiclo + t.sementeEq > C.limitePorCicloSemente) {
    return { ok: false, erro: `Limite do ciclo: ${C.limitePorCicloSemente - ec.cambioCiclo} Sementes de câmbio. Para mais, só pelo Juncal (não recomendamos).` };
  }
  if (de === 'semente') {
    rec.semente -= t.quantidade;
    rec.credito += t.recebe;
    e.volumeLiquidoS += t.sementeEq;
  } else {
    rec.credito -= t.quantidade;
    rec.semente += t.recebe;
    e.volumeLiquidoS -= t.sementeEq;
  }
  e.volumeTotalS += t.sementeEq;
  ec.cambioCiclo += t.sementeEq;
  return { ok: true, troca: t };
}

/** Novo ciclo da cidade no câmbio: o volume zera. */
export function virarCicloCambio(e: ExchangeState): void {
  e.volumeLiquidoS = 0;
  e.volumeTotalS = 0;
}
