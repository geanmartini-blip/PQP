/**
 * Camadas de roupa e adereço do artCatalog (outfits.json), desenhadas sobre o esqueleto.
 *
 * Cada chave `arte` tem um desenhista. O boneco é desenhado em fatias de profundidade (Slice):
 * cada camada desenha só o pedaço da fatia corrente (a manga na fatia dos braços, o tronco na
 * fatia do tronco etc.). Assim o braço da frente fica por cima da camisa de lado, e a mochila fica
 * atrás do corpo de frente e por cima de costas.
 *
 * As medidas seguem as descrições do artCatalog (ex.: aba de 22 px, fivela de 12x8 px).
 */
import type { Tone } from './body';
import { drawHand, drawLimb, drawLimbPart } from './body';
import { microText } from './font';
import { C, type Color, hex, light, mix, Pix, shade, withAlpha } from './pixel';
import { along, headSpan, type Limb, type Rig, torsoSpan } from './rig';

export type Slice = 'under' | 'back' | 'farArm' | 'legs' | 'torso' | 'arms' | 'head' | 'front';

export interface LayerCtx {
  pix: Pix;
  rig: Rig;
  /** cores da camada já resolvidas (índices da paleta, pele ou cabelo) */
  cols: Color[];
  text?: string;
  skin: Tone;
  hair: Tone;
  slice: Slice;
  frame: number;
  anim: string;
  side: 'esquerda' | 'direita' | 'neutro';
  /** largura da camada larga (larguraPx), 0 quando não há */
  wide: number;
}

export type Drawer = (c: LayerCtx) => void;

/** Fatias em que cada parte do traje desenha alguma coisa. */
export const PART_SLICES: Record<string, Slice[]> = {
  aura: ['under'],
  veiculo: ['under', 'front'],
  costas: ['back'],
  pernas: ['legs'],
  pes: ['legs'],
  torso: ['farArm', 'torso', 'arms'],
  cintura: ['torso'],
  bracos: ['farArm', 'arms'],
  rosto: ['head'],
  cabeca: ['head'],
  mao_secundaria: ['farArm', 'front'],
  mao_principal: ['front'],
  acompanhante: ['under', 'back', 'front'],
};

// ---------------------------------------------------------------------------
// apoio

const c0 = (c: LayerCtx) => c.cols[0]!;
const c1 = (c: LayerCtx) => c.cols[1] ?? shade(c.cols[0]!, 0.7);
const c2 = (c: LayerCtx) => c.cols[2] ?? light(c.cols[0]!, 0.35);
const dk = (x: Color) => shade(x, 0.72);
const lt = (x: Color) => light(x, 0.25);
const fr = Math.floor;

/** Braços da fatia corrente: [membro, escuro]. */
function armsOf(c: LayerCtx): [Limb, boolean, 'main' | 'off'][] {
  const r = c.rig;
  if (c.slice === 'arms') return r.view === 'side' ? [[r.armMain, false, 'main']] : [[r.armMain, false, 'main'], [r.armOff, false, 'off']];
  if (c.slice === 'farArm' && r.view === 'side') return [[r.armOff, true, 'off']];
  return [];
}

function legsOf(c: LayerCtx): [Limb, boolean][] {
  const r = c.rig;
  return r.view === 'side' ? [[r.legA, true], [r.legB, false]] : [[r.legA, false], [r.legB, false]];
}

function feetOf(c: LayerCtx): [Rig['footA'], boolean][] {
  const r = c.rig;
  return r.view === 'side' ? [[r.footA, true], [r.footB, false]] : [[r.footA, false], [r.footB, false]];
}

/** Mão da mão principal/secundária e se ela fica atrás do corpo. */
function handOf(c: LayerCtx, which: 'main' | 'off'): { x: number; y: number; behind: boolean } {
  const l = which === 'main' ? c.rig.armMain : c.rig.armOff;
  return { x: l.b.x, y: l.b.y, behind: c.rig.view === 'side' && which === 'off' };
}

/** A camada de mão desenha na fatia certa: a mão de trás (de lado) fica atrás do tronco. */
function handSliceOk(c: LayerCtx, which: 'main' | 'off'): boolean {
  if (which === 'off' && c.rig.view === 'side') return c.slice === 'farArm';
  return c.slice === 'front';
}

/** Lado da tela para onde o boneco olha de lado (-1 = esquerda). Na frente, -1 = mão principal. */
const fwd = -1;

// ---------------------------------------------------------------------------
// tronco: camisas, túnicas, vestidos

type Pattern =
  | 'plaid'
  | 'stripesH'
  | 'stripesV'
  | 'faded'
  | 'burlap'
  | 'moss'
  | 'sequin'
  | 'grease'
  | 'geo'
  | 'geoFull'
  | 'pockets'
  | 'pockets14'
  | 'fur'
  | 'tricolor'
  | 'poncho'
  | 'ruffles'
  | 'none';

interface ShirtOpts {
  sleeve?: 'none' | 'short' | 'long' | 'rolled' | 'cap' | 'covering';
  len?: 'default' | 'hip' | 'thigh' | 'knee' | 'floor' | 'drag';
  wide?: number;
  flare?: number;
  open?: number;
  pattern?: Pattern;
  hood?: boolean;
  print?: string;
  trim?: Color;
  /** cor só do tronco (ex.: avental) */
  main?: Color;
  second?: Color;
  third?: Color;
  shoulderOut?: number;
  collar?: Color;
  vneck?: boolean;
  sideSlit?: boolean;
  lapel?: Color;
  cuff?: Color;
}

function shirtBottom(r: Rig, len: ShirtOpts['len']): number {
  switch (len) {
    case 'hip':
      return r.torsoBot;
    case 'thigh':
      return r.torsoBot + 4;
    case 'knee':
      return r.torsoBot + Math.round((r.groundY - r.torsoBot) * 0.55);
    case 'floor':
      return r.groundY - 2;
    case 'drag':
      return r.groundY;
    default:
      return r.torsoBot - 1;
  }
}

function shirtSpans(c: LayerCtx, o: ShirtOpts): Map<number, [number, number]> {
  const r = c.rig;
  const m = new Map<number, [number, number]>();
  const bottom = shirtBottom(r, o.len);
  const wide = o.wide ?? 0;
  const flare = o.flare ?? (o.len === 'floor' || o.len === 'drag' ? 0.45 : 0.22);
  const extraW = c.wide > 32 ? (c.wide - 32) / 2 : 0;
  for (let y = r.torsoTop; y <= bottom; y++) {
    let s = torsoSpan(r, Math.min(y, r.torsoBot));
    if (!s) continue;
    let [l, rr] = s;
    if (y > r.torsoBot) {
      const k = y - r.torsoBot;
      const f = Math.round(k * flare);
      l -= f;
      rr += f;
      if (extraW > 0) {
        const t = Math.min(1, k / Math.max(1, bottom - r.torsoBot));
        const e = Math.round(extraW * Math.sqrt(t));
        l -= e;
        rr += e;
      }
    }
    if (y <= r.torsoTop + 2 && o.shoulderOut) {
      l -= o.shoulderOut;
      rr += o.shoulderOut;
    }
    l -= wide;
    rr += wide;
    m.set(y, [l, rr]);
  }
  return m;
}

function patternColor(p: Pattern, x: number, y: number, base: Color, second: Color, third: Color, c: LayerCtx): Color | undefined {
  switch (p) {
    case 'plaid': {
      const a = (fr(x / 2) + fr(y / 2)) % 2 === 0;
      if (x % 4 === 0 || y % 4 === 0) return dk(a ? base : second);
      return a ? base : second;
    }
    case 'stripesH':
      return y % 2 === 0 ? second : undefined;
    case 'stripesV':
      return x % 2 === 0 ? second : undefined;
    case 'faded':
      return (x * 7 + y * 13) % 11 === 0 ? light(base, 0.35) : undefined;
    case 'burlap':
      return (x + y) % 2 === 0 ? dk(base) : undefined;
    case 'moss':
      return (x * 5 + y * 3) % 7 === 0 ? second : (x * 3 + y * 11) % 13 === 0 ? dk(base) : undefined;
    case 'sequin': {
      const k = (x * 7 + y * 5 + c.frame * 3) % 9;
      return k === 0 ? C.pureWhite : k === 4 ? lt(second) : undefined;
    }
    case 'grease':
      return (x * 11 + y * 7) % 17 === 0 || (x * 11 + y * 7) % 17 === 1 ? hex('#2a241e') : undefined;
    case 'geo':
      return y % 6 === 3 && (x + y) % 2 === 0 ? second : y % 6 === 4 && (x + y) % 2 === 1 ? second : undefined;
    case 'geoFull':
      return (x + y) % 4 === 0 ? second : (x - y + 64) % 4 === 0 ? third : undefined;
    case 'tricolor':
      return undefined;
    case 'poncho':
      return y % 4 === 0 ? second : y % 4 === 1 && x % 2 === 0 ? third : undefined;
    case 'pockets':
    case 'pockets14':
    case 'fur':
    case 'ruffles':
    case 'none':
      return undefined;
  }
}

function shirt(c: LayerCtx, o: ShirtOpts = {}): void {
  const r = c.rig;
  const base = o.main ?? c0(c);
  const second = o.second ?? c1(c);
  const third = o.third ?? c2(c);
  if (c.slice === 'torso') {
    const spans = shirtSpans(c, o);
    const p = o.pattern ?? 'none';
    const top = r.torsoTop;
    for (const [y, [l, rr]] of spans) {
      for (let x = l; x <= rr; x++) {
        let col = base;
        const pc = patternColor(p, x, y, base, second, third, c);
        if (pc !== undefined) col = pc;
        if (x === rr) col = dk(col);
        else if (x === l && y < top + 7 && r.view !== 'back') col = lt(col);
        c.pix.put(x, y, col);
      }
    }
    const bottom = Math.max(...spans.keys());
    const lastSpan = spans.get(bottom);
    if (lastSpan) c.pix.hline(lastSpan[0], lastSpan[1], bottom, o.trim ?? dk(base));
    if (p === 'fur') {
      for (const [y, [l, rr]] of spans) {
        if (y % 2 === 0) {
          c.pix.put(l - 1, y, lt(base));
          c.pix.put(rr + 1, y, base);
        }
      }
      if (lastSpan) for (let x = lastSpan[0]; x <= lastSpan[1]; x += 2) c.pix.put(x, bottom + 1, lt(base));
      if (r.view !== 'back') c.pix.box(r.cx - 3, top - 1, r.cx + 2, top + 1, lt(base));
    }
    if (p === 'ruffles') {
      for (const [y, [l, rr]] of spans)
        if (y > r.torsoBot && (y - r.torsoBot) % 4 === 0) {
          c.pix.hline(l, rr, y, third);
          for (let x = l; x <= rr; x += 3) c.pix.put(x, y + 1, dk(base));
        }
    }
    if (p === 'tricolor' && r.view !== 'back') {
      // faixas verticais
      for (const [y, [l, rr]] of spans) {
        const w = rr - l + 1;
        for (let x = l; x <= rr; x++) {
          const k = fr(((x - l) * 3) / w);
          c.pix.put(x, y, k === 0 ? base : k === 1 ? second : third);
        }
      }
    }
    if ((p === 'pockets' || p === 'pockets14') && r.view !== 'side') {
      const n = p === 'pockets14' ? 7 : 2;
      const pts =
        r.view === 'back' && p === 'pockets14'
          ? [
              [r.cx - 4, top + 3],
              [r.cx + 2, top + 3],
              [r.cx - 4, top + 7],
              [r.cx + 2, top + 7],
            ]
          : [
              [r.cx - 5, top + 3],
              [r.cx + 2, top + 3],
              [r.cx - 5, top + 7],
              [r.cx + 2, top + 7],
              [r.cx - 2, top + 10],
              [r.cx - 6, top + 10],
              [r.cx + 3, top + 10],
            ].slice(0, n === 7 ? 7 : 2);
      for (const [x, y] of pts) {
        c.pix.box(x!, y!, x! + 2, y! + 1, dk(base));
        c.pix.put(x! + 1, y! + 1, p === 'pockets14' && (x! + y!) % 2 ? lt(base) : dk(base));
      }
    }
    if (o.open && r.view === 'front') {
      for (let i = 0; i < o.open; i++) {
        const half = Math.min(3, fr(i / 3) + 1);
        c.pix.hline(r.cx - half, r.cx + half - 1, top + i, i === 0 ? c.skin.shade : c.skin.base);
      }
      c.pix.vline(r.cx - Math.min(3, fr(o.open / 3)) - 1, top, top + o.open - 1, dk(base));
    }
    if (o.vneck && r.view === 'front') {
      c.pix.hline(r.cx - 2, r.cx + 1, top, c.skin.base);
      c.pix.hline(r.cx - 1, r.cx, top + 1, c.skin.base);
    }
    if (o.collar && r.view === 'front') {
      c.pix.put(r.cx - 3, top, o.collar);
      c.pix.put(r.cx - 2, top + 1, o.collar);
      c.pix.put(r.cx + 2, top, o.collar);
      c.pix.put(r.cx + 1, top + 1, o.collar);
    }
    if (o.lapel && r.view === 'front') {
      c.pix.line(r.cx - 2, top, r.cx - 1, top + 6, o.lapel);
      c.pix.line(r.cx + 1, top, r.cx, top + 6, o.lapel);
      c.pix.vline(r.cx - 1, top + 7, r.torsoBot - 2, dk(base));
    }
    if (o.hood) {
      if (r.view === 'back') {
        c.pix.box(r.cx - 4, top, r.cx + 3, top + 3, dk(base));
        c.pix.hline(r.cx - 3, r.cx + 2, top + 4, dk(dk(base)));
      } else if (r.view === 'front') {
        c.pix.hline(r.cx - 4, r.cx + 3, top, dk(base));
        c.pix.put(r.cx - 2, top + 2, lt(base));
        c.pix.put(r.cx + 1, top + 2, lt(base));
      } else c.pix.box(r.cx + 2, top, r.cx + 4, top + 2, dk(base));
    }
    if (o.sideSlit && r.view === 'front') {
      const b = Math.max(...spans.keys());
      const s = spans.get(b);
      if (s) c.pix.vline(s[0] + 1, r.torsoBot + 1, b, dk(base));
    }
    if (o.print && r.view === 'front') microText(c.pix, r.cx - 4, top + 3, 8, 2, o.print, second);
    if (o.print && r.view === 'back') microText(c.pix, r.cx - 4, top + 3, 8, 2, o.print, second);
    return;
  }
  // mangas
  const sl = o.sleeve ?? 'short';
  if (sl === 'none') return;
  for (const [l, dark] of armsOf(c)) {
    const col = dark ? dk(base) : base;
    const t1 = sl === 'short' ? 0.45 : sl === 'cap' ? 0.25 : sl === 'rolled' ? 0.62 : sl === 'covering' ? 1.05 : 0.9;
    drawLimbPart(c.pix, l, 0, t1, col, dk(col));
    if (sl === 'rolled' || o.cuff) {
      const p = along(l, t1);
      c.pix.disk(p.x, p.y, l.w / 2 + 0.4, o.cuff ?? lt(col));
    }
    if (o.pattern === 'plaid' || o.pattern === 'stripesH') {
      const a = along(l, 0.3);
      c.pix.put(fr(a.x), fr(a.y), second);
    }
    if (o.pattern === 'fur') {
      const p = along(l, t1);
      c.pix.disk(p.x, p.y, l.w / 2 + 0.6, lt(base));
    }
  }
}

/** Colete por cima (sem manga). */
function vest(c: LayerCtx, col: Color, opts: { stripes?: Color; openFront?: boolean; down?: number } = {}): void {
  if (c.slice !== 'torso') return;
  const r = c.rig;
  const bottom = r.torsoBot - 1 + (opts.down ?? 0);
  for (let y = r.torsoTop + 1; y <= bottom; y++) {
    const s = torsoSpan(r, Math.min(y, r.torsoBot));
    if (!s) continue;
    for (let x = s[0]; x <= s[1]; x++) {
      if (opts.openFront && r.view === 'front' && x >= r.cx - 1 && x <= r.cx) continue;
      c.pix.put(x, y, x === s[1] ? dk(col) : col);
    }
  }
  if (opts.stripes) {
    for (const yy of [r.torsoTop + 5, r.torsoTop + 9]) {
      const s = torsoSpan(r, yy);
      if (!s) continue;
      for (let x = s[0]; x <= s[1]; x++) {
        if (opts.openFront && r.view === 'front' && x >= r.cx - 1 && x <= r.cx) continue;
        c.pix.put(x, yy, opts.stripes);
      }
    }
  }
}

/** Crachá/placa retangular com letra miúda. */
function plate(pix: Pix, x: number, y: number, w: number, h: number, bg: Color, text: string | undefined, ink: Color): void {
  pix.box(x, y, x + w - 1, y + h - 1, bg);
  pix.frame(x, y, x + w - 1, y + h - 1, dk(bg));
  if (text) microText(pix, x + 1, y + 1, Math.max(1, w - 2), Math.max(1, fr((h - 1) / 2)), text, ink);
}

// ---------------------------------------------------------------------------
// pernas e pés

interface PantsOpts {
  len: number;
  fit?: number;
  skirt?: boolean;
  pattern?: 'stripe' | 'patch' | 'grease' | 'sparkle' | 'kneeLight' | 'pockets' | 'bolt' | 'leds';
  cuff?: Color;
  bunch?: boolean;
  tiedAnkle?: boolean;
  stripe?: Color;
}

function pants(c: LayerCtx, o: PantsOpts): void {
  if (c.slice !== 'legs') return;
  const r = c.rig;
  const base = c0(c);
  const second = c1(c);
  // quadril
  for (let y = r.waistY; y <= r.torsoBot; y++) {
    const s = torsoSpan(r, y);
    if (!s) continue;
    c.pix.hline(s[0], s[1], y, base);
    c.pix.put(s[1], y, dk(base));
  }
  if (o.skirt) {
    const bottom = r.waistY + Math.round((r.groundY - 2 - r.waistY) * o.len);
    for (let y = r.waistY; y <= bottom; y++) {
      const k = y - r.waistY;
      const half = (r.view === 'side' ? 4 : 6) + fr(k * 0.35);
      for (let x = r.cx - half; x < r.cx + half; x++) c.pix.put(x, y, x === r.cx + half - 1 ? dk(base) : (x + y) % 5 === 0 ? dk(base) : base);
    }
    const half = (r.view === 'side' ? 4 : 6) + fr((bottom - r.waistY) * 0.35);
    c.pix.hline(r.cx - half, r.cx + half - 1, bottom, dk(base));
    return;
  }
  for (const [l, dark] of legsOf(c)) {
    const col = dark ? dk(base) : base;
    drawLimbPart(c.pix, l, 0, o.len, col, dk(col), 0.4 + (o.fit ?? 0));
    const end = along(l, Math.min(1, o.len));
    if (o.cuff) c.pix.hline(fr(end.x - 2), fr(end.x + 1), fr(end.y), o.cuff);
    if (o.bunch) {
      c.pix.hline(fr(end.x - 3), fr(end.x + 1), fr(end.y), dk(col));
      c.pix.hline(fr(end.x - 3), fr(end.x + 2), fr(end.y) + 1, col);
    }
    if (o.tiedAnkle) c.pix.hline(fr(end.x - 1), fr(end.x), fr(end.y), second);
    const mid = along(l, Math.min(o.len, 0.6) * 0.75);
    switch (o.pattern) {
      case 'stripe':
        c.pix.capsule(l.a.x - 1.5, l.a.y, along(l, o.len).x - 1.5, along(l, o.len).y - 1, 1, o.stripe ?? second);
        break;
      case 'patch':
        c.pix.box(fr(mid.x) - 1, fr(mid.y), fr(mid.x), fr(mid.y) + 1, second);
        break;
      case 'grease':
        c.pix.put(fr(mid.x), fr(mid.y) - 2, hex('#2a241e'));
        c.pix.put(fr(mid.x) - 1, fr(mid.y) + 2, hex('#2a241e'));
        break;
      case 'sparkle':
        if ((fr(mid.y) + c.frame) % 2 === 0) c.pix.put(fr(mid.x), fr(mid.y), C.pureWhite);
        c.pix.put(fr(mid.x) - 1, fr(mid.y) + 3, second);
        break;
      case 'kneeLight':
        c.pix.box(fr(mid.x) - 1, fr(mid.y), fr(mid.x), fr(mid.y) + 1, light(col, 0.3));
        break;
      case 'pockets':
        c.pix.box(fr(mid.x) - 2, fr(mid.y) - 2, fr(mid.x) - 1, fr(mid.y), dk(col));
        break;
      case 'bolt':
        c.pix.line(fr(mid.x) - 1, fr(mid.y) - 3, fr(mid.x), fr(mid.y), second);
        c.pix.line(fr(mid.x), fr(mid.y), fr(mid.x) - 1, fr(mid.y) + 3, second);
        break;
      default:
        break;
    }
  }
}

type ShoeKind = 'flipflop' | 'sandal' | 'boot' | 'tallboot' | 'sneaker' | 'shoe' | 'heel' | 'slide' | 'platform' | 'slipper' | 'stone' | 'socksFlip' | 'cowboy';

function shoes(c: LayerCtx, kind: ShoeKind, extra?: (f: Rig['footA'], dark: boolean) => void): void {
  if (c.slice !== 'legs') return;
  const base = c0(c);
  const second = c1(c);
  const r = c.rig;
  for (const [f, dark] of feetOf(c)) {
    const col = dark ? dk(base) : base;
    const sec = dark ? dk(second) : second;
    const { x0, x1, y0, y1 } = f;
    switch (kind) {
      case 'flipflop':
      case 'slide':
      case 'socksFlip':
        if (kind === 'socksFlip') c.pix.box(x0 + 1, y0 - 3, x1 - 1, y1 - 1, sec);
        else c.pix.box(x0, y0 + 1, x1, y1 - 1, dark ? c.skin.shade : c.skin.base);
        c.pix.hline(x0, x1, y1, col);
        if (kind === 'slide') c.pix.hline(x0, x1, y1 - 1, col);
        else c.pix.put(fr((x0 + x1) / 2), y1 - 1, col);
        break;
      case 'sandal':
        c.pix.box(x0, y0 + 1, x1, y1 - 1, dark ? c.skin.shade : c.skin.base);
        c.pix.hline(x0, x1, y1, col);
        c.pix.line(x0, y0 + 1, x1, y1 - 1, col);
        break;
      case 'stone':
        c.pix.box(x0, y0, x1, y1 - 2, dark ? c.skin.shade : c.skin.base);
        c.pix.box(x0 - 1, y1 - 1, x1 + 1, y1, hex('#8a8478'));
        c.pix.put(x0 + 1, y1 - 1, hex('#a8a296'));
        c.pix.line(x0, y0, x1, y0 + 1, hex('#4e7a2e'));
        break;
      case 'boot':
      case 'tallboot':
      case 'cowboy': {
        const up = kind === 'tallboot' ? 4 : kind === 'cowboy' ? 3 : 1;
        c.pix.box(x0 + (r.view === 'side' ? 2 : 1), y0 - up, x1 - (r.view === 'side' ? 0 : 1), y0, col);
        c.pix.box(x0, y0, x1, y1, col);
        c.pix.hline(x0, x1, y1, dk(col));
        c.pix.put(r.view === 'side' ? x0 : x0 + 1, y0, lt(col));
        if (kind === 'cowboy' && r.view === 'side') c.pix.put(x0 - 1, y0, col);
        if (kind === 'cowboy') c.pix.put(r.view === 'side' ? x1 : x1 - 1, y1, sec);
        break;
      }
      case 'sneaker':
      case 'platform':
        c.pix.box(x0, y0, x1, y1 - (kind === 'platform' ? 1 : 0), col);
        c.pix.hline(x0, x1, y1, kind === 'platform' ? sec : C.white);
        if (kind === 'platform') c.pix.hline(x0, x1, y1 - 1, sec);
        c.pix.put(fr((x0 + x1) / 2), y0, lt(col));
        break;
      case 'shoe':
        c.pix.box(x0, y0 + 1, x1, y1, col);
        c.pix.hline(x0, x1, y1, dk(col));
        c.pix.put(r.view === 'side' ? x0 : fr((x0 + x1) / 2), y0 + 1, lt(col));
        break;
      case 'heel':
        c.pix.box(x0 + 1, y0 + 1, x1 - 1, y1 - 1, col);
        c.pix.put(r.view === 'side' ? x1 : x0 + 1, y1, col);
        break;
      case 'slipper':
        c.pix.box(x0, y0, x1, y1, col);
        c.pix.hline(x0, x1, y0, lt(col));
        break;
    }
    extra?.(f, dark);
  }
}

// ---------------------------------------------------------------------------
// cabeça: chapéus, capacetes, máscaras

interface BrimOpts {
  brim: number;
  crownW: number;
  crownH: number;
  /** linha da aba a partir do topo da cabeça */
  at?: number;
  band?: Color;
  upturn?: boolean;
  dented?: boolean;
  tilt?: number;
  round?: boolean;
  thickBrim?: boolean;
}

function brimHat(c: LayerCtx, o: BrimOpts, base = c0(c)): void {
  if (c.slice !== 'head') return;
  const r = c.rig;
  const pix = c.pix;
  const cx = r.cx + Math.round(r.pose.headTilt) + (o.tilt ?? 0);
  const y = r.headTop + (o.at ?? 3);
  const band = o.band ?? c1(c);
  const half = o.brim / 2;
  const view = r.view;
  // copa
  const cw = o.crownW / 2;
  const cxo = view === 'side' ? cx + 1 : cx;
  for (let k = 1; k <= o.crownH; k++) {
    const yy = y - k;
    let shrink = 0;
    if (o.round) shrink = k >= o.crownH - 1 ? 2 : k >= o.crownH - 2 ? 1 : 0;
    else shrink = k === o.crownH ? 1 : 0;
    pix.hline(fr(cxo - cw + shrink), fr(cxo + cw - 1 - shrink), yy, base);
    pix.put(fr(cxo + cw - 1 - shrink), yy, dk(base));
    pix.put(fr(cxo - cw + shrink), yy, lt(base));
  }
  if (o.dented) pix.hline(fr(cxo - 1), fr(cxo), y - o.crownH, dk(base));
  // faixa
  pix.hline(fr(cxo - cw), fr(cxo + cw - 1), y - 1, band);
  // aba
  const bl = view === 'side' ? fr(cx - half - 2) : fr(cx - half);
  const br = view === 'side' ? fr(cx + half - 3) : fr(cx + half - 1);
  pix.hline(bl, br, y, base);
  pix.hline(bl + 1, br - 1, y + 1, o.thickBrim ? base : dk(base));
  pix.put(br, y, dk(base));
  if (o.upturn) {
    pix.put(bl, y - 1, base);
    pix.put(br, y - 1, base);
    pix.put(bl, y - 2, lt(base));
    pix.put(br, y - 2, dk(base));
  }
}

function capHat(c: LayerCtx, opts: { backwards?: boolean; brimLen?: number; base?: Color; front?: Color } = {}): void {
  if (c.slice !== 'head') return;
  const r = c.rig;
  const base = opts.base ?? c0(c);
  const top = r.headTop;
  for (let y = top - 1; y <= top + 4; y++) {
    const s = headSpan(r, Math.max(y, top));
    if (!s) continue;
    const k = y < top ? 3 : 0;
    c.pix.hline(s[0] + k, s[1] - k, y, base);
    c.pix.put(s[1] - k, y, dk(base));
  }
  c.pix.put(r.cx, top - 1, opts.front ?? lt(base));
  const len = opts.brimLen ?? 4;
  const brim = dk(base);
  if (r.view === 'side') {
    if (opts.backwards) c.pix.hline(r.headR - 1, r.headR + 3, top + 4, brim);
    else c.pix.hline(r.headL - len, r.headL + 3, top + 4, brim);
  } else if (r.view === 'front') {
    if (opts.backwards) c.pix.hline(r.cx - 2, r.cx + 1, top - 1, brim);
    else c.pix.hline(r.headL, r.headR, top + 5, brim);
  } else {
    if (opts.backwards) c.pix.hline(r.cx - 3, r.cx + 2, top + 5, brim);
  }
}

/** Calota justa (capacete, gorro, máscara de cobrir a cabeça). */
function dome(c: LayerCtx, rows: number, col: Color, opts: { up?: number; rim?: Color } = {}): void {
  const r = c.rig;
  const up = opts.up ?? 1;
  for (let y = r.headTop - up; y <= r.headTop + rows; y++) {
    const s = headSpan(r, Math.max(y, r.headTop));
    if (!s) continue;
    const k = y < r.headTop ? (r.headTop - y) * 2 + 1 : 0;
    if (s[0] + k > s[1] - k) continue;
    c.pix.hline(s[0] + k - (y >= r.headTop ? 1 : 0), s[1] - k + (y >= r.headTop ? 1 : 0), y, col);
    c.pix.put(s[1] - k + (y >= r.headTop ? 1 : 0), y, dk(col));
  }
  if (opts.rim) {
    const s = headSpan(r, r.headTop + rows);
    if (s) c.pix.hline(s[0] - 1, s[1] + 1, r.headTop + rows, opts.rim);
  }
  c.pix.put(r.headL + 4, r.headTop - up + 1, lt(col));
}

function horns(c: LayerCtx, big: boolean, col: Color): void {
  const r = c.rig;
  const y = r.headTop + 1;
  const h = big ? 6 : 3;
  const pts: [number, number][] =
    r.view === 'side'
      ? [[r.cx + 1, -1]]
      : [
          [r.headL + 1, -1],
          [r.headR - 1, 1],
        ];
  for (const [x, dir] of pts) {
    for (let i = 0; i < h; i++) {
      const xx = x + (big ? Math.round(dir * (i < 3 ? -i * 0.7 : -2 + (i - 3) * 0.8) * -1) : 0);
      c.pix.put(xx, y - i, i === h - 1 ? lt(col) : col);
      c.pix.put(xx + (dir > 0 ? 1 : -1) * (i < 2 ? 1 : 0), y - i, dk(col));
    }
  }
}

/** Cobre a cabeça inteira (máscara de luchador, lenço), deixando olhos e boca. */
function fullMask(c: LayerCtx, col: Color, opts: { eyeRim?: Color; mouth?: boolean; chin?: boolean } = {}): void {
  const r = c.rig;
  const cx = r.cx + Math.round(r.pose.headTilt);
  for (let y = r.headTop - 1; y <= r.headBot; y++) {
    const s = headSpan(r, Math.max(y, r.headTop));
    if (!s) continue;
    const k = y < r.headTop ? 3 : 0;
    for (let x = s[0] + k; x <= s[1] - k; x++) {
      if (r.view !== 'back') {
        const eyeZone = y >= r.eyeY - 1 && y <= r.eyeY + 2;
        const mouthZone = opts.mouth !== false && y >= r.mouthY - 1 && y <= r.mouthY + 1;
        if (r.view === 'front') {
          if (eyeZone && ((x >= cx - 6 && x <= cx - 3) || (x >= cx + 2 && x <= cx + 5))) continue;
          if (mouthZone && x >= cx - 3 && x <= cx + 2) continue;
        } else {
          if (eyeZone && x >= r.headL + 1 && x <= r.headL + 5) continue;
          if (mouthZone && x <= r.headL + 3) continue;
        }
      }
      c.pix.put(x, y, x === s[1] - k ? dk(col) : col);
    }
  }
  if (opts.eyeRim && r.view === 'front') {
    c.pix.frame(cx - 7, r.eyeY - 2, cx - 2, r.eyeY + 3, opts.eyeRim);
    c.pix.frame(cx + 1, r.eyeY - 2, cx + 6, r.eyeY + 3, opts.eyeRim);
  }
}

// ---------------------------------------------------------------------------
// rosto

function glasses(c: LayerCtx, kind: 'round' | 'crooked' | 'dark' | 'weld' | 'lab', col: Color, lens?: Color): void {
  if (c.slice !== 'head' || c.rig.view === 'back') {
    if (c.slice === 'head' && c.rig.view === 'back' && (kind === 'weld' || kind === 'lab')) {
      const r = c.rig;
      c.pix.hline(r.headL - 1, r.headR + 1, r.eyeY, dk(col));
    }
    return;
  }
  const r = c.rig;
  const cx = r.cx + Math.round(r.pose.headTilt);
  const ey = r.eyeY;
  if (r.view === 'side') {
    const x = r.headL + 2;
    if (kind === 'dark') c.pix.box(x - 1, ey, x + 2, ey + 1, col);
    else if (kind === 'weld' || kind === 'lab') {
      c.pix.box(x - 1, ey - 1, x + 2, ey + 2, col);
      if (lens) c.pix.box(x, ey, x + 1, ey + 1, lens);
    } else c.pix.frame(x - 1, ey - 1, x + 1, ey + 1, col);
    c.pix.hline(x + 2, cx + 2, ey - (kind === 'dark' ? 0 : 1), dk(col));
    return;
  }
  const lx = cx - 4;
  const rx = cx + 3;
  switch (kind) {
    case 'crooked':
      c.pix.frame(lx - 2, ey - 1, lx + 1, ey + 2, col);
      c.pix.frame(rx - 1, ey - 2, rx + 2, ey + 1, col);
      c.pix.hline(lx + 2, rx - 2, ey - 1, col);
      break;
    case 'round':
      c.pix.frame(lx - 2, ey - 1, lx + 1, ey + 2, col);
      c.pix.frame(rx - 1, ey - 1, rx + 2, ey + 2, col);
      c.pix.hline(lx + 2, rx - 2, ey, col);
      break;
    case 'dark':
      c.pix.box(lx - 2, ey, rx + 2, ey + 1, col);
      c.pix.put(lx - 1, ey, C.pureWhite);
      c.pix.put(rx + 1, ey, light(col, 0.4));
      break;
    case 'weld':
    case 'lab':
      c.pix.box(lx - 2, ey - 1, lx + 1, ey + 2, col);
      c.pix.box(rx - 1, ey - 1, rx + 2, ey + 2, col);
      c.pix.box(lx - 1, ey, lx, ey + 1, lens ?? hex('#1a1a1a'));
      c.pix.box(rx, ey, rx + 1, ey + 1, lens ?? hex('#1a1a1a'));
      if (kind === 'lab') {
        c.pix.put(lx - 1, ey, C.pureWhite);
        c.pix.put(rx, ey, C.pureWhite);
      }
      c.pix.hline(r.headL - 1, lx - 3, ey, dk(col));
      c.pix.hline(rx + 3, r.headR + 1, ey, dk(col));
      c.pix.hline(lx + 2, rx - 2, ey, col);
      break;
  }
}

function headsetBand(c: LayerCtx, col: Color, mic: Color, opts: { bothCups?: boolean; bigCups?: boolean; light?: boolean; noMic?: boolean } = {}): void {
  if (c.slice !== 'head') return;
  const r = c.rig;
  const top = r.headTop;
  const ey = r.eyeY;
  if (r.view === 'side') {
    c.pix.vline(r.cx + 1, top - 1, ey, col);
    c.pix.box(r.cx, ey, r.cx + 2 + (opts.bigCups ? 1 : 0), ey + (opts.bigCups ? 4 : 2), col);
    if (!opts.noMic) c.pix.line(r.cx, ey + 2, r.headL + 1, r.mouthY, mic);
    if (opts.light) c.pix.put(r.headL + 1, r.mouthY, C.red);
    return;
  }
  c.pix.hline(r.headL + 1, r.headR - 1, top - 1, col);
  const cupH = opts.bigCups ? 5 : 3;
  const cupW = opts.bigCups ? 3 : 2;
  c.pix.box(r.headL - cupW + 1, ey, r.headL, ey + cupH - 1, col);
  if (opts.bothCups || opts.bigCups) c.pix.box(r.headR, ey, r.headR + cupW - 1, ey + cupH - 1, col);
  c.pix.vline(r.headL - cupW + 1, top, ey, col);
  if (opts.bothCups || opts.bigCups) c.pix.vline(r.headR + cupW - 1, top, ey, col);
  if (!opts.noMic && r.view === 'front') {
    c.pix.line(r.headL, ey + cupH - 1, r.cx - 3, r.mouthY, mic);
    c.pix.put(r.cx - 3, r.mouthY, lt(mic));
    if (opts.light) c.pix.put(r.headL - 1, ey + 1, C.neonGreen);
  }
}

// ---------------------------------------------------------------------------
// braços, mãos, costas, cintura

function armBand(c: LayerCtx, which: 'main' | 'off', t0: number, t1: number, col: Color): void {
  for (const [l, dark, w] of armsOf(c)) if (w === which) drawLimbPart(c.pix, l, t0, t1, dark ? dk(col) : col, undefined, 0.8);
}

function armMark(c: LayerCtx, which: 'main' | 'off' | 'both', t: number, draw: (x: number, y: number, dark: boolean) => void): void {
  for (const [l, dark, w] of armsOf(c)) {
    if (which !== 'both' && w !== which) continue;
    const p = along(l, t);
    draw(fr(p.x), fr(p.y), dark);
  }
}

/** Redesenha os braços inteiros (braço gigante, braço cromado). */
function redrawArm(c: LayerCtx, which: 'main' | 'off' | 'both', col: Tone, extraW: number): void {
  for (const [l, dark, w] of armsOf(c)) {
    if (which !== 'both' && w !== which) continue;
    const big: Limb = { a: l.a, b: l.b, w: l.w + extraW };
    drawLimb(c.pix, big, col, dark);
    drawHand(c.pix, big, col, dark);
  }
}

function belt(c: LayerCtx, col: Color, h = 1): void {
  if (c.slice !== 'torso') return;
  const r = c.rig;
  for (let y = r.waistY; y < r.waistY + h; y++) {
    const s = torsoSpan(r, Math.min(y, r.torsoBot));
    if (s) c.pix.hline(s[0], s[1], y, y === r.waistY ? col : dk(col));
  }
}

/** Ponto de apoio na cintura: na frente, ao lado; de lado, no meio. */
function waistSpot(r: Rig, side: 'front' | 'left' | 'right'): { x: number; y: number } | null {
  if (r.view === 'back' && side === 'front') return null;
  if (side === 'front') return { x: r.view === 'side' ? r.torsoL + 1 : r.cx, y: r.waistY };
  if (side === 'left') return { x: r.view === 'side' ? r.cx : r.torsoL, y: r.waistY };
  return { x: r.view === 'side' ? r.cx + 2 : r.torsoR - 1, y: r.waistY };
}

/** Desenha algo nas costas: de costas, por cima de tudo; de frente/lado, as bordas aparecem atrás. */
function backArea(r: Rig): { x0: number; x1: number; y0: number; y1: number } {
  if (r.view === 'side') return { x0: r.torsoR - 1, x1: r.torsoR + 2, y0: r.torsoTop + 1, y1: r.torsoBot - 2 };
  return { x0: r.torsoL + 1, x1: r.torsoR - 1, y0: r.torsoTop + 1, y1: r.torsoBot - 2 };
}

function backPrint(c: LayerCtx, col: Color, opts: { patch?: Color; sticker?: boolean; peel?: boolean } = {}): void {
  if (c.slice !== 'back' || c.rig.view !== 'back') return;
  const a = backArea(c.rig);
  const w = a.x1 - a.x0 - 1;
  if (opts.patch !== undefined) {
    c.pix.box(a.x0 + 1, a.y0 + 2, a.x1 - 1, a.y0 + 7, opts.patch);
    c.pix.frame(a.x0 + 1, a.y0 + 2, a.x1 - 1, a.y0 + 7, dk(opts.patch));
  }
  if (opts.sticker) {
    c.pix.box(a.x0 + 1, a.y0 + 3, a.x1 - 2, a.y0 + 7, col);
    if (opts.peel) {
      c.pix.put(a.x1 - 2, a.y0 + 3, C.white);
      c.pix.put(a.x1 - 1, a.y0 + 2, C.white);
    }
    microText(c.pix, a.x0 + 2, a.y0 + 4, w - 3, 2, c.text ?? 'XXXX', dk(dk(col)));
    return;
  }
  microText(c.pix, a.x0 + 2, a.y0 + 3, w - 1, 3, c.text ?? 'XXXX', col);
}

function heldStick(c: LayerCtx, len: number, col: Color, which: 'main' | 'off' = 'main', lean = 0): { tx: number; ty: number; bx: number; by: number } | null {
  if (!handSliceOk(c, which)) return null;
  const h = handOf(c, which);
  const swing = c.anim === 'basico' ? [0, -4, 2][c.frame] ?? 0 : 0;
  const lx = (c.rig.view === 'side' ? -2 : which === 'main' ? -1 : 1) * (lean + (c.anim === 'basico' ? Math.abs(swing) / 2 : 0));
  const tx = h.x + lx;
  const ty = h.y - len * 0.75 + (c.anim === 'basico' && c.frame === 1 ? 3 : 0);
  const bx = h.x - lx * 0.3;
  const by = h.y + len * 0.25;
  c.pix.line(bx, by, tx, ty, col);
  return { tx, ty, bx, by };
}

function heldBox(c: LayerCtx, which: 'main' | 'off', w: number, h: number, col: Color, draw?: (x: number, y: number) => void): void {
  if (!handSliceOk(c, which)) return;
  const p = handOf(c, which);
  const x = fr(p.x - w / 2);
  const y = fr(p.y - h / 2);
  c.pix.box(x, y, x + w - 1, y + h - 1, col);
  c.pix.put(x + w - 1, y + h - 1, dk(col));
  c.pix.hline(x, x + w - 1, y + h - 1, dk(col));
  draw?.(x, y);
}

/** Algo flutuando ao lado (acompanhante): devolve o canto (x, y) ou null na fatia errada. */
function floatSpot(c: LayerCtx, w: number, h: number, where: 'shoulder' | 'side' | 'ground' | 'other', layerSlice: Slice = 'front'): { x: number; y: number } | null {
  if (c.slice !== layerSlice) return null;
  const r = c.rig;
  const bob = c.anim === 'andando' ? (c.frame % 2) : c.frame % 2;
  let x: number;
  let y: number;
  const rightX = Math.min(r.W - w - 1, r.torsoR + 3);
  const leftX = Math.max(1, r.torsoL - w - 3);
  if (where === 'ground') {
    x = r.view === 'back' ? leftX : rightX;
    if (r.view === 'side') x = Math.min(r.W - w - 1, r.cx + 4);
    y = r.groundY - h + 1;
  } else if (where === 'shoulder') {
    x = r.view === 'back' ? leftX + 1 : rightX;
    if (r.view === 'side') x = Math.min(r.W - w - 1, r.cx + 4);
    y = r.headTop + 6 - bob;
  } else if (where === 'other') {
    x = r.view === 'back' ? rightX : leftX;
    if (r.view === 'side') x = Math.max(1, r.headL - w - 1);
    y = r.headTop + 6 - ((c.frame + 1) % 2);
  } else {
    x = r.view === 'back' ? leftX : rightX;
    if (r.view === 'side') x = Math.min(r.W - w - 1, r.cx + 5);
    y = r.torsoTop - bob;
  }
  return { x: fr(x), y: fr(y) };
}

// ---------------------------------------------------------------------------
// desenhos próprios de adereço (pequenas figuras)

function drawPony(pix: Pix, x: number, y: number, col: Color, sad: boolean, flip: boolean, frame: number): void {
  // 14x12: corpo, pescoço, cabeça, crina e 4 patas
  const P = new Pix(14, 12);
  const body = col;
  const dark = dk(col);
  P.box(3, 4, 11, 8, body);
  P.box(1, 1, 4, 5, body); // cabeça e pescoço
  P.box(0, 3, 1, 4, body); // focinho
  P.vline(5, 1, 5, light(col, 0.4)); // crina
  P.vline(12, 4, 7, light(col, 0.4)); // rabo
  const step = frame % 2;
  for (const lx of [4, 6, 9, 11]) P.vline(lx, 9, 11 - ((lx + step) % 2), dark);
  P.set(2, 2, C.eye);
  if (sad) {
    P.set(1, 2, dark);
    P.set(3, 1, dark);
    P.set(4, 0, body);
  } else {
    P.set(3, 0, body);
    P.set(4, 0, body);
  }
  pix.blit(P, x, y, { flipX: flip });
}

function drawSpeaker(pix: Pix, x: number, y: number, body: Color, accent: Color, frame: number): void {
  pix.box(x, y + 1, x + 4, y + 6, body);
  pix.frame(x, y + 1, x + 4, y + 6, dk(body));
  pix.disk(x + 2.5, y + 4.5, 1.3, dk(dk(body)));
  pix.put(x + 2, y + 2, accent);
  // hélice
  pix.hline(x + (frame % 2), x + 3 + (frame % 2), y, light(body, 0.5));
}

function drawTinyPerson(pix: Pix, x: number, y: number, col: Color, skin: Color): void {
  pix.box(x, y, x + 1, y + 1, skin);
  pix.box(x - 1, y + 2, x + 2, y + 4, col);
  pix.put(x, y + 5, dk(col));
  pix.put(x + 1, y + 5, dk(col));
}

function drawDrone(pix: Pix, x: number, y: number, col: Color, rec: boolean, frame: number): void {
  pix.box(x + 1, y + 1, x + 3, y + 2, col);
  pix.hline(x - (frame % 2), x + 4 + (frame % 2), y, light(col, 0.4));
  pix.put(x + 2, y + 2, dk(dk(col)));
  if (rec) pix.put(x + 3, y + 1, C.red);
}

function drawFridge(pix: Pix, x: number, y: number, w: number, h: number, col: Color, tape: Color, frame: number, skate: boolean): void {
  pix.box(x, y, x + w - 1, y + h - 1, col);
  pix.frame(x, y, x + w - 1, y + h - 1, dk(col));
  pix.hline(x + 1, x + w - 2, y + fr(h * 0.4), dk(col));
  pix.vline(x + w - 2, y + 2, y + 4, C.metalDark); // puxador
  pix.line(x, y + 3, x + w - 1, y + h - 3, tape); // fita prata
  pix.put(x + 2, y + h - 3, C.red); // lacre
  if (skate) {
    pix.hline(x - 1, x + w, y + h, C.woodDark);
    pix.put(x, y + h + 1, C.ink);
    pix.put(x + w - 1, y + h + 1, C.ink);
    // ventilador na cabeça
    pix.hline(x + 2 - (frame % 2), x + w - 3 + (frame % 2), y - 1, C.metal);
  } else {
    // braços de cabide
    pix.line(x - 1, y + 3, x - 3, y + 1, C.metal);
    pix.line(x + w, y + 3, x + w + 2, y + 1, C.metal);
  }
  pix.put(x + 2, y + 2, C.neonCyan);
}

/** Touro-espírito translúcido bufando atrás (Wesley; adorno raro do Peão Brabo). */
export function drawSpiritBull(pix: Pix, r: Rig, frame: number): void {
  const g = withAlpha(hex('#7ad86a'), 120);
  const gl = withAlpha(hex('#c8ffb8'), 150);
  const y = r.torsoTop - 6;
  const cx = r.cx;
  // cabeça grande atrás do boneco, com chifres que saem dos lados
  pix.ellipse(cx, y + 9, 12, 8, g);
  pix.ellipse(cx, y + 15, 6, 4, g);
  pix.capsule(cx - 11, y + 4, cx - 15, y - 1, 2.5, gl);
  pix.capsule(cx + 10, y + 4, cx + 14, y - 1, 2.5, gl);
  pix.set(cx - 6, y + 8, gl);
  pix.set(cx + 5, y + 8, gl);
  // bufada
  const f = frame % 3;
  pix.put(cx - 4 - f, y + 17 + f, gl);
  pix.put(cx + 3 + f, y + 17 + f, gl);
}

/** Palco holográfico sob os pés (Li Wei). */
export function drawHoloStage(pix: Pix, r: Rig, frame: number, col: Color): void {
  const a = withAlpha(col, 90);
  const b = withAlpha(light(col, 0.5), 160);
  pix.ellipse(r.cx, r.groundY - 1, 15, 3.5, a);
  pix.ring(r.cx, r.groundY - 1, 15, 3.5, 1, b);
  for (let i = 0; i < 5; i++) {
    const x = r.cx - 12 + i * 6;
    if ((i + frame) % 2 === 0) pix.vline(x, r.groundY - 4, r.groundY - 2, b);
  }
}

// ---------------------------------------------------------------------------
// catálogo: arte -> desenhista

const T = (o: ShirtOpts): Drawer => (c) => shirt(c, o);
const Pn = (o: PantsOpts): Drawer => (c) => pants(c, o);
const S = (k: ShoeKind): Drawer => (c) => shoes(c, k);

export const ART: Record<string, Drawer> = {
  // ---------------- cabeça
  chapeu_coco: (c) => brimHat(c, { brim: 16, crownW: 12, crownH: 5, at: 3, round: true }),
  chapeu_peao: (c) => brimHat(c, { brim: 22, crownW: 12, crownH: 6, at: 3, dented: true }),
  chapeu_peao_gigante: (c) => brimHat(c, { brim: 40, crownW: 16, crownH: 9, at: 6, dented: true, thickBrim: true, band: c1(c) }),
  coque_iogue: (c) => {
    if (c.slice !== 'head') return;
    dome(c, 3, c0(c), { up: 0 });
    const r = c.rig;
    const bx = r.view === 'side' ? r.cx + 3 : r.cx;
    c.pix.disk(bx, r.headTop - 2, 3, c0(c));
    c.pix.put(bx - 1, r.headTop - 3, lt(c0(c)));
    if (r.view !== 'front') c.pix.hline(r.headL + 2, r.headR - 2, r.headTop + 6, dk(c0(c)));
  },
  medidor_calma: (c) => {
    if (c.slice !== 'head') return;
    const r = c.rig;
    const y = r.headTop - 5;
    const x = r.cx - 6;
    const anger = r.pose.expression === 'briga' ? 1 : r.pose.expression === 'derrota' ? 0.7 : 0.2;
    for (let i = 0; i < 12; i++) c.pix.put(x + i, y + 1, mix(hex('#4ac84a'), hex('#e83a2a'), i / 11));
    c.pix.frame(x - 1, y, x + 12, y + 2, C.ink);
    c.pix.vline(x + Math.round(anger * 11), y - 1, y + 3, C.pureWhite);
  },
  boina_revolucionaria: (c) => {
    if (c.slice !== 'head') return;
    const r = c.rig;
    const col = c0(c);
    const tilt = r.view === 'back' ? 1 : -1;
    c.pix.ellipse(r.cx + tilt * 2, r.headTop + 1, 8.5, 2.6, col);
    c.pix.hline(r.headL, r.headR, r.headTop + 2, dk(col));
    c.pix.vline(r.cx + tilt * 2, r.headTop - 3, r.headTop - 2, col);
  },
  lenco_florido: (c) => {
    if (c.slice !== 'head') return;
    const r = c.rig;
    const col = c0(c);
    for (let y = r.headTop - 1; y <= r.headBot; y++) {
      const s = headSpan(r, Math.max(y, r.headTop));
      if (!s) continue;
      if (r.view === 'back') c.pix.hline(s[0] - 1, s[1] + 1, y, (y * 3) % 7 === 0 ? c1(c) : col);
      else if (y < r.eyeY - 1) c.pix.hline(s[0] - 1, s[1] + 1, y, col);
      else if (r.view === 'front') {
        c.pix.hline(s[0] - 1, s[0] + 1, y, col);
        c.pix.hline(s[1] - 1, s[1] + 1, y, dk(col));
      } else c.pix.hline(r.cx, s[1] + 1, y, col);
    }
    // flores
    for (const [dx, dy] of [
      [-5, 1],
      [0, -1],
      [4, 2],
      [-2, 3],
      [6, 0],
    ])
      c.pix.put(r.cx + dx!, r.headTop + dy!, c1(c));
    if (r.view === 'front') {
      c.pix.box(r.cx - 1, r.headBot + 1, r.cx, r.headBot + 2, dk(col)); // nó sob o queixo
    }
  },
  chapeu_pele_pontudo: (c) => {
    if (c.slice !== 'head') return;
    const r = c.rig;
    const col = c0(c);
    const fur = c1(c);
    c.pix.poly(
      [
        [r.cx - 6, r.headTop + 1],
        [r.cx + 1, r.headTop - 9],
        [r.cx + 3, r.headTop - 8],
        [r.cx + 6, r.headTop + 1],
      ],
      col,
    );
    for (let x = r.headL - 1; x <= r.headR + 1; x++) {
      c.pix.put(x, r.headTop + 1, fur);
      c.pix.put(x, r.headTop + 2, (x % 2 ? fur : lt(fur)));
      c.pix.put(x, r.headTop + 3, x % 2 ? dk(fur) : fur);
    }
  },
  chapeu_safari: (c) => brimHat(c, { brim: 20, crownW: 12, crownH: 4, at: 3, round: true }),
  chapeu_safari_dentes: (c) => {
    brimHat(c, { brim: 20, crownW: 12, crownH: 4, at: 3, round: true, band: hex('#3a2e22') });
    if (c.slice !== 'head') return;
    const r = c.rig;
    for (let i = 0; i < 5; i++) {
      c.pix.put(r.cx - 5 + i * 2 + (r.view === 'side' ? 1 : 0), r.headTop + 2, C.white);
      c.pix.put(r.cx - 5 + i * 2 + (r.view === 'side' ? 1 : 0), r.headTop + 3, C.white);
    }
    c.pix.set(r.cx + 8, r.headTop + 3, 0); // mordida na aba
    c.pix.set(r.cx + 9, r.headTop + 3, 0);
  },
  capacete_chifres_simples: (c) => {
    if (c.slice !== 'head') return;
    dome(c, 4, c0(c), { rim: dk(c0(c)) });
    horns(c, false, c1(c));
  },
  capacete_chifres_replica: (c) => {
    if (c.slice !== 'head') return;
    dome(c, 4, c0(c), { rim: dk(c0(c)) });
    horns(c, true, c1(c));
    const r = c.rig;
    if (r.view !== 'side') {
      c.pix.vline(r.headR, r.headTop - 4, r.headTop - 2, C.ink);
      c.pix.box(r.headR, r.headTop - 2, r.headR + 2, r.headTop, C.paper); // etiqueta RÉPLICA
    }
  },
  trancas_laterais: (c) => {
    if (c.slice !== 'head') return;
    const r = c.rig;
    const col = c0(c);
    const xs = r.view === 'side' ? [r.cx + 2] : [r.headL - 1, r.headR];
    for (const x of xs)
      for (let y = r.headTop + 4; y <= r.torsoTop + 3; y++) {
        c.pix.put(x, y, y % 3 === 0 ? dk(col) : col);
        c.pix.put(x + 1, y, y % 3 === 1 ? dk(col) : col);
      }
  },
  chapeu_aba: (c) => brimHat(c, { brim: 18, crownW: 12, crownH: 3, at: 3 }),
  chapeu_aba_alta: (c) => {
    brimHat(c, { brim: 18, crownW: 12, crownH: 8, at: 3, band: c1(c) });
    if (c.slice === 'head') c.pix.box(c.rig.cx + 4, c.rig.headTop - 2, c.rig.cx + 5, c.rig.headTop - 1, c1(c)); // pompom
  },
  mascara_luchador_simples: (c) => {
    if (c.slice !== 'head') return;
    fullMask(c, c0(c), { eyeRim: c1(c) });
  },
  mascara_luchador_raio: (c) => {
    if (c.slice !== 'head') return;
    fullMask(c, c0(c), { eyeRim: c1(c) });
    const r = c.rig;
    if (r.view !== 'back') {
      const x = r.view === 'side' ? r.headL + 4 : r.cx;
      c.pix.line(x + 1, r.headTop, x - 1, r.headTop + 3, c1(c));
      c.pix.line(x - 1, r.headTop + 3, x + 1, r.headTop + 3, c1(c));
      c.pix.line(x + 1, r.headTop + 3, x - 1, r.headTop + 6, c1(c));
    } else {
      // amarração de trás
      c.pix.vline(r.cx, r.headTop + 6, r.headBot - 2, c1(c));
      for (let y = r.headTop + 7; y < r.headBot - 2; y += 2) c.pix.hline(r.cx - 1, r.cx + 1, y, c1(c));
    }
  },
  olho_espirito_testa: (c) => {
    if (c.slice !== 'head' || c.rig.view === 'back') return;
    const r = c.rig;
    const x = r.view === 'side' ? r.headL + 3 : r.cx - 2;
    const open = c.frame % 3 !== 2;
    const g = withAlpha(c0(c), 170);
    c.pix.box(x, r.headTop + 3, x + 3, r.headTop + 5, withAlpha(hex('#9cf0a0'), 130));
    if (open) c.pix.box(x + 1, r.headTop + 4, x + 2, r.headTop + 4, g);
    else c.pix.hline(x, x + 3, r.headTop + 4, g);
  },
  peruca_alta_simples: (c) => {
    if (c.slice !== 'head') return;
    const r = c.rig;
    const col = c0(c);
    c.pix.ellipse(r.cx, r.headTop - 3, 7.5, 7.5, col);
    for (let y = r.headTop; y <= r.headTop + 8; y++) {
      const s = headSpan(r, y);
      if (!s) continue;
      if (r.view === 'back') c.pix.hline(s[0], s[1], y, col);
      else {
        c.pix.hline(s[0] - 1, s[0] + 1, y, col);
        c.pix.hline(s[1] - 1, s[1] + 1, y, dk(col));
        if (y < r.headTop + 3) c.pix.hline(s[0], s[1], y, col);
      }
    }
    for (let i = 0; i < 10; i++) c.pix.put(r.cx - 6 + ((i * 5) % 13), r.headTop - 8 + ((i * 3) % 10), dk(col));
  },
  peruca_alta_passarinho: (c) => {
    if (c.slice !== 'head') return;
    const r = c.rig;
    const col = c0(c);
    c.pix.ellipse(r.cx, r.headTop - 5, 7.5, 9.5, col);
    for (let y = r.headTop; y <= r.headTop + 9; y++) {
      const s = headSpan(r, y);
      if (!s) continue;
      if (r.view === 'back') c.pix.hline(s[0], s[1], y, col);
      else {
        c.pix.hline(s[0] - 1, s[0] + 1, y, col);
        c.pix.hline(s[1] - 1, s[1] + 1, y, dk(col));
        if (y < r.headTop + 3) c.pix.hline(s[0], s[1], y, col);
      }
    }
    for (let i = 0; i < 14; i++) c.pix.put(r.cx - 6 + ((i * 5) % 13), r.headTop - 13 + ((i * 3) % 14), dk(col));
    // buraco com o passarinho
    const bx = r.cx + (r.view === 'side' ? -3 : 1);
    const by = r.headTop - 9;
    c.pix.box(bx - 1, by - 1, bx + 2, by + 2, hex('#3a2a20'));
    c.pix.box(bx, by, bx + 1, by + 1, c1(c));
    c.pix.put(bx - 1, by, C.warn);
    c.pix.put(bx, by, C.eye);
  },
  chapeu_palha_malandro: (c) => brimHat(c, { brim: 18, crownW: 12, crownH: 4, at: 3, band: c1(c), tilt: -1 }, c0(c)),
  coque_antena: (c) => {
    if (c.slice !== 'head') return;
    const r = c.rig;
    dome(c, 2, c0(c), { up: 0 });
    const bx = r.view === 'side' ? r.cx + 1 : r.cx;
    c.pix.disk(bx, r.headTop - 2, 2.6, c0(c));
    c.pix.vline(bx, r.headTop - 8, r.headTop - 4, c1(c));
    c.pix.put(bx, r.headTop - 9, c.frame % 2 ? C.red : C.neonGreen);
  },
  viseira: (c) => {
    if (c.slice !== 'head') return;
    const r = c.rig;
    const col = c0(c);
    if (r.view === 'side') {
      c.pix.hline(r.headL, r.headR, r.headTop + 3, col);
      c.pix.hline(r.headL - 6, r.headL, r.headTop + 4, c1(c));
    } else if (r.view === 'front') {
      c.pix.hline(r.headL, r.headR, r.headTop + 3, col);
      c.pix.hline(r.headL + 1, r.headR - 1, r.headTop + 4, col);
      c.pix.hline(r.headL + 2, r.headR - 2, r.headTop + 5, c1(c));
    } else c.pix.hline(r.headL, r.headR, r.headTop + 4, col);
  },
  chapeu_cowboy_simples: (c) => brimHat(c, { brim: 22, crownW: 12, crownH: 5, at: 3, upturn: true, dented: true }),
  chapeu_cowboy_gps: (c) => {
    brimHat(c, { brim: 22, crownW: 12, crownH: 5, at: 3, upturn: true, dented: true, band: hex('#2a2a2a') });
    if (c.slice !== 'head') return;
    const r = c.rig;
    c.pix.box(r.cx - 1, r.headTop + 1, r.cx + 1, r.headTop + 2, C.metalDark);
    c.pix.put(r.cx, r.headTop + 1, c.frame % 2 ? c1(c) : C.neonGreen);
  },
  bone_virado: (c) => capHat(c, { backwards: true, base: c0(c), front: c1(c) }),
  cabelo_arrepiado: (c) => spikyHair(c, false),
  cabelo_arrepiado_faiscando: (c) => spikyHair(c, true),
  franja_pastel: (c) => {
    if (c.slice !== 'head') return;
    const r = c.rig;
    const col = c0(c);
    const sh = dk(col);
    for (let y = r.headTop - 1; y <= r.headTop + 10; y++) {
      const s = headSpan(r, Math.max(y, r.headTop));
      if (!s) continue;
      const k = y < r.headTop ? 2 : 0;
      if (r.view === 'back' || y <= r.headTop + 4) c.pix.hline(s[0] - (y > r.headTop + 2 ? 1 : 0) + k, s[1] + (y > r.headTop + 2 ? 1 : 0) - k, y, col);
      else if (r.view === 'front') {
        c.pix.hline(s[0] - 1, s[0] + 1, y, col);
        c.pix.hline(s[1] - 1, s[1] + 1, y, sh);
      } else c.pix.hline(r.cx, s[1] + 1, y, col);
    }
    if (r.view === 'front') c.pix.hline(r.headL, r.headR, r.headTop + 5, sh); // franja reta perfeita
    if (r.view === 'side') c.pix.hline(r.headL, r.cx, r.headTop + 5, sh);
    c.pix.hline(r.headL + 3, r.headL + 6, r.headTop, C.pureWhite);
  },
  // ---------------- rosto
  oculos_tortos: (c) => glasses(c, 'crooked', c0(c)),
  mascara_comedia_tragedia: (c) => {
    if (c.slice !== 'head' || c.rig.view === 'back') return;
    const r = c.rig;
    const ey = r.eyeY;
    if (r.view === 'front') {
      c.pix.box(r.headL + 1, ey - 2, r.cx - 1, ey + 3, c0(c));
      c.pix.box(r.cx, ey - 2, r.headR - 1, ey + 3, c1(c));
      c.pix.set(r.cx - 4, ey, C.eye);
      c.pix.set(r.cx - 4, ey + 1, C.eye);
      c.pix.set(r.cx + 3, ey, C.eye);
      c.pix.set(r.cx + 3, ey + 1, C.eye);
      c.pix.put(r.cx - 5, ey + 3, dk(c0(c)));
      c.pix.put(r.cx - 3, ey + 3, dk(c0(c)));
      c.pix.put(r.cx + 3, ey + 3, hex('#6aa8d8')); // lágrima
    } else {
      c.pix.box(r.headL, ey - 2, r.cx, ey + 3, c0(c));
      c.pix.set(r.headL + 3, ey, C.eye);
    }
  },
  pintura_trote: (c) => {
    if (c.slice !== 'head' || c.rig.view === 'back') return;
    const r = c.rig;
    const p = c0(c);
    const q = c1(c);
    const x = r.view === 'side' ? r.headL + 4 : r.cx;
    c.pix.put(x - 1, r.headTop + 3, p);
    c.pix.put(x, r.headTop + 4, p);
    c.pix.put(x + 1, r.headTop + 3, p);
    c.pix.put(x - 1, r.headTop + 5, p);
    c.pix.put(x + 1, r.headTop + 5, p);
    if (r.view === 'front') {
      c.pix.line(r.headL + 1, r.eyeY + 3, r.headL + 3, r.eyeY + 4, q);
      c.pix.line(r.headR - 3, r.eyeY + 4, r.headR - 1, r.eyeY + 3, q);
    } else c.pix.line(r.headL + 3, r.eyeY + 3, r.headL + 5, r.eyeY + 4, q);
  },
  headset_trainee: (c) => headsetBand(c, c0(c), c1(c)),
  olheira_funda: (c) => {
    if (c.slice !== 'head' || c.rig.view === 'back') return;
    const r = c.rig;
    const col = mix(c.skin.shade, c0(c), 0.6);
    if (r.view === 'front') {
      c.pix.hline(r.cx - 5, r.cx - 2, r.eyeY + 2, col);
      c.pix.hline(r.cx + 1, r.cx + 4, r.eyeY + 2, col);
    } else c.pix.hline(r.headL + 2, r.headL + 5, r.eyeY + 2, col);
  },
  veia_testa: (c) => {
    if (c.slice !== 'head' || c.rig.view === 'back') return;
    const r = c.rig;
    const col = shade(c.skin.base, 0.6);
    const x = r.view === 'side' ? r.headL + 4 : r.cx + 2;
    const pulse = r.pose.expression === 'briga' || c.frame % 2 === 0;
    c.pix.put(x, r.headTop + 2, col);
    c.pix.put(x + 1, r.headTop + 3, col);
    c.pix.put(x, r.headTop + 4, col);
    if (pulse) c.pix.put(x + 1, r.headTop + 5, C.red);
  },
  curativo_nariz: (c) => {
    if (c.slice !== 'head' || c.rig.view === 'back') return;
    const r = c.rig;
    const x = r.view === 'side' ? r.headL - 1 : r.cx - 2;
    const y = r.eyeY + 2;
    c.pix.put(x, y, c0(c));
    c.pix.put(x + 2, y, c0(c));
    c.pix.put(x + 1, y + 1, c0(c));
    c.pix.put(x, y + 2, c0(c));
    c.pix.put(x + 2, y + 2, c0(c));
  },
  barba_longa: (c) => beard(c, 8),
  barba_arrastando: (c) => beard(c, 99),
  passarinho_ninho_barba: (c) => {
    if (c.slice !== 'head' || c.rig.view === 'back') return;
    const r = c.rig;
    const x = r.view === 'side' ? r.headL + 2 : r.cx - 2;
    const y = r.headBot + 3;
    c.pix.box(x, y + 2, x + 3, y + 3, hex('#7a5a32'));
    c.pix.put(x - 1, y + 2, hex('#5a3a20'));
    c.pix.put(x + 4, y + 2, hex('#5a3a20'));
    c.pix.box(x + 1, y, x + 2, y + 1, c0(c));
    c.pix.put(x + 1, y, C.eye);
    c.pix.put(x, y + 1, C.warn);
    if (r.pose.expression === 'briga' || c.frame % 2) c.pix.put(x + 3, y - 1, C.pureWhite); // reclama junto
  },
  bochechas_vermelhas: (c) => {
    if (c.slice !== 'head' || c.rig.view === 'back') return;
    const r = c.rig;
    const col = mix(c.skin.base, hex('#e03a3a'), 0.55);
    if (r.view === 'front') {
      c.pix.hline(r.cx - 6, r.cx - 5, r.eyeY + 3, col);
      c.pix.hline(r.cx + 4, r.cx + 5, r.eyeY + 3, col);
    } else c.pix.hline(r.headL + 3, r.headL + 4, r.eyeY + 3, col);
  },
  mascara_veneziana: (c) => {
    if (c.slice !== 'head' || c.rig.view === 'back') return;
    const r = c.rig;
    const ey = r.eyeY;
    const col = c0(c);
    const trim = c1(c);
    if (r.view === 'front') {
      c.pix.box(r.headL + 1, ey - 1, r.headR - 1, ey + 2, col);
      c.pix.put(r.headL, ey - 3, col);
      c.pix.put(r.headL + 1, ey - 2, col);
      c.pix.put(r.headR, ey - 3, col);
      c.pix.put(r.headR - 1, ey - 2, col);
      c.pix.hline(r.headL + 1, r.headR - 1, ey + 2, trim);
      c.pix.set(r.cx - 4, ey, C.eye);
      c.pix.set(r.cx - 4, ey + 1, C.eye);
      c.pix.set(r.cx + 3, ey, C.eye);
      c.pix.set(r.cx + 3, ey + 1, C.eye);
    } else {
      c.pix.box(r.headL, ey - 1, r.cx + 1, ey + 2, col);
      c.pix.put(r.cx + 1, ey - 3, col);
      c.pix.hline(r.headL, r.cx + 1, ey + 2, trim);
      c.pix.set(r.headL + 3, ey, C.eye);
    }
  },
  palito: (c) => {
    if (c.slice !== 'head' || c.rig.view === 'back') return;
    const r = c.rig;
    if (r.view === 'front') c.pix.line(r.cx + 2, r.mouthY, r.cx + 4, r.mouthY + 1, c0(c));
    else c.pix.line(r.headL, r.mouthY, r.headL - 2, r.mouthY + 1, c0(c));
  },
  cicatriz_sobrancelha: (c) => {
    if (c.slice !== 'head' || c.rig.view === 'back') return;
    const r = c.rig;
    const col = mix(c.skin.light, C.pureWhite, 0.4);
    const x = r.view === 'side' ? r.headL + 3 : r.cx + 3;
    c.pix.set(x, r.eyeY - 3, col);
    c.pix.set(x + 1, r.eyeY - 2, col);
  },
  oculos_escuros: (c) => glasses(c, 'dark', c0(c)),
  oculos_solda: (c) => glasses(c, 'weld', c0(c), c1(c)),
  oculos_protecao: (c) => glasses(c, 'lab', c0(c), withAlpha(c1(c), 200)),
  headset_atendimento: (c) => headsetBand(c, c0(c), c1(c), { light: true }),
  sorriso_atendimento: (c) => {
    if (c.slice !== 'head' || c.rig.view === 'back') return;
    const r = c.rig;
    if (r.view === 'front') {
      c.pix.box(r.cx - 3, r.mouthY - 1, r.cx + 2, r.mouthY + 1, c.skin.base);
      c.pix.set(r.cx - 3, r.mouthY - 1, C.eye);
      c.pix.hline(r.cx - 2, r.cx + 1, r.mouthY, C.eye);
      c.pix.hline(r.cx - 1, r.cx, r.mouthY + 1, c0(c));
      c.pix.set(r.cx + 2, r.mouthY - 1, C.eye);
    } else {
      c.pix.set(r.headL, r.mouthY, C.eye);
      c.pix.set(r.headL + 1, r.mouthY, c0(c));
      c.pix.set(r.headL + 2, r.mouthY - 1, C.eye);
    }
  },
  fones_grandes: (c) => headsetBand(c, c0(c), c1(c), { bigCups: true, bothCups: true, noMic: true }),
  microfone_headset: (c) => {
    if (c.slice !== 'head' || c.rig.view === 'back') return;
    const r = c.rig;
    if (r.view === 'front') {
      c.pix.line(r.headL - 1, r.eyeY + 1, r.headL, r.mouthY, c0(c));
      c.pix.line(r.headL, r.mouthY, r.cx - 3, r.mouthY, c0(c));
      c.pix.put(r.cx - 3, r.mouthY, C.ink);
    } else {
      c.pix.line(r.cx + 1, r.eyeY + 1, r.headL + 3, r.mouthY + 1, c0(c));
      c.pix.put(r.headL + 2, r.mouthY + 1, C.ink);
    }
  },
  // ---------------- tronco
  camiseta_lembranca_delta: (c) => {
    shirt(c, { sleeve: 'short' });
    if (c.slice !== 'torso' || c.rig.view === 'back') return;
    const r = c.rig;
    const ink = c1(c);
    if (r.view === 'front') {
      microText(c.pix, r.cx - 4, r.torsoTop + 2, 8, 2, c.text ?? 'Lembrança do Delta', ink);
      // palafita de 4 px
      const x = r.cx - 2;
      const y = r.torsoTop + 6;
      c.pix.hline(x, x + 3, y, ink);
      c.pix.box(x, y + 1, x + 3, y + 2, ink);
      c.pix.put(x, y + 3, ink);
      c.pix.put(x + 3, y + 3, ink);
      c.pix.put(x + 1, y + 1, c0(c));
    }
  },
  camiseta_desbotada_estampa: (c) => {
    shirt(c, { sleeve: 'short', pattern: 'faded' });
    if (c.slice !== 'torso' || c.rig.view !== 'front') return;
    const r = c.rig;
    // punho pequeno
    c.pix.box(r.cx - 2, r.torsoTop + 3, r.cx, r.torsoTop + 4, c1(c));
    c.pix.vline(r.cx - 1, r.torsoTop + 5, r.torsoTop + 6, c1(c));
    microText(c.pix, r.cx - 4, r.torsoTop + 8, 8, 1, c.text ?? 'Assembleia', c1(c));
  },
  camiseta_lisa: T({ sleeve: 'short' }),
  colete_refletivo: (c) => vest(c, c0(c), { stripes: c1(c), openFront: true }),
  binoculo_pescoco: (c) => {
    if (c.slice !== 'torso' || c.rig.view === 'back') return;
    const r = c.rig;
    const x = r.view === 'side' ? r.torsoL - 1 : r.cx - 3;
    const y = r.torsoTop + 4;
    c.pix.line(r.cx - 3, r.torsoTop, x + 1, y, dk(c1(c)));
    c.pix.line(r.cx + 2, r.torsoTop, x + 3, y, dk(c1(c)));
    c.pix.box(x, y, x + 4, y + 2, c1(c));
    c.pix.put(x + 1, y + 2, c0(c));
    c.pix.put(x + 3, y + 2, c0(c));
  },
  tunica_estopa: (c) => {
    shirt(c, { sleeve: 'short', len: 'knee', pattern: 'burlap', flare: 0.15 });
    belt(c, c1(c));
  },
  cracha_pendurado: (c) => {
    if (c.slice !== 'torso' || c.rig.view === 'back') return;
    const r = c.rig;
    const x = r.view === 'side' ? r.torsoL : r.cx - 2;
    const y = r.torsoTop + 5;
    c.pix.line(r.cx - 2, r.torsoTop, x, y, C.neonCyan);
    c.pix.line(r.cx + 1, r.torsoTop, x + 4, y, C.neonCyan);
    plate(c.pix, x, y, 5, 4, c0(c), c.text, C.ink);
  },
  malha_teatro: T({ sleeve: 'long' }),
  camisa_neon_fc: (c) => {
    shirt(c, { sleeve: 'short', vneck: true, second: c1(c) });
    if (c.slice !== 'torso') return;
    const r = c.rig;
    if (r.view === 'front') {
      c.pix.box(r.cx + 2, r.torsoTop + 3, r.cx + 3, r.torsoTop + 4, c1(c)); // escudo
      c.pix.box(r.cx - 4, r.torsoTop + 6, r.cx + 3, r.torsoTop + 8, c2(c)); // casa de aposta inventada
      c.pix.hline(r.cx - 3, r.cx + 2, r.torsoTop + 7, c0(c));
    } else if (r.view === 'back') {
      c.pix.box(r.cx - 2, r.torsoTop + 3, r.cx + 1, r.torsoTop + 8, c1(c)); // número
      c.pix.vline(r.cx, r.torsoTop + 4, r.torsoTop + 7, c0(c));
    }
  },
  farda_cinza: (c) => {
    shirt(c, { sleeve: 'long', pattern: 'pockets', print: undefined });
    if (c.slice === 'torso' && c.rig.view === 'back') microText(c.pix, c.rig.cx - 4, c.rig.torsoTop + 3, 8, 2, c.text ?? 'PROTECAO', light(c0(c), 0.5));
  },
  colete_qr_code: (c) => {
    vest(c, c0(c));
    if (c.slice !== 'torso' || c.rig.view !== 'front') return;
    const r = c.rig;
    const x = r.cx - 3;
    const y = r.torsoTop + 3;
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) c.pix.put(x + i, y + j, (i * 3 + j * 5 + i * j) % 3 === 0 ? C.ink : c1(c));
    c.pix.frame(x, y, x + 4, y + 4, C.ink);
  },
  camera_corporal_apagada: (c) => {
    if (c.slice !== 'torso' || c.rig.view === 'back') return;
    const r = c.rig;
    const x = r.view === 'side' ? r.torsoL : r.torsoR - 3;
    c.pix.box(x, r.torsoTop + 1, x + 2, r.torsoTop + 3, c0(c));
    c.pix.put(x + 1, r.torsoTop + 2, hex('#3a3a3a')); // a luz sempre apagada
  },
  moletom_universidade: (c) => shirt(c, { sleeve: 'long', hood: true, print: c.text ?? 'UNIVERSIDADE NEON', len: 'hip' }),
  terno_grande: (c) => shirt(c, { sleeve: 'covering', shoulderOut: 2, lapel: c1(c), len: 'hip', wide: 1 }),
  cracha_gigante: (c) => {
    if (c.slice !== 'torso' || c.rig.view === 'back') return;
    const r = c.rig;
    const x = r.view === 'side' ? r.torsoL - 1 : r.cx - 5;
    plate(c.pix, x, r.torsoTop + 3, r.view === 'side' ? 5 : 9, 6, c0(c), c.text ?? 'TALENTO', c1(c));
  },
  camisa_xadrez_fechada: T({ sleeve: 'long', pattern: 'plaid', collar: dk(dk(C.paper)) }),
  camisa_xadrez_aberta: T({ sleeve: 'rolled', pattern: 'plaid', open: 9 }),
  camiseta_linho: T({ sleeve: 'short', len: 'hip', wide: 1 }),
  tunica_linho: T({ sleeve: 'long', len: 'thigh', wide: 1, sideSlit: true }),
  camisa_listrada: T({ sleeve: 'long', pattern: 'stripesH', vneck: true }),
  cachecol_tricolor: (c) => {
    if (c.slice !== 'torso') return;
    const r = c.rig;
    const cols = [c0(c), c1(c), c2(c)];
    if (r.view === 'back') {
      for (let i = 0; i < 3; i++) c.pix.hline(r.cx - 5 + i * 3, r.cx - 3 + i * 3, r.torsoTop, cols[i]!);
      return;
    }
    for (let x = r.cx - 5; x <= r.cx + 4; x++) c.pix.put(x, r.torsoTop, cols[fr(((x - r.cx + 5) * 3) / 10)]!);
    for (let x = r.cx - 4; x <= r.cx + 3; x++) c.pix.put(x, r.torsoTop + 1, cols[fr(((x - r.cx + 4) * 3) / 8)]!);
    const px0 = r.view === 'side' ? r.torsoL : r.cx - 3;
    for (let y = r.torsoTop + 2; y <= r.torsoTop + 9; y++) for (let i = 0; i < 3; i++) c.pix.put(px0 + i, y, cols[i]!);
  },
  casaco_pele_falsa_curto: T({ sleeve: 'long', len: 'hip', pattern: 'fur', wide: 1 }),
  casaco_pele_falsa_enorme: T({ sleeve: 'covering', len: 'knee', pattern: 'fur', wide: 4, flare: 0.1 }),
  tunica_montaria: (c) => {
    shirt(c, { sleeve: 'long', len: 'thigh' });
    if (c.slice !== 'torso' || c.rig.view === 'back') return;
    const r = c.rig;
    c.pix.line(r.cx - 4, r.torsoTop, r.cx + 3, r.torsoTop + 9, dk(c0(c))); // transpassada
    c.pix.hline(r.torsoL, r.torsoR, r.torsoTop + 5, c1(c)); // faixa colorida
  },
  camisa_bolsos_simples: T({ sleeve: 'short', pattern: 'pockets' }),
  camisa_14_bolsos: T({ sleeve: 'short', pattern: 'pockets14' }),
  tunica_musgo: T({ sleeve: 'long', len: 'floor', pattern: 'moss', flare: 0.2 }),
  tunica_musgo_longa: (c) => {
    shirt(c, { sleeve: 'long', len: 'drag', pattern: 'moss', flare: 0.3 });
    if (c.slice !== 'torso') return;
    const r = c.rig;
    c.pix.put(r.cx - 5, r.groundY - 1, C.leaf);
    c.pix.put(r.cx + 3, r.groundY, C.leaf);
    c.pix.box(r.cx + 5, r.groundY - 1, r.cx + 6, r.groundY - 1, C.red); // cogumelo
    c.pix.put(r.cx + 5, r.groundY, C.white);
  },
  tunica_viking_simples: T({ sleeve: 'long', len: 'thigh', trim: undefined }),
  tunica_viking: (c) => {
    shirt(c, { sleeve: 'long', len: 'thigh', trim: c1(c) });
    if (c.slice !== 'torso') return;
    const r = c.rig;
    if (r.view === 'front') c.pix.disk(r.torsoL + 1.5, r.torsoTop + 1.5, 1.5, C.gold); // broche
    if (r.view !== 'front') c.pix.box(r.torsoL, r.torsoTop, r.torsoR, r.torsoTop + 6, c1(c)); // manto curto
  },
  poncho_simples: T({ sleeve: 'covering', len: 'hip', wide: 2, flare: 0.5, trim: undefined, pattern: 'none', third: undefined }),
  poncho_colorido: (c) => {
    shirt(c, { sleeve: 'covering', len: 'hip', wide: 2, pattern: 'poncho' });
    if (c.slice !== 'torso') return;
    const r = c.rig;
    const s = torsoSpan(r, r.torsoBot);
    if (s) for (let x = s[0] - 2; x <= s[1] + 2; x += 2) c.pix.put(x, r.torsoBot + 1, c2(c)); // franja
  },
  malha_regata: T({ sleeve: 'none' }),
  vestido_opera_curto: T({ sleeve: 'cap', len: 'floor', pattern: 'ruffles', flare: 0.45, wide: 0 }),
  vestido_opera_dois_tiles: T({ sleeve: 'cap', len: 'floor', pattern: 'ruffles', flare: 0.3 }),
  camisa_social_branca: T({ sleeve: 'long', collar: C.pureWhite }),
  terno_branco_impecavel: (c) => {
    shirt(c, { sleeve: 'long', lapel: dk(c0(c)), len: 'hip' });
    if (c.slice === 'torso' && c.rig.view === 'front') c.pix.box(c.rig.torsoL + 1, c.rig.torsoTop + 3, c.rig.torsoL + 2, c.rig.torsoTop + 3, c1(c)); // lenço
  },
  cordao_pescoco: (c) => {
    if (c.slice !== 'torso' || c.rig.view === 'back') return;
    const r = c.rig;
    const col = c0(c);
    if (r.view === 'front') {
      c.pix.line(r.cx - 3, r.torsoTop, r.cx - 1, r.torsoTop + 4, col);
      c.pix.line(r.cx + 2, r.torsoTop, r.cx, r.torsoTop + 4, col);
      c.pix.box(r.cx - 1, r.torsoTop + 5, r.cx, r.torsoTop + 6, col);
    } else c.pix.box(r.torsoL, r.torsoTop + 4, r.torsoL + 1, r.torsoTop + 5, col);
  },
  barriga_hidraulica_simples: (c) => belly(c, 20, false),
  barriga_hidraulica_cromada: (c) => belly(c, 22, true),
  regata_torcida: (c) => {
    shirt(c, { sleeve: 'none', len: 'hip', wide: 1 });
    if (c.slice === 'torso' && c.rig.view === 'back') {
      const r = c.rig;
      c.pix.box(r.cx - 2, r.torsoTop + 3, r.cx + 1, r.torsoTop + 8, c1(c));
      c.pix.vline(r.cx - 1, r.torsoTop + 4, r.torsoTop + 7, c0(c));
    }
  },
  cachecol_torcida: (c) => {
    if (c.slice !== 'torso') return;
    const r = c.rig;
    for (let x = r.cx - 4; x <= r.cx + 3; x++) c.pix.put(x, r.torsoTop, x % 2 ? c0(c) : c1(c));
    if (r.view === 'back') return;
    for (let y = r.torsoTop + 1; y <= r.torsoTop + 10; y++) {
      const k = (y % 2 ? c0(c) : c1(c)) as Color;
      if (r.view === 'front') {
        c.pix.put(r.cx - 4, y, k);
        c.pix.put(r.cx - 3, y, k);
        c.pix.put(r.cx + 2, y, k);
        c.pix.put(r.cx + 3, y, k);
      } else c.pix.hline(r.torsoL, r.torsoL + 1, y, k);
    }
  },
  regata_cavada: T({ sleeve: 'none', len: 'hip' }),
  armadura_choque_leve: (c) => {
    shirt(c, { sleeve: 'long', len: 'hip' });
    if (c.slice === 'arms' || c.slice === 'farArm') armMark(c, 'both', 0.05, (x, y) => c.pix.box(x - 1, y - 1, x + 1, y + 1, c1(c)));
  },
  armadura_choque: (c) => {
    shirt(c, { sleeve: 'long', len: 'hip' });
    if (c.slice === 'arms' || c.slice === 'farArm') armMark(c, 'both', 0.05, (x, y) => c.pix.box(x - 2, y - 1, x + 2, y + 2, c1(c)));
    if (c.slice !== 'torso' || c.rig.view === 'back') return;
    const r = c.rig;
    c.pix.box(r.cx - 4, r.torsoTop + 2, r.cx + 3, r.torsoTop + 6, c1(c));
    c.pix.box(r.cx - 3, r.torsoTop + 8, r.cx + 2, r.torsoTop + 10, c1(c));
    c.pix.hline(r.cx - 4, r.cx + 3, r.torsoTop + 2, lt(c1(c)));
  },
  camisa_cowboy: (c) => {
    shirt(c, { sleeve: 'long' });
    if (c.slice !== 'torso' || c.rig.view !== 'front') return;
    const r = c.rig;
    c.pix.line(r.torsoL, r.torsoTop + 2, r.cx - 1, r.torsoTop + 4, c1(c)); // pala pontuda
    c.pix.line(r.torsoR, r.torsoTop + 2, r.cx, r.torsoTop + 4, c1(c));
    for (let y = r.torsoTop + 5; y < r.torsoBot - 1; y += 2) c.pix.put(r.cx, y, C.pureWhite);
  },
  colete_producao: (c) => {
    vest(c, c0(c), { openFront: true });
    if (c.slice !== 'torso' || c.rig.view === 'back') return;
    const r = c.rig;
    c.pix.box(r.torsoL + 1, r.torsoTop + 6, r.torsoL + 3, r.torsoTop + 7, dk(c0(c)));
    c.pix.box(r.torsoR - 3, r.torsoTop + 6, r.torsoR - 1, r.torsoTop + 7, dk(c0(c)));
    c.pix.box(r.torsoL + 1, r.torsoTop + 2, r.torsoL + 2, r.torsoTop + 4, C.ink); // walkie-talkie
    c.pix.put(r.torsoL + 1, r.torsoTop + 1, C.ink);
  },
  macacao_graxa: T({ sleeve: 'rolled', pattern: 'grease', len: 'hip' }),
  lacres_garantia: (c) => {
    if (c.slice !== 'torso') return;
    const r = c.rig;
    for (const [dx, dy] of [
      [-4, 3],
      [3, 6],
      [-2, 10],
      [2, 1],
    ])
      c.pix.hline(r.cx + dx!, r.cx + dx! + 1, r.torsoTop + dy!, c0(c));
  },
  jaleco: T({ sleeve: 'long', len: 'knee', lapel: dk(C.paper), pattern: 'pockets', flare: 0.15 }),
  jaleco_chamuscado: (c) => {
    shirt(c, { sleeve: 'long', len: 'knee', lapel: dk(C.paper), flare: 0.15 });
    if (c.slice !== 'torso') return;
    const r = c.rig;
    const b = shirtBottom(r, 'knee');
    for (let x = r.torsoL - 3; x <= r.torsoR + 3; x += 2) c.pix.set(x, b, 0); // barra queimada
    for (const [dx, dy] of [
      [-3, 4],
      [2, 9],
      [-1, 13],
    ])
      c.pix.paint(r.cx + dx!, r.torsoTop + dy!, c1(c));
  },
  top_esportivo: (c) => {
    shirt(c, { sleeve: 'none', len: 'default' });
    if (c.slice !== 'torso') return;
    const r = c.rig;
    // barriga de fora e corta-vento amarrado na cintura
    for (let y = r.torsoTop + 7; y < r.waistY; y++) {
      const s = torsoSpan(r, y);
      if (s) c.pix.hline(s[0], s[1], y, y === r.torsoTop + 7 ? c.skin.shade : c.skin.base);
    }
    const s = torsoSpan(r, r.waistY);
    if (s) {
      c.pix.hline(s[0] - 1, s[1] + 1, r.waistY, c1(c));
      c.pix.vline(r.view === 'back' ? r.cx : s[0], r.waistY, r.waistY + 4, c1(c));
    }
  },
  blazer_corporativo: (c) => {
    shirt(c, { sleeve: 'long', lapel: c1(c), len: 'hip' });
    if (c.slice !== 'torso' || c.rig.view === 'back') return;
    const r = c.rig;
    c.pix.hline(r.cx - 1, r.cx, r.torsoTop, C.neonPink); // lenço
    c.pix.box(r.torsoR - 3, r.torsoTop + 5, r.torsoR - 1, r.torsoTop + 7, C.white); // crachá
  },
  moletom_grafismo_simples: T({ sleeve: 'long', hood: true, pattern: 'geo', len: 'hip' }),
  moletom_grafismo_aldeia: (c) => {
    shirt(c, { sleeve: 'long', hood: true, pattern: 'geoFull', len: 'hip' });
    if (c.slice !== 'torso' || c.rig.view === 'back') return;
    const r = c.rig;
    c.pix.line(r.cx + 2, r.torsoBot - 3, r.cx + 4, r.torsoBot + 1, C.neonGreen); // cabos do bolso
    c.pix.line(r.cx + 1, r.torsoBot - 3, r.cx + 2, r.torsoBot + 2, C.neonCyan);
  },
  jaqueta_brilhante_simples: T({ sleeve: 'long', pattern: 'sequin', len: 'default' }),
  jaqueta_brilhante: (c) => {
    shirt(c, { sleeve: 'long', pattern: 'sequin', shoulderOut: 1 });
    if (c.slice === 'arms' || c.slice === 'farArm') armMark(c, 'both', 0.05, (x, y) => c.pix.box(x - 1, y - 1, x + 1, y, c2(c)));
    if (c.slice === 'torso' && c.rig.view === 'front') {
      const r = c.rig;
      c.pix.line(r.cx - 3, r.torsoTop + 2, r.cx + 2, r.torsoTop + 5, C.silver); // corrente
    }
  },
  // ---------------- braços
  bracadeira: (c) => armBand(c, 'off', 0.18, 0.34, c0(c)),
  tomate_ombro: (c) => armMark(c, 'off', 0.02, (x, y) => {
    c.pix.disk(x + 0.5, y + 0.5, 2, c0(c));
    c.pix.put(x + 2, y - 1, c0(c));
    c.pix.put(x - 2, y + 2, c0(c));
    c.pix.put(x, y, light(c0(c), 0.3));
  }),
  tatuagem_qr_code: (c) => armMark(c, 'main', 0.55, (x, y) => {
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if ((i + j * 2) % 3 !== 1) c.pix.put(x - 1 + i, y - 1 + j, hex('#2a2a3a'));
  }),
  ring_light_ombro: (c) => {
    if (c.slice !== 'arms' && c.slice !== 'farArm') return;
    armMark(c, 'off', 0.02, (x, y) => {
      const r = c.rig;
      const ox = r.view === 'side' ? 0 : r.view === 'back' ? -3 : 3;
      c.pix.line(x, y, x + ox, y - 5, C.metalDark);
      c.pix.ring(x + ox + 0.5, y - 7.5, 3, 3, 1, c0(c));
      if (c.frame % 2 === 0) c.pix.put(x + ox, y - 8, C.pureWhite);
    });
  },
  curativos_poucos: (c) => armMark(c, 'both', 0.5, (x, y) => {
    c.pix.put(x - 1, y - 1, c0(c));
    c.pix.put(x + 1, y + 1, c0(c));
    c.pix.put(x, y, c0(c));
  }),
  curativos_muitos: (c) => {
    for (const t of [0.25, 0.5, 0.75])
      armMark(c, 'both', t, (x, y) => {
        c.pix.hline(x - 1, x + 1, y, c0(c));
        c.pix.put(x, y - 1, c0(c));
      });
    armMark(c, 'main', 0.85, (x, y) => c.pix.line(x + 1, y, x + 3, y + 3, c0(c)));
  },
  manoplas_simples: (c) => armMark(c, 'both', 1, (x, y, d) => {
    c.pix.box(x - 2, y - 1, x + 1, y + 2, d ? dk(c0(c)) : c0(c));
    c.pix.hline(x - 2, x + 1, y - 1, c1(c));
  }),
  manoplas_neon_fc: (c) => armMark(c, 'both', 1, (x, y, d) => {
    c.pix.box(x - 3, y - 2, x + 2, y + 3, d ? dk(c0(c)) : c0(c));
    c.pix.hline(x - 3, x + 2, y - 2, c1(c));
    c.pix.put(x, y + 1, c2(c));
  }),
  bracos_inchados: (c) => redrawArm(c, 'both', c.skin, 2),
  bracos_gigantes: (c) => {
    redrawArm(c, 'both', c.skin, 5);
    armMark(c, 'both', 0.35, (x, y) => c.pix.put(x - 1, y, c.skin.light)); // bíceps
  },
  braco_cromado_simples: (c) => {
    for (const [l, dark, w] of armsOf(c)) {
      if (w !== 'main') continue;
      drawLimbPart(c.pix, l, 0.5, 1, dark ? dk(c0(c)) : c0(c), C.metalDark, 0.2);
      const p = along(l, 0.5);
      c.pix.put(fr(p.x), fr(p.y), C.ink);
    }
  },
  braco_cromado: (c) => {
    for (const [l, dark, w] of armsOf(c)) {
      if (w !== 'main') continue;
      drawLimb(c.pix, { ...l, w: l.w + 0.4 }, tone(dark ? dk(c0(c)) : c0(c)), false);
      for (const t of [0.33, 0.66]) {
        const p = along(l, t);
        c.pix.put(fr(p.x), fr(p.y), C.ink);
      }
      const h = along(l, 0.95);
      c.pix.put(fr(h.x), fr(h.y), c.frame % 2 ? c1(c) : C.pureWhite);
    }
  },
  fita_prata: (c) => {
    for (const t of [0.5, 0.92]) armMark(c, 'both', t, (x, y) => c.pix.hline(x - 1, x + 1, y, c0(c)));
    armMark(c, 'main', 0.92, (x, y) => c.pix.put(x + 2, y + 1, c0(c)));
  },
  // ---------------- pernas
  bermuda_delta: Pn({ len: 0.55, fit: 0.8 }),
  bermuda_tactel: Pn({ len: 0.5, pattern: 'stripe', stripe: C.white }),
  bermuda_lisa: Pn({ len: 0.5 }),
  malha_teatro_pernas: Pn({ len: 1, fit: -0.4 }),
  calca_farda: Pn({ len: 1, pattern: 'pockets' }),
  calca_moletom: Pn({ len: 1, fit: 0.4, cuff: undefined }),
  calca_terno_grande: Pn({ len: 1.05, bunch: true, fit: 0.4 }),
  calca_jeans_surrada: Pn({ len: 1, pattern: 'kneeLight' }),
  calca_linho: Pn({ len: 1, fit: 1, tiedAnkle: true }),
  calca_social_surrada: Pn({ len: 1, pattern: 'patch' }),
  saia_longa: Pn({ len: 0.92, skirt: true }),
  calca_montaria: Pn({ len: 0.85, fit: 1.2 }),
  bermuda_caqui: Pn({ len: 0.5, pattern: 'pockets', fit: 0.6 }),
  calca_la: Pn({ len: 1, fit: 0.6, cuff: undefined, pattern: 'stripe' }),
  calca_luta: Pn({ len: 1, fit: -0.2, pattern: 'bolt' }),
  calca_branca: Pn({ len: 1 }),
  pernas_palito: (c) => {
    if (c.slice !== 'legs') return;
    const r = c.rig;
    // pernas finas de 2 px na cor da pele, com shortinho por cima
    for (const [l, dark] of legsOf(c)) {
      const thin: Limb = { a: { x: l.a.x, y: l.a.y + 3 }, b: l.b, w: 2 };
      c.pix.capsule(thin.a.x, thin.a.y, thin.b.x, thin.b.y, 2, dark ? c.skin.shade : c.skin.base);
    }
    const short = c1(c);
    for (let y = r.waistY; y <= r.torsoBot + 3; y++) {
      const s = torsoSpan(r, Math.min(y, r.torsoBot));
      if (s) c.pix.hline(s[0], s[1], y, y === r.torsoBot + 3 ? dk(short) : short);
    }
  },
  calca_cargo: Pn({ len: 1, fit: 0.8, pattern: 'pockets' }),
  macacao_graxa_pernas: Pn({ len: 1, pattern: 'grease', fit: 0.4 }),
  legging: Pn({ len: 1, fit: -0.4, pattern: 'stripe', stripe: C.pureWhite }),
  calca_social: Pn({ len: 1 }),
  calca_palco: Pn({ len: 1, fit: -0.2, pattern: 'sparkle' }),
  // ---------------- pés
  chinelo_delta: S('flipflop'),
  chinelo_com_meia: S('socksFlip'),
  chinelo: S('flipflop'),
  sandalia_couro: S('sandal'),
  sapatilha_teatro: S('slipper'),
  tenis_de_mola: (c) =>
    shoes(c, 'sneaker', (f, dark) => {
      if (c.rig.view === 'front') return;
      const x = c.rig.view === 'side' ? f.x1 : fr((f.x0 + f.x1) / 2);
      c.pix.vline(x, f.y1 - 1, f.y1, dark ? C.metalDark : C.metal);
    }),
  coturno: S('boot'),
  tenis_basico: S('sneaker'),
  sapato_social_gasto: (c) => shoes(c, 'shoe', (f) => c.pix.set(c.rig.view === 'side' ? f.x0 : f.x0 + 1, f.y1, 0)),
  botina: S('boot'),
  chinelo_couro: S('flipflop'),
  sapato_couro_gasto: (c) => shoes(c, 'shoe', (f) => c.pix.put(f.x1, f.y0 + 1, C.white)),
  botinha_feltro: S('boot'),
  bota_montaria: (c) => shoes(c, 'tallboot', (f) => c.pix.put(c.rig.view === 'side' ? f.x0 - 1 : f.x0, f.y0, c0(c))),
  bota_trilha: (c) => shoes(c, 'boot', (f) => c.pix.hline(f.x0, f.x1, f.y0 - 1, C.white)),
  sandalia_pedra: S('stone'),
  bota_pele: (c) => shoes(c, 'boot', (f) => c.pix.hline(f.x0, f.x1, f.y0 - 1, light(c0(c), 0.4))),
  botas_brilhantes_simples: (c) => shoes(c, 'tallboot', (f) => c.pix.put(f.x0 + 1, f.y0 - 2, C.pureWhite)),
  botas_brilhantes: (c) =>
    shoes(c, 'tallboot', (f) => {
      c.pix.line(f.x0 + 1, f.y0 - 3, f.x0 + 2, f.y0, c1(c));
      if (c.frame % 2 === 0) c.pix.put(f.x1 - 1, f.y0 - 2, C.pureWhite);
    }),
  sapato_salto: S('heel'),
  sapato_bicolor: (c) =>
    shoes(c, 'shoe', (f, dark) => {
      const d = dark ? dk(c1(c)) : c1(c);
      c.pix.vline(f.x0, f.y0 + 1, f.y1, d);
      c.pix.vline(f.x1, f.y0 + 1, f.y1, d);
    }),
  chinelo_slide: S('slide'),
  bota_cowboy: S('cowboy'),
  bota_espora_led: (c) => shoes(c, 'cowboy', (f) => c.pix.put(c.rig.view === 'side' ? f.x1 + 1 : f.x1 + 1, f.y1 - 1, c.frame % 2 ? c1(c) : C.neonCyan)),
  bota_seguranca: (c) => shoes(c, 'boot', (f) => c.pix.put(c.rig.view === 'side' ? f.x0 : f.x0 + 1, f.y1 - 1, C.metal)),
  tenis_corrida: (c) => shoes(c, 'sneaker', (f) => c.pix.hline(f.x0, f.x1, f.y1, c1(c))),
  tenis_palco: S('platform'),
  // ---------------- costas
  pintura_costas_torta: (c) => {
    backPrint(c, c0(c));
    if (c.slice === 'back' && c.rig.view === 'back') c.pix.put(c.rig.cx + 3, c.rig.torsoTop + 9, c0(c)); // respingo
  },
  mochila_panfletos: (c) => {
    if (c.slice !== 'back') return;
    const r = c.rig;
    const bag = c0(c);
    if (r.view === 'back') {
      c.pix.box(r.cx - 4, r.torsoTop + 1, r.cx + 3, r.torsoTop + 10, bag);
      c.pix.frame(r.cx - 4, r.torsoTop + 1, r.cx + 3, r.torsoTop + 10, dk(bag));
      c.pix.vline(r.cx + 4, r.torsoTop, r.torsoTop + 3, dk(bag));
    } else if (r.view === 'side') c.pix.box(r.torsoR, r.torsoTop + 1, r.torsoR + 3, r.torsoTop + 10, bag);
    else c.pix.box(r.torsoR - 2, r.torsoTop - 1, r.torsoR + 2, r.torsoTop + 8, bag);
    // panfletos saindo pela boca
    const x = r.view === 'side' ? r.torsoR : r.view === 'back' ? r.cx - 3 : r.torsoR - 2;
    for (let i = 0; i < 3; i++) c.pix.box(x + i * 2, r.torsoTop - 2 - (i % 2), x + i * 2 + 1, r.torsoTop, C.paper);
  },
  bordado_costas: (c) => {
    backPrint(c, c0(c));
    if (c.slice === 'back' && c.rig.view === 'back') {
      const r = c.rig;
      c.pix.put(r.cx - 1, r.torsoTop + 9, c0(c)); // olho torto
      c.pix.put(r.cx, r.torsoTop + 8, c0(c));
      c.pix.put(r.cx + 1, r.torsoTop + 9, c0(c));
    }
  },
  mochila_escolar: (c) => backpack(c, c0(c), (x, y) => c.pix.box(x + 1, y - 2, x + 3, y, c1(c))),
  bandeira_enrolada: (c) => {
    if (c.slice !== 'back') return;
    const r = c.rig;
    const x0 = r.view === 'back' ? r.torsoL - 3 : r.torsoR + 3;
    const x1 = r.view === 'back' ? r.torsoR + 1 : r.torsoL - 1;
    c.pix.line(x0, r.torsoTop - 8, x1, r.torsoBot, C.woodDark);
    c.pix.capsule(x0 + (r.view === 'back' ? 1 : -1), r.torsoTop - 6, x0 + (r.view === 'back' ? 3 : -3), r.torsoTop, 3, c0(c), c1(c));
  },
  mochila_cadeado_assinatura: (c) =>
    backpack(c, c0(c), (x, y) => {
      c.pix.box(x + 1, y - 3, x + 3, y, C.paper);
      c.pix.box(x + 2, y - 1, x + 3, y, c1(c)); // cadeado
    }),
  contrato_arrastando: (c) => scroll(c, c0(c), c1(c), 6),
  adesivo_descascando: (c) => backPrint(c, c0(c), { sticker: true, peel: true }),
  tapete_yoga_enrolado: (c) => {
    if (c.slice !== 'back') return;
    const r = c.rig;
    const y = r.torsoTop + 2;
    if (r.view === 'side') c.pix.box(r.torsoR - 1, y - 2, r.torsoR + 2, y + 2, c0(c));
    else {
      c.pix.box(r.cx - 7, y, r.cx + 6, y + 3, c0(c));
      for (let x = r.cx - 7; x <= r.cx + 6; x += 3) c.pix.vline(x, y, y + 3, dk(c0(c)));
      if (r.view === 'back') {
        c.pix.box(r.cx - 1, y + 1, r.cx + 1, y + 2, c1(c));
        if (c.text) microText(c.pix, r.cx - 4, y + 6, 8, 2, c.text, c1(c));
      }
    }
  },
  lista_reivindicacoes: (c) => scroll(c, c0(c), c1(c), 10),
  aljava: (c) => {
    if (c.slice !== 'back') return;
    const r = c.rig;
    const x = r.view === 'back' ? r.cx + 1 : r.view === 'side' ? r.torsoR : r.torsoR - 1;
    c.pix.line(x, r.torsoTop + 10, x + 3, r.torsoTop, c0(c));
    c.pix.line(x + 1, r.torsoTop + 10, x + 4, r.torsoTop, c0(c));
    for (let i = 0; i < 4; i++) c.pix.vline(x + 2 + i, r.torsoTop - 4 + (i % 2), r.torsoTop, i % 2 ? C.paper : C.wood);
    if (r.view === 'back') c.pix.box(x + 1, r.torsoTop + 5, x + 2, r.torsoTop + 6, C.paper); // adesivo
  },
  patch_costas: (c) => backPrint(c, dk(c0(c)), { patch: c0(c) }),
  remendo_costas: (c) => backPrint(c, C.leafDark, { patch: c0(c) }),
  capa_curta: (c) => cape(c, c0(c), 0.55),
  senha_costas: (c) => {
    if (c.slice !== 'back') return;
    const r = c.rig;
    if (r.view !== 'back') return;
    c.pix.line(r.cx - 3, r.torsoTop, r.cx - 2, r.torsoTop + 3, C.ink);
    c.pix.line(r.cx + 2, r.torsoTop, r.cx + 1, r.torsoTop + 3, C.ink);
    plate(c.pix, r.cx - 3, r.torsoTop + 3, 6, 4, c0(c), c.text, c1(c));
  },
  capa_cortina_curta: (c) => cape(c, c0(c), 0.5, true),
  capa_cortina: (c) => {
    cape(c, c0(c), 1, true, c1(c));
    if (c.slice === 'back' && c.rig.view === 'back' && c.text) microText(c.pix, c.rig.cx - 4, c.rig.torsoTop + 6, 8, 2, c.text, c1(c));
  },
  cauda_vestido: (c) => {
    if (c.slice !== 'back') return;
    const r = c.rig;
    const col = c0(c);
    if (r.view === 'side') c.pix.poly([[r.cx + 2, r.torsoBot], [r.cx + 15, r.groundY + 1], [r.cx + 2, r.groundY + 1]], col);
    else if (r.view === 'back') {
      c.pix.poly([[r.cx - 6, r.torsoBot], [r.cx + 6, r.torsoBot], [r.cx + 9, r.groundY + 1], [r.cx - 9, r.groundY + 1]], col);
      if (c.text) microText(c.pix, r.cx - 3, r.groundY - 4, 6, 1, c.text, C.gold);
    }
  },
  etiqueta_costas: (c) => {
    if (c.slice !== 'back' || c.rig.view !== 'back') return;
    const r = c.rig;
    c.pix.box(r.cx - 1, r.torsoTop - 1, r.cx + 1, r.torsoTop + 2, c0(c));
    c.pix.put(r.cx, r.torsoTop + 1, c1(c));
  },
  pistoes_vapor: (c) => {
    if (c.slice !== 'back') return;
    const r = c.rig;
    const xs = r.view === 'side' ? [r.torsoR + 1] : [r.cx - 5, r.cx + 4];
    for (const x of xs) {
      c.pix.box(x, r.torsoTop - 4, x + 1, r.torsoTop + 8, c0(c));
      c.pix.hline(x, x + 1, r.torsoTop - 4, lt(c0(c)));
      if (c.frame % 2 === 0) c.pix.put(x, r.torsoTop - 6, withAlpha(C.white, 160));
    }
    if (r.view === 'back') {
      c.pix.box(r.cx - 3, r.torsoTop + 2, r.cx + 2, r.torsoTop + 4, C.ink);
      for (let x = r.cx - 3; x <= r.cx + 2; x++) if ((x + c.frame) % 2) c.pix.put(x, r.torsoTop + 3, C.red);
    }
  },
  estampa_costas: (c) => backPrint(c, c0(c)),
  cordao_veludo: (c) => {
    if (c.slice !== 'back') return;
    const r = c.rig;
    const x = r.view === 'back' ? r.torsoR : r.torsoL;
    c.pix.line(r.cx - 4, r.torsoTop, r.cx + 4, r.torsoBot - 2, hex('#b01a2e'));
    c.pix.box(x - 1, r.torsoTop - 3, x, r.torsoTop - 1, c0(c));
    c.pix.box(x + 3, r.torsoBot - 3, x + 4, r.torsoBot - 1, c0(c));
  },
  projetor_planta_seca: (c) => {
    if (c.slice !== 'back') return;
    const r = c.rig;
    const x = r.view === 'side' ? r.torsoR : r.cx - 2;
    c.pix.box(x, r.torsoTop + 1, x + 3, r.torsoTop + 7, c0(c));
    c.pix.box(x + 1, r.torsoTop + 7, x + 2, r.torsoTop + 8, c1(c));
    if (r.view === 'back') c.pix.put(x + 1, r.torsoTop + 3, C.gold);
  },
  cadeira_diretor_dobrada: (c) => {
    if (c.slice !== 'back') return;
    const r = c.rig;
    const x = r.view === 'side' ? r.torsoR - 1 : r.cx - 4;
    const w = r.view === 'side' ? 3 : 8;
    c.pix.box(x, r.torsoTop - 4, x + w - 1, r.torsoTop - 2, c1(c));
    c.pix.line(x, r.torsoTop - 4, x + w - 1, r.torsoTop + 8, c0(c));
    c.pix.line(x + w - 1, r.torsoTop - 4, x, r.torsoTop + 8, c0(c));
    if (r.view === 'back' && c.text) microText(c.pix, x + 1, r.torsoTop - 3, w - 2, 1, c.text, C.ink);
  },
  lacre_costas: (c) => {
    if (c.slice !== 'back' || c.rig.view !== 'back') return;
    const r = c.rig;
    c.pix.box(r.cx - 5, r.torsoTop + 4, r.cx + 4, r.torsoTop + 6, c0(c));
    c.pix.set(r.cx + 4, r.torsoTop + 6, 0);
    microText(c.pix, r.cx - 4, r.torsoTop + 5, 8, 1, c.text ?? 'GARANTIA', c1(c));
  },
  bobina_tesla_pequena: (c) => tesla(c, 4, 8),
  bobina_tesla: (c) => tesla(c, 6, 14),
  placa_costas: (c) => {
    if (c.slice !== 'back' || c.rig.view !== 'back') return;
    const r = c.rig;
    plate(c.pix, r.cx - 4, r.torsoTop + 3, 8, 6, c0(c), c.text, c1(c));
    c.pix.box(r.cx - 3, r.torsoTop + 4, r.cx - 2, r.torsoTop + 6, C.red); // o zero em destaque
  },
  // ---------------- cintura
  pochete: (c) => {
    if (c.slice !== 'torso') return;
    const r = c.rig;
    if (r.view === 'back') {
      c.pix.line(r.torsoL, r.torsoTop + 2, r.torsoR, r.waistY, c0(c));
      return;
    }
    const x = r.view === 'side' ? r.torsoL : r.cx - 3;
    c.pix.line(r.torsoR, r.torsoTop + 2, x + 3, r.waistY - 2, c0(c));
    c.pix.box(x, r.waistY - 2, x + 5, r.waistY, c0(c));
    c.pix.put(x + 2, r.waistY - 1, c1(c));
  },
  cinto_maquininha: (c) => {
    belt(c, c0(c));
    const p = waistSpot(c.rig, 'right');
    if (c.slice === 'torso' && p) {
      c.pix.box(p.x, p.y, p.x + 2, p.y + 3, c0(c));
      c.pix.put(p.x + 1, p.y + 1, c1(c));
    }
  },
  fivela_touro_pequena: (c) => {
    belt(c, hex('#5a3a22'));
    const p = waistSpot(c.rig, 'front');
    if (c.slice === 'torso' && p) {
      c.pix.ellipse(p.x, p.y + 0.5, 3, 2, c0(c));
      c.pix.hline(p.x - 2, p.x + 1, p.y, dk(c0(c)));
    }
  },
  fivela_touro: (c) => {
    belt(c, hex('#5a3a22'), 2);
    const p = waistSpot(c.rig, 'front');
    if (c.slice !== 'torso' || !p) return;
    const w = c.rig.view === 'side' ? 4 : 12;
    const x = c.rig.view === 'side' ? p.x - 2 : p.x - 6;
    const y = p.y - 4;
    c.pix.ellipse(x + w / 2, y + 4, w / 2, 4, c0(c));
    c.pix.ring(x + w / 2, y + 4, w / 2, 4, 1, dk(c0(c)));
    if (c.rig.view === 'front') {
      // chifres em relevo e "TOURO"
      c.pix.put(x + 2, y + 1, C.paper);
      c.pix.put(x + 9, y + 1, C.paper);
      microText(c.pix, x + 3, y + 4, 6, 1, 'TOURO', dk(dk(c0(c))));
      c.pix.put(x + 3, y + 2, light(c0(c), 0.5));
    }
  },
  garrafinha_kombucha: (c) => {
    const p = waistSpot(c.rig, 'right');
    if (c.slice !== 'torso' || !p) return;
    c.pix.box(p.x, p.y, p.x + 1, p.y + 3, c0(c));
    c.pix.put(p.x, p.y - 1, c1(c));
    if (c.frame % 2) c.pix.put(p.x + 1, p.y + 1, C.pureWhite);
  },
  rolo_de_massa: (c) => {
    const p = waistSpot(c.rig, 'left');
    if (c.slice !== 'torso' || !p) return;
    c.pix.line(p.x - 1, p.y - 3, p.x + 2, p.y + 3, c0(c));
    c.pix.line(p.x, p.y - 3, p.x + 3, p.y + 3, dk(c0(c)));
  },
  faixa_cintura: (c) => {
    belt(c, c0(c), 2);
    const p = waistSpot(c.rig, 'left');
    if (c.slice === 'torso' && p) c.pix.vline(p.x, p.y + 1, p.y + 5, c0(c));
  },
  cinto_couro_fivela: (c) => {
    belt(c, c0(c));
    const p = waistSpot(c.rig, 'front');
    if (c.slice === 'torso' && p) c.pix.disk(p.x, p.y + 0.5, 1.5, C.gold);
  },
  cinturao_papelao: (c) => {
    belt(c, c0(c), 3);
    const p = waistSpot(c.rig, 'front');
    if (c.slice !== 'torso' || !p) return;
    c.pix.box(p.x - 4, p.y - 2, p.x + 3, p.y + 2, c0(c));
    c.pix.frame(p.x - 4, p.y - 2, p.x + 3, p.y + 2, dk(c0(c)));
    c.pix.put(p.x - 1, p.y, c1(c));
    c.pix.put(p.x + 3, p.y - 2, hex('#a08a5a')); // borda amassada
  },
  mawashi_led: (c) => {
    if (c.slice !== 'torso') return;
    const r = c.rig;
    for (let y = r.waistY - 1; y <= r.torsoBot + 1; y++) {
      const s = torsoSpan(r, Math.min(y, r.torsoBot));
      if (s) c.pix.hline(s[0] - 1, s[1] + 1, y, c0(c));
    }
    const s = torsoSpan(r, r.waistY);
    if (s) for (let x = s[0]; x <= s[1]; x += 2) c.pix.put(x, r.waistY, (x + c.frame) % 4 < 2 ? c1(c) : C.neonCyan);
    if (r.view !== 'back') c.pix.vline(r.cx, r.torsoBot, r.torsoBot + 5, c0(c));
  },
  prancheta_lista: (c) => {
    const p = waistSpot(c.rig, 'right');
    if (c.slice !== 'torso' || !p) return;
    c.pix.box(p.x, p.y - 1, p.x + 3, p.y + 3, c0(c));
    c.pix.hline(p.x + 1, p.x + 2, p.y - 1, c1(c));
    c.pix.hline(p.x + 1, p.x + 2, p.y + 1, C.ink);
  },
  coldre: (c) => {
    belt(c, c0(c));
    if (c.slice !== 'torso') return;
    const r = c.rig;
    const x = r.view === 'back' ? r.torsoL : r.view === 'side' ? r.cx + 1 : r.torsoR - 1;
    c.pix.box(x, r.waistY + 2, x + 2, r.waistY + 6, dk(c0(c)));
    for (let i = 0; i < 4; i++) c.pix.put(r.torsoL + 1 + i * 3, r.waistY, C.gold); // balas
  },
  // ---------------- mão principal
  cajado_vassoura_folha: (c) => {
    const s = heldStick(c, 18, c0(c));
    if (s) c.pix.ellipse(s.tx, s.ty - 1, 1.5, 2, c1(c));
  },
  cassetete_lanterna: (c) => {
    const s = heldStick(c, 9, c0(c), 'main', 3);
    if (s) {
      c.pix.put(fr(s.tx), fr(s.ty), c1(c));
      if (c.anim === 'basico' || c.anim === 'habilidade') c.pix.put(fr(s.tx), fr(s.ty) - 1, withAlpha(C.warn, 200));
    }
  },
  laco_benzido: (c) => lasso(c, c0(c), c1(c)),
  espingarda_benzida_flores: (c) => shotgun(c, false),
  espingarda_benzida_flores_croche: (c) => shotgun(c, true),
  arco_recurvo: (c) => {
    if (!handSliceOk(c, 'main')) return;
    const h = handOf(c, 'main');
    const x = fr(h.x) + (c.rig.view === 'side' ? -1 : 0);
    const y = fr(h.y);
    const col = c0(c);
    c.pix.line(x, y - 7, x - 2, y - 4, col);
    c.pix.line(x - 2, y - 4, x - 2, y + 4, col);
    c.pix.line(x - 2, y + 4, x, y + 7, col);
    c.pix.put(x + 1, y - 7, col);
    c.pix.put(x + 1, y + 7, col);
    const pull = c.anim === 'basico' && c.frame === 0 ? 2 : 0;
    c.pix.line(x, y - 7, x + pull, y, C.white);
    c.pix.line(x + pull, y, x, y + 7, C.white);
  },
  laco_captura: (c) => {
    const s = heldStick(c, 16, c0(c), 'main', 2);
    if (s) c.pix.ring(s.tx - 1, s.ty - 1, 2.5, 2.5, 1, C.paper);
  },
  cajado_placa: (c) => {
    const s = heldStick(c, 22, c0(c), 'main', 1);
    if (!s) return;
    c.pix.line(fr(s.bx) + 1, fr(s.by), fr(s.tx) + 1, fr(s.ty) + 2, dk(c0(c))); // retorcido
    plate(c.pix, fr(s.tx) - 4, fr(s.ty) - 3, 8, 4, c1(c), c.text, C.ink);
  },
  pau_selfie_live: (c) => {
    const s = heldStick(c, 10, C.metal, 'main', 3);
    if (!s) return;
    c.pix.box(fr(s.tx) - 1, fr(s.ty) - 2, fr(s.tx) + 1, fr(s.ty) + 1, c0(c));
    c.pix.put(fr(s.tx), fr(s.ty) - 2, c.frame % 2 ? C.red : c1(c));
  },
  revolver_mira_laser: (c) => {
    if (!handSliceOk(c, 'main')) return;
    const h = handOf(c, 'main');
    const x = fr(h.x);
    const y = fr(h.y);
    const col = c0(c);
    if (c.rig.view === 'side') {
      c.pix.hline(x - 5, x, y - 1, col);
      c.pix.box(x - 1, y - 1, x, y + 1, dk(col));
      if (c.anim === 'basico') c.pix.hline(x - 13, x - 6, y - 1, withAlpha(C.red, 200));
    } else {
      c.pix.vline(x, y, y + 4, col);
      c.pix.box(x - 1, y, x, y + 1, dk(col));
      if (c.anim === 'basico') c.pix.vline(x, y + 5, y + 10, withAlpha(C.red, 200));
    }
    c.pix.put(x, y, c1(c));
  },
  megafone_direcao: (c) => {
    if (!handSliceOk(c, 'main')) return;
    const h = handOf(c, 'main');
    const x = fr(h.x);
    const y = fr(h.y);
    const d = c.rig.view === 'side' ? -1 : 0;
    c.pix.poly(
      [
        [x, y - 2],
        [x + d * 5 - 2, y - 4],
        [x + d * 5 - 2, y + 1],
        [x, y],
      ],
      c0(c),
    );
    c.pix.put(x, y, c1(c));
  },
  chave_fenda_faisca: (c) => {
    const s = heldStick(c, 8, C.metal, 'main', 2);
    if (!s) return;
    c.pix.box(fr(s.bx) - 1, fr(s.by) - 2, fr(s.bx), fr(s.by), c0(c));
    if (c.anim === 'basico' || c.anim === 'habilidade' || c.frame % 3 === 0) {
      c.pix.put(fr(s.tx) - 1, fr(s.ty) - 1, C.warn);
      c.pix.put(fr(s.tx) + 1, fr(s.ty) - 2, C.pureWhite);
    }
  },
  caneca_atendente: (c) =>
    heldBox(c, 'main', 3, 4, c0(c), (x, y) => {
      c.pix.put(x + 3, y + 1, c0(c));
      c.pix.put(x + 1, y + 1, c1(c));
      c.pix.put(x + 1 + (c.frame % 2), y - 1, withAlpha(C.white, 150));
    }),
  // ---------------- mão secundária
  prancheta_quem_entrou: (c) =>
    heldBox(c, 'off', 4, 6, c0(c), (x, y) => {
      c.pix.hline(x + 1, x + 2, y, c1(c));
      for (let j = 2; j < 5; j++) {
        c.pix.put(x + 1, y + j, C.ink);
        c.pix.put(x + 3, y + j, C.ink);
      }
    }),
  notebook_adesivos: (c) =>
    heldBox(c, 'off', 6, 4, c0(c), (x, y) => {
      c.pix.put(x + 1, y + 1, C.neonPink);
      c.pix.put(x + 3, y + 2, C.neonGreen);
      c.pix.put(x + 4, y, C.warn);
    }),
  xicara_cafe: (c) =>
    heldBox(c, 'off', 3, 2, c0(c), (x, y) => {
      c.pix.hline(x - 1, x + 3, y + 2, c1(c)); // pires
      c.pix.put(x + 1 - (c.frame % 2), y - 1, withAlpha(C.white, 140));
      c.pix.put(x + 1, y - 2, withAlpha(C.white, 90));
    }),
  sacola_feira_pao: (c) =>
    heldBox(c, 'off', 6, 7, c0(c), (x, y) => {
      c.pix.line(x + 3, y - 4, x + 5, y + 1, c1(c)); // pão comprido
      c.pix.line(x + 4, y - 4, x + 6, y + 1, dk(c1(c)));
      c.pix.hline(x + 1, x + 4, y + 3, dk(c0(c)));
    }),
  chifre_de_beber: (c) => drinkingHorn(c, false),
  chifre_de_beber_faiscando: (c) => drinkingHorn(c, true),
  totem_lhama_mini: (c) => llama(c, 4, 6),
  totem_lhama: (c) => llama(c, 6, 10),
  leque: (c) => {
    if (!handSliceOk(c, 'off')) return;
    const h = handOf(c, 'off');
    const x = fr(h.x);
    const y = fr(h.y);
    c.pix.poly(
      [
        [x, y + 1],
        [x - 3, y - 3],
        [x + 4, y - 3],
      ],
      c0(c),
    );
    c.pix.hline(x - 2, x + 3, y - 3, c1(c));
  },
  lata_energetico: (c) =>
    heldBox(c, 'off', 2, 4, c0(c), (x, y) => {
      c.pix.put(x, y + 1, c1(c));
      c.pix.put(x + 1, y + 2, c1(c));
    }),
  galao_agua: (c) =>
    heldBox(c, 'off', 5, 7, withAlpha(c0(c), 230), (x, y) => {
      c.pix.hline(x + 1, x + 3, y - 1, c1(c));
      c.pix.box(x + 1, y + 3, x + 3, y + 5, hex('#7ab8e8'));
    }),
  escudo_choque_simples: (c) => shield(c, 8, 14, withAlpha(c0(c), 210), c1(c), false),
  escudo_hoje_nao: (c) => shield(c, 10, 16, withAlpha(c0(c), 220), c1(c), true),
  claquete: (c) =>
    heldBox(c, 'off', 5, 4, c0(c), (x, y) => {
      const open = c.anim === 'habilidade' && c.frame % 2 === 0;
      for (let i = 0; i < 5; i++) c.pix.put(x + i, y - (open ? 2 : 1), i % 2 ? c1(c) : C.ink);
    }),
  patente_carimbada: (c) => heldBox(c, 'off', 4, 5, c0(c), (x, y) => c.pix.disk(x + 2, y + 2.5, 1.3, C.red)),
  garrafa_agua_media: (c) => heldBox(c, 'off', 3, 6, c0(c), (x, y) => c.pix.vline(x + 2, y - 2, y, c1(c))),
  garrafa_agua_gigante: (c) =>
    heldBox(c, 'off', 5, 12, withAlpha(c0(c), 230), (x, y) => {
      for (let j = 2; j < 11; j += 3) c.pix.put(x + 1, y + j, c1(c));
      c.pix.vline(x + 3, y - 3, y, c1(c));
    }),
  escudo_holo_aguarde: (c) => {
    if (!handSliceOk(c, 'off')) return;
    const h = handOf(c, 'off');
    const w = 10;
    const hh = 12;
    const x = fr(h.x - (c.rig.view === 'side' ? 7 : 5));
    const y = fr(h.y - 8);
    const col = withAlpha(c0(c), 110);
    c.pix.box(x, y, x + w - 1, y + hh - 1, col);
    c.pix.frame(x, y, x + w - 1, y + hh - 1, withAlpha(light(c0(c), 0.5), 200));
    microText(c.pix, x + 2, y + 3, 6, 1, c.text ?? 'AGUARDE', withAlpha(C.pureWhite, 220));
    // barra de carregamento travada
    c.pix.hline(x + 2, x + 7, y + 8, withAlpha(C.white, 120));
    c.pix.hline(x + 2, x + 6, y + 8, withAlpha(c1(c), 230));
  },
  notebook_fibra_otica: (c) =>
    heldBox(c, 'off', 6, 4, c0(c), (x, y) => {
      c.pix.box(x + 1, y - 3, x + 4, y - 1, C.ink);
      for (let i = 0; i < 3; i++) if ((i + c.frame) % 2) c.pix.put(x + 1 + i, y - 2 - (i % 2), C.neonGreen);
      c.pix.box(x + 1, y + 1, x + 3, y + 2, c1(c)); // adesivo grande
    }),
  // ---------------- acompanhantes
  ponei_espirito: (c) => pony(c, false),
  ponei_espirito_desanimado: (c) => pony(c, true),
  fila_pacientes_mini: (c) => {
    const p = floatSpot(c, 12, 7, 'ground', 'back');
    if (!p) return;
    for (let i = 0; i < 3; i++) drawTinyPerson(c.pix, p.x + i * 4, p.y + 1 - (i % 2), i === 1 ? c0(c) : c1(c), c.skin.base);
    c.pix.put(p.x + 3, p.y + 3, C.paper);
  },
  drone_camera_um: (c) => {
    const p = floatSpot(c, 5, 3, 'shoulder');
    if (p) drawDrone(c.pix, p.x, p.y - 4, c0(c), true, c.frame);
  },
  drones_camera_dois: (c) => {
    if (c.slice !== 'front') return;
    const r = c.rig;
    const a = ((c.frame % 6) / 6) * Math.PI * 2;
    for (const k of [0, Math.PI]) {
      const x = r.cx + Math.round(Math.cos(a + k) * 11) - 2;
      const y = r.headTop + 2 + Math.round(Math.sin(a + k) * 3);
      drawDrone(c.pix, x, y, c0(c), true, c.frame);
    }
  },
  robo_frigobar: (c) => {
    const p = floatSpot(c, 8, 10, 'ground');
    if (p) drawFridge(c.pix, p.x, p.y, 8, 10, c0(c), c1(c), c.frame, false);
  },
  robo_geladeira_skate: (c) => {
    const p = floatSpot(c, 12, 18, 'ground');
    if (p) drawFridge(c.pix, p.x, p.y - 2, 12, 18, c0(c), c1(c), c.frame, true);
  },
  nanobots_rosa: (c) => {
    if (c.slice !== 'front') return;
    const r = c.rig;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + c.frame * 0.7;
      c.pix.put(r.cx + Math.round(Math.cos(a) * 12), r.torsoTop + 4 + Math.round(Math.sin(a) * 9), c0(c));
    }
  },
  caixa_som_voadora: (c) => {
    const p = floatSpot(c, 5, 7, 'shoulder');
    if (p) drawSpeaker(c.pix, p.x, p.y - 6, c0(c), c1(c), c.frame);
  },
  caixas_som_voadoras_duas: (c) => {
    const p = floatSpot(c, 5, 7, 'shoulder');
    const q = floatSpot(c, 5, 7, 'other');
    for (const s of [p, q]) {
      if (!s) continue;
      drawSpeaker(c.pix, s.x, s.y - 6, c0(c), c1(c), c.frame);
      if (c.frame % 2 === 0) c.pix.vline(s.x + (s.x < c.rig.cx ? -1 : 6), s.y - 4, s.y - 1, withAlpha(c1(c), 180));
    }
  },
  // ---------------- aura e veículo
  bastoes_luz_fas_holo: (c) => {
    if (c.slice !== 'under') return;
    const r = c.rig;
    const n = 3 + (c.frame % 3);
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.15 + (0.7 * i) / Math.max(1, n - 1));
      const x = r.cx + Math.round(Math.cos(a) * -13);
      const y = r.torsoTop + 4 - Math.round(Math.sin(a) * 9);
      c.pix.box(x - 1, y + 4, x + 1, y + 6, withAlpha(c1(c), 120)); // mão de fã
      c.pix.vline(x, y, y + 4, withAlpha(i % 2 ? c0(c) : c1(c), 210));
    }
  },
  cadeira_escritorio: (c) => {
    const r = c.rig;
    const col = c0(c);
    const seatY = r.torsoBot;
    if (c.slice === 'under') {
      // encosto atrás do tronco, assento e base de rodinhas
      if (r.view === 'side') c.pix.box(r.cx + 4, r.torsoTop + 2, r.cx + 6, seatY, col);
      else c.pix.box(r.cx - 6, r.torsoTop + 1, r.cx + 5, seatY - 1, col);
      c.pix.box(r.cx - 6, seatY, r.cx + 5, seatY + 2, dk(col));
      c.pix.vline(r.cx, seatY + 3, r.groundY - 2, C.metalDark);
      c.pix.hline(r.cx - 6, r.cx + 5, r.groundY - 1, C.metalDark);
      const spin = c.frame % 2;
      for (const x of [r.cx - 6, r.cx + 5, r.cx - 1 + spin]) c.pix.put(x, r.groundY, C.ink);
    }
  },
  rede_roteador: (c) => {
    if (c.slice !== 'under') return;
    const r = c.rig;
    const idle = c.anim === 'parado';
    const y = idle ? r.torsoTop + 6 : r.torsoTop + 2;
    // dois postes e a rede atrás, com o roteador de luz verde
    c.pix.vline(r.cx - 13, y - 6, r.groundY, c0(c));
    c.pix.vline(r.cx + 12, y - 6, r.groundY, c0(c));
    for (let x = r.cx - 12; x <= r.cx + 11; x++) {
      const sag = Math.round(Math.sin(((x - r.cx + 12) / 24) * Math.PI) * 4);
      c.pix.put(x, y - 5 + sag, c1(c));
      if (idle) c.pix.put(x, y - 4 + sag, (x % 2 ? c1(c) : dk(c1(c))));
    }
    c.pix.box(r.cx + 9, y - 5, r.cx + 11, y - 4, C.ink);
    c.pix.put(r.cx + 10, y - 5, c.frame % 2 ? C.neonGreen : dk(C.neonGreen));
  },
};

// ---------------------------------------------------------------------------
// desenhistas compostos usados acima

function tone(base: Color): Tone {
  return { base, shade: shade(base, 0.7), light: light(base, 0.3) };
}

function spikyHair(c: LayerCtx, sparks: boolean): void {
  if (c.slice !== 'head') return;
  const r = c.rig;
  const col = c0(c);
  dome(c, 4, col, { up: 1 });
  for (let i = 0; i < 6; i++) {
    const x = r.headL - 1 + i * 3 + (i > 2 ? 1 : 0);
    const h = 3 + ((i * 7) % 3);
    c.pix.line(x + 1, r.headTop, x + (i < 3 ? -1 : 2), r.headTop - h, col);
    c.pix.put(x + (i < 3 ? -1 : 2), r.headTop - h, sparks && i % 2 ? hex('#2a2018') : lt(col));
  }
  if (r.view === 'front') {
    c.pix.line(r.headL, r.headTop + 3, r.headL - 3, r.headTop + 1, col);
    c.pix.line(r.headR, r.headTop + 3, r.headR + 3, r.headTop + 1, col);
  }
  if (sparks) {
    const sc = c.cols[1] ?? C.warn;
    c.pix.put(r.headL + 2 + (c.frame % 3) * 3, r.headTop - 4, sc);
    c.pix.put(r.headR - 2 - (c.frame % 2) * 4, r.headTop - 3, C.pureWhite);
  }
}

function beard(c: LayerCtx, len: number): void {
  if (c.slice !== 'head' || c.rig.view === 'back') return;
  const r = c.rig;
  const col = c0(c);
  const bottom = Math.min(r.groundY - 1, r.headBot + len);
  if (r.view === 'front') {
    for (let y = r.mouthY - 1; y <= bottom; y++) {
      const s = headSpan(r, Math.min(y, r.headBot));
      if (!s) continue;
      const k = y > r.headBot ? Math.min(5, fr((y - r.headBot) / (len > 20 ? 6 : 2))) : 0;
      let l = s[0] + 1 + k;
      let rr = s[1] - 1 - k;
      if (y > r.headBot && len > 20) {
        l = r.cx - 4 + fr((y - r.headBot) / 8);
        rr = r.cx + 3 - fr((y - r.headBot) / 8);
      }
      if (l > rr) {
        l = r.cx - 1;
        rr = r.cx;
      }
      c.pix.hline(l, rr, y, (y + l) % 4 === 0 ? dk(col) : col);
      c.pix.put(rr, y, dk(col));
    }
    c.pix.hline(r.cx - 2, r.cx + 1, r.mouthY, C.mouth);
  } else {
    for (let y = r.mouthY - 1; y <= bottom; y++) {
      const x0 = r.headL + (y > r.headBot ? 1 : 0);
      const x1 = r.cx + 1 - (y > r.headBot ? Math.min(4, fr((y - r.headBot) / 3)) : 0);
      c.pix.hline(x0, Math.max(x0, x1), y, col);
    }
    c.pix.set(r.headL + 1, r.mouthY, C.eye);
  }
}

function belly(c: LayerCtx, w: number, chrome: boolean): void {
  if (c.slice !== 'torso') return;
  const r = c.rig;
  const col = c0(c);
  const cy = r.torsoTop + 7.5;
  if (r.view === 'side') {
    c.pix.ellipse(r.cx - 1, cy, 6, 6.5, col);
    c.pix.put(r.cx - 4, cy - 3, chrome ? C.pureWhite : lt(col));
  } else {
    c.pix.ellipse(r.cx, cy, w / 2, 6.5, col);
    c.pix.ring(r.cx, cy, w / 2, 6.5, 1, dk(col));
    c.pix.put(r.cx - fr(w / 2) + 3, fr(cy) - 3, chrome ? C.pureWhite : lt(col));
    if (r.view === 'front') {
      c.pix.put(r.cx - 6, fr(cy), C.ink); // parafusos
      c.pix.put(r.cx + 5, fr(cy), C.ink);
      if (chrome) {
        c.pix.ring(r.cx, cy + 1, 2, 2, 1, C.ink); // manômetro
        c.pix.put(r.cx, fr(cy), c1(c));
        microText(c.pix, r.cx - 4, fr(cy) + 4, 8, 1, c.text ?? 'MANTENHA', dk(dk(col)));
      }
    }
  }
}

function backpack(c: LayerCtx, col: Color, extra?: (x: number, y: number) => void): void {
  if (c.slice !== 'back') return;
  const r = c.rig;
  let x: number;
  if (r.view === 'back') {
    x = r.cx - 4;
    c.pix.box(x, r.torsoTop + 1, x + 7, r.torsoTop + 10, col);
    c.pix.frame(x, r.torsoTop + 1, x + 7, r.torsoTop + 10, dk(col));
    c.pix.hline(x + 1, x + 6, r.torsoTop + 6, dk(col));
  } else if (r.view === 'side') {
    x = r.torsoR;
    c.pix.box(x, r.torsoTop + 1, x + 3, r.torsoTop + 10, col);
  } else {
    x = r.torsoL - 1;
    c.pix.box(x, r.torsoTop, x + 11, r.torsoTop + 8, col);
  }
  extra?.(x, r.torsoTop + 1);
}

function scroll(c: LayerCtx, paper: Color, ink: Color, drag: number): void {
  if (c.slice !== 'back') return;
  const r = c.rig;
  if (r.view === 'side') {
    c.pix.box(r.torsoR, r.torsoTop + 2, r.torsoR + 2, r.torsoTop + 4, paper);
    c.pix.poly([[r.torsoR, r.torsoTop + 4], [r.torsoR + 3, r.torsoTop + 4], [r.cx + 4 + drag, r.groundY + 1], [r.cx + 1 + drag, r.groundY + 1]], paper);
    for (let y = r.torsoTop + 8; y < r.groundY; y += 3) c.pix.put(r.torsoR + 1 + fr(((y - r.torsoTop) * drag) / 30), y, ink);
    return;
  }
  const x = r.cx - 3;
  c.pix.box(x - 1, r.torsoTop + 1, x + 6, r.torsoTop + 3, paper);
  c.pix.box(x, r.torsoTop + 3, x + 5, r.groundY + (r.view === 'back' ? 1 : 0), paper);
  if (r.view === 'back') {
    for (let y = r.torsoTop + 5; y < r.groundY; y += 2) c.pix.hline(x + 1, x + 1 + ((y * 7) % 4), y, ink);
    if (c.text) microText(c.pix, x + 1, r.torsoTop + 5, 4, 2, c.text, ink);
  }
}

function cape(c: LayerCtx, col: Color, len: number, curtain = false, fringe?: Color): void {
  if (c.slice !== 'back') return;
  const r = c.rig;
  const bottom = r.torsoTop + Math.round((r.groundY - r.torsoTop) * len);
  if (r.view === 'side') {
    c.pix.poly([[r.cx + 1, r.torsoTop], [r.cx + 5, r.torsoTop], [r.cx + 8, bottom], [r.cx + 2, bottom]], col);
  } else {
    const flare = r.view === 'back' ? 3 : 2;
    c.pix.poly(
      [
        [r.torsoL - 1, r.torsoTop],
        [r.torsoR + 2, r.torsoTop],
        [r.torsoR + 2 + flare, bottom],
        [r.torsoL - 1 - flare, bottom],
      ],
      col,
    );
    if (curtain && r.view === 'back') for (let x = r.torsoL; x <= r.torsoR + 1; x += 2) c.pix.vline(x, r.torsoTop + 2, bottom, dk(col));
    if (fringe) c.pix.hline(r.torsoL - 1 - flare, r.torsoR + 2 + flare, bottom, fringe);
  }
  if (curtain && r.view !== 'side') {
    c.pix.put(r.torsoL, r.torsoTop, C.gold);
    c.pix.put(r.torsoR, r.torsoTop, C.gold);
  }
}

function tesla(c: LayerCtx, w: number, h: number): void {
  if (c.slice !== 'back') return;
  const r = c.rig;
  const x = r.view === 'side' ? r.torsoR : r.cx - fr(w / 2);
  const y = r.torsoTop + 8 - h;
  for (let j = 0; j < h; j++) c.pix.hline(x, x + w - 1, y + j, j % 2 ? c0(c) : hex('#b87333'));
  c.pix.disk(x + w / 2, y - 1, w / 2 - 0.5, c1(c));
  if (c.frame % 2 === 0) {
    c.pix.put(x - 1, y - 2, C.neonCyan);
    c.pix.put(x + w, y - 3, C.pureWhite);
  }
}

function lasso(c: LayerCtx, rope: Color, glow: Color): void {
  if (!handSliceOk(c, 'main')) return;
  const h = handOf(c, 'main');
  const x = fr(h.x);
  const y = fr(h.y);
  const g = withAlpha(glow, 170);
  if (c.anim === 'basico' || c.anim === 'habilidade' || c.anim === 'especial') {
    // laço girando por cima da cabeça
    const r = c.rig;
    const a = c.frame * 1.2;
    const cx = r.cx + Math.round(Math.cos(a) * 3);
    const cy = r.headTop - 3;
    c.pix.line(x, y, cx, cy + 1, rope);
    c.pix.ring(cx, cy, 6, 2, 1, rope);
    c.pix.put(cx - 5, cy, g);
    c.pix.put(cx + 5, cy, g);
  } else {
    c.pix.ring(x + 0.5, y + 1.5, 2.6, 2.6, 1, rope);
    c.pix.line(x, y + 3, x - 1, y + 6, rope);
    c.pix.put(x + 2, y, g);
  }
}

function shotgun(c: LayerCtx, croche: boolean): void {
  if (!handSliceOk(c, 'main')) return;
  const h = handOf(c, 'main');
  const x = fr(h.x);
  const y = fr(h.y);
  const wood = c0(c);
  const steel = C.metalDark;
  if (c.rig.view === 'side') {
    c.pix.hline(x - 12, x - 1, y - 1, steel);
    c.pix.box(x - 1, y - 1, x + 2, y + 1, wood);
    c.pix.put(x - 11, y - 2, c1(c)); // flores no cano
    c.pix.put(x - 12, y - 2, c2(c));
    if (croche) c.pix.ring(x - 6, y - 3, 1.6, 1.6, 1, C.white);
  } else {
    c.pix.vline(x, y - 12, y, steel);
    c.pix.box(x - 1, y, x, y + 3, wood);
    c.pix.put(x - 1, y - 12, c1(c));
    c.pix.put(x + 1, y - 11, c2(c));
    if (croche) c.pix.ring(x + 0.5, y - 6, 1.6, 1.6, 1, C.white);
  }
  if (c.anim === 'basico' && c.frame === 1) c.pix.put(c.rig.view === 'side' ? x - 13 : x, c.rig.view === 'side' ? y - 1 : y - 13, C.warn);
}

function drinkingHorn(c: LayerCtx, sparks: boolean): void {
  if (!handSliceOk(c, 'off')) return;
  const h = handOf(c, 'off');
  const x = fr(h.x);
  const y = fr(h.y);
  c.pix.line(x - 1, y + 1, x + 2, y - 3, c0(c));
  c.pix.line(x, y + 1, x + 3, y - 3, dk(c0(c)));
  c.pix.hline(x + 1, x + 4, y - 4, C.white); // espuma
  if (sparks) {
    c.pix.put(x + 2 + (c.frame % 2), y - 6, C.warn);
    c.pix.put(x + 4, y - 5 - (c.frame % 2), C.pureWhite);
  }
}

function llama(c: LayerCtx, w: number, h: number): void {
  if (!handSliceOk(c, 'off')) return;
  const p = handOf(c, 'off');
  const x = fr(p.x - w / 2);
  const y = fr(p.y - h + 2);
  const col = c0(c);
  c.pix.box(x, y + fr(h * 0.5), x + w - 1, y + h - 1, col); // corpo
  c.pix.box(x, y, x + 1, y + fr(h * 0.5), col); // pescoço comprido
  c.pix.put(x, y - 1, col);
  c.pix.put(x + 1, y - 1, col); // orelhas em pé
  c.pix.put(x + 1, y + 1, C.eye);
  c.pix.hline(x, x + w - 1, y + h - 1, dk(col));
  c.pix.put(x + w - 1, y + fr(h * 0.5), c1(c));
}

function shield(c: LayerCtx, w: number, h: number, col: Color, ink: Color, text: boolean): void {
  if (!handSliceOk(c, 'off')) return;
  const p = handOf(c, 'off');
  const r = c.rig;
  const x = fr(r.view === 'side' ? p.x - w + 2 : p.x - w / 2);
  const y = fr(p.y - h * 0.65);
  c.pix.box(x, y, x + w - 1, y + h - 1, col);
  c.pix.frame(x, y, x + w - 1, y + h - 1, dk(col));
  c.pix.vline(x + 1, y + 1, y + 4, withAlpha(C.pureWhite, 160));
  if (text && r.view !== 'back') microText(c.pix, x + 2, y + 4, w - 4, 2, c.text ?? 'HOJE NAO', ink);
}

function pony(c: LayerCtx, sad: boolean): void {
  const p = floatSpot(c, 14, 12, 'ground', c.rig.view === 'back' ? 'front' : 'front');
  if (!p) return;
  const r = c.rig;
  const flip = r.view === 'front' ? true : r.view === 'back' ? false : false;
  const x = r.view === 'side' ? Math.max(0, r.cx - 18) : r.view === 'back' ? 0 : r.W - 14;
  drawPony(c.pix, x, p.y, withAlpha(c0(c), 140), sad, flip, c.frame);
}

/** Desenhista de reserva por parte, para chaves fora do catálogo conhecido. */
export function fallbackDrawer(part: string): Drawer {
  switch (part) {
    case 'cabeca':
      return (c) => brimHat(c, { brim: 16, crownW: 12, crownH: 4 });
    case 'rosto':
      return (c) => glasses(c, 'round', c0(c));
    case 'torso':
      return T({ sleeve: 'short' });
    case 'bracos':
      return (c) => armBand(c, 'off', 0.2, 0.35, c0(c));
    case 'pernas':
      return Pn({ len: 1 });
    case 'pes':
      return S('shoe');
    case 'costas':
      return (c) => backPrint(c, c0(c));
    case 'cintura':
      return (c) => belt(c, c0(c));
    case 'mao_principal':
      return (c) => {
        heldStick(c, 10, c0(c));
      };
    case 'mao_secundaria':
      return (c) => heldBox(c, 'off', 3, 4, c0(c));
    case 'acompanhante':
      return (c) => {
        const p = floatSpot(c, 5, 5, 'shoulder');
        if (p) c.pix.box(p.x, p.y - 4, p.x + 4, p.y, c0(c));
      };
    default:
      return () => undefined;
  }
}

export {
  fwd,
  armsOf,
  armMark,
  backPrint,
  belt,
  brimHat,
  capHat,
  cape,
  dome,
  floatSpot,
  fullMask,
  glasses,
  handOf,
  handSliceOk,
  heldBox,
  heldStick,
  pants,
  plate,
  shirt,
  shoes,
  vest,
  waistSpot,
};
