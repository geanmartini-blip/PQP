import { z } from 'zod';
import { ClassId, Id, Side, Sugestao } from './common';
import { Ability, Passive, StatKey, StatMod } from './ability';

/**
 * Itens, únicos, sets, consumíveis, lojas de NPC e saque.
 *
 * Regras dos docs que estes esquemas carregam:
 * - 5 tipos (slots; v0.3: a calça entrou na armadura), um de cada por personagem. Comum, raro, único e set. Sem runas nem soquetes.
 * - Itens de outra classe não podem ser usados. Itens sem classe adotam o estilo da ala.
 * - A raridade aparece: comum simples, raro com detalhe, único com visual próprio, set completo muda a silhueta.
 * - Esquerda cresce com benzimento (reputação e lições); Direita com calibração (Crédito).
 * - Saque coletado sozinho, com filtro de raridade; comuns podem ir para a venda automática;
 *   rolagem individual por jogador.
 */

// ---------------------------------------------------------------------------
// Enums do domínio

export const ItemSlot = z.enum(['cabeca', 'peito', 'arma', 'calcado', 'adorno']);
export type ItemSlot = z.infer<typeof ItemSlot>;

export const ItemRarity = z.enum(['comum', 'raro', 'unico', 'set']);
export type ItemRarity = z.infer<typeof ItemRarity>;

/** Tipo de dano da classe (Vantagem entre classes, Sistemas.md). A arma define o tipo de ataque. */
export const ItemDamageType = z.enum(['impacto', 'perfurante', 'energia', 'espirito']);
export type ItemDamageType = z.infer<typeof ItemDamageType>;

/**
 * Esquerda: madeira, ferro, couro e palha. Direita: alta tecnologia.
 * Mirante: misto (Encanto e máquina), só lá em cima e fora do piloto; item misto não tem margem.
 */
export const ItemMaterial = z.enum(['madeira', 'ferro', 'couro', 'palha', 'alta_tecnologia', 'misto']);
export type ItemMaterial = z.infer<typeof ItemMaterial>;

export const ShopCurrency = z.enum(['semente', 'credito']);
export type ShopCurrency = z.infer<typeof ShopCurrency>;

/** Os 24 arquétipos (IDs fixos). Interno a este domínio para não colidir com o esquema de arquétipos. */
const ArquetipoId = z.enum([
  'peao_brabo',
  'iogue_furioso',
  'cidadao_revolucionario',
  'babushka',
  'arqueiro_das_estepes',
  'cacador_de_crocodilo',
  'druida_rabugento',
  'bruxa_do_trovao',
  'curandeira_dos_andes',
  'luchador_sagrado',
  'diva_da_opera',
  'malandro',
  'sumo_cibernetico',
  'o_fiel',
  'monstro_da_academia',
  'tropa_de_choque',
  'cowboy_cromado',
  'diretor_de_nollywood',
  'engenheira_de_gambiarra',
  'doktor_klaus',
  'coach_de_bem_estar',
  'atendente_imortal',
  'hacker_da_aldeia',
  'idol',
]);

const Texto = z.string().min(1);

/** Preço em uma ou nas duas moedas. */
export const ShopPrice = z
  .object({
    semente: z.number().int().positive().optional(),
    credito: z.number().int().positive().optional(),
    ...Sugestao,
  })
  .strict()
  .refine((p) => p.semente !== undefined || p.credito !== undefined, { message: 'preço precisa de semente ou credito' });
export type ShopPrice = z.infer<typeof ShopPrice>;

/** Faixa de rolagem de um atributo extra (raro). Para damageTaken e resourceCost os valores são negativos. */
export const StatRoll = z
  .object({ stat: StatKey, min: z.number(), max: z.number(), ...Sugestao })
  .strict()
  .refine((r) => r.min <= r.max, { message: 'min > max' });
export type StatRoll = z.infer<typeof StatRoll>;

/** Visual próprio (únicos, peças de set, set completo). */
export const OwnVisual = z
  .object({
    descricao: Texto,
    chaveArte: Id,
    /** variação opcional por margem (Encanto x máquina) */
    esquerda: z.string().optional(),
    direita: z.string().optional(),
    ...Sugestao,
  })
  .strict();
export type OwnVisual = z.infer<typeof OwnVisual>;

// ---------------------------------------------------------------------------
// items.json

export const SlotDef = z
  .object({
    id: ItemSlot,
    name: Texto,
    /** texto da tabela "O que costuma dar" (Sistemas.md) */
    costumaDar: Texto,
    /** atributos que os itens-base desse slot dão */
    statsBase: z.array(StatKey),
    /** de onde saem os 1 ou 2 atributos extras do raro */
    poolExtras: z.array(StatRoll).min(1),
    /** adorno: um efeito especial; só cabe um */
    efeitoEspecial: z.boolean().default(false),
    /** cabeça: o que cobre a cabeça esconde o cabelo, mas rosto e detalhes aparecem */
    escondeCabelo: z.boolean().default(false),
    /** como o texto de costumaDar virou atributos do motor (ex.: o que é "foco") */
    leitura: z.string().optional(),
    ...Sugestao,
  })
  .strict();
export type SlotDef = z.infer<typeof SlotDef>;

export const RarityDef = z
  .object({
    id: ItemRarity,
    name: Texto,
    /** o que a raridade faz (texto do doc) */
    efeito: Texto,
    /** como a raridade aparece no boneco (texto do doc) */
    visual: Texto,
    atributosExtras: z.object({ min: z.number().int().nonnegative(), max: z.number().int().nonnegative(), ...Sugestao }).strict(),
    /** chance de rolar o 2º extra quando max = 2 */
    chanceSegundoExtra: z.number().min(0).max(1).optional(),
    /** sufixo da chave de arte: <chaveArte do slot da ala>_<sufixo> */
    sufixoArte: Id,
    cor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    ...Sugestao,
  })
  .strict();
export type RarityDef = z.infer<typeof RarityDef>;

const StatsPorRaridade = z.record(ItemRarity, z.array(StatMod));

export const BaseStatsTable = z
  .object({
    descricao: Texto,
    /** valores em % sobre o atributo do personagem */
    porSlot: z.record(ItemSlot, StatsPorRaridade),
    ...Sugestao,
  })
  .strict();
export type BaseStatsTable = z.infer<typeof BaseStatsTable>;

/** Como um slot aparece numa ala: descrição do comum, do raro e a chave de arte. */
export const SlotVisual = z
  .object({
    comum: Texto,
    raro: Texto,
    /** chave base; a arte final é <chaveArte>_<sufixo da raridade> */
    chaveArte: Id,
    ...Sugestao,
  })
  .strict();
export type SlotVisual = z.infer<typeof SlotVisual>;

export const ArchetypeVisual = z
  .object({
    classe: ClassId,
    margem: Side,
    /** o que nunca some, com qualquer item (a Máquina de Visual nunca troca a silhueta) */
    silhueta: Texto,
    slots: z.record(ItemSlot, SlotVisual),
    ...Sugestao,
  })
  .strict();
export type ArchetypeVisual = z.infer<typeof ArchetypeVisual>;

export const GrowthLevel = z
  .object({
    nivel: z.number().int().positive(),
    /** bônus acumulado sobre os atributos do item, em % */
    bonusStatsPct: z.number().positive(),
    /** benzimento: reputação mínima na margem (não gasta) */
    reputacaoMin: z.number().int().nonnegative().optional(),
    /** benzimento: lições aprendidas nos Lugares que ensinam (não gasta) */
    licoesMin: z.number().int().nonnegative().optional(),
    /** benzimento: espera na fila da benzedeira, em segundos (o item segue usável) */
    filaS: z.number().int().nonnegative().optional(),
    /** calibração: custo em Crédito */
    custoCredito: z.number().int().positive().optional(),
    ...Sugestao,
  })
  .strict();
export type GrowthLevel = z.infer<typeof GrowthLevel>;

export const Growth = z
  .object({
    id: z.enum(['benzimento', 'calibracao']),
    name: Texto,
    margem: Side,
    /** texto do doc */
    comoGanha: Texto,
    /** onde se faz (QG e instituições da margem) */
    onde: z.array(Id).min(1),
    nivelMaxPorRaridade: z.record(ItemRarity, z.number().int().nonnegative()),
    /** itens do Delta (sem margem) aceitam benzimento e calibração */
    aceitaItensDoDelta: z.boolean(),
    niveis: z.array(GrowthLevel).min(1),
    descricao: Texto,
    ...Sugestao,
  })
  .strict()
  .superRefine((g, ctx) => {
    g.niveis.forEach((n, i) => {
      if (n.nivel !== i + 1) ctx.addIssue({ code: 'custom', message: `${g.id}: níveis fora de ordem` });
      if (g.id === 'benzimento' && (n.reputacaoMin === undefined || n.licoesMin === undefined)) {
        ctx.addIssue({ code: 'custom', message: `benzimento nível ${n.nivel}: precisa de reputacaoMin e licoesMin` });
      }
      if (g.id === 'calibracao' && n.custoCredito === undefined) {
        ctx.addIssue({ code: 'custom', message: `calibracao nível ${n.nivel}: precisa de custoCredito` });
      }
    });
  });
export type Growth = z.infer<typeof Growth>;

export const ItemRules = z
  .object({
    umDeCadaSlot: Texto,
    classeTravada: Texto,
    semClasseAdotaAla: Texto,
    raridadeAparece: Texto,
    cabecaEscondeCabelo: Texto,
    silhuetaNuncaSome: Texto,
    /** como achar a arte: visualPorArquetipo[arquetipo].slots[slot].chaveArte + '_' + sufixo da raridade */
    resolucaoVisual: Texto,
    /** antes do nível 12 (sem ala) e no Delta */
    visualSemAla: z
      .object({
        delta: Texto,
        instituicao: Texto,
        chaveDelta: Texto,
        chaveInstituicao: Texto,
        ...Sugestao,
      })
      .strict(),
    /** item da outra margem no corpo de quem não é de lá */
    outraMargem: z
      .object({
        multiplicadorStats: z.number().min(0).max(1),
        descricao: Texto,
        ...Sugestao,
      })
      .strict(),
    materiaisPorMargem: z
      .object({ esquerda: z.array(ItemMaterial).min(1), direita: z.array(ItemMaterial).min(1), ...Sugestao })
      .strict(),
    /** itens do Mirante: misturam Encanto e máquina e só existem lá em cima (fora do piloto) */
    mirante: z
      .object({
        /** texto do doc */
        descricao: Texto,
        material: z.literal('misto'),
        /** só caem nas alas do Mirante (endgame.json) */
        ondeCai: Texto,
        foraDoPiloto: z.literal(true),
        ...Sugestao,
      })
      .strict(),
    ...Sugestao,
  })
  .strict();
export type ItemRules = z.infer<typeof ItemRules>;

/** Item-base (comum ou raro) do piloto. Únicos e sets ficam nos próprios arquivos. */
export const Item = z
  .object({
    id: Id,
    name: Texto,
    slot: ItemSlot,
    rarity: z.enum(['comum', 'raro']),
    /** null = sem classe (adota o estilo da ala) */
    classLock: ClassId.nullable(),
    /** null = item do Delta, sem margem */
    margem: Side.nullable(),
    /** null = roupa simples do Delta (camiseta, bermuda, chinelo) */
    material: ItemMaterial.nullable(),
    nivelMin: z.number().int().positive(),
    stats: z.array(StatMod),
    /** arma: tipo de ataque da classe e o básico que ela usa */
    tipoAtaque: ItemDamageType.optional(),
    ataqueBasico: Id.optional(),
    /** adorno: o efeito especial */
    efeito: Passive.optional(),
    efeitoTexto: z.string().optional(),
    /** raro: usa a regra da raridade, salvo override */
    atributosExtras: z.object({ min: z.number().int().nonnegative(), max: z.number().int().nonnegative(), ...Sugestao }).strict().optional(),
    /** override do visual por ala; sem ele, vale a tabela visualPorArquetipo */
    visualPorArquetipo: z.partialRecord(ArquetipoId, Id).optional(),
    /** sempre null nos itens-base; únicos e sets têm arquivo próprio */
    uniqueEffect: z.null().default(null),
    setId: z.null().default(null),
    /** valor de referência, em Semente (Crédito ≈ 2x pela cotação base do câmbio) */
    precoBase: z.number().int().positive(),
    descricao: z.string().optional(),
    ...Sugestao,
  })
  .strict()
  .superRefine((it, ctx) => {
    if (it.slot === 'arma' && (!it.tipoAtaque || !it.ataqueBasico)) {
      ctx.addIssue({ code: 'custom', message: `${it.id}: arma precisa de tipoAtaque e ataqueBasico` });
    }
    if (it.slot === 'arma' && it.classLock === null) {
      ctx.addIssue({ code: 'custom', message: `${it.id}: arma-base precisa de classe (define o tipo de ataque)` });
    }
    if (it.slot === 'adorno' && !it.efeito) ctx.addIssue({ code: 'custom', message: `${it.id}: adorno precisa de efeito` });
    if (it.slot !== 'adorno' && it.efeito) ctx.addIssue({ code: 'custom', message: `${it.id}: só adorno tem efeito especial` });
    if (it.classLock !== null && it.margem === null) ctx.addIssue({ code: 'custom', message: `${it.id}: item de classe tem margem` });
    if (it.margem === 'direita' && it.material !== 'alta_tecnologia') {
      ctx.addIssue({ code: 'custom', message: `${it.id}: item da Direita é de alta tecnologia` });
    }
    if (it.margem !== 'direita' && it.material === 'alta_tecnologia') {
      ctx.addIssue({ code: 'custom', message: `${it.id}: alta tecnologia só na Direita` });
    }
    if (it.margem !== null && it.material === null) ctx.addIssue({ code: 'custom', message: `${it.id}: item de margem tem material` });
    if (it.material === 'misto' && it.margem !== null) ctx.addIssue({ code: 'custom', message: `${it.id}: material misto é do Mirante, sem margem` });
  });
export type Item = z.infer<typeof Item>;

const CLASSES = ClassId.options;
const SLOTS = ItemSlot.options;

export const ItemsFile = z
  .object({
    slots: z.array(SlotDef).length(5),
    raridades: z.array(RarityDef).length(4),
    atributosBase: BaseStatsTable,
    regras: ItemRules,
    visualPorArquetipo: z.record(ArquetipoId, ArchetypeVisual),
    benzimento: Growth,
    calibracao: Growth,
    itens: z.array(Item).min(1),
  })
  .strict()
  .superRefine((f, ctx) => {
    const ids = new Set<string>();
    for (const it of f.itens) {
      if (ids.has(it.id)) ctx.addIssue({ code: 'custom', message: `id repetido: ${it.id}` });
      ids.add(it.id);
    }
    // para cada classe, cada slot, comum e raro, nas duas margens
    for (const c of CLASSES) {
      for (const s of SLOTS) {
        for (const m of Side.options) {
          for (const r of ['comum', 'raro'] as const) {
            if (!f.itens.some((i) => i.classLock === c && i.slot === s && i.margem === m && i.rarity === r)) {
              ctx.addIssue({ code: 'custom', message: `falta item-base: ${c}/${s}/${m}/${r}` });
            }
          }
        }
      }
    }
    if (f.benzimento.id !== 'benzimento' || f.benzimento.margem !== 'esquerda') {
      ctx.addIssue({ code: 'custom', message: 'benzimento é da Esquerda' });
    }
    if (f.calibracao.id !== 'calibracao' || f.calibracao.margem !== 'direita') {
      ctx.addIssue({ code: 'custom', message: 'calibração é da Direita' });
    }
    for (const [arq, v] of Object.entries(f.visualPorArquetipo)) {
      for (const s of SLOTS) {
        const sv = v.slots[s];
        if (sv && !sv.chaveArte.startsWith(`${arq}_`)) {
          ctx.addIssue({ code: 'custom', message: `${arq}/${s}: chaveArte deve começar com ${arq}_` });
        }
      }
    }
  });
export type ItemsFile = z.infer<typeof ItemsFile>;

// ---------------------------------------------------------------------------
// uniques.json

export const Unique = z
  .object({
    id: Id,
    name: Texto,
    slot: ItemSlot,
    rarity: z.literal('unico'),
    /** null = qualquer classe */
    classLock: ClassId.nullable(),
    /** arma: tipo de ataque; 'da_classe' = herda o da classe de quem usa */
    tipoAtaque: z.union([ItemDamageType, z.literal('da_classe')]).optional(),
    nivelMin: z.number().int().positive(),
    stats: z.array(StatMod),
    /** texto exato da tabela "Únicos" (Sistemas.md) */
    efeito: Texto,
    /** efeito codificado; vazio só quando o único libera uma habilidade */
    passivos: z.array(Passive),
    /** único que libera habilidade (ex.: Emenda de Cobre) */
    habilidadeLiberada: Ability.optional(),
    /**
     * nota sobre a habilidade liberada, quando ela foge de uma regra geral
     * (ex.: recarga de 60 s fora da faixa de 6 a 20 s, que vale para os botões 1 a 3)
     */
    notaHabilidade: z.string().optional(),
    /** quem construiu a cidade antes da divisão (Narrativa.md), quando o nome é de alguém */
    homenageado: z.object({ nome: Texto, quem: Texto, ...Sugestao }).strict().nullable(),
    visualProprio: OwnVisual,
    /** entra no piloto */
    piloto: z.boolean(),
    justificativaPiloto: z.string().optional(),
    /** tabelas de saque onde cai */
    ondeCai: z.array(Id),
    /** não é vendido em loja de NPC; valor de referência para venda ao NPC */
    precoBase: z.number().int().positive(),
    ...Sugestao,
  })
  .strict()
  .superRefine((u, ctx) => {
    if (u.passivos.length === 0 && !u.habilidadeLiberada) {
      ctx.addIssue({ code: 'custom', message: `${u.id}: único precisa de passivo ou habilidade liberada` });
    }
    if (u.slot === 'arma' && !u.tipoAtaque) ctx.addIssue({ code: 'custom', message: `${u.id}: arma precisa de tipoAtaque` });
    if (u.habilidadeLiberada && u.habilidadeLiberada.ownerKey !== u.id) {
      ctx.addIssue({ code: 'custom', message: `${u.id}: ownerKey da habilidade liberada deve ser o id do único` });
    }
  });
export type Unique = z.infer<typeof Unique>;

export const UniquesFile = z
  .object({
    descricao: Texto,
    regraPiloto: Texto,
    unicos: z.array(Unique).length(14),
  })
  .strict()
  .superRefine((f, ctx) => {
    const ids = new Set(f.unicos.map((u) => u.id));
    if (ids.size !== f.unicos.length) ctx.addIssue({ code: 'custom', message: 'id de único repetido' });
    const piloto = f.unicos.filter((u) => u.piloto);
    if (piloto.length !== 2) ctx.addIssue({ code: 'custom', message: `o piloto tem 2 únicos (achei ${piloto.length})` });
    for (const u of piloto) {
      if (!u.justificativaPiloto) ctx.addIssue({ code: 'custom', message: `${u.id}: falta justificativaPiloto` });
    }
  });
export type UniquesFile = z.infer<typeof UniquesFile>;

// ---------------------------------------------------------------------------
// sets.json

export const SetPiece = z
  .object({
    id: Id,
    name: Texto,
    slot: ItemSlot,
    /** null = qualquer classe permitida pelo set */
    classLock: ClassId.nullable(),
    margem: Side.nullable(),
    stats: z.array(StatMod),
    visual: OwnVisual.optional(),
    ...Sugestao,
  })
  .strict();
export type SetPiece = z.infer<typeof SetPiece>;

export const SetBonus = z
  .object({
    pecas: z.number().int().min(2).max(4),
    /** texto exato da tabela "Sets" */
    texto: Texto,
    passivos: z.array(Passive).min(1),
    ...Sugestao,
  })
  .strict();
export type SetBonus = z.infer<typeof SetBonus>;

export const ItemSet = z
  .object({
    id: Id,
    name: Texto,
    tipo: z.enum(['individual', 'grupo', 'grupo_misto']),
    /** texto exato da coluna "Tipo" */
    tipoTexto: Texto,
    /** 'portador': as peças estão todas no mesmo personagem; 'grupo': contam as peças de todo o grupo */
    contagem: z.enum(['portador', 'grupo']),
    /** classes que podem usar; null = qualquer */
    classes: z.array(ClassId).nullable(),
    margem: Side.nullable(),
    /** texto exato da coluna "Peças" */
    pecasTexto: Texto,
    pecas: z.array(SetPiece).min(2).max(4),
    bonus: z.array(SetBonus).min(1),
    regraQueda: z.string().optional(),
    visualSetCompleto: OwnVisual,
    foraDoPiloto: z.literal(true),
    ...Sugestao,
  })
  .strict()
  .superRefine((s, ctx) => {
    for (const b of s.bonus) {
      if (b.pecas > s.pecas.length) ctx.addIssue({ code: 'custom', message: `${s.id}: bônus de ${b.pecas} peças num set de ${s.pecas.length}` });
    }
  });
export type ItemSet = z.infer<typeof ItemSet>;

export const SetsFile = z
  .object({
    descricao: Texto,
    sets: z.array(ItemSet).length(6),
  })
  .strict();
export type SetsFile = z.infer<typeof SetsFile>;

// ---------------------------------------------------------------------------
// consumables.json

export const Consumable = z
  .object({
    id: Id,
    name: Texto,
    /** habilidade do botão de item (slot 'item') */
    habilidade: Id,
    preco: ShopPrice,
    precoBase: z.number().int().positive(),
    empilhaMax: z.number().int().positive(),
    nivelMin: z.number().int().positive(),
    /** uso automático pela Doutrina */
    usoAutomatico: z
      .object({
        doutrina: z.boolean(),
        vidaAbaixoPct: z.number().min(1).max(99),
        opcional: z.boolean(),
        padraoLigado: z.boolean(),
        ...Sugestao,
      })
      .strict()
      .optional(),
    visual: z.object({ esquerda: Texto, direita: Texto, delta: Texto }).strict(),
    descricao: Texto,
    ...Sugestao,
  })
  .strict();
export type Consumable = z.infer<typeof Consumable>;

export const ConsumablesFile = z
  .object({
    botaoItem: z
      .object({
        descricao: Texto,
        /** quantos consumíveis cabem no botão ao mesmo tempo */
        cabeNoBotao: z.number().int().positive(),
        ...Sugestao,
      })
      .strict(),
    habilidades: z.array(Ability).min(4),
    consumiveis: z.array(Consumable).min(4),
  })
  .strict()
  .superRefine((f, ctx) => {
    const habs = new Map(f.habilidades.map((a) => [a.id, a]));
    for (const a of f.habilidades) {
      if (a.slot !== 'item') ctx.addIssue({ code: 'custom', message: `${a.id}: habilidade de consumível usa slot 'item'` });
    }
    for (const c of f.consumiveis) {
      const a = habs.get(c.habilidade);
      if (!a) ctx.addIssue({ code: 'custom', message: `${c.id}: habilidade ${c.habilidade} não existe` });
      else if (a.ownerKey !== c.id) ctx.addIssue({ code: 'custom', message: `${c.id}: ownerKey de ${a.id} deve ser ${c.id}` });
    }
  });
export type ConsumablesFile = z.infer<typeof ConsumablesFile>;

// ---------------------------------------------------------------------------
// shops.json

export const ShopEntry = z
  .object({
    item: Id,
    tipo: z.enum(['equipamento', 'consumivel', 'material']),
    preco: ShopPrice,
    /** patente mínima para comprar (a patente libera lojas) */
    patenteMin: Id.optional(),
    ...Sugestao,
  })
  .strict();
export type ShopEntry = z.infer<typeof ShopEntry>;

export const Shop = z
  .object({
    id: Id,
    name: Texto,
    tipo: z.enum(['instituicao', 'qg', 'delta', 'contrabando']),
    /** instituição, QG ou região onde fica */
    local: Id,
    regiao: Id,
    npc: Id.nullable(),
    moedas: z.array(ShopCurrency).min(1),
    /** Esquerda: tabelado; Direita: preço dinâmico com taxa; Juncal: sem taxa e sem fila */
    regraPreco: z.enum(['tabelado', 'dinamico', 'contrabando']),
    taxaPct: z.number().nonnegative(),
    variacaoPct: z.number().nonnegative(),
    filaS: z.number().int().nonnegative(),
    descricao: Texto,
    fala: z.string().optional(),
    itens: z.array(ShopEntry).min(1),
    ...Sugestao,
  })
  .strict()
  .superRefine((s, ctx) => {
    for (const e of s.itens) {
      if (e.preco.semente !== undefined && !s.moedas.includes('semente')) {
        ctx.addIssue({ code: 'custom', message: `${s.id}/${e.item}: loja não aceita Semente` });
      }
      if (e.preco.credito !== undefined && !s.moedas.includes('credito')) {
        ctx.addIssue({ code: 'custom', message: `${s.id}/${e.item}: loja não aceita Crédito` });
      }
      for (const m of s.moedas) {
        if (e.preco[m] === undefined) ctx.addIssue({ code: 'custom', message: `${s.id}/${e.item}: falta preço em ${m}` });
      }
    }
  });
export type Shop = z.infer<typeof Shop>;

export const ShopsFile = z
  .object({
    descricao: Texto,
    regras: z
      .object({
        esquerda: Texto,
        direita: Texto,
        delta: Texto,
        contrabando: Texto,
        /** a loja paga esta fração do preço ao comprar do jogador (igual a economy.json lojasNpc) */
        compraDoJogadorPct: z.number().min(0).max(1),
        ...Sugestao,
      })
      .strict(),
    lojas: z.array(Shop).min(1),
  })
  .strict()
  .superRefine((f, ctx) => {
    const ids = new Set(f.lojas.map((l) => l.id));
    if (ids.size !== f.lojas.length) ctx.addIssue({ code: 'custom', message: 'id de loja repetido' });
  });
export type ShopsFile = z.infer<typeof ShopsFile>;

// ---------------------------------------------------------------------------
// loot.json

const Chance = z.number().min(0).max(1);

export const LootTable = z
  .object({
    /**
     * padrão loot_<tier>[_<variante>] (ex.: loot_chefe_galerias). Inimigos usam as tabelas de luta;
     * loot_normal_missao_delta é de missões, baús e lugares do Delta
     */
    id: Id.regex(/^loot_[a-z0-9_]+$/),
    name: Texto,
    tier: z.enum(['normal', 'elite', 'chefe']),
    regiao: Id.optional(),
    masmorra: Id.optional(),
    /** quantas vezes rola item, por jogador */
    rolagensItem: z.number().int().positive(),
    /** chance de cada rolagem dar um item */
    chanceItem: Chance,
    /** distribuição da raridade quando sai item (soma 1) */
    chancePorRaridade: z.record(ItemRarity, Chance),
    filtroItens: z
      .object({
        /** do_jogador: itens da margem do jogador (sem margem: os do Delta); delta: só do Delta */
        margem: z.enum(['do_jogador', 'delta']),
        /** do_jogador_ou_geral: da classe do jogador ou sem classe; geral: só sem classe */
        classe: z.enum(['do_jogador_ou_geral', 'geral']),
      })
      .strict(),
    /** únicos que podem sair quando a raridade for 'unico' */
    unicos: z.array(Id),
    moedas: z.array(
      z
        .object({
          /** da_margem: Semente na Esquerda, Crédito na Direita */
          moeda: z.enum(['semente', 'credito', 'da_margem']),
          chance: Chance,
          min: z.number().int().nonnegative(),
          max: z.number().int().nonnegative(),
          ...Sugestao,
        })
        .strict(),
    ),
    materiais: z.array(
      z.object({ id: Id, chance: Chance, min: z.number().int().positive(), max: z.number().int().positive(), ...Sugestao }).strict(),
    ),
    consumiveis: z.array(z.object({ id: Id, chance: Chance, ...Sugestao }).strict()),
    /** masmorra: % a mais de moeda e de chance de item por andar */
    escalaPorAndarPct: z.number().nonnegative().optional(),
    descricao: z.string().optional(),
    ...Sugestao,
  })
  .strict()
  .superRefine((t, ctx) => {
    const soma = Object.values(t.chancePorRaridade).reduce((a, b) => a + b, 0);
    if (Math.abs(soma - 1) > 1e-6) ctx.addIssue({ code: 'custom', message: `${t.id}: chancePorRaridade soma ${soma}, deve ser 1` });
    if (t.chancePorRaridade.unico > 0 && t.unicos.length === 0) {
      ctx.addIssue({ code: 'custom', message: `${t.id}: chance de único sem lista de únicos` });
    }
    for (const m of [...t.moedas, ...t.materiais]) {
      if (m.min > m.max) ctx.addIssue({ code: 'custom', message: `${t.id}: min > max` });
    }
  });
export type LootTable = z.infer<typeof LootTable>;

export const LootFile = z
  .object({
    coleta: z
      .object({
        texto: Texto,
        automatica: z.boolean(),
        raioTiles: z.number().positive(),
        /** coleta sozinho itens desta raridade para cima */
        filtroPadrao: ItemRarity,
        filtros: z.array(ItemRarity).min(1),
        moedasEMateriaisSempre: z.boolean(),
        ...Sugestao,
      })
      .strict(),
    vendaAutomatica: z
      .object({
        texto: Texto,
        raridades: z.array(ItemRarity).min(1),
        opcional: z.boolean(),
        padraoLigada: z.boolean(),
        /** fração do precoBase paga na venda automática */
        fracaoDoPrecoBase: z.number().min(0).max(1),
        moeda: z.literal('da_margem'),
        ...Sugestao,
      })
      .strict(),
    rolagem: z
      .object({
        texto: Texto,
        individual: z.literal(true),
        pecasDeSetDeGrupoSoParaQuemParticipou: z.boolean(),
        semMargemUsaDelta: z.boolean(),
        /** só cai item com nivelMin <= nível do jogador + margemDeNivel */
        margemDeNivel: z.number().int().nonnegative(),
        /** plantonista ganha parte do loot */
        plantonistaFracao: z.number().min(0).max(1),
        ...Sugestao,
      })
      .strict(),
    tabelas: z.array(LootTable).min(3),
  })
  .strict()
  .superRefine((f, ctx) => {
    const ids = new Set(f.tabelas.map((t) => t.id));
    if (ids.size !== f.tabelas.length) ctx.addIssue({ code: 'custom', message: 'id de tabela repetido' });
    for (const need of ['loot_normal', 'loot_elite', 'loot_chefe']) {
      if (!ids.has(need)) ctx.addIssue({ code: 'custom', message: `falta ${need}` });
    }
  });
export type LootFile = z.infer<typeof LootFile>;
