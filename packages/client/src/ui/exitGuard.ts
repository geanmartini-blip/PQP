/**
 * Trava de saída sem querer (Android: o gesto de voltar pela borda da tela fecha a página).
 *
 * Ao entrar no mundo, empurra uma entrada no histórico. O primeiro "voltar" é engolido (empurra de
 * novo) e mostra o aviso; um segundo "voltar" em até EXIT_CONFIRM_MS sai de verdade. Enquanto
 * conectado, o navegador também pergunta antes de fechar ou recarregar (beforeunload).
 *
 * A lógica é pura (testável com um histórico de mentira); `installExitGuard` liga no navegador.
 */

// SUGESTÃO: segundo "voltar" em até 3 s sai do jogo.
export const EXIT_CONFIRM_MS = 3000;
// SUGESTÃO: texto do aviso.
export const EXIT_TEXT = 'Sair do jogo? Volte de novo para sair';

export interface HistoryLike {
  pushState(data: unknown, unused: string): void;
  back(): void;
}

export class ExitGuard {
  private armed = false;
  private warnedAt = -Infinity;

  constructor(
    private readonly history: HistoryLike,
    private readonly warn: (text: string) => void,
  ) {}

  /** Entrou no mundo: põe a entrada de guarda no histórico (uma vez). */
  arm(): void {
    if (this.armed) return;
    this.armed = true;
    try {
      this.history.pushState({ jogo: 1 }, '');
    } catch {
      // sem histórico (iframe, navegador antigo)
    }
  }

  /** O navegador voltou (popstate). Devolve true se deixou sair. */
  onPop(now: number): boolean {
    if (!this.armed) return true;
    if (now - this.warnedAt <= EXIT_CONFIRM_MS) {
      this.armed = false;
      try {
        this.history.back();
      } catch {
        // nada
      }
      return true;
    }
    this.warnedAt = now;
    try {
      this.history.pushState({ jogo: 1 }, '');
    } catch {
      // nada
    }
    this.warn(EXIT_TEXT);
    return false;
  }
}

let leaving = false;

/** A própria página vai recarregar (versão nova do app): o beforeunload não pergunta. */
export function allowLeave(): void {
  leaving = true;
}

/** Liga a trava no navegador; `connected` diz se vale perguntar antes de fechar. */
export function installExitGuard(warn: (text: string) => void, connected: () => boolean): ExitGuard | undefined {
  try {
    const g = new ExitGuard(window.history, warn);
    window.addEventListener('popstate', () => g.onPop(performance.now()));
    window.addEventListener('beforeunload', (ev) => {
      if (leaving || !connected()) return;
      ev.preventDefault();
      // navegadores antigos pedem o returnValue
      (ev as BeforeUnloadEvent).returnValue = '';
    });
    return g;
  } catch {
    return undefined;
  }
}
