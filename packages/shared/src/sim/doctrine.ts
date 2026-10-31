/**
 * Doutrina: o modo automático do jogador, o plantão, a queda de conexão e os companheiros de IA.
 *
 * - Até 5 cartas se/faça, avaliadas em ordem. A primeira que vale e consegue agir age neste tick
 *   (lança algo, anda, ou os dois). Sem cartas próprias, vale a Doutrina padrão do papel, montada
 *   com os botões do arquétipo (doctrineFor/defaultDoctrine).
 * - Depois das cartas vem a rotina: Especial e botões quando fazem sentido (área em volta só com
 *   inimigo dentro, cura só com alguém ferido, escudo em si só apanhando...). O Especial numa
 *   carta com condição fica guardado para ela (a rotina não usa); 'sempre' e 'especial_pronto'
 *   não guardam nada.
 * - Movimento: até o alcance do básico do alvo (corpo a corpo encosta; à distância para no
 *   alcance); companheiro segue o líder do grupo, ou o jogador mais perto, e não se afasta dele
 *   mais que allyLeashTiles atrás de alvo; sem líder e sem alvo, vai atrás de inimigo à vista.
 * - Joystick mexido pelo jogador manda no movimento (a Doutrina só anda com o joystick parado).
 */
import { getData } from '../data';
import { hasLineOfSight } from '../map/grid';
import { castAbility, effectiveRange, groupOf, type CastOpts } from './abilities';
import { abilityOf, abilityReady, areaRadius, profileOf, type AbilityProfile } from './ai_kit';
import { AI_TUNING, doctrineMind, fleePoint, goTo, stopMoving } from './ai_state';
import { bal, JOYSTICK_DEADZONE } from './constants';
import { getEnt, HARMFUL_STATUS, hpRatio, isDowned, isTargetableBy, isUp } from './entity';
import { dist } from './geom';
import { loadoutFor } from './spawn';
import { resolveKit } from './stats';
import { autoTarget, canSee, nearestVisibleHostile } from './targeting';
import { msToTicks, type DoctrineCard, type Entity, type Loadout, type World } from './types';

type Button = 1 | 2 | 3;

/** O que uma carta (ou a rotina) fez neste tick. */
interface Acted {
  cast: boolean;
  moved: boolean;
  /** trocou de alvo */
  switched?: boolean;
}
const NONE: Acted = { cast: false, moved: false };

/** Um passo da Doutrina (o step chama na fase 2 para quem está no automático). */
export function tickDoctrine(w: World, e: Entity): void {
  if (!e.auto || !isUp(e) || !e.loadout) return;
  autoTarget(w, e);
  leashTarget(w, e);
  if (e.targetId !== undefined) doctrineMind(e).lastFoeId = e.targetId;
  const cards = doctrineFor(e);
  const reserved = reservedOf(cards);
  let res: Acted = NONE;
  for (const card of cards) {
    if (!cond(w, e, card.se)) continue;
    const r = act(w, e, card);
    if (r.cast || r.moved || r.switched) {
      res = r;
      break;
    }
  }
  if (!res.cast) routine(w, e, reserved, res.moved);
  if (!res.moved) move(w, e);
}

// ---------------------------------------------------------------------------
// Doutrina padrão

/** Cartas em uso: as do jogador (até 5) ou a padrão do papel e do arquétipo. */
export function doctrineFor(e: Entity): DoctrineCard[] {
  const max = bal().combate.doutrinaCartasMax;
  if (e.doctrine && e.doctrine.length > 0) return e.doctrine.slice(0, max);
  return defaultDoctrine(e).slice(0, max);
}

/** Botões de um loadout com o perfil de cada um. */
function buttons(L: Loadout): { b: Button; id: string; p: AbilityProfile }[] {
  const out: { b: Button; id: string; p: AbilityProfile }[] = [];
  ([1, 2, 3] as const).forEach((b) => {
    const id = b === 1 ? L.b1 : b === 2 ? L.b2 : L.b3;
    const p = id ? profileOf(id) : undefined;
    if (id && p) out.push({ b, id, p });
  });
  return out;
}

/**
 * Doutrina padrão pelo papel, com os botões do arquétipo (o botão de área com controle do
 * tanque, o de defesa, o de cura). Todas as cartas são SUGESTÃO; os docs só dão exemplos
 * ("cure quem estiver abaixo de 40%", "use o Especial no chefe", "fuja se ficar abaixo de 25%").
 * A poção só entra se consumables.pocao.usoAutomatico.padraoLigado (hoje desligado).
 */
export function defaultDoctrine(e: Pick<Entity, 'role' | 'loadout'>, opts: { pocaoAuto?: boolean } = {}): DoctrineCard[] {
  const L = e.loadout;
  const role = e.role ?? 'dano';
  const bs = L ? buttons(L) : [];
  const aoeCc = bs.find((x) => x.p.type === 'em_volta' && x.p.harmful && (x.p.control || x.p.taunt));
  const def = bs.find((x) => x.p.selfDefense && !x.p.harmful && x !== aoeCc);
  const cards: DoctrineCard[] = [];
  const pocao = getData().consumablesById.get('pocao')?.usoAutomatico;
  const potionOn = opts.pocaoAuto ?? pocao?.padraoLigado === true;
  const potion: DoctrineCard | undefined = potionOn && L?.item ? { se: { t: 'minha_vida_abaixo', pct: pocao?.vidaAbaixoPct ?? bal().combate.pocaoAutoAbaixoPct }, faca: { t: 'usar_item' } } : undefined;
  const levantar: DoctrineCard = { se: { t: 'aliado_caido_perto' }, faca: { t: 'levantar_aliado' } };
  const fugir: DoctrineCard = { se: { t: 'minha_vida_abaixo', pct: 25 } /* doc: "fuja se ficar abaixo de 25%" */, faca: { t: 'fugir' } };
  const especial: DoctrineCard = { se: { t: 'especial_pronto' }, faca: { t: 'usar_especial' } };
  switch (role) {
    case 'tanque':
      cards.push(levantar);
      if (potion) cards.push(potion);
      if (def) cards.push({ se: { t: 'minha_vida_abaixo', pct: 50 }, faca: { t: 'usar_botao', botao: def.b } });
      if (aoeCc) cards.push({ se: { t: 'inimigos_perto_min', n: 2, raio: 3 }, faca: { t: 'usar_botao', botao: aoeCc.b } });
      cards.push(especial);
      cards.push({ se: { t: 'sempre' }, faca: { t: 'focar_mais_perto' } });
      break;
    case 'cura':
      cards.push({ se: { t: 'aliado_vida_abaixo', pct: 40 } /* doc: "cure quem estiver abaixo de 40%" */, faca: { t: 'curar_aliado' } });
      cards.push(levantar);
      if (potion) cards.push(potion);
      cards.push(fugir);
      cards.push(especial);
      cards.push({ se: { t: 'sempre' }, faca: { t: 'seguir_grupo' } });
      break;
    case 'suporte':
      cards.push(levantar);
      if (bs.some((x) => x.p.heal || x.p.shieldAllies)) cards.push({ se: { t: 'aliado_vida_abaixo', pct: 50 }, faca: { t: 'curar_aliado' } });
      if (potion) cards.push(potion);
      cards.push(fugir);
      cards.push(especial);
      cards.push({ se: { t: 'sempre' }, faca: { t: 'seguir_grupo' } });
      break;
    default:
      if (potion) cards.push(potion);
      cards.push(fugir);
      cards.push(levantar);
      cards.push(especial);
      cards.push({ se: { t: 'sempre' }, faca: { t: 'focar_mais_fraco' } });
      break;
  }
  return cards.slice(0, bal().combate.doutrinaCartasMax);
}

/** Doutrina padrão de um arquétipo (ou classe, ou 'delta'), sem entidade: para a tela de cartas. */
export function doctrineForArchetype(archetypeId: string, side?: 'esquerda' | 'direita'): DoctrineCard[] {
  const kit = resolveKit(archetypeId, side);
  const role = kit.kind === 'arquetipo' ? kit.role : undefined;
  return defaultDoctrine({ ...(role ? { role } : {}), loadout: loadoutFor(kit) });
}

/**
 * O que fica guardado para as cartas (a rotina não usa): o Especial, quando ele aparece numa
 * carta com condição ("use o Especial no chefe" guarda o Especial para o chefe). Botões não
 * ficam guardados: a carta só dá prioridade a eles (recargas curtas, 6 a 20 s).
 */
function reservedOf(cards: readonly DoctrineCard[]): { b: Set<Button>; especial: boolean } {
  const out = { b: new Set<Button>(), especial: false };
  for (const c of cards) {
    if (c.se.t === 'sempre' || c.se.t === 'especial_pronto') continue;
    if (c.faca.t === 'usar_especial') out.especial = true;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Condições

const gap = (a: Entity, b: Entity) => dist(a.x, a.y, b.x, b.y) - a.radius - b.radius;

function target(w: World, e: Entity): Entity | undefined {
  const t = getEnt(w, e.targetId);
  return t && isTargetableBy(e, t) ? t : undefined;
}

function downedAlly(w: World, e: Entity): Entity | undefined {
  let best: Entity | undefined;
  let bd = Infinity;
  for (const m of groupOf(w, e, true)) {
    if (m.id === e.id || !isDowned(m)) continue;
    const d = dist(e.x, e.y, m.x, m.y);
    if (d <= AI_TUNING.reviveSearchTiles && d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}

function cond(w: World, e: Entity, se: DoctrineCard['se']): boolean {
  const t = target(w, e);
  switch (se.t) {
    case 'sempre':
      return true;
    case 'minha_vida_abaixo':
      return hpRatio(e) * 100 < se.pct;
    case 'aliado_vida_abaixo':
      return groupOf(w, e, false).some((m) => m.id !== e.id && hpRatio(m) * 100 < se.pct);
    case 'alvo_e_chefe':
      return !!t && t.tier === 'chefe';
    case 'alvo_e_elite_ou_chefe':
      return !!t && (t.tier === 'elite' || t.tier === 'chefe');
    case 'inimigos_perto_min': {
      let n = 0;
      for (const o of w.entities.values()) if (isTargetableBy(e, o) && dist(e.x, e.y, o.x, o.y) - o.radius <= se.raio) n++;
      return n >= se.n;
    }
    case 'especial_pronto':
      return e.special >= 1;
    case 'aliado_caido_perto':
      return downedAlly(w, e) !== undefined;
  }
}

// ---------------------------------------------------------------------------
// Ações das cartas

const buttonId = (L: Loadout, b: Button) => (b === 1 ? L.b1 : b === 2 ? L.b2 : L.b3);

function act(w: World, e: Entity, card: DoctrineCard): Acted {
  const L = e.loadout!;
  const faca = card.faca;
  switch (faca.t) {
    case 'usar_botao':
      return { cast: tryUse(w, e, buttonId(L, faca.botao), { permissive: true }), moved: false };
    case 'usar_especial':
      return { cast: e.special >= 1 && tryUse(w, e, L.especial, { permissive: true }), moved: false };
    case 'usar_item':
      return { cast: useItem(w, e), moved: false };
    case 'fugir':
      return flee(w, e);
    case 'curar_aliado':
      return healAlly(w, e, card.se.t === 'aliado_vida_abaixo' ? card.se.pct : AI_TUNING.healCardPct);
    case 'levantar_aliado':
      return revive(w, e);
    case 'focar_mais_fraco': {
      let best: Entity | undefined;
      const lead = leaderOf(w, e);
      for (const o of w.entities.values()) {
        if (!isTargetableBy(e, o) || dist(e.x, e.y, o.x, o.y) - o.radius > 8 || !canSee(w, e, o)) continue;
        if (lead && dist(lead.x, lead.y, o.x, o.y) > AI_TUNING.allyLeashTiles) continue;
        if (!best || hpRatio(o) < hpRatio(best) - 1e-9) best = o;
      }
      if (!best || best.id === e.targetId) return NONE;
      e.targetId = best.id;
      e.manualTarget = true;
      e.targetLostTick = undefined;
      return SWITCHED;
    }
    case 'focar_mais_perto': {
      const t = nearestVisibleHostile(w, e, 8);
      const lead = leaderOf(w, e);
      if (!t || t.id === e.targetId) return NONE;
      if (lead && dist(lead.x, lead.y, t.x, t.y) > AI_TUNING.allyLeashTiles) return NONE;
      e.targetId = t.id;
      e.manualTarget = true;
      e.targetLostTick = undefined;
      return SWITCHED;
    }
    case 'seguir_grupo': {
      const lead = leaderOf(w, e);
      if (!lead || target(w, e) || dist(e.x, e.y, lead.x, lead.y) <= AI_TUNING.followCardTiles) return NONE;
      walk(w, e, lead.x, lead.y);
      return { cast: false, moved: true };
    }
  }
}

/**
 * Trocar de alvo conta como agir (as cartas de baixo não valem neste tick), mas não lança nem
 * anda: a rotina ainda usa os botões no alvo novo e o movimento padrão vai até ele.
 */
const SWITCHED: Acted = { cast: false, moved: false, switched: true };

function useItem(w: World, e: Entity): boolean {
  const L = e.loadout!;
  if (!L.item || (L.itemCount ?? 0) <= 0) return false;
  const c = getData().consumablesById.get(L.item);
  return c ? castAbility(w, e, c.habilidade) : false;
}

/** Foge das ameaças por até fleeMaxMs (depois espera fleeCooldownMs), usando recuo, sumiço ou escudo. */
function flee(w: World, e: Entity): Acted {
  const dm = doctrineMind(e);
  if (dm.fleeReadyTick !== undefined && w.tick < dm.fleeReadyTick && (dm.fleeUntil === undefined || w.tick > dm.fleeUntil)) return NONE;
  const fleeing = dm.fleeUntil !== undefined && w.tick <= dm.fleeUntil;
  // começa a fugir com ameaça a até 6 tiles; fugindo, continua se afastando de quem está a até 10
  const r = fleeing ? 10 : 6;
  const threats: Entity[] = [];
  for (const o of w.entities.values()) if (isTargetableBy(e, o) && dist(e.x, e.y, o.x, o.y) <= r && o.kind !== 'summon') threats.push(o);
  if (threats.length === 0) return fleeing ? { cast: false, moved: true } : NONE;
  if (!fleeing) {
    dm.fleeUntil = w.tick + msToTicks(AI_TUNING.fleeMaxMs);
    dm.fleeReadyTick = dm.fleeUntil + msToTicks(AI_TUNING.fleeCooldownMs);
  }
  // recuo, sumiço ou defesa primeiro
  let cast = false;
  for (const x of buttons(e.loadout!)) {
    if (!(x.p.retreat || x.p.stealth || (x.p.selfDefense && !x.p.dash))) continue;
    if (abilityReady(w, e, x.id) && castAbility(w, e, x.id)) {
      cast = true;
      break;
    }
  }
  const lead = leaderOf(w, e);
  const p = fleePoint(w, e, threats, AI_TUNING.fleeTiles, lead && lead.id !== e.id ? lead : undefined);
  if (p) walk(w, e, p.x, p.y);
  return { cast, moved: p !== undefined };
}

/** Cura (ou escuda) o mais ferido do grupo abaixo de pct; fora do alcance, anda até ele. */
function healAlly(w: World, e: Entity, pct: number): Acted {
  let who: Entity | undefined;
  for (const m of groupOf(w, e, false)) {
    if (m.kind === 'summon' || hpRatio(m) * 100 >= pct) continue;
    if (!who || hpRatio(m) < hpRatio(who) - 1e-9) who = m;
  }
  if (!who) return NONE;
  const L = e.loadout!;
  const ids = [...buttons(L).filter((x) => x.p.heal || x.p.shieldAllies).map((x) => x.id)];
  const sp = profileOf(L.especial);
  if (sp && (sp.heal || sp.shieldAllies) && e.special >= 1) ids.unshift(L.especial);
  let anyReady = false;
  let need = 0;
  for (const id of ids) {
    if (!abilityReady(w, e, id)) continue;
    anyReady = true;
    const plan = aimHeal(w, e, id, who);
    if (plan.ok && castAbility(w, e, id, plan.opts)) return { cast: true, moved: false };
    need = Math.max(need, plan.reach);
  }
  if (anyReady && dist(e.x, e.y, who.x, who.y) > Math.max(1, need - 0.3) && who.id !== e.id) {
    walk(w, e, who.x, who.y);
    return { cast: false, moved: true };
  }
  return NONE;
}

/** Como lançar uma cura em `who`: precisa estar no alcance (aliado, área, campo) ou no raio (em volta). */
function aimHeal(w: World, e: Entity, id: string, who: Entity): { ok: boolean; opts: CastOpts; reach: number } {
  const a = abilityOf(id)!;
  const range = effectiveRange(e, a);
  const d = dist(e.x, e.y, who.x, who.y) - who.radius;
  if (a.type === 'aliado') {
    if (who.id === e.id) return { ok: true, opts: {}, reach: range };
    return { ok: d - e.radius <= Math.max(range, 0.5), opts: { targetId: who.id }, reach: range };
  }
  if (a.type === 'em_volta' || (a.type === 'campo' && a.range <= 0)) {
    const r = areaRadius(e, a);
    return { ok: who.id === e.id || d <= r - 0.2, opts: {}, reach: r };
  }
  // área ou campo lançado: cai em cima do ferido
  return { ok: d - e.radius <= range && hasLineOfSight(w.map, e.x, e.y, who.x, who.y), opts: { at: { x: who.x, y: who.y } }, reach: range };
}

/** Vai para o lado do aliado caído e fica lá até levantar (o step levanta em 3 s). */
function revive(w: World, e: Entity): Acted {
  const down = downedAlly(w, e);
  if (!down) return NONE;
  const r = bal().combate.levantarRaioTiles;
  if (dist(e.x, e.y, down.x, down.y) > r * 0.6) walk(w, e, down.x, down.y);
  else {
    stopMoving(e);
    doctrineMind(e).ownMove = false;
  }
  return { cast: false, moved: true };
}

// ---------------------------------------------------------------------------
// Rotina: Especial e botões quando fazem sentido

interface UseOpts {
  /** carta mandou: só recusa o claramente inútil */
  permissive?: boolean;
  /** já andando por carta: só o que está no alcance agora, sem avanço */
  strict?: boolean;
}

function routine(w: World, e: Entity, reserved: { b: Set<Button>; especial: boolean }, moved: boolean): void {
  const L = e.loadout!;
  const opts: UseOpts = moved ? { strict: true } : {};
  if (!reserved.especial && L.especial && e.special >= 1 && tryUse(w, e, L.especial, opts)) return;
  const cands = buttons(L)
    .filter((x) => !reserved.b.has(x.b))
    .map((x) => ({ ...x, s: priority(w, e, x.p) }))
    .filter((x) => x.s > 0)
    .sort((p, q) => q.s - p.s || p.b - q.b);
  for (const c of cands) if (tryUse(w, e, c.id, opts)) return;
}

/** Ordem da rotina pelo papel: cura e apoio primeiro para quem cura, controle para o tanque, dano para o dano. */
function priority(w: World, e: Entity, p: AbilityProfile): number {
  const role = e.role ?? 'dano';
  let s = 10;
  if (p.heal) s = role === 'cura' ? 100 : 85;
  else if (p.shieldAllies) s = role === 'cura' || role === 'suporte' ? 80 : 70;
  else if (p.selfDefense && !p.harmful) s = role === 'tanque' ? 75 : 60;
  else if (p.taunt || p.control) s = role === 'tanque' ? 85 : role === 'suporte' ? 75 : 65;
  else if (p.buff && !p.harmful) s = role === 'suporte' ? 72 : 55;
  else if (p.summon) s = 60;
  else if (p.harmful) s = 50 + Math.min(30, p.damage * 8) + (role === 'dano' ? 10 : 0);
  if (p.stealth || p.retreat) s = 40;
  void w;
  return s;
}

/** Tenta usar a habilidade se fizer sentido agora (alvo, raio, ferido, combate). */
function tryUse(w: World, e: Entity, id: string | undefined, o: UseOpts = {}): boolean {
  if (!id || !abilityReady(w, e, id)) return false;
  const a = abilityOf(id)!;
  const p = profileOf(id)!;
  const t = target(w, e);
  const d = t ? gap(e, t) : Infinity;
  const range = effectiveRange(e, a);
  const rad = areaRadius(e, a);
  const inCombat = (t !== undefined && d <= 6) || (e.lastCombatTick !== undefined && w.tick - e.lastCombatTick <= 40);
  if (o.strict && p.dash) return false;
  const slack = o.strict ? 0 : 2;

  // cura e escudo de aliados
  if ((p.heal || p.shieldAllies) && !p.harmful) {
    const hurtPct = o.permissive ? 99.9 : AI_TUNING.healRoutinePct;
    let who: Entity | undefined;
    for (const m of groupOf(w, e, false)) {
      if (m.kind === 'summon') continue;
      const hurt = hpRatio(m) * 100 < hurtPct || (p.cleanse && m.statuses.some((s) => HARMFUL_STATUS.includes(s.kind)));
      const shieldUseful = p.shieldAllies && !p.heal && inCombat && hpRatio(m) < 0.95;
      if (!hurt && !shieldUseful) continue;
      if (!who || hpRatio(m) < hpRatio(who)) who = m;
    }
    if (!who && p.resource && e.resource < e.stats.resourceMax * 0.35) who = e;
    if (!who) return false;
    const plan = aimHeal(w, e, id, who);
    return plan.ok && castAbility(w, e, id, plan.opts);
  }
  if (p.resource && !p.harmful && !p.heal) return e.resource < e.stats.resourceMax * 0.35 && castAbility(w, e, id);
  // fuga: sumiço e recuo
  if ((p.stealth || p.retreat) && !p.harmful && !o.permissive) {
    const close = nearestVisibleHostile(w, e, 2.5);
    return !!close && (hpRatio(e) < 0.5 || p.retreat) && castAbility(w, e, id);
  }
  if (p.retreat && !o.permissive) {
    // recuo com área (Recuo do Atirador): quando alguém encosta
    const close = nearestVisibleHostile(w, e, 2);
    return !!close && castAbility(w, e, id);
  }
  // defesa em si
  if (p.selfDefense && !p.harmful) {
    if (o.permissive) return inCombat && castAbility(w, e, id);
    const pressed = inCombat && (hpRatio(e) < 0.7 || attackersRecent(w, e) >= 2);
    return pressed && castAbility(w, e, id);
  }
  // reforço e transformação
  if ((p.buff || p.summon) && !p.harmful) {
    if (!inCombat || !t) return false;
    if (a.type === 'aliado') {
      const ally = nearestAlly(w, e, Math.max(range, 1));
      return castAbility(w, e, id, ally ? { targetId: ally.id } : {});
    }
    if (a.type === 'campo' && a.range > 0) return d <= range + slack && castAbility(w, e, id, { targetId: t.id });
    return d <= Math.max(rad, effectiveRange(e, abilityOf(e.loadout!.basico) ?? a) + 1, 3) && castAbility(w, e, id);
  }
  // dano, controle, empurrão...
  if (!p.harmful || !t) return false;
  if (a.type === 'em_volta' || (a.type === 'campo' && a.range <= 0)) {
    const n = hostilesWithin(w, e, rad - 0.1);
    return n > 0 && castAbility(w, e, id);
  }
  if (a.type === 'cone') return d <= range + (o.strict ? 0 : 0.3) && castAbility(w, e, id, { targetId: t.id });
  if (p.dash && !o.permissive && d < 1) return false; // avanço colado não rende
  if (p.control && !o.permissive && t.ccImmuneUntil > w.tick && t.tier !== 'chefe' && p.damage < 1) return false;
  return d <= range + slack && castAbility(w, e, id, { targetId: t.id });
}

function attackersRecent(w: World, e: Entity): number {
  let n = 0;
  for (const tick of Object.values(e.attackers ?? {})) if (w.tick - tick <= 40) n++;
  return n;
}

function hostilesWithin(w: World, e: Entity, r: number): number {
  let n = 0;
  for (const o of w.entities.values()) {
    if (!isTargetableBy(e, o)) continue;
    if (dist(e.x, e.y, o.x, o.y) - o.radius <= r && hasLineOfSight(w.map, e.x, e.y, o.x, o.y)) n++;
  }
  return n;
}

function nearestAlly(w: World, e: Entity, r: number): Entity | undefined {
  let best: Entity | undefined;
  let bd = Infinity;
  for (const m of groupOf(w, e, false)) {
    if (m.id === e.id || m.kind === 'summon') continue;
    const d = dist(e.x, e.y, m.x, m.y) - m.radius;
    if (d <= r && d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Movimento

/** Líder: o jogador ao vivo do grupo com menor id (sem grupo, o jogador mais perto do time). */
export function leaderOf(w: World, e: Entity): Entity | undefined {
  const live = e.kind === 'player' && !e.onDuty;
  // jogador ao vivo sem grupo não segue ninguém
  if (live && e.partyId === undefined) return undefined;
  let best: Entity | undefined;
  let bd = Infinity;
  for (const m of groupOf(w, e, false)) {
    if (m.kind !== 'player') continue;
    // com grupo: manda o jogador ao vivo de menor id (plantonista só se não houver outro);
    // sem grupo (companheiro solto): o jogador mais perto do time
    const score = e.partyId !== undefined ? (m.onDuty ? 1e6 : 0) + m.id : m.id === e.id ? Infinity : dist(e.x, e.y, m.x, m.y);
    if (score < bd) {
      bd = score;
      best = m;
    }
  }
  return best && best.id !== e.id ? best : undefined;
}

/** Companheiro não vai atrás de alvo longe do líder. */
function leashTarget(w: World, e: Entity): void {
  const t = target(w, e);
  const lead = leaderOf(w, e);
  if (!t || !lead) return;
  if (dist(lead.x, lead.y, t.x, t.y) > AI_TUNING.allyLeashTiles) {
    e.targetId = undefined;
    e.manualTarget = false;
  }
}

/** Anda pela Doutrina (marca que o destino é dela, para não apagar o toque do jogador). */
function walk(w: World, e: Entity, x: number, y: number): void {
  if (Math.hypot(e.moveIntent.x, e.moveIntent.y) >= JOYSTICK_DEADZONE) return;
  goTo(w, e, x, y);
  doctrineMind(e).ownMove = true;
}

function stopOwn(e: Entity): void {
  const dm = doctrineMind(e);
  if (dm.ownMove) {
    stopMoving(e);
    dm.ownMove = false;
  }
}

/** Movimento padrão: até o alcance do básico do alvo; sem alvo, segue o líder ou procura inimigo. */
function move(w: World, e: Entity): void {
  if (Math.hypot(e.moveIntent.x, e.moveIntent.y) >= JOYSTICK_DEADZONE) return;
  const t = target(w, e);
  const basic = abilityOf(e.loadout!.basico);
  if (t) {
    const reach = basic ? effectiveRange(e, basic) : 1;
    const d = gap(e, t);
    const want = reach <= 1.5 ? Math.max(0.1, reach - 0.15) : reach - 0.3;
    if (d > want || !canSee(w, e, t)) {
      // habilidade pendente anda sozinha até o alcance dela
      if (e.pendingCast && !e.moveTo) return;
      walk(w, e, t.x, t.y);
    } else {
      stopOwn(e);
      if (!e.pendingCast) stopMoving(e);
    }
    return;
  }
  const lead = leaderOf(w, e);
  if (lead) {
    const k = (e.id % 4) + 1;
    const ang = (k / 4) * Math.PI * 2;
    const gx = lead.x + Math.cos(ang) * 1.4, gy = lead.y + Math.sin(ang) * 1.4;
    if (dist(e.x, e.y, lead.x, lead.y) > AI_TUNING.followTiles) walk(w, e, gx, gy);
    else stopOwn(e);
    return;
  }
  // sozinho e sem alvo: volta atrás do último inimigo, ou vai atrás de inimigo à vista (o alvo trava a 8 tiles)
  const dm = doctrineMind(e);
  const last = getEnt(w, dm.lastFoeId);
  const foe =
    last && isTargetableBy(e, last) && dist(e.x, e.y, last.x, last.y) <= AI_TUNING.lastFoeTiles && canSee(w, e, last)
      ? last
      : nearestVisibleHostile(w, e, AI_TUNING.seekTiles);
  if (foe) walk(w, e, foe.x, foe.y);
  else stopOwn(e);
}
