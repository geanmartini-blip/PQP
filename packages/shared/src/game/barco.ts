/**
 * Travessia de barco do nível 8 (Narrativa.md: "Seu Jacó leva você de barco até a ponte"; DECISIONS:
 * as habilidades e o Especial são ensinados no nível 8, no barco). Regras puras, as mesmas no
 * servidor de jogo (server/src/core.ts, sala 'barco:<id>') e no servidor local do cliente
 * (client/src/net/localServer.ts).
 *
 * Fluxo:
 * 1. No Delta, com o Bruno Ferro derrotado e no nível 8, o jogador fala com o Seu Jacó e escolhe
 *    "Embarcar na travessia" (boardBoat): liga travessia_embarcou e vai para a sala do barco.
 * 2. viagem: o barco desce o Rio Claro; o Seu Jacó comenta os botões e as duas margens
 *    (npcs.json: travessia_habilidades, travessia_esquerda, travessia_direita).
 * 3. escolha: na altura da ponte, a tela da travessia abre (margem, instituição e guia). Fechou sem
 *    escolher? Tocar no Seu Jacó abre de novo.
 * 4. aula: depois de applyTravessia, a classe dá os botões; o Especial começa cheio (só no barco);
 *    duas ondas pequenas sobem no convés e o guia recém-escolhido ensina o botão 1, o 2, o 3 e o
 *    Especial (balões curtos e a dica do tutorial).
 * 5. chegada: com a aula feita (ou depois de BOAT_TUNING.aulaMaxS), o barco encosta no cais da margem
 *    escolhida (o spawn padrão do mapa da margem).
 *
 * Reconexão: quem embarcou e ainda não escolheu volta ao barco (uma viagem nova); quem já escolheu
 * volta à margem (boatRoomOf / mapForRecord). Nada aqui usa relógio nem sorteio: tudo anda pelos
 * ticks que o servidor passa.
 */
import { getData } from '../data';
import { ARRIVAL_MAP_BY_SIDE, boatRoomId } from '../map/registry';
import { circleFree } from '../map/grid';
import { BOAT_WAVE_POINTS } from '../map/maps/barco_travessia';
import type { TileMap } from '../map/types';
import { hasFlag, setFlag } from './flags';
import { guideLine, guideOf, type GuideLineOut } from './guides';
import { FLAG_BRUNO } from './progression';
import { canCross, travessiaOptions, type TravessiaOptions } from './travessia';
import { emptyResult, type Check, type GameEvent, type GameResult, type PlayerRecord } from './types';

/** story_flag de quem embarcou no barco do Seu Jacó (e ainda não escolheu, enquanto não for 'margem'). */
export const FLAG_EMBARCOU = 'travessia_embarcou';
/** story_flag da aula do barco feita até o fim. */
export const FLAG_AULA = 'travessia_aula_feita';

// SUGESTÃO: os tempos e as ondas do barco (os docs não dão números para a travessia).
export const BOAT_TUNING = {
  /** da partida até a ponte (s) */
  viagemS: 12,
  /** falas do Seu Jacó na viagem (s desde a partida) */
  falaBotoesS: 1,
  falaEsquerdaS: 4,
  falaDireitaS: 8,
  /** depois da escolha, a primeira onda sobe no convés em (s) */
  ondaAtrasoS: 2,
  /** entre uma onda limpa e a próxima (s) */
  ondaIntervaloS: 2,
  /** tempo máximo da aula (s): o barco chega mesmo sem terminar */
  aulaMaxS: 90,
  /** da aula feita até encostar no cais (s) */
  chegadaS: 3,
  /** nível dos inimigos da aula: o do jogador menos isto (mínimo 1) */
  nivelAbaixo: 2,
  /**
   * As duas ondas pequenas: os mosquitos do Delta sobem do rio pela proa; depois, os capangas do
   * Capataz abordam pelos lados (enemies.json, regioes delta).
   */
  ondas: [
    { inimigo: 'mosquito_do_delta', quantidade: 3 },
    { inimigo: 'capanga_do_capataz', quantidade: 2 },
  ],
} as const;

export type BoatPhase = 'viagem' | 'escolha' | 'aula' | 'chegada' | 'fim';
export type BoatButton = '1' | '2' | '3' | 'especial';

/** Passo da aula do barco: a dica curta da tela (o mesmo formato dos passos do tutorial). */
export interface AulaStep {
  id: string;
  botao: BoatButton;
  texto: string;
  /** controle da tela que o passo destaca */
  destaca: string;
}

// SUGESTÃO: textos das dicas da aula.
export const AULA_STEPS: readonly AulaStep[] = [
  { id: 'aula_botao_1', botao: '1', texto: 'Toque no botão 1', destaca: 'botao_1' },
  { id: 'aula_botao_2', botao: '2', texto: 'Agora o botão 2', destaca: 'botao_2' },
  { id: 'aula_botao_3', botao: '3', texto: 'E o botão 3', destaca: 'botao_3' },
  { id: 'aula_especial', botao: 'especial', texto: 'Brilhou? Toque no Especial', destaca: 'especial' },
];

/** Dica da tela fora da aula (viagem, escolha e chegada). SUGESTÃO: textos. */
const BOAT_HINTS: Record<Exclude<BoatPhase, 'aula'>, { id: string; texto: string; destaca: string } | undefined> = {
  viagem: { id: 'barco_viagem', texto: 'Ande pelo convés: a ponte já vem', destaca: 'joystick' },
  escolha: { id: 'barco_escolha', texto: 'Toque no Seu Jacó para escolher a margem', destaca: 'npc' },
  chegada: { id: 'barco_chegada', texto: 'Segura aí: o barco vai encostar', destaca: 'joystick' },
  fim: undefined,
};

/**
 * SUGESTÃO: falas curtas do guia na aula, por margem (o espírito da Esquerda e a IA da Direita). Os
 * guias dos dados não têm fala para cada botão; estas seguem o jeito de falar de cada margem.
 */
const AULA_FALAS: Record<'esquerda' | 'direita', Record<BoatButton | 'fim', string>> = {
  esquerda: {
    '1': 'O Encanto acordou na sua mão. Toque no botão 1, sem medo.',
    '2': 'Isso. Agora o 2. A Assembleia aprovaria, depois de três reuniões.',
    '3': 'O 3 é da sua classe. Toque, que o rio tá olhando.',
    especial: 'Tá brilhando? É o Especial. Hoje é por conta dos ancestrais.',
    fim: 'Aprendeu. Agora é só não esquecer até o cais.',
  },
  direita: {
    '1': 'Notificação: toque no botão 1. Termos aceitos automaticamente.',
    '2': 'Ótimo engajamento! Agora o botão 2. Sua meta agradece.',
    '3': 'Botão 3 liberado no plano gratuito. Aproveite enquanto dura.',
    especial: 'Especial carregado de cortesia. Só no barco; depois é assinatura.',
    fim: 'Treinamento concluído. Seu score subiu 0,01. Parabéns, colaborador.',
  },
};

/** Estado da viagem de um jogador (vive na sala do barco; não vai para o registro). */
export interface BoatState {
  fase: BoatPhase;
  /** tick da partida */
  inicio: number;
  /** tick em que a fase atual começou */
  desde: number;
  /** falas da viagem já ditas ('botoes', 'esquerda', 'direita') */
  falas: string[];
  /** ondas que já subiram no convés */
  ondas: number;
  /** ids das entidades das ondas da aula (o servidor põe ao nascer) */
  inimigos: number[];
  /** tick em que o convés ficou limpo (espera ondaIntervaloS para a próxima) */
  limpoDesde?: number;
  /** passos da aula feitos (AULA_STEPS[].id) */
  passos: string[];
}

export function newBoatState(tick: number): BoatState {
  return { fase: 'viagem', inicio: tick, desde: tick, falas: [], ondas: 0, inimigos: [], passos: [] };
}

/** O que o servidor faz depois de um passo do barco (na ordem). */
export type BoatAction =
  /** balão curto (Seu Jacó ou o guia): vai como 'fala_guia' */
  | { t: 'fala'; fala: GuideLineOut }
  /** abre a tela da travessia */
  | { t: 'escolha'; opcoes: TravessiaOptions }
  /** evento de jogo para as missões (chegou de barco na ponte) */
  | { t: 'evento'; ev: GameEvent }
  /** nasce a onda no convés (o servidor põe os ids em state.inimigos) */
  | { t: 'onda'; inimigos: { inimigo: string; quantidade: number; nivel: number }[] }
  /**
   * enche o Especial (só na aula do barco) e desliga o modo automático: a aula é com o polegar.
   * SUGESTÃO: o automático desliga na aula (o jogador liga de novo quando quiser).
   */
  | { t: 'especial' }
  /** o barco chegou: troca para o mapa da margem, no cais */
  | { t: 'chegar'; mapId: string; spawn: string }
  /** o estado mudou: manda 'barco_info' */
  | { t: 'info' };

/** Estado do barco para o cliente (S2C_BarcoInfo). */
export interface BoatInfo {
  fase: BoatPhase;
  /** dica da tela agora (o passo da aula ou a da fase) */
  dica?: { id: string; texto: string; destaca: string };
  /** segundos até a ponte (na viagem) */
  ponteEmS?: number;
  /** passos da aula feitos e o total */
  passos: number;
  totalPassos: number;
}

/** Contexto de um tick do barco. */
export interface BoatCtx {
  tick: number;
  tickRate: number;
  /** a entidade da onda está viva no convés */
  vivo(id: number): boolean;
}

// ---------------------------------------------------------------------------
// embarque e sala

/** Pode embarcar: Bruno Ferro derrotado, nível 8 e ainda sem margem (as regras da travessia). */
export function canBoard(rec: PlayerRecord): Check {
  return canCross(rec);
}

/** Embarca no barco do Seu Jacó: liga travessia_embarcou. */
export function boardBoat(rec: PlayerRecord): Check & { resultado: GameResult } {
  const r = emptyResult();
  const c = canBoard(rec);
  if (!c.ok) return { ...c, resultado: r };
  if (setFlag(rec, FLAG_EMBARCOU)) {
    r.flags.push(FLAG_EMBARCOU);
    r.mudou = true;
  }
  return { ok: true, resultado: r };
}

/** Sala do barco deste registro: embarcou e ainda não escolheu a margem. */
export function boatRoomOf(rec: PlayerRecord): string | undefined {
  if (!rec.criado || rec.stage === 'margem') return undefined;
  if (!hasFlag(rec, FLAG_EMBARCOU) || !hasFlag(rec, FLAG_BRUNO)) return undefined;
  return boatRoomId(rec.id);
}

// ---------------------------------------------------------------------------
// falas

/** Próxima fala do Seu Jacó num contexto de npcs.json, em ordem (contador no registro). */
export function jacoLine(rec: PlayerRecord, contexto: string): GuideLineOut | null {
  const npc = getData().npcsById.get('seu_jaco');
  const lines = npc?.falas.find((f) => f.contexto === contexto)?.linhas ?? [];
  if (lines.length === 0) return null;
  const k = `fala:seu_jaco:${contexto}`;
  const i = rec.counters[k] ?? 0;
  rec.counters[k] = i + 1;
  return { guia: 'seu_jaco', nome: npc?.name ?? 'Seu Jacó', situacao: contexto, texto: lines[i % lines.length]!.replaceAll('{nome}', rec.name) };
}

/** Fala curta do guia na aula (o botão a ensinar, ou 'fim'). */
export function aulaLine(rec: PlayerRecord, qual: BoatButton | 'fim'): GuideLineOut | null {
  const g = guideOf(rec);
  const side = rec.side === 'direita' ? 'direita' : 'esquerda';
  const nome = g?.name ?? (side === 'direita' ? 'IA de bolso' : 'Espírito guia');
  return { guia: g?.id ?? 'guia', nome, situacao: `aula_${qual}`, texto: AULA_FALAS[side][qual] };
}

const fala = (f: GuideLineOut | null): BoatAction[] => (f ? [{ t: 'fala', fala: f }] : []);

/** Próximo passo da aula ainda não feito. */
export function nextAulaStep(st: BoatState): AulaStep | undefined {
  return AULA_STEPS.find((s) => !st.passos.includes(s.id));
}

/** Estado para o cliente. */
export function boatInfo(st: BoatState, ctx?: { tick: number; tickRate: number }): BoatInfo {
  const out: BoatInfo = { fase: st.fase, passos: st.passos.length, totalPassos: AULA_STEPS.length };
  const step = st.fase === 'aula' ? nextAulaStep(st) : BOAT_HINTS[st.fase];
  if (step) out.dica = { id: step.id, texto: step.texto, destaca: step.destaca };
  if (st.fase === 'viagem' && ctx) out.ponteEmS = Math.max(0, Math.ceil(BOAT_TUNING.viagemS - (ctx.tick - st.inicio) / ctx.tickRate));
  return out;
}

// ---------------------------------------------------------------------------
// passos

function setPhase(st: BoatState, fase: BoatPhase, tick: number): void {
  st.fase = fase;
  st.desde = tick;
  st.limpoDesde = undefined;
}

/** Termina a aula: o guia se despede e o barco vai encostar. */
function endAula(st: BoatState, rec: PlayerRecord, tick: number): BoatAction[] {
  setPhase(st, 'chegada', tick);
  const out: BoatAction[] = [];
  if (!nextAulaStep(st)) out.push(...fala(aulaLine(rec, 'fim')));
  out.push(...fala(jacoLine(rec, 'travessia_despedida')));
  out.push({ t: 'info' });
  return out;
}

/** A conexão caiu: o barco espera este tick (os tempos da viagem e da aula andam junto). */
export function boatHold(st: BoatState): void {
  st.inicio++;
  st.desde++;
  if (st.limpoDesde !== undefined) st.limpoDesde++;
}

/** Um tick do barco (o servidor chama a cada tick, depois do step da simulação). */
export function boatTick(st: BoatState, rec: PlayerRecord, ctx: BoatCtx): BoatAction[] {
  const T = BOAT_TUNING;
  const out: BoatAction[] = [];
  const el = (ctx.tick - st.desde) / ctx.tickRate;
  switch (st.fase) {
    case 'viagem': {
      // já escolheu (registro antigo, reconexão): direto para a aula
      if (rec.stage === 'margem') return boatOnChosen(st, rec, ctx.tick);
      const marcos: [string, number, string][] = [
        ['botoes', T.falaBotoesS, 'travessia_habilidades'],
        ['esquerda', T.falaEsquerdaS, 'travessia_esquerda'],
        ['direita', T.falaDireitaS, 'travessia_direita'],
      ];
      for (const [id, s, ctxFala] of marcos) {
        if (el < s || st.falas.includes(id)) continue;
        st.falas.push(id);
        out.push(...fala(jacoLine(rec, ctxFala)));
      }
      if (el >= T.viagemS) {
        setPhase(st, 'escolha', ctx.tick);
        out.push({ t: 'evento', ev: { t: 'arrive', regionId: 'usina_da_ponte', deBarco: true } });
        out.push({ t: 'escolha', opcoes: travessiaOptions(rec) });
        out.push({ t: 'info' });
      }
      return out;
    }
    case 'escolha':
      if (rec.stage === 'margem') return boatOnChosen(st, rec, ctx.tick);
      return out;
    case 'aula': {
      if (el >= T.aulaMaxS) return endAula(st, rec, ctx.tick);
      st.inimigos = st.inimigos.filter((id) => ctx.vivo(id));
      if (st.inimigos.length > 0) {
        st.limpoDesde = undefined;
        return out;
      }
      if (st.ondas >= T.ondas.length && !nextAulaStep(st)) return endAula(st, rec, ctx.tick);
      // a primeira onda espera um pouco depois da escolha; as outras, o convés limpo por um tempo
      if (st.ondas === 0) {
        if (el < T.ondaAtrasoS) return out;
      } else {
        st.limpoDesde ??= ctx.tick;
        if ((ctx.tick - st.limpoDesde) / ctx.tickRate < T.ondaIntervaloS) return out;
      }
      // faltou passo com as ondas acabadas: volta a primeira (até o tempo máximo)
      const onda = T.ondas[st.ondas % T.ondas.length]!;
      st.ondas++;
      st.limpoDesde = undefined;
      const nivel = Math.max(1, Math.floor(rec.level) - T.nivelAbaixo);
      out.push({ t: 'onda', inimigos: [{ inimigo: onda.inimigo, quantidade: onda.quantidade, nivel }] });
      return out;
    }
    case 'chegada':
      if (el < T.chegadaS) return out;
      setPhase(st, 'fim', ctx.tick);
      if (rec.side) {
        if (!nextAulaStep(st)) setFlag(rec, FLAG_AULA);
        out.push({ t: 'chegar', mapId: ARRIVAL_MAP_BY_SIDE[rec.side], spawn: 'spawn' });
      }
      return out;
    default:
      return out;
  }
}

/**
 * Depois da escolha (applyTravessia deu certo): começa a aula. O Especial enche, o guia se
 * apresenta e ensina o primeiro botão.
 */
export function boatOnChosen(st: BoatState, rec: PlayerRecord, tick: number): BoatAction[] {
  if (st.fase === 'aula' || st.fase === 'chegada' || st.fase === 'fim') return [];
  setPhase(st, 'aula', tick);
  const out: BoatAction[] = [{ t: 'especial' }];
  out.push(...fala(guideLine(rec, 'saudacao')));
  const step = nextAulaStep(st);
  if (step) out.push(...fala(aulaLine(rec, step.botao)));
  out.push({ t: 'info' });
  return out;
}

/** Um botão usado na aula (evento 'cast' do jogador): marca o passo e ensina o próximo. */
export function boatOnCast(st: BoatState, rec: PlayerRecord, botao: BoatButton): BoatAction[] {
  if (st.fase !== 'aula') return [];
  const s = AULA_STEPS.find((x) => x.botao === botao);
  if (!s || st.passos.includes(s.id)) return [];
  st.passos.push(s.id);
  const out: BoatAction[] = [];
  const next = nextAulaStep(st);
  if (next) out.push(...fala(aulaLine(rec, next.botao)));
  out.push({ t: 'info' });
  return out;
}

// SUGESTÃO: a onda sobe no convés uns 4 a 7 tiles à frente do jogador (para a proa), dentro do raio
// de aggro (7): quem foi falar com o Seu Jacó no leme não fica sem inimigo para os botões da aula.
const WAVE_OFFSETS: readonly [number, number][] = [
  [0, -4.5],
  [-3, -4],
  [3, -4],
  [-2, -6],
  [2, -6],
  [0, -6.5],
];
/** Convés andável do barco_travessia (as linhas largas, sem a proa estreita). */
const DECK = { x0: 5.5, x1: 14.5, y0: 8.5, y1: 23.5 } as const;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * Onde nasce o inimigo `i` de uma onda: à frente do jogador no convés; se ali estiver ocupado (caixote,
 * amurada), cai nos pontos fixos do mapa (BOAT_WAVE_POINTS).
 */
export function boatWaveSpot(map: TileMap, i: number, player: { x: number; y: number }): { x: number; y: number } {
  const [dx, dy] = WAVE_OFFSETS[i % WAVE_OFFSETS.length]!;
  const cy = clamp(player.y, DECK.y0 + 6.5, DECK.y1);
  const x = clamp(clamp(player.x, 7.5, 12.5) + dx, DECK.x0, DECK.x1);
  const y = clamp(cy + dy, DECK.y0, DECK.y1);
  if (circleFree(map, x, y, 0.45)) return { x, y };
  return BOAT_WAVE_POINTS[i % BOAT_WAVE_POINTS.length]!;
}

/** Botão do loadout que lançou a habilidade (o evento 'cast' da simulação), ou undefined. */
export function boatButtonOf(e: { loadout?: { b1?: string; b2?: string; b3?: string; especial?: string } }, ability: string): BoatButton | undefined {
  const l = e.loadout;
  if (!l || !ability) return undefined;
  if (l.b1 === ability) return '1';
  if (l.b2 === ability) return '2';
  if (l.b3 === ability) return '3';
  if (l.especial === ability) return 'especial';
  return undefined;
}
