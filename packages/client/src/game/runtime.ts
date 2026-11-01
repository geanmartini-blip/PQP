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
