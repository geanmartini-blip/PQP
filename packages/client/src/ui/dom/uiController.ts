/**
 * Controlador da interface da Fase 2 em DOM, por cima do canvas: liga o GameState (o que o servidor
 * disse) às telas — criação de personagem, Máquina de Visual, diálogo, travessia — e ao HUD leve:
 * rastreador de missão (tocar liga o auto-caminho), dica do tutorial, avisos, banner de nível e o
 * botão da Máquina de Visual perto do espelho.
 *
 * Um só por página (o HUD do Phaser reinicia no resize; isto não). No modo protótipo (sem perfil),
 * nada aparece.
 */
import type * as Phaser from 'phaser';
import { getData } from '@pqp/shared';
import { canUseMachine, nearVisualMachine } from '@pqp/shared/game/visual';
import type { PlayerRecord } from '@pqp/shared/game/types';
import type { Vec } from '@pqp/shared/sim';
import type { ArtApi } from '../../art/contract';
import type { GameClient } from '../../game/GameClient';
import { newEditor, visualChange, type EditorState } from '../creatorModel';
import { DialogBox } from './dialogBox';
import { EditorScreen } from './editorScreen';
import { button, el, uiRoot } from './styles';
import { TravessiaScreen } from './travessiaScreen';

// SUGESTÃO: avisos ficam 3,2 s; o banner de nível 3 s; no máximo 3 avisos na tela.
export const TOAST_MS = 3200;
export const LEVEL_BANNER_MS = 3000;
export const MAX_TOASTS_ON_SCREEN = 3;
// SUGESTÃO: até 10 s andando até a Máquina de Visual depois do "Pronto" longe dela.
export const MACHINE_WALK_MS = 10000;

export interface UiFrame {
  /** topo livre abaixo dos quadros do HUD (px de CSS) */
  topCss: number;
  /** posição desenhada do próprio personagem (tiles) */
  selfTile: Vec | null;
}

export class UiController {
  readonly root: HTMLDivElement;
  readonly editor: EditorScreen;
  readonly dialog: DialogBox;
  readonly travessia: TravessiaScreen;
  private tracker: HTMLDivElement;
  private trackerSig = '';
  private hint: HTMLDivElement;
  private toastsBox: HTMLDivElement;
  private toastSig = '';
  private levelBox: HTMLDivElement;
  private levelSig = '';
  private machineBtn: HTMLButtonElement;
  private machineNear: string | undefined;
  private creationSent = false;
  private pending: { kind: 'maquina' | 'travessia' | 'criacao'; at: number; profile: unknown } | null = null;
  private dialogShown: unknown = null;
  private queuedMachine: { change: Parameters<GameClient['visualMachine']>[0]; id: string; until: number } | null = null;

  constructor(
    private readonly gc: GameClient,
    private readonly art: ArtApi,
    private readonly sceneRef: () => Phaser.Scene | undefined,
  ) {
    this.root = uiRoot();
    this.root.innerHTML = '';
    const scene = () => this.sceneRef();
    this.editor = new EditorScreen(this.root, { scene, art, onDone: (s) => this.onEditorDone(s), onCancel: () => this.editor.close() });
    this.dialog = new DialogBox(this.root, {
      scene,
      art,
      onOption: (npc, op) => {
        this.gc.dialogOption(npc, op);
        this.closeDialog();
      },
      onClose: () => {
        const d = this.dialog.current;
        if (d && d.opcoes.some((o) => o.id === 'tchau')) this.gc.dialogOption(d.npc, 'tchau');
        this.closeDialog();
      },
    });
    this.travessia = new TravessiaScreen(this.root, {
      scene,
      art,
      onConfirm: (c) => {
        this.pending = { kind: 'travessia', at: performance.now(), profile: this.gc.game.profile };
        this.gc.crossRiver(c.side, c.institution, c.guide);
      },
      onCancel: () => this.travessia.close(),
    });
    this.tracker = el('div', 'rastreador sombra');
    this.tracker.style.display = 'none';
    this.tracker.addEventListener('click', (ev) => {
      ev.preventDefault();
      this.onTrackerTap();
    });
    this.root.appendChild(this.tracker);
    this.hint = el('div', 'dica');
    this.hint.style.display = 'none';
    this.root.appendChild(this.hint);
    this.toastsBox = el('div', 'avisos');
    this.root.appendChild(this.toastsBox);
    this.levelBox = el('div', 'nivel');
    this.levelBox.style.display = 'none';
    this.root.appendChild(this.levelBox);
    // SUGESTÃO: texto do botão da máquina
    this.machineBtn = button('Mudar o visual', 'acao', () => this.openMachine());
    this.machineBtn.style.display = 'none';
    this.root.appendChild(this.machineBtn);
  }

  /** Tela que tapa o mundo aberta (criação, máquina, travessia): o HUD do Phaser não recebe toque nem tecla. */
  get modalOpen(): boolean {
    return this.editor.isOpen || this.travessia.isOpen;
  }

  get dialogOpen(): boolean {
    return this.dialog.isOpen;
  }

  private closeDialog(): void {
    this.dialog.close();
    this.gc.game.closeDialog();
    this.dialogShown = null;
  }

  private onEditorDone(s: EditorState): void {
    const now = performance.now();
    if (s.mode.kind === 'criacao') {
      this.pending = { kind: 'criacao', at: now, profile: this.gc.game.profile };
      this.gc.createCharacter(s.name.trim(), { ...s.look, details: [...s.look.details] });
    } else {
      const change = visualChange(s) as Parameters<GameClient['visualMachine']>[0];
      const id = s.mode.maquina;
      const me = this.gc.pred;
      const map = this.gc.map;
      // aberta pelo atendente, longe do espelho: anda até a máquina e manda ao chegar
      if (map && me && !nearVisualMachine({ map, x: me.x, y: me.y }, id)) {
        const mk = map.markers.find((m) => m.kind === 'maquina_visual' && (m.ref ?? m.id) === id);
        if (mk && (this.gc.goTo(mk.x, mk.y + 0.8) || this.gc.goTo(mk.x, mk.y))) {
          this.queuedMachine = { change, id, until: now + MACHINE_WALK_MS };
          this.editor.close();
          // SUGESTÃO: aviso enquanto anda até a máquina
          this.gc.game.pushToast('Indo até o espelho...', 'info', now);
          return;
        }
      }
      this.pending = { kind: 'maquina', at: now, profile: this.gc.game.profile };
      this.gc.visualMachine(change, id);
    }
  }

  /** Mudança guardada enquanto anda até a máquina: manda quando chegar perto. */
  private tickQueuedMachine(now: number): void {
    const q = this.queuedMachine;
    if (!q) return;
    const me = this.gc.pred;
    const map = this.gc.map;
    if (now > q.until || !map || !me) {
      this.queuedMachine = null;
      return;
    }
    if (!nearVisualMachine({ map, x: me.x, y: me.y }, q.id)) return;
    this.queuedMachine = null;
    this.pending = { kind: 'maquina', at: now, profile: this.gc.game.profile };
    this.gc.visualMachine(q.change, q.id);
  }

  private openMachine(id = this.machineNear): void {
    const p = this.gc.game.profile;
    if (!id || !p) return;
    this.closeDialog();
    this.editor.open(newEditor({ kind: 'maquina', maquina: id, termos: false }, p));
  }

  private onTrackerTap(): void {
    const game = this.gc.game;
    const alvo = game.missions?.alvo;
    if (!alvo) return;
    if (!this.gc.autoPath()) {
      // SUGESTÃO: aviso do auto-caminho sem rumo neste mapa
      game.pushToast(alvo.mapa !== this.gc.world.mapId ? 'Esse objetivo é em outro lugar.' : alvo.descricao, 'info', performance.now());
    }
  }

  /** A cada quadro. */
  update(now: number, f: UiFrame): void {
    const game = this.gc.game;
    const p = game.profile;
    if (!p || !this.gc.welcomed) {
      this.hideHud();
      return;
    }
    // criação: abre sozinha enquanto não tiver cadastro
    if (game.needsCreation && !this.editor.isOpen && !this.creationSent) {
      this.closeDialog();
      this.editor.open(newEditor({ kind: 'criacao' }, p));
      this.creationSent = true;
    }
    if (!game.needsCreation) this.creationSent = false;
    this.tickQueuedMachine(now);
    this.resolvePending(now);
    // telas pedidas pelo servidor
    for (let req = game.takeScreen(); req; req = game.takeScreen()) {
      if (req.tela === 'travessia') {
        this.closeDialog();
        this.editor.close();
        this.travessia.open(req.opcoes);
      } else {
        this.openMachine(req.maquina);
      }
    }
    // diálogo
    const d = game.dialog;
    if (d && d !== this.dialogShown) {
      this.dialogShown = d;
      if (d.fala || d.opcoes.length > 0) this.dialog.open(d, now);
      else game.closeDialog();
    }
    if (!d && this.dialog.isOpen) this.dialog.close();
    this.editor.update(now);
    this.dialog.update(now);
    this.travessia.update();
    if (this.modalOpen) {
      this.hideHud();
      return;
    }
    this.updateTracker(f);
    this.updateHint(f);
    this.updateToasts(now, f);
    this.updateLevel(now);
    this.updateMachine(f);
  }

  /** Resposta do servidor ao que a tela mandou: perfil novo fecha; erro mostra na tela. */
  private resolvePending(now: number): void {
    const pd = this.pending;
    if (!pd) return;
    const game = this.gc.game;
    const err = game.lastError;
    if (err && err.at >= pd.at - 1) {
      this.pending = null;
      if (pd.kind === 'travessia') this.travessia.showError(err.texto);
      else this.editor.showError(err.texto);
      return;
    }
    const p = game.profile;
    if (p && p !== pd.profile) {
      const ok = pd.kind === 'criacao' ? p.criado : pd.kind === 'travessia' ? p.stage === 'margem' : true;
      if (!ok) return;
      this.pending = null;
      if (pd.kind === 'travessia') this.travessia.close();
      else this.editor.close();
      // SUGESTÃO: aviso de visual salvo
      if (pd.kind === 'maquina') game.pushToast('Visual novo salvo!', 'info', now);
    }
    // sem resposta em 8 s: libera a tela para tentar de novo
    if (this.pending && now - pd.at > 8000) {
      this.pending = null;
      const msg = 'Sem resposta do servidor. Tente de novo.';
      if (pd.kind === 'travessia') this.travessia.showError(msg);
      else this.editor.showError(msg);
    }
  }

  private hideHud(): void {
    this.tracker.style.display = 'none';
    this.hint.style.display = 'none';
    this.toastsBox.style.display = 'none';
    this.levelBox.style.display = 'none';
    this.machineBtn.style.display = 'none';
  }

  private updateTracker(f: UiFrame): void {
    const ms = this.gc.game.missions;
    const a = ms?.ativas[0];
    if (!ms || !a) {
      this.tracker.style.display = 'none';
      this.trackerSig = '';
      return;
    }
    const obj = ms.objetivo ?? a.objetivo;
    const prog = a.meta > 1 ? ` (${a.feito}/${a.meta})` : '';
    const blink = this.gc.game.tutorialStep()?.id === 'botao';
    const sig = `${a.name}|${obj}|${prog}|${blink}`;
    this.tracker.style.display = '';
    this.tracker.style.top = `${Math.round(f.topCss)}px`;
    if (sig === this.trackerSig) return;
    this.trackerSig = sig;
    this.tracker.innerHTML = '';
    this.tracker.appendChild(el('div', 'pe'));
    this.tracker.appendChild(el('div', 'missao', a.name));
    this.tracker.appendChild(el('div', 'obj', obj + prog));
    this.tracker.classList.toggle('pisca', blink);
  }

  private updateHint(f: UiFrame): void {
    const step = this.gc.game.tutorialStep();
    if (!step || this.dialog.isOpen) {
      this.hint.style.display = 'none';
      return;
    }
    this.hint.style.display = '';
    if (this.hint.textContent !== step.texto) this.hint.textContent = step.texto;
    // andar: perto do polegar esquerdo; o resto, embaixo do rastreador
    if (step.id === 'andar') {
      this.hint.style.top = '';
      this.hint.style.bottom = '30%';
      this.hint.style.left = '12px';
      this.hint.style.transform = 'none';
    } else {
      this.hint.style.bottom = '';
      this.hint.style.left = '50%';
      this.hint.style.transform = 'translateX(-50%)';
      this.hint.style.top = `${Math.round(f.topCss + 64)}px`;
    }
  }

  private updateToasts(now: number, f: UiFrame): void {
    const list = this.gc.game.liveToasts(now, TOAST_MS).slice(-MAX_TOASTS_ON_SCREEN);
    this.toastsBox.style.display = list.length > 0 ? '' : 'none';
    this.toastsBox.style.top = `${Math.round(f.topCss + 110)}px`;
    const sig = list.map((t) => `${t.id}:${t.texto}`).join('|');
    if (sig === this.toastSig) return;
    this.toastSig = sig;
    this.toastsBox.innerHTML = '';
    for (const t of list) {
      const d = el('div', `aviso sombra ${t.tipo}`, t.texto);
      if (t.sub) d.appendChild(el('small', '', t.sub));
      this.toastsBox.appendChild(d);
    }
  }

  private updateLevel(now: number): void {
    const lu = this.gc.game.levelUp;
    const on = lu !== null && now - lu.at < LEVEL_BANNER_MS;
    this.levelBox.style.display = on ? '' : 'none';
    if (!on || !lu) return;
    const sig = `${lu.level}|${lu.desbloqueios.length}`;
    if (sig === this.levelSig) return;
    this.levelSig = sig;
    this.levelBox.innerHTML = '';
    this.levelBox.appendChild(el('div', 'n sombra', `Nível ${lu.level}!`));
    for (const u of lu.desbloqueios.slice(0, 3)) this.levelBox.appendChild(el('div', 'd', `Novo: ${u.descricao}`));
  }

  private updateMachine(f: UiFrame): void {
    const map = this.gc.map;
    const p = this.gc.game.profile;
    let near: string | undefined;
    if (map && f.selfTile && p && p.criado && !this.dialog.isOpen) {
      near = nearVisualMachine({ map, x: f.selfTile.x, y: f.selfTile.y });
      if (near && !canUseMachine({ side: p.side } as unknown as PlayerRecord, near).ok) near = undefined;
    }
    this.machineNear = near;
    this.machineBtn.style.display = near ? '' : 'none';
    if (near) {
      const name = getData().institutions.maquinasVisual.find((m) => m.id === near)?.name ?? 'Máquina de Visual';
      if (this.machineBtn.textContent !== name) this.machineBtn.textContent = name;
      this.machineBtn.style.bottom = '38%';
    }
  }
}

let ui: UiController | undefined;

/** O controlador da página (criado na primeira vez). */
export function getUi(gc: GameClient, art: ArtApi, scene: () => Phaser.Scene | undefined): UiController {
  if (!ui) ui = new UiController(gc, art, scene);
  return ui;
}
