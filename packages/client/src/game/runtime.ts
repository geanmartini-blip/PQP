/**
 * Objetos que as cenas compartilham: configuração, cliente de rede, gerador de arte e dicas.
 * Criado uma vez na BootScene.
 *
 * O servidor local (?offline=1) entra por import() dinâmico: quem joga online não baixa nem analisa
 * o LocalServer.
 */
import type { ArtApi } from '../art/contract';
import type { ClientConfig } from '../config';
import { ColyseusTransport } from '../net/colyseusTransport';
import { LaggedTransport, type Transport } from '../net/transport';
import { Tips } from '../ui/tips';
import { GameClient, type StorageLike } from './GameClient';

export interface Runtime {
  cfg: ClientConfig;
  gc: GameClient;
  art: ArtApi;
  tips: Tips;
  storage: StorageLike | undefined;
  offline: boolean;
}

let current: Runtime | undefined;

/** Chave do registro do jogador no modo offline (mais o token). */
export const OFFLINE_RECORD_KEY = 'pqp_offline_';
/** Fase 4: chave da cidade do modo offline. */
export const OFFLINE_CITY_KEY = 'pqp_offline_cidade';
/** Fase 5: chave do estado da IA de facção do modo offline. */
export const OFFLINE_FACTION_KEY = 'pqp_offline_faccao';

/** ?ciclo=N (minutos) encurta o ciclo da cidade no modo offline, para testar aluguel e lista de espera. */
export function offlineCycleMin(): number | undefined {
  try {
    const v = Number(new URLSearchParams(globalThis.location?.search ?? '').get('ciclo'));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

/** ?dev_travessia=1 (só no modo offline): Bruno Ferro derrotado e nível 8, para testar o barco. */
export function devTravessia(): boolean {
  try {
    const v = new URLSearchParams(globalThis.location?.search ?? '').get('dev_travessia');
    return v !== null && v !== '0' && v !== 'false';
  } catch {
    return false;
  }
}

export function getRuntime(): Runtime {
  if (!current) throw new Error('runtime ainda não criado (BootScene)');
  return current;
}

/** localStorage com try/catch (aba privada pode lançar só de acessar). */
export function browserStorage(): StorageLike | undefined {
  try {
    const s = globalThis.localStorage;
    if (!s) return undefined;
    return {
      getItem: (k) => {
        try {
          return s.getItem(k);
        } catch {
          return null;
        }
      },
      setItem: (k, v) => {
        try {
          s.setItem(k, v);
        } catch {
          // cheio ou bloqueado
        }
      },
    };
  } catch {
    return undefined;
  }
}

/** Transporte de base: Colyseus, ou o servidor local (carregado só no modo offline). */
export async function makeBaseTransport(cfg: ClientConfig, joinOptions: () => Record<string, unknown>): Promise<Transport> {
  if (cfg.offline) {
    const m = await import('../net/localTransport');
    // o registro do jogador do modo offline fica no aparelho (o mesmo token do online)
    const st = browserStorage();
    return new m.LocalTransport({
      store: {
        load: (id) => {
          const raw = st?.getItem(OFFLINE_RECORD_KEY + id);
          return raw ? (JSON.parse(raw) as unknown) : null;
        },
        save: (id, rec) => st?.setItem(OFFLINE_RECORD_KEY + id, JSON.stringify(rec)),
      },
      // Fase 4: a cidade (mercado, câmbio, ciclo) também fica no aparelho, no relógio de verdade
      clock: () => Date.now(),
      cityStore: {
        load: () => {
          const raw = st?.getItem(OFFLINE_CITY_KEY);
          return raw ? (JSON.parse(raw) as unknown) : null;
        },
        save: (c) => st?.setItem(OFFLINE_CITY_KEY, JSON.stringify(c)),
      },
      ...(offlineCycleMin() !== undefined ? { cityCycleMin: offlineCycleMin()!, factionTickMin: offlineCycleMin()! } : {}),
      // dev: ?dev_travessia=1 deixa quem está no Delta pronto para o barco do Seu Jacó
      ...(devTravessia() ? { devTravessia: true } : {}),
      // Fase 5: a IA de facção (regiões, pontos, avisos) também fica no aparelho
      factionStore: {
        load: () => {
          const raw = st?.getItem(OFFLINE_FACTION_KEY);
          return raw ? (JSON.parse(raw) as unknown) : null;
        },
        save: (e) => st?.setItem(OFFLINE_FACTION_KEY, JSON.stringify(e)),
      },
    });
  }
  return new ColyseusTransport(cfg.endpoint, joinOptions);
}

/**
 * Cria o runtime. `base` é o transporte já pronto (makeBaseTransport); sem ele, usa o Colyseus.
 * `joinRef` recebe o GameClient para as opções do joinOrCreate do Colyseus.
 */
export function createRuntime(cfg: ClientConfig, art: ArtApi, base?: Transport, joinRef?: { gc?: GameClient }): Runtime {
  const storage = browserStorage();
  const ref = joinRef ?? {};
  const t: Transport = base ?? new ColyseusTransport(cfg.endpoint, () => ref.gc?.joinOptions() ?? {});
  const transport = LaggedTransport.wrapIfNeeded(t, { lagMs: cfg.lag, jitterMs: cfg.jitter, loss: cfg.loss });
  const gc = new GameClient(transport, {
    ...(cfg.name ? { name: cfg.name } : {}),
    ...(cfg.archetypeId ? { archetypeId: cfg.archetypeId } : {}),
    storage,
    now: () => performance.now(),
  });
  ref.gc = gc;
  current = { cfg, gc, art, tips: new Tips(storage), storage, offline: cfg.offline };
  return current;
}
