/**
 * Monta e sobe o servidor: HTTP (express) + WebSocket (Colyseus 0.18) na mesma porta.
 * - salas 'mundo' (WorldRoom), uma por mapa (opção mapId: delta, margem_esquerda, margem_direita,
 *   usina_da_ponte, juncal e a sandbox prototipo_delta); quem pede qg_esquerda ou qg_direita (Fase 2)
 *   cai numa sala de apelido que manda trocar_sala para a margem;
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
import { BOAT_MAP, listMaps, START_MAP } from '@pqp/shared/map';
import { SALA_MUNDO } from '@pqp/shared/net';
import { msAteProximoCiclo } from '@pqp/shared/game/city';
import { CityService } from './city_service';
import { CITY_TICK_MS, DEFAULT_PORT, FACTION_CHECK_MS } from './config';
import { createStore, projectRoot, type Store } from './persistence/store';
import { liveRooms, setWorldRoomDeps, WorldRoom, type WorldRoomOptions } from './rooms/WorldRoom';

export interface StartOptions {
  port?: number;
  host?: string;
  store?: Store;
  room?: WorldRoomOptions;
  /** salas criadas ao subir, uma por mapa (padrão: todos os mapas, o Delta primeiro) */
  maps?: string[];
  /** serve o build do cliente (padrão: sim, se packages/client/dist existir) */
  serveClient?: boolean;
  clientDist?: string;
  log?: (m: string) => void;
  /** Fase 4: a cidade (padrão: uma nova, lida do Store) e o intervalo do tick dela */
  city?: CityService;
  cityTickMs?: number;
  /** Fase 5: a cada quanto conferir o tick de facção */
  factionCheckMs?: number;
}

export interface Running {
  port: number;
  host: string;
  store: Store;
  city: CityService;
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

  // Fase 4: a cidade (mercado, câmbio e ciclo) é uma só para todas as salas, salva no Store
  const city = opts.city ?? new CityService({ store, log });
  await city.load();
  city.start(opts.cityTickMs ?? CITY_TICK_MS);
  // Fase 5: tick da IA de facção (PQP_TICK_FACCAO_MIN; padrão 5 min fora de produção)
  city.faction.start(opts.factionCheckMs ?? FACTION_CHECK_MS);
  log(`[faccao] tick de ${city.faction.tickMin} min (ciclo ${city.faction.state.ciclo})`);
  setWorldRoomDeps({ store, log, city });
  const httpServer = http.createServer();
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
    greet: false,
    express: (app: express.Application) => {
      app.get('/health', (_req, res) => {
        const rooms = Array.from(liveRooms).map((r) => r.core.stats());
        const cidade = { ciclo: city.state.ciclo, cicloMin: city.cicloMin, msAteProximoCiclo: msAteProximoCiclo(city.state, city.now()), anuncios: city.state.mercado.anuncios.length };
        const f = city.faction.state;
        const faccao = { ciclo: f.ciclo, tickMin: city.faction.tickMin, proximoTickEm: f.proximoTickEm, eventos: f.eventos.length, runs: city.dungeons.runs.size, plantonistas: Object.keys(city.duty.state.plantonistas).length };
        res.json({ ok: true, store: store.kind, uptimeS: Math.round(process.uptime()), rooms, cidade, faccao });
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
  // uma sala por mapa, todas 'mundo', separadas pela opção mapId (o cliente entra com { mapId })
  gameServer.define(SALA_MUNDO, WorldRoom, opts.room ?? {}).filterBy(['mapId']);
  await gameServer.listen(port, host);
  // o mundo é persistente: as salas existem desde o início (inimigos e plantonistas rodam sem
  // ninguém). A do Delta primeiro: quem entra sem mapId cai nela.
  // o barco da travessia não tem sala fixa: cada jogador abre a sua ('barco:<id>')
  const maps = opts.maps ?? [START_MAP, ...listMaps().filter((m) => m !== START_MAP && m !== BOAT_MAP)];
  for (const mapId of maps) await matchMaker.createRoom(SALA_MUNDO, { mapId });
  const addr = httpServer.address() as AddressInfo | null;
  const realPort = addr?.port ?? port;

  return {
    port: realPort,
    host,
    store,
    gameServer,
    http: httpServer,
    ...(serveClient ? { clientDist: dist } : {}),
    city,
    async close() {
      city.stop();
      city.faction.stop();
      for (const r of liveRooms) await r.core.saveAll().catch(() => undefined);
      await gameServer.gracefullyShutdown(false).catch(() => undefined);
      city.save();
      await store.flush().catch(() => undefined);
      if (httpServer.listening) await new Promise<void>((res) => httpServer.close(() => res()));
    },
  };
}
