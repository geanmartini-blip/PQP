/**
 * Bonecos do PixelLab (revisão visual v3, v0.3). Os quadros ficam em public/pl/<pasta>/:
 * andar em <dir>_<i>.png e golpe em golpe_<dir>_<i>.png, recortados por tools/art/pl-boneco.mjs a
 * partir do download do personagem. A folha monta os mesmos quadros do contrato
 * (`${anim}_${dir}_${i}`) para o EntityView não saber de onde veio: parado usa o 1º passo, e o
 * básico, a habilidade e o Especial usam o golpe.
 *
 * v0.3: o jogador sem o conjunto da classe completo é o boneco base; com as 5 peças, vira o boneco
 * da ala (o do líder), quando a ala já tem um.
 */
import * as Phaser from 'phaser';
import { ANIMS, type AnimName, type CharacterLook } from './contract';
import { registerSheet } from './index';

/** Arquétipo → pasta em public/pl/. */
export const PL_ARCHETYPES: Record<string, string> = { peao_brabo: 'peao', idol: 'idol' };
/** o boneco base, sem itens da classe */
export const PL_BASE = 'base';
/** dir do contrato: 0 baixo, 1 esquerda, 2 cima, 3 direita */
const DIR_NAMES = ['south', 'west', 'north', 'east'] as const;
const WALK = 6;
const GOLPE = 6;
/** quadros do golpe usados por animação do contrato (preparo, soco, volta) */
const GOLPE_DE: Partial<Record<AnimName, readonly number[]>> = {
  basico: [1, 2, 3],
  habilidade: [1, 2, 3, 4],
  especial: [0, 1, 2, 3, 4, 5],
};
/** o boneco do PixelLab tem ~97 px de altura; no mundo, o boneco tem 48 */
const PL_SCALE = 0.5;

const frameKey = (f: string, d: string, i: number) => `pl_${f}_${d}_${i}`;
const golpeKey = (f: string, d: string, i: number) => `pl_${f}_golpe_${d}_${i}`;

/** Põe na fila de carga os quadros de todos os bonecos do PixelLab (chamar no preload). */
export function preloadPixellab(scene: Phaser.Scene): void {
  const base = import.meta.env.BASE_URL;
  for (const f of new Set([...Object.values(PL_ARCHETYPES), PL_BASE]))
    for (const d of DIR_NAMES) {
      for (let i = 0; i < WALK; i++) scene.load.image(frameKey(f, d, i), `${base}pl/${f}/${d}_${i}.png`);
      for (let i = 0; i < GOLPE; i++) scene.load.image(golpeKey(f, d, i), `${base}pl/${f}/golpe_${d}_${i}.png`);
    }
}

/** Pasta do boneco do PixelLab para este visual de jogador (ala com conjunto completo, senão o base). */
export function plBonecoDe(look: CharacterLook): string {
  const ala = look.outfit.archetypeId ? PL_ARCHETYPES[look.outfit.archetypeId] : undefined;
  return ala && look.outfit.conjunto ? ala : PL_BASE;
}

/** Folha do PixelLab deste visual de jogador, ou undefined se o boneco ainda não foi carregado. */
export function pixellabSheet(scene: Phaser.Scene, look: CharacterLook): string | undefined {
  const f = plBonecoDe(look);
  const key = `pl_${f}`;
  if (scene.textures.exists(key)) return key;
  if (!scene.textures.exists(frameKey(f, 'south', 0))) return undefined;
  const s0 = scene.textures.get(frameKey(f, 'south', 0)).getSourceImage() as HTMLImageElement;
  const w = s0.width, h = s0.height;
  const tex = scene.textures.createCanvas(key, w * Math.max(WALK, GOLPE), h * DIR_NAMES.length * 2);
  if (!tex) return undefined;
  const ctx = tex.getContext();
  const temGolpe = scene.textures.exists(golpeKey(f, 'south', 0));
  DIR_NAMES.forEach((d, dir) => {
    for (let i = 0; i < WALK; i++) {
      const k = frameKey(f, d, i);
      if (scene.textures.exists(k)) ctx.drawImage(scene.textures.get(k).getSourceImage() as HTMLImageElement, i * w, dir * h);
    }
    for (let i = 0; i < GOLPE && temGolpe; i++) {
      const k = golpeKey(f, d, i);
      if (scene.textures.exists(k)) ctx.drawImage(scene.textures.get(k).getSourceImage() as HTMLImageElement, i * w, (DIR_NAMES.length + dir) * h);
    }
  });
  const anims: Partial<Record<AnimName, number>> = {};
  for (const anim of Object.keys(ANIMS) as AnimName[]) {
    anims[anim] = ANIMS[anim];
    const golpe = temGolpe ? GOLPE_DE[anim] : undefined;
    for (let dir = 0; dir < DIR_NAMES.length; dir++)
      for (let i = 0; i < ANIMS[anim]; i++) {
        if (golpe) {
          tex.add(`${anim}_${dir}_${i}`, 0, golpe[i % golpe.length]! * w, (DIR_NAMES.length + dir) * h, w, h);
          continue;
        }
        const col = anim === 'andando' ? i : anim === 'parado' ? 0 : (i * 2 + 1) % WALK;
        tex.add(`${anim}_${dir}_${i}`, 0, col * w, dir * h, w, h);
      }
  }
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  registerSheet(scene, { key, frameW: w, frameH: h, originX: 0.5, originY: 1, anims, scale: PL_SCALE });
  return key;
}
