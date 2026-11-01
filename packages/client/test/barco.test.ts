/**
 * Travessia de barco no cliente: o servidor local (?offline=1) roda o mesmo fluxo do servidor
 * (game/barco.ts): embarcar com o Seu Jacó, o mapa do barco, a escolha na altura da ponte, os botões
 * da classe e o Especial cheio, a aula e a chegada no cais; recarregar no meio volta ao barco ou à
 * margem. Também a dica do barco no GameState e a arte das margens que rolam.
 */
import { describe, expect, it } from 'vitest';
import { getData } from '@pqp/shared';
import { FLAG_BRUNO, raiseToLevel } from '@pqp/shared/game/index';
import { boatRoomId, getMap } from '@pqp/shared/map';
import { GAME_MSG, MSG, type S2C_BarcoInfo, type S2C_Perfil } from '@pqp/shared/net';
import { GameState } from '../src/game/gameState';
import { LocalServer, type Outgoing, type RecordStore } from '../src/net/localServer';
import { boatFoamPix, boatShorePix, SHORE_COLS, SHORE_ROWS } from '../src/art/boat';

const D = getData();
const okLook = () => ({ ...D.appearance.padrao, details: [] as string[] });
const memStore = (): RecordStore => {
  const data = new Map<string, string>();
  return { load: (id) => (data.has(id) ? JSON.parse(data.get(id)!) : null), save: (id, rec) => void data.set(id, JSON.stringify(rec)) };
};
const all = <T>(out: Outgoing[], type: string): T[] => out.filter(([t]) => t === type).map(([, m]) => m as T);
const choice = (side: 'esquerda' | 'direita') => ({
  side,
  institution: D.institutions.instituicoes.find((i) => i.margem === side)!.id,
  guide: D.guides.guias.find((g) => g.margem === side)!.id,
});

/** Personagem no Delta, Bruno Ferro derrotado e no nível 8, ao lado do Seu Jacó. */
function readyInDelta(store: RecordStore, token: string) {
  const s = new LocalServer({ store, noEnemies: true, encounters: false });
  s.receive(MSG.hello, { token, name: 'Zé' });
  s.receive(GAME_MSG.criarPersonagem, { name: 'Zé do Barco', appearance: okLook() });
  const rec = s.rec!;
  rec.story_flags.push(FLAG_BRUNO);
  raiseToLevel(rec, 8);
  s.take();
  return { s, rec };
}

function nearJaco(s: LocalServer): void {
  const jaco = [...s.w.entities.values()].find((e) => e.kind === 'npc' && e.defId === 'seu_jaco')!;
  s.player!.x = jaco.x + 0.9;
  s.player!.y = jaco.y;
}

/** Roda até `cond` (ou `max` ticks), juntando o que o servidor mandou. */
function runUntil(s: LocalServer, cond: (out: Outgoing[]) => boolean, max: number, each?: (i: number) => void): { out: Outgoing[]; ticks: number } {
  const out: Outgoing[] = [];
  for (let i = 0; i < max; i++) {
    each?.(i);
    s.tick();
    out.push(...s.take());
    if (cond(out)) return { out, ticks: i + 1 };
  }
  return { out, ticks: -1 };
}

const atBridge = (out: Outgoing[]) => all<S2C_BarcoInfo>(out, GAME_MSG.barcoInfo).some((b) => b.fase === 'escolha');

describe('servidor local: travessia de barco', () => {
  it('embarca, escolhe na ponte, ganha os botões, faz a aula e chega no cais da margem', () => {
    const store = memStore();
    const token = 'tok_barco_local_1';
    const { s, rec } = readyInDelta(store, token);
    // no Delta, a escolha direta é recusada
    s.receive(GAME_MSG.travessia, choice('esquerda'));
    expect(all<{ tipo: string }>(s.take(), GAME_MSG.aviso).at(-1)?.tipo).toBe('erro');
    expect(rec.stage).toBe('travessia');
    // embarca com o Seu Jacó
    nearJaco(s);
    s.receive(GAME_MSG.dialogoOpcao, { npcId: 'seu_jaco', opcao: 'travessia' });
    let out = s.take();
    expect(all<{ mapId: string }>(out, MSG.welcome).at(-1)?.mapId).toBe(boatRoomId(token));
    expect(s.mapId).toBe(boatRoomId(token));
    expect(all<S2C_BarcoInfo>(out, GAME_MSG.barcoInfo).at(-1)?.fase).toBe('viagem');
    expect(s.w.map.width).toBe(getMap('barco_travessia').width);
    // até a ponte: o Seu Jacó fala e a escolha abre
    const viagem = runUntil(s, atBridge, 400);
    expect(viagem.ticks).toBeGreaterThan(0);
    expect(all(viagem.out, GAME_MSG.travessiaOpcoes).length).toBe(1);
    expect(all<{ guia: string }>(viagem.out, GAME_MSG.falaGuia).filter((f) => f.guia === 'seu_jaco').length).toBe(3);
    // escolhe: botões da classe e Especial cheio, ainda no barco
    const c = choice('esquerda');
    s.receive(GAME_MSG.travessia, c);
    out = s.take();
    const p = all<S2C_Perfil>(out, GAME_MSG.perfil).at(-1)!;
    expect(p.stage).toBe('margem');
    expect(p.controlesLiberados).toEqual(expect.arrayContaining(['habilidades', 'especial']));
    expect(s.player!.classId).toBe(D.institutionsById.get(c.institution)!.classe);
    expect(s.player!.special).toBe(1);
    expect(s.mapId).toBe(boatRoomId(token));
    expect(all<S2C_BarcoInfo>(out, GAME_MSG.barcoInfo).at(-1)?.dica?.id).toBe('aula_botao_1');
    // aula: aperta os botões; o barco chega sozinho (atalho de teste: o jogador não cai e os inimigos têm 1 de vida)
    let cmd = 0;
    let seq = 0;
    const aula = runUntil(
      s,
      (o) => all<{ mapId: string }>(o, MSG.welcome).length > 0,
      2400,
      (i) => {
        const pl = s.player!;
        pl.hp = pl.stats.hpMax;
        for (const e of s.w.entities.values()) if (e.kind === 'enemy' && !e.dead) e.hp = Math.min(e.hp, 1);
        const botao = (['especial', 1, 2, 3] as const)[i % 4]!;
        const cmds = i % 6 === 0 ? [{ id: ++cmd, c: 'habilidade' as const, botao }] : [];
        s.receive(MSG.input, { inputs: [{ seq: ++seq, mx: 0, my: 0 }], cmds, ackTick: 0, rtt: 0 });
      },
    );
    expect(aula.ticks).toBeGreaterThan(0);
    const infos = all<S2C_BarcoInfo>(aula.out, GAME_MSG.barcoInfo);
    expect(infos.some((b) => b.fase === 'chegada')).toBe(true);
    expect(all<{ situacao: string }>(aula.out, GAME_MSG.falaGuia).some((f) => f.situacao.startsWith('aula_'))).toBe(true);
    // chegou no cais da Esquerda
    expect(s.mapId).toBe('margem_esquerda');
    expect(s.boat).toBeNull();
    const cais = getMap('margem_esquerda').markers.find((m) => m.kind === 'spawn_jogador' && m.id === 'spawn')!;
    expect(Math.hypot(s.player!.x - cais.x, s.player!.y - cais.y)).toBeLessThan(1);
    // o Especial de cortesia fica no barco
    expect(s.player!.special).toBe(0);
    // recarregar a página: volta na margem
    const s2 = new LocalServer({ store, noEnemies: true, encounters: false });
    s2.receive(MSG.hello, { token, name: 'Zé' });
    expect(all<{ mapId: string }>(s2.take(), MSG.welcome).at(-1)?.mapId).toBe('margem_esquerda');
  });

  it('recarregar no barco antes de escolher volta ao barco (viagem nova); depois de escolher, à margem', () => {
    const store = memStore();
    const token = 'tok_barco_local_2';
    const { s } = readyInDelta(store, token);
    nearJaco(s);
    s.receive(GAME_MSG.dialogoOpcao, { npcId: 'seu_jaco', opcao: 'travessia' });
    s.take();
    runUntil(s, () => false, 60);
    const s2 = new LocalServer({ store, noEnemies: true, encounters: false });
    s2.receive(MSG.hello, { token, name: 'Zé' });
    const out = s2.take();
    expect(all<{ mapId: string }>(out, MSG.welcome).at(-1)?.mapId).toBe(boatRoomId(token));
    expect(all<S2C_BarcoInfo>(out, GAME_MSG.barcoInfo).at(-1)?.fase).toBe('viagem');
    expect(runUntil(s2, atBridge, 400).ticks).toBeGreaterThan(0);
    s2.receive(GAME_MSG.travessia, choice('direita'));
    s2.take();
    const s3 = new LocalServer({ store, noEnemies: true, encounters: false });
    s3.receive(MSG.hello, { token, name: 'Zé' });
    expect(all<{ mapId: string }>(s3.take(), MSG.welcome).at(-1)?.mapId).toBe('margem_direita');
  });

  it('dev (?dev_travessia=1): quem cria o personagem fica pronto para o barco', () => {
    const s = new LocalServer({ store: memStore(), noEnemies: true, encounters: false, devTravessia: true });
    s.receive(MSG.hello, { token: 'tok_barco_dev', name: 'Zé' });
    s.receive(GAME_MSG.criarPersonagem, { name: 'Zé Dev', appearance: okLook() });
    expect(s.rec!.level).toBe(8);
    expect(s.rec!.story_flags).toContain(FLAG_BRUNO);
    nearJaco(s);
    s.take();
    s.receive(GAME_MSG.dialogoOpcao, { npcId: 'seu_jaco', opcao: 'travessia' });
    expect(s.mapId).toBe(boatRoomId('tok_barco_dev'));
  });
});

describe('dica do barco no GameState', () => {
  it('no barco, a dica é a da fase (ou o botão da aula); fora dele, a do Delta', () => {
    const g = new GameState();
    g.onMessage(GAME_MSG.barcoInfo, { fase: 'aula', dica: { id: 'aula_botao_2', texto: 'Agora o botão 2', destaca: 'botao_2' }, passos: 1, totalPassos: 4 } satisfies S2C_BarcoInfo, 0);
    expect(g.tutorialStep()?.id).toBe('aula_botao_2');
    g.boat = null;
    expect(g.tutorialStep()).toBeUndefined();
  });
});

describe('arte das margens do barco', () => {
  it('as faixas têm o tamanho certo, são opacas e repetem; a espuma é transparente', () => {
    for (const side of ['esquerda', 'direita'] as const) {
      const p = boatShorePix(side);
      expect(p.w).toBe(SHORE_COLS * 32);
      expect(p.h).toBe(SHORE_ROWS * 32);
      expect(p.alphaAt(1, 1)).toBe(255);
      expect(p.alphaAt(p.w - 2, p.h - 2)).toBe(255);
    }
    // as duas margens não são iguais (paletas da Esquerda e da Direita)
    expect(boatShorePix('esquerda').get(40, 40)).not.toBe(boatShorePix('direita').get(40, 40));
    const f = boatFoamPix();
    expect(f.alphaAt(0, 0)).toBe(0);
  });
});
