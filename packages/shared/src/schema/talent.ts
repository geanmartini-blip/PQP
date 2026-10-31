import { z } from 'zod';
import { ClassId, Id, Role, Side, Sugestao } from './common';
import { Effect, Passive, StatKey, StatMod } from './ability';

/**
 * Talentos: um a cada 5 níveis a partir do 10 (Sistemas.md, "Talentos").
 * 10/40 instituição, 15/50 papel, 20/35 chave, 25/45 margem, 30 virada, 55 guia, 60 lenda.
 * O efeito de cada talento é codificado como Passive (ability.ts) e/ou como modificação
 * de habilidade (AbilityMod), ou como a troca do Especial pela virada.
 */

const InstitutionRef = z.enum([
  'brigada_popular',
  'guarda_comunitaria',
  'escola_dos_saberes',
  'trupe_do_povo',
  'torcida_furia_neon',
  'pm_do_consorcio',
  'universidade_neon',
  'agencia_neon',
]);

const ArchetypeRef = z.enum([
  'peao_brabo',
  'iogue_furioso',
  'cidadao_revolucionario',
  'babushka',
  'arqueiro_das_estepes',
  'cacador_de_crocodilo',
  'druida_rabugento',
  'bruxa_do_trovao',
  'curandeira_dos_andes',
  'luchador_sagrado',
  'diva_da_opera',
  'malandro',
  'sumo_cibernetico',
  'o_fiel',
  'monstro_da_academia',
  'tropa_de_choque',
  'cowboy_cromado',
  'diretor_de_nollywood',
  'engenheira_de_gambiarra',
  'doktor_klaus',
  'coach_de_bem_estar',
  'atendente_imortal',
  'hacker_da_aldeia',
  'idol',
]);

export const TalentGroup = z.enum(['instituicao', 'papel', 'chave', 'margem', 'virada', 'guia', 'lenda']);
export type TalentGroup = z.infer<typeof TalentGroup>;

/** Níveis em que cada grupo aparece (sem contar o "Livre" do 65 em diante). */
export const TALENT_LEVELS: Record<TalentGroup, number[]> = {
  instituicao: [10, 40],
  papel: [15, 30, 50],
  chave: [20, 30, 35],
  margem: [25, 45],
  virada: [30],
  guia: [55],
  lenda: [60],
};

/** Quem pode pegar o talento. Talentos-chave valem para os 2 arquétipos do par. */
export const TalentOwner = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('instituicao'), instituicao: InstitutionRef }).strict(),
  z.object({ tipo: z.literal('papel'), papel: Role }).strict(),
  z.object({ tipo: z.literal('arquetipos'), arquetipos: z.tuple([ArchetypeRef, ArchetypeRef]) }).strict(),
  z.object({ tipo: z.literal('arquetipo'), arquetipo: ArchetypeRef }).strict(),
  z.object({ tipo: z.literal('margem'), margem: Side }).strict(),
  z.object({ tipo: z.literal('classe'), classe: ClassId }).strict(),
  z.object({ tipo: z.literal('todos') }).strict(),
]);
export type TalentOwner = z.infer<typeof TalentOwner>;

const EffectKind = z.enum([
  'dano',
  'dano_continuo',
  'cura',
  'cura_continua',
  'escudo',
  'reducao_dano',
  'devolver_dano',
  'controle',
  'lentidao',
  'empurrar',
  'puxar',
  'reforco',
  'marca',
  'avanco',
  'recuo',
  'invocar',
  'campo',
  'transformar',
  'invisivel',
  'imune',
  'recurso',
  'derrubar_moeda',
  'explode_ao_morrer',
  'limpar',
  'zerar_recargas',
  'levantar',
  'segurar_vida',
  'gancho',
]);

/**
 * Modificação de uma habilidade existente.
 * Ex.: "a provocação dobra de raio e atordoa por 1 s" =
 *   { habilidade: 'segura_o_peao', campo: 'radius', mult: 2,
 *     efeitosExtras: [{ kind: 'controle', cc: 'atordoar', duracaoMs: 1000, target: 'inimigos_area' }] }
 *
 * - Sem `efeito`: `campo` é um campo da habilidade (radius, range, cooldownS, cost, castMs).
 * - Com `efeito`: `campo` é um campo dos efeitos desse kind (duracaoMs, pct, mult, pctVidaMax,
 *   danoRecebidoPct, target, radius, pulaAoMorrer, salto.saltos...). `stat` filtra reforços.
 * - Campos virtuais que o motor entende: 'alvosExtras' (aliados a mais num reforço de alvo contado,
 *   como 'aliado_mais_perto'; não serve para campo nem invocação, que pegam todo aliado do raio).
 * - O motor nunca grava texto em campo numérico: regras como "gasta todo o recurso" vão em gancho/params.
 * - Controles que um talento alonga continuam presos ao teto do briefing (1 a 2 s, provocar até 4 s).
 * - `valor` substitui; `mult` multiplica; `soma` soma. Só um dos três por modificação.
 */
export const AbilityMod = z
  .object({
    habilidade: Id,
    efeito: EffectKind.optional(),
    stat: StatKey.optional(),
    campo: z.string().min(1).optional(),
    valor: z.union([z.number(), z.string(), z.boolean()]).optional(),
    mult: z.number().positive().optional(),
    soma: z.number().optional(),
    efeitosExtras: z.array(Effect).optional(),
    /** regra especial em código (ex.: 'escudo_quebra_empurra') */
    gancho: Id.optional(),
    params: z.record(z.string(), z.unknown()).optional(),
    ...Sugestao,
  })
  .strict()
  .superRefine((m, ctx) => {
    const ops = [m.valor !== undefined, m.mult !== undefined, m.soma !== undefined].filter(Boolean).length;
    if (ops > 1) ctx.addIssue({ code: 'custom', message: `${m.habilidade}: use só um de valor, mult ou soma` });
    if (ops === 1 && !m.campo) ctx.addIssue({ code: 'custom', message: `${m.habilidade}: valor/mult/soma sem campo` });
    const camposNumericos = ['radius', 'range', 'cooldownS', 'cost', 'castMs', 'duracaoMs', 'pct', 'mult', 'pctVidaMax'];
    if (m.campo && camposNumericos.includes(m.campo) && m.valor !== undefined && typeof m.valor !== 'number') {
      ctx.addIssue({ code: 'custom', message: `${m.habilidade}: campo numérico ${m.campo} com valor ${String(m.valor)}` });
    }
    if (ops === 0 && !m.efeitosExtras && !m.gancho) {
      ctx.addIssue({ code: 'custom', message: `${m.habilidade}: modificação vazia` });
    }
  });
export type AbilityMod = z.infer<typeof AbilityMod>;

/** O que o talento faz: passivos, modificações de habilidade ou a virada no Especial. */
export const TalentEffect = z
  .object({
    passivos: z.array(Passive).optional(),
    modificacoes: z.array(AbilityMod).optional(),
    /** habilidade que passa a ocupar o botão Especial (viradas: virada_<arquetipo>) */
    substituiEspecial: Id.optional(),
    ...Sugestao,
  })
  .strict()
  .refine((e) => !!(e.passivos?.length || e.modificacoes?.length || e.substituiEspecial), {
    message: 'efeito de talento vazio',
  });
export type TalentEffect = z.infer<typeof TalentEffect>;

export const Talent = z
  .object({
    id: Id,
    /** nome exibido; nos talentos-chave com dois nomes, "Esquerda / Direita" */
    name: z.string().min(1),
    /** nome de cada lado do par, quando o doc dá dois ("Couro Grosso ou Barriga Blindada") */
    nomePorArquetipo: z.partialRecord(ArchetypeRef, z.string().min(1)).optional(),
    grupo: TalentGroup,
    niveis: z.array(z.number().int().min(10)).min(1),
    dono: TalentOwner,
    /** texto exato do doc */
    descricao: z.string().min(1),
    /** efeito igual para todos os donos */
    efeito: TalentEffect.optional(),
    /** efeito por arquétipo do par (as habilidades marca diferem de um lado para o outro) */
    efeitoPorArquetipo: z.partialRecord(ArchetypeRef, TalentEffect).optional(),
    emPiloto: z.boolean(),
    ...Sugestao,
  })
  .strict()
  .superRefine((t, ctx) => {
    if (!t.efeito && !t.efeitoPorArquetipo) ctx.addIssue({ code: 'custom', message: `${t.id}: sem efeito` });
    if (t.efeito && t.efeitoPorArquetipo) ctx.addIssue({ code: 'custom', message: `${t.id}: efeito e efeitoPorArquetipo juntos` });
    const esperado = TALENT_LEVELS[t.grupo];
    if (JSON.stringify(t.niveis) !== JSON.stringify(esperado)) {
      ctx.addIssue({ code: 'custom', message: `${t.id}: niveis ${t.niveis} != ${esperado} do grupo ${t.grupo}` });
    }
    const piloto = t.niveis.some((n) => n === 10 || n === 15 || n === 20);
    if (t.emPiloto !== piloto) ctx.addIssue({ code: 'custom', message: `${t.id}: emPiloto deve ser ${piloto}` });
    if (t.dono.tipo === 'arquetipos') {
      const donos = t.dono.arquetipos as string[];
      for (const k of Object.keys(t.nomePorArquetipo ?? {})) {
        if (!donos.includes(k)) ctx.addIssue({ code: 'custom', message: `${t.id}: nome para ${k}, que não é dono` });
      }
      if (t.efeitoPorArquetipo) {
        for (const d of donos) {
          if (!(d in t.efeitoPorArquetipo)) ctx.addIssue({ code: 'custom', message: `${t.id}: falta efeito de ${d}` });
        }
      }
    } else if (t.nomePorArquetipo || t.efeitoPorArquetipo) {
      ctx.addIssue({ code: 'custom', message: `${t.id}: nome/efeito por arquétipo só em talento-chave` });
    }
  });
export type Talent = z.infer<typeof Talent>;

/** Par de arquétipos (Esquerda / Direita) com os 2 talentos-chave e a build de exemplo. */
export const KeyTalentPair = z
  .object({
    arquetipos: z.tuple([ArchetypeRef, ArchetypeRef]),
    talentoA: Id,
    talentoB: Id,
    buildExemplo: z.object({ nome: z.string().min(1), descricao: z.string().min(1) }).strict(),
    ...Sugestao,
  })
  .strict();
export type KeyTalentPair = z.infer<typeof KeyTalentPair>;

export const TalentRules = z
  .object({
    primeiroNivel: z.number().int(),
    aCadaNiveis: z.number().int().positive(),
    /** "todo talento pesa: muda uma regra, cria uma habilidade nova ou dá pelo menos 15%" */
    todoTalentoPesa: z.string(),
    pesoMinimoPct: z.number(),
    /** atributos dados pelos níveis sem talento */
    nivelSemTalento: z.object({ stats: z.array(StatMod).min(1), acumulacao: z.enum(['aditiva', 'composta']), ...Sugestao }).strict(),
    refazer: z
      .object({
        gratisAteNivel: z.number().int(),
        depois: z
          .object({
            moedas: z.array(z.enum(['semente', 'credito'])).min(1),
            onde: z.literal('qg'),
            vezesPorCiclo: z.number().int().positive(),
            custoSemente: z.number().int().positive().optional(),
            custoCredito: z.number().int().positive().optional(),
            ...Sugestao,
          })
          .strict(),
      })
      .strict(),
    talentosNoMapa: z
      .object({
        regra: z.string(),
        exemplosDoDoc: z.array(Id).min(1),
        todos: z.array(Id).min(1),
        ...Sugestao,
      })
      .strict(),
    /** raio de "perto" quando o doc não dá número, em tiles */
    raioPertoPadrao: z.number().positive(),
    ...Sugestao,
  })
  .strict();
export type TalentRules = z.infer<typeof TalentRules>;

export const TalentsFile = z
  .object({
    regras: TalentRules,
    talentos: z.array(Talent).min(1),
    paresChave: z.array(KeyTalentPair).length(12),
    // As invocações criadas por talentos (esquadrao_da_pm, manifestacao_do_guia, holograma_de_crise)
    // ficam só em summons.json; a referência é conferida em test/data.test.ts.
  })
  .strict()
  .superRefine((f, ctx) => {
    const ids = new Set<string>();
    for (const t of f.talentos) {
      if (ids.has(t.id)) ctx.addIssue({ code: 'custom', message: `talento repetido: ${t.id}` });
      ids.add(t.id);
    }
    for (const p of f.paresChave) {
      for (const tid of [p.talentoA, p.talentoB]) {
        const t = f.talentos.find((x) => x.id === tid);
        if (!t || t.grupo !== 'chave') ctx.addIssue({ code: 'custom', message: `par ${p.arquetipos}: talento-chave ${tid} não existe` });
      }
    }
    for (const id of [...f.regras.talentosNoMapa.todos, ...f.regras.talentosNoMapa.exemplosDoDoc]) {
      if (!ids.has(id)) ctx.addIssue({ code: 'custom', message: `talentosNoMapa: ${id} não existe` });
    }
  });
export type TalentsFile = z.infer<typeof TalentsFile>;
