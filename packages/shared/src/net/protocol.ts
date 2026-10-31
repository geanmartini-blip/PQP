/**
 * Protocolo cliente <-> servidor (mensagens do Colyseus, serializadas pelo transporte).
 * Snapshots completos por tick (sem delta) para tolerar perda; entradas repetidas; comandos com id e ack.
 */
import type { CombatEvent, PlayerCommand, PlayerInput, Telegraph } from '../sim/types';

export const PROTOCOL_VERSION = 1;
export const POS_SCALE = 100; // posição em tiles * 100, inteiro
export const INTEREST_RADIUS = 18; // tiles
export const MAX_REWIND_MS = 250;
export const HIT_TOLERANCE_TILES = 1;
export const INTERP_DELAY_MS = 100;

// ---------- cliente -> servidor ----------
export interface C2S_Hello {
  token: string;
  name?: string;
  /** aparência e loadout vêm do Store no servidor; isto é só para o protótipo */
  archetypeId?: string;
}

export interface C2S_Input {
  /** últimas 3 entradas (a mais nova por último) */
  inputs: PlayerInput[];
  /** comandos ainda não confirmados */
  cmds: PlayerCommand[];
  /** último tick de snapshot recebido */
  ackTick: number;
  /** RTT medido pelo cliente em ms */
  rtt: number;
}

export interface C2S_Ping {
  t: number;
}

// ---------- servidor -> cliente ----------
export interface S2C_Welcome {
  you: number;
  mapId: string;
  tick: number;
  tickRate: number;
  protocol: number;
}

/** Entidade no snapshot, chaves curtas. */
export interface EntSnap {
  i: number; // id
  k: 'p' | 'n' | 'e' | 's' | 'l'; // player, npc, enemy, summon, loot
  x: number; // * POS_SCALE
  y: number;
  f: 0 | 1 | 2 | 3; // facing
  h: number; // vida 0..1000 (por mil)
  sh?: number; // escudo 0..1000 da vida máxima
  /** bits: 1 movendo, 2 atacando, 4 caído, 8 invisível, 16 atordoado, 32 lento, 64 provocando, 128 transformado, 256 elite, 512 chefe, 1024 imune */
  fl: number;
  /** alvo travado (só para o próprio jogador e chefes) */
  tg?: number;
  /** defId (arquétipo, inimigo, invocação, npc) — só quando a entidade é nova para este cliente */
  d?: string;
  /** nome — só quando nova */
  n?: string;
  /** visual (aparência + traje) — só quando nova ou mudou */
  lk?: unknown;
  /** nível — só quando nova ou mudou */
  lv?: number;
}

export interface HudSnap {
  hp: number;
  hpMax: number;
  shield: number;
  res: number;
  resMax: number;
  special: number; // 0..1000
  /** ticks restantes de recarga por botão: [b1, b2, b3, especial, item] */
  cd: [number, number, number, number, number];
  gcd: number;
  /** ids das habilidades nos botões */
  ab: [string, string, string, string, string?];
  itemCount: number;
  target?: number;
  xp: number;
  xpNext: number;
  level: number;
  auto: boolean;
  downed?: number; // ms restantes no chão
  /** velocidade de deslocamento efetiva agora (tiles/s, com lentidão e reforços), para a previsão do cliente */
  mv: number;
  /** pode se mexer (falso se atordoado, preso, derrubado, caído) */
  canMove: boolean;
  /** arquétipo e classe atuais */
  arch?: string;
  cls?: string;
}

export interface S2C_Snapshot {
  t: number; // tick do servidor
  ack: number; // última PlayerInput.seq processada
  cack: number; // maior id de comando processado
  ents: EntSnap[];
  /** ids que saíram do raio de interesse ou morreram */
  gone?: number[];
  tel: Telegraph[];
  zones: { i: number; a: string; x: number; y: number; r: number; e: number; team: string }[];
  ev: CombatEvent[];
  hud: HudSnap;
}

export interface S2C_Pong {
  t: number;
  st: number; // tick do servidor
}

export const MSG = {
  hello: 'hello',
  input: 'in',
  ping: 'ping',
  welcome: 'welcome',
  snap: 'snap',
  pong: 'pong',
  /** cliente pede info de entidades desconhecidas (o snapshot com 'd' se perdeu) */
  need: 'need',
  info: 'info',
  chat: 'chat',
  notice: 'notice',
} as const;

export const quantize = (v: number) => Math.round(v * POS_SCALE);
export const dequantize = (v: number) => v / POS_SCALE;
export const quantizeAxis = (v: number) => Math.max(-127, Math.min(127, Math.round(v * 127)));
export const dequantizeAxis = (v: number) => v / 127;
