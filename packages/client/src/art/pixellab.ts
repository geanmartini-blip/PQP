/**
 * Bonecos do PixelLab (revisão visual v3, v0.3). Cada boneco é uma folha só em
 * public/pl/<pasta>/folha.png (v0.4: tools/art/pl-folhas.mjs junta os quadros que o
 * tools/art/pl-boneco.mjs recorta em art-src/pl), com o tamanho e a contagem em plBonecos.json:
 * linhas 0 a 3 = andar (sul, oeste, norte, leste), 4 a 7 = golpe. A folha do contrato
 * (`${anim}_${dir}_${i}`) sai dela para o EntityView não saber de onde veio: parado usa o 1º passo,
 * e o básico, a habilidade e o Especial usam o golpe. Boneco de um quadro por direção fica parado.
 *
 * v0.3: o jogador sem o conjunto da classe completo é o boneco base; com as 5 peças, vira o boneco
 * da ala (o do líder), quando a ala já tem um.
 */
import * as Phaser from 'phaser';
import { ANIMS, type AnimName, type CharacterLook } from './contract';
import { registerSheet } from './index';
import FOLHAS from './plBonecos.json';

/** tamanho do quadro e quantos quadros de andar e de golpe cada folha tem */
const PL_FOLHAS: Record<string, { w: number; h: number; andar: number; golpe: number }> = FOLHAS;

/** Arquétipo → pasta em public/pl/. */
export const PL_ARCHETYPES: Record<string, string> = {
  peao_brabo: 'peao',
  idol: 'idol',
  // as outras alas usam o boneco do treinador, que também é o NPC dele
  iogue_furioso: 'dev_kumar',
  cidadao_revolucionario: 'jacques',
  babushka: 'olga',
  arqueiro_das_estepes: 'batu',
  cacador_de_crocodilo: 'bazza',
  druida_rabugento: 'seamus',
  bruxa_do_trovao: 'sigrid',
  curandeira_dos_andes: 'ayaan_quispe',
  luchador_sagrado: 'el_relampago',
  diva_da_opera: 'donna_valentina',
  malandro: 'tiao',
  sumo_cibernetico: 'takeshi',
  o_fiel: 'edson',
  monstro_da_academia: 'thalysson',
  tropa_de_choque: 'big_mo',
  cowboy_cromado: 'dusty',
  diretor_de_nollywood: 'chidi',
  engenheira_de_gambiarra: 'mei_lin_zhao',
  doktor_klaus: 'klaus',
  coach_de_bem_estar: 'brooke',
  atendente_imortal: 'katia',
  hacker_da_aldeia: 'kaua_ferreira',
};
/** o boneco base, sem itens da classe */
export const PL_BASE = 'base';
/** dir do contrato: 0 baixo, 1 esquerda, 2 cima, 3 direita */
const DIR_NAMES = ['south', 'west', 'north', 'east'] as const;
const WALK = 6;
/** quadros do golpe usados por animação do contrato (preparo, soco, volta) */
const GOLPE_DE: Partial<Record<AnimName, readonly number[]>> = {
  basico: [1, 2, 3],
  habilidade: [1, 2, 3, 4],
  especial: [0, 1, 2, 3, 4, 5],
};
/** o boneco do PixelLab tem ~97 px de altura; no mundo, o boneco tem 48 */
const PL_SCALE = 0.5;

const folhaKey = (f: string) => `pl_${f}_folha`;

/** Põe na fila de carga a folha de cada boneco do PixelLab e o desenho de cada bicho (chamar no preload). */
export function preloadPixellab(scene: Phaser.Scene): void {
  const base = import.meta.env.BASE_URL;
  for (const f of PL_BICHOS) scene.load.image(`pl_${f}_obj`, `${base}pl/${f}/obj.png`);
  const bonecos = new Set([...Object.values(PL_ARCHETYPES), PL_BASE, ...Object.values(PL_NPCS), ...Object.values(PL_INIMIGOS)]);
  for (const f of bonecos) if (!PL_BICHOS.has(f) && PL_FOLHAS[f]) scene.load.image(folhaKey(f), `${base}pl/${f}/folha.png`);
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
      // v0.4: Planalto, Vale e Ilha do Farol
      'presidenta_da_colheita', 'gerente_de_turno', 'faroleiro_aposentado',
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
  // v0.4: Planalto e Vale
  espantalho_benzido: 'espantalho',
  espantalho_mor: 'espantalho_mor',
  fiscal_da_cota: 'fiscal_cota',
  supervisor_de_meta: 'supervisor',
  robo_de_linha: 'robo_linha',
  gafanhoto_da_safra: 'gafanhoto',
  rato_de_duto: 'rato',
  relogio_de_ponto: 'relogio',
};
const PL_BICHOS: ReadonlySet<string> = new Set(['siri', 'mosquito', 'drone', 'turbina', 'enguia', 'cobra', 'cao', 'bomba', 'gafanhoto', 'rato', 'relogio']);

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
  const info = PL_FOLHAS[f];
  if (!info || !scene.textures.exists(folhaKey(f))) return undefined;
  const folha = scene.textures.get(folhaKey(f)).getSourceImage() as HTMLImageElement;
  const { w, h } = info;
  const tex = scene.textures.createCanvas(key, folha.width, folha.height);
  if (!tex) return undefined;
  tex.getContext().drawImage(folha, 0, 0);
  const temGolpe = info.golpe >= 6;
  const temAndar = info.andar > 1;
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
