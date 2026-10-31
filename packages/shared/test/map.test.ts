import { describe, expect, it } from 'vitest';
import { enemyById, getData, npcById, placeById, trainerById } from '../src/data';
import { circleFree, hasLineOfSight, infoAt, isOpaqueTile, isSolidTile, makeMap, setTile, tileAt } from '../src/map/grid';
import { buildAsciiMap } from '../src/map/maps/ascii';
import { findPath, pathLength, type PathStats } from '../src/map/path';
import { buildMap, getMap, hasMap, listMaps } from '../src/map/registry';
import { Tile, type MapMarker, type TileMap } from '../src/map/types';
import type { Vec } from '../src/sim/types';
import { createRng } from '../src/sim/rng';

const R = 0.35;

/** Confere que o caminho inteiro é andável para o círculo, por amostragem fina. */
function pathIsWalkable(map: TileMap, from: Vec, path: Vec[], r = R): boolean {
  let a = from;
  for (const b of path) {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.05));
    for (let i = 1; i <= n; i++) {
      const x = a.x + ((b.x - a.x) * i) / n, y = a.y + ((b.y - a.y) * i) / n;
      // tolerância pequena: a suavização amostra a cada 0,2 tile
      if (!circleFree(map, x, y, r - 0.03)) return false;
    }
    a = b;
  }
  return true;
}

/**
 * Tempo por chamada em ms: a melhor média entre lotes de 5. Com a suíte inteira rodando em
 * paralelo (servidor e e2e nos outros workers), um lote pode pegar a CPU ocupada ou uma coleta de
 * lixo; o melhor lote mede o custo do algoritmo, que é o que o limite confere.
 */
const timeIt = (fn: () => void, runs: number) => {
  for (let i = 0; i < 5; i++) fn(); // aquece o JIT
  const batch = 5;
  let best = Infinity;
  for (let done = 0; done < Math.max(runs, batch * 3); done += batch) {
    const t0 = performance.now();
    for (let i = 0; i < batch; i++) fn();
    best = Math.min(best, (performance.now() - t0) / batch);
  }
  return best;
};

describe('registro de mapas', () => {
  it('lista, guarda em cache e lança erro para id desconhecido', () => {
    expect(listMaps()).toContain('prototipo_delta');
    expect(hasMap('prototipo_delta')).toBe(true);
    expect(getMap('prototipo_delta')).toBe(getMap('prototipo_delta'));
    expect(buildMap('prototipo_delta')).not.toBe(getMap('prototipo_delta'));
    expect(() => getMap('mapa_que_nao_existe')).toThrow(/mapa desconhecido/);
  });

  it('o conversor ASCII recusa linha torta, caractere sem legenda e marcador repetido', () => {
    const legend = { '.': { tile: Tile.Grama }, P: { tile: Tile.Grama, marker: { id: 'p', kind: 'spawn_jogador' as const } } };
    expect(() => buildAsciiMap({ id: 'a', legend, rows: ['...', '..'], regions: [] })).toThrow(/colunas/);
    expect(() => buildAsciiMap({ id: 'b', legend, rows: ['..x'], regions: [] })).toThrow(/sem legenda/);
    expect(() => buildAsciiMap({ id: 'c', legend, rows: ['P.P'], regions: [] })).toThrow(/repetido/);
    const ok = buildAsciiMap({ id: 'd', legend, rows: ['.P.', '...'], regions: [] });
    expect(ok.width).toBe(3);
    expect(ok.height).toBe(2);
    expect(ok.markers).toEqual([{ id: 'p', kind: 'spawn_jogador', x: 1.5, y: 0.5 }]);
  });
});

describe('mapa prototipo_delta', () => {
  const map = getMap('prototipo_delta');
  const byKind = (k: MapMarker['kind']) => map.markers.filter((m) => m.kind === k);
  const spawn = byKind('spawn_jogador')[0]!;
  const enemies = getData().enemies;

  it('tem o tamanho de retrato e a região delta cobrindo tudo', () => {
    expect(map.width).toBe(56);
    expect(map.height).toBe(84);
    expect(map.tiles.length).toBe(56 * 84);
    expect(map.regions).toEqual([{ regionId: 'delta', x: 0, y: 0, w: 56, h: 84 }]);
    expect(map.deco?.length).toBe(56 * 84);
  });

  it('tem os marcadores pedidos, com refs que existem nos dados', () => {
    expect(byKind('spawn_jogador')).toHaveLength(1);
    const ids = map.markers.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);

    const npcs = byKind('npc');
    for (const ref of ['wesley', 'li_wei']) {
      const m = npcs.find((n) => n.ref === ref);
      expect(m, ref).toBeDefined();
      expect(trainerById(ref).id).toBe(ref);
      expect(Math.hypot(m!.x - spawn.x, m!.y - spawn.y)).toBeLessThan(6);
    }
    const d = getData();
    for (const n of npcs) expect(d.npcsById.has(n.ref!) || d.trainersById.has(n.ref!), n.ref).toBe(true);
    expect(npcById('seu_jaco').id).toBe('seu_jaco');

    const bandos = byKind('bando');
    expect(bandos.length).toBeGreaterThanOrEqual(3);
    expect(bandos.length).toBeLessThanOrEqual(4);
    const tipos = new Set<string>();
    for (const b of bandos) {
      const p = b.params as { inimigos: string[]; n: number };
      expect(p.inimigos.length).toBeGreaterThan(0);
      for (const id of p.inimigos) {
        const e = enemyById(id);
        expect(e.tier).toBe('normal');
        expect(e.regioes).toContain('delta');
        expect(p.n).toBeGreaterThanOrEqual(e.bando.min);
        expect(p.n).toBeLessThanOrEqual(e.bando.max);
        tipos.add(id);
      }
    }
    expect(tipos.size).toBe(2);

    const elites = byKind('inimigo').filter((m) => (m.params as { tier?: string } | undefined)?.tier === 'elite');
    expect(elites).toHaveLength(1);
    const elite = elites[0]!;
    const afixos = (elite.params as { affixes: string[] }).affixes;
    expect(afixos.length).toBeGreaterThan(0);
    for (const a of afixos) {
      expect(enemies.afixos.map((x) => x.id)).toContain(a);
      expect(enemyById(elite.ref!).afixosPossiveis).toContain(a);
    }

    const chefes = byKind('chefe');
    expect(chefes).toHaveLength(1);
    expect(enemyById(chefes[0]!.ref!).tier).toBe('chefe');
    expect(enemyById(chefes[0]!.ref!).regioes).toContain('delta');

    const cais = byKind('lugar').find((m) => m.ref === 'cais_do_delta');
    expect(cais).toBeDefined();
    for (const l of byKind('lugar')) expect(placeById(l.ref!).regiao).toBe('delta');
  });

  it('todos os marcadores ficam em tiles andáveis, com folga para o corpo', () => {
    for (const m of map.markers) {
      const tx = Math.floor(m.x), ty = Math.floor(m.y);
      expect(isSolidTile(map, tx, ty), m.id).toBe(false);
      expect(circleFree(map, m.x, m.y, R), m.id).toBe(true);
      if (m.kind === 'chefe' || m.kind === 'inimigo' || m.kind === 'bando') {
        const refs = m.kind === 'bando' ? (m.params as { inimigos: string[] }).inimigos : [m.ref!];
        for (const id of refs) expect(circleFree(map, m.x, m.y, enemyById(id).raioCorpoTiles), `${m.id} ${id}`).toBe(true);
      }
    }
  });

  it('tem o terreno do Delta: água funda nas bordas, água rasa e lama lentas, pedra e cerca transparentes', () => {
    for (let x = 0; x < map.width; x++) {
      expect(tileAt(map, x, 0)).toBe(Tile.AguaFunda);
      expect(tileAt(map, x, map.height - 1)).toBe(Tile.AguaFunda);
    }
    for (let y = 0; y < map.height; y++) {
      expect(tileAt(map, 0, y)).toBe(Tile.AguaFunda);
      expect(tileAt(map, map.width - 1, y)).toBe(Tile.AguaFunda);
    }
    const count = new Map<number, number>();
    for (const t of map.tiles) count.set(t, (count.get(t) ?? 0) + 1);
    for (const t of [Tile.AguaRasa, Tile.Lama, Tile.Pedra, Tile.Cerca, Tile.Parede, Tile.Arvore, Tile.Madeira, Tile.Mato, Tile.Terra]) {
      expect(count.get(t) ?? 0, Tile[t]).toBeGreaterThan(0);
    }
    expect(infoAt(map, 0, 0).speed).toBe(0);
    // pedra e cerca não bloqueiam a visão
    let found = 0;
    for (let y = 1; y < map.height - 1; y++) {
      for (let x = 1; x < map.width - 1; x++) {
        const t = tileAt(map, x, y);
        if ((t === Tile.Pedra || t === Tile.Cerca) && !isSolidTile(map, x - 1, y) && !isSolidTile(map, x + 1, y)) {
          expect(hasLineOfSight(map, x - 0.5, y + 0.5, x + 1.5, y + 0.5)).toBe(true);
          found++;
        }
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('parede e árvore bloqueiam a visão entre pontos andáveis', () => {
    const blockedBy = new Set<Tile>();
    for (let y = 1; y < map.height - 1; y++) {
      for (let x = 1; x < map.width - 1; x++) {
        if (!isOpaqueTile(map, x, y)) continue;
        if (isSolidTile(map, x - 1, y) || isSolidTile(map, x + 1, y)) continue;
        if (!hasLineOfSight(map, x - 0.5, y + 0.5, x + 1.5, y + 0.5)) blockedBy.add(tileAt(map, x, y));
      }
    }
    expect(blockedBy.has(Tile.Parede)).toBe(true);
    expect(blockedBy.has(Tile.Arvore)).toBe(true);
  });

  it('o spawn alcança todos os bandos, a elite, o chefe, os NPCs e o cais', () => {
    const alvos = map.markers.filter((m) => m.id !== spawn.id);
    for (const m of alvos) {
      const stats: PathStats = { expanded: 0, snapped: false };
      const p = findPath(map, spawn, m, R, { stats });
      expect(p, m.id).not.toBeNull();
      expect(stats.snapped, m.id).toBe(false);
      const last = p![p!.length - 1]!;
      expect(last.x).toBeCloseTo(m.x, 5);
      expect(last.y).toBeCloseTo(m.y, 5);
      expect(pathIsWalkable(map, spawn, p!), m.id).toBe(true);
    }
    // corpo maior (capanga) também chega ao chefe
    expect(findPath(map, spawn, byKind('chefe')[0]!, 0.45)).not.toBeNull();
  });

  it('a progressão vai do spawn aos bandos, à elite e ao chefe (mais longe a cada etapa)', () => {
    const dist = (m: MapMarker) => pathLength(spawn, findPath(map, spawn, m, R)!);
    const bandos = byKind('bando').map(dist);
    const elite = dist(byKind('inimigo')[0]!);
    const chefe = dist(byKind('chefe')[0]!);
    expect(Math.min(...bandos)).toBeLessThan(elite);
    expect(elite).toBeLessThan(chefe);
  });

  // retry: medição de tempo; com a suíte inteira em paralelo a CPU pode estar disputada (sozinho: ~0,4 ms)
  it('findPath de ponta a ponta cabe no orçamento (< 5 ms)', { retry: 2 }, () => {
    const chefe = byKind('chefe')[0]!;
    const cais = byKind('lugar').find((m) => m.ref === 'cais_do_delta')!;
    const ms = timeIt(() => {
      findPath(map, cais, chefe, R);
    }, 30);
    expect(ms).toBeLessThan(5);
    const stats: PathStats = { expanded: 0, snapped: false };
    findPath(map, cais, chefe, R, { stats });
    expect(stats.expanded).toBeLessThan(4000);
  });
});

describe('findPath', () => {
  it('desvia de uma parede pela abertura', () => {
    const m = makeMap('t', 20, 20);
    for (let y = 0; y < 20; y++) if (y !== 17) setTile(m, 10, y, Tile.Parede);
    const from = { x: 3.5, y: 3.5 }, to = { x: 16.5, y: 3.5 };
    const p = findPath(m, from, to, R)!;
    expect(p).not.toBeNull();
    expect(p[p.length - 1]).toEqual(to);
    expect(p.some((q) => q.y > 16)).toBe(true);
    expect(pathLength(from, p)).toBeGreaterThan(20);
    expect(pathIsWalkable(m, from, p)).toBe(true);
  });

  it('em campo aberto vira um segmento só (suavizado)', () => {
    const m = makeMap('t', 30, 30);
    const p = findPath(m, { x: 2.2, y: 3.7 }, { x: 25.4, y: 20.1 }, R)!;
    expect(p).toEqual([{ x: 25.4, y: 20.1 }]);
  });

  it('devolve null para destino fechado', () => {
    const m = makeMap('t', 20, 20);
    for (let i = 12; i <= 18; i++) {
      setTile(m, i, 12, Tile.Parede);
      setTile(m, i, 18, Tile.Parede);
      setTile(m, 12, i, Tile.Parede);
      setTile(m, 18, i, Tile.Parede);
    }
    expect(findPath(m, { x: 2.5, y: 2.5 }, { x: 15.5, y: 15.5 }, R)).toBeNull();
    // e dentro da sala fechada, chega
    expect(findPath(m, { x: 13.5, y: 13.5 }, { x: 16.5, y: 16.5 }, R)).not.toBeNull();
  });

  it('destino sólido vai para a célula livre mais perto', () => {
    const m = makeMap('t', 20, 20);
    for (let y = 5; y <= 15; y++) setTile(m, 10, y, Tile.Arvore);
    const stats: PathStats = { expanded: 0, snapped: false };
    const p = findPath(m, { x: 2.5, y: 10.5 }, { x: 10.4, y: 10.5 }, R, { stats })!;
    expect(stats.snapped).toBe(true);
    expect(p[p.length - 1]).toEqual({ x: 9.5, y: 10.5 });
    // água funda também é sólida
    setTile(m, 3, 3, Tile.AguaFunda);
    const q = findPath(m, { x: 1.5, y: 1.5 }, { x: 3.5, y: 3.5 }, R)!;
    expect(isSolidTile(m, Math.floor(q[q.length - 1]!.x), Math.floor(q[q.length - 1]!.y))).toBe(false);
    // fora do mapa e sem célula livre por perto
    const cheio = makeMap('c', 30, 30, Tile.Parede);
    setTile(cheio, 1, 1, Tile.Grama);
    setTile(cheio, 2, 1, Tile.Grama);
    expect(findPath(cheio, { x: 1.5, y: 1.5 }, { x: 25.5, y: 25.5 }, R)).toBeNull();
  });

  it('não corta canto na diagonal', () => {
    const m = makeMap('t', 6, 6);
    setTile(m, 2, 1, Tile.Parede);
    setTile(m, 1, 2, Tile.Parede);
    // (1,1) → (2,2) pela diagonal passaria entre duas paredes encostadas pelo canto: tem que dar a volta
    const p = findPath(m, { x: 1.5, y: 1.5 }, { x: 2.5, y: 2.5 }, R, { smooth: false })!;
    expect(p.length).toBeGreaterThan(2);
    expect(pathLength({ x: 1.5, y: 1.5 }, p)).toBeGreaterThan(3);
    const ps = findPath(m, { x: 1.5, y: 1.5 }, { x: 2.5, y: 2.5 }, R)!;
    expect(pathIsWalkable(m, { x: 1.5, y: 1.5 }, ps)).toBe(true);
    // sem uma das paredes, passa pelo lado
    setTile(m, 1, 2, Tile.Grama);
    const q = findPath(m, { x: 1.5, y: 1.5 }, { x: 2.5, y: 2.5 }, R, { smooth: false })!;
    expect(q).toEqual([{ x: 1.5, y: 2.5 }, { x: 2.5, y: 2.5 }]);
  });

  it('respeita a folga do raio: corredor de 1 tile não passa para corpo de raio 0,6', () => {
    // duas salas ligadas por um corredor de 1 tile de largura (x 9 a 11, y 4)
    const m = makeMap('t', 20, 9, Tile.Parede);
    for (let y = 1; y <= 7; y++) {
      for (let x = 1; x <= 8; x++) setTile(m, x, y, Tile.Grama);
      for (let x = 12; x <= 18; x++) setTile(m, x, y, Tile.Grama);
    }
    for (let x = 9; x <= 11; x++) setTile(m, x, 4, Tile.Grama);
    const a = { x: 3.5, y: 4.5 }, b = { x: 16.5, y: 4.5 };
    expect(findPath(m, a, b, 0.35)).not.toBeNull();
    expect(findPath(m, a, b, 0.6)).toBeNull();
  });

  it('contorna a lama quando o desvio é curto', () => {
    const m = makeMap('t', 20, 12);
    for (let y = 4; y <= 7; y++) for (let x = 8; x <= 11; x++) setTile(m, x, y, Tile.Lama);
    const from = { x: 2.5, y: 5.5 }, to = { x: 17.5, y: 5.5 };
    const p = findPath(m, from, to, R)!;
    const allPts = [from, ...p];
    // nenhum trecho atravessa a lama
    for (let i = 1; i < allPts.length; i++) {
      const a = allPts[i - 1]!, b = allPts[i]!;
      for (let k = 0; k <= 50; k++) {
        const x = a.x + ((b.x - a.x) * k) / 50, y = a.y + ((b.y - a.y) * k) / 50;
        expect(tileAt(m, Math.floor(x), Math.floor(y))).not.toBe(Tile.Lama);
      }
    }
  });

  it('é determinístico e respeita o limite de nós', () => {
    const map = getMap('prototipo_delta');
    const a = { x: 27.5, y: 79.5 }, b = { x: 28.5, y: 14.5 };
    expect(findPath(map, a, b)).toEqual(findPath(map, a, b));
    expect(findPath(map, a, b, R, { maxNodes: 50 })).toBeNull();
  });

  // retry: medição de tempo; com a suíte inteira em paralelo a CPU pode estar disputada (sozinho: ~1,3 ms)
  it('desempenho num mapa 64x96 com obstáculos (< 5 ms; alvo < 2 ms)', { retry: 2 }, () => {
    const m = makeMap('perf', 64, 96);
    const rng = createRng(7);
    for (let i = 0; i < 64 * 96 * 0.18; i++) {
      const t = rng.pick([Tile.Arvore, Tile.Parede, Tile.Pedra, Tile.Lama, Tile.AguaRasa]);
      setTile(m, rng.int(0, 63), rng.int(0, 95), t);
    }
    // muros com frestas alternadas para forçar zigue-zague
    for (let y = 12; y < 96; y += 12) for (let x = 0; x < 64; x++) setTile(m, x, y, (y / 12) % 2 ? (x > 58 ? Tile.Grama : Tile.Parede) : x < 5 ? Tile.Grama : Tile.Parede);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) setTile(m, x, y, Tile.Grama);
    for (let y = 93; y < 96; y++) for (let x = 61; x < 64; x++) setTile(m, x, y, Tile.Grama);
    const from = { x: 1.5, y: 1.5 }, to = { x: 62.5, y: 94.5 };
    const p = findPath(m, from, to, R, { maxNodes: 20000 });
    expect(p).not.toBeNull();
    expect(pathIsWalkable(m, from, p!)).toBe(true);
    const ms = timeIt(() => {
      findPath(m, from, to, R, { maxNodes: 20000 });
    }, 20);
    expect(ms).toBeLessThan(5);
  });
});
