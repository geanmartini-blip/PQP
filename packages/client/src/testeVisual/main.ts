/**
 * Cena de teste visual da Ponte do Rio Claro (Etapa 1 da revisão visual), em Phaser 4.
 * Abre em /teste-visual.html. Só visual: nenhum sistema de jogo roda aqui.
 *
 * - Resolução da arte: cada pixel de arte vira 2x2 pixels físicos (zoom inteiro 2x). O canvas tem
 *   o tamanho da tela em px físicos / 2 e o CSS estica com image-rendering: pixelated.
 * - Luz do Phaser 4 com normal map (texturas <chave>_n.png geradas em tools/art), ambiente de fim
 *   de tarde e ciclo de dia e noite (?hora=18.5, ?ciclo=1, tecla N).
 * - Brilho (bloom) só no que brilha: <chave>_e.png desenhado em ADD, com um halo desfocado feito
 *   uma vez na carga. Quantização com dither leve na câmera.
 * - Peão Brabo anda pelo joystick (ou WASD/setas); Idol parada; drone elite com aviso no chão.
 */
import * as Phaser from 'phaser4';
import { montarHud, type Hud } from './hud';
import { DRONES, ELITE, JOGADOR, MUNDO, NPCS, PECAS, type Peca } from './layout';

const BASE = import.meta.env.BASE_URL + 'teste-visual/';
type Manifesto = Record<string, { atlas: boolean; n: boolean; e: boolean }>;
const q = new URLSearchParams(location.search);
const DPR = Math.min(3, Number(q.get('dpr')) || window.devicePixelRatio || 1);
// px físicos por pixel de arte: inteiro, 2 no mínimo (2x em dpr 2, 3x em dpr 3), para a tela de
// 390 px de CSS mostrar ~390 px de arte, como o docs/alvo-tela.png
const ART = Number(q.get('px')) || Math.max(2, Math.round(DPR));
const tamanho = () => ({ w: Math.ceil((innerWidth * DPR) / ART), h: Math.ceil((innerHeight * DPR) / ART) });

// ---------- dia e noite ----------
// [hora, cor do ambiente, força das luzes]
const CEU: [number, number, number][] = [
  [0, 0x2c3266, 1.25], [5, 0x3a3a70, 1.15], [7, 0xb0a8c0, 0.45], [10, 0xf4f0e6, 0.25], [15, 0xf8eedc, 0.3],
  [17.5, 0xffe0c0, 0.55], [18.6, 0xf0c4b0, 0.8], [19.6, 0x9a88b0, 1.0], [21, 0x4a4c84, 1.2], [24, 0x2c3266, 1.25],
];
function ceu(h: number): { amb: number; luz: number } {
  h = ((h % 24) + 24) % 24;
  let i = 0;
  while (i < CEU.length - 2 && CEU[i + 1]![0] <= h) i++;
  const [h0, c0, l0] = CEU[i]!, [h1, c1, l1] = CEU[i + 1]!;
  const t = (h - h0) / (h1 - h0);
  const ch = (c: number, s: number) => (c >> s) & 255;
  const m = (s: number) => Math.round(ch(c0, s) + (ch(c1, s) - ch(c0, s)) * t);
  return { amb: (m(16) << 16) | (m(8) << 8) | m(0), luz: l0 + (l1 - l0) * t };
}

interface Luz { l: Phaser.GameObjects.Light; i: number; fase: number }
interface Brilho { img: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite; halo?: Phaser.GameObjects.Image; base: number; fase: number }

class Ponte extends Phaser.Scene {
  man: Manifesto = {};
  hud!: Hud;
  peao!: Phaser.GameObjects.Sprite;
  peaoE: Phaser.GameObjects.Sprite | null = null;
  sombraP!: Phaser.GameObjects.Image;
  dir: 'baixo' | 'cima' | 'lado' = 'baixo';
  flip = false;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  luzes: Luz[] = [];
  brilhos: Brilho[] = [];
  bloqueios: Phaser.Geom.Rectangle[] = [];
  agua!: Phaser.GameObjects.TileSprite;
  hora = Number(q.get('hora') ?? 18.6);
  drones: { s: Phaser.GameObjects.Sprite; sb: Phaser.GameObjects.Image; y: number; fase: number; e?: Phaser.GameObjects.Sprite | null }[] = [];
  aviso!: Phaser.GameObjects.Image;
  avisoEnche!: Phaser.GameObjects.Image;
  elite!: Phaser.GameObjects.Sprite;
  vidaElite!: Phaser.GameObjects.Graphics;

  constructor() {
    super('ponte');
  }

  init(data: { man: Manifesto }) {
    this.man = data.man;
  }

  preload() {
    for (const [k, m] of Object.entries(this.man)) {
      const n = m.n ? BASE + k + '_n.png' : undefined;
      if (m.atlas) {
        this.load.atlas({ key: k, textureURL: BASE + k + '.png', atlasURL: BASE + k + '.json', normalMap: n });
        if (m.e) this.load.atlas(k + '_e', BASE + k + '_e.png', BASE + k + '.json');
      } else {
        this.load.image({ key: k, url: BASE + k + '.png', normalMap: n });
        if (m.e) this.load.image(k + '_e', BASE + k + '_e.png');
      }
    }
  }

  tem(k: string) {
    return this.textures.exists(k);
  }

  /** Halo desfocado de uma textura emissiva (feito uma vez): o bloom só do que brilha. */
  halo(k: string): string | null {
    const hk = k + '_g';
    if (this.tem(hk)) return hk;
    if (!this.tem(k)) return null;
    const src = this.textures.get(k).getSourceImage() as HTMLImageElement;
    const P = 10;
    const c = document.createElement('canvas');
    c.width = src.width + P * 2;
    c.height = src.height + P * 2;
    const g = c.getContext('2d')!;
    g.filter = 'blur(4px) brightness(1.4)';
    g.drawImage(src, P, P);
    g.filter = 'blur(1.5px)';
    g.drawImage(src, P, P);
    this.textures.addCanvas(hk, c);
    return hk;
  }

  create() {
    const W = MUNDO.w, H = MUNDO.h;
    this.lights.enable();
    // água que corre por baixo do chão (o chão tem o rio vazado)
    this.agua = this.add.tileSprite(MUNDO.rioX0 - 30, 0, MUNDO.rioX1 - MUNDO.rioX0 + 60, H, 'agua_tile').setOrigin(0, 0).setDepth(-2000).setLighting(true);
    this.add.image(0, 0, 'chao').setOrigin(0, 0).setDepth(-1900).setLighting(true);
    if (this.tem('cascata')) {
      this.anims.create({ key: 'cascata', frames: this.anims.generateFrameNames('cascata', { prefix: 'cascata_', start: 0, end: 3 }), frameRate: 8, repeat: -1 });
      const c = this.add.sprite((MUNDO.rioX0 + MUNDO.rioX1) / 2, 560, 'cascata').setOrigin(0.5, 1).setDepth(-1800).setLighting(true).play('cascata');
      void c;
    }
    // ponte: chão por baixo dos bonecos, grade da frente por cima
    const px = (MUNDO.rioX0 + MUNDO.rioX1) / 2;
    if (this.tem('ponte_chao')) this.peca({ k: 'ponte_chao', x: px, y: MUNDO.ponteY + 34 }, -1700);
    if (this.tem('ponte_grade_frente')) this.peca({ k: 'ponte_grade_frente', x: px, y: MUNDO.ponteY + 36 });

    for (const p of PECAS) if (this.tem(p.k)) this.peca(p);

    // rio bloqueia, menos a ponte
    this.bloqueios.push(new Phaser.Geom.Rectangle(MUNDO.rioX0 + 6, 0, MUNDO.rioX1 - MUNDO.rioX0 - 12, MUNDO.ponteY - 22));
    this.bloqueios.push(new Phaser.Geom.Rectangle(MUNDO.rioX0 + 6, MUNDO.ponteY + 26, MUNDO.rioX1 - MUNDO.rioX0 - 12, H));

    // animações dos bonecos
    for (const k of ['peao', 'idol', 'benzedeira', 'pm']) this.criarAnims(k);
    for (const n of NPCS) {
      if (!this.tem(n.k)) continue;
      this.add.image(n.x, n.y, 'sombra').setOrigin(0.5, 0.5).setDepth(n.y - 0.5).setAlpha(0.45);
      const s = this.add.sprite(n.x, n.y + 1, n.k).setOrigin(0.5, 1).setDepth(n.y).setLighting(true).setFlipX(!!n.flip);
      const a = `${n.k}_${n.anim}`;
      if (this.anims.exists(a)) s.play({ key: a, delay: Math.random() * 400 });
      this.seguirEmissivo(s, n.k);
    }
    // drones
    for (const k of ['drone', 'drone_elite']) {
      if (this.tem(k)) this.anims.create({ key: k + '_voar', frames: this.anims.generateFrameNames(k, { prefix: 'voar_', start: 0, end: 3 }), frameRate: 10, repeat: -1 });
    }
    for (const d of DRONES) this.drone(d.k, d.x, d.y);
    const el = this.drone(ELITE.k, ELITE.x, ELITE.y);
    // aviso de área do elite: anel que pulsa + enchimento que cresce até o golpe
    this.aviso = this.add.image(ELITE.aviso.x, ELITE.aviso.y, 'aviso_area').setDepth(-1500).setAlpha(0.7);
    this.avisoEnche = this.add.image(ELITE.aviso.x, ELITE.aviso.y, 'aviso_area').setDepth(-1499).setAlpha(0.5).setScale(0);
    this.tweens.add({ targets: this.avisoEnche, scale: 1, duration: 1200, repeat: -1, ease: 'Linear' });
    this.tweens.add({ targets: this.aviso, alpha: 0.35, duration: 300, yoyo: true, repeat: -1 });
    if (el) {
      this.elite = el;
      this.add.image(ELITE.x, ELITE.y, 'marcador_alvo').setDepth(-1490);
      this.vidaElite = this.add.graphics().setDepth(5000);
    }

    // jogador
    this.sombraP = this.add.image(JOGADOR.x, JOGADOR.y, 'sombra').setAlpha(0.5);
    this.peao = this.add.sprite(JOGADOR.x, JOGADOR.y + 1, 'peao').setOrigin(0.5, 1).setLighting(true);
    this.peao.play('peao_parado_baixo');
    this.peaoE = this.seguirEmissivo(this.peao, 'peao');

    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    cam.startFollow(this.peao, true, 0.15, 0.15, 0, 18);
    cam.setRoundPixels(true);
    if (q.get('quant') !== '0') cam.filters.external.addQuantize({ steps: [28, 28, 28, 32], dither: true, mode: 0 });

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,N') as Record<string, Phaser.Input.Keyboard.Key>;
    this.keys['N']!.on('down', () => (this.hora = (this.hora + 2) % 24));

    // HUD
    this.hud = montarHud(document.getElementById('hud')!);
    const f = this.textures.getFrame('peao', 'parado_baixo_0');
    if (f) this.hud.setRetrato(f.source.image as CanvasImageSource, f.cutX + 4, f.cutY + 2, 24, 24);
    for (const k of ['icone_laco', 'icone_chifre', 'icone_chapeu', 'icone_especial', 'icone_garrafada'])
      if (this.tem(k)) this.hud.setIcone(k, this.textures.get(k).getSourceImage() as CanvasImageSource);
    this.time.addEvent({ delay: 250, loop: true, callback: () => this.mapa() });
    this.mapa();
    this.aplicarCeu(0);
    const cv = this.game.canvas;
    cssTela(cv);
    (window as unknown as { __escala: string }).__escala = `canvas ${cv.width}x${cv.height}, css ${cv.style.width}x${cv.style.height}, px/arte ${ART}`;
    (window as unknown as { __pronto: boolean }).__pronto = true;
  }

  peca(p: Peca, depth?: number) {
    const img = this.add.image(p.x, p.y, p.k).setOrigin(0.5, 1).setDepth(depth ?? p.y + (p.z ?? 0)).setLighting(true).setFlipX(!!p.flip);
    if (this.tem(p.k + '_e')) {
      const e = this.add.image(p.x, p.y, p.k + '_e').setOrigin(0.5, 1).setDepth(img.depth + 0.1).setBlendMode(Phaser.BlendModes.ADD).setFlipX(!!p.flip);
      const hk = this.halo(p.k + '_e');
      const h = hk ? this.add.image(p.x, p.y + 10, hk).setOrigin(0.5, 1).setDepth(img.depth + 0.2).setBlendMode(Phaser.BlendModes.ADD).setFlipX(!!p.flip) : undefined;
      this.brilhos.push({ img: e, halo: h, base: 1, fase: Math.random() * 10 });
    }
    if (p.bloqueia) this.bloqueios.push(new Phaser.Geom.Rectangle(p.x + p.bloqueia[0], p.y + p.bloqueia[1], p.bloqueia[2], p.bloqueia[3]));
    if (p.luz) {
      const [dx, dy, r, c, i] = p.luz;
      this.luzes.push({ l: this.lights.addLight(p.x + (p.flip ? -dx : dx), p.y + dy, r, c, i), i, fase: Math.random() * 10 });
    }
    return img;
  }

  /** Sprite emissivo (olho do drone, erva da Benzedeira) que segue o quadro do boneco. */
  seguirEmissivo(s: Phaser.GameObjects.Sprite, k: string): Phaser.GameObjects.Sprite | null {
    if (!this.tem(k + '_e')) return null;
    const e = this.add.sprite(s.x, s.y, k + '_e').setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD);
    const sync = () => {
      e.setPosition(s.x, s.y).setDepth(s.depth + 0.1).setFlipX(s.flipX);
      const fr = s.frame.name;
      if (this.textures.get(k + '_e').has(fr)) e.setFrame(fr);
    };
    this.events.on('postupdate', sync);
    sync();
    this.brilhos.push({ img: e, base: 1, fase: Math.random() * 10 });
    return e;
  }

  criarAnims(k: string) {
    if (!this.tem(k)) return;
    const nomes = this.textures.get(k).getFrameNames();
    const grupos = new Map<string, string[]>();
    for (const n of nomes) {
      const m = /^(.*)_(\d+)$/.exec(n);
      if (!m) continue;
      const g = grupos.get(m[1]!) ?? [];
      g.push(n);
      grupos.set(m[1]!, g);
    }
    for (const [g, fr] of grupos) {
      fr.sort((a, b) => Number(a.split('_').pop()) - Number(b.split('_').pop()));
      const rate = g.startsWith('andar') ? 10 : g.startsWith('parado') ? 2.5 : 10;
      this.anims.create({ key: `${k}_${g}`, frames: fr.map((frame) => ({ key: k, frame })), frameRate: rate, repeat: g.startsWith('ataque') ? 0 : -1 });
    }
  }

  drone(k: string, x: number, y: number) {
    if (!this.tem(k)) return null;
    const sb = this.add.image(x, y, 'sombra').setAlpha(0.35).setDepth(y - 0.5).setScale(k === 'drone_elite' ? 1.2 : 0.8);
    const s = this.add.sprite(x, y - 16, k).setOrigin(0.5, 1).setDepth(y).setLighting(true);
    if (this.anims.exists(k + '_voar')) s.play({ key: k + '_voar', delay: Math.random() * 300 });
    const e = this.seguirEmissivo(s, k);
    this.drones.push({ s, sb, y, fase: Math.random() * 6, e });
    this.luzes.push({ l: this.lights.addLight(x, y - 24, 50, 0xff3030, 1), i: 1, fase: Math.random() * 10 });
    return s;
  }

  aplicarCeu(t: number) {
    const { amb, luz } = ceu(this.hora);
    this.lights.setAmbientColor(amb);
    for (const L of this.luzes) {
      const tremor = 1 + Math.sin(t / 170 + L.fase) * 0.04 + Math.sin(t / 53 + L.fase * 3) * 0.03;
      L.l.intensity = L.i * luz * tremor;
    }
    for (const b of this.brilhos) {
      const a = Math.min(1, 0.55 + luz * 0.45) * (0.9 + Math.sin(t / 240 + b.fase) * 0.1);
      b.img.setAlpha(a);
      b.halo?.setAlpha(Math.min(1, 0.25 + luz * 0.55) * (0.85 + Math.sin(t / 300 + b.fase) * 0.15));
    }
    this.hud?.setHora(this.hora);
  }

  livre(x: number, y: number) {
    if (x < 6 || y < 20 || x > MUNDO.w - 6 || y > MUNDO.h - 4) return false;
    for (const r of this.bloqueios) if (r.contains(x - 5, y) || r.contains(x + 5, y) || r.contains(x, y - 3)) return false;
    return true;
  }

  update(t: number, dtMs: number) {
    const dt = Math.min(0.05, dtMs / 1000);
    if (q.get('ciclo') === '1') this.hora = (this.hora + dt * (24 / 90)) % 24;
    this.aplicarCeu(t);
    this.agua.tilePositionY -= dt * 22;

    // movimento livre (joystick ou teclado)
    const k = this.keys;
    let vx = this.hud.joy.x + ((k['D']!.isDown || k['RIGHT']!.isDown ? 1 : 0) - (k['A']!.isDown || k['LEFT']!.isDown ? 1 : 0));
    let vy = this.hud.joy.y + ((k['S']!.isDown || k['DOWN']!.isDown ? 1 : 0) - (k['W']!.isDown || k['UP']!.isDown ? 1 : 0));
    const auto = (window as unknown as { __andar?: { x: number; y: number } }).__andar;
    if (auto) { vx = auto.x; vy = auto.y; }
    const m = Math.hypot(vx, vy);
    if (m > 1) { vx /= m; vy /= m; }
    const v = 64;
    const p = this.peao;
    if (m > 0.1) {
      const nx = p.x + vx * v * dt, ny = p.y + vy * v * dt;
      if (this.livre(nx, p.y - 1)) p.x = nx;
      if (this.livre(p.x, ny - 1)) p.y = ny;
      if (Math.abs(vx) > Math.abs(vy) * 1.1) { this.dir = 'lado'; this.flip = vx < 0; } else this.dir = vy < 0 ? 'cima' : 'baixo';
      p.setFlipX(this.dir === 'lado' && this.flip);
      p.play(`peao_andar_${this.dir}`, true);
    } else p.play(`peao_parado_${this.dir}`, true);
    p.setDepth(p.y);
    this.sombraP.setPosition(Math.round(p.x), Math.round(p.y) - 1).setDepth(p.y - 0.5);

    // drones flutuando
    for (const d of this.drones) {
      const b = Math.round(Math.sin(t / 380 + d.fase) * 2.5);
      d.s.y = d.y - 16 + b;
      d.sb.setScale((d.s.texture.key === 'drone_elite' ? 1.2 : 0.8) * (1 - b * 0.03));
    }
    if (this.elite) {
      const g = this.vidaElite.clear();
      const x = Math.round(this.elite.x - 14), y = Math.round(this.elite.y - this.elite.height - 6);
      g.fillStyle(0x1a0a0a).fillRect(x - 1, y - 1, 30, 5);
      g.fillStyle(0x5a1010).fillRect(x, y, 28, 3);
      g.fillStyle(0xe83a2a).fillRect(x, y, 19, 2);
      g.fillStyle(0xff8a6a).fillRect(x, y, 19, 1);
      g.fillStyle(0xffd040).fillRect(x - 4, y - 1, 3, 3);
    }
  }

  mapa() {
    const p = this.peao;
    if (!p) return;
    const chao = this.textures.get('chao').getSourceImage() as HTMLImageElement;
    const R = 160; // raio em px de mundo
    this.hud.desenharMapa((c) => {
      c.fillStyle = '#1d5a86';
      c.fillRect(0, 0, 52, 52);
      c.drawImage(chao, p.x - R, p.y - R, R * 2, R * 2, 0, 0, 52, 52);
      const pt = (x: number, y: number, cor: string, s = 2) => {
        c.fillStyle = cor;
        c.fillRect(Math.round(((x - p.x + R) / (R * 2)) * 52 - s / 2), Math.round(((y - p.y + R) / (R * 2)) * 52 - s / 2), s, s);
      };
      for (const n of NPCS) pt(n.x, n.y, '#ffe060');
      for (const d of this.drones) pt(d.s.x, d.y, '#ff3a3a');
      pt(p.x, p.y, '#ffffff', 3);
    });
  }
}

/** O canvas tem px de arte; o CSS estica para a tela inteira (o Phaser 4 não aplica o zoom no estilo). */
function cssTela(cv: HTMLCanvasElement) {
  cv.style.width = (cv.width * ART) / DPR + 'px';
  cv.style.height = (cv.height * ART) / DPR + 'px';
}

async function iniciar() {
  const man = (await (await fetch(BASE + 'manifest.json', { cache: 'no-store' })).json()) as Manifesto;
  const s = tamanho();
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: 'jogo',
    backgroundColor: '#0d0b10',
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    scale: { mode: Phaser.Scale.NONE, width: s.w, height: s.h, zoom: ART / DPR },
    fps: { target: 60 },
    banner: false,
    scene: [],
  });
  game.scene.add('ponte', Ponte, true, { man });
  addEventListener('resize', () => {
    const n = tamanho();
    game.scale.resize(n.w, n.h);
    cssTela(game.canvas);
  });
}
void iniciar();
