// Cenário da cena de teste (Ponte do Rio Claro): construções e objetos em pixel art 3/4.
// Gera PNG + _n (normal map) + _e (só o que brilha) em packages/client/public/teste-visual/.
// Âncora de todo sprite: base no rodapé da imagem, centro em x.
// Uso: node tools/art/cenario.mjs
import { Img, ball, cyl, outline, hash, vnoise, pick, shift, ramp, mix, saveSprite, saveAtlas, savePng } from './lib/img.mjs';
import { R, BASE } from './lib/paleta.mjs';
import { Spr, rng, darken, wood, blocks, noisy, clump, canopy, awning, hazard, flame, AMBAR, CIANO, MAGENTA } from './lib/kit.mjs';

const OUT = 'packages/client/public/teste-visual/';
const all = []; // para o preview: { name, img, lado }

function save(name, s, lado, opts = {}) {
  const img = s.img ?? s;
  if (!opts.noOutline) outline(img);
  saveSprite(OUT + name, img, { emissive: s.hasE ? s.E : null, normal: opts.normal ?? {} });
  all.push({ name, img, lado, e: s.hasE });
}

const PEDRA_M = R.pedraMarrom;
const MAD = R.madeira;
const MAD_C = R.madeiraClara;
const MUSGO = R.musgo;
const FOLHA = R.folha;
const ROXO = ramp(0xa46ad8, 4);
const LILAS = ramp(0xd6a6f0, 4);
const BRANCO = ramp(0xf0ece4, 4);
const LARANJA = R.laranja;
const GRAF = R.grafite;
const CINZA = R.pedraCinza;
const METAL = R.metal;
const ARD = R.ardosia;
const FERRUG = R.ferrugem;
const AMAR = ramp(0xf2c230, 4);
const OURO = R.ouro;
const TERRA_ESC = ramp(0x6a4a30, 4);

// ======================= ESQUERDA =======================

function casaMusgo() {
  const W = 96, H = 112;
  const s = new Spr(W, H);
  const g = s.img;
  // paredes: base de pedra marrom e tábuas em pé
  wood(g, 12, 58, 72, 36, MAD, { pw: 5, seed: 11 });
  blocks(g, 10, 92, 76, 18, PEDRA_M, { bw: 9, bh: 5, seed: 12 });
  // pilares de canto e viga do peitoril
  cyl(g, 10, 56, 5, 38, ramp(0x6e4428, 4));
  cyl(g, 81, 56, 5, 38, ramp(0x6e4428, 4));
  for (let i = 10; i < 86; i++) { g.px(i, 91, shift(MAD[0], -0.3)); g.px(i, 90, MAD[1]); g.px(i, 89, MAD[2]); }
  // sombra do beiral sobre a parede
  darken(g, 10, 56, 76, 9, -0.55, 4);
  // porta em arco: moldura de pedra, porta de madeira, ferragens e visor aceso
  const dx = 40, dw = 16;
  g.ellipse(dx + dw / 2, 80, dw / 2 + 2, 7, PEDRA_M[2]);
  g.rect(dx - 2, 80, dw + 4, 30, PEDRA_M[2]);
  for (let j = 74; j < 110; j++) for (let i = dx - 2; i < dx + dw + 2; i++) {
    if (g.get(i, j) === PEDRA_M[2]) g.px(i, j, pick(PEDRA_M, 0.55 + (hash(Math.floor(i / 4), Math.floor(j / 4), 5) - 0.5) * 0.5 + ((i - dx) < 2 ? 0.2 : 0), i, j));
  }
  const door = new Img(dw, 30);
  wood(door, 0, 0, dw, 30, ramp(0x7a4a26, 4), { pw: 4, seed: 13, nails: false });
  for (let j = 0; j < 30; j++) for (let i = 0; i < dw; i++) {
    const nx = (i + 0.5 - dw / 2) / (dw / 2), ny = (j + 0.5 - 6) / 6;
    if (j < 6 && nx * nx + ny * ny > 1) continue;
    g.px(dx + i, 80 + j, door.get(i, j));
  }
  for (const yy of [88, 101]) for (let i = dx + 1; i < dx + dw - 1; i++) { g.px(i, yy, 0x3a3440); g.px(i, yy - 1, 0x6a6470); }
  g.px(dx + dw - 4, 95, OURO[3]); g.px(dx + dw - 4, 96, OURO[1]);
  // visor da porta com luz
  s.glowRect(dx + 5, 80, 6, 5, [AMBAR[0], AMBAR[1], AMBAR[2]]);
  g.px(dx + 7, 80, 0x3a2a20); g.px(dx + 7, 81, 0x3a2a20); g.px(dx + 7, 82, 0x3a2a20); g.px(dx + 7, 83, 0x3a2a20); g.px(dx + 7, 84, 0x3a2a20);
  // degrau
  blocks(g, dx - 4, 109, dw + 8, 3, PEDRA_M, { bw: 6, bh: 3, seed: 14, bias: 0.15 });
  // janela redonda à esquerda
  const wx = 26, wy = 74;
  g.ellipse(wx, wy, 8, 8, ramp(0x6e4428, 4)[1]);
  g.ellipse(wx, wy, 7, 7, (x, y, nx, ny) => pick(ramp(0x8a5a34, 4), 0.5 - nx * 0.3 - ny * 0.3, x, y));
  g.ellipse(wx, wy, 5, 5, 0);
  for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) {
    if (i * i + j * j > 25) continue;
    const t = (j + 5) / 10;
    s.glow(wx + i, wy + j, AMBAR[Math.min(3, Math.floor(t * 3.2))]);
  }
  for (let k = -5; k <= 5; k++) { g.px(wx + k, wy, 0x4a2c1c); g.px(wx, wy + k, 0x4a2c1c); s.E.px(wx + k, wy, null); s.E.px(wx, wy + k, null); }
  // janela da direita com venezianas verdes e floreira
  const rx = 62, ry = 68;
  g.rect(rx - 1, ry - 1, 14, 16, ramp(0x6e4428, 4)[1]);
  s.glowRect(rx + 1, ry + 1, 10, 12, [AMBAR[0], AMBAR[1], AMBAR[1], AMBAR[2], AMBAR[3]]);
  for (let j = 0; j < 12; j++) { g.px(rx + 6, ry + 1 + j, 0x4a2c1c); s.E.px(rx + 6, ry + 1 + j, null); }
  for (let i = 0; i < 10; i++) { g.px(rx + 1 + i, ry + 6, 0x4a2c1c); s.E.px(rx + 1 + i, ry + 6, null); }
  const VERDE_J = ramp(0x4a8a4a, 4);
  for (const sx of [rx - 5, rx + 13]) for (let j = 0; j < 15; j++) for (let i = 0; i < 4; i++)
    g.px(sx + i, ry - 1 + j, pick(VERDE_J, (j % 3 === 0 ? 0.2 : 0.6) + (i === 0 ? 0.2 : 0) - (i === 3 ? 0.25 : 0), sx + i, ry + j));
  wood(g, rx - 3, ry + 15, 18, 4, MAD_C, { dir: 'h', pw: 4, seed: 15, nails: false });
  const FL = [ramp(0xe04a6a, 3), ramp(0xf2d040, 3), ramp(0xb070e0, 3)];
  for (let i = 0; i < 16; i += 3) {
    clump(g, rx - 2 + i + 1, ry + 13, 2, 2, FOLHA, { rim: false });
    const f = FL[i % 3];
    g.px(rx - 2 + i, ry + 12, f[2]); g.px(rx - 1 + i, ry + 12, f[1]); g.px(rx - 2 + i, ry + 11, f[1]);
  }
  // telhado de musgo: monte arredondado com camadas de bolotas
  const roofTop = (x) => 10 + ((x - 48) / 46) ** 2 * 22;
  const roofBot = 60;
  g.poly([[2, 60], [6, 30], [20, 13], [48, 8], [76, 13], [90, 30], [94, 60]], MUSGO[1]);
  const Rr = rng(21);
  const MUSGO_L = ramp(0x7aa83c, 4);
  let row = 0;
  for (let y = 10; y <= roofBot - 4; y += 6, row++) {
    const step = 9;
    const off = row % 2 ? 0 : 4.5;
    for (let x = 2 + off; x <= 94; x += step) {
      if (y < roofTop(x) - 3) continue;
      const br = 6 + Rr() * 2.5;
      // topo mais claro e amarelado, lado esquerdo pega luz, base escurece
      const bias = (48 - x) / 160 + 0.18 - (y - 10) / 140 + (Rr() - 0.5) * 0.1;
      clump(g, x + (Rr() - 0.5) * 2, y + (Rr() - 0.5) * 2, br, br * 0.75, y < 26 ? MUSGO_L : MUSGO, { bias });
    }
  }
  // cumeeira: linha de bolotas claras no alto
  for (let x = 14; x <= 82; x += 6) clump(g, x, roofTop(x) + 3, 5, 3.5, MUSGO_L, { bias: 0.25 + (48 - x) / 200 });
  // franja da frente (beiral): bolotas grossas penduradas, com a sombra por baixo
  for (let x = 2; x <= 94; x++) for (let j = 0; j < 3; j++) g.px(x, roofBot + 4 + j, shift(MUSGO[0], -0.4));
  for (let x = 3; x <= 93; x += 6) clump(g, x + (Rr() - 0.5), roofBot + 1 + Rr() * 2, 5.5, 4.5, ramp(0x5a8030, 4), { bias: (48 - x) / 250 - 0.12 });
  for (let x = 6; x <= 90; x += 6) clump(g, x, roofBot - 4, 4.5, 3.5, MUSGO, { bias: (48 - x) / 250 });
  // chaminé de pedra
  blocks(g, 68, 2, 12, 16, PEDRA_M, { bw: 6, bh: 4, seed: 22 });
  for (let i = 67; i < 81; i++) { g.px(i, 1, PEDRA_M[3]); g.px(i, 2, PEDRA_M[2]); }
  for (let i = 69; i < 79; i++) g.px(i, 3, 0x1e1418);
  clump(g, 68, 18, 4, 3, MUSGO, { bias: 0.05 });
  clump(g, 79, 18, 4, 3, MUSGO, { bias: -0.05 });
  // florzinhas e cogumelos no musgo
  const Rf = rng(33);
  for (let k = 0; k < 14; k++) {
    const x = 10 + Math.floor(Rf() * 76), y = 16 + Math.floor(Rf() * 40);
    if (g.get(x, y) === null || y < roofTop(x)) continue;
    const f = FL[k % 3];
    g.px(x, y, f[2]); g.px(x + 1, y, f[1]); g.px(x, y + 1, f[0]);
  }
  for (const [mx, my] of [[18, 50], [84, 44]]) {
    g.px(mx, my, 0xe8e0d0); g.px(mx, my + 1, 0xe8e0d0);
    g.rect(mx - 2, my - 2, 5, 2, 0xd0402a); g.px(mx - 1, my - 2, 0xffe0d0); g.px(mx - 2, my - 1, 0x902018); g.px(mx + 2, my - 1, 0x902018);
  }
  save('casa_musgo', s, 'esq', { normal: { bevel: 4 } });
}

function bancaRoxa() {
  const W = 64, H = 64;
  // fundo: postes, toldo e prateleira com frascos (atrás da Benzedeira)
  const f = new Spr(W, H);
  const g = f.img;
  for (const x of [4, 57]) cyl(g, x, 14, 4, 48, MAD);
  // prateleira de fundo
  wood(g, 8, 22, 49, 3, MAD_C, { dir: 'h', pw: 3, seed: 41, nails: false });
  const JAR = [ramp(0x50c878, 4), ramp(0xb070e0, 4), ramp(0x5fb8f0, 4), ramp(0xe05a70, 4), ramp(0xf2c040, 4)];
  for (let k = 0; k < 8; k++) {
    const jx = 11 + k * 6, r = JAR[k % 5];
    ball(g, jx, 18, 2.2, 3, r);
    g.px(jx, 14, 0xa07040); g.px(jx, 15, r[3]);
    g.px(jx - 1, 17, 0xffffff);
  }
  // toldo listrado roxo/lilás
  awning(g, 0, 2, 64, 12, ROXO, LILAS, { stripe: 6 });
  for (let i = 0; i < 64; i++) g.px(i, 1, shift(ROXO[0], -0.2));
  // barra de madeira do toldo
  for (let i = 1; i < 63; i++) { g.px(i, 2, MAD[3]); g.px(i, 3, MAD[2]); }
  // lanterninha pendurada (luz mágica)
  g.line(48, 16, 48, 20, 0x2a2230);
  f.glow(47, 21, CIANO[1]); f.glow(48, 21, CIANO[0]); f.glow(49, 21, CIANO[1]); f.glow(48, 22, CIANO[2]);
  save('banca_roxa_fundo', f, 'esq');
  // frente: balcão com frascos, ervas e um cristal
  const fr = new Spr(W, H);
  const h = fr.img;
  // tampo do balcão (visto de cima) e frente de tábuas
  wood(h, 2, 40, 60, 5, MAD_C, { dir: 'h', pw: 5, seed: 42, nails: false, bias: 0.15 });
  wood(h, 3, 45, 58, 18, MAD, { pw: 6, seed: 43 });
  for (let i = 3; i < 61; i++) h.px(i, 45, shift(MAD[0], -0.3));
  // pano roxo pendurado na frente com símbolo de folha
  for (let j = 47; j < 58; j++) for (let i = 22; i < 42; i++) {
    const v = 0.55 + ((i - 22) % 5 === 0 ? -0.2 : 0) - (j - 47) * 0.02;
    h.px(i, j, pick(ROXO, v, i, j));
  }
  for (let i = 22; i < 42; i += 2) { h.px(i, 58, ROXO[1]); h.px(i + 1, 59, ROXO[0]); }
  for (const [x, y] of [[32, 49], [31, 50], [33, 50], [30, 51], [32, 51], [34, 51], [32, 52], [31, 53], [33, 53], [32, 54], [32, 55]]) h.px(x, y, OURO[3]);
  // frascos sobre o balcão
  const potes = [[8, 0, 3, 4], [14, 3, 2.5, 5], [20, 1, 2, 3], [44, 2, 3, 4], [51, 4, 2.5, 5], [57, 0, 2, 3]];
  for (const [px, k, rx, ry] of potes) {
    const r = JAR[k];
    ball(h, px, 40 - ry + 1, rx, ry, r);
    h.px(px, 40 - ry * 2 + 1, 0x9a6a3a); h.px(px, 40 - ry * 2, 0xc89a5a);
    h.px(Math.round(px - rx / 2), 40 - ry, 0xffffff);
    // brilho mágico dentro
    fr.E.px(px, 40 - ry + 2, r[3]); fr.hasE = true;
  }
  // maço de ervas
  for (let k = 0; k < 5; k++) h.line(27 + k, 39, 25 + k * 2, 33, FOLHA[1 + (k % 3)]);
  h.px(28, 39, 0xc0a060); h.px(29, 39, 0xc0a060);
  // cristal
  h.poly([[37, 39], [39, 33], [41, 39]], (x, y) => pick(CIANO, 0.9 - (x - 37) / 6, x, y));
  fr.glow(38, 35, CIANO[0]); fr.glow(39, 34, CIANO[0]);
  save('banca_roxa_frente', fr, 'esq');
}

function pedraRuna(name = 'pedra_runa', seed = 51, runa = 0) {
  const W = 24, H = 36;
  const s = new Spr(W, H);
  const g = s.img;
  const ST = ramp(0x8a8478, 4);
  g.poly([[4, 35], [3, 18], [6, 6], [11, 2], [16, 4], [20, 14], [21, 35]], (x, y) => {
    const nx = (x - 12) / 9;
    const v = 0.62 - nx * 0.35 + (vnoise(x * 0.35, y * 0.35, seed) - 0.5) * 0.45 - (y > 30 ? 0.1 : 0);
    return pick(ST, v, x, y, 0.6);
  });
  // rachaduras
  g.line(15, 8, 17, 13, ST[0]); g.line(17, 13, 16, 17, ST[0]);
  g.line(6, 26, 8, 30, ST[0]);
  // musgo no topo e na base
  clump(g, 9, 5, 4, 2.5, MUSGO, { rim: false, bias: 0.1 });
  clump(g, 13, 4, 3, 2, MUSGO, { rim: false, bias: 0.15 });
  clump(g, 6, 33, 3.5, 2.5, MUSGO, { bias: 0 });
  clump(g, 18, 34, 3.5, 2.5, MUSGO, { bias: -0.05 });
  // runa emissiva (gravada: borda escura + linha brilhante)
  const C = runa ? [0xe8fff0, 0xa0ffc8, 0x40e890, 0x20a060] : CIANO;
  const glyphs = [
    [[12, 10], [12, 24], [12, 10], [8, 14], [12, 10], [16, 14], [12, 17], [8, 21], [12, 17], [16, 21]],
    [[9, 11], [15, 11], [12, 11], [12, 25], [8, 18], [16, 18], [9, 25], [15, 25]],
  ][runa];
  for (let k = 0; k + 1 < glyphs.length; k += 2) {
    const [a, b] = [glyphs[k], glyphs[k + 1]];
    g.line(a[0] + 1, a[1] + 1, b[0] + 1, b[1] + 1, ST[0]);
  }
  for (let k = 0; k + 1 < glyphs.length; k += 2) {
    const [a, b] = [glyphs[k], glyphs[k + 1]];
    const tmp = new Img(W, H);
    tmp.line(a[0], a[1], b[0], b[1], 1);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (tmp.get(x, y) !== null) s.glow(x, y, (x + y) % 5 === 0 ? C[0] : C[1]);
  }
  save(name, s, 'esq');
}

function arvoreRoxa() {
  const W = 96, H = 112;
  const s = new Spr(W, H);
  const g = s.img;
  const TR = ramp(0x6a4a5a, 4);
  // raízes e tronco retorcido
  const trunk = (x0, y0, x1, y1, w0, w1) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const cx = x0 + (x1 - x0) * t + Math.sin(t * 5) * 2;
      const cy = y0 + (y1 - y0) * t;
      const w = w0 + (w1 - w0) * t;
      for (let i = -w; i <= w; i++) {
        const nx = i / w;
        const v = 0.6 - nx * 0.45 + (vnoise(cx * 0.3, cy * 0.7 + i, 61) - 0.5) * 0.4;
        g.px(Math.round(cx + i), Math.round(cy), pick(TR, v, Math.round(cx + i), Math.round(cy)));
      }
    }
  };
  trunk(48, 111, 46, 60, 8, 5);
  trunk(34, 110, 44, 96, 3, 4);
  trunk(62, 110, 52, 96, 3, 4);
  trunk(45, 72, 26, 46, 4, 2);
  trunk(48, 70, 70, 44, 4, 2);
  trunk(47, 66, 50, 36, 4, 2);
  // copa em cachos lilás/roxo
  const CO = ramp(0xb478e8, 4);
  const CO2 = ramp(0xa868dc, 4);
  canopy(g, 48, 40, 44, 34, CO2, { n: 28, rmin: 7, rmax: 11, seed: 62, bias: 0 });
  canopy(g, 46, 34, 38, 26, CO, { n: 22, rmin: 6, rmax: 9, seed: 63 });
  // pétalas brilhando (magia) e luzes azuis penduradas
  const Rr = rng(64);
  for (let k = 0; k < 18; k++) {
    const x = 12 + Math.floor(Rr() * 72), y = 10 + Math.floor(Rr() * 44);
    if (g.get(x, y) !== null && hash(x, y, 1) < 0.9) s.glow(x, y, 0xf4d8ff);
  }
  for (const [lx, top, len] of [[18, 52, 10], [30, 60, 8], [64, 58, 12], [78, 50, 9], [40, 64, 6]]) {
    for (let j = 0; j < len; j++) g.px(lx, top + j, 0x3a2a4a);
    const y = top + len;
    s.glow(lx, y, CIANO[0]); s.glow(lx - 1, y + 1, CIANO[1]); s.glow(lx, y + 1, CIANO[0]); s.glow(lx + 1, y + 1, CIANO[1]); s.glow(lx, y + 2, CIANO[2]);
  }
  // musgo/flores na base
  clump(g, 36, 109, 5, 3, MUSGO, {}); clump(g, 60, 109, 5, 3, MUSGO, {});
  save('arvore_roxa', s, 'esq', { normal: { bevel: 4 } });
}

function arvore() {
  const s = new Spr(64, 80);
  const g = s.img;
  const TR = ramp(0x7a5034, 4);
  cyl(g, 27, 46, 10, 33, TR);
  for (const [x, w] of [[23, 4], [37, 4]]) cyl(g, x, 74, w, 5, TR);
  for (let j = 50; j < 78; j += 5) g.px(29 + (j % 3), j, TR[0]);
  canopy(g, 32, 30, 30, 27, ramp(0x3f7a34, 4), { n: 22, rmin: 6, rmax: 9, seed: 71, bias: -0.1 });
  canopy(g, 31, 27, 25, 21, ramp(0x5a9a3a, 4), { n: 16, rmin: 5, rmax: 8, seed: 72 });
  save('arvore', s, 'esq', { normal: { bevel: 4 } });
}

function pinheiro() {
  const s = new Spr(48, 80);
  const g = s.img;
  cyl(g, 21, 64, 6, 15, ramp(0x6a4428, 4));
  const P = ramp(0x2f6a40, 4);
  for (let k = 0; k < 5; k++) {
    const top = 4 + k * 12, bot = top + 20, half = 8 + k * 4;
    g.poly([[24, top], [24 + half, bot], [24 - half, bot]], (x, y) => {
      const nx = (x - 24) / half;
      const v = 0.6 - nx * 0.4 - ((y - top) / 20) * 0.25 + (hash(x, y, 81) - 0.5) * 0.2;
      return pick(P, v, x, y, 0.6);
    });
    // borda franjada embaixo de cada camada
    for (let x = 24 - half; x <= 24 + half; x++) if ((x + k) % 3 === 0) { g.px(x, bot, P[0]); g.px(x, bot + 1, shift(P[0], -0.2)); }
  }
  save('pinheiro', s, 'esq', { normal: { bevel: 3 } });
}

function arbusto() {
  const s = new Spr(32, 24);
  canopy(s.img, 16, 13, 14, 10, ramp(0x4a8a38, 4), { n: 9, rmin: 4, rmax: 6, seed: 91 });
  // frutinhas
  for (const [x, y] of [[9, 10], [20, 8], [15, 15], [24, 14]]) { s.img.px(x, y, 0xe04a5a); s.img.px(x, y - 1, 0xff9aa0); }
  save('arbusto', s, 'esq');
}

function touceira() {
  const s = new Spr(16, 12);
  const g = s.img;
  const G = ramp(0x6a9a3a, 4);
  for (let k = 0; k < 9; k++) {
    const x0 = 3 + k * 1.2, lean = (k - 4) * 0.6, len = 6 + (k % 3) * 2;
    for (let j = 0; j < len; j++) g.px(Math.round(x0 + lean * (j / len) * 2), 11 - j, G[Math.min(3, Math.floor(j / len * 3.5))]);
  }
  save('touceira', s, 'esq');
}

function flores() {
  const cores = [ramp(0xf2d040, 3), ramp(0xb070e0, 3), ramp(0xf0f0f8, 3)];
  cores.forEach((c, n) => {
    const s = new Spr(14, 12);
    const g = s.img;
    const Rr = rng(100 + n);
    for (let k = 0; k < 4; k++) {
      const x = 2 + Math.floor(Rr() * 10), y = 4 + Math.floor(Rr() * 5);
      g.line(x, y + 1, x, 11, FOLHA[1]);
      g.px(x + 1, 9, FOLHA[2]);
      g.px(x - 1, y, c[1]); g.px(x + 1, y, c[1]); g.px(x, y - 1, c[2]); g.px(x, y + 1, c[0]); g.px(x, y, 0xf8a020);
    }
    save('flores_' + n, s, 'esq', { noOutline: true });
  });
}

function lampiaoMadeira() {
  const s = new Spr(16, 48);
  const g = s.img;
  cyl(g, 6, 12, 4, 34, MAD);
  // base de pedra
  blocks(g, 4, 43, 8, 5, PEDRA_M, { bw: 4, bh: 3, seed: 111 });
  // braço e gancho
  for (let i = 6; i < 14; i++) g.px(i, 10, MAD[1]);
  // lanterna: teto, vidro com chama, base
  const L = ramp(0x3a3a2a, 4);
  g.poly([[3, 4], [8, 0], [13, 4]], (x, y) => pick(L, 0.7 - (x - 3) / 14, x, y));
  g.rect(4, 4, 9, 2, L[1]);
  s.glowRect(5, 6, 7, 6, [AMBAR[1], AMBAR[2], AMBAR[3]]);
  flame(s, 8, 8);
  for (const x of [4, 12]) for (let j = 6; j < 12; j++) g.px(x, j, L[0]);
  g.rect(4, 12, 9, 1, L[2]);
  save('lampiao_madeira', s, 'esq');
}

function bandeiraRaizes() {
  const s = new Spr(24, 56);
  const g = s.img;
  cyl(g, 3, 4, 3, 52, MAD);
  g.px(4, 2, OURO[3]); g.px(3, 3, OURO[2]); g.px(4, 3, OURO[2]); g.px(5, 3, OURO[1]);
  // travessa
  for (let i = 3; i < 22; i++) { g.px(i, 6, MAD[2]); g.px(i, 7, MAD[1]); }
  const V = ramp(0x3a8a4a, 4);
  // pano com dobras e ponta em V
  g.poly([[6, 8], [21, 8], [21, 40], [13.5, 34], [6, 40]], (x, y) => {
    const fold = Math.sin((x - 6) * 0.9) * 0.18;
    return pick(V, 0.55 + fold - (y - 8) / 120, x, y, 0.5);
  });
  for (let i = 6; i < 21; i++) g.px(i, 8, V[3]);
  // borda dourada e folha
  for (let j = 9; j < 36; j++) { g.px(7, j, OURO[1]); g.px(20, j, OURO[1]); }
  const leaf = [[13, 14], [14, 14], [12, 15], [13, 15], [14, 15], [15, 15], [11, 16], [12, 16], [13, 16], [14, 16], [15, 16], [16, 16], [11, 17], [12, 17], [14, 17], [15, 17], [16, 17], [11, 18], [12, 18], [13, 18], [15, 18], [16, 18], [12, 19], [13, 19], [14, 19], [15, 19], [13, 20], [14, 20], [13, 21], [13, 22], [13, 23]];
  for (const [x, y] of leaf) g.px(x, y + 2, x < 13 ? OURO[3] : OURO[2]);
  for (let j = 17; j < 24; j++) g.px(13, j, OURO[1]);
  save('bandeira_raizes', s, 'esq');
}

function cercaMadeira() {
  const s = new Spr(32, 24);
  const g = s.img;
  wood(g, 0, 7, 32, 3, MAD_C, { dir: 'h', pw: 3, seed: 121, nails: false });
  wood(g, 0, 14, 32, 3, MAD_C, { dir: 'h', pw: 3, seed: 122, nails: false });
  for (const x of [2, 18]) {
    cyl(g, x, 3, 5, 21, MAD);
    g.px(x + 1, 3, MAD[3]); g.px(x + 2, 2, MAD[2]); g.px(x + 3, 3, MAD[2]);
    g.px(x + 2, 8, 0x2a2230); g.px(x + 2, 15, 0x2a2230);
  }
  save('cerca_madeira', s, 'esq');
}

function cogumelos() {
  const s = new Spr(16, 14);
  const g = s.img;
  const C = ramp(0xd8402a, 4);
  for (const [x, y, r] of [[5, 7, 4], [11, 9, 3]]) {
    g.rect(x - 1, y, 2, 14 - y, 0xe8dcc8); g.px(x, y + 1, 0xc8b8a0);
    ball(g, x, y, r, r * 0.7, C);
    g.px(x - 1, y - 1, 0xfff0e0); g.px(x + 1, y, 0xfff0e0);
  }
  save('cogumelos', s, 'esq');
}

function pedras() {
  const s = new Spr(20, 14);
  const g = s.img;
  ball(g, 7, 8, 6, 5, ramp(0x8a8478, 4));
  ball(g, 14, 10, 4, 3, ramp(0x7a7468, 4));
  clump(g, 5, 4, 3, 1.5, MUSGO, { rim: false });
  save('pedras', s, 'esq');
}

// ======================= DIREITA =======================

function predioNeon() {
  const W = 128, H = 144;
  const s = new Spr(W, H);
  const g = s.img;
  // telhado (laje vista de cima)
  noisy(g, 6, 6, 116, 34, ramp(0x5a6070, 4), { seed: 131, scale: 0.15, amp: 0.4, base: 0.5 });
  // parapeito em volta
  blocks(g, 4, 2, 120, 5, CINZA, { bw: 10, bh: 5, seed: 132, bias: 0.1 });
  for (const x of [4, 119]) blocks(g, x, 6, 5, 34, CINZA, { bw: 5, bh: 8, seed: 133 });
  // emendas da laje
  for (let x = 30; x < 120; x += 28) for (let y = 7; y < 40; y++) g.px(x, y, shift(GRAF[1], -0.2));
  // unidades de ar condicionado com ventilador
  for (const [ax, ay] of [[14, 12], [38, 22]]) {
    for (let j = 0; j < 12; j++) for (let i = 0; i < 16; i++) g.px(ax + i, ay + j, pick(METAL, j < 8 ? 0.8 - i / 40 : 0.35, ax + i, ay + j));
    g.ellipse(ax + 8, ay + 4, 5, 3, GRAF[0]);
    for (let k = -4; k <= 4; k += 2) g.px(ax + 8 + k, ay + 4, METAL[1]);
    g.px(ax + 8, ay + 4, METAL[3]);
    for (let i = 1; i < 15; i += 2) g.px(ax + i, ay + 10, GRAF[0]);
  }
  // cano no teto
  for (let i = 56; i < 98; i++) { g.px(i, 30, FERRUG[3]); g.px(i, 31, LARANJA[2]); g.px(i, 32, LARANJA[1]); g.px(i, 33, FERRUG[0]); }
  // chaminé com faixa laranja
  cyl(g, 98, 0, 12, 34, GRAF);
  for (let i = 98; i < 110; i++) { g.px(i, 8, LARANJA[2]); g.px(i, 9, LARANJA[1]); g.px(i, 0, GRAF[3]); g.px(i, 1, 0x141218); }
  // antena e luz vermelha
  g.line(24, 2, 24, -8, METAL[2]);
  s.glow(24, 0, 0xff4a4a);
  // cornija da frente
  for (let i = 2; i < 126; i++) { g.px(i, 40, CINZA[3]); g.px(i, 41, CINZA[2]); g.px(i, 42, CINZA[1]); g.px(i, 43, GRAF[0]); g.px(i, 44, shift(GRAF[0], -0.3)); }
  // fachada de blocos e pilastras
  blocks(g, 4, 45, 120, 95, CINZA, { bw: 12, bh: 6, seed: 134 });
  for (const x of [4, 60, 116]) blocks(g, x, 45, 8, 95, GRAF, { bw: 8, bh: 6, seed: 135 + x });
  darken(g, 4, 45, 120, 5, -0.5, 3);
  // janelas âmbar (2 andares), algumas com persiana
  const win = (x, y, w, h, blind) => {
    g.rect(x - 2, y - 2, w + 4, h + 4, GRAF[0]);
    for (let i = x - 2; i < x + w + 2; i++) g.px(i, y + h + 2, METAL[3]);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let c = AMBAR[Math.min(3, Math.floor((j / h) * 3.3))];
      if (blind && j % 3 === 0 && j < h * 0.6) c = 0x8a5a2a;
      s.glow(x + i, y + j, c);
    }
    for (let j = 0; j < h; j++) { g.px(x + Math.floor(w / 2), y + j, GRAF[0]); s.E.px(x + Math.floor(w / 2), y + j, null); }
    s.E.px(x, y, null);
    g.px(x, y, mix(AMBAR[0], 0xffffff, 0.6));
  };
  win(18, 54, 14, 16, false); win(38, 54, 14, 16, true); win(72, 54, 14, 16, false); win(92, 54, 14, 16, false);
  win(18, 84, 14, 14, true); win(92, 84, 14, 14, false);
  // letreiro neon magenta horizontal sobre a porta
  const sx = 34, sy = 82, sw = 56, sh = 18;
  g.rect(sx, sy, sw, sh, 0x1c1824);
  for (let i = 0; i < sw; i++) { s.glow(sx + i, sy, MAGENTA[1]); s.glow(sx + i, sy + sh - 1, MAGENTA[2]); }
  for (let j = 0; j < sh; j++) { s.glow(sx, sy + j, MAGENTA[1]); s.glow(sx + sw - 1, sy + j, MAGENTA[2]); }
  // letras "NEON" 3x5 escaladas 2x
  const F = { N: ['1001', '1101', '1011', '1001', '1001'], E: ['111', '100', '110', '100', '111'], O: ['0110', '1001', '1001', '1001', '0110'] };
  const xs = [0, 11, 20, 31];
  'NEON'.split('').forEach((ch, k) => {
    F[ch].forEach((row, j) => row.split('').forEach((b, i) => {
      if (b !== '1') return;
      for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) s.glow(sx + 9 + xs[k] + i * 2 + a, sy + 4 + j * 2 + c, j === 0 ? MAGENTA[0] : MAGENTA[1]);
    }));
  });
  // placa vertical ciano na quina
  const vx = 110, vy = 50;
  g.rect(vx, vy, 10, 30, 0x18202c);
  for (let j = 0; j < 30; j++) { s.glow(vx, vy + j, CIANO[2]); s.glow(vx + 9, vy + j, CIANO[2]); }
  for (let i = 0; i < 10; i++) { s.glow(vx + i, vy, CIANO[1]); s.glow(vx + i, vy + 29, CIANO[2]); }
  for (let k = 0; k < 4; k++) for (let i = 3; i < 7; i++) s.glow(vx + i, vy + 4 + k * 7, CIANO[k % 2 ? 0 : 1]), s.glow(vx + 3, vy + 5 + k * 7, CIANO[1]), s.glow(vx + 6, vy + 6 + k * 7, CIANO[1]);
  g.rect(vx - 4, vy + 6, 4, 2, METAL[1]); g.rect(vx - 4, vy + 22, 4, 2, METAL[1]);
  // porta de enrolar
  const dx = 46, dy = 106, dw = 32, dh = 32;
  g.rect(dx - 3, dy - 3, dw + 6, dh + 3, GRAF[0]);
  for (let j = 0; j < dh; j++) for (let i = 0; i < dw; i++) g.px(dx + i, dy + j, pick(ARD, (j % 3 === 0 ? 0.85 : 0.45) - i / 120, dx + i, dy + j));
  for (let i = 0; i < dw; i++) s.glow(dx + i, dy - 2, CIANO[1]);
  // grafite "META" pichado
  hazard(g, dx + 6, dy + 24, 20, 4, AMAR);
  // canos laranja na fachada
  const PIPE = LARANJA;
  for (let y = 44; y < 140; y++) { g.px(12, y, FERRUG[1]); g.px(13, y, PIPE[3]); g.px(14, y, PIPE[2]); g.px(15, y, PIPE[1]); g.px(16, y, FERRUG[0]); }
  for (let x = 12; x < 34; x++) { g.px(x, 102, FERRUG[1]); g.px(x, 103, PIPE[3]); g.px(x, 104, PIPE[2]); g.px(x, 105, PIPE[1]); g.px(x, 106, FERRUG[0]); }
  for (const y of [60, 90, 120]) { g.rect(11, y, 7, 2, METAL[2]); g.px(11, y, METAL[3]); }
  g.rect(28, 100, 3, 9, METAL[2]);
  // válvula
  g.ellipse(24, 98, 3, 2, 0xc8382e); g.px(23, 97, 0xff8a7a);
  // tubo ciano luminoso na parede, lado da porta
  for (let j = 108; j < 136; j++) { s.glow(88, j, CIANO[1]); s.glow(89, j, CIANO[0]); s.glow(90, j, CIANO[2]); }
  g.rect(87, 106, 5, 2, METAL[2]); g.rect(87, 136, 5, 2, METAL[2]);
  // faixa de perigo no rodapé
  hazard(g, 4, 138, 120, 6, AMAR);
  outline(g);
  save('predio_neon', s, 'dir', { noOutline: true, normal: { bevel: 3 } });
}

function quiosqueLaranja() {
  const s = new Spr(64, 64);
  const g = s.img;
  for (const x of [4, 56]) cyl(g, x, 12, 4, 30, METAL);
  // fundo do quiosque (painel com produtos e tela)
  noisy(g, 8, 16, 48, 22, GRAF, { seed: 141, base: 0.35, amp: 0.3 });
  for (let k = 0; k < 3; k++) {
    const y = 18 + k * 7;
    for (let i = 9; i < 55; i++) g.px(i, y + 5, METAL[2]);
    for (let i = 10; i < 54; i += 4) {
      const c = [ramp(0xf03c5a, 3), ramp(0x3ee6f0, 3), ramp(0xf2c040, 3), ramp(0x8af050, 3)][(i + k) % 4];
      g.rect(i, y + 1, 3, 4, c[1]); g.px(i, y + 1, c[2]); g.px(i + 2, y + 4, c[0]);
    }
  }
  // toldo listrado laranja/branco
  awning(g, 0, 2, 64, 11, LARANJA, BRANCO, { stripe: 6 });
  for (let i = 1; i < 63; i++) { g.px(i, 2, METAL[3]); g.px(i, 3, METAL[2]); g.px(i, 1, GRAF[0]); }
  // balcão de metal com frisos laranja
  for (let j = 38; j < 42; j++) for (let i = 2; i < 62; i++) g.px(i, j, pick(METAL, 0.85 - (j - 38) * 0.15 - i / 200, i, j));
  for (let j = 42; j < 63; j++) for (let i = 3; i < 61; i++) {
    let v = 0.45 + (i % 10 === 0 ? 0.25 : 0) - (i % 10 === 9 ? 0.2 : 0) - (j - 42) / 80;
    g.px(i, j, pick(ARD, v, i, j));
  }
  for (let i = 3; i < 61; i++) { g.px(i, 46, LARANJA[3]); g.px(i, 47, LARANJA[2]); g.px(i, 48, LARANJA[1]); }
  // tela de preço dinâmico no balcão
  g.rect(36, 50, 20, 10, 0x101820);
  for (let j = 51; j < 59; j++) for (let i = 37; i < 55; i++) if ((j === 52 && i < 50) || (j === 55 && i < 46) || (j === 57 && i > 44)) s.glow(i, j, CIANO[1]); else s.E.px(i, j, null);
  for (const [x, y] of [[48, 54], [49, 53], [50, 52], [51, 51], [52, 52], [53, 53]]) s.glow(x, y, 0x50ff80); // seta subindo
  // caixinha registradora e "$" magenta
  g.rect(8, 33, 10, 5, GRAF[1]); g.rect(9, 31, 8, 2, GRAF[2]); s.glowRect(10, 32, 6, 1, [CIANO[1]]);
  const $ = [[12, 52], [13, 52], [14, 52], [11, 53], [12, 54], [13, 54], [14, 55], [11, 56], [12, 56], [13, 56], [12, 51], [12, 57]];
  for (const [x, y] of $) s.glow(x, y, MAGENTA[1]);
  // copos/latas no balcão
  for (const x of [24, 28, 46]) { cyl(g, x, 33, 3, 5, ramp(0xe8e8f0, 3)); g.px(x + 1, 33, 0xf03c5a); }
  save('quiosque_laranja', s, 'dir');
}

function lampiaoMetal() {
  const s = new Spr(16, 48);
  const g = s.img;
  const F = ramp(0x3a3e48, 4);
  cyl(g, 6, 12, 4, 33, F);
  g.rect(4, 44, 8, 4, F[1]); g.rect(5, 43, 6, 1, F[2]);
  for (const y of [20, 30]) { g.rect(5, y, 6, 1, F[3]); }
  // cabeça com cúpula e luz
  g.poly([[2, 5], [8, 0], [14, 5]], (x, y) => pick(F, 0.8 - (x - 2) / 14, x, y));
  g.rect(3, 5, 11, 1, F[0]);
  s.glowRect(4, 6, 9, 5, [AMBAR[0], AMBAR[1], AMBAR[1], AMBAR[2]]);
  for (const x of [3, 13]) for (let j = 6; j < 11; j++) g.px(x, j, F[1]);
  g.rect(3, 11, 11, 1, F[2]);
  save('lampiao_metal', s, 'dir');
}

function tuboCiano() {
  const s = new Spr(12, 40);
  const g = s.img;
  g.rect(1, 0, 10, 3, METAL[2]); g.rect(1, 0, 10, 1, METAL[3]);
  g.rect(1, 36, 10, 4, METAL[1]); g.rect(1, 36, 10, 1, METAL[3]);
  for (let j = 3; j < 36; j++) {
    s.glow(3, j, CIANO[2]); s.glow(4, j, CIANO[1]); s.glow(5, j, CIANO[0]); s.glow(6, j, CIANO[0]); s.glow(7, j, CIANO[1]); s.glow(8, j, CIANO[2]);
    if (j % 6 === 0) for (let i = 3; i < 9; i++) s.glow(i, j, 0xffffff);
  }
  for (const x of [2, 9]) for (let j = 3; j < 36; j++) g.px(x, j, METAL[0]);
  save('tubo_ciano', s, 'dir');
}

function barril() {
  const s = new Spr(16, 20);
  const g = s.img;
  const B = ramp(0x3a6aa0, 4);
  cyl(g, 1, 4, 14, 15, B);
  g.ellipse(8, 4, 7, 2.5, (x, y, nx, ny) => pick(B, 0.75 - nx * 0.2, x, y));
  g.ellipse(8, 4, 5, 1.5, B[1]); g.px(5, 4, B[0]); g.px(6, 4, B[0]);
  for (const y of [8, 15]) for (let i = 1; i < 15; i++) g.px(i, y, i < 5 ? METAL[3] : METAL[1]);
  // símbolo de perigo
  g.px(8, 10, AMAR[2]); g.px(7, 11, AMAR[2]); g.px(8, 11, 0x1c1a22); g.px(9, 11, AMAR[2]); g.rect(6, 12, 5, 1, AMAR[1]);
  save('barril', s, 'dir');
}

function barrilMadeira() {
  const s = new Spr(16, 20);
  const g = s.img;
  for (let j = 4; j < 19; j++) {
    const bulge = Math.round(Math.sin(((j - 4) / 15) * Math.PI) * 1);
    for (let i = 1 - bulge; i < 15 + bulge; i++) {
      const nx = (i - 7.5) / 8;
      const st = (i + 1) % 3 === 0;
      g.px(i, j, pick(MAD, 0.6 - nx * 0.45 - (st ? 0.2 : 0), i, j));
    }
  }
  g.ellipse(8, 4, 7, 2.5, (x, y, nx) => pick(MAD_C, 0.65 - nx * 0.2, x, y));
  for (let i = 3; i < 13; i += 3) g.px(i, 4, MAD[0]);
  for (const y of [7, 15]) for (let i = 0; i < 16; i++) if (g.get(i, y) !== null) g.px(i, y, i < 5 ? 0x8a8a90 : 0x4a4a54);
  save('barril_madeira', s, 'dir');
}

function caixaImg(w = 16, h = 16, seed = 161) {
  const g = new Img(w, h);
  const top = Math.round(h * 0.3);
  wood(g, 0, 0, w, top, MAD_C, { dir: 'h', pw: 3, seed, nails: false, bias: 0.2 });
  wood(g, 0, top, w, h - top, MAD, { dir: 'h', pw: 4, seed: seed + 1, nails: false });
  // reforço em X / bordas
  for (let j = top; j < h; j++) { g.px(0, j, MAD[1]); g.px(w - 1, j, MAD[0]); }
  for (let i = 0; i < w; i++) { g.px(i, top, MAD[3]); g.px(i, h - 1, MAD[0]); }
  const ph = h - top;
  for (let k = 0; k < Math.min(w, ph); k++) { g.px(Math.round(k * (w - 1) / (ph - 1)), top + k, MAD[1]); }
  // faixa laranja (Consórcio)
  for (let i = 0; i < w; i++) { g.px(i, top + 2, LARANJA[2]); g.px(i, top + 3, LARANJA[1]); }
  return g;
}

function caixa() {
  const s = new Spr(16, 16);
  s.img.blit(caixaImg(), 0, 0);
  save('caixa', s, 'dir');
}

function pilhaCaixas() {
  const s = new Spr(32, 32);
  const a = caixaImg(16, 16, 171), b = caixaImg(16, 16, 173), c = caixaImg(14, 14, 175);
  outline(a); outline(b); outline(c);
  s.img.blit(a, 0, 15);
  s.img.blit(b, 15, 16);
  s.img.blit(c, 8, 3);
  save('pilha_caixas', s, 'dir');
}

function cano() {
  const s = new Spr(32, 16);
  const g = s.img;
  for (let i = 0; i < 32; i++) for (let j = 4; j < 12; j++) {
    const ny = (j - 7.5) / 4;
    g.px(i, j, pick(LARANJA, 0.65 - ny * 0.5 + (hash(i, j, 181) < 0.08 ? -0.4 : 0), i, j));
  }
  for (const x of [0, 26]) for (let j = 2; j < 14; j++) for (let i = 0; i < 6; i++) g.px(x + i, j, pick(METAL, 0.7 - (j - 2) / 16 - (i === 5 ? 0.3 : 0), x + i, j));
  for (const x of [2, 28]) { g.px(x, 4, 0x2a2630); g.px(x, 11, 0x2a2630); }
  for (let i = 10; i < 20; i++) if (hash(i, 0, 182) < 0.5) g.px(i, 11, FERRUG[1]);
  save('cano', s, 'dir');
}

function placaPerigo() {
  const s = new Spr(24, 28);
  const g = s.img;
  for (const x of [3, 19]) cyl(g, x, 12, 2, 16, METAL);
  g.rect(0, 2, 24, 12, 0x1c1a22);
  hazard(g, 1, 3, 22, 10, AMAR);
  save('placa_perigo', s, 'dir');
}

function cercaMetal() {
  const s = new Spr(32, 24);
  const g = s.img;
  const F = ramp(0x5a6070, 4);
  for (let i = 0; i < 32; i++) { g.px(i, 5, F[3]); g.px(i, 6, F[2]); g.px(i, 7, F[1]); }
  hazard(g, 0, 12, 32, 4, AMAR);
  for (let i = 0; i < 32; i++) { g.px(i, 20, F[2]); g.px(i, 21, F[1]); }
  for (const x of [1, 17]) { cyl(g, x, 2, 4, 22, F); g.rect(x, 1, 4, 1, F[3]); }
  for (let x = 6; x < 32; x += 5) if (x !== 17 && x !== 18) for (let j = 8; j < 20; j++) if (j < 12 || j > 15) g.px(x, j, F[1]);
  save('cerca_metal', s, 'dir');
}

function lixeira() {
  const s = new Spr(16, 22);
  const g = s.img;
  const V = ramp(0x2a8a7a, 4);
  for (let j = 6; j < 22; j++) for (let i = 2; i < 14; i++) g.px(i, j, pick(V, 0.65 - (i - 2) / 18 - (i % 3 === 0 ? 0.15 : 0), i, j));
  g.ellipse(8, 5, 7, 2.5, (x, y, nx) => pick(GRAF, 0.75 - nx * 0.25, x, y));
  g.rect(6, 2, 4, 2, GRAF[2]);
  // tela do "app" com taxa
  s.glowRect(5, 10, 6, 4, [MAGENTA[1], MAGENTA[2]]);
  g.px(7, 11, 0xffffff); s.E.px(7, 11, 0xffffff);
  save('lixeira', s, 'dir');
}

function painelHolograma() {
  const s = new Spr(28, 44);
  const g = s.img;
  cyl(g, 11, 28, 6, 14, GRAF);
  g.ellipse(14, 42, 8, 2.5, (x, y, nx) => pick(METAL, 0.7 - nx * 0.3, x, y));
  // emissor
  for (let i = 10; i < 18; i++) s.glow(i, 28, CIANO[1]);
  // painel translúcido (só emissivo, pontilhado)
  for (let j = 2; j < 26; j++) for (let i = 2; i < 26; i++) {
    const edge = i === 2 || i === 25 || j === 2 || j === 25;
    if (edge) s.glow(i, j, CIANO[1]);
    else if ((i + j) % 2 === 0 && hash(i, j, 191) < 0.45) s.glow(i, j, CIANO[3]);
    if ((j === 8 && i > 5 && i < 20) || (j === 12 && i > 5 && i < 16)) s.glow(i, j, CIANO[0]);
  }
  // gráfico subindo (meta!)
  for (const [x, y] of [[6, 21], [8, 20], [10, 21], [12, 18], [14, 17], [16, 14], [18, 15], [20, 11]]) { s.glow(x, y, MAGENTA[1]); s.glow(x + 1, y, MAGENTA[1]); }
  // feixe
  for (let j = 26; j < 28; j++) for (let i = 8; i < 20; i++) if ((i + j) % 2) s.glow(i, j, CIANO[2]);
  // contorno só no suporte (o holograma fica sem borda)
  const sup = new Img(28, 44);
  for (let y = 28; y < 44; y++) for (let x = 0; x < 28; x++) { const c = g.get(x, y); if (c !== null && s.E.get(x, y) === null) sup.px(x, y, c); }
  outline(sup);
  g.blit(sup, 0, 0);
  save('painel_holograma', s, 'dir', { noOutline: true });
}

// ======================= MEIO =======================

function ponte() {
  const W = 160, H = 64;
  const mid = 80;
  const chao = new Spr(W, H);
  const g = chao.img;
  const deckTop = 10, deckBot = 50;
  // grade de trás (fica atrás do boneco)
  for (let x = 0; x < W; x++) {
    const madeira = x < mid;
    const C = madeira ? MAD : METAL;
    g.px(x, 3, C[3]); g.px(x, 4, C[2]); g.px(x, 5, C[1]);
    g.px(x, 8, C[2]); g.px(x, 9, C[1]);
  }
  for (let x = 2; x < W; x += 12) {
    const madeira = x < mid;
    cyl(g, x, 1, 4, 10, madeira ? MAD : METAL);
    if (!madeira) { g.px(x + 1, 3, 0x2a2630); }
  }
  // tabuleiro: madeira à esquerda (tábuas em pé = atravessam o fluxo), aço à direita
  wood(g, 0, deckTop, mid - 4, deckBot - deckTop, MAD_C, { pw: 6, seed: 201 });
  for (let j = deckTop; j < deckBot; j++) for (let i = mid + 4; i < W; i++) {
    const di = (i - (mid + 4)) % 8, dj = (j - deckTop) % 8;
    let v = 0.55 + (vnoise(i * 0.12, j * 0.12, 202) - 0.5) * 0.3;
    if ((di === dj) || (di === 7 - dj)) v += 0.18; // relevo xadrez antiderrapante
    if ((i - (mid + 4)) % 32 === 31) v = 0.02; // emenda das chapas
    if ((i - (mid + 4)) % 32 === 0) v += 0.25;
    g.px(i, j, pick(METAL, v, i, j, 0.4));
  }
  for (let i = mid + 6; i < W; i += 32) for (const j of [deckTop + 2, deckBot - 3]) { g.px(i, j, METAL[3]); g.px(i + 1, j + 1, METAL[0]); }
  // ferrugem e manchas no aço
  for (let k = 0; k < 40; k++) { const i = mid + 4 + Math.floor(hash(k, 1, 203) * 76), j = deckTop + Math.floor(hash(k, 2, 203) * 40); g.px(i, j, FERRUG[1 + (k % 2)]); }
  // faixa de perigo no meio
  hazard(g, mid - 4, deckTop, 8, deckBot - deckTop, AMAR);
  // viga da frente (face lateral do tabuleiro)
  for (let j = deckBot; j < 60; j++) for (let i = 0; i < W; i++) {
    const t = (j - deckBot) / 10;
    if (i < mid) g.px(i, j, pick(MAD, 0.55 - t * 0.5 + (i % 6 === 0 ? -0.15 : 0), i, j));
    else g.px(i, j, pick(GRAF, 0.7 - t * 0.5, i, j));
  }
  for (let i = mid + 3; i < W; i += 6) g.px(i, deckBot + 4, METAL[3]);
  for (let i = 0; i < W; i++) g.px(i, deckBot, i < mid ? MAD[3] : METAL[3]);
  // sombra da grade de trás no tabuleiro
  darken(g, 0, deckTop, W, 2, -0.4);
  save('ponte_chao', chao, 'meio', { normal: { bevel: 1, lumK: 0.4 } });

  // grade da frente (por cima do boneco)
  const fr = new Spr(W, H);
  const h = fr.img;
  const railY = 42;
  for (let x = 0; x < W; x++) {
    const madeira = x < mid;
    const C = madeira ? MAD_C : METAL;
    h.px(x, railY, C[3]); h.px(x, railY + 1, C[2]); h.px(x, railY + 2, C[1]);
    if (madeira) { h.px(x, railY + 6, MAD[2]); h.px(x, railY + 7, MAD[1]); }
    else { h.px(x, railY + 6, AMAR[2]); h.px(x, railY + 7, 0x1c1a22); }
  }
  for (let x = 1; x < W; x += 12) {
    const madeira = x < mid;
    cyl(h, x, railY - 3, 4, 14, madeira ? MAD : METAL);
    h.px(x + 1, railY - 3, madeira ? MAD[3] : METAL[3]);
  }
  // lampiões da ponte nos dois lados (um de cada mundo)
  h.px(0, 0, null);
  save('ponte_grade_frente', fr, 'meio');
}

function cascata() {
  const W = 96, H = 48;
  const AG = [shift(BASE.agua, -0.6), shift(BASE.agua, -0.3), BASE.agua, BASE.aguaClara, 0xa8e4f8, BASE.espuma];
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const g = new Img(W, H);
    const left = (y) => 6 + Math.round(Math.sin(y * 0.3) * 1);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (x < left(y) - (y > 38 ? (y - 38) : 0) || x > W - 1 - left(y + 3) + (y > 38 ? (y - 38) : 0)) continue;
      const ph = hash(Math.floor(x / 2), 0, 211) * Math.PI * 2;
      const streak = Math.sin(((y - f * 12) / 48) * Math.PI * 2 * 2 + ph) * 0.5 + 0.5;
      const col = hash(Math.floor(x / 3), 1, 212);
      let v = 0.08 + streak ** 2 * 0.55 + col * 0.18 + (y < 5 ? 0.25 : 0);
      const xe = Math.min(x - left(y), W - 1 - left(y) - x);
      if (xe < 3) v -= 0.25;
      if (y > 34) v += (y - 34) / 14 * 0.6; // espuma embaixo
      let c = pick(AG, v, x, y, 0.7);
      if (y > 36 && hash(x, y + f * 7, 213) < (y - 36) / 14) c = AG[5];
      g.px(x, y, c);
    }
    // borda de pedra no topo (lábio da queda)
    for (let x = 0; x < W; x++) { g.px(x, 0, BASE.espuma); if (hash(x, f, 214) < 0.5) g.px(x, 1, 0xd8f4ff); }
    frames.push({ name: 'cascata_' + f, img: g, normal: null });
  }
  for (const fr of frames) fr.normal = undefined;
  saveAtlas(OUT + 'cascata', frames, { cols: 4, normal: { bevel: 2, lumK: 0.8 } });
  all.push({ name: 'cascata', img: frames[0].img, lado: 'meio' });
}

// ======================= roda tudo =======================
casaMusgo(); bancaRoxa(); pedraRuna('pedra_runa', 51, 0); pedraRuna('pedra_runa_2', 52, 1); arvoreRoxa(); arvore(); pinheiro();
arbusto(); touceira(); flores(); lampiaoMadeira(); bandeiraRaizes(); cercaMadeira(); cogumelos(); pedras();
predioNeon(); quiosqueLaranja(); lampiaoMetal(); tuboCiano(); barril(); barrilMadeira(); caixa(); pilhaCaixas(); cano();
placaPerigo(); cercaMetal(); lixeira(); painelHolograma();
ponte(); cascata();

// ---------- preview 3x ----------
function preview() {
  const S = 3, PAD = 6, MAXW = 560;
  const groups = { esq: [], meio: [], dir: [] };
  for (const a of all) groups[a.lado].push(a);
  const layout = (list) => {
    let x = PAD, y = PAD, rowH = 0;
    const pos = [];
    for (const a of list) {
      if (x + a.img.w > MAXW) { x = PAD; y += rowH + PAD; rowH = 0; }
      pos.push([a, x, y]);
      x += a.img.w + PAD;
      rowH = Math.max(rowH, a.img.h);
    }
    return { pos, h: y + rowH + PAD };
  };
  const top = layout([...groups.esq, ...groups.meio]);
  const bot = layout([...groups.dir, ...groups.meio.slice(0, 1)]);
  const P = new Img(MAXW, top.h + bot.h);
  P.rect(0, 0, MAXW, top.h, 0x5a8a34);
  P.rect(0, top.h, MAXW, bot.h, 0x4a4e58);
  for (const [a, x, y] of top.pos) P.blit(a.img, x, y);
  for (const [a, x, y] of bot.pos) P.blit(a.img, x, top.h + y);
  const B = new Img(P.w * S, P.h * S);
  for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) { const c = P.get(Math.floor(x / S), Math.floor(y / S)); if (c !== null) B.px(x, y, c); }
  savePng(B, 'tools/art/saida/preview-cenario.png');
}
preview();
console.log(all.length + ' sprites');
