// Bonecos da cena de teste (Etapa 1 da revisão visual): Peão Brabo, Idol, Benzedeira, PM e drones.
// Quadros 32x48 (drones 24x24 e 32x32), pés na linha 46 centrados entre x=15 e x=16.
// Direções: baixo, cima, lado (virado para a direita; a esquerda sai com flipX).
// Uso: node tools/art/personagens.mjs
import { Img, outline, ramp, hash, mix } from './lib/img.mjs';
import { R } from './lib/paleta.mjs';
import { box, shape, blob, limb, eye, preview, idx, ellipseIf } from './lib/boneco.mjs';
import { savePng, saveAtlas } from './lib/img.mjs';

const OUT = 'packages/client/public/teste-visual/';
const W = 32, H = 48;

// ---------- materiais ----------
const M = {
  pele: [0xa85a3e, 0xd88a62, 0xf2b48a, 0xffdcb4], peleMorena: [0x6a3a2a, 0x9a5a3a, 0xc4825a, 0xe0a87a], jeans: R.jeans, couro: R.couro, ouro: R.ouro, palha: R.palha,
  xadrez: R.vermelho, chapeu: ramp(0x8f5a32), faixa: ramp(0x4a2c1c), cabelo: ramp(0x5e3822), bigode: ramp(0x4a2a18),
  bota: ramp(0x6a3e22), lilas: [0x6a4a9a, 0x9a78d0, 0xc0a2ee, 0xe2d0ff], prata: ramp(0xc4c8d4), rosa: ramp(0xf070b0), calcaPreta: ramp(0x3a3448),
  tenis: ramp(0xe8eaf0), grisalho: [0x6a6a7a, 0x9a9aaa, 0xc8c8d2, 0xeeeef4], xale: ramp(0x3f7a3a), saia: ramp(0x7a4a2c), creme: ramp(0xecdcc0),
  bone: ramp(0x34343e), colete: ramp(0x3a3c48), camisaCinza: ramp(0x8a909c), faixaAmarela: ramp(0xf2c230),
  grafite: ramp(0x5a606e), magenta: ramp(0xe040b8), laranja: R.laranja, folhaBrilho: ramp(0x7ae05a),
};
const ESC = 0x1c1418; // traço escuro de detalhe (pupila, boca)

// ---------- poses ----------
function walkPose(i) {
  const s = Math.sin((i / 6) * Math.PI * 2);
  return {
    bob: Math.abs(s) > 0.7 ? 1 : 0,
    liftL: s > 0.7 ? 2 : s > 0.3 ? 1 : 0,
    liftR: s < -0.7 ? 2 : s < -0.3 ? 1 : 0,
    stride: Math.round(s * 3),
    swing: s,
  };
}
const idlePose = (i) => ({ bob: i, liftL: 0, liftR: 0, stride: 0, swing: 0, breath: i });

// ---------- peças comuns ----------
/** Anel (laço) sombreado. */
function ring(img, cx, cy, rx, ry, r) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      const ix = (x + 0.5 - cx) / (rx - 1.1), iy = (y + 0.5 - cy) / (ry - 1.1);
      if (nx * nx + ny * ny <= 1 && ix * ix + iy * iy > 1) img.px(x, y, r[ny < 0 ? 3 : nx > 0.3 ? 1 : 2]);
    }
}
/** Perna de frente/costas: coluna de x0..x1 do quadril até a bota, com bota. */
function legFront(img, x0, x1, top, lift, calca, bota, { toeOut = 0, bootH = 3 } = {}) {
  const foot = 46 - lift;
  box(img, x0, top, x1, foot - bootH, calca, { k: 0.8 });
  // dobra do joelho
  img.px(x0 + 1, top + 3, calca[1]);
  box(img, x0 - (toeOut < 0 ? 1 : 0), foot - bootH + 1, x1 + (toeOut > 0 ? 1 : 0), foot, bota, { k: 0.6 });
  img.px(toeOut < 0 ? x0 - 1 : x1 + 1, foot - bootH + 1, null);
}
/** Perna de lado: tubo do quadril ao pé + bota com bico para a direita. */
function legSide(img, hipX, hipY, fx, lift, calca, bota, bias = 0, bootLen = 5) {
  const fy = 46 - lift;
  limb(img, hipX, hipY, fx, fy - 3, 4.2, calca, { bias });
  box(img, fx - 2, fy - 2, fx - 2 + bootLen, fy, bota, { bias, k: 0.5 });
  img.px(fx - 2 + bootLen, fy - 2, null);
}
/** Braço: manga do ombro ao cotovelo, antebraço de pele (ou manga inteira) e mão. */
function arm(img, sx, sy, hx, hy, manga, pele, { full = false, pat, bias = 0, w = 3.6 } = {}) {
  const ex = sx + (hx - sx) * 0.55, ey = sy + (hy - sy) * 0.55;
  if (full) limb(img, sx, sy, hx, hy - 0.5, w, manga, { pat, bias });
  else {
    limb(img, ex, ey, hx, hy - 0.5, w - 0.6, pele, { bias });
    limb(img, sx, sy, ex, ey, w, manga, { pat, bias });
  }
  blob(img, hx, hy + 0.5, 1.9, 1.9, pele, { bias });
}
const xadrez = (x, y, i) => i - (x % 4 === 1 ? 1 : 0) - (y % 4 === 3 ? 1 : 0);
const brilhoSalpicado = (seed) => (x, y, i) => (hash(x, y, seed) > 0.86 ? 3 : i);

// ================= PEÃO BRABO =================
function hatFront(img, b, { side = false } = {}) {
  const C = M.chapeu;
  // aba: elipse larga, com as pontas viradas para cima
  const cx = side ? 17 : 16, rx = side ? 13 : 14.5, cy = 12 + b;
  img.ellipse(cx, cy, rx, side ? 2.6 : 3.2, (x, y, nx, ny) => C[ny < -0.2 ? (Math.abs(nx) > 0.75 ? 3 : 2) : ny < 0.45 ? 1 : 0]);
  if (!side) {
    for (const [x, y] of [[2, 10], [3, 10], [2, 11], [28, 10], [29, 10], [29, 11]]) img.px(x, y + b, C[x < 16 ? 3 : 2]);
  } else {
    for (const [x, y] of [[4, 10], [4, 11], [29, 11], [29, 10]]) img.px(x, y + b, C[2]);
  }
  // copa com o vinco no meio
  const pts = side
    ? [[10, 11], [11, 4.5], [14, 2], [19, 2.5], [22.5, 4.5], [23, 11]]
    : [[9.5, 11], [10.5, 4], [13.5, 2], [16, 3.2], [18.5, 2], [21.5, 4], [22.5, 11]];
  shape(img, pts.map(([x, y]) => [x, y + b]), C, { k: 1.1, dither: 0.5 });
  if (!side) { img.px(15, 3 + b, C[0]); img.px(15, 4 + b, C[1]); img.px(16, 4 + b, C[0]); img.px(15, 5 + b, C[1]); }
  // faixa com tachas douradas
  const x0 = side ? 10 : 10, x1 = side ? 22 : 21;
  box(img, x0, 8 + b, x1, 9 + b, M.faixa, { k: 1.2 });
  const tachas = side ? [12, 15, 18, 21] : [10, 13, 16, 19];
  for (const x of tachas) { img.px(x, 8 + b, M.ouro[3]); img.px(x + 1, 8 + b, M.ouro[2]); img.px(x, 9 + b, M.ouro[1]); img.px(x + 1, 9 + b, M.ouro[0]); }
}

function peaoFront(img, p, atk) {
  const b = p.bob;
  // pernas e botas
  box(img, 11, 36 + b, 20, 38 + b, M.jeans);
  legFront(img, 10, 14, 37 + b, p.liftL, M.jeans, M.bota, { toeOut: -1 });
  legFront(img, 17, 21, 37 + b, p.liftR, M.jeans, M.bota, { toeOut: 1 });
  img.px(15, 38 + b, M.jeans[0]); img.px(16, 38 + b, M.jeans[0]);
  // tronco: camisa xadrez aberta
  shape(img, [[8.5, 26 + b], [23.5, 26 + b], [22.5, 37 + b], [9.5, 37 + b]], M.xadrez, { pat: xadrez, k: 0.9 });
  shape(img, [[13, 26 + b], [19, 26 + b], [17, 32 + b], [15, 32 + b]], M.pele, { bias: 0.05 });
  for (const [x, y] of [[15, 28], [16, 29], [15, 30], [16, 27]]) img.px(x, y + b, M.cabelo[1]);
  for (const [x, y, t] of [[12, 26, 3], [13, 27, 3], [12, 27, 2], [19, 26, 2], [18, 27, 2], [19, 27, 1]]) img.px(x, y + b, M.xadrez[t]);
  // cinto e a fivela do tamanho de um prato
  box(img, 10, 35 + b, 21, 36 + b, M.couro, { k: 0.5 });
  blob(img, 16, 36 + b, 3.6, 2.2, M.ouro, { bias: 0.1 });
  img.px(15, 36 + b, M.ouro[0]); img.px(16, 36 + b, M.ouro[1]); img.px(14, 35 + b, M.ouro[3]);
  // laço no quadril direito
  ring(img, 24.5, 38.5 + b, 2.8, 3.2, M.palha);
  // braços
  const sw = Math.round(p.swing);
  arm(img, 9.5, 27.5 + b, 7.5, 34.5 + b + sw, M.xadrez, M.pele, { pat: xadrez });
  if (atk === 0) arm(img, 22.5, 27.5 + b, 26, 22 + b, M.xadrez, M.pele, { pat: xadrez });
  else if (atk === 1) { arm(img, 22.5, 27.5 + b, 18.5, 32 + b, M.xadrez, M.pele, { pat: xadrez }); blob(img, 18.5, 32.5 + b, 2.6, 2.6, M.pele, { bias: 0.1 }); }
  else if (atk === 2) arm(img, 22.5, 27.5 + b, 25, 31 + b, M.xadrez, M.pele, { pat: xadrez });
  else arm(img, 22.5, 27.5 + b, 24.5, 34.5 + b - sw, M.xadrez, M.pele, { pat: xadrez });
  // cabeça
  blob(img, 7.5, 18.5 + b, 1.6, 2, M.pele); blob(img, 24.5, 18.5 + b, 1.6, 2, M.pele);
  blob(img, 16, 17 + b, 8.6, 8.4, M.pele, { bias: 0.05 });
  box(img, 7, 12 + b, 9, 18 + b, M.cabelo); box(img, 22, 12 + b, 24, 18 + b, M.cabelo, { bias: -0.1 });
  img.px(8, 19 + b, M.cabelo[1]); img.px(23, 19 + b, M.cabelo[0]);
  // sombra da aba no rosto
  for (let x = 9; x <= 22; x++) img.px(x, 14 + b, M.pele[1]);
  // sobrancelhas grossas, olhos, nariz, bochechas
  for (const [x, y] of [[10, 15], [11, 15], [12, 15], [13, 16], [21, 15], [20, 15], [19, 15], [18, 16]]) img.px(x, y + b, M.bigode[1]);
  eye(img, 11, 17 + b, 0x6a3a1a); eye(img, 19, 17 + b, 0x6a3a1a);
  img.px(15, 20 + b, M.pele[3]); img.px(16, 20 + b, M.pele[1]); img.px(16, 21 + b, M.pele[1]);
  img.px(10, 20 + b, 0xe88a78); img.px(21, 20 + b, 0xd87868);
  // bigodão
  shape(img, [[10.5, 21.5 + b], [21.5, 21.5 + b], [22.5, 24 + b], [21, 25 + b], [18.5, 23.4 + b], [13.5, 23.4 + b], [11, 25 + b], [9.5, 24 + b]], M.bigode, { dither: 0.6 });
  img.px(14, 21 + b, M.bigode[2]); img.px(17, 21 + b, M.bigode[2]);
  img.px(15, 24 + b, 0x8a3a30); img.px(16, 24 + b, 0x8a3a30);
  hatFront(img, b);
}

function peaoBack(img, p, atk) {
  const b = p.bob;
  box(img, 11, 36 + b, 20, 38 + b, M.jeans);
  legFront(img, 10, 14, 37 + b, p.liftR, M.jeans, M.bota, { toeOut: -1 });
  legFront(img, 17, 21, 37 + b, p.liftL, M.jeans, M.bota, { toeOut: 1 });
  // bolsos de trás
  box(img, 11, 38 + b, 13, 39 + b, M.jeans, { bias: -0.35 }); box(img, 18, 38 + b, 20, 39 + b, M.jeans, { bias: -0.35 });
  shape(img, [[8.5, 26 + b], [23.5, 26 + b], [22.5, 37 + b], [9.5, 37 + b]], M.xadrez, { pat: xadrez, k: 0.9 });
  // adesivo "100% MACHO" descascando (um retalho claro)
  box(img, 14, 30 + b, 17, 31 + b, M.creme); img.px(17, 30 + b, M.creme[1]);
  img.px(15, 31 + b, M.xadrez[0]);
  box(img, 10, 35 + b, 21, 36 + b, M.couro, { k: 0.5 });
  ring(img, 7, 38.5 + b, 2.8, 3.2, M.palha);
  const sw = Math.round(p.swing);
  arm(img, 9.5, 27.5 + b, 7.5, 34.5 + b - sw, M.xadrez, M.pele, { pat: xadrez });
  if (atk === 0) arm(img, 22.5, 27.5 + b, 26, 22 + b, M.xadrez, M.pele, { pat: xadrez });
  else if (atk === 1) arm(img, 22.5, 27.5 + b, 20, 20 + b, M.xadrez, M.pele, { pat: xadrez });
  else if (atk === 2) arm(img, 22.5, 27.5 + b, 25, 30 + b, M.xadrez, M.pele, { pat: xadrez });
  else arm(img, 22.5, 27.5 + b, 24.5, 34.5 + b + sw, M.xadrez, M.pele, { pat: xadrez });
  // nuca e cabelo
  box(img, 14, 24 + b, 17, 26 + b, M.pele, { bias: -0.2 });
  blob(img, 16, 17 + b, 8.6, 8.4, M.cabelo, { pat: (x, y, i) => i - ((x + (y >> 1)) % 3 === 0 ? 1 : 0) });
  blob(img, 7.5, 18.5 + b, 1.5, 2, M.pele, { bias: -0.1 }); blob(img, 24.5, 18.5 + b, 1.5, 2, M.pele, { bias: -0.2 });
  hatFront(img, b);
  // aba vista de trás: borda de baixo mais escura
  for (let x = 4; x <= 27; x++) img.px(x, 14 + b, M.chapeu[0]);
}

function peaoSide(img, p, atk) {
  const b = p.bob, s = p.stride;
  // perna de trás
  legSide(img, 15, 37 + b, 15 - s, s < 0 ? 1 : 0, M.jeans, M.bota, -0.25);
  // braço de trás
  if (atk === undefined) arm(img, 14, 28 + b, 14 - p.swing * 3, 34.5 + b, M.xadrez, M.pele, { pat: xadrez, bias: -0.25 });
  // tronco
  shape(img, [[11, 26 + b], [20.5, 26 + b], [20.5, 37 + b], [11.5, 37 + b]], M.xadrez, { pat: xadrez });
  box(img, 19, 26 + b, 20, 30 + b, M.pele, { bias: 0.05 });
  img.px(19, 28 + b, M.cabelo[1]);
  box(img, 11, 35 + b, 20, 36 + b, M.couro, { k: 0.5 });
  box(img, 19, 34 + b, 21, 37 + b, M.ouro, { bias: 0.1 });
  img.px(20, 35 + b, M.ouro[0]);
  ring(img, 11, 38 + b, 2.2, 2.8, M.palha);
  // perna da frente
  legSide(img, 16, 37 + b, 16 + s, s > 0 ? 1 : 0, M.jeans, M.bota, 0);
  // braço da frente
  if (atk === 0) arm(img, 16, 28 + b, 10.5, 27 + b, M.xadrez, M.pele, { pat: xadrez });
  else if (atk === 1) { arm(img, 16, 28 + b, 27, 29 + b, M.xadrez, M.pele, { pat: xadrez }); blob(img, 27.5, 29.5 + b, 2.4, 2.4, M.pele, { bias: 0.1 }); }
  else if (atk === 2) arm(img, 16, 28 + b, 22, 32 + b, M.xadrez, M.pele, { pat: xadrez });
  else arm(img, 16, 28 + b, 16 + p.swing * 3, 34.5 + b, M.xadrez, M.pele, { pat: xadrez });
  // cabeça de perfil
  blob(img, 16, 17 + b, 8.4, 8.4, M.pele, { bias: 0.2 });
  shape(img, [[7.5, 12 + b], [13, 12 + b], [13, 21 + b], [10, 23 + b], [8, 20 + b]], M.cabelo, { k: 0.6 });
  blob(img, 13, 18.5 + b, 1.6, 2.1, M.pele, { bias: 0.1 }); img.px(13, 19 + b, M.pele[0]);
  for (let x = 13; x <= 24; x++) img.px(x, 14 + b, M.pele[1]);
  img.px(24, 19 + b, M.pele[2]); img.px(25, 19 + b, M.pele[2]); img.px(25, 20 + b, M.pele[1]); // nariz
  for (const [x, y] of [[19, 15], [20, 15], [21, 15], [22, 16]]) img.px(x, y + b, M.bigode[1]);
  eye(img, 20, 17 + b, 0x6a3a1a);
  img.px(19, 20 + b, 0xe88a78);
  shape(img, [[18.5, 21.5 + b], [25.5, 21.5 + b], [25.5, 23.5 + b], [21.5, 23 + b], [19.5, 25 + b], [18, 24 + b]], M.bigode, { dither: 0.6 });
  img.px(22, 24 + b, M.pele[1]); img.px(23, 24 + b, M.pele[2]);
  hatFront(img, b, { side: true });
}

// ================= IDOL =================
const mechas = (x, y, i) => i - ((x + 1) % 3 === 0 ? 1 : 0);
function idolFront(img, p) {
  const b = p.bob;
  // cabelo de trás (longo)
  shape(img, [[6.5, 12 + b], [25.5, 12 + b], [26, 37 + b], [23, 39 + b], [9, 39 + b], [6, 37 + b]], M.lilas, { pat: mechas, k: 0.7, bias: -0.15 });
  // pernas pretas e tênis brancos
  box(img, 11, 36 + b, 20, 38 + b, M.calcaPreta);
  legFront(img, 10, 14, 37 + b, p.liftL, M.calcaPreta, M.tenis, { toeOut: -1, bootH: 2 });
  legFront(img, 17, 21, 37 + b, p.liftR, M.calcaPreta, M.tenis, { toeOut: 1, bootH: 2 });
  // top rosa e jaqueta prateada aberta
  box(img, 12, 26 + b, 19, 34 + b, M.rosa);
  box(img, 13, 33 + b, 18, 34 + b, M.pele, { bias: 0.05 });
  shape(img, [[8.5, 26 + b], [13.5, 26 + b], [13.5, 36 + b], [9, 36 + b]], M.prata, { pat: brilhoSalpicado(3) });
  shape(img, [[18.5, 26 + b], [23.5, 26 + b], [23, 36 + b], [18.5, 36 + b]], M.prata, { pat: brilhoSalpicado(4), bias: -0.15 });
  for (let y = 27; y <= 35; y++) { img.px(13, y + b, M.prata[0]); img.px(18, y + b, M.prata[1]); }
  box(img, 10, 35 + b, 21, 35 + b, M.calcaPreta, { bias: 0.2 });
  arm(img, 9.5, 27.5 + b, 7.5, 34.5 + b, M.prata, M.pele, { full: true, pat: brilhoSalpicado(5) });
  arm(img, 22.5, 27.5 + b, 24.5, 34.5 + b, M.prata, M.pele, { full: true, pat: brilhoSalpicado(6), bias: -0.15 });
  // cabeça
  blob(img, 16, 17 + b, 8.4, 8.4, M.pele, { bias: 0.1 });
  // topo do cabelo e franja reta
  ellipseIf(img, 16, 13 + b, 9.6, 7.2, (x, y, nx, ny) => (y <= 14 + b ? M.lilas[idx(4, 0.95 - 0.35 * (nx + 1) - 0.25 * (ny + 1) + (x % 3 === 1 ? -0.25 : 0), x, y, 0.5)] : null));
  for (let x = 8; x <= 23; x++) img.px(x, 14 + b, x % 2 ? M.lilas[1] : M.lilas[2]);
  // brilho da tiara no cabelo
  for (const [x, y] of [[10, 9], [11, 8], [12, 8], [13, 7]]) img.px(x, y + b, M.lilas[3]);
  // mechas laterais
  box(img, 6, 13 + b, 8, 30 + b, M.lilas, { pat: mechas, bias: 0.05 });
  box(img, 23, 13 + b, 25, 30 + b, M.lilas, { pat: mechas, bias: -0.2 });
  for (let y = 15; y <= 21; y++) { img.px(8, y + b, M.pele[2]); img.px(23, y + b, M.pele[1]); }
  // olhos grandes com cílio
  eye(img, 11, 17 + b, 0xd070f0, { h: 3 }); eye(img, 19, 17 + b, 0xd070f0, { h: 3 });
  img.px(10, 20 + b, 0xf49ab0); img.px(21, 20 + b, 0xf49ab0);
  img.px(15, 22 + b, 0xd84870); img.px(16, 22 + b, 0xe86080);
  // headset: fone e o microfone até a boca
  box(img, 24, 16 + b, 25, 19 + b, ramp(0x30303a));
  for (const [x, y] of [[23, 20], [22, 21], [21, 22], [20, 22]]) img.px(x, y + b, 0x30303a);
  img.px(18, 22 + b, 0x101014);
}
function idolBack(img, p) {
  const b = p.bob;
  box(img, 11, 36 + b, 20, 38 + b, M.calcaPreta);
  legFront(img, 10, 14, 37 + b, p.liftR, M.calcaPreta, M.tenis, { toeOut: -1, bootH: 2 });
  legFront(img, 17, 21, 37 + b, p.liftL, M.calcaPreta, M.tenis, { toeOut: 1, bootH: 2 });
  shape(img, [[8.5, 26 + b], [23.5, 26 + b], [23, 37 + b], [9, 37 + b]], M.prata, { pat: brilhoSalpicado(7) });
  arm(img, 9.5, 27.5 + b, 7.5, 34.5 + b, M.prata, M.pele, { full: true, pat: brilhoSalpicado(8) });
  arm(img, 22.5, 27.5 + b, 24.5, 34.5 + b, M.prata, M.pele, { full: true, pat: brilhoSalpicado(9), bias: -0.15 });
  // cabelão cobrindo as costas
  blob(img, 16, 16 + b, 9.4, 9, M.lilas, { pat: mechas });
  shape(img, [[6.5, 15 + b], [25.5, 15 + b], [26, 34 + b], [23, 36 + b], [9, 36 + b], [6, 34 + b]], M.lilas, { pat: mechas, k: 0.8 });
  for (let x = 9; x <= 20; x++) if (x % 3 !== 2) img.px(x, 10 + b - (x > 14 ? 0 : 0), M.lilas[3]);
  for (let x = 8; x <= 23; x += 3) img.px(x, 36 + b, M.lilas[1]);
  box(img, 23, 15 + b, 24, 17 + b, ramp(0x30303a));
}
function idolSide(img, p) {
  const b = p.bob, s = p.stride;
  shape(img, [[7, 12 + b], [15, 12 + b], [15, 37 + b], [11, 39 + b], [7, 37 + b], [6, 30 + b]], M.lilas, { pat: mechas, bias: -0.1 });
  legSide(img, 15, 37 + b, 15 - s, s < 0 ? 1 : 0, M.calcaPreta, M.tenis, -0.25, 4);
  shape(img, [[12, 26 + b], [20.5, 26 + b], [20.5, 36 + b], [12, 36 + b]], M.prata, { pat: brilhoSalpicado(10) });
  box(img, 19, 27 + b, 20, 33 + b, M.rosa);
  legSide(img, 16, 37 + b, 16 + s, s > 0 ? 1 : 0, M.calcaPreta, M.tenis, 0, 4);
  arm(img, 16, 28 + b, 16 + p.swing * 3, 34.5 + b, M.prata, M.pele, { full: true, pat: brilhoSalpicado(11) });
  blob(img, 16.5, 17 + b, 8.2, 8.4, M.pele, { bias: 0.25 });
  ellipseIf(img, 16, 13 + b, 9.4, 7, (x, y, nx, ny) => (y <= 14 + b ? M.lilas[idx(4, 0.95 - 0.35 * (nx + 1) - 0.25 * (ny + 1) + (x % 3 === 1 ? -0.25 : 0), x, y, 0.5)] : null));
  for (let x = 17; x <= 24; x++) img.px(x, 14 + b, x % 2 ? M.lilas[1] : M.lilas[2]);
  box(img, 7, 13 + b, 14, 24 + b, M.lilas, { pat: mechas });
  for (const [x, y] of [[10, 9], [11, 8], [12, 8], [13, 7]]) img.px(x, y + b, M.lilas[3]);
  box(img, 14, 16 + b, 15, 19 + b, ramp(0x30303a));
  for (const [x, y] of [[16, 20], [17, 21], [18, 22], [19, 22], [20, 22]]) img.px(x, y + b, 0x30303a);
  img.px(21, 22 + b, 0x101014);
  eye(img, 20, 17 + b, 0xd070f0);
  img.px(20, 20 + b, 0xf49ab0);
  img.px(24, 19 + b, M.pele[2]);
  img.px(23, 22 + b, 0xd84870);
}

// ================= BENZEDEIRA =================
function benzeFront(img, p, em, i) {
  const b = p.bob;
  // saia comprida com pregas
  shape(img, [[8.5, 34], [23.5, 34], [25, 45], [7, 45]], M.saia, { pat: (x, y, k) => k - (x % 4 === 2 ? 1 : 0) });
  box(img, 10, 45, 14, 46, ramp(0x3a2a24)); box(img, 17, 45, 21, 46, ramp(0x3a2a24));
  // avental de renda
  shape(img, [[11.5, 33 + b], [20.5, 33 + b], [21.5, 41], [10.5, 41]], M.creme, { bias: 0.1 });
  for (let x = 11; x <= 21; x += 2) img.px(x, 41, M.creme[1]);
  for (let x = 12; x <= 20; x += 2) img.px(x, 38, M.creme[2]);
  // xale verde com bolinhas e franja dourada
  shape(img, [[7, 25 + b], [24.5, 25 + b], [26, 33 + b], [21, 35 + b], [16, 33 + b], [11, 35 + b], [6, 33 + b]], M.xale, {
    pat: (x, y, k) => ((x + y * 2) % 5 === 0 && (y % 2 === 0) ? 3 : k),
  });
  for (let x = 6; x <= 25; x++) {
    const yb = x < 11 ? 33 + (x - 6) * 0.4 : x < 16 ? 35 - (x - 11) * 0.4 : x < 21 ? 33 + (x - 16) * 0.4 : 35 - (x - 21) * 0.4;
    if (x % 2 === 0) { img.px(x, Math.round(yb) + 1 + b, M.ouro[2]); img.px(x, Math.round(yb) + 2 + b, M.ouro[1]); }
  }
  // braço esquerdo sob o xale, mão à mostra
  blob(img, 8.5, 34 + b, 1.8, 1.8, M.pele);
  // braço direito levantando o ramo benzido
  arm(img, 23, 27 + b, 25.5, 26 + b, M.xale, M.pele, { full: true });
  limb(img, 25.5, 26 + b, 27.5, 19 + b, 1, ramp(0x5a7a2a));
  const folhas = [[27, 18], [28, 19], [26, 19], [28, 17], [26, 21], [29, 21], [27, 16]];
  for (const [x, y] of folhas) { img.px(x, y + b, M.folhaBrilho[3]); em.px(x, y + b, 0xa8ff80); }
  const faiscas = i === 0 ? [[30, 15], [24, 17], [29, 23]] : [[25, 14], [30, 18], [24, 22]];
  for (const [x, y] of faiscas) em.px(x, y + b, 0xd8ffb0);
  // cabeça
  blob(img, 16, 18 + b, 8.2, 8, M.pele, { bias: 0.1 });
  // cabelo grisalho fofo e coque
  ellipseIf(img, 16, 14 + b, 9.4, 6.5, (x, y, nx, ny) => (y <= 15 + b || Math.abs(nx) > 0.78 ? M.grisalho[idx(4, 0.9 - 0.3 * (nx + 1) - 0.3 * (ny + 1) + ((x + y) % 3 === 0 ? -0.2 : 0), x, y, 0.5)] : null));
  blob(img, 16, 7 + b, 4, 3.4, M.grisalho, { pat: (x, y, k) => k - ((x - y) % 3 === 0 ? 1 : 0) });
  img.px(18, 5 + b, ramp(0x5a7a2a)[2]); img.px(19, 4 + b, ramp(0x5a7a2a)[3]);
  // óculos redondos
  const aro = 0x3a2418;
  for (const cx of [11, 18]) {
    for (const [dx, dy] of [[1, 0], [2, 0], [0, 1], [3, 1], [0, 2], [3, 2], [1, 3], [2, 3]]) img.px(cx + dx, 16 + dy + b, aro);
    img.px(cx + 1, 17 + b, 0xf0faff); img.px(cx + 2, 17 + b, 0xb8d8ec); img.px(cx + 1, 18 + b, 0x2a1a20); img.px(cx + 2, 18 + b, 0x4a3a40);
  }
  img.px(15, 17 + b, aro); img.px(16, 17 + b, aro);
  img.px(10, 22 + b, 0xf09a88); img.px(21, 22 + b, 0xe08a78);
  img.px(15, 23 + b, 0x9a4a40); img.px(16, 23 + b, 0x9a4a40); img.px(14, 22 + b, 0x9a4a40); img.px(17, 22 + b, 0x9a4a40);
  img.px(15, 21 + b, M.pele[1]);
}

// ================= PM DO CONSÓRCIO =================
const CASSETETE = ramp(0x26262e);
function baton(img, em, hx, hy, tx, ty) {
  limb(img, hx, hy, tx, ty, 1.6, CASSETETE);
  for (const [x, y] of [[tx, ty], [tx + Math.sign(tx - hx) * 0.6, ty - 1]]) {
    img.px(Math.round(x), Math.round(y), 0xe8ffff); em.px(Math.round(x), Math.round(y), 0xd8ffff);
  }
  em.px(Math.round(tx), Math.round(ty) + 1, 0x80f0ff);
}
function capFront(img, b, side = false) {
  blob(img, side ? 15.5 : 16, 11 + b, 9, 6, M.bone, { bias: 0.1 });
  if (!side) {
    img.ellipse(16, 14 + b, 9, 2, (x, y, nx, ny) => M.bone[ny < 0 ? 1 : 0]);
    for (const [x, y, c] of [[15, 8, 3], [16, 8, 3], [14, 9, 2], [17, 9, 1], [15, 9, 2], [16, 9, 1], [15, 10, 1], [16, 10, 0]]) img.px(x, y + b, M.ouro[c]);
  } else {
    img.ellipse(23, 14 + b, 4.5, 1.6, (x, y, nx, ny) => M.bone[ny < 0 ? 1 : 0]);
    img.px(18, 9 + b, M.ouro[3]); img.px(19, 9 + b, M.ouro[2]); img.px(18, 10 + b, M.ouro[1]);
  }
}
function pmFront(img, p, em) {
  const b = p.bob;
  box(img, 11, 36 + b, 20, 38 + b, M.colete);
  legFront(img, 10, 14, 37 + b, 0, M.colete, M.bone, { toeOut: -1 });
  legFront(img, 17, 21, 37 + b, 0, M.colete, M.bone, { toeOut: 1 });
  box(img, 10, 39 + b, 11, 41 + b, M.camisaCinza, { bias: -0.2 }); box(img, 20, 39 + b, 21, 41 + b, M.camisaCinza, { bias: -0.3 });
  // camisa cinza e colete preto com faixa amarela
  shape(img, [[8.5, 26 + b], [23.5, 26 + b], [22.5, 36 + b], [9.5, 36 + b]], M.camisaCinza);
  shape(img, [[10, 26 + b], [22, 26 + b], [21.5, 36 + b], [10.5, 36 + b]], M.colete, { k: 0.8 });
  box(img, 10, 32 + b, 21, 33 + b, M.faixaAmarela, { k: 0.6 });
  box(img, 15, 26 + b, 16, 28 + b, M.camisaCinza, { bias: 0.1 });
  img.px(12, 28 + b, M.ouro[3]); img.px(13, 28 + b, M.ouro[1]);
  box(img, 18, 29 + b, 20, 30 + b, M.colete, { bias: 0.25 });
  box(img, 10, 35 + b, 21, 36 + b, ramp(0x202028)); img.px(15, 35 + b, 0xc8ccd8); img.px(16, 35 + b, 0x9aa0ac);
  arm(img, 9.5, 27.5 + b, 7.5, 34.5 + b, M.camisaCinza, M.peleMorena);
  arm(img, 22.5, 27.5 + b, 24.5, 34.5 + b, M.camisaCinza, M.peleMorena, { bias: -0.1 });
  baton(img, em, 7.5, 35 + b, 4.5, 29 + b);
  baton(img, em, 24.5, 35 + b, 27.5, 29 + b);
  blob(img, 7.5, 18.5 + b, 1.6, 2, M.peleMorena); blob(img, 24.5, 18.5 + b, 1.6, 2, M.peleMorena);
  blob(img, 16, 18 + b, 8.4, 8, M.peleMorena, { bias: 0.1 });
  box(img, 8, 13 + b, 9, 18 + b, M.cabelo); box(img, 22, 13 + b, 23, 18 + b, M.cabelo, { bias: -0.2 });
  for (let x = 9; x <= 22; x++) img.px(x, 15 + b, M.peleMorena[1]);
  for (const [x, y] of [[10, 16], [11, 16], [12, 16], [19, 16], [20, 16], [21, 16]]) img.px(x, y + b, M.cabelo[0]);
  eye(img, 11, 17 + b, 0x5a3418); eye(img, 19, 17 + b, 0x5a3418);
  img.px(15, 21 + b, M.peleMorena[1]);
  img.px(14, 23 + b, 0x6a3028); img.px(15, 23 + b, 0x6a3028); img.px(16, 23 + b, 0x6a3028); img.px(17, 23 + b, 0x6a3028);
  capFront(img, b);
}
function pmBack(img, p, em) {
  const b = p.bob;
  box(img, 11, 36 + b, 20, 38 + b, M.colete);
  legFront(img, 10, 14, 37 + b, 0, M.colete, M.bone, { toeOut: -1 });
  legFront(img, 17, 21, 37 + b, 0, M.colete, M.bone, { toeOut: 1 });
  shape(img, [[8.5, 26 + b], [23.5, 26 + b], [22.5, 36 + b], [9.5, 36 + b]], M.colete, { k: 0.8 });
  // QR code nas costas
  box(img, 12, 27 + b, 19, 33 + b, M.creme, { bias: 0.5 });
  for (let y = 0; y < 6; y++) for (let x = 0; x < 7; x++) if (hash(x, y, 42) > 0.5 || (x < 2 && y < 2) || (x > 4 && y < 2) || (x < 2 && y > 3)) img.px(13 + x, 27 + y + b, 0x1a1a22);
  box(img, 9, 34 + b, 22, 35 + b, M.faixaAmarela, { k: 0.6 });
  arm(img, 9.5, 27.5 + b, 7.5, 34.5 + b, M.camisaCinza, M.peleMorena);
  arm(img, 22.5, 27.5 + b, 24.5, 34.5 + b, M.camisaCinza, M.peleMorena, { bias: -0.1 });
  baton(img, em, 7.5, 35 + b, 4.5, 29 + b);
  baton(img, em, 24.5, 35 + b, 27.5, 29 + b);
  blob(img, 16, 18 + b, 8.4, 8, M.cabelo, { pat: (x, y, k) => k - ((x + y) % 3 === 0 ? 1 : 0) });
  box(img, 13, 24 + b, 18, 25 + b, M.peleMorena, { bias: -0.15 });
  blob(img, 7.5, 18.5 + b, 1.5, 2, M.peleMorena, { bias: -0.1 }); blob(img, 24.5, 18.5 + b, 1.5, 2, M.peleMorena, { bias: -0.2 });
  blob(img, 16, 11 + b, 9, 6, M.bone, { bias: 0.1 });
  box(img, 14, 15 + b, 17, 16 + b, M.bone, { bias: -0.2 }); img.px(15, 15 + b, 0x9aa0ac);
}
function pmSide(img, p, em) {
  const b = p.bob;
  legSide(img, 15, 37 + b, 14, 0, M.colete, M.bone, -0.25);
  shape(img, [[11, 26 + b], [20.5, 26 + b], [20.5, 36 + b], [11.5, 36 + b]], M.colete);
  box(img, 11, 32 + b, 20, 33 + b, M.faixaAmarela, { k: 0.6 });
  box(img, 11, 35 + b, 20, 36 + b, ramp(0x202028));
  legSide(img, 16, 37 + b, 17, 0, M.colete, M.bone, 0);
  arm(img, 16, 28 + b, 18.5, 34.5 + b, M.camisaCinza, M.peleMorena);
  baton(img, em, 18.5, 35 + b, 23.5, 30 + b);
  blob(img, 16, 18 + b, 8.2, 8, M.peleMorena, { bias: 0.1 });
  shape(img, [[8, 13 + b], [13, 13 + b], [13, 21 + b], [9, 22 + b]], M.cabelo);
  blob(img, 13, 18.5 + b, 1.6, 2, M.peleMorena); img.px(13, 19 + b, M.peleMorena[0]);
  for (const [x, y] of [[19, 16], [20, 16], [21, 16]]) img.px(x, y + b, M.cabelo[0]);
  eye(img, 20, 17 + b, 0x5a3418);
  img.px(24, 19 + b, M.peleMorena[2]); img.px(24, 20 + b, M.peleMorena[1]);
  img.px(21, 23 + b, 0x6a3028); img.px(22, 23 + b, 0x6a3028);
  capFront(img, b, true);
}

// ================= DRONES =================
function drone(img, em, i, elite) {
  const S = elite ? 32 : 24;
  const cx = S / 2, bob = [0, -1, 0, 1][i];
  const cy = (elite ? 15 : 11) + bob, r = elite ? 9.5 : 6.6;
  const rot = [5, 3, 1, 3][i];
  // braços e hélices
  const arms = elite ? [[-1, -1], [1, -1]] : [[-1, -1], [1, -1]];
  for (const [sx] of arms) {
    const ax = cx + sx * (r + (elite ? 4 : 3)), ay = cy - (elite ? 6 : 4);
    limb(img, cx + sx * r * 0.6, cy - r * 0.4, ax, ay, elite ? 2 : 1.6, M.grafite);
    box(img, Math.round(ax) - 1, Math.round(ay) - 2, Math.round(ax), Math.round(ay) - 1, M.grafite, { bias: 0.1 });
    for (let k = -rot; k <= rot; k++) img.px(Math.round(ax) + k, Math.round(ay) - 3, k === 0 ? 0x30303a : 0xb8c0cc);
  }
  // corpo esférico
  blob(img, cx, cy, r, r * 0.92, M.grafite, { bias: 0.05 });
  // faixa do equador
  for (let x = Math.ceil(cx - r); x < cx + r; x++) {
    img.px(x, Math.round(cy + 1), M.grafite[0]);
    if (elite && x % 2 === 0) img.px(x, Math.round(cy + 2), M.magenta[2]);
  }
  if (elite) {
    // barbatanas magenta e luzes laranja
    for (const sx of [-1, 1]) {
      shape(img, [[cx + sx * 3, cy - r + 1], [cx + sx * 6, cy - r - 3], [cx + sx * 7, cy - r + 3]], M.magenta);
      const lx = Math.round(cx + sx * (r - 1.5)), ly = Math.round(cy - 1);
      img.px(lx, ly, M.laranja[3]); em.px(lx, ly, 0xffa040);
      img.px(lx, ly + 1, M.laranja[2]); em.px(lx, ly + 1, 0xff8020);
    }
    // garras
    for (const sx of [-1, 1]) limb(img, cx + sx * 3, cy + r - 2, cx + sx * 5, cy + r + 3, 1.6, M.grafite, { bias: -0.2 });
  }
  // olho vermelho
  const er = elite ? 3 : 2.2;
  img.ellipse(cx, cy + 1, er + 1, er + 0.6, 0x1a1a22);
  img.ellipse(cx, cy + 1, er, er - 0.3, (x, y, nx, ny) => (nx * nx + ny * ny < 0.25 ? 0xffe0d0 : 0xff2a2a));
  em.ellipse(cx, cy + 1, er, er - 0.3, (x, y, nx, ny) => (nx * nx + ny * ny < 0.25 ? 0xffe0d0 : 0xff3030));
  // antena com luz piscando
  img.px(cx, Math.round(cy - r - 1), M.grafite[1]); img.px(cx, Math.round(cy - r - 2), M.grafite[2]);
  const luz = i % 2 === 0 ? 0x40f0ff : 0x208890;
  img.px(cx, Math.round(cy - r - 3), luz); if (i % 2 === 0) em.px(cx, Math.round(cy - r - 3), luz);
  // propulsor
  const ty = Math.round(cy + r);
  img.px(cx - 1, ty, 0x40e0f0); img.px(cx, ty, 0x80f8ff);
  em.px(cx - 1, ty, 0x40e0f0); em.px(cx, ty, 0x80f8ff);
  if (i % 2 === 0) em.px(cx, ty + 1, 0x40c0e0);
}

// ---------- montagem ----------
function make(fn, w = W, h = H) {
  const img = new Img(w, h);
  const em = new Img(w, h);
  fn(img, em);
  outline(img);
  let lit = false;
  for (let k = 3; k < em.d.length; k += 4) if (em.d[k]) { lit = true; break; }
  return { img, emissive: lit ? em : null };
}
const DIRS = { baixo: 0, cima: 1, lado: 2 };

function humanoid(name, draws, anims) {
  const frames = [];
  for (const [anim, n] of anims)
    for (const dir of Object.keys(DIRS)) {
      if (!draws[dir]) continue;
      for (let i = 0; i < n; i++) {
        const pose = anim === 'andar' ? walkPose(i) : anim === 'ataque' ? { ...idlePose(0), bob: i === 1 ? 1 : 0 } : idlePose(i);
        const atk = anim === 'ataque' ? i : undefined;
        const f = make((img, em) => draws[dir](img, pose, atk, em, i));
        frames.push({ name: `${anim}_${dir}_${i}`, ...f });
      }
    }
  return frames;
}

const peao = humanoid('peao', { baixo: peaoFront, cima: peaoBack, lado: peaoSide }, [['parado', 2], ['andar', 6], ['ataque', 3]]);
const idol = humanoid('idol', { baixo: idolFront, cima: idolBack, lado: idolSide }, [['parado', 2]]);
const benze = humanoid('benzedeira', { baixo: (img, p, a, em, i) => benzeFront(img, p, em, i) }, [['parado', 2]]);
const pm = humanoid('pm', {
  baixo: (img, p, a, em) => pmFront(img, p, em),
  cima: (img, p, a, em) => pmBack(img, p, em),
  lado: (img, p, a, em) => pmSide(img, p, em),
}, [['parado', 2]]);
const drones = [0, 1, 2, 3].map((i) => ({ name: `voar_${i}`, ...make((img, em) => drone(img, em, i, false), 24, 24) }));
const elites = [0, 1, 2, 3].map((i) => ({ name: `voar_${i}`, ...make((img, em) => drone(img, em, i, true), 32, 32) }));

saveAtlas(OUT + 'peao', peao, { cols: 11 });
saveAtlas(OUT + 'idol', idol, { cols: 6 });
saveAtlas(OUT + 'benzedeira', benze, { cols: 2, emissive: true });
saveAtlas(OUT + 'pm', pm, { cols: 6, emissive: true });
saveAtlas(OUT + 'drone', drones, { cols: 4, emissive: true });
saveAtlas(OUT + 'drone_elite', elites, { cols: 4, emissive: true });

savePng(preview([peao, idol, benze, pm, drones, elites], 4, 12), 'tools/art/saida/preview-personagens.png');
console.log('ok', { peao: peao.length, idol: idol.length, benzedeira: benze.length, pm: pm.length, drone: drones.length, drone_elite: elites.length });
// mantém mix importado para ajustes finos
void mix;
