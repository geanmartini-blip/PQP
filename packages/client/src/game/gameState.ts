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
  type S2C_BarcoInfo,
  type S2C_Dialogo,
  type S2C_Emote,
  type S2C_FalaGuia,
  type S2C_InstituicaoInfo,
  type S2C_MissaoEstado,
  type S2C_Perfil,
  type S2C_ProgressoOpcoes,
  type S2C_TravessiaOpcoes,
  type S2C_TrocarSala,
  type S2C_Carteira,
  type S2C_MercadoInfo,
  type S2C_CambioInfo,
  type S2C_CasaInfo,
  type S2C_EconomiaResultado,
  type S2C_AvisoMapa,
  type S2C_ItensInfo,
  type S2C_MasmorraInfo,
  type S2C_DoutrinaInfo,
  type S2C_PlantaoInfo,
  type S2C_FaccaoInfo,
} from '@pqp/shared/net';

// SUGESTÃO: no máximo 6 avisos do mapa esperando a faixa do topo.
export const MAX_MAP_ALERTS = 6;

/**
 * Carteira da Fase 4. `inventario` é um campo a mais (o servidor local manda; o online, quando
 * mandar): ids do inventário para vender e anunciar.
 */
export type CarteiraInfo = S2C_Carteira & { inventario?: string[] };
import { TUTORIAL_STEPS, type TutorialStep } from '@pqp/shared/game/tutorial';
import type { Unlock } from '@pqp/shared/game/types';

export type ToastKind = 'info' | 'missao' | 'nivel' | 'erro' | 'xp' | 'mapa' | 'saque' | 'guia';

/** Dica curta da tela: um passo do tutorial do Delta ou a dica do barco da travessia. */
export type HintStep = Pick<TutorialStep, 'texto' | 'destaca'> & { id: string };

export interface Toast {
  id: number;
  texto: string;
  tipo: ToastKind;
  at: number;
  /** linha menor embaixo (desbloqueio do tutorial, bônus de grupo) */
  sub?: string;
  /** classe extra de estilo (aviso do mapa: 'esquerda', 'direita', 'apagao') */
  cls?: string;
}

/** XP ganho há pouco (o HUD mostra "+N XP" colado na barra de XP, não como aviso). */
export interface XpGain {
  amount: number;
  at: number;
}

/** Tela que o servidor pediu para abrir. */
export type ScreenRequest = { tela: 'maquina_visual'; maquina: string } | { tela: 'travessia'; opcoes: S2C_TravessiaOpcoes };

/** Subida de nível para o banner grande. */
export interface LevelUp {
  level: number;
  at: number;
  desbloqueios: Unlock[];
}

// SUGESTÃO: XP que chega em até 1,2 s vira um aviso só; no máximo 8 avisos guardados.
export const XP_MERGE_MS = 1200;
export const MAX_TOASTS = 8;
// SUGESTÃO: moedas e saque que chegam em até 1,5 s viram um aviso só; no máximo 12 novidades no Perfil.
export const GAIN_MERGE_MS = 1500;
export const MAX_NOVIDADES = 12;
// SUGESTÃO: desbloqueio com texto de até 44 letras vira "Novo: ..."; mais longo ou vários, "veja no Perfil".
export const UNLOCK_TOAST_CHARS = 44;
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
  // ---- Fase 4 ----
  /** carteira (resposta de 'carteira_pedir' e de toda operação de economia) */
  wallet: CarteiraInfo | null = null;
  /** feira ou app aberto */
  market: S2C_MercadoInfo | null = null;
  /** cotação da ponte */
  exchange: S2C_CambioInfo | null = null;
  /** casa própria ou visitada */
  house: S2C_CasaInfo | null = null;
  /** último resultado de operação de economia (com a hora de chegada) */
  econ: (S2C_EconomiaResultado & { at: number }) | null = null;
  // ---- Fase 5 ----
  /** equipamento, mochila, melhorias e filtro de raridade */
  itens: S2C_ItensInfo | null = null;
  /** masmorra em andamento (ativa) ou a última que acabou */
  dungeon: S2C_MasmorraInfo | null = null;
  /** cartas da Doutrina gravadas */
  doctrine: S2C_DoutrinaInfo | null = null;
  /** quadro do plantão */
  duty: S2C_PlantaoInfo | null = null;
  /** painel dos pontos de controle */
  faction: S2C_FaccaoInfo | null = null;
  /** avisos do mapa (world_event) ainda não mostrados na faixa do topo */
  readonly mapAlerts: (S2C_AvisoMapa & { at: number })[] = [];
  // ---- travessia de barco ----
  /** fase do barco e a dica da aula (null fora do barco; o GameClient limpa no welcome de outro mapa) */
  boat: S2C_BarcoInfo | null = null;
  // ---- revisão visual ----
  /** XP ganho há pouco (somado), para o "+N XP" do quadro do jogador */
  xpGain: XpGain | null = null;
  /** controles novos liberados (o Perfil lista; o MENU mostra o selo enquanto não forem vistos) */
  readonly novidades: Unlock[] = [];
  /** há novidade que o jogador ainda não viu no Perfil */
  novidadesNaoVistas = false;
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
      case GAME_MSG.barcoInfo: {
        const b = msg as S2C_BarcoInfo;
        if (b && typeof b.fase === 'string') this.boat = b;
        break;
      }
      // Fase 4
      case GAME_MSG.carteira:
        this.wallet = msg as CarteiraInfo;
        break;
      case GAME_MSG.mercadoInfo:
        this.market = msg as S2C_MercadoInfo;
        break;
      case GAME_MSG.cambioInfo:
        this.exchange = msg as S2C_CambioInfo;
        break;
      case GAME_MSG.casaInfo:
        this.house = msg as S2C_CasaInfo;
        break;
      case GAME_MSG.economiaResultado: {
        const r = msg as S2C_EconomiaResultado;
        if (!r || typeof r.ok !== 'boolean') break;
        this.econ = { ...r, at: now };
        if (!r.ok) {
          const texto = r.erro ?? 'Não deu.';
          this.lastError = { texto, at: now };
          this.pushToast(texto, 'erro', now);
        } else if (r.texto) this.pushToast(r.texto, 'info', now);
        break;
      }
      // Fase 5
      case GAME_MSG.itensInfo:
        this.itens = msg as S2C_ItensInfo;
        break;
      case GAME_MSG.masmorraInfo:
        this.dungeon = msg as S2C_MasmorraInfo;
        break;
      case GAME_MSG.doutrinaInfo:
        this.doctrine = msg as S2C_DoutrinaInfo;
        break;
      case GAME_MSG.plantaoInfo:
        this.duty = msg as S2C_PlantaoInfo;
        break;
      case GAME_MSG.faccaoInfo:
        this.faction = msg as S2C_FaccaoInfo;
        break;
      case GAME_MSG.avisoMapa: {
        const a = msg as S2C_AvisoMapa;
        if (!a || typeof a.texto !== 'string' || !a.texto) break;
        if (this.mapAlerts.some((x) => x.id === a.id)) break;
        this.mapAlerts.push({ ...a, at: now });
        if (this.mapAlerts.length > MAX_MAP_ALERTS) this.mapAlerts.shift();
        break;
      }
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
      const des = this.pendingUnlocks.filter((u) => u.nivel <= p.level);
      this.levelUp = { level: p.level, at: now, desbloqueios: des };
      this.addNovidades(des);
      this.pendingUnlocks = [];
    }
  }

  /** Guarda os controles novos para o Perfil (sem repetir) e acende o selo do MENU. */
  private addNovidades(list: readonly Unlock[]): void {
    for (const u of list) {
      if (this.novidades.some((x) => x.controle === u.controle && x.descricao === u.descricao)) continue;
      this.novidades.unshift(u);
      this.novidadesNaoVistas = true;
    }
    if (this.novidades.length > MAX_NOVIDADES) this.novidades.length = MAX_NOVIDADES;
  }

  /** O jogador abriu o Perfil: o selo de novidade apaga. */
  seeNovidades(): void {
    if (!this.novidadesNaoVistas) return;
    this.novidadesNaoVistas = false;
    this.version++;
  }

  private onAviso(a: S2C_Aviso, now: number): void {
    const texto = typeof a?.texto === 'string' ? a.texto : '';
    const tipo: ToastKind = a?.tipo ?? 'info';
    if (a?.desbloqueios && a.desbloqueios.length > 0) {
      // desbloqueios chegam junto com a subida de nível: vão para o banner (ou viram aviso próprio)
      const lv = this.profile?.level ?? 0;
      if (this.levelUp && now - this.levelUp.at < 1500) {
        this.levelUp.desbloqueios.push(...a.desbloqueios);
        this.addNovidades(a.desbloqueios);
      } else {
        // já valem no nível atual (travessia, cadastro): UM aviso curto na hora (o texto inteiro fica
        // no Perfil); de nível futuro: espera o perfil
        const now0 = a.desbloqueios.filter((u) => u.nivel <= lv);
        for (const u of a.desbloqueios) if (u.nivel > lv) this.pendingUnlocks.push(u);
        if (now0.length > 0) {
          this.addNovidades(now0);
          this.pushToast(unlockToastText(now0), 'missao', now);
        }
      }
    }
    if (tipo === 'erro') this.lastError = { texto, at: now };
    if (!texto || LEVEL_TEXT.test(texto.trim())) return;
    this.pushToast(texto, tipo, now);
  }

  pushToast(texto: string, tipo: ToastKind, now: number, sub?: string, cls?: string): Toast {
    // o mesmo texto que ainda está na fila não entra de novo (só renova a hora)
    const dup = this.toasts.find((x) => x.texto === texto && x.tipo === tipo && now - x.at < GAIN_MERGE_MS * 2);
    if (dup) {
      dup.at = now;
      this.version++;
      return dup;
    }
    const t: Toast = { id: ++this.toastSeq, texto, tipo, at: now, ...(sub ? { sub } : {}), ...(cls ? { cls } : {}) };
    this.toasts.push(t);
    if (this.toasts.length > MAX_TOASTS) this.toasts.shift();
    this.version++;
    return t;
  }

  /**
   * XP ganho (evento 'xp' do próprio jogador): não vira aviso; o HUD mostra "+N XP" colado na barra
   * de XP do quadro. Somas em sequência (até 1,2 s) viram um número só.
   */
  onXp(amount: number, now: number): void {
    if (amount <= 0) return;
    const g = this.xpGain;
    if (g && now - g.at < XP_MERGE_MS) {
      g.amount += Math.round(amount);
      g.at = now;
    } else this.xpGain = { amount: Math.round(amount), at: now };
  }

  /**
   * Moeda ou item coletado: sai do mundo (o texto comprido cobria o boneco) e vira UM aviso curto na
   * faixa de mensagens; ganhos seguidos (até 1,5 s) se somam no mesmo aviso.
   */
  onGain(g: { semente?: number; credito?: number; item?: string }, now: number): void {
    const last = this.toasts[this.toasts.length - 1];
    const acc = last && last.tipo === 'saque' && now - last.at < GAIN_MERGE_MS ? (last as Toast & { gain?: GainAcc }).gain : undefined;
    const sum: GainAcc = acc ? { ...acc, itens: [...acc.itens] } : { semente: 0, credito: 0, itens: [] };
    sum.semente += Math.max(0, Math.round(g.semente ?? 0));
    sum.credito += Math.max(0, Math.round(g.credito ?? 0));
    if (g.item) sum.itens.push(g.item);
    const texto = gainText(sum);
    if (!texto) return;
    if (acc && last) {
      last.texto = texto;
      last.at = now;
      (last as Toast & { gain?: GainAcc }).gain = sum;
      this.version++;
      return;
    }
    const t = this.pushToast(texto, 'saque', now);
    (t as Toast & { gain?: GainAcc }).gain = sum;
  }

  /** Próximo aviso do mapa para a faixa do topo (sai da fila). */
  takeMapAlert(): (S2C_AvisoMapa & { at: number }) | undefined {
    return this.mapAlerts.shift();
  }

  /** Dentro de uma masmorra agora. */
  get inDungeon(): boolean {
    return this.dungeon?.ativa === true;
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

  /**
   * Dica do primeiro minuto: o primeiro passo ainda não feito (só no Delta, depois do cadastro). No
   * barco da travessia, a dica é a do barco (a fase da viagem ou o botão da aula).
   */
  tutorialStep(): HintStep | undefined {
    if (this.boat?.dica) return this.boat.dica;
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

/** Soma de ganhos seguidos (moedas e itens) de um aviso de saque. */
interface GainAcc {
  semente: number;
  credito: number;
  itens: string[];
}

/** Texto curto do aviso de saque: "+2 Semente · +8 Crédito · Facão" (SUGESTÃO). */
export function gainText(g: GainAcc): string {
  const parts: string[] = [];
  if (g.semente > 0) parts.push(`+${g.semente} Semente`);
  if (g.credito > 0) parts.push(`+${g.credito} Crédito`);
  if (g.itens.length === 1) parts.push(`+ ${g.itens[0]}`);
  else if (g.itens.length > 1) parts.push(`+${g.itens.length} itens`);
  return parts.join(' · ');
}

/**
 * Aviso dos controles liberados de uma vez: um só, curto. Um desbloqueio de texto curto vira
 * "Novo: ..."; mais longo, ou vários, "N coisas novas: veja no MENU" (o texto inteiro fica no Perfil).
 * SUGESTÃO: textos.
 */
export function unlockToastText(list: readonly Unlock[]): string {
  if (list.length === 1) {
    const d = list[0]!.descricao.trim();
    return d.length <= UNLOCK_TOAST_CHARS ? `Novo: ${d}` : 'Controle novo: veja no MENU, em Perfil';
  }
  return `${list.length} coisas novas: veja no MENU, em Perfil`;
}
