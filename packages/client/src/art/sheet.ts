/**
 * Folha de sprite pura: um buffer de pixels com quadros nomeados. O lado Phaser (index.ts) só
 * sobe o buffer como CanvasTexture e registra os quadros com estes nomes.
 */
import { ANIMS, type AnimName } from './contract';
import { Pix } from './pixel';

export interface FrameRect {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SheetData {
  key: string;
  pix: Pix;
  frames: FrameRect[];
  /** tamanho de cada quadro (todos iguais numa folha de animação) */
  frameW: number;
  frameH: number;
  /**
   * Ponto do quadro que fica no chão, sob o centro da entidade (0..1). Para bonecos e inimigos,
   * o centro de baixo: setOrigin(originX, originY).
   */
  originX: number;
  originY: number;
  /** quadros por animação (para registerAnims) */
  anims?: Partial<Record<AnimName, number>>;
}

export const ANIM_NAMES = Object.keys(ANIMS) as AnimName[];
export const DIRS = [0, 1, 2, 3] as const;
export type Dir = (typeof DIRS)[number];

/** Nome do quadro de animação do contrato: `${anim}_${dir}_${i}`. */
export const frameName = (anim: AnimName, dir: number, i: number) => `${anim}_${dir}_${i}`;

/** Quantos quadros cada animação tem, na ordem de ANIMS. */
export const TOTAL_FRAMES_PER_DIR = ANIM_NAMES.reduce((s, a) => s + ANIMS[a], 0);

// ---------------------------------------------------------------------------
// desenho adiado (Fase 3): a folha nasce com a silhueta e os quadros são desenhados aos poucos

interface PendingDraw {
  draw: (anim: AnimName, dir: Dir, i: number) => Pix;
  frameW: number;
  frameH: number;
  list: { anim: AnimName; dir: Dir; i: number; x: number; y: number }[];
  next: number;
}

let deferDepth = 0;
const pending = new WeakMap<Pix, PendingDraw>();

/** Roda `fn` com as folhas de animação adiadas: buildAnimSheet devolve a casca com a silhueta. */
export function withDeferredDraw<T>(fn: () => T): T {
  deferDepth++;
  try {
    return fn();
  } finally {
    deferDepth--;
  }
}

/** A folha ainda tem quadros por desenhar? */
export function isPendingSheet(pix: Pix): boolean {
  return pending.has(pix);
}

/** Quadros desenhados / total de uma folha adiada (1 se já está pronta). */
export function pendingProgress(pix: Pix): number {
  const p = pending.get(pix);
  return p ? p.next / p.list.length : 1;
}

/**
 * Desenha quadros pendentes até `deadline` (relógio `now`) ou até acabar. Devolve true quando a
 * folha ficou completa. Sempre desenha ao menos um quadro, para nunca travar a fila.
 */
export function drawPending(pix: Pix, deadline = Infinity, now: () => number = () => 0): boolean {
  const p = pending.get(pix);
  if (!p) return true;
  do {
    const f = p.list[p.next]!;
    const fp = p.draw(f.anim, f.dir, f.i);
    // apaga a silhueta da célula antes do quadro de verdade
    for (let y = 0; y < p.frameH; y++) {
      const o = ((f.y + y) * pix.w + f.x) * 4;
      pix.data.fill(0, o, o + p.frameW * 4);
    }
    pix.blit(fp, f.x + Math.floor((p.frameW - fp.w) / 2), f.y + (p.frameH - fp.h));
    p.next++;
  } while (p.next < p.list.length && now() < deadline);
  if (p.next >= p.list.length) {
    pending.delete(pix);
    return true;
  }
  return false;
}

/** Termina na hora uma folha adiada (leitores puros: retrato, testes). */
export function completeSheet<T extends { pix: Pix }>(sheet: T): T {
  drawPending(sheet.pix);
  return sheet;
}

const silCache = new Map<string, Pix>();

/**
 * Silhueta de espera (SUGESTÃO: sombra roxa translúcida com o contorno de um boneco, ou uma bolha
 * para bichos largos), do tamanho do quadro e no chão.
 */
export function placeholderFrame(w: number, h: number): Pix {
  const k = `${w}x${h}`;
  const hit = silCache.get(k);
  if (hit) return hit;
  const p = new Pix(w, h);
  const body = 0x3a2e52b4;
  const rim = 0x8a7ab8c8;
  const cx = w / 2;
  if (h >= w * 1.25) {
    // boneco: cabeça grande, tronco e pernas (proporção do 32x48)
    const s = Math.min(w / 32, h / 48);
    const top = h - 48 * s;
    p.ellipse(cx, top + 15 * s, 8 * s, 8 * s, body);
    p.box(Math.round(cx - 6 * s), Math.round(top + 22 * s), Math.round(cx + 5 * s), Math.round(top + 38 * s), body);
    p.box(Math.round(cx - 5 * s), Math.round(top + 38 * s), Math.round(cx - 2 * s), h - 2, body);
    p.box(Math.round(cx + 1 * s), Math.round(top + 38 * s), Math.round(cx + 4 * s), h - 2, body);
  } else {
    p.ellipse(cx, h * 0.62, w * 0.36, h * 0.3, body);
  }
  // borda clara: lê como "carregando" e não como inimigo de verdade
  const out = p.clone();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (p.alphaAt(x, y) === 0) continue;
      if (p.alphaAt(x - 1, y) === 0 || p.alphaAt(x + 1, y) === 0 || p.alphaAt(x, y - 1) === 0) out.set(x, y, rim);
    }
  silCache.set(k, out);
  return out;
}

/**
 * Monta uma folha de animação com 4 direções a partir de uma função que desenha cada quadro.
 * Layout: uma linha por (anim, dir), até 6 colunas. Dentro de withDeferredDraw, devolve a folha
 * com a silhueta em todos os quadros e guarda o desenho para drawPending.
 */
export function buildAnimSheet(
  key: string,
  frameW: number,
  frameH: number,
  draw: (anim: AnimName, dir: Dir, i: number) => Pix,
  originX = 0.5,
  originY = 1,
): SheetData {
  const cols = Math.max(...ANIM_NAMES.map((a) => ANIMS[a]));
  const rows = ANIM_NAMES.length * 4;
  const pix = new Pix(cols * frameW, rows * frameH);
  const frames: FrameRect[] = [];
  const list: PendingDraw['list'] = [];
  let row = 0;
  for (const anim of ANIM_NAMES) {
    for (const dir of DIRS) {
      for (let i = 0; i < ANIMS[anim]; i++) {
        const x = i * frameW;
        const y = row * frameH;
        list.push({ anim, dir, i, x, y });
        frames.push({ name: frameName(anim, dir, i), x, y, w: frameW, h: frameH });
      }
      row++;
    }
  }
  pending.set(pix, { draw, frameW, frameH, list, next: 0 });
  if (deferDepth > 0) {
    const sil = placeholderFrame(frameW, frameH);
    for (const f of list)
      for (let y = 0; y < frameH; y++) {
        const so = y * frameW * 4;
        pix.data.set(sil.data.subarray(so, so + frameW * 4), ((f.y + y) * pix.w + f.x) * 4);
      }
  } else drawPending(pix);
  return { key, pix, frames, frameW, frameH, originX, originY, anims: { ...ANIMS } };
}

/** Empacota quadros soltos (de tamanhos variados) em linhas, com 1 px de folga. */
export function packFrames(key: string, items: { name: string; pix: Pix }[], maxW = 1024): SheetData {
  let x = 0;
  let y = 0;
  let rowH = 0;
  const placed: { name: string; pix: Pix; x: number; y: number }[] = [];
  let width = 0;
  for (const it of items) {
    if (x + it.pix.w > maxW) {
      x = 0;
      y += rowH + 1;
      rowH = 0;
    }
    placed.push({ ...it, x, y });
    x += it.pix.w + 1;
    width = Math.max(width, x);
    rowH = Math.max(rowH, it.pix.h);
  }
  const pix = new Pix(Math.max(1, width), Math.max(1, y + rowH));
  const frames: FrameRect[] = [];
  for (const p of placed) {
    pix.blit(p.pix, p.x, p.y);
    frames.push({ name: p.name, x: p.x, y: p.y, w: p.pix.w, h: p.pix.h });
  }
  const f0 = items[0]?.pix;
  return { key, pix, frames, frameW: f0?.w ?? 0, frameH: f0?.h ?? 0, originX: 0.5, originY: 0.5 };
}

/** Recorta um quadro da folha (para testes e retratos). */
export function frameOf(sheet: SheetData, name: string): Pix {
  completeSheet(sheet);
  const f = sheet.frames.find((r) => r.name === name);
  if (!f) throw new Error(`quadro não existe: ${sheet.key}/${name}`);
  return sheet.pix.crop(f.x, f.y, f.w, f.h);
}
