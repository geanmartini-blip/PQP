/**
 * Regras puras do desenho das entidades (testáveis sem Phaser).
 */
import { FL } from '../game/clientWorld';

export type ViewKind = 'p' | 'n' | 'e' | 's' | 'l';

/**
 * A view "morreu" ('death') mas a entidade continua no mundo de pé: jogador ou NPC que voltou ao QG
 * depois de 30 s caído (respawnAtHq manda 'death' para quem continua vivo). Inimigo e saque não
 * voltam: somem do snapshot.
 */
export function shouldRevive(kind: ViewKind, h: number, fl: number, dying: boolean): boolean {
  return dying && (kind === 'p' || kind === 'n' || kind === 's') && h > 0 && (fl & FL.caido) === 0;
}
