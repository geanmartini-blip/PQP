// Prints da cena de teste visual em 390x844 (dpr 3, como um celular) com Playwright, e uma prancha
// lado a lado com docs/referencia-estilo.png e docs/alvo-tela.png.
// Uso: node tools/art/print-teste.mjs [hora]   (sobe o Vite sozinho na porta 5181)
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PAGINA = process.env.PAGINA ?? 'teste-cartoon.html';
const OUT = 'tools/art/saida/' + (PAGINA.startsWith('teste-cartoon') ? 'cartoon-' : '');
mkdirSync('tools/art/saida/', { recursive: true });
const PORT = 5181;
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
async function tirar(nome, hora, andar = null, ms = 600) {
  await page.goto(`http://localhost:${PORT}/${PAGINA}?hora=${hora}`);
  await page.waitForFunction(() => window.__pronto === true, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  if (!shots.length) console.log(await page.evaluate(() => window.__escala));
  if (andar) {
    await page.evaluate((a) => (window.__andar = a), andar);
    await page.waitForTimeout(ms);
    await page.evaluate(() => (window.__andar = { x: 0, y: 0 }));
    await page.waitForTimeout(150);
  }
  const f = OUT + nome + '.png';
  await page.screenshot({ path: f });
  shots.push(f);
}
const hora = process.argv[2] ?? '18.6';
await tirar('teste-fim-de-tarde', hora);
await tirar('teste-andando-esquerda', hora, { x: -1, y: 0.15 }, 1400);
await tirar('teste-noite', '21.5');
await tirar('teste-dia', '11');

// prancha: referência | alvo | print
const b64 = (f) => 'data:image/png;base64,' + readFileSync(f).toString('base64');
const p2 = await browser.newPage({ viewport: { width: 1900, height: 860 } });
await p2.setContent(`<body style="margin:0;background:#111;display:flex;gap:10px;align-items:flex-start;padding:8px">
  <img src="${b64('docs/referencia-estilo.png')}" style="height:520px">
  <img src="${b64('docs/alvo-tela.png')}" style="height:844px">
  <img src="${b64(OUT + 'teste-fim-de-tarde.png')}" style="height:844px">
</body>`);
await p2.waitForTimeout(300);
await p2.screenshot({ path: OUT + 'comparacao.png' });
await browser.close();
vite.kill();
console.log(shots.join('\n') + '\n' + OUT + 'comparacao.png');
if (erros.length) console.log('ERROS DO CONSOLE:\n' + [...new Set(erros)].slice(0, 15).join('\n'));
process.exit(0);
