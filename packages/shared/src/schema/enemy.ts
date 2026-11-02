import { z } from 'zod';
import { Id, Sugestao } from './common';
import { Ability, Effect, Passive } from './ability';
import { RegiaoFixa } from './balance';

/**
 * Inimigos, elites com afixos e chefes (Sistemas.md, "Inimigos, saque e reanimar" e "Masmorras").
 * Os atributos de cada entrada já são os finais do seu tier; promocaoElite só vale quando um
 * inimigo normal nasce elite no bando.
 */

export const EnemyTier = z.enum(['normal', 'elite', 'chefe']);
export type EnemyTier = z.infer<typeof EnemyTier>;

export const EnemyBehavior = z.enum(['corpo_a_corpo', 'a_distancia', 'enxame', 'suporte']);
export type EnemyBehavior = z.infer<typeof EnemyBehavior>;

export const EliteAffixId = z.enum(['rapido', 'blindado', 'explode_ao_morrer', 'cura_os_outros']);
export type EliteAffixId = z.infer<typeof EliteAffixId>;

/** loot_normal, loot_elite, loot_chefe ou variante (loot_chefe_galerias). */
export const LootTableRef = Id.regex(/^loot_(normal|elite|chefe)(_[a-z0-9_]+)?$/, 'tabela de saque deve ser loot_normal, loot_elite, loot_chefe ou variante');
export type LootTableRef = z.infer<typeof LootTableRef>;

const MinMaxInt = z
  .object({ min: z.number().int().nonnegative(), max: z.number().int().nonnegative() })
  .strict()
  .refine((m) => m.min <= m.max, 'min > max');

export const EliteAffix = z
  .object({
    id: EliteAffixId,
    name: z.string().min(1),
    description: z.string().min(1),
    passivos: z.array(Passive).min(1),
    /** como o afixo aparece no sprite */
    visual: z.string().optional(),
    ...Sugestao,
  })
  .strict();
export type EliteAffix = z.infer<typeof EliteAffix>;

export const EnemyPhase = z
  .object({
    id: Id,
    name: z.string().min(1),
    /** a fase começa quando a vida cai abaixo deste % (a primeira usa 100) */
    vidaAbaixoPct: z.number().min(0).max(100),
    habilidades: z.array(Id).min(1),
    /** efeitos ao entrar na fase (ex.: gancho agua_subindo) */
    aoEntrar: z.array(Effect).optional(),
    reforcos: z.array(z.object({ inimigo: Id, quantidade: z.number().int().positive() }).strict()).optional(),
    /** repete os reforços a cada N s enquanto a fase durar */
    reforcosACadaS: z.number().positive().optional(),
    fala: z.string().optional(),
    ...Sugestao,
  })
  .strict();
export type EnemyPhase = z.infer<typeof EnemyPhase>;

export const Enemy = z
  .object({
    id: Id,
    name: z.string().min(1),
    description: z.string().min(1),
    tier: EnemyTier,
    nivel: z.number().int().positive(),
    regioes: z.array(RegiaoFixa).min(1),
    /** quando vive numa masmorra */
    masmorra: z.object({ id: Id, andarMin: z.number().int().positive(), andarMax: z.number().int().positive() }).strict().optional(),
    vida: z.number().positive(),
    ataque: z.number().nonnegative(),
    defesa: z.number().nonnegative(),
    velocidade: z.number().nonnegative(),
    /** 1 = corpo a corpo, 2 = médio, 3 = longo (mesma escala dos arquétipos) */
    alcance: z.number().int().min(1).max(3),
    comportamento: EnemyBehavior,
    voa: z.boolean().optional(),
    imovel: z.boolean().optional(),
    soNaAgua: z.boolean().optional(),
    /** raio do corpo para colisão e toque, em tiles */
    raioCorpoTiles: z.number().positive(),
    bando: MinMaxInt,
    /** outros inimigos que nascem junto */
    escolta: z.array(z.object({ inimigo: Id, min: z.number().int().nonnegative(), max: z.number().int().positive() }).strict()).optional(),
    afixosPossiveis: z.array(EliteAffixId),
    /** afixos sorteados quando o próprio tier é elite (inimigos que já nascem elite) */
    afixosFixos: MinMaxInt.optional(),
    tabelaSaque: LootTableRef,
    xp: z.number().nonnegative(),
    ataqueBasico: Id,
    habilidades: z.array(Id),
    fases: z.array(EnemyPhase).optional(),
    /** chefes: controle vira lentidão deste % pela mesma duração */
    controleViraLentidaoPct: z.number().positive().optional(),
    /** chefes: vida a mais por jogador além do primeiro */
    vidaPorJogadorExtraPct: z.number().nonnegative().optional(),
    falas: z
      .object({
        aoAparecer: z.array(z.string()).optional(),
        aoCair: z.array(z.string()).optional(),
        aoDerrotarJogador: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
    visual: z.string().optional(),
    ...Sugestao,
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.tier === 'chefe') {
      if (!e.fases || e.fases.length < 2 || e.fases.length > 3) ctx.addIssue({ code: 'custom', message: `${e.id}: chefe precisa de 2 a 3 fases` });
      if (e.controleViraLentidaoPct === undefined) ctx.addIssue({ code: 'custom', message: `${e.id}: chefe precisa de controleViraLentidaoPct` });
      if (!e.tabelaSaque.startsWith('loot_chefe')) ctx.addIssue({ code: 'custom', message: `${e.id}: chefe usa loot_chefe*` });
    } else if (e.fases) {
      ctx.addIssue({ code: 'custom', message: `${e.id}: só chefe tem fases` });
    }
    if (e.tier === 'elite' && !e.tabelaSaque.startsWith('loot_elite')) ctx.addIssue({ code: 'custom', message: `${e.id}: elite usa loot_elite*` });
    if (e.tier === 'normal' && !e.tabelaSaque.startsWith('loot_normal')) ctx.addIssue({ code: 'custom', message: `${e.id}: normal usa loot_normal*` });
    if (e.fases) {
      const f = e.fases;
      if (f[0] && f[0].vidaAbaixoPct !== 100) ctx.addIssue({ code: 'custom', message: `${e.id}: primeira fase começa em 100` });
      for (let i = 1; i < f.length; i++) {
        if (f[i]!.vidaAbaixoPct >= f[i - 1]!.vidaAbaixoPct) ctx.addIssue({ code: 'custom', message: `${e.id}: fases fora de ordem` });
      }
    }
    if (e.masmorra && e.masmorra.andarMin > e.masmorra.andarMax) ctx.addIssue({ code: 'custom', message: `${e.id}: andares invertidos` });
  });
export type Enemy = z.infer<typeof Enemy>;

export const EnemiesFile = z
  .object({
    /** quando um inimigo normal nasce elite */
    promocaoElite: z
      .object({
        chancePorBando: z.number().min(0).max(1),
        vidaMult: z.number().positive(),
        ataqueMult: z.number().positive(),
        defesaMult: z.number().positive(),
        xpMult: z.number().positive(),
        escalaVisual: z.number().positive(),
        afixos: MinMaxInt,
        tabelaSaque: LootTableRef,
        ...Sugestao,
      })
      .strict(),
    regrasChefe: z
      .object({
        fasesMin: z.number().int(),
        fasesMax: z.number().int(),
        avisoMinMs: z.number().int().min(800),
        controleViraLentidaoPct: z.number().positive(),
        vidaPorJogadorExtraPct: z.number().nonnegative(),
        description: z.string(),
        ...Sugestao,
      })
      .strict(),
    /** inimigo acima do nível base (andares fundos, regiões mais altas) */
    escalaPorNivel: z
      .object({ vidaPct: z.number(), ataquePct: z.number(), defesaPct: z.number(), xpPct: z.number(), ...Sugestao })
      .strict(),
    /** ajuste geral de dificuldade, em % sobre a vida e o ataque de todo inimigo (negativo = mais fácil) */
    dificuldade: z
      .object({ vidaPct: z.number().gt(-100), ataquePct: z.number().gt(-100), ...Sugestao })
      .strict()
      .optional(),
    afixos: z.array(EliteAffix).length(4),
    inimigos: z.array(Enemy).min(1),
    ...Sugestao,
  })
  .strict()
  .superRefine((f, ctx) => {
    const ids = new Set<string>();
    for (const e of f.inimigos) {
      if (ids.has(e.id)) ctx.addIssue({ code: 'custom', message: `inimigo repetido: ${e.id}` });
      ids.add(e.id);
    }
    for (const e of f.inimigos) {
      for (const esc of e.escolta ?? []) if (!ids.has(esc.inimigo)) ctx.addIssue({ code: 'custom', message: `${e.id}: escolta ${esc.inimigo} não existe` });
      for (const fase of e.fases ?? [])
        for (const r of fase.reforcos ?? []) if (!ids.has(r.inimigo)) ctx.addIssue({ code: 'custom', message: `${e.id}: reforço ${r.inimigo} não existe` });
    }
    if (new Set(f.afixos.map((a) => a.id)).size !== 4) ctx.addIssue({ code: 'custom', message: 'afixos repetidos' });
  });
export type EnemiesFile = z.infer<typeof EnemiesFile>;

/** Ataque "grande": área com dano somado >= 1,0 × ataque, ou campo com dano. Precisa de aviso >= 800 ms. */
export function isBigEnemyAttack(a: Ability): boolean {
  const area = a.type === 'area_alvo' || a.type === 'campo' || a.type === 'em_volta' || a.type === 'cone';
  if (!area) return false;
  let total = 0;
  let campoComDano = false;
  for (const ef of a.effects) {
    if (ef.kind === 'dano') total += ef.mult * (ef.hits ?? 1);
    if (ef.kind === 'campo' && ef.efeitos.some((x) => x.kind === 'dano' || x.kind === 'dano_continuo')) campoComDano = true;
  }
  return total >= 1 || campoComDano;
}

export const EnemyAbilitiesFile = z.array(Ability).superRefine((list, ctx) => {
  const ids = new Set<string>();
  for (const a of list) {
    if (ids.has(a.id)) ctx.addIssue({ code: 'custom', message: `habilidade repetida: ${a.id}` });
    ids.add(a.id);
    if (a.slot !== 'inimigo') ctx.addIssue({ code: 'custom', message: `${a.id}: slot deve ser 'inimigo'` });
    if (isBigEnemyAttack(a) && a.telegraphMs < 800) ctx.addIssue({ code: 'custom', message: `${a.id}: ataque grande sem aviso de 800 ms` });
  }
});
export type EnemyAbilitiesFile = z.infer<typeof EnemyAbilitiesFile>;

/** Confere as referências entre inimigos e habilidades de inimigo. Devolve a lista de erros. */
export function checkEnemyRefs(enemies: EnemiesFile, abilities: EnemyAbilitiesFile): string[] {
  const errs: string[] = [];
  const byId = new Map(abilities.map((a) => [a.id, a]));
  const used = new Set<string>();
  for (const e of enemies.inimigos) {
    const refs = [e.ataqueBasico, ...e.habilidades, ...(e.fases ?? []).flatMap((f) => f.habilidades)];
    for (const id of refs) {
      used.add(id);
      const a = byId.get(id);
      if (!a) errs.push(`${e.id}: habilidade ${id} não existe`);
      else if (a.ownerKey !== e.id) errs.push(`${e.id}: habilidade ${id} tem ownerKey ${a.ownerKey}`);
    }
    if (e.tier === 'chefe') {
      for (const id of refs) {
        const a = byId.get(id);
        if (a && a.type !== 'travada' && a.effects.some((x) => x.kind === 'dano') && a.telegraphMs < enemies.regrasChefe.avisoMinMs)
          errs.push(`${e.id}: ${id} de chefe em área sem aviso no chão`);
      }
    }
  }
  for (const a of abilities) if (!used.has(a.id)) errs.push(`habilidade de inimigo sem dono em uso: ${a.id}`);
  return errs;
}
