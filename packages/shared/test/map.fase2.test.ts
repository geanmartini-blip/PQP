/**
 * Mapas da Fase 2: o Delta completo (níveis 1 a 7) e as chegadas da travessia nas duas margens.
 */
import { describe, expect, it } from 'vitest';
import { enemyById, getData, placeById } from '../src/data';
import { circleFree, isSolidTile, tileAt } from '../src/map/grid';
import { findPath, pathLength, type PathStats } from '../src/map/path';
import { ARRIVAL_MAP_BY_SIDE, getMap, hasMap, listMaps, START_MAP } from '../src/map/registry';
import { Tile, type MapMarker, type TileMap } from '../src/map/types';

const R = 0.35;
const NOVOS = ['delta', 'qg_esquerda', 'qg_direita'] as const;

const byKind = (map: TileMap, k: MapMarker['kind']) => map.markers.filter((m) => m.kind === k);
const spawnOf = (map: TileMap) => byKind(map, 'spawn_jogador')[0]!;
const P = <T = unknown>(m: MapMarker, k: string) => m.params?.[k] as T;

/** Células alcançáveis a pé a partir do spawn, para um corpo de raio r (passos de 4 vizinhos entre centros livres). */
function reachable(map: TileMap, r = R): Uint8Array {
  const seen = new Uint8Array(map.width * map.height);
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < map.width && y < map.height && !isSolidTile(map, x, y) && circleFree(map, x + 0.5, y + 0.5, r);
  const s = spawnOf(map);
  const q: number[] = [Math.floor(s.x), Math.floor(s.y)];
  seen[Math.floor(s.y) * map.width + Math.floor(s.x)] = 1;
  while (q.length > 0) {
    const y = q.pop()!, x = q.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (!free(nx, ny) || seen[ny * map.width + nx]) continue;
      seen[ny * map.width + nx] = 1;
      q.push(nx, ny);
    }
  }
  return seen;
}
const isReached = (map: TileMap, seen: Uint8Array, m: { x: number; y: number }) => seen[Math.floor(m.y) * map.width + Math.floor(m.x)] === 1;

describe('registro com os mapas da Fase 2', () => {
  it('lista e carrega os quatro mapas, com o tamanho de cada um', () => {
    expect(listMaps()).toEqual(expect.arrayContaining(['prototipo_delta', 'delta', 'qg_esquerda', 'qg_direita']));
    expect(listMaps()).toHaveLength(4);
    for (const id of listMaps()) {
      const m = getMap(id);
      expect(m.id).toBe(id);
      expect(m.tiles.length).toBe(m.width * m.height);
      expect(m.deco?.length).toBe(m.width * m.height);
    }
    expect([getMap('delta').width, getMap('delta').height]).toEqual([90, 140]);
    for (const id of ['qg_esquerda', 'qg_direita']) expect([getMap(id).width, getMap(id).height]).toEqual([40, 50]);
    expect(hasMap(START_MAP)).toBe(true);
    expect(hasMap(ARRIVAL_MAP_BY_SIDE.esquerda)).toBe(true);
    expect(hasMap(ARRIVAL_MAP_BY_SIDE.direita)).toBe(true);
  });
});

describe.each(NOVOS)('mapa %s: marcadores e alcance', (id) => {
  const map = getMap(id);
  const D = getData();

  it('tem um spawn, ids únicos e refs que existem nos dados', () => {
    expect(byKind(map, 'spawn_jogador')).toHaveLength(1);
    const ids = map.markers.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    const maquinas = new Set(D.places.flatMap((p) => (p.maquinaDeVisual ? [p.maquinaDeVisual.id] : [])));
    for (const m of map.markers) {
      if (m.kind === 'npc') expect(D.npcsById.has(m.ref!) || D.trainersById.has(m.ref!), m.id).toBe(true);
      if (m.kind === 'lugar') expect(D.placesById.has(m.ref!), m.id).toBe(true);
      if (m.kind === 'maquina_visual') expect(maquinas.has(m.ref!), m.id).toBe(true);
      if (m.kind === 'inimigo' || m.kind === 'chefe') expect(D.enemiesById.has(m.ref!), m.id).toBe(true);
      if (m.kind === 'bando') for (const e of P<string[]>(m, 'inimigos')) expect(D.enemiesById.has(e), `${m.id} ${e}`).toBe(true);
    }
  });

  it('todo marcador fica em tile andável, com folga para o corpo', () => {
    for (const m of map.markers) {
      expect(isSolidTile(map, Math.floor(m.x), Math.floor(m.y)), m.id).toBe(false);
      expect(circleFree(map, m.x, m.y, R), m.id).toBe(true);
      const refs = m.kind === 'bando' ? P<string[]>(m, 'inimigos') : m.kind === 'inimigo' || m.kind === 'chefe' ? [m.ref!] : [];
      for (const e of refs) expect(circleFree(map, m.x, m.y, enemyById(e).raioCorpoTiles), `${m.id} ${e}`).toBe(true);
    }
  });

  it('tudo é alcançável a pé a partir do spawn', () => {
    const seen = reachable(map);
    for (const m of map.markers) expect(isReached(map, seen, m), m.id).toBe(true);
    // e pelo A*, com o caminho chegando no ponto exato
    const s = spawnOf(map);
    for (const m of map.markers) {
      if (m === s) continue;
      const stats: PathStats = { expanded: 0, snapped: false };
      const p = findPath(map, s, m, R, { maxNodes: 40000, stats });
      expect(p, m.id).not.toBeNull();
      expect(stats.snapped, m.id).toBe(false);
      const last = p![p!.length - 1]!;
      expect(last.x).toBeCloseTo(m.x, 5);
      expect(last.y).toBeCloseTo(m.y, 5);
    }
  });

  it('a borda do mapa é sólida (ninguém sai andando para fora)', () => {
    for (let x = 0; x < map.width; x++) {
      expect(isSolidTile(map, x, 0)).toBe(true);
      expect(isSolidTile(map, x, map.height - 1)).toBe(true);
    }
    for (let y = 0; y < map.height; y++) {
      expect(isSolidTile(map, 0, y)).toBe(true);
      expect(isSolidTile(map, map.width - 1, y)).toBe(true);
    }
  });
});

describe('mapa delta', () => {
  const map = getMap('delta');
  const D = getData();
  const spawn = spawnOf(map);
  const lugares = byKind(map, 'lugar');
  const missoesDelta = D.missions.missoes.filter((m) => m.regiao === 'delta' && m.emPiloto);

  it('a região delta cobre o mapa e cada lugar de regions.json tem marcador com ref igual ao id', () => {
    expect(map.regions).toEqual([{ regionId: 'delta', x: 0, y: 0, w: 90, h: 140 }]);
    const regiao = D.regionsById.get('delta')!;
    for (const p of regiao.lugares) expect(lugares.some((m) => m.ref === p), p).toBe(true);
    for (const l of lugares) expect(placeById(l.ref!).regiao).toBe('delta');
    for (const pc of regiao.pontosDeControle ?? []) expect(byKind(map, 'ponto_controle').some((m) => m.ref === pc), pc).toBe(true);
  });

  it('todos os lugares, NPCs e alvos das missões do Delta existem no mapa', () => {
    expect(missoesDelta.length).toBeGreaterThanOrEqual(8);
    const npcs = new Set(byKind(map, 'npc').map((m) => m.ref));
    const ids = new Set(map.markers.map((m) => m.id));
    const lugarRefs = new Set(lugares.map((m) => m.ref));
    const inimigos = new Set(map.markers.flatMap((m) => (m.kind === 'bando' ? P<string[]>(m, 'inimigos') : m.kind === 'inimigo' || m.kind === 'chefe' ? [m.ref!] : [])));
    for (const mis of missoesDelta) {
      if (mis.lugar) expect(lugarRefs.has(mis.lugar), `${mis.id} lugar ${mis.lugar}`).toBe(true);
      if (mis.dadaPor) expect(npcs.has(mis.dadaPor), `${mis.id} dadaPor ${mis.dadaPor}`).toBe(true);
      for (const o of mis.objetivos as unknown as Record<string, unknown>[]) {
        const tag = `${mis.id} ${String(o['tipo'])}`;
        if (typeof o['npc'] === 'string') expect(npcs.has(o['npc']), `${tag} npc ${o['npc']}`).toBe(true);
        if (typeof o['lugar'] === 'string' && placeById(o['lugar']).regiao === 'delta') expect(lugarRefs.has(o['lugar']), `${tag} lugar ${o['lugar']}`).toBe(true);
        if (o['tipo'] === 'interagir') expect(ids.has(String(o['alvo'])), `${tag} alvo ${String(o['alvo'])}`).toBe(true);
        if (o['tipo'] === 'derrotar') {
          for (const alvo of o['inimigos'] as { inimigo: string; tier?: string }[]) expect(inimigos.has(alvo.inimigo), `${tag} ${alvo.inimigo}`).toBe(true);
        }
      }
    }
  });

  it('tem os NPCs do Delta de npcs.json (Bruno Ferro aparece como o chefe)', () => {
    const npcs = new Set(byKind(map, 'npc').map((m) => m.ref));
    // Eco é a voz da rádio pirata: fala no Delta, mas transmite da Ilha do Farol
    const semCorpo = new Set(['eco', 'bruno_ferro']);
    for (const n of D.npcs.personagens) {
      if (!n.noPiloto || !n.regioes.includes('delta') || semCorpo.has(n.id)) continue;
      expect(npcs.has(n.id), n.id).toBe(true);
    }
    expect(byKind(map, 'chefe').map((m) => m.ref)).toEqual(['bruno_ferro_chefe']);
  });

  it('o Seu Jacó atende o cadastro, com a Máquina de Visual do Delta do lado', () => {
    const cad = lugares.find((m) => m.ref === 'cadastro_do_delta')!;
    const maq = byKind(map, 'maquina_visual');
    expect(maq.map((m) => m.ref)).toEqual([placeById('cadastro_do_delta').maquinaDeVisual!.id]);
    expect(maq[0]!.id).toBe('maquina_visual_delta');
    const jaco = byKind(map, 'npc').find((m) => m.ref === 'seu_jaco' && P(m, 'lugar') === 'cadastro_do_delta')!;
    expect(jaco).toBeDefined();
    expect(Math.hypot(maq[0]!.x - cad.x, maq[0]!.y - cad.y)).toBeLessThan(8);
    expect(Math.hypot(jaco.x - cad.x, jaco.y - cad.y)).toBeLessThan(4);
    // o jogador nasce na porta do cadastro
    expect(Math.hypot(spawn.x - cad.x, spawn.y - cad.y)).toBeLessThan(8);
  });

  it('a saída da travessia fica no cais, ao lado do barco, com params.travessia', () => {
    const saidas = byKind(map, 'saida');
    expect(saidas).toHaveLength(1);
    const s = saidas[0]!;
    expect(P(s, 'travessia')).toBe(true);
    expect(P<string[]>(s, 'destinos')).toEqual(['qg_esquerda', 'qg_direita']);
    const cais = lugares.find((m) => m.ref === 'cais_do_delta')!;
    expect(Math.hypot(s.x - cais.x, s.y - cais.y)).toBeLessThan(4);
    // barco (decoração) na água funda encostado no cais
    let barco = false;
    for (let y = Math.floor(s.y) - 3; y <= Math.floor(s.y) + 3; y++) {
      for (let x = Math.floor(s.x) - 4; x <= Math.floor(s.x) + 4; x++) {
        if (map.deco?.[y * map.width + x] === 4 && tileAt(map, x, y) === Tile.AguaFunda) barco = true;
      }
    }
    expect(barco).toBe(true);
  });

  it('os bandos são do Delta, com tamanho de enemies.json e nível de 1 a 7, nunca abaixo do base', () => {
    const bandos = byKind(map, 'bando');
    expect(bandos.length).toBeGreaterThanOrEqual(8);
    const tipos = new Set<string>();
    for (const b of bandos) {
      const n = P<number>(b, 'n'), level = P<number>(b, 'level');
      for (const id of P<string[]>(b, 'inimigos')) {
        const e = enemyById(id);
        tipos.add(id);
        expect(e.tier, b.id).toBe('normal');
        expect(e.regioes, b.id).toContain('delta');
        expect(n, b.id).toBeGreaterThanOrEqual(e.bando.min);
        expect(n, b.id).toBeLessThanOrEqual(e.bando.max);
        expect(level, b.id).toBeGreaterThanOrEqual(e.nivel);
      }
      expect(level).toBeGreaterThanOrEqual(1);
      expect(level).toBeLessThanOrEqual(7);
    }
    expect(tipos).toEqual(new Set(['siri_do_mangue', 'mosquito_do_delta', 'capanga_do_capataz']));
  });

  it('tem elites com afixos válidos', () => {
    const elites = byKind(map, 'inimigo').filter((m) => P(m, 'tier') === 'elite');
    expect(elites.length).toBeGreaterThanOrEqual(2);
    const afixos = new Set<string>(D.enemies.afixos.map((a) => a.id));
    for (const e of elites) {
      const a = P<string[]>(e, 'affixes');
      expect(a.length, e.id).toBeGreaterThan(0);
      for (const x of a) {
        expect(afixos.has(x), `${e.id} ${x}`).toBe(true);
        expect((enemyById(e.ref!).afixosPossiveis as readonly string[]).includes(x), `${e.id} ${x}`).toBe(true);
      }
    }
    // o capanga elite blindado da missão da chopindita
    expect(elites.some((e) => e.ref === 'capanga_do_capataz' && P<string[]>(e, 'affixes').includes('blindado'))).toBe(true);
  });

  it('a dificuldade cresce com a distância: nível 1 perto da vila, o chefe no fim', () => {
    const dist = (m: MapMarker) => pathLength(spawn, findPath(map, spawn, m, R, { maxNodes: 40000 })!);
    const bandos = byKind(map, 'bando').map((b) => ({ level: P<number>(b, 'level'), d: dist(b) }));
    const perto = bandos.filter((b) => b.level <= 1).map((b) => b.d);
    const longe = bandos.filter((b) => b.level >= 4).map((b) => b.d);
    expect(perto.length).toBeGreaterThan(0);
    expect(longe.length).toBeGreaterThan(0);
    expect(Math.max(...perto)).toBeLessThan(Math.min(...longe));
    const inimigos = byKind(map, 'inimigo').map(dist);
    const chefe = dist(byKind(map, 'chefe')[0]!);
    expect(chefe).toBeGreaterThan(Math.max(...bandos.map((b) => b.d), ...inimigos));
  });

  it('a arena do chefe é alcançável, inclusive por corpo grande, e tem espaço para desviar dos avisos', () => {
    const chefe = byKind(map, 'chefe')[0]!;
    expect(findPath(map, spawn, chefe, 0.45, { maxNodes: 40000 })).not.toBeNull();
    expect(findPath(map, spawn, chefe, enemyById('bruno_ferro_chefe').raioCorpoTiles, { maxNodes: 40000 })).not.toBeNull();
    // clareira: pelo menos 8 tiles livres em volta do chefe nas quatro direções
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      for (let k = 1; k <= 8; k++) expect(isSolidTile(map, Math.floor(chefe.x) + dx * k, Math.floor(chefe.y) + dy * k), `${dx},${dy} ${k}`).toBe(false);
    }
  });

  it('o auto-caminho padrão (limite de nós do A*) chega do spawn a todo marcador, até o chefe', () => {
    for (const m of map.markers) {
      const stats: PathStats = { expanded: 0, snapped: false };
      expect(findPath(map, spawn, m, R, { stats }), m.id).not.toBeNull();
      expect(stats.snapped, m.id).toBe(false);
    }
    // e do cais (onde a missão do nível 7 começa) até o chefe
    const cais = lugares.find((m) => m.ref === 'cais_do_delta')!;
    expect(findPath(map, cais, byKind(map, 'chefe')[0]!, R)).not.toBeNull();
  });

  it('tem o terreno variado do Delta: água rasa antes da funda, trilhas, vegetação e decoração', () => {
    const count = new Map<number, number>();
    for (const t of map.tiles) count.set(t, (count.get(t) ?? 0) + 1);
    for (const t of [Tile.AguaRasa, Tile.AguaFunda, Tile.Lama, Tile.Mato, Tile.Grama, Tile.Terra, Tile.Areia, Tile.Madeira, Tile.Arvore, Tile.Pedra, Tile.Cerca, Tile.Parede, Tile.Porta]) {
      expect(count.get(t) ?? 0, Tile[t]).toBeGreaterThan(0);
    }
    const decos = new Set(Array.from(map.deco ?? []).filter((d) => d > 0));
    expect(decos.size).toBeGreaterThanOrEqual(8);
    // a margem: toda terra encostada na água funda é rara (quase sempre há água rasa ou madeira no meio)
    let terraNaFunda = 0, beira = 0;
    for (let y = 1; y < map.height - 1; y++) {
      for (let x = 1; x < map.width - 1; x++) {
        const t = tileAt(map, x, y);
        if (t === Tile.AguaFunda || t === Tile.AguaRasa || t === Tile.Madeira) continue;
        const viz = [tileAt(map, x + 1, y), tileAt(map, x - 1, y), tileAt(map, x, y + 1), tileAt(map, x, y - 1)];
        if (viz.some((v) => v === Tile.AguaRasa || v === Tile.AguaFunda)) {
          beira++;
          if (viz.includes(Tile.AguaFunda)) terraNaFunda++;
        }
      }
    }
    expect(terraNaFunda / beira).toBeLessThan(0.15);
  });
});

describe.each([
  { id: 'qg_esquerda', margem: 'esquerda', regiao: 'margem_esquerda', qg: 'casa_da_assembleia', npc: 'benzedeira_do_espelho', tem: [Tile.Madeira, Tile.Grama, Tile.Arvore, Tile.Terra], nao: [Tile.PisoNeon, Tile.Asfalto, Tile.Concreto] },
  { id: 'qg_direita', margem: 'direita', regiao: 'margem_direita', qg: 'torre_do_consorcio', npc: 'funcionario_da_cabine_neon', tem: [Tile.Concreto, Tile.PisoNeon, Tile.Asfalto, Tile.Grade], nao: [Tile.Arvore] },
] as const)('chegada $id', ({ id, margem, regiao, qg, npc, tem, nao }) => {
  const map = getMap(id);
  const D = getData();
  const lugares = byKind(map, 'lugar');

  it('tem a região e a paleta da margem', () => {
    expect(map.regions).toEqual([{ regionId: regiao, x: 0, y: 0, w: 40, h: 50 }]);
    const ts = new Set(map.tiles);
    for (const t of tem) expect(ts.has(t), Tile[t]).toBe(true);
    for (const t of nao) expect(ts.has(t), Tile[t]).toBe(false);
  });

  it('tem o QG, as 4 instituições da margem com porta e a Máquina de Visual da margem', () => {
    expect(lugares.some((m) => m.ref === qg)).toBe(true);
    const insts = D.places.filter((p) => p.tipo === 'instituicao' && p.margem === margem && p.emPiloto);
    expect(insts).toHaveLength(4);
    for (const p of insts) {
      const m = lugares.find((l) => l.ref === p.id);
      expect(m, p.id).toBeDefined();
      expect(P(m!, 'instituicao')).toBe(p.instituicao);
      expect(D.institutionsById.has(p.instituicao!), p.instituicao).toBe(true);
      // porta do prédio encostada no marcador
      const tx = Math.floor(m!.x), ty = Math.floor(m!.y);
      let porta = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (tileAt(map, tx + dx, ty + dy) === Tile.Porta) porta = true;
      expect(porta, p.id).toBe(true);
    }
    for (const l of lugares) expect(placeById(l.ref!).margem).toBe(margem);
    const maq = byKind(map, 'maquina_visual');
    expect(maq.map((m) => m.ref)).toEqual([placeById(qg).maquinaDeVisual!.id]);
    expect(byKind(map, 'npc').map((m) => m.ref)).toEqual([npc]);
    const n = byKind(map, 'npc')[0]!;
    expect(Math.hypot(n.x - maq[0]!.x, n.y - maq[0]!.y)).toBeLessThan(3);
  });

  it('não tem inimigos (a chegada é segura)', () => {
    expect(map.markers.filter((m) => m.kind === 'bando' || m.kind === 'inimigo' || m.kind === 'chefe')).toEqual([]);
  });
});
