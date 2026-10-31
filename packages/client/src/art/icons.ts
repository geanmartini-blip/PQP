/**
 * Ícones 48x48 dos botões (habilidades, itens e consumíveis), emblemas 64x64 das instituições e
 * retratos 64x64. Legíveis no celular: moldura pela margem, fundo pela cor da classe, desenho no
 * meio e o glifo do tipo de habilidade no canto.
 *
 * SUGESTÃO: as cores de classe dos ícones (combatente vermelho, atirador amarelo, elemental azul,
 * mascarado roxo) não estão nos docs.
 */
import { getData } from '@pqp/shared';
import { buildCharacterSheet, type ArtLook } from './character';
import type { CharacterLook } from './contract';
import { buildEnemySheet } from './creatures';
import { drawText, textWidth } from './font';
import { npcLook } from './npcs';
import { C, type Color, hex, light, mix, Pix, shade, withAlpha } from './pixel';
import { frameOf } from './sheet';

export const ICON_PX = 48;
export const PORTRAIT_PX = 64;

export const CLASS_COLOR: Record<string, Color> = {
  combatente: hex('#d8543a'),
  atirador: hex('#e0a82a'),
  elemental: hex('#3a96d8'),
  mascarado: hex('#9a5ad8'),
};

const RARITY: Record<string, Color> = {
  comum: hex('#c9c9c9'),
  raro: hex('#4aa3ff'),
  unico: hex('#e8a33a'),
  set: hex('#b05aff'),
};

type Motif =
  | 'touro'
  | 'laco'
  | 'coracao'
  | 'estrela'
  | 'seta'
  | 'punho'
  | 'escudo'
  | 'grito'
  | 'bala'
  | 'chuva'
  | 'alvo'
  | 'totem'
  | 'explosao'
  | 'onda'
  | 'raio'
  | 'fumaca'
  | 'caveira'
  | 'espiral'
  | 'nota'
  | 'mascara'
  | 'pocao'
  | 'sopa'
  | 'lata'
  | 'granada'
  | 'chapeu'
  | 'camisa'
  | 'calca'
  | 'bota'
  | 'anel'
  | 'folha';

const ABILITY_MOTIF: Record<string, Motif> = {
  segura_o_peao: 'touro',
  rodeio: 'laco',
  fanchant: 'coracao',
  encore: 'estrela',
  arrancada: 'seta',
  pancadao: 'punho',
  casca_grossa: 'escudo',
  grito_de_guerra: 'grito',
  rajada: 'bala',
  chuva_de_chumbo: 'chuva',
  recuo: 'seta',
  mira_marcada: 'alvo',
  totem_ou_robo: 'totem',
  explosao_elemental: 'explosao',
  onda: 'onda',
  recarga: 'raio',
  sumico: 'fumaca',
  maldicao_ou_virus: 'caveira',
  confusao: 'espiral',
  animacao: 'nota',
  usar_pocao: 'pocao',
  usar_sopa: 'sopa',
  usar_energetico: 'lata',
  usar_granada: 'granada',
  pocao: 'pocao',
  sopa: 'sopa',
  energetico: 'lata',
  granada: 'granada',
};

const BASIC_MOTIF: Record<string, Motif> = { combatente: 'punho', atirador: 'bala', elemental: 'raio', mascarado: 'mascara' };
const SLOT_MOTIF: Record<string, Motif> = { cabeca: 'chapeu', peito: 'camisa', calca: 'calca', calcado: 'bota', adorno: 'anel' };

// ---------------------------------------------------------------------------
// glifos de tipo (desenhados num quadrado de lado s a partir de x, y)

export function drawTypeGlyph(p: Pix, type: string, x: number, y: number, s: number, col: Color): void {
  const cx = x + s / 2;
  const cy = y + s / 2;
  const r = s / 2 - 0.5;
  switch (type) {
    case 'travada':
      p.ring(cx, cy, r * 0.75, r * 0.75, Math.max(1, s / 12), col);
      p.hline(Math.round(x), Math.round(x + s * 0.3), Math.round(cy - 0.5), col);
      p.hline(Math.round(x + s * 0.7), Math.round(x + s - 1), Math.round(cy - 0.5), col);
      p.vline(Math.round(cx - 0.5), Math.round(y), Math.round(y + s * 0.3), col);
      p.vline(Math.round(cx - 0.5), Math.round(y + s * 0.7), Math.round(y + s - 1), col);
      p.disk(cx, cy, Math.max(1, s / 10), col);
      break;
    case 'em_volta':
      p.disk(cx, cy, r * 0.3, col);
      p.ring(cx, cy, r * 0.75, r * 0.75, Math.max(1, s / 14), col);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        p.line(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8, cx + Math.cos(a) * r, cy + Math.sin(a) * r, col);
      }
      break;
    case 'area_alvo':
      p.ring(cx, cy + r * 0.35, r, r * 0.5, Math.max(1, s / 14), col);
      p.disk(cx, cy + r * 0.35, r * 0.2, col);
      p.vline(Math.round(cx - 0.5), Math.round(y), Math.round(cy), col);
      p.line(cx - r * 0.35, cy - r * 0.3, cx, cy, col);
      p.line(cx + r * 0.35, cy - r * 0.3, cx, cy, col);
      break;
    case 'cone':
      p.poly(
        [
          [x + s * 0.1, cy],
          [x + s, y + s * 0.1],
          [x + s, y + s * 0.9],
        ],
        withAlpha(col, 150),
      );
      p.line(x + s * 0.1, cy, x + s - 1, y + s * 0.1, col);
      p.line(x + s * 0.1, cy, x + s - 1, y + s * 0.9, col);
      break;
    case 'campo':
      p.ellipse(cx, cy + r * 0.3, r, r * 0.55, withAlpha(col, 110));
      p.ring(cx, cy + r * 0.3, r, r * 0.55, Math.max(1, s / 16), col);
      for (let k = -1; k <= 1; k++) p.vline(Math.round(cx + k * r * 0.45), Math.round(y + s * 0.15), Math.round(cy), col);
      break;
    case 'aliado':
      p.box(Math.round(cx - s * 0.12), Math.round(y + s * 0.1), Math.round(cx + s * 0.12), Math.round(y + s * 0.9), col);
      p.box(Math.round(x + s * 0.1), Math.round(cy - s * 0.12), Math.round(x + s * 0.9), Math.round(cy + s * 0.12), col);
      break;
    default:
      p.disk(cx, cy, r * 0.5, col);
  }
}

// ---------------------------------------------------------------------------
// motivos (desenhados num quadro de 24x24 em x, y)

function motif(p: Pix, m: Motif, x: number, y: number, accent: Color): void {
  const W = C.pureWhite;
  const ink = C.ink;
  switch (m) {
    case 'touro':
      p.ellipse(x + 12, y + 14, 7, 6, hex('#7a4a2a'));
      p.capsule(x + 6, y + 10, x + 1, y + 4, 2.4, C.paper);
      p.capsule(x + 18, y + 10, x + 23, y + 4, 2.4, C.paper);
      p.box(x + 8, y + 16, x + 16, y + 20, hex('#a87a5a'));
      p.put(x + 9, y + 18, ink);
      p.put(x + 15, y + 18, ink);
      p.put(x + 9, y + 12, W);
      p.put(x + 15, y + 12, W);
      p.ring(x + 12, y + 21, 2, 1.4, 1, C.gold);
      break;
    case 'laco':
      p.ring(x + 12, y + 9, 10, 6, 2, hex('#d8b878'));
      p.line(x + 4, y + 13, x + 10, y + 23, hex('#d8b878'));
      p.line(x + 5, y + 13, x + 11, y + 23, hex('#a88848'));
      p.put(x + 20, y + 5, hex('#9cf08a'));
      p.put(x + 3, y + 6, hex('#9cf08a'));
      break;
    case 'coracao':
      p.disk(x + 8, y + 9, 5, C.neonPink);
      p.disk(x + 16, y + 9, 5, C.neonPink);
      p.poly([[x + 3, y + 11], [x + 21, y + 11], [x + 12, y + 22]], C.neonPink);
      p.put(x + 6, y + 6, W);
      p.put(x + 7, y + 6, W);
      for (let k = 0; k < 3; k++) p.ring(x + 24, y + 12, 3 + k * 3, 3 + k * 3, 1, withAlpha(C.neonCyan, 200 - k * 50));
      break;
    case 'estrela': {
      const pts: [number, number][] = [];
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? 4.5 : 11;
        pts.push([x + 12 + Math.cos(a) * rr, y + 12.5 + Math.sin(a) * rr]);
      }
      p.poly(pts, C.warn);
      p.put(x + 10, y + 8, W);
      break;
    }
    case 'seta':
      p.box(x + 2, y + 10, x + 14, y + 14, W);
      p.poly([[x + 13, y + 4], [x + 23, y + 12], [x + 13, y + 20]], W);
      p.hline(x + 1, x + 6, y + 7, withAlpha(W, 140));
      p.hline(x + 1, x + 6, y + 17, withAlpha(W, 140));
      break;
    case 'punho':
      p.box(x + 5, y + 6, x + 18, y + 17, hex('#e8b080'));
      for (let k = 0; k < 4; k++) p.vline(x + 8 + k * 3, y + 6, y + 9, hex('#b88050'));
      p.box(x + 7, y + 18, x + 16, y + 22, accent);
      p.box(x + 2, y + 9, x + 5, y + 14, hex('#e8b080'));
      break;
    case 'escudo':
      p.poly([[x + 3, y + 3], [x + 21, y + 3], [x + 21, y + 12], [x + 12, y + 22], [x + 3, y + 12]], hex('#9aa0a8'));
      p.poly([[x + 6, y + 6], [x + 18, y + 6], [x + 18, y + 12], [x + 12, y + 18], [x + 6, y + 12]], light(accent, 0.2));
      break;
    case 'grito':
      p.poly([[x + 2, y + 9], [x + 10, y + 4], [x + 10, y + 20], [x + 2, y + 15]], hex('#c8ccd2'));
      for (let k = 0; k < 3; k++) p.ring(x + 10, y + 12, 5 + k * 4, 5 + k * 4, 1, withAlpha(W, 220 - k * 50));
      break;
    case 'bala':
      for (let k = 0; k < 3; k++) {
        const bx = x + 3 + k * 7;
        p.box(bx, y + 9, bx + 4, y + 20, C.gold);
        p.ellipse(bx + 2.5, y + 8, 2.5, 3.5, hex('#b87333'));
      }
      break;
    case 'chuva':
      for (let k = 0; k < 9; k++) p.line(x + 2 + k * 2.5, y + 2 + (k % 3) * 4, x + (k % 3), y + 8 + (k % 3) * 4 + k * 1.2, hex('#c8ccd2'));
      p.ring(x + 12, y + 20, 9, 3, 1, withAlpha(RED_A, 255));
      break;
    case 'alvo':
      p.ring(x + 12, y + 12, 10, 10, 2, C.red);
      p.ring(x + 12, y + 12, 6, 6, 2, W);
      p.disk(x + 12, y + 12, 2.5, C.red);
      break;
    case 'totem':
      p.box(x + 8, y + 3, x + 16, y + 22, hex('#8a5a32'));
      p.hline(x + 7, x + 17, y + 9, hex('#5a3a20'));
      p.hline(x + 7, x + 17, y + 15, hex('#5a3a20'));
      p.box(x + 9, y + 5, x + 10, y + 6, hex('#9cf08a'));
      p.box(x + 14, y + 5, x + 15, y + 6, C.neonCyan);
      break;
    case 'explosao':
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        p.line(x + 12, y + 12, x + 12 + Math.cos(a) * (k % 2 ? 7 : 11), y + 12 + Math.sin(a) * (k % 2 ? 7 : 11), k % 2 ? C.warn : hex('#ff6a2a'));
      }
      p.disk(x + 12, y + 12, 4, W);
      break;
    case 'onda':
      for (let k = 0; k < 3; k++)
        for (let i = 0; i < 22; i++) p.put(x + 1 + i, y + 6 + k * 6 + Math.round(Math.sin(i / 2.5) * 2), k === 1 ? W : light(accent, 0.4));
      break;
    case 'raio':
      p.poly([[x + 13, y + 1], [x + 5, y + 13], [x + 11, y + 13], [x + 9, y + 23], [x + 19, y + 9], [x + 13, y + 9]], C.warn);
      p.line(x + 12, y + 3, x + 7, y + 11, W);
      break;
    case 'fumaca':
      p.disk(x + 8, y + 14, 6, withAlpha(hex('#d8d8e0'), 220));
      p.disk(x + 15, y + 11, 7, withAlpha(hex('#e8e8f0'), 220));
      p.disk(x + 12, y + 17, 5, withAlpha(hex('#c8c8d0'), 220));
      break;
    case 'caveira':
      p.ellipse(x + 12, y + 10, 8, 8, W);
      p.box(x + 8, y + 16, x + 16, y + 21, W);
      p.box(x + 8, y + 8, x + 10, y + 11, ink);
      p.box(x + 14, y + 8, x + 16, y + 11, ink);
      for (let k = 9; k < 16; k += 2) p.vline(x + k, y + 18, y + 21, ink);
      p.put(x + 20, y + 4, C.neonGreen);
      break;
    case 'espiral':
      for (let t = 0; t < 30; t++) {
        const a = t * 0.55;
        const rr = 1 + t * 0.35;
        p.put(Math.round(x + 12 + Math.cos(a) * rr), Math.round(y + 12 + Math.sin(a) * rr), W);
      }
      break;
    case 'nota':
      p.vline(x + 15, y + 3, y + 17, W);
      p.vline(x + 16, y + 3, y + 17, W);
      p.box(x + 16, y + 3, x + 21, y + 6, W);
      p.ellipse(x + 12, y + 18, 4.5, 3.5, W);
      break;
    case 'mascara':
      p.ellipse(x + 12, y + 12, 10, 9, hex('#ede0c4'));
      p.box(x + 6, y + 9, x + 9, y + 11, ink);
      p.box(x + 15, y + 9, x + 18, y + 11, ink);
      p.line(x + 8, y + 16, x + 16, y + 16, ink);
      p.put(x + 7, y + 15, ink);
      p.put(x + 17, y + 15, ink);
      break;
    case 'pocao':
      p.box(x + 10, y + 2, x + 14, y + 7, hex('#c8d8e0'));
      p.disk(x + 12, y + 15, 8, hex('#d84a6a'));
      p.disk(x + 9, y + 12, 2, withAlpha(W, 200));
      break;
    case 'sopa':
      p.ellipse(x + 12, y + 14, 10, 4, hex('#c88a3a'));
      p.poly([[x + 2, y + 14], [x + 22, y + 14], [x + 18, y + 22], [x + 6, y + 22]], hex('#8a5a32'));
      for (let k = 0; k < 3; k++) p.line(x + 7 + k * 5, y + 9, x + 8 + k * 5, y + 3, withAlpha(W, 170));
      break;
    case 'lata':
      p.box(x + 7, y + 3, x + 17, y + 22, hex('#3a3a46'));
      p.hline(x + 7, x + 17, y + 3, C.silver);
      p.poly([[x + 13, y + 6], [x + 9, y + 13], [x + 12, y + 13], [x + 10, y + 19], [x + 15, y + 11], [x + 12, y + 11]], C.neonGreen);
      break;
    case 'granada':
      p.disk(x + 12, y + 14, 8, hex('#4a5a3a'));
      for (let k = 0; k < 3; k++) p.hline(x + 6, x + 18, y + 10 + k * 4, hex('#3a4a2a'));
      p.box(x + 10, y + 3, x + 14, y + 6, C.metal);
      p.ring(x + 17, y + 5, 2.5, 2.5, 1, C.silver);
      break;
    case 'chapeu':
      p.box(x + 7, y + 6, x + 17, y + 14, accent);
      p.box(x + 1, y + 14, x + 23, y + 16, shade(accent, 0.8));
      p.hline(x + 7, x + 17, y + 12, C.ink);
      break;
    case 'camisa':
      p.poly([[x + 2, y + 6], [x + 8, y + 3], [x + 16, y + 3], [x + 22, y + 6], [x + 19, y + 11], [x + 17, y + 9], [x + 17, y + 22], [x + 7, y + 22], [x + 7, y + 9], [x + 5, y + 11]], accent);
      p.line(x + 10, y + 3, x + 12, y + 7, shade(accent, 0.6));
      p.line(x + 14, y + 3, x + 12, y + 7, shade(accent, 0.6));
      break;
    case 'calca':
      p.poly([[x + 5, y + 2], [x + 19, y + 2], [x + 20, y + 22], [x + 14, y + 22], [x + 12, y + 9], [x + 10, y + 22], [x + 4, y + 22]], accent);
      p.hline(x + 5, x + 19, y + 4, shade(accent, 0.6));
      break;
    case 'bota':
      p.poly([[x + 6, y + 2], [x + 14, y + 2], [x + 14, y + 15], [x + 22, y + 17], [x + 22, y + 22], [x + 6, y + 22]], accent);
      p.hline(x + 6, x + 22, y + 21, shade(accent, 0.5));
      break;
    case 'anel':
      p.ring(x + 12, y + 14, 8, 7, 2.5, C.gold);
      p.disk(x + 12, y + 6, 3.5, accent);
      p.put(x + 11, y + 5, C.pureWhite);
      break;
    case 'folha':
      p.ellipse(x + 12, y + 12, 6, 10, C.leaf);
      p.vline(x + 12, y + 3, y + 22, C.leafDark);
      break;
  }
}

const RED_A = hex('#ff4a3a');

// ---------------------------------------------------------------------------

interface IconSpec {
  bg: Color;
  frame: Color;
  frameInner: Color;
  motif?: Motif;
  type?: string;
  accent: Color;
  label?: string;
}

function iconFrame(p: Pix, s: IconSpec): void {
  const n = ICON_PX;
  // fundo com degradê vertical em 3 tons
  for (let y = 0; y < n; y++) p.hline(0, n - 1, y, y < 16 ? light(s.bg, 0.12) : y < 32 ? s.bg : shade(s.bg, 0.82));
  // cantos arredondados
  for (const [x, y] of [
    [0, 0],
    [n - 1, 0],
    [0, n - 1],
    [n - 1, n - 1],
  ] as const)
    p.set(x, y, 0);
  p.frame(0, 0, n - 1, n - 1, s.frame);
  p.frame(1, 1, n - 2, n - 2, s.frame);
  p.frame(2, 2, n - 3, n - 3, s.frameInner);
  p.set(0, 0, 0);
  p.set(n - 1, 0, 0);
  p.set(0, n - 1, 0);
  p.set(n - 1, n - 1, 0);
}

function renderIcon(s: IconSpec): Pix {
  const p = new Pix(ICON_PX, ICON_PX);
  iconFrame(p, s);
  const art = new Pix(ICON_PX, ICON_PX);
  if (s.motif) motif(art, s.motif, 12, 9, s.accent);
  else if (s.type) drawTypeGlyph(art, s.type, 12, 10, 24, C.pureWhite);
  else if (s.label) drawText(art, Math.round((ICON_PX - textWidth(s.label, 2)) / 2), 17, s.label, C.pureWhite, 2);
  art.outline({ minAlpha: 100 });
  p.blit(art, 0, 0);
  if (s.type && s.motif) {
    // glifo do tipo no canto
    p.disk(39, 39, 7, withAlpha(C.ink, 220));
    drawTypeGlyph(p, s.type, 33, 33, 12, C.pureWhite);
  }
  return p;
}

function sideFrame(side: string | undefined): { frame: Color; inner: Color } {
  if (side === 'esquerda') return { frame: hex('#6a4426'), inner: hex('#7ab85a') };
  if (side === 'direita') return { frame: hex('#22242c'), inner: C.neonCyan };
  return { frame: hex('#3a3a40'), inner: hex('#a8aab0') };
}

/** Ícone 48x48 (puro). Aceita id de habilidade, item, único ou consumível. */
export function buildIcon(id: string): Pix {
  const d = getData();
  const ab = d.abilities.get(id);
  if (ab) {
    const arch = d.archetypesById.get(ab.ownerKey);
    const cls = arch?.classe ?? (d.classesById.has(ab.ownerKey) ? ab.ownerKey : undefined);
    const side = arch?.margem;
    const f = sideFrame(side);
    const bg = cls ? CLASS_COLOR[cls]! : ab.slot === 'item' ? hex('#5a8a5a') : hex('#6a4a5a');
    const accent = arch ? hex(arch.paletasTraje[0]!.cores[0]!) : bg;
    let m = ABILITY_MOTIF[id];
    if (!m && ab.slot === 'basico' && cls) m = BASIC_MOTIF[cls];
    if (!m && (ab.slot === 'especial' || ab.slot === 'virada')) m = 'estrela';
    return renderIcon({ bg: shade(bg, 0.85), frame: f.frame, frameInner: ab.slot === 'especial' || ab.slot === 'virada' ? C.warn : f.inner, motif: m, type: ab.type, accent });
  }
  const item = d.itemsById.get(id) ?? d.uniquesById.get(id);
  if (item) {
    const cls = item.classLock ?? undefined;
    const side = 'margem' in item ? (item.margem as string | undefined) : undefined;
    const f = sideFrame(side);
    const bg = cls ? CLASS_COLOR[cls]! : hex('#5a5a66');
    const m = item.slot === 'arma' ? (cls ? BASIC_MOTIF[cls]! : 'punho') : SLOT_MOTIF[item.slot] ?? 'anel';
    return renderIcon({ bg: shade(bg, 0.75), frame: RARITY[item.rarity] ?? f.frame, frameInner: f.inner, motif: m, accent: light(bg, 0.2) });
  }
  const cons = d.consumablesById.get(id);
  if (cons) return renderIcon({ bg: hex('#4a6a4a'), frame: hex('#3a3a40'), frameInner: hex('#c8ccd2'), motif: ABILITY_MOTIF[id] ?? 'pocao', accent: C.leaf });
  // desconhecido: iniciais
  const label = id.replace(/_/g, ' ').trim().slice(0, 2).toUpperCase() || '?';
  return renderIcon({ bg: hex('#4a4a52'), frame: hex('#2a2a30'), frameInner: hex('#8a8a94'), label, accent: C.metal });
}

// ---------------------------------------------------------------------------
// emblemas 64x64 (Arte.md)

function emblemBase(p: Pix, pal: Color[]): void {
  const a = pal[0]!;
  const b = pal[1] ?? shade(a);
  // escudo
  p.poly([[6, 4], [58, 4], [58, 34], [32, 60], [6, 34]], shade(a, 0.55));
  p.poly([[9, 7], [55, 7], [55, 33], [32, 56], [9, 33]], a);
  p.poly([[12, 10], [52, 10], [52, 32], [32, 52], [12, 32]], mix(a, b, 0.25));
}

function emblemArt(p: Pix, id: string, pal: Color[]): void {
  const [a, b, c, d, e] = [pal[0]!, pal[1] ?? C.white, pal[2] ?? C.gold, pal[3] ?? C.metal, pal[4] ?? C.white];
  const W = C.pureWhite;
  switch (id) {
    case 'brigada_popular': // punho segurando uma muda de planta numa coroa de trigo
      for (let k = 0; k < 7; k++) {
        p.ellipse(16 + k * 0.6, 44 - k * 4, 2, 1.3, c);
        p.ellipse(48 - k * 0.6, 44 - k * 4, 2, 1.3, c);
      }
      p.box(25, 30, 38, 42, e);
      for (let k = 0; k < 4; k++) p.vline(27 + k * 3, 30, 33, d);
      p.vline(31, 14, 30, hex('#3e7a2a'));
      p.ellipse(27, 18, 4, 2, b);
      p.ellipse(35, 15, 4, 2, b);
      break;
    case 'guarda_comunitaria': // olho dentro de uma casinha com cerca
      p.poly([[16, 28], [32, 14], [48, 28]], e);
      p.box(19, 28, 45, 44, e);
      p.ellipse(32, 35, 9, 5, W);
      p.disk(32, 35, 3.5, a);
      p.disk(32, 35, 1.5, C.ink);
      for (let x = 12; x <= 52; x += 5) p.vline(x, 44, 50, d);
      p.hline(12, 52, 47, d);
      break;
    case 'escola_dos_saberes': // árvore com um livro aberto no lugar da copa
      p.box(29, 32, 34, 48, b);
      p.poly([[14, 22], [32, 26], [32, 34], [14, 30]], e);
      p.poly([[50, 22], [32, 26], [32, 34], [50, 30]], e);
      p.line(32, 26, 32, 34, b);
      for (let k = 0; k < 3; k++) {
        p.hline(17, 28, 26 + k * 2, d);
        p.hline(36, 47, 26 + k * 2, d);
      }
      p.ellipse(22, 20, 5, 3, a);
      p.ellipse(42, 20, 5, 3, a);
      break;
    case 'trupe_do_povo': // máscara sorrindo com uma lágrima pintada
      p.ellipse(32, 30, 15, 14, d);
      p.box(23, 25, 27, 28, C.ink);
      p.box(37, 25, 41, 28, C.ink);
      for (let x = 24; x <= 40; x++) p.put(x, 36 + Math.round(-Math.sin(((x - 24) / 16) * Math.PI) * -3), C.ink);
      p.ellipse(39, 32, 1.2, 2, hex('#6aa8d8'));
      p.ring(32, 30, 15, 14, 1, b);
      break;
    case 'torcida_furia_neon': // caveira de neon com coroa de louros e uma bola
      for (let k = 0; k < 6; k++) {
        p.ellipse(15 + k, 44 - k * 4, 2, 1.2, c);
        p.ellipse(49 - k, 44 - k * 4, 2, 1.2, c);
      }
      p.ellipse(32, 26, 10, 9, b);
      p.box(26, 32, 38, 38, b);
      p.box(27, 24, 30, 27, C.ink);
      p.box(34, 24, 37, 27, C.ink);
      for (let x = 28; x <= 36; x += 2) p.vline(x, 35, 38, C.ink);
      p.disk(32, 46, 5, W);
      p.box(31, 44, 33, 47, C.ink);
      break;
    case 'pm_do_consorcio': // escudo com cifrão estilizado e uma câmera
      p.vline(32, 16, 44, c);
      p.vline(33, 16, 44, c);
      for (let k = 0; k < 3; k++) p.hline(25 + (k % 2 ? 0 : 0), 40, 20 + k * 8, b);
      p.vline(25, 20, 28, b);
      p.vline(40, 28, 36, b);
      p.box(42, 12, 52, 18, C.ink);
      p.disk(47, 15, 2, b);
      p.put(51, 13, C.red);
      break;
    case 'universidade_neon': // capelo de formatura com um plugue de tomada
      p.poly([[12, 22], [32, 14], [52, 22], [32, 30]], C.ink);
      p.box(24, 26, 40, 34, C.ink);
      p.line(48, 22, 50, 32, d);
      p.box(28, 38, 36, 46, e);
      p.vline(30, 46, 50, c);
      p.vline(34, 46, 50, c);
      p.vline(32, 34, 38, c);
      break;
    case 'agencia_neon': {
      // estrela com um olho de holograma no meio
      const pts: [number, number][] = [];
      for (let k = 0; k < 10; k++) {
        const ang = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? 8 : 18;
        pts.push([32 + Math.cos(ang) * rr, 31 + Math.sin(ang) * rr]);
      }
      p.poly(pts, b);
      p.ellipse(32, 31, 6, 3.5, W);
      p.disk(32, 31, 2.5, withAlpha(a, 220));
      p.put(31, 30, W);
      break;
    }
    case 'casa_da_assembleia':
      p.poly([[14, 30], [32, 16], [50, 30]], d);
      p.box(18, 30, 46, 46, e);
      for (let x = 21; x <= 43; x += 6) p.box(x, 32, x + 2, 46, b);
      break;
    case 'torre_do_consorcio':
      p.box(24, 12, 40, 50, hex('#6ab8d8'));
      for (let y = 15; y < 48; y += 4) p.hline(26, 38, y, C.neonCyan);
      p.vline(32, 6, 12, C.metal);
      p.put(32, 5, C.red);
      break;
    default: {
      const t = id.slice(0, 2).toUpperCase();
      drawText(p, Math.round((64 - textWidth(t, 3)) / 2), 20, t, W, 3);
    }
  }
}

/** Emblema 64x64 de uma instituição (ou QG). */
export function buildEmblem(id: string): Pix {
  const d = getData();
  const inst = d.institutionsById.get(id);
  let pal: Color[];
  if (inst) pal = inst.paleta.map((x) => hex(x.hex));
  else if (id === 'casa_da_assembleia') pal = [hex('#5b6b2e'), hex('#a8463f'), hex('#d9a93a'), hex('#6b4429'), hex('#f1e6c8')];
  else if (id === 'torre_do_consorcio') pal = [hex('#22242c'), C.neonPink, C.neonCyan, hex('#7d7e80'), hex('#f5f5f7')];
  else pal = [hex('#5a5a66'), hex('#c8c8d0'), C.gold, C.metal, C.white];
  const p = new Pix(PORTRAIT_PX, PORTRAIT_PX);
  emblemBase(p, pal);
  const art = new Pix(PORTRAIT_PX, PORTRAIT_PX);
  emblemArt(art, id, pal);
  art.outline({ minAlpha: 100 });
  p.blit(art, 0, 0);
  p.outline();
  return p;
}

// ---------------------------------------------------------------------------
// retratos 64x64

function portraitBg(p: Pix, side: string | undefined): void {
  const top = side === 'esquerda' ? hex('#5e8a3e') : side === 'direita' ? hex('#2a2440') : hex('#4a6a8a');
  const bot = side === 'esquerda' ? hex('#3e5a2a') : side === 'direita' ? hex('#141824') : hex('#2e4a5e');
  for (let y = 0; y < 64; y++) p.hline(0, 63, y, mix(top, bot, y / 63));
  if (side === 'direita') for (let y = 2; y < 64; y += 6) p.hline(0, 63, y, withAlpha(C.neonCyan, 30));
  if (side === 'esquerda') for (let k = 0; k < 10; k++) p.put((k * 23) % 64, (k * 37) % 64, withAlpha(C.leaf, 120));
  p.frame(0, 0, 63, 63, C.ink);
  p.frame(1, 1, 62, 62, side === 'direita' ? C.neonCyan : side === 'esquerda' ? hex('#c8a070') : C.silver);
}

/** Retrato 64x64: cabeça e ombros do quadro de frente, ampliados 2x. */
export function buildPortrait(who: string | CharacterLook): Pix {
  const d = getData();
  let look: ArtLook | undefined;
  let side: string | undefined;
  if (typeof who === 'string') {
    look = npcLook(who);
    const t = d.trainersById.get(who);
    side = t?.side ?? d.npcsById.get(who)?.lado;
    if (!look && d.enemiesById.has(who)) {
      const sh = buildEnemySheet(who);
      const full = frameOf(sh, 'parado_0_0');
      const b = full.bounds() ?? [0, 0, full.w - 1, full.h - 1];
      const f = full.crop(b[0], b[1], b[2] - b[0] + 1, b[3] - b[1] + 1);
      const out = new Pix(64, 64);
      portraitBg(out, 'neutro');
      const sc = Math.max(1, Math.floor(56 / Math.max(f.w, f.h)));
      const big = f.scaleNearest(sc);
      out.blit(big, Math.floor((64 - big.w) / 2), 62 - big.h);
      return out;
    }
    if (!look && d.archetypesById.has(who)) {
      const a = d.archetypesById.get(who)!;
      look = { ...npcLook(a.treinador)!, outfit: { tier: 'veterano', archetypeId: who, palette: 0 } };
      side = a.margem;
    }
  } else {
    look = who;
    const arch = who.outfit.archetypeId ? d.archetypesById.get(who.outfit.archetypeId) : undefined;
    side = arch?.margem;
  }
  const out = new Pix(64, 64);
  portraitBg(out, side);
  if (!look) return out;
  const sh = buildCharacterSheet(look);
  const f = frameOf(sh, 'parado_0_0');
  // recorte de 32x32 a partir do topo do boneco (sem a sobra de cima), centrado
  const padTop = sh.frameH - 48;
  const cx = Math.floor((f.w - 32) / 2);
  const crop = f.crop(cx, Math.max(0, padTop), 32, 32);
  const big = crop.scaleNearest(2);
  out.blit(big, 0, 2);
  out.frame(0, 0, 63, 63, C.ink);
  return out;
}
