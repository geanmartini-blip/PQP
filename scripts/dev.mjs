#!/usr/bin/env node
/**
 * npm run dev: sobe o servidor de jogo (tsx watch, porta 2567) e o Vite (porta 5173) juntos, com
 * os logs prefixados por [server] e [client]. Ctrl+C encerra os dois.
 *
 * Rede ruim simulada no servidor (repassada pelo ambiente):
 *   PQP_LAG_MS, PQP_LOSS, PQP_JITTER_MS, PQP_NET_SEED
 * ou pelos atalhos:  npm run dev -- --lag 200 --loss 0.02 [--jitter 20]
 * Outras opções:     --companheiro (PQP_COMPANHEIRO=1), --port 2567 (PORT do servidor)
 *
 * Windows: roda o node direto nos CLIs do tsx e do Vite (sem shell), para que encerrar mate o
 * processo certo; no fim, taskkill /T /F derruba o que sobrar da árvore (o tsx watch tem um filho).
 * Se os CLIs não forem achados em node_modules, cai para npm/npm.cmd com shell.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';

// ---------------------------------------------------------------------------
// opções

// cores mesmo com a saída em pipe, só se o terminal for de verdade e ninguém pediu NO_COLOR
const env = { ...process.env };
if (process.stdout.isTTY && !env.NO_COLOR && env.FORCE_COLOR === undefined) env.FORCE_COLOR = '1';
// no dev o jogo vem do Vite; o servidor não serve um packages/client/dist velho
env.PQP_SERVE_CLIENT ??= '0';
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const val = () => argv[++i];
  if (a === '--lag') env.PQP_LAG_MS = val();
  else if (a === '--loss') env.PQP_LOSS = val();
  else if (a === '--jitter') env.PQP_JITTER_MS = val();
  else if (a === '--port') env.PORT = val();
  else if (a === '--companheiro') env.PQP_COMPANHEIRO = '1';
  else if (a === '--help' || a === '-h') {
    console.log('uso: npm run dev [-- --lag 200 --loss 0.02 --jitter 20 --companheiro --port 2567]');
    process.exit(0);
  } else console.warn(`[dev] opção ignorada: ${a}`);
}

// ---------------------------------------------------------------------------
// processos

const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const npmCmd = isWin ? 'npm.cmd' : 'npm';

/** Comando de cada processo: node direto no CLI, ou npm como plano B. */
const procs = [
  {
    name: 'server',
    color: '\x1b[36m',
    cwd: path.join(root, 'packages', 'server'),
    direct: existsSync(tsxCli) ? [process.execPath, [tsxCli, 'watch', 'src/index.ts']] : undefined,
    fallback: [npmCmd, ['run', 'dev', '-w', '@pqp/server']],
  },
  {
    name: 'client',
    color: '\x1b[35m',
    cwd: path.join(root, 'packages', 'client'),
    direct: existsSync(viteCli) ? [process.execPath, [viteCli, '--host', '0.0.0.0']] : undefined,
    fallback: [npmCmd, ['run', 'dev', '-w', '@pqp/client']],
  },
];

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const prefix = (p) => (useColor ? `${p.color}[${p.name}]\x1b[0m ` : `[${p.name}] `);

/** Repassa a saída linha a linha com o prefixo (guarda o pedaço de linha incompleto). */
function pipeLines(stream, out, pre) {
  let buf = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buf += chunk;
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? '';
    for (const l of lines) out.write(pre + l + '\n');
  });
  stream.on('end', () => {
    if (buf) out.write(pre + buf + '\n');
    buf = '';
  });
}

let shuttingDown = false;
const children = [];

function start(p) {
  const [cmd, args] = p.direct ?? p.fallback;
  const shell = !p.direct; // npm.cmd precisa de shell no Windows
  const child = spawn(cmd, args, { cwd: p.direct ? p.cwd : root, env, stdio: ['ignore', 'pipe', 'pipe'], shell, windowsHide: true });
  child.pqpName = p.name;
  pipeLines(child.stdout, process.stdout, prefix(p));
  pipeLines(child.stderr, process.stderr, prefix(p));
  child.on('error', (err) => {
    process.stderr.write(`${prefix(p)}não consegui iniciar: ${err.message}\n`);
    shutdown(1);
  });
  child.on('exit', (code, signal) => {
    child.exited = true;
    if (shuttingDown) return;
    process.stderr.write(`${prefix(p)}saiu (${signal ?? code}); encerrando o outro também\n`);
    shutdown(code ?? 1);
  });
  children.push(child);
}

/** Mata a árvore do processo (Windows: taskkill /T /F; outros: SIGTERM no filho). */
function killTree(child) {
  if (child.exited || child.pid === undefined) return;
  if (isWin) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else child.kill('SIGTERM');
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('[dev] encerrando servidor e cliente...');
  // No console, o Ctrl+C já chegou aos filhos (mesmo grupo): o servidor salva e sai sozinho.
  // Fora do console, ou se demorarem, derruba a árvore.
  if (!isWin) for (const c of children) if (!c.exited) c.kill('SIGINT');
  const deadline = Date.now() + 4000;
  const wait = setInterval(() => {
    const alive = children.filter((c) => !c.exited);
    if (alive.length === 0 || Date.now() > deadline) {
      clearInterval(wait);
      for (const c of alive) killTree(c);
      process.exit(code);
    }
  }, 100);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('SIGHUP', () => shutdown(0));

const lag = env.PQP_LAG_MS, loss = env.PQP_LOSS;
console.log(`[dev] servidor de jogo e Vite${lag || loss ? ` (rede simulada no servidor: lag ${lag ?? 0} ms, perda ${loss ?? 0})` : ''}`);
console.log('[dev] no PC: http://localhost:5173   no celular: http://<IP do PC>:5173   Ctrl+C encerra');
for (const p of procs) start(p);

// autoteste: PQP_DEV_EXIT_AFTER_MS=15000 encerra sozinho (mesmo caminho do Ctrl+C)
const exitAfter = Number(process.env.PQP_DEV_EXIT_AFTER_MS);
if (Number.isFinite(exitAfter) && exitAfter > 0) setTimeout(() => shutdown(0), exitAfter);
