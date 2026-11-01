/**
 * Mensagens da Fase 2 (criação, Máquina de Visual, diálogo, missões, tutorial e travessia).
 * Vão pelo mesmo canal do protocolo da Fase 1 (protocol.ts), com os nomes de GAME_MSG.
 * Toda mensagem do cliente é um pedido: o servidor confere com as regras de shared/game e
 * responde com 'perfil', 'missao_estado' e 'aviso' (e 'dialogo' ou 'travessia_opcoes').
 */
import type { Dialog, DialogOpen } from '../game/dialog';
import type { ObjectiveTarget } from '../game/missions';
import type { PlayerProfile } from '../game/record';
import type { TravessiaOptions } from '../game/travessia';
import type { Appearance, Unlock } from '../game/types';
import type { VisualChange } from '../game/visual';

export const GAME_MSG = {
  // cliente -> servidor
  criarPersonagem: 'criar_personagem',
  maquinaVisual: 'maquina_visual',
  falar: 'falar',
  dialogoOpcao: 'dialogo_opcao',
  missaoAceitar: 'missao_aceitar',
  travessia: 'travessia',
  tutorialPasso: 'tutorial_passo',
  // servidor -> cliente
  perfil: 'perfil',
  dialogo: 'dialogo',
  missaoEstado: 'missao_estado',
  aviso: 'aviso',
  travessiaOpcoes: 'travessia_opcoes',
  /** adição do servidor da Fase 2: o personagem é de outro mapa (ou acabou de atravessar); troque de sala */
  trocarSala: 'trocar_sala',
} as const;
export type GameMsgName = (typeof GAME_MSG)[keyof typeof GAME_MSG];

// ---------------------------------------------------------------------------
// cliente -> servidor

/** Cadastro do Delta (nome e aparência em camadas). */
export interface C2S_CriarPersonagem {
  name: string;
  appearance: Appearance;
}

/** Mudança na Máquina de Visual; o servidor acha a máquina perto do jogador (ou usa `maquina`). */
export interface C2S_MaquinaVisual {
  change: VisualChange;
  maquina?: string;
}

/** Falar com um NPC: id de dados (npcs.json/trainers.json) ou id da entidade no mundo. */
export interface C2S_Falar {
  npcId?: string;
  entity?: number;
}

/** Opção escolhida no diálogo aberto (Dialog.opcoes[].id). */
export interface C2S_DialogoOpcao {
  npcId: string;
  opcao: string;
}

export interface C2S_MissaoAceitar {
  id: string;
}

export interface C2S_Travessia {
  side: string;
  institution: string;
  guide: string;
}

/**
 * Passo ou controle do tutorial detectado no cliente: passo ('andar', 'alvo', 'botao'...) e/ou
 * controle usado (TutorialControl: 'andar_joystick', 'tocar_no_chao', 'auto_caminho'...).
 */
export interface C2S_TutorialPasso {
  passo?: string;
  controle?: string;
}

// ---------------------------------------------------------------------------
// servidor -> cliente

export type S2C_Perfil = PlayerProfile;

export interface S2C_Dialogo extends Dialog {
  /** tela a abrir depois de uma opção (Máquina de Visual ou travessia) */
  abrir?: DialogOpen;
}

export interface S2C_MissaoEstado {
  ativas: { id: string; name: string; resumo: string; objetivo: string; indice: number; total: number; feito: number; meta: number }[];
  /** descrição do objetivo atual da primeira missão (o do rastreador) */
  objetivo: string | null;
  /** alvo do auto-caminho e da seta */
  alvo: (ObjectiveTarget & { x?: number; y?: number; mapa: string }) | null;
}

export interface S2C_Aviso {
  texto: string;
  /** desbloqueios do tutorial que vieram junto (o cliente mostra o controle novo) */
  desbloqueios?: Unlock[];
  tipo?: 'info' | 'missao' | 'nivel' | 'erro';
}

export type S2C_TravessiaOpcoes = TravessiaOptions;

/**
 * Adição do servidor da Fase 2. Uma sala Colyseus por mapa: todas se chamam 'mundo' (SALA_MUNDO) e
 * se distinguem pela opção `mapId` (filterBy). O cliente entra com joinOrCreate('mundo', { mapId })
 * (sem mapId na primeira vez); quando o personagem é de outro mapa, ou depois da travessia, o
 * servidor manda 'trocar_sala': o cliente sai desta sala, entra na do `mapId` e manda o hello de novo
 * com o mesmo token. Nesta sala o personagem não existe mais (nem fica no automático).
 */
export interface S2C_TrocarSala {
  mapId: string;
  /** 'registro': o personagem salvo é de outro mapa; 'travessia': acabou de atravessar */
  motivo: 'registro' | 'travessia';
  /** token de convidado gerado pelo servidor neste hello (guarde e mande no próximo) */
  token?: string;
}

/** Nome das salas de mapa no Colyseus (uma por mapa, opção mapId). */
export const SALA_MUNDO = 'mundo';
