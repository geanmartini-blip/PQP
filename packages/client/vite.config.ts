import { defineConfig } from 'vite';

// Cliente Phaser: dev em 0.0.0.0:5173 (abre no celular pela rede local); build em dist com caminhos
// relativos (o servidor de jogo serve a pasta dist na porta 2567). O @pqp/shared vem do workspace
// (exports do package.json apontam para o TS de src), sem alias.
export default defineConfig({
  base: './',
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
    // Phaser + dados do jogo num pacote só (~2,8 MB, ~760 kB com gzip)
    chunkSizeWarningLimit: 3500,
  },
});
