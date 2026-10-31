import { z } from 'zod';
import { BySide, ClassId, Id, Role, Sugestao } from './common';

/**
 * Classes (Sistemas.md, "As classes" e "Habilidades da classe").
 * Combatente causa impacto, Atirador perfurante, Elemental energia e Mascarado espírito.
 */

export const ClassDamageType = z.enum(['impacto', 'perfurante', 'energia', 'espirito']);
export type ClassDamageType = z.infer<typeof ClassDamageType>;

/** Recurso da classe numa margem (Fôlego, Munição, Espírito ou Bateria, Foco). */
export const ClassResource = z
  .object({
    id: Id,
    name: z.string().min(1),
    max: z.number().positive(),
    /** regeneração contínua, em pontos por segundo (em combate e fora) */
    regenPorS: z.number().nonnegative(),
    /** pontos ganhos a cada acerto do ataque básico */
    ganhoPorAcertoBasico: z.number().nonnegative().optional(),
    /** pontos ganhos por 1% da vida máxima perdida */
    ganhoPorPctVidaPerdida: z.number().nonnegative().optional(),
    description: z.string().min(1),
    ...Sugestao,
  })
  .strict();
export type ClassResource = z.infer<typeof ClassResource>;

/** Uma ala da classe: o par de arquétipos (Esquerda / Direita) de um papel. */
export const ClassWing = z
  .object({
    papel: Role,
    esquerda: Id,
    direita: Id,
  })
  .strict();
export type ClassWing = z.infer<typeof ClassWing>;

export const ClassDef = z
  .object({
    id: ClassId,
    name: z.string().min(1),
    damageType: ClassDamageType,
    resource: BySide(ClassResource).strict(),
    description: BySide(z.string().min(1)).strict(),
    institution: BySide(Id).strict(),
    /** as 4 habilidades comuns da classe, na ordem da tabela */
    abilities: z.array(Id).length(4),
    basicAttack: Id,
    special: Id,
    /** as 3 alas (papel -> arquétipo de cada margem), na ordem da tabela dos 24 arquétipos */
    wings: z.array(ClassWing).length(3),
    /** níveis 8 a 11: os 3 botões são habilidades da classe */
    loadoutPreAla: z
      .object({
        nivelMin: z.literal(8),
        nivelMax: z.literal(11),
        botoes: z.tuple([Id, Id, Id]),
        ...Sugestao,
      })
      .strict(),
    /** a partir do 12, o botão 3 começa com esta habilidade (o jogador troca no QG) */
    slot3Padrao: Id,
    /** sugestão de botão 3 por papel, mostrada no QG */
    slot3PorPapel: z
      .object({
        tanque: Id.optional(),
        dano: Id.optional(),
        suporte: Id.optional(),
        cura: Id.optional(),
      })
      .strict()
      .optional(),
    ...Sugestao,
  })
  .strict()
  .superRefine((c, ctx) => {
    const own = new Set(c.abilities);
    if (own.size !== 4) ctx.addIssue({ code: 'custom', message: `${c.id}: habilidades repetidas` });
    const b = c.loadoutPreAla.botoes;
    if (new Set(b).size !== 3) ctx.addIssue({ code: 'custom', message: `${c.id}: botões pré-ala repetidos` });
    for (const id of b) if (!own.has(id)) ctx.addIssue({ code: 'custom', message: `${c.id}: botão pré-ala ${id} não é da classe` });
    if (!own.has(c.slot3Padrao)) ctx.addIssue({ code: 'custom', message: `${c.id}: slot3Padrao ${c.slot3Padrao} não é da classe` });
    for (const [papel, id] of Object.entries(c.slot3PorPapel ?? {})) {
      if (id && !own.has(id)) ctx.addIssue({ code: 'custom', message: `${c.id}: slot3PorPapel.${papel} não é da classe` });
    }
  });
export type ClassDef = z.infer<typeof ClassDef>;

export const ClassesFile = z
  .array(ClassDef)
  .length(4)
  .superRefine((cs, ctx) => {
    const ids = new Set(cs.map((c) => c.id));
    if (ids.size !== 4) ctx.addIssue({ code: 'custom', message: 'classes repetidas' });
  });
export type ClassesFile = z.infer<typeof ClassesFile>;
