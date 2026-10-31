/**
 * O cliente compilado roda no navegador do celular: nada do que ele importa (client/src e
 * shared/src, que inclui a simulação, o mapa e o carregador de dados) pode usar módulo do Node.
 * Lê o código-fonte como texto pelo import.meta.glob do Vite (sem fs, que não existe aqui).
 */
import { describe, expect, it } from 'vitest';
import { getData } from '@pqp/shared';
import { getMap } from '@pqp/shared/map';
import { createWorld, spawnPlayer, step } from '@pqp/shared/sim';

const shared = import.meta.glob('../../shared/src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const client = import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const NODE_BUILTINS = ['fs', 'path', 'os', 'crypto', 'url', 'child_process', 'net', 'http', 'https', 'stream', 'buffer', 'util', 'worker_threads', 'module'];
const importRe = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

function nodeImports(files: Record<string, string>): string[] {
  const bad: string[] = [];
  for (const [file, src] of Object.entries(files)) {
    for (const m of src.matchAll(importRe)) {
      const spec = m[1]!;
      if (spec.startsWith('node:') || NODE_BUILTINS.includes(spec) || NODE_BUILTINS.some((b) => spec.startsWith(b + '/'))) bad.push(`${file}: ${spec}`);
    }
  }
  return bad;
}

describe('cliente sem módulo do Node', () => {
  it('shared/src e client/src não importam fs, path, node:* etc.', () => {
    expect(Object.keys(shared).length).toBeGreaterThan(50);
    expect(Object.keys(client).length).toBeGreaterThan(20);
    expect(nodeImports(shared)).toEqual([]);
    expect(nodeImports(client)).toEqual([]);
  });

  it('o carregador de dados não usa fs (os JSON entram por import estático)', () => {
    const loader = Object.entries(shared).find(([f]) => f.endsWith('/data/index.ts'))?.[1] ?? '';
    expect(loader).toContain("from '../../data/");
    expect(loader).not.toMatch(/readFile|readdir|existsSync|process\.cwd|__dirname/);
  });

  it('dados, mapa e simulação carregam e rodam pelo caminho do cliente', () => {
    const D = getData();
    expect(D.archetypesById.has('peao_brabo')).toBe(true);
    const w = createWorld(getMap('prototipo_delta'), 1);
    const p = spawnPlayer(w, { name: 'Teste', archetypeId: 'idol', x: 27.5, y: 72.5 });
    step(w);
    expect(w.entities.get(p.id)?.hp).toBeGreaterThan(0);
  });
});
