import { describe, expect, it } from 'vitest';
import { getData } from '../src/data';
import {
  applyCommand,
  castAbility,
  createWorld,
  dealDamage,
  getHook,
  hasHook,
  registerHook,
  spawnAlly,
  spawnEnemy,
  spawnPlayer,
  step,
  stepN,
  xpToNext,
  type CombatEvent,
  type Entity,
  type World,
} from '../src/sim';
import { arena, freeze } from '../src/sim/testkit';

const statusOf = (e: Entity, kind: string) => e.statuses.find((s) => s.kind === kind);

/** Boneco de treino: não anda, quase não bate e não morre. */
function dummy(w: World, x: number, y: number): Entity {
  const d = spawnEnemy(w, 'turbina_desgovernada', x, y);
  freeze(d);
  d.stats.attack = 0;
  d.hp = d.stats.hpMax = 1e7;
  d.ai = { ...d.ai, abilities: [] };
  return d;
}

describe('carga do Especial', () => {
  it('só batendo, enche entre 45 e 90 s (piso garante o máximo)', () => {
    const w = createWorld(arena(), 5);
    const p = spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', x: 10, y: 15 });
    dummy(w, 11.4, 15);
    let ready = -1;
    for (let t = 1; t <= 20 * 95 && ready < 0; t++) {
      const evs = step(w);
      if (evs.some((e) => e.t === 'special_ready' && e.dst === p.id)) ready = t;
    }
    expect(ready).toBeGreaterThan(0);
    const s = ready / 20;
    expect(s).toBeGreaterThanOrEqual(45);
    expect(s).toBeLessThanOrEqual(90.5);
    expect(p.special).toBe(1);
  });

  it('nunca enche antes de 45 s, mesmo com pontos sobrando (teto)', () => {
    const w = createWorld(arena(), 5);
    const p = spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', x: 10, y: 15 });
    dummy(w, 11.4, 15);
    let ready = -1;
    for (let t = 1; t <= 20 * 60 && ready < 0; t++) {
      p.specialBank = 1000;
      if (step(w).some((e) => e.t === 'special_ready' && e.dst === p.id)) ready = t;
    }
    expect(ready / 20).toBeGreaterThanOrEqual(45);
    expect(ready / 20).toBeLessThan(47);
  });

  it('fora de combate não carrega (nem regenerando vida)', () => {
    const w = createWorld(arena(), 5);
    const p = spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', x: 10, y: 15 });
    p.hp = p.stats.hpMax * 0.5;
    stepN(w, 20 * 20);
    expect(p.special).toBe(0);
    expect(p.hp).toBeGreaterThan(p.stats.hpMax * 0.5); // regenerou depois de 5 s sem combate
  });

  it('Especial cheio sai pelo botão e zera a carga; sem carga é recusado', () => {
    const w = createWorld(arena(), 5);
    const p = spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', x: 10, y: 15 });
    const s = spawnEnemy(w, 'capanga_do_capataz', 11.5, 15);
    expect(applyCommand(w, p, { id: 1, c: 'habilidade', botao: 'especial' })).toBe(false);
    p.special = 1;
    const hp = s.hp;
    expect(applyCommand(w, p, { id: 2, c: 'habilidade', botao: 'especial' })).toBe(true);
    expect(p.special).toBe(0);
    expect(s.hp).toBeLessThan(hp);
    expect(statusOf(p, 'reducao_dano')?.value).toBe(25);
  });
});

describe('ataque básico automático', () => {
  it('bate sozinho no alvo travado no alcance, inclusive andando', () => {
    const w = createWorld(arena(), 1);
    const p = spawnPlayer(w, { name: 'Li', archetypeId: 'idol', x: 10, y: 15 });
    const d = dummy(w, 13, 15);
    p.moveIntent = { x: 0, y: 1 };
    const evs = stepN(w, 25);
    const hits = evs.filter((e) => e.t === 'hit' && e.src === p.id && e.dst === d.id);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(p.y).toBeGreaterThan(16);
    // Foco sobe a cada acerto do básico
    expect(p.resource).toBeLessThanOrEqual(p.stats.resourceMax);
  });
});

describe('inimigos: aviso no chão, elite e chefe', () => {
  it('ataque grande do capanga avisa no chão 0,9 s antes; quem sai da área não leva', () => {
    const w = createWorld(arena(), 9);
    const p = spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', x: 10, y: 15 });
    const c = spawnEnemy(w, 'capanga_do_capataz', 11.5, 15);
    c.targetId = p.id;
    expect(castAbility(w, c, 'capanga_do_capataz_cobranca_amigavel', { targetId: p.id })).toBe(true);
    expect(w.telegraphs).toHaveLength(1);
    const tel = w.telegraphs[0]!;
    expect((tel.impactTick - tel.startTick) * 50).toBeGreaterThanOrEqual(800);
    // sai da área pelo lado de trás
    p.x = 5;
    const evs: CombatEvent[] = [];
    for (let i = 0; i < 20; i++) {
      p.x = 5;
      evs.push(...step(w));
    }
    expect(evs.some((e) => e.t === 'hit' && e.dst === p.id && e.ability === 'capanga_do_capataz_cobranca_amigavel')).toBe(false);
  });

  it('elite promovido recebe multiplicadores e afixos; Blindado não é empurrado', () => {
    const w = createWorld(arena(), 9);
    const base = getData().enemiesById.get('capanga_do_capataz')!;
    const e = spawnEnemy(w, 'capanga_do_capataz', 12, 15, { tier: 'elite', affixes: ['blindado'] });
    expect(e.tier).toBe('elite');
    expect(e.stats.hpMax).toBeCloseTo(base.vida * getData().enemies.promocaoElite.vidaMult);
    expect(e.stats.pct['damageTaken']).toBeCloseTo(-0.4);
    const p = spawnPlayer(w, { name: 'Li', archetypeId: 'idol', x: 10, y: 15 });
    p.targetId = e.id;
    castAbility(w, p, 'fanchant');
    expect(e.x).toBeCloseTo(12, 5);
    const r = spawnEnemy(w, 'siri_do_mangue', 12, 18, { tier: 'elite' });
    expect(r.affixes!.length).toBeGreaterThanOrEqual(1);
  });

  it('afixo Explode ao Morrer: aviso no chão e explosão depois', () => {
    const w = createWorld(arena(), 9);
    const p = spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', x: 10, y: 15 });
    const e = spawnEnemy(w, 'siri_do_mangue', 11.2, 15, { tier: 'elite', affixes: ['explode_ao_morrer'] });
    dealDamage(w, p, e, 0, { raw: e.hp + 1 });
    expect(w.telegraphs.some((t) => t.abilityId === 'afixo_explode_ao_morrer')).toBe(true);
    const hp = p.hp;
    stepN(w, 30);
    expect(p.hp).toBeLessThan(hp);
  });

  it('chefe troca de fase pela vida e chama reforços', () => {
    const w = createWorld(arena(40, 40), 9);
    const p = spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', x: 15, y: 20 });
    const b = spawnEnemy(w, 'bruno_ferro_chefe', 18, 20);
    step(w);
    b.hp = b.stats.hpMax * 0.6;
    const evs = stepN(w, 2);
    expect(evs.some((e) => e.t === 'say' && e.src === b.id)).toBe(true);
    const capangas = Array.from(w.entities.values()).filter((e) => e.defId === 'capanga_do_capataz');
    expect(capangas.length).toBe(2);
    expect(p.id).toBeGreaterThan(0);
  });
});

describe('XP, saque e moeda', () => {
  it('solo não dá XP, mas dá saque; em grupo dá XP', () => {
    const w = createWorld(arena(), 11);
    const p = spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', x: 10, y: 15, playerId: 'p1' });
    const e = spawnEnemy(w, 'cobrador_do_capataz', 16, 15);
    dealDamage(w, p, e, 0, { raw: e.hp + 1 });
    const evs = stepN(w, 2);
    expect(evs.some((x) => x.t === 'xp')).toBe(false);
    const loot = Array.from(w.entities.values()).filter((x) => x.kind === 'loot');
    expect(loot.length).toBeGreaterThan(0);
    expect(loot.every((l) => l.loot?.forPlayerId === 'p1')).toBe(true); // rolagem individual
    // anda por cima e pega tudo
    const picked = new Set<number>();
    for (const l of loot) {
      p.x = l.x;
      p.y = l.y;
      for (const x of step(w)) if (x.t === 'loot_pick' && x.by === p.id) picked.add(x.id);
    }
    expect(loot.every((l) => picked.has(l.id))).toBe(true);
    expect((p.semente ?? 0) + (p.credito ?? 0) + (p.inventory?.length ?? 0) + (p.loadout?.itemCount ?? 0)).toBeGreaterThan(3);
    p.x = 10;
    p.y = 15;

    // grupo: jogador + companheiro de IA
    spawnAlly(w, 'li_wei', 10, 16, { archetypeId: 'idol', level: 12 });
    const e2 = spawnEnemy(w, 'siri_do_mangue', 11.5, 15);
    dealDamage(w, p, e2, 0, { raw: e2.hp + 1 });
    const evs2 = stepN(w, 2);
    const xp = evs2.find((x): x is Extract<CombatEvent, { t: 'xp' }> => x.t === 'xp' && x.dst === p.id);
    expect(xp?.amount).toBe(3);
  });

  it('XP sobe de nível pela curva round(50 × n^1,6)', () => {
    expect(xpToNext(1)).toBe(50);
    expect(xpToNext(12)).toBe(Math.round(50 * Math.pow(12, 1.6)));
  });
});

describe('etapas, Doutrina e companheiros', () => {
  it('Delta não tem botões nem Especial; classe sem ala usa 3 da classe; arquétipo usa as marcas', () => {
    const w = createWorld(arena(), 1);
    const d = spawnPlayer(w, { name: 'Novato', archetypeId: 'delta', x: 5, y: 5 });
    expect(d.loadout).toMatchObject({ b1: '', b2: '', b3: '', especial: '', basico: 'basico_combatente' });
    expect(d.stats.hpMax).toBe(80);
    const c = spawnPlayer(w, { name: 'Recruta', archetypeId: 'mascarado', side: 'direita', x: 6, y: 5 });
    expect(c.level).toBe(8);
    expect([c.loadout?.b1, c.loadout?.b2, c.loadout?.b3]).toEqual(['maldicao_ou_virus', 'confusao', 'sumico']);
    expect(c.stats.hpMax).toBe(115);
    const a = spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', level: 8, x: 7, y: 5 });
    expect(a.stats.hpMax).toBe(getData().balance.atributosArquetipo['peao_brabo']!.vida);
    expect(a.stats.range).toBe(1);
  });

  it('companheiro de IA vai até o jogador caído e levanta', () => {
    const w = createWorld(arena(), 2);
    const p = spawnPlayer(w, { name: 'Ana', archetypeId: 'idol', x: 10, y: 10, playerId: 'p1' });
    spawnAlly(w, 'wesley', 14, 10, { archetypeId: 'peao_brabo', level: 12 });
    const s = spawnEnemy(w, 'capanga_do_capataz', 30 - 2, 28);
    dealDamage(w, s, p, 0, { raw: p.hp + 1 });
    expect(p.downedUntil).toBeDefined();
    const evs = stepN(w, 20 * 8);
    expect(evs.some((e) => e.t === 'revive' && e.dst === p.id)).toBe(true);
  });

  it('chefe ganha vida por jogador a mais', () => {
    const w = createWorld(arena(), 2);
    const um = spawnEnemy(w, 'bruno_ferro_chefe', 10, 10);
    const tres = spawnEnemy(w, 'bruno_ferro_chefe', 20, 10, { players: 3 });
    expect(tres.stats.hpMax).toBeCloseTo(um.stats.hpMax * 2);
  });

  it('Doutrina: carta "minha vida abaixo de 50%" usa o item', () => {
    const w = createWorld(arena(), 2);
    const p = spawnPlayer(w, { name: 'Ana', archetypeId: 'idol', x: 10, y: 10 });
    applyCommand(w, p, { id: 1, c: 'doutrina', cards: [{ se: { t: 'minha_vida_abaixo', pct: 50 }, faca: { t: 'usar_item' } }] });
    applyCommand(w, p, { id: 2, c: 'auto', on: true });
    p.hp = p.stats.hpMax * 0.4;
    const n = p.loadout!.itemCount!;
    step(w);
    expect(p.loadout!.itemCount).toBe(n - 1);
    expect(p.hp).toBeGreaterThan(p.stats.hpMax * 0.7);
  });
});

describe('ganchos', () => {
  it('registro: padrão não faz nada; os do protótipo existem', () => {
    expect(hasHook('desconstruido')).toBe(true);
    expect(hasHook('turne_mundial')).toBe(true);
    expect(() => getHook('nao_existe')({} as never)).not.toThrow();
    let n = 0;
    registerHook('teste_sim', () => n++);
    getHook('teste_sim')({} as never);
    expect(n).toBe(1);
  });

  it('Desconstruído: cada golpe que o Peão segura cura um aliado', () => {
    const w = createWorld(arena(), 1);
    const p = spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', x: 10, y: 15 });
    const amigo = spawnPlayer(w, { name: 'Li', archetypeId: 'idol', x: 11, y: 16 });
    amigo.hp = amigo.stats.hpMax * 0.5;
    const s = spawnEnemy(w, 'capanga_do_capataz', 11.2, 15);
    p.loadout!.especial = 'virada_peao_brabo';
    p.special = 1;
    expect(castAbility(w, p, 'virada_peao_brabo')).toBe(true);
    expect(statusOf(p, 'desconstruido')).toBeDefined();
    const hp = amigo.hp;
    dealDamage(w, s, p, 1);
    expect(amigo.hp).toBeGreaterThan(hp);
  });

  it('Turnê Mundial: o Fanchant pega o grupo inteiro e zera as recargas do grupo', () => {
    const w = createWorld(arena(), 1);
    const p = spawnPlayer(w, { name: 'Li', archetypeId: 'idol', x: 10, y: 15 });
    const longe = spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', x: 25, y: 25 });
    // o grupo é o partyId (vale a qualquer distância); um estranho sem grupo longe não entra
    p.partyId = longe.partyId = 'g1';
    const estranho = spawnPlayer(w, { name: 'Estranho', archetypeId: 'peao_brabo', x: 25, y: 5 });
    castAbility(w, estranho, 'casca_grossa');
    castAbility(w, longe, 'casca_grossa');
    castAbility(w, p, 'fanchant');
    p.special = 1;
    p.loadout!.especial = 'virada_idol';
    stepN(w, 20);
    expect(castAbility(w, p, 'virada_idol')).toBe(true);
    expect(p.cooldowns['fanchant']).toBeUndefined();
    stepN(w, 20);
    castAbility(w, longe, 'casca_grossa');
    expect(longe.cooldowns['casca_grossa']).toBeDefined();
    expect(castAbility(w, p, 'fanchant')).toBe(true);
    expect(statusOf(longe, 'reforco:speed')).toBeDefined();
    expect(longe.cooldowns['casca_grossa']).toBeUndefined();
    expect(statusOf(estranho, 'reforco:speed')).toBeUndefined();
    expect(estranho.cooldowns['casca_grossa']).toBeDefined();
  });
});
