/**
 * Caminho (A*) para o auto-caminho: tocar no chão, tocar numa missão e a IA dos inimigos.
 *
 * - Grade de células em 8 direções, sem cortar canto (a diagonal só vale com os dois vizinhos retos livres).
 * - Uma célula é andável quando o círculo do raio cabe no centro dela (circleFree).
 * - O custo de cada passo divide pela velocidade do tile (lama e água rasa custam mais), então o
 *   caminho contorna terreno lento quando compensa. A heurística octil continua admissível porque
 *   nenhum tile passa de velocidade 1.
 * - Destino sólido ou apertado demais: usa a célula andável mais perto do ponto tocado.
 * - Suavização por string-pulling: pula pontos quando o segmento é andável para o círculo (amostras
 *   com circleFree) e não passa por tile mais lento que o pior tile do trecho original.
 *
 * Retorno: os pontos a seguir em ordem, SEM a posição de partida, terminando no destino (o ponto
 * tocado quando ele é andável, ou o centro da célula escolhida). null quando não há caminho ou
 * quando a busca passa do limite de nós.
 *
 * Não é reentrante (usa buffers do módulo para não alocar a cada chamada), o que é seguro em JS.
 * Não usa Math.random nem Date: o resultado é determinístico.
 */
import type { Vec } from '../sim/types';
import { circleFree, infoAt } from './grid';
import type { TileMap } from './types';

/** SUGESTÃO: limite de nós expandidos por busca (cabe com folga num tick de 50 ms). */
export const PATH_MAX_NODES = 4000;
/** SUGESTÃO: até quantos tiles do ponto tocado procurar uma célula livre quando o destino é sólido. */
export const PATH_SNAP_RADIUS = 6;
/** Passo da amostragem dos segmentos na suavização, em tiles. */
const SAMPLE_STEP = 0.2;
/** raio mínimo usado nas checagens: com 0, circleFree não vê o tile sólido onde o ponto está */
const MIN_R = 1e-3;
/** desempate da heurística: favorece nós mais perto do destino e expande menos */
const H_TIE = 1 + 1e-3;
const SQRT2 = Math.SQRT2;
const OCTILE_K = SQRT2 - 2;

export interface PathStats {
  /** nós expandidos (tirados da fila) */
  expanded: number;
  /** true quando o destino foi trocado pela célula livre mais perto */
  snapped: boolean;
}

export interface PathOptions {
  /** limite de nós expandidos; passou, devolve null. Padrão PATH_MAX_NODES. */
  maxNodes?: number;
  /** raio de busca da célula livre mais perto do destino sólido. Padrão PATH_SNAP_RADIUS. */
  snapRadius?: number;
  /** false devolve os centros das células sem suavizar (depuração). Padrão true. */
  smooth?: boolean;
  /** preenchido com números da busca, se passado */
  stats?: PathStats;
}

// ---- buffers reaproveitados entre chamadas (carimbo em vez de limpar os arrays)
let cap = 0;
let stamp = 0;
let gScore = new Float64Array(0);
let parent = new Int32Array(0);
let seen = new Uint32Array(0);
let closed = new Uint32Array(0);
let walkSeen = new Uint32Array(0);
let walkVal = new Uint8Array(0);
let heapIdx = new Int32Array(1024);
let heapF = new Float64Array(1024);
let heapSize = 0;

function ensure(n: number): void {
  if (n > cap) {
    cap = n;
    gScore = new Float64Array(n);
    parent = new Int32Array(n);
    seen = new Uint32Array(n);
    closed = new Uint32Array(n);
    walkSeen = new Uint32Array(n);
    walkVal = new Uint8Array(n);
    stamp = 0;
  }
  stamp++;
  if (stamp >= 0xffffffff) {
    seen.fill(0);
    closed.fill(0);
    walkSeen.fill(0);
    stamp = 1;
  }
}

function heapPush(i: number, f: number): void {
  if (heapSize >= heapIdx.length) {
    const ni = new Int32Array(heapIdx.length * 2);
    ni.set(heapIdx);
    heapIdx = ni;
    const nf = new Float64Array(heapF.length * 2);
    nf.set(heapF);
    heapF = nf;
  }
  let k = heapSize++;
  while (k > 0) {
    const p = (k - 1) >> 1;
    if (heapF[p]! <= f) break;
    heapIdx[k] = heapIdx[p]!;
    heapF[k] = heapF[p]!;
    k = p;
  }
  heapIdx[k] = i;
  heapF[k] = f;
}

function heapPop(): number {
  const top = heapIdx[0]!;
  const lastI = heapIdx[--heapSize]!;
  const lastF = heapF[heapSize]!;
  let k = 0;
  const half = heapSize >> 1;
  while (k < half) {
    let c = 2 * k + 1;
    const r = c + 1;
    if (r < heapSize && heapF[r]! < heapF[c]!) c = r;
    if (heapF[c]! >= lastF) break;
    heapIdx[k] = heapIdx[c]!;
    heapF[k] = heapF[c]!;
    k = c;
  }
  if (heapSize > 0) {
    heapIdx[k] = lastI;
    heapF[k] = lastF;
  }
  return top;
}

/** A célula (x, y) é andável para um círculo de raio r parado no centro dela? (com cache por busca) */
function walkable(map: TileMap, x: number, y: number, r: number): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  const i = y * map.width + x;
  if (walkSeen[i] === stamp) return walkVal[i] === 1;
  const ok = !infoAt(map, x, y).solid && circleFree(map, x + 0.5, y + 0.5, r);
  walkSeen[i] = stamp;
  walkVal[i] = ok ? 1 : 0;
  return ok;
}

/** Segmento a→b andável para o círculo, sem passar por tile mais lento que minSpeed. */
function segmentFree(map: TileMap, ax: number, ay: number, bx: number, by: number, r: number, minSpeed: number): boolean {
  const dx = bx - ax, dy = by - ay;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / SAMPLE_STEP));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const px = ax + dx * t, py = ay + dy * t;
    const info = infoAt(map, Math.floor(px), Math.floor(py));
    if (info.solid || info.speed < minSpeed - 1e-9) return false;
    if (!circleFree(map, px, py, r)) return false;
  }
  return true;
}

/**
 * Caminho de `from` até `to` para um corpo de raio `radius` (tiles). Ver o cabeçalho do arquivo.
 * Assinatura compatível com SimContext.pathfinder (sim/types.ts); `opts` é opcional.
 */
export function findPath(map: TileMap, from: Vec, to: Vec, radius = 0.35, opts: PathOptions = {}): Vec[] | null {
  const W = map.width, H = map.height;
  const r = Math.max(radius, MIN_R);
  const maxNodes = opts.maxNodes ?? PATH_MAX_NODES;
  const snapR = opts.snapRadius ?? PATH_SNAP_RADIUS;
  const stats = opts.stats;
  if (stats) {
    stats.expanded = 0;
    stats.snapped = false;
  }
  if (!Number.isFinite(from.x) || !Number.isFinite(from.y) || !Number.isFinite(to.x) || !Number.isFinite(to.y)) return null;

  const sx = Math.floor(from.x), sy = Math.floor(from.y);
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return null;
  ensure(W * H);

  // ---- destino: a célula tocada ou a andável mais perto dela
  let gx = Math.floor(to.x), gy = Math.floor(to.y);
  let snapped = false;
  if (!walkable(map, gx, gy, r)) {
    snapped = true;
    let best = -1, bestD = Infinity;
    const cx0 = Math.min(Math.max(gx, 0), W - 1), cy0 = Math.min(Math.max(gy, 0), H - 1);
    for (let y = cy0 - snapR; y <= cy0 + snapR; y++) {
      for (let x = cx0 - snapR; x <= cx0 + snapR; x++) {
        if (!walkable(map, x, y, r)) continue;
        const ddx = x + 0.5 - to.x, ddy = y + 0.5 - to.y;
        const fx = x + 0.5 - from.x, fy = y + 0.5 - from.y;
        // distância ao ponto tocado; empate: a mais perto de quem anda
        const d = ddx * ddx + ddy * ddy + (fx * fx + fy * fy) * 1e-6;
        if (d < bestD) {
          bestD = d;
          best = y * W + x;
        }
      }
    }
    if (best < 0) return null;
    gx = best % W;
    gy = (best - gx) / W;
  }
  if (stats) stats.snapped = snapped;
  const final: Vec = !snapped && circleFree(map, to.x, to.y, r) ? { x: to.x, y: to.y } : { x: gx + 0.5, y: gy + 0.5 };
  if (sx === gx && sy === gy) return [final];

  // ---- A*
  const startI = sy * W + sx, goalI = gy * W + gx;
  heapSize = 0;
  gScore[startI] = 0;
  seen[startI] = stamp;
  parent[startI] = -1;
  const h = (x: number, y: number) => {
    const ax = Math.abs(x - gx), ay = Math.abs(y - gy);
    return (ax + ay + OCTILE_K * Math.min(ax, ay)) * H_TIE;
  };
  heapPush(startI, h(sx, sy));
  let expanded = 0;
  let found = false;
  while (heapSize > 0) {
    const cur = heapPop();
    if (closed[cur] === stamp) continue;
    closed[cur] = stamp;
    expanded++;
    if (cur === goalI) {
      found = true;
      break;
    }
    if (expanded > maxNodes) break;
    const cx = cur % W, cy = (cur - cx) / W;
    const gc = gScore[cur]!;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx, ny = cy + dy;
        if (!walkable(map, nx, ny, r)) continue;
        const diag = dx !== 0 && dy !== 0;
        if (diag && (!walkable(map, cx + dx, cy, r) || !walkable(map, cx, cy + dy, r))) continue;
        const ni = ny * W + nx;
        if (closed[ni] === stamp) continue;
        const ng = gc + (diag ? SQRT2 : 1) / infoAt(map, nx, ny).speed;
        if (seen[ni] !== stamp || ng < gScore[ni]!) {
          seen[ni] = stamp;
          gScore[ni] = ng;
          parent[ni] = cur;
          heapPush(ni, ng + h(nx, ny));
        }
      }
    }
  }
  if (stats) stats.expanded = expanded;
  if (!found) return null;

  // ---- células do início ao fim
  const cells: number[] = [];
  for (let i = goalI; i !== -1; i = parent[i]!) cells.push(i);
  cells.reverse();
  const speedOf = (i: number) => infoAt(map, i % W, Math.floor(i / W)).speed;
  const center = (i: number): Vec => ({ x: (i % W) + 0.5, y: Math.floor(i / W) + 0.5 });

  if (opts.smooth === false) {
    const out = cells.slice(1).map(center);
    out[out.length - 1] = final;
    return out;
  }

  // ---- pontos-chave: partida, curvas e destino; segMin[k] = tile mais lento entre o ponto k-1 e o k
  const pts: Vec[] = [{ x: from.x, y: from.y }];
  const segMin: number[] = [speedOf(startI)];
  let runMin = speedOf(startI);
  for (let k = 1; k < cells.length; k++) {
    const c = cells[k]!;
    runMin = Math.min(runMin, speedOf(c));
    const isLast = k === cells.length - 1;
    let turn = isLast;
    if (!isLast) {
      const p = cells[k - 1]!, n = cells[k + 1]!;
      turn = c - p !== n - c;
    }
    if (turn) {
      pts.push(isLast ? final : center(c));
      segMin.push(runMin);
      runMin = speedOf(c);
    }
  }

  // ---- string-pulling
  const out: Vec[] = [];
  let a = 0;
  while (a < pts.length - 1) {
    let best = a + 1;
    let minS = segMin[a + 1]!;
    for (let j = a + 2; j < pts.length; j++) {
      minS = Math.min(minS, segMin[j]!);
      const pa = pts[a]!, pj = pts[j]!;
      if (segmentFree(map, pa.x, pa.y, pj.x, pj.y, r, minS)) best = j;
      else break;
    }
    out.push(pts[best]!);
    a = best;
  }
  return out;
}

/** Comprimento total do caminho a partir de `from` (tiles). Útil para IA e testes. */
export function pathLength(from: Vec, path: readonly Vec[]): number {
  let len = 0, px = from.x, py = from.y;
  for (const p of path) {
    len += Math.hypot(p.x - px, p.y - py);
    px = p.x;
    py = p.y;
  }
  return len;
}
