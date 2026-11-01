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
  type EntSnap,
  type S2C_Aviso,
  type S2C_Dialogo,
  type S2C_Snapshot,
  type S2C_Welcome,
} from '@pqp/shared/net';
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
  type BotaoId,
  type GameEvent,
  type GameResult,
  type PlayerRecord,
} from '@pqp/shared/game/index';
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

export type Outgoing = [string, unknown];

/** Onde o servidor local guarda o registro do jogador (localStorage no navegador; mapa nos testes). */
export interface RecordStore {
  load(id: string): unknown;
  save(id: string, rec: PlayerRecord): void;
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

  constructor(private readonly opts: LocalServerOpts = {}) {
    this.seed = opts.seed ?? 7;
    this.noEnemies = opts.noEnemies === true;
    this.fixedMap = opts.map;
    this.prototype = !opts.fase2 && (opts.map !== undefined || opts.mapId !== undefined);
    const first = opts.map?.id ?? opts.mapId ?? (this.prototype ? 'prototipo_delta' : START_MAP);
    this.loadMap(first);
  }

  /** Monta o mundo de um mapa (no começo e na troca de mapa). */
  private loadMap(mapId: string): void {
    const map = this.fixedMap && this.fixedMap.id === mapId ? this.fixedMap : getMap(hasMap(mapId) ? mapId : START_MAP);
    this.mapId = map.id;
    this.w = createWorld(map, this.seed);
    this.w.pathfinder = (m, from, to, r) => findPath(m, from, to, r);
    this.groups = [];
    this.spawn = { x: 1.5, y: 1.5 };
    this.populate(map, this.noEnemies);
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
  }

  /** Mapa do registro: Delta até a travessia; depois o QG da margem. */
  private mapFor(rec: PlayerRecord): string {
    if (this.fixedMap) return this.fixedMap.id;
    if (rec.stage === 'margem' && rec.side) return ARRIVAL_MAP_BY_SIDE[rec.side];
    return START_MAP;
  }

  private spawnFromRecord(): void {
    const rec = this.rec!;
    const cap = simLevelCap(rec);
    this.player = spawnPlayer(this.w, {
      name: rec.name,
      archetypeId: simKitOf(rec),
      level: rec.level,
      xp: rec.xp,
      x: this.spawn.x,
      y: this.spawn.y,
      playerId: this.token,
      ...(rec.side ? { side: rec.side } : {}),
      ...(rec.loadout.slot3_ability ? { slot3: rec.loadout.slot3_ability } : {}),
      look: lookOf(rec),
      ...(cap !== undefined ? { levelCap: cap } : {}),
      deltaRookie: isDeltaRookie(rec),
    });
    this.player.auto = rec.auto;
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

  /** Evento de jogo no registro; `once` = controle que só conta a primeira vez. */
  private gameEvent(ev: GameEvent, once = false): void {
    const rec = this.rec;
    if (!rec || !rec.criado) return;
    if (once && ev.t === 'control' && rec.tutorial.controles.includes(ev.controle)) return;
    this.flush(onGameEvent(rec, ev));
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
        const to = this.mapFor(rec);
        if (to !== this.mapId) this.loadMap(to);
        this.player = undefined;
        this.spawnFromRecord();
        this.sendWelcome();
        this.flush(r.resultado, { always: true });
        break;
      }
      case GAME_MSG.tutorialPasso: {
        const c = m as C2S_TutorialPasso;
        if (typeof c.controle === 'string') this.gameEvent({ t: 'control', controle: c.controle }, true);
        if (typeof c.passo === 'string') this.gameEvent({ t: 'tutorial', passo: c.passo });
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
    const cur = p.archetypeId ?? p.classId ?? 'delta';
    if (kit !== cur) {
      if (rec.side) p.side = rec.side;
      setArchetype(this.w, p, kit, rec.loadout.slot3_ability ?? undefined);
    }
    if (p.level !== rec.level) relevel(this.w, p, rec.level);
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
