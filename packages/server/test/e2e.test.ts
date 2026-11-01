/**
 * Ponta a ponta no vitest: express + Colyseus de verdade numa porta aleatória, com 200 ms de RTT e
 * 2% de perda simulados na sala, e um robô com @colyseus/sdk que faz o que o cliente faz
 * (bot/e2e.ts). Confere snapshots a ~20/s, auto-caminho até um bando e um inimigo morto com os botões.
 *
 * O passo do chefe (ir até a arena e ver o aviso no chão) leva cerca de 1 minuto e fica no
 * `npm run e2e`, que também sobe o servidor em outro processo.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, type Running } from '../src/app';
import { runE2E } from '../src/bot/e2e';
import { MemoryStore } from '../src/persistence/store';

let srv: Running;

beforeAll(async () => {
  srv = await startServer({
    port: 0,
    host: '127.0.0.1',
    store: new MemoryStore(),
    serveClient: false,
    log: () => undefined,
    room: { link: { lagMs: 200, loss: 0.02, jitterMs: 0, seed: 7 } },
  });
});

afterAll(async () => {
  await srv?.close();
});

describe('ponta a ponta com 200 ms e 2% de perda', () => {
  it('snapshots a ~20/s, anda até um bando e mata um inimigo com os botões', async () => {
    const lines: string[] = [];
    const rep = await runE2E({ url: `http://127.0.0.1:${srv.port}`, skipBoss: true, stepTimeoutMs: 30_000, log: (m) => lines.push(m) });
    if (!rep.ok) console.log(lines.join('\n'));
    expect(rep.steps.map((s) => s.name)).toEqual(['criar personagem', 'entrar','snapshots ~20/s', 'andar até um bando', 'matar um inimigo com os botões']);
    for (const s of rep.steps) expect(s.ok, `${s.name}: ${s.info}`).toBe(true);
    expect(rep.snapsPerS).toBeGreaterThan(16);
    expect(rep.snapsPerS).toBeLessThanOrEqual(21);
    expect(rep.inputsPerS).toBeGreaterThan(18);
    expect(rep.rttMs).toBeGreaterThanOrEqual(150);
    expect(rep.ok).toBe(true);
  }, 90_000);
});
