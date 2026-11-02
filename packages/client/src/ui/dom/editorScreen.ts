/**
 * Editor de visual em DOM: a tela de criação do Delta e a Máquina de Visual (o mesmo editor).
 * Prévia grande do boneco girando nas 4 direções, abas (corpo, pele, rosto, cabelo, cor do cabelo,
 * detalhes, camiseta/traje e, na máquina, os visuais liberados), "Sortear", nome e "Pronto".
 * A Cabine Neon mostra os termos antes de abrir.
 */
import type * as Phaser from 'phaser';
import { getData } from '@pqp/shared';
import type { ArtApi } from '../../art/contract';
import {
  checkEditor,
  choose,
  optionsOf,
  previewLook,
  randomize,
  tabsOf,
  uiRng,
  type CreatorTab,
  type EditorState,
} from '../creatorModel';
import { button, el } from './styles';
import { drawFrame, spinFrame } from './sprite';
import { pixellabSheet } from '../../art/pixellab';

export interface EditorDeps {
  scene: () => Phaser.Scene | undefined;
  art: ArtApi;
  /** "Pronto": o controlador manda criar_personagem ou maquina_visual */
  onDone: (s: EditorState) => void;
  onCancel: () => void;
}

const COLOR_TABS: ReadonlySet<CreatorTab> = new Set(['pele', 'cor_cabelo', 'camiseta']);

export class EditorScreen {
  private box: HTMLDivElement | null = null;
  private s: EditorState | null = null;
  private cv: HTMLCanvasElement | null = null;
  private ops: HTMLDivElement | null = null;
  private abas: HTMLDivElement | null = null;
  private erro: HTMLDivElement | null = null;
  private nome: HTMLInputElement | null = null;
  private pronto: HTMLButtonElement | null = null;
  private sheetKey = '';
  private sheetScale = 4;
  private sheetDirty = true;
  private paused = false;
  private t0 = 0;
  private waiting = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly deps: EditorDeps,
  ) {}

  get isOpen(): boolean {
    return this.box !== null;
  }

  get state(): EditorState | null {
    return this.s;
  }

  open(s: EditorState): void {
    this.close();
    this.s = s;
    this.waiting = false;
    const box = el('div', 'modal');
    this.box = box;
    this.root.appendChild(box);
    const D = getData();
    if (s.mode.kind === 'maquina') {
      const mq = D.institutions.maquinasVisual.find((m) => m.id === (s.mode as { maquina: string }).maquina);
      if (mq?.mostraTermosAntesDeAbrir && !s.mode.termos) {
        this.renderTerms(mq.name, (mq as { termosDeUso?: { titulo: string; clausulas: string[] } }).termosDeUso);
        return;
      }
    }
    this.render();
  }

  close(): void {
    this.box?.remove();
    this.box = null;
    this.s = null;
    this.cv = null;
    this.ops = null;
    this.nome = null;
  }

  /** O servidor recusou: mostra o erro e libera o "Pronto". */
  showError(text: string): void {
    this.waiting = false;
    if (this.pronto) this.pronto.disabled = false;
    if (this.erro) this.erro.textContent = text;
  }

  private renderTerms(name: string, termos: { titulo: string; clausulas: string[] } | undefined): void {
    const box = this.box!;
    box.innerHTML = '';
    const p = el('div', 'painel termos');
    p.appendChild(el('h1', 'sombra', name));
    p.appendChild(el('div', 'sub', termos?.titulo ?? 'Termos de Uso'));
    const letra = el('div', 'letra');
    letra.textContent = (termos?.clausulas ?? []).join(' ');
    p.appendChild(letra);
    const row = el('div', 'ed-baixo');
    row.appendChild(button('Voltar', 'sec', () => this.deps.onCancel()));
    // SUGESTÃO: texto do botão de aceite (o termo diz "ACEITO")
    row.appendChild(
      button('ACEITO', 'ok', () => {
        if (this.s && this.s.mode.kind === 'maquina') this.s.mode.termos = true;
        this.render();
      }),
    );
    p.appendChild(row);
    box.appendChild(p);
  }

  private render(): void {
    const s = this.s!;
    const box = this.box!;
    box.innerHTML = '';
    const D = getData();
    const titulo =
      s.mode.kind === 'criacao'
        ? 'Cadastro do Delta'
        : (D.institutions.maquinasVisual.find((m) => m.id === (s.mode as { maquina: string }).maquina)?.name ?? 'Máquina de Visual');
    box.appendChild(el('h1', 'sombra', titulo));
    // SUGESTÃO: linha de apoio de cada tela
    box.appendChild(el('div', 'sub', s.mode.kind === 'criacao' ? 'Monte o seu boneco. O Seu Jacó não repara.' : 'Grátis e sem limite. A silhueta da ala fica.'));

    const topo = el('div', 'ed-topo');
    const previa = el('div', 'ed-previa painel');
    previa.appendChild(el('div', 'ed-chao'));
    const cv = el('canvas', 'px');
    previa.appendChild(cv);
    previa.style.pointerEvents = 'auto';
    previa.addEventListener('click', () => (this.paused = !this.paused));
    this.cv = cv;
    topo.appendChild(previa);
    const lado = el('div', 'ed-lado');
    if (s.mode.kind === 'criacao') {
      const nome = el('input', 'ed-nome');
      nome.type = 'text';
      nome.maxLength = getData().appearance.nome.maxCaracteres;
      // SUGESTÃO: texto de exemplo do campo de nome
      nome.placeholder = 'Seu nome';
      nome.autocomplete = 'off';
      nome.spellcheck = false;
      nome.value = s.name;
      nome.addEventListener('input', () => {
        s.name = nome.value;
        if (this.erro) this.erro.textContent = '';
      });
      nome.addEventListener('keydown', (ev) => ev.stopPropagation());
      lado.appendChild(nome);
      this.nome = nome;
    }
    lado.appendChild(
      button('Sortear', 'sec', () => {
        randomize(s, uiRng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0));
        this.sheetDirty = true;
        this.renderOptions();
      }),
    );
    const erro = el('div', 'erro');
    this.erro = erro;
    lado.appendChild(erro);
    topo.appendChild(lado);
    box.appendChild(topo);

    const abas = el('div', 'ed-abas rola');
    this.abas = abas;
    box.appendChild(abas);
    const ops = el('div', 'ed-ops painel rola');
    this.ops = ops;
    box.appendChild(ops);

    const baixo = el('div', 'ed-baixo');
    if (s.mode.kind === 'maquina') baixo.appendChild(button('Cancelar', 'sec', () => this.deps.onCancel()));
    const pronto = button('Pronto', 'ok', () => this.done());
    this.pronto = pronto;
    baixo.appendChild(pronto);
    box.appendChild(baixo);
    this.sheetDirty = true;
    this.renderTabs();
    this.renderOptions();
  }

  private renderTabs(): void {
    const s = this.s!;
    const abas = this.abas!;
    abas.innerHTML = '';
    for (const t of tabsOf(s)) {
      const b = button(t.label, s.tab === t.id ? 'on' : '', () => {
        s.tab = t.id;
        this.renderTabs();
        this.renderOptions();
      });
      abas.appendChild(b);
    }
  }

  private renderOptions(): void {
    const s = this.s!;
    const ops = this.ops!;
    ops.innerHTML = '';
    ops.classList.toggle('cores', COLOR_TABS.has(s.tab));
    for (const o of optionsOf(s)) {
      const b = el('button', `op${o.on ? ' on' : ''}${o.locked ? ' travada' : ''}`);
      b.type = 'button';
      if (o.colors || o.color) {
        const am = el('span', 'amostra');
        am.style.background = o.colors && o.colors.length > 1 ? `linear-gradient(90deg, ${o.colors.map((c, i) => `${c} ${(i * 100) / o.colors!.length}% ${((i + 1) * 100) / o.colors!.length}%`).join(', ')})` : o.color!;
        b.appendChild(am);
      }
      b.appendChild(document.createTextNode(o.name));
      if (o.locked) {
        b.appendChild(el('span', 'cadeado', '🔒'));
        b.title = o.locked;
      } else if (o.descricao) b.title = o.descricao;
      b.addEventListener('click', (ev) => {
        ev.preventDefault();
        if (o.locked) {
          if (this.erro) this.erro.textContent = o.locked;
          return;
        }
        if (choose(s, s.tab, o.id)) {
          this.sheetDirty = true;
          if (this.erro) this.erro.textContent = '';
          if (s.tab === 'visual') this.renderTabs();
          this.renderOptions();
        }
      });
      ops.appendChild(b);
    }
  }

  private done(): void {
    const s = this.s;
    if (!s || this.waiting) return;
    const erros = checkEditor(s);
    if (erros.length > 0) {
      this.showError(erros[0]!);
      return;
    }
    if (s.mode.kind === 'criacao' && s.name.trim().length < getData().appearance.nome.minCaracteres) {
      // SUGESTÃO: aviso do nome vazio
      this.showError('Escreva o seu nome.');
      this.nome?.focus();
      return;
    }
    this.nome?.blur();
    this.waiting = true;
    if (this.pronto) this.pronto.disabled = true;
    this.deps.onDone(s);
  }

  /** A cada quadro: gera a folha nova (se mudou) e anima a prévia. */
  update(now: number): void {
    const s = this.s;
    const cv = this.cv;
    const scene = this.deps.scene();
    if (!s || !cv || !scene) return;
    if (this.sheetDirty) {
      this.sheetDirty = false;
      try {
        // v0.4: a prévia é o boneco do PixelLab do mundo, com a pele, o cabelo e a camiseta pintados
        const look = previewLook(s);
        const pl = pixellabSheet(scene, look);
        this.sheetScale = pl ? 2 : 4;
        this.sheetKey = pl ?? this.deps.art.characterSheet(scene, look);
      } catch {
        this.sheetKey = '';
      }
    }
    if (!this.sheetKey) return;
    if (!this.t0) this.t0 = now;
    const t = this.paused ? 0 : now - this.t0;
    const f = spinFrame(t);
    drawFrame(scene, cv, this.sheetKey, this.paused ? `parado_0_0` : f.frame, this.sheetScale);
  }
}
