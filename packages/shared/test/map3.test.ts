/**
 * Mapas da Fase 3: as duas margens, a Usina da Ponte e o Juncal, com os apelidos qg_esquerda e
 * qg_direita.
 */
import { describe, expect, it } from 'vitest';
import { enemyById, getData, placeById } from '../src/data';
import { circleFree, isSolidTile, tileAt } from '../src/map/grid';
import { findPath, type PathStats } from '../src/map/path';
import { ARRIVAL_MAP_BY_SIDE, getMap, hasMap, listMaps, MAP_ALIASES, resolveMapId } from '../src/map/registry';
import { Tile, type MapMarker, type TileMap } from '../src/map/types';

const R = 0.35;
// v0.4: o Planalto, o Vale e a Ilha do Farol passam pelas mesmas checagens
const NOVOS = ['margem_esquerda', 'margem_direita', 'usina_da_ponte', 'juncal', 'planalto_do_trigo', 'vale_das_chamines', 'ilha_do_farol'] as const;
const MARGENS = [
  { id: 'margem_esquerda', margem: 'esquerda', qg: 'casa_da_assembleia', maquina: 'espelho_da_benzedeira', npcMaquina: 'benzedeira_do_espelho', tem: [Tile.Grama, Tile.Terra, Tile.Madeira, Tile.Arvore], nao: [Tile.PisoNeon, Tile.Asfalto, Tile.Concreto] },
  { id: 'margem_direita', margem: 'direita', qg: 'torre_do_consorcio', maquina: 'cabine_neon', npcMaquina: 'funcionario_da_cabine_neon', tem: [Tile.Concreto, Tile.PisoNeon, Tile.Asfalto, Tile.Grade], nao: [Tile.Arvore] },
] as const;

const byKind = (map: TileMap, k: MapMarker['kind']) => map.markers.filter((m) => m.kind === k);
const spawnOf = (map: TileMap) => byKind(map, 'spawn_jogador')[0]!;
const P = <T = unknown>(m: MapMarker, k: string) => m.params?.[k] as T;
const enemiesOf = (m: MapMarker): string[] => (m.kind === 'bando' ? P<string[]>(m, 'inimigos') : m.kind === 'inimigo' || m.kind === 'chefe' ? [m.ref!] : []);

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

describe('registro com os mapas da Fase 3', () => {
  it('lista os mapas canônicos, sem os apelidos', () => {
    expect(listMaps()).toEqual(expect.arrayContaining(['prototipo_delta', 'delta', ...NOVOS]));
    for (const a of Object.keys(MAP_ALIASES)) expect(listMaps()).not.toContain(a);
    for (const id of listMaps()) expect(getMap(id).id).toBe(id);
  });

  it('qg_esquerda e qg_direita viram apelidos das margens', () => {
    expect(resolveMapId('qg_esquerda')).toBe('margem_esquerda');
    expect(resolveMapId('qg_direita')).toBe('margem_direita');
    expect(resolveMapId('delta')).toBe('delta');
    expect(hasMap('qg_esquerda')).toBe(true);
    expect(hasMap('qg_direita')).toBe(true);
    expect(getMap('qg_esquerda')).toBe(getMap('margem_esquerda'));
    expect(getMap('qg_direita')).toBe(getMap('margem_direita'));
    expect(getMap('qg_esquerda').id).toBe('margem_esquerda');
    expect(hasMap('nao_existe')).toBe(false);
  });

  it('a travessia chega nas margens', () => {
    expect(ARRIVAL_MAP_BY_SIDE).toEqual({ esquerda: 'margem_esquerda', direita: 'margem_direita' });
    for (const side of ['esquerda', 'direita'] as const) {
      const s = spawnOf(getMap(ARRIVAL_MAP_BY_SIDE[side]));
      expect(s.id).toBe('spawn');
      expect(P(s, 'chegada')).toBe('travessia');
    }
  });

  it('as margens têm de 80 x 120 a 120 x 160 tiles', () => {
    for (const { id } of MARGENS) {
      const m = getMap(id);
      expect(m.width, id).toBeGreaterThanOrEqual(80);
      expect(m.width, id).toBeLessThanOrEqual(120);
      expect(m.height, id).toBeGreaterThanOrEqual(120);
      expect(m.height, id).toBeLessThanOrEqual(160);
    }
  });
});

describe.each(NOVOS)('mapa %s: marcadores e alcance', (id) => {
  const map = getMap(id);
  const D = getData();

  it('tem a região cobrindo o mapa e tiles e decoração do tamanho certo', () => {
    expect(map.regions).toEqual([{ regionId: id, x: 0, y: 0, w: map.width, h: map.height }]);
    expect(D.regionsById.has(id)).toBe(true);
    expect(map.tiles.length).toBe(map.width * map.height);
    expect(map.deco?.length).toBe(map.width * map.height);
  });

  it('ids únicos e refs que existem nos dados', () => {
    const ids = map.markers.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    const maquinas = new Set(D.places.flatMap((p) => (p.maquinaDeVisual ? [p.maquinaDeVisual.id] : [])));
    const pcs = new Set(D.structures.instancias.map((s) => s.id));
    for (const m of map.markers) {
      if (m.kind === 'npc') {
        const ok = D.npcsById.has(m.ref!) || D.trainersById.has(m.ref!) || D.factionCharactersById.has(m.ref!) || D.guidesById.has(m.ref!);
        expect(ok, m.id).toBe(true);
      }
      if (m.kind === 'lugar') expect(D.placesById.has(m.ref!), m.id).toBe(true);
      if (m.kind === 'maquina_visual') expect(maquinas.has(m.ref!), m.id).toBe(true);
      if (m.kind === 'loja') expect(D.shopsById.has(m.ref!), m.id).toBe(true);
      if (m.kind === 'ponto_controle') expect(pcs.has(m.ref!), m.id).toBe(true);
      if (m.kind === 'masmorra') expect(D.dungeonsById.has(m.ref!), m.id).toBe(true);
      for (const e of enemiesOf(m)) expect(D.enemiesById.has(e), `${m.id} ${e}`).toBe(true);
    }
  });

  it('todo marcador fica em tile andável, com folga para o corpo', () => {
    for (const m of map.markers) {
      expect(isSolidTile(map, Math.floor(m.x), Math.floor(m.y)), m.id).toBe(false);
      expect(circleFree(map, m.x, m.y, R), m.id).toBe(true);
      for (const e of enemiesOf(m)) expect(circleFree(map, m.x, m.y, enemyById(e).raioCorpoTiles), `${m.id} ${e}`).toBe(true);
    }
  });

  it('tudo é alcançável a pé a partir de cada entrada', () => {
    for (const sp of byKind(map, 'spawn_jogador')) {
      const seen = reachable({ ...map, markers: [sp] });
      for (const m of map.markers) expect(seen[Math.floor(m.y) * map.width + Math.floor(m.x)], `${sp.id} -> ${m.id}`).toBe(1);
    }
    // e pelo A*, do spawn padrão, com o caminho chegando no ponto exato
    const s = spawnOf(map);
    for (const m of map.markers) {
      if (m === s) continue;
      const stats: PathStats = { expanded: 0, snapped: false };
      const p = findPath(map, s, m, R, { maxNodes: 80000, stats });
      expect(p, m.id).not.toBeNull();
      expect(stats.snapped, m.id).toBe(false);
      const last = p![p!.length - 1]!;
      expect(last.x).toBeCloseTo(m.x, 5);
      expect(last.y).toBeCloseTo(m.y, 5);
    }
  });

  it('a borda do mapa é sólida', () => {
    for (let x = 0; x < map.width; x++) {
      expect(isSolidTile(map, x, 0), `${x},0`).toBe(true);
      expect(isSolidTile(map, x, map.height - 1), `${x},${map.height - 1}`).toBe(true);
    }
    for (let y = 0; y < map.height; y++) {
      expect(isSolidTile(map, 0, y), `0,${y}`).toBe(true);
      expect(isSolidTile(map, map.width - 1, y), `${map.width - 1},${y}`).toBe(true);
    }
  });

  it('cada lugar e ponto de controle de regions.json (no piloto) tem marcador', () => {
    const reg = D.regionsById.get(id)!;
    const lugares = byKind(map, 'lugar');
    for (const p of reg.lugares) {
      if (!placeById(p).emPiloto) continue;
      expect(lugares.some((m) => m.ref === p), p).toBe(true);
    }
    for (const l of lugares) expect(placeById(l.ref!).regiao, l.id).toBe(id);
    for (const pc of reg.pontosDeControle ?? []) expect(byKind(map, 'ponto_controle').some((m) => m.ref === pc), pc).toBe(true);
  });

  it('os bandos são da região (ou sugestão marcada), com tamanho de enemies.json e nível nunca abaixo do base', () => {
    const bandos = byKind(map, 'bando');
    expect(bandos.length).toBeGreaterThanOrEqual(3);
    for (const b of bandos) {
      for (const e of P<string[]>(b, 'inimigos')) {
        const def = enemyById(e);
        expect(def.tier, b.id).toBe('normal');
        if (P(b, 'sugestao') !== true) expect(def.regioes, b.id).toContain(id);
        expect(P<number>(b, 'n'), b.id).toBeGreaterThanOrEqual(def.bando.min);
        expect(P<number>(b, 'n'), b.id).toBeLessThanOrEqual(def.bando.max);
        expect(P<number>(b, 'level'), b.id).toBeGreaterThanOrEqual(def.nivel);
      }
    }
    const afixos = new Set<string>(D.enemies.afixos.map((a) => a.id));
    for (const e of byKind(map, 'inimigo').filter((m) => P(m, 'tier') === 'elite')) {
      for (const a of P<string[]>(e, 'affixes')) {
        expect(afixos.has(a), `${e.id} ${a}`).toBe(true);
        expect((enemyById(e.ref!).afixosPossiveis as readonly string[]).includes(a), `${e.id} ${a}`).toBe(true);
      }
    }
  });
});

describe('saídas entre os mapas', () => {
  const all = listMaps().map((id) => getMap(id));

  it('toda saída aponta para um mapa e um spawn que existem', () => {
    for (const map of all) {
      for (const s of byKind(map, 'saida')) {
        if (P(s, 'travessia') === true) continue;
        const para = P<string>(s, 'para');
        expect(hasMap(para), `${map.id} ${s.id}`).toBe(true);
        expect(s.ref, s.id).toBe(resolveMapId(para));
        const destino = getMap(para);
        const sp = destino.markers.find((m) => m.id === P<string>(s, 'spawn'));
        expect(sp?.kind, `${map.id} ${s.id} -> ${para}:${P<string>(s, 'spawn')}`).toBe('spawn_jogador');
      }
    }
  });

  it('as ligações dos mapas novos vão e voltam e cada entrada é usada por uma saída', () => {
    const links = new Set<string>();
    for (const id of NOVOS) for (const s of byKind(getMap(id), 'saida')) links.add(`${id}>${P<string>(s, 'para')}`);
    for (const l of links) {
      const [a, b] = l.split('>') as [string, string];
      if (b === 'delta') continue; // o Delta só sai pela travessia
      expect(links.has(`${b}>${a}`), l).toBe(true);
    }
    for (const id of NOVOS) {
      for (const sp of byKind(getMap(id), 'spawn_jogador')) {
        if (sp.id === 'spawn') continue; // chegada da travessia e do barco
        const used = all.some((m) => byKind(m, 'saida').some((s) => resolveMapId(P<string>(s, 'para')) === id && P(s, 'spawn') === sp.id));
        expect(used, `${id}:${sp.id}`).toBe(true);
      }
    }
    // a margem esquerda liga no Juncal e na Usina; a direita também
    for (const m of ['margem_esquerda', 'margem_direita']) for (const d of ['juncal', 'usina_da_ponte']) expect(links.has(`${m}>${d}`), `${m}>${d}`).toBe(true);
  });

  it('a entrada fica longe da saída de volta (ninguém chega já saindo)', () => {
    for (const id of NOVOS) {
      const map = getMap(id);
      for (const sp of byKind(map, 'spawn_jogador')) for (const s of byKind(map, 'saida')) expect(Math.hypot(sp.x - s.x, sp.y - s.y), `${id} ${sp.id} ${s.id}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('treinadores e instituições', () => {
  const D = getData();

  it('os 24 treinadores aparecem, cada um no mapa da margem e na sede da instituição dele', () => {
    expect(D.trainers).toHaveLength(24);
    for (const t of D.trainers) {
      const mapId = t.side === 'esquerda' ? 'margem_esquerda' : 'margem_direita';
      const map = getMap(mapId);
      const ms = byKind(map, 'npc').filter((m) => m.ref === t.id);
      expect(ms, t.id).toHaveLength(1);
      const m = ms[0]!;
      expect(P(m, 'instituicao'), t.id).toBe(t.institution);
      expect(P(m, 'ala'), t.id).toBe(t.archetype);
      const inst = D.institutionsById.get(t.institution)!;
      expect(P(m, 'base'), t.id).toBe(inst.baseTrainer === t.id);
      // perto da porta da sede da instituição
      const sede = byKind(map, 'lugar').find((l) => P(l, 'instituicao') === t.institution)!;
      expect(sede, t.institution).toBeDefined();
      expect(Math.hypot(m.x - sede.x, m.y - sede.y), t.id).toBeLessThan(20);
    }
    // e nenhum treinador aparece em outro mapa
    for (const id of ['delta', 'usina_da_ponte', 'juncal']) {
      expect(byKind(getMap(id), 'npc').filter((m) => D.trainersById.has(m.ref!) && !D.npcsById.has(m.ref!)), id).toEqual([]);
    }
  });

  it('cada instituição tem quem recebe a base, loja e quadro de missões', () => {
    for (const inst of D.institutions.instituicoes) {
      const map = getMap(inst.margem === 'esquerda' ? 'margem_esquerda' : 'margem_direita');
      expect(byKind(map, 'npc').some((m) => m.ref === inst.baseTrainer && P(m, 'base') === true), inst.id).toBe(true);
      const shop = D.shops.lojas.find((s) => s.id === `loja_${inst.id}`);
      expect(shop, inst.id).toBeDefined();
      expect(byKind(map, 'loja').some((m) => m.ref === shop!.id), inst.id).toBe(true);
      expect(byKind(map, 'quadro_missoes').some((m) => P(m, 'instituicao') === inst.id), inst.id).toBe(true);
    }
  });
});

describe.each(MARGENS)('margem $id', ({ id, margem, qg, maquina, npcMaquina, tem, nao }) => {
  const map = getMap(id);
  const D = getData();
  const lugares = byKind(map, 'lugar');

  it('tem a paleta da margem', () => {
    const ts = new Set(map.tiles);
    for (const t of tem) expect(ts.has(t), Tile[t]).toBe(true);
    for (const t of nao) expect(ts.has(t), Tile[t]).toBe(false);
  });

  it('tem o QG e as 4 instituições como prédios com porta encostada no marcador', () => {
    expect(lugares.some((m) => m.ref === qg && P(m, 'qg') === qg)).toBe(true);
    const insts = D.places.filter((p) => (p.tipo === 'instituicao' || p.tipo === 'qg') && p.margem === margem && p.emPiloto);
    expect(insts).toHaveLength(5);
    for (const p of insts) {
      const m = lugares.find((l) => l.ref === p.id && (p.tipo === 'qg' ? P(l, 'qg') === qg : P(l, 'instituicao') === p.instituicao));
      expect(m, p.id).toBeDefined();
      const tx = Math.floor(m!.x), ty = Math.floor(m!.y);
      let porta = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (tileAt(map, tx + dx, ty + dy) === Tile.Porta) porta = true;
      expect(porta, p.id).toBe(true);
    }
    for (const l of lugares) expect(placeById(l.ref!).margem).toBe(margem);
  });

  it('tem a Máquina de Visual da margem com quem atende do lado, a loja do QG e o quadro de instituições', () => {
    const maq = byKind(map, 'maquina_visual');
    expect(maq.map((m) => m.ref)).toEqual([maquina]);
    expect(placeById(qg).maquinaDeVisual!.id).toBe(maquina);
    const n = byKind(map, 'npc').find((m) => m.ref === npcMaquina)!;
    expect(Math.hypot(n.x - maq[0]!.x, n.y - maq[0]!.y)).toBeLessThan(3);
    const hq = D.hqsById.get(qg)!;
    expect(byKind(map, 'loja').some((m) => m.ref === hq.loja)).toBe(true);
    expect(map.markers.some((m) => P(m, 'interagir') === 'quadro_de_instituicoes')).toBe(true);
    expect(byKind(map, 'moradia')).toHaveLength(1);
  });

  it('tem os NPCs da margem (npcs.json e a IA de facção do QG)', () => {
    const npcs = new Set(byKind(map, 'npc').map((m) => m.ref));
    for (const n of D.npcs.personagens) {
      if (!n.noPiloto || !n.regioes.includes(id) || n.id === 'eco') continue;
      expect(npcs.has(n.id), n.id).toBe(true);
    }
    for (const p of D.places.filter((x) => x.regiao === id && x.emPiloto)) for (const n of p.npcs ?? []) expect(npcs.has(n), `${p.id} ${n}`).toBe(true);
  });
});

describe('mapas da usina e do juncal', () => {
  it('a usina tem a entrada das Galerias, os dois postos da ponte e o cartaz de cada um', () => {
    const map = getMap('usina_da_ponte');
    expect(byKind(map, 'masmorra').map((m) => m.ref)).toEqual(['galerias_da_usina']);
    expect(byKind(map, 'ponto_controle').map((m) => m.ref).sort()).toEqual(['pc_ponte_direita', 'pc_ponte_esquerda']);
    expect(map.markers.filter((m) => P(m, 'interagir') === 'posto_de_controle_rival')).toHaveLength(2);
    // a esquerda fica a oeste e a direita a leste
    const se = map.markers.find((m) => m.id === 'saida_margem_esquerda')!, sd = map.markers.find((m) => m.id === 'saida_margem_direita')!;
    expect(se.x).toBeLessThan(sd.x);
    const npcs = new Set(byKind(map, 'npc').map((m) => m.ref));
    for (const n of ['dalva_rocha', 'cambista_da_ponte']) expect(npcs.has(n), n).toBe(true);
  });

  it('o juncal tem o Capataz, o contrabando e os inimigos da mata', () => {
    const map = getMap('juncal');
    const npcs = new Set(byKind(map, 'npc').map((m) => m.ref));
    for (const n of ['bruno_ferro', 'curupira', 'vendedor_de_chopindita_barata']) expect(npcs.has(n), n).toBe(true);
    expect(byKind(map, 'loja').map((m) => m.ref)).toEqual(['loja_contrabando_juncal']);
    const tipos = new Set(map.markers.flatMap(enemiesOf));
    for (const e of ['contrabandista', 'cao_de_guarda_do_capataz', 'cobra_do_juncal']) expect(tipos.has(e), e).toBe(true);
    // o elite rápido da missão de entrada da Brigada
    expect(byKind(map, 'inimigo').some((m) => m.ref === 'contrabandista' && P<string[]>(m, 'affixes').includes('rapido'))).toBe(true);
  });
});

describe('missões do piloto nas regiões novas', () => {
  const D = getData();
  const regs = new Set<string>(NOVOS);
  const missoes = D.missions.missoes.filter((m) => m.emPiloto && regs.has(m.regiao));
  const all = NOVOS.map((id) => getMap(id));
  const npcs = new Set(all.flatMap((m) => byKind(m, 'npc').map((x) => x.ref)));
  const alvos = new Set(all.flatMap((m) => m.markers.flatMap((x) => [x.id, x.ref, P<string>(x, 'interagir')].filter((v): v is string => typeof v === 'string'))));
  // npc de papel (resolvido em jogo, não é um marcador)
  const papeis = new Set(['guia', 'treinador_da_base', 'treinador_da_ala', 'quadro_de_missoes', 'ia_de_faccao']);

  it('lugares, NPCs, alvos de interagir e inimigos das missões existem nos mapas', () => {
    expect(missoes.length).toBeGreaterThanOrEqual(15);
    for (const mis of missoes) {
      const map = getMap(mis.regiao);
      const lugarRefs = new Set(byKind(map, 'lugar').map((m) => m.ref));
      if (mis.lugar && placeById(mis.lugar).regiao === mis.regiao) expect(lugarRefs.has(mis.lugar), `${mis.id} lugar ${mis.lugar}`).toBe(true);
      if (mis.dadaPor && !papeis.has(mis.dadaPor)) expect(npcs.has(mis.dadaPor), `${mis.id} dadaPor ${mis.dadaPor}`).toBe(true);
      for (const o of mis.objetivos as unknown as Record<string, unknown>[]) {
        const tag = `${mis.id} ${String(o['tipo'])}`;
        if ((o['tipo'] === 'falar' || o['tipo'] === 'entregar') && typeof o['npc'] === 'string' && !papeis.has(o['npc'])) expect(npcs.has(o['npc']), `${tag} ${o['npc']}`).toBe(true);
        if (o['tipo'] === 'interagir') expect(alvos.has(String(o['alvo'])), `${tag} ${String(o['alvo'])}`).toBe(true);
        if (o['tipo'] === 'derrotar') {
          const regiao = typeof o['regiao'] === 'string' ? o['regiao'] : mis.regiao;
          const tipos = new Set(getMap(regiao).markers.flatMap(enemiesOf));
          for (const alvo of o['inimigos'] as { inimigo: string }[]) expect(tipos.has(alvo.inimigo), `${tag} ${regiao} ${alvo.inimigo}`).toBe(true);
        }
      }
    }
  });
});
