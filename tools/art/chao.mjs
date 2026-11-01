// ChÃ£o da cena de teste da Ponte do Rio Claro: kit de tiles 32x32 (grama, terra, calÃ§amento de
// pedra marrom da Esquerda, lajes cinza da Direita, Ã¡gua) e o chÃ£o inteiro da cena jÃ¡ assado, com
// transiÃ§Ãµes orgÃ¢nicas, bordas do rio e marcas de combate (aviso de Ã¡rea, marcador, sombra).
// Uso: node tools/art/chao.mjs
import { R } from './lib/paleta.mjs';
import { Img, hash, vnoise, pick, mix, shift, outline, normalMap, saveSprite, saveAtlas, savePng, bayer, lightAt } from './lib/img.mjs';

const OUT = 'packages/client/public/teste-visual/';

// ---------------- mapa da cena ----------------
export const MAPA = { w: 736, h: 1600, rioX0: 320, rioX1: 448, ponteY: 800 };
const { w: W, h: H, rioX0, rioX1 } = MAPA;

// caminhos da Esquerda (calÃ§amento) e trilhas de terra: polilinhas com largura
const CALCADA = [
  { pts: [[330, 832], [280, 834], [252, 826], [248, 760], [246, 716]], larg: 20 },
  { pts: [[252, 830], [180, 836], [100, 820], [20, 840]], larg: 15 },
  { pts: [[250, 840], [244, 920], [250, 1010], [236, 1120], [250, 1240]], larg: 15 },
];
const TERRA = [
  { pts: [[246, 700], [230, 620], [250, 520], [230, 420]], larg: 9 },
  { pts: [[240, 1010], [160, 1030], [60, 1000]], larg: 9 },
];
function distSeg(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function distPath(x, y, p) {
  let d = Infinity;
  for (let i = 0; i + 1 < p.pts.length; i++) d = Math.min(d, distSeg(x, y, p.pts[i], p.pts[i + 1]));
  return d - p.larg;
}
const minPath = (x, y, list) => Math.min(...list.map((p) => distPath(x, y, p)));

// ---------------- pintores de material (coordenadas do mundo: textura contÃ­nua) ----------------
// rampas de grama misturadas pela variaÃ§Ã£o grande (sem manchas duras)
const GR = [0, 1, 2, 3, 4].map((k) => R.grama.map((c, i) => mix(c, (k < 2 ? R.musgo : R.gramaSeca)[i], [0.55, 0.25, 0, 0.25, 0.5][k])));
function grama(x, y) {
  const big = vnoise(x / 70, y / 70, 1) * 0.7 + vnoise(x / 23, y / 23, 5) * 0.3;
  const base = GR[Math.max(0, Math.min(4, Math.floor(big * 5.2 - 0.1)))];
  // tufos: cÃ©lulas pequenas, cada uma sombreada como um montinho (luz de cima Ã  esquerda)
  const v = voronoi(x + 0.5, y + 0.5, 6, 3);
  const dx = (x - v.fx) / 4, dy = (y - v.fy) / 3.5;
  let l = 0.44 - dx * 0.2 - dy * 0.34 + (hash(v.id, 0, 4) - 0.5) * 0.24 + (vnoise(x / 31, y / 31, 7) - 0.5) * 0.35;
  if (v.d2 - v.d1 < 1 && dy > 0) l -= 0.3;
  // lÃ¢mina clara de vez em quando
  if (hash(x, Math.floor(y / 2), 6) > 0.94 && dy < 0) l += 0.35;
  return pick(base, l, x, y, 0.55);
}
// touceiras e flores por cima da grama (chamado depois do chÃ£o)
function enfeitesGrama(img, ok) {
  const flores = [[0xf4f0e0, 0xe8c840], [0xd070e8, 0xf8e070], [0x8fd0ff, 0xffffff], [0xf8d040, 0xc06020]];
  for (let gy = 0; gy < H; gy += 9)
    for (let gx = 0; gx < W; gx += 9) {
      const x = gx + Math.floor(hash(gx, gy, 11) * 9), y = gy + Math.floor(hash(gx, gy, 12) * 9);
      if (!ok(x, y) || !ok(x, y - 6) || !ok(x - 3, y) || !ok(x + 3, y)) continue;
      const r = hash(gx, gy, 13);
      if (r < 0.2) {
        // touceira: 5 lÃ¢minas em leque, base escura e ponta clara
        const ramp = vnoise(x / 46, y / 46, 1) > 0.62 ? R.gramaSeca : R.grama;
        const lam = [[-3, 3], [-2, 5], [0, 6], [2, 5], [3, 3]];
        for (const [dx, hgt] of lam)
          for (let k = 0; k < hgt; k++) {
            const xx = x + Math.round((dx * k) / hgt / 1.4) + (dx > 0 ? 0 : 0);
            img.px(xx + Math.round(dx / 2), y - k, k === hgt - 1 ? ramp[3] : k < 2 ? ramp[0] : ramp[1 + (k > hgt / 2 ? 1 : 0)]);
          }
        img.px(x - 1, y + 1, ramp[0]);
        img.px(x, y + 1, ramp[0]);
        img.px(x + 1, y + 1, ramp[0]);
      } else if (r < 0.27) {
        const [p, c] = flores[Math.floor(hash(gx, gy, 14) * flores.length)];
        // flor de 5 px com caule e miolo
        img.px(x, y + 1, R.folha[1]);
        img.px(x, y + 2, R.folha[0]);
        img.px(x - 1, y, p); img.px(x + 1, y, p); img.px(x, y - 1, p); img.px(x, y + 1 - 0, p);
        img.px(x, y, c);
        img.px(x + 1, y + 1, shift(p, -0.6));
        img.px(x - 1, y + 1, shift(p, -0.6));
      } else if (r < 0.3) {
        // pedrinha
        img.px(x, y, R.pedraMarrom[2]); img.px(x + 1, y, R.pedraMarrom[1]);
        img.px(x, y + 1, R.pedraMarrom[0]); img.px(x + 1, y + 1, R.pedraMarrom[0]);
        img.px(x, y - 1, R.pedraMarrom[3]);
      }
    }
}
function terra(x, y) {
  const n = vnoise(x / 7, y / 7, 21);
  let v = 0.45 + (n - 0.5) * 0.6 + (hash(x, y, 22) - 0.5) * 0.25;
  if (hash(x, y, 23) > 0.96) return R.pedraMarrom[2];
  return pick(R.terra, v, x, y, 0.8);
}
// cÃ©lulas de Voronoi com grade embaralhada: pedras de rua
function voronoi(x, y, cell, seed) {
  const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
  let d1 = 1e9, d2 = 1e9, id = 0, fx = 0, fy = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i, gy = cy + j;
      const px = (gx + 0.15 + hash(gx, gy, seed) * 0.7) * cell;
      const py = (gy + 0.15 + hash(gx, gy, seed + 1) * 0.7) * cell;
      const d = Math.hypot(x - px, (y - py) * 1.25);
      if (d < d1) { d2 = d1; d1 = d; id = gx * 7919 + gy; fx = px; fy = py; }
      else if (d < d2) d2 = d;
    }
  return { d1, d2, id, fx, fy };
}
function calcada(x, y) {
  const v = voronoi(x + 0.5, y + 0.5, 9, 31);
  const edge = v.d2 - v.d1;
  if (edge < 1.3) return mix(R.pedraMarrom[0], 0x1c1418, 0.45); // junta escura
  const tone = hash(v.id, 1, 32);
  const base = tone < 0.33 ? R.pedraMarrom : tone < 0.66 ? R.terra : R.palha.map((c) => mix(c, R.pedraMarrom[2], 0.5));
  // bisel: claro em cima/esquerda da pedra, escuro embaixo/direita perto da junta
  const dx = (x - v.fx) / 6, dy = (y - v.fy) / 5;
  let l = 0.5 - (dx + dy) * 0.22;
  if (edge < 2.6) l += dy > 0 || dx > 0 ? -0.28 : 0.22;
  l += (hash(x, y, 33) - 0.5) * 0.18 + (tone - 0.5) * 0.2;
  return pick(base, l, x, y, 0.6);
}
function lajes(x, y) {
  // blocos em amarraÃ§Ã£o corrida, 16x11, cada fila deslocada
  // lajes grandes quase quadradas (chão, não parede): 32x26, filas deslocadas meia laje
  const bh = 26, row = Math.floor(y / bh);
  const bw = 32;
  const off = row % 2 ? 16 : 0;
  const col = Math.floor((x + off) / bw);
  const lx = (x + off) % bw, ly = y % bh;
  if (lx === 0 || ly === 0) return 0x2a2c36; // junta
  const tone = hash(col, row, 41);
  const base = tone < 0.5 ? R.ardosia : tone < 0.85 ? R.pedraCinza : R.grafite;
  let l = 0.42 + (hash(x, y, 42) - 0.5) * 0.1 + (vnoise(x / 7, y / 7, 43) - 0.5) * 0.22 + (tone - 0.5) * 0.12;
  if (ly === 1 || lx === 1) l += 0.3;
  if (ly === bh - 1 || lx === bw - 1) l -= 0.25;
  // trinca ocasional
  if (tone > 0.93 && Math.abs(lx - ly * 1.2 - 3) < 0.7) return base[0];
  // mancha de Ã³leo / sujeira
  if (vnoise(x / 13, y / 13, 44) > 0.78) l -= 0.18;
  return pick(base, l, x, y, 0.6);
}

// ---------------- chÃ£o inteiro ----------------
function regiao(x, y) {
  const n = (vnoise(x / 6, y / 6, 51) - 0.5) * 6;
  if (x >= rioX0 + 2 + n * 0.5 && x < rioX1 - 2 + n * 0.3) return 'agua';
  if (x >= rioX1) return 'piso';
  const dc = minPath(x, y, CALCADA) + n * 0.5;
  if (dc < 0) return 'calcada';
  const dt = minPath(x, y, TERRA) + n;
  if (dt < 0) return 'terra';
  return 'grama';
}

function chao() {
  const img = new Img(W, H);
  const reg = new Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const r = regiao(x, y);
      reg[y * W + x] = r;
      if (r === 'agua') continue;
      img.px(x, y, r === 'grama' ? grama(x, y) : r === 'terra' ? terra(x, y) : r === 'calcada' ? calcada(x, y) : lajes(x, y));
    }
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 'grama' : reg[y * W + x]);
  // sombra da grama sobre caminho (borda de baixo/direita do gramado) e borda clara em cima
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const r = at(x, y);
      if (r === 'calcada' || r === 'terra') {
        if (at(x, y - 1) === 'grama' || at(x - 1, y) === 'grama') img.px(x, y, shift(img.get(x, y), -0.55));
        else if (at(x, y - 2) === 'grama') img.px(x, y, shift(img.get(x, y), -0.3));
      }
      if (r === 'grama' && (at(x, y + 1) === 'calcada' || at(x, y + 1) === 'terra') && hash(x, y, 61) > 0.35) img.px(x, y + 1, R.grama[hash(x, y, 62) > 0.5 ? 2 : 1]);
    }
  enfeitesGrama(img, (x, y) => at(x, y) === 'grama');

  // borda da Esquerda: barranco de pedra marrom com musgo caindo na Ã¡gua
  for (let y = 0; y < H; y++) {
    const e = Math.round(rioX0 + 2 + (vnoise(0, y / 6, 51) - 0.5) * 3);
    const lip = 10 + Math.round(vnoise(3, y / 11, 71) * 8);
    // sombra do barranco na Ã¡gua
    for (let k = lip; k < lip + 7; k++) if (!img.alpha(e + k, y)) img.px(e + k, y, 0x06101c, k < lip + 3 ? 120 : 60);
    for (let k = -2; k < lip; k++) {
      const x = e + k;
      if (k < 0) { img.px(x, y, R.musgo[k === -1 ? 1 : 2]); continue; }
      // pedras arredondadas descendo
      const v = voronoi(x, y, 7, 72);
      const edge = v.d2 - v.d1;
      const l = 0.6 - (k / lip) * 0.45 - (y - v.fy) / 14 + (hash(x, y, 73) - 0.5) * 0.15;
      img.px(x, y, edge < 1.2 ? 0x1e1820 : pick(R.pedraMarrom, l, x, y, 0.6));
      if (k < 3 && vnoise(x / 4, y / 4, 74) > 0.55) img.px(x, y, R.musgo[k === 0 ? 3 : 2]);
    }
    // musgo pendurado
    if (hash(0, y, 75) > 0.85) for (let k = 0; k < 4; k++) img.px(e + 1 + Math.floor(hash(1, y, 76) * 3), y + k, R.musgo[2 - Math.min(2, k)]);
  }
  // borda da Direita: cais de blocos de pedra cinza com face vertical e linha de musgo/limo
  for (let y = 0; y < H; y++) {
    const e = rioX1;
    for (let k = 0; k < 16; k++) {
      const x = e - 1 - k;
      const row = Math.floor(y / 12);
      const ly = y % 12;
      const lx = (y + 400) % 12;
      let c;
      if (k === 0) c = R.pedraCinza[3];
      else if (k === 1) c = R.pedraCinza[2];
      else if (ly === 0 || (k === 9 && row % 2 === 0) || (k === 5 && row % 2 === 1) || k === 2) c = 0x1c1e26;
      else c = pick(R.ardosia, 0.55 - k * 0.04 + (hash(x, y, 81) - 0.5) * 0.2, x, y, 0.6);
      if (k >= 12 && vnoise(x / 3, y / 5, 82) > 0.45) c = mix(c, 0x3f6a3a, 0.55); // limo na linha d'Ã¡gua
      img.px(x, y, c);
      void lx;
    }
    img.px(e - 17, y, 0x101820);
    for (let k = 18; k < 26; k++) if (!img.alpha(e - k, y)) img.px(e - k, y, 0x06101c, k < 21 ? 130 : 70);
  }
  // pedras dentro da Ã¡gua perto das margens
  const pedrasRio = [[rioX0 + 14, 300], [rioX0 + 10, 1220], [rioX1 - 16, 470], [rioX1 - 12, 1080], [rioX0 + 18, 1420],
    // pedras ao pé da cascata (y≈560) e espuma
    [rioX0 + 12, 548], [rioX0 + 22, 562], [rioX1 - 14, 550], [rioX1 - 24, 566], [rioX0 + 8, 575], [rioX1 - 10, 578]];
  for (let y = 560; y < 600; y++)
    for (let x = rioX0 + 16; x < rioX1 - 16; x++) {
      const f = vnoise(x / 4, y / 3, 95) - (y - 560) / 50;
      if (f > 0.35 && !img.alpha(x, y)) img.px(x, y, f > 0.55 ? 0xf0fbff : 0xbfe8f6, f > 0.55 ? 230 : 150);
    }
  for (const [px, py] of pedrasRio) {
    const s = new Img(16, 12);
    s.ellipse(8, 6, 6, 4.5, (x, y, nx, ny) => pick(R.pedraMarrom, lightAt(nx, ny) * 0.9 + 0.05, x, y, 0.5));
    for (let x = 2; x < 14; x++) if (hash(x, 1, 91) > 0.4) s.px(x, 2 + Math.floor(hash(x, 2, 92) * 2), R.musgo[2]);
    outline(s);
    img.blit(s, px - 8, py - 6);
  }
  return img;
}

// Ã¡gua: textura de 64x64 que repete (TileSprite) com correnteza descendo
// ruÃ­do de valor que repete com perÃ­odo p (para a textura da Ã¡gua emendar)
function vnoiseP(x, y, px, py, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const s = (t) => t * t * (3 - 2 * t);
  const h = (i, j) => hash(((i % px) + px) % px, ((j % py) + py) % py, seed);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
}
function agua(frame = 0) {
  const s = 128;
  const img = new Img(s, s);
  const base = [0x10405e, 0x1a5f86, 0x2a7fa8, 0x47a8cc, 0x7cd0e8];
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      const yy = y - frame * 8;
      // correnteza: ruÃ­do esticado na vertical (descendo) + ondinhas
      const n1 = vnoiseP(x / 8, yy / 16, 16, 8, 101);
      const n2 = vnoiseP(x / 4, yy / 8, 32, 16, 102);
      const w = Math.sin((x / s) * Math.PI * 8 + n1 * 5) * 0.5 + 0.5;
      let v = 0.32 + (n1 - 0.5) * 0.35 + (n2 - 0.5) * 0.2 + w * 0.12;
      let c = pick(base, v, x, y, 0.7);
      // riscos de brilho curtos, puxados pela correnteza
      img.px(x, y, c);
    }
  // reflexos: tracinhos curtos em células sorteadas (sem o desenho repetido do ruído)
  for (let cy = 0; cy < s / 8; cy++)
    for (let cx = 0; cx < s / 8; cx++) {
      if (hash(cx, cy, 104) > 0.32) continue;
      const x0 = cx * 8 + Math.floor(hash(cx, cy, 105) * 5), y0 = cy * 8 + Math.floor(hash(cx, cy, 106) * 7);
      const len = 2 + Math.floor(hash(cx, cy, 107) * 3);
      for (let k = 0; k < len; k++) img.px((x0 + k) % s, y0 % s, k === 0 || k === len - 1 ? base[3] : base[4]);
      if (hash(cx, cy, 108) > 0.6) img.px((x0 + 1) % s, (y0 + 1) % s, base[1]);
    }
  return img;
}

function marcas() {
  // aviso de Ã¡rea no chÃ£o: elipse vermelha em perspectiva com borda tracejada e preenchimento
  const av = new Img(96, 48);
  av.ellipse(48, 24, 47, 23, (x, y, nx, ny) => {
    const r = Math.hypot(nx, ny);
    if (r > 0.9) return (Math.floor(Math.atan2(ny, nx) * 8) & 1) === 0 ? 0xff4a3a : 0xc81e1e;
    if (r > 0.84) return 0x8a1010;
    return bayer(x, y) < 0.35 + r * 0.25 ? 0xe02c24 : null;
  });
  // marcador do alvo: cantos dourados em perspectiva
  const mk = new Img(40, 20);
  mk.ellipse(20, 10, 19, 9, (x, y, nx, ny) => {
    const r = Math.hypot(nx, ny);
    const ang = Math.atan2(ny, nx);
    const quad = Math.abs(Math.sin(ang * 2)) > 0.55;
    return r > 0.78 && quad ? (ny < 0 ? 0xffe070 : 0xd89a20) : null;
  });
  outline(mk);
  // sombra dos bonecos
  const sb = new Img(24, 8);
  sb.ellipse(12, 4, 11, 3.5, 0x101018);
  return { av, mk, sb };
}

// ---------------- gerar ----------------
const ch = chao();
saveSprite(OUT + 'chao', ch, { normalImg: normalMap(ch, { bevel: 1, lumK: 1.2 }) });
const aguas = [0, 1, 2, 3].map((f) => ({ name: 'agua_' + f, img: agua(f) }));
saveAtlas(OUT + 'agua', aguas, { cols: 4, normal: { bevel: 1, lumK: 1.5 } });
saveSprite(OUT + 'agua_tile', agua(0), { normal: { bevel: 1, lumK: 1.5 } });
const { av, mk, sb } = marcas();
saveSprite(OUT + 'aviso_area', av);
saveSprite(OUT + 'marcador_alvo', mk);
saveSprite(OUT + 'sombra', sb);

// kit de tiles 32x32 (vai para a etapa 2: pisos modulares)
const kit = [];
const tile = (name, f, ox = 0, oy = 0) => {
  const t = new Img(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) t.px(x, y, f(x + ox, y + oy));
  kit.push({ name, img: t });
};
for (let i = 0; i < 4; i++) tile('grama_' + i, grama, i * 32, 0);
for (let i = 0; i < 2; i++) tile('terra_' + i, terra, i * 32, 0);
for (let i = 0; i < 2; i++) tile('calcada_' + i, calcada, i * 32, 0);
for (let i = 0; i < 2; i++) tile('lajes_' + i, lajes, i * 32, 0);
saveAtlas(OUT + 'kit_chao', kit, { cols: 5, normal: { bevel: 1, lumK: 1.2 } });

// preview 2x de um pedaÃ§o do chÃ£o
const prev = new Img(W, 700);
for (let y = 0; y < 700; y++) for (let x = rioX0 - 20; x < rioX1 + 20; x++) prev.px(x, y, aguas[0].img.get(x % 128, y % 128));
prev.blit(ch, 0, 0, { sy: 500, h: 700 });
const big = new Img(W * 2, 1400);
for (let y = 0; y < 1400; y++) for (let x = 0; x < W * 2; x++) { const c = prev.get(x >> 1, y >> 1); if (c !== null) big.px(x, y, c); }
savePng(big, 'tools/art/saida/preview-chao.png');
console.log('chao ok');
