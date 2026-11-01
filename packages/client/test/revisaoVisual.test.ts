/**
 * Revisão visual (HUD em zonas): fila de mensagens de uma por vez, desbloqueios agrupados, saque e
 * XP fora do mundo, balão de até 2 linhas, rastreador sem missão do Delta na margem e o cartão de
 * habilidade de primeira vez (fila, guarda no aparelho, some ao usar o botão) com os textos dele.
 */
import { describe, expect, it } from 'vitest';
import { getData } from '@pqp/shared';
import { GAME_MSG } from '@pqp/shared/net';
import { GameState, gainText, unlockToastText } from '../src/game/gameState';
import { AbilityIntroQueue, ABILITY_SEEN_KEY, CARD_MS } from '../src/ui/abilityIntro';
import { ABILITY_TYPE_LABEL, abilityCardText, firstSentence, isDraggableAbility } from '../src/ui/progressModel';
import { clampLines } from '../src/render/viewRules';
import { toastDuration, trackedMission, TOAST_QUEUED_MS } from '../src/ui/zonesModel';

const D = getData();
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

const memStorage = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('faixa de mensagens (Z2)', () => {
  it('vários desbloqueios de uma vez viram UM aviso curto; o texto inteiro vai para o Perfil com selo', () => {
    const g = new GameState();
    g.onMessage(GAME_MSG.perfil, perfil(), 0);
    const des = [
      { nivel: 1, controle: 'joystick', descricao: 'Joystick que aparece onde o polegar toca; tocar no chão leva até lá.' },
      { nivel: 1, controle: 'alvo', descricao: 'Alvo automático no inimigo mais perto que esteja à vista.' },
      { nivel: 1, controle: 'saque', descricao: 'O saque é coletado sozinho.' },
    ];
    g.onMessage(GAME_MSG.aviso, { texto: '', tipo: 'nivel', desbloqueios: des }, 10);
    const novos = g.toasts.filter((t) => t.tipo === 'missao');
    expect(novos).toHaveLength(1);
    expect(novos[0]!.texto).toBe('3 coisas novas: veja no MENU, em Perfil');
    expect(g.novidades).toHaveLength(3);
    expect(g.novidadesNaoVistas).toBe(true);
    g.seeNovidades();
    expect(g.novidadesNaoVistas).toBe(false);
    // o mesmo desbloqueio de novo não repete no Perfil
    g.onMessage(GAME_MSG.aviso, { texto: '', tipo: 'nivel', desbloqueios: [des[2]!] }, 9000);
    expect(g.novidades).toHaveLength(3);
  });

  it('texto do aviso de desbloqueio: curto fica inteiro; comprido manda para o Perfil', () => {
    expect(unlockToastText([{ nivel: 1, controle: 'x', descricao: 'Poção no botão de item.' }])).toBe('Novo: Poção no botão de item.');
    expect(unlockToastText([{ nivel: 1, controle: 'x', descricao: 'Joystick que aparece onde o polegar toca; tocar no chão leva até lá.' }])).toMatch(/Perfil/);
  });

  it('moeda e item coletados seguidos viram um aviso só, curto (nada em cima do boneco)', () => {
    const g = new GameState();
    g.onMessage(GAME_MSG.perfil, perfil(), 0);
    g.onGain({ semente: 2 }, 100);
    g.onGain({ credito: 8 }, 300);
    g.onGain({ item: 'Facão' }, 500);
    const s = g.toasts.filter((t) => t.tipo === 'saque');
    expect(s).toHaveLength(1);
    expect(s[0]!.texto).toBe('+2 Semente · +8 Crédito · + Facão');
    g.onGain({ item: 'Chinelo' }, 5000);
    expect(g.toasts.filter((t) => t.tipo === 'saque')).toHaveLength(2);
    expect(gainText({ semente: 0, credito: 0, itens: ['a', 'b'] })).toBe('+2 itens');
  });

  it('o mesmo aviso que ainda está na fila não entra de novo', () => {
    const g = new GameState();
    g.pushToast('Indo até o espelho...', 'info', 0);
    g.pushToast('Indo até o espelho...', 'info', 500);
    expect(g.toasts).toHaveLength(1);
    expect(g.toasts[0]!.at).toBe(500);
  });

  it('tempo na tela: curto com fila, mais longo para a fala do guia', () => {
    expect(toastDuration({ texto: 'Visual novo salvo!', tipo: 'info' }, false)).toBe(2500);
    expect(toastDuration({ texto: 'Visual novo salvo!', tipo: 'info' }, true)).toBe(TOAST_QUEUED_MS);
    const fala = { texto: 'Do outro lado vão te dar uns botões grandes. Não se assuste, é só apertar.', tipo: 'guia' as const };
    expect(toastDuration(fala, true)).toBeGreaterThan(3000);
    expect(toastDuration(fala, true)).toBeLessThanOrEqual(6000);
  });
});

describe('rastreador compacto (Z1)', () => {
  it('na margem, a missão do Delta que ficou para trás não aparece', () => {
    const delta = D.missions.missoes.find((m) => m.regiao === 'delta' && m.nivel < 8)!;
    const outra = D.missions.missoes.find((m) => m.id === 'travessia_08')!;
    const a = (id: string) => ({ id, name: id, resumo: '', objetivo: 'obj ' + id, indice: 0, total: 1, feito: 0, meta: 1 });
    const ms = { ativas: [a(delta.id), a(outra.id)], objetivo: 'obj delta', alvo: null };
    expect(trackedMission(ms, 'delta')).toEqual({ a: ms.ativas[0], first: true });
    expect(trackedMission(ms, 'margem')).toEqual({ a: ms.ativas[1], first: false });
    // no barco também (a da travessia, do nível 8, continua)
    expect(trackedMission(ms, 'travessia')).toEqual({ a: ms.ativas[1], first: false });
    expect(trackedMission({ ativas: [a(delta.id)], objetivo: null, alvo: null }, 'margem')).toBeNull();
  });
});

describe('balões no mundo (Z3)', () => {
  // quebrador simples: 20 letras por linha
  const wrap = (s: string): string[] => {
    const out: string[] = [];
    let cur = '';
    for (const w of s.split(' ')) {
      if (cur && (cur + ' ' + w).length > 20) {
        out.push(cur);
        cur = w;
      } else cur = cur ? cur + ' ' + w : w;
    }
    if (cur) out.push(cur);
    return out;
  };

  it('no máximo 2 linhas, cortando com "…"', () => {
    const t = 'Bom dia! Vim só conversar sobre a sua dívida. E sobre a dívida da sua dívida.';
    const c = clampLines(t, 2, wrap);
    expect(wrap(c).length).toBeLessThanOrEqual(2);
    expect(c.endsWith('…')).toBe(true);
    expect(c.startsWith('Bom dia!')).toBe(true);
    expect(clampLines('Oi, tudo bem?', 2, wrap)).toBe('Oi, tudo bem?');
  });
});

describe('cartão de habilidade de primeira vez', () => {
  it('uma por vez, 4 s cada; guarda no aparelho e não volta; some ao usar o botão', () => {
    const st = memStorage();
    const q = new AbilityIntroQueue(st);
    const slots = { b1: 'a1', b2: 'a2', b3: 'a3', especial: undefined };
    expect(q.update(0, slots, true)?.id).toBe('a1');
    expect(q.update(100, slots, true)?.id).toBe('a1');
    // usou o botão 1: passa para o próximo
    q.used('b1');
    expect(q.update(200, slots, true)?.id).toBe('a2');
    // tela ocupada (diálogo): não mostra e o tempo para
    expect(q.update(3000, slots, false)).toBeNull();
    expect(q.update(9000, slots, true)?.id).toBe('a2');
    expect(q.update(9000 + CARD_MS + 10, slots, true)?.id).toBe('a3');
    expect(q.update(20000, slots, true)).toBeNull();
    expect(st.m.get(ABILITY_SEEN_KEY)?.split(',').sort()).toEqual(['a1', 'a2', 'a3']);
    // outro aparelho com o mesmo armazenamento: não repete; a troca do botão 3 mostra só a nova
    const q2 = new AbilityIntroQueue(st);
    expect(q2.update(0, slots, true)).toBeNull();
    expect(q2.update(10, { ...slots, b3: 'a4' }, true)?.id).toBe('a4');
  });

  it('a habilidade que saiu do botão (troca de ala) sai da fila', () => {
    const q = new AbilityIntroQueue(memStorage());
    expect(q.update(0, { b1: 'x1', b2: 'x2' }, true)?.id).toBe('x1');
    expect(q.update(10, { b1: 'y1', b2: 'y2' }, true)?.id).toBe('y1');
    expect(q.update(20 + CARD_MS, { b1: 'y1', b2: 'y2' }, true)?.id).toBe('y2');
  });

  it('textos: nome, tipo em palavra simples, 1 linha, recarga, custo e gesto de cada habilidade dos dados', () => {
    for (const a of D.abilities.values()) {
      const t = abilityCardText(a, 'Fôlego');
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.tipo).toBe(ABILITY_TYPE_LABEL[a.type]);
      expect(t.linha.length).toBeLessThanOrEqual(70);
      expect(t.linha.length).toBeGreaterThan(0);
      if (a.slot !== 'especial' && a.slot !== 'virada' && a.cooldownS > 0) expect(t.numeros).toMatch(/Recarga \d/);
      if (a.cost > 0) expect(t.numeros).toMatch(/Custo \d+(,\d)? Fôlego/);
      expect(t.gesto).toBe(isDraggableAbility(a) ? 'Toque, ou segure e arraste para posicionar' : 'Toque');
    }
    expect(Object.values(ABILITY_TYPE_LABEL)).toEqual(['No alvo', 'Em volta', 'Área', 'Cone', 'Campo', 'Em aliado']);
  });

  it('primeira frase: corta em palavra inteira com "…"', () => {
    expect(firstSentence('Bate forte. Depois corre.')).toBe('Bate forte.');
    const long = 'Vira fera (Esquerda) ou monta a armadura (Direita) e ganha muita vida e dano por alguns segundos sem parar';
    const s = firstSentence(long, 60);
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith('…')).toBe(true);
    expect(long.startsWith(s.slice(0, -1))).toBe(true);
  });
});
