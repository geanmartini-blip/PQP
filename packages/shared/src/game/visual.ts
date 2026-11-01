/**
 * Visual do jogador: tiers liberados pelo nível (progression.visualPorNivel), paletas do traje,
 * Máquina de Visual (institutions.maquinasVisual) e o CharacterLook que o cliente desenha.
 *
 * Regra que nunca quebra: a máquina não tira a silhueta da ala. Quem já tem ala só pode mostrar
 * trajes de ala (aprendiz em diante), e a mudança só mexe nos campos de appearance.maquinas.muda.
 */
import { getData } from '../data';
import type { TileMap } from '../map/types';
import { validateAppearance } from './appearance';
import { conjuntoDaClasse } from './equipment';
import { lookItemOf } from './items';
import type { Appearance, CharacterLook, Check, PlayerRecord, VisualTierId } from './types';

/** SUGESTÃO: distância máxima (tiles, centro a centro) do marcador da máquina para usar. */
export const VISUAL_MACHINE_RADIUS = 2.5;

const TIER_TO_LOOK: Record<VisualTierId, CharacterLook['outfit']['tier']> = {
  delta: 'delta',
  uniforme: 'base',
  aprendiz: 'aprendiz',
  veterano: 'veterano',
  virada: 'virada',
  mestre: 'mestre',
  lendario: 'lendario',
};

/** Tier de ala (tem a silhueta do arquétipo). */
export const isAlaTier = (t: VisualTierId) => t !== 'delta' && t !== 'uniforme';

/**
 * Visuais liberados, do mais baixo ao mais alto: pelo nível, só os do piloto, e cada um pede o que
 * veste (uniforme pede instituição; aprendiz em diante pede ala). Com ala, o Delta e o uniforme
 * ficam de fora: mostrar um deles tiraria a silhueta da ala.
 */
export function unlockedVisualTiers(rec: PlayerRecord): VisualTierId[] {
  const out: VisualTierId[] = [];
  for (const v of getData().progression.visualPorNivel) {
    if (!v.emPiloto || rec.level < v.nivel) continue;
    const id = v.id as VisualTierId;
    if (id === 'uniforme' && !rec.institution) continue;
    if (isAlaTier(id) && !rec.archetype) continue;
    if (rec.archetype && !isAlaTier(id)) continue;
    out.push(id);
  }
  if (out.length === 0) out.push(rec.archetype ? 'aprendiz' : rec.institution ? 'uniforme' : 'delta');
  return out;
}

/** Tier mostrado: o escolhido, se ainda estiver liberado; senão o mais alto liberado. */
export function currentVisualTier(rec: PlayerRecord): VisualTierId {
  const ok = unlockedVisualTiers(rec);
  if (rec.shown_visual_tier && ok.includes(rec.shown_visual_tier)) return rec.shown_visual_tier;
  return ok[ok.length - 1]!;
}

/**
 * Paletas do traje no tier: Delta = as 6 cores da camiseta; uniforme = as paletas da base da
 * instituição (outfits.json); ala = as 3 paletasTraje do arquétipo.
 */
export function paletteOptions(rec: PlayerRecord, tier: VisualTierId = currentVisualTier(rec)): string[] {
  const D = getData();
  if (tier === 'delta') return [...D.appearance.roupaInicial.cores];
  if (tier === 'uniforme') {
    const t = D.outfits.tiers.find((x) => x.tier === 'base' && x.instituicao === rec.institution);
    return (t?.paletas ?? []).map((p) => p.id);
  }
  const a = rec.archetype ? D.archetypesById.get(rec.archetype) : undefined;
  return (a?.paletasTraje ?? []).map((p) => p.id);
}

/** Visual que o cliente desenha, com o traje pelo nível e por shown_visual_tier. */
export function lookOf(rec: PlayerRecord): CharacterLook {
  const tier = currentVisualTier(rec);
  const pals = paletteOptions(rec, tier);
  const idx = Math.max(0, pals.indexOf(rec.appearance.palette));
  const outfit: CharacterLook['outfit'] = { tier: TIER_TO_LOOK[tier], palette: idx };
  if (isAlaTier(tier) && rec.archetype) outfit.archetypeId = rec.archetype;
  if (rec.institution) outfit.institutionId = rec.institution;
  if (conjuntoDaClasse(rec).completo) outfit.conjunto = true;
  const items: NonNullable<CharacterLook['items']> = [];
  // Fase 5 (game/items.ts): a camada do slot muda dentro do estilo da ala e a raridade aparece
  for (const [slot, id] of Object.entries(rec.equipment)) {
    const li = lookItemOf(rec, slot, id);
    if (li) items.push(li);
  }
  const look: CharacterLook = {
    body: rec.appearance.body,
    skin: rec.appearance.skin,
    face: rec.appearance.face,
    hair: rec.appearance.hair,
    hairColor: rec.appearance.hair_color,
    details: [...rec.appearance.details],
    outfit,
  };
  if (items.length > 0) look.items = items;
  return look;
}

// ---------------------------------------------------------------------------
// Máquina de Visual

/** O que a máquina pode mudar (appearance.maquinas.muda), mais o aceite dos termos da Cabine Neon. */
export interface VisualChange {
  body?: string;
  skin?: string;
  face?: string;
  hair?: string;
  hair_color?: string;
  details?: string[];
  palette?: string;
  /** visual liberado a mostrar; null volta para o mais alto */
  shown_visual_tier?: VisualTierId | null;
  /** a Cabine Neon mostra os termos antes de abrir: precisa vir true nela */
  aceitouTermos?: boolean;
}

/** Onde o jogador está: mapa e posição em tiles. */
export interface Where {
  map: TileMap;
  x: number;
  y: number;
}

/** Máquinas de Visual do mapa perto da posição (marcadores 'maquina_visual' com ref = id da máquina). */
export function nearVisualMachine(where: Where, machineId?: string): string | undefined {
  let best: string | undefined;
  let bd = Infinity;
  for (const m of where.map.markers) {
    if (m.kind !== 'maquina_visual') continue;
    const ref = m.ref ?? m.id;
    if (machineId !== undefined && ref !== machineId) continue;
    const d = Math.hypot(m.x - where.x, m.y - where.y);
    if (d <= VISUAL_MACHINE_RADIUS && d < bd) {
      bd = d;
      best = ref;
    }
  }
  return best;
}

/** A máquina atende este jogador: a do Delta, todo mundo; a de cada QG, quem é da margem dela. */
export function canUseMachine(rec: PlayerRecord, machineId: string): Check {
  const m = getData().institutions.maquinasVisual.find((x) => x.id === machineId);
  if (!m) return { ok: false, erro: 'Máquina de Visual desconhecida.' };
  const margem = (m as { margem?: string }).margem;
  if (margem && margem !== rec.side) return { ok: false, erro: `${m.name} só atende quem é da margem dela.` };
  return { ok: true };
}

const MUDA_CAMPOS = new Set(['body', 'skin', 'face', 'hair', 'hair_color', 'details', 'palette', 'shown_visual_tier']);

/**
 * Aplica a mudança da Máquina de Visual. Grátis e sem limite. Recusa se o jogador não estiver
 * perto da máquina, se a mudança tentar mexer em algo fora de appearance.maquinas.muda (a
 * silhueta da ala nunca sai) ou se o resultado não for uma aparência válida.
 */
export function applyVisualMachine(rec: PlayerRecord, change: VisualChange, machineId: string, where: Where): Check {
  const D = getData();
  const def = D.institutions.maquinasVisual.find((x) => x.id === machineId);
  if (!def) return { ok: false, erro: 'Máquina de Visual desconhecida.' };
  if (nearVisualMachine(where, machineId) === undefined) return { ok: false, erro: `Chegue perto do ${def.name}.` };
  const use = canUseMachine(rec, machineId);
  if (!use.ok) return use;
  if (def.mostraTermosAntesDeAbrir && change.aceitouTermos !== true) return { ok: false, erro: 'Aceite os termos de uso para entrar.' };
  const muda = new Set<string>(D.appearance.maquinas.muda);
  for (const k of Object.keys(change)) {
    if (k === 'aceitouTermos') continue;
    if (!MUDA_CAMPOS.has(k) || !muda.has(k)) return { ok: false, erro: D.appearance.regras.silhuetaDaAlaFixa };
  }
  // visual mostrado
  let shown = rec.shown_visual_tier;
  if (change.shown_visual_tier !== undefined) {
    if (change.shown_visual_tier !== null && !unlockedVisualTiers(rec).includes(change.shown_visual_tier)) {
      return { ok: false, erro: rec.archetype && !isAlaTier(change.shown_visual_tier) ? D.appearance.regras.silhuetaDaAlaFixa : 'Esse visual ainda não foi liberado.' };
    }
    shown = change.shown_visual_tier;
  }
  const next: Appearance = {
    body: change.body ?? rec.appearance.body,
    skin: change.skin ?? rec.appearance.skin,
    face: change.face ?? rec.appearance.face,
    hair: change.hair ?? rec.appearance.hair,
    hair_color: change.hair_color ?? rec.appearance.hair_color,
    details: change.details ? [...change.details] : [...rec.appearance.details],
    palette: change.palette ?? rec.appearance.palette,
  };
  // a paleta vale no tier que vai ficar à mostra; trocou de tier sem dizer a paleta: a primeira dele
  const tmp: PlayerRecord = { ...rec, shown_visual_tier: shown };
  const pals = paletteOptions(tmp);
  if (change.palette === undefined && !pals.includes(next.palette)) next.palette = pals[0] ?? next.palette;
  const chk = validateAppearance(next, { unlocks: rec.unlocks, palettes: pals });
  if (!chk.ok) return { ok: false, erro: chk.erros.join('; ') };
  rec.appearance = next;
  rec.shown_visual_tier = shown;
  return { ok: true };
}
