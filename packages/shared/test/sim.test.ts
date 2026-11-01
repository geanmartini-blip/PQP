import { describe, expect, it } from 'vitest';
import { Tile } from '../src/map/types';
import {
  applyCommand,
  applyBuff,
  applyControl,
  applyInput,
  applyShield,
  autoTarget,
  canAct,
  canMove,
  castAbility,
  createWorld,
  dealDamage,
  effectiveMoveSpeed,
  hudSnapshot,
  moveVelocity,
  resolveKit,
  setArchetype,
  statRowAt,
  spawnAlly,
  spawnEnemy,
  spawnNpc,
  spawnPlayer,
  step,
  stepMovement,
  stepN,
  type CombatEvent,
  type Entity,
  type World,
} from '../src/sim';
import { relevel } from '../src/sim/spawn';
import { getData } from '../src/data';
import { arena, fill, freeze } from '../src/sim/testkit';

const statusOf = (e: Entity, kind: string) => e.statuses.find((s) => s.kind === kind);
/** pct do efeito da habilidade nos dados (os números mudam com o balanceamento; o teste confere a regra) */
const pctOf = (ability: string, kind: string, stat?: string): number => {
  const ef = getData().abilities.get(ability)!.effects.find((x) => x.kind === kind && (stat === undefined || (x as { stat?: string }).stat === stat));
  return (ef as unknown as { pct: number }).pct;
};
const peao = (w: World, x = 10, y = 15) => spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', x, y });
const idol = (w: World, x = 10, y = 15) => spawnPlayer(w, { name: 'Idol', archetypeId: 'idol', x, y });

describe('movimento livre e colisão', () => {
  it('escorrega na parede e não atravessa', () => {
    const m = arena();
    fill(m, 12, 1, 12, 28, Tile.Parede);
    let b = { x: 10.5, y: 10, radius: 0.35 };
    for (let i = 0; i < 40; i++) b = { ...b, ...stepMovement(m, b, 4, 2, 50) };
    // encostou na parede (x máximo = 12 − raio) e seguiu escorregando em y
    expect(b.x).toBeLessThanOrEqual(12 - 0.35 + 1e-6);
    expect(b.x).toBeGreaterThan(12 - 0.35 - 0.02);
    expect(b.y).toBeCloseTo(14, 1);
    // velocidade absurda num tick não atravessa a parede (subpassos)
    const fast = stepMovement(m, { x: 10.5, y: 20, radius: 0.35 }, 200, 0, 50);
    expect(fast.x).toBeLessThan(12);
  });

  it('água rasa e lama deixam mais lento', () => {
    const m = arena();
    fill(m, 1, 5, 28, 5, Tile.AguaRasa);
    fill(m, 1, 8, 28, 8, Tile.Lama);
    const run = (y: number) => {
      let b = { x: 2.5, y, radius: 0.35 };
      for (let i = 0; i < 20; i++) b = { ...b, ...stepMovement(m, b, 4, 0, 50) };
      return b.x - 2.5;
    };
    const grama = run(2.5), agua = run(5.5), lama = run(8.5);
    expect(grama).toBeCloseTo(4, 5);
    expect(agua).toBeCloseTo(4 * 0.6, 5);
    expect(lama).toBeCloseTo(4 * 0.6, 5);
  });

  it('joystick: normaliza acima de 1 e tem zona morta', () => {
    expect(moveVelocity({ x: 2, y: 0 }, 4)).toEqual({ vx: 4, vy: 0 });
    expect(moveVelocity({ x: 0.05, y: 0.05 }, 4)).toEqual({ vx: 0, vy: 0 });
    const half = moveVelocity({ x: 0.5, y: 0 }, 4);
    expect(half.vx).toBeCloseTo(2);
  });

  it('o servidor anda com o mesmo stepMovement que o cliente prevê', () => {
    const w = createWorld(arena(), 1);
    const p = peao(w, 5, 5);
    applyInput(w, p, { seq: 1, mx: 127, my: 0 });
    let pred = { x: p.x, y: p.y, radius: p.radius };
    const mv = effectiveMoveSpeed(w, p);
    for (let i = 0; i < 10; i++) {
      const v = moveVelocity({ x: 1, y: 0 }, mv);
      pred = { ...pred, ...stepMovement(w.map, pred, v.vx, v.vy, 50) };
      step(w);
    }
    expect(p.x).toBeCloseTo(pred.x, 9);
    expect(hudSnapshot(w, p).mv).toBeCloseTo(mv);
    expect(hudSnapshot(w, p).canMove).toBe(true);
  });
});

describe('alvo automático', () => {
  it('trava no inimigo visível mais perto, nunca atrás da parede', () => {
    const m = arena();
    fill(m, 7, 12, 7, 18, Tile.Parede);
    const w = createWorld(m, 1);
    const p = peao(w, 5, 15);
    const atras = spawnEnemy(w, 'siri_do_mangue', 9, 15); // 4 tiles, atrás da parede
    const longe = spawnEnemy(w, 'siri_do_mangue', 5, 21); // 6 tiles, à vista
    expect(autoTarget(w, p)).toBe(longe.id);
    w.entities.delete(longe.id);
    p.targetId = undefined;
    expect(autoTarget(w, p)).toBeUndefined();
    expect(atras.id).toBeGreaterThan(0);
  });

  it('toque perto do inimigo (1,5 tile) troca o alvo e o manual se mantém', () => {
    const w = createWorld(arena(), 1);
    const p = peao(w, 5, 15);
    const a = spawnEnemy(w, 'siri_do_mangue', 7, 15);
    const b = spawnEnemy(w, 'siri_do_mangue', 5, 19);
    expect(autoTarget(w, p)).toBe(a.id);
    expect(applyCommand(w, p, { id: 1, c: 'alvo', x: 5.8, y: 19.9 })).toBe(true);
    expect(p.targetId).toBe(b.id);
    expect(autoTarget(w, p)).toBe(b.id);
    expect(applyCommand(w, p, { id: 2, c: 'alvo', x: 20, y: 20 })).toBe(false);
  });
});

describe('os 6 tipos de habilidade acertam sem mira', () => {
  it('travada: Rodeio pula no alvo travado e atordoa', () => {
    const w = createWorld(arena(), 1);
    const p = peao(w, 5, 15);
    const s = spawnEnemy(w, 'capanga_do_capataz', 8, 15);
    const vizinho = spawnEnemy(w, 'capanga_do_capataz', 9, 16);
    expect(castAbility(w, p, 'rodeio')).toBe(true); // sem alvo: pega o visível mais perto
    expect(p.x).toBeGreaterThan(7);
    expect(statusOf(s, 'atordoar')).toBeDefined();
    expect(canMove(s)).toBe(false);
    expect(vizinho.x).toBeGreaterThan(9); // empurrado para longe do alvo
  });

  it('em volta: Segura o Peão provoca quem está perto e dá redução de dano', () => {
    const w = createWorld(arena(), 1);
    const p = peao(w, 10, 10);
    const a = spawnEnemy(w, 'siri_do_mangue', 11.5, 10);
    const b = spawnEnemy(w, 'siri_do_mangue', 10, 11.8);
    const c = spawnEnemy(w, 'siri_do_mangue', 16, 10);
    expect(castAbility(w, p, 'segura_o_peao')).toBe(true);
    expect(statusOf(a, 'provocar')).toBeDefined();
    expect(statusOf(b, 'provocar')).toBeDefined();
    expect(statusOf(c, 'provocar')).toBeUndefined();
    expect(statusOf(p, 'reducao_dano')?.value).toBe(pctOf('segura_o_peao', 'reducao_dano'));
    step(w);
    expect(a.targetId).toBe(p.id);
  });

  it('área no alvo: Encore cai no alvo travado e puxa para o centro', () => {
    const w = createWorld(arena(), 1);
    const p = idol(w, 5, 15);
    const t = spawnEnemy(w, 'siri_do_mangue', 8.5, 15);
    const perto = spawnEnemy(w, 'siri_do_mangue', 8.5, 17.2);
    const fora = spawnEnemy(w, 'siri_do_mangue', 8.5, 22);
    for (const e of [t, perto, fora]) freeze(e);
    p.targetId = t.id;
    expect(castAbility(w, p, 'encore')).toBe(true);
    expect(statusOf(perto, 'puxar')).toBeDefined();
    expect(statusOf(fora, 'puxar')).toBeUndefined();
  });

  it('cone: Fanchant vira sozinho para o alvo, empurra quem está à frente e acelera aliados', () => {
    const w = createWorld(arena(), 1);
    const p = idol(w, 10, 15);
    const amigo = peao(w, 9, 15);
    const frente = spawnEnemy(w, 'capanga_do_capataz', 12, 15);
    const costas = spawnEnemy(w, 'capanga_do_capataz', 7.5, 15);
    p.facing = 1; // olhando para a esquerda; o cone vira para o alvo mesmo assim
    p.targetId = frente.id;
    expect(castAbility(w, p, 'fanchant')).toBe(true);
    expect(frente.x).toBeGreaterThan(13.5);
    expect(costas.x).toBeCloseTo(7.5, 5);
    expect(statusOf(amigo, 'reforco:speed')?.value).toBe(pctOf('fanchant', 'reforco', 'speed'));
  });

  it('campo: Chuva de Chumbo fica no chão e bate várias vezes', () => {
    const w = createWorld(arena(), 1);
    const p = spawnPlayer(w, { name: 'Babushka', archetypeId: 'babushka', x: 5, y: 15 });
    const t = spawnEnemy(w, 'turbina_desgovernada', 8, 15);
    t.hp = t.stats.hpMax = 5000;
    p.targetId = t.id;
    expect(castAbility(w, p, 'chuva_de_chumbo')).toBe(true);
    expect(w.zones).toHaveLength(1);
    const evs = stepN(w, 70);
    const hits = evs.filter((e) => e.t === 'hit' && e.ability === 'chuva_de_chumbo' && e.dst === t.id);
    expect(hits.length).toBe(6); // 3 s com tick de 0,5 s
    expect(w.zones).toHaveLength(0);
  });

  it('em aliado: Bora, Monstro! vai no aliado mais perto e em quem lança', () => {
    const w = createWorld(arena(), 1);
    const p = spawnPlayer(w, { name: 'Monstro', archetypeId: 'monstro_da_academia', x: 10, y: 10 });
    const perto = peao(w, 11.5, 10);
    const longe = peao(w, 13.5, 13);
    expect(castAbility(w, p, 'bora_monstro')).toBe(true);
    expect(statusOf(perto, 'reforco:attackSpeed')?.value).toBe(pctOf('bora_monstro', 'reforco', 'attackSpeed'));
    expect(statusOf(p, 'reforco:cooldownSpeed')?.value).toBe(pctOf('bora_monstro', 'reforco', 'cooldownSpeed'));
    expect(statusOf(longe, 'reforco:attackSpeed')).toBeUndefined();
  });
});

describe('recarga, custo e recarga global', () => {
  it('cobra o custo, respeita a recarga global de 1 s e a recarga da habilidade', () => {
    const w = createWorld(arena(), 1);
    const p = peao(w);
    spawnEnemy(w, 'siri_do_mangue', 11.2, 15);
    expect(castAbility(w, p, 'pancadao')).toBe(true);
    expect(p.resource).toBeCloseTo(80);
    expect(castAbility(w, p, 'casca_grossa')).toBe(false); // recarga global
    stepN(w, 20);
    expect(castAbility(w, p, 'pancadao')).toBe(false); // recarga de 8 s
    expect(castAbility(w, p, 'casca_grossa')).toBe(true);
    // Velocidade 7 → fator 0,91: 8 s de recarga viram ~8,8 s
    stepN(w, 150);
    expect(castAbility(w, p, 'pancadao')).toBe(false);
    stepN(w, 10);
    expect(castAbility(w, p, 'pancadao')).toBe(true);
    // sem recurso, recusa
    p.resource = 5;
    stepN(w, 20);
    expect(castAbility(w, p, 'segura_o_peao')).toBe(false);
  });

  it('Gingado (+25% de velocidade) faz a recarga andar mais rápido', () => {
    const w = createWorld(arena(), 1);
    const a = peao(w);
    const b = peao(w, 20, 15);
    castAbility(w, a, 'casca_grossa');
    castAbility(w, b, 'casca_grossa');
    const m = spawnPlayer(w, { name: 'Malandro', archetypeId: 'malandro', x: 10.5, y: 15 });
    castAbility(w, m, 'gingado');
    stepN(w, 100);
    expect((a.cooldowns['casca_grossa'] ?? 0) < (b.cooldowns['casca_grossa'] ?? 0)).toBe(true);
  });
});

describe('controle e imunidade', () => {
  it('atordoar trava; depois vem a imunidade de 4 s; provocar não respeita a imunidade', () => {
    const w = createWorld(arena(), 1);
    const p = peao(w);
    const s = spawnEnemy(w, 'capanga_do_capataz', 15, 15);
    expect(applyControl(w, s, p, 'atordoar', 1500)).toBe('aplicado');
    expect(canMove(s)).toBe(false);
    expect(canAct(s)).toBe(false);
    stepN(w, 31);
    expect(canMove(s)).toBe(true);
    expect(applyControl(w, s, p, 'prender', 1000)).toBe('resistiu');
    expect(applyControl(w, s, p, 'provocar', 3000)).toBe('aplicado');
    stepN(w, 80);
    expect(applyControl(w, s, p, 'prender', 1000)).toBe('aplicado');
    expect(canMove(s)).toBe(false);
    expect(canAct(s)).toBe(true); // preso ainda age
  });

  it('silenciar só impede habilidade; ataque básico continua', () => {
    const w = createWorld(arena(), 1);
    const p = peao(w);
    const s = spawnEnemy(w, 'siri_do_mangue', 11.2, 15);
    expect(hudSnapshot(w, p).canAct).toBe(true);
    applyControl(w, p, s, 'silenciar', 1000);
    expect(canAct(p)).toBe(false);
    expect(canMove(p)).toBe(true);
    // o HUD avisa o cliente (botões cinza) mesmo sem bit de flag para silenciado
    expect(hudSnapshot(w, p).canAct).toBe(false);
    expect(hudSnapshot(w, p).canMove).toBe(true);
    expect(castAbility(w, p, 'pancadao')).toBe(false);
    const evs = stepN(w, 5);
    expect(evs.some((e) => e.t === 'cast' && e.src === p.id && e.ability === 'basico_combatente')).toBe(true);
  });

  it('chefe recebe lentidão em vez de controle', () => {
    const w = createWorld(arena(), 1);
    const p = peao(w);
    const boss = spawnEnemy(w, 'bruno_ferro_chefe', 15, 15);
    w.events = [];
    expect(applyControl(w, boss, p, 'atordoar', 1500)).toBe('lentidao');
    expect(w.events.some((e) => e.t === 'cc_slow' && e.dst === boss.id)).toBe(true);
    expect(canMove(boss)).toBe(true);
    expect(statusOf(boss, 'lentidao')?.value).toBe(40);
    expect(statusOf(boss, 'atordoar')).toBeUndefined();
  });
});

describe('escudo e dano contínuo', () => {
  it('escudo absorve antes da vida; reaplicar pela mesma fonte só renova a duração', () => {
    const w = createWorld(arena(), 1);
    const p = peao(w);
    const s = spawnEnemy(w, 'capanga_do_capataz', 20, 20);
    expect(castAbility(w, p, 'casca_grossa')).toBe(true);
    expect(p.shield).toBeCloseTo(p.stats.hpMax * 0.2);
    const hp = p.hp;
    dealDamage(w, s, p, 1);
    expect(p.hp).toBe(hp);
    const sh = statusOf(p, 'escudo')!;
    const gasto = sh.value;
    expect(gasto).toBeLessThan(p.stats.hpMax * 0.2);
    stepN(w, 10);
    const end = sh.endTick;
    applyShield(w, p, p, p.stats.hpMax * 0.2, 5000, 'casca_grossa');
    expect(sh.value).toBe(gasto);
    expect(sh.endTick).toBeGreaterThan(end);
    // o que passa do escudo vai para a vida
    dealDamage(w, s, p, 0, { raw: gasto + 5 });
    expect(Math.abs(p.hp - (hp - 5))).toBeLessThanOrEqual(0.5); // dano arredondado para inteiro
  });

  it('Maldição ou Vírus bate a cada segundo e pula para o mais perto quando o alvo cai', () => {
    const w = createWorld(arena(), 1);
    const p = idol(w, 5, 15);
    const a = spawnEnemy(w, 'turbina_desgovernada', 8, 15);
    const b = spawnEnemy(w, 'turbina_desgovernada', 10, 15);
    a.hp = a.stats.hpMax = 10000;
    p.targetId = a.id;
    expect(castAbility(w, p, 'maldicao_ou_virus')).toBe(true);
    const evs = stepN(w, 130);
    const ticks = evs.filter((e) => e.t === 'hit' && e.ability === 'maldicao_ou_virus' && e.dst === a.id);
    expect(ticks.length).toBe(6); // 6 s, 1 por segundo
    // de novo, e derruba o alvo no meio: pula para b
    p.cooldowns = {};
    p.gcdUntil = 0;
    p.resource = 100;
    p.targetId = a.id;
    expect(castAbility(w, p, 'maldicao_ou_virus')).toBe(true);
    stepN(w, 25);
    dealDamage(w, p, a, 0, { raw: a.hp + 1 });
    expect(a.dead).toBe(true);
    expect(statusOf(b, 'dano_continuo')).toBeDefined();
  });
});

describe('caído e levantar', () => {
  it('cai com vida zerada, aliado ao lado por 3 s levanta com 30%', () => {
    const w = createWorld(arena(), 1);
    const a = peao(w, 10, 10);
    const b = idol(w, 10.8, 10);
    const s = spawnEnemy(w, 'capanga_do_capataz', 25, 25);
    dealDamage(w, s, a, 0, { raw: a.hp + 50 });
    expect(a.downedUntil).toBeDefined();
    expect(canMove(a)).toBe(false);
    expect(a.dead).toBe(false);
    stepN(w, 59);
    expect(a.downedUntil).toBeDefined();
    const evs = stepN(w, 2);
    expect(evs.some((e) => e.t === 'revive' && e.dst === a.id && e.by === b.id)).toBe(true);
    expect(a.hp).toBeCloseTo(a.stats.hpMax * 0.3, 0);
  });

  it('sozinho, depois de 30 s volta para o ponto de partida (QG no protótipo)', () => {
    const w = createWorld(arena(), 1);
    const a = peao(w, 10, 10);
    const s = spawnEnemy(w, 'capanga_do_capataz', 25, 25);
    a.x = 14;
    dealDamage(w, s, a, 0, { raw: a.hp + 50 });
    const evs = stepN(w, 601);
    expect(evs.some((e) => e.t === 'death' && e.dst === a.id)).toBe(true);
    expect(a.downedUntil).toBeUndefined();
    expect(a.x).toBe(10);
    expect(a.hp).toBe(a.stats.hpMax);
  });
});

describe('troca de arquétipo e NPCs', () => {
  it('setArchetype troca classe e botões, mantém a fração de vida e as recargas', () => {
    const w = createWorld(arena(), 1);
    const p = peao(w);
    castAbility(w, p, 'casca_grossa');
    const cd = p.cooldowns['casca_grossa'];
    expect(cd).toBeGreaterThan(w.tick);
    p.hp = p.stats.hpMax / 2;
    setArchetype(w, p, 'idol');
    expect(p.classId).toBe('mascarado');
    expect(p.side).toBe('direita');
    expect(p.loadout?.b1).toBe('fanchant');
    expect(p.loadout?.b2).toBe('encore');
    expect(p.loadout?.basico).toBe('basico_mascarado');
    expect(p.hp / p.stats.hpMax).toBeCloseTo(0.5);
    expect(p.cooldowns['casca_grossa']).toBe(cd);
    expect(p.stats.range).toBe(4);
  });

  it('regressão: trocar de ala duas vezes não libera as recargas nem a recarga global', () => {
    const w = createWorld(arena(), 1);
    const p = peao(w);
    const s = spawnEnemy(w, 'siri_do_mangue', 11.2, 15);
    freeze(s);
    p.targetId = s.id;
    expect(castAbility(w, p, 'segura_o_peao')).toBe(true);
    const cd = p.cooldowns['segura_o_peao']!;
    setArchetype(w, p, 'idol');
    setArchetype(w, p, 'peao_brabo');
    expect(p.cooldowns['segura_o_peao']).toBe(cd);
    expect(castAbility(w, p, 'segura_o_peao')).toBe(false);
    // a troca aplica a recarga global
    stepN(w, 25);
    setArchetype(w, p, 'idol');
    expect(p.gcdUntil).toBeGreaterThan(w.tick);
    expect(castAbility(w, p, 'fanchant')).toBe(false);
  });

  it('regressão: trocar_arquetipo só com o treinador da ala perto e fora de combate', () => {
    const w = createWorld(arena(40, 30), 1);
    const p = peao(w, 10, 15);
    // longe dos treinadores: recusa; ala fora do template também
    const li = spawnNpc(w, 'li_wei', 25, 15);
    expect(applyCommand(w, p, { id: 1, c: 'trocar_arquetipo', archetypeId: 'idol' })).toBe(false);
    expect(applyCommand(w, p, { id: 2, c: 'trocar_arquetipo', archetypeId: 'cowboy_cromado' })).toBe(false);
    expect(p.archetypeId).toBe('peao_brabo');
    // perto do Li Wei: troca para Idol, mas não para outra ala
    p.x = li.x - 3;
    expect(applyCommand(w, p, { id: 3, c: 'trocar_arquetipo', archetypeId: 'cowboy_cromado' })).toBe(false);
    expect(applyCommand(w, p, { id: 4, c: 'trocar_arquetipo', archetypeId: 'idol' })).toBe(true);
    expect(p.archetypeId).toBe('idol');
    // em combate (apanhou agora): recusa, e a conversa com o treinador não troca
    const wes = spawnNpc(w, 'wesley', li.x - 4, 15);
    const s = spawnEnemy(w, 'siri_do_mangue', 5, 25);
    dealDamage(w, s, p, 0, { raw: 1 });
    expect(applyCommand(w, p, { id: 5, c: 'trocar_arquetipo', archetypeId: 'peao_brabo' })).toBe(false);
    expect(applyCommand(w, p, { id: 6, c: 'interagir', entity: wes.id })).toBe(true);
    expect(p.archetypeId).toBe('idol');
    // 5 s depois, fora de combate: troca
    w.tick += 101;
    expect(applyCommand(w, p, { id: 7, c: 'trocar_arquetipo', archetypeId: 'peao_brabo' })).toBe(true);
    expect(p.archetypeId).toBe('peao_brabo');
  });

  it('regressão: subir de nível e trocar de ala mantém stats.pct e o reforço de vida', () => {
    const w = createWorld(arena(), 1);
    const p = peao(w);
    p.stats.pct['attack'] = 0.1;
    const base = p.stats.hpMax;
    applyBuff(w, p, p, 'hp', 50, 3000, 'teste');
    expect(p.stats.hpMax).toBeCloseTo(base * 1.5);
    relevel(w, p, p.level + 1);
    const base2 = statRowAt(resolveKit('peao_brabo'), p.level).vida;
    expect(p.stats.hpMax).toBeCloseTo(base2 * 1.5);
    expect(p.stats.pct['attack']).toBeCloseTo(0.1);
    stepN(w, 61); // o reforço acaba
    expect(statusOf(p, 'reforco:hp')).toBeUndefined();
    expect(p.stats.hpMax).toBeCloseTo(base2);
  });

  it('interagir com Wesley vira Peão Brabo; com Li Wei, Idol; e eles falam', () => {
    const w = createWorld(arena(), 1);
    const p = idol(w, 10, 10);
    const wesley = spawnNpc(w, 'wesley', 11, 10);
    const li = spawnNpc(w, 'li_wei', 10, 12);
    w.events = [];
    expect(applyCommand(w, p, { id: 1, c: 'interagir', entity: wesley.id })).toBe(true);
    expect(p.archetypeId).toBe('peao_brabo');
    const say = w.events.find((e): e is Extract<CombatEvent, { t: 'say' }> => e.t === 'say');
    expect(say?.src).toBe(wesley.id);
    expect(say?.text.length).toBeGreaterThan(5);
    expect(applyCommand(w, p, { id: 2, c: 'interagir', entity: li.id })).toBe(true);
    expect(p.archetypeId).toBe('idol');
    // NPC neutro não leva dano nem vira alvo
    expect(dealDamage(w, p, wesley, 5)).toBe(0);
  });

  it('companheiro de IA (Wesley lutando junto) caça e bate sozinho', () => {
    const w = createWorld(arena(), 3);
    spawnAlly(w, 'wesley', 10, 10, { archetypeId: 'peao_brabo', level: 12 });
    const s = spawnEnemy(w, 'siri_do_mangue', 14, 10);
    const evs = stepN(w, 100);
    expect(evs.some((e) => e.t === 'hit' && e.dst === s.id)).toBe(true);
  });
});
