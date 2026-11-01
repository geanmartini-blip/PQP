/**
 * Chão do PixelLab (v0.3): tilesets Wang de cantos, um por par de terrenos (plChao.json, gerado por
 * tools/art/pl-chao.mjs; folhas em public/pl/chao/). Desenha em grade dupla: cada tile do PixelLab fica
 * centrado num vértice da grade do mapa, e os 4 cantos dele são os 4 tiles do mapa em volta do vértice.
 * Assim a transição sai da própria grade, sem pintar terreno por vértice.
 *
 * Só nos mapas de PL_CHAO_MAPS (os que já têm a arte gerada). Paredes, cercas, portas e o que não
 * tem terreno do PixelLab continuam com o desenho do terreno procedural por cima.
 */
import * as Phaser from 'phaser';
import { Tile, type TileMap } from '@pqp/shared/map';
import man from './plChao.json';

export const PL_CHAO_MAPS: ReadonlySet<string> = new Set(['delta', 'barco_travessia']);

/** terrenos do PixelLab, do mais baixo ao mais alto (a ordem decide quem é "upper" num vértice) */
const ORDEM = ['funda', 'rasa', 'lama', 'areia', 'grama', 'terra', 'madeira'] as const;
type Terreno = (typeof ORDEM)[number];
const NIVEL: Record<string, number> = Object.fromEntries(ORDEM.map((t, i) => [t, i]));

/** Tile do mapa → terreno do chão; undefined = fica com o desenho procedural. */
const CHAO_DE: Partial<Record<number, Terreno>> = {
  [Tile.AguaFunda]: 'funda',
  [Tile.AguaRasa]: 'rasa',
  [Tile.Lama]: 'lama',
  [Tile.Areia]: 'areia',
  [Tile.Grama]: 'grama',
  [Tile.Mato]: 'grama',
  [Tile.Arvore]: 'grama',
  [Tile.Pedra]: 'grama',
  [Tile.Terra]: 'terra',
  [Tile.Madeira]: 'madeira',
  [Tile.Cerca]: 'madeira',
  [Tile.Porta]: 'madeira',
};
/** tiles com chão do PixelLab embaixo, mas o desenho procedural (objeto) por cima */
const POR_CIMA: ReadonlySet<number> = new Set([Tile.Cerca, Tile.Porta, Tile.Pedra]);

interface Par {
  lower: Terreno;
  upper: Terreno;
  key: string;
  /** cantos (NW 8, NE 4, SW 2, SE 1) → posição na folha */
  porCantos: Map<number, { x: number; y: number }>;
}

const T = man.size;
const pares = new Map<string, Par>();
for (const p of man.pares) {
  const porCantos = new Map<number, { x: number; y: number }>();
  for (const t of p.tiles) if (!porCantos.has(t.c)) porCantos.set(t.c, { x: t.x, y: t.y });
  pares.set(`${p.lower}|${p.upper}`, { lower: p.lower as Terreno, upper: p.upper as Terreno, key: `plchao_${p.lower}_${p.upper}`, porCantos });
}

/** árvores do PixelLab (64x96, base do tronco perto do pé, como TREE_BASE_Y), em public/pl/arvores/ */
const ARVORES = 2;
export const PL_ARVORES_KEY = 'pl_arvores';

/** Põe as folhas de chão e as árvores na fila de carga (chamar no preload). */
export function preloadPlChao(scene: Phaser.Scene): void {
  const base = import.meta.env.BASE_URL;
  for (const p of man.pares) scene.load.image(`plchao_${p.lower}_${p.upper}`, `${base}pl/chao/${p.img}`);
  for (let i = 0; i < ARVORES; i++) scene.load.image(`pl_arvore_${i}`, `${base}pl/arvores/arvore_${i}.png`);
}

/** Textura com as árvores do PixelLab lado a lado (quadros a0, a1...), para o Blitter da mata. */
export function plArvores(scene: Phaser.Scene): string | undefined {
  if (scene.textures.exists(PL_ARVORES_KEY)) return PL_ARVORES_KEY;
  if (!scene.textures.exists('pl_arvore_0')) return undefined;
  const imgs = Array.from({ length: ARVORES }, (_, i) => scene.textures.get(`pl_arvore_${i}`).getSourceImage() as HTMLImageElement);
  const w = Math.max(...imgs.map((i) => i.width));
  const h = Math.max(...imgs.map((i) => i.height));
  const tex = scene.textures.createCanvas(PL_ARVORES_KEY, w * ARVORES, h)!;
  imgs.forEach((im, i) => {
    tex.getContext().drawImage(im, i * w + (w - im.width) / 2, h - im.height);
    tex.add(`a${i}`, 0, i * w, 0, w, h);
  });
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return PL_ARVORES_KEY;
}

/** Quadro da árvore do PixelLab num tile (estável pela posição). */
export const plArvoreFrame = (x: number, y: number) => `a${(((x * 92837111) ^ (y * 689287499)) >>> 0) % ARVORES}`;

export function usaPlChao(scene: Phaser.Scene, map: TileMap): boolean {
  if (!PL_CHAO_MAPS.has(map.id) || pares.size === 0) return false;
  for (const p of pares.values()) if (!scene.textures.exists(p.key)) return false;
  return true;
}

/** Um par que tenha este terreno, e os cantos de um tile cheio dele. */
function cheio(t: Terreno): { par: Par; c: number } | undefined {
  for (const p of pares.values()) {
    if (p.upper === t) return { par: p, c: 15 };
    if (p.lower === t) return { par: p, c: 0 };
  }
  return undefined;
}

/** Tile do PixelLab para os 4 terrenos em volta de um vértice (NW, NE, SW, SE). */
export function escolheTile(cantos: readonly Terreno[]): { key: string; x: number; y: number; cheio: boolean } | undefined {
  let alto = cantos[0]!;
  for (const c of cantos) if (NIVEL[c]! > NIVEL[alto]!) alto = c;
  const baixos = [...new Set(cantos.filter((c) => c !== alto))].sort((a, b) => NIVEL[b]! - NIVEL[a]!);
  if (baixos.length === 0) {
    const f = cheio(alto);
    const pos = f?.par.porCantos.get(f.c);
    return f && pos ? { key: f.par.key, ...pos, cheio: true } : undefined;
  }
  for (const baixo of baixos) {
    const par = pares.get(`${baixo}|${alto}`);
    if (!par) continue;
    const bits = cantos.map((c) => (c === alto ? 1 : 0));
    const pos = par.porCantos.get(bits[0]! * 8 + bits[1]! * 4 + bits[2]! * 2 + bits[3]!);
    if (pos) return { key: par.key, ...pos, cheio: false };
  }
  // sem par com o mais alto: o vértice fica com o terreno de maior nível que tenha par com alguém
  const f = cheio(alto);
  const pos = f?.par.porCantos.get(f.c);
  return f && pos ? { key: f.par.key, ...pos, cheio: true } : undefined;
}

/**
 * Desenha o chão do PixelLab no bloco (tx0, ty0, tw, th) por cima do canvas do terreno procedural,
 * deixando as células sem terreno do PixelLab (e os objetos de POR_CIMA) como estavam.
 */
export function desenhaPlChao(scene: Phaser.Scene, ctx: CanvasRenderingContext2D, map: TileMap, tx0: number, ty0: number, tw: number, th: number): void {
  const W = map.width;
  const H = map.height;
  const proc = document.createElement('canvas');
  proc.width = tw * T;
  proc.height = th * T;
  const pctx = proc.getContext('2d')!;
  pctx.drawImage(ctx.canvas, 0, 0);
  const tile = (x: number, y: number) => map.tiles[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))]!;
  const chao = (x: number, y: number) => CHAO_DE[tile(x, y)];
  ctx.imageSmoothingEnabled = false;
  for (let vy = ty0; vy <= ty0 + th; vy++)
    for (let vx = tx0; vx <= tx0 + tw; vx++) {
      const cantos = [chao(vx - 1, vy - 1), chao(vx, vy - 1), chao(vx - 1, vy), chao(vx, vy)];
      if (cantos.some((c) => c === undefined)) continue;
      const esc = escolheTile(cantos as Terreno[]);
      if (!esc) continue;
      const img = scene.textures.get(esc.key).getSourceImage() as HTMLImageElement;
      const dx = (vx - tx0) * T - T / 2;
      const dy = (vy - ty0) * T - T / 2;
      // tile cheio: espelha pela posição para a repetição não aparecer
      const h = ((vx * 73856093) ^ (vy * 19349663)) >>> 0;
      if (esc.cheio && h & 3) {
        ctx.save();
        ctx.translate(dx + (h & 1 ? T : 0), dy + (h & 2 ? T : 0));
        ctx.scale(h & 1 ? -1 : 1, h & 2 ? -1 : 1);
        ctx.drawImage(img, esc.x, esc.y, T, T, 0, 0, T, T);
        ctx.restore();
      } else ctx.drawImage(img, esc.x, esc.y, T, T, dx, dy, T, T);
    }
  // objetos e células sem chão do PixelLab: volta o desenho procedural da célula
  for (let y = ty0; y < ty0 + th; y++)
    for (let x = tx0; x < tx0 + tw; x++) {
      const t = tile(x, y);
      if (CHAO_DE[t] !== undefined && !POR_CIMA.has(t)) continue;
      const sx = (x - tx0) * T;
      const sy = (y - ty0) * T;
      ctx.clearRect(sx, sy, T, T);
      ctx.drawImage(proc, sx, sy, T, T, sx, sy, T, T);
    }
}
