/**
 * Travessia de barco: as margens e a espuma do rio rolando pelos lados do barco, para ele parecer
 * subir o Rio Claro. O mapa do barco é parado (convés e água); por cima da água, nas colunas das
 * margens (BOAT_SHORE_TILES), ficam duas faixas que repetem (art/boat.ts) e andam para baixo; a
 * espuma passa um pouco mais rápido rente ao casco. A placa do plano de saúde fica pintada no casco.
 */
import type * as Phaser from 'phaser';
import { BOAT_SHORE_TILES, type TileMap } from '@pqp/shared/map';
import { boatFoamPix, boatShorePix, hullAdPix, SHORE_ROWS } from '../art/boat';
import { TILE_PX, uploadPix } from '../art/index';
import { DEPTH } from './depth';

// SUGESTÃO: o barco anda 1,5 tile por segundo; na ponte (escolha) e encostando, mais devagar.
export const BOAT_SCROLL_TILES_S = 1.5;
export const BOAT_SCROLL_SLOW_TILES_S = 0.3;
// SUGESTÃO: a espuma rente ao casco anda 30% mais rápido que as margens (parece mais perto).
const FOAM_MULT = 1.3;

const KEY_L = 'barco_margem_esquerda';
const KEY_R = 'barco_margem_direita';
const KEY_F = 'barco_espuma';
const KEY_A = 'barco_placa_casco';

export interface BoatScrollView {
  /** anda as faixas `dtMs` com o barco a `tilesPerS` */
  update(dtMs: number, tilesPerS: number): void;
  destroy(): void;
}

/** Monta as faixas rolando sobre o mapa do barco. */
export function buildBoatScroll(scene: Phaser.Scene, map: TileMap): BoatScrollView {
  if (!scene.textures.exists(KEY_L)) uploadPix(scene, KEY_L, boatShorePix('esquerda'));
  if (!scene.textures.exists(KEY_R)) uploadPix(scene, KEY_R, boatShorePix('direita'));
  if (!scene.textures.exists(KEY_F)) uploadPix(scene, KEY_F, boatFoamPix());
  if (!scene.textures.exists(KEY_A)) uploadPix(scene, KEY_A, hullAdPix());
  const T = TILE_PX;
  const W = map.width * T;
  const H = map.height * T;
  const sw = BOAT_SHORE_TILES * T;
  // as margens encostam meio tile mais perto do casco (por cima da espuma), para aparecerem na tela
  // do celular, que mostra pouco além da amurada
  const near = T / 2;
  const left = scene.add.tileSprite(near, 0, sw, H, KEY_L).setOrigin(0, 0).setDepth(DEPTH.deco + 0.5);
  const right = scene.add.tileSprite(W - sw - near, 0, sw, H, KEY_R).setOrigin(0, 0).setDepth(DEPTH.deco + 0.5);
  // espuma na coluna de água entre a margem e o casco, dos dois lados
  const foamL = scene.add.tileSprite(sw, 0, T, H, KEY_F).setOrigin(0, 0).setDepth(DEPTH.deco + 0.2);
  const foamR = scene.add.tileSprite(W - sw - T, 0, T, H, KEY_F).setOrigin(0, 0).setDepth(DEPTH.deco + 0.2).setFlipX(true);
  // placa do plano de saúde no casco de boreste (o lado da Direita), no meio do barco
  const ad = scene.add.image(W - sw - T + 1, Math.round(H * 0.55), KEY_A).setOrigin(0, 0.5).setDepth(DEPTH.deco + 0.6);
  const parts: Phaser.GameObjects.GameObject[] = [left, right, foamL, foamR, ad];
  const SHORE_H = SHORE_ROWS * T;
  const FOAM_H = scene.textures.get(KEY_F).getSourceImage().height;
  return {
    update(dtMs, tilesPerS) {
      const d = (tilesPerS * T * dtMs) / 1000;
      // o barco sobe: as margens descem (o resto da altura da textura, para o número não crescer)
      left.tilePositionY = (left.tilePositionY - d) % SHORE_H;
      right.tilePositionY = (right.tilePositionY - d) % SHORE_H;
      foamL.tilePositionY = (foamL.tilePositionY - d * FOAM_MULT) % FOAM_H;
      foamR.tilePositionY = (foamR.tilePositionY - d * FOAM_MULT) % FOAM_H;
    },
    destroy() {
      for (const p of parts) p.destroy();
    },
  };
}
