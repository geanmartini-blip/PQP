/**
 * O que o app instalável (PWA) põe na página, fora do Phaser e do #pqp-ui:
 * - a tela curta "Novidades da v0.1", uma vez por versão;
 * - o service worker (só no build "app"), com a faixa "Versão nova: toque para atualizar";
 * - o pedido de armazenamento persistente (o save não some quando o aparelho aperta o espaço);
 * - o "Mandar opinião": compartilhar, ou copiar e avisar.
 *
 * Tudo com try/catch: aba privada, iOS antigo ou navegador sem a API não quebram o jogo.
 */
import { allowLeave } from '../ui/exitGuard';
import { markNewsSeen, shouldShowNews, versionLabel, type VersionNews } from './appInfo';
import type { StorageLike } from '../game/GameClient';

const CSS = `
#pqp-app-novidades { position: fixed; inset: 0; z-index: 8; display: flex; align-items: center; justify-content: center; background: #0d0b10e8;
  padding: calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 16px);
  font-family: 'Trebuchet MS', Verdana, sans-serif; color: #fff6e0; touch-action: none; animation: pqpAppEntra 0.2s ease-out; }
#pqp-app-novidades .caixa { width: min(100%, 380px); max-height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding: 16px;
  background: #2a1e30; border: 3px solid #140c16; box-shadow: inset 0 0 0 3px #6a4a70, inset 0 0 0 6px #140c16, 0 4px 0 #0008; }
#pqp-app-novidades h1 { margin: 0; font-size: 20px; color: #ffd060; text-align: center; letter-spacing: 1px; text-shadow: 2px 2px 0 #140c16; }
#pqp-app-novidades ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
#pqp-app-novidades li { font-size: 15px; line-height: 1.3; padding-left: 18px; position: relative; }
#pqp-app-novidades li:before { content: ''; position: absolute; left: 2px; top: 6px; width: 8px; height: 8px; background: #ffd060; box-shadow: 2px 2px 0 #140c16; }
#pqp-app-novidades .ok, #pqp-app-faixa { min-height: 48px; padding: 8px 14px; border: 3px solid #140c16; background: #ffe8a0; color: #140c16; cursor: pointer;
  font: bold 16px 'Trebuchet MS', Verdana, sans-serif; box-shadow: inset -3px -3px 0 #c8a050, inset 3px 3px 0 #fff8d0, 0 3px 0 #0009; touch-action: manipulation; }
#pqp-app-novidades .ok:active, #pqp-app-faixa:active { transform: translateY(2px); }
#pqp-app-faixa { position: fixed; z-index: 9; left: 50%; transform: translateX(-50%); top: calc(env(safe-area-inset-top, 0px) + 8px);
  width: max-content; max-width: calc(100vw - 24px); background: #7ad070; box-shadow: inset -3px -3px 0 #3a8a3a, inset 3px 3px 0 #c8f8b8, 0 3px 0 #0009;
  animation: pqpAppEntra 0.2s ease-out; }
#pqp-app-faixa:active { transform: translate(-50%, 2px); }
@keyframes pqpAppEntra { from { opacity: 0; } to { opacity: 1; } }
`;

let styled = false;
function style(): void {
  if (styled) return;
  styled = true;
  try {
    const st = document.createElement('style');
    st.id = 'pqp-app-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  } catch {
    // sem DOM
  }
}

// ---------------------------------------------------------------------------
// Novidades

/** Mostra "Novidades da vX.Y" se o jogador ainda não viu as desta versão. Devolve se mostrou. */
export function showNewsOnce(storage: StorageLike | undefined, version: string, news: VersionNews | undefined): boolean {
  if (!shouldShowNews(storage, version, news) || !news) return false;
  try {
    style();
    const fundo = document.createElement('div');
    fundo.id = 'pqp-app-novidades';
    fundo.setAttribute('role', 'dialog');
    fundo.setAttribute('aria-modal', 'true');
    const caixa = document.createElement('div');
    // 'rola': o index.html deixa o dedo rolar a lista em tela baixa
    caixa.className = 'caixa rola';
    const h = document.createElement('h1');
    h.textContent = `Novidades da ${news.titulo}`;
    caixa.appendChild(h);
    const ul = document.createElement('ul');
    for (const it of news.itens) {
      const li = document.createElement('li');
      li.textContent = it;
      ul.appendChild(li);
    }
    caixa.appendChild(ul);
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'ok';
    // SUGESTÃO: texto do botão
    ok.textContent = 'Bora!';
    ok.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      markNewsSeen(storage, version);
      fundo.remove();
    });
    caixa.appendChild(ok);
    fundo.appendChild(caixa);
    // toque fora da caixa não chega no jogo por baixo
    fundo.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    document.body.appendChild(fundo);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Service worker e atualização

/** Faixa "Versão nova: toque para atualizar"; o toque pede ao SW novo para assumir e recarrega. */
function showUpdateBar(waiting: ServiceWorker): void {
  try {
    style();
    if (document.getElementById('pqp-app-faixa')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'pqp-app-faixa';
    b.textContent = 'Versão nova: toque para atualizar';
    b.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      b.disabled = true;
      b.textContent = 'Atualizando...';
      try {
        waiting.postMessage({ tipo: 'pular_espera' });
      } catch {
        location.reload();
      }
      // se o controllerchange não vier (SW já ativo em outra aba), recarrega assim mesmo
      setTimeout(() => {
        allowLeave();
        location.reload();
      }, 3000);
    });
    document.body.appendChild(b);
  } catch {
    // sem DOM
  }
}

/**
 * Registra o sw.js (gerado no build "app", com o pré-cache de todos os arquivos). Uma versão nova
 * fica esperando até o jogador tocar na faixa; aí ela assume e a página recarrega.
 */
export function registerServiceWorker(baseUrl: string): void {
  try {
    const sw = navigator.serviceWorker;
    if (!sw || !window.isSecureContext) return;
    let reloading = false;
    // na 1ª instalação o SW assume a página (clients.claim) sem ser atualização: não recarrega
    const hadController = !!sw.controller;
    sw.addEventListener('controllerchange', () => {
      if (reloading || !hadController) return;
      reloading = true;
      allowLeave();
      location.reload();
    });
    const watch = (reg: ServiceWorkerRegistration) => {
      // já tinha uma versão nova esperando (baixou na abertura anterior)
      if (reg.waiting && sw.controller) showUpdateBar(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          // instalada com outra versão no controle: é atualização (na 1ª instalação não há controller)
          if (nw.state === 'installed' && sw.controller) showUpdateBar(nw);
        });
      });
      // voltou ao app depois de um tempo: procura versão nova
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void reg.update().catch(() => {});
      });
    };
    const go = () => {
      sw.register(`${baseUrl}sw.js`, { scope: baseUrl }).then(watch, () => {});
    };
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
  } catch {
    // sem service worker: o jogo funciona, só não abre sem internet
  }
}

/** Pede armazenamento persistente (o save e o cache não somem quando falta espaço). */
export function requestPersistentStorage(): void {
  try {
    const st = navigator.storage;
    if (!st || typeof st.persist !== 'function') return;
    void st
      .persisted()
      .then((ja) => (ja ? true : st.persist()))
      .catch(() => {});
  } catch {
    // nada
  }
}

// ---------------------------------------------------------------------------
// Mandar opinião

/**
 * Abre o compartilhar do aparelho com o texto pronto; sem ele (ou se falhar), copia para a área de
 * transferência. `notify` avisa o jogador do que aconteceu.
 */
export async function shareFeedback(text: string, notify: (msg: string, erro?: boolean) => void): Promise<void> {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void>; canShare?: (d: ShareData) => boolean };
  const data: ShareData = { title: `Ponte que Partiu ${versionLabel()}`, text };
  if (typeof nav.share === 'function' && (typeof nav.canShare !== 'function' || nav.canShare(data))) {
    try {
      await nav.share(data);
      return;
    } catch (e) {
      // o jogador fechou o compartilhar: não faz nada
      if (e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError') return;
      // outro erro: cai na cópia
    }
  }
  if (await copyText(text)) notify('Texto copiado! Cole no grupo e conte o que achou.');
  // SUGESTÃO: aviso quando nem copiar deu
  else notify('Não deu para copiar. Mande um print para o grupo!', true);
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // sem permissão: tenta o jeito antigo
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Aberto pelo ícone da tela de início (standalone). */
export function isStandalone(): boolean {
  try {
    if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
    return globalThis.matchMedia?.('(display-mode: standalone)').matches === true;
  } catch {
    return false;
  }
}
