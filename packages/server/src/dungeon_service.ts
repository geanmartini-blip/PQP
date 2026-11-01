/**
 * Fase 5: as runs da masmorra no servidor (dungeon_run de game/dungeon.ts), uma por grupo.
 *
 * Cada andar é uma sala própria, 'masmorra:<runId>:<andar>' (o WorldRoom cria pelo mapId, como a casa):
 * o mapa sai de buildDungeonFloor(andar, run.seed, run.dungeonId), que o cliente também monta com a
 * semente de masmorra_info. Pegar a escada aberta leva o grupo inteiro para a sala do andar seguinte
 * (trocar_sala); a saída da entrada leva quem pisou nela de volta para a Usina da Ponte, com as
 * recompensas guardadas.
 * SUGESTÃO: as runs vivem só na memória do processo (reiniciar o servidor encerra as runs abertas;
 * o que já foi entregue ao registro fica).
 */
import { createDungeonRun, type DungeonMember, type DungeonRun, type Fail } from '@pqp/shared/game/index';

export const DUNGEON_PREFIX = 'masmorra:';

export const isDungeonMap = (id: unknown): id is string => typeof id === 'string' && id.startsWith(DUNGEON_PREFIX) && parseDungeonMap(id) !== undefined;

export const dungeonMapId = (runId: string, andar: number): string => `${DUNGEON_PREFIX}${runId}:${andar}`;

export function parseDungeonMap(id: string): { runId: string; andar: number } | undefined {
  if (!id.startsWith(DUNGEON_PREFIX)) return undefined;
  const rest = id.slice(DUNGEON_PREFIX.length);
  const i = rest.lastIndexOf(':');
  if (i <= 0) return undefined;
  const andar = Number(rest.slice(i + 1));
  if (!Number.isInteger(andar) || andar < 1) return undefined;
  return { runId: rest.slice(0, i), andar };
}

/** Mapa e entrada para onde volta quem sai das Galerias. */
export const DUNGEON_EXIT = { mapId: 'usina_da_ponte', spawn: 'masmorra_galerias_da_usina' } as const;

function hash(s: string, seed: number): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export class DungeonService {
  readonly runs = new Map<string, DungeonRun>();
  private seq = 0;

  constructor(private readonly o: { now: () => number; seed?: number }) {}

  /** Abre uma run para o grupo (até 4, ao menos um jogador ao vivo). */
  create(grupo: DungeonMember[], opts: { atalho?: number; dungeonId?: string } = {}): { ok: true; run: DungeonRun } | Fail {
    const now = this.o.now();
    const id = `r${now.toString(36)}${(++this.seq).toString(36)}`;
    const c = createDungeonRun({ id, seed: hash(id, this.o.seed ?? 2077), grupo, now, ...(opts.atalho ? { atalho: opts.atalho } : {}), ...(opts.dungeonId ? { dungeonId: opts.dungeonId } : {}) });
    if (c.ok) this.runs.set(id, c.run);
    return c;
  }

  get(id: string): DungeonRun | undefined {
    return this.runs.get(id);
  }

  /** A run acabou e todos saíram: esquece. */
  close(id: string): void {
    const r = this.runs.get(id);
    if (r && r.status !== 'ativa') this.runs.delete(id);
  }

  /** Run ativa em que o jogador está (como jogador ao vivo). */
  runOf(playerId: string): DungeonRun | undefined {
    for (const r of this.runs.values()) if (r.status === 'ativa' && r.grupo.some((m) => m.playerId === playerId && !m.saiu)) return r;
    return undefined;
  }
}
