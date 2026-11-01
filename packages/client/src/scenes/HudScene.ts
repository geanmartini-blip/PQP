/**
 * HUD em coordenadas de tela (pixels de canvas), por cima do mundo: quadros do jogador e do alvo,
 * barra do chefe, botões em arco, joystick flutuante, seta do rumo, dicas do primeiro minuto, avisos
 * de conexão e de caído, modo de ajuste dos botões e o teclado para testar no PC.
 *
 * Toques (multitoque: joystick e botões ao mesmo tempo):
 * - metade esquerda, fora dos botões: joystick que nasce onde o polegar toca; toque rápido vale
 *   como toque no mundo; os primeiros 16 px da borda esquerda (gesto de voltar do Android) só
 *   valem como toque;
 * - botões: habilidade dispara ao encostar; área no alvo (e campo lançado longe) dispara ao soltar,
 *   e arrastar posiciona a área com a guia de alcance; soltar de volta em cima do botão cancela;
 * - seta do rumo: leva até o bando mais perto (auto-caminho);
 * - engrenagem: modo de ajuste (arrastar os botões; OK guarda no aparelho);
 * - resto da tela: toque no mundo (inimigo troca o alvo, NPC conversa, chão leva até lá).
 *
 * Nada de Graphics: fundos, pizzas e anéis são texturas geradas uma vez (ui/hudTextures.ts) e as
 * barras são Rectangle com escala. Textos só mudam quando o valor muda.
 */
import * as Phaser from 'phaser';
import { getData, type Ability } from '@pqp/shared';
import { MAX_REWIND_MS } from '@pqp/shared/net';
import { FONT_KEY } from '../art/index';
import { fontText } from '../art/fx';
import { FL } from '../game/clientWorld';
import { safeGet, safeSet } from '../game/GameClient';
import { LocalCooldowns } from '../game/localCooldowns';
import { getRuntime, type Runtime } from '../game/runtime';
import { ColyseusTransport } from '../net/colyseusTransport';
import { LaggedTransport } from '../net/transport';
import { isTap, JOY_RADIUS_PX, keysVector, newJoystick, TAP_MAX_MOVE_PX, updateJoystick, type JoyState } from '../input/joystick';
import { RoundButton } from '../ui/buttons';
import { COMPASS_MIN_TILES, nearestEnemyMarker } from '../ui/compass';
import { arrowTex, gearTex, panelTex, ringDiscTex } from '../ui/hudTextures';
import {
  applyOffsets,
  charsFit,
  circlesOverlap,
  clampButton,
  edgeArrow,
  hitCircle,
  hudLayout,
  LAYOUT_KEY,
  MOVABLE,
  offsetOf,
  parseOffsets,
  serializeOffsets,
  type Circle,
  type HudLayout,
  type LayoutOffsets,
  type MovableId,
  type Rect,
} from '../ui/layout';
import { TIP_TEXT, type TipId } from '../ui/tips';
import type { WorldScene } from './WorldScene';

type Slot = 1 | 2 | 3 | 'especial';
type BtnId = 'b1' | 'b2' | 'b3' | 'especial' | 'item' | 'auto' | 'ala' | 'falar' | 'ajuste';

interface Track {
  mode: 'joy' | 'btn' | 'tap' | 'edit' | 'seta';
  btn?: BtnId;
  slot?: Slot;
  ability?: Ability;
  x0: number;
  y0: number;
  t0: number;
  moved: number;
  /** modo de ajuste: posição do botão no começo do arrasto */
  from?: { x: number; y: number };
}

// SUGESTÃO: arrasto máximo do botão de área (px de CSS × escala da interface; cabe abaixo do b1 em
// qualquer celular) e arrasto mínimo para valer.
const DRAG_MAX_CSS = 60;
const DRAG_MIN_CSS = 14;
// SUGESTÃO: faixa da borda esquerda (px de CSS) que não abre joystick (gesto de voltar do Android).
const EDGE_GUARD_CSS = 16;
// SUGESTÃO: a barra do chefe aparece com ele a até 14 tiles.
const BOSS_BAR_TILES = 14;
// SUGESTÃO: as duas alas do personagem template da Fase 1.
const TEMPLATE_ALAS = ['peao_brabo', 'idol'] as const;
// SUGESTÃO: cores dos recursos.
const RES_COLOR: Record<string, number> = { folego: 0xf0c040, municao: 0xf09040, espirito: 0x60e0b0, bateria: 0x40c8f0, foco: 0xc080ff };
// SUGESTÃO: textos do modo de ajuste.
const EDIT_TEXT = 'Arraste os botões para onde preferir';
const EDIT_OK = 'OK';
const EDIT_RESET = 'Padrão';

const SLOT_OF: Record<'b1' | 'b2' | 'b3' | 'especial', Slot> = { b1: 1, b2: 2, b3: 3, especial: 'especial' };
const HUD_INDEX: Record<'b1' | 'b2' | 'b3' | 'especial', number> = { b1: 0, b2: 1, b3: 2, especial: 3 };
const FONT = '"Trebuchet MS", Verdana, sans-serif';

interface Bar {
  bg: Phaser.GameObjects.Rectangle;
  fill: Phaser.GameObjects.Rectangle;
  frac: number;
}

export class HudScene extends Phaser.Scene {
  private rt!: Runtime;
  private world!: WorldScene;
  private L!: HudLayout;
  private Lbase!: HudLayout;
  private W = 0;
  private H = 0;
  private safeBottom = 0;
  private buttons = new Map<BtnId, RoundButton>();
  private tracks = new Map<number, Track>();
  private joy: JoyState | null = null;
  private joyPointer = -1;
  private joyBase!: Phaser.GameObjects.Image;
  private joyKnob!: Phaser.GameObjects.Image;
  private texts: Record<string, Phaser.GameObjects.BitmapText> = {};
  private textCache = new Map<string, string>();
  private bars: Record<string, Bar> = {};
  private shieldBar!: Phaser.GameObjects.Rectangle;
  private playerPanel!: Phaser.GameObjects.Image;
  private targetPanel!: Phaser.GameObjects.Image;
  private targetPanelKeys = { normal: '', elite: '' };
  private bossBox!: Phaser.GameObjects.Rectangle;
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
  private readonly cds = new LocalCooldowns();
  private iconKeys = new Map<string, string>();
  // seta do rumo
  private arrow!: Phaser.GameObjects.Image;
  private arrowHit: Circle | null = null;
  private compassTo: { x: number; y: number } | null = null;
  // modo de ajuste
  private editing = false;
  private offsets: LayoutOffsets = {};
  private editTitle!: Phaser.GameObjects.Text;
  private editOk!: Phaser.GameObjects.Text;
  private editReset!: Phaser.GameObjects.Text;

  constructor() {
    super('HudScene');
  }

  create(): void {
    this.rt = getRuntime();
    this.world = this.scene.get('WorldScene') as WorldScene;
    this.touch = this.sys.game.device.input.touch;
    this.W = this.scale.width;
    this.H = this.scale.height;
    const px = (this.registry.get('px') as number | undefined) ?? 1;
    this.safeBottom = safeArea('bottom');
    this.Lbase = hudLayout(this.W, this.H, this.safeBottom, safeArea('top'), px);
    this.offsets = parseOffsets(safeGet(this.rt.storage, LAYOUT_KEY));
    this.L = applyOffsets(this.Lbase, this.offsets, this.W, this.H, this.safeBottom);
    this.editing = false;
    this.buttons.clear();
    this.tracks.clear();
    this.texts = {};
    this.textCache.clear();
    this.bars = {};
    this.tipTexts.clear();
    this.iconKeys.clear();
    this.joy = null;
    this.joyPointer = -1;
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
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, this.releaseAll, this);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
      this.input.keyboard?.removeAllListeners();
    });
  }

  private get px(): number {
    return this.L.px;
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

  private bt(x: number, y: number, s: number, tint = 0xffffff): Phaser.GameObjects.BitmapText {
    return this.add.bitmapText(x, y, FONT_KEY, '', 7).setScale(s).setTint(tint).setDepth(12);
  }

  private bar(id: string, r: Rect, bg: number, fill: number): Bar {
    const b: Bar = {
      bg: this.add.rectangle(r.x, r.y, r.w, r.h, bg).setOrigin(0).setDepth(11),
      fill: this.add.rectangle(r.x, r.y, r.w, r.h, fill).setOrigin(0).setDepth(11.2),
      frac: 1,
    };
    this.bars[id] = b;
    return b;
  }

  private setBar(id: string, frac: number, visible = true): void {
    const b = this.bars[id];
    if (!b) return;
    const f = Math.max(0, Math.min(1, Number.isFinite(frac) ? frac : 0));
    if (f !== b.frac) {
      b.frac = f;
      b.fill.setScale(f, 1);
    }
    if (b.bg.visible !== visible) {
      b.bg.setVisible(visible);
      b.fill.setVisible(visible);
    }
  }

  private text(key: string, value: string): void {
    if (this.textCache.get(key) === value) return;
    this.textCache.set(key, value);
    this.texts[key]?.setText(value);
  }

  private textStyle(cssSize: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle {
    const px = this.px;
    return { fontFamily: FONT, fontSize: `${Math.round(cssSize * this.L.ui * px)}px`, ...extra };
  }

  private build(): void {
    const L = this.L;
    const W = this.W, H = this.H, px = L.px, ts = L.ts;
    const P = L.player, T = L.target;
    // quadro do jogador
    this.playerPanel = this.add.image(P.x, P.y, panelTex(this, P.w, P.h, 0x3a2a40, px)).setOrigin(0).setDepth(10);
    this.texts['nome'] = this.bt(P.name.x, P.name.y, ts, 0xffe8a0);
    this.bar('vida', P.hpBar, 0x3a1414, 0x4ac04a);
    this.shieldBar = this.add.rectangle(P.hpBar.x, P.hpBar.y, P.hpBar.w, Math.max(1, Math.round(3 * px)), 0xe8f0ff, 0.85).setOrigin(0).setDepth(11.4).setVisible(false);
    this.texts['vida'] = this.bt(P.hpBar.x + P.hpBar.w / 2, P.hpBar.y + P.hpBar.h / 2, ts).setOrigin(0.5).setDepth(11.6);
    this.bar('recurso', P.resBar, 0x201a10, 0xf0c040);
    this.texts['nivel'] = this.bt(P.level.x, P.level.y, ts, 0xd8c8ff);
    this.bar('xp', P.xpBar, 0x1a1430, 0xa070ff);
    // quadro do alvo
    this.targetPanelKeys = { normal: panelTex(this, T.w, T.h, 0x3a2a40, px), elite: panelTex(this, T.w, T.h, 0x8a5a20, px) };
    this.targetPanel = this.add.image(T.x, T.y, this.targetPanelKeys.normal).setOrigin(0).setDepth(10).setVisible(false);
    this.targetPortrait = this.add.image(T.portrait.x, T.portrait.y, '__DEFAULT').setDepth(12).setVisible(false);
    this.texts['alvoNome'] = this.bt(T.name.x, T.name.y, ts, 0xffb0a0);
    this.bar('alvo', T.hpBar, 0x3a1414, 0xd83a2a);
    this.texts['alvoNivel'] = this.bt(T.level.x, T.level.y, ts, 0xc8c0d0);
    // chefe
    const B = L.boss;
    const m = Math.round(3 * px);
    this.bossBox = this.add.rectangle(B.x - m, B.y - m, B.w + 2 * m, B.h + 2 * m, 0x140c16, 0.85).setOrigin(0).setDepth(10).setStrokeStyle(Math.round(2 * px), 0xffd060, 1).setVisible(false);
    this.bar('chefe', B, 0x3a1414, 0xc02a2a);
    this.texts['chefe'] = this.bt(W / 2, B.y - m - Math.round(2 * px), ts, 0xffd060).setOrigin(0.5, 1);
    // caído
    this.downedText = this.add
      .text(W / 2, H * 0.36, '', this.textStyle(17, { color: '#ffffff', backgroundColor: '#3a1418dd', padding: { x: 12 * px, y: 8 * px }, align: 'center', wordWrap: { width: Math.round(W * 0.86) } }))
      .setOrigin(0.5)
      .setDepth(60)
      .setVisible(false);
    this.texts['debug'] = this.bt(8 * px, L.ajuste.y + L.ajuste.r + 8 * px, Math.max(1, ts - 1), 0x9ad0ff);

    // botões
    const hint = (k: string) => (this.touch ? undefined : k);
    const mk = (id: BtnId, c: Circle, o: ConstructorParameters<typeof RoundButton>[2] = {}) => {
      const b = new RoundButton(this, c, { px, ts, ...o });
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
    mk('ajuste', L.ajuste, { color: 0x2a2a2a }).setIcon(gearTex(this, 48));
    this.texts['falarNome'] = this.bt(L.falar.x, L.falar.y - L.falar.r - 4 * px, Math.max(1, ts - 1), 0xffe8a0).setOrigin(0.5, 1).setDepth(21);

    // joystick
    const jr = Math.round(JOY_RADIUS_PX * px);
    this.joyBase = this.add.image(0, 0, ringDiscTex(this, jr, 0x000000, 0.25, 0xffffff, 0.45, Math.round(2 * px))).setDepth(30).setVisible(false);
    this.joyKnob = this.add.image(0, 0, ringDiscTex(this, Math.round(22 * px), 0xffffff, 0.55, 0x140c16, 0.8, Math.round(2 * px))).setDepth(31).setVisible(false);

    // seta do rumo
    this.arrow = this.add.image(0, 0, arrowTex(this, Math.round(40 * L.ui * px))).setDepth(35).setVisible(false);

    // dicas
    for (const id of Object.keys(TIP_TEXT) as TipId[]) {
      const a = L.tips[id];
      const st = this.textStyle(14, { color: '#fff6e0', backgroundColor: '#140c16cc', padding: { x: 8 * px, y: 5 * px }, align: 'center', wordWrap: { width: a.wrap, useAdvancedWrap: true } });
      const t = this.add.text(a.x, a.y, TIP_TEXT[id], st).setOrigin(0.5, a.oy).setDepth(40).setVisible(false);
      this.tipTexts.set(id, t);
    }

    // conexão e avisos
    this.overlay = this.add.rectangle(0, 0, W, H, 0x0d0b10, 0.92).setOrigin(0).setDepth(100);
    const big = this.textStyle(22, { color: '#ffe8a0', align: 'center' });
    const small = this.textStyle(13, { color: '#c8c0d0', align: 'center', wordWrap: { width: W * 0.86 } });
    this.bigText = this.add.text(W / 2, H * 0.4, 'Ponte que Partiu', big).setOrigin(0.5).setDepth(101);
    this.smallText = this.add.text(W / 2, H * 0.4 + 40 * L.ui * px, '', small).setOrigin(0.5, 0).setDepth(101);
    this.offlineBtn = this.add
      .text(W / 2, H * 0.62, 'Jogar offline (servidor no aparelho)', { ...small, color: '#140c16', backgroundColor: '#ffe8a0', padding: { x: 12 * px, y: 10 * px } })
      .setOrigin(0.5)
      .setDepth(102)
      .setVisible(false);
    this.banner = this.add
      .text(W / 2, L.bannerY, '', { ...small, color: '#ffe8a0', backgroundColor: '#3a1a1acc', padding: { x: 8 * px, y: 4 * px } })
      .setOrigin(0.5, 0)
      .setDepth(90)
      .setVisible(false);
    this.noticeText = this.add
      .text(W / 2, H * 0.34, '', { ...big, fontSize: `${Math.round(18 * L.ui * px)}px`, backgroundColor: '#140c16aa', padding: { x: 10 * px, y: 6 * px } })
      .setOrigin(0.5)
      .setDepth(91)
      .setVisible(false);

    // modo de ajuste
    const btnStyle = this.textStyle(16, { color: '#140c16', backgroundColor: '#ffe8a0', padding: { x: 16 * px, y: 10 * px } });
    this.editTitle = this.add.text(W / 2, H * 0.2, EDIT_TEXT, this.textStyle(15, { color: '#fff6e0', backgroundColor: '#140c16dd', padding: { x: 10 * px, y: 6 * px }, align: 'center', wordWrap: { width: W * 0.86 } })).setOrigin(0.5).setDepth(95).setVisible(false);
    this.editOk = this.add.text(W * 0.36, H * 0.2 + 52 * L.ui * px, EDIT_OK, btnStyle).setOrigin(0.5).setDepth(95).setVisible(false);
    this.editReset = this.add.text(W * 0.64, H * 0.2 + 52 * L.ui * px, EDIT_RESET, { ...btnStyle, backgroundColor: '#c8c0d0' }).setOrigin(0.5).setDepth(95).setVisible(false);
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
      if (ev.repeat || !this.rt.gc.welcomed || this.editing) return;
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
    const order: BtnId[] = ['especial', 'b1', 'b2', 'b3', 'item', 'auto', 'ala', 'falar', 'ajuste'];
    let best: BtnId | undefined;
    let bestD = Infinity;
    for (const id of order) {
      const b = this.buttons.get(id);
      if (!b || !b.visible) continue;
      if (!hitCircle(b.c, x, y, 6 * this.px)) continue;
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
    if (this.editing) {
      this.onEditDown(p, now);
      return;
    }
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
    if (this.arrowHit && this.arrow.visible && hitCircle(this.arrowHit, p.x, p.y, 8 * this.px)) {
      this.tracks.set(p.id, { mode: 'seta', x0: p.x, y0: p.y, t0: now, moved: 0 });
      return;
    }
    // a borda esquerda é do gesto de voltar do sistema: lá o toque não abre joystick
    if (p.x < this.W / 2 && p.x >= EDGE_GUARD_CSS * this.px && this.joy === null) {
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
    if (tr.mode === 'edit') {
      this.onEditMove(tr, p);
      return;
    }
    if (tr.mode === 'joy' && this.joy && p.id === this.joyPointer) {
      const px = this.px;
      updateJoystick(this.joy, p.x, p.y, JOY_RADIUS_PX * px, 8 * px);
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
    const tapMove = TAP_MAX_MOVE_PX * this.px;
    if (tr.mode === 'edit') {
      this.onEditUp(tr);
      return;
    }
    if (tr.mode === 'joy') {
      this.joy = null;
      this.joyPointer = -1;
      this.rt.gc.intent.x = 0;
      this.rt.gc.intent.y = 0;
      if (isTap(now - tr.t0, tr.moved / this.px)) this.world.tapWorld(p.x, p.y);
      return;
    }
    if (tr.mode === 'tap') {
      if (isTap(now - tr.t0, tr.moved / this.px)) this.world.tapWorld(p.x, p.y);
      return;
    }
    if (tr.mode === 'seta') {
      if (this.compassTo && tr.moved <= tapMove * 2) this.rt.gc.goTo(this.compassTo.x, this.compassTo.y);
      return;
    }
    if (tr.mode === 'btn' && tr.slot !== undefined && tr.ability && isDraggable(tr.ability) && tr.btn) {
      this.world.setGuide(null);
      if (this.isCancel(tr, p.x, p.y)) return;
      const at = tr.moved >= DRAG_MIN_CSS * this.px ? this.dragPoint(tr, p.x, p.y) : undefined;
      this.castSlot(tr.btn as 'b1' | 'b2' | 'b3' | 'especial', at);
    }
  }

  /** Arrastou para fora e voltou para cima do botão: cancela a área. */
  private isCancel(tr: Track, x: number, y: number): boolean {
    const b = tr.btn ? this.buttons.get(tr.btn) : undefined;
    return !!b && tr.moved >= DRAG_MIN_CSS * this.px && Math.hypot(x - b.c.x, y - b.c.y) < b.c.r;
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
    const max = DRAG_MAX_CSS * this.L.ui * this.px;
    const range = Math.max(tr.ability.range, 1);
    const f = Math.min(1, d / max) * range;
    return d > 0 ? { x: me.x + (dx / d) * f, y: me.y + (dy / d) * f } : { x: me.x, y: me.y };
  }

  private showGuide(tr: Track, x: number, y: number): void {
    const ab = tr.ability;
    if (!ab) return;
    let at: { x: number; y: number } | undefined;
    if (tr.moved >= DRAG_MIN_CSS * this.px) at = this.dragPoint(tr, x, y);
    else {
      // sem arrasto: vai no alvo travado
      const tid = this.rt.gc.currentTarget();
      const t = tid !== undefined ? this.rt.gc.world.ents.get(tid) : undefined;
      if (t) at = { x: t.x, y: t.y };
    }
    this.world.setGuide({ range: Math.max(ab.range, 1), radius: Math.max(ab.radius, 1), ...(at ? { at } : {}), cancel: this.isCancel(tr, x, y) });
  }

  private fireSlot(btn: 'b1' | 'b2' | 'b3' | 'especial'): void {
    const id = this.rt.gc.world.hud?.ab[HUD_INDEX[btn]];
    if (!id) return;
    this.castSlot(btn);
  }

  /**
   * Manda a habilidade. A animação local só toca se o botão está pronto pelo HUD e sem trava local
   * (recarga global prevista ou toque anterior ainda sem resposta do servidor).
   */
  private castSlot(btn: 'b1' | 'b2' | 'b3' | 'especial', at?: { x: number; y: number }): void {
    const gc = this.rt.gc;
    const now = performance.now();
    const i = HUD_INDEX[btn];
    const ok = this.isReady(btn) && !this.cds.blocked(i, now);
    const cmd = gc.useAbility(SLOT_OF[btn], at);
    if (ok) {
      this.world.localCast(SLOT_OF[btn]);
      this.cds.onCast(i, now, getData().balance.combate.recargaGlobalMs, gc.rtt.value, cmd?.id);
    }
    this.rt.tips.mark('mira', now);
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
      case 'ajuste':
        this.enterEdit();
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
  // modo de ajuste dos botões

  private enterEdit(): void {
    this.releaseAll();
    this.editing = true;
    for (const id of MOVABLE) {
      const b = this.buttons.get(id);
      b?.setVisible(true);
      b?.setAlpha(0.85);
    }
    this.editTitle.setVisible(true);
    this.editOk.setVisible(true);
    this.editReset.setVisible(true);
  }

  private onEditDown(p: Phaser.Input.Pointer, now: number): void {
    if (this.editOk.getBounds().contains(p.x, p.y)) {
      this.saveEdit(false);
      return;
    }
    if (this.editReset.getBounds().contains(p.x, p.y)) {
      this.saveEdit(true);
      return;
    }
    const id = this.hitButton(p.x, p.y);
    if (!id || !(MOVABLE as readonly string[]).includes(id)) return;
    const b = this.buttons.get(id)!;
    b.setAlpha(1);
    this.tracks.set(p.id, { mode: 'edit', btn: id, x0: p.x, y0: p.y, t0: now, moved: 0, from: { x: b.c.x, y: b.c.y } });
  }

  private onEditMove(tr: Track, p: Phaser.Input.Pointer): void {
    const b = tr.btn ? this.buttons.get(tr.btn) : undefined;
    if (!b || !tr.from) return;
    const c = clampButton({ x: tr.from.x + (p.x - tr.x0), y: tr.from.y + (p.y - tr.y0), r: b.c.r }, this.W, this.H, this.safeBottom, this.px);
    b.moveTo(c.x, c.y);
  }

  private onEditUp(tr: Track): void {
    const b = tr.btn ? this.buttons.get(tr.btn) : undefined;
    if (!b || !tr.from) return;
    b.setAlpha(0.85);
    // encostou em outro botão: volta para onde estava
    for (const o of this.buttons.values()) {
      if (o === b) continue;
      if (circlesOverlap(b.c, o.c, 2 * this.px)) {
        b.moveTo(tr.from.x, tr.from.y);
        return;
      }
    }
  }

  private saveEdit(reset: boolean): void {
    let offs: LayoutOffsets = {};
    if (!reset) {
      for (const id of MOVABLE) {
        const b = this.buttons.get(id);
        if (b) offs[id as MovableId] = offsetOf(this.Lbase[id], b.c, this.px);
      }
    }
    offs = parseOffsets(serializeOffsets(offs));
    safeSet(this.rt.storage, LAYOUT_KEY, serializeOffsets(offs));
    this.editing = false;
    this.scene.restart();
  }

  // ---------------------------------------------------------------------------
  // quadro a quadro

  override update(): void {
    const gc = this.rt.gc;
    const now = performance.now();
    // teclado (o joystick tem prioridade)
    if (this.keys && this.joy === null && !this.editing) {
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
    if (this.editing) {
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
    for (const t of this.tipTexts.values()) if (t.visible) t.setVisible(false);
    if (this.targetPortrait.visible) this.targetPortrait.setVisible(false);
    if (this.targetPanel.visible) this.targetPanel.setVisible(false);
    this.arrow.setVisible(false);
    for (const k of ['nome', 'vida', 'nivel', 'alvoNome', 'alvoNivel', 'chefe', 'falarNome']) this.text(k, '');
    for (const id of ['alvo', 'chefe']) this.setBar(id, 0, false);
    this.bossBox.setVisible(false);
    this.downedText.setVisible(false);
    this.joyBase.setVisible(false);
    this.joyKnob.setVisible(false);
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
      const s = `${gc.status === 'reconectando' ? 'Tentando de novo' : 'Conectando'}${dots}\n${where}${why}`;
      if (this.smallText.text !== s) this.smallText.setText(s);
    }
    const reconnecting = gc.welcomed && gc.status !== 'conectado';
    this.banner.setVisible(reconnecting);
    // SUGESTÃO: texto do aviso de queda (o servidor põe o personagem no modo automático)
    // desconectado de vez (ex.: entrou em outro aparelho): mostra o motivo em vez de "reconectando"
    if (reconnecting) {
      const s = gc.status === 'desconectado' && gc.statusInfo ? gc.statusInfo : 'Conexão caiu. Reconectando... (seu personagem luta sozinho)';
      if (this.banner.text !== s) this.banner.setText(s);
    }
  }

  private iconOf(abId: string): string {
    let k = this.iconKeys.get(abId);
    if (!k) {
      k = this.rt.art.icon(this, abId);
      this.iconKeys.set(abId, k);
    }
    return k;
  }

  private updateButtons(now: number): void {
    const gc = this.rt.gc;
    const hud = gc.world.hud!;
    const me = gc.world.self();
    const fl = me?.fl ?? 0;
    const cantAct = (fl & (FL.atordoado | FL.caido)) !== 0 || (hud as { canAct?: boolean }).canAct === false || hud.downed !== undefined;
    const pressed = this.pressed;
    pressed.clear();
    for (const t of this.tracks.values()) if (t.mode === 'btn' && t.btn) pressed.add(t.btn);
    this.cds.sync(hud, gc.world.cack, now);
    const localGcd = this.cds.gcdTicks(now);
    for (const id of ['b1', 'b2', 'b3', 'especial'] as const) {
      const b = this.buttons.get(id)!;
      const abId = hud.ab[HUD_INDEX[id]];
      if (!abId) {
        b.setVisible(false);
        continue;
      }
      b.setVisible(true);
      b.setIcon(this.iconOf(abId));
      const ab = getData().abilities.get(abId);
      const noRes = ab !== undefined && ab.cost > 0 && hud.res < ab.cost;
      const gcd = Math.max(hud.gcd, localGcd);
      if (id === 'especial') {
        b.update({ cd: hud.cd[3], gcd, disabled: cantAct || hud.special < 1000, charge: hud.special / 1000, pressed: pressed.has(id) }, now);
      } else b.update({ cd: hud.cd[HUD_INDEX[id]], gcd, disabled: cantAct || noRes, pressed: pressed.has(id) }, now);
    }
    const item = this.buttons.get('item')!;
    const itemAb = hud.ab[4];
    item.setVisible(itemAb !== undefined || hud.itemCount > 0);
    if (itemAb) item.setIcon(this.iconOf(itemAb));
    item.update({ cd: hud.cd[4], gcd: 0, disabled: cantAct || hud.itemCount <= 0, count: hud.itemCount, pressed: pressed.has('item') }, now);
    const auto = this.buttons.get('auto')!;
    auto.setVisible(true);
    auto.setColor(hud.auto ? 0x2a7a3a : 0x22303a);
    auto.update({ cd: 0, gcd: 0, disabled: false, pressed: pressed.has('auto') }, now);
    const ala = this.buttons.get('ala')!;
    ala.setVisible(hud.arch !== undefined);
    ala.update({ cd: 0, gcd: 0, disabled: false, pressed: pressed.has('ala') }, now);
    const aj = this.buttons.get('ajuste')!;
    aj.setVisible(true);
    aj.update({ cd: 0, gcd: 0, disabled: false, pressed: pressed.has('ajuste') }, now);
    // Falar: só perto de NPC
    this.talkTarget = this.world.nearestTalkNpc();
    const falar = this.buttons.get('falar')!;
    falar.setVisible(this.talkTarget !== undefined);
    falar.update({ cd: 0, gcd: 0, disabled: false, pressed: pressed.has('falar') }, now);
    this.text('falarNome', this.talkTarget ? fontText(this.talkTarget.name) : '');
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
    // jogador
    const hpF = hud.hpMax > 0 ? hud.hp / hud.hpMax : 0;
    this.setBar('vida', hpF);
    const hpColor = hpF > 0.3 ? 0x4ac04a : 0xd83a2a;
    const hb = this.bars['vida']!;
    if (hb.fill.fillColor !== hpColor) hb.fill.setFillStyle(hpColor);
    const shF = hud.shield > 0 && hud.hpMax > 0 ? Math.min(1, hud.shield / hud.hpMax) : 0;
    this.shieldBar.setVisible(shF > 0);
    if (shF > 0 && this.shieldBar.scaleX !== shF) this.shieldBar.setScale(shF, 1);
    this.setBar('recurso', hud.resMax > 0 ? hud.res / hud.resMax : 0, hud.resMax > 0);
    const rb = this.bars['recurso']!;
    if (rb.fill.fillColor !== resColor) rb.fill.setFillStyle(resColor);
    this.setBar('xp', hud.xpNext > 0 ? hud.xp / hud.xpNext : 0);
    const name = gc.world.self()?.name ?? '';
    // nome e ala se couberem; senão só o nome (a ala aparece no traje e no botão ALA)
    const full = fontText(`${name}${arch ? ' - ' + arch.name : ''}`);
    this.text('nome', full.length <= L.player.chars ? full : fitChars(name, L.player.chars));
    this.text('vida', fitChars(`${Math.ceil(hud.hp)}/${hud.hpMax}`, L.player.chars));
    this.text('nivel', fontText(`NV ${hud.level}`));

    // alvo
    const tid = gc.currentTarget();
    const t = tid !== undefined ? gc.world.ents.get(tid) : undefined;
    this.targetPanel.setVisible(t !== undefined);
    if (t) {
      const elite = (t.fl & FL.elite) !== 0;
      const key = elite ? this.targetPanelKeys.elite : this.targetPanelKeys.normal;
      if (this.targetPanel.texture.key !== key) this.targetPanel.setTexture(key);
      this.setBar('alvo', t.h / 1000);
      const ab = this.bars['alvo']!;
      const c = t.kind === 'e' ? 0xd83a2a : 0x4ac04a;
      if (ab.fill.fillColor !== c) ab.fill.setFillStyle(c);
      const tname = t.name ?? (t.defId ? (D.enemiesById.get(t.defId)?.name ?? t.defId) : '?');
      this.text('alvoNome', fitChars(tname, L.target.chars));
      const tint = elite ? 0xffa040 : t.kind === 'e' ? 0xffb0a0 : 0xd8ffd0;
      const an = this.texts['alvoNome']!;
      if (an.tintTopLeft !== tint) an.setTint(tint);
      this.text('alvoNivel', fitChars(`NV ${t.lv ?? '?'}${elite ? ' ELITE' : ''}`, L.target.chars));
      const key2 = t.defId ? this.portraitKey(t.defId) : null;
      if (key2) {
        if (this.targetPortrait.texture.key !== key2) this.targetPortrait.setTexture(key2).setScale(L.target.portrait.scale);
        this.targetPortrait.setVisible(true);
      } else this.targetPortrait.setVisible(false);
    } else {
      this.setBar('alvo', 0, false);
      this.text('alvoNome', '');
      this.text('alvoNivel', '');
      if (this.targetPortrait.visible) this.targetPortrait.setVisible(false);
    }

    // chefe
    const me = this.world.selfTile;
    let boss: { name: string; h: number } | undefined;
    if (me) {
      for (const e of gc.world.ents.values()) {
        if (!(e.fl & FL.chefe) || e.h <= 0) continue;
        if (Math.hypot(e.x - me.x, e.y - me.y) <= BOSS_BAR_TILES) boss = { name: e.name ?? 'Chefe', h: e.h };
      }
    }
    this.bossBox.setVisible(boss !== undefined);
    this.setBar('chefe', boss ? boss.h / 1000 : 0, boss !== undefined);
    const chefe = this.texts['chefe']!;
    const bossName = boss ? fontText(boss.name) : '';
    if (this.textCache.get('chefe') !== bossName) {
      this.text('chefe', bossName);
      // o nome cabe na largura da barra (escala inteira)
      if (boss) {
        let s = L.ts;
        while (s > 1 && charsFit(L.boss.w, s) < bossName.length) s--;
        chefe.setScale(s);
      }
    }

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
    if (this.joyBase.visible !== (j !== null)) {
      this.joyBase.setVisible(j !== null);
      this.joyKnob.setVisible(j !== null);
    }
    if (!j) return;
    const R = JOY_RADIUS_PX * this.px;
    this.joyBase.setPosition(j.ox, j.oy);
    this.joyKnob.setPosition(j.ox + j.x * R, j.oy + j.y * R);
  }

  private tipCheckAt = 0;
  private enemiesSeen = 0;

  private updateTips(now: number): void {
    // a conta de inimigos à vista (linha de visão) e o rumo rodam 4 vezes por segundo
    if (now - this.tipCheckAt > 250) {
      this.tipCheckAt = now;
      this.enemiesSeen = this.world.visibleEnemies().length;
      this.updateCompassTarget();
    }
    const hasTarget = this.rt.gc.currentTarget() !== undefined;
    const active = this.rt.tips.active({ now, hasTarget, enemiesVisible: this.enemiesSeen, enemyFar: this.compassTo !== null });
    for (const [id, t] of this.tipTexts) {
      const on = active.includes(id);
      if (t.visible !== on) t.setVisible(on);
      if (on) t.setAlpha(0.75 + 0.25 * Math.sin(now / 300));
    }
    this.updateArrow(now);
  }

  /** Bando mais perto pelos marcadores do mapa, enquanto o jogador não lutou ainda. */
  private updateCompassTarget(): void {
    const gc = this.rt.gc;
    const me = this.world.selfTile;
    this.compassTo = null;
    if (!this.rt.tips.wantsCompass || !me || !gc.map || this.enemiesSeen > 0) return;
    const m = nearestEnemyMarker(gc.map.markers, me.x, me.y);
    if (m && m.d > COMPASS_MIN_TILES) this.compassTo = { x: m.x, y: m.y };
  }

  private readonly tmpPt = { x: 0, y: 0 };

  private updateArrow(now: number): void {
    const to = this.compassTo;
    if (!to || !this.world.selfTile) {
      if (this.arrow.visible) this.arrow.setVisible(false);
      this.arrowHit = null;
      return;
    }
    const s = this.world.toScreen(to.x, to.y, this.tmpPt);
    const W = this.W, H = this.H, px = this.px;
    // o bando já aparece na tela: sem seta
    if (s.x > 0 && s.x < W && s.y > this.L.bannerY && s.y < H) {
      if (this.arrow.visible) this.arrow.setVisible(false);
      this.arrowHit = null;
      return;
    }
    const margin = 34 * this.L.ui * px;
    const top = this.L.bannerY;
    const bottom = H - Math.min(this.L.item.y - this.L.item.r, this.L.b1.y - this.L.b1.r) + 8 * px;
    const a = edgeArrow(W, H, s.x - W / 2, s.y - H / 2, margin, top, Math.max(0, bottom));
    const bob = Math.sin(now / 180) * 4 * px;
    this.arrow.setPosition(a.x - Math.cos(a.angle) * bob, a.y - Math.sin(a.angle) * bob).setRotation(a.angle).setVisible(true);
    this.arrowHit = { x: a.x, y: a.y, r: margin };
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
    if (this.noticeText.visible !== on) this.noticeText.setVisible(on);
  }

  private updateDebug(): void {
    if (!this.rt.cfg.debug) return;
    const gc = this.rt.gc;
    const c = this.rt.cfg;
    const p = gc.pred;
    this.text(
      'debug',
      fontText(
        `FPS ${Math.round(this.world.fps)} PING ${gc.rtt.rounded}MS` +
          (c.lag || c.loss ? ` SIM ${c.lag}/${Math.round(c.loss * 100)}%` : '') +
          ` ERRO ${(p?.stats.lastError ?? 0).toFixed(2)} SEM ACK ${p?.pendingInputs ?? 0}/${gc.cmds.size} MAX ${MAX_REWIND_MS} DPR ${this.px}`,
      ),
    );
  }
}

/** Habilidade que se arrasta para posicionar (área no alvo e campo lançado longe). */
function isDraggable(a: Ability): boolean {
  return (a.type === 'area_alvo' || a.type === 'campo') && a.range > 0;
}

/** Texto na fonte de pixel cortado para caber em `max` letras. */
function fitChars(text: string, max: number): string {
  const t = fontText(text);
  const m = Math.max(3, max);
  return t.length <= m ? t : t.slice(0, m - 1).trimEnd() + '.';
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

/** Área segura do aparelho (env(safe-area-inset-*)) em px de CSS, lida das variáveis do index.html. */
function safeArea(side: 'top' | 'bottom'): number {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(`--safe-${side}`);
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}
