/**
 * Rumo do primeiro combate (puro, testável): o bando mais perto pelos marcadores do mapa, para a
 * seta na borda da tela até o jogador travar o primeiro alvo.
 */

export interface MarkerLike {
  kind: string;
  x: number;
  y: number;
  params?: { level?: unknown } & Record<string, unknown>;
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

/**
 * Objetivo de luta sem lugar ("Toque num inimigo para trocar o alvo"): o bando mais fraco e, entre
 * os de mesmo nível, o mais perto. Pula os que estão a menos de `minD` tiles (o bando que acabou de
 * ser limpo ali do lado) e o chefe.
 */
export function easiestEnemyMarker(markers: readonly MarkerLike[], x: number, y: number, minD: number): { x: number; y: number; d: number } | undefined {
  let best: { x: number; y: number; d: number; lv: number } | undefined;
  for (const m of markers) {
    if (m.kind !== 'bando' && m.kind !== 'inimigo') continue;
    const d = Math.hypot(m.x - x, m.y - y);
    if (d < minD) continue;
    const lv = typeof m.params?.level === 'number' ? m.params.level : 1;
    if (!best || lv < best.lv || (lv === best.lv && d < best.d)) best = { x: m.x, y: m.y, d, lv };
  }
  return best ? { x: best.x, y: best.y, d: best.d } : undefined;
}

// SUGESTÃO: a seta só aparece com o bando a mais de 5 tiles (perto, o próprio bando já está à vista).
export const COMPASS_MIN_TILES = 5;
