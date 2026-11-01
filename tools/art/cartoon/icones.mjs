// Ícones cartoon dos botões do HUD (Peão Brabo): laço, chifre, chapéu, Especial (touro-espírito) e
// garrafada. 64x64 u, renderizados em 3x. Uso: node tools/art/cartoon/icones.mjs
import { writeFileSync } from 'node:fs';
import { blob, brilho, cel, curva, elipse, renderizar, retRed, traco } from './lib.mjs';

const OUT = 'packages/client/public/teste-cartoon';
const S = 64;
const corda = '#e0b064';

const laco =
  traco(`M10,34 C10,14 54,14 54,32 C54,48 18,50 14,38`, '#5a3a1a', 11) + traco(`M10,34 C10,14 54,14 54,32 C54,48 18,50 14,38`, corda, 7) +
  traco(`M12,30 C14,20 30,17 44,20`, '#fff2c8', 2.5, 0.8) +
  traco(`M14,38 C20,46 28,52 34,58`, '#5a3a1a', 11) + traco(`M14,38 C20,46 28,52 34,58`, corda, 7) +
  [0, 1, 2, 3, 4, 5].map((k) => traco(`M${16 + k * 6},${21 - (k % 2) * 1} l3,5`, '#a87a3a', 1.6)).join('');

// chifrada: dois chifres curvos em investida, com rastro de impacto
const chifre =
  traco('M6,50 L20,44 M8,58 L24,50 M4,42 L16,38', '#c8b896', 3, 0.7) +
  cel(blob([[18, 46], [24, 30], [36, 18], [52, 10], [58, 12], [46, 22], [34, 36], [28, 50]]), '#e2d4b4', { s: 3, l: 2, w: 2.5, cc: '#3a2c1c' }) +
  cel(blob([[30, 54], [38, 40], [48, 32], [60, 30], [60, 34], [50, 40], [42, 50], [38, 58]]), '#cfc09e', { s: 3, l: 2, w: 2.5, cc: '#3a2c1c' }) +
  cel(blob([[16, 44], [26, 42], [36, 50], [34, 60], [22, 60], [14, 54]]), '#5a3a26', { s: 3, l: 2, w: 2.5 });

const chapeu =
  cel(blob([[4, 42], [14, 36], [32, 36], [50, 36], [60, 42], [52, 50], [32, 52], [12, 50]]), '#9a6234', { s: 4, l: 2, w: 3.2 }) +
  cel(blob([[16, 40], [16, 24], [22, 14], [32, 18], [42, 14], [48, 24], [48, 40]]), '#a86c3a', { s: 5, l: 3, w: 3.2 }) +
  cel(retRed(16, 34, 32, 7, 3), '#4a2a14', { s: 1.5, l: 1, w: 2 }) +
  [22, 32, 42].map((x) => cel(elipse(x, 37.5, 2.4, 2.4), '#ffd23a', { s: 1, l: 0.8, w: 1.2 })).join('') + brilho(23, 22, 4, 2);

// touro-espírito: crânio de touro translúcido em brasa azul, sem cara de mascote
const especial =
  `<defs><radialGradient id="ge" cx="0.5" cy="0.45"><stop offset="0" stop-color="#e8fbff"/><stop offset="0.45" stop-color="#6ccce8"/><stop offset="1" stop-color="#1c5a86"/></radialGradient></defs>` +
  `<path d="${blob([[4, 18], [10, 8], [20, 14], [24, 22], [16, 22]])}" fill="url(#ge)" stroke="#0c2a44" stroke-width="2.5"/>` +
  `<path d="${blob([[60, 18], [54, 8], [44, 14], [40, 22], [48, 22]])}" fill="url(#ge)" stroke="#0c2a44" stroke-width="2.5"/>` +
  `<path d="${blob([[16, 20], [32, 16], [48, 20], [50, 36], [42, 54], [32, 60], [22, 54], [14, 36]])}" fill="url(#ge)" stroke="#0c2a44" stroke-width="3"/>` +
  `<path d="M20,32 L28,36 L22,38Z M44,32 L36,36 L42,38Z" fill="#0c2a44"/>` +
  `<path d="M28,50 Q32,54 36,50" fill="none" stroke="#0c2a44" stroke-width="2"/><circle cx="29" cy="47" r="1.3" fill="#0c2a44"/><circle cx="35" cy="47" r="1.3" fill="#0c2a44"/>` +
  traco('M32,22 L32,40', '#ffffff', 1.5, 0.5);

const garrafada =
  cel(retRed(26, 6, 12, 10, 3), '#9a6a3a', { s: 1.5, l: 1, w: 2.5 }) +
  cel(retRed(24, 14, 16, 8, 3), '#cfe8e0', { s: 1.5, l: 1, w: 2.5 }) +
  cel(elipse(32, 40, 20, 20), '#3fbf6a', { s: 6, l: 3, w: 3.5 }) +
  `<path d="M14,40 Q32,32 50,40 A18,18 0 0,1 14,40Z" fill="#2a9a52" opacity="0.6"/>` +
  cel(retRed(20, 36, 24, 12, 4), '#f4e2b0', { s: 2, l: 1, w: 2 }) + traco('M25,42 h14', '#8a5a2a', 2) + brilho(22, 30, 6, 3) + brilho(44, 48, 2, 1.2, -35, 0.6);

const man = await renderizar(OUT, [
  { nome: 'icone_laco', w: S, h: S, svg: laco },
  { nome: 'icone_chifre', w: S, h: S, svg: chifre },
  { nome: 'icone_chapeu', w: S, h: S, svg: chapeu },
  { nome: 'icone_especial', w: S, h: S, svg: especial },
  { nome: 'icone_garrafada', w: S, h: S, svg: garrafada },
]);
writeFileSync(`${OUT}/pecas-icones.json`, JSON.stringify(man, null, 1));
console.log('icones ok');
