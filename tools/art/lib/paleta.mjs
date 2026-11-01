// Paleta provisória da revisão visual (vira assets/paletas.json na etapa 2).
// Cada material é a cor base; a rampa de 4 tons sai de ramp(base) com hue shift.
import { ramp } from './img.mjs';

export const BASE = {
  // Esquerda mística
  grama: 0x6f9a3a, gramaSeca: 0x9aa844, musgo: 0x5e8a34, folha: 0x4f8a3a, oliva: 0x7d8a3a,
  roxoMagico: 0x9b5fd0, roxoFolha: 0xb070e0, azulRuna: 0x7fd8ff, madeira: 0x8a5a34, madeiraClara: 0xb07a46,
  pedraMarrom: 0x8a7462, terra: 0x9a7048, palha: 0xc8a25a,
  // Direita tecnológica
  grafite: 0x4a4e58, ardosia: 0x5f6878, pedraCinza: 0x7a808c, metal: 0x8b94a3, laranja: 0xe0782a,
  ambar: 0xf2b23a, ciano: 0x3ee6f0, magenta: 0xf03cc8, ferrugem: 0xa0522d, perigo: 0xf2c230,
  // Comuns
  agua: 0x2f7fb0, aguaClara: 0x5fc4e8, espuma: 0xd8f4ff, pele: 0xe0a070, peleMorena: 0xb87850,
  vermelho: 0xc8382e, jeans: 0x3e5f9a, couro: 0x7a4a2a, ouro: 0xe8b830, branco: 0xe8e4dc, preto: 0x2a2630,
};

export const R = Object.fromEntries(Object.entries(BASE).map(([k, v]) => [k, ramp(v, 4)]));
