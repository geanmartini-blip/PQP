/**
 * Ganchos embutidos do protótipo (Peão Brabo, Idol, a classe deles e os inimigos do protótipo).
 * Os outros ganchos dos dados (proteger_aliado, dano_por_aliado_caido, critico_no_marcado,
 * juntar_invocacoes, apagao_seletivo...) usam o padrão, que não faz nada, até alguém registrar.
 * A regra passiva 'imune_empurrao' (afixo Blindado) é lida direto em combat.canBeDisplaced.
 */
import { applyStatus } from './combat';
import { registerHook } from './hooks';
import { emit } from './world';

/**
 * Desconstruído (virada do Peão Brabo): por duracaoMs, cada golpe que ele segura cura o aliado
 * mais ferido em curaPctVidaMaxPorGolpe da vida dele (combat.dealDamage), e o bordão muda.
 */
registerHook('desconstruido', ({ w, caster, ability, params }) => {
  const dur = Number(params['duracaoMs'] ?? 10000);
  applyStatus(w, caster, caster, {
    kind: 'desconstruido',
    durationMs: dur,
    value: 1,
    ...(ability ? { abilityId: ability.id } : {}),
    data: { curaPctVidaMaxPorGolpe: Number(params['curaPctVidaMaxPorGolpe'] ?? 5) },
  });
  const bordao = params['bordao'];
  if (typeof bordao === 'string') emit(w, { t: 'say', src: caster.id, text: bordao });
});

/**
 * Turnê Mundial (virada do Idol): show de duracaoMs em que o Fanchant (params.habilidade) dá o
 * reforço ao grupo inteiro e zera as recargas do grupo. Com zerarRecargaDoFanchant, o Fanchant
 * fica pronto na hora. A troca do alvo do reforço e o zerar ficam em abilities.resolveAbility.
 */
registerHook('turne_mundial', ({ w, caster, ability, params }) => {
  const hab = String(params['habilidade'] ?? 'fanchant');
  applyStatus(w, caster, caster, {
    kind: 'turne_mundial',
    durationMs: Number(params['duracaoMs'] ?? 10000),
    value: 1,
    ...(ability ? { abilityId: ability.id } : {}),
    data: { habilidade: hab, reforcoPegaGrupo: params['reforcoPegaGrupo'] !== false, zerarRecargas: true },
  });
  if (params['zerarRecargaDoFanchant'] === true) delete caster.cooldowns[hab];
});
