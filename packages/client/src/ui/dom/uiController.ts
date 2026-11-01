/**
 * Controlador da interface em DOM, por cima do canvas: liga o GameState (o que o servidor disse) às
 * telas — criação de personagem, Máquina de Visual, diálogo, travessia — e ao HUD leve.
 *
 * Revisão visual: o centro da tela (Z0, em volta do boneco) fica livre. O HUD leve vai para zonas:
 * - Z1 (topo, entre a engrenagem e o MENU): rastreador de missão compacto, numa linha (tocar liga o
 *   auto-caminho); a barra do chefe e a linha do andar da masmorra entram no lugar dele;
 * - Z2 (logo abaixo): UMA faixa de mensagens, uma por vez, em fila — avisos, saque, aviso do mapa,
 *   fala do guia, banner de nível e, sem aviso na fila, a dica do tutorial;
 * - Z5: o MENU (carteira, Perfil, Habilidades, Mochila, Doutrina, Mapa, Bordão);
 * - Z6: a coluna dos botões de perto (loja, feira, câmbio, Máquina de Visual, plantão, masmorra), à
 *   direita do FALAR, e o cartão de habilidade de primeira vez, à esquerda do arco;
 * - Z7: a dica do andar, perto do polegar esquerdo.
 *
 * Um só por página (o HUD do Phaser reinicia no resize; isto não). No modo protótipo (sem perfil),
 * só o cartão de habilidade aparece.
 */
import type * as Phaser from 'phaser';
import { getData } from '@pqp/shared';
import { isBoatRoom } from '@pqp/shared/map';
import { canUseMachine, nearVisualMachine } from '@pqp/shared/game/visual';
import type { PlayerRecord } from '@pqp/shared/game/types';
import type { Vec } from '@pqp/shared/sim';
import type { ArtApi } from '../../art/contract';
import type { GameClient } from '../../game/GameClient';
import type { Toast } from '../../game/gameState';
import { newEditor, visualChange, type EditorState } from '../creatorModel';
import { DialogBox } from './dialogBox';
import { EditorScreen } from './editorScreen';
import { button, el, uiRoot } from './styles';
import { TravessiaScreen } from './travessiaScreen';
import { Fase3Ui, type Fase3Screen } from './progressScreens';
import { Fase4Ui, screenOfSpot, type Fase4Screen } from './economyScreens';
import { npcSpots, spotLabel } from '../economyModel';
import { Fase5Ui, type Fase5Screen } from './fase5Screens';
import { BoatScene } from './boatScene';
import { MenuUi, type MenuItem } from './menu';
import { AbilityCard, type CardButton } from './abilityCard';
import type { CardSlot } from '../abilityIntro';
import { LEVEL_BANNER_MS, TOAST_STALE_MS, toastDuration, trackedMission } from '../zonesModel';

// SUGESTÃO: até 10 s andando até a Máquina de Visual depois do "Pronto" longe dela.
export const MACHINE_WALK_MS = 10000;
export { LEVEL_BANNER_MS, MAX_TOASTS_ON_SCREEN, TOAST_MS } from '../zonesModel';

export interface UiCircle {
  x: number;
  y: number;
  r: number;
}

export interface UiFrame {
  /** Z2: topo da faixa de mensagens (px de CSS) */
  topCss: number;
  /** posição desenhada do próprio personagem (tiles) */
  selfTile: Vec | null;
  /** Z1: faixa do rastreador (px de CSS) */
  band?: { x: number; y: number; w: number };
  /** a barra do chefe ocupa a faixa do rastreador agora */
  bossOn?: boolean;
  /** Z5: onde fica o MENU (px de CSS) */
  menu?: UiCircle;
  /** Z6: a coluna de perto: borda esquerda, base e borda direita (px de CSS) */
  perto?: { x: number; bottom: number; right: number };
  /** botões de habilidade (para o cartão de primeira vez) */
  buttons?: Record<CardSlot, CardButton>;
  /** tamanho da tela (px de CSS) */
  cw?: number;
  ch?: number;
  /** nome do recurso da classe (custo no cartão) */
  resourceName?: string;
  /** o polegar está no joystick: o cartão de habilidade (embaixo à esquerda) sai e o tempo dele para */
  joy?: boolean;
  /** a dica "Arraste aqui para andar" do protótipo está na tela (no mesmo canto do cartão): o cartão espera */
  walkTip?: boolean;
}

export class UiController {
  readonly root: HTMLDivElement;
  readonly editor: EditorScreen;
  readonly dialog: DialogBox;
  readonly travessia: TravessiaScreen;
  /** Fase 3: ala, talentos, botão 3, bordões, painel, habilidades e troca de mapa */
  readonly fase3: Fase3Ui;
  /** Fase 4: carteira, loja, feira/app, câmbio, casa e os botões de perto */
  readonly fase4: Fase4Ui;
  /** Fase 5: mochila, Doutrina, plantão, masmorra, avisos do mapa e pontos de controle */
  readonly fase5: Fase5Ui;
  /** Fase 5: cena do barco da travessia */
  readonly boat: BoatScene;
  /** Z5: o MENU */
  readonly menu: MenuUi;
  /** cartão de habilidade de primeira vez */
  readonly card: AbilityCard;
  /** HUD do Phaser: anda até onde a seta aponta, quando o objetivo não tem lugar (true = foi) */
  goToCompass?: () => boolean;
  private tracker: HTMLDivElement;
  private trackerSig = '';
  private hint: HTMLDivElement;
  private strip: HTMLDivElement;
  private stripSig = '';
  private cur: { t: Toast; from: number } | null = null;
  /** hora (t.at) em que cada aviso foi mostrado; um aviso somado depois volta para a fila */
  private shownAt = new Map<number, number>();
  private pertoCol: HTMLDivElement;
  private machineBtn: HTMLButtonElement;
  private machineNear: string | undefined;
  private creationSent = false;
  private pending: { kind: 'maquina' | 'travessia' | 'criacao'; at: number; profile: unknown } | null = null;
  private dialogShown: unknown = null;
  private queuedMachine: { change: Parameters<GameClient['visualMachine']>[0]; id: string; until: number } | null = null;
  /** mapa do último quadro (a chegada do barco no cais toca a transição curta) */
  private lastMapId = '';

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
      // Fase 4: o NPC da loja, o cambista, o entregador e a vizinha da feira abrem as telas
      extras: (npc) => {
        const p = this.gc.game.profile;
        const me = this.gc.pred;
        if (!p || p.stage !== 'margem' || !me) return [];
        return npcSpots(npc, this.gc.map, me.x, me.y, p.side).map((s) => ({
          texto: spotLabel(s),
          onTap: () => {
            const d = this.dialog.current;
            if (d && d.opcoes.some((o) => o.id === 'tchau')) this.gc.dialogOption(d.npc, 'tchau');
            this.closeDialog();
            this.openEconomy(screenOfSpot(s));
          },
        }));
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
    this.strip = el('div', 'faixa sombra');
    this.strip.style.display = 'none';
    this.strip.style.pointerEvents = 'none';
    this.root.appendChild(this.strip);
    this.pertoCol = el('div', 'perto-col');
    this.root.appendChild(this.pertoCol);
    // SUGESTÃO: texto do botão da máquina
    this.machineBtn = button('Mudar o visual', 'ok', () => this.openMachine());
    this.machineBtn.style.display = 'none';
    this.fase3 = new Fase3Ui(this.root, gc, art, scene);
    this.fase4 = new Fase4Ui(this.root, gc, art, scene);
    this.fase5 = new Fase5Ui(this.root, gc, art, scene);
    // Z6: os botões de perto das Fases 2, 4 e 5 numa coluna só, de baixo para cima
    this.pertoCol.appendChild(this.machineBtn);
    this.pertoCol.appendChild(this.fase4.near);
    this.pertoCol.appendChild(this.fase5.near);
    this.pertoCol.appendChild(this.fase5.floorBtns);
    this.boat = new BoatScene(this.root);
    this.card = new AbilityCard(this.root, art, scene);
    this.menu = new MenuUi(this.root, () => this.menuItems());
  }

  /** Tela que tapa o mundo aberta (criação, máquina, travessia, telas das Fases 3, 4 e 5, MENU): o HUD do Phaser não recebe toque nem tecla. */
  get modalOpen(): boolean {
    return this.editor.isOpen || this.travessia.isOpen || this.fase3.isOpen || this.fase4.isOpen || this.fase5.isOpen || this.boat.isOpen || this.menu.isOpen;
  }

  /** O jogador usou o botão de habilidade: o cartão de primeira vez dele some. */
  abilityUsed(slot: CardSlot): void {
    this.card.used(slot);
  }

  /** Abre uma tela da Fase 5 (mochila, Doutrina, plantão, pontos de controle). */
  openFase5(s: Fase5Screen): void {
    const p = this.gc.game.profile;
    if (!p || !p.criado || this.editor.isOpen || this.travessia.isOpen) return;
    this.closeDialog();
    this.menu.close();
    this.fase3.close();
    this.fase4.close();
    this.fase5.open(s);
  }

  /** Abre uma tela da Fase 4 (carteira, loja, feira/app, câmbio, casa). */
  openEconomy(s: Fase4Screen): void {
    const p = this.gc.game.profile;
    if (!p || !p.criado || this.editor.isOpen || this.travessia.isOpen) return;
    this.closeDialog();
    this.menu.close();
    this.fase3.close();
    this.fase5.close();
    this.fase4.open(s);
  }

  /** Abre uma tela da Fase 3 (o toque no quadro do jogador abre o painel). */
  openScreen(kind: Fase3Screen): void {
    const p = this.gc.game.profile;
    if (!p || !p.criado || this.editor.isOpen || this.travessia.isOpen) return;
    this.closeDialog();
    this.menu.close();
    this.fase4.close();
    this.fase5.close();
    this.fase3.open(kind);
  }

  get dialogOpen(): boolean {
    return this.dialog.isOpen;
  }

  /** Itens da gaveta do MENU (SUGESTÃO: textos). */
  private menuItems(): MenuItem[] {
    const g = this.gc.game;
    const p = g.profile;
    if (!p) return [];
    const out: MenuItem[] = [];
    const margem = p.stage === 'margem';
    const pend = g.pendingChoice;
    if (pend === 'ala') out.push({ label: 'Escolher a ala!', pisca: true, onTap: () => this.openScreen('ala') });
    else if (pend === 'talento') out.push({ label: 'Escolher talento!', pisca: true, onTap: () => this.openScreen('talento') });
    if (margem) out.push({ label: `Carteira · ${this.fase4.walletText}`, alerta: this.fase4.walletAlert, onTap: () => this.openEconomy({ tela: 'carteira' }) });
    out.push({ label: 'Perfil', selo: g.novidadesNaoVistas, onTap: () => this.openScreen('painel') });
    out.push({ label: 'Habilidades', onTap: () => this.openScreen('habilidades') });
    if (margem) {
      out.push({ label: 'Mochila', onTap: () => this.openFase5('itens') });
      out.push({ label: 'Doutrina', onTap: () => this.openFase5('doutrina') });
      out.push({ label: 'Mapa', onTap: () => this.openFase5('faccao') });
    }
    if ((p.emotes ?? []).length > 0) out.push({ label: 'Bordão', onTap: () => this.openScreen('emotes') });
    return out;
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
    const tm = trackedMission(game.missions, game.profile?.stage);
    if (!tm) return;
    const alvo = game.missions?.alvo;
    if (tm.first && alvo && this.gc.autoPath()) return;
    // objetivo sem lugar (luta do Delta): vai até o bando que a seta do HUD aponta
    if (this.goToCompass?.()) return;
    // SUGESTÃO: aviso do auto-caminho sem rumo neste mapa
    const txt = tm.first && alvo ? (alvo.mapa !== this.gc.world.mapId ? 'Esse objetivo é em outro lugar.' : alvo.descricao) : tm.a.objetivo;
    game.pushToast(txt, 'info', performance.now());
  }

  /** A cada quadro. */
  update(now: number, f: UiFrame): void {
    const game = this.gc.game;
    const p = game.profile;
    // travessia: o barco encostou no cais (saiu da sala do barco para a margem): transição curta
    const mapNow = this.gc.welcomed ? this.gc.world.mapId : this.lastMapId;
    if (mapNow !== this.lastMapId) {
      if (isBoatRoom(this.lastMapId) && !isBoatRoom(mapNow) && p?.stage === 'margem') this.boat.play(p.side, p.guide_id, now);
      this.lastMapId = mapNow;
    }
    this.boat.update(now);
    this.updateCard(now, f);
    if (!p || !this.gc.welcomed) {
      this.hideHud();
      // a transição de mapa continua na tela enquanto a sala nova não responde
      this.fase3.update(now, { free: false });
      this.fase4.update(now, { selfTile: null, free: false });
      this.fase5.update(now, { selfTile: null, free: false });
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
        this.menu.close();
        this.travessia.open(req.opcoes);
      } else {
        this.menu.close();
        this.openMachine(req.maquina);
      }
    }
    // diálogo
    const d = game.dialog;
    if (d && d !== this.dialogShown) {
      this.dialogShown = d;
      if (d.fala || d.opcoes.length > 0) {
        this.menu.close();
        this.dialog.open(d, now);
      } else game.closeDialog();
    }
    if (!d && this.dialog.isOpen) this.dialog.close();
    this.editor.update(now);
    this.dialog.update(now);
    this.travessia.update();
    const free = !this.editor.isOpen && !this.travessia.isOpen && !this.dialog.isOpen && !this.boat.isOpen && !this.menu.isOpen;
    this.fase3.update(now, { free: free && !this.fase4.isOpen && !this.fase5.isOpen });
    this.fase4.update(now, { selfTile: f.selfTile, free: free && !this.fase3.isOpen && !this.fase5.isOpen });
    this.fase5.update(now, {
      selfTile: f.selfTile,
      free: free && !this.fase3.isOpen && !this.fase4.isOpen,
      ...(f.band ? { band: f.band } : {}),
      bossOn: f.bossOn === true,
    });
    if (this.modalOpen) {
      this.hideHud();
      return;
    }
    this.updateMenu(f);
    this.updateTracker(f);
    this.updateHint();
    this.updateStrip(now, f);
    this.updateMachine(f);
    this.placePerto(f);
  }

  /** Cartão de habilidade de primeira vez: vale também no protótipo (troca de ala com o Wesley e o Li Wei). */
  private updateCard(now: number, f: UiFrame): void {
    if (!f.buttons || f.cw === undefined || f.ch === undefined) return;
    const step = this.gc.game.tutorialStep();
    // o primeiro passo do Delta é só andar: os cartões esperam o joystick
    // com o polegar no joystick o cartão cobriria o próprio joystick: espera o polegar sair
    const free = this.gc.welcomed && !this.modalOpen && !this.dialog.isOpen && !f.joy && !f.walkTip && !(step && step.id === 'andar');
    const side = this.gc.game.profile?.side ?? null;
    this.card.update(now, { slots: f.buttons, free, cw: f.cw, ch: f.ch, side, ...(f.resourceName ? { resourceName: f.resourceName } : {}) });
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
      // a escolha foi no barco: a aula começa ali mesmo (a chegada no cais tem a transição curta)
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
    this.strip.style.display = 'none';
    this.machineBtn.style.display = 'none';
    this.pertoCol.style.display = 'none';
    this.menu.update({ x: 0, y: 0, r: 0, show: false, selo: '' });
  }

  private updateMenu(f: UiFrame): void {
    const g = this.gc.game;
    const p = g.profile;
    const show = !!p && p.criado && !!f.menu && !this.dialog.isOpen;
    const selo = g.pendingChoice || g.novidadesNaoVistas || this.fase4.walletAlert ? '!' : '';
    const m = f.menu ?? { x: 0, y: 0, r: 0 };
    this.menu.update({ x: m.x, y: m.y, r: m.r, show, selo });
  }

  private updateTracker(f: UiFrame): void {
    const g = this.gc.game;
    const ms = g.missions;
    const tm = trackedMission(ms, g.profile?.stage);
    // no barco quem guia é o Seu Jacó e a dica do convés; na masmorra a faixa é do andar; com o chefe
    // perto, a faixa é da barra dele
    if (!ms || !tm || !f.band || f.bossOn || isBoatRoom(this.lastMapId) || g.inDungeon || this.dialog.isOpen) {
      this.tracker.style.display = 'none';
      return;
    }
    const a = tm.a;
    const obj = (tm.first ? ms.objetivo : null) ?? a.objetivo;
    const prog = a.meta > 1 ? ` (${a.feito}/${a.meta})` : '';
    const blink = g.tutorialStep()?.destaca === 'rastreador_missao';
    const b = f.band;
    const sig = `${obj}|${prog}|${blink}|${Math.round(b.x)}|${Math.round(b.y)}|${Math.round(b.w)}`;
    this.tracker.style.display = '';
    if (sig === this.trackerSig) return;
    this.trackerSig = sig;
    const s = this.tracker.style;
    s.left = `${Math.round(b.x + b.w / 2)}px`;
    s.transform = 'translateX(-50%)';
    s.top = `${Math.round(b.y)}px`;
    s.maxWidth = `${Math.round(b.w)}px`;
    this.tracker.innerHTML = '';
    this.tracker.appendChild(el('div', 'pe'));
    this.tracker.appendChild(el('div', 'obj', obj + prog));
    this.tracker.title = `${a.name}: ${obj}`;
    this.tracker.classList.toggle('pisca', blink);
  }

  /** Dica do andar: perto do polegar esquerdo (Z7). As outras entram na faixa de mensagens. */
  private updateHint(): void {
    const step = this.gc.game.tutorialStep();
    if (!step || this.dialog.isOpen || step.destaca !== 'joystick') {
      this.hint.style.display = 'none';
      return;
    }
    this.hint.style.display = '';
    if (this.hint.textContent !== step.texto) this.hint.textContent = step.texto;
    const s = this.hint.style;
    s.left = '12px';
    s.bottom = '30%';
  }

  /**
   * Z2: uma mensagem por vez, em fila. O banner de nível passa na frente; sem aviso na fila, a faixa
   * mostra a dica do tutorial (a seta em cima do botão citado é do HUD do Phaser).
   */
  private updateStrip(now: number, f: UiFrame): void {
    const g = this.gc.game;
    const top = Math.round(f.topCss);
    const lu = g.levelUp;
    if (lu && now - lu.at < LEVEL_BANNER_MS) {
      const des = lu.desbloqueios;
      // SUGESTÃO: subtítulo do banner de nível
      const sub = des.length === 0 ? '' : des.length === 1 && des[0]!.descricao.length <= 44 ? `Novo: ${des[0]!.descricao}` : `${des.length} novidades: veja no MENU, em Perfil`;
      this.showStrip(`nivel|${lu.level}|${sub}`, 'faixa sombra nivel', top, (box) => {
        box.appendChild(el('div', 'n', `Nível ${lu.level}!`));
        if (sub) box.appendChild(el('small', '', sub));
      });
      return;
    }
    // fila: avisos novos (ou somados depois de mostrados), sem os velhos demais
    const ids = new Set(g.toasts.map((t) => t.id));
    for (const id of this.shownAt.keys()) if (!ids.has(id)) this.shownAt.delete(id);
    const cur = this.cur;
    if (cur && !ids.has(cur.t.id)) this.cur = null;
    if (this.cur && this.cur.t.at !== this.shownAt.get(this.cur.t.id)) {
      // o aviso na tela foi somado (saque seguido): renova
      this.shownAt.set(this.cur.t.id, this.cur.t.at);
      this.cur.from = now;
    }
    const pend = g.toasts.filter((t) => t !== this.cur?.t && now - t.at < TOAST_STALE_MS && (this.shownAt.get(t.id) ?? -Infinity) < t.at);
    if (this.cur && now - this.cur.from >= toastDuration(this.cur.t, pend.length > 0)) this.cur = null;
    if (!this.cur && pend.length > 0) {
      const next = pend.find((t) => t.tipo === 'erro') ?? pend[0]!;
      this.cur = { t: next, from: now };
      this.shownAt.set(next.id, next.at);
    }
    const t = this.cur?.t;
    if (t) {
      const cls = `faixa ${t.tipo === 'guia' ? '' : 'sombra '}${t.tipo}${t.cls ? ' ' + t.cls : ''}`;
      this.showStrip(`t|${t.id}|${t.texto}|${t.sub ?? ''}|${cls}`, cls, top, (box) => {
        if (t.tipo === 'guia' && t.sub) box.appendChild(el('b', '', t.sub));
        box.appendChild(el('div', 't', t.texto));
        if (t.tipo !== 'guia' && t.sub) box.appendChild(el('small', 'sub', t.sub));
      });
      return;
    }
    const step = g.tutorialStep();
    // "A marca no chão é o seu alvo" sem nenhum alvo marcado confunde: a dica espera o primeiro inimigo
    const semAlvo = step?.destaca === 'alvo' && this.gc.currentTarget() === undefined;
    if (step && step.destaca !== 'joystick' && !semAlvo && !this.dialog.isOpen) {
      this.showStrip(`d|${step.id}|${step.texto}`, 'faixa dica2', top, (box) => box.appendChild(el('div', 't', step.texto)));
      return;
    }
    this.strip.style.display = 'none';
    this.stripSig = '';
  }

  private showStrip(sig: string, cls: string, top: number, fill: (box: HTMLDivElement) => void): void {
    const box = this.strip;
    box.style.top = `${top}px`;
    box.style.display = '';
    if (sig === this.stripSig) return;
    const changed = sig.split('|').slice(0, 2).join('|') !== this.stripSig.split('|').slice(0, 2).join('|');
    this.stripSig = sig;
    box.className = cls + (changed ? ' entra' : '');
    box.innerHTML = '';
    fill(box);
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
    }
  }

  /** Z6: a coluna de perto, à direita do FALAR e acima do AUTO, crescendo para cima. */
  private placePerto(f: UiFrame): void {
    const c = this.pertoCol;
    if (!f.perto || this.dialog.isOpen || f.ch === undefined) {
      c.style.display = 'none';
      return;
    }
    c.style.display = '';
    const s = c.style;
    s.left = `${Math.round(f.perto.x)}px`;
    s.width = `${Math.round(Math.max(96, f.perto.right - f.perto.x))}px`;
    s.bottom = `${Math.round(f.ch - f.perto.bottom)}px`;
  }
}

let ui: UiController | undefined;

/** O controlador da página (criado na primeira vez). */
export function getUi(gc: GameClient, art: ArtApi, scene: () => Phaser.Scene | undefined): UiController {
  if (!ui) ui = new UiController(gc, art, scene);
  return ui;
}
