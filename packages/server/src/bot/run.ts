/**
 * Teste de carga leve: conecta N robôs a um servidor rodando e mostra snapshots por segundo,
 * tamanho médio e RTT.
 *
 *   npm run bot -w @pqp/server -- 8 ws://localhost:2567 60
 *   (robôs, endereço, segundos; padrão 4, ws://localhost:2567, 30)
 *
 * Cada robô anda à toa pelo cais e luta com o alvo automático quando aparece inimigo.
 * Usa @colyseus/sdk (instalado para o cliente) e o WebSocket nativo do Node 24.
 */
import { Client, type Room } from '@colyseus/sdk';
import { MSG, type S2C_Info, type S2C_Pong, type S2C_Snapshot, type S2C_Welcome } from '@pqp/shared/net';
import { createRng } from '@pqp/shared/sim';
import { fightBrain, RobotClient } from './robot';

const n = Math.max(1, Number(process.argv[2] ?? 4) | 0);
const url = process.argv[3] ?? 'ws://localhost:2567';
const seconds = Math.max(5, Number(process.argv[4] ?? 30) | 0);

interface BotStats {
  snaps: number;
  bytes: number;
  rtt: number;
}

async function runBot(i: number, stats: BotStats): Promise<() => Promise<void>> {
  const client = new Client(url);
  // robôs de carga lutam na sala do protótipo (sandbox: template com os botões, sem cadastro)
  const room: Room = await client.joinOrCreate('mundo', { mapId: 'prototipo_delta' });
  const r = new RobotClient(`robo-carga-${String(i).padStart(4, '0')}`, `Robô ${i + 1}`, i % 2 === 0 ? 'peao_brabo' : 'idol');
  const rng = createRng(1000 + i);
  const fight = fightBrain();
  let wanderUntil = 0;
  room.onMessage(MSG.welcome, (w: S2C_Welcome) => r.onWelcome(w));
  room.onMessage(MSG.snap, (s: S2C_Snapshot) => {
    stats.snaps++;
    stats.bytes += JSON.stringify(s).length;
    const need = r.onSnapshot(s);
    if (need.length > 0) room.send(MSG.need, { ids: need });
  });
  room.onMessage(MSG.info, (info: S2C_Info) => r.onInfo(info));
  room.onMessage(MSG.pong, (p: S2C_Pong) => {
    r.rtt = performance.now() - p.t;
    stats.rtt = r.rtt;
  });
  room.send(MSG.hello, r.hello());
  const tick = setInterval(() => {
    if (r.you === undefined) return;
    if (r.hud?.target !== undefined) fight(r);
    else if (r.lastTick >= wanderUntil) {
      const a = rng.next() * Math.PI * 2;
      r.setStick(Math.cos(a) * 0.8, Math.sin(a) * 0.8);
      wanderUntil = r.lastTick + rng.int(10, 40);
    }
    room.send(MSG.input, r.makeInput());
  }, 50);
  const ping = setInterval(() => room.send(MSG.ping, { t: performance.now() }), 2000);
  return async () => {
    clearInterval(tick);
    clearInterval(ping);
    await room.leave(true).catch(() => undefined);
  };
}

const all: BotStats[] = [];
const stops: (() => Promise<void>)[] = [];
for (let i = 0; i < n; i++) {
  const st: BotStats = { snaps: 0, bytes: 0, rtt: 0 };
  all.push(st);
  try {
    stops.push(await runBot(i, st));
  } catch (err) {
    console.error(`robô ${i + 1} não entrou: ${String(err)}`);
  }
}
console.log(`${stops.length} robôs em ${url} por ${seconds} s`);
let last = { snaps: 0, bytes: 0 };
const report = setInterval(() => {
  const snaps = all.reduce((a, s) => a + s.snaps, 0);
  const bytes = all.reduce((a, s) => a + s.bytes, 0);
  const ds = snaps - last.snaps, db = bytes - last.bytes;
  const rtt = all.filter((s) => s.rtt > 0);
  console.log(
    `snapshots/s por robô: ${(ds / 5 / Math.max(1, stops.length)).toFixed(1)}  ` +
      `tamanho médio: ${ds > 0 ? Math.round(db / ds) : 0} B (JSON)  ` +
      `RTT médio: ${rtt.length ? Math.round(rtt.reduce((a, s) => a + s.rtt, 0) / rtt.length) : '-'} ms`,
  );
  last = { snaps, bytes };
}, 5000);
setTimeout(async () => {
  clearInterval(report);
  for (const s of stops) await s();
  process.exit(0);
}, seconds * 1000);
