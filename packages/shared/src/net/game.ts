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
import type { AlaOption, LoadoutView } from '../game/ala';
import type { GuideLineOut } from '../game/guides';
import type { InstitutionInfo } from '../game/institutions';
import type { TalentOption } from '../game/talents';

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
  // ---- Fase 3 ----
  // cliente -> servidor
  /** escolher a ala no nível 12 (C2S_EscolherAla) */
  escolherAla: 'escolher_ala',
  /** escolher o talento de um nível (C2S_EscolherTalento) */
  escolherTalento: 'escolher_talento',
  /** trocar a habilidade da classe no botão 3 (C2S_TrocarSlot3) */
  trocarSlot3: 'trocar_slot3',
  /** pedir a tela da instituição: loja, quadro de missões, patentes (C2S_Instituicao) */
  instituicao: 'instituicao',
  /** pagar o objetivo 'pagar' da missão (C2S_MissaoPagar) */
  missaoPagar: 'missao_pagar',
  /** pedir as opções de ala e de talento (sem corpo) */
  progressoOpcoes: 'progresso_opcoes',
  // cliente -> servidor (C2S_Emote) e servidor -> todos perto (S2C_Emote): mesmo nome
  emote: 'emote',
  // servidor -> cliente
  /** opções de ala e de talentos pendentes (S2C_ProgressoOpcoes) */
  progressoInfo: 'progresso_info',
  /** tela da instituição (S2C_InstituicaoInfo) */
  instituicaoInfo: 'instituicao_info',
  /** fala do guia (S2C_FalaGuia): missão aceita, bônus */
  falaGuia: 'fala_guia',
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

// ---------------------------------------------------------------------------
// Fase 3: ala, talentos, botão 3, instituição, emote e guia

/** Escolher a ala (game/ala.ts chooseArchetype). Responde 'perfil' e 'aviso'. */
export interface C2S_EscolherAla {
  archetype: string;
}

/** Escolher um talento (game/talents.ts pickTalent). O efeito vale no próximo nascimento da entidade. */
export interface C2S_EscolherTalento {
  talent: string;
}

/** Trocar a habilidade da classe no botão 3 (game/ala.ts setSlot3). */
export interface C2S_TrocarSlot3 {
  ability: string;
}

/** Tela da instituição; sem id, a do jogador. */
export interface C2S_Instituicao {
  id?: string;
}

/** Pagar o objetivo 'pagar' (game/institutions.ts payObjective). */
export interface C2S_MissaoPagar {
  missao?: string;
}

/** Usar um emote liberado (game/trainers.ts useEmote). */
export interface C2S_Emote {
  emote: string;
}

/** Emote espalhado pelo servidor a quem está perto (raio de interesse). */
export interface S2C_Emote {
  /** id da entidade de quem fez */
  entity: number;
  playerId: string;
  nome: string;
  emote: string;
  texto: string;
  animacao: string;
  quadros: number;
}

export interface S2C_ProgressoOpcoes {
  ala: { pode: boolean; motivo?: string; opcoes: AlaOption[] };
  talentos: { nivel: number; opcoes: TalentOption[] }[];
  loadout: LoadoutView | null;
}

export type S2C_InstituicaoInfo = InstitutionInfo;

export type S2C_FalaGuia = GuideLineOut;
