/**
 * Boneco do jogador em camadas (estilo Habbo): corpo, pele, rosto, cabelo, cor do cabelo, traje do
 * tier (outfits.json), detalhes e itens. Gera a folha com as 4 direções e todas as animações de
 * ANIMS, com cache por hash do visual. Puro: roda no Node.
 */
import { getData, hidesHair } from '@pqp/shared';
import type { ArtEntry, OutfitTier } from '@pqp/shared';
import {
  drawBareFeet,
  drawDetail,
  drawFace,
  drawHairBack,
  drawHairFront,
  drawHand,
  drawHeadSkin,
  drawLegSkin,
  drawLimb,
  drawTanLines,
  drawTattoo,
  drawTorsoSkin,
  type FaceSpec,
  FACES,
  faceWithExpression,
  HAIRS,
  type HairSpec,
  type Tone,
  tone,
} from './body';
import type { AnimName, CharacterLook } from './contract';
import { SPRITE_H, SPRITE_W } from './contract';
import { ART, type Drawer, drawHoloStage, drawSpiritBull, fallbackDrawer, type LayerCtx, PART_SLICES, type Slice } from './layers';
import { C, type Color, hashString, hex, light, Pix, shade, stableStringify, withAlpha } from './pixel';
import { type ArmPose, BODY_MEDIO, type BodySpec, makeRig, type Pose, REST_POSE, type Rig, type View } from './rig';
import { buildAnimSheet, type Dir, type SheetData } from './sheet';
import { EXTRA_ART } from './props';

export type LayerColorRef = number | 'pele' | 'cabelo' | string;

/** Camada extra (NPCs, inimigos humanos, itens): arte de ART ou EXTRA_ART, cores por índice, pele, cabelo ou #hex. */
export interface ExtraLayer {
  part: string;
  arte: string;
  cols: LayerColorRef[];
  text?: string;
  translucent?: boolean;
}

/** Visual estendido do gerador (o CharacterLook do contrato é um caso particular). */
export interface ArtLook extends CharacterLook {
  extraLayers?: ExtraLayer[];
  /** remove as camadas destas partes do traje antes das extras */
  dropParts?: string[];
  /** touro-espírito atrás, palco holográfico sob os pés */
  extras?: ('touro' | 'palco')[];
  /** paleta própria (#hex) no lugar da do traje */
  paletteHex?: string[];
  /** margem do efeito de habilidade (folhas ou faíscas) */
  fxSide?: 'esquerda' | 'direita' | 'neutro';
  /** holograma inteiro translúcido */
  hologram?: string;
}

interface ResolvedLayer {
  part: string;
  arte: string;
  cols: Color[];
  text?: string;
  trans: boolean;
  drawer: Drawer;
  wide: number;
  overflow: number;
  hides: boolean;
}

export interface ResolvedLook {
  body: BodySpec;
  skin: Tone;
  hairTone: Tone;
  hair: HairSpec;
  face: FaceSpec;
  details: string[];
  tattoo?: string;
  goldTooth: boolean;
  darkCircles: boolean;
  layers: ResolvedLayer[];
  side: 'esquerda' | 'direita' | 'neutro';
  extras: ('touro' | 'palco')[];
  gems: { part: string; color: Color }[];
  seated: boolean;
  W: number;
  H: number;
  padX: number;
  padTop: number;
  accent: Color;
  hologram?: Color;
}

// SUGESTÃO: cores da regata e da bermuda lisas do kit de criação
const KIT_TOP = hex('#d8d2c4');
const KIT_SHORTS = hex('#56677a');

const ORDER = (): string[] => getData().outfits.ordemDesenho;

let catalogCache: Map<string, ArtEntry> | undefined;
export function artCatalog(): Map<string, ArtEntry> {
  catalogCache ??= new Map(getData().outfits.artCatalog.map((a) => [a.arte, a]));
  return catalogCache;
}

const strip = (s: string, prefix: string) => (s.startsWith(prefix) ? s.slice(prefix.length) : s);

/** Acha o traje do visual. Tiers fora do piloto caem no veterano (o mais completo desenhado). */
export function findTier(look: CharacterLook): OutfitTier | undefined {
  const d = getData();
  const o = look.outfit;
  const tiers = d.outfits.tiers;
  if (o.tier === 'delta') return tiers.find((t) => t.tier === 'delta');
  if (o.tier === 'base') {
    const inst = o.institutionId ?? (o.archetypeId ? d.archetypesById.get(o.archetypeId)?.instituicao : undefined);
    return tiers.find((t) => t.tier === 'base' && t.instituicao === inst) ?? tiers.find((t) => t.tier === 'delta');
  }
  const arch = o.archetypeId;
  if (!arch) return tiers.find((t) => t.tier === 'delta');
  const want = o.tier === 'aprendiz' ? 'aprendiz' : 'veterano';
  const exact = tiers.find((t) => t.arquetipo === arch && t.tier === o.tier && t.camadas.length > 0);
  return exact ?? tiers.find((t) => t.arquetipo === arch && t.tier === want);
}

function paletteOf(look: ArtLook, tier: OutfitTier | undefined): Color[] {
  if (look.paletteHex) return look.paletteHex.map((h) => hex(h));
  const d = getData();
  const p = Math.max(0, look.outfit.palette | 0);
  if (tier?.paletas) {
    const pal = tier.paletas[Math.min(p, tier.paletas.length - 1)]!;
    return pal.cores.map((h) => hex(h));
  }
  const arch = tier?.arquetipo ?? look.outfit.archetypeId;
  const a = arch ? d.archetypesById.get(arch) : undefined;
  if (a) return a.paletasTraje[Math.min(p, a.paletasTraje.length - 1)]!.cores.map((h) => hex(h));
  return [hex('#8a8a8a'), hex('#5a5a5a'), hex('#c8c8c8'), hex('#6a4a2e'), hex('#2a2a2a'), hex('#f0f0f0')];
}

function resolveColor(ref: LayerColorRef, pal: Color[], skin: Tone, hair: Tone): Color {
  if (typeof ref === 'number') return pal[ref] ?? pal[pal.length - 1] ?? C.metal;
  if (ref === 'pele') return skin.base;
  if (ref === 'cabelo') return hair.base;
  if (ref.startsWith('#')) return hex(ref);
  return C.metal;
}

function drawerFor(arte: string, part: string): Drawer {
  return ART[arte] ?? EXTRA_ART[arte] ?? fallbackDrawer(part);
}

const RARITY_GEM: Record<string, Color | undefined> = {
  comum: undefined,
  raro: hex('#4aa3ff'),
  unico: hex('#e8a33a'),
  set: hex('#b05aff'),
};

const SLOT_PART: Record<string, string> = {
  cabeca: 'cabeca',
  peito: 'torso',
  calca: 'pernas',
  arma: 'mao_principal',
  calcado: 'pes',
  adorno: 'adorno',
};

/** Resolve o visual em camadas prontas para desenhar. */
export function resolveLook(look: ArtLook): ResolvedLook {
  const d = getData();
  const ap = d.appearance;
  const corpo = ap.corpos.find((x) => x.id === look.body || x.artKey === look.body) ?? ap.corpos.find((x) => x.id === ap.padrao.body)!;
  const pele = ap.peles.find((x) => x.id === look.skin || x.artKey === look.skin) ?? ap.peles.find((x) => x.id === ap.padrao.skin)!;
  const corte = ap.cortes.find((x) => x.id === look.hair || x.artKey === look.hair) ?? ap.cortes.find((x) => x.id === ap.padrao.hair)!;
  const corCab = ap.coresCabelo.find((x) => x.id === look.hairColor || x.artKey === look.hairColor) ?? ap.coresCabelo.find((x) => x.id === ap.padrao.hair_color)!;
  const rosto = ap.rostos.find((x) => x.id === look.face || x.artKey === look.face) ?? ap.rostos.find((x) => x.id === ap.padrao.face)!;
  const body: BodySpec = {
    ...BODY_MEDIO,
    headOffset: corpo.offsetCabecaPx,
    widthExtra: corpo.larguraExtraPx,
    buff: corpo.id === 'fortao',
    belly: corpo.id === 'barrigudo',
    thin: corpo.id === 'alto_e_magrelo',
  };
  const skin = tone(hex(pele.hex), hex(pele.hexSombra), pele.hexSecundario ? hex(pele.hexSecundario) : undefined);
  const hairTone = tone(hex(corCab.hex), hex(corCab.hexSombra));
  const hair = HAIRS[strip(corte.id, 'cabelo_')] ?? HAIRS.curtinho_social!;
  const face = FACES[strip(rosto.id, 'rosto_')] ?? FACES.tranquilo!;
  const detalhes = look.details
    .map((id) => ap.detalhes.find((x) => x.id === id || x.artKey === id))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const grupos = detalhes.map((x) => x.grupo);

  const tier = findTier(look);
  const pal = paletteOf(look, tier);
  const cat = artCatalog();
  const mk = (part: string, arte: string, refs: LayerColorRef[], text?: string, trans?: boolean): ResolvedLayer => {
    const e = cat.get(arte);
    return {
      part,
      arte,
      cols: refs.map((r) => resolveColor(r, pal, skin, hairTone)),
      text,
      trans: trans ?? e?.translucido ?? false,
      drawer: drawerFor(arte, part),
      wide: e?.larguraPx ?? 0,
      overflow: e?.overflowTopoPx ?? 0,
      hides: e ? hidesHair(e) : false,
    };
  };
  let layers: ResolvedLayer[] = (tier?.camadas ?? []).map((l) => mk(l.parte, l.arte, l.cores, l.texto));
  const extras = new Set(look.extras ?? []);
  const gems: { part: string; color: Color }[] = [];

  // itens: cada item muda a sua parte dentro do estilo da ala; a raridade aparece
  const arch = look.outfit.archetypeId;
  for (const it of look.items ?? []) {
    const part = SLOT_PART[it.slot] ?? it.slot;
    const gem = RARITY_GEM[it.rarity];
    if (gem !== undefined) gems.push({ part, color: gem });
    if (part === 'adorno') {
      if (it.rarity !== 'comum' && arch === 'peao_brabo') extras.add('touro');
      if (it.rarity === 'comum') gems.push({ part, color: hex('#c9c9c9') });
      continue;
    }
    if (it.art && cat.has(it.art)) {
      const cur = layers.find((l) => l.part === part);
      const refs: LayerColorRef[] = cur ? [] : [0, 1];
      const nl = mk(part, it.art, refs);
      if (cur) nl.cols = cur.cols;
      layers = [...layers.filter((l) => l.part !== part), nl];
      continue;
    }
    if (arch && (look.outfit.tier === 'base' || look.outfit.tier === 'aprendiz' || look.outfit.tier === 'veterano')) {
      const src = d.outfits.tiers.find((t) => t.arquetipo === arch && t.tier === (it.rarity === 'comum' ? 'aprendiz' : 'veterano'));
      const from = (src?.camadas ?? []).filter((l) => l.parte === part);
      if (from.length > 0) layers = [...layers.filter((l) => l.part !== part), ...from.map((l) => mk(l.parte, l.arte, l.cores, l.texto))];
    }
  }

  if (look.dropParts) layers = layers.filter((l) => !look.dropParts!.includes(l.part));
  for (const x of look.extraLayers ?? []) layers.push(mk(x.part, x.arte, x.cols, x.text, x.translucent));

  // ordem de desenho
  const order = ORDER();
  layers.sort((a, b) => order.indexOf(a.part) - order.indexOf(b.part));

  const wideMax = Math.max(SPRITE_W, ...layers.map((l) => l.wide));
  const overflow = Math.max(0, ...layers.map((l) => l.overflow));
  const W = wideMax + (wideMax % 2);
  const H = SPRITE_H + overflow;
  const tierArch = tier?.arquetipo ?? arch;
  const archDef = tierArch ? d.archetypesById.get(tierArch) : undefined;
  const inst = tier?.instituicao ? d.institutionsById.get(tier.instituicao) : undefined;
  const side = look.fxSide ?? ((archDef?.margem ?? inst?.margem ?? 'neutro') as ResolvedLook['side']);
  const accent = inst ? hex(inst.corDestaque.hex) : archDef ? hex(archDef.paletasTraje[0]!.cores[2]!) : hex('#e8e0c8');
  const tattooId = grupos.includes('tatuagem') ? (d.appearance.tatuagemNomesErrados[0]?.errado ?? 'MAI') : undefined;

  return {
    body,
    skin,
    hairTone,
    hair,
    face,
    details: grupos,
    tattoo: tattooId,
    goldTooth: grupos.includes('dente_de_ouro'),
    darkCircles: grupos.includes('olheira'),
    layers,
    side,
    extras: [...extras],
    gems,
    seated: layers.some((l) => l.arte === 'cadeira_escritorio'),
    W,
    H,
    padX: (W - SPRITE_W) / 2,
    padTop: overflow,
    accent,
    hologram: look.hologram ? hex(look.hologram) : undefined,
  };
}

// ---------------------------------------------------------------------------
// poses por animação

export function poseFor(anim: AnimName, i: number, view: View, seated: boolean): Pose {
  const p: Pose = { ...REST_POSE, frame: i, anim, seated };
  switch (anim) {
    case 'parado':
      p.bob = i === 1 ? 1 : 0;
      break;
    case 'andando': {
      if (seated) {
        p.bob = i % 2;
        p.armMain = 'rest';
        break;
      }
      if (view === 'side') {
        p.stride = [1, 0.5, -0.5, -1, -0.5, 0.5][i]!;
        p.liftA = i === 4 || i === 5 ? 1 : 0;
        p.liftB = i === 1 || i === 2 ? 1 : 0;
      } else {
        p.liftA = [2, 1, 0, 0, 0, 0][i]!;
        p.liftB = [0, 0, 0, 2, 1, 0][i]!;
      }
      p.bob = i === 1 || i === 4 ? -1 : 0;
      const fwd = view === 'side' ? p.stride < 0 : i >= 3;
      p.armMain = fwd ? 'swingF' : 'swingB';
      p.armOff = fwd ? 'swingB' : 'swingF';
      break;
    }
    case 'basico':
      p.armMain = (['wind', 'forward', 'rest'] as ArmPose[])[i]!;
      p.armOff = i === 1 ? 'hip' : 'rest';
      p.expression = 'briga';
      p.bob = i === 1 ? 1 : 0;
      break;
    case 'habilidade':
      p.armMain = (['wind', 'forward', 'forward', 'rest'] as ArmPose[])[i]!;
      p.armOff = (['wind', 'out', 'out', 'rest'] as ArmPose[])[i]!;
      p.glow = [0.4, 1, 0.7, 0][i]!;
      p.expression = 'briga';
      break;
    case 'especial':
      p.armMain = i < 5 ? 'up' : 'out';
      p.armOff = i < 5 ? 'up' : 'out';
      p.jump = seated ? 0 : [0, 2, 3, 2, 0, 0][i]!;
      p.aura = [0.4, 0.7, 1, 1, 0.8, 0.5][i]!;
      p.glow = 1;
      p.expression = 'briga';
      break;
    case 'vitoria':
      p.armMain = (['up', 'up', 'rest'] as ArmPose[])[i]!;
      p.armOff = (['up', 'wind', 'rest'] as ArmPose[])[i]!;
      p.jump = seated ? 0 : [0, 3, 0][i]!;
      p.expression = 'vitoria';
      break;
    case 'derrota':
      p.crouch = seated ? 0 : [3, 7, 11][i]!;
      p.headTilt = [0, 1, 2][i]!;
      p.armMain = 'down';
      p.armOff = 'down';
      p.expression = 'derrota';
      break;
  }
  return p;
}

const SLICES: Record<View, Slice[]> = {
  front: ['under', 'back', 'legs', 'torso', 'arms', 'head', 'front'],
  side: ['under', 'back', 'farArm', 'legs', 'torso', 'arms', 'head', 'front'],
  back: ['under', 'legs', 'torso', 'arms', 'head', 'back', 'front'],
};

const VIEW_OF: View[] = ['front', 'side', 'back', 'side'];

/** Efeito da habilidade nas mãos: folhas e brilho verde na Esquerda, faíscas e neon na Direita. */
function drawHandFx(pix: Pix, rig: Rig, side: ResolvedLook['side'], glow: number, frame: number, accent: Color): void {
  if (glow <= 0) return;
  const a = Math.round(120 + 120 * glow);
  for (const l of [rig.armMain, rig.armOff]) {
    const x = Math.floor(l.b.x);
    const y = Math.floor(l.b.y);
    if (side === 'esquerda') {
      pix.put(x - 2, y - 2 - (frame % 2), withAlpha(C.leaf, a));
      pix.put(x + 2, y - 3, withAlpha(hex('#9cf08a'), a));
      pix.put(x, y - 4 - (frame % 2), withAlpha(C.leafDark, a));
      pix.put(x + 1, y + 1, withAlpha(hex('#c8ffb0'), a * 0.8));
    } else if (side === 'direita') {
      pix.put(x - 2, y - 1, withAlpha(C.neonCyan, a));
      pix.put(x + 2, y - 2 - (frame % 2), withAlpha(C.pureWhite, a));
      pix.put(x, y - 3, withAlpha(C.neonPink, a));
      pix.put(x + 1 + (frame % 2), y + 1, withAlpha(C.warn, a));
    } else {
      pix.put(x - 1, y - 2, withAlpha(accent, a));
      pix.put(x + 1, y - 3, withAlpha(C.pureWhite, a));
    }
  }
}

function drawAuraRing(pix: Pix, rig: Rig, side: ResolvedLook['side'], aura: number, accent: Color): void {
  if (aura <= 0) return;
  const col = side === 'esquerda' ? hex('#7ad86a') : side === 'direita' ? C.neonCyan : accent;
  pix.ring(rig.cx, rig.groundY - 1, 9 + aura * 4, 2.5 + aura, 1, withAlpha(col, 200));
  pix.ellipse(rig.cx, rig.groundY - 1, 8 + aura * 4, 2 + aura, withAlpha(col, 60));
}

function drawGem(pix: Pix, rig: Rig, part: string, col: Color, slice: Slice): void {
  const sparkle = light(col, 0.5);
  switch (part) {
    case 'cabeca':
      if (slice === 'head') {
        pix.set(rig.cx + 3, rig.headTop + 1, col);
        pix.set(rig.cx + 4, rig.headTop, sparkle);
      }
      break;
    case 'torso':
      if (slice === 'torso' && rig.view !== 'back') {
        pix.set(rig.view === 'side' ? rig.torsoL + 1 : rig.cx + 3, rig.torsoTop + 3, col);
        pix.set(rig.view === 'side' ? rig.torsoL + 2 : rig.cx + 4, rig.torsoTop + 2, sparkle);
      }
      break;
    case 'pernas':
      if (slice === 'legs') pix.set(Math.floor(rig.legB.a.x), Math.floor((rig.legB.a.y + rig.legB.b.y) / 2), col);
      break;
    case 'pes':
      if (slice === 'legs') pix.set(rig.footB.x1, rig.footB.y0 + 1, col);
      break;
    case 'mao_principal':
      if (slice === 'front') pix.set(Math.floor(rig.armMain.b.x), Math.floor(rig.armMain.b.y) - 2, col);
      break;
    case 'adorno':
      if (slice === 'torso' && rig.view !== 'back') {
        pix.line(rig.cx - 2, rig.torsoTop, rig.cx - 1, rig.torsoTop + 3, shade(col, 0.6));
        pix.set(rig.cx - 1, rig.torsoTop + 4, col);
        pix.set(rig.cx, rig.torsoTop + 4, sparkle);
      }
      break;
  }
}

/** Desenha um quadro do boneco. */
export function drawCharacterFrame(rl: ResolvedLook, anim: AnimName, dir: Dir, i: number): Pix {
  const viewDir = anim === 'especial' ? ((dir + [0, 1, 2, 3, 0, 0][i]!) % 4) as Dir : dir;
  const view = VIEW_OF[viewDir]!;
  const pose = poseFor(anim, i, view, rl.seated);
  const rig = makeRig(view, rl.body, pose, rl.W, rl.H, rl.padX, rl.padTop);
  const B = new Pix(rl.W, rl.H);
  const TB = new Pix(rl.W, rl.H);
  const TF = new Pix(rl.W, rl.H);

  const hasPart = (p: string) => rl.layers.some((l) => l.part === p);
  const hairHidden = rl.layers.some((l) => l.hides);
  const face = faceWithExpression(rl.face, pose.expression);
  const serviceSmile = rl.layers.some((l) => l.arte === 'sorriso_atendimento');
  const finalFace: FaceSpec = serviceSmile ? { ...face, mouth: 'service' } : face;

  for (const slice of SLICES[view]) {
    // corpo do kit na fatia
    switch (slice) {
      case 'under':
        if (rl.extras.includes('palco')) drawHoloStage(TB, rig, i, rl.layers.find((l) => l.part === 'torso')?.cols[1] ?? C.neonCyan);
        if (rl.extras.includes('touro')) drawSpiritBull(TB, rig, i);
        drawAuraRing(TB, rig, rl.side, pose.aura, rl.accent);
        break;
      case 'back':
        if (view !== 'back' && !hairHidden) drawHairBack(B, rig, rl.hair, rl.hairTone);
        break;
      case 'farArm':
        drawLimb(B, rig.armOff, rl.skin, true);
        drawHand(B, rig.armOff, rl.skin, true);
        break;
      case 'legs':
        drawLegSkin(B, rig, rl.skin);
        if (!hasPart('pernas')) drawKitShorts(B, rig);
        if (!hasPart('pes')) drawBareFeet(B, rig, rl.skin);
        break;
      case 'torso':
        drawTorsoSkin(B, rig, rl.skin);
        if (!hasPart('torso')) drawKitTop(B, rig);
        break;
      case 'arms':
        if (view === 'side') {
          drawLimb(B, rig.armMain, rl.skin);
          drawHand(B, rig.armMain, rl.skin);
        } else {
          drawLimb(B, rig.armMain, rl.skin);
          drawLimb(B, rig.armOff, rl.skin);
          drawHand(B, rig.armMain, rl.skin);
          drawHand(B, rig.armOff, rl.skin);
        }
        drawTanLines(B, rig, rl.skin);
        if (rl.tattoo) drawTattoo(B, rig, rl.tattoo);
        break;
      case 'head': {
        drawHeadSkin(B, rig, rl.skin);
        drawFace(B, rig, finalFace, rl.skin, { browColor: rl.hair.none ? rl.skin.shade : rl.hairTone.shade, goldTooth: rl.goldTooth, darkCircles: rl.darkCircles });
        if (!hairHidden) drawHairFront(B, rig, rl.hair, rl.hairTone, rl.skin);
        for (const g of rl.details) drawDetail(B, rig, g, rl.hairTone, rl.skin);
        break;
      }
      case 'front':
        break;
    }
    // camadas do traje
    for (const l of rl.layers) {
      const slices = PART_SLICES[l.part] ?? [];
      if (!slices.includes(slice)) continue;
      const target = l.trans ? (slice === 'under' || slice === 'back' || slice === 'farArm' ? TB : TF) : B;
      const ctx: LayerCtx = {
        pix: target,
        rig,
        cols: l.cols.length > 0 ? l.cols : [C.metal],
        text: l.text,
        skin: rl.skin,
        hair: rl.hairTone,
        slice,
        frame: i,
        anim,
        side: rl.side,
        wide: l.wide,
      };
      l.drawer(ctx);
    }
    if (slice === 'back' && view === 'back' && rl.hair.coversBack && !hairHidden) drawHairFront(B, rig, rl.hair, rl.hairTone, rl.skin);
    for (const g of rl.gems) drawGem(B, rig, g.part, g.color, slice);
    if (slice === 'front') drawHandFx(TF, rig, rl.side, pose.glow, i, rl.accent);
  }

  B.outline();
  const out = new Pix(rl.W, rl.H);
  out.blit(TB, 0, 0);
  if (rl.hologram !== undefined) {
    // holograma: o boneco inteiro translúcido e tingido, com linhas de varredura
    out.blit(B, 0, 0, { alpha: 0.62, tint: rl.hologram });
    for (let y = (i % 2); y < rl.H; y += 3) for (let x = 0; x < rl.W; x++) if (B.alphaAt(x, y) > 0) out.put(x, y, withAlpha(light(rl.hologram, 0.4), 90));
  } else out.blit(B, 0, 0);
  out.blit(TF, 0, 0);
  return viewDir === 3 ? out.flipX() : out;
}

function drawKitTop(pix: Pix, rig: Rig): void {
  // regata lisa do kit de criação
  for (let y = rig.torsoTop + 1; y <= rig.torsoBot - 1; y++) {
    let [l, r] = [rig.torsoL, rig.torsoR];
    if (y <= rig.torsoTop + 2 && rig.view === 'front') {
      l += 2;
      r -= 2;
    }
    for (let x = l; x <= r; x++) pix.put(x, y, x === r ? hex('#b0aa9c') : KIT_TOP);
  }
}

function drawKitShorts(pix: Pix, rig: Rig): void {
  for (let y = rig.waistY; y <= rig.torsoBot; y++) pix.hline(rig.torsoL, rig.torsoR, y, KIT_SHORTS);
  for (const l of rig.view === 'side' ? [rig.legA, rig.legB] : [rig.legA, rig.legB]) {
    pix.capsule(l.a.x, l.a.y, l.a.x + (l.b.x - l.a.x) * 0.45, l.a.y + (l.b.y - l.a.y) * 0.45, l.w + 0.5, KIT_SHORTS, hex('#3e4b5a'));
  }
}

// ---------------------------------------------------------------------------
// folha

const sheetCache = new Map<string, SheetData>();

/** Chave da textura de um visual: hash estável do JSON. */
export function lookKey(look: ArtLook, prefix = 'char'): string {
  return `${prefix}_${hashString(stableStringify(look))}`;
}

/** Folha completa do boneco (4 direções x todas as animações), com cache por hash. */
export function buildCharacterSheet(look: ArtLook, key = lookKey(look)): SheetData {
  const hit = sheetCache.get(key);
  if (hit) return hit;
  const rl = resolveLook(look);
  const sheet = buildAnimSheet(key, rl.W, rl.H, (anim, dir, i) => drawCharacterFrame(rl, anim, dir, i));
  sheetCache.set(key, sheet);
  return sheet;
}

/** Limpa o cache puro (testes). */
export function clearCharacterCache(): void {
  sheetCache.clear();
}

/** Visual padrão do Delta (appearance.padrao). */
export function defaultLook(): CharacterLook {
  const p = getData().appearance.padrao;
  return {
    body: p.body,
    skin: p.skin,
    face: p.face,
    hair: p.hair,
    hairColor: p.hair_color,
    details: [...p.details],
    outfit: { tier: 'delta', palette: Math.max(0, getData().appearance.roupaInicial.cores.indexOf(p.palette)) },
  };
}

/** Visual de um arquétipo num tier, com o resto do padrão. */
export function archetypeLook(archetypeId: string, tier: CharacterLook['outfit']['tier'], palette = 0, base: Partial<CharacterLook> = {}): CharacterLook {
  const d = getData();
  const a = d.archetypesById.get(archetypeId);
  return {
    ...defaultLook(),
    ...base,
    outfit: { tier, archetypeId, institutionId: a?.instituicao, palette },
  };
}
