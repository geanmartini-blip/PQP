// Bonecos cartoon em peças de rig 2D (tronco, cabeça, braços, pernas, cabelo que balança, itens).
// Uso: node tools/art/cartoon/personagens.mjs
// Saída: packages/client/public/teste-cartoon/<boneco>_<dir>_<parte>.png (+ _e.png = camada emissiva),
//        rigs.json, pecas-bonecos.json e a prancha de conferência tools/art/saida/cartoon-bonecos.png.
// Tudo é desenhado em coordenadas do boneco: pés no chão em (0,0), y negativo para cima, 1 u = 1 px CSS.
import { writeFileSync } from 'node:fs';
import {
  blob, curva, elipse, retRed, brilho, traco, halo, sombra, luz, contorno, mistura, cel,
  uid, capsula, comp, recorta, escuro, xadrez, olho, sobrancelha, renderizarPecas, montarHTML, fotografar,
} from './boneco.mjs';
import { rnd } from './lib.mjs';

const DIR = 'packages/client/public/teste-cartoon';
const W = 2.2; // contorno principal
const fx = (v) => +v.toFixed(2);

// lado do membro: na frente (baixo) o lado esquerdo do boneco fica à direita da tela
const sinal = (dir, lado) => (dir === 'baixo' ? (lado === 'e' ? 1 : -1) : dir === 'cima' ? (lado === 'e' ? -1 : 1) : 1);
const PELES = new Set(['#e8a873', '#f8d6bf', '#c98a5e', '#b97a50']);
// luz: metade puxada para o amarelo (lib) e metade para o branco, para os marrons não ficarem oliva
const forma = (d, cor, o = {}) => cel(d, cor, { w: o.w ?? W, s: o.s ?? 3, l: o.l ?? 2, cl: mistura(luz(cor, 0.26), mistura(cor, '#fff6ea', 0.3), 0.6), ...(PELES.has(cor) ? { cs: mistura(cor, '#6a3048', 0.3), cl: mistura(cor, '#fff0dc', 0.3) } : {}), ...o });

// ======================= peças genéricas =======================
function formaTronco(C, dir) {
  const sy = C.ombroY, hy = C.hipY, Ws = C.Ws, Wq = C.Wq;
  if (dir !== 'lado') return blob([[-Ws + 1.5, sy - 4.5], [0, sy - 6], [Ws - 1.5, sy - 4.5], [Ws + 0.5, sy + 2], [Ws - 0.8, sy + 11], [Wq, hy - 3], [Wq + 0.6, hy + 3], [0, hy + 5.5], [-Wq - 0.6, hy + 3], [-Wq, hy - 3], [-Ws + 0.8, sy + 11], [-Ws - 0.5, sy + 2]]);
  const T = C.T;
  return blob([[-T + 1.5, sy - 4.5], [1, sy - 6], [T - 1, sy - 3.5], [T + 1.2, sy + 5], [T - 0.3, hy - 4], [T - 0.8, hy + 3], [0, hy + 5.5], [-T + 0.6, hy + 3], [-T + 0.3, hy - 5], [-T - 0.4, sy + 5]]);
}
function formaCabeca(C, dir) {
  const cy = C.cabY, rx = C.rx, ry = C.ry;
  if (dir !== 'lado') return blob([[0, cy - ry], [rx * 0.8, cy - ry * 0.8], [rx, cy - ry * 0.05], [rx * 0.9, cy + ry * 0.56], [rx * 0.52, cy + ry * 0.93], [0, cy + ry], [-rx * 0.52, cy + ry * 0.93], [-rx * 0.9, cy + ry * 0.56], [-rx, cy - ry * 0.05], [-rx * 0.8, cy - ry * 0.8]]);
  return blob([[-rx * 0.1, cy - ry], [rx * 0.72, cy - ry * 0.8], [rx * 0.98, cy - ry * 0.12], [rx * 0.97, cy + ry * 0.45], [rx * 0.62, cy + ry * 0.92], [0, cy + ry], [-rx * 0.62, cy + ry * 0.84], [-rx * 0.97, cy + ry * 0.22], [-rx * 0.88, cy - ry * 0.55]]);
}
const pescoco = () => '';
const _pescocoAntigo = (C, dir) => forma(capsula(dir === 'lado' ? 0.5 : 0, C.cabY + C.ry * 0.5, 5.2, dir === 'lado' ? 0.5 : 0, C.neckY + 3.5, 5.4), sombra(C.pele, 0.12), { s: 2, l: 0, w: 1.8 });

function mao(C, x, y, dir, sg) {
  const r = C.maoR, cor = C.luva ?? C.pele, cc = contorno(cor);
  let s = '';
  if (dir === 'lado') {
    s += forma(blob([[x - r, y - r * 0.7], [x + r * 0.3, y - r * 1.05], [x + r * 1.05, y - r * 0.2], [x + r * 0.8, y + r * 0.85], [x - r * 0.3, y + r * 1.02], [x - r * 1.02, y + r * 0.3]]), cor, { w: 1.9, s: 2.2, l: 1.4 });
    s += forma(elipse(x + r * 0.75, y - r * 0.25, r * 0.42, r * 0.55), cor, { w: 1.4, s: 0.8, l: 0.6 });
    s += traco(`M${x - r * 0.2},${y + r * 0.45} q${r * 0.4},${r * 0.25} ${r * 0.8},0`, cc, 0.9, 0.6);
  } else {
    s += forma(blob([[x - r, y - r * 0.55], [x, y - r * 1.05], [x + r, y - r * 0.55], [x + r * 0.95, y + r * 0.55], [x, y + r * 1.02], [x - r * 0.95, y + r * 0.55]]), cor, { w: 1.9, s: 2.2, l: 1.4 });
    if (dir === 'baixo') s += forma(elipse(x - sg * r * 0.78, y - r * 0.05, r * 0.42, r * 0.55), cor, { w: 1.4, s: 0.8, l: 0.6 });
    for (let i = -1; i <= 1; i++) s += traco(`M${x + i * r * 0.42},${y + r * 0.95} l0,${-r * 0.42}`, cc, 0.85, 0.55);
  }
  return s + brilho(x - r * 0.4, y - r * 0.5, r * 0.32, r * 0.18, -35, 0.6);
}

function braco(C, dir, lado) {
  const sg = sinal(dir, lado);
  const tras = dir === 'lado' && lado === 'e';
  const sx = dir === 'lado' ? (tras ? -1.5 : 0.5) : sg * C.ombroX, sy = C.ombroY + (tras ? -0.5 : 0);
  const o = dir === 'lado' ? 0.8 : sg * 1.6, L = C.bracoL, r = C.bracoR;
  const cot = [sx + o * 0.7, sy + L * 0.5], pul = [sx + o * 1.15, sy + L * 0.8], hm = [sx + o * 1.3, sy + L];
  const M = C.manga;
  let s = '';
  // antebraço de pele
  if (M.comp !== 'longa') s += forma(capsula(cot[0], cot[1] - 2, r * 0.8, pul[0], pul[1], r * 0.68), C.pele, { w: 1.9, s: 2, l: 1.2 });
  // manga
  const fim = M.comp === 'longa' ? pul : cot;
  const dm = capsula(sx, sy, r, fim[0], fim[1], M.comp === 'longa' ? r * 0.74 : r * 0.9);
  const cc = M.cc ?? contorno(M.cor);
  if (M.padrao) {
    const pid = uid('p');
    s += comp(dm, `<defs>${M.padrao(pid)}</defs><path d="${dm}" fill="url(#${pid})"/>`, { cc, w: W, s: 2.6, l: 1.6 });
  } else s += forma(dm, M.cor, { cc, s: 2.6, l: 1.6 });
  // dobras da manga
  const dob = sombra(M.cor, 0.4);
  s += traco(`M${cot[0] - r * 0.6},${cot[1] - 3.2} q${r * 0.5},${1.2} ${r * 1.1},0`, dob, 1, 0.7);
  if (M.comp === 'longa') s += traco(`M${cot[0] - r * 0.4},${cot[1] + 1.5} q${r * 0.4},${-1} ${r * 0.9},0.2`, dob, 0.9, 0.6);
  // punho / barra
  if (M.punho) s += forma(elipse(fim[0], fim[1], (M.comp === 'longa' ? r * 0.8 : r * 0.95), 2), M.punho, { w: 1.6, s: 1, l: 0.8 });
  if (M.extra) s += M.extra({ sx, sy, cot, pul, hm, r, dir, sg, tras });
  s += mao(C, hm[0], hm[1], dir, sg);
  if (tras) s = escuro(s);
  return { svg: s, jx: sx, jy: sy, mao: hm };
}

function sapato(C, dir, px, sg) {
  const S = C.sapato, cor = S.cor;
  let s = '';
  const alt = S.cano ?? 4;
  if (S.cano) { // cano da bota
    const dc = retRed(px - C.pernaW / 2 - 0.2, -alt - 6.5, C.pernaW + 0.4, alt + 3, 2);
    s += forma(dc, cor, { s: 2, l: 1.2 });
    if (S.cadarco) for (let i = 0; i < 3; i++) s += traco(`M${px - 2},${-alt - 4.5 + i * 2} l4,0`, S.cadarco, 0.9);
  }
  let pe;
  if (dir === 'lado') pe = blob([[px - 5.5, -8], [px + 2, -8.5], [px + 4.5, -5.5], [px + 9.5, -3.8], [px + 10, -0.6], [px + 7.5, 0.6], [px - 5.5, 0.6], [px - 6.6, -3]]);
  else if (dir === 'baixo') pe = blob([[px - 6.4 + sg * 0.6, -6.8], [px + sg * 0.6, -8.2], [px + 6.4 + sg * 0.6, -6.8], [px + 7.2 + sg * 0.8, -2], [px + 5 + sg, 0.6], [px - 5 + sg, 0.6], [px - 7.2 + sg * 0.8, -2]]);
  else pe = blob([[px - 6.2, -7.8], [px, -8.6], [px + 6.2, -7.8], [px + 6.8, -2], [px + 4.5, 0.6], [px - 4.5, 0.6], [px - 6.8, -2]]);
  s += forma(pe, cor, { s: 2.4, l: 1.4 });
  // sola
  s += recorta(pe, `<rect x="${px - 12}" y="-1.9" width="26" height="4" fill="${S.sola}"/>` + traco(`M${px - 12},-1.9 L${px + 14},-1.9`, contorno(S.sola), 0.9));
  s += `<path d="${pe}" fill="none" stroke="${contorno(cor)}" stroke-width="${W}"/>`;
  if (S.faixa) s += recorta(pe, traco(dir === 'lado' ? `M${px - 3},-6.5 Q${px + 2},-3 ${px + 7},-3.4` : `M${px - 5},-4.6 Q${px},-6 ${px + 5},-4.6`, S.faixa, 1.6));
  if (S.cadarco && !S.cano) s += traco(dir === 'lado' ? `M${px + 1},-7 l2,1.6 M${px + 2.5},-7.5 l2,1.6` : dir === 'baixo' ? `M${px - 2 + sg},-7 l4,0 M${px - 1.6 + sg},-5.6 l3.2,0` : '', S.cadarco, 0.9);
  s += brilho(dir === 'lado' ? px + 5 : px - 2.5, -5.6, 1.8, 0.8, -15, 0.7);
  return s;
}

function perna(C, dir, lado) {
  const sg = sinal(dir, lado);
  const tras = dir === 'lado' && lado === 'e';
  const px = dir === 'lado' ? (tras ? -2.5 : 2) : sg * C.quadX, py = C.hipY;
  const w = C.pernaW / 2, an = -(C.sapato.cano ?? 4) - 3;
  const d = `M${px - w},${py} A${w},${w} 0 0 1 ${px + w},${py} L${px + w * 0.93},${an} Q${px},${an + 1.6} ${px - w * 0.93},${an} Z`;
  let s = forma(d, C.calca, { s: 2.6, l: 1.4 });
  const dob = sombra(C.calca, 0.42);
  s += traco(`M${px - w * 0.5},${(py + an) / 2 + 1} q${w * 0.5},1 ${w},-0.4`, dob, 1, 0.65);
  if (C.costura) s += traco(`M${px + (dir === 'lado' ? -w * 0.5 : sg * w * 0.55)},${py} L${px + (dir === 'lado' ? -w * 0.5 : sg * w * 0.6)},${an + 1}`, C.costura, 0.8, 0.8);
  if (C.barra) s += forma(retRed(px - w - 0.4, an - 2.4, 2 * w + 0.8, 3.4, 1.4), C.barra, { w: 1.6, s: 1, l: 0.8 });
  if (C.bolsoCargo && dir !== 'baixo') s += forma(retRed(px - (dir === 'lado' ? 2.5 : 3), py + 1, 5.5, 5, 1.2), sombra(C.calca, -0.1), { w: 1.3, s: 1, l: 0.6 });
  s += sapato(C, dir, px, dir === 'lado' ? 1 : sg);
  if (tras) s = escuro(s);
  return { svg: s, jx: px, jy: py };
}

// ======================= PEÃO BRABO =======================
const PEAO = {
  nome: 'peao', hipY: -20, quadX: 6.4, pernaW: 11.5, ombroY: -43, ombroX: 15.5, neckY: -46, cabY: -58, rx: 15.5, ry: 14.5,
  Ws: 16.5, Wq: 13, T: 10.5, bracoR: 5.8, maoR: 5, bracoL: 20,
  pele: '#e8a873', calca: '#3f6fbf', costura: '#f2c85a', barra: '#5f8fd8',
  sapato: { cor: '#8a4f2a', sola: '#3a2012', cano: 5 },
  manga: { comp: 'curta', cor: '#d8323a', cc: '#3c0a16', padrao: (pid) => xadrez(pid, '#dc3640', '#7a0c20', '#ffb0a0', 6.5), punho: '#e9585c' },
};
const XADREZ_P = (pid) => xadrez(pid, '#dc3640', '#7a0c20', '#ffb0a0', 6.5);
const COURO = '#5a3418', OURO = '#f6c443', BIGODE = '#5b2e16';

function fivela(x, y, rx = 8.2, ry = 5.6, txt = true) {
  let s = forma(elipse(x, y, rx, ry), OURO, { cc: '#5a3606', s: 2, l: 1.4, w: 1.8 });
  s += `<ellipse cx="${x}" cy="${y}" rx="${rx - 1.8}" ry="${ry - 1.5}" fill="none" stroke="#b07a14" stroke-width="0.8"/>`;
  if (txt) s += `<text x="${x}" y="${y + 1.25}" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="3.5" text-anchor="middle" fill="#5a2c06" letter-spacing="-0.1">TOURO</text>`;
  for (const k of [-1, 1]) s += `<circle cx="${x + k * (rx - 0.9)}" cy="${y}" r="0.7" fill="#fff3b0"/>`;
  return s + brilho(x - rx * 0.5, y - ry * 0.5, 2.2, 0.9, -20, 0.9);
}
function laco(x, y, k = 1) {
  let s = '';
  const an = [[0, 0, 5.2, 6.2], [0.8, 0.4, 4.6, 5.6], [-0.6, 0.6, 4.4, 5.4]];
  for (const [dx, dy, rx, ry] of an) s += `<ellipse cx="${x + dx}" cy="${y + dy}" rx="${rx * k}" ry="${ry * k}" fill="none" stroke="#3a2410" stroke-width="3.4"/>`;
  for (const [dx, dy, rx, ry] of an) s += `<ellipse cx="${x + dx}" cy="${y + dy}" rx="${rx * k}" ry="${ry * k}" fill="none" stroke="#d2a660" stroke-width="2"/><ellipse cx="${x + dx}" cy="${y + dy}" rx="${rx * k}" ry="${ry * k}" fill="none" stroke="#8a6230" stroke-width="2" stroke-dasharray="0.9 1.1" opacity=".75"/>`;
  s += traco(`M${x + 1},${y + 6 * k} q1,3 -0.5,6`, '#3a2410', 3.2) + traco(`M${x + 1},${y + 6 * k} q1,3 -0.5,6`, '#d2a660', 1.8);
  return s + `<path d="M${x - 4.6 * k},${y - 2} A${5 * k},${6 * k} 0 0 1 ${x},${y - 6 * k}" fill="none" stroke="#fff2c8" stroke-width="0.8" opacity=".8"/>`;
}

function peaoTronco(C, dir) {
  const d = formaTronco(C, dir), sy = C.ombroY, hy = C.hipY, pid = uid('xz');
  let i = `<defs>${XADREZ_P(pid)}</defs><path d="${d}" fill="url(#${pid})"/>`;
  const dob = '#5a0818';
  let fora = '';
  if (dir === 'baixo') {
    // peito aberto com pelos
    i += forma(`M-7,${sy - 7} Q-4.5,${sy + 6} 0,${sy + 13} Q4.5,${sy + 6} 7,${sy - 7} Z`, C.pele, { s: 2, l: 1, w: 1.6, cc: '#5a2a14' });
    i += traco(`M-4.2,${sy + 1.5} q2.1,1.4 4.2,0 q2.1,1.4 4.2,0`, sombra(C.pele, 0.35), 1, 0.8);
    for (const [x, y] of [[-2, sy + 4.5], [1.5, sy + 5.5], [-0.5, sy + 8], [2.5, sy + 2.5], [-3, sy + 1]]) i += traco(`M${x},${y} q0.7,-0.8 0,-1.6`, BIGODE, 0.8);
    // gola aberta
    i += forma(`M-11,${sy - 6} L-7,${sy - 7.5} L-1.8,${sy + 6} L-6.5,${sy + 2} Z`, '#ee5058', { s: 1.2, l: 0.8, w: 1.4, cc: '#3c0a16' });
    i += forma(`M11,${sy - 6} L7,${sy - 7.5} L1.8,${sy + 6} L6.5,${sy + 2} Z`, '#ee5058', { s: 1.2, l: 0.8, w: 1.4, cc: '#3c0a16' });
    for (const y of [sy + 15, sy + 19]) i += `<circle cx="0.3" cy="${y}" r="0.9" fill="#fff4e0" stroke="#3c0a16" stroke-width="0.5"/>`;
    i += traco(`M0,${sy + 13} L0.3,${hy - 6}`, '#3c0a16', 0.8, 0.7);
    // dobras da camisa na barriga
    i += traco(`M-12,${hy - 9} q4,2 8,1`, dob, 1, 0.55) + traco(`M12,${hy - 9.5} q-4,2.2 -8,0.8`, dob, 1, 0.55);
    // calça
    i += `<rect x="-22" y="${hy - 2}" width="44" height="12" fill="${C.calca}"/>` + traco(`M1.5,${hy - 2} q0,4 -2.2,6`, '#24467e', 0.9);
    i += traco(`M-12,${hy - 1} q1,3 4,4.5 M12,${hy - 1} q-1,3 -4,4.5`, C.costura, 0.7, 0.8);
    // cinto
    i += forma(retRed(-22, hy - 7.2, 44, 5.4, 1), COURO, { s: 1.6, l: 1, w: 1.4 });
    i += `<path d="M-20,${hy - 4.5} L20,${hy - 4.5}" stroke="#c99a60" stroke-width="0.5" stroke-dasharray="1 1" opacity=".8"/>`;
    fora += fivela(0, hy - 4.6) + laco(-14.6, hy - 1.5);
  } else if (dir === 'cima') {
    // pala das costas
    i += traco(`M-15,${sy + 2} Q0,${sy + 6} 15,${sy + 2}`, '#3c0a16', 1.1, 0.8);
    i += traco(`M-6,${sy + 14} q6,3 12,0`, dob, 1, 0.5) + traco(`M-10,${hy - 9} q5,2 9,1`, dob, 1, 0.5);
    // adesivo "100% MACHO" descascando
    i += `<g transform="rotate(-7 0 ${sy + 9})"><path d="M-11,${sy + 5.5} h22 v7 h-19 l-3,-2.6 Z" fill="#fbf4e4" stroke="#4a2a1a" stroke-width="0.6"/><path d="M-11,${sy + 9.9} l3,2.6 v-3.4 Z" fill="#c9bfa8" stroke="#4a2a1a" stroke-width="0.4"/>` +
      `<text x="0.6" y="${sy + 10.3}" font-family="Arial Black, Arial" font-weight="900" font-size="2.9" text-anchor="middle" fill="#c41c2c" textLength="19" lengthAdjust="spacingAndGlyphs">100% MACHO</text></g>`;
    i += `<rect x="-22" y="${hy - 2}" width="44" height="12" fill="${C.calca}"/>`;
    for (const k of [-1, 1]) i += forma(retRed(k * 6.5 - 4, hy - 0.5, 8, 6, 1.6), '#3866b0', { w: 1.2, s: 1, l: 0.6 }) + traco(`M${k * 6.5 - 3},${hy + 1} l6,0`, C.costura, 0.6, 0.8);
    i += forma(retRed(-22, hy - 7.2, 44, 5.4, 1), COURO, { s: 1.6, l: 1, w: 1.4 });
    i += `<path d="M-20,${hy - 4.5} L20,${hy - 4.5}" stroke="#c99a60" stroke-width="0.5" stroke-dasharray="1 1" opacity=".8"/>`;
    fora += laco(14.6, hy - 1.5);
  } else {
    const T = C.T;
    i += forma(`M${T - 4},${sy - 6} Q${T - 1},${sy + 3} ${T + 2},${sy + 11} L${T + 3},${sy - 6} Z`, C.pele, { s: 1.5, l: 1, w: 1.4, cc: '#5a2a14' });
    i += forma(`M${T - 6},${sy - 6.5} L${T - 2.5},${sy - 6} L${T + 0.5},${sy + 7} L${T - 3.5},${sy + 2} Z`, '#ee5058', { s: 1, l: 0.8, w: 1.3, cc: '#3c0a16' });
    i += traco(`M${T - 8},${hy - 9} q3,2 6,0.5`, dob, 1, 0.55) + traco(`M-4,${sy + 3} q-2,6 -1,11`, dob, 1, 0.45);
    i += `<rect x="-22" y="${hy - 2}" width="44" height="12" fill="${C.calca}"/>`;
    i += forma(retRed(-T - 2, hy - 0.5, 7, 6, 1.6), '#3866b0', { w: 1.2, s: 1, l: 0.6 });
    i += forma(retRed(-22, hy - 7.2, 44, 5.4, 1), COURO, { s: 1.6, l: 1, w: 1.4 });
    fora += fivela(T + 0.4, hy - 4.6, 3.4, 5.8, false) + laco(-1, hy - 1.5);
  }
  return comp(d, i, { cc: '#3c0a16', s: 4.5, l: 2.4 }) + fora;
}

function chapeuPeao(dir, by, frente = true) {
  const COR = '#93592f';
  let aba, copa;
  if (dir === 'lado') {
    aba = blob([[-25, by + 2.5], [-27, by - 2.5], [-16, by + 0.5], [0, by + 1.2], [17, by + 0.2], [27, by - 3.5], [28.5, by + 1.5], [19, by + 4.6], [0, by + 5.2], [-17, by + 4.8]]);
    copa = blob([[-12, by + 1], [-13, by - 7], [-10, by - 14], [-3, by - 17], [5, by - 16.2], [10.5, by - 12], [12.5, by - 6], [12, by + 1]]);
  } else {
    aba = blob([[-29.5, by + 1.5], [-28, by - 4.2], [-20, by - 1.5], [-10, by + 0.3], [0, by + 0.8], [10, by + 0.3], [20, by - 1.5], [28, by - 4.2], [29.5, by + 1.5], [22, by + 4.8], [10, by + 6.2], [0, by + 6.6], [-10, by + 6.2], [-22, by + 4.8]]);
    copa = blob([[-13, by + 1], [-14.5, by - 6], [-12.5, by - 13], [-7, by - 17.2], [-2, by - 15.4], [0, by - 14.4], [2, by - 15.4], [7, by - 17.2], [12.5, by - 13], [14.5, by - 6], [13, by + 1]]);
  }
  let s = forma(aba, COR, { cc: '#2e1408', s: 3, l: 1.8, w: 2.4 });
  s += traco(dir === 'lado' ? `M-22,${by + 2.6} Q0,${by + 3.8} 24,${by + 0.6}` : `M-25,${by + 1.2} Q0,${by + 5.2} 25,${by + 1.2}`, mistura(COR, '#ffe0b8', 0.4), 0.9, 0.7);
  // copa com faixa de couro e tachas
  let ci = `<path d="${copa}" fill="${COR}"/>`;
  ci += traco(dir === 'lado' ? `M-4,${by - 15} q-2,6 -1,12` : `M-6,${by - 14} q-1.5,6 -0.5,12 M6,${by - 14} q1.5,6 0.5,12`, sombra(COR, 0.35), 1.1, 0.7);
  ci += `<rect x="-20" y="${by - 5}" width="40" height="4.6" fill="#3e200c"/><rect x="-20" y="${by - 5}" width="40" height="0.8" fill="#6a3c1c"/>`;
  const tachas = dir === 'lado' ? [-9, -4.5, 0, 4.5, 9] : [-10.5, -6, 6, 10.5];
  for (const x of tachas) ci += `<circle cx="${x}" cy="${by - 2.7}" r="1.15" fill="${OURO}" stroke="#5a3606" stroke-width="0.45"/><circle cx="${x - 0.35}" cy="${by - 3.1}" r="0.4" fill="#fff6c8"/>`;
  s += comp(copa, ci, { cc: '#2e1408', w: 2.4, s: 3.5, l: 2 });
  if (dir === 'baixo') s += forma(elipse(0, by - 2.7, 2.8, 2.4), OURO, { cc: '#5a3606', w: 1, s: 0.8, l: 0.6 }) + `<path d="M-1.6,${by - 3.6} l1.6,1.2 l1.6,-1.2" fill="none" stroke="#7a4a08" stroke-width="0.6"/>`;
  if (dir !== 'lado') {
    // frente da aba por cima da base da copa
    const clip = dir === 'baixo' ? `M-40,${by + 0.6} Q0,${by + 4.6} 40,${by + 0.6} L40,${by + 20} L-40,${by + 20}Z` : `M-40,${by + 1.5} Q0,${by + 3.4} 40,${by + 1.5} L40,${by + 20} L-40,${by + 20}Z`;
    s += recorta(clip, forma(aba, COR, { cc: '#2e1408', s: 3, l: 1.8, w: 2.4 }));
    s += traco(dir === 'baixo' ? `M-13,${by + 2.5} Q0,${by + 4.3} 13,${by + 2.5}` : `M-13,${by + 2.2} Q0,${by + 3.2} 13,${by + 2.2}`, '#2e1408', 1.2, 0.8);
  }
  s += brilho(dir === 'lado' ? -5 : -8, by - 12, 2.6, 1.2, -50, 0.55);
  return s;
}

function peaoCabeca(C, dir) {
  const cy = C.cabY, rx = C.rx, ry = C.ry, by = cy - 12.6;
  const ccP = '#5a2410';
  let s = pescoco(C, dir);
  if (dir === 'baixo') {
    s += forma(elipse(0, cy - 2, rx + 1.2, ry * 0.9), BIGODE, { s: 2, l: 1 });
    for (const k of [-1, 1]) s += forma(elipse(k * (rx + 0.3), cy + 1.5, 3.2, 4.2), C.pele, { w: 1.8, s: 1.2, l: 0.8, cc: ccP }) + traco(`M${k * (rx + 0.6)},${cy} q${-k * 1},1.5 0,3`, sombra(C.pele, 0.4), 0.9);
    s += forma(formaCabeca(C, dir), C.pele, { cc: ccP, s: 3.6, l: 2 });
    // costeletas
    for (const k of [-1, 1]) s += forma(blob([[k * (rx - 0.5), cy - 7], [k * (rx - 4.6), cy - 6], [k * (rx - 4), cy + 3], [k * (rx - 1.8), cy + 5.5], [k * (rx + 0.3), cy]]), BIGODE, { w: 1.5, s: 1, l: 0.8 });
    // olhos, sobrancelhas
    for (const k of [-1, 1]) s += olho(k * 6.1, cy + 1.3, { rx: 3.5, ry: 4.3, iris: '#8a5222', dx: 0.3, dy: 0.6, cc: '#2a120a' });
    for (const k of [-1, 1]) s += sobrancelha(k * 2.6, cy - 2.6, k * 10.4, cy - 4.2, BIGODE, 2.5, -1.4);
    // nariz
    s += forma(elipse(0, cy + 5.6, 3.4, 2.9), sombra(C.pele, 0.08), { w: 1.4, s: 1.2, l: 0.9, cc: ccP }) + brilho(-1, cy + 4.6, 1, 0.6, -20, 0.8);
    // bochechas
    for (const k of [-1, 1]) s += `<ellipse cx="${k * 9.6}" cy="${cy + 6.3}" rx="2.6" ry="1.4" fill="#e3645a" opacity=".42"/>`;
    // boca e bigodão
    s += forma(`M-4,${cy + 10} Q0,${cy + 14.6} 4,${cy + 10} Z`, '#6a1c1c', { w: 1.2, s: 0, l: 0, cc: '#2a0c0c' }) + `<path d="M-3,${cy + 10.3} h6 v1.1 h-6z" fill="#fff"/><rect x="0.6" y="${cy + 10.3}" width="1.4" height="1.2" fill="${OURO}"/>`;
    const big = blob([[0, cy + 6.6], [4, cy + 5.6], [9, cy + 6.6], [12.8, cy + 9.4], [12.4, cy + 13.4], [10, cy + 11], [5, cy + 11], [0, cy + 9.8], [-5, cy + 11], [-10, cy + 11], [-12.4, cy + 13.4], [-12.8, cy + 9.4], [-9, cy + 6.6], [-4, cy + 5.6]]);
    s += forma(big, BIGODE, { s: 2, l: 1.4, w: 1.8 });
    for (const k of [-1, 1]) s += traco(`M${k * 2},${cy + 7.6} q${k * 4},0.2 ${k * 8},2.6`, mistura(BIGODE, '#e8b890', 0.45), 0.8, 0.8);
    s += chapeuPeao(dir, by);
  } else if (dir === 'cima') {
    for (const k of [-1, 1]) s += forma(elipse(k * (rx + 0.3), cy + 1.5, 3.2, 4.2), C.pele, { w: 1.8, s: 1.2, l: 0.8, cc: ccP });
    s += forma(formaCabeca(C, dir), BIGODE, { s: 3.4, l: 1.8 });
    for (let x = -10; x <= 10; x += 4) s += traco(`M${x},${cy - 4} q1,5 ${x * 0.1},${10 - Math.abs(x) * 0.3}`, sombra(BIGODE, 0.4), 1, 0.7);
    s += traco(`M-8,${cy + 12} q8,2.4 16,0`, sombra(BIGODE, 0.4), 1, 0.7);
    s += chapeuPeao(dir, by);
  } else {
    s += forma(formaCabeca(C, dir), C.pele, { cc: ccP, s: 3.6, l: 2 });
    s += recorta(formaCabeca(C, dir), forma(blob([[-rx - 3, cy + 9], [-rx - 3, cy - 12], [0, cy - 16], [2, cy - 8], [-1, cy - 3], [-3, cy + 4], [-6, cy + 11]]), BIGODE, { s: 2, l: 1, w: 1.5 }));
    s += forma(blob([[1, cy - 7], [3.5, cy - 7], [3, cy + 3.5], [0.5, cy + 6]]), BIGODE, { w: 1.4, s: 0.8, l: 0.6 });
    s += forma(elipse(-2.6, cy + 1.6, 3, 4.1), C.pele, { w: 1.7, s: 1.2, l: 0.8, cc: ccP }) + traco(`M-2.3,${cy} q-1,1.5 0,3`, sombra(C.pele, 0.4), 0.9);
    s += olho(7.4, cy + 1.3, { rx: 2.9, ry: 4.3, iris: '#8a5222', dx: 0.9, dy: 0.6, cc: '#2a120a' });
    s += sobrancelha(4.4, cy - 3, 10.8, cy - 3.8, BIGODE, 2.4, -1.2);
    s += forma(elipse(rx - 0.2, cy + 5, 3.3, 2.9), sombra(C.pele, 0.08), { w: 1.4, s: 1.2, l: 0.9, cc: ccP });
    s += `<ellipse cx="${rx - 5}" cy="${cy + 7}" rx="2.4" ry="1.3" fill="#e3645a" opacity=".42"/>`;
    s += forma(`M${rx - 6},${cy + 11} Q${rx - 2},${cy + 13.8} ${rx - 0.8},${cy + 10.5} Z`, '#6a1c1c', { w: 1.1, s: 0, l: 0, cc: '#2a0c0c' });
    s += forma(blob([[rx - 7, cy + 7.6], [rx - 1, cy + 6.6], [rx + 3.4, cy + 8.4], [rx + 3, cy + 12.8], [rx + 1, cy + 10.6], [rx - 3, cy + 10.4], [rx - 7.5, cy + 10.4]]), BIGODE, { s: 1.6, l: 1.2, w: 1.7 });
    s += chapeuPeao(dir, by);
  }
  return s;
}

// ======================= IDOL =======================
const LILAS = '#b78cf2', LILAS_S = '#7d55c8', LILAS_C = '#ecdcff';
const PRATA = '#c8cedb';
function brilhos(seed, x0, y0, w, h, n, cor = '#fff') {
  const r = rnd(seed);
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * w, y = y0 + r() * h, k = 0.5 + r() * 0.9;
    s += `<path d="M${x},${y - k * 1.4} L${x + k * 0.35},${y - k * 0.35} L${x + k * 1.4},${y} L${x + k * 0.35},${y + k * 0.35} L${x},${y + k * 1.4} L${x - k * 0.35},${y + k * 0.35} L${x - k * 1.4},${y} L${x - k * 0.35},${y - k * 0.35}Z" fill="${cor}" opacity="${0.6 + r() * 0.4}"/>`;
  }
  return s;
}
const prataPadrao = (pid) => `<linearGradient id="${pid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2f4fa"/><stop offset="0.35" stop-color="#c3c9d8"/><stop offset="0.55" stop-color="#e8ebf3"/><stop offset="1" stop-color="#9aa1b8"/></linearGradient>`;
const IDOL = {
  nome: 'idol', hipY: -20, quadX: 5.4, pernaW: 9.6, ombroY: -42, ombroX: 14.4, neckY: -45, cabY: -60.5, rx: 15.8, ry: 15,
  Ws: 13.5, Wq: 11.6, T: 9, bracoR: 4.7, maoR: 4.3, bracoL: 19,
  pele: '#f8d6bf', calca: '#2c2836',
  sapato: { cor: '#f4f4f8', sola: '#ff5fae', faixa: '#ff5fae', cadarco: '#ff8fc6' },
  manga: { comp: 'longa', cor: PRATA, cc: '#3a3c58', padrao: prataPadrao, punho: '#ff6fb3', extra: ({ sx, sy, r }) => brilhos(Math.round(sx * 7 + 99), sx - r, sy - r, r * 2, 14, 4) },
};
function idolTronco(C, dir) {
  const d = formaTronco(C, dir), sy = C.ombroY, hy = C.hipY, pid = uid('pr');
  let i = `<defs>${prataPadrao(pid)}</defs><path d="${d}" fill="url(#${pid})"/>`;
  const cc = '#3a3c58';
  if (dir === 'baixo') {
    i += forma(blob([[-4.2, sy - 6], [4.2, sy - 6], [4.4, hy - 4], [-4.4, hy - 4]], 0.6), '#ff6fb3', { w: 1.4, s: 2, l: 1.2, cc: '#5a0c38' });
    i += forma(`M-4,${sy - 6.5} Q0,${sy + 1.5} 4,${sy - 6.5} Z`, C.pele, { w: 1.2, s: 1, l: 0, cc: '#7a3a2a' });
    i += traco(`M-3.5,${sy + 6} q3.5,1.6 7,0`, '#c0287a', 0.9, 0.7) + brilho(-2.5, sy + 1, 1.5, 0.7, -30, 0.7);
    // lapelas
    for (const k of [-1, 1]) i += forma(`M${k * 3.8},${sy - 6.5} L${k * 11},${sy - 5} L${k * 8.6},${sy + 8} L${k * 4.6},${sy + 2}Z`, '#eef1f8', { w: 1.3, s: 1, l: 0.6, cc });
    i += traco(`M-4.6,${sy + 2} L-4.8,${hy - 4} M4.6,${sy + 2} L4.8,${hy - 4}`, '#6b7090', 0.8);
    for (const k of [-1, 1]) i += `<circle cx="${k * 8.6}" cy="${sy + 12}" r="1.6" fill="#ff6fb3" stroke="#5a0c38" stroke-width="0.6"/><path d="M${k * 8.6 - 0.9},${sy + 11.6} l0.9,1.1 l0.9,-1.1" fill="none" stroke="#fff" stroke-width="0.5"/>`;
    i += traco(`M-10,${hy - 9} q3,1.6 5,0.6 M10,${hy - 9} q-3,1.6 -5,0.6`, '#6b7090', 0.9, 0.7);
    i += `<rect x="-20" y="${hy - 4}" width="40" height="14" fill="${C.calca}"/>` + forma(retRed(-20, hy - 4.6, 40, 2.6, 1), '#ff6fb3', { w: 1, s: 0.8, l: 0.5, cc: '#5a0c38' });
    i += brilhos(11, -13, sy - 3, 8, 18, 6) + brilhos(12, 6, sy - 3, 8, 18, 6);
  } else if (dir === 'cima') {
    i += `<rect x="-20" y="${hy - 4}" width="40" height="14" fill="${C.calca}"/>` + forma(retRed(-20, hy - 4.6, 40, 2.6, 1), '#ff6fb3', { w: 1, s: 0.8, l: 0.5, cc: '#5a0c38' });
    i += traco(`M-7,${sy + 8} q7,2.4 14,0`, '#6b7090', 0.9, 0.7);
    i += brilhos(13, -12, sy - 3, 24, 22, 12);
  } else {
    const T = C.T;
    i += forma(blob([[T - 3, sy - 6], [T + 3, sy - 6], [T + 3, hy - 4], [T - 2.5, hy - 4]], 0.6), '#ff6fb3', { w: 1.3, s: 1.5, l: 1, cc: '#5a0c38' });
    i += forma(`M${T - 5},${sy - 6.5} L${T - 1},${sy - 5.5} L${T - 1.5},${sy + 8} L${T - 3.5},${sy + 3}Z`, '#e9edf6', { w: 1.2, s: 1, l: 0.6, cc });
    i += `<rect x="-20" y="${hy - 4}" width="40" height="14" fill="${C.calca}"/>` + forma(retRed(-20, hy - 4.6, 40, 2.6, 1), '#ff6fb3', { w: 1, s: 0.8, l: 0.5, cc: '#5a0c38' });
    i += traco(`M-5,${sy + 2} q-1.5,6 0,11`, '#6b7090', 0.9, 0.6);
    i += brilhos(14, -8, sy - 3, 12, 20, 7);
  }
  return comp(d, i, { cc, s: 4, l: 2.4 });
}
function franjaIdol(C, dir) {
  const cy = C.cabY, rx = C.rx, ry = C.ry;
  if (dir === 'lado') return blob([[-rx - 2.5, cy + 9], [-rx - 3, cy - 5], [-9, cy - ry - 3.5], [3, cy - ry - 3.8], [rx + 0.6, cy - 8.5], [rx + 1.4, cy - 3.6], [rx - 3, cy - 3.2], [6, cy - 3.8], [2, cy - 4], [0, cy + 1], [-1.5, cy + 9], [-5, cy + 12]], 0.9);
  return blob([[-rx - 2.5, cy + 5], [-rx - 3, cy - 6], [-rx + 1, cy - ry + 0.5], [-6, cy - ry - 3.6], [6, cy - ry - 3.6], [rx - 1, cy - ry + 0.5], [rx + 3, cy - 6], [rx + 2.5, cy + 5], [rx - 1.6, cy - 1], [rx - 3.4, cy - 3.6], [5, cy - 4.4], [-5, cy - 4.4], [-rx + 3.4, cy - 3.6], [-rx + 1.6, cy - 1]], 0.85);
}
function cabeloIdol(d, extra = '') {
  return comp(d, `<path d="${d}" fill="${LILAS}"/>${extra}`, { cc: '#3c1f72', s: 3.4, l: 2.2, op: 0.36, opl: 0.3 });
}
function idolCabeca(C, dir) {
  const cy = C.cabY, rx = C.rx, ry = C.ry;
  const ccP = '#7a3a2a';
  let s = pescoco(C, dir), em = '';
  const anel = (x0, x1, y) => `<path d="M${x0},${y + 1} Q${(x0 + x1) / 2},${y - 3.2} ${x1},${y + 1} Q${(x0 + x1) / 2},${y - 0.6} ${x0},${y + 1}Z" fill="${LILAS_C}" opacity=".95"/>`;
  if (dir === 'baixo') {
    s += forma(formaCabeca(C, dir), C.pele, { cc: ccP, s: 3.4, l: 2 });
    for (const k of [-1, 1]) s += olho(k * 6.4, cy + 2.2, { rx: 4.2, ry: 5.4, iris: '#c0389f', dx: 0.2, dy: 0.5, cc: '#2a0c2a', cilio: k, lw: 2.1 });
    for (const k of [-1, 1]) s += sobrancelha(k * 3.8, cy - 3.6, k * 9.2, cy - 4.4, LILAS_S, 1.4, -1.2);
    s += traco(`M-0.4,${cy + 7} q0.8,0.6 1.2,0`, '#c07a64', 1, 0.9);
    const boca = `M-3.6,${cy + 9.2} Q0,${cy + 10} 3.6,${cy + 9.2} Q2.6,${cy + 13.4} 0,${cy + 13.4} Q-2.6,${cy + 13.4} -3.6,${cy + 9.2}Z`;
    s += `<path d="${boca}" fill="#7a1430"/>` + recorta(boca, `<ellipse cx="0.4" cy="${cy + 13.2}" rx="2.4" ry="1.7" fill="#ff7aa0"/><rect x="-3" y="${cy + 8.8}" width="6" height="1.6" fill="#fff"/>`) + `<path d="${boca}" fill="none" stroke="#3a0818" stroke-width="1" stroke-linejoin="round"/>`;
    for (const k of [-1, 1]) s += `<ellipse cx="${k * 9.4}" cy="${cy + 7.4}" rx="2.7" ry="1.4" fill="#ff7aa8" opacity=".5"/>`;
    // franja + mechas laterais
    const fr = franjaIdol(C, dir);
    let ex = '';
    for (const x of [-9, -4.5, 0, 4.5, 9]) ex += traco(`M${x},${cy - 9} L${x + 0.3},${cy - 4.2}`, LILAS_S, 0.9, 0.8);
    ex += anel(-11, 11, cy - ry + 1.6);
    s += cabeloIdol(fr, ex);
    for (const k of [-1, 1]) {
      const m = blob([[k * (rx - 2.2), cy - 4], [k * (rx + 2.6), cy - 3], [k * (rx + 2), cy + 8], [k * (rx - 0.5), cy + 14.5], [k * (rx - 2.8), cy + 6]]);
      s += cabeloIdol(m, traco(`M${k * rx},${cy - 2} q${k * 0.6},6 ${-k * 0.4},12`, LILAS_C, 0.9, 0.8));
    }
    // headset
    s += traco(`M${-rx - 1.4},${cy - 1} Q${-rx},${cy - ry - 4.6} 0,${cy - ry - 5} Q${rx},${cy - ry - 4.6} ${rx + 1.4},${cy - 1}`, '#1d1b26', 2.6) + traco(`M${-rx + 2},${cy - ry - 0.5} Q0,${cy - ry - 5.6} ${rx - 2},${cy - ry - 0.5}`, '#5a5870', 0.7, 0.9);
    for (const k of [-1, 1]) s += forma(elipse(k * (rx + 1.6), cy + 0.5, 2.8, 4), '#2a2833', { w: 1.5, s: 1.2, l: 0.8 }) + `<ellipse cx="${k * (rx + 1.6)}" cy="${cy + 0.5}" rx="1.4" ry="2.3" fill="#ff6fb3"/>`;
    s += traco(`M${-rx - 1.4},${cy + 3} Q${-rx + 2},${cy + 10.5} -5.4,${cy + 10.2}`, '#1d1b26', 1.5);
    s += forma(elipse(-5, cy + 10.2, 1.7, 1.5), '#2a2833', { w: 1, s: 0.6, l: 0.4 });
    em += halo(-5, cy + 10.2, 3.2, '#ff5fae', 0.9) + `<circle cx="-5" cy="${cy + 10.2}" r="0.7" fill="#ffd0ea"/>`;
  } else if (dir === 'cima') {
    const d = formaCabeca(C, dir);
    const big = blob([[-rx - 2.6, cy + 6], [-rx - 3, cy - 6], [-rx + 1, cy - ry + 0.5], [-6, cy - ry - 3.6], [6, cy - ry - 3.6], [rx - 1, cy - ry + 0.5], [rx + 3, cy - 6], [rx + 2.6, cy + 6], [0, cy + ry + 1]], 0.85);
    let ex = anel(-11, 11, cy - ry + 1.8);
    for (const x of [-8, -3, 2, 7]) ex += traco(`M${x},${cy - ry + 4} q${x * 0.08},8 ${x * 0.15},${ry + 6}`, LILAS_S, 0.9, 0.6);
    s += cabeloIdol(big, ex);
    s += traco(`M${-rx - 1.4},${cy - 1} Q${-rx},${cy - ry - 4.6} 0,${cy - ry - 5} Q${rx},${cy - ry - 4.6} ${rx + 1.4},${cy - 1}`, '#1d1b26', 2.6);
    for (const k of [-1, 1]) s += forma(elipse(k * (rx + 1.6), cy + 0.5, 2.8, 4), '#2a2833', { w: 1.5, s: 1.2, l: 0.8 });
    void d;
  } else {
    s += forma(formaCabeca(C, dir), C.pele, { cc: ccP, s: 3.4, l: 2 });
    s += olho(8.2, cy + 2.2, { rx: 3.3, ry: 5.3, iris: '#c0389f', dx: 1, dy: 0.5, cc: '#2a0c2a', cilio: 1, lw: 2.1 });
    s += sobrancelha(5.4, cy - 3.6, 11.2, cy - 4.2, LILAS_S, 1.4, -1.1);
    s += traco(`M${rx - 0.2},${cy + 5.5} l1.2,1.6 l-1.4,0.4`, ccP, 1, 0.9);
    s += forma(`M${rx - 6.5},${cy + 9.6} Q${rx - 3},${cy + 13} ${rx - 1},${cy + 9.4} Z`, '#8a1838', { w: 1, s: 0, l: 0, cc: '#3a0818' });
    s += `<ellipse cx="${rx - 6.5}" cy="${cy + 7.4}" rx="2.6" ry="1.4" fill="#ff7aa8" opacity=".5"/>`;
    const fr = franjaIdol(C, dir);
    let ex = anel(-11, 7, cy - ry + 1.6);
    for (const x of [5, 9]) ex += traco(`M${x},${cy - 9} L${x + 0.6},${cy - 4.2}`, LILAS_S, 0.9, 0.8);
    s += cabeloIdol(fr, ex);
    s += traco(`M-3,${cy - 1} Q-2,${cy - ry - 4.6} 2,${cy - ry - 4.6}`, '#1d1b26', 2.6);
    s += forma(elipse(-2.4, cy + 1, 3.2, 4.4), '#2a2833', { w: 1.5, s: 1.2, l: 0.8 }) + `<ellipse cx="-2.4" cy="${cy + 1}" rx="1.6" ry="2.6" fill="#ff6fb3"/>`;
    s += traco(`M-1,${cy + 4} Q2,${cy + 11} ${rx - 6},${cy + 11}`, '#1d1b26', 1.5);
    s += forma(elipse(rx - 5.6, cy + 11, 1.7, 1.5), '#2a2833', { w: 1, s: 0.6, l: 0.4 });
    em += halo(rx - 5.6, cy + 11, 3.2, '#ff5fae', 0.9) + `<circle cx="${rx - 5.6}" cy="${cy + 11}" r="0.7" fill="#ffd0ea"/>`;
  }
  return { svg: s, emissivo: em || undefined };
}
function idolBalanco(C, dir) {
  const cy = C.cabY, rx = C.rx, ry = C.ry, fundo = -15;
  let d, ex = '';
  if (dir === 'lado') {
    d = blob([[2, cy - ry - 3], [-rx - 3.5, cy - 6], [-rx - 5, cy + 12], [-rx - 4, fundo - 2], [-12, fundo + 1], [-9, fundo - 2], [-5, fundo], [-3, cy + 22], [-1, cy + 8]], 0.9);
    for (const x of [-15, -10, -6]) ex += traco(`M${x + 2},${cy} q-1,14 ${-0.5},${-fundo + cy - 3 + 8}`, LILAS_S, 0.9, 0.6);
    ex += traco(`M-13,${cy - 4} q-2,12 -1,26`, LILAS_C, 1.1, 0.8);
    return { svg: cabeloIdol(d, ex), jx: -3, jy: cy - 6 };
  }
  if (dir === 'cima') {
    // costas: cabelo liso que acompanha a cabeça, afina no pescoço e abre em pontas desencontradas
    const L = rx + 3.5;
    d = blob([[0, cy - 4], [rx + 2.5, cy + 2], [rx + 1.2, cy + 13], [L, cy + 24], [L + 0.5, fundo - 3], [L - 3, fundo + 0.5], [L - 6, fundo - 2.5], [7, fundo + 1.5], [3, fundo - 1.8], [-1, fundo + 1.8], [-5, fundo - 1.6], [-9, fundo + 1], [-L + 5, fundo - 2.2], [-L + 1.5, fundo + 0.4], [-L - 0.5, fundo - 3.5], [-L, cy + 24], [-rx - 1.2, cy + 13], [-rx - 2.5, cy + 2]], 0.9);
    for (const x of [-14, -9, -4.5, 0, 4.5, 9, 14]) ex += traco(`M${x * 0.75},${cy + 6} Q${x * 0.95},${cy + 22} ${x * 1.02},${fundo - 2}`, LILAS_S, 1, 0.6);
    for (const x of [-11, 2.5]) ex += traco(`M${x},${cy + 9} Q${x + 0.8},${cy + 22} ${x + 0.4},${fundo - 6}`, LILAS_C, 1.3, 0.8);
    ex += `<path d="M${-rx},${cy + 16} Q0,${cy + 22} ${rx},${cy + 16} L${rx},${cy + 19} Q0,${cy + 25} ${-rx},${cy + 19}Z" fill="${LILAS_C}" opacity=".45"/>`;
    return { svg: cabeloIdol(d, ex), jx: 0, jy: cy - 6 };
  }
  const L = rx + 6.5;
  d = blob([[0, cy - ry - 3.5], [rx + 3, cy - 9], [L, cy + 6], [L + 0.6, cy + 26], [L - 1, fundo - 0.5], [L - 5, fundo - 2.5], [9, fundo + 0.5], [4.5, fundo - 2], [0, fundo + 0.5], [-4.5, fundo - 2], [-9, fundo + 0.5], [-L + 5, fundo - 2.5], [-L + 1, fundo - 0.5], [-L - 0.6, cy + 26], [-L, cy + 6], [-rx - 3, cy - 9]], 0.9);
  for (const x of [-17, -11, -5, 0, 5, 11, 17]) ex += traco(`M${x * 0.8},${cy + 2} q${x * 0.08},12 ${x * 0.2},${-fundo + cy - 2 + 6}`, LILAS_S, 0.9, 0.55);
  for (const k of [-1, 1]) ex += traco(`M${k * (L - 3)},${cy + 6} q${k},12 0,22`, LILAS_C, 1.1, 0.75);
  return { svg: cabeloIdol(d, ex), jx: 0, jy: cy - 6 };
}

// ======================= BENZEDEIRA =======================
const GRIS = '#cfd0d8', VERDE = '#3f8f43', OURO2 = '#f0bd3a';
const BENZ = {
  nome: 'benzedeira', hipY: -17, quadX: 5, pernaW: 9, ombroY: -35.5, ombroX: 13.2, neckY: -38.5, cabY: -52, rx: 14.6, ry: 13.6,
  Ws: 15, Wq: 15.5, T: 11, bracoR: 5, maoR: 4.3, bracoL: 17,
  pele: '#c98a5e', calca: '#6a3c22', saia: true,
  sapato: { cor: '#5a3a26', sola: '#2a1a12' },
  manga: { comp: 'curta', cor: VERDE, cc: '#123a1a', punho: '#f0e2c8', extra: ({ cot, r }) => franja(cot[0] - r, cot[1] + 1, cot[0] + r, cot[1] + 1) },
};
function franja(x0, y0, x1, y1, n) {
  const N = n ?? Math.max(3, Math.round(Math.hypot(x1 - x0, y1 - y0) / 1.6));
  let s = '';
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    s += traco(`M${x},${y} l0,2.6`, '#7a4a08', 1.5) + traco(`M${x},${y} l0,2.3`, OURO2, 0.9);
  }
  return s;
}
function benzTronco(C, dir) {
  const sy = C.ombroY, hy = C.hipY;
  let s = '';
  const SAIA = '#7a4626';
  // saia comprida (faz parte do quadril)
  const saia = dir === 'lado'
    ? blob([[-10, hy - 5], [10, hy - 5], [14, -9], [15.5, -4.4], [0, -3.4], [-14.5, -4.4], [-13.5, -9]])
    : blob([[-13, hy - 5], [13, hy - 5], [17, -9], [18.5, -4.6], [0, -3.4], [-18.5, -4.6], [-17, -9]]);
  let si = `<path d="${saia}" fill="${SAIA}"/>`;
  for (const x of (dir === 'lado' ? [-6, 0, 6] : [-11, -5, 5, 11])) si += traco(`M${x * 0.8},${hy - 2} q${x * 0.05},6 ${x * 0.25},${-hy - 6}`, sombra(SAIA, 0.4), 1, 0.7);
  si += `<rect x="-20" y="-7" width="40" height="3" fill="${luz(SAIA, 0.2)}"/>`;
  s += comp(saia, si, { cc: '#2a1206', s: 4, l: 2 });
  if (dir !== 'cima') {
    const ax = dir === 'lado' ? 6 : 0, aw = dir === 'lado' ? 6 : 10;
    const av = blob([[ax - aw, hy - 4], [ax + aw, hy - 4], [ax + aw + 1, -7.4], [ax, -6.4], [ax - aw - 1, -7.4]], 0.6);
    s += forma(av, '#f4e8d0', { cc: '#5a4428', s: 2, l: 1 });
    for (let x = ax - aw; x <= ax + aw + 0.1; x += 2.4) s += `<circle cx="${x}" cy="${-6.6 - 0.12 * Math.abs(x - ax)}" r="1.2" fill="#fffaf0" stroke="#8a7458" stroke-width="0.5"/>`;
    s += traco(`M${ax - aw + 2},${hy - 1} q${aw - 2},1 ${2 * aw - 4},0`, '#c9b490', 0.8, 0.7);
  }
  // blusa (tronco)
  const d = formaTronco(C, dir);
  let i = `<path d="${d}" fill="#efe1c6"/>`;
  i += traco(`M-6,${hy - 2} q6,2 12,0`, '#b39a70', 0.9, 0.7);
  // xale
  let xd;
  if (dir === 'baixo') xd = blob([[-C.Ws - 2.5, sy - 2], [-6, sy - 6.5], [6, sy - 6.5], [C.Ws + 2.5, sy - 2], [C.Ws + 1, sy + 6], [0, sy + 16], [-C.Ws - 1, sy + 6]], 0.7);
  else if (dir === 'cima') xd = blob([[-C.Ws - 2.5, sy - 2], [-6, sy - 6.5], [6, sy - 6.5], [C.Ws + 2.5, sy - 2], [C.Ws + 1, sy + 8], [0, sy + 18], [-C.Ws - 1, sy + 8]], 0.7);
  else xd = blob([[-C.T - 2.5, sy - 3], [0, sy - 7], [C.T + 1.5, sy - 4], [C.T + 3, sy + 7], [C.T - 2, sy + 12], [-3, sy + 15], [-C.T - 2.5, sy + 8]], 0.7);
  let xi = `<path d="${xd}" fill="${VERDE}"/>`;
  const r = rnd(dir.length * 31);
  for (let k = 0; k < 18; k++) xi += `<circle cx="${-18 + r() * 36}" cy="${sy - 6 + r() * 24}" r="0.65" fill="${OURO2}" opacity=".9"/>`;
  xi += traco(`M-7,${sy - 2} q7,6 14,0`, sombra(VERDE, 0.4), 1, 0.6);
  i += comp(xd, xi, { cc: '#123a1a', s: 3, l: 2, w: 1.8 });
  s += comp(d, i, { cc: '#4a3a24', s: 3.5, l: 2 });
  // franja dourada na ponta do xale (por fora do recorte)
  if (dir === 'baixo') s += franja(-C.Ws - 0.5, sy + 6.5, -0.5, sy + 15.6) + franja(0.5, sy + 15.6, C.Ws + 0.5, sy + 6.5);
  else if (dir === 'cima') s += franja(-C.Ws - 0.5, sy + 8.5, -0.5, sy + 17.6) + franja(0.5, sy + 17.6, C.Ws + 0.5, sy + 8.5);
  else s += franja(-C.T - 2, sy + 8.5, -3, sy + 14.6) + franja(-2, sy + 14.6, C.T - 2, sy + 11.6);
  // broche
  if (dir === 'baixo') s += forma(elipse(0, sy - 3, 2, 1.8), OURO2, { cc: '#5a3606', w: 1, s: 0.6, l: 0.5 });
  return s;
}
function benzCabeca(C, dir) {
  const cy = C.cabY, rx = C.rx, ry = C.ry, ccP = '#5a2a14';
  let s = pescoco(C, dir);
  const nuvem = (cx, cy0, rr, pts) => blob(pts.map(([a, k]) => [cx + Math.cos(a) * rr * k, cy0 + Math.sin(a) * rr * k * 0.92]), 1);
  const cab = (d, ex = '') => comp(d, `<path d="${d}" fill="${GRIS}"/>${ex}`, { cc: '#3a3a4c', s: 3, l: 2, op: 0.3 });
  if (dir === 'baixo') {
    // coque
    s += cab(elipse(0, cy - ry - 3.2, 6.6, 5.6), traco(`M-3.5,${cy - ry - 4} q3.5,-3 7,0 M-4,${cy - ry - 1.6} q4,-2.4 8,0`, '#8a8a9c', 0.9, 0.8));
    s += traco(`M3.8,${cy - ry - 7.5} l3.4,-2.6`, '#7a4a20', 1.2) + `<circle cx="7.4" cy="${cy - ry - 10.2}" r="1" fill="${OURO2}"/>`;
    // cabelo atrás (volume)
    const N = []; for (let k = 0; k < 14; k++) { const a = Math.PI * (0.92 + k / 13 * 1.16); N.push([a, k % 2 ? 1.08 : 1.16]); }
    s += cab(blob([[-rx - 3, cy + 4], ...N.map(([a, k]) => [Math.cos(a) * rx * k, cy - 1 + Math.sin(a) * ry * k * 0.95]), [rx + 3, cy + 4], [0, cy]]));
    for (const k of [-1, 1]) s += forma(elipse(k * (rx + 0.2), cy + 2, 3, 3.8), C.pele, { w: 1.6, s: 1, l: 0.6, cc: ccP }) + `<circle cx="${k * (rx + 0.6)}" cy="${cy + 5.6}" r="1" fill="${OURO2}" stroke="#5a3606" stroke-width="0.4"/>`;
    s += forma(formaCabeca(C, dir), C.pele, { cc: ccP, s: 3.4, l: 2 });
    // franja ondulada
    s += cab(blob([[-rx - 1, cy - 1], [-rx, cy - 8], [-8, cy - ry - 0.5], [0, cy - ry - 1.4], [8, cy - ry - 0.5], [rx, cy - 8], [rx + 1, cy - 1], [rx - 2.5, cy - 4.4], [8, cy - 6.4], [3.5, cy - 4.2], [0, cy - 6.6], [-3.5, cy - 4.2], [-8, cy - 6.4], [-rx + 2.5, cy - 4.4]], 0.9), traco(`M-9,${cy - 9} q3,-2 6,0 M3,${cy - 9} q3,-2 6,0`, '#ffffff', 0.9, 0.7));
    // olhos sorridentes atrás dos óculos
    for (const k of [-1, 1]) s += olho(k * 5.8, cy + 2.4, { rx: 2.7, ry: 3.2, iris: '#5a3218', dx: 0, dy: 0.4, cc: '#2a120a', palpebra: 0.35, pele: C.pele, lw: 1.5 });
    for (const k of [-1, 1]) s += sobrancelha(k * 3.4, cy - 2.4, k * 8.4, cy - 2.2, '#9a9aa8', 1.4, -1.4);
    for (const k of [-1, 1]) s += traco(`M${k * 10.4},${cy + 2} l${k * 1.5},-0.8 M${k * 10.4},${cy + 3.4} l${k * 1.6},0.4`, sombra(C.pele, 0.35), 0.7);
    s += forma(elipse(0, cy + 6.2, 2.7, 2.3), sombra(C.pele, 0.08), { w: 1.2, s: 1, l: 0.7, cc: ccP });
    s += traco(`M-3.5,${cy + 9.6} Q0,${cy + 12.2} 3.5,${cy + 9.6}`, '#6a2a1a', 1.2) + traco(`M-4.5,${cy + 9.4} l1,-0.4 M4.5,${cy + 9.4} l-1,-0.4`, '#6a2a1a', 0.8);
    for (const k of [-1, 1]) s += `<ellipse cx="${k * 9}" cy="${cy + 7}" rx="2.6" ry="1.5" fill="#e0605a" opacity=".45"/>`;
    // óculos redondos com reflexo
    for (const k of [-1, 1]) {
      s += `<circle cx="${k * 5.8}" cy="${cy + 2.4}" r="4.7" fill="#dff4ff" opacity=".18"/>`;
      s += `<path d="M${k * 5.8 - 3.2},${cy + 4.2} L${k * 5.8 - 0.6},${cy - 1.4} L${k * 5.8 + 0.8},${cy - 1.2} L${k * 5.8 - 1.8},${cy + 4.6}Z" fill="#fff" opacity=".7"/>`;
      s += `<circle cx="${k * 5.8}" cy="${cy + 2.4}" r="4.7" fill="none" stroke="#3a2210" stroke-width="2.2"/><circle cx="${k * 5.8}" cy="${cy + 2.4}" r="4.7" fill="none" stroke="#c08a3a" stroke-width="0.7"/>`;
      s += traco(`M${k * 10.5},${cy + 1.6} L${k * (rx - 0.2)},${cy + 0.8}`, '#3a2210', 1.3);
    }
    s += traco(`M-1.1,${cy + 1.6} Q0,${cy + 0.6} 1.1,${cy + 1.6}`, '#3a2210', 1.3);
  } else {
    // lado
    s += cab(elipse(-7.5, cy - ry + 0.5, 6.6, 6), traco(`M-11,${cy - ry} q3.5,-3 7,0 M-11.5,${cy - ry + 2.6} q4,-2.4 8,0`, '#8a8a9c', 0.9, 0.8));
    s += traco(`M-4,${cy - ry - 4} l3.4,-2.6`, '#7a4a20', 1.2) + `<circle cx="-0.4" cy="${cy - ry - 6.8}" r="1" fill="${OURO2}"/>`;
    s += forma(formaCabeca(C, dir), C.pele, { cc: ccP, s: 3.4, l: 2 });
    s += cab(blob([[-rx - 2.5, cy + 6], [-rx - 2.5, cy - 6], [-6, cy - ry - 1], [4, cy - ry - 1], [rx - 1, cy - 8], [rx, cy - 4.4], [8, cy - 5.4], [4, cy - 4], [0, cy - 3], [-1, cy + 3], [-4, cy + 7]], 0.9), traco(`M-9,${cy - 7} q4,-3 9,-1`, '#fff', 0.9, 0.7));
    s += forma(elipse(-2.2, cy + 2, 2.8, 3.8), C.pele, { w: 1.6, s: 1, l: 0.6, cc: ccP }) + `<circle cx="-2" cy="${cy + 5.6}" r="1" fill="${OURO2}"/>`;
    s += olho(8, cy + 2.4, { rx: 2.2, ry: 3.2, iris: '#5a3218', dx: 0.6, dy: 0.4, cc: '#2a120a', palpebra: 0.35, pele: C.pele, lw: 1.5 });
    s += sobrancelha(5.8, cy - 2.4, 10.4, cy - 2.2, '#9a9aa8', 1.4, -1.2);
    s += forma(elipse(rx - 0.4, cy + 5.8, 2.6, 2.4), sombra(C.pele, 0.08), { w: 1.2, s: 1, l: 0.7, cc: ccP });
    s += traco(`M${rx - 6},${cy + 9.8} Q${rx - 3.5},${cy + 11.4} ${rx - 1.6},${cy + 9.6}`, '#6a2a1a', 1.2);
    s += `<ellipse cx="${rx - 6.5}" cy="${cy + 7.2}" rx="2.4" ry="1.4" fill="#e0605a" opacity=".45"/>`;
    s += `<ellipse cx="8.4" cy="${cy + 2.4}" rx="3" ry="4.7" fill="#dff4ff" opacity=".18"/><path d="M6.6,${cy + 4.4} L8.3,${cy - 1.4} L9.3,${cy - 1.2} L7.6,${cy + 4.8}Z" fill="#fff" opacity=".7"/>`;
    s += `<ellipse cx="8.4" cy="${cy + 2.4}" rx="3" ry="4.7" fill="none" stroke="#3a2210" stroke-width="2.1"/>`;
    s += traco(`M5.4,${cy + 1.6} L-1.5,${cy + 0.6}`, '#3a2210', 1.3);
  }
  return { svg: s };
}
function ramo(hx, hy) {
  let s = '', em = '';
  s += traco(`M${hx},${hy + 1} Q${hx + 2},${hy - 8} ${hx + 0.5},${hy - 18}`, '#2e5a1a', 2.6) + traco(`M${hx},${hy + 1} Q${hx + 2},${hy - 8} ${hx + 0.5},${hy - 18}`, '#6ab040', 1.2);
  const folhas = [[hx + 0.5, hy - 19.5, 0], [hx - 3.6, hy - 15, -50], [hx + 4.8, hy - 13.5, 50], [hx - 3.4, hy - 9, -62], [hx + 5, hy - 7.5, 58]];
  for (const [x, y, a] of folhas) {
    const d = `M${x},${y + 4} Q${x - 3.2},${y} ${x},${y - 4.4} Q${x + 3.2},${y} ${x},${y + 4}Z`;
    s += `<g transform="rotate(${a} ${x} ${y + 2})">${forma(d, '#7ee05a', { cc: '#1e5a14', w: 1.1, s: 1, l: 0.6 })}${traco(`M${x},${y + 2.6} L${x},${y - 2.4}`, '#c8ff9a', 0.5, 0.9)}</g>`;
    em += `<g transform="rotate(${a} ${x} ${y + 2})"><path d="${d}" fill="#9dff7a" opacity=".55"/></g>`;
  }
  em = halo(hx + 0.5, hy - 13, 9, '#6dff5a', 0.6) + em;
  const r = rnd(7);
  for (let k = 0; k < 6; k++) { const x = hx - 6 + r() * 13, y = hy - 24 + r() * 16; em += `<circle cx="${x}" cy="${y}" r="${0.5 + r() * 0.6}" fill="#e4ffc8"/>`; }
  return { svg: s, emissivo: em };
}

// ======================= PM DO CONSÓRCIO =======================
const PRETO = '#26272e', AMARELO = '#f4d21c';
const PM = {
  nome: 'pm', hipY: -22, quadX: 6.6, pernaW: 11.4, ombroY: -46, ombroX: 15.8, neckY: -49, cabY: -62.5, rx: 15.4, ry: 14.4,
  Ws: 16.2, Wq: 13.6, T: 11, bracoR: 5.9, maoR: 5, bracoL: 21,
  pele: '#b97a50', calca: '#2b2c35', bolsoCargo: true,
  sapato: { cor: '#1c1c22', sola: '#0c0c10', cano: 6, cadarco: '#5a5a66' },
  manga: { comp: 'curta', cor: '#8b92a2', cc: '#1e2232', punho: '#7a8192', extra: ({ cot, r, dir }) => dir === 'cima' ? '' : forma(retRed(cot[0] - r * 0.6, cot[1] - 7.5, r * 1.2, 3, 0.8), AMARELO, { w: 1, s: 0.6, l: 0.4, cc: '#5a4806' }) },
};
function qr(x, y, m = 1.1) {
  const r = rnd(42), N = 9;
  let s = `<rect x="${x - 1}" y="${y - 1}" width="${N * m + 2}" height="${N * m + 2}" rx="0.8" fill="#f4f6fa" stroke="#111" stroke-width="0.6"/>`;
  const fin = (i, j) => (i < 3 && j < 3) || (i > 5 && j < 3) || (i < 3 && j > 5);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    let on;
    if (fin(i, j)) { const a = i % 6, b = j % 6; on = !(a === 1 && b === 1) || false; if (a === 1 && b === 1) on = true; on = (a === 0 || a === 2 || b === 0 || b === 2 || (a === 1 && b === 1)); }
    else on = r() > 0.5;
    if (on) s += `<rect x="${x + i * m}" y="${y + j * m}" width="${m + 0.05}" height="${m + 0.05}" fill="#111"/>`;
  }
  return s;
}
function pmTronco(C, dir) {
  const d = formaTronco(C, dir), sy = C.ombroY, hy = C.hipY;
  let i = `<path d="${d}" fill="#8b92a2"/>`;
  const cc = '#121318';
  let colete;
  if (dir === 'lado') colete = blob([[-C.T + 0.5, sy - 2], [-2, sy - 4.5], [4, sy - 4], [C.T + 1.4, sy + 4], [C.T + 0.6, hy - 2], [-C.T + 0.2, hy - 2]], 0.6);
  else colete = blob([[-C.Ws + 3, sy - 3], [-6.5, sy - 4.5], [-4, sy - 1], [4, sy - 1], [6.5, sy - 4.5], [C.Ws - 3, sy - 3], [C.Ws + 0.6, sy + 6], [C.Wq + 0.6, hy - 2], [-C.Wq - 0.6, hy - 2], [-C.Ws - 0.6, sy + 6]], 0.6);
  let ci = `<path d="${colete}" fill="${PRETO}"/>`;
  const fy = sy + 12.5;
  ci += `<rect x="-24" y="${fy}" width="48" height="3.6" fill="${AMARELO}"/><rect x="-24" y="${fy + 1.4}" width="48" height="0.8" fill="#fffbe0" opacity=".9"/>`;
  if (dir === 'baixo') {
    ci += forma(retRed(-11, sy + 2.5, 7, 8, 1.4), '#33343c', { w: 1.2, s: 1, l: 0.6, cc }) + forma(retRed(4, sy + 2.5, 7, 8, 1.4), '#33343c', { w: 1.2, s: 1, l: 0.6, cc });
    ci += forma(`M-9.5,${sy - 1} l2.5,-0.6 l2.5,0.6 l0,2.4 q-2.5,2.2 -5,0 Z`, OURO, { cc: '#5a3606', w: 0.8, s: 0.6, l: 0.4 });
    ci += forma(retRed(6, sy - 1.5, 3, 5, 0.8), '#1a1a20', { w: 0.8, s: 0.6, l: 0.4 }) + traco(`M7.5,${sy - 1.5} l0,-4`, '#1a1a20', 1) + `<circle cx="7.5" cy="${sy + 0.4}" r="0.5" fill="#ff3a3a"/>`;
    ci += traco(`M0,${sy - 1} L0,${fy}`, '#0e0e12', 0.8, 0.8);
  } else if (dir === 'cima') {
    ci += qr(-5, sy + 0.5, 1.15);
    ci += traco(`M-12,${hy - 7} q12,2.4 24,0`, '#0e0e12', 0.9, 0.6);
  } else {
    ci += forma(retRed(3, sy + 3, 6, 8, 1.4), '#33343c', { w: 1.2, s: 1, l: 0.6, cc });
  }
  ci += traco(`M-12,${fy + 9} q4,1.6 8,0.4`, '#0e0e12', 0.9, 0.6);
  i += comp(colete, ci, { cc, w: 1.8, s: 3, l: 1.8 });
  // gola da camisa
  if (dir === 'baixo') for (const k of [-1, 1]) i += forma(`M${k * 1},${sy - 4} L${k * 7},${sy - 6.5} L${k * 6},${sy - 1.6}Z`, '#a1a8b8', { w: 1.1, s: 0.8, l: 0.5, cc: '#1e2232' });
  // cinto de guarnição
  i += `<rect x="-24" y="${hy - 2}" width="48" height="12" fill="${C.calca}"/>`;
  i += forma(retRed(-24, hy - 3, 48, 4.4, 1), '#17171c', { w: 1.2, s: 1, l: 0.6 });
  if (dir === 'baixo') i += forma(retRed(-2.6, hy - 3.2, 5.2, 4.6, 0.8), '#c9ccd6', { w: 0.9, s: 0.6, l: 0.4, cc: '#2a2c38' });
  const bolsos = dir === 'lado' ? [-6, 3] : [-10, 6];
  for (const x of bolsos) i += forma(retRed(x, hy - 2.6, 4.4, 5.4, 0.9), '#2e2f37', { w: 1, s: 0.8, l: 0.5, cc });
  return comp(d, i, { cc, s: 4, l: 2.2 });
}
function pmCabeca(C, dir) {
  const cy = C.cabY, rx = C.rx, ry = C.ry, ccP = '#4a200e';
  const CAB = '#2a1a12', BONE = '#24252c';
  let s = pescoco(C, dir);
  if (dir === 'baixo') {
    for (const k of [-1, 1]) s += forma(elipse(k * (rx + 0.2), cy + 2, 3.1, 4), C.pele, { w: 1.7, s: 1.2, l: 0.8, cc: ccP });
    s += forma(formaCabeca(C, dir), C.pele, { cc: ccP, s: 3.4, l: 2 });
    s += recorta(formaCabeca(C, dir), `<path d="M${-rx},${cy + 4} Q0,${cy + 22} ${rx},${cy + 4} L${rx},${cy + 20} L${-rx},${cy + 20}Z" fill="#3a3050" opacity=".22"/>`);
    for (const k of [-1, 1]) s += forma(blob([[k * (rx - 0.2), cy - 6], [k * (rx - 3.5), cy - 5], [k * (rx - 3), cy + 1], [k * (rx - 0.6), cy + 2]]), CAB, { w: 1.3, s: 0.8, l: 0.6 });
    for (const k of [-1, 1]) s += olho(k * 6, cy + 2.4, { rx: 3.4, ry: 4.2, iris: '#4a2a14', dx: 0, dy: 0.7, cc: '#1a0c08', palpebra: 0.22, pele: C.pele });
    for (const k of [-1, 1]) s += sobrancelha(k * 2.2, cy - 1, k * 10, cy - 3.6, CAB, 2.6, 0.3);
    s += traco(`M-0.6,${cy - 2.4} l0,1.6 M0.6,${cy - 2.4} l0,1.6`, sombra(C.pele, 0.4), 0.6, 0.8);
    s += forma(elipse(0, cy + 6.6, 3, 2.5), sombra(C.pele, 0.08), { w: 1.3, s: 1, l: 0.8, cc: ccP });
    s += traco(`M-3.4,${cy + 11} Q0,${cy + 9.6} 3.4,${cy + 11.2}`, '#3a1408', 1.3);
    // boné: copa + aba + distintivo
    s += '<g transform="translate(0,-2.6)">';
    const copa = blob([[-rx - 1.2, cy - 3], [-rx, cy - 10], [-9, cy - ry - 6], [0, cy - ry - 8], [9, cy - ry - 6], [rx, cy - 10], [rx + 1.2, cy - 3], [0, cy - 4.6]], 0.9);
    s += forma(copa, BONE, { cc: '#0c0c10', s: 3, l: 2.2, cl: '#4a4c5a' });
    s += traco(`M0,${cy - ry - 7.6} L0,${cy - 5}`, '#0c0c10', 0.8, 0.7);
    const aba = blob([[-rx + 0.5, cy - 4], [0, cy - 5.2], [rx - 0.5, cy - 4], [rx - 2, cy - 1], [0, cy + 0.2], [-rx + 2, cy - 1]], 0.8);
    s += forma(aba, '#1a1b20', { cc: '#08080c', s: 1.6, l: 1, cl: '#3a3c48' });
    s += forma(`M0,${cy - 15.5} l3.4,1.2 l0,3 q-1,3.4 -3.4,4.6 q-2.4,-1.2 -3.4,-4.6 l0,-3Z`, OURO, { cc: '#5a3606', w: 1.1, s: 1, l: 0.6 }) + `<circle cx="0" cy="${cy - 11.6}" r="1.1" fill="#fff3b0"/>`;
    s += brilho(-8, cy - ry - 2, 2.4, 1, -30, 0.5) + '</g>';
  } else if (dir === 'cima') {
    for (const k of [-1, 1]) s += forma(elipse(k * (rx + 0.2), cy + 2, 3.1, 4), C.pele, { w: 1.7, s: 1.2, l: 0.8, cc: ccP });
    s += forma(formaCabeca(C, dir), CAB, { s: 3, l: 1.6 });
    for (const x of [-7, -3.5, 0, 3.5, 7]) s += traco(`M${x},${cy + 4} l${x * 0.05},${7 - Math.abs(x) * 0.25}`, '#4a3428', 0.9, 0.8);
    s += recorta(formaCabeca(C, dir), `<path d="M-6,${cy + ry} Q0,${cy + ry - 4} 6,${cy + ry} Z" fill="${C.pele}"/>`);
    const copa = blob([[-rx - 1.2, cy + 1], [-rx, cy - 10], [-9, cy - ry - 6], [0, cy - ry - 8], [9, cy - ry - 6], [rx, cy - 10], [rx + 1.2, cy + 1], [0, cy + 2.4]], 0.9);
    s += forma(copa, BONE, { cc: '#0c0c10', s: 3, l: 2.2, cl: '#4a4c5a' });
    s += forma(`M-4,${cy + 2} Q0,${cy - 3} 4,${cy + 2}Z`, CAB, { w: 1, s: 0, l: 0 }) + forma(retRed(-4.5, cy - 0.8, 9, 1.8, 0.8), '#5a5c68', { w: 0.8, s: 0.5, l: 0.3 });
    s += brilho(-8, cy - ry - 2, 2.4, 1, -30, 0.5);
  } else {
    s += forma(formaCabeca(C, dir), C.pele, { cc: ccP, s: 3.4, l: 2 });
    s += recorta(formaCabeca(C, dir), forma(blob([[-rx - 3, cy + 10], [-rx - 3, cy - 10], [0, cy - 10], [1, cy - 2], [-2, cy + 4], [-6, cy + 12]]), CAB, { s: 1.6, l: 1, w: 1.3 }) + `<path d="M0,${cy + 6} Q6,${cy + 18} ${rx + 2},${cy + 4} L${rx + 2},${cy + 20} L0,${cy + 20}Z" fill="#3a3050" opacity=".22"/>`);
    s += forma(elipse(-2, cy + 2, 3, 4), C.pele, { w: 1.6, s: 1, l: 0.6, cc: ccP });
    s += olho(7.6, cy + 2.4, { rx: 2.8, ry: 4.2, iris: '#4a2a14', dx: 0.8, dy: 0.7, cc: '#1a0c08', palpebra: 0.22, pele: C.pele });
    s += sobrancelha(4.4, cy - 1.4, 11, cy - 3, CAB, 2.4, 0.3);
    s += forma(elipse(rx - 0.2, cy + 6, 3, 2.5), sombra(C.pele, 0.08), { w: 1.3, s: 1, l: 0.8, cc: ccP });
    s += traco(`M${rx - 6},${cy + 11} L${rx - 1.6},${cy + 10.6}`, '#3a1408', 1.3);
    s += '<g transform="translate(0,-2.4)">';
    const copa = blob([[-rx - 1.2, cy - 1], [-rx, cy - 10], [-8, cy - ry - 6], [2, cy - ry - 7.6], [10, cy - ry - 5], [rx + 1, cy - 8], [rx + 1.4, cy - 3], [0, cy - 3.6]], 0.9);
    s += forma(copa, BONE, { cc: '#0c0c10', s: 3, l: 2.2, cl: '#4a4c5a' });
    s += forma(blob([[rx - 4, cy - 5], [rx + 9, cy - 3.6], [rx + 9.6, cy - 1.6], [rx - 3, cy - 1.8]], 0.7), '#1a1b20', { cc: '#08080c', s: 1, l: 0.8, cl: '#3a3c48' });
    s += forma(`M9,${cy - 14} l2.6,1 l0,2.4 q-0.8,2.6 -2.6,3.6 q-1.6,-1 -2.2,-3.6 l0,-2.4Z`, OURO, { cc: '#5a3606', w: 1, s: 0.8, l: 0.5 });
    s += brilho(-6, cy - ry - 2, 2.4, 1, -30, 0.5) + '</g>';
  }
  return { svg: s };
}
function cassetete(hx, hy, sg, dir) {
  const ang = dir === 'lado' ? 18 : sg * -22;
  const L = 15;
  let s = `<g transform="rotate(${ang} ${hx} ${hy})">`;
  s += forma(retRed(hx - 1.6, hy - 4, 3.2, 8, 1.4), '#1c1c22', { w: 1.2, s: 0.8, l: 0.5 });
  s += forma(retRed(hx - 1.9, hy + 3.4, 3.8, L, 1.9), '#bff8ff', { cc: '#0a5a6a', w: 1.2, s: 1, l: 0.6 });
  s += `</g>`;
  let e = `<g transform="rotate(${ang} ${hx} ${hy})">` + `<rect x="${hx - 4.5}" y="${hy + 1}" width="9" height="${L + 5}" rx="4.5" fill="#31e8ff" opacity=".35"/>` +
    `<rect x="${hx - 1.2}" y="${hy + 4}" width="2.4" height="${L - 1.4}" rx="1.2" fill="#e8ffff"/></g>`;
  const tip = [hx - Math.sin((ang * Math.PI) / 180) * (hy + L + 3 - hy), hy + Math.cos((ang * Math.PI) / 180) * (L + 3)];
  e = halo(tip[0], tip[1], 8, '#4ff0ff', 0.7) + e;
  return { svg: s, emissivo: e };
}

// ======================= DRONES =======================
function drone(nome, R, elite) {
  const cy = -(R + 14);
  const METAL = elite ? '#7d8698' : '#8e9aae';
  const out = {};
  for (const dir of ['baixo', 'cima', 'lado']) {
    const pecas = [];
    let s = '', em = '';
    // braços das hélices
    const hub = [[-R * 0.95, cy - R * 0.95], [R * 0.95, cy - R * 0.95]];
    for (const [x, y] of hub) s += traco(`M${x * 0.55},${cy - R * 0.55} L${x},${y}`, '#1a1e2a', 3.6) + traco(`M${x * 0.55},${cy - R * 0.55} L${x},${y}`, '#5a6478', 1.8);
    if (elite) for (const k of [-1, 1]) s += traco(`M${k * R * 0.3},${cy - R * 0.9} Q${k * R * 0.5},${cy - R * 1.35} ${k * R * 0.35},${cy - R * 1.55}`, '#4a0a3a', 3) + traco(`M${k * R * 0.3},${cy - R * 0.9} Q${k * R * 0.5},${cy - R * 1.35} ${k * R * 0.35},${cy - R * 1.55}`, '#ff3cc8', 1.6) + forma(elipse(k * R * 0.35, cy - R * 1.6, 1.8, 1.8), '#ff3cc8', { w: 1, s: 0.6, l: 0.5 });
    const esf = elipse(0, cy, R, R * 0.96);
    let i = `<path d="${esf}" fill="${METAL}"/>`;
    // painéis
    i += traco(`M${-R},${cy - R * 0.1} Q0,${cy + R * 0.25} ${R},${cy - R * 0.1}`, '#3a4256', 1.1, 0.9);
    i += traco(`M${-R * 0.55},${cy - R * 0.85} Q${-R * 0.7},${cy} ${-R * 0.5},${cy + R * 0.85}`, '#3a4256', 1, 0.8) + traco(`M${R * 0.55},${cy - R * 0.85} Q${R * 0.7},${cy} ${R * 0.5},${cy + R * 0.85}`, '#3a4256', 1, 0.8);
    if (elite) for (const y of [cy + R * 0.32, cy + R * 0.52]) i += `<rect x="${-R}" y="${y}" width="${2 * R}" height="${R * 0.12}" fill="#ff8a1e"/>`;
    const r = rnd(R * 3 + dir.length);
    for (let k = 0; k < 10; k++) { const a = r() * Math.PI * 2, rr = R * (0.45 + r() * 0.45); i += `<circle cx="${Math.cos(a) * rr}" cy="${cy + Math.sin(a) * rr}" r="0.75" fill="#d8dee8" stroke="#3a4256" stroke-width="0.4"/>`; }
    s += comp(esf, i, { cc: '#151a26', s: R * 0.28, l: R * 0.14, op: 0.38, opl: 0.3 });
    s += brilho(-R * 0.45, cy - R * 0.5, R * 0.22, R * 0.1, -40, 0.85);
    if (dir !== 'cima') {
      const ex = dir === 'lado' ? R * 0.55 : 0, er = R * 0.36;
      s += forma(elipse(ex, cy + R * 0.05, dir === 'lado' ? er * 0.75 : er * 1.1, er * 1.05), '#1a1e2a', { w: 1.6, s: 0, l: 0 });
      s += `<ellipse cx="${ex}" cy="${cy + R * 0.05}" rx="${(dir === 'lado' ? er * 0.5 : er * 0.75)}" ry="${er * 0.72}" fill="#c01818"/>`;
      if (elite) s += `<path d="M${ex - er * 1.3},${cy - er * 1.2} L${ex + er * 1.3},${cy - er * 0.6} L${ex + er * 1.3},${cy - er * 0.25} L${ex - er * 1.3},${cy - er * 0.8}Z" fill="#2a2f3e" stroke="#0e1018" stroke-width="0.9"/>`;
      em += halo(ex, cy + R * 0.05, er * 3, '#ff2a2a', 0.85) + `<ellipse cx="${ex}" cy="${cy + R * 0.05}" rx="${dir === 'lado' ? er * 0.3 : er * 0.42}" ry="${er * 0.45}" fill="#ffb0a0"/><circle cx="${ex - er * 0.25}" cy="${cy - er * 0.15}" r="${er * 0.18}" fill="#fff"/>`;
    } else {
      s += forma(retRed(-R * 0.35, cy - R * 0.3, R * 0.7, R * 0.6, 1.5), sombra(METAL, 0.1), { w: 1.2, s: 1, l: 0.6 });
      for (let k = 0; k < 3; k++) s += traco(`M${-R * 0.25},${cy - R * 0.15 + k * R * 0.15} l${R * 0.5},0`, '#2a3040', 0.8);
    }
    pecas.push({ parte: 'corpo', papel: 'corpo', svg: s, emissivo: em || undefined, jx: 0, jy: cy });
    for (const [k, [x, y]] of [[0, hub[0]], [1, hub[1]]]) {
      const pr = `<ellipse cx="${x}" cy="${y}" rx="${R * 0.62}" ry="${R * 0.16}" fill="#c9d4e4" opacity=".55" stroke="#1a1e2a" stroke-width="0.9"/>` +
        forma(retRed(x - R * 0.62, y - 0.9, R * 1.24, 1.8, 0.9), '#2a3040', { w: 1, s: 0.5, l: 0.4 }) + forma(elipse(x, y, 1.8, 1.4), elite ? '#ff8a1e' : '#c01818', { w: 1, s: 0.5, l: 0.4 });
      pecas.push({ parte: k ? 'helice_d' : 'helice_e', papel: 'helice', pai: 'corpo', svg: pr, jx: x, jy: y });
    }
    out[dir] = pecas;
  }
  return out;
}

// ======================= montagem dos humanoides =======================
function humanoide(C, fns, dirs = ['baixo', 'cima', 'lado']) {
  const out = {};
  for (const dir of dirs) {
    const P = {};
    const tron = { parte: 'tronco', papel: 'tronco', svg: fns.tronco(C, dir), jx: 0, jy: C.hipY };
    const cabR = fns.cabeca(C, dir);
    const cab = { parte: 'cabeca', papel: 'cabeca', pai: 'tronco', svg: cabR.svg ?? cabR, emissivo: cabR.emissivo, jx: dir === 'lado' ? 0.5 : 0, jy: C.neckY };
    for (const l of ['e', 'd']) {
      const b = braco(C, dir, l), p = perna(C, dir, l);
      P['braco_' + l] = { parte: 'braco_' + l, papel: 'braco_' + l, pai: 'tronco', svg: b.svg, jx: b.jx, jy: b.jy, mao: b.mao };
      P['perna_' + l] = { parte: 'perna_' + l, papel: 'perna_' + l, svg: p.svg, jx: p.jx, jy: p.jy };
    }
    const bal = fns.balanco?.(C, dir);
    const balP = bal && { parte: 'cabelo_tras', papel: 'balanco', pai: 'cabeca', svg: bal.svg, jx: bal.jx, jy: bal.jy };
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
    out[dir] = ordem;
  }
  return out;
}

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
      return e;
    });
  }
  // altura = topo do boneco montado de frente (ou de lado)
  const lista = dirs.baixo;
  let top = 0;
  for (const p of lista) top = Math.min(top, renderizarPecas.topo[p.img] + 1);
  rigs[b].altura = Math.round(-top);
}
writeFileSync(`${DIR}/rigs.json`, JSON.stringify(rigs, null, 1));

// ---------- prancha de conferência ----------
const ZOOM = 2;
const poses = {
  parado: {},
  passo: { baixo: { braco_e: -25, braco_d: 25, perna_e: -14, perna_d: 14, cabeca: 8, balanco: 8, item: 10 }, cima: { braco_e: 25, braco_d: -25, perna_e: 14, perna_d: -14, cabeca: -8, balanco: -8 }, lado: { braco_e: 30, braco_d: -30, perna_e: 28, perna_d: -28, cabeca: -6, balanco: 12, tronco: 4 } },
};
let html = '<body style="margin:0;background:#1b2130;font:12px sans-serif;color:#cfd6e6">';
const CW = 150, RH = 210;
for (const [b, R] of Object.entries(rigs)) {
  html += `<div style="position:relative;height:${RH}px;border-bottom:1px solid #2c3446">`;
  let x = 0;
  for (const [np, pose] of Object.entries(poses)) {
    for (const [dir, lista] of Object.entries(R.dirs)) {
      html += `<div style="position:absolute;left:${x * CW}px;top:0;width:${CW}px;height:${RH}px;background:${np === 'passo' ? '#4c7a3a' : 'transparent'}"></div>`;
      html += `<div style="position:absolute;left:${x * CW + 6}px;top:4px">${b} ${dir} ${np}${x ? '' : ' · ' + R.altura + ' u'}</div>`;
      html += `<div style="position:absolute;left:${x * CW + CW / 2}px;top:${RH - 14}px"><div style="position:absolute;left:-26px;top:-5px;width:52px;height:10px;border-radius:50%;background:rgba(0,0,0,.35)"></div>${montarHTML(DIR, man, lista, pose[dir] ?? {}, ZOOM)}</div>`;
      x++;
    }
  }
  html += '</div>';
}
html += '</body>';
await fotografar('tools/art/saida/cartoon-bonecos.png', html, CW * 6, 400);
console.log('peças:', pecas.length, 'alturas:', Object.fromEntries(Object.entries(rigs).map(([k, v]) => [k, v.altura])));
