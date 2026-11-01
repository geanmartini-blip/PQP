/**
 * Progressão do 1 ao 8: XP pela curva de progression.json, XP só em luta de grupo (com +15% por
 * jogador ao vivo a mais), tetos de nível do Delta e da travessia, desbloqueios do tutorial e
 * troca de estágio.
 *
 * Decisões (registradas no retorno da fase):
 * - No Delta, o Seu Jacó acompanha o novato: luta de quem ainda está no Delta conta como grupo
 *   (o Seu Jacó é o companheiro de IA), para o tutorial não travar.
 * - Teto: no Delta o nível para no 7 até derrotar o Bruno Ferro; derrotá-lo leva ao 8 (o XP que
 *   faltar é completado) e o estágio vira 'travessia'; na travessia o nível para no 8 até
 *   escolher a margem.
 */
import { getData } from '../data';
import { bal } from '../sim/constants';
import { hasFlag } from './flags';
import { emptyResult, type GameResult, type GroupCtx, type PlayerRecord, type Unlock } from './types';

/** story_flag que libera a travessia (Bruno Ferro derrotado). */
export const FLAG_BRUNO = 'delta_bruno_ferro_derrotado';
/** v0.3: o Delta vai do 1 ao 4 (Bruno Ferro no 4) e a balsa é no 5. */
export const DELTA_MAX_LEVEL = 4;
export const TRAVESSIA_LEVEL = 5;

/** XP para sair do nível e chegar no próximo: round(50 × n^1,6), sem teto (progression.xp.formula). */
export function xpToNextLevel(level: number): number {
  const f = getData().progression.xp.formula;
  return Math[f.arredondamento](f.base * Math.pow(level, f.expoente));
}

/** XP total acumulado para chegar no nível. */
export function xpTotalFor(level: number): number {
  let s = 0;
  for (let n = 1; n < level; n++) s += xpToNextLevel(n);
  return s;
}

/** Nível máximo agora: 7 no Delta sem o Bruno Ferro, 8 no Delta com ele e na travessia, sem teto na margem. */
export function levelCapOf(rec: PlayerRecord): number {
  if (rec.stage === 'margem') return Number.POSITIVE_INFINITY;
  if (rec.stage === 'travessia') return TRAVESSIA_LEVEL;
  return hasFlag(rec, FLAG_BRUNO) ? TRAVESSIA_LEVEL : DELTA_MAX_LEVEL;
}

/** Ainda no Delta (o Seu Jacó conta como companheiro para o XP). */
export const isDeltaRookie = (rec: Pick<PlayerRecord, 'stage'>): boolean => rec.stage === 'delta';

/**
 * XP de uma luta para um jogador. Só luta em grupo dá XP: 2 ou mais personagens do mesmo lado
 * (balance.combate.grupoMin), contando plantonistas e IA. Cada jogador ao vivo a mais dá +15%
 * (balance.combate.xpBonusPorJogadorVivoExtraPct) para todos. Plantonista ganha metade
 * (plantonistaXpMult). `delta` = jogador do Delta, que tem o Seu Jacó junto.
 */
export function groupXp(base: number, g: GroupCtx, opts: { delta?: boolean } = {}): number {
  const c = bal().combate;
  const personagens = Math.max(g.personagens, opts.delta ? c.grupoMin : 0);
  if (base <= 0 || personagens < c.grupoMin) return 0;
  const bonus = 1 + (c.xpBonusPorJogadorVivoExtraPct / 100) * Math.max(0, g.aoVivo - 1);
  const mult = (g.plantonista ? c.plantonistaXpMult : 1) * (1 + (g.xpPct ?? 0) / 100);
  return Math.round(base * bonus * mult);
}

/** Desbloqueios do tutorial (progression.botoes[].desbloqueioTutorial) até o nível, na ordem. */
export function tutorialUnlocksUpTo(level: number, opts: { margem?: boolean } = {}): Unlock[] {
  const out: Unlock[] = [];
  for (const b of getData().progression.botoes) {
    for (const u of b.desbloqueioTutorial ?? []) {
      if (u.nivel > level) continue;
      // habilidades e Especial da classe só aparecem depois da travessia
      if (u.nivel >= TRAVESSIA_LEVEL && !opts.margem) continue;
      out.push({ nivel: u.nivel, controle: u.controle, descricao: u.descricao });
    }
  }
  return out;
}

/** Desbloqueios que entram exatamente no nível. */
export const tutorialUnlocksAt = (level: number, opts: { margem?: boolean } = {}): Unlock[] =>
  tutorialUnlocksUpTo(level, opts).filter((u) => u.nivel === level);

/**
 * Controle ensinado por um objetivo de missão (TutorialControl) -> chave do desbloqueioTutorial.
 * Quando a missão pede um controle antes do nível dele, a missão já libera.
 */
export const CONTROL_TO_UNLOCK: Readonly<Record<string, string | undefined>> = {
  andar_joystick: 'joystick',
  tocar_no_chao: 'joystick',
  alvo_automatico: 'alvo_e_basico',
  trocar_alvo: 'troca_de_alvo',
  habilidade: 'habilidades',
  especial: 'especial',
  item: 'item',
  saque: 'saque_automatico',
  modo_automatico: 'modo_automatico',
  desviar_aviso: 'aviso_no_chao',
  reanimar: 'reanimar',
  auto_caminho: undefined,
};

/** Recalcula o estágio pelo nível e pelas flags. Devolve o novo estágio se mudou. */
export function updateStage(rec: PlayerRecord): PlayerRecord['stage'] | undefined {
  if (rec.stage === 'delta' && rec.level >= TRAVESSIA_LEVEL && hasFlag(rec, FLAG_BRUNO)) {
    rec.stage = 'travessia';
    return rec.stage;
  }
  return undefined;
}

function onLevels(rec: PlayerRecord, from: number, r: GameResult): void {
  for (let n = from + 1; n <= rec.level; n++) {
    r.niveis.push(n);
    r.desbloqueios.push(...tutorialUnlocksAt(n, { margem: rec.stage === 'margem' }));
    r.avisos.push(`Nível ${n}!`);
  }
  const st = updateStage(rec);
  if (st) {
    r.estagio = st;
    r.avisos.push('O Seu Jacó está esperando no cais: hora da travessia.');
  }
}

/**
 * Soma XP ao registro (o XP já decidido: grupo, bônus e plantão) e sobe de nível até o teto.
 * O que passar do teto fica guardado no XP do nível.
 */
export function gainXp(rec: PlayerRecord, amount: number): GameResult {
  const r = emptyResult();
  if (amount <= 0) return r;
  const from = rec.level;
  rec.xp += Math.round(amount);
  r.xp = Math.round(amount);
  r.mudou = true;
  const cap = levelCapOf(rec);
  while (rec.level < cap && rec.xp >= xpToNextLevel(rec.level)) {
    rec.xp -= xpToNextLevel(rec.level);
    rec.level += 1;
  }
  onLevels(rec, from, r);
  return r;
}

/** Leva o jogador pelo menos até o nível (o XP que faltar é dado de presente; o XP do nível zera). */
export function raiseToLevel(rec: PlayerRecord, level: number): GameResult {
  const r = emptyResult();
  const target = Math.min(level, levelCapOf(rec));
  if (rec.level >= target) {
    const st = updateStage(rec);
    if (st) {
      r.estagio = st;
      r.mudou = true;
    }
    return r;
  }
  const from = rec.level;
  rec.level = target;
  rec.xp = 0;
  r.mudou = true;
  onLevels(rec, from, r);
  return r;
}

/** Sincroniza com um nível vindo de fora (evento 'level' da simulação), respeitando o teto. */
export function syncLevel(rec: PlayerRecord, level: number): GameResult {
  return raiseToLevel(rec, level);
}

/** Teto de nível para a entidade da simulação (Entity.levelCap). undefined = sem teto. */
export function simLevelCap(rec: PlayerRecord): number | undefined {
  const c = levelCapOf(rec);
  return Number.isFinite(c) ? c : undefined;
}
