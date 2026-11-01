/**
 * Gerador de pixel art do cliente (lado Phaser). Os desenhos saem dos módulos puros
 * (character, creatures, tiles, fx, icons) como buffers de pixels; aqui eles viram CanvasTexture
 * com quadros nomeados e animações. Cada folha é gerada uma vez (cache por hash do visual).
 *
 * Use com `pixelArt: true` (ou `roundPixels` e filtro NEAREST) na config do jogo.
 */
// o build ESM do Phaser 3.90 não tem export default: importar o namespace
import * as Phaser from 'phaser';
import { getData } from '@pqp/shared';
import { type ArtLook, buildCharacterSheet, defaultLook, lookKey } from './character';
import { ANIMS, type AnimName, type ArtApi, type CharacterLook } from './contract';
import { buildEnemySheet, buildSummonSheet } from './creatures';
import { buildFontPix, buildFx, FONT_CELL_H, FONT_CELL_W, FONT_KEY, FONT_PER_ROW, type FxInfo } from './fx';
import { FONT_CHARS } from './font';
import { buildEmblem, buildIcon, buildPortrait } from './icons';
import { buildPropSheet, PROP_KEY } from './landmarks';
import { npcLook } from './npcs';
import { hashString, type Pix, stableStringify } from './pixel';
import { drawPending, isPendingSheet, pendingProgress, type SheetData, TOTAL_FRAMES_PER_DIR, withDeferredDraw } from './sheet';
import { buildTileset, TILE_KEY } from './tiles';
import { buildFurniture, buildFurnitureSheet, FURNITURE_KEY, furnitureInfo } from './furniture';
import { buildInterior, INTERIOR_FRONT, INTERIOR_SIDE, INTERIOR_WALL_H, interiorStyleFor, interiorTiles } from './interiors';

export type { ArtApi, CharacterLook } from './contract';
export { ANIMS, SPRITE_H, SPRITE_W, TILE_PX } from './contract';
export { ANIMATED_TILES, TILE_ANIM_MS, TILE_KEY, TILE_VARIANTS, tileFrame, treeFrame } from './tiles';
export { coneKeyFor, CONE_ANGLES, FONT_KEY, FX_KEYS, shadowFrameFor } from './fx';
export type { FxInfo } from './fx';
export { facadeFrame, propForDeco, propFrame, propIsFlat, PROP_KEY, PROPS } from './landmarks';
export { defaultLook, archetypeLook } from './character';
export type { ArtLook } from './character';
export type { FurnitureArt, InteriorArt } from './contract';
export { FURNITURE_KEY, furnitureByStyle, furnitureFootprint, furnitureFrame, furnitureInfo, furnitureRot, furnitureRots } from './furniture';
export { INTERIOR_FRONT, INTERIOR_SIDE, INTERIOR_WALL_H, interiorStyleFor, interiorTiles } from './interiors';
export type { InteriorStyle } from './interiors';
export { UI_ICON_IDS } from './uiIcons';
export type { UiIconId } from './uiIcons';

/** Metadados de uma textura gerada (tamanho do quadro e origem sugerida). */
export interface SheetMeta {
  key: string;
  frameW: number;
  frameH: number;
  originX: number;
  originY: number;
  anims?: Partial<Record<AnimName, number>>;
  fx?: FxInfo;
}

/** Quadros por segundo e repetição de cada animação de boneco. SUGESTÃO: os fps não estão nos docs. */
export const ANIM_FPS: Record<AnimName, { fps: number; loop: boolean }> = {
  parado: { fps: 2, loop: true },
  andando: { fps: 10, loop: true },
  basico: { fps: 12, loop: false },
  habilidade: { fps: 10, loop: false },
  especial: { fps: 10, loop: false },
  vitoria: { fps: 6, loop: false },
  derrota: { fps: 6, loop: false },
};

const metas = new Map<string, SheetMeta>();

/** Metadados de uma textura criada por este gerador (undefined se não for daqui). */
export function sheetMeta(key: string): SheetMeta | undefined {
  return metas.get(key);
}

function upload(scene: Phaser.Scene, key: string, pix: Pix, frames: SheetData['frames'] = [], smooth = false): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, pix.w, pix.h);
  if (!tex) return;
  const ctx = tex.getContext();
  const data = new Uint8ClampedArray(pix.data.length);
  data.set(pix.data);
  ctx.putImageData(new ImageData(data, pix.w, pix.h), 0, 0);
  for (const f of frames) tex.add(f.name, 0, f.x, f.y, f.w, f.h);
  tex.refresh();
  tex.setFilter(smooth ? Phaser.Textures.FilterMode.LINEAR : Phaser.Textures.FilterMode.NEAREST);
}

/** Sobe um buffer puro como textura de canvas (blocos de terreno, vinheta). `smooth` = filtro linear. */
export function uploadPix(scene: Phaser.Scene, key: string, pix: Pix, smooth = false): void {
  upload(scene, key, pix, [], smooth);
}

function uploadSheet(scene: Phaser.Scene, sheet: SheetData, extra: Partial<SheetMeta> = {}): string {
  upload(scene, sheet.key, sheet.pix, sheet.frames);
  if (!metas.has(sheet.key))
    metas.set(sheet.key, { key: sheet.key, frameW: sheet.frameW, frameH: sheet.frameH, originX: sheet.originX, originY: sheet.originY, anims: sheet.anims, ...extra });
  return sheet.key;
}

// ---------------------------------------------------------------------------
// geração sob demanda (Fase 3): a folha nasce na hora com a silhueta de espera, com os mesmos
// quadros e animações, e os quadros de verdade são desenhados em fatias de tempo por quadro do
// jogo. Quando a folha fica pronta, o mesmo canvas é redesenhado: sprites e animações continuam
// valendo, sem trocar de textura.

/** SUGESTÃO: 6 ms por quadro do jogo para desenhar bonecos (sobra folga para os 60 fps). */
export const ART_BUDGET_MS = 6;
/** SUGESTÃO: sobe a parte pronta quando parado e andando (os 32 primeiros quadros) ficam prontos. */
const EARLY_UPLOAD_FRAMES = 32;

interface SheetJob {
  key: string;
  pix: Pix;
  early: boolean;
}

const jobs: SheetJob[] = [];
const jobKeys = new Set<string>();
const readyCbs = new Map<string, (() => void)[]>();
const hookedGames = new WeakSet<object>();
let pumpGame: Phaser.Game | undefined;

/** Folhas ainda na fila de desenho. */
export function pendingSheets(): number {
  return jobs.length;
}

/** A folha desta chave já está desenhada de verdade (não é mais a silhueta)? */
export function sheetReady(key: string): boolean {
  return !jobKeys.has(key);
}

/** Chama `cb` quando a folha ficar pronta (na hora, se já está). */
export function whenSheetReady(key: string, cb: () => void): void {
  if (!jobKeys.has(key)) return cb();
  let l = readyCbs.get(key);
  if (!l) readyCbs.set(key, (l = []));
  l.push(cb);
}

function refreshCanvas(game: Phaser.Game, key: string, pix: Pix): void {
  const tex = game.textures.get(key) as Phaser.Textures.CanvasTexture | undefined;
  if (!tex || typeof (tex as Partial<Phaser.Textures.CanvasTexture>).getContext !== 'function') return;
  const data = new Uint8ClampedArray(pix.data.length);
  data.set(pix.data);
  tex.getContext().putImageData(new ImageData(data, pix.w, pix.h), 0, 0);
  tex.refresh();
}

/** Desenha folhas pendentes até o orçamento do quadro (a mais recente primeiro). */
export function pumpSheets(game: Phaser.Game | undefined = pumpGame, budgetMs = ART_BUDGET_MS): void {
  if (!game || jobs.length === 0) return;
  const now = () => performance.now();
  const deadline = now() + budgetMs;
  while (jobs.length > 0 && now() < deadline) {
    const job = jobs[jobs.length - 1]!;
    const done = drawPending(job.pix, deadline, now);
    if (!done) {
      if (!job.early && pendingProgress(job.pix) * TOTAL_FRAMES_PER_DIR * 4 >= EARLY_UPLOAD_FRAMES) {
        job.early = true;
        refreshCanvas(game, job.key, job.pix);
      }
      break;
    }
    jobs.pop();
    jobKeys.delete(job.key);
    refreshCanvas(game, job.key, job.pix);
    const cbs = readyCbs.get(job.key);
    readyCbs.delete(job.key);
    for (const cb of cbs ?? []) {
      try {
        cb();
      } catch {
        // quem pediu saiu de cena
      }
    }
  }
}

function hookPump(scene: Phaser.Scene): void {
  const game = scene.game as Phaser.Game | undefined;
  if (!game || hookedGames.has(game)) return;
  hookedGames.add(game);
  pumpGame = game;
  game.events.on(Phaser.Core.Events.POST_STEP, () => pumpSheets(game));
}

/** Sobe a casca (silhueta) e põe o desenho na fila; folha já pronta sobe direto. */
function uploadDeferred(scene: Phaser.Scene, sheet: SheetData): string {
  const fresh = !scene.textures.exists(sheet.key);
  uploadSheet(scene, sheet);
  if (fresh && isPendingSheet(sheet.pix) && !jobKeys.has(sheet.key)) {
    hookPump(scene);
    jobs.push({ key: sheet.key, pix: sheet.pix, early: false });
    jobKeys.add(sheet.key);
  }
  return sheet.key;
}

function registerAnims(scene: Phaser.Scene, sheetKey: string): void {
  const meta = metas.get(sheetKey);
  if (!meta) return;
  if (meta.fx) {
    const k = `${sheetKey}:play:0`;
    if (meta.fx.fps > 0 && !scene.anims.exists(k))
      scene.anims.create({
        key: k,
        frames: Array.from({ length: meta.fx.frames }, (_, i) => ({ key: sheetKey, frame: String(i) })),
        frameRate: meta.fx.fps,
        repeat: meta.fx.loop ? -1 : 0,
      });
    return;
  }
  if (!meta.anims) return;
  for (const anim of Object.keys(ANIMS) as AnimName[]) {
    const n = meta.anims[anim] ?? 0;
    for (let dir = 0; dir < 4; dir++) {
      const k = `${sheetKey}:${anim}:${dir}`;
      if (scene.anims.exists(k) || n === 0) continue;
      scene.anims.create({
        key: k,
        frames: Array.from({ length: n }, (_, i) => ({ key: sheetKey, frame: `${anim}_${dir}_${i}` })),
        frameRate: ANIM_FPS[anim].fps,
        repeat: ANIM_FPS[anim].loop ? -1 : 0,
      });
    }
  }
}

/** Sobe (uma vez) a folha dos props e fachadas das margens (art/landmarks.ts). */
export function propsTexture(scene: Phaser.Scene): string {
  if (!scene.textures.exists(PROP_KEY)) uploadSheet(scene, buildPropSheet());
  return PROP_KEY;
}

/** Visual de reserva para um NPC sem ficha: o padrão, estável pelo id. */
function fallbackNpcLook(id: string): ArtLook {
  const ap = getData().appearance;
  const h = parseInt(hashString(id), 16);
  return {
    ...defaultLook(),
    skin: ap.peles[h % 12]!.id,
    hair: ap.cortes[h % ap.cortes.length]!.id,
    face: ap.rostos[h % ap.rostos.length]!.id,
    outfit: { tier: 'delta', palette: h % 6 },
  };
}

/** Cria o gerador. Uma instância serve o jogo todo (as texturas ficam no TextureManager). */
export function createArt(): ArtApi {
  const api: ArtApi = {
    characterSheet(scene, look) {
      const key = lookKey(look as ArtLook);
      if (!scene.textures.exists(key)) uploadDeferred(scene, withDeferredDraw(() => buildCharacterSheet(look as ArtLook, key)));
      registerAnims(scene, key);
      return key;
    },
    npcSheet(scene, npcId) {
      const key = `npc_${npcId}`;
      if (!scene.textures.exists(key)) {
        const look = npcLook(npcId) ?? fallbackNpcLook(npcId);
        uploadDeferred(scene, { ...withDeferredDraw(() => buildCharacterSheet(look, key)), key });
      }
      registerAnims(scene, key);
      return key;
    },
    enemySheet(scene, enemyId, tier) {
      const key = uploadDeferred(scene, withDeferredDraw(() => buildEnemySheet(enemyId, tier)));
      registerAnims(scene, key);
      return key;
    },
    summonSheet(scene, summonId, side) {
      const key = uploadDeferred(scene, withDeferredDraw(() => buildSummonSheet(summonId, side ?? 'esquerda')));
      registerAnims(scene, key);
      return key;
    },
    tileset(scene) {
      const sheet = buildTileset();
      uploadSheet(scene, sheet);
      return TILE_KEY;
    },
    fx(scene) {
      const { sheets, info } = buildFx();
      for (const sh of sheets) {
        uploadSheet(scene, sh, { fx: info[sh.key] });
        registerAnims(scene, sh.key);
      }
      if (!scene.textures.exists(FONT_KEY)) {
        const fp = buildFontPix();
        upload(scene, FONT_KEY, fp);
        metas.set(FONT_KEY, { key: FONT_KEY, frameW: FONT_CELL_W, frameH: FONT_CELL_H, originX: 0, originY: 0 });
      }
      if (!scene.cache.bitmapFont.exists(FONT_KEY)) {
        const cfg: Phaser.Types.GameObjects.BitmapText.RetroFontConfig = {
          image: FONT_KEY,
          width: FONT_CELL_W,
          height: FONT_CELL_H,
          chars: FONT_CHARS,
          charsPerRow: FONT_PER_ROW,
          'offset.x': 0,
          'offset.y': 0,
          'spacing.x': 0,
          'spacing.y': 0,
          lineSpacing: 1,
        };
        scene.cache.bitmapFont.add(FONT_KEY, Phaser.GameObjects.RetroFont.Parse(scene, cfg));
      }
    },
    icon(scene, id) {
      const key = `icon_${id}`;
      if (!scene.textures.exists(key)) {
        upload(scene, key, buildIcon(id));
        metas.set(key, { key, frameW: 48, frameH: 48, originX: 0.5, originY: 0.5 });
      }
      return key;
    },
    portrait(scene, who) {
      const key = typeof who === 'string' ? `portrait_${who}` : `portrait_${hashString(stableStringify(who))}`;
      if (!scene.textures.exists(key)) {
        upload(scene, key, buildPortrait(who));
        metas.set(key, { key, frameW: 64, frameH: 64, originX: 0.5, originY: 0.5 });
      }
      return key;
    },
    emblem(scene, institutionId) {
      const key = `emblem_${institutionId}`;
      if (!scene.textures.exists(key)) {
        upload(scene, key, buildEmblem(institutionId));
        metas.set(key, { key, frameW: 64, frameH: 64, originX: 0.5, originY: 0.5 });
      }
      return key;
    },
    registerAnims,
    furniture(scene, furnitureId, rot = 0) {
      const info = furnitureInfo(furnitureId, rot);
      if (getData().furnitureById.has(furnitureId)) {
        if (!scene.textures.exists(FURNITURE_KEY)) uploadSheet(scene, buildFurnitureSheet());
        return { key: FURNITURE_KEY, ...info };
      }
      // fora do catálogo: textura própria com o desenho reserva
      const key = `mov_x_${furnitureId}_${info.rot}`;
      if (!scene.textures.exists(key)) upload(scene, key, buildFurniture(furnitureId, info.rot), [{ name: info.frame, x: 0, y: 0, w: info.w, h: info.h }]);
      return { key, ...info };
    },
    interior(scene, housingTypeOrStyle, tilesW, tilesH) {
      const style = interiorStyleFor(housingTypeOrStyle);
      const t = interiorTiles(housingTypeOrStyle);
      const tw = Math.max(1, Math.round(tilesW ?? t.w));
      const th = Math.max(1, Math.round(tilesH ?? t.h));
      const key = `interior_${style}_${tw}x${th}`;
      if (!scene.textures.exists(key)) upload(scene, key, buildInterior(style, tw, th).pix);
      return { key, style, tilesW: tw, tilesH: th, floorX: INTERIOR_SIDE, floorY: INTERIOR_WALL_H, w: tw * 32 + 2 * INTERIOR_SIDE, h: th * 32 + INTERIOR_WALL_H + INTERIOR_FRONT };
    },
  };
  return api;
}
/** Normaliza o visual que vem do servidor (EntSnap.lk) para CharacterLook; undefined se não servir. */
export function asCharacterLook(lk: unknown): CharacterLook | undefined {
  if (!lk || typeof lk !== 'object') return undefined;
  const o = lk as Partial<CharacterLook>;
  if (typeof o.body !== 'string' || !o.outfit || typeof o.outfit !== 'object') return undefined;
  return {
    body: o.body,
    skin: String(o.skin ?? ''),
    face: String(o.face ?? ''),
    hair: String(o.hair ?? ''),
    hairColor: String(o.hairColor ?? ''),
    details: Array.isArray(o.details) ? o.details.map(String) : [],
    outfit: { ...o.outfit, palette: Number(o.outfit.palette ?? 0) | 0 },
    items: o.items,
  };
}
