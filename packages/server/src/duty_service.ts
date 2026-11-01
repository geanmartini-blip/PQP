/**
 * Fase 5: o plantão no servidor (game/duty.ts). Quem sai do jogo com on_duty fica no QG da margem
 * (a cópia do registro fica aqui) e qualquer um da margem pode levá-lo: o duty_assignment liga o
 * plantonista a quem levou, e a sala onde quem levou estiver nasce o plantonista ao lado dele, como
 * aliado no automático com a Doutrina dele (spawnPlantonista). O que ele ganha (XP, saque, moedas, e
 * as recompensas da masmorra) fica no relatório e entra no registro quando o dono volta (back).
 *
 * Guardado no Store com a chave 'plantao' (plantonistas, plantões ativos e relatórios pendentes).
 */
import {
  aplicarRelatorio,
  claimRunRewards,
  encerrarPlantao,
  levarPlantonista,
  mergeResult,
  emptyResult,
  plantonistasDisponiveis,
  podeEntrarEmPlantao,
  type DungeonRun,
  type DutyAssignment,
  type DutyDestino,
  type Fail,
  type GameResult,
  type GroupCtx,
  type PlayerRecord,
  type SideId,
} from '@pqp/shared/game/index';
import type { Reward } from '@pqp/shared/schema/world';
import type { Store } from './persistence/store';

export const DUTY_KEY = 'plantao';

/** Recompensas de masmorra guardadas para um plantonista. */
export interface RunClaim {
  dungeonId: string;
  andarMaisFundo: number;
  ultimoChefeVencido: number;
  recompensas: Reward[];
  ctx: GroupCtx;
}

interface DutyState {
  versao: 1;
  plantonistas: Record<string, PlayerRecord>;
  ativos: DutyAssignment[];
  relatorios: Record<string, { plantoes: DutyAssignment[]; runs: RunClaim[] }>;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const vazio = (): DutyState => ({ versao: 1, plantonistas: {}, ativos: [], relatorios: {} });

export class DutyService {
  state: DutyState = vazio();
  private seq = 0;

  constructor(private readonly o: { store?: Store; now: () => number; log: (m: string) => void }) {}

  async load(): Promise<void> {
    if (!this.o.store?.loadWorld) return;
    try {
      const raw = (await this.o.store.loadWorld(DUTY_KEY)) as Partial<DutyState> | undefined;
      if (raw && typeof raw === 'object') {
        // plantões que estavam ativos quando o servidor caiu viram relatório
        const s: DutyState = { versao: 1, plantonistas: raw.plantonistas ?? {}, ativos: [], relatorios: raw.relatorios ?? {} };
        for (const a of raw.ativos ?? []) this.toReport(s, encerrarPlantao(a, this.o.now()));
        this.state = s;
      }
    } catch (err) {
      this.o.log(`[plantao] não consegui ler: ${String(err)}`);
    }
  }

  save(): void {
    if (!this.o.store?.saveWorld) return;
    this.o.store.saveWorld(DUTY_KEY, clone(this.state)).catch((err) => this.o.log(`[plantao] falha ao salvar: ${String(err)}`));
  }

  private toReport(s: DutyState, a: DutyAssignment): void {
    const r = (s.relatorios[a.plantonistaId] ??= { plantoes: [], runs: [] });
    r.plantoes.push(a);
  }

  /** O jogador saiu do jogo: com on_duty, fica de plantão no QG da margem. */
  offer(rec: PlayerRecord): boolean {
    if (!rec.on_duty || !podeEntrarEmPlantao(rec).ok) return false;
    this.state.plantonistas[rec.id] = clone(rec);
    this.save();
    return true;
  }

  /** Registro de plantão de alguém (para nascer na simulação). */
  recordOf(id: string): PlayerRecord | undefined {
    return this.state.plantonistas[id];
  }

  /** Livres no QG da margem. */
  list(side: SideId): PlayerRecord[] {
    return plantonistasDisponiveis(Object.values(this.state.plantonistas), side, this.state.ativos);
  }

  /** Plantões ativos de quem levou. */
  ofTaker(takerId: string): DutyAssignment[] {
    return this.state.ativos.filter((a) => a.levadoPor === takerId && a.status === 'ativo');
  }

  /** Leva um plantonista. */
  take(taker: PlayerRecord, plantonistaId: string, o: { destino: DutyDestino; runId?: string; grupoAtual: number }): { ok: true; assignment: DutyAssignment; rec: PlayerRecord } | Fail {
    const duty = this.state.plantonistas[plantonistaId];
    if (!duty) return { ok: false, erro: 'Esse personagem não está de plantão.' };
    const now = this.o.now();
    const id = `duty_${now.toString(36)}_${(++this.seq).toString(36)}`;
    const l = levarPlantonista(taker, duty, this.state.ativos, { id, now, destino: o.destino, grupoAtual: o.grupoAtual, ...(o.runId ? { runId: o.runId } : {}) });
    if (!l.ok) return l;
    this.state.ativos.push(l.assignment);
    this.save();
    return { ok: true, assignment: l.assignment, rec: duty };
  }

  /** Fecha um plantão; o relatório espera o dono voltar. */
  end(a: DutyAssignment): void {
    if (a.status === 'ativo') encerrarPlantao(a, this.o.now());
    this.state.ativos = this.state.ativos.filter((x) => x.id !== a.id);
    this.toReport(this.state, a);
    this.save();
  }

  /** Guarda as recompensas de uma run para o plantonista (entra no registro quando ele voltar). */
  bankRun(plantonistaId: string, run: DungeonRun): void {
    const list = run.recompensas[plantonistaId] ?? [];
    run.recompensas[plantonistaId] = [];
    const r = (this.state.relatorios[plantonistaId] ??= { plantoes: [], runs: [] });
    r.runs.push({ dungeonId: run.dungeonId, andarMaisFundo: run.andarMaisFundo, ultimoChefeVencido: run.ultimoChefeVencido, recompensas: list, ctx: run.grupoCtx[plantonistaId] ?? { personagens: 1, aoVivo: 1, plantonista: true } });
    this.save();
  }

  /**
   * O dono voltou: sai do QG, os plantões ativos dele fecham (devolve para a sala tirar o boneco) e o
   * relatório entra no registro.
   */
  back(rec: PlayerRecord): { result: GameResult; fechados: DutyAssignment[] } {
    const out = emptyResult();
    const fechados: DutyAssignment[] = [];
    const had = rec.id in this.state.plantonistas || rec.id in this.state.relatorios || this.state.ativos.some((a) => a.plantonistaId === rec.id);
    if (!had) return { result: out, fechados };
    delete this.state.plantonistas[rec.id];
    for (const a of this.state.ativos.filter((x) => x.plantonistaId === rec.id)) {
      fechados.push({ ...a });
      this.end(a);
    }
    const rep = this.state.relatorios[rec.id];
    delete this.state.relatorios[rec.id];
    for (const a of rep?.plantoes ?? []) mergeResult(out, aplicarRelatorio(rec, a));
    for (const c of rep?.runs ?? []) {
      const run = {
        dungeonId: c.dungeonId,
        andarMaisFundo: c.andarMaisFundo,
        ultimoChefeVencido: c.ultimoChefeVencido,
        recompensas: { [rec.id]: c.recompensas },
        grupoCtx: { [rec.id]: c.ctx },
      } as unknown as DungeonRun;
      mergeResult(out, claimRunRewards(rec, run));
    }
    this.save();
    return { result: out, fechados };
  }
}
