/**
 * v0.4: early game mais longo. As missões novas (Delta extra, A Colheita, O Turno da Noite, as das
 * instituições, os bicos e O Sinal da Eco) têm tudo de que precisam nos mapas, as cadeias se jogam
 * do começo ao fim com eventos sintéticos e a curva de XP pede mais do 5 ao 10.
 */
import { describe, expect, it } from 'vitest';
import { getData } from '../src/data';
import {
  acceptMission,
  createCharacter,
  defaultAppearance,
  destinoDaTroca,
  dialogOption,
  dialogOptions,
  FLAG_TROCA_LIBERADA,
  newPlayerRecord,
  onGameEvent,
  podeTrocarDeLado,
  setFlag,
  temporadaDe,
  trocarDeLado,
  type GameEvent,
  type PlayerRecord,
} from '../src/game';
import { hasFlag } from '../src/game/flags';
import { xpToNextLevel } from '../src/game/progression';
import { getMap, listMaps } from '../src/map/registry';
import type { Objective } from '../src/schema/mission';

const D = getData();
const V04 = /^(delta_extra_|colheita_|turno_|inst_.*_v04$|bico_|farol_)/;
const missoes = D.missions.missoes.filter((m) => V04.test(m.id));
const markers = listMaps().flatMap((id) => getMap(id).markers.map((m) => ({ ...m, mapa: id })));

describe('v0.4: as missões novas cabem nos mapas', () => {
  it('são 30, todas marcadas como sugestão', () => {
    expect(missoes.length).toBe(30);
    for (const m of missoes) expect(m.sugestao, m.id).toBe(true);
  });

  it('quem dá, os lugares, os alvos e os inimigos existem em algum mapa', () => {
    const papeis = new Set(['treinador_da_base', 'quadro_de_missoes']);
    const temNpc = (id: string) => markers.some((k) => k.kind === 'npc' && k.ref === id);
    const temLugar = (id: string) => markers.some((k) => k.kind === 'lugar' && k.ref === id);
    const temAlvo = (alvo: string, acao: string) => markers.some((k) => k.params?.['interagir'] === alvo && k.params?.['acao'] === acao);
    const temInimigo = (id: string) =>
      markers.some((k) => (k.kind === 'bando' && (k.params?.['inimigos'] as string[]).includes(id)) || ((k.kind === 'inimigo' || k.kind === 'chefe') && k.ref === id));
    for (const m of missoes) {
      if (!papeis.has(m.dadaPor)) expect(temNpc(m.dadaPor), `${m.id}: ${m.dadaPor}`).toBe(true);
      for (const o of m.objetivos as Objective[]) {
        if (o.tipo === 'falar') expect(temNpc(o.npc), `${m.id}: falar ${o.npc}`).toBe(true);
        if (o.tipo === 'ir_ate' && o.lugar) expect(temLugar(o.lugar), `${m.id}: ${o.lugar}`).toBe(true);
        if (o.tipo === 'ir_ate' && o.regiao) expect(listMaps(), `${m.id}: ${o.regiao}`).toContain(o.regiao);
        if (o.tipo === 'interagir') expect(temAlvo(o.alvo, o.acao), `${m.id}: ${o.alvo}/${o.acao}`).toBe(true);
        if (o.tipo === 'derrotar') for (const g of o.inimigos) expect(temInimigo(g.inimigo), `${m.id}: ${g.inimigo}`).toBe(true);
      }
    }
  });

  it('os alvos de interação de cada missão têm marcadores que bastam para a quantidade pedida', () => {
    for (const m of missoes)
      for (const o of m.objetivos as Objective[]) {
        if (o.tipo !== 'interagir') continue;
        const n = markers.filter((k) => k.params?.['interagir'] === o.alvo && k.params?.['acao'] === o.acao).length;
        expect(n, `${m.id}: ${o.alvo}`).toBeGreaterThanOrEqual(o.quantidade);
      }
  });
});

/** Joga a missão com os eventos que cada objetivo pede. */
function joga(rec: PlayerRecord, id: string): void {
  const m = D.missionsById.get(id)!;
  expect(acceptMission(rec, id).ok, id).toBe(true);
  for (const o of m.objetivos as Objective[]) {
    const evs: GameEvent[] = [];
    if (o.tipo === 'ir_ate') evs.push(o.lugar ? { t: 'arrive', placeId: o.lugar } : { t: 'arrive', regionId: o.regiao! });
    if (o.tipo === 'falar') evs.push({ t: 'talk', npcId: o.npc });
    if (o.tipo === 'interagir') for (let i = 0; i < o.quantidade; i++) evs.push({ t: 'interact', alvo: o.alvo, acao: o.acao });
    if (o.tipo === 'escolher') evs.push({ t: 'choose', opcao: o.opcoes[0]!.id, missionId: id });
    if (o.tipo === 'derrotar') for (const g of o.inimigos) for (let i = 0; i < g.quantidade; i++) evs.push({ t: 'kill', enemyId: g.inimigo, tier: g.tier ?? 'normal' });
    for (const ev of evs) onGameEvent(rec, ev);
  }
  expect(rec.missions.concluidas, id).toContain(id);
}

function personagem(lado: 'esquerda' | 'direita', nivel: number): PlayerRecord {
  const rec = newPlayerRecord(`v04_${lado}`, 'Teste');
  expect(createCharacter(rec, 'Zé da Colheita', defaultAppearance()).ok).toBe(true);
  rec.stage = 'margem';
  rec.side = lado;
  rec.level = nivel;
  for (const f of ['delta_bruno_ferro_derrotado', 'entrou_instituicao', `margem_${lado}`]) setFlag(rec, f);
  return rec;
}

describe('v0.4: as cadeias novas se jogam do começo ao fim', () => {
  const cadeia = (id: string) => D.missions.cadeias.find((c) => c.id === id)!.missoes;

  it('A Colheita (Esquerda) termina com o Espantalho-Mor', () => {
    const rec = personagem('esquerda', 9);
    for (const id of cadeia('esquerda_a_colheita')) joga(rec, id);
    expect(hasFlag(rec, 'colheita_salva')).toBe(true);
  });

  it('O Turno da Noite (Direita) termina com o Relógio de Ponto', () => {
    const rec = personagem('direita', 9);
    for (const id of cadeia('direita_o_turno_da_noite')) joga(rec, id);
    expect(hasFlag(rec, 'turno_ponto_quebrado')).toBe(true);
  });

  it('O Sinal da Eco vale para os dois lados', () => {
    for (const lado of ['esquerda', 'direita'] as const) {
      const rec = personagem(lado, 11);
      for (const id of cadeia('ilha_do_farol')) joga(rec, id);
      expect(hasFlag(rec, 'farol_arquivo_salvo')).toBe(true);
    }
  });
});

describe('v0.4: curva de XP', () => {
  it('do 5 ao 10 o XP pedido é 1,5 vez o da fórmula; fora da faixa, igual', () => {
    const base = (n: number) => 50 * Math.pow(n, 1.6);
    expect(xpToNextLevel(4)).toBe(Math.round(base(4)));
    for (let n = 5; n <= 10; n++) expect(xpToNextLevel(n)).toBe(Math.round(base(n) * 1.5));
    expect(xpToNextLevel(11)).toBe(Math.round(base(11)));
  });
});

describe('v0.4: troca de lado', () => {
  function veterano(): PlayerRecord {
    const rec = personagem('esquerda', 19);
    rec.institution = 'brigada_popular';
    rec.class = 'combatente';
    rec.archetype = 'peao_brabo';
    rec.rank = 'membro';
    rec.home_id = 'casa_teste';
    for (const f of ['entrou_brigada_popular']) setFlag(rec, f);
    return rec;
  }

  it('só depois da cabeceira; leva para a instituição da mesma classe e para a ala par', () => {
    const rec = veterano();
    expect(podeTrocarDeLado(rec, 1).ok).toBe(false);
    setFlag(rec, FLAG_TROCA_LIBERADA);
    expect(destinoDaTroca(rec)).toEqual({ side: 'direita', institution: 'torcida_furia_neon', archetype: 'sumo_cibernetico' });
    expect(dialogOptions(rec, 'seu_jaco', { temporada: 1 }).some((o) => o.id === 'trocar_lado')).toBe(true);
    // pedir a troca abre a escolha do guia: as 4 IAs de bolso da Direita e o "fico"
    const pedido = dialogOption(rec, 'seu_jaco', 'trocar_lado', { temporada: 1 });
    expect(pedido.ok).toBe(true);
    expect(pedido.fala).toBeTruthy();
    expect(rec.side).toBe('esquerda');
    const guias = dialogOptions(rec, 'seu_jaco', { temporada: 1 }).filter((o) => o.id.startsWith('trocar_lado:'));
    expect(guias.map((o) => o.id)).toEqual(D.guides.guias.filter((g) => g.margem === 'direita').map((g) => `trocar_lado:${g.id}`));
    // guia da margem errada não passa; desistir volta ao normal
    expect(dialogOption(rec, 'seu_jaco', 'trocar_lado:valquiria', { temporada: 1 }).ok).toBe(false);
    expect(dialogOption(rec, 'seu_jaco', 'trocar_lado_voltar', { temporada: 1 }).ok).toBe(true);
    expect(dialogOptions(rec, 'seu_jaco', { temporada: 1 }).some((o) => o.id === 'trocar_lado')).toBe(true);
    dialogOption(rec, 'seu_jaco', 'trocar_lado', { temporada: 1 });
    expect(dialogOption(rec, 'seu_jaco', 'trocar_lado:byte', { temporada: 1 }).ok).toBe(true);
    expect(rec.guide_id).toBe('byte');
    expect(rec.counters['troca_de_lado_escolhendo']).toBeUndefined();
    expect(rec.side).toBe('direita');
    expect(rec.institution).toBe('torcida_furia_neon');
    expect(rec.class).toBe('combatente');
    expect(rec.archetype).toBe('sumo_cibernetico');
    expect(rec.level).toBe(19);
    expect(rec.home_id).toBeNull();
    expect(rec.rank).toBe(D.societies.sociedades.find((s) => s.side === 'direita')!.patentes[0]!.id);
    expect(D.guidesById.get(rec.guide_id!)!.margem).toBe('direita');
    expect(hasFlag(rec, 'margem_direita')).toBe(true);
    expect(hasFlag(rec, 'margem_esquerda')).toBe(false);
    expect(hasFlag(rec, 'entrou_torcida_furia_neon')).toBe(true);
    expect(hasFlag(rec, 'trocou_de_lado')).toBe(true);
  });

  it('uma vez por temporada; na seguinte, volta para a ala de antes', () => {
    const rec = veterano();
    setFlag(rec, FLAG_TROCA_LIBERADA);
    expect(trocarDeLado(rec, temporadaDe(Date.UTC(2026, 10, 2))).ok).toBe(true);
    expect(trocarDeLado(rec, temporadaDe(Date.UTC(2026, 10, 30))).ok).toBe(false);
    expect(dialogOptions(rec, 'seu_jaco', { temporada: temporadaDe(Date.UTC(2026, 10, 30)) }).some((o) => o.id === 'trocar_lado')).toBe(false);
    expect(trocarDeLado(rec, temporadaDe(Date.UTC(2026, 11, 1))).ok).toBe(true);
    expect(rec.side).toBe('esquerda');
    expect(rec.archetype).toBe('peao_brabo');
  });
});