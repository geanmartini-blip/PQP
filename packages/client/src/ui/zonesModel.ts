/**
 * Partes puras do HUD em zonas (testáveis sem DOM): quanto tempo cada mensagem fica na faixa do
 * topo e qual missão o rastreador compacto mostra.
 */
import { getData } from '@pqp/shared';
import type { S2C_MissaoEstado } from '@pqp/shared/net';
import type { Toast } from '../game/gameState';

// SUGESTÃO: cada aviso fica 2,5 s (1,2 s se houver fila); aviso com mais de 8 s na fila é jogado
// fora; o banner de nível fica 2,5 s na mesma faixa.
export const TOAST_MS = 2500;
export const TOAST_QUEUED_MS = 1200;
export const TOAST_STALE_MS = 8000;
export const LEVEL_BANNER_MS = 2500;
/** Uma mensagem por vez na faixa (a fila espera). */
export const MAX_TOASTS_ON_SCREEN = 1;

/** Tempo na tela de um aviso: a fala do guia e o texto comprido ficam mais (dá para ler). */
export function toastDuration(t: Pick<Toast, 'texto' | 'tipo'>, queued: boolean): number {
  const len = t.texto.length;
  if (t.tipo === 'guia') return Math.max(2500, Math.min(6000, 1800 + 45 * len));
  const base = t.tipo === 'erro' ? 3000 : Math.min(4000, TOAST_MS + Math.max(0, len - 30) * 25);
  return queued ? Math.min(base, TOAST_QUEUED_MS) : base;
}

export type TrackedMission = { a: S2C_MissaoEstado['ativas'][number]; first: boolean };

/**
 * A missão do rastreador: a primeira ativa; depois do Delta (no barco da travessia e na margem), as
 * do Delta que ficaram para trás (atalho de teste, travessia antes de fechar a cadeia) não aparecem.
 */
export function trackedMission(ms: S2C_MissaoEstado | null, stage: string | undefined): TrackedMission | null {
  if (!ms) return null;
  const D = getData();
  for (const [i, a] of ms.ativas.entries()) {
    const m = D.missionsById.get(a.id);
    // as do Delta de 1 a 7 (a da travessia, do nível 8, também é do Delta e continua valendo)
    if (stage !== undefined && stage !== 'delta' && m?.regiao === 'delta' && m.nivel < 8) continue;
    return { a, first: i === 0 };
  }
  return null;
}
