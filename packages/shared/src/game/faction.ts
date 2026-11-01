/**
 * Fase 5: IA de facção. No piloto, Lazzaro Prati comanda a Esquerda (agressivo) e Rolf Halvorsen
 * comanda a Direita (defensivo), como em faction_ai.json `piloto.comando` e Narrativa.md.
 *
 * tickFaccao(estado, now, rng) roda a cada ciclo de produção (faction_ai.json cicloProducaoMin, 60 min;
 * PQP_TICK_FACCAO_MIN muda): os medidores voltam aos poucos, os pontos produzem, e cada líder avalia o
 * estado (influência, energia, poluição, apagão, opinião, preço de vida) e escolhe `acoesPorCiclo`
 * ações por sorteio ponderado com o RNG recebido. Cada ação vira um world_event (aviso no mapa).
 *
 * Peso de cada ação (faction_ai.json regras.decisao.formula):
 *   max sobre as ações dos dados ligadas a ela de clamp(pesosBase + ajustes, 0, 10)
 *   × prioridade da semana do perfil × evitaMult se o perfil evita × necessidade(estado, 0,5 a 2).
 * As 6 ações do piloto e o mapa delas para as ações dos dados são // SUGESTÃO.
 */
import { getData } from '../data';
import type { Rng } from '../sim/types';
import {
  LIMIAR_DONO,
  LADOS,
  ajustarMedidorMut,
  clonar,
  comEnergia,
  consolidarDonosMut,
  derivaMedidoresMut,
  emApagao,
  nomeDaRegiao,
  nomeDoPonto,
  outroLado,
  produzirPontosMut,
  registrarEvento,
  somarInfluenciaMut,
  type EstadoFaccao,
  type Lado,
  type TrocaDeDono,
  type WorldEvent,
} from './influence';

export const ACOES_FACCAO = ['campanha', 'investimento', 'patrulha', 'propaganda', 'aumentar_preco', 'mutirao'] as const;
export type AcaoFaccao = (typeof ACOES_FACCAO)[number];

/** Ações dos dados (faction_ai.json acoes) por trás de cada ação do piloto. // SUGESTÃO */
export const ACOES_DOS_DADOS: Record<AcaoFaccao, Record<Lado, string[]>> = {
  campanha: { esquerda: ['invadir', 'emboscada'], direita: ['invadir', 'emboscada'] },
  investimento: { esquerda: ['energia_limpa'], direita: ['construir', 'energia_limpa'] },
  patrulha: { esquerda: ['reforcar', 'deposito'], direita: ['reforcar', 'deposito'] },
  propaganda: { esquerda: ['cartaz', 'radio', 'boato'], direita: ['cartaz', 'radio', 'boato'] },
  // preço dinâmico é coisa da Direita; mutirão, da Esquerda
  aumentar_preco: { esquerda: [], direita: ['comercio'] },
  mutirao: { esquerda: ['construir'], direita: [] },
};

/** Região de casa de cada margem. */
export const CASA: Record<Lado, string> = { esquerda: 'margem_esquerda', direita: 'margem_direita' };

/** Números dos efeitos. // SUGESTÃO */
export const EFEITOS = {
  campanhaInfluencia: 6,
  patrulhaInfluencia: 4,
  propagandaOpiniao: 5,
  propagandaInfluencia: 2,
  investimentoEnergiaDir: 20,
  investimentoPoluicaoDir: 1,
  investimentoPoluicaoRio: 0.5,
  investimentoEnergiaEsq: 5,
  investimentoPoluicaoEsq: -1,
  aumentarPrecoPct: 5,
  aumentarPrecoOpiniao: 2,
  mutiraoPreco: -3,
  mutiraoEnergia: 3,
  mutiraoOpiniao: 3,
  /** ponto da margem com a outra a esta distância do limite está ameaçado */
  ameacaFolga: 15,
  /** no máximo de ticks por chamada; depois só alinha o relógio */
  ticksMaxPorChamada: 24,
} as const;

/** Prioridade da semana pelo perfil (faction_ai.json regras.decisao.descricao). */
const PRIORIDADE_DO_PERFIL: Record<string, string> = { agressivo: 'invadir', defensivo: 'defender', construtor: 'construir' };

export interface Lider {
  id: string;
  name: string;
  lado: Lado;
  perfil: string;
}

/** Quem comanda a margem no piloto. */
export function liderDe(lado: Lado): Lider {
  const d = getData();
  const id = d.factionAi.piloto.comando[lado];
  const p = d.factionCharactersById.get(id);
  return { id, name: p?.name ?? id, lado, perfil: p?.perfil ?? 'defensivo' };
}

// ---------------------------------------------------------------------------
// avaliação do estado

export interface Avaliacao {
  lado: Lado;
  casa: string;
  energiaCasa: number;
  apagaoCasa: boolean;
  comEnergiaCasa: boolean;
  poluicaoCasa: number;
  /** opinião do ponto de vista da margem (positivo = a favor dela) */
  opiniaoCasa: number;
  precoCasa: number;
  /** ponto que não é da margem onde ela está mais forte */
  alvo?: { ponto: string; regiao: string; parcela: number };
  /** ponto da margem onde a outra está mais perto do limite */
  ameacado?: { ponto: string; regiao: string; outro: number };
  /** apagão em alguma região da outra margem (dá discurso) */
  apagaoNoOutro: boolean;
  ataquesHoje: number;
}

export function avaliar(e: EstadoFaccao, lado: Lado): Avaliacao {
  const casa = CASA[lado];
  const rc = e.regioes[casa];
  const outro = outroLado(lado);
  const pontos = Object.values(e.pontos).sort((a, b) => (a.id < b.id ? -1 : 1));
  let alvo: Avaliacao['alvo'];
  let ameacado: Avaliacao['ameacado'];
  for (const p of pontos) {
    if (p.dono !== lado) {
      const tot = p.influencia.esquerda + p.influencia.direita;
      const parcela = tot > 0 ? p.influencia[lado] / tot : 0.5;
      if (!alvo || parcela > alvo.parcela) alvo = { ponto: p.id, regiao: p.regiao, parcela };
    } else if (!ameacado || p.influencia[outro] > ameacado.outro) ameacado = { ponto: p.id, regiao: p.regiao, outro: p.influencia[outro] };
  }
  const regOutro = e.regioes[CASA[outro]];
  return {
    lado,
    casa,
    energiaCasa: rc?.energia ?? 50,
    apagaoCasa: rc ? emApagao(rc) : false,
    comEnergiaCasa: rc ? comEnergia(rc) : true,
    poluicaoCasa: rc?.poluicao ?? 0,
    opiniaoCasa: rc ? (lado === 'esquerda' ? rc.opiniao : -rc.opiniao) : 0,
    precoCasa: rc?.precoDeVida ?? 100,
    ...(alvo ? { alvo } : {}),
    ...(ameacado ? { ameacado } : {}),
    apagaoNoOutro: regOutro ? emApagao(regOutro) : false,
    ataquesHoje: e.limiteIa[lado].ataques,
  };
}

/** Necessidade de cada ação pelo estado, de 0,5 a 2 (0 = não dá para fazer). // SUGESTÃO */
export function necessidade(a: AcaoFaccao, av: Avaliacao): number {
  const L = getData().factionAi.regras.limiteDiario;
  switch (a) {
    case 'campanha':
      if (!av.alvo || av.ataquesHoje >= L.ataques) return 0;
      return av.alvo.parcela >= 0.45 ? 1.5 : 1;
    case 'patrulha':
      return av.ameacado && av.ameacado.outro >= LIMIAR_DONO - EFEITOS.ameacaFolga ? 2 : 1;
    case 'propaganda':
      return av.opiniaoCasa < 20 || av.apagaoNoOutro ? 2 : 1;
    case 'investimento':
      if (av.lado === 'direita') return av.apagaoCasa ? 2 : av.comEnergiaCasa ? 0.5 : 1.5;
      return av.poluicaoCasa > 0 ? Math.min(2, 1 + 0.25 * av.poluicaoCasa) : 0.5;
    case 'aumentar_preco':
      // preço dinâmico: a crise é a melhor hora para reajustar
      if (av.lado !== 'direita') return 0;
      return av.apagaoCasa ? 2 : av.precoCasa >= 160 ? 0.5 : 1;
    case 'mutirao':
      if (av.lado !== 'esquerda') return 0;
      return av.precoCasa > 100 || av.energiaCasa < 50 ? 1.5 : 1;
  }
}

/** Peso de cada ação para o líder da margem neste estado. */
export function pesosDaFaccao(e: EstadoFaccao, lado: Lado): Record<AcaoFaccao, number> {
  const d = getData();
  const lider = liderDe(lado);
  const pers = d.factionCharactersById.get(lider.id);
  const perfil = d.factionAi.perfis.find((p) => p.id === lider.perfil);
  const dec = d.factionAi.regras.decisao;
  const prio = (dec.prioridadeDaSemana as Record<string, { acoes: string[]; mult: number }>)[PRIORIDADE_DO_PERFIL[lider.perfil] ?? ''];
  const fora = new Set<string>(d.factionAi.acoes.filter((a) => a.foraDoPiloto).map((a) => a.id));
  const ajustes = (pers?.ajustes ?? {}) as Record<string, number>;
  const base = (perfil?.pesosBase ?? {}) as Record<string, number>;
  const evita = new Set<string>(perfil?.acoesEvita ?? []);
  const av = avaliar(e, lado);
  const out = {} as Record<AcaoFaccao, number>;
  for (const a of ACOES_FACCAO) {
    let w = 0;
    for (const id of ACOES_DOS_DADOS[a][lado]) {
      if (fora.has(id)) continue;
      let p = Math.max(0, Math.min(10, (base[id] ?? 0) + (ajustes[id] ?? 0)));
      if (prio?.acoes.includes(id)) p *= prio.mult;
      if (evita.has(id)) p *= dec.evitaMult;
      w = Math.max(w, p);
    }
    out[a] = w * necessidade(a, av);
  }
  // Rolf Halvorsen: só ataca com certeza (força da Direita acima de vantagemMin no alvo); abaixo, reforça
  const esp = pers?.especial as { gancho?: string; params?: Record<string, number> } | undefined;
  if (esp?.gancho === 'so_ataca_com_certeza') {
    const min = esp.params?.vantagemMin ?? 0.8;
    if (!av.alvo || av.alvo.parcela < min) out.campanha = 0;
  }
  // Lazzaro Prati (engaveta_na_comissao) nunca escolhe trégua: o piloto não tem trégua nas ações.
  return out;
}

/** Sorteio ponderado sem repetição. */
function sortear(pesos: Record<AcaoFaccao, number>, n: number, rng: Rng): AcaoFaccao[] {
  const rest = ACOES_FACCAO.filter((a) => pesos[a] > 0);
  const out: AcaoFaccao[] = [];
  while (out.length < n && rest.length) {
    const tot = rest.reduce((s, a) => s + pesos[a], 0);
    let x = rng.next() * tot;
    let i = 0;
    for (; i < rest.length - 1; i++) {
      x -= pesos[rest[i]!];
      if (x < 0) break;
    }
    out.push(rest[i]!);
    rest.splice(i, 1);
  }
  return out;
}

/** Ações que o líder da margem escolhe neste estado (acoesPorCiclo, sem repetir). */
export function decidirLider(e: EstadoFaccao, lado: Lado, rng: Rng): AcaoFaccao[] {
  return sortear(pesosDaFaccao(e, lado), getData().factionAi.regras.decisao.acoesPorCiclo, rng);
}

// ---------------------------------------------------------------------------
// textos dos avisos do mapa // SUGESTÃO: todos, menos os da rádio e dos cartazes (faction_ai.json frases)

const TEXTOS: Record<Exclude<AcaoFaccao, 'propaganda'>, Partial<Record<Lado, string[]>>> = {
  campanha: {
    esquerda: ['Lazzaro Prati mandou a Brigada para o {ponto}. A ata da operação fica para depois.', 'Ofensiva no {ponto}. A comissão foi avisada. A comissão nunca leu.'],
    direita: ['A PM ocupou o {ponto} com 98% de certeza. Os outros 2% viraram relatório.', 'Operação no {ponto}: firma reconhecida, avanço autorizado.'],
  },
  patrulha: {
    esquerda: ['Vigília dobrada no {ponto}. O vizinho fiscal agradece e anota quem faltou.', 'Guarita reforçada no {ponto}. Turno voluntário e obrigatório.'],
    direita: ['Viatura parada no {ponto}. Proteção 24 horas para quem pagou as 24.', 'Rolf Halvorsen reforçou o {ponto}. Atacar? Talvez no próximo trimestre.'],
  },
  investimento: {
    esquerda: ['Painel solar novo em {regiao}. A fila da tomada já tem regimento interno.', 'Mutirão limpou um trecho do rio em {regiao}. O peixe voltou desconfiado.'],
    direita: ['Gerador novo em {regiao}: mais luz, mais fumaça, mais boleto.', 'A Sahl Energia acendeu {regiao}. O rio ganhou cor de patrocínio.'],
  },
  aumentar_preco: {
    direita: ['Preço dinâmico ativado: a vida na {regiao} subiu {n}%. Obrigado por fazer parte da família.', 'Reajuste surpresa no app da {regiao}. Surpresa só para você.'],
  },
  mutirao: {
    esquerda: ['Mutirão na {regiao}: parede nova, sopa grátis e três horas de assembleia.', 'Casa de mutirão entregue na {regiao}. Você subiu uma posição na lista. Talvez.'],
  },
};

function textoPropaganda(lado: Lado, rng: Rng): string {
  const lider = liderDe(lado);
  const perfil = getData().factionAi.perfis.find((p) => p.id === lider.perfil);
  const fr = perfil?.frases as Record<string, Record<Lado, string[]>> | undefined;
  const meio = rng.next() < 0.5 ? 'radio' : 'cartaz';
  const lista = fr?.[meio]?.[lado] ?? [];
  const frase = lista.length ? rng.pick(lista) : 'Ouça a margem.';
  const quem = meio === 'radio' ? (lado === 'esquerda' ? 'Rádio do Povo' : 'Telões da Agência') : lado === 'esquerda' ? 'Cartaz da Assembleia' : 'Cartaz do Consórcio';
  return `${quem}: "${frase}"`;
}

function texto(a: AcaoFaccao, lado: Lado, rng: Rng, vars: Record<string, string | number>): string {
  if (a === 'propaganda') return textoPropaganda(lado, rng);
  const lista = TEXTOS[a][lado] ?? ['{regiao} mexeu.'];
  let t = rng.pick(lista);
  for (const [k, v] of Object.entries(vars)) t = t.split(`{${k}}`).join(String(v));
  return t;
}

// ---------------------------------------------------------------------------
// efeitos

export interface DecisaoFaccao {
  lado: Lado;
  lider: string;
  acao: AcaoFaccao;
  regiao?: string;
  ponto?: string;
}

/** Aplica uma ação no estado passado (mexe nele). */
export function aplicarAcaoMut(e: EstadoFaccao, lado: Lado, a: AcaoFaccao, rng: Rng): { decisao: DecisaoFaccao; eventos: WorldEvent[]; trocas: TrocaDeDono[] } {
  const lider = liderDe(lado);
  const av = avaliar(e, lado);
  const casa = CASA[lado];
  const trocas: TrocaDeDono[] = [];
  const evs: WorldEvent[] = [];
  let regiao: string | undefined = casa;
  let ponto: string | undefined;
  const somar = (reg: string, qtd: number, pt?: string) => {
    const r = somarInfluenciaMut(e, { fonte: 'ia', lado, regiao: reg, qtd, ...(pt ? { ponto: pt } : {}) });
    trocas.push(...r.trocas);
    evs.push(...r.eventos);
  };
  const vars: Record<string, string | number> = {};
  switch (a) {
    case 'campanha': {
      if (av.alvo) {
        regiao = av.alvo.regiao;
        ponto = av.alvo.ponto;
        e.limiteIa[lado].ataques += 1;
        somar(regiao, EFEITOS.campanhaInfluencia, ponto);
      }
      break;
    }
    case 'patrulha': {
      const p = av.ameacado;
      if (p) {
        regiao = p.regiao;
        ponto = p.ponto;
        somar(regiao, EFEITOS.patrulhaInfluencia, ponto);
      }
      break;
    }
    case 'propaganda': {
      ajustarMedidorMut(e, casa, 'opiniao', lado === 'esquerda' ? EFEITOS.propagandaOpiniao : -EFEITOS.propagandaOpiniao);
      if (av.alvo) {
        regiao = av.alvo.regiao;
        ajustarMedidorMut(e, regiao, 'opiniao', lado === 'esquerda' ? EFEITOS.propagandaOpiniao : -EFEITOS.propagandaOpiniao);
        somar(regiao, EFEITOS.propagandaInfluencia);
      }
      break;
    }
    case 'investimento': {
      if (lado === 'direita') {
        ajustarMedidorMut(e, casa, 'energia', EFEITOS.investimentoEnergiaDir);
        ajustarMedidorMut(e, casa, 'poluicao', EFEITOS.investimentoPoluicaoDir);
        ajustarMedidorMut(e, 'usina_da_ponte', 'poluicao', EFEITOS.investimentoPoluicaoRio);
      } else {
        // energia limpa onde a poluição está pior (entre a casa e as regiões neutras do piloto)
        const cands = Object.entries(e.regioes)
          .filter(([id]) => id === casa || getData().regionsById.get(id)?.margemDona === 'neutra')
          .sort((x, y) => y[1].poluicao - x[1].poluicao || (x[0] < y[0] ? -1 : 1));
        regiao = cands[0]?.[0] ?? casa;
        ajustarMedidorMut(e, regiao, 'poluicao', EFEITOS.investimentoPoluicaoEsq);
        ajustarMedidorMut(e, casa, 'energia', EFEITOS.investimentoEnergiaEsq);
      }
      break;
    }
    case 'aumentar_preco': {
      ajustarMedidorMut(e, casa, 'precoDeVida', EFEITOS.aumentarPrecoPct);
      ajustarMedidorMut(e, casa, 'opiniao', EFEITOS.aumentarPrecoOpiniao);
      vars.n = EFEITOS.aumentarPrecoPct;
      break;
    }
    case 'mutirao': {
      ajustarMedidorMut(e, casa, 'precoDeVida', EFEITOS.mutiraoPreco);
      ajustarMedidorMut(e, casa, 'energia', EFEITOS.mutiraoEnergia);
      ajustarMedidorMut(e, casa, 'opiniao', EFEITOS.mutiraoOpiniao);
      break;
    }
  }
  vars.regiao = regiao ? nomeDaRegiao(regiao) : '';
  vars.ponto = ponto ? nomeDoPonto(ponto) : vars.regiao;
  const ev = registrarEvento(e, { tipo: 'acao_ia', lado, lider: lider.id, acao: a, ...(regiao ? { regiao } : {}), ...(ponto ? { ponto } : {}), texto: texto(a, lado, rng, vars), sugestao: true });
  return { decisao: { lado, lider: lider.id, acao: a, ...(regiao ? { regiao } : {}), ...(ponto ? { ponto } : {}) }, eventos: [ev, ...evs], trocas };
}

// SUGESTÃO: avisos de apagão
const TEXTO_APAGAO: Record<'direita' | 'outra', string> = {
  direita: 'Apagão em {regiao}. O Consórcio pede desculpas e cobra a taxa de religação.',
  outra: 'Apagão em {regiao}. A Rádio do Povo já culpou a Direita; a Direita culpou a chuva.',
};

// ---------------------------------------------------------------------------
// tick

export interface TickFaccaoResult {
  estado: EstadoFaccao;
  /** ticks de facção que rodaram nesta chamada */
  ticks: number;
  decisoes: DecisaoFaccao[];
  /** avisos novos para o mapa (e para a tabela world_event) */
  eventos: WorldEvent[];
  trocas: TrocaDeDono[];
}

/** Um tick de facção (mexe no estado passado). */
export function rodarTickMut(e: EstadoFaccao, rng: Rng): Omit<TickFaccaoResult, 'estado' | 'ticks'> {
  const out: Omit<TickFaccaoResult, 'estado' | 'ticks'> = { decisoes: [], eventos: [], trocas: [] };
  e.ciclo += 1;
  const apagaoAntes = new Set(Object.entries(e.regioes).filter(([, r]) => emApagao(r)).map(([id]) => id));
  // a influência dos jogadores no ciclo que passou vira os pontos antes de os líderes decidirem
  const c = consolidarDonosMut(e);
  out.trocas.push(...c.trocas);
  out.eventos.push(...c.eventos);
  derivaMedidoresMut(e);
  produzirPontosMut(e);
  for (const lado of LADOS) {
    for (const a of decidirLider(e, lado, rng)) {
      const r = aplicarAcaoMut(e, lado, a, rng);
      out.decisoes.push(r.decisao);
      out.eventos.push(...r.eventos);
      out.trocas.push(...r.trocas);
    }
  }
  for (const [id, r] of Object.entries(e.regioes).sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    if (!emApagao(r) || apagaoAntes.has(id)) continue;
    const dona = getData().regionsById.get(id)?.margemDona;
    const t = (dona === 'direita' ? TEXTO_APAGAO.direita : TEXTO_APAGAO.outra).replace('{regiao}', nomeDaRegiao(id));
    out.eventos.push(registrarEvento(e, { tipo: 'apagao', regiao: id, texto: t, sugestao: true }));
  }
  return out;
}

/**
 * Tick de facção: roda os ciclos vencidos até `now` (no máximo EFEITOS.ticksMaxPorChamada; o resto só
 * alinha o relógio). Determinístico pela semente do rng. Não mexe no estado recebido.
 */
export function tickFaccao(estado: EstadoFaccao, now: number, rng: Rng): TickFaccaoResult {
  const e = clonar(estado);
  const out: TickFaccaoResult = { estado: e, ticks: 0, decisoes: [], eventos: [], trocas: [] };
  while (now >= e.proximoTickEm) {
    if (out.ticks >= EFEITOS.ticksMaxPorChamada) {
      const pulos = Math.floor((now - e.proximoTickEm) / e.tickMs) + 1;
      e.proximoTickEm += pulos * e.tickMs;
      break;
    }
    e.agora = e.proximoTickEm;
    const r = rodarTickMut(e, rng);
    out.ticks += 1;
    out.decisoes.push(...r.decisoes);
    out.eventos.push(...r.eventos);
    out.trocas.push(...r.trocas);
    e.proximoTickEm += e.tickMs;
  }
  e.agora = Math.max(e.agora, now);
  return out;
}

/** Ms até o próximo tick de facção. */
export const msAteProximoTickFaccao = (e: EstadoFaccao, now: number): number => Math.max(0, e.proximoTickEm - now);

/** Semente do tick (o servidor pode usar para criar o rng): estável por ciclo. */
export const sementeDoTick = (sementeMundo: number, ciclo: number): number => (Math.imul(sementeMundo ^ 0x9e3779b9, 31) + ciclo * 2654435761) >>> 0;
