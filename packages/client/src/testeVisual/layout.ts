/**
 * Disposição da cena de teste da Ponte do Rio Claro (coordenadas do mundo em px de arte).
 * x, y = base do objeto (pés / rodapé), que também é a profundidade (ordenação por y).
 * Igual em conteúdo ao docs/alvo-tela.png: a tela de ~390 px de arte centrada na ponte mostra a
 * casa de musgo, a árvore roxa e a banca da Benzedeira à esquerda, o rio com a cascata no meio e o
 * prédio neon, o quiosque e o PM à direita.
 */
export const MUNDO = { w: 736, h: 1600, rioX0: 320, rioX1: 448, ponteY: 816 };

export interface Peca {
  k: string; // textura
  x: number;
  y: number;
  flip?: boolean;
  /** deslocamento da profundidade (ex.: fundo da banca atrás da Benzedeira) */
  z?: number;
  /** retângulo que bloqueia o andar, relativo à base: [dx, dy, w, h] */
  bloqueia?: [number, number, number, number];
  /** luz pontual: [dx, dy, raio, cor, intensidade] */
  luz?: [number, number, number, number, number];
}

const LAMP_E: Peca['luz'] = [0, -40, 100, 0xffa040, 1.5];
const LAMP_D: Peca['luz'] = [0, -40, 110, 0xffc060, 1.5];
const RUNA: Peca['luz'] = [0, -18, 56, 0x60e0ff, 1.1];

const FIXAS: Peca[] = [
  // ---------- Esquerda ----------
  { k: 'arvore', x: 210, y: 560 },
  { k: 'pinheiro', x: 296, y: 590 },
  { k: 'arvore', x: 150, y: 620, flip: true },
  { k: 'casa_musgo', x: 246, y: 712, bloqueia: [-46, -40, 92, 40], luz: [0, -30, 90, 0xffb050, 1.3] },
  { k: 'bandeira_raizes', x: 304, y: 760 },
  { k: 'lampiao_madeira', x: 306, y: 808, luz: LAMP_E },
  { k: 'pedra_runa', x: 284, y: 784, luz: RUNA },
  { k: 'arvore_roxa', x: 196, y: 812, bloqueia: [-12, -8, 24, 8], luz: [0, -60, 130, 0xb070ff, 1.2] },
  { k: 'pedra_runa_2', x: 222, y: 878, luz: RUNA },
  { k: 'lampiao_madeira', x: 300, y: 900, luz: LAMP_E },
  { k: 'banca_roxa_fundo', x: 246, y: 1000, z: -30, bloqueia: [-30, -24, 60, 24] },
  { k: 'banca_roxa_frente', x: 246, y: 1001 },
  { k: 'cerca_madeira', x: 160, y: 1060 },
  { k: 'cerca_madeira', x: 192, y: 1060 },
  { k: 'lampiao_madeira', x: 214, y: 1100, luz: LAMP_E },
  { k: 'arvore', x: 290, y: 1160 },
  { k: 'pinheiro', x: 170, y: 1140 },
  { k: 'pedra_runa', x: 300, y: 1060, luz: RUNA },
  { k: 'arvore_roxa', x: 110, y: 980 },
  { k: 'pinheiro', x: 120, y: 760 },
  // ---------- Direita ----------
  { k: 'predio_neon', x: 540, y: 744, bloqueia: [-62, -50, 124, 50], luz: [0, -70, 150, 0xff40d0, 1.1] },
  { k: 'predio_neon', x: 680, y: 640 },
  { k: 'predio_neon', x: 530, y: 590 },
  { k: 'tubo_ciano', x: 466, y: 736, luz: [0, -20, 70, 0x40f0ff, 1.3] },
  { k: 'tubo_ciano', x: 614, y: 748, luz: [0, -20, 70, 0x40f0ff, 1.3] },
  { k: 'painel_holograma', x: 632, y: 820 },
  { k: 'lampiao_metal', x: 462, y: 800, luz: LAMP_D },
  { k: 'lampiao_metal', x: 462, y: 930, luz: LAMP_D },
  { k: 'lixeira', x: 600, y: 846 },
  { k: 'quiosque_laranja', x: 548, y: 940, bloqueia: [-30, -22, 60, 22], luz: [0, -30, 90, 0xffa040, 1.1] },
  { k: 'barril', x: 594, y: 948 },
  { k: 'barril', x: 606, y: 958 },
  { k: 'barril_madeira', x: 492, y: 962 },
  { k: 'caixa', x: 510, y: 972 },
  { k: 'caixa', x: 500, y: 984 },
  { k: 'pilha_caixas', x: 628, y: 920 },
  { k: 'placa_perigo', x: 470, y: 1020 },
  { k: 'cerca_metal', x: 470, y: 1060 },
  { k: 'cerca_metal', x: 502, y: 1060 },
  { k: 'cano', x: 600, y: 1040 },
  { k: 'tubo_ciano', x: 560, y: 1050, luz: [0, -20, 70, 0x40f0ff, 1.3] },
  { k: 'lampiao_metal', x: 462, y: 1110, luz: LAMP_D },
  { k: 'predio_neon', x: 560, y: 1230, bloqueia: [-62, -50, 124, 50] },
  { k: 'cerca_metal', x: 470, y: 690 },
  { k: 'barril', x: 640, y: 1090 },
  { k: 'pilha_caixas', x: 660, y: 1000 },
];

// enfeites espalhados na Esquerda (grama densa): posições fixas por sorteio com semente
function sorteio(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}
function longeDoCaminho(x: number, y: number) {
  // calçamento: da ponte para oeste em y≈830 e descendo/subindo em x≈250
  if (Math.abs(y - 830) < 26 && x > 200) return false;
  if (Math.abs(x - 250) < 26 && y > 700 && y < 1120) return false;
  return true;
}
const ENFEITES: Peca[] = [];
{
  const r = sorteio(7);
  const tipos = ['touceira', 'touceira', 'flores_0', 'flores_1', 'flores_2', 'arbusto', 'cogumelos', 'pedras', 'touceira', 'flores_1'];
  for (let i = 0; i < 90; i++) {
    const x = 130 + r() * 180, y = 560 + r() * 640;
    if (!longeDoCaminho(x, y)) continue;
    if (FIXAS.some((p) => Math.abs(p.x - x) < 26 && y < p.y + 6 && y > p.y - 40)) continue;
    ENFEITES.push({ k: tipos[Math.floor(r() * tipos.length)]!, x: Math.round(x), y: Math.round(y) });
  }
}
export const PECAS: Peca[] = [...FIXAS, ...ENFEITES];

/** Bonecos: chave do atlas, posição, animação inicial. */
export const NPCS = [
  { k: 'idol', x: 352, y: 832, anim: 'parado_baixo', flip: false },
  { k: 'benzedeira', x: 246, y: 984, anim: 'parado_baixo', flip: false },
  { k: 'pm', x: 514, y: 872, anim: 'parado_baixo', flip: false },
];
export const DRONES = [
  { k: 'drone', x: 590, y: 800 },
  { k: 'drone', x: 520, y: 1010 },
];
export const ELITE = { k: 'drone_elite', x: 478, y: 840, aviso: { x: 398, y: 846 } };
export const JOGADOR = { x: 398, y: 840 };
