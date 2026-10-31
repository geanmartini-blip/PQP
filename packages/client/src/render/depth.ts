/** Camadas de profundidade do mundo (os bonecos usam DEPTH.entity + y em px, ordem por y). */
export const DEPTH = {
  floor: 0,
  deco: 1,
  zone: 2,
  telegraph: 3,
  guide: 4,
  marker: 5,
  shadow: 6,
  canopyFar: 7,
  entity: 1000,
  /** barras, nomes, números e falas ficam por cima de tudo */
  overlay: 1_000_000,
  text: 1_100_000,
} as const;
