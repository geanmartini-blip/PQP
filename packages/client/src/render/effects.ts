/**
 * Efeitos com pool (nada é criado por golpe depois do aquecimento): números de dano e cura,
 * faíscas e efeitos de uma vez, e balões de fala.
 */
import * as Phaser from 'phaser';
import { FONT_KEY, sheetMeta } from '../art/index';
import { fontText } from '../art/fx';
import { DEPTH } from './depth';

// SUGESTÃO: duração e subida dos números; o crítico sai uma escala inteira maior.
const FLOAT_MS = 750;
const FLOAT_RISE_PX = 22;

interface Floater {
  t: Phaser.GameObjects.BitmapText;
  born: number;
  x: number;
  y: number;
  scale: number;
  active: boolean;
}

/** Números que sobem e somem (dano, cura, XP, "LENTO"). */
export class FloatTextPool {
  private items: Floater[] = [];
  private next = 0;
  /** escala inteira dos números (a fonte de pixel tem contorno; ver layout.worldTextScale) */
  private base = 2;

  setScale(s: number): void {
    this.base = Math.max(1, Math.round(s));
  }

  constructor(
    private readonly scene: Phaser.Scene,
    size = 40,
  ) {
    for (let i = 0; i < size; i++) {
      const t = scene.add.bitmapText(0, 0, FONT_KEY, '', 7).setOrigin(0.5, 1).setDepth(DEPTH.text).setVisible(false);
      this.items.push({ t, born: 0, x: 0, y: 0, scale: 1, active: false });
    }
  }

  spawn(x: number, y: number, text: string, color: number, now: number, crit = false): void {
    // o mais velho dá lugar quando o pool enche
    const f = this.items[this.next]!;
    this.next = (this.next + 1) % this.items.length;
    f.t.setText(fontText(text));
    f.t.setTint(color);
    f.scale = crit ? this.base + 1 : this.base;
    f.t.setScale(f.scale);
    // espalha um pouco para números seguidos não ficarem um em cima do outro
    f.x = x + ((now * 7) % 13) - 6;
    f.y = y;
    f.born = now;
    f.active = true;
    f.t.setVisible(true).setAlpha(1).setPosition(Math.round(f.x), Math.round(f.y));
  }

  update(now: number): void {
    for (const f of this.items) {
      if (!f.active) continue;
      const u = (now - f.born) / FLOAT_MS;
      if (u >= 1) {
        f.active = false;
        f.t.setVisible(false);
        continue;
      }
      const rise = FLOAT_RISE_PX * (1 - (1 - u) * (1 - u));
      f.t.setPosition(Math.round(f.x), Math.round(f.y - rise));
      f.t.setAlpha(u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4);
    }
  }
}

/**
 * Pool de Sprites para avisos no chão e zonas: soltar só esconde; pegar troca a textura e zera o
 * estado (animação, tinta, giro). Nada é criado nem destruído no meio do combate.
 */
export class ImagePool {
  private free: Phaser.GameObjects.Sprite[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  get(key: string, frame: string, depth: number): Phaser.GameObjects.Sprite {
    const s = this.free.pop() ?? this.scene.add.sprite(0, 0, key, frame);
    s.anims.stop();
    s.setTexture(key, frame).clearTint().setRotation(0).setScale(1).setAlpha(1).setDepth(depth).setVisible(true).setActive(true);
    return s;
  }

  release(s: Phaser.GameObjects.Sprite): void {
    s.anims.stop();
    s.setVisible(false).setActive(false);
    this.free.push(s);
  }
}

/** Efeitos de uma vez (faísca, golpe, cura): sprites reaproveitados. */
export class FxPool {
  private free: Phaser.GameObjects.Sprite[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  play(key: string, x: number, y: number, depth: number = DEPTH.overlay - 10, scale = 1): void {
    const animKey = `${key}:play:0`;
    if (!this.scene.anims.exists(animKey)) return;
    const s = this.free.pop() ?? this.make();
    const fx = sheetMeta(key)?.fx;
    s.setTexture(key, '0').setOrigin(fx?.ox ?? 0.5, fx?.oy ?? 0.5).setPosition(x, y).setDepth(depth).setScale(scale).setVisible(true).setActive(true);
    s.play(animKey);
  }

  private make(): Phaser.GameObjects.Sprite {
    const s = this.scene.add.sprite(0, 0, 'fx_faisca', '0');
    s.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      s.setVisible(false).setActive(false);
      this.free.push(s);
    });
    return s;
  }
}

// SUGESTÃO: fala no balão fica 4 s (mais 40 ms por letra, até 7 s).
const SAY_BASE_MS = 4000;
const SAY_PER_CHAR_MS = 40;
const SAY_MAX_MS = 7000;

interface Balloon {
  t: Phaser.GameObjects.Text;
  until: number;
  ownerId: number;
  active: boolean;
}

/** Balões de fala ('say') presos na cabeça de quem fala. */
export class Balloons {
  private items: Balloon[] = [];

  /**
   * Texto nítido na densidade da tela: o balão fica no mundo (com o zoom da câmera), então a fonte
   * vai em px de mundo (~12 px de CSS) e o texto é rasterizado na resolução do zoom.
   */
  setDensity(px: number, zoom: number): void {
    const z = Math.max(1, zoom);
    const size = Math.max(8, Math.round((12 * px) / z));
    for (const b of this.items) {
      b.t.setResolution(z);
      b.t.setFontSize(size);
      b.t.setPadding(Math.round((5 * px) / z), Math.round((3 * px) / z));
      b.t.setWordWrapWidth(Math.round((170 * px) / z), true);
    }
  }

  constructor(
    private readonly scene: Phaser.Scene,
    size = 6,
  ) {
    for (let i = 0; i < size; i++) {
      const t = scene.add
        .text(0, 0, '', {
          fontFamily: '"Trebuchet MS", Verdana, sans-serif',
          fontSize: '11px',
          color: '#1a1018',
          backgroundColor: '#fff6e0',
          padding: { x: 5, y: 3 },
          wordWrap: { width: 170, useAdvancedWrap: true },
          align: 'center',
        })
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.text + 10)
        .setVisible(false);
      this.items.push({ t, until: 0, ownerId: -1, active: false });
    }
  }

  say(ownerId: number, text: string, now: number): void {
    // a mesma pessoa troca a fala; senão usa o balão livre (ou o que acaba primeiro)
    let b = this.items.find((x) => x.active && x.ownerId === ownerId) ?? this.items.find((x) => !x.active);
    if (!b) b = this.items.reduce((a, c) => (c.until < a.until ? c : a));
    b.ownerId = ownerId;
    b.active = true;
    b.until = now + Math.min(SAY_MAX_MS, SAY_BASE_MS + text.length * SAY_PER_CHAR_MS);
    b.t.setText(text).setVisible(true);
  }

  /** `pos(id)` devolve o topo da cabeça em px, ou null se a entidade sumiu. */
  update(now: number, pos: (id: number) => { x: number; y: number; visible: boolean } | null): void {
    for (const b of this.items) {
      if (!b.active) continue;
      const p = pos(b.ownerId);
      if (now > b.until || !p) {
        b.active = false;
        b.t.setVisible(false);
        continue;
      }
      b.t.setPosition(Math.round(p.x), Math.round(p.y - 4));
      b.t.setVisible(p.visible);
    }
  }
}
