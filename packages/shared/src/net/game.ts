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
import type { Bem, CarteiraView } from '../game/economy';
import type { MercadoId, MercadoView } from '../game/market';
import type { CotacaoTroca, ExchangeRate } from '../game/exchange';
import type { CasaView } from '../game/housing';
import type { Moeda, PermissaoVisita, Rotacao } from '../game/types';

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
  // ---- Fase 4 ----
  // cliente -> servidor
  /** pedir a carteira (sem corpo); responde 'carteira' */
  carteiraPedir: 'carteira_pedir',
  /** quitar a dívida (sem corpo) */
  dividaPagar: 'divida_pagar',
  /** comprar na loja de NPC (C2S_LojaComprar) */
  lojaComprar: 'loja_comprar',
  /** vender para a loja de NPC (C2S_LojaVender) */
  lojaVender: 'loja_vender',
  /** listar a feira ou o app (C2S_MercadoListar); responde 'mercado_info' */
  mercadoListar: 'mercado_listar',
  /** anunciar na feira (C2S_FeiraAnunciar) */
  feiraAnunciar: 'feira_anunciar',
  /** comprar ou trocar na feira (C2S_MercadoComprar) */
  feiraComprar: 'feira_comprar',
  /** retirar as compras prontas da fila da feira (sem corpo) */
  feiraRetirar: 'feira_retirar',
  /** anunciar no app (C2S_AppAnunciar) */
  appAnunciar: 'app_anunciar',
  /** comprar no app (C2S_MercadoComprar) */
  appComprar: 'app_comprar',
  /** cancelar um anúncio próprio, da feira ou do app (C2S_MercadoCancelar) */
  mercadoCancelar: 'mercado_cancelar',
  /** receber o que ficou pendente no mercado (vendas, trocas, vencidos) (sem corpo) */
  mercadoReceber: 'mercado_receber',
  /** pedir a cotação da ponte (C2S_CambioCotar); responde 'cambio_info' */
  cambioCotar: 'cambio_cotar',
  /** trocar moeda na ponte (C2S_CambioTrocar) */
  cambioTrocar: 'cambio_trocar',
  /** pedir a própria casa (sem corpo); responde 'casa_info' */
  casaVer: 'casa_ver',
  /** visitar a casa de outro jogador (C2S_CasaVisitar); responde 'casa_info' só leitura */
  casaVisitar: 'casa_visitar',
  /** comprar móvel do catálogo (C2S_CasaComprarMovel) */
  casaComprarMovel: 'casa_comprar_movel',
  /** colocar móvel guardado (C2S_CasaColocar) */
  casaColocar: 'casa_colocar',
  /** mover móvel colocado (C2S_CasaMover) */
  casaMover: 'casa_mover',
  /** girar móvel 90 graus (C2S_CasaMovel) */
  casaGirar: 'casa_girar',
  /** tirar móvel e guardar no inventário (C2S_CasaMovel) */
  casaTirar: 'casa_tirar',
  /** quem pode visitar e convites (C2S_CasaVisitas) */
  casaVisitas: 'casa_visitas',
  /** alugar cápsula (C2S_CasaAlugar) */
  casaAlugar: 'casa_alugar',
  /** entrar na lista de espera da Assembleia (sem corpo) */
  casaListaEspera: 'casa_lista_espera',
  /** atalho de teste (só com o modo de desenvolvimento do servidor): anda a lista de espera */
  casaAvancarFila: 'casa_avancar_fila',
  // servidor -> cliente
  /** carteira (S2C_Carteira) */
  carteira: 'carteira',
  /** feira ou app (S2C_MercadoInfo) */
  mercadoInfo: 'mercado_info',
  /** cotação da ponte (S2C_CambioInfo) */
  cambioInfo: 'cambio_info',
  /** casa própria ou visitada (S2C_CasaInfo) */
  casaInfo: 'casa_info',
  /** resultado curto de uma operação de economia (S2C_EconomiaResultado) */
  economiaResultado: 'economia_resultado',
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

// ---------------------------------------------------------------------------
// Fase 4: carteira, loja, feira, app, câmbio e casa
// Toda operação responde 'economia_resultado' (ok ou erro), 'perfil' quando o saldo mudou e a
// tela da operação ('mercado_info', 'cambio_info', 'casa_info').

export interface C2S_LojaComprar {
  loja: string;
  item: string;
  moeda?: Moeda;
}

export interface C2S_LojaVender {
  loja: string;
  /** id do inventário (item, 'movel:<id>' ou recurso) */
  item: string;
  moeda?: Moeda;
}

export interface C2S_MercadoListar {
  mercado: MercadoId;
}

export interface C2S_FeiraAnunciar {
  bem: Bem;
  /** preço em Semente (item da tabela usa a tabela) */
  preco?: number;
  /** troca direta: o que pede em troca */
  trocaPor?: Bem[];
}

export interface C2S_AppAnunciar {
  bem: Bem;
  preco: number;
}

export interface C2S_MercadoComprar {
  anuncio: string;
}

export interface C2S_MercadoCancelar {
  anuncio: string;
}

export interface C2S_CambioCotar {
  de?: Moeda;
  quantidade?: number;
}

export interface C2S_CambioTrocar {
  de: Moeda;
  quantidade: number;
}

export interface C2S_CasaVisitar {
  playerId: string;
}

export interface C2S_CasaComprarMovel {
  movel: string;
  moeda?: Moeda;
  /** já colocar na casa depois de comprar */
  colocar?: { x: number; y: number; rot?: Rotacao };
}

export interface C2S_CasaColocar {
  movel: string;
  x: number;
  y: number;
  rot?: Rotacao;
}

export interface C2S_CasaMover {
  uid: number;
  x: number;
  y: number;
  rot?: Rotacao;
}

export interface C2S_CasaMovel {
  uid: number;
}

export interface C2S_CasaVisitas {
  permissao?: PermissaoVisita;
  convidar?: string;
  desconvidar?: string;
}

export interface C2S_CasaAlugar {
  tipo?: string;
}

export interface C2S_CasaAvancarFila {
  ciclos?: number;
}

export type S2C_Carteira = CarteiraView;
export type S2C_MercadoInfo = MercadoView;

export interface S2C_CambioInfo {
  taxa: ExchangeRate;
  /** cotação pedida (C2S_CambioCotar com quantidade) */
  cotacao?: CotacaoTroca;
  usadoCiclo: number;
}

export type S2C_CasaInfo = CasaView;

export interface S2C_EconomiaResultado {
  /** nome da mensagem que pediu (GAME_MSG) */
  acao: string;
  ok: boolean;
  erro?: string;
  texto?: string;
  /** feira: lugar na fila da compra */
  entrega?: { id: string; prontoEm: number; posicao: number };
}
