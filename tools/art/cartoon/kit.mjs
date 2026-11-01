// Kit de cenário cartoon: blocos de construção em cima da lib (tábuas com veio e prego, pedras com
// bisel, blocos de concreto, musgo, tufos, janelas acesas, faixa de perigo, rebites, letreiros, lanternas).
// Tudo devolve SVG em u (1 u = 1 px CSS). As funções que têm parte que brilha devolvem { s, e }.
import { blob, brilho as brilhoLib, cel as celLib, contorno, curva, elipse, halo, luz, mistura, retRed, rnd, sombra, traco } from './lib.mjs';

// Tom sóbrio: contorno de no máximo 2,4 u, faixa de luz discreta (nada de plástico), sombra um pouco mais funda.
export function cel(d, base, o = {}) {
  return celLib(d, base, { cl: luz(base, 0.13), cs: sombra(base, 0.34), ...o, w: Math.min(o.w ?? 2.2, 2.4) });
}
/** Brilho especular contido. */
export const brilho = (x, y, rx = 3, ry = 1.6, rot = -35, op = 0.85) => brilhoLib(x, y, rx, ry, rot, op * 0.4);

let n = 0;
export const kid = (p = 'k') => `${p}K${++n}`;
export const TINTA = '#1d1428';
export const ret = (x, y, w, h) => `M${x},${y}h${w}v${h}h${-w}Z`;
export const poli = (pts) => 'M' + pts.map((p) => `${(+p[0]).toFixed(1)},${(+p[1]).toFixed(1)}`).join('L') + 'Z';
export const f1 = (v) => (+v).toFixed(1);

/** Sombra suave no chão (elipse com borda difusa). */
export function sombraChao(cx, cy, rx, ry, op = 0.38) {
  const g = kid('sc');
  return `<defs><radialGradient id="${g}"><stop offset="0.5" stop-color="#120a1c" stop-opacity="${op}"/><stop offset="1" stop-color="#120a1c" stop-opacity="0"/></radialGradient></defs><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${g})"/>`;
}
/** Recorta o conteúdo pela forma d. */
export function recorte(d, inner) {
  const c = kid('rc');
  return `<defs><clipPath id="${c}"><path d="${d}"/></clipPath></defs><g clip-path="url(#${c})">${inner}</g>`;
}
/** Degradê linear (vertical por padrão); devolve [defs, url]. */
export function degrade(cores, { x2 = 0, y2 = 1 } = {}) {
  const g = kid('dg');
  const stops = cores.map((c, i) => `<stop offset="${i / (cores.length - 1)}" stop-color="${c}"/>`).join('');
  return [`<defs><linearGradient id="${g}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops}</linearGradient></defs>`, `url(#${g})`];
}
/** Desfoque (para brilhos neon na camada emissiva). */
export function desfoque(inner, sd = 3, op = 1) {
  const f = kid('bl');
  return `<defs><filter id="${f}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}"/></filter></defs><g filter="url(#${f})" opacity="${op}">${inner}</g>`;
}
/** União de formas com contorno só por fora (copas, musgo, espuma) e cel shading. */
export function massa(d, base, o = {}) {
  const w = Math.min(o.w ?? 2.2, 2.4) * 0.85, cc = o.cc ?? contorno(base);
  return `<path d="${d}" fill="${cc}" stroke="${cc}" stroke-width="${w * 2}" stroke-linejoin="round"/>` + cel(d, base, { ...o, w: 0 });
}
/** Várias elipses num só caminho (união). l = [[cx, cy, rx, ry?]] */
export const bolhas = (l) => l.map(([x, y, rx, ry]) => elipse(x, y, rx, ry ?? rx)).join(' ');
/** Cacho de folhas: círculo de borda recortada em gomos (sempre no mesmo sentido, para unir). */
export function cachoD(cx, cy, rx, ry = rx, seed = 1, gomos = null) {
  const r = rnd(seed * 7 + Math.round(cx * 13 + cy));
  const nn = gomos ?? Math.max(7, Math.round((rx + ry) / 4.2));
  const pts = [];
  const a0 = r() * Math.PI;
  for (let i = 0; i < nn * 2; i++) {
    const a = a0 + (i / (nn * 2)) * Math.PI * 2 + (r() - 0.5) * 0.15, k = i % 2 ? 0.82 + r() * 0.06 : 1.0 + r() * 0.07;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return blob(pts, 0.6);
}
/**
 * Desgaste: oclusão no pé da parede, manchas de sujeira, arranhões e escorridos, recortados em d.
 * Dá peso e idade às superfícies (o que tira o ar de brinquedo novo).
 */
export function desgaste(d, x, y, w, h, seed = 1, { forca = 1, escorrido = true } = {}) {
  const r = rnd(seed);
  const g = kid('ao');
  let s = `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0610" stop-opacity="${0.28 * forca}"/><stop offset="0.12" stop-color="#0a0610" stop-opacity="0"/><stop offset="0.75" stop-color="#0a0610" stop-opacity="0"/><stop offset="1" stop-color="#0a0610" stop-opacity="${0.4 * forca}"/></linearGradient></defs>`;
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${g})"/>`;
  for (let i = 0; i < (w * h) / 500; i++) {
    const mx = x + r() * w, my = y + r() * h;
    s += `<ellipse cx="${f1(mx)}" cy="${f1(my)}" rx="${f1(2 + r() * 7)}" ry="${f1(1 + r() * 3)}" fill="${r() < 0.75 ? '#1a1018' : '#5a4a30'}" opacity="${f1((0.06 + r() * 0.1) * forca)}"/>`;
  }
  for (let i = 0; i < (w * h) / 900; i++) {
    const mx = x + r() * w, my = y + r() * h;
    s += `<path d="M${f1(mx)},${f1(my)} l${f1(2 + r() * 5)},${f1((r() - 0.5) * 2)}" stroke="#fff" stroke-width="0.6" opacity="${f1(0.12 * forca)}"/>`;
  }
  if (escorrido) for (let i = 0; i < w / 30; i++) {
    const mx = x + r() * w, my = y + r() * h * 0.4;
    s += `<path d="M${f1(mx - 1.5)},${f1(my)} q1.5,${f1(8 + r() * 16)} 3,0Z" fill="#1a1018" opacity="${f1(0.18 * forca)}"/>`;
  }
  return recorte(d, s);
}
export const cachos = (l, seed = 1) => l.map(([x, y, rx, ry]) => cachoD(x, y, rx, ry ?? rx, seed)).join(' ');

export const prego = (x, y, r = 1.3) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="#2b2133"/><circle cx="${f1(x - r * 0.3)}" cy="${f1(y - r * 0.3)}" r="${r * 0.45}" fill="#b5adc0"/>`;
export const rebite = (x, y, r = 1.7) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="#9aa0ae" stroke="${TINTA}" stroke-width="0.9"/><circle cx="${f1(x - r * 0.35)}" cy="${f1(y - r * 0.35)}" r="${r * 0.4}" fill="#fff" opacity="0.8"/>`;

/** Tábuas verticais com veio, nó e prego. */
export function tabuasV(x, y, w, h, nT, cor, seed = 1, o = {}) {
  const r = rnd(seed), pw = w / nT;
  const cc = o.cc ?? contorno(cor);
  let s = '';
  for (let i = 0; i < nT; i++) {
    const x0 = x + i * pw;
    const c = mistura(cor, r() < 0.5 ? luz(cor, 0.2) : sombra(cor, 0.16), r() * 0.8);
    const dy = o.irregular ? r() * 4 : 0;
    s += cel(retRed(x0 + 0.4, y + dy, pw - 0.8, h - dy, 1.4), c, { s: 2.5, l: 1.8, w: 1.5, cc, gradiente: false });
    const gc = sombra(c, 0.34);
    for (let k = 0; k < 2; k++) {
      const gx = x0 + pw * (0.28 + 0.44 * r());
      s += traco(curva([[gx, y + dy + 3 + r() * 5], [gx + (r() - 0.5) * 2.5, y + h * (0.3 + r() * 0.4)], [gx + (r() - 0.5) * 2, y + h - 3 - r() * 5]]), gc, 0.8, 0.8);
    }
    if (r() < 0.35) s += `<ellipse cx="${f1(x0 + pw * (0.35 + r() * 0.3))}" cy="${f1(y + h * (0.2 + r() * 0.6))}" rx="1.4" ry="2.4" fill="none" stroke="${gc}" stroke-width="0.9"/>`;
    if (o.pregos !== false) s += prego(x0 + pw / 2, y + dy + 3.5) + prego(x0 + pw / 2, y + h - 3.5);
  }
  return s;
}
/** Tábuas horizontais. */
export function tabuasH(x, y, w, h, nT, cor, seed = 1, o = {}) {
  const r = rnd(seed), ph = h / nT;
  const cc = o.cc ?? contorno(cor);
  let s = '';
  for (let i = 0; i < nT; i++) {
    const y0 = y + i * ph;
    const c = mistura(cor, r() < 0.5 ? luz(cor, 0.2) : sombra(cor, 0.16), r() * 0.8);
    const dx = o.irregular ? r() * 4 : 0;
    s += cel(retRed(x + dx, y0 + 0.4, w - dx - (o.irregular ? r() * 4 : 0), ph - 0.8, 1.4), c, { s: 2.2, l: 1.6, w: 1.5, cc, gradiente: false });
    const gc = sombra(c, 0.34);
    for (let k = 0; k < 2; k++) {
      const gy = y0 + ph * (0.3 + 0.4 * r());
      s += traco(curva([[x + dx + 3 + r() * 6, gy], [x + w * (0.3 + r() * 0.4), gy + (r() - 0.5) * 2], [x + w - 4 - r() * 6, gy + (r() - 0.5) * 1.5]]), gc, 0.8, 0.8);
    }
    if (o.pregos !== false) s += prego(x + dx + 4, y0 + ph / 2) + prego(x + w - 4, y0 + ph / 2);
  }
  return s;
}
/** Pedras irregulares com bisel (Margem Esquerda), recortadas no retângulo. */
export function pedras(x, y, w, h, cor, seed = 1, { linhas = 2, larg = [14, 26], borda = true, rachas = 0.25 } = {}) {
  const r = rnd(seed), lh = h / linhas;
  let s = `<path d="${ret(x, y, w, h)}" fill="${sombra(cor, 0.6)}"/>`;
  for (let j = 0; j < linhas; j++) {
    let cx = x - r() * 10;
    while (cx < x + w) {
      const sw = larg[0] + r() * (larg[1] - larg[0]);
      const x0 = cx + 1, x1 = cx + sw - 1, y0 = y + j * lh + 1, y1 = y + (j + 1) * lh - 1;
      const J = () => (r() - 0.5) * 2.2;
      const d = blob([[x0 + 3 + J(), y0 + J() * 0.6], [(x0 + x1) / 2, y0 - 0.6 + J() * 0.5], [x1 - 3 + J(), y0 + J() * 0.6], [x1 + J() * 0.4, (y0 + y1) / 2], [x1 - 3 + J(), y1 + J() * 0.4], [(x0 + x1) / 2, y1 + 0.4], [x0 + 3 + J(), y1], [x0 + J() * 0.4, (y0 + y1) / 2]], 0.9);
      const c = mistura(cor, r() < 0.5 ? luz(cor, 0.22) : sombra(cor, 0.18), r());
      s += cel(d, c, { s: Math.min(3.5, lh * 0.22), l: 2, w: 1.4, gradiente: false });
      if (r() < rachas) {
        const rx = x0 + (x1 - x0) * (0.3 + r() * 0.4);
        s += traco(`M${f1(rx)},${f1(y0 + 2)} l${f1(r() * 3 - 1)},${f1(lh * 0.3)} l${f1(r() * 3)},${f1(lh * 0.2)}`, sombra(c, 0.45), 0.9);
      }
      cx += sw;
    }
  }
  return recorte(ret(x, y, w, h), s) + (borda ? `<path d="${ret(x, y, w, h)}" fill="none" stroke="${contorno(cor)}" stroke-width="2.2" stroke-linejoin="round"/>` : '');
}
/** Blocos de concreto/pedra cinza em fiadas (Margem Direita), com sujeira e ferrugem. */
export function blocos(x, y, w, h, cor, seed = 1, { linhas = 4, larg = 26, ferrugem = 0.18, borda = true } = {}) {
  const r = rnd(seed), lh = h / linhas;
  let s = `<path d="${ret(x, y, w, h)}" fill="${sombra(cor, 0.55)}"/>`;
  for (let j = 0; j < linhas; j++) {
    let cx = x - (j % 2 ? larg / 2 : 0) - r() * 4;
    while (cx < x + w) {
      const sw = larg * (0.8 + r() * 0.45);
      const c = mistura(cor, r() < 0.5 ? luz(cor, 0.18) : sombra(cor, 0.14), r() * 0.9);
      s += cel(retRed(cx + 1, y + j * lh + 1, sw - 2, lh - 2, 2.2), c, { s: Math.min(4, lh * 0.25), l: 2.4, w: 1.5, gradiente: false });
      if (r() < 0.35) s += `<ellipse cx="${f1(cx + sw * (0.3 + r() * 0.4))}" cy="${f1(y + j * lh + lh * 0.6)}" rx="${f1(2 + r() * 4)}" ry="${f1(1 + r() * 1.5)}" fill="${sombra(c, 0.35)}" opacity="0.45"/>`;
      if (r() < 0.2) s += `<circle cx="${f1(cx + 3 + r() * (sw - 6))}" cy="${f1(y + j * lh + 3 + r() * (lh - 6))}" r="0.9" fill="${sombra(c, 0.4)}"/>`;
      cx += sw;
    }
  }
  // escorrido de ferrugem e de sujeira
  for (let i = 0; i < w / 40; i++) {
    if (r() > ferrugem * 3) continue;
    const fx = x + 6 + r() * (w - 12), fy = y + r() * h * 0.5;
    s += `<path d="M${f1(fx - 2)},${f1(fy)} q2,${f1(10 + r() * 14)} 4,0 Z" fill="${r() < 0.5 ? '#b25a22' : '#2a2430'}" opacity="0.35"/>`;
  }
  return recorte(ret(x, y, w, h), s) + (borda ? `<path d="${ret(x, y, w, h)}" fill="none" stroke="${contorno(cor)}" stroke-width="2.2"/>` : '');
}
/** Faixa de musgo com gotas pendentes ao longo de y, de x0 a x1. */
export function musgo(x0, x1, y, seed = 1, { cor = '#64a336', alt = 5, gotas = 0.4 } = {}) {
  const r = rnd(seed), l = [];
  for (let x = x0; x <= x1; x += 4 + r() * 4) {
    l.push([x, y + (r() - 0.5) * 2, alt * (0.7 + r() * 0.6), alt * (0.6 + r() * 0.4)]);
    if (r() < gotas) l.push([x + r() * 3, y + alt * (0.8 + r() * 0.8), 1.8 + r(), alt * (0.6 + r() * 0.5)]);
  }
  let s = massa(bolhas(l), cor, { s: 2.5, l: 1.6, w: 1.4 });
  for (let i = 0; i < l.length; i += 3) s += `<circle cx="${f1(l[i][0] - 1)}" cy="${f1(l[i][1] - l[i][3] * 0.4)}" r="0.9" fill="${luz(cor, 0.5)}"/>`;
  return s;
}
/** Tufo de capim. */
export function tufo(x, y, cor = '#5fae3c', seed = 1, esc = 1) {
  const r = rnd(seed);
  let s = '';
  const nn = 5 + Math.floor(r() * 3);
  for (let i = 0; i < nn; i++) {
    const t = i / (nn - 1) - 0.5;
    const hh = (8 + r() * 6) * esc * (1 - Math.abs(t) * 0.7), bend = (t * 10 + (r() - 0.5) * 4) * esc;
    const bx = x + t * 7 * esc, w = 1.7 * esc;
    const c = mistura(cor, i % 2 ? luz(cor, 0.25) : sombra(cor, 0.2), 0.7);
    s += `<path d="M${f1(bx - w)},${f1(y)} Q${f1(bx + bend * 0.3)},${f1(y - hh * 0.6)} ${f1(bx + bend)},${f1(y - hh)} Q${f1(bx + bend * 0.3 + w)},${f1(y - hh * 0.5)} ${f1(bx + w)},${f1(y)}Z" fill="${c}" stroke="${contorno(cor)}" stroke-width="0.9" stroke-linejoin="round"/>`;
  }
  return s;
}
/** Janela acesa. tipo: 'ret' | 'arco' | 'redonda'. Devolve { s, e }. */
export function janela(x, y, w, h, { tipo = 'ret', moldura = '#7a4a2a', quente = ['#ffe9b0', '#f2b44c', '#cf7630'], cruz = true, vidroD = null, haloCor = '#e89a40', haloR = 1.1 } = {}) {
  const cx = x + w / 2, cy = y + h / 2;
  const forma = (m) => tipo === 'redonda' ? elipse(cx, cy, w / 2 + m, h / 2 + m)
    : tipo === 'arco' ? `M${x - m},${y + h + m} V${y + w / 2} A${w / 2 + m},${w / 2 + m} 0 0 1 ${x + w + m},${y + w / 2} V${y + h + m}Z`
      : retRed(x - m, y - m, w + 2 * m, h + 2 * m, 2 + m * 0.5);
  const [dg, url] = degrade(quente);
  let s = cel(forma(3.2), moldura, { s: 2.5, l: 1.8, w: 2 }) + dg + `<path d="${forma(0)}" fill="${url}"/>`;
  // sombra interna do caixilho no alto
  s += recorte(forma(0), `<path d="${ret(x - 4, y - 4, w + 8, 6 + h * 0.08)}" fill="#7a2a10" opacity="0.4"/>`);
  if (cruz) {
    const cm = sombra(moldura, 0.15);
    s += `<rect x="${f1(cx - 1.4)}" y="${y}" width="2.8" height="${h}" fill="${cm}" stroke="${TINTA}" stroke-width="0.8"/>`;
    s += `<rect x="${x}" y="${f1(tipo === 'arco' ? y + h * 0.55 : cy - 1.4)}" width="${w}" height="2.8" fill="${cm}" stroke="${TINTA}" stroke-width="0.8"/>`;
  }
  s += recorte(forma(0), `<path d="M${f1(x + w * 0.1)},${f1(y + h)} L${f1(x + w * 0.45)},${y - 2} L${f1(x + w * 0.62)},${y - 2} L${f1(x + w * 0.27)},${f1(y + h)}Z" fill="#fff" opacity="0.28"/>`);
  s += `<path d="${forma(0)}" fill="none" stroke="${TINTA}" stroke-width="1.2"/>`;
  const e = halo(cx, cy, Math.max(w, h) * haloR, haloCor, 0.55) + `<path d="${forma(0)}" fill="${quente[1]}" opacity="0.85"/>` + (cruz ? `<rect x="${f1(cx - 1.4)}" y="${y}" width="2.8" height="${h}" fill="#000"/><rect x="${x}" y="${f1(tipo === 'arco' ? y + h * 0.55 : cy - 1.4)}" width="${w}" height="2.8" fill="#000"/>` : '');
  return { s, e };
}
/** Faixa de perigo amarela e preta (listras a 45 graus). */
export function perigo(x, y, w, h, { a = '#f5b82e', b = '#2a2230', passo = 7, borda = true } = {}) {
  let st = '';
  for (let i = -h - passo * 2; i < w + h; i += passo * 2) st += `<path d="${poli([[x + i, y + h], [x + i + passo, y + h], [x + i + passo + h, y], [x + i + h, y]])}" fill="${b}"/>`;
  return recorte(ret(x, y, w, h), `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${a}"/>${st}<rect x="${x}" y="${y}" width="${w}" height="${Math.min(2, h * 0.2)}" fill="#fff" opacity="0.35"/><rect x="${x}" y="${y + h - Math.min(2.5, h * 0.25)}" width="${w}" height="${Math.min(2.5, h * 0.25)}" fill="#000" opacity="0.3"/>`) +
    (borda ? `<path d="${ret(x, y, w, h)}" fill="none" stroke="${TINTA}" stroke-width="1.6"/>` : '');
}
/** Texto grosso de letreiro, com contorno. */
export function texto(x, y, t, size, fill, { stroke = TINTA, sw = null, ls = 0, rot = 0, peso = 900, fonte = "'Arial Black','Segoe UI Black',Impact,sans-serif", anchor = 'middle', op = 1, sx = 1 } = {}) {
  const tr = `${rot ? `rotate(${rot} ${x} ${y}) ` : ''}${sx !== 1 ? `translate(${x} ${y}) scale(${sx} 1) translate(${-x} ${-y})` : ''}`;
  return `<text x="${x}" y="${y}" font-family="${fonte}" font-weight="${peso}" font-size="${size}" letter-spacing="${ls}" text-anchor="${anchor}" fill="${fill}" stroke="${stroke}" stroke-width="${sw ?? size * 0.2}" stroke-linejoin="round" paint-order="stroke" opacity="${op}"${tr ? ` transform="${tr}"` : ''}>${t}</text>`;
}
/** Lanterna de vidro pendurada (topo do gancho em x, y). Devolve { s, e }. */
export function lanterna(x, y, { metal = '#3a3240', luzc = ['#ffe9b0', '#f2b44c', '#cf7630'], haloCor = '#e89a40', esc = 1, haloR = 26 } = {}) {
  const k = esc, w = 10 * k, h = 14 * k, gy = y + 6 * k;
  const [dg, url] = degrade(luzc);
  let s = `<path d="M${x},${y} v${3 * k}" stroke="${TINTA}" stroke-width="${1.4 * k}"/>`;
  s += cel(`M${x - w * 0.35},${y + 3 * k} h${w * 0.7} l${w * 0.25},${3 * k} h${-w * 1.2}Z`, metal, { s: 1.5, l: 1, w: 1.4 * k });
  s += dg + `<path d="${retRed(x - w / 2, gy, w, h, 1.5 * k)}" fill="${url}" stroke="${TINTA}" stroke-width="${1.4 * k}"/>`;
  s += `<path d="M${x - w / 2},${gy + h * 0.5} h${w} M${x},${gy} v${h}" stroke="${metal}" stroke-width="${1.2 * k}"/>`;
  s += brilho(x - w * 0.22, gy + h * 0.25, 1.2 * k, 2.6 * k, 0, 0.7);
  s += cel(retRed(x - w * 0.62, gy + h - 0.5, w * 1.24, 3.2 * k, 1), metal, { s: 1.2, l: 0.8, w: 1.4 * k });
  const e = halo(x, gy + h / 2, haloR * k, haloCor, 0.7) + `<path d="${retRed(x - w / 2, gy, w, h, 1.5 * k)}" fill="${luzc[1]}"/>` + `<ellipse cx="${x}" cy="${gy + h * 0.55}" rx="${w * 0.25}" ry="${h * 0.25}" fill="#fff" opacity="0.7"/>`;
  return { s, e };
}
/** Lanterna de papel redonda (centro x, y). Devolve { s, e }. */
export function lanternaPapel(x, y, r, cor = '#ff8a3a', haloCor = null) {
  const ry = r * 1.15;
  let s = `<rect x="${f1(x - r * 0.4)}" y="${f1(y - ry - 2.5)}" width="${f1(r * 0.8)}" height="3" fill="#3a2a30" stroke="${TINTA}" stroke-width="0.8"/>`;
  s += cel(elipse(x, y, r, ry), cor, { s: r * 0.35, l: r * 0.2, w: 1.6, cl: luz(cor, 0.5) });
  for (const t of [-0.55, 0, 0.55]) s += traco(`M${f1(x + t * r)},${f1(y - ry + 1)} Q${f1(x + t * r * 1.35)},${y} ${f1(x + t * r)},${f1(y + ry - 1)}`, sombra(cor, 0.35), 0.8, 0.8);
  s += `<rect x="${f1(x - r * 0.4)}" y="${f1(y + ry - 0.5)}" width="${f1(r * 0.8)}" height="2.5" fill="#3a2a30" stroke="${TINTA}" stroke-width="0.8"/>`;
  s += traco(`M${x},${f1(y + ry + 2)} v${f1(r * 0.6)}`, '#ffd25a', 1.1);
  const e = halo(x, y, r * 3.2, haloCor ?? cor, 0.65) + `<ellipse cx="${x}" cy="${y}" rx="${r * 0.85}" ry="${ry * 0.85}" fill="${luz(cor, 0.35)}" opacity="0.9"/>`;
  return { s, e };
}
/** Frasco de poção (base em x, y). Devolve { s, e }. */
export function frasco(x, y, cor, tipo = 0, esc = 1) {
  const k = esc;
  let d;
  if (tipo === 0) d = `M${x - 2 * k},${y - 14 * k} h${4 * k} v${3 * k} q${5 * k},${2 * k} ${5 * k},${6 * k} v${4 * k} q0,${1 * k} ${-1 * k},${1 * k} h${-8 * k} q${-1 * k},0 ${-1 * k},${-1 * k} v${-4 * k} q0,${-4 * k} ${5 * k},${-6 * k}Z`;
  else if (tipo === 1) d = `M${x - 1.6 * k},${y - 15 * k} h${3.2 * k} v${5 * k} a${5 * k},${5 * k} 0 1 1 ${-3.2 * k},0Z`;
  else d = `M${x - 3 * k},${y - 13 * k} h${6 * k} v${12 * k} q0,${1 * k} ${-1 * k},${1 * k} h${-4 * k} q${-1 * k},0 ${-1 * k},${-1 * k}Z`;
  let s = `<path d="${d}" fill="#d8eef0" opacity="0.5" stroke="${TINTA}" stroke-width="${1.3 * k}"/>`;
  s += recorte(d, cel(ret(x - 7 * k, y - 9 * k, 14 * k, 10 * k), cor, { s: 2 * k, l: 1, w: 0 }) + `<rect x="${x - 7 * k}" y="${y - 9.5 * k}" width="${14 * k}" height="${1 * k}" fill="${luz(cor, 0.5)}"/>`);
  s += `<path d="${d}" fill="none" stroke="${TINTA}" stroke-width="${1.3 * k}"/>`;
  s += `<rect x="${x - 1.8 * k}" y="${y - 16.5 * k}" width="${3.6 * k}" height="${3 * k}" rx="0.8" fill="#8a5a34" stroke="${TINTA}" stroke-width="${0.9 * k}"/>`;
  s += brilho(x - 2 * k, y - 7 * k, 0.9 * k, 2.4 * k, 10, 0.8);
  const e = halo(x, y - 5 * k, 11 * k, cor, 0.45) + recorte(d, `<rect x="${x - 7 * k}" y="${y - 9 * k}" width="${14 * k}" height="${10 * k}" fill="${luz(cor, 0.3)}" opacity="0.8"/>`);
  return { s, e };
}
/** Painel de metal com rebites nos cantos. */
export function chapa(x, y, w, h, cor = '#5d6470', o = {}) {
  let s = cel(retRed(x, y, w, h, o.r ?? 2), cor, { s: o.s ?? 3, l: o.l ?? 2, w: o.w ?? 1.8 });
  if (o.rebites !== false) s += rebite(x + 3.5, y + 3.5, 1.3) + rebite(x + w - 3.5, y + 3.5, 1.3) + rebite(x + 3.5, y + h - 3.5, 1.3) + rebite(x + w - 3.5, y + h - 3.5, 1.3);
  return s;
}
/** Cano horizontal ou vertical com anéis. */
export function canoH(x, y, w, esp, cor = '#a8582a', aneis = []) {
  let s = cel(retRed(x, y - esp / 2, w, esp, esp * 0.3), cor, { s: esp * 0.3, l: esp * 0.18, w: 1.8 });
  s += `<rect x="${x + 2}" y="${f1(y - esp * 0.3)}" width="${w - 4}" height="${f1(esp * 0.14)}" fill="#fff" opacity="0.15" rx="1"/>`;
  for (const a of aneis) s += cel(retRed(a - 2.5, y - esp / 2 - 1.8, 5, esp + 3.6, 1.2), sombra(cor, 0.1), { s: 1.4, l: 1, w: 1.5 }) + rebite(a, y, 0.9);
  return s;
}
export function canoV(x, y, h, esp, cor = '#a8582a', aneis = []) {
  let s = cel(retRed(x - esp / 2, y, esp, h, esp * 0.3), cor, { s: esp * 0.3, l: esp * 0.18, w: 1.8 });
  s += `<rect x="${f1(x - esp * 0.3)}" y="${y + 2}" width="${f1(esp * 0.14)}" height="${h - 4}" fill="#fff" opacity="0.15" rx="1"/>`;
  for (const a of aneis) s += cel(retRed(x - esp / 2 - 1.8, a - 2.5, esp + 3.6, 5, 1.2), sombra(cor, 0.1), { s: 1.4, l: 1, w: 1.5 }) + rebite(x, a, 0.9);
  return s;
}
/** Janela sem luz elétrica: vidro escuro e, se vela = true, uma vela no peitoril com brilho fraco. */
export function janelaVela(x, y, w, h, { tipo = 'ret', moldura = '#523424', vela = true, cruz = true } = {}) {
  const j = janela(x, y, w, h, { tipo, moldura, quente: ['#3e3436', '#2a2028', '#1c141c'], cruz, haloR: 0.01 });
  let s = j.s, e = '';
  if (vela) {
    const cx = x + w * 0.5 + (cruz ? w * 0.2 : 0), by = y + h - 2;
    const [dg, url] = degrade(['#8a5a3a', '#4a2e24', '#2a1c1c']);
    s += dg + recorte(tipo === 'redonda' ? elipse(x + w / 2, y + h / 2, w / 2, h / 2) : ret(x, y, w, h), `<ellipse cx="${cx}" cy="${by - 4}" rx="${w * 0.55}" ry="${h * 0.45}" fill="${url}" opacity="0.8"/>`);
    s += `<rect x="${cx - 1.6}" y="${by - 7}" width="3.2" height="7" fill="#d8ccb4" stroke="${TINTA}" stroke-width="0.7"/><path d="M${cx},${by - 8} q-1.6,-2.4 0,-4.6 q1.6,2.2 0,4.6Z" fill="#f0b048"/>`;
    e = halo(cx, by - 9, Math.max(w, h) * 0.7, '#e08a3a', 0.45) + `<path d="M${cx},${by - 8} q-1.6,-2.4 0,-4.6 q1.6,2.2 0,4.6Z" fill="#ffd890"/>`;
  }
  return { s, e };
}
/** Tábuas pregadas atravessadas (janela tapada, conserto). */
export function tabuasPregadas(x, y, w, h, seed = 1, cor = '#6a4a34') {
  const r = rnd(seed);
  let s = '';
  const n = Math.max(2, Math.round(h / 10));
  for (let i = 0; i < n; i++) {
    const yy = y + (i + 0.5) * (h / n) + (r() - 0.5) * 3, ang = (r() - 0.5) * 16, th = 6 + r() * 2;
    const c = mistura(cor, r() < 0.5 ? luz(cor, 0.15) : sombra(cor, 0.15), r());
    s += `<g transform="rotate(${f1(ang)} ${f1(x + w / 2)} ${f1(yy)})">` + cel(ret(x - 4, yy - th / 2, w + 8, th), c, { s: 1.6, l: 1, w: 1.4, gradiente: false }) +
      traco(`M${x},${f1(yy - 0.5)} h${w * 0.7}`, sombra(c, 0.3), 0.7, 0.8) + prego(x - 1, yy, 1) + prego(x + w + 1, yy, 1) + '</g>';
  }
  return s;
}
/** Arame farpado: dois fios torcidos com farpas, ao longo da curva pts. */
export function arame(pts, seed = 1, cor = '#5a5658') {
  const r = rnd(seed);
  let s = traco(curva(pts), '#1a1418', 2.2) + traco(curva(pts.map(([x, y], i) => [x, y + (i % 2 ? 1.2 : -1.2)])), cor, 0.9) + traco(curva(pts), cor, 0.9);
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    for (let t = 0.25; t < 1; t += 0.5) {
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, a = r() * 3;
      s += `<path d="M${f1(x - 2.2)},${f1(y - 2.2 + a * 0.3)} L${f1(x + 2.2)},${f1(y + 2.2)} M${f1(x + 2.2)},${f1(y - 2.2)} L${f1(x - 2.2)},${f1(y + 2.2 - a * 0.3)}" stroke="${cor}" stroke-width="1" stroke-linecap="round"/>`;
    }
  }
  return s;
}
/** Fio de gambiarra caído entre dois pontos (catenária). */
export function fio(x0, y0, x1, y1, queda = 10, cor = '#1c1820', w = 1.2) {
  return traco(`M${f1(x0)},${f1(y0)} Q${f1((x0 + x1) / 2)},${f1(Math.max(y0, y1) + queda)} ${f1(x1)},${f1(y1)}`, cor, w);
}
/** Mancha de fuligem / queimado (decal escuro e difuso). */
export function fuligem(cx, cy, rx, ry, op = 0.55) {
  const g = kid('fu');
  return `<defs><radialGradient id="${g}"><stop offset="0" stop-color="#0c080c" stop-opacity="${op}"/><stop offset="0.55" stop-color="#1a1214" stop-opacity="${op * 0.6}"/><stop offset="1" stop-color="#1a1214" stop-opacity="0"/></radialGradient></defs><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${g})"/>`;
}
/** Etiqueta de preço remarcada: número antigo riscado e o novo, maior, escrito à mão em cima. */
export function etiqueta(x, y, velho, novo, cor = '#d8ccb4') {
  return cel(poli([[x, y], [x + 16, y], [x + 18, y + 5], [x + 16, y + 10], [x, y + 10]]), cor, { s: 1.2, l: 0.8, w: 1 }) +
    `<circle cx="${x + 14.5}" cy="${y + 5}" r="1" fill="${TINTA}"/>` +
    texto(x + 6.5, y + 4.6, velho, 3.8, '#5a5458', { sw: 0, fonte: 'Arial,sans-serif', peso: 700 }) + traco(`M${x + 2},${y + 3.6} h9`, '#8a2a24', 0.8) +
    texto(x + 7.5, y + 9.6, novo, 4.8, '#8a2a24', { sw: 0, fonte: "'Segoe Print',Arial,sans-serif", peso: 700, rot: -6 });
}
export { blob, contorno, curva, elipse, halo, luz, mistura, retRed, rnd, sombra, traco };
