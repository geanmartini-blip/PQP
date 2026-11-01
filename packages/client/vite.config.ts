import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
// com a extensão: o carregador nativo de config do Vite pede
import { normalizeBase, pqpPwa } from './vite.pwa.ts';

// Cliente Phaser: dev em 0.0.0.0:5173 (abre no celular pela rede local); build em dist com caminhos
// relativos (o servidor de jogo serve a pasta dist na porta 2567). O @pqp/shared vem do workspace
// (exports do package.json apontam para o TS de src), sem alias.
//
// Build "app" (npm run build:app = vite build --mode app): o app instalável do GitHub Pages. Offline e
// solo por padrão (__PQP_APP__), manifest e service worker com pré-cache (vite.pwa.ts). A base vem de
// VITE_BASE (padrão '/'; no Pages, '/PQP/'). O build normal continua com base './'.
//
// Constantes do build: __PQP_VERSION__ (package.json do cliente), __PQP_APP__ e __PQP_NOVIDADES__ (o
// NOVIDADES.md da raiz, mostrado uma vez por versão). Ver src/app/appInfo.ts.
//
// Pedaços do build: o Phaser num pedaço próprio (muda pouco: fica no cache do navegador entre
// versões do jogo), o zod e os dados em outro, o resto do jogo, e a galeria e o servidor local
// (?offline=1) em pedaços que só baixam quando pedidos (import dinâmico).
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

function readNovidades(): string {
  try {
    return readFileSync(new URL('../../NOVIDADES.md', import.meta.url), 'utf8');
  } catch {
    return '';
  }
}

export default defineConfig(({ mode }) => {
  const app = mode === 'app';
  const envBase = process.env['VITE_BASE'];
  const base = envBase && envBase.trim() !== '' ? normalizeBase(envBase) : app ? '/' : './';
  return {
    base,
    define: {
      __PQP_VERSION__: JSON.stringify(pkg.version),
      __PQP_APP__: JSON.stringify(app),
      __PQP_NOVIDADES__: JSON.stringify(readNovidades()),
    },
    plugins: [pqpPwa({ app, version: pkg.version })],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      target: 'es2020',
      assetsInlineLimit: 0,
      // o pedaço do Phaser sozinho tem ~1,2 MB (~330 kB com gzip)
      chunkSizeWarningLimit: 1600,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'phaser', test: /node_modules[\\/]phaser[\\/]/, priority: 20 },
              { name: 'colyseus', test: /node_modules[\\/](@colyseus|colyseus)/, priority: 15 },
              { name: 'dados', test: /node_modules[\\/]zod[\\/]|shared[\\/]data[\\/].*\.json$|shared[\\/]src[\\/](schema|data)[\\/]/, priority: 10 },
            ],
          },
        },
      },
    },
  };
});
