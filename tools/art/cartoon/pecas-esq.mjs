// Peças da Margem Esquerda (Raízes): mística e comunitária, mas pobre e remendada. Paleta sóbria:
// verde-musgo profundo, oliva, madeira escura, pedra marrom acinzentada. Sem luz elétrica: vela e lamparina.
import {
  TINTA, blob, bolhas, cachos, brilho, cel, contorno, curva, degrade, desfoque, desgaste, elipse, etiqueta, f1, fio, frasco, fuligem, halo, janela,
  janelaVela, lanterna, lanternaPapel, luz, massa, mistura, musgo, pedras, poli, prego, recorte, ret, retRed, rnd, sombra, sombraChao,
  tabuasH, tabuasPregadas, tabuasV, texto, traco, tufo,
} from './kit.mjs';

const MADEIRA = '#7e5638', MADEIRA_ESC = '#523424', PEDRA = '#7a6c60', MUSGO = '#577e36', MUSGO_ESC = '#3a5a2c';
const ROXO = '#56406e', LILAS = '#7e7090', CIANO = '#5ee0f0', VERDE_RUNA = '#7dffa8';
const LAMPARINA = { luzc: ['#ffe2a8', '#e8a048', '#b8642c'], haloCor: '#e0883a', haloR: 18 };

/** Telhado de tabuinhas cobertas de musgo, com caimento: fileiras de telhas tortas, tufos e cumeeira. */
function telhado(d, x0, x1, y0, y1, seed) {
  const r = rnd(seed);
  let s = cel(d, '#3e4a2c', { s: 8, l: 2, w: 2.4, cc: '#14180e' });
  let fil = '';
  let j = 0;
  for (let y = y0; y < y1 + 8; y += 8, j++) {
    for (let x = x0 - 8 + (j % 2) * 6; x < x1 + 8;) {
      const w = 10 + r() * 4, h = 10;
      const musg = r() < 0.6;
      const c = musg ? mistura('#465a30', '#5c7438', r()) : mistura('#4e3e30', '#66503a', r());
      fil += cel(poli([[x, y - 1 + r()], [x + w, y - 1 + r()], [x + w - 0.6, y + h + (r() - 0.5) * 2], [x + 0.6, y + h + (r() - 0.5) * 2.6]]), c, { s: 2.2, l: 0.8, w: 1, cc: '#14180e', gradiente: false });
      if (!musg && r() < 0.4) fil += traco(`M${f1(x + 3)},${f1(y + 2)} v6`, '#2e241c', 0.7, 0.8);
      x += w;
    }
  }
  // tufos de musgo grosso por cima
  const tf = [];
  for (let i = 0; i < (x1 - x0) / 9; i++) tf.push([x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 6 + r() * 7, 4 + r() * 3]);
  fil += massa(cachos(tf, seed), '#4e6a32', { s: 2.5, l: 1, w: 1.2, cc: '#1a2210' });
  const g = degrade(['#d8d0a0', '#000000', '#000000'], { x2: 0.3, y2: 1 });
  s += g[0] + recorte(d, fil + `<path d="${d}" fill="${g[1]}" opacity="0.14"/>` + desgaste(d, x0, y0, x1 - x0, y1 - y0 + 10, seed + 1, { forca: 0.8, escorrido: false }));
  s += `<path d="${d}" fill="none" stroke="#14180e" stroke-width="2.4" stroke-linejoin="round"/>`;
  return s;
}
/** Lona amarrada tapando um rombo: quadrilátero, dobras, cordas e pedras por cima. */
export function lona(pts, cor = '#4c5866', seed = 1) {
  const r = rnd(seed);
  const [a, b, c, dd] = pts;
  // borda ondulada de pano (cantos + meios deslocados)
  const meio = (p, q, k) => [(p[0] + q[0]) / 2 + (r() - 0.5) * 4, (p[1] + q[1]) / 2 + k];
  const d = blob([a, meio(a, b, 2), b, meio(b, c, 0), c, meio(c, dd, -2.5), dd, meio(dd, a, 0)], 0.35);
  let s = cel(d, cor, { s: 4, l: 1.5, w: 1.8 });
  // vincos e rugas
  let rugas = '';
  for (let i = 0; i < 5; i++) {
    const t = 0.15 + i * 0.17, x0 = a[0] + (dd[0] - a[0]) * t + 4, y0 = a[1] + (dd[1] - a[1]) * t, x1 = b[0] + (c[0] - b[0]) * t - 4, y1 = b[1] + (c[1] - b[1]) * t;
    rugas += traco(`M${f1(x0)},${f1(y0)} Q${f1((x0 + x1) / 2)},${f1((y0 + y1) / 2 + (r() - 0.5) * 8)} ${f1(x1)},${f1(y1)}`, i % 2 ? luz(cor, 0.15) : sombra(cor, 0.3), 1, 0.55);
  }
  s += recorte(d, rugas);
  s += recorte(d, traco(`M${f1((a[0] + b[0]) / 2 + 3)},${f1((a[1] + b[1]) / 2)} L${f1((c[0] + dd[0]) / 2 - 2)},${f1((c[1] + dd[1]) / 2)}`, sombra(cor, 0.35), 1.2, 0.8) +
    traco(`M${f1(a[0] + 4)},${f1((a[1] + dd[1]) / 2)} L${f1(b[0] - 4)},${f1((b[1] + c[1]) / 2 + 3)}`, sombra(cor, 0.3), 1, 0.7) + desgaste(d, Math.min(a[0], dd[0]), Math.min(a[1], b[1]), 80, 60, seed, { forca: 0.7 }));
  // ilhoses e cordas
  for (const [x, y] of pts) s += `<circle cx="${x}" cy="${y}" r="1.4" fill="#8a8478" stroke="${TINTA}" stroke-width="0.6"/>` + traco(`M${x},${y} l${f1((r() - 0.5) * 8)},${f1(4 + r() * 4)}`, '#8a7454', 1.1);
  // pedras segurando
  for (const t of [0.3, 0.7]) {
    const x = a[0] + (c[0] - a[0]) * t + (r() - 0.5) * 6, y = a[1] + (c[1] - a[1]) * t;
    s += cel(elipse(x, y, 4.5, 3.2), '#6e6660', { s: 1.4, l: 0.8, w: 1.2 });
  }
  return s;
}

export function casaMusgo() {
  const W = 210, H = 240, r = rnd(11);
  let s = sombraChao(105, 230, 100, 13), e = '';
  // chaminé de pedra (atrás do telhado), com fuligem na boca
  s += pedras(146, 14, 26, 60, '#6e625a', 4, { linhas: 5, larg: [9, 14] });
  s += recorte(ret(146, 14, 26, 60), fuligem(159, 16, 16, 18, 0.6));
  s += cel(retRed(142, 8, 34, 9, 1.5), '#5e544e', { s: 2, l: 1, w: 2 }) + `<ellipse cx="159" cy="11" rx="11" ry="2.5" fill="#120c10"/>`;
  // base de pedra
  s += pedras(20, 194, 170, 34, PEDRA, 3, { linhas: 2, larg: [16, 28] });
  s += desgaste(ret(20, 194, 170, 34), 20, 194, 170, 34, 2, { escorrido: false });
  // paredes de tábua gasta
  s += tabuasV(28, 112, 154, 84, 11, MADEIRA, 5, { irregular: true });
  s += tabuasV(146, 150, 14, 44, 1, '#8a6a48', 6); // tábua trocada, mais nova
  s += desgaste(ret(28, 112, 154, 84), 28, 112, 154, 84, 7, { forca: 1.1 });
  s += `<path d="${ret(28, 112, 154, 84)}" fill="none" stroke="${TINTA}" stroke-width="2.2"/>`;
  // vigas de canto e travessa
  s += cel(retRed(22, 108, 12, 90, 1.5), MADEIRA_ESC, { s: 3, l: 1, w: 2 }) + cel(retRed(176, 108, 12, 90, 1.5), MADEIRA_ESC, { s: 3, l: 1, w: 2 });
  s += cel(retRed(22, 184, 166, 10, 1.5), MADEIRA_ESC, { s: 3, l: 1, w: 2 });
  for (const x of [28, 60, 150, 182]) s += prego(x, 189, 1.3);
  // janela redonda: tapada com tábuas
  const j1 = janelaVela(42, 132, 34, 34, { tipo: 'redonda', vela: false });
  s += j1.s + tabuasPregadas(40, 134, 38, 30, 12, '#6a4a34');
  // janela em arco: sem luz elétrica, só uma vela
  const j2 = janelaVela(136, 128, 30, 40, { tipo: 'arco' });
  s += j2.s; e += j2.e;
  // floreira virou horta: poucas mudas
  s += cel(retRed(130, 170, 42, 9, 1.5), MADEIRA_ESC, { s: 2, l: 1, w: 1.8 });
  for (const fx of [136, 150, 164]) s += tufo(fx, 171, '#4e6e34', fx, 0.55);
  // porta em arco, remendada
  const pw = 40, px = 105 - pw / 2, py = 140;
  const portaD = `M${px},214 V${py + 20} A${pw / 2},${pw / 2} 0 0 1 ${px + pw},${py + 20} V214Z`;
  s += cel(`M${px - 5},214 V${py + 15} A${pw / 2 + 5},${pw / 2 + 5} 0 0 1 ${px + pw + 5},${py + 15} V214Z`, '#655c54', { s: 3, l: 1, w: 2.2 });
  s += recorte(portaD, tabuasV(px, py, pw, 76, 4, '#5e3c26', 9, { pregos: false }) + `<rect x="${px}" y="${py}" width="${pw}" height="12" fill="#120808" opacity="0.4"/>` + desgaste(portaD, px, py, pw, 76, 8));
  s += `<path d="${portaD}" fill="none" stroke="${TINTA}" stroke-width="2"/>`;
  for (const yy of [160, 196]) s += cel(retRed(px + 2, yy, pw - 4, 5, 1), '#2e2a30', { s: 1.4, l: 0.6, w: 1.2 }) + prego(px + 7, yy + 2.5, 1.1) + prego(px + pw - 7, yy + 2.5, 1.1);
  s += cel(retRed(px + 22, 170, 14, 18, 1), '#7a6048', { s: 1.4, l: 0.8, w: 1.2 }) + prego(px + 24, 172, 0.9) + prego(px + 34, 186, 0.9);
  s += `<circle cx="${px + 8}" cy="186" r="2.2" fill="#8a7444" stroke="${TINTA}" stroke-width="1"/>`;
  // aviso desbotado pregado (texto ilegível, só rabisco)
  s += cel(`M38,170 h26 l-1,14 h-24Z`, '#bcb29a', { s: 1.4, l: 0.6, w: 1.2 }) + traco('M42,175 h16 M42,178.5 h12 M42,182 h15', '#5a5450', 0.8, 0.7) + prego(51, 171.5, 0.9);
  // lamparina sob o beiral
  const ln = lanterna(13, 124, { esc: 1, ...LAMPARINA });
  s += traco('M13,118 v6', TINTA, 1.4) + ln.s; e += ln.e;
  // degraus
  s += cel(retRed(77, 220, 56, 14, 2), '#6e6258', { s: 3.5, l: 1, w: 2.2 }) + cel(retRed(83, 211, 44, 11, 2), '#7a6e64', { s: 3, l: 1, w: 2.2 });
  s += traco('M88,226 l6,2 M118,224 l4,3 M100,214 l3,4', '#3e3630', 0.9);
  // sombra interna sob o beiral
  s += recorte(ret(22, 108, 166, 42), `<path d="M10,108 H200 V128 Q105,146 10,128Z" fill="#120810" opacity="0.5"/>`);
  // telhado com caimento, musgo e um rombo tapado com lona
  const tel = poli([[0, 130], [36, 34], [174, 34], [210, 130], [168, 137], [105, 133], [44, 138]]);
  s += telhado(tel, 0, 210, 34, 136, 21);
  s += lona([[122, 62], [166, 58], [174, 96], [126, 102]], '#4c5866', 3);
  s += cel(retRed(30, 28, 150, 9, 2), '#3a3428', { s: 2.5, l: 0.8, w: 2.2 }) + musgo(36, 176, 30, 22, { cor: '#4a6430', alt: 3.5, gotas: 0.2 });
  // testeira (tábua grossa no beiral) e musgo pendendo
  s += traco('M0,130 L44,138 L105,133 L168,137 L210,130', '#14180e', 7) + traco('M0,130 L44,138 L105,133 L168,137 L210,130', '#4a3424', 4.4);
  s += musgo(8, 202, 134, 31, { cor: '#465e2e', alt: 3.5, gotas: 0.5 });
  // barril de água da chuva e lenha
  s += cel(`M6,206 Q4,219 6,232 Q15,236 24,232 Q26,219 24,206Z`, '#5e3e28', { s: 3, l: 1, w: 1.8 }) + traco('M5,212 Q15,215 25,212 M5,226 Q15,229 25,226', '#2e2a2c', 1.6);
  s += cel(elipse(15, 206, 9, 3), '#2a3a44', { s: 1, l: 0.6, w: 1.6 }) + fio(15, 136, 15, 204, 0, '#3a3a3a', 1.6);
  for (const [x, y] of [[196, 224], [205, 224], [200.5, 216]]) s += cel(elipse(x, y, 5, 4.6), '#9a7a58', { s: 1.4, l: 0.6, w: 1.5, cc: '#2a1810' }) + `<circle cx="${x}" cy="${y}" r="1.6" fill="none" stroke="#6a5038" stroke-width="0.8"/>`;
  // musgo e tufos na base
  s += musgo(26, 76, 228, 41, { cor: '#465e2e', alt: 4, gotas: 0 }) + musgo(140, 190, 228, 42, { cor: '#465e2e', alt: 4, gotas: 0 });
  s += tufo(30, 232, '#4e6e34', 51) + tufo(192, 232, '#4e6e34', 52) + tufo(140, 234, '#56763a', 53, 0.8) + tufo(64, 234, '#56763a', 54, 0.8);
  return { nome: 'casa_musgo', w: W, h: H, svg: s, emissivo: e };
}

export function bancaRoxa() {
  const W = 150, H = 150;
  // ---------- fundo ----------
  let s = sombraChao(75, 142, 70, 9), e = '';
  s += cel(retRed(20, 44, 110, 70, 1.5), '#3a2c40', { s: 4, l: 1, w: 2 });
  for (let i = 0; i < 7; i++) s += traco(`M${28 + i * 16},46 Q${30 + i * 16},80 ${27 + i * 16},112`, '#2a1e30', 1.2, 0.8);
  s += cel(retRed(16, 30, 8, 108, 1.5), MADEIRA_ESC, { s: 2.5, l: 1, w: 2 }) + cel(retRed(126, 30, 8, 108, 1.5), MADEIRA_ESC, { s: 2.5, l: 1, w: 2 });
  // prateleiras meio vazias: poucos frascos, potes vazios, poeira
  const prat = [[70, [[34, '#6a9a78', 0], [44, null, 2], [96, '#8a6a84', 1]]], [96, [[30, null, 1], [58, '#5a7a96', 2], [66, null, 0], [112, '#a08a4a', 1]]]];
  for (const [yy, itens] of prat) {
    for (const [x, c, t] of itens) {
      if (c) { const fz = frasco(x, yy, c, t, 0.75); s += fz.s; }
      else s += `<path d="M${x - 3},${yy - 10} h6 v9 q0,1 -1,1 h-4 q-1,0 -1,-1Z" fill="#c8d4d0" opacity="0.35" stroke="${TINTA}" stroke-width="0.9"/>`;
    }
    s += cel(retRed(22, yy, 106, 5, 1), MADEIRA, { s: 2, l: 0.8, w: 1.6 });
    s += `<rect x="24" y="${yy - 1}" width="102" height="1.2" fill="#bcb29a" opacity="0.3"/>`;
  }
  s += etiqueta(76, 99, '3', '8');
  // ervas secas penduradas
  for (const x of [36, 60, 92, 114]) s += traco(`M${x},44 v6`, '#2a2018', 1) + massa(bolhas([[x, 54, 3, 5], [x - 2.4, 57, 2.2, 4], [x + 2.4, 57, 2.2, 4]]), x % 2 ? '#6a6a3a' : '#7a6a40', { s: 1.5, l: 0.6, w: 1 });
  // toldo listrado apagado, com remendo e rasgo
  const tol = poli([[22, 6], [128, 6], [146, 36], [4, 36]]);
  let lis = '';
  for (let i = 0; i < 9; i++) {
    const a0 = i / 9, a1 = (i + 1) / 9;
    lis += `<path d="${poli([[22 + 106 * a0, 6], [22 + 106 * a1, 6], [4 + 142 * a1, 36], [4 + 142 * a0, 36]])}" fill="${i % 2 ? LILAS : ROXO}"/>`;
  }
  lis += cel(poli([[86, 14], [104, 13], [106, 27], [88, 28]]), '#6e6450', { s: 1.4, l: 0.6, w: 1 }) + traco('M87,15 l2,0 m4,0 l2,0 m4,0 l2,0 M105,16 l0,2 m0,4 l0,2', '#2a2018', 0.7);
  lis += `<path d="M40,30 l4,6 l3,-5 Z" fill="#1a1420"/>`;
  s += recorte(tol, lis + `<rect x="0" y="28" width="150" height="8" fill="#14081e" opacity="0.3"/>` + desgaste(tol, 0, 6, 150, 30, 9, { forca: 0.8 }));
  s += `<path d="${tol}" fill="none" stroke="#1a1024" stroke-width="2.2" stroke-linejoin="round"/>`;
  // franja de pontas (angulosa)
  let fr = '';
  for (let i = 0; i < 14; i++) { const x = 4 + (142 * i) / 14; fr += `M${f1(x)},38 L${f1(x + 142 / 14)},38 L${f1(x + 71 / 14)},${44 + (i % 2) * 2}Z `; }
  s += cel(fr, ROXO, { s: 1.5, l: 0.6, w: 1.2, cc: '#1a1024' });
  s += cel(retRed(2, 33, 146, 6, 1.5), '#3e3054', { s: 1.5, l: 0.6, w: 1.8, cc: '#1a1024' });
  // placa pequena de madeira entalhada
  s += traco('M64,6 v-4 M86,6 v-4', '#2a2018', 1) + cel(retRed(58, -1, 34, 10, 1.5), '#5a3e2a', { s: 1.5, l: 0.6, w: 1.4 }) + texto(75, 6.2, 'BENZIMENTO', 4.4, '#d8c49a', { sw: 0, peso: 700, fonte: 'Georgia,serif', ls: 0.3 });
  const fundo = { nome: 'banca_roxa_fundo', w: W, h: H, svg: s, emissivo: e };

  // ---------- frente ----------
  let f = '', fe = '';
  const top = 90; // borda de cima do balcão (tampo de y=84 a 96)
  f += cel(retRed(4, 38, 9, 108, 1.5), MADEIRA_ESC, { s: 2.5, l: 1, w: 2 }) + cel(retRed(137, 38, 9, 108, 1.5), MADEIRA_ESC, { s: 2.5, l: 1, w: 2 });
  f += tabuasH(8, top - 6, 134, 12, 2, '#76563a', 13, { pregos: true });
  f += `<path d="${ret(8, top - 6, 134, 12)}" fill="none" stroke="${TINTA}" stroke-width="2"/>`;
  f += tabuasV(12, top + 6, 126, 46, 9, MADEIRA, 14, { irregular: true });
  f += desgaste(ret(12, top + 6, 126, 46), 12, top + 6, 126, 46, 15);
  f += `<path d="${ret(12, top + 6, 126, 46)}" fill="none" stroke="${TINTA}" stroke-width="2"/>`;
  f += `<rect x="12" y="${top + 6}" width="126" height="6" fill="#120810" opacity="0.4"/>`;
  // pano com folha (puído)
  f += cel(`M48,${top + 4} H102 V${top + 36} L75,${top + 46} L48,${top + 36}Z`, '#3e3054', { s: 3, l: 0.8, w: 1.8, cc: '#1a1024' });
  f += cel(`M75,${top + 14} q9,8 0,22 q-9,-14 0,-22Z`, '#a08440', { s: 1.5, l: 0.6, w: 1.2 }) + traco(`M75,${top + 16} v18`, '#6a5420', 1);
  f += traco(`M54,${top + 36} l3,4 M93,${top + 38} l2,3`, '#1a1024', 1);
  // pouca coisa no balcão: dois frascos, uma cesta vazia, pilão e a vela
  for (const [x, c, t, k] of [[24, '#8a6a84', 1, 1], [118, '#6a9a78', 0, 0.9]]) { const fz = frasco(x, top - 1, c, t, k); f += fz.s; fe += fz.e.replace(/opacity="0.45"/, 'opacity="0.2"'); }
  f += cel(`M34,${top - 8} h20 l-2,7 h-16Z`, '#8a7050', { s: 1.5, l: 0.6, w: 1.2 }) + traco(`M36,${top - 5} h16 M37,${top - 3} h14`, '#5a4430', 0.7);
  f += cel(`M58,${top - 1} h14 l-2,-9 h-10Z`, '#6e6a62', { s: 2, l: 0.6, w: 1.4 }) + traco(`M66,${top - 8} l6,-10`, '#523424', 2.4);
  f += etiqueta(104, top - 11, '2', '6');
  f += cel(retRed(88, top - 12, 5, 11, 1), '#cfc3a8', { s: 1.2, l: 0.6, w: 1.1 }) + `<path d="M90.5,${top - 13} q-2,-3 0,-6 q2,3 0,6Z" fill="#e8a048" stroke="${TINTA}" stroke-width="0.6"/>`;
  fe += halo(90.5, top - 16, 16, '#e0883a', 0.6) + `<path d="M90.5,${top - 13} q-2,-3 0,-6 q2,3 0,6Z" fill="#ffd890"/>`;
  f += musgo(12, 50, top + 52, 61, { cor: '#465e2e', alt: 3.5, gotas: 0 }) + musgo(104, 138, top + 52, 62, { cor: '#465e2e', alt: 3.5, gotas: 0 });
  f += tufo(8, 148, '#4e6e34', 63, 0.8) + tufo(142, 148, '#4e6e34', 64, 0.8);
  const frente = { nome: 'banca_roxa_frente', w: W, h: H, svg: f, emissivo: fe };
  return [fundo, frente];
}

function runaGlifo(cx, cy, k, tipo) {
  if (tipo === 0) return `M${cx},${cy - 12 * k} v${24 * k} M${cx - 7 * k},${cy - 5 * k} L${cx},${cy + 2 * k} L${cx + 7 * k},${cy - 5 * k} M${cx - 5 * k},${cy + 8 * k} h${10 * k}`;
  return `M${cx - 6 * k},${cy + 11 * k} L${cx},${cy - 11 * k} L${cx + 6 * k},${cy + 11 * k} M${cx - 8 * k},${cy} h${16 * k} M${cx},${cy - 3 * k} a${3 * k},${3 * k} 0 1 1 0.1,0`;
}
export function pedraRuna(nome, seed, cor, tipo) {
  const W = 54, H = 84;
  const d = tipo === 0
    ? blob([[10, 80], [7, 50], [12, 22], [24, 6], [36, 8], [46, 26], [48, 56], [45, 80]], 1)
    : blob([[8, 80], [10, 46], [16, 18], [30, 4], [42, 16], [47, 48], [46, 80]], 1);
  let s = sombraChao(27, 79, 26, 6) + cel(d, '#6e6a64', { s: 8, l: 4, w: 3, cc: '#1e1a22' });
  // facetas e rachas
  s += recorte(d, `<path d="M${tipo ? 34 : 30},4 L${tipo ? 40 : 38},40 L${tipo ? 52 : 52},44 V0Z" fill="#000" opacity="0.13"/>`) + traco(tipo ? 'M14,40 l5,6 l-2,7' : 'M40,52 l-4,6 l3,6', '#3e3a40', 1.1);
  // runa entalhada
  const g = runaGlifo(27, 42, 1, tipo);
  s += traco(g, '#2a2830', 4.6) + traco(g, cor, 2.4);
  s += musgo(8, 46, 78, seed, { cor: '#4a7230', alt: 4.5, gotas: 0.2 });
  s += musgo(tipo ? 16 : 14, tipo ? 26 : 24, tipo ? 26 : 24, seed + 3, { cor: '#577e36', alt: 3, gotas: 0.6 });
  s += tufo(6, 83, '#52803a', seed + 1, 0.8) + tufo(48, 83, '#52803a', seed + 2, 0.7);
  s += brilho(17, 22, 3, 1.4, -50, 0.5);
  const e = halo(27, 42, 30, cor, 0.6) + desfoque(traco(g, cor, 4), 2) + traco(g, '#ffffff', 1.4) + traco(g, cor, 2.4, 0.9);
  return { nome, w: W, h: H, svg: s, emissivo: e };
}

/** Copa feita de camadas de cachos (de trás para a frente: escura → clara). */
function copa(camadas, cores, seed, { pontos = true, cc } = {}) {
  const r = rnd(seed);
  let s = '';
  camadas.forEach((l, i) => {
    const c = cores[Math.min(i, cores.length - 1)];
    s += massa(cachos(l, seed + i), c, { s: 9, l: 5, w: 2.8, cc: cc ?? sombra(cores[0], 0.6) });
    // folhinhas: tracinhos em "v" e pontos de luz
    for (const [x, y, rx] of l) {
      for (let k = 0; k < 2; k++) {
        const fx = x + (r() - 0.5) * rx, fy = y + (r() - 0.2) * rx * 0.7;
        s += traco(`M${f1(fx - 2.5)},${f1(fy - 1.5)} L${f1(fx)},${f1(fy + 1)} L${f1(fx + 2.5)},${f1(fy - 1.5)}`, sombra(c, 0.3), 1.1, 0.8);
      }
      if (pontos) s += `<ellipse cx="${f1(x - rx * 0.35)}" cy="${f1(y - rx * 0.45)}" rx="${f1(rx * 0.22)}" ry="${f1(rx * 0.13)}" fill="${luz(c, 0.3)}" opacity="0.45" transform="rotate(-25 ${f1(x - rx * 0.35)} ${f1(y - rx * 0.45)})"/>`;
    }
  });
  return s;
}
function tronco(d, cor = '#5a3e2e') {
  return cel(d, cor, { s: 6, l: 3, w: 3, cc: '#1e1218' });
}

export function arvoreRoxa() {
  const W = 230, H = 250, r = rnd(77);
  let s = sombraChao(115, 240, 80, 13), e = '';
  // raízes e tronco retorcido
  const tr = blob([[78, 244], [94, 232], [100, 200], [92, 170], [100, 140], [86, 112], [104, 104], [114, 124], [120, 108], [140, 100], [134, 126], [126, 150], [134, 182], [130, 220], [146, 236], [160, 246], [120, 240], [112, 246], [100, 238]], 0.9);
  s += tronco(tr, '#4e3c46');
  s += traco('M106,236 Q100,200 108,170 Q114,150 106,128', '#3e2638', 1.6, 0.8) + traco('M124,232 Q120,200 124,176', '#3e2638', 1.4, 0.8) + traco('M98,190 q4,-6 2,-12', '#a888a0', 1.2, 0.8);
  s += `<ellipse cx="116" cy="196" rx="5" ry="7" fill="#2a1828" stroke="#1e1218" stroke-width="1.5"/>`;
  // galhos
  s += traco('M92,118 Q60,96 40,108', '#1e1218', 9) + traco('M92,118 Q60,96 40,108', '#4e3c46', 5.5);
  s += traco('M134,110 Q170,92 196,104', '#1e1218', 9) + traco('M134,110 Q170,92 196,104', '#4e3c46', 5.5);
  // copa em cachos lilás/roxo
  s += copa([
    [[60, 92, 40, 34], [115, 70, 52, 42], [172, 92, 40, 34], [30, 112, 26, 22], [200, 114, 26, 22], [115, 112, 40, 26]],
    [[70, 76, 34, 28], [118, 54, 40, 32], [160, 74, 34, 28], [44, 100, 22, 18], [188, 100, 22, 18]],
    [[88, 56, 26, 22], [134, 42, 26, 22], [64, 84, 18, 15], [170, 84, 18, 15]],
    [[108, 30, 18, 15], [80, 64, 12, 10], [150, 60, 12, 10]],
  ], ['#33244a', '#4a3466', '#634a80', '#80689a'], 78);
  // pétalas/flores brilhantes na copa
  for (let i = 0; i < 18; i++) {
    const x = 30 + r() * 170, y = 30 + r() * 90;
    s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="1.6" fill="#f2d8ff" stroke="#3a1a5a" stroke-width="0.6"/>`;
    e += `<circle cx="${f1(x)}" cy="${f1(y)}" r="2.8" fill="#d8a8ff" opacity="0.5"/>`;
  }
  // lanternas azuis penduradas
  for (const [x, y, len] of [[44, 120, 14], [86, 128, 20], [150, 126, 16], [192, 122, 12]]) {
    s += traco(`M${x},${y - 6} v${len}`, '#2a1a30', 1);
    const lp = lanternaPapel(x, y + len + 4, 5.5, '#5a9cb8', '#5ee0f0');
    s += lp.s; if (x === 86 || x === 192) e += lp.e;
  }
  // musgo e tufos nas raízes
  s += musgo(80, 150, 238, 79, { cor: '#4a7230', alt: 4, gotas: 0 }) + tufo(76, 246, '#52803a', 80) + tufo(158, 246, '#52803a', 81) + tufo(126, 248, '#5f8a3e', 82, 0.7);
  // flores roxas no pé
  for (const [x, y] of [[66, 244], [170, 244]]) s += `<circle cx="${x}" cy="${y - 8}" r="3" fill="#b77cf2" stroke="${TINTA}" stroke-width="0.8"/><circle cx="${x}" cy="${y - 8}" r="1" fill="#fff2a8"/>`;
  return { nome: 'arvore_roxa', w: W, h: H, svg: s, emissivo: e };
}

export function arvore(nome, seed, var2) {
  const W = 160, H = 190;
  let s = sombraChao(80, 182, 58, 10);
  const tr = var2
    ? blob([[64, 186], [72, 176], [74, 130], [70, 100], [80, 96], [88, 100], [86, 132], [90, 176], [100, 186], [80, 182]], 0.9)
    : blob([[62, 186], [70, 174], [72, 140], [66, 108], [78, 112], [84, 96], [92, 104], [88, 140], [90, 174], [102, 186], [82, 182]], 0.9);
  s += tronco(tr, '#5e4030') + traco('M78,176 Q76,150 80,130', '#3e2418', 1.3, 0.8);
  const cam = var2
    ? [[[40, 92, 32, 28], [80, 70, 42, 34], [122, 92, 32, 28], [80, 108, 40, 22]], [[52, 76, 26, 22], [86, 52, 30, 25], [116, 78, 24, 20]], [[70, 44, 20, 16], [102, 62, 14, 11], [48, 70, 12, 10]]]
    : [[[34, 100, 28, 24], [80, 80, 46, 38], [128, 100, 28, 24], [80, 116, 36, 18]], [[50, 84, 26, 22], [82, 60, 34, 28], [114, 84, 26, 22]], [[72, 46, 22, 18], [104, 70, 14, 11], [52, 76, 12, 10]]];
  s += copa(cam, var2 ? ['#2a4a2c', '#3a5e34', '#527a40', '#6e9650'] : ['#2c4a26', '#3e6230', '#57803c', '#76a050'], seed);
  if (var2) for (const [x, y] of [[50, 96], [110, 92], [80, 84], [96, 108], [62, 110]]) s += `<circle cx="${x}" cy="${y}" r="3" fill="#e84a4a" stroke="${TINTA}" stroke-width="0.9"/><circle cx="${x - 1}" cy="${y - 1}" r="0.9" fill="#fff"/>`;
  s += musgo(64, 100, 182, seed + 1, { cor: '#4a7230', alt: 3.5, gotas: 0 }) + tufo(60, 188, '#52803a', seed + 2) + tufo(104, 188, '#52803a', seed + 3, 0.8);
  return { nome, w: W, h: H, svg: s };
}

export function pinheiro() {
  const W = 110, H = 180;
  let s = sombraChao(55, 172, 40, 8) + cel(retRed(48, 140, 14, 36, 3), '#6e4630', { s: 3, l: 2, w: 2.5 });
  const cam = [[150, 50, 46], [116, 42, 40], [84, 34, 34], [54, 26, 28], [28, 16, 22]];
  const cores = ['#1f5a3a', '#26684a', '#2e7652', '#36845a', '#409262'];
  cam.forEach(([yb, hw, hh], i) => {
    const cx = 55, pts = [[cx, yb - hh]];
    pts.push([cx + hw * 0.5, yb - hh * 0.45]);
    for (let k = 0; k <= 6; k++) pts.push([cx + hw - (k * 2 * hw) / 6, yb + (k % 2 ? 6 : 0)]);
    pts.push([cx - hw * 0.5, yb - hh * 0.45]);
    const d = blob(pts, 0.6);
    s += cel(d, cores[i], { s: 7, l: 4, w: 2.8, cc: '#0e2418' });
    s += traco(`M${cx - hw * 0.5},${yb - 4} q${hw * 0.25},-4 ${hw * 0.5},0 M${cx + 6},${yb - hh * 0.4} q6,-3 10,1`, sombra(cores[i], 0.35), 1.1, 0.8);
    s += `<ellipse cx="${cx - hw * 0.3}" cy="${yb - hh * 0.4}" rx="${hw * 0.14}" ry="2" fill="${luz(cores[i], 0.4)}" transform="rotate(-35 ${cx - hw * 0.3} ${yb - hh * 0.4})"/>`;
  });
  s += tufo(42, 176, '#52803a', 91, 0.8) + tufo(68, 176, '#52803a', 92, 0.8);
  return { nome: 'pinheiro', w: W, h: H, svg: s };
}

export function arbusto(nome, seed, flores) {
  const W = 72, H = 52;
  let s = sombraChao(36, 48, 32, 5);
  s += copa([[[16, 36, 14, 12], [36, 28, 18, 16], [56, 36, 14, 12], [36, 40, 22, 10]], [[28, 26, 11, 9], [46, 30, 10, 8]]], ['#2e5228', '#466e34', '#628c42'], seed);
  if (flores) for (const [x, y, c] of [[20, 30, '#b06a88'], [40, 20, '#c8a448'], [54, 32, '#b06a88'], [32, 38, '#fff'], [48, 42, '#c8a448']]) s += `<circle cx="${x}" cy="${y}" r="2.6" fill="${c}" stroke="${TINTA}" stroke-width="0.8"/><circle cx="${x}" cy="${y}" r="0.9" fill="#c8641a"/>`;
  else for (const [x, y] of [[24, 34], [44, 24], [52, 40]]) s += `<circle cx="${x}" cy="${y}" r="2.2" fill="#5a7aff" stroke="${TINTA}" stroke-width="0.8"/><circle cx="${x - 0.6}" cy="${y - 0.6}" r="0.7" fill="#fff"/>`;
  return { nome, w: W, h: H, svg: s };
}
export function touceira() {
  return { nome: 'touceira', w: 30, h: 22, svg: sombraChao(15, 20, 12, 2.5, 0.3) + tufo(10, 21, '#4a7634', 101, 0.9) + tufo(19, 21, '#5f8a3e', 102, 1.1) };
}
export function flores(i) {
  const cs = [['#8a6aaa', '#e8dcae'], ['#c8a448', '#c8641a'], ['#6a92b0', '#fff']][i];
  let s = sombraChao(15, 20, 12, 2.5, 0.3) + tufo(15, 21, '#4a7634', 110 + i, 0.8);
  const r = rnd(120 + i);
  for (let k = 0; k < 4; k++) {
    const x = 6 + r() * 18, y = 6 + r() * 8;
    s += traco(`M${f1(x)},${f1(y)} Q${f1(x + 1)},${f1(y + 7)} 15,20`, '#3a7a2c', 1.1);
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      s += `<ellipse cx="${f1(x + Math.cos(a) * 2.2)}" cy="${f1(y + Math.sin(a) * 1.8)}" rx="2" ry="1.6" fill="${cs[0]}" stroke="${TINTA}" stroke-width="0.6"/>`;
    }
    s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="1.2" fill="${cs[1]}"/>`;
  }
  return { nome: `flores_${i}`, w: 30, h: 22, svg: s };
}
export function samambaia() {
  const W = 56, H = 40;
  let s = sombraChao(28, 37, 22, 3.5, 0.3);
  const r = rnd(131);
  for (const [ang, len] of [[-150, 22], [-125, 26], [-100, 24], [-80, 25], [-55, 26], [-30, 22], [-90, 20]]) {
    const a = (ang * Math.PI) / 180, x2 = 28 + Math.cos(a) * len, y2 = 38 + Math.sin(a) * len * 0.9;
    const mx = 28 + Math.cos(a) * len * 0.5 + (r() - 0.5) * 4, my = 38 + Math.sin(a) * len * 0.5 - 4;
    let fol = '';
    for (let t = 0.2; t < 0.95; t += 0.14) {
      const px = 28 + (x2 - 28) * t, py = 38 + (y2 - 38) * t - Math.sin(t * Math.PI) * 4, sz = 5 * (1 - t * 0.6);
      fol += `<ellipse cx="${f1(px - sz * 0.6)}" cy="${f1(py + 1)}" rx="${f1(sz)}" ry="${f1(sz * 0.4)}" transform="rotate(${ang + 60} ${f1(px)} ${f1(py)})"/><ellipse cx="${f1(px + sz * 0.6)}" cy="${f1(py + 1)}" rx="${f1(sz)}" ry="${f1(sz * 0.4)}" transform="rotate(${ang - 60} ${f1(px)} ${f1(py)})"/>`;
    }
    s += `<g fill="${ang === -90 ? '#6e9446' : '#4a7634'}" stroke="#1f3a1c" stroke-width="0.9">${fol}</g>` + traco(curva([[28, 38], [mx, my], [x2, y2]]), '#2f6a28', 1.2);
  }
  return { nome: 'samambaia', w: W, h: H, svg: s };
}
export function cogumelos() {
  const W = 44, H = 36;
  let s = sombraChao(22, 33, 18, 3), e = '';
  for (const [x, y, k, c] of [[14, 34, 1, '#4a98a8'], [28, 35, 1.3, '#7a64a0'], [36, 34, 0.75, '#4a98a8']]) {
    s += cel(`M${x - 2.4 * k},${y} q-0.5,${-7 * k} ${1 * k},${-11 * k} h${2.8 * k} q${1.5 * k},${4 * k} ${1 * k},${11 * k}Z`, '#d6cab0', { s: 1.5, l: 1, w: 1.3 });
    const cap = `M${x - 8 * k},${y - 10 * k} Q${x - 7 * k},${y - 20 * k} ${x},${y - 20 * k} Q${x + 7 * k},${y - 20 * k} ${x + 8 * k},${y - 10 * k} Q${x},${y - 7 * k} ${x - 8 * k},${y - 10 * k}Z`;
    s += cel(cap, c, { s: 3 * k, l: 2 * k, w: 1.6 });
    for (const [dx, dy] of [[-3, -15], [2, -17], [4, -12]]) s += `<circle cx="${x + dx * k}" cy="${y + dy * k}" r="${1.2 * k}" fill="#fff" opacity="0.9"/>`;
    e += halo(x, y - 14 * k, 16 * k, c, 0.6) + `<path d="${cap}" fill="${c}" opacity="0.55"/>`;
  }
  s += tufo(6, 35, '#4a7634', 141, 0.6);
  return { nome: 'cogumelos', w: W, h: H, svg: s, emissivo: e };
}
export function rochedo() {
  const W = 84, H = 62;
  let s = sombraChao(42, 57, 40, 6);
  const d = blob([[6, 58], [4, 38], [16, 18], [36, 8], [58, 12], [76, 26], [80, 50], [72, 58]], 1);
  s += cel(d, '#8a7e74', { s: 10, l: 5, w: 3, cc: '#1e1a22' });
  s += recorte(d, `<path d="M40,8 L46,34 L84,40 V0Z" fill="#000" opacity="0.1"/><path d="M4,40 L46,34 L50,62 H0Z" fill="#000" opacity="0.06"/>`);
  s += traco('M46,34 L40,8 M46,34 L82,40 M46,34 L50,60', '#4a4248', 1.1, 0.7) + traco('M22,30 l5,6 l-1,7', '#4a4248', 1);
  s += brilho(24, 22, 5, 2, -30, 0.45);
  s += musgo(14, 54, 16, 151, { cor: '#577e36', alt: 4.5, gotas: 0.6 }) + musgo(6, 76, 57, 152, { cor: '#4a7230', alt: 3.5, gotas: 0 });
  s += tufo(4, 61, '#52803a', 153, 0.8) + tufo(80, 61, '#52803a', 154, 0.7);
  return { nome: 'rochedo', w: W, h: H, svg: s };
}
export function troncos() {
  const W = 84, H = 50;
  let s = sombraChao(42, 46, 40, 5);
  const tora = (x, y, len, rr) => {
    let t = cel(retRed(x, y - rr, len, rr * 2, rr * 0.4), '#5e4030', { s: 3, l: 2, w: 2.2 });
    t += traco(`M${x + 6},${y - rr * 0.4} h${len * 0.6} M${x + 12},${y + rr * 0.4} h${len * 0.5}`, '#4a2a1c', 1, 0.8);
    t += cel(elipse(x + len, y, rr * 0.75, rr), '#b08a5e', { s: 2, l: 1.2, w: 2.2, cc: '#3a2018' });
    t += traco(`M${x + len},${y} m-${rr * 0.3},0 a${rr * 0.3},${rr * 0.4} 0 1 1 ${rr * 0.6},0 a${rr * 0.3},${rr * 0.4} 0 1 1 ${-rr * 0.6},0`, '#a87040', 0.9) + traco(`M${x + len},${y} m-${rr * 0.55},0 a${rr * 0.55},${rr * 0.72} 0 1 1 ${rr * 1.1},0`, '#a87040', 0.8);
    return t;
  };
  s += tora(6, 38, 60, 9) + tora(18, 38, 52, 8).replace(/^/, '') ;
  s = sombraChao(42, 46, 40, 5) + tora(4, 38, 56, 9) + tora(14, 22, 52, 9) + tora(22, 38, 40, 8);
  s += musgo(18, 40, 14, 161, { cor: '#577e36', alt: 3, gotas: 0.6 }) + cogumeloP(30, 30) + tufo(4, 48, '#52803a', 162, 0.7) + tufo(78, 48, '#52803a', 163, 0.7);
  return { nome: 'troncos', w: W, h: H, svg: s };
}
const cogumeloP = (x, y) => `<rect x="${x - 1}" y="${y - 4}" width="2" height="4" fill="#efe2c8" stroke="${TINTA}" stroke-width="0.6"/><path d="M${x - 3.5},${y - 3.5} q3.5,-5 7,0Z" fill="#d24a3a" stroke="${TINTA}" stroke-width="0.7"/>`;

export function lampiaoMadeira() {
  const W = 34, H = 122;
  let s = sombraChao(17, 118, 13, 3), e = '';
  s += cel(retRed(13, 22, 8, 98, 2), MADEIRA_ESC, { s: 2.5, l: 1.5, w: 2 }) + traco('M16,30 v80', '#3e2418', 0.9, 0.8);
  s += cel(retRed(10, 108, 14, 12, 2), '#7c7266', { s: 2, l: 1.5, w: 1.8 });
  s += cel(retRed(13, 18, 20, 6, 2), MADEIRA_ESC, { s: 2, l: 1.4, w: 1.8 }) + prego(17, 21) + traco('M17,24 L24,34', '#3e2418', 2.4) + traco('M17,24 L24,34', MADEIRA_ESC, 1.2);
  const ln = lanterna(28, 24, { esc: 1.05, ...LAMPARINA });
  s += ln.s; e += ln.e;
  s += musgo(10, 24, 108, 171, { cor: '#577e36', alt: 2.5, gotas: 0.5 }) + tufo(9, 121, '#52803a', 172, 0.7) + tufo(25, 121, '#52803a', 173, 0.6);
  return { nome: 'lampiao_madeira', w: W, h: H, svg: s, emissivo: e };
}
export function bandeiraRaizes() {
  const W = 52, H = 124;
  let s = sombraChao(26, 120, 14, 3);
  s += cel(retRed(7, 6, 6, 116, 2), MADEIRA_ESC, { s: 2, l: 1.4, w: 1.8 }) + cel(elipse(10, 6, 4.5, 4.5), '#c09a3a', { s: 1.5, l: 1, w: 1.4 });
  s += cel(retRed(7, 14, 40, 5, 2), MADEIRA, { s: 1.5, l: 1, w: 1.6 });
  const ban = `M12,19 H44 V78 L36,72 L28,80 L20,72 L12,78Z`;
  s += cel(ban, '#2e5e3a', { s: 6, l: 3, w: 2.2, cc: '#0e2a18' });
  s += recorte(ban, traco('M14,24 H42 M14,68 H42', '#c09a3a', 1.6) + traco('M18,22 v52 M38,22 v52', '#1f4a2c', 1.2, 0.7));
  s += cel(`M28,32 q12,10 0,30 q-12,-20 0,-30Z`, '#c09a3a', { s: 2, l: 1.2, w: 1.5 }) + traco('M28,34 v28 M28,44 l-4,-3 M28,50 l4,-3 M28,56 l-4,-3', '#9a6a14', 1);
  s += musgo(5, 16, 120, 181, { cor: '#4a7230', alt: 3, gotas: 0 }) + tufo(16, 123, '#52803a', 182, 0.7);
  return { nome: 'bandeira_raizes', w: W, h: H, svg: s };
}
export function cercaMadeira() {
  const W = 64, H = 50;
  let s = sombraChao(32, 46, 32, 3, 0.25);
  s += tabuasH(0, 16, 64, 7, 1, MADEIRA, 191, { pregos: false }) + tabuasH(0, 30, 64, 7, 1, mistura(MADEIRA, MADEIRA_ESC, 0.3), 192, { pregos: false });
  for (const x of [16, 48]) {
    s += cel(`M${x - 5},48 V9 l5,-5 l5,5 V48Z`, MADEIRA_ESC, { s: 2.5, l: 1.5, w: 2 }) + traco(`M${x - 1.5},12 v32`, '#3e2418', 0.8, 0.8) + prego(x, 19.5) + prego(x, 33.5);
  }
  s += musgo(10, 22, 46, 193, { cor: '#4a7230', alt: 2.5, gotas: 0 }) + musgo(42, 54, 46, 194, { cor: '#4a7230', alt: 2.5, gotas: 0 }) + tufo(30, 49, '#52803a', 195, 0.7);
  return { nome: 'cerca_madeira', w: W, h: H, svg: s };
}
export function totemRaizes() {
  const W = 54, H = 114;
  let s = sombraChao(27, 110, 18, 4), e = '';
  s += cel(retRed(15, 10, 24, 100, 4), '#6e4a34', { s: 5, l: 2.5, w: 2.6 });
  for (const y of [40, 72]) s += traco(`M16,${y} H38`, '#3e2418', 1.6);
  // asas
  s += cel(`M15,44 L2,40 L6,52 L15,54Z`, '#2e5e3a', { s: 2, l: 1.4, w: 1.8 }) + cel(`M39,44 L52,40 L48,52 L39,54Z`, '#2e5e3a', { s: 2, l: 1.4, w: 1.8 });
  // máscara de cima
  const mk = `M12,12 Q12,2 27,2 Q42,2 42,12 V30 Q42,40 27,40 Q12,40 12,30Z`;
  s += cel(mk, '#b08a5e', { s: 4, l: 2, w: 2.4 });
  s += cel(`M14,8 L8,0 L20,4Z M40,8 L46,0 L34,4Z`, '#8a3a30', { s: 1, l: 1, w: 1.4 });
  s += `<path d="M18,16 l6,2 l-6,3Z M36,16 l-6,2 l6,3Z" fill="#14101a"/>` + traco('M20,30 q7,5 14,0', '#3e2418', 2) + traco('M27,20 v6', '#3e2418', 1.6);
  s += traco('M14,24 l4,2 M40,24 l-4,2', '#2e5e3a', 2);
  // runas no corpo
  const rs = 'M22,50 l5,8 l5,-8 M27,58 v8 M21,80 h12 M27,76 v14 M23,86 l4,4 l4,-4';
  s += traco(rs, '#2a1a20', 3.6) + traco(rs, '#5ef0ff', 2);
  e += halo(27, 70, 30, '#5ef0ff', 0.45) + desfoque(traco(rs, '#5ef0ff', 3.5), 1.6) + traco(rs, '#e8ffff', 1.4);
  e += `<path d="M18,16 l6,2 l-6,3Z M36,16 l-6,2 l6,3Z" fill="#7dff9a"/>` + halo(21, 18, 7, '#7dff9a', 0.7) + halo(33, 18, 7, '#7dff9a', 0.7);
  s += musgo(13, 41, 108, 201, { cor: '#4a7230', alt: 3.5, gotas: 0.3 }) + tufo(11, 113, '#52803a', 202, 0.7) + tufo(43, 113, '#52803a', 203, 0.7);
  return { nome: 'totem_raizes', w: W, h: H, svg: s, emissivo: e };
}
export function varalLanternas() {
  const W = 180, H = 72;
  let s = sombraChao(10, 68, 9, 2.5) + sombraChao(170, 68, 9, 2.5), e = '';
  for (const x of [10, 170]) s += cel(retRed(x - 3.5, 8, 7, 62, 2), MADEIRA_ESC, { s: 2, l: 1.2, w: 1.8 }) + cel(elipse(x, 8, 4.5, 3), '#5e4030', { s: 1, l: 1, w: 1.4 });
  const fio = (t) => [10 + 160 * t, 12 + Math.sin(Math.PI * t) * 26];
  s += traco(curva([...Array(9)].map((_, i) => fio(i / 8))), '#2a1a20', 1.2);
  // bandeirinhas
  for (let i = 1; i < 16; i += 2) {
    const [x, y] = fio(i / 16);
    s += `<path d="M${f1(x - 3.5)},${f1(y)} h7 l-3.5,7Z" fill="${['#2e5e3a', '#c09a3a', '#8a4ad0'][i % 3]}" stroke="${TINTA}" stroke-width="0.7"/>`;
  }
  const cores = ['#c0703a', '#a84a44', '#c09a44', '#c0703a', '#a84a44'];
  for (let i = 0; i < 5; i++) {
    const [x, y] = fio((i + 1) / 6);
    s += traco(`M${f1(x)},${f1(y)} v5`, '#2a1a20', 1);
    const acesa = i === 1 || i === 3;
    const lp = lanternaPapel(x, y + 12, 6.5, acesa ? cores[i] : sombra(cores[i], 0.35));
    s += lp.s; if (acesa) e += lp.e;
    if (!acesa) s += traco(`M${f1(x - 3)},${f1(y + 9)} l3,5 l2,-3`, '#1a1018', 0.9);
  }
  s += tufo(10, 71, '#52803a', 211, 0.6) + tufo(170, 71, '#52803a', 212, 0.6);
  return { nome: 'varal_lanternas', w: W, h: H, svg: s, emissivo: e };
}
export function vasosErvas() {
  const W = 64, H = 48;
  let s = sombraChao(32, 45, 30, 4);
  const vaso = (x, y, w, h, c) => cel(`M${x - w / 2},${y - h} h${w} l${-w * 0.12},${h} h${-w * 0.76}Z`, c, { s: 3, l: 2, w: 2 }) + cel(retRed(x - w / 2 - 2, y - h - 3, w + 4, 5, 1.5), luz(c, 0.1), { s: 1.4, l: 1, w: 1.8 }) + traco(`M${x - w * 0.3},${y - h * 0.5} h${w * 0.6}`, sombra(c, 0.3), 1, 0.7);
  s += copa([[[16, 22, 9, 8], [22, 16, 6, 5]]], ['#3a8a34', '#5aae40'], 221) + vaso(16, 44, 18, 16, '#9a5a3e');
  s += samambaiaMini(46, 24) + vaso(46, 44, 20, 18, '#7a5a6e');
  s += copa([[[31, 32, 6, 5]]], ['#6a9a3a', '#8ab84a'], 222) + vaso(31, 46, 12, 10, '#a8764a');
  s += `<circle cx="20" cy="14" r="2" fill="#b77cf2" stroke="${TINTA}" stroke-width="0.7"/><circle cx="12" cy="20" r="2" fill="#b77cf2" stroke="${TINTA}" stroke-width="0.7"/>`;
  return { nome: 'vasos_ervas', w: W, h: H, svg: s };
}
const samambaiaMini = (x, y) => {
  let s = '';
  for (const a of [-140, -110, -70, -40, -90]) {
    const rr = (a * Math.PI) / 180;
    s += traco(`M${x},${y + 4} Q${f1(x + Math.cos(rr) * 8)},${f1(y + Math.sin(rr) * 10)} ${f1(x + Math.cos(rr) * 14)},${f1(y + Math.sin(rr) * 14 + 6)}`, '#1f3a1c', 4.2) + traco(`M${x},${y + 4} Q${f1(x + Math.cos(rr) * 8)},${f1(y + Math.sin(rr) * 10)} ${f1(x + Math.cos(rr) * 14)},${f1(y + Math.sin(rr) * 14 + 6)}`, a === -90 ? '#6e9446' : '#5aae40', 2.4);
  }
  return s;
};
export function poco() {
  const W = 84, H = 104;
  let s = sombraChao(42, 98, 40, 6);
  // postes e telhadinho
  s += cel(retRed(10, 24, 6, 62, 2), MADEIRA_ESC, { s: 2, l: 1.2, w: 1.8 }) + cel(retRed(68, 24, 6, 62, 2), MADEIRA_ESC, { s: 2, l: 1.2, w: 1.8 });
  s += cel(retRed(12, 34, 60, 4, 2), '#5e4030', { s: 1, l: 1, w: 1.4 }) + traco('M60,36 l6,6', '#3a2a20', 1.4);
  // água e boca
  s += cel(elipse(42, 66, 30, 11), '#7f7266', { s: 2, l: 2, w: 2.4 });
  s += `<ellipse cx="42" cy="67" rx="24" ry="7.5" fill="#1a2a3a"/><ellipse cx="42" cy="69" rx="20" ry="5" fill="#2a5a7a"/>` + brilho(36, 68, 6, 1.2, 0, 0.6);
  s += traco('M42,38 V60', '#3a2a20', 1);
  s += cel(`M37,60 h10 l-1,6 h-8Z`, '#8a5a34', { s: 1, l: 1, w: 1.2 });
  // parede da frente de pedra (meia-lua)
  const fr = `M12,66 A30,11 0 0 0 72,66 V88 A30,11 0 0 1 12,88Z`;
  s += recorte(fr, pedras(10, 60, 64, 42, PEDRA, 231, { linhas: 3, larg: [12, 18], borda: false }));
  s += `<path d="${fr}" fill="none" stroke="#1e1a22" stroke-width="2.4"/>`;
  s += musgo(14, 70, 92, 232, { cor: '#4a7230', alt: 3.5, gotas: 0 });
  // telhado de musgo
  const tl = poli([[0, 32], [22, 6], [62, 6], [84, 32], [42, 34]]);
  s += telhado(tl, 0, 84, 6, 34, 233);
  s += musgo(6, 78, 30, 234, { cor: '#4a7230', alt: 3, gotas: 0.6 });
  s += tufo(8, 100, '#52803a', 235, 0.8) + tufo(76, 100, '#52803a', 236, 0.8);
  return { nome: 'poco', w: W, h: H, svg: s };
}

export function pecasEsquerda() {
  return [
    casaMusgo(), ...bancaRoxa(), pedraRuna('pedra_runa', 41, CIANO, 0), pedraRuna('pedra_runa_2', 42, VERDE_RUNA, 1), arvoreRoxa(),
    arvore('arvore', 51, false), arvore('arvore_2', 52, true), pinheiro(), arbusto('arbusto', 61, false), arbusto('arbusto_2', 62, true),
    touceira(), flores(0), flores(1), flores(2), samambaia(), cogumelos(), rochedo(), troncos(), lampiaoMadeira(), bandeiraRaizes(),
    cercaMadeira(), totemRaizes(), varalLanternas(), vasosErvas(), poco(),
  ];
}
