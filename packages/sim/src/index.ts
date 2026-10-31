/**
 * Simulador de combate sem interface, para o balanceamento (Fase 1; a afinação é da Fase 3).
 * Funções puras: runMatch (uma luta), runSeries (n lutas de um par) e runTournament (todos
 * contra todos, ou grupos sorteados), mais o relatório em texto.
 */
export { runMatch, setupMatch, referenceLevel, MATCH_DEFAULTS, type MatchConfig, type MatchResult } from './match';
export {
  runTournament,
  runSeries,
  allArchetypes,
  type Modo,
  type TournamentConfig,
  type TournamentReport,
  type ArchetypeRow,
  type PairRow,
  type RoleRow,
  type SeriesOpts,
} from './tournament';
export { formatReport, formatSeries } from './report';
export { parseArgs, MODOS, type SimArgs } from './args';
