// Recorta e amplia um pedaço de uma imagem (para comparar detalhes com a referência).
// Uso: node tools/art/recorte.mjs <entrada.png> <saida.png> <x> <y> <w> <h> [escala=3]
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const [inp, out, x, y, w, h, s = '3'] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage();
const data = await p.evaluate(async ([src, x, y, w, h, s]) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = w * s;
  c.height = h * s;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(img, x, y, w, h, 0, 0, w * s, h * s);
  return c.toDataURL('image/png').split(',')[1];
}, ['data:image/png;base64,' + readFileSync(inp).toString('base64'), +x, +y, +w, +h, +s]);
writeFileSync(out, Buffer.from(data, 'base64'));
await b.close();
console.log(out);
