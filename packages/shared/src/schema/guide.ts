import { z } from 'zod';
import { Id, Side, Sugestao } from './common';
import { Passive } from './ability';

/**
 * Guias: espíritos (Esquerda) e IAs de bolso (Direita), recebidos na travessia (nível 8).
 * Falam nas missões, dão dicas, comentam o que você faz e dão um bônus pequeno.
 * Qualquer classe pode escolher qualquer um da sua margem.
 */

export const GuideKind = z.enum(['espirito', 'ia_de_bolso']);
export type GuideKind = z.infer<typeof GuideKind>;

/** Situações em que o guia fala. */
export const GuideLineSituation = z.enum([
  'saudacao',
  'dica_combate',
  'pouca_vida',
  'vitoria',
  'derrota',
  'missao',
  'aleatoria',
  'bonus', // quando o bônus do guia dispara
  'anuncio', // anúncio patrocinado (IAs, sobretudo o Byte)
  'meta', // metas da Capitã
  'chance_de_morrer', // cálculo em voz alta da Mira
  'upgrade', // oferta de upgrade da Faísca
  'segredo', // segredo do mapa revelado (Byte)
  'some', // o guia some (Curupira quando você derruba árvore)
  'volta', // o guia volta
]);
export type GuideLineSituation = z.infer<typeof GuideLineSituation>;

export const GuideLine = z
  .object({
    situacao: GuideLineSituation,
    texto: z.string().min(1),
    /** variáveis entre chaves no texto, preenchidas pelo jogo: {nome}, {chance}, {meta}, {inimigos} */
    variaveis: z.array(z.string().regex(/^[a-zA-Z]+$/)).optional(),
    ...Sugestao,
  })
  .strict()
  .superRefine((l, ctx) => {
    const usadas = [...l.texto.matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]!);
    for (const u of usadas) {
      if (!l.variaveis?.includes(u)) ctx.addIssue({ code: 'custom', message: `fala usa {${u}} sem declarar em variaveis` });
    }
  });
export type GuideLine = z.infer<typeof GuideLine>;

/** Regra de comportamento do guia fora do bônus (Curupira some quando você derruba árvore). */
export const GuideBehavior = z
  .object({
    gancho: Id,
    descricao: z.string().min(1),
    params: z.record(z.string(), z.unknown()).optional(),
    ...Sugestao,
  })
  .strict();
export type GuideBehavior = z.infer<typeof GuideBehavior>;

export const Guide = z
  .object({
    id: Id,
    name: z.string().min(1),
    tipo: GuideKind,
    margem: Side,
    /** de onde vem a história (só espíritos) */
    origem: z.string().min(1).optional(),
    /** texto exato do bônus no doc */
    bonusTexto: z.string().min(1),
    bonus: z.array(Passive).min(1),
    /** como fica o bônus com o talento Pacto (nível 55): "o bônus dobra" */
    pacto: z.array(Passive).min(1),
    /** jeito de falar, exato do doc */
    jeitoDeFalar: z.string().min(1),
    comportamentos: z.array(GuideBehavior).default([]),
    falas: z.array(GuideLine).min(8),
    visual: z.string().optional(),
    ...Sugestao,
  })
  .strict()
  .superRefine((g, ctx) => {
    if (g.tipo === 'espirito' && g.margem !== 'esquerda') ctx.addIssue({ code: 'custom', message: `${g.id}: espírito é da Esquerda` });
    if (g.tipo === 'ia_de_bolso' && g.margem !== 'direita') ctx.addIssue({ code: 'custom', message: `${g.id}: IA de bolso é da Direita` });
    if (g.tipo === 'espirito' && !g.origem) ctx.addIssue({ code: 'custom', message: `${g.id}: espírito sem origem` });
    const base: GuideLineSituation[] = ['saudacao', 'dica_combate', 'pouca_vida', 'vitoria', 'derrota', 'missao', 'aleatoria'];
    for (const s of base) {
      if (!g.falas.some((f) => f.situacao === s)) ctx.addIssue({ code: 'custom', message: `${g.id}: falta fala de ${s}` });
    }
  });
export type Guide = z.infer<typeof Guide>;

/** Evoluções do nível 55 (talentos do grupo 'guia' em talents.json). */
export const GuideEvolution = z
  .object({
    talento: Id,
    name: z.string().min(1),
    descricao: z.string().min(1),
    ...Sugestao,
  })
  .strict();
export type GuideEvolution = z.infer<typeof GuideEvolution>;

export const GuidesFile = z
  .object({
    regras: z
      .object({
        nivelRecebe: z.number().int(),
        esquerda: z.string().min(1),
        direita: z.string().min(1),
        qualquerClasse: z.boolean(),
        oQueFazem: z.string().min(1),
        /** intervalo mínimo entre falas aleatórias, em segundos */
        intervaloFalaAleatoriaS: z.number().positive(),
        ...Sugestao,
      })
      .strict(),
    evolucoes: z.array(GuideEvolution).length(3),
    guias: z.array(Guide).length(16),
    // A invocação do bônus de guia (raposa_ilusao, da Kitsune) fica só em summons.json;
    // a referência é conferida em test/data.test.ts.
  })
  .strict()
  .superRefine((f, ctx) => {
    const ids = new Set<string>();
    for (const g of f.guias) {
      if (ids.has(g.id)) ctx.addIssue({ code: 'custom', message: `guia repetido: ${g.id}` });
      ids.add(g.id);
    }
    if (f.guias.filter((g) => g.tipo === 'espirito').length !== 12) ctx.addIssue({ code: 'custom', message: 'são 12 espíritos' });
    if (f.guias.filter((g) => g.tipo === 'ia_de_bolso').length !== 4) ctx.addIssue({ code: 'custom', message: 'são 4 IAs de bolso' });
  });
export type GuidesFile = z.infer<typeof GuidesFile>;
