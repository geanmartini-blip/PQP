import { z } from 'zod';
import { ClassId, Id, Side, Sugestao } from './common';
import { StatKey } from './ability';
import { TalentGroup } from './talent';

/**
 * Progressão do jogador: etapas, marcos, calendário de talentos, visual por nível,
 * curva de XP (sem teto), XP de morte e botões por faixa de nível.
 */

const NivelMax = z.number().int().positive().nullable(); // null = sem teto

export const Stage = z
  .object({
    id: Id,
    name: z.string().min(1),
    nivelMin: z.number().int().positive(),
    nivelMax: NivelMax,
    /** texto do doc (Sistemas.md, "Etapas do jogador") */
    descricao: z.string().min(1),
    eventos: z.array(z.string().min(1)).default([]),
    emPiloto: z.boolean(),
    ...Sugestao,
  })
  .strict();
export type Stage = z.infer<typeof Stage>;

/** Capítulos da jornada por margem (Narrativa.md, "A jornada"). */
export const Chapter = z
  .object({
    id: Id,
    name: z.string().min(1),
    margem: Side,
    nivelMin: z.number().int().positive(),
    nivelMax: z.number().int().positive(),
    descricao: z.string().min(1),
    ...Sugestao,
  })
  .strict();
export type Chapter = z.infer<typeof Chapter>;

export const Milestone = z
  .object({
    nivel: z.number().int().positive(),
    id: Id,
    name: z.string().min(1),
    descricao: z.string().min(1),
    desbloqueia: z.array(z.string().min(1)).default([]),
    emPiloto: z.boolean(),
    ...Sugestao,
  })
  .strict();
export type Milestone = z.infer<typeof Milestone>;

export const TalentSlot = z
  .object({
    nivel: z.number().int().min(10),
    /** grupos de talento que podem ser escolhidos neste nível (o 30 tem 3 alternativas) */
    grupos: z.array(TalentGroup).min(1),
    name: z.string().min(1),
    /** texto do doc (coluna "Escolha") */
    escolha: z.string().min(1),
    /** de onde vêm as opções (o 30 tem 3: a virada, o talento-chave que ficou de fora ou mais 1 do papel) */
    fontes: z
      .array(
        z.enum([
          'propria_lista',
          'outra_ala_mesma_instituicao',
          'chave_que_ficou_de_fora',
          'virada_do_arquetipo',
          'evolucao_do_guia',
          'lista_da_classe',
        ]),
      )
      .min(1),
    quantidadeOpcoes: z.number().int().positive().optional(),
    emPiloto: z.boolean(),
    ...Sugestao,
  })
  .strict();
export type TalentSlot = z.infer<typeof TalentSlot>;

export const TalentCalendar = z
  .object({
    niveis: z.array(TalentSlot).min(1),
    livre: z
      .object({
        aPartirDe: z.number().int(),
        aCadaNiveis: z.number().int().positive(),
        regra: z.string().min(1),
        ...Sugestao,
      })
      .strict(),
    maestria: z
      .object({
        regra: z.string().min(1),
        pctPorAtributo: z.number().positive(),
        aCadaNiveis: z.number().int().positive(),
        atributos: z.array(StatKey).min(1),
        ...Sugestao,
      })
      .strict(),
    regraNiveisSemTalento: z.string().min(1),
  })
  .strict();
export type TalentCalendar = z.infer<typeof TalentCalendar>;

export const VisualTier = z
  .object({
    id: z.enum(['delta', 'uniforme', 'aprendiz', 'veterano', 'virada', 'mestre', 'lendario']),
    nivel: z.number().int().positive(),
    name: z.string().min(1),
    descricao: z.string().min(1),
    emPiloto: z.boolean(),
    ...Sugestao,
  })
  .strict();
export type VisualTier = z.infer<typeof VisualTier>;

export const XpRow = z
  .object({
    nivel: z.number().int().positive(),
    /** XP para sair deste nível e chegar no próximo */
    xpParaProximo: z.number().int().positive(),
    /** XP total acumulado para chegar neste nível */
    xpAcumulado: z.number().int().nonnegative(),
  })
  .strict();
export type XpRow = z.infer<typeof XpRow>;

export const XpCurve = z
  .object({
    semTeto: z.literal(true),
    /** xpParaProximo(n) = arredonda(base * n ^ expoente) */
    formula: z
      .object({
        tipo: z.literal('potencia'),
        base: z.number().positive(),
        expoente: z.number().positive(),
        arredondamento: z.enum(['round', 'floor', 'ceil']),
        texto: z.string().min(1),
      })
      .strict(),
    /** tabela de referência gerada pela fórmula (o código usa a fórmula) */
    tabela: z.array(XpRow).min(1),
    ritmoEsperado: z
      .object({
        tutorialXpPorMin: z.number().positive(),
        grupoXpPorMin: z.number().positive(),
        minutosAteNivel7: z.number().positive(),
        horasDoNivel8ao20: z.number().positive(),
      })
      .strict(),
    regrasDoDoc: z
      .object({
        soLutaEmGrupoDaXp: z.literal(true),
        grupoMinimoPersonagens: z.number().int().positive(),
        contaPlantonistasEIa: z.literal(true),
        bonusPorJogadorAoVivoPct: z.number(),
        plantaoMultXp: z.number().positive(),
        fontes: z.array(z.string().min(1)).min(1),
      })
      .strict(),
    ...Sugestao,
  })
  .strict()
  .superRefine((c, ctx) => {
    const r = Math[c.formula.arredondamento];
    let acum = 0;
    c.tabela.forEach((row, i) => {
      const esperado = r(c.formula.base * Math.pow(row.nivel, c.formula.expoente));
      if (row.nivel !== i + 1) ctx.addIssue({ code: 'custom', message: `tabela de XP fora de ordem no nível ${row.nivel}` });
      if (row.xpParaProximo !== esperado) ctx.addIssue({ code: 'custom', message: `XP do nível ${row.nivel}: ${row.xpParaProximo} != ${esperado}` });
      if (row.xpAcumulado !== acum) ctx.addIssue({ code: 'custom', message: `XP acumulado do nível ${row.nivel}: ${row.xpAcumulado} != ${acum}` });
      acum += esperado;
    });
  });
export type XpCurve = z.infer<typeof XpCurve>;

export const DeathRule = z
  .object({
    /** texto do doc */
    regra: z.string().min(1),
    /** % do XP pedido pelo nível atual que se perde ao morrer */
    perdePctDoXpDoNivel: z.number().min(0).max(100),
    podeDescerDeNivel: z.boolean(),
    voltaPara: z.literal('qg_da_margem'),
    semPerdaAteNivel: z.number().int().nonnegative(),
    arenaEInvasao: z
      .object({ reforcoACadaS: z.number().positive(), perdeXp: z.boolean(), ...Sugestao })
      .strict(),
    plantonistaPerdeXp: z.boolean(),
    ...Sugestao,
  })
  .strict();
export type DeathRule = z.infer<typeof DeathRule>;

export const ButtonSource = z.enum(['classe', 'marca_1', 'marca_2']);
export type ButtonSource = z.infer<typeof ButtonSource>;

export const ButtonLayout = z
  .object({
    id: Id,
    nivelMin: z.number().int().positive(),
    nivelMax: NivelMax,
    /**
     * 'basico_da_classe' (o básico da classe do jogador) ou o id de uma habilidade de slot basico
     * (no Delta, o mesmo de balance.personagemDelta.ataqueBasico)
     */
    basico: z.union([z.literal('basico_da_classe'), Id]),
    /** botões 1, 2 e 3, na ordem */
    botoes: z.array(ButtonSource).max(3),
    especial: z.enum(['nenhum', 'especial_da_classe', 'virada_ou_especial_da_classe']),
    item: z.boolean(),
    /** a habilidade da classe dos botões é escolhida no QG */
    classeEscolhidaNoQg: z.boolean(),
    descricao: z.string().min(1),
    /** liberação gradual no tutorial do Delta */
    desbloqueioTutorial: z
      .array(z.object({ nivel: z.number().int().positive(), controle: z.string().min(1), descricao: z.string().min(1) }).strict())
      .optional(),
    ...Sugestao,
  })
  .strict()
  .superRefine((b, ctx) => {
    if (b.nivelMax !== null && b.nivelMax < b.nivelMin) ctx.addIssue({ code: 'custom', message: `${b.id}: nivelMax < nivelMin` });
  });
export type ButtonLayout = z.infer<typeof ButtonLayout>;

export const ClassButtonDefaults = z
  .object({
    basico: Id,
    especial: Id,
    habilidades: z.array(Id).length(4),
    /** os 3 botões nos níveis 8 a 11 */
    botoesNivel8a11: z.array(Id).length(3),
    /** botão 3 padrão a partir do 12 */
    botao3Padrao: Id,
    ...Sugestao,
  })
  .strict()
  .superRefine((d, ctx) => {
    for (const h of [...d.botoesNivel8a11, d.botao3Padrao]) {
      if (!d.habilidades.includes(h)) ctx.addIssue({ code: 'custom', message: `${h} não é habilidade da classe` });
    }
  });
export type ClassButtonDefaults = z.infer<typeof ClassButtonDefaults>;

export const ProgressionFile = z
  .object({
    etapas: z.array(Stage).min(1),
    capitulos: z.array(Chapter).default([]),
    marcos: z.array(Milestone).min(1),
    calendarioTalentos: TalentCalendar,
    visualPorNivel: z.array(VisualTier).length(7),
    xp: XpCurve,
    morte: DeathRule,
    botoes: z.array(ButtonLayout).min(1),
    padraoPorClasse: z.record(ClassId, ClassButtonDefaults),
  })
  .strict()
  .superRefine((f, ctx) => {
    // faixas de botões cobrem do 1 em diante, sem buraco nem sobreposição
    const bs = [...f.botoes].sort((a, b) => a.nivelMin - b.nivelMin);
    let esperado = 1;
    for (const b of bs) {
      if (b.nivelMin !== esperado) ctx.addIssue({ code: 'custom', message: `botões: faixa ${b.id} começa em ${b.nivelMin}, esperado ${esperado}` });
      if (b.nivelMax === null) {
        esperado = Infinity;
        break;
      }
      esperado = b.nivelMax + 1;
    }
    if (esperado !== Infinity) ctx.addIssue({ code: 'custom', message: 'botões: a última faixa precisa ir até sem teto (nivelMax null)' });
    const niveis = f.calendarioTalentos.niveis.map((s) => s.nivel);
    if (new Set(niveis).size !== niveis.length) ctx.addIssue({ code: 'custom', message: 'calendário de talentos com nível repetido' });
    for (const s of f.calendarioTalentos.niveis) {
      if (s.nivel % 5 !== 0) ctx.addIssue({ code: 'custom', message: `talento no nível ${s.nivel}, fora do múltiplo de 5` });
      const piloto = s.nivel <= 20;
      if (s.emPiloto !== piloto) ctx.addIssue({ code: 'custom', message: `talento do nível ${s.nivel}: emPiloto deve ser ${piloto}` });
    }
    // todo talento e visual do piloto precisa de um marco do piloto no mesmo nível
    const marcosPiloto = new Set(f.marcos.filter((m) => m.emPiloto).map((m) => m.nivel));
    for (const s of f.calendarioTalentos.niveis) {
      if (s.emPiloto && !marcosPiloto.has(s.nivel)) ctx.addIssue({ code: 'custom', message: `talento do piloto no nível ${s.nivel} sem marco do piloto` });
    }
    for (const v of f.visualPorNivel) {
      if (v.emPiloto && !marcosPiloto.has(v.nivel)) ctx.addIssue({ code: 'custom', message: `visual ${v.id} do piloto sem marco do piloto no nível ${v.nivel}` });
    }
    for (const m of f.marcos) {
      if (m.emPiloto) continue;
      for (const lib of m.desbloqueia) {
        if (['talento_instituicao', 'talento_papel', 'talento_chave', 'visual_delta', 'visual_uniforme', 'visual_aprendiz', 'visual_veterano'].includes(lib)) {
          ctx.addIssue({ code: 'custom', message: `marco ${m.id} fora do piloto libera ${lib}, que é do piloto` });
        }
      }
    }
    const vis = f.visualPorNivel.map((v) => v.nivel);
    if (vis.some((n, i) => i > 0 && n <= vis[i - 1]!)) ctx.addIssue({ code: 'custom', message: 'visualPorNivel fora de ordem' });
  });
export type ProgressionFile = z.infer<typeof ProgressionFile>;
