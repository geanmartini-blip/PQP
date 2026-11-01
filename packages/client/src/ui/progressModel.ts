/**
 * Partes puras das telas da Fase 3 (sem Phaser nem DOM, testáveis no Node): rótulos dos tipos de
 * habilidade e dos papéis, o texto do bordão de um emote e o texto do cartão de habilidade.
 */
import { getData, type Ability } from '@pqp/shared';

/** Nome curto do tipo de habilidade, em palavra simples (os tipos de CLAUDE.md). SUGESTÃO. */
export const ABILITY_TYPE_LABEL: Readonly<Record<string, string>> = {
  travada: 'No alvo',
  em_volta: 'Em volta',
  area_alvo: 'Área',
  cone: 'Cone',
  campo: 'Campo',
  aliado: 'Em aliado',
};

/** Nome do papel da ala (archetypes.json papel). */
export const PAPEL_LABEL: Readonly<Record<string, string>> = { tanque: 'Tanque', dano: 'Dano', suporte: 'Suporte', cura: 'Cura' };

/** Texto do bordão de um emote (trainers.json emote e bordaoVirada.emote). */
export function emoteText(emoteId: string): string | undefined {
  for (const tr of getData().trainersById.values()) {
    if (tr.emote.id === emoteId) return tr.emote.texto;
    if (tr.bordaoVirada?.emote.id === emoteId) return tr.bordaoVirada.emote.texto;
  }
  return undefined;
}

/** Habilidade que se arrasta para posicionar (área no alvo e campo lançado longe). */
export function isDraggableAbility(a: Pick<Ability, 'type' | 'range'>): boolean {
  return (a.type === 'area_alvo' || a.type === 'campo') && a.range > 0;
}

// SUGESTÃO: o cartão de primeira vez mostra até ~70 letras do que a habilidade faz.
export const CARD_LINE_CHARS = 70;

/** A primeira frase da descrição, cortada em palavra inteira (com "…") se passar de `max` letras. */
export function firstSentence(text: string, max = CARD_LINE_CHARS): string {
  const t = text.trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(t);
  let s = m ? m[1]! : t;
  if (s.length <= max) return s;
  s = s.slice(0, max - 1);
  const sp = s.lastIndexOf(' ');
  if (sp > max * 0.5) s = s.slice(0, sp);
  return s.replace(/[\s,;:.-]+$/, '') + '…';
}

export interface AbilityCardText {
  name: string;
  /** tipo em palavra simples */
  tipo: string;
  /** o que faz em 1 linha (primeira frase da description) */
  linha: string;
  /** a description inteira */
  descricao: string;
  /** "Recarga 8 s · Custo 20 Fôlego" (o Especial: "Carrega batendo, apanhando e curando") */
  numeros: string;
  /** o gesto: "Toque" ou "Toque, ou segure e arraste para posicionar" */
  gesto: string;
}

/** Textos do cartão de uma habilidade (nome, tipo, o que faz, recarga, custo e gesto). SUGESTÃO: textos. */
export function abilityCardText(a: Ability, resourceName?: string, side?: 'esquerda' | 'direita' | null): AbilityCardText {
  const especial = a.slot === 'especial' || a.slot === 'virada';
  const nums: string[] = [];
  if (especial) nums.push('Carrega batendo, apanhando e curando');
  else if (a.cooldownS > 0) nums.push(`Recarga ${fmtNum(a.cooldownS)} s`);
  if (a.cost > 0) nums.push(`Custo ${fmtNum(a.cost)}${resourceName ? ' ' + resourceName : ''}`);
  const drag = isDraggableAbility(a);
  return {
    name: side && a.nomePorMargem ? a.nomePorMargem[side] : a.name,
    tipo: ABILITY_TYPE_LABEL[a.type] ?? a.type,
    linha: firstSentence(a.description ?? ''),
    descricao: a.description ?? '',
    numeros: nums.join(' · '),
    gesto: drag ? 'Toque, ou segure e arraste para posicionar' : 'Toque',
  };
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}
