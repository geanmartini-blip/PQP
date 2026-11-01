/**
 * Regressões dos achados da revisão da Fase 1 (área shared-sim): alvo automático, cone fora do
 * alcance, confusão na IA, grupo sem partyId, chefe (coleira, fases puladas, teto de reforços),
 * imunidade a controle quebrado, poda de attackers, empurrão de aviso no chão e filtro de saque.
 */
import { describe, expect, it } from 'vitest';
import { getData } from '../src/data';
import {
  applyCommand,
  applyControl,
  applyStatus,
  approachRange,
  castAbility,
  createWorld,
  dealDamage,
  groupOf,
  retargetTap,
  spawnEnemy,
  spawnLoot,
  spawnPlayer,
  step,
  stepN,
  msToTicks,
  type CombatEvent,
  type Entity,
  type World,
} from '../src/sim';
import { enemyMind } from '../src/sim/ai';
import { reinforcementsOf } from '../src/sim/ai_boss';
import { enemyAi } from '../src/sim/spawn';
import { arena, freeze } from '../src/sim/testkit';

const gap = (a: Entity, b: Entity) => Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius;

/** Jogador que não bate e não leva dano (para medir só a IA). */
function dummy(w: World, x: number, y: number): Entity {
  const p = spawnPlayer(w, { name: 'Alvo', archetypeId: 'peao_brabo', x, y });
  p.hp = p.stats.hpMax = 100000;
  p.loadout!.basico = '';
  applyStatus(w, p, p, { kind: 'imune', durationMs: 1e9, value: 1, abilityId: 'teste', data: { aDano: true, aControle: true } });
  return p;
}

describe('alvo automático segue o inimigo mais perto à vista', () => {
  it('fora do alcance do básico, troca para o inimigo que encostou; o alvo de toque fica', () => {
    const w = createWorld(arena(), 1);
    const p = spawnPlayer(w, { name: 'Idol', archetypeId: 'idol', x: 10, y: 15 });
    const longe = spawnEnemy(w, 'siri_do_mangue', 16.5, 15);
    freeze(longe);
    step(w);
    expect(p.targetId).toBe(longe.id);
    const perto = spawnEnemy(w, 'siri_do_mangue', 11.2, 15);
    freeze(perto);
    const evs = stepN(w, 30);
    expect(p.targetId).toBe(perto.id);
    expect(evs.some((e) => e.t === 'hit' && e.src === p.id && e.dst === perto.id)).toBe(true);
    // escolhido por toque: não troca sozinho
    expect(retargetTap(w, p, longe.x, longe.y)).toBe(longe.id);
    stepN(w, 5);
    expect(p.targetId).toBe(longe.id);
  });

  it('com o alvo no alcance do básico, não troca (sem ficar oscilando)', () => {
    const w = createWorld(arena(), 1);
    const p = spawnPlayer(w, { name: 'Idol', archetypeId: 'idol', x: 10, y: 15 });
    const a = spawnEnemy(w, 'siri_do_mangue', 13, 15);
    freeze(a);
    step(w);
    expect(p.targetId).toBe(a.id);
    const b = spawnEnemy(w, 'siri_do_mangue', 10, 16.2);
    freeze(b);
    stepN(w, 5);
    expect(p.targetId).toBe(a.id);
  });
});

describe('cone com o alvo fora do alcance anda até o alcance', () => {
  it('Fanchant com o alvo a 6,5 tiles: não gasta recarga na hora, anda e lança no alcance', () => {
    const w = createWorld(arena(), 1);
    const p = spawnPlayer(w, { name: 'Idol', archetypeId: 'idol', x: 10, y: 15 });
    const s = spawnEnemy(w, 'siri_do_mangue', 16.5, 15);
    freeze(s);
    p.targetId = s.id;
    const res = p.resource;
    expect(applyCommand(w, p, { id: 1, c: 'habilidade', botao: 1 })).toBe(true);
    expect(p.cooldowns['fanchant']).toBeUndefined();
    expect(p.resource).toBe(res);
    expect(p.pendingCast?.abilityId).toBe('fanchant');
    let castGap: number | undefined;
    for (let i = 0; i < 60 && castGap === undefined; i++) {
      for (const e of step(w)) if (e.t === 'cast' && e.src === p.id && e.ability === 'fanchant') castGap = gap(p, s);
    }
    expect(castGap).toBeDefined();
    expect(castGap!).toBeLessThanOrEqual(approachRange(p, getData().abilities.get('fanchant')!) + 1e-6);
    expect(p.cooldowns['fanchant']).toBeDefined();
  });

  it('sem inimigo nenhum, sai na direção em que olha (não trava)', () => {
    const w = createWorld(arena(), 1);
    const p = spawnPlayer(w, { name: 'Idol', archetypeId: 'idol', x: 10, y: 15 });
    expect(castAbility(w, p, 'fanchant')).toBe(true);
    expect(p.cooldowns['fanchant']).toBeDefined();
    expect(p.pendingCast).toBeUndefined();
  });
});

describe('confusão na IA', () => {
  it('inimigo confuso não lança habilidade no jogador (só o básico a esmo)', () => {
    const w = createWorld(arena(), 3);
    const p = dummy(w, 10, 15);
    const c = spawnEnemy(w, 'capanga_do_capataz', 11.3, 15);
    dealDamage(w, p, c, 0, { raw: 1 });
    step(w);
    expect(enemyMind(c).state).toBe('combate');
    expect(applyControl(w, c, p, 'confundir', 2000)).toBe('aplicado');
    const evs = stepN(w, 30);
    const basic = enemyAi(c).basic;
    expect(evs.some((e) => e.t === 'cast' && e.src === c.id && e.ability !== basic)).toBe(false);
    expect(w.telegraphs.some((t) => t.sourceId === c.id)).toBe(false);
  });
});

describe('grupo sem partyId', () => {
  it('não pega estranho longe; pega perto (até 12 tiles) e o grupo inteiro com partyId', () => {
    const w = createWorld(arena(130, 20), 1);
    const a = spawnPlayer(w, { name: 'A', archetypeId: 'idol', x: 10, y: 10 });
    const longe = spawnPlayer(w, { name: 'B', archetypeId: 'peao_brabo', x: 115, y: 10 });
    const perto = spawnPlayer(w, { name: 'C', archetypeId: 'peao_brabo', x: 15, y: 10 });
    expect(groupOf(w, a, false).map((e) => e.id).sort()).toEqual([a.id, perto.id].sort());
    a.partyId = longe.partyId = 'g1';
    expect(groupOf(w, a, false).map((e) => e.id).sort()).toEqual([a.id, longe.id].sort());
  });

  it('curandeira no automático não sai andando atrás de estranho ferido do outro lado do mapa', () => {
    const w = createWorld(arena(130, 20), 1);
    const cur = spawnPlayer(w, { name: 'Cura', archetypeId: 'curandeira_dos_andes', x: 10, y: 10 });
    cur.auto = true;
    const b = spawnPlayer(w, { name: 'B', archetypeId: 'peao_brabo', x: 110, y: 10 });
    b.hp = b.stats.hpMax * 0.3;
    stepN(w, 40);
    expect(cur.x).toBeLessThan(10.5);
  });
});

describe('chefe: coleira, fases e reforços', () => {
  const bossAt = (w: World, x: number, y: number) => {
    const b = spawnEnemy(w, 'bruno_ferro_chefe', x, y);
    b.spawnX = x;
    b.spawnY = y;
    return b;
  };

  it('voltando pela coleira não entra de novo na fase 3; os reforços vão embora; chega na fase 1', () => {
    const w = createWorld(arena(90, 30), 4);
    const p = dummy(w, 13, 15);
    const b = bossAt(w, 10, 15);
    dealDamage(w, p, b, 0, { raw: 1 });
    b.hp = b.stats.hpMax * 0.2;
    stepN(w, 3);
    expect(enemyAi(b).phase).toBe(2);
    expect(reinforcementsOf(w, b).length).toBe(3);
    // levado para fora da coleira (22 tiles)
    b.x = 40;
    p.x = 70;
    const falas = new Set((getData().enemiesById.get('bruno_ferro_chefe')!.fases ?? []).map((f) => f.fala));
    const evs: CombatEvent[] = [];
    let returned = false;
    for (let i = 0; i < 800 && !returned; i++) {
      evs.push(...step(w));
      returned = enemyMind(b).state === 'dormindo';
    }
    expect(returned).toBe(true);
    expect(evs.some((e) => e.t === 'say' && e.src === b.id && falas.has(e.text))).toBe(false);
    expect(enemyAi(b).phase).toBe(0);
    expect(enemyAi(b).nextReinforceTick).toBeUndefined();
    expect(b.hp).toBe(b.stats.hpMax);
    expect(reinforcementsOf(w, b)).toHaveLength(0);
    stepN(w, 2);
    expect(Array.from(w.entities.values()).filter((e) => e.kind === 'enemy' && !e.dead)).toHaveLength(1);
  });

  it('golpe que cruza dois limiares passa pelas duas fases (2 + 1 reforços e as duas falas)', () => {
    const w = createWorld(arena(40, 30), 5);
    const p = dummy(w, 13, 15);
    const b = bossAt(w, 10, 15);
    dealDamage(w, p, b, 0, { raw: 1 });
    step(w);
    b.hp = b.stats.hpMax * 0.66;
    step(w);
    expect(enemyAi(b).phase).toBe(0);
    b.hp = b.stats.hpMax * 0.26;
    const evs = stepN(w, 2);
    const fases = getData().enemiesById.get('bruno_ferro_chefe')!.fases!;
    expect(enemyAi(b).phase).toBe(2);
    expect(reinforcementsOf(w, b)).toHaveLength(3);
    for (const f of fases.slice(1)) expect(evs.some((e) => e.t === 'say' && e.src === b.id && e.text === f.fala)).toBe(true);
  });

  it('reforços que repetem têm teto: em 3 minutos na fase 3, nunca mais de 3 capangas vivos', () => {
    const w = createWorld(arena(40, 30), 6);
    const p = dummy(w, 13, 15);
    const b = bossAt(w, 10, 15);
    dealDamage(w, p, b, 0, { raw: 1 });
    b.hp = b.stats.hpMax * 0.2;
    let max = 0;
    for (let i = 0; i < 20 * 180; i++) {
      step(w);
      b.hp = Math.min(b.hp, b.stats.hpMax * 0.2);
      max = Math.max(max, reinforcementsOf(w, b).length);
    }
    expect(enemyAi(b).phase).toBe(2);
    expect(max).toBeLessThanOrEqual(3);
    expect(max).toBeGreaterThan(0);
    expect(p.id).toBeGreaterThan(0);
  });

  it('reforço do chefe que morreu vai embora quando sai do combate, sem dar XP', () => {
    const w = createWorld(arena(40, 30), 7);
    const p = dummy(w, 13, 15);
    const b = bossAt(w, 10, 15);
    dealDamage(w, p, b, 0, { raw: 1 });
    b.hp = b.stats.hpMax * 0.5;
    stepN(w, 2);
    const reforcos = reinforcementsOf(w, b);
    expect(reforcos.length).toBe(2);
    dealDamage(w, p, b, 0, { raw: b.hp + 1 });
    // o jogador some de vista: os capangas desistem e vão embora
    p.x = 38;
    p.y = 28;
    p.statuses.push({ uid: 999999, kind: 'invisivel', sourceId: p.id, startTick: w.tick, endTick: w.tick + 1e7, value: 1 });
    const evs = stepN(w, 20 * 20);
    expect(reforcos.every((r) => !w.entities.has(r.id))).toBe(true);
    expect(evs.some((e) => e.t === 'xp')).toBe(false);
  });
});

describe('imunidade a controle, attackers e empurrão de aviso no chão', () => {
  it('controle que quebra no primeiro golpe dá só os 4 s de imunidade a partir dali', () => {
    const w = createWorld(arena(), 1);
    const p = spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', x: 10, y: 15 });
    const c = spawnEnemy(w, 'capanga_do_capataz', 12, 15);
    expect(applyControl(w, c, p, 'prender', 6000, { quebraAoApanhar: true })).toBe('aplicado');
    dealDamage(w, p, c, 0, { raw: 1 });
    expect(c.statuses.some((s) => s.kind === 'prender')).toBe(false);
    expect(c.ccImmuneUntil - w.tick).toBe(msToTicks(getData().balance.combate.imunidadeControleMs));
  });

  it('attackers é podado: quem não bate há mais de 30 s sai da lista', () => {
    const w = createWorld(arena(), 1);
    const p = spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', x: 10, y: 15 });
    const c = spawnEnemy(w, 'capanga_do_capataz', 25, 25);
    dealDamage(w, c, p, 0, { raw: 1 });
    expect(p.attackers?.[c.id]).toBeDefined();
    w.entities.delete(c.id);
    stepN(w, 20 * 31);
    expect(Object.keys(p.attackers ?? {})).toHaveLength(0);
  });

  it('cone com aviso no chão empurra a partir de onde foi marcado, mesmo se quem lançou andou', () => {
    const w = createWorld(arena(), 1);
    const p = spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', x: 11.2, y: 15 });
    p.loadout!.basico = '';
    const c = spawnEnemy(w, 'capanga_do_capataz', 10, 15);
    freeze(c);
    expect(castAbility(w, c, 'capanga_do_capataz_cobranca_amigavel', { targetId: p.id })).toBe(true);
    expect(w.telegraphs.length).toBe(1);
    c.x = 13; // passou para o outro lado durante o aviso
    stepN(w, 20);
    expect(w.telegraphs.length).toBe(0);
    expect(p.x).toBeGreaterThan(12);
  });
});

describe('coleta automática com filtro de raridade e venda automática', () => {
  const D = () => getData();
  const comum = () => D().items.itens.find((i) => i.rarity === 'comum')!;
  const raro = () => D().items.itens.find((i) => i.rarity === 'raro')!;

  it('padrão (filtroPadrao comum): pega tudo; com filtro raro, o comum fica no chão', () => {
    const w = createWorld(arena(), 1);
    const p = spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', x: 10, y: 15 });
    const l1 = spawnLoot(w, 10.2, 15, { itemId: comum().id, rarity: 'comum' });
    step(w);
    expect(w.entities.has(l1.id)).toBe(false);
    expect(p.inventory).toContain(comum().id);
    expect(applyCommand(w, p, { id: 1, c: 'filtro_saque', raridade: 'raro' })).toBe(true);
    expect(p.lootFilter).toBe('raro');
    const l2 = spawnLoot(w, 10.2, 15, { itemId: comum().id, rarity: 'comum' });
    const l3 = spawnLoot(w, 10.2, 15.2, { itemId: raro().id, rarity: 'raro' });
    const l4 = spawnLoot(w, 10, 15.2, { currency: { semente: 3 } });
    step(w);
    expect(w.entities.has(l2.id)).toBe(true);
    expect(w.entities.has(l3.id)).toBe(false);
    expect(w.entities.has(l4.id)).toBe(false);
    expect(p.semente).toBe(3);
    // filtro que não existe é recusado
    expect(applyCommand(w, p, { id: 2, c: 'filtro_saque', raridade: 'lendario' as never })).toBe(false);
  });

  it('venda automática ligada: o comum vira moeda da margem (precoBase × fração)', () => {
    const w = createWorld(arena(), 1);
    const p = spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', x: 10, y: 15 });
    expect(applyCommand(w, p, { id: 1, c: 'filtro_saque', raridade: 'raro', vendaAutomatica: true })).toBe(true);
    const it = comum();
    const l = spawnLoot(w, 10.2, 15, { itemId: it.id, rarity: 'comum' });
    step(w);
    expect(w.entities.has(l.id)).toBe(false);
    expect(p.inventory ?? []).not.toContain(it.id);
    expect(p.semente).toBe(Math.max(1, Math.floor(it.precoBase * D().loot.vendaAutomatica.fracaoDoPrecoBase)));
  });
});
