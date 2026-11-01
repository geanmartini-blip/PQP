/**
 * Motor de missões (missions.json): aceitar, avançar objetivos por eventos, concluir com
 * recompensas (solo sempre; grupo com XP) e ligar story_flags, e o alvo do auto-caminho.
 *
 * Objetivos em ordem: o evento conta para o objetivo atual (o primeiro obrigatório que falta) e
 * para os opcionais que faltam. Objetivo de controle que o jogador já usou, e de ir até o lugar
 * onde ele já está, se completa sozinho quando vira o atual.
 *
 * Decisões:
 * - As cadeias do Delta e da travessia andam sozinhas: ao concluir uma missão, a próxima que
 *   ficar disponível já entra como ativa (o rastreador nunca fica vazio no tutorial).
 * - O nível da missão no Delta é só recomendação (as flags mandam); fora do Delta, a missão
 *   aceita até NIVEL_TOLERANCIA níveis abaixo.
 */
import { getData } from '../data';
import type { TileMap } from '../map/types';
import type { Mission, Objective } from '../schema/mission';
import type { Reward } from '../schema/world';
import { hasFlag, setFlag } from './flags';
import { FLAG_BRUNO, gainXp, groupXp, isDeltaRookie, raiseToLevel, syncLevel, TRAVESSIA_LEVEL } from './progression';
import { markStep, onTutorialEvent } from './tutorial';
import { emptyResult, mergeResult, type Check, type GameEvent, type GameResult, type GroupCtx, type PlayerRecord } from './types';
import { guideLine } from './guides';
import { alaTrainerOf, npcMatches, resolveNpc } from './people';
import { updateRanks } from './ranks';
import { unlockTrainerEmote } from './trainers';

/** SUGESTÃO: quantos níveis abaixo do nível da missão ainda dá para aceitar (fora do Delta). */
export const NIVEL_TOLERANCIA = 2;

/**
 * Cadeias que andam sozinhas. Fase 3: a missão de entrada da instituição ('entradas') entra
 * sozinha quando a cadeia de chegada da margem libera (só a da instituição do jogador passa no
 * missionAvailable).
 */
export const AUTO_CHAINS = ['delta_1_a_7', 'travessia', 'entradas'] as const;

/** Cadeias que só abrem no nível exato da missão (sem a tolerância): a escolha da ala é no 12. */
const NIVEL_EXATO = new Set(['escolha_da_ala']);

/** SUGESTÃO: seguidores por inimigo derrotado e por lugar novo visitado (entrada da Agência Neon). */
export const SEGUIDORES_POR_INIMIGO = 10;
export const SEGUIDORES_POR_LUGAR = 5;

const missionOf = (id: string): Mission | undefined => getData().missionsById.get(id);

// ---------------------------------------------------------------------------
// Disponibilidade e aceite

export function missionAvailable(rec: PlayerRecord, id: string): Check {
  const m = missionOf(id);
  if (!m) return { ok: false, erro: 'Missão desconhecida.' };
  if (!m.emPiloto || m.esboco) return { ok: false, erro: 'Essa missão ainda não está no piloto.' };
  if (rec.missions.ativas.includes(id)) return { ok: false, erro: 'Essa missão já está ativa.' };
  if (rec.missions.concluidas.includes(id) && !m.repetivel) return { ok: false, erro: 'Missão já concluída.' };
  for (const f of m.requerFlags) if (!hasFlag(rec, f)) return { ok: false, erro: 'Ainda não é hora dessa missão.' };
  for (const f of m.bloqueadaPorFlags) if (hasFlag(rec, f)) return { ok: false, erro: 'Essa missão não está mais disponível.' };
  if (m.margem && m.margem !== rec.side) return { ok: false, erro: 'Missão da outra margem.' };
  if (m.instituicao && m.instituicao !== rec.institution) return { ok: false, erro: 'Missão de outra instituição.' };
  const delta = m.cadeia === 'delta_1_a_7';
  if (m.cadeia && NIVEL_EXATO.has(m.cadeia) && rec.level < m.nivel) return { ok: false, erro: `Volte no nível ${m.nivel}.` };
  if (!delta && rec.level < m.nivel - NIVEL_TOLERANCIA) return { ok: false, erro: `Volte no nível ${m.nivel - NIVEL_TOLERANCIA}.` };
  if (m.nivelMax !== undefined && rec.level > m.nivelMax + NIVEL_TOLERANCIA) return { ok: false, erro: 'Você já passou dessa missão.' };
  return { ok: true };
}

/** Missões disponíveis, de quem dá (id do NPC) ou de todos. */
export function availableMissions(rec: PlayerRecord, giver?: string): Mission[] {
  // dadaPor pode ser apelido ('treinador_da_base', 'guia'): vale o NPC de verdade do jogador
  return getData().missions.missoes.filter((m) => (giver === undefined || (m.dadaPor !== undefined && npcMatches(rec, m.dadaPor, giver))) && missionAvailable(rec, m.id).ok);
}

/** Contadores pedidos por objetivo (um por grupo no derrotar). */
export function objectiveNeeds(o: Objective): number[] {
  switch (o.tipo) {
    case 'derrotar':
      return o.inimigos.map((g) => g.quantidade);
    case 'coletar':
    case 'usar_habilidade':
    case 'usar_controle':
    case 'interagir':
    case 'entregar':
    case 'pagar':
      return [o.quantidade];
    case 'sobreviver':
      return [o.duracaoS];
    default:
      return [1];
  }
}

const isDone = (o: Objective, prog: number[] | undefined) => {
  const need = objectiveNeeds(o);
  return need.every((n, i) => (prog?.[i] ?? 0) >= n);
};

/** Índice do objetivo atual (primeiro obrigatório que falta); -1 se todos os obrigatórios acabaram. */
export function currentObjectiveIndex(rec: PlayerRecord, missionId: string): number {
  const m = missionOf(missionId);
  if (!m) return -1;
  const prog = rec.missions.progresso[missionId] ?? [];
  return m.objetivos.findIndex((o, i) => !o.opcional && !isDone(o, prog[i]));
}

/** Objetivo atual de cada missão ativa. */
export function currentObjectives(rec: PlayerRecord): { missao: Mission; indice: number; objetivo: Objective }[] {
  const out: { missao: Mission; indice: number; objetivo: Objective }[] = [];
  for (const id of rec.missions.ativas) {
    const m = missionOf(id);
    if (!m) continue;
    const i = currentObjectiveIndex(rec, id);
    if (i >= 0) out.push({ missao: m, indice: i, objetivo: m.objetivos[i]! });
  }
  return out;
}

/** Aceita a missão: vira ativa, com o progresso zerado (e os objetivos já cumpridos pulados). */
export function acceptMission(rec: PlayerRecord, id: string): Check & { resultado: GameResult } {
  const r = emptyResult();
  const ok = missionAvailable(rec, id);
  if (!ok.ok) return { ...ok, resultado: r };
  const m = missionOf(id)!;
  rec.missions.ativas.push(id);
  rec.missions.progresso[id] = m.objetivos.map((o) => objectiveNeeds(o).map(() => 0));
  r.aceitas.push(id);
  r.mudou = true;
  r.avisos.push(`Missão: ${m.name}`);
  // Fase 3: o guia comenta a missão
  const gl = guideLine(rec, 'missao');
  if (gl) (r.falasGuia ??= []).push(gl);
  mergeResult(r, settle(rec, {}));
  return { ok: true, resultado: r };
}

// ---------------------------------------------------------------------------
// Eventos

/** Quanto o evento soma em cada contador do objetivo (null = não conta). */
function matchObjective(rec: PlayerRecord, o: Objective, prog: number[], ev: GameEvent): number[] | null {
  const need = objectiveNeeds(o);
  const one = (n = 1) => [Math.min(n, need[0]! - (prog[0] ?? 0))];
  switch (o.tipo) {
    case 'falar':
      // o npc pode ser apelido ('guia', 'treinador_da_base', 'treinador_da_ala')
      return ev.t === 'talk' && npcMatches(rec, o.npc, ev.npcId) ? one() : null;
    case 'sobreviver':
      return ev.t === 'survive' && ev.segundos > 0 ? one(ev.segundos) : null;
    case 'pagar':
      return ev.t === 'pay' && ev.moeda === o.moeda ? one(ev.quantidade) : null;
    case 'ir_ate':
      if (ev.t !== 'arrive') return null;
      if (o.lugar && ev.placeId === o.lugar) return one();
      if (o.regiao && ev.regionId === o.regiao) return one();
      return null;
    case 'visitar_lugar':
      return ev.t === 'arrive' && ev.placeId === o.lugar ? one() : null;
    case 'derrotar': {
      if (ev.t !== 'kill') return null;
      const add = need.map(() => 0);
      const tier = ev.tier ?? 'normal';
      // primeiro o grupo do mesmo tier; sem tier igual, o primeiro grupo do mesmo inimigo que falta
      let k = o.inimigos.findIndex((g, i) => g.inimigo === ev.enemyId && (g.tier ?? 'normal') === tier && (prog[i] ?? 0) < g.quantidade);
      if (k < 0) k = o.inimigos.findIndex((g, i) => g.inimigo === ev.enemyId && (prog[i] ?? 0) < g.quantidade);
      if (k < 0) return null;
      add[k] = 1;
      return add;
    }
    case 'coletar': {
      // seguidores (Agência Neon): lutar e passar nos lugares dá seguidor
      if (o.chave === 'seguidores' && ev.t === 'kill') return one(SEGUIDORES_POR_INIMIGO);
      if (o.chave === 'seguidores' && ev.t === 'arrive' && ev.placeId) return one(SEGUIDORES_POR_LUGAR);
      if (ev.t !== 'pickup') return null;
      const q = ev.quantidade ?? 1;
      if (o.chave === 'saque') return one(q);
      if (o.recurso && ev.recurso === o.recurso) return one(q);
      if (o.chave && (ev.chave === o.chave || ev.itemId === o.chave)) return one(q);
      return null;
    }
    case 'usar_habilidade': {
      if (ev.t !== 'ability') return null;
      if (o.botao && o.botao !== 'qualquer' && o.botao !== ev.botao) return null;
      if (o.habilidade && o.habilidade !== ev.habilidade) return null;
      return one();
    }
    case 'usar_controle':
      return ev.t === 'control' && ev.controle === o.controle ? one() : null;
    case 'interagir':
      return ev.t === 'interact' && ev.alvo === o.alvo && ev.acao === o.acao ? one() : null;
    case 'escolher':
      return ev.t === 'choose' && o.opcoes.some((x) => x.id === ev.opcao) ? one() : null;
    default:
      return null;
  }
}

/** Contexto de grupo da missão: aliados de IA da missão contam; no Delta, o Seu Jacó conta. */
function missionGroup(m: Mission, g?: GroupCtx): GroupCtx {
  const ia = m.aliadosIA?.length ?? 0;
  return {
    personagens: Math.max(g?.personagens ?? 1, 1 + ia),
    aoVivo: Math.max(1, g?.aoVivo ?? 1),
    ...(g?.plantonista ? { plantonista: true } : {}),
    ...(g?.xpPct ? { xpPct: g.xpPct } : {}),
  };
}

/** Aplica recompensas no registro. `grupo` só entra o XP do bônus de grupo. */
export function applyRewards(rec: PlayerRecord, rewards: readonly Reward[], g?: GroupCtx): GameResult {
  const r = emptyResult();
  for (const w of rewards) {
    switch (w.kind) {
      case 'xp': {
        const xp = groupXp(w.quantidade, g ?? { personagens: 1, aoVivo: 1 }, { delta: isDeltaRookie(rec) });
        if (xp > 0) mergeResult(r, gainXp(rec, xp));
        break;
      }
      case 'recurso': {
        if (w.recurso === 'semente') rec.semente += w.quantidade;
        else if (w.recurso === 'credito') rec.credito += w.quantidade;
        else rec.resources[w.recurso] = (rec.resources[w.recurso] ?? 0) + w.quantidade;
        r.recursos[w.recurso] = (r.recursos[w.recurso] ?? 0) + w.quantidade;
        r.mudou = true;
        break;
      }
      case 'item': {
        const q = w.quantidade ?? 1;
        if (w.item) {
          for (let i = 0; i < q; i++) {
            rec.inventory.push(w.item);
            r.itens.push(w.item);
          }
        } else if (w.tabela) r.itensParaRolar.push({ tabela: w.tabela, quantidade: q });
        r.mudou = true;
        break;
      }
      case 'reputacao': {
        const k = `reputacao:${w.instituicao ?? rec.institution ?? 'delta'}`;
        rec.counters[k] = (rec.counters[k] ?? 0) + w.quantidade;
        r.mudou = true;
        // Fase 3: a patente sobe com a reputação
        mergeResult(r, updateRanks(rec));
        break;
      }
      case 'desbloqueio': {
        if (!rec.unlocks.includes(w.chave)) rec.unlocks.push(w.chave);
        r.avisos.push(w.descricao);
        r.mudou = true;
        // Fase 3: o bordão do treinador da ala vira emote
        if (w.chave === 'bordao_emote') {
          const tr = alaTrainerOf(rec);
          const em = tr ? unlockTrainerEmote(rec, tr) : null;
          if (em) (r.emotes ??= []).push(em);
        }
        break;
      }
      default:
        // medidor, planta e o resto do mundo entram nas fases 4 e 5
        break;
    }
  }
  return r;
}

function setFlags(rec: PlayerRecord, ids: readonly string[], r: GameResult): void {
  for (const f of ids) if (setFlag(rec, f)) r.flags.push(f);
}

/** Conclui a missão: recompensas solo (sempre) e de grupo (quando a luta foi em grupo), flags. */
export function completeMission(rec: PlayerRecord, id: string, g?: GroupCtx): GameResult {
  const r = emptyResult();
  const m = missionOf(id);
  if (!m || !rec.missions.ativas.includes(id)) return r;
  rec.missions.ativas = rec.missions.ativas.filter((x) => x !== id);
  if (!rec.missions.concluidas.includes(id)) rec.missions.concluidas.push(id);
  delete rec.missions.progresso[id];
  r.concluidas.push(id);
  r.mudou = true;
  r.avisos.push(`Missão concluída: ${m.name}`);
  const grupo = missionGroup(m, g);
  mergeResult(r, applyRewards(rec, m.recompensas.solo));
  const ehGrupo = grupo.personagens >= getData().balance.combate.grupoMin || isDeltaRookie(rec);
  if (ehGrupo) mergeResult(r, applyRewards(rec, m.recompensas.grupo, grupo));
  setFlags(rec, m.ligaFlags, r);
  if (markStep(rec, 'missao')) r.tutorial.push('missao');
  return r;
}

/**
 * Depois de qualquer mudança: completa objetivos já cumpridos, conclui missões prontas, liga a
 * travessia (Bruno Ferro leva ao 8) e aceita sozinho a próxima missão das cadeias automáticas.
 */
function settle(rec: PlayerRecord, opts: { grupo?: GroupCtx }): GameResult {
  const r = emptyResult();
  for (let guard = 0; guard < 20; guard++) {
    let changed = false;
    for (const id of [...rec.missions.ativas]) {
      const m = missionOf(id);
      if (!m) continue;
      const prog = (rec.missions.progresso[id] ??= m.objetivos.map((o) => objectiveNeeds(o).map(() => 0)));
      // pula o que já foi feito
      for (;;) {
        const i = currentObjectiveIndex(rec, id);
        if (i < 0) break;
        const o = m.objetivos[i]!;
        // só pula o que ficou pronto antes de virar o atual (sem progresso ainda)
        const zerado = (prog[i] ?? []).every((v) => v === 0);
        const ja =
          zerado &&
          ((o.tipo === 'usar_controle' && rec.tutorial.controles.includes(o.controle)) ||
            ((o.tipo === 'ir_ate' || o.tipo === 'visitar_lugar') && o.lugar !== undefined && rec.lugar_atual === o.lugar) ||
            // Fase 3: o que a travessia e a escolha da ala já decidiram
            (o.tipo === 'escolher_guia' && rec.guide_id !== null && o.margem === rec.side) ||
            (o.tipo === 'escolher_ala' && rec.archetype !== null) ||
            (o.tipo === 'interagir' && o.acao === 'escolher_instituicao' && rec.institution !== null));
        if (!ja) break;
        prog[i] = objectiveNeeds(o);
        r.avancos.push({ missao: id, objetivo: i });
        changed = true;
      }
      if (currentObjectiveIndex(rec, id) < 0) {
        mergeResult(r, completeMission(rec, id, opts.grupo));
        changed = true;
      }
    }
    if (hasFlag(rec, FLAG_BRUNO) && rec.level < TRAVESSIA_LEVEL && rec.stage === 'delta') {
      mergeResult(r, raiseToLevel(rec, TRAVESSIA_LEVEL));
      changed = true;
    }
    for (const chain of AUTO_CHAINS) {
      const c = getData().missions.cadeias.find((x) => x.id === chain);
      for (const mid of c?.missoes ?? []) {
        if (rec.missions.ativas.includes(mid) || rec.missions.concluidas.includes(mid)) continue;
        if (!rec.criado || !missionAvailable(rec, mid).ok) continue;
        const m = missionOf(mid)!;
        rec.missions.ativas.push(mid);
        rec.missions.progresso[mid] = m.objetivos.map((o) => objectiveNeeds(o).map(() => 0));
        r.aceitas.push(mid);
        r.avisos.push(`Missão: ${m.name}`);
        r.mudou = true;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return r;
}

/** Reavalia as missões sem evento (depois da criação, da travessia ou de carregar o registro). */
export const refreshMissions = (rec: PlayerRecord, grupo?: GroupCtx): GameResult => settle(rec, grupo ? { grupo } : {});

/** Peles zoeiras e outras opções liberadas jogando (appearance.peles[].desbloqueio). */
export function checkVisualUnlocks(rec: PlayerRecord): GameResult {
  const r = emptyResult();
  for (const p of getData().appearance.peles) {
    const d = p.desbloqueio;
    if (!d || rec.unlocks.includes(p.id)) continue;
    let ok = false;
    if (d.tipo === 'contador') ok = (rec.counters[d.chave] ?? 0) >= d.meta;
    else if (d.tipo === 'licao') ok = (rec.counters[`visitas:${d.chave}`] ?? 0) >= d.meta;
    else if (d.tipo === 'masmorra') ok = (rec.counters[`masmorra:${d.chave}`] ?? 0) >= d.meta;
    else if (d.tipo === 'nivel') ok = rec.level >= d.meta;
    else if (d.tipo === 'story_flag') ok = hasFlag(rec, d.chave);
    if (!ok) continue;
    rec.unlocks.push(p.id);
    r.visuais.push(p.id);
    r.avisos.push(`Pele liberada: ${p.name}`);
    r.mudou = true;
  }
  return r;
}

/** Contadores dos desbloqueios. */
function count(rec: PlayerRecord, ev: GameEvent): boolean {
  if (ev.t === 'kill' && !ev.masmorra) {
    rec.counters['inimigos_derrotados_mapa'] = (rec.counters['inimigos_derrotados_mapa'] ?? 0) + 1;
    return true;
  }
  if (ev.t === 'arrive') {
    const prev = rec.lugar_atual;
    if (ev.placeId !== undefined) rec.lugar_atual = ev.placeId;
    if (ev.placeId && ev.placeId !== prev) {
      const k = `visitas:${ev.placeId}`;
      rec.counters[k] = (rec.counters[k] ?? 0) + 1;
    }
    return ev.placeId !== prev;
  }
  return false;
}

/**
 * Evento de jogo: kill, talk, arrive, pickup, level, ability, control, interact, choose e
 * tutorial. Avança os objetivos, conclui missões (com recompensas e flags), marca o tutorial e
 * os desbloqueios. Devolve tudo o que mudou. O XP de matar inimigo NÃO entra aqui: a simulação
 * já decide (só em grupo) e o servidor passa para gainXp.
 */
export function onGameEvent(rec: PlayerRecord, ev: GameEvent, opts: { grupo?: GroupCtx } = {}): GameResult {
  const r = emptyResult();
  const grupo = opts.grupo ?? (ev.t === 'kill' ? ev.grupo : undefined);
  if (count(rec, ev)) r.mudou = true;
  mergeResult(r, onTutorialEvent(rec, ev));
  if (ev.t === 'level') mergeResult(r, syncLevel(rec, ev.level));
  for (const id of [...rec.missions.ativas]) {
    const m = missionOf(id);
    if (!m) continue;
    const prog = (rec.missions.progresso[id] ??= m.objetivos.map((o) => objectiveNeeds(o).map(() => 0)));
    const cur = currentObjectiveIndex(rec, id);
    for (let i = 0; i < m.objetivos.length; i++) {
      const o = m.objetivos[i]!;
      if (isDone(o, prog[i])) continue;
      if (i !== cur && !o.opcional) continue;
      // a escolha da margem é da travessia (applyTravessia)
      if (o.tipo === 'escolher' && m.cadeia === 'travessia') continue;
      const add = matchObjective(rec, o, prog[i] ?? [], ev);
      if (!add || add.every((x) => x <= 0)) continue;
      prog[i] = (prog[i] ?? []).map((v, k) => v + (add[k] ?? 0));
      r.avancos.push({ missao: id, objetivo: i });
      r.mudou = true;
      if (o.tipo === 'escolher' && ev.t === 'choose') {
        const op = o.opcoes.find((x) => x.id === ev.opcao)!;
        setFlags(rec, op.ligaFlags, r);
        if (op.recompensas) mergeResult(r, applyRewards(rec, op.recompensas));
      }
      // um evento conta para um objetivo só por missão
      break;
    }
  }
  mergeResult(r, settle(rec, grupo ? { grupo } : {}));
  mergeResult(r, checkVisualUnlocks(rec));
  return r;
}

// ---------------------------------------------------------------------------
// Auto-caminho e rastreador

export interface ObjectiveTarget {
  missao: string;
  nomeMissao: string;
  objetivo: number;
  descricao: string;
  /** contadores feitos e pedidos (somados) */
  feito: number;
  meta: number;
  /** id do mapa onde o alvo está */
  mapa: string;
  /** posição em tiles, quando o alvo está neste mapa */
  x?: number;
  y?: number;
  lugar?: string;
  npc?: string;
  regiao?: string;
}

/**
 * Alvo do auto-caminho e da seta: o objetivo atual da primeira missão ativa (ou da missão pedida),
 * resolvido pelos marcadores do mapa ('npc', 'lugar', 'maquina_visual', 'inimigo', 'chefe',
 * 'bando' com params.inimigos, 'saida'), pelas regiões do mapa e, por fim, pelo lugar da missão.
 * Sem missão ativa, null.
 */
export function nextObjectiveTarget(rec: PlayerRecord, map: TileMap, from?: { x: number; y: number }, missionId?: string): ObjectiveTarget | null {
  const list = currentObjectives(rec).filter((c) => missionId === undefined || c.missao.id === missionId);
  const c = list[0];
  if (!c) return null;
  const { missao: m, indice, objetivo: o } = c;
  const prog = rec.missions.progresso[m.id]?.[indice] ?? [];
  const need = objectiveNeeds(o);
  const t: ObjectiveTarget = {
    missao: m.id,
    nomeMissao: m.name,
    objetivo: indice,
    descricao: o.descricao,
    feito: prog.reduce((a, b) => a + b, 0),
    meta: need.reduce((a, b) => a + b, 0),
    mapa: map.id,
  };
  const near = (pred: (mk: TileMap['markers'][number]) => boolean) => {
    let best: { x: number; y: number } | undefined;
    let bd = Infinity;
    for (const mk of map.markers) {
      if (!pred(mk)) continue;
      const d = from ? Math.hypot(mk.x - from.x, mk.y - from.y) : 0;
      if (d < bd) {
        bd = d;
        best = { x: mk.x, y: mk.y };
      }
    }
    return best;
  };
  const put = (p: { x: number; y: number } | undefined) => {
    if (p && t.x === undefined) {
      t.x = p.x;
      t.y = p.y;
    }
  };
  const byPlace = (lugar: string) => near((mk) => (mk.kind === 'lugar' || mk.kind === 'maquina_visual' || mk.kind === 'saida') && (mk.ref ?? mk.id) === lugar);
  switch (o.tipo) {
    case 'falar':
    case 'entregar':
    case 'escoltar': {
      const npcId = resolveNpc(rec, o.npc) ?? o.npc;
      t.npc = npcId;
      put(near((mk) => mk.kind === 'npc' && mk.ref === npcId));
      break;
    }
    case 'ir_ate':
    case 'visitar_lugar':
      if (o.lugar) {
        t.lugar = o.lugar;
        put(byPlace(o.lugar));
      }
      if (o.tipo === 'ir_ate' && o.regiao) {
        t.regiao = o.regiao;
        put(near((mk) => mk.kind === 'saida' && mk.ref === o.regiao));
        const rr = map.regions.find((x) => x.regionId === o.regiao);
        if (rr) put({ x: rr.x + rr.w / 2, y: rr.y + rr.h / 2 });
      }
      if (o.tipo === 'ir_ate' && o.ponto) put(o.ponto);
      break;
    case 'derrotar': {
      const ids = new Set(o.inimigos.filter((g, i) => (prog[i] ?? 0) < g.quantidade).map((g) => g.inimigo));
      put(
        near(
          (mk) =>
            ((mk.kind === 'inimigo' || mk.kind === 'chefe') && mk.ref !== undefined && ids.has(mk.ref)) ||
            (mk.kind === 'bando' && Array.isArray(mk.params?.['inimigos']) && (mk.params['inimigos'] as unknown[]).some((x) => typeof x === 'string' && ids.has(x))),
        ),
      );
      break;
    }
    case 'interagir':
      put(near((mk) => (mk.ref ?? mk.id) === o.alvo));
      if (o.lugar) {
        t.lugar = o.lugar;
        put(byPlace(o.lugar));
      }
      break;
    default:
      break;
  }
  // objetivo sem ponto próprio (controle, coletar, escolher): o lugar da missão, se não for onde já está
  if (t.x === undefined && m.lugar && o.tipo !== 'usar_controle' && o.tipo !== 'usar_habilidade' && o.tipo !== 'coletar') {
    t.lugar ??= m.lugar;
    put(byPlace(m.lugar));
  }
  return t;
}

/** Estado das missões para a mensagem 'missao_estado'. */
export function missionStatus(rec: PlayerRecord, map: TileMap, from?: { x: number; y: number }) {
  const ativas = currentObjectives(rec).map(({ missao, indice, objetivo }) => {
    const prog = rec.missions.progresso[missao.id]?.[indice] ?? [];
    return {
      id: missao.id,
      name: missao.name,
      resumo: missao.resumo,
      objetivo: objetivo.descricao,
      indice,
      total: missao.objetivos.length,
      feito: prog.reduce((a, b) => a + b, 0),
      meta: objectiveNeeds(objetivo).reduce((a, b) => a + b, 0),
    };
  });
  const alvo = nextObjectiveTarget(rec, map, from);
  return { ativas, objetivo: alvo?.descricao ?? null, alvo };
}
