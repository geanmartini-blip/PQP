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

/**
 * Corta o texto do balão em `maxLines` linhas pelo quebrador `wrap` (as linhas que o texto teria),
 * com "…" no fim da última. `wrap` é o getWrappedText do Phaser no jogo e um quebrador simples no teste.
 */
export function clampLines(text: string, maxLines: number, wrap: (s: string) => string[]): string {
  const lines = wrap(text);
  if (lines.length <= maxLines) return text;
  const head = lines.slice(0, maxLines - 1).join(' ');
  let last = lines.slice(maxLines - 1).join(' ');
  const join = (l: string) => (head ? `${head} ${l}…` : `${l}…`);
  while (last.length > 1 && wrap(join(last)).length > maxLines) last = last.slice(0, -1).trimEnd();
  return join(last.replace(/[\s,;:.-]+$/, ''));
}
