import { z } from 'zod';
import { Id, Side, Role, ClassId, Sugestao } from './common';
import { Passive, Effect, StatMod } from './ability';

/**
 * Mundo: regiões, lugares, estruturas, lições (Lugares que ensinam) e story_flags.
 * Fonte: docs/Narrativa.md (lugares, jornada) e docs/Sistemas.md (Mapa, energia e economia;
 * Lugares que ensinam; Recursos e estruturas).
 */

// ---------------------------------------------------------------------------
// Básicos
// ---------------------------------------------------------------------------

/** Recursos do mapa (Sistemas.md: energia, chopindita, comida, peças, Semente e Crédito). */
export const Resource = z.enum(['energia', 'chopindita', 'comida', 'pecas', 'semente', 'credito']);
export type Resource = z.infer<typeof Resource>;

export const ResourceAmount = z.object({ recurso: Resource, quantidade: z.number().nonnegative(), ...Sugestao }).strict();
export type ResourceAmount = z.infer<typeof ResourceAmount>;

/** Medidores de cada região. */
export const MeterKey = z.enum(['energia', 'influencia', 'poluicao', 'opiniao_publica', 'preco_de_vida']);
export type MeterKey = z.infer<typeof MeterKey>;

export const Rarity = z.enum(['comum', 'raro', 'unico', 'set']);
export type Rarity = z.infer<typeof Rarity>;

/** Dono de uma região, lugar ou estrutura. */
export const Owner = z.enum(['esquerda', 'direita', 'neutra', 'mirante']);
export type Owner = z.infer<typeof Owner>;

/** Retângulo em tiles no mapa do mundo (1 tile = 32 px). x cresce para a Direita. */
export const Rect = z.object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive(), ...Sugestao }).strict();
export type Rect = z.infer<typeof Rect>;

export const Point = z.object({ x: z.number(), y: z.number(), ...Sugestao }).strict();
export type Point = z.infer<typeof Point>;

/**
 * Perigo do ambiente (masmorras e missões): água subindo, turbinas, tomate na estreia.
 * Golpe que causa dano direto avisa no chão por pelo menos 0,8 s.
 */
export const Hazard = z
  .object({
    id: Id,
    name: z.string().min(1),
    descricao: z.string().min(1),
    /** aviso no chão antes de cair, em ms (0 = efeito contínuo e visível, como água) */
    avisoMs: z.number().int().nonnegative(),
    intervaloS: z.number().positive().optional(),
    /** raio da área em tiles (mínimo 2) */
    raio: z.number().min(2).optional(),
    efeitos: z.array(Effect).min(1),
    ...Sugestao,
  })
  .strict()
  .superRefine((h, ctx) => {
    const causaDano = h.efeitos.some((e) => e.kind === 'dano');
    if (causaDano && h.avisoMs < 800) ctx.addIssue({ code: 'custom', message: `${h.id}: golpe de ambiente sem aviso de 0,8 s` });
  });
export type Hazard = z.infer<typeof Hazard>;

// ---------------------------------------------------------------------------
// Recompensas (usadas por missões, masmorras e lições)
// ---------------------------------------------------------------------------

/**
 * Recompensa. Regra do briefing: XP só em luta de grupo; solo dá itens e materiais.
 * As missões separam recompensas de solo e de grupo (ver mission.ts).
 */
export const Reward = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('xp'), quantidade: z.number().int().positive(), ...Sugestao }).strict(),
  z.object({ kind: z.literal('recurso'), recurso: Resource, quantidade: z.number().positive(), ...Sugestao }).strict(),
  z
    .object({
      kind: z.literal('item'),
      /** item fixo (id do domínio de itens) */
      item: Id.optional(),
      /** ou rolagem numa tabela de saque (loot_normal, loot_elite, loot_chefe...) */
      tabela: Id.optional(),
      /** v0.3: ou a peça da classe e da margem do jogador nesse slot (\\_\_\_\\) */
      slotDaClasse: z.enum(['cabeca', 'peito', 'arma', 'calcado', 'adorno']).optional(),
      raridade: Rarity.optional(),
      quantidade: z.number().int().positive().optional(),
      ...Sugestao,
    })
    .strict(),
  z.object({ kind: z.literal('reputacao'), quantidade: z.number().int(), instituicao: Id.optional(), ...Sugestao }).strict(),
  z
    .object({
      kind: z.literal('medidor'),
      medidor: MeterKey,
      delta: z.number(),
      /** região afetada; sem região = a região onde aconteceu */
      regiao: Id.optional(),
      /** para influência e opinião pública: a favor de quem */
      aFavorDe: z.enum(['propria_margem', 'esquerda', 'direita']).optional(),
      ...Sugestao,
    })
    .strict(),
  z
    .object({
      kind: z.literal('desbloqueio'),
      /** chave estável lida pelo código (ex.: disfarce, rota_secreta, classe, uniforme_instituicao) */
      chave: Id,
      quantidade: z.number().int().positive().optional(),
      descricao: z.string().min(1),
      ...Sugestao,
    })
    .strict(),
  z.object({ kind: z.literal('planta'), estrutura: Id, ...Sugestao }).strict(),
  z
    .object({
      kind: z.literal('inspiracao'),
      /** bônus que dura até a próxima missão */
      descricao: z.string().min(1),
      passivo: Passive,
      ...Sugestao,
    })
    .strict(),
  z.object({ kind: z.literal('score'), delta: z.number().int(), ...Sugestao }).strict(),
  z
    .object({
      kind: z.literal('preco'),
      /** preço do mundo que muda; chopindita_contrabando = economy.json contrabando.precoChopindita */
      preco: z.enum(['chopindita_contrabando']),
      /** variação em % sobre o preço base */
      variacaoPct: z.number().positive(),
      /** conforme_resultado: vencer a barganha (debate) baixa o preço, perder sobe */
      sentido: z.enum(['conforme_resultado', 'sobe', 'desce']),
      regiao: Id.optional(),
      ...Sugestao,
    })
    .strict(),
]);
export type Reward = z.infer<typeof Reward>;

// ---------------------------------------------------------------------------
// Regiões (regions.json)
// ---------------------------------------------------------------------------

export const Meters = z
  .object({
    /** 0 a 100. Abaixo de `escalas.apagaoAbaixoDe` a região está em apagão. */
    energia: z.number().min(0).max(100),
    /** quem manda na região, 0 a 100 para cada margem; o que sobra até 100 é de ninguém */
    influencia: z.object({ esquerda: z.number().min(0).max(100), direita: z.number().min(0).max(100), ...Sugestao }).strict(),
    /** pontos inteiros; cada ponto tira 10% da Esquerda e 0 dá +10% */
    poluicao: z.number().int().min(0).max(10),
    /** -100 a 100; positivo pende para a Esquerda, negativo para a Direita */
    opiniaoPublica: z.number().min(-100).max(100),
    /** índice; 100 = normal. Sobe na crise e mexe com aluguel, feira e app */
    precoDeVida: z.number().min(50).max(300),
    ...Sugestao,
  })
  .strict()
  .superRefine((m, ctx) => {
    if (m.influencia.esquerda + m.influencia.direita > 100) {
      ctx.addIssue({ code: 'custom', message: 'influência somada passa de 100' });
    }
  });
export type Meters = z.infer<typeof Meters>;

export const Region = z
  .object({
    id: Id,
    name: z.string().min(1),
    /** Encanto x máquina: natureza dá +5% à Esquerda, cidade +5% à Direita, mista dá os dois */
    tipo: z.enum(['natureza', 'cidade', 'mista']),
    margemDona: Owner,
    emPiloto: z.boolean(),
    descricao: z.string().min(1),
    medidores: Meters,
    /** posição no mapa do mundo, em tiles; a Esquerda fica à esquerda do rio (x menor) */
    mapa: Rect,
    vizinhas: z.array(Id),
    pontosDeControle: z.array(Id),
    depositos: z.array(Id),
    lugares: z.array(Id),
    masmorras: z.array(Id).default([]),
    ...Sugestao,
  })
  .strict();
export type Region = z.infer<typeof Region>;

// ---------------------------------------------------------------------------
// Encontros no mundo (regions.json, bloco `encontros`): a roda de interação
// ---------------------------------------------------------------------------

/** Com quem o encontro acontece: personagem de IA, alguém do seu grupo, ou outro jogador (interação livre). */
export const AlvoEncontro = z.enum(['ia', 'grupo', 'jogador']);
export type AlvoEncontro = z.infer<typeof AlvoEncontro>;

export const AcaoEncontroId = z.enum(['cumprimentar', 'trocar', 'negociar', 'seguir', 'recrutar', 'deixar_rastro', 'atacar', 'render_se']);
export type AcaoEncontroId = z.infer<typeof AcaoEncontroId>;

const OpcaoEncontro = z.object({ id: Id, name: z.string().min(1), descricao: z.string().min(1), ...Sugestao }).strict();

export const AcaoEncontro = z
  .object({
    id: AcaoEncontroId,
    name: z.string().min(1),
    /** texto exato da coluna "O que faz" (Sistemas.md, Encontros no mundo) */
    oQueFaz: z.string().min(1),
    /** com quem a ação pode ser usada */
    alvos: z.array(AlvoEncontro).min(1),
    /** a ação existe no piloto (com IA ou com o grupo) */
    emPiloto: z.boolean(),
    /** variantes da ação (negociar: trégua, pedágio, propina, desconto; rastro: bilhete, marca, armadilha) */
    opcoes: z.array(OpcaoEncontro).optional(),
    /** cumprimentar: encontros repetidos viram vínculo, que dá bônus juntos */
    vinculo: z
      .object({
        encontrosParaVinculo: z.number().int().positive(),
        /** só conta um encontro com a mesma pessoa a cada N minutos */
        intervaloMinEntreEncontrosMin: z.number().int().nonnegative(),
        /** bônus quando os dois estão no mesmo grupo */
        bonus: z.array(StatMod).min(1),
        ...Sugestao,
      })
      .strict()
      .optional(),
    /** recrutar: preço para chamar um personagem de IA para o grupo */
    recrutar: z
      .object({
        precos: z.array(z.object({ moeda: z.enum(['semente', 'credito', 'reputacao']), valor: z.number().int().positive(), ...Sugestao }).strict()).min(1),
        /** quanto tempo o recrutado fica no grupo */
        duraMin: z.number().int().positive(),
        /** o grupo continua com no máximo 4 */
        grupoMax: z.literal(4),
        ...Sugestao,
      })
      .strict()
      .optional(),
    /** deixar rastro: quanto tempo fica no mapa e quantos cada um pode ter */
    rastro: z
      .object({ duraMin: z.number().int().positive(), maxAtivosPorJogador: z.number().int().positive(), ...Sugestao })
      .strict()
      .optional(),
    /** atacar: contra IA abre combate ali mesmo; contra jogador, só nas arenas */
    atacar: z
      .object({ contraIa: z.literal('abre_combate'), contraJogador: z.literal('so_nas_arenas'), ...Sugestao })
      .strict()
      .optional(),
    /** render-se: perde parte do que carrega, mas não morre */
    renderSe: z
      .object({
        /** fração do que carrega que fica com quem venceu, em % */
        perdePct: z.number().min(1).max(99),
        /** o que entra na conta (itens equipados nunca) */
        perde: z.array(z.enum(['moedas', 'materiais', 'consumiveis'])).min(1),
        naoMorre: z.literal(true),
        ...Sugestao,
      })
      .strict()
      .optional(),
    ...Sugestao,
  })
  .strict();
export type AcaoEncontro = z.infer<typeof AcaoEncontro>;

export const Encounters = z
  .object({
    /** texto do doc: quando dois personagens se cruzam no mapa, abre uma roda de interação */
    descricao: z.string().min(1),
    /** texto do doc: no começo, IA e grupo (co-op); a interação livre vem numa fase seguinte */
    fases: z.string().min(1),
    /** alvos liberados no piloto */
    alvosNoPiloto: z.array(AlvoEncontro).min(1),
    interacaoLivre: z.object({ descricao: z.string().min(1), emPiloto: z.literal(false), ...Sugestao }).strict(),
    /** distância, em tiles, em que a roda abre */
    raioTiles: z.number().positive(),
    acoes: z.array(AcaoEncontro).length(8),
    ...Sugestao,
  })
  .strict()
  .superRefine((e, ctx) => {
    const ids = new Set(e.acoes.map((a) => a.id));
    for (const id of AcaoEncontroId.options) if (!ids.has(id)) ctx.addIssue({ code: 'custom', message: `encontros: falta a ação ${id}` });
    for (const a of e.acoes) {
      const noPiloto = a.alvos.some((x) => e.alvosNoPiloto.includes(x));
      if (a.emPiloto !== noPiloto) ctx.addIssue({ code: 'custom', message: `encontros/${a.id}: emPiloto não bate com os alvos do piloto` });
    }
    if (e.alvosNoPiloto.includes('jogador')) ctx.addIssue({ code: 'custom', message: 'encontros: interação livre com jogador está fora do piloto' });
  });
export type Encounters = z.infer<typeof Encounters>;

// ---------------------------------------------------------------------------
// Competição entre as margens (regions.json, bloco `competicao`)
// ---------------------------------------------------------------------------

export const Competition = z
  .object({
    pontosDeControle: z
      .object({
        /** texto do doc */
        texto: z.string().min(1),
        mudamPor: z.array(z.enum(['obras', 'comboios', 'propaganda', 'missoes'])).min(1),
        combateEntreJogadoresNoMapa: z.literal(false),
        ...Sugestao,
      })
      .strict(),
    cicloSemanal: z
      .object({
        texto: z.string().min(1),
        dia: z.literal('domingo'),
        /** hora local do fechamento */
        hora: z.string().regex(/^\d{2}:\d{2}$/),
        cargosRenovam: z.literal(true),
        mapaPontuado: z.literal(true),
        /** como o mapa é pontuado: pontos por região conforme a influência */
        pontuacao: z.string().min(1),
        /** bônus pequeno, na semana, para a margem com mais influência */
        bonusMargemLider: z
          .object({
            descricao: z.string().min(1),
            stats: z.array(StatMod).min(1),
            /** produção das estruturas da margem, em % */
            producaoPct: z.number().nonnegative(),
            duraDias: z.number().int().positive(),
            ...Sugestao,
          })
          .strict(),
        foraDoPiloto: z.literal(true),
        ...Sugestao,
      })
      .strict(),
    equilibrio: z
      .object({
        texto: z.string().min(1),
        criterio: z.literal('jogadores_online'),
        /** a diferença de jogadores online, em %, a partir da qual o equilíbrio liga */
        diferencaMinPct: z.number().positive(),
        /** esquadrões de IA a mais por região disputada, para a margem com menos gente */
        esquadroesIaExtras: z.number().int().positive(),
        /** bônus de quem está por baixo, em % de influência ganha */
        bonusPorBaixoPct: z.number().positive(),
        /** manutenção das estruturas da margem dominante fica mais cara, em % */
        custoManutencaoDominantePct: z.number().positive(),
        recalculaACadaMin: z.number().positive(),
        foraDoPiloto: z.boolean(),
        ...Sugestao,
      })
      .strict(),
    duelos: z
      .object({
        texto: z.string().min(1),
        foraDasArenas: z.literal('so_por_convite_aceito'),
        foraDoPiloto: z.literal(true),
        ...Sugestao,
      })
      .strict(),
    ...Sugestao,
  })
  .strict();
export type Competition = z.infer<typeof Competition>;

export const RegionsFile = z
  .object({
    escalas: z
      .object({
        /** energia abaixo disso = apagão (Direita −20%) */
        apagaoAbaixoDe: z.number().min(0).max(100),
        /** energia acima disso = região com energia (Direita +10%) */
        comEnergiaAPartirDe: z.number().min(0).max(100),
        poluicaoMax: z.number().int().positive(),
        /** bônus de Encanto x máquina, em % (Sistemas.md) */
        bonus: z
          .object({
            direitaComEnergia: z.number(),
            direitaApagao: z.number(),
            esquerdaPoluicaoZero: z.number(),
            esquerdaPorPontoDePoluicao: z.number(),
            esquerdaNatureza: z.number(),
            direitaCidade: z.number(),
            ...Sugestao,
          })
          .strict(),
        tamanhoDoMundo: z.object({ w: z.number().int().positive(), h: z.number().int().positive(), ...Sugestao }).strict(),
        /**
         * quando um ponto cai em mais de um retângulo, vale a primeira região desta lista que o contém;
         * as sobreposições são de propósito (ilha e ponte sobre o rio, Mirante no alto da Serra).
         * Região fora da lista não pode se sobrepor a outra fora da lista.
         */
        precedencia: z.array(Id).min(1),
        ...Sugestao,
      })
      .strict(),
    regioes: z.array(Region).min(1),
    encontros: Encounters,
    competicao: Competition,
  })
  .strict()
  .superRefine((f, ctx) => {
    const ids = new Set(f.regioes.map((r) => r.id));
    for (const p of f.escalas.precedencia) if (!ids.has(p)) ctx.addIssue({ code: 'custom', message: `precedencia: região ${p} não existe` });
    const prec = new Set(f.escalas.precedencia);
    const fora = f.regioes.filter((r) => !prec.has(r.id));
    const cruza = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    for (let i = 0; i < fora.length; i++) {
      for (let j = i + 1; j < fora.length; j++) {
        if (cruza(fora[i].mapa, fora[j].mapa)) {
          ctx.addIssue({ code: 'custom', message: `mapa: ${fora[i].id} e ${fora[j].id} se sobrepõem sem precedência` });
        }
      }
    }
  });
export type RegionsFile = z.infer<typeof RegionsFile>;

// ---------------------------------------------------------------------------
// Lugares (places.json)
// ---------------------------------------------------------------------------

export const PlaceKind = z.enum([
  'qg',
  'instituicao',
  'comercio',
  'moradia',
  'servico',
  'historico',
  'lazer',
  'vila',
  'natureza',
  'infraestrutura',
  'midia',
  'entrada_masmorra',
  'contrabando',
  'condominio',
]);
export type PlaceKind = z.infer<typeof PlaceKind>;

export const Place = z
  .object({
    id: Id,
    name: z.string().min(1),
    regiao: Id,
    tipo: PlaceKind,
    margem: Owner,
    emPiloto: z.boolean(),
    descricao: z.string().min(1),
    /** instituição dona do prédio */
    instituicao: Id.optional(),
    /** QG da margem (casa_da_assembleia, torre_do_consorcio) */
    qg: Id.optional(),
    /** posição em tiles no mapa do mundo, dentro do retângulo da região */
    pos: Point.optional(),
    /** NPCs que ficam ali */
    npcs: z.array(Id).optional(),
    maquinaDeVisual: z.object({ id: Id, name: z.string().min(1), ...Sugestao }).strict().optional(),
    /** cena de "Lugares que ensinam", texto exato de Sistemas.md */
    cena: z
      .object({
        oQueAcontece: z.string().min(1),
        oQueVoceGanha: z.string().min(1),
        licao: Id,
        ...Sugestao,
      })
      .strict()
      .optional(),
    /** entrada de masmorra que fica aqui */
    masmorra: Id.optional(),
    servicos: z.array(Id).optional(),
    ...Sugestao,
  })
  .strict();
export type Place = z.infer<typeof Place>;

export const PlacesFile = z.array(Place).min(1);
export type PlacesFile = z.infer<typeof PlacesFile>;

// ---------------------------------------------------------------------------
// Estruturas (structures.json)
// ---------------------------------------------------------------------------

export const StructureKind = z.object({
  id: Id,
  name: z.string().min(1),
  /** Esquerda, Direita ou as duas */
  margem: z.enum(['esquerda', 'direita', 'ambas']),
  /** texto exato da tabela */
  oQueFaz: z.string().min(1),
  /** produção a cada tick de produção */
  producaoPorTick: z.array(ResourceAmount),
  /** consumo a cada tick (ex.: o gerador queima chopindita) */
  consumoPorTick: z.array(ResourceAmount).default([]),
  /** pontos de poluição somados à região a cada tick (fração acumula) */
  poluicaoPorTick: z.number(),
  custo: z.array(ResourceAmount),
  /** tempo de obra em segundos de jogo */
  obraS: z.number().int().positive(),
  vida: z.number().int().positive(),
  defesa: z.number().nonnegative(),
  /** efeitos que não são produção */
  efeito: z
    .object({
      moradiaVagas: z.number().int().positive().optional(),
      curaPctPorVisita: z.number().positive().optional(),
      filaS: z.number().int().nonnegative().optional(),
      exigePlano: z.boolean().optional(),
      capacidade: z.number().int().positive().optional(),
      saqueMaxPct: z.number().min(0).max(100).optional(),
      opiniaoPorTick: z.number().optional(),
      influenciaPorTick: z.number().optional(),
      raioTiles: z.number().positive().optional(),
      ...Sugestao,
    })
    .strict()
    .default({}),
  ...Sugestao,
}).strict();
export type StructureKind = z.infer<typeof StructureKind>;

/** Instância colocada no mapa: depósitos, postos de controle e estruturas iniciais. */
export const StructureInstance = z
  .object({
    id: Id,
    estrutura: Id,
    regiao: Id,
    margem: Owner,
    lugar: Id.optional(),
    pos: Point.optional(),
    name: z.string().min(1),
    estoqueInicial: z.array(ResourceAmount).optional(),
    emPiloto: z.boolean(),
    ...Sugestao,
  })
  .strict();
export type StructureInstance = z.infer<typeof StructureInstance>;

export const StructuresFile = z
  .object({
    regras: z
      .object({
        /** minutos reais entre ticks de produção (worker / pg_cron) */
        tickMinutos: z.number().int().positive(),
        /** saque máximo de um depósito, em % (Sistemas.md: 20%) */
        saqueMaxPct: z.literal(20),
        /** a poluição de uma região cai com o tempo quando não há fábricas */
        poluicaoCaiPorTick: z.number().nonnegative(),
        ...Sugestao,
      })
      .strict(),
    estruturas: z.array(StructureKind).min(1),
    instancias: z.array(StructureInstance),
  })
  .strict();
export type StructuresFile = z.infer<typeof StructuresFile>;

// ---------------------------------------------------------------------------
// Lições (lessons.json): Lugares que ensinam
// ---------------------------------------------------------------------------

export const LessonStep = z
  .object({
    /** visita em que o degrau liga: 1 (primeira), 3, 10, 25 */
    visitas: z.number().int().positive(),
    passivo: Passive,
    recompensas: z.array(Reward).optional(),
    ...Sugestao,
  })
  .strict();
export type LessonStep = z.infer<typeof LessonStep>;

export const Lesson = z
  .object({
    id: Id,
    name: z.string().min(1),
    lugar: Id,
    /** texto exato da coluna "O que você ganha" */
    oQueVoceGanha: z.string().min(1),
    /** licao = bônus permanente com degraus; recompensa = só recursos/desbloqueios por visita */
    tipo: z.enum(['licao', 'recompensa']),
    formatoCena: z.enum(['conversa', 'escolha', 'minijogo']),
    /** filtro de quem recebe o bônus da lição */
    filtro: z
      .object({ soPapel: Role.optional(), soClasse: ClassId.optional(), soCorpoACorpo: z.boolean().optional(), ...Sugestao })
      .strict()
      .optional(),
    /** degraus da lição: base na 1ª visita e aumento na 3ª, 10ª e 25ª */
    degraus: z.array(LessonStep).optional(),
    /** recompensas a cada visita (a cena renova a cada ciclo) */
    porVisita: z.array(Reward),
    /** bônus até a próxima missão */
    inspiracao: z.object({ descricao: z.string().min(1), passivo: Passive, ...Sugestao }).strict().optional(),
    /** custo para jogar a cena (feira de pulgas) */
    custo: z.array(ResourceAmount).optional(),
    ...Sugestao,
  })
  .strict()
  .superRefine((l, ctx) => {
    if (l.tipo === 'licao' && (!l.degraus || l.degraus.length === 0)) {
      ctx.addIssue({ code: 'custom', message: `${l.id}: lição sem degraus` });
    }
    if (l.degraus) {
      for (let i = 1; i < l.degraus.length; i++) {
        if (l.degraus[i].visitas <= l.degraus[i - 1].visitas) {
          ctx.addIssue({ code: 'custom', message: `${l.id}: degraus fora de ordem` });
        }
      }
    }
  });
export type Lesson = z.infer<typeof Lesson>;

export const LessonsFile = z
  .object({
    regras: z
      .object({
        /** visitas em que a lição sobe (Sistemas.md) */
        degrausVisitas: z.tuple([z.literal(3), z.literal(10), z.literal(25)]),
        /** a cena renova a cada ciclo; uma visita contada por lugar por ciclo */
        renovacao: z.literal('ciclo'),
        visitasPorCiclo: z.number().int().positive(),
        /** inspiração dura até a próxima missão concluída ou abandonada */
        inspiracaoDura: z.literal('ate_a_proxima_missao'),
        inspiracoesAoMesmoTempo: z.number().int().positive(),
        outraMargem: z
          .object({
            exigeDisfarce: z.literal(true),
            /** multiplicador dos recursos e das visitas contadas */
            multiplicadorRecursos: z.number().min(1),
            visitasContadas: z.number().int().min(1),
            /** lugares neutros (Delta, ponte) não exigem disfarce nem rendem mais */
            neutroContaComoPropria: z.boolean(),
            ...Sugestao,
          })
          .strict(),
        ...Sugestao,
      })
      .strict(),
    licoes: z.array(Lesson).length(16),
  })
  .strict();
export type LessonsFile = z.infer<typeof LessonsFile>;

// ---------------------------------------------------------------------------
// Story flags (story_flags.json)
// ---------------------------------------------------------------------------

export const StoryFlag = z
  .object({
    id: Id,
    descricao: z.string().min(1),
    /** jogador = só dele; grupo = muda as missões do grupo; mundo = vale para o servidor */
    escopo: z.enum(['jogador', 'grupo', 'mundo']),
    /** flags do mesmo grupo exclusivo não podem estar ligadas juntas (ex.: Teodoro x Lazzaro) */
    exclusiva: Id.optional(),
    cadeia: Id.optional(),
    margem: Side.optional(),
    emPiloto: z.boolean(),
    ...Sugestao,
  })
  .strict();
export type StoryFlag = z.infer<typeof StoryFlag>;

export const StoryFlagsFile = z.array(StoryFlag).min(1);
export type StoryFlagsFile = z.infer<typeof StoryFlagsFile>;
