/**
 * Botão redondo do HUD: ícone da arte, recarga em pizza com os segundos, cinza sem recurso ou sem
 * poder agir, anel de carga (Especial) e contador (item).
 *
 * Só Image e Sprite com texturas geradas uma vez (ui/hudTextures.ts); trocar o estado troca a
 * textura ou o quadro, sem redesenhar nada. `moveTo` muda o botão de lugar (modo de ajuste).
 */
import * as Phaser from 'phaser';
import { FONT_KEY } from '../art/index';
import { fontText } from '../art/fx';
import { buttonTex, discTex, pieFrame, pieSheet, ringFrame, ringSheet } from './hudTextures';
import type { Circle } from './layout';

export interface ButtonState {
  /** ticks de recarga restantes e total (para a pizza) */
  cd: number;
  /** recarga global restante (ticks, de 20) */
  gcd: number;
  disabled: boolean;
  /** 0..1 do anel de carga (Especial); undefined = sem anel */
  charge?: number;
  /** contador (item) */
  count?: number;
  /** pressionado agora */
  pressed?: boolean;
}

const RING_READY = 0xffe23a;
const RING_CHARGE = 0x8ad0ff;

export interface RoundButtonOpts {
  charge?: boolean;
  count?: boolean;
  hint?: string;
  label?: string;
  color?: number;
  /** pixels de canvas por px de CSS */
  px?: number;
  /** escala inteira da fonte (pixels de canvas por pixel da fonte) */
  ts?: number;
}

export class RoundButton {
  readonly c: Circle;
  private readonly px: number;
  private bg: Phaser.GameObjects.Image;
  private pie: Phaser.GameObjects.Image;
  private grey: Phaser.GameObjects.Image;
  private ring?: Phaser.GameObjects.Image;
  private icon?: Phaser.GameObjects.Image;
  private text: Phaser.GameObjects.BitmapText;
  private countText?: Phaser.GameObjects.BitmapText;
  private hint?: Phaser.GameObjects.BitmapText;
  private label?: Phaser.GameObjects.BitmapText;
  private iconKey = '';
  private cdTotal = 0;
  private bgColor: number;
  private ringReadyKey = '';
  private ringChargeKey = '';
  private last = { cd: -1, gcd: -1, disabled: false, charge: -1, count: -1, pressed: false, ready: false, text: '' };
  private depth = 0;
  visible = true;

  constructor(
    private readonly scene: Phaser.Scene,
    c: Circle,
    opts: RoundButtonOpts = {},
  ) {
    this.c = { ...c };
    this.px = opts.px ?? 1;
    const ts = opts.ts ?? 2;
    this.bgColor = opts.color ?? 0x2a2230;
    const { x, y, r } = this.c;
    this.bg = scene.add.image(x, y, buttonTex(scene, r, this.bgColor, false, this.px));
    this.pie = scene.add.image(x, y, pieSheet(scene, r - Math.round(2 * this.px)), '0').setVisible(false);
    this.grey = scene.add.image(x, y, discTex(scene, r - Math.round(2 * this.px), 0x1a1a1a, 0.55)).setVisible(false);
    if (opts.charge) {
      this.ringChargeKey = ringSheet(scene, r, RING_CHARGE, this.px);
      this.ringReadyKey = ringSheet(scene, r, RING_READY, this.px);
      this.ring = scene.add.image(x, y, this.ringChargeKey, '0');
    }
    this.text = scene.add.bitmapText(x, y, FONT_KEY, '', 7).setOrigin(0.5).setScale(ts + Math.max(1, Math.round(ts / 2))).setTint(0xffffff);
    if (opts.count) this.countText = scene.add.bitmapText(x + r * 0.55, y + r * 0.55, FONT_KEY, '', 7).setOrigin(0.5).setScale(ts).setTint(0xffe8a0);
    if (opts.hint) this.hint = scene.add.bitmapText(x - r * 0.7, y - r * 0.7, FONT_KEY, fontText(opts.hint), 7).setOrigin(0.5).setScale(Math.max(1, ts - 1)).setTint(0xc8c0d0);
    if (opts.label) this.label = scene.add.bitmapText(x, y, FONT_KEY, fontText(opts.label), 7).setOrigin(0.5).setScale(labelScale(opts.label, r, ts)).setTint(0xffffff);
  }

  setColor(color: number): void {
    if (color === this.bgColor) return;
    this.bgColor = color;
    this.bg.setTexture(buttonTex(this.scene, this.c.r, color, this.last.pressed, this.px));
  }

  setLabel(text: string): void {
    this.label?.setText(fontText(text));
  }

  setIcon(key: string | undefined): void {
    if ((key ?? '') === this.iconKey) return;
    this.iconKey = key ?? '';
    if (!key) {
      this.icon?.setVisible(false);
      return;
    }
    if (!this.icon) this.icon = this.scene.add.image(this.c.x, this.c.y, key);
    this.icon.setTexture(key).setVisible(this.visible);
    // ícone 48x48 em escala inteira de canvas (pixel nítido), ~72% do diâmetro
    const s = (this.c.r * 2 * 0.72) / 48;
    this.icon.setScale(s >= 1 ? Math.round(s) : 0.5 * Math.max(1, Math.round(s * 2)));
    this.setDepth(this.depth);
  }

  setDepth(d: number): void {
    this.depth = d;
    this.bg.setDepth(d);
    this.icon?.setDepth(d + 0.5);
    this.grey.setDepth(d + 0.55);
    this.pie.setDepth(d + 0.6);
    this.ring?.setDepth(d + 0.7);
    this.text.setDepth(d + 0.8);
    this.countText?.setDepth(d + 0.9);
    this.hint?.setDepth(d + 0.9);
    this.label?.setDepth(d + 0.9);
  }

  /** Muda o botão de lugar (modo de ajuste). */
  moveTo(x: number, y: number): void {
    const dx = x - this.c.x, dy = y - this.c.y;
    if (dx === 0 && dy === 0) return;
    this.c.x = x;
    this.c.y = y;
    for (const o of [this.bg, this.pie, this.grey, this.ring, this.icon, this.text, this.countText, this.hint, this.label]) if (o) o.setPosition(o.x + dx, o.y + dy);
  }

  update(s: ButtonState, now: number): void {
    if ((s.pressed === true) !== this.last.pressed) {
      this.last.pressed = s.pressed === true;
      this.bg.setTexture(buttonTex(this.scene, this.c.r, this.bgColor, this.last.pressed, this.px));
    }
    // recarga em pizza: o total é o maior valor visto desde que começou
    if (s.cd > this.last.cd && s.cd > 0) this.cdTotal = Math.max(s.cd, this.last.cd > 0 ? this.cdTotal : 0);
    if (s.cd === 0) this.cdTotal = 0;
    if (s.cd !== this.last.cd || s.gcd !== this.last.gcd || s.disabled !== this.last.disabled) {
      this.last.cd = s.cd;
      this.last.gcd = s.gcd;
      this.last.disabled = s.disabled;
      let frac = 0;
      if (s.cd > 0 && this.cdTotal > 0) frac = s.cd / this.cdTotal;
      else if (s.gcd > 0) frac = Math.min(1, s.gcd / 20);
      if (frac > 0) this.pie.setFrame(pieFrame(frac));
      this.pie.setVisible(this.visible && frac > 0);
      this.grey.setVisible(this.visible && s.disabled);
      const t = s.cd > 0 ? String(Math.ceil(s.cd / 20)) : '';
      if (t !== this.last.text) {
        this.last.text = t;
        this.text.setText(t);
      }
      this.icon?.setTint(s.disabled ? 0x777777 : 0xffffff);
    }
    if (this.ring && s.charge !== undefined) {
      const ch = Math.round(s.charge * 100);
      const ready = s.charge >= 1;
      if (ch !== this.last.charge || ready !== this.last.ready) {
        this.last.charge = ch;
        this.last.ready = ready;
        this.ring.setTexture(ready ? this.ringReadyKey : this.ringChargeKey, ringFrame(Math.max(0.001, Math.min(1, s.charge))));
      }
      // pronto: brilha pulsando
      if (ready) this.ring.setAlpha(0.65 + 0.35 * Math.sin(now / 140));
      else if (this.ring.alpha !== 1) this.ring.setAlpha(1);
    }
    if (this.countText && s.count !== undefined && s.count !== this.last.count) {
      this.last.count = s.count;
      this.countText.setText(fontText(`x${s.count}`));
    }
  }

  setVisible(v: boolean): void {
    if (v === this.visible) return;
    this.visible = v;
    this.bg.setVisible(v);
    this.pie.setVisible(v && (this.last.cd > 0 || this.last.gcd > 0));
    this.grey.setVisible(v && this.last.disabled);
    this.ring?.setVisible(v);
    this.icon?.setVisible(v && this.iconKey !== '');
    this.text.setVisible(v);
    this.countText?.setVisible(v);
    this.hint?.setVisible(v);
    this.label?.setVisible(v);
  }

  /** Destaque do modo de ajuste (meio transparente quando não está sendo arrastado). */
  setAlpha(a: number): void {
    for (const o of [this.bg, this.icon, this.ring, this.label]) o?.setAlpha(a);
  }
}

/** Escala do rótulo: a maior inteira (até ts) em que ele cabe em ~95% do diâmetro. */
function labelScale(label: string, r: number, ts: number): number {
  const w = fontText(label).length * 7;
  for (let s = ts; s >= 1; s--) if (w * s <= r * 1.9) return s;
  return 1;
}
