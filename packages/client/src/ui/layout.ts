/**
 * Medidas da tela (puro, testável): zoom da câmera e posição dos botões do HUD em retrato.
 *
 * Zoom: inteiro ou meio-inteiro, escolhido para caber de 11 a 13 tiles de largura (o mais perto de
 * 12). Botões: arco no canto inferior direito, ao alcance do polegar direito; o Especial é o maior,
 * no canto; as 3 habilidades em volta dele; o item à esquerda do arco.
 */
import { TILE_PX } from '../art/contract';

export const ZOOM_TARGET_TILES = 12;
export const ZOOM_MIN_TILES = 11;
export const ZOOM_MAX_TILES = 13;

/** Zoom da câmera do mundo para uma tela de `screenW` px de largura. */
export function computeZoom(screenW: number, target = ZOOM_TARGET_TILES): number {
  let best = 1;
  let bestScore = Infinity;
  for (let z = 0.5; z <= 8; z += 0.5) {
    const tiles = screenW / (TILE_PX * z);
    const inside = tiles >= ZOOM_MIN_TILES && tiles <= ZOOM_MAX_TILES;
    // dentro da faixa ganha sempre; fora, o mais perto do alvo
    const score = Math.abs(tiles - target) + (inside ? 0 : 100);
    if (score < bestScore) {
      bestScore = score;
      best = z;
    }
  }
  return best;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface HudLayout {
  /** escala da interface (1 = celular de ~390 px) */
  ui: number;
  b1: Circle;
  b2: Circle;
  b3: Circle;
  especial: Circle;
  item: Circle;
  auto: Circle;
  falar: Circle;
  ala: Circle;
  /** quadro do jogador (topo esquerdo) e do alvo (topo direito) */
  player: { x: number; y: number; w: number };
  target: { x: number; y: number; w: number };
  boss: { x: number; y: number; w: number };
}

// SUGESTÃO: tamanhos dos botões (o mínimo pedido é 56 px) e a folga das bordas.
export const BUTTON_MIN_PX = 56;
const EDGE = 14;

/**
 * Posições do HUD para uma tela W×H (px de CSS). `safeBottom` é a área segura de baixo (barra de
 * gestos do iPhone).
 */
export function hudLayout(W: number, H: number, safeBottom = 0, safeTop = 0): HudLayout {
  const ui = Math.max(1, Math.min(1.6, Math.min(W, H * 0.6) / 390));
  const rSpecial = Math.round(42 * ui);
  const rBtn = Math.round(Math.max(BUTTON_MIN_PX / 2, 31 * ui));
  const rItem = Math.round(Math.max(BUTTON_MIN_PX / 2, 28 * ui));
  const bottom = H - EDGE - safeBottom;
  const cx = W - EDGE - rSpecial - 6 * ui;
  const cy = bottom - rSpecial - 6 * ui;
  // arco: raio do Especial + raio do botão + folga
  const arc = rSpecial + rBtn + 12 * ui;
  const at = (deg: number, dist: number, r: number): Circle => {
    const a = (deg * Math.PI) / 180;
    return { x: Math.round(cx + Math.cos(a) * dist), y: Math.round(cy - Math.sin(a) * dist), r };
  };
  const b1 = at(180, arc, rBtn);
  const b2 = at(135, arc, rBtn);
  const b3 = at(90, arc, rBtn);
  // segundo anel: item e AUTO, por fora do arco
  const rSmall = Math.round(Math.max(22, 20 * ui));
  const ring2 = arc + rBtn + rItem + 6 * ui;
  const item = at(122, ring2, rItem);
  const auto = at(78, arc + rBtn + rSmall + 8 * ui, rSmall);
  const rTalk = Math.round(Math.max(BUTTON_MIN_PX / 2, 30 * ui));
  // "Falar" fica na beira esquerda da metade direita, acima do item (não rouba área do joystick)
  const falar: Circle = { x: Math.round(Math.max(W / 2 + rTalk + 8, item.x - rItem - rTalk - 10 * ui)), y: Math.round(item.y - rItem - rTalk - 14 * ui), r: rTalk };
  const top = 8 + safeTop;
  const frameW = Math.round(Math.min(170 * ui, W * 0.44));
  const ala: Circle = { x: W - EDGE - rSmall, y: Math.round(top + 64 * ui + rSmall), r: rSmall };
  return {
    ui,
    b1,
    b2,
    b3,
    especial: { x: Math.round(cx), y: Math.round(cy), r: rSpecial },
    item,
    auto,
    falar,
    ala,
    player: { x: 8, y: top, w: frameW },
    target: { x: W - 8 - frameW, y: top, w: frameW },
    // barra do chefe abaixo do botão ALA, com espaço para o nome em cima
    boss: { x: Math.round(W * 0.12), y: Math.round(top + 64 * ui + 2 * rSmall + 26), w: Math.round(W * 0.76) },
  };
}

/** Ponto dentro do círculo, com folga extra para o polegar. */
export const hitCircle = (c: Circle, x: number, y: number, slack = 6) => Math.hypot(x - c.x, y - c.y) <= c.r + slack;
