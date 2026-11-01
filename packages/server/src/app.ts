/**
 * Monta e sobe o servidor: HTTP (express) + WebSocket (Colyseus 0.18) na mesma porta.
 * - sala 'mundo' (WorldRoom);
 * - GET /health;
 * - packages/client/dist como estático, com volta para index.html, quando a pasta existir.
 * Usado pelo index.ts e pelo teste do WorldRoom (porta aleatória).
 */
import { existsSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { matchMaker, Server, WebSocketTransport } from 'colyseus';
import { DEFAULT_PORT } from './config';
import { createStore, projectRoot, type Store } from './persistence/store';
import { liveRooms, setWorldRoomDeps, WorldRoom, type WorldRoomOptions } from './rooms/WorldRoom';

export interface StartOptions {
  port?: number;
  host?: string;
  store?: Store;
  room?: WorldRoomOptions;
  /** serve o build do cliente (padrão: sim, se packages/client/dist existir) */
  serveClient?: boolean;
  clientDist?: string;
  log?: (m: string) => void;
}

export interface Running {
  port: number;
  host: string;
  store: Store;
  gameServer: Server;
  http: http.Server;
  clientDist?: string;
  close(): Promise<void>;
}

export const defaultClientDist = () => path.join(projectRoot(), 'packages', 'client', 'dist');

/** Endereços IPv4 da rede local, para abrir no celular. */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  return out;
}

export async function startServer(opts: StartOptions = {}): Promise<Running> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const port = opts.port ?? DEFAULT_PORT;
  const host = opts.host ?? '0.0.0.0';
  const store = opts.store ?? createStore();
  const dist = opts.clientDist ?? defaultClientDist();
  const serveClient = (opts.serveClient ?? true) && existsSync(path.join(dist, 'index.html'));

  setWorldRoomDeps({ store, log });
  const httpServer = http.createServer();
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
    greet: false,
    express: (app: express.Application) => {
      app.get('/health', (_req, res) => {
        const rooms = Array.from(liveRooms).map((r) => r.core.stats());
        res.json({ ok: true, store: store.kind, uptimeS: Math.round(process.uptime()), rooms });
      });
      if (serveClient) {
        // index.html sempre revalida (aponta para os assets do build atual); os assets do Vite
        // levam hash no nome e podem ficar no cache para sempre; o resto, 1 h
        app.use(
          express.static(dist, {
            index: 'index.html',
            setHeaders: (res, filePath) => {
              const rel = path.relative(dist, filePath).split(path.sep).join('/');
              if (rel === 'index.html' || rel.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
              else if (rel.startsWith('assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
              else res.setHeader('Cache-Control', 'public, max-age=3600');
            },
          }),
        );
        // volta para o index.html (rotas do cliente); a API do Colyseus responde antes daqui.
        // Arquivo que não existe (caminho com extensão ou em /assets/) responde 404: um build novo
        // apagou o JS velho e o navegador não pode receber HTML no lugar do script.
        app.use((req, res, next) => {
          if (req.method !== 'GET' || req.path.startsWith('/matchmake')) return next();
          if (req.path.startsWith('/assets/') || path.posix.extname(req.path) !== '') {
            res.status(404).type('text/plain; charset=utf-8').send('não encontrado');
            return;
          }
          res.setHeader('Cache-Control', 'no-cache');
          res.sendFile(path.join(dist, 'index.html'));
        });
      } else {
        app.get('/', (_req, res) => {
          res.type('text/plain; charset=utf-8').send('Ponte que Partiu: servidor no ar. O cliente não foi compilado (npm run build) ou rode o Vite (npm run dev).');
        });
      }
    },
  });
  gameServer.define('mundo', WorldRoom, opts.room ?? {});
  await gameServer.listen(port, host);
  // o mapa é persistente: a sala existe desde o início (inimigos e plantonistas rodam sem ninguém)
  await matchMaker.createRoom('mundo', {});
  const addr = httpServer.address() as AddressInfo | null;
  const realPort = addr?.port ?? port;

  return {
    port: realPort,
    host,
    store,
    gameServer,
    http: httpServer,
    ...(serveClient ? { clientDist: dist } : {}),
    async close() {
      for (const r of liveRooms) await r.core.saveAll().catch(() => undefined);
      await gameServer.gracefullyShutdown(false).catch(() => undefined);
      await store.flush().catch(() => undefined);
      if (httpServer.listening) await new Promise<void>((res) => httpServer.close(() => res()));
    },
  };
}
