import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createStore, FileStore, MemoryStore, SupabaseStore } from '../src/persistence/store';
import { LinkSim, linkConfigFromEnv, MemoryChannel } from '../src/netsim';

const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'pqp-store-'));
afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

describe('FileStore', () => {
  it('cria, grava com debounce e lê de volta numa instância nova; sem sobrar temporário', async () => {
    const file = path.join(tmpRoot, 'a', 'players.json');
    const s1 = new FileStore(file, 20);
    const rec = await s1.getOrCreatePlayer('tok-arquivo-001', 'Zé do Caixote');
    expect(rec.name).toBe('Zé do Caixote');
    expect(rec.id).toMatch(/[0-9a-f-]{36}/);
    rec.data.level = 14;
    rec.data.semente = 7;
    await s1.savePlayer(rec);
    await s1.savePlayer({ ...rec, data: { ...rec.data, semente: 9 } });
    await s1.flush();
    expect(s1.writes).toBe(1); // duas gravações seguidas viram uma
    const s2 = new FileStore(file, 20);
    const back = await s2.getOrCreatePlayer('tok-arquivo-001');
    expect(back.id).toBe(rec.id);
    expect(back.data.level).toBe(14);
    expect(back.data.semente).toBe(9);
    expect(readdirSync(path.dirname(file)).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(1);
  });

  it('arquivo corrompido não derruba o servidor e ganha uma cópia', async () => {
    const dir = path.join(tmpRoot, 'b');
    const file = path.join(dir, 'players.json');
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, '{ isto não é json');
    const s = new FileStore(file, 10);
    const r = await s.getOrCreatePlayer('tok-corrompido-1');
    expect(r.token).toBe('tok-corrompido-1');
    expect(readdirSync(dir).some((f) => f.includes('corrompido'))).toBe(true);
  });

  it('createStore escolhe Supabase só com as duas chaves', () => {
    expect(createStore({})).toBeInstanceOf(FileStore);
    expect(createStore({ SUPABASE_URL: 'https://x.supabase.co' })).toBeInstanceOf(FileStore);
    expect(createStore({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'chave-de-teste' })).toBeInstanceOf(SupabaseStore);
  });

  it('MemoryStore devolve cópias (quem chama não mexe no guardado)', async () => {
    const m = new MemoryStore();
    const r = await m.getOrCreatePlayer('tok-memoria-01');
    r.data.level = 99;
    expect((await m.getOrCreatePlayer('tok-memoria-01')).data.level).toBeUndefined();
  });
});

describe('rede simulada', () => {
  it('MemoryChannel (TCP): nada se perde, nada sai de ordem, a perda vira travada seguida de rajada', () => {
    const run = (seed: number, jitterMs = 0) => {
      const ch = new MemoryChannel<number>({ delayMs: 100, loss: 0.02, jitterMs, seed });
      const got: { m: number; t: number }[] = [];
      for (let t = 0; t < 5000; t++) {
        ch.send(t, t * 50);
        for (const m of ch.receive(t * 50)) got.push({ m, t: t * 50 });
      }
      for (const m of ch.receive(1e9)) got.push({ m, t: 1e9 });
      return { got, ch };
    };
    const a = run(5), b = run(5);
    expect(a.got).toEqual(b.got);
    expect(a.got.map((x) => x.m)).toEqual(Array.from({ length: 5000 }, (_, i) => i));
    const stallRate = a.ch.stalled / 5000;
    expect(stallRate).toBeGreaterThan(0.01);
    expect(stallRate).toBeLessThan(0.03);
    // rajada: depois de uma travada, várias mensagens chegam no mesmo instante
    const perInstant = new Map<number, number>();
    for (const x of a.got) perInstant.set(x.t, (perInstant.get(x.t) ?? 0) + 1);
    expect(Math.max(...perInstant.values())).toBeGreaterThanOrEqual(5);
    // com variação, a ordem continua
    expect(run(6, 60).got.map((x) => x.m)).toEqual(Array.from({ length: 5000 }, (_, i) => i));
  });

  it('MemoryChannel no modo descarte: atraso fixo, perda perto da pedida e determinística pela semente', () => {
    const run = (seed: number) => {
      const ch = new MemoryChannel<number>({ delayMs: 100, loss: 0.02, lossMode: 'descarte', seed });
      const got: number[] = [];
      for (let t = 0; t < 5000; t++) {
        ch.send(t, t * 50);
        for (const m of ch.receive(t * 50)) got.push(m);
      }
      for (const m of ch.receive(1e9)) got.push(m);
      return got;
    };
    const a = run(5), b = run(5);
    expect(a).toEqual(b);
    const lossRate = 1 - a.length / 5000;
    expect(lossRate).toBeGreaterThan(0.01);
    expect(lossRate).toBeLessThan(0.03);
    const ch = new MemoryChannel<string>({ delayMs: 100, seed: 1 });
    ch.send('oi', 0);
    expect(ch.receive(99)).toEqual([]);
    expect(ch.receive(100)).toEqual(['oi']);
  });

  it('LinkSim lê PQP_LAG_MS, PQP_LOSS e PQP_JITTER_MS e aplica metade do RTT por sentido', () => {
    const cfg = linkConfigFromEnv({ PQP_LAG_MS: '200', PQP_LOSS: '0.5', PQP_JITTER_MS: '0', PQP_NET_SEED: '3' });
    expect(cfg).toEqual({ lagMs: 200, loss: 0.5, jitterMs: 0, seed: 3 });
    // padrão (TCP): a perda vira travada de 250 ms, nunca descarte
    const l = new LinkSim(cfg);
    expect(l.mode).toBe('travada');
    let stalled = 0;
    for (let i = 0; i < 1000; i++) {
      const d = l.plan(true);
      expect(d).not.toBeNull();
      if (d === 350) stalled++;
      else expect(d).toBe(100);
    }
    expect(stalled).toBeGreaterThan(400);
    expect(stalled).toBeLessThan(600);
    for (let i = 0; i < 100; i++) expect(l.plan(false)).toBe(100); // mensagens de controle não sorteiam perda
    // descarte (opção)
    const ld = new LinkSim(linkConfigFromEnv({ PQP_LAG_MS: '200', PQP_LOSS: '0.5', PQP_LOSS_MODE: 'descarte', PQP_STALL_MS: '300' }));
    expect(ld.cfg.stallMs).toBe(300);
    let lost = 0;
    for (let i = 0; i < 1000; i++) {
      const d = ld.plan(true);
      if (d === null) lost++;
      else expect(d).toBe(100);
    }
    expect(lost).toBeGreaterThan(400);
    expect(lost).toBeLessThan(600);
    expect(new LinkSim(linkConfigFromEnv({})).active).toBe(false);
  });

  it('LinkSim entrega em ordem por cliente: a travada segura as seguintes e solta em rajada', () => {
    vi.useFakeTimers();
    try {
      const l = new LinkSim({ lagMs: 200, loss: 0.3, jitterMs: 80, seed: 9 }, 0, () => Date.now());
      const got: Record<string, number[]> = { a: [], b: [] };
      for (let i = 0; i < 200; i++) {
        l.run(true, () => got['a']!.push(i), 'a');
        l.run(true, () => got['b']!.push(i), 'b');
        vi.advanceTimersByTime(50);
      }
      vi.advanceTimersByTime(5000);
      expect(got['a']).toEqual(Array.from({ length: 200 }, (_, i) => i));
      expect(got['b']).toEqual(Array.from({ length: 200 }, (_, i) => i));
      expect(l.stalled).toBeGreaterThan(0);
      expect(l.dropped).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
