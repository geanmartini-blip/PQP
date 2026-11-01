/**
 * Ponte entre a simulação (shared/sim) e as regras da Fase 2 (shared/game) no servidor: qual mapa é
 * o do registro, qual botão um 'cast' usou, quem participou de uma morte, os marcadores de lugar e
 * de interação, a rolagem das tabelas de saque das recompensas de missão e o texto dos avisos.
 * Funções puras (o RNG é o do mundo); quem chama é o GameServerCore.
 */
import { getData } from '@pqp/shared/data';
import { ARRIVAL_MAP_BY_SIDE, START_MAP, type MapMarker, type TileMap } from '@pqp/shared/map';
import { isPartyMember, SIM_TUNING, spawnLoot, type Entity, type World } from '@pqp/shared/sim';
import { currentObjectives } from '@pqp/shared/game/missions';
import { boatRoomOf } from '@pqp/shared/game/barco';
import type { BotaoId, GameResult, PlayerRecord } from '@pqp/shared/game/types';
import type { S2C_Aviso } from '@pqp/shared/net';
import { Resource } from '@pqp/shared/schema/world';

/**
 * Mapa "de casa" do registro: Delta até a travessia (ou o barco, 'barco:<id>', para quem embarcou e
 * ainda não escolheu a margem); depois, a margem (o QG fica nela). Quem anda
 * pelas saídas para a Usina, o Juncal ou a outra margem fica lá enquanto estiver conectado
 * (handoff.ts); ao voltar sem pedir sala, volta para casa.
 */
export function mapForRecord(rec: PlayerRecord): string {
  // travessia: quem embarcou e ainda não escolheu a margem volta ao barco (a sala dele)
  const barco = boatRoomOf(rec);
  if (barco) return barco;
  if (!rec.criado || rec.stage !== 'margem' || !rec.side) return START_MAP;
  return ARRIVAL_MAP_BY_SIDE[rec.side];
}

/** Botão que lançou a habilidade (para os objetivos usar_habilidade e o tutorial), ou undefined (básico). */
export function botaoOf(e: Entity, ability: string): BotaoId | undefined {
  const l = e.loadout;
  if (!l || !ability) return undefined;
  if (l.b1 && ability === l.b1) return '1';
  if (l.b2 && ability === l.b2) return '2';
  if (l.b3 && ability === l.b3) return '3';
  if (l.especial && ability === l.especial) return 'especial';
  const item = l.item ? getData().consumablesById.get(l.item) : undefined;
  if (item && item.habilidade === ability) return 'item';
  return undefined;
}

/** Controle do tutorial (TutorialControl) de um botão. */
export const controlOfBotao = (b: BotaoId): string => (b === 'item' ? 'item' : b === 'especial' ? 'especial' : 'habilidade');

/**
 * Quem participou da luta contra o inimigo que caiu: jogadores e companheiros (do mesmo lado) que
 * bateram nele há pouco ou estavam perto, como em sim/rewards.ts (participants), mais quem deu o golpe.
 */
export function killParticipants(w: World, enemy: Entity, by?: number): Entity[] {
  const out: Entity[] = [];
  const recent = Math.round(SIM_TUNING.XP_PARTICIPATION_MS / 50);
  const R = SIM_TUNING.XP_PARTICIPATION_RADIUS;
  for (const e of w.entities.values()) {
    if (e.dead || e.team === enemy.team) continue;
    if (!isPartyMember(e) && e.kind !== 'player') continue;
    const hit = enemy.attackers?.[e.id];
    const near = e.downedUntil === undefined && Math.hypot(e.x - enemy.x, e.y - enemy.y) <= R;
    if ((hit !== undefined && w.tick - hit <= recent) || near || e.id === by) out.push(e);
  }
  return out;
}

const RESOURCES = new Set<string>(Resource.options);
export const isResource = (id: string | undefined): id is Resource => id !== undefined && RESOURCES.has(id);

/** Marcadores que o servidor confere por distância (montados uma vez por mapa). */
export interface AreaMarkers {
  places: MapMarker[];
  interacts: MapMarker[];
  travessia: MapMarker[];
  /** Fase 3: saídas para outro mapa (params.para) e a do cais da travessia */
  exits: MapMarker[];
}

export function areaMarkers(map: TileMap): AreaMarkers {
  return {
    places: map.markers.filter((m) => m.kind === 'lugar' && typeof m.ref === 'string'),
    interacts: map.markers.filter((m) => typeof m.params?.['interagir'] === 'string'),
    travessia: map.markers.filter((m) => m.kind === 'saida' && m.params?.['travessia'] === true),
    exits: map.markers.filter((m) => m.kind === 'saida' && (typeof m.params?.['para'] === 'string' || m.params?.['travessia'] === true)),
  };
}

/** Ação do objetivo interagir com este alvo nas missões ativas (padrão: a do marcador ou 'usar'). */
export function interactAction(rec: PlayerRecord, alvo: string, mk?: MapMarker): string {
  for (const c of currentObjectives(rec)) if (c.objetivo.tipo === 'interagir' && c.objetivo.alvo === alvo) return c.objetivo.acao;
  for (const id of rec.missions.ativas) {
    const m = getData().missionsById.get(id);
    for (const o of m?.objetivos ?? []) if (o.tipo === 'interagir' && o.alvo === alvo) return o.acao;
  }
  const a = mk?.params?.['acao'];
  return typeof a === 'string' ? a : 'usar';
}

/** O objetivo atual de alguma missão ativa pede este controle (usar_controle). */
export const wantsControl = (rec: PlayerRecord, controle: string): boolean =>
  currentObjectives(rec).some((c) => c.objetivo.tipo === 'usar_controle' && c.objetivo.controle === controle);

/**
 * Rola a tabela de saque de uma recompensa de missão (GameResult.itensParaRolar) e põe o item no
 * chão, aos pés do jogador e só dele: a coleta automática pega (e conta como saque).
 * SUGESTÃO: a recompensa sempre dá um item por quantidade (a raridade sai de chancePorRaridade;
 * único e set caem para raro no piloto); sem item possível na tabela, nada cai.
 */
export function rollRewardItems(w: World, p: Entity, tableId: string, quantidade: number): string[] {
  const D = getData();
  const t = D.lootTablesById.get(tableId);
  if (!t) return [];
  const owner = p.playerId ?? `#${p.id}`;
  const nivelMax = p.level + D.loot.rolagem.margemDeNivel;
  const out: string[] = [];
  const poolOf = (rarity: string) =>
    D.items.itens.filter((it) => {
      if (it.rarity !== rarity || it.nivelMin > nivelMax) return false;
      if (t.filtroItens.margem === 'delta' ? it.margem !== null : it.margem !== (p.side ?? null)) return false;
      if (t.filtroItens.classe === 'geral') return it.classLock === null;
      return it.classLock === null || it.classLock === p.classId;
    });
  for (let i = 0; i < Math.max(0, Math.floor(quantidade)); i++) {
    const comum = t.chancePorRaridade['comum'] ?? 0;
    let rarity = w.rng.next() < comum / Math.max(1e-9, comum + (t.chancePorRaridade['raro'] ?? 0) + (t.chancePorRaridade['unico'] ?? 0)) ? 'comum' : 'raro';
    let pool = poolOf(rarity);
    if (pool.length === 0 && rarity === 'raro') pool = poolOf((rarity = 'comum'));
    if (pool.length === 0) continue;
    const it = pool[w.rng.int(0, pool.length - 1)]!;
    const a = w.rng.next() * Math.PI * 2;
    spawnLoot(w, p.x + Math.cos(a) * 0.6, p.y + Math.sin(a) * 0.6, { itemId: it.id, rarity: it.rarity, forPlayerId: owner }, it.name);
    out.push(it.id);
  }
  return out;
}

/** Avisos da tela a partir de um resultado das regras. */
export function avisosOf(r: GameResult): S2C_Aviso[] {
  const out: S2C_Aviso[] = r.avisos.map((texto) => ({
    texto,
    tipo: texto.startsWith('Missão') ? 'missao' : texto.startsWith('Nível') ? 'nivel' : 'info',
  }));
  if (r.desbloqueios.length > 0) {
    if (out.length === 0) out.push({ texto: r.desbloqueios.map((u) => u.descricao).join(' · '), tipo: 'info' });
    out[0]!.desbloqueios = [...r.desbloqueios];
  }
  return out;
}
