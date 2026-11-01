// Peças da Margem Esquerda (Raízes): mística, madeira, musgo, pedra marrom, runas.
import {
  TINTA, blob, bolhas, cachos, brilho, cel, contorno, curva, degrade, desfoque, elipse, f1, frasco, halo, janela, lanterna, lanternaPapel,
  luz, massa, mistura, musgo, pedras, poli, prego, recorte, ret, retRed, rnd, sombra, sombraChao, tabuasH, tabuasV, texto, traco, tufo,
} from './kit.mjs';

const MADEIRA = '#9a5f36', MADEIRA_ESC = '#6e3f24', PEDRA = '#8f735c', MUSGO = '#6aa83a', MUSGO_ESC = '#3f7a2c';
const ROXO = '#8a4ad0', LILAS = '#c9a2f2', CIANO = '#5ef0ff', VERDE_RUNA = '#7dff9a';

/** Telhado de musgo com fileiras de tufos sobrepostos (como telhas) recortadas na forma. */
function telhadoMusgo(d, x0, x1, y0, y1, seed, cores = ['#7cbc44', '#68a83a', '#579632']) {
  const r = rnd(seed);
  let s = massa(d, cores[1], { s: 12, l: 6, w: 3.2, cc: '#1f3a1c' });
  let fil = '';
  const cx = (x0 + x1) / 2, hw = (x1 - x0) / 2;
  let j = 0;
  for (let y = y0; y < y1 + 10; y += 9, j++) {
    const l = [];
    for (let x = x0 - 10 + (j % 2) * 7; x < x1 + 10; x += 13 + r() * 3) {
      const yy = y + Math.pow((x - cx) / hw, 2) * 10 + (r() - 0.5) * 2;
      l.push([x, yy, 8 + r() * 2.5, 6 + r() * 1.5]);
    }
    const c = mistura(cores[j % 3], j * 9 > (y1 - y0) * 0.6 ? sombra(cores[1], 0.25) : luz(cores[0], 0.1), 0.4);
    fil += massa(bolhas(l), c, { s: 3, l: 2, w: 1.3, cc: sombra(c, 0.55) });
    for (const [x, yy] of l) if (r() < 0.25) fil += `<circle cx="${f1(x - 3)}" cy="${f1(yy - 3)}" r="1" fill="${luz(c, 0.5)}"/>`;
  }
  // sombreado geral: luz em cima à esquerda, sombra embaixo à direita
  const [dg, url] = degrade(['#fff6c0', '#000000', '#0a1a08'], { x2: 0.5, y2: 1 });
  s += dg + recorte(d, fil + `<path d="${d}" fill="${url}" opacity="0.28"/>`);
  s += `<path d="${d}" fill="none" stroke="#1f3a1c" stroke-width="3.2" stroke-linejoin="round"/>`;
  return s;
}

export function casaMusgo() {
  const W = 210, H = 240, r = rnd(11);
  let s = sombraChao(105, 230, 100, 13), e = '';
  // chaminé de pedra (atrás do telhado)
  s += pedras(146, 14, 26, 60, '#8a7462', 4, { linhas: 5, larg: [9, 14] });
  s += cel(retRed(142, 8, 34, 9, 2), '#7a6656', { s: 2, l: 2, w: 2 });
  s += `<ellipse cx="159" cy="11" rx="11" ry="2.5" fill="#1d1418"/>`;
  // base de pedra
  s += pedras(20, 194, 170, 34, PEDRA, 3, { linhas: 2, larg: [16, 28] });
  s += `<rect x="20" y="194" width="170" height="5" fill="#1a1010" opacity="0.25"/>`;
  // paredes de tábua
  s += tabuasV(28, 112, 154, 84, 11, MADEIRA, 5);
  s += `<path d="${ret(28, 112, 154, 84)}" fill="none" stroke="${TINTA}" stroke-width="2.4"/>`;
  // vigas de canto e travessa
  s += cel(retRed(22, 108, 12, 90, 2), MADEIRA_ESC, { s: 3, l: 2, w: 2 }) + cel(retRed(176, 108, 12, 90, 2), MADEIRA_ESC, { s: 3, l: 2, w: 2 });
  s += cel(retRed(22, 184, 166, 10, 2), MADEIRA_ESC, { s: 3, l: 2, w: 2 });
  for (const x of [28, 60, 150, 182]) s += prego(x, 189, 1.4);
  // janela redonda e janela em arco
  const j1 = janela(42, 132, 34, 34, { tipo: 'redonda', moldura: MADEIRA_ESC });
  const j2 = janela(136, 128, 30, 40, { tipo: 'arco', moldura: MADEIRA_ESC });
  s += j1.s + j2.s; e += j1.e + j2.e;
  // floreira sob a janela da direita
  s += cel(retRed(130, 170, 42, 9, 2), MADEIRA_ESC, { s: 2, l: 1.5, w: 1.8 });
  for (let i = 0; i < 6; i++) {
    const fx = 134 + i * 6.5, c = ['#e65aa0', '#ffd34a', '#b77cf2'][i % 3];
    s += massa(bolhas([[fx, 168, 4, 3.5]]), '#4f9a34', { s: 1.5, l: 1, w: 1 }) + `<circle cx="${fx + 1}" cy="166" r="2" fill="${c}" stroke="${TINTA}" stroke-width="0.7"/>`;
  }
  // porta em arco com vidrinho aceso
  const pw = 40, px = 105 - pw / 2, py = 140;
  s += cel(`M${px - 5},214 V${py + 15} A${pw / 2 + 5},${pw / 2 + 5} 0 0 1 ${px + pw + 5},${py + 15} V214Z`, '#7c7266', { s: 3, l: 2, w: 2.2 });
  s += recorte(`M${px},214 V${py + 20} A${pw / 2},${pw / 2} 0 0 1 ${px + pw},${py + 20} V214Z`, tabuasV(px, py, pw, 76, 4, '#7a4426', 9, { pregos: false }) + `<rect x="${px}" y="${py}" width="${pw}" height="10" fill="#2a1010" opacity="0.35"/>`);
  s += `<path d="M${px},214 V${py + 20} A${pw / 2},${pw / 2} 0 0 1 ${px + pw},${py + 20} V214Z" fill="none" stroke="${TINTA}" stroke-width="2"/>`;
  for (const yy of [160, 196]) s += cel(retRed(px + 2, yy, pw - 4, 5, 1), '#3c3440', { s: 1.4, l: 1, w: 1.2 }) + `<circle cx="${px + 7}" cy="${yy + 2.5}" r="1.1" fill="#b8b0c4"/><circle cx="${px + pw - 7}" cy="${yy + 2.5}" r="1.1" fill="#b8b0c4"/>`;
  const jp = janela(98, 166, 14, 14, { tipo: 'redonda', moldura: '#5a3420', cruz: false });
  s += jp.s; e += jp.e;
  s += `<circle cx="${px + pw - 7}" cy="186" r="2.4" fill="#e8b84a" stroke="${TINTA}" stroke-width="1"/>`;
  // aviso pregado na parede
  s += cel(`M36,168 h32 l-1,15 h-30Z`, '#f3e6cf', { s: 1.5, l: 1, w: 1.4 }) + texto(52, 174.5, 'ASSEMBLEIA', 4.8, '#2f6a34', { sw: 0 }) + texto(52, 181, 'HOJE!!', 5.4, '#c24a3a', { sw: 0 }) + prego(52, 169.5, 1);
  // lanterna de parede ao lado da porta
  const ln = lanterna(13, 124, { esc: 1 });
  s += traco('M13,118 v6', TINTA, 1.4) + ln.s; e += ln.e;
  // degraus
  s += cel(retRed(77, 220, 56, 14, 3), '#8a7766', { s: 3.5, l: 2, w: 2.2 });
  s += cel(retRed(83, 211, 44, 11, 3), '#9a8676', { s: 3, l: 2, w: 2.2 });
  s += traco('M88,226 l6,2 M118,224 l4,3', '#5a4a40', 0.9);
  // sombra interna sob o beiral
  s += recorte(ret(22, 108, 166, 40), `<path d="M10,108 H200 V128 Q105,142 10,128Z" fill="#1a0c18" opacity="0.45"/>`);
  // telhado de musgo grosso e pendente
  const tel = blob([[4, 126], [2, 98], [16, 62], [48, 34], [104, 22], [160, 32], [194, 60], [208, 96], [206, 126], [184, 134], [150, 130], [105, 136], [58, 130], [24, 134]], 1);
  s += telhadoMusgo(tel, 4, 206, 26, 134, 21);
  // gotas de musgo na borda de baixo
  s += musgo(10, 200, 130, 31, { cor: '#5a9a34', alt: 4.5, gotas: 0.7 });
  // janelinha redonda do sótão, com capuz de musgo
  const js = janela(93, 62, 24, 22, { tipo: 'redonda', moldura: MADEIRA_ESC });
  s += js.s; e += js.e;
  s += massa(cachos([[92, 58, 9, 6], [105, 53, 11, 7], [118, 58, 9, 6]], 5), '#7cbc44', { s: 3, l: 2, w: 1.6, cc: '#1f3a1c' });
  // lenha empilhada do lado
  for (const [x, y] of [[196, 224], [205, 224], [200.5, 216]]) s += cel(elipse(x, y, 5, 4.6), '#d8a868', { s: 1.4, l: 1, w: 1.6, cc: '#3a2018' }) + `<circle cx="${x}" cy="${y}" r="1.6" fill="none" stroke="#a87040" stroke-width="0.8"/>`;
  // cogumelos, florzinhas e tufos no telhado
  for (const [x, y, c] of [[40, 70, '#b77cf2'], [70, 48, '#ffd34a'], [128, 44, '#e65aa0'], [176, 82, '#b77cf2'], [52, 100, '#fff2a8'], [150, 96, '#ffd34a']]) {
    s += `<circle cx="${x}" cy="${y}" r="2.6" fill="${c}" stroke="${TINTA}" stroke-width="0.8"/><circle cx="${x - 0.7}" cy="${y - 0.7}" r="0.9" fill="#fff"/>`;
  }
  s += cel(`M150,58 q6,-9 12,0 Z`, '#d24a3a', { s: 1.4, l: 1, w: 1.2 }) + `<rect x="154.5" y="58" width="3" height="5" fill="#f3e6cf" stroke="${TINTA}" stroke-width="0.8"/><circle cx="154" cy="55" r="1" fill="#fff"/><circle cx="159" cy="56" r="0.8" fill="#fff"/>`;
  // tufos e musgo na base
  s += musgo(20, 76, 228, 41, { cor: '#5a9a34', alt: 4, gotas: 0 }) + musgo(140, 190, 228, 42, { cor: '#5a9a34', alt: 4, gotas: 0 });
  s += tufo(18, 232, '#5fae3c', 51) + tufo(192, 232, '#5fae3c', 52) + tufo(140, 234, '#6abb44', 53, 0.8) + tufo(60, 234, '#6abb44', 54, 0.8);
  return { nome: 'casa_musgo', w: W, h: H, svg: s, emissivo: e };
}

export function bancaRoxa() {
  const W = 150, H = 150;
  // ---------- fundo ----------
  let s = sombraChao(75, 142, 70, 9), e = '';
  // painel de fundo (pano) e postes de trás
  s += cel(retRed(20, 44, 110, 70, 2), '#4a2a5a', { s: 4, l: 2, w: 2 });
  for (let i = 0; i < 7; i++) s += traco(`M${28 + i * 16},46 Q${30 + i * 16},80 ${27 + i * 16},112`, '#3a1e48', 1.2, 0.8);
  s += cel(retRed(16, 30, 8, 108, 2), MADEIRA_ESC, { s: 2.5, l: 1.5, w: 2 }) + cel(retRed(126, 30, 8, 108, 2), MADEIRA_ESC, { s: 2.5, l: 1.5, w: 2 });
  // prateleiras com frascos
  for (const [yy, sd] of [[70, 1], [96, 2]]) {
    const rr = rnd(sd * 7);
    for (let x = 30; x < 122; x += 9 + rr() * 4) {
      const f = frasco(x, yy, ['#7dff9a', '#ff6ad5', '#5ec8ff', '#ffd34a', '#b77cf2'][Math.floor(rr() * 5)], Math.floor(rr() * 3), 0.75);
      s += f.s; e += recorte(ret(0, 0, W, H), f.e.replace(/opacity="0.45"/, 'opacity="0.25"'));
    }
    s += cel(retRed(22, yy, 106, 5, 1.5), MADEIRA, { s: 2, l: 1.4, w: 1.6 });
  }
  // ervas penduradas
  for (const x of [36, 60, 92, 114]) {
    s += traco(`M${x},44 v6`, '#3a2a20', 1) + massa(bolhas([[x, 54, 3.4, 5], [x - 2.5, 57, 2.5, 4], [x + 2.5, 57, 2.5, 4]]), x % 2 ? '#6aa83a' : '#8a9a3a', { s: 1.5, l: 1, w: 1 });
  }
  // toldo listrado roxo/lilás em perspectiva
  const tol = poli([[22, 6], [128, 6], [146, 36], [4, 36]]);
  let lis = '';
  for (let i = 0; i < 9; i++) {
    const a0 = i / 9, a1 = (i + 1) / 9;
    lis += `<path d="${poli([[22 + 106 * a0, 6], [22 + 106 * a1, 6], [4 + 142 * a1, 36], [4 + 142 * a0, 36]])}" fill="${i % 2 ? LILAS : ROXO}"/>`;
  }
  s += recorte(tol, lis + `<rect x="0" y="6" width="150" height="8" fill="#fff" opacity="0.18"/><rect x="0" y="28" width="150" height="8" fill="#2a0a40" opacity="0.25"/>`);
  s += `<path d="${tol}" fill="none" stroke="#24103a" stroke-width="2.4" stroke-linejoin="round"/>`;
  // franja em ondas
  const fr = [];
  for (let i = 0; i < 12; i++) fr.push([4 + 142 * (i + 0.5) / 12, 38, 6.3, 6]);
  s += massa(bolhas(fr), ROXO, { s: 2.5, l: 1.5, w: 1.6, cc: '#24103a' });
  s += cel(retRed(2, 33, 146, 6, 2), '#6a34a8', { s: 1.5, l: 1, w: 1.8, cc: '#24103a' });
  for (let i = 0; i < 12; i++) s += `<circle cx="${f1(4 + 142 * (i + 0.5) / 12)}" cy="45" r="1.5" fill="#ffd34a" stroke="${TINTA}" stroke-width="0.6"/>`;
  // placa do toldo
  s += cel(retRed(46, -1, 58, 14, 3), '#f3e2bd', { s: 2, l: 1.5, w: 1.8 }) + texto(75, 9.5, 'BENZIMENTO', 7, '#6a2aa8', { sw: 0, peso: 900 });
  const fundo = { nome: 'banca_roxa_fundo', w: W, h: H, svg: s, emissivo: e };

  // ---------- frente ----------
  let f = '', fe = '';
  const top = 90; // borda de cima do balcão (60% da altura)
  // postes da frente
  f += cel(retRed(4, 38, 9, 108, 2), MADEIRA_ESC, { s: 2.5, l: 1.5, w: 2 }) + cel(retRed(137, 38, 9, 108, 2), MADEIRA_ESC, { s: 2.5, l: 1.5, w: 2 });
  // tampo
  f += tabuasH(8, top - 6, 134, 12, 2, '#b0743f', 13, { pregos: true });
  f += `<path d="${ret(8, top - 6, 134, 12)}" fill="none" stroke="${TINTA}" stroke-width="2.2"/>`;
  // frente do balcão
  f += tabuasV(12, top + 6, 126, 46, 9, MADEIRA, 14);
  f += `<path d="${ret(12, top + 6, 126, 46)}" fill="none" stroke="${TINTA}" stroke-width="2.2"/>`;
  f += `<rect x="12" y="${top + 6}" width="126" height="6" fill="#1a0a10" opacity="0.35"/>`;
  // pano roxo com folha dourada
  f += cel(`M48,${top + 4} H102 V${top + 36} L75,${top + 46} L48,${top + 36}Z`, '#6a34a8', { s: 3, l: 2, w: 2, cc: '#24103a' });
  f += cel(`M75,${top + 14} q9,8 0,22 q-9,-14 0,-22Z`, '#f2c23a', { s: 1.5, l: 1, w: 1.4 }) + traco(`M75,${top + 16} v18`, '#a8741a', 1);
  // frascos coloridos no balcão
  const bot = [[22, '#ff6ad5', 1, 1.1], [34, '#7dff9a', 0, 1], [46, '#5ec8ff', 2, 0.9], [106, '#ffd34a', 1, 1], [118, '#b77cf2', 0, 1.15], [130, '#7dff9a', 2, 0.85]];
  for (const [x, c, t, k] of bot) {
    const fz = frasco(x, top - 1, c, t, k);
    f += fz.s; fe += fz.e;
  }
  // pilão e vela
  f += cel(`M58,${top - 1} h14 l-2,-9 h-10Z`, '#8a8478', { s: 2, l: 1, w: 1.5 }) + traco(`M66,${top - 8} l6,-10`, '#6e3f24', 2.4) ;
  f += cel(retRed(88, top - 12, 5, 11, 1), '#f3e6cf', { s: 1.2, l: 0.8, w: 1.2 }) + `<path d="M90.5,${top - 13} q-2,-3 0,-6 q2,3 0,6Z" fill="#ffb03a" stroke="${TINTA}" stroke-width="0.7"/>`;
  fe += halo(90.5, top - 16, 12, '#ffb040', 0.7) + `<path d="M90.5,${top - 13} q-2,-3 0,-6 q2,3 0,6Z" fill="#ffe08a"/>`;
  // tufos e musgo no pé
  f += musgo(12, 50, top + 52, 61, { cor: '#5a9a34', alt: 3.5, gotas: 0 }) + musgo(104, 138, top + 52, 62, { cor: '#5a9a34', alt: 3.5, gotas: 0 });
  f += tufo(8, 148, '#5fae3c', 63, 0.8) + tufo(142, 148, '#5fae3c', 64, 0.8);
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
  let s = sombraChao(27, 79, 26, 6) + cel(d, '#7f7a70', { s: 8, l: 4, w: 3, cc: '#1e1a22' });
  // facetas e rachas
  s += recorte(d, `<path d="M${tipo ? 34 : 30},4 L${tipo ? 40 : 38},40 L${tipo ? 52 : 52},44 V0Z" fill="#000" opacity="0.13"/>`) + traco(tipo ? 'M14,40 l5,6 l-2,7' : 'M40,52 l-4,6 l3,6', '#3e3a40', 1.1);
  // runa entalhada
  const g = runaGlifo(27, 42, 1, tipo);
  s += traco(g, '#2a2830', 4.6) + traco(g, cor, 2.4);
  s += musgo(8, 46, 78, seed, { cor: '#5a9a34', alt: 4.5, gotas: 0.2 });
  s += musgo(tipo ? 16 : 14, tipo ? 26 : 24, tipo ? 26 : 24, seed + 3, { cor: '#6aa83a', alt: 3, gotas: 0.6 });
  s += tufo(6, 83, '#5fae3c', seed + 1, 0.8) + tufo(48, 83, '#5fae3c', seed + 2, 0.7);
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
      if (pontos) s += `<ellipse cx="${f1(x - rx * 0.35)}" cy="${f1(y - rx * 0.45)}" rx="${f1(rx * 0.22)}" ry="${f1(rx * 0.13)}" fill="${luz(c, 0.45)}" opacity="0.9" transform="rotate(-25 ${f1(x - rx * 0.35)} ${f1(y - rx * 0.45)})"/>`;
    }
  });
  return s;
}
function tronco(d, cor = '#6e4a34') {
  return cel(d, cor, { s: 6, l: 3, w: 3, cc: '#1e1218' });
}

export function arvoreRoxa() {
  const W = 230, H = 250, r = rnd(77);
  let s = sombraChao(115, 240, 80, 13), e = '';
  // raízes e tronco retorcido
  const tr = blob([[78, 244], [94, 232], [100, 200], [92, 170], [100, 140], [86, 112], [104, 104], [114, 124], [120, 108], [140, 100], [134, 126], [126, 150], [134, 182], [130, 220], [146, 236], [160, 246], [120, 240], [112, 246], [100, 238]], 0.9);
  s += tronco(tr, '#6a4a5c');
  s += traco('M106,236 Q100,200 108,170 Q114,150 106,128', '#3e2638', 1.6, 0.8) + traco('M124,232 Q120,200 124,176', '#3e2638', 1.4, 0.8) + traco('M98,190 q4,-6 2,-12', '#a888a0', 1.2, 0.8);
  s += `<ellipse cx="116" cy="196" rx="5" ry="7" fill="#2a1828" stroke="#1e1218" stroke-width="1.5"/>`;
  // galhos
  s += traco('M92,118 Q60,96 40,108', '#1e1218', 9) + traco('M92,118 Q60,96 40,108', '#6a4a5c', 5.5);
  s += traco('M134,110 Q170,92 196,104', '#1e1218', 9) + traco('M134,110 Q170,92 196,104', '#6a4a5c', 5.5);
  // copa em cachos lilás/roxo
  s += copa([
    [[60, 92, 40, 34], [115, 70, 52, 42], [172, 92, 40, 34], [30, 112, 26, 22], [200, 114, 26, 22], [115, 112, 40, 26]],
    [[70, 76, 34, 28], [118, 54, 40, 32], [160, 74, 34, 28], [44, 100, 22, 18], [188, 100, 22, 18]],
    [[88, 56, 26, 22], [134, 42, 26, 22], [64, 84, 18, 15], [170, 84, 18, 15]],
    [[108, 30, 18, 15], [80, 64, 12, 10], [150, 60, 12, 10]],
  ], ['#5a2c9a', '#7a44c4', '#a070e4', '#c9a2f2'], 78);
  // pétalas/flores brilhantes na copa
  for (let i = 0; i < 18; i++) {
    const x = 30 + r() * 170, y = 30 + r() * 90;
    s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="1.6" fill="#f2d8ff" stroke="#3a1a5a" stroke-width="0.6"/>`;
    e += `<circle cx="${f1(x)}" cy="${f1(y)}" r="2.8" fill="#d8a8ff" opacity="0.5"/>`;
  }
  // lanternas azuis penduradas
  for (const [x, y, len] of [[44, 120, 14], [86, 128, 20], [150, 126, 16], [192, 122, 12]]) {
    s += traco(`M${x},${y - 6} v${len}`, '#2a1a30', 1);
    const lp = lanternaPapel(x, y + len + 4, 5.5, '#5ec8ff', '#5ef0ff');
    s += lp.s; e += lp.e;
  }
  // musgo e tufos nas raízes
  s += musgo(80, 150, 238, 79, { cor: '#5a9a34', alt: 4, gotas: 0 }) + tufo(76, 246, '#5fae3c', 80) + tufo(158, 246, '#5fae3c', 81) + tufo(126, 248, '#6abb44', 82, 0.7);
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
  s += tronco(tr, '#7a5034') + traco('M78,176 Q76,150 80,130', '#3e2418', 1.3, 0.8);
  const cam = var2
    ? [[[40, 92, 32, 28], [80, 70, 42, 34], [122, 92, 32, 28], [80, 108, 40, 22]], [[52, 76, 26, 22], [86, 52, 30, 25], [116, 78, 24, 20]], [[70, 44, 20, 16], [102, 62, 14, 11], [48, 70, 12, 10]]]
    : [[[34, 100, 28, 24], [80, 80, 46, 38], [128, 100, 28, 24], [80, 116, 36, 18]], [[50, 84, 26, 22], [82, 60, 34, 28], [114, 84, 26, 22]], [[72, 46, 22, 18], [104, 70, 14, 11], [52, 76, 12, 10]]];
  s += copa(cam, var2 ? ['#2f7a34', '#47a03e', '#7ccc4c', '#a4e06a'] : ['#3a7a2e', '#5aa63a', '#8ccc4a', '#b4e46a'], seed);
  if (var2) for (const [x, y] of [[50, 96], [110, 92], [80, 84], [96, 108], [62, 110]]) s += `<circle cx="${x}" cy="${y}" r="3" fill="#e84a4a" stroke="${TINTA}" stroke-width="0.9"/><circle cx="${x - 1}" cy="${y - 1}" r="0.9" fill="#fff"/>`;
  s += musgo(64, 100, 182, seed + 1, { cor: '#5a9a34', alt: 3.5, gotas: 0 }) + tufo(60, 188, '#5fae3c', seed + 2) + tufo(104, 188, '#5fae3c', seed + 3, 0.8);
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
  s += tufo(42, 176, '#5fae3c', 91, 0.8) + tufo(68, 176, '#5fae3c', 92, 0.8);
  return { nome: 'pinheiro', w: W, h: H, svg: s };
}

export function arbusto(nome, seed, flores) {
  const W = 72, H = 52;
  let s = sombraChao(36, 48, 32, 5);
  s += copa([[[16, 36, 14, 12], [36, 28, 18, 16], [56, 36, 14, 12], [36, 40, 22, 10]], [[28, 26, 11, 9], [46, 30, 10, 8]]], ['#3a8a34', '#5aae40', '#86cc4c'], seed);
  if (flores) for (const [x, y, c] of [[20, 30, '#ff7ab8'], [40, 20, '#ffd34a'], [54, 32, '#ff7ab8'], [32, 38, '#fff'], [48, 42, '#ffd34a']]) s += `<circle cx="${x}" cy="${y}" r="2.6" fill="${c}" stroke="${TINTA}" stroke-width="0.8"/><circle cx="${x}" cy="${y}" r="0.9" fill="#c8641a"/>`;
  else for (const [x, y] of [[24, 34], [44, 24], [52, 40]]) s += `<circle cx="${x}" cy="${y}" r="2.2" fill="#5a7aff" stroke="${TINTA}" stroke-width="0.8"/><circle cx="${x - 0.6}" cy="${y - 0.6}" r="0.7" fill="#fff"/>`;
  return { nome, w: W, h: H, svg: s };
}
export function touceira() {
  return { nome: 'touceira', w: 30, h: 22, svg: sombraChao(15, 20, 12, 2.5, 0.3) + tufo(10, 21, '#4f9e36', 101, 0.9) + tufo(19, 21, '#6abb44', 102, 1.1) };
}
export function flores(i) {
  const cs = [['#b77cf2', '#fff2a8'], ['#ffd34a', '#c8641a'], ['#6ac8ff', '#fff']][i];
  let s = sombraChao(15, 20, 12, 2.5, 0.3) + tufo(15, 21, '#4f9e36', 110 + i, 0.8);
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
    s += `<g fill="${ang === -90 ? '#7ccc4c' : '#4f9e36'}" stroke="#1f3a1c" stroke-width="0.9">${fol}</g>` + traco(curva([[28, 38], [mx, my], [x2, y2]]), '#2f6a28', 1.2);
  }
  return { nome: 'samambaia', w: W, h: H, svg: s };
}
export function cogumelos() {
  const W = 44, H = 36;
  let s = sombraChao(22, 33, 18, 3), e = '';
  for (const [x, y, k, c] of [[14, 34, 1, '#5ec8ff'], [28, 35, 1.3, '#b77cf2'], [36, 34, 0.75, '#5ec8ff']]) {
    s += cel(`M${x - 2.4 * k},${y} q-0.5,${-7 * k} ${1 * k},${-11 * k} h${2.8 * k} q${1.5 * k},${4 * k} ${1 * k},${11 * k}Z`, '#efe2c8', { s: 1.5, l: 1, w: 1.3 });
    const cap = `M${x - 8 * k},${y - 10 * k} Q${x - 7 * k},${y - 20 * k} ${x},${y - 20 * k} Q${x + 7 * k},${y - 20 * k} ${x + 8 * k},${y - 10 * k} Q${x},${y - 7 * k} ${x - 8 * k},${y - 10 * k}Z`;
    s += cel(cap, c, { s: 3 * k, l: 2 * k, w: 1.6 });
    for (const [dx, dy] of [[-3, -15], [2, -17], [4, -12]]) s += `<circle cx="${x + dx * k}" cy="${y + dy * k}" r="${1.2 * k}" fill="#fff" opacity="0.9"/>`;
    e += halo(x, y - 14 * k, 16 * k, c, 0.6) + `<path d="${cap}" fill="${c}" opacity="0.55"/>`;
  }
  s += tufo(6, 35, '#4f9e36', 141, 0.6);
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
  s += musgo(14, 54, 16, 151, { cor: '#6aa83a', alt: 4.5, gotas: 0.6 }) + musgo(6, 76, 57, 152, { cor: '#5a9a34', alt: 3.5, gotas: 0 });
  s += tufo(4, 61, '#5fae3c', 153, 0.8) + tufo(80, 61, '#5fae3c', 154, 0.7);
  return { nome: 'rochedo', w: W, h: H, svg: s };
}
export function troncos() {
  const W = 84, H = 50;
  let s = sombraChao(42, 46, 40, 5);
  const tora = (x, y, len, rr) => {
    let t = cel(retRed(x, y - rr, len, rr * 2, rr * 0.4), '#7a5034', { s: 3, l: 2, w: 2.2 });
    t += traco(`M${x + 6},${y - rr * 0.4} h${len * 0.6} M${x + 12},${y + rr * 0.4} h${len * 0.5}`, '#4a2a1c', 1, 0.8);
    t += cel(elipse(x + len, y, rr * 0.75, rr), '#d8a868', { s: 2, l: 1.2, w: 2.2, cc: '#3a2018' });
    t += traco(`M${x + len},${y} m-${rr * 0.3},0 a${rr * 0.3},${rr * 0.4} 0 1 1 ${rr * 0.6},0 a${rr * 0.3},${rr * 0.4} 0 1 1 ${-rr * 0.6},0`, '#a87040', 0.9) + traco(`M${x + len},${y} m-${rr * 0.55},0 a${rr * 0.55},${rr * 0.72} 0 1 1 ${rr * 1.1},0`, '#a87040', 0.8);
    return t;
  };
  s += tora(6, 38, 60, 9) + tora(18, 38, 52, 8).replace(/^/, '') ;
  s = sombraChao(42, 46, 40, 5) + tora(4, 38, 56, 9) + tora(14, 22, 52, 9) + tora(22, 38, 40, 8);
  s += musgo(18, 40, 14, 161, { cor: '#6aa83a', alt: 3, gotas: 0.6 }) + cogumeloP(30, 30) + tufo(4, 48, '#5fae3c', 162, 0.7) + tufo(78, 48, '#5fae3c', 163, 0.7);
  return { nome: 'troncos', w: W, h: H, svg: s };
}
const cogumeloP = (x, y) => `<rect x="${x - 1}" y="${y - 4}" width="2" height="4" fill="#efe2c8" stroke="${TINTA}" stroke-width="0.6"/><path d="M${x - 3.5},${y - 3.5} q3.5,-5 7,0Z" fill="#d24a3a" stroke="${TINTA}" stroke-width="0.7"/>`;

export function lampiaoMadeira() {
  const W = 34, H = 122;
  let s = sombraChao(17, 118, 13, 3), e = '';
  s += cel(retRed(13, 22, 8, 98, 2), MADEIRA_ESC, { s: 2.5, l: 1.5, w: 2 }) + traco('M16,30 v80', '#3e2418', 0.9, 0.8);
  s += cel(retRed(10, 108, 14, 12, 2), '#7c7266', { s: 2, l: 1.5, w: 1.8 });
  s += cel(retRed(13, 18, 20, 6, 2), MADEIRA_ESC, { s: 2, l: 1.4, w: 1.8 }) + prego(17, 21) + traco('M17,24 L24,34', '#3e2418', 2.4) + traco('M17,24 L24,34', MADEIRA_ESC, 1.2);
  const ln = lanterna(28, 24, { esc: 1.05 });
  s += ln.s; e += ln.e;
  s += musgo(10, 24, 108, 171, { cor: '#6aa83a', alt: 2.5, gotas: 0.5 }) + tufo(9, 121, '#5fae3c', 172, 0.7) + tufo(25, 121, '#5fae3c', 173, 0.6);
  return { nome: 'lampiao_madeira', w: W, h: H, svg: s, emissivo: e };
}
export function bandeiraRaizes() {
  const W = 52, H = 124;
  let s = sombraChao(26, 120, 14, 3);
  s += cel(retRed(7, 6, 6, 116, 2), MADEIRA_ESC, { s: 2, l: 1.4, w: 1.8 }) + cel(elipse(10, 6, 4.5, 4.5), '#f2c23a', { s: 1.5, l: 1, w: 1.4 });
  s += cel(retRed(7, 14, 40, 5, 2), MADEIRA, { s: 1.5, l: 1, w: 1.6 });
  const ban = `M12,19 H44 V78 L36,72 L28,80 L20,72 L12,78Z`;
  s += cel(ban, '#2f8a44', { s: 6, l: 3, w: 2.2, cc: '#0e2a18' });
  s += recorte(ban, traco('M14,24 H42 M14,68 H42', '#f2c23a', 1.6) + traco('M18,22 v52 M38,22 v52', '#1f6a34', 1.2, 0.7));
  s += cel(`M28,32 q12,10 0,30 q-12,-20 0,-30Z`, '#f2c23a', { s: 2, l: 1.2, w: 1.5 }) + traco('M28,34 v28 M28,44 l-4,-3 M28,50 l4,-3 M28,56 l-4,-3', '#9a6a14', 1);
  s += musgo(5, 16, 120, 181, { cor: '#5a9a34', alt: 3, gotas: 0 }) + tufo(16, 123, '#5fae3c', 182, 0.7);
  return { nome: 'bandeira_raizes', w: W, h: H, svg: s };
}
export function cercaMadeira() {
  const W = 64, H = 50;
  let s = sombraChao(32, 46, 32, 3, 0.25);
  s += tabuasH(0, 16, 64, 7, 1, MADEIRA, 191, { pregos: false }) + tabuasH(0, 30, 64, 7, 1, mistura(MADEIRA, MADEIRA_ESC, 0.3), 192, { pregos: false });
  for (const x of [16, 48]) {
    s += cel(`M${x - 5},48 V9 l5,-5 l5,5 V48Z`, MADEIRA_ESC, { s: 2.5, l: 1.5, w: 2 }) + traco(`M${x - 1.5},12 v32`, '#3e2418', 0.8, 0.8) + prego(x, 19.5) + prego(x, 33.5);
  }
  s += musgo(10, 22, 46, 193, { cor: '#5a9a34', alt: 2.5, gotas: 0 }) + musgo(42, 54, 46, 194, { cor: '#5a9a34', alt: 2.5, gotas: 0 }) + tufo(30, 49, '#5fae3c', 195, 0.7);
  return { nome: 'cerca_madeira', w: W, h: H, svg: s };
}
export function totemRaizes() {
  const W = 54, H = 114;
  let s = sombraChao(27, 110, 18, 4), e = '';
  s += cel(retRed(15, 10, 24, 100, 4), '#8a5a3a', { s: 5, l: 2.5, w: 2.6 });
  for (const y of [40, 72]) s += traco(`M16,${y} H38`, '#3e2418', 1.6);
  // asas
  s += cel(`M15,44 L2,40 L6,52 L15,54Z`, '#2f8a44', { s: 2, l: 1.4, w: 1.8 }) + cel(`M39,44 L52,40 L48,52 L39,54Z`, '#2f8a44', { s: 2, l: 1.4, w: 1.8 });
  // máscara de cima
  const mk = `M12,12 Q12,2 27,2 Q42,2 42,12 V30 Q42,40 27,40 Q12,40 12,30Z`;
  s += cel(mk, '#d8a868', { s: 4, l: 2, w: 2.4 });
  s += cel(`M14,8 L8,0 L20,4Z M40,8 L46,0 L34,4Z`, '#c24a3a', { s: 1, l: 1, w: 1.4 });
  s += `<path d="M18,16 l6,2 l-6,3Z M36,16 l-6,2 l6,3Z" fill="#14101a"/>` + traco('M20,30 q7,5 14,0', '#3e2418', 2) + traco('M27,20 v6', '#3e2418', 1.6);
  s += traco('M14,24 l4,2 M40,24 l-4,2', '#2f8a44', 2);
  // runas no corpo
  const rs = 'M22,50 l5,8 l5,-8 M27,58 v8 M21,80 h12 M27,76 v14 M23,86 l4,4 l4,-4';
  s += traco(rs, '#2a1a20', 3.6) + traco(rs, '#5ef0ff', 2);
  e += halo(27, 70, 30, '#5ef0ff', 0.45) + desfoque(traco(rs, '#5ef0ff', 3.5), 1.6) + traco(rs, '#e8ffff', 1.4);
  e += `<path d="M18,16 l6,2 l-6,3Z M36,16 l-6,2 l6,3Z" fill="#7dff9a"/>` + halo(21, 18, 7, '#7dff9a', 0.7) + halo(33, 18, 7, '#7dff9a', 0.7);
  s += musgo(13, 41, 108, 201, { cor: '#5a9a34', alt: 3.5, gotas: 0.3 }) + tufo(11, 113, '#5fae3c', 202, 0.7) + tufo(43, 113, '#5fae3c', 203, 0.7);
  return { nome: 'totem_raizes', w: W, h: H, svg: s, emissivo: e };
}
export function varalLanternas() {
  const W = 180, H = 72;
  let s = sombraChao(10, 68, 9, 2.5) + sombraChao(170, 68, 9, 2.5), e = '';
  for (const x of [10, 170]) s += cel(retRed(x - 3.5, 8, 7, 62, 2), MADEIRA_ESC, { s: 2, l: 1.2, w: 1.8 }) + cel(elipse(x, 8, 4.5, 3), '#7a5034', { s: 1, l: 1, w: 1.4 });
  const fio = (t) => [10 + 160 * t, 12 + Math.sin(Math.PI * t) * 26];
  s += traco(curva([...Array(9)].map((_, i) => fio(i / 8))), '#2a1a20', 1.2);
  // bandeirinhas
  for (let i = 1; i < 16; i += 2) {
    const [x, y] = fio(i / 16);
    s += `<path d="M${f1(x - 3.5)},${f1(y)} h7 l-3.5,7Z" fill="${['#2f8a44', '#f2c23a', '#8a4ad0'][i % 3]}" stroke="${TINTA}" stroke-width="0.7"/>`;
  }
  const cores = ['#ff8a3a', '#ff5a7a', '#ffd34a', '#7dff9a', '#ff8a3a'];
  for (let i = 0; i < 5; i++) {
    const [x, y] = fio((i + 1) / 6);
    s += traco(`M${f1(x)},${f1(y)} v5`, '#2a1a20', 1);
    const lp = lanternaPapel(x, y + 12, 6.5, cores[i]);
    s += lp.s; e += lp.e;
  }
  s += tufo(10, 71, '#5fae3c', 211, 0.6) + tufo(170, 71, '#5fae3c', 212, 0.6);
  return { nome: 'varal_lanternas', w: W, h: H, svg: s, emissivo: e };
}
export function vasosErvas() {
  const W = 64, H = 48;
  let s = sombraChao(32, 45, 30, 4);
  const vaso = (x, y, w, h, c) => cel(`M${x - w / 2},${y - h} h${w} l${-w * 0.12},${h} h${-w * 0.76}Z`, c, { s: 3, l: 2, w: 2 }) + cel(retRed(x - w / 2 - 2, y - h - 3, w + 4, 5, 1.5), luz(c, 0.1), { s: 1.4, l: 1, w: 1.8 }) + traco(`M${x - w * 0.3},${y - h * 0.5} h${w * 0.6}`, sombra(c, 0.3), 1, 0.7);
  s += copa([[[16, 22, 9, 8], [22, 16, 6, 5]]], ['#3a8a34', '#5aae40'], 221) + vaso(16, 44, 18, 16, '#c8643a');
  s += samambaiaMini(46, 24) + vaso(46, 44, 20, 18, '#a85a8a');
  s += copa([[[31, 32, 6, 5]]], ['#6a9a3a', '#8ab84a'], 222) + vaso(31, 46, 12, 10, '#d88a4a');
  s += `<circle cx="20" cy="14" r="2" fill="#b77cf2" stroke="${TINTA}" stroke-width="0.7"/><circle cx="12" cy="20" r="2" fill="#b77cf2" stroke="${TINTA}" stroke-width="0.7"/>`;
  return { nome: 'vasos_ervas', w: W, h: H, svg: s };
}
const samambaiaMini = (x, y) => {
  let s = '';
  for (const a of [-140, -110, -70, -40, -90]) {
    const rr = (a * Math.PI) / 180;
    s += traco(`M${x},${y + 4} Q${f1(x + Math.cos(rr) * 8)},${f1(y + Math.sin(rr) * 10)} ${f1(x + Math.cos(rr) * 14)},${f1(y + Math.sin(rr) * 14 + 6)}`, '#1f3a1c', 4.2) + traco(`M${x},${y + 4} Q${f1(x + Math.cos(rr) * 8)},${f1(y + Math.sin(rr) * 10)} ${f1(x + Math.cos(rr) * 14)},${f1(y + Math.sin(rr) * 14 + 6)}`, a === -90 ? '#8ccc4a' : '#5aae40', 2.4);
  }
  return s;
};
export function poco() {
  const W = 84, H = 104;
  let s = sombraChao(42, 98, 40, 6);
  // postes e telhadinho
  s += cel(retRed(10, 24, 6, 62, 2), MADEIRA_ESC, { s: 2, l: 1.2, w: 1.8 }) + cel(retRed(68, 24, 6, 62, 2), MADEIRA_ESC, { s: 2, l: 1.2, w: 1.8 });
  s += cel(retRed(12, 34, 60, 4, 2), '#7a5034', { s: 1, l: 1, w: 1.4 }) + traco('M60,36 l6,6', '#3a2a20', 1.4);
  // água e boca
  s += cel(elipse(42, 66, 30, 11), '#7f7266', { s: 2, l: 2, w: 2.4 });
  s += `<ellipse cx="42" cy="67" rx="24" ry="7.5" fill="#1a2a3a"/><ellipse cx="42" cy="69" rx="20" ry="5" fill="#2a5a7a"/>` + brilho(36, 68, 6, 1.2, 0, 0.6);
  s += traco('M42,38 V60', '#3a2a20', 1);
  s += cel(`M37,60 h10 l-1,6 h-8Z`, '#8a5a34', { s: 1, l: 1, w: 1.2 });
  // parede da frente de pedra (meia-lua)
  const fr = `M12,66 A30,11 0 0 0 72,66 V88 A30,11 0 0 1 12,88Z`;
  s += recorte(fr, pedras(10, 60, 64, 42, PEDRA, 231, { linhas: 3, larg: [12, 18], borda: false }));
  s += `<path d="${fr}" fill="none" stroke="#1e1a22" stroke-width="2.4"/>`;
  s += musgo(14, 70, 92, 232, { cor: '#5a9a34', alt: 3.5, gotas: 0 });
  // telhado de musgo
  const tl = blob([[2, 32], [14, 10], [42, 2], [70, 10], [82, 32], [42, 28]], 0.8);
  s += telhadoMusgo(tl, 2, 82, 4, 30, 233);
  s += musgo(6, 78, 30, 234, { cor: '#5a9a34', alt: 3, gotas: 0.6 });
  s += tufo(8, 100, '#5fae3c', 235, 0.8) + tufo(76, 100, '#5fae3c', 236, 0.8);
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
