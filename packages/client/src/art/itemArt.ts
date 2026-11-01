/**
 * Itens no boneco por ala e ícones de item para o inventário (Fase 5).
 *
 * Regra (items.json, regras.resolucaoVisual): a arte de um item é
 * `visualPorArquetipo[ala].slots[slot].chaveArte + '_' + sufixo da raridade`. O item muda só a parte
 * dele (cabeça, peito, calça, arma, calçado, adorno) dentro do estilo da ala: o comum usa a peça
 * do traje de aprendiz da ala e o raro a do veterano (character.ts, resolveLook). A raridade aparece
 * no boneco como contorno colorido em volta da peça e um brilho que anda (character.ts) e, no ícone,
 * pela moldura e pelo halo na cor da raridade.
 *
 * SUGESTÃO: o pedido da fase fala em "mãos", "pés" e "acessório"; os 6 slots do piloto são os de
 * items.json (cabeça, peito, calça, arma, calçado, adorno) e o adorno não tem camada própria no
 * traje: aparece como pingente (o da Esquerda de madeira, o da Direita um chip com neon).
 */
import { getData } from '@pqp/shared';
import { archetypeLook, defaultLook, poseFor, resolveLook, VIEW_SLICES } from './character';
import type { CharacterLook } from './contract';
import { type LayerCtx, PART_SLICES } from './layers';
import { C, type Color, hex, light, mix, Pix, shade, shadeDiff, withAlpha } from './pixel';
import { makeRig, type View } from './rig';

export type ItemRarity = 'comum' | 'raro' | 'unico' | 'set';

/** Slot do item -> parte do boneco (layers.ts / outfits.json). */
export const ITEM_SLOT_PART: Record<string, string> = {
  cabeca: 'cabeca',
  peito: 'torso',
  calca: 'pernas',
  arma: 'mao_principal',
  calcado: 'pes',
  adorno: 'adorno',
};

/** Cor da raridade (items.json, raridades[].cor). */
export function rarityColor(r: string): Color {
  const def = getData().items.raridades.find((x) => x.id === r);
  return hex(def?.cor ?? '#c9c9c9');
}

interface AnyItem {
  id: string;
  slot: string;
  rarity: ItemRarity;
  classLock: string | null;
  margem: 'esquerda' | 'direita' | null;
  visualPorArquetipo?: Partial<Record<string, string>>;
  chaveArte?: string;
}

function findItem(itemId: string): AnyItem | undefined {
  const d = getData();
  const it = d.itemsById.get(itemId);
  if (it) return { id: it.id, slot: it.slot, rarity: it.rarity, classLock: it.classLock, margem: it.margem, visualPorArquetipo: it.visualPorArquetipo as Partial<Record<string, string>> | undefined };
  const u = d.uniquesById.get(itemId);
  if (u) return { id: u.id, slot: u.slot, rarity: 'unico', classLock: u.classLock, margem: null, chaveArte: u.visualProprio.chaveArte };
  return undefined;
}

/**
 * Ala que mostra o item quando ninguém o veste (ícone da loja, saque no chão): a primeira ala da
 * classe e da margem do item; sem classe, a primeira da margem. Item do Delta não tem ala.
 */
export function itemArchetype(itemId: string, wearerArchetype?: string): string | undefined {
  if (wearerArchetype && getData().archetypesById.has(wearerArchetype)) return wearerArchetype;
  const it = findItem(itemId);
  if (!it) return undefined;
  const arcs = getData().archetypes;
  const byClass = arcs.find((a) => a.classe === it.classLock && (it.margem === null || a.margem === it.margem));
  if (byClass) return byClass.id;
  if (it.margem) return arcs.find((a) => a.margem === it.margem)?.id;
  return undefined;
}

/** Chave de arte do item na ala (regras.resolucaoVisual). Único usa a arte própria. */
export function itemArtKey(itemId: string, archetypeId?: string): string | undefined {
  const it = findItem(itemId);
  if (!it) return undefined;
  if (it.chaveArte) return it.chaveArte;
  const arch = itemArchetype(itemId, archetypeId);
  const d = getData();
  const suf = d.items.raridades.find((r) => r.id === it.rarity)?.sufixoArte ?? it.rarity;
  if (!arch) return `delta_${it.slot}_${suf}`;
  const own = it.visualPorArquetipo?.[arch];
  if (own) return own;
  const slots = (d.items.visualPorArquetipo as Record<string, { slots: unknown } | undefined>)[arch]?.slots as Record<string, { chaveArte: string } | undefined> | undefined;
  const base = slots?.[it.slot]?.chaveArte;
  return base ? `${base}_${suf}` : undefined;
}

/** Itens equipados (slot -> id) para o CharacterLook.items, com a chave de arte da ala. */
export function lookItemsFor(equipment: Record<string, string> | string[], archetypeId?: string): NonNullable<CharacterLook['items']> {
  const ids = Array.isArray(equipment) ? equipment : Object.values(equipment);
  const out: NonNullable<CharacterLook['items']> = [];
  for (const id of ids) {
    const it = findItem(id);
    if (!it) continue;
    const art = itemArtKey(id, archetypeId);
    out.push(art ? { slot: it.slot, rarity: it.rarity, art } : { slot: it.slot, rarity: it.rarity });
  }
  return out;
}

/** Descrição do visual do item na ala (texto de items.json: comum ou raro). */
export function itemVisualText(itemId: string, archetypeId?: string): string | undefined {
  const it = findItem(itemId);
  const arch = itemArchetype(itemId, archetypeId);
  if (!it || !arch) return undefined;
  const sv = ((getData().items.visualPorArquetipo as Record<string, { slots: unknown } | undefined>)[arch]?.slots as Record<string, { comum: string; raro: string } | undefined> | undefined)?.[it.slot];
  if (!sv) return undefined;
  return it.rarity === 'comum' ? sv.comum : sv.raro;
}

// ---------------------------------------------------------------------------
// a camada sozinha

/**
 * Desenha só a peça do slot no estilo da ala (sem corpo), de frente (arma de lado). Devolve null se
 * a ala não tem peça nesse slot (o adorno nunca tem).
 */
export function itemLayerPix(archetypeId: string | undefined, slot: string, rarity: ItemRarity, palette = 0): Pix | null {
  const part = ITEM_SLOT_PART[slot] ?? slot;
  if (part === 'adorno') return null;
  // a peça do tier da raridade; sem ela, a do outro tier da ala e depois a do uniforme da instituição
  const want = rarity === 'comum' ? 'aprendiz' : 'veterano';
  const tiers: CharacterLook['outfit']['tier'][] = archetypeId ? [want, want === 'aprendiz' ? 'veterano' : 'aprendiz', 'base'] : ['delta'];
  for (const tier of tiers) {
    const look: CharacterLook = archetypeId ? archetypeLook(archetypeId, tier, palette) : defaultLook();
    const rl = resolveLook(look);
    for (const pp of SLOT_PART_ALT[slot] ?? [part]) {
      const p = drawLayersAlone(rl, rl.layers.filter((l) => l.part === pp), pp);
      if (p) {
        if (rarity !== 'comum') rareTrim(p, rl.side, rarity);
        return p;
      }
    }
  }
  return null;
}

/**
 * "Raro ganha detalhe" (items.json): barra de baixo da peça bordada (Esquerda) ou com LED (Direita)
 * e a pedrinha da raridade no meio. SUGESTÃO: o desenho do detalhe não está nos docs.
 */
function rareTrim(p: Pix, side: string, rarity: ItemRarity): void {
  const trim = side === 'direita' ? C.neonCyan : side === 'esquerda' ? hex('#e8c060') : hex('#e8e0c8');
  const b = p.bounds(200);
  if (!b) return;
  for (let x = b[0]; x <= b[2]; x++) {
    let y = b[3];
    while (y >= b[1] && p.alphaAt(x, y) < 200) y--;
    if (y < b[1]) continue;
    p.set(x, y, (x & 1) === 0 ? trim : light(trim, 0.45));
  }
  const g = rarityColor(rarity);
  const cx = Math.floor((b[0] + b[2]) / 2);
  const cy = Math.floor((b[1] + b[3]) / 2);
  if (p.alphaAt(cx, cy) >= 200) {
    p.set(cx, cy, g);
    p.set(cx + 1, cy - 1, light(g, 0.6));
  }
}

/** Partes que servem de peça para cada slot, na ordem (a calça do Sumô é o mawashi da cintura). */
const SLOT_PART_ALT: Record<string, string[]> = {
  cabeca: ['cabeca', 'rosto'],
  // v0.3: a armadura leva a calça junto (a calça do Sumô é o mawashi da cintura)
  peito: ['torso', 'pernas', 'cintura'],
  arma: ['mao_principal', 'mao_secundaria'],
  calcado: ['pes'],
};

function drawLayersAlone(rl: ReturnType<typeof resolveLook>, layers: ReturnType<typeof resolveLook>['layers'], part: string): Pix | null {
  if (layers.length === 0) return null;
  const view: View = part === 'mao_principal' ? 'side' : 'front';
  const rig = makeRig(view, rl.body, poseFor('parado', 0, view, false), rl.W, rl.H, rl.padX, rl.padTop);
  const p = new Pix(rl.W, rl.H);
  for (const slice of VIEW_SLICES[view]) {
    for (const l of layers) {
      if (!(PART_SLICES[l.part] ?? []).includes(slice)) continue;
      const ctx: LayerCtx = { pix: p, rig, cols: l.cols.length > 0 ? l.cols : [C.metal], text: l.text, skin: rl.skin, hair: rl.hairTone, slice, frame: 0, anim: 'parado', side: rl.side, wide: l.wide };
      const before = p.clone();
      l.drawer(ctx);
      shadeDiff(p, before);
    }
  }
  if (p.countOpaque(200) < 4) return null;
  return p;
}

/** Pingente do adorno: madeira e folha na Esquerda, chip e neon na Direita, arruela de ferro no Delta. */
function amulet(side: 'esquerda' | 'direita' | null, rarity: ItemRarity): Pix {
  const p = new Pix(24, 28);
  const cord = side === 'direita' ? hex('#3a3e46') : hex('#8a6a3a');
  p.line(4, 0, 12, 12, cord);
  p.line(20, 0, 12, 12, cord);
  if (side === 'esquerda') {
    p.disk(12, 18, 7, hex('#8a5a32'));
    p.ring(12, 18, 7, 7, 1, hex('#5a3a20'));
    p.ellipse(12, 18, 3, 4.5, hex('#5ec04a'));
    p.vline(12, 15, 21, hex('#2e6e2a'));
  } else if (side === 'direita') {
    p.box(5, 12, 18, 25, hex('#22242c'));
    p.frame(5, 12, 18, 25, hex('#555a62'));
    for (let y = 14; y < 24; y += 3) p.hline(7, 16, y, withAlpha(C.neonCyan, 220));
    p.box(10, 16, 13, 20, C.neonPink);
  } else {
    p.ring(12, 18, 6, 6, 3, hex('#8e949c'));
  }
  if (rarity !== 'comum') {
    const g = rarityColor(rarity);
    p.disk(12, 18, 1.8, g);
    p.set(11, 17, light(g, 0.6));
  }
  shadeDiff(p, null, 0.8);
  return p;
}

/**
 * Peça genérica para o slot quando a ala não tem camada nele (o mawashi não é calça, o chapéu do
 * Druida é o cabelo...). SUGESTÃO: desenho simples na paleta da ala, madeira e pano na Esquerda,
 * metal e neon na Direita; o raro ganha a faixa bordada (Esquerda) ou a linha de LED (Direita).
 */
function genericPiece(slot: string, cls: string | null, side: 'esquerda' | 'direita' | null, archetypeId: string | undefined, rarity: ItemRarity): Pix {
  const arch = archetypeId ? getData().archetypesById.get(archetypeId) : undefined;
  const pal = arch?.paletasTraje[0]?.cores.map((h) => hex(h)) ?? [hex('#8a8a8a'), hex('#5a5a5a'), hex('#c8c8c8')];
  const a = pal[0]!;
  const b = pal[1] ?? shade(a, 0.7);
  const trim = side === 'direita' ? C.neonCyan : side === 'esquerda' ? hex('#c8a060') : hex('#e8e0c8');
  const p = new Pix(24, 24);
  switch (slot) {
    case 'cabeca':
      if (side === 'direita') {
        p.ellipse(12, 13, 8, 7, a);
        p.box(4, 13, 19, 16, b);
        p.hline(6, 17, 14, withAlpha(trim, 230));
      } else {
        p.ellipse(12, 16, 11, 3, side === 'esquerda' ? hex('#d8b860') : a);
        p.ellipse(12, 12, 6, 5, side === 'esquerda' ? hex('#c8a048') : a);
        p.hline(6, 17, 14, b);
      }
      break;
    case 'peito':
      p.poly([[5, 4], [19, 4], [22, 10], [19, 11], [18, 21], [6, 21], [5, 11], [2, 10]], a);
      p.poly([[9, 4], [15, 4], [12, 9]], b);
      break;
    case 'calca':
      p.box(6, 3, 17, 7, b);
      p.box(6, 7, 11, 21, a);
      p.box(13, 7, 17, 21, a);
      break;
    case 'calcado':
      for (const x of [3, 13]) {
        p.box(x + 1, 6, x + 5, 15, a);
        p.box(x, 15, x + 8, 19, a);
        p.hline(x, x + 8, 19, b);
      }
      break;
    default: {
      // arma pela classe
      const wood = hex('#8a5a32');
      const steel = hex('#8e949c');
      const main = side === 'direita' ? steel : wood;
      if (cls === 'atirador') {
        if (side === 'direita') {
          p.box(4, 8, 19, 12, steel);
          p.box(5, 12, 9, 19, hex('#3a3e46'));
          p.hline(10, 18, 9, withAlpha(trim, 230));
        } else {
          p.line(6, 20, 12, 12, wood);
          p.line(12, 12, 7, 4, wood);
          p.line(12, 12, 18, 4, wood);
          p.line(7, 4, 18, 4, withAlpha(hex('#e8e0c8'), 200));
        }
      } else if (cls === 'elemental') {
        p.capsule(6, 21, 16, 5, 2.6, main);
        if (side === 'direita') p.ring(17, 4, 3, 3, 1, trim);
        else p.ellipse(17, 4, 3, 2, hex('#5ec04a'));
      } else if (cls === 'mascarado') {
        p.capsule(12, 22, 12, 12, 2, main);
        if (side === 'direita') p.ellipse(12, 8, 4, 5, hex('#2a2a30'));
        else {
          p.ellipse(12, 8, 7, 5, a);
          p.set(9, 7, C.ink);
          p.set(15, 7, C.ink);
        }
      } else {
        p.capsule(6, 20, 17, 5, side === 'direita' ? 3 : 4, main);
        if (side === 'direita') p.hline(9, 15, 12, withAlpha(trim, 230));
      }
    }
  }
  if (rarity !== 'comum') {
    const g = rarityColor(rarity);
    const bb = p.bounds(200);
    if (bb) {
      const y = Math.floor((bb[1] + bb[3]) / 2);
      for (let x = bb[0]; x <= bb[2]; x++) if (p.alphaAt(x, y) >= 200) p.set(x, y, (x & 1) === 0 ? trim : light(trim, 0.4));
      p.disk((bb[0] + bb[2]) / 2 + 0.5, y + 0.5, 1.6, g);
    }
  }
  shadeDiff(p, null, 0.8);
  return p;
}

// ---------------------------------------------------------------------------
// ícone 48x48

const ICON = 48;

function iconBg(p: Pix, side: 'esquerda' | 'direita' | null, rarity: ItemRarity): void {
  const top = side === 'esquerda' ? hex('#3a4a2a') : side === 'direita' ? hex('#20242e') : hex('#3a3a42');
  for (let y = 0; y < ICON; y++) p.hline(0, ICON - 1, y, mix(light(top, 0.12), shade(top, 0.7), y / ICON));
  // grade neon na Direita, fibra de palha na Esquerda
  if (side === 'direita') for (let k = 4; k < ICON; k += 8) {
    p.hline(3, ICON - 4, k, withAlpha(C.neonCyan, 26));
    p.vline(k, 3, ICON - 4, withAlpha(C.neonCyan, 26));
  } else if (side === 'esquerda') for (let k = 0; k < ICON * 2; k += 6) p.line(k, 3, k - 40, ICON - 4, withAlpha(hex('#c8b070'), 22));
  const rc = rarityColor(rarity);
  const frame = rarity === 'comum' ? hex('#6a6a72') : rc;
  p.frame(0, 0, ICON - 1, ICON - 1, shade(frame, 0.55));
  p.frame(1, 1, ICON - 2, ICON - 2, frame);
  p.frame(2, 2, ICON - 3, ICON - 3, rarity === 'comum' ? shade(frame, 0.8) : light(frame, 0.35));
  for (const [x, y] of [
    [0, 0],
    [ICON - 1, 0],
    [0, ICON - 1],
    [ICON - 1, ICON - 1],
  ] as const)
    p.set(x, y, 0);
  if (rarity !== 'comum') {
    // cantos brilhando
    for (const [x, y] of [
      [3, 3],
      [ICON - 4, 3],
      [3, ICON - 4],
      [ICON - 4, ICON - 4],
    ] as const)
      p.set(x, y, light(rc, 0.7));
  }
}

/** Ícone 48x48 do item para o inventário: a peça na ala, moldura e halo pela raridade (puro). */
export function buildItemIcon(itemId: string, archetypeId?: string): Pix {
  const it = findItem(itemId);
  const p = new Pix(ICON, ICON);
  if (!it) {
    iconBg(p, null, 'comum');
    return p;
  }
  const arch = itemArchetype(itemId, archetypeId);
  const side = arch ? (getData().archetypesById.get(arch)?.margem as 'esquerda' | 'direita' | undefined) ?? it.margem : it.margem;
  iconBg(p, side ?? null, it.rarity);
  let art = itemLayerPix(arch, it.slot, it.rarity);
  if (!art) art = it.slot === 'adorno' ? amulet(side ?? null, it.rarity) : genericPiece(it.slot, it.classLock, side ?? null, arch, it.rarity);
  const b = art.bounds(100);
  if (!b) return p;
  const crop = art.crop(b[0], b[1], b[2] - b[0] + 1, b[3] - b[1] + 1);
  const s = Math.max(1, Math.min(3, Math.floor(Math.min(34 / crop.w, 34 / crop.h))));
  const big = crop.scaleNearest(s);
  const layer = new Pix(ICON, ICON);
  layer.blit(big, Math.floor((ICON - big.w) / 2), Math.floor((ICON - big.h) / 2));
  layer.outline({ color: hex('#140c16'), minAlpha: 100 });
  if (it.rarity !== 'comum') {
    // halo: duas bordas na cor da raridade, a de fora mais fraca
    const rc = rarityColor(it.rarity);
    layer.outline({ color: withAlpha(rc, 230), minAlpha: 100 });
    layer.outline({ color: withAlpha(rc, 90), minAlpha: 100 });
  }
  p.blit(layer, 0, 0);
  // classe no canto (bolinha da cor da classe), como nos ícones de habilidade
  if (it.classLock) {
    const CLS: Record<string, string> = { combatente: '#d8543a', atirador: '#e0a82a', elemental: '#3a96d8', mascarado: '#9a5ad8' };
    p.disk(40, 40, 4, hex('#140c16'));
    p.disk(40, 40, 3, hex(CLS[it.classLock] ?? '#8a8a8a'));
  }
  return p;
}
