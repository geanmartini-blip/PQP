/**
 * Atributos de combate: tabela de balanceamento + nível, eixos de velocidade e curva de XP.
 * Fórmulas de balance.json (ganhoPorNivel, deslocamento) e progression.json (xp).
 */
import { getData } from '../data';
import { bal } from './constants';
import { maxStatusValue, statPts } from './entity';
import type { CombatStats, Entity } from './types';

export interface StatRow {
  vida: number;
  ataque: number;
  defesa: number;
  velocidade: number;
  alcance: number;
  controle: number;
  cura: number;
}

/** O que define os atributos de um personagem: arquétipo (12+), classe sem ala (8 a 11) ou Delta (1 a 7). */
export type Kit =
  | { kind: 'arquetipo'; archetypeId: string; classId: string; side: 'esquerda' | 'direita'; role: string }
  | { kind: 'classe'; classId: string; side: 'esquerda' | 'direita' }
  | { kind: 'delta' };

/**
 * Lê um id de kit: id de arquétipo, id de classe ou 'delta'. Classe sem ala usa `side` (padrão
 * esquerda: SUGESTÃO, o lado só importa para o recurso e o visual).
 */
export function resolveKit(id: string, side?: 'esquerda' | 'direita'): Kit {
  const d = getData();
  if (id === 'delta') return { kind: 'delta' };
  const a = d.archetypesById.get(id);
  if (a) return { kind: 'arquetipo', archetypeId: a.id, classId: a.classe, side: a.margem, role: a.papel };
  if (d.classesById.has(id)) return { kind: 'classe', classId: id, side: side ?? 'esquerda' };
  throw new Error(`arquétipo, classe ou 'delta' não existe: ${id}`);
}

/** Quantos níveis sem talento existem depois de ref até level (talento no 10, 15, 20...). */
export function nonTalentLevels(level: number, ref: number): number {
  const t = bal().ganhoPorNivel.talento;
  let n = 0;
  for (let l = ref + 1; l <= level; l++) {
    const talento = l >= t.inicio && (l - t.inicio) % t.aCada === 0;
    if (!talento) n++;
  }
  return n;
}

/** Linha da tabela no nível pedido: atributo(L) = tabela × (1 + pct/100 × n), modo linear. */
export function statRowAt(kit: Kit, level: number): StatRow {
  const b = bal();
  const g = b.ganhoPorNivel;
  let base: StatRow;
  let ref: number;
  if (kit.kind === 'delta') {
    const row = b.personagemDelta.niveis.find((r) => r.nivel === level);
    const d = b.personagemDelta.base;
    if (row) return { vida: row.vida, ataque: row.ataque, defesa: row.defesa, velocidade: row.velocidade, alcance: d.alcance, controle: d.controle, cura: d.cura };
    base = d;
    ref = g.nivelReferenciaDelta;
  } else if (kit.kind === 'arquetipo') {
    base = b.atributosArquetipo[kit.archetypeId]!;
    ref = g.nivelReferenciaClasse;
  } else {
    base = (b.atributosPreAla as Record<string, StatRow>)[kit.classId]!;
    ref = g.nivelReferenciaClasse;
  }
  const n = nonTalentLevels(level, ref);
  return {
    vida: base.vida * (1 + (g.vidaPct / 100) * n),
    ataque: base.ataque * (1 + (g.ataquePct / 100) * n),
    defesa: base.defesa * (1 + (g.defesaPct / 100) * n),
    velocidade: base.velocidade * (1 + (g.velocidadePct / 100) * n),
    alcance: base.alcance,
    controle: base.controle,
    cura: base.cura,
  };
}

/** fator = 1 + fatorPorPontoPct/100 × (Velocidade − referência), entre fatorMin e fatorMax. */
export function speedFactor(velocidade: number): number {
  const d = bal().deslocamento;
  const f = 1 + (d.fatorPorPontoPct / 100) * (velocidade - d.velocidadeReferencia);
  return Math.max(d.fatorMin, Math.min(d.fatorMax, f));
}

export const alcanceTiles = (alcance: number): number => {
  const t = bal().alcanceTiles as Record<string, number>;
  return t[String(alcance)] ?? alcance;
};

/** Monta CombatStats a partir de uma linha da tabela e do intervalo base do ataque básico (s). */
export function combatStatsFrom(row: StatRow, basicIntervalS: number, resourceMax: number, resourceRegenPerS: number): CombatStats {
  const b = bal();
  const f = speedFactor(row.velocidade);
  return {
    hpMax: row.vida,
    attack: row.ataque,
    defense: row.defesa,
    speed: row.velocidade,
    range: alcanceTiles(row.alcance),
    moveSpeed: b.deslocamento.baseTilesPorS * f,
    attackIntervalMs: (basicIntervalS * 1000) / f,
    critChance: b.dano.criticoChanceBasePct / 100,
    critDamage: b.dano.criticoMult,
    evasion: 0,
    resourceMax,
    resourceRegenPerS,
    pct: {},
  };
}

// ---------- eixos de velocidade ----------

/** Multiplicador de um eixo pelos reforços: 1 + (speed + eixo)/100 (o fator da Velocidade já está nos stats). */
const axisBonus = (e: Entity, axis: 'moveSpeed' | 'attackSpeed' | 'cooldownSpeed') =>
  Math.max(0.1, 1 + (statPts(e, 'speed') + statPts(e, axis)) / 100);

/** Deslocamento sem contar o tile (o tile entra em stepMovement): com reforços e lentidão. */
export function moveSpeedOf(e: Entity): number {
  const slow = Math.min(90, maxStatusValue(e, 'lentidao'));
  return e.stats.moveSpeed * axisBonus(e, 'moveSpeed') * (1 - slow / 100);
}

/** Intervalo do ataque básico em ticks (mínimo 4 ticks = 200 ms). */
export function basicIntervalTicks(e: Entity): number {
  return Math.max(4, Math.round(e.stats.attackIntervalMs / axisBonus(e, 'attackSpeed') / 50));
}

/** Quantos segundos de recarga andam por segundo: fator da Velocidade × reforços de recarga. */
export function cooldownRate(e: Entity): number {
  return speedFactor(e.stats.speed) * axisBonus(e, 'cooldownSpeed');
}

// ---------- XP ----------

/** XP para sair do nível n: round(50 × n^1.6), sem teto (progression.json). */
export function xpToNext(level: number): number {
  const f = getData().progression.xp.formula;
  return Math[f.arredondamento](f.base * Math.pow(level, f.expoente));
}
