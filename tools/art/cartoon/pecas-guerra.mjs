// Peças de escassez e tensão na fronteira (servem às duas margens): sacos de areia, barricada,
// gerador, posto de controle, holofote apagado, lona, entulho, fila marcada, painel solar rachado,
// poste quebrado, baterias, gambiarra, caixotes vazios, fuligem, tábuas de janela, arame farpado
// e a panela comunitária no fogo.
import {
  TINTA, arame, blob, bolhas, cachos, cel, chapa, curva, degrade, desfoque, desgaste, elipse, f1, fio, fuligem, halo, luz, massa, mistura,
  perigo, poli, prego, rebite, recorte, ret, retRed, rnd, sombra, sombraChao, tabuasH, tabuasPregadas, tabuasV, traco, tufo,
} from './kit.mjs';
import { lona } from './pecas-esq.mjs';
import { caixote } from './pecas-dir.mjs';

const SACO = '#9a8a66', FERRUGEM = '#8a4a2a', GRAFITE = '#34363e';

function saco(x, y, w = 26, h = 13, seed = 1, cor = SACO) {
  const r = rnd(seed);
  const c = mistura(cor, r() < 0.5 ? sombra(cor, 0.15) : luz(cor, 0.08), r());
  const d = blob([[x, y + h * 0.5], [x + 2, y + 1], [x + w * 0.5, y - 1], [x + w - 2, y + 1], [x + w, y + h * 0.5], [x + w - 2, y + h - 0.5], [x + w * 0.5, y + h + 1], [x + 2, y + h - 0.5]], 0.9);
  let s = cel(d, c, { s: 3, l: 0.8, w: 1.8 });
  s += recorte(d, traco(`M${x + 4},${y + h * 0.35} h${w - 8} M${x + 5},${y + h * 0.7} h${w - 10}`, sombra(c, 0.25), 0.7, 0.6) + desgaste(d, x, y, w, h, seed, { forca: 0.8, escorrido: false }));
  s += traco(`M${x + 1.5},${y + h * 0.3} l2,2 l-2,2 M${x + w - 1.5},${y + h * 0.3} l-2,2 l2,2`, '#4a3e2c', 1);
  return s;
}
export function sacosAreia() {
  const W = 96, H = 46;
  let s = sombraChao(48, 42, 46, 5);
  [[4, 28], [28, 29], [52, 28], [72, 29.5]].forEach(([x, y], i) => { s += saco(x, y, 24, 13, 600 + i); });
  [[14, 17], [38, 16.5], [60, 17.5]].forEach(([x, y], i) => { s += saco(x, y, 24, 13, 610 + i); });
  s += saco(28, 5, 24, 13, 620) + saco(50, 6, 22, 12, 621, '#8a7a5a');
  s += tufo(4, 45, '#4e6e34', 622, 0.6);
  return { nome: 'sacos_areia', w: W, h: H, svg: s };
}
export function barricada() {
  const W = 120, H = 74;
  let s = sombraChao(60, 70, 58, 5);
  // cavaletes em X
  for (const x of [22, 98]) s += traco(`M${x - 14},70 L${x + 10},14 M${x + 14},70 L${x - 10},14`, TINTA, 7.4) + traco(`M${x - 14},70 L${x + 10},14 M${x + 14},70 L${x - 10},14`, '#5e4230', 4.6);
  // tábuas e chapa atravessadas
  s += `<g transform="rotate(-3 60 36)">${tabuasH(6, 26, 108, 9, 1, '#6e5038', 631)}</g>`;
  s += chapa(40, 34, 40, 24, '#585e66', { s: 3, l: 0.8 }) + `<ellipse cx="52" cy="44" rx="8" ry="5" fill="${FERRUGEM}" opacity="0.45"/>` + perigo(40, 50, 40, 5, { passo: 4, a: '#c8962e', borda: false });
  s += `<g transform="rotate(4 60 52)">${tabuasH(4, 48, 112, 8, 1, '#7a5a3e', 632)}</g>`;
  s += fuligem(80, 40, 16, 12, 0.5);
  s += arame([[2, 22], [22, 16], [42, 22], [60, 15], [80, 22], [98, 16], [118, 22]], 633) + arame([[4, 60], [30, 64], [60, 58], [90, 64], [116, 60]], 634);
  s += saco(2, 58, 22, 12, 635) + saco(96, 58, 22, 12, 636);
  return { nome: 'barricada', w: W, h: H, svg: s };
}
export function gerador() {
  const W = 86, H = 66;
  let s = sombraChao(43, 62, 42, 5), e = '';
  // tambor de diesel ao lado
  const td = `M60,26 Q58,44 60,60 Q71,64 82,60 Q84,44 82,26Z`;
  s += cel(td, '#7a3a2a', { s: 4, l: 1, w: 1.8 }) + traco('M60,34 Q71,37 82,34 M60,52 Q71,55 82,52', '#3a1a14', 1.6) + desgaste(td, 58, 24, 26, 40, 641);
  s += cel(elipse(71, 26, 11, 3.6), '#8a4a34', { s: 1.2, l: 0.4, w: 1.6 }) + `<circle cx="75" cy="26" r="1.6" fill="#140e10"/>`;
  s += `<path d="M64,60 q-6,3 -12,2 q8,3 14,-1Z" fill="#141014" opacity="0.7"/>`;
  // gerador
  s += cel(retRed(4, 30, 56, 30, 2), '#4e5a4a', { s: 4, l: 1, w: 2 }) + desgaste(ret(4, 30, 56, 30), 4, 30, 56, 30, 642, { forca: 1.2 });
  s += cel(retRed(2, 24, 60, 8, 1.5), '#5e6a58', { s: 1.5, l: 0.5, w: 1.8 });
  for (let i = 0; i < 6; i++) s += traco(`M${10 + i * 5},36 v14`, '#2a3228', 1.4);
  s += chapa(40, 36, 16, 14, '#3e424c', { s: 1.5, l: 0.5 }) + `<circle cx="45" cy="42" r="1.5" fill="#6a2020"/><circle cx="51" cy="42" r="1.5" fill="#2a5a2a"/>`;
  e += `<circle cx="45" cy="42" r="1.5" fill="#ff4a3a"/>` + halo(45, 42, 6, '#ff4a3a', 0.6);
  for (const x of [8, 52]) s += cel(retRed(x - 4, 58, 8, 4, 1), '#22242a', { s: 0.8, l: 0.3, w: 1.2 });
  // escapamento com fuligem e fumaça
  s += traco('M14,24 V8 h6', TINTA, 5) + traco('M14,24 V8 h6', '#4a4e56', 3) + fuligem(22, 8, 8, 6, 0.6);
  s += massa(cachos([[26, 6, 5, 4], [33, 3, 4, 3]], 643), '#6e6a6a', { s: 1.5, l: 0.5, w: 1.2, cc: '#3a3638' });
  // cabos
  s += fio(4, 46, 0, 64, 4) + fio(58, 52, 86, 62, 6, '#2a2420');
  return { nome: 'gerador', w: W, h: H, svg: s, emissivo: e };
}
export function holofote(extra = '') {
  const W = 44, H = 74;
  let s = sombraChao(22, 70, 18, 3.5);
  s += traco('M22,40 L8,70 M22,40 L36,70 M22,40 V70', TINTA, 4) + traco('M22,40 L8,70 M22,40 L36,70 M22,40 V70', '#4a4e56', 2.2);
  s += `<g transform="rotate(-12 22 26)">` + cel(retRed(8, 12, 28, 24, 4), GRAFITE, { s: 3, l: 0.8, w: 2 }) + `<ellipse cx="22" cy="24" rx="11" ry="10" fill="#2a2e36" stroke="${TINTA}" stroke-width="1.4"/>` +
    `<ellipse cx="22" cy="24" rx="8" ry="7" fill="#3a4250"/>` + traco('M17,19 l5,5 l-3,5 m3,-5 l7,-1 m-7,1 l2,6', '#9ab0c0', 0.7, 0.9) + `</g>`;
  s += traco('M22,38 l0,4', TINTA, 3) + fio(22, 40, 40, 72, 4);
  return { nome: 'holofote', w: W, h: H, svg: s + extra };
}
export function postoControle() {
  const W = 132, H = 152;
  let s = sombraChao(52, 146, 50, 7), e = '';
  // cancela (do lado direito), levantada pela metade
  s += cel(retRed(96, 100, 12, 46, 1.5), GRAFITE, { s: 2, l: 0.5, w: 1.8 });
  s += `<g transform="rotate(-10 102 104)">` + perigo(102, 101, 30, 6, { passo: 6, a: '#d8d0c0', b: '#a83a2a' }) + `</g>`;
  s += cel(elipse(102, 104, 4, 4), '#545a64', { s: 1, l: 0.4, w: 1.4 });
  // guarita: base de concreto, paredes de chapa, janela larga
  s += cel(retRed(8, 128, 88, 18, 1.5), '#62666e', { s: 3, l: 0.8, w: 2 }) + desgaste(ret(8, 128, 88, 18), 8, 128, 88, 18, 651);
  s += cel(retRed(14, 64, 76, 66, 1.5), '#545a5e', { s: 4, l: 0.8, w: 2.2 });
  for (let x = 20; x < 90; x += 8) s += traco(`M${x},66 v62`, '#3a3e44', 1.2, 0.8);
  s += desgaste(ret(14, 64, 76, 66), 14, 64, 76, 66, 652, { forca: 1.2 });
  // janela com luz fraca de lâmpada de emergência
  const [dg, url] = degrade(['#4a4a3a', '#2a2a28', '#1a1a1c']);
  s += cel(retRed(20, 74, 64, 26, 1.5), '#3e424c', { s: 2, l: 0.5, w: 2 }) + dg + `<rect x="24" y="78" width="56" height="18" fill="${url}"/>` + traco('M52,78 v18', '#2e3038', 2) + traco('M30,80 l8,6 l-2,7', '#8ab0c0', 0.7, 0.7);
  s += `<rect x="24" y="78" width="56" height="18" fill="none" stroke="${TINTA}" stroke-width="1.2"/>` + `<rect x="64" y="80" width="10" height="3" fill="#a89060"/>`;
  e += halo(69, 82, 20, '#d8a050', 0.35) + `<rect x="64" y="80" width="10" height="3" fill="#ffe0a0"/>` + `<rect x="24" y="78" width="56" height="18" fill="#c89050" opacity="0.15"/>`;
  s += tabuasPregadas(20, 104, 64, 18, 653, '#6a5440').replace(/^/, '');
  s += saco(6, 132, 24, 12, 654) + saco(28, 133, 24, 12, 655) + saco(14, 122, 22, 11, 656);
  // teto com beiral e holofote apagado em cima
  s += cel(retRed(8, 54, 88, 12, 1.5), '#40444c', { s: 3, l: 0.8, w: 2.2 }) + `<rect x="14" y="66" width="76" height="6" fill="#0a0a10" opacity="0.4"/>`;
  s += `<g transform="translate(30,-12) scale(0.9)">` + holofote().svg.replace(/<defs>.*?<\/defs><ellipse[^>]*\/>/, '') + `</g>`;
  s += fio(90, 60, 120, 40, 10) + traco('M120,40 V20', '#2a2c32', 2);
  return { nome: 'posto_controle', w: W, h: H, svg: s, emissivo: e, ax: 52 };
}
export function lonaRemendo() {
  const W = 84, H = 52;
  return { nome: 'lona_remendo', w: W, h: H, svg: lona([[8, 8], [72, 4], [78, 44], [12, 48]], '#4c5866', 661), ay: H / 2 };
}
export function entulho() {
  const W = 88, H = 46;
  const r = rnd(671);
  let s = sombraChao(44, 41, 42, 5);
  const pedacos = [];
  for (let i = 0; i < 14; i++) pedacos.push([10 + r() * 68, 22 + r() * 18, 5 + r() * 7, 3 + r() * 4, r()]);
  pedacos.sort((a, b) => a[1] - b[1]);
  s += traco('M20,30 L44,8 M44,8 l4,3', TINTA, 3.6) + traco('M20,30 L44,8 M44,8 l4,3', '#6a4e3a', 2); // vergalhão/tábua quebrada
  s += traco('M56,34 Q62,14 74,10', '#3a2a24', 1.6);
  for (const [x, y, rx, ry, k] of pedacos) {
    const c = k < 0.35 ? '#8a5040' : k < 0.7 ? '#6e6a66' : '#585450';
    s += cel(poli([[x - rx, y + ry * 0.4], [x - rx * 0.4, y - ry], [x + rx * 0.7, y - ry * 0.6], [x + rx, y + ry * 0.3], [x + rx * 0.2, y + ry]]), c, { s: 2, l: 0.6, w: 1.4 });
  }
  s += `<g transform="rotate(-18 60 30)">${tabuasH(48, 26, 30, 6, 1, '#6a4e38', 672, { pregos: false })}</g>` + fuligem(44, 30, 30, 10, 0.35);
  s += `<circle cx="30" cy="40" r="1" fill="#6e6a66"/><circle cx="70" cy="42" r="1.2" fill="#6e6a66"/><circle cx="16" cy="38" r="0.8" fill="#8a5040"/>`;
  return { nome: 'entulho', w: W, h: H, svg: s };
}
export function filaMarcada() {
  const W = 130, H = 34;
  let s = '';
  const tinta = '#c8a040';
  s += `<g opacity="0.75">` + traco('M4,6 H126 M4,28 H126', tinta, 2.2) + traco('M4,6 H126 M4,28 H126', '#2a2420', 2.2, 0.0) + `</g>`;
  s += recorte(ret(0, 0, W, H), [...Array(14)].map((_, i) => `<rect x="${4 + i * 9}" y="4.4" width="3" height="3.2" fill="#3a3430" opacity="0.5"/><rect x="${7 + i * 9}" y="26.4" width="3" height="3.2" fill="#3a3430" opacity="0.4"/>`).join(''));
  for (let i = 0; i < 4; i++) {
    const x = 18 + i * 30;
    for (const [dx, dy] of [[-3.5, 0], [3.5, 1.5]]) s += `<ellipse cx="${x + dx}" cy="${17 + dy}" rx="2.6" ry="4.4" fill="${tinta}" opacity="0.55"/><ellipse cx="${x + dx}" cy="${12.6 + dy}" rx="1.8" ry="1.4" fill="${tinta}" opacity="0.55"/>`;
  }
  s += `<ellipse cx="64" cy="18" rx="22" ry="6" fill="#1a1416" opacity="0.15"/><ellipse cx="104" cy="14" rx="10" ry="4" fill="#1a1416" opacity="0.18"/>`;
  return { nome: 'fila_marcada', w: W, h: H, svg: s, ay: H / 2 };
}
export function painelSolarQuebrado() {
  const W = 74, H = 64;
  let s = sombraChao(37, 60, 32, 4);
  s += traco('M14,58 L22,30 M60,58 L52,30 M37,60 V40', TINTA, 4) + traco('M14,58 L22,30 M60,58 L52,30 M37,60 V40', '#4a4e56', 2.2);
  const pl = poli([[6, 18], [62, 6], [70, 36], [12, 46]]);
  s += cel(pl, '#3e424c', { s: 3, l: 0.6, w: 2 });
  const cel_ = (u0, v0, u1, v1) => {
    const P = (u, v) => [6 + (62 - 6) * u + (12 - 6) * v + ((70 - 62) - (12 - 6)) * u * v, 18 + (6 - 18) * u + (46 - 18) * v + ((36 - 6) - (46 - 18)) * u * v];
    return poli([P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)]);
  };
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
    const u0 = 0.04 + i * 0.16, v0 = 0.08 + j * 0.3;
    const falta = i === 4 && j === 1;
    s += `<path d="${cel_(u0, v0, u0 + 0.14, v0 + 0.26)}" fill="${falta ? '#14161c' : (i + j) % 3 ? '#26304a' : '#2e3a58'}" stroke="#4a5a78" stroke-width="0.5"/>`;
  }
  s += traco('M22,16 l8,8 l-2,8 m2,-8 l10,0 m-10,0 l4,10 M40,14 l-3,6', '#b8c8d8', 0.7, 0.85);
  s += traco('M14,20 L58,10', '#8aa0c0', 0.8, 0.25);
  s += fio(60, 40, 74, 62, 4) + desgaste(pl, 6, 6, 64, 40, 681, { forca: 0.8 });
  return { nome: 'painel_solar_quebrado', w: W, h: H, svg: s };
}
export function posteQuebrado() {
  const W = 40, H = 132;
  let s = sombraChao(14, 128, 12, 3);
  s += cel(retRed(8, 118, 12, 12, 1.5), GRAFITE, { s: 2, l: 0.6, w: 1.8 });
  s += `<g transform="rotate(4 14 120)">` + cel(retRed(11, 22, 6, 98, 1.5), '#34363e', { s: 2, l: 0.6, w: 1.8 }) + `<path d="M12,60 q1,14 2,0Z M12,96 q1,8 2,0Z" fill="${FERRUGEM}" opacity="0.6"/>` +
    traco('M14,24 Q14,10 26,10 H30', TINTA, 6) + traco('M14,24 Q14,10 26,10 H30', '#34363e', 3.4) + cel(`M22,12 h16 l-2,7 h-12Z`, GRAFITE, { s: 1.5, l: 0.5, w: 1.6 }) +
    `<path d="M24,19 h12 l-1,3 l-2,-1 l-2,3 l-2,-2 l-2,2 l-2,-2 Z" fill="#2a3038" stroke="${TINTA}" stroke-width="1"/>` + `</g>`;
  s += traco('M30,22 Q34,40 28,52 q-2,4 1,7', '#1c1820', 1.2) + traco('M28,59 l2,2 m-2,-2 l-2,2', '#c8a040', 0.8);
  for (const [x, y] of [[24, 124], [30, 127], [20, 128]]) s += `<path d="M${x},${y} l2,-1.5 l1,2Z" fill="#8aa0b0" stroke="${TINTA}" stroke-width="0.4"/>`;
  return { nome: 'poste_quebrado', w: W, h: H, svg: s, ax: 14 };
}
export function baterias() {
  const W = 66, H = 48;
  let s = sombraChao(33, 44, 30, 4);
  const bat = (x, y, w, h, c) => cel(retRed(x, y, w, h, 1.5), c, { s: 2.5, l: 0.6, w: 1.6 }) + cel(retRed(x + 3, y - 3, 5, 3.5, 0.8), '#8a2a22', { s: 0.6, l: 0.3, w: 1 }) + cel(retRed(x + w - 8, y - 3, 5, 3.5, 0.8), '#2a2c32', { s: 0.6, l: 0.3, w: 1 }) + `<rect x="${x + 4}" y="${y + h * 0.45}" width="${w - 8}" height="${h * 0.22}" fill="#bcb4a0" opacity="0.6"/>`;
  s += bat(4, 26, 28, 18, '#2e3238') + bat(34, 26, 28, 18, '#3a3e36') + bat(16, 8, 30, 18, '#2e3238');
  s += traco('M10,8 l0,-2 M42,26 l-2,-6', '#2a2c32', 0.1);
  s += traco('M37,24 Q30,14 22,6', '#8a2a22', 1.4) + traco('M58,24 Q60,8 40,4', '#1c1c20', 1.4) + traco('M18,44 l4,-14', '#bcae84', 3, 0.8);
  s += fio(10, 24, 0, 46, 4, '#8a2a22', 1.3);
  return { nome: 'baterias', w: W, h: H, svg: s };
}
export function gambiarraFios() {
  const W = 172, H = 66;
  let s = '', e = '';
  for (const x of [6, 166]) s += cel(retRed(x - 4, 2, 8, 8, 1), '#3e424c', { s: 1, l: 0.3, w: 1.4 }) + rebite(x, 6, 1.1);
  s += fio(6, 8, 166, 8, 34, '#1c1820', 1.6) + fio(6, 6, 166, 10, 24, '#2a2420', 1.2) + fio(6, 9, 90, 30, 14, '#3a2a20', 1.1) + fio(90, 30, 166, 6, 10, '#3a2a20', 1.1);
  s += traco('M70,38 q4,10 -2,14 q-4,3 0,8', '#1c1820', 1.2) + traco('M120,36 l2,4 m-2,-4 l-3,3', '#c8a040', 0.8);
  // bocais com lâmpadas: só uma acesa e fraca
  const pts = [[40, 19], [86, 25], [128, 20]];
  pts.forEach(([x, y], i) => {
    s += traco(`M${x},${y} v4`, '#1c1820', 1.2) + cel(retRed(x - 2.4, y + 3, 4.8, 4, 0.8), '#3a3e44', { s: 0.6, l: 0.3, w: 1 });
    const viva = i === 1;
    s += `<ellipse cx="${x}" cy="${y + 10.5}" rx="3.8" ry="4.4" fill="${viva ? '#f0d08a' : '#5a5a58'}" stroke="${TINTA}" stroke-width="0.9"/>`;
    if (!viva) s += traco(`M${x - 1},${y + 9} l1,2 l1,-2`, '#2a2a2a', 0.6);
    if (viva) e += halo(x, y + 10.5, 22, '#e8a040', 0.55) + `<ellipse cx="${x}" cy="${y + 10.5}" rx="3.8" ry="4.4" fill="#ffe0a0"/>`;
  });
  s += traco('M128,51 l2,6', '#8aa0b0', 0.6);
  return { nome: 'gambiarra_fios', w: W, h: H, svg: s, emissivo: e };
}
export function caixotesVazios() {
  const W = 78, H = 54;
  let s = sombraChao(39, 50, 37, 4.5);
  s += `<g transform="rotate(-14 56 40)">${caixote(42, 18, 30, 30, 8, 691, '#7a5636', true)}</g>`;
  s += caixote(6, 16, 32, 34, 9, 692, '#8a6440', true);
  s += `<g transform="rotate(30 40 48)">${tabuasH(30, 44, 24, 5, 1, '#6a4e38', 693, { pregos: false })}</g>`;
  return { nome: 'caixotes_vazios', w: W, h: H, svg: s };
}
export function fuligemMarca() {
  const W = 92, H = 62;
  const r = rnd(701);
  let s = fuligem(46, 34, 44, 28, 0.55) + fuligem(40, 26, 24, 16, 0.5);
  for (let i = 0; i < 6; i++) s += `<path d="M${f1(26 + r() * 40)},${f1(10 + r() * 10)} q${f1(-2 + r() * 4)},-10 ${f1(-4 + r() * 8)},-8" stroke="#140e12" stroke-width="${f1(3 + r() * 4)}" opacity="0.18" stroke-linecap="round" fill="none"/>`;
  return { nome: 'fuligem_marca', w: W, h: H, svg: s, ay: H / 2 };
}
export function tabuasJanela() {
  const W = 48, H = 46;
  return { nome: 'tabuas_janela', w: W, h: H, svg: tabuasPregadas(6, 4, 36, 38, 711, '#6a4a34'), ay: H / 2 };
}
export function arameFarpado() {
  const W = 64, H = 30;
  let s = sombraChao(32, 27, 32, 2.5, 0.2);
  for (let i = 0; i < 5; i++) {
    const x = 6.4 + i * 12.8;
    s += `<ellipse cx="${x}" cy="16" rx="9" ry="10" fill="none" stroke="#1a1418" stroke-width="2.2"/><ellipse cx="${x}" cy="16" rx="9" ry="10" fill="none" stroke="#6a6668" stroke-width="0.9"/>`;
    for (const a of [0.6, 2.2, 3.8, 5.3]) {
      const px = x + Math.cos(a) * 9, py = 16 + Math.sin(a) * 10;
      s += `<path d="M${f1(px - 1.8)},${f1(py - 1.8)} L${f1(px + 1.8)},${f1(py + 1.8)} M${f1(px + 1.8)},${f1(py - 1.8)} L${f1(px - 1.8)},${f1(py + 1.8)}" stroke="#6a6668" stroke-width="0.9" stroke-linecap="round"/>`;
    }
  }
  s += arame([[0, 26], [32, 25], [64, 26]], 721);
  return { nome: 'arame_farpado', w: W, h: H, svg: s };
}
export function panelaComunitaria() {
  const W = 70, H = 60;
  let s = sombraChao(35, 56, 32, 4.5), e = '';
  // pedras do fogo
  for (const [x, y] of [[14, 50], [24, 54], [46, 54], [56, 50], [35, 56]]) s += cel(elipse(x, y, 6, 4), '#6a625a', { s: 1.6, l: 0.5, w: 1.4 });
  // lenha e chamas
  s += traco('M20,50 L50,44 M22,44 L50,52', TINTA, 5) + traco('M20,50 L50,44 M22,44 L50,52', '#5a3e28', 3.2);
  const chama = 'M26,48 q-2,-10 5,-16 q-1,7 4,9 q2,-6 6,-9 q3,8 -2,16Z';
  s += `<path d="${chama}" fill="#d8803a" stroke="${TINTA}" stroke-width="1"/>`;
  e += halo(35, 40, 32, '#e8883a', 0.6) + `<path d="${chama}" fill="#ffb050"/>` + `<path d="M31,47 q-1,-6 3,-9 q1,5 3,6 q2,-2 2,-4 q2,5 -2,8Z" fill="#fff0b0"/>`;
  // tripé e caldeirão
  s += traco('M14,54 L35,8 L56,54', TINTA, 3.6) + traco('M14,54 L35,8 L56,54', '#4e3a2a', 2) + traco('M35,8 V16', '#2a2428', 1.2);
  s += cel(`M21,20 h28 q2,14 -6,18 h-16 q-8,-4 -6,-18Z`, '#2e2c30', { s: 4, l: 0.6, w: 2 }) + cel(elipse(35, 20, 14, 3.4), '#3e3a3a', { s: 1, l: 0.3, w: 1.6 }) + `<ellipse cx="35" cy="20.5" rx="11" ry="2.2" fill="#6a5a3a"/>`;
  s += massa(cachos([[30, 12, 4, 3], [38, 8, 3.4, 2.6]], 731), '#9a9690', { s: 1, l: 0.3, w: 1, cc: '#5a5654' });
  // tigelas vazias empilhadas do lado
  s += cel(`M56,44 h12 q-1,6 -6,6 q-5,0 -6,-6Z`, '#8a6a48', { s: 1.4, l: 0.4, w: 1.2 }) + cel(`M57,40 h10 q-1,5 -5,5 q-4,0 -5,-5Z`, '#7a5a3e', { s: 1.2, l: 0.4, w: 1.1 });
  return { nome: 'panela_comunitaria', w: W, h: H, svg: s, emissivo: e };
}

export function pecasGuerra() {
  return [
    sacosAreia(), barricada(), gerador(), postoControle(), holofote(), lonaRemendo(), entulho(), filaMarcada(), painelSolarQuebrado(),
    posteQuebrado(), baterias(), gambiarraFios(), caixotesVazios(), fuligemMarca(), tabuasJanela(), arameFarpado(), panelaComunitaria(),
  ];
}
