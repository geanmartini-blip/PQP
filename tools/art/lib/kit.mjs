// Kit modular do cenário: materiais (madeira, blocos, musgo, metal), cachos de copa, toldos listrados
// e a camada emissiva (o que brilha: janela, neon, runa, chama). Tudo por cima de Img da lib.
import { Img, ball, cyl, hash, vnoise, pick, shift, outlineOf, lightAt } from './img.mjs';

export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sprite com camada emissiva paralela. */
export class Spr {
  constructor(w, h) {
    this.img = new Img(w, h);
    this.E = new Img(w, h);
    this.hasE = false;
  }
  glow(x, y, c) {
    this.img.px(x, y, c);
    this.E.px(x, y, c);
    this.hasE = true;
  }
  /** Retângulo emissivo com gradiente vertical de cores (do topo para baixo). */
  glowRect(x, y, w, h, cols) {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const t = h > 1 ? j / (h - 1) : 0;
        this.glow(x + i, y + j, cols[Math.min(cols.length - 1, Math.floor(t * cols.length))]);
      }
  }
}

/** Escurece pixels já pintados numa área (sombra projetada), com dither na borda. */
export function darken(img, x, y, w, h, k = -0.45, fade = 0) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const c = img.get(x + i, y + j);
      if (c === null) continue;
      if (fade && j >= h - fade && hash(x + i, y + j, 3) < (j - (h - fade)) / fade) continue;
      img.px(x + i, y + j, shift(c, k));
    }
}

/**
 * Tábuas de madeira com veio, junta escura, borda iluminada e pregos.
 * dir 'v' = tábuas em pé (junta vertical), 'h' = deitadas.
 */
export function wood(img, x, y, w, h, r, { dir = 'v', pw = 6, seed = 1, nails = true, bias = 0 } = {}) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const across = dir === 'v' ? i : j;
      const along = dir === 'v' ? j : i;
      const k = Math.floor(across / pw);
      const p = across % pw;
      const off = hash(k, 0, seed) * 40;
      const grain = vnoise((along + off) * 0.18, p * 0.9 + k * 7, seed) - 0.5;
      let v = 0.42 + (hash(k, 1, seed) - 0.5) * 0.22 + grain * 0.35 + bias;
      if (p === 0) v += 0.22; // borda de cima/esquerda pega luz
      if (p === pw - 1) v = 0.0; // junta
      // nó da madeira
      const kx = Math.floor(hash(k, 2, seed) * 30);
      if (Math.abs(along - kx) + Math.abs(p - pw / 2) < 1.6 && hash(k, 3, seed) < 0.35) v = 0.05;
      let c = pick(r, v, x + i, y + j, 0.4);
      if (nails && p === Math.floor(pw / 2) && (along === 2 || along === (dir === 'v' ? h : w) - 3)) c = 0x2a2230;
      img.px(x + i, y + j, c);
    }
}

/** Blocos de pedra em amarração, com junta escura e bisel (luz de cima à esquerda). */
export function blocks(img, x, y, w, h, r, { bw = 10, bh = 6, seed = 2, mortar = null, bias = 0, rough = 0.35 } = {}) {
  const m = mortar ?? shift(r[0], -0.4);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const row = Math.floor(j / bh);
      const off = (row % 2) * Math.floor(bw / 2) + Math.floor(hash(row, 9, seed) * 3);
      const col = Math.floor((i + off) / bw);
      const lx = (i + off) % bw;
      const ly = j % bh;
      let c;
      if (lx === 0 || ly === 0) c = m;
      else {
        const tone = (hash(col, row, seed) - 0.5) * 0.25;
        let v = 0.5 + tone + (vnoise((x + i) * 0.4, (y + j) * 0.4, seed) - 0.5) * rough + bias;
        if (ly === 1 || lx === 1) v += 0.3;
        if (ly === bh - 1 || lx === bw - 1) v -= 0.3;
        c = pick(r, v, x + i, y + j, 0.5);
      }
      img.px(x + i, y + j, c);
    }
}

/** Superfície com ruído (laje, terra, chapa). */
export function noisy(img, x, y, w, h, r, { seed = 3, scale = 0.3, amp = 0.5, base = 0.5, dither = 0.6 } = {}) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const v = base + (vnoise((x + i) * scale, (y + j) * scale, seed) - 0.5) * amp + (hash(x + i, y + j, seed) - 0.5) * 0.12;
      img.px(x + i, y + j, pick(r, v, x + i, y + j, dither));
    }
}

/** Bolota com aro escuro embaixo: o "cacho" de copa e de musgo, que separa as camadas. */
export function clump(img, cx, cy, rx, ry, r, { bias = 0, rim = true } = {}) {
  if (rim) img.ellipse(cx + 0.4, cy + 1.2, rx, ry, shift(r[0], -0.25));
  ball(img, cx, cy, rx, ry, r, { bias, dither: 0.7 });
  // brilho no alto à esquerda
  const hx = Math.round(cx - rx * 0.4), hy = Math.round(cy - ry * 0.45);
  if (rx >= 4) {
    img.px(hx, hy, shift(r[r.length - 1], 0.45));
    img.px(hx + 1, hy, shift(r[r.length - 1], 0.2));
  }
}

/** Copa em cachos dentro de uma elipse: bolotas de trás (em cima) para a frente (embaixo). */
export function canopy(img, cx, cy, rx, ry, r, { n = 18, rmin = 5, rmax = 9, seed = 4, bias = 0 } = {}) {
  const R = rng(seed);
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R());
    const br = rmin + R() * (rmax - rmin);
    pts.push([cx + Math.cos(a) * d * (rx - br * 0.6), cy + Math.sin(a) * d * (ry - br * 0.6), br]);
  }
  // base cheia para não sobrar buraco
  img.ellipse(cx, cy + 1, rx * 0.8, ry * 0.8, r[1]);
  pts.sort((a, b) => a[1] - b[1]);
  for (const [x, y, br] of pts) {
    const b = bias + (cy - y) / (ry * 4) + (cx - x) / (rx * 6);
    clump(img, x, y, br, br * 0.85, r, { bias: b });
  }
}

/** Toldo listrado inclinado (vista 3/4), com borda recortada em meia-lua. */
export function awning(img, x, y, w, h, colA, colB, { stripe = 6, scallop = true } = {}) {
  for (let j = 0; j < h; j++) {
    const t = j / Math.max(1, h - 1);
    for (let i = 0; i < w; i++) {
      const s = Math.floor(i / stripe) % 2;
      const r = s ? colB : colA;
      const p = i % stripe;
      let v = 0.75 - t * 0.35 + (p === 0 ? 0.12 : 0) - (p === stripe - 1 ? 0.12 : 0);
      if (j === 0) v = 0.95;
      img.px(x + i, y + j, pick(r, v, x + i, y + j, 0.5));
    }
  }
  if (scallop)
    for (let i = 0; i < w; i++) {
      const s = Math.floor(i / stripe) % 2;
      const r = s ? colB : colA;
      const p = (i % stripe) + 0.5 - stripe / 2;
      const d = Math.round(Math.sqrt(Math.max(0, (stripe / 2) ** 2 - p * p)) * 0.7);
      for (let k = 0; k < d; k++) img.px(x + i, y + h + k, k === d - 1 ? r[0] : r[1]);
    }
}

/** Poste/viga cilíndrica. */
export const post = (img, x, y, w, h, r, o) => cyl(img, x, y, w, h, r, o);

/** Faixa de perigo diagonal amarela e preta. */
export function hazard(img, x, y, w, h, yel, blk = [0x1c1a22, 0x2a2730, 0x3a3640, 0x4a4650]) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const s = Math.floor((i + j) / 4) % 2;
      const r = s ? blk : yel;
      const v = 0.75 - (j / h) * 0.4 + (j === 0 ? 0.2 : 0);
      img.px(x + i, y + j, pick(r, v, x + i, y + j, 0.3));
    }
}

/** Chama de lampião (emissiva), 3 px de largura. */
export function flame(s, cx, cy) {
  const F = [0xfff6c8, 0xffd25a, 0xff9a2a, 0xe0561a];
  s.glow(cx, cy - 2, F[2]);
  s.glow(cx, cy - 1, F[1]);
  s.glow(cx - 1, cy, F[2]); s.glow(cx, cy, F[0]); s.glow(cx + 1, cy, F[2]);
  s.glow(cx - 1, cy + 1, F[1]); s.glow(cx, cy + 1, F[0]); s.glow(cx + 1, cy + 1, F[1]);
  s.glow(cx, cy + 2, F[1]);
}

// ======================= v2: peças com contorno próprio, telhas, janelas, folhagem =======================
import { outline as _outline, Img as _Img, mix as _mix, ramp as _ramp } from './img.mjs';

/**
 * Desenha uma peça numa camada própria, contorna e cola por cima. É o que dá a linha escura
 * entre telhado e parede, porta e moldura etc. (o "contorno interno" da referência).
 * O emissivo da peça substitui o de baixo onde a peça cobre.
 */
Spr.prototype.part = function (fn, { ol = true, olColor = null } = {}) {
  const t = new Spr(this.img.w, this.img.h);
  fn(t, t.img);
  if (ol) _outline(t.img, { color: olColor });
  for (let y = 0; y < t.img.h; y++)
    for (let x = 0; x < t.img.w; x++) {
      const a = t.img.alpha(x, y);
      if (!a) continue;
      this.img.px(x, y, t.img.get(x, y), a);
      const e = t.E.get(x, y);
      if (e !== null) { this.E.px(x, y, e); this.hasE = true; }
      else if (a > 200) this.E.px(x, y, null);
    }
  return this;
};
/** Cola outra Spr (com emissivo) na posição. */
Spr.prototype.paste = function (o, dx, dy, { flipX = false } = {}) {
  for (let y = 0; y < o.img.h; y++)
    for (let x = 0; x < o.img.w; x++) {
      const sx = flipX ? o.img.w - 1 - x : x;
      const a = o.img.alpha(sx, y);
      if (!a) continue;
      this.img.px(dx + x, dy + y, o.img.get(sx, y), a);
      const e = o.E.get(sx, y);
      if (e !== null) { this.E.px(dx + x, dy + y, e); this.hasE = true; } else this.E.px(dx + x, dy + y, null);
    }
  return this;
};

/** Gradiente de luz numa área já pintada: claro em cima à esquerda, escuro embaixo à direita. */
export function wallLight(img, x, y, w, h, k = 0.22) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const c = img.get(x + i, y + j);
      if (c === null) continue;
      const t = (1 - j / h) * 0.6 + (1 - i / w) * 0.4 - 0.5; // -0.5..0.5
      if (Math.abs(t) * k * 2 < 0.04) continue;
      img.px(x + i, y + j, shift(c, t * k * 2));
    }
}

/** Ambient occlusion: escurece em degradê com dither (embaixo de beiral, pé de parede). */
export function ao(img, x, y, w, h, { k = -0.5, dir = 'down' } = {}) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const c = img.get(x + i, y + j);
      if (c === null) continue;
      const t = dir === 'down' ? j / h : dir === 'up' ? 1 - j / h : dir === 'right' ? i / w : 1 - i / w;
      const s = 1 - t;
      if (bayer2(x + i, y + j) > s * 1.15) continue;
      img.px(x + i, y + j, shift(c, k * (0.4 + s * 0.6)));
    }
}
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer2 = (x, y) => (B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

/**
 * Telhas grandes arredondadas em fileiras (vista 3/4), como as da referência: cada telha tem a borda
 * de cima clara, corpo, sombra embaixo e linha escura separando. curve(x) desloca a fileira em y
 * (telhado abaulado). variant(i, j) devolve uma rampa alternativa (musgo mais claro, ferrugem).
 */
export function shingles(img, x, y, w, h, r, { tw = 10, th = 7, seed = 5, curve = null, variant = null, light = 0.18, round = 2 } = {}) {
  const line = shift(r[0], -0.45);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const yy = j - (curve ? curve(i) : 0);
      const row = Math.floor(yy / th);
      if (yy < 0) continue;
      const off = row % 2 ? Math.floor(tw / 2) : 0;
      const col = Math.floor((i + off) / tw);
      const lx = (i + off) % tw, ly = ((yy % th) + th) % th;
      const rr = variant ? variant(col, row) ?? r : r;
      // canto arredondado embaixo de cada telha
      const cx = Math.min(lx, tw - 1 - lx);
      if (ly >= th - 1 || (lx === 0 && ly > 0)) { img.px(x + i, y + j, line); continue; }
      if (ly >= th - 1 - round + (cx >= round ? 99 : cx)) { img.px(x + i, y + j, line); continue; }
      let v = 0.55 + (hash(col, row, seed) - 0.5) * 0.25 + (vnoise((x + i) * 0.35, (y + j) * 0.35, seed) - 0.5) * 0.18;
      if (ly === 0) v += 0.35;
      else if (ly === 1) v += 0.15;
      if (ly >= th - 2) v -= 0.3;
      if (lx === 1) v += 0.12;
      if (lx === tw - 1) v -= 0.22;
      v += ((w - i) / w - 0.5) * light; // luz da esquerda
      img.px(x + i, y + j, pick(rr, v, x + i, y + j, 0.45));
    }
}

/**
 * Janela com moldura grossa, vidro aceso (emissivo) com degradê, travessas em cruz, reflexo
 * diagonal, peitoril e cortina opcional. arco = topo em meia-lua.
 */
export function janela(s, x, y, w, h, { frame = null, lit = true, cross = true, arco = false, cortina = null, sill = true, vidro = null } = {}) {
  const g = s.img;
  const F = frame ?? [0x3a2418, 0x5a3820, 0x7a5030, 0x9a6a40];
  const GL = vidro ?? (lit ? [0xfff4c0, 0xffd77a, 0xffb648, 0xe8862a] : [0x9ad0e8, 0x5a90b8, 0x3a6088, 0x24405a]);
  const inside = (i, j) => {
    if (!arco) return true;
    const rx = w / 2, cy = rx;
    if (j >= cy) return true;
    const dx = i + 0.5 - rx, dy = j + 0.5 - cy;
    return dx * dx + dy * dy <= rx * rx;
  };
  // moldura (2 px) por fora
  for (let j = -2; j < h + 2; j++)
    for (let i = -2; i < w + 2; i++) {
      const ii = Math.max(0, Math.min(w - 1, i)), jj = Math.max(0, Math.min(h - 1, j));
      if (!inside(ii, Math.max(0, j + 2 > 0 ? jj : 0)) && j < w / 2) {
        const dx = i + 0.5 - w / 2, dy = j + 0.5 - w / 2;
        if (dx * dx + dy * dy > (w / 2 + 2) ** 2) continue;
      }
      const edge = i < 0 || j < 0 || i >= w || j >= h || !inside(i, j);
      if (!edge) continue;
      const v = (i < 0 || j < 0) ? 0.85 : 0.35;
      g.px(x + i, y + j, pick(F, v, x + i, y + j, 0.3));
    }
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!inside(i, j)) continue;
      const t = j / h;
      let c = GL[Math.min(3, Math.floor(t * 3.4))];
      // reflexo diagonal
      if ((i + j) % 9 === 0 && i + j < (w + h) * 0.7) c = _mix(c, 0xffffff, 0.55);
      if (lit) s.glow(x + i, y + j, c); else g.px(x + i, y + j, c);
    }
  if (cortina) {
    const C = cortina;
    for (let j = 0; j < h; j++) for (let i = 0; i < Math.max(2, Math.floor(w / 4)); i++) {
      if (!inside(i, j)) continue;
      const v = 0.6 - i * 0.12 + ((j % 3) === 0 ? 0.08 : 0);
      g.px(x + i, y + j, pick(C, v, x + i, y + j)); s.E.px(x + i, y + j, null);
      const xr = x + w - 1 - i;
      g.px(xr, y + j, pick(C, v - 0.2, xr, y + j)); s.E.px(xr, y + j, null);
    }
  }
  if (cross) {
    const mx = x + Math.floor(w / 2), my = y + Math.floor(h * (arco ? 0.6 : 0.5));
    for (let j = 0; j < h; j++) if (inside(mx - x, j)) { g.px(mx, y + j, F[1]); s.E.px(mx, y + j, null); }
    for (let i = 0; i < w; i++) { g.px(x + i, my, F[1]); s.E.px(x + i, my, null); g.px(x + i, my - 1, F[2]); s.E.px(x + i, my - 1, null); }
  }
  if (sill) for (let i = -3; i < w + 3; i++) { g.px(x + i, y + h + 2, F[3]); g.px(x + i, y + h + 3, F[1]); g.px(x + i, y + h + 4, shift(F[0], -0.3)); }
}

/**
 * Cacho de folhas: bolota sombreada com borda recortada (pontas de folha), riscos de folha claros
 * em cima e escuros embaixo. Muito mais "folhagem" que a bolota lisa.
 */
export function leafClump(img, cx, cy, rx, ry, r, { bias = 0, seed = 1 } = {}) {
  const R = rng(seed + Math.round(cx * 31 + cy * 17));
  // pontas de folha na borda (de baixo e dos lados mais)
  const tips = [];
  const n = Math.max(6, Math.round((rx + ry) * 0.9));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + R() * 0.3;
    if (Math.sin(a) < -0.6 && R() < 0.5) continue;
    tips.push([cx + Math.cos(a) * (rx + 1.2), cy + Math.sin(a) * (ry + 1.2), a]);
  }
  for (const [tx, ty, a] of tips) {
    const ex = Math.cos(a), ey = Math.sin(a);
    for (let k = 0; k < 3; k++) img.px(Math.round(tx - ex * k), Math.round(ty - ey * k), pick(r, lightAt(ex * 0.8, ey * 0.8) * 0.85 + bias - 0.1, Math.round(tx), Math.round(ty), 0.3));
  }
  img.ellipse(cx, cy, rx, ry, (x, y, nx, ny) => pick(r, lightAt(nx * 0.9, ny * 0.9) * 0.95 + bias, x, y, 0.65));
  // riscos de folha
  for (let k = 0; k < Math.round(rx * ry * 0.18); k++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 0.8;
    const px = Math.round(cx + Math.cos(a) * d * rx), py = Math.round(cy + Math.sin(a) * d * ry);
    const up = py < cy - ry * 0.1 && px < cx + rx * 0.4;
    const c = up ? shift(r[r.length - 1], 0.25) : r[0];
    img.px(px, py, c);
    img.px(px + (up ? 1 : -1), py + 1, up ? r[r.length - 1] : r[1]);
  }
}

/** Copa de árvore com muitos cachos de folhas, sombra interna embaixo e brilho em cima. */
export function folhagem(img, cx, cy, rx, ry, r, { n = 26, rmin = 5, rmax = 9, seed = 4, bias = 0, lean = 0 } = {}) {
  const R = rng(seed);
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R());
    const br = rmin + R() * (rmax - rmin);
    pts.push([cx + Math.cos(a) * d * (rx - br * 0.5) + lean * (1 - d), cy + Math.sin(a) * d * (ry - br * 0.5), br]);
  }
  // massa escura de fundo (sombra interna)
  img.ellipse(cx, cy + 2, rx * 0.92, ry * 0.88, (x, y) => (hash(x, y, seed) < 0.5 ? r[0] : shift(r[0], -0.2)));
  pts.sort((a, b) => a[1] - b[1]);
  for (const [x, y, br] of pts) {
    const b = bias + (cy - y) / (ry * 3.2) + (cx - x) / (rx * 5) - 0.05;
    leafClump(img, x, y, br, br * 0.82, r, { bias: b, seed });
  }
}

/** Rachadura irregular. */
export function crack(img, x, y, len, c, seed = 1) {
  const R = rng(seed);
  let px = x, py = y;
  for (let k = 0; k < len; k++) {
    img.px(Math.round(px), Math.round(py), c);
    px += (R() - 0.5) * 1.6;
    py += 0.8 + R() * 0.4;
    if (R() < 0.15) img.px(Math.round(px) + 1, Math.round(py), c);
  }
}

/** Escorrido de ferrugem/sujeira descendo (em pixels já pintados). */
export function streak(img, x, y, len, r, seed = 1) {
  const R = rng(seed);
  for (let k = 0; k < len; k++) {
    const c = img.get(x, y + k);
    if (c === null) continue;
    if (R() < 0.85 - k / (len * 1.4)) img.px(x, y + k, _mix(c, r[1 + (k < 2 ? 1 : 0)], 0.55 - k / (len * 2.2)));
  }
}

/** Rebite 2x2 com brilho. */
export function rivet(img, x, y, M) {
  img.px(x, y, M[3]); img.px(x + 1, y, M[2]); img.px(x, y + 1, M[2]); img.px(x + 1, y + 1, M[0]);
}

/** Musgo/sujeira na base de uma área (franja irregular subindo da linha y). */
export function mossBase(img, x, y, w, r, { hmax = 4, seed = 9 } = {}) {
  for (let i = 0; i < w; i++) {
    const h = Math.round(vnoise((x + i) * 0.25, 0, seed) * hmax + hash(x + i, 0, seed) * 1.4);
    for (let k = 0; k < h; k++) if (img.get(x + i, y - k) !== null) img.px(x + i, y - k, pick(r, 0.25 + (k / Math.max(1, h)) * 0.55, x + i, y - k, 0.5));
  }
}

export const AMBAR = [0xfff2b8, 0xffd27a, 0xffb648, 0xf08a2a];
export const CIANO = [0xe8ffff, 0x9ff6ff, 0x3ee6f0, 0x18a8c8];
export const MAGENTA = [0xffd0f4, 0xff7ae0, 0xf03cc8, 0xa8208c];
export { lightAt, outlineOf, shift };
