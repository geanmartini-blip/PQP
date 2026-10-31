/**
 * Contrato da simulação de combate em tempo real (servidor autoritativo, simulador e previsão).
 * Passo fixo de 50 ms (20 ticks/s). Unidade: tile. Ângulo em radianos, 0 = direita, sentido horário (y para baixo).
 * Nada aqui usa Math.random ou Date: use world.rng e world.tick.
 */
import type { TileMap } from '../map/types';

export const TICK_RATE = 20;
export const TICK_MS = 50;
export const msToTicks = (ms: number) => Math.round(ms / TICK_MS);

export interface Vec {
  x: number;
  y: number;
}

/** 0 = baixo (frente), 1 = esquerda, 2 = cima (costas), 3 = direita */
export type Facing = 0 | 1 | 2 | 3;

export type Team = 'aliados' | 'inimigos' | 'neutros';
export type EntityKind = 'player' | 'npc' | 'enemy' | 'summon' | 'loot';
export type EnemyTier = 'normal' | 'elite' | 'chefe';

export interface Rng {
  next(): number; // [0, 1)
  int(min: number, maxInclusive: number): number;
  pick<T>(arr: readonly T[]): T;
  state(): number;
}

/** Atributos de combate depois de nível, itens, talentos, guia e lugar. */
export interface CombatStats {
  hpMax: number;
  attack: number;
  defense: number;
  /** Velocidade da tabela (ataque, recarga e deslocamento) */
  speed: number;
  /** alcance do básico em tiles */
  range: number;
  moveSpeed: number; // tiles/s
  attackIntervalMs: number;
  critChance: number; // 0-1
  critDamage: number; // multiplicador, ex. 1.5
  evasion: number; // 0-1
  resourceMax: number;
  resourceRegenPerS: number;
  /** multiplicadores somados em pct (0.1 = +10%) por StatKey de ability.ts */
  pct: Partial<Record<string, number>>;
}

export interface StatusInstance {
  /** id estável dentro da entidade */
  uid: number;
  kind: string; // 'atordoar', 'lentidao', 'escudo', 'reforco:damage', 'marca', 'dano_continuo', 'provocar', 'transformar', 'invisivel', 'imune', ...
  sourceId: number;
  abilityId?: string;
  startTick: number;
  endTick: number;
  /** força: % da lentidão, valor do escudo restante, pct do reforço, etc. */
  value: number;
  stacks?: number;
  data?: Record<string, unknown>;
}

export interface DoctrineCard {
  /** condição para a carta valer */
  se:
    | { t: 'sempre' }
    | { t: 'minha_vida_abaixo'; pct: number }
    | { t: 'aliado_vida_abaixo'; pct: number }
    | { t: 'alvo_e_chefe' }
    | { t: 'alvo_e_elite_ou_chefe' }
    | { t: 'inimigos_perto_min'; n: number; raio: number }
    | { t: 'especial_pronto' }
    | { t: 'aliado_caido_perto' };
  /** o que fazer */
  faca:
    | { t: 'usar_botao'; botao: 1 | 2 | 3 }
    | { t: 'usar_especial' }
    | { t: 'usar_item' }
    | { t: 'fugir' }
    | { t: 'curar_aliado' }
    | { t: 'levantar_aliado' }
    | { t: 'focar_mais_fraco' }
    | { t: 'focar_mais_perto' }
    | { t: 'seguir_grupo' };
}

export interface Loadout {
  /** ids de habilidade nos botões 1, 2 e 3 */
  b1: string;
  b2: string;
  b3: string;
  especial: string;
  basico: string;
  /** id do consumível no botão de item */
  item?: string;
  itemCount?: number;
}

export interface Entity {
  id: number;
  kind: EntityKind;
  team: Team;
  /** id de dados: arquétipo/classe do jogador, inimigo, invocação, npc ou item do saque */
  defId: string;
  name: string;
  level: number;
  x: number;
  y: number;
  radius: number;
  facing: Facing;
  /** direção que o jogador quer andar (joystick, -1..1) */
  moveIntent: Vec;
  /** destino de "tocar no chão" / auto-caminho */
  moveTo?: Vec;
  path?: Vec[];
  hp: number;
  shield: number;
  resource: number;
  /** carga do Especial 0..1 */
  special: number;
  stats: CombatStats;
  statuses: StatusInstance[];
  /** tick até quando está imune a controles */
  ccImmuneUntil: number;
  targetId?: number;
  /** alvo travado escolhido à mão (toque); perde quando sai de vista por muito tempo */
  manualTarget?: boolean;
  cooldowns: Record<string, number>; // abilityId -> tick em que fica pronta
  gcdUntil: number;
  nextBasicTick: number;
  /** caído: tick até o qual fica no chão (30 s) */
  downedUntil?: number;
  reviveProgressMs?: number;
  dead: boolean;
  // jogador
  classId?: string;
  archetypeId?: string;
  side?: 'esquerda' | 'direita';
  partyId?: string;
  loadout?: Loadout;
  doctrine?: DoctrineCard[];
  /** modo automático ligado (Doutrina), também plantão e queda de conexão */
  auto?: boolean;
  /** playerId persistente, para jogadores e plantonistas */
  playerId?: string;
  onDuty?: boolean;
  /** passivos ativos (talentos, guia, itens), já resolvidos para ids */
  passives?: string[];
  // inimigo
  tier?: EnemyTier;
  affixes?: string[];
  ai?: Record<string, unknown>;
  // invocação
  ownerId?: number;
  expiresTick?: number;
  // saque
  loot?: { itemId?: string; rarity?: string; currency?: { semente?: number; credito?: number }; forPlayerId?: string };
}

export interface Telegraph {
  id: number;
  sourceId: number;
  abilityId: string;
  shape: 'circulo' | 'cone' | 'linha';
  x: number;
  y: number;
  radius: number;
  /** direção do cone/linha em radianos */
  dir?: number;
  angleDeg?: number;
  startTick: number;
  impactTick: number;
}

/** Área que fica no chão (campo, chuva de chumbo, poça, tempestade). */
export interface GroundZone {
  id: number;
  sourceId: number;
  team: Team;
  abilityId: string;
  x: number;
  y: number;
  radius: number;
  startTick: number;
  endTick: number;
  tickMs: number;
  nextTick: number;
  followsId?: number;
}

export type CombatEvent =
  | { t: 'cast'; src: number; ability: string; target?: number; x?: number; y?: number }
  | { t: 'hit'; src: number; dst: number; amount: number; crit?: boolean; ability?: string; kind?: 'impacto' | 'perfurante' | 'energia' | 'espirito' }
  | { t: 'miss'; src: number; dst: number }
  | { t: 'heal'; src: number; dst: number; amount: number }
  | { t: 'shield'; src: number; dst: number; amount: number }
  | { t: 'status'; dst: number; kind: string; on: boolean }
  | { t: 'cc_slow'; dst: number } // chefe recebeu controle e virou lentidão
  | { t: 'down'; dst: number }
  | { t: 'revive'; dst: number; by?: number }
  | { t: 'death'; dst: number; by?: number }
  | { t: 'telegraph'; tel: Telegraph }
  | { t: 'special_ready'; dst: number }
  | { t: 'loot_drop'; id: number }
  | { t: 'loot_pick'; id: number; by: number }
  | { t: 'xp'; dst: number; amount: number }
  | { t: 'level'; dst: number; level: number }
  | { t: 'say'; src: number; text: string }
  | { t: 'currency'; dst: number; semente?: number; credito?: number };

export interface World {
  tick: number;
  rng: Rng;
  map: TileMap;
  entities: Map<number, Entity>;
  telegraphs: Telegraph[];
  zones: GroundZone[];
  nextId: number;
  /** eventos gerados no último step */
  events: CombatEvent[];
  /** histórico de posições para compensação de atraso: tick -> (id -> [x, y]) ; guarda >= 300 ms */
  history: { tick: number; pos: Map<number, [number, number]> }[];
  /** modificadores da região (energia, poluição, natureza/cidade) por regionId */
  regionState?: Record<string, { energia: boolean; apagao: boolean; poluicao: number }>;
}

/** Entrada contínua do jogador (joystick), mandada todo tick. */
export interface PlayerInput {
  seq: number;
  /** vetor do joystick quantizado em -127..127 */
  mx: number;
  my: number;
}

/** Comandos discretos, idempotentes por id. */
export type PlayerCommand =
  | { id: number; c: 'habilidade'; botao: 1 | 2 | 3 | 'especial'; at?: Vec }
  | { id: number; c: 'alvo'; x: number; y: number }
  | { id: number; c: 'item' }
  | { id: number; c: 'ir_ate'; x: number; y: number }
  | { id: number; c: 'auto'; on: boolean }
  | { id: number; c: 'interagir'; entity: number }
  | { id: number; c: 'trocar_arquetipo'; archetypeId: string } // protótipo da Fase 1
  | { id: number; c: 'doutrina'; cards: DoctrineCard[] };

export interface CommandContext {
  /** quantos ticks voltar no histórico para conferir alvo e alcance (compensação de até 250 ms) */
  rewindTicks?: number;
}
