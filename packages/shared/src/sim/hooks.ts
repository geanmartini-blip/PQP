/**
 * Registro de ganchos: regras especiais com nome estável, chamadas pelo efeito 'gancho' das
 * habilidades (e das fases de chefe). Gancho sem registro usa o padrão, que não faz nada.
 * Os ganchos embutidos ficam em builtinHooks.ts.
 */
import type { Ability, Effect } from '../schema/ability';
import type { Entity, Vec, World } from './types';

export interface HookContext {
  w: World;
  /** quem lançou (ou o chefe que entrou na fase) */
  caster: Entity;
  ability?: Ability;
  effect: Extract<Effect, { kind: 'gancho' }>;
  /** alvos já escolhidos pelo seletor do efeito */
  targets: Entity[];
  /** ponto de efeito */
  point: Vec;
  params: Record<string, unknown>;
}

export type HookFn = (ctx: HookContext) => void;

/** Padrão: não faz nada. */
export const noopHook: HookFn = () => {};

const registry = new Map<string, HookFn>();

/** Registra (ou troca) um gancho pelo nome. */
export function registerHook(name: string, fn: HookFn): void {
  registry.set(name, fn);
}

/** O gancho registrado, ou o padrão que não faz nada. */
export function getHook(name: string): HookFn {
  return registry.get(name) ?? noopHook;
}

export const hasHook = (name: string) => registry.has(name);
export const hookNames = () => Array.from(registry.keys()).sort();
