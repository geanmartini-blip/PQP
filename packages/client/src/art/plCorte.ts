/**
 * v0.4: o corte de cabelo da criação no boneco base do PixelLab, sem gerar nada no PixelLab. O cabelo
 * da folha base (bagunçado, médio) é o curtinho social, o corte padrão. Os outros saem dele, quadro a
 * quadro: apaga o cabelo (o que fica dentro do crânio vira pele), apara rente ao crânio ou desenha
 * volume, rabo, tranças e boné por cima ou por trás. O cabelo desenhado usa as cores de CABELO_NOVO,
 * que o plTinta pinta em qualquer altura do quadro. Roda antes do plTinta e é puro: roda no Node.
 */

/** cores do cabelo da folha base (0xRRGGBB) */
const CABELO = new Set([0x291a19, 0x3e2c28, 0x5a4641, 0x54392e]);
const PELE = new Set([0xfbb88a, 0xe99b6d, 0xdd8d61, 0xce7f54, 0xb76b47, 0xa45337, 0xcd764f, 0x9f5942, 0xba744f, 0x7e452f, 0xf4bf9f]);
const CONTORNO = 0x1d1414;
/** cabelo desenhado: escuro, meio e claro (vizinhas das da base, para o plTinta achar em qualquer altura) */
export const CABELO_NOVO = [0x2a1a19, 0x3f2c28, 0x5b4641] as const;
const [ESC, MEIO, CLARO] = CABELO_NOVO;
const PELE_LUZ = 0xf4bf9f;
const PELE_REF = 0xfbb88a;
const PELE_MEIA = 0xe99b6d;
const PELE_SOMBRA = 0xce7f54;

/** dir da linha da folha (linha % 4): 0 sul, 1 oeste, 2 norte, 3 leste */
type Dir = 0 | 1 | 2 | 3;

class Quadro {
  /** pixels mudados por este corte (o contorno novo nasce em volta deles) */
  readonly mudou = new Set<number>();
  constructor(
    private readonly px: Uint8ClampedArray,
    private readonly larg: number,
    private readonly x0: number,
    private readonly y0: number,
    readonly w: number,
    readonly h: number,
  ) {}
  private i(x: number, y: number) {
    return ((this.y0 + y) * this.larg + this.x0 + x) * 4;
  }
  dentro(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  /** 0xRRGGBB, ou -1 se transparente ou fora */
  get(x: number, y: number): number {
    if (!this.dentro(x, y)) return -1;
    const i = this.i(x, y);
    if (this.px[i + 3]! < 8) return -1;
    return (this.px[i]! << 16) | (this.px[i + 1]! << 8) | this.px[i + 2]!;
  }
  set(x: number, y: number, c: number) {
    if (!this.dentro(x, y)) return;
    const i = this.i(x, y);
    this.px[i] = (c >> 16) & 255;
    this.px[i + 1] = (c >> 8) & 255;
    this.px[i + 2] = c & 255;
    this.px[i + 3] = 255;
    this.mudou.add(y * this.w + x);
  }
  limpa(x: number, y: number) {
    if (!this.dentro(x, y)) return;
    this.px[this.i(x, y) + 3] = 0;
    this.mudou.add(y * this.w + x);
  }
}

/** O crânio e o cabelo de um quadro. */
interface Cabeca {
  /** cabelo (e o contorno dele) ligado ao topo, por índice y*w+x */
  cabelo: Set<number>;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** topo do cabelo, topo do rosto e o fim do crânio */
  topo: number;
  rosto: number;
  /** -1 olha para a esquerda (oeste), 1 para a direita (leste), 0 de frente ou de costas */
  lado: -1 | 0 | 1;
  dir: Dir;
}

function analisa(q: Quadro, dir: Dir): Cabeca | undefined {
  const lim = Math.floor(q.h * 0.45);
  let rosto = lim;
  const topoPele: number[] = new Array(q.w).fill(lim);
  for (let y = 0; y < lim; y++)
    for (let x = 0; x < q.w; x++)
      if (PELE.has(q.get(x, y))) {
        rosto = Math.min(rosto, y);
        topoPele[x] = Math.min(topoPele[x]!, y);
      }
  // abaixo disto, cabelo dentro do rosto é olho, sobrancelha ou barba
  const ehCabelo = (x: number, y: number) => {
    const c = q.get(x, y);
    return (CABELO.has(c) || c === CONTORNO) && y < lim && (y < rosto + 5 || y < topoPele[x]!);
  };
  const cabelo = new Set<number>();
  const pilha: number[] = [];
  for (let y = 0; y < lim && !pilha.length; y++)
    for (let x = 0; x < q.w; x++) if (CABELO.has(q.get(x, y))) pilha.push(y * q.w + x);
  for (const k of pilha) cabelo.add(k);
  while (pilha.length) {
    const k = pilha.pop()!;
    const x = k % q.w;
    const y = (k - x) / q.w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = (y + dy) * q.w + x + dx;
      if (cabelo.has(n) || !ehCabelo(x + dx, y + dy)) continue;
      cabelo.add(n);
      pilha.push(n);
    }
  }
  if (cabelo.size < 40) return undefined;
  // o antialias fora da paleta no meio do cabelo (3 vizinhos ou mais já são cabelo) também é cabelo
  for (let y = 0; y < rosto; y++)
    for (let x = 0; x < q.w; x++) {
      const cor = q.get(x, y);
      if (cor === -1 || PELE.has(cor) || cabelo.has(y * q.w + x)) continue;
      let n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (cabelo.has((y + dy) * q.w + x + dx)) n++;
      if (n >= 3) cabelo.add(y * q.w + x);
    }
  let x0 = q.w, x1 = -1, topo = q.h;
  for (const k of cabelo) {
    const x = k % q.w;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    topo = Math.min(topo, (k - x) / q.w);
  }
  // o cabelo base tem uns 3 px de volume em volta do crânio
  const rx = Math.max(6, (x1 - x0) / 2 - 3);
  const ry = rx * 0.92;
  return { cabelo, cx: (x0 + x1) / 2, cy: topo + 3 + ry, rx, ry, topo, rosto, lado: dir === 1 ? -1 : dir === 3 ? 1 : 0, dir };
}

const dentroElipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

/** Pele do crânio careca: luz em cima à esquerda, sombra na borda de baixo e da direita. */
function peleCranio(c: Cabeca, x: number, y: number): number {
  const nx = (x - c.cx) / c.rx;
  const ny = (y - c.cy) / c.ry;
  if (nx * nx + ny * ny > 0.78 && (nx > 0.2 || ny > 0.3)) return PELE_SOMBRA;
  if (nx * nx + ny * ny > 0.62 && nx > 0.1) return PELE_MEIA;
  if (nx < -0.1 && ny < -0.45 && nx > -0.6) return PELE_LUZ;
  return PELE_REF;
}

/** Máquina um: uma camada rente de cabelo no alto do crânio, com a pele aparecendo de leve. */
function maquinaUm(c: Cabeca, x: number, y: number): number {
  const nx = (x - c.cx) / c.rx;
  const ny = (y - c.cy) / c.ry;
  if (ny > 0.3 && c.dir !== 2) return peleCranio(c, x, y);
  if (ruido(x, y) % 11 === 0) return CLARO;
  if (nx * nx + ny * ny > 0.75 && (nx > 0.1 || ny > 0)) return ESC;
  return ny < -0.55 && nx < 0 ? CLARO : MEIO;
}

/** Tira o cabelo onde `tira(x, y)` manda: dentro do crânio vira pele (ou `pele`), fora some. */
function apaga(q: Quadro, c: Cabeca, tira: (x: number, y: number) => boolean = () => true, pele = peleCranio): void {
  let x0 = q.w, x1 = 0, y1 = 0;
  for (const k of c.cabelo) {
    const x = k % q.w;
    const y = (k - x) / q.w;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
    if (!tira(x, y)) continue;
    if (dentroElipse(x, y, c.cx, c.cy, c.rx, c.ry)) q.set(x, y, pele(c, x, y));
    // de costas, o cabelo da nuca cobria o pescoço
    else if (c.dir === 2 && y > c.cy && Math.abs(x - c.cx) < c.rx * 0.55 && q.get(x, y + 3) !== -1) q.set(x, y, PELE_SOMBRA);
    else q.limpa(x, y);
  }
  // as pontas soltas do cabelo base (antialias fora da paleta) que sobraram em volta
  for (let passo = 0; passo < 3; passo++)
    for (let y = c.topo - 4; y <= y1 + 1; y++)
      for (let x = x0 - 4; x <= x1 + 4; x++) {
        const cor = q.get(x, y);
        if (cor === -1 || PELE.has(cor) || q.mudou.has(y * q.w + x) || !tira(x, y)) continue;
        // dentro do crânio, acima do rosto: pele
        if (dentroElipse(x, y, c.cx, c.cy, c.rx, c.ry)) {
          if (passo === 0 && y < c.rosto + 2) q.set(x, y, pele(c, x, y));
          continue;
        }
        if (dentroElipse(x, y, c.cx, c.cy, c.rx + 0.5, c.ry + 0.5)) continue;
        let viz = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && q.get(x + dx, y + dy) !== -1) viz++;
        if (viz <= 2) q.limpa(x, y);
      }
}

/** hash pequeno e estável por pixel, para mechas e cachos */
const ruido = (x: number, y: number) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 97;

/**
 * Cor do cabelo desenhado num ponto, pela normal da forma (nx, ny de -1 a 1): luz em cima à esquerda,
 * sombra embaixo à direita, e a textura do corte (mecha liga e cacho).
 */
function tomCabelo(x: number, y: number, nx: number, ny: number, textura: 'liso' | 'cacho' | 'mecha' = 'mecha'): number {
  const d = nx * nx + ny * ny;
  if (textura === 'cacho') {
    const r = ruido(x >> 1, y >> 1) % 5;
    if (d > 0.7 && (nx > 0 || ny > 0.2)) return r === 0 ? MEIO : ESC;
    if (ny < -0.3 && nx < 0.3 && r < 2) return CLARO;
    return r === 0 ? ESC : MEIO;
  }
  if (d > 0.72 && (nx > 0.15 || ny > 0.35)) return ESC;
  if (ny < -0.45 && nx < 0.25 && (textura === 'liso' || ruido(x, y) % 3 !== 0)) return CLARO;
  if (textura === 'mecha' && (x * 5 + (y >> 2) * 3) % 5 === 0) return ESC;
  if (textura === 'liso' && x % 4 === 1 && ny > -0.4) return ESC;
  return MEIO;
}

type Camada = 'tras' | 'frente';
/** pinta por trás: só onde está vazio ou já é cabelo; pela frente: em tudo */
function pode(q: Quadro, c: Cabeca, x: number, y: number, camada: Camada) {
  if (camada === 'frente') return true;
  const cor = q.get(x, y);
  // acima do rosto, o resto do cabelo base (contorno e antialias fora da paleta) fica por baixo do desenho
  const restoDoCabelo = y < c.rosto && !PELE.has(cor);
  return cor === -1 || restoDoCabelo || c.cabelo.has(y * q.w + x) || CABELO_NOVO.includes(cor as never);
}

/** Elipse de cabelo com luz e sombra. */
function bola(q: Quadro, c: Cabeca, ex: number, ey: number, rx: number, ry: number, camada: Camada, textura: 'liso' | 'cacho' | 'mecha' = 'mecha', ate = Infinity) {
  for (let y = Math.floor(ey - ry); y <= Math.min(ate, Math.ceil(ey + ry)); y++)
    for (let x = Math.floor(ex - rx); x <= Math.ceil(ex + rx); x++) {
      if (!dentroElipse(x, y, ex, ey, rx, ry) || !pode(q, c, x, y, camada)) continue;
      q.set(x, y, tomCabelo(x, y, (x - ex) / rx, (y - ey) / ry, textura));
    }
}

/** Faixa vertical de cabelo (rabo, trança, mecha comprida), de y0 a y1, com largura que afina. */
function faixa(q: Quadro, c: Cabeca, x: number, y0: number, y1: number, larg0: number, larg1: number, camada: Camada, gomos = false) {
  for (let y = Math.floor(y0); y <= y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    // as pontas arredondam nas duas últimas linhas
    const meia = (larg0 + (larg1 - larg0) * t) / 2 - Math.max(0, y - y1 + 2) * 0.7;
    // trança: gomos de 3 px que alternam o lado
    const desvio = gomos ? (((y - y0) / 3) | 0) % 2 === 0 ? -0.5 : 0.5 : 0;
    for (let xx = Math.round(x - meia + desvio); xx <= Math.round(x + meia + desvio); xx++) {
      // pontas desfiadas, cada mecha num comprimento
      if (!gomos && meia > 3 && y > y1 - (ruido(xx, 7) % 3)) continue;
      if (!pode(q, c, xx, y, camada)) continue;
      const nx = (xx - x - desvio) / Math.max(1, meia);
      const borda = gomos && (y - y0) % 3 === 2;
      const mecha = !gomos && ruido(xx, (y - y0) >> 3) % 5 === 0;
      q.set(xx, y, borda || mecha ? ESC : tomCabelo(xx, y, nx, 0, 'mecha'));
    }
  }
}

/** Contorno de 1 px em volta do que o corte mudou, onde ficou vazio do lado. */
function contorna(q: Quadro): void {
  const novos: [number, number][] = [];
  for (const k of q.mudou) {
    const x = k % q.w;
    const y = (k - x) / q.w;
    if (q.get(x, y) === -1) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
      if (q.dentro(x + dx, y + dy) && q.get(x + dx, y + dy) === -1) novos.push([x + dx, y + dy]);
  }
  for (const [x, y] of novos) q.set(x, y, CONTORNO);
}

/** Lado de trás da cabeça no perfil (x), ou o centro. */
const nuca = (c: Cabeca, f = 0.75) => c.cx - c.lado * c.rx * f;

const CORTES: Record<string, (q: Quadro, c: Cabeca) => void> = {
  careca: (q, c) => apaga(q, c),
  raspado: (q, c) => apaga(q, c, undefined, maquinaUm),
  calvicie_penteada: (q, c) => {
    apaga(q, c);
    // três fios atravessados por cima, de lado a lado
    for (let i = 0; i < 3; i++) {
      const y0 = c.cy - c.ry * (0.82 - i * 0.22);
      for (let x = Math.round(c.cx - c.rx * 0.8); x <= c.cx + c.rx * 0.8; x++) {
        const y = Math.round(y0 + ((x - c.cx) / c.rx) * 2);
        if (dentroElipse(x, y, c.cx, c.cy, c.rx, c.ry)) q.set(x, y, i === 0 ? MEIO : ESC);
      }
    }
  },
  moicano: (q, c) => {
    // frente e costas: uma faixa no meio; de perfil, a crista do topo inteira
    const fica = (x: number, y: number) => (c.lado === 0 ? Math.abs(x - c.cx) > 4 : y > c.cy - c.ry * 0.55);
    apaga(q, c, fica);
    if (c.lado === 0) bola(q, c, c.cx, c.cy - c.ry * 0.7, 4, c.ry * 0.55, 'frente');
    else bola(q, c, c.cx, c.cy - c.ry * 0.85, c.rx * 0.9, 4, 'frente');
  },
  black_power: (q, c) => bola(q, c, c.cx - c.lado * 2, c.cy - 4, c.rx + 7, c.ry + 6, 'tras', 'cacho'),
  cacheado: (q, c) => {
    bola(q, c, c.cx - c.lado * 2, c.cy - 2, c.rx + 4, c.ry + 3, 'tras', 'cacho');
    // os cachos também por cima do cabelo base
    for (const k of c.cabelo) {
      const x = k % q.w;
      const y = (k - x) / q.w;
      if (q.get(x, y) !== CONTORNO) q.set(x, y, tomCabelo(x, y, (x - c.cx) / (c.rx + 3), (y - c.cy) / (c.ry + 3), 'cacho'));
    }
  },
  coque: (q, c) => {
    apara(q, c, 1);
    const x = c.lado === 0 ? c.cx : nuca(c, 0.45);
    bola(q, c, x, c.topo + 1, 6, 5, c.dir === 2 || c.lado !== 0 ? 'frente' : 'tras');
  },
  rabo_de_cavalo: (q, c) => {
    apara(q, c, 1);
    if (c.dir === 0) return;
    const x = c.lado === 0 ? c.cx : nuca(c, 0.92);
    bola(q, c, x, c.cy - c.ry * 0.25, 4, 4, 'frente');
    faixa(q, c, x - c.lado, c.cy - c.ry * 0.1, c.cy + c.ry + 12, 7, 3, c.dir === 2 ? 'frente' : 'tras');
  },
  trancas: (q, c) => {
    apara(q, c, 1);
    if (c.lado === 0) {
      for (const s of [-1, 1]) faixa(q, c, c.cx + s * (c.rx - 1), c.cy + 2, c.cy + c.ry + 16, 5, 4, c.dir === 2 ? 'frente' : 'tras', true);
    } else faixa(q, c, nuca(c, 0.9), c.cy + 2, c.cy + c.ry + 16, 5, 4, 'tras', true);
  },
  dreads: (q, c) => {
    const n = c.lado === 0 ? 7 : 4;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = c.lado === 0 ? c.cx - c.rx - 1 + t * (c.rx * 2 + 2) : nuca(c, 0.3 + t * 0.8);
      const fim = c.cy + c.ry * 0.6 + 6 + ((i * 7) % 5);
      // de frente, as do meio ficam atrás da cabeça
      faixa(q, c, x, c.cy - c.ry * 0.3, fim, 3, 3, c.dir === 2 ? 'frente' : 'tras', true);
    }
  },
  liso_comprido: (q, c) => {
    const largura = c.lado === 0 ? c.rx * 2 + 4 : c.rx * 1.2;
    const x = c.lado === 0 ? c.cx : nuca(c, 0.5);
    faixa(q, c, x, c.cy - c.ry * 0.2, c.cy + c.ry + 18, largura, largura - 4, c.dir === 2 ? 'frente' : 'tras');
  },
  chanel: (q, c) => {
    apara(q, c, 1);
    const largura = c.lado === 0 ? c.rx * 2 + 4 : c.rx * 1.6;
    const x = c.lado === 0 ? c.cx : nuca(c, 0.25);
    faixa(q, c, x, c.cy - c.ry * 0.2, c.cy + c.ry * 0.75, largura, largura, c.dir === 2 ? 'frente' : 'tras');
  },
  mullet: (q, c) => {
    apara(q, c, 1);
    if (c.dir === 0) return;
    const x = c.lado === 0 ? c.cx : nuca(c, 0.7);
    faixa(q, c, x, c.cy, c.cy + c.ry + 9, c.lado === 0 ? c.rx * 1.3 : 9, 6, c.dir === 2 ? 'frente' : 'tras');
  },
  topete_de_gala: (q, c) => {
    apara(q, c, 1);
    // onda de gel para cima e para a frente, mais alta na testa
    if (c.dir === 2) bola(q, c, c.cx, c.topo + 3, c.rx * 0.7, 4, 'tras', 'liso');
    else if (c.lado === 0) {
      bola(q, c, c.cx - 3, c.topo + 3, c.rx * 0.85, 4, 'frente', 'liso');
      bola(q, c, c.cx - 6, c.topo + 1, c.rx * 0.4, 3, 'frente', 'liso');
    } else {
      bola(q, c, c.cx + c.lado * c.rx * 0.35, c.topo + 3, c.rx * 0.75, 4, 'frente', 'liso');
      bola(q, c, c.cx + c.lado * c.rx * 0.75, c.topo + 2, c.rx * 0.35, 4, 'frente', 'liso');
    }
  },
  espetado_de_gel: (q, c) => {
    apara(q, c, 1);
    // cinco pontas para cima, a do meio maior
    for (let i = 0; i < 5; i++) {
      const bx = c.cx + (i - 2) * (c.rx * 0.38);
      const alt = i === 2 ? 9 : i === 1 || i === 3 ? 7 : 5;
      const base = c.cy - Math.sqrt(Math.max(0, 1 - ((bx - c.cx) / c.rx) ** 2)) * c.ry + 2;
      for (let y = 0; y <= alt; y++) {
        const meia = 3 * (1 - y / alt);
        for (let x = Math.round(bx - meia); x <= Math.round(bx + meia); x++)
          q.set(x, Math.round(base - y), x > bx ? ESC : y > alt * 0.4 ? CLARO : MEIO);
      }
    }
  },
  franja_reta: (q, c) => {
    apara(q, c, 1);
    if (c.dir === 2) return;
    franja(q, c, c.rosto + 4, c.lado === 0 ? [c.cx - c.rx, c.cx + c.rx] : c.lado < 0 ? [c.cx - c.rx - 2, c.cx] : [c.cx, c.cx + c.rx + 2]);
  },
  cuia: (q, c) => {
    const linha = c.rosto + 4;
    apara(q, c, 1);
    // tigela: corte reto na altura da franja, em volta da cabeça toda
    bola(q, c, c.cx, c.cy - 1, c.rx + 1, c.ry, 'tras', 'liso', linha);
    if (c.dir !== 2) franja(q, c, linha, [c.cx - c.rx - 1, c.cx + c.rx + 1]);
  },
  bone: (q, c) => {
    const aba = c.cy - c.ry * 0.25;
    apaga(q, c, (x, y) => y < aba || !dentroElipse(x, y, c.cx, c.cy, c.rx + 1, c.ry + 1));
    // copa: meia elipse que cobre o alto da cabeça
    for (let y = Math.floor(c.cy - c.ry - 2); y <= aba; y++)
      for (let x = Math.floor(c.cx - c.rx - 2); x <= c.cx + c.rx + 2; x++) {
        if (!dentroElipse(x, y, c.cx, c.cy + 1, c.rx + 2, c.ry + 3)) continue;
        const nx = (x - c.cx) / (c.rx + 2);
        q.set(x, y, y >= aba - 1 ? ESC : nx < -0.35 && y < c.cy - c.ry * 0.5 ? CLARO : nx > 0.6 ? ESC : MEIO);
      }
    // aba: de frente, uma faixa escura; de perfil, para a frente
    if (c.dir === 0) for (let x = Math.round(c.cx - c.rx * 0.8); x <= c.cx + c.rx * 0.8; x++) q.set(x, Math.round(aba) + 1, ESC);
    else if (c.lado !== 0)
      for (let i = 0; i < 9; i++) {
        const x = Math.round(c.cx + c.lado * (c.rx + 1 + i));
        q.set(x, Math.round(aba), ESC);
        if (i < 7) q.set(x, Math.round(aba) - 1, MEIO);
      }
  },
  corte_feito_em_casa: (q, c) => {
    // um lado na máquina, o outro como estava
    apaga(q, c, (x) => x < c.cx, maquinaUm);
  },
};

/** Apara o cabelo base rente ao crânio (`folga` px de volume). */
function apara(q: Quadro, c: Cabeca, folga: number): void {
  apaga(q, c, (x, y) => !dentroElipse(x, y, c.cx, c.cy, c.rx + folga, c.ry + folga));
}

/** Franja reta: cobre a testa de cabelo até a linha y, entre x0 e x1, só em cima de pele. */
function franja(q: Quadro, c: Cabeca, linha: number, [x0, x1]: [number, number]): void {
  for (let x = Math.round(x0); x <= x1; x++)
    for (let y = Math.floor(c.cy - c.ry); y <= linha; y++) {
      const cor = q.get(x, y);
      if (!dentroElipse(x, y, c.cx, c.cy, c.rx + 1, c.ry + 1) || !(PELE.has(cor) || CABELO.has(cor) || CABELO_NOVO.includes(cor as never))) continue;
      q.set(x, y, y === linha ? ESC : tomCabelo(x, y, (x - c.cx) / c.rx, -0.2, 'liso'));
    }
}

/**
 * Onde está o cabelo da folha base (índices de pixel da folha): o cabelo ligado ao topo de cada
 * quadro. Olho e sobrancelha usam as mesmas cores e ficam de fora, para não pegarem a cor do cabelo.
 */
export function mascaraDoCabelo(px: Uint8ClampedArray, largura: number, w: number, h: number): Set<number> {
  const m = new Set<number>();
  const altura = px.length / 4 / largura;
  for (let y0 = 0; y0 + h <= altura; y0 += h)
    for (let x0 = 0; x0 + w <= largura; x0 += w) {
      const c = analisa(new Quadro(px, largura, x0, y0, w, h), ((y0 / h) % 4) as Dir);
      if (!c) continue;
      for (const k of c.cabelo) {
        const x = k % w;
        m.add((y0 + (k - x) / w) * largura + x0 + x);
      }
    }
  return m;
}

/** Cortes que mudam o boneco base (o curtinho social é o próprio cabelo da folha). */
export const CORTES_PL: readonly string[] = Object.keys(CORTES);

/**
 * Aplica o corte em todos os quadros da folha (largura px, quadros de w x h, linhas de 4 direções).
 * Corte desconhecido ou o padrão deixam a folha como está.
 */
export function cortar(px: Uint8ClampedArray, corte: string, largura: number, w: number, h: number): void {
  const fn = CORTES[corte];
  if (!fn) return;
  const altura = px.length / 4 / largura;
  for (let y0 = 0; y0 + h <= altura; y0 += h)
    for (let x0 = 0; x0 + w <= largura; x0 += w) {
      const q = new Quadro(px, largura, x0, y0, w, h);
      const c = analisa(q, ((y0 / h) % 4) as Dir);
      if (!c) continue;
      fn(q, c);
      contorna(q);
    }
}
