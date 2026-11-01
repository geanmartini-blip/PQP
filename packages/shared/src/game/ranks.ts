/**
 * Fase 3: patentes. A da margem (societies.json: Membro, Militante... / Colaborador, Parceiro...)
 * sobe pela reputação na instituição (reputacaoMin); a da instituição (institutions.json patentes)
 * acompanha. Na travessia todo mundo entra na primeira das duas.
 *
 * Decisões:
 * - SUGESTÃO: a reputação que conta é a da instituição do jogador (counters 'reputacao:<id>').
 * - SUGESTÃO: a patente da instituição tem o mesmo degrau da patente da margem (Membro = Brigadista,
 *   Militante = Cabo do Povo...), até a última da lista.
 * - Patente marcada foraDoPiloto não é dada no piloto.
 */
import { getData } from '../data';
import { emptyResult, type GameResult, type PlayerRecord } from './types';

export const reputationOf = (rec: PlayerRecord, inst = rec.institution): number => (inst ? (rec.counters[`reputacao:${inst}`] ?? 0) : 0);

export interface RankView {
  margem: { id: string; name: string; ordem: number } | null;
  instituicao: string | null;
  reputacao: number;
  proxima: { id: string; name: string; reputacaoMin: number } | null;
}

function societyOf(rec: PlayerRecord) {
  return rec.side ? getData().societies.sociedades.find((s) => s.side === rec.side) : undefined;
}

/** Patente da margem e da instituição que o registro merece pela reputação. */
export function deservedRanks(rec: PlayerRecord): { margem: string | null; instituicao: string | null } {
  const soc = societyOf(rec);
  const inst = rec.institution ? getData().institutionsById.get(rec.institution) : undefined;
  if (!soc || !inst) return { margem: rec.rank, instituicao: rec.institution_rank };
  const rep = reputationOf(rec);
  const ok = soc.patentes.filter((p) => !(p as { foraDoPiloto?: boolean }).foraDoPiloto && p.reputacaoMin <= rep);
  const top = ok[ok.length - 1] ?? soc.patentes[0]!;
  const idx = Math.min(inst.patentes.length - 1, Math.max(0, top.ordem - 1));
  return { margem: top.id, instituicao: inst.patentes[idx] ?? null };
}

/** Sobe as patentes quando a reputação deixa (nunca desce). */
export function updateRanks(rec: PlayerRecord): GameResult {
  const r = emptyResult();
  const soc = societyOf(rec);
  if (!soc || !rec.institution) return r;
  const d = deservedRanks(rec);
  const cur = soc.patentes.find((p) => p.id === rec.rank)?.ordem ?? 0;
  const nxt = soc.patentes.find((p) => p.id === d.margem)?.ordem ?? 0;
  if (nxt > cur) {
    rec.rank = d.margem;
    rec.institution_rank = d.instituicao;
    r.mudou = true;
    r.avisos.push(`Nova patente: ${soc.patentes.find((p) => p.id === d.margem)?.name ?? d.margem} (${d.instituicao ?? ''}).`);
  }
  return r;
}

export function rankView(rec: PlayerRecord): RankView {
  const soc = societyOf(rec);
  const p = soc?.patentes.find((x) => x.id === rec.rank);
  const rep = reputationOf(rec);
  const next = soc?.patentes.find((x) => x.ordem === (p?.ordem ?? 0) + 1 && !(x as { foraDoPiloto?: boolean }).foraDoPiloto);
  return {
    margem: p ? { id: p.id, name: p.name, ordem: p.ordem } : null,
    instituicao: rec.institution_rank,
    reputacao: rep,
    proxima: next ? { id: next.id, name: next.name, reputacaoMin: next.reputacaoMin } : null,
  };
}

/** Ordem da patente da margem do jogador (0 sem patente). */
export const rankOrder = (rec: PlayerRecord): number => societyOf(rec)?.patentes.find((x) => x.id === rec.rank)?.ordem ?? 0;
