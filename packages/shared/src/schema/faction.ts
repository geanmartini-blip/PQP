import { z } from 'zod';
import { Id, Side, Sugestao, BySide } from './common';
import { FuncaoCargo } from './society';

/**
 * IA de facção com personalidade e propaganda.
 * Fonte: Sistemas.md ("IA com personalidade", "Propaganda") e Narrativa.md ("Personagens").
 */

export const PerfilId = z.enum(['agressivo', 'defensivo', 'construtor', 'propagandista', 'logistico', 'oportunista']);
export type PerfilId = z.infer<typeof PerfilId>;

/** O que a liderança de IA pode fazer num ciclo de produção. */
export const AcaoIa = z.enum([
  'construir',
  'energia_limpa',
  'reforcar',
  'emboscada',
  'invadir',
  'arena',
  'cartaz',
  'radio',
  'boato',
  'comboio',
  'deposito',
  'comercio',
  'sabotagem',
  'chantagem',
  'escandalo',
  'poupar',
]);
export type AcaoIa = z.infer<typeof AcaoIa>;

/** Pesos de decisão: 0 a 10 por ação. */
export const Pesos = z.record(AcaoIa, z.number().min(0).max(10));
export const AjustePesos = z.partialRecord(AcaoIa, z.number().min(-10).max(10));

export const AcaoInfo = z
  .object({
    id: AcaoIa,
    name: z.string().min(1),
    efeitoNoMapa: z.string().min(1),
    /** custo em recursos do depósito da margem, em % do que ele guarda */
    custoPct: z.number().min(0).max(100),
    /** a ação só vale fora do piloto (comboios, arenas) */
    foraDoPiloto: z.boolean().optional(),
    ...Sugestao,
  })
  .strict();

const Frases = BySide(z.array(z.string().min(1)).min(1));

export const PerfilIa = z
  .object({
    id: PerfilId,
    name: z.string().min(1),
    /** texto exato da tabela */
    prioriza: z.string().min(1),
    evita: z.string().min(1),
    acoesPrioriza: z.array(AcaoIa).min(1),
    acoesEvita: z.array(AcaoIa),
    pesosBase: Pesos,
    /** a personalidade aparece: rádio (telões na Direita), cartaz e fala dos NPCs */
    frases: z
      .object({
        radio: Frases,
        cartaz: Frases,
        falaNpc: Frases,
      })
      .strict(),
    ...Sugestao,
  })
  .strict();
export type PerfilIa = z.infer<typeof PerfilIa>;

export const PersonagemIa = z
  .object({
    id: Id,
    name: z.string().min(1),
    side: Side,
    /** texto exato de Narrativa.md */
    quemE: z.string().min(1),
    perfil: PerfilId,
    /** cargo que ocupa quando todos os cargos estão com IA (fora do piloto) */
    cargoPadrao: FuncaoCargo,
    /** cargo no piloto; null = bastidores */
    cargoNoPiloto: FuncaoCargo.nullable(),
    comandaNoPiloto: z.boolean(),
    /** soma aos pesos do perfil */
    ajustes: AjustePesos,
    podeTrocarDeMargem: z.boolean(),
    especial: z
      .object({
        gancho: Id,
        descricao: z.string().min(1),
        params: z.record(z.string(), z.unknown()).optional(),
        ...Sugestao,
      })
      .strict()
      .optional(),
    /** também é treinador NPC (ex.: Mei Lin Zhao) */
    tambemTreinador: Id.optional(),
    fala: z.string().optional(),
    ...Sugestao,
  })
  .strict();
export type PersonagemIa = z.infer<typeof PersonagemIa>;

export const FactionAiFile = z
  .object({
    acoes: z.array(AcaoInfo).min(1),
    perfis: z.array(PerfilIa).length(6),
    personagens: z.array(PersonagemIa).length(12),
    regras: z
      .object({
        decisao: z
          .object({
            descricao: z.string(),
            quando: z.string(),
            cicloProducaoMin: z.number().positive(),
            acoesPorCiclo: z.number().int().positive(),
            formula: z.string(),
            /** multiplicador nos pesos conforme a prioridade da semana */
            prioridadeDaSemana: z.record(
              z.enum(['construir', 'defender', 'invadir']),
              z.object({ acoes: z.array(AcaoIa), mult: z.number().positive(), ...Sugestao }).strict(),
            ),
            evitaMult: z.number().min(0).max(1),
            ...Sugestao,
          })
          .strict(),
        comJogadorNoCargo: z
          .object({
            modo: z.literal('so_sugere'),
            descricao: z.string(),
            ...Sugestao,
          })
          .strict(),
        limiteDiario: z
          .object({
            descricao: z.string(),
            influenciaPorRegiao: z.number().positive(),
            influenciaTotal: z.number().positive(),
            opiniaoPorRegiao: z.number().positive(),
            estruturasNovas: z.number().int().nonnegative(),
            cartazes: z.number().int().nonnegative(),
            ataques: z.number().int().nonnegative(),
            gastoDepositoPct: z.number().min(0).max(100),
            /** saque máximo de 20% de um depósito (doc) */
            saqueMaxDepositoPct: z.literal(20),
            ...Sugestao,
          })
          .strict(),
        rotacao: z
          .object({
            descricao: z.string(),
            quando: z.string(),
            pesoDesempenho: z.number().min(0).max(1),
            pesoSorteio: z.number().min(0).max(1),
            desempenho: z.string(),
            jogadorConquista: z.string(),
            oportunistaTrocaMargemPct: z.number().min(0).max(100),
            foraDoPiloto: z.boolean(),
            ...Sugestao,
          })
          .strict(),
        escandalos: z
          .object({
            descricao: z.string(),
            opiniaoMargem: z.number(),
            bastidoresCiclos: z.number().int().positive(),
            ...Sugestao,
          })
          .strict(),
        personalidadeAparece: z.string(),
      })
      .strict(),
    piloto: z
      .object({
        descricao: z.string(),
        comando: z.object({ esquerda: Id, direita: Id, ...Sugestao }).strict(),
        demaisCargos: z.string(),
        ...Sugestao,
      })
      .strict(),
  })
  .strict();
export type FactionAiFile = z.infer<typeof FactionAiFile>;

/* ------------------------------------------------------------------ */
/* Propaganda (propaganda.json)                                         */
/* ------------------------------------------------------------------ */

export const Frase = z
  .object({
    id: Id,
    texto: z.string().min(1),
    /** null = as duas margens (Eco) */
    side: Side.nullable(),
    fonte: z.enum(['cartaz', 'radio_do_povo', 'telao_agencia', 'eco', 'lider']),
    autor: Id.optional(),
    perfil: PerfilId.optional(),
    /** só toca depois desse marco da história (story_flag) */
    depoisDe: Id.optional(),
    /** frase em par com outra (mesmas palavras em ordem diferente) */
    par: Id.optional(),
    ...Sugestao,
  })
  .strict();
export type Frase = z.infer<typeof Frase>;

export const PropagandaFile = z
  .object({
    regras: z
      .object({
        descricao: z.array(z.string().min(1)),
        cartaz: z
          .object({
            opiniaoPorCartaz: z.number().positive(),
            duracaoH: z.number().positive(),
            maxPorRegiaoPorMargem: z.number().int().positive(),
            oficialMult: z.number().positive(),
            patrulhaArranca: z.boolean(),
            ...Sugestao,
          })
          .strict(),
        radio: z
          .object({
            opiniaoPorHoraPorTorre: z.number().positive(),
            alcanceRegioes: z.number().int().nonnegative(),
            fraseACadaMin: z.number().positive(),
            ...Sugestao,
          })
          .strict(),
        /**
         * lição que deixa cartazes e rádio mais fortes (Arquivo da Ilha do Farol). O bônus é o do degrau
         * atual do jogador em lessons.json (gancho propaganda_forca), não um número daqui.
         */
        licaoArquivoDoFarol: Id,
        escandalo: z.object({ descricao: z.string(), ...Sugestao }).strict(),
        eco: z
          .object({
            descricao: z.string(),
            horario: z.object({ inicio: z.string(), fim: z.string() }).strict(),
            revelaPorNoite: z.number().int().nonnegative(),
            ...Sugestao,
          })
          .strict(),
      })
      .strict(),
    cartazes: z.array(Frase).min(6),
    radioDoPovo: z.array(Frase).min(1),
    teloesAgencia: z.array(Frase).min(1),
    eco: z.array(Frase).min(1),
    lideres: z.array(Frase),
  })
  .strict();
export type PropagandaFile = z.infer<typeof PropagandaFile>;
