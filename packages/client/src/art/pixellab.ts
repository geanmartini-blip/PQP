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
  for (const f of PL_BICHOS) scene.load.image(`pl_${f}_obj`, `${base}pl/${f}/obj.png`);
  const bonecos = new Set([...Object.values(PL_ARCHETYPES), PL_BASE, ...Object.values(PL_NPCS), ...Object.values(PL_INIMIGOS)]);
  for (const f of bonecos) {
    if (PL_BICHOS.has(f)) continue;
    const parado = PL_PARADOS.has(f);
    for (const d of DIR_NAMES) {
      for (let i = 0; i < (parado ? 1 : WALK); i++) scene.load.image(frameKey(f, d, i), `${base}pl/${f}/${d}_${i}.png`);
      if (!parado && !PL_SEM_GOLPE.has(f)) for (let i = 0; i < GOLPE; i++) scene.load.image(golpeKey(f, d, i), `${base}pl/${f}/golpe_${d}_${i}.png`);
    }
  }
}

/** Pasta do boneco do PixelLab para este visual de jogador (ala com conjunto completo, senão o base). */
export function plBonecoDe(look: CharacterLook): string {
  const ala = look.outfit.archetypeId ? PL_ARCHETYPES[look.outfit.archetypeId] : undefined;
  return ala && look.outfit.conjunto ? ala : PL_BASE;
}

/** Folha do PixelLab deste visual de jogador, ou undefined se o boneco ainda não foi carregado. */
export function pixellabSheet(scene: Phaser.Scene, look: CharacterLook): string | undefined {
  return folhaBoneco(scene, plBonecoDe(look));
}

/**
 * v0.3: NPCs e inimigos do Delta com boneco do PixelLab (pasta em public/pl/). Os bichos (siri e
 * mosquito) são um desenho só, sem direção: a folha repete o quadro e o EntityView dá o bote.
 */
export const PL_NPCS: Record<string, string> = {
  seu_jaco: 'jaco',
  bruno_ferro: 'bruno',
  toninho_do_barco: 'toninho',
  vendedor_do_delta: 'vendedor',
  vendedor_de_chopindita_barata: 'chopindita',
  // margens: os treinadores do Peão e do Idol usam o boneco da ala; os outros, a pasta com o próprio id
  wesley: 'peao',
  li_wei: 'idol',
  ...Object.fromEntries(
    [
      'jacques', 'dev_kumar', 'olga', 'batu', 'bazza', 'seamus', 'sigrid', 'ayaan_quispe', 'el_relampago',
      'donna_valentina', 'tiao', 'takeshi', 'edson', 'thalysson', 'big_mo', 'dusty', 'chidi', 'mei_lin_zhao',
      'klaus', 'brooke', 'katia', 'kaua_ferreira', 'ilaria_vesta', 'lazzaro_prati', 'teodoro_rinaldi',
      'amara_okafor', 'yusuf_adeyemi', 'rolf_halvorsen', 'viktor_sahl', 'mateo_silva_park', 'klara_lindqvist',
      'nayra_sundaram', 'kenji_albrecht', 'benzedeira_do_espelho', 'vizinha_da_bracadeira',
      'funcionario_da_cabine_neon', 'entregador_de_app',
      // Usina e Juncal
      'cambista_da_ponte', 'dalva_rocha', 'o_sombra', 'curupira',
    ].map((id) => [id, id]),
  ),
};
export const PL_INIMIGOS: Record<string, string> = {
  bruno_ferro_chefe: 'bruno',
  capanga_do_capataz: 'capanga',
  cobrador_do_capataz: 'cobrador',
  siri_do_mangue: 'siri',
  mosquito_do_delta: 'mosquito',
  fiscal_da_comissao: 'fiscal',
  contrabandista: 'contrabandista',
  drone_de_cobranca: 'drone',
  mercenario_do_sombra: 'mercenario',
  turbina_desgovernada: 'turbina',
  enguia_eletrica: 'enguia',
  cobra_do_juncal: 'cobra',
  cao_de_guarda_do_capataz: 'cao',
  bomba_descontrolada: 'bomba',
};
const PL_BICHOS: ReadonlySet<string> = new Set(['siri', 'mosquito', 'drone', 'turbina', 'enguia', 'cobra', 'cao', 'bomba']);
/** NPCs que não lutam: só o andar */
const PL_SEM_GOLPE: ReadonlySet<string> = new Set(['jaco', 'toninho', 'vendedor', 'chopindita']);
/** NPCs das margens: só as 4 direções, sem andar nem golpe (ficam no lugar) */
const PL_PARADOS: ReadonlySet<string> = new Set(
  Object.values(PL_NPCS).filter((f) => !['jaco', 'bruno', 'toninho', 'vendedor', 'chopindita', 'peao', 'idol'].includes(f)),
);

/** Folha do PixelLab de um NPC ou inimigo, ou undefined se ele não tem (ou ainda não carregou). */
export function pixellabEntSheet(scene: Phaser.Scene, kind: 'npc' | 'inimigo', id: string): string | undefined {
  const f = (kind === 'npc' ? PL_NPCS : PL_INIMIGOS)[id];
  if (!f) return undefined;
  return PL_BICHOS.has(f) ? folhaBicho(scene, f) : folhaBoneco(scene, f);
}

function folhaBicho(scene: Phaser.Scene, f: string): string | undefined {
  const key = `pl_${f}`;
  if (scene.textures.exists(key)) return key;
  const src = `pl_${f}_obj`;
  if (!scene.textures.exists(src)) return undefined;
  const im = scene.textures.get(src).getSourceImage() as HTMLImageElement;
  const tex = scene.textures.createCanvas(key, im.width * 2, im.height);
  if (!tex) return undefined;
  // quadro 0 parado, quadro 1 um pixel acima (o bicho pula ou bate asa)
  tex.getContext().drawImage(im, 0, 0);
  tex.getContext().drawImage(im, im.width, -1);
  const anims: Partial<Record<AnimName, number>> = {};
  for (const anim of Object.keys(ANIMS) as AnimName[]) {
    anims[anim] = ANIMS[anim];
    for (let dir = 0; dir < DIR_NAMES.length; dir++)
      for (let i = 0; i < ANIMS[anim]; i++) tex.add(`${anim}_${dir}_${i}`, 0, (i & 1) * im.width, 0, im.width, im.height);
  }
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  registerSheet(scene, { key, frameW: im.width, frameH: im.height, originX: 0.5, originY: 0.9, anims, scale: PL_SCALE });
  return key;
}

function folhaBoneco(scene: Phaser.Scene, f: string): string | undefined {
  const key = `pl_${f}`;
  if (scene.textures.exists(key)) return key;
  if (!scene.textures.exists(frameKey(f, 'south', 0))) return undefined;
  const s0 = scene.textures.get(frameKey(f, 'south', 0)).getSourceImage() as HTMLImageElement;
  const w = s0.width, h = s0.height;
  const tex = scene.textures.createCanvas(key, w * Math.max(WALK, GOLPE), h * DIR_NAMES.length * 2);
  if (!tex) return undefined;
  const ctx = tex.getContext();
  const temGolpe = scene.textures.exists(golpeKey(f, 'south', 0));
  const temAndar = scene.textures.exists(frameKey(f, 'south', 1));
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
        const col = !temAndar || anim === 'parado' ? 0 : anim === 'andando' ? i : (i * 2 + 1) % WALK;
        tex.add(`${anim}_${dir}_${i}`, 0, col * w, dir * h, w, h);
      }
  }
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  registerSheet(scene, { key, frameW: w, frameH: h, originX: 0.5, originY: 1, anims, scale: PL_SCALE });
  return key;
}
