/**
 * Medidas da tela (puro, testável): densidade de pixels, zoom da câmera, posição dos botões e dos
 * quadros do HUD em retrato, e os deslocamentos que o jogador escolhe no modo de ajuste.
 *
 * Unidades: o canvas é desenhado em pixels físicos (px de CSS × dpr, ver main.ts). As contas daqui
 * são feitas em px de CSS (os 56 px mínimos do botão são px de CSS) e o resultado sai multiplicado
 * por `px` (o dpr efetivo), pronto para a cena.
 *
 * Zoom: só inteiro (cada pixel da arte vira um bloco inteiro de pixels de tela), o mais perto de 12
 * tiles de largura, com pelo menos 10 tiles de largura e 14 de altura. Em tela larga isso mostra mais
 * mundo dos lados em vez de ampliar demais.
 *
 * Botões: arco no canto inferior direito, ao alcance do polegar direito; o Especial é o maior, no
 * canto; as 3 habilidades em volta dele; o item e o AUTO por fora do arco.
 */
import { TILE_PX } from '../art/contract';
import { FONT_CELL_H, FONT_CELL_W } from '../art/fx';
import type { TipId } from './tips';

// SUGESTÃO: ~12 tiles de largura, no mínimo 9,5 de largura (360 px de CSS com dpr 2,625 só tem 9,8
// ou 14,8 com zoom inteiro) e 14 de altura (a tela em pé mostra o alcance de aquisição na vertical).
export const ZOOM_TARGET_TILES = 12;
export const ZOOM_MIN_TILES = 9.5;
export const ZOOM_MIN_TILES_V = 14;
export const ZOOM_MAX = 12;

// SUGESTÃO: densidade efetiva no máximo 3 (acima disso o ganho de nitidez não paga o preenchimento).
export const MAX_DPR = 3;

/** Densidade efetiva: o devicePixelRatio do aparelho (até MAX_DPR) ou o ?dpr= da URL. */
export function pickDpr(devicePixelRatio: number | undefined, override?: number): number {
  if (override !== undefined && Number.isFinite(override) && override > 0) return Math.max(1, Math.min(4, override));
  const d = devicePixelRatio && Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1;
  return Math.max(1, Math.min(MAX_DPR, d));
}

/**
 * Teto de fps do Phaser para uma tela de `hz` quadros por segundo: ~60 fps em telas de 120 e 144 Hz
 * (desenhar a 120 dobra o custo e esquenta o celular sem ganho). O teto fica 1 acima da divisão
 * exata, porque o Phaser pula o quadro cujo delta for menor que 1000/teto (com teto 60 numa tela de
 * 60 Hz, um delta de 16,5 ms perderia o quadro). Em 60 e 90 Hz não há teto (0).
 */
export function fpsLimitFor(hz: number): number {
  if (!Number.isFinite(hz) || hz <= 0) return 0;
  // SUGESTÃO: divide a taxa da tela pelo inteiro que deixa o jogo perto de 55 a 75 fps
  const n = Math.max(1, Math.floor(hz / 55));
  return n > 1 ? Math.ceil(hz / n) + 1 : 0;
}

/**
 * Zoom da câmera do mundo para uma tela de `screenW`×`screenH` pixels de canvas: inteiro por padrão;
 * `step` 0,5 aceita meio passo (o barco da travessia, para as margens caberem na tela).
 */
export function computeZoom(screenW: number, screenH = Infinity, target = ZOOM_TARGET_TILES, step = 1): number {
  let best = 1;
  let bestScore = Infinity;
  for (let z = 1; z <= ZOOM_MAX; z += step) {
    const tw = screenW / (TILE_PX * z);
    const th = screenH / (TILE_PX * z);
    // zoom maior só mostra menos: passou do mínimo, para
    if (tw < ZOOM_MIN_TILES || th < ZOOM_MIN_TILES_V) break;
    const score = Math.abs(tw - target);
    if (score < bestScore) {
      bestScore = score;
      best = z;
    }
  }
  return best;
}

/**
 * Escala dos textos do mundo (nomes, números) sobre a câmera com zoom `zoom`: ~1,75 px de CSS por
 * pixel da fonte, inteiro em pixels de canvas. SUGESTÃO.
 */
export function worldTextScale(px: number, zoom: number): number {
  return Math.max(1, Math.round((1.75 * px) / Math.max(1, zoom)));
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Pt {
  x: number;
  y: number;
}

/** Quadro do jogador (topo esquerdo): nome, vida (com o número dentro), recurso, nível e XP. */
export interface PlayerFrame extends Rect {
  name: Pt;
  hpBar: Rect;
  resBar: Rect;
  level: Pt;
  xpBar: Rect;
  /** letras que cabem numa linha (nome) */
  chars: number;
}

/** Quadro do alvo (topo direito): retrato, nome, vida e nível. */
export interface TargetFrame extends Rect {
  portrait: Pt & { scale: number };
  name: Pt;
  hpBar: Rect;
  level: Pt;
  chars: number;
}

export interface TipAnchor {
  x: number;
  y: number;
  /** origem vertical (0 topo, 0,5 meio, 1 base) */
  oy: number;
  wrap: number;
}

export interface HudLayout {
  /** escala da interface (1 = celular de ~390 px de CSS) */
  ui: number;
  /** pixels de canvas por px de CSS (dpr efetivo) */
  px: number;
  /** escala inteira da fonte de pixel no HUD (pixels de canvas por pixel da fonte) */
  ts: number;
  /** largura de uma letra da fonte do HUD, em pixels de canvas */
  charW: number;
  /** altura de uma linha da fonte do HUD, em pixels de canvas */
  lineH: number;
  b1: Circle;
  b2: Circle;
  b3: Circle;
  especial: Circle;
  item: Circle;
  auto: Circle;
  falar: Circle;
  ala: Circle;
  /** engrenagem do modo de ajuste dos botões */
  ajuste: Circle;
  player: PlayerFrame;
  target: TargetFrame;
  boss: { x: number; y: number; w: number; h: number };
  tips: Record<TipId, TipAnchor>;
  /** linha de cima livre para avisos (abaixo da barra do chefe) */
  bannerY: number;
}

// SUGESTÃO: tamanhos dos botões (o mínimo pedido é 56 px de CSS) e a folga das bordas.
export const BUTTON_MIN_PX = 56;
const EDGE = 14;
// SUGESTÃO: a fonte do HUD fica com 2 px de CSS por pixel da fonte (letra de 14 px de altura).
export const HUD_TEXT_CSS_SCALE = 2;

/** Botões que o jogador pode mudar de lugar no modo de ajuste. */
export const MOVABLE = ['b1', 'b2', 'b3', 'especial', 'item', 'auto', 'falar'] as const;
export type MovableId = (typeof MOVABLE)[number];
/** Deslocamento de cada botão, em px de CSS (vale em qualquer aparelho). */
export type LayoutOffsets = Partial<Record<MovableId, { dx: number; dy: number }>>;
export const LAYOUT_KEY = 'pqp_layout';

/**
 * Posições do HUD para um canvas W×H (pixels de canvas). `safeBottom` e `safeTop` são as áreas
 * seguras em px de CSS (barra de gestos do iPhone); `px` é o dpr efetivo.
 */
export function hudLayout(W: number, H: number, safeBottom = 0, safeTop = 0, px = 1): HudLayout {
  const cw = W / px, ch = H / px;
  const ui = Math.max(1, Math.min(1.6, Math.min(cw, ch * 0.6) / 390));
  const ts = Math.max(1, Math.round(HUD_TEXT_CSS_SCALE * ui * px));
  const charW = (FONT_CELL_W * ts) / px;
  const lineH = (FONT_CELL_H * ts) / px;
  const rSpecial = Math.round(42 * ui);
  const rBtn = Math.round(Math.max(BUTTON_MIN_PX / 2, 31 * ui));
  const rItem = Math.round(Math.max(BUTTON_MIN_PX / 2, 28 * ui));
  const rSmall = Math.round(Math.max(BUTTON_MIN_PX / 2, 30 * ui));
  const bottom = ch - EDGE - safeBottom;
  const cx = cw - EDGE - rSpecial - 6 * ui;
  const cy = bottom - rSpecial - 6 * ui;
  // arco: raio do Especial + raio do botão + folga
  const arc = rSpecial + rBtn + 12 * ui;
  const at = (deg: number, dist: number, r: number): Circle => {
    const a = (deg * Math.PI) / 180;
    return { x: cx + Math.cos(a) * dist, y: cy - Math.sin(a) * dist, r };
  };
  const b1 = at(180, arc, rBtn);
  const b2 = at(135, arc, rBtn);
  const b3 = at(90, arc, rBtn);
  // segundo anel: item e AUTO, por fora do arco
  const ring2 = arc + rBtn + rItem + 6 * ui;
  const item = at(122, ring2, rItem);
  const auto = at(78, arc + rBtn + rSmall + 8 * ui, rSmall);
  auto.x = Math.min(auto.x, cw - 6 - rSmall);
  const rTalk = Math.round(Math.max(BUTTON_MIN_PX / 2, 30 * ui));
  // "Falar" fica na beira esquerda da metade direita, acima do item (não rouba área do joystick)
  const falar: Circle = { x: Math.max(cw / 2 + rTalk + 8, item.x - rItem - rTalk - 10 * ui), y: item.y - rItem - rTalk - 14 * ui, r: rTalk };

  // quadros do topo
  const top = 8 + safeTop;
  const pad = 5 * ui;
  const frameW = Math.round(Math.min(cw * 0.47, 200 * ui));
  const P = { x: 8, y: top, w: frameW };
  const pName = { x: P.x + pad, y: P.y + pad };
  const hpBar = { x: P.x + pad, y: pName.y + lineH + 3, w: frameW - 2 * pad, h: lineH };
  const resBar = { x: P.x + pad, y: hpBar.y + hpBar.h + 3, w: frameW - 2 * pad, h: 6 * ui };
  const level = { x: P.x + pad, y: resBar.y + resBar.h + 3 };
  const xpX = level.x + 5 * charW + 4;
  const xpBar = { x: xpX, y: level.y + lineH / 2 - 2 * ui, w: Math.max(8, P.x + frameW - pad - xpX), h: 4 * ui };
  const pH = level.y + lineH + pad - P.y;
  const player: PlayerFrame = { ...P, h: pH, name: pName, hpBar, resBar, level, xpBar, chars: Math.max(3, Math.floor(hpBar.w / charW)) };

  const T = { x: cw - 8 - frameW, y: top, w: frameW };
  // retrato 64x64 em escala inteira de canvas (ou meia, se não couber nem 1x)
  const pAvail = (2 * lineH + 10 * ui + 6) * px;
  const pScale = pAvail >= 64 ? Math.floor(pAvail / 64) : 0.5;
  const pSize = (64 * pScale) / px;
  const tx = T.x + pad + pSize + 4;
  const tName = { x: tx, y: T.y + pad };
  const tHp = { x: tx, y: tName.y + lineH + 3, w: T.x + frameW - pad - tx, h: 10 * ui };
  const tLevel = { x: tx, y: tHp.y + tHp.h + 3 };
  const tH = Math.max(tLevel.y + lineH + pad, T.y + pad + pSize + pad) - T.y;
  const target: TargetFrame = {
    ...T,
    h: tH,
    portrait: { x: T.x + pad + pSize / 2, y: T.y + tH / 2, scale: pScale },
    name: tName,
    hpBar: tHp,
    level: tLevel,
    chars: Math.max(3, Math.floor(tHp.w / charW)),
  };

  const ala: Circle = { x: cw - EDGE - rSmall, y: top + tH + 8 + rSmall, r: rSmall };
  const ajuste: Circle = { x: 8 + rSmall, y: top + pH + 8 + rSmall, r: rSmall };
  // barra do chefe abaixo dos botões do topo, com espaço para o nome em cima
  const bossY = top + Math.max(pH, tH) + 8 + 2 * rSmall + 8 + lineH + 4;
  const boss = { x: cw * 0.12, y: bossY, w: cw * 0.76, h: 14 * ui };
  const bannerY = bossY + boss.h + 10;

  const tips: Record<TipId, TipAnchor> = {
    andar: { x: cw * 0.25, y: ch * 0.7, oy: 0.5, wrap: cw * 0.42 },
    // em cima do botão Falar (os dois aparecem juntos perto de um NPC), na metade direita
    mira: { x: Math.min(cw - cw * 0.21 - 4, Math.max(cw / 2 + cw * 0.21, falar.x)), y: falar.y - falar.r - 10 * ui, oy: 1, wrap: cw * 0.42 },
    alvo: { x: cw / 2, y: ch * 0.28, oy: 0.5, wrap: cw * 0.8 },
    estilo: { x: cw / 2, y: ch * 0.36, oy: 0.5, wrap: cw * 0.8 },
    rumo: { x: cw / 2, y: bannerY + 40 * ui, oy: 0, wrap: cw * 0.6 },
  };

  const S = (c: Circle): Circle => ({ x: Math.round(c.x * px), y: Math.round(c.y * px), r: Math.round(c.r * px) });
  const SP = (p: Pt): Pt => ({ x: Math.round(p.x * px), y: Math.round(p.y * px) });
  const SR = (r: Rect): Rect => ({ x: Math.round(r.x * px), y: Math.round(r.y * px), w: Math.round(r.w * px), h: Math.max(1, Math.round(r.h * px)) });
  const tipsOut = {} as Record<TipId, TipAnchor>;
  for (const k of Object.keys(tips) as TipId[]) {
    const t = tips[k];
    tipsOut[k] = { x: Math.round(t.x * px), y: Math.round(t.y * px), oy: t.oy, wrap: Math.round(t.wrap * px) };
  }
  return {
    ui,
    px,
    ts,
    charW: FONT_CELL_W * ts,
    lineH: FONT_CELL_H * ts,
    b1: S(b1),
    b2: S(b2),
    b3: S(b3),
    especial: S({ x: cx, y: cy, r: rSpecial }),
    item: S(item),
    auto: S(auto),
    falar: S(falar),
    ala: S(ala),
    ajuste: S(ajuste),
    player: { ...SR(player), name: SP(player.name), hpBar: SR(player.hpBar), resBar: SR(player.resBar), level: SP(player.level), xpBar: SR(player.xpBar), chars: player.chars },
    target: {
      ...SR(target),
      portrait: { ...SP(target.portrait), scale: target.portrait.scale },
      name: SP(target.name),
      hpBar: SR(target.hpBar),
      level: SP(target.level),
      chars: target.chars,
    },
    boss: { x: Math.round(boss.x * px), y: Math.round(boss.y * px), w: Math.round(boss.w * px), h: Math.round(boss.h * px) },
    tips: tipsOut,
    bannerY: Math.round(bannerY * px),
  };
}

/** Ponto dentro do círculo, com folga extra para o polegar (`slack` em pixels de canvas). */
export const hitCircle = (c: Circle, x: number, y: number, slack = 6) => Math.hypot(x - c.x, y - c.y) <= c.r + slack;

export const circlesOverlap = (a: Circle, b: Circle, gap = 0) => Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + gap;

/**
 * Prende um botão na área permitida: metade direita (não invade o joystick), dentro da tela, abaixo
 * de 30% da altura (os quadros e a barra do chefe ficam em cima) e acima da área segura de baixo.
 */
export function clampButton(c: Circle, W: number, H: number, safeBottom = 0, px = 1): Circle {
  const m = 2 * px;
  const x = Math.max(W / 2 + c.r, Math.min(W - c.r - m, c.x));
  const y = Math.max(H * 0.3 + c.r, Math.min(H - c.r - m - safeBottom * px, c.y));
  return { x: Math.round(x), y: Math.round(y), r: c.r };
}

/** Aplica os deslocamentos do jogador sobre o layout padrão, presos na área permitida. */
export function applyOffsets(L: HudLayout, offs: LayoutOffsets, W: number, H: number, safeBottom = 0): HudLayout {
  const out: HudLayout = { ...L };
  for (const id of MOVABLE) {
    const o = offs[id];
    if (!o) continue;
    const c = L[id];
    out[id] = clampButton({ x: c.x + o.dx * L.px, y: c.y + o.dy * L.px, r: c.r }, W, H, safeBottom, L.px);
  }
  return out;
}

/** Deslocamento (px de CSS) de um botão movido para `c`, a partir da posição padrão `base`. */
export function offsetOf(base: Circle, c: Circle, px: number): { dx: number; dy: number } {
  return { dx: Math.round((c.x - base.x) / px), dy: Math.round((c.y - base.y) / px) };
}

/** Lê os deslocamentos guardados (JSON); qualquer coisa estranha é ignorada. */
export function parseOffsets(raw: string | null | undefined): LayoutOffsets {
  const out: LayoutOffsets = {};
  if (!raw) return out;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!o || typeof o !== 'object') return out;
  for (const id of MOVABLE) {
    const v = (o as Record<string, unknown>)[id];
    if (!v || typeof v !== 'object') continue;
    const dx = Number((v as { dx?: unknown }).dx), dy = Number((v as { dy?: unknown }).dy);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
    out[id] = { dx: Math.max(-4000, Math.min(4000, Math.round(dx))), dy: Math.max(-4000, Math.min(4000, Math.round(dy))) };
  }
  return out;
}

export function serializeOffsets(o: LayoutOffsets): string {
  const clean: LayoutOffsets = {};
  for (const id of MOVABLE) {
    const v = o[id];
    if (v && (v.dx !== 0 || v.dy !== 0)) clean[id] = { dx: v.dx, dy: v.dy };
  }
  return JSON.stringify(clean);
}

/** Quantas letras da fonte de pixel cabem em `widthPx` com a escala `ts`. */
export function charsFit(widthPx: number, ts: number): number {
  return Math.max(1, Math.floor(widthPx / (FONT_CELL_W * ts)));
}

/**
 * Seta na borda da tela apontando para um ponto fora dela (tela em pixels de canvas, `dx`/`dy` em
 * qualquer unidade a partir do centro da tela). Devolve a posição da seta (dentro de `margin` da
 * borda) e o ângulo em radianos.
 */
export function edgeArrow(W: number, H: number, dx: number, dy: number, margin: number, top = 0, bottom = 0): { x: number; y: number; angle: number } {
  const angle = Math.atan2(dy, dx);
  const cx = W / 2, cy = H / 2;
  const hw = W / 2 - margin;
  const hTop = cy - top - margin, hBot = H - bottom - margin - cy;
  const c = Math.cos(angle), s = Math.sin(angle);
  let t = Infinity;
  if (Math.abs(c) > 1e-9) t = Math.min(t, hw / Math.abs(c));
  if (s < -1e-9) t = Math.min(t, hTop / -s);
  else if (s > 1e-9) t = Math.min(t, hBot / s);
  if (!Number.isFinite(t)) t = 0;
  return { x: cx + c * t, y: cy + s * t, angle };
}
