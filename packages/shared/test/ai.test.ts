import { describe, expect, it } from 'vitest';
import { getData } from '../src/data';
import { circleFree } from '../src/map/grid';
import { findPath } from '../src/map/path';
import { getMap } from '../src/map/registry';
import { Tile } from '../src/map/types';
import {
  castAbility,
  createWorld,
  dealDamage,
  moveSpeedOf,
  pushFrom,
  spawnEnemy,
  spawnPlayer,
  step,
  stepN,
  type CombatEvent,
  type Entity,
  type Telegraph,
  type World,
} from '../src/sim';
import { enemyMind, spawnPack, AI_TUNING } from '../src/sim/ai';
import { profileOf } from '../src/sim/ai_kit';
import { arena, fill, freeze } from '../src/sim/testkit';

const statusOf = (e: Entity, kind: string) => e.statuses.find((s) => s.kind === kind);
const gap = (a: Entity, b: Entity) => Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius;
/** Jogador parado que não bate (para medir só a IA). */
function dummy(w: World, x: number, y: number, name = 'Alvo'): Entity {
  const p = spawnPlayer(w, { name, archetypeId: 'peao_brabo', x, y });
  p.hp = p.stats.hpMax = 100000;
  p.loadout!.basico = '';
  return p;
}

describe('IA: percepção, perseguição e coleira', () => {
  it('inimigo acorda ao ver o jogador e persegue; longe, continua dormindo', () => {
    const w = createWorld(arena(50, 30), 1);
    const p = dummy(w, 10, 15);
    const perto = spawnEnemy(w, 'capanga_do_capataz', 16, 15);
    const longe = spawnEnemy(w, 'capanga_do_capataz', 30, 15);
    const evs = stepN(w, 40);
    expect(enemyMind(perto).state).toBe('combate');
    expect(perto.targetId).toBe(p.id);
    expect(gap(perto, p)).toBeLessThan(2.6); // encostou (a Cobrança Amigável empurra 1,5 tile)
    expect(evs.some((e) => e.t === 'hit' && e.src === perto.id && e.dst === p.id)).toBe(true);
    expect(enemyMind(longe).state).toBe('dormindo');
    expect(longe.x).toBeCloseTo(30, 5);
  });

  it('não vê atrás de parede, mas acorda quando apanha', () => {
    const m = arena(50, 30);
    fill(m, 13, 10, 13, 20, Tile.Parede);
    const w = createWorld(m, 1);
    w.pathfinder = findPath;
    const p = dummy(w, 10, 15);
    const s = spawnEnemy(w, 'capanga_do_capataz', 16, 15);
    stepN(w, 20);
    expect(enemyMind(s).state).toBe('dormindo');
    dealDamage(w, p, s, 0, { raw: 3 });
    stepN(w, 2);
    expect(enemyMind(s).state).toBe('combate');
    expect(enemyMind(s).chaseId).toBe(p.id); // persegue mesmo sem ver (o alvo travado só vale à vista)
    stepN(w, 120);
    expect(gap(s, p)).toBeLessThan(2.6); // contornou a parede pelo caminho
  });

  it('coleira: puxado longe demais, volta para casa imune, curando, e chega com a vida cheia', () => {
    const w = createWorld(arena(60, 30), 2);
    const p = dummy(w, 10, 15);
    const s = spawnEnemy(w, 'capanga_do_capataz', 5, 15);
    s.hp = s.stats.hpMax * 0.5;
    stepN(w, 5);
    expect(enemyMind(s).state).toBe('combate');
    // o jogador foge mais rápido que o capanga pela arena afora
    let backed = false;
    let missWhileBack = false;
    const evs: CombatEvent[] = [];
    for (let i = 0; i < 400; i++) {
      if (p.x < 55) p.x += 0.3;
      evs.push(...step(w));
      if (enemyMind(s).state === 'voltando') {
        backed = true;
        if (!missWhileBack) {
          w.events = [];
          dealDamage(w, p, s, 1);
          missWhileBack = w.events.some((e) => e.t === 'miss' && e.dst === s.id);
          expect(statusOf(s, 'voltando')).toBeDefined();
        }
      }
      if (backed && enemyMind(s).state === 'dormindo') break;
    }
    expect(backed).toBe(true);
    expect(missWhileBack).toBe(true); // voltando, não leva dano
    expect(enemyMind(s).state).toBe('dormindo');
    expect(Math.hypot(s.x - 5, s.y - 15)).toBeLessThan(0.5);
    expect(s.hp).toBe(s.stats.hpMax);
    expect(statusOf(s, 'imune')).toBeUndefined();
    expect(evs.some((e) => e.t === 'heal' && e.dst === s.id)).toBe(true);
  });

  it('à distância mantém o alcance e não encosta', () => {
    const w = createWorld(arena(40, 30), 3);
    const p = dummy(w, 10, 15);
    const c = spawnEnemy(w, 'cobrador_do_capataz', 16, 15, { affixes: [] });
    const evs = stepN(w, 80);
    expect(evs.some((e) => e.t === 'cast' && e.src === c.id)).toBe(true);
    expect(gap(c, p)).toBeLessThanOrEqual(4);
    expect(gap(c, p)).toBeGreaterThan(1.5);
  });

  it('imóvel não sai do lugar; só na água não sai da água', () => {
    const m = arena(40, 30);
    fill(m, 1, 10, 38, 12, Tile.AguaRasa);
    const w = createWorld(m, 4);
    const p = dummy(w, 20, 16);
    const tur = spawnEnemy(w, 'turbina_desgovernada', 24, 18);
    const eng = spawnEnemy(w, 'enguia_eletrica', 20, 11);
    for (let i = 0; i < 120; i++) {
      step(w);
      expect(m.tiles[Math.floor(eng.y) * m.width + Math.floor(eng.x)]).toBe(Tile.AguaRasa);
    }
    expect(tur.x).toBe(24);
    expect(tur.y).toBe(18);
    expect(enemyMind(eng).state).toBe('combate');
    expect(eng.y).toBeGreaterThan(11.5); // foi até a beira, do lado do jogador
    void p;
  });
});

describe('IA: bando', () => {
  it('quem apanha puxa o bando todo (mesmo packId); quem é de fora continua dormindo', () => {
    const w = createWorld(arena(50, 40), 5);
    const p = dummy(w, 8, 15);
    const pack = spawnPack(w, 'siri_do_mangue', 22, 15, { n: 3, eliteChance: 0 });
    const fora = spawnEnemy(w, 'siri_do_mangue', 22, 19); // perto, mas sem bando
    expect(pack).toHaveLength(3);
    expect(new Set(pack.map((e) => enemyMind(e).packId)).size).toBe(1);
    stepN(w, 10);
    expect(pack.every((e) => enemyMind(e).state === 'dormindo')).toBe(true);
    dealDamage(w, p, pack[1]!, 0, { raw: 1 });
    stepN(w, 2);
    for (const e of pack) {
      expect(enemyMind(e).state).toBe('combate');
      expect(enemyMind(e).chaseId).toBe(p.id);
    }
    expect(enemyMind(fora).state).toBe('dormindo');
  });

  it('sem bando, o chamado vale para quem está a até packCallRadius', () => {
    const w = createWorld(arena(50, 40), 5);
    const p = dummy(w, 8, 15);
    const a = spawnEnemy(w, 'capanga_do_capataz', 22, 15);
    const b = spawnEnemy(w, 'capanga_do_capataz', 22 + AI_TUNING.packCallRadius - 1, 15);
    const c = spawnEnemy(w, 'capanga_do_capataz', 22, 15 + AI_TUNING.packCallRadius + 4);
    dealDamage(w, p, a, 0, { raw: 1 });
    stepN(w, 2);
    expect(enemyMind(a).state).toBe('combate');
    expect(enemyMind(b).state).toBe('combate');
    expect(enemyMind(c).state).toBe('dormindo');
  });

  it('escolta nasce com o elite e acompanha quem protege', () => {
    const w = createWorld(arena(50, 40), 6);
    const pack = spawnPack(w, 'cobrador_do_capataz', 25, 20);
    const lead = pack[0]!;
    expect(lead.defId).toBe('cobrador_do_capataz');
    const esc = pack.filter((e) => e.defId === 'capanga_do_capataz');
    expect(esc).toHaveLength(2);
    for (const e of esc) expect(enemyMind(e).leaderId).toBe(lead.id);
    lead.x = 32;
    lead.spawnX = 32;
    freeze(lead);
    stepN(w, 80);
    for (const e of esc) expect(Math.hypot(e.x - lead.x, e.y - lead.y)).toBeLessThan(3.2);
  });
});

describe('IA: chefe', () => {
  function bossFight(seed: number) {
    const w = createWorld(arena(40, 40), seed);
    const p = dummy(w, 21.3, 20);
    const boss = spawnEnemy(w, 'bruno_ferro_chefe', 20, 20);
    return { w, p, boss };
  }

  it('todo ataque em área do chefe tem aviso no chão de pelo menos 800 ms', () => {
    const min = getData().enemies.regrasChefe.avisoMinMs;
    expect(min).toBeGreaterThanOrEqual(800);
    for (const def of getData().enemiesById.values()) {
      if (def.tier !== 'chefe') continue;
      for (const id of [...def.habilidades, ...(def.fases ?? []).flatMap((f) => f.habilidades)]) {
        const a = getData().abilities.get(id)!;
        if (a.type !== 'travada' && profileOf(id)!.damage > 0) expect(a.telegraphMs, id).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it('solta o aviso com antecedência; quem sai da área não leva dano, quem fica leva', () => {
    for (const fica of [false, true]) {
      const { w, p, boss } = bossFight(7);
      let tel: Telegraph | undefined;
      for (let i = 0; i < 100 && !tel; i++) {
        for (const e of step(w)) if (e.t === 'telegraph' && e.tel.sourceId === boss.id) tel = e.tel;
      }
      expect(tel).toBeDefined();
      expect((tel!.impactTick - tel!.startTick) * 50).toBeGreaterThanOrEqual(800);
      if (!fica) p.x = tel!.x + tel!.radius + 3; // sai do círculo
      const evs = stepN(w, tel!.impactTick - w.tick + 2);
      const levou = evs.some((e) => e.t === 'hit' && e.dst === p.id && e.ability === tel!.abilityId);
      expect(levou).toBe(fica);
      // parado durante o aviso
      expect(Math.hypot(boss.x - 20, boss.y - 20)).toBeLessThan(0.6);
    }
  });

  it('respeita a provocação mesmo com o controle virando lentidão', () => {
    const w = createWorld(arena(40, 40), 8);
    const boss = spawnEnemy(w, 'bruno_ferro_chefe', 20, 20);
    const longe = dummy(w, 20, 24, 'Longe');
    const peao = spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', x: 21.6, y: 20 });
    dealDamage(w, longe, boss, 0, { raw: 5 });
    stepN(w, 3);
    expect(boss.targetId).toBe(longe.id);
    w.events = [];
    expect(castAbility(w, peao, 'segura_o_peao')).toBe(true);
    expect(w.events.some((e) => e.t === 'cc_slow' && e.dst === boss.id)).toBe(true);
    expect(statusOf(boss, 'provocar')).toBeUndefined();
    dealDamage(w, longe, boss, 0, { raw: 5 }); // apanhou de outro, mas a provocação manda
    stepN(w, 2);
    expect(boss.targetId).toBe(peao.id);
  });

  it('derrubou o jogador: solta a fala aoDerrotarJogador e procura outro alvo', () => {
    const { w, p, boss } = bossFight(10);
    stepN(w, 6);
    expect(enemyMind(boss).chaseId).toBe(p.id);
    dealDamage(w, boss, p, 0, { raw: p.hp + 1 });
    const evs = stepN(w, 2);
    const falas = getData().enemiesById.get('bruno_ferro_chefe')!.falas!.aoDerrotarJogador!;
    expect(evs.some((e) => e.t === 'say' && e.src === boss.id && falas.includes(e.text))).toBe(true);
    expect(enemyMind(boss).chaseId).not.toBe(p.id);
  });

  it('troca de fase pela vida: fala, reforços acordados no mesmo alvo e habilidades da fase', () => {
    const { w, p, boss } = bossFight(9);
    stepN(w, 5);
    boss.hp = boss.stats.hpMax * 0.6;
    const evs = stepN(w, 2);
    const fase = getData().enemiesById.get('bruno_ferro_chefe')!.fases![1]!;
    expect(evs.some((e) => e.t === 'say' && e.src === boss.id && e.text === fase.fala)).toBe(true);
    const capangas = Array.from(w.entities.values()).filter((e) => e.defId === 'capanga_do_capataz');
    expect(capangas).toHaveLength(2);
    for (const c of capangas) {
      expect(enemyMind(c).state).toBe('combate');
      expect(c.targetId).toBe(p.id);
    }
    expect((boss.ai as { abilities: string[] }).abilities).toEqual(fase.habilidades);
  });
});

describe('IA: afixos de elite', () => {
  function pair(affix: string, seed = 10) {
    const w = createWorld(arena(40, 30), seed);
    const p = dummy(w, 5, 5);
    const normal = spawnEnemy(w, 'capanga_do_capataz', 20, 10, { affixes: [] });
    const elite = spawnEnemy(w, 'capanga_do_capataz', 20, 20, { tier: 'elite', affixes: [affix] });
    w.events = [];
    step(w);
    return { w, p, normal, elite, evs: w.events };
  }

  it('cada afixo aparece como estado (evento status) quando a IA começa', () => {
    for (const id of ['rapido', 'blindado', 'explode_ao_morrer', 'cura_os_outros']) {
      const { elite, normal, evs } = pair(id);
      expect(statusOf(elite, `afixo:${id}`), id).toBeDefined();
      expect(statusOf(normal, `afixo:${id}`)).toBeUndefined();
      expect(evs.some((e) => e.t === 'status' && e.dst === elite.id && e.kind === `afixo:${id}` && e.on)).toBe(true);
    }
  });

  it('rápido: anda 40% mais rápido e bate mais rápido', () => {
    const { normal, elite } = pair('rapido');
    expect(moveSpeedOf(elite)).toBeCloseTo(moveSpeedOf(normal) * 1.4, 5);
    expect(elite.stats.pct['attackSpeed']).toBeCloseTo(0.3);
  });

  it('blindado: recebe 40% menos dano e não é empurrado', () => {
    const { w, p, normal, elite } = pair('blindado');
    let dn = 0, de = 0;
    for (let i = 0; i < 20; i++) {
      normal.hp = elite.hp = 1e6;
      dn += dealDamage(w, p, normal, 3, { noCrit: true });
      de += dealDamage(w, p, elite, 3, { noCrit: true });
    }
    // a defesa do elite também é maior (promocaoElite): compara com a mesma defesa
    const K = 16 + 1.2 * p.level;
    const defRatio = (K + normal.stats.defense) / (K + elite.stats.defense);
    expect(de / dn).toBeCloseTo(0.6 * defRatio, 1);
    const x = elite.x;
    pushFrom(w, elite, elite.x - 1, elite.y, 3);
    expect(elite.x).toBe(x);
  });

  it('explode ao morrer: aviso no chão de 1,2 s e só quem ficou no raio apanha', () => {
    const w = createWorld(arena(40, 30), 11);
    const dentro = dummy(w, 21.5, 15, 'Dentro');
    const fora = dummy(w, 25, 15, 'Fora');
    const e = spawnEnemy(w, 'capanga_do_capataz', 20, 15, { tier: 'elite', affixes: ['explode_ao_morrer'] });
    step(w);
    expect(statusOf(e, 'afixo:explode_ao_morrer')).toBeDefined();
    w.events = [];
    dealDamage(w, dentro, e, 0, { raw: e.hp + 1 });
    const tel = w.events.find((x): x is Extract<CombatEvent, { t: 'telegraph' }> => x.t === 'telegraph')?.tel;
    expect(tel).toBeDefined();
    expect((tel!.impactTick - tel!.startTick) * 50).toBe(1200);
    const evs = stepN(w, 26);
    expect(evs.some((x) => x.t === 'hit' && x.dst === dentro.id && x.ability === 'afixo_explode_ao_morrer')).toBe(true);
    expect(evs.some((x) => x.t === 'hit' && x.dst === fora.id)).toBe(false);
  });

  it('cura os outros: a cada 6 s cura os aliados feridos em volta', () => {
    const w = createWorld(arena(40, 30), 12);
    dummy(w, 3, 3);
    const healer = spawnEnemy(w, 'capanga_do_capataz', 20, 15, { tier: 'elite', affixes: ['cura_os_outros'] });
    const ferido = spawnEnemy(w, 'capanga_do_capataz', 22, 15);
    ferido.hp = ferido.stats.hpMax * 0.5;
    const hp0 = ferido.hp;
    const evs = stepN(w, 20 * 6 + 2);
    expect(evs.some((e) => e.t === 'heal' && e.src === healer.id && e.dst === ferido.id)).toBe(true);
    expect(ferido.hp).toBeGreaterThan(hp0);
  });
});

describe('IA: mapa do protótipo', () => {
  it('bandos, elite e chefe dos marcadores rodam 60 s com o jogador no automático', () => {
    const map = getMap('prototipo_delta');
    const w = createWorld(map, 21);
    w.pathfinder = findPath;
    for (const mk of map.markers) {
      if (mk.kind === 'bando') {
        const ids = (mk.params?.['inimigos'] as string[] | undefined) ?? [];
        spawnPack(w, ids[0]!, mk.x, mk.y, { n: Number(mk.params?.['n'] ?? 3) });
      } else if (mk.kind === 'inimigo') {
        const affixes = mk.params?.['affixes'] as string[] | undefined;
        spawnPack(w, mk.ref!, mk.x, mk.y, { n: 1, eliteChance: 0 });
        if (affixes) expect(affixes.length).toBeGreaterThan(0);
      } else if (mk.kind === 'chefe') spawnEnemy(w, mk.ref!, mk.x, mk.y);
    }
    // começa perto do bando de siris do lamaçal, num ponto livre
    const mk = map.markers.find((m) => m.id === 'bando_siri_lamacal')!;
    let px = mk.x + 5, py = mk.y;
    for (let k = 0; k < 40 && !circleFree(map, px, py, 0.4); k++) {
      px = mk.x + 5 + Math.cos(k) * (k / 8);
      py = mk.y + Math.sin(k) * (k / 8);
    }
    const p = spawnPlayer(w, { name: 'Ana', archetypeId: 'idol', x: px, y: py, playerId: 'p1' });
    p.auto = true;
    p.hp = p.stats.hpMax = 5000;
    // bate fraco, para o bando viver o bastante para revidar (com a dificuldade baixa, morria antes)
    p.stats.attack = 1;
    const evs = stepN(w, 20 * 60);
    expect(evs.some((e) => e.t === 'hit' && e.src === p.id)).toBe(true);
    expect(evs.some((e) => e.t === 'hit' && e.dst === p.id)).toBe(true);
    // ninguém atravessou parede
    for (const e of w.entities.values()) if (e.kind === 'enemy' || e.kind === 'player') expect(circleFree(map, e.x, e.y, e.radius * 0.9)).toBe(true);
  });
});

describe('IA: desempenho', () => {
  it('dormindo longe de jogadores não pensa; o caminho tem orçamento por tick', () => {
    const m = arena(80, 40);
    fill(m, 30, 5, 30, 35, Tile.Parede);
    const w = createWorld(m, 13);
    let calls = 0;
    let perTick = 0, maxPerTick = 0, lastTick = -1;
    w.pathfinder = (map, from, to, r) => {
      calls++;
      if (w.tick !== lastTick) {
        lastTick = w.tick;
        perTick = 0;
      }
      perTick++;
      maxPerTick = Math.max(maxPerTick, perTick);
      return findPath(map, from, to, r);
    };
    // 30 inimigos longe de todo mundo
    for (let i = 0; i < 30; i++) spawnEnemy(w, 'siri_do_mangue', 60 + (i % 10), 5 + Math.floor(i / 10) * 3);
    stepN(w, 40);
    expect(calls).toBe(0);
    // 20 acordados atrás de uma parede: todos querem caminho no mesmo tick
    const p = dummy(w, 25, 20);
    for (let i = 0; i < 20; i++) {
      const e = spawnEnemy(w, 'capanga_do_capataz', 34 + (i % 5), 12 + Math.floor(i / 5) * 4);
      dealDamage(w, p, e, 0, { raw: 1 });
    }
    stepN(w, 30);
    expect(calls).toBeGreaterThan(0);
    expect(maxPerTick).toBeLessThanOrEqual(AI_TUNING.pathBudgetPerTick);
  });
});
