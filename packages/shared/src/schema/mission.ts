import { z } from 'zod';
import { Id, Side, Sugestao } from './common';
import { Resource, Reward, Point, Hazard } from './world';

/**
 * Missões: tipos da tabela "Missões" (Sistemas.md), missões de entrada, cadeia do Delta,
 * travessia e arcos das duas margens (Narrativa.md).
 *
 * `dadaPor` aceita o id de um NPC/personagem ou um destes papéis:
 * - `guia`: o espírito ou a IA de bolso do jogador
 * - `treinador_da_ala`: o treinador da ala escolhida no 12
 * - `treinador_da_base`: quem recebe a base da instituição do jogador
 * - `quadro_de_missoes`: quadro da instituição ou do QG
 * - `ia_de_faccao`: a liderança de IA da margem (Ordens do comando)
 */

export const Tier = z.enum(['normal', 'elite', 'chefe']);
export type Tier = z.infer<typeof Tier>;

export const Afixo = z.enum(['rapido', 'blindado', 'explode_ao_morrer', 'cura_os_outros']);
export type Afixo = z.infer<typeof Afixo>;

/** Controles ensinados no tutorial do Delta. */
export const TutorialControl = z.enum([
  'andar_joystick',
  'tocar_no_chao',
  'alvo_automatico',
  'trocar_alvo',
  'habilidade',
  'especial',
  'item',
  'auto_caminho',
  'saque',
  'modo_automatico',
  'desviar_aviso',
  'reanimar',
]);
export type TutorialControl = z.infer<typeof TutorialControl>;

export const EnemyGroup = z
  .object({
    inimigo: Id,
    quantidade: z.number().int().positive(),
    tier: Tier.default('normal'),
    afixos: z.array(Afixo).optional(),
    ...Sugestao,
  })
  .strict();
export type EnemyGroup = z.infer<typeof EnemyGroup>;

export const ChoiceOption = z
  .object({
    id: Id,
    texto: z.string().min(1),
    ligaFlags: z.array(Id).default([]),
    recompensas: z.array(Reward).optional(),
    ...Sugestao,
  })
  .strict();
export type ChoiceOption = z.infer<typeof ChoiceOption>;

const objBase = {
  /** texto curto do passo, mostrado no rastreador da missão */
  descricao: z.string().min(1),
  /** controle que o passo ensina (tutorial do Delta), com dica visual e sem texto longo */
  ensina: z.array(TutorialControl).optional(),
  opcional: z.boolean().optional(),
  ...Sugestao,
};

export const Objective = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('ir_ate'), lugar: Id.optional(), regiao: Id.optional(), ponto: Point.optional(), deBarco: z.boolean().optional(), ...objBase }).strict(),
  z.object({ tipo: z.literal('derrotar'), inimigos: z.array(EnemyGroup).min(1), regiao: Id.optional(), ...objBase }).strict(),
  z.object({ tipo: z.literal('falar'), npc: Id, ...objBase }).strict(),
  z
    .object({
      tipo: z.literal('coletar'),
      recurso: Resource.optional(),
      /** coisa de missão (ex.: saque, amostra_de_agua, seguidores) */
      chave: Id.optional(),
      quantidade: z.number().int().positive(),
      limiteS: z.number().int().positive().optional(),
      ...objBase,
    })
    .strict(),
  z
    .object({
      tipo: z.literal('sobreviver'),
      duracaoS: z.number().int().positive(),
      ondas: z.array(EnemyGroup).optional(),
      /** perigo do ambiente (ex.: chuva_de_tomate) com aviso no chão */
      perigo: Id.optional(),
      /** não pode sair do raio, em tiles */
      naoSairDoRaio: z.number().positive().optional(),
      ...objBase,
    })
    .strict(),
  z.object({ tipo: z.literal('escolher'), pergunta: z.string().min(1), opcoes: z.array(ChoiceOption).min(2), ...objBase }).strict(),
  z
    .object({
      tipo: z.literal('usar_habilidade'),
      botao: z.enum(['1', '2', '3', 'especial', 'item', 'qualquer']).optional(),
      habilidade: Id.optional(),
      quantidade: z.number().int().positive(),
      ...objBase,
    })
    .strict(),
  z.object({ tipo: z.literal('usar_controle'), controle: TutorialControl, quantidade: z.number().int().positive().default(1), ...objBase }).strict(),
  z.object({ tipo: z.literal('entrar_masmorra'), masmorra: Id, ...objBase }).strict(),
  z.object({ tipo: z.literal('vencer_andar'), masmorra: Id, andar: z.number().int().positive(), ...objBase }).strict(),
  z.object({ tipo: z.literal('visitar_lugar'), lugar: Id, ...objBase }).strict(),
  z.object({ tipo: z.literal('interagir'), alvo: Id, acao: Id, quantidade: z.number().int().positive().default(1), lugar: Id.optional(), ...objBase }).strict(),
  z.object({ tipo: z.literal('entregar'), npc: Id, recurso: Resource.optional(), chave: Id.optional(), quantidade: z.number().int().positive(), ...objBase }).strict(),
  z.object({ tipo: z.literal('pagar'), moeda: z.enum(['semente', 'credito']), quantidade: z.number().int().positive(), ...objBase }).strict(),
  z.object({ tipo: z.literal('debater'), oponente: Id, rodadas: z.number().int().positive(), ...objBase }).strict(),
  z.object({ tipo: z.literal('escoltar'), npc: Id, ate: Id, ...objBase }).strict(),
  z.object({ tipo: z.literal('construir'), estrutura: Id, duracaoS: z.number().int().positive(), ...objBase }).strict(),
  z.object({ tipo: z.literal('escolher_guia'), margem: Side, ...objBase }).strict(),
  z.object({ tipo: z.literal('escolher_ala'), ...objBase }).strict(),
]);
export type Objective = z.infer<typeof Objective>;

export const MissionRewards = z
  .object({
    /** recompensa de sempre, sozinho ou em grupo: itens e materiais, nunca XP */
    solo: z.array(Reward).default([]),
    /**
     * extra quando a luta foi em grupo (2+ do mesmo lado, contando plantonistas e IA, inclusive
     * os `aliadosIA` da missão): é aqui que entra o XP, com +15% por jogador ao vivo a mais
     */
    grupo: z.array(Reward).default([]),
    ...Sugestao,
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.solo.some((x) => x.kind === 'xp')) ctx.addIssue({ code: 'custom', message: 'XP só em grupo: recompensa solo com XP' });
  });
export type MissionRewards = z.infer<typeof MissionRewards>;

export const Mission = z
  .object({
    id: Id,
    name: z.string().min(1),
    /** tipo da tabela de missões, quando for uma delas */
    tipo: Id.optional(),
    cadeia: Id.optional(),
    dadaPor: Id,
    nivel: z.number().int().positive(),
    nivelMax: z.number().int().positive().optional(),
    regiao: Id,
    lugar: Id.optional(),
    margem: Side.optional(),
    instituicao: Id.optional(),
    modo: z.enum(['solo', 'grupo', 'qualquer']),
    /** NPCs de IA que lutam junto e fazem a luta contar como grupo */
    aliadosIA: z.array(Id).optional(),
    /** uma linha de contexto, sem texto longo */
    resumo: z.string().min(1),
    /** texto exato dos docs, quando a missão sai de uma tabela */
    textoDoc: z.string().optional(),
    objetivos: z.array(Objective).min(1),
    recompensas: MissionRewards,
    requerFlags: z.array(Id).default([]),
    bloqueadaPorFlags: z.array(Id).default([]),
    ligaFlags: z.array(Id).default([]),
    repetivel: z.boolean().optional(),
    emPiloto: z.boolean(),
    /** esboço: passos de alto nível, a detalhar depois do piloto */
    esboco: z.boolean().optional(),
    /**
     * Ordens do comando: modelo que a liderança (IA de facção no piloto) usa quando a prioridade
     * da semana é esta (faction_ai.json, regras.decisao.prioridadeDaSemana)
     */
    prioridade: z.enum(['construir', 'defender', 'invadir']).optional(),
    ...Sugestao,
  })
  .strict()
  .superRefine((m, ctx) => {
    if (m.prioridade && m.tipo !== 'ordens_do_comando') {
      ctx.addIssue({ code: 'custom', message: `${m.id}: prioridade só vale para o tipo ordens_do_comando` });
    }
  });
export type Mission = z.infer<typeof Mission>;

/** Linha da tabela "Missões" de Sistemas.md. */
export const MissionType = z
  .object({
    id: Id,
    name: z.string().min(1),
    /** texto exato da coluna Modo */
    modo: z.string().min(1),
    /** leitura do modo para o código */
    modoTags: z
      .object({
        grupo: z.boolean(),
        solo: z.boolean(),
        margem: Side.optional(),
        misto: z.boolean().optional(),
        evento: z.boolean().optional(),
        varia: z.boolean().optional(),
        ...Sugestao,
      })
      .strict(),
    comoFunciona: z.string().min(1),
    oQueMuda: z.string().min(1),
    /** efeito no mundo ao concluir */
    efeito: z.array(Reward).default([]),
    emPiloto: z.boolean(),
    notaPiloto: z.string().optional(),
    ...Sugestao,
  })
  .strict();
export type MissionType = z.infer<typeof MissionType>;

export const MissionChain = z
  .object({
    id: Id,
    name: z.string().min(1),
    nivelMin: z.number().int().positive(),
    nivelMax: z.number().int().positive(),
    margem: Side.optional(),
    /** texto da jornada em Narrativa.md */
    textoDoc: z.string().min(1),
    missoes: z.array(Id).min(1),
    emPiloto: z.boolean(),
    esboco: z.boolean().optional(),
    ...Sugestao,
  })
  .strict();
export type MissionChain = z.infer<typeof MissionChain>;

export const MissionsFile = z
  .object({
    tipos: z.array(MissionType).length(18),
    cadeias: z.array(MissionChain).min(1),
    missoes: z.array(Mission).min(1),
    /** perigos de ambiente usados em objetivos `sobreviver` (ex.: chuva_de_tomate) */
    perigos: z.array(Hazard).default([]),
  })
  .strict();
export type MissionsFile = z.infer<typeof MissionsFile>;
