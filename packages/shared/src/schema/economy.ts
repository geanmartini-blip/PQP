import { z } from 'zod';
import { Id, Side, Sugestao } from './common';
import { Moeda } from './society';

/**
 * Economia básica do piloto: Semente e Crédito, score, feira, app, câmbio na ponte,
 * contrabando pelo Juncal, Plano e Empresa, saúde e saldo inicial.
 * Fonte: Sistemas.md ("As duas sociedades", "Comércio", "Plano e Empresa", "Medidores").
 * Quase todos os números são sugestão (os docs não trazem preços).
 *
 * Duas unidades de tempo, que não se misturam:
 * - ciclo da cidade (semanal, housing.json `ciclo.dias`): todo campo `porCiclo`, `limitePorCiclo`,
 *   `jurosPctCiclo`, `precoPorCiclo`, `lucroPorCiclo*` e `consultasPorCiclo` conta por ele;
 * - ciclo de produção (faction_ai.json `regras.decisao.cicloProducaoMin`, 60 min): campos com o sufixo
 *   `CiclosProducao` (duração de anúncio, reajuste da feira).
 */

export { Moeda };

export const Preco = z
  .object({
    moeda: Moeda,
    valor: z.number().nonnegative(),
    ...Sugestao,
  })
  .strict();
export type Preco = z.infer<typeof Preco>;

/** Uma linha de "de onde vem" ou "para onde vai" o dinheiro. */
export const FluxoDinheiro = z
  .object({
    id: Id,
    name: z.string().min(1),
    moedas: z.array(Moeda).min(1),
    /** faixa típica por ocorrência */
    min: z.number().nonnegative(),
    max: z.number().nonnegative(),
    descricao: z.string().min(1),
    /** arquivo de dados que manda no número exato, quando não é este */
    ref: z.string().optional(),
    foraDoPiloto: z.boolean().optional(),
    ...Sugestao,
  })
  .strict();
export type FluxoDinheiro = z.infer<typeof FluxoDinheiro>;

export const MoedaInfo = z
  .object({
    id: Moeda,
    name: z.string().min(1),
    side: Side,
    descricao: z.string().min(1),
    /** símbolo curto na interface */
    simbolo: z.string().min(1).max(4),
    /** a Direita tem score de Crédito */
    temScore: z.boolean(),
    artKey: z.string().regex(/^[a-z0-9_/]+$/),
    ...Sugestao,
  })
  .strict();

export const EventoScore = z
  .object({
    id: Id,
    name: z.string().min(1),
    delta: z.number().int(),
    /** máximo que esse evento soma ou tira por ciclo (0 = sem limite) */
    limitePorCiclo: z.number().int().nonnegative().default(0),
    ...Sugestao,
  })
  .strict();

export const FaixaScore = z
  .object({
    id: Id,
    name: z.string().min(1),
    min: z.number().int().nonnegative(),
    max: z.number().int().nonnegative(),
    /** pontos percentuais somados à taxa do app */
    taxaAppPp: z.number(),
    /** juros por ciclo no crédito da Empresa e no financiamento, em % */
    jurosPctCiclo: z.number().nonnegative(),
    podeFinanciar: z.boolean(),
    /** o drone de cobrança aparece no mapa */
    droneDeCobranca: z.boolean(),
    piada: z.string().optional(),
    ...Sugestao,
  })
  .strict();

export const Score = z
  .object({
    descricao: z.string().min(1),
    min: z.number().int().nonnegative(),
    max: z.number().int().positive(),
    inicial: z.number().int().nonnegative(),
    faixas: z.array(FaixaScore).min(2),
    sobe: z.array(EventoScore),
    cai: z.array(EventoScore),
    ...Sugestao,
  })
  .strict();

export const SaldoInicial = z
  .object({
    /** no Delta (1 a 7), o jogador junta trocados das duas moedas */
    delta: z
      .object({ semente: z.number().int().nonnegative(), credito: z.number().int().nonnegative(), descricao: z.string(), ...Sugestao })
      .strict(),
    travessia: z
      .object({
        esquerda: z
          .object({ semente: z.number().int().nonnegative(), credito: z.number().int().nonnegative(), extras: z.array(z.string()), ...Sugestao })
          .strict(),
        direita: z
          .object({
            semente: z.number().int().nonnegative(),
            credito: z.number().int().nonnegative(),
            /** já sai descontado do primeiro pagamento (aluguel da cápsula) */
            descontoAutomatico: z.object({ motivo: z.string(), valor: z.number().int().nonnegative(), ...Sugestao }).strict(),
            score: z.number().int().nonnegative(),
            extras: z.array(z.string()),
            ...Sugestao,
          })
          .strict(),
        /** o que acontece com os trocados da moeda da outra margem */
        trocadosDaOutraMargem: z.string(),
        ...Sugestao,
      })
      .strict(),
    ...Sugestao,
  })
  .strict();

export const ItemTabelado = z
  .object({
    id: Id,
    name: z.string().min(1),
    /** preço tabelado da feira, em Semente */
    precoSemente: z.number().positive(),
    /** preço base no app, em Crédito, antes do preço dinâmico */
    precoBaseCredito: z.number().positive(),
    /** item do botão de item, recurso ou material */
    tipo: z.enum(['recurso', 'consumivel', 'material']),
    ...Sugestao,
  })
  .strict();

export const LojasNpc = z
  .object({
    descricao: z.string(),
    /** quanto a loja paga ao comprar item do jogador, em fração do preço tabelado ou base */
    compraDoJogadorPct: z.number().min(0).max(1),
    /** multiplicador de preço por nível de loja liberado pela patente */
    nivelMult: z.array(z.number().positive()).length(4),
    ...Sugestao,
  })
  .strict();

export const Feira = z
  .object({
    side: z.literal('esquerda'),
    moeda: z.literal('semente'),
    local: Id,
    descricao: z.string(),
    trocaDireta: z
      .object({
        descricao: z.string(),
        /** itens e recursos por lado da troca */
        maxItensPorLado: z.number().int().positive(),
        taxa: z.number().nonnegative(),
        ...Sugestao,
      })
      .strict(),
    vendas: z
      .object({
        descricao: z.string(),
        taxaPct: z.number().nonnegative(),
        /** anúncio expira depois de N ciclos de produção (60 min cada), não do ciclo semanal da cidade */
        anuncioDuraCiclosProducao: z.number().int().positive(),
        /** itens fora da tabela: preço livre, com teto em múltiplo do preço de NPC */
        tetoLivreMult: z.number().positive(),
        ...Sugestao,
      })
      .strict(),
    precosTabelados: z.array(ItemTabelado).min(1),
    fila: z
      .object({
        descricao: z.string(),
        /** segundos de espera por pessoa à frente para retirar a compra */
        esperaPorPessoaS: z.number().nonnegative(),
        esperaMaxS: z.number().nonnegative(),
        /** quem fica na fila pode sair e voltar sem perder o lugar (offline conta) */
        guardaLugar: z.boolean(),
        prioridade: z.string(),
        ...Sugestao,
      })
      .strict(),
    /** preço de vida mexe com a feira: tabela é revista pela Assembleia */
    reajuste: z
      .object({
        descricao: z.string(),
        /** a tabela só muda a cada N ciclos de produção (60 min cada), e no máximo X% por vez */
        aCadaCiclosProducao: z.number().int().positive(),
        maxPct: z.number().positive(),
        ...Sugestao,
      })
      .strict(),
    ...Sugestao,
  })
  .strict();

export const Assinatura = z
  .object({
    id: Id,
    name: z.string().min(1),
    precoPorCiclo: z.number().positive(),
    efeito: z.string().min(1),
    piada: z.string().optional(),
    ...Sugestao,
  })
  .strict();

export const App = z
  .object({
    side: z.literal('direita'),
    moeda: z.literal('credito'),
    name: z.string().min(1),
    descricao: z.string(),
    taxaConsorcioPct: z.number().nonnegative(),
    /** taxa fixa por venda, além da percentual */
    taxaConveniencia: z.number().nonnegative(),
    /** anúncio expira depois de N ciclos de produção (60 min cada) */
    lojinha: z.object({ descricao: z.string(), anuncioDuraCiclosProducao: z.number().int().positive(), ...Sugestao }).strict(),
    leilao: z
      .object({
        descricao: z.string(),
        duracoesH: z.array(z.number().positive()).min(1),
        incrementoMinPct: z.number().positive(),
        /** lance nos últimos N segundos estende o leilão em N segundos */
        antiSniperS: z.number().int().nonnegative(),
        ...Sugestao,
      })
      .strict(),
    entrega: z
      .object({
        descricao: z.string(),
        /** frete base para receber fora do QG */
        freteBase: z.number().nonnegative(),
        /** frete cresce com a distância em regiões e com o preço de vida */
        porRegiao: z.number().nonnegative(),
        ...Sugestao,
      })
      .strict(),
    precoDinamico: z
      .object({
        descricao: z.string(),
        formula: z.string(),
        /** peso da diferença entre procura e oferta */
        kDemanda: z.number(),
        /** multiplicador quando a região está em apagão */
        apagaoMult: z.number().positive(),
        /** "sobe quando chove e quando não chove" */
        chuvaMult: z.number().positive(),
        semChuvaMult: z.number().positive(),
        min: z.number().positive(),
        max: z.number().positive(),
        recalculaACadaMin: z.number().positive(),
        ...Sugestao,
      })
      .strict(),
    assinaturas: z.array(Assinatura),
    ...Sugestao,
  })
  .strict();

export const Cambio = z
  .object({
    local: Id,
    descricao: z.string(),
    /** cotação = Créditos por 1 Semente */
    base: z.number().positive(),
    formula: z.string(),
    variaveis: z.array(z.object({ id: z.string(), descricao: z.string(), ...Sugestao }).strict()),
    kInfluencia: z.number(),
    kEnergia: z.number(),
    kPrecoDeVida: z.number(),
    min: z.number().positive(),
    max: z.number().positive(),
    /** diferença entre compra e venda, cobrada pela prefeitura da ponte */
    spreadPct: z.number().nonnegative(),
    recalculaACadaMin: z.number().positive(),
    /** limite por jogador por ciclo, em Semente equivalente */
    limitePorCicloSemente: z.number().int().positive(),
    npc: Id,
    ...Sugestao,
  })
  .strict();

export const Contrabando = z
  .object({
    npc: Id,
    regiao: Id,
    descricao: z.string(),
    taxaPct: z.literal(0),
    fila: z.literal(false),
    /** câmbio do Bruno: cotação oficial sem spread, com variação própria */
    cambio: z.object({ descricao: z.string(), variacaoPct: z.number().nonnegative(), ...Sugestao }).strict(),
    risco: z
      .object({
        descricao: z.string(),
        /** chance de batida por negócio */
        chanceBatidaPct: z.number().min(0).max(100),
        /** sobe com o valor do negócio: +X pontos a cada Y Semente equivalente */
        chanceExtraPorFaixa: z.object({ pontos: z.number().nonnegative(), aCada: z.number().positive(), ...Sugestao }).strict(),
        chanceMaxPct: z.number().min(0).max(100),
        confiscoPct: z.number().min(0).max(100),
        reputacao: z.number().int(),
        score: z.number().int(),
        julgamento: z.object({ esquerda: z.string(), direita: z.string(), ...Sugestao }).strict(),
        ...Sugestao,
      })
      .strict(),
    limitePorCicloSemente: z.number().int().positive(),
    /**
     * a missão Negócio com o Capataz muda o preço da chopindita: recompensa `preco` com
     * preco 'chopindita_contrabando' (world.ts). A loja do contrabando (shops.json) parte deste base.
     */
    precoChopindita: z
      .object({
        baseSemente: z.number().positive(),
        variacaoMissaoPct: z.number().positive(),
        /** como a variação da missão se aplica (não acumula, dura N ciclos de produção) */
        regra: z.string().optional(),
        /** quantos ciclos de produção dura o preço barganhado antes de voltar ao base */
        duraCiclosProducao: z.number().int().positive().optional(),
        ...Sugestao,
      })
      .strict(),
    ...Sugestao,
  })
  .strict();

export const Plano = z
  .object({
    side: z.literal('esquerda'),
    descricao: z.string(),
    /** cota por patente, por ciclo */
    cotas: z.array(
      z
        .object({
          patente: Id,
          missoesDeGrupo: z.number().int().nonnegative(),
          minutosDePlantao: z.number().int().nonnegative(),
          recursos: z.array(z.object({ recurso: Id, quantidade: z.number().int().positive(), ...Sugestao }).strict()),
          ...Sugestao,
        })
        .strict(),
    ),
    cumpriu: z.object({ reputacao: z.number().int(), semente: z.number().int().nonnegative(), descricao: z.string(), ...Sugestao }).strict(),
    naoCumpriu: z.object({ reputacao: z.number().int(), descricao: z.string(), ...Sugestao }).strict(),
    cooperativas: z.string(),
    foraDoPiloto: z.boolean().optional(),
    ...Sugestao,
  })
  .strict();

export const TrabalhoDireita = z
  .object({
    bico: z
      .object({
        descricao: z.string(),
        pagamentoMin: z.number().nonnegative(),
        pagamentoMax: z.number().nonnegative(),
        /** fatia do aplicativo em cada bico */
        taxaAppPct: z.number().nonnegative(),
        ...Sugestao,
      })
      .strict(),
    metas: z
      .object({
        descricao: z.string(),
        porPatente: z.array(z.object({ patente: Id, bicos: z.number().int().nonnegative(), missoesDeGrupo: z.number().int().nonnegative(), creditosMovimentados: z.number().int().nonnegative(), ...Sugestao }).strict()),
        bateu: z.object({ reputacao: z.number().int(), credito: z.number().int().nonnegative(), score: z.number().int(), ...Sugestao }).strict(),
        naoBateu: z.object({ reputacao: z.number().int(), descricao: z.string(), ...Sugestao }).strict(),
        ...Sugestao,
      })
      .strict(),
    ...Sugestao,
  })
  .strict();

export const Empresa = z
  .object({
    side: z.literal('direita'),
    descricao: z.string(),
    negocios: z.array(
      z
        .object({
          id: Id,
          name: z.string().min(1),
          custoAbertura: z.number().positive(),
          lucroPorCicloMin: z.number().nonnegative(),
          lucroPorCicloMax: z.number().nonnegative(),
          /** estrutura do mapa que o negócio usa, quando usa */
          estrutura: Id.optional(),
          efeito: z.string(),
          ...Sugestao,
        })
        .strict(),
    ),
    taxaConsorcioPct: z.number().nonnegative(),
    credito: z
      .object({
        descricao: z.string(),
        /** limite = score x multiplicador */
        limitePorPontoDeScore: z.number().positive(),
        parcelasMax: z.number().int().positive(),
        /** juros vêm da faixa de score */
        juros: z.string(),
        ...Sugestao,
      })
      .strict(),
    patenteMin: Id,
    foraDoPiloto: z.boolean().optional(),
    ...Sugestao,
  })
  .strict();

export const PlanoSaude = z
  .object({
    id: z.enum(['bronze', 'prata', 'ouro']),
    name: z.string().min(1),
    precoPorCiclo: z.number().positive(),
    esperaS: z.number().nonnegative(),
    /** consultas grátis por ciclo (0 = ilimitado) */
    consultasPorCiclo: z.number().int().nonnegative(),
    extras: z.array(z.string()),
    patenteMin: Id,
    piada: z.string().optional(),
    ...Sugestao,
  })
  .strict();

export const Saude = z
  .object({
    descricao: z.string(),
    /** o que um atendimento faz */
    atendimento: z
      .object({
        descricao: z.string(),
        curaVidaPct: z.number().positive(),
        removeAbatido: z.boolean(),
        /** debuff "Abatido" depois de morrer, até ser atendido ou passar o tempo */
        abatido: z.object({ duracaoMin: z.number().positive(), atributosPct: z.number(), ...Sugestao }).strict(),
        ...Sugestao,
      })
      .strict(),
    posto: z
      .object({
        id: Id,
        name: z.string().min(1),
        side: z.literal('esquerda'),
        preco: z.literal(0),
        esperaBaseS: z.number().positive(),
        esperaPorPessoaS: z.number().nonnegative(),
        esperaMaxS: z.number().positive(),
        atalhos: z.string(),
        ...Sugestao,
      })
      .strict(),
    clinica: z
      .object({
        id: Id,
        name: z.string().min(1),
        side: z.literal('direita'),
        consultaAvulsa: z.number().positive(),
        esperaSemPlanoS: z.number().nonnegative(),
        planos: z.array(PlanoSaude).length(3),
        ...Sugestao,
      })
      .strict(),
    delta: z.string(),
    ...Sugestao,
  })
  .strict();

export const EconomyFile = z
  .object({
    /** as duas unidades de tempo usadas no arquivo (ver o comentário do topo) */
    ciclos: z
      .object({
        cidade: z.string().min(1),
        producao: z.string().min(1),
        ...Sugestao,
      })
      .strict(),
    moedas: z.array(MoedaInfo).length(2),
    recursos: z.array(z.object({ id: Id, name: z.string().min(1), descricao: z.string(), ...Sugestao }).strict()),
    score: Score,
    saldoInicial: SaldoInicial,
    fontesPiloto: z.array(FluxoDinheiro).min(1),
    sumidouros: z.array(FluxoDinheiro).min(1),
    lojasNpc: LojasNpc,
    feira: Feira,
    app: App,
    cambio: Cambio,
    contrabando: Contrabando,
    plano: Plano,
    trabalhoDireita: TrabalhoDireita,
    empresa: Empresa,
    saude: Saude,
  })
  .strict();
export type EconomyFile = z.infer<typeof EconomyFile>;
