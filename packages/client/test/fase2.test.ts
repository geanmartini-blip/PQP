/**
 * Fase 2 no cliente: estado do jogo (perfil, missões, diálogo, avisos, nível, XP em grupo), o
 * modelo do editor de visual (criação e Máquina de Visual), o modelo da travessia e o servidor local
 * rodando o mesmo fluxo do servidor (criação, conversa, missão, travessia com troca de mapa).
 */
import { describe, expect, it } from 'vitest';
import { getData } from '@pqp/shared';
import { GAME_MSG, MSG } from '@pqp/shared/net';
import { FLAG_BRUNO, raiseToLevel, travessiaOptions, validateAppearance, type PlayerRecord } from '@pqp/shared/game/index';
import { getMap } from '@pqp/shared/map';
import { GameState } from '../src/game/gameState';
import { GameClient } from '../src/game/GameClient';
import { LocalServer, type RecordStore } from '../src/net/localServer';
import { LocalTransport } from '../src/net/localTransport';
import { checkEditor, choose, newEditor, optionsOf, previewLook, randomize, tabsOf, toggleDetail, uiRng, visualChange } from '../src/ui/creatorModel';
import { back, choice, newTravessia, pickGuide, pickInstitution, pickSide } from '../src/ui/travessiaModel';
import { spinFrame } from '../src/ui/dom/sprite';

const memStore = (): RecordStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, load: (id) => (data.has(id) ? JSON.parse(data.get(id)!) : null), save: (id, rec) => void data.set(id, JSON.stringify(rec)) };
};

const D = getData();
const okLook = () => ({ ...D.appearance.padrao, details: [] as string[] });

function msgs(s: LocalServer, type: string): unknown[] {
  return s
    .take()
    .filter(([t]) => t === type)
    .map(([, m]) => m);
}

function helloFase2(store = memStore(), token = 'tok_fase2_teste') {
  // atalho de teste: a travessia direta do Delta (o barco tem o teste dele em barco.test.ts)
  const s = new LocalServer({ store, noEnemies: true, atalhoTravessia: true });
  s.receive(MSG.hello, { token, name: 'Zé' });
  return { s, store, token };
}

describe('GameState', () => {
  const perfil = (over: Record<string, unknown> = {}) => ({
    id: 'a',
    name: 'Zé',
    criado: true,
    stage: 'delta',
    level: 1,
    tutorial: { feitos: [], controles: [] },
    controlesLiberados: ['joystick'],
    ...over,
  });

  it('perfil, missões, diálogo e telas pedidas', () => {
    const g = new GameState();
    expect(g.active).toBe(false);
    expect(g.unlocked('item')).toBe(true);
    g.onMessage(GAME_MSG.perfil, perfil({ criado: false }), 0);
    expect(g.active).toBe(true);
    expect(g.needsCreation).toBe(true);
    expect(g.unlocked('item')).toBe(false);
    expect(g.unlocked('joystick')).toBe(true);
    g.onMessage(GAME_MSG.dialogo, { npc: 'seu_jaco', nome: 'Seu Jacó', contexto: 'x', fala: 'Oi', opcoes: [] }, 0);
    expect(g.dialog?.npc).toBe('seu_jaco');
    g.onMessage(GAME_MSG.dialogo, { npc: 'seu_jaco', nome: '', contexto: 'abrir', fala: '', opcoes: [], abrir: { tela: 'maquina_visual', maquina: 'maquina_visual_delta' } }, 0);
    expect(g.takeScreen()).toEqual({ tela: 'maquina_visual', maquina: 'maquina_visual_delta' });
    g.onMessage(GAME_MSG.travessiaOpcoes, { pode: true, margens: [] }, 0);
    expect(g.takeScreen()?.tela).toBe('travessia');
    expect(g.takeScreen()).toBeUndefined();
    expect(g.onMessage('snap', {}, 0)).toBe(false);
  });

  it('subida de nível vira banner com os desbloqueios; o aviso "Nível N!" não repete', () => {
    const g = new GameState();
    g.onMessage(GAME_MSG.perfil, perfil({ level: 2 }), 0);
    g.onMessage(GAME_MSG.aviso, { texto: '', tipo: 'nivel', desbloqueios: [{ nivel: 3, controle: 'item', descricao: 'Poção no botão de item.' }] }, 10);
    g.onMessage(GAME_MSG.perfil, perfil({ level: 3 }), 20);
    g.onMessage(GAME_MSG.aviso, { texto: 'Nível 3!', tipo: 'nivel' }, 20);
    expect(g.levelUp?.level).toBe(3);
    expect(g.levelUp?.desbloqueios.map((u) => u.controle)).toEqual(['item']);
    expect(g.toasts.some((t) => t.texto === 'Nível 3!')).toBe(false);
    g.onMessage(GAME_MSG.aviso, { texto: 'Missão: Cadastro do Delta', tipo: 'missao' }, 30);
    expect(g.liveToasts(40, 1000).map((t) => t.tipo)).toEqual(['missao']);
    g.onMessage(GAME_MSG.aviso, { texto: 'Chegue perto', tipo: 'erro' }, 50);
    expect(g.lastError?.texto).toBe('Chegue perto');
    // desbloqueio que já vale no nível (travessia): aviso na hora
    g.onMessage(GAME_MSG.aviso, { texto: '', tipo: 'nivel', desbloqueios: [{ nivel: 3, controle: 'x', descricao: 'Coisa nova.' }] }, 9000);
    expect(g.toasts.some((t) => t.texto === 'Novo: Coisa nova.')).toBe(true);
  });

  it('XP em grupo: somas seguidas viram um aviso só, com o Seu Jacó no Delta', () => {
    const g = new GameState();
    g.onMessage(GAME_MSG.perfil, perfil(), 0);
    g.onXp(10, 100);
    g.onXp(5, 600);
    const xp = g.toasts.filter((t) => t.tipo === 'xp');
    expect(xp).toHaveLength(1);
    expect(xp[0]!.texto).toBe('+15 XP');
    expect(xp[0]!.sub).toMatch(/Seu Jacó/);
    g.onXp(7, 5000);
    expect(g.toasts.filter((t) => t.tipo === 'xp')).toHaveLength(2);
  });

  it('dica do tutorial: o primeiro passo que falta, só no Delta e depois do cadastro', () => {
    const g = new GameState();
    g.onMessage(GAME_MSG.perfil, perfil({ criado: false }), 0);
    expect(g.tutorialStep()).toBeUndefined();
    g.onMessage(GAME_MSG.perfil, perfil({ tutorial: { feitos: ['andar'], controles: [] } }), 0);
    expect(g.tutorialStep()?.id).toBe('alvo');
    g.localSteps.add('alvo');
    expect(g.tutorialStep()?.id).toBe('basico');
    g.onMessage(GAME_MSG.perfil, perfil({ stage: 'margem' }), 0);
    expect(g.tutorialStep()).toBeUndefined();
  });
});

describe('editor de visual (criação e Máquina de Visual)', () => {
  it('abas da criação: corpo, pele, rosto, cabelo, cor, detalhes e camiseta', () => {
    const s = newEditor({ kind: 'criacao' }, null);
    expect(tabsOf(s).map((t) => t.id)).toEqual(['corpo', 'pele', 'rosto', 'cabelo', 'cor_cabelo', 'detalhes', 'camiseta']);
    expect(optionsOf(s, 'corpo')).toHaveLength(5);
    expect(optionsOf(s, 'pele')).toHaveLength(15);
    expect(optionsOf(s, 'rosto')).toHaveLength(16);
    expect(optionsOf(s, 'cabelo')).toHaveLength(20);
    expect(optionsOf(s, 'cor_cabelo')).toHaveLength(12);
    expect(optionsOf(s, 'camiseta')).toHaveLength(6);
    expect(optionsOf(s, 'pele').filter((o) => o.locked)).toHaveLength(3);
  });

  it('pele zoeira travada não entra; liberada entra', () => {
    const s = newEditor({ kind: 'criacao' }, null);
    expect(choose(s, 'pele', 'vermelho_de_sol')).toBe(false);
    s.unlocks.push('vermelho_de_sol');
    expect(choose(s, 'pele', 'vermelho_de_sol')).toBe(true);
    expect(s.look.skin).toBe('vermelho_de_sol');
  });

  it('detalhes: um por grupo, grupos que se excluem e no máximo 4', () => {
    const A = D.appearance;
    let d: string[] = [];
    for (const x of A.detalhes) d = toggleDetail(d, x.id);
    expect(d.length).toBeLessThanOrEqual(A.regras.maxDetalhes);
    expect(validateAppearance({ ...okLook(), details: d }).ok).toBe(true);
    // ligar e desligar
    const one = toggleDetail([], 'oculos');
    expect(one).toEqual(['oculos']);
    expect(toggleDetail(one, 'oculos')).toEqual([]);
  });

  it('sorteio sempre válido e a prévia usa o traje do Delta', () => {
    const s = newEditor({ kind: 'criacao' }, null);
    const rng = uiRng(42);
    for (let i = 0; i < 40; i++) {
      randomize(s, rng);
      expect(checkEditor(s)).toEqual([]);
    }
    const lk = previewLook(s);
    expect(lk.outfit.tier).toBe('delta');
    expect(lk.outfit.palette).toBeGreaterThanOrEqual(0);
    expect(lk.outfit.palette).toBeLessThan(6);
  });

  it('máquina com ala: paletas da ala, aba dos visuais e só os campos mudados', () => {
    const arch = D.archetypesById.get('peao_brabo')!;
    const pal = arch.paletasTraje![0]!.id;
    const profile = { level: 20, institution: arch.instituicao, archetype: arch.id, appearance: { ...okLook(), palette: pal }, shown_visual_tier: null, unlocks: [], stage: 'margem' as const };
    const s = newEditor({ kind: 'maquina', maquina: 'espelho_da_benzedeira', termos: false }, profile);
    expect(optionsOf(s, 'camiseta')).toHaveLength(3);
    expect(tabsOf(s).some((t) => t.id === 'visual')).toBe(true);
    // o visual do Delta e o uniforme não aparecem para quem tem ala (a silhueta fica)
    expect(optionsOf(s, 'visual').map((o) => o.id)).toEqual(['aprendiz', 'veterano']);
    expect(choose(s, 'camiseta', 'delta_azul_rio')).toBe(false);
    choose(s, 'cabelo', 'moicano');
    choose(s, 'visual', 'aprendiz');
    expect(visualChange(s)).toEqual({ hair: 'moicano', shown_visual_tier: 'aprendiz' });
    expect(previewLook(s).outfit.archetypeId).toBe('peao_brabo');
    expect(previewLook(s).outfit.tier).toBe('aprendiz');
  });

  it('prévia girando passa pelas 4 direções', () => {
    const dirs = new Set([0, 1400, 2800, 4200].map((t) => spinFrame(t).dir));
    expect(dirs).toEqual(new Set([0, 1, 2, 3]));
    expect(spinFrame(0).frame).toBe('andando_0_0');
  });
});

describe('travessia (modelo da tela)', () => {
  it('margem, instituição, guia e confirmar; voltar desfaz', () => {
    const { s } = helloFase2();
    const rec = s.rec!;
    rec.criado = true;
    rec.story_flags.push(FLAG_BRUNO);
    raiseToLevel(rec, 8);
    const t = newTravessia(travessiaOptions(rec));
    expect(t.opcoes.pode).toBe(true);
    expect(pickSide(t, 'direita')).toBe(true);
    const dir = t.opcoes.margens.find((m) => m.side === 'direita')!;
    expect(dir.instituicoes).toHaveLength(4);
    expect(dir.guias).toHaveLength(4);
    expect(pickInstitution(t, t.opcoes.margens.find((m) => m.side === 'esquerda')!.instituicoes[0]!.id)).toBe(false);
    expect(pickInstitution(t, dir.instituicoes[0]!.id)).toBe(true);
    expect(pickGuide(t, dir.guias[0]!.id)).toBe(true);
    expect(choice(t)).toEqual({ side: 'direita', institution: dir.instituicoes[0]!.id, guide: dir.guias[0]!.id });
    expect(back(t)).toBe(true);
    expect(t.step).toBe('guia');
    expect(choice(t)).toBeNull();
  });
});

describe('servidor local com as regras da Fase 2', () => {
  it('começa no Delta sem cadastro; criar_personagem liga a primeira missão', () => {
    const { s } = helloFase2();
    const out = s.take();
    const welcome = out.find(([t]) => t === MSG.welcome)![1] as { mapId: string };
    expect(welcome.mapId).toBe('delta');
    const perfil = out.find(([t]) => t === GAME_MSG.perfil)![1] as { criado: boolean };
    expect(perfil.criado).toBe(false);
    // nome inválido: aviso de erro, nada muda
    s.receive(GAME_MSG.criarPersonagem, { name: 'x', appearance: okLook() });
    const err = msgs(s, GAME_MSG.aviso) as { tipo: string }[];
    expect(err[0]?.tipo).toBe('erro');
    expect(s.rec!.criado).toBe(false);
    s.receive(GAME_MSG.criarPersonagem, { name: 'Zé do Barco', appearance: okLook() });
    const o2 = s.take();
    const p2 = o2.filter(([t]) => t === GAME_MSG.perfil).pop()![1] as { criado: boolean; name: string };
    expect(p2.criado).toBe(true);
    expect(p2.name).toBe('Zé do Barco');
    const ms = o2.filter(([t]) => t === GAME_MSG.missaoEstado).pop()![1] as { ativas: { id: string }[]; alvo: { npc?: string; x?: number } | null };
    expect(ms.ativas[0]?.id).toBe('delta_01_cadastro');
    expect(ms.alvo?.npc).toBe('seu_jaco');
    expect(ms.alvo?.x).toBeTypeOf('number');
    expect(s.player!.name).toBe('Zé do Barco');
    expect(s.player!.look?.outfit.tier).toBe('delta');
  });

  it('falar com o Seu Jacó perto abre o diálogo e conta o objetivo; longe, recusa', () => {
    const { s } = helloFase2();
    s.receive(GAME_MSG.criarPersonagem, { name: 'Zé do Barco', appearance: okLook() });
    s.take();
    s.receive(GAME_MSG.falar, { npcId: 'seu_jaco' });
    const far = s.take();
    if (!far.some(([t]) => t === GAME_MSG.dialogo)) expect((far.find(([t]) => t === GAME_MSG.aviso)![1] as { tipo: string }).tipo).toBe('erro');
    const jaco = [...s.w.entities.values()].find((e) => e.kind === 'npc' && e.defId === 'seu_jaco')!;
    s.player!.x = jaco.x + 0.9;
    s.player!.y = jaco.y;
    s.receive(GAME_MSG.falar, { entity: jaco.id });
    const out = s.take();
    const d = out.find(([t]) => t === GAME_MSG.dialogo)![1] as { nome: string; fala: string; opcoes: { id: string }[] };
    expect(d.nome).toBeTruthy();
    expect(d.fala.length).toBeGreaterThan(0);
    expect(d.opcoes.some((o) => o.id === 'tchau')).toBe(true);
    expect(s.rec!.missions.progresso['delta_01_cadastro']?.[0]?.[0]).toBe(1);
  });

  it('Máquina de Visual: longe recusa; perto muda o visual e conta o "usar"', () => {
    const { s } = helloFase2();
    s.receive(GAME_MSG.criarPersonagem, { name: 'Zé do Barco', appearance: okLook() });
    s.take();
    s.receive(GAME_MSG.maquinaVisual, { change: { hair: 'moicano' }, maquina: 'maquina_visual_delta' });
    expect((msgs(s, GAME_MSG.aviso)[0] as { tipo: string }).tipo).toBe('erro');
    const mk = getMap('delta').markers.find((m) => m.kind === 'maquina_visual')!;
    s.player!.x = mk.x;
    s.player!.y = mk.y + 1;
    s.receive(GAME_MSG.maquinaVisual, { change: { hair: 'moicano' }, maquina: 'maquina_visual_delta' });
    s.take();
    expect(s.rec!.appearance.hair).toBe('moicano');
    expect(s.player!.look?.hair).toBe('moicano');
  });

  it('tutorial_passo marca o controle; travessia troca de mapa e fica guardada', () => {
    const { s, store, token } = helloFase2();
    s.receive(GAME_MSG.criarPersonagem, { name: 'Zé do Barco', appearance: okLook() });
    s.receive(GAME_MSG.tutorialPasso, { controle: 'andar_joystick', passo: 'andar' });
    s.take();
    expect(s.rec!.tutorial.controles).toContain('andar_joystick');
    expect(s.rec!.tutorial.feitos).toContain('andar');
    // pula o Delta: Bruno Ferro derrotado e nível 8
    const rec: PlayerRecord = s.rec!;
    rec.story_flags.push(FLAG_BRUNO);
    raiseToLevel(rec, 8);
    const inst = D.institutions.instituicoes.find((i) => i.margem === 'esquerda')!;
    const guia = D.guides.guias.find((g) => g.margem === 'esquerda')!;
    s.receive(GAME_MSG.travessia, { side: 'esquerda', institution: inst.id, guide: guia.id });
    const out = s.take();
    const w = out.find(([t]) => t === MSG.welcome)![1] as { mapId: string; you: number };
    // Fase 3: qg_esquerda virou apelido da margem_esquerda (o QG fica nela)
    expect(w.mapId).toBe('margem_esquerda');
    expect(s.mapId).toBe('margem_esquerda');
    expect(s.player!.classId).toBe(inst.classe);
    const p = out.filter(([t]) => t === GAME_MSG.perfil).pop()![1] as { stage: string; institution: string };
    expect(p.stage).toBe('margem');
    expect(p.institution).toBe(inst.id);
    s.tick();
    expect(s.take().some(([t]) => t === MSG.snap)).toBe(true);
    // recarregar a página: o registro volta da loja, no QG da margem
    const s2 = new LocalServer({ store, noEnemies: true });
    s2.receive(MSG.hello, { token, name: 'Zé' });
    const w2 = s2.take().find(([t]) => t === MSG.welcome)![1] as { mapId: string };
    expect(w2.mapId).toBe('margem_esquerda');
    expect(s2.rec!.institution).toBe(inst.id);
  });

  it('?ala= continua no protótipo da Fase 1, sem perfil', () => {
    const s = new LocalServer({ store: memStore(), noEnemies: true });
    s.receive(MSG.hello, { token: 'tok_proto_1', archetypeId: 'idol' });
    const out = s.take();
    expect((out.find(([t]) => t === MSG.welcome)![1] as { mapId: string }).mapId).toBe('prototipo_delta');
    expect(out.some(([t]) => t === GAME_MSG.perfil)).toBe(false);
    expect(s.player!.archetypeId).toBe('idol');
  });
});

describe('GameClient com o servidor local (Fase 2)', () => {
  it('recebe o perfil, cria o personagem, fala por "falar" e o auto-caminho acha o alvo', () => {
    const local = new LocalTransport({ store: memStore(), noEnemies: true });
    const gc = new GameClient(local, { name: 'Teste' });
    let now = 0;
    gc.connect();
    const run = (ms: number) => {
      const end = now + ms;
      while (now < end) {
        now += 1000 / 60;
        gc.update(1000 / 60, now);
      }
    };
    run(300);
    expect(gc.welcomed).toBe(true);
    expect(gc.game.needsCreation).toBe(true);
    expect(gc.dialogMode).toBe(true);
    expect(gc.createCharacter('Zé do Barco', okLook())).toBe(true);
    run(200);
    expect(gc.game.profile?.criado).toBe(true);
    expect(gc.game.missions?.ativas[0]?.id).toBe('delta_01_cadastro');
    // o tutorial manda cada controle uma vez
    gc.tutorialControl('andar_joystick', 'andar');
    gc.tutorialControl('andar_joystick', 'andar');
    run(200);
    expect(local.server.rec!.tutorial.controles.filter((c) => c === 'andar_joystick')).toHaveLength(1);
    expect(gc.autoPath()).toBe(true);
    run(12000);
    // chegou no Seu Jacó e falou (pela mensagem 'falar', não pelo comando da simulação)
    expect(gc.game.dialog?.npc).toBe('seu_jaco');
  });
});
