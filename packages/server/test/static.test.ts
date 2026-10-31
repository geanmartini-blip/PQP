/** O servidor serve o build do cliente (packages/client/dist) com volta para index.html. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, type Running } from '../src/app';
import { MemoryStore } from '../src/persistence/store';

const dist = mkdtempSync(path.join(os.tmpdir(), 'pqp-dist-'));
let srv: Running;

beforeAll(async () => {
  mkdirSync(path.join(dist, 'assets'), { recursive: true });
  writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Ponte que Partiu</title>');
  writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log(1)');
  srv = await startServer({ port: 0, host: '127.0.0.1', store: new MemoryStore(), clientDist: dist, log: () => undefined, room: { content: false } });
});

afterAll(async () => {
  await srv?.close();
  rmSync(dist, { recursive: true, force: true });
});

describe('estático do cliente', () => {
  it('serve index.html, os assets e volta para o index em rota desconhecida', async () => {
    const base = `http://127.0.0.1:${srv.port}`;
    const root = await fetch(`${base}/`);
    expect(root.status).toBe(200);
    expect(await root.text()).toContain('Ponte que Partiu');
    const js = await fetch(`${base}/assets/app.js`);
    expect(await js.text()).toBe('console.log(1)');
    const spa = await fetch(`${base}/qualquer/coisa`);
    expect(await spa.text()).toContain('<title>Ponte que Partiu</title>');
    const health = await fetch(`${base}/health`);
    const body = (await health.json()) as { ok: boolean; rooms: { players: number }[] };
    expect(body.ok).toBe(true);
    expect(body.rooms.length).toBe(1); // a sala do mapa existe desde o início
  });
});
