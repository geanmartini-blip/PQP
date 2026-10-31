/**
 * npm run e2e: teste ponta a ponta com o servidor em OUTRO processo, como em produção.
 *
 * 1. acha uma porta livre e sobe `node --import tsx src/index.ts` (um processo só, fácil de
 *    encerrar no Windows) com PQP_LAG_MS=200, PQP_LOSS=0.02 e o players.json numa pasta temporária;
 * 2. espera o /health responder;
 * 3. roda o cenário de bot/e2e.ts (robô com @colyseus/sdk);
 * 4. encerra o servidor (sempre, mesmo com erro) e sai com código 0 se tudo passou.
 *
 * Ambiente: PQP_LAG_MS, PQP_LOSS e PQP_JITTER_MS sobrepõem os padrões; PQP_E2E_SKIP_BOSS=1 pula o
 * chefe; PQP_E2E_URL=http://host:porta usa um servidor que já está rodando (não sobe nem encerra).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runE2E } from './e2e';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

async function waitHealth(url: string, ms: number, child?: ChildProcess): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (child && child.exitCode !== null) return false;
    try {
      const r = await fetch(`${url}/health`);
      if (r.ok) return true;
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function main(): Promise<number> {
  const env = process.env;
  let url = env['PQP_E2E_URL'];
  let child: ChildProcess | undefined;
  let dataDir: string | undefined;
  const lag = env['PQP_LAG_MS'] ?? '200';
  const loss = env['PQP_LOSS'] ?? '0.02';

  const stop = () => {
    if (child && child.exitCode === null && !child.killed) child.kill();
  };
  process.on('exit', stop);
  process.on('SIGINT', () => {
    stop();
    process.exit(130);
  });

  try {
    if (!url) {
      const port = await freePort();
      dataDir = mkdtempSync(path.join(os.tmpdir(), 'pqp-e2e-'));
      url = `http://127.0.0.1:${port}`;
      console.log(`[e2e] subindo o servidor na porta ${port} (lag ${lag} ms, perda ${loss})`);
      child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
        cwd: serverDir,
        env: { ...env, PORT: String(port), HOST: '127.0.0.1', PQP_LAG_MS: lag, PQP_LOSS: loss, PQP_DATA_DIR: dataDir, NO_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      const pre = (s: string) => s.split(/\r?\n/).filter(Boolean).map((l) => `[server] ${l}`).join('\n');
      child.stdout?.setEncoding('utf8').on('data', (d: string) => console.log(pre(d)));
      child.stderr?.setEncoding('utf8').on('data', (d: string) => console.error(pre(d)));
      if (!(await waitHealth(url, 30_000, child))) {
        console.error('[e2e] o servidor não respondeu /health em 30 s');
        return 1;
      }
    }
    const rep = await runE2E({ url, log: (m) => console.log(`[e2e] ${m}`), skipBoss: env['PQP_E2E_SKIP_BOSS'] === '1' });
    console.log('');
    console.log(
      `[e2e] ${rep.ok ? 'PASSOU' : 'FALHOU'} em ${(rep.durationMs / 1000).toFixed(1)} s: ${rep.snapsPerS} snapshots/s (${rep.snapsReceived} no total, ` +
        `maior intervalo ${rep.maxGapMs} ms), ${rep.inputsPerS} entradas/s, RTT ${rep.rttMs} ms`,
    );
    return rep.ok ? 0 : 1;
  } catch (err) {
    console.error(`[e2e] erro: ${err instanceof Error ? err.stack : String(err)}`);
    return 1;
  } finally {
    if (child && child.exitCode === null) {
      const exited = new Promise<void>((r) => child!.once('exit', () => r()));
      child.kill();
      await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
      console.log(`[e2e] servidor encerrado (pid ${child.pid}, saiu: ${child.exitCode !== null || child.signalCode !== null})`);
    }
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  }
}

process.exitCode = await main();
// o SDK pode deixar timers de reconexão: sai de vez
setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref();
