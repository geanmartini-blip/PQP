import { z } from 'zod';
import { ClassId, Id, Role, Side, Sugestao } from './common';

/**
 * Pessoas do jogo: os 24 treinadores (NPCs, nunca jogáveis), os personagens da história e da
 * cidade, os NPCs menores e os heróis da cidade unida (só lore).
 *
 * Falas aceitam o marcador {nome}, trocado pelo nome do jogador.
 */

export const Fala = z.string().min(1);
export type Fala = z.infer<typeof Fala>;

/** Bordão que o jogador ganha como emote (Sistemas.md: "o jogador ganha como emote"). */
export const Emote = z
  .object({
    id: Id,
    texto: z.string().min(1),
    /** chave da animação no gerador do cliente */
    animacao: Id,
    descricaoAnimacao: z.string().min(1),
    /** quadros da animação (as de vitória e derrota têm 3 em Arte.md) */
    quadros: z.number().int().positive(),
    ...Sugestao,
  })
  .strict();
export type Emote = z.infer<typeof Emote>;

/** Falas de cada treinador por situação, com o mínimo pedido pelo briefing do domínio. */
export const FalasTreinador = z
  .object({
    saudacao: z.array(Fala).min(3),
    treino: z.array(Fala).min(3),
    entregaMissao: z.array(Fala).min(3),
    vitoria: z.array(Fala).min(2),
    derrota: z.array(Fala).min(2),
    /** soltas pela cidade, ao passar perto */
    cidade: z.array(Fala).min(4),
    ...Sugestao,
  })
  .strict();
export type FalasTreinador = z.infer<typeof FalasTreinador>;

/** Quando uma etapa de arco entra: nível do jogador e/ou story_flag. */
export const Gatilho = z
  .object({
    nivelMin: z.number().int().positive().optional(),
    storyFlag: Id.optional(),
  })
  .strict()
  .refine((g) => g.nivelMin !== undefined || g.storyFlag !== undefined, {
    message: 'gatilho precisa de nivelMin ou storyFlag',
  });
export type Gatilho = z.infer<typeof Gatilho>;

export const EtapaArco = z
  .object({
    id: Id,
    gatilho: Gatilho,
    descricao: z.string().min(1),
    /** quem salva ou muda o treinador nessa etapa (id de treinador ou NPC) */
    salvoPor: Id.optional(),
    /** troca de visual do NPC nessa etapa, se houver */
    visual: z.string().optional(),
    /** falas que passam a valer a partir da etapa (somam às falas fixas) */
    falas: z.array(Fala).min(1),
    ...Sugestao,
  })
  .strict();
export type EtapaArco = z.infer<typeof EtapaArco>;

export const Arco = z
  .object({
    id: Id,
    resumo: z.string().min(1),
    etapas: z.array(EtapaArco).min(1),
    ...Sugestao,
  })
  .strict();
export type Arco = z.infer<typeof Arco>;

/** Visual de NPC (Arte.md): descrição, 3 poses, piada e chave de arte do gerador. */
export const VisualNpc = z
  .object({
    descricao: z.string().min(1),
    poses: z.array(z.string().min(1)).optional(),
    piada: z.string().optional(),
    artKey: Id,
    ...Sugestao,
  })
  .strict();
export type VisualNpc = z.infer<typeof VisualNpc>;

export const BordaoVirada = z
  .object({
    /**
     * id da HABILIDADE de virada (virada_<arquetipo>, abilities_special.json), não do talento
     * do nível 30 que a libera (ex.: o talento 'desconstruido' troca o Especial por 'virada_peao_brabo')
     */
    virada: Id,
    texto: z.string().min(1),
    emote: Emote,
    ...Sugestao,
  })
  .strict();

export const RespostaGuia = z
  .object({
    texto: z.string().min(1),
    /** quem responde: o espírito guia (Esquerda) ou a IA de bolso (Direita) */
    quem: z.enum(['espirito_guia', 'ia_de_bolso', 'guia']),
    /** quando a resposta toca */
    quando: z.enum(['emote_bordao', 'fala_do_treinador']),
    ...Sugestao,
  })
  .strict();

export const Trainer = z
  .object({
    id: Id,
    name: z.string().min(1),
    apelido: z.string().optional(),
    /** ala que treina (id do arquétipo) */
    archetype: Id,
    institution: Id,
    side: Side,
    classId: ClassId,
    role: Role,
    /** recebe os novatos e treina a base da instituição (missão de entrada) */
    recebeBase: z.boolean(),
    origem: z.string().optional(),
    /** texto da tabela de treinadores de Sistemas.md */
    bio: z.string().min(1),
    /** texto de Narrativa.md, quando existe */
    bioNarrativa: z.string().optional(),
    bordao: z.string().min(1),
    emote: Emote,
    bordaoVirada: BordaoVirada.optional(),
    respostaGuia: RespostaGuia.optional(),
    visual: VisualNpc,
    falas: FalasTreinador,
    arco: Arco.optional(),
    /** o mesmo personagem também ocupa cargo como IA de facção */
    iaFaccao: Id.optional(),
    ...Sugestao,
  })
  .strict();
export type Trainer = z.infer<typeof Trainer>;

export const TrainersFile = z
  .array(Trainer)
  .length(24)
  .superRefine((ts, ctx) => {
    const ids = new Set<string>();
    const archs = new Set<string>();
    for (const t of ts) {
      if (ids.has(t.id)) ctx.addIssue({ code: 'custom', message: `treinador repetido: ${t.id}` });
      if (archs.has(t.archetype)) ctx.addIssue({ code: 'custom', message: `ala com dois treinadores: ${t.archetype}` });
      ids.add(t.id);
      archs.add(t.archetype);
    }
    const base = ts.filter((t) => t.recebeBase);
    if (base.length !== 8) ctx.addIssue({ code: 'custom', message: `esperado 8 treinadores de base, veio ${base.length}` });
    if (new Set(base.map((t) => t.institution)).size !== base.length) {
      ctx.addIssue({ code: 'custom', message: 'instituição com dois treinadores de base' });
    }
  });
export type TrainersFile = z.infer<typeof TrainersFile>;

/** Grupo de falas de um NPC por contexto (tutorial, travessia, chefe, rádio, aleatórias...). */
export const GrupoFalas = z
  .object({
    contexto: Id,
    descricao: z.string().optional(),
    linhas: z.array(Fala).min(1),
    ...Sugestao,
  })
  .strict();
export type GrupoFalas = z.infer<typeof GrupoFalas>;

export const Npc = z
  .object({
    id: Id,
    name: z.string().min(1),
    apelido: z.string().optional(),
    categoria: z.enum(['historia', 'lider', 'mirante', 'menor']),
    lado: z.enum(['esquerda', 'direita', 'neutro', 'mirante']),
    /** quem é (Narrativa.md, quando existe) */
    quemE: z.string().min(1),
    /** como aparece para o jogador */
    apresentacao: z.enum(['presencial', 'radio', 'holograma']),
    visual: VisualNpc.optional(),
    /** regiões onde aparece (ids de região) */
    regioes: z.array(Id).min(1),
    noPiloto: z.boolean(),
    /** id do inimigo quando também é chefe */
    inimigo: Id.optional(),
    falas: z.array(GrupoFalas),
    ...Sugestao,
  })
  .strict();
export type Npc = z.infer<typeof Npc>;

/** Heróis da cidade unida: nome de rua, de praça e de item único. Só lore. */
export const Homenagem = z
  .object({
    tipo: z.enum(['unico', 'lugar_que_ensina', 'lugar', 'nome']),
    name: z.string().min(1),
    descricao: z.string().optional(),
    ...Sugestao,
  })
  .strict();

export const Heroi = z
  .object({
    id: Id,
    name: z.string().min(1),
    quemE: z.string().min(1),
    homenagens: z.array(Homenagem),
    /** placa de rua ou praça com o nome do herói */
    placa: z.string().optional(),
    ...Sugestao,
  })
  .strict();
export type Heroi = z.infer<typeof Heroi>;

export const NpcsFile = z
  .object({
    personagens: z.array(Npc).min(1),
    herois: z.array(Heroi).length(10),
  })
  .strict()
  .superRefine((f, ctx) => {
    const ids = new Set<string>();
    for (const x of [...f.personagens, ...f.herois]) {
      if (ids.has(x.id)) ctx.addIssue({ code: 'custom', message: `id repetido em npcs: ${x.id}` });
      ids.add(x.id);
    }
  });
export type NpcsFile = z.infer<typeof NpcsFile>;
