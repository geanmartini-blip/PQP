/**
 * Mensagens da Fase 2 (criação, Máquina de Visual, diálogo, missões, tutorial e travessia).
 * Vão pelo mesmo canal do protocolo da Fase 1 (protocol.ts), com os nomes de GAME_MSG.
 * Toda mensagem do cliente é um pedido: o servidor confere com as regras de shared/game e
 * responde com 'perfil', 'missao_estado' e 'aviso' (e 'dialogo' ou 'travessia_opcoes').
 */
import type { BoatInfo } from '../game/barco';
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
  /** travessia de barco: fase da viagem, dica da aula e passos feitos (S2C_BarcoInfo) */
  barcoInfo: 'barco_info',
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
  // ---- Fase 5: IA de facção ----
  /** aviso do mapa da IA de facção, troca de dono de ponto, apagão ou saque (S2C_AvisoMapa) */
  avisoMapa: 'aviso_mapa',
  // ---- Fase 5: itens (game/equipment.ts) ----
  /** vestir um item da mochila (C2S_Equipar) */
  equipar: 'equipar',
  /** tirar o item de um slot (C2S_Desequipar) */
  desequipar: 'desequipar',
  /** benzer um item da Esquerda (C2S_Melhorar); entra na fila da benzedeira */
  benzer: 'benzer',
  /** calibrar um item da Direita (C2S_Melhorar); paga em Crédito */
  calibrar: 'calibrar',
  /** filtro de raridade da coleta e venda automática (C2S_FiltroRaridade) */
  filtroRaridade: 'filtro_raridade',
  /** pedir a tela de itens (sem corpo); responde 'itens_info' */
  itensPedir: 'itens_pedir',
  /** servidor -> cliente: equipamento, mochila e melhorias (S2C_ItensInfo) */
  itensInfo: 'itens_info',
  // ---- Fase 5: masmorra, Doutrina, plantão e painel da facção (telas do cliente) ----
  /** entrar nas Galerias perto da entrada (C2S_MasmorraEntrar); responde 'masmorra_info' e o welcome do andar */
  masmorraEntrar: 'masmorra_entrar',
  /** sair da masmorra e receber o guardado (sem corpo) */
  masmorraSair: 'masmorra_sair',
  /** escolha numa sala de evento (C2S_MasmorraEscolha) */
  masmorraEscolha: 'masmorra_escolha',
  /** servidor -> cliente: andar atual, salas, escada e evento (S2C_MasmorraInfo) */
  masmorraInfo: 'masmorra_info',
  /** pedir a Doutrina (sem corpo); responde 'doutrina_info' */
  doutrinaPedir: 'doutrina_pedir',
  /** gravar a Doutrina, até 5 cartas (C2S_DoutrinaDefinir) */
  doutrinaDefinir: 'doutrina_definir',
  /** servidor -> cliente: cartas gravadas (S2C_DoutrinaInfo) */
  doutrinaInfo: 'doutrina_info',
  /** quadro do plantão do QG (sem corpo); responde 'plantao_info' */
  plantaoPedir: 'plantao_pedir',
  /** levar um plantonista para o grupo (C2S_Plantonista) */
  plantaoLevar: 'plantao_levar',
  /** devolver o plantonista ao QG (C2S_Plantonista) */
  plantaoDispensar: 'plantao_dispensar',
  /** servidor -> cliente: quadro do plantão (S2C_PlantaoInfo) */
  plantaoInfo: 'plantao_info',
  /** painel dos pontos de controle e da influência (sem corpo); responde 'faccao_info' */
  faccaoPedir: 'faccao_pedir',
  /** servidor -> cliente: regiões, pontos e avisos recentes (S2C_FaccaoInfo) */
  faccaoInfo: 'faccao_info',
  /** ficar (ou não) de plantão no QG quando sair do jogo (C2S_PlantaoDefinir); responde 'plantao_info' */
  plantaoDefinir: 'plantao_definir',
} as const;

/** Fase 5 (servidor): liga ou desliga o on_duty do registro. */
export interface C2S_PlantaoDefinir {
  on: boolean;
}

/** Aviso do mapa (game/influence.ts WorldEvent): o servidor manda os eventos novos de tickFaccao. */
export interface S2C_AvisoMapa {
  id: string;
  tipo: 'acao_ia' | 'troca_de_dono' | 'apagao' | 'saque';
  texto: string;
  lado?: 'esquerda' | 'direita';
  lider?: string;
  regiao?: string;
  ponto?: string;
}
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

/** Travessia de barco: fase, dica da aula e passos (game/barco.ts boatInfo). */
export type S2C_BarcoInfo = BoatInfo;

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

// ---------------------------------------------------------------------------
// Fase 5: itens (game/equipment.ts). A resposta é 'itens_info' (e 'aviso' com o erro).

export interface C2S_Equipar {
  itemId: string;
}

export interface C2S_Desequipar {
  slot: string;
}

/** benzer ou calibrar; `onde` = id do QG ou da instituição (benzimento.onde / calibracao.onde) */
export interface C2S_Melhorar {
  itemId: string;
  onde?: string;
}

export interface C2S_FiltroRaridade {
  raridade: 'comum' | 'raro' | 'unico' | 'set';
  vendaAutomatica?: boolean;
}

export type S2C_ItensInfo = import('../game/equipment').ItensView;

// ---------------------------------------------------------------------------
// Fase 5: masmorra, Doutrina, plantão e painel da facção

export interface C2S_MasmorraEntrar {
  dungeonId?: string;
  /** começar do atalho (último andar de chefe vencido), se tiver */
  atalho?: boolean;
}

export interface C2S_MasmorraEscolha {
  sala: number;
  opcao: string;
}

/**
 * Andar atual da run. O mapa do andar não está no registro de mapas: o cliente monta com
 * buildDungeonFloor(andar, seed, dungeonId).layout.map (o id é `mapId`).
 */
export interface S2C_MasmorraInfo {
  ativa: boolean;
  runId?: string;
  dungeonId?: string;
  /** semente da run (não a do andar) */
  seed?: number;
  andar?: number;
  nome?: string;
  mapId?: string;
  escadaAberta?: boolean;
  escada?: { x: number; y: number };
  saida?: { x: number; y: number };
  chefe?: { inimigo: string; nome: string; vencido: boolean };
  salas?: { idx: number; tipo: string; nome: string; ativa: boolean; limpa: boolean }[];
  /** sala de evento esperando escolha */
  evento?: { sala: number; opcoes: { id: string; texto: string }[] };
  grupo?: { nome: string; papel: 'jogador' | 'plantonista' | 'ia' }[];
  /** recompensas guardadas para quem pediu */
  guardadas?: number;
  /** a run acabou: 'falhou' ou 'saiu' */
  fim?: 'falhou' | 'saiu';
  andarMaisFundo?: number;
}

export interface C2S_DoutrinaDefinir {
  cards: import('../sim/types').DoctrineCard[];
}

export interface S2C_DoutrinaInfo {
  cards: import('../sim/types').DoctrineCard[];
  max: number;
}

export interface C2S_Plantonista {
  plantonistaId: string;
}

export interface PlantonistaView {
  id: string;
  nome: string;
  nivel: number;
  classe?: string | null;
  ala?: string | null;
  /** cartas da Doutrina dele */
  cartas: number;
}

export interface S2C_PlantaoInfo {
  qg: string | null;
  disponiveis: PlantonistaView[];
  levados: PlantonistaView[];
  grupoMax: number;
  /** Fase 5 (servidor): você fica de plantão quando sair (on_duty) */
  emPlantao?: boolean;
}

export interface S2C_FaccaoInfo {
  ciclo: number;
  proximoTickEm: number;
  agora: number;
  lideres: { lado: 'esquerda' | 'direita'; id: string; nome: string }[];
  regioes: { id: string; nome: string; energia: number; poluicao: number; apagao: boolean; influencia: { esquerda: number; direita: number } }[];
  pontos: { id: string; nome: string; regiao: string; dono: 'esquerda' | 'direita' | 'neutra'; influencia: { esquerda: number; direita: number }; saqueDisponivel: number }[];
  eventos: S2C_AvisoMapa[];
  /** influência para virar dono (LIMIAR_DONO) */
  limiar: number;
}
