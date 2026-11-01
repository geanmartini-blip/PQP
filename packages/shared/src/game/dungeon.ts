/**
 * Masmorra sem fundo em tempo real (Fase 5): Galerias da Usina.
 *
 * Três camadas:
 * 1. plano do andar (dados): quais salas, quanto os inimigos escalam, qual chefe. Andares 1 a 5
 *    vêm de dungeons.json (detalhe.andares); do 6 em diante, semFundo sorteia as salas pela semente
 *    e o chefe volta a cada 5 andares (rodízio de semFundo.chefes). O do 5º é o de dungeons.json
 *    (chefe.inimigo, A Bomba Descontrolada).
 * 2. andar na simulação: o mapa sai de map/dungeonGen.ts; quando alguém do grupo entra numa sala,
 *    ela acorda: ondas de bandos (escalando por andar), elites com afixos, chefe no centro da sala
 *    de chefe (os avisos no chão são as habilidades dele, enemies.json). Sala limpa a última = a
 *    escada abre.
 * 3. dungeon_run: andar, semente, grupo de até 4 (jogador, plantonista, IA), recompensas guardadas
 *    por membro (itens e materiais sempre; XP só em grupo, pela regra de game/progression.ts
 *    groupXp), morte do grupo e saída.
 *
 * Nada aqui usa Math.random nem Date: a semente vem da run, o tempo vem por parâmetro (now).
 */
import { getData } from '../data';
import { circleFree } from '../map/grid';
import { generateFloorLayout, roomAt, type FloorLayout, type GenRoom, type RoomRequest } from '../map/dungeonGen';
import type { Dungeon, DungeonDetail, RoomTemplate, Wave } from '../schema/dungeon';
import type { Reward } from '../schema/world';
import { spawnPack } from '../sim/ai_pack';
import { heal, reviveEntity } from '../sim/combat';
import { isDowned, isPartyMember, isUp } from '../sim/entity';
import { createRng } from '../sim/rng';
import { spawnEnemy } from '../sim/spawn';
import { msToTicks, type Entity, type Rng, type World } from '../sim/types';
import { applyRewards, onGameEvent } from './missions';
import { emptyResult, mergeResult, type Fail, type GameResult, type GroupCtx, type PlayerRecord } from './types';

export { generateFloorLayout, roomAt, type FloorLayout, type GenRoom } from '../map/dungeonGen';

export const GALERIAS = 'galerias_da_usina';
/** andares prontos no piloto (o gerador continua depois) */
export const PILOTO_ANDARES = 5;

// SUGESTÃO: números da masmorra que os docs não dão
export const DUNGEON_TUNING = {
  /** níveis acima do base do inimigo a cada andar depois do 1º */
  nivelPorAndar: 1,
  /** inimigos a mais em cada grupo da onda a cada N andares */
  extraACadaAndares: 3,
  /** raio em tiles para pegar a escada ou a saída */
  escadaRaio: 1.5,
  /** tamanho da sala de entrada */
  entrada: { w: 14, h: 14 },
};

// ---------------------------------------------------------------------------
// Dados

export function dungeonOf(id: string = GALERIAS): Dungeon & { detalhe: DungeonDetail } {
  const d = getData().dungeonsById.get(id);
  if (!d || !d.detalhe) throw new Error(`masmorra sem detalhe: ${id}`);
  return d as Dungeon & { detalhe: DungeonDetail };
}

const templateOf = (d: DungeonDetail, id: string): RoomTemplate => {
  const t = d.salas.find((s) => s.id === id);
  if (!t) throw new Error(`sala não existe: ${id}`);
  return t;
};

export const regrasMasmorra = () => getData().dungeons.regras;

/** Chefe a cada 5 andares (dungeons.json regras.chefeACadaAndares). */
export const isBossFloor = (andar: number): boolean => andar > 0 && andar % regrasMasmorra().chefeACadaAndares === 0;

/** Semente do andar: mistura a semente da run com o número do andar (determinística). */
export function floorSeed(seed: number, andar: number): number {
  let h = (seed ^ Math.imul(andar + 0x9e37, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Chefe de um andar de chefe: o do andar pronto (sala 'chefe') ou o rodízio de semFundo.chefes. */
export function bossOfFloor(andar: number, dungeonId: string = GALERIAS): string | undefined {
  if (!isBossFloor(andar)) return undefined;
  const d = dungeonOf(dungeonId);
  const pronto = d.detalhe.andares.find((a) => a.andar === andar);
  if (pronto) {
    const sala = pronto.salas.map((s) => templateOf(d.detalhe, s)).find((t) => t.tipo === 'chefe');
    if (sala?.chefe) return sala.chefe.inimigo;
  }
  if (andar === PILOTO_ANDARES && d.chefe.inimigo) return d.chefe.inimigo;
  const chefes = d.detalhe.semFundo.chefes;
  return chefes[(andar / d.detalhe.semFundo.chefeACadaAndares - 1) % chefes.length];
}

export interface FloorScaling {
  vidaMult: number;
  danoMult: number;
  saqueMult: number;
  /** chance (0..1) de um inimigo normal nascer elite */
  eliteChance: number;
  /** níveis acima do base */
  nivelExtra: number;
  /** inimigos a mais por grupo */
  extraPorGrupo: number;
}

/** Quanto os inimigos escalam no andar: dificuldade dos andares prontos, depois semFundo. */
export function floorScaling(andar: number, dungeonId: string = GALERIAS): FloorScaling {
  const d = dungeonOf(dungeonId).detalhe;
  const sf = d.semFundo;
  const prontos = d.andares;
  const ultimo = prontos[prontos.length - 1]!;
  const pronto = prontos.find((a) => a.andar === andar);
  const alem = Math.max(0, andar - ultimo.andar);
  const base = pronto?.dificuldade ?? ultimo.dificuldade;
  return {
    vidaMult: base * (1 + (sf.vidaPctPorAndar / 100) * alem),
    danoMult: base * (1 + (sf.danoPctPorAndar / 100) * alem),
    saqueMult: 1 + (sf.saquePctPorAndar / 100) * alem,
    eliteChance: Math.min(0.5, (sf.chanceElitePorAndarPct / 100) * andar),
    nivelExtra: DUNGEON_TUNING.nivelPorAndar * (andar - 1),
    extraPorGrupo: Math.floor((andar - 1) / DUNGEON_TUNING.extraACadaAndares),
  };
}

/** Salas do andar, em ordem (sem a entrada). Pronto: dungeons.json; sem fundo: sorteio por peso. */
export function floorRooms(andar: number, seed: number, dungeonId: string = GALERIAS): RoomTemplate[] {
  const d = dungeonOf(dungeonId).detalhe;
  const pronto = d.andares.find((a) => a.andar === andar);
  if (pronto) return pronto.salas.map((s) => templateOf(d, s));
  const sf = d.semFundo;
  const rng = createRng(floorSeed(seed, andar) ^ 0x5bd1e995);
  const n = rng.int(sf.salasPorAndar[0], sf.salasPorAndar[1]);
  const pool = d.salas.filter((s) => s.tipo !== 'chefe' && (sf.pesos[s.tipo] ?? 0) > 0);
  const out: RoomTemplate[] = [];
  for (let i = 0; i < n; i++) {
    const total = pool.reduce((a, s) => a + (sf.pesos[s.tipo] ?? 0), 0);
    let r = rng.next() * total;
    let pick = pool[0]!;
    for (const s of pool) {
      r -= sf.pesos[s.tipo] ?? 0;
      if (r < 0) {
        pick = s;
        break;
      }
    }
    out.push(pick);
  }
  if (isBossFloor(andar)) {
    const sala = d.salas.find((s) => s.tipo === 'chefe');
    if (sala) out.push(sala);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Andar montado

export interface DungeonFloor {
  dungeonId: string;
  andar: number;
  seed: number;
  name: string;
  layout: FloorLayout;
  /** modelo de cada sala do layout (índice 0 = entrada, sem modelo) */
  templates: (RoomTemplate | null)[];
  scaling: FloorScaling;
  boss?: string;
}

/** Monta o andar: salas, mapa (40x40), escala e chefe. Mesma semente e andar = mesmo andar. */
export function buildDungeonFloor(andar: number, seed: number, dungeonId: string = GALERIAS): DungeonFloor {
  const d = dungeonOf(dungeonId);
  const salas = floorRooms(andar, seed, dungeonId);
  const reqs: RoomRequest[] = [
    { templateId: 'entrada', tipo: 'entrada', name: d.entrada, ...DUNGEON_TUNING.entrada },
    ...salas.map((s) => ({ templateId: s.id, tipo: s.tipo, name: s.name, w: s.tamanho.w, h: s.tamanho.h })),
  ];
  const fs = floorSeed(seed, andar);
  const layout = generateFloorLayout(fs, reqs, { mapId: `${dungeonId}:${andar}`, regionId: d.regioes[0] ?? 'usina_da_ponte' });
  const pronto = d.detalhe.andares.find((a) => a.andar === andar);
  const boss = bossOfFloor(andar, dungeonId);
  return {
    dungeonId,
    andar,
    seed: fs,
    // SUGESTÃO: nome dos andares sem fundo
    name: pronto?.name ?? `Galerias, ${andar}º subsolo`,
    layout,
    templates: [null, ...salas.slice(0, layout.rooms.length - 1)],
    scaling: floorScaling(andar, dungeonId),
    ...(boss ? { boss } : {}),
  };
}

// ---------------------------------------------------------------------------
// Andar na simulação

export interface RoomState {
  idx: number;
  ativa: boolean;
  limpa: boolean;
  /** próxima onda a nascer */
  onda: number;
  proximaOndaTick?: number;
  /** ids das entidades vivas da onda atual */
  vivos: number[];
  /** sala de evento esperando escolha */
  esperandoEscolha?: boolean;
}

export interface DungeonFloorState {
  floor: DungeonFloor;
  rooms: RoomState[];
  escadaAberta: boolean;
  bossId?: number;
  bossVencido: boolean;
}

export type DungeonFloorEvent =
  | { t: 'sala_ativa'; sala: number; tipo: string; nome: string }
  | { t: 'onda'; sala: number; onda: number; inimigos: number[] }
  | { t: 'chefe'; sala: number; id: number; inimigo: string }
  | { t: 'sala_limpa'; sala: number }
  | { t: 'descanso'; sala: number; curados: number[] }
  | { t: 'tesouro'; sala: number; recompensas: Reward[] }
  | { t: 'evento'; sala: number; opcoes: { id: string; texto: string }[] }
  | { t: 'escada_aberta' }
  | { t: 'chefe_vencido'; inimigo: string };

/** Começa o andar num mundo criado sobre floor.layout.map. Nenhuma sala acorda ainda. */
export function startDungeonFloor(floor: DungeonFloor): DungeonFloorState {
  return {
    floor,
    rooms: floor.layout.rooms.map((r) => ({ idx: r.idx, ativa: r.idx === 0, limpa: r.idx === 0, onda: 0, vivos: [] })),
    escadaAberta: false,
    bossVencido: false,
  };
}

const partyOf = (w: World) => Array.from(w.entities.values()).filter((e) => isPartyMember(e) && e.team === 'aliados' && !e.dead);

/** Ponto livre sorteado dentro da sala (longe da parede). */
function pointIn(w: World, r: GenRoom, rng: Rng, radius: number): { x: number; y: number } {
  for (let k = 0; k < 20; k++) {
    const x = r.x + 1.5 + rng.next() * (r.w - 3), y = r.y + 1.5 + rng.next() * (r.h - 3);
    if (circleFree(w.map, x, y, radius + 0.1)) return { x, y };
  }
  return { x: r.cx, y: r.cy };
}

/** Aplica a escala do andar num inimigo recém-nascido. */
function scaleEnemy(e: Entity, s: FloorScaling): void {
  e.stats.hpMax *= s.vidaMult;
  e.hp = e.stats.hpMax;
  e.stats.attack *= s.danoMult;
}

/** Nasce uma onda na sala: bandos escalando por andar, elites com afixos e promoção pela chance do andar. */
export function spawnWave(w: World, st: DungeonFloorState, sala: number, wave: Wave, players: number): number[] {
  const D = getData();
  const r = st.floor.layout.rooms[sala]!;
  const s = st.floor.scaling;
  const ids: number[] = [];
  for (const g of wave.inimigos) {
    const def = D.enemiesById.get(g.inimigo);
    if (!def) continue;
    const level = def.nivel + s.nivelExtra;
    const p = pointIn(w, r, w.rng, def.raioCorpoTiles);
    if (g.tier === 'elite') {
      for (let i = 0; i < g.quantidade; i++) {
        const q = pointIn(w, r, w.rng, def.raioCorpoTiles);
        const e = spawnEnemy(w, g.inimigo, q.x, q.y, { tier: 'elite', level, ...(g.afixos ? { affixes: g.afixos } : {}) });
        scaleEnemy(e, s);
        ids.push(e.id);
      }
      continue;
    }
    if (g.tier === 'chefe') {
      const e = spawnEnemy(w, g.inimigo, r.cx, r.cy, { tier: 'chefe', level, players });
      scaleEnemy(e, s);
      ids.push(e.id);
      continue;
    }
    const pack = spawnPack(w, g.inimigo, p.x, p.y, { n: g.quantidade + s.extraPorGrupo, level, eliteChance: s.eliteChance, noEscort: true, packId: `andar${st.floor.andar}_sala${sala}_${g.inimigo}` });
    for (const e of pack) {
      scaleEnemy(e, s);
      ids.push(e.id);
    }
  }
  return ids;
}

function wavesOf(t: RoomTemplate | null): Wave[] {
  if (!t) return [];
  if (t.ondas) return t.ondas;
  // enigma sem lição: o caminho longo (as ondas do semLicao)
  if (t.enigma?.semLicao.ondas) return t.enigma.semLicao.ondas;
  return [];
}

/** Acorda a sala: ondas, chefe, descanso, tesouro ou evento. */
function activate(w: World, st: DungeonFloorState, rs: RoomState, players: number, ev: DungeonFloorEvent[], licoes: readonly string[]): void {
  const t = st.floor.templates[rs.idx] ?? null;
  const r = st.floor.layout.rooms[rs.idx]!;
  rs.ativa = true;
  ev.push({ t: 'sala_ativa', sala: rs.idx, tipo: r.tipo, nome: r.name });
  if (!t) {
    rs.limpa = true;
    return;
  }
  if (t.tipo === 'chefe') {
    const bossId = st.floor.boss ?? t.chefe?.inimigo;
    if (bossId) {
      const def = getData().enemiesById.get(bossId)!;
      const e = spawnEnemy(w, bossId, r.cx, r.cy, { tier: 'chefe', players, level: def.nivel + st.floor.scaling.nivelExtra });
      scaleEnemy(e, st.floor.scaling);
      st.bossId = e.id;
      rs.vivos = [e.id];
      ev.push({ t: 'chefe', sala: rs.idx, id: e.id, inimigo: bossId });
    }
    for (const a of t.chefe?.acompanhantes ?? []) rs.vivos.push(...spawnWave(w, st, rs.idx, a, players));
    rs.onda = Number.MAX_SAFE_INTEGER;
    return;
  }
  if (t.tipo === 'descanso' && t.descanso) {
    const curados: number[] = [];
    for (const m of partyOf(w)) {
      if (isDowned(m) && t.descanso.levantaCaidos) reviveEntity(w, m, t.descanso.curaPct);
      if (isUp(m)) {
        heal(w, m, m, (m.stats.hpMax * t.descanso.curaPct) / 100);
        m.resource = Math.min(m.stats.resourceMax, m.resource + (m.stats.resourceMax * t.descanso.recursoPct) / 100);
        curados.push(m.id);
      }
    }
    ev.push({ t: 'descanso', sala: rs.idx, curados });
    rs.limpa = true;
    return;
  }
  if (t.tipo === 'tesouro' && t.tesouro) {
    const rec: Reward[] = [{ kind: 'item', tabela: t.tesouro.tabela, quantidade: t.tesouro.rolagens }, ...t.recompensas];
    ev.push({ t: 'tesouro', sala: rs.idx, recompensas: rec });
    rs.limpa = true;
    return;
  }
  if (t.tipo === 'evento' && t.evento) {
    rs.esperandoEscolha = true;
    ev.push({ t: 'evento', sala: rs.idx, opcoes: t.evento.opcoes.map((o) => ({ id: o.id, texto: o.texto })) });
    return;
  }
  if (t.tipo === 'enigma' && t.enigma && t.enigma.licoes.some((l) => licoes.includes(l))) {
    // quem tem a lição resolve na hora
    ev.push({ t: 'tesouro', sala: rs.idx, recompensas: [...t.enigma.recompensaPorLicao] });
    rs.limpa = true;
    return;
  }
  const waves = wavesOf(t);
  if (waves.length === 0) {
    rs.limpa = true;
    return;
  }
  rs.proximaOndaTick = w.tick + msToTicks((waves[0]!.atrasoS ?? 0) * 1000);
}

/**
 * Escolha numa sala de evento (rádio, acampamento). Devolve as recompensas (para dungeon_run) e
 * nasce as ondas da opção, se houver. A sala fica limpa quando as ondas acabam.
 */
export function chooseDungeonEvent(w: World, st: DungeonFloorState, sala: number, opcaoId: string, players = 1): { ok: true; recompensas: Reward[]; flags: string[] } | Fail {
  const rs = st.rooms[sala];
  const t = st.floor.templates[sala];
  if (!rs || !t?.evento || !rs.esperandoEscolha) return { ok: false, erro: 'Não há escolha nesta sala.' };
  const o = t.evento.opcoes.find((x) => x.id === opcaoId);
  if (!o) return { ok: false, erro: 'Opção não existe.' };
  rs.esperandoEscolha = false;
  if (o.ondas && o.ondas.length > 0) {
    rs.vivos = spawnWave(w, st, sala, o.ondas[0]!, players);
    rs.onda = Number.MAX_SAFE_INTEGER;
  } else rs.limpa = true;
  return { ok: true, recompensas: [...o.recompensas], flags: [...o.ligaFlags] };
}

export interface DungeonTickOpts {
  /** jogadores na luta (vida do chefe) */
  players?: number;
  /** lições do grupo (enigma resolvido na hora) */
  licoes?: readonly string[];
}

/** Um tick do andar: acorda salas, nasce ondas, limpa salas e abre a escada. */
export function tickDungeonFloor(w: World, st: DungeonFloorState, opts: DungeonTickOpts = {}): DungeonFloorEvent[] {
  const ev: DungeonFloorEvent[] = [];
  const players = Math.max(1, opts.players ?? partyOf(w).filter((e) => e.kind === 'player').length);
  const party = partyOf(w).filter(isUp);
  for (const rs of st.rooms) {
    if (rs.ativa) continue;
    const r = st.floor.layout.rooms[rs.idx]!;
    if (party.some((m) => roomAt({ rooms: [r] }, m.x, m.y, -0.5))) activate(w, st, rs, players, ev, opts.licoes ?? []);
  }
  for (const rs of st.rooms) {
    if (!rs.ativa || rs.limpa || rs.esperandoEscolha) continue;
    rs.vivos = rs.vivos.filter((id) => {
      const e = w.entities.get(id);
      return !!e && !e.dead;
    });
    if (rs.vivos.length > 0) continue;
    const waves = wavesOf(st.floor.templates[rs.idx] ?? null);
    if (rs.onda < waves.length) {
      if (rs.proximaOndaTick !== undefined && w.tick < rs.proximaOndaTick) continue;
      const ids = spawnWave(w, st, rs.idx, waves[rs.onda]!, players);
      rs.vivos = ids;
      ev.push({ t: 'onda', sala: rs.idx, onda: rs.onda, inimigos: ids });
      rs.onda++;
      const next = waves[rs.onda];
      rs.proximaOndaTick = next ? w.tick + msToTicks((next.atrasoS ?? 0) * 1000) : undefined;
      continue;
    }
    rs.limpa = true;
    ev.push({ t: 'sala_limpa', sala: rs.idx });
  }
  if (st.bossId !== undefined && !st.bossVencido) {
    const b = w.entities.get(st.bossId);
    if (!b || b.dead) {
      st.bossVencido = true;
      ev.push({ t: 'chefe_vencido', inimigo: st.floor.boss ?? b?.defId ?? '' });
    }
  }
  if (!st.escadaAberta) {
    const last = st.rooms[st.rooms.length - 1]!;
    const bossOk = !isBossFloor(st.floor.andar) || st.bossVencido;
    if (last.limpa && bossOk) {
      st.escadaAberta = true;
      ev.push({ t: 'escada_aberta' });
    }
  }
  return ev;
}

/** Membro do grupo de pé na escada aberta (o servidor então chama advanceFloor). */
export function atStairs(w: World, st: DungeonFloorState): Entity | undefined {
  if (!st.escadaAberta) return undefined;
  const s = st.floor.layout.stairs;
  return partyOf(w).find((e) => isUp(e) && Math.hypot(e.x - s.x, e.y - s.y) <= DUNGEON_TUNING.escadaRaio);
}

/** Membro do grupo na saída da entrada (sair da masmorra). */
export function atExit(w: World, st: DungeonFloorState): Entity | undefined {
  const s = st.floor.layout.exit;
  return partyOf(w).find((e) => isUp(e) && e.kind === 'player' && Math.hypot(e.x - s.x, e.y - s.y) <= DUNGEON_TUNING.escadaRaio);
}

/** Grupo inteiro caído ou morto (a run falha). */
export function partyWiped(w: World): boolean {
  const p = partyOf(w);
  const all = Array.from(w.entities.values()).filter((e) => isPartyMember(e) && e.team === 'aliados');
  return all.length > 0 && p.every((e) => !isUp(e));
}

// ---------------------------------------------------------------------------
// dungeon_run

export type DungeonRole = 'jogador' | 'plantonista' | 'ia';

export interface DungeonMember {
  playerId: string;
  papel: DungeonRole;
  nome?: string;
  saiu?: boolean;
}

export type DungeonRunStatus = 'ativa' | 'falhou' | 'saiu';

/** dungeon_run do modelo de dados. */
export interface DungeonRun {
  id: string;
  dungeonId: string;
  seed: number;
  /** andar atual */
  andar: number;
  /** andar em que entrou (1, ou o atalho do último chefe vencido + 1) */
  andarInicial: number;
  grupo: DungeonMember[];
  status: DungeonRunStatus;
  inicio: number;
  fim?: number;
  /** andar mais fundo vencido nesta run (0 = nenhum) */
  andarMaisFundo: number;
  /** último andar de chefe vencido (salvaNoUltimoAndarVencido) */
  ultimoChefeVencido: number;
  /** recompensas guardadas por playerId (itens e materiais; XP já pela regra de grupo) */
  recompensas: Record<string, Reward[]>;
  /** contexto de grupo de cada playerId para o XP */
  grupoCtx: Record<string, GroupCtx>;
}

export interface CreateRunOpts {
  id: string;
  dungeonId?: string;
  seed: number;
  grupo: DungeonMember[];
  now: number;
  /** atalho: último andar de chefe vencido antes (primeiraVez libera atalho_galerias) */
  atalho?: number;
}

export function createDungeonRun(o: CreateRunOpts): { ok: true; run: DungeonRun } | Fail {
  const dungeonId = o.dungeonId ?? GALERIAS;
  const d = getData().dungeonsById.get(dungeonId);
  if (!d?.detalhe || !d.emPiloto) return { ok: false, erro: 'Essa masmorra não está aberta.' };
  const max = regrasMasmorra().equipeMax;
  if (o.grupo.length === 0) return { ok: false, erro: 'Grupo vazio.' };
  if (o.grupo.length > max) return { ok: false, erro: `Grupo de até ${max}.` };
  if (!o.grupo.some((m) => m.papel === 'jogador')) return { ok: false, erro: 'Precisa de pelo menos um jogador ao vivo.' };
  if (new Set(o.grupo.map((m) => m.playerId)).size !== o.grupo.length) return { ok: false, erro: 'Membro repetido no grupo.' };
  const chefe = regrasMasmorra().chefeACadaAndares;
  const atalho = o.atalho && o.atalho > 0 && o.atalho % chefe === 0 ? o.atalho : 0;
  const run: DungeonRun = {
    id: o.id,
    dungeonId,
    seed: o.seed >>> 0,
    andar: atalho + 1,
    andarInicial: atalho + 1,
    grupo: o.grupo.map((m) => ({ ...m })),
    status: 'ativa',
    inicio: o.now,
    andarMaisFundo: 0,
    ultimoChefeVencido: atalho,
    recompensas: {},
    grupoCtx: {},
  };
  refreshGroupCtx(run);
  return { ok: true, run };
}

const membrosAtivos = (run: DungeonRun) => run.grupo.filter((m) => !m.saiu);

/** Contexto de grupo (XP): personagens = membros ativos; ao vivo = jogadores; plantonista ganha metade. */
function refreshGroupCtx(run: DungeonRun): void {
  const ativos = membrosAtivos(run);
  const aoVivo = ativos.filter((m) => m.papel === 'jogador').length;
  for (const m of ativos) run.grupoCtx[m.playerId] = { personagens: ativos.length, aoVivo: Math.max(1, aoVivo), ...(m.papel === 'plantonista' ? { plantonista: true } : {}) };
}

/** Andar montado da run (mesmo andar e semente = mesmo mapa para todos do grupo). */
export const runFloor = (run: DungeonRun): DungeonFloor => buildDungeonFloor(run.andar, run.seed, run.dungeonId);

/** Recompensas de vencer o andar: porAndar (materiais × saque do andar) e, no andar de chefe, as do chefe. */
export function floorRewards(andar: number, opts: { primeiraVez?: boolean } = {}, dungeonId: string = GALERIAS): Reward[] {
  const d = dungeonOf(dungeonId).detalhe;
  const s = floorScaling(andar, dungeonId);
  const mult = (r: Reward): Reward => (r.kind === 'recurso' ? { ...r, quantidade: Math.round(r.quantidade * s.saqueMult) } : r);
  const out: Reward[] = d.recompensas.porAndar.map(mult);
  if (isBossFloor(andar)) {
    out.push(...d.recompensas.chefe.map(mult));
    if (opts.primeiraVez) out.push(...d.recompensas.primeiraVez);
  }
  return out;
}

/** Guarda recompensas extras (tesouro, evento) para os membros ativos. */
export function bankRewards(run: DungeonRun, rewards: readonly Reward[], soPara?: string): void {
  for (const m of membrosAtivos(run)) {
    if (soPara && m.playerId !== soPara) continue;
    if (m.papel === 'ia') continue;
    (run.recompensas[m.playerId] ??= []).push(...rewards);
  }
}

/**
 * Venceu o andar (pegou a escada): guarda as recompensas, marca o chefe vencido e desce.
 * Devolve o andar novo.
 */
export function advanceFloor(run: DungeonRun, opts: { primeiraVez?: boolean } = {}): number {
  if (run.status !== 'ativa') return run.andar;
  const andar = run.andar;
  bankRewards(run, floorRewards(andar, opts, run.dungeonId));
  run.andarMaisFundo = Math.max(run.andarMaisFundo, andar);
  if (isBossFloor(andar)) run.ultimoChefeVencido = andar;
  run.andar = andar + 1;
  return run.andar;
}

/**
 * Grupo todo caiu: a run falha. As recompensas dos andares vencidos ficam (já guardadas); o que
 * fica salvo para a próxima é o último andar de chefe vencido (salvaNoUltimoAndarVencido).
 * SUGESTÃO: o andar em andamento não paga nada.
 */
export function failRun(run: DungeonRun, now: number): DungeonRun {
  if (run.status === 'ativa') {
    run.status = 'falhou';
    run.fim = now;
  }
  return run;
}

/** Um membro sai. Qualquer jogador continua (qualquerMembroContinua); sem jogador ao vivo, a run acaba. */
export function leaveRun(run: DungeonRun, playerId: string, now: number): DungeonRun {
  const m = run.grupo.find((x) => x.playerId === playerId);
  if (!m || m.saiu) return run;
  m.saiu = true;
  refreshGroupCtx(run);
  if (!membrosAtivos(run).some((x) => x.papel === 'jogador')) {
    run.status = run.status === 'ativa' ? 'saiu' : run.status;
    run.fim ??= now;
  }
  return run;
}

/** Entra mais alguém (plantonista levado no meio da run, IA), até 4. */
export function joinRun(run: DungeonRun, m: DungeonMember): { ok: true } | Fail {
  if (run.status !== 'ativa') return { ok: false, erro: 'A run acabou.' };
  if (membrosAtivos(run).length >= regrasMasmorra().equipeMax) return { ok: false, erro: 'Grupo cheio.' };
  if (run.grupo.some((x) => x.playerId === m.playerId && !x.saiu)) return { ok: false, erro: 'Já está no grupo.' };
  run.grupo = run.grupo.filter((x) => x.playerId !== m.playerId);
  run.grupo.push({ ...m });
  refreshGroupCtx(run);
  return { ok: true };
}

/**
 * Entrega as recompensas guardadas no registro do jogador (ou do plantonista, no relatório):
 * itens e materiais sempre; XP só em grupo (groupXp). Marca o andar mais fundo e o atalho.
 */
export function claimRunRewards(rec: PlayerRecord, run: DungeonRun): GameResult {
  const r = emptyResult();
  const list = run.recompensas[rec.id] ?? [];
  const g = run.grupoCtx[rec.id] ?? { personagens: 1, aoVivo: 1 };
  if (list.length > 0) mergeResult(r, applyRewards(rec, list, g));
  run.recompensas[rec.id] = [];
  const k = `masmorra:${run.dungeonId}`;
  rec.counters[k] = Math.max(rec.counters[k] ?? 0, run.andarMaisFundo);
  const kc = `masmorra_chefe:${run.dungeonId}`;
  rec.counters[kc] = Math.max(rec.counters[kc] ?? 0, run.ultimoChefeVencido);
  r.mudou ||= list.length > 0;
  // missões de expedição (entrar_masmorra, vencer_andar): entrou e foi até o andar mais fundo vencido
  mergeResult(r, onGameEvent(rec, { t: 'dungeon', masmorra: run.dungeonId, andar: 0 }, { grupo: g }));
  if (run.andarMaisFundo > 0) mergeResult(r, onGameEvent(rec, { t: 'dungeon', masmorra: run.dungeonId, andar: run.andarMaisFundo }, { grupo: g }));
  return r;
}

/** Atalho do jogador: último andar de chefe vencido, se tiver o desbloqueio atalho_galerias. */
export function shortcutOf(rec: PlayerRecord, dungeonId: string = GALERIAS): number {
  if (!rec.unlocks.includes('atalho_galerias')) return 0;
  return rec.counters[`masmorra_chefe:${dungeonId}`] ?? 0;
}

/** Primeira vez vencendo o chefe deste andar (libera o primeiraVez). */
export const firstBossClear = (rec: PlayerRecord, andar: number, dungeonId: string = GALERIAS): boolean =>
  isBossFloor(andar) && (rec.counters[`masmorra_chefe:${dungeonId}`] ?? 0) < andar;
