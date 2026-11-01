/**
 * Regras de jogo da Fase 2 (criação, Máquina de Visual, Delta, tutorial e travessia), em código
 * puro e compartilhado: o servidor (packages/server/src/core.ts) e o servidor local do cliente
 * (packages/client/src/net/localServer.ts) chamam as mesmas funções.
 *
 * Convenção: as funções de regra MUTAM o PlayerRecord recebido e devolvem o que mudou (GameResult
 * ou { ok, erro }). Quem quiser comparar antes e depois clona o registro antes. Nada aqui usa
 * Math.random nem Date: sorteio vem de um Rng (sim/rng.ts).
 */
import type { Resource } from '../schema/world';
import type { DoctrineCard } from '../sim/types';

export type SideId = 'esquerda' | 'direita';

/** Estágio do jogador: Delta (1 a 7), travessia (8, antes de escolher) e margem (depois). */
export type PlayerStage = 'delta' | 'travessia' | 'margem';

/** Ids de progression.visualPorNivel. */
export type VisualTierId = 'delta' | 'uniforme' | 'aprendiz' | 'veterano' | 'virada' | 'mestre' | 'lendario';

/** player.appearance do modelo de dados mínimo (ids de appearance.json; palette é id de paleta). */
export interface Appearance {
  body: string;
  skin: string;
  face: string;
  hair: string;
  hair_color: string;
  details: string[];
  /** id da paleta do traje: no Delta, uma das 6 cores da camiseta; na ala, uma das 3 paletasTraje */
  palette: string;
}

/**
 * Visual de um personagem para o gerador de pixel art. Cópia de CharacterLook de
 * packages/client/src/art/contract.ts (o cliente não exporta para o shared). Manter igual.
 */
export interface CharacterLook {
  body: string;
  skin: string;
  face: string;
  hair: string;
  hairColor: string;
  details: string[];
  outfit: {
    tier: 'delta' | 'base' | 'aprendiz' | 'veterano' | 'virada' | 'mestre' | 'lendario';
    archetypeId?: string;
    institutionId?: string;
    /** 0..2: paleta da ala; no traje do Delta, 0..5 é a cor da camiseta */
    palette: number;
    /** v0.3: as 5 peças do conjunto da classe vestidas (o boneco vira a versão inicial da ala) */
    conjunto?: boolean;
  };
  items?: { slot: string; rarity: 'comum' | 'raro' | 'unico' | 'set'; art?: string }[];
}

export interface MissionsState {
  ativas: string[];
  concluidas: string[];
  /** missão -> objetivo -> contadores (um por grupo de inimigos no 'derrotar'; um só nos outros) */
  progresso: Record<string, number[][]>;
}

export interface TutorialState {
  /** passos do primeiro minuto já feitos (TutorialStepId) */
  feitos: string[];
  /** controles já usados pelo menos uma vez (TutorialControl de schema/mission.ts) */
  controles: string[];
}

export interface RecordLoadout {
  /** habilidade da classe no botão 3 (12+); antes da ala, o padrão da classe */
  slot3_ability: string | null;
  /** os 3 botões nos níveis 8 a 11 (habilidades da classe); vazio no Delta */
  botoes: string[];
}

/**
 * Registro persistente do jogador (modelo de dados mínimo do CLAUDE.md, mais o estado das regras
 * da Fase 2). `xp` é o XP dentro do nível atual, igual a Entity.xp da simulação.
 */
export interface PlayerRecord {
  version: number;
  id: string;
  name: string;
  /** passou pela criação de personagem (nome e aparência escolhidos) */
  criado: boolean;
  appearance: Appearance;
  /** visual liberado que o jogador escolheu mostrar; null = o mais alto liberado */
  shown_visual_tier: VisualTierId | null;
  stage: PlayerStage;
  side: SideId | null;
  institution: string | null;
  class: string | null;
  archetype: string | null;
  /** patente da margem (societies.json: membro, colaborador...) */
  rank: string | null;
  /** patente da instituição (institutions.json patentes[0], texto) */
  institution_rank: string | null;
  guide_id: string | null;
  level: number;
  xp: number;
  talent_picks: string[];
  loadout: RecordLoadout;
  /** slot -> id do item equipado */
  equipment: Record<string, string>;
  inventory: string[];
  /** materiais de missão e de saque (comida, peças, chopindita...) */
  resources: Partial<Record<Resource, number>>;
  /** poções no botão de item */
  item_count: number;
  doctrine: DoctrineCard[];
  auto: boolean;
  on_duty: boolean;
  home_id: string | null;
  semente: number;
  credito: number;
  score: number;
  story_flags: string[];
  missions: MissionsState;
  tutorial: TutorialState;
  /** opções zoeiras liberadas jogando (peles zoeiras, por enquanto) e desbloqueios de missão */
  unlocks: string[];
  /** contadores dos desbloqueios: inimigos_derrotados_mapa, visitas:<lugar>, masmorra:<id>, fala:<npc>:<contexto> */
  counters: Record<string, number>;
  /** lugar onde o jogador está agora (último 'arrive'), para objetivos de ir até lá */
  lugar_atual: string | null;
  // ---- Fase 4 ----
  /** moradia (casa da lista, mutirão, cápsula), com os móveis; null = sem casa */
  home?: HomeState | null;
  /** estado da carteira: ciclo da cidade já processado, dívida, limites do ciclo */
  economia?: EconomiaState;
}

/** Fase 4: o que a carteira guarda além dos saldos (semente, credito e score ficam no registro). */
export interface EconomiaState {
  /** último ciclo da cidade aplicado neste registro (aluguel, fila do mutirão) */
  ciclo: number;
  /** Crédito devido (aluguel não pago); dívida > 0 é ficar no negativo */
  divida: number;
  /** pontos de score já somados ou tirados por evento neste ciclo (limitePorCiclo) */
  scoreCiclo: Record<string, number>;
  /** Semente equivalente trocada no câmbio neste ciclo (limitePorCicloSemente) */
  cambioCiclo: number;
  /** a moradia inicial da margem já foi dada (rede no galpão ou cápsula) */
  moradiaDada: boolean;
}

/** Rotação de um móvel: 0, 90, 180 e 270 graus. Em 1 e 3 a largura e a altura trocam. */
export type Rotacao = 0 | 1 | 2 | 3;

export interface MovelColocado {
  /** id do móvel nesta casa */
  uid: number;
  /** id do catálogo (furniture.json) */
  id: string;
  x: number;
  y: number;
  rot: Rotacao;
}

export type PermissaoVisita = 'so_eu' | 'grupo' | 'margem' | 'todos';

/** Fase 4: a casa do jogador (housing.json tipos[].id), com o interior em grade. */
export interface HomeState {
  tipo: string;
  moveis: MovelColocado[];
  /** próximo uid de móvel */
  seq: number;
  visitas: PermissaoVisita;
  /** ids de jogadores convidados (a outra margem só entra a convite) */
  convidados: string[];
  /** cápsula: ciclos seguidos de atraso */
  atraso?: number;
  /** cápsula: valor do último aluguel cobrado */
  aluguelUltimo?: number;
  /** lista de espera da Assembleia: ciclos até sair a casa e o tipo que vem */
  espera?: { ciclosRestantes: number; final: string } | null;
}

/** Contexto de grupo de uma luta: quem estava junto, do mesmo lado. */
export interface GroupCtx {
  /** personagens do mesmo lado na luta, contando o próprio jogador, plantonistas e IA */
  personagens: number;
  /** jogadores ao vivo (não plantonistas), contando o próprio */
  aoVivo: number;
  /** o próprio jogador está de plantão */
  plantonista?: boolean;
  /** bônus de XP em pontos percentuais (talentos, guia) */
  xpPct?: number;
}

/** Botões que um objetivo usar_habilidade conta. */
export type BotaoId = '1' | '2' | '3' | 'especial' | 'item';

/** Eventos de jogo que movem missões, tutorial e desbloqueios. */
export type GameEvent =
  | { t: 'kill'; enemyId: string; tier?: 'normal' | 'elite' | 'chefe'; masmorra?: boolean; grupo?: GroupCtx }
  | { t: 'talk'; npcId: string }
  /** chegou num lugar (placeId) ou região (regionId); placeId null = saiu do lugar */
  | { t: 'arrive'; placeId?: string | null; regionId?: string; deBarco?: boolean }
  | { t: 'pickup'; chave?: string; itemId?: string; recurso?: Resource; quantidade?: number }
  | { t: 'level'; level: number }
  | { t: 'ability'; botao: BotaoId; habilidade?: string }
  | { t: 'control'; controle: string }
  | { t: 'interact'; alvo: string; acao: string }
  | { t: 'choose'; opcao: string; missionId?: string }
  | { t: 'tutorial'; passo: string }
  // ---- Fase 3 ----
  /** segundos aguentados num objetivo 'sobreviver' (o servidor manda enquanto o jogador está no lugar da missão) */
  | { t: 'survive'; segundos: number }
  /** pagamento feito (game/institutions.ts payObjective já tirou a moeda) */
  | { t: 'pay'; moeda: 'semente' | 'credito'; quantidade: number }
  // ---- Fase 5 ----
  /** masmorra: andar 0 = entrou; andar N = venceu até o andar N (claimRunRewards manda os dois) */
  | { t: 'dungeon'; masmorra: string; andar: number };

export interface Unlock {
  nivel: number;
  controle: string;
  descricao: string;
}

/** O que um evento ou ação mudou no registro. */
export interface GameResult {
  mudou: boolean;
  /** story_flags ligadas agora */
  flags: string[];
  aceitas: string[];
  concluidas: string[];
  /** objetivos que avançaram: missão e índice do objetivo */
  avancos: { missao: string; objetivo: number }[];
  /** XP ganho (já com o bônus de grupo) */
  xp: number;
  /** níveis alcançados agora, em ordem */
  niveis: number[];
  /** desbloqueios do tutorial (progression.botoes[].desbloqueioTutorial) pelos níveis novos */
  desbloqueios: Unlock[];
  /** passos do tutorial feitos agora */
  tutorial: string[];
  /** opções zoeiras liberadas agora (ids de appearance) */
  visuais: string[];
  /** recursos e moedas recebidos */
  recursos: Partial<Record<Resource, number>>;
  /** itens fixos que entraram no inventário */
  itens: string[];
  /** itens de tabela de saque que o servidor ainda precisa rolar (loot.json) */
  itensParaRolar: { tabela: string; quantidade: number }[];
  /** textos curtos para o aviso na tela */
  avisos: string[];
  /** mudança de estágio, quando houve */
  estagio?: PlayerStage;
  // ---- Fase 3 ----
  /** emotes liberados agora (ids de trainers.json emote.id) */
  emotes?: string[];
  /** falas do guia que vieram junto (missão aceita, bônus) */
  falasGuia?: { guia: string; nome: string; situacao: string; texto: string }[];
}

export const emptyResult = (): GameResult => ({
  mudou: false,
  flags: [],
  aceitas: [],
  concluidas: [],
  avancos: [],
  xp: 0,
  niveis: [],
  desbloqueios: [],
  tutorial: [],
  visuais: [],
  recursos: {},
  itens: [],
  itensParaRolar: [],
  avisos: [],
});

/** Junta b em a (a é mutado e devolvido). */
export function mergeResult(a: GameResult, b: GameResult): GameResult {
  a.mudou ||= b.mudou;
  a.flags.push(...b.flags);
  a.aceitas.push(...b.aceitas);
  a.concluidas.push(...b.concluidas);
  a.avancos.push(...b.avancos);
  a.xp += b.xp;
  a.niveis.push(...b.niveis);
  a.desbloqueios.push(...b.desbloqueios);
  a.tutorial.push(...b.tutorial);
  a.visuais.push(...b.visuais);
  for (const [k, v] of Object.entries(b.recursos)) a.recursos[k as Resource] = (a.recursos[k as Resource] ?? 0) + (v ?? 0);
  a.itens.push(...b.itens);
  a.itensParaRolar.push(...b.itensParaRolar);
  a.avisos.push(...b.avisos);
  if (b.estagio) a.estagio = b.estagio;
  if (b.emotes?.length) (a.emotes ??= []).push(...b.emotes);
  if (b.falasGuia?.length) (a.falasGuia ??= []).push(...b.falasGuia);
  return a;
}

export interface Ok {
  ok: true;
}
export interface Fail {
  ok: false;
  erro: string;
}
export type Check = Ok | Fail;

/** Moeda das duas margens. */
export type Moeda = 'semente' | 'credito';
