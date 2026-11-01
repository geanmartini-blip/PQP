// Peças do meio: a Ponte (chão + guarda-corpo da frente) e a cascata animada (4 quadros).
import { desgaste, fuligem, arame, fio, TINTA, blob, bolhas, cachos, brilho, canoH, cel, degrade, elipse, f1, lanterna, luz, massa, perigo, poli, prego, rebite, recorte, ret, retRed, rnd, sombra, tabuasV, texto, traco } from './kit.mjs';

const W = 230, H = 120;
export const PONTE = { W, H, deckTop: 36, deckBot: 102, meio: 115 };
const MAD = '#7a5438', MAD_ESC = '#4e3424', ACO = '#686e78', LARANJA = '#a8582a';

function posteMadeira(x, y0, y1) {
  return cel(`M${x - 4},${y1} V${y0 + 3} l4,-4 l4,4 V${y1}Z`, MAD_ESC, { s: 2.5, l: 1.4, w: 2 }) + traco(`M${x - 1.2},${y0 + 4} V${y1 - 3}`, '#3e2418', 0.8, 0.8);
}
function posteMetal(x, y0, y1) {
  return cel(retRed(x - 3.5, y0, 7, y1 - y0, 1.5), '#3c3f4a', { s: 2, l: 1.4, w: 1.8 }) + cel(retRed(x - 4.5, y0 - 2, 9, 4, 1.5), LARANJA, { s: 1, l: 1, w: 1.4 });
}
function trilhoMadeira(x0, x1, y, esp = 5) {
  return cel(retRed(x0, y - esp / 2, x1 - x0, esp, 1.5), MAD, { s: 1.6, l: 1.2, w: 1.8 }) + traco(`M${x0 + 4},${y - 0.5} h${x1 - x0 - 8}`, '#6a3a20', 0.7, 0.8);
}
/** Poste de ponta com lanterna em cima. */
function posteLanterna(x, y0, y1, metal, quebrada = false) {
  let s = metal ? posteMetal(x, y0 + 10, y1) : posteMadeira(x, y0 + 10, y1);
  s += cel(retRed(x - 5, y0 + 8, 10, 4, 1.5), metal ? '#3c3f4a' : MAD_ESC, { s: 1, l: 1, w: 1.4 });
  const l = lanterna(x, y0 - 8, metal ? { metal: '#34363e', esc: 1, luzc: quebrada ? ['#3a4048', '#2a2e36', '#1e2028'] : undefined } : { esc: 1, luzc: ['#ffe2a8', '#e8a048', '#b8642c'], haloCor: '#e0883a', haloR: 18 });
  if (quebrada) l.s += traco(`M${x - 3},${y0 - 1} l3,4 l2,-3 l1,5`, '#9ab0c0', 0.7, 0.8);
  return { s: s + l.s, e: quebrada ? '' : l.e };
}

export function ponteChao() {
  const r = rnd(501), { deckTop: T, deckBot: B, meio: M } = PONTE;
  let s = '', e = '';
  // guarda-corpo de trás (fica atrás dos bonecos)
  for (const x of [26, 50, 74, 98]) s += posteMadeira(x, 12, T + 2);
  for (const x of [132, 156, 180, 204]) s += posteMetal(x, 12, T + 2);
  s += trilhoMadeira(4, M - 4, 17) + trilhoMadeira(4, M - 4, 28, 4);
  s += canoH(M + 4, 17, W - M - 8, 5, LARANJA, [144, 192]) + canoH(M + 4, 28, W - M - 8, 4, '#6e747e') + arame([[M + 4, 10], [150, 8], [180, 11], [W - 10, 8]], 503);
  // faixa de cima do tabuleiro (borda de trás, vista de cima)
  s += cel(retRed(0, T - 4, M, 6, 1.5), MAD_ESC, { s: 1.5, l: 1, w: 1.8 }) + cel(retRed(M, T - 4, W - M, 6, 1.5), '#5a606c', { s: 1.5, l: 1, w: 1.8 });
  // metade esquerda: tábuas de madeira com pregos (perpendiculares ao caminho)
  s += tabuasV(0, T + 2, M - 6, B - T - 2, 11, MAD, 502, { irregular: true });
  // metade direita: chapa de aço xadrez com rebites
  const chapaD = ret(M + 6, T + 2, W - M - 6, B - T - 2);
  let xad = `<rect x="${M + 6}" y="${T + 2}" width="${W - M - 6}" height="${B - T - 2}" fill="${ACO}"/>`;
  for (let y = T + 5; y < B; y += 7) for (let x = M + 9 + ((y / 7) % 2) * 3.5; x < W; x += 7) xad += `<path d="M${f1(x - 2)},${f1(y + 1.4)} l4,-2.8" stroke="${luz(ACO, 0.35)}" stroke-width="1.6" stroke-linecap="round"/><path d="M${f1(x - 1.6)},${f1(y + 2.2)} l4,-2.8" stroke="${sombra(ACO, 0.35)}" stroke-width="0.9" stroke-linecap="round"/>`;
  for (let x = M + 6; x < W; x += 38) xad += `<rect x="${x}" y="${T + 2}" width="1.6" height="${B - T}" fill="#2a2c34" opacity="0.8"/>`;
  xad += `<rect x="${M + 6}" y="${T + 2}" width="${W - M}" height="5" fill="#000" opacity="0.2"/>` + `<ellipse cx="185" cy="70" rx="18" ry="8" fill="#b25a22" opacity="0.25"/><ellipse cx="140" cy="88" rx="10" ry="4" fill="#1a1420" opacity="0.25"/>`;
  s += recorte(chapaD, xad) + `<path d="${chapaD}" fill="none" stroke="${TINTA}" stroke-width="1.8"/>`;
  for (let x = M + 6 + 38; x < W; x += 38) for (const y of [T + 6, (T + B) / 2, B - 4]) s += rebite(x - 4, y, 1.3) + rebite(x + 5.5, y, 1.3);
  for (const y of [T + 6, (T + B) / 2, B - 4]) s += rebite(M + 11, y, 1.3) + rebite(W - 4, y, 1.3);
  // faixa de perigo no meio (a divisa)
  s += perigo(M - 7, T - 4, 14, B - T + 6, { passo: 5, a: '#c8962e' });
  // marcas de fogo, tábua trocada e remendo de chapa
  s += fuligem(58, 76, 26, 12, 0.5) + fuligem(176, 52, 18, 8, 0.4);
  s += tabuasV(64, T + 4, 10, B - T - 6, 1, '#8e6a48', 509);
  s += `<rect x="150" y="80" width="24" height="16" fill="#545a64" stroke="${TINTA}" stroke-width="1.2"/>` + rebite(153, 83, 1) + rebite(171, 83, 1) + rebite(153, 93, 1) + rebite(171, 93, 1);
  // sujeira e desgaste nas tábuas
  for (let i = 0; i < 6; i++) s += `<ellipse cx="${f1(8 + r() * 96)}" cy="${f1(T + 10 + r() * 50)}" rx="${f1(4 + r() * 6)}" ry="${f1(1.5 + r() * 2)}" fill="#3a2010" opacity="0.18"/>`;
  s += `<rect x="0" y="${T + 2}" width="${M - 6}" height="5" fill="#000" opacity="0.18"/>`;
  // borda da frente do tabuleiro: viga de madeira / viga de aço em I
  s += cel(retRed(0, B, M - 2, 12, 2), MAD_ESC, { s: 3, l: 1.5, w: 2.2 }) + traco(`M6,${B + 5} h${M - 14}`, '#3e2418', 0.8, 0.8);
  for (let x = 8; x < M - 4; x += 18) s += prego(x, B + 6, 1.4);
  s += cel(retRed(M + 2, B, W - M - 2, 12, 2), '#5a606c', { s: 3, l: 1.5, w: 2.2 }) + `<rect x="${M + 4}" y="${B + 4}" width="${W - M - 8}" height="3" fill="#3a3e48"/>`;
  for (let x = M + 10; x < W; x += 14) s += rebite(x, B + 9, 1.2);
  // escoras de baixo
  s += cel(poli([[20, B + 12], [30, B + 12], [26, H], [22, H]]), MAD_ESC, { s: 1.5, l: 1, w: 1.6 }) + cel(poli([[200, B + 12], [210, B + 12], [208, H], [202, H]]), '#3c3f4a', { s: 1.5, l: 1, w: 1.6 });
  // musgo na madeira, ferrugem no aço
  s += `<path d="M2,${B + 1} q10,4 22,0 q8,5 16,1 v3 q-20,6 -38,0Z" fill="#465e2e" stroke="#1a2210" stroke-width="1"/>`;
  // postes de ponta (atrás) com lanterna
  for (const [x, metal] of [[6, false], [W - 6, true]]) { const p = posteLanterna(x, 10, T + 4, metal); s += p.s; e += p.e; }
  return { nome: 'ponte_chao', w: W, h: H, svg: s, emissivo: e };
}

export function ponteGradeFrente() {
  const { deckBot: B, meio: M } = PONTE;
  let s = '', e = '';
  const y0 = B - 22;
  for (const x of [26, 50, 74, 98]) s += posteMadeira(x, y0, B + 6);
  for (const x of [132, 156, 180, 204]) s += posteMetal(x, y0, B + 6);
  s += trilhoMadeira(4, M - 4, y0 + 5) + trilhoMadeira(4, M - 4, y0 + 15, 4);
  s += canoH(M + 4, y0 + 5, W - M - 8, 5, LARANJA, [144, 192]) + canoH(M + 4, y0 + 15, W - M - 8, 4, '#8a929e');
  s += perigo(M - 5, y0 + 1, 10, 22, { passo: 4, a: '#c8962e' });
  // trecho do corrimão de madeira quebrado, amarrado com corda
  s += traco(`M58,${y0 + 3} l6,4 m0,-2 l-5,5`, '#8a7454', 1.2);
  // plaquinha de pedágio na divisa
  s += cel(retRed(M - 18, y0 - 14, 36, 12, 1.5), '#b8b0a0', { s: 1.5, l: 1, w: 1.6 }) + texto(M, y0 - 5.5, 'CÂMBIO', 6.4, '#2e3a4e', { sw: 0 }) + traco(`M${M},${y0 - 2} v4`, TINTA, 2);
  for (const [x, metal] of [[6, false], [W - 6, true]]) { const p = posteLanterna(x, y0 - 6, B + 6, metal, metal); s += p.s; e += p.e; }
  return { nome: 'ponte_grade_frente', w: W, h: H, svg: s, emissivo: e };
}

function blobPedra(x, y, rx, ry) {
  const pts = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3, k = 0.85 + ((i * 37) % 10) / 40;
    pts.push([x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k]);
  }
  return blob(pts, 0.85);
}

export function cascata(k) {
  const CW = 110, CH = 90, r = rnd(601);
  const fase = k / 4;
  let s = '';
  // corpo da queda (alarga embaixo)
  const corpo = `M20,8 Q55,2 90,8 Q93,40 98,72 Q55,80 12,72 Q17,40 20,8Z`;
  const [dg, url] = degrade(['#78b8cc', '#3a7ea4', '#26507a']);
  s += dg + `<path d="${corpo}" fill="${url}" stroke="#102a44" stroke-width="2.2"/>`;
  let fios = '';
  // faixas escuras de correnteza (fixas) e fios claros que descem (animados pelo dashoffset)
  for (const x of [32, 52, 74]) fios += `<path d="M${x},4 Q${x + 3},40 ${x + (x - 55) * 0.25},78" stroke="#1e4870" stroke-width="7" fill="none" opacity="0.35"/>`;
  for (let i = 0; i < 13; i++) {
    const x = 20 + i * 5.8 + (r() - 0.5) * 2, dash = 10 + r() * 10, gap = 6 + r() * 8, per = dash + gap, ini = r() * per;
    const xb = x + (x - 55) * 0.22;
    fios += `<path d="M${f1(x)},2 Q${f1(x + (x - 55) * 0.05)},40 ${f1(xb)},78" stroke="${i % 3 ? '#d4ecf4' : '#a8d0e0'}" stroke-width="${i % 3 ? 1.7 : 3}" stroke-linecap="round" stroke-dasharray="${f1(dash)} ${f1(gap)}" stroke-dashoffset="${f1(-(ini + fase * per))}" opacity="${i % 3 ? 0.8 : 0.45}" fill="none"/>`;
  }
  s += recorte(corpo, fios + `<rect x="0" y="0" width="${CW}" height="14" fill="#fff" opacity="0.28"/>`);
  // beira de cima (o rio chegando e virando a queda)
  s += cel(`M14,10 Q55,-3 96,10 Q55,17 14,10Z`, '#5a9ab8', { s: 2, l: 0.6, w: 2, cc: '#102a44' }) + brilho(40, 7, 9, 1.3, 0, 0.75) + brilho(70, 8, 5, 1, 0, 0.6);
  // pedras dos lados, em camadas, com musgo (escondem a borda reta da água)
  const pedra = (x, y, rx, ry, c = '#5f5a66') => cel(blobPedra(x, y, rx, ry), c, { s: 4, l: 2, w: 2.2, cc: '#1a1820' });
  s += pedra(9, 22, 11, 18) + pedra(101, 24, 11, 19, '#57525e') + pedra(7, 52, 10, 14, '#6a6470') + pedra(103, 54, 10, 15) + pedra(16, 6, 9, 7, '#6a6470') + pedra(94, 6, 9, 7, '#6a6470');
  s += `<path d="M1,10 q8,-6 18,-1 q-4,4 -9,3 q-5,2 -9,-2Z M91,9 q8,-6 18,0 q-5,4 -10,2 q-5,2 -8,-2Z M0,40 q5,-3 10,0 q-5,3 -10,0Z" fill="#465e2e" stroke="#1a2210" stroke-width="1"/>`;
  // espuma em baixo (pulsa entre os quadros)
  const esp = [];
  const rr = rnd(602);
  for (let i = 0; i < 12; i++) {
    const ph = rr() * Math.PI * 2, base = 7 + rr() * 5;
    const rad = base * (0.82 + 0.22 * Math.sin(ph + fase * Math.PI * 2));
    esp.push([8 + i * 8.6 + Math.sin(ph + fase * Math.PI * 2) * 1.5, 72 + rr() * 6 - Math.cos(ph + fase * Math.PI * 2) * 2.5, rad, rad * 0.72]);
  }
  for (let i = 0; i < 5; i++) esp.push([16 + i * 19, 82, 8, 4.5]);
  s += massa(cachos(esp, 9), '#dce8ec', { s: 3, l: 0.6, w: 1.8, cc: '#1e4a6e', cs: '#90b4c8' });
  // respingos
  for (let i = 0; i < 9; i++) {
    const a = rr() * Math.PI * 2 + fase * 2, x = 14 + rr() * 82, y = 60 + rr() * 10 - ((fase * 12 + rr() * 12) % 12);
    s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(1 + rr() * 1.4)}" fill="#ffffff" stroke="#2a6ab0" stroke-width="0.6"/>`;
  }
  return { nome: `cascata_${k}`, w: CW, h: CH, svg: s };
}

export function pecasMeio() {
  return [ponteChao(), ponteGradeFrente(), cascata(0), cascata(1), cascata(2), cascata(3)];
}
