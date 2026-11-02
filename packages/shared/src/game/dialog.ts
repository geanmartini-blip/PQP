/**
 * Diálogo: a fala certa do NPC conforme o estágio, as story_flags e a missão (npcs.json e
 * trainers.json), e as opções (aceitar missão, escolha da missão, Máquina de Visual, embarcar na
 * travessia). As falas giram em ordem (contador por NPC e contexto), sem sorteio.
 * (No Delta, "Embarcar na travessia"; no barco, "Escolher a margem".)
 */
import { getData } from '../data';
import { hasFlag } from './flags';
import { availableMissions, acceptMission, currentObjectives, missionAvailable, onGameEvent } from './missions';
import { archetypeOptions, canChooseArchetype, chooseArchetype } from './ala';
import { guideLine, guideOf } from './guides';
import { alaTrainerOf, baseTrainerOf, isOwnGuide, npcMatches } from './people';
import { teachesEmote, unlockTrainerEmote } from './trainers';
import { FLAG_BRUNO } from './progression';
import { FLAG_EMBARCOU } from './barco';
import { canCross, travessiaOptions, type TravessiaOptions } from './travessia';
import { canUseMachine } from './visual';
import { destinoDaTroca, guiasDaTroca, podeTrocarDeLado, TROCA_ESCOLHENDO_KEY, trocarDeLado } from './trocaDeLado';
import { emptyResult, mergeResult, type GameResult, type PlayerRecord } from './types';

export type DialogOptionKind = 'aceitar_missao' | 'escolha' | 'maquina_visual' | 'travessia' | 'tchau' | 'escolher_ala' | 'trocar_lado';

/** O que a conversa precisa saber de fora da regra (a temporada da troca de lado, pelo relógio de quem chama). */
export interface DialogCtx {
  temporada?: number;
}

export interface DialogOption {
  /** id que o cliente devolve em dialogo_opcao: 'aceitar:<missão>', 'escolha:<opção>', 'maquina:<id>', 'travessia', 'ala:<arquétipo>', 'tchau' */
  id: string;
  tipo: DialogOptionKind;
  texto: string;
}

export interface Dialog {
  npc: string;
  nome: string;
  /** contexto da fala (npcs.json falas[].contexto ou a situação do treinador) */
  contexto: string;
  fala: string;
  opcoes: DialogOption[];
  // ---- Fase 3 ----
  /** bordão do treinador (vira emote) */
  bordao?: string;
  /** emote do bordão; novo = liberado nesta conversa */
  emote?: { id: string; texto: string; novo: boolean };
  /** missão da ala que este treinador dá ou acompanha agora */
  missaoAla?: { id: string; name: string; estado: 'disponivel' | 'ativa' };
  /** conversa com o guia (espírito ou IA de bolso) */
  guia?: boolean;
}

/** Contexto de fala do Seu Jacó por missão ativa (npcs.json, seu_jaco.falas). */
const JACO_POR_MISSAO: Readonly<Record<string, string>> = {
  delta_01_cadastro: 'cadastro_ficha',
  delta_02_remar: 'tutorial_remar',
  delta_03_briga_no_mangue: 'tutorial_lutar',
  delta_04_mosquito_nao_negocia: 'tutorial_item',
  delta_05_chopindita_barata: 'aviso_chopindita_barata',
  delta_06_a_fila_e_o_boleto: 'tutorial_reanimar',
  delta_07_o_barco_do_vizinho: 'antes_do_chefe',
  travessia_08: 'travessia_partida',
};

/** Contextos de outros NPCs do Delta por momento da história. */
function otherContext(rec: PlayerRecord, npcId: string, contexts: string[]): string | undefined {
  const has = (c: string) => contexts.includes(c);
  if (npcId === 'toninho_do_barco') return hasFlag(rec, FLAG_BRUNO) && has('agradecimento') ? 'agradecimento' : 'pedido_de_ajuda';
  if (npcId === 'bruno_ferro') return hasFlag(rec, FLAG_BRUNO) && has('chefe_derrota') ? 'chefe_derrota' : has('chefe_entrada') ? 'chefe_entrada' : undefined;
  if (has('aleatorias')) return 'aleatorias';
  return contexts[0];
}

function jacoContext(rec: PlayerRecord, r: GameResult): string {
  if (r.concluidas.includes('delta_07_o_barco_do_vizinho')) return 'depois_do_chefe';
  if (rec.stage === 'margem') return 'travessia_despedida';
  for (const id of rec.missions.ativas) {
    const c = JACO_POR_MISSAO[id];
    if (c) return c;
  }
  if (hasFlag(rec, FLAG_BRUNO)) return 'depois_do_chefe';
  return 'aleatorias';
}

/** Próxima fala do grupo, em ordem, com {nome} trocado. */
function nextLine(rec: PlayerRecord, npcId: string, ctx: string, lines: readonly string[]): string {
  if (lines.length === 0) return '…';
  const k = `fala:${npcId}:${ctx}`;
  const i = rec.counters[k] ?? 0;
  rec.counters[k] = i + 1;
  return lines[i % lines.length]!.replaceAll('{nome}', rec.name);
}

/** Opções da conversa com este NPC agora. */
export function dialogOptions(rec: PlayerRecord, npcId: string, ctx: DialogCtx = {}): DialogOption[] {
  const D = getData();
  const out: DialogOption[] = [];
  for (const m of availableMissions(rec, npcId)) out.push({ id: `aceitar:${m.id}`, tipo: 'aceitar_missao', texto: `Aceitar: ${m.name}` });
  for (const c of currentObjectives(rec)) {
    if (c.objetivo.tipo !== 'escolher' || c.missao.cadeia === 'travessia') continue;
    for (const op of c.objetivo.opcoes) out.push({ id: `escolha:${op.id}`, tipo: 'escolha', texto: op.texto });
  }
  for (const mq of D.institutions.maquinasVisual) {
    if (mq.atendente === npcId && canUseMachine(rec, mq.id).ok) out.push({ id: `maquina:${mq.id}`, tipo: 'maquina_visual', texto: mq.name });
  }
  // no Delta embarca; já no barco, abre a escolha da margem (o servidor decide pela sala)
  // SUGESTÃO: texto do botão de escolher a margem no barco.
  if (npcId === 'seu_jaco' && canCross(rec).ok) out.push({ id: 'travessia', tipo: 'travessia', texto: hasFlag(rec, FLAG_EMBARCOU) ? 'Escolher a margem' : 'Embarcar na travessia' });
  // v0.4: depois da cabeceira, o Seu Jacó leva para o outro lado (uma vez por temporada)
  if (npcId === 'seu_jaco' && podeTrocarDeLado(rec, ctx.temporada ?? -1).ok) {
    // pediu a troca: a conversa vira a escolha do guia do outro lado
    if (rec.counters[TROCA_ESCOLHENDO_KEY]) {
      for (const g of guiasDaTroca(rec)) out.push({ id: `trocar_lado:${g.id}`, tipo: 'trocar_lado', texto: `${g.name}: ${g.bonusTexto}` });
      // SUGESTÃO: texto do botão de desistir da troca.
      out.push({ id: 'trocar_lado_voltar', tipo: 'trocar_lado', texto: 'Pensando melhor, fico deste lado' });
      return out;
    }
    const d = destinoDaTroca(rec)!;
    // SUGESTÃO: texto do botão de trocar de lado.
    out.push({ id: 'trocar_lado', tipo: 'trocar_lado', texto: `Trocar de lado: ${D.institutionsById.get(d.institution)?.name ?? d.institution}, na Margem ${d.side === 'esquerda' ? 'Esquerda' : 'Direita'}` });
  }
  // Fase 3: quem recebe a base apresenta as 3 alas; cada treinador da instituição oferece a dele
  const tr = D.trainersById.get(npcId);
  if (tr && tr.institution === rec.institution && canChooseArchetype(rec).ok) {
    const base = npcId === baseTrainerOf(rec);
    for (const a of archetypeOptions(rec)) {
      if (!a.liberado || (!base && a.treinador !== npcId)) continue;
      // SUGESTÃO: texto do botão de escolher a ala.
      out.push({ id: `ala:${a.id}`, tipo: 'escolher_ala', texto: `Entrar na ala: ${a.name} (com ${a.treinadorNome})` });
    }
  }
  // SUGESTÃO: texto do botão de sair da conversa.
  out.push({ id: 'tchau', tipo: 'tchau', texto: 'Até mais' });
  return out;
}

/**
 * Fala com o NPC: conta como evento 'talk' (avança objetivos de falar) e devolve a fala e as
 * opções do estado depois do evento. Distância e linha de visão são do servidor (commands.ts).
 */
export function talkTo(rec: PlayerRecord, npcId: string, ctx: DialogCtx = {}): { dialogo: Dialog; resultado: GameResult } {
  const D = getData();
  // Fase 3: o guia é uma conversa à parte ('guia' ou o id do guia)
  if (guideOf(rec) && isOwnGuide(rec, npcId)) return talkToGuide(rec, npcId);
  const r = onGameEvent(rec, { t: 'talk', npcId });
  const tr = D.trainersById.get(npcId);
  const npc = D.npcsById.get(npcId);
  let contexto = 'aleatorias';
  let lines: readonly string[] = [];
  let nome = npcId;
  const extra: Partial<Dialog> = {};
  if (tr) {
    nome = tr.name;
    const daMissao = availableMissions(rec, npcId).length > 0;
    contexto = rec.archetype === tr.archetype ? 'treino' : daMissao ? 'entregaMissao' : tr.recebeBase && rec.institution === tr.institution ? 'treino' : 'saudacao';
    lines = tr.falas[contexto as 'treino' | 'entregaMissao' | 'saudacao'];
    // bordão e emote: quem treina você (a ala ou a base) ensina o bordão
    extra.bordao = tr.bordao;
    if (teachesEmote(rec, npcId)) {
      const novo = unlockTrainerEmote(rec, npcId);
      if (novo) {
        (r.emotes ??= []).push(novo);
        r.avisos.push(`Emote liberado: "${tr.emote.texto}"`);
        r.mudou = true;
      }
      extra.emote = { id: tr.emote.id, texto: tr.emote.texto, novo: novo !== null };
    }
    const ala = alaMissionFor(rec, npcId);
    if (ala) extra.missaoAla = ala;
  } else if (npc) {
    nome = npc.name;
    const contexts = npc.falas.map((f) => f.contexto);
    contexto = (npcId === 'seu_jaco' ? jacoContext(rec, r) : otherContext(rec, npcId, contexts)) ?? 'aleatorias';
    lines = npc.falas.find((f) => f.contexto === contexto)?.linhas ?? npc.falas[0]?.linhas ?? [];
  }
  return { dialogo: { npc: npcId, nome, contexto, fala: nextLine(rec, npcId, contexto, lines), opcoes: dialogOptions(rec, npcId, ctx), ...extra }, resultado: r };
}

/** Missão da ala (A Ala) que este treinador dá ou acompanha agora. */
function alaMissionFor(rec: PlayerRecord, npcId: string): Dialog['missaoAla'] | undefined {
  const D = getData();
  for (const m of D.missions.missoes) {
    if (m.cadeia !== 'escolha_da_ala' || m.margem !== rec.side) continue;
    const ativa = rec.missions.ativas.includes(m.id);
    const giver = m.dadaPor !== undefined && npcMatches(rec, m.dadaPor, npcId);
    const daAla = ativa && npcId === alaTrainerOf(rec);
    if (ativa && (giver || daAla)) return { id: m.id, name: m.name, estado: 'ativa' };
    if (!ativa && giver && missionAvailable(rec, m.id).ok) return { id: m.id, name: m.name, estado: 'disponivel' };
  }
  return undefined;
}

/**
 * Conversa com o guia: conta como 'talk' com o apelido 'guia' (objetivos "converse com o seu
 * espírito") e a fala vem de guides.json (missão quando há missão ativa, senão aleatória).
 */
function talkToGuide(rec: PlayerRecord, npcId: string): { dialogo: Dialog; resultado: GameResult } {
  const r = onGameEvent(rec, { t: 'talk', npcId: 'guia' });
  const g = guideOf(rec)!;
  const line = guideLine(rec, rec.missions.ativas.length > 0 ? 'missao' : 'aleatoria');
  return {
    dialogo: { npc: npcId, nome: g.name, contexto: line?.situacao ?? 'aleatoria', fala: line?.texto ?? '…', opcoes: dialogOptions(rec, 'guia'), guia: true },
    resultado: r,
  };
}

/** O que o cliente precisa abrir depois de uma opção. */
export type DialogOpen = { tela: 'maquina_visual'; maquina: string } | { tela: 'travessia'; opcoes: TravessiaOptions };

/** Opção escolhida no diálogo. */
export function dialogOption(
  rec: PlayerRecord,
  npcId: string,
  opcaoId: string,
  ctx: DialogCtx = {},
): { ok: boolean; erro?: string; resultado: GameResult; abrir?: DialogOpen; fala?: string } {
  const r = emptyResult();
  const opts = dialogOptions(rec, npcId, ctx);
  if (!opts.some((o) => o.id === opcaoId)) return { ok: false, erro: 'Opção indisponível.', resultado: r };
  if (opcaoId === 'tchau') return { ok: true, resultado: r };
  // v0.4: a troca de lado pede o guia antes (a conversa segue com a lista)
  if (opcaoId === 'trocar_lado') {
    rec.counters[TROCA_ESCOLHENDO_KEY] = 1;
    r.mudou = true;
    // SUGESTÃO: fala do Seu Jacó na escolha do guia.
    const fala = rec.side === 'esquerda' ? 'Do lado de lá, espírito não entra. Escolhe uma dessas maquininhas falantes.' : 'Do lado de cá, aplicativo não pega. Escolhe um espírito, que eles vêm de graça.';
    return { ok: true, resultado: r, fala };
  }
  if (opcaoId === 'trocar_lado_voltar') {
    delete rec.counters[TROCA_ESCOLHENDO_KEY];
    r.mudou = true;
    // SUGESTÃO: fala do Seu Jacó quando a pessoa desiste da troca.
    return { ok: true, resultado: r, fala: 'Tá certo. O rio continua aqui no mês que vem.' };
  }
  if (opcaoId.startsWith('trocar_lado:')) {
    const t = trocarDeLado(rec, ctx.temporada ?? -1, opcaoId.slice('trocar_lado:'.length));
    return t.ok ? { ok: true, resultado: t.resultado } : { ok: false, erro: t.erro, resultado: t.resultado };
  }
  if (opcaoId === 'travessia') return { ok: true, resultado: r, abrir: { tela: 'travessia', opcoes: travessiaOptions(rec) } };
  const [kind, arg] = [opcaoId.slice(0, opcaoId.indexOf(':')), opcaoId.slice(opcaoId.indexOf(':') + 1)];
  if (kind === 'aceitar') {
    const a = acceptMission(rec, arg);
    return a.ok ? { ok: true, resultado: a.resultado } : { ok: false, erro: a.erro, resultado: a.resultado };
  }
  if (kind === 'escolha') return { ok: true, resultado: mergeResult(r, onGameEvent(rec, { t: 'choose', opcao: arg })) };
  if (kind === 'maquina') return { ok: true, resultado: r, abrir: { tela: 'maquina_visual', maquina: arg } };
  if (kind === 'ala') {
    const a = chooseArchetype(rec, arg);
    return a.ok ? { ok: true, resultado: a.resultado } : { ok: false, erro: a.erro, resultado: a.resultado };
  }
  return { ok: false, erro: 'Opção indisponível.', resultado: r };
}
