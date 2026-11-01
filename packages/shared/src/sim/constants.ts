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
// SUGESTÃO: com o alvo automático fora do alcance do básico, troca para outro inimigo que esteja no
// alcance do básico, ou 2 tiles mais perto que o atual (folga para não ficar trocando).
export const RETARGET_CLOSER_TILES = 2;
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

// SUGESTÃO: sem grupo (partyId), o grupo implícito é quem também está sem grupo a até 12 tiles.
export const IMPLICIT_GROUP_TILES = 12;
// SUGESTÃO: o recuo ('recuo' de inimigo_mais_perto) foge do inimigo visível mais perto a até 10 tiles.
export const RETREAT_SCAN_TILES = 10;
// SUGESTÃO: seletor de alvo sem alcance nem raio na habilidade (aliado_menos_vida etc.) olha até 4 tiles.
export const SELECTOR_FALLBACK_RANGE = 4;
// SUGESTÃO: invocação nasce 1 tile à frente de quem invoca; várias de uma vez, em roda de 1,2 tile;
// o ponto precisa caber um corpo de 0,4 tile (senão nasce em cima de quem invocou).
export const SUMMON_SPAWN_TILES = 1;
export const SUMMON_RING_TILES = 1.2;
export const SUMMON_FREE_RADIUS = 0.4;
// SUGESTÃO: Desconstruído cura o aliado mais ferido a até 8 tiles (5% da vida máxima por golpe sem o parâmetro).
export const DESCONSTRUIDO_RANGE_TILES = 8;
export const DESCONSTRUIDO_HEAL_PCT_DEFAULT = 5;
// SUGESTÃO: o caminho dá o ponto por alcançado a 0,15 tile; o "tocar no chão" para a 0,1 tile do destino.
export const PATH_WAYPOINT_TILES = 0.15;
export const MOVE_TO_ARRIVE_TILES = 0.1;

// SUGESTÃO: largura do corredor de "inimigos no caminho" (avanço e tiro que atravessa), além do raio do corpo.
export const LANE_HALF_WIDTH = 0.5;

// SUGESTÃO: distância para conversar com NPC (comando interagir).
export const INTERACT_RADIUS = 2.5;
// SUGESTÃO: o botão de troca de ala (comando trocar_arquetipo) vale com o treinador da ala a até
// 5 tiles, borda a borda (a praça de treino: no mapa do protótipo o spawn fica a uns 3,4 tiles do
// Wesley e do Li Wei), e só fora de combate (sem bater nem apanhar há regenForaDeCombate.aposMs).
export const TRAINER_SWITCH_RADIUS = 5;

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
