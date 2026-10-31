import { z } from 'zod';

/** IDs em snake_case ASCII sem acento. */
export const Id = z.string().regex(/^[a-z0-9_]+$/, 'id deve ser snake_case ASCII');
export type Id = z.infer<typeof Id>;

export const Side = z.enum(['esquerda', 'direita']);
export type Side = z.infer<typeof Side>;

export const ClassId = z.enum(['combatente', 'atirador', 'elemental', 'mascarado']);
export type ClassId = z.infer<typeof ClassId>;

export const Role = z.enum(['tanque', 'dano', 'suporte', 'cura']);
export type Role = z.infer<typeof Role>;

/**
 * Marcação de sugestão: o que não está nos docs.
 * `sugestao: true` = entrada inteira inventada; `sugestaoCampos` = só esses campos.
 */
export const Sugestao = {
  sugestao: z.boolean().optional(),
  sugestaoCampos: z.array(z.string()).optional(),
};

/** Texto com variante por margem (Encanto na Esquerda, máquina na Direita). */
export const BySide = <T extends z.ZodTypeAny>(t: T) => z.object({ esquerda: t, direita: t });

export const Palette = z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(3).max(8);
