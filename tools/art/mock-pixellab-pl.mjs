// Leva o Peão gerado pelo PixelLab (pixellab/resultados/andar/<dir>_<i>.png, canvas 128x128) para o
// mock: recorta todos os quadros no mesmo retângulo (a união do conteúdo de todos), para os pés não
// pularem entre quadros, e grava packages/client/public/mock-pixellab/pl_<dir>_<i>.png mais a lista no
// manifest.json (chave "pl"). As direções são as do PixelLab: south, north, east e west.
// Uso: node tools/art/mock-pixellab-pl.mjs [pasta]   (padrão: a v2, cabelo castanho e cabeça maior)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright';

const SRC = process.argv[2] ?? 'pixellab/resultados/v2/andar';
const OUT = 'packages/client/public/mock-pixellab';
const arquivos = readdirSync(SRC).filter((f) => /^(south|north|east|west)_\d+\.png$/.test(f)).sort();
const b = await chromium.launch();
const p = await b.newPage();
const res = await p.evaluate(async (imgs) => {
  const load = async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; };
  const quadros = [];
  let [x0, y0, x1, y1] = [1e9, 1e9, -1, -1];
  for (const [nome, png] of imgs) {
    const im = await load(png);
    const c = document.createElement('canvas');
    c.width = im.width; c.height = im.height;
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++)
        if (d[(y * c.width + x) * 4 + 3] > 20) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    quadros.push([nome, c]);
  }
  const w = x1 - x0 + 3, h = y1 - y0 + 3;
  const out = {};
  for (const [nome, c] of quadros) {
    const q = document.createElement('canvas');
    q.width = w; q.height = h;
    q.getContext('2d').drawImage(c, x0 - 1, y0 - 1, w, h, 0, 0, w, h);
    out[nome] = q.toDataURL('image/png').split(',')[1];
  }
  return { out, w, h };
}, arquivos.map((f) => [f.replace('.png', ''), readFileSync(`${SRC}/${f}`).toString('base64')]));
await b.close();

const man = JSON.parse(readFileSync(`${OUT}/manifest.json`, 'utf8'));
man.pl = { w: res.w, h: res.h, quadros: [] };
for (const [nome, png] of Object.entries(res.out)) {
  writeFileSync(`${OUT}/pl_${nome}.png`, Buffer.from(png, 'base64'));
  man.pl.quadros.push('pl_' + nome);
}
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(man, null, 1));
console.log(`${man.pl.quadros.length} quadros ${res.w}x${res.h}`);
