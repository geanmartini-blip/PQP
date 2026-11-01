/**
 * Plantão (Fase 5). institutions.json qgs[].plantao: "Quando você sai do jogo, seu personagem fica
 * de plantão no QG da margem, comandado pela Doutrina. Qualquer um da sua margem pode levá-lo para
 * masmorras, colossos e invasões." Ganha metade do XP (balance.combate.plantonistaXpMult) e parte do
 * saque, entregues com um relatório quando o dono volta. Não perde itens, não anda pelo mapa, não
 * entra em arena e não conta para o bônus de jogador ao vivo.
 *
 * - entrarEmPlantao / sairDoPlantao: liga e desliga on_duty no registro;
 * - plantonistasDisponiveis: quem está no QG da margem, de plantão e livre;
 * - levarPlantonista: cria o duty_assignment (até 4 no grupo);
 * - spawnPlantonista: nasce na simulação como aliado no modo automático, com a Doutrina dele;
 * - tickPlantao: soma o XP e recolhe o saque do plantonista no relatório;
 * - encerrarPlantao / aplicarRelatorio: fecha e entrega no registro.
 * - validarDoutrina / definirDoutrina: o editor de Doutrina (até 5 cartas).
 *
 * Nada aqui usa Math.random nem Date: o tempo vem por parâmetro (now, em ms).
 */
import { getData } from '../data';
import { bal } from '../sim/constants';
import { spawnPlayer } from '../sim/spawn';
import type { DoctrineCard, Entity, Loadout, World } from '../sim/types';
import { emit } from '../sim/world';
import { simSpawnExtrasOf } from './combatKit';
import { gainXp } from './progression';
import { simKitOf } from './record';
import { emptyResult, mergeResult, type Check, type Fail, type GameResult, type PlayerRecord, type SideId } from './types';
import { lookOf } from './visual';

// ---------------------------------------------------------------------------
// Editor de Doutrina

/** Condições e ações das cartas (contrato DoctrineCard de sim/types.ts). */
export const DOCTRINE_CONDITIONS = ['sempre', 'minha_vida_abaixo', 'aliado_vida_abaixo', 'alvo_e_chefe', 'alvo_e_elite_ou_chefe', 'inimigos_perto_min', 'especial_pronto', 'aliado_caido_perto'] as const;
export const DOCTRINE_ACTIONS = ['usar_botao', 'usar_especial', 'usar_item', 'fugir', 'curar_aliado', 'levantar_aliado', 'focar_mais_fraco', 'focar_mais_perto', 'seguir_grupo'] as const;

// SUGESTÃO: faixas aceitas no editor
export const DOCTRINE_LIMITS = { pctMin: 5, pctMax: 95, nMin: 1, nMax: 8, raioMin: 2, raioMax: 10 };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/**
 * Valida as cartas do editor: até balance.combate.doutrinaCartasMax (5), condições e ações do
 * contrato, números nas faixas e botão que exista no loadout (quando vier). Devolve as cartas
 * limpas (sem campos a mais).
 */
export function validarDoutrina(raw: unknown, opts: { loadout?: Loadout } = {}): { ok: true; cards: DoctrineCard[] } | Fail {
  const max = bal().combate.doutrinaCartasMax;
  if (!Array.isArray(raw)) return { ok: false, erro: 'A Doutrina é uma lista de cartas.' };
  if (raw.length > max) return { ok: false, erro: `A Doutrina tem no máximo ${max} cartas.` };
  const L = DOCTRINE_LIMITS;
  const out: DoctrineCard[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    const n = i + 1;
    if (!isObj(c) || !isObj(c['se']) || !isObj(c['faca'])) return { ok: false, erro: `Carta ${n}: precisa de "se" e "faça".` };
    const se = c['se'], faca = c['faca'];
    const st = se['t'], ft = faca['t'];
    if (!(DOCTRINE_CONDITIONS as readonly unknown[]).includes(st)) return { ok: false, erro: `Carta ${n}: condição desconhecida.` };
    if (!(DOCTRINE_ACTIONS as readonly unknown[]).includes(ft)) return { ok: false, erro: `Carta ${n}: ação desconhecida.` };
    let seOut: DoctrineCard['se'];
    if (st === 'minha_vida_abaixo' || st === 'aliado_vida_abaixo') {
      const pct = se['pct'];
      if (!num(pct) || pct < L.pctMin || pct > L.pctMax) return { ok: false, erro: `Carta ${n}: vida entre ${L.pctMin}% e ${L.pctMax}%.` };
      seOut = { t: st, pct: Math.round(pct) };
    } else if (st === 'inimigos_perto_min') {
      const q = se['n'], r = se['raio'];
      if (!num(q) || q < L.nMin || q > L.nMax) return { ok: false, erro: `Carta ${n}: de ${L.nMin} a ${L.nMax} inimigos.` };
      if (!num(r) || r < L.raioMin || r > L.raioMax) return { ok: false, erro: `Carta ${n}: raio de ${L.raioMin} a ${L.raioMax} tiles.` };
      seOut = { t: st, n: Math.round(q), raio: r };
    } else seOut = { t: st as 'sempre' | 'alvo_e_chefe' | 'alvo_e_elite_ou_chefe' | 'especial_pronto' | 'aliado_caido_perto' };
    let facaOut: DoctrineCard['faca'];
    if (ft === 'usar_botao') {
      const b = faca['botao'];
      if (b !== 1 && b !== 2 && b !== 3) return { ok: false, erro: `Carta ${n}: botão 1, 2 ou 3.` };
      if (opts.loadout) {
        const id = b === 1 ? opts.loadout.b1 : b === 2 ? opts.loadout.b2 : opts.loadout.b3;
        if (!id) return { ok: false, erro: `Carta ${n}: o botão ${b} ainda está vazio.` };
      }
      facaOut = { t: 'usar_botao', botao: b };
    } else facaOut = { t: ft as Exclude<DoctrineCard['faca']['t'], 'usar_botao'> } as DoctrineCard['faca'];
    out.push({ se: seOut, faca: facaOut });
  }
  return { ok: true, cards: out };
}

/** Grava a Doutrina no registro (editor). */
export function definirDoutrina(rec: PlayerRecord, raw: unknown, opts: { loadout?: Loadout } = {}): Check {
  const v = validarDoutrina(raw, opts);
  if (!v.ok) return v;
  rec.doctrine = v.cards;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Plantão no QG

/** QG da margem (institutions.json qgs). */
export function qgDaMargem(side: SideId): string {
  const q = getData().institutions.qgs.find((x) => x.margem === side);
  if (!q) throw new Error(`QG não existe: ${side}`);
  return q.id;
}

/** XP do plantonista (institutions.json plantao.xpMult, igual a balance.combate.plantonistaXpMult). */
export function plantaoXpMult(side: SideId): number {
  const q = getData().institutions.qgs.find((x) => x.margem === side);
  return q?.plantao?.xpMult ?? bal().combate.plantonistaXpMult;
}

/** Só quem já escolheu a margem pode ficar de plantão (o personagem fica no QG). */
export function podeEntrarEmPlantao(rec: PlayerRecord): Check {
  if (rec.stage !== 'margem' || !rec.side) return { ok: false, erro: 'O plantão é no QG da margem: escolha a margem primeiro.' };
  return { ok: true };
}

/** Sai do jogo ou pede o plantão: on_duty liga. */
export function entrarEmPlantao(rec: PlayerRecord): Check {
  const c = podeEntrarEmPlantao(rec);
  if (!c.ok) return c;
  rec.on_duty = true;
  return { ok: true };
}

/** Voltou ao jogo: on_duty desliga (o relatório é entregue por aplicarRelatorio). */
export function sairDoPlantao(rec: PlayerRecord): Check {
  rec.on_duty = false;
  return { ok: true };
}

export type DutyDestino = 'masmorra' | 'mapa' | 'colosso' | 'invasao';

/** duty_assignment do modelo de dados. */
export interface DutyAssignment {
  id: string;
  /** dono do personagem de plantão */
  plantonistaId: string;
  /** quem levou */
  levadoPor: string;
  qg: string;
  side: SideId;
  destino: DutyDestino;
  /** dungeon_run, quando é na masmorra */
  runId?: string;
  inicio: number;
  fim?: number;
  status: 'ativo' | 'encerrado';
  /** relatório: o que o plantonista ganhou */
  ganhos: { xp: number; itens: string[]; semente: number; credito: number };
  /** entidade na simulação (enquanto ativo) */
  entityId?: number;
}

const ativo = (a: DutyAssignment) => a.status === 'ativo';

/** Plantonistas livres no QG da margem: de plantão, na margem e sem duty_assignment ativo. */
export function plantonistasDisponiveis(records: readonly PlayerRecord[], side: SideId, assignments: readonly DutyAssignment[], online: ReadonlySet<string> = new Set()): PlayerRecord[] {
  const ocupados = new Set(assignments.filter(ativo).map((a) => a.plantonistaId));
  return records
    .filter((r) => r.on_duty && r.side === side && r.stage === 'margem' && !ocupados.has(r.id) && !online.has(r.id))
    .sort((a, b) => b.level - a.level || a.id.localeCompare(b.id));
}

export interface LevarOpts {
  id: string;
  now: number;
  destino: DutyDestino;
  runId?: string;
  /** tamanho do grupo de quem leva, antes do plantonista (contando quem leva) */
  grupoAtual?: number;
}

/**
 * Leva o plantonista: mesma margem, quem leva não está de plantão, o plantonista está livre e o
 * grupo fica com no máximo 4. Plantonista não entra em arena.
 */
export function levarPlantonista(taker: PlayerRecord, duty: PlayerRecord, assignments: readonly DutyAssignment[], o: LevarOpts): { ok: true; assignment: DutyAssignment } | Fail {
  if (taker.id === duty.id) return { ok: false, erro: 'Você não pode levar a si mesmo.' };
  if (taker.on_duty) return { ok: false, erro: 'Quem está de plantão não leva ninguém.' };
  if (!taker.side || taker.side !== duty.side) return { ok: false, erro: 'Só dá para levar plantonista da sua margem.' };
  if (!duty.on_duty || duty.stage !== 'margem') return { ok: false, erro: 'Esse personagem não está de plantão.' };
  if (assignments.some((a) => ativo(a) && a.plantonistaId === duty.id)) return { ok: false, erro: 'Alguém já levou esse plantonista.' };
  const max = bal().combate.grupoMax;
  if ((o.grupoAtual ?? 1) + 1 > max) return { ok: false, erro: `O grupo já tem ${max}.` };
  return {
    ok: true,
    assignment: {
      id: o.id,
      plantonistaId: duty.id,
      levadoPor: taker.id,
      qg: qgDaMargem(duty.side),
      side: duty.side,
      destino: o.destino,
      ...(o.runId ? { runId: o.runId } : {}),
      inicio: o.now,
      status: 'ativo',
      ganhos: { xp: 0, itens: [], semente: 0, credito: 0 },
    },
  };
}

/**
 * Nasce o plantonista na simulação: o personagem do registro (kit, nível, talentos, guia, visual),
 * aliado, no modo automático com a Doutrina dele (até 5 cartas; sem cartas, a padrão do papel).
 * Continua 'player' (conta para o XP do grupo) com onDuty (ganha metade, não conta no bônus ao vivo).
 */
export function spawnPlantonista(w: World, rec: PlayerRecord, x: number, y: number, opts: { partyId?: string; assignment?: DutyAssignment } = {}): Entity {
  const e = spawnPlayer(w, {
    name: rec.name,
    archetypeId: simKitOf(rec),
    level: Math.max(1, Math.floor(rec.level)),
    xp: Math.max(0, rec.xp),
    x,
    y,
    playerId: rec.id,
    look: lookOf(rec),
    ...(rec.side ? { side: rec.side } : {}),
    ...simSpawnExtrasOf(rec),
  });
  e.onDuty = true;
  e.auto = true;
  const v = validarDoutrina(rec.doctrine, { loadout: e.loadout! });
  e.doctrine = v.ok ? v.cards : [];
  if (opts.partyId) e.partyId = opts.partyId;
  if (e.loadout) e.loadout.itemCount = Math.max(0, rec.item_count);
  if (opts.assignment) opts.assignment.entityId = e.id;
  return e;
}

/**
 * Um passo do plantão, depois do step(): soma o XP dos eventos e recolhe para o relatório o saque
 * que caiu para o plantonista (ele não anda atrás de saque; o saque dele vai direto para o relatório).
 */
export function tickPlantao(w: World, a: DutyAssignment): void {
  if (!ativo(a) || a.entityId === undefined) return;
  const e = w.entities.get(a.entityId);
  if (!e) return;
  for (const ev of w.events) if (ev.t === 'xp' && ev.dst === e.id) a.ganhos.xp += ev.amount;
  for (const l of w.entities.values()) {
    if (l.kind !== 'loot' || l.dead || l.loot?.forPlayerId !== a.plantonistaId) continue;
    l.dead = true;
    emit(w, { t: 'loot_pick', id: l.id, by: e.id });
    if (l.loot.currency) {
      a.ganhos.semente += l.loot.currency.semente ?? 0;
      a.ganhos.credito += l.loot.currency.credito ?? 0;
    }
    if (l.loot.itemId) a.ganhos.itens.push(l.loot.itemId);
  }
}

/** Fecha o plantão (o grupo saiu, a run acabou ou o dono voltou). */
export function encerrarPlantao(a: DutyAssignment, now: number): DutyAssignment {
  if (ativo(a)) {
    a.status = 'encerrado';
    a.fim = now;
    delete a.entityId;
  }
  return a;
}

/** Relatório na volta: XP (já com a metade do plantão), itens e moedas entram no registro. */
export function aplicarRelatorio(rec: PlayerRecord, a: DutyAssignment): GameResult {
  const r = emptyResult();
  if (a.plantonistaId !== rec.id) return r;
  if (a.ganhos.xp > 0) mergeResult(r, gainXp(rec, a.ganhos.xp));
  for (const it of a.ganhos.itens) {
    rec.inventory.push(it);
    r.itens.push(it);
  }
  if (a.ganhos.semente > 0) {
    rec.semente += a.ganhos.semente;
    r.recursos.semente = (r.recursos.semente ?? 0) + a.ganhos.semente;
  }
  if (a.ganhos.credito > 0) {
    rec.credito += a.ganhos.credito;
    r.recursos.credito = (r.recursos.credito ?? 0) + a.ganhos.credito;
  }
  r.mudou = true;
  r.avisos.push(`Relatório do plantão: ${a.ganhos.xp} de XP e ${a.ganhos.itens.length} itens.`);
  a.ganhos = { xp: 0, itens: [], semente: 0, credito: 0 };
  return r;
}
