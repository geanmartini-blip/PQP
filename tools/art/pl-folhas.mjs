// Junta os quadros de cada boneco do PixelLab numa folha só, para o jogo baixar uma imagem por boneco
// (e o app offline guardar dezenas de arquivos em vez de milhares).
// Lê art-src/pl/<boneco>/ (andar em <dir>_<i>.png, golpe em golpe_<dir>_<i>.png, como o
// tools/art/pl-boneco.mjs grava) e escreve:
// - packages/client/public/pl/<boneco>/folha.png: linhas 0 a 3 = andar (sul, oeste, norte, leste),
//   linhas 4 a 7 = golpe, quando houver; uma coluna por quadro;
// - packages/client/src/art/plBonecos.json: { <boneco>: { w, h, andar, golpe } }.
// Uso: node tools/art/pl-folhas.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const SRC = 'art-src/pl';
const OUT = 'packages/client/public/pl';
const DIRS = ['south', 'west', 'north', 'east'];

const conta = (pasta, prefixo) => {
  let n = 0;
  while (existsSync(join(pasta, `${prefixo}south_${n}.png`))) n++;
  return n;
};

const bonecos = readdirSync(SRC).filter((b) => existsSync(join(SRC, b, 'south_0.png'))).sort();
const b = await chromium.launch();
const p = await b.newPage();
const man = {};
for (const boneco of bonecos) {
  const pasta = join(SRC, boneco);
  const andar = conta(pasta, '');
  const golpe = conta(pasta, 'golpe_');
  const quadros = [];
  for (const [linha0, prefixo, n] of [[0, '', andar], [4, 'golpe_', golpe]])
    DIRS.forEach((d, k) => {
      for (let i = 0; i < n; i++) quadros.push([linha0 + k, i, readFileSync(join(pasta, `${prefixo}${d}_${i}.png`)).toString('base64')]);
    });
  const res = await p.evaluate(
    async ({ quadros, linhas, colunas }) => {
      const load = async (s) => {
        const i = new Image();
        i.src = 'data:image/png;base64,' + s;
        await i.decode();
        return i;
      };
      const imgs = await Promise.all(quadros.map(([, , s]) => load(s)));
      const w = imgs[0].width, h = imgs[0].height;
      const c = document.createElement('canvas');
      c.width = w * colunas;
      c.height = h * linhas;
      const g = c.getContext('2d');
      quadros.forEach(([linha, col], k) => g.drawImage(imgs[k], col * w, linha * h));
      return { png: c.toDataURL('image/png').split(',')[1], w, h };
    },
    { quadros, linhas: golpe ? 8 : 4, colunas: Math.max(andar, golpe) },
  );
  mkdirSync(join(OUT, boneco), { recursive: true });
  writeFileSync(join(OUT, boneco, 'folha.png'), Buffer.from(res.png, 'base64'));
  man[boneco] = { w: res.w, h: res.h, andar, golpe };
}
await b.close();
writeFileSync('packages/client/src/art/plBonecos.json', JSON.stringify(man, null, 1) + '\n');
console.log(`${bonecos.length} folhas`);
