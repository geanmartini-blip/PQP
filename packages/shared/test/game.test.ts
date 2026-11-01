/**
 * Regras da Fase 2 (shared/game): aparência, Máquina de Visual, XP em grupo, cadeia do Delta,
 * story_flags, travessia, diálogo, auto-caminho e migração de registro antigo.
 */
import { describe, expect, it } from 'vitest';
import { getData } from '../src/data';
import {
  acceptMission,
  applyRewards,
  applyTravessia,
  applyVisualMachine,
  controlesLiberados,
  createCharacter,
  currentObjectives,
  defaultAppearance,
  dialogOption,
  dialogOptions,
  gainXp,
  groupXp,
  levelCapOf,
  lookOf,
  migratePlayerRecord,
  newPlayerRecord,
  nextObjectiveTarget,
  nextTutorialStep,
  onGameEvent,
  profileOf,
  randomAppearance,
  talkTo,
  travessiaOptions,
  unlockedVisualTiers,
  validateAppearance,
  validateName,
  xpTotalFor,
  type GameEvent,
  type PlayerRecord,
} from '../src/game/index';
import { GAME_MSG } from '../src/net/game';
import type { TileMap } from '../src/map/types';
import { createRng } from '../src/sim/rng';
import { createWorld } from '../src/sim/world';
import { spawnAlly, spawnEnemy, spawnPlayer } from '../src/sim/spawn';
import { dealDamage } from '../src/sim/combat';
import { stepN } from '../src/sim/step';
import type { CombatEvent } from '../src/sim/types';

/** Mapa de teste com os marcadores que o motor de missões e a Máquina de Visual usam. */
function testMap(): TileMap {
  const w = 40, h = 40;
  return {
    id: 'teste_delta',
    width: w,
    height: h,
    tiles: new Uint8Array(w * h).fill(1),
    regions: [{ regionId: 'usina_da_ponte', x: 30, y: 0, w: 10, h: 10 }],
    markers: [
      { id: 'npc_seu_jaco', kind: 'npc', x: 5, y: 5, ref: 'seu_jaco' },
      { id: 'maq', kind: 'maquina_visual', x: 6, y: 6, ref: 'maquina_visual_delta' },
      { id: 'cabine', kind: 'maquina_visual', x: 20, y: 20, ref: 'cabine_neon' },
      { id: 'espelho', kind: 'maquina_visual', x: 25, y: 25, ref: 'espelho_da_benzedeira' },
      { id: 'lugar_cais', kind: 'lugar', x: 10, y: 30, ref: 'cais_do_delta' },
      { id: 'lugar_palafitas', kind: 'lugar', x: 8, y: 8, ref: 'palafitas_do_delta' },
      { id: 'bando_siri', kind: 'bando', x: 15, y: 15, params: { inimigos: ['siri_do_mangue'], n: 3 } },
      { id: 'bando_siri_longe', kind: 'bando', x: 35, y: 35, params: { inimigos: ['siri_do_mangue'], n: 3 } },
      { id: 'chefe', kind: 'chefe', x: 20, y: 2, ref: 'bruno_ferro_chefe' },
    ],
  };
}

const at = (map: TileMap, x: number, y: number) => ({ map, x, y });

function created(): PlayerRecord {
  const rec = newPlayerRecord('p1', 'Visitante');
  const r = createCharacter(rec, 'Zé do Remo', defaultAppearance());
  expect(r.ok).toBe(true);
  return rec;
}

const feed = (rec: PlayerRecord, evs: GameEvent[]) => evs.map((e) => onGameEvent(rec, e));
const times = (n: number, ev: GameEvent): GameEvent[] => Array.from({ length: n }, () => ev);

/** Joga a cadeia do Delta inteira com eventos sintéticos. */
function playDelta(rec: PlayerRecord): void {
  // 1: cadastro
  feed(rec, [{ t: 'talk', npcId: 'seu_jaco' }, { t: 'control', controle: 'andar_joystick' }, { t: 'control', controle: 'tocar_no_chao' }, { t: 'arrive', placeId: 'palafitas_do_delta' }]);
  expect(rec.missions.concluidas).toContain('delta_01_cadastro');
  // 2: remar
  feed(rec, [{ t: 'arrive', placeId: 'cais_do_delta' }, { t: 'control', controle: 'auto_caminho' }, { t: 'arrive', placeId: 'palafitas_do_delta' }, ...times(3, { t: 'kill', enemyId: 'siri_do_mangue' })]);
  expect(rec.missions.concluidas).toContain('delta_02_remar');
  // 3: briga no mangue
  feed(rec, [...times(2, { t: 'control', controle: 'trocar_alvo' }), ...times(6, { t: 'kill', enemyId: 'siri_do_mangue' }), ...times(3, { t: 'pickup', chave: 'moeda' })]);
  expect(rec.missions.concluidas).toContain('delta_03_briga_no_mangue');
  // 4: mosquito
  feed(rec, [...times(12, { t: 'kill', enemyId: 'mosquito_do_delta' }), { t: 'ability', botao: 'item' }]);
  expect(rec.missions.concluidas).toContain('delta_04_mosquito_nao_negocia');
  // 5: chopindita barata (escolha pelo diálogo)
  feed(rec, [{ t: 'arrive', placeId: 'feira_de_pulgas' }]);
  const opts = dialogOptions(rec, 'vendedor_de_chopindita_barata');
  expect(opts.map((o) => o.id)).toContain('escolha:desconfiar');
  expect(dialogOption(rec, 'vendedor_de_chopindita_barata', 'escolha:desconfiar').ok).toBe(true);
  feed(rec, [...times(5, { t: 'kill', enemyId: 'capanga_do_capataz' }), { t: 'kill', enemyId: 'capanga_do_capataz', tier: 'elite' }, { t: 'ability', botao: 'item' }]);
  expect(rec.missions.concluidas).toContain('delta_05_chopindita_barata');
  // 6: fila e boleto
  feed(rec, [
    { t: 'interact', alvo: 'fila_do_posto_do_delta', acao: 'entrar_na_fila' },
    { t: 'control', controle: 'modo_automatico' },
    ...times(4, { t: 'kill', enemyId: 'cobrador_do_capataz' }),
    ...times(3, { t: 'kill', enemyId: 'capanga_do_capataz' }),
    { t: 'control', controle: 'reanimar' },
  ]);
  expect(rec.missions.concluidas).toContain('delta_06_a_fila_e_o_boleto');
  // 7: Bruno Ferro
  feed(rec, [{ t: 'arrive', placeId: 'cais_do_delta' }, ...times(4, { t: 'kill', enemyId: 'capanga_do_capataz' }), ...times(2, { t: 'kill', enemyId: 'cobrador_do_capataz' })]);
  feed(rec, [{ t: 'kill', enemyId: 'bruno_ferro_chefe', tier: 'chefe' }]);
  const fim = talkTo(rec, 'seu_jaco');
  expect(fim.resultado.concluidas).toContain('delta_07_o_barco_do_vizinho');
  expect(fim.dialogo.contexto).toBe('depois_do_chefe');
}

// ---------------------------------------------------------------------------

describe('criação de personagem', () => {
  it('aparência válida e inválida', () => {
    expect(validateAppearance(defaultAppearance()).ok).toBe(true);
    expect(validateAppearance({ ...defaultAppearance(), body: 'gigante' }).ok).toBe(false);
    expect(validateAppearance({ ...defaultAppearance(), hair: 'nada' }).ok).toBe(false);
    expect(validateAppearance({ ...defaultAppearance(), palette: 'idol_p1' }).ok).toBe(false);
    expect(validateAppearance(null).ok).toBe(false);
    // pele zoeira só liberada jogando
    const zoeira = { ...defaultAppearance(), skin: 'vermelho_de_sol' };
    expect(validateAppearance(zoeira).ok).toBe(false);
    expect(validateAppearance(zoeira, { unlocks: ['vermelho_de_sol'] }).ok).toBe(true);
    // detalhes: barba exclui cavanhaque, repetido não, no máximo 4
    expect(validateAppearance({ ...defaultAppearance(), details: ['barba', 'cavanhaque'] }).ok).toBe(false);
    expect(validateAppearance({ ...defaultAppearance(), details: ['pinta', 'pinta'] }).ok).toBe(false);
    expect(validateAppearance({ ...defaultAppearance(), details: ['barba', 'oculos', 'dente_de_ouro', 'tatuagem_nome_errado'] }).ok).toBe(true);
    expect(validateAppearance({ ...defaultAppearance(), details: ['barba', 'oculos', 'dente_de_ouro', 'tatuagem_nome_errado', 'pinta'] }).ok).toBe(false);
  });

  it('as opções batem com o doc: 5 corpos, 15 peles (3 zoeiras), 16 rostos, 20 cortes, 12 cores', () => {
    const A = getData().appearance;
    expect([A.corpos.length, A.peles.length, A.peles.filter((p) => p.zoeiro).length, A.rostos.length, A.cortes.length, A.coresCabelo.length]).toEqual([5, 15, 3, 16, 20, 12]);
  });

  it('sortear sempre dá aparência válida e sem pele zoeira', () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i++) {
      const a = randomAppearance(rng);
      const chk = validateAppearance(a);
      expect(chk.erros).toEqual([]);
    }
  });

  it('nome de 3 a 16 caracteres com filtro simples', () => {
    expect(validateName('Zé').ok).toBe(false);
    expect(validateName('Um nome comprido demais aqui').ok).toBe(false);
    expect(validateName('1234').ok).toBe(false);
    expect(validateName('Zé <script>').ok).toBe(false);
    expect(validateName('n4z1sta').ok).toBe(false);
    expect(validateName('Enviado').ok).toBe(true);
    const ok = validateName('  Zé   do Remo ');
    expect(ok.ok && ok.nome).toBe('Zé do Remo');
  });

  it('o cadastro liga a primeira missão do Delta e não deixa cadastrar duas vezes', () => {
    const rec = created();
    expect(rec.criado).toBe(true);
    expect(rec.name).toBe('Zé do Remo');
    expect(rec.missions.ativas).toEqual(['delta_01_cadastro']);
    expect(createCharacter(rec, 'Outro Nome', defaultAppearance()).ok).toBe(false);
    const bad = newPlayerRecord('p2', 'x');
    expect(createCharacter(bad, 'Fulano', { ...defaultAppearance(), face: 'xxx' }).ok).toBe(false);
    expect(bad.criado).toBe(false);
  });
});

describe('Máquina de Visual', () => {
  it('muda só perto da máquina, grátis e sem limite', () => {
    const map = testMap();
    const rec = created();
    expect(applyVisualMachine(rec, { hair: 'mullet' }, 'maquina_visual_delta', at(map, 30, 30)).ok).toBe(false);
    for (let i = 0; i < 5; i++) {
      expect(applyVisualMachine(rec, { hair: i % 2 ? 'mullet' : 'careca', palette: 'delta_azul_rio' }, 'maquina_visual_delta', at(map, 6.5, 6)).ok).toBe(true);
    }
    expect(rec.appearance.palette).toBe('delta_azul_rio');
    expect(lookOf(rec).outfit).toEqual({ tier: 'delta', palette: 1 });
    // pele zoeira ainda presa; campo fora da lista é recusado
    expect(applyVisualMachine(rec, { skin: 'marca_de_regata' }, 'maquina_visual_delta', at(map, 6, 6)).ok).toBe(false);
    expect(applyVisualMachine(rec, { archetype: 'idol' } as never, 'maquina_visual_delta', at(map, 6, 6)).ok).toBe(false);
  });

  it('nunca tira a silhueta da ala', () => {
    const map = testMap();
    const rec = migratePlayerRecord({ id: 'x', name: 'Idolzinho', data: { archetypeId: 'idol', level: 12 } });
    expect(rec.archetype).toBe('idol');
    const before = lookOf(rec).outfit;
    expect(before.tier).toBe('aprendiz');
    expect(before.archetypeId).toBe('idol');
    expect(unlockedVisualTiers(rec)).toEqual(['aprendiz']);
    const cab = at(map, 20, 20);
    // a Cabine Neon mostra os termos
    expect(applyVisualMachine(rec, { hair: 'bone' }, 'cabine_neon', cab).ok).toBe(false);
    expect(applyVisualMachine(rec, { hair: 'bone', palette: 'idol_p2', aceitouTermos: true }, 'cabine_neon', cab).ok).toBe(true);
    // voltar para o Delta ou o uniforme tiraria a silhueta
    expect(applyVisualMachine(rec, { shown_visual_tier: 'delta', aceitouTermos: true }, 'cabine_neon', cab).ok).toBe(false);
    expect(applyVisualMachine(rec, { shown_visual_tier: 'uniforme', aceitouTermos: true }, 'cabine_neon', cab).ok).toBe(false);
    expect(applyVisualMachine(rec, { silhueta: [] , aceitouTermos: true } as never, 'cabine_neon', cab).ok).toBe(false);
    expect(applyVisualMachine(rec, { palette: 'delta_azul_rio', aceitouTermos: true }, 'cabine_neon', cab).ok).toBe(false);
    const after = lookOf(rec);
    expect(after.outfit.tier).toBe('aprendiz');
    expect(after.outfit.archetypeId).toBe('idol');
    expect(after.outfit.palette).toBe(1);
    expect(after.hair).toBe('bone');
    // máquina da outra margem não atende
    expect(applyVisualMachine(rec, { hair: 'mullet' }, 'espelho_da_benzedeira', at(map, 25, 25)).ok).toBe(false);
  });

  it('veterano no 20 pode escolher mostrar o aprendiz', () => {
    const map = testMap();
    const rec = migratePlayerRecord({ data: { archetypeId: 'peao_brabo', level: 20 } });
    expect(unlockedVisualTiers(rec)).toEqual(['aprendiz', 'veterano']);
    expect(lookOf(rec).outfit.tier).toBe('veterano');
    expect(applyVisualMachine(rec, { shown_visual_tier: 'aprendiz' }, 'espelho_da_benzedeira', at(map, 25, 25)).ok).toBe(true);
    expect(lookOf(rec).outfit.tier).toBe('aprendiz');
    expect(lookOf(rec).outfit.archetypeId).toBe('peao_brabo');
  });
});

describe('XP só em grupo', () => {
  it('solo não dá XP; grupo dá, com +15% por jogador ao vivo a mais; plantão dá metade', () => {
    expect(groupXp(100, { personagens: 1, aoVivo: 1 })).toBe(0);
    expect(groupXp(100, { personagens: 2, aoVivo: 1 })).toBe(100); // jogador + IA
    expect(groupXp(100, { personagens: 2, aoVivo: 2 })).toBe(115);
    expect(groupXp(100, { personagens: 4, aoVivo: 4 })).toBe(145);
    expect(groupXp(100, { personagens: 3, aoVivo: 2, plantonista: true })).toBe(57); // 100 × 1,15 × 0,5, arredondado
    // no Delta, o Seu Jacó acompanha
    expect(groupXp(100, { personagens: 1, aoVivo: 1 }, { delta: true })).toBe(100);
  });

  it('recompensa de missão: solo dá item e material, XP só com grupo', () => {
    const rec = migratePlayerRecord({ data: { archetypeId: 'idol', level: 12 } });
    const solo = applyRewards(rec, [{ kind: 'xp', quantidade: 100 }, { kind: 'recurso', recurso: 'pecas', quantidade: 5 }], { personagens: 1, aoVivo: 1 });
    expect(solo.xp).toBe(0);
    expect(rec.resources.pecas).toBe(5);
    const grupo = applyRewards(rec, [{ kind: 'xp', quantidade: 100 }], { personagens: 3, aoVivo: 3 });
    expect(grupo.xp).toBe(130);
  });

  it('na simulação: novato do Delta sozinho ganha XP (Seu Jacó), quem tem margem não', () => {
    const map = { id: 'a', width: 30, height: 30, tiles: new Uint8Array(900).fill(1), regions: [], markers: [] };
    const w = createWorld(map, 3);
    const novato = spawnPlayer(w, { name: 'Novato', archetypeId: 'delta', x: 5, y: 5, playerId: 'n', deltaRookie: true, levelCap: 7 });
    const s = spawnEnemy(w, 'siri_do_mangue', 6, 5);
    dealDamage(w, novato, s, 0, { raw: s.hp + 1 });
    const evs: CombatEvent[] = stepN(w, 2);
    expect(evs.some((e) => e.t === 'xp' && e.dst === novato.id)).toBe(true);
    const w2 = createWorld(map, 3);
    const solo = spawnPlayer(w2, { name: 'Peão', archetypeId: 'peao_brabo', x: 5, y: 5, playerId: 'p' });
    const s2 = spawnEnemy(w2, 'siri_do_mangue', 6, 5);
    dealDamage(w2, solo, s2, 0, { raw: s2.hp + 1 });
    expect(stepN(w2, 2).some((e) => e.t === 'xp')).toBe(false);
    // com companheiro de IA: grupo
    const w3 = createWorld(map, 3);
    const p3 = spawnPlayer(w3, { name: 'Peão', archetypeId: 'peao_brabo', x: 5, y: 5, playerId: 'p' });
    spawnAlly(w3, 'wesley', 5, 6, { archetypeId: 'peao_brabo', level: 12 });
    const s3 = spawnEnemy(w3, 'siri_do_mangue', 6, 5);
    dealDamage(w3, p3, s3, 0, { raw: s3.hp + 1 });
    expect(stepN(w3, 2).some((e) => e.t === 'xp' && e.dst === p3.id)).toBe(true);
  });

  it('teto do Delta: o nível para no 4 até o Bruno Ferro (registro e simulação)', () => {
    const rec = created();
    gainXp(rec, 100000);
    expect(rec.level).toBe(4);
    expect(levelCapOf(rec)).toBe(4);
    const map = { id: 'a', width: 30, height: 30, tiles: new Uint8Array(900).fill(1), regions: [], markers: [] };
    const w = createWorld(map, 3);
    const e = spawnPlayer(w, { name: 'N', archetypeId: 'delta', level: 4, x: 5, y: 5, levelCap: 4, deltaRookie: true });
    for (let i = 0; i < 5; i++) {
      const b = spawnEnemy(w, 'bruno_ferro_chefe', 6, 5);
      dealDamage(w, e, b, 0, { raw: b.hp + 1 });
      stepN(w, 2);
    }
    expect(e.level).toBe(4);
    expect(e.xp).toBeGreaterThan(0);
  });

  it('passar de nível dispara os desbloqueios do tutorial', () => {
    const rec = created();
    const r = gainXp(rec, xpTotalFor(4));
    expect(rec.level).toBe(4);
    expect(r.niveis).toEqual([2, 3, 4]);
    expect(r.desbloqueios.map((d) => d.controle)).toEqual(['troca_de_alvo', 'item', 'aviso_no_chao', 'reanimar', 'modo_automatico']);
    expect(controlesLiberados(rec)).toEqual(expect.arrayContaining(['joystick', 'alvo_e_basico', 'item']));
    expect(controlesLiberados(rec)).not.toContain('habilidades');
  });
});

describe('cadeia do Delta', () => {
  it('do cadastro ao Bruno Ferro com eventos sintéticos, ligando as story_flags', () => {
    const rec = created();
    playDelta(rec);
    for (const f of [
      'delta_cadastro_feito',
      'delta_aprendeu_remar',
      'delta_aprendeu_lutar',
      'delta_aprendeu_habilidades',
      'delta_desconfiou_da_chopindita',
      'delta_chopindita_resolvida',
      'delta_boleto_chegou',
      'delta_bruno_ferro_derrotado',
    ]) expect(rec.story_flags).toContain(f);
    expect(rec.story_flags).not.toContain('delta_comprou_chopindita_falsa');
    const D = getData();
    for (const id of D.missions.cadeias.find((c) => c.id === 'delta_1_a_7')!.missoes) expect(rec.missions.concluidas).toContain(id);
    // derrotar o Bruno libera a travessia: nível 5 e estágio travessia, com a missão já ativa
    expect(rec.level).toBe(5);
    expect(rec.stage).toBe('travessia');
    expect(rec.missions.ativas).toContain('travessia_08');
    // recompensas: materiais (solo) e itens para rolar
    expect(rec.resources.comida).toBeGreaterThan(0);
    expect(rec.resources.pecas).toBeGreaterThan(0);
    expect(rec.resources.chopindita).toBe(3);
    // o tutorial do primeiro minuto acabou
    expect(nextTutorialStep(rec)).toBeUndefined();
  });

  it('escolha exclusiva: comprar a chopindita falsa dá a pedra pintada', () => {
    const rec = created();
    feed(rec, [{ t: 'talk', npcId: 'seu_jaco' }, { t: 'control', controle: 'andar_joystick' }, { t: 'control', controle: 'tocar_no_chao' }, { t: 'arrive', placeId: 'palafitas_do_delta' }]);
    // pula até a missão 5 ligando as flags pedidas
    rec.story_flags.push('delta_aprendeu_remar', 'delta_aprendeu_lutar', 'delta_aprendeu_habilidades');
    rec.missions.ativas = [];
    expect(acceptMission(rec, 'delta_05_chopindita_barata').ok).toBe(true);
    feed(rec, [{ t: 'arrive', placeId: 'feira_de_pulgas' }, { t: 'choose', opcao: 'comprar' }]);
    expect(rec.story_flags).toContain('delta_comprou_chopindita_falsa');
    expect(rec.unlocks).toContain('pedra_pintada');
  });

  it('missão bloqueada sem a flag anterior', () => {
    const rec = created();
    expect(acceptMission(rec, 'delta_03_briga_no_mangue').ok).toBe(false);
    expect(acceptMission(rec, 'travessia_08').ok).toBe(false);
  });

  it('contador de controle pede a quantidade toda (não pula sozinho no meio)', () => {
    const rec = created();
    feed(rec, [{ t: 'talk', npcId: 'seu_jaco' }, { t: 'control', controle: 'andar_joystick' }, { t: 'control', controle: 'tocar_no_chao' }, { t: 'arrive', placeId: 'palafitas_do_delta' }]);
    feed(rec, [{ t: 'arrive', placeId: 'cais_do_delta' }, { t: 'control', controle: 'auto_caminho' }, { t: 'arrive', placeId: 'palafitas_do_delta' }, ...times(3, { t: 'kill', enemyId: 'siri_do_mangue' })]);
    onGameEvent(rec, { t: 'control', controle: 'trocar_alvo' });
    const cur = currentObjectives(rec).find((c) => c.missao.id === 'delta_03_briga_no_mangue')!;
    expect(cur.indice).toBe(0);
    onGameEvent(rec, { t: 'control', controle: 'trocar_alvo' });
    expect(currentObjectives(rec).find((c) => c.missao.id === 'delta_03_briga_no_mangue')!.indice).toBe(1);
  });

  it('auto-caminho aponta para o NPC, o lugar e o bando mais perto', () => {
    const map = testMap();
    const rec = created();
    let t = nextObjectiveTarget(rec, map, { x: 0, y: 0 });
    expect(t).toMatchObject({ missao: 'delta_01_cadastro', npc: 'seu_jaco', x: 5, y: 5, mapa: 'teste_delta' });
    feed(rec, [{ t: 'talk', npcId: 'seu_jaco' }, { t: 'control', controle: 'andar_joystick' }, { t: 'control', controle: 'tocar_no_chao' }]);
    t = nextObjectiveTarget(rec, map);
    expect(t).toMatchObject({ lugar: 'palafitas_do_delta', x: 8, y: 8 });
    feed(rec, [{ t: 'arrive', placeId: 'palafitas_do_delta' }]);
    t = nextObjectiveTarget(rec, map);
    expect(t).toMatchObject({ missao: 'delta_02_remar', lugar: 'cais_do_delta', x: 10, y: 30 });
    feed(rec, [{ t: 'arrive', placeId: 'cais_do_delta' }, { t: 'control', controle: 'auto_caminho' }, { t: 'arrive', placeId: 'palafitas_do_delta' }]);
    t = nextObjectiveTarget(rec, map, { x: 30, y: 30 });
    expect(t).toMatchObject({ x: 35, y: 35, feito: 0, meta: 3 });
  });
});

describe('diálogo', () => {
  it('Seu Jacó fala conforme o momento e oferece a Máquina de Visual e a travessia', () => {
    const rec = created();
    const a = talkTo(rec, 'seu_jaco');
    expect(a.dialogo.contexto).toBe('cadastro_ficha');
    expect(a.dialogo.fala.length).toBeGreaterThan(5);
    expect(a.dialogo.opcoes.map((o) => o.id)).toContain('maquina:maquina_visual_delta');
    expect(a.dialogo.opcoes.map((o) => o.id)).not.toContain('travessia');
    // as falas giram em ordem
    const b = talkTo(rec, 'seu_jaco');
    expect(b.dialogo.fala).not.toBe(a.dialogo.fala);
    playDelta(rec);
    const c = talkTo(rec, 'seu_jaco');
    expect(c.dialogo.contexto).toBe('travessia_partida');
    expect(c.dialogo.opcoes.map((o) => o.id)).toContain('travessia');
    const open = dialogOption(rec, 'seu_jaco', 'travessia');
    expect(open.abrir?.tela).toBe('travessia');
  });

  it('treinador conversa sem trocar a ala de quem está no Delta', () => {
    const rec = created();
    const d = talkTo(rec, 'wesley');
    expect(d.dialogo.contexto).toBe('saudacao');
    expect(rec.archetype).toBeNull();
  });
});

describe('travessia', () => {
  it('lista as 2 margens, 4 instituições em cada e os guias (12 espíritos e 4 IAs)', () => {
    const rec = created();
    const o = travessiaOptions(rec);
    expect(o.pode).toBe(false);
    expect(o.margens.map((m) => m.side)).toEqual(['esquerda', 'direita']);
    expect(o.margens.map((m) => m.instituicoes.length)).toEqual([4, 4]);
    expect(o.margens[0]!.guias.length).toBe(12);
    expect(o.margens[1]!.guias.length).toBe(4);
    expect(o.margens[1]!.moedaInicial).toMatchObject({ credito: 120, score: 500 });
  });

  it('só depois do Bruno Ferro; define classe, guia, patente, botões e moeda', () => {
    const rec = created();
    expect(applyTravessia(rec, { side: 'esquerda', institution: 'brigada_popular', guide: 'valquiria' }).ok).toBe(false);
    playDelta(rec);
    talkTo(rec, 'seu_jaco'); // sobe no barco
    expect(applyTravessia(rec, { side: 'esquerda', institution: 'pm_do_consorcio', guide: 'valquiria' }).ok).toBe(false);
    expect(applyTravessia(rec, { side: 'esquerda', institution: 'brigada_popular', guide: 'byte' }).ok).toBe(false);
    const semente0 = rec.semente;
    const r = applyTravessia(rec, { side: 'esquerda', institution: 'brigada_popular', guide: 'valquiria' });
    expect(r.ok).toBe(true);
    expect(rec).toMatchObject({ stage: 'margem', side: 'esquerda', institution: 'brigada_popular', class: 'combatente', guide_id: 'valquiria', rank: 'membro', institution_rank: 'Brigadista', archetype: null });
    expect(rec.loadout.botoes).toEqual(getData().classesById.get('combatente')!.loadoutPreAla.botoes);
    expect(rec.semente).toBe(semente0 + 120);
    expect(rec.story_flags).toEqual(expect.arrayContaining(['travessia_feita', 'margem_esquerda']));
    expect(rec.missions.concluidas).toContain('travessia_08');
    expect(rec.missions.ativas).not.toContain('travessia_08');
    expect(lookOf(rec).outfit).toMatchObject({ tier: 'base', institutionId: 'brigada_popular', palette: 0 });
    expect(controlesLiberados(rec)).toEqual(expect.arrayContaining(['habilidades', 'especial', 'item']));
    expect(r.resultado.desbloqueios.map((d) => d.controle)).toEqual(['habilidades', 'especial']);
    // depois de atravessar, não atravessa de novo
    expect(applyTravessia(rec, { side: 'direita', institution: 'agencia_neon', guide: 'byte' }).ok).toBe(false);
  });

  it('Direita: Crédito com o desconto da cápsula e score inicial', () => {
    const rec = created();
    playDelta(rec);
    const c0 = rec.credito;
    expect(applyTravessia(rec, { side: 'direita', institution: 'agencia_neon', guide: 'byte' }).ok).toBe(true);
    expect(rec.class).toBe('mascarado');
    expect(rec.rank).toBe('colaborador');
    expect(rec.credito).toBe(c0 + 120);
    expect(rec.score).toBe(500);
    expect(rec.story_flags).toContain('margem_direita');
    expect(rec.story_flags).not.toContain('margem_esquerda');
  });
});

describe('registro do jogador', () => {
  it('migra o registro da Fase 1 (servidor) com padrões', () => {
    const old = { id: 'abc', token: 't', name: 'Velho', data: { archetypeId: 'idol', level: 12, xp: 30, slot3: 'animacao', appearance: { body: 'fortao', hairColor: 'loiro', face: 'inexistente' }, palette: 1, itemCount: 2, semente: 7 } };
    const rec = migratePlayerRecord(old);
    expect(rec).toMatchObject({ version: 2, id: 'abc', name: 'Velho', stage: 'margem', side: 'direita', class: 'mascarado', institution: 'agencia_neon', archetype: 'idol', level: 12, xp: 30, item_count: 2, semente: 7, rank: 'colaborador', criado: true });
    expect(rec.loadout.slot3_ability).toBe('animacao');
    expect(rec.appearance.body).toBe('fortao');
    expect(rec.appearance.hair_color).toBe('loiro');
    expect(rec.appearance.face).toBe(defaultAppearance().face);
    expect(rec.appearance.palette).toBe('idol_p2');
    expect(rec.story_flags).toContain('travessia_feita');
    expect(rec.missions.concluidas).toContain('delta_07_o_barco_do_vizinho');
  });

  it('Fase 1 no Delta continua no Delta e passa pela criação', () => {
    const rec = migratePlayerRecord({ id: 'd', name: 'Novato', data: { archetypeId: 'delta', level: 9 } });
    expect(rec).toMatchObject({ stage: 'delta', level: 4, criado: false, side: null, class: null });
    const lixo = migratePlayerRecord('lixo', 'fallback');
    expect(lixo.id).toBe('fallback');
    expect(lixo.stage).toBe('delta');
  });

  it('o registro da Fase 2 volta igual depois de salvar e ler', () => {
    const rec = created();
    playDelta(rec);
    const back = migratePlayerRecord(JSON.parse(JSON.stringify(rec)));
    expect(back).toEqual(rec);
  });

  it('perfil resumido e nomes das mensagens', () => {
    const rec = created();
    const p = profileOf(rec, controlesLiberados(rec));
    expect(p.look.outfit.tier).toBe('delta');
    expect(p.xpParaProximo).toBe(50);
    expect(p.controlesLiberados).toContain('joystick');
    expect(Object.values(GAME_MSG)).toEqual(
      expect.arrayContaining(['criar_personagem', 'maquina_visual', 'falar', 'missao_aceitar', 'travessia', 'tutorial_passo', 'perfil', 'dialogo', 'missao_estado', 'aviso', 'travessia_opcoes']),
    );
  });
});
