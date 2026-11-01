/**
 * Validação fechada das cartas de Doutrina que chegam do cliente (comando 'doutrina') e do Store.
 *
 * A simulação confia no tipo DoctrineCard (sim/types.ts): uma carta com 'faca.t' desconhecido faz o
 * act() da Doutrina devolver undefined e o step lança em todo tick, travando o mundo para todos.
 * Aqui só passam os 8 tipos de 'se' e os 9 de 'faca', com os campos numéricos dentro da faixa. A
 * carta é reconstruída do zero (campos extras somem). Carta inválida é descartada.
 */
import type { DoctrineCard } from '@pqp/shared/sim';

type Se = DoctrineCard['se'];
type Faca = DoctrineCard['faca'];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

// SUGESTÃO: faixas aceitas nos números das cartas (vida em %, inimigos e raio em tiles).
const PCT_MIN = 1;
const PCT_MAX = 99;
const N_MAX = 20;
const RAIO_MAX = 12;

function seOf(raw: unknown): Se | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  switch (o['t']) {
    case 'sempre':
    case 'alvo_e_chefe':
    case 'alvo_e_elite_ou_chefe':
    case 'especial_pronto':
    case 'aliado_caido_perto':
      return { t: o['t'] };
    case 'minha_vida_abaixo':
    case 'aliado_vida_abaixo': {
      const pct = o['pct'];
      if (!isNum(pct) || pct < PCT_MIN || pct > PCT_MAX) return null;
      return { t: o['t'], pct };
    }
    case 'inimigos_perto_min': {
      const n = o['n'], raio = o['raio'];
      if (!isInt(n) || n < 1 || n > N_MAX || !isNum(raio) || raio <= 0 || raio > RAIO_MAX) return null;
      return { t: 'inimigos_perto_min', n, raio };
    }
    default:
      return null;
  }
}

function facaOf(raw: unknown): Faca | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  switch (o['t']) {
    case 'usar_botao': {
      const b = o['botao'];
      return b === 1 || b === 2 || b === 3 ? { t: 'usar_botao', botao: b } : null;
    }
    case 'usar_especial':
    case 'usar_item':
    case 'fugir':
    case 'curar_aliado':
    case 'levantar_aliado':
    case 'focar_mais_fraco':
    case 'focar_mais_perto':
    case 'seguir_grupo':
      return { t: o['t'] };
    default:
      return null;
  }
}

/** Uma carta válida (reconstruída) ou null. */
export function sanitizeDoctrineCard(raw: unknown): DoctrineCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const se = seOf(o['se']);
  const faca = facaOf(o['faca']);
  return se && faca ? { se, faca } : null;
}

/** Só as cartas válidas, até `max`. Qualquer coisa que não seja lista vira lista vazia. */
export function sanitizeDoctrine(raw: unknown, max = 5): DoctrineCard[] {
  if (!Array.isArray(raw)) return [];
  const out: DoctrineCard[] = [];
  for (const c of raw) {
    if (out.length >= max) break;
    const ok = sanitizeDoctrineCard(c);
    if (ok) out.push(ok);
  }
  return out;
}
