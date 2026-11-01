// Peças da Margem Direita (Consórcio Neon): tecnologia cara e quebrada. Concreto e ardósia frios,
// ferrugem, laranja queimado; o neon é só acento, e falha (letra apagada, tubo morto, lâmpada queimada).
import {
  TINTA, arame, blob, blocos, bolhas, brilho, canoH, canoV, cel, chapa, contorno, curva, degrade, desfoque, desgaste, elipse, etiqueta, f1, fio,
  fuligem, halo, janela, luz, massa, mistura, perigo, poli, prego, rebite, recorte, ret, retRed, rnd, sombra, sombraChao, tabuasH, tabuasPregadas,
  tabuasV, texto, traco,
} from './kit.mjs';

const PEDRA = '#62666e', GRAFITE = '#34363e', ARDOSIA = '#4a4f58', LARANJA = '#a8582a', AMBAR = '#e8a040', CIANO = '#3ee8f8', MAGENTA = '#f040c8';
const AMB = ['#ffe6b0', '#e8a848', '#b8682c'];
const FRIO = ['#2a3444', '#1c2232', '#141824'];
const FERRUGEM = '#8a4a2a';

/** Janela de prédio (moldura de metal): acesa, apagada, tapada com tábuas ou com fita em X. */
function janelaPredio(x, y, w, h, estado = 'apagada', seed = 1) {
  if (estado === 'acesa') return janela(x, y, w, h, { moldura: '#3e424c', quente: AMB, haloR: 0.8, haloCor: '#d89040' });
  const [dg, url] = degrade(FRIO);
  let s = cel(retRed(x - 3, y - 3, w + 6, h + 6, 1.5), '#3e424c', { s: 2.5, l: 1, w: 2 }) + dg + `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${url}"/>`;
  s += recorte(ret(x, y, w, h), `<path d="M${x + w * 0.15},${y + h} L${x + w * 0.55},${y} L${x + w * 0.68},${y} L${x + w * 0.28},${y + h}Z" fill="#8ab0c8" opacity="0.12"/><rect x="${x}" y="${y}" width="${w}" height="5" fill="#000" opacity="0.35"/>`);
  s += `<rect x="${x + w / 2 - 1.2}" y="${y}" width="2.4" height="${h}" fill="#2e3038"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${TINTA}" stroke-width="1.2"/>`;
  if (estado === 'fita') s += traco(`M${x + 2},${y + 2} L${x + w - 2},${y + h - 2} M${x + w - 2},${y + 2} L${x + 2},${y + h - 2}`, '#bcae84', 2.2, 0.85);
  if (estado === 'tabuas') s += tabuasPregadas(x - 1, y + 1, w + 2, h - 2, seed, '#6a5440');
  if (estado === 'quebrada') s += traco(`M${x + w * 0.6},${y + h * 0.3} l-6,4 m6,-4 l5,6 m-5,-6 l1,-7 m-1,7 l-3,-5`, '#a8c0d0', 0.8, 0.8);
  return { s, e: '' };
}
/** Letreiro de neon letra por letra; acesas = índices que ainda funcionam (o resto é tubo morto). */
function neonLetras(cx, y, t, size, cor, acesas, { passo = size * 0.82, ls } = {}) {
  let s = '', e = '';
  const x0 = cx - (passo * (t.length - 1)) / 2;
  [...t].forEach((ch, i) => {
    const x = x0 + i * passo, viva = acesas.includes(i);
    if (viva) {
      s += texto(x, y, ch, size, luz(cor, 0.45), { stroke: sombra(cor, 0.45), sw: size * 0.14 });
      e += desfoque(texto(x, y, ch, size, cor, { stroke: cor, sw: size * 0.3 }), size * 0.16) + texto(x, y, ch, size, luz(cor, 0.55), { stroke: cor, sw: size * 0.07 });
    } else {
      s += texto(x, y, ch, size, '#4a4450', { stroke: '#1e1a24', sw: size * 0.14 }) + texto(x, y, ch, size, 'none', { stroke: '#6a6070', sw: size * 0.03 });
    }
  });
  return { s, e };
}
/** Tubo de neon vertical; viva = false é tubo morto (vidro cinza, sem brilho). */
function tuboNeon(x, y, h, cor, esp = 7, viva = true) {
  const vidro = viva ? luz(cor, 0.3) : '#4a5258';
  let s = cel(retRed(x - esp / 2, y, esp, h, esp / 2), vidro, { s: 1.5, l: 0.6, w: 1.6, cc: viva ? sombra(cor, 0.6) : TINTA }) + `<rect x="${x - esp * 0.25}" y="${y + 3}" width="${esp * 0.16}" height="${h - 6}" fill="#fff" opacity="${viva ? 0.6 : 0.2}" rx="1"/>`;
  s += chapa(x - esp / 2 - 2, y - 4, esp + 4, 6, '#3e424c', { rebites: false, s: 1.5, l: 0.6 }) + chapa(x - esp / 2 - 2, y + h - 2, esp + 4, 6, '#3e424c', { rebites: false, s: 1.5, l: 0.6 });
  const e = viva ? halo(x, y + h / 2, h * 0.6, cor, 0.45) + desfoque(`<rect x="${x - esp / 2}" y="${y}" width="${esp}" height="${h}" rx="${esp / 2}" fill="${cor}"/>`, 2.5) + `<rect x="${x - esp * 0.3}" y="${y + 1}" width="${esp * 0.6}" height="${h - 2}" rx="${esp * 0.3}" fill="${luz(cor, 0.45)}"/>` : '';
  return { s, e };
}
function arCond(x, y, w = 30, h = 20) {
  let s = chapa(x, y, w, h, '#9a9ea4', { s: 3, l: 1 });
  s += `<circle cx="${x + h / 2 + 1}" cy="${y + h / 2}" r="${h * 0.36}" fill="#2e3038" stroke="${TINTA}" stroke-width="1"/>` + traco(`M${x + h / 2 + 1 - h * 0.3},${y + h / 2} h${h * 0.6} M${x + h / 2 + 1},${y + h / 2 - h * 0.3} v${h * 0.6}`, '#6a6e78', 1.2);
  for (let i = 0; i < 4; i++) s += traco(`M${x + h + 2},${y + 4 + i * (h - 8) / 3} h${w - h - 5}`, '#5e626c', 1);
  s += `<path d="M${x + 2},${y + h} q2,6 4,0Z" fill="${FERRUGEM}" opacity="0.5"/>` + `<ellipse cx="${x + w * 0.7}" cy="${y + h * 0.3}" rx="4" ry="2" fill="${FERRUGEM}" opacity="0.35"/>`;
  return s;
}
function laje(x, y, w, h, seed) {
  const r = rnd(seed);
  let s = cel(retRed(x, y, w, h, 1.5), '#4a4e56', { s: 3, l: 1, w: 2.2 });
  for (let i = 0; i < w * h / 60; i++) s += `<circle cx="${f1(x + 3 + r() * (w - 6))}" cy="${f1(y + 3 + r() * (h - 6))}" r="${f1(0.6 + r() * 0.8)}" fill="${r() < 0.5 ? '#383b42' : '#62666e'}"/>`;
  s += `<ellipse cx="${x + w * 0.6}" cy="${y + h * 0.6}" rx="${w * 0.12}" ry="${h * 0.18}" fill="#1e2430" opacity="0.5"/>`;
  return s;
}
function mureta(x, y, w, h = 8) {
  let s = '';
  for (let cx = x; cx < x + w - 1; cx += 24) s += cel(retRed(cx, y, Math.min(24, x + w - cx), h, 1.5), '#72767e', { s: 2.5, l: 1, w: 1.8 });
  return s;
}
/** Logo do Consórcio: hexágono com um "C" em anel. */
function logoConsorcio(cx, cy, r, cor, w = 2.4) {
  const hex = poli([...Array(6)].map((_, i) => [cx + Math.cos((i / 6) * Math.PI * 2 - Math.PI / 2) * r, cy + Math.sin((i / 6) * Math.PI * 2 - Math.PI / 2) * r]));
  return `<path d="${hex}" fill="none" stroke="${cor}" stroke-width="${w}" stroke-linejoin="round"/>` +
    `<path d="M${f1(cx + r * 0.42)},${f1(cy - r * 0.38)} A${r * 0.56},${r * 0.56} 0 1 0 ${f1(cx + r * 0.42)},${f1(cy + r * 0.38)}" fill="none" stroke="${cor}" stroke-width="${w * 1.6}" stroke-linecap="round"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r * 0.12}" fill="${cor}"/>`;
}

export function predioNeon() {
  const W = 262, H = 322, r = rnd(301);
  let s = sombraChao(131, 314, 128, 10), e = '';
  // laje com caixa d'água, antena, ventilação e um painel solar rachado
  s += laje(14, 34, 234, 40, 302);
  s += traco('M42,62 l-4,12 M74,62 l4,12 M58,62 v12', '#22242a', 2.6);
  s += cel(retRed(36, 18, 44, 46, 6), '#5e6a74', { s: 6, l: 1.5, w: 2.2 }) + cel(elipse(58, 18, 22, 6), '#6e7a84', { s: 2, l: 0.8, w: 2 });
  for (const y of [32, 48]) s += traco(`M37,${y} h42`, '#3a444e', 1.6);
  s += `<path d="M44,40 q2,14 4,0Z M66,48 q2,10 4,0Z" fill="${FERRUGEM}" opacity="0.5"/>`;
  s += traco('M214,62 V4 M206,16 h16 M208,28 h12 M210,40 h8', '#22242a', 2.2) + `<circle cx="214" cy="4" r="2.2" fill="#a83030" stroke="${TINTA}" stroke-width="1"/>`;
  e += halo(214, 4, 7, '#ff3a3a', 0.6);
  s += cel(poli([[160, 44], [196, 40], [200, 60], [164, 64]]), '#2a3448', { s: 2, l: 0.6, w: 1.8 }) + traco('M172,42 L176,62 M184,41 L188,61 M162,54 L198,50', '#5a6a80', 0.8) + traco('M178,46 l6,5 l-3,6 m3,-6 l8,-1', '#c8d4e0', 0.8, 0.8);
  s += chapa(110, 40, 30, 24, '#585c64', { s: 3, l: 1 }) + traco('M114,48 h22 M114,53 h22 M114,58 h22', '#2e3038', 1.4);
  s += mureta(12, 66, 238, 9);
  // fachada de blocos, gasta
  s += blocos(14, 75, 234, 236, PEDRA, 303, { linhas: 20, larg: 30, ferrugem: 0.3 });
  s += desgaste(ret(14, 75, 234, 236), 14, 75, 234, 236, 304);
  s += `<rect x="14" y="75" width="234" height="7" fill="#0a0a14" opacity="0.4"/>`;
  for (const y of [148, 226]) s += cel(retRed(10, y, 242, 8, 1.5), '#72767e', { s: 2.5, l: 1, w: 2 }) + `<rect x="14" y="${y + 8}" width="234" height="5" fill="#0a0a14" opacity="0.35"/>`;
  // 3º andar: quase tudo apagado
  [[30, 'apagada'], [108, 'fita'], [186, 'acesa']].forEach(([x, est], i) => {
    const j = janelaPredio(x, 90, 44, 44, est, 305 + i);
    s += j.s; e += j.e;
    s += cel(retRed(x - 4, 136, 52, 5, 1), '#82868e', { s: 1.5, l: 0.6, w: 1.6 });
  });
  s += arCond(79, 114, 25, 18) + arCond(157, 118, 24, 16);
  // 2º andar: letreiro NEON com o "O" morto; um tubo ciano vivo e outro morto
  for (const [x, est] of [[22, 'apagada'], [216, 'quebrada']]) s += janelaPredio(x, 168, 24, 36, est, 310).s;
  s += cel(retRed(58, 160, 146, 56, 3), GRAFITE, { s: 4, l: 1, w: 2.4 }) + `<rect x="64" y="166" width="134" height="44" rx="2" fill="#16141e"/>`;
  for (const [x, y] of [[62, 164], [200, 164], [62, 212], [200, 212]]) s += rebite(x, y, 1.4);
  const nt = neonLetras(131, 202, 'NEON', 36, MAGENTA, [0, 1, 3], { passo: 31 });
  s += nt.s; e += nt.e + halo(110, 188, 70, MAGENTA, 0.25);
  const t1 = tuboNeon(52, 158, 60, CIANO, 7, true), t2 = tuboNeon(210, 158, 60, CIANO, 7, false);
  s += t1.s + t2.s; e += t1.e;
  // canos e a gambiarra de fios
  s += canoV(242, 40, 270, 9, LARANJA, [80, 150, 230, 290]) + canoH(150, 146, 92, 8, LARANJA, [170, 210]);
  s += cel(elipse(242, 146, 7, 7), sombra(LARANJA, 0.1), { s: 2, l: 0.6, w: 1.8 });
  s += chapa(222, 176, 14, 18, '#585c64', { s: 2, l: 0.6 }) + `<circle cx="229" cy="181" r="1.3" fill="#c84a2a"/>`;
  e += halo(229, 181, 5, '#ff5a2a', 0.6);
  s += fio(229, 194, 196, 214, 12) + fio(229, 194, 160, 226, 22, '#2a2420') + fio(236, 186, 250, 230, 8) + fio(222, 182, 204, 166, 6, '#3a2a20') + fio(58, 214, 26, 226, 10) + fio(229, 176, 242, 100, 10, '#1c1820', 1.4);
  s += traco('M196,214 l3,2 m-3,-2 l-1,4', '#c8a040', 1);
  // térreo: marquise
  s += `<rect x="16" y="242" width="230" height="8" fill="#0a0a14" opacity="0.45"/>`;
  s += cel(poli([[12, 228], [250, 228], [256, 244], [6, 244]]), ARDOSIA, { s: 3, l: 1, w: 2.2 }) + perigo(8, 240, 246, 6, { passo: 6, a: '#c8962e' });
  for (let x = 24; x < 250; x += 26) s += rebite(x, 234, 1.3);
  // vitrine da esquerda: grade de aço meio baixada, prateleira quase vazia
  const v1 = janelaPredio(26, 256, 70, 40, 'apagada', 315);
  s += v1.s + `<rect x="34" y="286" width="9" height="10" fill="#6a5a4a" stroke="${TINTA}" stroke-width="0.8"/>` + traco('M26,282 h70', '#34363e', 2);
  for (let i = 0; i < 6; i++) s += cel(ret(24, 252 + i * 4.5, 74, 4.5), '#6e727a', { s: 1, l: 0.5, w: 0.8, gradiente: false });
  s += cel(retRed(22, 251, 78, 6, 1.5), '#4a4e56', { s: 1.5, l: 0.6, w: 1.4 }) + `<rect x="58" y="279" width="6" height="3" fill="#c8962e" stroke="${TINTA}" stroke-width="0.6"/>`;
  // vitrine da direita: tapada com tábuas e fuligem por cima
  s += janelaPredio(166, 256, 70, 40, 'quebrada', 316).s + tabuasPregadas(164, 258, 74, 36, 317, '#6a5440');
  s += fuligem(200, 254, 34, 22, 0.55);
  // porta de vidro com só a luz de emergência
  s += cel(retRed(106, 252, 50, 60, 2), GRAFITE, { s: 3, l: 1, w: 2.2 });
  const [dg, url] = degrade(['#2e3e4e', '#1e2836', '#141a24']);
  s += dg + `<rect x="111" y="257" width="40" height="55" fill="${url}"/><rect x="130" y="257" width="2.4" height="55" fill="${GRAFITE}"/>` + recorte(ret(111, 257, 40, 55), `<path d="M114,312 L130,257 h4 L118,312Z" fill="#8ab0c8" opacity="0.12"/>`);
  s += `<rect x="111" y="257" width="40" height="55" fill="none" stroke="${TINTA}" stroke-width="1.3"/>` + traco('M126,284 v8 M136,284 v8', '#8a8e98', 2) + traco('M116,270 l8,6 l-3,5', '#9ab0c0', 0.8, 0.7);
  s += `<rect x="124" y="252" width="14" height="4" rx="1" fill="#2a3a2a" stroke="${TINTA}" stroke-width="0.6"/>`;
  e += `<rect x="124" y="252" width="14" height="4" rx="1" fill="#4ac860"/>` + halo(131, 254, 12, '#4ac860', 0.5);
  // rodapé sujo e degrau
  s += cel(retRed(10, 308, 242, 8, 1.5), '#40444c', { s: 2, l: 0.6, w: 2 }) + cel(retRed(100, 310, 62, 8, 1.5), '#72767e', { s: 2, l: 0.6, w: 2 });
  return { nome: 'predio_neon', w: W, h: H, svg: s, emissivo: e };
}

export function predioAlto() {
  const W = 222, H = 384, r = rnd(321);
  let s = sombraChao(111, 376, 110, 9), e = '';
  s += laje(18, 118, 186, 32, 322);
  // projetores e treliça do holograma
  s += traco('M60,130 V112 M162,130 V112', '#22242a', 3);
  for (const x of [30, 192]) s += traco(`M${x},104 V134 M${x - 6},104 L${x + 6},120 L${x - 6},134`, '#1a1c22', 4) + traco(`M${x},104 V134 M${x - 6},104 L${x + 6},120 L${x - 6},134`, '#555a64', 2);
  s += chapa(46, 112, 28, 12, GRAFITE, { s: 2, l: 0.6 }) + chapa(148, 112, 28, 12, GRAFITE, { s: 2, l: 0.6 });
  s += `<rect x="54" y="114" width="12" height="4" fill="#2ab8d0"/><rect x="156" y="114" width="12" height="4" fill="#3a3e48"/>`; // o projetor da direita queimou
  // holograma de anúncio: logo do Consórcio, falhando (faixas sem imagem, deslocamento)
  const pn = retRed(10, 4, 202, 100, 4);
  const falha = `<rect x="0" y="34" width="222" height="7" fill="#000"/><rect x="0" y="70" width="222" height="3" fill="#000"/>`;
  const conteudo = (cor, op) => `<g opacity="${op}">${logoConsorcio(111, 46, 30, cor, 3)}<rect x="56" y="86" width="110" height="3" rx="1.5" fill="${cor}"/><rect x="76" y="93" width="70" height="2" rx="1" fill="${cor}" opacity="0.6"/></g>`;
  const mk = 'mkHolo';
  const masc = `<defs><mask id="${mk}" maskUnits="userSpaceOnUse" x="0" y="0" width="222" height="120"><rect x="0" y="0" width="222" height="120" fill="#fff"/>${falha}</mask></defs>`;
  s += masc + `<path d="${pn}" fill="#3ee8f8" opacity="0.1"/><g mask="url(#${mk})">${conteudo('#5ad8e8', 0.7)}</g><path d="${pn}" fill="none" stroke="#2a98a8" stroke-width="1.6" opacity="0.7" stroke-dasharray="40 6 12 6"/>`;
  for (let y = 10; y < 104; y += 5) s += `<rect x="12" y="${y}" width="198" height="1" fill="#3ee8f8" opacity="0.1"/>`;
  e += masc + halo(111, 50, 100, CIANO, 0.22) + `<path d="${pn}" fill="#3ee8f8" opacity="0.08"/>` + `<g mask="url(#${mk})">${desfoque(conteudo(CIANO, 1), 2.5)}${conteudo('#bff8ff', 0.9)}<g transform="translate(3,0)">${conteudo(MAGENTA, 0.25)}</g></g>`;
  e += `<path d="M54,112 L20,100 H90Z" fill="#3ee8f8" opacity="0.14"/>`;
  s += mureta(16, 146, 190, 8);
  // fachada
  s += blocos(18, 154, 186, 220, ARDOSIA, 323, { linhas: 18, larg: 28, ferrugem: 0.3 });
  s += desgaste(ret(18, 154, 186, 220), 18, 154, 186, 220, 324);
  s += `<rect x="18" y="154" width="186" height="6" fill="#0a0a14" opacity="0.4"/>`;
  const estados = ['apagada', 'acesa', 'apagada', 'fita', 'apagada', 'apagada', 'tabuas', 'apagada', 'acesa', 'apagada', null, 'quebrada'];
  for (let row = 0; row < 4; row++) {
    const y = 166 + row * 46;
    for (let col = 0; col < 3; col++) {
      const est = estados[row * 3 + col];
      if (!est) continue; // a porta fica aqui
      const x = 34 + col * 56;
      const j = janelaPredio(x, y, 34, 30, est, 330 + row * 3 + col);
      s += j.s; e += j.e;
      s += cel(retRed(x - 4, y + 32, 42, 4, 1), '#82868e', { s: 1.2, l: 0.6, w: 1.4 });
    }
    if (row < 3) s += cel(retRed(14, y + 40, 194, 5, 1), '#62666e', { s: 1.5, l: 0.6, w: 1.6 });
  }
  s += fuligem(160, 300, 30, 26, 0.5);
  s += arCond(69, 216, 20, 14) + arCond(125, 262, 20, 14);
  s += canoV(24, 150, 222, 8, LARANJA, [190, 250, 320]) + canoH(24, 300, 60, 7, LARANJA, [50]);
  const tb = tuboNeon(204, 200, 110, CIANO, 7);
  s += tb.s; e += tb.e;
  s += fio(204, 196, 160, 160, 14) + fio(24, 240, 74, 210, 10);
  // porta de serviço trancada (luz vermelha)
  s += cel(retRed(84, 326, 54, 50, 2), GRAFITE, { s: 3, l: 1, w: 2.2 }) + perigo(84, 318, 54, 8, { passo: 6, a: '#c8962e' });
  s += chapa(90, 332, 42, 42, '#4a5058', { s: 3, l: 1 }) + traco('M92,346 h38 M92,358 h38', '#2e3038', 1.2);
  s += `<rect x="104" y="335" width="14" height="5" rx="1" fill="#6a2020" stroke="${TINTA}" stroke-width="0.8"/>`;
  e += `<rect x="104" y="335" width="14" height="5" rx="1" fill="#ff3a3a"/>` + halo(111, 337, 10, '#ff3a3a', 0.5);
  s += cel(retRed(14, 368, 194, 8, 1.5), '#40444c', { s: 2, l: 0.6, w: 2 });
  return { nome: 'predio_alto', w: W, h: H, svg: s, emissivo: e };
}

export function oficinaNeon() {
  const W = 242, H = 222;
  let s = sombraChao(121, 214, 118, 9), e = '';
  const tel = `M8,96 Q8,26 121,20 Q234,26 234,96Z`;
  s += cel(tel, '#6e747e', { s: 10, l: 2, w: 2.4 });
  let on = '';
  for (let x = 12; x < 234; x += 8) on += traco(`M${x},96 Q${121 + (x - 121) * 0.92},24 ${121 + (x - 121) * 0.9},20`, '#454a54', 1.6, 0.7) + traco(`M${x + 3},96 Q${121 + (x + 3 - 121) * 0.92},26 ${121 + (x + 3 - 121) * 0.9},22`, '#9aa0a8', 1, 0.35);
  on += `<ellipse cx="160" cy="60" rx="24" ry="12" fill="${FERRUGEM}" opacity="0.5"/><ellipse cx="60" cy="80" rx="18" ry="8" fill="${FERRUGEM}" opacity="0.4"/><ellipse cx="96" cy="44" rx="10" ry="6" fill="${FERRUGEM}" opacity="0.35"/>`;
  on += chapa(170, 40, 30, 22, '#5a6068', { s: 2, l: 0.6 }); // remendo de chapa
  s += recorte(tel, on + desgaste(tel, 8, 20, 226, 76, 340, { escorrido: false }));
  s += `<path d="${tel}" fill="none" stroke="${TINTA}" stroke-width="2.4"/>`;
  s += chapa(100, 36, 42, 14, '#3e424c', { s: 2, l: 0.6 }) + `<rect x="104" y="39" width="34" height="8" fill="#2a3444"/>` + traco('M108,40 l6,6 M120,39 l-3,8', '#8aa0b0', 0.7);
  s += blocos(12, 94, 218, 118, PEDRA, 341, { linhas: 9, larg: 28, ferrugem: 0.3 });
  s += desgaste(ret(12, 94, 218, 118), 12, 94, 218, 118, 342);
  s += `<rect x="12" y="94" width="218" height="8" fill="#0a0a14" opacity="0.45"/>`;
  s += cel(retRed(4, 90, 234, 9, 2), '#545a64', { s: 2.5, l: 0.8, w: 2.2 });
  for (let x = 14; x < 236; x += 22) s += rebite(x, 94.5, 1.2);
  // portão de enrolar meio aberto (escuro lá dentro) e fuligem em cima
  s += cel(retRed(54, 112, 134, 100, 2), GRAFITE, { s: 3, l: 1, w: 2.4 });
  s += `<rect x="60" y="184" width="122" height="22" fill="#0e0c12"/>` + `<rect x="60" y="184" width="122" height="4" fill="#000" opacity="0.6"/>`;
  s += cel(retRed(52, 106, 138, 12, 2), '#545a64', { s: 3, l: 0.8, w: 2.2 });
  for (let i = 0; i < 7; i++) s += cel(retRed(60, 120 + i * 9.6, 122, 9.6, 1), i % 2 ? '#6e747e' : '#646a74', { s: 2.4, l: 0.6, w: 1.2, gradiente: false });
  s += recorte(ret(60, 120, 122, 67), `<ellipse cx="150" cy="150" rx="18" ry="10" fill="${FERRUGEM}" opacity="0.35"/>` + traco('M70,130 l40,8', '#2a2a30', 0.8, 0.6) + traco('M150,124 q-6,14 4,26', '#2a2a30', 0.8, 0.6));
  s += cel(retRed(110, 182, 22, 6, 1.5), '#9a9ea4', { s: 1, l: 0.6, w: 1.4 });
  s += perigo(48, 112, 8, 100, { passo: 6, a: '#c8962e' }) + perigo(186, 112, 8, 100, { passo: 6, a: '#c8962e' }) + perigo(60, 204, 122, 8, { passo: 6, a: '#c8962e' });
  s += fuligem(121, 112, 70, 16, 0.5);
  // letreiro OFICINA: lâmpadas queimadas pela metade
  s += cel(retRed(66, 62, 110, 26, 2.5), '#22242a', { s: 3, l: 0.8, w: 2.2 });
  const nt = neonLetras(121, 82, 'OFICINA', 17, AMBAR, [0, 1, 2, 3, 5, 6], { passo: 14 });
  s += nt.s; e += nt.e;
  for (let i = 0; i < 9; i++) {
    const x = 72 + i * 12.25;
    for (const [k, y] of [[0, 65.5], [1, 84.5]]) {
      const viva = (i * 2 + k) % 3 !== 0;
      s += `<circle cx="${f1(x)}" cy="${y}" r="1.6" fill="${viva ? '#f0d890' : '#3a3630'}" stroke="${TINTA}" stroke-width="0.6"/>`;
      if (viva) e += `<circle cx="${f1(x)}" cy="${y}" r="2.6" fill="#e8a040" opacity="0.7"/>`;
    }
  }
  // janela lateral (acesa, fraca), janela apagada e quadro de força com gambiarra
  const j = janela(200, 122, 22, 26, { moldura: '#3e424c', quente: AMB, haloR: 0.7, haloCor: '#d89040' });
  s += j.s; e += j.e;
  s += janelaPredio(18, 122, 22, 26, 'fita', 342).s;
  s += arCond(14, 160, 28, 18);
  s += chapa(198, 158, 26, 30, '#4a5058', { s: 2, l: 0.6 }) + `<rect x="202" y="162" width="18" height="10" fill="#22242a"/>` + `<circle cx="206" cy="167" r="1.2" fill="#c8962e"/><circle cx="211" cy="167" r="1.2" fill="#3a3630"/><circle cx="216" cy="167" r="1.2" fill="#3a3630"/>`;
  s += fio(204, 188, 180, 210, 6) + fio(212, 188, 232, 212, 8, '#2a2420') + fio(218, 158, 232, 100, 6) + fio(204, 158, 190, 98, 10, '#2a2420');
  e += halo(206, 167, 5, '#e8a040', 0.6);
  s += canoV(232, 96, 116, 7, LARANJA, [130, 190]);
  for (const [x, y] of [[26, 206], [26, 196], [26, 186]]) s += cel(elipse(x, y, 14, 5.5), '#24242a', { s: 2, l: 0.6, w: 1.8 }) + `<ellipse cx="${x}" cy="${y - 0.5}" rx="6" ry="2.2" fill="#121216"/>`;
  s += cel(retRed(8, 206, 228, 8, 1.5), '#40444c', { s: 2, l: 0.6, w: 2 });
  return { nome: 'oficina_neon', w: W, h: H, svg: s, emissivo: e };
}

export function quiosqueLaranja() {
  const W = 152, H = 142;
  let s = sombraChao(76, 136, 72, 8), e = '';
  s += chapa(16, 40, 120, 52, GRAFITE, { s: 3, l: 0.8 });
  // prateleiras meio vazias
  const rr = rnd(351);
  for (const [y, de, ate] of [[62, 22, 64], [84, 96, 124]]) {
    for (let x = de; x < ate; x += 8 + rr() * 6) {
      const c = ['#8a5a7a', '#4a8a96', '#a08a4a', '#8a5a3a', '#9a9ea4'][Math.floor(rr() * 5)];
      s += cel(retRed(x, y - 12 + rr() * 3, 6, 12 - rr() * 3, 1), c, { s: 1.2, l: 0.5, w: 1.1 });
    }
    s += cel(retRed(18, y, 116, 4, 1), '#6e747e', { s: 1, l: 0.5, w: 1.4 });
    s += `<rect x="20" y="${y - 1}" width="112" height="1" fill="#9a9ea4" opacity="0.25"/>`;
  }
  s += etiqueta(70, 64, '4', '9') + etiqueta(40, 86, '12', '19');
  for (const x of [8, 138]) s += cel(retRed(x, 30, 6, 108, 1.5), '#4a5058', { s: 2, l: 0.6, w: 1.8 });
  // toldo listrado laranja queimado / creme sujo, rasgado numa ponta
  const tol = poli([[22, 8], [130, 8], [148, 36], [4, 36]]);
  let lis = '';
  for (let i = 0; i < 9; i++) {
    const a0 = i / 9, a1 = (i + 1) / 9;
    lis += `<path d="${poli([[22 + 108 * a0, 8], [22 + 108 * a1, 8], [4 + 144 * a1, 36], [4 + 144 * a0, 36]])}" fill="${i % 2 ? '#c8bca4' : '#a8582a'}"/>`;
  }
  s += recorte(tol, lis + `<rect x="0" y="28" width="152" height="8" fill="#2a1408" opacity="0.3"/>` + desgaste(tol, 0, 8, 152, 28, 352, { forca: 0.9 }) + `<path d="M120,36 l6,-10 l4,10Z" fill="#1a1420"/>`);
  s += `<path d="${tol}" fill="none" stroke="#2a140c" stroke-width="2.2" stroke-linejoin="round"/>`;
  let fr = '';
  for (let i = 0; i < 14; i++) { const x = 4 + (144 * i) / 14; if (i === 11) continue; fr += `M${f1(x)},38 L${f1(x + 144 / 14)},38 L${f1(x + 72 / 14)},44Z `; }
  s += cel(fr, '#a8582a', { s: 1.5, l: 0.6, w: 1.2, cc: '#2a140c' });
  s += cel(retRed(2, 33, 148, 6, 1.5), '#844420', { s: 1.5, l: 0.6, w: 1.8, cc: '#2a140c' });
  // placa de cima: ícone de sacola em neon âmbar
  s += cel(retRed(56, 0, 40, 13, 2), GRAFITE, { s: 2, l: 0.6, w: 1.6 });
  const sac = 'M70,4 h12 l1,7 h-14Z M73,4 q3,-4 6,0';
  s += traco(sac, '#c89050', 1.4);
  e += desfoque(traco(sac, AMBAR, 2.6), 1.6) + traco(sac, '#ffe0a0', 1.1);
  // balcão de metal com telas: uma rachada e apagada, uma com preço riscado, uma carregando
  s += chapa(10, 96, 132, 10, '#6e747e', { s: 2, l: 0.6, rebites: false });
  s += chapa(14, 104, 124, 32, '#3e424c', { s: 3, l: 0.8 });
  s += desgaste(ret(14, 104, 124, 32), 14, 104, 124, 32, 353);
  s += perigo(14, 128, 124, 6, { passo: 5, a: '#c8962e' });
  s += `<rect x="20" y="108" width="34" height="18" rx="1" fill="#14161c" stroke="${TINTA}" stroke-width="1.4"/>` + traco('M30,110 l6,6 l-2,7 m2,-7 l10,-3 m-10,3 l9,7', '#6a7a88', 0.7, 0.8);
  s += `<rect x="60" y="108" width="34" height="18" rx="1" fill="#3a1e30" stroke="${TINTA}" stroke-width="1.4"/>`;
  const preco = texto(72, 115.5, '9,90', 5, '#c890b0', { sw: 0 }) + traco('M64,113.6 h16', '#ff6a6a', 0.9) + texto(80, 123.5, '14,90', 6.4, '#ffd0e8', { sw: 0 });
  s += preco;
  e += halo(77, 117, 24, MAGENTA, 0.35) + `<rect x="60" y="108" width="34" height="18" rx="1" fill="${MAGENTA}" opacity="0.25"/>` + preco;
  s += `<rect x="100" y="108" width="32" height="18" rx="1" fill="#14363e" stroke="${TINTA}" stroke-width="1.4"/>`;
  const carr = `<rect x="106" y="116" width="20" height="3" rx="1.5" fill="none" stroke="#7ff0ff" stroke-width="0.8"/><rect x="106.5" y="116.5" width="6" height="2" rx="1" fill="#7ff0ff"/>`;
  s += carr;
  e += halo(116, 117, 20, CIANO, 0.35) + `<rect x="100" y="108" width="32" height="18" rx="1" fill="${CIANO}" opacity="0.2"/>` + carr;
  // pouca coisa no balcão
  for (const [x, c] of [[24, '#8a5a7a'], [112, '#4a8a96']]) s += cel(retRed(x, 86, 6, 11, 1.2), c, { s: 1.2, l: 0.5, w: 1.1 }) + `<rect x="${x + 1}" y="86" width="4" height="2" fill="#bcc0c6"/>`;
  s += chapa(60, 84, 30, 13, '#8a7050', { rebites: false, s: 2, l: 0.6 }) + traco('M60,84 l30,13', '#5a4430', 0.8);
  s += cel(retRed(130, 80, 8, 16, 1.5), '#22242a', { s: 1, l: 0.5, w: 1.2 }) + `<circle cx="134" cy="84" r="1.5" fill="#6a2020"/>`;
  return { nome: 'quiosque_laranja', w: W, h: H, svg: s, emissivo: e };
}

export function lampiaoMetal() {
  const W = 40, H = 132;
  let s = sombraChao(14, 128, 12, 3), e = '';
  s += cel(retRed(8, 118, 12, 12, 1.5), GRAFITE, { s: 2, l: 0.6, w: 1.8 });
  s += cel(retRed(11, 22, 6, 98, 1.5), '#34363e', { s: 2, l: 0.6, w: 1.8 }) + cel(retRed(9, 70, 10, 5, 1), LARANJA, { s: 1.2, l: 0.5, w: 1.4 });
  s += `<path d="M12,90 q1,8 2,0Z M12,40 q1,10 2,0Z" fill="${FERRUGEM}" opacity="0.6"/>`;
  s += traco('M14,24 Q14,10 26,10 H30', TINTA, 6) + traco('M14,24 Q14,10 26,10 H30', '#34363e', 3.4);
  s += cel(`M22,12 h16 l-2,7 h-12Z`, GRAFITE, { s: 1.5, l: 0.5, w: 1.6 });
  const [dg, url] = degrade(AMB);
  s += dg + `<path d="M24,19 h12 l-1.5,9 h-9Z" fill="${url}" stroke="${TINTA}" stroke-width="1.3"/>`;
  e += halo(30, 26, 26, '#d89040', 0.65) + `<path d="M24,19 h12 l-1.5,9 h-9Z" fill="#f0c060"/>` + `<path d="M24,28 L14,56 H46 L36,28Z" fill="#e8a040" opacity="0.1"/>`;
  s += fio(14, 60, 20, 118, 4, '#1c1820', 1.1);
  return { nome: 'lampiao_metal', w: W, h: H, svg: s, emissivo: e, ax: 14 };
}
export function tuboCiano() {
  const W = 26, H = 92;
  const t = tuboNeon(13, 10, 70, CIANO, 9);
  let s = sombraChao(13, 88, 11, 3) + t.s + chapa(4, 80, 18, 10, GRAFITE, { s: 2, l: 0.6, rebites: false }) + rebite(9, 85, 1.2) + rebite(17, 85, 1.2);
  s += traco('M13,4 v3', TINTA, 2) + fio(13, 90, 24, 92, 1);
  return { nome: 'tubo_ciano', w: W, h: H, svg: s, emissivo: t.e };
}
export function barril() {
  const W = 36, H = 44;
  let s = sombraChao(18, 41, 16, 3.5);
  const d = `M4,8 Q2,24 4,38 Q18,44 32,38 Q34,24 32,8Z`;
  s += cel(d, '#7a3a2a', { s: 5, l: 1.2, w: 2 });
  s += perigo(4, 20, 28, 6, { passo: 4, a: '#c8962e' });
  for (const y of [12, 32]) s += traco(`M4,${y} Q18,${y + 4} 32,${y}`, '#3a1a14', 2);
  s += desgaste(d, 2, 6, 32, 38, 361);
  s += cel(elipse(18, 8, 14, 4.5), '#8a4a34', { s: 1.5, l: 0.5, w: 1.8 }) + `<circle cx="24" cy="8" r="2" fill="#1a1012"/>`;
  s += `<path d="M8,38 q-2,4 -6,4 q4,1 10,-1Z" fill="#1a1416" opacity="0.7"/>`;
  return { nome: 'barril', w: W, h: H, svg: s };
}
export function barrilMadeira() {
  const W = 36, H = 44;
  let s = sombraChao(18, 41, 16, 3.5);
  const d = `M5,8 Q1,24 5,38 Q18,44 31,38 Q35,24 31,8Z`;
  s += cel(d, '#6e4a30', { s: 5, l: 1.2, w: 2 });
  s += recorte(d, [8, 13, 18, 23, 28].map((x) => traco(`M${x},6 Q${x + (x - 18) * 0.25},24 ${x},42`, '#3e2618', 1, 0.8)).join('')) + desgaste(d, 2, 6, 32, 38, 362);
  for (const y of [13, 33]) s += traco(`M4,${y} Q18,${y + 4} 32,${y}`, '#2e3036', 3) + traco(`M4,${y - 0.6} Q18,${y + 3.4} 32,${y - 0.6}`, '#6a6260', 1);
  s += cel(elipse(18, 8, 13, 4.2), '#8a6a48', { s: 1.5, l: 0.5, w: 1.8 }) + traco('M9,8 h18 M11,6 h14 M11,10 h14', '#5a4430', 0.8);
  return { nome: 'barril_madeira', w: W, h: H, svg: s };
}
export function caixote(x, y, w, h, top, seed, cor = '#8a6440', vazio = false) {
  let s = tabuasH(x, y + top, w, h - top, 3, cor, seed, { pregos: false });
  s += desgaste(ret(x, y + top, w, h - top), x, y + top, w, h - top, seed);
  s += `<path d="${ret(x, y + top, w, h - top)}" fill="none" stroke="${TINTA}" stroke-width="1.8"/>`;
  s += traco(`M${x + 2},${y + top + 2} L${x + w - 2},${y + h - 2}`, TINTA, 4.2) + traco(`M${x + 2},${y + top + 2} L${x + w - 2},${y + h - 2}`, sombra(cor, 0.15), 2.4);
  if (vazio) s += `<rect x="${x}" y="${y}" width="${w}" height="${top + 1}" fill="#1a1012"/>` + traco(`M${x + 1},${y + 1} h${w - 2}`, luz(cor, 0.1), 2) + `<rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${top - 2}" fill="#2a1c16"/>` + `<path d="M${x},${y} h${w} v${top + 1} h${-w}Z" fill="none" stroke="${TINTA}" stroke-width="1.6"/>`;
  else s += cel(retRed(x, y, w, top + 1, 1), luz(cor, 0.12), { s: 1.5, l: 0.5, w: 1.8 }) + traco(`M${x + 3},${y + top / 2} h${w - 6}`, sombra(cor, 0.3), 0.9);
  s += prego(x + 3.5, y + top + 3.5) + prego(x + w - 3.5, y + top + 3.5) + prego(x + 3.5, y + h - 3.5) + prego(x + w - 3.5, y + h - 3.5);
  return s;
}
export function caixa() {
  return { nome: 'caixa', w: 38, h: 40, svg: sombraChao(19, 36, 18, 3.5) + caixote(4, 4, 30, 32, 8, 361) };
}
export function pilhaCaixas() {
  let s = sombraChao(36, 68, 34, 4.5) + caixote(4, 34, 32, 34, 8, 371) + caixote(36, 38, 30, 30, 7, 372, '#7a5636') + caixote(16, 4, 30, 32, 8, 373, '#94704a');
  s += cel(retRed(40, 46, 22, 10, 1), '#b8ae98', { s: 1, l: 0.5, w: 1.1 }) + traco('M43,49.5 h16 M43,52.5 h10', '#4a4440', 0.8, 0.8);
  return { nome: 'pilha_caixas', w: 72, h: 72, svg: s };
}
export function cano() {
  const W = 72, H = 32;
  let s = sombraChao(36, 29, 34, 3.5) + canoH(6, 18, 52, 14, LARANJA, [18, 44]);
  s += `<ellipse cx="34" cy="16" rx="8" ry="4" fill="${FERRUGEM}" opacity="0.5"/>`;
  s += cel(elipse(60, 18, 5, 9), sombra(LARANJA, 0.15), { s: 2, l: 0.5, w: 1.8 }) + `<ellipse cx="61" cy="18" rx="3" ry="6" fill="#140e12"/>`;
  s += traco('M30,11 v-6', TINTA, 3.4) + traco('M30,11 v-6', '#4a5058', 1.8) + cel(elipse(30, 5, 7, 2.4), '#7a2a22', { s: 1, l: 0.5, w: 1.4 });
  s += `<path d="M62,26 q4,2 8,1" stroke="#1a1416" stroke-width="2" fill="none" opacity="0.6"/>`;
  return { nome: 'cano', w: W, h: H, svg: s };
}
export function placaPerigo() {
  const W = 52, H = 58;
  let s = sombraChao(26, 55, 12, 2.5) + cel(retRed(23, 26, 6, 30, 1), '#4a5058', { s: 1.5, l: 0.5, w: 1.6 });
  const d = `M26,2 L49,40 Q50,43 47,43 H5 Q2,43 3,40Z`;
  s += cel(d, '#c8962e', { s: 3, l: 1, w: 2.2 }) + desgaste(d, 2, 2, 48, 42, 381, { forca: 1.2 });
  s += `<path d="M26,9 L44,39 H8Z" fill="none" stroke="${TINTA}" stroke-width="2"/>` + `<path d="M28,16 L21,29 h5 l-3,9 l9,-13 h-5 l3,-9Z" fill="${TINTA}"/>`;
  for (const [x, y] of [[36, 32], [14, 37]]) s += `<circle cx="${x}" cy="${y}" r="1.6" fill="#1a1416"/><circle cx="${x}" cy="${y}" r="2.6" fill="none" stroke="#e8d8a8" stroke-width="0.6" opacity="0.7"/>`;
  return { nome: 'placa_perigo', w: W, h: H, svg: s };
}
export function cercaMetal() {
  const W = 64, H = 50;
  let s = sombraChao(32, 46, 32, 3, 0.25);
  s += arame([[0, 9], [16, 7], [32, 10], [48, 7], [64, 9]], 391);
  s += canoH(0, 18, 64, 5, '#6e747e') + perigo(0, 27, 64, 8, { passo: 5, a: '#c8962e' }) + canoH(0, 39, 64, 4, '#545a64');
  for (const x of [16, 48]) s += cel(retRed(x - 3.5, 6, 7, 42, 1.5), GRAFITE, { s: 2, l: 0.6, w: 1.8 }) + cel(retRed(x - 4.5, 4, 9, 4, 1), LARANJA, { s: 1, l: 0.5, w: 1.4 }) + rebite(x, 18, 1.2) + rebite(x, 39, 1.2);
  return { nome: 'cerca_metal', w: W, h: H, svg: s };
}
export function lixeira() {
  const W = 34, H = 46;
  let s = sombraChao(17, 43, 15, 3);
  const d = `M5,14 h24 l-2,29 h-20Z`;
  s += cel(d, '#3e5a4a', { s: 4, l: 1, w: 2 }) + desgaste(d, 5, 14, 24, 29, 401, { forca: 1.2 });
  for (const x of [11, 17, 23]) s += traco(`M${x},18 v22`, '#24342c', 1.2);
  s += cel(`M6,14 l4,-6 l8,2 l6,-4 l5,8Z`, '#4a4440', { s: 1.5, l: 0.5, w: 1.4 });
  s += `<g transform="rotate(-24 6 12)">${cel(retRed(1, 6, 28, 5, 1.5), '#466a56', { s: 1.5, l: 0.5, w: 1.6 })}</g>`;
  s += cel(`M20,9 l5,-6 l4,5Z`, '#9a948a', { s: 1, l: 0.5, w: 1.1 }) + cel(retRed(10, 6, 7, 5, 1), '#7a5a3a', { s: 1, l: 0.5, w: 1.1 });
  s += `<ellipse cx="28" cy="44" rx="5" ry="1.6" fill="#3a3428" opacity="0.6"/>` + cel(`M26,42 l6,-2 l1,3Z`, '#8a8478', { s: 0.6, l: 0.3, w: 0.9 });
  return { nome: 'lixeira', w: W, h: H, svg: s };
}
export function painelHolograma() {
  const W = 58, H = 92;
  let s = sombraChao(29, 88, 18, 3.5), e = '';
  s += chapa(16, 76, 26, 12, GRAFITE, { s: 2, l: 0.6 }) + `<ellipse cx="29" cy="76" rx="10" ry="3" fill="#1e6a78" stroke="${TINTA}" stroke-width="1"/>`;
  s += fio(16, 84, 2, 90, 2);
  const pn = retRed(4, 6, 50, 56, 3);
  const mk = 'mkPainel';
  const mascP = `<defs><mask id="${mk}" maskUnits="userSpaceOnUse" x="0" y="0" width="58" height="92"><rect width="58" height="92" fill="#fff"/><rect y="24" width="58" height="5" fill="#000"/><rect y="44" width="58" height="2" fill="#000"/></mask></defs>`;
  s += mascP;
  const conteudo = (cor) => logoConsorcio(29, 30, 14, cor, 2) + `<rect x="14" y="50" width="30" height="2" rx="1" fill="${cor}"/>`;
  s += `<path d="${pn}" fill="#3ee8f8" opacity="0.1"/><path d="${pn}" fill="none" stroke="#2a98a8" stroke-width="1.4" stroke-dasharray="22 4 8 4" opacity="0.7"/><g mask="url(#${mk})" opacity="0.6">${conteudo('#5ad8e8')}</g>`;
  for (let y = 8; y < 62; y += 4) s += `<rect x="5" y="${y}" width="48" height="0.8" fill="#3ee8f8" opacity="0.12"/>`;
  e += mascP + halo(29, 36, 42, CIANO, 0.28) + `<path d="M19,76 L4,62 H54 L39,76Z" fill="#3ee8f8" opacity="0.14"/><path d="${pn}" fill="#3ee8f8" opacity="0.08"/>` + `<g mask="url(#${mk})">${desfoque(conteudo(CIANO), 1.6)}${conteudo('#bff8ff')}<g transform="translate(2,0)" opacity="0.3">${conteudo(MAGENTA)}</g></g>`;
  return { nome: 'painel_holograma', w: W, h: H, svg: s, emissivo: e };
}
export function cone() {
  const W = 26, H = 30;
  let s = sombraChao(13, 27, 11, 2.5) + cel(retRed(2, 24, 22, 5, 1), '#24242a', { s: 1, l: 0.5, w: 1.6 });
  s += cel(`M10,3 h6 l6,22 h-18Z`, '#b8602a', { s: 3, l: 1, w: 1.8 }) + `<path d="M8.2,10 h9.6 l1.4,5 h-12.4Z" fill="#bcb4a4" stroke="${TINTA}" stroke-width="0.8"/>` + desgaste(`M10,3 h6 l6,22 h-18Z`, 4, 3, 18, 22, 411);
  return { nome: 'cone', w: W, h: H, svg: s };
}
export function bueiro() {
  const W = 50, H = 32;
  let s = cel(elipse(25, 16, 22, 13), '#4a5058', { s: 2, l: 0.8, w: 2 });
  s += `<ellipse cx="25" cy="16" rx="17" ry="9.5" fill="#2e3038" stroke="${TINTA}" stroke-width="1.2"/>`;
  s += recorte(elipse(25, 16, 17, 9.5), [10, 14, 18, 22, 26, 30, 34, 38].map((x) => `<rect x="${x}" y="4" width="2.2" height="24" fill="#545a64"/>`).join('') + `<rect x="6" y="15" width="40" height="2" fill="#545a64"/><ellipse cx="30" cy="20" rx="8" ry="4" fill="${FERRUGEM}" opacity="0.45"/>`);
  return { nome: 'bueiro', w: W, h: H, svg: s, ay: H / 2 };
}
export function pocaNeon() {
  const W = 82, H = 38;
  const d = blob([[6, 20], [14, 10], [34, 6], [56, 8], [76, 14], [78, 26], [60, 32], [36, 32], [16, 30]], 1);
  let s = `<path d="${d}" fill="#181c2a" stroke="#10121c" stroke-width="1.5"/>`;
  const ref = `<rect x="18" y="12" width="26" height="3" rx="1.5" fill="#f040c8" opacity="0.55"/><rect x="24" y="18" width="16" height="2" rx="1" fill="#f040c8" opacity="0.35"/><rect x="46" y="16" width="20" height="2.5" rx="1.2" fill="#3ee8f8" opacity="0.55"/><rect x="50" y="22" width="12" height="2" rx="1" fill="#3ee8f8" opacity="0.35"/>`;
  s += recorte(d, ref + `<ellipse cx="30" cy="11" rx="12" ry="1.5" fill="#fff" opacity="0.15"/>` + `<ellipse cx="60" cy="26" rx="10" ry="3" fill="#5a3a2a" opacity="0.3"/>`);
  return { nome: 'poca_neon', w: W, h: H, svg: s, emissivo: recorte(d, desfoque(ref, 1.5) + ref), ay: H / 2 };
}
export function arCondicionado() {
  return { nome: 'ar_condicionado', w: 42, h: 36, svg: sombraChao(21, 33, 18, 2.5, 0.25) + arCond(4, 8, 34, 22) + traco('M8,30 v4 M34,30 v4', '#22242a', 2) };
}
export function cartaz() {
  const W = 54, H = 68;
  // cartaz de propaganda do Consórcio, desbotado e rasgado
  const papel = `M3,3 H51 V40 L44,46 L47,52 L40,58 L42,65 H3Z`;
  let s = cel(papel, '#c8c0ae', { s: 3, l: 0.6, w: 1.8 });
  s += recorte(papel, `<rect x="6" y="6" width="42" height="30" fill="#9a6a4a"/>` + cel(elipse(27, 24, 10, 11), '#c8a88a', { s: 2, l: 0.5, w: 1.4 }) + cel(`M17,20 Q17,10 27,10 Q37,10 37,20 Q30,15 17,20Z`, '#3a2e30', { s: 1, l: 0.5, w: 1.2 }) +
    `<circle cx="23" cy="23" r="1.1" fill="${TINTA}"/><circle cx="31" cy="23" r="1.1" fill="${TINTA}"/>` + traco('M22,28 Q27,31.5 32,28', TINTA, 1.2) + cel(`M14,36 Q27,30 40,36Z`, '#2e3a4e', { s: 1, l: 0.5, w: 1.2 }) +
    texto(27, 45, 'SOMOS UMA', 5.6, '#2e3a4e', { sw: 0 }) + texto(27, 53.5, 'FAMÍLIA', 8, '#8a3a2a', { sw: 0 }) + desgaste(papel, 3, 3, 48, 62, 421, { forca: 1.4 }) + `<rect x="3" y="3" width="48" height="62" fill="#d8c8a0" opacity="0.18"/>`);
  s += `<path d="M38,3 l13,0 l0,9Z" fill="#9a9486" stroke="${TINTA}" stroke-width="1"/>` + rebite(8, 8, 1.2);
  s += traco('M10,58 l12,-2 M14,62 l8,-4', '#3a3434', 1.4, 0.6);
  return { nome: 'cartaz', w: W, h: H, svg: s };
}

export function pecasDireita() {
  return [
    predioNeon(), predioAlto(), oficinaNeon(), quiosqueLaranja(), lampiaoMetal(), tuboCiano(), barril(), barrilMadeira(), caixa(),
    pilhaCaixas(), cano(), placaPerigo(), cercaMetal(), lixeira(), painelHolograma(), cone(), bueiro(), pocaNeon(), arCondicionado(), cartaz(),
  ];
}
