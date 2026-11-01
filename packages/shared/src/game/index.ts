/**
 * Regras de jogo da Fase 2, compartilhadas pelo servidor e pelo servidor local do cliente.
 * Importe por '@pqp/shared/game/index' (ou os módulos soltos, '@pqp/shared/game/missions' etc.).
 */
export * from './types';
export * from './flags';
export * from './appearance';
export * from './visual';
export * from './record';
export * from './progression';
export * from './tutorial';
export * from './missions';
export * from './travessia';
export * from './dialog';
// Fase 3: instituições, ala, talentos, guias, treinadores e patentes
export * from './people';
export * from './ranks';
export * from './guides';
export * from './trainers';
export * from './ala';
export * from './talents';
export * from './institutions';
export * from './combatKit';
// Fase 4: carteira, lojas, feira e app, câmbio, moradia e ciclo da cidade
export * from './economy';
export * from './shop';
export * from './market';
export * from './exchange';
export * from './housing';
export * from './city';
// Fase 5: itens (comum, raro e únicos), equipamento, benzimento e calibração
export * from './items';
export * from './equipment';
// Fase 5: influência, pontos de controle e IA de facção
export * from './influence';
export * from './faction';
// Fase 5: masmorra, plantão e encontros com IA
export * from './dungeon';
export * from './duty';
export * from './encounters';
