/**
 * Uma luta simulada sem tela: dois times de arquétipos no modo automático (Doutrina padrão),
 * num mapa aberto gerado em memória, no nível de referência do balanceamento. Pura e
 * determinística: mesma configuração e mesma semente dão o mesmo resultado.
 */
import { getData } from '@pqp/shared';
import { createRng, createWorld, spawnPlayer, step, type DoctrineCard, type Entity, type World } from '@pqp/shared/sim';
import { arena } from '@pqp/shared/sim/testkit';

export interface MatchConfig {
  /** arquétipos do time A e do time B (1 contra 1: um em cada) */
  a: readonly string[];
  b: readonly string[];
  seed: number;
  /** nível dos personagens (padrão: balance.ganhoPorNivel.nivelReferenciaClasse, a tabela vale nele) */
  level?: number;
  /** tempo máximo de luta em segundos; passou, é empate */
  maxSeconds?: number;
  /** distância entre os times no começo, em tiles */
  distance?: number;
  /** lado do mapa: troca A e B de posição (tira a vantagem de lado) */
  swap?: boolean;
  /** poções no botão de item (padrão 0: a Doutrina padrão não toma poção sozinha) */
  potions?: number;
  /** cartas próprias de cada time (padrão: a Doutrina padrão de cada um) */
  doctrineA?: DoctrineCard[];
  doctrineB?: DoctrineCard[];
  /** tamanho do mapa aberto (quadrado) */
  mapSize?: number;
  /**
   * carga inicial do Especial (0 a 1; padrão 0). As lutas simuladas duram de 15 a 25 s e o
   * Especial carrega em 45 a 90 s: com 1, todos começam com ele pronto e ele pesa no resultado.
   */
  specialStart?: number;
  /**
   * sorteio do começo da luta pela semente (padrão true): distância entre os times de
   * distance ± jitterDistance tiles, um pouco de desalinhamento vertical, o primeiro ataque
   * básico de cada um atrasado de 0 a 1 s e os botões já gastos em parte. Sem isso, 1 contra 1
   * de atributos parecidos vira um degrau: quem tem a menor vantagem ganha todas.
   */
  jitter?: boolean;
}

export interface MatchResult {
  winner: 'a' | 'b' | 'empate';
  ticks: number;
  seconds: number;
  /** vida que sobrou em cada time (fração média dos que estão de pé; caído conta 0) */
  hpA: number;
  hpB: number;
  /** dano total causado por cada time */
  damageA: number;
  damageB: number;
  seed: number;
}

// SUGESTÃO: luta simulada dura no máximo 120 s; começa com os times a 8 tiles (a trava automática pega a 8),
// com sorteio de ±2 tiles, até 1 tile de desalinhamento, até 1 s de atraso no primeiro básico e cada
// botão começando com 0 a 100% da recarga (luta pega no meio da rotina) e vida de 60 a 100%.
// Sem o sorteio da vida, o 1 contra 1 é determinístico: com a força de todos parecida, quem tem a
// menor vantagem vence quase todas, e a vitória contra a média vira o posto do arquétipo (de 26% a
// 74% mesmo com força igual), sem como ficar tudo em 55%.
export const MATCH_DEFAULTS = { maxSeconds: 120, distance: 8, mapSize: 40, potions: 0, jitterDistance: 2, jitterY: 1, jitterBasicMs: 1000, jitterHpMin: 0.6 } as const;

export const referenceLevel = () => getData().balance.ganhoPorNivel.nivelReferenciaClasse;

const up = (e: Entity) => !e.dead && e.downedUntil === undefined;

/** Monta o mundo da luta (exportado para testes e depuração). */
export function setupMatch(cfg: MatchConfig): { w: World; A: Entity[]; B: Entity[] } {
  const size = cfg.mapSize ?? MATCH_DEFAULTS.mapSize;
  const jitter = cfg.jitter ?? true;
  // sorteio próprio da montagem (não mexe no RNG do mundo)
  const jr = createRng((cfg.seed ^ 0x5bd1e995) >>> 0);
  const J = MATCH_DEFAULTS;
  const dist = (cfg.distance ?? J.distance) + (jitter ? (jr.next() * 2 - 1) * J.jitterDistance : 0);
  const level = cfg.level ?? referenceLevel();
  const w = createWorld(arena(size, size), cfg.seed >>> 0);
  const cx = size / 2, cy = size / 2;
  const left = cx - dist / 2, right = cx + dist / 2;
  const mk = (ids: readonly string[], team: 'aliados' | 'inimigos', x: number, party: string, cards?: DoctrineCard[]) =>
    ids.map((id, i) => {
      const y = cy + (i - (ids.length - 1) / 2) * 1.5 + (jitter ? (jr.next() * 2 - 1) * J.jitterY : 0);
      const e = spawnPlayer(w, { name: `${party}${i + 1}:${id}`, archetypeId: id, level, x, y, team, playerId: `${party}${i + 1}` });
      if (jitter) {
        e.nextBasicTick = Math.max(e.nextBasicTick, w.tick + jr.int(0, Math.round(J.jitterBasicMs / 50)));
        // chega à luta com 60 a 100% da vida (no mapa ninguém começa a briga cheio e igual)
        e.hp = e.stats.hpMax * (J.jitterHpMin + jr.next() * (1 - J.jitterHpMin));
        // a luta pega cada um no meio da rotina: cada botão começa com 0 a 100% da recarga
        for (const ab of [e.loadout!.b1, e.loadout!.b2, e.loadout!.b3]) {
          const cd = ab ? getData().abilities.get(ab)?.cooldownS : undefined;
          if (ab && cd) e.cooldowns[ab] = Math.max(e.cooldowns[ab] ?? 0, w.tick + jr.int(0, Math.round(cd * 20)));
        }
      }
      e.partyId = party;
      e.auto = true;
      e.doctrine = cards ? [...cards] : [];
      e.loadout!.itemCount = cfg.potions ?? MATCH_DEFAULTS.potions;
      if (cfg.specialStart !== undefined && e.loadout!.especial) e.special = Math.max(0, Math.min(1, cfg.specialStart));
      return e;
    });
  const ax = cfg.swap ? right : left, bx = cfg.swap ? left : right;
  const A = mk(cfg.a, 'aliados', ax, 'A', cfg.doctrineA);
  const B = mk(cfg.b, 'inimigos', bx, 'B', cfg.doctrineB);
  return { w, A, B };
}

/** Roda uma luta até um time inteiro cair (ou o tempo acabar). */
export function runMatch(cfg: MatchConfig): MatchResult {
  const { w, A, B } = setupMatch(cfg);
  const maxTicks = Math.round((cfg.maxSeconds ?? MATCH_DEFAULTS.maxSeconds) * 20);
  const team = new Map<number, 'a' | 'b'>();
  for (const e of A) team.set(e.id, 'a');
  for (const e of B) team.set(e.id, 'b');
  let damageA = 0, damageB = 0;
  let winner: MatchResult['winner'] = 'empate';
  while (w.tick < maxTicks) {
    for (const ev of step(w)) {
      if (ev.t !== 'hit') continue;
      const side = team.get(ev.src) ?? team.get(w.entities.get(ev.src)?.ownerId ?? -1);
      if (side === 'a') damageA += ev.amount;
      else if (side === 'b') damageB += ev.amount;
    }
    const aUp = A.some(up), bUp = B.some(up);
    if (!aUp || !bUp) {
      winner = aUp ? 'a' : bUp ? 'b' : 'empate';
      break;
    }
  }
  const hp = (list: Entity[]) => list.reduce((s, e) => s + (up(e) ? e.hp / e.stats.hpMax : 0), 0) / Math.max(1, list.length);
  return {
    winner,
    ticks: w.tick,
    seconds: w.tick / 20,
    hpA: round3(hp(A)),
    hpB: round3(hp(B)),
    damageA: Math.round(damageA),
    damageB: Math.round(damageB),
    seed: cfg.seed >>> 0,
  };
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
