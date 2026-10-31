import { z } from 'zod';
import { ClassId, Id, Side, Sugestao } from './common';

/**
 * Instituições, QGs e Máquinas de Visual.
 * Fonte: Sistemas.md (Instituições e classes, Missão de entrada, Patentes nas instituições,
 * Máquina de Visual, Plantão), Narrativa.md (Os lugares) e Arte.md (emblemas e paletas).
 */

export const InstitutionId = z.enum([
  'brigada_popular',
  'guarda_comunitaria',
  'escola_dos_saberes',
  'trupe_do_povo',
  'torcida_furia_neon',
  'pm_do_consorcio',
  'universidade_neon',
  'agencia_neon',
]);
export type InstitutionId = z.infer<typeof InstitutionId>;

export const HqId = z.enum(['casa_da_assembleia', 'torre_do_consorcio']);
export type HqId = z.infer<typeof HqId>;

export const Hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'cor em #RRGGBB');

/** Cor nomeada: o nome vem de Arte.md; o hex é sugestão. */
export const Swatch = z.object({ name: z.string().min(1), hex: Hex, ...Sugestao }).strict();
export type Swatch = z.infer<typeof Swatch>;

/** Encanto na Esquerda, máquina na Direita. */
export const VisualResource = z.enum(['encanto', 'maquina']);
export type VisualResource = z.infer<typeof VisualResource>;

const Predio = z
  .object({
    /** onde fica e como é o prédio (Narrativa.md) */
    descricao: z.string().min(1),
    /** id da região do mapa */
    regiao: Id,
    ...Sugestao,
  })
  .strict();

export const Institution = z
  .object({
    id: InstitutionId,
    name: z.string().min(1),
    /** nome completo quando o doc usa um mais longo (ex.: Torcida Organizada Fúria Neon) */
    nomeCompleto: z.string().min(1).optional(),
    margem: Side,
    classe: ClassId,
    qg: HqId,
    predio: Predio,
    /** id do treinador NPC que recebe os novatos e treina a base */
    baseTrainer: Id,
    /** uniforme do nível 8: nome da linha Base de Arte.md e id do traje em outfits.json */
    uniformeBase: z.object({ name: z.string().min(1), traje: Id, ...Sugestao }).strict(),
    /** as 3 alas (ids de arquétipo), na ordem tanque, dano, suporte/cura */
    alas: z.array(Id).length(3),
    missaoEntrada: z
      .object({
        id: Id.regex(/^entrada_[a-z0-9_]+$/),
        /** texto exato da tabela "Missão de entrada" */
        texto: z.string().min(1),
        ...Sugestao,
      })
      .strict(),
    /** patentes da instituição, da mais baixa para a mais alta (tabela "Patentes nas instituições") */
    patentes: z.array(z.string().min(1)).min(3),
    emblema: z.object({ descricao: z.string().min(1), ...Sugestao }).strict(),
    /** 5 cores de Arte.md, na ordem do doc; hex sugeridos */
    paleta: z.array(Swatch).length(5),
    /** cor de destaque da instituição (uma das 5 da paleta) */
    corDestaque: Swatch,
    recursoVisual: VisualResource,
    /** como os efeitos aparecem (Arte.md, regra de efeitos) */
    efeitos: z.string().min(1),
    loja: Id,
    quadroMissoes: Id,
    salaTreino: Id,
    /** porão/masmorra sob o prédio, quando o doc liga um ao outro */
    masmorra: Id.optional(),
    ...Sugestao,
  })
  .strict();
export type Institution = z.infer<typeof Institution>;

export const VisualMachineChange = z.enum([
  'corpo',
  'pele',
  'rosto',
  'cabelo',
  'cor_do_cabelo',
  'detalhes',
  'paleta_do_traje',
  'visual_mostrado',
]);
export type VisualMachineChange = z.infer<typeof VisualMachineChange>;

/**
 * Máquina de Visual: fonte única (appearance.json só guarda os ids).
 * "Em cada QG e no Delta há uma Máquina de Visual": Espelho da Benzedeira (Esquerda), Cabine Neon
 * (Direita) e uma neutra no Delta (sem margem). As falas ficam no NPC `atendente` (npcs.json,
 * grupo maquina_de_visual); os termos de uso, só aqui.
 */
export const VisualMachine = z
  .object({
    id: Id,
    name: z.string().min(1),
    /** id do QG, da região ou do lugar (places.json) onde fica */
    local: Id,
    localTipo: z.enum(['qg', 'regiao', 'lugar']),
    margem: Side.optional(),
    gratis: z.literal(true),
    semLimite: z.literal(true),
    /** o que a máquina muda */
    altera: z.array(VisualMachineChange).min(1),
    /** o que ela nunca tira */
    nuncaAltera: z.array(z.enum(['silhueta_da_ala'])).min(1),
    /** a Cabine Neon é grátis e mesmo assim mostra os termos de uso inteiros antes de abrir */
    mostraTermosAntesDeAbrir: z.boolean(),
    termosDeUso: z
      .object({
        titulo: z.string().min(1),
        clausulas: z.array(z.string().min(1)).min(1),
        /** rótulo do botão que fecha os termos */
        botao: z.string().min(1),
        /** os termos só fecham depois de rolar até o fim */
        rolarAteOFim: z.boolean(),
        ...Sugestao,
      })
      .strict()
      .optional(),
    descricao: z.string().min(1),
    /** id do NPC que cuida da máquina; as falas dele (grupo maquina_de_visual) tocam ao abrir */
    atendente: Id,
    ...Sugestao,
  })
  .strict();
export type VisualMachine = z.infer<typeof VisualMachine>;

export const HqService = z.enum([
  'maquina_de_visual',
  'loja',
  'plantao',
  'refazer_talentos',
  'escolher_habilidade_3',
  'volta_ao_cair',
  'moradia',
]);
export type HqService = z.infer<typeof HqService>;

export const Hq = z
  .object({
    id: HqId,
    name: z.string().min(1),
    margem: Side,
    predio: Predio,
    governo: z.string().min(1),
    /** patentes da margem (Membro… / Colaborador…) */
    patentesMargem: z.array(z.string().min(1)).length(4),
    moeda: z.enum(['semente', 'credito']),
    /** canal da margem: Roda ou Diretoria */
    canal: z.string().min(1),
    instituicoes: z.array(InstitutionId).length(4),
    maquinaVisual: Id,
    loja: Id,
    plantao: z
      .object({
        id: Id,
        descricao: z.string().min(1),
        /** fração do XP que o plantonista ganha */
        xpMult: z.number().min(0).max(1),
        regras: z.array(z.string().min(1)).min(1),
        ...Sugestao,
      })
      .strict(),
    servicos: z.array(HqService).min(1),
    masmorra: Id.optional(),
    ...Sugestao,
  })
  .strict();
export type Hq = z.infer<typeof Hq>;

export const InstitutionsFile = z
  .object({
    instituicoes: z.array(Institution).length(8),
    qgs: z.array(Hq).length(2),
    maquinasVisual: z.array(VisualMachine).min(2),
  })
  .strict()
  .superRefine((f, ctx) => {
    const err = (message: string) => ctx.addIssue({ code: 'custom', message });
    const ids = new Set<string>();
    for (const i of f.instituicoes) {
      if (ids.has(i.id)) err(`instituição repetida: ${i.id}`);
      ids.add(i.id);
      if (i.missaoEntrada.id !== `entrada_${i.id}`) err(`${i.id}: missão de entrada deve ser entrada_${i.id}`);
      if (!i.paleta.some((s) => s.name === i.corDestaque.name && s.hex.toLowerCase() === i.corDestaque.hex.toLowerCase())) {
        err(`${i.id}: corDestaque fora da paleta`);
      }
      const esperado = i.margem === 'esquerda' ? 'encanto' : 'maquina';
      if (i.recursoVisual !== esperado) err(`${i.id}: recursoVisual deve ser ${esperado}`);
      const qg = f.qgs.find((q) => q.id === i.qg);
      if (!qg) err(`${i.id}: QG ${i.qg} não existe`);
      else if (qg.margem !== i.margem) err(`${i.id}: QG de outra margem`);
      if (new Set(i.alas).size !== 3) err(`${i.id}: alas repetidas`);
    }
    const classes = new Map<string, number>();
    for (const i of f.instituicoes) classes.set(`${i.margem}:${i.classe}`, (classes.get(`${i.margem}:${i.classe}`) ?? 0) + 1);
    for (const [k, n] of classes) if (n !== 1) err(`classe repetida na margem: ${k}`);
    const maquinas = new Set(f.maquinasVisual.map((m) => m.id));
    for (const q of f.qgs) {
      if (!maquinas.has(q.maquinaVisual)) err(`${q.id}: máquina de visual ${q.maquinaVisual} não existe`);
      for (const inst of q.instituicoes) {
        const i = f.instituicoes.find((x) => x.id === inst);
        if (!i || i.margem !== q.margem || i.qg !== q.id) err(`${q.id}: instituição ${inst} não pertence a este QG`);
      }
    }
    for (const m of f.maquinasVisual) {
      if (m.mostraTermosAntesDeAbrir && !m.termosDeUso) err(`${m.id}: mostra termos mas não tem termosDeUso`);
      if (m.localTipo === 'qg' && !f.qgs.some((q) => q.id === m.local)) err(`${m.id}: QG ${m.local} não existe`);
      if (m.localTipo === 'qg' && !m.margem) err(`${m.id}: máquina de QG precisa de margem`);
    }
    // uma por QG e uma neutra no Delta
    if (f.maquinasVisual.filter((m) => !m.margem).length !== 1) err('esperada exatamente 1 Máquina de Visual neutra (a do Delta)');
  });
export type InstitutionsFile = z.infer<typeof InstitutionsFile>;
