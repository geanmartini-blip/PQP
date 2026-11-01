/**
 * Entrada do cliente: Phaser em retrato, pixel art.
 * ?gallery=1 abre a galeria da arte (carregada à parte); senão Boot → Mundo + HUD.
 *
 * O canvas é criado em pixels físicos (px de CSS × devicePixelRatio, até 3, ou o ?dpr= da URL) e o
 * estilo fica no tamanho de CSS (Scale.NONE com zoom 1/dpr). Com o zoom inteiro da câmera em pixels
 * físicos, cada pixel da arte vira um bloco inteiro de pixels de tela, sem os 2 ou 3 px alternados
 * que tremiam nos Android de dpr 2,625 ou 2,75; os textos do sistema também saem nítidos.
 *
 * O fps tem teto de ~60 em telas de 120/144 Hz (medido antes de abrir o jogo, ver fpsLimitFor).
 */
import * as Phaser from 'phaser';
import { parseConfig } from './config';
import { BootScene } from './scenes/BootScene';
import { HudScene } from './scenes/HudScene';
import { WorldScene } from './scenes/WorldScene';
import { fpsLimitFor, pickDpr } from './ui/layout';

const cfg = parseConfig(location.search, location);
let dpr = pickDpr(window.devicePixelRatio, cfg.dpr);
const canvasSize = () => ({ w: Math.max(1, Math.round(window.innerWidth * dpr)), h: Math.max(1, Math.round(window.innerHeight * dpr)) });

/** Taxa da tela medida em alguns quadros de requestAnimationFrame (~100 a 200 ms). */
function measureHz(frames = 12): Promise<number> {
  return new Promise((resolve) => {
    let n = 0;
    let t0 = 0;
    const done = setTimeout(() => resolve(60), 600);
    const tick = (t: number) => {
      if (n === 0) t0 = t;
      if (++n > frames) {
        clearTimeout(done);
        resolve((frames * 1000) / Math.max(1, t - t0));
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function start(scenes: Phaser.Scene[], fpsLimit: number): Phaser.Game {
  const s = canvasSize();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'jogo',
    backgroundColor: '#0d0b10',
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    scale: {
      mode: Phaser.Scale.NONE,
      width: s.w,
      height: s.h,
      zoom: 1 / dpr,
    },
    input: { activePointers: 5, touch: { capture: true } },
    fps: { target: 60, smoothStep: true, ...(fpsLimit > 0 ? { limit: fpsLimit } : {}) },
    disableContextMenu: true,
    banner: false,
    scene: scenes,
    callbacks: {
      preBoot: (g) => {
        g.registry.set('px', dpr);
      },
      postBoot: () => {
        // o "Carregando..." do index.html sai quando o Phaser abre
        document.getElementById('carregando')?.remove();
      },
    },
  });

  // janela mudou (girar, teclado, barra do navegador, outro monitor): canvas e densidade de novo
  let timer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener('resize', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      dpr = pickDpr(window.devicePixelRatio, cfg.dpr);
      const n = canvasSize();
      game.registry.set('px', dpr);
      game.scale.setZoom(1 / dpr);
      game.scale.resize(n.w, n.h);
    }, 100);
  });

  // a aba voltou do fundo: não corre atrás do tempo perdido
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) game.loop.resetDelta();
  });
  // para depurar no console do navegador
  (window as unknown as { pqp?: unknown }).pqp = { game, cfg, dpr: () => dpr };
  return game;
}

void measureHz().then((hz) => {
  const limit = fpsLimitFor(hz);
  if (cfg.gallery) {
    // a galeria vem num pedaço separado do pacote (o jogo não paga por ela)
    void import('./art/GalleryScene').then((m) => start([new m.GalleryScene()], limit));
  } else start([new BootScene(cfg), new WorldScene(), new HudScene()], limit);
});
