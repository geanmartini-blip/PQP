import { z } from 'zod';
import { Id, Sugestao } from './common';
import { Reward, Hazard } from './world';
import { EnemyGroup } from './mission';

/**
 * Masmorras (dungeons.json) e fim de jogo (endgame.json: colossos, arenas e alas do Mirante).
 * Fonte: Sistemas.md (Masmorras, Colossos, Invasões ao Mirante, Arenas de guerra e líderes).
 */

export { Hazard } from './world';

export const RoomType = z.enum(['combate', 'armadilha', 'enigma', 'evento', 'descanso', 'tesouro', 'chefe']);
export type RoomType = z.infer<typeof RoomType>;

export const Wave = z
  .object({
    inimigos: z.array(EnemyGroup).min(1),
    /** segundos depois de a sala abrir (ou da onda anterior acabar) */
    atrasoS: z.number().nonnegative().default(0),
    ...Sugestao,
  })
  .strict();
export type Wave = z.infer<typeof Wave>;

export const BossPhase = z
  .object({
    /** começa quando a vida do chefe cai abaixo deste % */
    vidaAbaixoPct: z.number().min(0).max(100),
    descricao: z.string().min(1),
    perigos: z.array(Id).default([]),
    reforcos: Wave.optional(),
    ...Sugestao,
  })
  .strict();
export type BossPhase = z.infer<typeof BossPhase>;

export const EventOption = z
  .object({
    id: Id,
    texto: z.string().min(1),
    recompensas: z.array(Reward).default([]),
    ondas: z.array(Wave).optional(),
    ligaFlags: z.array(Id).default([]),
    ...Sugestao,
  })
  .strict();
export type EventOption = z.infer<typeof EventOption>;

export const RoomTemplate = z
  .object({
    id: Id,
    tipo: RoomType,
    name: z.string().min(1),
    descricao: z.string().min(1),
    /** tamanho em tiles */
    tamanho: z.object({ w: z.number().int().min(8), h: z.number().int().min(8), ...Sugestao }).strict(),
    ondas: z.array(Wave).optional(),
    perigos: z.array(Id).optional(),
    enigma: z
      .object({
        descricao: z.string().min(1),
        /** quem tem uma destas lições resolve na hora */
        licoes: z.array(Id).min(1),
        /** sem a lição: o caminho longo */
        semLicao: z
          .object({ descricao: z.string().min(1), ondas: z.array(Wave).optional(), duracaoS: z.number().int().positive().optional(), ...Sugestao })
          .strict(),
        recompensaPorLicao: z.array(Reward).default([]),
        ...Sugestao,
      })
      .strict()
      .optional(),
    evento: z.object({ descricao: z.string().min(1), opcoes: z.array(EventOption).min(2), ...Sugestao }).strict().optional(),
    descanso: z
      .object({ curaPct: z.number().min(0).max(100), recursoPct: z.number().min(0).max(100), levantaCaidos: z.boolean(), ...Sugestao })
      .strict()
      .optional(),
    tesouro: z.object({ tabela: Id, rolagens: z.number().int().positive(), ...Sugestao }).strict().optional(),
    chefe: z
      .object({ inimigo: Id, fases: z.array(BossPhase).default([]), acompanhantes: z.array(Wave).optional(), ...Sugestao })
      .strict()
      .optional(),
    recompensas: z.array(Reward).default([]),
    ...Sugestao,
  })
  .strict()
  .superRefine((r, ctx) => {
    const need: Record<string, unknown> = {
      combate: r.ondas,
      armadilha: r.perigos,
      enigma: r.enigma,
      evento: r.evento,
      descanso: r.descanso,
      tesouro: r.tesouro,
      chefe: r.chefe,
    };
    if (!need[r.tipo]) ctx.addIssue({ code: 'custom', message: `${r.id}: sala '${r.tipo}' sem o bloco do tipo` });
  });
export type RoomTemplate = z.infer<typeof RoomTemplate>;

export const Floor = z
  .object({
    andar: z.number().int().positive(),
    name: z.string().min(1),
    /** salas em ordem, ids de RoomTemplate */
    salas: z.array(Id).min(1),
    /** água subindo: tiles por minuto e altura que encharca (lentidão + dano) */
    aguaSubindo: z
      .object({ comecaS: z.number().nonnegative(), tilesPorMinuto: z.number().positive(), perigo: Id, ...Sugestao })
      .strict()
      .optional(),
    /** multiplicador de vida e dano dos inimigos neste andar */
    dificuldade: z.number().positive(),
    ...Sugestao,
  })
  .strict();
export type Floor = z.infer<typeof Floor>;

export const DungeonDetail = z
  .object({
    andares: z.array(Floor).min(1),
    salas: z.array(RoomTemplate).min(1),
    perigos: z.array(Hazard).default([]),
    inimigos: z
      .object({ normais: z.array(Id).min(1), elites: z.array(Id), chefes: z.array(Id).min(1), ...Sugestao })
      .strict(),
    /** depois do último andar pronto: andares montados sozinhos das salas, sem fundo */
    semFundo: z
      .object({
        aPartirDoAndar: z.number().int().positive(),
        salasPorAndar: z.tuple([z.number().int().positive(), z.number().int().positive()]),
        /** pesos de sorteio por tipo de sala */
        pesos: z.partialRecord(RoomType, z.number().nonnegative()),
        chefeACadaAndares: z.literal(5),
        /** chefes em rodízio a cada 5 andares */
        chefes: z.array(Id).min(1),
        vidaPctPorAndar: z.number().nonnegative(),
        danoPctPorAndar: z.number().nonnegative(),
        saquePctPorAndar: z.number().nonnegative(),
        chanceElitePorAndarPct: z.number().nonnegative(),
        ...Sugestao,
      })
      .strict(),
    recompensas: z
      .object({
        tabelas: z.object({ normal: Id, elite: Id, chefe: Id, ...Sugestao }).strict(),
        porAndar: z.array(Reward),
        chefe: z.array(Reward),
        primeiraVez: z.array(Reward).default([]),
        ...Sugestao,
      })
      .strict(),
    ...Sugestao,
  })
  .strict();
export type DungeonDetail = z.infer<typeof DungeonDetail>;

export const Dungeon = z
  .object({
    id: Id,
    name: z.string().min(1),
    /** colunas exatas da tabela de Sistemas.md */
    entrada: z.string().min(1),
    oQueTem: z.string().min(1),
    chefe: z.object({ name: z.string().min(1), inimigo: Id.optional(), ...Sugestao }).strict(),
    regioes: z.array(Id),
    lugaresDeEntrada: z.array(Id).default([]),
    emPiloto: z.boolean(),
    detalhe: DungeonDetail.optional(),
    ...Sugestao,
  })
  .strict();
export type Dungeon = z.infer<typeof Dungeon>;

export const RankingPrize = z
  .object({ posicaoAte: z.number().int().positive(), recompensas: z.array(Reward), ...Sugestao })
  .strict();
export type RankingPrize = z.infer<typeof RankingPrize>;

export const DungeonsFile = z
  .object({
    regras: z
      .object({
        equipeMax: z.literal(4),
        composicao: z.array(z.enum(['jogador', 'plantonista', 'ia'])),
        tempoReal: z.literal(true),
        /** quem não está jogando é levado pela Doutrina */
        quemNaoJogaUsa: z.literal('doutrina'),
        salvaNoUltimoAndarVencido: z.literal(true),
        qualquerMembroContinua: z.literal(true),
        chefeACadaAndares: z.literal(5),
        semFundo: z.literal(true),
        tiposDeSala: z.array(RoomType).length(7),
        /** texto exato */
        recompensasTexto: z.string().min(1),
        ranking: z
          .object({
            periodo: z.literal('semanal'),
            porMargem: z.literal(true),
            criterio: z.literal('andar_mais_fundo'),
            premios: z.array(RankingPrize),
            ...Sugestao,
          })
          .strict(),
        ...Sugestao,
      })
      .strict(),
    masmorras: z.array(Dungeon).length(7),
  })
  .strict();
export type DungeonsFile = z.infer<typeof DungeonsFile>;

// ---------------------------------------------------------------------------
// Fim de jogo (endgame.json) — tudo fora do piloto
// ---------------------------------------------------------------------------

export const Colossus = z
  .object({
    id: Id,
    name: z.string().min(1),
    oQueE: z.string().min(1),
    comoFunciona: z.string().min(1),
    regioes: z.array(Id),
    foraDoPiloto: z.literal(true),
    ...Sugestao,
  })
  .strict();
export type Colossus = z.infer<typeof Colossus>;

export const Arena = z
  .object({
    id: Id,
    name: z.string().min(1),
    nivel: z.union([z.literal(20), z.literal(40), z.literal(60)]),
    cenario: z.string().min(1),
    chefesDeIA: z.string().min(1),
    regiao: Id,
    foraDoPiloto: z.literal(true),
    ...Sugestao,
  })
  .strict();
export type Arena = z.infer<typeof Arena>;

export const MiranteWing = z
  .object({
    id: Id,
    name: z.string().min(1),
    ordem: z.number().int().positive(),
    oQueTem: z.string().min(1),
    chefe: z.string().min(1),
    foraDoPiloto: z.literal(true),
    ...Sugestao,
  })
  .strict();
export type MiranteWing = z.infer<typeof MiranteWing>;

/** Marcos da história no nível 20 (Arena da Ponte, Noite Escura, Acordo). */
export const StoryEvent = z
  .object({
    id: Id,
    name: z.string().min(1),
    nivel: z.number().int().positive(),
    textoDoc: z.string().min(1),
    requerFlags: z.array(Id).default([]),
    ligaFlags: z.array(Id).default([]),
    foraDoPiloto: z.literal(true),
    ...Sugestao,
  })
  .strict();
export type StoryEvent = z.infer<typeof StoryEvent>;

export const EndgameFile = z
  .object({
    colossos: z
      .object({
        regras: z
          .object({
            duracaoDias: z.tuple([z.literal(2), z.literal(3)]),
            vidaCompartilhada: z.literal(true),
            instanciaMax: z.literal(20),
            faseACadaMin: z.literal(60),
            postosPersistem: z.literal(true),
            plantonistasEIA: z.literal(true),
            recompensaPor: z.array(z.enum(['dano', 'protecao', 'suporte'])),
            exemplosDePostos: z.array(z.string().min(1)),
            textos: z.array(z.string().min(1)),
            foraDoPiloto: z.literal(true),
            ...Sugestao,
          })
          .strict(),
        lista: z.array(Colossus).length(5),
        ...Sugestao,
      })
      .strict(),
    arenas: z
      .object({
        regras: z
          .object({
            horario: z.object({ inicio: z.literal('21:00'), fim: z.literal('23:00'), ...Sugestao }).strict(),
            temporada: z.literal('mensal'),
            vagasQueSobramFicamComIA: z.literal(true),
            fases: z.array(z.string().min(1)),
            vitoria: z.string().min(1),
            vencedor: z.string().min(1),
            perdedor: z.string().min(1),
            reforcoACadaS: z.literal(20),
            textos: z.array(z.string().min(1)),
            foraDoPiloto: z.literal(true),
            ...Sugestao,
          })
          .strict(),
        lista: z.array(Arena).length(3),
        ...Sugestao,
      })
      .strict(),
    mirante: z
      .object({
        regras: z
          .object({
            comoColossos: z.literal(true),
            margensJuntas: z.literal(true),
            instanciaMax: z.literal(20),
            faseACadaMin: z.literal(60),
            textos: z.array(z.string().min(1)),
            foraDoPiloto: z.literal(true),
            ...Sugestao,
          })
          .strict(),
        alas: z.array(MiranteWing).length(5),
        ...Sugestao,
      })
      .strict(),
    eventos: z.array(StoryEvent),
  })
  .strict();
export type EndgameFile = z.infer<typeof EndgameFile>;
