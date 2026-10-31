/**
 * Leitura das habilidades para a IA dos inimigos e para a Doutrina: para que serve cada uma
 * (dano, controle, cura, escudo, reforço, invocação, avanço, recuo...) e se está pronta agora.
 * Puro e com cache por id: nada aqui muda o mundo.
 */
import { getData } from '../data';
import type { Ability, Effect, TargetSelector } from '../schema/ability';
import { isBigEnemyAttack } from '../schema/enemy';
import { bal } from './constants';
import { canAct, isUp, statPts } from './entity';
import type { Entity, World } from './types';

/** Para que serve uma habilidade. */
export interface AbilityProfile {
  id: string;
  type: Ability['type'];
  /** dano, controle, lentidão, empurrão, puxão ou marca em inimigos */
  harmful: boolean;
  /** soma de mult × golpes (+ dano contínuo), para escolher o golpe mais forte */
  damage: number;
  /** controle que trava (não conta provocar) */
  control: boolean;
  /** provocar */
  taunt: boolean;
  /** cura aliados (ou a si) */
  heal: boolean;
  /** escudo ou redução de dano em aliados (não só em si) */
  shieldAllies: boolean;
  /** escudo, redução, devolução, imunidade ou segurar vida em si */
  selfDefense: boolean;
  /** reforço ou transformação */
  buff: boolean;
  summon: boolean;
  /** avanço ou salto até o alvo */
  dash: boolean;
  /** recuo para longe */
  retreat: boolean;
  /** invisível em si (fuga) */
  stealth: boolean;
  pull: boolean;
  push: boolean;
  marks: boolean;
  /** devolve recurso */
  resource: boolean;
  /** limpa estados ruins */
  cleanse: boolean;
  /** tem aviso no chão */
  telegraph: boolean;
  /** ataque grande de inimigo (precisa de aviso >= 800 ms) */
  big: boolean;
}

const HARM = new Set(['dano', 'dano_continuo', 'controle', 'lentidao', 'empurrar', 'puxar', 'marca', 'derrubar_moeda', 'explode_ao_morrer']);
const ALLY_SEL = new Set<TargetSelector>(['aliados_area', 'aliados_area_sem_self', 'grupo', 'aliado_menos_vida', 'aliado_mais_perto']);
const FOE_SEL = new Set<TargetSelector>(['alvo', 'inimigos_area', 'inimigo_mais_perto', 'inimigos_a_vista', 'inimigos_caminho']);

type Aim = 'inimigo' | 'aliado' | 'self';

/** Para quem vai o efeito (mesma regra do seletor padrão do executor). */
function aimOf(a: Ability, ef: Effect): Aim {
  const sel = ef.target;
  if (sel === 'self') return 'self';
  if (sel && ALLY_SEL.has(sel)) return 'aliado';
  if (sel === 'alvo') return a.type === 'aliado' ? 'aliado' : 'inimigo';
  if (sel && FOE_SEL.has(sel)) return 'inimigo';
  if (HARM.has(ef.kind)) return 'inimigo';
  if (a.type === 'aliado') return 'aliado';
  return 'self';
}

const cache = new Map<string, AbilityProfile>();

/** Perfil de uma habilidade (cacheado). Undefined se o id não existe. */
export function profileOf(id: string): AbilityProfile | undefined {
  const hit = cache.get(id);
  if (hit) return hit;
  const a = getData().abilities.get(id);
  if (!a) return undefined;
  const p: AbilityProfile = {
    id: a.id,
    type: a.type,
    harmful: false,
    damage: 0,
    control: false,
    taunt: false,
    heal: false,
    shieldAllies: false,
    selfDefense: false,
    buff: false,
    summon: false,
    dash: false,
    retreat: false,
    stealth: false,
    pull: false,
    push: false,
    marks: false,
    resource: false,
    cleanse: false,
    telegraph: a.telegraphMs > 0,
    big: a.slot === 'inimigo' && isBigEnemyAttack(a),
  };
  const walk = (effects: readonly Effect[], ticks: number) => {
    for (const ef of effects) {
      const aim = aimOf(a, ef);
      switch (ef.kind) {
        case 'campo':
          walk(ef.efeitos, Math.max(1, Math.floor(ef.duracaoMs / ef.tickMs)));
          break;
        case 'dano':
          p.harmful = true;
          p.damage += ef.mult * (ef.hits ?? 1) * ticks;
          break;
        case 'dano_continuo':
          p.harmful = true;
          p.damage += ef.multPorTick * Math.max(1, Math.floor(ef.duracaoMs / ef.tickMs)) * ticks;
          break;
        case 'controle':
          if (aim !== 'inimigo') break;
          p.harmful = true;
          if (ef.cc === 'provocar') p.taunt = true;
          else p.control = true;
          break;
        case 'lentidao':
        case 'derrubar_moeda':
        case 'explode_ao_morrer':
          if (aim === 'inimigo') p.harmful = true;
          break;
        case 'empurrar':
          p.harmful = true;
          p.push = true;
          break;
        case 'puxar':
          p.harmful = true;
          p.pull = true;
          break;
        case 'marca':
          p.harmful = true;
          p.marks = true;
          break;
        case 'cura':
        case 'cura_continua':
        case 'levantar':
          if (aim !== 'inimigo') p.heal = true;
          break;
        case 'escudo':
        case 'reducao_dano':
        case 'devolver_dano':
        case 'imune':
        case 'segurar_vida':
          if (aim === 'aliado') p.shieldAllies = true;
          else if (aim === 'self') p.selfDefense = true;
          break;
        case 'reforco':
        case 'transformar':
          p.buff = true;
          break;
        case 'invocar':
          p.summon = true;
          break;
        case 'avanco':
          p.dash = true;
          break;
        case 'recuo':
          p.retreat = true;
          break;
        case 'invisivel':
          if (aim === 'self') p.stealth = true;
          break;
        case 'recurso':
          p.resource = true;
          break;
        case 'limpar':
          p.cleanse = true;
          break;
        default:
          break;
      }
    }
  };
  walk(a.effects, 1);
  cache.set(id, p);
  return p;
}

/** Habilidade pelo id (ou undefined). */
export const abilityOf = (id: string | undefined): Ability | undefined => (id ? getData().abilities.get(id) : undefined);

/** Custo com o modificador resourceCost (mesma conta do executor). */
const costOf = (e: Entity, a: Ability) => a.cost * Math.max(0, 1 + statPts(e, 'resourceCost') / 100);

/**
 * A habilidade sairia agora se o alvo estivesse no alcance? (recarga, recarga global, custo,
 * carga do Especial, controle e consumível). Espelha as recusas de castAbility sem lançar nada.
 */
export function abilityReady(w: World, e: Entity, id: string | undefined): boolean {
  const a = abilityOf(id);
  if (!a || !isUp(e) || !canAct(e) || e.casting) return false;
  if ((a.slot === 'especial' || a.slot === 'virada') && e.special < 1) return false;
  if (a.slot !== 'basico' && a.slot !== 'item' && w.tick < e.gcdUntil) return false;
  if ((e.cooldowns[a.id] ?? 0) > w.tick) return false;
  if (costOf(e, a) > e.resource + 1e-9) return false;
  if (a.slot === 'item' && e.loadout?.item) {
    const c = getData().consumablesById.get(e.loadout.item);
    if (c?.habilidade === a.id && (e.loadout.itemCount ?? 0) <= 0) return false;
  }
  return true;
}

/** Raio real de uma área (com o modificador areaSize). */
export const areaRadius = (e: Entity, a: Ability) => a.radius * Math.max(0.25, 1 + statPts(e, 'areaSize') / 100);

/** Recarga global em ticks (para quem precisa prever a próxima janela). */
export const gcdTicks = () => Math.round(bal().combate.recargaGlobalMs / 50);
