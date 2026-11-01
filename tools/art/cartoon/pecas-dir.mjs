// Peças da Margem Direita (Consórcio Neon): grafite, ardósia, laranja, âmbar, ciano e magenta neon.
import {
  TINTA, blob, blocos, bolhas, brilho, canoH, canoV, cel, chapa, contorno, curva, degrade, desfoque, elipse, f1, halo, janela,
  luz, massa, mistura, perigo, poli, prego, rebite, recorte, ret, retRed, rnd, sombra, sombraChao, tabuasH, tabuasV, texto, traco,
} from './kit.mjs';

const PEDRA = '#6f727c', GRAFITE = '#3c3f4a', ARDOSIA = '#545a66', LARANJA = '#e0742a', AMBAR = '#ffb03a', CIANO = '#3ef0ff', MAGENTA = '#ff3ad0';
const AMB = ['#fff3b0', '#ffc24a', '#ff8a2a'];
const FRIO = ['#2a3a5a', '#1c2440', '#141830'];

/** Janela de prédio (moldura de metal), acesa ou apagada. */
function janelaPredio(x, y, w, h, acesa, seed = 1) {
  if (acesa) return janela(x, y, w, h, { moldura: '#4a4e5a', quente: AMB, haloR: 0.9 });
  const [dg, url] = degrade(FRIO);
  let s = cel(retRed(x - 3, y - 3, w + 6, h + 6, 2.5), '#4a4e5a', { s: 2.5, l: 1.8, w: 2 }) + dg + `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${url}"/>`;
  s += recorte(ret(x, y, w, h), `<path d="M${x + w * 0.15},${y + h} L${x + w * 0.55},${y} L${x + w * 0.72},${y} L${x + w * 0.32},${y + h}Z" fill="#9adfff" opacity="0.25"/><rect x="${x}" y="${y}" width="${w}" height="4" fill="#000" opacity="0.3"/>`);
  s += `<rect x="${x + w / 2 - 1.2}" y="${y}" width="2.4" height="${h}" fill="#3a3e48"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${TINTA}" stroke-width="1.2"/>`;
  return { s, e: '' };
}
/** Letreiro de neon em texto (tubo claro + brilho magenta). */
function neonTexto(x, y, t, size, cor, o = {}) {
  const s = texto(x, y, t, size, luz(cor, 0.55), { stroke: sombra(cor, 0.45), sw: size * 0.16, ...o });
  const e = desfoque(texto(x, y, t, size, cor, { stroke: cor, sw: size * 0.3, ...o }), size * 0.18) + texto(x, y, t, size, luz(cor, 0.6), { stroke: cor, sw: size * 0.08, ...o });
  return { s, e };
}
/** Tubo de neon vertical (vidro + tampas de metal). */
function tuboNeon(x, y, h, cor, esp = 7) {
  let s = cel(retRed(x - esp / 2, y, esp, h, esp / 2), luz(cor, 0.35), { s: 1.5, l: 1, w: 1.6, cc: sombra(cor, 0.6) }) + `<rect x="${x - esp * 0.25}" y="${y + 3}" width="${esp * 0.18}" height="${h - 6}" fill="#fff" opacity="0.8" rx="1"/>`;
  s += chapa(x - esp / 2 - 2, y - 4, esp + 4, 6, '#4a4e5a', { rebites: false, s: 1.5, l: 1 }) + chapa(x - esp / 2 - 2, y + h - 2, esp + 4, 6, '#4a4e5a', { rebites: false, s: 1.5, l: 1 });
  const e = halo(x, y + h / 2, h * 0.65, cor, 0.5) + desfoque(`<rect x="${x - esp / 2}" y="${y}" width="${esp}" height="${h}" rx="${esp / 2}" fill="${cor}"/>`, 2.5) + `<rect x="${x - esp * 0.3}" y="${y + 1}" width="${esp * 0.6}" height="${h - 2}" rx="${esp * 0.3}" fill="${luz(cor, 0.5)}"/>`;
  return { s, e };
}
function arCond(x, y, w = 30, h = 20) {
  let s = chapa(x, y, w, h, '#c8ccd4', { s: 3, l: 2, rebites: false });
  s += `<circle cx="${x + h / 2 + 1}" cy="${y + h / 2}" r="${h * 0.36}" fill="#3a3e48" stroke="${TINTA}" stroke-width="1"/>` + traco(`M${x + h / 2 + 1 - h * 0.3},${y + h / 2} h${h * 0.6} M${x + h / 2 + 1},${y + h / 2 - h * 0.3} v${h * 0.6}`, '#8a8e98', 1.2);
  for (let i = 0; i < 4; i++) s += traco(`M${x + h + 2},${y + 4 + i * (h - 8) / 3} h${w - h - 5}`, '#7a7e88', 1);
  s += traco(`M${x + w - 4},${y + h} v6`, '#5ac8ff', 1.2, 0.8);
  return s;
}
/** Telhado plano visto em 3/4 (laje com cascalho e mureta). */
function laje(x, y, w, h, seed) {
  const r = rnd(seed);
  let s = cel(retRed(x, y, w, h, 2), '#5a5e68', { s: 3, l: 2, w: 2.2 });
  for (let i = 0; i < w * h / 60; i++) s += `<circle cx="${f1(x + 3 + r() * (w - 6))}" cy="${f1(y + 3 + r() * (h - 6))}" r="${f1(0.6 + r() * 0.8)}" fill="${r() < 0.5 ? '#43464f' : '#7a7e88'}"/>`;
  return s;
}
function mureta(x, y, w, h = 8) {
  let s = '';
  for (let cx = x; cx < x + w - 1; cx += 24) s += cel(retRed(cx, y, Math.min(24, x + w - cx), h, 2), '#8a8e98', { s: 2.5, l: 2, w: 1.8 });
  return s;
}

export function predioNeon() {
  const W = 262, H = 322, r = rnd(301);
  let s = sombraChao(131, 314, 128, 10), e = '';
  // laje do telhado e coisas em cima
  s += laje(14, 34, 234, 40, 302);
  // caixa d'água
  s += traco('M42,62 l-4,12 M74,62 l4,12 M58,62 v12', '#2a2c34', 2.6);
  s += cel(retRed(36, 18, 44, 46, 8), '#7a8a9a', { s: 6, l: 3, w: 2.4 }) + cel(elipse(58, 18, 22, 6), '#9aaab8', { s: 2, l: 1.5, w: 2 });
  for (const y of [32, 48]) s += traco(`M37,${y} h42`, '#4a5664', 1.6);
  s += texto(58, 44, 'H₂O', 9, '#e0742a', { sw: 0 }) + brilho(45, 30, 2, 6, 0, 0.5);
  // antena e parabólica
  s += traco('M214,62 V4 M206,16 h16 M208,28 h12 M210,40 h8', '#2a2c34', 2.2) + `<circle cx="214" cy="4" r="2.5" fill="#ff3a3a" stroke="${TINTA}" stroke-width="1"/>`;
  e += halo(214, 4, 9, '#ff3a3a', 0.8);
  s += cel(`M168,40 a14,10 -20 0 1 22,18 Z`, '#c8ccd4', { s: 2, l: 1.5, w: 1.8 }) + traco('M178,50 l6,14', '#2a2c34', 2);
  // caixa de ventilação com vapor
  s += chapa(110, 40, 30, 24, '#6a6e78', { s: 3, l: 2 }) + traco('M114,48 h22 M114,53 h22 M114,58 h22', '#3a3e48', 1.4);
  s += massa(bolhas([[126, 30, 9, 7], [134, 22, 7, 6], [122, 18, 6, 5], [130, 12, 5, 4]]), '#e8eaf0', { s: 2.5, l: 1.5, w: 1.6, cc: '#8a8ea0' });
  // mureta da frente da laje
  s += mureta(12, 66, 238, 9);
  // fachada de blocos
  s += blocos(14, 75, 234, 236, PEDRA, 303, { linhas: 20, larg: 30 });
  // sombra sob a mureta
  s += `<rect x="14" y="75" width="234" height="7" fill="#0a0a14" opacity="0.35"/>`;
  // ressaltos entre andares
  for (const y of [148, 226]) s += cel(retRed(10, y, 242, 8, 2), '#8a8e98', { s: 2.5, l: 2, w: 2 }) + `<rect x="14" y="${y + 8}" width="234" height="5" fill="#0a0a14" opacity="0.3"/>`;
  // 3º andar: janelas e ar-condicionado
  [[30, 1], [108, 0], [186, 1]].forEach(([x, ac], i) => {
    const j = janelaPredio(x, 90, 44, 44, i !== 1 || r() < 2, 304 + i);
    s += j.s; e += j.e;
    s += cel(retRed(x - 4, 136, 52, 5, 1.5), '#9a9ea8', { s: 1.5, l: 1, w: 1.6 });
  });
  s += arCond(79, 114, 25, 18) + arCond(157, 118, 24, 16);
  // 2º andar: janelinhas laterais + letreiro NEON
  for (const x of [22, 216]) { const j = janelaPredio(x, 168, 24, 36, x < 100, 310); s += j.s; e += j.e; }
  s += cel(retRed(58, 160, 146, 56, 5), GRAFITE, { s: 4, l: 2, w: 2.6 }) + `<rect x="64" y="166" width="134" height="44" rx="3" fill="#1a1626"/>`;
  for (const [x, y] of [[62, 164], [200, 164], [62, 212], [200, 212]]) s += rebite(x, y, 1.4);
  const nt = neonTexto(131, 202, 'NEON', 36, MAGENTA, { ls: 2 });
  s += nt.s; e += nt.e + halo(131, 188, 90, MAGENTA, 0.35);
  for (const x of [52, 210]) { const t = tuboNeon(x, 158, 60, CIANO); s += t.s; e += t.e; }
  // canos laranja
  s += canoV(242, 40, 270, 9, LARANJA, [80, 150, 230, 290]) + canoH(150, 146, 92, 8, LARANJA, [170, 210]);
  s += cel(elipse(242, 146, 7, 7), sombra(LARANJA, 0.1), { s: 2, l: 1.5, w: 1.8 });
  s += cel(retRed(236, 290, 18, 10, 2), '#c83a2a', { s: 2, l: 1, w: 1.6 }) + traco('M245,290 v-6 M240,284 h10', '#2a2c34', 2.2);
  // térreo: marquise
  s += `<rect x="16" y="242" width="230" height="8" fill="#0a0a14" opacity="0.4"/>`;
  s += cel(poli([[12, 228], [250, 228], [256, 244], [6, 244]]), ARDOSIA, { s: 3, l: 2, w: 2.4 }) + perigo(8, 240, 246, 6, { passo: 6 });
  for (let x = 24; x < 250; x += 26) s += rebite(x, 234, 1.3);
  // vitrines e porta
  for (const x of [26, 166]) {
    const j = janela(x, 256, 70, 40, { moldura: '#3c3f4a', quente: AMB, cruz: false, haloR: 0.8 });
    s += j.s; e += j.e;
    // produtos na vitrine
    for (let i = 0; i < 5; i++) s += cel(retRed(x + 6 + i * 13, 280 - (i % 2) * 6, 9, 16 + (i % 2) * 6, 1.5), ['#ff3ad0', '#3ef0ff', '#ffd34a', '#7a5aff', '#ff8a3a'][i], { s: 1.5, l: 1, w: 1.2 });
    s += traco(`M${x},${282} h70`, '#3c3f4a', 2);
  }
  s += texto(61, 268, '24H', 9, '#ff3a3a', { sw: 0 });
  e += texto(61, 268, '24H', 9, '#ff5a5a', { sw: 0 });
  s += cel(retRed(106, 252, 50, 60, 3), GRAFITE, { s: 3, l: 2, w: 2.4 });
  const [dg, url] = degrade(['#c8fbff', '#5ad8ff', '#2a8ad0']);
  s += dg + `<rect x="111" y="257" width="40" height="55" fill="${url}"/><rect x="130" y="257" width="2.4" height="55" fill="${GRAFITE}"/>` + recorte(ret(111, 257, 40, 55), `<path d="M114,312 L130,257 h6 L120,312Z" fill="#fff" opacity="0.35"/>`);
  s += `<rect x="111" y="257" width="40" height="55" fill="none" stroke="${TINTA}" stroke-width="1.3"/>` + traco('M126,284 v8 M136,284 v8', '#e8eaf0', 2);
  e += halo(131, 285, 40, '#3ef0ff', 0.4) + `<rect x="111" y="257" width="40" height="55" fill="#3ad0ff" opacity="0.6"/>`;
  // cartazinho do aluguel de cápsula
  s += cel(retRed(160, 300, 30, 12, 1.5), '#f3f0e8', { s: 1.5, l: 1, w: 1.2 }) + texto(175, 305.5, 'CÁPSULA', 4.6, '#c83a2a', { sw: 0 }) + texto(175, 310.5, 'R$ 999/h', 4.2, TINTA, { sw: 0 });
  // rodapé sujo e degrau
  s += cel(retRed(10, 308, 242, 8, 2), '#4a4e58', { s: 2, l: 1.5, w: 2 }) + cel(retRed(100, 310, 62, 8, 2), '#8a8e98', { s: 2, l: 1.5, w: 2 });
  s += `<rect x="14" y="300" width="80" height="8" fill="#1a1420" opacity="0.18"/>`;
  return { nome: 'predio_neon', w: W, h: H, svg: s, emissivo: e };
}

export function predioAlto() {
  const W = 222, H = 384, r = rnd(321);
  let s = sombraChao(111, 376, 110, 9), e = '';
  s += laje(18, 118, 186, 32, 322);
  // projetores e mastro do outdoor holográfico
  s += traco('M60,130 V112 M162,130 V112', '#2a2c34', 3);
  s += chapa(46, 112, 28, 12, GRAFITE, { s: 2, l: 1.5 }) + chapa(148, 112, 28, 12, GRAFITE, { s: 2, l: 1.5 });
  // painel holográfico (no traço normal, um vidro ciano translúcido para ser legível de dia)
  const pn = retRed(10, 4, 202, 100, 6);
  s += `<path d="${pn}" fill="#3ef0ff" opacity="0.18"/><path d="${pn}" fill="none" stroke="#2ab8d0" stroke-width="2" opacity="0.9"/>`;
  for (let y = 10; y < 104; y += 5) s += `<rect x="12" y="${y}" width="198" height="1" fill="#3ef0ff" opacity="0.15"/>`;
  const t1 = neonTexto(111, 40, 'PREÇO', 30, CIANO, { ls: 1 }), t2 = neonTexto(111, 76, 'DINÂMICO', 26, MAGENTA, { ls: 0 });
  s += t1.s.replace('opacity="1"', 'opacity="0.85"') + t2.s.replace('opacity="1"', 'opacity="0.85"');
  const graf = 'M22,98 L40,94 L56,96 L72,90 L90,93 L108,87 L124,89 L140,84 L156,86 L168,80';
  s += traco(graf, '#ffd34a', 2.2, 0.85) + texto(188, 98, '+37%', 10, '#ffd34a', { sw: 1.6, stroke: '#7a4a10' });
  s += traco('M162,79 l6,1 l-2,5', '#ffd34a', 2.2);
  // treliça que segura o painel na laje
  for (const x of [30, 192]) s += traco(`M${x},104 V134 M${x - 6},104 L${x + 6},120 L${x - 6},134`, '#2a2c34', 4) + traco(`M${x},104 V134 M${x - 6},104 L${x + 6},120 L${x - 6},134`, '#6a707c', 2);
  e += halo(111, 54, 120, CIANO, 0.25) + `<path d="${pn}" fill="#3ef0ff" opacity="0.12"/><path d="${pn}" fill="none" stroke="#7ff8ff" stroke-width="2"/>` + t1.e + t2.e + desfoque(traco(graf, '#ffd34a', 3), 1.5) + traco(graf, '#ffe88a', 1.4) + texto(186, 96, '+37%', 9, '#ffd34a', { sw: 0 });
  // feixes dos projetores
  e += `<path d="M54,112 L20,100 H90Z M168,112 L132,100 H202Z" fill="#3ef0ff" opacity="0.18"/>`;
  s += mureta(16, 146, 190, 8);
  // fachada
  s += blocos(18, 154, 186, 220, ARDOSIA, 323, { linhas: 18, larg: 28 });
  s += `<rect x="18" y="154" width="186" height="6" fill="#0a0a14" opacity="0.35"/>`;
  // faixa vertical de grafite com janelas em grade
  for (let row = 0; row < 4; row++) {
    const y = 166 + row * 46;
    for (let col = 0; col < 3; col++) {
      if (row === 3 && col === 1) continue; // a porta fica aqui
      const x = 34 + col * 56;
      const j = janelaPredio(x, y, 34, 30, r() < 0.6, 330 + row * 3 + col);
      s += j.s; e += j.e;
      s += cel(retRed(x - 4, y + 32, 42, 4, 1.2), '#9a9ea8', { s: 1.2, l: 1, w: 1.4 });
    }
    if (row < 3) s += cel(retRed(14, y + 40, 194, 5, 1.5), '#7a7e88', { s: 1.5, l: 1, w: 1.6 });
  }
  s += arCond(150, 212, 24, 16) + arCond(40, 258, 24, 16);
  // canos laranja e tubo ciano
  s += canoV(24, 150, 222, 8, LARANJA, [190, 250, 320]) + canoH(24, 300, 60, 7, LARANJA, [50]);
  const tb = tuboNeon(204, 200, 110, CIANO, 7);
  s += tb.s; e += tb.e;
  // porta de serviço com faixa de perigo
  s += cel(retRed(84, 326, 54, 50, 3), GRAFITE, { s: 3, l: 2, w: 2.4 }) + perigo(84, 318, 54, 8, { passo: 6 });
  s += chapa(90, 332, 42, 42, '#5a606c', { s: 3, l: 2 }) + traco('M92,346 h38 M92,358 h38', '#3a3e48', 1.2);
  s += `<rect x="104" y="335" width="14" height="5" rx="1" fill="#3ef0ff" stroke="${TINTA}" stroke-width="0.8"/>`;
  e += `<rect x="104" y="335" width="14" height="5" rx="1" fill="#3ef0ff"/>` + halo(111, 337, 10, CIANO, 0.6);
  s += cel(retRed(14, 368, 194, 8, 2), '#4a4e58', { s: 2, l: 1.5, w: 2 });
  return { nome: 'predio_alto', w: W, h: H, svg: s, emissivo: e };
}

export function oficinaNeon() {
  const W = 242, H = 222;
  let s = sombraChao(121, 214, 118, 9), e = '';
  // telhado de chapa ondulada (arco)
  const tel = `M8,96 Q8,26 121,20 Q234,26 234,96Z`;
  s += cel(tel, '#8a929e', { s: 10, l: 5, w: 3 });
  let on = '';
  for (let x = 12; x < 234; x += 8) on += traco(`M${x},96 Q${121 + (x - 121) * 0.92},24 ${121 + (x - 121) * 0.9},20`, '#5a606c', 1.6, 0.7) + traco(`M${x + 3},96 Q${121 + (x + 3 - 121) * 0.92},26 ${121 + (x + 3 - 121) * 0.9},22`, '#c8ced8', 1, 0.5);
  s += recorte(tel, on + `<path d="M120,10 L234,96 V0Z" fill="#000" opacity="0.08"/>` + `<ellipse cx="160" cy="60" rx="20" ry="10" fill="#b25a22" opacity="0.4"/><ellipse cx="60" cy="80" rx="14" ry="7" fill="#b25a22" opacity="0.3"/>`);
  s += `<path d="${tel}" fill="none" stroke="${TINTA}" stroke-width="3"/>`;
  // claraboia
  s += chapa(100, 36, 42, 14, '#4a4e5a', { s: 2, l: 1.5 }) + `<rect x="104" y="39" width="34" height="8" fill="#9adfff" opacity="0.7"/>`;
  // parede de frente: blocos nos lados, chapa no meio
  s += blocos(12, 94, 218, 118, PEDRA, 341, { linhas: 9, larg: 28 });
  s += `<rect x="12" y="94" width="218" height="8" fill="#0a0a14" opacity="0.4"/>`;
  s += cel(retRed(4, 90, 234, 9, 3), '#6a707c', { s: 2.5, l: 2, w: 2.2 });
  for (let x = 14; x < 236; x += 22) s += rebite(x, 94.5, 1.2);
  // portão de enrolar
  s += cel(retRed(54, 112, 134, 100, 3), GRAFITE, { s: 3, l: 2, w: 2.6 });
  s += cel(retRed(52, 106, 138, 12, 3), '#6a707c', { s: 3, l: 2, w: 2.2 });
  for (let i = 0; i < 9; i++) {
    const y = 120 + i * 9.6;
    s += cel(retRed(60, y, 122, 9.6, 1), i % 2 ? '#8a929e' : '#7c8490', { s: 2.4, l: 1.4, w: 1.2, gradiente: false });
  }
  s += `<rect x="60" y="120" width="122" height="8" fill="#000" opacity="0.18"/>` + cel(retRed(110, 198, 22, 6, 2), '#c8ccd4', { s: 1, l: 1, w: 1.4 });
  // faixa de perigo no batente
  s += perigo(48, 112, 8, 100, { passo: 6 }) + perigo(186, 112, 8, 100, { passo: 6 }) + perigo(60, 204, 122, 8, { passo: 6 });
  // pichação/adesivo
  s += texto(80, 160, 'NÃO PARE', 7, '#ffd34a', { sw: 1.4, rot: -6 });
  s += texto(160, 178, 'META!', 8, '#ff3ad0', { sw: 1.4, rot: 4 });
  // letreiro OFICINA com lâmpadas
  s += cel(retRed(66, 62, 110, 26, 4), '#2a2c34', { s: 3, l: 2, w: 2.4 });
  const nt = neonTexto(121, 82, 'OFICINA', 17, AMBAR, { ls: 1 });
  s += nt.s; e += nt.e;
  for (let i = 0; i < 9; i++) {
    const x = 72 + i * 12.25;
    for (const y of [65.5, 84.5]) { s += `<circle cx="${f1(x)}" cy="${y}" r="1.6" fill="#ffe88a" stroke="${TINTA}" stroke-width="0.6"/>`; e += `<circle cx="${f1(x)}" cy="${y}" r="3" fill="#ffb03a" opacity="0.8"/>`; }
  }
  // janela lateral e ar-condicionado
  const j = janela(200, 122, 22, 26, { moldura: '#4a4e5a', quente: AMB, haloR: 0.9 });
  s += j.s; e += j.e;
  s += janelaPredio(18, 122, 22, 26, false, 342).s;
  s += arCond(14, 160, 28, 18);
  // placa de parcelamento
  s += cel(retRed(196, 158, 34, 20, 2), '#f3f0e8', { s: 1.5, l: 1, w: 1.4 }) + texto(213, 166, 'CONSERTO', 4.8, TINTA, { sw: 0 }) + texto(213, 174.5, 'EM 12x', 7, '#e0742a', { sw: 0 });
  // canos e pneus
  s += canoV(232, 96, 116, 7, LARANJA, [130, 190]);
  for (const [x, y] of [[26, 206], [26, 196], [26, 186]]) s += cel(elipse(x, y, 14, 5.5), '#2a2a32', { s: 2, l: 1.5, w: 1.8 }) + `<ellipse cx="${x}" cy="${y - 0.5}" rx="6" ry="2.2" fill="#14141a"/>`;
  s += cel(retRed(8, 206, 228, 8, 2), '#4a4e58', { s: 2, l: 1.5, w: 2 });
  return { nome: 'oficina_neon', w: W, h: H, svg: s, emissivo: e };
}

export function quiosqueLaranja() {
  const W = 152, H = 142;
  let s = sombraChao(76, 136, 72, 8), e = '';
  // fundo e prateleira de trás
  s += chapa(16, 40, 120, 52, GRAFITE, { s: 3, l: 2 });
  const rr = rnd(351);
  for (const y of [62, 84]) {
    for (let x = 22; x < 128; x += 8) {
      const c = ['#ff3ad0', '#3ef0ff', '#ffd34a', '#ff8a3a', '#7a5aff', '#e8eaf0'][Math.floor(rr() * 6)];
      s += cel(retRed(x, y - 12 + rr() * 3, 6, 12 - rr() * 3, 1), c, { s: 1.2, l: 0.8, w: 1.1 });
    }
    s += cel(retRed(18, y, 116, 4, 1), '#8a929e', { s: 1, l: 1, w: 1.4 });
  }
  // postes
  for (const x of [8, 138]) s += cel(retRed(x, 30, 6, 108, 2), '#5a606c', { s: 2, l: 1.4, w: 1.8 });
  // toldo listrado laranja/branco
  const tol = poli([[22, 8], [130, 8], [148, 36], [4, 36]]);
  let lis = '';
  for (let i = 0; i < 9; i++) {
    const a0 = i / 9, a1 = (i + 1) / 9;
    lis += `<path d="${poli([[22 + 108 * a0, 8], [22 + 108 * a1, 8], [4 + 144 * a1, 36], [4 + 144 * a0, 36]])}" fill="${i % 2 ? '#f6efe4' : '#f07a24'}"/>`;
  }
  s += recorte(tol, lis + `<rect x="0" y="8" width="152" height="7" fill="#fff" opacity="0.2"/><rect x="0" y="28" width="152" height="8" fill="#3a1a0a" opacity="0.25"/>`);
  s += `<path d="${tol}" fill="none" stroke="#3a1a10" stroke-width="2.4" stroke-linejoin="round"/>`;
  const fr = [];
  for (let i = 0; i < 12; i++) fr.push([4 + 144 * (i + 0.5) / 12, 39, 6.3, 5.5]);
  s += massa(bolhas(fr), '#f07a24', { s: 2.5, l: 1.5, w: 1.6, cc: '#3a1a10' });
  s += cel(retRed(2, 33, 148, 6, 2), '#c85a1a', { s: 1.5, l: 1, w: 1.8, cc: '#3a1a10' });
  // placa de cima
  s += cel(retRed(46, 0, 60, 13, 3), GRAFITE, { s: 2, l: 1.5, w: 1.8 });
  const nt = neonTexto(76, 10, 'APP-KIOSK', 8, AMBAR, { ls: 0.5 });
  s += nt.s; e += nt.e;
  // balcão de metal com telas
  s += chapa(10, 96, 132, 10, '#8a929e', { s: 2, l: 1.5, rebites: false });
  s += chapa(14, 104, 124, 32, '#4a4e5a', { s: 3, l: 2 });
  s += perigo(14, 128, 124, 6, { passo: 5 });
  // telas emissivas
  const telas = [[20, 108, 34, 18, CIANO, 'R$ 9,99'], [60, 108, 34, 18, MAGENTA, 'TAXA 30%'], [100, 108, 32, 18, CIANO, 'PIX ↑']];
  for (const [x, y, w, h, c, t] of telas) {
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="${sombra(c, 0.55)}" stroke="${TINTA}" stroke-width="1.4"/>` + texto(x + w / 2, y + h / 2 + 2.5, t, 6.4, luz(c, 0.5), { sw: 0 });
    e += halo(x + w / 2, y + h / 2, w * 0.8, c, 0.45) + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="${c}" opacity="0.35"/>` + texto(x + w / 2, y + h / 2 + 2.5, t, 6.4, luz(c, 0.6), { sw: 0 });
  }
  // produtos no balcão
  for (const [x, c] of [[22, '#ff3ad0'], [30, '#3ef0ff'], [38, '#ffd34a'], [112, '#ff8a3a'], [120, '#3ef0ff']]) s += cel(retRed(x, 86, 6, 11, 1.5), c, { s: 1.2, l: 0.8, w: 1.1 }) + `<rect x="${x + 1}" y="86" width="4" height="2" fill="#e8eaf0"/>`;
  s += chapa(60, 84, 30, 13, '#c8a070', { rebites: false, s: 2, l: 1 }) + texto(75, 93.5, 'FRÁGIL', 5, '#7a3a1a', { sw: 0 });
  s += cel(retRed(130, 80, 8, 16, 2), '#2a2c34', { s: 1, l: 1, w: 1.2 }) + `<circle cx="134" cy="84" r="1.6" fill="#ff3a3a"/>`;
  e += halo(134, 84, 6, '#ff3a3a', 0.8);
  return { nome: 'quiosque_laranja', w: W, h: H, svg: s, emissivo: e };
}

export function lampiaoMetal() {
  const W = 40, H = 132;
  let s = sombraChao(14, 128, 12, 3), e = '';
  s += cel(retRed(8, 118, 12, 12, 2), GRAFITE, { s: 2, l: 1.5, w: 1.8 });
  s += cel(retRed(11, 22, 6, 98, 2), '#3c3f4a', { s: 2, l: 1.2, w: 1.8 }) + cel(retRed(9, 70, 10, 5, 1.5), LARANJA, { s: 1.2, l: 1, w: 1.4 });
  s += traco('M14,24 Q14,10 26,10 H30', TINTA, 6) + traco('M14,24 Q14,10 26,10 H30', '#3c3f4a', 3.4);
  // cabeça da luminária
  s += cel(`M22,12 h16 l-2,7 h-12Z`, GRAFITE, { s: 1.5, l: 1, w: 1.6 });
  const [dg, url] = degrade(AMB);
  s += dg + `<path d="M24,19 h12 l-1.5,9 h-9Z" fill="${url}" stroke="${TINTA}" stroke-width="1.3"/>`;
  e += halo(30, 26, 28, '#ffb040', 0.75) + `<path d="M24,19 h12 l-1.5,9 h-9Z" fill="#ffd25a"/>` + `<path d="M24,28 L14,56 H46 L36,28Z" fill="#ffb040" opacity="0.12"/>`;
  s += `<circle cx="14" cy="80" r="0" fill="none"/>` + chapa(17, 84, 12, 14, '#c8ccd4', { rebites: false, s: 1.5, l: 1 }) + texto(23, 93, '$', 7, '#2a8a4a', { sw: 0 });
  return { nome: 'lampiao_metal', w: W, h: H, svg: s, emissivo: e, ax: 14 };
}
export function tuboCiano() {
  const W = 26, H = 92;
  const t = tuboNeon(13, 10, 70, CIANO, 9);
  let s = sombraChao(13, 88, 11, 3) + t.s + chapa(4, 80, 18, 10, GRAFITE, { s: 2, l: 1.5, rebites: false }) + rebite(9, 85, 1.2) + rebite(17, 85, 1.2);
  s += traco('M13,4 v3', TINTA, 2);
  return { nome: 'tubo_ciano', w: W, h: H, svg: s, emissivo: t.e };
}
export function barril() {
  const W = 36, H = 44;
  let s = sombraChao(18, 41, 16, 3.5);
  s += cel(`M4,8 Q2,24 4,38 Q18,44 32,38 Q34,24 32,8Z`, '#2f6a9a', { s: 5, l: 3, w: 2.2 });
  s += perigo(4, 20, 28, 6, { passo: 4 });
  for (const y of [12, 32]) s += traco(`M4,${y} Q18,${y + 4} 32,${y}`, '#1a3a5a', 2);
  s += cel(elipse(18, 8, 14, 4.5), '#4a8aba', { s: 1.5, l: 1, w: 2 }) + `<circle cx="24" cy="8" r="2" fill="#1a2a3a"/>` + brilho(9, 16, 1.5, 5, 0, 0.5);
  s += `<path d="M20,12 q2,8 0,10" stroke="#7dff9a" stroke-width="2" fill="none" opacity="0.8"/>`;
  return { nome: 'barril', w: W, h: H, svg: s, emissivo: `<path d="M20,12 q2,8 0,10" stroke="#7dff9a" stroke-width="2.4" fill="none"/>` + halo(20, 16, 8, '#7dff9a', 0.5) };
}
export function barrilMadeira() {
  const W = 36, H = 44;
  let s = sombraChao(18, 41, 16, 3.5);
  const d = `M5,8 Q1,24 5,38 Q18,44 31,38 Q35,24 31,8Z`;
  s += cel(d, '#9a5f36', { s: 5, l: 3, w: 2.2 });
  s += recorte(d, [8, 13, 18, 23, 28].map((x) => traco(`M${x},6 Q${x + (x - 18) * 0.25},24 ${x},42`, '#5a321c', 1, 0.8)).join(''));
  for (const y of [13, 33]) s += traco(`M4,${y} Q18,${y + 4} 32,${y}`, '#3a3e48', 3) + traco(`M4,${y - 0.6} Q18,${y + 3.4} 32,${y - 0.6}`, '#8a8e98', 1);
  s += cel(elipse(18, 8, 13, 4.2), '#c08850', { s: 1.5, l: 1, w: 2 }) + traco('M9,8 h18 M11,6 h14 M11,10 h14', '#8a5a34', 0.8);
  return { nome: 'barril_madeira', w: W, h: H, svg: s };
}
function caixote(x, y, w, h, top, seed, cor = '#b07a44') {
  let s = tabuasH(x, y + top, w, h - top, 3, cor, seed, { pregos: false });
  s += `<path d="${ret(x, y + top, w, h - top)}" fill="none" stroke="${TINTA}" stroke-width="2"/>`;
  s += traco(`M${x + 2},${y + top + 2} L${x + w - 2},${y + h - 2}`, TINTA, 4.4) + traco(`M${x + 2},${y + top + 2} L${x + w - 2},${y + h - 2}`, sombra(cor, 0.15), 2.6);
  s += cel(retRed(x, y, w, top + 1, 1.5), luz(cor, 0.2), { s: 1.5, l: 1, w: 2 }) + traco(`M${x + 3},${y + top / 2} h${w - 6}`, sombra(cor, 0.3), 0.9);
  s += prego(x + 3.5, y + top + 3.5) + prego(x + w - 3.5, y + top + 3.5) + prego(x + 3.5, y + h - 3.5) + prego(x + w - 3.5, y + h - 3.5);
  return s;
}
export function caixa() {
  let s = sombraChao(19, 36, 18, 3.5) + caixote(4, 4, 30, 32, 8, 361);
  s += texto(19, 30, '⚠', 7, '#e0742a', { sw: 0 });
  return { nome: 'caixa', w: 38, h: 40, svg: s };
}
export function pilhaCaixas() {
  let s = sombraChao(36, 68, 34, 4.5) + caixote(4, 34, 32, 34, 8, 371) + caixote(36, 38, 30, 30, 7, 372, '#9a6a3a') + caixote(16, 4, 30, 32, 8, 373, '#c08850');
  s += chapa(40, 46, 22, 10, '#f3f0e8', { rebites: false, s: 1, l: 1, w: 1.2 }) + texto(51, 53.5, 'NEON', 5.5, '#ff3ad0', { sw: 0 });
  return { nome: 'pilha_caixas', w: 72, h: 72, svg: s };
}
export function cano() {
  const W = 72, H = 32;
  let s = sombraChao(36, 29, 34, 3.5) + canoH(6, 18, 52, 14, LARANJA, [18, 44]);
  s += cel(elipse(60, 18, 5, 9), sombra(LARANJA, 0.15), { s: 2, l: 1, w: 2 }) + `<ellipse cx="61" cy="18" rx="3" ry="6" fill="#1a1420"/>`;
  s += traco('M30,11 v-6', TINTA, 3.4) + traco('M30,11 v-6', '#5a606c', 1.8) + cel(elipse(30, 5, 7, 2.4), '#c83a2a', { s: 1, l: 1, w: 1.4 });
  s += `<path d="M62,26 q4,2 8,1" stroke="#3ef0ff" stroke-width="2" fill="none" opacity="0.6"/>`;
  return { nome: 'cano', w: W, h: H, svg: s };
}
export function placaPerigo() {
  const W = 52, H = 58;
  let s = sombraChao(26, 55, 12, 2.5) + cel(retRed(23, 26, 6, 30, 1.5), '#5a606c', { s: 1.5, l: 1, w: 1.6 });
  s += cel(`M26,2 L49,40 Q50,43 47,43 H5 Q2,43 3,40Z`, '#f5b82e', { s: 3, l: 2, w: 2.4 });
  s += `<path d="M26,9 L44,39 H8Z" fill="none" stroke="${TINTA}" stroke-width="2"/>`;
  s += `<path d="M28,16 L21,29 h5 l-3,9 l9,-13 h-5 l3,-9Z" fill="${TINTA}"/>`;
  s += texto(26, 52, 'SEU RISCO', 4.6, '#f5b82e', { sw: 1.2 });
  return { nome: 'placa_perigo', w: W, h: H, svg: s };
}
export function cercaMetal() {
  const W = 64, H = 50;
  let s = sombraChao(32, 46, 32, 3, 0.25);
  s += canoH(0, 16, 64, 5, '#8a929e') + perigo(0, 26, 64, 8, { passo: 5 }) + canoH(0, 38, 64, 4, '#6a707c');
  for (const x of [16, 48]) s += cel(retRed(x - 3.5, 8, 7, 40, 2), GRAFITE, { s: 2, l: 1.4, w: 1.8 }) + cel(retRed(x - 4.5, 6, 9, 4, 1.5), LARANJA, { s: 1, l: 1, w: 1.4 }) + rebite(x, 16, 1.2) + rebite(x, 38, 1.2);
  return { nome: 'cerca_metal', w: W, h: H, svg: s };
}
export function lixeira() {
  const W = 34, H = 46;
  let s = sombraChao(17, 43, 15, 3);
  s += cel(`M5,14 h24 l-2,29 h-20Z`, '#4a7a5a', { s: 4, l: 2, w: 2.2 });
  for (const x of [11, 17, 23]) s += traco(`M${x},18 v22`, '#2a4a3a', 1.2);
  s += texto(17, 34, '♻', 8, '#e8eaf0', { sw: 0 });
  s += cel(`M4,14 Q4,8 17,7 Q30,8 30,14Z`, '#5a8a6a', { s: 2, l: 1.5, w: 2, gradiente: false }).replace('', '');
  s += `<g transform="rotate(-14 8 10)">${cel(retRed(3, 6, 28, 5, 2), '#5a8a6a', { s: 1.5, l: 1, w: 1.8 })}</g>`;
  s += cel(`M18,8 l5,-6 l4,5Z`, '#e8eaf0', { s: 1, l: 1, w: 1.2 }) + cel(retRed(9, 4, 7, 6, 1), '#ff8a3a', { s: 1, l: 1, w: 1.1 });
  s += `<ellipse cx="28" cy="44" rx="4" ry="1.5" fill="#6a5a3a" opacity="0.6"/>`;
  return { nome: 'lixeira', w: W, h: H, svg: s };
}
export function painelHolograma() {
  const W = 58, H = 92;
  let s = sombraChao(29, 88, 18, 3.5), e = '';
  s += chapa(16, 76, 26, 12, GRAFITE, { s: 2, l: 1.5 }) + `<ellipse cx="29" cy="76" rx="10" ry="3" fill="#2ab8d0" stroke="${TINTA}" stroke-width="1"/>`;
  const pn = retRed(4, 6, 50, 56, 4);
  s += `<path d="${pn}" fill="#3ef0ff" opacity="0.2"/><path d="${pn}" fill="none" stroke="#2ab8d0" stroke-width="1.6"/>`;
  const conteudo = texto(29, 20, 'SCORE', 9, '#ff3ad0', { sw: 0 }) + traco('M10,52 L18,44 L26,48 L36,34 L48,28', '#7ff8ff', 2) + texto(29, 32, '742', 10, '#ffd34a', { sw: 0 }) + traco('M10,56 h38', '#7ff8ff', 1, 0.6);
  s += `<g opacity="0.85">${conteudo}</g>`;
  for (let y = 8; y < 62; y += 4) s += `<rect x="5" y="${y}" width="48" height="0.8" fill="#3ef0ff" opacity="0.25"/>`;
  e += halo(29, 36, 46, CIANO, 0.35) + `<path d="M19,76 L4,62 H54 L39,76Z" fill="#3ef0ff" opacity="0.2"/><path d="${pn}" fill="#3ef0ff" opacity="0.18"/><path d="${pn}" fill="none" stroke="#9ffaff" stroke-width="1.6"/>` + conteudo;
  return { nome: 'painel_holograma', w: W, h: H, svg: s, emissivo: e };
}
export function cone() {
  const W = 26, H = 30;
  let s = sombraChao(13, 27, 11, 2.5) + cel(retRed(2, 24, 22, 5, 1.5), '#2a2a32', { s: 1, l: 1, w: 1.6 });
  s += cel(`M10,3 h6 l6,22 h-18Z`, '#f07a24', { s: 3, l: 2, w: 1.8 }) + `<path d="M8.2,10 h9.6 l1.4,5 h-12.4Z" fill="#f6efe4" stroke="${TINTA}" stroke-width="0.8"/>` + brilho(10, 9, 0.8, 3, 15, 0.6);
  return { nome: 'cone', w: W, h: H, svg: s };
}
export function bueiro() {
  const W = 50, H = 32;
  let s = cel(elipse(25, 16, 22, 13), '#5a606c', { s: 2, l: 2, w: 2.2 });
  s += `<ellipse cx="25" cy="16" rx="17" ry="9.5" fill="#3a3e48" stroke="${TINTA}" stroke-width="1.2"/>`;
  s += recorte(elipse(25, 16, 17, 9.5), [10, 14, 18, 22, 26, 30, 34, 38].map((x) => `<rect x="${x}" y="4" width="2.2" height="24" fill="#6a707c"/>`).join('') + `<rect x="6" y="15" width="40" height="2" fill="#6a707c"/>`);
  s += texto(25, 19, 'CN', 6, '#8a929e', { sw: 1.2, stroke: '#2a2c34' });
  return { nome: 'bueiro', w: W, h: H, svg: s, ay: H / 2 };
}
export function pocaNeon() {
  const W = 82, H = 38;
  const d = blob([[6, 20], [14, 10], [34, 6], [56, 8], [76, 14], [78, 26], [60, 32], [36, 32], [16, 30]], 1);
  let s = `<path d="${d}" fill="#1c2236" stroke="#14182a" stroke-width="1.5"/>`;
  const ref = `<rect x="18" y="12" width="26" height="3" rx="1.5" fill="#ff3ad0" opacity="0.7"/><rect x="24" y="18" width="16" height="2" rx="1" fill="#ff3ad0" opacity="0.5"/><rect x="46" y="16" width="20" height="2.5" rx="1.2" fill="#3ef0ff" opacity="0.7"/><rect x="50" y="22" width="12" height="2" rx="1" fill="#3ef0ff" opacity="0.5"/>`;
  s += recorte(d, ref + `<ellipse cx="30" cy="11" rx="12" ry="1.5" fill="#fff" opacity="0.35"/>`);
  const e = recorte(d, desfoque(ref, 1.5) + ref);
  return { nome: 'poca_neon', w: W, h: H, svg: s, emissivo: e, ay: H / 2 };
}
export function arCondicionado() {
  return { nome: 'ar_condicionado', w: 42, h: 36, svg: sombraChao(21, 33, 18, 2.5, 0.25) + arCond(4, 8, 34, 22) + traco('M8,30 v4 M34,30 v4', '#2a2c34', 2) };
}
export function cartaz() {
  const W = 54, H = 68;
  let s = cel(retRed(3, 3, 48, 62, 2), '#f3f0e8', { s: 3, l: 2, w: 2 });
  s += `<rect x="6" y="6" width="42" height="30" fill="#ff8a3a"/>`;
  // sorriso corporativo
  s += cel(elipse(27, 24, 10, 11), '#f2c8a0', { s: 2, l: 1.5, w: 1.6 }) + cel(`M17,20 Q17,10 27,10 Q37,10 37,20 Q30,15 17,20Z`, '#3a2a30', { s: 1, l: 1, w: 1.4 });
  s += `<circle cx="23" cy="23" r="1.2" fill="${TINTA}"/><circle cx="31" cy="23" r="1.2" fill="${TINTA}"/>` + traco('M21,28 Q27,33 33,28', TINTA, 1.4) + traco('M22,29 Q27,32 32,29', '#fff', 1);
  s += cel(`M14,36 Q27,30 40,36Z`, '#2a3a5a', { s: 1, l: 1, w: 1.4 });
  s += texto(27, 45, 'SOMOS UMA', 6.2, '#2a3a5a', { sw: 0 }) + texto(27, 54, 'FAMÍLIA', 9, '#e0442a', { sw: 0 }) + texto(27, 61, '*sujeito a meta', 3.6, '#5a606c', { sw: 0 });
  s += `<path d="M38,3 l13,0 l0,9Z" fill="#c8c4b8" stroke="${TINTA}" stroke-width="1"/>` + rebite(8, 8, 1.2) + rebite(46, 60, 1.2);
  return { nome: 'cartaz', w: W, h: H, svg: s };
}

export function pecasDireita() {
  return [
    predioNeon(), predioAlto(), oficinaNeon(), quiosqueLaranja(), lampiaoMetal(), tuboCiano(), barril(), barrilMadeira(), caixa(),
    pilhaCaixas(), cano(), placaPerigo(), cercaMetal(), lixeira(), painelHolograma(), cone(), bueiro(), pocaNeon(), arCondicionado(), cartaz(),
  ];
}
