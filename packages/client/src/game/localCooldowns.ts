/**
 * Recarga prevista no cliente (pura, testável). O HUD do servidor chega um RTT depois do toque; até
 * lá o botão já aparece em recarga global, e um segundo toque não toca de novo a animação de um
 * cast que o servidor vai recusar.
 *
 * Cada toque aceito trava o botão até o HUD confirmar a recarga dele (hud.cd > 0) ou até o servidor
 * processar o comando (cack >= id) sem recarga nenhuma: aí foi recusado e a trava sai. A trava
 * nunca passa de RTT + LOCAL_LOCK_SLACK_MS. A recarga global local dura balance.recargaGlobalMs.
 */

// SUGESTÃO: folga da trava local além do RTT (o snapshot com a recarga pode atrasar um pouco).
export const LOCAL_LOCK_SLACK_MS = 200;

interface Lock {
  until: number;
  cmdId: number | undefined;
}

export interface HudCdLike {
  cd: readonly number[];
  gcd: number;
}

export class LocalCooldowns {
  private gcdUntil = 0;
  private gcdCmd: number | undefined;
  private readonly locks = new Map<number, Lock>();

  /** Toque aceito no botão `i` (0..3 do hud.cd) agora. */
  onCast(i: number, now: number, gcdMs: number, rttMs: number, cmdId?: number): void {
    this.locks.set(i, { until: now + Math.max(0, rttMs) + LOCAL_LOCK_SLACK_MS, cmdId });
    this.gcdUntil = now + gcdMs;
    this.gcdCmd = cmdId;
  }

  /** Confere com o HUD do servidor e o último comando confirmado (cack). */
  sync(hud: HudCdLike | undefined, cack: number, now: number): void {
    if (!hud) return;
    for (const [i, l] of this.locks) {
      const serverCd = (hud.cd[i] ?? 0) > 0;
      const processed = l.cmdId !== undefined && cack >= l.cmdId;
      if (serverCd || now >= l.until || (processed && hud.gcd === 0)) this.locks.delete(i);
    }
    // a global: o servidor processou o comando e não tem recarga global → recusou
    if (this.gcdUntil > now && this.gcdCmd !== undefined && cack >= this.gcdCmd) {
      if (hud.gcd === 0) this.gcdUntil = 0;
      this.gcdCmd = undefined;
    }
  }

  /** O botão `i` está travado localmente (recarga global ou toque ainda sem resposta)? */
  blocked(i: number, now: number): boolean {
    return this.gcdUntil > now || (this.locks.get(i)?.until ?? 0) > now;
  }

  /** Recarga global local restante em ticks de 50 ms (para a pizza do botão). */
  gcdTicks(now: number): number {
    return this.gcdUntil > now ? Math.ceil((this.gcdUntil - now) / 50) : 0;
  }

  clear(): void {
    this.locks.clear();
    this.gcdUntil = 0;
    this.gcdCmd = undefined;
  }
}
