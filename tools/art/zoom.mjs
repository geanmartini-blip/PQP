// Amplia quadros de um atlas para inspeção: node tools/art/zoom.mjs <atlas-base> <saida.png> <quadro> [<quadro>...]
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { Img, savePng } from './lib/img.mjs';

function readPng(path) {
  const b = readFileSync(path);
  let p = 8, w = 0, h = 0;
  const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8);
    if (type === 'IHDR') { w = b.readUInt32BE(p + 8); h = b.readUInt32BE(p + 12); }
    if (type === 'IDAT') idat.push(b.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const img = new Img(w, h);
  const st = w * 4;
  const prev = new Uint8Array(st);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (st + 1)];
    const row = raw.subarray(y * (st + 1) + 1, (y + 1) * (st + 1));
    const cur = new Uint8Array(st);
    for (let i = 0; i < st; i++) {
      const a = i >= 4 ? cur[i - 4] : 0, up = prev[i], c = i >= 4 ? prev[i - 4] : 0;
      let v = row[i];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      cur[i] = v & 255;
    }
    img.d.set(cur, y * st);
    prev.set(cur);
  }
  return img;
}

const [base, out, ...names] = process.argv.slice(2);
const atlas = JSON.parse(readFileSync(base + '.json', 'utf8'));
const sheet = readPng(base + '.png');
const S = 10;
const fr = names.map((n) => atlas.frames[n].frame);
const o = new Img(fr.reduce((a, f) => a + f.w + 2, 0) * S, Math.max(...fr.map((f) => f.h)) * S);
o.rect(0, 0, o.w, o.h, 0x101624);
let ox = 0;
for (const f of fr) {
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) { const c = sheet.get(f.x + x, f.y + y); if (c !== null) o.rect((ox + x) * S, y * S, S, S, c); }
  ox += f.w + 2;
}
savePng(o, out);
