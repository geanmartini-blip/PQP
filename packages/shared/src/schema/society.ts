import { z } from 'zod';
import { Id, Side, Sugestao } from './common';
import { Passive } from './ability';

/**
 * Sociedades das duas margens (Raízes e Consórcio Neon), patentes da margem, canais,
 * cargos da margem e posições de missão. Fonte: Sistemas.md, "As duas sociedades" e
 * "Hierarquia e cargos".
 */

export const Moeda = z.enum(['semente', 'credito']);
export type Moeda = z.infer<typeof Moeda>;

/** Patentes do jogador na margem (não confundir com as patentes de cada instituição). */
export const PatenteId = z.enum([
  'membro',
  'militante',
  'conselheiro',
  'comissario',
  'colaborador',
  'parceiro',
  'gerente',
  'diretor',
]);
export type PatenteId = z.infer<typeof PatenteId>;

export const PatenteMargem = z
  .object({
    id: PatenteId,
    name: z.string().min(1),
    /** 1 = a primeira */
    ordem: z.number().int().positive(),
    /** reputação mínima na margem para chegar nela */
    reputacaoMin: z.number().int().nonnegative(),
    /** o que a patente libera (lojas, moradias, cargos e extras) */
    libera: z
      .object({
        /** nível da loja de NPC da margem e das instituições liberado (1 a 4) */
        lojaNivel: z.number().int().min(1).max(4),
        moradias: z.array(Id),
        cargos: z.array(Id),
        extras: z.array(z.string()),
        ...Sugestao,
      })
      .strict(),
    piada: z.string().optional(),
    foraDoPiloto: z.boolean().optional(),
    ...Sugestao,
  })
  .strict();
export type PatenteMargem = z.infer<typeof PatenteMargem>;

export const AspectoId = z.enum([
  'governo',
  'patentes',
  'qg',
  'moeda',
  'comercio',
  'moradia',
  'trabalho',
  'lei',
  'saude',
  'educacao',
  'midia',
  'lazer',
  'piada',
]);
export type AspectoId = z.infer<typeof AspectoId>;

export const FonteReputacao = z
  .object({
    id: Id,
    name: z.string().min(1),
    reputacao: z.number().int(),
    ...Sugestao,
  })
  .strict();

export const Sociedade = z
  .object({
    id: z.enum(['raizes', 'consorcio_neon']),
    name: z.string().min(1),
    side: Side,
    qg: z.enum(['casa_da_assembleia', 'torre_do_consorcio']),
    qgName: z.string().min(1),
    moeda: Moeda,
    /** canal da margem em que o jogador entra ao escolher o lado */
    canalMargem: z.enum(['roda', 'diretoria']),
    instituicoes: z.array(Id).length(4),
    /** a tabela "As duas sociedades", texto fiel ao doc */
    aspectos: z.record(AspectoId, z.string().min(1)),
    /** detalhamento de cada aspecto para o jogo (sugestão quando marcado) */
    detalhes: z
      .array(
        z
          .object({
            aspecto: AspectoId,
            texto: z.string().min(1),
            ...Sugestao,
          })
          .strict(),
      )
      .optional(),
    patentes: z.array(PatenteMargem).length(4),
    reputacao: z
      .object({
        descricao: z.string(),
        fontes: z.array(FonteReputacao),
        ...Sugestao,
      })
      .strict(),
    ...Sugestao,
  })
  .strict();
export type Sociedade = z.infer<typeof Sociedade>;

export const Canal = z
  .object({
    id: z.enum(['roda', 'diretoria', 'instituicao', 'equipe', 'regiao', 'praca', 'radio']),
    name: z.string().min(1),
    /** null = vale para as duas margens */
    side: Side.nullable(),
    escopo: z.enum(['margem', 'instituicao', 'equipe', 'regiao', 'cidade', 'transmissao']),
    descricao: z.string().min(1),
    /** quem pode falar; os demais só leem */
    quemFala: z.string().min(1),
    /** chat por Supabase Realtime */
    realtime: z.boolean(),
    foraDoPiloto: z.boolean().optional(),
    ...Sugestao,
  })
  .strict();
export type Canal = z.infer<typeof Canal>;

export const SocietiesFile = z
  .object({
    sociedades: z.array(Sociedade).length(2),
    canais: z.array(Canal),
  })
  .strict();
export type SocietiesFile = z.infer<typeof SocietiesFile>;

/* ------------------------------------------------------------------ */
/* Cargos da margem e posições de missão (roles.json)                   */
/* ------------------------------------------------------------------ */

export const FuncaoCargo = z.enum(['lideranca', 'operacoes', 'logistica', 'obras', 'comunicacao', 'inteligencia']);
export type FuncaoCargo = z.infer<typeof FuncaoCargo>;

export const Poder = z
  .object({
    id: Id,
    descricao: z.string().min(1),
    /** opções de escolha, quando o poder é uma escolha (ex.: prioridade da semana) */
    opcoes: z.array(Id).optional(),
    /** quantas vezes por ciclo */
    porCiclo: z.number().int().positive().optional(),
    foraDoPiloto: z.boolean().optional(),
    ...Sugestao,
  })
  .strict();

export const Cargo = z
  .object({
    id: Id,
    name: z.string().min(1),
    side: Side,
    funcao: FuncaoCargo,
    /** "O que faz", fiel à tabela */
    oQueFaz: z.string().min(1),
    patenteMin: PatenteId,
    poderes: z.array(Poder),
    /** personagem de IA que ocupa o cargo quando não há jogador (fora do piloto) */
    iaPadrao: Id,
    ...Sugestao,
  })
  .strict();
export type Cargo = z.infer<typeof Cargo>;

export const Funcao = z
  .object({
    id: FuncaoCargo,
    name: z.string().min(1),
    oQueFaz: z.string().min(1),
    ...Sugestao,
  })
  .strict();

export const ComoSeChega = z
  .object({
    side: Side,
    metodo: z.enum(['votacao_assembleia', 'participacao']),
    texto: z.string().min(1),
    frequencia: z.literal('semanal'),
    /** componentes da pontuação de participação (Consórcio) */
    componentes: z.array(z.object({ id: Id, name: z.string(), peso: z.number().nonnegative(), ...Sugestao }).strict()).optional(),
    umJogadorUmVoto: z.boolean().optional(),
    /** quem tem ações vota mais (Consórcio): votos extras por ação */
    votosPorAcao: z.number().nonnegative().optional(),
    foraDoPiloto: z.boolean(),
    ...Sugestao,
  })
  .strict();

export const PosicaoMissao = z
  .object({
    id: z.enum(['comandante_da_operacao', 'linha_de_frente', 'atiradores', 'engenharia', 'medico_de_campo', 'radio']),
    name: z.string().min(1),
    /** bônus fiel à tabela */
    bonus: z.string().min(1),
    /** como o bônus entra no motor */
    passivo: Passive,
    /** vagas por grupo de 4 (missões de grupo) */
    vagas: z.number().int().positive(),
    ...Sugestao,
  })
  .strict();
export type PosicaoMissao = z.infer<typeof PosicaoMissao>;

export const RolesFile = z
  .object({
    renovacao: z.string().min(1),
    semJogador: z.string().min(1),
    funcoes: z.array(Funcao).length(6),
    cargos: z.array(Cargo).length(12),
    comoSeChega: z.array(ComoSeChega).length(2),
    posicoes: z
      .object({
        regras: z.array(z.string().min(1)),
        lista: z.array(PosicaoMissao).length(6),
      })
      .strict(),
    foraDoPiloto: z.array(z.string()),
  })
  .strict();
export type RolesFile = z.infer<typeof RolesFile>;
