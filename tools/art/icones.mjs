// Ícones 20x20 dos botões do HUD da cena de teste (Peão Brabo): laço, chifre do touro, chapéu,
// Especial (touro-espírito) e item (garrafada). Uso: node tools/art/icones.mjs
import { Img, ball, cyl, outline, ramp, saveSprite, lightAt, pick } from './lib/img.mjs';
import { R } from './lib/paleta.mjs';

const OUT = 'packages/client/public/teste-visual/';
const S = 20;

function laco() {
  const i = new Img(S, S);
  const corda = ramp(0xd8a85a);
  // laço: anel em perspectiva + ponta da corda
  for (let a = 0; a < Math.PI * 2; a += 0.04) {
    const x = 10 + Math.cos(a) * 7, y = 8 + Math.sin(a) * 5;
    const l = lightAt(Math.cos(a) * 0.8, Math.sin(a) * 0.8);
    i.px(x, y, pick(corda, l + 0.2, x | 0, y | 0, 0.3));
    i.px(x, y + 1, corda[0]);
  }
  for (let k = 0; k < 7; k++) { i.px(14 + (k >> 1), 12 + k, corda[2 - (k & 1)]); i.px(15 + (k >> 1), 12 + k, corda[1]); }
  return outline(i);
}
function chifre() {
  const i = new Img(S, S);
  const osso = ramp(0xf0e2c0);
  ball(i, 10, 12, 6, 5, R.couro); // cabeça
  for (let k = 0; k < 7; k++) {
    i.px(4 - (k > 3 ? k - 3 : 0), 9 - k, osso[k < 3 ? 2 : 3]);
    i.px(5 - (k > 3 ? k - 3 : 0), 9 - k, osso[1]);
    i.px(16 + (k > 3 ? k - 3 : 0), 9 - k, osso[k < 3 ? 1 : 2]);
    i.px(15 + (k > 3 ? k - 3 : 0), 9 - k, osso[0]);
  }
  i.px(8, 12, 0x201010); i.px(12, 12, 0x201010);
  i.px(9, 15, R.couro[0]); i.px(11, 15, R.couro[0]);
  i.px(10, 16, R.ouro[3]); i.px(9, 16, R.ouro[2]); i.px(11, 16, R.ouro[2]);
  return outline(i);
}
function chapeu() {
  const i = new Img(S, S);
  const c = ramp(0x8a5a30);
  i.ellipse(10, 13, 9, 3.5, (x, y, nx, ny) => pick(c, lightAt(nx, ny) + 0.1, x, y));
  ball(i, 10, 9, 5, 5, c, { bias: 0.1 });
  for (let x = 5; x <= 15; x++) i.px(x, 11, R.couro[0]);
  i.px(7, 11, R.ouro[3]); i.px(10, 11, R.ouro[3]); i.px(13, 11, R.ouro[3]);
  return outline(i);
}
function especial() {
  const i = new Img(S, S);
  const esp = ramp(0x7fe0ff);
  // touro-espírito translúcido: cabeça com chifres em ciano
  ball(i, 10, 11, 6, 5.5, esp);
  for (let k = 0; k < 6; k++) { i.px(4 - (k >> 1), 9 - k, esp[3]); i.px(16 + (k >> 1), 9 - k, esp[3]); }
  i.px(8, 11, 0xffffff); i.px(12, 11, 0xffffff);
  i.px(9, 14, esp[0]); i.px(11, 14, esp[0]);
  return outline(i, { color: 0x0a2a48 });
}
function garrafada() {
  const i = new Img(S, S);
  cyl(i, 8, 3, 4, 4, ramp(0xb07a46));
  ball(i, 10, 12, 6, 6, ramp(0x52c060));
  i.px(7, 10, 0xe8ffe0); i.px(8, 9, 0xe8ffe0);
  for (let x = 6; x <= 14; x++) i.px(x, 13, 0xd8b060);
  return outline(i);
}
for (const [k, f] of Object.entries({ icone_laco: laco, icone_chifre: chifre, icone_chapeu: chapeu, icone_especial: especial, icone_garrafada: garrafada })) saveSprite(OUT + k, f());
console.log('icones ok');
