/**
 * Objetos que as cenas compartilham: configuração, cliente de rede, gerador de arte e dicas.
 * Criado uma vez na BootScene.
 */
import type { ArtApi } from '../art/contract';
import type { ClientConfig } from '../config';
import { ColyseusTransport } from '../net/colyseusTransport';
import { LocalTransport } from '../net/localTransport';
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

export function createRuntime(cfg: ClientConfig, art: ArtApi): Runtime {
  const storage = browserStorage();
  let gc: GameClient | undefined;
  const base: Transport = cfg.offline ? new LocalTransport() : new ColyseusTransport(cfg.endpoint, () => gc?.joinOptions() ?? {});
  const transport = LaggedTransport.wrapIfNeeded(base, { lagMs: cfg.lag, jitterMs: cfg.jitter, loss: cfg.loss });
  gc = new GameClient(transport, {
    ...(cfg.name ? { name: cfg.name } : {}),
    ...(cfg.archetypeId ? { archetypeId: cfg.archetypeId } : {}),
    storage,
    now: () => performance.now(),
  });
  current = { cfg, gc, art, tips: new Tips(storage), storage, offline: cfg.offline };
  return current;
}
