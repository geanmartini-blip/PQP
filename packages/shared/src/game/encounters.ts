/**
 * Encontros com IA no mapa (Fase 5). regions.json `encontros`: "No começo, os encontros são com
 * personagens de IA e com o seu grupo, como co-op; a interação livre entre jogadores abre numa
 * fase seguinte."
 *
 * Dois tipos de encontro, sorteados por região e por janela de horário do servidor:
 * - patrulha: um bando dos inimigos da região (enemies.json regioes), que luta contra;
 * - personagem de IA (ai_character): um treinador NPC andando pelo mapa. Da margem dona da região,
 *   luta junto (co-op, time aliados); da margem rival, é um esquadrão infiltrado que luta contra.
 *   Nas regiões neutras (Delta, Usina, Juncal), a margem é sorteada.
 *
 * O spawn é determinístico: mesma região, mesma janela de horário (now recebido por parâmetro) e
 * mesma semente do servidor = mesmos encontros, no mesmo lugar.
 *
 * SUGESTÃO: tudo daqui é afinação (janela de 10 min, até 2 encontros por janela, 60% de chance de
 * personagem de IA, metade co-op, nível 12 a 15 dos personagens, distância de 8 tiles dos pontos
 * de chegada, o personagem rival se rende ao cair em vez de ficar no chão).
 */
import { getData } from '../data';
import { circleFree } from '../map/grid';
import type { TileMap } from '../map/types';
import { spawnPack } from '../sim/ai_pack';
import { isDowned } from '../sim/entity';
import { createRng } from '../sim/rng';
import { spawnAlly } from '../sim/spawn';
import type { Entity, World } from '../sim/types';
import { emit } from '../sim/world';
import type { SideId } from './types';

export const ENCOUNTER_TUNING = {
  janelaMin: 10,
  maxPorJanela: 2,
  chancePersonagemIa: 0.6,
  chanceCoop: 0.5,
  nivelIa: [10, 15] as const,
  distanciaDaChegada: 8,
};

export type EncounterKind = 'patrulha' | 'personagem_ia';
export type EncounterPostura = 'coop' | 'contra';

export interface EncounterSpec {
  /** id estável: enc:<região>:<janela>:<i> */
  id: string;
  regionId: string;
  janela: number;
  kind: EncounterKind;
  postura: EncounterPostura;
  x: number;
  y: number;
  level: number;
  /** patrulha */
  enemyId?: string;
  n?: number;
  /** personagem de IA */
  trainerId?: string;
  archetypeId?: string;
  side?: SideId;
}

/** Janela de horário do servidor (now em ms). */
export const encounterWindow = (now: number): number => Math.floor(now / (ENCOUNTER_TUNING.janelaMin * 60_000));

function hash(...parts: (string | number)[]): number {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= 0x2f;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Inimigos de patrulha da região: normais de enemies.json com a região e fora de masmorra. */
export function patrolPool(regionId: string): string[] {
  return getData()
    .enemies.inimigos.filter((e) => e.tier === 'normal' && !e.masmorra && (e.regioes as readonly string[]).includes(regionId))
    .map((e) => e.id);
}

/** Margem dona da região (neutra = undefined). */
function ownerOf(regionId: string): SideId | undefined {
  const o = getData().regionsById.get(regionId)?.margemDona;
  return o === 'esquerda' || o === 'direita' ? o : undefined;
}

/** Retângulo da região no mapa (map.regions); sem retângulo, o mapa inteiro. */
function rectOf(map: TileMap, regionId: string): { x: number; y: number; w: number; h: number } {
  return map.regions.find((r) => r.regionId === regionId) ?? { x: 0, y: 0, w: map.width, h: map.height };
}

/**
 * Encontros da região nesta janela. Determinístico por (semente, região, janela). Pontos livres
 * dentro da região, longe das chegadas (spawn_jogador).
 */
export function rollEncounters(map: TileMap, regionId: string, now: number, seed = 0): EncounterSpec[] {
  const T = ENCOUNTER_TUNING;
  const janela = encounterWindow(now);
  const rng = createRng(hash(seed, regionId, janela, map.id));
  const rect = rectOf(map, regionId);
  const chegadas = map.markers.filter((m) => m.kind === 'spawn_jogador');
  const point = (): { x: number; y: number } | undefined => {
    for (let k = 0; k < 60; k++) {
      const x = rect.x + 1 + rng.next() * Math.max(1, rect.w - 2), y = rect.y + 1 + rng.next() * Math.max(1, rect.h - 2);
      if (!circleFree(map, x, y, 0.8)) continue;
      if (chegadas.some((c) => Math.hypot(c.x - x, c.y - y) < T.distanciaDaChegada)) continue;
      return { x, y };
    }
    return undefined;
  };
  const D = getData();
  const out: EncounterSpec[] = [];
  const patrulhas = patrolPool(regionId);
  const dono = ownerOf(regionId);
  const n = rng.int(1, T.maxPorJanela);
  for (let i = 0; i < n; i++) {
    const p = point();
    if (!p) continue;
    const id = `enc:${regionId}:${janela}:${i}`;
    const ia = patrulhas.length === 0 || rng.next() < T.chancePersonagemIa;
    if (!ia) {
      const enemyId = rng.pick(patrulhas);
      const def = D.enemiesById.get(enemyId)!;
      out.push({ id, regionId, janela, kind: 'patrulha', postura: 'contra', ...p, enemyId, n: rng.int(def.bando.min, def.bando.max), level: def.nivel });
      continue;
    }
    const coop = rng.next() < T.chanceCoop;
    const ladoCoop: SideId = dono ?? (rng.next() < 0.5 ? 'esquerda' : 'direita');
    const side: SideId = coop ? ladoCoop : ladoCoop === 'esquerda' ? 'direita' : 'esquerda';
    const pool = D.trainers.filter((t) => t.side === side && D.archetypesById.has(t.archetype));
    if (pool.length === 0) continue;
    const t = rng.pick(pool);
    out.push({ id, regionId, janela, kind: 'personagem_ia', postura: coop ? 'coop' : 'contra', ...p, trainerId: t.id, archetypeId: t.archetype, side, level: rng.int(T.nivelIa[0], T.nivelIa[1]) });
  }
  return out;
}

/** Encontros de todas as regiões do mapa nesta janela. */
export function rollMapEncounters(map: TileMap, now: number, seed = 0): EncounterSpec[] {
  const ids = Array.from(new Set(map.regions.map((r) => r.regionId)));
  return ids.flatMap((r) => rollEncounters(map, r, now, seed));
}

/**
 * Nasce o encontro no mundo. Patrulha: bando de inimigos. Personagem de IA: treinador no modo
 * automático (Doutrina padrão do papel), aliado (co-op) ou inimigo (contra).
 */
export function spawnEncounter(w: World, spec: EncounterSpec): Entity[] {
  if (spec.kind === 'patrulha' && spec.enemyId) {
    return spawnPack(w, spec.enemyId, spec.x, spec.y, { n: spec.n ?? 1, level: spec.level, packId: spec.id });
  }
  if (spec.kind === 'personagem_ia' && spec.trainerId && spec.archetypeId) {
    const e = spawnAlly(w, spec.trainerId, spec.x, spec.y, { archetypeId: spec.archetypeId, level: spec.level });
    e.team = spec.postura === 'coop' ? 'aliados' : 'inimigos';
    e.ai = { ...(e.ai ?? {}), encontro: spec.id, postura: spec.postura };
    return [e];
  }
  return [];
}

/** O personagem de IA rival que cai se rende (render-se: "perde parte do que carrega, mas não morre") e sai do mapa. */
export function tickEncounters(w: World): string[] {
  const rendidos: string[] = [];
  for (const e of w.entities.values()) {
    if (e.kind !== 'npc' || e.team !== 'inimigos' || e.dead || !isDowned(e)) continue;
    if (e.ai?.['encontro'] === undefined) continue;
    e.dead = true;
    e.downedUntil = undefined;
    emit(w, { t: 'say', src: e.id, text: 'Tá bom, tá bom! Eu me rendo.' }); // SUGESTÃO: fala
    rendidos.push(String(e.ai['encontro']));
  }
  return rendidos;
}
