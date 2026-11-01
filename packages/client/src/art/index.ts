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
import { npcLook } from './npcs';
import { hashString, type Pix, stableStringify } from './pixel';
import { type SheetData } from './sheet';
import { buildTileset, TILE_KEY } from './tiles';

export type { ArtApi, CharacterLook } from './contract';
export { ANIMS, SPRITE_H, SPRITE_W, TILE_PX } from './contract';
export { ANIMATED_TILES, TILE_ANIM_MS, TILE_KEY, TILE_VARIANTS, tileFrame, treeFrame } from './tiles';
export { coneKeyFor, CONE_ANGLES, FONT_KEY, FX_KEYS, shadowFrameFor } from './fx';
export type { FxInfo } from './fx';
export { defaultLook, archetypeLook } from './character';
export type { ArtLook } from './character';

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
      if (!scene.textures.exists(key)) uploadSheet(scene, buildCharacterSheet(look as ArtLook, key));
      registerAnims(scene, key);
      return key;
    },
    npcSheet(scene, npcId) {
      const key = `npc_${npcId}`;
      if (!scene.textures.exists(key)) {
        const look = npcLook(npcId) ?? fallbackNpcLook(npcId);
        uploadSheet(scene, { ...buildCharacterSheet(look, key), key });
      }
      registerAnims(scene, key);
      return key;
    },
    enemySheet(scene, enemyId, tier) {
      const sheet = buildEnemySheet(enemyId, tier);
      uploadSheet(scene, sheet);
      registerAnims(scene, sheet.key);
      return sheet.key;
    },
    summonSheet(scene, summonId, side) {
      const sheet = buildSummonSheet(summonId, side ?? 'esquerda');
      uploadSheet(scene, sheet);
      registerAnims(scene, sheet.key);
      return sheet.key;
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
