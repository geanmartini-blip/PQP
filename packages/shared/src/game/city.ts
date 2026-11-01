/**
 * Fase 4: ciclo da cidade. Um estado só (CidadeState, JSON) com o mercado, o câmbio e os
 * medidores; tickCidade(estado, now) é chamado pelo servidor num intervalo curto
 * (PQP_CICLO_CIDADE_MIN dá a duração do ciclo; padrão: housing.json ciclo.dias).
 *
 * - A cada tick: anúncios vencidos saem (o bem volta para as pendências do vendedor).
 * - Quando vira o ciclo: o preço dinâmico de NPC e o volume do câmbio zeram.
 * - Cada registro anda junto pela sua conta (rec.economia.ciclo): sincronizarComCidade aplica os
 *   ciclos que faltam (aluguel, lista de espera, limites do ciclo) e dá a moradia inicial. O tick
 *   aplica nos registros que o servidor passar (os online); quem estava fora acerta ao entrar.
 *   // SUGESTÃO: no máximo CICLOS_MAX_POR_SINCRONIA ciclos de uma vez (quem ficou meses fora
 *   não toma 50 despejos; toma um).
 */
import { getData } from '../data';
import { economiaOf, virarCicloCarteira } from './economy';
import { novoCambio, virarCicloCambio, type CambioCtx, type ExchangeState } from './exchange';
import { avancarListaDeEspera, cobrarAluguel, darMoradiaInicial, receberCasaDeMutirao } from './housing';
import { expirarAnuncios, migrarMercado, novoMercado, resetPrecosNpc, type MarketState } from './market';
import type { PlayerRecord } from './types';

export const CICLOS_MAX_POR_SINCRONIA = 6; // SUGESTÃO

/** Medidores que a economia lê (o servidor atualiza com o mapa; vazios = normal). */
export interface MedidoresCidade extends CambioCtx {
  apagaoDir?: boolean;
  chovendo?: boolean;
}

export interface CidadeState {
  versao: 1;
  ciclo: number;
  cicloIniciouEm: number;
  cicloMs: number;
  mercado: MarketState;
  cambio: ExchangeState;
  medidores: MedidoresCidade;
}

/** Duração do ciclo em minutos (PQP_CICLO_CIDADE_MIN; inválido ou vazio = housing.json ciclo.dias). */
export function cicloCidadeMin(env?: string | number | null): number {
  const n = typeof env === 'number' ? env : env ? Number(env) : NaN;
  if (Number.isFinite(n) && n > 0) return n;
  return getData().housing.ciclo.dias * 24 * 60;
}

export function novaCidade(now: number, cicloMin = cicloCidadeMin()): CidadeState {
  return { versao: 1, ciclo: 0, cicloIniciouEm: now, cicloMs: Math.max(1, Math.round(cicloMin * 60_000)), mercado: novoMercado(), cambio: novoCambio(), medidores: {} };
}

/** Lê uma CidadeState salva (tolerante); sem nada, uma nova. */
export function migrarCidade(raw: unknown, now: number, cicloMin = cicloCidadeMin()): CidadeState {
  const c = novaCidade(now, cicloMin);
  if (typeof raw !== 'object' || raw === null) return c;
  const r = raw as Partial<CidadeState>;
  return {
    versao: 1,
    ciclo: typeof r.ciclo === 'number' ? r.ciclo : 0,
    cicloIniciouEm: typeof r.cicloIniciouEm === 'number' ? r.cicloIniciouEm : now,
    cicloMs: c.cicloMs,
    mercado: migrarMercado(r.mercado),
    cambio: r.cambio && typeof r.cambio.volumeLiquidoS === 'number' ? { volumeLiquidoS: r.cambio.volumeLiquidoS, volumeTotalS: r.cambio.volumeTotalS ?? 0 } : novoCambio(),
    medidores: typeof r.medidores === 'object' && r.medidores !== null ? r.medidores : {},
  };
}

export interface SincroniaResult {
  mudou: boolean;
  ciclos: number;
  avisos: string[];
}

/** Aplica no registro os ciclos da cidade que ele ainda não viu, e a moradia inicial. */
export function sincronizarComCidade(rec: PlayerRecord, c: CidadeState): SincroniaResult {
  const e = economiaOf(rec);
  const out: SincroniaResult = { mudou: false, ciclos: 0, avisos: [] };
  const ini = darMoradiaInicial(rec);
  if (ini.length) {
    out.mudou = true;
    out.avisos.push(...ini);
    // quem chega agora começa no ciclo atual (o primeiro ciclo já está pago ou na espera)
    e.ciclo = c.ciclo;
  }
  if (rec.unlocks.includes('casa_propria')) {
    const av = receberCasaDeMutirao(rec);
    if (av.length) {
      out.mudou = true;
      out.avisos.push(...av);
    }
  }
  if (e.ciclo > c.ciclo) e.ciclo = c.ciclo;
  const falta = c.ciclo - e.ciclo;
  if (falta <= 0) return out;
  const n = Math.min(falta, CICLOS_MAX_POR_SINCRONIA);
  for (let i = 0; i < n; i++) {
    virarCicloCarteira(rec);
    if (rec.home?.espera) out.avisos.push(...avancarListaDeEspera(rec, 1));
    out.avisos.push(...cobrarAluguel(rec, c.medidores.precoDeVidaDir));
  }
  e.ciclo = c.ciclo;
  out.ciclos = n;
  out.mudou = true;
  return out;
}

export interface TickCidadeResult {
  /** ciclos da cidade que viraram neste tick */
  ciclosNovos: number;
  anunciosVencidos: number;
  /** avisos por jogador (dos registros passados) */
  porJogador: Record<string, string[]>;
  /** ids dos registros que mudaram (salvar e mandar perfil) */
  mudaram: string[];
}

/** Tick da cidade: vence anúncios, vira ciclos e sincroniza os registros passados. */
export function tickCidade(c: CidadeState, now: number, registros: readonly PlayerRecord[] = []): TickCidadeResult {
  const out: TickCidadeResult = { ciclosNovos: 0, anunciosVencidos: expirarAnuncios(c.mercado, now), porJogador: {}, mudaram: [] };
  while (now >= c.cicloIniciouEm + c.cicloMs) {
    c.cicloIniciouEm += c.cicloMs;
    c.ciclo += 1;
    out.ciclosNovos += 1;
    resetPrecosNpc(c.mercado);
    virarCicloCambio(c.cambio);
    // proteção contra relógio muito à frente: alinha sem rodar milhares de voltas
    if (out.ciclosNovos >= 1000) {
      const pulos = Math.floor((now - c.cicloIniciouEm) / c.cicloMs);
      c.ciclo += Math.max(0, pulos);
      out.ciclosNovos += Math.max(0, pulos);
      c.cicloIniciouEm += Math.max(0, pulos) * c.cicloMs;
    }
  }
  for (const rec of registros) {
    const s = sincronizarComCidade(rec, c);
    if (s.mudou) out.mudaram.push(rec.id);
    if (s.avisos.length) (out.porJogador[rec.id] ??= []).push(...s.avisos);
  }
  return out;
}

/** Atalho de teste: força a virada de N ciclos agora. */
export function virarCiclos(c: CidadeState, n = 1): void {
  for (let i = 0; i < n; i++) {
    c.ciclo += 1;
    resetPrecosNpc(c.mercado);
    virarCicloCambio(c.cambio);
  }
}

/** Ms até o próximo ciclo. */
export const msAteProximoCiclo = (c: CidadeState, now: number): number => Math.max(0, c.cicloIniciouEm + c.cicloMs - now);
