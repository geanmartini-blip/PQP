/**
 * Botão redondo do HUD: ícone da arte, recarga em pizza com os segundos, cinza sem recurso ou sem
 * poder agir, anel de carga (Especial) e contador (item). Só redesenha quando o valor muda.
 */
import * as Phaser from 'phaser';
import { FONT_KEY } from '../art/index';
import { fontText } from '../art/fx';
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

export class RoundButton {
  readonly c: Circle;
  private bg: Phaser.GameObjects.Graphics;
  private pie: Phaser.GameObjects.Graphics;
  private ring?: Phaser.GameObjects.Graphics;
  private icon?: Phaser.GameObjects.Image;
  private text: Phaser.GameObjects.BitmapText;
  private countText?: Phaser.GameObjects.BitmapText;
  private hint?: Phaser.GameObjects.BitmapText;
  private label?: Phaser.GameObjects.BitmapText;
  private iconKey = '';
  private cdTotal = 0;
  private last = { cd: -1, gcd: -1, disabled: false, charge: -1, count: -1, pressed: false, ready: false };
  visible = true;

  constructor(
    private readonly scene: Phaser.Scene,
    c: Circle,
    opts: { charge?: boolean; count?: boolean; hint?: string; label?: string; color?: number } = {},
  ) {
    this.c = c;
    this.bg = scene.add.graphics();
    this.drawBg(false, opts.color ?? 0x2a2230);
    this.pie = scene.add.graphics();
    if (opts.charge) this.ring = scene.add.graphics();
    this.text = scene.add.bitmapText(c.x, c.y, FONT_KEY, '', 7).setOrigin(0.5).setScale(2).setTint(0xffffff);
    if (opts.count) this.countText = scene.add.bitmapText(c.x + c.r * 0.55, c.y + c.r * 0.55, FONT_KEY, '', 7).setOrigin(0.5).setScale(2).setTint(0xffe8a0);
    if (opts.hint) this.hint = scene.add.bitmapText(c.x - c.r * 0.7, c.y - c.r * 0.7, FONT_KEY, fontText(opts.hint), 7).setOrigin(0.5).setTint(0xc8c0d0);
    if (opts.label) this.label = scene.add.bitmapText(c.x, c.y, FONT_KEY, fontText(opts.label), 7).setOrigin(0.5).setScale(c.r > 26 ? 2 : 1.5).setTint(0xffffff);
  }

  private bgColor = 0x2a2230;

  private drawBg(pressed: boolean, color = this.bgColor): void {
    this.bgColor = color;
    const { x, y, r } = this.c;
    const g = this.bg;
    g.clear();
    g.fillStyle(0x000000, 0.35);
    g.fillCircle(x + 2, y + 3, r);
    g.fillStyle(pressed ? 0x4a3a52 : color, 0.88);
    g.fillCircle(x, y, r);
    g.lineStyle(3, 0x140c16, 1);
    g.strokeCircle(x, y, r);
    g.lineStyle(1, 0x8a7a92, 0.9);
    g.strokeCircle(x, y, r - 3);
  }

  setColor(color: number): void {
    if (color !== this.bgColor) this.drawBg(this.last.pressed, color);
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
    const s = (this.c.r * 2 * 0.72) / 48;
    this.icon.setScale(Math.round(s * 4) / 4);
    // ícone por baixo da pizza e do texto
    this.icon.setDepth(this.bg.depth + 0.5);
    this.pie.setDepth(this.bg.depth + 0.6);
    this.ring?.setDepth(this.bg.depth + 0.7);
    this.text.setDepth(this.bg.depth + 0.8);
  }

  setDepth(d: number): void {
    this.bg.setDepth(d);
    this.icon?.setDepth(d + 0.5);
    this.pie.setDepth(d + 0.6);
    this.ring?.setDepth(d + 0.7);
    this.text.setDepth(d + 0.8);
    this.countText?.setDepth(d + 0.9);
    this.hint?.setDepth(d + 0.9);
    this.label?.setDepth(d + 0.9);
  }

  update(s: ButtonState, now: number): void {
    const { x, y, r } = this.c;
    if (s.pressed !== this.last.pressed) {
      this.last.pressed = s.pressed === true;
      this.drawBg(this.last.pressed);
    }
    // recarga em pizza: o total é o maior valor visto desde que começou
    if (s.cd > this.last.cd && s.cd > 0) this.cdTotal = Math.max(s.cd, this.last.cd > 0 ? this.cdTotal : 0);
    if (s.cd === 0) this.cdTotal = 0;
    const cdChanged = s.cd !== this.last.cd || s.gcd !== this.last.gcd || s.disabled !== this.last.disabled;
    if (cdChanged) {
      this.last.cd = s.cd;
      this.last.gcd = s.gcd;
      this.last.disabled = s.disabled;
      const g = this.pie;
      g.clear();
      let frac = 0;
      if (s.cd > 0 && this.cdTotal > 0) frac = s.cd / this.cdTotal;
      else if (s.gcd > 0) frac = Math.min(1, s.gcd / 20);
      if (frac > 0) {
        g.fillStyle(0x000000, 0.6);
        g.slice(x, y, r - 2, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2, false);
        g.fillPath();
      }
      if (s.disabled) {
        g.fillStyle(0x1a1a1a, 0.55);
        g.fillCircle(x, y, r - 2);
      }
      this.text.setText(s.cd > 0 ? String(Math.ceil(s.cd / 20)) : '');
      this.icon?.setTint(s.disabled ? 0x777777 : 0xffffff);
    }
    if (this.ring && s.charge !== undefined) {
      const ch = Math.round(s.charge * 100);
      const ready = s.charge >= 1;
      if (ch !== this.last.charge || ready !== this.last.ready) {
        this.last.charge = ch;
        this.last.ready = ready;
        const g = this.ring;
        g.clear();
        g.lineStyle(5, 0x140c16, 0.9);
        g.strokeCircle(x, y, r + 3);
        g.lineStyle(4, ready ? RING_READY : RING_CHARGE, 1);
        g.beginPath();
        g.arc(x, y, r + 3, -Math.PI / 2, -Math.PI / 2 + Math.max(0.001, s.charge) * Math.PI * 2, false);
        g.strokePath();
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
    this.pie.setVisible(v);
    this.ring?.setVisible(v);
    this.icon?.setVisible(v && this.iconKey !== '');
    this.text.setVisible(v);
    this.countText?.setVisible(v);
    this.hint?.setVisible(v);
    this.label?.setVisible(v);
  }
}
