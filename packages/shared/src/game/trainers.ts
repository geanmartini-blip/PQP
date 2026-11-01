/**
 * Fase 3: os 24 treinadores NPC (trainers.json). Cada um treina a sua ala, dá a missão da ala e
 * fala o bordão; o bordão vira emote do jogador.
 *
 * Decisões:
 * - Emote liberado fica em rec.unlocks como 'emote:<id do emote>' (unlocks continua string[],
 *   compatível com a Fase 2); unlockedEmotes(rec) lista os ids. O perfil manda a lista em `emotes`.
 * - SUGESTÃO: o bordão vira emote ao conversar com o treinador da sua ala (depois da escolha no 12)
 *   e com quem recebe a sua base (desde a entrada na instituição). A recompensa 'bordao_emote' da
 *   missão da ala também libera o do treinador da ala.
 */
import { getData } from '../data';
import type { Trainer } from '../schema/npc';
import { alaTrainerOf, baseTrainerOf } from './people';
import type { Check, PlayerRecord } from './types';

const EMOTE_PREFIX = 'emote:';

export const trainerById = (id: string): Trainer | undefined => getData().trainersById.get(id);

/** Ids dos emotes liberados. */
export const unlockedEmotes = (rec: Pick<PlayerRecord, 'unlocks'>): string[] =>
  rec.unlocks.filter((u) => u.startsWith(EMOTE_PREFIX)).map((u) => u.slice(EMOTE_PREFIX.length));

/** Libera o emote do bordão do treinador. Devolve o id do emote se for novo. */
export function unlockTrainerEmote(rec: PlayerRecord, trainerId: string): string | null {
  const tr = trainerById(trainerId);
  if (!tr) return null;
  const key = `${EMOTE_PREFIX}${tr.emote.id}`;
  if (rec.unlocks.includes(key)) return null;
  rec.unlocks.push(key);
  return tr.emote.id;
}

/** O jogador ganha o bordão deste treinador ao conversar? (ala própria ou quem recebe a base) */
export function teachesEmote(rec: PlayerRecord, trainerId: string): boolean {
  if (rec.stage !== 'margem' || !rec.institution) return false;
  return trainerId === alaTrainerOf(rec) || trainerId === baseTrainerOf(rec);
}

export interface EmoteDef {
  id: string;
  texto: string;
  animacao: string;
  quadros: number;
  treinador: string;
  treinadorNome: string;
}

/** Emote por id (o bordão normal ou o da virada). */
export function emoteDef(emoteId: string): EmoteDef | undefined {
  for (const tr of getData().trainersById.values()) {
    const e = tr.emote.id === emoteId ? tr.emote : tr.bordaoVirada?.emote.id === emoteId ? tr.bordaoVirada.emote : undefined;
    if (e) return { id: e.id, texto: e.texto, animacao: e.animacao, quadros: e.quadros, treinador: tr.id, treinadorNome: tr.name };
  }
  return undefined;
}

/** Usa um emote: confere se está liberado. O servidor espalha a mensagem 'emote' para quem está perto. */
export function useEmote(rec: PlayerRecord, emoteId: string): Check & { emote?: EmoteDef } {
  const def = emoteDef(emoteId);
  if (!def) return { ok: false, erro: 'Emote desconhecido.' };
  if (!unlockedEmotes(rec).includes(emoteId)) return { ok: false, erro: 'Esse bordão ainda não é seu. Converse com o treinador.' };
  return { ok: true, emote: def };
}
