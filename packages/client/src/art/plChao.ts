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

export const PL_CHAO_MAPS: ReadonlySet<string> = new Set([
  'delta',
  'barco_travessia',
  'margem_esquerda',
  'margem_direita',
  'usina_da_ponte',
  'juncal',
  'planalto_do_trigo',
  'vale_das_chamines',
  'ilha_do_farol',
]);

/**
 * terrenos do PixelLab, do mais baixo ao mais alto (a ordem decide quem é "upper" num vértice; em
 * cada tileset, o lower vem antes do upper nesta lista)
 */
const ORDEM = ['funda', 'rasa', 'lama', 'areia', 'grama', 'terra', 'trigo', 'asfalto', 'concreto', 'pisoneon', 'galeria', 'madeira', 'parede', 'parede_esq', 'parede_dir', 'parede_galeria'] as const;
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
  [Tile.Parede]: 'parede',
  [Tile.Cerca]: 'madeira',
  [Tile.Porta]: 'madeira',
};
/** o que muda por mapa: a parede de cada margem e o chão da cidade na Direita */
const CHAO_DO_MAPA: Record<string, Partial<Record<number, Terreno>>> = {
  margem_esquerda: { [Tile.Parede]: 'parede_esq', [Tile.Maquina]: 'grama' },
  margem_direita: {
    [Tile.Parede]: 'parede_dir',
    [Tile.Concreto]: 'concreto',
    [Tile.Asfalto]: 'asfalto',
    [Tile.PisoNeon]: 'pisoneon',
    [Tile.Grade]: 'concreto',
    [Tile.Maquina]: 'concreto',
    [Tile.Pedra]: 'concreto',
    [Tile.Porta]: 'concreto',
    [Tile.Mato]: 'concreto',
    [Tile.Grama]: 'concreto',
  },
  // v0.4: no Planalto o mato é o trigo e a cerca fica em cima da grama; o Vale é como a Margem Direita;
  // na Ilha, a antena (máquina) fica em cima da grama
  planalto_do_trigo: { [Tile.Mato]: 'trigo', [Tile.Cerca]: 'grama' },
  vale_das_chamines: {
    [Tile.Parede]: 'parede_dir',
    [Tile.Concreto]: 'concreto',
    [Tile.Asfalto]: 'asfalto',
    [Tile.PisoNeon]: 'pisoneon',
    [Tile.Grade]: 'concreto',
    [Tile.Maquina]: 'concreto',
    [Tile.Porta]: 'concreto',
  },
  ilha_do_farol: { [Tile.Maquina]: 'grama' },
  // os andares das Galerias da Usina (chave de qualquer andar de masmorra: chaveDoMapa)
  galerias: { [Tile.Concreto]: 'galeria', [Tile.Parede]: 'parede_galeria', [Tile.Maquina]: 'galeria' },
  // a Usina é de concreto, com a parede da Direita; o Juncal usa o chão e a parede de palafita do Delta
  usina_da_ponte: {
    [Tile.Parede]: 'parede_dir',
    [Tile.Concreto]: 'concreto',
    [Tile.Asfalto]: 'asfalto',
    [Tile.Grade]: 'concreto',
    [Tile.Maquina]: 'concreto',
  },
};

/** tiles com chão do PixelLab embaixo, mas o desenho procedural (objeto) por cima */
export const PL_POR_CIMA: ReadonlySet<number> = new Set([Tile.Cerca, Tile.Porta, Tile.Pedra, Tile.Grade, Tile.Maquina]);

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

/**
 * Enfeites do PixelLab (public/pl/props/<prop>.png), desenhados no dobro da resolução do mundo: no
 * lugar do prop procedural de mesmo nome (art/landmarks.ts), com escala 0,5.
 */
export const PL_PROPS: readonly string[] = [
  'barco',
  'rede',
  'caixote',
  'toldo',
  'lanterna',
  'junco',
  // margens
  'horta',
  'totem',
  'lixo',
  'letreiro',
  'holograma',
];
export const PL_PROP_ESCALA = 0.5;
export const plPropKey = (prop: string) => `pl_prop_${prop}`;

/** Põe as folhas de chão, as árvores e os enfeites na fila de carga (chamar no preload). */
export function preloadPlChao(scene: Phaser.Scene): void {
  const base = import.meta.env.BASE_URL;
  for (const p of man.pares) scene.load.image(`plchao_${p.lower}_${p.upper}`, `${base}pl/chao/${p.img}`);
  for (let i = 0; i < ARVORES; i++) scene.load.image(`pl_arvore_${i}`, `${base}pl/arvores/arvore_${i}.png`);
  for (const p of PL_PROPS) scene.load.image(plPropKey(p), `${base}pl/props/${p}.png`);
  for (let i = 0; i < MATO; i++) scene.load.image(`pl_mato_${i}`, `${base}pl/mato/mato_${i}.png`);
  for (const f of PL_FACHADAS) scene.load.image(plFachadaKey(f), `${base}pl/fachadas/${f}.png`);
}

/** fachadas do PixelLab (public/pl/fachadas/<id>.png, 128x128, escala 0,5): as 8 sedes e os 2 QGs */
export const PL_FACHADAS: readonly string[] = [
  'casa_da_assembleia',
  'brigada_popular',
  'guarda_comunitaria',
  'escola_dos_saberes',
  'trupe_do_povo',
  'torre_do_consorcio',
  'torcida_furia_neon',
  'pm_do_consorcio',
  'universidade_neon',
  'agencia_neon',
];
export const plFachadaKey = (id: string) => `pl_fachada_${id}`;

/** tufos de mato do PixelLab (public/pl/mato/), no lugar do mato procedural que balança */
const MATO = 2;

/** Tufo de mato do PixelLab para um tile de Mato (só em parte deles, pela posição), ou undefined. */
export function plMatoKey(scene: Phaser.Scene, x: number, y: number): string | undefined {
  const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  if (h % 3 !== 0) return undefined;
  const k = `pl_mato_${(h >>> 3) % MATO}`;
  return scene.textures.exists(k) ? k : scene.textures.exists('pl_mato_0') ? 'pl_mato_0' : undefined;
}

export const temPlMato = (scene: Phaser.Scene) => scene.textures.exists('pl_mato_0');

/** v0.4: no mapa em que o mato vira trigo (Planalto), o trigo é chão e não leva tufo. */
export const matoViraTrigo = (mapId: string) => CHAO_DO_MAPA[chaveDoMapa(mapId)]?.[Tile.Mato] === 'trigo';

/** Andar de masmorra ('galerias_da_usina:3'): todos usam o chão das Galerias. */
const ehAndar = (mapId: string) => /^[a-z_]+:\d+$/.test(mapId);
const chaveDoMapa = (mapId: string) => (ehAndar(mapId) ? 'galerias' : mapId);

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
  if ((!PL_CHAO_MAPS.has(map.id) && !ehAndar(map.id)) || pares.size === 0) return false;
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
 * deixando as células sem terreno do PixelLab como estavam. Nos objetos de PL_POR_CIMA, volta só o
 * desenho do objeto: os pixels em que o bloco procedural difere de `semObjeto` (o mesmo bloco com o
 * objeto trocado por chão, RGBA do mesmo tamanho).
 */
export function desenhaPlChao(
  scene: Phaser.Scene,
  ctx: CanvasRenderingContext2D,
  map: TileMap,
  tx0: number,
  ty0: number,
  tw: number,
  th: number,
  semObjeto?: Uint8ClampedArray,
): void {
  const W = map.width;
  const H = map.height;
  const proc = document.createElement('canvas');
  proc.width = tw * T;
  proc.height = th * T;
  const pctx = proc.getContext('2d')!;
  pctx.drawImage(ctx.canvas, 0, 0);
  const tile = (x: number, y: number) => map.tiles[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))]!;
  const doMapa = CHAO_DO_MAPA[chaveDoMapa(map.id)] ?? {};
  const chaoDe = (t: number) => doMapa[t] ?? CHAO_DE[t];
  // a pedra fica em cima do chão que estiver em volta (grama no barranco, concreto na ponte)
  const emVolta = (x: number, y: number): Terreno | undefined => {
    const conta = new Map<Terreno, number>();
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const t = tile(x + dx, y + dy);
      const c = t === Tile.Pedra ? undefined : chaoDe(t);
      if (c) conta.set(c, (conta.get(c) ?? 0) + 1);
    }
    let melhor: Terreno | undefined;
    for (const [c, n] of conta) if (!melhor || n > conta.get(melhor)!) melhor = c;
    return melhor;
  };
  const chao = (x: number, y: number) => {
    const t = tile(x, y);
    return t === Tile.Pedra && doMapa[t] === undefined ? (emVolta(x, y) ?? chaoDe(t)) : chaoDe(t);
  };
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
  // células sem chão do PixelLab: volta o desenho procedural da célula
  for (let y = ty0; y < ty0 + th; y++)
    for (let x = tx0; x < tx0 + tw; x++) {
      if (chaoDe(tile(x, y)) !== undefined) continue;
      const sx = (x - tx0) * T;
      const sy = (y - ty0) * T;
      ctx.clearRect(sx, sy, T, T);
      ctx.drawImage(proc, sx, sy, T, T, sx, sy, T, T);
    }
  // objetos: só os pixels do objeto (o que difere do bloco sem ele)
  if (!semObjeto) return;
  const W2 = tw * T;
  const procData = pctx.getImageData(0, 0, W2, th * T).data;
  const out = ctx.getImageData(0, 0, W2, th * T);
  let mudou = false;
  for (let y = ty0; y < ty0 + th; y++)
    for (let x = tx0; x < tx0 + tw; x++) {
      if (!PL_POR_CIMA.has(tile(x, y))) continue;
      // o objeto pode passar um pouco da célula (pedra alta, porta): olha a célula e a de cima
      for (let py = Math.max(0, (y - ty0 - 1) * T); py < (y - ty0 + 1) * T; py++)
        for (let px = (x - tx0) * T; px < (x - tx0 + 1) * T; px++) {
          const i = (py * W2 + px) * 4;
          if (procData[i] === semObjeto[i] && procData[i + 1] === semObjeto[i + 1] && procData[i + 2] === semObjeto[i + 2]) continue;
          out.data[i] = procData[i]!;
          out.data[i + 1] = procData[i + 1]!;
          out.data[i + 2] = procData[i + 2]!;
          out.data[i + 3] = 255;
          mudou = true;
        }
    }
  if (mudou) ctx.putImageData(out, 0, 0);
}
