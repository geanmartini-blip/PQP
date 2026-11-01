/**
 * Plugin do Vite para o app instalável (PWA), sem pacote extra.
 *
 * Em todo build: ícone da aba e do iPhone no index.html.
 * No build "app" (vite build --mode app):
 * - <link rel="manifest"> no index.html (o manifest.webmanifest fica em public/, com caminhos
 *   relativos, então vale sob / e sob /PQP/);
 * - depois de escrever o dist, gera o sw.js com a lista de TODOS os arquivos do build (pré-cache) e
 *   o nome do cache com a versão e um hash do conteúdo: build novo = sw.js novo = atualização.
 *
 * O service worker (texto em swSource) é escrito à mão: cache primeiro, rede se faltar; a navegação
 * cai no index.html do cache (abre sem internet depois da 1ª vez). A versão nova espera o jogador
 * tocar em "Versão nova: toque para atualizar" (mensagem 'pular_espera').
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { HtmlTagDescriptor, Plugin, ResolvedConfig } from 'vite';

export interface PwaOptions {
  /** build "app": manifest e service worker */
  app: boolean;
  /** versão do package.json do cliente */
  version: string;
}

/** '/PQP' → '/PQP/'; 'PQP' → '/PQP/'; './' e URLs ficam como estão. */
export function normalizeBase(b: string): string {
  const s = b.trim();
  if (s === '' || s === '/') return '/';
  if (s.startsWith('.') || /^https?:\/\//i.test(s)) return s.endsWith('/') ? s : `${s}/`;
  return `/${s.replace(/^\/+/, '').replace(/\/+$/, '')}/`;
}

/** Todos os arquivos de `dir`, com caminho relativo e barra normal, em ordem. */
export function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p).split('\\').join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/** Nome do cache: versão + hash do conteúdo dos arquivos (muda a cada build diferente). */
export function cacheName(version: string, dir: string, files: string[]): string {
  const h = createHash('sha256');
  for (const f of files) {
    h.update(f);
    h.update(readFileSync(join(dir, f)));
  }
  return `pqp-${version}-${h.digest('hex').slice(0, 10)}`;
}

/** Texto do sw.js. `files` são caminhos relativos ao sw.js (que fica na raiz do build). */
export function swSource(cache: string, files: string[]): string {
  return `/* Ponte que Partiu: service worker gerado no build (packages/client/vite.pwa.ts). Não edite. */
'use strict';
const CACHE = ${JSON.stringify(cache)};
const ARQUIVOS = ${JSON.stringify(files, null, 1)};
const ESCOPO = new URL(self.registration.scope);
const INDEX = new URL('index.html', ESCOPO).href;

// instala: baixa tudo (sem o cache HTTP, para não guardar arquivo velho do servidor)
self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ARQUIVOS.map((u) => new Request(new URL(u, ESCOPO).href, { cache: 'reload' })))),
  );
});

// a versão nova espera o jogador tocar em "Versão nova: toque para atualizar"
self.addEventListener('message', (ev) => {
  if (ev.data && ev.data.tipo === 'pular_espera') self.skipWaiting();
});

// ativa: apaga os caches das versões antigas do jogo
self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('pqp-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== ESCOPO.origin || !url.pathname.startsWith(ESCOPO.pathname)) return;
  if (req.mode === 'navigate') {
    // abrir o jogo: o index.html do cache (com ou sem ?parâmetros), senão a rede
    ev.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(INDEX).then(
          (hit) =>
            hit ||
            fetch(req).catch(
              () => new Response('<meta charset="utf-8"><p style="font:18px sans-serif;padding:24px">Sem internet e sem o jogo guardado. Abra uma vez com internet.</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
            ),
        ),
      ),
    );
    return;
  }
  ev.respondWith(
    caches.open(CACHE).then((c) =>
      c.match(req, { ignoreSearch: true }).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            // fora da lista (não devia acontecer): guarda para a próxima vez
            if (res.ok && res.type === 'basic') c.put(req, res.clone());
            return res;
          }),
      ),
    ),
  );
});
`;
}

export function pqpPwa(opts: PwaOptions): Plugin {
  let cfg: ResolvedConfig | undefined;
  return {
    name: 'pqp-pwa',
    configResolved(c) {
      cfg = c;
    },
    transformIndexHtml() {
      const base = cfg?.base ?? '/';
      const tags: HtmlTagDescriptor[] = [
        { tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '32x32', href: `${base}icons/favicon-32.png` }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', sizes: '180x180', href: `${base}icons/apple-touch-icon-180.png` }, injectTo: 'head' },
      ];
      if (opts.app) tags.push({ tag: 'link', attrs: { rel: 'manifest', href: `${base}manifest.webmanifest` }, injectTo: 'head' });
      return tags;
    },
    closeBundle: {
      order: 'post',
      sequential: true,
      handler() {
        if (!opts.app || !cfg || cfg.command !== 'build') return;
        const out = resolve(cfg.root, cfg.build.outDir);
        const files = listFiles(out).filter((f) => f !== 'sw.js');
        const cache = cacheName(opts.version, out, files);
        writeFileSync(join(out, 'sw.js'), swSource(cache, files));
        cfg.logger.info(`\n[pqp-pwa] sw.js: ${files.length} arquivos no pré-cache (${cache})`);
      },
    },
  };
}
