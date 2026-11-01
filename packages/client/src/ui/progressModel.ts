/**
 * Partes puras das telas da Fase 3 (sem Phaser nem DOM, testáveis no Node): rótulos dos tipos de
 * habilidade e dos papéis, e o texto do bordão de um emote.
 */
import { getData } from '@pqp/shared';

/** Nome curto do tipo de habilidade (os tipos de CLAUDE.md). */
export const ABILITY_TYPE_LABEL: Readonly<Record<string, string>> = {
  travada: 'Travada',
  em_volta: 'Em volta',
  area_alvo: 'Área no alvo',
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
