/**
 * WorldRoom: adaptador Colyseus 0.18 do GameServerCore. Sala 'mundo', 20 ticks por segundo, sem
 * estado sincronizado do Colyseus: tudo vai em mensagens (MSG) montadas pelo núcleo.
 *
 * Simulação de rede ruim pelo ambiente (ver netsim.ts): PQP_LAG_MS (RTT extra, metade em cada
 * sentido), PQP_LOSS (perda de entradas e snapshots), PQP_JITTER_MS (variação) e PQP_NET_SEED.
 * hello, welcome, ping, pong, need e info sofrem o atraso mas não a perda (o protocolo já trata a
 * perda das mensagens de tick; as de controle viajam no WebSocket, que não perde).
 */
import { Room, type Client } from 'colyseus';
import { CLOSE_CODE, MSG, type C2S_Hello, type C2S_Input, type C2S_Need, type C2S_Ping } from '@pqp/shared/net';
import { TICK_MS } from '@pqp/shared/sim';
import { COLYSEUS_RECONNECT_S, MAX_CATCHUP_TICKS } from '../config';
import { GameServerCore, type CoreOptions } from '../core';
import { LinkSim, linkConfigFromEnv, type LinkConfig } from '../netsim';
import type { Store } from '../persistence/store';

/** Opções simples (JSON) passadas ao define da sala. */
export interface WorldRoomOptions {
  seed?: number;
  companions?: boolean;
  content?: boolean;
  offlineAutoMs?: number;
  /** sobrepõe as variáveis PQP_LAG_MS/PQP_LOSS/PQP_JITTER_MS */
  link?: Partial<LinkConfig>;
}

/** Dependências que não cabem em JSON (Store, log), postas antes do define. */
const deps: { store?: Store; log?: (m: string) => void } = {};
export function setWorldRoomDeps(d: { store?: Store; log?: (m: string) => void }): void {
  if (d.store) deps.store = d.store;
  if (d.log) deps.log = d.log;
}

/** Salas vivas (para o /health e para desligar salvando). */
export const liveRooms = new Set<WorldRoom>();

export class WorldRoom extends Room {
  // SUGESTÃO: até 200 jogadores na sala do mapa aberto do piloto.
  override maxClients = 200;
  override autoDispose = false;

  core!: GameServerCore;
  private inLink!: LinkSim;
  private outLink!: LinkSim;
  private acc = 0;
  private bySid = new Map<string, Client>();

  override onCreate(options: WorldRoomOptions = {}): void {
    const coreOpts: CoreOptions = {};
    if (options.seed !== undefined) coreOpts.seed = options.seed;
    if (options.companions !== undefined) coreOpts.companions = options.companions;
    if (options.content !== undefined) coreOpts.content = options.content;
    if (options.offlineAutoMs !== undefined) coreOpts.offlineAutoMs = options.offlineAutoMs;
    if (deps.store) coreOpts.store = deps.store;
    if (deps.log) coreOpts.log = deps.log;
    this.core = new GameServerCore(coreOpts);
    const link: LinkConfig = { ...linkConfigFromEnv(), ...(options.link ?? {}) };
    this.inLink = new LinkSim(link, 1);
    this.outLink = new LinkSim(link, 2);
    if (this.inLink.active) (deps.log ?? console.log)(`[mundo] rede simulada: RTT +${link.lagMs} ms, perda ${link.loss * 100}%, variação ${link.jitterMs} ms`);
    liveRooms.add(this);

    this.onMessage(MSG.hello, (client: Client, msg: C2S_Hello) => {
      this.inLink.run(false, () => void this.handleHello(client, msg));
    });
    this.onMessage(MSG.input, (client: Client, msg: C2S_Input) => {
      this.inLink.run(true, () => this.core.onInput(client.sessionId, msg));
    });
    this.onMessage(MSG.ping, (client: Client, msg: C2S_Ping) => {
      this.inLink.run(false, () => {
        const pong = this.core.pong(msg?.t);
        this.outLink.run(false, () => this.safeSend(client, MSG.pong, pong));
      });
    });
    this.onMessage(MSG.need, (client: Client, msg: C2S_Need) => {
      this.inLink.run(false, () => {
        const info = this.core.onNeed(client.sessionId, msg);
        if (info.ents.length > 0) this.outLink.run(false, () => this.safeSend(client, MSG.info, info));
      });
    });

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
      const wel = await this.core.join(client.sessionId, msg ?? ({} as C2S_Hello));
      if (!this.bySid.has(client.sessionId)) {
        // saiu enquanto o Store carregava
        this.core.removeClient(client.sessionId);
        return;
      }
      for (const sid of this.core.takeKicked()) {
        const old = this.bySid.get(sid);
        if (old && old !== client) old.leave(CLOSE_CODE.outroAparelho, 'entrou em outro aparelho');
      }
      this.outLink.run(false, () => this.safeSend(client, MSG.welcome, wel));
    } catch (err) {
      (deps.log ?? console.error)(`[mundo] hello falhou: ${String(err)}`);
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
    for (const [sid, snap] of snaps) {
      const c = this.bySid.get(sid);
      if (c) this.outLink.run(true, () => this.safeSend(c, MSG.snap, snap));
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

  override onJoin(client: Client): void {
    this.bySid.set(client.sessionId, client);
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
    this.core.removeClient(client.sessionId);
  }

  override async onDispose(): Promise<void> {
    liveRooms.delete(this);
    this.inLink.dispose();
    this.outLink.dispose();
    await this.core.saveAll().catch(() => undefined);
  }
}
