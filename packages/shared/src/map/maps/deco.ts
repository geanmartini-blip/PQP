/**
 * Valores da camada de decoração (TileMap.deco). Só visual: não muda colisão, visão nem velocidade.
 * 0 = nada. O cliente desenha cada valor por cima do tile.
 * SUGESTÃO: a lista de decorações não está nos docs; saiu do tema do Delta (flores, conchas, tábuas).
 */
export const Deco = {
  Nada: 0,
  Flor: 1,
  Concha: 2,
  Tabua: 3,
} as const;

export type DecoId = (typeof Deco)[keyof typeof Deco];
