/**
 * Fase 3: a ala (arquétipo) no nível 12, o loadout e o botão 3.
 *
 * - Escolha no 12, entre as 3 alas da instituição (que é a classe). A ala libera o treinador dela,
 *   os botões 1 e 2 (marcas do arquétipo), o botão 3 (uma das 4 habilidades da classe, escolhível)
 *   e o Especial da classe. O traje vira o de aprendiz (12) e o de veterano (20) pelo lookOf.
 * - Nos níveis 8 a 11 os 3 botões são habilidades da classe (classes.json loadoutPreAla).
 *
 * Decisões:
 * - Só escolhe a ala quem já entrou na instituição (story_flag entrou_instituicao): a missão de
 *   entrada vem antes, como em missions.json (escolha_da_ala pede a flag).
 * - O botão 3 começa com classes.json slot3PorPapel do papel da ala (ou slot3Padrao).
 * - A ala não se troca no piloto (troca de lado e de ala estão fora do piloto).
 */
import { getData } from '../data';
import { hasFlag, setFlag } from './flags';
import { refreshMissions } from './missions';
import { emptyResult, mergeResult, type Check, type GameResult, type PlayerRecord } from './types';

/** v0.3: a ala é no 10, junto com o primeiro talento e a primeira peça do conjunto. */
export const ALA_LEVEL = 10;
export const FLAG_ENTROU = 'entrou_instituicao';
export const FLAG_ALA = 'ala_escolhida';

/** Id base de um id de habilidade que pode vir com o sufixo dos talentos (sim/passiveDefs.ts). */
const baseId = (id: string) => id.split('@')[0]!;

export interface AlaOption {
  id: string;
  name: string;
  papel: string;
  treinador: string;
  treinadorNome: string;
  bordao: string;
  marcas: { id: string; name: string; type: string }[];
  liberado: boolean;
  motivo?: string;
}

/** Pode escolher a ala agora (e, com id, essa ala). */
export function canChooseArchetype(rec: PlayerRecord, archetypeId?: string): Check {
  if (rec.stage !== 'margem' || !rec.institution || !rec.class) return { ok: false, erro: 'Primeiro atravesse e entre numa instituição.' };
  if (rec.archetype) return { ok: false, erro: 'Você já tem ala. Troca de ala fica para depois do piloto.' };
  if (!hasFlag(rec, FLAG_ENTROU)) return { ok: false, erro: 'Termine a missão de entrada da instituição antes.' };
  if (rec.level < ALA_LEVEL) return { ok: false, erro: `A ala é no nível ${ALA_LEVEL}.` };
  if (archetypeId === undefined) return { ok: true };
  const D = getData();
  const a = D.archetypesById.get(archetypeId);
  if (!a) return { ok: false, erro: 'Ala desconhecida.' };
  if (a.classe !== rec.class) return { ok: false, erro: `${a.name} não é da sua classe.` };
  if (a.instituicao !== rec.institution || a.margem !== rec.side) return { ok: false, erro: `${a.name} é de outra instituição.` };
  return { ok: true };
}

/** As 3 alas da instituição do jogador, com o treinador e as marcas. */
export function archetypeOptions(rec: PlayerRecord): AlaOption[] {
  const D = getData();
  const inst = rec.institution ? D.institutionsById.get(rec.institution) : undefined;
  if (!inst) return [];
  return inst.alas.map((id) => {
    const a = D.archetypesById.get(id)!;
    const tr = D.trainersById.get(a.treinador);
    const chk = canChooseArchetype(rec, id);
    const marcas = [a.habilidadesMarca.marca_1, a.habilidadesMarca.marca_2].map((h) => {
      const ab = D.abilities.get(h);
      return { id: h, name: ab?.name ?? h, type: ab?.type ?? '' };
    });
    const out: AlaOption = { id, name: a.name, papel: a.papel, treinador: a.treinador, treinadorNome: tr?.name ?? a.treinador, bordao: tr?.bordao ?? '', marcas, liberado: chk.ok };
    if (!chk.ok) out.motivo = chk.erro;
    return out;
  });
}

/** Botão 3 inicial da ala: slot3PorPapel do papel, ou slot3Padrao. */
function defaultSlot3(classId: string, papel: string): string {
  const c = getData().classesById.get(classId)!;
  return (c.slot3PorPapel as Record<string, string | undefined> | undefined)?.[papel] ?? c.slot3Padrao;
}

/**
 * Escolhe a ala: valida a classe e a instituição, grava o arquétipo e o loadout (marca 1, marca 2
 * e o botão 3), põe a primeira paleta do traje da ala e reavalia as missões (o objetivo
 * escolher_ala da missão A Ala se completa sozinho).
 */
export function chooseArchetype(rec: PlayerRecord, archetypeId: string): Check & { resultado: GameResult } {
  const r = emptyResult();
  const chk = canChooseArchetype(rec, archetypeId);
  if (!chk.ok) return { ...chk, resultado: r };
  const D = getData();
  const a = D.archetypesById.get(archetypeId)!;
  const cls = D.classesById.get(a.classe)!;
  const cur = rec.loadout.slot3_ability ? baseId(rec.loadout.slot3_ability) : null;
  // quem já tinha escolhido um botão 3 da classe (registro migrado) fica com ele
  const slot3 = cur && cls.abilities.includes(cur) && cur !== cls.slot3Padrao ? cur : defaultSlot3(cls.id, a.papel);
  rec.archetype = a.id;
  rec.loadout = { slot3_ability: slot3, botoes: [a.habilidadesMarca.marca_1, a.habilidadesMarca.marca_2, slot3] };
  if (a.paletasTraje[0]) rec.appearance.palette = a.paletasTraje[0].id;
  rec.shown_visual_tier = null;
  r.mudou = true;
  r.avisos.push(`Ala escolhida: ${a.name}. Treinador: ${D.trainersById.get(a.treinador)?.name ?? a.treinador}.`);
  mergeResult(r, refreshMissions(rec));
  // sem a missão A Ala ativa (registro antigo), a flag entra aqui
  if (!rec.missions.ativas.some((m) => D.missionsById.get(m)?.cadeia === 'escolha_da_ala') && setFlag(rec, FLAG_ALA)) r.flags.push(FLAG_ALA);
  return { ok: true, resultado: r };
}

/** Troca a habilidade da classe no botão 3 (só com ala; nos níveis 8 a 11 os 3 botões são fixos). */
export function setSlot3(rec: PlayerRecord, abilityId: string): Check {
  if (!rec.archetype || !rec.class) return { ok: false, erro: 'O botão 3 é escolhível depois da ala, no nível 12.' };
  const cls = getData().classesById.get(rec.class)!;
  const id = baseId(abilityId);
  if (!cls.abilities.includes(id)) return { ok: false, erro: 'Essa habilidade não é da sua classe.' };
  rec.loadout.slot3_ability = id;
  rec.loadout.botoes = [rec.loadout.botoes[0] ?? '', rec.loadout.botoes[1] ?? '', id];
  return { ok: true };
}

export interface LoadoutView {
  b1: string;
  b2: string;
  b3: string;
  especial: string;
  basico: string;
  /** habilidades da classe que podem ir no botão 3 (vazio antes da ala) */
  slot3Opcoes: string[];
}

/** Botões do registro pela regra dos docs (sem os sufixos dos talentos: esses são da simulação). */
export function loadoutOf(rec: PlayerRecord): LoadoutView | null {
  const D = getData();
  if (!rec.class) return null;
  const cls = D.classesById.get(rec.class)!;
  if (!rec.archetype) {
    const [b1, b2, b3] = cls.loadoutPreAla.botoes;
    return { b1: b1!, b2: b2!, b3: b3!, especial: cls.special, basico: cls.basicAttack, slot3Opcoes: [] };
  }
  const a = D.archetypesById.get(rec.archetype)!;
  const s3 = rec.loadout.slot3_ability ? baseId(rec.loadout.slot3_ability) : null;
  const b3 = s3 && cls.abilities.includes(s3) ? s3 : defaultSlot3(cls.id, a.papel);
  return { b1: a.habilidadesMarca.marca_1, b2: a.habilidadesMarca.marca_2, b3, especial: cls.special, basico: cls.basicAttack, slot3Opcoes: [...cls.abilities] };
}
