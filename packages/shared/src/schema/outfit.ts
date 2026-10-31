import { z } from 'zod';
import { Id, Palette, Sugestao } from './common';
import { InstitutionId } from './institution';

/**
 * Trajes por nível, em camadas no estilo Habbo.
 * Fonte: Sistemas.md (O visual evolui com o tempo, Itens de classe mandam no visual) e Arte.md.
 *
 * Regras:
 * - Delta (1), uniforme da instituição (8), aprendiz (12), veterano (20), virada (30),
 *   mestre igual ao treinador (40) e lendário com aura (60).
 * - Do 30 em diante fica fora do piloto: descrito, marcado foraDoPiloto, sem camadas obrigatórias.
 * - O que cobre a cabeça esconde o cabelo; rosto e detalhes sempre aparecem.
 * - "arte" é uma chave de desenho que o gerador de pixel art do cliente implementa; todas
 *   ficam em artCatalog, com a parte e uma descrição de como desenhar em 32x48 px.
 */

export const OutfitPart = z.enum([
  'cabeca',
  'rosto',
  'torso',
  'bracos',
  'pernas',
  'pes',
  'costas',
  'cintura',
  'mao_principal',
  'mao_secundaria',
  'acompanhante', // bicho-espírito, drone, pônei
  'veiculo', // cadeira, rede
  'aura',
]);
export type OutfitPart = z.infer<typeof OutfitPart>;

export const OutfitTierKind = z.enum(['delta', 'base', 'aprendiz', 'veterano', 'virada', 'mestre', 'lendario']);
export type OutfitTierKind = z.infer<typeof OutfitTierKind>;

/** Nível em que cada traje libera. */
export const TIER_LEVEL: Record<OutfitTierKind, number> = {
  delta: 1,
  base: 8,
  aprendiz: 12,
  veterano: 20,
  virada: 30,
  mestre: 40,
  lendario: 60,
};

/** Tiers do piloto (os demais são foraDoPiloto). */
export const PILOT_TIERS: OutfitTierKind[] = ['delta', 'base', 'aprendiz', 'veterano'];

/**
 * Tamanho das paletas de traje das alas. Índices:
 * 0 principal, 1 secundária, 2 destaque, 3 couro ou metal, 4 escuro, 5 claro.
 */
export const TRAJE_PALETA_TAMANHO = 6;

/** Cor de uma camada: índice da paleta do traje, ou a pele/o cabelo do próprio jogador. */
export const LayerColor = z.union([z.number().int().min(0).max(7), z.enum(['pele', 'cabelo'])]);
export type LayerColor = z.infer<typeof LayerColor>;

export const OutfitLayer = z
  .object({
    parte: OutfitPart,
    /** chave de desenho do artCatalog */
    arte: Id,
    cores: z.array(LayerColor).min(1),
    /** texto da estampa, etiqueta, placa ou adesivo */
    texto: z.string().min(1).optional(),
    ...Sugestao,
  })
  .strict();
export type OutfitLayer = z.infer<typeof OutfitLayer>;

export const NamedPalette = z
  .object({
    id: Id,
    name: z.string().min(1),
    cores: Palette,
    ...Sugestao,
  })
  .strict();
export type NamedPalette = z.infer<typeof NamedPalette>;

export const OutfitTier = z
  .object({
    id: Id,
    tier: OutfitTierKind,
    nivel: z.number().int().positive(),
    /** dono: arquétipo (aprendiz em diante) ou instituição (base) */
    arquetipo: Id.optional(),
    instituicao: InstitutionId.optional(),
    name: z.string().min(1),
    descricao: z.string().min(1),
    /** paletas próprias (Delta e base); nos tiers de arquétipo valem as paletasTraje do arquétipo */
    paletas: z.array(NamedPalette).min(1).optional(),
    camadas: z.array(OutfitLayer).default([]),
    /** as 3 poses da linha Base da ficha (Arte.md); nos tiers de ala as poses ficam no arquétipo */
    poses: z.array(z.string().min(1)).length(3).optional(),
    foraDoPiloto: z.boolean().optional(),
    ...Sugestao,
  })
  .strict();
export type OutfitTier = z.infer<typeof OutfitTier>;

export const ArtEntry = z
  .object({
    arte: Id,
    parte: OutfitPart,
    /** como desenhar em 32x48 px */
    descricao: z.string().min(1),
    /** só para a parte cabeca: true (padrão) esconde o cabelo do jogador */
    escondeCabelo: z.boolean().optional(),
    /** desenho semitransparente (espíritos, hologramas) */
    translucido: z.boolean().optional(),
    /** animação própria, em poucas palavras */
    animacao: z.string().min(1).optional(),
    /**
     * Exceção ao quadro de 32x48: largura da camada em px (centrada no boneco), quando a arte
     * sai pelos lados (ex.: vestido de dois tiles = 64)
     */
    larguraPx: z.number().int().min(33).max(96).optional(),
    /** px que a arte passa do topo do quadro de 48 (ex.: peruca alta, chapéu gigante) */
    overflowTopoPx: z.number().int().positive().max(24).optional(),
    ...Sugestao,
  })
  .strict();
export type ArtEntry = z.infer<typeof ArtEntry>;

const Faixa = z.tuple([z.number().int().min(0), z.number().int().min(0)]);

/** Números das Regras de arte (Arte.md): tamanhos, direções, proporção e quadros de animação. */
export const SpriteSpec = z
  .object({
    tilePx: z.literal(32),
    boneco: z.object({ w: z.literal(32), h: z.literal(48) }).strict(),
    /** frente, lado, costas e outro lado */
    direcoes: z.literal(4),
    alturaEmCabecas: z.number().positive(),
    retratoPx: z.literal(64),
    emblemaPx: z.literal(64),
    quadros: z
      .object({
        parado: z.number().int().positive(),
        andandoPorDirecao: z.number().int().positive(),
        basico: z.number().int().positive(),
        /** cada habilidade marca */
        marca: z.number().int().positive(),
        especial: z.number().int().positive(),
        vitoria: z.number().int().positive(),
        derrota: z.number().int().positive(),
      })
      .strict(),
    /** o ataque básico precisa funcionar andando */
    basicoAndando: z.literal(true),
    /** Kit de criação: cada camada em 4 direções, com as mesmas animações do boneco */
    kitMesmasAnimacoes: z.literal(true),
    /** paleta de 5 cores por ficha de instituição */
    coresPorFicha: z.literal(5),
    ...Sugestao,
  })
  .strict();
export type SpriteSpec = z.infer<typeof SpriteSpec>;

/** Prompts de Arte.md, copiados como estão (em inglês, como no doc). */
export const ArtPrompts = z
  .object({
    kitDeCriacao: z.string().min(1),
    /** modelo da ficha: trocar o que está entre chaves pelo conteúdo da instituição */
    fichaTemplate: z.string().min(1),
    fichaExemploAgencia: z.string().min(1),
    ...Sugestao,
  })
  .strict();
export type ArtPrompts = z.infer<typeof ArtPrompts>;

export const OutfitsFile = z
  .object({
    /** grade do boneco 32x48: linhas de pixel (inclusive) de cada faixa do corpo */
    gradeBoneco: z
      .object({
        largura: z.literal(32),
        altura: z.literal(48),
        cabeca: Faixa,
        torso: Faixa,
        pernas: Faixa,
        pes: Faixa,
        ...Sugestao,
      })
      .strict(),
    especificacaoSprite: SpriteSpec,
    prompts: ArtPrompts,
    /** ordem de desenho vista de frente (de trás para a frente); de costas, costas vai por último */
    ordemDesenho: z.array(OutfitPart).length(OutfitPart.options.length),
    regras: z.array(z.string().min(1)).min(1),
    artCatalog: z.array(ArtEntry).min(1),
    tiers: z.array(OutfitTier).min(1),
  })
  .strict()
  .superRefine((f, ctx) => {
    const err = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (new Set(f.ordemDesenho).size !== f.ordemDesenho.length) err('ordemDesenho com parte repetida');

    const catalog = new Map<string, ArtEntry>();
    for (const a of f.artCatalog) {
      if (catalog.has(a.arte)) err(`artCatalog: chave repetida ${a.arte}`);
      catalog.set(a.arte, a);
      if (a.escondeCabelo !== undefined && a.parte !== 'cabeca') err(`artCatalog ${a.arte}: escondeCabelo só vale para cabeca`);
      if (a.larguraPx !== undefined && a.larguraPx % 2 !== 0) err(`artCatalog ${a.arte}: larguraPx precisa ser par para centrar no boneco`);
    }

    const tierIds = new Set<string>();
    for (const t of f.tiers) {
      if (tierIds.has(t.id)) err(`traje repetido: ${t.id}`);
      tierIds.add(t.id);
      if (t.nivel !== TIER_LEVEL[t.tier]) err(`${t.id}: tier ${t.tier} deve ser nível ${TIER_LEVEL[t.tier]}`);
      const noPiloto = PILOT_TIERS.includes(t.tier);
      if (noPiloto && t.foraDoPiloto) err(`${t.id}: tier do piloto marcado foraDoPiloto`);
      if (!noPiloto && !t.foraDoPiloto) err(`${t.id}: tier ${t.tier} precisa de foraDoPiloto`);
      if (noPiloto && t.camadas.length === 0) err(`${t.id}: traje do piloto sem camadas`);
      if (t.tier === 'delta' && (t.arquetipo || t.instituicao)) err(`${t.id}: Delta não tem dono`);
      if (t.tier === 'delta' && t.paletas?.length !== 6) err(`${t.id}: Delta tem 6 cores`);
      if (t.tier === 'base' && (!t.instituicao || t.arquetipo || !t.paletas)) err(`${t.id}: base precisa de instituição e paleta`);
      if (t.tier === 'base' && !t.poses) err(`${t.id}: base precisa das 3 poses da ficha`);
      if (t.tier !== 'base' && t.poses) err(`${t.id}: poses só no tier base (as de ala ficam no arquétipo)`);
      if (t.tier !== 'delta' && t.tier !== 'base' && (!t.arquetipo || t.instituicao)) err(`${t.id}: tier de ala precisa de arquétipo`);

      const tamanho = t.paletas ? Math.min(...t.paletas.map((p) => p.cores.length)) : TRAJE_PALETA_TAMANHO;
      for (const l of t.camadas) {
        const a = catalog.get(l.arte);
        if (!a) err(`${t.id}: arte ${l.arte} fora do artCatalog`);
        else if (a.parte !== l.parte) err(`${t.id}: arte ${l.arte} é de ${a.parte}, não de ${l.parte}`);
        for (const c of l.cores) if (typeof c === 'number' && c >= tamanho) err(`${t.id}: ${l.arte} usa a cor ${c}, paleta tem ${tamanho}`);
      }
    }
  });
export type OutfitsFile = z.infer<typeof OutfitsFile>;

/** O que cobre a cabeça esconde o cabelo (padrão true para a parte cabeca). */
export function hidesHair(entry: ArtEntry): boolean {
  return entry.parte === 'cabeca' && entry.escondeCabelo !== false;
}
