// Cenário cartoon (Margem Esquerda, Margem Direita e a Ponte). Uso: node tools/art/cartoon/cenario.mjs [filtro]
// Gera packages/client/public/teste-cartoon/<peça>.png (+ _e.png da camada emissiva), o manifesto
// pecas-cenario.json e a prancha de conferência tools/art/saida/cartoon-cenario.png.
import { writeFileSync } from 'node:fs';
import { prancha, renderizar } from './lib.mjs';
import { pecasEsquerda } from './pecas-esq.mjs';

const DIR = 'packages/client/public/teste-cartoon';
const mods = [pecasEsquerda];
try { mods.push((await import('./pecas-dir.mjs')).pecasDireita); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
try { mods.push((await import('./pecas-meio.mjs')).pecasMeio); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }

const filtro = process.argv[2];
let pecas = mods.flatMap((m) => m());
if (filtro) pecas = pecas.filter((p) => p.nome.includes(filtro));
const man = await renderizar(DIR, pecas);
if (!filtro) writeFileSync(`${DIR}/pecas-cenario.json`, JSON.stringify(man, null, 1));
await prancha(`tools/art/saida/cartoon-cenario${filtro ? '-' + filtro : ''}.png`, DIR, pecas.map((p) => p.nome), { zoom: 1 });
await pranchaLuz(`tools/art/saida/cartoon-cenario-luz${filtro ? '-' + filtro : ''}.png`, pecas.map((p) => p.nome), man);

/** Prancha com a camada emissiva somada (ADD) por cima, sobre fundo escuro, como fica no jogo à noite. */
async function pranchaLuz(arquivo, nomes, man) {
  const { readFileSync } = await import('node:fs');
  const { chromium } = await import('playwright');
  const b64 = (n) => readFileSync(`${DIR}/${n}.png`).toString('base64');
  const html = nomes.map((n) => `<div style="display:inline-block;position:relative;margin:6px;vertical-align:bottom;font:11px sans-serif;color:#fff"><img style="zoom:${1 / 3};display:block" src="data:image/png;base64,${b64(n)}">${man[n].e ? `<img style="zoom:${1 / 3};position:absolute;left:0;top:0;mix-blend-mode:plus-lighter" src="data:image/png;base64,${b64(n + '_e')}">` : ''}<span>${n}</span></div>`).join('');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await p.setContent(`<body style="margin:0;background:linear-gradient(90deg,#4a6a3a 50%,#3a3e4a 50%);padding:8px">${html}</body>`);
  await p.waitForTimeout(200);
  await p.screenshot({ path: arquivo, fullPage: true });
  await b.close();
}
console.log(`${pecas.length} peças`);
