/**
 * Fase 3: quem é quem para o jogador. As missões usam apelidos em dadaPor e nos objetivos de
 * falar ('treinador_da_base', 'treinador_da_ala', 'guia'); aqui eles viram o NPC de verdade do
 * registro (quem recebe a base da instituição, o treinador da ala e o guia da travessia).
 */
import { getData } from '../data';
import type { PlayerRecord } from './types';

/** Apelidos de NPC usados em missions.json. */
export const NPC_ALIASES = ['treinador_da_base', 'treinador_da_ala', 'guia'] as const;

/** Quem treina a base da instituição do jogador (institutions.json baseTrainer). */
export function baseTrainerOf(rec: Pick<PlayerRecord, 'institution'>): string | null {
  if (!rec.institution) return null;
  return getData().institutionsById.get(rec.institution)?.baseTrainer ?? null;
}

/** Treinador da ala do jogador (archetypes.json treinador). */
export function alaTrainerOf(rec: Pick<PlayerRecord, 'archetype'>): string | null {
  if (!rec.archetype) return null;
  return getData().archetypesById.get(rec.archetype)?.treinador ?? null;
}

/** NPC de verdade de um id que pode ser apelido (null = apelido sem dono ainda). */
export function resolveNpc(rec: PlayerRecord, id: string): string | null {
  if (id === 'treinador_da_base') return baseTrainerOf(rec);
  if (id === 'treinador_da_ala') return alaTrainerOf(rec);
  if (id === 'guia') return rec.guide_id;
  return id;
}

/**
 * O NPC `npcId` (com quem o jogador falou) é o `ref` da missão? Aceita o id de verdade e o apelido
 * ('guia' fala como 'guia' ou pelo id do guia).
 */
export function npcMatches(rec: PlayerRecord, ref: string, npcId: string): boolean {
  if (ref === npcId) return true;
  const real = resolveNpc(rec, ref);
  return real !== null && real === npcId;
}

/** O id é do guia do jogador (ou o apelido 'guia'). */
export const isOwnGuide = (rec: PlayerRecord, npcId: string): boolean => npcId === 'guia' || (rec.guide_id !== null && npcId === rec.guide_id);
