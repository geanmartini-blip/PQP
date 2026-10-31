import { z } from 'zod';
import { Id, Side, Sugestao } from './common';
import { Moeda, PatenteId } from './society';

/**
 * Moradia do jogador e catálogo de móveis (estilo Habbo).
 * Fonte: Sistemas.md, "Moradia do jogador". Tamanhos, preços e bônus são sugestão.
 */

const ArtKey = z.string().regex(/^[a-z0-9_/]+$/, 'chave de arte em snake_case com /');

export const Tamanho = z
  .object({
    /** largura e altura em tiles de 32 px */
    w: z.number().int().positive(),
    h: z.number().int().positive(),
    ...Sugestao,
  })
  .strict();
export type Tamanho = z.infer<typeof Tamanho>;

export const AcessoMoradia = z.enum(['provisoria', 'lista_de_espera', 'mutirao', 'aluguel', 'financiamento']);
export type AcessoMoradia = z.infer<typeof AcessoMoradia>;

export const Recurso = z.object({ recurso: Id, quantidade: z.number().int().positive(), ...Sugestao }).strict();

export const Moradia = z
  .object({
    id: Id,
    name: z.string().min(1),
    side: Side,
    acesso: AcessoMoradia,
    /** área interna decorável, em tiles */
    tamanho: Tamanho,
    /** aluguel por ciclo (cápsula); é o piso: o preço de vida sobe o valor (HousingFile.aluguel.formula) */
    aluguel: z.object({ moeda: Moeda, porCiclo: z.number().positive(), ...Sugestao }).strict().optional(),
    /** financiamento (apartamento) */
    financiamento: z
      .object({
        moeda: Moeda,
        valorTotal: z.number().positive(),
        entradaPct: z.number().min(0).max(100),
        parcelas: z.number().int().positive(),
        valorParcela: z.number().positive(),
        ...Sugestao,
      })
      .strict()
      .optional(),
    /** materiais do mutirão (iguais ao custo da estrutura, quando há `estrutura`) */
    materiais: z.array(Recurso).optional(),
    /** estrutura do mapa (structures.json) que o mutirão ergue para esta moradia */
    estrutura: Id.optional(),
    vendavel: z.boolean(),
    patenteMin: PatenteId,
    /** espaços do baú da casa */
    bauSlots: z.number().int().positive(),
    /** bônus de descanso base da moradia, em % de XP de grupo */
    descansoPct: z.number().nonnegative(),
    visitasMax: z.number().int().nonnegative(),
    moveisMax: z.number().int().positive(),
    artKey: ArtKey,
    piada: z.string().optional(),
    foraDoPiloto: z.boolean().optional(),
    ...Sugestao,
  })
  .strict()
  .superRefine((m, ctx) => {
    if (m.acesso === 'aluguel' && !m.aluguel) ctx.addIssue({ code: 'custom', message: `${m.id}: aluguel sem preço` });
    if (m.acesso === 'financiamento' && !m.financiamento) ctx.addIssue({ code: 'custom', message: `${m.id}: financiamento sem valores` });
    if (m.acesso === 'mutirao' && !m.materiais) ctx.addIssue({ code: 'custom', message: `${m.id}: mutirão sem materiais` });
    if (m.side === 'esquerda' && m.vendavel) ctx.addIssue({ code: 'custom', message: `${m.id}: casa da Esquerda não pode ser vendida` });
  });
export type Moradia = z.infer<typeof Moradia>;

export const HousingFile = z
  .object({
    ciclo: z
      .object({
        descricao: z.string(),
        /** duração do ciclo da cidade em dias (aluguel, parcelas e despejo contam por ele) */
        dias: z.number().positive(),
        notaPiloto: z.string(),
        ...Sugestao,
      })
      .strict(),
    tipos: z.array(Moradia).min(4),
    listaDeEspera: z
      .object({
        descricao: z.string(),
        ciclosBase: z.number().int().nonnegative(),
        /** ajudar no mutirão de outro jogador tira N ciclos da sua espera */
        mutiraoReduzCiclos: z.number().int().nonnegative(),
        /** enquanto espera, mora aqui */
        moradiaProvisoria: Id,
        moradiaFinal: Id,
        ...Sugestao,
      })
      .strict(),
    mutirao: z
      .object({
        descricao: z.string(),
        /** missão repetível que ergue a casa própria (missions.json) */
        missao: Id,
        jogadoresMin: z.number().int().positive(),
        jogadoresMax: z.number().int().positive(),
        /** plantonistas e IA contam para o mínimo */
        plantonistaConta: z.boolean(),
        duracaoMin: z.number().positive(),
        casaVaiPara: z.string(),
        ajudantes: z.object({ reputacao: z.number().int(), descricao: z.string(), ...Sugestao }).strict(),
        ...Sugestao,
      })
      .strict(),
    aluguel: z
      .object({
        descricao: z.string(),
        cobranca: z.string(),
        /** o preço de vida mexe com o aluguel (Sistemas.md, Medidores) */
        formula: z.string().min(1),
        /** preço de vida em que o aluguel vale porCiclo (o da Margem Direita no começo) */
        precoDeVidaReferencia: z.number().positive(),
        /** limites do multiplicador sobre porCiclo */
        multMin: z.number().positive(),
        multMax: z.number().positive(),
        ...Sugestao,
      })
      .strict()
      .refine((a) => a.multMin <= a.multMax, { message: 'aluguel: multMin > multMax' }),
    financiamento: z
      .object({
        descricao: z.string(),
        parcelas: z.literal(360),
        /** precisa de faixa de score que permita financiar */
        exigeScore: z.boolean(),
        venda: z
          .object({
            descricao: z.string(),
            /** taxa do Consórcio na venda do apartamento */
            taxaPct: z.number().nonnegative(),
            ...Sugestao,
          })
          .strict(),
        ...Sugestao,
      })
      .strict(),
    despejo: z
      .object({
        descricao: z.string(),
        ciclosDeAtraso: z.literal(3),
        moveisVaoPara: z.literal('deposito'),
        deposito: z
          .object({
            local: Id,
            taxaPorMovelPorCiclo: z.number().nonnegative(),
            prazoCiclos: z.number().int().positive(),
            depoisDoPrazo: z.string(),
            ...Sugestao,
          })
          .strict(),
        avisos: z.array(z.string()),
        apartamento: z.string(),
        ...Sugestao,
      })
      .strict(),
    comum: z
      .object({
        guardaItens: z.object({ descricao: z.string(), ...Sugestao }).strict(),
        descanso: z
          .object({
            descricao: z.string(),
            /** segundos dentro de casa para encher o descanso */
            tempoDentroS: z.number().positive(),
            duracaoBonusMin: z.number().positive(),
            stat: z.literal('xp'),
            /** teto do bônus somando moradia, móveis e assinatura */
            capPct: z.number().positive(),
            ...Sugestao,
          })
          .strict(),
        visitas: z
          .object({
            descricao: z.string(),
            permissoes: z.array(z.enum(['so_eu', 'grupo', 'margem', 'todos'])),
            padrao: z.enum(['so_eu', 'grupo', 'margem', 'todos']),
            outraMargem: z.string(),
            livroDeVisitas: z.boolean(),
            ...Sugestao,
          })
          .strict(),
        decoracao: z
          .object({
            descricao: z.string(),
            gradeTiles: z.literal(true),
            rotacoes: z.number().int().positive(),
            empilhar: z.boolean(),
            itensDeParede: z.boolean(),
            ...Sugestao,
          })
          .strict(),
      })
      .strict(),
    trocaDeLado: z
      .object({
        /** texto do doc (Morte, loot e troca de lado) */
        descricao: z.string().min(1),
        moveisVaoPara: z.enum(['inventario', 'deposito']),
        foraDoPiloto: z.literal(true),
        ...Sugestao,
      })
      .strict(),
  })
  .strict();
export type HousingFile = z.infer<typeof HousingFile>;

/* ------------------------------------------------------------------ */
/* Móveis (furniture.json)                                              */
/* ------------------------------------------------------------------ */

export const PrecoMovel = z.object({ moeda: Moeda, valor: z.number().positive() }).strict();

export const Movel = z
  .object({
    id: Id,
    name: z.string().min(1),
    /** delta = neutro, vende nas duas moedas */
    estilo: z.enum(['esquerda', 'direita', 'delta']),
    categoria: z.enum(['assento', 'cama', 'mesa', 'armazenamento', 'planta', 'luz', 'parede', 'chao', 'eletronico', 'decoracao']),
    tamanho: Tamanho,
    preco: z.array(PrecoMovel).min(1),
    artKey: ArtKey,
    piada: z.string().min(1),
    interacao: z.enum(['nenhuma', 'sentar', 'deitar', 'ligar', 'regar', 'tocar', 'abrir']).default('nenhuma'),
    /** soma ao bônus de descanso da moradia, em pontos percentuais */
    descansoPct: z.number().nonnegative().optional(),
    /** espaços extras de baú */
    bauSlots: z.number().int().positive().optional(),
    /** vai na parede, não ocupa chão */
    parede: z.boolean().optional(),
    /** só funciona com essa assinatura do app em dia */
    requerAssinatura: Id.optional(),
    patenteMin: PatenteId.optional(),
    notas: z.string().optional(),
    ...Sugestao,
  })
  .strict()
  .superRefine((m, ctx) => {
    const moedas = m.preco.map((p) => p.moeda);
    if (m.estilo === 'esquerda' && moedas.some((x) => x !== 'semente')) ctx.addIssue({ code: 'custom', message: `${m.id}: móvel da Esquerda custa Semente` });
    if (m.estilo === 'direita' && moedas.some((x) => x !== 'credito')) ctx.addIssue({ code: 'custom', message: `${m.id}: móvel da Direita custa Crédito` });
  });
export type Movel = z.infer<typeof Movel>;

export const FurnitureFile = z.array(Movel).min(40);
export type FurnitureFile = z.infer<typeof FurnitureFile>;
