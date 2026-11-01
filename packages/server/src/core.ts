/**
 * GameServerCore: o servidor autoritativo de UM mapa, sem transporte. O WorldRoom (Colyseus, uma
 * sala por mapa) e os testes (canal em memória) falam com ele do mesmo jeito.
 *
 * Fluxo por tick (20 por segundo):
 *  1. cada sessão consome UMA entrada da fila (o cliente prevê um tick por entrada) e os comandos
 *     novos, com compensação de atraso (rewind = min(250 ms, rtt + 100 ms + 25 ms) em ticks: o
 *     cliente desenha os outros 100 ms atrás do que recebeu, que já chegou uma ida atrasado, e o
 *     comando leva mais uma ida e espera o tick);
 *     - posição e ack andam juntos: cada entrada é um passo, nunca dois. Fila vazia (a rede travou,
 *       que no TCP é como a perda aparece): o personagem não anda neste tick, nem pelo joystick
 *       velho nem pelo caminho do toque no chão;
 *     - fila com mais de INPUT_TARGET_BACKLOG + 1: até INPUT_CATCHUP_PER_TICK entradas extras andam
 *       na hora, as mais velhas primeiro, pelo crédito de entradas;
 *     - comando com afterSeq espera o servidor ter andado essa entrada;
 *  2. step() da simulação;
 *  3. Fase 2: os eventos do tick (xp, level, death, cast, loot_pick, revive) e os lugares, regiões
 *     e marcadores por perto alimentam as regras de shared/game (missões, tutorial, story_flags);
 *  4. renascimento dos inimigos, saída de quem caiu da conexão há muito tempo, gravação;
 *  5. um snapshot por cliente: entidades no raio de interesse, 'gone', avisos, zonas, eventos e HUD.
 *
 * Fase 2 (registro e regras):
 * - o registro é o PlayerRecord de shared/game (version 2), carregado do Store e migrado;
 * - sem personagem (criado=false): a sessão recebe 'perfil' e espera 'criar_personagem'; só então
 *   o personagem nasce e o 'welcome' sai (com o token gerado, se foi o caso);
 * - personagem de outro mapa (o mapa vem do estágio: Delta até a travessia, depois o QG da
 *   margem): 'trocar_sala' com o mapId certo, sem nascer aqui;
 * - mensagens de jogo (GAME_MSG) entram por onGameMessage e as respostas saem pela caixa de saída
 *   (takeOutbox), que o adaptador manda na ordem;
 * - o registro é a fonte de nível, XP, estágio, missões e visual; a entidade é a fonte de moedas,
 *   inventário, poções, Doutrina e automático (pull antes de cada regra, push depois);
 * - grava a cada mudança (o Store faz o debounce) e a cada SAVE_EVERY_MS.
 * - sala do protótipo (SANDBOX_MAPS): o personagem template da Fase 1 (hello.archetypeId), sem
 *   registro no Store nem regras de jogo, para os testes de combate e de rede.
 *
 * Entradas: aceita as PlayerInput com seq maior que a última consumida (o cliente repete as 3
 * últimas). Comandos: dedupe por id (maior id processado = cack, mais um conjunto dos recentes).
 * Campos d/n/lk/lv: vão quando a entidade é nova para o cliente ou mudou, e se repetem a cada
 * INFO_REPEAT_TICKS até o cliente confirmar o tick (C2S_Input.ackTick); 'need' responde com 'info'
 * se mesmo assim faltar.
 * Queda de conexão: o personagem fica no modo automático (Doutrina) por OFFLINE_AUTO_MS e depois sai;
 * o mesmo token retoma o mesmo personagem.
 *
 * Fase 4 (economia e moradia, regras de shared/game): as mensagens de ECON_MSGS (carteira, loja,
 * feira, app, câmbio, casa) respondem 'economia_resultado' e a tela da operação; o saldo vai em
 * 'carteira' e 'perfil'. Mercado e câmbio são da cidade (CityService), compartilhada pelas salas.
 * Loja pede o balcão por perto, feira e câmbio pedem o lugar; app, carteira e decoração valem de
 * qualquer lugar. // SUGESTÃO. Ao entrar na margem, o registro acerta os ciclos da cidade e
 * recebe o que o mercado deve. A porta 'moradia' leva o jogador para a sala da casa dele
 * ('casa:<id>', house.ts); casa_visitar perto da porta leva para a casa de outro, se o dono deixar.
 * Na sala de uma casa (opts.house), quem entra recebe 'casa_info' e vê as mudanças ao vivo.
 */
import { randomUUID } from 'node:crypto';
import { getData } from '@pqp/shared/data';
import { ARRIVAL_MAP_BY_SIDE, findPath, getMap, resolveMapId, START_MAP, type MapMarker } from '@pqp/shared/map';
import {
  dequantizeAxis,
  GAME_MSG,
  INTEREST_RADIUS,
  INTERP_DELAY_MS,
  MAX_REWIND_MS,
  MSG,
  PROTOCOL_VERSION,
  type C2S_CriarPersonagem,
  type C2S_DialogoOpcao,
  type C2S_Falar,
  type C2S_Hello,
  type C2S_Input,
  type C2S_MaquinaVisual,
  type C2S_MissaoAceitar,
  type C2S_Need,
  type C2S_Travessia,
  type C2S_TutorialPasso,
  type C2S_Emote,
  type C2S_EscolherAla,
  type C2S_EscolherTalento,
  type C2S_Instituicao,
  type C2S_MissaoPagar,
  type C2S_TrocarSlot3,
  type S2C_Emote,
  type S2C_FalaGuia,
  type S2C_InstituicaoInfo,
  type S2C_ProgressoOpcoes,
  type EntSnap,
  type S2C_Dialogo,
  type S2C_Info,
  type S2C_MissaoEstado,
  type S2C_Pong,
  type S2C_Snapshot,
  type S2C_TrocarSala,
  type S2C_Welcome,
} from '@pqp/shared/net';
import {
  applyCommand,
  applyInput,
  canMove,
  createWorld,
  downEntity,
  hasStatus,
  hudSnapshot,
  isHostile,
  moveSpeedOf,
  moveVelocity,
  msToTicks,
  npcInReach,
  setArchetype,
  spawnAlly,
  spawnPlayer,
  step,
  stepMovement,
  TICK_MS,
  TICK_RATE,
  velocityToward,
  type CombatEvent,
  type Entity,
  type PlayerCommand,
  type PlayerInput,
  type Vec,
  type World,
} from '@pqp/shared/sim';
import { relevel, spawnEnemy } from '@pqp/shared/sim/spawn';
import { applyFlatPassiveNumbers, baseAbilityId } from '@pqp/shared/sim/passiveDefs';
import { chooseArchetype, setSlot3 } from '@pqp/shared/game/ala';
import { pickTalent } from '@pqp/shared/game/talents';
import { progressOptions, simSpawnExtrasOf } from '@pqp/shared/game/combatKit';
import { useEmote } from '@pqp/shared/game/trainers';
import { institutionInfo, payObjective } from '@pqp/shared/game/institutions';
import { guideOf } from '@pqp/shared/game/guides';
import { baseTrainerOf, isOwnGuide } from '@pqp/shared/game/people';
import { lookOf as recordLook, nearVisualMachine, applyVisualMachine } from '@pqp/shared/game/visual';
import { newPlayerRecord, profileOf, simKitOf } from '@pqp/shared/game/record';
import { gainXp, isDeltaRookie, simLevelCap } from '@pqp/shared/game/progression';
import { acceptMission, currentObjectives, missionStatus, onGameEvent } from '@pqp/shared/game/missions';
import { controlesLiberados, TUTORIAL_STEPS } from '@pqp/shared/game/tutorial';
import { dialogOption, dialogOptions, talkTo, type Dialog } from '@pqp/shared/game/dialog';
import { applyTravessia, createCharacter } from '@pqp/shared/game/travessia';
import type { GameEvent, GameResult, Moeda, PermissaoVisita, PlayerRecord, Rotacao } from '@pqp/shared/game/types';
import { TutorialControl } from '@pqp/shared/schema/mission';
import type { TileMap } from '@pqp/shared/map';
import type { S2C_CambioInfo, S2C_CasaInfo, S2C_Carteira, S2C_EconomiaResultado, S2C_MercadoInfo } from '@pqp/shared/net';
import {
  alugarCapsula,
  anunciarApp,
  anunciarFeira,
  avancarListaDeEspera,
  cancelarAnuncio,
  carteiraView,
  casaView,
  colocarMovel,
  comprarApp,
  comprarFeira,
  comprarMovel,
  comprarNaLoja,
  convidar,
  cotarTroca,
  definirVisitas,
  economiaOf,
  entrarNaListaDeEspera,
  exchangeRate,
  girarMovel,
  isResource as isEconResource,
  mercadoView,
  moverMovel,
  nomeDoBem,
  nomeMoeda,
  pagarDivida,
  receberPendencias,
  retirarEntregas,
  sincronizarComCidade,
  tirarMovel,
  trocarMoeda,
  venderNaLoja,
  visitarCasa,
  type Bem,
  type MercadoId,
} from '@pqp/shared/game/index';
import {
  advanceFloor,
  atStairs,
  bankRewards,
  benzer,
  buildDungeonFloor,
  calibrar,
  chooseDungeonEvent,
  claimRunRewards,
  concluirBenzimentos,
  definirDoutrina,
  desequipar,
  DUNGEON_TUNING,
  equipar,
  failRun,
  firstBossClear,
  isBossFloor,
  itensView,
  joinRun,
  leaveRun,
  partyWiped,
  qgDaMargem,
  rollMapEncounters,
  setFiltroRaridade,
  shortcutOf,
  simEquipOf,
  spawnEncounter,
  spawnPlantonista,
  startDungeonFloor,
  tickDungeonFloor,
  tickEncounters,
  tickPlantao,
  encounterWindow,
  filtroRaridadeOf,
  vendaAutomaticaOf,
  type DungeonFloorEvent,
  type DungeonFloorState,
  type DungeonMember,
  type DungeonRun,
  type DutyAssignment,
  type EventoInfluencia,
  type WorldEvent,
} from '@pqp/shared/game/index';
import { applyEquipment } from '@pqp/shared/sim/stats';
import { regionAt } from '@pqp/shared/sim/combat';
import type {
  C2S_Equipar,
  C2S_Desequipar,
  C2S_Melhorar,
  C2S_FiltroRaridade,
  C2S_MasmorraEntrar,
  C2S_MasmorraEscolha,
  C2S_Plantonista,
  C2S_PlantaoDefinir,
  S2C_ItensInfo,
  S2C_MasmorraInfo,
  S2C_DoutrinaInfo,
  S2C_PlantaoInfo,
  S2C_FaccaoInfo,
  PlantonistaView,
} from '@pqp/shared/net';
import { CityService, type CityCore } from './city_service';
import { avisoDoEvento } from './faction_service';
import { DUNGEON_EXIT, dungeonMapId } from './dungeon_service';
import { houseMapId, houseSide, sideOfMap } from './house';
import {
  AREA_CHECK_TICKS,
  CMD_HOLD_MAX_TICKS,
  DEFAULT_ARCHETYPE,
  DEFAULT_MAP_ID,
  DEFAULT_PLAYER_NAME,
  DEFAULT_WORLD_SEED,
  EVENT_MARGIN_TILES,
  GONE_REPEAT_TICKS,
  INFO_REPEAT_TICKS,
  INPUT_CATCHUP_PER_TICK,
  INPUT_CREDIT_MAX,
  INPUT_CREDIT_PER_TICK,
  INPUT_QUEUE_MAX,
  INPUT_TARGET_BACKLOG,
  INTERACT_MARKER_RADIUS_TILES,
  JACO_DOWN_COOLDOWN_MS,
  MAX_CLIENT_RTT_MS,
  MAX_CMDS_PER_MSG,
  MAX_NAME_LENGTH,
  OFFLINE_AUTO_MS,
  PLACE_LEAVE_RADIUS_TILES,
  PLACE_RADIUS_TILES,
  RECENT_CMD_IDS,
  SANDBOX_MAPS,
  SAVE_EVERY_MS,
  TRAVESSIA_REACH_TILES,
  ALA_TRAINER_REACH_TILES,
  EMOTE_COOLDOWN_MS,
  EXIT_GRACE_MS,
  EXIT_RADIUS_TILES,
  INTERACT_REPEAT_MS,
  SURVIVE_SPAWN_TILES,
  DOOR_RADIUS_TILES,
  DOOR_REACH_TILES,
  MARKET_REACH_TILES,
  SHOP_REACH_TILES,
  DUNGEON_ENTRY_REACH_TILES,
  DUNGEON_GROUP_RADIUS_TILES,
  DUTY_SPAWN_OFFSET_TILES,
  ENCOUNTER_CHECK_TICKS,
} from './config';
import { bal } from '@pqp/shared/sim/constants';
import { hasArrival, mapAllowed, setArrival, takeArrival } from './handoff';
import type { Store, StoredPlayer } from './persistence/store';
import { sanitizeDoctrine } from './doctrine_guard';
import { areaMarkers, avisosOf, botaoOf, controlOfBotao, interactAction, isResource, killParticipants, mapForRecord, rollRewardItems, wantsControl, type AreaMarkers } from './game_bridge';
import { baseEntSnap, eventOut, eventRefs, lookOf, telegraphOut, zoneOut } from './snapshot';
import { Spawner, type SpawnerOptions } from './spawner';

export interface CoreOptions {
  mapId?: string;
  seed?: number;
  /** persistência; sem ela, o progresso fica só na memória do processo */
  store?: Store;
  /** põe bandos, elite, chefe e NPCs dos marcadores (padrão true) */
  content?: boolean;
  /** companheiro de IA (treinador) para cada jogador (padrão false; PQP_COMPANHEIRO=1 no servidor) */
  companions?: boolean;
  /**
   * o Seu Jacó acompanha quem ainda está no Delta (padrão: só no mapa do Delta, fora da sandbox).
   * Ele conta no grupo e cai no objetivo "Seu Jacó caiu!" para o jogador levantar.
   */
  jaco?: boolean;
  /** sala do protótipo: personagem template, sem registro nem regras (padrão: mapId em SANDBOX_MAPS) */
  sandbox?: boolean;
  /** arquétipo do template da sandbox (padrão peao_brabo) */
  defaultArchetype?: string;
  /** tempo no automático depois da queda de conexão antes de sair do mapa */
  offlineAutoMs?: number;
  interestRadius?: number;
  spawner?: SpawnerOptions;
  log?: (msg: string) => void;
  // ---- Fase 4 ----
  /** a cidade (mercado, câmbio, ciclo) compartilhada pelas salas; sem ela, uma só desta sala */
  city?: CityService;
  /** mapa pronto (a sala de uma casa); sem ele, getMap(mapId) */
  map?: TileMap;
  /** sala da casa: o registro do dono (a sala mostra a casa e confere quem entra) */
  house?: { owner: PlayerRecord };
  /** modo de desenvolvimento: aceita casa_avancar_fila (padrão: PQP_DEV=1) */
  dev?: boolean;
  // ---- Fase 5 ----
  /** sala de um andar da masmorra ('masmorra:<runId>:<andar>'); a run vem de city.dungeons */
  dungeon?: { runId: string; andar: number };
  /** encontros com IA no mapa (padrão false; o WorldRoom liga nos mapas de ENCOUNTER_MAPS) */
  encounters?: boolean;
}

/** Mensagens da Fase 5 (itens, Doutrina, plantão, masmorra e facção). */
const FASE5_MSGS = new Set<string>([
  GAME_MSG.equipar,
  GAME_MSG.desequipar,
  GAME_MSG.benzer,
  GAME_MSG.calibrar,
  GAME_MSG.filtroRaridade,
  GAME_MSG.itensPedir,
  GAME_MSG.doutrinaPedir,
  GAME_MSG.doutrinaDefinir,
  GAME_MSG.plantaoPedir,
  GAME_MSG.plantaoLevar,
  GAME_MSG.plantaoDispensar,
  GAME_MSG.plantaoDefinir,
  GAME_MSG.masmorraEntrar,
  GAME_MSG.masmorraSair,
  GAME_MSG.masmorraEscolha,
  GAME_MSG.faccaoPedir,
]);
export const FASE5_MESSAGES: readonly string[] = Array.from(FASE5_MSGS);

const numOf = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
/** Valor negociado de cada evento de comércio do log de economia (influência 'comercio'). */
const COMMERCE_VALUE: Record<string, (d: Record<string, unknown>) => number | undefined> = {
  loja_compra: (d) => numOf(d['valor']),
  loja_venda: (d) => numOf(d['valor']),
  feira_compra: (d) => numOf(d['preco']),
  app_compra: (d) => numOf(d['preco']),
  cambio_troca: (d) => numOf(d['quantidade']),
};

/** Texto curto de um evento do andar (aviso na tela). SUGESTÃO: textos. */
function textoDoAndar(ev: DungeonFloorEvent): string | undefined {
  switch (ev.t) {
    case 'sala_ativa':
      return ev.tipo === 'entrada' ? undefined : `${ev.nome}.`;
    case 'chefe':
      return `${getData().enemiesById.get(ev.inimigo)?.name ?? 'O chefe'} acordou!`;
    case 'sala_limpa':
      return 'Sala limpa.';
    case 'descanso':
      return 'Descanso: o grupo recuperou o fôlego.';
    case 'tesouro':
      return 'Tesouro! Guardado para a saída.';
    case 'evento':
      return 'Uma escolha nesta sala.';
    case 'escada_aberta':
      return 'A escada abriu. Desça quando quiser.';
    case 'chefe_vencido':
      return `${getData().enemiesById.get(ev.inimigo)?.name ?? 'O chefe'} caiu!`;
    default:
      return undefined;
  }
}

/** Mensagens de economia e moradia da Fase 4 (cliente -> servidor). */
const ECON_MSGS = new Set<string>([
  GAME_MSG.carteiraPedir,
  GAME_MSG.dividaPagar,
  GAME_MSG.lojaComprar,
  GAME_MSG.lojaVender,
  GAME_MSG.mercadoListar,
  GAME_MSG.feiraAnunciar,
  GAME_MSG.feiraComprar,
  GAME_MSG.feiraRetirar,
  GAME_MSG.appAnunciar,
  GAME_MSG.appComprar,
  GAME_MSG.mercadoCancelar,
  GAME_MSG.mercadoReceber,
  GAME_MSG.cambioCotar,
  GAME_MSG.cambioTrocar,
  GAME_MSG.casaVer,
  GAME_MSG.casaVisitar,
  GAME_MSG.casaComprarMovel,
  GAME_MSG.casaColocar,
  GAME_MSG.casaMover,
  GAME_MSG.casaGirar,
  GAME_MSG.casaTirar,
  GAME_MSG.casaVisitas,
  GAME_MSG.casaAlugar,
  GAME_MSG.casaListaEspera,
  GAME_MSG.casaAvancarFila,
]);
export const ECONOMY_MESSAGES: readonly string[] = Array.from(ECON_MSGS);

/** Mensagem que o adaptador manda para uma sessão (na ordem da caixa). */
export interface OutMsg {
  sid: string;
  type: string;
  msg: unknown;
}

interface SentInfo {
  d: string;
  n: string;
  lv: number;
  lk: string | undefined;
  /** tick em que estes valores foram mandados pela primeira vez */
  tick: number;
}

interface Session {
  sid: string;
  token: string;
  connected: boolean;
  /** última PlayerInput.seq consumida (-1 = nenhuma) */
  lastSeq: number;
  inputQ: PlayerInput[];
  lastInputTick: number;
  /** crédito de entradas (ver INPUT_CREDIT_PER_TICK) */
  credit: number;
  /** neste tick não havia entrada: o personagem não anda pelo caminho do toque no chão */
  paused: boolean;
  cack: number;
  recent: Set<number>;
  recentOrder: number[];
  cmdQ: HeldCmd[];
  rtt: number;
  /** último tick de snapshot que o cliente disse ter recebido */
  ackTick: number;
  sent: Map<number, SentInfo>;
  gone: Map<number, number>;
  /** registro sem personagem criado: espera 'criar_personagem' */
  pending?: PlayerRecord;
  /** o token foi gerado pelo servidor e ainda não foi entregue no welcome */
  tokenToSend?: boolean;
  /** mandada para outra sala (trocar_sala): não tem personagem aqui */
  movedTo?: string;
}

/** Comando na fila do servidor. */
interface HeldCmd {
  c: PlayerCommand;
  /** seq da última entrada que o cliente já tinha previsto quando criou o comando (opcional) */
  afterSeq?: number;
  /** tick em que chegou */
  since: number;
}

interface Slot {
  token: string;
  rec: PlayerRecord;
  /** personagem template da sala do protótipo (sem regras nem Store) */
  sandbox: boolean;
  entityId: number;
  companionId?: number;
  sid?: string;
  /** tick em que a conexão caiu (personagem no automático) */
  offlineSince?: number;
  autoBefore: boolean;
  lastLevel: number;
  /** mudou desde a última gravação */
  dirty: boolean;
  /** perfil e estado das missões a mandar no fim do tick ou da mensagem */
  notify: boolean;
  /** eventos de jogo detectados nas entradas e comandos, aplicados depois do step */
  queued: GameEvent[];
  /** lugar atual (undefined = ainda não conferido) */
  place?: string | null;
  region?: string;
  /** marcadores de interação em que o jogador está dentro */
  inside: Set<string>;
  stickDown: boolean;
  hadTarget: boolean;
  jacoDownAt?: number;
  lastDialog?: Dialog;
  // ---- Fase 3 ----
  /** tick em que o personagem nasceu neste mapa (as saídas esperam EXIT_GRACE_MS) */
  bornTick: number;
  /** saídas recusadas em que o jogador está (avisa uma vez) */
  exitWarned: Set<string>;
  /** último tick em que um marcador de quadro contou (INTERACT_REPEAT_MS) */
  interactAt: Map<string, number>;
  lastEmoteTick?: number;
  /** objetivo 'sobreviver' em andamento */
  survive?: { key: string; startTick: number; x: number; y: number; waves: number; lastSecond: number };
  // ---- Fase 4 ----
  /** portas de moradia em que o jogador está (só leva para a casa ao entrar de novo) */
  doors: Set<string>;
  // ---- Fase 5 ----
  /** na masmorra: está em cima da saída (só sai ao pisar de novo) */
  onDungeonExit?: boolean;
}

const moedaOf = (v: unknown): Moeda | undefined => (v === 'semente' || v === 'credito' ? v : undefined);
const rotOf = (v: unknown): Rotacao | undefined => (v === 0 || v === 1 || v === 2 || v === 3 ? v : undefined);
const strOf = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 128) : '');

/** Bem vindo do cliente (C2S_FeiraAnunciar, C2S_AppAnunciar), validado; null se inválido. */
export function bemOf(v: unknown): Bem | null {
  if (!isObj(v)) return null;
  const id = v['id'];
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return null;
  if (v['tipo'] === 'item') return { tipo: 'item', id };
  if (v['tipo'] === 'movel') return { tipo: 'movel', id };
  if (v['tipo'] === 'recurso') {
    const q = v['quantidade'];
    if (!isInt(q) || q <= 0 || q > 99_999 || !isEconResource(id)) return null;
    return { tipo: 'recurso', id, quantidade: q };
  }
  return null;
}

// SUGESTÃO: 'need' responde no máximo 64 ids por pedido.
const MAX_NEED_IDS = 64;

const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const CONTROLS = new Set<string>(TutorialControl.options);
const STEPS = new Set<string>(TUTORIAL_STEPS.map((s) => s.id));

/** Números fixos (stats.pct) que os talentos e o guia da entidade somam ao nascer. */
function flatPctOf(e: Entity): Record<string, number> {
  const stub = { ...e, stats: { ...e.stats, pct: {} } } as Entity;
  applyFlatPassiveNumbers(stub);
  return stub.stats.pct as Record<string, number>;
}

/** Nome limpo (sem controle, até MAX_NAME_LENGTH) ou undefined. */
export function cleanName(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME_LENGTH);
  return s.length > 0 ? s : undefined;
}

export function normalizeToken(v: unknown): { token: string; generated: boolean } {
  if (typeof v === 'string' && TOKEN_RE.test(v)) return { token: v, generated: false };
  return { token: randomUUID(), generated: true };
}

function sanitizeInput(raw: unknown): PlayerInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isInt(r['seq']) || r['seq'] < 0 || !isNum(r['mx']) || !isNum(r['my'])) return null;
  const clamp = (v: number) => Math.max(-127, Math.min(127, Math.round(v)));
  return { seq: r['seq'], mx: clamp(r['mx']), my: clamp(r['my']) };
}

const vec = (v: unknown): Vec | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  return isNum(o['x']) && isNum(o['y']) ? { x: o['x'], y: o['y'] } : undefined;
};

function sanitizeCmd(raw: unknown): PlayerCommand | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = r['id'];
  if (!isInt(id) || id <= 0) return null;
  switch (r['c']) {
    case 'habilidade': {
      const b = r['botao'];
      if (b !== 1 && b !== 2 && b !== 3 && b !== 'especial') return null;
      const at = vec(r['at']);
      return at ? { id, c: 'habilidade', botao: b, at } : { id, c: 'habilidade', botao: b };
    }
    case 'alvo':
    case 'ir_ate':
      if (!isNum(r['x']) || !isNum(r['y'])) return null;
      return { id, c: r['c'], x: r['x'], y: r['y'] };
    case 'item':
      return { id, c: 'item' };
    case 'auto':
      return typeof r['on'] === 'boolean' ? { id, c: 'auto', on: r['on'] } : null;
    case 'interagir':
      return isInt(r['entity']) ? { id, c: 'interagir', entity: r['entity'] } : null;
    case 'trocar_arquetipo':
      return typeof r['archetypeId'] === 'string' ? { id, c: 'trocar_arquetipo', archetypeId: r['archetypeId'] } : null;
    case 'doutrina': {
      // validação fechada: carta com tipo desconhecido travava o step de todo mundo
      const cards = r['cards'];
      if (!Array.isArray(cards)) return null;
      return { id, c: 'doutrina', cards: sanitizeDoctrine(cards, 5) };
    }
    default:
      return null;
  }
}

export class GameServerCore implements CityCore {
  readonly world: World;
  readonly mapId: string;
  readonly spawn: Vec;
  readonly spawner?: Spawner;
  /** sala do protótipo: template da Fase 1, sem registro nem regras */
  readonly sandbox: boolean;
  /** eventos do último tick (testes e métricas) */
  lastEvents: CombatEvent[] = [];

  private readonly store?: Store;
  private readonly companions: boolean;
  private readonly jaco: boolean;
  private readonly defaultArchetype: string;
  private readonly offlineTicks: number;
  private readonly interestRadius: number;
  private readonly log: (msg: string) => void;
  private readonly areas: AreaMarkers;
  private readonly sessions = new Map<string, Session>();
  private readonly slots = new Map<string, Slot>(); // token -> personagem no mundo
  private readonly records = new Map<string, PlayerRecord>(); // token -> último registro conhecido (sem Store e sandbox)
  private kicked: string[] = [];
  private outbox: OutMsg[] = [];
  private prevPos = new Map<number, [number, number]>();
  private baseCache = new Map<number, EntSnap>();
  private infoCache = new Map<number, { d: string; n: string; lv: number; lk: unknown; lkJson: string | undefined }>();
  private evCache = new Map<CombatEvent, CombatEvent>();
  // ---- Fase 4 ----
  readonly city: CityService;
  /** sala de uma casa: o dono e a última versão do registro dele (quando ele não está aqui) */
  readonly house?: { ownerId: string; owner: PlayerRecord };
  private readonly dev: boolean;
  private readonly doorMarkers: MapMarker[];
  private readonly bgTasks = new Set<Promise<void>>();
  // ---- Fase 5 ----
  /** sala de um andar da masmorra: a run (compartilhada pela cidade) e o estado do andar */
  readonly dungeon?: { run: DungeonRun; state: DungeonFloorState };
  private readonly encountersOn: boolean;
  private encWindow = -1;
  private encEnts: number[] = [];
  /** plantonistas nesta sala: assignment -> entidade */
  private readonly dutyEnts = new Map<string, { a: DutyAssignment; entityId: number }>();
  /** influência somada neste tick, agrupada (lado|região|fonte -> qtd) */
  private infPending = new Map<string, EventoInfluencia>();

  constructor(opts: CoreOptions = {}) {
    this.city = opts.city ?? new CityService({ ...(opts.log ? { log: opts.log } : {}) });
    // Fase 5: andar da masmorra, com o mapa montado pela semente da run
    let map = opts.map;
    let dungeonMap: string | undefined;
    if (opts.dungeon) {
      const run = this.city.dungeons.get(opts.dungeon.runId);
      if (!run) throw new Error(`run não encontrada: ${opts.dungeon.runId}`);
      const floor = buildDungeonFloor(opts.dungeon.andar, run.seed, run.dungeonId);
      map = floor.layout.map;
      dungeonMap = dungeonMapId(run.id, opts.dungeon.andar);
      this.dungeon = { run, state: startDungeonFloor(floor) };
    }
    // Fase 3: qg_esquerda e qg_direita são apelidos das margens (registros e salas antigas)
    this.mapId = dungeonMap ?? (opts.map ? opts.map.id : resolveMapId(opts.mapId ?? DEFAULT_MAP_ID));
    this.world = createWorld(map ?? getMap(this.mapId), opts.seed ?? DEFAULT_WORLD_SEED);
    if (opts.house) this.house = { ownerId: opts.house.owner.id, owner: clone(opts.house.owner) };
    this.dev = opts.dev ?? (process.env['PQP_DEV'] === '1' || process.env['PQP_DEV'] === 'true');
    this.doorMarkers = this.world.map.markers.filter((m) => m.kind === 'moradia');
    this.encountersOn = opts.encounters === true && !this.dungeon && !opts.house;
    this.city.register(this);
    this.world.pathfinder = findPath;
    if (opts.store) this.store = opts.store;
    this.sandbox = opts.sandbox ?? SANDBOX_MAPS.includes(this.mapId);
    this.companions = opts.companions ?? false;
    this.jaco = opts.jaco ?? (!this.sandbox && this.mapId === START_MAP);
    this.defaultArchetype = opts.defaultArchetype ?? DEFAULT_ARCHETYPE;
    this.offlineTicks = msToTicks(opts.offlineAutoMs ?? OFFLINE_AUTO_MS);
    this.interestRadius = opts.interestRadius ?? INTEREST_RADIUS;
    this.log = opts.log ?? ((m) => console.log(m));
    this.areas = areaMarkers(this.world.map);
    const sp = this.world.map.markers.find((m) => m.kind === 'spawn_jogador');
    this.spawn = sp ? { x: sp.x, y: sp.y } : { x: this.world.map.width / 2, y: this.world.map.height / 2 };
    if (opts.content !== false && !this.dungeon) {
      this.spawner = new Spawner(this.world, { log: this.log, ...(opts.spawner ?? {}) });
      this.spawner.populate();
    }
    // Fase 5: o combate lê os medidores da facção (Direita com energia, Esquerda com poluição)
    if (!this.sandbox) this.world.regionState = this.city.faction.regionState();
  }

  // -------------------------------------------------------------------------
  // Caixa de saída (mensagens de jogo, welcome tardio, trocar_sala)

  /** Mensagens prontas para mandar, na ordem (o adaptador chama depois de cada mensagem e de cada tick). */
  takeOutbox(): OutMsg[] {
    const o = this.outbox;
    this.outbox = [];
    return o;
  }

  private send(sid: string | undefined, type: string, msg: unknown): void {
    if (sid !== undefined) this.outbox.push({ sid, type, msg });
  }

  // -------------------------------------------------------------------------
  // Clientes

  /**
   * Carrega (ou cria) o registro no Store e entra. É o caminho do WorldRoom. Sem token válido, o
   * servidor gera um e devolve em welcome.token (ou em trocar_sala.token). Devolve null quando o
   * personagem ainda não existe (espera 'criar_personagem') ou é de outro mapa (trocar_sala).
   * `explicit`: o cliente pediu esta sala pelo mapId (a sandbox só aceita assim).
   */
  async join(sessionId: string, hello: C2S_Hello, opts: { explicit?: boolean } = {}): Promise<S2C_Welcome | null> {
    const { token, generated } = normalizeToken(hello?.token);
    const h: C2S_Hello = { ...(hello ?? {}), token };
    if (this.sandbox && opts.explicit !== false) {
      const w = this.addClient(sessionId, h);
      if (w && generated) w.token = token;
      return w;
    }
    let row: StoredPlayer | undefined;
    if (this.store && !this.slots.has(token)) {
      try {
        row = await this.store.getOrCreatePlayer(token, cleanName(hello?.name) ?? DEFAULT_PLAYER_NAME);
      } catch (err) {
        this.log(`[core] store falhou para um token; seguindo sem persistência: ${String(err)}`);
      }
    }
    if (this.sandbox) {
      // sala do protótipo sem pedido explícito: manda para o mapa do registro
      const rec = row?.data ?? this.records.get(token) ?? newPlayerRecord(randomUUID(), DEFAULT_PLAYER_NAME);
      this.redirect(this.ensureSession(sessionId, token), mapForRecord(rec), 'registro', generated);
      return null;
    }
    return this.addClient(sessionId, h, row?.data, { generated, ...(opts.explicit !== undefined ? { explicit: opts.explicit } : {}) });
  }

  /** Ponto de um marcador spawn_jogador pelo id (as entradas do mapa); undefined = o padrão. */
  spawnPointOf(markerId: string | undefined): Vec | undefined {
    if (!markerId) return undefined;
    // Fase 4: a saída da casa aponta para o marcador 'moradia' (a porta), que não é spawn_jogador
    const m = this.world.map.markers.find((x) => x.kind === 'spawn_jogador' && x.id === markerId) ?? this.world.map.markers.find((x) => x.id === markerId);
    return m ? { x: m.x, y: m.y } : undefined;
  }

  /**
   * Entra (ou volta) com um hello. Mesmo token = mesmo personagem: se ele ainda está no mundo (no
   * automático depois da queda), volta a ser controlado; senão nasce no spawn com o progresso do
   * registro. Uma sessão antiga do mesmo token é derrubada (takeKicked). Fora da sandbox, devolve
   * null quando falta criar o personagem ou ele é de outro mapa (as mensagens vão pela caixa).
   */
  addClient(sessionId: string, hello: C2S_Hello, rec?: PlayerRecord, opts: { generated?: boolean; explicit?: boolean } = {}): S2C_Welcome | null {
    const { token, generated: gen0 } = normalizeToken(hello?.token);
    const generated = gen0 || opts.generated === true;
    const name = cleanName(hello?.name);
    // a sessão já existia com outro token: solta o personagem anterior
    const prevSess = this.sessions.get(sessionId);
    if (prevSess && prevSess.token !== token) this.removeClient(sessionId);

    let slot = this.slots.get(token);
    let dutyResult: GameResult | undefined;
    if (slot && !this.world.entities.has(slot.entityId)) {
      this.slots.delete(token);
      slot = undefined;
    }
    if (slot) {
      if (slot.sid && slot.sid !== sessionId) {
        this.sessions.delete(slot.sid);
        this.kicked.push(slot.sid);
      }
      const e = this.world.entities.get(slot.entityId)!;
      if (slot.sandbox && name && name !== e.name) {
        e.name = name;
        slot.rec.name = name;
      }
    } else if (this.sandbox) {
      const r = rec ? clone(rec) : this.records.get(token) ? clone(this.records.get(token)!) : newPlayerRecord(randomUUID(), name ?? DEFAULT_PLAYER_NAME);
      if (name) r.name = name;
      r.criado = true;
      slot = this.spawnSlot(token, r, true, hello?.archetypeId);
    } else {
      const r = rec ? clone(rec) : this.records.get(token) ? clone(this.records.get(token)!) : newPlayerRecord(randomUUID(), name ?? DEFAULT_PLAYER_NAME);
      const sess = this.ensureSession(sessionId, token);
      const target = mapForRecord(r);
      // Fase 3: fica neste mapa quem é daqui, quem pediu esta sala (trocar_sala) ou quem chegou por
      // uma saída, desde que o estágio deixe estar aqui (handoff.ts mapAllowed)
      // Fase 4: a sala de uma casa confere a permissão do dono
      // Fase 5: o andar da masmorra só recebe quem é do grupo da run
      const stay = target === this.mapId || ((opts.explicit === true || hasArrival(token, this.mapId)) && mapAllowed(r, this.mapId) && this.canEnterHouse(r) && this.canEnterDungeon(r));
      if (!stay) {
        this.redirect(sess, target, 'registro', generated);
        return null;
      }
      if (!r.criado) {
        sess.pending = r;
        if (generated) sess.tokenToSend = true;
        this.records.set(token, clone(r));
        this.send(sessionId, GAME_MSG.perfil, profileOf(r, controlesLiberados(r)));
        return null;
      }
      // Fase 4: ciclos da cidade que o registro não viu, moradia inicial e o que o mercado deve
      const sync = this.syncRecord(r);
      // Fase 5: voltou do plantão: sai do QG e o relatório entra no registro
      const duty = this.city.duty.back(r);
      for (const a of duty.fechados) this.city.dropDuty(a.id);
      const arr = takeArrival(token, this.mapId);
      slot = this.spawnSlot(token, r, false, undefined, this.spawnPointOf(arr?.spawn));
      // chegou pela porta da moradia: só volta para a casa saindo e entrando de novo
      if (arr?.spawn) slot.doors.add(arr.spawn);
      if (sync.mudou) slot.dirty = true;
      for (const t of sync.avisos) this.send(sessionId, GAME_MSG.aviso, { texto: t, tipo: 'info' });
      if (duty.result.mudou) dutyResult = duty.result;
      if (this.house) this.send(sessionId, GAME_MSG.casaInfo, casaView(this.ownerRecord(), r.id !== this.house.ownerId) satisfies S2C_CasaInfo | null);
      if (this.dungeon) {
        slot.onDungeonExit = true;
        this.send(sessionId, GAME_MSG.masmorraInfo, this.dungeonInfo(r.id));
      }
    }
    this.comeBack(slot);
    slot.sid = sessionId;
    if (dutyResult) this.applyResult(slot, dutyResult);
    const sess = this.ensureSession(sessionId, token);
    sess.pending = undefined;
    sess.movedTo = undefined;
    this.persist(slot);
    const wel = this.welcomeOf(slot);
    if (generated || sess.tokenToSend) wel.token = token;
    sess.tokenToSend = undefined;
    if (!slot.sandbox) slot.notify = true;
    this.flushNotify();
    return wel;
  }

  private welcomeOf(slot: Slot): S2C_Welcome {
    return { you: slot.entityId, mapId: this.mapId, tick: this.world.tick, tickRate: TICK_RATE, protocol: PROTOCOL_VERSION };
  }

  private ensureSession(sessionId: string, token: string): Session {
    let sess = this.sessions.get(sessionId);
    if (!sess) {
      sess = {
        sid: sessionId,
        token,
        connected: true,
        lastSeq: -1,
        inputQ: [],
        lastInputTick: this.world.tick,
        // SUGESTÃO: começa com 5 de crédito (a primeira rajada depois do welcome drena logo)
        credit: 5,
        paused: false,
        cack: 0,
        recent: new Set(),
        recentOrder: [],
        cmdQ: [],
        rtt: 0,
        ackTick: 0,
        sent: new Map(),
        gone: new Map(),
      };
      this.sessions.set(sessionId, sess);
    } else {
      // hello repetido na mesma sessão: o cliente pode ter perdido o estado, manda tudo de novo
      sess.token = token;
      sess.connected = true;
      sess.sent.clear();
      sess.gone.clear();
    }
    return sess;
  }

  /** Manda a sessão para a sala de outro mapa. */
  private redirect(sess: Session, mapId: string, motivo: S2C_TrocarSala['motivo'], generated: boolean): void {
    sess.movedTo = mapId;
    sess.pending = undefined;
    const msg: S2C_TrocarSala = { mapId, motivo };
    if (generated || sess.tokenToSend) msg.token = sess.token;
    this.send(sess.sid, GAME_MSG.trocarSala, msg);
  }

  /** A conexão acabou de vez: o personagem fica no automático e sai depois de OFFLINE_AUTO_MS. */
  removeClient(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    this.sessions.delete(sessionId);
    const slot = this.slots.get(s.token);
    if (slot && slot.sid === sessionId) {
      slot.sid = undefined;
      this.goOffline(slot);
    }
  }

  /** Queda sem consentimento (o Colyseus espera a reconexão): automático, mas a sessão fica. */
  dropClient(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    s.connected = false;
    s.inputQ.length = 0;
    s.cmdQ.length = 0;
    s.paused = false;
    const slot = this.slots.get(s.token);
    if (slot && slot.sid === sessionId) this.goOffline(slot);
  }

  /** A mesma sessão voltou (reconexão do Colyseus). */
  resumeClient(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    s.connected = true;
    s.lastInputTick = this.world.tick;
    const slot = this.slots.get(s.token);
    if (slot && slot.sid === sessionId) this.comeBack(slot);
  }

  /** Sessões derrubadas porque o mesmo token entrou por outra (o adaptador fecha a conexão). */
  takeKicked(): string[] {
    const k = this.kicked;
    this.kicked = [];
    return k;
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /** Personagem de uma sessão (testes e ferramentas). */
  entityOf(sessionId: string): Entity | undefined {
    const s = this.sessions.get(sessionId);
    const slot = s && this.slots.get(s.token);
    return slot ? this.world.entities.get(slot.entityId) : undefined;
  }

  /** Personagem de um token, conectado ou no automático. */
  entityOfToken(token: string): Entity | undefined {
    const slot = this.slots.get(token);
    return slot ? this.world.entities.get(slot.entityId) : undefined;
  }

  companionOf(sessionId: string): Entity | undefined {
    const s = this.sessions.get(sessionId);
    const slot = s && this.slots.get(s.token);
    return slot?.companionId !== undefined ? this.world.entities.get(slot.companionId) : undefined;
  }

  /** Registro do jogador de uma sessão (o do personagem no mundo, ou o que espera a criação). */
  recordOf(sessionId: string): PlayerRecord | undefined {
    const s = this.sessions.get(sessionId);
    if (!s) return undefined;
    const slot = this.slots.get(s.token);
    if (slot) {
      this.pull(slot);
      return slot.rec;
    }
    return s.pending;
  }

  private goOffline(slot: Slot): void {
    const e = this.world.entities.get(slot.entityId);
    if (!e || slot.offlineSince !== undefined) return;
    slot.autoBefore = e.auto === true;
    slot.offlineSince = this.world.tick;
    e.auto = true;
    e.moveIntent = { x: 0, y: 0 };
    this.persist(slot);
  }

  private comeBack(slot: Slot): void {
    if (slot.offlineSince === undefined) return;
    const e = this.world.entities.get(slot.entityId);
    if (e) {
      e.auto = slot.autoBefore;
      e.moveIntent = { x: 0, y: 0 };
      e.moveTo = undefined;
      e.path = undefined;
    }
    slot.offlineSince = undefined;
  }

  private kitLevelMin(id: string): number {
    const D = getData();
    if (D.archetypesById.has(id)) return 12;
    if (D.classesById.has(id)) return 8;
    return 1;
  }

  private validKit(id: unknown): id is string {
    if (typeof id !== 'string') return false;
    const D = getData();
    return id === 'delta' || D.archetypesById.has(id) || D.classesById.has(id);
  }

  /** Nasce o personagem do registro no spawn. */
  private spawnSlot(token: string, rec: PlayerRecord, sandbox: boolean, archetypeReq?: string, at?: Vec): Slot {
    const D = getData();
    let e: Entity;
    const side = rec.side ?? undefined;
    const pos = at ?? this.spawn;
    if (sandbox) {
      const saved = rec.archetype ?? rec.class ?? undefined;
      const kit = typeof archetypeReq === 'string' && D.archetypesById.has(archetypeReq) ? archetypeReq : this.validKit(saved) ? saved : this.defaultArchetype;
      const level = Math.max(Math.max(1, Math.min(99, Math.floor(rec.level))), this.kitLevelMin(kit));
      e = spawnPlayer(this.world, {
        name: rec.name,
        archetypeId: kit,
        level,
        x: pos.x,
        y: pos.y,
        playerId: rec.id,
        xp: Math.max(0, rec.xp),
        ...(side ? { side } : {}),
        ...(rec.loadout.slot3_ability ? { slot3: rec.loadout.slot3_ability } : {}),
      });
    } else {
      const cap = simLevelCap(rec);
      e = spawnPlayer(this.world, {
        name: rec.name,
        archetypeId: simKitOf(rec),
        level: Math.max(1, Math.floor(rec.level)),
        xp: Math.max(0, rec.xp),
        x: pos.x,
        y: pos.y,
        playerId: rec.id,
        look: recordLook(rec),
        ...(cap !== undefined ? { levelCap: cap } : {}),
        ...(isDeltaRookie(rec) ? { deltaRookie: true } : {}),
        ...(side ? { side } : {}),
        // Fase 3: talentos, guia e botão 3 do registro valem desde o nascimento
        ...simSpawnExtrasOf(rec),
      });
    }
    e.semente = Math.max(0, rec.semente);
    e.credito = Math.max(0, rec.credito);
    e.inventory = rec.inventory.filter((x): x is string => typeof x === 'string');
    if (e.loadout) e.loadout.itemCount = Math.max(0, Math.floor(rec.item_count));
    // o registro pode ter cartas gravadas antes da validação: passam pelo mesmo filtro
    e.doctrine = sanitizeDoctrine(Array.isArray(rec.doctrine) ? rec.doctrine : [], 5);
    e.auto = rec.auto === true;
    const slot: Slot = {
      token,
      rec,
      sandbox,
      entityId: e.id,
      autoBefore: e.auto,
      lastLevel: e.level,
      dirty: false,
      notify: false,
      queued: [],
      inside: new Set(),
      stickDown: false,
      hadTarget: false,
      bornTick: this.world.tick,
      exitWarned: new Set(),
      interactAt: new Map(),
      doors: new Set(),
    };
    if (!sandbox && this.jaco && rec.stage !== 'margem') this.spawnJaco(slot, e);
    else if (this.companions) this.spawnCompanion(slot, e);
    this.slots.set(token, slot);
    // Fase 5: os plantonistas levados por este jogador vêm junto para esta sala
    if (!sandbox) for (const a of this.city.duty.ofTaker(rec.id)) this.spawnDuty(slot, e, a);
    return slot;
  }

  /** Nasce o plantonista do plantão `a` ao lado de quem levou, no grupo dele. */
  private spawnDuty(slot: Slot, e: Entity, a: DutyAssignment): Entity | undefined {
    const rec = this.city.duty.recordOf(a.plantonistaId);
    if (!rec || this.dutyEnts.has(a.id)) return undefined;
    e.partyId ??= `grupo_${slot.rec.id}`;
    try {
      const p = spawnPlantonista(this.world, rec, e.x + DUTY_SPAWN_OFFSET_TILES, e.y, { partyId: e.partyId, assignment: a });
      p.spawnX = this.spawn.x;
      p.spawnY = this.spawn.y;
      this.dutyEnts.set(a.id, { a, entityId: p.id });
      return p;
    } catch (err) {
      this.log(`[core] plantonista não nasceu: ${String(err)}`);
      return undefined;
    }
  }

  /** Tira os plantonistas de um jogador desta sala (sem fechar o plantão: ele pode ir para outra sala). */
  private removeDutyOf(takerId: string): void {
    for (const [id, d] of Array.from(this.dutyEnts)) {
      if (d.a.levadoPor !== takerId) continue;
      this.world.entities.delete(d.entityId);
      this.dutyEnts.delete(id);
    }
  }

  /** CityCore: o plantão acabou (dono voltou ou foi dispensado). */
  dropDuty(assignmentId: string): void {
    const d = this.dutyEnts.get(assignmentId);
    if (!d) return;
    this.world.entities.delete(d.entityId);
    this.dutyEnts.delete(assignmentId);
  }

  /** Fecha os plantões levados por este jogador (ele saiu do jogo). */
  private endDutiesOf(takerId: string): void {
    for (const a of this.city.duty.ofTaker(takerId)) {
      const d = this.dutyEnts.get(a.id);
      if (d) tickPlantao(this.world, a);
      this.dropDuty(a.id);
      this.city.duty.end(a);
    }
  }

  /**
   * SUGESTÃO: o companheiro de IA do protótipo é o treinador da outra ala do template (quem é Peão
   * Brabo anda com o Li Wei como Idol, e vice-versa), no mesmo nível, seguindo só o seu jogador.
   */
  private spawnCompanion(slot: Slot, e: Entity): void {
    const trainerId = e.archetypeId === 'idol' ? 'wesley' : 'li_wei';
    const archetypeId = getData().trainersById.get(trainerId)?.archetype ?? (trainerId === 'wesley' ? 'peao_brabo' : 'idol');
    this.addCompanion(slot, e, trainerId, archetypeId, Math.max(12, e.level));
  }

  /**
   * Decisão da Fase 2: o Seu Jacó acompanha quem está no Delta (Sistemas.md: "só luta em grupo dá
   * XP"; o Seu Jacó é o companheiro de IA do novato). Luta com o kit do Delta, no nível do jogador.
   */
  private spawnJaco(slot: Slot, e: Entity): void {
    const c = this.addCompanion(slot, e, 'seu_jaco', 'delta', Math.max(1, e.level));
    if (c) c.name = getData().npcsById.get('seu_jaco')?.name ?? 'Seu Jacó';
  }

  private addCompanion(slot: Slot, e: Entity, defId: string, kit: string, level: number): Entity | undefined {
    try {
      const c = spawnAlly(this.world, defId, e.x + 0.8, e.y, { archetypeId: kit, level });
      const party = `grupo_${slot.rec.id}`;
      c.partyId = party;
      e.partyId = party;
      c.spawnX = this.spawn.x;
      c.spawnY = this.spawn.y;
      slot.companionId = c.id;
      return c;
    } catch (err) {
      this.log(`[core] companheiro não nasceu: ${String(err)}`);
      return undefined;
    }
  }

  // -------------------------------------------------------------------------
  // Registro <-> entidade

  /** Entidade -> registro: moedas, inventário, poções, Doutrina e automático (e, na sandbox, kit e nível). */
  private pull(slot: Slot): void {
    const e = this.world.entities.get(slot.entityId);
    if (!e) return;
    const r = slot.rec;
    r.semente = Math.max(0, Math.round(e.semente ?? 0));
    r.credito = Math.max(0, Math.round(e.credito ?? 0));
    r.inventory = [...(e.inventory ?? [])];
    r.item_count = e.loadout?.itemCount ?? 0;
    r.doctrine = clone(e.doctrine ?? []);
    r.auto = slot.offlineSince !== undefined ? slot.autoBefore : e.auto === true;
    if (slot.sandbox) {
      r.name = e.name;
      r.level = e.level;
      r.xp = Math.floor(e.xp ?? 0);
      r.archetype = e.archetypeId ?? null;
      r.class = e.classId ?? null;
      r.side = e.side ?? null;
      if (e.archetypeId && e.loadout?.b3) r.loadout.slot3_ability = e.loadout.b3;
    }
  }

  /** Registro -> entidade: kit, nível, XP, teto, novato do Delta, visual, nome, moedas e poções. */
  private push(slot: Slot): void {
    if (slot.sandbox) return;
    const e = this.world.entities.get(slot.entityId);
    if (!e) return;
    const w = this.world;
    const r = slot.rec;
    this.syncKit(e, r);
    if (e.level !== r.level) relevel(w, e, r.level);
    e.xp = Math.max(0, r.xp);
    const cap = simLevelCap(r);
    if (cap === undefined) delete e.levelCap;
    else e.levelCap = cap;
    if (isDeltaRookie(r)) e.deltaRookie = true;
    else delete e.deltaRookie;
    e.look = recordLook(r);
    e.name = r.name;
    e.semente = r.semente;
    e.credito = r.credito;
    e.inventory = [...r.inventory];
    if (e.loadout) e.loadout.itemCount = r.item_count;
    slot.lastLevel = e.level;
  }

  /**
   * Fase 3: kit, talentos, guia e botão 3 do registro na entidade, sem renascer (a entidade mantém
   * o id, a posição e a fração de vida). Os números fixos dos talentos e do guia (stats.pct) saem
   * pela conta antiga e entram pela nova, como se a entidade tivesse nascido com eles.
   */
  private syncKit(e: Entity, r: PlayerRecord): void {
    const kit = simKitOf(r);
    const ex = simSpawnExtrasOf(r);
    const talents = ex.talents ?? [];
    const cur = e.archetypeId ?? e.classId ?? 'delta';
    const talChanged = talents.join(',') !== (e.talents ?? []).join(',') || (ex.guideId ?? undefined) !== (e.guideId ?? undefined);
    const curS3 = e.loadout?.b3 ? baseAbilityId(e.loadout.b3) : undefined;
    const s3Changed = ex.slot3 !== undefined && ex.slot3 !== curS3;
    if (kit === cur && !talChanged && !s3Changed) return;
    const before = flatPctOf(e);
    if (r.side) e.side = r.side;
    if (talents.length > 0) e.talents = [...talents];
    else delete e.talents;
    if (ex.guideId) e.guideId = ex.guideId;
    else delete e.guideId;
    try {
      setArchetype(this.world, e, kit, ex.slot3 ?? r.loadout.slot3_ability ?? undefined);
    } catch (err) {
      this.log(`[core] kit ${kit} falhou: ${String(err)}`);
    }
    const after = flatPctOf(e);
    const pct = e.stats.pct as Record<string, number | undefined>;
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) pct[k] = (pct[k] ?? 0) - (before[k] ?? 0) + (after[k] ?? 0);
  }

  private persist(slot: Slot): Promise<void> {
    this.pull(slot);
    slot.dirty = false;
    const rec = clone(slot.rec);
    this.records.set(slot.token, rec);
    if (slot.sandbox || !this.store) return Promise.resolve();
    return this.store.savePlayer({ id: rec.id, token: slot.token, name: rec.name, data: rec }).catch((err) => this.log(`[core] falha ao salvar: ${String(err)}`));
  }

  /** Tira o personagem (e o companheiro) do mapa. */
  private removeSlot(slot: Slot): void {
    this.world.entities.delete(slot.entityId);
    if (slot.companionId !== undefined) this.world.entities.delete(slot.companionId);
    this.removeDutyOf(slot.rec.id);
    this.slots.delete(slot.token);
  }

  /** Tira o personagem do mapa (depois do tempo no automático), com o progresso salvo. */
  private despawn(slot: Slot): void {
    // Fase 5: sai da run com o que já ganhou, devolve os plantonistas e, com on_duty, fica de plantão
    if (!slot.sandbox) {
      this.pull(slot);
      if (this.dungeon) this.claimDungeon(slot);
      this.endDutiesOf(slot.rec.id);
    }
    this.persist(slot);
    if (!slot.sandbox && slot.rec.criado) this.city.duty.offer(slot.rec);
    this.removeSlot(slot);
    if (slot.sid) {
      this.sessions.delete(slot.sid);
      this.kicked.push(slot.sid);
    }
  }

  /** Grava todos agora (desligando o servidor). */
  async saveAll(): Promise<void> {
    await Promise.all(Array.from(this.slots.values()).map((s) => this.persist(s)));
    await this.store?.flush();
  }

  // -------------------------------------------------------------------------
  // Regras de jogo (Fase 2)

  /** Aplica o resultado de uma regra: saque das recompensas, entidade, avisos, gravação e perfil. */
  private applyResult(slot: Slot, r: GameResult): void {
    const e = this.world.entities.get(slot.entityId);
    for (const x of r.itensParaRolar) if (e) rollRewardItems(this.world, e, x.tabela, x.quantidade);
    if (r.mudou || r.niveis.length > 0 || r.estagio) {
      this.push(slot);
      slot.dirty = true;
      slot.notify = true;
    }
    for (const a of avisosOf(r)) this.send(slot.sid, GAME_MSG.aviso, a);
    // Fase 5: missão entregue soma influência da margem na região
    if (r.concluidas.length > 0 && e) this.influence(slot.rec.side, regionAt(this.world, e.x, e.y), 'missao', r.concluidas.length);
    // Fase 3: o guia fala (missão aceita, bônus)
    for (const f of r.falasGuia ?? []) this.send(slot.sid, GAME_MSG.falaGuia, f satisfies S2C_FalaGuia);
  }

  /** Evento de jogo para o registro do slot (com pull antes). */
  private gameEvent(slot: Slot, ev: GameEvent, grupo?: { personagens: number; aoVivo: number }): void {
    if (slot.sandbox) return;
    this.pull(slot);
    this.applyResult(slot, onGameEvent(slot.rec, ev, grupo ? { grupo } : {}));
  }

  /** Perfil e estado das missões de quem mudou; grava quem mudou (o Store faz o debounce). */
  private flushNotify(): void {
    for (const slot of this.slots.values()) {
      if (slot.notify) {
        slot.notify = false;
        if (slot.sid) {
          this.send(slot.sid, GAME_MSG.perfil, profileOf(slot.rec, controlesLiberados(slot.rec, currentObjectives(slot.rec).map((c) => c.objetivo))));
          this.send(slot.sid, GAME_MSG.missaoEstado, this.missionStateOf(slot));
        }
      }
      if (slot.dirty) this.persist(slot);
    }
  }

  private missionStateOf(slot: Slot): S2C_MissaoEstado {
    const e = this.world.entities.get(slot.entityId);
    return missionStatus(slot.rec, this.world.map, e ? { x: e.x, y: e.y } : undefined) as S2C_MissaoEstado;
  }

  private aviso(sid: string, texto: string): void {
    this.send(sid, GAME_MSG.aviso, { texto, tipo: 'erro' });
  }

  /**
   * Mensagem de jogo do cliente (GAME_MSG: criar_personagem, maquina_visual, falar, dialogo_opcao,
   * missao_aceitar, travessia, tutorial_passo). As respostas vão para a caixa de saída.
   */
  onGameMessage(sessionId: string, type: string, raw: unknown): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    try {
      if (type === GAME_MSG.criarPersonagem) {
        this.onCreate(s, raw as C2S_CriarPersonagem);
        return;
      }
      const slot = this.slots.get(s.token);
      const e = slot && slot.sid === sessionId ? this.world.entities.get(slot.entityId) : undefined;
      if (!slot || !e || slot.sandbox) return;
      this.pull(slot);
      const m = isObj(raw) ? raw : {};
      // Fase 4: carteira, loja, feira, app, câmbio e casa
      if (ECON_MSGS.has(type)) {
        this.onEconomy(slot, e, type, m);
        return;
      }
      // Fase 5: itens, Doutrina, plantão, masmorra e facção
      if (FASE5_MSGS.has(type)) {
        this.onFase5(slot, e, type, m);
        return;
      }
      switch (type) {
        case GAME_MSG.maquinaVisual:
          this.onVisual(slot, e, m as unknown as C2S_MaquinaVisual);
          break;
        case GAME_MSG.falar:
          this.onTalk(slot, e, m as C2S_Falar);
          break;
        case GAME_MSG.dialogoOpcao:
          this.onDialogOption(slot, e, m as unknown as C2S_DialogoOpcao);
          break;
        case GAME_MSG.missaoAceitar: {
          const id = (m as unknown as C2S_MissaoAceitar).id;
          const a = acceptMission(slot.rec, typeof id === 'string' ? id : '');
          if (a.ok) this.applyResult(slot, a.resultado);
          else this.aviso(sessionId, a.erro);
          break;
        }
        case GAME_MSG.travessia:
          this.onTravessia(slot, e, m as unknown as C2S_Travessia);
          break;
        case GAME_MSG.tutorialPasso: {
          const t = m as C2S_TutorialPasso;
          if (typeof t.passo === 'string' && STEPS.has(t.passo)) this.gameEvent(slot, { t: 'tutorial', passo: t.passo });
          if (typeof t.controle === 'string' && CONTROLS.has(t.controle)) this.gameEvent(slot, { t: 'control', controle: t.controle });
          break;
        }
        // ---- Fase 3 ----
        case GAME_MSG.escolherAla:
          this.onChooseAla(slot, e, m as unknown as C2S_EscolherAla);
          break;
        case GAME_MSG.escolherTalento: {
          const id = (m as unknown as C2S_EscolherTalento).talent;
          const p = pickTalent(slot.rec, typeof id === 'string' ? id : '');
          if (!p.ok) {
            this.aviso(sessionId, p.erro);
            break;
          }
          this.applyResult(slot, p.resultado);
          this.sendProgress(slot);
          break;
        }
        case GAME_MSG.trocarSlot3: {
          const id = (m as unknown as C2S_TrocarSlot3).ability;
          const c = setSlot3(slot.rec, typeof id === 'string' ? id : '');
          if (!c.ok) {
            this.aviso(sessionId, c.erro);
            break;
          }
          this.push(slot);
          slot.dirty = true;
          slot.notify = true;
          this.sendProgress(slot);
          break;
        }
        case GAME_MSG.progressoOpcoes:
          this.sendProgress(slot);
          break;
        case GAME_MSG.instituicao: {
          const id = (m as unknown as C2S_Instituicao).id;
          const info = institutionInfo(slot.rec, typeof id === 'string' ? id : slot.rec.institution);
          if (info) this.send(sessionId, GAME_MSG.instituicaoInfo, info satisfies S2C_InstituicaoInfo);
          else this.aviso(sessionId, 'Instituição desconhecida.');
          break;
        }
        case GAME_MSG.missaoPagar: {
          const id = (m as unknown as C2S_MissaoPagar).missao;
          const p = payObjective(slot.rec, typeof id === 'string' ? id : undefined);
          if (!p.ok) {
            this.aviso(sessionId, p.erro);
            break;
          }
          // a moeda saiu do registro: a entidade acompanha
          this.push(slot);
          slot.dirty = true;
          slot.notify = true;
          this.applyResult(slot, p.resultado);
          break;
        }
        case GAME_MSG.emote:
          this.onEmote(slot, e, m as unknown as C2S_Emote);
          break;
        default:
          break;
      }
    } catch (err) {
      this.log(`[core] mensagem ${type} falhou: ${err instanceof Error ? err.stack : String(err)}`);
    } finally {
      this.flushInfluence();
      this.flushNotify();
    }
  }

  /** Opções de ala, talentos pendentes e botões (progresso_info). */
  private sendProgress(slot: Slot): void {
    this.send(slot.sid, GAME_MSG.progressoInfo, progressOptions(slot.rec) satisfies S2C_ProgressoOpcoes);
  }

  /** NPC deste id de dados a até `reach` tiles (borda a borda). */
  private npcNear(e: Entity, npcId: string, reach: number): boolean {
    for (const n of this.world.entities.values()) {
      if (n.kind !== 'npc' || n.dead || n.defId !== npcId) continue;
      if (Math.hypot(n.x - e.x, n.y - e.y) - n.radius - e.radius <= reach) return true;
    }
    return false;
  }

  /**
   * Escolher a ala no 12 pela mensagem direta. SUGESTÃO: pede o treinador da ala ou quem recebe a
   * base por perto (a opção 'ala:<id>' do diálogo é o outro caminho, com a mesma regra).
   */
  private onChooseAla(slot: Slot, e: Entity, msg: C2S_EscolherAla): void {
    const id = typeof msg.archetype === 'string' ? msg.archetype : '';
    const a = getData().archetypesById.get(id);
    const trainers = [a?.treinador, baseTrainerOf(slot.rec)].filter((t): t is string => typeof t === 'string');
    if (a && !trainers.some((t) => this.npcNear(e, t, ALA_TRAINER_REACH_TILES))) {
      this.aviso(slot.sid!, 'Fale com o treinador da ala na sede da instituição.');
      return;
    }
    const c = chooseArchetype(slot.rec, id);
    if (!c.ok) {
      this.aviso(slot.sid!, c.erro);
      return;
    }
    this.applyResult(slot, c.resultado);
    this.sendProgress(slot);
  }

  /** Emote liberado: vai para todos no raio de interesse (o próprio jogador também). */
  private onEmote(slot: Slot, e: Entity, msg: C2S_Emote): void {
    const w = this.world;
    if (slot.lastEmoteTick !== undefined && w.tick - slot.lastEmoteTick < msToTicks(EMOTE_COOLDOWN_MS)) return;
    const u = useEmote(slot.rec, typeof msg.emote === 'string' ? msg.emote : '');
    if (!u.ok || !u.emote) {
      this.aviso(slot.sid!, u.ok ? 'Emote desconhecido.' : u.erro);
      return;
    }
    slot.lastEmoteTick = w.tick;
    const out: S2C_Emote = { entity: e.id, playerId: slot.rec.id, nome: slot.rec.name, emote: u.emote.id, texto: u.emote.texto, animacao: u.emote.animacao, quadros: u.emote.quadros };
    const R2 = this.interestRadius * this.interestRadius;
    for (const s of this.sessions.values()) {
      if (!s.connected) continue;
      const me = this.entityOf(s.sid);
      if (!me) continue;
      const dx = me.x - e.x, dy = me.y - e.y;
      if (dx * dx + dy * dy <= R2) this.send(s.sid, GAME_MSG.emote, out);
    }
  }

  /** Cadastro do Delta: valida nome e aparência, nasce o personagem e manda o welcome. */
  private onCreate(s: Session, msg: C2S_CriarPersonagem): void {
    const rec = s.pending;
    if (!rec) {
      if (this.slots.has(s.token)) this.aviso(s.sid, 'Personagem já cadastrado. Para mudar o visual, use a Máquina de Visual.');
      return;
    }
    const m = isObj(msg) ? msg : ({} as C2S_CriarPersonagem);
    const r = createCharacter(rec, m.name, m.appearance);
    if (!r.ok) {
      this.aviso(s.sid, r.erro);
      this.send(s.sid, GAME_MSG.perfil, profileOf(rec, controlesLiberados(rec)));
      return;
    }
    s.pending = undefined;
    const target = mapForRecord(rec);
    if (target !== this.mapId) {
      // não acontece com os mapas do piloto (criação é no Delta); fica por segurança
      this.records.set(s.token, clone(rec));
      void this.store?.savePlayer({ id: rec.id, token: s.token, name: rec.name, data: clone(rec) });
      this.redirect(s, target, 'registro', s.tokenToSend === true);
      return;
    }
    const slot = this.spawnSlot(s.token, rec, false);
    slot.sid = s.sid;
    s.lastSeq = -1;
    s.inputQ.length = 0;
    s.sent.clear();
    s.gone.clear();
    const wel = this.welcomeOf(slot);
    if (s.tokenToSend) wel.token = s.token;
    s.tokenToSend = undefined;
    this.send(s.sid, MSG.welcome, wel);
    slot.dirty = true;
    slot.notify = true;
    this.applyResult(slot, r.resultado);
  }

  private onVisual(slot: Slot, e: Entity, msg: C2S_MaquinaVisual): void {
    const where = { map: this.world.map, x: e.x, y: e.y };
    const change = isObj(msg.change) ? msg.change : {};
    const id = typeof msg.maquina === 'string' ? msg.maquina : nearVisualMachine(where);
    if (!id) {
      this.aviso(slot.sid!, 'Chegue perto de uma Máquina de Visual.');
      return;
    }
    const chk = applyVisualMachine(slot.rec, change, id, where);
    if (!chk.ok) {
      this.aviso(slot.sid!, chk.erro);
      return;
    }
    this.push(slot);
    slot.dirty = true;
    slot.notify = true;
    this.gameEvent(slot, { t: 'interact', alvo: id, acao: 'usar' });
  }

  /** NPC ao alcance (por entidade ou id de dados) e a conversa. */
  private onTalk(slot: Slot, e: Entity, msg: C2S_Falar): void {
    const q: { entity?: number; npcId?: string } = {};
    if (isInt(msg.entity)) q.entity = msg.entity;
    if (typeof msg.npcId === 'string') q.npcId = msg.npcId;
    if (q.entity === undefined && q.npcId === undefined) return;
    // Fase 3: o guia anda com o jogador ('guia' ou o id dele): conversa sem precisar chegar perto
    if (q.entity === undefined && q.npcId !== undefined && guideOf(slot.rec) && isOwnGuide(slot.rec, q.npcId)) {
      this.talk(slot, q.npcId);
      return;
    }
    const n = npcInReach(this.world, e, q);
    if (!n) {
      this.aviso(slot.sid!, 'Chegue mais perto para conversar.');
      return;
    }
    this.talk(slot, n.defId);
  }

  private talk(slot: Slot, npcId: string): void {
    this.pull(slot);
    const t = talkTo(slot.rec, npcId);
    slot.lastDialog = t.dialogo;
    this.send(slot.sid, GAME_MSG.dialogo, t.dialogo satisfies S2C_Dialogo);
    this.applyResult(slot, t.resultado);
  }

  private onDialogOption(slot: Slot, e: Entity, msg: C2S_DialogoOpcao): void {
    const npcId = typeof msg.npcId === 'string' ? msg.npcId : '';
    const opcao = typeof msg.opcao === 'string' ? msg.opcao : '';
    const guia = guideOf(slot.rec) !== undefined && isOwnGuide(slot.rec, npcId);
    if (!guia && !npcInReach(this.world, e, { npcId })) {
      this.aviso(slot.sid!, 'Chegue mais perto para conversar.');
      return;
    }
    this.pull(slot);
    const res = dialogOption(slot.rec, guia ? 'guia' : npcId, opcao);
    if (!res.ok) {
      this.aviso(slot.sid!, res.erro ?? 'Opção indisponível.');
      return;
    }
    this.applyResult(slot, res.resultado);
    if (opcao === 'tchau') return;
    const base: Dialog = slot.lastDialog && slot.lastDialog.npc === npcId ? slot.lastDialog : { npc: npcId, nome: npcId, contexto: 'opcao', fala: '', opcoes: [] };
    const d: S2C_Dialogo = { ...base, opcoes: dialogOptions(slot.rec, npcId) };
    if (res.abrir) d.abrir = res.abrir;
    slot.lastDialog = { ...base, opcoes: d.opcoes };
    this.send(slot.sid, GAME_MSG.dialogo, d);
    if (res.abrir?.tela === 'travessia') this.send(slot.sid, GAME_MSG.travessiaOpcoes, res.abrir.opcoes);
  }

  /** Perto do Seu Jacó ou da saída do cais. */
  private atCrossing(e: Entity): boolean {
    if (npcInReach(this.world, e, { npcId: 'seu_jaco' })) return true;
    return this.areas.travessia.some((m) => Math.hypot(m.x - e.x, m.y - e.y) <= TRAVESSIA_REACH_TILES);
  }

  /** Travessia: aplica a escolha, grava e manda o jogador para a sala do QG da margem. */
  private onTravessia(slot: Slot, e: Entity, msg: C2S_Travessia): void {
    if (!this.atCrossing(e)) {
      this.aviso(slot.sid!, 'Vá até o cais: o Seu Jacó leva no barco.');
      return;
    }
    this.pull(slot);
    const res = applyTravessia(slot.rec, { side: String(msg.side ?? ''), institution: String(msg.institution ?? ''), guide: String(msg.guide ?? '') });
    if (!res.ok) {
      this.aviso(slot.sid!, res.erro);
      return;
    }
    const sid = slot.sid;
    for (const a of avisosOf(res.resultado)) this.send(sid, GAME_MSG.aviso, a);
    const rec = slot.rec;
    const target = mapForRecord(rec);
    if (sid) this.send(sid, GAME_MSG.perfil, profileOf(rec, controlesLiberados(rec, currentObjectives(rec).map((c) => c.objetivo))));
    if (target === this.mapId) {
      this.push(slot);
      slot.dirty = true;
      slot.notify = true;
      return;
    }
    this.leaveTo(slot, target, undefined, 'travessia');
  }

  /**
   * O personagem sai deste mapa para outro (travessia ou saída do mapa): grava antes de mandar trocar
   * de sala (a sala de destino lê o Store) e deixa a entrada do destino em handoff.ts.
   */
  private leaveTo(slot: Slot, target: string, spawn: string | undefined, motivo: S2C_TrocarSala['motivo']): void {
    const sid = slot.sid;
    slot.notify = false;
    setArrival(slot.token, target, spawn);
    const saved = this.persist(slot);
    this.removeSlot(slot);
    const sess = sid ? this.sessions.get(sid) : undefined;
    if (sess) sess.movedTo = target;
    void saved.then(() => {
      if (sid && this.sessions.get(sid)?.movedTo === target) this.send(sid, GAME_MSG.trocarSala, { mapId: target, motivo } satisfies S2C_TrocarSala);
    });
  }

  /**
   * Fase 3: saída do mapa ('saida' com params.para) por perto: troca de sala para o destino, na
   * entrada params.spawn. A saída da travessia do Delta leva de volta para a margem quem já
   * atravessou (o barco do Toninho). Devolve true quando o personagem saiu deste mapa.
   */
  private checkExits(slot: Slot, e: Entity): boolean {
    if (this.world.tick - slot.bornTick < msToTicks(EXIT_GRACE_MS)) return false;
    for (const mk of this.areas.exits) {
      const d = Math.hypot(mk.x - e.x, mk.y - e.y);
      if (d > EXIT_RADIUS_TILES) {
        if (d > EXIT_RADIUS_TILES + 1) slot.exitWarned.delete(mk.id);
        continue;
      }
      const dest = this.exitTarget(slot.rec, mk);
      if (!dest) continue;
      if (!mapAllowed(slot.rec, dest.mapId)) {
        if (!slot.exitWarned.has(mk.id)) {
          slot.exitWarned.add(mk.id);
          // SUGESTÃO: texto do aviso de saída fechada.
          if (slot.sid) this.aviso(slot.sid, 'Esse caminho só abre depois da travessia.');
        }
        continue;
      }
      this.pull(slot);
      this.leaveTo(slot, dest.mapId, dest.spawn, 'registro');
      return true;
    }
    return false;
  }

  private exitTarget(rec: PlayerRecord, mk: MapMarker): { mapId: string; spawn?: string } | undefined {
    if (mk.params?.['travessia'] === true) {
      // o cais do Delta: a travessia é pela mensagem 'travessia'; quem já é da margem volta de barco
      return rec.stage === 'margem' && rec.side ? { mapId: ARRIVAL_MAP_BY_SIDE[rec.side] } : undefined;
    }
    const para = mk.params?.['para'];
    if (typeof para !== 'string') return undefined;
    const spawn = mk.params?.['spawn'];
    return { mapId: resolveMapId(para), ...(typeof spawn === 'string' ? { spawn } : {}) };
  }

  /**
   * Fase 3: objetivo 'sobreviver' atual. Conta 1 s por segundo com o jogador de pé (e dentro de
   * naoSairDoRaio, quando houver); as ondas da missão nascem perto, espalhadas pela duração.
   */
  private tickSurvive(slot: Slot, e: Entity): void {
    const w = this.world;
    const cur = currentObjectives(slot.rec).find((c) => c.objetivo.tipo === 'sobreviver');
    if (!cur || cur.objetivo.tipo !== 'sobreviver') {
      slot.survive = undefined;
      return;
    }
    const o = cur.objetivo;
    const key = `${cur.missao.id}:${cur.indice}`;
    if (slot.survive?.key !== key) slot.survive = { key, startTick: w.tick, x: e.x, y: e.y, waves: 0, lastSecond: w.tick };
    const sv = slot.survive;
    // ondas: a onda i nasce em i × duração / ondas
    const ondas = o.ondas ?? [];
    const elapsedS = (w.tick - sv.startTick) / TICK_RATE;
    while (sv.waves < ondas.length && elapsedS >= (sv.waves * o.duracaoS) / ondas.length) {
      const g = ondas[sv.waves]!;
      sv.waves++;
      if (!getData().enemiesById.has(g.inimigo)) continue;
      for (let i = 0; i < g.quantidade; i++) {
        const a = (i / Math.max(1, g.quantidade)) * Math.PI * 2 + sv.waves;
        try {
          spawnEnemy(w, g.inimigo, e.x + Math.cos(a) * SURVIVE_SPAWN_TILES, e.y + Math.sin(a) * SURVIVE_SPAWN_TILES, {
            tier: g.tier,
            level: Math.max(1, slot.rec.level),
            ...(g.afixos && g.afixos.length > 0 ? { affixes: [...g.afixos] } : {}),
          });
        } catch (err) {
          this.log(`[core] onda de ${g.inimigo} falhou: ${String(err)}`);
        }
      }
    }
    if (w.tick - sv.lastSecond < TICK_RATE) return;
    sv.lastSecond += TICK_RATE;
    if (e.dead || e.downedUntil !== undefined) return;
    if (o.naoSairDoRaio !== undefined && Math.hypot(e.x - sv.x, e.y - sv.y) > o.naoSairDoRaio) return;
    this.gameEvent(slot, { t: 'survive', segundos: 1 });
  }

  /** Eventos da simulação deste tick para as regras (só fora da sandbox). */
  private processGameEvents(events: CombatEvent[], before: Map<number, Entity>): void {
    const byEnt = new Map<number, Slot>();
    for (const s of this.slots.values()) if (!s.sandbox) byEnt.set(s.entityId, s);
    if (byEnt.size === 0) return;
    const w = this.world;
    for (const slot of byEnt.values()) {
      // eventos detectados nas entradas e nos comandos
      if (slot.queued.length > 0) {
        const q = slot.queued;
        slot.queued = [];
        for (const ev of q) this.gameEvent(slot, ev);
      }
      // alvo automático travou num inimigo
      const e = w.entities.get(slot.entityId);
      const tgt = e?.targetId !== undefined ? w.entities.get(e.targetId) : undefined;
      const has = !!tgt && tgt.kind === 'enemy';
      if (has && !slot.hadTarget) this.gameEvent(slot, { t: 'control', controle: 'alvo_automatico' });
      slot.hadTarget = has;
    }
    for (const ev of events) {
      switch (ev.t) {
        case 'xp': {
          const slot = byEnt.get(ev.dst);
          if (!slot) break;
          this.pull(slot);
          this.applyResult(slot, gainXp(slot.rec, ev.amount));
          break;
        }
        case 'level': {
          const slot = byEnt.get(ev.dst);
          if (slot) this.gameEvent(slot, { t: 'level', level: ev.level });
          break;
        }
        case 'cast': {
          const slot = byEnt.get(ev.src);
          const e = slot && w.entities.get(slot.entityId);
          const b = e ? botaoOf(e, ev.ability) : undefined;
          if (!slot || !b) break;
          this.gameEvent(slot, { t: 'ability', botao: b, habilidade: ev.ability });
          this.gameEvent(slot, { t: 'control', controle: controlOfBotao(b) });
          break;
        }
        case 'death': {
          const enemy = w.entities.get(ev.dst) ?? before.get(ev.dst);
          if (!enemy || enemy.kind !== 'enemy') break;
          const parts = killParticipants(w, enemy, ev.by);
          const aoVivo = Math.max(1, parts.filter((p) => p.kind === 'player' && !p.onDuty).length);
          // Fase 5: abate soma influência para a margem de cada jogador da luta; com plantonista na
          // luta de elite ou chefe, conta como luta de plantão (SUGESTÃO)
          const reg = regionAt(w, enemy.x, enemy.y);
          for (const p of parts) {
            if (p.kind !== 'player' || !p.side) continue;
            this.influence(p.side, reg, p.onDuty ? 'plantao' : 'matar', p.onDuty ? (enemy.tier === 'elite' || enemy.tier === 'chefe' ? 1 : 0) : 1);
          }
          for (const p of parts) {
            const slot = byEnt.get(p.id);
            if (!slot) continue;
            this.gameEvent(slot, { t: 'kill', enemyId: enemy.defId, tier: enemy.tier ?? 'normal' }, { personagens: parts.length, aoVivo });
          }
          break;
        }
        case 'loot_pick': {
          const slot = byEnt.get(ev.by);
          if (!slot) break;
          const l = (w.entities.get(ev.id) ?? before.get(ev.id))?.loot;
          const e = w.entities.get(slot.entityId);
          if (l?.currency) this.gameEvent(slot, { t: 'pickup', chave: 'moeda', quantidade: 1 });
          if (l?.itemId) {
            if (isResource(l.itemId) && e) {
              // material de saque vai para os recursos do registro, não para o inventário
              const i = (e.inventory ?? []).lastIndexOf(l.itemId);
              if (i >= 0) e.inventory!.splice(i, 1);
              this.pull(slot);
              slot.rec.resources[l.itemId] = (slot.rec.resources[l.itemId] ?? 0) + 1;
              slot.dirty = true;
              this.gameEvent(slot, { t: 'pickup', itemId: l.itemId, recurso: l.itemId, quantidade: 1 });
            } else this.gameEvent(slot, { t: 'pickup', itemId: l.itemId, chave: l.itemId, quantidade: 1 });
          }
          if (!l?.currency && !l?.itemId) this.gameEvent(slot, { t: 'pickup', quantidade: 1 });
          this.gameEvent(slot, { t: 'control', controle: 'saque' });
          break;
        }
        case 'revive': {
          const slot = ev.by !== undefined ? byEnt.get(ev.by) : undefined;
          if (slot) this.gameEvent(slot, { t: 'control', controle: 'reanimar' });
          break;
        }
        default:
          break;
      }
    }
  }

  /** Lugares, regiões e marcadores de interação por perto; o Seu Jacó que cai no objetivo de reanimar. */
  private checkAreas(): void {
    const w = this.world;
    for (const slot of this.slots.values()) {
      if (slot.sandbox) continue;
      const e = w.entities.get(slot.entityId);
      if (!e || e.dead) continue;
      // Fase 3: saídas do mapa (troca de sala) e o objetivo 'sobreviver'
      if (this.checkExits(slot, e)) continue;
      // Fase 4: a porta da moradia leva para a casa; dentro de uma casa não nasce onda de inimigo
      if (this.checkDoors(slot, e)) continue;
      if (!this.house) this.tickSurvive(slot, e);
      // lugar
      let best: string | null = null;
      let bd = Infinity;
      for (const mk of this.areas.places) {
        const d = Math.hypot(mk.x - e.x, mk.y - e.y);
        if (d <= PLACE_RADIUS_TILES && d < bd) {
          bd = d;
          best = mk.ref!;
        }
      }
      if (best === null && slot.place) {
        const cur = slot.place;
        if (this.areas.places.some((mk) => mk.ref === cur && Math.hypot(mk.x - e.x, mk.y - e.y) <= PLACE_LEAVE_RADIUS_TILES)) best = cur;
      }
      if (best !== slot.place) {
        const first = slot.place === undefined;
        slot.place = best;
        if (!first || best !== null) this.gameEvent(slot, { t: 'arrive', placeId: best });
      }
      // região
      const reg = w.map.regions.find((r) => e.x >= r.x && e.x < r.x + r.w && e.y >= r.y && e.y < r.y + r.h)?.regionId;
      if (reg !== slot.region) {
        slot.region = reg;
        if (reg) this.gameEvent(slot, { t: 'arrive', regionId: reg });
      }
      // marcadores de interação (a fila do posto)
      for (const mk of this.areas.interacts) {
        const d = Math.hypot(mk.x - e.x, mk.y - e.y);
        const alvo = mk.params!['interagir'] as string;
        if (d <= INTERACT_MARKER_RADIUS_TILES) {
          if (slot.inside.has(mk.id)) {
            // Fase 3: quadro ou papel que o objetivo atual pede conta de novo, parado ali
            const last = slot.interactAt.get(mk.id) ?? w.tick;
            if (mk.kind !== 'quadro_missoes' || w.tick - last < msToTicks(INTERACT_REPEAT_MS)) continue;
            if (!currentObjectives(slot.rec).some((c) => c.objetivo.tipo === 'interagir' && c.objetivo.alvo === alvo)) continue;
          }
          slot.inside.add(mk.id);
          slot.interactAt.set(mk.id, w.tick);
          this.gameEvent(slot, { t: 'interact', alvo, acao: interactAction(slot.rec, alvo, mk) });
        } else if (d > INTERACT_MARKER_RADIUS_TILES + 1) slot.inside.delete(mk.id);
      }
      // "Seu Jacó caiu! Fique 3 s do lado dele": o Seu Jacó que acompanha cai para o jogador levantar
      if (slot.companionId !== undefined && wantsControl(slot.rec, 'reanimar')) {
        const c = w.entities.get(slot.companionId);
        const cd = msToTicks(JACO_DOWN_COOLDOWN_MS);
        if (c && !c.dead && c.downedUntil === undefined && (slot.jacoDownAt === undefined || w.tick - slot.jacoDownAt >= cd)) {
          c.x = e.x + 1;
          c.y = e.y;
          downEntity(w, c);
          slot.jacoDownAt = w.tick;
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Fase 4: economia, moradia e a cidade

  /** Espera as tarefas assíncronas das mensagens (visitar casa). Testes. */
  async idle(): Promise<void> {
    while (this.bgTasks.size > 0) await Promise.all(Array.from(this.bgTasks));
  }

  private bg(p: Promise<void>): void {
    const t = p
      .catch((err) => this.log(`[core] tarefa falhou: ${err instanceof Error ? err.stack : String(err)}`))
      .finally(() => {
        this.bgTasks.delete(t);
        this.flushNotify();
      });
    this.bgTasks.add(t);
  }

  /** A sala saiu do ar: a cidade esquece dela. */
  dispose(): void {
    this.city.unregister(this);
  }

  /** Ciclos da cidade, moradia inicial e pendências do mercado no registro que entra (só na margem). */
  private syncRecord(rec: PlayerRecord): { mudou: boolean; avisos: string[] } {
    if (!rec.criado || rec.stage !== 'margem') return { mudou: false, avisos: [] };
    const s = sincronizarComCidade(rec, this.city.state);
    const out = { mudou: s.mudou, avisos: [...s.avisos] };
    const p = receberPendencias(this.city.state.mercado, rec);
    if (p) {
      out.mudou = true;
      out.avisos.push(...p.avisos);
      this.city.save();
    }
    return out;
  }

  /** O registro mudou por uma regra de economia: entidade, gravação, perfil e carteira. */
  private changed(slot: Slot): void {
    this.push(slot);
    slot.dirty = true;
    slot.notify = true;
    this.send(slot.sid, GAME_MSG.carteira, carteiraView(slot.rec) satisfies S2C_Carteira);
  }

  private avisoInfo(sid: string | undefined, texto: string): void {
    this.send(sid, GAME_MSG.aviso, { texto, tipo: 'info' });
  }

  private slotOfPlayer(playerId: string): Slot | undefined {
    for (const s of this.slots.values()) if (!s.sandbox && s.rec.id === playerId) return s;
    return undefined;
  }

  // ---- CityCore ----

  cityRecords(): PlayerRecord[] {
    const out: PlayerRecord[] = [];
    for (const s of this.slots.values()) {
      if (s.sandbox || !s.rec.criado || s.rec.stage !== 'margem') continue;
      this.pull(s);
      out.push(s.rec);
    }
    return out;
  }

  afterCityTick(r: { mudaram: string[]; porJogador: Record<string, string[]> }): void {
    for (const s of this.slots.values()) {
      if (s.sandbox) continue;
      if (r.mudaram.includes(s.rec.id)) {
        this.changed(s);
        if (s.rec.home !== undefined) this.city.houseChanged(clone(s.rec));
      }
      for (const t of r.porJogador[s.rec.id] ?? []) this.avisoInfo(s.sid, t);
    }
    this.flushNotify();
  }

  receivePendingAll(): void {
    const mk = this.city.state.mercado;
    let any = false;
    for (const s of this.slots.values()) {
      if (s.sandbox || !mk.pendencias[s.rec.id]) continue;
      this.pull(s);
      const p = receberPendencias(mk, s.rec);
      if (!p) continue;
      any = true;
      this.changed(s);
      for (const t of p.avisos) this.avisoInfo(s.sid, t);
      this.city.logEvent('mercado_recebido', s.rec.id, { semente: p.semente, credito: p.credito, bens: p.bens }, this.mapId);
    }
    if (any) {
      this.city.save();
      this.flushNotify();
    }
  }

  liveRecordOf(playerId: string): PlayerRecord | undefined {
    const s = this.slotOfPlayer(playerId);
    if (!s) return undefined;
    this.pull(s);
    return s.rec;
  }

  houseChanged(owner: PlayerRecord): void {
    if (!this.house || owner.id !== this.house.ownerId) return;
    if (!this.slotOfPlayer(owner.id)) this.house.owner = clone(owner);
    this.broadcastHouse();
  }

  // ---- casa ----

  /** Dono da casa desta sala: o registro vivo, se ele estiver aqui, ou a última versão. */
  private ownerRecord(): PlayerRecord {
    const h = this.house!;
    return this.slotOfPlayer(h.ownerId)?.rec ?? h.owner;
  }

  /** Quem pode entrar nesta sala (fora de uma casa, todo mundo). */
  private canEnterHouse(r: PlayerRecord): boolean {
    if (!this.house) return true;
    if (r.id === this.house.ownerId) return true;
    if (this.city.takePass(r.id, this.house.ownerId)) return true;
    return visitarCasa(this.ownerRecord(), r).ok;
  }

  /** Manda a casa (casa_info) a todos desta sala: o dono vê tudo, a visita só lê. */
  private broadcastHouse(): void {
    if (!this.house) return;
    const owner = this.ownerRecord();
    for (const s of this.slots.values()) {
      if (!s.sid) continue;
      const v = casaView(owner, s.rec.id !== owner.id);
      if (v) this.send(s.sid, GAME_MSG.casaInfo, v satisfies S2C_CasaInfo);
    }
  }

  /** A casa do jogador mudou: a tela dele e a sala da casa (onde quer que ela esteja). */
  private houseUpdated(slot: Slot): void {
    const v = casaView(slot.rec, false);
    if (v) this.send(slot.sid, GAME_MSG.casaInfo, v satisfies S2C_CasaInfo);
    this.city.houseChanged(clone(slot.rec));
  }

  /** Vai para a sala da casa do dono ('casa:<id>'). */
  private enterHouse(slot: Slot, owner: PlayerRecord): void {
    this.city.rememberHouse(owner);
    if (owner.id !== slot.rec.id) this.city.grantPass(slot.rec.id, owner.id);
    this.city.logEvent('casa_entrada', slot.rec.id, { dono: owner.id }, this.mapId);
    this.leaveTo(slot, houseMapId(owner.id), undefined, 'registro');
  }

  private nearDoor(e: Entity, reach: number): boolean {
    return this.doorMarkers.some((mk) => Math.hypot(mk.x - e.x, mk.y - e.y) <= reach);
  }

  /** Porta da moradia por perto: leva o jogador para a casa dele. Devolve true quando ele saiu do mapa. */
  private checkDoors(slot: Slot, e: Entity): boolean {
    if (this.doorMarkers.length === 0) return false;
    if (this.world.tick - slot.bornTick < msToTicks(EXIT_GRACE_MS)) return false;
    for (const mk of this.doorMarkers) {
      const d = Math.hypot(mk.x - e.x, mk.y - e.y);
      if (d > DOOR_RADIUS_TILES) {
        if (d > DOOR_RADIUS_TILES + 1) slot.doors.delete(mk.id);
        continue;
      }
      if (slot.doors.has(mk.id)) continue;
      slot.doors.add(mk.id);
      this.pull(slot);
      const rec = slot.rec;
      if (!rec.home) {
        // SUGESTÃO: texto de quem chega na porta sem casa.
        this.avisoInfo(slot.sid, rec.side === 'direita' ? 'Sem cápsula, sem porta. Alugue uma no app.' : 'Você ainda não tem casa. A Assembleia tem uma lista para isso.');
        continue;
      }
      const side = sideOfMap(this.mapId);
      if (side && houseSide(rec) !== side) {
        this.avisoInfo(slot.sid, 'Sua casa fica na outra margem.');
        continue;
      }
      this.enterHouse(slot, rec);
      return true;
    }
    return false;
  }

  /** casa_visitar: confere a permissão do dono, mostra a casa e, perto da porta, entra. */
  private async onVisitHouse(slot: Slot, ownerId: string): Promise<void> {
    const acao = GAME_MSG.casaVisitar;
    const sid = slot.sid;
    const reply = (ok: boolean, erro?: string, texto?: string) =>
      this.send(sid, GAME_MSG.economiaResultado, { acao, ok, ...(erro ? { erro } : {}), ...(texto ? { texto } : {}) } satisfies S2C_EconomiaResultado);
    if (!ownerId) return reply(false, 'Diga de quem é a casa.');
    const owner = ownerId === slot.rec.id ? slot.rec : await this.city.findRecord(ownerId);
    if (this.slots.get(slot.token) !== slot || slot.sid !== sid) return; // saiu enquanto procurava
    if (!owner) return reply(false, 'Não achei esse morador.');
    this.pull(slot);
    const e = this.world.entities.get(slot.entityId);
    const os = this.slotOfPlayer(ownerId);
    const oe = os ? this.world.entities.get(os.entityId) : undefined;
    const mesmoGrupo = !!(e?.partyId && oe?.partyId && e.partyId === oe.partyId);
    const v = visitarCasa(owner, slot.rec, { mesmoGrupo });
    if (!v.ok) return reply(false, v.erro);
    if (v.casa) this.send(sid, GAME_MSG.casaInfo, v.casa satisfies S2C_CasaInfo);
    if (this.house?.ownerId === ownerId) return reply(true, undefined, 'Você já está nessa casa.');
    if (e && (this.house || this.nearDoor(e, DOOR_REACH_TILES))) {
      this.enterHouse(slot, owner);
      return reply(true, undefined, `Entrando na casa de ${owner.name}.`);
    }
    // SUGESTÃO: longe da porta, a visita só mostra a casa (o cliente pode levar até a porta).
    reply(true, undefined, 'Chegue na porta das moradias para entrar.');
  }

  // ---- lugares ----

  /** Erro de distância da loja de NPC, ou undefined quando está no balcão. */
  private shopReachError(e: Entity, shopId: string): string | undefined {
    const ms = this.world.map.markers.filter((m) => m.kind === 'loja' && m.ref === shopId);
    if (ms.length === 0) {
      // a loja do Delta não tem balcão no mapa: vale em todo o Delta. // SUGESTÃO
      if (shopId === 'loja_delta' && this.mapId === START_MAP) return undefined;
      return 'Essa loja não fica neste mapa.';
    }
    return ms.some((m) => Math.hypot(m.x - e.x, m.y - e.y) <= SHOP_REACH_TILES) ? undefined : 'Chegue no balcão da loja.';
  }

  /** Erro de distância de um lugar (feira, câmbio), ou undefined quando está lá. */
  private placeReachError(e: Entity, placeRef: string, erro: string): string | undefined {
    const ms = this.world.map.markers.filter((m) => m.kind === 'lugar' && m.ref === placeRef);
    return ms.some((m) => Math.hypot(m.x - e.x, m.y - e.y) <= MARKET_REACH_TILES) ? undefined : erro;
  }

  // ---- mensagens ----

  private onEconomy(slot: Slot, e: Entity, type: string, m: Record<string, unknown>): void {
    const sid = slot.sid!;
    const rec = slot.rec;
    const city = this.city;
    const mk = city.state.mercado;
    const cambio = city.state.cambio;
    const med = city.state.medidores;
    const now = city.now();
    const res = (ok: boolean, erro?: string, texto?: string, extra: Partial<S2C_EconomiaResultado> = {}) =>
      this.send(sid, GAME_MSG.economiaResultado, { acao: type, ok, ...(erro ? { erro } : {}), ...(texto ? { texto } : {}), ...extra } satisfies S2C_EconomiaResultado);
    const fail = (erro: string) => res(false, erro);
    const log = (tipo: string, dados: Record<string, unknown>) => {
      city.logEvent(tipo, rec.id, dados, this.mapId);
      // Fase 5: compra e venda (loja, feira, app, câmbio) somam influência: 1 a cada 100 de moeda
      const valor = COMMERCE_VALUE[tipo]?.(dados);
      if (valor !== undefined && valor > 0) this.influence(rec.side, regionAt(this.world, e.x, e.y), 'comercio', valor);
    };
    const market = (mercado: MercadoId) => this.send(sid, GAME_MSG.mercadoInfo, mercadoView(mk, mercado, rec, now) satisfies S2C_MercadoInfo);
    const cambioInfo = (cot?: { de: Moeda; q: number }) => {
      const info: S2C_CambioInfo = { taxa: exchangeRate(cambio, med), usadoCiclo: economiaOf(rec).cambioCiclo, ...(cot ? { cotacao: cotarTroca(cambio, cot.de, cot.q, med) } : {}) };
      this.send(sid, GAME_MSG.cambioInfo, info);
    };
    const moeda = moedaOf(m['moeda']);
    const FEIRA = 'feira_da_esquerda';
    const CAMBIO = 'cambio_da_ponte';

    switch (type) {
      case GAME_MSG.carteiraPedir:
        this.send(sid, GAME_MSG.carteira, carteiraView(rec) satisfies S2C_Carteira);
        return;
      case GAME_MSG.dividaPagar: {
        const p = pagarDivida(rec);
        if (!p.ok) return fail(p.erro);
        this.changed(slot);
        log('divida_paga', { pago: p.pago, resta: p.resta });
        return res(true, undefined, `Pagou ${p.pago} Créditos de dívida. Resta ${p.resta}.`);
      }
      // ---- loja de NPC ----
      case GAME_MSG.lojaComprar:
      case GAME_MSG.lojaVender: {
        const loja = strOf(m['loja']);
        const item = strOf(m['item']);
        const far = this.shopReachError(e, loja);
        if (far) return fail(far);
        const compra = type === GAME_MSG.lojaComprar;
        const c = compra
          ? comprarNaLoja(rec, loja, item, { mercado: mk, ctx: city.precoCtx(), ...(moeda ? { moeda } : {}) })
          : venderNaLoja(rec, loja, item, { mercado: mk, ...(moeda ? { moeda } : {}) });
        if (!c.ok) return fail(c.erro);
        this.changed(slot);
        city.save();
        log(compra ? 'loja_compra' : 'loja_venda', { loja, item, moeda: c.moeda, valor: c.valor });
        return res(true, undefined, c.resultado.avisos.join(' '));
      }
      // ---- feira e app ----
      case GAME_MSG.mercadoListar:
        market(m['mercado'] === 'app' ? 'app' : 'feira');
        return;
      case GAME_MSG.feiraAnunciar: {
        const far = this.placeReachError(e, FEIRA, 'Anúncio da feira é na feira.');
        if (far) return fail(far);
        const bem = bemOf(m['bem']);
        if (!bem) return fail('Bem inválido.');
        let trocaPor: Bem[] | undefined;
        if (Array.isArray(m['trocaPor']) && m['trocaPor'].length > 0) {
          const t = m['trocaPor'].slice(0, 8).map(bemOf);
          if (t.some((x) => x === null)) return fail('Troca inválida.');
          trocaPor = t as Bem[];
        }
        const preco = isNum(m['preco']) ? m['preco'] : undefined;
        const a = anunciarFeira(mk, rec, { bem, ...(preco !== undefined ? { preco } : {}), ...(trocaPor ? { trocaPor } : {}) }, now);
        if (!a.ok) return fail(a.erro);
        this.changed(slot);
        city.save();
        log('feira_anuncio', { anuncio: a.anuncio?.id, bem, preco: a.anuncio?.preco ?? null, trocaPor: trocaPor ?? null });
        market('feira');
        return res(true, undefined, `${nomeDoBem(bem)} na barraca.`);
      }
      case GAME_MSG.feiraComprar: {
        const far = this.placeReachError(e, FEIRA, 'Compra da feira é na feira.');
        if (far) return fail(far);
        const id = strOf(m['anuncio']);
        const c = comprarFeira(mk, rec, id, now);
        if (!c.ok) return fail(c.erro);
        this.changed(slot);
        city.save();
        log('feira_compra', { anuncio: id, vendedor: c.anuncio?.vendedor, bem: c.anuncio?.bem, preco: c.anuncio?.preco ?? null, troca: c.anuncio?.trocaPor ?? null });
        city.deliverPending();
        market('feira');
        const nome = c.anuncio ? nomeDoBem(c.anuncio.bem) : 'o item';
        if (c.entrega) {
          const s = Math.max(0, Math.ceil((c.entrega.prontoEm - now) / 1000));
          return res(true, undefined, `Comprou ${nome}. Lugar ${c.entrega.posicao} na fila: fica pronto em ${s} s.`, { entrega: c.entrega });
        }
        return res(true, undefined, `Comprou ${nome} na feira.`);
      }
      case GAME_MSG.feiraRetirar: {
        const far = this.placeReachError(e, FEIRA, 'A retirada é na feira.');
        if (far) return fail(far);
        const r = retirarEntregas(mk, rec, now);
        market('feira');
        if (r.bens.length === 0) return res(true, undefined, r.aguardando.length > 0 ? `Ainda na fila: ${r.aguardando.length}.` : 'Nada para retirar.');
        this.changed(slot);
        city.save();
        log('feira_retirada', { bens: r.bens });
        return res(true, undefined, `Retirou: ${r.bens.map(nomeDoBem).join(', ')}.`);
      }
      case GAME_MSG.appAnunciar: {
        const bem = bemOf(m['bem']);
        if (!bem) return fail('Bem inválido.');
        const a = anunciarApp(mk, rec, { bem, preco: isNum(m['preco']) ? m['preco'] : 0 }, now);
        if (!a.ok) return fail(a.erro);
        this.changed(slot);
        city.save();
        log('app_anuncio', { anuncio: a.anuncio?.id, bem, preco: a.anuncio?.preco ?? null, taxaPct: a.anuncio?.taxaPct });
        market('app');
        return res(true, undefined, `${nomeDoBem(bem)} anunciado no app.`);
      }
      case GAME_MSG.appComprar: {
        const id = strOf(m['anuncio']);
        const c = comprarApp(mk, rec, id, now);
        if (!c.ok) return fail(c.erro);
        this.changed(slot);
        city.save();
        log('app_compra', { anuncio: id, vendedor: c.anuncio?.vendedor, bem: c.anuncio?.bem, preco: c.anuncio?.preco ?? null, taxa: c.taxa });
        city.deliverPending();
        market('app');
        return res(true, undefined, `Comprou ${c.anuncio ? nomeDoBem(c.anuncio.bem) : 'o item'} por ${c.anuncio?.preco ?? 0} Cr. Avalie o vendedor!`);
      }
      case GAME_MSG.mercadoCancelar: {
        const id = strOf(m['anuncio']);
        const qual = mk.anuncios.find((a) => a.id === id)?.mercado ?? 'feira';
        const c = cancelarAnuncio(mk, rec, id);
        if (!c.ok) return fail(c.erro);
        this.changed(slot);
        city.save();
        log('mercado_cancelado', { anuncio: id });
        market(qual);
        return res(true, undefined, 'Anúncio cancelado. O item voltou.');
      }
      case GAME_MSG.mercadoReceber: {
        const p = receberPendencias(mk, rec);
        if (!p) return res(true, undefined, 'Nada a receber.');
        this.changed(slot);
        city.save();
        log('mercado_recebido', { semente: p.semente, credito: p.credito, bens: p.bens });
        return res(true, undefined, p.avisos.join(' ') || 'Recebido.');
      }
      // ---- câmbio ----
      case GAME_MSG.cambioCotar: {
        const de = moedaOf(m['de']);
        const q = isNum(m['quantidade']) ? m['quantidade'] : undefined;
        cambioInfo(de && q !== undefined ? { de, q } : undefined);
        return;
      }
      case GAME_MSG.cambioTrocar: {
        const far = this.placeReachError(e, CAMBIO, 'O câmbio é na ponte.');
        if (far) return fail(far);
        const de = moedaOf(m['de']);
        if (!de) return fail('Moeda inválida.');
        const t = trocarMoeda(cambio, rec, de, isNum(m['quantidade']) ? m['quantidade'] : 0, med);
        if (!t.ok) return fail(t.erro);
        this.changed(slot);
        city.save();
        log('cambio_troca', { ...(t.troca ?? {}) });
        cambioInfo();
        const tr = t.troca!;
        return res(true, undefined, `Trocou ${tr.quantidade} ${nomeMoeda(tr.de)} por ${tr.recebe} ${nomeMoeda(tr.para)}.`);
      }
      // ---- casa ----
      case GAME_MSG.casaVer: {
        const v = casaView(rec, false);
        if (!v) return fail('Você ainda não tem casa.');
        this.send(sid, GAME_MSG.casaInfo, v satisfies S2C_CasaInfo);
        return;
      }
      case GAME_MSG.casaVisitar:
        this.bg(this.onVisitHouse(slot, strOf(m['playerId'])));
        return;
      case GAME_MSG.casaComprarMovel: {
        const movel = strOf(m['movel']);
        const c = comprarMovel(rec, movel, moeda);
        if (!c.ok) return fail(c.erro);
        let texto = `Comprou ${nomeDoBem({ tipo: 'movel', id: movel })}.`;
        const col = m['colocar'];
        if (isObj(col) && isInt(col['x']) && isInt(col['y'])) {
          const p = colocarMovel(rec, movel, col['x'], col['y'], rotOf(col['rot']) ?? 0);
          texto += p.ok ? ' Já está na casa.' : ` Ficou guardado: ${p.erro}`;
        }
        this.changed(slot);
        log('movel_compra', { movel, moeda: c.moeda, valor: c.valor });
        this.houseUpdated(slot);
        return res(true, undefined, texto);
      }
      case GAME_MSG.casaColocar:
      case GAME_MSG.casaMover:
      case GAME_MSG.casaGirar:
      case GAME_MSG.casaTirar: {
        const x = m['x'];
        const y = m['y'];
        const uid = m['uid'];
        let c: { ok: true } | { ok: false; erro: string };
        if (type === GAME_MSG.casaColocar) c = isInt(x) && isInt(y) ? colocarMovel(rec, strOf(m['movel']), x, y, rotOf(m['rot']) ?? 0) : { ok: false, erro: 'Posição inválida.' };
        else if (!isInt(uid)) c = { ok: false, erro: 'Móvel não encontrado.' };
        else if (type === GAME_MSG.casaMover) {
          const rot = rotOf(m['rot']);
          c = !isInt(x) || !isInt(y) ? { ok: false, erro: 'Posição inválida.' } : rot !== undefined ? moverMovel(rec, uid, x, y, rot) : moverMovel(rec, uid, x, y);
        } else if (type === GAME_MSG.casaGirar) c = girarMovel(rec, uid);
        else c = tirarMovel(rec, uid);
        if (!c.ok) return fail(c.erro);
        this.changed(slot);
        this.houseUpdated(slot);
        return res(true);
      }
      case GAME_MSG.casaVisitas: {
        const erros: string[] = [];
        const perm = m['permissao'];
        if (typeof perm === 'string') {
          const d = definirVisitas(rec, perm as PermissaoVisita);
          if (!d.ok) erros.push(d.erro);
        }
        if (typeof m['convidar'] === 'string') {
          const d = convidar(rec, strOf(m['convidar']), true);
          if (!d.ok) erros.push(d.erro);
        }
        if (typeof m['desconvidar'] === 'string') {
          const d = convidar(rec, strOf(m['desconvidar']), false);
          if (!d.ok) erros.push(d.erro);
        }
        if (erros.length > 0) return fail(erros.join(' '));
        this.changed(slot);
        this.houseUpdated(slot);
        return res(true, undefined, 'Visitas atualizadas.');
      }
      case GAME_MSG.casaAlugar: {
        const a = alugarCapsula(rec, strOf(m['tipo']) || 'capsula', med.precoDeVidaDir);
        if (!a.ok) return fail(a.erro);
        this.changed(slot);
        log('aluguel_inicio', { tipo: rec.home?.tipo, valor: rec.home?.aluguelUltimo });
        this.houseUpdated(slot);
        return res(true, undefined, (a.avisos ?? []).join(' '));
      }
      case GAME_MSG.casaListaEspera: {
        const l = entrarNaListaDeEspera(rec);
        if (!l.ok) return fail(l.erro);
        this.changed(slot);
        this.houseUpdated(slot);
        return res(true, undefined, `Você entrou na lista da Assembleia: ${l.ciclos} ciclos.`);
      }
      case GAME_MSG.casaAvancarFila: {
        if (!this.dev) return fail('Só no modo de desenvolvimento do servidor (PQP_DEV=1).');
        const n = m['ciclos'];
        const avs = avancarListaDeEspera(rec, isInt(n) && n > 0 ? n : Number.POSITIVE_INFINITY);
        this.changed(slot);
        this.houseUpdated(slot);
        return res(true, undefined, avs.join(' ') || 'Você não está na lista.');
      }
      default:
        return;
    }
  }

  // -------------------------------------------------------------------------
  // Fase 5: itens, Doutrina, plantão, masmorra, encontros e facção

  private onFase5(slot: Slot, e: Entity, type: string, m: Record<string, unknown>): void {
    const sid = slot.sid!;
    const rec = slot.rec;
    const now = this.city.now();
    switch (type) {
      // ---- itens ----
      case GAME_MSG.equipar:
      case GAME_MSG.desequipar:
      case GAME_MSG.benzer:
      case GAME_MSG.calibrar:
      case GAME_MSG.filtroRaridade: {
        let c: { ok: true } | { ok: false; erro: string };
        let texto: string | undefined;
        if (type === GAME_MSG.equipar) c = equipar(rec, strOf((m as unknown as C2S_Equipar).itemId));
        else if (type === GAME_MSG.desequipar) c = desequipar(rec, strOf((m as unknown as C2S_Desequipar).slot));
        else if (type === GAME_MSG.filtroRaridade) {
          const f = m as unknown as C2S_FiltroRaridade;
          c = setFiltroRaridade(rec, strOf(f.raridade), typeof f.vendaAutomatica === 'boolean' ? f.vendaAutomatica : undefined);
        } else {
          const q = m as unknown as C2S_Melhorar;
          const onde = typeof q.onde === 'string' ? strOf(q.onde) : undefined;
          if (type === GAME_MSG.benzer) {
            const b = benzer(rec, strOf(q.itemId), now, onde);
            c = b;
            if (b.ok) texto = b.prontoEm !== undefined && b.prontoEm > now ? `A benzedeira pegou a peça. Fica pronta em ${Math.ceil((b.prontoEm - now) / 1000)} s.` : `Benzido: nível ${b.nivel}.`;
          } else {
            const k = calibrar(rec, strOf(q.itemId), onde);
            c = k;
            if (k.ok) texto = `Calibrado: nível ${k.nivel} (${k.pago} Cr).`;
          }
        }
        if (!c.ok) this.aviso(sid, c.erro);
        else {
          this.afterItems(slot, e);
          if (texto) this.avisoInfo(sid, texto);
        }
        this.send(sid, GAME_MSG.itensInfo, itensView(rec) satisfies S2C_ItensInfo);
        return;
      }
      case GAME_MSG.itensPedir:
        if (concluirBenzimentos(rec, now).length > 0) this.afterItems(slot, e);
        this.send(sid, GAME_MSG.itensInfo, itensView(rec) satisfies S2C_ItensInfo);
        return;
      // ---- Doutrina ----
      case GAME_MSG.doutrinaPedir:
        this.send(sid, GAME_MSG.doutrinaInfo, this.doctrineInfo(e));
        return;
      case GAME_MSG.doutrinaDefinir: {
        const d = definirDoutrina(rec, m['cards'], e.loadout ? { loadout: e.loadout } : {});
        if (!d.ok) this.aviso(sid, d.erro);
        else {
          e.doctrine = clone(rec.doctrine);
          slot.dirty = true;
          this.avisoInfo(sid, 'Doutrina gravada.');
        }
        this.send(sid, GAME_MSG.doutrinaInfo, this.doctrineInfo(e));
        return;
      }
      // ---- plantão ----
      case GAME_MSG.plantaoPedir:
        this.send(sid, GAME_MSG.plantaoInfo, this.dutyInfo(slot));
        return;
      case GAME_MSG.plantaoDefinir: {
        const on = (m as unknown as C2S_PlantaoDefinir).on === true;
        if (on && (rec.stage !== 'margem' || !rec.side)) this.aviso(sid, 'O plantão é no QG da margem: escolha a margem primeiro.');
        else {
          rec.on_duty = on;
          slot.dirty = true;
          slot.notify = true;
          // SUGESTÃO: texto
          this.avisoInfo(sid, on ? 'Quando você sair, seu personagem fica de plantão no QG.' : 'Plantão desligado.');
        }
        this.send(sid, GAME_MSG.plantaoInfo, this.dutyInfo(slot));
        return;
      }
      case GAME_MSG.plantaoLevar:
        this.takeDuty(slot, e, strOf((m as unknown as C2S_Plantonista).plantonistaId));
        this.send(sid, GAME_MSG.plantaoInfo, this.dutyInfo(slot));
        return;
      case GAME_MSG.plantaoDispensar: {
        const id = strOf((m as unknown as C2S_Plantonista).plantonistaId);
        const a = this.city.duty.ofTaker(rec.id).find((x) => x.plantonistaId === id);
        if (!a) this.aviso(sid, 'Esse plantonista não está com você.');
        else {
          this.releaseDuty(a);
          this.avisoInfo(sid, 'O plantonista voltou para o QG.');
        }
        this.send(sid, GAME_MSG.plantaoInfo, this.dutyInfo(slot));
        return;
      }
      // ---- masmorra ----
      case GAME_MSG.masmorraEntrar:
        this.enterDungeon(slot, e, m as C2S_MasmorraEntrar);
        return;
      case GAME_MSG.masmorraSair:
        if (!this.dungeon) {
          this.aviso(sid, 'Você não está numa masmorra.');
          return;
        }
        this.exitDungeon(slot);
        return;
      case GAME_MSG.masmorraEscolha: {
        const d = this.dungeon;
        const q = m as unknown as C2S_MasmorraEscolha;
        if (!d || !isInt(q.sala)) {
          this.aviso(sid, 'Não há escolha aqui.');
          return;
        }
        const live = this.liveSlots();
        const c = chooseDungeonEvent(this.world, d.state, q.sala, strOf(q.opcao), Math.max(1, live.length));
        if (!c.ok) {
          this.aviso(sid, c.erro);
          return;
        }
        bankRewards(d.run, c.recompensas);
        for (const s of live) {
          for (const f of c.flags) if (!s.rec.story_flags.includes(f)) s.rec.story_flags.push(f);
          if (c.flags.length > 0) s.dirty = true;
        }
        this.broadcastDungeonInfo();
        return;
      }
      // ---- facção ----
      case GAME_MSG.faccaoPedir:
        this.send(sid, GAME_MSG.faccaoInfo, this.city.faction.info(now) satisfies S2C_FaccaoInfo);
        return;
      default:
        return;
    }
  }

  /** O equipamento ou o filtro mudou: entidade (mochila, visual, atributos, filtro), gravação e perfil. */
  private afterItems(slot: Slot, e: Entity): void {
    this.push(slot);
    applyEquipment(e, simEquipOf(slot.rec));
    e.lootFilter = filtroRaridadeOf(slot.rec);
    e.autoSell = vendaAutomaticaOf(slot.rec);
    slot.dirty = true;
    slot.notify = true;
  }

  private doctrineInfo(e: Entity): S2C_DoutrinaInfo {
    return { cards: clone(e.doctrine ?? []), max: bal().combate.doutrinaCartasMax };
  }

  // ---- plantão ----

  private dutyInfo(slot: Slot): S2C_PlantaoInfo {
    const rec = slot.rec;
    const duty = this.city.duty;
    const view = (r: PlayerRecord): PlantonistaView => ({ id: r.id, nome: r.name, nivel: r.level, classe: r.class, ala: r.archetype, cartas: Array.isArray(r.doctrine) ? r.doctrine.length : 0 });
    const levados = duty
      .ofTaker(rec.id)
      .map((a) => duty.recordOf(a.plantonistaId))
      .filter((r): r is PlayerRecord => r !== undefined)
      .map(view);
    return {
      qg: rec.side ? qgDaMargem(rec.side) : null,
      disponiveis: rec.side ? duty.list(rec.side).filter((r) => r.id !== rec.id).map(view) : [],
      levados,
      grupoMax: bal().combate.grupoMax,
      emPlantao: rec.on_duty === true,
    };
  }

  /** Leva um plantonista: nasce ao lado como aliado com a Doutrina dele; na masmorra, entra na run. */
  private takeDuty(slot: Slot, e: Entity, plantonistaId: string): void {
    const sid = slot.sid!;
    const duty = this.city.duty;
    const run = this.dungeon?.run;
    const grupoAtual = run ? run.grupo.filter((x) => !x.saiu).length : 1 + duty.ofTaker(slot.rec.id).length;
    const t = duty.take(slot.rec, plantonistaId, { destino: run ? 'masmorra' : 'mapa', grupoAtual, ...(run ? { runId: run.id } : {}) });
    if (!t.ok) {
      this.aviso(sid, t.erro);
      return;
    }
    if (run) {
      const j = joinRun(run, { playerId: t.rec.id, papel: 'plantonista', nome: t.rec.name });
      if (!j.ok) {
        duty.end(t.assignment);
        this.aviso(sid, j.erro);
        return;
      }
    }
    const p = this.spawnDuty(slot, e, t.assignment);
    if (!p) {
      duty.end(t.assignment);
      this.aviso(sid, 'O plantonista não conseguiu chegar.');
      return;
    }
    this.avisoInfo(sid, `${t.rec.name} saiu do plantão e veio com você.`);
    if (run) this.broadcastDungeonInfo();
  }

  /**
   * Plantonistas depois do step: o que a coleta automática pegou para ele (loot_pick) e o que ficou no
   * chão no nome dele vão para o relatório (tickPlantao soma o XP e recolhe o resto).
   */
  private tickDuty(events: CombatEvent[], before: Map<number, Entity>): void {
    if (this.dutyEnts.size === 0) return;
    const w = this.world;
    const byEnt = new Map<number, DutyAssignment>();
    for (const d of this.dutyEnts.values()) byEnt.set(d.entityId, d.a);
    for (const ev of events) {
      if (ev.t !== 'loot_pick') continue;
      const a = byEnt.get(ev.by);
      const l = a ? (w.entities.get(ev.id) ?? before.get(ev.id))?.loot : undefined;
      if (!a || !l) continue;
      const pe = w.entities.get(ev.by);
      if (l.itemId) {
        a.ganhos.itens.push(l.itemId);
        const i = pe?.inventory?.lastIndexOf(l.itemId) ?? -1;
        if (i >= 0) pe!.inventory!.splice(i, 1);
      }
      if (l.currency) {
        a.ganhos.semente += l.currency.semente ?? 0;
        a.ganhos.credito += l.currency.credito ?? 0;
      }
    }
    for (const d of this.dutyEnts.values()) tickPlantao(w, d.a);
  }

  /** Devolve o plantonista ao QG: o saque dele fica no relatório; na masmorra, a parte da run também. */
  private releaseDuty(a: DutyAssignment): void {
    const run = this.dungeon?.run;
    if (this.dutyEnts.has(a.id)) tickPlantao(this.world, a);
    if (run && run.grupo.some((x) => x.playerId === a.plantonistaId && !x.saiu)) {
      this.city.duty.bankRun(a.plantonistaId, run);
      leaveRun(run, a.plantonistaId, this.city.now());
    }
    this.dropDuty(a.id);
    this.city.duty.end(a);
  }

  // ---- masmorra ----

  private liveSlots(): Slot[] {
    return Array.from(this.slots.values()).filter((s) => !s.sandbox);
  }

  /** Andar da masmorra: só quem é jogador ativo da run. */
  private canEnterDungeon(r: PlayerRecord): boolean {
    const run = this.dungeon?.run;
    if (!run) return true;
    return run.status === 'ativa' && run.grupo.some((m) => m.playerId === r.id && m.papel === 'jogador' && !m.saiu);
  }

  /** Tela do andar (S2C_MasmorraInfo) para um jogador. */
  private dungeonInfo(playerId: string): S2C_MasmorraInfo {
    const d = this.dungeon!;
    const { run, state: st } = d;
    const lay = st.floor.layout;
    const evRoom = st.rooms.find((r) => r.esperandoEscolha);
    const evOpts = evRoom ? (st.floor.templates[evRoom.idx]?.evento?.opcoes ?? []) : [];
    const boss = st.floor.boss;
    return {
      ativa: run.status === 'ativa',
      runId: run.id,
      dungeonId: run.dungeonId,
      seed: run.seed,
      andar: st.floor.andar,
      nome: st.floor.name,
      mapId: this.mapId,
      escadaAberta: st.escadaAberta,
      escada: { x: lay.stairs.x, y: lay.stairs.y },
      saida: { x: lay.exit.x, y: lay.exit.y },
      ...(boss ? { chefe: { inimigo: boss, nome: getData().enemiesById.get(boss)?.name ?? boss, vencido: st.bossVencido } } : {}),
      salas: st.rooms.map((rs) => {
        const r = lay.rooms[rs.idx]!;
        return { idx: rs.idx, tipo: r.tipo, nome: r.name, ativa: rs.ativa, limpa: rs.limpa };
      }),
      ...(evRoom ? { evento: { sala: evRoom.idx, opcoes: evOpts.map((o) => ({ id: o.id, texto: o.texto })) } } : {}),
      grupo: run.grupo.filter((x) => !x.saiu).map((x) => ({ nome: x.nome ?? x.playerId, papel: x.papel })),
      guardadas: (run.recompensas[playerId] ?? []).length,
      ...(run.status !== 'ativa' ? { fim: run.status } : {}),
      andarMaisFundo: run.andarMaisFundo,
    };
  }

  private broadcastDungeonInfo(): void {
    if (!this.dungeon) return;
    for (const s of this.liveSlots()) if (s.sid) this.send(s.sid, GAME_MSG.masmorraInfo, this.dungeonInfo(s.rec.id));
  }

  /**
   * masmorra_entrar perto da entrada: o grupo é quem entrou, os jogadores por perto (até 4) e os
   * plantonistas levados por eles; abre a run e manda todos para a sala do primeiro andar.
   */
  private enterDungeon(slot: Slot, e: Entity, msg: C2S_MasmorraEntrar): void {
    const sid = slot.sid!;
    if (this.dungeon) return this.aviso(sid, 'Você já está nas Galerias.');
    const mk = this.world.map.markers.find((x) => x.kind === 'masmorra' && Math.hypot(x.x - e.x, x.y - e.y) <= DUNGEON_ENTRY_REACH_TILES);
    if (!mk) return this.aviso(sid, 'Chegue na entrada das Galerias.');
    if (slot.rec.stage !== 'margem' || !slot.rec.side) return this.aviso(sid, 'As Galerias são para quem já atravessou.');
    const dungeonId = typeof msg?.dungeonId === 'string' && msg.dungeonId === mk.ref ? msg.dungeonId : (mk.ref ?? undefined);
    const max = bal().combate.grupoMax;
    const players: Slot[] = [slot];
    for (const s of this.liveSlots()) {
      if (players.length >= max) break;
      if (s === slot || !s.sid || s.offlineSince !== undefined || s.rec.stage !== 'margem') continue;
      const o = this.world.entities.get(s.entityId);
      if (!o || o.dead || Math.hypot(o.x - e.x, o.y - e.y) > DUNGEON_GROUP_RADIUS_TILES) continue;
      if (this.city.dungeons.runOf(s.rec.id)) continue;
      players.push(s);
    }
    const grupo: DungeonMember[] = players.map((s) => ({ playerId: s.rec.id, papel: 'jogador', nome: s.rec.name }));
    const sobra: DutyAssignment[] = [];
    for (const s of players) {
      for (const a of this.city.duty.ofTaker(s.rec.id)) {
        const r = this.city.duty.recordOf(a.plantonistaId);
        if (grupo.length < max && r) grupo.push({ playerId: r.id, papel: 'plantonista', nome: r.name });
        else sobra.push(a);
      }
    }
    const atalho = msg?.atalho === true ? shortcutOf(slot.rec, dungeonId) : 0;
    const c = this.city.dungeons.create(grupo, { ...(atalho ? { atalho } : {}), ...(dungeonId ? { dungeonId } : {}) });
    if (!c.ok) return this.aviso(sid, c.erro);
    const run = c.run;
    for (const a of sobra) {
      this.releaseDuty(a);
      this.avisoInfo(this.slotOfPlayer(a.levadoPor)?.sid, 'Grupo cheio: um plantonista voltou para o QG.');
    }
    for (const s of players) {
      for (const a of this.city.duty.ofTaker(s.rec.id)) {
        a.destino = 'masmorra';
        a.runId = run.id;
      }
    }
    this.city.duty.save();
    this.city.logEvent('masmorra_entrada', slot.rec.id, { run: run.id, andar: run.andar, grupo: grupo.map((g) => g.playerId) }, this.mapId);
    const target = dungeonMapId(run.id, run.andar);
    for (const s of players) {
      const info: S2C_MasmorraInfo = { ativa: true, runId: run.id, dungeonId: run.dungeonId, seed: run.seed, andar: run.andar, mapId: target, grupo: grupo.map((g) => ({ nome: g.nome ?? g.playerId, papel: g.papel })), guardadas: 0 };
      this.send(s.sid, GAME_MSG.masmorraInfo, info);
      this.pull(s);
      this.leaveTo(s, target, undefined, 'registro');
    }
  }

  /** Entrega ao registro o que a run guardou para o jogador (e para os plantonistas dele) e sai da run. */
  private claimDungeon(slot: Slot): void {
    const d = this.dungeon;
    if (!d) return;
    const run = d.run;
    const now = this.city.now();
    for (const a of this.city.duty.ofTaker(slot.rec.id)) {
      if (!run.grupo.some((x) => x.playerId === a.plantonistaId && !x.saiu)) continue;
      this.city.duty.bankRun(a.plantonistaId, run);
      leaveRun(run, a.plantonistaId, now);
    }
    const e = this.world.entities.get(slot.entityId);
    const r = claimRunRewards(slot.rec, run);
    leaveRun(run, slot.rec.id, now);
    // itens de tabela: entram direto na mochila (o jogador sai do andar já)
    if (e) {
      for (const x of r.itensParaRolar) {
        const before = new Set(this.world.entities.keys());
        const ids = rollRewardItems(this.world, e, x.tabela, x.quantidade);
        for (const id of Array.from(this.world.entities.keys())) if (!before.has(id)) this.world.entities.delete(id);
        slot.rec.inventory.push(...ids);
        r.itens.push(...ids);
      }
      r.itensParaRolar = [];
    }
    r.mudou = true;
    this.applyResult(slot, r);
    this.city.logEvent('masmorra_saida', slot.rec.id, { run: run.id, andar: run.andar, maisFundo: run.andarMaisFundo, status: run.status }, this.mapId);
  }

  /** Sai das Galerias para a Usina da Ponte com as recompensas guardadas. */
  private exitDungeon(slot: Slot, aviso?: string): void {
    this.pull(slot);
    this.claimDungeon(slot);
    this.avisoInfo(slot.sid, aviso ?? 'Você saiu das Galerias com o que guardou.');
    this.leaveTo(slot, DUNGEON_EXIT.mapId, DUNGEON_EXIT.spawn, 'registro');
    const run = this.dungeon!.run;
    if (run.status !== 'ativa' && this.liveSlots().length === 0) this.city.dungeons.close(run.id);
  }

  /** Um tick do andar: salas, ondas, chefe, tesouro, escada, saída e grupo caído. */
  private tickDungeon(): void {
    const d = this.dungeon!;
    const run = d.run;
    const w = this.world;
    if (run.status !== 'ativa') return;
    const live = this.liveSlots();
    const evs = tickDungeonFloor(w, d.state, { players: Math.max(1, live.length) });
    for (const ev of evs) {
      if (ev.t === 'tesouro') bankRewards(run, ev.recompensas);
      const texto = textoDoAndar(ev);
      if (texto) for (const s of live) this.avisoInfo(s.sid, texto);
    }
    if (evs.length > 0) this.broadcastDungeonInfo();
    if (live.length === 0) return;
    if (partyWiped(w)) {
      failRun(run, this.city.now());
      // SUGESTÃO: texto
      for (const s of live) this.exitDungeon(s, 'O grupo caiu. As Galerias cospem vocês de volta na Usina, com o que já estava guardado.');
      return;
    }
    if (atStairs(w, d.state) && live.some((s) => w.tick - s.bornTick >= msToTicks(EXIT_GRACE_MS))) {
      const andar = run.andar;
      const primeiraVez = isBossFloor(andar) && live.some((s) => firstBossClear(s.rec, andar, run.dungeonId));
      advanceFloor(run, { primeiraVez });
      const target = dungeonMapId(run.id, run.andar);
      for (const s of live) {
        this.pull(s);
        this.avisoInfo(s.sid, `Descendo para o ${run.andar}º andar.`);
        this.leaveTo(s, target, undefined, 'registro');
      }
      return;
    }
    const ex = d.state.floor.layout.exit;
    for (const s of live) {
      const e = w.entities.get(s.entityId);
      if (!e || e.dead) continue;
      const on = Math.hypot(e.x - ex.x, e.y - ex.y) <= DUNGEON_TUNING.escadaRaio;
      if (on && !s.onDungeonExit && w.tick - s.bornTick >= msToTicks(EXIT_GRACE_MS)) this.exitDungeon(s);
      else s.onDungeonExit = on;
    }
  }

  // ---- encontros ----

  /** Encontros com IA da janela de horário: nascem os da janela nova, os da velha saem. */
  private tickEncountersNow(): void {
    const w = this.world;
    tickEncounters(w);
    if (this.encWindow >= 0 && w.tick % ENCOUNTER_CHECK_TICKS !== 0) return;
    const now = this.city.now();
    const win = encounterWindow(now);
    if (win === this.encWindow) return;
    this.encWindow = win;
    for (const id of this.encEnts) w.entities.delete(id);
    this.encEnts = [];
    for (const spec of rollMapEncounters(w.map, now, DEFAULT_WORLD_SEED)) {
      try {
        for (const x of spawnEncounter(w, spec)) this.encEnts.push(x.id);
      } catch (err) {
        this.log(`[core] encontro ${spec.id} falhou: ${String(err)}`);
      }
    }
  }

  /** Ids das entidades dos encontros desta janela (testes). */
  encounterEntities(): number[] {
    return [...this.encEnts];
  }

  // ---- facção ----

  /** Junta a influência deste tick (manda no fim do tick ou da mensagem). */
  private influence(lado: string | null | undefined, regiao: string | undefined, fonte: EventoInfluencia['fonte'], qtd: number): void {
    if (this.sandbox || this.house || qtd <= 0 || !regiao || (lado !== 'esquerda' && lado !== 'direita')) return;
    if (!this.city.faction.state.regioes[regiao]) return;
    const k = `${lado}|${regiao}|${fonte}`;
    const cur = this.infPending.get(k);
    if (cur) cur.qtd = (cur.qtd ?? 0) + qtd;
    else this.infPending.set(k, { fonte, lado, regiao, qtd });
  }

  private flushInfluence(): void {
    if (this.infPending.size === 0) return;
    const list = Array.from(this.infPending.values());
    this.infPending.clear();
    for (const ev of list) this.city.faction.somar(ev);
  }

  /** CityCore: avisos novos da IA de facção para quem está nesta sala, e os medidores no combate. */
  factionChanged(evs: WorldEvent[]): void {
    if (this.sandbox) return;
    this.world.regionState = this.city.faction.regionState();
    for (const s of this.slots.values()) {
      if (!s.sid || s.sandbox) continue;
      for (const ev of evs) this.send(s.sid, GAME_MSG.avisoMapa, avisoDoEvento(ev));
    }
  }

  // -------------------------------------------------------------------------
  // Entradas

  onInput(sessionId: string, msg: C2S_Input): void {
    const s = this.sessions.get(sessionId);
    if (!s || !s.connected || !msg || typeof msg !== 'object') return;
    if (isNum(msg.rtt)) s.rtt = Math.max(0, Math.min(MAX_CLIENT_RTT_MS, msg.rtt));
    if (isInt(msg.ackTick)) s.ackTick = Math.max(s.ackTick, Math.min(msg.ackTick, this.world.tick));
    // joystick: só seq maior que a última consumida; fila em ordem (drenada no tick)
    if (Array.isArray(msg.inputs)) {
      const ins = msg.inputs.slice(-8).map(sanitizeInput).filter((x): x is PlayerInput => x !== null);
      // cliente que recomeçou a contagem (aba recarregada na mesma sessão)
      if (ins.length > 0 && s.lastSeq > 1000 && ins.every((i) => i.seq + 1000 < s.lastSeq)) {
        s.lastSeq = -1;
        s.inputQ.length = 0;
      }
      for (const inp of ins) {
        if (inp.seq <= s.lastSeq || s.inputQ.some((q) => q.seq === inp.seq)) continue;
        s.inputQ.push(inp);
      }
      if (ins.length > 0) s.lastInputTick = this.world.tick;
      s.inputQ.sort((a, b) => a.seq - b.seq);
      while (s.inputQ.length > INPUT_QUEUE_MAX) s.inputQ.shift();
    }
    // comandos: cada id uma vez só
    if (Array.isArray(msg.cmds)) {
      const raw = msg.cmds.slice(0, MAX_CMDS_PER_MSG);
      const cmds: { c: PlayerCommand; afterSeq?: number }[] = [];
      for (const r of raw) {
        const c = sanitizeCmd(r);
        if (!c) continue;
        const after = (r as unknown as Record<string, unknown>)['afterSeq'];
        cmds.push(isInt(after) && after >= 0 ? { c, afterSeq: after } : { c });
      }
      cmds.sort((a, b) => a.c.id - b.c.id);
      for (const h of cmds) {
        const c = h.c;
        if (s.recent.has(c.id) || c.id <= s.cack - RECENT_CMD_IDS) continue;
        s.recent.add(c.id);
        s.recentOrder.push(c.id);
        while (s.recentOrder.length > RECENT_CMD_IDS) s.recent.delete(s.recentOrder.shift()!);
        if (c.id > s.cack) s.cack = c.id;
        s.cmdQ.push({ ...h, since: this.world.tick });
      }
    }
  }

  /** Responde 'need': as entidades pedidas que estão no raio, com todos os campos. */
  onNeed(sessionId: string, msg: C2S_Need): S2C_Info {
    const s = this.sessions.get(sessionId);
    const me = s && this.entityOf(sessionId);
    const out: S2C_Info = { ents: [] };
    if (!s || !me || !msg || !Array.isArray(msg.ids)) return out;
    for (const id of msg.ids.slice(0, MAX_NEED_IDS)) {
      if (!isInt(id)) continue;
      const e = this.world.entities.get(id);
      if (!e || e.dead || !this.visibleTo(me, e)) continue;
      const o = { ...baseEntSnap(this.world, e) };
      const info = this.infoOf(e);
      o.d = info.d;
      o.n = info.n;
      o.lv = info.lv;
      if (info.lk !== undefined) o.lk = info.lk;
      if (e.id === me.id && e.targetId !== undefined) o.tg = e.targetId;
      out.ents.push(o);
    }
    return out;
  }

  pong(t: unknown): S2C_Pong {
    return { t: isNum(t) ? t : 0, st: this.world.tick };
  }

  /** Ticks de compensação de atraso para os comandos desta sessão. */
  rewindTicksFor(sessionId: string): number {
    const s = this.sessions.get(sessionId);
    return s ? this.rewindTicks(s) : 0;
  }

  /**
   * O cliente desenha os outros em serverNow − INTERP_DELAY_MS, e o serverNow dele já está uma ida
   * atrás do servidor; o comando leva mais uma ida e espera, em média, meio tick. Total: RTT + 100 ms
   * + 25 ms, limitado a MAX_REWIND_MS.
   */
  private rewindTicks(s: Session): number {
    return Math.round(Math.min(MAX_REWIND_MS, s.rtt + INTERP_DELAY_MS + TICK_MS / 2) / TICK_MS);
  }

  /**
   * Anda um passo agora com o joystick de `inp` (entrada extra da drenagem). É o mesmo cálculo do
   * movimento do step para o joystick (moveVelocity + stepMovement com a velocidade efetiva), que o
   * cliente também usa na previsão.
   */
  private moveNow(e: Entity, inp: PlayerInput): void {
    if (!canMove(e)) return;
    const speed = moveSpeedOf(e);
    let { vx, vy } = moveVelocity({ x: dequantizeAxis(inp.mx), y: dequantizeAxis(inp.my) }, speed);
    if (vx === 0 && vy === 0 && !e.auto) {
      // sem joystick: o passo do caminho do toque no chão (o cliente também prevê um por entrada),
      // igual ao do movimento do step. No automático, quem anda é a Doutrina, uma vez por tick.
      if (e.path && e.path.length > 0) {
        while (e.path.length > 0 && Math.hypot(e.x - e.path[0]!.x, e.y - e.path[0]!.y) < 0.15) e.path.shift();
        const wp = e.path[0] ?? e.moveTo;
        if (wp) ({ vx, vy } = velocityToward(e, wp.x, wp.y, speed, TICK_MS));
        if (e.path.length === 0) e.path = undefined;
      } else if (e.moveTo) {
        const v = velocityToward(e, e.moveTo.x, e.moveTo.y, speed, TICK_MS);
        if (v.dist < 0.1) e.moveTo = undefined;
        else ({ vx, vy } = v);
      }
    }
    if (vx === 0 && vy === 0) return;
    const p = stepMovement(this.world.map, e, vx, vy, TICK_MS);
    e.x = p.x;
    e.y = p.y;
  }

  /**
   * Um comando: fora da sandbox, tocar num NPC abre a conversa (talkTo, sem trocar a ala) e a troca
   * de arquétipo direta não existe; os controles usados vão para o tutorial e as missões.
   */
  private runCommand(s: Session, e: Entity, c: PlayerCommand): void {
    const slot = this.slots.get(s.token);
    const rules = slot && !slot.sandbox ? slot : undefined;
    if (rules) {
      if (c.c === 'trocar_arquetipo') return;
      if (c.c === 'interagir') {
        const n = npcInReach(this.world, e, { entity: c.entity });
        if (n) this.talk(rules, n.defId);
        return;
      }
    }
    applyCommand(this.world, e, c, { rewindTicks: this.rewindTicks(s) });
    if (!rules) return;
    if (c.c === 'ir_ate') rules.queued.push({ t: 'control', controle: 'tocar_no_chao' });
    else if (c.c === 'alvo') rules.queued.push({ t: 'control', controle: 'trocar_alvo' });
    else if (c.c === 'auto' && c.on) rules.queued.push({ t: 'control', controle: 'modo_automatico' });
  }

  /** Aplica os comandos da fila que já podem rodar (em ordem; o primeiro que espera segura os outros). */
  private flushCmds(s: Session, e: Entity, movedSeq: number, final: boolean): void {
    const w = this.world;
    let n = 0;
    for (const h of s.cmdQ) {
      const ready =
        h.afterSeq === undefined
          ? final
          : h.afterSeq <= movedSeq || w.tick - h.since >= CMD_HOLD_MAX_TICKS || h.afterSeq > s.lastSeq + INPUT_QUEUE_MAX;
      if (!ready) break;
      n++;
      try {
        this.runCommand(s, e, h.c);
      } catch (err) {
        this.log(`[core] comando ${h.c.c} falhou: ${String(err)}`);
      }
    }
    if (n > 0) s.cmdQ.splice(0, n);
  }

  /** Entradas e comandos de uma sessão neste tick (ver o cabeçalho). */
  private consumeInputs(s: Session, e: Entity): void {
    const w = this.world;
    s.credit = Math.min(INPUT_CREDIT_MAX, s.credit + INPUT_CREDIT_PER_TICK);
    s.paused = false;
    // tudo até lastSeq já andou nos ticks anteriores
    let moved = s.lastSeq;
    this.flushCmds(s, e, moved, false);
    // drenagem: as entradas mais velhas além do alvo andam agora (a do tick anda no step)
    let extra = 0;
    while (s.inputQ.length > INPUT_TARGET_BACKLOG + 1 && extra < INPUT_CATCHUP_PER_TICK && s.credit >= 2) {
      const inp = s.inputQ.shift()!;
      applyInput(w, e, inp);
      this.moveNow(e, inp);
      s.lastSeq = moved = inp.seq;
      s.credit -= 1;
      extra++;
      this.flushCmds(s, e, moved, false);
    }
    // a entrada deste tick (anda no step)
    const inp = s.credit >= 1 ? s.inputQ.shift() : undefined;
    if (inp) {
      applyInput(w, e, inp);
      s.lastSeq = inp.seq;
      s.credit -= 1;
    } else {
      // fila vazia (a rede travou ou a aba parou): não anda neste tick, nem pelo joystick velho nem
      // pelo caminho do toque no chão, porque o ack não anda. A rajada que vier depois é drenada.
      if (e.moveIntent.x !== 0 || e.moveIntent.y !== 0) e.moveIntent = { x: 0, y: 0 };
      s.paused = true;
    }
    this.flushCmds(s, e, moved, true);
    // joystick apertado agora (tutorial: andar_joystick)
    const slot = this.slots.get(s.token);
    if (slot && !slot.sandbox && inp) {
      const down = inp.mx !== 0 || inp.my !== 0;
      if (down && !slot.stickDown) slot.queued.push({ t: 'control', controle: 'andar_joystick' });
      slot.stickDown = down;
    }
  }

  // -------------------------------------------------------------------------
  // Tick

  /** Um tick do servidor: entradas, simulação, regras, mundo e um snapshot por cliente conectado. */
  tick(): Map<string, S2C_Snapshot> {
    const w = this.world;
    // eventos soltos pelos comandos (antes do step, que zera w.events) entram neste tick
    w.events = [];
    // 1. entradas e comandos
    for (const s of this.sessions.values()) {
      const slot = this.slots.get(s.token);
      const e = slot && slot.sid === s.sid ? w.entities.get(slot.entityId) : undefined;
      if (!e || !s.connected) continue;
      this.consumeInputs(s, e);
    }
    // 2. posições antes do passo (eventos de quem sai do mundo neste tick) e as entidades (saque e
    // inimigo que saem do mundo no step ainda servem para as regras)
    this.prevPos.clear();
    const before = new Map<number, Entity>();
    for (const e of w.entities.values()) {
      this.prevPos.set(e.id, [e.x, e.y]);
      if (e.kind === 'loot' || e.kind === 'enemy') before.set(e.id, e);
    }
    // sem entrada neste tick, o caminho do toque no chão espera (o cliente prevê um passo por entrada)
    const parked: { e: Entity; path: Entity['path']; moveTo: Entity['moveTo'] }[] = [];
    for (const s of this.sessions.values()) {
      if (!s.paused || !s.connected) continue;
      const e = this.entityOf(s.sid);
      if (!e || e.auto || (!e.path && !e.moveTo)) continue;
      parked.push({ e, path: e.path, moveTo: e.moveTo });
      e.path = undefined;
      e.moveTo = undefined;
    }
    // 3. simulação
    const fromCommands = w.events;
    let stepped: CombatEvent[];
    try {
      stepped = step(w);
    } finally {
      for (const p of parked) {
        if (p.e.path === undefined && p.e.moveTo === undefined) {
          p.e.path = p.path;
          p.e.moveTo = p.moveTo;
        }
      }
    }
    const events = fromCommands.length > 0 ? [...fromCommands, ...stepped] : stepped;
    w.events = events;
    this.lastEvents = events;
    // 4. regras de jogo (Fase 2)
    if (!this.sandbox) {
      try {
        this.processGameEvents(events, before);
        if (w.tick % AREA_CHECK_TICKS === 0) this.checkAreas();
      } catch (err) {
        this.log(`[core] regras falharam: ${err instanceof Error ? err.stack : String(err)}`);
      }
      // Fase 5: plantonistas (XP e saque para o relatório), encontros com IA e o andar da masmorra
      try {
        this.tickDuty(events, before);
        if (this.encountersOn) this.tickEncountersNow();
        if (this.dungeon) this.tickDungeon();
        this.flushInfluence();
      } catch (err) {
        this.log(`[core] fase 5 falhou: ${err instanceof Error ? err.stack : String(err)}`);
      }
    }
    // 5. mundo: renascimento, quem caiu da conexão, gravação
    this.spawner?.tick();
    const saveTicks = msToTicks(SAVE_EVERY_MS);
    for (const slot of Array.from(this.slots.values())) {
      const e = w.entities.get(slot.entityId);
      if (!e) {
        this.slots.delete(slot.token);
        continue;
      }
      if (slot.offlineSince !== undefined && w.tick - slot.offlineSince >= this.offlineTicks) {
        this.despawn(slot);
        continue;
      }
      if (e.level !== slot.lastLevel) {
        slot.lastLevel = e.level;
        slot.dirty = true;
      } else if (w.tick % saveTicks === 0) slot.dirty = true;
    }
    this.flushNotify();
    // 6. snapshots
    this.baseCache.clear();
    this.infoCache.clear();
    this.evCache.clear();
    const out = new Map<string, S2C_Snapshot>();
    for (const s of this.sessions.values()) {
      if (!s.connected) continue;
      const snap = this.snapshotFor(s, events);
      if (snap) out.set(s.sid, snap);
    }
    return out;
  }

  /** Vale para este jogador: no raio, saque dele (ou de ninguém), inimigo invisível não aparece. */
  private visibleTo(me: Entity, e: Entity): boolean {
    if (e.id === me.id) return true;
    const dx = e.x - me.x, dy = e.y - me.y;
    if (dx * dx + dy * dy > this.interestRadius * this.interestRadius) return false;
    if (e.kind === 'loot' && e.loot?.forPlayerId !== undefined && e.loot.forPlayerId !== (me.playerId ?? `#${me.id}`)) return false;
    if (isHostile(me, e) && hasStatus(e, 'invisivel')) return false;
    return true;
  }

  private baseOf(e: Entity): EntSnap {
    let b = this.baseCache.get(e.id);
    if (!b) {
      b = baseEntSnap(this.world, e);
      this.baseCache.set(e.id, b);
    }
    return b;
  }

  private infoOf(e: Entity): { d: string; n: string; lv: number; lk: unknown; lkJson: string | undefined } {
    let i = this.infoCache.get(e.id);
    if (!i) {
      const rec = e.kind === 'player' && e.playerId ? this.recByPlayerId(e.playerId) : undefined;
      const lk = lookOf(e, rec?.appearance);
      i = { d: e.defId, n: e.name, lv: e.level, lk, lkJson: lk === undefined ? undefined : JSON.stringify(lk) };
      this.infoCache.set(e.id, i);
    }
    return i;
  }

  private recByPlayerId(pid: string): PlayerRecord | undefined {
    for (const s of this.slots.values()) if (s.rec.id === pid) return s.rec;
    return undefined;
  }

  private snapshotFor(s: Session, events: CombatEvent[]): S2C_Snapshot | undefined {
    const w = this.world;
    const slot = this.slots.get(s.token);
    const me = slot && slot.sid === s.sid ? w.entities.get(slot.entityId) : undefined;
    if (!me) return undefined;
    const now = w.tick;
    const R = this.interestRadius;
    const visible = new Set<number>();
    const ents: EntSnap[] = [];
    for (const e of w.entities.values()) {
      if (e.dead || !this.visibleTo(me, e)) continue;
      visible.add(e.id);
      const o: EntSnap = { ...this.baseOf(e) };
      if (e.id === me.id && e.targetId !== undefined) o.tg = e.targetId;
      const info = this.infoOf(e);
      const prev = s.sent.get(e.id);
      let full = false;
      if (!prev || prev.d !== info.d || prev.n !== info.n || prev.lv !== info.lv || prev.lk !== info.lkJson) {
        s.sent.set(e.id, { d: info.d, n: info.n, lv: info.lv, lk: info.lkJson, tick: now });
        full = true;
      } else if (s.ackTick < prev.tick && (now - prev.tick) % INFO_REPEAT_TICKS === 0) full = true;
      if (full) {
        o.d = info.d;
        o.n = info.n;
        o.lv = info.lv;
        if (info.lk !== undefined) o.lk = info.lk;
      }
      ents.push(o);
    }
    // quem saiu do raio ou do mundo
    for (const id of Array.from(s.sent.keys())) {
      if (visible.has(id)) continue;
      s.sent.delete(id);
      s.gone.set(id, now);
    }
    const gone: number[] = [];
    for (const [id, t0] of Array.from(s.gone)) {
      if (visible.has(id) || (s.ackTick >= t0 && t0 < now) || now - t0 > GONE_REPEAT_TICKS) {
        s.gone.delete(id);
        continue;
      }
      gone.push(id);
    }
    const near = (x: number, y: number, extra: number) => {
      const dx = x - me.x, dy = y - me.y, r = R + extra;
      return dx * dx + dy * dy <= r * r;
    };
    const tel = w.telegraphs.filter((t) => near(t.x, t.y, t.radius)).map(telegraphOut);
    const zones = w.zones.filter((z) => near(z.x, z.y, Math.max(z.radius, z.range ?? 0))).map(zoneOut);
    const ev: CombatEvent[] = [];
    const myPid = me.playerId ?? `#${me.id}`;
    for (const e of events) {
      if (e.t === 'loot_drop') {
        const l = w.entities.get(e.id);
        if (!l || (l.loot?.forPlayerId !== undefined && l.loot.forPlayerId !== myPid)) continue;
      }
      const refs = eventRefs(e);
      let ok = refs.ids.includes(me.id) || (refs.at !== undefined && near(refs.at[0], refs.at[1], EVENT_MARGIN_TILES));
      if (!ok) {
        for (const id of refs.ids) {
          const ent = w.entities.get(id);
          const p = ent ? [ent.x, ent.y] : this.prevPos.get(id);
          if (p && near(p[0]!, p[1]!, EVENT_MARGIN_TILES)) {
            ok = true;
            break;
          }
        }
      }
      if (!ok) continue;
      let c = this.evCache.get(e);
      if (!c) {
        c = eventOut(e);
        this.evCache.set(e, c);
      }
      ev.push(c);
    }
    const snap: S2C_Snapshot = { t: now, ack: s.lastSeq, cack: s.cack, ents, tel, zones, ev, hud: hudSnapshot(w, me) };
    if (gone.length > 0) snap.gone = gone;
    return snap;
  }

  // -------------------------------------------------------------------------

  stats(): { mapId: string; sandbox: boolean; tick: number; players: number; online: number; entities: number } {
    let online = 0;
    for (const s of this.sessions.values()) if (s.connected) online++;
    return { mapId: this.mapId, sandbox: this.sandbox, tick: this.world.tick, players: this.slots.size, online, entities: this.world.entities.size };
  }
}
