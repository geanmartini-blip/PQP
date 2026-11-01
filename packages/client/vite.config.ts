import { defineConfig } from 'vite';

// Cliente Phaser: dev em 0.0.0.0:5173 (abre no celular pela rede local); build em dist com caminhos
// relativos (o servidor de jogo serve a pasta dist na porta 2567). O @pqp/shared vem do workspace
// (exports do package.json apontam para o TS de src), sem alias.
//
// Pedaços do build: o Phaser num pedaço próprio (muda pouco: fica no cache do navegador entre
// versões do jogo), o zod e os dados em outro, o resto do jogo, e a galeria e o servidor local
// (?offline=1) em pedaços que só baixam quando pedidos (import dinâmico).
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
});
