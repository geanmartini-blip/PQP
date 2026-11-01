/**
 * Tutorial do primeiro minuto: passos detectados por eventos, com textos curtos (sem texto
 * longo), e os controles da tela liberados pelo nível (desbloqueioTutorial) e pela missão.
 */
import type { Objective } from '../schema/mission';
import { getData } from '../data';
import { CONTROL_TO_UNLOCK, tutorialUnlocksUpTo } from './progression';
import { emptyResult, type GameEvent, type GameResult, type PlayerRecord } from './types';

export type TutorialStepId = 'andar' | 'alvo' | 'basico' | 'botao' | 'falar' | 'missao';

export interface TutorialStep {
  id: TutorialStepId;
  /** dica curta, com o gesto (SUGESTÃO: textos do tutorial; as falas do Seu Jacó estão em npcs.json) */
  texto: string;
  /** controle da tela que o passo destaca */
  destaca: string;
  /** contexto de fala do Seu Jacó que acompanha (npcs.json) */
  falaJaco?: string;
}

// SUGESTÃO: os 6 textos curtos do primeiro minuto.
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: 'andar', texto: 'Arraste o polegar para andar', destaca: 'joystick', falaJaco: 'tutorial_mover' },
  { id: 'alvo', texto: 'A marca no chão é o seu alvo', destaca: 'alvo', falaJaco: 'tutorial_alvo' },
  { id: 'basico', texto: 'Chegue perto: o ataque é sozinho', destaca: 'alvo', falaJaco: 'tutorial_ataque' },
  { id: 'botao', texto: 'Toque na missão para ir sozinho', destaca: 'rastreador_missao' },
  { id: 'falar', texto: 'Toque no Seu Jacó para falar', destaca: 'npc' },
  { id: 'missao', texto: 'Termine a primeira missão', destaca: 'rastreador_missao' },
];

/** Qual passo um evento completa. */
function stepOf(ev: GameEvent): TutorialStepId | undefined {
  switch (ev.t) {
    case 'tutorial':
      return TUTORIAL_STEPS.some((s) => s.id === ev.passo) ? (ev.passo as TutorialStepId) : undefined;
    case 'control':
      if (ev.controle === 'andar_joystick' || ev.controle === 'tocar_no_chao') return 'andar';
      if (ev.controle === 'alvo_automatico' || ev.controle === 'trocar_alvo') return 'alvo';
      if (ev.controle === 'auto_caminho') return 'botao';
      return undefined;
    case 'kill':
      return 'basico';
    case 'talk':
      return 'falar';
    default:
      return undefined;
  }
}

/** Marca o passo (e o controle usado). Chamado por onGameEvent; também serve sozinho para tutorial_passo. */
export function onTutorialEvent(rec: PlayerRecord, ev: GameEvent): GameResult {
  const r = emptyResult();
  if (ev.t === 'control' && !rec.tutorial.controles.includes(ev.controle)) {
    rec.tutorial.controles.push(ev.controle);
    r.mudou = true;
  }
  const s = stepOf(ev);
  // matar sem ter visto o alvo: o alvo automático estava lá
  const steps: TutorialStepId[] = s === 'basico' ? ['alvo', 'basico'] : s ? [s] : [];
  for (const id of steps) if (markStep(rec, id)) r.tutorial.push(id);
  if (r.tutorial.length > 0) r.mudou = true;
  return r;
}

export function markStep(rec: PlayerRecord, id: TutorialStepId): boolean {
  if (rec.tutorial.feitos.includes(id)) return false;
  rec.tutorial.feitos.push(id);
  return true;
}

/** Próximo passo do primeiro minuto ainda não feito (undefined = tutorial do primeiro minuto acabou). */
export function nextTutorialStep(rec: PlayerRecord): TutorialStep | undefined {
  return TUTORIAL_STEPS.find((s) => !rec.tutorial.feitos.includes(s.id));
}

/**
 * Controles da tela liberados agora: os do desbloqueioTutorial até o nível (os do 8 só depois da
 * travessia) mais os que o objetivo atual das missões ativas ensina.
 */
export function controlesLiberados(rec: PlayerRecord, objetivosAtuais: readonly Objective[] = []): string[] {
  const out = new Set(tutorialUnlocksUpTo(rec.level, { margem: rec.stage === 'margem' }).map((u) => u.controle));
  for (const o of objetivosAtuais) {
    for (const c of o.ensina ?? []) {
      const k = CONTROL_TO_UNLOCK[c];
      if (k) out.add(k);
    }
    if (o.tipo === 'usar_controle') {
      const k = CONTROL_TO_UNLOCK[o.controle];
      if (k) out.add(k);
    }
  }
  // depois da travessia todos os do Delta ficam (inclusive os que o nível pulou)
  if (rec.stage === 'margem') for (const u of tutorialUnlocksUpTo(getData().progression.botoes[0]?.nivelMax ?? 7)) out.add(u.controle);
  return [...out];
}
