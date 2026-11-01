/**
 * Desenho de uma entidade: boneco com animação por direção e estado, sombra, barra de vida,
 * nome e nível, estrelinhas de atordoado, bolha de escudo e brilho de saque.
 *
 * Origem dos quadros: (0,5; 1), o centro de baixo é o chão sob a entidade. A profundidade é o y dos
 * pés (ordem por y). Nada é alocado por quadro: só posição, quadro e escala mudam.
 */
import * as Phaser from 'phaser';
import { FONT_KEY, shadowFrameFor, sheetMeta, TILE_PX } from '../art/index';
import type { AnimName } from '../art/contract';
import { fontText } from '../art/fx';
import { FL } from '../game/clientWorld';
import { DEPTH } from './depth';

import type { ViewKind } from './viewRules';
export type { ViewKind } from './viewRules';

// SUGESTÃO: cores das barras e dos nomes.
const COLOR = {
  barBg: 0x1a1018,
  enemy: 0xd83a2a,
  ally: 0x4ac04a,
  self: 0x5ae05a,
  shield: 0xe8f0ff,
  nameEnemy: 0xffb0a0,
  nameElite: 0xffa040,
  nameAlly: 0xd8ffd0,
  nameNpc: 0xffe8a0,
};

export interface EntityViewOpts {
  id: number;
  kind: ViewKind;
  sheetKey: string;
  radius: number;
  isSelf?: boolean;
  /** 'auto': barra de aliado que só aparece quando apanha ou luta (NPC companheiro x NPC neutro) */
  bar?: 'enemy' | 'ally' | 'auto' | 'none';
  /** brilho por baixo (saque) */
  glow?: string;
  /** efeito do afixo de elite (poeira nos pés; cruz e pavio na cabeça) */
  aura?: string;
  label?: string;
  labelColor?: number;
  elite?: boolean;
  /** escala inteira do rótulo (layout.worldTextScale) */
  textScale?: number;
}

// SUGESTÃO: rótulo com mais de 10 letras sai uma escala menor (nome de elite comprido não cobre a tela).
const LONG_LABEL_CHARS = 10;

export { shouldRevive } from './viewRules';

export class EntityView {
  readonly id: number;
  readonly kind: ViewKind;
  readonly isSelf: boolean;
  sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private glow?: Phaser.GameObjects.Sprite;
  private aura?: Phaser.GameObjects.Sprite;
  private auraAtFeet = false;
  private barBg?: Phaser.GameObjects.Rectangle;
  private barFill?: Phaser.GameObjects.Rectangle;
  private barShield?: Phaser.GameObjects.Rectangle;
  private label?: Phaser.GameObjects.BitmapText;
  private stun?: Phaser.GameObjects.Sprite;
  private bubble?: Phaser.GameObjects.Sprite;
  sheetKey = '';
  private isFx = false;
  private frameH = 48;
  private originY = 1;
  private anim: AnimName | '' = '';
  private dir = 0;
  private actionUntil = 0;
  private actionAnim: AnimName = 'basico';
  private lastFl = 0;
  private barW = 24;
  private barAuto = false;
  private barShown = true;
  private shieldFrac = 0;
  private stunned = false;
  private bubbleOn = false;
  private tint = -1;
  /** posição desenhada (px) */
  px = 0;
  py = 0;
  radius: number;
  visible = true;
  dying = false;
  private dieAt = 0;
  private depthY = NaN;
  private labelText = '';
  lastSeen = 0;

  static colors = COLOR;

  constructor(
    private readonly scene: Phaser.Scene,
    o: EntityViewOpts,
  ) {
    this.id = o.id;
    this.kind = o.kind;
    this.isSelf = o.isSelf === true;
    this.radius = o.radius;
    // sombra elíptica no chão sob todo boneco: largura pelo raio, sempre em escala 1 (pixel nítido)
    // SUGESTÃO: a sombra tem 2,2 raios de largura.
    this.shadow = scene.add.image(0, 0, 'fx_sombra', shadowFrameFor(o.radius * 2.2 * TILE_PX)).setDepth(DEPTH.shadow);
    if (o.glow) {
      this.glow = scene.add.sprite(0, 0, o.glow, '0').setDepth(DEPTH.shadow).setAlpha(0.9);
      if (scene.anims.exists(`${o.glow}:play:0`)) this.glow.play(`${o.glow}:play:0`);
    }
    this.sprite = scene.add.sprite(0, 0, o.sheetKey);
    this.setSheet(o.sheetKey);
    if (o.aura) {
      this.aura = scene.add.sprite(0, 0, o.aura, '0').setOrigin(0.5, 1);
      this.auraAtFeet = o.aura === 'fx_poeira';
      if (scene.anims.exists(`${o.aura}:play:0`)) this.aura.play(`${o.aura}:play:0`);
    }
    if (o.bar && o.bar !== 'none') {
      this.barAuto = o.bar === 'auto';
      this.barShown = !this.barAuto;
      this.barW = o.elite ? 32 : 24;
      this.barBg = scene.add.rectangle(0, 0, this.barW + 2, 5, COLOR.barBg).setOrigin(0, 0.5).setDepth(DEPTH.overlay);
      this.barFill = scene.add
        .rectangle(0, 0, this.barW, 3, o.isSelf ? COLOR.self : o.bar === 'enemy' ? COLOR.enemy : COLOR.ally)
        .setOrigin(0, 0.5)
        .setDepth(DEPTH.overlay + 1);
      this.barShield = scene.add.rectangle(0, 0, this.barW, 1, COLOR.shield).setOrigin(0, 0.5).setDepth(DEPTH.overlay + 2);
      this.setBarVisible(this.barShown);
    }
    if (o.label) {
      this.labelText = fontText(o.label);
      this.label = scene.add.bitmapText(0, 0, FONT_KEY, this.labelText, 7).setOrigin(0.5, 1).setDepth(DEPTH.overlay + 3);
      this.label.setTint(o.labelColor ?? COLOR.nameNpc);
      this.setTextScale(o.textScale ?? 2);
    }
  }

  /** Escala inteira do rótulo (muda com o zoom da câmera). */
  setTextScale(s: number): void {
    if (!this.label) return;
    const base = Math.max(1, Math.round(s));
    this.label.setScale(this.labelText.length > LONG_LABEL_CHARS ? Math.max(1, base - 1) : base);
  }

  /** Voltou de pé depois de um 'death' (jogador que renasceu no QG). */
  revive(): void {
    if (!this.dying) return;
    this.dying = false;
    this.anim = '';
    this.sprite.setAlpha(1);
    this.setBarVisible(this.visible);
    this.aura?.setVisible(this.visible);
  }

  setSheet(key: string): void {
    if (key === this.sheetKey) return;
    this.sheetKey = key;
    const m = sheetMeta(key);
    this.isFx = m?.fx !== undefined;
    this.frameH = m?.frameH ?? 48;
    this.originY = m?.originY ?? 1;
    this.sprite.setTexture(key);
    this.sprite.setOrigin(m?.originX ?? 0.5, this.originY);
    this.anim = '';
    if (m?.fx) {
      if (m.fx.fps > 0 && this.scene.anims.exists(`${key}:play:0`)) this.sprite.play(`${key}:play:0`);
      else this.sprite.setFrame('0');
    } else this.sprite.setFrame(`parado_${this.dir}_0`);
  }

  /** Posição dos pés em px do mundo. */
  place(px: number, py: number): void {
    this.px = px;
    this.py = py;
    this.sprite.setPosition(px, py);
    // a ordem por y só é refeita quando o pixel muda (setDepth reordena a lista inteira)
    const dy = Math.round(py);
    const depthChanged = dy !== this.depthY;
    if (depthChanged) {
      this.depthY = dy;
      this.sprite.setDepth(DEPTH.entity + dy);
    }
    this.shadow.setPosition(Math.round(px), Math.round(py) - 1);
    this.glow?.setPosition(px, py - 4);
    const top = py - this.frameH * this.originY;
    if (this.barBg) {
      const bx = Math.round(px - this.barW / 2);
      const by = Math.round(top - 3);
      this.barBg.setPosition(bx - 1, by);
      this.barFill!.setPosition(bx, by);
      this.barShield!.setPosition(bx, by - 2);
    }
    if (this.label) this.label.setPosition(Math.round(px), Math.round(top - (this.barBg && this.barShown ? 6 : 1)));
    if (this.stun) {
      this.stun.setPosition(px, top + 2);
      if (depthChanged) this.stun.setDepth(DEPTH.entity + dy + 1);
    }
    if (this.aura) {
      this.aura.setPosition(px, this.auraAtFeet ? py + 2 : top - 2);
      if (depthChanged) this.aura.setDepth(DEPTH.entity + dy + (this.auraAtFeet ? -1 : 1));
    }
    if (this.bubble) {
      this.bubble.setPosition(px, py + 4);
      if (depthChanged) this.bubble.setDepth(DEPTH.entity + dy + 2);
    }
  }

  private setBarVisible(v: boolean): void {
    const on = v && this.barShown && !this.dying;
    this.barBg?.setVisible(on);
    this.barFill?.setVisible(on);
    this.barShield?.setVisible(on && this.shieldFrac > 0);
  }

  /** Vida e escudo por mil. `inCombat` mostra a barra 'auto'. */
  setHp(h: number, sh: number, inCombat = false): void {
    if (!this.barFill) return;
    if (this.barAuto && !this.barShown && (h < 1000 || inCombat)) {
      this.barShown = true;
      this.setBarVisible(this.visible);
    }
    this.barFill.setScale(Math.max(0, Math.min(1, h / 1000)), 1);
    const s = Math.max(0, Math.min(1, sh / 1000));
    if ((s > 0) !== (this.shieldFrac > 0)) {
      this.shieldFrac = s;
      this.setBarVisible(this.visible);
    }
    this.shieldFrac = s;
    if (s > 0) this.barShield!.setScale(s, 1);
  }

  /** Um golpe ou habilidade começou: toca uma vez a animação. */
  playAction(anim: AnimName, now: number, durMs = 350): void {
    this.actionAnim = anim;
    this.actionUntil = now + durMs;
    this.anim = '';
  }

  /** Escolhe a animação pelos flags e pelo movimento. */
  animate(now: number, facing: number, moving: boolean, fl: number): void {
    if (this.isFx) return;
    // borda de subida do "atacando": um golpe novo
    if (fl & FL.atacando && !(this.lastFl & FL.atacando) && now >= this.actionUntil) this.playAction('basico', now, 260);
    this.lastFl = fl;
    let anim: AnimName;
    if (fl & FL.caido || this.dying) anim = 'derrota';
    else if (now < this.actionUntil) anim = this.actionAnim;
    else if (moving) anim = 'andando';
    else anim = 'parado';
    const dir = facing & 3;
    if (anim !== this.anim || dir !== this.dir) {
      const key = `${this.sheetKey}:${anim}:${dir}`;
      if (this.scene.anims.exists(key)) this.sprite.play(key);
      this.anim = anim;
      this.dir = dir;
    }
    this.statusFx(fl, now);
  }

  private statusFx(fl: number, now: number): void {
    const stunned = (fl & FL.atordoado) !== 0;
    if (stunned && !this.stun) {
      this.stun = this.scene.add.sprite(this.px, this.py, 'fx_atordoado', '0').setOrigin(0.5, 1).setDepth(DEPTH.entity + Math.round(this.py) + 1);
      this.stun.play('fx_atordoado:play:0');
    }
    if (stunned !== this.stunned || !stunned) {
      this.stunned = stunned;
      this.stun?.setVisible(stunned && this.visible);
    }
    // invisível: meio transparente; morrendo: some aos poucos
    const alpha = this.dying ? Math.max(0, 1 - (now - this.dieAt) / 900) : fl & FL.invisivel ? 0.4 : 1;
    if (this.sprite.alpha !== alpha) this.sprite.setAlpha(alpha);
    // lento: azulado; imune: dourado
    const tint = fl & FL.lento ? 0xa8c8ff : fl & FL.imune ? 0xfff0b0 : 0;
    if (tint !== this.tint) {
      this.tint = tint;
      if (tint) this.sprite.setTint(tint);
      else this.sprite.clearTint();
    }
  }

  setShieldBubble(on: boolean): void {
    if (on && !this.bubble) {
      this.bubble = this.scene.add.sprite(this.px, this.py, 'fx_escudo', '0').setOrigin(0.5, 1).setAlpha(0.75).setDepth(DEPTH.entity + Math.round(this.py) + 2);
      this.bubble.play('fx_escudo:play:0');
    }
    if (on !== this.bubbleOn) {
      this.bubbleOn = on;
      this.bubble?.setVisible(on && this.visible);
    }
  }

  /** Morreu: animação de derrota e some aos poucos. */
  die(now: number): void {
    if (this.dying) return;
    this.dying = true;
    this.dieAt = now;
    this.anim = '';
    this.setBarVisible(false);
    this.aura?.setVisible(false);
  }

  setVisible(v: boolean): void {
    if (v === this.visible) return;
    this.visible = v;
    this.sprite.setVisible(v);
    this.shadow.setVisible(v);
    this.glow?.setVisible(v);
    this.aura?.setVisible(v && !this.dying);
    this.setBarVisible(v);
    this.label?.setVisible(v);
    this.stun?.setVisible(v && this.stunned);
    this.bubble?.setVisible(v && this.bubbleOn);
  }

  /** Topo da cabeça (px), para balões e números. */
  get headY(): number {
    return this.py - this.frameH * this.originY;
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
    this.glow?.destroy();
    this.aura?.destroy();
    this.barBg?.destroy();
    this.barFill?.destroy();
    this.barShield?.destroy();
    this.label?.destroy();
    this.stun?.destroy();
    this.bubble?.destroy();
  }
}
