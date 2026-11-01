/**
 * Modelo puro das telas da Fase 5 (testável sem DOM): rótulos das cartas da Doutrina, edição das
 * cartas, rótulos de slot, raridade e atributo, e os "pertos" (entrada da masmorra, quadro do
 * plantão no QG).
 */
import { getData } from '@pqp/shared';
import { DOCTRINE_ACTIONS, DOCTRINE_CONDITIONS, DOCTRINE_LIMITS } from '@pqp/shared/game/duty';
import type { TileMap } from '@pqp/shared/map';
import type { DoctrineCard } from '@pqp/shared/sim';

export type CondId = (typeof DOCTRINE_CONDITIONS)[number];
export type ActionId = (typeof DOCTRINE_ACTIONS)[number];

// SUGESTÃO: textos curtos das cartas da Doutrina
export const COND_LABEL: Record<CondId, string> = {
  sempre: 'Sempre',
  minha_vida_abaixo: 'Minha vida abaixo de',
  aliado_vida_abaixo: 'Aliado com vida abaixo de',
  alvo_e_chefe: 'Alvo é chefe',
  alvo_e_elite_ou_chefe: 'Alvo é elite ou chefe',
  inimigos_perto_min: 'Inimigos perto, pelo menos',
  especial_pronto: 'Especial pronto',
  aliado_caido_perto: 'Aliado caído perto',
};

export const ACTION_LABEL: Record<ActionId, string> = {
  usar_botao: 'Usar o botão',
  usar_especial: 'Usar o Especial',
  usar_item: 'Usar o item',
  fugir: 'Recuar',
  curar_aliado: 'Curar aliado',
  levantar_aliado: 'Levantar aliado',
  focar_mais_fraco: 'Focar o mais fraco',
  focar_mais_perto: 'Focar o mais perto',
  seguir_grupo: 'Seguir o grupo',
};

export const SLOT_LABEL: Record<string, string> = {
  cabeca: 'Cabeça',
  peito: 'Peito',
  calca: 'Calça',
  arma: 'Arma',
  calcado: 'Calçado',
  adorno: 'Adorno',
};

export const RARITY_LABEL: Record<string, string> = { comum: 'Comum', raro: 'Raro', unico: 'Único', set: 'Set' };

/** Cor da raridade (items.json raridades[].cor). */
export function rarityCss(r: string | undefined): string {
  return getData().items.raridades.find((x) => x.id === r)?.cor ?? '#c9c9c9';
}

// SUGESTÃO: nomes curtos dos atributos dos itens na tela
export const STAT_LABEL: Record<string, string> = {
  hp: 'Vida',
  damage: 'Dano',
  defense: 'Defesa',
  accuracy: 'Precisão',
  evasion: 'Esquiva',
  ccResist: 'Resist. a controle',
  resourceMax: 'Recurso',
  attackSpeed: 'Vel. de ataque',
  cooldownSpeed: 'Recarga',
  moveSpeed: 'Movimento',
  healing: 'Cura',
  healingTaken: 'Cura recebida',
  crit: 'Crítico',
};

/** Nome legível de um atributo ('vida_max' -> 'Vida max'). */
export function statLabel(id: string): string {
  if (STAT_LABEL[id]) return STAT_LABEL[id];
  const s = id.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function statsText(list: readonly { stat: string; pct: number }[]): string {
  return list.map((s) => `${s.pct >= 0 ? '+' : ''}${Math.round(s.pct * 10) / 10}% ${statLabel(s.stat)}`).join(', ');
}

/** Carta nova padrão (SUGESTÃO: "Sempre: focar o mais perto"). */
export function newCard(): DoctrineCard {
  return { se: { t: 'sempre' }, faca: { t: 'focar_mais_perto' } };
}

/** Condição com os números padrão (o meio da faixa). */
export function condOf(t: CondId): DoctrineCard['se'] {
  if (t === 'minha_vida_abaixo' || t === 'aliado_vida_abaixo') return { t, pct: 40 };
  if (t === 'inimigos_perto_min') return { t, n: 3, raio: 4 };
  return { t } as DoctrineCard['se'];
}

export function actionOf(t: ActionId, botao: 1 | 2 | 3 = 1): DoctrineCard['faca'] {
  if (t === 'usar_botao') return { t, botao };
  return { t } as DoctrineCard['faca'];
}

const next = <T>(list: readonly T[], cur: T, d = 1): T => list[(list.indexOf(cur) + d + list.length) % list.length]!;

/** Troca a condição pela próxima (ou anterior). */
export function cycleCond(c: DoctrineCard, d = 1): DoctrineCard {
  return { ...c, se: condOf(next(DOCTRINE_CONDITIONS, c.se.t as CondId, d)) };
}

export function cycleAction(c: DoctrineCard, d = 1): DoctrineCard {
  return { ...c, faca: actionOf(next(DOCTRINE_ACTIONS, c.faca.t as ActionId, d)) };
}

/** Ajusta o número da condição (pct em passos de 5; n em 1; raio em 1) dentro das faixas. */
export function bumpCond(c: DoctrineCard, campo: 'pct' | 'n' | 'raio', d: number): DoctrineCard {
  const L = DOCTRINE_LIMITS;
  const se = { ...c.se } as Record<string, unknown>;
  const v = Number(se[campo] ?? 0);
  if (campo === 'pct') se['pct'] = Math.max(L.pctMin, Math.min(L.pctMax, v + d * 5));
  if (campo === 'n') se['n'] = Math.max(L.nMin, Math.min(L.nMax, v + d));
  if (campo === 'raio') se['raio'] = Math.max(L.raioMin, Math.min(L.raioMax, v + d));
  return { ...c, se: se as DoctrineCard['se'] };
}

export function cycleButton(c: DoctrineCard): DoctrineCard {
  if (c.faca.t !== 'usar_botao') return c;
  const b = c.faca.botao;
  return { ...c, faca: { t: 'usar_botao', botao: b === 3 ? 1 : ((b + 1) as 2 | 3) } };
}

/** Frase da carta: "Se minha vida abaixo de 40%: recuar". */
export function cardText(c: DoctrineCard): string {
  const se = c.se as Record<string, unknown> & { t: CondId };
  let cond = COND_LABEL[se.t] ?? se.t;
  if (se.t === 'minha_vida_abaixo' || se.t === 'aliado_vida_abaixo') cond += ` ${String(se['pct'])}%`;
  if (se.t === 'inimigos_perto_min') cond += ` ${String(se['n'])} a ${String(se['raio'])} tiles`;
  let act = ACTION_LABEL[c.faca.t as ActionId] ?? c.faca.t;
  if (c.faca.t === 'usar_botao') act += ` ${c.faca.botao}`;
  return `Se ${cond.charAt(0).toLowerCase()}${cond.slice(1)}: ${act.charAt(0).toLowerCase()}${act.slice(1)}`;
}

/** Move a carta i para i+d (a ordem é a prioridade). */
export function moveCard(list: readonly DoctrineCard[], i: number, d: number): DoctrineCard[] {
  const out = [...list];
  const j = i + d;
  if (j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

// SUGESTÃO: os botões de perto aparecem a 2,5 tiles da entrada das Galerias e a 3 tiles do QG.
export const DUNGEON_NEAR_TILES = 2.5;
export const QG_NEAR_TILES = 3;

export type Fase5Spot = { kind: 'masmorra'; dungeonId: string } | { kind: 'plantao'; qg: string };

/** Entrada da masmorra e QG perto do jogador. */
export function fase5Spots(map: TileMap | null, x: number, y: number, side: string | null): Fase5Spot[] {
  if (!map) return [];
  const out: Fase5Spot[] = [];
  for (const m of map.markers) {
    const d = Math.hypot(m.x - x, m.y - y);
    if (m.kind === 'masmorra' && d <= DUNGEON_NEAR_TILES) out.push({ kind: 'masmorra', dungeonId: m.ref ?? 'galerias_da_usina' });
    const qg = (m.params as Record<string, unknown> | undefined)?.['qg'];
    if (m.kind === 'lugar' && typeof qg === 'string' && d <= QG_NEAR_TILES) {
      const q = getData().institutions.qgs.find((g) => g.id === qg);
      if (q && (!side || q.margem === side) && !out.some((s) => s.kind === 'plantao')) out.push({ kind: 'plantao', qg });
    }
  }
  return out;
}

export function spotText(s: Fase5Spot): string {
  // SUGESTÃO: textos dos botões de perto
  return s.kind === 'masmorra' ? 'Entrar nas Galerias' : 'Quadro do plantão';
}
