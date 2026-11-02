/**
 * Regras da Fase 3 (shared/game e o que vale no combate): missões de entrada das 8 instituições,
 * patentes, ala no nível 12, loadout e botão 3, talentos do 10, 15 e 20 (mudam dano e recarga),
 * bônus e falas do guia, treinadores, bordão como emote e story_flags.
 */
import { describe, expect, it } from 'vitest';
import { getData } from '../src/data';
import {
  activeTalents,
  applyRewards,
  applyTravessia,
  archetypeOptions,
  canChooseArchetype,
  chooseArchetype,
  createCharacter,
  defaultAppearance,
  deltaChainMissions,
  dialogOption,
  dialogOptions,
  FLAG_BRUNO,
  institutionInfo,
  loadoutOf,
  lookOf,
  missionBoard,
  newPlayerRecord,
  onGameEvent,
  payObjective,
  pendingTalentLevels,
  pickTalent,
  profileOf,
  progressOptions,
  raiseToLevel,
  rankView,
  refreshMissions,
  setFlag,
  setSlot3,
  simKitOf,
  simSpawnExtrasOf,
  talentOptions,
  talkTo,
  unlockedEmotes,
  useEmote,
  type GameEvent,
  type PlayerRecord,
} from '../src/game/index';
import { GAME_MSG } from '../src/net/game';
import { dealDamage } from '../src/sim/combat';
import { statPts } from '../src/sim/entity';
import { baseAbilityId } from '../src/sim/passiveDefs';
import { tickTalentPassives } from '../src/sim/passives';
import { createWorld } from '../src/sim/world';
import { spawnEnemy, spawnPlayer, type SpawnPlayerOpts } from '../src/sim/spawn';
import { stepN } from '../src/sim/step';
import { arena } from '../src/sim/testkit';
import type { Entity, World } from '../src/sim/types';

type Side = 'esquerda' | 'direita';

const GUIA_PADRAO: Record<Side, string> = { esquerda: 'curupira', direita: 'byte' };

/** Registro recém-atravessado: Delta feito (sem jogar), travessia com a instituição e o guia. */
function crossed(side: Side, institution: string, guide = GUIA_PADRAO[side]): PlayerRecord {
  const rec = newPlayerRecord('p3', 'Visitante');
  expect(createCharacter(rec, 'Zé da Fase Três', defaultAppearance()).ok).toBe(true);
  rec.missions = { ativas: [], concluidas: deltaChainMissions().filter((m) => m !== 'travessia_08'), progresso: {} };
  setFlag(rec, FLAG_BRUNO);
  refreshMissions(rec);
  const t = applyTravessia(rec, { side, institution, guide });
  expect(t.ok).toBe(true);
  return rec;
}

const feed = (rec: PlayerRecord, evs: GameEvent[]) => evs.map((e) => onGameEvent(rec, e));
const times = (n: number, ev: GameEvent): GameEvent[] => Array.from({ length: n }, () => ev);

/** Cadeia de chegada da margem até a missão de entrada (A Roda / O Primeiro Contrato). */
function arrive(rec: PlayerRecord): void {
  if (rec.side === 'esquerda') {
    feed(rec, [{ t: 'arrive', placeId: 'casa_da_assembleia' }, { t: 'talk', npcId: 'ilaria_vesta' }]);
    expect(rec.missions.concluidas).toContain('roda_01_apresentacao');
  } else {
    feed(rec, [{ t: 'arrive', placeId: 'torre_do_consorcio' }, { t: 'interact', alvo: 'termos_de_uso', acao: 'aceitar' }]);
    expect(rec.missions.concluidas).toContain('contrato_01_ativacao');
  }
  expect(rec.story_flags).toContain('guia_escolhido');
}

/** Joga a missão de entrada de cada instituição. */
const ENTRADAS: Record<string, { side: Side; play: (rec: PlayerRecord) => void }> = {
  brigada_popular: {
    side: 'esquerda',
    play: (rec) =>
      feed(rec, [
        { t: 'arrive', placeId: 'sede_brigada_popular' },
        { t: 'choose', opcao: 'pratico' },
        { t: 'arrive', regionId: 'juncal' },
        ...times(6, { t: 'kill', enemyId: 'contrabandista', tier: 'normal' }),
        { t: 'kill', enemyId: 'contrabandista', tier: 'elite' },
      ]),
  },
  guarda_comunitaria: {
    side: 'esquerda',
    play: (rec) =>
      feed(rec, [
        ...times(7, { t: 'interact', alvo: 'guarita', acao: 'fazer_ronda' }),
        { t: 'choose', opcao: 'deixar' },
        ...times(5, { t: 'kill', enemyId: 'contrabandista' }),
      ]),
  },
  escola_dos_saberes: {
    side: 'esquerda',
    play: (rec) => {
      feed(rec, [{ t: 'talk', npcId: 'seamus' }, { t: 'arrive', placeId: 'mata_do_curupira' }, { t: 'survive', segundos: 100 }, { t: 'survive', segundos: 80 }]);
      // "converse com o seu espírito": o apelido 'guia' é o guia do registro
      const d = talkTo(rec, 'guia');
      expect(d.dialogo.guia).toBe(true);
      expect(d.dialogo.nome).toBe(getData().guidesById.get('curupira')!.name);
    },
  },
  trupe_do_povo: {
    side: 'esquerda',
    play: (rec) =>
      feed(rec, [{ t: 'talk', npcId: 'tiao' }, { t: 'arrive', placeId: 'praca_do_xadrez' }, { t: 'survive', segundos: 90 }, ...times(5, { t: 'ability', botao: '1' })]),
  },
  torcida_furia_neon: {
    side: 'direita',
    play: (rec) =>
      feed(rec, [
        { t: 'arrive', placeId: 'estadio_das_margens' },
        { t: 'survive', segundos: 90 },
        ...times(6, { t: 'kill', enemyId: 'capanga_do_capataz', tier: 'normal' }),
        { t: 'kill', enemyId: 'capanga_do_capataz', tier: 'elite' },
      ]),
  },
  pm_do_consorcio: {
    side: 'direita',
    play: (rec) =>
      feed(rec, [
        ...times(3, { t: 'interact', alvo: 'prova_do_concurso', acao: 'responder' }),
        ...times(6, { t: 'ability', botao: '2' }),
        ...times(5, { t: 'kill', enemyId: 'drone_de_cobranca' }),
        { t: 'interact', alvo: 'contrato_da_pm', acao: 'assinar' },
      ]),
  },
  universidade_neon: {
    side: 'direita',
    play: (rec) => {
      feed(rec, [...times(3, { t: 'interact', alvo: 'vestibular', acao: 'responder' }), { t: 'survive', segundos: 60 }]);
      const c0 = rec.credito;
      const p = payObjective(rec);
      expect(p.ok).toBe(true);
      // paga a mensalidade (30) e a missão conclui com a recompensa solo (50 Créditos)
      expect(rec.credito).toBe(c0 - 30 + 50);
    },
  },
  agencia_neon: {
    side: 'direita',
    play: (rec) =>
      feed(rec, [
        { t: 'interact', alvo: 'palco_de_audicao', acao: 'fazer_audicao' },
        { t: 'interact', alvo: 'contrato_de_exclusividade', acao: 'assinar' },
        ...times(8, { t: 'kill', enemyId: 'drone_de_cobranca' }),
        { t: 'arrive', placeId: 'predios_de_capsulas' },
        { t: 'arrive', placeId: 'sede_agencia_neon' },
        { t: 'arrive', placeId: 'torre_do_consorcio' },
        { t: 'arrive', placeId: 'predios_de_capsulas' },
      ]),
  },
};

/** Registro que já entrou na instituição (missão de entrada feita). */
function entered(institution: string, guide?: string): PlayerRecord {
  const e = ENTRADAS[institution]!;
  const rec = crossed(e.side, institution, guide);
  arrive(rec);
  e.play(rec);
  expect(rec.missions.concluidas).toContain(`entrada_${institution}`);
  return rec;
}

describe('instituições: as 8 missões de entrada', () => {
  for (const inst of Object.keys(ENTRADAS)) {
    it(`entrada_${inst}: aceita sozinha depois da chegada, conclui, dá uniforme, reputação e as flags`, () => {
      const e = ENTRADAS[inst]!;
      const rec = crossed(e.side, inst);
      // antes da cadeia de chegada, a entrada ainda não abre
      expect(rec.missions.ativas).not.toContain(`entrada_${inst}`);
      arrive(rec);
      expect(rec.missions.ativas).toContain(`entrada_${inst}`);
      // só a entrada da própria instituição
      for (const o of Object.keys(ENTRADAS)) if (o !== inst) expect(rec.missions.ativas).not.toContain(`entrada_${o}`);
      const xp0 = rec.level * 1e6 + rec.xp;
      e.play(rec);
      expect(rec.missions.concluidas).toContain(`entrada_${inst}`);
      expect(rec.story_flags).toEqual(expect.arrayContaining(['entrou_instituicao', `entrou_${inst}`]));
      expect(rec.unlocks).toEqual(expect.arrayContaining(['classe', 'uniforme_instituicao']));
      expect(rec.counters[`reputacao:${inst}`]).toBe(100);
      // luta com o treinador junto (aliadosIA) conta como grupo: dá XP
      expect(rec.level * 1e6 + rec.xp).toBeGreaterThan(xp0);
    });
  }

  it('quadro de missões, loja, quem treina a base e patentes da instituição', () => {
    const rec = crossed('esquerda', 'brigada_popular');
    const info = institutionInfo(rec)!;
    expect(info.baseTrainer).toEqual({ id: 'jacques', name: getData().trainersById.get('jacques')!.name });
    expect(info.treinadores.map((t) => t.id).sort()).toEqual(['dev_kumar', 'jacques', 'wesley']);
    expect(info.patentes[0]).toBe('Brigadista');
    expect(info.missaoEntrada.id).toBe('entrada_brigada_popular');
    expect(info.loja?.id).toBe('loja_brigada_popular');
    // item raro pede Militante: trancado para o Membro
    const raro = info.loja!.itens.find((i) => i.patenteMin === 'militante')!;
    expect(raro.liberado).toBe(false);
    expect(info.loja!.itens.find((i) => i.item === 'pocao')!.liberado).toBe(true);
    const quadro = missionBoard(rec, 'brigada_popular');
    expect(quadro.map((q) => q.id)).toContain('entrada_brigada_popular');
    expect(quadro.map((q) => q.id)).toContain('escolha_da_ala_esquerda');
    expect(rankView(rec)).toMatchObject({ margem: { id: 'membro' }, instituicao: 'Brigadista', reputacao: 0 });
  });

  it('patente sobe com a reputação da instituição (Membro -> Militante, Brigadista -> Cabo do Povo)', () => {
    const rec = entered('brigada_popular');
    expect(rec).toMatchObject({ rank: 'membro', institution_rank: 'Brigadista' });
    const r1 = applyRewards(rec, [{ kind: 'reputacao', quantidade: 400 }]);
    expect(rec.rank).toBe('membro'); // 500 de 600
    expect(r1.avisos.some((a) => a.startsWith('Nova patente'))).toBe(false);
    const r2 = applyRewards(rec, [{ kind: 'reputacao', quantidade: 100 }]);
    expect(rec).toMatchObject({ rank: 'militante', institution_rank: 'Cabo do Povo' });
    expect(r2.avisos.some((a) => a.startsWith('Nova patente'))).toBe(true);
    expect(rankView(rec).proxima).toBeNull(); // Conselheiro fica fora do piloto
  });
});

describe('ala no nível 10', () => {
  it('pede entrada na instituição e nível 10; recusa ala de outra classe e de outra instituição', () => {
    const sem = crossed('esquerda', 'brigada_popular');
    raiseToLevel(sem, 10);
    expect(canChooseArchetype(sem).ok).toBe(false); // sem a missão de entrada
    const rec = entered('brigada_popular');
    rec.level = 9;
    expect(chooseArchetype(rec, 'peao_brabo').ok).toBe(false); // nível 9
    raiseToLevel(rec, 10);
    // classe errada (Babushka é Atirador)
    const errada = chooseArchetype(rec, 'babushka');
    expect(errada.ok).toBe(false);
    expect(!errada.ok && errada.erro).toMatch(/classe/);
    // mesma classe, outra instituição (Sumô Cibernético é Combatente da Torcida)
    const outra = chooseArchetype(rec, 'sumo_cibernetico');
    expect(outra.ok).toBe(false);
    expect(!outra.ok && outra.erro).toMatch(/instituição/);
    expect(archetypeOptions(rec).map((a) => a.id)).toEqual(['peao_brabo', 'iogue_furioso', 'cidadao_revolucionario']);
    const ok = chooseArchetype(rec, 'peao_brabo');
    expect(ok.ok).toBe(true);
    expect(rec.archetype).toBe('peao_brabo');
    expect(simKitOf(rec)).toBe('peao_brabo');
    expect(chooseArchetype(rec, 'iogue_furioso').ok).toBe(false); // não troca no piloto
  });

  it('missão A Ala: quem recebe a base dá, a escolha sai no diálogo, o treinador da ala conversa e libera o bordão', () => {
    const rec = entered('brigada_popular');
    raiseToLevel(rec, 10);
    const d0 = talkTo(rec, 'jacques');
    expect(d0.dialogo.missaoAla).toMatchObject({ id: 'escolha_da_ala_esquerda', estado: 'disponivel' });
    expect(dialogOptions(rec, 'jacques').map((o) => o.id)).toContain('aceitar:escolha_da_ala_esquerda');
    expect(dialogOption(rec, 'jacques', 'aceitar:escolha_da_ala_esquerda').ok).toBe(true);
    talkTo(rec, 'jacques'); // "fale com quem treinou a sua base"
    const opts = dialogOptions(rec, 'jacques').filter((o) => o.tipo === 'escolher_ala').map((o) => o.id);
    expect(opts).toEqual(['ala:peao_brabo', 'ala:iogue_furioso', 'ala:cidadao_revolucionario']);
    expect(dialogOption(rec, 'jacques', 'ala:peao_brabo').ok).toBe(true);
    const w = talkTo(rec, 'wesley'); // "conheça o seu treinador"
    expect(w.dialogo.contexto).toBe('treino');
    expect(w.dialogo.bordao).toBe(getData().trainersById.get('wesley')!.bordao);
    expect(w.dialogo.emote).toMatchObject({ id: 'emote_wesley', novo: true });
    feed(rec, [...times(3, { t: 'ability', botao: '1' }), ...times(3, { t: 'ability', botao: '2' })]);
    expect(rec.missions.concluidas).toContain('escolha_da_ala_esquerda');
    expect(rec.story_flags).toContain('ala_escolhida');
    expect(rec.unlocks).toEqual(expect.arrayContaining(['traje_aprendiz', 'bordao_emote']));
  });

  it('A Ala não abre antes do 10 (sem a tolerância de nível)', () => {
    const rec = entered('brigada_popular');
    rec.level = 8;
    expect(dialogOptions(rec, 'jacques').map((o) => o.id)).not.toContain('aceitar:escolha_da_ala_esquerda');
  });

  it('traje: uniforme no 8, aprendiz no 12 com a ala e veterano no 20, pelo lookOf', () => {
    const rec = entered('brigada_popular');
    expect(lookOf(rec).outfit.tier).toBe('base');
    raiseToLevel(rec, 12);
    chooseArchetype(rec, 'peao_brabo');
    expect(lookOf(rec).outfit).toMatchObject({ tier: 'aprendiz', archetypeId: 'peao_brabo', palette: 0 });
    raiseToLevel(rec, 20);
    expect(lookOf(rec).outfit).toMatchObject({ tier: 'veterano', archetypeId: 'peao_brabo' });
  });
});

describe('loadout', () => {
  it('8 a 11: os 3 botões da classe; 12+: marcas 1 e 2, botão 3 da classe (escolhível) e o Especial da classe', () => {
    const rec = entered('pm_do_consorcio');
    const cls = getData().classesById.get('atirador')!;
    expect(loadoutOf(rec)).toMatchObject({ b1: cls.loadoutPreAla.botoes[0], b2: cls.loadoutPreAla.botoes[1], b3: cls.loadoutPreAla.botoes[2], especial: cls.special, slot3Opcoes: [] });
    expect(setSlot3(rec, cls.abilities[1]!).ok).toBe(false); // antes da ala
    raiseToLevel(rec, 12);
    expect(chooseArchetype(rec, 'cowboy_cromado').ok).toBe(true);
    const a = getData().archetypesById.get('cowboy_cromado')!;
    const l = loadoutOf(rec)!;
    expect([l.b1, l.b2]).toEqual([a.habilidadesMarca.marca_1, a.habilidadesMarca.marca_2]);
    expect(cls.abilities).toContain(l.b3);
    expect(l.especial).toBe(cls.special);
    expect(l.slot3Opcoes).toEqual(cls.abilities);
    // troca o botão 3
    const outro = cls.abilities.find((x) => x !== l.b3)!;
    expect(setSlot3(rec, outro).ok).toBe(true);
    expect(setSlot3(rec, 'arrancada').ok).toBe(false); // de outra classe
    expect(loadoutOf(rec)!.b3).toBe(outro);
    expect(rec.loadout.botoes).toEqual([a.habilidadesMarca.marca_1, a.habilidadesMarca.marca_2, outro]);
    // a simulação nasce com os mesmos botões
    const w = createWorld(arena(), 1);
    const e = spawnPlayer(w, { name: rec.name, archetypeId: simKitOf(rec), level: rec.level, x: 5, y: 5, ...simSpawnExtrasOf(rec) });
    expect([e.loadout!.b1, e.loadout!.b2, e.loadout!.b3, e.loadout!.especial]).toEqual([l.b1, l.b2, outro, cls.special]);
    expect(profileOf(rec).loadout?.b3).toBe(outro);
  });
});

/** Dois mundos iguais (mesma semente): um com as opções extras, outro sem. */
function twin(opts: Partial<SpawnPlayerOpts>, base: Partial<SpawnPlayerOpts> = {}): { w: World; p: Entity; foe: Entity }[] {
  return [opts, {}].map((extra) => {
    const w = createWorld(arena(), 7);
    const p = spawnPlayer(w, { name: 'P', archetypeId: 'iogue_furioso', level: 20, x: 5, y: 5, playerId: 'p', ...base, ...extra });
    const foe = spawnEnemy(w, 'contrabandista', 6, 5);
    foe.ai = { ...foe.ai, imovel: true, abilities: [], basic: '' };
    return { w, p, foe };
  });
}

describe('talentos do 10, 15 e 20', () => {
  it('opções por grupo (10 instituição, 15 papel, 20 chave), um por nível, e o pendente', () => {
    const rec = entered('brigada_popular');
    raiseToLevel(rec, 10);
    expect(talentOptions(rec, 10).map((t) => t.id).sort()).toEqual(['autocritica', 'ordem_do_dia', 'piquete']);
    expect(pendingTalentLevels(rec)).toEqual([10]);
    expect(pickTalent(rec, 'muralha').ok).toBe(false); // papel, nível 15
    expect(pickTalent(rec, 'ordem_do_dia').ok).toBe(true);
    expect(pickTalent(rec, 'piquete').ok).toBe(false); // já escolheu o do 10
    raiseToLevel(rec, 15);
    expect(talentOptions(rec, 15)).toEqual([]); // papel pede ala
    raiseToLevel(rec, 20);
    chooseArchetype(rec, 'iogue_furioso');
    expect(pendingTalentLevels(rec)).toEqual([15, 20]);
    expect(talentOptions(rec, 15).map((t) => t.id).sort()).toEqual(['embalado', 'execucao', 'golpe_inicial']);
    expect(talentOptions(rec, 20).map((t) => t.id).sort()).toEqual(['chave_bote_em_cadeia', 'chave_furia']);
    expect(pickTalent(rec, 'chave_berrante').ok).toBe(false); // chave do Peão
    expect(pickTalent(rec, 'execucao').ok).toBe(true);
    expect(pickTalent(rec, 'chave_bote_em_cadeia').ok).toBe(true);
    expect(pendingTalentLevels(rec)).toEqual([]);
    expect(activeTalents(rec)).toEqual(['ordem_do_dia', 'execucao', 'chave_bote_em_cadeia']);
    const ex = simSpawnExtrasOf(rec);
    expect(ex.talents).toEqual(['ordem_do_dia', 'execucao', 'chave_bote_em_cadeia']);
    expect(ex.guideId).toBe('curupira');
    const w = createWorld(arena(), 1);
    const e = spawnPlayer(w, { name: 'P', archetypeId: simKitOf(rec), level: rec.level, x: 5, y: 5, ...ex });
    expect(e.talents).toEqual(ex.talents);
    expect(progressOptions(rec).talentos).toEqual([]);
  });

  it('10 (Ordem do Dia): a aura dá +10% de dano e defesa a quem está perto, e o golpe sai mais forte', () => {
    const [com, sem] = twin({ talents: ['ordem_do_dia'] });
    const aliado = spawnPlayer(com!.w, { name: 'A', archetypeId: 'peao_brabo', level: 20, x: 6, y: 7 });
    stepN(com!.w, 5);
    stepN(sem!.w, 5);
    expect(statPts(com!.p, 'damage')).toBe(10);
    expect(statPts(com!.p, 'defense')).toBe(10);
    expect(statPts(aliado, 'damage')).toBe(10);
    expect(statPts(sem!.p, 'damage')).toBe(0);
    for (const x of [com!, sem!]) x.foe.hp = x.foe.stats.hpMax = 1e6;
    const a = dealDamage(com!.w, com!.p, com!.foe, 20, { noCrit: true });
    const b = dealDamage(sem!.w, sem!.p, sem!.foe, 20, { noCrit: true });
    expect(a / b).toBeCloseTo(1.1, 1);
  });

  it('15 (Execução): +50% de dano em alvo com menos de 30% de vida', () => {
    const [com, sem] = twin({ talents: ['execucao'] });
    for (const x of [com!, sem!]) {
      x.foe.stats.hpMax = 1e6;
      x.foe.hp = x.foe.stats.hpMax * 0.2;
    }
    const a = dealDamage(com!.w, com!.p, com!.foe, 20, { noCrit: true });
    const b = dealDamage(sem!.w, sem!.p, sem!.foe, 20, { noCrit: true });
    expect(a / b).toBeCloseTo(1.5, 1);
    // com vida cheia, igual
    const [c2, s2] = twin({ talents: ['execucao'] });
    expect(dealDamage(c2!.w, c2!.p, c2!.foe, 20, { noCrit: true })).toBe(dealDamage(s2!.w, s2!.p, s2!.foe, 20, { noCrit: true }));
  });

  it('20 (Bote em Cadeia): derrotar um inimigo zera a recarga do botão 1', () => {
    const [com, sem] = twin({ talents: ['chave_bote_em_cadeia'] });
    for (const x of [com!, sem!]) {
      const b1 = x.p.loadout!.b1;
      x.p.cooldowns[b1] = x.w.tick + 300;
      dealDamage(x.w, x.p, x.foe, 0, { raw: x.foe.hp + 10 });
      expect(x.foe.dead).toBe(true);
      tickTalentPassives(x.w);
    }
    expect(com!.p.cooldowns[com!.p.loadout!.b1]).toBeUndefined();
    expect(sem!.p.cooldowns[sem!.p.loadout!.b1]).toBeGreaterThan(sem!.w.tick);
  });

  it('20 (Berrante): a provocação do Peão dobra de raio e ganha o atordoamento (habilidade derivada)', () => {
    const w = createWorld(arena(), 1);
    const p = spawnPlayer(w, { name: 'P', archetypeId: 'peao_brabo', level: 20, x: 5, y: 5, talents: ['chave_berrante'] });
    const D = getData();
    const id = p.loadout!.b1;
    expect(baseAbilityId(id)).toBe('segura_o_peao');
    expect(id).not.toBe('segura_o_peao');
    const base = D.abilities.get('segura_o_peao')!;
    const der = D.abilities.get(id)!;
    expect(der.radius).toBe(base.radius * 2);
    expect(der.effects.length).toBe(base.effects.length + 1);
    expect(der.effects.some((e) => e.kind === 'controle' && e.cc === 'atordoar')).toBe(true);
    // o botão 3 continua o da classe ao subir de nível (o sufixo não atrapalha)
    expect(D.abilities.has(id)).toBe(true);
    // sem talento, o id é o base
    const q = spawnPlayer(w, { name: 'Q', archetypeId: 'peao_brabo', level: 20, x: 8, y: 8 });
    expect(q.loadout!.b1).toBe('segura_o_peao');
  });

  it('número fixo de talento (Bolsa de Pesquisa) entra em stats.pct ao nascer', () => {
    const w = createWorld(arena(), 1);
    const p = spawnPlayer(w, { name: 'P', archetypeId: 'doktor_klaus', level: 12, x: 5, y: 5, talents: ['bolsa_de_pesquisa'] });
    expect(statPts(p, 'resourceCost')).toBe(-25);
  });
});

describe('guias', () => {
  it('Golem: +15% de defesa no combate (apanha menos)', () => {
    const [com, sem] = twin({ guideId: 'golem' });
    expect(statPts(com!.p, 'defense')).toBe(15);
    const a = dealDamage(com!.w, com!.foe, com!.p, 20, { noCrit: true });
    const b = dealDamage(sem!.w, sem!.foe, sem!.p, 20, { noCrit: true });
    expect(a).toBeLessThan(b);
  });

  it('Faísca: derrotar carrega o Especial e a IA comenta o bônus', () => {
    const [com, sem] = twin({ guideId: 'faisca' }, { archetypeId: 'o_fiel' });
    for (const x of [com!, sem!]) {
      x.p.special = 0;
      dealDamage(x.w, x.p, x.foe, 0, { raw: x.foe.hp + 10 });
      tickTalentPassives(x.w);
    }
    expect(com!.p.special - sem!.p.special).toBeCloseTo(0.03, 5);
    const bonus = getData().guidesById.get('faisca')!.falas.find((f) => f.situacao === 'bonus')!.texto;
    expect(com!.w.events.some((e) => e.t === 'say' && e.src === com!.p.id && e.text === bonus.replaceAll('{nome}', 'P'))).toBe(true);
  });

  it('o guia fala nas missões e na conversa', () => {
    const rec = newPlayerRecord('g', 'Visitante');
    createCharacter(rec, 'Zé do Guia', defaultAppearance());
    rec.missions = { ativas: [], concluidas: deltaChainMissions().filter((m) => m !== 'travessia_08'), progresso: {} };
    setFlag(rec, FLAG_BRUNO);
    refreshMissions(rec);
    const t = applyTravessia(rec, { side: 'esquerda', institution: 'escola_dos_saberes', guide: 'baba_yaga' });
    const missao = getData().guidesById.get('baba_yaga')!.falas.filter((f) => f.situacao === 'missao').map((f) => f.texto.replaceAll('{nome}', rec.name));
    expect(t.resultado.falasGuia?.length).toBeGreaterThan(0);
    expect(missao).toContain(t.resultado.falasGuia![0]!.texto);
    const d = talkTo(rec, 'baba_yaga');
    expect(d.dialogo).toMatchObject({ guia: true, nome: getData().guidesById.get('baba_yaga')!.name });
  });
});

describe('treinadores e bordão como emote', () => {
  it('quem recebe a base ensina o bordão; o da ala só depois da ala; emote usado vira mensagem', () => {
    const rec = entered('agencia_neon');
    const d = talkTo(rec, 'katia');
    // v0.4: o treinador da base tem a missão da instituição, então a conversa abre por ela
    expect(['treino', 'entregaMissao']).toContain(d.dialogo.contexto);
    expect(d.dialogo.emote).toMatchObject({ id: 'emote_katia', novo: true });
    expect(d.resultado.emotes).toEqual(['emote_katia']);
    expect(unlockedEmotes(rec)).toEqual(['emote_katia']);
    expect(talkTo(rec, 'katia').dialogo.emote?.novo).toBe(false);
    // treinador de outra ala ainda não ensina
    expect(talkTo(rec, 'li_wei').dialogo.emote).toBeUndefined();
    expect(useEmote(rec, 'emote_li_wei').ok).toBe(false);
    const u = useEmote(rec, 'emote_katia');
    expect(u.ok).toBe(true);
    expect(u.emote).toMatchObject({ texto: getData().trainersById.get('katia')!.emote.texto, treinador: 'katia' });
    raiseToLevel(rec, 12);
    chooseArchetype(rec, 'idol');
    const li = talkTo(rec, 'li_wei');
    expect(li.dialogo.contexto).toBe('treino');
    expect(li.dialogo.emote?.id).toBe('emote_li_wei');
    expect(useEmote(rec, 'emote_li_wei').ok).toBe(true);
    expect(profileOf(rec).emotes).toEqual(['emote_katia', 'emote_li_wei']);
    expect(GAME_MSG.emote).toBe('emote');
    expect(GAME_MSG.escolherAla).toBe('escolher_ala');
    expect(GAME_MSG.escolherTalento).toBe('escolher_talento');
    expect(GAME_MSG.trocarSlot3).toBe('trocar_slot3');
  });
});

describe('story_flags da Fase 3', () => {
  it('margem, chegada, guia, instituição (exclusiva) e ala', () => {
    const rec = entered('guarda_comunitaria');
    expect(rec.story_flags).toEqual(
      expect.arrayContaining(['travessia_feita', 'margem_esquerda', 'roda_apresentado_assembleia', 'guia_escolhido', 'entrou_instituicao', 'entrou_guarda_comunitaria']),
    );
    expect(rec.story_flags.filter((f) => f.startsWith('entrou_') && f !== 'entrou_instituicao')).toEqual(['entrou_guarda_comunitaria']);
    // a escolha da missão (não dedurar) não liga a flag de dedo-duro
    expect(rec.story_flags).not.toContain('guarda_dedurou_a_vizinha');
    // com a flag, a entrada não abre de novo
    expect(dialogOptions(rec, 'olga').map((o) => o.id)).not.toContain('aceitar:entrada_guarda_comunitaria');
    raiseToLevel(rec, 12);
    expect(chooseArchetype(rec, 'babushka').ok).toBe(true);
    expect(rec.story_flags).toContain('ala_escolhida');
  });

  it('Direita: contrato da IA ativada antes da entrada', () => {
    const rec = entered('torcida_furia_neon', 'capita');
    expect(rec.story_flags).toEqual(expect.arrayContaining(['margem_direita', 'contrato_ia_ativada', 'guia_escolhido', 'entrou_torcida_furia_neon']));
    expect(rec.story_flags).not.toContain('margem_esquerda');
  });
});
