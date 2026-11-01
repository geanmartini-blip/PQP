/**
 * Valores da camada de decoração (TileMap.deco). Só visual: não muda colisão, visão nem velocidade.
 * 0 = nada. O cliente desenha cada valor por cima do tile; valor sem quadro `deco_${valor}` no
 * tileset é ignorado (render/tileLayer.ts), então valor novo aqui não quebra o cliente.
 * SUGESTÃO: a lista de decorações não está nos docs. Saiu do tema de cada lugar: Delta (flores,
 * conchas, tábuas, barcos, redes, juncos, toldos da feira), Esquerda (horta, totem, lanterna) e
 * Direita (holograma, letreiro de neon, lixo no asfalto).
 */
export const Deco = {
  Nada: 0,
  Flor: 1,
  Concha: 2,
  Tabua: 3,
  /** barco amarrado, por cima da água funda */
  Barco: 4,
  /** rede de pesca pendurada ou estendida no deque */
  Rede: 5,
  Caixote: 6,
  Lanterna: 7,
  /** junco na água rasa */
  Junco: 8,
  /** toldo de barraca (feira de pulgas, banca) */
  Toldo: 9,
  /** canteiro de horta */
  Horta: 10,
  /** totem entalhado da Esquerda */
  Totem: 11,
  /** holograma de propaganda da Direita */
  Holograma: 12,
  /** letreiro de neon */
  Letreiro: 13,
  /** saco de lixo e entulho */
  Lixo: 14,
} as const;

export type DecoId = (typeof Deco)[keyof typeof Deco];
