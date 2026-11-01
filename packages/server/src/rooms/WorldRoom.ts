/**
 * WorldRoom: adaptador Colyseus 0.18 do GameServerCore. Uma sala por mapa: todas se chamam 'mundo'
 * e se distinguem pela opção `mapId` (define(...).filterBy(['mapId']) no app.ts; o app cria uma de
 * cada mapa ao subir). 20 ticks por segundo, sem estado sincronizado do Colyseus: tudo vai em
 * mensagens (MSG e GAME_MSG) montadas pelo núcleo.
 *
 * Troca de sala (Fase 2): quem entra sem mapId cai na primeira sala (a do Delta); se o personagem
 * for de outro mapa, ou depois da travessia, o núcleo manda 'trocar_sala' { mapId } e o cliente sai
 * desta sala e entra com joinOrCreate('mundo', { mapId }). A sala do protótipo (sandbox) só aceita
 * quem pediu por ela (mapId: 'prototipo_delta').
 *
 * Simulação de rede ruim pelo ambiente (ver netsim.ts): PQP_LAG_MS (RTT extra, metade em cada
 * sentido), PQP_LOSS (perda de entradas e snapshots), PQP_LOSS_MODE (travada, o padrão, como no
 * TCP, ou descarte), PQP_STALL_MS, PQP_JITTER_MS (variação, sem embaralhar) e PQP_NET_SEED.
 * hello, welcome, ping, pong, need, info e as mensagens de jogo sofrem o atraso e esperam na mesma
 * fila em ordem do cliente, mas não sorteiam perda.
 */
import { Room, type Client } from 'colyseus';
import { hasMap, START_MAP } from '@pqp/shared/map';
import { CLOSE_CODE, GAME_MSG, MSG, type C2S_Hello, type C2S_Input, type C2S_Need, type C2S_Ping } from '@pqp/shared/net';
import { TICK_MS } from '@pqp/shared/sim';
import { COLYSEUS_RECONNECT_S, MAX_CATCHUP_TICKS } from '../config';
import { GameServerCore, type CoreOptions } from '../core';
import { LinkSim, linkConfigFromEnv, type LinkConfig } from '../netsim';
import type { Store } from '../persistence/store';

/** Opções simples (JSON) passadas ao define da sala (e o mapId de cada sala). */
export interface WorldRoomOptions {
  /** mapa desta sala (padrão: START_MAP, o Delta) */
  mapId?: string;
  seed?: number;
  companions?: boolean;
  /** o Seu Jacó acompanha quem está no Delta (padrão: sim na sala do Delta) */
  jaco?: boolean;
  content?: boolean;
  offlineAutoMs?: number;
  /** sobrepõe as variáveis PQP_LAG_MS/PQP_LOSS/PQP_JITTER_MS */
  link?: Partial<LinkConfig>;
}

/** Mensagens de jogo do cliente (GAME_MSG) que a sala repassa ao núcleo. */
const GAME_IN = [
  GAME_MSG.criarPersonagem,
  GAME_MSG.maquinaVisual,
  GAME_MSG.falar,
  GAME_MSG.dialogoOpcao,
  GAME_MSG.missaoAceitar,
  GAME_MSG.travessia,
  GAME_MSG.tutorialPasso,
] as const;

/** Dependências que não cabem em JSON (Store, log), postas antes do define. */
const deps: { store?: Store; log?: (m: string) => void } = {};
export function setWorldRoomDeps(d: { store?: Store; log?: (m: string) => void }): void {
  if (d.store) deps.store = d.store;
  if (d.log) deps.log = d.log;
}

/** Salas vivas (para o /health e para desligar salvando). */
export const liveRooms = new Set<WorldRoom>();

export class WorldRoom extends Room {
  // SUGESTÃO: até 200 jogadores na sala de cada mapa do piloto.
  override maxClients = 200;
  override autoDispose = false;

  core!: GameServerCore;
  private inLink!: LinkSim;
  private outLink!: LinkSim;
  private acc = 0;
  private bySid = new Map<string, Client>();
  /** quem entrou pedindo esta sala pelo mapId */
  private explicit = new Set<string>();

  override onCreate(options: WorldRoomOptions = {}): void {
    const mapId = typeof options.mapId === 'string' ? options.mapId : START_MAP;
    if (!hasMap(mapId)) throw new Error(`mapa desconhecido: ${mapId}`);
    const coreOpts: CoreOptions = { mapId };
    if (options.seed !== undefined) coreOpts.seed = options.seed;
    if (options.companions !== undefined) coreOpts.companions = options.companions;
    if (options.jaco !== undefined) coreOpts.jaco = options.jaco;
    if (options.content !== undefined) coreOpts.content = options.content;
    if (options.offlineAutoMs !== undefined) coreOpts.offlineAutoMs = options.offlineAutoMs;
    if (deps.store) coreOpts.store = deps.store;
    if (deps.log) coreOpts.log = deps.log;
    this.core = new GameServerCore(coreOpts);
    const link: LinkConfig = { ...linkConfigFromEnv(), ...(options.link ?? {}) };
    this.inLink = new LinkSim(link, 1);
    this.outLink = new LinkSim(link, 2);
    if (this.inLink.active) (deps.log ?? console.log)(`[mundo:${mapId}] rede simulada: RTT +${link.lagMs} ms, perda ${link.loss * 100}% (${this.inLink.mode}), variação ${link.jitterMs} ms`);
    liveRooms.add(this);

    // cada cliente tem a sua fila em ordem nos dois sentidos (chave = sessionId), como uma conexão TCP
    this.onMessage(MSG.hello, (client: Client, msg: C2S_Hello) => {
      this.inLink.run(false, () => void this.handleHello(client, msg), client.sessionId);
    });
    this.onMessage(MSG.input, (client: Client, msg: C2S_Input) => {
      this.inLink.run(true, () => this.core.onInput(client.sessionId, msg), client.sessionId);
    });
    this.onMessage(MSG.ping, (client: Client, msg: C2S_Ping) => {
      this.inLink.run(
        false,
        () => {
          const pong = this.core.pong(msg?.t);
          this.outLink.run(false, () => this.safeSend(client, MSG.pong, pong), client.sessionId);
        },
        client.sessionId,
      );
    });
    this.onMessage(MSG.need, (client: Client, msg: C2S_Need) => {
      this.inLink.run(
        false,
        () => {
          const info = this.core.onNeed(client.sessionId, msg);
          if (info.ents.length > 0) this.outLink.run(false, () => this.safeSend(client, MSG.info, info), client.sessionId);
        },
        client.sessionId,
      );
    });
    for (const type of GAME_IN) {
      this.onMessage(type, (client: Client, msg: unknown) => {
        this.inLink.run(
          false,
          () => {
            this.core.onGameMessage(client.sessionId, type, msg);
            this.drainOutbox();
          },
          client.sessionId,
        );
      });
    }

    // laço de 20 Hz com acumulador: o tempo medido decide quantos ticks fixos rodam. O tempo vem
    // do performance.now() e não do clock da sala, que também anda por outros intervalos.
    this.lastLoopMs = performance.now();
    this.setSimulationInterval(() => {
      const now = performance.now();
      const dt = now - this.lastLoopMs;
      this.lastLoopMs = now;
      this.loop(dt);
    }, TICK_MS);
    this.patchRate = null; // sem estado sincronizado (depois do laço, para não criar outro intervalo)
  }

  private lastLoopMs = 0;

  private async handleHello(client: Client, msg: C2S_Hello): Promise<void> {
    try {
      const wel = await this.core.join(client.sessionId, msg ?? ({} as C2S_Hello), { explicit: this.explicit.has(client.sessionId) });
      if (!this.bySid.has(client.sessionId)) {
        // saiu enquanto o Store carregava
        this.core.removeClient(client.sessionId);
        return;
      }
      for (const sid of this.core.takeKicked()) {
        const old = this.bySid.get(sid);
        if (old && old !== client) old.leave(CLOSE_CODE.outroAparelho, 'entrou em outro aparelho');
      }
      if (wel) this.outLink.run(false, () => this.safeSend(client, MSG.welcome, wel), client.sessionId);
      this.drainOutbox();
    } catch (err) {
      (deps.log ?? console.error)(`[mundo] hello falhou: ${String(err)}`);
    }
  }

  /** Manda as mensagens que o núcleo deixou na caixa (perfil, missões, avisos, welcome tardio, trocar_sala). */
  private drainOutbox(): void {
    for (const o of this.core.takeOutbox()) {
      const c = this.bySid.get(o.sid);
      if (c) this.outLink.run(false, () => this.safeSend(c, o.type, o.msg), o.sid);
    }
  }

  private loop(dt: number): void {
    this.acc += Number.isFinite(dt) ? dt : TICK_MS;
    let n = 0;
    while (this.acc >= TICK_MS && n < MAX_CATCHUP_TICKS) {
      this.acc -= TICK_MS;
      n++;
      this.tickOnce();
    }
    if (this.acc > TICK_MS * MAX_CATCHUP_TICKS) this.acc = 0; // engasgou: descarta o atraso
  }

  private tickOnce(): void {
    let snaps;
    try {
      snaps = this.core.tick();
    } catch (err) {
      (deps.log ?? console.error)(`[mundo] tick falhou: ${err instanceof Error ? err.stack : String(err)}`);
      return;
    }
    // as mensagens de jogo do tick saem antes do snapshot (o welcome tardio precisa chegar primeiro)
    this.drainOutbox();
    for (const [sid, snap] of snaps) {
      const c = this.bySid.get(sid);
      if (c) this.outLink.run(true, () => this.safeSend(c, MSG.snap, snap), sid);
    }
    for (const sid of this.core.takeKicked()) {
      const c = this.bySid.get(sid);
      if (c) c.leave(CLOSE_CODE.tempoEsgotado, 'tempo esgotado');
    }
  }

  private safeSend(client: Client, type: string, msg: unknown): void {
    try {
      client.send(type, msg);
    } catch {
      // conexão fechando: o snapshot seguinte resolve
    }
  }

  override onJoin(client: Client, options?: { mapId?: unknown }): void {
    this.bySid.set(client.sessionId, client);
    if (options && options.mapId === this.core.mapId) this.explicit.add(client.sessionId);
  }

  override onDrop(client: Client, code?: number): void {
    // derrubado pelo próprio servidor (outro aparelho, tempo esgotado) ou sessão que o núcleo já
    // soltou: sem reserva de reconexão (o Colyseus chama onLeave logo em seguida)
    if (code === CLOSE_CODE.outroAparelho || code === CLOSE_CODE.tempoEsgotado || !this.core.hasSession(client.sessionId)) return;
    this.core.dropClient(client.sessionId);
    // sem reconexão no prazo, o Colyseus chama onLeave
    this.allowReconnection(client, COLYSEUS_RECONNECT_S).catch(() => undefined);
  }

  override onReconnect(client: Client): void {
    this.bySid.set(client.sessionId, client);
    this.core.resumeClient(client.sessionId);
  }

  override onLeave(client: Client): void {
    this.bySid.delete(client.sessionId);
    this.explicit.delete(client.sessionId);
    this.core.removeClient(client.sessionId);
    this.inLink.forget(client.sessionId);
    this.outLink.forget(client.sessionId);
  }

  override async onDispose(): Promise<void> {
    liveRooms.delete(this);
    this.inLink.dispose();
    this.outLink.dispose();
    await this.core.saveAll().catch(() => undefined);
  }
}
