/**
 * HUD em coordenadas de tela, por cima do mundo: barras, alvo, chefe, botões em arco, joystick
 * flutuante, dicas do primeiro minuto, avisos de conexão e de caído, e o teclado para testar no PC.
 *
 * Toques (multitoque: joystick e botões ao mesmo tempo):
 * - metade esquerda, fora dos botões: joystick que nasce onde o polegar toca; toque rápido vale
 *   como toque no mundo;
 * - botões: habilidade dispara ao encostar; área no alvo (e campo lançado longe) dispara ao soltar,
 *   e arrastar posiciona a área com a guia de alcance;
 * - resto da tela: toque no mundo (inimigo troca o alvo, NPC conversa, chão leva até lá).
 */
import * as Phaser from 'phaser';
import { getData, type Ability } from '@pqp/shared';
import { MAX_REWIND_MS } from '@pqp/shared/net';
import { FONT_KEY } from '../art/index';
import { fontText } from '../art/fx';
import { FL } from '../game/clientWorld';
import { getRuntime, type Runtime } from '../game/runtime';
import { ColyseusTransport } from '../net/colyseusTransport';
import { LaggedTransport } from '../net/transport';
import { isTap, JOY_RADIUS_PX, keysVector, newJoystick, updateJoystick, type JoyState } from '../input/joystick';
import { RoundButton } from '../ui/buttons';
import { hitCircle, hudLayout, type Circle, type HudLayout } from '../ui/layout';
import { TIP_TEXT, type TipId } from '../ui/tips';
import type { WorldScene } from './WorldScene';

type Slot = 1 | 2 | 3 | 'especial';
type BtnId = 'b1' | 'b2' | 'b3' | 'especial' | 'item' | 'auto' | 'ala' | 'falar';

interface Track {
  mode: 'joy' | 'btn' | 'tap';
  btn?: BtnId;
  slot?: Slot;
  ability?: Ability;
  x0: number;
  y0: number;
  t0: number;
  moved: number;
}

// SUGESTÃO: arrasto máximo do botão de área (px × escala da interface) e arrasto mínimo para valer.
const DRAG_MAX_PX = 90;
const DRAG_MIN_PX = 14;
// SUGESTÃO: as duas alas do personagem template da Fase 1.
const TEMPLATE_ALAS = ['peao_brabo', 'idol'] as const;
// SUGESTÃO: cores dos recursos.
const RES_COLOR: Record<string, number> = { folego: 0xf0c040, municao: 0xf09040, espirito: 0x60e0b0, bateria: 0x40c8f0, foco: 0xc080ff };

const SLOT_OF: Record<'b1' | 'b2' | 'b3' | 'especial', Slot> = { b1: 1, b2: 2, b3: 3, especial: 'especial' };
const HUD_INDEX: Record<'b1' | 'b2' | 'b3' | 'especial', number> = { b1: 0, b2: 1, b3: 2, especial: 3 };

export class HudScene extends Phaser.Scene {
  private rt!: Runtime;
  private world!: WorldScene;
  private L!: HudLayout;
  private buttons = new Map<BtnId, RoundButton>();
  private tracks = new Map<number, Track>();
  private joy: JoyState | null = null;
  private joyPointer = -1;
  private joyBase!: Phaser.GameObjects.Graphics;
  private joyKnob!: Phaser.GameObjects.Graphics;
  private g!: Phaser.GameObjects.Graphics; // barras (redesenhadas quando mudam)
  private gSig = '';
  private texts: Record<string, Phaser.GameObjects.BitmapText> = {};
  private tipTexts = new Map<TipId, Phaser.GameObjects.Text>();
  private targetPortrait!: Phaser.GameObjects.Image;
  private overlay!: Phaser.GameObjects.Rectangle;
  private bigText!: Phaser.GameObjects.Text;
  private smallText!: Phaser.GameObjects.Text;
  private offlineBtn!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private noticeText!: Phaser.GameObjects.Text;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private touch = false;
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;
  private talkTarget: { id: number; name: string } | undefined;
  private shownNotice = -1;
  private readonly pressed = new Set<BtnId>();
  private downedText!: Phaser.GameObjects.Text;
  private downedShown = -1;

  constructor() {
    super('HudScene');
  }

  create(): void {
    this.rt = getRuntime();
    this.world = this.scene.get('WorldScene') as WorldScene;
    this.touch = this.sys.game.device.input.touch;
    this.L = hudLayout(this.scale.width, this.scale.height, safeArea('bottom'), safeArea('top'));
    // multitoque: joystick e botões juntos (a cena reinicia no resize; não soma ponteiros de novo)
    if (this.input.manager.pointersTotal < 5) this.input.addPointer(5 - this.input.manager.pointersTotal);
    this.build();
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, (p: Phaser.Input.Pointer) => this.onUp(p));
    this.setupKeyboard();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    // a aba perdeu o foco (ligação, notificação): solta o joystick e os botões
    this.game.events.on(Phaser.Core.Events.BLUR, this.releaseAll, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(Phaser.Core.Events.BLUR, this.releaseAll, this));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this));
  }

  private releaseAll(): void {
    this.tracks.clear();
    this.joy = null;
    this.joyPointer = -1;
    this.rt.gc.intent.x = 0;
    this.rt.gc.intent.y = 0;
    this.world.setGuide(null);
  }

  private onResize(): void {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      this.rt.gc.intent.x = 0;
      this.rt.gc.intent.y = 0;
      this.world.setGuide(null);
      this.scene.restart();
    }, 150);
  }

  // ---------------------------------------------------------------------------
  // montagem

  private build(): void {
    const L = this.L;
    const W = this.scale.width, H = this.scale.height;
    this.g = this.add.graphics().setDepth(10);
    const bt = (x: number, y: number, s = 1, tint = 0xffffff) => this.add.bitmapText(x, y, FONT_KEY, '', 7).setScale(s).setTint(tint).setDepth(12);
    // quadro do jogador
    this.texts['nome'] = bt(L.player.x + 6, L.player.y + 4, 1, 0xffe8a0);
    this.texts['vida'] = bt(L.player.x + 8, L.player.y + 18, 1);
    this.texts['nivel'] = bt(L.player.x + 6, L.player.y + 42, 1, 0xd8c8ff);
    // quadro do alvo
    this.targetPortrait = this.add.image(L.target.x + 20, L.target.y + 22, '__DEFAULT').setDepth(12).setVisible(false);
    this.texts['alvoNome'] = bt(L.target.x + 40, L.target.y + 6, 1, 0xffb0a0);
    this.texts['alvoNivel'] = bt(L.target.x + 40, L.target.y + 34, 1, 0xc8c0d0);
    // chefe
    this.texts['chefe'] = bt(W / 2, L.boss.y - 2, 2, 0xffd060).setOrigin(0.5, 1);
    // caído
    this.downedText = this.add
      .text(W / 2, H * 0.36, '', {
        fontFamily: '"Trebuchet MS", Verdana, sans-serif',
        fontSize: `${Math.round(17 * L.ui)}px`,
        color: '#ffffff',
        backgroundColor: '#3a1418dd',
        padding: { x: 12, y: 8 },
        align: 'center',
        wordWrap: { width: Math.round(W * 0.86) },
      })
      .setOrigin(0.5)
      .setDepth(60)
      .setVisible(false);
    this.texts['debug'] = bt(8, L.player.y + 66 * L.ui, 1, 0x9ad0ff);

    // botões
    const hint = (k: string) => (this.touch ? undefined : k);
    const mk = (id: BtnId, c: Circle, o: ConstructorParameters<typeof RoundButton>[2] = {}) => {
      const b = new RoundButton(this, c, o);
      b.setDepth(20);
      this.buttons.set(id, b);
      return b;
    };
    mk('b1', L.b1, { ...opt(hint('1')) });
    mk('b2', L.b2, { ...opt(hint('2')) });
    mk('b3', L.b3, { ...opt(hint('3')) });
    mk('especial', L.especial, { charge: true, ...opt(hint('ESP')) });
    mk('item', L.item, { count: true, ...opt(hint('Q')) });
    mk('auto', L.auto, { label: 'AUTO', color: 0x22303a });
    mk('ala', L.ala, { label: 'ALA', color: 0x30223a });
    mk('falar', L.falar, { label: 'FALAR', color: 0x3a3020, ...opt(hint('E')) }).setVisible(false);
    this.texts['falarNome'] = bt(L.falar.x, L.falar.y - L.falar.r - 4, 1, 0xffe8a0).setOrigin(0.5, 1).setDepth(21);

    // joystick
    this.joyBase = this.add.graphics().setDepth(30).setVisible(false);
    this.joyKnob = this.add.graphics().setDepth(31).setVisible(false);
    this.joyBase.fillStyle(0x000000, 0.25).fillCircle(0, 0, JOY_RADIUS_PX).lineStyle(2, 0xffffff, 0.45).strokeCircle(0, 0, JOY_RADIUS_PX);
    this.joyKnob.fillStyle(0xffffff, 0.55).fillCircle(0, 0, 22).lineStyle(2, 0x140c16, 0.8).strokeCircle(0, 0, 22);

    // dicas
    const tipStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: '"Trebuchet MS", Verdana, sans-serif',
      fontSize: `${Math.round(14 * L.ui)}px`,
      color: '#fff6e0',
      backgroundColor: '#140c16cc',
      padding: { x: 8, y: 5 },
      align: 'center',
      wordWrap: { width: Math.round(W * 0.42), useAdvancedWrap: true },
    };
    const tipPos: Record<TipId, [number, number]> = {
      andar: [W * 0.25, H * 0.7],
      mira: [Math.min(W - 90, L.b2.x), L.item.y - L.item.r - 46 * L.ui],
      alvo: [W / 2, H * 0.3],
      estilo: [W / 2, H * 0.22],
    };
    for (const id of Object.keys(TIP_TEXT) as TipId[]) {
      const [x, y] = tipPos[id];
      const t = this.add.text(x, y, TIP_TEXT[id], tipStyle).setOrigin(0.5).setDepth(40).setVisible(false);
      if (id === 'estilo' || id === 'alvo') t.setWordWrapWidth(Math.round(W * 0.8));
      this.tipTexts.set(id, t);
    }

    // conexão e avisos
    this.overlay = this.add.rectangle(0, 0, W, H, 0x0d0b10, 0.92).setOrigin(0).setDepth(100);
    const big: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: '"Trebuchet MS", Verdana, sans-serif', fontSize: `${Math.round(22 * L.ui)}px`, color: '#ffe8a0', align: 'center' };
    const small: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: '"Trebuchet MS", Verdana, sans-serif', fontSize: `${Math.round(13 * L.ui)}px`, color: '#c8c0d0', align: 'center', wordWrap: { width: W * 0.86 } };
    this.bigText = this.add.text(W / 2, H * 0.4, 'Ponte que Partiu', big).setOrigin(0.5).setDepth(101);
    this.smallText = this.add.text(W / 2, H * 0.4 + 40 * L.ui, '', small).setOrigin(0.5, 0).setDepth(101);
    this.offlineBtn = this.add
      .text(W / 2, H * 0.62, 'Jogar offline (servidor no aparelho)', { ...small, color: '#140c16', backgroundColor: '#ffe8a0', padding: { x: 12, y: 10 } })
      .setOrigin(0.5)
      .setDepth(102)
      .setVisible(false);
    this.banner = this.add
      .text(W / 2, L.boss.y + 26, '', { ...small, color: '#ffe8a0', backgroundColor: '#3a1a1acc', padding: { x: 8, y: 4 } })
      .setOrigin(0.5, 0)
      .setDepth(90)
      .setVisible(false);
    this.noticeText = this.add
      .text(W / 2, H * 0.34, '', { ...big, fontSize: `${Math.round(18 * L.ui)}px`, backgroundColor: '#140c16aa', padding: { x: 10, y: 6 } })
      .setOrigin(0.5)
      .setDepth(91)
      .setVisible(false);
  }

  private setupKeyboard(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = kb.addKeys({
      w: K.W,
      a: K.A,
      s: K.S,
      d: K.D,
      up: K.UP,
      left: K.LEFT,
      down: K.DOWN,
      right: K.RIGHT,
    }) as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture([K.TAB, K.SPACE, K.UP, K.DOWN, K.LEFT, K.RIGHT]);
    kb.on('keydown', (ev: KeyboardEvent) => {
      if (ev.repeat || !this.rt.gc.welcomed) return;
      switch (ev.code) {
        case 'Digit1':
          this.fireSlot('b1');
          break;
        case 'Digit2':
          this.fireSlot('b2');
          break;
        case 'Digit3':
          this.fireSlot('b3');
          break;
        case 'Space':
          this.fireSlot('especial');
          break;
        case 'KeyQ':
          this.pressButton('item');
          break;
        case 'KeyE':
          this.pressButton('falar');
          break;
        case 'Tab':
          this.world.cycleTarget();
          break;
        case 'KeyF':
          this.pressButton('auto');
          break;
        case 'KeyT':
          this.pressButton('ala');
          break;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // toques

  private hitButton(x: number, y: number): BtnId | undefined {
    const order: BtnId[] = ['especial', 'b1', 'b2', 'b3', 'item', 'auto', 'ala', 'falar'];
    let best: BtnId | undefined;
    let bestD = Infinity;
    for (const id of order) {
      const b = this.buttons.get(id);
      if (!b || !b.visible) continue;
      if (!hitCircle(b.c, x, y)) continue;
      const d = Math.hypot(x - b.c.x, y - b.c.y) - b.c.r;
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    requestFullscreenOnce();
    const gc = this.rt.gc;
    if (!gc.welcomed) {
      if (this.offlineBtn.visible && this.offlineBtn.getBounds().contains(p.x, p.y)) goOffline();
      return;
    }
    const now = performance.now();
    const btn = this.hitButton(p.x, p.y);
    if (btn) {
      const tr: Track = { mode: 'btn', btn, x0: p.x, y0: p.y, t0: now, moved: 0 };
      if (btn === 'b1' || btn === 'b2' || btn === 'b3' || btn === 'especial') {
        const ab = this.abilityOf(btn);
        tr.slot = SLOT_OF[btn];
        if (ab) tr.ability = ab;
        if (ab && isDraggable(ab)) {
          // área: dispara ao soltar; mostra a guia já no alvo
          this.tracks.set(p.id, tr);
          this.showGuide(tr, p.x, p.y);
          return;
        }
        this.fireSlot(btn);
        this.tracks.set(p.id, tr);
        return;
      }
      this.pressButton(btn);
      this.tracks.set(p.id, tr);
      return;
    }
    if (p.x < this.scale.width / 2 && this.joy === null) {
      this.joy = newJoystick(p.x, p.y);
      this.joyPointer = p.id;
      this.tracks.set(p.id, { mode: 'joy', x0: p.x, y0: p.y, t0: now, moved: 0 });
      return;
    }
    this.tracks.set(p.id, { mode: 'tap', x0: p.x, y0: p.y, t0: now, moved: 0 });
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const tr = this.tracks.get(p.id);
    if (!tr || !p.isDown) return;
    tr.moved = Math.max(tr.moved, Math.hypot(p.x - tr.x0, p.y - tr.y0));
    if (tr.mode === 'joy' && this.joy && p.id === this.joyPointer) {
      updateJoystick(this.joy, p.x, p.y);
      this.rt.gc.intent.x = this.joy.x;
      this.rt.gc.intent.y = this.joy.y;
      if (Math.hypot(this.joy.x, this.joy.y) > 0.3) this.rt.tips.mark('andar', performance.now());
    } else if (tr.mode === 'btn' && tr.ability && isDraggable(tr.ability)) this.showGuide(tr, p.x, p.y);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const tr = this.tracks.get(p.id);
    if (!tr) return;
    this.tracks.delete(p.id);
    const now = performance.now();
    if (tr.mode === 'joy') {
      this.joy = null;
      this.joyPointer = -1;
      this.rt.gc.intent.x = 0;
      this.rt.gc.intent.y = 0;
      if (isTap(now - tr.t0, tr.moved)) this.world.tapWorld(p.x, p.y);
      return;
    }
    if (tr.mode === 'tap') {
      if (isTap(now - tr.t0, tr.moved)) this.world.tapWorld(p.x, p.y);
      return;
    }
    if (tr.mode === 'btn' && tr.slot !== undefined && tr.ability && isDraggable(tr.ability)) {
      const at = tr.moved >= DRAG_MIN_PX ? this.dragPoint(tr, p.x, p.y) : undefined;
      this.world.setGuide(null);
      this.rt.gc.useAbility(tr.slot, at);
      this.world.localCast(tr.slot);
      this.rt.tips.mark('mira', now);
    }
  }

  private abilityOf(btn: 'b1' | 'b2' | 'b3' | 'especial'): Ability | undefined {
    const id = this.rt.gc.world.hud?.ab[HUD_INDEX[btn]];
    return id ? getData().abilities.get(id) : undefined;
  }

  /** Ponto da área arrastada: do personagem na direção do arrasto, até o alcance. */
  private dragPoint(tr: Track, x: number, y: number): { x: number; y: number } | undefined {
    const me = this.world.selfTile;
    if (!me || !tr.ability) return undefined;
    const dx = x - tr.x0, dy = y - tr.y0;
    const d = Math.hypot(dx, dy);
    const max = DRAG_MAX_PX * this.L.ui;
    const range = Math.max(tr.ability.range, 1);
    const f = Math.min(1, d / max) * range;
    return d > 0 ? { x: me.x + (dx / d) * f, y: me.y + (dy / d) * f } : { x: me.x, y: me.y };
  }

  private showGuide(tr: Track, x: number, y: number): void {
    const ab = tr.ability;
    if (!ab) return;
    let at: { x: number; y: number } | undefined;
    if (tr.moved >= DRAG_MIN_PX) at = this.dragPoint(tr, x, y);
    else {
      // sem arrasto: vai no alvo travado
      const tid = this.rt.gc.currentTarget();
      const t = tid !== undefined ? this.rt.gc.world.ents.get(tid) : undefined;
      if (t) at = { x: t.x, y: t.y };
    }
    this.world.setGuide({ range: Math.max(ab.range, 1), radius: Math.max(ab.radius, 1), ...(at ? { at } : {}) });
  }

  private fireSlot(btn: 'b1' | 'b2' | 'b3' | 'especial'): void {
    const gc = this.rt.gc;
    const id = gc.world.hud?.ab[HUD_INDEX[btn]];
    if (!id) return;
    gc.useAbility(SLOT_OF[btn]);
    if (this.isReady(btn)) this.world.localCast(SLOT_OF[btn]);
    this.rt.tips.mark('mira', performance.now());
  }

  private pressButton(btn: BtnId): void {
    const gc = this.rt.gc;
    switch (btn) {
      case 'item':
        gc.useItem();
        break;
      case 'auto':
        gc.setAuto(!(gc.world.hud?.auto ?? false));
        break;
      case 'ala': {
        const cur = gc.world.hud?.arch;
        const next = cur === TEMPLATE_ALAS[0] ? TEMPLATE_ALAS[1] : TEMPLATE_ALAS[0];
        gc.switchArchetype(next);
        break;
      }
      case 'falar':
        if (this.talkTarget) this.world.talkTo(this.talkTarget.id);
        break;
      default:
        this.fireSlot(btn);
    }
  }

  private isReady(btn: 'b1' | 'b2' | 'b3' | 'especial'): boolean {
    const hud = this.rt.gc.world.hud;
    if (!hud) return false;
    if (btn === 'especial') return hud.special >= 1000 && hud.gcd === 0;
    const i = HUD_INDEX[btn];
    const ab = this.abilityOf(btn);
    return hud.cd[i] === 0 && hud.gcd === 0 && (!ab || hud.res >= ab.cost);
  }

  // ---------------------------------------------------------------------------
  // quadro a quadro

  override update(): void {
    const gc = this.rt.gc;
    const now = performance.now();
    // teclado (o joystick tem prioridade)
    if (this.keys && this.joy === null) {
      const k = this.keys;
      const v = keysVector(k['a']!.isDown || k['left']!.isDown, k['d']!.isDown || k['right']!.isDown, k['w']!.isDown || k['up']!.isDown, k['s']!.isDown || k['down']!.isDown);
      gc.intent.x = v.x;
      gc.intent.y = v.y;
      if (v.x !== 0 || v.y !== 0) this.rt.tips.mark('andar', now);
    }
    this.updateConnection(now);
    if (!gc.welcomed || !gc.world.hud) {
      for (const b of this.buttons.values()) b.setVisible(false);
      this.hideWorldUi();
      return;
    }
    this.updateButtons(now);
    this.updateFrames();
    this.updateJoystick();
    this.updateTips(now);
    this.updateNotices(now);
    this.updateDebug();
  }

  private hideWorldUi(): void {
    for (const t of this.tipTexts.values()) t.setVisible(false);
    this.targetPortrait.setVisible(false);
    for (const k of ['nome', 'vida', 'nivel', 'alvoNome', 'alvoNivel', 'chefe', 'falarNome']) this.texts[k]?.setText('');
    this.downedText.setVisible(false);
    this.g.clear();
    this.gSig = '';
  }

  private updateConnection(now: number): void {
    const gc = this.rt.gc;
    const waiting = !gc.welcomed;
    this.overlay.setVisible(waiting);
    this.bigText.setVisible(waiting);
    this.smallText.setVisible(waiting);
    let failures = 0;
    const tr = gc.transport instanceof LaggedTransport ? gc.transport.inner : gc.transport;
    if (tr instanceof ColyseusTransport) failures = tr.failures;
    this.offlineBtn.setVisible(waiting && failures >= 2 && !this.rt.offline);
    if (waiting) {
      const dots = '.'.repeat(1 + (Math.floor(now / 400) % 3));
      const where = this.rt.offline ? 'servidor local' : this.rt.cfg.endpoint;
      const why = gc.statusInfo && gc.statusInfo !== where ? `\n${gc.statusInfo}` : '';
      this.smallText.setText(`${gc.status === 'reconectando' ? 'Tentando de novo' : 'Conectando'}${dots}\n${where}${why}`);
    }
    const reconnecting = gc.welcomed && gc.status !== 'conectado';
    this.banner.setVisible(reconnecting);
    // SUGESTÃO: texto do aviso de queda (o servidor põe o personagem no modo automático)
    // desconectado de vez (ex.: entrou em outro aparelho): mostra o motivo em vez de "reconectando"
    if (reconnecting) this.banner.setText(gc.status === 'desconectado' && gc.statusInfo ? gc.statusInfo : 'Conexão caiu. Reconectando... (seu personagem luta sozinho)');
  }

  private updateButtons(now: number): void {
    const gc = this.rt.gc;
    const hud = gc.world.hud!;
    const me = gc.world.self();
    const fl = me?.fl ?? 0;
    const cantAct = (fl & (FL.atordoado | FL.caido)) !== 0 || (hud as { canAct?: boolean }).canAct === false || hud.downed !== undefined;
    const art = this.rt.art;
    const pressed = this.pressed;
    pressed.clear();
    for (const t of this.tracks.values()) if (t.mode === 'btn' && t.btn) pressed.add(t.btn);
    for (const id of ['b1', 'b2', 'b3', 'especial'] as const) {
      const b = this.buttons.get(id)!;
      const abId = hud.ab[HUD_INDEX[id]];
      if (!abId) {
        b.setVisible(false);
        continue;
      }
      b.setVisible(true);
      b.setIcon(art.icon(this, abId));
      const ab = getData().abilities.get(abId);
      const noRes = ab !== undefined && ab.cost > 0 && hud.res < ab.cost;
      if (id === 'especial') {
        b.update({ cd: hud.cd[3], gcd: hud.gcd, disabled: cantAct || hud.special < 1000, charge: hud.special / 1000, pressed: pressed.has(id) }, now);
      } else b.update({ cd: hud.cd[HUD_INDEX[id]], gcd: hud.gcd, disabled: cantAct || noRes, pressed: pressed.has(id) }, now);
    }
    const item = this.buttons.get('item')!;
    const itemAb = hud.ab[4];
    item.setVisible(itemAb !== undefined || hud.itemCount > 0);
    if (itemAb) item.setIcon(art.icon(this, itemAb));
    item.update({ cd: hud.cd[4], gcd: 0, disabled: cantAct || hud.itemCount <= 0, count: hud.itemCount, pressed: pressed.has('item') }, now);
    const auto = this.buttons.get('auto')!;
    auto.setVisible(true);
    auto.setColor(hud.auto ? 0x2a7a3a : 0x22303a);
    auto.update({ cd: 0, gcd: 0, disabled: false, pressed: pressed.has('auto') }, now);
    const ala = this.buttons.get('ala')!;
    ala.setVisible(hud.arch !== undefined);
    ala.update({ cd: 0, gcd: 0, disabled: false, pressed: pressed.has('ala') }, now);
    // Falar: só perto de NPC
    this.talkTarget = this.world.nearestTalkNpc();
    const falar = this.buttons.get('falar')!;
    falar.setVisible(this.talkTarget !== undefined);
    falar.update({ cd: 0, gcd: 0, disabled: false, pressed: pressed.has('falar') }, now);
    this.texts['falarNome']!.setText(this.talkTarget ? fontText(this.talkTarget.name) : '');
  }

  private updateFrames(): void {
    const gc = this.rt.gc;
    const L = this.L;
    const hud = gc.world.hud!;
    const D = getData();
    const arch = hud.arch ? D.archetypesById.get(hud.arch) : undefined;
    const cls = hud.cls ? D.classesById.get(hud.cls) : undefined;
    const res = cls ? cls.resource[arch?.margem ?? 'esquerda'] : undefined;
    const resColor = (res && RES_COLOR[res.id]) ?? 0xf0c040;
    // alvo e chefe
    const tid = gc.currentTarget();
    const t = tid !== undefined ? gc.world.ents.get(tid) : undefined;
    const me = this.world.selfTile;
    let boss: { name: string; h: number } | undefined;
    for (const e of gc.world.ents.values()) {
      if (!(e.fl & FL.chefe) || e.h <= 0 || !me) continue;
      if (Math.hypot(e.x - me.x, e.y - me.y) <= 14) boss = { name: e.name ?? 'Chefe', h: e.h };
    }
    const sig = [hud.hp, hud.hpMax, hud.shield, hud.res, hud.resMax, hud.xp, hud.xpNext, t?.id, t?.h, boss?.h, L.ui].join('|');
    if (sig !== this.gSig) {
      this.gSig = sig;
      const g = this.g;
      g.clear();
      const P = L.player;
      const pw = P.w;
      // fundo
      g.fillStyle(0x140c16, 0.78).fillRoundedRect(P.x, P.y, pw, 56 * L.ui, 6);
      g.lineStyle(2, 0x3a2a40, 1).strokeRoundedRect(P.x, P.y, pw, 56 * L.ui, 6);
      // vida
      const bx = P.x + 6, bw = pw - 12;
      const hpF = hud.hpMax > 0 ? Math.max(0, Math.min(1, hud.hp / hud.hpMax)) : 0;
      g.fillStyle(0x3a1414, 1).fillRect(bx, P.y + 15, bw, 12 * L.ui);
      g.fillStyle(hpF > 0.3 ? 0x4ac04a : 0xd83a2a, 1).fillRect(bx, P.y + 15, bw * hpF, 12 * L.ui);
      if (hud.shield > 0 && hud.hpMax > 0) g.fillStyle(0xe8f0ff, 0.85).fillRect(bx, P.y + 15, bw * Math.min(1, hud.shield / hud.hpMax), 3);
      // recurso
      const resF = hud.resMax > 0 ? Math.max(0, Math.min(1, hud.res / hud.resMax)) : 0;
      if (hud.resMax > 0) {
        g.fillStyle(0x201a10, 1).fillRect(bx, P.y + 15 + 14 * L.ui, bw, 6 * L.ui);
        g.fillStyle(resColor, 1).fillRect(bx, P.y + 15 + 14 * L.ui, bw * resF, 6 * L.ui);
      }
      // XP
      const xpF = hud.xpNext > 0 ? Math.max(0, Math.min(1, hud.xp / hud.xpNext)) : 0;
      g.fillStyle(0x1a1430, 1).fillRect(bx, P.y + 51 * L.ui, bw, 3);
      g.fillStyle(0xa070ff, 1).fillRect(bx, P.y + 51 * L.ui, bw * xpF, 3);
      // alvo
      if (t) {
        const T = L.target;
        g.fillStyle(0x140c16, 0.78).fillRoundedRect(T.x, T.y, T.w, 46 * L.ui, 6);
        g.lineStyle(2, t.fl & FL.elite ? 0x8a5a20 : 0x3a2a40, 1).strokeRoundedRect(T.x, T.y, T.w, 46 * L.ui, 6);
        const tx = T.x + 40, tw = T.w - 46;
        g.fillStyle(0x3a1414, 1).fillRect(tx, T.y + 20, tw, 9 * L.ui);
        g.fillStyle(t.kind === 'e' ? 0xd83a2a : 0x4ac04a, 1).fillRect(tx, T.y + 20, (tw * Math.max(0, t.h)) / 1000, 9 * L.ui);
      }
      // chefe
      if (boss) {
        const B = L.boss;
        g.fillStyle(0x140c16, 0.85).fillRect(B.x - 3, B.y - 3, B.w + 6, 14 * L.ui + 6);
        g.fillStyle(0x3a1414, 1).fillRect(B.x, B.y, B.w, 14 * L.ui);
        g.fillStyle(0xc02a2a, 1).fillRect(B.x, B.y, (B.w * boss.h) / 1000, 14 * L.ui);
        g.lineStyle(2, 0xffd060, 1).strokeRect(B.x - 3, B.y - 3, B.w + 6, 14 * L.ui + 6);
      }
    }
    const name = gc.world.self()?.name ?? '';
    this.texts['nome']!.setText(fit(`${name}${arch ? ' - ' + arch.name : ''}`, L.player.w - 12));
    this.texts['vida']!.setText(fontText(`${Math.ceil(hud.hp)}/${hud.hpMax}${res ? '  ' + res.name : ''}`));
    this.texts['vida']!.setY(L.player.y + 17 + 1.5 * L.ui);
    this.texts['nivel']!.setText(fontText(`NV ${hud.level}  XP ${hud.xp}/${hud.xpNext}`));
    this.texts['nivel']!.setY(L.player.y + 41 * L.ui);
    if (t) {
      const D2 = getData();
      const tname = t.name ?? (t.defId ? (D2.enemiesById.get(t.defId)?.name ?? t.defId) : '?');
      this.texts['alvoNome']!.setText(fit(tname, L.target.w - 46)).setTint(t.fl & FL.elite ? 0xffa040 : t.kind === 'e' ? 0xffb0a0 : 0xd8ffd0);
      this.texts['alvoNivel']!.setText(fontText(`NV ${t.lv ?? '?'}${t.fl & FL.elite ? '  ELITE' : ''}`));
      if (t.defId) {
        const key = this.portraitKey(t.defId);
        if (key) this.targetPortrait.setTexture(key).setScale(0.5).setVisible(true);
      }
    } else {
      this.texts['alvoNome']!.setText('');
      this.texts['alvoNivel']!.setText('');
      this.targetPortrait.setVisible(false);
    }
    const chefe = this.texts['chefe']!;
    chefe.setText(boss ? fontText(boss.name) : '');
    // o nome cabe na largura da barra
    if (boss) chefe.setScale(Math.max(1, Math.min(2, L.boss.w / Math.max(1, fontText(boss.name).length * 6))));
    // caído
    const downed = hud.downed;
    this.downedText.setVisible(downed !== undefined);
    if (downed !== undefined) {
      const s = Math.ceil(downed / 1000);
      if (s !== this.downedShown) {
        this.downedShown = s;
        this.downedText.setText(`Caído: aguarde um aliado\n${s} s`);
      }
    }
  }

  private portraitCache = new Map<string, string | null>();
  private portraitKey(defId: string): string | null {
    let k = this.portraitCache.get(defId);
    if (k === undefined) {
      try {
        k = this.rt.art.portrait(this, defId);
      } catch {
        k = null;
      }
      this.portraitCache.set(defId, k);
    }
    return k;
  }

  private updateJoystick(): void {
    const j = this.joy;
    this.joyBase.setVisible(j !== null);
    this.joyKnob.setVisible(j !== null);
    if (!j) return;
    this.joyBase.setPosition(j.ox, j.oy);
    this.joyKnob.setPosition(j.ox + j.x * JOY_RADIUS_PX, j.oy + j.y * JOY_RADIUS_PX);
  }

  private tipCheckAt = 0;
  private enemiesSeen = 0;

  private updateTips(now: number): void {
    // a conta de inimigos à vista (linha de visão) roda 4 vezes por segundo, não a cada quadro
    if (now - this.tipCheckAt > 250) {
      this.tipCheckAt = now;
      this.enemiesSeen = this.world.visibleEnemies().length;
    }
    const active = this.rt.tips.active({ now, hasTarget: this.rt.gc.currentTarget() !== undefined, enemiesVisible: this.enemiesSeen });
    for (const [id, t] of this.tipTexts) {
      const on = active.includes(id);
      t.setVisible(on);
      if (on) t.setAlpha(0.75 + 0.25 * Math.sin(now / 300));
    }
  }

  private updateNotices(now: number): void {
    const n = this.rt.gc.notices;
    const last = n[n.length - 1];
    if (!last) return;
    // SUGESTÃO: avisos ficam 2,5 s
    const on = now - last.at < 2500;
    if (on && this.shownNotice !== n.length) {
      this.shownNotice = n.length;
      this.noticeText.setText(last.text);
    }
    this.noticeText.setVisible(on);
  }

  private updateDebug(): void {
    if (!this.rt.cfg.debug) return;
    const gc = this.rt.gc;
    const c = this.rt.cfg;
    const p = gc.pred;
    this.texts['debug']!.setText(
      fontText(
        `FPS ${Math.round(this.world.fps)} PING ${gc.rtt.rounded}MS` +
          (c.lag || c.loss ? ` SIM ${c.lag}/${Math.round(c.loss * 100)}%` : '') +
          ` ERRO ${(p?.stats.lastError ?? 0).toFixed(2)} SEM ACK ${p?.pendingInputs ?? 0}/${gc.cmds.size} MAX ${MAX_REWIND_MS}`,
      ),
    );
  }
}

/** Habilidade que se arrasta para posicionar (área no alvo e campo lançado longe). */
function isDraggable(a: Ability): boolean {
  return (a.type === 'area_alvo' || a.type === 'campo') && a.range > 0;
}

/** Texto na fonte de pixel cortado para caber em `px` (6 px por letra). */
function fit(text: string, px: number): string {
  const t = fontText(text);
  const max = Math.max(3, Math.floor(px / 6));
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '.';
}

function opt(hint: string | undefined): { hint?: string } {
  return hint ? { hint } : {};
}

let fsRequested = false;
/** Tela cheia e retrato travado no primeiro toque (quando o navegador deixa). */
function requestFullscreenOnce(): void {
  if (fsRequested) return;
  fsRequested = true;
  try {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    const coarse = globalThis.matchMedia?.('(pointer: coarse)').matches;
    if (!coarse) return;
    const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : (el.webkitRequestFullscreen?.(), undefined);
    const lock = () => {
      try {
        const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        void o.lock?.('portrait')?.catch(() => {});
      } catch {
        // sem trava de orientação (iOS)
      }
    };
    if (p && typeof (p as Promise<void>).then === 'function') (p as Promise<void>).then(lock, () => {});
    else lock();
  } catch {
    // sem tela cheia
  }
}

function goOffline(): void {
  const q = new URLSearchParams(location.search);
  q.set('offline', '1');
  location.search = q.toString();
}

/** Área segura do aparelho (env(safe-area-inset-*)), lida das variáveis CSS do index.html. */
function safeArea(side: 'top' | 'bottom'): number {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(`--safe-${side}`);
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}
