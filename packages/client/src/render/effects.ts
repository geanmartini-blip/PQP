/**
 * Efeitos com pool (nada é criado por golpe depois do aquecimento): números de dano e cura,
 * faíscas e efeitos de uma vez, e balões de fala.
 */
import * as Phaser from 'phaser';
import { FONT_KEY, sheetMeta } from '../art/index';
import { fontText } from '../art/fx';
import { DEPTH } from './depth';
import { clampLines } from './viewRules';

// SUGESTÃO (revisão visual): os números sobem 30 px em 600 ms; o crítico sai uma escala inteira
// maior; no máximo 8 números vivos; dano no mesmo alvo em até 200 ms vira um número só.
export const FLOAT_MS = 600;
const FLOAT_RISE_PX = 30;
export const FLOAT_MAX_LIVE = 8;
export const FLOAT_MERGE_MS = 200;

interface Floater {
  t: Phaser.GameObjects.BitmapText;
  born: number;
  x: number;
  y: number;
  scale: number;
  active: boolean;
  /** número somável: chave (alvo e cor), valor e prefixo */
  key: string;
  value: number;
  prefix: string;
}

/** Números que sobem e somem (dano, cura, "LENTO"). */
export class FloatTextPool {
  private items: Floater[] = [];
  private next = 0;
  /** escala inteira dos números (a fonte de pixel tem contorno; ver layout.worldTextScale) */
  private base = 1;

  setScale(s: number): void {
    this.base = Math.max(1, Math.round(s));
  }

  constructor(
    private readonly scene: Phaser.Scene,
    size = FLOAT_MAX_LIVE,
  ) {
    for (let i = 0; i < size; i++) {
      const t = scene.add.bitmapText(0, 0, FONT_KEY, '', 7).setOrigin(0.5, 1).setDepth(DEPTH.text).setVisible(false);
      this.items.push({ t, born: 0, x: 0, y: 0, scale: 1, active: false, key: '', value: 0, prefix: '' });
    }
  }

  /**
   * Número somável: se o mesmo `key` (alvo e tipo) nasceu há menos de 200 ms, soma nele em vez de
   * criar outro (golpes seguidos e dano em área não viram uma nuvem de números).
   */
  spawnNum(key: string, x: number, y: number, value: number, color: number, now: number, crit = false, prefix = ''): void {
    const f = this.items.find((it) => it.active && it.key === key && now - it.born < FLOAT_MERGE_MS);
    if (f) {
      f.value += value;
      f.t.setText(fontText(`${f.prefix}${Math.round(f.value)}`));
      if (crit && f.scale === this.base) {
        f.scale = this.base + 1;
        f.t.setScale(f.scale).setTint(color);
      }
      return;
    }
    const n = this.take(x, y, `${prefix}${Math.round(value)}`, color, now, crit);
    n.key = key;
    n.value = value;
    n.prefix = prefix;
  }

  spawn(x: number, y: number, text: string, color: number, now: number, crit = false): void {
    this.take(x, y, text, color, now, crit);
  }

  private take(x: number, y: number, text: string, color: number, now: number, crit: boolean): Floater {
    // o mais velho dá lugar quando o pool enche
    const f = this.items[this.next]!;
    this.next = (this.next + 1) % this.items.length;
    f.key = '';
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
    return f;
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

// SUGESTÃO (revisão visual): a fala no balão fica 2,5 s (mais 25 ms por letra, até 3,5 s); balão
// de até 120 px de CSS de largura, fonte de 11 px, no máximo 2 linhas (o resto vira "…"); no máximo
// 2 balões de inimigo ao mesmo tempo; um balão por pessoa.
export const SAY_BASE_MS = 2500;
const SAY_PER_CHAR_MS = 25;
export const SAY_MAX_MS = 3500;
export const BALLOON_MAX_LINES = 2;
export const BALLOON_WRAP_CSS = 120;
export const MAX_ENEMY_BALLOONS = 2;

interface Balloon {
  t: Phaser.GameObjects.Text;
  until: number;
  ownerId: number;
  active: boolean;
  enemy: boolean;
  text: string;
}

/** Balões de fala ('say') presos na cabeça de quem fala. */
export class Balloons {
  private items: Balloon[] = [];

  /**
   * Texto nítido na densidade da tela: o balão fica no mundo (com o zoom da câmera), então a fonte
   * vai em px de mundo (~11 px de CSS) e o texto é rasterizado na resolução do zoom.
   */
  setDensity(px: number, zoom: number): void {
    const z = Math.max(1, zoom);
    const size = Math.max(7, Math.round((11 * px) / z));
    for (const b of this.items) {
      b.t.setResolution(z);
      b.t.setFontSize(size);
      b.t.setPadding(Math.round((4 * px) / z), Math.round((2 * px) / z));
      b.t.setWordWrapWidth(Math.round((BALLOON_WRAP_CSS * px) / z), true);
      if (b.active) b.t.setText(this.fit(b.t, b.text));
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
          padding: { x: 4, y: 2 },
          wordWrap: { width: BALLOON_WRAP_CSS, useAdvancedWrap: true },
          align: 'center',
        })
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.text + 10)
        .setVisible(false);
      this.items.push({ t, until: 0, ownerId: -1, active: false, enemy: false, text: '' });
    }
  }

  private fit(t: Phaser.GameObjects.Text, text: string): string {
    return clampLines(text, BALLOON_MAX_LINES, (s) => t.getWrappedText(s));
  }

  /** `enemy`: fala de inimigo (no máximo 2 ao mesmo tempo; a terceira não aparece). */
  say(ownerId: number, text: string, now: number, enemy = false): void {
    // a mesma pessoa troca a fala; senão usa o balão livre (ou o que acaba primeiro)
    let b = this.items.find((x) => x.active && x.ownerId === ownerId);
    if (!b && enemy && this.items.filter((x) => x.active && x.enemy).length >= MAX_ENEMY_BALLOONS) return;
    b ??= this.items.find((x) => !x.active);
    if (!b) b = this.items.reduce((a, c) => (c.until < a.until ? c : a));
    b.ownerId = ownerId;
    b.active = true;
    b.enemy = enemy;
    b.text = text;
    b.until = now + Math.min(SAY_MAX_MS, SAY_BASE_MS + text.length * SAY_PER_CHAR_MS);
    b.t.setText(this.fit(b.t, text)).setVisible(true);
  }

  /**
   * `pos(id)` devolve o topo da cabeça em px, ou null se a entidade sumiu. `self` é o topo da cabeça
   * do próprio jogador: o balão de quem está colado nele sobe acima da cabeça dele (não cobre o boneco).
   */
  update(now: number, pos: (id: number) => { x: number; y: number; visible: boolean } | null, self?: { id: number; x: number; y: number; near: number }): void {
    for (const b of this.items) {
      if (!b.active) continue;
      const p = pos(b.ownerId);
      if (now > b.until || !p) {
        b.active = false;
        b.t.setVisible(false);
        continue;
      }
      let y = p.y - 4;
      if (self && b.ownerId !== self.id && Math.abs(p.x - self.x) < self.near && Math.abs(p.y - self.y) < self.near) y = Math.min(y, self.y - 12);
      b.t.setPosition(Math.round(p.x), Math.round(y));
      b.t.setVisible(p.visible);
    }
  }
}
