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
 * A travessia troca de mapa (welcome novo com o mapa da margem).
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
import { ARRIVAL_MAP_BY_SIDE, findPath, getMap, hasMap, START_MAP, type TileMap } from '@pqp/shared/map';
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
  canCross,
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
} from '@pqp/shared/game/index';
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
} from '@pqp/shared/net';
import { archetypeLook, defaultLook } from '../art/character';

// SUGESTÃO: bando morto volta em 30 s; o chefe em 60 s.
export const RESPAWN_BAND_MS = 30000;
export const RESPAWN_BOSS_MS = 60000;
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

export type Outgoing = [string, unknown];

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
}

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
  }

  /** Hora da cidade em ms (relógio passado ou os ticks). */
  nowMs(): number {
    return this.opts.clock ? this.opts.clock() : this.ticksTotal * TICK_MS;
  }

  /** Monta o mundo de um mapa (no começo e na troca de mapa); `spawnId` = entrada pedida pela saída. */
  private loadMap(mapId: string, spawnId?: string): void {
    const map = this.fixedMap && this.fixedMap.id === mapId ? this.fixedMap : getMap(hasMap(mapId) ? mapId : START_MAP);
    this.mapId = map.id;
    this.w = createWorld(map, this.seed);
    this.w.pathfinder = (m, from, to, r) => findPath(m, from, to, r);
    this.groups = [];
    this.spawn = { x: 1.5, y: 1.5 };
    this.populate(map, this.noEnemies);
    // entrada: a pedida pela saída; senão o primeiro spawn_jogador (o padrão do mapa)
    const want = spawnId ? map.markers.find((m) => m.kind === 'spawn_jogador' && m.id === spawnId) : undefined;
    const first = map.markers.find((m) => m.kind === 'spawn_jogador');
    const sp = want ?? first;
    if (sp) this.spawn = { x: sp.x, y: sp.y };
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
    const want = this.mapFor(rec);
    if (!this.player || want !== this.mapId) {
      if (want !== this.mapId) this.loadMap(want);
      this.spawnFromRecord();
    }
    this.sendWelcome();
    const r = refreshMissions(rec);
    this.flush(r, { always: true });
    this.syncCity();
  }

  /** Mapa do registro: Delta até a travessia; depois o QG da margem. */
  private mapFor(rec: PlayerRecord): string {
    if (this.fixedMap) return this.fixedMap.id;
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
    }
    const stepEv = step(this.w);
    const ev = this.cmdEvents.length > 0 ? [...this.cmdEvents, ...stepEv] : stepEv;
    this.cmdEvents = [];
    this.respawns();
    if (p && this.rec) this.afterStep(p, ev);
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
      if (now - g.deadSince >= wait) this.spawnGroup(g);
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
          this.gameEvent({ t: 'kill', enemyId: en.defId, ...(en.tier ? { tier: en.tier } : {}), grupo: { personagens: 1, aoVivo: 1 } });
          break;
        }
        case 'loot_pick':
          if (e.by === p.id) {
            const l = this.w.entities.get(e.id);
            this.gameEvent({ t: 'pickup', chave: 'saque', ...(l?.defId ? { itemId: l.defId } : {}), quantidade: 1 });
            this.gameEvent({ t: 'control', controle: 'saque' }, true);
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
    // saída da travessia: chegar de barco na ponte abre a escolha da margem
    let exitNear = false;
    for (const m of map.markers) {
      if (m.kind !== 'saida' || m.params?.['travessia'] !== true) continue;
      if (Math.hypot(m.x - p.x, m.y - p.y) <= INTERACT_MARK_RADIUS) {
        exitNear = true;
        if (!this.nearExit && canCross(rec).ok) {
          this.gameEvent({ t: 'arrive', regionId: m.ref ?? 'usina_da_ponte', deBarco: true });
          this.outbox.push([GAME_MSG.travessiaOpcoes, travessiaOptions(rec)]);
        }
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
    if (this.checkExits(p)) return;
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
    if (once && ev.t === 'control' && rec.tutorial.controles.includes(ev.controle)) return;
    // controle que não mudou nada (fora do Delta o registro não guarda) não volta até a próxima
    // missão aceita: sem isso, o alvo automático mandaria perfil e gravaria o registro a cada tick
    const key = once && ev.t === 'control' ? ev.controle : null;
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
        const r = applyTravessia(rec, { side: String(c.side), institution: String(c.institution), guide: String(c.guide) });
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
        this.onEconomyMsg(type, m);
        break;
    }
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
    if (t.ciclosNovos > 0 || t.anunciosVencidos > 0 || seeded) this.saveCity();
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
    }
    if (p.level !== rec.level) {
      relevel(this.w, p, rec.level);
      rekit = true;
    }
    // applyKit troca stats.pct inteiro: os números fixos de talento e guia entram de novo
    if (rekit) applyFlatPassiveNumbers(p);
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
