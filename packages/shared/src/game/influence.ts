/**
 * Fase 5: influência e pontos de controle.
 *
 * Um estado só (EstadoFaccao, JSON) guarda os medidores das regiões do piloto, os pontos de controle
 * e os avisos do mapa (world_event). As funções aqui não mexem no estado recebido: devolvem uma cópia.
 *
 * - somarInfluencia(estado, evento): ações dos jogadores (matar na região, missão, plantão, comércio)
 *   e da IA de facção somam influência da margem nos pontos da região. O ponto muda de dono quando a
 *   influência de uma margem chega ao limite (LIMIAR_DONO) e passa a do dono atual.
 *   SUGESTÃO: a influência dos jogadores acumula durante o ciclo e a troca de dono que ela causa sai no
 *   tick de facção (consolidarDonosMut, no começo de rodarTickMut), com o aviso do mapa; as ações da
 *   IA, que já rodam dentro do tick, viram o ponto na hora.
 * - O dono ganha bônus de produção e de preço na região (bonusDoDono).
 * - Cada ponto produz a cada tick de facção; o saque máximo por ciclo é de 20% do que o ponto produziu
 *   (structures.json regras.saqueMaxPct).
 * - regionStateParaCombate(estado) liga os medidores aos modificadores de margem do combate
 *   (sim/combat.ts marginPct, que lê World.regionState).
 *
 * Os números novos estão marcados com // SUGESTÃO.
 */
import { getData } from '../data';
import type { MedidoresCidade } from './city';

export type Lado = 'esquerda' | 'direita';
export type Dono = Lado | 'neutra';
export const LADOS: readonly Lado[] = ['esquerda', 'direita'];
export const outroLado = (l: Lado): Lado => (l === 'esquerda' ? 'direita' : 'esquerda');

/** Influência que faz um ponto mudar de dono (0 a 100). */
export const LIMIAR_DONO = 60; // SUGESTÃO
/** Produção de um ponto com dono a cada tick de facção, antes do bônus. */
export const PRODUCAO_PONTO_POR_TICK = 10; // SUGESTÃO
/** Bônus do dono por ponto que ele tem na região. */
export const BONUS_DONO = { producaoPct: 10, precoPct: -5, maxProducaoPct: 25, minPrecoPct: -15 } as const; // SUGESTÃO
/** Quanto cada fonte de jogador soma (por unidade de `qtd`). */
export const INFLUENCIA_POR_FONTE = {
  /** por inimigo derrotado na região */
  matar: 0.25,
  /** por missão entregue na região */
  missao: 3,
  /** por luta do plantonista na região */
  plantao: 1,
  /** por 100 de Semente ou Crédito negociados na região */
  comercio: 1,
  /** a IA de facção manda o número direto (limitado por regras.limiteDiario) */
  ia: 1,
} as const; // SUGESTÃO
/** Teto por evento de jogador (ninguém vira um ponto sozinho numa tacada). */
export const INFLUENCIA_MAX_POR_EVENTO = 8; // SUGESTÃO
/** A energia volta para o valor dos dados aos poucos, a cada tick. */
export const ENERGIA_VOLTA_POR_TICK = 2; // SUGESTÃO
/** Quantos avisos do mapa ficam guardados no estado. */
export const EVENTOS_GUARDADOS = 50; // SUGESTÃO

export type FonteInfluencia = keyof typeof INFLUENCIA_POR_FONTE;

export interface EventoInfluencia {
  fonte: FonteInfluencia;
  lado: Lado;
  regiao: string;
  /** um ponto só; sem ele, vale para todos os pontos da região */
  ponto?: string;
  /** abates, missões, lutas, valor negociado (comércio) ou pontos (ia); padrão 1 */
  qtd?: number;
}

export interface Influencia {
  esquerda: number;
  direita: number;
}

export interface RegiaoFaccao {
  energia: number;
  /** guarda fração (cai 0,1 por tick); o combate usa o inteiro */
  poluicao: number;
  opiniao: number;
  precoDeVida: number;
  influencia: Influencia;
}

export interface PontoControle {
  id: string;
  regiao: string;
  dono: Dono;
  influencia: Influencia;
  /** recurso guardado no ponto */
  estoque: number;
  /** quanto o ponto produziu no último tick (base do saque) */
  produzidoNoCiclo: number;
  saqueadoNoCiclo: number;
}

/** Aviso do mapa (tabela world_event). */
export interface WorldEvent {
  id: string;
  ciclo: number;
  em: number;
  tipo: 'acao_ia' | 'troca_de_dono' | 'apagao' | 'saque';
  lado?: Lado;
  lider?: string;
  acao?: string;
  regiao?: string;
  ponto?: string;
  texto: string;
  /** texto ou número que não está nos docs */
  sugestao?: boolean;
}

export interface LimiteIaDia {
  dia: number;
  esquerda: { total: number; porRegiao: Record<string, number>; ataques: number };
  direita: { total: number; porRegiao: Record<string, number>; ataques: number };
}

export interface EstadoFaccao {
  versao: 1;
  ciclo: number;
  /** quando roda o próximo tick de facção */
  proximoTickEm: number;
  tickMs: number;
  /** último instante visto (os avisos de somarInfluencia usam este) */
  agora: number;
  seqEvento: number;
  regioes: Record<string, RegiaoFaccao>;
  pontos: Record<string, PontoControle>;
  eventos: WorldEvent[];
  limiteIa: LimiteIaDia;
}

export interface TrocaDeDono {
  ponto: string;
  de: Dono;
  para: Lado;
}

const DIA_MS = 86_400_000;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
export const clonar = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Duração do tick de facção em minutos (PQP_TICK_FACCAO_MIN; inválido = faction_ai.json cicloProducaoMin). */
export function tickFaccaoMin(env?: string | number | null): number {
  const n = typeof env === 'number' ? env : env ? Number(env) : NaN;
  if (Number.isFinite(n) && n > 0) return n;
  return getData().factionAi.regras.decisao.cicloProducaoMin;
}

const limiteVazio = (dia: number): LimiteIaDia => ({
  dia,
  esquerda: { total: 0, porRegiao: {}, ataques: 0 },
  direita: { total: 0, porRegiao: {}, ataques: 0 },
});

/** Regiões do piloto (as que têm ponto de controle no piloto ou estão em emPiloto). */
export function regioesDoPiloto(): string[] {
  return getData().regions.regioes.filter((r) => r.emPiloto).map((r) => r.id);
}

/** Estado inicial, com os medidores de regions.json e os pontos de structures.json (só os do piloto). */
export function novoEstadoFaccao(now: number, tickMin = tickFaccaoMin()): EstadoFaccao {
  const d = getData();
  const regioes: Record<string, RegiaoFaccao> = {};
  for (const r of d.regions.regioes) {
    if (!r.emPiloto) continue;
    const m = r.medidores;
    regioes[r.id] = { energia: m.energia, poluicao: m.poluicao, opiniao: m.opiniaoPublica, precoDeVida: m.precoDeVida, influencia: { esquerda: m.influencia.esquerda, direita: m.influencia.direita } };
  }
  const pontos: Record<string, PontoControle> = {};
  for (const s of d.structures.instancias) {
    if (s.estrutura !== 'posto_de_controle' || !s.emPiloto || !regioes[s.regiao]) continue;
    const reg = regioes[s.regiao]!;
    const dono: Dono = s.margem === 'esquerda' || s.margem === 'direita' ? s.margem : 'neutra';
    pontos[s.id] = { id: s.id, regiao: s.regiao, dono, influencia: { ...reg.influencia }, estoque: 0, produzidoNoCiclo: 0, saqueadoNoCiclo: 0 };
  }
  const tickMs = Math.max(1, Math.round(tickMin * 60_000));
  return { versao: 1, ciclo: 0, proximoTickEm: now + tickMs, tickMs, agora: now, seqEvento: 0, regioes, pontos, eventos: [], limiteIa: limiteVazio(Math.floor(now / DIA_MS)) };
}

/** Lê um estado salvo (tolerante); sem nada, um novo. Pontos e regiões novos dos dados entram. */
export function migrarEstadoFaccao(raw: unknown, now: number, tickMin = tickFaccaoMin()): EstadoFaccao {
  const base = novoEstadoFaccao(now, tickMin);
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Partial<EstadoFaccao>;
  return {
    ...base,
    ciclo: typeof r.ciclo === 'number' ? r.ciclo : 0,
    proximoTickEm: typeof r.proximoTickEm === 'number' ? r.proximoTickEm : base.proximoTickEm,
    agora: typeof r.agora === 'number' ? r.agora : now,
    seqEvento: typeof r.seqEvento === 'number' ? r.seqEvento : 0,
    regioes: { ...base.regioes, ...(r.regioes ?? {}) },
    pontos: { ...base.pontos, ...(r.pontos ?? {}) },
    eventos: Array.isArray(r.eventos) ? r.eventos.slice(-EVENTOS_GUARDADOS) : [],
    limiteIa: r.limiteIa && typeof r.limiteIa.dia === 'number' ? r.limiteIa : base.limiteIa,
  };
}

// ---------------------------------------------------------------------------
// eventos do mapa

const NOME_MARGEM: Record<Lado, string> = { esquerda: 'Esquerda', direita: 'Direita' };

export function nomeDoPonto(id: string): string {
  return getData().structures.instancias.find((s) => s.id === id)?.name ?? id;
}
export function nomeDaRegiao(id: string): string {
  return getData().regionsById.get(id)?.name ?? id;
}

/** Cria e guarda um aviso do mapa (mexe no estado passado; uso interno das funções que já clonaram). */
export function registrarEvento(e: EstadoFaccao, ev: Omit<WorldEvent, 'id' | 'ciclo' | 'em'>): WorldEvent {
  e.seqEvento += 1;
  const w: WorldEvent = { id: `we_${e.ciclo}_${e.seqEvento}`, ciclo: e.ciclo, em: e.agora, ...ev };
  e.eventos.push(w);
  if (e.eventos.length > EVENTOS_GUARDADOS) e.eventos.splice(0, e.eventos.length - EVENTOS_GUARDADOS);
  return w;
}

// SUGESTÃO: textos de troca de dono
const TEXTO_TROCA: Record<Lado, string[]> = {
  esquerda: ['{ponto} agora é das Raízes. A primeira medida foi marcar uma reunião.', '{ponto} virou da Esquerda. A guarita já tem lista de presença.'],
  direita: ['{ponto} agora é do Consórcio. Já instalaram catraca.', '{ponto} virou da Direita. Bem-vindo à família. A mensalidade vence dia 5.'],
};

// ---------------------------------------------------------------------------
// influência

/** Soma `qtd` à margem e tira da outra o que passar de 100. Devolve quanto somou de fato. */
function empurrar(inf: Influencia, lado: Lado, qtd: number): number {
  const antes = inf[lado];
  inf[lado] = clamp(inf[lado] + qtd, 0, 100);
  const o = outroLado(lado);
  if (inf.esquerda + inf.direita > 100) inf[o] = Math.max(0, 100 - inf[lado]);
  inf.esquerda = r2(inf.esquerda);
  inf.direita = r2(inf.direita);
  return inf[lado] - antes;
}

/** Confere se o ponto muda de dono. */
function conferirDono(e: EstadoFaccao, p: PontoControle, out: TrocaDeDono[], eventos: WorldEvent[], textoIdx = 0): void {
  for (const l of LADOS) {
    if (p.dono === l) continue;
    const dono = p.dono;
    const doDono = dono === 'neutra' ? 0 : p.influencia[dono];
    if (p.influencia[l] >= LIMIAR_DONO && p.influencia[l] > doDono) {
      out.push({ ponto: p.id, de: dono, para: l });
      p.dono = l;
      p.estoque = 0; // SUGESTÃO: o estoque some na troca (cada margem leva o seu)
      p.produzidoNoCiclo = 0;
      p.saqueadoNoCiclo = 0;
      const t = TEXTO_TROCA[l];
      eventos.push(registrarEvento(e, { tipo: 'troca_de_dono', lado: l, ponto: p.id, regiao: p.regiao, texto: t[textoIdx % t.length]!.replace('{ponto}', nomeDoPonto(p.id)), sugestao: true }));
      return;
    }
  }
}

export interface SomaResult {
  estado: EstadoFaccao;
  /** influência somada em cada ponto */
  somado: Record<string, number>;
  trocas: TrocaDeDono[];
  eventos: WorldEvent[];
}

/** Mexe no estado passado (uso interno da IA, que já clonou). */
export function somarInfluenciaMut(e: EstadoFaccao, ev: EventoInfluencia): Omit<SomaResult, 'estado'> {
  const out: Omit<SomaResult, 'estado'> = { somado: {}, trocas: [], eventos: [] };
  const reg = e.regioes[ev.regiao];
  if (!reg) return out;
  const qtd = Math.max(0, ev.qtd ?? 1);
  let pts = (ev.fonte === 'comercio' ? qtd / 100 : qtd) * INFLUENCIA_POR_FONTE[ev.fonte];
  if (ev.fonte !== 'ia') pts = Math.min(pts, INFLUENCIA_MAX_POR_EVENTO);
  else {
    // limite diário da IA (faction_ai.json regras.limiteDiario)
    const L = getData().factionAi.regras.limiteDiario;
    const dia = Math.floor(e.agora / DIA_MS);
    if (e.limiteIa.dia !== dia) e.limiteIa = limiteVazio(dia);
    const lim = e.limiteIa[ev.lado];
    const jaRegiao = lim.porRegiao[ev.regiao] ?? 0;
    pts = Math.max(0, Math.min(pts, L.influenciaPorRegiao - jaRegiao, L.influenciaTotal - lim.total));
    lim.porRegiao[ev.regiao] = jaRegiao + pts;
    lim.total += pts;
  }
  if (pts <= 0) return out;
  const alvos = Object.values(e.pontos).filter((p) => p.regiao === ev.regiao && (!ev.ponto || p.id === ev.ponto));
  if (ev.ponto && alvos.length === 0) return out;
  empurrar(reg.influencia, ev.lado, pts);
  for (const p of alvos) {
    out.somado[p.id] = r2(empurrar(p.influencia, ev.lado, pts));
    // SUGESTÃO: só a IA (dentro do tick) vira o ponto na hora; a dos jogadores espera o tick de facção
    if (ev.fonte === 'ia') conferirDono(e, p, out.trocas, out.eventos, e.seqEvento);
  }
  return out;
}

/**
 * Tick de facção: vira os pontos em que a influência acumulada (dos jogadores) passou do limite e da
 * do dono. Mexe no estado passado; devolve as trocas e os avisos do mapa.
 */
export function consolidarDonosMut(e: EstadoFaccao): { trocas: TrocaDeDono[]; eventos: WorldEvent[] } {
  const out = { trocas: [] as TrocaDeDono[], eventos: [] as WorldEvent[] };
  for (const p of Object.values(e.pontos).sort((a, b) => (a.id < b.id ? -1 : 1))) conferirDono(e, p, out.trocas, out.eventos, e.seqEvento);
  return out;
}

/** consolidarDonosMut sem mexer no estado recebido. */
export function consolidarDonos(estado: EstadoFaccao): SomaResult {
  const e = clonar(estado);
  return { estado: e, somado: {}, ...consolidarDonosMut(e) };
}

/** Soma influência de uma ação (de jogador ou da IA). Não mexe no estado recebido. */
export function somarInfluencia(estado: EstadoFaccao, evento: EventoInfluencia): SomaResult {
  const e = clonar(estado);
  return { estado: e, ...somarInfluenciaMut(e, evento) };
}

/** Dono de cada ponto. */
export const donosDosPontos = (e: EstadoFaccao): Record<string, Dono> => Object.fromEntries(Object.values(e.pontos).map((p) => [p.id, p.dono]));

// ---------------------------------------------------------------------------
// bônus do dono, produção e saque

export interface BonusDono {
  /** % a mais na produção das estruturas da margem na região */
  producaoPct: number;
  /** % no preço das lojas da região para quem é da margem (negativo = desconto) */
  precoPct: number;
  pontos: number;
}

/** Bônus da margem numa região pelos pontos que ela tem ali. */
export function bonusDoDono(e: EstadoFaccao, lado: Lado, regiao: string): BonusDono {
  const n = Object.values(e.pontos).filter((p) => p.regiao === regiao && p.dono === lado).length;
  return {
    pontos: n,
    producaoPct: Math.min(BONUS_DONO.maxProducaoPct, n * BONUS_DONO.producaoPct),
    precoPct: n ? Math.max(BONUS_DONO.minPrecoPct, n * BONUS_DONO.precoPct) : 0,
  };
}

/** Produção de um tick em cada ponto com dono (mexe no estado passado). */
export function produzirPontosMut(e: EstadoFaccao): void {
  const infTick = getData().structureKindsById.get('posto_de_controle')?.efeito?.influenciaPorTick ?? 1;
  for (const p of Object.values(e.pontos)) {
    p.saqueadoNoCiclo = 0;
    if (p.dono === 'neutra') {
      p.produzidoNoCiclo = 0;
      continue;
    }
    const b = bonusDoDono(e, p.dono, p.regiao);
    const q = Math.round(PRODUCAO_PONTO_POR_TICK * (1 + b.producaoPct / 100));
    p.produzidoNoCiclo = q;
    p.estoque += q;
    // o posto marca quem manda: +influenciaPorTick para o dono (structures.json)
    empurrar(p.influencia, p.dono, typeof infTick === 'number' ? infTick : 1);
  }
}

/** % máximo de saque do que o ponto produziu no ciclo (structures.json regras.saqueMaxPct). */
export const saqueMaxPct = (): number => getData().structures.regras.saqueMaxPct;

/** Quanto ainda dá para saquear do ponto neste ciclo. */
export function saqueDisponivel(e: EstadoFaccao, pontoId: string): number {
  const p = e.pontos[pontoId];
  if (!p) return 0;
  const max = Math.floor((p.produzidoNoCiclo * saqueMaxPct()) / 100);
  return Math.max(0, Math.min(p.estoque, max - p.saqueadoNoCiclo));
}

export interface SaqueResult {
  estado: EstadoFaccao;
  levou: number;
  erro?: string;
  evento?: WorldEvent;
}

/** Saque de um ponto por quem não é o dono: no máximo 20% do que o ponto produziu no ciclo. */
export function saquearPonto(estado: EstadoFaccao, pontoId: string, lado: Lado, pedido: number): SaqueResult {
  const e = clonar(estado);
  const p = e.pontos[pontoId];
  if (!p) return { estado: e, levou: 0, erro: 'Ponto não existe.' };
  if (p.dono === lado) return { estado: e, levou: 0, erro: 'Saquear o próprio ponto é só desvio de verba.' }; // SUGESTÃO
  if (p.dono === 'neutra') return { estado: e, levou: 0, erro: 'Ponto sem dono não tem estoque.' };
  const levou = Math.max(0, Math.min(Math.floor(pedido), saqueDisponivel(e, pontoId)));
  if (levou <= 0) return { estado: e, levou: 0, erro: 'Já levaram o que dava neste ciclo.' };
  p.estoque -= levou;
  p.saqueadoNoCiclo += levou;
  const evento = registrarEvento(e, { tipo: 'saque', lado, ponto: p.id, regiao: p.regiao, texto: `Saque no ${nomeDoPonto(p.id)}: sumiram ${levou} do estoque. A ${NOME_MARGEM[p.dono]} culpa a ${NOME_MARGEM[lado]}.`, sugestao: true });
  return { estado: e, levou, evento };
}

// ---------------------------------------------------------------------------
// medidores: apagão, combate e cidade

/** Limiares de energia do combate (balance.json encantoMaquina). */
function limiares(): { comEnergiaMin: number; apagaoMax: number; polMax: number } {
  const em = getData().balance.encantoMaquina;
  return { comEnergiaMin: em.limiaresEnergia.comEnergiaMin, apagaoMax: em.limiaresEnergia.apagaoMax, polMax: em.escalaPoluicao.max };
}

export const emApagao = (r: RegiaoFaccao): boolean => r.energia <= limiares().apagaoMax;
export const comEnergia = (r: RegiaoFaccao): boolean => r.energia >= limiares().comEnergiaMin;
/** Poluição inteira na escala do combate (0 a escalaPoluicao.max). */
export const poluicaoPontos = (r: RegiaoFaccao): number => clamp(Math.round(r.poluicao), 0, limiares().polMax);

/**
 * O que o combate lê em World.regionState (sim/combat.ts marginPct):
 * Direita +10% com energia e -20% no apagão; Esquerda +10% com poluição 0 e -10% por ponto;
 * natureza e cidade vêm do id da região (balance.json encantoMaquina).
 */
export function regionStateParaCombate(e: EstadoFaccao): Record<string, { energia: boolean; apagao: boolean; poluicao: number }> {
  const out: Record<string, { energia: boolean; apagao: boolean; poluicao: number }> = {};
  for (const [id, r] of Object.entries(e.regioes)) out[id] = { energia: comEnergia(r), apagao: emApagao(r), poluicao: poluicaoPontos(r) };
  return out;
}

/** Medidores que a cidade (city.ts, MedidoresCidade) e o câmbio leem. */
export function medidoresCidadeDaFaccao(e: EstadoFaccao): MedidoresCidade {
  const me = e.regioes.margem_esquerda;
  const md = e.regioes.margem_direita;
  const out: MedidoresCidade = {};
  if (me) {
    out.influenciaEsq = me.influencia.esquerda;
    out.precoDeVidaEsq = me.precoDeVida;
  }
  if (md) {
    out.energiaDir = md.energia;
    out.precoDeVidaDir = md.precoDeVida;
    out.apagaoDir = emApagao(md);
  }
  return out;
}

/** Passa os medidores da facção para a cidade (mexe só em cidade.medidores, sem apagar o resto). */
export function aplicarFaccaoNaCidade(cidade: { medidores: MedidoresCidade }, e: EstadoFaccao): void {
  Object.assign(cidade.medidores, medidoresCidadeDaFaccao(e));
}

/** Muda um medidor de região (mexe no estado passado), dentro das faixas de regions.json. */
export function ajustarMedidorMut(e: EstadoFaccao, regiao: string, campo: 'energia' | 'poluicao' | 'opiniao' | 'precoDeVida', delta: number): void {
  const r = e.regioes[regiao];
  if (!r) return;
  const polMax = getData().regions.escalas.poluicaoMax;
  if (campo === 'energia') r.energia = r2(clamp(r.energia + delta, 0, 100));
  else if (campo === 'poluicao') r.poluicao = r2(clamp(r.poluicao + delta, 0, polMax));
  else if (campo === 'opiniao') r.opiniao = r2(clamp(r.opiniao + delta, -100, 100));
  else r.precoDeVida = r2(clamp(r.precoDeVida + delta, 50, 300));
}

/** Volta natural dos medidores a cada tick: energia anda para o valor dos dados, poluição cai. */
export function derivaMedidoresMut(e: EstadoFaccao): void {
  const d = getData();
  const cai = d.structures.regras.poluicaoCaiPorTick;
  for (const [id, r] of Object.entries(e.regioes)) {
    const base = d.regionsById.get(id)?.medidores.energia ?? r.energia;
    const dif = base - r.energia;
    r.energia = r2(r.energia + clamp(dif, -ENERGIA_VOLTA_POR_TICK, ENERGIA_VOLTA_POR_TICK));
    r.poluicao = r2(Math.max(0, r.poluicao - cai));
  }
}
