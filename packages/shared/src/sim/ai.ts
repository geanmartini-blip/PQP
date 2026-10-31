/**
 * IA dos inimigos, pelos comportamentos de enemies.json (corpo_a_corpo, a_distancia, enxame,
 * suporte) e pelas flags imovel, voa, soNaAgua e escolta.
 *
 * - Dormindo: só olha em volta com jogador perto (a cada sleepThinkTicks, escalonado). Acorda ao
 *   ver alguém no raio de percepção (com linha de visão) ou ao apanhar, e chama o bando.
 * - Combate: provocação manda; senão o alvo atual enquanto valer; senão quem bateu; senão o mais
 *   perto à vista. Sem ver o alvo, vai até onde o viu por último e desiste depois de um tempo.
 * - Coleira: longe demais de onde nasceu, volta para casa imune, curando, e chega com vida cheia.
 * - Habilidades com prioridade (cura e escudo dos aliados, controle, golpe grande, avanço, dano,
 *   reforço), só quando estão no alcance; ataque grande sem aviso de 800 ms nunca é usado.
 * - Posição: corpo a corpo encosta; enxame cerca; à distância mantém o alcance e recua quando o
 *   jogador encosta; suporte fica perto do aliado mais ferido.
 * - Chefe: fases pela vida, para durante o aviso no chão até logo depois do impacto, evita repetir
 *   a última habilidade e respeita a provocação mesmo virando lentidão.
 * - Afixos de elite aparecem como estado 'afixo:<id>' (evento status) ao nascer na IA.
 * - Desempenho: dormindo longe de jogadores não pensa; a busca de caminho tem orçamento por tick.
 */
import { getData } from '../data';
import { hasLineOfSight } from '../map/grid';
import { castAbility, effectiveRange } from './abilities';
import { abilityOf, abilityReady, areaRadius, profileOf } from './ai_kit';
import { packMates } from './ai_pack';
import { bossPhases, resetBoss, tauntOf } from './ai_boss';
import { AI_TUNING, aggroOf, enemyMind, goTo, leashOf, partyNear, stopMoving, waterGoal, fleePoint, type EnemyMind } from './ai_state';
import { applyStatus, heal, removeStatuses } from './combat';
import { canAct, getEnt, HARMFUL_STATUS, hasStatus, hpRatio, isDowned, isFriendly, isTargetableBy, isUp } from './entity';
import { dist } from './geom';
import { enemyAi, type EnemyAi } from './spawn';
import { canSee, nearestVisibleHostile } from './targeting';
import { msToTicks, type Entity, type World } from './types';
import { emit } from './world';

// SUGESTÃO: estados "permanentes" (afixo, voltando) duram 10^9 ms; somem por código.
const FOREVER_MS = 1e9;
const RETURN_TAG = 'ia:voltando';

/** Um passo de decisão da IA de um inimigo (o step chama na fase 2). */
export function tickAi(w: World, e: Entity): void {
  if (e.kind !== 'enemy' || !isUp(e)) return;
  const ai = enemyAi(e);
  const m = enemyMind(e);
  if (!m.init) initMind(w, e, m);
  const def = getData().enemiesById.get(e.defId);
  if (def?.fases) bossPhases(w, e);

  // golpe novo recebido?
  const hitBy = newAttacker(w, e, m);

  if (m.state === 'voltando') {
    tickReturn(w, e, m);
    return;
  }
  if (m.state === 'dormindo') {
    let seen: Entity | undefined = hitBy;
    if (!seen) {
      const taunt = tauntOf(w, e);
      if (taunt) seen = taunt;
    }
    if (!seen && (w.tick + e.id) % AI_TUNING.sleepThinkTicks === 0 && partyNear(w, e, AI_TUNING.activeRadius)) {
      seen = nearestVisibleHostile(w, e, aggroOf(e));
    }
    if (!seen) {
      idle(w, e, m, ai);
      return;
    }
    wake(w, e, m, seen, true);
  }
  combat(w, e, m, ai, hitBy);
}

// ---------------------------------------------------------------------------
// Estados

function initMind(w: World, e: Entity, m: EnemyMind): void {
  m.init = true;
  // afixos de elite visíveis: um estado por afixo (o cliente desenha poeira, placas, pavio, cruz)
  for (const id of e.affixes ?? []) {
    if (!e.statuses.some((s) => s.kind === `afixo:${id}`)) applyStatus(w, e, e, { kind: `afixo:${id}`, durationMs: FOREVER_MS, value: 1, abilityId: 'afixo' });
  }
}

/** Golpe recebido desde a última olhada: devolve quem bateu (ou o dono da invocação), se ainda vale. */
function newAttacker(w: World, e: Entity, m: EnemyMind): Entity | undefined {
  if (!e.attackers) return undefined;
  let best: Entity | undefined;
  let bt = m.seenHitTick;
  for (const [k, tick] of Object.entries(e.attackers)) {
    if (tick <= m.seenHitTick) continue;
    const a = getEnt(w, Number(k));
    if (tick > bt && a && isTargetableBy(e, a)) {
      bt = tick;
      best = a;
    }
  }
  for (const tick of Object.values(e.attackers)) if (tick > m.seenHitTick) m.seenHitTick = tick;
  return best;
}

/** Acorda com um alvo e (opcional) chama o bando. */
function wake(w: World, e: Entity, m: EnemyMind, t: Entity, callPack: boolean): void {
  m.state = 'combate';
  m.chaseId = t.id;
  m.lastSeen = { x: t.x, y: t.y };
  m.lastSeenTick = w.tick;
  e.targetId = t.id;
  const ai = enemyAi(e);
  if (!ai.saidHello) {
    ai.saidHello = true;
    const falas = getData().enemiesById.get(e.defId)?.falas?.aoAparecer;
    if (falas && falas.length > 0) emit(w, { t: 'say', src: e.id, text: falas[w.rng.int(0, falas.length - 1)]! });
  }
  if (!callPack) return;
  for (const o of packMates(w, e)) {
    const om = enemyMind(o);
    if (om.state === 'dormindo' || (om.state === 'combate' && om.chaseId === undefined)) wake(w, o, om, t, false);
  }
}

/** Parado em casa; a escolta acompanha quem ela protege. */
function idle(w: World, e: Entity, m: EnemyMind, ai: EnemyAi): void {
  if (ai.imovel) return;
  const lead = getEnt(w, m.leaderId);
  if (lead && isUp(lead) && dist(e.x, e.y, lead.x, lead.y) > 3) {
    moveTo(w, e, lead.x + Math.cos(m.slot) * 1.5, lead.y + Math.sin(m.slot) * 1.5);
    return;
  }
  if (e.moveTo || e.path) {
    const home = homeOf(e);
    if (!lead && dist(e.x, e.y, home.x, home.y) < 0.3) stopMoving(e);
    else if (lead && dist(e.x, e.y, lead.x, lead.y) <= 2) stopMoving(e);
  }
}

const homeOf = (e: Entity) => ({ x: e.spawnX ?? e.x, y: e.spawnY ?? e.y });

/** Começa a volta para casa: larga o alvo, fica imune e vai curando. */
function startReturn(w: World, e: Entity, m: EnemyMind): void {
  m.state = 'voltando';
  m.chaseId = undefined;
  m.lastSeen = undefined;
  m.busyUntil = 0;
  m.nextReturnHealTick = w.tick + msToTicks(1000);
  e.targetId = undefined;
  e.pendingCast = undefined;
  e.casting = undefined;
  removeStatuses(w, e, (s) => HARMFUL_STATUS.includes(s.kind));
  applyStatus(w, e, e, { kind: 'imune', durationMs: FOREVER_MS, value: 1, abilityId: RETURN_TAG, data: { aDano: true, aControle: true } });
  applyStatus(w, e, e, { kind: 'voltando', durationMs: FOREVER_MS, value: 1, abilityId: RETURN_TAG });
  if (e.tier === 'chefe') resetBoss(w, e);
}

function tickReturn(w: World, e: Entity, m: EnemyMind): void {
  const home = homeOf(e);
  const ai = enemyAi(e);
  if (w.tick >= (m.nextReturnHealTick ?? 0)) {
    m.nextReturnHealTick = w.tick + msToTicks(1000);
    heal(w, e, e, (AI_TUNING.returnHealPctPerS / 100) * e.stats.hpMax, { abilityId: RETURN_TAG });
  }
  if (ai.imovel || dist(e.x, e.y, home.x, home.y) < 0.4) {
    stopMoving(e);
    if (e.hp < e.stats.hpMax) heal(w, e, e, e.stats.hpMax - e.hp, { abilityId: RETURN_TAG });
    removeStatuses(w, e, (s) => s.abilityId === RETURN_TAG);
    m.state = 'dormindo';
    m.seenHitTick = Math.max(m.seenHitTick, w.tick);
    return;
  }
  moveTo(w, e, home.x, home.y);
}

// ---------------------------------------------------------------------------
// Combate

function combat(w: World, e: Entity, m: EnemyMind, ai: EnemyAi, hitBy: Entity | undefined): void {
  const home = homeOf(e);
  if (!ai.imovel && dist(e.x, e.y, home.x, home.y) > leashOf(e)) {
    startReturn(w, e, m);
    tickReturn(w, e, m);
    return;
  }
  // derrubou o alvo: comemora e procura outro
  cheer(w, e, m);
  const t = chooseTarget(w, e, m, hitBy);
  if (!t) {
    e.targetId = undefined;
    const lost = m.lastSeenTick === undefined || w.tick - m.lastSeenTick > msToTicks(AI_TUNING.loseSightMs);
    if (lost || ai.imovel || !m.lastSeen) {
      startReturn(w, e, m);
      tickReturn(w, e, m);
      return;
    }
    moveTo(w, e, m.lastSeen.x, m.lastSeen.y);
    if (dist(e.x, e.y, m.lastSeen.x, m.lastSeen.y) < 0.5) m.lastSeen = undefined;
    return;
  }
  e.targetId = t.id;
  const visible = canSee(w, e, t);
  if (visible) {
    m.lastSeen = { x: t.x, y: t.y };
    m.lastSeenTick = w.tick;
  }
  useAbilities(w, e, m, ai, t, visible);
  position(w, e, m, ai, t, visible);
}

/** Provocação; alvo atual válido; quem acabou de bater; o mais perto à vista. */
function chooseTarget(w: World, e: Entity, m: EnemyMind, hitBy: Entity | undefined): Entity | undefined {
  const taunt = tauntOf(w, e);
  if (taunt) {
    m.chaseId = taunt.id;
    return taunt;
  }
  // alvo trocado de fora (invocação que distrai) vale
  const ext = getEnt(w, e.targetId);
  if (ext && ext.id !== m.chaseId && isTargetableBy(e, ext) && canSee(w, e, ext)) m.chaseId = ext.id;
  const cur = getEnt(w, m.chaseId);
  if (cur && isTargetableBy(e, cur) && !hasStatus(cur, 'invisivel')) {
    const d = dist(e.x, e.y, cur.x, cur.y);
    if (d <= leashOf(e) + aggroOf(e)) return cur;
  }
  if (hitBy && isTargetableBy(e, hitBy)) {
    m.chaseId = hitBy.id;
    return hitBy;
  }
  const near = nearestVisibleHostile(w, e, aggroOf(e) * 1.5);
  m.chaseId = near?.id;
  return near;
}

/** Fala aoDerrotarJogador quando o jogador que ele perseguia cai. */
function cheer(w: World, e: Entity, m: EnemyMind): void {
  const prev = getEnt(w, m.chaseId);
  if (!prev || prev.kind !== 'player' || !isDowned(prev)) return;
  m.cheered ??= [];
  if (m.cheered.includes(prev.id)) return;
  if ((prev.attackers === undefined || prev.attackers[e.id] === undefined) && e.tier !== 'chefe') return;
  m.cheered.push(prev.id);
  if (m.cheered.length > 8) m.cheered.shift();
  const falas = getData().enemiesById.get(e.defId)?.falas?.aoDerrotarJogador;
  if (falas && falas.length > 0) emit(w, { t: 'say', src: e.id, text: falas[w.rng.int(0, falas.length - 1)]! });
  m.chaseId = undefined;
}

// ---------------------------------------------------------------------------
// Habilidades

/** Distância borda a borda. */
const gap = (a: Entity, b: Entity) => dist(a.x, a.y, b.x, b.y) - a.radius - b.radius;

function useAbilities(w: World, e: Entity, m: EnemyMind, ai: EnemyAi, t: Entity, visible: boolean): void {
  if (!canAct(e) || e.casting || w.tick < e.gcdUntil || w.tick < m.busyUntil) return;
  const scored: { id: string; s: number; i: number }[] = [];
  ai.abilities.forEach((id, i) => {
    if (!abilityReady(w, e, id)) return;
    const s = scoreAbility(w, e, m, id, t, visible);
    if (s > 0) scored.push({ id, s, i });
  });
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  for (const c of scored) {
    if (!castAbility(w, e, c.id, { targetId: t.id })) continue;
    e.pendingCast = undefined; // inimigo nunca fica esperando alcance
    m.lastAbility = c.id;
    const a = abilityOf(c.id)!;
    if (e.tier === 'chefe' && a.telegraphMs > 0) {
      m.busyUntil = w.tick + msToTicks(a.castMs + a.telegraphMs + AI_TUNING.bossPauseAfterImpactMs);
    }
    return;
  }
}

/** Nota de uma habilidade agora (0 = não usar). */
function scoreAbility(w: World, e: Entity, m: EnemyMind, id: string, t: Entity, visible: boolean): number {
  const a = abilityOf(id);
  const p = profileOf(id);
  if (!a || !p) return 0;
  // regra dos docs: ataque grande de inimigo só com aviso no chão de pelo menos 0,8 s
  if (p.big && a.telegraphMs < getData().enemies.regrasChefe.avisoMinMs) return 0;
  const d = gap(e, t);
  const range = effectiveRange(e, a);
  const rad = areaRadius(e, a);
  let s = 0;
  // apoio aos aliados
  if (p.heal || p.shieldAllies) {
    const hurt = alliesInRadius(w, e, Math.max(rad, range, 3)).filter((o) => o.id !== e.id && hpRatio(o) < (p.heal ? 0.8 : 0.95));
    if (hurt.length > 0) s = Math.max(s, 100 + hurt.length);
  }
  if (p.harmful) {
    let reach: boolean;
    if (a.type === 'em_volta' || (a.type === 'campo' && a.range <= 0)) reach = d + e.radius <= rad - 0.2;
    else if (a.type === 'cone') reach = d <= range && visible;
    else reach = d <= range && visible;
    if (reach) {
      let h = 40 + p.damage * 10;
      if (p.control) h = Math.max(h, 80) + (t.ccImmuneUntil > w.tick ? -60 : 0);
      if (p.big) h += 20;
      if (p.dash) h = d > 1.5 ? h + 15 : h - 30;
      if (p.pull) h = d > 1.5 ? h + 25 : h - 30;
      if (p.marks) h = Math.max(h, 55);
      s = Math.max(s, h);
    }
  }
  // reforço em si (Liquidação Total) com o alvo perto
  if (!p.harmful && !p.heal && !p.shieldAllies && (p.buff || p.selfDefense) && d <= 4) s = Math.max(s, 35);
  if (!p.harmful && p.stealth && d <= range + 1) s = Math.max(s, 45);
  // o padrão do chefe evita repetir a mesma em seguida
  if (s > 0 && e.tier === 'chefe' && m.lastAbility === id) s -= 25;
  return s;
}

function alliesInRadius(w: World, e: Entity, r: number): Entity[] {
  const out: Entity[] = [];
  for (const o of w.entities.values()) {
    if (o.kind === 'loot' || !isUp(o) || !isFriendly(e, o)) continue;
    if (dist(e.x, e.y, o.x, o.y) - o.radius <= r && hasLineOfSight(w.map, e.x, e.y, o.x, o.y)) out.push(o);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Posição

function position(w: World, e: Entity, m: EnemyMind, ai: EnemyAi, t: Entity, visible: boolean): void {
  if (ai.imovel) {
    stopMoving(e);
    return;
  }
  // chefe parado durante o próprio aviso no chão
  if (w.tick < m.busyUntil) {
    stopMoving(e);
    return;
  }
  const basic = abilityOf(ai.basic);
  const reach = basic ? effectiveRange(e, basic) : 1;
  const d = gap(e, t);
  const healer = ai.behavior === 'suporte' || (e.affixes ?? []).includes('cura_os_outros');
  const ranged = ai.behavior === 'a_distancia' || ai.behavior === 'suporte' || reach >= 2;

  if (!visible) {
    moveTo(w, e, t.x, t.y);
    return;
  }
  if (healer) {
    // fica perto do aliado mais ferido (sem sair do alcance do alvo)
    const hurt = mostHurtMate(w, e);
    if (hurt && dist(e.x, e.y, hurt.x, hurt.y) > AI_TUNING.supportStayTiles && d <= reach + 2) {
      moveTo(w, e, hurt.x, hurt.y);
      return;
    }
  }
  if (ranged) {
    if (d > reach - 0.3) {
      moveTo(w, e, t.x, t.y);
      return;
    }
    if (d < AI_TUNING.rangedMinGap && w.tick >= m.kiteReadyTick) {
      const p = fleePoint(w, e, [t], AI_TUNING.kiteTiles);
      m.kiteReadyTick = w.tick + msToTicks(AI_TUNING.kiteEveryMs);
      if (p) {
        m.kiteUntil = w.tick + msToTicks(1000);
        moveTo(w, e, p.x, p.y);
        return;
      }
    }
    // recuando: deixa terminar (até 1 s); senão fica parado atirando
    if (e.moveTo && m.kiteUntil !== undefined && w.tick < m.kiteUntil) return;
    stopMoving(e);
    return;
  }
  // corpo a corpo e enxame
  const want = Math.max(0.1, reach - 0.15);
  if (d <= want) {
    stopMoving(e);
    return;
  }
  if (ai.behavior === 'enxame' && d > 1.2) {
    // cerca: vai para a vaga dele em volta do alvo
    const r = t.radius + e.radius + Math.max(0.2, reach * 0.6);
    moveTo(w, e, t.x + Math.cos(m.slot) * r, t.y + Math.sin(m.slot) * r);
    return;
  }
  moveTo(w, e, t.x, t.y);
}

function mostHurtMate(w: World, e: Entity): Entity | undefined {
  let best: Entity | undefined;
  for (const o of w.entities.values()) {
    if (o.id === e.id || o.kind !== 'enemy' || o.team !== e.team || !isUp(o)) continue;
    if (dist(e.x, e.y, o.x, o.y) > 8 || hpRatio(o) >= 0.9) continue;
    if (!best || hpRatio(o) < hpRatio(best)) best = o;
  }
  return best;
}

/** Andar respeitando voa (reto e ziguezagueando) e soNaAgua (não sai da água). */
function moveTo(w: World, e: Entity, x: number, y: number): void {
  const def = getData().enemiesById.get(e.defId);
  if (def?.soNaAgua) {
    const g = waterGoal(w, e, x, y);
    if (dist(e.x, e.y, g.x, g.y) < 0.1) stopMoving(e);
    else {
      e.moveTo = g;
      e.path = undefined;
    }
    return;
  }
  if (def?.voa) {
    const dx = x - e.x, dy = y - e.y;
    const l = Math.hypot(dx, dy);
    if (l > 1.5) {
      const wob = Math.sin((w.tick + e.id * 7) * 0.25) * AI_TUNING.flyWobbleTiles;
      x += (-dy / l) * wob;
      y += (dx / l) * wob;
    }
    goTo(w, e, x, y, { straight: true });
    return;
  }
  goTo(w, e, x, y);
}

export { spawnPack, packMates, type SpawnPackOpts } from './ai_pack';
export { enemyMind, AI_TUNING, type EnemyMind } from './ai_state';
