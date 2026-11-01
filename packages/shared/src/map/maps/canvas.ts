/**
 * Prancheta de caracteres para escrever os mapas grandes da Fase 3 (80 x 120 a 120 x 160) sem digitar
 * 160 linhas à mão. Desenha retângulos, prédios com porta, elipses e espalha árvores e decoração de
 * forma determinística (hash da célula, nunca Math.random). O resultado são linhas ASCII que passam
 * pelo mesmo buildAsciiMap (maps/ascii.ts) dos outros mapas, com a legenda de cada mapa.
 *
 * Os marcadores ficam fora da grade (AsciiMapDef.extraMarkers), postos com mk() no centro da célula;
 * a ordem da lista é a ordem do mapa, e o primeiro spawn_jogador é o padrão do servidor e do cliente.
 */
import type { MapMarker } from '../types';

export interface Pt {
  x: number;
  y: number;
}

/** Hash inteiro da célula, em [0, 1). Determinístico. */
export function hash01(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class Canvas {
  private readonly g: string[][];

  constructor(
    readonly w: number,
    readonly h: number,
    fill: string,
  ) {
    this.g = Array.from({ length: h }, () => Array.from({ length: w }, () => fill));
  }

  get(x: number, y: number): string | undefined {
    return this.g[y]?.[x];
  }

  set(x: number, y: number, ch: string): this {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.g[y]![x] = ch;
    return this;
  }

  /** Retângulo cheio (x, y, largura, altura). */
  rect(x: number, y: number, w: number, h: number, ch: string): this {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, ch);
    return this;
  }

  /** Contorno do retângulo. */
  frame(x: number, y: number, w: number, h: number, ch: string): this {
    for (let i = x; i < x + w; i++) this.set(i, y, ch).set(i, y + h - 1, ch);
    for (let j = y; j < y + h; j++) this.set(x, j, ch).set(x + w - 1, j, ch);
    return this;
  }

  /** Prédio: piso por dentro, parede em volta e as portas (células na parede) com 'D'. */
  building(x: number, y: number, w: number, h: number, wall: string, floor: string, doors: readonly [number, number][], door = 'D'): this {
    this.rect(x, y, w, h, floor).frame(x, y, w, h, wall);
    for (const [dx, dy] of doors) this.set(dx, dy, door);
    return this;
  }

  /** Elipse cheia com centro (cx, cy) e raios rx, ry. */
  ellipse(cx: number, cy: number, rx: number, ry: number, ch: string): this {
    for (let j = cy - ry; j <= cy + ry; j++) {
      for (let i = cx - rx; i <= cx + rx; i++) {
        const dx = (i - cx) / (rx + 0.5), dy = (j - cy) / (ry + 0.5);
        if (dx * dx + dy * dy <= 1) this.set(i, j, ch);
      }
    }
    return this;
  }

  /** Troca, dentro do retângulo, as células que estão em `from` por `to`. */
  replace(x: number, y: number, w: number, h: number, from: string, to: string): this {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (from.includes(this.get(i, j) ?? '\0')) this.set(i, j, to);
    return this;
  }

  /**
   * Espalha um obstáculo (árvore, pedra) em células de `on`, uma a uma: só onde as 8 vizinhas também
   * são de `on` (então dois obstáculos nunca se encostam, nem na diagonal, e nenhum caminho fecha) e
   * longe dos pontos de `avoid`.
   */
  scatter(ch: string, rate: number, seed: number, on: string, avoid: readonly Pt[] = [], avoidR = 2): this {
    for (let y = 1; y < this.h - 1; y++) {
      for (let x = 1; x < this.w - 1; x++) {
        if (hash01(x, y, seed) >= rate) continue;
        let ok = true;
        for (let j = -1; j <= 1 && ok; j++) for (let i = -1; i <= 1 && ok; i++) if (!on.includes(this.get(x + i, y + j) ?? '\0')) ok = false;
        if (!ok) continue;
        if (avoid.some((p) => Math.abs(p.x - x) <= avoidR && Math.abs(p.y - y) <= avoidR)) continue;
        this.set(x, y, ch);
      }
    }
    return this;
  }

  /** Decoração (char com tile andável) em células de `on`, sem regra de vizinhança. */
  sprinkle(ch: string, rate: number, seed: number, on: string): this {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (on.includes(this.get(x, y) ?? '\0') && hash01(x, y, seed) < rate) this.set(x, y, ch);
    return this;
  }

  rows(): string[] {
    return this.g.map((r) => r.join(''));
  }
}

/** Marcador no centro da célula (x, y). */
export function mk(id: string, kind: MapMarker['kind'], x: number, y: number, ref?: string, params?: Record<string, unknown>): MapMarker {
  const m: MapMarker = { id, kind, x: x + 0.5, y: y + 0.5 };
  if (ref !== undefined) m.ref = ref;
  if (params !== undefined) m.params = params;
  return m;
}

/** Células dos marcadores (para o scatter não plantar árvore em cima). */
export const cellsOf = (ms: readonly MapMarker[]): Pt[] => ms.map((m) => ({ x: Math.floor(m.x), y: Math.floor(m.y) }));
