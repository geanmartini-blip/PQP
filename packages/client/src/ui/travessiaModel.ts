/**
 * Modelo da tela da travessia (puro, testável): margem, depois instituição (4 cartões), depois o
 * guia, e a confirmação. Voltar desfaz o passo. O servidor confere tudo de novo (applyTravessia).
 */
import { getData } from '@pqp/shared';
import type { TravessiaOptions, TravessiaSide } from '@pqp/shared/game/travessia';

export type TravessiaStep = 'margem' | 'instituicao' | 'guia' | 'confirmar';

export interface TravessiaState {
  opcoes: TravessiaOptions;
  step: TravessiaStep;
  side: 'esquerda' | 'direita' | null;
  institution: string | null;
  guide: string | null;
}

export const newTravessia = (opcoes: TravessiaOptions): TravessiaState => ({ opcoes, step: 'margem', side: null, institution: null, guide: null });

export function sideOf(s: TravessiaState): TravessiaSide | undefined {
  return s.opcoes.margens.find((m) => m.side === s.side);
}

export function pickSide(s: TravessiaState, side: 'esquerda' | 'direita'): boolean {
  if (!s.opcoes.margens.some((m) => m.side === side)) return false;
  s.side = side;
  s.institution = null;
  s.guide = null;
  s.step = 'instituicao';
  return true;
}

export function pickInstitution(s: TravessiaState, id: string): boolean {
  if (!sideOf(s)?.instituicoes.some((i) => i.id === id)) return false;
  s.institution = id;
  s.step = 'guia';
  return true;
}

export function pickGuide(s: TravessiaState, id: string): boolean {
  if (!sideOf(s)?.guias.some((g) => g.id === id)) return false;
  s.guide = id;
  s.step = 'confirmar';
  return true;
}

export function back(s: TravessiaState): boolean {
  switch (s.step) {
    case 'instituicao':
      s.step = 'margem';
      s.side = null;
      return true;
    case 'guia':
      s.step = 'instituicao';
      s.institution = null;
      return true;
    case 'confirmar':
      s.step = 'guia';
      s.guide = null;
      return true;
    default:
      return false;
  }
}

/** Escolha pronta para a mensagem 'travessia'. */
export function choice(s: TravessiaState): { side: string; institution: string; guide: string } | null {
  return s.side && s.institution && s.guide ? { side: s.side, institution: s.institution, guide: s.guide } : null;
}

/** Cores das paletas de uma margem (as 3 paletas de traje de cada ala da margem), para os cartões. */
export function sideSwatches(side: 'esquerda' | 'direita', max = 8): string[] {
  const out: string[] = [];
  for (const a of getData().archetypes) {
    if (a.margem !== side) continue;
    for (const p of a.paletasTraje ?? []) {
      const c = p.cores[0];
      if (c && !out.includes(c)) out.push(c);
      if (out.length >= max) return out;
    }
  }
  return out;
}

/** Cores do uniforme base de uma instituição (outfits.json). */
export function institutionSwatches(institutionId: string): string[] {
  const t = getData().outfits.tiers.find((x) => x.tier === 'base' && x.instituicao === institutionId);
  return [...(t?.paletas?.[0]?.cores ?? [])].slice(0, 4);
}
