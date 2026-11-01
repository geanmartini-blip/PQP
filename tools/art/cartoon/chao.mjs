// Chão cartoon da cena de teste da Ponte do Rio Claro: grama pintada com tufos e flores, calçamento
// de pedras redondas na Esquerda, lajes chanfradas na Direita, barranco de rochedos e cais de pedra
// cortada nas margens, e a água estilizada (textura que corre). Tudo em SVG rasterizado.
// Uso: node tools/art/cartoon/chao.mjs
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { blob, brilho, cel, contorno, curva, elipse, luz, mistura, renderizar, retRed, rnd, sombra, traco } from './lib.mjs';

const OUT = 'packages/client/public/teste-cartoon';
export const MAPA = { w: 1000, h: 2000, rioX0: 450, rioX1: 600, ponteY: 1000, banco: 28 };
const { w: W, h: H, rioX0, rioX1, banco: B } = MAPA;

// caminhos da Esquerda: polilinhas com largura
const CALCADA = [
  { pts: [[470, 1004], [400, 1008], [360, 990], [352, 900], [345, 820]], larg: 30 },
  { pts: [[360, 1010], [250, 1030], [120, 1000], [0, 1030]], larg: 24 },
  { pts: [[356, 1020], [350, 1130], [358, 1240], [340, 1380], [352, 1560]], larg: 24 },
];
const TRILHA = [
  { pts: [[345, 820], [320, 700], [350, 560], [320, 400]], larg: 14 },
  { pts: [[350, 1240], [230, 1270], [90, 1230]], larg: 13 },
];
const distSeg = (px, py, [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
const distP = (x, y, p) => Math.min(...p.pts.slice(1).map((q, i) => distSeg(x, y, p.pts[i], q))) - p.larg;
const dist = (x, y, l) => Math.min(...l.map((p) => distP(x, y, p)));
const pathD = (p) => curva(p.pts, 0.8);

const r = rnd(42);
const G = { grama: '#5fb043', gramaEsc: '#3f8a37', gramaClara: '#8fd052', terra: '#a8744a', pedra: '#b49378', laje: '#7a7f95', lajeEsc: '#5d6276', agua: '#2a9bc8' };
let svg = '';

// ---------- Esquerda: grama ----------
svg += `<defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5e8a40"/><stop offset="1" stop-color="#3f6a34"/></linearGradient></defs>`;
svg += `<rect x="0" y="0" width="${rioX0 + 4}" height="${H}" fill="url(#gg)"/>`;
// manchas grandes de luz e sombra (pintado)
for (let i = 0; i < 70; i++) {
  const x = r() * rioX0, y = r() * H, rr = 30 + r() * 70;
  const pts = Array.from({ length: 8 }, (_, k) => { const a = (k / 8) * Math.PI * 2; const q = rr * (0.7 + r() * 0.5); return [x + Math.cos(a) * q, y + Math.sin(a) * q * 0.7]; });
  svg += `<path d="${blob(pts)}" fill="${r() > 0.5 ? '#7c9a4c' : '#2c4a28'}" opacity="${0.18 + r() * 0.2}"/>`;
}
// trilhas de terra e calçamento (base de terra com borda escura)
for (const p of TRILHA) svg += traco(pathD(p), '#6e4a2e', p.larg * 2 + 6, 0.55) + traco(pathD(p), '#8a6a4a', p.larg * 2) + traco(pathD(p), luz(G.terra, 0.15), p.larg * 1.1, 0.5);
for (const p of CALCADA) svg += traco(pathD(p), '#5a3c28', p.larg * 2 + 8, 0.6) + traco(pathD(p), '#7a5638', p.larg * 2 + 2);
// pedras redondas do calçamento
{
  const cores = ['#9c8c7a', '#8a7b6a', '#a89a86', '#7e7468', '#948678'];
  for (let y = 300; y < H; y += 11)
    for (let x = 0; x < rioX0; x += 13) {
      const px = x + (y / 11) % 2 * 6 + (r() - 0.5) * 4, py = y + (r() - 0.5) * 3;
      if (dist(px, py, CALCADA) > -5) continue;
      const c = cores[Math.floor(r() * cores.length)];
      svg += cel(elipse(px, py, 6 + r() * 1.8, 4.6 + r() * 1.2), c, { s: 2, l: 1.4, w: 1.4, gradiente: false, cs: mistura(c, '#4a3426', 0.45), cc: '#3a2618' });
    }
}
// tufos de grama (lâminas em leque) e flores
const naGrama = (x, y) => dist(x, y, CALCADA) > 4 && dist(x, y, TRILHA) > 3 && x < rioX0 - 6;
for (let i = 0; i < 1300; i++) {
  const x = r() * rioX0, y = r() * H;
  if (!naGrama(x, y)) continue;
  const n = 3 + Math.floor(r() * 3), hgt = 6 + r() * 6;
  const escuro = r() > 0.5;
  let t = '';
  for (let k = 0; k < n; k++) {
    const a = (k / (n - 1) - 0.5) * 1.3 + (r() - 0.5) * 0.2;
    const tx = x + Math.sin(a) * hgt, ty = y - Math.cos(a) * hgt;
    t += `<path d="M${x - 1.6},${y} Q${(x + tx) / 2 - 1},${(y + ty) / 2} ${tx},${ty} Q${(x + tx) / 2 + 1},${(y + ty) / 2} ${x + 1.6},${y}Z" fill="${escuro ? '#2f5229' : '#7f9e4e'}"/>`;
  }
  svg += t;
}
for (let i = 0; i < 90; i++) {
  const x = r() * rioX0, y = r() * H;
  if (!naGrama(x, y)) continue;
  const c = ['#e6dcc4', '#d4b452', '#9a80b0', '#8aaec0', '#c4949c'][Math.floor(r() * 5)];
  for (let k = 0; k < 3; k++) {
    const fx = x + (r() - 0.5) * 10, fy = y + (r() - 0.5) * 7;
    svg += `<circle cx="${fx}" cy="${fy + 1.2}" r="2.6" fill="${sombra(c, 0.4)}"/><circle cx="${fx}" cy="${fy}" r="2.5" fill="${c}"/><circle cx="${fx}" cy="${fy}" r="0.9" fill="#ffe27a"/>`;
  }
}

// ---------- Direita: lajes chanfradas ----------
svg += `<rect x="${rioX1 - 4}" y="0" width="${W - rioX1 + 4}" height="${H}" fill="#3a3c4c"/>`;
{
  const lw = 46, lh = 34;
  for (let row = 0; row * lh < H; row++)
    for (let col = -1; col * lw < W; col++) {
      const x = rioX1 + col * lw + (row % 2 ? lw / 2 : 0), y = row * lh;
      if (x + lw < rioX1) continue;
      const v = r();
      const base = mistura(v > 0.75 ? '#8c8fa3' : v > 0.3 ? '#777b90' : '#666a80', '#7a6f8a', r() * 0.25);
      svg += `<path d="${retRed(x + 1.5, y + 1.5, lw - 3, lh - 3, 5)}" fill="${base}"/>`;
      svg += `<path d="M${x + 4},${y + lh - 4} L${x + 4},${y + 5} Q${x + 4},${y + 3} ${x + 6},${y + 3} L${x + lw - 5},${y + 3}" fill="none" stroke="${luz(base, 0.3)}" stroke-width="2.4" stroke-linecap="round"/>`;
      svg += `<path d="M${x + 6},${y + lh - 3} L${x + lw - 5},${y + lh - 3} Q${x + lw - 3},${y + lh - 3} ${x + lw - 3},${y + lh - 5} L${x + lw - 3},${y + 6}" fill="none" stroke="${sombra(base, 0.3)}" stroke-width="2.4" stroke-linecap="round"/>`;
      if (r() > 0.85) svg += traco(curva([[x + 10 + r() * 10, y + 6], [x + 16 + r() * 10, y + 15], [x + 12 + r() * 16, y + lh - 7]]), sombra(base, 0.45), 1.3);
      if (r() > 0.9) svg += `<ellipse cx="${x + lw / 2}" cy="${y + lh / 2}" rx="${8 + r() * 8}" ry="${4 + r() * 4}" fill="#2a2c3a" opacity="0.25"/>`;
    }
  // meio-fio com faixa de perigo na beira do cais
  for (let y = 0; y < H; y += 24) {
    svg += `<rect x="${rioX1 + 2}" y="${y}" width="10" height="24" fill="${Math.floor(y / 24) % 2 ? '#f2c230' : '#26242c'}"/>`;
  }
  svg += `<rect x="${rioX1 + 2}" y="0" width="10" height="${H}" fill="none" stroke="#1a1820" stroke-width="2"/>`;
}

// ---------- margens ----------
// Esquerda: rochedos redondos empilhados descendo até a água
svg += `<rect x="${rioX0 - 4}" y="0" width="${B + 6}" height="${H}" fill="#3a2a26"/>`;
{
  const cores = ['#9a7a62', '#8a6e5a', '#a58670', '#7f7a72'];
  for (let y = -20; y < H + 20; y += 13)
    for (let j = 0; j < 2; j++) {
      const rr = 10 + r() * 8;
      const x = rioX0 + 6 + j * (B - 12) + (r() - 0.5) * 6;
      const yy = y + j * 6 + (r() - 0.5) * 5;
      const c = cores[Math.floor(r() * cores.length)];
      const pts = Array.from({ length: 7 }, (_, k) => { const a = (k / 7) * Math.PI * 2; const q = rr * (0.85 + r() * 0.25); return [x + Math.cos(a) * q, yy + Math.sin(a) * q * 0.8]; });
      svg += cel(blob(pts), j ? sombra(c, 0.15) : c, { s: 5, l: 3, w: 2.4 });
      // musgo no topo
      if (r() > 0.35) svg += `<path d="${blob([[x - rr * 0.7, yy - rr * 0.35], [x - rr * 0.2, yy - rr * 0.85], [x + rr * 0.5, yy - rr * 0.7], [x + rr * 0.6, yy - rr * 0.35], [x, yy - rr * 0.45]])}" fill="#6db04a" stroke="#2a4a20" stroke-width="1.6"/>`;
    }
  // grama caindo por cima da borda
  for (let y = 0; y < H; y += 14) {
    const x = rioX0 - 4;
    if (r() > 0.6) continue;
    svg += `<path d="M${x - 6},${y} Q${x + 3 + r() * 4},${y + 3} ${x + 2 + r() * 5},${y + 9 + r() * 6} Q${x},${y + 5} ${x - 6},${y + 8}Z" fill="${r() > 0.5 ? '#557e3c' : '#40663a'}" stroke="#1e3018" stroke-width="1.2"/>`;
  }
}
// Direita: cais de pedra cortada (fiadas) descendo até a água
{
  const x0 = rioX1 - B;
  svg += `<rect x="${x0}" y="0" width="${B}" height="${H}" fill="#24252f"/>`;
  for (let y = 0; y < H; y += 16)
    for (let x = x0 + (Math.floor(y / 16) % 2 ? -10 : 0); x < rioX1; x += 22) {
      const bx = Math.max(x0 + 1, x + 1), bw = Math.min(rioX1 - 1, x + 21) - bx;
      if (bw < 4) continue;
      const k = (bx - x0) / B;
      const c = mistura('#4f5366', '#80859a', k);
      svg += cel(retRed(bx, y + 1, bw, 14, 3), c, { s: 2.5, l: 1.6, w: 1.5, gradiente: false });
    }
  // limo e ferrugem perto da água
  for (let y = 0; y < H; y += 7) if (r() > 0.4) svg += `<ellipse cx="${x0 + 3 + r() * 6}" cy="${y}" rx="${3 + r() * 4}" ry="${2 + r() * 3}" fill="#4a7a3a" opacity="0.7"/>`;
  for (const by of [420, 760, 1180, 1500]) {
    svg += cel(elipse(x0 + 10, by, 8, 7), '#5a5e70', { s: 2, l: 1.5, w: 2 }) + `<ellipse cx="${x0 + 10}" cy="${by + 1}" rx="5" ry="4.5" fill="#101018"/>`;
    svg += traco(`M${x0 + 4},${by + 3} q-6,4 -10,4`, '#9adcf0', 3, 0.8);
  }
}
// espuma e sombra das margens na água
svg += `<defs><linearGradient id="sombraE" x1="0" x2="1"><stop offset="0" stop-color="#03141f" stop-opacity="0.55"/><stop offset="1" stop-color="#03141f" stop-opacity="0"/></linearGradient>
<linearGradient id="sombraD" x1="1" x2="0"><stop offset="0" stop-color="#03141f" stop-opacity="0.45"/><stop offset="1" stop-color="#03141f" stop-opacity="0"/></linearGradient></defs>`;
svg += `<rect x="${rioX0 + B - 2}" y="0" width="22" height="${H}" fill="url(#sombraE)"/><rect x="${rioX1 - B - 18}" y="0" width="20" height="${H}" fill="url(#sombraD)"/>`;
for (let y = 0; y < H; y += 6) {
  svg += `<ellipse cx="${rioX0 + B + 1 + r() * 3}" cy="${y}" rx="${3 + r() * 3}" ry="2" fill="#e8fbff" opacity="${0.6 + r() * 0.4}"/>`;
  svg += `<ellipse cx="${rioX1 - B - 1 - r() * 3}" cy="${y}" rx="${3 + r() * 3}" ry="2" fill="#e8fbff" opacity="${0.5 + r() * 0.4}"/>`;
}
// espuma ao pé da cascata
for (let i = 0; i < 70; i++) {
  const x = rioX0 + B + 6 + r() * (rioX1 - rioX0 - 2 * B - 12), y = 520 + r() * 50 * r();
  svg += `<circle cx="${x}" cy="${y}" r="${2 + r() * 5}" fill="#f2fdff" opacity="${0.5 + r() * 0.5}"/>`;
}

// recorta o rio (transparente) para a água correr por baixo
const chao = `<defs><mask id="semRio" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/><rect x="${rioX0 + B}" y="0" width="${rioX1 - rioX0 - 2 * B}" height="${H}" fill="#000"/></mask></defs><g mask="url(#semRio)">${svg}</g>` +
  // a espuma e a sombra ficam por cima da água (fora da máscara, semitransparentes)
  '';

// ---------- água: textura que repete (256x256) ----------
const T = 256;
let agua = `<rect width="${T}" height="${T}" fill="#1d5f7c"/>`;
const ra = rnd(7);
for (let i = 0; i < 26; i++) {
  const x = ra() * T, y = ra() * T, rr = 20 + ra() * 40;
  for (const dx of [-T, 0, T]) for (const dy of [-T, 0, T])
    agua += `<ellipse cx="${x + dx}" cy="${y + dy}" rx="${rr * 0.6}" ry="${rr}" fill="${ra() > 0.5 ? '#2a7894' : '#164c64'}" opacity="0.45"/>`;
}
for (let i = 0; i < 40; i++) {
  const x = ra() * T, y = ra() * T, len = 10 + ra() * 18;
  for (const dx of [-T, 0, T]) for (const dy of [-T, 0, T]) {
    const X = x + dx, Y = y + dy;
    agua += `<path d="M${X - len / 2},${Y} q${len / 4},-4 ${len / 2},0 t${len / 2},0" fill="none" stroke="${ra() > 0.4 ? '#9ccfe0' : '#d8f0f8'}" stroke-width="2" stroke-linecap="round" opacity="0.55"/>`;
  }
}

const man = {
  ...(await renderizar(OUT, [{ nome: 'chao', w: W, h: H, svg: chao, ax: 0, ay: 0 }], { escala: 1.5 })),
  ...(await renderizar(OUT, [{ nome: 'agua', w: T, h: T, svg: agua, ax: 0, ay: 0 }], { escala: 2 })),
};
const f = `${OUT}/pecas-chao.json`;
writeFileSync(f, JSON.stringify(man, null, 1));
writeFileSync(`${OUT}/mapa.json`, JSON.stringify({ ...MAPA, calcada: CALCADA, trilha: TRILHA }));
void readFileSync; void existsSync; void brilho; void contorno;
console.log('chao ok');
