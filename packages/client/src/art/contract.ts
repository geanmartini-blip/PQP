/**
 * Contrato do gerador de pixel art. Toda a arte do piloto é desenhada por código em canvas
 * (sem PNG externo), no estilo Tibia/Habbo: tile 32 px, boneco 32x48 px, cabeça grande
 * (~2,5 cabeças de altura), 4 direções, contorno escuro de 1 px, paleta limitada.
 *
 * Folhas de sprite geradas viram texturas do Phaser com frames nomeados
 * `${anim}_${dir}_${i}`: anim em ANIMS, dir 0 baixo, 1 esquerda, 2 cima, 3 direita.
 */
import type Phaser from 'phaser';

export const SPRITE_W = 32;
export const SPRITE_H = 48;
export const TILE_PX = 32;

export const ANIMS = {
  parado: 2,
  andando: 6,
  basico: 3,
  habilidade: 4,
  especial: 6,
  vitoria: 3,
  derrota: 3,
} as const;
export type AnimName = keyof typeof ANIMS;

/** Visual de um personagem de jogador (camadas como no Habbo). Ids vêm de data/appearance.json e data/outfits.json. */
export interface CharacterLook {
  body: string;
  skin: string;
  face: string;
  hair: string;
  hairColor: string;
  details: string[];
  /** traje: delta (nível 1), base (uniforme da instituição), aprendiz, veterano... */
  outfit: {
    tier: 'delta' | 'base' | 'aprendiz' | 'veterano' | 'virada' | 'mestre' | 'lendario';
    archetypeId?: string;
    institutionId?: string;
    /** 0..2: paleta da ala; no traje do Delta, 0..5 é a cor da camiseta */
    palette: number;
  };
  /** itens equipados que mudam a sua parte do visual dentro do estilo da ala */
  items?: { slot: string; rarity: 'comum' | 'raro' | 'unico' | 'set'; art?: string }[];
}

/**
 * Móvel da moradia (Fase 4) numa textura: quadro `frame` da folha `key`. Para pôr na grade da casa,
 * imagem com origem (0, 0) em (floorX + tx × 32, floorY + ty × 32 − up) e profundidade ty + footH.
 */
export interface FurnitureArt {
  key: string;
  frame: string;
  /** rotação efetiva (0 frente, 1 esquerda, 2 costas, 3 direita) e quantas o móvel tem */
  rot: number;
  rots: number;
  /** pegada em tiles já girada */
  footW: number;
  footH: number;
  /** px que o desenho sobe acima da pegada */
  up: number;
  w: number;
  h: number;
  /** rente ao chão (tapete, esteira): fica abaixo dos outros móveis e dos bonecos */
  flat: boolean;
  /** vai na parede (não ocupa chão nem gira) */
  wall: boolean;
}

/** Interior de moradia (Fase 4): o quarto inteiro numa textura, com o piso a partir de (floorX, floorY). */
export interface InteriorArt {
  key: string;
  style: 'mutirao' | 'capsula';
  tilesW: number;
  tilesH: number;
  floorX: number;
  floorY: number;
  w: number;
  h: number;
}

export interface ArtApi {
  /** gera (uma vez, com cache por hash) a folha do personagem e as animações; devolve a chave da textura */
  characterSheet(scene: Phaser.Scene, look: CharacterLook): string;
  /** treinadores e personagens da história têm sprite próprio (visual de mestre) */
  npcSheet(scene: Phaser.Scene, npcId: string): string;
  enemySheet(scene: Phaser.Scene, enemyId: string, tier?: 'normal' | 'elite' | 'chefe'): string;
  /** invocações: totem, robô, barricada, lhama, cópia... */
  summonSheet(scene: Phaser.Scene, summonId: string, side?: 'esquerda' | 'direita'): string;
  /** tileset com um frame por valor de Tile (map/types.ts), variações por região: chave `tiles` e frames `${tile}_${variante}` */
  tileset(scene: Phaser.Scene): string;
  /** texturas de efeito: marcador de alvo, aviso no chão (círculo/cone), folhas, faíscas, glitch, números, saque, ícones de habilidade */
  fx(scene: Phaser.Scene): void;
  /** ícone 48x48 de habilidade ou item para os botões */
  icon(scene: Phaser.Scene, id: string): string;
  /** retrato 64x64 e emblema 64x64 */
  portrait(scene: Phaser.Scene, who: string | CharacterLook): string;
  emblem(scene: Phaser.Scene, institutionId: string): string;
  /** cria os Phaser.Animations para uma folha: chaves `${sheetKey}:${anim}:${dir}` */
  registerAnims(scene: Phaser.Scene, sheetKey: string): void;
  /** Fase 4: móvel do catálogo (data/furniture.json) numa rotação; ícones de UI saem de icon(scene, 'ui_semente') etc. */
  furniture(scene: Phaser.Scene, furnitureId: string, rot?: number): FurnitureArt;
  /** Fase 4: interior pelo tipo de moradia (housing.json) ou pelo estilo; tamanho do tipo ou o pedido */
  interior(scene: Phaser.Scene, housingTypeOrStyle: string, tilesW?: number, tilesH?: number): InteriorArt;
}
