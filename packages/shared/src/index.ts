export const GAME_NAME = 'Ponte que Partiu';
export const TILE = 32;

// Esquemas zod e tipos de todos os domínios.
export * from './schema';
// Carregador tipado: getData() e helpers por id.
export * from './data';

// sim/, map/ e net/ ficam nos subcaminhos (@pqp/shared/sim/types etc.): o tipo EnemyTier da
// simulação tem o mesmo nome do esquema de inimigos.
