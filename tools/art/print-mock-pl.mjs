// Prints do mock com o Peão do PixelLab em 390x844 (dpr 3), com Playwright:
// - lado a lado na cena (?comparar=1): Peão da referência parado à esquerda, o do PixelLab à direita;
// - o Peão do PixelLab andando nas 4 direções;
// - prancha ampliada: referência de frente | PixelLab nas 4 direções e os quadros do andar.
// Uso: node tools/art/print-mock-pl.mjs   (sobe o Vite sozinho na porta 5182)
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const OUT = 'tools/art/saida/pl-';
mkdirSync('tools/art/saida/', { recursive: true });
const PORT = 5182;
const vite = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { cwd: 'packages/client', stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite não subiu')), 30000);
  vite.stdout.on('data', (d) => { if (String(d).includes('Local')) { clearTimeout(t); res(); } });
  vite.stderr.on('data', (d) => process.stderr.write(d));
});
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(String(e)));
const shots = [];
async function tirar(nome, busca, andar = null, ms = 500) {
  await page.goto(`http://localhost:${PORT}/mock-pixellab.html${busca}`);
  await page.waitForFunction(() => window.__pronto === true, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  if (andar) {
    // segura o andar e tira o print no meio do passo
    await page.evaluate((a) => (window.__andar = a), andar);
    await page.waitForTimeout(ms);
  }
  const f = OUT + nome + '.png';
  await page.screenshot({ path: f });
  shots.push(f);
}
await tirar('lado-a-lado', '?comparar=1');
await tirar('andando-baixo', '', { x: 0, y: 1 }, 700);
await tirar('andando-cima', '', { x: 0, y: -1 }, 700);
await tirar('andando-direita', '', { x: 1, y: 0.05 }, 350);
await tirar('andando-esquerda', '', { x: -1, y: 0.05 }, 350);
await tirar('referencia', '?peao=ref');

// prancha ampliada (4x, sem suavizar)
const b64 = (f) => 'data:image/png;base64,' + readFileSync(f).toString('base64');
const R = 'pixellab/resultados/v2/';
const andar = readdirSync(R + 'andar').filter((f) => f.endsWith('.png')).sort();
const img = (f, z = 3) => `<img src="${b64(f)}" style="image-rendering:pixelated;zoom:${z}">`;
const p2 = await browser.newPage({ viewport: { width: 1700, height: 1200 } });
await p2.setContent(`<body style="margin:0;background:#1b1720;color:#ddd;font:16px sans-serif;padding:12px">
  <div style="display:flex;gap:24px;align-items:flex-end">
    <div>referência ${img('pixellab/referencia-peao-frente.png')}</div>
    <div>v1 ${img('pixellab/resultados/rotacoes/south.png')}</div>
    <div>PixelLab v2 ${['south', 'east', 'north', 'west'].map((d) => img(R + 'rotacoes/' + d + '.png')).join('')}</div>
  </div>
  <div style="margin-top:12px">andar (PixelLab, 6 quadros)</div>
  ${['south', 'east', 'north', 'west'].map((d) => `<div>${andar.filter((f) => f.startsWith(d + '_')).map((f) => img(R + 'andar/' + f, 1.5)).join('')}</div>`).join('')}
</body>`);
await p2.waitForTimeout(300);
await p2.screenshot({ path: OUT + 'prancha.png', fullPage: true });

// prints da cena lado a lado: referência | PixelLab
const p3 = await browser.newPage({ viewport: { width: 1200, height: 860 } });
await p3.setContent(`<body style="margin:0;background:#111;display:flex;gap:10px;padding:8px">
  <img src="${b64(OUT + 'referencia.png')}" style="height:844px"><img src="${b64(OUT + 'lado-a-lado.png')}" style="height:844px"><img src="${b64(OUT + 'andando-direita.png')}" style="height:844px">
</body>`);
await p3.waitForTimeout(300);
await p3.screenshot({ path: OUT + 'comparacao.png' });
await browser.close();
vite.kill();
console.log(shots.join('\n') + `\n${OUT}prancha.png\n${OUT}comparacao.png`);
if (erros.length) console.log('ERROS DO CONSOLE:\n' + [...new Set(erros)].slice(0, 15).join('\n'));
process.exit(0);
