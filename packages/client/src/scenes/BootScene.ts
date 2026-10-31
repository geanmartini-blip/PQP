/**
 * Primeira cena: gera as texturas fixas (efeitos, fonte e tileset), cria o cliente de rede, conecta
 * e abre o mundo e o HUD.
 */
import * as Phaser from 'phaser';
import { createArt } from '../art/index';
import type { ClientConfig } from '../config';
import { createRuntime } from '../game/runtime';

export class BootScene extends Phaser.Scene {
  constructor(private readonly cfg: ClientConfig) {
    super('BootScene');
  }

  create(): void {
    const art = createArt();
    art.fx(this);
    art.tileset(this);
    const rt = createRuntime(this.cfg, art);
    rt.gc.connect();
    this.scene.start('WorldScene');
    this.scene.launch('HudScene');
    this.scene.bringToTop('HudScene');
  }
}
