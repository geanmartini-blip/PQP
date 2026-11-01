// Mock do caminho "PixelLab com a referência": usa a arte de referência que já temos (bonecos de
// docs/alvo-personagens.png e a tela de docs/alvo-tela.png) como se fosse a saída do PixelLab, para
// ver no motor do jogo como fica o pixel art nesse nível. NÃO é saída do PixelLab.
// - Recorta os quadros dos 4 bonecos (fundo azul-marinho vira transparente).
// - Tira o caubói "pintado" da tela de fundo (remendo copiando tábuas e chapa vizinhas), para o
//   caubói controlável andar por cima.
// Uso: node tools/art/mock-pixellab.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const OUT = 'packages/client/public/mock-pixellab';
mkdirSync(OUT, { recursive: true });
const b64 = (f) => 'data:image/png;base64,' + readFileSync(f).toString('base64');
const b = await chromium.launch();
const p = await b.newPage();

const res = await p.evaluate(async ([folha, tela]) => {
  const load = async (s) => { const i = new Image(); i.src = s; await i.decode(); return i; };
  const out = {};
  // ---------- quadros dos bonecos ----------
  const F = await load(folha);
  const c = document.createElement('canvas');
  c.width = F.width; c.height = F.height;
  const g = c.getContext('2d');
  g.drawImage(F, 0, 0);
  const im = g.getImageData(0, 0, c.width, c.height);
  const d = im.data;
  // fundo azul-marinho → transparente (com margem suave na borda)
  for (let k = 0; k < d.length; k += 4) {
    const dist = Math.hypot(d[k] - 1, d[k + 1] - 9, d[k + 2] - 27);
    if (dist < 26) d[k + 3] = 0;
    else if (dist < 40) d[k + 3] = Math.round(((dist - 26) / 14) * 255);
  }
  g.putImageData(im, 0, 0);
  const opaco = (x, y) => d[(y * c.width + x) * 4 + 3] > 40;
  // faixas com conteúdo: projeção nos eixos dentro de um retângulo
  const faixas = (x0, x1, y0, y1, eixo) => {
    const n = eixo === 'y' ? y1 - y0 : x1 - x0;
    const tem = new Array(n).fill(false);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (opaco(x, y)) tem[eixo === 'y' ? y - y0 : x - x0] = true;
    const r = [];
    let ini = -1;
    for (let i = 0; i <= n; i++) {
      if (i < n && tem[i]) { if (ini < 0) ini = i; }
      else if (ini >= 0) { if (i - ini > 20) r.push([ini + (eixo === 'y' ? y0 : x0), i + (eixo === 'y' ? y0 : x0)]); ini = -1; }
    }
    return r;
  };
  const metades = { esq: [0, 740], dir: [740, c.width] };
  const nomes = { esq: [['peao', 'baixo'], ['peao', 'cima'], ['peao', 'lado'], ['benzedeira', 'baixo'], ['benzedeira', 'cima'], ['benzedeira', 'lado']], dir: [['idol', 'baixo'], ['idol', 'cima'], ['idol', 'lado'], ['pm', 'baixo'], ['pm', 'cima'], ['pm', 'lado']] };
  out.quadros = {};
  for (const [m, [x0, x1]] of Object.entries(metades)) {
    const linhas = faixas(x0, x1, 0, c.height, 'y');
    linhas.slice(0, 6).forEach(([y0, y1], li) => {
      const cols = faixas(x0, x1, y0, y1, 'x').slice(0, 4);
      const [boneco, dir] = nomes[m][li];
      cols.forEach(([cx0, cx1], ci) => {
        const w = cx1 - cx0 + 4, h = y1 - y0 + 4;
        const q = document.createElement('canvas');
        q.width = w; q.height = h;
        q.getContext('2d').drawImage(c, cx0 - 2, y0 - 2, w, h, 0, 0, w, h);
        out.quadros[`${boneco}_${dir}_${ci}`] = { png: q.toDataURL('image/png').split(',')[1], w, h };
      });
    });
  }
  // ---------- tela de fundo sem o caubói ----------
  const T = await load(tela);
  const t = document.createElement('canvas');
  t.width = T.width; t.height = T.height;
  const tg = t.getContext('2d');
  tg.drawImage(T, 0, 0);
  const src = tg.getImageData(0, 0, t.width, t.height);
  const dst = tg.getImageData(0, 0, t.width, t.height);
  // região do caubói + aviso pintados; o remendo repete faixas livres vizinhas da mesma linha:
  // madeira entre a Idol e o caubói (x 173..191), chapa entre o caubói e o drone (x 287..301; abaixo
  // do drone vai até 345), e a faixa de perigo continua de baixo para cima.
  const [rx0, ry0, rx1, ry1] = [192, 300, 286, 444];
  for (let y = ry0; y <= ry1; y++)
    for (let x = rx0; x <= rx1; x++) {
      let sx, sy = y;
      const madeira = x < 230;
      if (x >= 222 && x <= 237 && y > 395) { sx = x; sy = y + 45; }
      else if (y < 336) { sx = x; sy = y - 36; } // água atrás do chapéu: a mesma água mais acima
      else if (madeira) sx = 173 + ((x - rx0) % 19);
      else if (y >= 398) sx = 287 + ((x - 230) % 58);
      else sx = 287 + ((x - 230) % 15);
      const i = (y * t.width + x) * 4, j = (sy * t.width + sx) * 4;
      for (let k = 0; k < 4; k++) dst.data[i + k] = src.data[j + k];
    }
  tg.putImageData(dst, 0, 0);
  out.fundo = t.toDataURL('image/png').split(',')[1];
  out.fundoTam = [t.width, t.height];
  return out;
}, [b64('docs/alvo-personagens.png'), b64('docs/alvo-tela.png')]);
await b.close();

const man = {};
for (const [k, q] of Object.entries(res.quadros)) {
  writeFileSync(`${OUT}/${k}.png`, Buffer.from(q.png, 'base64'));
  man[k] = { w: q.w, h: q.h };
}
writeFileSync(`${OUT}/fundo.png`, Buffer.from(res.fundo, 'base64'));
writeFileSync(`${OUT}/manifest.json`, JSON.stringify({ quadros: man, fundo: res.fundoTam }, null, 1));
console.log(Object.keys(man).length + ' quadros');
