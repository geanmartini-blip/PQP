/**
 * Dicas do primeiro minuto (puro, testável). Cada dica some de vez quando o jogador faz a coisa, e
 * isso fica guardado no aparelho. No máximo duas na tela, na ordem em que fazem sentido.
 */
import type { StorageLike } from '../game/GameClient';
import { safeGet, safeSet } from '../game/GameClient';

export type TipId = 'andar' | 'rumo' | 'mira' | 'alvo' | 'estilo';

// SUGESTÃO: textos das dicas (os docs só pedem que os controles se entendam em 1 minuto, sem texto longo).
export const TIP_TEXT: Record<TipId, string> = {
  andar: 'Arraste aqui para andar',
  rumo: 'Inimigos para lá. Toque na seta para ir',
  mira: 'Seus golpes miram sozinhos',
  alvo: 'Toque no inimigo para trocar o alvo',
  estilo: 'Fale com Wesley ou Li Wei para trocar de estilo',
};

export const TIPS_KEY = 'pqp_dicas';
// SUGESTÃO: "seus golpes miram sozinhos" sai sozinha depois de 10 s na tela; "trocar de estilo" aparece 6 s depois de andar.
export const AIM_TIP_MS = 10000;
export const STYLE_TIP_DELAY_MS = 6000;
export const MAX_TIPS_ON_SCREEN = 2;

export interface TipContext {
  now: number;
  hasTarget: boolean;
  enemiesVisible: number;
  /** há bando fora da tela para a seta apontar (dica "inimigos para lá") */
  enemyFar?: boolean;
}

export class Tips {
  readonly done = new Set<TipId>();
  private shownAt = new Map<TipId, number>();
  private walkedAt: number | undefined;

  constructor(private readonly storage?: StorageLike) {
    const raw = safeGet(storage, TIPS_KEY);
    if (raw) for (const id of raw.split(',')) if (id in TIP_TEXT) this.done.add(id as TipId);
  }

  /** O jogador fez a coisa: a dica some e não volta. */
  mark(id: TipId, now = 0): void {
    if (id === 'andar' && this.walkedAt === undefined) this.walkedAt = now;
    if (this.done.has(id)) return;
    this.done.add(id);
    safeSet(this.storage, TIPS_KEY, [...this.done].join(','));
  }

  /** A seta até o primeiro bando ainda vale (até o primeiro alvo travado)? */
  get wantsCompass(): boolean {
    return !this.done.has('rumo');
  }

  /** Dicas a mostrar agora, na ordem. */
  active(ctx: TipContext): TipId[] {
    const out: TipId[] = [];
    const want = (id: TipId, cond: boolean) => {
      if (!cond || this.done.has(id) || out.length >= MAX_TIPS_ON_SCREEN) return;
      if (!this.shownAt.has(id)) this.shownAt.set(id, ctx.now);
      out.push(id);
    };
    // o primeiro combate encerra a seta do rumo
    if (ctx.hasTarget) this.mark('rumo', ctx.now);
    want('andar', true);
    want('rumo', ctx.enemyFar === true && ctx.enemiesVisible === 0);
    // a da mira some sozinha: é só para saber, não precisa de ação
    if (this.shownAt.has('mira') && ctx.now - this.shownAt.get('mira')! > AIM_TIP_MS) this.mark('mira', ctx.now);
    want('mira', ctx.hasTarget);
    want('alvo', ctx.enemiesVisible >= 2);
    const walkedLongAgo = this.done.has('andar') && (this.walkedAt === undefined || ctx.now - this.walkedAt > STYLE_TIP_DELAY_MS);
    // fora da briga: no meio do combate ela só atrapalha; e depois da seta do rumo
    want('estilo', walkedLongAgo && ctx.enemiesVisible === 0 && !(ctx.enemyFar === true && !this.done.has('rumo')));
    return out;
  }

  reset(): void {
    this.done.clear();
    this.shownAt.clear();
    this.walkedAt = undefined;
    safeSet(this.storage, TIPS_KEY, '');
  }
}
