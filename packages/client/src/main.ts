/**
 * Entrada do cliente: Phaser em retrato, pixel art, tamanho da tela (Scale.RESIZE).
 * ?gallery=1 abre a galeria da arte; senão Boot → Mundo + HUD.
 *
 * O jogo desenha em px de CSS (sem multiplicar pelo devicePixelRatio): a pixel art ampliada fica
 * nítida com image-rendering: pixelated, e a GPU do celular desenha 4 a 9 vezes menos pixels, o que
 * segura os 60 fps num aparelho médio.
 */
import * as Phaser from 'phaser';
import { GalleryScene } from './art/GalleryScene';
import { parseConfig } from './config';
import { BootScene } from './scenes/BootScene';
import { HudScene } from './scenes/HudScene';
import { WorldScene } from './scenes/WorldScene';

const cfg = parseConfig(location.search, location);

const scenes: Phaser.Scene[] = cfg.gallery ? [new GalleryScene()] : [new BootScene(cfg), new WorldScene(), new HudScene()];

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'jogo',
  backgroundColor: '#0d0b10',
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  input: { activePointers: 5, touch: { capture: true } },
  fps: { target: 60, smoothStep: true },
  disableContextMenu: true,
  banner: false,
  scene: scenes,
});

// para depurar no console do navegador
(window as unknown as { pqp?: unknown }).pqp = { game, cfg };

// a aba voltou do fundo: não corre atrás do tempo perdido
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) game.loop.resetDelta();
});
