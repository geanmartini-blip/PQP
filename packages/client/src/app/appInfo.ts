/**
 * Versão do app, novidades da versão e o texto do "Mandar opinião" (puro, testável).
 *
 * As constantes __PQP_* vêm do build (vite.config.ts, plugin do PWA): a versão do package.json do
 * cliente, se é o build "app" (offline por padrão, com service worker) e o NOVIDADES.md da raiz.
 * Fora do Vite (Vitest, Node) elas não existem: o typeof cai no padrão.
 */
import type { StorageLike } from '../game/GameClient';

declare const __PQP_VERSION__: string;
declare const __PQP_APP__: boolean;
declare const __PQP_NOVIDADES__: string;

/** Versão completa (package.json do cliente), ex.: '0.1.0'. */
export const APP_VERSION: string = typeof __PQP_VERSION__ !== 'undefined' ? __PQP_VERSION__ : '0.0.0';
/** Build "app" (npm run build:app): offline por padrão, manifest e service worker. */
export const APP_BUILD: boolean = typeof __PQP_APP__ !== 'undefined' ? __PQP_APP__ : false;
/** O NOVIDADES.md da raiz, lido no build. */
export const NOVIDADES_MD: string = typeof __PQP_NOVIDADES__ !== 'undefined' ? __PQP_NOVIDADES__ : '';

/** '0.1.0' → '0.1'; '1.2.3' → '1.2'. */
export function shortVersion(v: string): string {
  const m = /^(\d+)\.(\d+)/.exec(v.trim());
  return m ? `${m[1]}.${m[2]}` : v.trim();
}

/** Rótulo que aparece no jogo: 'v0.1'. */
export const versionLabel = (v = APP_VERSION): string => `v${shortVersion(v)}`;

export interface VersionNews {
  /** 'v0.1' */
  titulo: string;
  itens: string[];
}

/**
 * Seção `## v0.1` do NOVIDADES.md (itens em `- `). Sem a seção da versão, undefined: não há o que
 * mostrar.
 */
export function parseNovidades(md: string, version: string): VersionNews | undefined {
  const want = shortVersion(version);
  const lines = md.split(/\r?\n/);
  let inSec = false;
  const itens: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    const h = /^##\s+v?(\d+\.\d+)(?:\.\d+)?\b/i.exec(line);
    if (h) {
      if (inSec) break;
      inSec = h[1] === want;
      continue;
    }
    if (/^#\s/.test(line) && inSec) break;
    if (!inSec) continue;
    const it = /^[-*]\s+(.*)$/.exec(line);
    if (it && it[1]!.trim()) itens.push(it[1]!.trim());
  }
  if (itens.length === 0) return undefined;
  return { titulo: `v${want}`, itens };
}

/** Chave da última versão cujas novidades o jogador já viu. */
export const NEWS_SEEN_KEY = 'pqp_novidades_vistas';

/** Mostra as novidades: há o que mostrar e o jogador ainda não viu as desta versão. */
export function shouldShowNews(storage: StorageLike | undefined, version: string, news: VersionNews | undefined): boolean {
  if (!news) return false;
  let seen: string | null = null;
  try {
    seen = storage?.getItem(NEWS_SEEN_KEY) ?? null;
  } catch {
    seen = null;
  }
  return seen !== shortVersion(version);
}

export function markNewsSeen(storage: StorageLike | undefined, version: string): void {
  try {
    storage?.setItem(NEWS_SEEN_KEY, shortVersion(version));
  } catch {
    // cheio ou bloqueado: aparece de novo na próxima, sem problema
  }
}

// ---------------------------------------------------------------------------
// Mandar opinião

/** Nome do mapa para gente (os ids de shared/map). */
export function mapLabel(mapId: string | undefined | null): string {
  if (!mapId) return 'carregando';
  if (mapId.startsWith('barco:') || mapId === 'barco_travessia') return 'Barco do Seu Jacó';
  if (mapId.startsWith('masmorra')) return 'Galerias da Usina';
  const names: Record<string, string> = {
    delta: 'Delta',
    prototipo_delta: 'Delta (protótipo)',
    margem_esquerda: 'Margem Esquerda',
    qg_esquerda: 'Margem Esquerda',
    margem_direita: 'Margem Direita',
    qg_direita: 'Margem Direita',
    usina_da_ponte: 'Usina da Ponte',
    juncal: 'Juncal',
    planalto_do_trigo: 'Planalto do Trigo',
    vale_das_chamines: 'Vale das Chaminés',
    ilha_do_farol: 'Ilha do Farol',
  };
  if (names[mapId]) return names[mapId];
  if (mapId.startsWith('casa')) return 'Casa';
  return mapId;
}

/** Aparelho em poucas palavras, a partir do user agent (nada além do que o navegador já diz). */
export function shortUserAgent(ua: string): string {
  const s = ua || '';
  let device = 'PC';
  let os = '';
  const ios = /\b(iPhone|iPad|iPod)\b.*?OS (\d+)[_.](\d+)/.exec(s);
  const android = /Android\s+([\d.]+)/.exec(s);
  if (ios) {
    device = ios[1]!;
    os = `iOS ${ios[2]}.${ios[3]}`;
  } else if (/Macintosh/.test(s) && /Mobile/.test(s)) {
    device = 'iPad';
    os = 'iPadOS';
  } else if (android) {
    device = /Mobile/.test(s) ? 'Android' : 'Tablet Android';
    os = `Android ${android[1]!.split('.')[0]}`;
  } else if (/Windows/.test(s)) os = 'Windows';
  else if (/Mac OS X/.test(s)) os = 'macOS';
  else if (/Linux/.test(s)) os = 'Linux';
  let browser = '';
  const b =
    /EdgA?\/(\d+)/.exec(s) ??
    /SamsungBrowser\/(\d+)/.exec(s) ??
    /OPR\/(\d+)/.exec(s) ??
    /CriOS\/(\d+)/.exec(s) ??
    /FxiOS\/(\d+)/.exec(s) ??
    /Firefox\/(\d+)/.exec(s) ??
    /Chrome\/(\d+)/.exec(s) ??
    (/Safari\//.test(s) ? /Version\/(\d+)/.exec(s) : null);
  if (b) {
    const tag = b[0].split('/')[0]!;
    const name: Record<string, string> = { Edg: 'Edge', EdgA: 'Edge', SamsungBrowser: 'Samsung', OPR: 'Opera', CriOS: 'Chrome', FxiOS: 'Firefox', Firefox: 'Firefox', Chrome: 'Chrome', Version: 'Safari' };
    browser = `${name[tag] ?? tag} ${b[1]}`;
  }
  // no Android o sistema já diz o aparelho ("Android 14"); no iPhone, "iPhone, iOS 17.4"
  const parts = device === 'PC' ? [os || 'PC', browser] : device === 'Android' ? [os, browser] : [device, os, browser];
  return parts.filter(Boolean).join(', ');
}

export interface FeedbackInfo {
  version: string;
  level?: number | undefined;
  mapId?: string | null | undefined;
  side?: string | null | undefined;
  userAgent: string;
  /** aberto pelo ícone (tela de início) */
  standalone?: boolean;
}

/**
 * Texto pronto do "Mandar opinião". Só nível, mapa, margem e aparelho: nada de nome, token ou outro
 * dado pessoal.
 */
export function feedbackText(i: FeedbackInfo): string {
  const nivel = i.level !== undefined && Number.isFinite(i.level) ? `nível ${i.level}` : 'nível ?';
  const margem = i.side === 'esquerda' ? 'Margem Esquerda' : i.side === 'direita' ? 'Margem Direita' : 'sem margem';
  const ap = shortUserAgent(i.userAgent) + (i.standalone ? ', pelo ícone' : '');
  return `Ponte que Partiu ${versionLabel(i.version)} — ${nivel}, mapa ${mapLabel(i.mapId)}, margem ${margem}, aparelho ${ap} — O que achei: `;
}
