// Comum aos módulos do cenário: saída, lista para o preview, paletas de material.
import { outline, ramp, saveSprite } from '../lib/img.mjs';
import { R } from '../lib/paleta.mjs';

export const OUT = 'packages/client/public/teste-visual/';
export const all = []; // { name, img, lado, e }

export function save(name, s, lado, opts = {}) {
  const img = s.img ?? s;
  if (!opts.noOutline) outline(img);
  saveSprite(OUT + name, img, { emissive: s.hasE ? s.E : null, normal: opts.normal ?? {} });
  all.push({ name, img, lado, e: !!s.hasE });
}

export const P = {
  PEDRA_M: ramp(0x8a7058, 4),
  PEDRA_M2: ramp(0x9a8068, 4),
  PEDRA_G: ramp(0x8a8478, 4),
  MAD: ramp(0x8a5432, 4),
  MAD_E: ramp(0x6a3e24, 4),
  MAD_C: ramp(0xb07a46, 4),
  MUSGO: ramp(0x5e9434, 4),
  MUSGO_L: ramp(0x86b440, 4),
  MUSGO_E: ramp(0x447a2c, 4),
  FOLHA: R.folha,
  FOLHA_E: ramp(0x3a7034, 4),
  FOLHA_L: ramp(0x6aa440, 4),
  ROXO: ramp(0xa46ad8, 4),
  LILAS: ramp(0xd6a6f0, 4),
  BRANCO: ramp(0xf0ece4, 4),
  LARANJA: R.laranja,
  GRAF: R.grafite,
  CINZA: ramp(0x80868f, 4),
  CINZA_E: ramp(0x5e646e, 4),
  METAL: R.metal,
  ARD: R.ardosia,
  FERRUG: R.ferrugem,
  AMAR: ramp(0xf2c230, 4),
  OURO: R.ouro,
  PALHA: ramp(0xd0a858, 4),
  PALHA_E: ramp(0xa88440, 4),
  VERDE_J: ramp(0x4a8a4a, 4),
  CORTINA_V: ramp(0x9a3a3a, 4),
  CORTINA_R: ramp(0x7a4ab0, 4),
  CONCRETO: ramp(0x8a8c90, 4),
};
