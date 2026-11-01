/**
 * Estado da Fase 2 do lado do cliente (puro, testável): perfil, missões, diálogo aberto, telas a
 * abrir (criação, Máquina de Visual, travessia), avisos, subida de nível e XP em grupo.
 *
 * Só guarda o que o servidor disse (mensagens de GAME_MSG). As telas leem daqui; nada aqui decide
 * regra: quem decide é o servidor (ou o servidor local do ?offline=1) com shared/game.
 */
import {
  GAME_MSG,
  type S2C_Aviso,
  type S2C_Dialogo,
  type S2C_Emote,
  type S2C_FalaGuia,
  type S2C_InstituicaoInfo,
  type S2C_MissaoEstado,
  type S2C_Perfil,
  type S2C_ProgressoOpcoes,
  type S2C_TravessiaOpcoes,
  type S2C_TrocarSala,
} from '@pqp/shared/net';
import { TUTORIAL_STEPS, type TutorialStep } from '@pqp/shared/game/tutorial';
import type { Unlock } from '@pqp/shared/game/types';

export type ToastKind = 'info' | 'missao' | 'nivel' | 'erro' | 'xp';

export interface Toast {
  id: number;
  texto: string;
  tipo: ToastKind;
  at: number;
  /** linha menor embaixo (desbloqueio do tutorial, bônus de grupo) */
  sub?: string;
}

/** Tela que o servidor pediu para abrir. */
export type ScreenRequest = { tela: 'maquina_visual'; maquina: string } | { tela: 'travessia'; opcoes: S2C_TravessiaOpcoes };

/** Subida de nível para o banner grande. */
export interface LevelUp {
  level: number;
  at: number;
  desbloqueios: Unlock[];
}

// SUGESTÃO: XP que chega em até 1,2 s vira um aviso só; no máximo 6 avisos guardados.
export const XP_MERGE_MS = 1200;
export const MAX_TOASTS = 6;
// SUGESTÃO: no máximo 3 falas do guia esperando o balão.
export const MAX_GUIDE_LINES = 3;

/** Aviso de nível que o servidor manda junto com o perfil (o banner grande já mostra). */
const LEVEL_TEXT = /^N[íi]vel \d+!?$/;

export class GameState {
  profile: S2C_Perfil | null = null;
  missions: S2C_MissaoEstado | null = null;
  /** diálogo aberto (null = fechado) */
  dialog: S2C_Dialogo | null = null;
  /** telas pedidas pelo servidor, na ordem */
  readonly screens: ScreenRequest[] = [];
  readonly toasts: Toast[] = [];
  levelUp: LevelUp | null = null;
  /** último erro (a tela aberta mostra; criação recusada, máquina longe) */
  lastError: { texto: string; at: number } | null = null;
  /** muda a cada mensagem tratada (as telas redesenham quando muda) */
  version = 0;
  /** passos do tutorial marcados aqui antes da confirmação do servidor */
  readonly localSteps = new Set<string>();
  // ---- Fase 3 ----
  /** opções de ala, talentos pendentes e botões (resposta de 'progresso_opcoes') */
  progress: S2C_ProgressoOpcoes | null = null;
  /** tela da instituição (resposta de 'instituicao') */
  institution: S2C_InstituicaoInfo | null = null;
  /** falas do guia ainda não mostradas (balão pequeno) */
  readonly guideLines: (S2C_FalaGuia & { at: number })[] = [];
  /** emotes recebidos (o mundo desenha o balão em cima de quem fez) */
  readonly emotes: S2C_Emote[] = [];
  /** troca de sala pedida pelo servidor online (o GameClient refaz a entrada) */
  roomChange: S2C_TrocarSala | null = null;
  private toastSeq = 0;
  private pendingUnlocks: Unlock[] = [];

  /** Trata uma mensagem do servidor. Devolve true se era da Fase 2. */
  onMessage(type: string, msg: unknown, now: number): boolean {
    switch (type) {
      case GAME_MSG.perfil:
        this.onProfile(msg as S2C_Perfil, now);
        break;
      case GAME_MSG.missaoEstado:
        this.missions = msg as S2C_MissaoEstado;
        break;
      case GAME_MSG.dialogo: {
        const d = msg as S2C_Dialogo;
        this.dialog = d;
        if (d.abrir) this.screens.push(d.abrir.tela === 'travessia' ? { tela: 'travessia', opcoes: d.abrir.opcoes } : { tela: 'maquina_visual', maquina: d.abrir.maquina });
        break;
      }
      case GAME_MSG.travessiaOpcoes:
        this.screens.push({ tela: 'travessia', opcoes: msg as S2C_TravessiaOpcoes });
        break;
      case GAME_MSG.aviso:
        this.onAviso(msg as S2C_Aviso, now);
        break;
      // Fase 3
      case GAME_MSG.progressoInfo:
        this.progress = msg as S2C_ProgressoOpcoes;
        break;
      case GAME_MSG.instituicaoInfo:
        this.institution = msg as S2C_InstituicaoInfo;
        break;
      case GAME_MSG.falaGuia: {
        const f = msg as S2C_FalaGuia;
        if (f && typeof f.texto === 'string' && f.texto) {
          this.guideLines.push({ ...f, at: now });
          if (this.guideLines.length > MAX_GUIDE_LINES) this.guideLines.shift();
        }
        break;
      }
      case GAME_MSG.emote: {
        const e = msg as S2C_Emote;
        if (e && typeof e.entity === 'number') {
          this.emotes.push(e);
          if (this.emotes.length > 8) this.emotes.shift();
        }
        break;
      }
      case GAME_MSG.trocarSala:
        this.roomChange = msg as S2C_TrocarSala;
        break;
      default:
        return false;
    }
    this.version++;
    return true;
  }

  private onProfile(p: S2C_Perfil, now: number): void {
    const prev = this.profile;
    this.profile = p;
    if (prev && prev.criado && p.level > prev.level) {
      this.levelUp = { level: p.level, at: now, desbloqueios: this.pendingUnlocks.filter((u) => u.nivel <= p.level) };
      this.pendingUnlocks = [];
    }
  }

  private onAviso(a: S2C_Aviso, now: number): void {
    const texto = typeof a?.texto === 'string' ? a.texto : '';
    const tipo: ToastKind = a?.tipo ?? 'info';
    if (a?.desbloqueios && a.desbloqueios.length > 0) {
      // desbloqueios chegam junto com a subida de nível: vão para o banner (ou viram aviso próprio)
      const lv = this.profile?.level ?? 0;
      if (this.levelUp && now - this.levelUp.at < 1500) this.levelUp.desbloqueios.push(...a.desbloqueios);
      else {
        for (const u of a.desbloqueios) {
          // já valem no nível atual (travessia, cadastro): aviso na hora; de nível futuro: espera o perfil
          if (u.nivel <= lv) this.pushToast(`Novo: ${u.descricao}`, 'missao', now);
          else this.pendingUnlocks.push(u);
        }
      }
    }
    if (tipo === 'erro') this.lastError = { texto, at: now };
    if (!texto || LEVEL_TEXT.test(texto.trim())) return;
    this.pushToast(texto, tipo, now);
  }

  pushToast(texto: string, tipo: ToastKind, now: number, sub?: string): Toast {
    const t: Toast = { id: ++this.toastSeq, texto, tipo, at: now, ...(sub ? { sub } : {}) };
    this.toasts.push(t);
    if (this.toasts.length > MAX_TOASTS) this.toasts.shift();
    this.version++;
    return t;
  }

  /**
   * XP ganho (evento 'xp' do próprio jogador). Só luta em grupo dá XP: o aviso diz isso, e quem
   * ainda está no Delta luta com o Seu Jacó junto. Somas em sequência viram um aviso só.
   */
  onXp(amount: number, now: number): void {
    if (amount <= 0) return;
    const last = this.toasts[this.toasts.length - 1];
    if (last && last.tipo === 'xp' && now - last.at < XP_MERGE_MS) {
      const n = Number(/\+(\d+)/.exec(last.texto)?.[1] ?? 0) + Math.round(amount);
      last.texto = `+${n} XP`;
      last.at = now;
      this.version++;
      return;
    }
    // SUGESTÃO: textos do aviso de XP em grupo
    const sub = this.profile?.stage === 'delta' ? 'Luta em grupo: o Seu Jacó está junto' : 'Luta em grupo (+15% por jogador a mais)';
    this.pushToast(`+${Math.round(amount)} XP`, 'xp', now, sub);
  }

  /** Próxima fala do guia (sai da fila). */
  takeGuideLine(): (S2C_FalaGuia & { at: number }) | undefined {
    return this.guideLines.shift();
  }

  /** Emotes recebidos desde a última chamada. */
  takeEmotes(): S2C_Emote[] {
    return this.emotes.splice(0, this.emotes.length);
  }

  /** Há escolha de ala ou de talento esperando (o botão pisca). */
  get pendingChoice(): 'ala' | 'talento' | null {
    const p = this.profile;
    if (!p) return null;
    if (p.podeEscolherAla) return 'ala';
    if ((p.talentosPendentes?.length ?? 0) > 0) return 'talento';
    return null;
  }

  /** O próximo pedido de tela (sai da fila). */
  takeScreen(): ScreenRequest | undefined {
    return this.screens.shift();
  }

  closeDialog(): void {
    this.dialog = null;
    this.version++;
  }

  /** Personagem ainda sem cadastro: a tela de criação abre. */
  get needsCreation(): boolean {
    return this.profile !== null && !this.profile.criado;
  }

  /** Regras da Fase 2 ativas (o servidor mandou perfil). */
  get active(): boolean {
    return this.profile !== null;
  }

  /** Controle da tela liberado pelo tutorial (sem perfil, tudo liberado: modo de teste). */
  unlocked(controle: string): boolean {
    if (!this.profile) return true;
    return this.profile.controlesLiberados.includes(controle);
  }

  /** Dica do primeiro minuto: o primeiro passo ainda não feito (só no Delta, depois do cadastro). */
  tutorialStep(): TutorialStep | undefined {
    const p = this.profile;
    if (!p || !p.criado || p.stage !== 'delta') return undefined;
    return TUTORIAL_STEPS.find((s) => !p.tutorial.feitos.includes(s.id) && !this.localSteps.has(s.id));
  }

  /** Controle já usado (pelo perfil ou marcado aqui). */
  usedControl(controle: string): boolean {
    return (this.profile?.tutorial.controles.includes(controle) ?? false) || this.localSteps.has('c:' + controle);
  }

  /** Avisos ainda na tela (duram `ms`). */
  liveToasts(now: number, ms: number): Toast[] {
    return this.toasts.filter((t) => now - t.at < ms);
  }
}
