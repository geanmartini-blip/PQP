/**
 * Inimigos (enemies.json) e invocações (summons.json). Bichos e máquinas têm desenho próprio em
 * 4 direções; inimigos humanos usam o boneco em camadas (npcs.ts). Elite ganha contorno e aura
 * coloridos; chefe é maior (até 64x64).
 */
import { getData } from '@pqp/shared';
import type { AnimName } from './contract';
import { ANIMS } from './contract';
import { type ArtLook, buildCharacterSheet, defaultLook, drawCharacterFrame, lookKey, resolveLook } from './character';
import { microText } from './font';
import { HUMAN_ENEMY_LOOKS } from './npcs';
import { C, type Color, hex, light, mix, Pix, shade, withAlpha } from './pixel';
import { buildAnimSheet, type Dir, type SheetData } from './sheet';

export type View = 'front' | 'side' | 'back';
export type Tier = 'normal' | 'elite' | 'chefe';

export interface CState {
  view: View;
  anim: AnimName;
  i: number;
  /** fase da caminhada 0..5 (-1 parado) */
  walk: number;
  /** ataque: 0 nada, 1 preparo, 2 golpe, 3 volta */
  atk: number;
  /** habilidade: 0..1 brilho */
  cast: number;
  bob: number;
  side: 'esquerda' | 'direita';
}

/** Desenha virado para a esquerda na vista de lado; cx = centro, gy = linha do chão. */
type CreatureDraw = (p: Pix, s: CState, cx: number, gy: number) => void;

interface CreatureDef {
  w: number;
  h: number;
  draw: CreatureDraw;
  /** desenho inteiro translúcido (espíritos, hologramas) */
  alpha?: number;
  /** voa: sombra no chão */
  flying?: boolean;
  /** imóvel: não anda (os quadros de andar repetem o parado) */
  still?: boolean;
}

const VIEW_OF: View[] = ['front', 'side', 'back', 'side'];
const fr = Math.floor;
const dk = (c: Color, f = 0.72) => shade(c, f);

function stateFor(anim: AnimName, i: number, view: View, side: CState['side'], still: boolean): CState {
  const s: CState = { view, anim, i, walk: -1, atk: 0, cast: 0, bob: 0, side };
  switch (anim) {
    case 'parado':
      s.bob = i % 2;
      break;
    case 'andando':
      if (still) s.bob = i % 2;
      else {
        s.walk = i;
        s.bob = i === 1 || i === 4 ? -1 : 0;
      }
      break;
    case 'basico':
      s.atk = i + 1;
      break;
    case 'habilidade':
      s.cast = [0.4, 1, 0.8, 0.2][i]!;
      s.atk = i === 1 ? 2 : 0;
      break;
    case 'especial':
      s.cast = 1;
      s.atk = i % 3 === 1 ? 2 : 0;
      s.bob = -(i % 2);
      break;
    case 'vitoria':
      s.bob = [0, -2, 0][i]!;
      break;
    case 'derrota':
      break;
  }
  return s;
}

// ---------------------------------------------------------------------------
// desenhos próprios

const SIRI = hex('#4a6a8c');
const SIRI_CLAW = hex('#6a8aa8');

const siri: CreatureDraw = (p, s, cx, gy) => {
  const y = gy - 6 + s.bob;
  const legStep = s.walk >= 0 ? s.walk % 2 : 0;
  const body = SIRI;
  if (s.view === 'side') {
    for (let k = 0; k < 3; k++) {
      const lx = cx - 3 + k * 3;
      p.line(lx, y + 2, lx + (k + legStep) % 2 - 1, gy, dk(body));
    }
    p.ellipse(cx + 1, y, 6, 4, body);
    p.hline(cx - 3, cx + 4, y - 3, light(body, 0.2));
    // pinça grande na frente
    const reach = s.atk === 2 ? -4 : s.atk === 1 ? 1 : 0;
    p.ellipse(cx - 7 + reach, y - 2 - (s.atk === 1 ? 3 : 0), 4, 3, SIRI_CLAW);
    p.put(cx - 10 + reach, y - 3 - (s.atk === 1 ? 3 : 0), C.ink);
    p.vline(cx - 2, y - 6, y - 4, dk(body));
    p.put(cx - 2, y - 7, C.ink);
    return;
  }
  for (let k = 0; k < 3; k++) {
    const off = (k + legStep) % 2;
    p.line(cx - 5, y + 1 + k, cx - 9 - k, gy - off, dk(body));
    p.line(cx + 4, y + 1 + k, cx + 8 + k, gy - (1 - off), dk(body));
  }
  p.ellipse(cx, y, 7.5, 4.5, body);
  p.hline(cx - 5, cx + 4, y - 3, light(body, 0.2));
  if (s.view === 'front') {
    p.vline(cx - 3, y - 7, y - 4, dk(body));
    p.vline(cx + 2, y - 7, y - 4, dk(body));
    p.put(cx - 3, y - 8, C.ink);
    p.put(cx + 2, y - 8, C.ink);
    p.hline(cx - 2, cx + 1, y, C.ink); // boca de pedágio
  }
  // pinça grande (esquerda da tela) e pequena
  const up = s.atk === 1 ? 4 : s.atk === 2 ? -1 : 0;
  const bx = s.view === 'back' ? cx + 10 : cx - 10;
  const sx = s.view === 'back' ? cx - 9 : cx + 9;
  p.ellipse(bx, y - 3 - up, 4.5, 3.5, SIRI_CLAW);
  p.hline(bx - 3, bx + 1, y - 3 - up, C.ink);
  p.ellipse(sx, y - 2, 2, 1.6, SIRI_CLAW);
};

const MOSQ = hex('#3a3430');
const mosquito: CreatureDraw = (p, s, cx, gy) => {
  const hover = 14 + (s.i % 2) + s.bob;
  const y = gy - hover;
  const flap = (s.i + (s.walk >= 0 ? s.walk : 0)) % 2;
  const wing = withAlpha(hex('#e8f0f8'), 150);
  const dive = s.atk === 2 ? 4 : 0;
  // sombra
  p.ellipse(cx, gy - 1, 5, 1.5, C.shadow);
  if (s.view === 'side') {
    p.ellipse(cx + 3, y + dive, 5, 3, hex('#b8322a')); // barriga vermelha satisfeita
    p.ellipse(cx - 2, y - 1 + dive, 3, 2.5, MOSQ);
    p.disk(cx - 5, y - 2 + dive, 2, MOSQ);
    p.line(cx - 7, y - 1 + dive, cx - 12, y + 3 + dive * 1.5, MOSQ); // ferrão
    p.put(cx - 5, y - 3 + dive, C.red);
    for (let k = 0; k < 3; k++) p.line(cx - 2 + k * 2, y + 1 + dive, cx - 3 + k * 2, y + 6 + dive, MOSQ);
    p.ellipse(cx, y - 5 + flap * 2 + dive, 4, 2, wing);
    return;
  }
  p.ellipse(cx, y + 3, 3.5, 4, hex('#b8322a'));
  p.ellipse(cx, y - 1, 3, 2.5, MOSQ);
  p.disk(cx, y - 4, 2.2, MOSQ);
  if (s.view === 'front') {
    p.put(cx - 1, y - 5, C.red);
    p.put(cx + 1, y - 5, C.red);
    p.vline(cx, y - 3, y + 1 + dive, hex('#5a4a40'));
  }
  for (const d of [-1, 1]) {
    p.ellipse(cx + d * 6, y - 3 - flap * 2, 5, 2.5 - flap, wing);
    p.line(cx + d * 2, y + 1, cx + d * 5, y + 7, MOSQ);
  }
};

const DOG = hex('#8a6a48');
const caoDeGuarda: CreatureDraw = (p, s, cx, gy) => {
  const body = DOG;
  const y = gy - 9 + s.bob;
  const step = s.walk >= 0 ? [2, 1, 0, -2, -1, 0][s.walk]! : 0;
  const bite = s.atk === 2 ? -3 : s.atk === 1 ? 1 : 0;
  if (s.view === 'side') {
    // patas
    p.capsule(cx - 5 + step, y + 3, cx - 6 + step, gy - 0.5, 2.2, dk(body));
    p.capsule(cx + 6 - step, y + 3, cx + 7 - step, gy - 0.5, 2.2, dk(body));
    p.capsule(cx - 3 - step, y + 3, cx - 3 - step, gy - 0.5, 2.2, body);
    p.capsule(cx + 8 + step, y + 3, cx + 8 + step, gy - 0.5, 2.2, body);
    p.ellipse(cx + 2, y + 1, 9, 4.5, body);
    p.line(cx + 10, y - 1, cx + 14, y - 5 - (s.i % 2), body); // rabo
    // cabeça
    p.ellipse(cx - 8 + bite, y - 3, 4.5, 4, body);
    p.box(cx - 14 + bite, y - 3, cx - 9 + bite, y, light(body, 0.15));
    p.put(cx - 14 + bite, y - 3, C.ink);
    p.put(cx - 9 + bite, y - 5, C.ink);
    p.poly([[cx - 7 + bite, y - 6], [cx - 4 + bite, y - 6], [cx - 5 + bite, y - 1]], dk(body)); // orelha
    if (s.atk === 2) p.hline(cx - 14 + bite, cx - 10 + bite, y + 1, C.white);
    // coleira com as duas maquininhas
    p.vline(cx - 5, y - 4, y + 1, hex('#4a2e1a'));
    p.box(cx - 6, y + 2, cx - 5, y + 4, hex('#5ec04a'));
    p.box(cx - 4, y + 2, cx - 3, y + 4, C.neonCyan);
    return;
  }
  const f = s.view === 'front';
  p.ellipse(cx, y + 2, 7, 5, body);
  p.capsule(cx - 4, y + 4, cx - 4, gy - 0.5 - (step > 0 ? 1 : 0), 2.4, dk(body));
  p.capsule(cx + 4, y + 4, cx + 4, gy - 0.5 - (step < 0 ? 1 : 0), 2.4, dk(body));
  if (f) {
    p.ellipse(cx, y - 4 + (s.atk === 2 ? 2 : 0), 5.5, 5, body);
    p.box(cx - 2, y - 2 + (s.atk === 2 ? 2 : 0), cx + 1, y + 1 + (s.atk === 2 ? 2 : 0), light(body, 0.2));
    p.put(cx - 3, y - 6, C.ink);
    p.put(cx + 2, y - 6, C.ink);
    p.hline(cx - 1, cx, y - 2, C.ink);
    if (s.atk === 2) p.hline(cx - 2, cx + 1, y + 2, C.white);
    p.poly([[cx - 6, y - 8], [cx - 3, y - 8], [cx - 6, y - 3]], dk(body));
    p.poly([[cx + 5, y - 8], [cx + 2, y - 8], [cx + 5, y - 3]], dk(body));
    p.hline(cx - 4, cx + 3, y + 1, hex('#4a2e1a'));
    p.box(cx - 3, y + 2, cx - 2, y + 4, hex('#5ec04a'));
    p.box(cx + 1, y + 2, cx + 2, y + 4, C.neonCyan);
  } else {
    p.line(cx, y - 1, cx + 2, y - 7 - (s.i % 2), body);
    p.ellipse(cx, y - 4, 4.5, 4, dk(body, 0.85));
  }
};

const COBRA = hex('#5a6b2f');
const cobra: CreatureDraw = (p, s, cx, gy) => {
  const body = COBRA;
  const wave = s.walk >= 0 ? s.walk : s.i;
  const strike = s.atk === 2 ? -5 : s.atk === 1 ? 2 : 0;
  if (s.view === 'side') {
    for (let x = -6; x <= 10; x++) {
      const yy = gy - 2 + Math.round(Math.sin((x + wave * 2) / 2.5) * 1.5);
      p.box(cx + x, yy - 1, cx + x, yy + 1, x % 4 === 0 ? dk(body) : body);
    }
    p.capsule(cx - 5, gy - 2, cx - 9 + strike, gy - 9, 3, body);
    p.ellipse(cx - 10 + strike, gy - 10, 3, 2.2, body);
    p.put(cx - 11 + strike, gy - 11, hex('#e8c040'));
    if (s.atk === 2 || s.i % 3 === 0) p.line(cx - 13 + strike, gy - 10, cx - 15 + strike, gy - 9, C.red);
    p.put(cx + 2, gy - 3, C.leaf); // folhas grudadas
    p.put(cx + 7, gy - 2, C.leaf);
    return;
  }
  p.ring(cx, gy - 3, 8, 3.5, 2.5, body);
  p.ring(cx, gy - 5, 5.5, 2.5, 2, dk(body, 0.9));
  p.capsule(cx, gy - 5, cx, gy - 12 - (strike < 0 ? 2 : 0), 3, body);
  p.ellipse(cx, gy - 13 - (strike < 0 ? 2 : 0), 3, 2.4, body);
  if (s.view === 'front') {
    p.put(cx - 1, gy - 14, hex('#e8c040'));
    p.put(cx + 1, gy - 14, hex('#e8c040'));
    if (s.atk === 2 || s.i % 3 === 0) p.vline(cx, gy - 12, gy - 10, C.red);
  }
  p.put(cx - 6, gy - 3, C.leaf);
  p.put(cx + 5, gy - 4, C.leaf);
};

const drone: CreatureDraw = (p, s, cx, gy) => {
  const y = gy - 16 + s.bob + (s.i % 2);
  const body = hex('#3a3e46');
  p.ellipse(cx, gy - 1, 6, 1.5, C.shadow);
  const spin = s.i % 2;
  for (const dx of s.view === 'side' ? [-7, 6] : [-8, 7]) {
    p.vline(cx + dx, y - 3, y, C.metalDark);
    p.hline(cx + dx - 3 + spin, cx + dx + 2 - spin, y - 4, withAlpha(C.silver, 200));
  }
  p.hline(cx - 8, cx + 7, y, C.metalDark);
  p.box(cx - 5, y - 2, cx + 4, y + 5, body);
  p.frame(cx - 5, y - 2, cx + 4, y + 5, dk(body));
  if (s.view !== 'back') {
    // tela com o score em vermelho, em público
    p.box(cx - 4, y - 1, cx + (s.view === 'side' ? 0 : 3), y + 3, hex('#1a0a0a'));
    // SUGESTÃO: o número do score na tela do drone
    microText(p, cx - 3, y, 6, 2, '312 SCORE', s.i % 2 ? C.red : hex('#ff8a8a'));
    p.put(cx + 3, y + 4, C.warn); // alto-falante
  }
  if (s.atk === 2) p.vline(cx, y + 6, y + 10, withAlpha(C.red, 200));
};

const turbina: CreatureDraw = (p, s, cx, gy) => {
  const rust = hex('#8a5a3a');
  const iron = hex('#6a6460');
  const hubY = gy - 20;
  // base e carcaça
  p.box(cx - 10, gy - 6, cx + 9, gy, iron);
  p.frame(cx - 10, gy - 6, cx + 9, gy, dk(iron));
  for (let x = cx - 10; x <= cx + 9; x += 4) p.box(x, gy - 4, x + 1, gy - 3, C.warn); // fita de interditado
  p.ring(cx, hubY, 17, 17, 2, rust);
  // pás tortas girando
  const a0 = (s.i * Math.PI) / 3 + (s.anim === 'andando' || s.anim === 'basico' || s.anim === 'especial' ? s.i * 0.4 : 0);
  for (let k = 0; k < 5; k++) {
    const a = a0 + (k * Math.PI * 2) / 5;
    const bx = cx + Math.cos(a) * 14;
    const by = hubY + Math.sin(a) * 14;
    p.capsule(cx, hubY, bx, by + (k === 2 ? 2 : 0), 3.2, k % 2 ? iron : mix(iron, rust, 0.5));
  }
  p.disk(cx, hubY, 3.5, rust);
  p.put(cx - 1, hubY - 1, light(rust, 0.4));
  // plaquinhas de patrimônio
  p.box(cx - 15, gy - 10, cx - 11, gy - 7, hex('#5b8e3a'));
  p.box(cx + 10, gy - 10, cx + 14, gy - 7, C.neonCyan);
  if (s.cast > 0.5) p.put(cx + (s.i % 2 ? 8 : -8), hubY - 10, C.warn);
};

const enguia: CreatureDraw = (p, s, cx, gy) => {
  const body = hex('#2a3038');
  const lit = s.cast > 0.3 || s.atk >= 1;
  const stripe = lit ? hex('#ffe23a') : hex('#6a6a3a');
  const wave = s.walk >= 0 ? s.walk : s.i;
  // água em volta
  p.ellipse(cx, gy - 2, 13, 3, withAlpha(hex('#4a8ab8'), 110));
  if (s.view === 'side') {
    for (let x = -10; x <= 10; x++) {
      const yy = gy - 4 + Math.round(Math.sin((x + wave * 2) / 3) * 2);
      p.box(cx + x, yy - 1, cx + x, yy + 1, body);
      if (x % 3 === 0) p.put(cx + x, yy, stripe);
    }
    p.disk(cx - 11, gy - 5 + Math.round(Math.sin((-10 + wave * 2) / 3) * 2), 2.2, body);
    p.put(cx - 12, gy - 6, C.warn);
  } else {
    for (let y = -8; y <= 0; y++) {
      const xx = cx + Math.round(Math.sin((y + wave * 2) / 2.5) * 2);
      p.box(xx - 1, gy - 3 + y, xx + 1, gy - 3 + y, body);
      if (y % 3 === 0) p.put(xx, gy - 3 + y, stripe);
    }
    p.disk(cx, gy - 12, 2.4, body);
    if (s.view === 'front') {
      p.put(cx - 1, gy - 13, C.warn);
      p.put(cx + 1, gy - 13, C.warn);
    }
  }
  if (s.atk === 2) for (let k = 0; k < 4; k++) p.put(cx - 8 + k * 5, gy - 10 - (k % 2) * 3, C.pureWhite);
};

const bomba: CreatureDraw = (p, s, cx, gy) => {
  const keg = hex('#c8901a');
  const kegD = dk(keg);
  // barril de chopindita do tamanho de uma geladeira
  p.box(cx - 13, gy - 44, cx + 12, gy - 1, keg);
  for (let x = cx - 13; x <= cx + 12; x++) if ((x + gy) % 5 === 0) p.vline(x, gy - 44, gy - 1, kegD);
  p.hline(cx - 14, cx + 13, gy - 40, C.metalDark);
  p.hline(cx - 14, cx + 13, gy - 6, C.metalDark);
  p.ellipse(cx, gy - 44, 13, 3, light(keg, 0.2));
  // fios e fita isolante
  p.line(cx - 13, gy - 34, cx + 12, gy - 24, C.red);
  p.line(cx - 13, gy - 20, cx + 12, gy - 30, hex('#2a6ad8'));
  p.box(cx - 13, gy - 16, cx + 12, gy - 14, hex('#1a1a1a'));
  // visor vermelho: 00:07 há três anos
  if (s.view !== 'back') {
    p.box(cx - 8, gy - 32, cx + 7, gy - 24, hex('#1a0606'));
    microText(p, cx - 6, gy - 30, 12, 2, '00 07', s.i % 2 ? C.red : hex('#ff6a6a'));
    p.put(cx - 1, gy - 29, s.i % 2 ? C.red : 0);
    // plaquinhas de patrimônio, uma de cada margem
    p.box(cx - 12, gy - 12, cx - 7, gy - 9, hex('#5b8e3a'));
    p.box(cx + 6, gy - 12, cx + 11, gy - 9, C.neonCyan);
  }
  // fios presos às turbinas
  p.line(cx - 13, gy - 38, cx - 22, gy - 30, C.metalDark);
  p.line(cx + 12, gy - 38, cx + 22, gy - 28, C.metalDark);
  if (s.cast > 0 || s.atk === 2) {
    p.put(cx - 15, gy - 46, C.warn);
    p.put(cx + 14, gy - 44 + (s.i % 3), C.pureWhite);
    p.put(cx + 2, gy - 49, C.warn);
  }
};

// invocações -----------------------------------------------------------------

const totem: CreatureDraw = (p, s, cx, gy) => {
  const wood = hex('#7a5232');
  p.box(cx - 5, gy - 30, cx + 4, gy, wood);
  for (let y = gy - 30; y <= gy; y += 10) p.hline(cx - 6, cx + 5, y, dk(wood));
  p.poly([[cx - 9, gy - 26], [cx - 5, gy - 28], [cx - 5, gy - 24]], wood); // asas
  p.poly([[cx + 8, gy - 26], [cx + 4, gy - 28], [cx + 4, gy - 24]], wood);
  if (s.view !== 'back') {
    const glow = s.cast > 0 || s.atk >= 1 || s.i % 2 === 0 ? hex('#9cf08a') : hex('#5ec04a');
    p.box(cx - 3, gy - 24, cx - 2, gy - 23, glow); // olhos de espírito
    p.box(cx + 1, gy - 24, cx + 2, gy - 23, glow);
    p.hline(cx - 2, cx + 1, gy - 19, dk(wood, 0.5));
    p.box(cx - 3, gy - 12, cx + 2, gy - 10, dk(wood, 0.6));
  }
};

const robo: CreatureDraw = (p, s, cx, gy) => {
  const m = hex('#7a8088');
  const step = s.walk >= 0 ? s.walk % 2 : 0;
  p.box(cx - 4, gy - 4, cx - 2, gy - step, dk(m));
  p.box(cx + 1, gy - 4, cx + 3, gy - (1 - step), dk(m));
  p.box(cx - 6, gy - 16, cx + 5, gy - 5, m);
  p.frame(cx - 6, gy - 16, cx + 5, gy - 5, dk(m));
  p.box(cx - 4, gy - 24, cx + 3, gy - 17, light(m, 0.1));
  p.line(cx + 1, gy - 24, cx + 4, gy - 29, C.metalDark); // antena torta
  p.put(cx + 4, gy - 30, s.i % 2 ? C.red : C.neonGreen);
  if (s.view !== 'back') p.box(cx - 2 + (s.view === 'side' ? -2 : 0), gy - 22, cx + (s.view === 'side' ? -2 : 1), gy - 20, s.atk === 2 ? C.red : C.neonCyan); // olho de LED
  const arm = s.atk === 2 ? -4 : 0;
  p.capsule(cx - 7, gy - 14, cx - 9 + arm, gy - 9, 2, dk(m));
  p.capsule(cx + 6, gy - 14, cx + 8, gy - 9, 2, dk(m));
  p.put(cx - 3, gy - 12, C.warn);
};

const barricada: CreatureDraw = (p, s, cx, gy) => {
  const wood = hex('#8a5a32');
  const metal = hex('#3a3a40');
  // cadeiras de bistrô empilhadas
  for (const [x, y, flip] of [
    [cx - 10, gy - 1, 0],
    [cx + 1, gy - 1, 1],
    [cx - 5, gy - 11, 1],
  ] as const) {
    p.box(x, y - 5, x + 8, y - 4, wood);
    p.vline(x + (flip ? 8 : 0), y - 12, y - 5, metal);
    p.vline(x + 1, y - 4, y, metal);
    p.vline(x + 7, y - 4, y, metal);
  }
  if (s.view !== 'back') {
    p.box(cx - 4, gy - 30, cx + 5, gy - 24, C.paper);
    p.vline(cx, gy - 24, gy - 12, C.woodDark);
    microText(p, cx - 3, gy - 28, 8, 1, 'GREVE', C.red);
  }
};

const barricadaGigante: CreatureDraw = (p, s, cx, gy) => {
  const cols = [hex('#8a5a32'), hex('#6a4a2a'), hex('#a87a4a'), hex('#5a6a3a')];
  for (let k = 0; k < 9; k++) {
    const x = cx - 26 + ((k * 13) % 48);
    const y = gy - 2 - fr(k / 3) * 9;
    p.box(x, y - 8, x + 11, y, cols[k % 4]!);
    p.frame(x, y - 8, x + 11, y, dk(cols[k % 4]!));
  }
  p.box(cx - 4, gy - 40, cx + 4, gy - 28, C.paper); // lista de reivindicações pendurada
  for (let y = gy - 38; y < gy - 29; y += 2) p.hline(cx - 3, cx + 3 - (y % 3), y, C.ink);
  p.vline(cx, gy - 28, gy - 26, C.woodDark);
};

const circuloDePedras: CreatureDraw = (p, s, cx, gy) => {
  const stone = hex('#8a8478');
  const moss = hex('#5a7a3a');
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const x = cx + Math.round(Math.cos(a) * 16);
    const y = gy - 6 + Math.round(Math.sin(a) * 5);
    p.ellipse(x, y, 3, 2.5, stone);
    p.put(x - 1, y - 2, moss);
  }
  p.box(cx - 4, gy - 30, cx + 3, gy - 3, stone); // menir-totem
  p.ellipse(cx, gy - 30, 4, 2, stone);
  p.vline(cx + 3, gy - 30, gy - 3, dk(stone));
  for (let y = gy - 28; y < gy - 4; y += 5) p.put(cx - 3 + (y % 3), y, moss);
  if (s.view !== 'back') {
    const g = s.cast > 0 || s.i % 2 ? hex('#9cf08a') : hex('#5ec04a');
    p.put(cx - 2, gy - 22, g);
    p.put(cx + 1, gy - 22, g);
  }
};

const barreiraSucata: CreatureDraw = (p, s, cx, gy) => {
  const fridge = hex('#e8e4dc');
  p.box(cx - 14, gy - 24, cx - 2, gy, fridge);
  p.frame(cx - 14, gy - 24, cx - 2, gy, dk(fridge));
  p.hline(cx - 13, cx - 3, gy - 15, dk(fridge));
  // ventilador
  p.ring(cx + 7, gy - 10, 6, 6, 1, C.metalDark);
  const a = s.i * 0.9;
  for (let k = 0; k < 3; k++) p.line(cx + 7, gy - 10, cx + 7 + Math.cos(a + k * 2.1) * 5, gy - 10 + Math.sin(a + k * 2.1) * 5, C.metal);
  p.vline(cx + 7, gy - 4, gy, C.metalDark);
  // fita prata e lacre
  p.line(cx - 14, gy - 20, cx + 12, gy - 6, C.silver);
  p.line(cx - 14, gy - 19, cx + 12, gy - 5, C.silver);
  if (s.view !== 'back') {
    p.box(cx - 12, gy - 10, cx - 4, gy - 8, C.red);
    microText(p, cx - 11, gy - 9, 7, 1, 'GARANTIA', C.pureWhite);
  }
};

const roboGeladeira: CreatureDraw = (p, s, cx, gy) => {
  const body = hex('#d8dce0');
  const open = s.atk >= 1 || s.cast > 0.5;
  p.hline(cx - 8, cx + 7, gy - 2, C.woodDark); // skate
  p.put(cx - 6, gy, C.ink);
  p.put(cx + 5, gy, C.ink);
  p.box(cx - 7, gy - 26, cx + 6, gy - 3, body);
  p.frame(cx - 7, gy - 26, cx + 6, gy - 3, dk(body));
  if (s.view !== 'back') {
    if (open) {
      p.box(cx - 6, gy - 25, cx + 5, gy - 4, withAlpha(hex('#fff8c8'), 230)); // luz saindo
      p.box(cx - 12, gy - 25, cx - 7, gy - 4, dk(body));
    } else {
      p.hline(cx - 6, cx + 5, gy - 17, dk(body));
      p.vline(cx + 4, gy - 23, gy - 19, C.metalDark);
    }
    p.box(cx - 4, gy - 24, cx - 3, gy - 23, C.neonCyan);
    p.box(cx + 1, gy - 24, cx + 2, gy - 23, C.neonCyan);
  }
  p.hline(cx - 3 - (s.i % 2), cx + 2 + (s.i % 2), gy - 28, C.metal); // ventilador na cabeça
  p.vline(cx, gy - 27, gy - 27, C.metalDark);
  p.box(cx - 7, gy - 12, cx - 6, gy - 11, C.red); // lacres
};

const lhama: CreatureDraw = (p, s, cx, gy) => {
  const wood = hex('#a0703a');
  const side = s.view === 'side';
  p.box(cx - 6, gy - 12, cx + 6, gy - 4, wood);
  p.vline(cx - 5, gy - 4, gy, dk(wood));
  p.vline(cx + 5, gy - 4, gy, dk(wood));
  const nx = side ? cx - 6 : cx - 2;
  p.box(nx, gy - 26, nx + 3, gy - 12, wood); // pescoço comprido
  p.box(side ? nx - 3 : nx - 1, gy - 28, nx + 4, gy - 23, wood);
  p.put(nx, gy - 30, wood);
  p.put(nx + 3, gy - 30, wood); // orelhas em pé
  p.put(nx, gy - 29, wood);
  p.put(nx + 3, gy - 29, wood);
  if (s.view !== 'back') {
    p.put(side ? nx - 1 : nx, gy - 26, C.ink);
    if (!side) p.put(nx + 3, gy - 26, C.ink);
  }
  for (let x = cx - 5; x <= cx + 5; x += 2) p.put(x, gy - 9, hex('#c0392b')); // manta
  if (s.atk >= 2 || s.cast > 0.7) {
    const sx = side ? nx - 6 : nx + 1;
    p.put(sx, gy - 24, hex('#c8e8ff'));
    p.put(sx - (side ? 3 : 0), gy - 23 + (side ? 0 : 4), hex('#c8e8ff'));
  }
};

const mascaraVazia: CreatureDraw = (p, s, cx, gy) => {
  const ghost = withAlpha(hex('#e8e0f0'), 90);
  p.ellipse(cx, gy - 14, 6, 12, ghost);
  const y = gy - 32 + s.bob;
  if (s.view === 'back') {
    p.ellipse(cx, y, 6, 6.5, hex('#3a2a2e'));
    p.hline(cx - 6, cx + 5, y, hex('#b08d3c'));
    return;
  }
  p.ellipse(cx, y, 6, 6.5, hex('#ede0c4'));
  p.box(cx - 3, y - 2, cx - 2, y - 1, C.ink);
  p.box(cx + 1, y - 2, cx + 2, y - 1, C.ink);
  p.line(cx - 3, y + 3, cx + 2, y + 3, C.ink);
  p.put(cx - 3, y + 2, C.ink);
  p.put(cx + 2, y + 2, C.ink);
  p.put(cx + 3, y + 1, hex('#6aa8d8')); // lágrima pintada
};

const crocodilo: CreatureDraw = (p, s, cx, gy) => {
  const g = hex('#5ac85a');
  const step = s.walk >= 0 ? s.walk % 2 : 0;
  const jaw = s.atk === 2 || s.i % 4 === 3 ? 3 : 0;
  if (s.view === 'side') {
    p.ellipse(cx + 2, gy - 5, 9, 3.5, g);
    p.poly([[cx + 10, gy - 6], [cx + 18, gy - 3], [cx + 10, gy - 3]], g);
    p.box(cx - 14, gy - 7, cx - 6, gy - 5, g); // focinho
    p.box(cx - 14, gy - 4 + (jaw ? 1 : 0), cx - 6, gy - 3 + (jaw ? 1 : 0), dk(g));
    if (jaw) for (let x = cx - 13; x < cx - 6; x += 2) p.put(x, gy - 5, C.white);
    p.put(cx - 7, gy - 8, C.warn);
    for (const lx of [cx - 4, cx + 6]) p.vline(lx + step, gy - 2, gy, dk(g));
    for (let x = cx - 4; x < cx + 10; x += 3) p.put(x, gy - 9, light(g, 0.3));
    return;
  }
  p.ellipse(cx, gy - 6, 6, 7, g);
  if (s.view === 'front') {
    p.box(cx - 3, gy - 14, cx + 2, gy - 10, g);
    p.put(cx - 3, gy - 15, C.warn);
    p.put(cx + 2, gy - 15, C.warn);
    if (jaw) p.hline(cx - 3, cx + 2, gy - 11, C.white);
  } else p.poly([[cx - 2, gy], [cx + 2, gy], [cx, gy + 2]], g);
  p.vline(cx - 6, gy - 3, gy, dk(g));
  p.vline(cx + 5, gy - 3, gy, dk(g));
};

const raposa: CreatureDraw = (p, s, cx, gy) => {
  const fire = hex('#ff9a3a');
  const glow = hex('#ffe08a');
  const flick = s.i % 2;
  const tails = 5;
  for (let k = 0; k < tails; k++) {
    const a = Math.PI * (0.15 + (0.7 * k) / (tails - 1));
    const tx = (s.view === 'side' ? cx + 7 : cx) + Math.cos(a) * 10 * (s.view === 'side' ? 0.6 : 1);
    const ty = gy - 8 - Math.sin(a) * 9 - flick;
    p.capsule(s.view === 'side' ? cx + 5 : cx, gy - 7, tx, ty, 2.4, k % 2 ? fire : glow);
  }
  p.ellipse(cx, gy - 6, 5, 4, fire);
  const hx = s.view === 'side' ? cx - 6 : cx;
  p.ellipse(hx, gy - 11, 3.5, 3, fire);
  p.poly([[hx - 3, gy - 13], [hx - 2, gy - 17], [hx, gy - 13]], fire);
  p.poly([[hx + 3, gy - 13], [hx + 2, gy - 17], [hx, gy - 13]], fire);
  if (s.view !== 'back') {
    p.put(hx - 1, gy - 12, C.ink);
    if (s.view === 'front') p.put(hx + 1, gy - 12, C.ink);
  }
};

const espirito: CreatureDraw = (p, s, cx, gy) => {
  const col = s.side === 'direita' ? C.neonCyan : hex('#7ad86a');
  p.ellipse(cx, gy - 24 + s.bob, 8, 9, col);
  p.poly([[cx - 8, gy - 22], [cx + 8, gy - 22], [cx + 5, gy - 2], [cx, gy - 6 - (s.i % 2) * 2], [cx - 5, gy - 2]], col);
  if (s.view !== 'back') {
    p.box(cx - 4, gy - 27 + s.bob, cx - 3, gy - 25 + s.bob, C.pureWhite);
    p.box(cx + 2, gy - 27 + s.bob, cx + 3, gy - 25 + s.bob, C.pureWhite);
  }
  p.ring(cx, gy - 1, 9, 2, 1, light(col, 0.4));
};

const muralha: CreatureDraw = (p, _s, cx, gy) => {
  const c = hex('#8a7a6a');
  p.box(cx - 12, gy - 16, cx + 11, gy, c);
  for (let y = gy - 16; y < gy; y += 4) p.hline(cx - 12, cx + 11, y, dk(c));
};

// ---------------------------------------------------------------------------

const ENEMY_DRAW: Record<string, CreatureDef> = {
  siri_do_mangue: { w: 32, h: 32, draw: siri },
  mosquito_do_delta: { w: 32, h: 40, draw: mosquito, flying: true },
  cao_de_guarda_do_capataz: { w: 40, h: 32, draw: caoDeGuarda },
  cobra_do_juncal: { w: 40, h: 32, draw: cobra },
  drone_de_cobranca: { w: 32, h: 40, draw: drone, flying: true },
  turbina_desgovernada: { w: 48, h: 56, draw: turbina, still: true },
  enguia_eletrica: { w: 32, h: 32, draw: enguia },
  // 60 + 2 px de aura de chefe de cada lado = 64
  bomba_descontrolada: { w: 60, h: 62, draw: bomba, still: true },
};

/** Ids de inimigos com desenho próprio (bicho/máquina) ou boneco humano. */
export function enemyHasArt(id: string): boolean {
  return !!ENEMY_DRAW[id] || !!HUMAN_ENEMY_LOOKS[id];
}

/** Invocações: um desenho por lado quando o visual muda de margem. */
function summonDef(id: string, side: 'esquerda' | 'direita'): CreatureDef | ArtLook {
  switch (id) {
    case 'totem_ou_robo':
      return side === 'direita' ? { w: 32, h: 40, draw: robo } : { w: 32, h: 40, draw: totem, still: true };
    case 'barricada':
      return { w: 32, h: 40, draw: barricada, still: true };
    case 'barricada_gigante':
      return { w: 64, h: 48, draw: barricadaGigante, still: true };
    case 'circulo_de_pedras':
      return { w: 48, h: 40, draw: circuloDePedras, still: true };
    case 'barreira_de_sucata':
      return { w: 40, h: 32, draw: barreiraSucata, still: true };
    case 'robo_geladeira':
      return { w: 32, h: 40, draw: roboGeladeira };
    case 'lhama_cuspidora':
      return { w: 32, h: 40, draw: lhama, still: true };
    case 'copia_do_sumico':
      return side === 'direita' ? { ...defaultLook(), hologram: '#5ae8ff', fxSide: 'direita' } : { w: 32, h: 48, draw: mascaraVazia, alpha: 1 };
    case 'crocodilo_espirito':
      return { w: 48, h: 32, draw: crocodilo, alpha: 0.6 };
    case 'esquadrao_da_pm':
      return { ...defaultLook(), body: 'fortao', face: 'cara_de_paisagem', outfit: { tier: 'base', institutionId: 'pm_do_consorcio', palette: 0 }, fxSide: 'direita' };
    case 'raposa_ilusao':
      return { w: 32, h: 32, draw: raposa, alpha: 0.6 };
    case 'holograma_de_crise':
      return {
        ...defaultLook(),
        hair: 'topete_de_gala',
        face: 'sorriso_amarelo',
        outfit: { tier: 'delta', palette: 0 },
        dropParts: ['torso', 'pernas', 'pes'],
        extraLayers: [
          { part: 'torso', arte: 'terno_grande', cols: ['#2a2e3a', '#5a6070'] },
          { part: 'pernas', arte: 'calca_social', cols: ['#2a2e3a'] },
          { part: 'pes', arte: 'sapato_social_gasto', cols: ['#111014'] },
          { part: 'mao_principal', arte: 'nota_oficial', cols: ['#efe6cf'] },
        ],
        hologram: '#8ab8ff',
        fxSide: 'direita',
      };
    case 'manifestacao_do_guia':
      return side === 'direita'
        ? {
            ...defaultLook(),
            hologram: '#5ae8ff',
            extraLayers: [{ part: 'acompanhante', arte: 'marca_dagua', cols: ['#ffffff'] }],
            fxSide: 'direita',
          }
        : { w: 32, h: 48, draw: espirito, alpha: 0.55 };
    default:
      return genericSummon(id);
  }
}

/** Genérico pelo comportamento (summons.json, behavior). */
function genericSummon(id: string): CreatureDef {
  const s = getData().summonsById.get(id);
  switch (s?.behavior) {
    case 'muralha':
      return { w: 32, h: 32, draw: muralha, still: true };
    case 'ataca_mais_perto':
      return { w: 32, h: 40, draw: totem, still: true };
    case 'provoca':
      return { w: 32, h: 40, draw: roboGeladeira };
    case 'cura_menos_vida':
      return { w: 32, h: 40, draw: lhama, still: true };
    case 'distrai':
      return { w: 32, h: 32, draw: raposa, alpha: 0.6 };
    case 'absorve':
    case 'luta_ao_lado':
    default:
      return { w: 32, h: 48, draw: espirito, alpha: 0.55 };
  }
}

// ---------------------------------------------------------------------------
// montagem

function isLook(x: CreatureDef | ArtLook): x is ArtLook {
  return (x as ArtLook).outfit !== undefined;
}

function deathTransform(src: Pix, k: number): Pix {
  if (k === 0) return src;
  const sy = k === 1 ? 0.72 : 0.45;
  const sq = src.scaleNearest(1, sy);
  const out = new Pix(src.w, src.h);
  out.blit(sq, 0, src.h - sq.h);
  if (k === 2)
    for (let y = 0; y < out.h; y++)
      for (let x = 0; x < out.w; x++) {
        const c = out.get(x, y);
        if ((c & 255) === 0) continue;
        out.set(x, y, withAlpha(mix(c, hex('#6a6a6a'), 0.45), c & 255));
      }
  return out;
}

// SUGESTÃO: cor da aura por tier (elite laranja, chefe vermelho) e escala do chefe (humano 1,25x,
// comum promovido a chefe 1,5x, limitado a 64 px). Os afixos têm cor própria em enemies.json;
// o cliente pode tingir por afixo com fx_poeira, fx_cruz_verde e fx_pavio.
const TIER_GLOW: Record<Tier, Color | undefined> = {
  normal: undefined,
  elite: hex('#ffb020'),
  chefe: hex('#ff3a3a'),
};

/** Contorno e aura coloridos de elite e chefe por cima de um quadro já pronto. */
function tierDecor(f: Pix, tier: Tier, frame: number): Pix {
  const col = TIER_GLOW[tier];
  if (!col) return f;
  const out = new Pix(f.w, f.h);
  // aura: borda de 2 px na cor do tier, translúcida e pulsando
  const ring = f.clone();
  ring.outline({ color: withAlpha(col, 255), minAlpha: 120 });
  const ring2 = ring.clone();
  ring2.outline({ color: withAlpha(col, frame % 2 ? 110 : 70), minAlpha: 120 });
  out.blit(ring2, 0, 0);
  out.blit(f, 0, 0);
  return out;
}

function drawCreatureFrame(def: CreatureDef, side: 'esquerda' | 'direita', anim: AnimName, dir: Dir, i: number, pad: number): Pix {
  const view = VIEW_OF[dir]!;
  const s = stateFor(anim, i, view, side, !!def.still);
  const W = def.w + pad * 2;
  const H = def.h + pad;
  const p = new Pix(W, H);
  const gy = H - 2;
  const k = anim === 'derrota' ? i : -1;
  def.draw(p, k >= 0 ? stateFor('parado', 0, view, side, true) : s, fr(W / 2), gy);
  if (def.alpha !== undefined && def.alpha < 1) {
    const t = new Pix(W, H);
    t.blit(p, 0, 0, { alpha: def.alpha });
    let out = k >= 0 ? deathTransform(t, k) : t;
    if (dir === 3) out = out.flipX();
    return out;
  }
  p.outline({ minAlpha: 200 });
  let out = k >= 0 ? deathTransform(p, k) : p;
  if (s.cast > 0) {
    const fx = side === 'esquerda' ? C.leaf : C.neonCyan;
    out.put(fr(W / 2) - 6, gy - 6 - (i % 3), withAlpha(fx, 220));
    out.put(fr(W / 2) + 5, gy - 9 + (i % 2), withAlpha(light(fx, 0.4), 220));
  }
  if (dir === 3) out = out.flipX();
  return out;
}

const cache = new Map<string, SheetData>();

function scaleFrame(f: Pix, s: number): Pix {
  return s === 1 ? f : f.scaleNearest(s);
}

/** Folha de inimigo. Sem tier, usa o tier do inimigo nos dados. */
export function buildEnemySheet(enemyId: string, tier?: Tier): SheetData {
  const e = getData().enemiesById.get(enemyId);
  const t: Tier = tier ?? (e?.tier as Tier | undefined) ?? 'normal';
  const key = `enemy_${enemyId}_${t}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const side: 'esquerda' | 'direita' = e?.regioes.includes('margem_direita') ? 'direita' : 'esquerda';
  const human = HUMAN_ENEMY_LOOKS[enemyId];
  const ownBoss = e?.tier === 'chefe';
  let sheet: SheetData;
  const decorPad = t === 'normal' ? 0 : 2;
  if (human) {
    const rl = resolveLook(human());
    // chefe humano: 1,25x (Bruno Ferro), até 64 de altura
    const sc = t === 'chefe' ? 1.25 : 1;
    const fw = Math.round(rl.W * sc) + decorPad * 2;
    const fh = Math.min(64, Math.round(rl.H * sc) + decorPad);
    sheet = buildAnimSheet(key, fw, fh, (anim, dir, i) => {
      const f = scaleFrame(drawCharacterFrame(rl, anim, dir, i), sc);
      const padded = new Pix(fw, fh);
      padded.blit(f, fr((fw - f.w) / 2), fh - f.h - (decorPad > 0 ? 1 : 0));
      return tierDecor(padded, t, i);
    });
  } else {
    const def = ENEMY_DRAW[enemyId] ?? { w: 32, h: 32, draw: siri };
    // chefe pedido para um inimigo comum: 1,5x, sem passar de 64
    const pad = decorPad;
    const sc = t === 'chefe' && !ownBoss ? Math.min(1.5, 64 / Math.max(def.w + pad * 2, def.h + pad)) : 1;
    const fw = Math.round((def.w + pad * 2) * sc);
    const fh = Math.round((def.h + pad) * sc);
    sheet = buildAnimSheet(key, fw, fh, (anim, dir, i) => tierDecor(scaleFrame(drawCreatureFrame(def, side, anim, dir, i, pad), sc), t, i));
  }
  cache.set(key, sheet);
  return sheet;
}

/** Folha de invocação. Sem lado, usa a Esquerda. */
export function buildSummonSheet(summonId: string, side: 'esquerda' | 'direita' = 'esquerda'): SheetData {
  const key = `summon_${summonId}_${side}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = summonDef(summonId, side);
  let sheet: SheetData;
  if (isLook(def)) {
    const k2 = lookKey(def, key);
    sheet = { ...buildCharacterSheet(def, k2), key };
  } else sheet = buildAnimSheet(key, def.w, def.h, (anim, dir, i) => drawCreatureFrame(def, side, anim, dir, i, 0));
  cache.set(key, sheet);
  return sheet;
}

export const ENEMY_ART_IDS = [...Object.keys(ENEMY_DRAW), ...Object.keys(HUMAN_ENEMY_LOOKS)];
export { ANIMS };
