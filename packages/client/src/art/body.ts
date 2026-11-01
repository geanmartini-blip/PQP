/**
 * Corpo do kit de criação: pele, cabeça, membros, rostos (16, com expressões), cortes de cabelo
 * (20) e detalhes (barba, bigode, óculos, dente de ouro, tatuagem...). Funções puras sobre Pix.
 */
import { C, type Color, hex, light, mix, Pix, shade } from './pixel';
import { headSpan, type Limb, type Rig, torsoSpan } from './rig';

export interface Tone {
  base: Color;
  shade: Color;
  light: Color;
  /** segunda cor (marca de regata) */
  second?: Color;
}

export function tone(c: Color, s?: Color, second?: Color): Tone {
  return { base: c, shade: s ?? shade(c, 0.74), light: light(c, 0.22), second };
}

// ---------------------------------------------------------------------------
// pele e membros

export function drawLimb(pix: Pix, l: Limb, t: Tone, dark = false): void {
  const base = dark ? t.shade : t.base;
  pix.capsule(l.a.x, l.a.y, l.b.x, l.b.y, l.w, base, dark ? shade(t.shade, 0.85) : t.shade);
}

export function drawHand(pix: Pix, l: Limb, t: Tone, dark = false): void {
  const r = Math.max(1.4, l.w / 2 + 0.1);
  pix.disk(l.b.x, l.b.y + 0.5, r, dark ? t.shade : t.base);
  pix.put(Math.floor(l.b.x + r - 1), Math.floor(l.b.y + 0.5), dark ? shade(t.shade, 0.85) : t.shade);
}

/** Parte do membro entre t0 e t1 (manga, calça), por cima do membro. */
export function drawLimbPart(pix: Pix, l: Limb, t0: number, t1: number, c: Color, edge?: Color, extraW = 0.6): void {
  const a = { x: l.a.x + (l.b.x - l.a.x) * t0, y: l.a.y + (l.b.y - l.a.y) * t0 };
  const b = { x: l.a.x + (l.b.x - l.a.x) * t1, y: l.a.y + (l.b.y - l.a.y) * t1 };
  pix.capsule(a.x, a.y, b.x, b.y, l.w + extraW, c, edge ?? shade(c, 0.72));
}

export function drawLegSkin(pix: Pix, rig: Rig, t: Tone): void {
  if (rig.view === 'side') {
    drawLimb(pix, rig.legA, t, true);
    drawLimb(pix, rig.legB, t);
  } else {
    drawLimb(pix, rig.legA, t);
    drawLimb(pix, rig.legB, t);
  }
}

export function drawTorsoSkin(pix: Pix, rig: Rig, t: Tone): void {
  for (let y = rig.torsoTop; y <= rig.torsoBot; y++) {
    const s = torsoSpan(rig, y);
    if (!s) continue;
    pix.hline(s[0], s[1], y, t.base);
    pix.put(s[1], y, t.shade);
  }
}

/** Pés descalços. */
export function drawBareFeet(pix: Pix, rig: Rig, t: Tone): void {
  for (const f of [rig.footA, rig.footB]) {
    pix.box(f.x0, f.y0 + 1, f.x1, f.y1, t.base);
    pix.hline(f.x0, f.x1, f.y1, t.shade);
  }
}

/**
 * Cabeças desenhadas à mão, uma por vista, como mapa de pixels: h highlight, l luz, b base,
 * s sombra, d sombra funda. Luz de cima à esquerda. A silhueta é a mesma de headSpan (chapéus e
 * máscaras do artCatalog se apoiam nela). De lado, o rosto olha para a esquerda.
 */
const HEAD_FRONT = [
  '....lllbbbbb....',
  '..llhhlbbbbbbs..',
  '.llhhlbbbbbbbbs.',
  'llhlbbbbbbbbbbss',
  'llbbbbbbbbbbbbss',
  'lbbbbbbbbbbbbbss',
  'lbbbbbbbbbbbbbss',
  'lbbbbbbbbbbbbbss',
  'bbbbbbbbbbbbbbss',
  'blbbbbbbbbbbbsss',
  'bbbbbbbbbbbbbsss',
  'sbbbbbbbbbbbbssd',
  '.sbbbbbbbbbbbsd.',
  '..ssbbbbbbbssd..',
  '....sssssssd....',
];
const HEAD_SIDE = [
  '....lllbbbb...',
  '..llhhbbbbbbs.',
  '.llhhbbbbbbbbs',
  'llhbbbbbbbbbss',
  'lbbbbbbbbbbbss',
  'lbbbbbbbbbbbss',
  'bbbbbbbbbbbbss',
  'bbbbbbbbbbbbss',
  'bbbbbbbbbbbsss',
  'bbbbbbbbbbbsss',
  'bbbbbbbbbbbsss',
  'sbbbbbbbbbsss.',
  'sbbbbbbbbssd..',
  '.ssbbbbssd....',
  '...sssss......',
];
const HEAD_BACK = [
  '....lllbbbbb....',
  '..llllbbbbbbbs..',
  '.llllbbbbbbbbbs.',
  'llbbbbbbbbbbbbss',
  'lbbbbbbbbbbbbbss',
  'lbbbbbbbbbbbbbss',
  'bbbbbbbbbbbbbbss',
  'bbbbbbbbbbbbbbss',
  'bbbbbbbbbbbbbsss',
  'bbbbbbbbbbbbbsss',
  'bbbbbbbbbbbbbsss',
  'sbbbbbbbbbbbbssd',
  '.sbbbbbbbbbbbsd.',
  '..ssssbbbbsssd..',
  '....ssssssss....',
];

function skinTone(t: Tone, ch: string): Color | undefined {
  switch (ch) {
    case 'h':
      return light(t.base, 0.42);
    case 'l':
      return t.light;
    case 'b':
      return t.base;
    case 's':
      return t.shade;
    case 'd':
      return shade(t.shade, 0.8);
    default:
      return undefined;
  }
}

/** Desenha um mapa de pixels ASCII com a rampa de pele. */
export function drawSkinMap(pix: Pix, x0: number, y0: number, rows: readonly string[], t: Tone): void {
  for (let j = 0; j < rows.length; j++) {
    const r = rows[j]!;
    for (let i = 0; i < r.length; i++) {
      const c = skinTone(t, r[i]!);
      if (c !== undefined) pix.set(x0 + i, y0 + j, c);
    }
  }
}

export function drawHeadSkin(pix: Pix, rig: Rig, t: Tone): void {
  const rows = rig.view === 'side' ? HEAD_SIDE : rig.view === 'back' ? HEAD_BACK : HEAD_FRONT;
  // pescoço com sombra do queixo
  const nx = rig.view === 'side' ? rig.cx : rig.cx - 2;
  pix.box(nx, rig.headBot, nx + 3, rig.headBot + 1, t.shade);
  pix.put(nx + 3, rig.headBot + 1, shade(t.shade, 0.82));
  drawSkinMap(pix, rig.headL, rig.headTop, rows, t);
  // orelhas: lóbulo claro em cima, sombra embaixo e o miolo fundo
  if (rig.view === 'front' || rig.view === 'back') {
    pix.put(rig.headL - 1, rig.eyeY, t.light);
    pix.put(rig.headL - 1, rig.eyeY + 1, t.base);
    pix.put(rig.headL - 1, rig.eyeY + 2, t.shade);
    pix.put(rig.headR + 1, rig.eyeY, t.base);
    pix.put(rig.headR + 1, rig.eyeY + 1, t.shade);
    pix.put(rig.headR + 1, rig.eyeY + 2, shade(t.shade, 0.8));
  } else {
    pix.put(rig.cx + 2, rig.eyeY, t.base);
    pix.put(rig.cx + 3, rig.eyeY, t.shade);
    pix.put(rig.cx + 2, rig.eyeY + 1, shade(t.shade, 0.75));
    pix.put(rig.cx + 3, rig.eyeY + 1, t.shade);
    pix.put(rig.cx + 2, rig.eyeY + 2, t.shade);
    // nariz para fora, com luz em cima
    pix.put(rig.headL - 1, rig.eyeY + 1, t.light);
    pix.put(rig.headL - 1, rig.eyeY + 2, t.base);
    pix.put(rig.headL, rig.eyeY + 3, t.shade);
  }
}

// ---------------------------------------------------------------------------
// rostos

export type EyeKind = 'dot' | 'sleepy' | 'wide' | 'squint' | 'wink' | 'happy' | 'x' | 'aside' | 'down' | 'teary';
export type BrowKind = 'none' | 'flat' | 'angry' | 'raised' | 'worried' | 'villain' | 'low';
export type MouthKind = 'smile' | 'flat' | 'grin' | 'yellow' | 'smirk' | 'frown' | 'open' | 'small' | 'grit' | 'wobble' | 'service';

export interface FaceSpec {
  eyes: EyeKind;
  brows: BrowKind;
  mouth: MouthKind;
  cheeks?: boolean;
  wrinkles?: boolean;
  noseUp?: boolean;
}

/** Os 16 rostos de appearance.json, pelo id. */
export const FACES: Record<string, FaceSpec> = {
  cara_de_sono: { eyes: 'sleepy', brows: 'flat', mouth: 'small' },
  sorriso_amarelo: { eyes: 'dot', brows: 'worried', mouth: 'yellow' },
  sobrancelha_de_vilao: { eyes: 'dot', brows: 'villain', mouth: 'smirk' },
  tranquilo: { eyes: 'dot', brows: 'none', mouth: 'smile' },
  sorridente: { eyes: 'happy', brows: 'raised', mouth: 'grin', cheeks: true },
  cara_fechada: { eyes: 'squint', brows: 'angry', mouth: 'frown' },
  desconfiado: { eyes: 'squint', brows: 'low', mouth: 'flat' },
  olho_arregalado: { eyes: 'wide', brows: 'raised', mouth: 'open' },
  cara_de_paisagem: { eyes: 'dot', brows: 'none', mouth: 'flat' },
  sorriso_de_canto: { eyes: 'dot', brows: 'flat', mouth: 'smirk' },
  cara_de_boleto: { eyes: 'dot', brows: 'worried', mouth: 'frown', wrinkles: true },
  cara_de_assembleia: { eyes: 'sleepy', brows: 'low', mouth: 'flat' },
  piscadinha: { eyes: 'wink', brows: 'raised', mouth: 'smirk' },
  bochechudo: { eyes: 'dot', brows: 'none', mouth: 'small', cheeks: true },
  olhar_perdido: { eyes: 'aside', brows: 'worried', mouth: 'small' },
  nariz_empinado: { eyes: 'down', brows: 'raised', mouth: 'flat', noseUp: true },
};

/** Rosto com a expressão da animação (briga, vitória, derrota). */
export function faceWithExpression(f: FaceSpec, e: 'neutro' | 'briga' | 'vitoria' | 'derrota'): FaceSpec {
  if (e === 'neutro') return f;
  if (e === 'briga')
    return {
      ...f,
      brows: f.brows === 'villain' ? 'villain' : 'angry',
      eyes: f.eyes === 'wide' ? 'wide' : f.eyes === 'sleepy' ? 'sleepy' : f.eyes === 'happy' || f.eyes === 'wink' ? 'dot' : f.eyes,
      mouth: f.mouth === 'service' ? 'service' : 'grit',
    };
  if (e === 'vitoria')
    return { ...f, eyes: f.eyes === 'wink' ? 'wink' : 'happy', brows: f.brows === 'villain' ? 'villain' : 'raised', mouth: f.mouth === 'service' ? 'service' : f.mouth === 'yellow' ? 'yellow' : 'grin' };
  return { ...f, eyes: f.eyes === 'sleepy' ? 'sleepy' : 'x', brows: 'worried', mouth: f.mouth === 'service' ? 'service' : 'wobble' };
}

const IRIS = hex('#3a2a40');

function drawEye(pix: Pix, rig: Rig, ex: number, ey: number, kind: EyeKind, outer: -1 | 1, skin: Tone, which: 0 | 1): void {
  const d = C.eye;
  // olho de 2x2 com brilho no canto de cima à esquerda (a luz vem de lá nos dois olhos)
  const x0 = Math.min(ex, ex + outer);
  switch (kind) {
    case 'dot':
      pix.set(x0, ey, C.eyeWhite);
      pix.set(x0 + 1, ey, d);
      pix.set(x0, ey + 1, d);
      pix.set(x0 + 1, ey + 1, IRIS);
      // pálpebra: sombra da pele em cima
      pix.set(x0, ey - 1, skin.shade);
      pix.set(x0 + 1, ey - 1, skin.shade);
      break;
    case 'down':
      pix.set(ex, ey + 1, d);
      pix.set(ex + outer, ey + 1, IRIS);
      pix.set(ex + outer, ey, skin.shade);
      pix.set(ex, ey, skin.shade);
      break;
    case 'sleepy':
      pix.set(ex, ey, skin.shade);
      pix.set(ex + outer, ey, skin.shade);
      pix.set(ex, ey + 1, d);
      pix.set(ex + outer, ey + 1, d);
      break;
    case 'wide':
      pix.set(ex + outer, ey, C.eyeWhite);
      pix.set(ex + outer, ey + 1, C.eyeWhite);
      pix.set(ex, ey, d);
      pix.set(ex, ey + 1, d);
      pix.set(ex + outer, ey - 1, d);
      pix.set(ex, ey - 1, d);
      pix.set(ex - outer, ey, C.eyeWhite);
      pix.set(ex + outer, ey + 2, skin.shade);
      break;
    case 'squint':
      pix.set(ex, ey + 1, d);
      pix.set(ex + outer, ey + 1, d);
      pix.set(ex, ey, skin.shade);
      pix.set(ex + outer, ey, skin.shade);
      break;
    case 'wink':
      if (which === 1) {
        pix.set(ex, ey + 1, d);
        pix.set(ex + outer, ey + 1, d);
        pix.set(ex - outer, ey, d);
      } else {
        pix.set(ex, ey, d);
        pix.set(ex, ey + 1, d);
      }
      break;
    case 'happy':
      pix.set(ex - 1, ey + 1, d);
      pix.set(ex, ey, d);
      pix.set(ex + 1, ey + 1, d);
      break;
    case 'x':
      pix.set(ex - 1, ey - 1, d);
      pix.set(ex + 1, ey - 1, d);
      pix.set(ex, ey, d);
      pix.set(ex - 1, ey + 1, d);
      pix.set(ex + 1, ey + 1, d);
      break;
    case 'aside': {
      const s = rig.view === 'side' ? -1 : 1;
      pix.set(ex, ey, C.eyeWhite);
      pix.set(ex, ey + 1, C.eyeWhite);
      pix.set(ex + s, ey, d);
      pix.set(ex + s, ey + 1, d);
      break;
    }
    case 'teary':
      pix.set(x0, ey, C.eyeWhite);
      pix.set(x0 + 1, ey, d);
      pix.set(x0, ey + 1, d);
      pix.set(x0 + 1, ey + 1, d);
      pix.set(ex, ey + 2, hex('#7ac8f0'));
      break;
  }
}

function drawBrow(pix: Pix, ex: number, by: number, kind: BrowKind, inner: -1 | 1, c: Color, which: 0 | 1): void {
  switch (kind) {
    case 'none':
      return;
    case 'flat':
      pix.set(ex, by, c);
      pix.set(ex - inner, by, c);
      return;
    case 'low':
      pix.set(ex, by + 1, c);
      pix.set(ex - inner, by + 1, c);
      pix.set(ex + inner, by + 1, c);
      return;
    case 'raised':
      pix.set(ex, by - 1, c);
      pix.set(ex - inner, by - 1, c);
      return;
    case 'angry':
      pix.set(ex + inner, by + 1, c);
      pix.set(ex, by, c);
      pix.set(ex - inner, by - 1, c);
      return;
    case 'worried':
      pix.set(ex + inner, by - 1, c);
      pix.set(ex, by, c);
      pix.set(ex - inner, by, c);
      return;
    case 'villain':
      if (which === 0) {
        pix.set(ex + inner, by + 1, c);
        pix.set(ex, by, c);
        pix.set(ex - inner, by, c);
      } else {
        pix.set(ex + inner, by - 2, c);
        pix.set(ex, by - 2, c);
        pix.set(ex - inner, by - 1, c);
      }
      return;
  }
}

function drawMouthFront(pix: Pix, cx: number, my: number, kind: MouthKind, skin: Tone, gold: boolean): void {
  const m = C.mouth;
  const d = C.eye;
  switch (kind) {
    case 'smile':
      pix.set(cx - 2, my - 1, d);
      pix.set(cx - 1, my, d);
      pix.set(cx, my, d);
      pix.set(cx + 1, my - 1, d);
      break;
    case 'flat':
      pix.hline(cx - 1, cx, my, d);
      break;
    case 'small':
      pix.hline(cx - 1, cx, my, shade(skin.shade, 0.7));
      break;
    case 'grin':
      pix.hline(cx - 2, cx + 1, my - 1, d);
      pix.hline(cx - 1, cx, my, m);
      pix.set(cx - 2, my, d);
      pix.set(cx + 1, my, d);
      break;
    case 'yellow':
      pix.hline(cx - 3, cx + 2, my, hex('#e8dc9a'));
      pix.set(cx - 3, my, d);
      pix.set(cx + 2, my, d);
      pix.hline(cx - 2, cx + 1, my + 1, shade(skin.shade, 0.8));
      break;
    case 'smirk':
      pix.hline(cx - 1, cx, my, d);
      pix.set(cx + 1, my - 1, d);
      break;
    case 'frown':
      pix.set(cx - 2, my + 1, d);
      pix.hline(cx - 1, cx, my, d);
      pix.set(cx + 1, my + 1, d);
      break;
    case 'open':
      pix.box(cx - 1, my - 1, cx, my, d);
      break;
    case 'grit':
      pix.hline(cx - 2, cx + 1, my, C.tooth);
      pix.set(cx - 3, my, d);
      pix.set(cx + 2, my, d);
      pix.hline(cx - 2, cx + 1, my - 1, d);
      pix.hline(cx - 2, cx + 1, my + 1, d);
      break;
    case 'wobble':
      pix.set(cx - 2, my + 1, d);
      pix.set(cx - 1, my, d);
      pix.set(cx, my + 1, d);
      pix.set(cx + 1, my, d);
      break;
    case 'service':
      // sorriso de atendimento: largo e fixo
      pix.set(cx - 3, my - 1, d);
      pix.hline(cx - 2, cx + 1, my, d);
      pix.hline(cx - 1, cx, my + 1, C.tooth);
      pix.set(cx + 2, my - 1, d);
      break;
  }
  if (gold) pix.set(cx, my, C.gold);
}

function drawMouthSide(pix: Pix, x: number, my: number, kind: MouthKind, gold: boolean): void {
  const d = C.eye;
  switch (kind) {
    case 'grin':
    case 'open':
    case 'grit':
    case 'service':
      pix.set(x, my, d);
      pix.set(x + 1, my, kind === 'grit' ? C.tooth : C.mouth);
      pix.set(x + 2, my - 1, d);
      break;
    case 'frown':
    case 'wobble':
      pix.set(x, my + 1, d);
      pix.set(x + 1, my, d);
      break;
    case 'smile':
    case 'smirk':
    case 'yellow':
      pix.set(x, my, d);
      pix.set(x + 1, my, d);
      pix.set(x + 2, my - 1, d);
      break;
    default:
      pix.set(x, my, d);
      pix.set(x + 1, my, d);
  }
  if (gold) pix.set(x + 1, my, C.gold);
}

export interface FaceExtras {
  browColor: Color;
  goldTooth: boolean;
  darkCircles: boolean;
}

export function drawFace(pix: Pix, rig: Rig, f: FaceSpec, skin: Tone, ex: FaceExtras): void {
  if (rig.view === 'back') return;
  const ey = rig.eyeY;
  const by = ey - 2;
  if (rig.view === 'front') {
    const lx = rig.cx - 4 + Math.round(rig.pose.headTilt);
    const rx = rig.cx + 3 + Math.round(rig.pose.headTilt);
    const cx = rig.cx + Math.round(rig.pose.headTilt);
    if (f.cheeks) {
      pix.hline(lx - 2, lx - 1, ey + 3, mix(skin.base, hex('#e86a6a'), 0.45));
      pix.hline(rx + 1, rx + 2, ey + 3, mix(skin.base, hex('#e86a6a'), 0.45));
    }
    if (ex.darkCircles) {
      pix.hline(lx - 1, lx, ey + 2, mix(skin.shade, hex('#5a3a6a'), 0.5));
      pix.hline(rx, rx + 1, ey + 2, mix(skin.shade, hex('#5a3a6a'), 0.5));
    }
    drawEye(pix, rig, lx, ey, f.eyes, -1, skin, 0);
    drawEye(pix, rig, rx, ey, f.eyes, 1, skin, 1);
    drawBrow(pix, lx, by, f.brows, 1, ex.browColor, 0);
    drawBrow(pix, rx, by, f.brows, -1, ex.browColor, 1);
    // nariz: luz em cima à esquerda, sombra embaixo à direita
    pix.set(cx - 1, ey + 2, skin.light);
    pix.set(cx - 1, ey + 3, skin.shade);
    pix.set(cx, ey + 3, shade(skin.shade, 0.85));
    if (f.noseUp) pix.set(cx, ey + 2, skin.shade);
    // bochecha: um toque rosado sutil
    if (!f.cheeks) {
      pix.set(lx - 1, ey + 3, mix(skin.base, hex('#e86a6a'), 0.18));
      pix.set(rx + 1, ey + 3, mix(skin.shade, hex('#e86a6a'), 0.15));
    }
    if (f.wrinkles) {
      pix.hline(cx - 2, cx + 1, by - 2, skin.shade);
    }
    drawMouthFront(pix, cx, rig.mouthY, f.mouth, skin, ex.goldTooth);
  } else {
    const exx = rig.headL + 3;
    if (f.cheeks) pix.hline(exx, exx + 1, ey + 3, mix(skin.base, hex('#e86a6a'), 0.45));
    if (ex.darkCircles) pix.hline(exx - 1, exx, ey + 2, mix(skin.shade, hex('#5a3a6a'), 0.5));
    if (f.eyes === 'dot') {
      // de lado: pupila na frente, branco atrás
      pix.set(exx, ey, C.eye);
      pix.set(exx, ey + 1, C.eye);
      pix.set(exx + 1, ey, C.eyeWhite);
      pix.set(exx + 1, ey + 1, IRIS);
      pix.set(exx, ey - 1, skin.shade);
    } else drawEye(pix, rig, exx, ey, f.eyes, 1, skin, 0);
    drawBrow(pix, exx, by, f.brows, 1, ex.browColor, 1);
    if (f.noseUp) pix.set(rig.headL - 1, ey + 1, skin.base);
    drawMouthSide(pix, rig.headL + 1, rig.mouthY, f.mouth, ex.goldTooth);
  }
}

// ---------------------------------------------------------------------------
// cabelo

export type HairStyle =
  | 'plain'
  | 'afro'
  | 'mohawk'
  | 'bun'
  | 'ponytail'
  | 'braids'
  | 'dreads'
  | 'curly'
  | 'combover'
  | 'cap'
  | 'buzz'
  | 'spiky'
  | 'quiff'
  | 'mullet'
  | 'bowl'
  | 'homecut'
  | 'long'
  | 'chanel'
  | 'fringe';

export interface HairSpec {
  none?: boolean;
  style: HairStyle;
  /** px de volume acima da cabeça */
  top: number;
  /** linhas da franja a partir do topo da cabeça */
  fringe: number;
  /** até que linha (a partir do topo) desce nas laterais */
  sides: number;
  /** até que linha desce atrás */
  back: number;
  /** px abaixo do queixo (cabelo comprido) */
  long: number;
  /** de costas, cobre a estampa das costas */
  coversBack?: boolean;
}

/** Os 20 cortes de appearance.json, pelo id. */
export const HAIRS: Record<string, HairSpec> = {
  careca: { none: true, style: 'plain', top: 0, fringe: 0, sides: 0, back: 0, long: 0 },
  mullet: { style: 'mullet', top: 1, fringe: 3, sides: 8, back: 14, long: 6 },
  topete_de_gala: { style: 'quiff', top: 3, fringe: 3, sides: 7, back: 11, long: 0 },
  calvicie_penteada: { style: 'combover', top: 0, fringe: 2, sides: 8, back: 10, long: 0 },
  black_power: { style: 'afro', top: 4, fringe: 3, sides: 10, back: 14, long: 0 },
  moicano: { style: 'mohawk', top: 4, fringe: 0, sides: 0, back: 10, long: 0 },
  bone: { style: 'cap', top: 1, fringe: 4, sides: 7, back: 9, long: 0 },
  curtinho_social: { style: 'plain', top: 1, fringe: 3, sides: 7, back: 10, long: 0 },
  raspado: { style: 'buzz', top: 0, fringe: 2, sides: 7, back: 10, long: 0 },
  franja_reta: { style: 'fringe', top: 1, fringe: 5, sides: 10, back: 12, long: 0 },
  coque: { style: 'bun', top: 1, fringe: 3, sides: 8, back: 11, long: 0 },
  rabo_de_cavalo: { style: 'ponytail', top: 1, fringe: 3, sides: 8, back: 12, long: 0 },
  trancas: { style: 'braids', top: 1, fringe: 3, sides: 9, back: 12, long: 8 },
  dreads: { style: 'dreads', top: 2, fringe: 3, sides: 12, back: 15, long: 6 },
  cacheado: { style: 'curly', top: 2, fringe: 3, sides: 10, back: 13, long: 1 },
  liso_comprido: { style: 'long', top: 1, fringe: 3, sides: 13, back: 15, long: 9, coversBack: true },
  chanel: { style: 'chanel', top: 1, fringe: 4, sides: 12, back: 13, long: 0 },
  cuia: { style: 'bowl', top: 1, fringe: 5, sides: 8, back: 9, long: 0 },
  espetado_de_gel: { style: 'spiky', top: 3, fringe: 3, sides: 6, back: 10, long: 0 },
  corte_feito_em_casa: { style: 'homecut', top: 1, fringe: 3, sides: 6, back: 10, long: 0 },
};

/**
 * Volume e mechas do cabelo desenhado num buffer só dele: luz em cima e à esquerda (com brilho no
 * canto), sombra embaixo e à direita, e mechas (linhas de meia-sombra) no miolo. Só recolore os
 * pixels no tom base do cabelo, para não estragar detalhe (elástico, fita, boné).
 */
export function shadeHair(pix: Pix, t: Tone, style: HairStyle): void {
  const w = pix.w;
  const h = pix.h;
  const op = (x: number, y: number) => pix.alphaAt(x, y) >= 200;
  const strand = mix(t.base, t.shade, 0.55);
  const hi = light(t.light, 0.3);
  const changes: [number, number, Color][] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!op(x, y) || pix.get(x, y) !== t.base) continue;
      const up = op(x, y - 1);
      const dn = op(x, y + 1);
      const lf = op(x - 1, y);
      const rt = op(x + 1, y);
      let c: Color | undefined;
      if (!up && dn) c = !lf ? hi : t.light;
      else if (!up && !dn) c = undefined;
      else if (!dn) c = t.shade;
      else if (!rt && lf) c = t.shade;
      else if (!lf && rt) c = t.light;
      else if (style !== 'buzz' && up && dn && lf && rt) {
        // mechas: listras de meia-sombra que descem, deslocadas a cada 4 linhas
        if ((x * 5 + (y >> 2) * 3) % 4 === 0) c = strand;
        // reflexo (faixa de brilho) na parte de cima do cabelo
        else if (!op(x, y - 2) && x < w / 2 + 2 && (x + y) % 3 !== 0) c = t.light;
      }
      if (c !== undefined) changes.push([x, y, c]);
    }
  for (const [x, y, c] of changes) pix.set(x, y, c);
}

/** Parte do cabelo que fica atrás da cabeça e do tronco (volume, cabelo comprido, rabo). */
export function drawHairBack(pix: Pix, rig: Rig, h: HairSpec, t: Tone): void {
  if (h.none || rig.view === 'back') return;
  const cx = rig.cx + Math.round(rig.pose.headTilt);
  if (h.style === 'afro') {
    pix.ellipse(cx, rig.headTop + 5.5, 11, 9.5, t.base);
    pix.ring(cx, rig.headTop + 5.5, 11, 9.5, 1, t.shade);
    for (let i = 0; i < 6; i++) pix.put(cx - 8 + i * 3, rig.headTop - 2 + (i % 2), t.light);
  }
  if (h.long > 0 && h.style !== 'mullet' && h.style !== 'braids') {
    const y0 = rig.headTop + 6;
    const y1 = rig.headBot + h.long;
    if (rig.view === 'front') {
      pix.box(rig.headL - 1, y0, rig.headL + 2, y1, t.base);
      pix.box(rig.headR - 2, y0, rig.headR + 1, y1, t.base);
      pix.vline(rig.headL + 2, y0, y1, t.shade);
      pix.vline(rig.headR + 1, y0, y1, t.shade);
    } else {
      pix.box(cx, y0, rig.headR + 1, y1, t.base);
      pix.vline(rig.headR + 1, y0, y1, t.shade);
    }
  }
  if (h.style === 'mullet') {
    if (rig.view === 'front') {
      pix.box(rig.headL, rig.headBot - 3, rig.headL + 2, rig.headBot + h.long, t.base);
      pix.box(rig.headR - 2, rig.headBot - 3, rig.headR, rig.headBot + h.long, t.base);
    } else pix.box(cx + 1, rig.headTop + 8, rig.headR + 1, rig.headBot + h.long, t.base);
  }
  if (h.style === 'ponytail' && rig.view === 'side') {
    pix.capsule(rig.headR, rig.headTop + 4, rig.headR + 3, rig.headBot + 4, 3, t.base, t.shade);
  }
  if (h.style === 'dreads' && rig.view === 'side') {
    for (let i = 0; i < 4; i++) pix.capsule(cx + i * 2, rig.headTop + 5, cx + 1 + i * 2, rig.headBot + h.long, 1.8, i % 2 ? t.shade : t.base);
  }
}

function capRow(pix: Pix, rig: Rig, y: number, c: Color, shadeC: Color): void {
  const s = headSpan(rig, Math.max(y, rig.headTop));
  if (!s) return;
  let [l, r] = s;
  if (y < rig.headTop) {
    const k = rig.headTop - y;
    l += k * 2 + 1;
    r -= k * 2 + 1;
    if (l > r) return;
  }
  pix.hline(l, r, y, c);
  pix.put(r, y, shadeC);
}

/** Cabelo por cima da cabeça (topo, franja, laterais). */
export function drawHairFront(pix: Pix, rig: Rig, h: HairSpec, t: Tone, skin: Tone): void {
  const cx = rig.cx + Math.round(rig.pose.headTilt);
  if (h.none) {
    if (rig.view !== 'back') pix.put(rig.headL + 4, rig.headTop + 1, skin.light);
    return;
  }
  const top = rig.headTop;
  const view = rig.view;

  if (h.style === 'buzz') {
    for (let y = top; y <= top + (view === 'back' ? h.back : h.fringe); y++) {
      const s = headSpan(rig, y);
      if (!s) continue;
      for (let x = s[0]; x <= s[1]; x++) if ((x + y) % 2 === 0) pix.put(x, y, t.base);
    }
    return;
  }
  if (h.style === 'mohawk') {
    const mx = view === 'side' ? cx : cx;
    if (view === 'side') pix.box(rig.headL + 3, top - h.top, rig.headR - 2, top + 1, t.base);
    else pix.box(mx - 2, top - h.top, mx + 1, top + (view === 'back' ? h.back : 2), t.base);
    pix.hline(view === 'side' ? rig.headL + 3 : mx - 2, view === 'side' ? rig.headR - 2 : mx + 1, top - h.top, t.light);
    for (let y = top + 2; y < top + 8; y++) {
      const s = headSpan(rig, y);
      if (!s) continue;
      if (view !== 'side') {
        if (y % 2 === 0) pix.put(s[0] + 1, y, t.shade);
        if (y % 2 === 0) pix.put(s[1] - 1, y, t.shade);
      }
    }
    return;
  }

  // calota base
  const capBottom = view === 'back' ? h.back : h.fringe;
  for (let y = top - h.top; y <= top + capBottom; y++) {
    if (view === 'back' && y > rig.headBot) break;
    capRow(pix, rig, y, t.base, t.shade);
  }
  // brilho
  if (view !== 'back') pix.hline(rig.headL + 3, rig.headL + 5, top - h.top + 1, t.light);
  else pix.hline(rig.headL + 4, rig.headL + 6, top - h.top + 1, t.light);

  // laterais
  if (view === 'front') {
    for (let y = top + h.fringe; y <= top + h.sides && y <= rig.headBot; y++) {
      const s = headSpan(rig, y);
      if (!s) continue;
      pix.hline(s[0], s[0] + 1, y, t.base);
      pix.hline(s[1] - 1, s[1], y, t.shade);
    }
  } else if (view === 'side') {
    for (let y = top + h.fringe; y <= top + h.back && y <= rig.headBot; y++) {
      const s = headSpan(rig, y);
      if (!s) continue;
      const from = Math.max(s[0], cx + 1);
      if (from <= s[1]) pix.hline(from, s[1], y, t.base);
      pix.put(s[1], y, t.shade);
    }
    for (let y = top + h.fringe; y <= top + Math.min(h.sides, 9); y++) pix.put(cx + 1, y, t.shade);
  }

  // estilos
  switch (h.style) {
    case 'quiff':
      if (view !== 'back') {
        const qx = view === 'side' ? rig.headL + 1 : cx - 4;
        pix.ellipse(qx + 3, top - 1.5, 4, 2.5, t.base);
        pix.hline(qx + 1, qx + 4, top - 3, t.light);
      }
      break;
    case 'combover':
      if (view !== 'back')
        for (let y = top; y <= top + 2; y++) {
          const s = headSpan(rig, y);
          if (!s) continue;
          for (let x = s[0] + 1; x < s[1]; x++) if ((x + y) % 2 === 1) pix.set(x, y, skin.base);
        }
      break;
    case 'cap':
      // boné na cor do cabelo
      if (view === 'front') {
        pix.hline(rig.headL - 1, rig.headR + 1, top + h.fringe, shade(t.base, 0.6));
        pix.hline(rig.headL, rig.headR, top + h.fringe - 1, t.shade);
        pix.put(cx, top - 1, t.light);
      } else if (view === 'side') {
        pix.hline(rig.headL - 4, rig.headL + 3, top + h.fringe, shade(t.base, 0.6));
        pix.hline(rig.headL - 3, rig.headL + 2, top + h.fringe - 1, t.shade);
      } else {
        pix.hline(rig.headL + 1, rig.headR - 1, top + 6, t.shade);
      }
      break;
    case 'bun':
      if (view === 'side') pix.disk(cx + 2, top - 2, 2.6, t.base);
      else pix.disk(cx, top - 2, 2.6, t.base);
      pix.put(view === 'side' ? cx + 1 : cx - 1, top - 3, t.light);
      break;
    case 'ponytail':
      if (view === 'back') pix.capsule(cx, top + 9, cx, rig.headBot + 5, 3, t.base, t.shade);
      if (view === 'front') pix.box(rig.headR + 1, top + 9, rig.headR + 2, top + 13, t.shade);
      break;
    case 'braids':
      if (view === 'front' || view === 'back') {
        for (const bx of [rig.headL - 1, rig.headR + 1]) {
          for (let y = top + 8; y <= rig.headBot + h.long; y++) pix.put(bx, y, (y % 3 === 0 ? t.shade : t.base));
          for (let y = top + 8; y <= rig.headBot + h.long; y++) pix.put(bx + (bx < cx ? 1 : -1), y, (y % 3 === 1 ? t.shade : t.base));
          pix.put(bx, rig.headBot + h.long + 1, C.red);
        }
      } else {
        for (let y = top + 8; y <= rig.headBot + h.long; y++) pix.put(cx + 3, y, y % 3 === 0 ? t.shade : t.base);
      }
      break;
    case 'dreads':
      if (view === 'front')
        for (const [x0, dx] of [
          [rig.headL - 1, 0],
          [rig.headL + 1, 1],
          [rig.headR - 1, -1],
          [rig.headR + 1, 0],
        ] as const)
          for (let y = top + 3; y <= rig.headBot + 3; y++) pix.put(x0 + (y % 4 === 0 ? dx : 0), y, y % 2 ? t.shade : t.base);
      if (view === 'back')
        for (let i = 0; i < 7; i++) for (let y = top + 6; y <= rig.headBot + h.long; y++) pix.put(rig.headL + 1 + i * 2, y, y % 2 ? t.shade : t.base);
      break;
    case 'curly':
      for (let i = 0; i < 9; i++) pix.put(rig.headL + i * 2 - 1, top - 1 - (i % 2), t.base);
      for (let i = 0; i < 6; i++) pix.put(rig.headL + 2 + i * 2, top + 1, t.light);
      if (view === 'front') {
        pix.vline(rig.headL - 1, top + 3, top + h.sides, t.base);
        pix.vline(rig.headR + 1, top + 3, top + h.sides, t.shade);
      }
      break;
    case 'spiky':
      for (let i = 0; i < 5; i++) {
        const sx = rig.headL + 2 + i * 3;
        pix.line(sx, top - 1, sx + (view === 'side' ? 1 : 0), top - h.top - 1 + (i % 2), t.base);
        pix.put(sx, top - h.top - 1 + (i % 2), t.light);
      }
      break;
    case 'mullet':
      if (view === 'back') pix.box(rig.headL + 2, rig.headBot - 2, rig.headR - 2, rig.headBot + h.long, t.base);
      break;
    case 'bowl':
      if (view === 'front') pix.hline(rig.headL - 1, rig.headR + 1, top + h.fringe, t.shade);
      if (view === 'side') pix.hline(rig.headL - 1, rig.headR + 1, top + h.fringe, t.shade);
      break;
    case 'fringe':
    case 'chanel':
      if (view === 'front') {
        pix.hline(rig.headL + 1, rig.headR - 1, top + h.fringe, t.shade);
        for (let y = top + h.fringe; y <= top + h.sides; y++) {
          pix.put(rig.headL - 1, y, t.base);
          pix.put(rig.headR + 1, y, t.shade);
        }
      }
      if (view === 'side') pix.box(cx + 1, top + 4, rig.headR + 1, top + h.sides, t.base);
      break;
    case 'long':
      if (view === 'back') {
        pix.box(rig.headL, top + 8, rig.headR, rig.headBot + h.long, t.base);
        pix.vline(rig.headR, top + 8, rig.headBot + h.long, t.shade);
        for (let x = rig.headL + 2; x < rig.headR; x += 3) pix.vline(x, rig.headBot, rig.headBot + h.long - 1, t.shade);
      }
      break;
    case 'homecut':
      if (view === 'front') {
        for (let y = top + 2; y <= top + 11; y++) pix.hline(rig.headR - 2, rig.headR + 1, y, t.base);
        pix.put(rig.headL + 4, top + h.fringe + 1, t.base);
        pix.put(rig.headL + 9, top + h.fringe + 1, t.base);
      }
      if (view === 'back') for (let y = top + 2; y <= top + 12; y++) pix.hline(rig.headL - 1, rig.headL + 2, y, t.base);
      break;
    case 'afro':
      if (view === 'back') pix.ellipse(cx, top + 5.5, 11, 9.5, t.base);
      break;
    default:
      break;
  }
  if (view === 'back' && h.style !== 'afro' && h.back >= 13) {
    // nuca coberta
    pix.hline(rig.headL + 2, rig.headR - 2, rig.headBot, t.shade);
  }
}

// ---------------------------------------------------------------------------
// detalhes do rosto (appearance.detalhes)

export function drawDetail(pix: Pix, rig: Rig, grupo: string, hair: Tone, skin: Tone): void {
  if (rig.view === 'back') return;
  const tilt = Math.round(rig.pose.headTilt);
  const cx = rig.cx + tilt;
  const ey = rig.eyeY;
  const my = rig.mouthY;
  const side = rig.view === 'side';
  switch (grupo) {
    case 'barba':
      if (side) {
        pix.box(rig.headL + 1, my - 1, cx + 1, rig.headBot + 1, hair.base);
        pix.set(rig.headL + 1, my, C.eye);
      } else {
        for (let y = my - 2; y <= rig.headBot + 1; y++) {
          const s = headSpan(rig, Math.min(y, rig.headBot)) ?? [cx - 3, cx + 2];
          pix.hline(s[0], s[1], y, y > rig.headBot ? hair.shade : hair.base);
        }
        pix.hline(cx - 2, cx + 1, my, C.mouth);
      }
      break;
    case 'bigode':
      if (side) pix.hline(rig.headL, rig.headL + 2, my - 1, hair.base);
      else {
        pix.hline(cx - 3, cx + 2, my - 1, hair.base);
        pix.set(cx - 3, my, hair.base);
        pix.set(cx + 2, my, hair.base);
        pix.put(cx + 2, my - 1, hair.shade);
      }
      break;
    case 'cavanhaque':
      if (side) pix.box(rig.headL + 1, my + 1, rig.headL + 2, rig.headBot + 1, hair.base);
      else pix.box(cx - 1, my + 1, cx, rig.headBot + 1, hair.base);
      break;
    case 'oculos': {
      const fc = hex('#3a3236');
      if (side) {
        pix.frame(rig.headL + 2, ey - 1, rig.headL + 4, ey + 1, fc);
        pix.hline(rig.headL + 5, cx + 2, ey - 1, fc);
      } else {
        const lx = cx - 4;
        const rx = cx + 3;
        pix.frame(lx - 2, ey - 1, lx + 1, ey + 2, fc);
        pix.frame(rx - 1, ey - 1, rx + 2, ey + 2, fc);
        pix.hline(lx + 2, rx - 2, ey, C.white); // fita na ponte do nariz
      }
      break;
    }
    case 'cicatriz':
      if (side) pix.line(rig.headL + 5, ey - 2, rig.headL + 6, ey + 3, mix(skin.shade, C.red, 0.35));
      else pix.line(cx + 4, ey - 2, cx + 5, ey + 3, mix(skin.shade, C.red, 0.35));
      break;
    case 'pinta':
      pix.set(side ? rig.headL + 4 : cx + 4, my - 1, shade(skin.shade, 0.55));
      break;
    case 'olheira':
    case 'dente_de_ouro':
      break; // desenhados junto com o rosto
    default:
      break;
  }
}

/** Tatuagem com o nome errado no antebraço do braço principal: coraçãozinho e a faixa do nome. */
export function drawTattoo(pix: Pix, rig: Rig, text: string): void {
  if (rig.view === 'back') return;
  const l = rig.armMain;
  const ink = hex('#2e4a7a');
  const t0 = 0.4;
  const x = Math.floor(l.a.x + (l.b.x - l.a.x) * t0);
  const y = Math.floor(l.a.y + (l.b.y - l.a.y) * t0);
  // coração vermelho com contorno de tinta
  pix.paint(x - 1, y, C.red);
  pix.paint(x, y, text.length % 2 ? C.red : hex('#e85a5a'));
  pix.paint(x, y + 1, shade(C.red, 0.7));
  // faixa do nome (letra miúda = 1 px de tinta)
  pix.paint(x - 1, y + 2, ink);
  pix.paint(x, y + 2, ink);
  pix.paint(x + 1, y + 1, ink);
}

/** Cor de pele com marca de regata: ombros mais claros. */
export function drawTanLines(pix: Pix, rig: Rig, skin: Tone): void {
  if (!skin.second) return;
  for (const l of [rig.armMain, rig.armOff]) {
    pix.capsule(l.a.x, l.a.y, l.a.x + (l.b.x - l.a.x) * 0.25, l.a.y + (l.b.y - l.a.y) * 0.25, l.w - 0.5, skin.second);
  }
}

export { torsoSpan };
