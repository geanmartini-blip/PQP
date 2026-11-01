// Lista o que existe em packages/client/public/teste-visual/ para a cena carregar só o que há
// (o servidor do Vite responde 200 com HTML para arquivo que falta). Uso: node tools/art/manifesto.mjs
import { readdirSync, writeFileSync } from 'node:fs';

const DIR = 'packages/client/public/teste-visual/';
const files = new Set(readdirSync(DIR));
const out = {};
for (const f of files) {
  if (!f.endsWith('.png') || /_(n|e)\.png$/.test(f)) continue;
  const k = f.slice(0, -4);
  out[k] = { atlas: files.has(k + '.json'), n: files.has(k + '_n.png'), e: files.has(k + '_e.png') };
}
writeFileSync(DIR + 'manifest.json', JSON.stringify(out, null, 1));
console.log(Object.keys(out).length + ' texturas');
