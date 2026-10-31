import { z } from 'zod';
import { Id, Sugestao } from './common';

/**
 * Linguagem de efeitos das habilidades, talentos, guias, itens e inimigos.
 *
 * Regras do briefing que esta linguagem precisa respeitar:
 * - Toda habilidade acerta sozinha: travada, em volta, área no alvo, cone virado, campo ou em aliado.
 * - Áreas com raio mínimo de 2 tiles e duração no chão.
 * - Recarga global de 1 s; recargas de 6 a 20 s; carga máxima de 0,5 s (castMs).
 * - Controles de 1 a 2 s com imunidade de 4 s; chefes só ficam lentos.
 * - Passivos são recarga, aura, gatilho ou número. Nunca "uma vez por luta".
 *
 * Convenções de leitura dos efeitos (usadas nos JSON de habilidades):
 * - Ponto de efeito: o alvo travado (travada, area_alvo, campo lançado longe) ou o próprio lançador
 *   (em_volta, cone, campo com range 0, aliado usa o aliado escolhido).
 * - Sem `radius` próprio, `inimigos_area`/`aliados_area` usam a forma da habilidade (círculo do
 *   `radius` ou o cone de `range` e `angleDeg`). Com `radius` próprio, é um círculo em volta do ponto.
 * - Efeitos dentro de um `campo` são reaplicados a cada tickMs; reforço, escudo e lentidão da mesma
 *   fonte renovam a duração em vez de acumular.
 * - Escudo reaplicado pela mesma fonte renova só a duração, nunca o valor absorvido: o que já foi
 *   gasto continua gasto até o escudo acabar (ex.: Xale de Lã dá no máximo 15% enquanto dura o campo).
 * - Campo com `segueLancador` numa habilidade em cone: o cone (range + angleDeg) acompanha o lançador
 *   e continua virado sozinho para o alvo travado; os efeitos sem `radius` próprio usam esse cone a
 *   cada tick (ex.: Sinalizador). Num campo em volta, usam o círculo do `radius` da habilidade.
 * - Velocidade: `speed` entra nos três eixos (ataque, recarga e deslocamento) e soma com os reforços
 *   do próprio eixo (`attackSpeed`, `cooldownSpeed`, `moveSpeed`). Para não contar duas vezes, quem
 *   já dá `cooldownSpeed` dá `moveSpeed` + `attackSpeed` em vez de `speed` (ex.: Blockbuster).
 * - Controles (jogador: slots basico, classe, marca, especial e virada) duram de 1 a 2 s; provocar,
 *   até 4 s; controle com `quebraAoApanhar` (acaba no primeiro golpe) pode ir até 6 s (Protocolo
 *   Infinito). Os limites espelham balance.json/combate e são conferidos lá (LIMITES_CONTROLE).
 * - `dano.mult` e `dano_continuo.multPorTick` multiplicam o Ataque de quem lança (ou da invocação).
 * - `dano.culatra`: com essa chance, a explosão cai em volta do lançador com `culatra.mult`.
 * - `sugestaoCampos` aceita caminhos com ponto (ex.: "effects.dano.mult", "cooldownS").
 */

export const AbilityType = z.enum(['travada', 'em_volta', 'area_alvo', 'cone', 'campo', 'aliado']);
export type AbilityType = z.infer<typeof AbilityType>;

export const AbilitySlot = z.enum([
  'basico', // ataque básico automático
  'classe', // uma das 4 habilidades da classe
  'marca_1', // habilidade marca A do arquétipo
  'marca_2', // habilidade marca B do arquétipo
  'especial', // Especial da classe (antes da virada)
  'virada', // virada do arquétipo (Especial a partir do 30; fora do piloto)
  'inimigo', // ataque de inimigo, elite ou chefe
  'item', // consumível do botão de item
]);
export type AbilitySlot = z.infer<typeof AbilitySlot>;

/** Quem recebe o efeito. */
export const TargetSelector = z.enum([
  'alvo', // alvo travado
  'self',
  'inimigos_area', // inimigos dentro do raio do ponto de efeito
  'aliados_area', // aliados (inclui self) dentro do raio
  'aliados_area_sem_self',
  'grupo', // todo o grupo, em qualquer distância
  'aliado_menos_vida', // aliado com menor % de vida no alcance
  'aliado_mais_perto',
  'inimigo_mais_perto',
  'inimigos_a_vista', // todos os inimigos com linha de visão (viradas)
  'inimigos_caminho', // inimigos atravessados num avanço ou tiro que atravessa
]);
export type TargetSelector = z.infer<typeof TargetSelector>;

export const StatKey = z.enum([
  'hp',
  'attack',
  'defense',
  'speed', // velocidade geral: ataque, recarga e deslocamento
  'moveSpeed',
  'attackSpeed',
  'cooldownSpeed',
  'damage', // dano causado
  'damageTaken', // dano recebido (negativo = redução)
  'crit', // chance de crítico em pontos percentuais
  'critDamage',
  'evasion',
  'accuracy',
  'ccResist',
  'ccDuration', // duração dos controles que você aplica
  'buffDuration',
  'areaSize',
  'healing', // cura causada
  'healingTaken',
  'shield', // força dos escudos que você aplica
  'resourceMax',
  'resourceRegen',
  'resourceCost',
  'specialCharge', // velocidade de carga do Especial
  'range',
  'xp',
  'loot',
]);
export type StatKey = z.infer<typeof StatKey>;

export const CcKind = z.enum([
  'atordoar', // stun
  'prender', // root
  'derrubar', // knockdown (age como atordoar curto)
  'cegar', // erra ataques
  'confundir', // ataca a esmo
  'provocar', // taunt: obriga a atacar quem provocou
  'silenciar',
  'tontura', // dizzy (Saci): age como confundir curto
]);
export type CcKind = z.infer<typeof CcKind>;

const base = {
  target: TargetSelector.optional(),
  /** raio próprio do efeito, em tiles; senão usa o da habilidade */
  radius: z.number().positive().optional(),
  /** chance de 0 a 1 de o efeito acontecer */
  chance: z.number().min(0).max(1).optional(),
};

export type Effect =
  | { kind: 'dano'; mult: number; hits?: number; perfura?: boolean; salto?: { saltos: number; alcance: number; quedaPct?: number }; culatra?: { chance: number; mult: number } } & EffectBase
  | { kind: 'dano_continuo'; multPorTick: number; tickMs: number; duracaoMs: number; pulaAoMorrer?: boolean; pulaAlcance?: number; pulaEntreProximos?: boolean } & EffectBase
  | { kind: 'cura'; pctVidaMax?: number; mult?: number } & EffectBase
  | { kind: 'cura_continua'; pctVidaMaxPorTick: number; tickMs: number; duracaoMs: number } & EffectBase
  | { kind: 'escudo'; pctVidaMax: number; duracaoMs: number; devolvePct?: number; seguraProjeteis?: boolean; divididoEntreAliados?: boolean; refazMs?: number } & EffectBase
  | { kind: 'reducao_dano'; pct: number; duracaoMs: number } & EffectBase
  | { kind: 'devolver_dano'; pct: number; duracaoMs: number } & EffectBase
  | { kind: 'controle'; cc: CcKind; duracaoMs: number; quebraAoApanhar?: boolean } & EffectBase
  | { kind: 'lentidao'; pct: number; duracaoMs: number } & EffectBase
  | { kind: 'empurrar'; tiles: number } & EffectBase
  | { kind: 'puxar'; tiles?: number; paraCentro?: boolean; duracaoMs?: number } & EffectBase
  | { kind: 'reforco'; stat: StatKey; pct: number; duracaoMs: number; acumulaMax?: number } & EffectBase
  | { kind: 'marca'; danoRecebidoPct: number; duracaoMs: number; soDoLancador?: boolean; pulaAoMorrer?: boolean } & EffectBase
  | { kind: 'avanco'; ate: 'alvo'; bateNoCaminho?: boolean; salto?: boolean } & EffectBase
  | { kind: 'recuo'; tiles: number; de: 'inimigo_mais_perto' | 'joystick' } & EffectBase
  | { kind: 'invocar'; invocacao: string; duracaoMs: number; max: number; quantidade?: number } & EffectBase
  | { kind: 'campo'; duracaoMs: number; tickMs: number; efeitos: Effect[]; segueLancador?: boolean } & EffectBase
  | { kind: 'transformar'; duracaoMs: number; basico?: { type: 'cone' | 'em_volta' | 'travada'; mult: number; raio?: number; anguloGraus?: number }; reforcos?: { stat: StatKey; pct: number }[]; tirosExtras?: number; tirosExtrasMult?: number } & EffectBase
  | { kind: 'invisivel'; duracaoMs: number; copia?: string } & EffectBase
  | { kind: 'imune'; duracaoMs: number; aDano?: boolean; aControle?: boolean; aEmpurrao?: boolean; aDanoDistancia?: boolean } & EffectBase
  | { kind: 'recurso'; pct: number } & EffectBase
  | { kind: 'derrubar_moeda'; quantidade: number } & EffectBase
  | { kind: 'explode_ao_morrer'; mult: number; raio: number; janelaMs: number } & EffectBase
  | { kind: 'limpar' } & EffectBase
  | { kind: 'zerar_recargas' } & EffectBase
  | { kind: 'levantar'; pctVida: number } & EffectBase
  | { kind: 'segurar_vida'; vidaMin: number; duracaoMs: number } & EffectBase
  | { kind: 'gancho'; gancho: string; params?: Record<string, unknown> } & EffectBase;

type EffectBase = { target?: TargetSelector; radius?: number; chance?: number };

/** Limites de duração de controle (ms) nas habilidades de jogador; balance.json/combate precisa bater. */
export const LIMITES_CONTROLE = {
  minMs: 1000,
  maxMs: 2000,
  provocarMaxMs: 4000,
  /** controle que acaba no primeiro golpe recebido (quebraAoApanhar) */
  quebravelMaxMs: 6000,
} as const;

/** Slots de habilidade de jogador (os que seguem as regras de controle do briefing). */
export const PLAYER_ABILITY_SLOTS: readonly AbilitySlot[] = ['basico', 'classe', 'marca_1', 'marca_2', 'especial', 'virada'];

/** Alvos de área: sem `radius` próprio, usam a forma de quem aplica. */
export const AREA_TARGETS: readonly TargetSelector[] = ['inimigos_area', 'aliados_area', 'aliados_area_sem_self'];

/** Todos os efeitos, incluindo os de dentro de campos. */
export function flattenEffects(effects: readonly Effect[]): Effect[] {
  const out: Effect[] = [];
  for (const e of effects) {
    out.push(e);
    if (e.kind === 'campo') out.push(...flattenEffects(e.efeitos));
  }
  return out;
}

export const Effect: z.ZodType<Effect> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('dano'), mult: z.number().nonnegative(), hits: z.number().int().positive().optional(), perfura: z.boolean().optional(), salto: z.object({ saltos: z.number().int().positive(), alcance: z.number().positive(), quedaPct: z.number().optional() }).optional(), culatra: z.object({ chance: z.number().min(0).max(1), mult: z.number() }).optional(), ...base }).strict(),
    z.object({ kind: z.literal('dano_continuo'), multPorTick: z.number().nonnegative(), tickMs: z.number().int().positive(), duracaoMs: z.number().int().positive(), pulaAoMorrer: z.boolean().optional(), pulaAlcance: z.number().optional(), pulaEntreProximos: z.boolean().optional(), ...base }).strict(),
    z.object({ kind: z.literal('cura'), pctVidaMax: z.number().optional(), mult: z.number().optional(), ...base }).strict(),
    z.object({ kind: z.literal('cura_continua'), pctVidaMaxPorTick: z.number(), tickMs: z.number().int().positive(), duracaoMs: z.number().int().positive(), ...base }).strict(),
    z.object({ kind: z.literal('escudo'), pctVidaMax: z.number().positive(), duracaoMs: z.number().int().positive(), devolvePct: z.number().optional(), seguraProjeteis: z.boolean().optional(), divididoEntreAliados: z.boolean().optional(), refazMs: z.number().int().optional(), ...base }).strict(),
    z.object({ kind: z.literal('reducao_dano'), pct: z.number(), duracaoMs: z.number().int().positive(), ...base }).strict(),
    z.object({ kind: z.literal('devolver_dano'), pct: z.number(), duracaoMs: z.number().int().positive(), ...base }).strict(),
    /** quebraAoApanhar: o controle acaba no primeiro golpe recebido (ex.: Protocolo Infinito). */
    z.object({ kind: z.literal('controle'), cc: CcKind, duracaoMs: z.number().int().positive(), quebraAoApanhar: z.boolean().optional(), ...base }).strict(),
    z.object({ kind: z.literal('lentidao'), pct: z.number(), duracaoMs: z.number().int().positive(), ...base }).strict(),
    z.object({ kind: z.literal('empurrar'), tiles: z.number().positive(), ...base }).strict(),
    z.object({ kind: z.literal('puxar'), tiles: z.number().optional(), paraCentro: z.boolean().optional(), duracaoMs: z.number().int().optional(), ...base }).strict(),
    z.object({ kind: z.literal('reforco'), stat: StatKey, pct: z.number(), duracaoMs: z.number().int().positive(), acumulaMax: z.number().int().optional(), ...base }).strict(),
    z.object({ kind: z.literal('marca'), danoRecebidoPct: z.number(), duracaoMs: z.number().int().positive(), soDoLancador: z.boolean().optional(), pulaAoMorrer: z.boolean().optional(), ...base }).strict(),
    z.object({ kind: z.literal('avanco'), ate: z.literal('alvo'), bateNoCaminho: z.boolean().optional(), salto: z.boolean().optional(), ...base }).strict(),
    z.object({ kind: z.literal('recuo'), tiles: z.number().positive(), de: z.enum(['inimigo_mais_perto', 'joystick']), ...base }).strict(),
    z.object({ kind: z.literal('invocar'), invocacao: Id, duracaoMs: z.number().int().positive(), max: z.number().int().positive(), quantidade: z.number().int().positive().optional(), ...base }).strict(),
    z.object({ kind: z.literal('campo'), duracaoMs: z.number().int().positive(), tickMs: z.number().int().positive(), efeitos: z.array(Effect), segueLancador: z.boolean().optional(), ...base }).strict(),
    /** tirosExtras: projéteis teleguiados a mais em cada ataque básico, cada um com tirosExtrasMult do dano (ex.: Horda). */
    z.object({ kind: z.literal('transformar'), duracaoMs: z.number().int().positive(), basico: z.object({ type: z.enum(['cone', 'em_volta', 'travada']), mult: z.number(), raio: z.number().optional(), anguloGraus: z.number().optional() }).optional(), reforcos: z.array(z.object({ stat: StatKey, pct: z.number() })).optional(), tirosExtras: z.number().int().positive().optional(), tirosExtrasMult: z.number().positive().optional(), ...base }).strict(),
    z.object({ kind: z.literal('invisivel'), duracaoMs: z.number().int().positive(), copia: Id.optional(), ...base }).strict(),
    /** aDanoDistancia: bloqueia só o dano à distância (projéteis e tiros), ex.: Muralha de Escudos. */
    z.object({ kind: z.literal('imune'), duracaoMs: z.number().int().positive(), aDano: z.boolean().optional(), aControle: z.boolean().optional(), aEmpurrao: z.boolean().optional(), aDanoDistancia: z.boolean().optional(), ...base }).strict(),
    z.object({ kind: z.literal('recurso'), pct: z.number(), ...base }).strict(),
    z.object({ kind: z.literal('derrubar_moeda'), quantidade: z.number().int().positive(), ...base }).strict(),
    z.object({ kind: z.literal('explode_ao_morrer'), mult: z.number(), raio: z.number().min(2), janelaMs: z.number().int().positive(), ...base }).strict(),
    z.object({ kind: z.literal('limpar'), ...base }).strict(),
    z.object({ kind: z.literal('zerar_recargas'), ...base }).strict(),
    z.object({ kind: z.literal('levantar'), pctVida: z.number().positive(), ...base }).strict(),
    z.object({ kind: z.literal('segurar_vida'), vidaMin: z.number().int().positive(), duracaoMs: z.number().int().positive(), ...base }).strict(),
    /** regra especial implementada em código, com nome estável (ex.: 'experimento_culatra'). */
    z.object({ kind: z.literal('gancho'), gancho: Id, params: z.record(z.string(), z.unknown()).optional(), ...base }).strict(),
  ]),
);

export const Ability = z
  .object({
    id: Id,
    name: z.string().min(1),
    /** classe, arquétipo, inimigo ou item dono da habilidade */
    ownerKey: Id,
    slot: AbilitySlot,
    type: AbilityType,
    /** alcance em tiles (1 = corpo a corpo, 4 = médio, 7 = longo) */
    range: z.number().nonnegative(),
    /**
     * true: o alcance real é balance.alcanceTiles[Alcance de quem usa] (tabela de arquétipo, pré-ala ou
     * Delta); `range` fica como o valor padrão, igual ao do pré-ala da classe. Ex.: o básico do Atirador
     * vai a 4 tiles na Babushka e a 7 no Arqueiro das Estepes.
     */
    rangeDoAlcance: z.boolean().optional(),
    /** raio da área em tiles; áreas >= 2 */
    radius: z.number().nonnegative().default(0),
    /** abertura do cone em graus */
    angleDeg: z.number().positive().max(360).optional(),
    cooldownS: z.number().nonnegative(),
    cost: z.number().nonnegative().default(0),
    /** carga curta antes de sair (máx. 500 ms); nunca segurar o dedo */
    castMs: z.number().int().min(0).max(500).default(0),
    /** aviso no chão antes de cair (inimigos: >= 800 nos ataques grandes) */
    telegraphMs: z.number().int().nonnegative().default(0),
    effects: z.array(Effect).min(1),
    description: z.string().min(1),
    /** como aparece em cada margem: Encanto x máquina */
    visual: z.object({ esquerda: z.string(), direita: z.string() }).partial().optional(),
    /** nome que aparece em cada margem quando o nome é duplo (ex.: "Totem ou Robô") */
    nomePorMargem: z.object({ esquerda: z.string().min(1), direita: z.string().min(1) }).strict().optional(),
    /**
     * Especial e virada: segundos de luta para encher no perfil de referência (dano batendo sem parar);
     * 45 a 90. Entra no sistema de pontos de balance.especial assim: carga necessária =
     * cargaMax × cargaS ÷ cargaReferenciaS, e teto e piso por segundo são multiplicados pelo mesmo
     * fator, para o tempo real continuar entre 45 e 90 s em qualquer perfil.
     */
    cargaS: z.number().min(45).max(90).optional(),
    ...Sugestao,
  })
  .strict()
  .superRefine((a, ctx) => {
    if (a.cargaS !== undefined && a.slot !== 'especial' && a.slot !== 'virada') {
      ctx.addIssue({ code: 'custom', message: `${a.id}: cargaS só vale para especial e virada` });
    }
    if ((a.type === 'area_alvo' || a.type === 'campo' || a.type === 'em_volta') && a.radius < 2) {
      ctx.addIssue({ code: 'custom', message: `${a.id}: área com raio < 2 tiles` });
    }
    if (a.slot !== 'inimigo' && a.slot !== 'basico' && a.slot !== 'item' && a.slot !== 'especial' && a.slot !== 'virada') {
      if (a.cooldownS < 6 || a.cooldownS > 20) ctx.addIssue({ code: 'custom', message: `${a.id}: recarga fora de 6 a 20 s` });
    }
    const jogador = PLAYER_ABILITY_SLOTS.includes(a.slot);
    for (const e of flattenEffects(a.effects)) {
      if (e.radius !== undefined && e.radius < 2) {
        ctx.addIssue({ code: 'custom', message: `${a.id}: efeito ${e.kind} com raio ${e.radius} < 2 tiles` });
      }
      if (jogador && e.kind === 'controle') {
        const L = LIMITES_CONTROLE;
        const max = e.quebraAoApanhar ? L.quebravelMaxMs : e.cc === 'provocar' ? L.provocarMaxMs : L.maxMs;
        if (e.duracaoMs < L.minMs || e.duracaoMs > max) {
          ctx.addIssue({ code: 'custom', message: `${a.id}: controle ${e.cc} de ${e.duracaoMs} ms fora de ${L.minMs} a ${max}` });
        }
      }
    }
  });
export type Ability = z.infer<typeof Ability>;

/** Invocações: totens, robôs, barricadas, cópias, lhama, crocodilo-espírito, esquadrão. */
export const Summon = z
  .object({
    id: Id,
    name: z.string(),
    /** vida em % da vida máxima do dono */
    hpPct: z.number().positive(),
    /** ataque em fração do ataque do dono (0 = não ataca) */
    attackMult: z.number().nonnegative(),
    /**
     * ataca_mais_perto: fica parado e ataca o inimigo mais perto a cada tickMs.
     * provoca: aplica os efeitos (provocar) nos inimigos do raio a cada tickMs.
     * cura_menos_vida: aplica os efeitos (cura no aliado mais ferido etc.) a cada tickMs.
     * muralha: bloqueia passagem e projéteis; efeitos opcionais a cada tickMs.
     * aura: efeitos a cada tickMs em volta.
     * distrai: inimigos no raio atacam a invocação em vez do dono (não é controle, sem imunidade).
     * luta_ao_lado: segue o dono e ataca o alvo dele.
     * absorve: não ataca; recebe a parte do dano do dono que o passivo mandar (ex.: Assessoria de Crise).
     */
    behavior: z.enum(['ataca_mais_perto', 'provoca', 'cura_menos_vida', 'muralha', 'aura', 'distrai', 'luta_ao_lado', 'absorve']),
    range: z.number().nonnegative(),
    radius: z.number().nonnegative().default(0),
    /** efeitos aplicados a cada tickMs (auras, cura, cuspida) */
    tickMs: z.number().int().positive().optional(),
    effects: z.array(Effect).default([]),
    destructible: z.boolean().default(true),
    rebuildMs: z.number().int().positive().optional(),
    visual: z.object({ esquerda: z.string(), direita: z.string() }).partial().optional(),
    /** nome em cada margem (ex.: totem na Esquerda, robô na Direita) */
    nomePorMargem: z.object({ esquerda: z.string().min(1), direita: z.string().min(1) }).strict().optional(),
    /** duração padrão quando a invocação nasce sem um efeito 'invocar' (cópia do Sumiço, passivos) */
    duracaoMs: z.number().int().positive().optional(),
    description: z.string().min(1).optional(),
    ...Sugestao,
  })
  .strict()
  .superRefine((s, ctx) => {
    for (const e of flattenEffects(s.effects)) {
      if (e.radius !== undefined && e.radius < 2) {
        ctx.addIssue({ code: 'custom', message: `${s.id}: efeito ${e.kind} com raio ${e.radius} < 2 tiles` });
      }
      if (e.radius === undefined && e.target !== undefined && AREA_TARGETS.includes(e.target) && s.radius < 2) {
        ctx.addIssue({ code: 'custom', message: `${s.id}: efeito de área ${e.kind} com raio da invocação ${s.radius} < 2 tiles` });
      }
    }
  });
export type Summon = z.infer<typeof Summon>;

/** Lista de habilidades com ids únicos. */
const abilityList = (slots: AbilitySlot[], nome: string) =>
  z.array(Ability).superRefine((list, ctx) => {
    const seen = new Set<string>();
    for (const a of list) {
      if (seen.has(a.id)) ctx.addIssue({ code: 'custom', message: `${nome}: id repetido ${a.id}` });
      seen.add(a.id);
      if (!slots.includes(a.slot)) ctx.addIssue({ code: 'custom', message: `${nome}: ${a.id} com slot ${a.slot} fora de ${slots.join(', ')}` });
      if ((a.slot === 'especial' || a.slot === 'virada') && a.cargaS === undefined) {
        ctx.addIssue({ code: 'custom', message: `${nome}: ${a.id} precisa de cargaS` });
      }
    }
  });

/** data/abilities_class.json: as 16 habilidades comuns das classes. */
export const AbilitiesClassFile = abilityList(['classe'], 'abilities_class');
/** data/abilities_archetype.json: as 48 habilidades marca. */
export const AbilitiesArchetypeFile = abilityList(['marca_1', 'marca_2'], 'abilities_archetype');
/** data/abilities_special.json: os 4 Especiais de classe e as 24 viradas. */
export const AbilitiesSpecialFile = abilityList(['especial', 'virada'], 'abilities_special');
/** data/abilities_basic.json: os 4 ataques básicos. */
export const AbilitiesBasicFile = abilityList(['basico'], 'abilities_basic');
/** Qualquer lista de habilidades (inimigos, itens etc.). */
export const AbilitiesFile = z.array(Ability);
export type AbilitiesFile = z.infer<typeof AbilitiesFile>;

/** data/summons.json */
export const SummonsFile = z.array(Summon).superRefine((list, ctx) => {
  const seen = new Set<string>();
  for (const s of list) {
    if (seen.has(s.id)) ctx.addIssue({ code: 'custom', message: `summons: id repetido ${s.id}` });
    seen.add(s.id);
  }
});
export type SummonsFile = z.infer<typeof SummonsFile>;

/**
 * Passivos: talentos, bônus de guia, únicos, sets e afixos de elite.
 * Sempre recarga, aura, gatilho ou número.
 */
export const Trigger = z.enum([
  'ao_acertar',
  'ao_critar',
  'ao_derrotar',
  'ao_apanhar',
  'pouca_vida', // ao cair abaixo de limiarPct
  'ao_cair', // ao ser derrubado
  'intervalo', // a cada intervaloS
  'ao_usar_habilidade',
  'ao_aplicar_controle',
  'ao_curar',
  'fora_de_combate',
  'sem_tomar_dano', // a cada segundo sem tomar dano
  'sem_gastar_recurso',
  'primeiro_golpe', // primeiro golpe em cada inimigo
  'aliado_atacado', // inimigo atacou aliado nos últimos N s
  'aliado_vai_cair',
  'ao_usar_especial',
]);
export type Trigger = z.infer<typeof Trigger>;

export const StatMod = z.object({ stat: StatKey, pct: z.number() }).strict();
export type StatMod = z.infer<typeof StatMod>;

export const Condition = z
  .object({
    /** só vale com vida abaixo/acima de X% (0-100) */
    vidaAbaixoPct: z.number().optional(),
    vidaAcimaPct: z.number().optional(),
    alvoVidaAbaixoPct: z.number().optional(),
    alvoVidaAcimaPct: z.number().optional(),
    alvoMarcado: z.boolean().optional(),
    inimigosPertoMin: z.number().int().optional(),
    aliadosPertoMin: z.number().int().optional(),
    regiao: z.enum(['natureza', 'cidade', 'mata', 'agua', 'lama', 'energia', 'apagao', 'poluicao_zero']).optional(),
    grupoMisto: z.boolean().optional(),
    contraElitesEChefes: z.boolean().optional(),
    alvoMarcadoPorTalento: z.boolean().optional(),
  })
  .strict();
export type Condition = z.infer<typeof Condition>;

export const Passive = z
  .object({
    kind: z.enum(['numero', 'aura', 'gatilho', 'recarga', 'regra']),
    trigger: Trigger.optional(),
    intervaloS: z.number().positive().optional(),
    limiarPct: z.number().optional(),
    recargaS: z.number().positive().optional(),
    /** raio da aura ou do efeito em tiles */
    raio: z.number().positive().optional(),
    acumula: z.object({ max: z.number().int().positive(), duracaoMs: z.number().int().positive().optional() }).strict().optional(),
    condicao: Condition.optional(),
    /** números fixos (kind 'numero' ou 'aura') */
    stats: z.array(StatMod).optional(),
    /** efeitos disparados (gatilho, recarga, intervalo) */
    efeitos: z.array(Effect).optional(),
    /** regra especial implementada em código */
    gancho: Id.optional(),
    params: z.record(z.string(), z.unknown()).optional(),
    /** vale também fora da luta (ex.: Olho na Janela, Nota Oficial) */
    valeNoMapa: z.boolean().optional(),
  })
  .strict();
export type Passive = z.infer<typeof Passive>;
