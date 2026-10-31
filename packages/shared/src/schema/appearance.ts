import { z } from 'zod';
import { Id, Sugestao } from './common';
import type { InstitutionsFile } from './institution';
import type { NpcsFile } from './npc';
import type { OutfitsFile } from './outfit';

/**
 * Criação de personagem em camadas (estilo Habbo) e Máquina de Visual.
 * Cada opção tem id, name e artKey (chave da camada no gerador de pixel art do cliente).
 */

export const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor em #rrggbb');

const opcao = {
  id: Id,
  name: z.string().min(1),
  artKey: Id,
  descricao: z.string().optional(),
  ...Sugestao,
};

/** Como um item zoeiro é liberado jogando. */
export const Desbloqueio = z
  .object({
    descricao: z.string().min(1),
    /** tipo de contador que o servidor acompanha */
    tipo: z.enum(['licao', 'contador', 'masmorra', 'nivel', 'story_flag']),
    /** o que é contado: id de lugar, de masmorra, de story_flag ou de contador */
    chave: Id,
    meta: z.number().int().positive(),
    ...Sugestao,
  })
  .strict();
export type Desbloqueio = z.infer<typeof Desbloqueio>;

export const Corpo = z
  .object({
    ...opcao,
    /** deslocamento vertical da cabeça em px no boneco de 32x48 (negativo = mais alto) */
    offsetCabecaPx: z.number().int(),
    /** largura extra do tronco em px, para as roupas encaixarem */
    larguraExtraPx: z.number().int(),
  })
  .strict();

export const Pele = z
  .object({
    ...opcao,
    hex: Hex,
    /** sombra usada no pixel art */
    hexSombra: Hex,
    /** segunda cor do padrão (marca de regata) */
    hexSecundario: Hex.optional(),
    zoeiro: z.boolean(),
    desbloqueio: Desbloqueio.optional(),
  })
  .strict()
  .refine((p) => !p.zoeiro || p.desbloqueio !== undefined, { message: 'pele zoeira precisa de desbloqueio' });

export const Expressao = z
  .object({ artKey: Id, descricao: z.string().min(1), ...Sugestao })
  .strict();

export const Rosto = z
  .object({
    ...opcao,
    expressoes: z.object({ briga: Expressao, vitoria: Expressao, derrota: Expressao }).strict(),
  })
  .strict();

export const Corte = z
  .object({
    ...opcao,
    /** a cor de cabelo escolhida pinta esta camada */
    tingivel: z.boolean(),
    /** não desenha cabelo (careca) */
    semCabelo: z.boolean().default(false),
    /** já cobre a cabeça (boné): chapéu de item troca por cima */
    cobreCabeca: z.boolean().default(false),
  })
  .strict();

export const CorCabelo = z
  .object({ ...opcao, hex: Hex, hexSombra: Hex })
  .strict();

export const GrupoDetalhe = z.enum([
  'barba',
  'bigode',
  'cavanhaque',
  'oculos',
  'cicatriz',
  'pinta',
  'dente_de_ouro',
  'olheira',
  'tatuagem',
]);

export const Detalhe = z
  .object({
    ...opcao,
    grupo: GrupoDetalhe,
    /** grupos que não combinam com este */
    excluiGrupos: z.array(GrupoDetalhe).default([]),
    /** usa a cor do cabelo (pelos do rosto) */
    usaCorDoCabelo: z.boolean().default(false),
  })
  .strict();

export const NomeErrado = z
  .object({ id: Id, certo: z.string().min(1), errado: z.string().min(1), ...Sugestao })
  .strict();

/**
 * Roupa do Delta. Fonte única das cores e das camadas: outfits.json, traje `traje` (tier delta).
 * `pecas[].artKey` é a chave `arte` da camada desse traje; `cores` são os ids das 6 paletas dele.
 */
export const RoupaInicial = z
  .object({
    /** id do traje de tier delta em outfits.json */
    traje: Id,
    pecas: z.array(z.object({ id: Id, name: z.string(), artKey: Id, ...Sugestao }).strict()).min(1),
    estampa: z.string().min(1),
    /** ids de outfits.tiers[traje].paletas, na mesma ordem */
    cores: z.array(Id).length(6),
    ...Sugestao,
  })
  .strict();

export const RegrasNome = z
  .object({
    minCaracteres: z.number().int().positive(),
    maxCaracteres: z.number().int().positive(),
    /** regex de caracteres aceitos (JS, sem barras) */
    permitido: z.string().min(1),
    regras: z.array(z.string().min(1)).min(1),
    /** antes de comparar: minúsculas, sem acento, sem espaço/pontuação e com troca de leetspeak */
    normalizacao: z.object({ trocas: z.record(z.string(), z.string()) }).strict(),
    /** trechos proibidos, comparados com o nome normalizado */
    padroesOfensa: z.array(z.string().min(2)).min(1),
    /** palavras que contêm um padrão mas são inocentes */
    excecoes: z.array(z.string()),
    mensagemRecusa: z.string().min(1),
    ...Sugestao,
  })
  .strict();

export const ParteMaquina = z.enum(['body', 'skin', 'face', 'hair', 'hair_color', 'details', 'palette', 'shown_visual_tier']);

/**
 * Máquinas de Visual vistas pela criação de personagem. A definição (local, termos de uso,
 * atendente) fica só em institutions.json (maquinasVisual); aqui só os ids e quais campos do
 * `player.appearance` elas mudam.
 */
export const MaquinasVisualRef = z
  .object({
    /** ids de institutions.maquinasVisual */
    ids: z.array(Id).min(1),
    muda: z.array(ParteMaquina).min(1),
    paletasPorAla: z.number().int().positive(),
    ...Sugestao,
  })
  .strict();

export const AparenciaPadrao = z
  .object({
    body: Id,
    skin: Id,
    face: Id,
    hair: Id,
    hair_color: Id,
    details: z.array(Id),
    palette: Id,
    ...Sugestao,
  })
  .strict();

export const AppearanceFile = z
  .object({
    corpos: z.array(Corpo).length(5),
    peles: z.array(Pele).length(15),
    rostos: z.array(Rosto).length(16),
    cortes: z.array(Corte).length(20),
    coresCabelo: z.array(CorCabelo).length(12),
    detalhes: z.array(Detalhe).min(9),
    tatuagemNomesErrados: z.array(NomeErrado).min(1),
    roupaInicial: RoupaInicial,
    nome: RegrasNome,
    regras: z
      .object({
        maxDetalhes: z.number().int().positive(),
        umPorGrupo: z.boolean(),
        cabecaCobertaEscondeCabelo: z.string().min(1),
        silhuetaDaAlaFixa: z.string().min(1),
        ...Sugestao,
      })
      .strict(),
    maquinas: MaquinasVisualRef,
    padrao: AparenciaPadrao,
  })
  .strict()
  .superRefine((f, ctx) => {
    const lists: [string, { id: string }[]][] = [
      ['corpos', f.corpos],
      ['peles', f.peles],
      ['rostos', f.rostos],
      ['cortes', f.cortes],
      ['coresCabelo', f.coresCabelo],
      ['detalhes', f.detalhes],
    ];
    if (new Set(f.roupaInicial.cores).size !== f.roupaInicial.cores.length) ctx.addIssue({ code: 'custom', message: 'roupaInicial.cores: id repetido' });
    if (new Set(f.maquinas.ids).size !== f.maquinas.ids.length) ctx.addIssue({ code: 'custom', message: 'maquinas.ids: id repetido' });
    for (const [nome, l] of lists) {
      const s = new Set<string>();
      for (const x of l) {
        if (s.has(x.id)) ctx.addIssue({ code: 'custom', message: `${nome}: id repetido ${x.id}` });
        s.add(x.id);
      }
    }
    if (f.peles.filter((p) => p.zoeiro).length !== 3) ctx.addIssue({ code: 'custom', message: 'esperado 3 peles zoeiras' });
    const has = (l: { id: string }[], id: string) => l.some((x) => x.id === id);
    const p = f.padrao;
    if (!has(f.corpos, p.body)) ctx.addIssue({ code: 'custom', message: `padrao.body inválido: ${p.body}` });
    if (!has(f.peles, p.skin)) ctx.addIssue({ code: 'custom', message: `padrao.skin inválido: ${p.skin}` });
    if (!has(f.rostos, p.face)) ctx.addIssue({ code: 'custom', message: `padrao.face inválido: ${p.face}` });
    if (!has(f.cortes, p.hair)) ctx.addIssue({ code: 'custom', message: `padrao.hair inválido: ${p.hair}` });
    if (!has(f.coresCabelo, p.hair_color)) ctx.addIssue({ code: 'custom', message: `padrao.hair_color inválido: ${p.hair_color}` });
    if (!f.roupaInicial.cores.includes(p.palette)) ctx.addIssue({ code: 'custom', message: `padrao.palette inválido: ${p.palette}` });
    for (const d of p.details) if (!has(f.detalhes, d)) ctx.addIssue({ code: 'custom', message: `padrao.details inválido: ${d}` });
  });
export type AppearanceFile = z.infer<typeof AppearanceFile>;

/**
 * Conferência entre arquivos: a roupa do Delta e as Máquinas de Visual têm uma fonte só
 * (outfits.json e institutions.json); appearance.json só aponta para elas.
 * Devolve a lista de problemas (vazia quando está tudo certo).
 */
export function crossCheckAppearance(
  appearance: AppearanceFile,
  outfits: OutfitsFile,
  institutions: InstitutionsFile,
  npcs: NpcsFile,
): string[] {
  const problems: string[] = [];
  const r = appearance.roupaInicial;
  const traje = outfits.tiers.find((t) => t.id === r.traje);
  if (!traje || traje.tier !== 'delta') problems.push(`appearance.roupaInicial: traje ${r.traje} não é o tier delta de outfits.json`);
  else {
    const paletas = (traje.paletas ?? []).map((p) => p.id);
    if (JSON.stringify(paletas) !== JSON.stringify(r.cores)) problems.push(`appearance.roupaInicial.cores difere de outfits ${traje.id}.paletas`);
    const artes = traje.camadas.map((l) => l.arte);
    for (const peca of r.pecas) if (!artes.includes(peca.artKey)) problems.push(`appearance.roupaInicial: peça ${peca.id} usa ${peca.artKey}, que não é camada de ${traje.id}`);
    for (const a of artes) if (!r.pecas.some((p) => p.artKey === a)) problems.push(`appearance.roupaInicial: camada ${a} de ${traje.id} sem peça`);
  }
  const maquinas = new Map(institutions.maquinasVisual.map((m) => [m.id, m]));
  for (const id of appearance.maquinas.ids) if (!maquinas.has(id)) problems.push(`appearance.maquinas: ${id} não existe em institutions.maquinasVisual`);
  for (const m of institutions.maquinasVisual) {
    if (!appearance.maquinas.ids.includes(m.id)) problems.push(`appearance.maquinas: falta ${m.id}`);
    const npc = npcs.personagens.find((n) => n.id === m.atendente);
    if (!npc) problems.push(`${m.id}: atendente ${m.atendente} não existe em npcs.json`);
    else if (!npc.falas.some((g) => g.contexto === 'maquina_de_visual')) problems.push(`${m.id}: atendente ${npc.id} sem falas maquina_de_visual`);
  }
  return problems;
}
