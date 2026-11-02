/**
 * v0.4: troca de lado (Sistemas.md, "Morte, loot e troca de lado"): "liberada depois do Acordo, uma
 * vez por temporada. Quem troca mantém o nível, perde a patente e a moradia, e os itens da outra
 * margem funcionam com metade do bônus até serem benzidos ou calibrados de novo."
 *
 * Decisões (DECISIONS.md, v0.4):
 * - Libera no 19, com a flag da cabeceira (troca_de_lado_liberada), como diz a Jornada.md v0.3.
 * - A classe fica; a instituição vira a da mesma classe na outra margem e a ala vira o par dela (a
 *   mesma posição na lista de alas, que é o par do briefing: Peão Brabo e Sumô Cibernético...).
 * - O guia é escolhido na hora, entre os da outra margem (espírito ou IA de bolso), na conversa com o
 *   Seu Jacó; sem escolha (chamada direta), vai o primeiro da lista.
 * - Os talentos que não valem do outro lado (instituição, margem, ala) voltam a ficar pendentes.
 * - As missões ativas da margem antiga são largadas.
 * - "Uma vez por temporada": a temporada é o mês (as arenas são mensais); quem chama passa o número
 *   (temporadaDe), para a regra não ler relógio.
 * - Os itens: a metade do bônus já é a regra de item da outra margem (items.ts, outraMargem).
 */
import { getData } from '../data';
import { clearFlag, hasFlag, setFlag } from './flags';
import { refreshMissions } from './missions';
import { activeTalents } from './talents';
import { emptyResult, mergeResult, type GameResult, type PlayerRecord, type SideId } from './types';

/** Flag da missão da cabeceira (nível 19) que libera a troca. */
export const FLAG_TROCA_LIBERADA = 'troca_de_lado_liberada';
/** Flag de quem já trocou de lado alguma vez. */
export const FLAG_TROCOU = 'trocou_de_lado';
/** Contador com a temporada da última troca. */
const TEMPORADA_KEY = 'troca_de_lado_temporada';

/** Número da temporada (o mês, em UTC) de um instante em ms. */
export const temporadaDe = (ms: number): number => {
  const d = new Date(ms);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};

const outro = (s: SideId): SideId => (s === 'esquerda' ? 'direita' : 'esquerda');

/** Para onde a troca leva: a margem, a instituição da mesma classe e a ala par da atual. */
export function destinoDaTroca(rec: PlayerRecord): { side: SideId; institution: string; archetype: string | null } | null {
  const D = getData();
  if (!rec.side || !rec.institution) return null;
  const atual = D.institutionsById.get(rec.institution);
  if (!atual) return null;
  const side = outro(rec.side);
  const nova = D.institutions.instituicoes.find((i) => i.margem === side && i.classe === atual.classe);
  if (!nova) return null;
  const k = rec.archetype ? atual.alas.indexOf(rec.archetype) : -1;
  return { side, institution: nova.id, archetype: k >= 0 ? (nova.alas[k] ?? null) : null };
}

export function podeTrocarDeLado(rec: PlayerRecord, temporada: number): { ok: true } | { ok: false; erro: string } {
  if (rec.stage !== 'margem' || !rec.side) return { ok: false, erro: 'Só quem já é de uma margem pode trocar de lado.' };
  if (!hasFlag(rec, FLAG_TROCA_LIBERADA)) return { ok: false, erro: 'A troca de lado libera na cabeceira da Ponte, no nível 19.' };
  if (rec.counters[TEMPORADA_KEY] === temporada) return { ok: false, erro: 'Você já trocou de lado nesta temporada. Volte no mês que vem.' };
  if (!destinoDaTroca(rec)) return { ok: false, erro: 'Não há para onde trocar.' };
  return { ok: true };
}

/** Contador de quem pediu a troca e está escolhendo o guia (a conversa com o Seu Jacó lista os guias). */
export const TROCA_ESCOLHENDO_KEY = 'troca_de_lado_escolhendo';

/** Os guias do outro lado, para a escolha na troca. */
export function guiasDaTroca(rec: PlayerRecord): { id: string; name: string; tipo: string; bonusTexto: string }[] {
  const d = destinoDaTroca(rec);
  if (!d) return [];
  return getData().guides.guias.filter((g) => g.margem === d.side).map((g) => ({ id: g.id, name: g.name, tipo: g.tipo, bonusTexto: g.bonusTexto }));
}

/** Troca de lado: margem, instituição, ala, guia, patentes, moradia, talentos e missões. */
export function trocarDeLado(
  rec: PlayerRecord,
  temporada: number,
  guiaId?: string,
): ({ ok: true } | { ok: false; erro: string }) & { resultado: GameResult } {
  const r = emptyResult();
  const pode = podeTrocarDeLado(rec, temporada);
  if (!pode.ok) return { ...pode, resultado: r };
  const D = getData();
  const destino = destinoDaTroca(rec)!;
  const antigo = { side: rec.side!, institution: rec.institution! };
  const inst = D.institutionsById.get(destino.institution)!;
  const soc = D.societies.sociedades.find((s) => s.side === destino.side)!;
  const guia = guiaId === undefined ? D.guides.guias.find((g) => g.margem === destino.side) : D.guidesById.get(guiaId);
  if (guiaId !== undefined && guia?.margem !== destino.side)
    return { ok: false, erro: destino.side === 'esquerda' ? 'Escolha um espírito guia da Esquerda.' : 'Escolha uma IA de bolso da Direita.', resultado: r };
  delete rec.counters[TROCA_ESCOLHENDO_KEY];

  rec.side = destino.side;
  rec.institution = inst.id;
  // a classe é a mesma; as marcas mudam com a ala e o botão 3 (da classe) fica
  if (destino.archetype) {
    const a = D.archetypesById.get(destino.archetype)!;
    rec.archetype = a.id;
    const slot3 = rec.loadout.slot3_ability ?? rec.loadout.botoes[2] ?? '';
    rec.loadout = { slot3_ability: slot3, botoes: [a.habilidadesMarca.marca_1, a.habilidadesMarca.marca_2, slot3] };
    if (a.paletasTraje[0]) rec.appearance.palette = a.paletasTraje[0].id;
  } else rec.archetype = null;
  if (guia) rec.guide_id = guia.id;
  // perde a patente e a moradia
  rec.rank = soc.patentes[0]?.id ?? null;
  rec.institution_rank = inst.patentes[0] ?? null;
  rec.home = null;
  rec.home_id = null;
  if (rec.economia) rec.economia.moradiaDada = false;
  rec.shown_visual_tier = null;
  // talentos que não valem do outro lado voltam a ficar pendentes
  rec.talent_picks = activeTalents(rec);
  // missões da margem antiga ficam para trás
  for (const id of [...rec.missions.ativas]) {
    if (D.missionsById.get(id)?.margem !== antigo.side) continue;
    rec.missions.ativas = rec.missions.ativas.filter((m) => m !== id);
    delete rec.missions.progresso[id];
  }
  // flags da margem e da instituição
  for (const f of [`margem_${antigo.side}`, `entrou_${antigo.institution}`]) clearFlag(rec, f);
  for (const f of [`margem_${destino.side}`, `entrou_${inst.id}`, FLAG_TROCOU]) if (setFlag(rec, f)) r.flags.push(f);
  rec.counters[TEMPORADA_KEY] = temporada;

  r.mudou = true;
  r.avisos.push(`Você trocou de lado: agora é da ${inst.name}, na Margem ${destino.side === 'esquerda' ? 'Esquerda' : 'Direita'}.`);
  r.avisos.push('Patente e moradia ficaram para trás. Os itens da outra margem valem metade até o benzimento ou a calibração.');
  mergeResult(r, refreshMissions(rec));
  return { ok: true, resultado: r };
}
