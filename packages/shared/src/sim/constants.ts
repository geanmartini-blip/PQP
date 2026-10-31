/**
 * Números do núcleo da simulação que não estão em balance.json.
 * Tudo o que vem dos docs é lido de balance.json (getData().balance); o que está aqui é sugestão.
 */
import { getData } from '../data';

/** Atalho para balance.json. */
export const bal = () => getData().balance;

// SUGESTÃO: raio do corpo do jogador e dos companheiros (boneco 32x48 → uns 22 px de largura).
export const PLAYER_RADIUS = 0.35;
// SUGESTÃO: raio do corpo de NPC neutro e do saque no chão.
export const NPC_RADIUS = 0.35;
export const LOOT_RADIUS = 0.25;
// SUGESTÃO: raio do corpo das invocações.
export const SUMMON_RADIUS = 0.4;

// SUGESTÃO: zona morta do joystick (fração do curso).
export const JOYSTICK_DEADZONE = 0.15;

// SUGESTÃO: alcance da trava automática do jogador e dos companheiros (tiles).
export const ACQUIRE_RADIUS = 8;
// SUGESTÃO: o alvo automático cai quando passa disto (tiles).
export const DROP_RADIUS = 11;
// SUGESTÃO: o alvo escolhido por toque cai depois de 2 s fora de vista.
export const MANUAL_TARGET_LOSE_MS = 2000;
// SUGESTÃO: "inimigos à vista" das viradas = até 10 tiles com linha de visão.
export const VIEW_RADIUS = 10;

// SUGESTÃO: inimigo percebe o jogador a 7 tiles (chefe a 10) e desiste a 15 tiles do ponto onde nasceu.
export const AGGRO_RADIUS = 7;
export const AGGRO_RADIUS_BOSS = 10;
export const LEASH_RADIUS = 15;
// SUGESTÃO: a IA recalcula o caminho a cada 0,5 s.
export const REPATH_TICKS = 10;

// SUGESTÃO: habilidade pedida fora do alcance espera 3 s pelo alcance; depois desiste.
export const PENDING_CAST_MS = 3000;

// SUGESTÃO: largura do corredor de "inimigos no caminho" (avanço e tiro que atravessa), além do raio do corpo.
export const LANE_HALF_WIDTH = 0.5;

// SUGESTÃO: distância para conversar com NPC (comando interagir).
export const INTERACT_RADIUS = 2.5;

// SUGESTÃO: participa do XP quem bateu no inimigo nos últimos 30 s ou estava a até 10 tiles quando ele caiu.
export const XP_PARTICIPATION_MS = 30000;
export const XP_PARTICIPATION_RADIUS = 10;

// SUGESTÃO: saque no chão some depois de 60 s.
export const LOOT_LIFETIME_MS = 60000;

// SUGESTÃO: redução de dano somada para no máximo 80%.
export const MAX_DAMAGE_REDUCTION_PCT = 80;

// SUGESTÃO: o banco de carga do Especial guarda no máximo 10 s de teto.
export const SPECIAL_BANK_MAX_S = 10;

// SUGESTÃO: poções no botão de item do personagem template do protótipo.
export const START_POTIONS = 3;

// SUGESTÃO: histórico de posições guardado (8 ticks = 400 ms, acima dos 300 ms pedidos e dos 250 ms de compensação).
export const HISTORY_TICKS = 8;

// SUGESTÃO: separação suave entre inimigos (para o bando não virar um ponto só), em tiles por tick.
export const ENEMY_SEPARATION_PER_TICK = 0.04;
