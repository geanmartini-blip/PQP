import { z } from 'zod';
import { ClassId, Id, Role, Side, Sugestao } from './common';
import { CcKind, LIMITES_CONTROLE, StatKey } from './ability';

/**
 * Balanceamento (Sistemas.md, "Tabela de balanceamento", "Vantagem entre classes",
 * "Encanto x máquina", "Como calibrar", "Ritmo e números", "Rede", "Grupo, XP e Doutrina").
 * Percentuais em pontos percentuais (15 = +15%). Tempos em ms quando o nome termina em Ms,
 * em segundos quando termina em S.
 * A curva de XP NÃO mora aqui (é da progressão).
 */

/** Regiões fixas do mapa (as 5 do piloto e as de fora). */
export const RegiaoFixa = z.enum([
  'delta',
  'margem_esquerda',
  'margem_direita',
  'usina_da_ponte',
  'juncal',
  'rio_claro',
  'planalto_do_trigo',
  'vale_das_chamines',
  'serra_da_chopindita',
  'mirante',
  'ilha_do_farol',
]);
export type RegiaoFixa = z.infer<typeof RegiaoFixa>;

/** Bloco de atributos da tabela (Vida, Ataque, Defesa, Velocidade, Alcance, Controle, Cura). */
const statFields = {
  vida: z.number().positive(),
  ataque: z.number().nonnegative(),
  defesa: z.number().nonnegative(),
  velocidade: z.number().positive(),
  /** 1 = corpo a corpo, 2 = médio, 3 = longo (ver alcanceTiles) */
  alcance: z.number().int().min(1).max(3),
  controle: z.number().nonnegative(),
  cura: z.number().nonnegative(),
};

export const StatBlock = z.object({ ...statFields, orcamento: z.number(), ...Sugestao }).strict();
export type StatBlock = z.infer<typeof StatBlock>;

export const ArchetypeStats = z
  .object({
    classe: ClassId,
    papel: Role,
    margem: Side,
    /** o arquétipo da outra margem que divide a mesma linha da tabela */
    par: Id,
    ...statFields,
    orcamento: z.number(),
    ...Sugestao,
  })
  .strict();
export type ArchetypeStats = z.infer<typeof ArchetypeStats>;

export const BudgetWeights = z
  .object({
    vida: z.number(),
    ataque: z.number(),
    defesa: z.number(),
    velocidade: z.number(),
    alcance: z.number(),
    controle: z.number(),
    cura: z.number(),
  })
  .strict();
export type BudgetWeights = z.infer<typeof BudgetWeights>;

/** Orçamento = soma de atributo × peso. */
export function computeBudget(
  s: { vida: number; ataque: number; defesa: number; velocidade: number; alcance: number; controle: number; cura: number },
  w: BudgetWeights,
): number {
  return (
    s.vida * w.vida +
    s.ataque * w.ataque +
    s.defesa * w.defesa +
    s.velocidade * w.velocidade +
    s.alcance * w.alcance +
    s.controle * w.controle +
    s.cura * w.cura
  );
}

export const MarginCondition = z.enum(['energia', 'apagao', 'poluicao_zero', 'por_ponto_poluicao', 'natureza', 'cidade']);
export type MarginCondition = z.infer<typeof MarginCondition>;

export const MarginModifier = z
  .object({
    id: Id,
    condicao: MarginCondition,
    name: z.string().min(1),
    esquerdaPct: z.number(),
    direitaPct: z.number(),
    /** regiões onde vale (natureza e cidade) */
    regioes: z.array(RegiaoFixa).optional(),
    ...Sugestao,
  })
  .strict();
export type MarginModifier = z.infer<typeof MarginModifier>;

const MinMax = z.object({ min: z.number(), max: z.number() }).strict();

export const DeltaLevel = z
  .object({ nivel: z.number().int().min(1).max(7), vida: z.number(), ataque: z.number(), defesa: z.number(), velocidade: z.number() })
  .strict();

export const BalanceFile = z
  .object({
    orcamento: z
      .object({
        formula: z.string().min(1),
        pesos: BudgetWeights,
        min: z.number(),
        max: z.number(),
        description: z.string(),
      })
      .strict(),
    /** 24 entradas, uma por arquétipo; cada linha da tabela vale para o par Esquerda/Direita */
    atributosArquetipo: z.record(Id, ArchetypeStats),
    /**
     * níveis 8 a 11 (classe sem ala): valores sugeridos, próximos da média das 3 linhas da classe e
     * ajustados para o Orçamento ficar entre 52,5 e 56 (não é a média exata)
     */
    atributosPreAla: z.record(ClassId, StatBlock),
    personagemDelta: z
      .object({
        nivelMin: z.literal(1),
        nivelMax: z.literal(7),
        base: StatBlock,
        ataqueBasico: Id,
        niveis: z.array(DeltaLevel).length(7),
        description: z.string(),
        ...Sugestao,
      })
      .strict(),
    alcanceTiles: z.object({ '1': z.number().positive(), '2': z.number().positive(), '3': z.number().positive() }).strict(),
    /** atacante -> alvo -> % de dano a mais (negativo = a menos) */
    vantagemClasse: z.record(ClassId, z.record(ClassId, z.number())),
    encantoMaquina: z
      .object({
        modificadores: z.array(MarginModifier),
        /** o que os % de margem afetam */
        aplicaEm: z.array(StatKey),
        /** como os modificadores se juntam */
        combinacao: z.object({ modo: z.literal('soma'), pisoPct: z.number(), tetoPct: z.number() }).strict(),
        /** medidor de energia da região (0 a 100) */
        limiaresEnergia: z.object({ comEnergiaMin: z.number(), apagaoMax: z.number() }).strict(),
        /** medidor de poluição da região, em pontos */
        escalaPoluicao: MinMax,
        description: z.string(),
        ...Sugestao,
      })
      .strict(),
    ganhoPorNivel: z
      .object({
        vidaPct: z.number(),
        ataquePct: z.number(),
        defesaPct: z.number(),
        velocidadePct: z.number(),
        /** os níveis sem talento dão atributo; talento no 10, 15, 20... */
        talento: z.object({ inicio: z.number().int(), aCada: z.number().int() }).strict(),
        modo: z.enum(['linear', 'composto']),
        /** a tabela de arquétipo/pré-ala vale neste nível; ganhos contam a partir do seguinte */
        nivelReferenciaClasse: z.number().int(),
        /** idem para o personagem do Delta */
        nivelReferenciaDelta: z.number().int(),
        formula: z.string(),
        ...Sugestao,
      })
      .strict(),
    combate: z
      .object({
        recargaGlobalMs: z.number().int().positive(),
        recargaHabilidadeS: MinMax,
        especialCargaS: MinMax,
        /** duração base dos controles nas habilidades de jogador */
        controleMs: MinMax,
        /** controles que seguem o limite de controleMs e dão imunidade de imunidadeControleMs depois */
        controlesComLimite: z.array(CcKind),
        imunidadeControleMs: z.number().int().positive(),
        chefesSoFicamLentos: z.literal(true),
        chefeLentidaoPct: z.number(),
        provocarMaxMs: z.number().int().positive(),
        /** provocar não está em controlesComLimite; diz se ele também dá a imunidade de 4 s */
        provocarDaImunidade: z.boolean(),
        /** controle com quebraAoApanhar (acaba no primeiro golpe) pode ir até aqui; ex.: Protocolo Infinito */
        controleQuebravelMaxMs: z.number().int().positive(),
        /** teto depois de bônus de talento, ala ou ccDuration (ex.: "o controle dura o dobro") */
        controleComBonusMaxMs: z.number().int().positive(),
        raioMinAreaTiles: z.number().positive(),
        avisoMinMs: z.number().int().positive(),
        cargaMaxMs: z.number().int().positive(),
        aliadoCaidoMs: z.number().int().positive(),
        /** o que acontece quando ninguém levanta o aliado caído a tempo */
        aoExpirarCaido: z.enum(['volta_ao_qg']),
        levantarMs: z.number().int().positive(),
        levantarRaioTiles: z.number().positive(),
        levantarVidaPct: z.number().positive(),
        grupoMin: z.number().int().positive(),
        grupoMax: z.number().int().positive(),
        xpBonusPorJogadorVivoExtraPct: z.number(),
        soGrupoDaXp: z.literal(true),
        plantonistaXpMult: z.number(),
        plantonistaContaBonusAoVivo: z.literal(false),
        servidorTicksPorS: z.number().int().positive(),
        tickMs: z.number().int().positive(),
        toleranciaAcertoTiles: z.number().positive(),
        compensacaoMaxMs: z.number().int().positive(),
        pingAlvoMs: z.number().int().positive(),
        perdaPacoteAlvo: z.number().min(0).max(1),
        raioTrocaAlvoTiles: z.number().positive(),
        botoesHabilidade: z.number().int().positive(),
        doutrinaCartasMax: z.number().int().positive(),
        pocaoAutoAbaixoPct: z.number(),
        intervaloAtaqueBasicoBaseS: z.number().positive(),
        regenForaDeCombate: z.object({ aposMs: z.number().int().positive(), pctVidaPorS: z.number().positive() }).strict(),
        raioColetaSaqueTiles: z.number().positive(),
        description: z.string().optional(),
        ...Sugestao,
      })
      .strict(),
    especial: z
      .object({
        cargaMax: z.number().positive(),
        /**
         * cargaS de referência: um Especial com cargaS = cargaReferenciaS precisa de cargaMax pontos;
         * com outro cargaS, precisa de cargaMax × cargaS ÷ cargaReferenciaS, e teto e piso escalam junto
         */
        cargaReferenciaS: z.number().positive(),
        porAcertoBasico: z.number().nonnegative(),
        porHabilidadeQueAcerta: z.number().nonnegative(),
        /** pontos por 1% da própria vida máxima perdida */
        porPctVidaPerdida: z.number().nonnegative(),
        /** pontos por 1% da vida máxima do aliado curada ou protegida por escudo */
        porPctVidaCurada: z.number().nonnegative(),
        porSegundoEmCombate: z.number().nonnegative(),
        /** teto de carga por segundo (garante o mínimo de 45 s) */
        tetoPorS: z.number().positive(),
        /** piso por segundo enquanto o personagem bateu, apanhou ou curou nos últimos janelaAtivoMs (garante o máximo de 90 s) */
        pisoPorSAtivo: z.number().positive(),
        janelaAtivoMs: z.number().int().positive(),
        /** o bônus de carga (specialCharge, Faísca, lições, Rajada Lendária) multiplica teto e piso */
        bonusMultiplicaTetoEPiso: z.boolean(),
        estimativas: z.array(z.object({ perfil: z.string(), pontosPorS: z.number(), segundos: z.number() }).strict()),
        description: z.string(),
        ...Sugestao,
      })
      .strict(),
    dano: z
      .object({
        formula: z.string().min(1),
        defesaKBase: z.number().positive(),
        defesaKPorNivel: z.number().nonnegative(),
        criticoChanceBasePct: z.number(),
        criticoMult: z.number().positive(),
        variacaoPct: z.number().nonnegative(),
        danoMinimo: z.number().nonnegative(),
        curaFormula: z.string().min(1),
        curaPorPontoCuraPct: z.number(),
        vantagemSoEntreClasses: z.boolean(),
        description: z.string(),
        ...Sugestao,
      })
      .strict(),
    deslocamento: z
      .object({
        baseTilesPorS: z.number().positive(),
        velocidadeReferencia: z.number().positive(),
        fatorPorPontoPct: z.number(),
        fatorMin: z.number().positive(),
        fatorMax: z.number().positive(),
        aplicaEm: z.array(StatKey),
        formula: z.string(),
        ...Sugestao,
      })
      .strict(),
    /** critérios do simulador de balanceamento (Sistemas.md, "Como calibrar") */
    calibracao: z
      .object({
        /** nenhum arquétipo deveria vencer mais que isto contra a média */
        vitoriaMaxContraMediaPct: z.number().min(50).max(100),
        modos: z.array(z.enum(['um_contra_um', 'grupo_contra_grupo'])).min(1),
        /** grupos de um papel só que não podem ganhar sempre */
        gruposDePapelUnico: z.array(Role),
        description: z.string(),
        ...Sugestao,
      })
      .strict(),
    ...Sugestao,
  })
  .strict()
  .superRefine((b, ctx) => {
    const w = b.orcamento.pesos;
    const entries = Object.entries(b.atributosArquetipo);
    if (entries.length !== 24) ctx.addIssue({ code: 'custom', message: `atributosArquetipo tem ${entries.length} entradas, esperado 24` });
    for (const [id, s] of entries) {
      const calc = computeBudget(s, w);
      if (Math.abs(calc - s.orcamento) > 1e-6) ctx.addIssue({ code: 'custom', message: `${id}: orçamento ${s.orcamento} difere do calculado ${calc}` });
      if (s.orcamento < b.orcamento.min || s.orcamento > b.orcamento.max) ctx.addIssue({ code: 'custom', message: `${id}: orçamento fora de ${b.orcamento.min} a ${b.orcamento.max}` });
      const par = b.atributosArquetipo[s.par];
      if (!par) ctx.addIssue({ code: 'custom', message: `${id}: par ${s.par} ausente` });
      else {
        if (par.par !== id) ctx.addIssue({ code: 'custom', message: `${id}: par não é recíproco` });
        if (par.margem === s.margem) ctx.addIssue({ code: 'custom', message: `${id}: par na mesma margem` });
        for (const k of ['vida', 'ataque', 'defesa', 'velocidade', 'alcance', 'controle', 'cura', 'orcamento', 'classe', 'papel'] as const) {
          if (par[k] !== s[k]) ctx.addIssue({ code: 'custom', message: `${id}: ${k} difere do par ${s.par}` });
        }
      }
    }
    for (const [id, s] of Object.entries(b.atributosPreAla)) {
      const calc = computeBudget(s, w);
      if (Math.abs(calc - s.orcamento) > 1e-6) ctx.addIssue({ code: 'custom', message: `pré-ala ${id}: orçamento ${s.orcamento} difere do calculado ${calc}` });
    }
    const d = b.personagemDelta.base;
    if (Math.abs(computeBudget(d, w) - d.orcamento) > 1e-6) ctx.addIssue({ code: 'custom', message: 'personagemDelta: orçamento difere do calculado' });
    for (const [a, row] of Object.entries(b.vantagemClasse)) {
      if (row[a as keyof typeof row] !== 0) ctx.addIssue({ code: 'custom', message: `vantagemClasse: ${a} contra ${a} deveria ser 0` });
    }
    const e = b.especial;
    // Teto e piso escalam com cargaS ÷ cargaReferenciaS, então os limites em segundos não mudam.
    if (e.cargaMax / e.tetoPorS < b.combate.especialCargaS.min - 1e-6) ctx.addIssue({ code: 'custom', message: 'especial: teto carrega abaixo de 45 s' });
    if (e.cargaMax / e.pisoPorSAtivo > b.combate.especialCargaS.max + 1e-6) ctx.addIssue({ code: 'custom', message: 'especial: piso carrega acima de 90 s' });
    if (e.cargaReferenciaS < b.combate.especialCargaS.min || e.cargaReferenciaS > b.combate.especialCargaS.max) {
      ctx.addIssue({ code: 'custom', message: 'especial: cargaReferenciaS fora de 45 a 90 s' });
    }
    const c = b.combate;
    const L = LIMITES_CONTROLE;
    if (c.controleMs.min !== L.minMs || c.controleMs.max !== L.maxMs) ctx.addIssue({ code: 'custom', message: 'combate.controleMs difere de LIMITES_CONTROLE (ability.ts)' });
    if (c.provocarMaxMs !== L.provocarMaxMs) ctx.addIssue({ code: 'custom', message: 'combate.provocarMaxMs difere de LIMITES_CONTROLE (ability.ts)' });
    if (c.controleQuebravelMaxMs !== L.quebravelMaxMs) ctx.addIssue({ code: 'custom', message: 'combate.controleQuebravelMaxMs difere de LIMITES_CONTROLE (ability.ts)' });
    for (const cc of ['atordoar', 'prender', 'silenciar'] as const) {
      if (!c.controlesComLimite.includes(cc)) ctx.addIssue({ code: 'custom', message: `combate.controlesComLimite precisa de ${cc} (Sistemas.md, Ritmo)` });
    }
    if (c.controlesComLimite.includes('provocar')) ctx.addIssue({ code: 'custom', message: 'combate.controlesComLimite: provocar tem regra própria (provocarMaxMs)' });
    if (c.controleComBonusMaxMs < c.controleMs.max) ctx.addIssue({ code: 'custom', message: 'combate.controleComBonusMaxMs abaixo de controleMs.max' });
  });
export type BalanceFile = z.infer<typeof BalanceFile>;
