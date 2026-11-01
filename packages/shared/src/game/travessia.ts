/**
 * Criação de personagem (cadastro do Delta) e travessia do nível 8: margem, instituição (que
 * define a classe), guia (12 espíritos na Esquerda, 4 IAs de bolso na Direita), patente inicial,
 * botões da classe dos níveis 8 a 11 e a moeda inicial de economy.saldoInicial.
 */
import { getData } from '../data';
import { deltaPalettes, validateAppearance, validateName } from './appearance';
import { hasFlag, setFlag } from './flags';
import { acceptMission, completeMission, refreshMissions } from './missions';
import { FLAG_BRUNO, TRAVESSIA_LEVEL, tutorialUnlocksAt } from './progression';
import { emptyResult, mergeResult, type Appearance, type Check, type GameResult, type PlayerRecord, type SideId } from './types';

/** Cadastro do Delta: nome e aparência; liga a cadeia do Delta (a primeira missão já entra ativa). */
export function createCharacter(rec: PlayerRecord, name: unknown, appearance: unknown): Check & { resultado: GameResult } {
  const r = emptyResult();
  if (rec.criado) return { ok: false, erro: 'Personagem já cadastrado. Para mudar o visual, use a Máquina de Visual.', resultado: r };
  const n = validateName(name);
  if (!n.ok) return { ok: false, erro: n.erro, resultado: r };
  const a = validateAppearance(appearance, { unlocks: rec.unlocks, palettes: deltaPalettes() });
  if (!a.ok) return { ok: false, erro: a.erros.join('; '), resultado: r };
  const ap = appearance as Appearance;
  rec.name = n.nome!;
  rec.appearance = { body: ap.body, skin: ap.skin, face: ap.face, hair: ap.hair, hair_color: ap.hair_color, details: [...ap.details], palette: ap.palette };
  rec.criado = true;
  r.mudou = true;
  r.desbloqueios.push(...tutorialUnlocksAt(1));
  mergeResult(r, refreshMissions(rec));
  return { ok: true, resultado: r };
}

/** Pode atravessar: Bruno Ferro derrotado, nível 8 e ainda sem margem. */
export function canCross(rec: PlayerRecord): Check {
  if (rec.stage === 'margem') return { ok: false, erro: 'Você já atravessou.' };
  if (!hasFlag(rec, FLAG_BRUNO)) return { ok: false, erro: 'Primeiro, o Bruno Ferro. O barco não sai com dívida no cais.' };
  if (rec.level < TRAVESSIA_LEVEL) return { ok: false, erro: `A travessia é no nível ${TRAVESSIA_LEVEL}.` };
  return { ok: true };
}

export interface TravessiaInstitution {
  id: string;
  name: string;
  classe: string;
  classeName: string;
  predio: string;
  missaoEntrada: string;
  /** quem recebe a base (treinador NPC) */
  treinador: string;
  alas: string[];
}

export interface TravessiaGuide {
  id: string;
  name: string;
  tipo: string;
  origem?: string;
  bonusTexto: string;
  jeitoDeFalar: string;
  saudacao?: string;
}

export interface TravessiaSide {
  side: SideId;
  name: string;
  sociedade: string;
  /** falas do Seu Jacó no barco sobre essa margem (npcs.json, travessia_esquerda/direita) */
  falaJaco: string[];
  instituicoes: TravessiaInstitution[];
  guias: TravessiaGuide[];
  moedaInicial: { semente: number; credito: number; score: number; extras: string[] };
}

export interface TravessiaOptions {
  pode: boolean;
  motivo?: string;
  margens: TravessiaSide[];
}

/** Saldo inicial da margem (economy.saldoInicial.travessia), já com o desconto automático da Direita. */
export function startingMoney(side: SideId): { semente: number; credito: number; score: number; extras: string[] } {
  const t = getData().economy.saldoInicial.travessia as unknown as Record<
    SideId,
    { semente: number; credito: number; score?: number; extras?: string[]; descontoAutomatico?: { motivo: string; valor: number } }
  >;
  const s = t[side];
  const desconto = s.descontoAutomatico?.valor ?? 0;
  const extras = [...(s.extras ?? [])];
  if (s.descontoAutomatico) extras.push(`${s.descontoAutomatico.motivo}: -${desconto} Crédito`);
  return { semente: s.semente, credito: Math.max(0, s.credito - desconto), score: s.score ?? 0, extras };
}

/** As 2 margens, as 4 instituições de cada uma e os guias da margem. */
export function travessiaOptions(rec: PlayerRecord): TravessiaOptions {
  const D = getData();
  const can = canCross(rec);
  const jaco = D.npcsById.get('seu_jaco');
  const margens = (['esquerda', 'direita'] as const).map((side): TravessiaSide => {
    const soc = D.societies.sociedades.find((s) => s.side === side)!;
    const insts = D.institutions.instituicoes
      .filter((i) => i.margem === side)
      .map((i) => ({
        id: i.id,
        name: i.name,
        classe: i.classe,
        classeName: D.classesById.get(i.classe)?.name ?? i.classe,
        predio: i.predio.descricao,
        missaoEntrada: i.missaoEntrada.texto,
        treinador: i.baseTrainer,
        alas: [...i.alas],
      }));
    const guias = D.guides.guias
      .filter((g) => g.margem === side)
      .map((g) => {
        const out: TravessiaGuide = { id: g.id, name: g.name, tipo: g.tipo, bonusTexto: g.bonusTexto, jeitoDeFalar: g.jeitoDeFalar };
        const origem = (g as { origem?: string }).origem;
        if (origem) out.origem = origem;
        const sau = g.falas.find((f) => f.situacao === 'saudacao')?.texto;
        if (sau) out.saudacao = sau;
        return out;
      });
    return {
      side,
      name: side === 'esquerda' ? 'Margem Esquerda' : 'Margem Direita',
      sociedade: soc.name,
      falaJaco: jaco?.falas.find((f) => f.contexto === `travessia_${side}`)?.linhas ?? [],
      instituicoes: insts,
      guias,
      moedaInicial: startingMoney(side),
    };
  });
  return { pode: can.ok, ...(can.ok ? {} : { motivo: can.erro }), margens };
}

export interface TravessiaChoice {
  side: string;
  institution: string;
  guide: string;
}

/**
 * Atravessa: define margem, instituição, classe (pela instituição), guia, patente inicial (da
 * margem e da instituição), os botões de classe dos níveis 8 a 11, a moeda inicial, o uniforme
 * (paleta da base) e o estágio 'margem'. Liga travessia_feita e a flag da margem, conclui a
 * missão da travessia e aceita a missão de entrada da instituição.
 */
export function applyTravessia(rec: PlayerRecord, choice: TravessiaChoice): Check & { resultado: GameResult } {
  const r = emptyResult();
  const D = getData();
  const can = canCross(rec);
  if (!can.ok) return { ...can, resultado: r };
  if (choice.side !== 'esquerda' && choice.side !== 'direita') return { ok: false, erro: 'Escolha uma margem.', resultado: r };
  const side = choice.side;
  const inst = D.institutionsById.get(choice.institution);
  if (!inst || inst.margem !== side) return { ok: false, erro: 'Essa instituição não é dessa margem.', resultado: r };
  const guide = D.guidesById.get(choice.guide);
  if (!guide || guide.margem !== side) return { ok: false, erro: side === 'esquerda' ? 'Escolha um espírito guia da Esquerda.' : 'Escolha uma IA de bolso da Direita.', resultado: r };
  const cls = D.classesById.get(inst.classe)!;
  const soc = D.societies.sociedades.find((s) => s.side === side)!;

  rec.side = side;
  rec.institution = inst.id;
  rec.class = cls.id;
  rec.archetype = null;
  rec.guide_id = guide.id;
  rec.rank = soc.patentes[0]?.id ?? null;
  rec.institution_rank = inst.patentes[0] ?? null;
  rec.loadout = { slot3_ability: cls.slot3Padrao, botoes: [...cls.loadoutPreAla.botoes] };
  const money = startingMoney(side);
  rec.semente += money.semente;
  rec.credito += money.credito;
  if (money.score > 0) rec.score = money.score;
  // uniforme da instituição: paleta oficial da base
  const base = D.outfits.tiers.find((t) => t.tier === 'base' && t.instituicao === inst.id);
  if (base?.paletas?.[0]) rec.appearance.palette = base.paletas[0].id;
  rec.shown_visual_tier = null;
  rec.stage = 'margem';
  r.estagio = 'margem';
  r.mudou = true;
  r.recursos.semente = money.semente;
  r.recursos.credito = money.credito;
  for (const f of ['travessia_feita', `margem_${side}`]) if (setFlag(rec, f)) r.flags.push(f);
  // a travessia ativa termina aqui (a escolha da margem é este passo)
  for (const id of [...rec.missions.ativas]) if (D.missionsById.get(id)?.cadeia === 'travessia') mergeResult(r, completeMission(rec, id));
  r.desbloqueios.push(...tutorialUnlocksAt(TRAVESSIA_LEVEL, { margem: true }));
  r.avisos.push(`Bem-vindo à ${inst.name}. Patente: ${rec.institution_rank ?? soc.patentes[0]?.name ?? ''}.`.trim());
  r.avisos.push(...money.extras);
  mergeResult(r, refreshMissions(rec));
  // missão de entrada da instituição
  // primeira missão da cadeia de chegada da margem (A Roda / O Primeiro Contrato) e a de entrada,
  // quando os requisitos já estiverem cumpridos
  for (const c of D.missions.cadeias) {
    if (c.margem !== side || !c.emPiloto || c.nivelMin > TRAVESSIA_LEVEL || !c.missoes[0]) continue;
    const a = acceptMission(rec, c.missoes[0]);
    if (a.ok) mergeResult(r, a.resultado);
  }
  const entrada = acceptMission(rec, inst.missaoEntrada.id);
  if (entrada.ok) mergeResult(r, entrada.resultado);
  return { ok: true, resultado: r };
}
