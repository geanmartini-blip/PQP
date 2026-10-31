/**
 * Tileset de 32x32: um ou mais quadros por valor de Tile (map/types.ts), com variações.
 * Quadros `${tile}_${variante}`; água rasa, água funda e piso neon são animados (variante = quadro).
 * A copa da árvore tem quadros extras `copa_21_${v}` (48x40) para desenhar por cima de quem passa.
 * A decoração (TileMap.deco) tem quadros `deco_${valor}`.
 *
 * Paletas: Esquerda em verde, terra e madeira; Direita em neon sobre concreto.
 */
import { Deco, Tile } from '@pqp/shared/map';
import { C, type Color, hex, light, mix, Pix, prng, shade, withAlpha } from './pixel';
import { packFrames, type SheetData } from './sheet';

export const TILE_KEY = 'tiles';

/** Variações (ou quadros de animação) por tile. */
export const TILE_VARIANTS: Record<number, number> = {
  [Tile.Vazio]: 1,
  [Tile.Grama]: 4,
  [Tile.Terra]: 4,
  [Tile.Areia]: 4,
  [Tile.AguaRasa]: 4,
  [Tile.AguaFunda]: 4,
  [Tile.Madeira]: 3,
  [Tile.Concreto]: 4,
  [Tile.Asfalto]: 3,
  [Tile.PisoNeon]: 4,
  [Tile.Lama]: 3,
  [Tile.Mato]: 3,
  [Tile.Parede]: 3,
  [Tile.Arvore]: 3,
  [Tile.Pedra]: 2,
  [Tile.Cerca]: 2,
  [Tile.Grade]: 2,
  [Tile.Maquina]: 3,
  [Tile.Porta]: 3,
};

/** Tiles animados: a variante é o quadro da animação. */
export const ANIMATED_TILES: ReadonlySet<number> = new Set([Tile.AguaRasa, Tile.AguaFunda, Tile.PisoNeon]);
export const TILE_ANIM_MS = 260;

/**
 * SUGESTÃO: o número de variações por tile, o estilo por região e a velocidade da água não estão
 * nos docs (só as paletas por margem).
 * Variante por região para tiles que mudam de estilo: 0 Esquerda (taipa, madeira, árvore de mata),
 * 1 Direita (concreto, vidro, neon), 2 Delta e Usina (palafita, mangue).
 */
const REGION_STYLE: Record<string, 0 | 1 | 2> = {
  margem_esquerda: 0,
  juncal: 0,
  planalto_do_trigo: 0,
  serra_da_chopindita: 0,
  margem_direita: 1,
  vale_das_chamines: 1,
  mirante: 1,
  usina_da_ponte: 1,
  delta: 2,
  rio_claro: 2,
  ilha_do_farol: 2,
};
const STYLED: ReadonlySet<number> = new Set([Tile.Parede, Tile.Porta, Tile.Arvore, Tile.Cerca, Tile.Maquina]);

/**
 * Nome do quadro para um tile do mapa: escolhe a variante pela posição (estável), pela região
 * (paredes, portas, cercas, árvores, máquinas) e pelo tempo (água e piso neon).
 */
export function tileFrame(tile: number, x: number, y: number, regionId?: string, timeMs = 0): string {
  const n = TILE_VARIANTS[tile] ?? 1;
  let v: number;
  if (ANIMATED_TILES.has(tile)) v = (Math.floor(timeMs / TILE_ANIM_MS) + ((x * 3 + y * 5) & 3)) % n;
  else if (STYLED.has(tile)) v = Math.min(n - 1, REGION_STYLE[regionId ?? ''] ?? ((x * 7 + y * 13) & 0x7fffffff) % n);
  else v = (((x * 73856093) ^ (y * 19349663)) >>> 0) % n;
  return `${tile}_${v}`;
}

// ---------------------------------------------------------------------------

const S = 32;

function noise(p: Pix, rnd: () => number, cols: Color[], density: number): void {
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) if (rnd() < density) p.set(x, y, cols[Math.floor(rnd() * cols.length)]!);
}

function ground(base: Color, seed: string, opts: { dark?: Color; lite?: Color; density?: number } = {}): Pix {
  const p = new Pix(S, S);
  p.rect(0, 0, S, S, base);
  const rnd = prng(seed);
  noise(p, rnd, [opts.dark ?? shade(base, 0.85), opts.lite ?? light(base, 0.1)], opts.density ?? 0.18);
  return p;
}

function grama(v: number): Pix {
  const base = hex('#5e9a3e');
  const p = ground(base, `grama${v}`, { dark: hex('#4e8634'), lite: hex('#6eaa4a'), density: 0.22 });
  const rnd = prng(`grama-tufo${v}`);
  for (let k = 0; k < 6; k++) {
    const x = Math.floor(rnd() * 30) + 1;
    const y = Math.floor(rnd() * 29) + 2;
    p.set(x, y, hex('#3e7a2a'));
    p.set(x + 1, y - 1, hex('#7ab85a'));
    p.set(x - 1, y - 1, hex('#7ab85a'));
  }
  if (v === 2) {
    // florzinhas
    for (let k = 0; k < 3; k++) {
      const x = Math.floor(rnd() * 28) + 2;
      const y = Math.floor(rnd() * 28) + 2;
      p.set(x, y, k % 2 ? hex('#f0e060') : hex('#f4f0f0'));
    }
  }
  if (v === 3) p.ellipse(10 + rnd() * 12, 10 + rnd() * 12, 4, 2, hex('#548e38'));
  return p;
}

function terra(v: number): Pix {
  const p = ground(hex('#9a7048'), `terra${v}`, { dark: hex('#865e3a'), lite: hex('#aa8058'), density: 0.2 });
  const rnd = prng(`terra-pedra${v}`);
  for (let k = 0; k < 2 + v; k++) {
    const x = Math.floor(rnd() * 29) + 1;
    const y = Math.floor(rnd() * 29) + 1;
    p.set(x, y, hex('#b8a080'));
    p.set(x + 1, y, hex('#76563a'));
  }
  if (v === 3) for (let x = 4; x < 28; x++) if (x % 3) p.set(x, 15 + (x % 2), hex('#7e5a38')); // trilha de carroça
  return p;
}

function areia(v: number): Pix {
  const p = ground(hex('#dcc890'), `areia${v}`, { dark: hex('#ccb47c'), lite: hex('#ead8a4'), density: 0.15 });
  if (v === 1) {
    p.set(12, 18, hex('#f0e8e0'));
    p.set(13, 18, hex('#e8a8a0')); // concha
  }
  if (v === 2) for (let x = 2; x < 30; x += 1) p.set(x, 10 + Math.round(Math.sin(x / 3) * 1.5), hex('#c8b078'));
  return p;
}

function agua(deep: boolean, frame: number): Pix {
  const base = deep ? hex('#2a5a8a') : hex('#4a8ab8');
  const p = new Pix(S, S);
  p.rect(0, 0, S, S, base);
  const rnd = prng(`agua${deep}`);
  noise(p, rnd, [shade(base, 0.92)], 0.12);
  // ondinhas que andam com o quadro
  const wave = light(base, deep ? 0.18 : 0.3);
  for (let k = 0; k < 6; k++) {
    const y = (k * 6 + 3) % 32;
    const x0 = ((k * 11 + frame * 4) % 36) - 4;
    for (let i = 0; i < 4; i++) p.set((x0 + i + 32) % 32, (y + (i === 0 || i === 3 ? 1 : 0)) % 32, wave);
  }
  if (!deep && frame % 2 === 0) p.set((frame * 9 + 5) % 32, (frame * 7 + 11) % 32, C.pureWhite);
  return p;
}

function madeira(v: number): Pix {
  const p = new Pix(S, S);
  const plank = [hex('#9a6a3a'), hex('#8a5e32'), hex('#a8784a')];
  for (let row = 0; row < 4; row++) {
    const y = row * 8;
    p.rect(0, y, S, 7, plank[(row + v) % 3]!);
    p.hline(0, S - 1, y + 7, hex('#3a2818')); // fresta
    const off = (row * 13 + v * 7) % 32;
    p.vline(off, y, y + 6, hex('#5a3a20'));
    p.set((off + 4) % 32, y + 3, hex('#3a3a40')); // prego
    for (let x = 0; x < S; x += 5) p.set((x + row * 3) % 32, y + 2 + (x % 3), shade(plank[(row + v) % 3]!, 0.88));
  }
  if (v === 2) p.rect(6, 15, 3, 1, hex('#1a3a5a')); // água aparecendo pela fresta
  return p;
}

function concreto(v: number): Pix {
  const p = ground(hex('#9a9a96'), `conc${v}`, { dark: hex('#8a8a86'), lite: hex('#aaaaa6'), density: 0.14 });
  p.hline(0, S - 1, 0, hex('#7e7e7a'));
  p.vline(0, 0, S - 1, hex('#7e7e7a'));
  if (v === 1) p.line(6, 4, 14, 14, hex('#6e6e6a')); // rachadura
  if (v === 2) p.ellipse(20, 20, 5, 3, hex('#868a7e')); // mancha
  if (v === 3) {
    p.rect(14, 14, 4, 4, hex('#6e6e72')); // bueiro
    p.hline(14, 17, 15, hex('#4a4a4e'));
  }
  return p;
}

function asfalto(v: number): Pix {
  const p = ground(hex('#3e4044'), `asf${v}`, { dark: hex('#34363a'), lite: hex('#4a4c50'), density: 0.2 });
  if (v === 1) for (let x = 2; x < 30; x += 8) p.rect(x, 15, 5, 2, hex('#e8d040'));
  if (v === 2) {
    p.ellipse(16, 16, 6, 6, hex('#2e3034'));
    p.ring(16, 16, 6, 6, 1, hex('#56585c'));
  }
  return p;
}

function pisoNeon(frame: number): Pix {
  const p = new Pix(S, S);
  p.rect(0, 0, S, S, hex('#1a1c24'));
  const rnd = prng('neon');
  noise(p, rnd, [hex('#20222c')], 0.2);
  const cols = [C.neonCyan, C.neonPink, C.neonPurple, C.neonCyan];
  const glow = withAlpha(cols[frame]!, 255);
  const dim = mix(cols[frame]!, hex('#1a1c24'), 0.55);
  p.hline(0, S - 1, 0, dim);
  p.vline(0, 0, S - 1, dim);
  p.hline(0, S - 1, 16, dim);
  p.vline(16, 0, S - 1, dim);
  // pulso que corre a grade
  const k = frame * 8;
  p.set(k, 0, glow);
  p.set(k + 1, 0, glow);
  p.set(16, k, glow);
  p.set(16, k + 1, glow);
  return p;
}

function lama(v: number): Pix {
  const p = ground(hex('#6a4e32'), `lama${v}`, { dark: hex('#5a4028'), lite: hex('#7a5e40'), density: 0.25 });
  const rnd = prng(`poca${v}`);
  for (let k = 0; k < 2; k++) {
    const x = 6 + rnd() * 20;
    const y = 6 + rnd() * 20;
    p.ellipse(x, y, 4, 2, hex('#4a3a2a'));
    p.set(Math.floor(x) - 1, Math.floor(y) - 1, hex('#8a7a6a'));
  }
  if (v === 2) for (let k = 0; k < 4; k++) p.set(4 + k * 7, 25 - (k % 2) * 3, hex('#3a2a1a')); // pegadas
  return p;
}

function mato(v: number): Pix {
  const p = grama(v % 2);
  const rnd = prng(`mato${v}`);
  for (let k = 0; k < 14; k++) {
    const x = Math.floor(rnd() * 30) + 1;
    const y = Math.floor(rnd() * 26) + 5;
    const h = 3 + Math.floor(rnd() * 4);
    const c = k % 3 ? hex('#3e7a2a') : hex('#6aa84a');
    p.vline(x, y - h, y, c);
    p.set(x + (k % 2 ? 1 : -1), y - h, c);
  }
  return p;
}

/** Parede: topo claro e face da frente, estilo Tibia. 0 taipa/tijolo, 1 concreto e vidro, 2 palafita. */
function parede(v: number): Pix {
  const p = new Pix(S, S);
  if (v === 1) {
    p.rect(0, 0, S, 10, hex('#b8bcc4'));
    p.rect(0, 10, S, 22, hex('#7a7e86'));
    p.rect(4, 14, 10, 10, hex('#2a3a5a'));
    p.rect(18, 14, 10, 10, hex('#2a3a5a'));
    p.line(5, 22, 12, 15, withAlpha(C.neonCyan, 160));
    p.hline(0, S - 1, 27, C.neonPink); // faixa de neon
    p.hline(0, S - 1, 9, hex('#e8ecf0'));
    return p;
  }
  if (v === 2) {
    p.rect(0, 0, S, 9, hex('#a87a4a'));
    for (let x = 0; x < S; x += 6) {
      p.rect(x, 9, 5, 23, hex('#8a5e32'));
      p.vline(x + 5, 9, 31, hex('#3a2818'));
      p.set(x + 2, 12, hex('#3a3a40'));
    }
    p.hline(0, S - 1, 8, hex('#c89a6a'));
    return p;
  }
  // taipa e tijolo da Esquerda
  p.rect(0, 0, S, 9, hex('#c8a070'));
  p.hline(0, S - 1, 8, hex('#e0bc8a'));
  for (let row = 0; row < 6; row++) {
    const y = 9 + row * 4;
    p.rect(0, y, S, 4, row % 2 ? hex('#a85a3a') : hex('#b0643e'));
    p.hline(0, S - 1, y + 3, hex('#7a3e2a'));
    for (let x = (row % 2) * 4; x < S; x += 8) p.vline(x, y, y + 2, hex('#7a3e2a'));
  }
  p.ellipse(22, 22, 4, 3, withAlpha(hex('#5e9a3e'), 200)); // trepadeira
  return p;
}

function arvoreBase(v: number): Pix {
  const p = v === 2 ? lama(0) : grama(v);
  const trunk = v === 1 ? hex('#7a6a4a') : hex('#6a4426');
  p.ellipse(16, 29, 8, 2.5, withAlpha(C.black, 70));
  if (v === 1) {
    // mangue: raízes aéreas
    for (const dx of [-5, -2, 2, 5]) p.line(16, 20, 16 + dx, 30, trunk);
  }
  p.rect(13, 16, 6, 13, trunk);
  p.vline(18, 16, 28, shade(trunk, 0.7));
  p.set(14, 20, light(trunk, 0.3));
  const leaf = v === 2 ? hex('#3e6e2a') : v === 1 ? hex('#4a8a4a') : hex('#3e8a34');
  p.ellipse(16, 10, 13, 10, leaf);
  p.ellipse(11, 7, 6, 5, light(leaf, 0.15));
  p.ellipse(21, 13, 6, 5, shade(leaf, 0.85));
  const rnd = prng(`folha${v}`);
  for (let k = 0; k < 20; k++) p.set(Math.floor(5 + rnd() * 22), Math.floor(2 + rnd() * 16), k % 2 ? light(leaf, 0.3) : shade(leaf, 0.75));
  if (v === 0) {
    p.set(9, 9, C.red);
    p.set(20, 6, C.red);
  }
  p.outline({ minAlpha: 255 });
  return p;
}

/** Copa grande da árvore (48x40), desenhada por cima de quem passa embaixo. */
function copa(v: number): Pix {
  const p = new Pix(48, 40);
  const leaf = v === 2 ? hex('#3e6e2a') : v === 1 ? hex('#4a8a4a') : hex('#3e8a34');
  p.ellipse(24, 20, 22, 17, leaf);
  p.ellipse(16, 14, 10, 8, light(leaf, 0.15));
  p.ellipse(32, 24, 10, 8, shade(leaf, 0.85));
  const rnd = prng(`copa${v}`);
  for (let k = 0; k < 60; k++) p.set(Math.floor(4 + rnd() * 40), Math.floor(4 + rnd() * 32), k % 2 ? light(leaf, 0.3) : shade(leaf, 0.72));
  p.outline();
  return p;
}

function pedra(v: number): Pix {
  const p = v === 0 ? grama(1) : terra(1);
  const st = hex('#8a8478');
  p.ellipse(16, 20, 12, 9, st);
  p.ellipse(13, 16, 7, 5, light(st, 0.2));
  p.ellipse(20, 24, 7, 4, shade(st, 0.8));
  p.set(10, 14, hex('#5a7a3a'));
  p.set(11, 14, hex('#5a7a3a'));
  p.outline({ minAlpha: 255 });
  return p;
}

function cerca(v: number): Pix {
  const p = v === 0 ? grama(0) : concreto(0);
  const col = v === 0 ? hex('#8a5a32') : hex('#9aa0a8');
  for (const x of [3, 15, 27]) {
    p.rect(x, 8, 3, 20, col);
    p.vline(x + 2, 8, 27, shade(col, 0.7));
    if (v === 0) p.set(x + 1, 7, col);
  }
  p.rect(0, 12, S, 2, col);
  p.rect(0, 21, S, 2, col);
  p.hline(0, S - 1, 14, shade(col, 0.6));
  p.hline(0, S - 1, 23, shade(col, 0.6));
  if (v === 1) for (let x = 0; x < S; x += 3) p.set(x, 6 + (x % 2), C.metal); // arame
  return p;
}

function grade(v: number): Pix {
  const p = v === 0 ? concreto(1) : asfalto(0);
  const col = v === 0 ? hex('#5a5e66') : hex('#3a3e46');
  p.rect(0, 4, S, 2, col);
  p.rect(0, 26, S, 2, col);
  for (let x = 1; x < S; x += 4) {
    p.vline(x, 2, 28, col);
    p.vline(x + 1, 2, 28, light(col, 0.3));
    p.set(x, 1, light(col, 0.5));
  }
  if (v === 1) p.rect(12, 12, 8, 6, C.warn); // placa
  return p;
}

function maquina(v: number): Pix {
  const p = new Pix(S, S);
  const body = v === 2 ? hex('#2a2e3a') : hex('#6a6e76');
  p.rect(1, 4, 30, 27, body);
  p.rect(1, 4, 30, 4, light(body, 0.25));
  p.frame(1, 4, 30, 30, shade(body, 0.6));
  if (v === 0) {
    // turbina
    p.ring(16, 19, 9, 9, 2, hex('#8a5a3a'));
    for (let k = 0; k < 4; k++) p.line(16, 19, 16 + Math.cos(k * 1.57 + 0.4) * 8, 19 + Math.sin(k * 1.57 + 0.4) * 8, hex('#9aa0a8'));
  } else if (v === 1) {
    // gerador
    for (let y = 11; y < 28; y += 3) p.hline(4, 18, y, shade(body, 0.7));
    p.rect(21, 11, 7, 7, hex('#2a2a2a'));
    p.set(23, 13, C.red);
    p.set(25, 13, C.neonGreen);
    p.rect(22, 21, 5, 6, C.warn);
  } else {
    // painel neon
    p.rect(4, 10, 24, 12, hex('#0e1018'));
    for (let x = 6; x < 26; x += 3) p.vline(x, 20 - ((x * 7) % 9), 20, x % 2 ? C.neonCyan : C.neonPink);
    p.rect(6, 24, 4, 3, C.neonGreen);
  }
  return p;
}

function porta(v: number): Pix {
  const p = v === 1 ? concreto(0) : v === 2 ? madeira(0) : terra(0);
  if (v === 1) {
    p.rect(4, 2, 24, 28, withAlpha(hex('#6ab8d8'), 170)); // porta de vidro automática
    p.vline(16, 2, 29, hex('#3a3e46'));
    p.frame(4, 2, 27, 29, hex('#3a3e46'));
    p.hline(6, 25, 4, C.neonCyan);
    return p;
  }
  const wood = v === 2 ? hex('#7a4e2a') : hex('#8a5a32');
  p.rect(6, 2, 20, 28, wood);
  p.frame(6, 2, 25, 29, shade(wood, 0.6));
  for (let x = 10; x < 25; x += 5) p.vline(x, 3, 28, shade(wood, 0.8));
  p.set(22, 16, C.gold);
  p.rect(12, 0, 8, 2, hex('#5e9a3e')); // folhas sobre a porta
  return p;
}

function vazio(): Pix {
  const p = new Pix(S, S);
  p.rect(0, 0, S, S, hex('#0c0c14'));
  return p;
}

function decoFrame(name: string, value: number): Pix {
  const p = new Pix(S, S);
  const n = name.toLowerCase();
  if (n.includes('flor')) {
    for (const [x, y, c] of [
      [10, 12, '#f0e060'],
      [20, 18, '#f4f0f0'],
      [14, 22, '#e86a8a'],
    ] as const) {
      p.set(x, y, hex(c));
      p.set(x - 1, y, hex(c));
      p.set(x + 1, y, hex(c));
      p.set(x, y - 1, hex(c));
      p.set(x, y + 1, hex(c));
      p.set(x, y, hex('#e8a020'));
      p.vline(x, y + 2, y + 4, hex('#3e7a2a'));
    }
  } else if (n.includes('concha')) {
    p.ellipse(14, 18, 3, 2.5, hex('#f0e0d8'));
    p.line(12, 18, 16, 16, hex('#d8a8a0'));
    p.ellipse(22, 12, 2, 1.5, hex('#e8c8b8'));
  } else if (n.includes('tabua')) {
    p.rect(6, 14, 18, 4, hex('#8a5e32'));
    p.hline(6, 23, 17, hex('#5a3a20'));
    p.set(9, 15, hex('#3a3a40'));
  } else {
    // decoração desconhecida: pedrinhas
    const rnd = prng(`deco${value}`);
    for (let k = 0; k < 3; k++) p.ellipse(6 + rnd() * 20, 6 + rnd() * 20, 1.5, 1, hex('#8a8478'));
  }
  return p;
}

/** Desenho de um tile e variante (puro). */
export function drawTile(tile: number, v: number): Pix {
  switch (tile) {
    case Tile.Vazio:
      return vazio();
    case Tile.Grama:
      return grama(v);
    case Tile.Terra:
      return terra(v);
    case Tile.Areia:
      return areia(v);
    case Tile.AguaRasa:
      return agua(false, v);
    case Tile.AguaFunda:
      return agua(true, v);
    case Tile.Madeira:
      return madeira(v);
    case Tile.Concreto:
      return concreto(v);
    case Tile.Asfalto:
      return asfalto(v);
    case Tile.PisoNeon:
      return pisoNeon(v);
    case Tile.Lama:
      return lama(v);
    case Tile.Mato:
      return mato(v);
    case Tile.Parede:
      return parede(v);
    case Tile.Arvore:
      return arvoreBase(v);
    case Tile.Pedra:
      return pedra(v);
    case Tile.Cerca:
      return cerca(v);
    case Tile.Grade:
      return grade(v);
    case Tile.Maquina:
      return maquina(v);
    case Tile.Porta:
      return porta(v);
    default:
      return vazio();
  }
}

/** Todos os valores numéricos do enum Tile. */
export const TILE_VALUES: number[] = Object.values(Tile).filter((v): v is number => typeof v === 'number');

let tileCache: SheetData | undefined;

/** Folha do tileset inteiro (puro, em cache). */
export function buildTileset(): SheetData {
  if (tileCache) return tileCache;
  const items: { name: string; pix: Pix }[] = [];
  for (const t of TILE_VALUES) for (let v = 0; v < (TILE_VARIANTS[t] ?? 1); v++) items.push({ name: `${t}_${v}`, pix: drawTile(t, v) });
  for (let v = 0; v < (TILE_VARIANTS[Tile.Arvore] ?? 1); v++) items.push({ name: `copa_${Tile.Arvore}_${v}`, pix: copa(v) });
  for (const [name, value] of Object.entries(Deco)) if (value !== 0) items.push({ name: `deco_${value}`, pix: decoFrame(name, value) });
  tileCache = packFrames(TILE_KEY, items, 512);
  return tileCache;
}
