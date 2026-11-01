/**
 * Fase 3: talentos dos níveis 10, 15 e 20 (talents.json). Um a cada 5 níveis, sempre uma escolha
 * entre opções: 10 = instituição, 15 = papel da ala, 20 = talento-chave do par de alas.
 *
 * O efeito vale na simulação: o registro guarda os ids em talent_picks, o servidor passa para
 * spawnPlayer (game/combatKit.ts simSpawnExtrasOf) e sim/passiveDefs.ts + sim/passives.ts aplicam
 * números, gatilhos e modificações de habilidade.
 *
 * Decisões:
 * - O talento do 15 (papel) e o do 20 (chave) pedem ala; quem chegar ao 15 sem ala escolhe depois.
 * - Refazer talentos (talents.regras.refazer) fica para a Fase 4 (economia), como pendência.
 */
import { getData } from '../data';
import type { Talent, TalentGroup } from '../schema/talent';
import { emptyResult, type Check, type GameResult, type PlayerRecord } from './types';

/** Níveis de talento do piloto e o grupo de cada um. */
export const PILOT_TALENT_LEVELS: Readonly<Record<number, TalentGroup>> = { 10: 'instituicao', 15: 'papel', 20: 'chave' };

export interface TalentOption {
  id: string;
  name: string;
  descricao: string;
  grupo: string;
  nivel: number;
}

/** Talento pode ser do jogador (dono: instituição, papel, par de alas, classe, margem ou todos). */
function owns(rec: PlayerRecord, t: Talent): boolean {
  const D = getData();
  const arch = rec.archetype ? D.archetypesById.get(rec.archetype) : undefined;
  const d = t.dono;
  switch (d.tipo) {
    case 'instituicao':
      return d.instituicao === rec.institution;
    case 'papel':
      return !!arch && arch.papel === d.papel;
    case 'arquetipos':
      return !!arch && (d.arquetipos as readonly string[]).includes(arch.id);
    case 'arquetipo':
      return !!arch && d.arquetipo === arch.id;
    case 'margem':
      return d.margem === rec.side;
    case 'classe':
      return d.classe === rec.class;
    case 'todos':
      return true;
  }
}

/** Nível em que o talento escolhido entrou (o menor nível do piloto da lista dele). */
export const talentLevelOf = (t: Talent): number => t.niveis.find((n) => PILOT_TALENT_LEVELS[n] === t.grupo) ?? t.niveis[0]!;

/** Opções do nível (10, 15 ou 20): os talentos em piloto do grupo do nível que o jogador pode pegar. */
export function talentOptions(rec: PlayerRecord, nivel: number): TalentOption[] {
  const grupo = PILOT_TALENT_LEVELS[nivel];
  if (!grupo) return [];
  const out: TalentOption[] = [];
  for (const t of getData().talents.talentos) {
    if (!t.emPiloto || t.grupo !== grupo || !t.niveis.includes(nivel) || !owns(rec, t)) continue;
    const name = rec.archetype && t.nomePorArquetipo ? ((t.nomePorArquetipo as Record<string, string | undefined>)[rec.archetype] ?? t.name) : t.name;
    out.push({ id: t.id, name, descricao: t.descricao, grupo: t.grupo, nivel });
  }
  return out;
}

/** Níveis de talento já escolhidos. */
export function pickedTalentLevels(rec: PlayerRecord): number[] {
  const D = getData();
  return rec.talent_picks.map((id) => D.talentsById.get(id)).filter((t): t is Talent => !!t).map(talentLevelOf);
}

/** Níveis de talento que o jogador já alcançou e ainda não escolheu (só os que têm opção agora). */
export function pendingTalentLevels(rec: PlayerRecord): number[] {
  const done = new Set(pickedTalentLevels(rec));
  return Object.keys(PILOT_TALENT_LEVELS)
    .map(Number)
    .filter((n) => n <= rec.level && !done.has(n) && talentOptions(rec, n).length > 0);
}

/** Escolhe um talento: tem que ser opção de um nível alcançado e ainda livre. */
export function pickTalent(rec: PlayerRecord, talentId: string): Check & { resultado: GameResult } {
  const r = emptyResult();
  const t = getData().talentsById.get(talentId);
  if (!t) return { ok: false, erro: 'Talento desconhecido.', resultado: r };
  if (rec.talent_picks.includes(talentId)) return { ok: false, erro: 'Talento já escolhido.', resultado: r };
  const nivel = talentLevelOf(t);
  if (!PILOT_TALENT_LEVELS[nivel] || !t.emPiloto) return { ok: false, erro: 'Esse talento ainda não está no piloto.', resultado: r };
  if (rec.level < nivel) return { ok: false, erro: `Esse talento é do nível ${nivel}.`, resultado: r };
  if (pickedTalentLevels(rec).includes(nivel)) return { ok: false, erro: `Você já escolheu o talento do nível ${nivel}.`, resultado: r };
  if (!talentOptions(rec, nivel).some((o) => o.id === talentId)) return { ok: false, erro: 'Esse talento não é para você.', resultado: r };
  rec.talent_picks.push(talentId);
  r.mudou = true;
  r.avisos.push(`Talento: ${t.name}`);
  return { ok: true, resultado: r };
}

/** Talentos válidos do registro (para a simulação): os que ainda existem e são do jogador. */
export function activeTalents(rec: PlayerRecord): string[] {
  const D = getData();
  return rec.talent_picks.filter((id) => {
    const t = D.talentsById.get(id);
    return !!t && t.emPiloto && owns(rec, t) && rec.level >= talentLevelOf(t);
  });
}
