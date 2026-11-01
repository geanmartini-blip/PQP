/**
 * Fase 5: itens do piloto. Equipar muda os stats (no registro e no combate), classe travada,
 * benzimento e calibração, os 2 únicos disparando, visual por ala no lookOf e drop com raridade.
 */
import { describe, expect, it } from 'vitest';
import { getData } from '../src/data';
import {
  benzer,
  calibrar,
  canEquip,
  concluirBenzimentos,
  desequipar,
  equipar,
  equipmentStats,
  itemNivel,
  itemStatsOf,
  itensView,
  lookOf,
  NIVEL_KEY,
  newPlayerRecord,
  setFiltroRaridade,
  simSpawnExtrasOf,
  type PlayerRecord,
} from '../src/game/index';
import { GAME_MSG } from '../src/net/game';
import { castAbility, createWorld, pickupAction, spawnEnemy, spawnLoot, spawnPlayer, step, type Entity } from '../src/sim/index';
import { tickTalentPassives } from '../src/sim/passives';
import { tickRewards } from '../src/sim/rewards';
import { relevel } from '../src/sim/spawn';
import { applyEquipment, resolveKit, statRowAt } from '../src/sim/stats';
import { arena, freeze } from '../src/sim/testkit';

const D = () => getData();
const T0 = 5_000_000;

/** Registro na margem, já com ala (sem passar pelas missões). */
function rec(arch: string, level = 12): PlayerRecord {
  const a = D().archetypesById.get(arch)!;
  const r = newPlayerRecord(`p_${arch}`, 'Teste');
  r.criado = true;
  r.stage = 'margem';
  r.side = a.margem;
  r.class = a.classe;
  r.institution = a.instituicao;
  r.archetype = a.id;
  r.level = level;
  return r;
}

function dar(r: PlayerRecord, ...ids: string[]): void {
  r.inventory.push(...ids);
}

const statOf = (list: { stat: string; pct: number }[], s: string) => list.find((x) => x.stat === s)?.pct;

describe('equipar e desequipar', () => {
  it('equipar muda os stats do registro e do combate; desequipar volta', () => {
    const r = rec('peao_brabo');
    dar(r, 'peito_combatente_esquerda_comum', 'peito_combatente_esquerda_raro');
    expect(equipar(r, 'peito_combatente_esquerda_comum').ok).toBe(true);
    expect(r.equipment['peito']).toBe('peito_combatente_esquerda_comum');
    expect(r.inventory).not.toContain('peito_combatente_esquerda_comum');
    expect(equipmentStats(r)).toEqual({ hp: 6, defense: 5, evasion: 3, resourceMax: 5 });

    // no combate: vida máxima +6% e defesa +5% (stats.pct)
    const w = createWorld(arena(), 1);
    const sem = spawnPlayer(w, { name: 'Sem', archetypeId: 'peao_brabo', level: 12, x: 5, y: 5 });
    const com = spawnPlayer(w, { name: 'Com', archetypeId: 'peao_brabo', level: 12, x: 7, y: 5, ...simSpawnExtrasOf(r) });
    expect(com.stats.hpMax).toBeCloseTo(sem.stats.hpMax * 1.06, 6);
    expect(com.hp).toBeCloseTo(com.stats.hpMax, 6);
    expect(com.stats.pct['defense']).toBeCloseTo((sem.stats.pct['defense'] ?? 0) + 0.05, 6);
    // subir de nível mantém a vida do item
    relevel(w, com, 13);
    expect(com.stats.hpMax).toBeCloseTo(statRowAt(resolveKit('peao_brabo'), 13).vida * 1.06, 6);
    // trocar no meio do mapa: tirar tudo volta ao normal
    applyEquipment(com, undefined);
    expect(com.stats.hpMax).toBeCloseTo(statRowAt(resolveKit('peao_brabo'), 13).vida, 6);
    expect(com.stats.pct['defense'] ?? 0).toBeCloseTo(sem.stats.pct['defense'] ?? 0, 9);

    // trocar pelo raro: o comum volta para a mochila e o raro soma o extra
    const tro = equipar(r, 'peito_combatente_esquerda_raro');
    expect(tro.ok && tro.saiu).toBe('peito_combatente_esquerda_comum');
    expect(r.inventory).toContain('peito_combatente_esquerda_comum');
    const st = equipmentStats(r);
    expect(st['hp']).toBeGreaterThanOrEqual(8);
    expect(Object.keys(st).length).toBeGreaterThanOrEqual(2);

    expect(desequipar(r, 'peito').ok).toBe(true);
    expect(r.equipment['peito']).toBeUndefined();
    expect(r.inventory).toContain('peito_combatente_esquerda_raro');
    expect(equipmentStats(r)).toEqual({});
    expect(desequipar(r, 'peito').ok).toBe(false);
    expect(simSpawnExtrasOf(r).equipment).toBeUndefined();
  });

  it('5 slots (a calça entrou na armadura), um de cada: a arma não ocupa o lugar da cabeça', () => {
    const r = rec('peao_brabo');
    const ids = ['cabeca', 'peito', 'arma', 'calcado', 'adorno'].map((s) => `${s}_combatente_esquerda_comum`);
    dar(r, ...ids);
    for (const id of ids) expect(equipar(r, id).ok).toBe(true);
    expect(Object.keys(r.equipment).sort()).toEqual(['adorno', 'arma', 'cabeca', 'calcado', 'peito']);
    expect(r.inventory).toEqual([]);
    const v = itensView(r);
    expect(Object.keys(v.equipados).length).toBe(5);
  });

  it('class_lock: item de outra classe não veste; sem classe veste; nível mínimo', () => {
    const r = rec('peao_brabo');
    dar(r, 'peito_atirador_esquerda_comum', 'cabeca_geral_esquerda_comum', 'jaqueta_do_ze_faisca');
    const c = canEquip(r, 'peito_atirador_esquerda_comum');
    expect(c.ok).toBe(false);
    expect(equipar(r, 'peito_atirador_esquerda_comum').ok).toBe(false);
    expect(r.inventory).toContain('peito_atirador_esquerda_comum');
    expect(equipar(r, 'cabeca_geral_esquerda_comum').ok).toBe(true);
    // item que não está na mochila não veste
    expect(equipar(r, 'calca_combatente_esquerda_comum').ok).toBe(false);
    // nível mínimo (Delta no 7 não veste item de classe do 8)
    const d = newPlayerRecord('d', 'Delta');
    d.level = 7;
    dar(d, 'peito_geral_delta_comum', 'jaqueta_do_ze_faisca');
    expect(equipar(d, 'peito_geral_delta_comum').ok).toBe(true);
    expect(equipar(d, 'jaqueta_do_ze_faisca').ok).toBe(false);
  });

  it('item da outra margem vale a metade', () => {
    const r = rec('peao_brabo');
    expect(statOf(itemStatsOf(r, 'cabeca_geral_direita_comum'), 'accuracy')).toBe(2.5);
    expect(statOf(itemStatsOf(r, 'cabeca_geral_esquerda_comum'), 'accuracy')).toBe(5);
  });
});

describe('benzimento (Esquerda) e calibração (Direita)', () => {
  it('benzimento pede reputação e lições, entra na fila e sobe até o nível máximo', () => {
    const r = rec('peao_brabo');
    const id = 'cabeca_combatente_esquerda_comum';
    dar(r, id);
    const b0 = benzer(r, id, T0);
    expect(b0.ok).toBe(false);
    // reputação e uma lição (primeiro degrau de uma lição)
    r.counters[`reputacao:${r.institution}`] = 50;
    const lic = D().lessons.licoes.find((l) => l.tipo === 'licao')!;
    r.counters[`visitas:${lic.lugar}`] = lic.degraus![0]!.visitas;
    const b1 = benzer(r, id, T0);
    expect(b1.ok).toBe(true);
    expect(b1.ok && b1.prontoEm).toBe(T0 + D().items.benzimento.niveis[0]!.filaS! * 1000);
    expect(itemNivel(r, id)).toBe(0);
    // uma peça por vez
    expect(benzer(r, id, T0 + 1000).ok).toBe(false);
    // não gasta moeda nem reputação
    expect(r.semente).toBe(0);
    expect(r.counters[`reputacao:${r.institution}`]).toBe(50);
    expect(concluirBenzimentos(r, T0 + 30_000)).toEqual([id]);
    expect(itemNivel(r, id)).toBe(1);
    expect(statOf(itemStatsOf(r, id), 'accuracy')).toBe(5.4); // 5 x 1,08
    // nível 2 pede reputação 150
    expect(benzer(r, id, T0 + 40_000).ok).toBe(false);
    // teto do comum: 3
    r.counters[NIVEL_KEY(id)] = 3;
    r.counters[`reputacao:${r.institution}`] = 10_000;
    const bm = benzer(r, id, T0 + 50_000);
    expect(bm.ok).toBe(false);
    expect(!bm.ok && bm.erro).toMatch(/máximo/);
    // item da Direita não passa pela benzedeira
    dar(r, 'cabeca_geral_direita_comum');
    const bd = benzer(r, 'cabeca_geral_direita_comum', T0 + 60_000);
    expect(bd.ok).toBe(false);
  });

  it('calibração paga em Crédito, sobe na hora e só para a Direita', () => {
    const r = rec('idol');
    const id = 'peito_mascarado_direita_comum';
    dar(r, id);
    r.credito = 120;
    const c1 = calibrar(r, id);
    expect(c1.ok).toBe(true);
    expect(r.credito).toBe(70);
    expect(itemNivel(r, id)).toBe(1);
    expect(statOf(itemStatsOf(r, id), 'hp')).toBe(6.5); // 6 x 1,08 = 6,48
    // nível 2 custa 100: sem saldo, falha sem mexer
    const c2 = calibrar(r, id);
    expect(c2.ok).toBe(false);
    expect(r.credito).toBe(70);
    expect(itemNivel(r, id)).toBe(1);
    // lugar errado
    r.credito = 1000;
    expect(calibrar(r, id, 'casa_da_assembleia').ok).toBe(false);
    expect(calibrar(r, id, 'torre_do_consorcio').ok).toBe(true);
    expect(itemNivel(r, id)).toBe(2);
    // a Esquerda não calibra; a Direita não benze
    const e = rec('peao_brabo');
    dar(e, 'cabeca_geral_esquerda_comum');
    e.credito = 1000;
    expect(calibrar(e, 'cabeca_geral_esquerda_comum').ok).toBe(false);
    expect(benzer(r, id, T0).ok).toBe(false);
  });

  it('item melhorado leva o bônus para o combate', () => {
    const r = rec('idol');
    const id = 'peito_mascarado_direita_comum';
    dar(r, id);
    r.credito = 1000;
    expect(equipar(r, id).ok).toBe(true);
    const hp0 = equipmentStats(r)['hp']!;
    expect(calibrar(r, id).ok).toBe(true);
    expect(calibrar(r, id).ok).toBe(true);
    expect(equipmentStats(r)['hp']!).toBeCloseTo(hp0 * 1.16, 1);
  });
});

/** Junta os eventos de cada tick. */
function run(w: ReturnType<typeof createWorld>, ticks: number, onEv: (ev: (typeof w.events)[number]) => void): void {
  for (let i = 0; i < ticks; i++) {
    step(w);
    for (const ev of w.events) onEv(ev);
  }
}

describe('os 2 únicos do piloto disparam no combate', () => {
  const D0 = () => D().uniques.unicos.filter((u) => u.piloto).map((u) => u.id).sort();

  it('os únicos do piloto são a Jaqueta do Zé Faísca e os Fones de Rosa Tavares', () => {
    expect(D0()).toEqual(['fones_de_rosa_tavares', 'jaqueta_do_ze_faisca']);
  });

  function stunsWith(jaqueta: boolean): number {
    const r = rec('peao_brabo');
    if (jaqueta) {
      dar(r, 'jaqueta_do_ze_faisca');
      expect(equipar(r, 'jaqueta_do_ze_faisca').ok).toBe(true);
    }
    const w = createWorld(arena(), 7);
    const p = spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', level: 12, x: 11, y: 15, ...simSpawnExtrasOf(r) });
    expect(p.attr?.alcance).toBe(1);
    const c = spawnEnemy(w, 'capanga_do_capataz', 10, 15);
    freeze(c);
    c.stats.attack = 0;
    c.stats.hpMax = c.hp = 1e9;
    let n = 0;
    (c.ai as { abilities: string[] }).abilities = []; // sem empurrão: só apanha
    let hits = 0;
    run(w, 800, (ev) => {
      if (ev.t === 'hit' && ev.src === p.id) hits++;
      if (ev.t === 'status' && ev.on && ev.kind === 'atordoar' && ev.dst === c.id) n++;
    });
    expect(hits).toBeGreaterThan(20);
    return n;
  }

  it('Jaqueta do Zé Faísca: ao acertar de perto, às vezes atordoa', () => {
    expect(stunsWith(false)).toBe(0);
    expect(stunsWith(true)).toBeGreaterThan(0);
  });

  function avisoWith(fones: boolean): { p: Entity; marcado: boolean } {
    const r = rec('idol');
    if (fones) {
      dar(r, 'fones_de_rosa_tavares');
      expect(equipar(r, 'fones_de_rosa_tavares').ok).toBe(true);
    }
    const w = createWorld(arena(), 1);
    const p = spawnPlayer(w, { name: 'Idol', archetypeId: 'idol', level: 12, x: 11.2, y: 15, ...simSpawnExtrasOf(r) });
    p.loadout!.basico = '';
    const c = spawnEnemy(w, 'capanga_do_capataz', 10, 15);
    freeze(c);
    expect(castAbility(w, c, 'capanga_do_capataz_cobranca_amigavel', { targetId: p.id })).toBe(true);
    tickTalentPassives(w);
    const tel = w.telegraphs[0]!;
    return { p, marcado: (tel.avisoAntecipadoPara ?? []).includes(p.id) };
  }

  it('Fones de Rosa Tavares: o aviso no chão chega antes (tempo a mais para sair da área)', () => {
    const sem = avisoWith(false);
    expect(sem.marcado).toBe(false);
    expect(sem.p.statuses.some((s) => s.kind === 'reforco:moveSpeed')).toBe(false);
    const com = avisoWith(true);
    expect(com.marcado).toBe(true);
    const st = com.p.statuses.find((s) => s.kind === 'reforco:moveSpeed' && s.abilityId?.startsWith('aviso:'));
    expect(st).toBeDefined();
    expect(st!.value).toBeGreaterThan(0);
  });
});

describe('visual por ala no lookOf', () => {
  it('o mesmo item sem classe adota o estilo de cada ala; a raridade aparece', () => {
    const a = rec('peao_brabo');
    const b = rec('iogue_furioso');
    for (const r of [a, b]) {
      dar(r, 'cabeca_geral_esquerda_comum');
      expect(equipar(r, 'cabeca_geral_esquerda_comum').ok).toBe(true);
    }
    expect(lookOf(a).items).toEqual([{ slot: 'cabeca', rarity: 'comum', art: 'peao_brabo_cabeca_comum' }]);
    expect(lookOf(b).items).toEqual([{ slot: 'cabeca', rarity: 'comum', art: 'iogue_furioso_cabeca_comum' }]);
    // raro ganha detalhe (sufixo raro)
    dar(a, 'cabeca_combatente_esquerda_raro');
    expect(equipar(a, 'cabeca_combatente_esquerda_raro').ok).toBe(true);
    expect(lookOf(a).items).toEqual([{ slot: 'cabeca', rarity: 'raro', art: 'peao_brabo_cabeca_raro' }]);
    // único tem visual próprio
    dar(a, 'jaqueta_do_ze_faisca');
    expect(equipar(a, 'jaqueta_do_ze_faisca').ok).toBe(true);
    expect(lookOf(a).items).toContainEqual({ slot: 'peito', rarity: 'unico', art: 'unico_jaqueta_do_ze_faisca' });
    // a silhueta da ala continua: o traje segue o da ala
    expect(lookOf(a).outfit.archetypeId).toBe('peao_brabo');
  });

  it('sem ala: Delta e uniforme da instituição', () => {
    const d = newPlayerRecord('d', 'Delta');
    dar(d, 'peito_geral_delta_comum');
    expect(equipar(d, 'peito_geral_delta_comum').ok).toBe(true);
    expect(lookOf(d).items).toEqual([{ slot: 'peito', rarity: 'comum', art: 'delta_peito_comum' }]);
    const i = rec('peao_brabo', 9);
    i.archetype = null;
    dar(i, 'peito_geral_esquerda_raro');
    expect(equipar(i, 'peito_geral_esquerda_raro').ok).toBe(true);
    expect(lookOf(i).items).toEqual([{ slot: 'peito', rarity: 'raro', art: `${i.institution}_peito_raro` }]);
  });
});

describe('drop de itens no saque, com filtro de raridade', () => {
  it('o drop respeita a raridade, a margem e a classe de quem rola', () => {
    const w = createWorld(arena(), 3);
    const p = spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', level: 12, x: 15, y: 15 });
    for (let i = 0; i < 300; i++) {
      const e = spawnEnemy(w, 'capanga_do_capataz', 15, 15, { tier: 'elite' });
      e.dead = true;
      tickRewards(w);
      w.entities.delete(e.id);
    }
    const loots = Array.from(w.entities.values()).filter((e) => e.kind === 'loot' && e.loot?.rarity);
    expect(loots.length).toBeGreaterThan(20);
    const seen = new Set<string>();
    for (const l of loots) {
      const id = l.loot!.itemId!;
      const it = D().itemsById.get(id);
      const un = D().uniquesById.get(id);
      expect(it ?? un).toBeDefined();
      expect(l.loot!.rarity).toBe(it?.rarity ?? 'unico');
      seen.add(l.loot!.rarity!);
      if (it) {
        expect([null, p.side]).toContain(it.margem);
        expect([null, p.classId]).toContain(it.classLock);
      } else {
        expect(un!.piloto).toBe(true);
      }
    }
    expect(seen.has('comum')).toBe(true);
    expect(seen.has('raro')).toBe(true);
  });

  it('filtro de raridade do registro chega na coleta: com raro, o comum fica no chão', () => {
    const r = rec('peao_brabo');
    expect(setFiltroRaridade(r, 'lendario').ok).toBe(false);
    expect(setFiltroRaridade(r, 'raro').ok).toBe(true);
    const w = createWorld(arena(), 1);
    const p = spawnPlayer(w, { name: 'Peão', archetypeId: 'peao_brabo', level: 12, x: 10, y: 15, ...simSpawnExtrasOf(r) });
    expect(p.lootFilter).toBe('raro');
    const comum = spawnLoot(w, 10.2, 15, { itemId: 'cabeca_geral_esquerda_comum', rarity: 'comum' });
    const raro = spawnLoot(w, 10.2, 15.1, { itemId: 'cabeca_geral_esquerda_raro', rarity: 'raro' });
    expect(pickupAction(p, comum)).toBe('deixar');
    expect(pickupAction(p, raro)).toBe('pegar');
    step(w);
    expect(w.entities.has(comum.id)).toBe(true);
    expect(p.inventory).toContain('cabeca_geral_esquerda_raro');
  });
});

describe('mensagens', () => {
  it('equipar, desequipar, benzer, calibrar e filtro_raridade em GAME_MSG', () => {
    expect(GAME_MSG.equipar).toBe('equipar');
    expect(GAME_MSG.desequipar).toBe('desequipar');
    expect(GAME_MSG.benzer).toBe('benzer');
    expect(GAME_MSG.calibrar).toBe('calibrar');
    expect(GAME_MSG.filtroRaridade).toBe('filtro_raridade');
  });
});
