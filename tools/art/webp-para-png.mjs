// Converte imagens (webp, jpg) em PNG pelo Chromium do Playwright.
// Uso: node tools/art/webp-para-png.mjs <entrada> <saida.png> [<entrada> <saida.png> ...]
import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
for (let i = 0; i + 1 < args.length; i += 2) {
  const mime = extname(args[i]).toLowerCase() === '.webp' ? 'image/webp' : 'image/jpeg';
  const src = `data:${mime};base64,${readFileSync(args[i]).toString('base64')}`;
  const b64 = await page.evaluate(async (s) => {
    const img = new Image();
    img.src = s;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/png').split(',')[1];
  }, src);
  writeFileSync(args[i + 1], Buffer.from(b64, 'base64'));
  console.log(args[i + 1]);
}
await browser.close();
