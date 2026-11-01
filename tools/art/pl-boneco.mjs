// Leva um boneco do PixelLab para o jogo: lê o zip já extraído (o "download" do personagem:
// <pasta>/<Estado>/animations/<anim>/<dir>/frame_00i.png), recorta todos os quadros de andar e golpe
// no mesmo retângulo (a união do conteúdo, para os pés não pularem) e grava em
// packages/client/public/pl/<boneco>/: andar como <dir>_<i>.png e golpe como golpe_<dir>_<i>.png.
// Uso: node tools/art/pl-boneco.mjs <pasta extraída> <boneco>
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const [SRC, BONECO] = process.argv.slice(2);
if (!SRC || !BONECO) throw new Error('uso: node tools/art/pl-boneco.mjs <pasta extraída> <boneco>');
const estado = readdirSync(SRC).find((f) => existsSync(join(SRC, f, 'animations'))) ?? readdirSync(SRC).find((f) => existsSync(join(SRC, f, 'rotations')));
const ANIM = join(SRC, estado, 'animations');
const OUT = `packages/client/public/pl/${BONECO}`;
const DIRS = ['south', 'west', 'north', 'east'];

const imgs = [];
// NPC parado (sem animação): a rotação de cada direção vira o quadro <dir>_0
if (!existsSync(ANIM))
  for (const d of DIRS) imgs.push([`${d}_0`, readFileSync(join(SRC, estado, 'rotations', `${d}.png`)).toString('base64')]);
for (const [anim, prefixo] of [['andar', ''], ['golpe', 'golpe_']]) {
  if (!existsSync(ANIM) || !existsSync(join(ANIM, anim))) continue;
  for (const d of DIRS) {
    const pasta = join(ANIM, anim, d);
    if (!existsSync(pasta)) continue;
    readdirSync(pasta)
      .filter((f) => /^frame_\d+\.png$/.test(f))
      .sort()
      .forEach((f, i) => imgs.push([`${prefixo}${d}_${i}`, readFileSync(join(pasta, f)).toString('base64')]));
  }
}

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
  // simétrico em volta do centro do canvas, para o boneco não andar de lado entre andar e golpe
  const cx = quadros[0][1].width / 2;
  const meia = Math.ceil(Math.max(cx - x0, x1 + 1 - cx)) + 1;
  const w = meia * 2, h = y1 - y0 + 3;
  const out = {};
  for (const [nome, c] of quadros) {
    const q = document.createElement('canvas');
    q.width = w; q.height = h;
    q.getContext('2d').drawImage(c, cx - meia, y0 - 1, w, h, 0, 0, w, h);
    out[nome] = q.toDataURL('image/png').split(',')[1];
  }
  return { out, w, h };
}, imgs);
await b.close();
mkdirSync(OUT, { recursive: true });
for (const [nome, png] of Object.entries(res.out)) writeFileSync(`${OUT}/${nome}.png`, Buffer.from(png, 'base64'));
console.log(`${BONECO}: ${Object.keys(res.out).length} quadros ${res.w}x${res.h}`);
