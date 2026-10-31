/**
 * Todos os esquemas zod do pacote compartilhado, um arquivo por domínio.
 * Os tipos TS saem deles (z.infer). Nomes que colidem entre domínios são resolvidos aqui.
 */
export * from './common';
export * from './ability';
export * from './class';
export * from './balance';
export * from './enemy';
export * from './talent';
export * from './guide';
export * from './progression';
export * from './institution';
export * from './archetype';
export * from './outfit';
export * from './npc';
export * from './appearance';
export * from './society';
export * from './economy';
export * from './housing';
export * from './faction';
export * from './item';
export * from './world';
export * from './mission';
export * from './dungeon';

// `Hex` existe em institution.ts e appearance.ts (mesma regra, maiúsculas ou minúsculas).
export { Hex } from './institution';
export { Hex as AppearanceHex } from './appearance';
