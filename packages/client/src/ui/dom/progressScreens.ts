/**
 * Telas da Fase 3 em DOM, por cima do canvas, com botões grandes:
 * - escolha da ala no nível 12: 3 cartões com a prévia do traje de aprendiz, o treinador e as 2 marcas;
 * - escolha de talento nos níveis 10, 15 e 20, em cartões;
 * - troca do botão 3: 1 das 4 habilidades da classe;
 * - roda de emotes com os bordões liberados;
 * - painel do personagem: patente, instituição, ala, guia, talentos e botões;
 * - balão pequeno com as falas do guia;
 * - tela de transição entre mapas (nome do lugar).
 *
 * Nada aqui decide regra: as telas mostram o que o servidor mandou (perfil, 'progresso_info',
 * 'instituicao_info') e mandam o pedido (escolher_ala, escolher_talento, trocar_slot3, emote).
 */
import type * as Phaser from 'phaser';
import { getData } from '@pqp/shared';
import { resolveMapId } from '@pqp/shared/map';
import type { S2C_ProgressoOpcoes } from '@pqp/shared/net';
import type { ArtApi, CharacterLook } from '../../art/contract';
import { archetypeLook, asCharacterLook, whenSheetReady } from '../../art/index';
import type { GameClient } from '../../game/GameClient';
import { ABILITY_TYPE_LABEL, emoteText, PAPEL_LABEL } from '../progressModel';
import { button, el } from './styles';
import { drawFrame, idleFrame } from './sprite';
import { isDungeonMapId } from '../../game/dungeonMap';

// SUGESTÃO: a fala do guia fica 5,5 s no balão; a transição de mapa dura 1,5 s.
export const GUIDE_BUBBLE_MS = 5500;
export const MAP_FADE_MS = 1500;


const CSS = `
#pqp-ui .f3-linha { position: absolute; right: 8px; display: flex; gap: 6px; pointer-events: none; }
#pqp-ui .f3-linha .btn { pointer-events: auto; min-height: 48px; padding: 6px 10px; font-size: 14px; }
#pqp-ui .f3-linha .btn.pisca { background: #ffd060; animation: pqpPisca 0.9s ease-in-out infinite alternate; }
#pqp-ui .f3-lista { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; pointer-events: auto; touch-action: pan-y; min-height: 0; }
#pqp-ui .f3-cartao { padding: 10px; border: 3px solid #140c16; background: #3a2a40; box-shadow: inset -3px -3px 0 #24182a, inset 3px 3px 0 #5a4a62;
  display: flex; gap: 10px; align-items: flex-start; color: #fff6e0; font-size: 14px; }
#pqp-ui .f3-cartao.esquerda { background: #34442a; box-shadow: inset -3px -3px 0 #22301a, inset 3px 3px 0 #56703e; }
#pqp-ui .f3-cartao.direita { background: #262636; box-shadow: inset -3px -3px 0 #16162a, inset 3px 3px 0 #3a5a7a; }
#pqp-ui .f3-cartao.atual { outline: 3px solid #ffd060; }
#pqp-ui .f3-cartao .col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
#pqp-ui .f3-cartao b { color: #ffe8a0; font-size: 16px; }
#pqp-ui .f3-cartao .tag { display: inline-block; margin-left: 6px; padding: 1px 6px; background: #140c16; color: #ffd060; font-size: 11px; font-weight: bold; }
#pqp-ui .f3-cartao p { margin: 0; font-size: 13px; color: #d8d0e0; }
#pqp-ui .f3-cartao .bordao { font-style: italic; color: #fff6e0; }
#pqp-ui .f3-cartao .btn { align-self: stretch; margin-top: 4px; }
#pqp-ui .f3-previa { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 4px; }
#pqp-ui .f3-previa canvas.boneco { width: 64px; height: 96px; background: #0004; }
#pqp-ui .f3-previa canvas.retrato { width: 48px; height: 48px; border: 2px solid #140c16; background: #140c16; }
#pqp-ui .f3-cartao canvas.icone { flex: 0 0 auto; width: 48px; height: 48px; }
#pqp-ui .f3-roda { position: relative; margin: auto; width: min(92vw, 380px); height: min(92vw, 380px); pointer-events: auto; }
#pqp-ui .f3-roda .btn { position: absolute; transform: translate(-50%, -50%); width: 42%; min-height: 56px; font-size: 13px; line-height: 1.15; padding: 6px; }
#pqp-ui .f3-painel { flex: 1; overflow-y: auto; pointer-events: auto; touch-action: pan-y; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
#pqp-ui .f3-bloco { padding: 8px 10px; border: 3px solid #140c16; background: #2a1e30; box-shadow: inset 0 0 0 2px #6a4a70; }
#pqp-ui .f3-bloco h2 { font-size: 13px; color: #ffd060; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
#pqp-ui .f3-bloco p { margin: 2px 0; font-size: 14px; }
#pqp-ui .f3-bloco small { color: #c8c0d0; }
#pqp-ui .f3-botoes { display: flex; flex-wrap: wrap; gap: 6px; }
#pqp-ui .f3-botoes .btn { flex: 1 1 45%; }
#pqp-ui .f3-guia { position: absolute; left: 8px; bottom: 36%; max-width: min(64vw, 300px); padding: 8px 10px; background: #fff6e0; color: #140c16;
  border: 3px solid #140c16; box-shadow: 0 3px 0 #0009; font-size: 14px; pointer-events: none; animation: pqpEntra 0.25s ease-out; }
#pqp-ui .f3-guia b { display: block; font-size: 12px; color: #6a3a70; }
#pqp-ui .f3-guia:after { content: ''; position: absolute; left: 14px; bottom: -11px; border: 8px solid transparent; border-top-color: #140c16; }
#pqp-ui .f3-troca { position: absolute; inset: 0; background: #0d0b10; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 6px;
  pointer-events: none; animation: pqpTroca ${MAP_FADE_MS}ms ease-in forwards; z-index: 9; }
#pqp-ui .f3-troca .n { font-size: 26px; font-weight: bold; color: #ffe8a0; text-shadow: 2px 2px 0 #140c16; }
#pqp-ui .f3-troca .s { font-size: 13px; color: #c8c0d0; }
@keyframes pqpTroca { 0% { opacity: 1; } 55% { opacity: 1; } 100% { opacity: 0; } }
`;

let cssDone = false;
function injectCss(): void {
  if (cssDone || typeof document === 'undefined') return;
  const st = document.createElement('style');
  st.id = 'pqp-ui-f3-css';
  st.textContent = CSS;
  document.head.appendChild(st);
  cssDone = true;
}

export type Fase3Screen = 'ala' | 'talento' | 'slot3' | 'emotes' | 'painel';

export interface Fase3Frame {
  /** topo da linha de botões do topo (px de CSS), abaixo do quadro do jogador */
  rowTopCss: number;
  /** a interface está livre (sem diálogo, sem tela da Fase 2 aberta) */
  free: boolean;
}

/** Canvas que espera a cena (a arte é do Phaser) para desenhar. */
interface PendingDraw {
  cv: HTMLCanvasElement;
  draw: (scene: Phaser.Scene) => boolean;
}

export class Fase3Ui {
  private modal: HTMLDivElement | null = null;
  private kind: Fase3Screen | null = null;
  private erro: HTMLDivElement | null = null;
  private draws: PendingDraw[] = [];
  private dataSig: unknown[] = [];
  private shownKey = '';
  private row: HTMLDivElement;
  private rowSig = '';
  private guideBox: HTMLDivElement;
  private guideUntil = 0;
  private fadeAt = -1;
  private fadeBox: HTMLDivElement | null = null;
  private waiting = false;
  /** Fase 4: elemento que entra no começo da linha do topo (o botão da carteira) */
  rowPrefix: HTMLElement | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly gc: GameClient,
    private readonly art: ArtApi,
    private readonly scene: () => Phaser.Scene | undefined,
  ) {
    injectCss();
    this.row = el('div', 'f3-linha');
    this.row.style.display = 'none';
    root.appendChild(this.row);
    this.guideBox = el('div', 'f3-guia');
    this.guideBox.style.display = 'none';
    root.appendChild(this.guideBox);
  }

  get isOpen(): boolean {
    return this.modal !== null;
  }

  get screen(): Fase3Screen | null {
    return this.kind;
  }

  /** Abre uma tela. Ala e talento pedem as opções ao servidor; o painel pede a instituição. */
  open(kind: Fase3Screen): void {
    this.close();
    this.kind = kind;
    this.waiting = false;
    this.modal = el('div', 'modal');
    this.root.appendChild(this.modal);
    if (kind === 'ala' || kind === 'talento' || kind === 'slot3' || kind === 'painel') this.gc.requestProgress();
    if (kind === 'painel' && this.gc.game.profile?.institution) this.gc.requestInstitution();
    this.shownKey = this.dataKey();
    this.dataSig = [this.gc.game.profile, this.gc.game.progress, this.gc.game.institution];
    this.render();
  }

  close(): void {
    this.modal?.remove();
    this.modal = null;
    this.kind = null;
    this.erro = null;
    this.draws = [];
    this.dataSig = [];
    this.shownKey = '';
  }

  /** A cada quadro. */
  update(now: number, f: Fase3Frame): void {
    const game = this.gc.game;
    const p = game.profile;
    this.updateFade(now);
    this.updateGuide(now, f.free && !this.modal);
    // linha de botões do topo: só na margem (no Delta o tutorial libera os controles aos poucos)
    const showRow = f.free && !this.modal && !!p && p.criado && p.stage === 'margem';
    this.row.style.display = showRow ? '' : 'none';
    if (showRow) this.renderRow(f);
    if (!this.modal) return;
    // erro do servidor: mostra e libera o botão
    const err = game.lastError;
    if (err && this.waiting && this.erro) {
      this.waiting = false;
      this.erro.textContent = err.texto;
    }
    // dados novos (perfil, opções, instituição): redesenha só se mudou o que a tela mostra
    const sig = [p, game.progress, game.institution];
    if (sig.some((x, i) => x !== this.dataSig[i])) {
      this.dataSig = sig;
      if (this.autoClose()) return;
      const key = this.dataKey();
      if (key !== this.shownKey) {
        this.shownKey = key;
        this.render();
      }
    }
    const scene = this.scene();
    if (scene && this.draws.length > 0) {
      // uma folha de boneco por quadro (cada uma leva dezenas de ms no celular)
      const d = this.draws.shift()!;
      try {
        if (!d.draw(scene)) this.draws.push(d);
      } catch {
        // sem arte: o cartão fica só com o texto
      }
    }
  }

  /** O que a tela aberta mostra (o perfil muda a cada XP; a tela só redesenha se isto mudar). */
  private dataKey(): string {
    const g = this.gc.game;
    const p = g.profile;
    const pr = g.progress;
    switch (this.kind) {
      case 'ala':
        return JSON.stringify([pr?.ala, p?.archetype]);
      case 'talento':
        return JSON.stringify([pr?.talentos, p?.talentos]);
      case 'slot3':
        return JSON.stringify([pr?.loadout, p?.loadout]);
      case 'emotes':
        return JSON.stringify(p?.emotes);
      case 'painel':
        return JSON.stringify([p?.level, p?.semente, p?.credito, p?.rank, p?.institution_rank, p?.archetype, p?.talentos, p?.talentosPendentes, p?.loadout, p?.emotes, p?.podeEscolherAla, g.institution]);
      default:
        return '';
    }
  }

  /** Escolha feita: a tela de ala fecha quando a ala chega no perfil; a de talento sem pendência. */
  private autoClose(): boolean {
    const p = this.gc.game.profile;
    if (!p || !this.waiting) return false;
    if (this.kind === 'ala' && p.archetype) {
      this.close();
      return true;
    }
    if (this.kind === 'talento' && (p.talentosPendentes?.length ?? 0) === 0) {
      this.close();
      return true;
    }
    if (this.kind === 'slot3') this.waiting = false;
    return false;
  }

  // ---------------------------------------------------------------------------
  // linha do topo e balão do guia

  private renderRow(f: Fase3Frame): void {
    this.row.style.top = `${Math.round(f.rowTopCss)}px`;
    const p = this.gc.game.profile!;
    const pend = this.gc.game.pendingChoice;
    const sig = `${pend}|${(p.emotes ?? []).length}|${this.rowPrefix ? 1 : 0}`;
    if (sig === this.rowSig) return;
    this.rowSig = sig;
    this.row.innerHTML = '';
    if (this.rowPrefix) this.row.appendChild(this.rowPrefix);
    // SUGESTÃO: textos dos botões do topo
    if (pend === 'ala') this.row.appendChild(button('Escolher ala!', 'pisca', () => this.open('ala')));
    else if (pend === 'talento') this.row.appendChild(button('Talento!', 'pisca', () => this.open('talento')));
    if ((p.emotes ?? []).length > 0) this.row.appendChild(button('Bordão', 'sec', () => this.open('emotes')));
    this.row.appendChild(button('Perfil', 'sec', () => this.open('painel')));
  }

  private updateGuide(now: number, free: boolean): void {
    const game = this.gc.game;
    if (now >= this.guideUntil) {
      const line = free ? game.takeGuideLine() : undefined;
      if (line) {
        this.guideBox.innerHTML = '';
        this.guideBox.appendChild(el('b', '', line.nome));
        this.guideBox.appendChild(el('span', '', line.texto));
        this.guideUntil = now + GUIDE_BUBBLE_MS;
      }
    }
    const on = free && now < this.guideUntil;
    this.guideBox.style.display = on ? '' : 'none';
  }

  /** Transição entre mapas: tela escura com o nome do lugar, que some sozinha. */
  private updateFade(now: number): void {
    const mc = this.gc.mapChange;
    if (mc && mc.at !== this.fadeAt) {
      this.fadeAt = mc.at;
      this.fadeBox?.remove();
      const box = el('div', 'f3-troca');
      // Fase 5: andar da masmorra (o nome vem em 'masmorra_info')
      const dg = isDungeonMapId(mc.to) ? this.gc.game.dungeon : null;
      const name = dg ? `${dg.nome ?? 'Galerias'} · ${dg.andar ?? 1}º andar` : (getData().regionsById.get(resolveMapId(mc.to))?.name ?? mc.to);
      box.appendChild(el('div', 'n', name));
      // SUGESTÃO: subtítulo da transição
      box.appendChild(el('div', 's', 'Chegando...'));
      this.root.appendChild(box);
      this.fadeBox = box;
    }
    // espera o mapa novo (troca de sala online) antes de sumir
    if (this.fadeBox && mc && now - mc.at > MAP_FADE_MS + 100) {
      if (this.gc.welcomed) {
        this.fadeBox.remove();
        this.fadeBox = null;
      } else this.fadeBox.style.animation = 'none';
    }
  }

  // ---------------------------------------------------------------------------
  // telas

  private render(): void {
    const box = this.modal;
    if (!box || !this.kind) return;
    const keepErr = this.erro?.textContent ?? '';
    box.innerHTML = '';
    this.draws = [];
    this.erro = el('div', 'erro', keepErr);
    switch (this.kind) {
      case 'ala':
        this.renderAla(box);
        break;
      case 'talento':
        this.renderTalents(box);
        break;
      case 'slot3':
        this.renderSlot3(box);
        break;
      case 'emotes':
        this.renderEmotes(box);
        break;
      case 'painel':
        this.renderPanel(box);
        break;
    }
    box.appendChild(this.erro);
    const baixo = el('div', 'ed-baixo');
    // SUGESTÃO: texto do botão de fechar das telas
    baixo.appendChild(button(this.kind === 'ala' || this.kind === 'talento' ? 'Agora não' : 'Fechar', 'sec', () => this.close()));
    box.appendChild(baixo);
  }

  private send(fn: () => boolean): void {
    if (this.waiting) return;
    this.gc.game.lastError = null;
    if (this.erro) this.erro.textContent = '';
    this.waiting = fn();
  }

  private progress(): S2C_ProgressoOpcoes | null {
    return this.gc.game.progress;
  }

  private loading(box: HTMLElement): void {
    // SUGESTÃO: texto de espera
    box.appendChild(el('div', 'sub', 'Carregando...'));
    const sp = el('div', '');
    sp.style.flex = '1';
    box.appendChild(sp);
  }

  private renderAla(box: HTMLDivElement): void {
    // SUGESTÃO: título e subtítulo da escolha da ala
    box.appendChild(el('h1', 'sombra', 'Escolha a sua ala'));
    box.appendChild(el('div', 'sub', 'A ala define o seu treinador, os botões 1 e 2 e o traje.'));
    const pr = this.progress();
    if (!pr) return this.loading(box);
    if (!pr.ala.pode && pr.ala.motivo) box.appendChild(el('div', 'erro', pr.ala.motivo));
    const D = getData();
    const side = this.gc.game.profile?.side ?? '';
    const list = el('div', 'f3-lista');
    for (const a of pr.ala.opcoes) {
      const card = el('div', `f3-cartao ${side}`);
      const prev = el('div', 'f3-previa');
      const cv = el('canvas', 'px boneco');
      prev.appendChild(cv);
      this.queueLook(cv, this.previewLook(a.id));
      const rt = el('canvas', 'px retrato');
      prev.appendChild(rt);
      this.queuePortrait(rt, a.treinador);
      card.appendChild(prev);
      const col = el('div', 'col');
      const title = el('div', '');
      title.appendChild(el('b', '', a.name));
      title.appendChild(el('span', 'tag', PAPEL_LABEL[a.papel] ?? a.papel));
      col.appendChild(title);
      col.appendChild(el('p', '', `Treinador: ${a.treinadorNome}`));
      if (a.bordao) col.appendChild(el('p', 'bordao', `"${a.bordao}"`));
      for (const [i, mk] of a.marcas.entries()) {
        const ab = D.abilities.get(mk.id);
        col.appendChild(el('p', '', `Botão ${i + 1}: ${mk.name} (${ABILITY_TYPE_LABEL[mk.type] ?? mk.type})${ab?.description ? ' - ' + ab.description : ''}`));
      }
      if (!a.liberado && a.motivo) col.appendChild(el('p', 'erro', a.motivo));
      const b = button(`Entrar: ${a.name}`, 'ok', () => this.send(() => this.gc.chooseArchetype(a.id)));
      b.disabled = !a.liberado || !pr.ala.pode;
      col.appendChild(b);
      card.appendChild(col);
      list.appendChild(card);
    }
    box.appendChild(list);
  }

  private renderTalents(box: HTMLDivElement): void {
    // SUGESTÃO: título e subtítulo da escolha de talento
    box.appendChild(el('h1', 'sombra', 'Escolha um talento'));
    box.appendChild(el('div', 'sub', 'Um por nível. Escolha com carinho: não tem volta no piloto.'));
    const pr = this.progress();
    if (!pr) return this.loading(box);
    const list = el('div', 'f3-lista');
    if (pr.talentos.length === 0) list.appendChild(el('div', 'sub', 'Nenhum talento esperando agora.'));
    for (const g of pr.talentos) {
      list.appendChild(el('h2', 'sombra', `Nível ${g.nivel}`));
      for (const t of g.opcoes) {
        const card = el('div', 'f3-cartao');
        const col = el('div', 'col');
        col.appendChild(el('b', '', t.name));
        col.appendChild(el('p', '', t.descricao));
        col.appendChild(button('Escolher', 'ok', () => this.send(() => this.gc.pickTalent(t.id))));
        card.appendChild(col);
        list.appendChild(card);
      }
    }
    box.appendChild(list);
  }

  private renderSlot3(box: HTMLDivElement): void {
    // SUGESTÃO: título e subtítulo da troca do botão 3
    box.appendChild(el('h1', 'sombra', 'Botão 3'));
    box.appendChild(el('div', 'sub', 'Escolha 1 das 4 habilidades da sua classe.'));
    const lo = this.progress()?.loadout ?? this.gc.game.profile?.loadout ?? null;
    if (!lo) return this.loading(box);
    const list = el('div', 'f3-lista');
    if (lo.slot3Opcoes.length === 0) list.appendChild(el('div', 'sub', 'O botão 3 é escolhível depois da ala, no nível 12.'));
    const D = getData();
    for (const id of lo.slot3Opcoes) {
      const ab = D.abilities.get(id);
      const atual = id === lo.b3;
      const card = el('div', `f3-cartao${atual ? ' atual' : ''}`);
      const ic = el('canvas', 'px icone');
      this.queueIcon(ic, id);
      card.appendChild(ic);
      const col = el('div', 'col');
      const t = el('div', '');
      t.appendChild(el('b', '', ab?.name ?? id));
      t.appendChild(el('span', 'tag', ABILITY_TYPE_LABEL[ab?.type ?? ''] ?? ab?.type ?? ''));
      col.appendChild(t);
      if (ab) col.appendChild(el('p', '', `Recarga ${ab.cooldownS} s${ab.description ? ' - ' + ab.description : ''}`));
      // SUGESTÃO: texto do botão atual
      const b = button(atual ? 'No botão 3' : 'Pôr no botão 3', atual ? 'sec' : 'ok', () => this.send(() => this.gc.setSlot3(id)));
      b.disabled = atual;
      col.appendChild(b);
      card.appendChild(col);
      list.appendChild(card);
    }
    box.appendChild(list);
  }

  private renderEmotes(box: HTMLDivElement): void {
    // SUGESTÃO: título da roda de bordões
    box.appendChild(el('h1', 'sombra', 'Bordões'));
    const ids = this.gc.game.profile?.emotes ?? [];
    if (ids.length === 0) {
      box.appendChild(el('div', 'sub', 'Converse com o seu treinador para ganhar o bordão dele.'));
      const sp = el('div', '');
      sp.style.flex = '1';
      box.appendChild(sp);
      return;
    }
    const wheel = el('div', 'f3-roda');
    const n = ids.length;
    ids.forEach((id, i) => {
      const def = emoteText(id);
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const r = n === 1 ? 0 : 34;
      const b = button(def ?? id, '', () => {
        this.gc.emote(id);
        this.close();
      });
      b.style.left = `${50 + Math.cos(a) * r}%`;
      b.style.top = `${50 + Math.sin(a) * r}%`;
      wheel.appendChild(b);
    });
    box.appendChild(wheel);
  }

  private renderPanel(box: HTMLDivElement): void {
    const D = getData();
    const p = this.gc.game.profile;
    if (!p) return this.loading(box);
    box.appendChild(el('h1', 'sombra', p.name));
    const pan = el('div', 'f3-painel');
    const bloco = (titulo: string, linhas: (string | [string, string])[]) => {
      const b = el('div', 'f3-bloco');
      b.appendChild(el('h2', '', titulo));
      for (const l of linhas) {
        if (typeof l === 'string') b.appendChild(el('p', '', l));
        else {
          const pe = el('p', '', l[0]);
          pe.appendChild(el('small', '', ' ' + l[1]));
          b.appendChild(pe);
        }
      }
      pan.appendChild(b);
      return b;
    };
    const margem = p.side ? (D.regionsById.get(`margem_${p.side}`)?.name ?? p.side) : 'Delta (sem lado)';
    const moeda = p.side === 'direita' ? `${p.credito} Crédito (score ${p.score})` : p.side === 'esquerda' ? `${p.semente} Semente` : `${p.semente} Semente, ${p.credito} Crédito`;
    bloco('Personagem', [`Nível ${p.level} - ${margem}`, moeda]);
    // instituição e patente
    const inst = p.institution ? D.institutionsById.get(p.institution) : undefined;
    const info = this.gc.game.institution;
    const pat = info && info.id === p.institution ? info.minhaPatente : null;
    const soc = p.side ? D.societies.sociedades.find((s) => s.side === p.side) : undefined;
    const rankName = pat?.margem?.name ?? soc?.patentes.find((x) => x.id === p.rank)?.name ?? p.rank ?? '-';
    const instLines: (string | [string, string])[] = [];
    if (inst) {
      instLines.push([inst.name, `(${D.classesById.get(inst.classe)?.name ?? inst.classe})`]);
      instLines.push([`Patente: ${rankName}`, p.institution_rank ? `(${p.institution_rank})` : '']);
      if (pat) instLines.push([`Reputação ${pat.reputacao}`, pat.proxima ? `próxima: ${pat.proxima.name} com ${pat.proxima.reputacaoMin}` : '']);
      if (info && info.id === p.institution) {
        const est: Record<string, string> = { disponivel: 'disponível', ativa: 'em andamento', concluida: 'feita', bloqueada: 'trancada' };
        instLines.push([`Entrada: ${info.missaoEntrada.texto}`, `(${est[info.missaoEntrada.estado] ?? info.missaoEntrada.estado})`]);
      }
    } else instLines.push('Ainda sem instituição. A escolha é na travessia, no nível 8.');
    bloco('Instituição', instLines);
    // ala
    const arch = p.archetype ? D.archetypesById.get(p.archetype) : undefined;
    if (arch) {
      const tr = D.trainersById.get(arch.treinador);
      bloco('Ala', [[arch.name, `(${PAPEL_LABEL[arch.papel] ?? arch.papel})`], `Treinador: ${tr?.name ?? arch.treinador}`]);
    } else if (p.institution) bloco('Ala', [p.podeEscolherAla ? 'Pronto para escolher a ala!' : 'A ala é no nível 12, depois da missão de entrada.']);
    // guia
    const g = p.guide_id ? D.guidesById.get(p.guide_id) : undefined;
    if (g) bloco(g.tipo === 'ia_de_bolso' ? 'IA de bolso' : 'Espírito guia', [g.name, g.bonusTexto]);
    // talentos
    const tl = (p.talentos ?? []).map((id) => D.talentsById.get(id)).filter((t): t is NonNullable<typeof t> => !!t);
    const tLines: (string | [string, string])[] = tl.map((t) => [t.name, t.descricao]);
    if ((p.talentosPendentes ?? []).length > 0) tLines.push(`Esperando escolha: nível ${(p.talentosPendentes ?? []).join(', ')}`);
    if (tLines.length === 0) tLines.push('O primeiro talento é no nível 10.');
    bloco('Talentos', tLines);
    // botões
    const lo = p.loadout;
    if (lo) {
      const nm = (id: string) => D.abilities.get(id)?.name ?? id;
      bloco('Botões', [`1: ${nm(lo.b1)}`, `2: ${nm(lo.b2)}`, `3: ${nm(lo.b3)}`, `Especial: ${nm(lo.especial)}`]);
    }
    // ações
    const acoes = el('div', 'f3-botoes');
    const pend = this.gc.game.pendingChoice;
    if (pend === 'ala') acoes.appendChild(button('Escolher ala', 'ok', () => this.open('ala')));
    if (pend === 'talento') acoes.appendChild(button('Escolher talento', 'ok', () => this.open('talento')));
    if (lo && lo.slot3Opcoes.length > 0) acoes.appendChild(button('Trocar botão 3', '', () => this.open('slot3')));
    if ((p.emotes ?? []).length > 0) acoes.appendChild(button('Bordões', '', () => this.open('emotes')));
    if (g)
      acoes.appendChild(
        button(`Falar com ${g.name}`, '', () => {
          this.close();
          this.gc.talkToGuide();
        }),
      );
    if (acoes.childElementCount > 0) pan.appendChild(acoes);
    box.appendChild(pan);
  }

  // ---------------------------------------------------------------------------
  // arte nos canvas

  /** Prévia do traje de aprendiz da ala com a aparência do jogador. */
  private previewLook(archetypeId: string): CharacterLook {
    const lk = asCharacterLook(this.gc.game.profile?.look);
    return archetypeLook(archetypeId, 'aprendiz', 0, lk ? { body: lk.body, skin: lk.skin, face: lk.face, hair: lk.hair, hairColor: lk.hairColor, details: lk.details } : {});
  }

  private queueLook(cv: HTMLCanvasElement, look: CharacterLook): void {
    this.draws.push({
      cv,
      draw: (s) => {
        const key = this.art.characterSheet(s, look);
        // a folha nasce como silhueta e é desenhada aos poucos: redesenha quando ficar pronta
        whenSheetReady(key, () => {
          if (cv.isConnected) drawFrame(s, cv, key, idleFrame(0), 2);
        });
        return drawFrame(s, cv, key, idleFrame(0), 2);
      },
    });
  }

  private queuePortrait(cv: HTMLCanvasElement, who: string): void {
    this.draws.push({ cv, draw: (s) => drawFrame(s, cv, this.art.portrait(s, who), undefined, 0.75) });
  }

  private queueIcon(cv: HTMLCanvasElement, abilityId: string): void {
    this.draws.push({ cv, draw: (s) => drawFrame(s, cv, this.art.icon(s, abilityId), undefined, 1) });
  }
}
