/**
 * Fila do cartão de habilidade de primeira vez (puro, testável). Quando uma habilidade aparece num
 * botão pela primeira vez neste aparelho (Delta, aula do barco no 8, ala no 12, troca do botão 3,
 * troca de ala do protótipo), entra na fila; o cartão mostra uma por vez, por CARD_MS ou até o
 * jogador usar aquele botão. O que já foi mostrado fica guardado e não volta (a lista no Perfil é o
 * lugar de rever).
 */
import type { StorageLike } from '../game/GameClient';
import { safeGet, safeSet } from '../game/GameClient';

export type CardSlot = 'b1' | 'b2' | 'b3' | 'especial';
export const CARD_SLOTS: readonly CardSlot[] = ['b1', 'b2', 'b3', 'especial'];

export const ABILITY_SEEN_KEY = 'pqp_habs_vistas';
// SUGESTÃO: cada cartão fica 4 s (ou até usar o botão); no máximo 200 ids guardados.
export const CARD_MS = 4000;
const MAX_SEEN = 200;

export interface IntroCard {
  slot: CardSlot;
  id: string;
  until: number;
}

export class AbilityIntroQueue {
  private readonly seen = new Set<string>();
  private readonly queue: { slot: CardSlot; id: string }[] = [];
  cur: IntroCard | null = null;
  private pausedAt: number | null = null;

  constructor(private readonly storage?: StorageLike) {
    const raw = safeGet(storage, ABILITY_SEEN_KEY);
    if (raw) for (const id of raw.split(',')) if (id) this.seen.add(id);
  }

  /** Já mostrou o cartão desta habilidade. */
  wasSeen(id: string): boolean {
    return this.seen.has(id);
  }

  /**
   * A cada quadro: `slots` diz qual habilidade está em cada botão agora; `free` diz se a tela está
   * livre (sem diálogo nem tela aberta). Devolve o cartão a mostrar (ou null).
   */
  update(now: number, slots: Partial<Record<CardSlot, string | undefined>>, free: boolean): IntroCard | null {
    for (const s of CARD_SLOTS) {
      const id = slots[s];
      if (!id || this.seen.has(id) || this.cur?.id === id || this.queue.some((q) => q.id === id)) continue;
      this.queue.push({ slot: s, id });
    }
    // a habilidade saiu do botão (troca de ala, botão 3): o cartão dela some
    for (let i = this.queue.length - 1; i >= 0; i--) if (slots[this.queue[i]!.slot] !== this.queue[i]!.id) this.queue.splice(i, 1);
    if (this.cur && slots[this.cur.slot] !== this.cur.id) this.cur = null;
    if (!free) {
      // tela ocupada: o tempo do cartão para
      if (this.pausedAt === null) this.pausedAt = now;
      return null;
    }
    if (this.pausedAt !== null) {
      if (this.cur) this.cur.until += now - this.pausedAt;
      this.pausedAt = null;
    }
    if (this.cur && now >= this.cur.until) this.cur = null;
    if (!this.cur) {
      const next = this.queue.shift();
      if (next) {
        this.cur = { ...next, until: now + CARD_MS };
        this.markSeen(next.id);
      }
    }
    return this.cur;
  }

  /** O jogador usou o botão: o cartão dele some. */
  used(slot: CardSlot): void {
    if (this.cur?.slot === slot) this.cur = null;
  }

  private markSeen(id: string): void {
    this.seen.add(id);
    const list = [...this.seen];
    safeSet(this.storage, ABILITY_SEEN_KEY, list.slice(-MAX_SEEN).join(','));
  }
}
