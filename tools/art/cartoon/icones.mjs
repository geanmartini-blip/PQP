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

const chifre =
  cel(blob([[6, 30], [4, 14], [10, 6], [14, 18], [20, 24]]), '#f4e6c4', { s: 3, l: 2, w: 3 }) +
  cel(blob([[58, 30], [60, 14], [54, 6], [50, 18], [44, 24]]), '#f4e6c4', { s: 3, l: 2, w: 3 }) +
  cel(blob([[14, 26], [32, 18], [50, 26], [52, 44], [42, 58], [22, 58], [12, 44]]), '#8a4a2a', { s: 5, l: 3, w: 3.5 }) +
  cel(elipse(32, 50, 11, 7), '#c88a6a', { s: 2, l: 1.5, w: 2.5 }) +
  `<circle cx="28" cy="50" r="1.8" fill="#3a1a10"/><circle cx="36" cy="50" r="1.8" fill="#3a1a10"/>` +
  `<circle cx="23" cy="34" r="3.4" fill="#1a0e0a"/><circle cx="41" cy="34" r="3.4" fill="#1a0e0a"/><circle cx="24" cy="33" r="1.1" fill="#fff"/><circle cx="42" cy="33" r="1.1" fill="#fff"/>` +
  traco('M18,28 L27,31', '#2a140c', 3) + traco('M46,28 L37,31', '#2a140c', 3) +
  cel(`M27,58 a5,5 0 1,0 10,0`, '#ffd23a', { s: 1, l: 1, w: 2 });

const chapeu =
  cel(blob([[4, 42], [14, 36], [32, 36], [50, 36], [60, 42], [52, 50], [32, 52], [12, 50]]), '#9a6234', { s: 4, l: 2, w: 3.2 }) +
  cel(blob([[16, 40], [16, 24], [22, 14], [32, 18], [42, 14], [48, 24], [48, 40]]), '#a86c3a', { s: 5, l: 3, w: 3.2 }) +
  cel(retRed(16, 34, 32, 7, 3), '#4a2a14', { s: 1.5, l: 1, w: 2 }) +
  [22, 32, 42].map((x) => cel(elipse(x, 37.5, 2.4, 2.4), '#ffd23a', { s: 1, l: 0.8, w: 1.2 })).join('') + brilho(23, 22, 4, 2);

const especial =
  `<defs><radialGradient id="ge"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#7fe8ff"/><stop offset="1" stop-color="#2a9be0"/></radialGradient></defs>` +
  cel(blob([[4, 22], [6, 6], [16, 16], [22, 20]]), '#bff6ff', { s: 2, l: 1.5, w: 2.5, cc: '#0a3a6a' }) +
  cel(blob([[60, 22], [58, 6], [48, 16], [42, 20]]), '#bff6ff', { s: 2, l: 1.5, w: 2.5, cc: '#0a3a6a' }) +
  `<path d="${blob([[12, 22], [32, 14], [52, 22], [54, 40], [44, 58], [20, 58], [10, 40]])}" fill="url(#ge)" stroke="#0a3a6a" stroke-width="3.5"/>` +
  `<ellipse cx="23" cy="34" rx="4" ry="3" fill="#0a3a6a"/><ellipse cx="41" cy="34" rx="4" ry="3" fill="#0a3a6a"/><circle cx="24" cy="33" r="1.4" fill="#fff"/><circle cx="42" cy="33" r="1.4" fill="#fff"/>` +
  traco(curva([[24, 50], [32, 53], [40, 50]]), '#0a3a6a', 2.5) + brilho(20, 24, 6, 3);

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
