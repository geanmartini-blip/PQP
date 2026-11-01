// Extensões da lib cartoon para bonecos com rig 2D: cápsulas (membros), sombreado em faixas sobre
// formas compostas, olhos, padrões de tecido, recorte automático das peças e montagem para conferência.
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from 'playwright';
import { blob, curva, elipse, retRed, brilho, traco, halo, sombra, luz, contorno, mistura, cel, renderizar } from './lib.mjs';

export { blob, curva, elipse, retRed, brilho, traco, halo, sombra, luz, contorno, mistura, cel, renderizar };

let n = 0;
export const uid = (p = 'b') => `${p}x${++n}`;
const f = (v) => v.toFixed(2);

/** Cápsula afunilada entre dois círculos (braço, perna, dedo). */
export function capsula(x1, y1, r1, x2, y2, r2) {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
  const a = Math.acos(Math.max(-1, Math.min(1, (r1 - r2) / d)));
  const p = (x, y, r, g) => `${f(x + r * Math.cos(g))},${f(y + r * Math.sin(g))}`;
  return `M${p(x1, y1, r1, th + a)} A${r1},${r1} 0 1 1 ${p(x1, y1, r1, th - a)} L${p(x2, y2, r2, th - a)} A${r2},${r2} 0 0 1 ${p(x2, y2, r2, th + a)} Z`;
}

/** Faixas de sombra (embaixo à direita) e luz (em cima à esquerda) de uma silhueta, por cima de qualquer cor. */
export function sombreia(d, { s = 4, l = 2.4, op = 0.32, opl = 0.2, cs = '#2a1250', cl = '#fff4c8' } = {}) {
  const m1 = uid('m'), m2 = uid('m');
  const M = (id, dx, dy) => `<mask id="${id}" maskUnits="userSpaceOnUse" x="-500" y="-500" width="1000" height="1000"><path d="${d}" fill="#fff"/><path d="${d}" fill="#000" transform="translate(${dx},${dy})"/></mask>`;
  op = Math.min(op, 0.3);
  let o = `<defs>${M(m1, -s, -s * 1.1)}${M(m2, l, l * 1.2)}</defs>`;
  if (s > 0) o += `<path d="${d}" fill="${cs}" opacity="${op}" mask="url(#${m1})"/>`;
  if (l > 0) o += `<path d="${d}" fill="${cl}" opacity="${opl}" mask="url(#${m2})"/>`;
  return o;
}

/** Forma composta: tudo de `inner` recortado pela silhueta d, sombreado em faixas e contornado. */
export function comp(d, inner, o = {}) {
  const cp = uid('c');
  return `<defs><clipPath id="${cp}"><path d="${d}"/></clipPath></defs><g clip-path="url(#${cp})">${inner}${sombreia(d, o)}</g>` +
    `<path d="${d}" fill="none" stroke="${o.cc ?? '#1d1024'}" stroke-width="${o.w ?? 2.2}" stroke-linejoin="round"/>`;
}

/** Recorta conteúdo por um caminho. */
export function recorta(d, inner) {
  const cp = uid('c');
  return `<defs><clipPath id="${cp}"><path d="${d}"/></clipPath></defs><g clip-path="url(#${cp})">${inner}</g>`;
}

/** Escurece um grupo (membro do lado de trás na vista de lado). */
export function escuro(svg, k = 0.76) {
  const id = uid('f');
  return `<defs><filter id="${id}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="linear" slope="${k}"/><feFuncG type="linear" slope="${k}"/><feFuncB type="linear" slope="${Math.min(1, k * 1.08)}"/></feComponentTransfer></filter></defs><g filter="url(#${id})">${svg}</g>`;
}

/** Padrão xadrez (faixas cruzadas que escurecem no cruzamento + fio claro). */
export const xadrez = (pid, base, esc, cla, p = 7, rot = 0) =>
  `<pattern id="${pid}" patternUnits="userSpaceOnUse" width="${p}" height="${p}" patternTransform="rotate(${rot})"><rect width="${p}" height="${p}" fill="${base}"/>` +
  `<rect width="${p * 0.42}" height="${p}" fill="${esc}" opacity=".5"/><rect width="${p}" height="${p * 0.42}" fill="${esc}" opacity=".5"/>` +
  `<rect x="${p * 0.7}" width="0.55" height="${p}" fill="${cla}" opacity=".75"/><rect y="${p * 0.7}" width="${p}" height="0.55" fill="${cla}" opacity=".75"/></pattern>`;

/** Olho grande de desenho: branco, íris com degradê, pupila, 2 brilhos e pálpebra grossa. */
export function olho(x, y, o = {}) {
  const rx = o.rx ?? 3.6, ry = o.ry ?? 4.6, iris = o.iris ?? '#6a3a1a', dx = o.dx ?? 0.5, dy = o.dy ?? 0.5, cc = o.cc ?? '#24121c';
  const g = uid('g'), cp = uid('c');
  const ix = x + dx, iy = y + dy;
  let s = `<defs><radialGradient id="${g}" cx="0.5" cy="0.7" r="0.7"><stop offset="0" stop-color="${luz(iris, 0.45)}"/><stop offset="0.55" stop-color="${iris}"/><stop offset="1" stop-color="${sombra(iris, 0.5)}"/></radialGradient>` +
    `<clipPath id="${cp}"><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/></clipPath></defs>`;
  s += `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#fbf8f4"/>`;
  s += `<g clip-path="url(#${cp})"><ellipse cx="${x}" cy="${y - ry * 0.5}" rx="${rx * 1.2}" ry="${ry * 0.55}" fill="#c9c0d8" opacity=".55"/>` +
    `<ellipse cx="${ix}" cy="${iy}" rx="${rx * (o.ki ?? 0.74)}" ry="${ry * (o.ki ?? 0.74) * 0.98}" fill="url(#${g})"/>` +
    `<ellipse cx="${ix}" cy="${iy + 0.2}" rx="${rx * 0.34}" ry="${ry * 0.36}" fill="#140812"/></g>`;
  // linha fina embaixo, pálpebra grossa em cima (sem anel em volta, que lê como óculos)
  s += `<path d="M${f(x - rx)},${f(y)} A${rx},${ry} 0 0 0 ${f(x + rx)},${f(y)}" fill="none" stroke="${cc}" stroke-width="0.7" opacity=".75"/>`;
  s += `<circle cx="${ix - rx * 0.3}" cy="${iy - ry * 0.3}" r="${rx * 0.26}" fill="#fff"/><circle cx="${ix + rx * 0.28}" cy="${iy + ry * 0.3}" r="${rx * 0.12}" fill="#fff" opacity=".9"/>`;
  const lado = o.cilio ?? 0; // 1 = cílio para a direita, -1 para a esquerda
  s += `<path d="M${f(x - rx - 0.4)},${f(y + 0.3)} A${rx + 0.2},${ry + 0.2} 0 0 1 ${f(x + rx + 0.4)},${f(y + 0.3)}" fill="none" stroke="${cc}" stroke-width="${o.lw ?? 1.9}" stroke-linecap="round"/>`;
  if (lado) s += traco(`M${f(x + lado * (rx + 0.1))},${f(y - 0.6)} l${f(lado * 1.9)},${f(-1.5)} M${f(x + lado * (rx * 0.75))},${f(y - ry * 0.7)} l${f(lado * 1.6)},${f(-1.6)}`, cc, 1.2);
  if (o.palpebra) {
    // pálpebra caída: pele cobrindo o alto do olho, com a linha só na borda de baixo
    const yb = y - ry + ry * 2 * o.palpebra;
    s += `<path d="M${f(x - rx - 0.6)},${f(y - ry * 0.2)} Q${f(x)},${f(y - ry * 1.6)} ${f(x + rx + 0.6)},${f(y - ry * 0.2)} L${f(x + rx + 0.6)},${f(yb - 0.3)} Q${f(x)},${f(yb + 0.6)} ${f(x - rx - 0.6)},${f(yb - 0.3)}Z" fill="${o.pele}"/>`;
    s += traco(`M${f(x - rx - 0.4)},${f(yb)} Q${f(x)},${f(yb + 0.9)} ${f(x + rx + 0.4)},${f(yb)}`, cc, o.lw ?? 1.7);
  }
  return s;
}

/** Sobrancelha grossa com ponta afinando (d0 = lado de dentro). */
export function sobrancelha(x0, y0, x1, y1, cor, w = 2.2, arco = -1) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + arco;
  return `<path d="M${f(x0)},${f(y0 - w / 2)} Q${f(mx)},${f(my - w / 2)} ${f(x1)},${f(y1)} Q${f(mx)},${f(my + w / 2)} ${f(x0)},${f(y0 + w / 2)} Z" fill="${cor}" stroke="${cor}" stroke-width="0.6" stroke-linejoin="round"/>`;
}

// ---------- recorte e render ----------
const VB = { x: -120, y: -170, w: 240, h: 210, k: 3 };

/** Mede a área ocupada (alfa) de cada peça, em u, para recortar o PNG justo. */
export async function medir(pecas) {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = [];
  for (const pc of pecas) {
    const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${VB.w * VB.k}" height="${VB.h * VB.k}" viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}">${pc.svg}${pc.emissivo ?? ''}</svg>`;
    const r = await p.evaluate(async ([doc, W, H]) => {
      const img = new Image();
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(doc)));
      await img.decode();
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const a = g.getImageData(0, 0, W, H).data;
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a[(y * W + x) * 4 + 3] > 3) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      return [x0, y0, x1, y1];
    }, [doc, VB.w * VB.k, VB.h * VB.k]);
    res.push(r);
  }
  await b.close();
  return res.map(([x0, y0, x1, y1]) => ({
    x0: Math.floor(VB.x + x0 / VB.k - 1), y0: Math.floor(VB.y + y0 / VB.k - 1),
    x1: Math.ceil(VB.x + (x1 + 1) / VB.k + 1), y1: Math.ceil(VB.y + (y1 + 1) / VB.k + 1),
  }));
}

/** Peças desenhadas em coordenadas do boneco (pés em 0,0) → PNG recortado com âncora na junta. */
export async function renderizarPecas(dir, pecas) {
  const caixas = await medir(pecas);
  // topo sem a camada emissiva (para medir a altura do boneco sem o halo)
  const comE = pecas.filter((p) => p.emissivo);
  const cx = await medir(comE.map((p) => ({ svg: p.svg })));
  const topoSemE = {};
  pecas.forEach((p, i) => (topoSemE[p.nome] = caixas[i].y0));
  comE.forEach((p, i) => (topoSemE[p.nome] = cx[i].y0));
  renderizarPecas.topo = topoSemE;
  const prontas = pecas.map((pc, i) => {
    const c = caixas[i];
    const t = (s) => s && `<g transform="translate(${-c.x0},${-c.y0})">${s}</g>`;
    return { nome: pc.nome, w: c.x1 - c.x0, h: c.y1 - c.y0, ax: pc.jx - c.x0, ay: pc.jy - c.y0, svg: t(pc.svg), emissivo: t(pc.emissivo) };
  });
  return renderizar(dir, prontas, { escala: 3 });
}

// ---------- montagem para conferência ----------
const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
const T = (x, y) => [1, 0, 0, 1, x, y];
const R = (g) => { const r = (g * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [c, s, -s, c, 0, 0]; };

/** HTML de um boneco montado a partir do rig (pose = { parte|papel: graus }). */
export function montarHTML(dirPng, man, lista, pose = {}, zoom = 2) {
  const M = {}, por = Object.fromEntries(lista.map((p) => [p.parte, p]));
  const mat = (p) => {
    if (M[p.parte]) return M[p.parte];
    const base = p.pai ? mat(por[p.pai]) : [zoom, 0, 0, zoom, 0, 0];
    const g = pose[p.parte] ?? pose[p.papel] ?? 0;
    return (M[p.parte] = mul(mul(base, T(p.x, p.y)), R(g)));
  };
  let html = '';
  for (const p of lista) {
    mat(p);
    const m = man[p.img];
    const A = mul(M[p.parte], T(-m.ax * m.w, -m.ay * m.h));
    const src = (s) => `data:image/png;base64,${readFileSync(`${dirPng}/${p.img}${s}.png`).toString('base64')}`;
    const st = `position:absolute;left:0;top:0;width:${m.w}px;height:${m.h}px;transform-origin:0 0;transform:matrix(${A.map((v) => v.toFixed(4)).join(',')})`;
    html += `<img style="${st}" src="${src('')}">`;
    if (m.e) html += `<img style="${st};mix-blend-mode:plus-lighter" src="${src('_e')}">`;
  }
  return html;
}

export async function fotografar(arquivo, html, w, h) {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html);
  await p.waitForTimeout(300);
  mkdirSync(dirname(arquivo), { recursive: true });
  await p.screenshot({ path: arquivo, fullPage: true });
  await b.close();
}
