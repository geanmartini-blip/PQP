import { z } from 'zod';
import { ClassId, Id, Palette, Role, Side, Sugestao } from './common';
import { InstitutionId, type InstitutionsFile } from './institution';
import { OutfitPart, PILOT_TIERS, TRAJE_PALETA_TAMANHO, type OutfitsFile } from './outfit';

/**
 * Os 24 arquétipos (alas). Fonte: Sistemas.md (Os 24 arquétipos, Treinadores e habilidades de
 * cada ala, talentos-chave, virada) e Arte.md (visual do treinador, poses, piada).
 * Habilidades marca e talentos são referenciados por id/texto; os donos deles são outros domínios.
 */

export const ArchetypeId = z.enum([
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
export type ArchetypeId = z.infer<typeof ArchetypeId>;

const TextRef = z.object({ name: z.string().min(1), texto: z.string().min(1), ...Sugestao }).strict();

/** Elemento que a Máquina de Visual nunca tira: a parte e as artes que o satisfazem. */
export const SilhouetteElement = z
  .object({
    parte: OutfitPart,
    elemento: z.string().min(1),
    /** chaves do artCatalog que contam como este elemento (versão simples e completa) */
    artes: z.array(Id).min(1),
    ...Sugestao,
  })
  .strict();
export type SilhouetteElement = z.infer<typeof SilhouetteElement>;

export const Archetype = z
  .object({
    id: ArchetypeId,
    name: z.string().min(1),
    classe: ClassId,
    papel: Role,
    margem: Side,
    instituicao: InstitutionId,
    /** id do treinador NPC da ala */
    treinador: Id,
    habilidadesMarca: z.object({ marca_1: Id, marca_2: Id }).strict(),
    /** os 2 talentos-chave do nível 20, por texto (ids são do domínio de progressão) */
    talentosChave: z.array(TextRef).length(2),
    buildExemplo: z.string().min(1),
    virada: z.object({ id: Id, name: z.string().min(1), texto: z.string().min(1), ...Sugestao }).strict(),
    /** o que a Máquina de Visual nunca tira (Sistemas.md: Peão sempre chapéu e fivela; Idol franja e caixas de som) */
    silhueta: z.array(SilhouetteElement).min(1),
    /** visual do treinador, texto de Arte.md (é o traje de mestre) */
    visualTreinador: z.string().min(1),
    /** as 3 poses da ficha */
    poses: z.array(z.string().min(1)).length(3),
    /** piada da ficha, texto de Arte.md */
    piada: z.string().min(1),
    /** a piada nas costas do traje de veterano */
    costas: z.object({ descricao: z.string().min(1), texto: z.string().min(1).optional(), ...Sugestao }).strict(),
    /** 3 paletas do traje da ala, trocadas na Máquina de Visual */
    paletasTraje: z
      .array(z.object({ id: Id, name: z.string().min(1), cores: Palette, ...Sugestao }).strict())
      .length(3),
    efeitos: z
      .object({
        estilo: z.enum(['encanto', 'maquina']),
        descricao: z.string().min(1),
        proprios: z.array(z.string().min(1)).min(1),
        ...Sugestao,
      })
      .strict(),
    ...Sugestao,
  })
  .strict()
  .superRefine((a, ctx) => {
    if (a.virada.id !== `virada_${a.id}`) ctx.addIssue({ code: 'custom', message: `${a.id}: virada deve ser virada_${a.id}` });
    const estilo = a.margem === 'esquerda' ? 'encanto' : 'maquina';
    if (a.efeitos.estilo !== estilo) ctx.addIssue({ code: 'custom', message: `${a.id}: efeitos devem ser ${estilo}` });
    for (const p of a.paletasTraje) {
      if (p.cores.length !== TRAJE_PALETA_TAMANHO) {
        ctx.addIssue({ code: 'custom', message: `${a.id}: paleta ${p.id} deve ter ${TRAJE_PALETA_TAMANHO} cores` });
      }
    }
  });
export type Archetype = z.infer<typeof Archetype>;

export const ArchetypesFile = z
  .array(Archetype)
  .length(24)
  .superRefine((list, ctx) => {
    const seen = new Set<string>();
    for (const a of list) {
      if (seen.has(a.id)) ctx.addIssue({ code: 'custom', message: `arquétipo repetido: ${a.id}` });
      seen.add(a.id);
    }
    const marcas = list.flatMap((a) => [a.habilidadesMarca.marca_1, a.habilidadesMarca.marca_2]);
    if (new Set(marcas).size !== marcas.length) ctx.addIssue({ code: 'custom', message: 'habilidade marca repetida entre arquétipos' });
  });
export type ArchetypesFile = z.infer<typeof ArchetypesFile>;

/**
 * Conferência entre arquivos: instituições x arquétipos x trajes.
 * Devolve a lista de problemas (vazia quando está tudo certo).
 */
export function crossCheckArchetypes(
  archetypes: ArchetypesFile,
  institutions: InstitutionsFile,
  outfits: OutfitsFile,
): string[] {
  const problems: string[] = [];
  const byId = new Map(archetypes.map((a) => [a.id as string, a]));
  const catalog = new Map(outfits.artCatalog.map((e) => [e.arte, e]));

  for (const inst of institutions.instituicoes) {
    for (const ala of inst.alas) {
      const a = byId.get(ala);
      if (!a) problems.push(`${inst.id}: ala ${ala} não existe`);
      else if (a.instituicao !== inst.id || a.margem !== inst.margem || a.classe !== inst.classe) {
        problems.push(`${inst.id}: ala ${ala} com instituição, margem ou classe diferente`);
      }
    }
    const base = outfits.tiers.find((t) => t.id === inst.uniformeBase.traje);
    if (!base || base.tier !== 'base' || base.instituicao !== inst.id) problems.push(`${inst.id}: uniforme base ${inst.uniformeBase.traje} inválido`);
  }
  for (const a of archetypes) {
    if (!institutions.instituicoes.some((i) => i.alas.includes(a.id))) problems.push(`${a.id}: não está nas alas de nenhuma instituição`);
    for (const s of a.silhueta) {
      for (const arte of s.artes) {
        const e = catalog.get(arte);
        if (!e) problems.push(`${a.id}: silhueta usa ${arte}, fora do artCatalog`);
        else if (e.parte !== s.parte) problems.push(`${a.id}: silhueta ${arte} é de ${e.parte}, não de ${s.parte}`);
      }
    }
    for (const kind of ['aprendiz', 'veterano', 'virada', 'mestre', 'lendario'] as const) {
      const tier = outfits.tiers.find((t) => t.arquetipo === a.id && t.tier === kind);
      if (!tier) {
        problems.push(`${a.id}: falta o traje ${kind}`);
        continue;
      }
      if (!PILOT_TIERS.includes(kind)) continue;
      for (const s of a.silhueta) {
        if (!tier.camadas.some((l) => l.parte === s.parte && s.artes.includes(l.arte))) {
          problems.push(`${a.id}: traje ${kind} perde a silhueta "${s.elemento}"`);
        }
      }
    }
  }
  for (const t of outfits.tiers) {
    if (t.arquetipo && !byId.has(t.arquetipo)) problems.push(`${t.id}: arquétipo ${t.arquetipo} não existe`);
  }
  return problems;
}
