// Pipeline da arte cartoon 2D (estilo Brawl Stars / Ravenswatch): cada peça é um SVG montado por
// código com formas cheias, contorno grosso colorido, sombreamento em faixas (cel shading) com luz de
// cima à esquerda e brilhos. O Chromium do Playwright rasteriza em PNG na escala pedida (3x = nítido
// num celular de dpr 3). Unidade: 1 u = 1 px de CSS com a câmera em zoom 1.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from 'playwright';

let uid = 0;
const id = (p = 'i') => `${p}${++uid}`;

// ---------- cor ----------
const hx = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl2hex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex(f(0) * 255, f(8) * 255, f(4) * 255);
}
const toward = (h, t, amt) => { const d = ((t - h + 540) % 360) - 180; return h + Math.sign(d) * Math.min(Math.abs(d), amt); };
/** Sombra: mais escura, mais saturada, matiz puxado para o azul-violeta. k 0..1 */
export function sombra(c, k = 0.3) {
  const [h, s, l] = rgb2hsl(hx(c));
  return hsl2hex(toward(h, 255, 30 * k / 0.3), Math.min(1, s * (1 + 0.3 * k)), l * (1 - k));
}
/** Luz: mais clara, matiz puxado para o amarelo. k 0..1 */
export function luz(c, k = 0.25) {
  const [h, s, l] = rgb2hsl(hx(c));
  return hsl2hex(toward(h, 55, 20 * k / 0.25), s * (1 - 0.1 * k), l + (1 - l) * k);
}
/** Contorno: bem escuro na mesma família. */
export function contorno(c) {
  const [h, s] = rgb2hsl(hx(c));
  return hsl2hex(toward(h, 265, 30), Math.min(1, s * 0.7 + 0.15), 0.12);
}
export function mistura(a, b, t) {
  const A = hx(a), B = hx(b);
  return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

// ---------- formas ----------
/** Caminho suave e fechado passando pelos pontos (Catmull-Rom → Bézier). */
export function blob(pts, tension = 1) {
  const n = pts.length;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}
/** Caminho suave aberto (cabelo, corda, cipó). */
export function curva(pts, tension = 1) {
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
export const elipse = (cx, cy, rx, ry) => `M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${rx * 2},0 a${rx},${ry} 0 1,0 ${-rx * 2},0Z`;
export const retRed = (x, y, w, h, r) => `M${x + r},${y} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(w - 2 * r)} a${r},${r} 0 0 1 ${-r},${-r} v${-(h - 2 * r)} a${r},${r} 0 0 1 ${r},${-r}Z`;

/**
 * Forma com cel shading: base, faixa de sombra embaixo à direita, faixa de luz em cima à esquerda,
 * contorno grosso. o = { base, s (deslocamento da sombra), l (da luz), w (contorno), cs, cl, cc,
 * brilho (true = pontinho especular), gradiente (true = leve degradê vertical na base) }.
 */
export function cel(d, base, o = {}) {
  const s = o.s ?? 5, l = o.l ?? 3, w = o.w ?? 3;
  const cs = o.cs ?? sombra(base, 0.28), cl = o.cl ?? luz(base, 0.28), cc = o.cc ?? contorno(base);
  const cp = id('c'), mk = id('m'), mk2 = id('m');
  let fill = base;
  let defs = `<clipPath id="${cp}"><path d="${d}"/></clipPath>`;
  if (o.gradiente !== false) {
    const g = id('g');
    defs += `<linearGradient id="${g}" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${luz(base, 0.08)}"/><stop offset="1" stop-color="${sombra(base, 0.08)}"/></linearGradient>`;
    fill = `url(#${g})`;
  }
  // sombra = forma menos a forma deslocada para cima/esquerda; luz = forma menos a deslocada para baixo/direita
  defs += `<mask id="${mk}" maskUnits="userSpaceOnUse" x="-2000" y="-2000" width="4000" height="4000"><path d="${d}" fill="#fff"/><path d="${d}" fill="#000" transform="translate(${-s},${-s * 1.1})"/></mask>`;
  defs += `<mask id="${mk2}" maskUnits="userSpaceOnUse" x="-2000" y="-2000" width="4000" height="4000"><path d="${d}" fill="#fff"/><path d="${d}" fill="#000" transform="translate(${l},${l * 1.2})"/></mask>`;
  let out = `<defs>${defs}</defs><path d="${d}" fill="${fill}"/>`;
  if (s > 0) out += `<path d="${d}" fill="${cs}" mask="url(#${mk})"/>`;
  if (l > 0) out += `<path d="${d}" fill="${cl}" mask="url(#${mk2})" opacity="0.9"/>`;
  if (w > 0) out += `<path d="${d}" fill="none" stroke="${cc}" stroke-width="${w}" stroke-linejoin="round"/>`;
  return out;
}
/** Contorno da silhueta inteira de um grupo (desenha o grupo engrossado atrás). */
export function silhueta(inner, cor = '#1c1222', w = 4) {
  const f = id('f');
  return `<defs><filter id="${f}" x="-20%" y="-20%" width="140%" height="140%"><feMorphology in="SourceAlpha" operator="dilate" radius="${w / 2}" result="d"/><feFlood flood-color="${cor}" result="c"/><feComposite in="c" in2="d" operator="in"/></filter></defs>` +
    `<g filter="url(#${f})">${inner}</g>${inner}`;
}
/** Brilho especular: elipse branca pequena e girada. */
export const brilho = (x, y, rx = 3, ry = 1.6, rot = -35, op = 0.85) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#fff" opacity="${op}" transform="rotate(${rot} ${x} ${y})"/>`;
/** Traço com ponta redonda (veios, costuras, cabelo). */
export const traco = (d, cor, w = 2, op = 1) => `<path d="${d}" fill="none" stroke="${cor}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;
/** Halo de luz suave (para a camada emissiva). */
export function halo(cx, cy, r, cor, op = 0.8) {
  const g = id('h');
  return `<defs><radialGradient id="${g}"><stop offset="0" stop-color="${cor}" stop-opacity="${op}"/><stop offset="0.45" stop-color="${cor}" stop-opacity="${op * 0.35}"/><stop offset="1" stop-color="${cor}" stop-opacity="0"/></radialGradient></defs><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${g})"/>`;
}
/** Gerador pseudoaleatório com semente (posições de tufos, pedras etc.). */
export function rnd(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// ---------- render ----------
/**
 * Rasteriza peças. pecas: [{ nome, w, h, svg, ax?, ay?, emissivo? }] — svg é o conteúdo interno
 * (coordenadas em u, origem no canto de cima à esquerda). ax/ay = âncora em u (padrão: centro x,
 * rodapé). emissivo = SVG só com o que brilha (vira <nome>_e.png, desenhado em ADD na cena).
 * Grava <dir>/<nome>.png (e _e.png) e devolve as entradas do manifesto.
 */
export async function renderizar(dir, pecas, { escala = 3 } = {}) {
  const b = await chromium.launch();
  const p = await b.newPage();
  const man = {};
  for (const pc of pecas) {
    const camadas = [['', pc.svg]];
    if (pc.emissivo) camadas.push(['_e', pc.emissivo]);
    for (const [suf, svg] of camadas) {
      const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${pc.w * escala}" height="${pc.h * escala}" viewBox="0 0 ${pc.w} ${pc.h}">${svg}</svg>`;
      const b64 = await p.evaluate(async ([doc, w, h]) => {
        const img = new Image();
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(doc)));
        await img.decode();
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0);
        return c.toDataURL('image/png').split(',')[1];
      }, [doc, pc.w * escala, pc.h * escala]);
      const f = `${dir}/${pc.nome}${suf}.png`;
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, Buffer.from(b64, 'base64'));
    }
    man[pc.nome] = { w: pc.w, h: pc.h, ax: (pc.ax ?? pc.w / 2) / pc.w, ay: (pc.ay ?? pc.h) / pc.h, e: !!pc.emissivo, escala };
  }
  await b.close();
  return man;
}

/** Prancha de conferência: peças sobre fundos claro e escuro, ampliadas. */
export async function prancha(arquivo, dir, nomes, { fundo = '#5a8a3a', fundo2 = '#3a3e4a', zoom = 1 } = {}) {
  const { readFileSync } = await import('node:fs');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const imgs = nomes.map((n) => `<div style="display:inline-block;margin:6px;vertical-align:bottom;text-align:center;font:11px sans-serif;color:#fff"><img style="zoom:${zoom / 3};display:block" src="data:image/png;base64,${readFileSync(`${dir}/${n}.png`).toString('base64')}"><span>${n}</span></div>`).join('');
  await p.setContent(`<body style="margin:0;background:linear-gradient(90deg,${fundo} 50%,${fundo2} 50%);padding:8px">${imgs}</body>`);
  await p.waitForTimeout(200);
  mkdirSync(dirname(arquivo), { recursive: true });
  await p.screenshot({ path: arquivo, fullPage: true });
  await b.close();
}
