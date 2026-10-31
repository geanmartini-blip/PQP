import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  applyInput,
  createWorld,
  dealDamage,
  spawnAlly,
  spawnEnemy,
  spawnPlayer,
  step,
  stepN,
  type DoctrineCard,
  type Entity,
  type World,
} from '../src/sim';
import { defaultDoctrine, doctrineFor, doctrineForArchetype, leaderOf } from '../src/sim/doctrine';
import { arena, freeze } from '../src/sim/testkit';

const gap = (a: Entity, b: Entity) => Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius;

function auto(w: World, archetypeId: string, x: number, y: number, cards?: DoctrineCard[], name = 'Auto'): Entity {
  const p = spawnPlayer(w, { name, archetypeId, x, y, playerId: name });
  if (cards) applyCommand(w, p, { id: 1, c: 'doutrina', cards });
  applyCommand(w, p, { id: 2, c: 'auto', on: true });
  return p;
}

/** Inimigo parado e forte, para medir só a Doutrina. */
function saco(w: World, x: number, y: number): Entity {
  const s = spawnEnemy(w, 'turbina_desgovernada', x, y);
  freeze(s);
  s.hp = s.stats.hpMax = 1e6;
  s.ai = { ...s.ai, abilities: [], basic: '' };
  return s;
}

describe('Doutrina: cartas', () => {
  it('carta de vida baixa faz fugir (por no máximo 3 s)', () => {
    const w = createWorld(arena(40, 30), 1);
    // O Fiel não tem cura em si (a Respiração do Iogue curaria e acabaria a fuga)
    const p = auto(w, 'o_fiel', 15, 15, [{ se: { t: 'minha_vida_abaixo', pct: 30 }, faca: { t: 'fugir' } }]);
    const s = saco(w, 16.5, 15);
    p.hp = p.stats.hpMax * 0.2;
    const d0 = gap(p, s);
    stepN(w, 30);
    expect(gap(p, s)).toBeGreaterThan(d0 + 2.5);
    // depois da janela de fuga, volta a lutar
    stepN(w, 110);
    expect(gap(p, s)).toBeLessThan(1.2);
  });

  it('curar_aliado cura o mais ferido do grupo', () => {
    const w = createWorld(arena(40, 30), 2);
    const cur = auto(w, 'curandeira_dos_andes', 15, 15, [{ se: { t: 'aliado_vida_abaixo', pct: 70 }, faca: { t: 'curar_aliado' } }]);
    const a = spawnPlayer(w, { name: 'A', archetypeId: 'peao_brabo', x: 11.5, y: 15 });
    const b = spawnPlayer(w, { name: 'B', archetypeId: 'peao_brabo', x: 18.5, y: 15 });
    a.hp = a.stats.hpMax * 0.6;
    b.hp = b.stats.hpMax * 0.3;
    a.lastCombatTick = b.lastCombatTick = 1e9; // sem regeneração fora de combate no teste
    const ha = a.hp, hb = b.hp;
    stepN(w, 25);
    // Água da Nascente caiu em cima de B (o mais ferido), longe de A
    const zone = w.zones.find((z) => z.abilityId === 'agua_da_nascente');
    expect(zone).toBeDefined();
    expect(Math.hypot(zone!.x - b.x, zone!.y - b.y)).toBeLessThan(0.5);
    expect(b.hp).toBeGreaterThan(hb);
    expect(a.hp).toBe(ha);
    void cur;
  });

  it('curar_aliado com cura em aliado (Detox) vai no mais ferido', () => {
    const w = createWorld(arena(40, 30), 3);
    const coach = auto(w, 'coach_de_bem_estar', 15, 15, [{ se: { t: 'aliado_vida_abaixo', pct: 70 }, faca: { t: 'curar_aliado' } }]);
    coach.cooldowns['vibracoes_positivas'] = 1e9; // só o Detox
    const a = spawnPlayer(w, { name: 'A', archetypeId: 'peao_brabo', x: 13, y: 15 });
    const b = spawnPlayer(w, { name: 'B', archetypeId: 'peao_brabo', x: 17, y: 15 });
    a.hp = a.stats.hpMax * 0.6;
    b.hp = b.stats.hpMax * 0.3;
    stepN(w, 3);
    expect(b.shield).toBeGreaterThan(0);
    expect(a.shield).toBe(0);
  });

  it('levantar_aliado vai até o caído e levanta', () => {
    const w = createWorld(arena(40, 30), 4);
    const p = auto(w, 'idol', 10, 10, [{ se: { t: 'aliado_caido_perto' }, faca: { t: 'levantar_aliado' } }]);
    const amigo = spawnPlayer(w, { name: 'Amigo', archetypeId: 'peao_brabo', x: 15, y: 12 });
    const s = spawnEnemy(w, 'capanga_do_capataz', 35, 25);
    dealDamage(w, s, amigo, 0, { raw: amigo.hp + 1 });
    expect(amigo.downedUntil).toBeDefined();
    const evs = stepN(w, 20 * 6);
    expect(evs.some((e) => e.t === 'revive' && e.dst === amigo.id && e.by === p.id)).toBe(true);
  });

  it('Especial guardado para o chefe: a rotina não gasta em inimigo comum', () => {
    const w = createWorld(arena(40, 30), 5);
    const p = auto(w, 'peao_brabo', 10, 15, [{ se: { t: 'alvo_e_chefe' }, faca: { t: 'usar_especial' } }]);
    const s = saco(w, 11.5, 15);
    p.special = 1;
    stepN(w, 40);
    expect(p.special).toBe(1);
    w.entities.delete(s.id);
    const boss = spawnEnemy(w, 'bruno_ferro_chefe', 11.8, 15);
    freeze(boss);
    const evs = stepN(w, 10);
    expect(evs.some((e) => e.t === 'cast' && e.src === p.id && e.ability === p.loadout!.especial)).toBe(true);
  });

  it('a primeira carta que vale age; as de baixo não', () => {
    const w = createWorld(arena(40, 30), 6);
    const p = auto(w, 'idol', 10, 15, [
      { se: { t: 'minha_vida_abaixo', pct: 50 }, faca: { t: 'usar_item' } },
      { se: { t: 'sempre' }, faca: { t: 'usar_item' } },
    ]);
    const n = p.loadout!.itemCount!;
    step(w);
    // vida cheia: a primeira não vale, a segunda vale e usa
    expect(p.loadout!.itemCount).toBe(n - 1);
  });
});

describe('Doutrina: modo automático e companheiros', () => {
  it('automático anda até o alcance, foca e usa os botões', () => {
    const w = createWorld(arena(40, 30), 7);
    const p = auto(w, 'idol', 8, 15);
    const s = saco(w, 15, 15);
    const evs = stepN(w, 20 * 12);
    expect(gap(p, s)).toBeLessThanOrEqual(4);
    const used = new Set(evs.filter((e) => e.t === 'cast' && e.src === p.id).map((e) => (e as { ability: string }).ability));
    expect(used.has('basico_mascarado')).toBe(true);
    expect(used.has(p.loadout!.b1) || used.has(p.loadout!.b2) || used.has(p.loadout!.b3)).toBe(true);
  });

  it('joystick do jogador manda no movimento', () => {
    const w = createWorld(arena(40, 30), 8);
    const p = auto(w, 'idol', 8, 15);
    saco(w, 15, 15);
    applyInput(w, p, { seq: 1, mx: 0, my: 127 });
    stepN(w, 20);
    expect(p.x).toBeCloseTo(8, 5);
    expect(p.y).toBeGreaterThan(17);
  });

  it('companheiro segue o líder e luta junto', () => {
    const w = createWorld(arena(50, 30), 9);
    const p = spawnPlayer(w, { name: 'Ana', archetypeId: 'idol', x: 10, y: 15, playerId: 'p1' });
    const wes = spawnAlly(w, 'wesley', 9, 15, { archetypeId: 'peao_brabo', level: 12 });
    expect(leaderOf(w, wes)?.id).toBe(p.id);
    p.x = 25;
    stepN(w, 100);
    expect(Math.hypot(wes.x - p.x, wes.y - p.y)).toBeLessThan(3);
    const s = spawnEnemy(w, 'siri_do_mangue', 29, 15);
    s.hp = s.stats.hpMax = 500;
    const evs = stepN(w, 80);
    expect(evs.some((e) => e.t === 'hit' && e.src === wes.id && e.dst === s.id)).toBe(true);
  });

  it('companheiro não corre atrás de alvo longe do líder', () => {
    const w = createWorld(arena(60, 30), 10);
    const p = spawnPlayer(w, { name: 'Ana', archetypeId: 'idol', x: 10, y: 15, playerId: 'p1' });
    const wes = spawnAlly(w, 'wesley', 22, 15, { archetypeId: 'peao_brabo', level: 12 });
    const s = saco(w, 29, 15);
    stepN(w, 60);
    expect(wes.targetId).not.toBe(s.id);
    expect(Math.hypot(wes.x - p.x, wes.y - p.y)).toBeLessThan(4);
  });

  it('grupo: o jogador ao vivo de menor id lidera; plantonista segue', () => {
    const w = createWorld(arena(40, 30), 11);
    const a = spawnPlayer(w, { name: 'A', archetypeId: 'idol', x: 10, y: 10 });
    const b = spawnPlayer(w, { name: 'B', archetypeId: 'peao_brabo', x: 12, y: 10 });
    a.partyId = b.partyId = 'g1';
    b.onDuty = true;
    b.auto = true;
    expect(leaderOf(w, a)).toBeUndefined();
    expect(leaderOf(w, b)?.id).toBe(a.id);
  });
});

describe('Doutrina padrão', () => {
  it('por papel, até 5 cartas, com os botões do arquétipo', () => {
    const tanque = doctrineForArchetype('peao_brabo');
    const cura = doctrineForArchetype('curandeira_dos_andes');
    const dano = doctrineForArchetype('cowboy_cromado');
    const suporte = doctrineForArchetype('idol');
    for (const d of [tanque, cura, dano, suporte]) expect(d.length).toBeLessThanOrEqual(5);
    expect(tanque.some((c) => c.faca.t === 'levantar_aliado')).toBe(true);
    expect(tanque.some((c) => c.faca.t === 'focar_mais_perto')).toBe(true);
    expect(tanque.some((c) => c.se.t === 'inimigos_perto_min' && c.faca.t === 'usar_botao' && c.faca.botao === 1)).toBe(true); // Segura o Peão
    expect(cura[0]).toEqual({ se: { t: 'aliado_vida_abaixo', pct: 40 }, faca: { t: 'curar_aliado' } });
    expect(dano.some((c) => c.se.t === 'minha_vida_abaixo' && c.se.pct === 25 && c.faca.t === 'fugir')).toBe(true);
    expect(suporte.some((c) => c.faca.t === 'seguir_grupo')).toBe(true);
  });

  it('sem cartas próprias, vale a padrão; com cartas, só as do jogador', () => {
    const w = createWorld(arena(), 12);
    const p = spawnPlayer(w, { name: 'A', archetypeId: 'babushka', x: 5, y: 5 });
    expect(doctrineFor(p)).toEqual(defaultDoctrine(p));
    applyCommand(w, p, { id: 1, c: 'doutrina', cards: [{ se: { t: 'sempre' }, faca: { t: 'focar_mais_fraco' } }] });
    expect(doctrineFor(p)).toHaveLength(1);
    // poção automática só quando ligada
    expect(defaultDoctrine(p).some((c) => c.faca.t === 'usar_item')).toBe(false);
    expect(defaultDoctrine(p, { pocaoAuto: true }).some((c) => c.faca.t === 'usar_item' && c.se.t === 'minha_vida_abaixo' && c.se.pct === 30)).toBe(true);
  });
});
