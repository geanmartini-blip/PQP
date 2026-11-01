/**
 * Nascimento de entidades: jogador, companheiro de IA (treinador lutando junto), NPC neutro,
 * inimigo (normal, elite com afixos, chefe), invocação e saque. Troca de arquétipo.
 */
import { getData } from '../data';
import {
  bal,
  LOOT_LIFETIME_MS,
  LOOT_RADIUS,
  NPC_RADIUS,
  PLAYER_RADIUS,
  START_POTIONS,
  SUMMON_RADIUS,
} from './constants';
import { passivesOf, recomputeShield, resourceMaxOf } from './combat';
import { applyFlatPassiveNumbers, applyTalentLoadout, baseAbilityId } from './passiveDefs';
import { alcanceTiles, combatStatsFrom, resolveKit, speedFactor, statRowAt, type Kit } from './stats';
import { msToTicks, type EnemyTier, type Entity, type Loadout, type Team, type World } from './types';
import type { CharacterLook } from '../game/types';
import { addEntity, blankStats, emit } from './world';

export interface SpawnPlayerOpts {
  name: string;
  /** id de arquétipo (12+), de classe (8 a 11) ou 'delta' (1 a 7) */
  archetypeId: string;
  level?: number;
  x: number;
  y: number;
  playerId?: string;
  team?: Team;
  /** margem quando archetypeId é uma classe sem ala (padrão esquerda) */
  side?: 'esquerda' | 'direita';
  /** habilidade da classe no botão 3 (padrão: slot3Padrao da classe) */
  slot3?: string;
  // ---- Fase 2 (game/): o servidor passa o que sai do PlayerRecord ----
  /** visual em camadas (game/visual.ts lookOf) */
  look?: CharacterLook;
  /** teto de nível (game/progression.ts simLevelCap) */
  levelCap?: number;
  /** XP de quem está no Delta conta como grupo (o Seu Jacó acompanha) */
  deltaRookie?: boolean;
  /** XP dentro do nível, vindo do registro */
  xp?: number;
  // ---- Fase 3 (game/): talentos e guia do registro (game/combatKit.ts simSpawnExtrasOf) ----
  /** talentos escolhidos (talents.json): valem desde o nascimento */
  talents?: string[];
  /** guia da travessia (guides.json): bônus pequeno */
  guideId?: string;
}

/** Nível padrão de cada etapa quando não vem nível: Delta 1, classe 8, arquétipo 12 (aprendiz). */
const defaultLevel = (k: Kit) => (k.kind === 'delta' ? 1 : k.kind === 'classe' ? 8 : 12);

/**
 * Botões pela regra dos docs (progression.botoes e classes.json):
 * - Delta (1 a 7): só o básico do Delta (o remo, basico_combatente), sem botões nem Especial.
 * - Classe sem ala (8 a 11): os 3 botões são habilidades da classe; Especial da classe.
 * - Arquétipo (12+): botões 1 e 2 = marcas do arquétipo, 3 = habilidade da classe; Especial da classe
 *   (a virada só entra com o talento do 30, fora do piloto).
 */
export function loadoutFor(kit: Kit, slot3?: string): Loadout {
  const d = getData();
  if (kit.kind === 'delta') {
    return { b1: '', b2: '', b3: '', especial: '', basico: bal().personagemDelta.ataqueBasico, item: 'pocao', itemCount: START_POTIONS };
  }
  const cls = d.classesById.get(kit.classId)!;
  if (kit.kind === 'classe') {
    const [b1, b2, b3] = cls.loadoutPreAla.botoes;
    return { b1, b2, b3, especial: cls.special, basico: cls.basicAttack, item: 'pocao', itemCount: START_POTIONS };
  }
  const arch = d.archetypesById.get(kit.archetypeId)!;
  // o botão 3 pode vir com o sufixo dos talentos (id derivado): vale o id base
  const s3 = slot3 ? baseAbilityId(slot3) : undefined;
  const b3 = s3 && cls.abilities.includes(s3) ? s3 : cls.slot3Padrao;
  return {
    b1: arch.habilidadesMarca.marca_1,
    b2: arch.habilidadesMarca.marca_2,
    b3,
    especial: cls.special,
    basico: cls.basicAttack,
    item: 'pocao',
    itemCount: START_POTIONS,
  };
}

/** Aplica atributos, recurso e botões de um kit numa entidade (mantém a fração de vida e de recurso). */
function applyKit(e: Entity, kit: Kit, level: number, slot3?: string): void {
  const d = getData();
  const row = statRowAt(kit, level);
  const loadout = loadoutFor(kit, slot3);
  const basic = d.abilities.get(loadout.basico);
  let resMax = 0, resRegen = 0, resId: string | undefined;
  if (kit.kind !== 'delta') {
    const res = d.classesById.get(kit.classId)!.resource[kit.side];
    resMax = res.max;
    resRegen = res.regenPorS;
    resId = res.id;
  }
  const hpFrac = e.stats.hpMax > 0 ? e.hp / e.stats.hpMax : 1;
  const resFrac = e.stats.resourceMax > 0 ? e.resource / e.stats.resourceMax : 1;
  // bônus fixos (itens, talentos, afixos) ficam: só a linha da tabela muda
  const prevPct = { ...e.stats.pct };
  e.stats = combatStatsFrom(row, basic?.cooldownS ?? bal().combate.intervaloAtaqueBasicoBaseS, resMax, resRegen);
  e.stats.pct = prevPct;
  // reforços de vida ativos: refaz o acréscimo sobre a vida máxima nova (o fim do reforço tira o mesmo valor)
  const base = e.stats.hpMax;
  for (const s of e.statuses) {
    if (s.kind !== 'reforco:hp' || s.data?.['hpAdd'] === undefined) continue;
    const add = base * (s.value / 100);
    s.data = { ...s.data, hpAdd: add };
    e.stats.hpMax += add;
  }
  e.hp = Math.max(1, e.stats.hpMax * hpFrac);
  e.resource = resMax * resFrac;
  e.level = level;
  e.attr = { alcance: row.alcance, controle: row.controle, cura: row.cura };
  e.resourceId = resId;
  if (kit.kind === 'delta') {
    e.classId = undefined;
    e.archetypeId = undefined;
    e.side = undefined;
    e.role = undefined;
  } else {
    e.classId = kit.classId;
    e.side = kit.side;
    e.archetypeId = kit.kind === 'arquetipo' ? kit.archetypeId : undefined;
    e.role = kit.kind === 'arquetipo' ? kit.role : undefined;
  }
  const prevItem = e.loadout?.item, prevCount = e.loadout?.itemCount;
  e.loadout = loadout;
  if (prevItem !== undefined) {
    e.loadout.item = prevItem;
    e.loadout.itemCount = prevCount ?? 0;
  }
  // jogador: defId = arquétipo/classe; companheiro e NPC guardam o id do treinador
  if (e.kind === 'player') e.defId = kit.kind === 'arquetipo' ? kit.archetypeId : kit.kind === 'classe' ? kit.classId : 'delta';
  // Fase 3: botões com as modificações dos talentos (ids derivados)
  applyTalentLoadout(e);
}

/** Jogador com os atributos da classe, do arquétipo e do nível (balance + classes) e os botões dos docs. */
export function spawnPlayer(w: World, opts: SpawnPlayerOpts): Entity {
  const kit = resolveKit(opts.archetypeId, opts.side);
  const level = opts.level ?? defaultLevel(kit);
  const e = addEntity(w, {
    kind: 'player',
    team: opts.team ?? 'aliados',
    defId: opts.archetypeId,
    name: opts.name,
    x: opts.x,
    y: opts.y,
    radius: PLAYER_RADIUS,
    stats: blankStats(),
    level,
  });
  if (opts.talents && opts.talents.length > 0) e.talents = [...opts.talents];
  if (opts.guideId) e.guideId = opts.guideId;
  applyKit(e, kit, level, opts.slot3);
  // Fase 3: números fixos de talento e guia (os condicionais e os gatilhos são de sim/passives.ts)
  applyFlatPassiveNumbers(e);
  e.hp = e.stats.hpMax;
  e.resource = e.stats.resourceMax;
  e.xp = opts.xp ?? 0;
  e.semente = 0;
  e.credito = 0;
  e.inventory = [];
  e.doctrine = [];
  e.auto = false;
  if (opts.playerId !== undefined) e.playerId = opts.playerId;
  if (opts.look !== undefined) e.look = opts.look;
  if (opts.levelCap !== undefined) e.levelCap = opts.levelCap;
  if (opts.deltaRookie) e.deltaRookie = true;
  return e;
}

/**
 * Troca de arquétipo (ou de classe/Delta), e de classe se precisar. Mantém a fração de vida e de
 * recurso, as recargas em andamento (a recarga é por habilidade: a que volta para o kit volta com
 * o tempo que faltava) e a carga do Especial; aplica a recarga global e cancela carga e
 * habilidade pendente. Mantém o nível. Quem pode trocar (treinador perto, fora de combate) é
 * regra do comando (commands.ts, canSwitchArchetype).
 */
export function setArchetype(w: World, e: Entity, archetypeId: string, slot3?: string): void {
  const kit = resolveKit(archetypeId, e.side);
  applyKit(e, kit, e.level, slot3);
  e.gcdUntil = Math.max(e.gcdUntil, w.tick + msToTicks(bal().combate.recargaGlobalMs));
  e.casting = undefined;
  e.pendingCast = undefined;
  recomputeShield(e);
}

/** Recalcula atributos depois de subir de nível (mesmo kit, mantém a fração de vida). */
export function relevel(w: World, e: Entity, level: number): void {
  void w;
  const kit: Kit = e.archetypeId ? resolveKit(e.archetypeId) : e.classId ? resolveKit(e.classId, e.side) : { kind: 'delta' };
  const slot3 = e.loadout?.b3 ? baseAbilityId(e.loadout.b3) : undefined;
  applyKit(e, kit, level, slot3);
}

/** Companheiro de IA: um treinador lutando junto, com Doutrina e modo automático ligado. */
export function spawnAlly(w: World, trainerId: string, x: number, y: number, opts: { archetypeId: string; level: number }): Entity {
  const tr = getData().trainersById.get(trainerId);
  const e = spawnPlayer(w, { name: tr?.name ?? trainerId, archetypeId: opts.archetypeId, level: opts.level, x, y });
  e.kind = 'npc';
  e.defId = trainerId;
  e.auto = true;
  e.doctrine = [];
  return e;
}

/** NPC neutro (treinador ou personagem de npcs.json), para conversa. Não luta nem leva dano. */
export function spawnNpc(w: World, npcId: string, x: number, y: number): Entity {
  const d = getData();
  const name = d.trainersById.get(npcId)?.name ?? d.npcsById.get(npcId)?.name ?? npcId;
  const e = addEntity(w, { kind: 'npc', team: 'neutros', defId: npcId, name, x, y, radius: NPC_RADIUS, stats: blankStats() });
  return e;
}

// ---------------------------------------------------------------------------
// Inimigos

export interface SpawnEnemyOpts {
  /** força o tier (um normal com 'elite' vira elite pela promocaoElite) */
  tier?: EnemyTier;
  /** afixos fixos; sem isso, elite sorteia pelo RNG do mundo */
  affixes?: string[];
  /** nível acima do base (escalaPorNivel) */
  level?: number;
  /** chefe: jogadores na luta; a vida sobe vidaPorJogadorExtraPct por jogador além do primeiro */
  players?: number;
}

/** Estado da IA de inimigo e de invocação, guardado em entity.ai. */
export interface EnemyAi {
  basic: string;
  abilities: string[];
  behavior: string;
  imovel?: boolean;
  xp: number;
  lootTable: string;
  phase: number;
  phaseSince: number;
  nextReinforceTick?: number;
  repathTick?: number;
  saidHello?: boolean;
  rewarded?: boolean;
  passiveTicks?: Record<string, number>;
  /** reforço de chefe: id do chefe que chamou (teto de reforços e ida embora no reinício) */
  reinforcementOf?: number;
}

/** Sorteia n afixos diferentes da lista (ordem estável). */
function rollAffixes(w: World, pool: readonly string[], min: number, max: number): string[] {
  const n = Math.min(pool.length, w.rng.int(min, max));
  const left = [...pool];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const k = w.rng.int(0, left.length - 1);
    out.push(left.splice(k, 1)[0]!);
  }
  return out;
}

/**
 * Inimigo de enemies.json. Elite (promovido) recebe vidaMult, ataqueMult, defesaMult e xpMult da
 * promocaoElite e 1 a 2 afixos; elite de nascença sorteia afixosFixos; chefe tem fases. Acima do
 * nível base, escalaPorNivel por nível. Afixo 'numero' entra em stats.pct.
 */
export function spawnEnemy(w: World, enemyId: string, x: number, y: number, opts: SpawnEnemyOpts = {}): Entity {
  const D = getData();
  const def = D.enemiesById.get(enemyId);
  if (!def) throw new Error(`inimigo não existe: ${enemyId}`);
  const pe = D.enemies.promocaoElite;
  const esc = D.enemies.escalaPorNivel;
  const tier: EnemyTier = opts.tier ?? def.tier;
  const promoted = tier === 'elite' && def.tier === 'normal';
  const level = Math.max(def.nivel, opts.level ?? def.nivel);
  const up = level - def.nivel;
  let vida = def.vida * (1 + (esc.vidaPct / 100) * up);
  let ataque = def.ataque * (1 + (esc.ataquePct / 100) * up);
  let defesa = def.defesa * (1 + (esc.defesaPct / 100) * up);
  let xp = def.xp * (1 + (esc.xpPct / 100) * up);
  let lootTable: string = def.tabelaSaque;
  if (promoted) {
    vida *= pe.vidaMult;
    ataque *= pe.ataqueMult;
    defesa *= pe.defesaMult;
    xp *= pe.xpMult;
    lootTable = pe.tabelaSaque;
  }
  if (tier === 'chefe' && (opts.players ?? 1) > 1) {
    const extra = def.vidaPorJogadorExtraPct ?? D.enemies.regrasChefe.vidaPorJogadorExtraPct;
    vida *= 1 + (extra / 100) * ((opts.players ?? 1) - 1);
  }
  const basic = D.abilities.get(def.ataqueBasico);
  const f = speedFactor(def.velocidade);
  const stats = {
    ...blankStats(vida),
    attack: ataque,
    defense: defesa,
    speed: def.velocidade,
    range: alcanceTiles(def.alcance),
    moveSpeed: def.imovel ? 0 : bal().deslocamento.baseTilesPorS * f,
    attackIntervalMs: ((basic?.cooldownS ?? 1) * 1000) / f,
    critChance: bal().dano.criticoChanceBasePct / 100,
    critDamage: bal().dano.criticoMult,
  };
  const e = addEntity(w, { kind: 'enemy', team: 'inimigos', defId: def.id, name: def.name, x, y, radius: def.raioCorpoTiles, stats, level });
  e.tier = tier;
  let affixes = opts.affixes;
  if (!affixes) {
    if (promoted) affixes = rollAffixes(w, def.afixosPossiveis, pe.afixos.min, pe.afixos.max);
    else if (tier === 'elite' && def.afixosFixos) affixes = rollAffixes(w, def.afixosPossiveis, def.afixosFixos.min, def.afixosFixos.max);
    else affixes = [];
  }
  e.affixes = affixes;
  for (const p of passivesOf(e)) {
    if (p.kind !== 'numero' || !p.stats) continue;
    for (const s of p.stats) e.stats.pct[s.stat] = (e.stats.pct[s.stat] ?? 0) + s.pct / 100;
  }
  const ai: EnemyAi = {
    basic: def.ataqueBasico,
    abilities: def.fases?.[0]?.habilidades ?? def.habilidades,
    behavior: def.comportamento,
    ...(def.imovel ? { imovel: true } : {}),
    xp,
    lootTable,
    phase: 0,
    phaseSince: w.tick,
  };
  e.ai = ai as unknown as Record<string, unknown>;
  return e;
}

export const enemyAi = (e: Entity) => e.ai as unknown as EnemyAi;

// ---------------------------------------------------------------------------
// Invocações e saque

/** Estado de uma invocação (entity.ai). */
export interface SummonAi {
  behavior: string;
  nextTick: number;
  indestrutivel?: boolean;
  rebuildMs?: number;
  rebuilding?: boolean;
  rebuildTick?: number;
}

/**
 * Invocação de summons.json: vida = hpPct da vida máxima do dono, ataque = attackMult × ataque do
 * dono, nível do dono. Some em durationMs.
 */
export function spawnSummon(w: World, owner: Entity, summonId: string, x: number, y: number, durationMs: number): Entity {
  const def = getData().summonsById.get(summonId);
  if (!def) throw new Error(`invocação não existe: ${summonId}`);
  const name = def.nomePorMargem && owner.side ? def.nomePorMargem[owner.side] : def.name;
  const stats = {
    ...blankStats((owner.stats.hpMax * def.hpPct) / 100),
    attack: owner.stats.attack * def.attackMult,
    defense: owner.stats.defense,
    speed: owner.stats.speed,
    range: def.range,
    moveSpeed: def.behavior === 'luta_ao_lado' ? owner.stats.moveSpeed : 0,
    critChance: owner.stats.critChance,
    critDamage: owner.stats.critDamage,
  };
  const e = addEntity(w, { kind: 'summon', team: owner.team, defId: def.id, name, x, y, radius: SUMMON_RADIUS, stats, level: owner.level });
  e.ownerId = owner.id;
  e.side = owner.side;
  e.expiresTick = w.tick + msToTicks(durationMs);
  const ai: SummonAi = {
    behavior: def.behavior,
    nextTick: w.tick,
    ...(def.destructible ? {} : { indestrutivel: true }),
    ...(def.rebuildMs ? { rebuildMs: def.rebuildMs } : {}),
  };
  e.ai = ai as unknown as Record<string, unknown>;
  return e;
}

/** Saque no chão: moeda, item, material ou consumível. Quem encosta pega (forPlayerId: só o dono). */
export function spawnLoot(w: World, x: number, y: number, loot: NonNullable<Entity['loot']>, name?: string): Entity {
  const defId = loot.itemId ?? 'moeda';
  const e = addEntity(w, { kind: 'loot', team: 'neutros', defId, name: name ?? defId, x, y, radius: LOOT_RADIUS, stats: blankStats() });
  e.loot = loot;
  e.expiresTick = w.tick + msToTicks(LOOT_LIFETIME_MS);
  emit(w, { t: 'loot_drop', id: e.id });
  return e;
}

/** Recurso cheio de acordo com o máximo atual (usado ao reaparecer). */
export const refillResource = (e: Entity) => {
  e.resource = resourceMaxOf(e);
};
