// Bonecos cartoon em peças de rig 2D (tronco, cabeça, braços, pernas, cabelo que balança, itens).
// Uso: node tools/art/cartoon/personagens.mjs
// Saída: packages/client/public/teste-cartoon/<boneco>_<dir>_<parte>.png (+ _e.png = camada emissiva),
//        rigs.json, pecas-bonecos.json e a prancha de conferência tools/art/saida/cartoon-bonecos.png.
// Tudo é desenhado em coordenadas do boneco: pés no chão em (0,0), y negativo para cima, 1 u = 1 px CSS.
// Tom: adulto e sóbrio (proporção ~1:3,3, olhos adultos, paleta madura). O humor mora nos detalhes de
// cada um (adesivo descascando, bolso de recibo, fita no headset, bateria extra, sacola de troca) e no
// desgaste de uma cidade em guerra e sem energia (remendo, poeira, olheira, curativo).
// A cabeça é desenhada num espaço próprio (centro em 0,0, ~29 u de largura) e reduzida por K_CAB.
import { writeFileSync } from 'node:fs';
import {
  blob, elipse, retRed, brilho as brilho0, traco, halo, sombra, luz, contorno, mistura, cel,
  uid, cfg, capsula, comp, recorta, escuro, xadrez, olhoAdulto, sobrancelha, remendo, poeira,
  renderizarPecas, montarHTML, fotografar,
} from './boneco.mjs';
import { rnd } from './lib.mjs';

const DIR = 'packages/client/public/teste-cartoon';
const W = 2.1; // contorno principal
const K_CAB = 0.72; // escala da cabeça (espaço da cabeça → boneco)
const fx = (v) => +v.toFixed(2);

// lado do membro: na frente (baixo) o lado esquerdo do boneco fica à direita da tela
const sinal = (dir, lado) => (dir === 'baixo' ? (lado === 'e' ? 1 : -1) : dir === 'cima' ? (lado === 'e' ? -1 : 1) : 1);
const PELES = new Set();
// 3 faixas suaves: sombra puxada para um violeta-acinzentado, luz para um creme, sem estourar
const forma = (d, cor, o = {}) => {
  const pele = PELES.has(cor);
  return cel(d, cor, {
    s: o.s ?? 3, l: o.l ?? 1.8,
    cs: pele ? mistura(cor, '#5a2e3a', 0.24) : mistura(cor, '#251f33', 0.3),
    cl: pele ? mistura(cor, '#fff0e0', 0.2) : mistura(cor, '#f6eee2', 0.16),
    ...o, w: (o.w ?? W) * cfg.kw,
  });
};
const brilho = (x, y, rx, ry, rot, op = 0.85) => brilho0(x, y, rx * 0.8, ry * 0.7, rot, op * 0.3);

// ======================= peças genéricas =======================
function formaTronco(C, dir) {
  const sy = C.ombroY, hy = C.hipY, Ws = C.Ws, Wq = C.Wq;
  if (dir !== 'lado') return blob([[-Ws + 1.5, sy - 4.5], [0, sy - 5.6], [Ws - 1.5, sy - 4.5], [Ws + 0.4, sy + 1.5], [Ws - 1, sy + 11], [Wq, hy - 3], [Wq + 0.5, hy + 3], [0, hy + 5], [-Wq - 0.5, hy + 3], [-Wq, hy - 3], [-Ws + 1, sy + 11], [-Ws - 0.4, sy + 1.5]]);
  const T = C.T;
  return blob([[-T + 1.5, sy - 4.5], [1, sy - 5.6], [T - 1, sy - 3.5], [T + 1, sy + 5], [T - 0.4, hy - 4], [T - 0.8, hy + 3], [0, hy + 5], [-T + 0.6, hy + 3], [-T + 0.4, hy - 5], [-T - 0.4, sy + 5]]);
}
// cabeça adulta no espaço da cabeça: maçã do rosto marcada, mandíbula e queixo definidos
// lado direito do contorno, do alto (0,-1) ao queixo (0,1), em frações de rx/ry; o esquerdo é espelhado
const espelha = (dir) => [...dir, ...dir.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
const CRANIOS = {
  quadrado: [[0, -1], [0.82, -0.88], [1, -0.28], [1.02, 0.3], [0.95, 0.72], [0.66, 0.97], [0, 1.03]],
  fino: [[0, -1], [0.8, -0.84], [1, -0.22], [0.94, 0.3], [0.7, 0.72], [0.3, 0.98], [0, 1.03]],
  comprido: [[0, -1], [0.82, -0.86], [1, -0.3], [1, 0.36], [0.96, 0.76], [0.62, 0.97], [0, 1]],
  redondo: [[0, -1], [0.78, -0.8], [1, -0.12], [1.02, 0.36], [0.84, 0.78], [0.42, 0.99], [0, 1.01]],
};
function formaCabeca(C, dir) {
  const rx = C.rx, ry = C.ry;
  if (C.cranio && dir !== 'lado') return blob(espelha(CRANIOS[C.cranio]).map(([x, y]) => [x * rx, y * ry]));
  if (C.cranio) {
    const n = C.nariz ?? 2.4, q = C.queixo ?? 0;
    return blob([[-rx * 0.1, -ry], [rx * 0.7, -ry * 0.82], [rx * 0.96, -ry * 0.3], [rx * 0.98, -ry * 0.02], [rx + n, ry * 0.3], [rx * 0.98, ry * 0.46], [rx * 0.97, ry * 0.66], [rx * 0.8 + q, ry * 0.98], [rx * 0.1, ry * (1 + q * 0.02)], [-rx * 0.5, ry * 0.74], [-rx * 0.97, ry * 0.2], [-rx * 0.9, -ry * 0.58]]);
  }
  if (dir !== 'lado') return blob([[0, -ry], [rx * 0.8, -ry * 0.82], [rx, -ry * 0.15], [rx * 0.97, ry * 0.25], [rx * 0.82, ry * 0.62], [rx * 0.42, ry * 0.94], [0, ry], [-rx * 0.42, ry * 0.94], [-rx * 0.82, ry * 0.62], [-rx * 0.97, ry * 0.25], [-rx, -ry * 0.15], [-rx * 0.8, -ry * 0.82]]);
  return blob([[-rx * 0.1, -ry], [rx * 0.7, -ry * 0.82], [rx * 0.96, -ry * 0.3], [rx * 0.98, -ry * 0.02], [rx + 2.4, ry * 0.32], [rx * 0.98, ry * 0.44], [rx * 0.96, ry * 0.62], [rx * 0.66, ry * 0.97], [rx * 0.1, ry * 0.98], [-rx * 0.5, ry * 0.72], [-rx * 0.97, ry * 0.2], [-rx * 0.9, -ry * 0.58]]);
}

/** Rosto adulto genérico no espaço da cabeça. o: { iris, sob (cor da sobrancelha), olheira, palpebra, boca, delineado } */
function rosto(C, dir, o = {}) {
  if (C.rosto) return C.rosto(C, dir);
  const rx = C.rx, ry = C.ry, pele = C.pele, sh = mistura(pele, '#4a2430', 0.42), cc = o.cc ?? '#1e1210';
  let s = '';
  if (dir === 'baixo') {
    for (const k of [-1, 1]) s += olhoAdulto(k * 5.4, 1.2, { rx: 3, ry: 1.9, iris: o.iris, m: k, olheira: o.olheira, palpebra: o.palpebra, pele, cc, delineado: o.delineado });
    for (const k of [-1, 1]) s += sobrancelha(k * 1.9, -2.7 + (o.brava ? 0.5 : 0), k * 9.2, -3.9, o.sob, o.sobW ?? 2, -0.5);
    // maçã do rosto, nariz, boca e queixo
    for (const k of [-1, 1]) s += traco(`M${k * (rx - 3.2)},${4.6} q${-k * 1.4},${1.8} ${-k * 3.4},${2}`, sh, 0.9, 0.45);
    s += traco(`M-0.4,1.8 Q-1.1,4.6 -1.6,6.4`, sh, 0.9, 0.55);
    s += traco(`M-2.4,7 q1.2,1 2.4,0.4 q1.2,0.6 2.4,-0.4`, sh, 1, 0.75);
    s += `<ellipse cx="0.4" cy="5.8" rx="1.6" ry="1.4" fill="#fff" opacity=".1"/>`;
    s += o.boca ?? traco(`M-3.4,10.6 Q0,11.2 3.4,10.6`, '#3a1812', 1.2);
    s += traco(`M-1.8,12.5 q1.8,0.7 3.6,0`, sh, 0.8, 0.4) + traco(`M-2.2,14.6 q2.2,0.9 4.4,0`, sh, 0.8, 0.35);
  } else if (dir === 'lado') {
    s += olhoAdulto(7.3, 1.2, { rx: 2.3, ry: 1.9, iris: o.iris, dx: 0.6, olheira: o.olheira, palpebra: o.palpebra, pele, cc, delineado: o.delineado });
    s += sobrancelha(4.6, -2.7 + (o.brava ? 0.5 : 0), 10.6, -3.6, o.sob, o.sobW ?? 2, -0.4);
    s += traco(`M${rx - 4.4},4.8 q-1.2,1.6 -3,1.8`, sh, 0.9, 0.45);
    s += traco(`M${rx + 1.4},6.4 q-1.2,0.9 -2.4,0.3`, sh, 0.9, 0.7);
    s += o.bocaLado ?? traco(`M${rx - 4.4},10.8 L${rx - 0.6},10.4`, '#3a1812', 1.2);
    s += traco(`M${rx - 3.4},14.4 q1.4,0.4 2.4,-0.6`, sh, 0.8, 0.35);
  }
  return s;
}
// ---------- rostos próprios (nada de sorriso; a expressão vem da sobrancelha e das pálpebras) ----------
const vinco = (pele) => mistura(pele, '#4a2430', 0.45);

// Peão: rosto largo e quadrado, olhos apertados de sol, sobrancelha em V, nariz grande e quebrado
function rostoPeao(C, dir) {
  const rx = C.rx, pele = C.pele, sh = vinco(pele), cc = '#1a0e08';
  const o = { rx: 3.3, ry: 2.3, iris: '#5a3a1e', palpebra: 0.2, baixa: 0.2, pele, cc, lw: 1.8, brilho: false };
  let s = '';
  if (dir === 'baixo') {
    for (const k of [-1, 1]) s += olhoAdulto(k * 5.6, 1.6, { ...o, m: k, dx: 0 });
    for (const k of [-1, 1]) s += sobrancelha(k * 1.3, -0.6, k * 9.8, -2.8, BIGODE, 2.7, -0.2);
    s += traco('M-0.8,-2.6 l0.3,1.8 M0.8,-2.6 l-0.3,1.8', sh, 0.7, 0.75);
    for (const k of [-1, 1]) s += traco(`M${k * 9.2},1.2 l${k * 1.9},-0.9 M${k * 9.2},2.4 l${k * 2.1},0.2 M${k * 9},3.4 l${k * 1.6},1`, sh, 0.6, 0.65);
    for (const k of [-1, 1]) s += traco(`M${k * (rx - 3.4)},4.6 q${-k * 1.4},2 ${-k * 3.4},2.4`, sh, 1, 0.5);
    // nariz grande, já quebrado: ponte torta e calombo
    s += traco('M0.3,1.2 Q1.5,3 0.3,4.8 Q-0.5,5.8 0.7,6.6', sh, 1.1, 0.75) + `<ellipse cx="1" cy="3" rx="0.9" ry="0.6" fill="#fff" opacity=".16"/>`;
    s += forma(blob([[-3.4, 7], [-1.2, 5], [1.8, 5.2], [4, 7.2], [2.8, 8.9], [-2.4, 8.9]]), mistura(pele, '#a0503a', 0.14), { w: 1.3, s: 1, l: 0.7, cc: '#3a1a10' });
    s += traco('M-2,8.3 q0.6,0.5 1.1,0 M1.3,8.4 q0.6,0.5 1.1,0', '#3a1a10', 0.6, 0.8);
    s += traco('M-3.8,13.2 Q0,12.6 3.8,13.5', '#2a100a', 1.2);
    s += traco('M-3.6,15.2 q3.6,1.4 7.2,0', sh, 0.9, 0.45) + traco('M0,14.4 l0,1.3', sh, 0.7, 0.5);
  } else if (dir === 'lado') {
    s += olhoAdulto(8, 1.6, { ...o, rx: 2.3, dx: 0.6 });
    s += sobrancelha(4.8, -0.7, 11.6, -2.4, BIGODE, 2.7, -0.2);
    s += traco('M4.8,1.2 l-1.9,-0.8 M4.8,2.4 l-2.1,0.2', sh, 0.6, 0.65);
    s += traco(`M${rx + 0.8},-0.6 q1.4,1.2 1.2,2.6`, sh, 0.9, 0.6) + traco(`M${rx + 2.4},7.4 q-1.2,0.8 -2.4,0`, '#3a1a10', 0.8, 0.8);
    s += traco(`M${rx - 4.8},13.2 L${rx - 0.6},12.9`, '#2a100a', 1.2);
    s += traco(`M${rx - 4.4},4.8 q-1.2,1.6 -3,1.8`, sh, 0.9, 0.45) + traco(`M${rx - 3},15.4 q1.4,0.3 2.4,-0.6`, sh, 0.8, 0.4);
  }
  return s;
}
// Idol: rosto fino, pálpebra pesada de cansaço, olhar de lado, uma sobrancelha de deboche, boca de lado, rímel borrado
function rostoIdol(C, dir) {
  const rx = C.rx, pele = C.pele, sh = vinco(pele), cc = '#16101a';
  const o = { rx: 3.4, ry: 2.6, iris: '#5a4a66', palpebra: 0.4, pele, cc, lw: 1.6, delineado: true, olheira: 1, corOlheira: '#3e2a42' };
  const borrado = (x, y, m) => `<path d="M${x - m * 2},${y + 1.6} q${m * 2.6},2 ${m * 5.2},0" fill="none" stroke="#3a2a40" stroke-width="1.5" opacity=".32" stroke-linecap="round"/>` + traco(`M${x + m * 1.6},${y + 2.4} l${m * 0.3},1.8`, '#3a2a40', 0.7, 0.35);
  let s = '';
  if (dir === 'baixo') {
    for (const k of [-1, 1]) s += borrado(k * 5, 1.4, k) + olhoAdulto(k * 5, 1.4, { ...o, m: k, dx: 0.9 * k });
    s += sobrancelha(-1.8, -3.2, -8.6, -4.9, LILAS_S, 1.5, -1.3);
    s += sobrancelha(1.8, -2.2, 8.6, -2.9, LILAS_S, 1.5, -0.1);
    s += traco('M0.2,1.6 Q0.9,4.6 -0.1,6.6', sh, 0.8, 0.55) + traco('M-1.2,7 q1.2,0.6 2.4,0', sh, 0.8, 0.7);
    for (const k of [-1, 1]) s += traco(`M${k * (rx - 2.6)},4.4 q${-k * 1.6},2.4 ${-k * 3.6},3`, sh, 0.9, 0.5);
    s += `<ellipse cx="-2" cy="10.6" rx="1.6" ry="0.7" fill="#8a4a52" opacity=".3"/>`;
    s += traco('M-2.6,10.4 Q0.4,10.5 3,11.1', '#4a2028', 1.1) + traco('M-2.6,10.4 l-0.5,0.3', '#3a1a1e', 0.7);
    s += traco('M-0.6,11.8 q1.4,0.4 2.6,-0.4', '#8a4a52', 0.9, 0.6) + traco('M-1.6,14.2 q1.6,0.7 3.2,0', sh, 0.7, 0.35);
  } else if (dir === 'lado') {
    s += borrado(6.8, 1.4, 1) + olhoAdulto(6.8, 1.4, { ...o, rx: 2.3, dx: 0.8 });
    s += sobrancelha(4.2, -3.2, 10, -4.6, LILAS_S, 1.5, -1.2);
    s += traco(`M${rx + 1.4},6.6 q-1,0.6 -2,0`, sh, 0.8, 0.7);
    s += traco(`M${rx - 4},10.4 L${rx - 0.4},9.8`, '#4a2028', 1.1);
    s += traco(`M${rx - 3.4},4.6 q-1.2,1.8 -2.8,2.2`, sh, 0.8, 0.45);
  }
  return s;
}
// PM: rosto comprido, mandíbula travada, olhar duro e vazio na sombra da aba
function rostoPM(C, dir) {
  const rx = C.rx, ry = C.ry, pele = C.pele, sh = vinco(pele), cc = '#100806';
  const o = { rx: 3.2, ry: 2.2, iris: '#3a2a1e', palpebra: 0.16, pele, cc, lw: 1.9, brilho: false, olheira: 0.6, corOlheira: '#3a2228' };
  const sombraAba = recorta(formaCabeca(C, dir), `<rect x="-30" y="-12" width="60" height="${12.6}" fill="#1a1018" opacity=".26"/>`);
  let s = '';
  if (dir === 'baixo') {
    for (const k of [-1, 1]) s += olhoAdulto(k * 5.4, 1.4, { ...o, m: k, dx: 0 });
    for (const k of [-1, 1]) s += sobrancelha(k * 1.5, -1.2, k * 9.8, -1.9, '#1e1612', 2.6, 0.1);
    s += traco('M0,-0.4 L0.3,6.6', sh, 0.9, 0.5) + traco('M-2.2,7.6 q1.1,0.8 2.2,0.3 q1.1,0.5 2.2,-0.3', sh, 1, 0.75);
    for (const k of [-1, 1]) s += traco(`M${k * (rx - 1.2)},6.4 q${-k * 0.9},3.4 ${-k * 0.3},7`, sh, 1, 0.5) + traco(`M${k * (rx - 3.4)},4.4 q${-k * 1},1.8 ${-k * 2.6},2`, sh, 0.8, 0.4);
    s += traco('M-3.6,12.4 L3.6,12.4', '#1e0c08', 1.3) + traco('M-2,13.8 q2,0.5 4,0', sh, 0.8, 0.4);
    s += traco(`M-4,${ry - 0.8} L4,${ry - 0.8}`, sh, 0.8, 0.35);
    s += sombraAba;
  } else if (dir === 'lado') {
    s += olhoAdulto(7.8, 1.4, { ...o, rx: 2.2, dx: 0.6 });
    s += sobrancelha(4.6, -1.2, 11.2, -1.8, '#1e1612', 2.6, 0.1);
    s += traco(`M${rx + 1.8},7.4 q-1,0.6 -2,0`, sh, 0.8, 0.7);
    s += traco(`M${rx - 4.8},12.4 L${rx - 0.6},12.2`, '#1e0c08', 1.3);
    s += traco(`M-1,9 Q1,${ry - 0.6} ${rx - 2.6},${ry - 0.4}`, sh, 1, 0.5) + traco(`M1.6,6 q0.4,2.4 1.6,4`, sh, 0.9, 0.45);
    s += sombraAba;
  }
  return s;
}
// Benzedeira: rosto redondo e enrugado, olho desconfiado espiando por cima dos óculos, boca franzida
function rostoBenz(C, dir) {
  const rx = C.rx, pele = C.pele, sh = vinco(pele), cc = '#1a0e08', ARO = '#2e2014';
  const o = { rx: 3, ry: 2.3, iris: '#4a3020', palpebra: 0.12, baixa: 0.3, pele, cc, lw: 1.5, olheira: 0.9, corOlheira: '#4a2a2a' };
  let s = '';
  if (dir === 'baixo') {
    for (const k of [-1, 1]) s += olhoAdulto(k * 5.2, 0.6, { ...o, m: k, dx: 0.9 * k });
    s += sobrancelha(-2, -3.2, -8, -4.6, '#8a8890', 1.5, -1.4);
    s += sobrancelha(2, -1.6, 8, -2.2, '#8a8890', 1.5, -0.1);
    s += traco('M-5,-6.6 q5,-1.1 10,0 M-4,-8.4 q4,-0.8 8,0', sh, 0.6, 0.5);
    for (const k of [-1, 1]) s += traco(`M${k * 8.4},0 l${k * 1.6},-0.8 M${k * 8.4},1.2 l${k * 1.8},0 M${k * 8.2},2.2 l${k * 1.4},0.9`, sh, 0.55, 0.65);
    for (const k of [-1, 1]) s += traco(`M${k * 2.8},8 Q${k * 5},10.4 ${k * 4.4},13.2`, sh, 0.8, 0.55) + traco(`M${k * (rx - 2)},9.4 q${-k * 0.6},3 ${-k * 2.8},4.8`, sh, 0.8, 0.4);
    s += forma(elipse(0, 7.2, 2.5, 2), mistura(pele, '#8a4030', 0.1), { w: 1.1, s: 0.8, l: 0.5, cc: '#3a1a10' });
    // boca franzida
    s += forma(elipse(0, 11.6, 1.7, 0.85), '#6a3028', { w: 0.8, s: 0, l: 0, cc: '#2a100a' });
    for (const a of [-1.5, -0.5, 0.5, 1.5]) s += traco(`M${a * 1.3},10.4 l${a * 0.2},-0.8 M${a * 1.3},12.8 l${a * 0.2},0.8`, sh, 0.5, 0.6);
    // óculos baixos na ponta do nariz
    for (const k of [-1, 1]) {
      s += `<ellipse cx="${k * 5}" cy="5.2" rx="3.3" ry="2.6" fill="#dfe8ea" opacity=".14"/><path d="M${k * 5 - 2},6.4 L${k * 5 - 0.4},3.4 L${k * 5 + 0.4},3.6 L${k * 5 - 1.2},6.7Z" fill="#fff" opacity=".25"/>`;
      s += `<ellipse cx="${k * 5}" cy="5.2" rx="3.3" ry="2.6" fill="none" stroke="${ARO}" stroke-width="1.1"/>` + traco(`M${k * 8.3},4.8 L${k * (rx - 0.2)},2.6`, ARO, 0.8);
    }
    s += traco('M-1.7,5 Q0,4.2 1.7,5', ARO, 0.9);
  } else if (dir === 'lado') {
    s += olhoAdulto(7.4, 0.6, { ...o, rx: 2.1, dx: 0.7 });
    s += sobrancelha(4.6, -3.2, 10, -4.4, '#8a8890', 1.5, -1.3);
    s += traco('M3,-6.6 q4,-1 8,0', sh, 0.6, 0.5) + traco('M4.6,0.2 l-1.6,-0.8 M4.6,1.4 l-1.8,0', sh, 0.55, 0.65);
    s += traco(`M${rx - 3},8 Q${rx - 5},10.4 ${rx - 4.4},13`, sh, 0.8, 0.55);
    s += forma(elipse(rx - 1.6, 11.6, 1.2, 0.8), '#6a3028', { w: 0.8, s: 0, l: 0, cc: '#2a100a' });
    s += `<ellipse cx="${rx - 1.4}" cy="5.2" rx="1.8" ry="2.6" fill="#dfe8ea" opacity=".14"/><ellipse cx="${rx - 1.4}" cy="5.2" rx="1.8" ry="2.6" fill="none" stroke="${ARO}" stroke-width="1.1"/>` + traco(`M${rx - 3.2},4.6 L-1.4,2.2`, ARO, 0.8);
  }
  return s;
}

const orelha = (C, x, y = 1.6) => forma(elipse(x, y, 2.6, 3.6), C.pele, { w: 1.6, s: 1, l: 0.6, cc: mistura(C.pele, '#2a1008', 0.6) }) + traco(`M${x + (x > 0 ? 0.3 : -0.3)},${y - 1.2} q${x > 0 ? -0.9 : 0.9},1.3 0,2.6`, mistura(C.pele, '#4a2430', 0.4), 0.7);
const barba = (C, d, ate = 3.4, cor = '#2a1c18') => {
  const r = rnd(5);
  let p = `<path d="M${-C.rx - 2},${ate} Q0,${ate + 1.6} ${C.rx + 2},${ate} L${C.rx + 2},${C.ry + 3} L${-C.rx - 2},${C.ry + 3}Z" fill="${cor}" opacity=".2"/>`;
  for (let i = 0; i < 40; i++) p += `<circle cx="${-C.rx + r() * C.rx * 2}" cy="${ate + 1 + r() * (C.ry - ate)}" r="0.32" fill="${cor}" opacity=".45"/>`;
  return recorta(d, p);
};

function mao(C, x, y, dir, sg) {
  const r = C.maoR, cor = C.luva ?? C.pele, cc = mistura(cor, '#1a0c08', 0.65);
  let s = '';
  if (dir === 'lado') {
    s += forma(blob([[x - r, y - r * 0.8], [x + r * 0.3, y - r * 1.05], [x + r * 0.95, y - r * 0.2], [x + r * 0.7, y + r * 0.95], [x - r * 0.3, y + r * 1.1], [x - r * 0.95, y + r * 0.3]]), cor, { w: 1.6, s: 1.6, l: 1, cc });
    s += forma(elipse(x + r * 0.7, y - r * 0.3, r * 0.36, r * 0.5), cor, { w: 1.1, s: 0.6, l: 0.4, cc });
  } else {
    s += forma(blob([[x - r * 0.9, y - r * 0.7], [x, y - r * 1.05], [x + r * 0.9, y - r * 0.7], [x + r * 0.9, y + r * 0.6], [x, y + r * 1.1], [x - r * 0.9, y + r * 0.6]]), cor, { w: 1.6, s: 1.6, l: 1, cc });
    if (dir === 'baixo') s += forma(elipse(x - sg * r * 0.75, y - r * 0.15, r * 0.36, r * 0.5), cor, { w: 1.1, s: 0.6, l: 0.4, cc });
    for (let i = -1; i <= 1; i++) s += traco(`M${x + i * r * 0.38},${y + r * 1} l0,${-r * 0.4}`, cc, 0.6, 0.45);
  }
  return s;
}

function braco(C, dir, lado) {
  const sg = sinal(dir, lado);
  const tras = dir === 'lado' && lado === 'e';
  const sx = dir === 'lado' ? (tras ? -1.5 : 0.5) : sg * C.ombroX, sy = C.ombroY + (tras ? -0.5 : 0);
  const o = dir === 'lado' ? 0.8 : sg * 1.4, L = C.bracoL, r = C.bracoR;
  const cot = [sx + o * 0.7, sy + L * 0.48], pul = [sx + o * 1.1, sy + L * 0.84], hm = [sx + o * 1.25, sy + L];
  const M = C.manga;
  let s = '';
  if (M.comp !== 'longa') s += forma(capsula(cot[0], cot[1] - 2, r * 0.82, pul[0], pul[1], r * 0.66), C.pele, { w: 1.7, s: 1.6, l: 1 });
  const fim = M.comp === 'longa' ? pul : cot;
  const dm = capsula(sx, sy, r, fim[0], fim[1], M.comp === 'longa' ? r * 0.74 : r * 0.88);
  const cc = M.cc ?? contorno(M.cor);
  if (M.padrao) {
    const pid = uid('p');
    s += comp(dm, `<defs>${M.padrao(pid)}</defs><path d="${dm}" fill="url(#${pid})"/>`, { cc, w: W, s: 2.4, l: 1.4 });
  } else s += forma(dm, M.cor, { cc, s: 2.4, l: 1.4 });
  const dob = mistura(M.cor, '#1a1420', 0.45);
  s += traco(`M${cot[0] - r * 0.6},${cot[1] - 3.4} q${r * 0.5},1 ${r * 1.1},0`, dob, 0.9, 0.6);
  if (M.comp === 'longa') s += traco(`M${cot[0] - r * 0.5},${cot[1] + 1.5} q${r * 0.4},-0.9 ${r * 0.9},0.2`, dob, 0.8, 0.55) + traco(`M${cot[0] + r * 0.1},${cot[1] - 0.6} l${r * 0.5},0.8`, dob, 0.7, 0.5);
  if (M.punho) s += forma(elipse(fim[0], fim[1], (M.comp === 'longa' ? r * 0.8 : r * 0.92), 1.7), M.punho, { w: 1.4, s: 0.8, l: 0.6 });
  if (M.extra) s += M.extra({ sx, sy, cot, pul, hm, r, dir, sg, tras, lado });
  s += mao(C, hm[0], hm[1], dir, sg);
  if (tras) s = escuro(s);
  return { svg: s, jx: sx, jy: sy, mao: hm };
}

const KS = 0.78; // pé menor que o do estilo chibi
function sapato(C, dir, px, sg) {
  const S = C.sapato, cor = S.cor;
  const P = (x, y) => [px + x * KS, y * KS];
  let s = '';
  if (S.cano) {
    const dc = retRed(px - C.pernaW * 0.42, -S.cano - 4, C.pernaW * 0.84, S.cano + 2, 1.6);
    s += forma(dc, cor, { s: 1.6, l: 1 });
    if (S.cadarco) for (let i = 0; i < 3; i++) s += traco(`M${px - 1.6},${-S.cano - 2.6 + i * 1.8} l3.2,0`, S.cadarco, 0.7);
  }
  let pe;
  if (dir === 'lado') pe = blob([P(-5.5, -8), P(2, -8.5), P(4.5, -5.5), P(9.5, -3.8), P(10, -0.6), P(7.5, 0.6 / KS), P(-5.5, 0.6 / KS), P(-6.6, -3)]);
  else if (dir === 'baixo') pe = blob([P(-6 + sg * 0.6, -6.8), P(sg * 0.6, -8.2), P(6 + sg * 0.6, -6.8), P(6.8 + sg * 0.8, -2), P(4.8 + sg, 0.6 / KS), P(-4.8 + sg, 0.6 / KS), P(-6.8 + sg * 0.8, -2)]);
  else pe = blob([P(-5.8, -7.8), P(0, -8.6), P(5.8, -7.8), P(6.4, -2), P(4.3, 0.6 / KS), P(-4.3, 0.6 / KS), P(-6.4, -2)]);
  s += forma(pe, cor, { s: 1.8, l: 1 });
  s += recorta(pe, `<rect x="${px - 12}" y="-1.5" width="26" height="4" fill="${S.sola}"/>` + traco(`M${px - 12},-1.5 L${px + 14},-1.5`, contorno(S.sola), 0.7));
  if (S.faixa) s += recorta(pe, traco(dir === 'lado' ? `M${px - 2.5},-5 Q${px + 1.5},-2.4 ${px + 5.5},-2.6` : `M${px - 4},-3.6 Q${px},-4.8 ${px + 4},-3.6`, S.faixa, 1.1));
  if (S.poeira) s += poeira(pe, px - 8, -7, 16, 6, Math.round(px * 3 + 7), '#b0a080', 0.3);
  s += `<path d="${pe}" fill="none" stroke="${contorno(cor)}" stroke-width="${W}"/>`;
  return s;
}

function perna(C, dir, lado) {
  const sg = sinal(dir, lado);
  const tras = dir === 'lado' && lado === 'e';
  const px = dir === 'lado' ? (tras ? -2.2 : 1.8) : sg * C.quadX, py = C.hipY;
  const w = C.pernaW / 2, an = -(C.sapato.cano ?? 3) - 3, jy = (py + an) / 2 + 1;
  const d = `M${px - w},${py} A${w},${w} 0 0 1 ${px + w},${py} L${px + w * 0.92},${jy} L${px + w * 0.8},${an} Q${px},${an + 1.4} ${px - w * 0.8},${an} L${px - w * 0.92},${jy} Z`;
  let s = forma(d, C.calca, { s: 2.2, l: 1.2 });
  const dob = mistura(C.calca, '#14101c', 0.45);
  s += traco(`M${px - w * 0.55},${jy} q${w * 0.5},0.9 ${w * 1.05},-0.3`, dob, 0.9, 0.6) + traco(`M${px - w * 0.3},${jy + 2} q${w * 0.3},0.6 ${w * 0.7},0`, dob, 0.7, 0.45);
  s += traco(`M${px + w * 0.2},${py + 3} q0.6,4 0.2,8`, dob, 0.7, 0.4);
  if (C.costura) s += traco(`M${px + (dir === 'lado' ? -w * 0.5 : sg * w * 0.55)},${py} L${px + (dir === 'lado' ? -w * 0.45 : sg * w * 0.5)},${an + 1}`, C.costura, 0.6, 0.6);
  if (C.barra) s += forma(retRed(px - w * 0.85, an - 2, w * 1.7, 2.8, 1.2), C.barra, { w: 1.3, s: 0.8, l: 0.6 });
  if (C.bolsoCargo && dir !== 'baixo') s += forma(retRed(px - 2.6, py + 4, 5.2, 5.4, 1), mistura(C.calca, '#ffffff', 0.06), { w: 1.1, s: 0.8, l: 0.5 });
  if (C.pernaExtra) s += C.pernaExtra({ px, py, w, jy, an, dir, lado, sg, d });
  s += poeira(d, px - w, an - 7, 2 * w, 7, Math.round(px * 5 + 11), C.poeiraCor ?? '#a89878', 0.22);
  s += sapato(C, dir, px, dir === 'lado' ? 1 : sg);
  if (tras) s = escuro(s);
  return { svg: s, jx: px, jy: py };
}

// ======================= PEÃO BRABO =======================
const PEAO = {
  nome: 'peao', hipY: -36.5, quadX: 5.2, pernaW: 8.8, ombroY: -58.5, ombroX: 14.2, neckY: -61, cabYn: -73.3, rx: 15.6, ry: 15, cranio: 'quadrado', nariz: 3.6, queixo: 1, rosto: rostoPeao,
  Ws: 15, Wq: 11.6, T: 9, bracoR: 4.7, maoR: 3.5, bracoL: 26,
  pele: '#c99470', calca: '#46607e', costura: '#a89262', barra: '#5a7392',
  sapato: { cor: '#6a4428', sola: '#2e1e14', cano: 7, poeira: true },
  manga: { comp: 'curta', cor: '#86393a', cc: '#2a0e10', padrao: (pid) => XADREZ_P(pid), punho: '#a8504a' },
  pernaExtra: ({ px, jy, w, dir, lado }) => (dir !== 'cima' && lado === 'd' ? remendo(px - w * 0.6, jy - 2.4, w * 1.1, 4, '#6a5a44', -6) : ''),
};
PELES.add(PEAO.pele);
const XADREZ_P = (pid) => xadrez(pid, '#86393a', '#3c181c', '#bc9a8a', 5.6);
const COURO = '#4a3020', LATAO = '#b8964e', BIGODE = '#3e2a1e';

function fivela(x, y, rx = 5.2, ry = 3.7, txt = true) {
  let s = forma(elipse(x, y, rx, ry), LATAO, { cc: '#3a2a10', s: 1.4, l: 0.9, w: 1.4 });
  s += `<ellipse cx="${x}" cy="${y}" rx="${rx - 1.2}" ry="${ry - 1}" fill="none" stroke="#7a6230" stroke-width="0.5"/>`;
  if (txt) s += `<text x="${x}" y="${y + 0.8}" font-family="Arial, sans-serif" font-weight="700" font-size="2.2" text-anchor="middle" fill="#4a3612" letter-spacing="0.1">TOURO</text>`;
  return s;
}
function laco(x, y, k = 0.8) {
  let s = '';
  const an = [[0, 0, 5.2, 6.2], [0.8, 0.4, 4.6, 5.6], [-0.6, 0.6, 4.4, 5.4]];
  for (const [dx, dy, rx, ry] of an) s += `<ellipse cx="${x + dx * k}" cy="${y + dy * k}" rx="${rx * k}" ry="${ry * k}" fill="none" stroke="#2e2010" stroke-width="2.8"/>`;
  for (const [dx, dy, rx, ry] of an) s += `<ellipse cx="${x + dx * k}" cy="${y + dy * k}" rx="${rx * k}" ry="${ry * k}" fill="none" stroke="#a88a5c" stroke-width="1.5"/><ellipse cx="${x + dx * k}" cy="${y + dy * k}" rx="${rx * k}" ry="${ry * k}" fill="none" stroke="#6a5230" stroke-width="1.5" stroke-dasharray="0.8 0.9" opacity=".7"/>`;
  s += traco(`M${x + 1},${y + 6 * k} q1,3 -0.5,5`, '#2e2010', 2.6) + traco(`M${x + 1},${y + 6 * k} q1,3 -0.5,5`, '#a88a5c', 1.3);
  return s;
}
// bolso da camisa estufado de recibos
function bolsoRecibos(x, y, w = 6, h = 5.4) {
  let s = '';
  for (const [dx, a, c] of [[0.8, -12, '#e8e2d2'], [2.6, 8, '#d8d4c4'], [4, -4, '#efe6cc']]) s += `<g transform="rotate(${a} ${x + dx} ${y})"><rect x="${x + dx - 1}" y="${y - 3.4}" width="2.4" height="4.4" fill="${c}" stroke="#4a4030" stroke-width="0.4"/><path d="M${x + dx - 0.6},${y - 2.6} h1.6 M${x + dx - 0.6},${y - 1.8} h1.2" stroke="#8a8270" stroke-width="0.3"/></g>`;
  s += `<path d="M${x},${y} h${w} v${h - 1} q${-w / 2},1.4 ${-w},0 Z" fill="#8e3430" stroke="#2a0e10" stroke-width="0.7"/>`;
  s += traco(`M${x + 0.3},${y + 1} h${w - 0.6}`, '#c88070', 0.4, 0.7);
  return s;
}
function peaoTronco(C, dir) {
  const d = formaTronco(C, dir), sy = C.ombroY, hy = C.hipY, pid = uid('xz');
  let i = `<defs>${XADREZ_P(pid)}</defs><path d="${d}" fill="url(#${pid})"/>`;
  const dob = '#2a0a0e', cc = '#2a0e10';
  let fora = '';
  const calca = () => `<rect x="-22" y="${hy - 2}" width="44" height="12" fill="${C.calca}"/>`;
  const cinto = () => forma(retRed(-22, hy - 6, 44, 4.4, 0.8), COURO, { s: 1.2, l: 0.8, w: 1.3 }) + `<path d="M-20,${hy - 3.8} L20,${hy - 3.8}" stroke="#8a6a48" stroke-width="0.4" stroke-dasharray="0.9 0.9" opacity=".7"/>`;
  if (dir === 'baixo') {
    i += forma(`M-4.4,${sy - 6.5} Q-2.4,${sy + 2} 0,${sy + 6.5} Q2.4,${sy + 2} 4.4,${sy - 6.5} Z`, C.pele, { s: 1.4, l: 0.8, w: 1.3, cc: '#3a1a10' });
    for (const [x, y] of [[-1, sy + 1], [1, sy + 2.4], [0, sy - 1]]) i += traco(`M${x},${y} q0.5,-0.6 0,-1.2`, BIGODE, 0.6, 0.8);
    i += forma(`M-8,${sy - 5.6} L-4.4,${sy - 6.8} L-1,${sy + 4.6} L-4.8,${sy + 1.4} Z`, '#a84440', { s: 1, l: 0.6, w: 1.2, cc });
    i += forma(`M8,${sy - 5.6} L4.4,${sy - 6.8} L1,${sy + 4.6} L4.8,${sy + 1.4} Z`, '#a84440', { s: 1, l: 0.6, w: 1.2, cc });
    for (const y of [sy + 8.5, sy + 12.5, sy + 16.5]) i += `<circle cx="0.2" cy="${y}" r="0.6" fill="#d8ccb4" stroke="${cc}" stroke-width="0.4"/>`;
    i += traco(`M0,${sy + 6.5} L0.2,${hy - 6}`, cc, 0.7, 0.6);
    i += traco(`M-10,${hy - 9} q3.5,1.6 7,0.8`, dob, 0.9, 0.5) + traco(`M10,${hy - 9.5} q-3.5,1.8 -7,0.6`, dob, 0.9, 0.5) + traco(`M-6,${sy + 4} q-1,5 0,9`, dob, 0.8, 0.4);
    i += bolsoRecibos(3.4, sy + 1.6);
    i += calca() + traco(`M1,${hy - 2} q0,3.4 -1.8,5`, '#2a3a50', 0.8);
    i += cinto();
    i += poeira(d, -12, hy - 2, 24, 8, 4, '#b0a080', 0.25);
    fora += fivela(0, hy - 3.8) + laco(-C.Ws + 0.4, hy - 0.5);
  } else if (dir === 'cima') {
    i += traco(`M-12,${sy + 1.5} Q0,${sy + 5} 12,${sy + 1.5}`, cc, 0.9, 0.7);
    i += traco(`M-5,${sy + 12} q5,2.4 10,0`, dob, 0.9, 0.45) + traco(`M-9,${hy - 9} q4,1.6 8,0.8`, dob, 0.9, 0.45);
    // adesivo antigo descascando e desbotado (ficou da época do rodeio)
    i += `<g transform="rotate(-6 0 ${sy + 9})" opacity=".82"><path d="M-8,${sy + 6} h16 v5.2 h-13.6 l-2.4,-2 Z" fill="#d8d0bc" stroke="#4a3a2a" stroke-width="0.5"/><path d="M-8,${sy + 9.2} l2.4,2 v-2.8 Z" fill="#b0a68e" stroke="#4a3a2a" stroke-width="0.35"/>` +
      `<text x="0.6" y="${sy + 9.6}" font-family="Arial, sans-serif" font-weight="700" font-size="2.2" text-anchor="middle" fill="#7a2a24" textLength="13.6" lengthAdjust="spacingAndGlyphs">100% MACHO</text></g>`;
    i += calca();
    for (const k of [-1, 1]) i += forma(retRed(k * 5 - 3, hy - 0.5, 6, 5, 1.2), '#3e5674', { w: 1, s: 0.8, l: 0.5 }) + traco(`M${k * 5 - 2.2},${hy + 0.8} l4.4,0`, C.costura, 0.5, 0.7);
    i += remendo(3.2, sy + 13, 5, 4.4, '#7a5a3e', 8, cc);
    i += cinto();
    i += poeira(d, -12, hy - 2, 24, 8, 6, '#b0a080', 0.25);
    fora += laco(C.Ws - 0.4, hy - 0.5);
  } else {
    const T = C.T;
    i += forma(`M${T - 3},${sy - 6} Q${T - 0.6},${sy + 1} ${T + 1.4},${sy + 6} L${T + 2.6},${sy - 6} Z`, C.pele, { s: 1.2, l: 0.8, w: 1.2, cc: '#3a1a10' });
    i += forma(`M${T - 5},${sy - 6.5} L${T - 2},${sy - 6} L${T + 0.4},${sy + 5} L${T - 3},${sy + 1.4} Z`, '#a84440', { s: 0.8, l: 0.6, w: 1.1, cc });
    i += traco(`M${T - 7},${hy - 9} q2.6,1.6 5,0.4`, dob, 0.9, 0.5) + traco(`M-3,${sy + 3} q-1.6,5 -0.8,9`, dob, 0.8, 0.4);
    i += bolsoRecibos(T - 6, sy + 1.6, 4.6, 5);
    i += calca();
    i += forma(retRed(-T - 1.6, hy - 0.5, 5.4, 5, 1.2), '#3e5674', { w: 1, s: 0.8, l: 0.5 });
    i += cinto();
    i += poeira(d, -8, hy - 2, 16, 8, 8, '#b0a080', 0.25);
    fora += fivela(T + 0.2, hy - 3.8, 2.2, 3.8, false) + laco(-0.6, hy - 0.5);
  }
  return comp(d, i, { cc, s: 3.6, l: 2 }) + fora;
}

function chapeuPeao(dir, by) {
  const COR = '#6e5236', cc = '#22160c';
  let aba, copa;
  if (dir === 'lado') {
    aba = blob([[-25, by + 2.5], [-27, by - 2], [-16, by + 0.6], [0, by + 1.2], [17, by + 0.2], [27, by - 3], [28.5, by + 1.5], [19, by + 4.4], [0, by + 5], [-17, by + 4.6]]);
    copa = blob([[-12, by + 1], [-13, by - 7], [-10, by - 13.5], [-3, by - 16], [5, by - 15.4], [10.5, by - 11.5], [12.5, by - 6], [12, by + 1]]);
  } else {
    aba = blob([[-28, by + 1.5], [-26.5, by - 3.4], [-19, by - 1.2], [-10, by + 0.3], [0, by + 0.8], [10, by + 0.3], [19, by - 1.2], [26.5, by - 3.4], [28, by + 1.5], [21, by + 4.6], [10, by + 6], [0, by + 6.4], [-10, by + 6], [-21, by + 4.6]]);
    copa = blob([[-13, by + 1], [-14, by - 6], [-12, by - 12.5], [-7, by - 16.2], [-2, by - 14.8], [0, by - 13.8], [2, by - 14.8], [7, by - 16.2], [12, by - 12.5], [14, by - 6], [13, by + 1]]);
  }
  let s = forma(aba, COR, { cc, s: 2.6, l: 1.6 });
  s += traco(dir === 'lado' ? `M-22,${by + 2.6} Q0,${by + 3.6} 24,${by + 0.8}` : `M-24,${by + 1.2} Q0,${by + 5} 24,${by + 1.2}`, mistura(COR, '#e8d4b4', 0.3), 0.8, 0.6);
  let ci = `<path d="${copa}" fill="${COR}"/>`;
  ci += traco(dir === 'lado' ? `M-4,${by - 14.5} q-2,6 -1,12` : `M-6,${by - 13.5} q-1.5,6 -0.5,12 M6,${by - 13.5} q1.5,6 0.5,12`, mistura(COR, '#1a1008', 0.4), 1, 0.6);
  ci += `<rect x="-20" y="${by - 4.6}" width="40" height="4" fill="#3a2614"/><rect x="-20" y="${by - 4.6}" width="40" height="0.7" fill="#5a4028"/>`;
  const tachas = dir === 'lado' ? [-8, 0, 8] : [-9, 9];
  for (const x of tachas) ci += `<circle cx="${x}" cy="${by - 2.6}" r="0.9" fill="${LATAO}" stroke="#3a2a10" stroke-width="0.4"/>`;
  // suor e poeira na copa
  ci += `<path d="M-14,${by - 5.2} Q0,${by - 7.6} 14,${by - 5.2} L14,${by - 4.4} L-14,${by - 4.4}Z" fill="#2a1a0c" opacity=".25"/>`;
  ci += poeira(copa, -12, by - 16, 24, 10, 12, '#c8b490', 0.18);
  s += comp(copa, ci, { cc, w: W, s: 2, l: 1.3 });
  if (dir === 'baixo') s += forma(elipse(0, by - 2.6, 1.9, 1.6), LATAO, { cc: '#3a2a10', w: 0.9, s: 0.6, l: 0.4 });
  if (dir !== 'lado') {
    const clip = dir === 'baixo' ? `M-40,${by + 0.6} Q0,${by + 4.6} 40,${by + 0.6} L40,${by + 20} L-40,${by + 20}Z` : `M-40,${by + 1.5} Q0,${by + 3.4} 40,${by + 1.5} L40,${by + 20} L-40,${by + 20}Z`;
    s += recorta(clip, forma(aba, COR, { cc, s: 2.6, l: 1.6 }));
    s += traco(dir === 'baixo' ? `M-13,${by + 2.5} Q0,${by + 4.3} 13,${by + 2.5}` : `M-13,${by + 2.2} Q0,${by + 3.2} 13,${by + 2.2}`, cc, 1, 0.7);
    // beirada da aba gasta
    s += traco(`M17,${by + 4.4} l3,-0.8 M-20,${by + 4} l2.4,0.6`, mistura(COR, '#e8d4b4', 0.35), 0.6, 0.6);
  }
  return s;
}

// a cabeça é desenhada em volta de (0,0) e reduzida por K_CAB na montagem
function peaoCabeca(C, dir) {
  const rx = C.rx, ry = C.ry, by = -12.6;
  const ccP = '#3a1a10', cab = formaCabeca(C, dir);
  let s = '';
  const sob = { iris: '#4a3420', sob: BIGODE, sobW: 2.3, olheira: 0.5, cc: '#1e1210' };
  if (dir === 'baixo') {
    s += forma(elipse(0, -2, rx + 1, ry * 0.86), BIGODE, { s: 1.6, l: 0.8 });
    for (const k of [-1, 1]) s += orelha(C, k * (rx + 0.2));
    s += forma(cab, C.pele, { cc: ccP, s: 1.3, l: 1, cs: mistura(C.pele, '#6a3a44', 0.15), w: 1.8 });
    s += barba(C, cab, 4.5);
    for (const k of [-1, 1]) s += forma(blob([[k * (rx - 0.4), -7], [k * (rx - 3.8), -6], [k * (rx - 3.4), 4], [k * (rx - 1.4), 6], [k * (rx + 0.2), 0]]), BIGODE, { w: 1.2, s: 0.8, l: 0.5 });
    s += rosto(C, dir, { ...sob, boca: traco(`M-3,11.8 Q0,12.3 3,11.8`, '#3a1812', 1.1) });
    const big = blob([[0, 9], [3.6, 8.3], [7.4, 9], [9.2, 11.6], [7.8, 12.2], [4.4, 11.2], [0, 10.8], [-4.4, 11.2], [-7.8, 12.2], [-9.2, 11.6], [-7.4, 9], [-3.6, 8.3]]);
    s += forma(big, BIGODE, { s: 1.4, l: 0.8, w: 1.5 });
    for (const k of [-1, 1]) s += traco(`M${k * 1.6},8.4 q${k * 3},0.2 ${k * 6.2},1.6`, mistura(BIGODE, '#c8a888', 0.3), 0.6, 0.6);
    s += chapeuPeao(dir, by);
  } else if (dir === 'cima') {
    for (const k of [-1, 1]) s += orelha(C, k * (rx + 0.2));
    s += forma(cab, BIGODE, { s: 2.8, l: 1.4 });
    for (let x = -10; x <= 10; x += 4) s += traco(`M${x},-3 q1,5 ${x * 0.1},${10 - Math.abs(x) * 0.3}`, mistura(BIGODE, '#000', 0.35), 0.9, 0.6);
    s += recorta(cab, `<path d="M-6,${ry} Q0,${ry - 4} 6,${ry} Z" fill="${C.pele}"/>`);
    s += chapeuPeao(dir, by);
  } else {
    s += forma(cab, C.pele, { cc: ccP, s: 1.3, l: 1, cs: mistura(C.pele, '#6a3a44', 0.15), w: 1.8 });
    s += barba(C, cab, 4.5);
    s += recorta(cab, forma(blob([[-rx - 3, 9], [-rx - 3, -12], [0, -16], [2, -8], [-1, -3], [-3, 4], [-6, 11]]), BIGODE, { s: 1.6, l: 0.8, w: 1.3 }));
    s += forma(blob([[1, -7], [3.4, -7], [3, 4], [0.6, 6]]), BIGODE, { w: 1.1, s: 0.6, l: 0.4 });
    s += orelha(C, -2.4);
    s += rosto(C, dir, { ...sob, bocaLado: traco(`M${rx - 4.6},12 L${rx - 0.8},11.6`, '#3a1812', 1.1) });
    s += forma(blob([[rx - 6.4, 8.4], [rx - 0.6, 7.6], [rx + 2.4, 9], [rx + 2, 11.4], [rx - 2, 10.6], [rx - 6.6, 10.6]]), BIGODE, { s: 1.2, l: 0.8, w: 1.4 });
    s += chapeuPeao(dir, by);
  }
  return s;
}

// ======================= IDOL =======================
const LILAS = '#9c8fae', LILAS_S = '#5e5272', LILAS_C = '#c8bfd4';
const VINHO = '#5c2638', PRATA = '#a6a9b2';
const prataPadrao = (pid) => `<linearGradient id="${pid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c6c8ce"/><stop offset="0.5" stop-color="#a9acb5"/><stop offset="1" stop-color="#868a95"/></linearGradient>`;
const IDOL = {
  nome: 'idol', hipY: -40, quadX: 4.6, pernaW: 7.8, ombroY: -63, ombroX: 11, neckY: -66, cabYn: -78, rx: 12.8, ry: 15.6, cranio: 'fino', nariz: 1.6, rosto: rostoIdol,
  Ws: 11.6, Wq: 10, T: 7.4, bracoR: 3.8, maoR: 3.1, bracoL: 26.5,
  pele: '#d8b49a', calca: '#2c2a32', poeiraCor: '#8a8478',
  sapato: { cor: '#d6d2cb', sola: '#4a2a36', faixa: VINHO, poeira: true },
  manga: { comp: 'longa', cor: PRATA, cc: '#2a2c36', padrao: prataPadrao, punho: '#6e6a78', extra: ({ cot, r, dir, lado }) => (dir !== 'cima' && lado === 'e' ? remendo(cot[0] - r * 0.6, cot[1] - 1.8, r * 1.2, 3.4, '#6e7280', 10, '#2a2c36') : '') },
  pernaExtra: ({ px, jy, w, dir, lado }) => (dir === 'baixo' && lado === 'e' ? `<path d="M${px - w * 0.5},${jy - 1.2} q${w * 0.5},-0.8 ${w},0 q${-w * 0.4},1.6 ${-w},0Z" fill="#d8b49a" stroke="#1a1820" stroke-width="0.5"/>` + traco(`M${px - w * 0.55},${jy - 1.1} l0.5,0.5 M${px + w * 0.4},${jy - 1} l0.4,0.6`, '#8a8692', 0.4) : ''),
};
PELES.add(IDOL.pele);
function idolTronco(C, dir) {
  const d = formaTronco(C, dir), sy = C.ombroY, hy = C.hipY, pid = uid('pr');
  let i = `<defs>${prataPadrao(pid)}</defs><path d="${d}" fill="url(#${pid})"/>`;
  const cc = '#22242c';
  const calca = () => `<rect x="-20" y="${hy - 4}" width="40" height="14" fill="${C.calca}"/>` + forma(retRed(-20, hy - 4.4, 40, 2, 0.8), '#1c1a20', { w: 0.9, s: 0.6, l: 0.4 });
  if (dir === 'baixo') {
    i += forma(blob([[-3.6, sy - 6], [3.6, sy - 6], [3.8, hy - 4], [-3.8, hy - 4]], 0.6), VINHO, { w: 1.2, s: 1.6, l: 1, cc: '#1e0a12' });
    i += forma(`M-3.4,${sy - 6.5} Q0,${sy + 0.5} 3.4,${sy - 6.5} Z`, C.pele, { w: 1, s: 0.8, l: 0, cc: '#4a2a20' });
    for (const k of [-1, 1]) i += forma(`M${k * 3.2},${sy - 6.5} L${k * 9.4},${sy - 5} L${k * 7.4},${sy + 7} L${k * 4},${sy + 2}Z`, '#b8bbc3', { w: 1.1, s: 0.8, l: 0.5, cc });
    i += traco(`M-4,${sy + 2} L-4.2,${hy - 4} M4,${sy + 2} L4.2,${hy - 4}`, '#4e525e', 0.7);
    i += traco(`M-9,${hy - 9} q2.6,1.4 4.4,0.5 M9,${hy - 9} q-2.6,1.4 -4.4,0.5`, '#4e525e', 0.8, 0.6) + traco(`M-7,${sy + 4} q-0.8,4 0,8`, '#4e525e', 0.7, 0.45);
    i += `<circle cx="7.2" cy="${sy + 10}" r="1.2" fill="#8a6a80" stroke="${cc}" stroke-width="0.5"/>`; // botton de fã-clube gasto
    i += calca();
  } else if (dir === 'cima') {
    i += calca();
    i += traco(`M-6,${sy + 8} q6,2 12,0`, '#4e525e', 0.8, 0.6) + traco(`M0,${sy - 5} L0,${hy - 4}`, '#4e525e', 0.6, 0.5);
    i += remendo(-8, sy + 12, 5, 4, '#7a7e8a', -8, cc);
  } else {
    const T = C.T;
    i += forma(blob([[T - 2.6, sy - 6], [T + 2.6, sy - 6], [T + 2.6, hy - 4], [T - 2.2, hy - 4]], 0.6), VINHO, { w: 1.1, s: 1.2, l: 0.8, cc: '#1e0a12' });
    i += forma(`M${T - 4.6},${sy - 6.5} L${T - 1},${sy - 5.5} L${T - 1.4},${sy + 7} L${T - 3.2},${sy + 2.6}Z`, '#b8bbc3', { w: 1, s: 0.8, l: 0.5, cc });
    i += calca();
    i += traco(`M-4,${sy + 2} q-1.4,5 0,10`, '#4e525e', 0.8, 0.5);
  }
  return comp(d, i, { cc, s: 3.4, l: 2 });
}
function franjaIdol(C, dir) {
  const rx = C.rx, ry = C.ry;
  if (dir === 'lado') return blob([[-rx - 2.5, 13], [-rx - 3, -5], [-9, -ry - 3], [3, -ry - 3.3], [rx + 0.6, -8.5], [rx + 1.4, -4.2], [rx - 3, -3.6], [6, -4.4], [2, -4.4], [0, 1], [-0.5, 10], [-2.5, ry + 1.5], [-7, ry + 2]], 0.9);
  return blob([[-rx - 2.4, 5], [-rx - 2.8, -6], [-rx + 1, -ry + 0.5], [-6, -ry - 3.2], [6, -ry - 3.2], [rx - 1, -ry + 0.5], [rx + 2.8, -6], [rx + 2.4, 5], [rx - 1.6, -1.4], [rx - 3.4, -4.2], [5, -5], [-5, -5], [-rx + 3.4, -4.2], [-rx + 1.6, -1.4]], 0.85);
}
const cabeloIdol = (d, extra = '') => comp(d, `<path d="${d}" fill="${LILAS}"/>${extra}`, { cc: '#2c2438', s: 2.4, l: 1.6, op: 0.2, opl: 0.12, w: 1.6 });
const anelIdol = (x0, x1, y) => `<path d="M${x0},${y + 1} Q${(x0 + x1) / 2},${y - 2.6} ${x1},${y + 1} Q${(x0 + x1) / 2},${y - 0.4} ${x0},${y + 1}Z" fill="${LILAS_C}" opacity=".45"/>`;
// fita prateada remendando o arco do headset
const fita = (x, y, a) => `<g transform="rotate(${a} ${x} ${y})"><rect x="${x - 1.6}" y="${y - 1.4}" width="3.2" height="2.8" fill="#a8a69e" stroke="#3a3830" stroke-width="0.4"/><path d="M${x - 1.6},${y - 0.3} h3.2" stroke="#d0cec4" stroke-width="0.4"/></g>`;
function idolCabeca(C, dir) {
  const rx = C.rx, ry = C.ry, ccP = '#4a2a20', cab = formaCabeca(C, dir);
  const HS = '#26252c';
  let s = '', em = '';
  const rost = { iris: '#4e4458', sob: LILAS_S, sobW: 1.5, olheira: 0.5, delineado: true, cc: '#1a1218' };
  if (dir === 'baixo') {
    s += forma(cab, C.pele, { cc: ccP, s: 1.3, l: 1, cs: mistura(C.pele, '#6a3a44', 0.15), w: 1.8 });
    s += rosto(C, dir, { ...rost, boca: `<path d="M-2.8,10.8 Q0,11.6 2.8,10.8 Q1.4,12.6 0,12.6 Q-1.4,12.6 -2.8,10.8Z" fill="#8a4a52" stroke="#3a1a1e" stroke-width="0.6"/>` });
    let ex = '';
    for (const x of [-9, -4.5, 0, 4.5, 9]) ex += traco(`M${x},-9 L${x + 0.3},-4.6`, LILAS_S, 0.8, 0.6);
    ex += anelIdol(-10, 10, -ry + 1.6);
    s += cabeloIdol(franjaIdol(C, dir), ex);
    for (const k of [-1, 1]) {
      const m = blob([[k * (rx - 2.2), -4], [k * (rx + 2.4), -3], [k * (rx + 1.8), 8], [k * (rx - 0.6), 15], [k * (rx - 2.8), 6]]);
      s += cabeloIdol(m, traco(`M${k * rx},-2 q${k * 0.6},6 ${-k * 0.4},12`, LILAS_C, 0.7, 0.55));
    }
    s += traco(`M${-rx - 1.4},-1 Q${-rx},${-ry - 4.4} 0,${-ry - 4.8} Q${rx},${-ry - 4.4} ${rx + 1.4},-1`, HS, 2.3);
    s += fita(-rx + 3.2, -ry - 1.6, -38);
    for (const k of [-1, 1]) s += forma(elipse(k * (rx + 1.6), 0.5, 2.6, 3.8), HS, { w: 1.3, s: 1, l: 0.6 }) + `<ellipse cx="${k * (rx + 1.6)}" cy="0.5" rx="1.2" ry="2.1" fill="#4a4652"/>`;
    s += traco(`M${-rx - 1.4},3 Q${-rx + 2},10.5 -5.4,10.6`, HS, 1.3);
    s += forma(elipse(-5, 10.6, 1.5, 1.3), HS, { w: 0.9, s: 0.5, l: 0.3 });
    em += halo(-5, 10.6, 2.4, '#c87896', 0.5) + `<circle cx="-5" cy="10.6" r="0.5" fill="#e8b8c8"/>`;
  } else if (dir === 'cima') {
    const big = blob([[-rx - 2.4, 6], [-rx - 2.8, -6], [-rx + 1, -ry + 0.5], [-6, -ry - 3.2], [6, -ry - 3.2], [rx - 1, -ry + 0.5], [rx + 2.8, -6], [rx + 2.4, 6], [0, ry + 1]], 0.85);
    let ex = anelIdol(-10, 10, -ry + 1.8);
    for (const x of [-8, -3, 2, 7]) ex += traco(`M${x},${-ry + 4} q${x * 0.08},8 ${x * 0.15},${ry + 6}`, LILAS_S, 0.8, 0.5);
    s += cabeloIdol(big, ex);
    s += traco(`M${-rx - 1.4},-1 Q${-rx},${-ry - 4.4} 0,${-ry - 4.8} Q${rx},${-ry - 4.4} ${rx + 1.4},-1`, HS, 2.3);
    s += fita(rx - 3.2, -ry - 1.6, 38);
    for (const k of [-1, 1]) s += forma(elipse(k * (rx + 1.6), 0.5, 2.6, 3.8), HS, { w: 1.3, s: 1, l: 0.6 });
  } else {
    s += forma(cab, C.pele, { cc: ccP, s: 1.3, l: 1, cs: mistura(C.pele, '#6a3a44', 0.15), w: 1.8 });
    s += rosto(C, dir, { ...rost, bocaLado: `<path d="M${rx - 4.6},10.8 Q${rx - 2},11.6 ${rx - 0.4},10.6 Q${rx - 1.6},12.4 ${rx - 3.6},11.8Z" fill="#8a4a52" stroke="#3a1a1e" stroke-width="0.6"/>` });
    let ex = anelIdol(-10, 6, -ry + 1.6);
    for (const x of [5, 9]) ex += traco(`M${x},-9 L${x + 0.6},-4.6`, LILAS_S, 0.8, 0.6);
    s += cabeloIdol(franjaIdol(C, dir), ex);
    s += traco(`M-3,-1 Q-2,${-ry - 4.4} 2,${-ry - 4.4}`, HS, 2.3);
    s += fita(-2.6, -ry + 1, 70);
    s += forma(elipse(-2.4, 1, 3, 4.2), HS, { w: 1.3, s: 1, l: 0.6 }) + `<ellipse cx="-2.4" cy="1" rx="1.4" ry="2.4" fill="#4a4652"/>`;
    s += traco(`M-1,4 Q2,11 ${rx - 6},11`, HS, 1.3);
    s += forma(elipse(rx - 5.6, 11, 1.5, 1.3), HS, { w: 0.9, s: 0.5, l: 0.3 });
    em += halo(rx - 5.6, 11, 2.4, '#c87896', 0.5) + `<circle cx="${rx - 5.6}" cy="11" r="0.5" fill="#e8b8c8"/>`;
  }
  return { svg: s, emissivo: em || undefined };
}
// cabelo de trás no espaço da cabeça; vai até a altura do meio das costas
function idolBalanco(C, dir) {
  const rx = C.rx, ry = C.ry, fundo = 46; // em u da cabeça abaixo do centro
  let d, ex = '';
  if (dir === 'lado') {
    d = blob([[2, -ry - 3], [-rx - 3.5, -6], [-rx - 5, 12], [-rx - 4, fundo - 2], [-12, fundo + 1], [-9, fundo - 2], [-5, fundo], [-3, 22], [-1, 8]], 0.9);
    for (const x of [-15, -10, -6]) ex += traco(`M${x + 2},0 q-1,14 -0.5,${fundo - 4}`, LILAS_S, 0.8, 0.5);
    ex += traco(`M-13,-4 q-2,12 -1,26`, LILAS_C, 0.9, 0.5);
    return { svg: cabeloIdol(d, ex), jx: -3, jy: -6 };
  }
  if (dir === 'cima') {
    const L = rx + 3.5;
    d = blob([[0, -4], [rx + 2.5, 2], [rx + 1.2, 13], [L, 24], [L + 0.5, fundo - 3], [L - 3, fundo + 0.5], [L - 6, fundo - 2.5], [7, fundo + 1.5], [3, fundo - 1.8], [-1, fundo + 1.8], [-5, fundo - 1.6], [-9, fundo + 1], [-L + 5, fundo - 2.2], [-L + 1.5, fundo + 0.4], [-L - 0.5, fundo - 3.5], [-L, 24], [-rx - 1.2, 13], [-rx - 2.5, 2]], 0.9);
    for (const x of [-14, -9, -4.5, 0, 4.5, 9, 14]) ex += traco(`M${x * 0.75},6 Q${x * 0.95},22 ${x * 1.02},${fundo - 2}`, LILAS_S, 0.9, 0.5);
    for (const x of [-11, 2.5]) ex += traco(`M${x},9 Q${x + 0.8},22 ${x + 0.4},${fundo - 6}`, LILAS_C, 1, 0.5);
    return { svg: cabeloIdol(d, ex), jx: 0, jy: -6 };
  }
  const L = rx + 5.5;
  d = blob([[0, -ry - 3.5], [rx + 3, -9], [L, 6], [L + 0.6, 26], [L - 1, fundo - 0.5], [L - 5, fundo - 2.5], [9, fundo + 0.5], [4.5, fundo - 2], [0, fundo + 0.5], [-4.5, fundo - 2], [-9, fundo + 0.5], [-L + 5, fundo - 2.5], [-L + 1, fundo - 0.5], [-L - 0.6, 26], [-L, 6], [-rx - 3, -9]], 0.9);
  for (const x of [-17, -11, -5, 0, 5, 11, 17]) ex += traco(`M${x * 0.8},2 q${x * 0.08},12 ${x * 0.2},${fundo - 4}`, LILAS_S, 0.8, 0.45);
  return { svg: cabeloIdol(d, ex), jx: 0, jy: -6 };
}

// ======================= BENZEDEIRA =======================
const GRIS = '#b4b2b4', VERDE = '#4a6644', OCRE = '#a88a48';
const BENZ = {
  nome: 'benzedeira', hipY: -35, quadX: 4.4, pernaW: 7.6, ombroY: -57, ombroX: 12.2, neckY: -59.5, cabYn: -70.4, rx: 14.8, ry: 14, cranio: 'redondo', nariz: 2, rosto: rostoBenz,
  Ws: 12.6, Wq: 13, T: 9, bracoR: 4, maoR: 3.3, bracoL: 24,
  pele: '#a87656', calca: '#4a3426', saia: true,
  sapato: { cor: '#4a3222', sola: '#22160e', poeira: true },
  manga: { comp: 'curta', cor: VERDE, cc: '#14240f', punho: '#cfc2a8', extra: ({ cot, r }) => franja(cot[0] - r, cot[1] + 0.8, cot[0] + r, cot[1] + 0.8) },
};
PELES.add(BENZ.pele);
function franja(x0, y0, x1, y1, n) {
  const N = n ?? Math.max(3, Math.round(Math.hypot(x1 - x0, y1 - y0) / 1.5));
  let s = '';
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    s += traco(`M${x},${y} l0,2.2`, '#4a3a18', 1.1) + traco(`M${x},${y} l0,2`, OCRE, 0.6);
  }
  return s;
}
// sacola de troca de palha trançada (com um maço de cebolinha e um pote)
function sacola(x, y, frente = true) {
  let s = '';
  if (frente) s += traco(`M${x + 1},${y - 6} Q${x + 2},${y - 9} ${x + 3.4},${y - 6.4}`, '#3c5a2c', 1.3) + traco(`M${x - 1},${y - 6} l-0.6,-4 M${x - 0.2},${y - 6} l0.2,-4.6`, '#5e8a40', 0.9);
  if (frente) s += forma(retRed(x + 1.4, y - 9, 3.2, 3.6, 0.8), '#8a8a7a', { w: 0.9, s: 0.6, l: 0.4 });
  const d = `M${x - 4.6},${y - 6} L${x + 4.6},${y - 6} L${x + 4},${y + 3} Q${x},${y + 4.4} ${x - 4},${y + 3}Z`;
  const pid = uid('tr');
  s += comp(d, `<defs><pattern id="${pid}" patternUnits="userSpaceOnUse" width="2" height="2"><rect width="2" height="2" fill="#a8905e"/><path d="M0,1 h2 M1,0 v2" stroke="#7a6438" stroke-width="0.5"/></pattern></defs><path d="${d}" fill="url(#${pid})"/>`, { cc: '#2e2412', w: 1.3, s: 1.4, l: 0.8 });
  s += traco(`M${x - 4.6},${y - 4.6} h9.2`, '#5a4826', 0.6, 0.8);
  return s;
}
function benzTronco(C, dir) {
  const sy = C.ombroY, hy = C.hipY;
  let s = '';
  const SAIA = '#5c4030';
  const saia = dir === 'lado'
    ? blob([[-9, hy - 5], [9, hy - 5], [12.5, -9], [14, -4.6], [0, -3.4], [-13, -4.6], [-12, -9]])
    : blob([[-12, hy - 5], [12, hy - 5], [15.5, -10], [17, -5], [0, -3.6], [-17, -5], [-15.5, -10]]);
  let si = `<path d="${saia}" fill="${SAIA}"/>`;
  for (const x of (dir === 'lado' ? [-6, 0, 6] : [-10, -5, 0, 5, 10])) si += traco(`M${x * 0.8},${hy - 2} q${x * 0.05},10 ${x * 0.28},${-hy - 6}`, mistura(SAIA, '#140c08', 0.45), 0.9, 0.55);
  si += `<rect x="-20" y="-7.6" width="40" height="2.4" fill="${mistura(SAIA, '#e8d8c0', 0.14)}"/>`;
  si += remendo(dir === 'lado' ? -9 : -12, -16, 4.6, 4, '#6e5a3e', 6, '#1e140c');
  si += poeira(saia, -18, -12, 36, 8, 21, '#a89878', 0.28);
  s += comp(saia, si, { cc: '#1e140c', s: 3.4, l: 1.8 });
  if (dir !== 'cima') {
    const ax = dir === 'lado' ? 5 : 0, aw = dir === 'lado' ? 5 : 8.4;
    const av = blob([[ax - aw, hy - 4], [ax + aw, hy - 4], [ax + aw + 0.8, -15], [ax, -14.2], [ax - aw - 0.8, -15]], 0.6);
    let ai = `<path d="${av}" fill="#b8ad96"/>` + `<ellipse cx="${ax + 1.6}" cy="${hy + 6}" rx="2.2" ry="1.4" fill="#8a7a5a" opacity=".3"/>` + traco(`M${ax - aw + 2},${hy + 2} q${aw - 2},0.8 ${2 * aw - 4},0`, '#9a8a6a', 0.7, 0.6);
    s += comp(av, ai, { cc: '#3a2e1c', w: 1.5, s: 1.6, l: 0.8 });
    for (let x = ax - aw; x <= ax + aw + 0.1; x += 2.1) s += `<circle cx="${x}" cy="${-14.4 - 0.1 * Math.abs(x - ax)}" r="0.9" fill="#cfc4ac" stroke="#6a5a40" stroke-width="0.4"/>`;
  }
  const d = formaTronco(C, dir);
  let i = `<path d="${d}" fill="#c9bca2"/>` + traco(`M-5,${hy - 2} q5,1.6 10,0`, '#8a7a5a', 0.8, 0.6);
  let xd;
  if (dir === 'baixo') xd = blob([[-C.Ws - 2.2, sy - 2], [-5, sy - 6.2], [5, sy - 6.2], [C.Ws + 2.2, sy - 2], [C.Ws + 1, sy + 6], [0, sy + 14], [-C.Ws - 1, sy + 6]], 0.7);
  else if (dir === 'cima') xd = blob([[-C.Ws - 2.2, sy - 2], [-5, sy - 6.2], [5, sy - 6.2], [C.Ws + 2.2, sy - 2], [C.Ws + 1, sy + 8], [0, sy + 16], [-C.Ws - 1, sy + 8]], 0.7);
  else xd = blob([[-C.T - 2.2, sy - 3], [0, sy - 6.6], [C.T + 1.4, sy - 4], [C.T + 2.6, sy + 6], [C.T - 2, sy + 10.5], [-3, sy + 13], [-C.T - 2.2, sy + 7]], 0.7);
  let xi = `<path d="${xd}" fill="${VERDE}"/>`;
  const r = rnd(dir.length * 31);
  for (let k = 0; k < 14; k++) xi += `<circle cx="${-16 + r() * 32}" cy="${sy - 6 + r() * 20}" r="0.45" fill="${OCRE}" opacity=".7"/>`;
  xi += traco(`M-6,${sy - 2} q6,5 12,0`, mistura(VERDE, '#0c140a', 0.45), 0.9, 0.55);
  xi += traco(`M-3,${sy + 4} l2,1.4 M2,${sy + 7} l-1.6,1`, mistura(VERDE, '#e8dcc0', 0.3), 0.5, 0.6); // fio puxado
  i += comp(xd, xi, { cc: '#14240f', s: 2.6, l: 1.6, w: 1.6 });
  s += comp(d, i, { cc: '#2e2618', s: 2, l: 1.3 });
  if (dir === 'baixo') s += franja(-C.Ws - 0.5, sy + 6.5, -0.5, sy + 13.6) + franja(0.5, sy + 13.6, C.Ws + 0.5, sy + 6.5);
  else if (dir === 'cima') s += franja(-C.Ws - 0.5, sy + 8.5, -0.5, sy + 15.6) + franja(0.5, sy + 15.6, C.Ws + 0.5, sy + 8.5);
  else s += franja(-C.T - 1.8, sy + 7.5, -3, sy + 12.8) + franja(-2, sy + 12.8, C.T - 2, sy + 10.2);
  if (dir === 'baixo') s += forma(elipse(0, sy - 3, 1.5, 1.3), OCRE, { cc: '#3a2a10', w: 0.8, s: 0.5, l: 0.4 });
  // alça da sacola cruzando o peito e a sacola no quadril
  if (dir === 'baixo') s += traco(`M${C.Ws - 2},${sy - 3} L${-C.Wq - 1},${hy + 1}`, '#5a4826', 1.4) + sacola(-C.Wq - 2.4, hy + 6);
  else if (dir === 'cima') s += traco(`M${-C.Ws + 2},${sy - 3} L${C.Wq + 1},${hy + 1}`, '#5a4826', 1.4) + sacola(C.Wq + 2.4, hy + 6, false);
  else s += sacola(-C.T - 1, hy + 6, true);
  return s;
}
function benzCabeca(C, dir) {
  const rx = C.rx, ry = C.ry, ccP = '#3a1a10', cab0 = formaCabeca(C, dir);
  let s = '';
  const sh = mistura(C.pele, '#4a2430', 0.45);
  const cab = (d, ex = '') => comp(d, `<path d="${d}" fill="${GRIS}"/>${ex}`, { cc: '#2e2e36', s: 2.6, l: 1.6 });
  const rugas = (dir) => dir === 'baixo'
    ? [-1, 1].map((k) => traco(`M${k * 9.6},0.4 l${k * 1.6},-0.8 M${k * 9.6},1.8 l${k * 1.8},0 M${k * 9.4},3 l${k * 1.5},0.8`, sh, 0.55, 0.65) + traco(`M${k * 2.6},7.6 Q${k * 4.6},9.6 ${k * 4},12.6`, sh, 0.7, 0.5)).join('') + traco(`M-4,-6.6 q4,-1 8,0`, sh, 0.5, 0.5)
    : traco(`M10.2,0.4 l-1.4,-0.8 M10.2,1.8 l-1.6,0`, sh, 0.55, 0.65) + traco(`M${rx - 2.6},7.6 Q${rx - 4.2},9.6 ${rx - 3.6},12.4`, sh, 0.7, 0.5);
  const rost = { iris: '#3e2a1c', sob: '#8a8890', sobW: 1.4, olheira: 0.8, palpebra: 0.2, cc: '#1e1210', corOlheira: '#4a2a2a' };
  if (dir === 'baixo') {
    s += cab(elipse(0, -ry - 2.6, 6, 5), traco(`M-3.2,${-ry - 3.6} q3.2,-2.6 6.4,0 M-3.6,${-ry - 1.4} q3.6,-2.2 7.2,0`, '#7a7880', 0.7, 0.7));
    s += traco(`M3.4,${-ry - 6.6} l3,-2.4`, '#4a3220', 1) + `<circle cx="6.6" cy="${-ry - 9}" r="0.8" fill="${OCRE}"/>`;
    const N = []; for (let k = 0; k < 14; k++) { const a = Math.PI * (0.92 + k / 13 * 1.16); N.push([a, k % 2 ? 1.06 : 1.13]); }
    s += cab(blob([[-rx - 2.6, 4], ...N.map(([a, k]) => [Math.cos(a) * rx * k, -1 + Math.sin(a) * ry * k * 0.95]), [rx + 2.6, 4], [0, 0]]));
    for (const k of [-1, 1]) s += orelha(C, k * (rx + 0.1), 2) + `<circle cx="${k * (rx + 0.4)}" cy="5.4" r="0.7" fill="${OCRE}" stroke="#3a2a10" stroke-width="0.3"/>`;
    s += forma(cab0, C.pele, { cc: ccP, s: 1.3, l: 1, cs: mistura(C.pele, '#6a3a44', 0.15), w: 1.8 });
    s += cab(blob([[-rx - 1, -1], [-rx, -8], [-8, -ry - 0.5], [0, -ry - 1.2], [8, -ry - 0.5], [rx, -8], [rx + 1, -1], [rx - 2.5, -4.6], [8, -6.4], [3.5, -4.6], [0, -6.6], [-3.5, -4.6], [-8, -6.4], [-rx + 2.5, -4.6]], 0.9), traco(`M-9,-9 q3,-2 6,0 M3,-9 q3,-2 6,0`, '#dedce0', 0.7, 0.5));
    s += rosto(C, dir, { ...rost, boca: traco(`M-3,10.8 Q0,12 3,10.8`, '#4a2018', 1.1) });
  } else {
    s += cab(elipse(-7, -ry + 0.5, 6, 5.4), traco(`M-10.4,${-ry} q3.4,-2.6 6.8,0 M-10.8,${-ry + 2.4} q3.8,-2.2 7.6,0`, '#7a7880', 0.7, 0.7));
    s += traco(`M-3.6,${-ry - 3.6} l3,-2.4`, '#4a3220', 1) + `<circle cx="-0.4" cy="${-ry - 6}" r="0.8" fill="${OCRE}"/>`;
    s += forma(cab0, C.pele, { cc: ccP, s: 1.3, l: 1, cs: mistura(C.pele, '#6a3a44', 0.15), w: 1.8 });
    s += cab(blob([[-rx - 2.4, 6], [-rx - 2.4, -6], [-6, -ry - 1], [4, -ry - 1], [rx - 1, -8], [rx, -4.6], [8, -5.6], [4, -4.4], [0, -3], [-1, 3], [-4, 7]], 0.9), traco(`M-9,-7 q4,-3 9,-1`, '#dedce0', 0.7, 0.5));
    s += orelha(C, -2, 2) + `<circle cx="-1.8" cy="5.4" r="0.7" fill="${OCRE}"/>`;
    s += rosto(C, dir, { ...rost, bocaLado: traco(`M${rx - 4.4},11 Q${rx - 2.4},11.6 ${rx - 0.8},10.8`, '#4a2018', 1.1) });
  }
  return { svg: s };
}
function ramo(hx, hy) {
  let s = '', em = '';
  s += traco(`M${hx},${hy + 1} Q${hx + 1.6},${hy - 6} ${hx + 0.4},${hy - 14}`, '#2a3e1c', 2) + traco(`M${hx},${hy + 1} Q${hx + 1.6},${hy - 6} ${hx + 0.4},${hy - 14}`, '#6a8a48', 0.9);
  const folhas = [[hx + 0.4, hy - 15.2, 0], [hx - 2.8, hy - 11.6, -50], [hx + 3.8, hy - 10.4, 50], [hx - 2.6, hy - 7, -62], [hx + 3.8, hy - 5.8, 58]];
  for (const [x, y, a] of folhas) {
    const d = `M${x},${y + 3.2} Q${x - 2.5},${y} ${x},${y - 3.5} Q${x + 2.5},${y} ${x},${y + 3.2}Z`;
    s += `<g transform="rotate(${a} ${x} ${y + 1.6})">${forma(d, '#7aa65a', { cc: '#1e3a14', w: 0.9, s: 0.8, l: 0.5 })}${traco(`M${x},${y + 2.2} L${x},${y - 2}`, '#b8d89a', 0.4, 0.7)}</g>`;
    em += `<g transform="rotate(${a} ${x} ${y + 1.6})"><path d="${d}" fill="#8ad070" opacity=".35"/></g>`;
  }
  em = halo(hx + 0.4, hy - 10, 7, '#7ad060', 0.4) + em;
  const r = rnd(7);
  for (let k = 0; k < 4; k++) { const x = hx - 5 + r() * 10, y = hy - 19 + r() * 13; em += `<circle cx="${x}" cy="${y}" r="${0.4 + r() * 0.4}" fill="#d8f0c0" opacity=".8"/>`; }
  return { svg: s, emissivo: em };
}

// ======================= PM DO CONSÓRCIO =======================
const GRAFITE = '#2e3034', REFLEXO = '#a8984e';
const PM = {
  nome: 'pm', hipY: -38, quadX: 5.4, pernaW: 9, ombroY: -61, ombroX: 14, neckY: -63.5, cabYn: -75.4, rx: 13.4, ry: 17.4, cranio: 'comprido', nariz: 2.8, queixo: 1.4, rosto: rostoPM,
  Ws: 15.4, Wq: 12, T: 9, bracoR: 4.5, maoR: 3.6, bracoL: 27,
  pele: '#9a6a4a', calca: '#2a2b30', bolsoCargo: true, poeiraCor: '#8a8478',
  sapato: { cor: '#1e1f22', sola: '#0e0e10', cano: 8, cadarco: '#4a4a52', poeira: true },
  manga: { comp: 'curta', cor: '#5e646e', cc: '#16181e', punho: '#545a64', extra: ({ sx, sy, cot, r, dir }) => (dir === 'cima' ? '' : forma(retRed(cot[0] - r * 0.55, cot[1] - 7.5, r * 1.1, 2.4, 0.6), REFLEXO, { w: 0.8, s: 0.5, l: 0.3, cc: '#3a3410' })) +
    // ombreira do colete: deixa a silhueta larga e quadrada
    forma(blob([[sx - r * 1.25, sy + 1.5], [sx - r * 1.1, sy - r * 0.9], [sx, sy - r * 1.3], [sx + r * 1.1, sy - r * 0.9], [sx + r * 1.25, sy + 1.5], [sx, sy + 3]], 0.8), '#2e3034', { cc: '#0c0c0e', s: 1.4, l: 1 }) },
};
PELES.add(PM.pele);
function qr(x, y, m = 0.85) {
  const r = rnd(42), N = 9;
  let s = `<rect x="${x - 0.8}" y="${y - 0.8}" width="${N * m + 1.6}" height="${N * m + 1.6}" rx="0.5" fill="#c8cacc" stroke="#111" stroke-width="0.4"/>`;
  const fin = (i, j) => (i < 3 && j < 3) || (i > 5 && j < 3) || (i < 3 && j > 5);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    let on;
    if (fin(i, j)) { const a = i % 6, b = j % 6; on = a === 0 || a === 2 || b === 0 || b === 2 || (a === 1 && b === 1); } else on = r() > 0.5;
    if (on) s += `<rect x="${x + i * m}" y="${y + j * m}" width="${m + 0.05}" height="${m + 0.05}" fill="#1a1a1c"/>`;
  }
  return s;
}
// bateria extra presa no colete (2 de 4 barrinhas)
function bateria(x, y, w = 4.6, h = 6.4) {
  let s = forma(retRed(x, y, w, h, 0.8), '#3c4044', { w: 1, s: 0.6, l: 0.4, cc: '#0c0c0e' }) + `<rect x="${x + w / 2 - 1}" y="${y - 0.9}" width="2" height="1" fill="#3c4044" stroke="#0c0c0e" stroke-width="0.4"/>`;
  for (let k = 0; k < 4; k++) s += `<rect x="${x + 1}" y="${y + h - 1.6 - k * 1.3}" width="${w - 2}" height="0.9" fill="${k < 2 ? '#6a9a5a' : '#24282a'}"/>`;
  return s;
}
function pmTronco(C, dir) {
  const d = formaTronco(C, dir), sy = C.ombroY, hy = C.hipY;
  let i = `<path d="${d}" fill="#5e646e"/>`;
  const cc = '#101114';
  let colete;
  if (dir === 'lado') colete = blob([[-C.T + 0.5, sy - 2], [-2, sy - 4.5], [4, sy - 4], [C.T + 1.2, sy + 4], [C.T + 0.5, hy - 2], [-C.T + 0.2, hy - 2]], 0.6);
  else colete = blob([[-C.Ws + 2.6, sy - 3], [-5.6, sy - 4.5], [-3.6, sy - 1], [3.6, sy - 1], [5.6, sy - 4.5], [C.Ws - 2.6, sy - 3], [C.Ws + 0.5, sy + 6], [C.Wq + 0.5, hy - 2], [-C.Wq - 0.5, hy - 2], [-C.Ws - 0.5, sy + 6]], 0.6);
  let ci = `<path d="${colete}" fill="${GRAFITE}"/>`;
  const fy = sy + 12;
  ci += `<rect x="-24" y="${fy}" width="48" height="2.6" fill="${REFLEXO}"/><rect x="-24" y="${fy + 1}" width="48" height="0.6" fill="#d8d0a8" opacity=".55"/>`;
  ci += poeira(colete, -12, fy - 4, 24, 14, 31, '#8a8478', 0.18);
  if (dir === 'baixo') {
    ci += forma(retRed(-9.6, sy + 2.6, 6, 7, 1.2), '#383a3f', { w: 1, s: 0.8, l: 0.5, cc });
    ci += bateria(4, sy + 2.6);
    ci += forma(`M-8,${sy - 1} l2.1,-0.5 l2.1,0.5 l0,2 q-2.1,1.8 -4.2,0 Z`, '#8e7a46', { cc: '#2a2010', w: 0.7, s: 0.5, l: 0.3 });
    ci += forma(retRed(5.2, sy - 2.4, 2.6, 4.4, 0.6), '#1a1b1e', { w: 0.7, s: 0.5, l: 0.3 }) + traco(`M6.5,${sy - 2.4} l0,-3.4`, '#1a1b1e', 0.8);
    ci += traco(`M0,${sy - 1} L0,${fy}`, '#0c0c0e', 0.7, 0.7);
  } else if (dir === 'cima') {
    ci += qr(-3.8, sy + 1);
    ci += traco(`M-10,${hy - 7} q10,2 20,0`, '#0c0c0e', 0.8, 0.5);
  } else {
    ci += bateria(C.T - 5.4, sy + 2.4, 4, 6);
  }
  ci += traco(`M-10,${fy + 8} q3.4,1.4 6.8,0.4`, '#0c0c0e', 0.8, 0.5);
  i += comp(colete, ci, { cc, w: 1.6, s: 2.6, l: 1.6 });
  if (dir === 'baixo') for (const k of [-1, 1]) i += forma(`M${k * 0.8},${sy - 4} L${k * 6},${sy - 6.2} L${k * 5.2},${sy - 1.6}Z`, '#6c727c', { w: 1, s: 0.6, l: 0.4, cc: '#16181e' });
  i += `<rect x="-24" y="${hy - 2}" width="48" height="12" fill="${C.calca}"/>`;
  i += forma(retRed(-24, hy - 2.8, 48, 3.8, 0.8), '#151619', { w: 1, s: 0.8, l: 0.5 });
  if (dir === 'baixo') i += forma(retRed(-2.2, hy - 3, 4.4, 4, 0.6), '#8a8e96', { w: 0.8, s: 0.5, l: 0.3, cc: '#22242a' });
  // bolsinhos do cinto, um cheio de recibo de multa
  const bolsos = dir === 'lado' ? [-5, 2.6] : [-9, 5];
  for (const x of bolsos) i += forma(retRed(x, hy - 2.4, 3.8, 4.8, 0.8), '#2c2d32', { w: 0.9, s: 0.6, l: 0.4, cc });
  if (dir !== 'cima') i += `<rect x="${bolsos[1] + 0.6}" y="${hy - 4}" width="2.4" height="2" fill="#d4ccb4" stroke="#3a3428" stroke-width="0.3" transform="rotate(-8 ${bolsos[1] + 1.8} ${hy - 3})"/>`;
  return comp(d, i, { cc, s: 3.4, l: 1.8 });
}
function pmCabeca(C, dir) {
  const rx = C.rx, ry = C.ry, ccP = '#2a140a', cab = formaCabeca(C, dir);
  const CAB = '#1e1612', BONE = GRAFITE;
  let s = '';
  const rost = { iris: '#3a2618', sob: CAB, sobW: 2.3, olheira: 0.6, palpebra: 0.1, brava: true, cc: '#140a08', corOlheira: '#3a2228' };
  const curativo = (x, y, a) => `<g transform="rotate(${a} ${x} ${y})"><rect x="${x - 2.6}" y="${y - 1}" width="5.2" height="2" rx="1" fill="#c8a888" stroke="#4a3020" stroke-width="0.4"/><rect x="${x - 0.8}" y="${y - 0.8}" width="1.6" height="1.6" fill="#b8987a"/></g>`;
  if (dir === 'baixo') {
    for (const k of [-1, 1]) s += orelha(C, k * (rx + 0.1), 2);
    s += forma(cab, C.pele, { cc: ccP, s: 1.3, l: 1, cs: mistura(C.pele, '#6a3a44', 0.15), w: 1.8 });
    s += barba(C, cab, 5, '#1a1210');
    for (const k of [-1, 1]) s += forma(blob([[k * (rx - 0.2), -6], [k * (rx - 3.2), -5], [k * (rx - 2.8), 1.5], [k * (rx - 0.6), 2.5]]), CAB, { w: 1.1, s: 0.6, l: 0.4 });
    s += rosto(C, dir, { ...rost, boca: traco(`M-3.2,11 Q0,10.4 3.2,11.2`, '#2a1008', 1.2) });
    s += curativo(-7.6, 6.2, -20);
    s += '<g transform="translate(0,-2.6)">';
    const copa = blob([[-rx - 1.2, -3], [-rx, -10], [-9, -ry - 2.2], [0, -ry - 3.4], [9, -ry - 2.2], [rx, -10], [rx + 1.2, -3], [0, -4.6]], 0.9);
    s += forma(copa, BONE, { cc: '#0a0a0c', s: 2.6, l: 1.8 });
    s += traco(`M0,${-ry - 3} L0,-5`, '#0a0a0c', 0.7, 0.6) + poeira(copa, -10, -ry - 6, 20, 10, 41, '#8a8478', 0.15);
    const aba = blob([[-rx + 0.5, -4], [0, -5.2], [rx - 0.5, -4], [rx - 2, -1], [0, 0.2], [-rx + 2, -1]], 0.8);
    s += forma(aba, '#202124', { cc: '#08080a', s: 1.4, l: 0.8 });
    s += forma(`M0,-14 l2.8,1 l0,2.4 q-0.8,2.8 -2.8,3.8 q-2,-1 -2.8,-3.8 l0,-2.4Z`, '#8e7a46', { cc: '#2a2010', w: 0.9, s: 0.8, l: 0.4 });
    s += '</g>';
  } else if (dir === 'cima') {
    for (const k of [-1, 1]) s += orelha(C, k * (rx + 0.1), 2);
    s += forma(cab, CAB, { s: 2.6, l: 1.2 });
    for (const x of [-7, -3.5, 0, 3.5, 7]) s += traco(`M${x},4 l${x * 0.05},${7 - Math.abs(x) * 0.25}`, '#3a2c24', 0.8, 0.7);
    s += recorta(cab, `<path d="M-6,${ry} Q0,${ry - 4} 6,${ry} Z" fill="${C.pele}"/>`);
    const copa = blob([[-rx - 1.2, 1], [-rx, -10], [-9, -ry - 2.2], [0, -ry - 3.4], [9, -ry - 2.2], [rx, -10], [rx + 1.2, 1], [0, 2.4]], 0.9);
    s += forma(copa, BONE, { cc: '#0a0a0c', s: 2.6, l: 1.8 });
    s += forma(`M-4,2 Q0,-3 4,2Z`, CAB, { w: 0.9, s: 0, l: 0 }) + forma(retRed(-4.5, -0.8, 9, 1.6, 0.7), '#4a4c52', { w: 0.7, s: 0.4, l: 0.2 });
  } else {
    s += forma(cab, C.pele, { cc: ccP, s: 1.3, l: 1, cs: mistura(C.pele, '#6a3a44', 0.15), w: 1.8 });
    s += barba(C, cab, 5, '#1a1210');
    s += recorta(cab, forma(blob([[-rx - 3, 10], [-rx - 3, -10], [0, -10], [1, -2], [-2, 4], [-6, 12]]), CAB, { s: 1.2, l: 0.8, w: 1.1 }));
    s += orelha(C, -2, 2);
    s += rosto(C, dir, { ...rost, bocaLado: traco(`M${rx - 4.6},11.2 L${rx - 0.8},10.8`, '#2a1008', 1.2) });
    s += curativo(5, 6.4, -12);
    s += '<g transform="translate(0,-2.4)">';
    const copa = blob([[-rx - 1.2, -1], [-rx, -10], [-8, -ry - 2.4], [2, -ry - 3.4], [10, -ry - 1.6], [rx + 1, -8], [rx + 1.4, -3], [0, -3.6]], 0.9);
    s += forma(copa, BONE, { cc: '#0a0a0c', s: 2.6, l: 1.8 });
    s += forma(blob([[rx - 4, -5], [rx + 9, -3.6], [rx + 9.6, -1.6], [rx - 3, -1.8]], 0.7), '#202124', { cc: '#08080a', s: 0.8, l: 0.6 });
    s += forma(`M9,-13 l2.4,1 l0,2.2 q-0.8,2.4 -2.4,3.4 q-1.6,-1 -2,-3.4 l0,-2.2Z`, '#8e7a46', { cc: '#2a2010', w: 0.8, s: 0.6, l: 0.4 });
    s += '</g>';
  }
  return { svg: s };
}
function cassetete(hx, hy, sg, dir) {
  const ang = dir === 'lado' ? 18 : sg * -20;
  const L = 13;
  let s = `<g transform="rotate(${ang} ${hx} ${hy})">`;
  s += forma(retRed(hx - 1.3, hy - 3.4, 2.6, 6.8, 1.1), '#1a1a1e', { w: 1, s: 0.6, l: 0.4 });
  s += forma(retRed(hx - 1.5, hy + 3, 3, L, 1.5), '#98c8cc', { cc: '#163a40', w: 1, s: 0.8, l: 0.5 });
  s += `</g>`;
  const rr = (ang * Math.PI) / 180;
  const tip = [hx - Math.sin(rr) * (L + 2), hy + Math.cos(rr) * (L + 2)];
  const e = halo(tip[0], tip[1], 6, '#60c8d8', 0.45) + `<g transform="rotate(${ang} ${hx} ${hy})"><rect x="${hx - 3.4}" y="${hy + 1.4}" width="6.8" height="${L + 3.4}" rx="3.4" fill="#40b8cc" opacity=".22"/>` +
    `<rect x="${hx - 0.8}" y="${hy + 3.6}" width="1.6" height="${L - 1.2}" rx="0.8" fill="#c8f0f4" opacity=".85"/></g>`;
  return { svg: s, emissivo: e };
}

// ======================= DRONES =======================
function drone(nome, R, elite) {
  const cy = -(R + 14);
  const METAL = elite ? '#6e7278' : '#7c8188';
  const out = {};
  for (const dir of ['baixo', 'cima', 'lado']) {
    const pecas = [];
    let s = '', em = '';
    const hub = [[-R * 0.95, cy - R * 0.95], [R * 0.95, cy - R * 0.95]];
    for (const [x, y] of hub) s += traco(`M${x * 0.55},${cy - R * 0.55} L${x},${y}`, '#16181c', 3) + traco(`M${x * 0.55},${cy - R * 0.55} L${x},${y}`, '#545a62', 1.4);
    if (elite) for (const k of [-1, 1]) s += traco(`M${k * R * 0.3},${cy - R * 0.9} Q${k * R * 0.45},${cy - R * 1.25} ${k * R * 0.32},${cy - R * 1.42}`, '#2a1426', 2.4) + traco(`M${k * R * 0.3},${cy - R * 0.9} Q${k * R * 0.45},${cy - R * 1.25} ${k * R * 0.32},${cy - R * 1.42}`, '#8a4a7a', 1.2) + forma(elipse(k * R * 0.32, cy - R * 1.47, 1.4, 1.4), '#8a4a7a', { w: 0.9, s: 0.5, l: 0.4 });
    const esf = elipse(0, cy, R, R * 0.96);
    let i = `<path d="${esf}" fill="${METAL}"/>`;
    // metal escovado: riscos horizontais finos
    const r = rnd(R * 3 + dir.length);
    for (let k = 0; k < 26; k++) { const y = cy - R + r() * 2 * R, x = -R + r() * R; i += `<path d="M${x},${y} h${4 + r() * 10}" stroke="${r() > 0.5 ? '#c8ccd2' : '#4a4e56'}" stroke-width="0.3" opacity=".35"/>`; }
    i += traco(`M${-R},${cy - R * 0.1} Q0,${cy + R * 0.25} ${R},${cy - R * 0.1}`, '#2e3238', 0.9, 0.85);
    i += traco(`M${-R * 0.55},${cy - R * 0.85} Q${-R * 0.7},${cy} ${-R * 0.5},${cy + R * 0.85}`, '#2e3238', 0.8, 0.7) + traco(`M${R * 0.55},${cy - R * 0.85} Q${R * 0.7},${cy} ${R * 0.5},${cy + R * 0.85}`, '#2e3238', 0.8, 0.7);
    if (elite) for (const y of [cy + R * 0.32, cy + R * 0.52]) i += `<rect x="${-R}" y="${y}" width="${2 * R}" height="${R * 0.1}" fill="#a8642a" opacity=".85"/>`;
    for (let k = 0; k < 10; k++) { const a = r() * Math.PI * 2, rr = R * (0.45 + r() * 0.45); i += `<circle cx="${Math.cos(a) * rr}" cy="${cy + Math.sin(a) * rr}" r="0.6" fill="#9a9ea6" stroke="#2e3238" stroke-width="0.35"/>`; }
    // arranhões e um amassado
    i += traco(`M${R * 0.1},${cy + R * 0.55} l${R * 0.35},${-R * 0.12}`, '#d0d4d8', 0.4, 0.5) + traco(`M${-R * 0.6},${cy + R * 0.3} l${R * 0.2},${R * 0.15}`, '#d0d4d8', 0.4, 0.5);
    i += `<ellipse cx="${R * 0.45}" cy="${cy - R * 0.45}" rx="${R * 0.14}" ry="${R * 0.09}" fill="#3a3e44" opacity=".35"/>`;
    s += comp(esf, i, { cc: '#121418', s: R * 0.26, l: R * 0.12, op: 0.24, opl: 0.12, w: 1.9 });
    s += brilho(-R * 0.45, cy - R * 0.5, R * 0.2, R * 0.08, -40, 0.85);
    if (dir !== 'cima') {
      const ex = dir === 'lado' ? R * 0.55 : 0, er = R * 0.33;
      s += forma(elipse(ex, cy + R * 0.05, dir === 'lado' ? er * 0.75 : er * 1.1, er * 1.05), '#16181c', { w: 1.4, s: 0, l: 0 });
      s += `<ellipse cx="${ex}" cy="${cy + R * 0.05}" rx="${(dir === 'lado' ? er * 0.5 : er * 0.72)}" ry="${er * 0.7}" fill="#8a1a1a"/>`;
      if (elite) s += `<path d="M${ex - er * 1.3},${cy - er * 1.2} L${ex + er * 1.3},${cy - er * 0.6} L${ex + er * 1.3},${cy - er * 0.25} L${ex - er * 1.3},${cy - er * 0.8}Z" fill="#26292e" stroke="#0c0e12" stroke-width="0.8"/>`;
      em += halo(ex, cy + R * 0.05, er * 2.4, '#e02a2a', 0.55) + `<ellipse cx="${ex}" cy="${cy + R * 0.05}" rx="${dir === 'lado' ? er * 0.26 : er * 0.36}" ry="${er * 0.4}" fill="#f08070"/>`;
    } else {
      s += forma(retRed(-R * 0.35, cy - R * 0.3, R * 0.7, R * 0.6, 1.2), mistura(METAL, '#1a1c20', 0.15), { w: 1, s: 0.8, l: 0.5 });
      for (let k = 0; k < 3; k++) s += traco(`M${-R * 0.25},${cy - R * 0.15 + k * R * 0.15} l${R * 0.5},0`, '#24282e', 0.7);
    }
    pecas.push({ parte: 'corpo', papel: 'corpo', svg: s, emissivo: em || undefined, jx: 0, jy: cy });
    for (const [k, [x, y]] of [[0, hub[0]], [1, hub[1]]]) {
      const pr = `<ellipse cx="${x}" cy="${y}" rx="${R * 0.62}" ry="${R * 0.15}" fill="#b4bac2" opacity=".4" stroke="#16181c" stroke-width="0.8"/>` +
        forma(retRed(x - R * 0.62, y - 0.8, R * 1.24, 1.6, 0.8), '#30343a', { w: 0.9, s: 0.4, l: 0.3 }) + forma(elipse(x, y, 1.6, 1.2), elite ? '#a8642a' : '#5a5e66', { w: 0.9, s: 0.4, l: 0.3 });
      pecas.push({ parte: k ? 'helice_d' : 'helice_e', papel: 'helice', pai: 'corpo', svg: pr, jx: x, jy: y });
    }
    out[dir] = pecas;
  }
  return out;
}

// ======================= montagem dos humanoides =======================
function humanoide(C, fns, dirs = ['baixo', 'cima', 'lado']) {
  const out = {};
  const k = K_CAB, ny = C.cabYn;
  const naCabeca = (s) => s && `<g transform="translate(0,${ny}) scale(${k})">${s}</g>`;
  for (const dir of dirs) {
    const P = {};
    const tron = { parte: 'tronco', papel: 'tronco', svg: fns.tronco(C, dir), jx: 0, jy: C.hipY };
    cfg.kw = 1 / k;
    const cabR = fns.cabeca(C, dir);
    const bal = fns.balanco?.(C, dir);
    cfg.kw = 1;
    const cab = { parte: 'cabeca', papel: 'cabeca', pai: 'tronco', svg: naCabeca(cabR.svg ?? cabR), emissivo: naCabeca(cabR.emissivo), jx: dir === 'lado' ? 0.5 : 0, jy: C.neckY };
    for (const l of ['e', 'd']) {
      const b = braco(C, dir, l), p = perna(C, dir, l);
      P['braco_' + l] = { parte: 'braco_' + l, papel: 'braco_' + l, pai: 'tronco', svg: b.svg, jx: b.jx, jy: b.jy, mao: b.mao };
      P['perna_' + l] = { parte: 'perna_' + l, papel: 'perna_' + l, svg: p.svg, jx: p.jx, jy: p.jy };
    }
    const balP = bal && { parte: 'cabelo_tras', papel: 'balanco', pai: 'cabeca', svg: naCabeca(bal.svg), jx: fx(bal.jx * k), jy: fx(ny + bal.jy * k) };
    const itens = {};
    for (const l of ['e', 'd']) {
      const it = fns.item?.(C, dir, l, P['braco_' + l].mao);
      if (it) itens[l] = { parte: 'item_' + l, papel: 'item', pai: 'braco_' + l, svg: dir === 'lado' && l === 'e' ? escuro(it.svg) : it.svg, emissivo: it.emissivo, jx: P['braco_' + l].mao[0], jy: P['braco_' + l].mao[1] };
    }
    const I = (l) => (itens[l] ? [itens[l]] : []);
    let ordem;
    if (dir === 'baixo') ordem = [...(balP ? [balP] : []), P.perna_e, P.perna_d, tron, ...I('e'), P.braco_e, ...I('d'), P.braco_d, cab];
    else if (dir === 'cima') ordem = [P.perna_e, P.perna_d, tron, ...I('e'), P.braco_e, ...I('d'), P.braco_d, ...(balP ? [balP] : []), cab];
    else if (C.saia) ordem = [...I('e'), P.braco_e, P.perna_e, P.perna_d, tron, ...(balP ? [balP] : []), ...I('d'), P.braco_d, cab];
    else ordem = [...I('e'), P.braco_e, P.perna_e, tron, P.perna_d, ...(balP ? [balP] : []), ...I('d'), P.braco_d, cab];
    for (const p of ordem) { const r = C.pose?.[dir]?.[p.parte]; if (r) p.r = r; }
    out[dir] = ordem;
  }
  return out;
}

// postura parada de atitude: rotação base (graus) que a cena soma à animação. Na frente, perna_e/braco_e
// ficam à direita da tela (negativo = abre para fora); de costas é o contrário; de lado, negativo = para a frente.
const abre = (pe, br, extra = {}) => ({
  baixo: { perna_e: -pe, perna_d: pe, braco_e: -br, braco_d: br, ...extra.baixo },
  cima: { perna_e: pe, perna_d: -pe, braco_e: br, braco_d: -br, ...extra.cima },
  lado: { ...extra.lado },
});
PEAO.pose = abre(6, 11, { lado: { perna_e: 10, perna_d: -8, braco_e: 8, braco_d: -6, cabeca: 2 } }); // base larga, punhos prontos, queixo baixo
IDOL.pose = abre(3, 4, { baixo: { perna_d: 8, cabeca: 6, braco_d: 9, cabelo_tras: -4 }, cima: { perna_e: 8, cabeca: -6, cabelo_tras: 4 }, lado: { perna_e: 7, perna_d: -3, cabeca: -6, braco_d: -4, cabelo_tras: 5 } }); // peso numa perna, cabeça de lado
PM.pose = abre(5, 7, { lado: { perna_e: 7, perna_d: -6, cabeca: 3 } }); // plantado, cassetetes abertos
BENZ.pose = { baixo: { braco_d: 14, braco_e: -4, cabeca: -3 }, lado: { tronco: 5, cabeca: -5, braco_d: -16, braco_e: 4, perna_e: 4, perna_d: -3 } }; // corcunda, ramo apontado

const bonecos = {
  peao: humanoide(PEAO, { tronco: peaoTronco, cabeca: peaoCabeca }),
  idol: humanoide(IDOL, { tronco: idolTronco, cabeca: idolCabeca, balanco: idolBalanco }),
  benzedeira: humanoide(BENZ, { tronco: benzTronco, cabeca: benzCabeca, item: (C, dir, l, m) => (l === 'd' ? ramo(m[0], m[1]) : null) }, ['baixo', 'lado']),
  pm: humanoide(PM, { tronco: pmTronco, cabeca: pmCabeca, item: (C, dir, l, m) => cassetete(m[0], m[1], sinal(dir, l), dir) }),
  drone: drone('drone', 13.5, false),
  drone_elite: drone('drone_elite', 18, true),
};

// ---------- render ----------
const pecas = [];
for (const [b, dirs] of Object.entries(bonecos)) for (const [dir, lista] of Object.entries(dirs)) for (const p of lista) {
  p.img = `${b}_${dir}_${p.parte}`;
  pecas.push({ nome: p.img, svg: p.svg, emissivo: p.emissivo, jx: p.jx, jy: p.jy });
}
const man = await renderizarPecas(DIR, pecas);
writeFileSync(`${DIR}/pecas-bonecos.json`, JSON.stringify(man, null, 1));

const rigs = {};
for (const [b, dirs] of Object.entries(bonecos)) {
  rigs[b] = { altura: 0, dirs: {} };
  for (const [dir, lista] of Object.entries(dirs)) {
    const J = Object.fromEntries(lista.map((p) => [p.parte, p]));
    rigs[b].dirs[dir] = lista.map((p) => {
      const pai = p.pai && J[p.pai];
      const e = { parte: p.parte, img: p.img, papel: p.papel };
      if (pai) e.pai = p.pai;
      e.x = fx(p.jx - (pai ? pai.jx : 0)); e.y = fx(p.jy - (pai ? pai.jy : 0));
      if (p.r) e.r = p.r;
      return e;
    });
  }
  let top = 0;
  for (const p of dirs.baixo) top = Math.min(top, renderizarPecas.topo[p.img] + 1);
  rigs[b].altura = Math.round(-top);
}
writeFileSync(`${DIR}/rigs.json`, JSON.stringify(rigs, null, 1));

// ---------- prancha de conferência ----------
const ZOOM = 2;
const poses = {
  parado: {},
  passo: { baixo: { braco_e: -20, braco_d: 20, perna_e: -12, perna_d: 12, cabeca: 6, balanco: 8, item: 10 }, cima: { braco_e: 20, braco_d: -20, perna_e: 12, perna_d: -12, cabeca: -6, balanco: -8 }, lado: { braco_e: 28, braco_d: -28, perna_e: 26, perna_d: -26, cabeca: -4, balanco: 10, tronco: 3 } },
};
let html = '<body style="margin:0;background:#1b2130;font:12px sans-serif;color:#cfd6e6">';
const CW = 150, RH = 230;
for (const [b, R] of Object.entries(rigs)) {
  html += `<div style="position:relative;height:${RH}px;border-bottom:1px solid #2c3446">`;
  let x = 0;
  for (const [np, pose] of Object.entries(poses)) {
    for (const [dir, lista] of Object.entries(R.dirs)) {
      html += `<div style="position:absolute;left:${x * CW}px;top:0;width:${CW}px;height:${RH}px;background:${np === 'passo' ? '#4a5a44' : 'transparent'}"></div>`;
      html += `<div style="position:absolute;left:${x * CW + 6}px;top:4px">${b} ${dir} ${np}${x ? '' : ' · ' + R.altura + ' u'}</div>`;
      html += `<div style="position:absolute;left:${x * CW + CW / 2}px;top:${RH - 12}px"><div style="position:absolute;left:-22px;top:-4px;width:44px;height:8px;border-radius:50%;background:rgba(0,0,0,.35)"></div>${montarHTML(DIR, man, lista, pose[dir] ?? {}, ZOOM)}</div>`;
      x++;
    }
  }
  html += '</div>';
}
html += '</body>';
await fotografar('tools/art/saida/cartoon-bonecos.png', html, CW * 6, 400);
console.log('peças:', pecas.length, 'alturas:', Object.fromEntries(Object.entries(rigs).map(([k, v]) => [k, v.altura])));
