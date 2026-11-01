/**
 * Fase 3: o que o registro leva para a simulação além do kit (simKitOf): talentos, guia e botão 3.
 * O servidor e o servidor local espalham isto nas opções de spawnPlayer:
 *
 *   spawnPlayer(world, { ..., archetypeId: simKitOf(rec), ...simSpawnExtrasOf(rec) })
 */
import { archetypeOptions, canChooseArchetype, loadoutOf, type AlaOption, type LoadoutView } from './ala';
import { activeTalents, pendingTalentLevels, talentOptions, type TalentOption } from './talents';
import type { PlayerRecord } from './types';
import type { EquipStats } from '../sim/stats';
import { filtroRaridadeOf, simEquipOf, vendaAutomaticaOf } from './equipment';
import type { Raridade } from './items';

/** Opções de progresso para a tela (mensagem 'progresso_info'): ala, talentos pendentes e botões. */
export function progressOptions(rec: PlayerRecord): {
  ala: { pode: boolean; motivo?: string; opcoes: AlaOption[] };
  talentos: { nivel: number; opcoes: TalentOption[] }[];
  loadout: LoadoutView | null;
} {
  const c = canChooseArchetype(rec);
  return {
    ala: { pode: c.ok, ...(c.ok ? {} : { motivo: c.erro }), opcoes: rec.institution ? archetypeOptions(rec) : [] },
    talentos: pendingTalentLevels(rec).map((nivel) => ({ nivel, opcoes: talentOptions(rec, nivel) })),
    loadout: loadoutOf(rec),
  };
}

export interface SimSpawnExtras {
  talents?: string[];
  guideId?: string;
  slot3?: string;
  // Fase 5: itens equipados e filtro de raridade (game/equipment.ts)
  equipment?: EquipStats;
  lootFilter?: Raridade;
  autoSell?: boolean;
}

export function simSpawnExtrasOf(rec: PlayerRecord): SimSpawnExtras {
  const out: SimSpawnExtras = {};
  const eq = simEquipOf(rec);
  if (eq) out.equipment = eq;
  if (rec.counters['filtro_raridade'] !== undefined) out.lootFilter = filtroRaridadeOf(rec);
  if (rec.counters['venda_automatica'] !== undefined) out.autoSell = vendaAutomaticaOf(rec);
  const t = activeTalents(rec);
  if (t.length > 0) out.talents = t;
  if (rec.guide_id && rec.stage === 'margem') out.guideId = rec.guide_id;
  const l = rec.archetype ? loadoutOf(rec) : null;
  if (l) out.slot3 = l.b3;
  return out;
}
