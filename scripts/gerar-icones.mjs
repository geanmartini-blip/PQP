// Gera os ícones PNG do app (PWA e iPhone) em pixel art, sem pacote: o desenho é uma grade de 32x32
// "pixels da arte" e cada um vira um bloco inteiro no PNG. O PNG sai à mão (zlib do Node + CRC32).
//
// A cena: a ponte partida no meio, sobre o Rio Claro, com um morador de cada margem apontando para o
// outro (cada lado culpa o outro). Esquerda em verde, terra e madeira; Direita em neon sobre concreto;
// "PQP" em cor de chope no céu.
//
// Uso:  node scripts/gerar-icones.mjs   (escreve em packages/client/public/icons)
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const G = 32;
const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'packages', 'client', 'public', 'icons');

// ---------------------------------------------------------------------------
// paleta
const C = {
  ink: '#140c16',
  sky0: '#120a22',
  sky1: '#1c1034',
  sky2: '#2a1846',
  sky3: '#44204e',
  sky4: '#6a2c50',
  star: '#fff6e0',
  starDim: '#8a80b0',
  moon: '#f0e8c0',
  moonShade: '#b8a880',
  // Esquerda
  leaf0: '#183018',
  leaf1: '#2a5224',
  leaf2: '#4a8a3a',
  trunk: '#5a3a20',
  grass: '#5a9a3a',
  grassDark: '#3a6a2a',
  earth: '#5a3a20',
  earthDark: '#3a2414',
  // Direita
  tower0: '#1c1c2a',
  tower1: '#2a2a3c',
  tower2: '#3a3a50',
  cyan: '#40e8ff',
  pink: '#ff40c8',
  red: '#ff4040',
  concrete: '#5a5a6a',
  concreteDark: '#3a3a48',
  concreteLight: '#7a7a8a',
  // rio
  water0: '#14304e',
  water1: '#1e4a6a',
  water2: '#3a7aa0',
  water3: '#8ad0f0',
  sludge: '#6a7a30',
  // ponte (chopindita)
  amber0: '#8a5a20',
  amber1: '#c88a30',
  amber2: '#e0a030',
  amber3: '#f8d070',
  stone: '#6a5a50',
  stoneDark: '#4a3a34',
  // gente
  skinA: '#e8b088',
  skinB: '#a0683c',
  hairA: '#4a2a14',
  hairB: '#ff40c8',
  shirtA: '#4a8a3a',
  shirtB: '#40c8f0',
  pants: '#2a2030',
  // letreiro
  title0: '#ffd060',
  title1: '#fff0b0',
};

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ---------------------------------------------------------------------------
// desenho na grade
const grid = Array.from({ length: G }, () => Array(G).fill(C.sky0));
const px = (x, y, c) => {
  if (x >= 0 && y >= 0 && x < G && y < G) grid[y][x] = c;
};
const rect = (x0, y0, x1, y1, c) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(x, y, c);
};
/** linha de texto: '#' pinta com c, '.' deixa */
const sprite = (x0, y0, rows, map) => {
  rows.forEach((row, dy) => {
    [...row].forEach((ch, dx) => {
      const c = map[ch];
      if (c) px(x0 + dx, y0 + dy, c);
    });
  });
};

// céu em faixas, com a passagem pontilhada (dither) entre uma e outra
const bands = [
  [0, C.sky0],
  [5, C.sky1],
  [10, C.sky2],
  [14, C.sky3],
  [17, C.sky4],
];
/** Cor do céu em (x, y); vale também fora da grade (a margem dos ícones maiores). */
function skyAt(x, y) {
  if (y < 0) return C.sky0;
  let i = 0;
  while (i + 1 < bands.length && y >= bands[i + 1][0]) i++;
  // última linha da faixa: xadrez com a próxima
  if (i + 1 < bands.length && y === bands[i + 1][0] - 1 && (((x + y) % 2) + 2) % 2 === 0) return bands[i + 1][1];
  return bands[i][1];
}
for (let y = 0; y < 21; y++) for (let x = 0; x < G; x++) px(x, y, skyAt(x, y));

// estrelas
for (const [x, y] of [[2, 10], [13, 10], [18, 11], [30, 2], [24, 9], [1, 1], [16, 0]]) px(x, y, C.starDim);
for (const [x, y] of [[8, 1], [26, 1], [21, 10], [6, 11]]) px(x, y, C.star);

// lua crescente (Esquerda, mística)
sprite(1, 2, ['.###.', '###..', '##...', '###..', '.###.'], { '#': C.moon });
px(1, 4, C.moonShade);
px(2, 6, C.moonShade);

// Direita: torres de concreto com janelas de neon e antena
rect(21, 13, 24, 20, C.tower1);
rect(25, 8, 29, 20, C.tower0);
rect(30, 11, 31, 20, C.tower1);
rect(25, 8, 25, 20, C.tower2);
rect(21, 13, 21, 20, C.tower2);
px(27, 6, C.tower2);
px(27, 7, C.tower2);
px(27, 5, C.red);
for (const [x, y] of [[22, 15], [23, 17], [22, 19]]) px(x, y, C.cyan);
for (const [x, y] of [[26, 10], [28, 10], [27, 12], [26, 14], [28, 16], [27, 18]]) px(x, y, C.pink);
for (const [x, y] of [[30, 13], [31, 15], [30, 17]]) px(x, y, C.cyan);
// letreiro de neon na torre grande
rect(25, 9, 29, 9, C.tower0);
px(26, 9, C.cyan);
px(27, 9, C.cyan);
px(28, 9, C.cyan);

// Esquerda: mata (copas redondas) e um totem
sprite(0, 12, ['..####..', '.######.', '########', '########', '########'], { '#': C.leaf1 });
sprite(0, 12, ['..##....', '.##.....', '##......'], { '#': C.leaf2 });
sprite(0, 15, ['......##', '.....###'], { '#': C.leaf0 });
sprite(5, 10, ['.###.', '#####', '#####', '#####'], { '#': C.leaf0 });
sprite(5, 10, ['.##..', '##...'], { '#': C.leaf1 });
// moitas até o chão (sem buraco de céu atrás da mata)
sprite(0, 17, ['#########', '##########', '###########', '###########'], { '#': C.leaf0 });
sprite(0, 17, ['.##...##.', '##..#.###', '..##...##'], { '#': C.leaf1 });
for (const [x, y] of [[2, 18], [7, 19], [4, 20]]) px(x, y, C.leaf2);
// totem
rect(9, 12, 10, 20, C.trunk);
px(9, 13, C.amber2);
px(10, 13, C.amber2);
px(9, 14, C.ink);
px(10, 14, C.ink);
px(9, 16, C.grass);
px(10, 16, C.grass);
px(9, 17, C.ink);
px(10, 17, C.ink);
px(8, 12, C.amber1);
px(11, 12, C.amber1);

// chão: margens e o rio no meio
const mod = (a, n) => ((a % n) + n) % n;
/** Cor do chão em (x, y), y >= 21; vale também fora da grade (o rio continua alargando). */
function groundAt(x, y) {
  const t = y - 21;
  const l = 11 - Math.floor(t / 4); // borda do rio na margem esquerda
  const r = 20 + Math.floor(t / 4); // borda do rio na margem direita
  // beira do rio: barranco e meio-fio
  if (x === l) return y === 21 ? C.grass : C.earthDark;
  if (x === r) return C.concreteDark;
  if (x < l) return y === 21 ? C.grass : y === 22 ? (mod(x, 3) === 0 ? C.grass : C.grassDark) : mod(x + y, 5) === 0 ? C.earthDark : C.earth;
  // calçada em placas de concreto (rejunte a cada 4)
  if (x > r) return y === 21 ? C.concreteLight : mod(x, 4) === 1 || mod(y - 21, 4) === 0 ? C.concreteDark : C.concrete;
  return y < 23 ? C.water1 : C.water0;
}
for (let y = 21; y < G; y++) for (let x = 0; x < G; x++) px(x, y, groundAt(x, y));

/** Fora da grade (margem dos ícones maiores): só o fundo, sem os detalhes da borda. */
function outsideAt(x, y) {
  if (y >= 21) return groundAt(x, y);
  // a mata continua à esquerda e as torres à direita
  if (x < 0 && y >= 12) return y >= 17 ? C.leaf0 : C.leaf1;
  if (x >= G && y >= 11) return mod(y, 3) === 0 && mod(x, 2) === 0 ? C.cyan : C.tower1;
  return skyAt(x, y);
}
// Esquerda: pedras, raízes e um tufo de capim; Direita: bueiro e um boleto voando
for (const [x, y, c] of [
  [2, 25, C.stone], [3, 25, C.stoneDark], [8, 28, C.stone], [1, 29, C.stoneDark], [4, 30, C.stone], [5, 30, C.stoneDark],
  [3, 23, C.earthDark], [4, 24, C.earthDark], [9, 24, C.earthDark],
  [1, 20, C.grass], [5, 20, C.grass], [10, 20, C.grass],
  [27, 27, C.tower0], [28, 27, C.tower0], [27, 28, C.tower0], [28, 28, C.tower0],
  [24, 25, C.star], [25, 25, C.starDim],
]) px(x, y, c);
// faixa de neon no cais da Direita
for (let x = 22; x < G; x += 2) px(x, 22, C.pink);
// ondas e brilho
for (const [x, y] of [[13, 24], [14, 24], [17, 26], [18, 26], [12, 28], [13, 28], [16, 30], [17, 30], [19, 29]]) px(x, y, C.water2);
for (const [x, y] of [[14, 23], [18, 27], [13, 29]]) px(x, y, C.water3);
// a Direita polui o rio
for (const [x, y] of [[20, 24], [21, 27], [20, 28], [22, 30], [21, 31]]) px(x, y, C.sludge);

// a ponte de chopindita, partida no meio
const deckY = 18;
for (const [x0, x1] of [[3, 14], [17, 28]]) {
  rect(x0, deckY, x1, deckY, C.amber3);
  rect(x0, deckY + 1, x1, deckY + 1, C.amber2);
  rect(x0, deckY + 2, x1, deckY + 2, C.amber0);
  // corrimão: postes a cada 2
  for (let x = x0; x <= x1; x += 2) px(x, deckY - 1, C.amber1);
}
// pontas quebradas (dentes) e os cacos caindo no rio
px(14, deckY + 2, C.sky4);
px(13, deckY + 2, C.amber0);
px(15, deckY, C.amber2);
px(16, deckY + 1, C.amber1);
px(17, deckY + 2, C.sky4);
px(15, 21, C.amber1);
px(16, 23, C.amber0);
px(15, 25, C.water3);
// pilares e arcos
for (const x of [6, 25]) {
  rect(x, deckY + 3, x + 1, 24, C.stone);
  px(x, deckY + 3, C.stoneDark);
  px(x + 1, 24, C.stoneDark);
}
for (const [x, y] of [[4, 21], [5, 21], [8, 21], [9, 21], [10, 22], [23, 21], [24, 21], [27, 21], [28, 21], [22, 22]]) px(x, y, C.amber0);
// sombra da ponte na água
for (let x = 12; x <= 19; x++) if (x !== 15 && x !== 16) px(x, 21, C.water0);

// os dois moradores na ponta de cada metade, apontando um para o outro por cima do buraco (cabeça
// grande, contorno escuro só em volta da figura)
const person = (x0, y0, rows, map) => {
  const cells = [];
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => map[ch] && cells.push([x0 + dx, y0 + dy, map[ch]])));
  const filled = new Set(cells.map(([x, y]) => `${x},${y}`));
  for (const [x, y] of cells)
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + ox},${y + oy}`;
      // o contorno não pinta em cima do piso da ponte
      if (!filled.has(k) && y + oy < deckY) px(x + ox, y + oy, C.ink);
    }
  for (const [x, y, c] of cells) px(x, y, c);
};
// Esquerda: cabelo castanho, camisa verde, virado para a direita
person(11, 12, ['hhh..', 'hse..', 'sss..', 'tttaH', 'ttt..', 'p.p..'], { h: C.hairA, s: C.skinA, e: C.ink, t: C.shirtA, a: C.shirtA, H: C.skinA, p: C.pants });
// Direita: cabelo rosa, viseira de neon, camisa ciano, virado para a esquerda
person(16, 12, ['..hhh', '..vsh', '..sss', 'Hattt', '..ttt', '..p.p'], { h: C.hairB, s: C.skinB, v: C.cyan, t: C.shirtB, a: C.shirtB, H: C.skinB, p: C.pants });

// "PQP" no céu, em cor de chope, com sombra dura
const P = ['####', '#..#', '#..#', '####', '#...', '#...'];
const Q = ['.##.', '#..#', '#..#', '#.##', '.##.', '...#'];
const letters = [P, Q, P];
let lx = 9;
for (const L of letters) {
  sprite(lx + 1, 3, L, { '#': C.ink });
  sprite(lx, 2, L, { '#': C.title0 });
  // brilho no alto de cada letra
  sprite(lx, 2, [L[0]], { '#': C.title1 });
  lx += 5;
}

// ---------------------------------------------------------------------------
// PNG
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/**
 * Imagem `size`x`size`: a arte em blocos de `scale` px, centrada; a margem continua o fundo da cena
 * (o céu sobe, o rio alarga, a mata e as torres seguem), então o ícone fica sem moldura chapada.
 */
function render(size, scale) {
  const off = Math.floor((size - G * scale) / 2);
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let Y = 0; Y < size; Y++) {
    raw[o++] = 0; // filtro: nenhum
    const gy = Math.floor((Y - off) / scale);
    for (let X = 0; X < size; X++) {
      const gx = Math.floor((X - off) / scale);
      const inside = gx >= 0 && gy >= 0 && gx < G && gy < G;
      const [r, g, b] = hex(inside ? grid[gy][gx] : outsideAt(gx, gy));
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
      raw[o++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(OUT, { recursive: true });
const files = [
  ['icon-192.png', 192, 6],
  ['icon-512.png', 512, 16],
  // maskable: a arte cabe no círculo seguro (80% do meio); a borda estendida enche o resto
  ['icon-maskable-512.png', 512, 12],
  ['apple-touch-icon-180.png', 180, 5],
  ['favicon-32.png', 32, 1],
];
for (const [name, size, scale] of files) {
  writeFileSync(join(OUT, name), render(size, scale));
  console.log(`${name}  ${size}x${size}`);
}
