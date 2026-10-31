/**
 * Estado da IA e da Doutrina guardado na entidade (entity.ai), números de afinação (todos
 * sugestão) e utilidades de deslocamento comuns aos dois: ir até um ponto com caminho limitado
 * por tick, linha livre, fugir e água (soNaAgua).
 */
import { circleFree, hasLineOfSight, infoAt } from '../map/grid';
import { AGGRO_RADIUS, AGGRO_RADIUS_BOSS, LEASH_RADIUS } from './constants';
import { isPartyMember, isUp } from './entity';
import { dist } from './geom';
import type { Entity, Vec, World } from './types';

/** Números da IA e da Doutrina que não estão nos docs. */
export const AI_TUNING = {
  // SUGESTÃO: inimigo dormindo só olha em volta a cada 5 ticks (250 ms), escalonado pelo id.
  sleepThinkTicks: 5,
  // SUGESTÃO: inimigo dormindo só pensa com algum jogador ou companheiro a até 24 tiles.
  activeRadius: 24,
  // SUGESTÃO: percepção de 7 tiles (chefe 10), a mesma do núcleo.
  aggroRadius: AGGRO_RADIUS,
  aggroRadiusBoss: AGGRO_RADIUS_BOSS,
  // SUGESTÃO: quem acorda chama o bando a até 6 tiles (sem packId); com packId, chama o bando todo.
  packCallRadius: 6,
  // SUGESTÃO: coleira de 15 tiles do ponto onde nasceu (chefe 22).
  leashRadius: LEASH_RADIUS,
  leashRadiusBoss: 22,
  // SUGESTÃO: voltando para casa, cura 20% da vida por segundo, fica imune e chega com a vida cheia.
  returnHealPctPerS: 20,
  // SUGESTÃO: sem ver o alvo, procura onde o viu por último por 3 s e depois desiste.
  loseSightMs: 3000,
  // SUGESTÃO: no máximo 6 buscas de caminho (A*) por tick no mundo todo.
  pathBudgetPerTick: 6,
  // SUGESTÃO: refaz o caminho a cada 0,5 s ou quando o destino anda mais de 1,5 tile.
  repathTicks: 10,
  repathMoveTiles: 1.5,
  // SUGESTÃO: inimigo à distância recua 2,5 tiles quando o jogador encosta (borda a borda < 1,6), a cada 3 s.
  rangedMinGap: 1.6,
  kiteTiles: 2.5,
  kiteEveryMs: 3000,
  // SUGESTÃO: suporte inimigo fica a até 3 tiles do aliado mais ferido.
  supportStayTiles: 3,
  // SUGESTÃO: chefe fica parado do aviso no chão até 0,4 s depois do impacto (janela para o jogador).
  bossPauseAfterImpactMs: 400,
  // SUGESTÃO: enxame cerca o alvo em volta (ângulo de ouro por id); voador ziguezagueia 0,6 tile.
  flyWobbleTiles: 0.6,
  // Doutrina
  // SUGESTÃO: fugir dura no máximo 3 s e só volta a valer 8 s depois.
  fleeMaxMs: 3000,
  fleeCooldownMs: 8000,
  fleeTiles: 4,
  // SUGESTÃO: companheiro larga o alvo que estiver a mais de 12 tiles do líder e volta.
  allyLeashTiles: 12,
  // SUGESTÃO: companheiro segue o líder a até 2,5 tiles; seguir_grupo vale a partir de 4.
  followTiles: 2.5,
  followCardTiles: 4,
  // SUGESTÃO: levantar_aliado e aliado_caido_perto olham até 10 tiles.
  reviveSearchTiles: 10,
  // SUGESTÃO: sem líder e sem alvo, o automático vai atrás de inimigo à vista a até 16 tiles,
  // ou do último inimigo que travou, à vista a até 30 tiles (depois de fugir, volta para a luta).
  seekTiles: 16,
  lastFoeTiles: 30,
  // SUGESTÃO: curar_aliado sem carta de vida vale abaixo de 70%; a rotina cura abaixo de 85%.
  healCardPct: 70,
  healRoutinePct: 85,
} as const;

// ---------------------------------------------------------------------------
// Memória

/** Memória do inimigo (entity.ai.mente). */
export interface EnemyMind {
  init: boolean;
  state: 'dormindo' | 'combate' | 'voltando';
  /** bando: quem tem o mesmo packId acorda junto */
  packId?: string;
  /** escolta: id de quem ela protege */
  leaderId?: number;
  /** quem está perseguindo (pode estar fora de vista) */
  chaseId?: number;
  lastSeen?: Vec;
  lastSeenTick?: number;
  /** maior tick de golpe recebido já percebido */
  seenHitTick: number;
  /** chefe: parado e sem nova habilidade até este tick */
  busyUntil: number;
  /** última habilidade usada (o padrão do chefe evita repetir) */
  lastAbility?: string;
  /** à distância: próximo recuo permitido */
  kiteReadyTick: number;
  /** à distância: recuando até este tick */
  kiteUntil?: number;
  /** enxame: ângulo da vaga em volta do alvo */
  slot: number;
  /** jogadores que ele já derrubou e comemorou */
  cheered?: number[];
  /** próximo tick de cura enquanto volta */
  nextReturnHealTick?: number;
}

/** Memória da Doutrina (entity.ai.doutrina) do jogador no automático e do companheiro. */
export interface DoctrineMind {
  fleeUntil?: number;
  fleeReadyTick?: number;
  /** último inimigo travado (sozinho e sem alvo, volta atrás dele depois de fugir) */
  lastFoeId?: number;
  /** o último moveTo foi da Doutrina (não do toque do jogador) */
  ownMove?: boolean;
}

/** Caminho e redirecionamento (os dois lados usam). */
export interface PathMind {
  repathTick?: number;
  goal?: Vec;
}

const bag = (e: Entity): Record<string, unknown> => (e.ai ??= {});

export function enemyMind(e: Entity): EnemyMind {
  const b = bag(e);
  let m = b['mente'] as EnemyMind | undefined;
  if (!m) {
    m = { init: false, state: 'dormindo', seenHitTick: -1, busyUntil: 0, kiteReadyTick: 0, slot: (e.id * 2.39996323) % (Math.PI * 2) };
    const pid = b['packId'];
    if (typeof pid === 'string') m.packId = pid;
    b['mente'] = m;
  }
  return m;
}

export function doctrineMind(e: Entity): DoctrineMind {
  const b = bag(e);
  return ((b['doutrina'] as DoctrineMind | undefined) ?? (b['doutrina'] = {})) as DoctrineMind;
}

function pathMind(e: Entity): PathMind {
  const b = bag(e);
  return ((b['caminho'] as PathMind | undefined) ?? (b['caminho'] = {})) as PathMind;
}

/** Raio de percepção e coleira de um inimigo. */
export const aggroOf = (e: Entity) => (e.tier === 'chefe' ? AI_TUNING.aggroRadiusBoss : AI_TUNING.aggroRadius);
export const leashOf = (e: Entity) => (e.tier === 'chefe' ? AI_TUNING.leashRadiusBoss : AI_TUNING.leashRadius);

// ---------------------------------------------------------------------------
// Orçamento por tick (por mundo, sem mexer no contrato do World)

interface TickBudget {
  tick: number;
  paths: number;
  party?: Entity[];
}
const budgets = new WeakMap<World, TickBudget>();

function budget(w: World): TickBudget {
  let b = budgets.get(w);
  if (!b || b.tick !== w.tick) {
    b = { tick: w.tick, paths: 0 };
    budgets.set(w, b);
  }
  return b;
}

/** Jogadores e companheiros de pé neste tick (cacheado por tick). */
export function partyMembers(w: World): Entity[] {
  const b = budget(w);
  if (!b.party) {
    b.party = [];
    for (const e of w.entities.values()) if (isPartyMember(e) && isUp(e)) b.party.push(e);
  }
  return b.party;
}

/** Algum jogador ou companheiro (de outro time) a até `r` tiles. */
export function partyNear(w: World, e: Entity, r: number): boolean {
  for (const p of partyMembers(w)) if (p.team !== e.team && dist(p.x, p.y, e.x, e.y) <= r) return true;
  return false;
}

/** Quantas buscas de caminho ainda cabem neste tick. */
export const pathsLeft = (w: World) => AI_TUNING.pathBudgetPerTick - budget(w).paths;

// ---------------------------------------------------------------------------
// Deslocamento

/** O corpo cabe em linha reta daqui até lá (amostra a cada 0,3 tile). */
export function clearLine(w: World, e: Entity, x: number, y: number): boolean {
  const d = dist(e.x, e.y, x, y);
  if (d < 1e-6) return true;
  if (!hasLineOfSight(w.map, e.x, e.y, x, y)) return false;
  const n = Math.ceil(d / 0.3);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (!circleFree(w.map, e.x + (x - e.x) * t, e.y + (y - e.y) * t, e.radius * 0.95)) return false;
  }
  return true;
}

export interface GoOpts {
  /** não usa caminho (voador): vai reto */
  straight?: boolean;
}

/**
 * Vai até (x, y): linha reta quando cabe; senão pede caminho ao w.pathfinder, respeitando o
 * orçamento de buscas do tick (sem orçamento, segue o caminho velho ou vai reto e tenta depois).
 */
export function goTo(w: World, e: Entity, x: number, y: number, opts: GoOpts = {}): void {
  e.moveTo = { x, y };
  const pm = pathMind(e);
  if (opts.straight || !w.pathfinder || clearLine(w, e, x, y)) {
    e.path = undefined;
    pm.goal = undefined;
    return;
  }
  const moved = !pm.goal || dist(pm.goal.x, pm.goal.y, x, y) > AI_TUNING.repathMoveTiles;
  const due = pm.repathTick === undefined || w.tick >= pm.repathTick || !e.path || e.path.length === 0;
  if (!(moved || due)) return;
  const b = budget(w);
  if (b.paths >= AI_TUNING.pathBudgetPerTick) return; // sem orçamento: tenta no próximo tick
  b.paths++;
  pm.repathTick = w.tick + AI_TUNING.repathTicks;
  pm.goal = { x, y };
  const p = w.pathfinder(w.map, { x: e.x, y: e.y }, { x, y }, e.radius);
  e.path = p && p.length > 0 ? p : undefined;
}

/** Para de andar (sem destino nem caminho). */
export function stopMoving(e: Entity): void {
  e.moveTo = undefined;
  e.path = undefined;
}

/**
 * Melhor ponto para fugir: das 16 direções, a que mais se afasta das ameaças (peso 1/d²) e,
 * se houver, puxa para perto de um aliado; o ponto precisa caber e estar à vista.
 */
export function fleePoint(w: World, e: Entity, threats: readonly Entity[], tiles: number, toward?: Vec): Vec | undefined {
  let ax = 0, ay = 0;
  for (const t of threats) {
    const dx = e.x - t.x, dy = e.y - t.y;
    const d2 = Math.max(0.25, dx * dx + dy * dy);
    ax += dx / d2;
    ay += dy / d2;
  }
  let l = Math.hypot(ax, ay);
  if (l < 1e-9) return undefined;
  ax /= l;
  ay /= l;
  if (toward) {
    const tx = toward.x - e.x, ty = toward.y - e.y;
    const tl = Math.hypot(tx, ty);
    if (tl > 1.5) {
      ax += (tx / tl) * 0.6;
      ay += (ty / tl) * 0.6;
      l = Math.hypot(ax, ay) || 1;
      ax /= l;
      ay /= l;
    }
  }
  let best: Vec | undefined;
  let bs = -Infinity;
  for (let k = 0; k < 16; k++) {
    const ang = (k / 16) * Math.PI * 2;
    const ux = Math.cos(ang), uy = Math.sin(ang);
    // o mais longe que der nessa direção, até `tiles`
    let reach = 0;
    for (let s = 0.5; s <= tiles + 1e-9; s += 0.5) {
      const x = e.x + ux * s, y = e.y + uy * s;
      if (!circleFree(w.map, x, y, e.radius)) break;
      reach = s;
    }
    if (reach < 1) continue;
    const score = (ux * ax + uy * ay) * 2 + reach / tiles;
    if (score > bs) {
      bs = score;
      best = { x: e.x + ux * reach, y: e.y + uy * reach };
    }
  }
  return best;
}

/** O tile sob o ponto é água (rasa ou funda). */
export const isWaterAt = (w: World, x: number, y: number) => infoAt(w.map, Math.floor(x), Math.floor(y)).water === true;

/**
 * Para quem só anda na água: o ponto mais perto de (x, y) na reta até lá sem sair da água.
 * Devolve a posição atual se o primeiro passo já sai da água.
 */
export function waterGoal(w: World, e: Entity, x: number, y: number): Vec {
  const d = dist(e.x, e.y, x, y);
  if (d < 1e-6) return { x: e.x, y: e.y };
  let last = { x: e.x, y: e.y };
  const n = Math.ceil(d / 0.25);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const px = e.x + (x - e.x) * t, py = e.y + (y - e.y) * t;
    if (!isWaterAt(w, px, py) || !circleFree(w.map, px, py, e.radius)) break;
    last = { x: px, y: py };
  }
  return last;
}
