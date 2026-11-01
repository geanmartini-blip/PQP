/**
 * Fase 3 no cliente: o estado do jogo com as mensagens novas (opções de ala e talento, instituição,
 * fala do guia, emote, troca de sala) e o servidor local rodando as mesmas regras de shared/game
 * (ala no 12, botão 3, talentos, emote do bordão, conversa com o guia e as saídas entre os mapas).
 */
import { describe, expect, it } from 'vitest';
import { getData } from '@pqp/shared';
import { GAME_MSG, MSG, type S2C_ProgressoOpcoes } from '@pqp/shared/net';
import { baseTrainerOf, FLAG_BRUNO, FLAG_ENTROU, raiseToLevel, setFlag } from '@pqp/shared/game/index';
import { getMap } from '@pqp/shared/map';
import { GameState } from '../src/game/gameState';
import { GameClient } from '../src/game/GameClient';
import { LocalServer, type RecordStore } from '../src/net/localServer';
import type { NetStatus, Transport } from '../src/net/transport';
import { emoteText, ABILITY_TYPE_LABEL } from '../src/ui/progressModel';

const D = getData();
const okLook = () => ({ ...D.appearance.padrao, details: [] as string[] });
const memStore = (): RecordStore => {
  const data = new Map<string, string>();
  return { load: (id) => (data.has(id) ? JSON.parse(data.get(id)!) : null), save: (id, rec) => void data.set(id, JSON.stringify(rec)) };
};

const last = <T>(s: LocalServer, type: string): T | undefined =>
  s
    .take()
    .filter(([t]) => t === type)
    .map(([, m]) => m as T)
    .pop();

/** Personagem já atravessado, na margem, com a instituição escolhida. */
function onMargin(side: 'esquerda' | 'direita' = 'direita') {
  const s = new LocalServer({ store: memStore(), noEnemies: true });
  s.receive(MSG.hello, { token: `tok_f3_${side}`, name: 'Zé' });
  s.receive(GAME_MSG.criarPersonagem, { name: 'Zé da Silva', appearance: okLook() });
  const rec = s.rec!;
  expect(rec.criado).toBe(true);
  rec.story_flags.push(FLAG_BRUNO);
  raiseToLevel(rec, 8);
  const inst = D.institutions.instituicoes.find((i) => i.margem === side)!;
  const guia = D.guides.guias.find((g) => g.margem === side)!;
  s.receive(GAME_MSG.travessia, { side, institution: inst.id, guide: guia.id });
  s.take();
  return { s, rec, inst, guia };
}

describe('GameState (Fase 3)', () => {
  it('guarda opções, instituição, falas do guia, emotes e troca de sala', () => {
    const g = new GameState();
    g.onMessage(GAME_MSG.progressoInfo, { ala: { pode: false, opcoes: [] }, talentos: [], loadout: null }, 0);
    expect(g.progress?.ala.pode).toBe(false);
    g.onMessage(GAME_MSG.instituicaoInfo, { id: 'x' }, 0);
    expect(g.institution?.id).toBe('x');
    g.onMessage(GAME_MSG.falaGuia, { guia: 'g', nome: 'G', situacao: 'missao', texto: 'Oi' }, 5);
    expect(g.takeGuideLine()?.texto).toBe('Oi');
    expect(g.takeGuideLine()).toBeUndefined();
    g.onMessage(GAME_MSG.emote, { entity: 3, playerId: 'p', nome: 'Zé', emote: 'e', texto: 'Uh!', animacao: 'a', quadros: 2 }, 0);
    expect(g.takeEmotes().map((e) => e.texto)).toEqual(['Uh!']);
    expect(g.takeEmotes()).toEqual([]);
    g.onMessage(GAME_MSG.trocarSala, { mapId: 'margem_direita', motivo: 'travessia' }, 0);
    expect(g.roomChange?.mapId).toBe('margem_direita');
  });

  it('escolha pendente: ala antes de talento', () => {
    const g = new GameState();
    expect(g.pendingChoice).toBeNull();
    g.onMessage(GAME_MSG.perfil, { criado: true, level: 12, podeEscolherAla: true, talentosPendentes: [10], tutorial: { feitos: [], controles: [] }, controlesLiberados: [] }, 0);
    expect(g.pendingChoice).toBe('ala');
    g.onMessage(GAME_MSG.perfil, { criado: true, level: 12, podeEscolherAla: false, talentosPendentes: [10], tutorial: { feitos: [], controles: [] }, controlesLiberados: [] }, 0);
    expect(g.pendingChoice).toBe('talento');
  });
});

describe('servidor local com as regras da Fase 3', () => {
  it('a margem da Direita abre com o kit da classe e os botões no HUD', () => {
    const { s, inst } = onMargin('direita');
    expect(s.mapId).toBe('margem_direita');
    expect(s.player!.classId).toBe(inst.classe);
    s.tick();
    const snap = last<{ hud: { ab: (string | undefined)[] } }>(s, MSG.snap)!;
    expect(snap.hud.ab.slice(0, 3).every((x) => typeof x === 'string' && x.length > 0)).toBe(true);
    // nasce no cais (o primeiro spawn_jogador), não na entrada da Usina
    const cais = getMap('margem_direita').markers.find((m) => m.kind === 'spawn_jogador')!;
    expect(Math.hypot(s.player!.x - cais.x, s.player!.y - cais.y)).toBeLessThan(1);
  });

  it('ala no 12: opções, escolha, botão 3 e o kit da entidade', () => {
    const { s, rec, inst } = onMargin('esquerda');
    s.receive(GAME_MSG.progressoOpcoes, {});
    let pr = last<S2C_ProgressoOpcoes>(s, GAME_MSG.progressoInfo)!;
    expect(pr.ala.pode).toBe(false);
    expect(pr.ala.opcoes).toHaveLength(3);
    // recusada antes do 12
    s.receive(GAME_MSG.escolherAla, { archetype: inst.alas[0] });
    expect(last<{ tipo: string }>(s, GAME_MSG.aviso)?.tipo).toBe('erro');
    setFlag(rec, FLAG_ENTROU);
    raiseToLevel(rec, 12);
    s.receive(GAME_MSG.progressoOpcoes, {});
    pr = last<S2C_ProgressoOpcoes>(s, GAME_MSG.progressoInfo)!;
    expect(pr.ala.pode).toBe(true);
    const alvo = pr.ala.opcoes[1]!;
    expect(alvo.marcas).toHaveLength(2);
    s.receive(GAME_MSG.escolherAla, { archetype: alvo.id });
    s.take();
    expect(rec.archetype).toBe(alvo.id);
    expect(s.player!.archetypeId).toBe(alvo.id);
    // botão 3: outra habilidade da classe
    const cls = D.classesById.get(inst.classe)!;
    const outra = cls.abilities.find((a) => a !== rec.loadout.slot3_ability)!;
    s.receive(GAME_MSG.trocarSlot3, { ability: outra });
    s.take();
    expect(rec.loadout.slot3_ability).toBe(outra);
    expect(s.player!.loadout?.b3?.split('@')[0]).toBe(outra);
    // habilidade de fora da classe: recusa
    s.receive(GAME_MSG.trocarSlot3, { ability: 'rodeio' });
    expect(last<{ tipo: string }>(s, GAME_MSG.aviso)?.tipo).toBe('erro');
  });

  it('talento do nível 10 entra na entidade', () => {
    const { s, rec } = onMargin('direita');
    raiseToLevel(rec, 10);
    s.receive(GAME_MSG.progressoOpcoes, {});
    const pr = last<S2C_ProgressoOpcoes>(s, GAME_MSG.progressoInfo)!;
    const t = pr.talentos.find((x) => x.nivel === 10)!.opcoes[0]!;
    s.receive(GAME_MSG.escolherTalento, { talent: t.id });
    const p2 = last<S2C_ProgressoOpcoes>(s, GAME_MSG.progressoInfo)!;
    expect(rec.talent_picks).toContain(t.id);
    expect(p2.talentos.some((x) => x.nivel === 10)).toBe(false);
    expect(s.player!.talents).toContain(t.id);
    // o mesmo de novo: recusa
    s.receive(GAME_MSG.escolherTalento, { talent: t.id });
    expect(last<{ tipo: string }>(s, GAME_MSG.aviso)?.tipo).toBe('erro');
  });

  it('bordão vira emote ao falar com quem recebe a base; o emote volta para o cliente', () => {
    const { s, rec } = onMargin('esquerda');
    s.receive(GAME_MSG.emote, { emote: 'qualquer' });
    expect(last<{ tipo: string }>(s, GAME_MSG.aviso)?.tipo).toBe('erro');
    const base = baseTrainerOf(rec)!;
    const npc = [...s.w.entities.values()].find((e) => e.kind === 'npc' && e.defId === base)!;
    expect(npc).toBeTruthy();
    s.player!.x = npc.x + 0.9;
    s.player!.y = npc.y;
    s.receive(GAME_MSG.falar, { entity: npc.id });
    const d = last<{ bordao?: string; emote?: { id: string; novo: boolean } }>(s, GAME_MSG.dialogo)!;
    expect(d.bordao).toBeTruthy();
    expect(d.emote?.novo).toBe(true);
    s.receive(GAME_MSG.emote, { emote: d.emote!.id });
    const em = last<{ entity: number; texto: string }>(s, GAME_MSG.emote)!;
    expect(em.entity).toBe(s.player!.id);
    expect(em.texto).toBe(emoteText(d.emote!.id));
  });

  it('conversa com o guia sem entidade no mundo', () => {
    const { s, guia } = onMargin('direita');
    s.receive(GAME_MSG.falar, { npcId: 'guia' });
    const d = last<{ guia?: boolean; nome: string; fala: string }>(s, GAME_MSG.dialogo)!;
    expect(d.guia).toBe(true);
    expect(d.nome).toBe(guia.name);
    expect(d.fala.length).toBeGreaterThan(0);
  });

  it('parado na margem, o perfil não é mandado a cada tick', () => {
    const { s } = onMargin('direita');
    for (let i = 0; i < 40; i++) s.tick();
    const n = s.take().filter(([t]) => t === GAME_MSG.perfil).length;
    expect(n).toBeLessThanOrEqual(2);
  });

  it('tela da instituição', () => {
    const { s, inst } = onMargin('esquerda');
    s.receive(GAME_MSG.instituicao, {});
    const info = last<{ id: string; quadro: unknown[]; minhaPatente: unknown }>(s, GAME_MSG.instituicaoInfo)!;
    expect(info.id).toBe(inst.id);
    expect(info.quadro.length).toBeGreaterThan(0);
    expect(info.minhaPatente).toBeTruthy();
  });

  it('saídas: margem -> Usina da Ponte -> margem, na entrada certa e sem voltar na hora', () => {
    const { s } = onMargin('esquerda');
    const exit = getMap('margem_esquerda').markers.find((m) => m.id === 'saida_usina_da_ponte')!;
    s.player!.x = exit.x - 0.5;
    s.player!.y = exit.y;
    for (let i = 0; i < 6; i++) s.tick();
    const out = s.take();
    const w = out.filter(([t]) => t === MSG.welcome).pop()?.[1] as { mapId: string } | undefined;
    expect(w?.mapId).toBe('usina_da_ponte');
    expect(s.mapId).toBe('usina_da_ponte');
    const sp = getMap('usina_da_ponte').markers.find((m) => m.id === 'spawn_esquerda')!;
    expect(Math.hypot(s.player!.x - sp.x, s.player!.y - sp.y)).toBeLessThan(1);
    // parado na entrada (perto da saída de volta): não troca
    for (let i = 0; i < 20; i++) s.tick();
    expect(s.mapId).toBe('usina_da_ponte');
    // reconectar na mesma aba fica no mapa atual
    s.receive(MSG.hello, { token: 'tok_f3_esquerda', name: 'Zé' });
    expect((last<{ mapId: string }>(s, MSG.welcome))?.mapId).toBe('usina_da_ponte');
    // voltar pela saída da esquerda
    const back = getMap('usina_da_ponte').markers.find((m) => m.id === 'saida_margem_esquerda')!;
    s.player!.x = back.x + 3;
    s.player!.y = back.y;
    for (let i = 0; i < 6; i++) s.tick();
    s.player!.x = back.x + 0.5;
    for (let i = 0; i < 6; i++) s.tick();
    expect(s.mapId).toBe('margem_esquerda');
  });
});

describe('GameClient (Fase 3)', () => {
  it("'trocar_sala' pede a sala do mapa novo e entra de novo", () => {
    let rejoins = 0;
    const t: Transport = {
      onMessage: () => {},
      onStatus: (_s: NetStatus) => {},
      onOpen: () => {},
      connect: () => {},
      send: () => {},
      close: () => {},
      rejoin: () => void rejoins++,
    };
    const gc = new GameClient(t);
    t.onMessage(GAME_MSG.trocarSala, { mapId: 'margem_direita', motivo: 'travessia', token: 'g_token_novo_123' });
    expect(rejoins).toBe(1);
    expect(gc.joinOptions()['mapId']).toBe('margem_direita');
    expect(gc.token).toBe('g_token_novo_123');
    expect(gc.mapChange?.to).toBe('margem_direita');
    expect(gc.game.roomChange?.mapId).toBe('margem_direita');
  });

  it('rótulos dos tipos de habilidade cobrem os 6 tipos', () => {
    for (const a of D.abilities.values()) if (a.type) expect(ABILITY_TYPE_LABEL[a.type]).toBeTruthy();
  });
});
