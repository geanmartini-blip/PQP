import { describe, expect, it } from 'vitest';
import { quantizeAxis } from '../src/net/protocol';
import {
  applyCommand,
  applyInput,
  castAbility,
  createWorld,
  spawnAlly,
  spawnEnemy,
  spawnPlayer,
  step,
  stepN,
  type Entity,
  type World,
} from '../src/sim';
import { arena, freeze, worldDigest } from '../src/sim/testkit';

const statusOf = (e: Entity, kind: string) => e.statuses.find((s) => s.kind === kind);

/** Cena com jogador no automático, companheiro, bando, elite com afixos sorteados e chefe. */
function scenario(seed: number): World {
  const w = createWorld(arena(40, 40), seed);
  const p = spawnPlayer(w, { name: 'Ana', archetypeId: 'idol', x: 8, y: 20, playerId: 'p1' });
  p.auto = true;
  spawnAlly(w, 'wesley', 7, 21, { archetypeId: 'peao_brabo', level: 12 });
  for (let i = 0; i < 4; i++) spawnEnemy(w, 'siri_do_mangue', 14 + i, 18 + (i % 2) * 3);
  spawnEnemy(w, 'cobrador_do_capataz', 18, 20); // elite: afixo sorteado pelo RNG do mundo
  spawnEnemy(w, 'capanga_do_capataz', 16, 23, { tier: 'elite' });
  spawnEnemy(w, 'bruno_ferro_chefe', 30, 20);
  return w;
}

/** Roteiro de entradas fixo (joystick e comandos). */
function drive(w: World, ticks: number): void {
  const p = Array.from(w.entities.values()).find((e) => e.playerId === 'p1')!;
  let cmd = 1;
  for (let t = 0; t < ticks; t++) {
    const ang = t * 0.05;
    if (t % 60 < 20) applyInput(w, p, { seq: t, mx: quantizeAxis(Math.cos(ang)), my: quantizeAxis(Math.sin(ang)) });
    else applyInput(w, p, { seq: t, mx: 0, my: 0 });
    if (t % 45 === 10) applyCommand(w, p, { id: cmd++, c: 'habilidade', botao: 1 });
    if (t % 70 === 30) applyCommand(w, p, { id: cmd++, c: 'habilidade', botao: 2 });
    if (t % 90 === 50) applyCommand(w, p, { id: cmd++, c: 'habilidade', botao: 'especial' });
    step(w);
  }
}

describe('determinismo', () => {
  it('mesma semente e mesmas entradas dão o mesmo estado', () => {
    const a = scenario(1234), b = scenario(1234);
    drive(a, 600);
    drive(b, 600);
    expect(worldDigest(a)).toBe(worldDigest(b));
    // e a luta aconteceu de verdade
    expect(a.tick).toBe(600);
  });

  it('semente diferente muda o resultado (críticos, variação, afixos)', () => {
    const a = scenario(1), b = scenario(2);
    drive(a, 300);
    drive(b, 300);
    expect(worldDigest(a)).not.toBe(worldDigest(b));
  });
});

describe('compensação de atraso (200 ms de ping)', () => {
  /** Idol em (5, 15); siri parado na distância (borda a borda) `before` por 6 ticks e depois em 7. */
  function setup(before: number) {
    const w = createWorld(arena(), 7);
    const p = spawnPlayer(w, { name: 'Li', archetypeId: 'idol', x: 5, y: 15 });
    const s = spawnEnemy(w, 'turbina_desgovernada', 5 + p.radius + 0.9 + before, 15);
    freeze(s);
    s.hp = s.stats.hpMax = 9999;
    stepN(w, 6);
    s.x = 5 + p.radius + s.radius + 7; // agora está longe
    step(w);
    p.targetId = s.id;
    return { w, p, s };
  }

  it('alvo que saiu 0,8 tile do alcance há 200 ms ainda é acertado', () => {
    const { w, p, s } = setup(4 + 0.8);
    expect(applyCommand(w, p, { id: 1, c: 'habilidade', botao: 3 }, { rewindTicks: 4 })).toBe(true); // botão 3: Maldição ou Vírus (travada, 4 tiles)
    expect(p.loadout?.b3).toBe('maldicao_ou_virus');
    expect(statusOf(s, 'dano_continuo')).toBeDefined();
    expect(p.pendingCast).toBeUndefined();
  });

  it('a 2 tiles fora não é: fica esperando o alcance', () => {
    const { w, p, s } = setup(4 + 2);
    expect(applyCommand(w, p, { id: 1, c: 'habilidade', botao: 3 }, { rewindTicks: 4 })).toBe(true);
    expect(statusOf(s, 'dano_continuo')).toBeUndefined();
    expect(p.pendingCast?.abilityId).toBe('maldicao_ou_virus');
  });

  it('sem compensação, o mesmo alvo de 0,8 tile fora não é acertado na hora', () => {
    const { w, p, s } = setup(4 + 0.8);
    expect(castAbility(w, p, 'maldicao_ou_virus')).toBe(true);
    expect(statusOf(s, 'dano_continuo')).toBeUndefined();
    expect(p.pendingCast).toBeDefined();
  });

  it('fora do alcance, anda sozinho até o alcance e lança', () => {
    const w = createWorld(arena(), 7);
    const p = spawnPlayer(w, { name: 'Li', archetypeId: 'idol', x: 5, y: 15 });
    const s = spawnEnemy(w, 'turbina_desgovernada', 14, 15);
    freeze(s);
    p.targetId = s.id;
    expect(castAbility(w, p, 'maldicao_ou_virus')).toBe(true);
    stepN(w, 40);
    expect(statusOf(s, 'dano_continuo')).toBeDefined();
    expect(p.x).toBeGreaterThan(7);
  });
});

describe('comandos repetidos (a deduplicação por id é do servidor)', () => {
  it('o mesmo comando de habilidade duas vezes: o segundo é recusado pela recarga global', () => {
    const w = createWorld(arena(), 1);
    const p = spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', x: 10, y: 15 });
    spawnEnemy(w, 'siri_do_mangue', 11.2, 15);
    const cmd = { id: 42, c: 'habilidade' as const, botao: 1 as const };
    expect(applyCommand(w, p, cmd)).toBe(true);
    const res = p.resource;
    expect(applyCommand(w, p, cmd)).toBe(false);
    expect(p.resource).toBe(res);
  });

  it('ir_ate repetido dá no mesmo; joystick cancela o ir_ate', () => {
    const w = createWorld(arena(), 1);
    const p = spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', x: 10, y: 15 });
    applyCommand(w, p, { id: 1, c: 'ir_ate', x: 20, y: 15 });
    applyCommand(w, p, { id: 1, c: 'ir_ate', x: 20, y: 15 });
    expect(p.moveTo).toEqual({ x: 20, y: 15 });
    stepN(w, 20);
    expect(p.x).toBeGreaterThan(12);
    applyInput(w, p, { seq: 1, mx: 0, my: 127 });
    expect(p.moveTo).toBeUndefined();
  });

  it('ir_ate usa o pathfinder do servidor quando existe', () => {
    const w = createWorld(arena(), 1);
    let called = 0;
    w.pathfinder = (_m, from, to) => {
      called++;
      return [{ x: from.x, y: to.y }, { x: to.x, y: to.y }];
    };
    const p = spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', x: 5, y: 5 });
    applyCommand(w, p, { id: 1, c: 'ir_ate', x: 8, y: 8 });
    expect(called).toBe(1);
    stepN(w, 60);
    expect(p.x).toBeCloseTo(8, 1);
    expect(p.y).toBeCloseTo(8, 1);
  });
});

describe('histórico de posições', () => {
  it('guarda pelo menos 300 ms', () => {
    const w = createWorld(arena(), 1);
    spawnPlayer(w, { name: 'A', archetypeId: 'idol', x: 5, y: 5 });
    stepN(w, 20);
    const span = (w.history[w.history.length - 1]!.tick - w.history[0]!.tick) * 50;
    expect(span).toBeGreaterThanOrEqual(300);
  });
});
