/**
 * Fase 3: passivos de talento e de guia em ação, uma vez por tick (step.ts chama
 * tickTalentPassives antes da limpeza). Lê os eventos do tick (golpe, crítico, morte, caído,
 * lançamento, cura, controle) e dispara os gatilhos; cuida também do que é por tempo (auras,
 * intervalo, recarga, fora de combate, sem tomar dano e números com condição sobre si mesmo).
 *
 * Os efeitos dos passivos usam o motor das habilidades (abilities.resolveAbility) com uma
 * habilidade sintética em volta de quem tem o passivo, então reforço, cura, escudo, lentidão,
 * controle, marca e invocação valem igual às habilidades. Ganchos de passivo (params.gancho) têm
 * registro próprio (registerPassiveHook); gancho sem registro não faz nada.
 *
 * Só entidades com Entity.talents ou Entity.guideId entram: inimigos e o simulador sem talentos
 * não mudam. Nada aqui usa Math.random nem Date.
 */
import { getData } from '../data';
import type { Ability, Effect, Passive } from '../schema/ability';
import { resolveAbility } from './abilities';
import { applyStatus, creditId, heal, removeStatuses, reviveEntity } from './combat';
import { bal } from './constants';
import { CC_KINDS, getEnt, hpRatio, isDamageable, isDowned, isFriendly, isHostile, isUp } from './entity';
import { dist } from './geom';
import { hasTargetCondition, isFlatNumber, sourcedPassivesOf, type SourcedPassive } from './passiveDefs';
import { msToTicks, TICK_MS, type CombatEvent, type Entity, type Telegraph, type World } from './types';
import { emit } from './world';

/** SUGESTÃO: auras e números com condição são renovados a cada 5 ticks (250 ms), com estado de 600 ms. */
const AURA_EVERY_TICKS = 5;
const AURA_STATUS_MS = 600;
/** SUGESTÃO: duração do reforço de um gatilho que só dá número (sem duração nos dados). */
const TRIGGER_BUFF_MS = 5000;
/** SUGESTÃO: o guia comenta o bônus no máximo a cada 15 s. */
const GUIDE_SAY_COOLDOWN_MS = 15000;
/** SUGESTÃO: limiar de "pouca vida" quando o passivo não diz. */
const LOW_HP_PCT_DEFAULT = 30;

const raioPadrao = () => getData().talents.regras.raioPertoPadrao;

export interface PassiveHookCtx {
  w: World;
  e: Entity;
  sp: SourcedPassive;
  target?: Entity;
  ev?: CombatEvent;
}
export type PassiveHookFn = (ctx: PassiveHookCtx) => void;

const hooks = new Map<string, PassiveHookFn>();

/** Registra a regra em código de um passivo (Passive.gancho). */
export function registerPassiveHook(name: string, fn: PassiveHookFn): void {
  hooks.set(name, fn);
}
export const hasPassiveHook = (name: string) => hooks.has(name);

const st = (e: Entity) => (e.passiveState ??= {});

const inCombat = (w: World, e: Entity) => e.lastCombatTick !== undefined && w.tick - e.lastCombatTick <= msToTicks(bal().combate.regenForaDeCombate.aposMs);

function ready(w: World, e: Entity, sp: SourcedPassive): boolean {
  if (!sp.p.recargaS) return true;
  return (st(e)[`cd:${sp.key}`] ?? -1) <= w.tick;
}

function arm(w: World, e: Entity, sp: SourcedPassive): void {
  if (sp.p.recargaS) st(e)[`cd:${sp.key}`] = w.tick + msToTicks(sp.p.recargaS * 1000);
}

function countNear(w: World, e: Entity, hostile: boolean, raio: number): number {
  let n = 0;
  for (const t of w.entities.values()) {
    if (t.id === e.id || !isUp(t) || t.kind === 'loot' || t.kind === 'summon') continue;
    if (hostile ? !isHostile(e, t) || !isDamageable(t) : !isFriendly(e, t)) continue;
    if (dist(e.x, e.y, t.x, t.y) <= raio) n++;
  }
  return n;
}

/** Condição sobre quem tem o passivo (vida, gente perto, região de natureza ou cidade). */
function selfCondOk(w: World, e: Entity, p: Passive): boolean {
  const c = p.condicao;
  if (!c) return true;
  if (c.vidaAbaixoPct !== undefined && !(hpRatio(e) * 100 < c.vidaAbaixoPct)) return false;
  if (c.vidaAcimaPct !== undefined && !(hpRatio(e) * 100 > c.vidaAcimaPct)) return false;
  const raio = p.raio ?? raioPadrao();
  if (c.inimigosPertoMin !== undefined && countNear(w, e, true, raio) < c.inimigosPertoMin) return false;
  if (c.aliadosPertoMin !== undefined && countNear(w, e, false, raio) < c.aliadosPertoMin) return false;
  if (c.regiao) {
    // natureza e cidade pelas regiões de encantoMaquina; o resto (mata, água, lama...) fica para o mapa
    // SUGESTÃO: 'mata' conta como natureza até o mapa marcar a mata.
    const reg = w.map.regions.find((r) => e.x >= r.x && e.y >= r.y && e.x < r.x + r.w && e.y < r.y + r.h)?.regionId;
    const kind = c.regiao === 'mata' ? 'natureza' : c.regiao;
    const mod = bal().encantoMaquina.modificadores.find((m) => m.condicao === kind);
    if (!reg || !mod?.regioes?.includes(reg as never)) return false;
  }
  return true;
}

/** Fala de bônus do guia (guides.json, situação 'bonus'), com intervalo mínimo. */
function sayGuideBonus(w: World, e: Entity, guideId: string): void {
  const k = 'say:guia';
  if ((st(e)[k] ?? -1) > w.tick) return;
  const g = getData().guidesById.get(guideId);
  const line = g?.falas.find((f) => f.situacao === 'bonus')?.texto;
  if (!line) return;
  st(e)[k] = w.tick + msToTicks(GUIDE_SAY_COOLDOWN_MS);
  emit(w, { t: 'say', src: e.id, text: line.replaceAll('{nome}', e.name) });
}

/** Aplica os efeitos do passivo com uma habilidade sintética em volta de quem tem o passivo. */
function runEffects(w: World, e: Entity, sp: SourcedPassive, efs: readonly Effect[], target?: Entity): void {
  const rest: Effect[] = [];
  for (const ef of efs) {
    if (ef.kind === 'levantar' || ef.kind === 'segurar_vida') {
      // gatilho de caído: levanta na hora (com vidaMin) e segura a vida pelo tempo do efeito
      const who = target ?? e;
      if (isDowned(who)) reviveEntity(w, who, ef.kind === 'levantar' ? ef.pctVida : Math.max(1, (ef.vidaMin / Math.max(1, who.stats.hpMax)) * 100), e);
      if (ef.kind === 'segurar_vida' && isUp(who)) applyStatus(w, who, e, { kind: 'segurar_vida', durationMs: ef.duracaoMs, value: ef.vidaMin, abilityId: sp.key });
      continue;
    }
    rest.push(ef);
  }
  if (rest.length === 0) return;
  const area = rest.some((x) => x.target === 'inimigos_area' || x.target === 'aliados_area' || x.target === 'aliados_area_sem_self');
  const hostile = target && isHostile(e, target) && isDamageable(target) ? target : undefined;
  const a = {
    id: sp.key,
    name: sp.id,
    ownerKey: sp.id,
    slot: 'basico',
    type: hostile && !area ? 'travada' : 'em_volta',
    range: 99,
    radius: Math.max(2, sp.p.raio ?? raioPadrao()),
    cooldownS: 0,
    cost: 0,
    castMs: 0,
    telegraphMs: 0,
    effects: rest,
    description: sp.id,
  } as Ability;
  resolveAbility(w, e, a, { point: hostile ? { x: hostile.x, y: hostile.y } : { x: e.x, y: e.y }, dir: 0, ...(hostile ? { targetId: hostile.id } : {}) });
}

/** Dispara um passivo: gancho registrado, reforço de número ou efeitos. Respeita a recarga. */
function fire(w: World, e: Entity, sp: SourcedPassive, target?: Entity, ev?: CombatEvent): boolean {
  const p = sp.p;
  if (!ready(w, e, sp)) return false;
  if (p.condicao && !hasTargetCondition(p) && !selfCondOk(w, e, p)) return false;
  let did = false;
  if (p.gancho) {
    const h = hooks.get(p.gancho);
    if (h) {
      h({ w, e, sp, ...(target ? { target } : {}), ...(ev ? { ev } : {}) });
      did = true;
    }
  }
  if (p.stats?.length && !p.efeitos?.length && p.kind !== 'numero' && p.kind !== 'aura') {
    const dur = p.acumula?.duracaoMs ?? Number(p.params?.['duracaoMs'] ?? (p.params?.['janelaS'] !== undefined ? Number(p.params['janelaS']) * 1000 : TRIGGER_BUFF_MS));
    for (const s of p.stats) {
      applyStatus(w, e, e, { kind: `reforco:${s.stat}`, durationMs: dur, value: s.pct, abilityId: sp.key, ...(p.acumula ? { stack: { max: p.acumula.max } } : {}) });
    }
    did = true;
  }
  if (p.efeitos?.length) {
    runEffects(w, e, sp, p.efeitos, target);
    did = true;
  }
  if (did) {
    arm(w, e, sp);
    if (sp.fonte === 'guia') sayGuideBonus(w, e, sp.id);
  }
  return did;
}

const withTrigger = (e: Entity, trig: string) => sourcedPassivesOf(e).filter((s) => s.p.trigger === trig);

function handleEvent(w: World, ev: CombatEvent, owners: Entity[]): void {
  switch (ev.t) {
    case 'hit': {
      const src = getEnt(w, ev.src);
      const atk = src ? getEnt(w, creditId(src)) : undefined;
      const dst = getEnt(w, ev.dst);
      if (atk && isUp(atk) && dst && atk.id !== dst.id) {
        for (const sp of withTrigger(atk, 'ao_acertar')) {
          // Fase 5 (Jaqueta do Zé Faísca): params.soCorpoACorpo só vale para quem luta de perto (Alcance 1)
          if (sp.p.params?.['soCorpoACorpo'] === true && (atk.attr?.alcance ?? 1) !== 1) continue;
          fire(w, atk, sp, dst, ev);
        }
        if (ev.crit) for (const sp of withTrigger(atk, 'ao_critar')) fire(w, atk, sp, dst, ev);
        for (const sp of withTrigger(atk, 'primeiro_golpe')) {
          const k = `pg:${sp.key}:${dst.id}`;
          if (st(atk)[k] !== undefined) continue;
          st(atk)[k] = w.tick;
          fire(w, atk, sp, dst, ev);
        }
      }
      if (dst && !dst.dead) {
        st(dst)['lastHit'] = w.tick;
        for (const sp of withTrigger(dst, 'sem_tomar_dano')) {
          if (sp.p.params?.['zeraAoTomarDano'] !== false) removeStatuses(w, dst, (s) => s.abilityId === sp.key);
        }
        if (isUp(dst)) {
          for (const sp of withTrigger(dst, 'ao_apanhar')) fire(w, dst, sp, atk, ev);
          for (const sp of withTrigger(dst, 'pouca_vida')) {
            const k = `low:${sp.key}`;
            if (st(dst)[k] !== undefined || hpRatio(dst) * 100 >= (sp.p.limiarPct ?? LOW_HP_PCT_DEFAULT)) continue;
            if (fire(w, dst, sp, atk, ev)) st(dst)[k] = w.tick;
          }
        }
        for (const o of owners) {
          if (o.id === dst.id || !isUp(o) || !isFriendly(o, dst)) continue;
          for (const sp of withTrigger(o, 'aliado_atacado')) {
            if (dist(o.x, o.y, dst.x, dst.y) <= (sp.p.raio ?? raioPadrao())) fire(w, o, sp, atk, ev);
          }
        }
      }
      break;
    }
    case 'death': {
      const killer = getEnt(w, ev.by);
      const dead = getEnt(w, ev.dst);
      if (killer && isUp(killer) && dead && killer.id !== dead.id) for (const sp of withTrigger(killer, 'ao_derrotar')) fire(w, killer, sp, dead, ev);
      break;
    }
    case 'down': {
      const dst = getEnt(w, ev.dst);
      if (!dst) break;
      for (const sp of withTrigger(dst, 'ao_cair')) {
        if (!isDowned(dst)) break;
        fire(w, dst, sp, dst, ev);
      }
      for (const o of owners) {
        if (!isFriendly(o, dst) || !isDowned(dst)) continue;
        for (const sp of withTrigger(o, 'aliado_vai_cair')) {
          if (o.id === dst.id && sp.p.params?.['incluiSelf'] !== true) continue;
          if (o.id !== dst.id && (!isUp(o) || dist(o.x, o.y, dst.x, dst.y) > (sp.p.raio ?? raioPadrao() * 2))) continue;
          if (fire(w, o, sp, dst, ev)) break;
        }
      }
      break;
    }
    case 'cast': {
      const src = getEnt(w, ev.src);
      const a = getData().abilities.get(ev.ability);
      if (!src || !a || !isUp(src)) break;
      const trig = a.slot === 'especial' || a.slot === 'virada' ? 'ao_usar_especial' : a.slot === 'basico' || a.slot === 'item' ? undefined : 'ao_usar_habilidade';
      if (trig) for (const sp of withTrigger(src, trig)) fire(w, src, sp, getEnt(w, ev.target), ev);
      break;
    }
    case 'heal': {
      const src = getEnt(w, ev.src);
      const dst = getEnt(w, ev.dst);
      if (src && isUp(src) && dst) for (const sp of withTrigger(src, 'ao_curar')) fire(w, src, sp, dst, ev);
      break;
    }
    case 'status': {
      if (!ev.on || !CC_KINDS.includes(ev.kind) && ev.kind !== 'lentidao') break;
      const dst = getEnt(w, ev.dst);
      const inst = dst?.statuses.filter((s) => s.kind === ev.kind).pop();
      const src = inst ? getEnt(w, inst.sourceId) : undefined;
      if (src && dst && isUp(src) && isHostile(src, dst)) for (const sp of withTrigger(src, 'ao_aplicar_controle')) fire(w, src, sp, dst, ev);
      break;
    }
    case 'telegraph':
      avisoAntecipado(w, ev.tel, owners);
      break;
    default:
      break;
  }
}

/** SUGESTÃO: teto do reforço de deslocamento do aviso antecipado, em %. */
const AVISO_MAX_PCT = 60;

/**
 * Fase 5: gancho aviso_antecipado (Fones de Rosa Tavares; talento Leitura de Jogo). O aviso no chão
 * vale params.ms a mais para quem usa: o telegraph marca quem recebeu (avisoAntecipadoPara, para o
 * cliente destacar) e, na simulação, os ms a mais viram tempo para sair da área.
 * SUGESTÃO: o tempo a mais vira reforço de deslocamento até o impacto, na proporção ms / duração do
 * aviso (com teto de AVISO_MAX_PCT), para quem está dentro da área (+1 tile). params.alcance 'grupo'
 * pega os aliados perto de quem tem o passivo.
 */
function avisoAntecipado(w: World, tel: Telegraph, owners: Entity[]): void {
  const src = getEnt(w, tel.sourceId);
  const team = tel.team ?? src?.team;
  if (!team || team === 'neutros') return;
  const totalMs = Math.max(1, (tel.impactTick - tel.startTick) * TICK_MS);
  const leftMs = Math.max(0, (tel.impactTick - w.tick) * TICK_MS);
  if (leftMs <= 0) return;
  for (const o of owners) {
    if (!isUp(o) || o.team === team || o.team === 'neutros') continue;
    for (const sp of sourcedPassivesOf(o)) {
      if (sp.p.gancho !== 'aviso_antecipado') continue;
      const ms = Number(sp.p.params?.['ms'] ?? 500);
      const grupo = sp.p.params?.['alcance'] === 'grupo';
      const pct = Math.min(AVISO_MAX_PCT, Math.round((ms / totalMs) * 100));
      for (const t of w.entities.values()) {
        if (!isUp(t) || (t.id !== o.id && (!grupo || !isFriendly(o, t) || t.kind === 'summon' || t.kind === 'loot' || dist(o.x, o.y, t.x, t.y) > (sp.p.raio ?? raioPadrao())))) continue;
        if (dist(t.x, t.y, tel.x, tel.y) > tel.radius + 1 + t.radius) continue;
        const k = `aviso:${tel.id}`;
        if (t.statuses.some((s) => s.kind === 'reforco:moveSpeed' && s.abilityId === k)) continue;
        applyStatus(w, t, o, { kind: 'reforco:moveSpeed', durationMs: leftMs, value: pct, abilityId: k });
        (tel.avisoAntecipadoPara ??= []).push(t.id);
      }
    }
  }
}

/** Auras, intervalos, recargas e o que depende do tempo. */
function timed(w: World, e: Entity): void {
  const s = st(e);
  const fighting = inCombat(w, e);
  for (const sp of sourcedPassivesOf(e)) {
    const p = sp.p;
    // aura de número: o grupo em volta (e quem tem) ganha o reforço enquanto estiver perto
    if (p.kind === 'aura' && p.stats?.length) {
      if (w.tick % AURA_EVERY_TICKS !== 0 || !selfCondOk(w, e, p)) continue;
      const raio = p.raio ?? raioPadrao();
      for (const t of w.entities.values()) {
        if (!isUp(t) || t.kind === 'loot' || t.kind === 'summon' || !isFriendly(e, t)) continue;
        if (t.id !== e.id && dist(e.x, e.y, t.x, t.y) > raio) continue;
        for (const x of p.stats) applyStatus(w, t, e, { kind: `reforco:${x.stat}`, durationMs: AURA_STATUS_MS, value: x.pct, abilityId: sp.key });
      }
      continue;
    }
    // número com condição sobre si mesmo (Golem com pouca vida, Capitã cercada, Curupira na mata)
    if (p.kind === 'numero' && p.stats?.length && p.condicao && !isFlatNumber(p) && !hasTargetCondition(p)) {
      if (w.tick % AURA_EVERY_TICKS !== 0 || !selfCondOk(w, e, p)) continue;
      for (const x of p.stats) applyStatus(w, e, e, { kind: `reforco:${x.stat}`, durationMs: AURA_STATUS_MS, value: x.pct, abilityId: sp.key });
      continue;
    }
    // aura de efeito (Piquete, Pressão da Arquibancada) e gatilho de intervalo: a cada intervaloS, em combate
    const everyS = p.kind === 'aura' && p.efeitos?.length ? (p.intervaloS ?? 1) : p.trigger === 'intervalo' ? p.intervaloS : undefined;
    if (everyS) {
      const k = `iv:${sp.key}`;
      if ((s[k] ?? -1) > w.tick) continue;
      if (p.kind === 'aura' && !fighting) continue;
      s[k] = w.tick + Math.max(1, msToTicks(everyS * 1000));
      if (p.efeitos?.length) runEffects(w, e, sp, p.efeitos, getEnt(w, e.targetId));
      else fire(w, e, sp, getEnt(w, e.targetId));
      continue;
    }
    // recarga sem gatilho: sai sozinha em combate, no alvo travado (ou no inimigo mais forte perto)
    if (p.kind === 'recarga' && !p.trigger) {
      if (!fighting || !ready(w, e, sp)) continue;
      let target = getEnt(w, e.targetId);
      if (p.gancho === 'alvo_mais_forte_perto') target = strongestNear(w, e, p.raio ?? 6) ?? target;
      if (target && isHostile(e, target) && isDamageable(target)) fire(w, e, sp, target);
      else if (!p.efeitos?.some((x) => x.target === 'alvo' || x.kind === 'marca')) fire(w, e, sp);
      continue;
    }
    if (p.trigger === 'fora_de_combate') {
      const k = `foc:${sp.key}`;
      if (fighting) delete s[k];
      else if (s[k] === undefined && e.lastCombatTick !== undefined && fire(w, e, sp)) s[k] = w.tick;
      continue;
    }
    if (p.trigger === 'sem_tomar_dano') {
      const step = msToTicks((p.intervaloS ?? 1) * 1000);
      const last = s['lastHit'] ?? -Infinity;
      const k = `iv:${sp.key}`;
      if (w.tick - last < step || (s[k] ?? -1) > w.tick) continue;
      s[k] = w.tick + step;
      if (fighting) fire(w, e, sp);
      continue;
    }
    if (p.trigger === 'pouca_vida' && hpRatio(e) * 100 >= (p.limiarPct ?? LOW_HP_PCT_DEFAULT)) delete s[`low:${sp.key}`];
  }
}

function strongestNear(w: World, e: Entity, raio: number): Entity | undefined {
  let best: Entity | undefined;
  const score = (t: Entity) => (t.tier === 'chefe' ? 3 : t.tier === 'elite' ? 2 : 1) * 1e6 + t.stats.hpMax;
  for (const t of w.entities.values()) {
    if (!isHostile(e, t) || !isDamageable(t) || dist(e.x, e.y, t.x, t.y) > raio) continue;
    if (!best || score(t) > score(best)) best = t;
  }
  return best;
}

/** Um tick dos passivos de talento e de guia. Chamado pelo step, depois das recompensas. */
export function tickTalentPassives(w: World): void {
  const owners: Entity[] = [];
  for (const e of w.entities.values()) if (!e.dead && e.kind !== 'loot' && ((e.talents?.length ?? 0) > 0 || e.guideId || (e.equipItems?.length ?? 0) > 0)) owners.push(e);
  if (owners.length === 0) return;
  const n = w.events.length;
  for (let i = 0; i < n; i++) handleEvent(w, w.events[i]!, owners);
  for (const e of owners) if (isUp(e)) timed(w, e);
}

// ---------------------------------------------------------------------------
// Ganchos de passivo do piloto (os outros ficam sem efeito até alguém registrar)

const SLOT_TO_BUTTON = { marca_1: 'b1', marca_2: 'b2', classe: 'b3', especial: 'especial' } as const;

/** Bote em Cadeia: derrotar zera a recarga do botão (params.botao: marca_1, marca_2 ou classe). */
registerPassiveHook('zera_recarga_do_botao', ({ e, sp }) => {
  const k = SLOT_TO_BUTTON[String(sp.p.params?.['botao'] ?? 'marca_1') as keyof typeof SLOT_TO_BUTTON] ?? 'b1';
  const id = e.loadout?.[k];
  if (id) delete e.cooldowns[id];
});

/** Faísca: derrotar carrega params.pct% do Especial. */
registerPassiveHook('carrega_especial', ({ w, e, sp }) => {
  if (!e.loadout?.especial || e.special >= 1) return;
  e.special = Math.min(1, e.special + Number(sp.p.params?.['pct'] ?? 3) / 100);
  if (e.special >= 1) emit(w, { t: 'special_ready', dst: e.id });
});

/** Chupacabra: crítico cura params.pctDoDano% do dano causado. */
registerPassiveHook('roubo_de_vida', ({ w, e, sp, ev }) => {
  if (ev?.t !== 'hit') return;
  heal(w, e, e, (ev.amount * Number(sp.p.params?.['pctDoDano'] ?? 10)) / 100);
});
