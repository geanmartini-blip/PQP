/**
 * Servidor local (puro): roda a simulação de shared no próprio navegador e fala o mesmo protocolo
 * do servidor de jogo. Serve para ?offline=1 (jogar sem servidor, no celular ou no PC) e para os
 * testes de previsão com atraso. Não substitui o servidor autoritativo: é um espelho simplificado
 * dele para um jogador só.
 *
 * Regras de rede que ele segue (as mesmas do GameServerCore, server/src/core.ts):
 * - entradas: só seq maior que a última consumida e ainda não enfileirada, fila em ordem de seq;
 *   uma por tick (ack = última seq aplicada); com mais de INPUT_TARGET_BACKLOG esperando, até
 *   INPUT_CATCHUP_PER_TICK extras andam na hora, pagas por um crédito de entradas (ninguém anda
 *   mais rápido mandando mais entradas); a fila corta as mais velhas em INPUT_QUEUE_MAX;
 * - sem entrada por STALE_INPUT_TICKS, o joystick volta ao centro;
 * - comandos: cada id uma vez só (cack = maior id visto, mais um conjunto dos recentes), guardados
 *   na chegada e aplicados no tick, depois da entrada e antes do step();
 * - snapshot completo a cada tick, com d/n/lk/lv só para quem é novo (ou mudou);
 * - compensação: rewind de RTT + INTERP_DELAY_MS + meio tick, até 250 ms.
 *
 * Fase 2 (o MESMO fluxo do servidor, pelas regras de shared/game): o jogador é um PlayerRecord
 * (guardado no aparelho pelo `store`), começa no Delta sem cadastro, e as mensagens de GAME_MSG
 * (criação, Máquina de Visual, falar, diálogo, missões, tutorial e travessia) chamam as mesmas
 * funções. Eventos da simulação viram eventos de jogo (XP, inimigo derrotado, saque, lugar, botão).
 * A travessia é jogável (game/barco.ts, as mesmas regras do servidor): "Embarcar" com o Seu Jacó
 * monta o mapa 'barco:<id>'; na altura da ponte abre a escolha; depois vêm a aula (ondas, Especial
 * cheio, falas do guia) e a chegada no cais da margem (welcome novo). `atalhoTravessia` (testes)
 * deixa a 'travessia' valer direto do Delta.
 *
 * Fase 3 (as mesmas regras): ala no 12, talentos 10/15/20, botão 3, tela da instituição, pagar
 * objetivo, emote (volta para o próprio cliente), conversa com o guia ('falar' com npcId 'guia'),
 * falas do guia ('fala_guia'), 'sobreviver' contado de segundo em segundo e as saídas entre os
 * mapas (margens, Usina da Ponte, Juncal e o barco do Delta), com welcome novo. Talentos, guia e
 * botão 3 entram na entidade pelo simSpawnExtrasOf e trocam o kit quando mudam.
 *
 * Modo protótipo (o da Fase 1): mapa passado nas opções (testes) ou ?ala= no hello. Sem perfil,
 * sem missões; o 'interagir' da simulação troca a ala com Wesley e Li Wei.
 */
import { ARRIVAL_MAP_BY_SIDE, boatRoomId, boatRoomMap, findPath, getMap, hasMap, isBoatRoom, START_MAP, type TileMap } from '@pqp/shared/map';
import {
  GAME_MSG,
  INTEREST_RADIUS,
  INTERP_DELAY_MS,
  MAX_REWIND_MS,
  MSG,
  PROTOCOL_VERSION,
  quantize,
  type C2S_CriarPersonagem,
  type C2S_DialogoOpcao,
  type C2S_Falar,
  type C2S_Hello,
  type C2S_Input,
  type C2S_MaquinaVisual,
  type C2S_MissaoAceitar,
  type C2S_Ping,
  type C2S_Travessia,
  type C2S_TutorialPasso,
  type C2S_EscolherAla,
  type C2S_EscolherTalento,
  type C2S_TrocarSlot3,
  type C2S_Instituicao,
  type C2S_MissaoPagar,
  type C2S_Emote,
  type EntSnap,
  type S2C_Aviso,
  type S2C_BarcoInfo,
  type S2C_Dialogo,
  type S2C_Emote,
  type S2C_FalaGuia,
  type S2C_Snapshot,
  type S2C_Welcome,
} from '@pqp/shared/net';
import { applyFlatPassiveNumbers } from '@pqp/shared/sim/passiveDefs';
import {
  applyCommand,
  applyInput,
  canMove,
  createWorld,
  entityFlags,
  hudSnapshot,
  moveSpeedOf,
  moveVelocity,
  npcInReach,
  setArchetype,
  spawnAlly,
  spawnEnemy,
  spawnNpc,
  spawnPack,
  spawnPlayer,
  step,
  stepMovement,
  TICK_MS,
  TICK_RATE,
  type CombatEvent,
  type Entity,
  type PlayerCommand,
  type PlayerInput,
  type World,
} from '@pqp/shared/sim';
import { relevel } from '@pqp/shared/sim/spawn';
import { circleFree } from '@pqp/shared/map';
import { getData } from '@pqp/shared';
import {
  acceptMission,
  applyTravessia,
  applyVisualMachine,
  // travessia de barco
  boardBoat,
  boatButtonOf,
  boatInfo,
  boatOnCast,
  boatOnChosen,
  boatRoomOf,
  boatTick,
  boatWaveSpot,
  canBoard,
  FLAG_BRUNO,
  raiseToLevel,
  newBoatState,
  type BoatAction,
  type BoatState,
  controlesLiberados,
  createCharacter,
  currentObjectives,
  dialogOption,
  gainXp,
  isDeltaRookie,
  lookOf,
  migratePlayerRecord,
  missionStatus,
  nearVisualMachine,
  newPlayerRecord,
  onGameEvent,
  profileOf,
  refreshMissions,
  simKitOf,
  simLevelCap,
  talkTo,
  travessiaOptions,
  chooseArchetype,
  pickTalent,
  setSlot3,
  institutionInfo,
  payObjective,
  useEmote,
  progressOptions,
  simSpawnExtrasOf,
  guideOf,
  isOwnGuide,
  emptyResult,
  mergeResult,
  TRAVESSIA_LEVEL,
  type SideId,
  type BotaoId,
  type GameEvent,
  type GameResult,
  type PlayerRecord,
  // Fase 4
  alugarCapsula,
  anunciarApp,
  anunciarFeira,
  avancarListaDeEspera,
  cancelarAnuncio,
  carteiraView,
  casaView,
  cicloCidadeMin,
  colocarMovel,
  comprarApp,
  comprarFeira,
  comprarMovel,
  comprarNaLoja,
  convidar,
  cotarTroca,
  darBem,
  definirVisitas,
  economiaOf,
  entrarNaListaDeEspera,
  exchangeRate,
  girarMovel,
  mercadoView,
  migrarCidade,
  moverMovel,
  nomeDoBem,
  pagarDivida,
  receberPendencias,
  retirarEntregas,
  saqueNaMoedaDaMargem,
  sincronizarComCidade,
  tickCidade,
  tirarMovel,
  trocarMoeda,
  venderNaLoja,
  type Bem,
  type CidadeState,
  type MercadoId,
  type Moeda,
  type PermissaoVisita,
  type PrecoCtx,
  type Rotacao,
  // Fase 5
  aplicarFaccaoNaCidade,
  atExit,
  atStairs,
  advanceFloor,
  bankRewards,
  benzer,
  calibrar,
  chooseDungeonEvent,
  claimRunRewards,
  concluirBenzimentos,
  createDungeonRun,
  definirDoutrina,
  desequipar,
  encerrarPlantao,
  entrarEmPlantao,
  equipar,
  failRun,
  filtroRaridadeOf,
  firstBossClear,
  itemDefOf,
  isEquipavel,
  itensView,
  joinRun,
  leaveRun,
  levarPlantonista,
  liderDe,
  LIMIAR_DONO,
  migrarEstadoFaccao,
  nomeDaRegiao,
  nomeDoPonto,
  partyWiped,
  qgDaMargem,
  regionStateParaCombate,
  rollMapEncounters,
  runFloor,
  saqueDisponivel,
  sairDoPlantao,
  sementeDoTick,
  setFiltroRaridade,
  shortcutOf,
  simEquipOf,
  somarInfluencia,
  spawnEncounter,
  spawnPlantonista,
  startDungeonFloor,
  tickDungeonFloor,
  tickEncounters,
  tickFaccao,
  tickPlantao,
  vendaAutomaticaOf,
  type DungeonFloorState,
  type DungeonRun,
  type DutyAssignment,
  type EstadoFaccao,
  type FonteInfluencia,
  type WorldEvent,
} from '@pqp/shared/game/index';
import { applyEquipment } from '@pqp/shared/sim/stats';
import { bal } from '@pqp/shared/sim/constants';
import { createRng } from '@pqp/shared/sim/rng';
import type {
  C2S_AppAnunciar,
  C2S_CambioCotar,
  C2S_CambioTrocar,
  C2S_CasaAlugar,
  C2S_CasaAvancarFila,
  C2S_CasaColocar,
  C2S_CasaComprarMovel,
  C2S_CasaMover,
  C2S_CasaMovel,
  C2S_CasaVisitar,
  C2S_CasaVisitas,
  C2S_FeiraAnunciar,
  C2S_LojaComprar,
  C2S_LojaVender,
  C2S_MercadoCancelar,
  C2S_MercadoComprar,
  C2S_MercadoListar,
  S2C_CambioInfo,
  S2C_EconomiaResultado,
  // Fase 5
  C2S_Equipar,
  C2S_Desequipar,
  C2S_Melhorar,
  C2S_FiltroRaridade,
  C2S_DoutrinaDefinir,
  C2S_Plantonista,
  C2S_PlantaoDefinir,
  C2S_MasmorraEntrar,
  C2S_MasmorraEscolha,
  S2C_AvisoMapa,
  S2C_DoutrinaInfo,
  S2C_FaccaoInfo,
  S2C_MasmorraInfo,
  S2C_PlantaoInfo,
  PlantonistaView,
} from '@pqp/shared/net';
import { archetypeLook, defaultLook } from '../art/character';

// SUGESTÃO: os mesmos números do servidor (server/src/config.ts): bando morto volta em 90 s, o chefe
// em 5 min, e nada renasce com o jogador a menos de 12 tiles do ponto.
export const RESPAWN_BAND_MS = 90000;
export const RESPAWN_BOSS_MS = 300000;
export const RESPAWN_SAFE_RADIUS = 12;
// SUGESTÃO: ala inicial do personagem template do protótipo.
export const DEFAULT_ARCHETYPE = 'peao_brabo';
// SUGESTÃO: os mesmos números do servidor (server/src/config.ts): fila alvo de 1 entrada, até 2
// extras por tick, crédito de 1,05 por tick até 20, fila de no máximo 40, joystick ao centro depois
// de 10 ticks sem entrada, 128 ids de comando lembrados, 16 comandos lidos por mensagem.
export const INPUT_TARGET_BACKLOG = 1;
export const INPUT_CATCHUP_PER_TICK = 2;
export const INPUT_CREDIT_PER_TICK = 1.05;
export const INPUT_CREDIT_MAX = 20;
export const INPUT_QUEUE_MAX = 40;
export const STALE_INPUT_TICKS = 10;
export const RECENT_CMD_IDS = 128;
export const MAX_CMDS_PER_MSG = 16;
// SUGESTÃO (Fase 2, só no servidor local): raio de chegada num lugar (3 tiles), raio da saída da
// travessia e dos alvos de 'interagir' (1,6 tile), lugares conferidos a cada 5 ticks, e 3 s ao lado
// do Seu Jacó contam como o 'reanimar' do tutorial (o Seu Jacó não cai de verdade no piloto).
export const PLACE_RADIUS = 3;
export const INTERACT_MARK_RADIUS = 1.6;
export const PLACE_CHECK_TICKS = 5;
export const REVIVE_TUTORIAL_TICKS = 60;
export const REVIVE_TUTORIAL_RADIUS = 1.8;
// SUGESTÃO (Fase 3, só no servidor local): chegar a 2 tiles de uma saída troca de mapa; depois de
// chegar num mapa, a saída só vale de novo quando o jogador se afasta dela (sem ir e voltar na hora).
export const EXIT_RADIUS = 2;
// SUGESTÃO (Fase 4, só no servidor local): a cidade anda a cada 1 s; a feira e o app sempre têm
// pelo menos 3 anúncios de vizinhos NPC (para dar o que comprar jogando sozinho).
export const CITY_TICK_TICKS = 20;
export const NPC_LISTINGS_MIN = 3;
/** SUGESTÃO: vizinhos NPC que anunciam na feira e no app do servidor local (sem fala nova). */
export const NPC_SELLERS: Record<'feira' | 'app', { id: string; name: string; side: 'esquerda' | 'direita'; bens: { bem: Bem; preco: number }[] }> = {
  feira: {
    id: 'npc_vizinha_da_bracadeira',
    name: 'Vizinha da Braçadeira',
    side: 'esquerda',
    bens: [
      { bem: { tipo: 'recurso', id: 'comida', quantidade: 3 }, preco: 0 },
      { bem: { tipo: 'item', id: 'pao_da_feira' }, preco: 0 },
      { bem: { tipo: 'movel', id: 'banco_de_madeira' }, preco: 12 },
    ],
  },
  app: {
    id: 'npc_entregador_de_app',
    name: 'Entregador de App',
    side: 'direita',
    bens: [
      { bem: { tipo: 'recurso', id: 'energia', quantidade: 2 }, preco: 40 },
      { bem: { tipo: 'item', id: 'cha_de_ervas' }, preco: 30 },
      { bem: { tipo: 'recurso', id: 'pecas', quantidade: 2 }, preco: 28 },
    ],
  },
};

// SUGESTÃO (Fase 5, só no servidor local): entrar nas Galerias a até 3 tiles do marcador da
// masmorra; a saída do andar só vale depois de se afastar dela; o grupo todo no chão por 5 s acaba
// a run; o servidor local não tem outros jogadores, então o QG tem 3 vizinhos NPC de plantão.
export const DUNGEON_ENTER_RADIUS = 3;
export const DUNGEON_WIPE_TICKS = 100;
/** SUGESTÃO: vizinhos NPC de plantão no QG do servidor local (nomes inventados). */
export const NPC_PLANTONISTAS: Record<'esquerda' | 'direita', { id: string; name: string }[]> = {
  esquerda: [
    { id: 'npc_plantao_dona_cida', name: 'Dona Cida do Mutirão' },
    { id: 'npc_plantao_tiao', name: 'Tião da Horta Coletiva' },
    { id: 'npc_plantao_ze', name: 'Zé da Ata' },
  ],
  direita: [
    { id: 'npc_plantao_kevin', name: 'Kevin do Delivery' },
    { id: 'npc_plantao_jessyca', name: 'Jéssyca Mentora' },
    { id: 'npc_plantao_bruno', name: 'Bruno Trainee' },
  ],
};

export type Outgoing = [string, unknown];

/** Fase 5: onde o servidor local guarda o estado da IA de facção. */
export interface FactionStore {
  load(): unknown;
  save(e: EstadoFaccao): void;
}

/** Onde o servidor local guarda o registro do jogador (localStorage no navegador; mapa nos testes). */
export interface RecordStore {
  load(id: string): unknown;
  save(id: string, rec: PlayerRecord): void;
}

/** Fase 4: onde o servidor local guarda a cidade (mercado, câmbio, ciclo). */
export interface CityStore {
  load(): unknown;
  save(c: CidadeState): void;
}

interface Group {
  markerId: string;
  kind: 'bando' | 'inimigo' | 'chefe';
  ref: string;
  x: number;
  y: number;
  n: number;
  params: Record<string, unknown>;
  ids: number[];
  deadSince?: number;
}

const KIND_CODE: Record<Entity['kind'], EntSnap['k']> = { player: 'p', npc: 'n', enemy: 'e', summon: 's', loot: 'l' };

export interface LocalServerOpts {
  mapId?: string;
  seed?: number;
  /** sem inimigos (testes de movimento) */
  noEnemies?: boolean;
  /** mapa pronto (testes) em vez de getMap(mapId) */
  map?: TileMap;
  /** registro persistente do jogador (Fase 2) */
  store?: RecordStore;
  /** força as regras da Fase 2 mesmo com mapa passado (testes) */
  fase2?: boolean;
  /** Fase 4: relógio em ms da cidade (anúncios, fila, ciclo); padrão: ticks × 50 ms */
  clock?: () => number;
  /** Fase 4: cidade salva (padrão: só na memória) */
  cityStore?: CityStore;
  /** Fase 4: duração do ciclo da cidade em minutos (padrão: housing.json) */
  cityCycleMin?: number;
  /** Fase 4: atalhos de teste (andar a lista de espera); padrão: ligados no servidor local */
  devTools?: boolean;
  /** Fase 5: estado da IA de facção salvo (padrão: só na memória) */
  factionStore?: FactionStore;
  /** Fase 5: duração do tick de facção em minutos (padrão: faction_ai.json) */
  factionTickMin?: number;
  /** Fase 5: encontros com IA nas margens (padrão: ligados) */
  encounters?: boolean;
  /**
   * Atalho de teste: 'travessia' vale direto do Delta, sem o barco (leva para a margem na hora).
   * Padrão: desligado (a travessia é no barco do Seu Jacó, como no servidor).
   */
  atalhoTravessia?: boolean;
  /**
   * Só de desenvolvimento (?dev_travessia=1 no offline): quem ainda está no Delta fica pronto para
   * o barco (Bruno Ferro derrotado e nível 8). O embarque continua pelo Seu Jacó, como no jogo.
   */
  devTravessia?: boolean;
  /**
   * Só de desenvolvimento (?dev_nivel=N e ?dev_mapa=<mapId> no offline): o personagem criado sobe ao
   * nível, atravessa pelas regras de shared quando o nível ou o mapa pedem a margem, e nasce no mapa.
   */
  devPrep?: { level?: number; mapId?: string };
}

/** Mapas aceitos pelo ?dev_mapa= (o barco e o protótipo têm entrada própria). */
export const DEV_MAPS: readonly string[] = ['delta', 'margem_esquerda', 'margem_direita', 'usina_da_ponte', 'juncal'];

export class LocalServer {
  w!: World;
  mapId = '';
  player: Entity | undefined;
  /** registro do jogador (Fase 2); undefined no modo protótipo */
  rec: PlayerRecord | undefined;
  private spawn = { x: 1.5, y: 1.5 };
  private inputs: PlayerInput[] = [];
  private lastSeq = 0;
  private lastInputTick = 0;
  private credit = INPUT_CREDIT_MAX;
  private cack = 0;
  private recent = new Set<number>();
  private recentOrder: number[] = [];
  private cmdQ: PlayerCommand[] = [];
  private rtt = 0;
  private known = new Set<number>();
  private sentLv = new Map<number, number>();
  private sentLook = new Map<number, string>();
  private groups: Group[] = [];
  private outbox: Outgoing[] = [];
  private cmdEvents: CombatEvent[] = [];
  private token = '';
  private readonly seed: number;
  private readonly noEnemies: boolean;
  private readonly fixedMap: TileMap | undefined;
  private readonly prototype: boolean;
  // Fase 2
  private regionNow: string | null = null;
  private nearExit = false;
  private nearInteract = new Set<string>();
  private reviveTicks = 0;
  /** offline solo: o treinador que anda junto nas margens (só luta em grupo dá XP) */
  private companionId: number | undefined;
  private companionGoneTick = -1;
  private telSeen = new Map<number, { x: number; y: number; r: number; near: boolean }>();
  private enemyInfo = new Map<number, { defId: string; tier?: 'normal' | 'elite' | 'chefe'; x: number; y: number; hit: boolean }>();
  // Fase 3
  /** mapa atual do jogador fora da chegada (andou por uma saída); só na memória desta aba */
  private mapOverride: string | undefined;
  /** saídas perto das quais o jogador nasceu: só valem depois que ele se afastar */
  private exitsDisarmed = new Set<string>();
  /** assinatura do kit aplicado na entidade (kit, talentos, guia, botão 3) */
  private kitSig = '';
  private surviveTicks = 0;
  /** controles de 'uma vez só' já mandados nesta sessão */
  private onceSent = new Set<string>();
  // Fase 4
  /** cidade: mercado, câmbio e ciclo */
  city: CidadeState;
  /** ticks desde que o servidor nasceu (o relógio padrão da cidade) */
  private ticksTotal = 0;
  // Fase 5
  /** IA de facção: regiões, pontos de controle e avisos */
  faccao: EstadoFaccao;
  private faccaoDirty = false;
  /** masmorra em andamento */
  run: DungeonRun | null = null;
  floorSt: DungeonFloorState | null = null;
  private returnTo: { mapId: string; x: number; y: number } | null = null;
  private exitArmed = false;
  private wipeTicks = 0;
  private runSeq = 0;
  /** plantonistas levados (duty_assignment) e os registros dos vizinhos NPC de plantão */
  duty: DutyAssignment[] = [];
  private dutyRecs: PlayerRecord[] = [];
  private dutySeq = 0;
  /** saque perto (cache do tick anterior: a coleta tira a entidade no mesmo step) */
  private lootInfo = new Map<number, { itemId?: string; currency: boolean }>();
  /** assinatura do equipamento aplicado na entidade */
  private equipSig = '';
  // travessia de barco
  /** viagem, escolha e aula no barco (só no mapa 'barco:<id>') */
  boat: BoatState | null = null;

  constructor(private readonly opts: LocalServerOpts = {}) {
    this.seed = opts.seed ?? 7;
    this.noEnemies = opts.noEnemies === true;
    this.fixedMap = opts.map;
    this.prototype = !opts.fase2 && (opts.map !== undefined || opts.mapId !== undefined);
    const first = opts.map?.id ?? opts.mapId ?? (this.prototype ? 'prototipo_delta' : START_MAP);
    this.loadMap(first);
    let raw: unknown = null;
    try {
      raw = opts.cityStore?.load() ?? null;
    } catch {
      raw = null;
    }
    this.city = migrarCidade(raw, this.nowMs(), cicloCidadeMin(opts.cityCycleMin));
    // Fase 5: IA de facção (o mesmo JSON que o servidor guarda em world_state 'faccao')
    let rawF: unknown = null;
    try {
      rawF = opts.factionStore?.load() ?? null;
    } catch {
      rawF = null;
    }
    this.faccao = opts.factionTickMin !== undefined ? migrarEstadoFaccao(rawF, this.nowMs(), opts.factionTickMin) : migrarEstadoFaccao(rawF, this.nowMs());
    aplicarFaccaoNaCidade(this.city, this.faccao);
    this.w.regionState = regionStateParaCombate(this.faccao);
  }

  /** Hora da cidade em ms (relógio passado ou os ticks). */
  nowMs(): number {
    return this.opts.clock ? this.opts.clock() : this.ticksTotal * TICK_MS;
  }

  /** Monta o mundo de um mapa (no começo e na troca de mapa); `spawnId` = entrada pedida pela saída. */
  private loadMap(mapId: string | TileMap, spawnId?: string, at?: { x: number; y: number }): void {
    const map =
      typeof mapId !== 'string'
        ? mapId
        : this.fixedMap && this.fixedMap.id === mapId
          ? this.fixedMap
          : isBoatRoom(mapId)
            ? boatRoomMap(mapId)
            : getMap(hasMap(mapId) ? mapId : START_MAP);
    this.mapId = map.id;
    this.w = createWorld(map, this.seed);
    // travessia: o barco parte quando o mapa dele monta (uma viagem nova a cada entrada)
    this.boat = isBoatRoom(map.id) ? newBoatState(this.w.tick) : null;
    this.w.pathfinder = (m, from, to, r) => findPath(m, from, to, r);
    // Fase 5: energia, apagão e poluição das regiões valem no combate (sim/combat.ts marginPct)
    if (this.faccao) this.w.regionState = regionStateParaCombate(this.faccao);
    this.groups = [];
    this.spawn = { x: 1.5, y: 1.5 };
    this.populate(map, this.noEnemies);
    // entrada: a pedida pela saída; senão o primeiro spawn_jogador (o padrão do mapa)
    const want = spawnId ? map.markers.find((m) => m.kind === 'spawn_jogador' && m.id === spawnId) : undefined;
    const first = map.markers.find((m) => m.kind === 'spawn_jogador');
    const sp = want ?? first;
    if (sp) this.spawn = { x: sp.x, y: sp.y };
    if (at) this.spawn = { x: at.x, y: at.y };
    this.lootInfo.clear();
    // Fase 5: encontros com IA (patrulhas e personagens de IA) nas margens
    if (typeof mapId === 'string' && this.opts.encounters !== false && !this.noEnemies && !this.fixedMap && this.rec?.stage === 'margem') {
      try {
        for (const spec of rollMapEncounters(map, this.nowMs(), this.seed)) spawnEncounter(this.w, spec);
      } catch {
        // encontro sem dados: o mapa fica sem
      }
    }
    this.exitsDisarmed.clear();
    for (const m of map.markers) if (m.kind === 'saida' && Math.hypot(m.x - this.spawn.x, m.y - this.spawn.y) <= EXIT_RADIUS + 1) this.exitsDisarmed.add(m.id);
    this.kitSig = '';
    this.known.clear();
    this.sentLv.clear();
    this.sentLook.clear();
    this.inputs = [];
    this.cmdQ = [];
    this.regionNow = null;
    this.nearExit = false;
    this.nearInteract.clear();
    this.telSeen.clear();
    this.enemyInfo.clear();
    this.player = undefined;
  }

  private populate(map: TileMap, noEnemies: boolean): void {
    for (const m of map.markers) {
      if (m.kind === 'spawn_jogador') this.spawn = { x: m.x, y: m.y };
      else if (m.kind === 'npc' && m.ref) spawnNpc(this.w, m.ref, m.x, m.y);
      else if (!noEnemies && (m.kind === 'bando' || m.kind === 'inimigo' || m.kind === 'chefe')) {
        const params = (m.params ?? {}) as Record<string, unknown>;
        const list = params['inimigos'];
        const ref = m.ref ?? (Array.isArray(list) ? String(list[0]) : '');
        if (!ref || !getData().enemiesById.has(ref)) continue;
        const g: Group = { markerId: m.id, kind: m.kind, ref, x: m.x, y: m.y, n: m.kind === 'bando' ? Number(params['n'] ?? 3) : 1, params, ids: [] };
        this.groups.push(g);
        this.spawnGroup(g);
      }
    }
  }

  private spawnGroup(g: Group): void {
    g.ids = [];
    g.deadSince = undefined;
    const tier = g.params['tier'] as 'normal' | 'elite' | 'chefe' | undefined;
    const affixes = Array.isArray(g.params['affixes']) ? (g.params['affixes'] as string[]) : undefined;
    const lv = Number(g.params['level']);
    // bando: como o spawner do servidor (spawnPack: mesmo packId, escolta, promoção a elite)
    if (g.kind === 'bando') {
      for (const e of spawnPack(this.w, g.ref, g.x, g.y, { n: g.n, packId: g.markerId })) g.ids.push(e.id);
      return;
    }
    for (let i = 0; i < g.n; i++) {
      // bando em roda em volta do marcador, só onde cabe
      let x = g.x, y = g.y;
      if (g.n > 1) {
        const a = (i / g.n) * Math.PI * 2;
        const cx = g.x + Math.cos(a) * 1.2, cy = g.y + Math.sin(a) * 1.2;
        if (circleFree(this.w.map, cx, cy, 0.45)) {
          x = cx;
          y = cy;
        }
      }
      const e = spawnEnemy(this.w, g.ref, x, y, { ...(tier ? { tier } : {}), ...(affixes ? { affixes } : {}), ...(Number.isFinite(lv) && lv > 0 ? { level: lv } : {}) });
      g.ids.push(e.id);
    }
  }

  /** Mensagem do cliente. */
  receive(type: string, msg: unknown): void {
    switch (type) {
      case MSG.hello:
        this.onHello(msg as C2S_Hello);
        break;
      case MSG.input:
        this.onInput(msg as C2S_Input);
        break;
      case MSG.ping:
        this.outbox.push([MSG.pong, { t: (msg as C2S_Ping).t, st: this.w.tick }]);
        break;
      case MSG.need: {
        const ids = ((msg as { ids?: number[] })?.ids ?? []).filter((id) => this.w.entities.has(id));
        this.outbox.push([MSG.info, { ents: ids.map((id) => this.entSnap(this.w.entities.get(id)!, true)) }]);
        break;
      }
      default:
        this.onGameMsg(type, msg);
    }
  }

  private onHello(h: C2S_Hello): void {
    this.token = h.token || 'convidado';
    const wantsPrototype = this.prototype || (!!h.archetypeId && getData().archetypesById.has(h.archetypeId));
    if (wantsPrototype) {
      // protótipo da Fase 1 (?ala= ou mapa de teste)
      if (!this.prototype && this.mapId !== 'prototipo_delta' && !this.player) this.loadMap('prototipo_delta');
      if (!this.player) {
        const arch = h.archetypeId && getData().archetypesById.has(h.archetypeId) ? h.archetypeId : DEFAULT_ARCHETYPE;
        this.player = spawnPlayer(this.w, { name: h.name || 'Visitante', archetypeId: arch, x: this.spawn.x, y: this.spawn.y, playerId: this.token });
      }
      this.sendWelcome();
      return;
    }
    // Fase 2: registro do jogador
    if (!this.rec) {
      const raw = this.loadRecord();
      this.rec = raw ? migratePlayerRecord(raw, this.token) : newPlayerRecord(this.token, h.name || 'Visitante');
      this.rec.id = this.token;
    }
    const rec = this.rec;
    this.devPrepTravessia();
    this.applyDevPrep();
    const want = this.mapFor(rec);
    if (!this.player || want !== this.mapId) {
      if (want !== this.mapId) this.loadMap(want);
      this.spawnFromRecord();
    }
    // Fase 5: o andar da masmorra vem antes do welcome (o cliente monta o mapa pela semente)
    if (this.floorSt) this.sendDungeon();
    this.sendWelcome();
    const r = refreshMissions(rec);
    this.flush(r, { always: true });
    this.syncCity();
    this.sendBoat();
  }

  /** Mapa do registro: Delta até a travessia; depois o QG da margem. */
  private mapFor(rec: PlayerRecord): string {
    if (this.fixedMap) return this.fixedMap.id;
    // Fase 5: dentro da masmorra, o andar atual
    if (this.floorSt) return this.mapId;
    // travessia: embarcou e ainda não escolheu a margem: o barco
    const barco = boatRoomOf(rec);
    if (barco) return barco;
    if (rec.stage === 'margem' && rec.side) return this.mapOverride && hasMap(this.mapOverride) ? this.mapOverride : ARRIVAL_MAP_BY_SIDE[rec.side];
    return START_MAP;
  }

  /**
   * Fase 3: troca de mapa por uma saída (params { para, spawn }) ou pela volta de barco do Delta.
   * Monta o mapa novo, nasce o personagem na entrada pedida e manda o welcome novo.
   */
  private changeMap(to: string, spawnId: string | undefined): void {
    const rec = this.rec;
    if (!rec || !hasMap(to)) return;
    const auto = this.player?.auto ?? rec.auto;
    this.mapOverride = to;
    this.loadMap(to, spawnId);
    this.player = undefined;
    this.spawnFromRecord();
    this.player!.auto = auto;
    this.sendWelcome();
    const r = refreshMissions(rec);
    this.flush(r, { always: true });
  }

  private spawnFromRecord(): void {
    const rec = this.rec!;
    const cap = simLevelCap(rec);
    // Fase 3: talentos, guia e botão 3 entram no nascimento (game/combatKit.ts)
    const extras = simSpawnExtrasOf(rec);
    const slot3 = extras.slot3 ?? rec.loadout.slot3_ability ?? undefined;
    this.player = spawnPlayer(this.w, {
      name: rec.name,
      archetypeId: simKitOf(rec),
      level: rec.level,
      xp: rec.xp,
      x: this.spawn.x,
      y: this.spawn.y,
      playerId: this.token,
      ...(rec.side ? { side: rec.side } : {}),
      ...extras,
      ...(slot3 ? { slot3 } : {}),
      look: lookOf(rec),
      ...(cap !== undefined ? { levelCap: cap } : {}),
      deltaRookie: isDeltaRookie(rec),
    });
    this.player.auto = rec.auto;
    this.kitSig = this.kitSignature(rec);
    // Fase 5: equipamento (já veio no simSpawnExtrasOf), Doutrina e plantonistas levados
    this.equipSig = JSON.stringify(simEquipOf(rec) ?? null);
    if (rec.doctrine.length > 0) this.player.doctrine = rec.doctrine.map((c) => ({ ...c }));
    this.spawnDutyAllies();
    this.spawnSoloCompanion();
  }

  // ---------------------------------------------------------------------------
  // Offline solo: companheiro de IA nas margens

  /**
   * SUGESTÃO: no offline não há outros jogadores nem plantonistas de verdade, e só luta em grupo dá
   * XP (no Delta o novato já conta como grupo pelo deltaRookie). Nas margens, um treinador da
   * instituição do jogador anda junto como IA, como o PQP_COMPANHEIRO do servidor: o da ala dele
   * depois do 12; antes, o da 1ª ala da instituição.
   */
  private companionTrainer(rec: PlayerRecord): { id: string; archetype: string } | undefined {
    const D = getData();
    const trainers = [...D.trainersById.values()];
    const arch = rec.archetype ?? (rec.institution ? D.institutionsById.get(rec.institution)?.alas[0] : undefined);
    const t = arch ? trainers.find((x) => x.archetype === arch) : undefined;
    return t ? { id: t.id, archetype: t.archetype } : undefined;
  }

  private spawnSoloCompanion(): void {
    const rec = this.rec;
    const p = this.player;
    this.companionId = undefined;
    this.companionGoneTick = -1;
    if (!rec || !p || this.fixedMap || rec.stage !== 'margem' || isBoatRoom(this.mapId) || this.mapId.startsWith('casa:')) return;
    const t = this.companionTrainer(rec);
    if (!t) return;
    let x = p.x + 0.8, y = p.y;
    if (!circleFree(this.w.map, x, y, 0.45)) {
      x = p.x;
      y = p.y;
    }
    const c = spawnAlly(this.w, t.id, x, y, { archetypeId: t.archetype, level: Math.max(1, rec.level) });
    c.partyId = this.partyIdOf();
    p.partyId = this.partyIdOf();
    this.companionId = c.id;
  }

  /** Companheiro que caiu de vez volta perto do jogador depois de um tempo. */
  private tickSoloCompanion(): void {
    if (this.companionId === undefined) return;
    const p = this.player;
    const c = this.w.entities.get(this.companionId);
    if (!p || p.dead) return;
    if (c && !c.dead) {
      this.companionGoneTick = -1;
      return;
    }
    if (this.companionGoneTick < 0) this.companionGoneTick = this.w.tick;
    // SUGESTÃO: volta 10 s depois de cair de vez
    if (this.w.tick - this.companionGoneTick >= TICK_RATE * 10) {
      if (c) this.w.entities.delete(c.id);
      this.spawnSoloCompanion();
    }
  }

  // ---------------------------------------------------------------------------
  // Fase 5: plantão (vizinhos NPC no servidor local)

  private partyIdOf(): string {
    return `grupo:${this.token}`;
  }

  /** Nasce perto do jogador os plantonistas levados (troca de mapa e andar). */
  private spawnDutyAllies(): void {
    const p = this.player;
    if (!p) return;
    const ativos = this.duty.filter((a) => a.status === 'ativo');
    if (ativos.length > 0) p.partyId = this.partyIdOf();
    else delete p.partyId;
    ativos.forEach((a, i) => this.spawnDutyEntity(a, i));
  }

  private spawnDutyEntity(a: DutyAssignment, i: number): void {
    const p = this.player;
    const rec = this.dutyRecs.find((r) => r.id === a.plantonistaId);
    if (!p || !rec) return;
    const ang = ((i + 1) / 4) * Math.PI * 2;
    let x = p.x, y = p.y;
    const cx = p.x + Math.cos(ang) * 1.2, cy = p.y + Math.sin(ang) * 1.2;
    if (circleFree(this.w.map, cx, cy, 0.45)) {
      x = cx;
      y = cy;
    }
    spawnPlantonista(this.w, rec, x, y, { partyId: this.partyIdOf(), assignment: a });
    p.partyId = this.partyIdOf();
  }

  /** Registros dos vizinhos NPC de plantão no QG da margem do jogador (SUGESTÃO). */
  private dutyRecords(): PlayerRecord[] {
    const rec = this.rec;
    if (!rec?.side) return [];
    const side = rec.side;
    const D = getData();
    const insts = D.institutions.instituicoes.filter((i) => i.margem === side);
    const out: PlayerRecord[] = [];
    NPC_PLANTONISTAS[side].forEach((v, k) => {
      const old = this.dutyRecs.find((r) => r.id === v.id);
      if (old) {
        out.push(old);
        return;
      }
      const inst = insts[k % Math.max(1, insts.length)];
      const r = newPlayerRecord(v.id, v.name);
      r.criado = true;
      r.stage = 'margem';
      r.side = side;
      r.on_duty = true;
      if (inst) {
        r.institution = inst.id;
        r.class = inst.classe;
        r.archetype = inst.alas[k % inst.alas.length] ?? null;
      }
      // SUGESTÃO: o vizinho de plantão acompanha o nível de quem leva (no mínimo 12, o da ala)
      r.level = Math.max(12, rec.level);
      out.push(r);
    });
    this.dutyRecs = out;
    return out;
  }

  private viewOfDuty(r: PlayerRecord): PlantonistaView {
    const D = getData();
    return {
      id: r.id,
      nome: r.name,
      nivel: r.level,
      classe: r.class ? (D.classesById.get(r.class)?.name ?? r.class) : null,
      ala: r.archetype ? (D.archetypesById.get(r.archetype)?.name ?? r.archetype) : null,
      cartas: r.doctrine.length,
    };
  }

  private sendDuty(): void {
    const rec = this.rec;
    if (!rec) return;
    const all = this.dutyRecords();
    const levadosIds = new Set(this.duty.filter((a) => a.status === 'ativo').map((a) => a.plantonistaId));
    const info: S2C_PlantaoInfo = {
      qg: rec.side ? qgDaMargem(rec.side) : null,
      disponiveis: all.filter((r) => !levadosIds.has(r.id)).map((r) => this.viewOfDuty(r)),
      levados: all.filter((r) => levadosIds.has(r.id)).map((r) => this.viewOfDuty(r)),
      grupoMax: bal().combate.grupoMax,
      emPlantao: rec.on_duty,
    };
    this.outbox.push([GAME_MSG.plantaoInfo, info]);
  }

  /** Kit, talentos, guia e botão 3 do registro: quando muda, a entidade troca o kit. */
  private kitSignature(rec: PlayerRecord): string {
    const x = simSpawnExtrasOf(rec);
    return `${simKitOf(rec)}|${(x.talents ?? []).join('+')}|${x.guideId ?? ''}|${x.slot3 ?? rec.loadout.slot3_ability ?? ''}`;
  }

  private sendWelcome(): void {
    this.known.clear();
    this.sentLv.clear();
    this.sentLook.clear();
    const welcome: S2C_Welcome & { token: string } = {
      you: this.player!.id,
      mapId: this.mapId,
      tick: this.w.tick,
      tickRate: TICK_RATE,
      protocol: PROTOCOL_VERSION,
      token: this.token,
    };
    this.outbox.push([MSG.welcome, welcome]);
  }

  private onInput(m: C2S_Input): void {
    const p = this.player;
    if (!p || !m || typeof m !== 'object') return;
    if (typeof m.rtt === 'number' && Number.isFinite(m.rtt)) this.rtt = Math.max(0, Math.min(2000, m.rtt));
    // joystick: só seq maior que a última consumida e ainda não enfileirada, fila em ordem
    if (Array.isArray(m.inputs)) {
      const ins = m.inputs.slice(-8);
      for (const inp of ins) {
        if (!inp || typeof inp.seq !== 'number' || inp.seq <= this.lastSeq || this.inputs.some((q) => q.seq === inp.seq)) continue;
        this.inputs.push({ seq: inp.seq, mx: inp.mx, my: inp.my });
      }
      if (ins.length > 0) this.lastInputTick = this.w.tick;
      this.inputs.sort((a, b) => a.seq - b.seq);
      while (this.inputs.length > INPUT_QUEUE_MAX) this.inputs.shift();
    }
    // comandos: cada id uma vez só; aplicados no próximo tick
    if (Array.isArray(m.cmds)) {
      const cmds = m.cmds.slice(0, MAX_CMDS_PER_MSG).filter((c) => c && Number.isInteger(c.id) && c.id > 0);
      cmds.sort((a, b) => a.id - b.id);
      for (const c of cmds) {
        if (this.recent.has(c.id) || c.id <= this.cack - RECENT_CMD_IDS) continue;
        this.recent.add(c.id);
        this.recentOrder.push(c.id);
        while (this.recentOrder.length > RECENT_CMD_IDS) this.recent.delete(this.recentOrder.shift()!);
        if (c.id > this.cack) this.cack = c.id;
        this.cmdQ.push(c);
      }
    }
  }

  /** Anda um passo agora com o joystick (entrada extra da drenagem), como o moveNow do núcleo. */
  private moveNow(e: Entity): void {
    if (!canMove(e)) return;
    const { vx, vy } = moveVelocity(e.moveIntent, moveSpeedOf(e));
    if (vx === 0 && vy === 0) return;
    const p = stepMovement(this.w.map, e, vx, vy, TICK_MS);
    e.x = p.x;
    e.y = p.y;
  }

  /** Entradas do tick: as extras da drenagem andam na hora; a do tick anda no step. */
  private consumeInputs(p: Entity): void {
    this.credit = Math.min(INPUT_CREDIT_MAX, this.credit + INPUT_CREDIT_PER_TICK);
    let extra = 0;
    while (this.inputs.length > INPUT_TARGET_BACKLOG + 1 && extra < INPUT_CATCHUP_PER_TICK && this.credit >= 2) {
      const inp = this.inputs.shift()!;
      applyInput(this.w, p, inp);
      this.moveNow(p);
      this.lastSeq = inp.seq;
      this.credit -= 1;
      extra++;
    }
    const inp = this.inputs.shift();
    if (inp) {
      applyInput(this.w, p, inp);
      this.lastSeq = inp.seq;
      this.credit -= 1;
      if (this.rec && (inp.mx !== 0 || inp.my !== 0)) this.gameEvent({ t: 'control', controle: 'andar_joystick' }, true);
    } else if (this.w.tick - this.lastInputTick > STALE_INPUT_TICKS && (p.moveIntent.x !== 0 || p.moveIntent.y !== 0)) {
      p.moveIntent = { x: 0, y: 0 };
    }
  }

  /** Ticks de compensação, como o núcleo: RTT + atraso de interpolação + meio tick, até 250 ms. */
  private rewindTicks(): number {
    return Math.round(Math.min(MAX_REWIND_MS, this.rtt + INTERP_DELAY_MS + TICK_MS / 2) / TICK_MS);
  }

  /** Um tick do servidor: entrada e comandos, simulação e snapshot. */
  tick(): void {
    const p = this.player;
    this.ticksTotal++;
    if (this.ticksTotal % CITY_TICK_TICKS === 0) this.cityTick();
    this.w.events = [];
    if (p) {
      this.consumeInputs(p);
      if (this.cmdQ.length > 0) {
        const rewindTicks = this.rewindTicks();
        for (const c of this.cmdQ) {
          if (this.rec) this.onCommand(p, c);
          applyCommand(this.w, p, c, { rewindTicks });
        }
        this.cmdQ = [];
      }
    }
    // eventos soltos pelos comandos (fala do treinador, 'cast') saem antes do step(), que zera w.events
    for (const e of this.w.events) this.cmdEvents.push(e);
    if (p && this.rec) {
      for (const e of this.w.entities.values()) {
        if (e.kind !== 'enemy' || e.dead) continue;
        this.enemyInfo.set(e.id, { defId: e.defId, ...(e.tier ? { tier: e.tier } : {}), x: e.x, y: e.y, hit: e.attackers?.[p.id] !== undefined || p.targetId === e.id });
      }
      // Fase 5: o saque coletado sai do mundo no mesmo step; guarda o que era
      this.lootInfo.clear();
      for (const e of this.w.entities.values()) {
        if (e.kind !== 'loot' || e.dead) continue;
        const itemId = e.loot?.itemId ?? (isEquipavel(e.defId) ? e.defId : undefined);
        this.lootInfo.set(e.id, { ...(itemId ? { itemId } : {}), currency: !!e.loot?.currency });
      }
    }
    const stepEv = step(this.w);
    const ev = this.cmdEvents.length > 0 ? [...this.cmdEvents, ...stepEv] : stepEv;
    this.cmdEvents = [];
    this.respawns();
    this.tickSoloCompanion();
    // Fase 5: plantão (XP e saque do plantonista) e encontros que se renderam
    for (const a of this.duty) tickPlantao(this.w, a);
    if (this.rec && !this.floorSt) {
      for (const id of tickEncounters(this.w)) {
        // SUGESTÃO: aviso do encontro rival que se rendeu
        if (p) this.aviso(`O rival se rendeu e voltou para casa. (${id.split(':')[1] ? nomeDaRegiao(id.split(':')[1]!) : 'encontro'})`);
      }
    }
    if (p && this.rec) this.afterStep(p, ev);
    if (this.player && this.rec && this.floorSt && this.player === p) this.dungeonTick(this.player);
    // travessia: o barco do Seu Jacó (falas, ponte, aula, ondas e chegada)
    if (this.player && this.rec && this.boat && this.player === p) this.boatTickNow(this.player, ev);
    // a travessia pode ter trocado de mapa: o snapshot é do jogador novo
    const cur = this.player;
    if (cur) this.outbox.push([MSG.snap, this.snapshot(cur, cur === p ? ev : [])]);
  }

  private respawns(): void {
    const now = this.w.tick;
    for (const g of this.groups) {
      const alive = g.ids.some((id) => {
        const e = this.w.entities.get(id);
        return e !== undefined && !e.dead;
      });
      if (alive) continue;
      if (g.deadSince === undefined) g.deadSince = now;
      const wait = (g.kind === 'chefe' ? RESPAWN_BOSS_MS : RESPAWN_BAND_MS) / TICK_MS;
      if (now - g.deadSince < wait) continue;
      let perto = false;
      for (const e of this.w.entities.values())
        if (e.kind === 'player' && !e.dead && Math.hypot(e.x - g.x, e.y - g.y) < RESPAWN_SAFE_RADIUS) perto = true;
      if (!perto) this.spawnGroup(g);
    }
  }

  // ---------------------------------------------------------------------------
  // Fase 2: eventos de jogo

  /** Comandos que contam para o tutorial e para os objetivos de botão. */
  private onCommand(p: Entity, c: PlayerCommand): void {
    switch (c.c) {
      case 'habilidade': {
        const botao: BotaoId = c.botao === 'especial' ? 'especial' : (String(c.botao) as BotaoId);
        const slot = c.botao === 'especial' ? 'especial' : (`b${c.botao}` as 'b1' | 'b2' | 'b3');
        const hab = p.loadout?.[slot];
        this.gameEvent({ t: 'ability', botao, ...(hab ? { habilidade: hab } : {}) });
        this.gameEvent({ t: 'control', controle: c.botao === 'especial' ? 'especial' : 'habilidade' }, true);
        break;
      }
      case 'item':
        if ((p.loadout?.itemCount ?? 0) > 0) {
          this.gameEvent({ t: 'ability', botao: 'item' });
          this.gameEvent({ t: 'control', controle: 'item' }, true);
        }
        break;
      case 'auto':
        if (c.on) this.gameEvent({ t: 'control', controle: 'modo_automatico' }, true);
        this.rec!.auto = c.on;
        break;
      case 'alvo':
        this.gameEvent({ t: 'control', controle: 'trocar_alvo' }, true);
        break;
      case 'ir_ate':
        this.gameEvent({ t: 'control', controle: 'tocar_no_chao' }, true);
        break;
      default:
        break;
    }
  }

  /** Eventos da simulação do tick: XP, inimigo derrotado, saque, lugar, aviso desviado. */
  private afterStep(p: Entity, ev: CombatEvent[]): void {
    const rec = this.rec!;
    for (const e of ev) {
      switch (e.t) {
        case 'xp':
          if (e.dst === p.id) this.flush(gainXp(rec, e.amount));
          break;
        case 'death': {
          // o inimigo morto sai do mundo no mesmo step: os dados vêm do cache do tick anterior
          const en = this.enemyInfo.get(e.dst);
          if (!en) break;
          this.enemyInfo.delete(e.dst);
          const near = Math.hypot(en.x - p.x, en.y - p.y) <= 10;
          if (!en.hit && !near && e.by !== p.id) break;
          this.gameEvent({ t: 'kill', enemyId: en.defId, ...(en.tier ? { tier: en.tier } : {}), grupo: { personagens: 1 + this.duty.filter((a) => a.status === 'ativo').length, aoVivo: 1 } });
          // Fase 5: abate soma influência da margem na região (a luta do plantonista conta como plantão)
          const byDuty = e.by !== undefined && this.duty.some((a) => a.status === 'ativo' && a.entityId === e.by);
          this.influence(byDuty ? 'plantao' : 'matar', 1);
          break;
        }
        case 'loot_pick':
          if (e.by === p.id) {
            const l = this.w.entities.get(e.id);
            const li = this.lootInfo.get(e.id);
            const itemId = li?.itemId ?? l?.loot?.itemId;
            this.gameEvent({ t: 'pickup', chave: 'saque', ...(itemId ? { itemId } : l?.defId ? { itemId: l.defId } : {}), quantidade: 1 });
            this.gameEvent({ t: 'control', controle: 'saque' }, true);
            // Fase 5: item equipável coletado vai para a mochila (a venda automática vem com 'currency' logo depois)
            const i = ev.indexOf(e);
            const nx = ev[i + 1];
            const vendido = !li?.currency && nx?.t === 'currency' && nx.dst === p.id;
            if (itemId && isEquipavel(itemId) && !vendido && rec.criado) {
              rec.inventory.push(itemId);
              this.flush({ ...emptyResult(), mudou: true, itens: [itemId], avisos: [`Item: ${itemDefOf(itemId)?.def.name ?? itemId}`] });
            }
          }
          break;
        case 'revive':
          if (e.by === p.id) this.gameEvent({ t: 'control', controle: 'reanimar' }, true);
          break;
        // Fase 4: dinheiro do saque vai para a moeda da margem
        case 'currency':
          if (e.dst === p.id && rec.criado) {
            saqueNaMoedaDaMargem(rec, { ...(e.semente ? { semente: e.semente } : {}), ...(e.credito ? { credito: e.credito } : {}) });
            this.flush({ ...emptyResult(), mudou: true });
          }
          break;
        default:
          break;
      }
    }
    if (p.targetId !== undefined) this.gameEvent({ t: 'control', controle: 'alvo_automatico' }, true);
    this.checkTelegraphs(p);
    if (this.w.tick % PLACE_CHECK_TICKS === 0) this.checkPlaces(p);
  }

  /** Aviso no chão que acabou com o jogador perto e de pé: desviou. */
  private checkTelegraphs(p: Entity): void {
    const live = new Set<number>();
    for (const t of this.w.telegraphs) {
      live.add(t.id);
      const near = Math.hypot(t.x - p.x, t.y - p.y) <= t.radius + 2;
      const s = this.telSeen.get(t.id);
      if (!s) this.telSeen.set(t.id, { x: t.x, y: t.y, r: t.radius, near });
      else s.near ||= near;
    }
    for (const [id, s] of this.telSeen) {
      if (live.has(id)) continue;
      this.telSeen.delete(id);
      const inside = Math.hypot(s.x - p.x, s.y - p.y) <= s.r;
      if (s.near && !inside && !p.dead && p.hp > 0) this.gameEvent({ t: 'control', controle: 'desviar_aviso' }, true);
    }
  }

  /** Lugares, regiões, alvos de 'interagir', saída da travessia e o 'reanimar' do tutorial. */
  private checkPlaces(p: Entity): void {
    const rec = this.rec!;
    const map = this.w.map;
    // lugar mais perto no raio
    let place: string | null = null;
    let bd = Infinity;
    for (const m of map.markers) {
      if (m.kind !== 'lugar' || !m.ref || m.params?.['interagir'] !== undefined) continue;
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      if (d <= PLACE_RADIUS && d < bd) {
        bd = d;
        place = m.ref;
      }
    }
    if (place !== rec.lugar_atual) this.gameEvent({ t: 'arrive', placeId: place });
    // região
    const reg = map.regions.find((r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h);
    const regionId = reg?.regionId ?? null;
    if (regionId !== this.regionNow) {
      this.regionNow = regionId;
      if (regionId) this.gameEvent({ t: 'arrive', regionId });
    }
    // alvos de 'interagir' do objetivo atual (a máquina de visual conta quando é usada)
    const want = new Map<string, string>();
    for (const c of currentObjectives(rec)) if (c.objetivo.tipo === 'interagir') want.set(c.objetivo.alvo, c.objetivo.acao);
    for (const m of map.markers) {
      if (m.kind === 'maquina_visual') continue;
      const alvo = (m.params?.['interagir'] as string | undefined) ?? m.id;
      const acao = want.get(alvo);
      if (acao === undefined) continue;
      const near = Math.hypot(m.x - p.x, m.y - p.y) <= INTERACT_MARK_RADIUS;
      if (near && !this.nearInteract.has(m.id)) this.gameEvent({ t: 'interact', alvo, acao });
      if (near) this.nearInteract.add(m.id);
      else this.nearInteract.delete(m.id);
    }
    // saída da travessia no cais: o barco sai com o Seu Jacó (a escolha é no barco, na altura da ponte)
    let exitNear = false;
    for (const m of map.markers) {
      if (m.kind !== 'saida' || m.params?.['travessia'] !== true) continue;
      if (Math.hypot(m.x - p.x, m.y - p.y) <= INTERACT_MARK_RADIUS) {
        exitNear = true;
        // SUGESTÃO: aviso de quem chega no barco sem falar com o Seu Jacó.
        if (!this.nearExit && canBoard(rec).ok) this.aviso('Fale com o Seu Jacó para embarcar.');
      }
    }
    this.nearExit = exitNear;
    // Fase 3: objetivo 'sobreviver' conta 1 s a cada segundo de pé
    // SUGESTÃO: no servidor local conta em qualquer lugar do mapa (sem conferir o lugar da missão).
    if (!p.dead && p.hp > 0 && currentObjectives(rec).some((c) => c.objetivo.tipo === 'sobreviver')) {
      this.surviveTicks += PLACE_CHECK_TICKS;
      if (this.surviveTicks >= TICK_RATE) {
        this.surviveTicks -= TICK_RATE;
        this.gameEvent({ t: 'survive', segundos: 1 });
      }
    } else this.surviveTicks = 0;
    // Fase 3: saídas entre os mapas (margens, Usina da Ponte, Juncal, barco de volta ao Delta)
    // (na masmorra a escada e a saída são do andar: dungeonTick)
    if (!this.floorSt && this.checkExits(p)) return;
    // tutorial do 'reanimar': ficar 3 s ao lado do Seu Jacó
    const wantsRevive = currentObjectives(rec).some((c) => c.objetivo.tipo === 'usar_controle' && c.objetivo.controle === 'reanimar');
    if (wantsRevive) {
      const jaco = [...this.w.entities.values()].some((n) => n.kind === 'npc' && n.defId === 'seu_jaco' && Math.hypot(n.x - p.x, n.y - p.y) <= REVIVE_TUTORIAL_RADIUS);
      this.reviveTicks = jaco ? this.reviveTicks + PLACE_CHECK_TICKS : 0;
      if (this.reviveTicks >= REVIVE_TUTORIAL_TICKS) {
        this.reviveTicks = 0;
        this.gameEvent({ t: 'control', controle: 'reanimar' });
      }
    } else this.reviveTicks = 0;
  }

  /**
   * Saídas do mapa: perto de uma (e já armada), troca de mapa. Quem já atravessou e volta ao cais
   * do Delta pega o barco de volta para a margem dele. Devolve true se trocou.
   */
  private checkExits(p: Entity): boolean {
    const rec = this.rec!;
    if (this.fixedMap || !rec.criado) return false;
    for (const m of this.w.map.markers) {
      if (m.kind !== 'saida') continue;
      const near = Math.hypot(m.x - p.x, m.y - p.y) <= EXIT_RADIUS;
      if (!near) {
        this.exitsDisarmed.delete(m.id);
        continue;
      }
      if (this.exitsDisarmed.has(m.id)) continue;
      const params = (m.params ?? {}) as Record<string, unknown>;
      let to: string | undefined;
      let spawnId: string | undefined;
      if (params['travessia'] === true) {
        // a travessia de verdade é pela tela; quem já é da margem só volta para casa
        if (rec.stage !== 'margem' || !rec.side) continue;
        to = ARRIVAL_MAP_BY_SIDE[rec.side];
        spawnId = 'spawn';
      } else {
        to = typeof params['para'] === 'string' ? params['para'] : m.ref;
        spawnId = typeof params['spawn'] === 'string' ? params['spawn'] : undefined;
      }
      if (!to || !hasMap(to)) continue;
      // o Delta é de quem ainda não atravessou ou de quem vai visitar de barco
      this.changeMap(to, spawnId);
      return true;
    }
    return false;
  }

  /** Evento de jogo no registro; `once` = controle que só conta a primeira vez. */
  private gameEvent(ev: GameEvent, once = false): void {
    const rec = this.rec;
    if (!rec || !rec.criado) return;
    // controle que um objetivo atual conta (ex.: "toque num inimigo" 0/2) passa sempre, como no
    // servidor online; sem isso o 2º toque era descartado e a missão do Delta parava em 1/2
    const counted =
      ev.t === 'control' && currentObjectives(rec).some((c) => c.objetivo.tipo === 'usar_controle' && c.objetivo.controle === ev.controle);
    if (once && !counted && ev.t === 'control' && rec.tutorial.controles.includes(ev.controle)) return;
    // controle que não mudou nada (fora do Delta o registro não guarda) não volta até a próxima
    // missão aceita: sem isso, o alvo automático mandaria perfil e gravaria o registro a cada tick
    const key = once && !counted && ev.t === 'control' ? ev.controle : null;
    if (key !== null && this.onceSent.has(key)) return;
    const r = onGameEvent(rec, ev);
    if (key !== null && !r.mudou) this.onceSent.add(key);
    this.flush(r);
  }

  // ---------------------------------------------------------------------------
  // Fase 2: mensagens do cliente

  private onGameMsg(type: string, msg: unknown): void {
    const rec = this.rec;
    const p = this.player;
    if (!rec || !p) return;
    const m = (msg ?? {}) as Record<string, unknown>;
    switch (type) {
      case GAME_MSG.criarPersonagem: {
        const c = m as unknown as C2S_CriarPersonagem;
        const r = createCharacter(rec, c.name, c.appearance);
        if (!r.ok) return this.aviso(r.erro, 'erro');
        this.devPrepTravessia();
        const dev = this.applyDevPrep();
        if (dev) {
          // dev: personagem pronto (nível, margem): nasce de novo no mapa pedido
          const to = this.mapFor(rec);
          this.loadMap(to);
          this.player = undefined;
          this.spawnFromRecord();
          this.sendWelcome();
          mergeResult(r.resultado, dev);
          this.flush(r.resultado, { always: true });
          this.syncCity();
          break;
        }
        this.flush(r.resultado, { always: true });
        break;
      }
      case GAME_MSG.maquinaVisual: {
        const c = m as unknown as C2S_MaquinaVisual;
        const where = { map: this.w.map, x: p.x, y: p.y };
        const id = c.maquina ?? nearVisualMachine(where);
        if (!id) return this.aviso('Chegue perto da Máquina de Visual.', 'erro');
        const r = applyVisualMachine(rec, c.change ?? {}, id, where);
        if (!r.ok) return this.aviso(r.erro, 'erro');
        this.flush(onGameEvent(rec, { t: 'interact', alvo: id, acao: 'usar' }), { always: true });
        break;
      }
      case GAME_MSG.falar: {
        const c = m as C2S_Falar;
        // Fase 3: o guia está sempre junto (sem entidade no mundo)
        if (typeof c.npcId === 'string' && guideOf(rec) && isOwnGuide(rec, c.npcId)) {
          const t = talkTo(rec, c.npcId);
          this.outbox.push([GAME_MSG.dialogo, t.dialogo as S2C_Dialogo]);
          this.flush(t.resultado, { always: true });
          break;
        }
        const npc = npcInReach(this.w, p, { ...(typeof c.entity === 'number' ? { entity: c.entity } : {}), ...(typeof c.npcId === 'string' ? { npcId: c.npcId } : {}) });
        if (!npc) return this.aviso('Chegue mais perto para conversar.', 'erro');
        const t = talkTo(rec, npc.defId);
        const d: S2C_Dialogo = t.dialogo;
        this.outbox.push([GAME_MSG.dialogo, d]);
        this.flush(t.resultado, { always: true });
        break;
      }
      case GAME_MSG.dialogoOpcao: {
        const c = m as unknown as C2S_DialogoOpcao;
        // travessia: no Delta, "Embarcar" leva para o barco; no barco, abre a escolha na altura da ponte
        if (String(c.npcId) === 'seu_jaco' && String(c.opcao) === 'travessia' && canBoard(rec).ok) {
          if (this.boat) {
            // SUGESTÃO: texto do Seu Jacó antes da ponte.
            if (this.boat.fase === 'escolha') this.outbox.push([GAME_MSG.travessiaOpcoes, travessiaOptions(rec)]);
            else if (this.boat.fase === 'viagem') this.aviso('Calma, que a ponte já vem. Aproveita a vista.');
            break;
          }
          if (!npcInReach(this.w, p, { npcId: 'seu_jaco' })) return this.aviso('Vá até o cais: o Seu Jacó leva no barco.', 'erro');
          this.embark();
          break;
        }
        const r = dialogOption(rec, String(c.npcId), String(c.opcao));
        if (!r.ok) return this.aviso(r.erro ?? 'Opção indisponível.', 'erro');
        if (r.abrir?.tela === 'travessia') this.outbox.push([GAME_MSG.travessiaOpcoes, r.abrir.opcoes]);
        else if (r.abrir) {
          const d: S2C_Dialogo = { npc: String(c.npcId), nome: '', contexto: 'abrir', fala: '', opcoes: [], abrir: r.abrir };
          this.outbox.push([GAME_MSG.dialogo, d]);
        }
        this.flush(r.resultado, { always: true });
        break;
      }
      case GAME_MSG.missaoAceitar: {
        const c = m as unknown as C2S_MissaoAceitar;
        const r = acceptMission(rec, String(c.id));
        if (!r.ok) return this.aviso(r.erro, 'erro');
        this.flush(r.resultado, { always: true });
        break;
      }
      case GAME_MSG.travessia: {
        const c = m as unknown as C2S_Travessia;
        const choice = { side: String(c.side), institution: String(c.institution), guide: String(c.guide) };
        if (this.boat) {
          // no barco: só na altura da ponte; depois vem a aula e o barco chega no cais (boatTickNow)
          if (this.boat.fase !== 'escolha') return this.aviso('A escolha é na altura da ponte.', 'erro');
          const r = applyTravessia(rec, choice);
          if (!r.ok) return this.aviso(r.erro, 'erro');
          // o kit da classe entra na entidade (os botões 1 a 3 e o Especial)
          this.flush(r.resultado, { always: true });
          this.applyBoat(boatOnChosen(this.boat, rec, this.w.tick));
          break;
        }
        if (!this.opts.atalhoTravessia) {
          const cb = canBoard(rec);
          return this.aviso(cb.ok ? 'Fale com o Seu Jacó para embarcar.' : cb.erro, 'erro');
        }
        // atalho de teste: a travessia direta, sem o barco
        const r = applyTravessia(rec, choice);
        if (!r.ok) return this.aviso(r.erro, 'erro');
        // troca de mapa: o QG da margem escolhida
        this.mapOverride = undefined;
        const to = this.mapFor(rec);
        if (to !== this.mapId) this.loadMap(to);
        this.player = undefined;
        this.spawnFromRecord();
        this.sendWelcome();
        this.flush(r.resultado, { always: true });
        // Fase 4: a moradia inicial da margem
        this.syncCity();
        break;
      }
      case GAME_MSG.tutorialPasso: {
        const c = m as C2S_TutorialPasso;
        if (typeof c.controle === 'string') this.gameEvent({ t: 'control', controle: c.controle }, true);
        if (typeof c.passo === 'string') this.gameEvent({ t: 'tutorial', passo: c.passo });
        break;
      }
      // ---- Fase 3 ----
      case GAME_MSG.progressoOpcoes:
        this.outbox.push([GAME_MSG.progressoInfo, progressOptions(rec)]);
        break;
      case GAME_MSG.escolherAla: {
        const c = m as unknown as C2S_EscolherAla;
        const r = chooseArchetype(rec, String(c.archetype));
        if (!r.ok) return this.aviso(r.erro ?? 'Ala indisponível.', 'erro');
        this.flush(r.resultado, { always: true });
        this.outbox.push([GAME_MSG.progressoInfo, progressOptions(rec)]);
        break;
      }
      case GAME_MSG.escolherTalento: {
        const c = m as unknown as C2S_EscolherTalento;
        const r = pickTalent(rec, String(c.talent));
        if (!r.ok) return this.aviso(r.erro ?? 'Talento indisponível.', 'erro');
        this.flush(r.resultado, { always: true });
        this.outbox.push([GAME_MSG.progressoInfo, progressOptions(rec)]);
        break;
      }
      case GAME_MSG.trocarSlot3: {
        const c = m as unknown as C2S_TrocarSlot3;
        const r = setSlot3(rec, String(c.ability));
        if (!r.ok) return this.aviso(r.erro, 'erro');
        const ab = getData().abilities.get(String(c.ability));
        const res: GameResult = { ...emptyResult(), mudou: true, avisos: [`Botão 3: ${ab?.name ?? c.ability}`] };
        this.flush(res, { always: true });
        this.outbox.push([GAME_MSG.progressoInfo, progressOptions(rec)]);
        break;
      }
      case GAME_MSG.instituicao: {
        const c = m as C2S_Instituicao;
        const info = institutionInfo(rec, typeof c.id === 'string' ? c.id : rec.institution);
        if (!info) return this.aviso('Você ainda não entrou numa instituição.', 'erro');
        this.outbox.push([GAME_MSG.instituicaoInfo, info]);
        break;
      }
      case GAME_MSG.missaoPagar: {
        const c = m as C2S_MissaoPagar;
        const r = payObjective(rec, typeof c.missao === 'string' ? c.missao : undefined);
        if (!r.ok) return this.aviso(r.erro ?? 'Nada para pagar.', 'erro');
        this.flush(r.resultado, { always: true });
        break;
      }
      case GAME_MSG.emote: {
        const c = m as unknown as C2S_Emote;
        const r = useEmote(rec, String(c.emote));
        if (!r.ok) return this.aviso(r.erro, 'erro');
        if (!r.emote) return this.aviso('Emote indisponível.', 'erro');
        const e: S2C_Emote = { entity: p.id, playerId: this.token, nome: rec.name, emote: r.emote.id, texto: r.emote.texto, animacao: r.emote.animacao, quadros: r.emote.quadros };
        this.outbox.push([GAME_MSG.emote, e]);
        break;
      }
      default:
        if (this.onFase5Msg(type, m)) break;
        this.onEconomyMsg(type, m);
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // travessia de barco (game/barco.ts, as mesmas regras do servidor)

  /** Dev (?dev_travessia=1): personagem criado no Delta fica com o Bruno derrotado e no nível 8. */
  private devPrepTravessia(): void {
    const rec = this.rec;
    if (!this.opts.devTravessia || !rec || !rec.criado || rec.stage === 'margem') return;
    if (!rec.story_flags.includes(FLAG_BRUNO)) rec.story_flags.push(FLAG_BRUNO);
    raiseToLevel(rec, 8);
  }

  private devPrepDone = false;

  /**
   * Dev (?dev_nivel= e ?dev_mapa=): uma vez por sessão, com o personagem já criado. Do nível 8 em
   * diante, ou com um mapa fora do Delta, faz a travessia pelas regras de shared (Bruno derrotado,
   * nível 8, applyTravessia com a margem do mapa, a 1ª instituição e o 1º guia dela). Depois sobe ao
   * nível pedido e marca o mapa de nascimento. Devolve o resultado (undefined se não fez nada).
   */
  private applyDevPrep(): GameResult | undefined {
    const d = this.opts.devPrep;
    const rec = this.rec;
    if (!d || this.devPrepDone || !rec || !rec.criado || this.fixedMap || this.floorSt) return undefined;
    this.devPrepDone = true;
    const r = emptyResult();
    const mapa = d.mapId && DEV_MAPS.includes(d.mapId) ? d.mapId : undefined;
    const nivel = d.level !== undefined && Number.isFinite(d.level) ? Math.max(1, Math.min(60, Math.round(d.level))) : undefined;
    const sideOfMap: SideId | undefined = mapa === 'margem_direita' ? 'direita' : mapa === 'margem_esquerda' ? 'esquerda' : undefined;
    const precisaMargem = (nivel ?? 0) >= TRAVESSIA_LEVEL || (mapa !== undefined && mapa !== 'delta');
    if (precisaMargem && rec.stage !== 'margem') {
      if (!rec.story_flags.includes(FLAG_BRUNO)) rec.story_flags.push(FLAG_BRUNO);
      mergeResult(r, raiseToLevel(rec, TRAVESSIA_LEVEL));
      const side = sideOfMap ?? 'esquerda';
      const m = travessiaOptions(rec).margens.find((x) => x.side === side);
      const inst = m?.instituicoes[0];
      const guide = m?.guias[0];
      if (inst && guide) {
        const t = applyTravessia(rec, { side, institution: inst.id, guide: guide.id });
        if (t.ok) mergeResult(r, t.resultado);
      }
    }
    if (nivel !== undefined && nivel > rec.level) mergeResult(r, raiseToLevel(rec, nivel));
    // o mapa: na margem, qualquer um (o Delta também, como na volta de barco); no Delta, só o Delta
    if (mapa && rec.stage === 'margem') this.mapOverride = mapa;
    r.mudou = true;
    return r;
  }

  /** Fase do barco para o cliente. */
  private sendBoat(): void {
    if (!this.boat) return;
    const info: S2C_BarcoInfo = boatInfo(this.boat, { tick: this.w.tick, tickRate: TICK_RATE });
    this.outbox.push([GAME_MSG.barcoInfo, info]);
  }

  /** Embarca no barco do Seu Jacó: o mapa 'barco:<id>' com o personagem no convés. */
  private embark(): void {
    const rec = this.rec!;
    const b = boardBoat(rec);
    if (!b.ok) return this.aviso(b.erro, 'erro');
    this.changeRoom(boatRoomId(rec.id), undefined);
    this.flush(b.resultado, { always: true });
    this.sendBoat();
  }

  /** Troca de mapa sem 'saida' (o barco e a chegada no cais), com welcome novo. */
  private changeRoom(to: string, spawnId: string | undefined): void {
    const rec = this.rec!;
    const auto = this.player?.auto ?? rec.auto;
    this.mapOverride = undefined;
    this.loadMap(to, spawnId);
    this.player = undefined;
    this.spawnFromRecord();
    this.player!.auto = auto;
    this.sendWelcome();
  }

  /** Um tick do barco, depois do step: botões usados na aula e o passo da viagem. */
  private boatTickNow(p: Entity, ev: CombatEvent[]): void {
    const st = this.boat!;
    const rec = this.rec!;
    for (const e of ev) {
      if (e.t !== 'cast' || e.src !== p.id) continue;
      const b = boatButtonOf(p, e.ability);
      if (b) this.applyBoat(boatOnCast(st, rec, b));
    }
    if (this.boat !== st) return;
    const w = this.w;
    this.applyBoat(
      boatTick(st, rec, {
        tick: w.tick,
        tickRate: TICK_RATE,
        vivo: (id) => {
          const x = w.entities.get(id);
          return x !== undefined && !x.dead;
        },
      }),
    );
    // a contagem até a ponte, de segundo em segundo
    if (this.boat === st && st.fase === 'viagem' && (w.tick - st.inicio) % TICK_RATE === 0) this.sendBoat();
  }

  /** Faz o que o passo do barco pediu. */
  private applyBoat(actions: BoatAction[]): void {
    const st = this.boat;
    const rec = this.rec;
    if (!st || !rec || actions.length === 0) return;
    let save = false;
    for (const a of actions) {
      const p = this.player;
      if (!p) return;
      switch (a.t) {
        case 'fala':
          this.outbox.push([GAME_MSG.falaGuia, a.fala]);
          save = true;
          break;
        case 'escolha':
          this.outbox.push([GAME_MSG.travessiaOpcoes, a.opcoes]);
          break;
        case 'evento':
          this.gameEvent(a.ev);
          break;
        case 'onda': {
          let k = 0;
          for (const g of a.inimigos) {
            if (!getData().enemiesById.has(g.inimigo)) continue;
            for (let i = 0; i < g.quantidade; i++, k++) {
              const pt = boatWaveSpot(this.w.map, st.ondas * 2 + k, p);
              st.inimigos.push(spawnEnemy(this.w, g.inimigo, pt.x, pt.y, { tier: 'normal', level: g.nivel }).id);
            }
          }
          break;
        }
        case 'especial':
          // a aula começa com o Especial cheio (só no barco) e sem o automático: é com o polegar
          p.special = 1;
          p.auto = false;
          rec.auto = false;
          save = true;
          break;
        case 'chegar':
          // o barco encosta no cais da margem escolhida
          this.changeRoom(a.mapId, a.spawn);
          this.flush(refreshMissions(rec), { always: true });
          this.syncCity();
          return;
        case 'info':
          this.sendBoat();
          break;
        default:
          break;
      }
    }
    if (save) this.saveRecord();
  }

  // ---------------------------------------------------------------------------
  // Fase 5: itens, Doutrina, plantão, masmorra e painel da facção

  private onFase5Msg(type: string, m: Record<string, unknown>): boolean {
    const rec = this.rec!;
    const p = this.player!;
    const str = (v: unknown): string => (typeof v === 'string' ? v : '');
    const now = this.nowMs();
    switch (type) {
      case GAME_MSG.itensPedir:
        concluirBenzimentos(rec, now);
        this.sendItems();
        return true;
      case GAME_MSG.equipar: {
        const q = m as unknown as C2S_Equipar;
        const r = equipar(rec, str(q.itemId));
        if (!r.ok) this.aviso(r.erro, 'erro');
        else this.flush({ ...emptyResult(), mudou: true, avisos: [`Vestiu ${itemDefOf(str(q.itemId))?.def.name ?? 'o item'}.`] });
        this.sendItems();
        return true;
      }
      case GAME_MSG.desequipar: {
        const q = m as unknown as C2S_Desequipar;
        const r = desequipar(rec, str(q.slot));
        if (!r.ok) this.aviso(r.erro, 'erro');
        else this.flush({ ...emptyResult(), mudou: true });
        this.sendItems();
        return true;
      }
      case GAME_MSG.benzer: {
        const q = m as unknown as C2S_Melhorar;
        const r = benzer(rec, str(q.itemId), now, typeof q.onde === 'string' ? q.onde : undefined);
        if (!r.ok) this.aviso(r.erro, 'erro');
        else {
          const s = Math.max(0, Math.ceil(((r.prontoEm ?? now) - now) / 1000));
          // SUGESTÃO: texto do benzimento na fila
          this.flush({ ...emptyResult(), mudou: true, avisos: [s > 0 ? `Na fila da benzedeira: pronto em ${s} s. Pode usar enquanto isso.` : `Benzido: nível ${r.nivel ?? ''}.`] });
        }
        this.sendItems();
        return true;
      }
      case GAME_MSG.calibrar: {
        const q = m as unknown as C2S_Melhorar;
        const r = calibrar(rec, str(q.itemId), typeof q.onde === 'string' ? q.onde : undefined);
        if (!r.ok) this.aviso(r.erro, 'erro');
        else {
          this.flush({ ...emptyResult(), mudou: true, avisos: [`Calibrado: nível ${r.nivel ?? ''} (${r.pago ?? 0} Créditos).`] });
          this.sendWallet();
        }
        this.sendItems();
        return true;
      }
      case GAME_MSG.filtroRaridade: {
        const q = m as unknown as C2S_FiltroRaridade;
        const r = setFiltroRaridade(rec, str(q.raridade), typeof q.vendaAutomatica === 'boolean' ? q.vendaAutomatica : undefined);
        if (!r.ok) this.aviso(r.erro, 'erro');
        else {
          p.lootFilter = filtroRaridadeOf(rec);
          p.autoSell = vendaAutomaticaOf(rec);
          this.saveRecord();
        }
        this.sendItems();
        return true;
      }
      case GAME_MSG.doutrinaPedir:
        this.sendDoctrine();
        return true;
      case GAME_MSG.doutrinaDefinir: {
        const q = m as unknown as C2S_DoutrinaDefinir;
        const r = definirDoutrina(rec, q.cards, p.loadout ? { loadout: p.loadout } : {});
        if (!r.ok) this.aviso(r.erro, 'erro');
        else {
          p.doctrine = rec.doctrine.map((c) => ({ ...c }));
          this.saveRecord();
          // SUGESTÃO: texto da Doutrina salva
          this.aviso(rec.doctrine.length > 0 ? `Doutrina salva: ${rec.doctrine.length} cartas.` : 'Doutrina vazia: o automático usa a padrão do papel.');
        }
        this.sendDoctrine();
        return true;
      }
      case GAME_MSG.plantaoPedir:
        this.sendDuty();
        return true;
      case GAME_MSG.plantaoDefinir: {
        const q = m as unknown as C2S_PlantaoDefinir;
        const r = q.on ? entrarEmPlantao(rec) : sairDoPlantao(rec);
        if (!r.ok) this.aviso(r.erro, 'erro');
        else this.saveRecord();
        this.sendDuty();
        return true;
      }
      case GAME_MSG.plantaoLevar: {
        const q = m as unknown as C2S_Plantonista;
        const duty = this.dutyRecords().find((r) => r.id === str(q.plantonistaId));
        if (!duty) {
          this.aviso('Esse plantonista não está no QG.', 'erro');
          return true;
        }
        duty.level = Math.max(12, rec.level);
        const ativos = this.duty.filter((a) => a.status === 'ativo').length;
        const r = levarPlantonista(rec, duty, this.duty, { id: `duty_${++this.dutySeq}`, now, destino: this.run ? 'masmorra' : 'mapa', ...(this.run ? { runId: this.run.id } : {}), grupoAtual: 1 + ativos });
        if (!r.ok) {
          this.aviso(r.erro, 'erro');
          return true;
        }
        if (this.run) {
          const j = joinRun(this.run, { playerId: duty.id, papel: 'plantonista', nome: duty.name });
          if (!j.ok) {
            this.aviso(j.erro, 'erro');
            return true;
          }
        }
        this.duty = [...this.duty.filter((a) => a.status === 'ativo'), r.assignment];
        this.spawnDutyEntity(r.assignment, ativos);
        // SUGESTÃO: texto de quem foi levado
        this.aviso(`${duty.name} saiu do plantão e veio com você. Luta pela Doutrina dele.`);
        this.sendDuty();
        if (this.run) this.sendDungeon();
        return true;
      }
      case GAME_MSG.plantaoDispensar: {
        const q = m as unknown as C2S_Plantonista;
        const a = this.duty.find((x) => x.status === 'ativo' && x.plantonistaId === str(q.plantonistaId));
        if (!a) {
          this.aviso('Esse plantonista não está com você.', 'erro');
          return true;
        }
        if (a.entityId !== undefined) this.w.entities.delete(a.entityId);
        encerrarPlantao(a, now);
        if (this.run) leaveRun(this.run, a.plantonistaId, now);
        if (!this.duty.some((x) => x.status === 'ativo')) delete p.partyId;
        const nome = this.dutyRecs.find((r) => r.id === a.plantonistaId)?.name ?? 'O plantonista';
        // SUGESTÃO: o relatório vai para o dono (vizinho NPC no servidor local)
        this.aviso(`${nome} voltou para o QG com ${Math.round(a.ganhos.xp)} de XP no relatório.`);
        this.sendDuty();
        if (this.run) this.sendDungeon();
        return true;
      }
      case GAME_MSG.masmorraEntrar:
        this.enterDungeon(m as C2S_MasmorraEntrar);
        return true;
      case GAME_MSG.masmorraSair:
        if (this.run) this.leaveDungeon('saiu');
        else this.sendDungeon();
        return true;
      case GAME_MSG.masmorraEscolha: {
        const q = m as unknown as C2S_MasmorraEscolha;
        const st = this.floorSt;
        if (!st || !this.run) return true;
        const r = chooseDungeonEvent(this.w, st, Number(q.sala), str(q.opcao), 1);
        if (!r.ok) this.aviso(r.erro, 'erro');
        else {
          if (r.recompensas.length > 0) bankRewards(this.run, r.recompensas, this.token);
          for (const f of r.flags) if (!rec.story_flags.includes(f)) rec.story_flags.push(f);
          this.saveRecord();
        }
        this.sendDungeon();
        return true;
      }
      case GAME_MSG.faccaoPedir:
        this.outbox.push([GAME_MSG.faccaoInfo, this.factionInfo()]);
        return true;
      default:
        return false;
    }
  }

  private sendDoctrine(): void {
    const rec = this.rec;
    if (!rec) return;
    const d: S2C_DoutrinaInfo = { cards: rec.doctrine.map((c) => ({ ...c })), max: bal().combate.doutrinaCartasMax };
    this.outbox.push([GAME_MSG.doutrinaInfo, d]);
  }

  // ---------------------------------------------------------------------------
  // Fase 4: cidade, carteira, loja, feira, app, câmbio e casa (as regras de shared/game)

  /** Medidores da cidade para o preço dinâmico. */
  private priceCtx(): PrecoCtx {
    const md = this.city.medidores;
    return {
      ...(md.precoDeVidaDir !== undefined ? { precoDeVida: md.precoDeVidaDir } : {}),
      ...(md.apagaoDir !== undefined ? { apagao: md.apagaoDir } : {}),
      ...(md.chovendo !== undefined ? { chovendo: md.chovendo } : {}),
    };
  }

  private saveCity(): void {
    try {
      this.opts.cityStore?.save(this.city);
    } catch {
      // armazenamento cheio: a cidade vale só nesta aba
    }
  }

  /** Ciclos perdidos, moradia inicial e casa do mutirão (ao entrar e depois da travessia). */
  private syncCity(): void {
    const rec = this.rec;
    if (!rec || !rec.criado) return;
    const s = sincronizarComCidade(rec, this.city);
    if (!s.mudou) return;
    this.flush({ ...emptyResult(), mudou: true, avisos: s.avisos });
    this.sendWallet();
  }

  /** A cada segundo: vence anúncios, vira o ciclo (aluguel, lista de espera) e repõe os anúncios dos NPC. */
  private cityTick(): void {
    const rec = this.rec;
    const now = this.nowMs();
    const t = tickCidade(this.city, now, rec && rec.criado ? [rec] : []);
    if (rec && t.mudaram.includes(rec.id)) {
      this.flush({ ...emptyResult(), mudou: true, avisos: t.porJogador[rec.id] ?? [] });
      this.sendWallet();
    }
    const seeded = this.seedMarket(now);
    // Fase 5: IA de facção (ciclos vencidos), medidores da cidade e do combate, benzimentos prontos
    this.factionTick(now);
    if (t.ciclosNovos > 0 || t.anunciosVencidos > 0 || seeded) this.saveCity();
    if (rec && rec.criado) {
      const prontos = concluirBenzimentos(rec, now);
      if (prontos.length > 0) {
        // SUGESTÃO: aviso do benzimento pronto
        this.flush({ ...emptyResult(), mudou: true, avisos: prontos.map((id) => `A benzedeira terminou: ${itemDefOf(id)?.def.name ?? id} subiu de nível.`) });
        this.sendItems();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Fase 5: IA de facção, influência e pontos de controle

  private avisoMapa(ev: WorldEvent): void {
    const a: S2C_AvisoMapa = {
      id: ev.id,
      tipo: ev.tipo,
      texto: ev.texto,
      ...(ev.lado ? { lado: ev.lado } : {}),
      ...(ev.lider ? { lider: ev.lider } : {}),
      ...(ev.regiao ? { regiao: ev.regiao } : {}),
      ...(ev.ponto ? { ponto: ev.ponto } : {}),
    };
    this.outbox.push([GAME_MSG.avisoMapa, a]);
  }

  private saveFaction(): void {
    this.faccaoDirty = false;
    try {
      this.opts.factionStore?.save(this.faccao);
    } catch {
      // armazenamento cheio: a facção vale só nesta aba
    }
  }

  /** Roda os ciclos vencidos da IA de facção e liga os medidores na cidade e no combate. */
  private factionTick(now: number): void {
    const r = tickFaccao(this.faccao, now, createRng(sementeDoTick(this.seed, this.faccao.ciclo)));
    this.faccao = r.estado;
    if (r.ticks > 0) {
      for (const ev of r.eventos) this.avisoMapa(ev);
      this.faccaoDirty = true;
    }
    aplicarFaccaoNaCidade(this.city, this.faccao);
    this.w.regionState = regionStateParaCombate(this.faccao);
    if (this.faccaoDirty) this.saveFaction();
  }

  /** Gancho de jogo: soma influência da margem do jogador na região onde ele está. */
  private influence(fonte: FonteInfluencia, qtd: number): void {
    const rec = this.rec;
    const regiao = this.floorSt?.floor.layout.map.regions[0]?.regionId ?? this.regionNow;
    if (!rec?.side || !regiao || qtd <= 0 || !this.faccao.regioes[regiao]) return;
    const s = somarInfluencia(this.faccao, { fonte, lado: rec.side, regiao, qtd });
    this.faccao = s.estado;
    for (const ev of s.eventos) this.avisoMapa(ev);
    this.faccaoDirty = true;
  }

  private factionInfo(): S2C_FaccaoInfo {
    const e = this.faccao;
    const now = this.nowMs();
    const evs = e.eventos.slice(-10).reverse();
    return {
      ciclo: e.ciclo,
      proximoTickEm: e.proximoTickEm,
      agora: now,
      lideres: (['esquerda', 'direita'] as const).map((lado) => {
        const l = liderDe(lado);
        return { lado, id: l.id, nome: l.name };
      }),
      regioes: Object.entries(e.regioes).map(([id, r]) => ({
        id,
        nome: nomeDaRegiao(id),
        energia: Math.round(r.energia),
        poluicao: Math.round(r.poluicao * 10) / 10,
        apagao: regionStateParaCombate(e)[id]?.apagao ?? false,
        influencia: { esquerda: Math.round(r.influencia.esquerda), direita: Math.round(r.influencia.direita) },
      })),
      pontos: Object.values(e.pontos).map((pt) => ({
        id: pt.id,
        nome: nomeDoPonto(pt.id),
        regiao: pt.regiao,
        dono: pt.dono,
        influencia: { esquerda: Math.round(pt.influencia.esquerda * 10) / 10, direita: Math.round(pt.influencia.direita * 10) / 10 },
        saqueDisponivel: saqueDisponivel(e, pt.id),
      })),
      eventos: evs.map((ev) => ({
        id: ev.id,
        tipo: ev.tipo,
        texto: ev.texto,
        ...(ev.lado ? { lado: ev.lado } : {}),
        ...(ev.lider ? { lider: ev.lider } : {}),
        ...(ev.regiao ? { regiao: ev.regiao } : {}),
        ...(ev.ponto ? { ponto: ev.ponto } : {}),
      })),
      limiar: LIMIAR_DONO,
    };
  }

  // ---------------------------------------------------------------------------
  // Fase 5: itens

  private sendItems(): void {
    const rec = this.rec;
    if (rec) this.outbox.push([GAME_MSG.itensInfo, itensView(rec)]);
  }

  // ---------------------------------------------------------------------------
  // Fase 5: masmorra (Galerias da Usina)

  private dungeonInfo(): S2C_MasmorraInfo {
    const run = this.run;
    const st = this.floorSt;
    if (!run || !st) return { ativa: false };
    const f = st.floor;
    const evRoom = st.rooms.find((r) => r.esperandoEscolha);
    const tpl = evRoom ? f.templates[evRoom.idx] : null;
    const bossName = f.boss ? (getData().enemiesById.get(f.boss)?.name ?? f.boss) : undefined;
    return {
      ativa: true,
      runId: run.id,
      dungeonId: run.dungeonId,
      seed: run.seed,
      andar: run.andar,
      nome: f.name,
      mapId: f.layout.map.id,
      escadaAberta: st.escadaAberta,
      escada: { x: f.layout.stairs.x, y: f.layout.stairs.y },
      saida: { x: f.layout.exit.x, y: f.layout.exit.y },
      ...(f.boss && bossName ? { chefe: { inimigo: f.boss, nome: bossName, vencido: st.bossVencido } } : {}),
      salas: f.layout.rooms.map((r, i) => ({ idx: r.idx, tipo: r.tipo, nome: r.name, ativa: st.rooms[i]?.ativa ?? false, limpa: st.rooms[i]?.limpa ?? false })),
      ...(evRoom && tpl?.evento ? { evento: { sala: evRoom.idx, opcoes: tpl.evento.opcoes.map((o) => ({ id: o.id, texto: o.texto })) } } : {}),
      grupo: run.grupo.filter((m) => !m.saiu).map((m) => ({ nome: m.nome ?? m.playerId, papel: m.papel })),
      guardadas: (run.recompensas[this.token] ?? []).length,
      andarMaisFundo: run.andarMaisFundo,
    };
  }

  private sendDungeon(extra: Partial<S2C_MasmorraInfo> = {}): void {
    this.outbox.push([GAME_MSG.masmorraInfo, { ...this.dungeonInfo(), ...extra }]);
  }

  /** Entra nas Galerias perto do marcador da masmorra (grupo: o jogador e os plantonistas levados). */
  private enterDungeon(m: C2S_MasmorraEntrar): void {
    const rec = this.rec!;
    const p = this.player!;
    if (this.run) return this.aviso('Você já está na masmorra.', 'erro');
    if (rec.stage !== 'margem') return this.aviso('As Galerias são depois da travessia.', 'erro');
    const mk = this.w.map.markers.find((x) => x.kind === 'masmorra');
    if (!this.fixedMap && (!mk || Math.hypot(mk.x - p.x, mk.y - p.y) > DUNGEON_ENTER_RADIUS)) return this.aviso('Chegue na entrada das Galerias.', 'erro');
    const dungeonId = typeof m.dungeonId === 'string' && m.dungeonId ? m.dungeonId : (mk?.ref ?? undefined);
    const grupo = [
      { playerId: this.token, papel: 'jogador' as const, nome: rec.name },
      ...this.duty.filter((a) => a.status === 'ativo').map((a) => ({ playerId: a.plantonistaId, papel: 'plantonista' as const, nome: this.dutyRecs.find((r) => r.id === a.plantonistaId)?.name ?? a.plantonistaId })),
    ];
    // semente da run: determinística pelo relógio do servidor local (nada de Math.random)
    const seed = (Math.imul(this.seed ^ 0x51ed27, 2654435761) + this.ticksTotal * 7919 + ++this.runSeq) >>> 0;
    const atalho = m.atalho ? shortcutOf(rec, dungeonId) : 0;
    const r = createDungeonRun({ id: `run_${this.token}_${this.runSeq}`, ...(dungeonId ? { dungeonId } : {}), seed, grupo, now: this.nowMs(), ...(atalho > 0 ? { atalho } : {}) });
    if (!r.ok) return this.aviso(r.erro, 'erro');
    this.run = r.run;
    for (const a of this.duty) if (a.status === 'ativo') {
      a.destino = 'masmorra';
      a.runId = r.run.id;
    }
    this.returnTo = { mapId: this.mapId, x: mk?.x ?? p.x, y: (mk?.y ?? p.y) - 1.5 };
    this.enterFloor();
    // SUGESTÃO: texto de entrada
    this.aviso(`${this.floorSt?.floor.name ?? 'Galerias'}: andar ${this.run.andar}. Sem fundo, sem pressa, sem Wi-Fi.`, 'missao');
  }

  /** Monta o andar atual da run e põe o grupo na entrada. */
  private enterFloor(): void {
    const run = this.run!;
    const auto = this.player?.auto ?? this.rec!.auto;
    const floor = runFloor(run);
    this.loadMap(floor.layout.map);
    this.floorSt = startDungeonFloor(floor);
    this.exitArmed = false;
    this.wipeTicks = 0;
    this.player = undefined;
    this.spawnFromRecord();
    this.player!.auto = auto;
    this.sendDungeon();
    this.sendWelcome();
    this.flush(refreshMissions(this.rec!), { always: true });
  }

  /** Depois do step, dentro da masmorra: salas, ondas, escada, saída e grupo caído. */
  private dungeonTick(p: Entity): void {
    const run = this.run;
    const st = this.floorSt;
    const rec = this.rec!;
    if (!run || !st) return;
    const D = getData();
    let changed = false;
    for (const e of tickDungeonFloor(this.w, st, { players: 1 })) {
      switch (e.t) {
        case 'sala_ativa':
          changed = true;
          break;
        case 'chefe':
          // SUGESTÃO: avisos da masmorra
          this.aviso(`Chefe: ${D.enemiesById.get(e.inimigo)?.name ?? e.inimigo}! Olhe o chão.`, 'missao');
          changed = true;
          break;
        case 'tesouro':
          bankRewards(run, e.recompensas, this.token);
          this.aviso('Tesouro guardado. Você recebe ao sair.', 'missao');
          changed = true;
          break;
        case 'evento':
          changed = true;
          break;
        case 'descanso':
          this.aviso('Descanso: vida e recurso de volta.');
          changed = true;
          break;
        case 'escada_aberta':
          this.aviso('A escada abriu! Desça quando quiser.', 'missao');
          changed = true;
          break;
        case 'chefe_vencido':
          this.aviso(`${D.enemiesById.get(e.inimigo)?.name ?? 'O chefe'} caiu!`, 'missao');
          changed = true;
          break;
        case 'sala_limpa':
          changed = true;
          break;
        default:
          break;
      }
    }
    if (changed) this.sendDungeon();
    // escada: desce um andar (guarda as recompensas do andar vencido)
    if (atStairs(this.w, st)?.id === p.id) {
      const andar = run.andar;
      advanceFloor(run, { primeiraVez: firstBossClear(rec, andar, run.dungeonId) });
      this.aviso(`Andar ${andar} vencido. Descendo para o ${run.andar}º.`, 'missao');
      this.enterFloor();
      return;
    }
    // saída: só depois de se afastar dela uma vez
    const ex = st.floor.layout.exit;
    if (Math.hypot(ex.x - p.x, ex.y - p.y) > 3) this.exitArmed = true;
    if (this.exitArmed && atExit(this.w, st)?.id === p.id) {
      this.leaveDungeon('saiu');
      return;
    }
    // grupo todo no chão por 5 s: a run falha (fica o que já foi guardado)
    this.wipeTicks = partyWiped(this.w) ? this.wipeTicks + 1 : 0;
    if (this.wipeTicks >= DUNGEON_WIPE_TICKS) this.leaveDungeon('falhou');
  }

  /** Sai da masmorra: entrega o guardado e volta para a entrada das Galerias. */
  private leaveDungeon(fim: 'saiu' | 'falhou'): void {
    const run = this.run;
    const rec = this.rec!;
    if (!run) return;
    const now = this.nowMs();
    if (fim === 'falhou') failRun(run, now);
    else leaveRun(run, this.token, now);
    const r = claimRunRewards(rec, run);
    const fundo = run.andarMaisFundo;
    this.run = null;
    this.floorSt = null;
    for (const a of this.duty) if (a.status === 'ativo') {
      a.destino = 'mapa';
      delete a.runId;
    }
    const back = this.returnTo ?? { mapId: 'usina_da_ponte', x: 48, y: 45 };
    this.returnTo = null;
    const auto = this.player?.auto ?? rec.auto;
    this.loadMap(back.mapId, undefined, { x: back.x, y: back.y });
    this.player = undefined;
    this.spawnFromRecord();
    this.player!.auto = auto;
    this.sendDungeon({ ativa: false, fim, andarMaisFundo: fundo });
    this.sendWelcome();
    // SUGESTÃO: textos da volta
    r.avisos.unshift(fim === 'falhou' ? `O grupo caiu no ${run.andar}º andar. Ficou o que já estava guardado.` : `Você saiu das Galerias. Mais fundo: ${fundo}º andar.`);
    this.flush(r, { always: true });
    this.sendItems();
  }

  /** Repõe os anúncios dos vizinhos NPC na feira e no app. Devolve true se anunciou. */
  seedMarket(now = this.nowMs()): boolean {
    const m = this.city.mercado;
    let any = false;
    for (const mercado of ['feira', 'app'] as const) {
      const v = NPC_SELLERS[mercado];
      const ativos = m.anuncios.filter((a) => a.mercado === mercado && a.vendedor === v.id && a.expiraEm > now).length;
      if (ativos >= NPC_LISTINGS_MIN) continue;
      // o que o vizinho ganhou fica com ele (ninguém recebe)
      delete m.pendencias[v.id];
      const seller = newPlayerRecord(v.id, v.name);
      seller.criado = true;
      seller.stage = 'margem';
      seller.side = v.side;
      for (const g of v.bens.slice(0, NPC_LISTINGS_MIN - ativos)) {
        darBem(seller, g.bem);
        const r = mercado === 'feira' ? anunciarFeira(m, seller, { bem: g.bem, preco: g.preco }, now) : anunciarApp(m, seller, { bem: g.bem, preco: g.preco }, now);
        if (r.ok) any = true;
      }
    }
    return any;
  }

  private sendWallet(): void {
    const rec = this.rec;
    if (!rec) return;
    this.outbox.push([GAME_MSG.carteira, { ...carteiraView(rec), inventario: [...rec.inventory] }]);
  }

  private sendMarket(mercado: MercadoId): void {
    const rec = this.rec;
    if (rec) this.outbox.push([GAME_MSG.mercadoInfo, mercadoView(this.city.mercado, mercado, rec, this.nowMs())]);
  }

  private sendExchange(q?: { de: Moeda; quantidade: number }): void {
    const rec = this.rec;
    if (!rec) return;
    const ctx = this.city.medidores;
    const info: S2C_CambioInfo = { taxa: exchangeRate(this.city.cambio, ctx), usadoCiclo: economiaOf(rec).cambioCiclo, ...(q && q.quantidade > 0 ? { cotacao: cotarTroca(this.city.cambio, q.de, q.quantidade, ctx) } : {}) };
    this.outbox.push([GAME_MSG.cambioInfo, info]);
  }

  private sendHouse(): void {
    const rec = this.rec;
    if (rec) this.outbox.push([GAME_MSG.casaInfo, casaView(rec, false)]);
  }

  /** Fim de uma operação: resultado curto; se deu certo, salva e manda perfil e carteira. */
  private econDone(acao: string, r: { ok: boolean; erro?: string }, texto?: string, extra: Partial<S2C_EconomiaResultado> = {}): boolean {
    const out: S2C_EconomiaResultado = { acao, ok: r.ok, ...(r.ok ? {} : { erro: r.erro ?? 'Não deu.' }), ...(r.ok && texto ? { texto } : {}), ...extra };
    this.outbox.push([GAME_MSG.economiaResultado, out]);
    if (r.ok) {
      this.flush({ ...emptyResult(), mudou: true });
      this.sendWallet();
      this.saveCity();
    }
    return r.ok;
  }

  private onEconomyMsg(type: string, m: Record<string, unknown>): void {
    const rec = this.rec!;
    const c = this.city;
    const now = this.nowMs();
    const str = (v: unknown): string => (typeof v === 'string' ? v : '');
    const moeda = (v: unknown): Moeda | undefined => (v === 'semente' || v === 'credito' ? v : undefined);
    const rot = (v: unknown): Rotacao | undefined => (v === 0 || v === 1 || v === 2 || v === 3 ? v : undefined);
    switch (type) {
      case GAME_MSG.carteiraPedir:
        this.sendWallet();
        break;
      case GAME_MSG.dividaPagar: {
        const r = pagarDivida(rec);
        this.econDone(type, r, r.ok ? (r.resta > 0 ? `Pagou ${r.pago} Créditos. Ainda faltam ${r.resta}.` : `Dívida quitada: ${r.pago} Créditos.`) : undefined);
        if (r.ok) this.sendHouse();
        break;
      }
      case GAME_MSG.lojaComprar: {
        const q = m as unknown as C2S_LojaComprar;
        const mo = moeda(q.moeda);
        const r = comprarNaLoja(rec, str(q.loja), str(q.item), { mercado: c.mercado, ctx: this.priceCtx(), ...(mo ? { moeda: mo } : {}) });
        this.econDone(type, r, r.resultado.avisos.join(' '));
        break;
      }
      case GAME_MSG.lojaVender: {
        const q = m as unknown as C2S_LojaVender;
        const mo = moeda(q.moeda);
        const r = venderNaLoja(rec, str(q.loja), str(q.item), { mercado: c.mercado, ...(mo ? { moeda: mo } : {}) });
        this.econDone(type, r, r.resultado.avisos.join(' '));
        break;
      }
      case GAME_MSG.mercadoListar: {
        const q = m as unknown as C2S_MercadoListar;
        this.sendMarket(q.mercado === 'app' ? 'app' : 'feira');
        break;
      }
      case GAME_MSG.feiraAnunciar: {
        const q = m as unknown as C2S_FeiraAnunciar;
        const r = anunciarFeira(c.mercado, rec, { bem: q.bem, ...(typeof q.preco === 'number' ? { preco: q.preco } : {}), ...(Array.isArray(q.trocaPor) ? { trocaPor: q.trocaPor } : {}) }, now);
        this.econDone(type, r, r.ok && r.anuncio ? `Anunciado na feira: ${nomeDoBem(r.anuncio.bem)}${r.anuncio.preco !== null ? ` por ${r.anuncio.preco} Sementes` : ' (troca)'}.` : undefined);
        this.sendMarket('feira');
        break;
      }
      case GAME_MSG.feiraComprar: {
        const q = m as unknown as C2S_MercadoComprar;
        const r = comprarFeira(c.mercado, rec, str(q.anuncio), now);
        const nome = r.ok && r.anuncio ? nomeDoBem(r.anuncio.bem) : '';
        // SUGESTÃO: texto da compra com fila
        const texto = r.ok ? (r.entrega ? `${nome} na fila: você é o ${r.entrega.posicao}º. Retire quando ficar pronto.` : `Levou ${nome}.`) : undefined;
        this.econDone(type, r, texto, r.ok && r.entrega ? { entrega: r.entrega } : {});
        this.sendMarket('feira');
        break;
      }
      case GAME_MSG.feiraRetirar: {
        const r = retirarEntregas(c.mercado, rec, now);
        const ok = r.bens.length > 0;
        // SUGESTÃO: textos da retirada
        const texto = ok ? `Retirou: ${r.bens.map(nomeDoBem).join(', ')}.` : undefined;
        this.econDone(type, ok ? { ok: true } : { ok: false, erro: r.aguardando.length > 0 ? 'Ainda não ficou pronto. A fila anda.' : 'Nada para retirar.' }, texto);
        this.sendMarket('feira');
        break;
      }
      case GAME_MSG.appAnunciar: {
        const q = m as unknown as C2S_AppAnunciar;
        const r = anunciarApp(c.mercado, rec, { bem: q.bem, preco: Number(q.preco) }, now);
        this.econDone(type, r, r.ok && r.anuncio ? `Anunciado no app: ${nomeDoBem(r.anuncio.bem)} por ${r.anuncio.preco} Créditos.` : undefined);
        this.sendMarket('app');
        break;
      }
      case GAME_MSG.appComprar: {
        const q = m as unknown as C2S_MercadoComprar;
        const r = comprarApp(c.mercado, rec, str(q.anuncio), now);
        this.econDone(type, r, r.ok && r.anuncio ? `Comprou ${nomeDoBem(r.anuncio.bem)} por ${r.anuncio.preco} Créditos. Avalie com 5 estrelas!` : undefined);
        this.sendMarket('app');
        break;
      }
      case GAME_MSG.mercadoCancelar: {
        const q = m as unknown as C2S_MercadoCancelar;
        const a = c.mercado.anuncios.find((x) => x.id === str(q.anuncio));
        const r = cancelarAnuncio(c.mercado, rec, str(q.anuncio));
        this.econDone(type, r, a ? `Anúncio cancelado: ${nomeDoBem(a.bem)} voltou.` : undefined);
        this.sendMarket(a?.mercado ?? (rec.side === 'direita' ? 'app' : 'feira'));
        break;
      }
      case GAME_MSG.mercadoReceber: {
        const p = receberPendencias(c.mercado, rec);
        const partes: string[] = [];
        if (p) {
          if (p.semente > 0) partes.push(`${p.semente} Sementes`);
          if (p.credito > 0) partes.push(`${p.credito} Créditos`);
          if (p.bens.length > 0) partes.push(p.bens.map(nomeDoBem).join(', '));
        }
        this.econDone(type, p ? { ok: true } : { ok: false, erro: 'Nada a receber.' }, p ? `Recebeu: ${partes.join(', ') || 'avisos'}.` : undefined);
        if (p) for (const t of p.avisos) this.aviso(t);
        this.sendMarket(rec.side === 'direita' ? 'app' : 'feira');
        break;
      }
      case GAME_MSG.cambioCotar: {
        const q = m as unknown as C2S_CambioCotar;
        const de = moeda(q.de) ?? (rec.side === 'direita' ? 'credito' : 'semente');
        this.sendExchange({ de, quantidade: Number(q.quantidade ?? 0) || 0 });
        break;
      }
      case GAME_MSG.cambioTrocar: {
        const q = m as unknown as C2S_CambioTrocar;
        const de = moeda(q.de);
        const r = de ? trocarMoeda(c.cambio, rec, de, Number(q.quantidade), c.medidores) : { ok: false as const, erro: 'Moeda inválida.' };
        const t = r.ok && 'troca' in r ? r.troca : undefined;
        // Fase 5: comércio na ponte soma influência (1 a cada 100 de moeda)
        if (t) this.influence('comercio', t.quantidade);
        this.econDone(type, r, t ? `Trocou ${t.quantidade} ${t.de === 'semente' ? 'Sementes' : 'Créditos'} por ${t.recebe} ${t.para === 'semente' ? 'Sementes' : 'Créditos'}.` : undefined);
        this.sendExchange();
        break;
      }
      case GAME_MSG.casaVer:
        this.sendHouse();
        break;
      case GAME_MSG.casaVisitar: {
        const q = m as unknown as C2S_CasaVisitar;
        // SUGESTÃO: no servidor local só existe a sua casa
        if (str(q.playerId) === rec.id) this.sendHouse();
        else this.econDone(type, { ok: false, erro: 'Ninguém em casa.' });
        break;
      }
      case GAME_MSG.casaComprarMovel: {
        const q = m as unknown as C2S_CasaComprarMovel;
        const mo = moeda(q.moeda);
        const r = comprarMovel(rec, str(q.movel), mo);
        let texto = r.ok ? `Comprou ${nomeDoBem({ tipo: 'movel', id: str(q.movel) })} por ${r.valor} ${r.moeda === 'semente' ? 'Sementes' : 'Créditos'}.` : undefined;
        if (r.ok && q.colocar) {
          const pc = colocarMovel(rec, str(q.movel), Number(q.colocar.x), Number(q.colocar.y), rot(q.colocar.rot) ?? 0);
          if (!pc.ok) texto += ` Ficou guardado: ${pc.erro}`;
        }
        this.econDone(type, r, texto);
        this.sendHouse();
        break;
      }
      case GAME_MSG.casaColocar: {
        const q = m as unknown as C2S_CasaColocar;
        this.econDone(type, colocarMovel(rec, str(q.movel), Number(q.x), Number(q.y), rot(q.rot) ?? 0));
        this.sendHouse();
        break;
      }
      case GAME_MSG.casaMover: {
        const q = m as unknown as C2S_CasaMover;
        this.econDone(type, moverMovel(rec, Number(q.uid), Number(q.x), Number(q.y), rot(q.rot)));
        this.sendHouse();
        break;
      }
      case GAME_MSG.casaGirar: {
        const q = m as unknown as C2S_CasaMovel;
        this.econDone(type, girarMovel(rec, Number(q.uid)));
        this.sendHouse();
        break;
      }
      case GAME_MSG.casaTirar: {
        const q = m as unknown as C2S_CasaMovel;
        this.econDone(type, tirarMovel(rec, Number(q.uid)), 'Guardado no inventário.');
        this.sendHouse();
        break;
      }
      case GAME_MSG.casaVisitas: {
        const q = m as unknown as C2S_CasaVisitas;
        let r: { ok: boolean; erro?: string } = { ok: true };
        if (q.permissao) r = definirVisitas(rec, q.permissao as PermissaoVisita);
        if (r.ok && typeof q.convidar === 'string') r = convidar(rec, q.convidar, true);
        if (r.ok && typeof q.desconvidar === 'string') r = convidar(rec, q.desconvidar, false);
        this.econDone(type, r);
        this.sendHouse();
        break;
      }
      case GAME_MSG.casaAlugar: {
        const q = m as unknown as C2S_CasaAlugar;
        const r = alugarCapsula(rec, typeof q.tipo === 'string' ? q.tipo : 'capsula', c.medidores.precoDeVidaDir);
        this.econDone(type, r, r.ok ? (r.avisos ?? []).join(' ') : undefined);
        this.sendHouse();
        break;
      }
      case GAME_MSG.casaListaEspera: {
        const r = entrarNaListaDeEspera(rec);
        this.econDone(type, r, r.ok ? `Você entrou na lista de espera: ${r.ciclos} ciclos. A Assembleia agradece a paciência.` : undefined);
        this.sendHouse();
        break;
      }
      case GAME_MSG.casaAvancarFila: {
        if (this.opts.devTools === false) {
          this.econDone(type, { ok: false, erro: 'Atalho de teste desligado.' });
          break;
        }
        const q = m as unknown as C2S_CasaAvancarFila;
        if (!rec.home?.espera) {
          this.econDone(type, { ok: false, erro: 'Você não está na lista de espera.' });
          break;
        }
        const av = avancarListaDeEspera(rec, typeof q.ciclos === 'number' && q.ciclos > 0 ? q.ciclos : Number.POSITIVE_INFINITY);
        this.econDone(type, { ok: true }, av.join(' '));
        this.sendHouse();
        break;
      }
      default:
        break;
    }
  }

  private aviso(texto: string, tipo: S2C_Aviso['tipo'] = 'info'): void {
    const a: S2C_Aviso = { texto, tipo };
    this.outbox.push([GAME_MSG.aviso, a]);
  }

  /**
   * Depois de um resultado: guarda o registro, sincroniza a entidade (nível, XP, teto, kit, visual),
   * rola os itens de tabela e manda perfil, missões e avisos.
   */
  private flush(r: GameResult, o: { always?: boolean } = {}): void {
    const rec = this.rec;
    const p = this.player;
    if (!rec || !p) return;
    if (!r.mudou && !o.always) return;
    if (r.aceitas.length > 0) this.onceSent.clear();
    // Fase 5: missão entregue soma influência da margem na região
    if (r.concluidas.length > 0) this.influence('missao', r.concluidas.length);
    for (const roll of r.itensParaRolar) this.rollTable(roll.tabela, roll.quantidade, r);
    this.syncEntity(p, rec);
    this.saveRecord();
    const objetivos = currentObjectives(rec).map((c) => c.objetivo);
    this.outbox.push([GAME_MSG.perfil, profileOf(rec, controlesLiberados(rec, objetivos))]);
    this.outbox.push([GAME_MSG.missaoEstado, missionStatus(rec, this.w.map, { x: p.x, y: p.y })]);
    const tipoDe = (t: string): S2C_Aviso['tipo'] => (/^N[íi]vel \d+/.test(t) ? 'nivel' : /^Miss[ãa]o/.test(t) ? 'missao' : 'info');
    for (const t of r.avisos) this.aviso(t, tipoDe(t));
    if (r.desbloqueios.length > 0) {
      const a: S2C_Aviso = { texto: '', desbloqueios: r.desbloqueios, tipo: 'nivel' };
      this.outbox.push([GAME_MSG.aviso, a]);
    }
    // Fase 3: falas do guia (missão aceita, bônus) vão para o balão pequeno
    for (const f of r.falasGuia ?? []) {
      const g: S2C_FalaGuia = f;
      this.outbox.push([GAME_MSG.falaGuia, g]);
    }
  }

  /** Itens de tabela de saque de recompensa de missão: um item comum (ou raro) da margem e do nível. */
  private rollTable(tabela: string, quantidade: number, r: GameResult): void {
    const D = getData();
    const rec = this.rec!;
    const t = D.loot.tabelas.find((x) => x.id === tabela);
    const raro = t ? this.w.rng.next() < (t.chancePorRaridade['raro'] ?? 0) : false;
    const pool = D.items.itens.filter(
      (it) => (it.rarity === (raro ? 'raro' : 'comum')) && (it.nivelMin ?? 1) <= rec.level + 2 && (!it.margem || it.margem === rec.side),
    );
    for (let i = 0; i < quantidade && pool.length > 0; i++) {
      const it = this.w.rng.pick(pool);
      rec.inventory.push(it.id);
      r.itens.push(it.id);
      r.avisos.push(`Item: ${it.name}`);
    }
  }

  private syncEntity(p: Entity, rec: PlayerRecord): void {
    const kit = simKitOf(rec);
    const sig = this.kitSignature(rec);
    const cur = p.archetypeId ?? p.classId ?? 'delta';
    let rekit = false;
    if (kit !== cur || sig !== this.kitSig) {
      // Fase 3: talentos e guia valem na entidade (os números fixos voltam depois do kit novo)
      const x = simSpawnExtrasOf(rec);
      if (rec.side) p.side = rec.side;
      if (x.talents) p.talents = [...x.talents];
      else delete p.talents;
      if (x.guideId) p.guideId = x.guideId;
      else delete p.guideId;
      setArchetype(this.w, p, kit, x.slot3 ?? rec.loadout.slot3_ability ?? undefined);
      this.kitSig = sig;
      rekit = true;
      // Fase 5: o kit novo zerou os atributos; o equipamento entra de novo abaixo
      delete p.equipPct;
      delete p.equipItems;
      this.equipSig = '';
    }
    if (p.level !== rec.level) {
      relevel(this.w, p, rec.level);
      rekit = true;
    }
    // applyKit troca stats.pct inteiro: os números fixos de talento e guia entram de novo
    if (rekit) applyFlatPassiveNumbers(p);
    // Fase 5: itens equipados e melhorias (troca no meio do mapa)
    const eq = simEquipOf(rec);
    const eqSig = JSON.stringify(eq ?? null);
    if (eqSig !== this.equipSig) {
      applyEquipment(p, eq);
      this.equipSig = eqSig;
    }
    p.lootFilter = filtroRaridadeOf(rec);
    p.autoSell = vendaAutomaticaOf(rec);
    if (rec.doctrine.length > 0) p.doctrine = rec.doctrine.map((c) => ({ ...c }));
    p.xp = rec.xp;
    const cap = simLevelCap(rec);
    if (cap !== undefined) p.levelCap = cap;
    else delete p.levelCap;
    if (isDeltaRookie(rec)) p.deltaRookie = true;
    else delete p.deltaRookie;
    p.look = lookOf(rec);
    p.name = rec.name;
  }

  private loadRecord(): unknown {
    try {
      return this.opts.store?.load(this.token) ?? null;
    } catch {
      return null;
    }
  }

  private saveRecord(): void {
    try {
      if (this.rec) this.opts.store?.save(this.token, this.rec);
    } catch {
      // armazenamento cheio ou bloqueado: o progresso vale só nesta aba
    }
  }

  // ---------------------------------------------------------------------------
  // snapshot

  /** lk como o servidor de jogo manda (server/src/snapshot.ts): jogador, afixos, saque, lado. */
  private lookOf(e: Entity): unknown {
    switch (e.kind) {
      case 'player':
        if (e.look) return e.look;
        return e.archetypeId ? archetypeLook(e.archetypeId, 'aprendiz') : defaultLook();
      case 'enemy':
        return e.affixes && e.affixes.length > 0 ? { affixes: [...e.affixes] } : undefined;
      case 'loot': {
        const l = e.loot ?? {};
        const s = (l.currency?.semente ?? 0) > 0, c = (l.currency?.credito ?? 0) > 0;
        const out: Record<string, unknown> = {};
        if (l.rarity) out['rarity'] = l.rarity;
        if (s || c) out['currency'] = s && c ? 'ambas' : s ? 'semente' : 'credito';
        return Object.keys(out).length > 0 ? out : undefined;
      }
      case 'summon':
        return e.side ? { side: e.side } : undefined;
      default:
        return undefined;
    }
  }

  private entSnap(e: Entity, full: boolean): EntSnap {
    const s: EntSnap = {
      i: e.id,
      k: KIND_CODE[e.kind],
      x: quantize(e.x),
      y: quantize(e.y),
      f: e.facing,
      h: e.stats.hpMax > 0 ? Math.max(0, Math.min(1000, Math.round((e.hp / e.stats.hpMax) * 1000))) : 0,
      fl: entityFlags(this.w, e),
    };
    if (e.shield > 0 && e.stats.hpMax > 0) s.sh = Math.min(1000, Math.round((e.shield / e.stats.hpMax) * 1000));
    if (e.targetId !== undefined && (e === this.player || e.tier === 'chefe')) s.tg = e.targetId;
    const lk = this.lookOf(e);
    const lkKey = lk === undefined ? '' : JSON.stringify(lk);
    if (full) {
      s.d = e.defId;
      s.n = e.name;
      s.lv = e.level;
      if (lk !== undefined) s.lk = lk;
    } else {
      if (this.sentLv.get(e.id) !== e.level) s.lv = e.level;
      if (lk !== undefined && this.sentLook.get(e.id) !== lkKey) s.lk = lk;
    }
    this.sentLv.set(e.id, e.level);
    if (lk !== undefined) this.sentLook.set(e.id, lkKey);
    return s;
  }

  private snapshot(p: Entity, ev: CombatEvent[]): S2C_Snapshot {
    const R2 = INTEREST_RADIUS * INTEREST_RADIUS;
    const ents: EntSnap[] = [];
    const seen = new Set<number>();
    for (const e of this.w.entities.values()) {
      const dx = e.x - p.x, dy = e.y - p.y;
      if (e !== p && dx * dx + dy * dy > R2) continue;
      const isNew = !this.known.has(e.id);
      ents.push(this.entSnap(e, isNew));
      seen.add(e.id);
    }
    const gone: number[] = [];
    for (const id of this.known) if (!seen.has(id)) gone.push(id);
    for (const id of gone) {
      this.known.delete(id);
      this.sentLv.delete(id);
      this.sentLook.delete(id);
    }
    for (const id of seen) this.known.add(id);
    const near = (x: number, y: number) => (x - p.x) ** 2 + (y - p.y) ** 2 <= R2;
    const snap: S2C_Snapshot = {
      t: this.w.tick,
      ack: this.lastSeq,
      cack: this.cack,
      ents,
      tel: this.w.telegraphs.filter((t) => near(t.x, t.y)).map((t) => ({ ...t })),
      zones: this.w.zones
        .filter((z) => near(z.x, z.y))
        .map((z) => ({
          i: z.id,
          a: z.abilityId,
          x: z.x,
          y: z.y,
          r: z.radius,
          e: z.endTick,
          team: z.team,
          ...(z.shape === 'cone' ? { s: 'cone' as const, ...(z.dir !== undefined ? { dir: z.dir } : {}), ...(z.angleDeg !== undefined ? { ang: z.angleDeg } : {}), ...(z.range !== undefined ? { rg: z.range } : {}) } : {}),
        })),
      ev: ev.map((e) => ({ ...e })) as CombatEvent[],
      hud: hudSnapshot(this.w, p),
    };
    if (gone.length > 0) snap.gone = gone;
    return snap;
  }

  /** Mensagens prontas para o cliente (esvazia a caixa). */
  take(): Outgoing[] {
    const out = this.outbox;
    this.outbox = [];
    return out;
  }
}
