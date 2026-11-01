/**
 * Bonecos do PixelLab (revisão visual v3). Os quadros ficam em public/pl/<pasta>/<dir>_<i>.png,
 * recortados por tools/art/mock-pixellab-pl.mjs a partir de pixellab/resultados/. A folha monta os
 * mesmos quadros do contrato (`${anim}_${dir}_${i}`) para o EntityView não saber de onde veio.
 * Por enquanto só existe o andar: parado usa o 1º passo e as poses de ação repetem passos.
 */
import * as Phaser from 'phaser';
import { ANIMS, type AnimName } from './contract';
import { registerSheet } from './index';

/** Arquétipo → pasta em public/pl/. */
export const PL_ARCHETYPES: Record<string, string> = { peao_brabo: 'peao', idol: 'idol' };
/** dir do contrato: 0 baixo, 1 esquerda, 2 cima, 3 direita */
const DIR_NAMES = ['south', 'west', 'north', 'east'] as const;
const WALK = 6;
/** o boneco do PixelLab tem ~97 px de altura; no mundo, o boneco tem 48 */
const PL_SCALE = 0.5;

const frameKey = (f: string, d: string, i: number) => `pl_${f}_${d}_${i}`;

/** Põe na fila de carga os quadros de todos os bonecos do PixelLab (chamar no preload). */
export function preloadPixellab(scene: Phaser.Scene): void {
  const base = import.meta.env.BASE_URL;
  for (const f of new Set(Object.values(PL_ARCHETYPES)))
    for (const d of DIR_NAMES) for (let i = 0; i < WALK; i++) scene.load.image(frameKey(f, d, i), `${base}pl/${f}/${d}_${i}.png`);
}

/** Folha do PixelLab deste arquétipo, ou undefined se ele ainda não tem boneco gerado. */
export function pixellabSheet(scene: Phaser.Scene, archetypeId: string | undefined): string | undefined {
  const f = archetypeId ? PL_ARCHETYPES[archetypeId] : undefined;
  if (!f) return undefined;
  const key = `pl_${f}`;
  if (scene.textures.exists(key)) return key;
  if (!scene.textures.exists(frameKey(f, 'south', 0))) return undefined;
  const s0 = scene.textures.get(frameKey(f, 'south', 0)).getSourceImage() as HTMLImageElement;
  const w = s0.width, h = s0.height;
  const tex = scene.textures.createCanvas(key, w * WALK, h * DIR_NAMES.length);
  if (!tex) return undefined;
  const ctx = tex.getContext();
  DIR_NAMES.forEach((d, dir) => {
    for (let i = 0; i < WALK; i++) {
      const k = frameKey(f, d, i);
      if (scene.textures.exists(k)) ctx.drawImage(scene.textures.get(k).getSourceImage() as HTMLImageElement, i * w, dir * h);
    }
  });
  const anims: Partial<Record<AnimName, number>> = {};
  for (const anim of Object.keys(ANIMS) as AnimName[]) {
    anims[anim] = ANIMS[anim];
    for (let dir = 0; dir < DIR_NAMES.length; dir++)
      for (let i = 0; i < ANIMS[anim]; i++) {
        const col = anim === 'andando' ? i : anim === 'parado' ? 0 : (i * 2 + 1) % WALK;
        tex.add(`${anim}_${dir}_${i}`, 0, col * w, dir * h, w, h);
      }
  }
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  registerSheet(scene, { key, frameW: w, frameH: h, originX: 0.5, originY: 1, anims, scale: PL_SCALE });
  return key;
}
