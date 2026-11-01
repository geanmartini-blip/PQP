/**
 * Rumo do primeiro combate (puro, testável): o bando mais perto pelos marcadores do mapa, para a
 * seta na borda da tela até o jogador travar o primeiro alvo.
 */

export interface MarkerLike {
  kind: string;
  x: number;
  y: number;
}

/** Bando ou inimigo (não o chefe) mais perto de (x, y), em tiles. */
export function nearestEnemyMarker(markers: readonly MarkerLike[], x: number, y: number): { x: number; y: number; d: number } | undefined {
  let best: { x: number; y: number; d: number } | undefined;
  let boss: { x: number; y: number; d: number } | undefined;
  for (const m of markers) {
    if (m.kind !== 'bando' && m.kind !== 'inimigo' && m.kind !== 'chefe') continue;
    const d = Math.hypot(m.x - x, m.y - y);
    if (m.kind === 'chefe') {
      if (!boss || d < boss.d) boss = { x: m.x, y: m.y, d };
    } else if (!best || d < best.d) best = { x: m.x, y: m.y, d };
  }
  return best ?? boss;
}

// SUGESTÃO: a seta só aparece com o bando a mais de 5 tiles (perto, o próprio bando já está à vista).
export const COMPASS_MIN_TILES = 5;
