/**
 * story_flags do jogador (story_flags.json). Flag com `exclusiva` desliga as outras do mesmo grupo
 * (ex.: margem_esquerda e margem_direita; comprou ou desconfiou da chopindita).
 */
import { getData } from '../data';
import type { PlayerRecord } from './types';

export const hasFlag = (rec: PlayerRecord, id: string): boolean => rec.story_flags.includes(id);

/** Liga a flag. Devolve true se era nova. Flags que não existem em story_flags.json são aceitas (missões futuras). */
export function setFlag(rec: PlayerRecord, id: string): boolean {
  if (rec.story_flags.includes(id)) return false;
  const D = getData();
  const def = D.storyFlagsById.get(id);
  const grupo = (def as { exclusiva?: string } | undefined)?.exclusiva;
  if (grupo) {
    rec.story_flags = rec.story_flags.filter((f) => (D.storyFlagsById.get(f) as { exclusiva?: string } | undefined)?.exclusiva !== grupo);
  }
  rec.story_flags.push(id);
  return true;
}

export function clearFlag(rec: PlayerRecord, id: string): boolean {
  const n = rec.story_flags.length;
  rec.story_flags = rec.story_flags.filter((f) => f !== id);
  return rec.story_flags.length !== n;
}
