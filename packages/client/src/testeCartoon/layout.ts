/**
 * Disposição da cena cartoon da Ponte do Rio Claro (em u: 1 u = 1 px de CSS com zoom 1).
 * x, y = base do objeto (centro do rodapé), que também é a profundidade.
 * Igual em conteúdo ao docs/alvo-tela.png.
 */
export const MUNDO = { w: 1000, h: 2000, rioX0: 450, rioX1: 600, banco: 28, ponteY: 1000 };

export interface Peca {
  k: string;
  x: number;
  y: number;
  flip?: boolean;
  /** deslocamento da profundidade */
  z?: number;
  /** retângulo que bloqueia o andar, relativo à base: [dx, dy, w, h] */
  bloqueia?: [number, number, number, number];
  /** luz pontual: [dx, dy, raio, cor, intensidade] */
  luz?: [number, number, number, number, number];
  /** sem sombra projetada (peças planas no chão) */
  plana?: boolean;
}

const LAMP_E: Peca['luz'] = [0, -100, 170, 0xffa040, 1.6];
const LAMP_D: Peca['luz'] = [0, -110, 180, 0xffc070, 1.6];
const RUNA: Peca['luz'] = [0, -40, 90, 0x60e0ff, 0.7];

const FIXAS: Peca[] = [
  // ---------- Esquerda ----------
  { k: 'arvore', x: 160, y: 700 },
  { k: 'arvore_2', x: 420, y: 690 },
  { k: 'pinheiro', x: 60, y: 820 },
  { k: 'pinheiro', x: 250, y: 650 },
  { k: 'varal_lanternas', x: 290, y: 770, luz: [0, -50, 150, 0xffb060, 1.1] },
  { k: 'casa_musgo', x: 330, y: 880, bloqueia: [-95, -60, 190, 60], luz: [0, -70, 170, 0xffb050, 1.4] },
  { k: 'totem_raizes', x: 190, y: 900, luz: [0, -60, 110, 0x70ffb0, 0.6] },
  { k: 'bandeira_raizes', x: 440, y: 930 },
  { k: 'pedra_runa', x: 425, y: 975, luz: RUNA },
  { k: 'lampiao_madeira', x: 438, y: 1050, luz: LAMP_E },
  { k: 'arvore_roxa', x: 230, y: 1050, bloqueia: [-20, -14, 40, 14], luz: [0, -140, 220, 0xb070ff, 1.3] },
  { k: 'pedra_runa_2', x: 300, y: 1130, luz: RUNA },
  { k: 'poco', x: 150, y: 1150, bloqueia: [-30, -24, 60, 24] },
  { k: 'banca_roxa_fundo', x: 350, y: 1240, z: -50, bloqueia: [-70, -40, 140, 40] },
  { k: 'banca_roxa_frente', x: 350, y: 1241 },
  { k: 'vasos_ervas', x: 430, y: 1250 },
  { k: 'lampiao_madeira', x: 430, y: 1160, luz: LAMP_E },
  { k: 'rochedo', x: 80, y: 1060 },
  { k: 'troncos', x: 120, y: 1290 },
  { k: 'cerca_madeira', x: 200, y: 1330 },
  { k: 'cerca_madeira', x: 264, y: 1330 },
  { k: 'arvore', x: 420, y: 1420 },
  { k: 'pinheiro', x: 180, y: 1440 },
  { k: 'totem_raizes', x: 60, y: 1380, luz: [0, -60, 110, 0x70ffb0, 0.6] },
  // ---------- Direita ----------
  { k: 'predio_alto', x: 920, y: 760 },
  { k: 'predio_neon', x: 760, y: 900, bloqueia: [-125, -70, 250, 70], luz: [0, -150, 240, 0xff40d0, 1.2] },
  { k: 'tubo_ciano', x: 640, y: 905, luz: [0, -45, 110, 0x40f0ff, 1.4] },
  { k: 'tubo_ciano', x: 896, y: 915, luz: [0, -45, 110, 0x40f0ff, 1.4] },
  { k: 'lampiao_metal', x: 622, y: 970, luz: LAMP_D },
  { k: 'lampiao_metal', x: 622, y: 1160, luz: LAMP_D },
  { k: 'poca_neon', x: 730, y: 1040, plana: true },
  { k: 'bueiro', x: 820, y: 1000, plana: true },
  { k: 'painel_holograma', x: 940, y: 1050 },
  { k: 'cartaz', x: 990, y: 960 },
  { k: 'quiosque_laranja', x: 790, y: 1180, bloqueia: [-70, -40, 140, 40], luz: [0, -70, 140, 0xffa040, 1.2] },
  { k: 'lixeira', x: 680, y: 1130 },
  { k: 'barril', x: 885, y: 1190 },
  { k: 'barril', x: 905, y: 1205 },
  { k: 'barril_madeira', x: 700, y: 1215 },
  { k: 'caixa', x: 725, y: 1235 },
  { k: 'pilha_caixas', x: 940, y: 1160 },
  { k: 'cone', x: 660, y: 1240 },
  { k: 'placa_perigo', x: 640, y: 1300 },
  { k: 'cerca_metal', x: 700, y: 1310 },
  { k: 'cerca_metal', x: 764, y: 1310 },
  { k: 'ar_condicionado', x: 880, y: 1300 },
  { k: 'oficina_neon', x: 820, y: 1520, bloqueia: [-115, -60, 230, 60] },
  { k: 'cano', x: 660, y: 1380 },
  { k: 'lampiao_metal', x: 622, y: 1400, luz: LAMP_D },
];

// enfeites espalhados na grama da Esquerda
function sorteio(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}
function longeDoCaminho(x: number, y: number) {
  if (Math.abs(y - 1010) < 40 && x > 300) return false;
  if (Math.abs(x - 352) < 40 && y > 800 && y < 1600) return false;
  if (Math.abs(y - 1020) < 34 && x < 360) return false;
  return true;
}
const ENFEITES: Peca[] = [];
{
  const r = sorteio(11);
  const tipos = ['touceira', 'touceira', 'flores_0', 'flores_1', 'flores_2', 'arbusto', 'arbusto_2', 'samambaia', 'cogumelos', 'touceira', 'flores_1', 'samambaia'];
  for (let i = 0; i < 120; i++) {
    const x = 20 + r() * 420, y = 620 + r() * 900;
    if (!longeDoCaminho(x, y)) continue;
    if (FIXAS.some((p) => Math.abs(p.x - x) < 60 && y < p.y + 10 && y > p.y - 70)) continue;
    ENFEITES.push({ k: tipos[Math.floor(r() * tipos.length)]!, x: Math.round(x), y: Math.round(y) });
  }
}
export const PECAS: Peca[] = [...FIXAS, ...ENFEITES];

export const NPCS = [
  { k: 'idol', x: 478, y: 1012, dir: 'baixo' as const, flip: false },
  { k: 'benzedeira', x: 350, y: 1204, dir: 'baixo' as const, flip: false },
  { k: 'pm', x: 690, y: 1090, dir: 'lado' as const, flip: true },
];
export const DRONES = [
  { k: 'drone', x: 720, y: 990 },
  { k: 'drone', x: 850, y: 1260 },
];
export const ELITE = { k: 'drone_elite', x: 668, y: 1030, aviso: { x: 560, y: 1018 } };
export const JOGADOR = { x: 545, y: 1018 };
export const CASCATA = { x: 525, y: 560 };
