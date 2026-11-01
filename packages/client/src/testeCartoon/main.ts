/**
 * Cena de teste visual cartoon da Ponte do Rio Claro (repaginação inspirada em Brawl Stars e
 * Ravenswatch), em Phaser 4. Abre em /teste-cartoon.html. Só visual: nenhum sistema de jogo roda.
 *
 * - Arte 2D lisa gerada em SVG por tools/art/cartoon e rasterizada em 3x (1,5x no chão). O canvas
 *   tem a resolução física da tela e a câmera usa zoom = dpr, então 1 u = 1 px de CSS.
 * - Bonecos articulados (rig.ts) animados por código.
 * - Luz do Phaser 4 (ambiente de fim de tarde + luzes pontuais), ciclo de dia e noite (?hora=18.6,
 *   ?ciclo=1, tecla N). Brilho só no que brilha (<peça>_e.png em ADD) e bloom leve na câmera
 *   (?bloom=0 desliga). Sombras: mancha suave no pé e sombra projetada para baixo à direita.
 * - Partículas: vaga-lumes e pétalas na Esquerda, vapor e faíscas na Direita, névoa na cascata.
 */
import * as Phaser from 'phaser4';
import { montarHud, type Hud } from './hud';
import { CASCATA, DRONES, ELITE, JOGADOR, MUNDO, NPCS, PECAS, type Peca } from './layout';
import { Boneco, type InfoPeca, type Rig } from './rig';

const BASE = import.meta.env.BASE_URL + 'teste-cartoon/';
const q = new URLSearchParams(location.search);
const DPR = Math.min(3, Number(q.get('dpr')) || window.devicePixelRatio || 1);

// [hora, ambiente, força das luzes]
const CEU: [number, number, number][] = [
  [0, 0x343a70, 1.3], [5, 0x444478, 1.2], [7, 0xc8c0d8, 0.4], [10, 0xffffff, 0.2], [15, 0xfff8ec, 0.25],
  [17.5, 0xf0d4b8, 0.6], [18.6, 0xd8b0a4, 0.9], [19.6, 0xa090c0, 1.05], [21, 0x50548c, 1.25], [24, 0x343a70, 1.3],
];
function ceu(h: number) {
  h = ((h % 24) + 24) % 24;
  let i = 0;
  while (i < CEU.length - 2 && CEU[i + 1]![0] <= h) i++;
  const [h0, c0, l0] = CEU[i]!, [h1, c1, l1] = CEU[i + 1]!;
  const t = (h - h0) / (h1 - h0);
  const m = (s: number) => Math.round(((c0 >> s) & 255) + (((c1 >> s) & 255) - ((c0 >> s) & 255)) * t);
  return { amb: (m(16) << 16) | (m(8) << 8) | m(0), luz: l0 + (l1 - l0) * t };
}

type Manif = Record<string, InfoPeca>;
interface Luz { l: Phaser.GameObjects.Light; i: number; fase: number; pisca?: boolean }
/** Luz que falha: quase sempre acesa, com quedas curtas e irregulares (rede elétrica no limite). */
function falha(t: number, fase: number): number {
  const s = Math.sin(t / 900 + fase * 7) + Math.sin(t / 370 + fase * 3);
  if (s > 1.55) return 0.08;
  if (s > 1.35) return (Math.floor(t / 60) % 2) ? 0.2 : 1;
  return 1;
}

class Ponte extends Phaser.Scene {
  info: Manif = {};
  rigs: Record<string, Rig> = {};
  hud!: Hud;
  peao!: Boneco;
  sombraP!: Phaser.GameObjects.Image;
  bonecos: Boneco[] = [];
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  luzes: Luz[] = [];
  emissivos: Phaser.GameObjects.Image[] = [];
  piscantes: { e: Phaser.GameObjects.Image; fase: number }[] = [];
  bloqueios: Phaser.Geom.Rectangle[] = [];
  agua!: Phaser.GameObjects.TileSprite;
  hora = Number(q.get('hora') ?? 18.6);
  drones: { b: Boneco; sb: Phaser.GameObjects.Image; y: number; fase: number }[] = [];
  elite: Boneco | null = null;
  vidaElite!: Phaser.GameObjects.Graphics;

  constructor() {
    super('ponte');
  }
  init(d: { info: Manif; rigs: Record<string, Rig> }) {
    this.info = d.info;
    this.rigs = d.rigs;
  }
  preload() {
    for (const [k, m] of Object.entries(this.info)) {
      this.load.image(k, BASE + k + '.png');
      if (m.e) this.load.image(k + '_e', BASE + k + '_e.png');
    }
  }
  tem(k: string) {
    return this.textures.exists(k);
  }

  /** Texturas feitas na hora: sombra suave, aviso de área, marcador, partículas. */
  texturas() {
    const canvas = (k: string, w: number, h: number, f: (g: CanvasRenderingContext2D) => void) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      f(c.getContext('2d')!);
      this.textures.addCanvas(k, c);
    };
    canvas('sombra', 128, 64, (g) => {
      const r = g.createRadialGradient(64, 32, 0, 64, 32, 64);
      r.addColorStop(0, 'rgba(10,6,20,0.75)');
      r.addColorStop(0.55, 'rgba(10,6,20,0.45)');
      r.addColorStop(1, 'rgba(10,6,20,0)');
      g.setTransform(1, 0, 0, 0.5, 0, 16);
      g.fillStyle = r;
      g.fillRect(0, 0, 128, 128);
    });
    canvas('aviso', 360, 180, (g) => {
      g.translate(180, 90);
      g.scale(1, 0.5);
      const r = g.createRadialGradient(0, 0, 40, 0, 0, 170);
      r.addColorStop(0, 'rgba(255,60,40,0.10)');
      r.addColorStop(1, 'rgba(255,40,30,0.45)');
      g.fillStyle = r;
      g.beginPath(); g.arc(0, 0, 170, 0, Math.PI * 2); g.fill();
      g.lineWidth = 12; g.strokeStyle = '#5a0a10'; g.stroke();
      g.lineWidth = 7; g.strokeStyle = '#ff4a3a'; g.stroke();
      g.setLineDash([22, 16]); g.lineWidth = 4; g.strokeStyle = '#ffd0c0';
      g.beginPath(); g.arc(0, 0, 150, 0, Math.PI * 2); g.stroke();
    });
    canvas('aviso_enche', 360, 180, (g) => {
      g.translate(180, 90); g.scale(1, 0.5);
      g.fillStyle = 'rgba(255,70,40,0.35)';
      g.beginPath(); g.arc(0, 0, 170, 0, Math.PI * 2); g.fill();
    });
    canvas('marcador', 160, 80, (g) => {
      g.translate(80, 40); g.scale(1, 0.5);
      g.lineCap = 'round';
      for (let k = 0; k < 4; k++) {
        const a = k * (Math.PI / 2) + Math.PI / 4;
        for (const [w, c] of [[14, '#3a2008'], [8, '#ffd23a']] as const) {
          g.lineWidth = w; g.strokeStyle = c;
          g.beginPath(); g.arc(0, 0, 66, a - 0.38, a + 0.38); g.stroke();
        }
      }
    });
    canvas('ponto', 24, 24, (g) => {
      const r = g.createRadialGradient(12, 12, 0, 12, 12, 12);
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(0.3, 'rgba(255,255,255,0.8)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, 24, 24);
    });
    canvas('fumaca', 64, 64, (g) => {
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, 'rgba(235,235,245,0.75)');
      r.addColorStop(0.6, 'rgba(220,220,235,0.35)');
      r.addColorStop(1, 'rgba(220,220,235,0)');
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    });
    canvas('petala', 12, 8, (g) => {
      g.fillStyle = '#d68cff'; g.beginPath(); g.ellipse(6, 4, 5, 3, 0.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f4d0ff'; g.beginPath(); g.ellipse(5, 3, 2, 1.2, 0.4, 0, Math.PI * 2); g.fill();
    });
  }

  /** Sombra projetada (luz de cima à esquerda): silhueta achatada e inclinada para a direita, desfocada. */
  sombraProjetada(k: string, flip: boolean): string | null {
    const sk = `${k}_proj${flip ? 'f' : ''}`;
    if (this.tem(sk)) return sk;
    const src = this.textures.get(k).getSourceImage() as HTMLImageElement;
    const w = src.width, h = src.height;
    const sil = document.createElement('canvas');
    sil.width = w; sil.height = h;
    const s = sil.getContext('2d')!;
    if (flip) { s.translate(w, 0); s.scale(-1, 1); }
    s.drawImage(src, 0, 0);
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = '#140a24';
    s.fillRect(0, 0, w, h);
    const ky = 0.32, kx = 0.55, P = 24;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w + h * kx + P * 2);
    c.height = Math.ceil(h * ky + P * 2);
    const g = c.getContext('2d')!;
    g.filter = 'blur(5px)';
    // ponto (sx, sy) da imagem → (sx + (h - sy)·kx, (sy - h)·(-ky))   (base fica na linha P)
    g.setTransform(1, 0, -kx, -ky, P + h * kx, P + h * ky);
    g.drawImage(sil, 0, 0);
    this.textures.addCanvas(sk, c);
    return sk;
  }

  create() {
    this.texturas();
    this.lights.enable();
    const W = MUNDO.w, H = MUNDO.h;
    const iC = this.info['chao']!, iA = this.info['agua']!;
    this.agua = this.add.tileSprite(MUNDO.rioX0, 0, (MUNDO.rioX1 - MUNDO.rioX0) * iA.escala, H * iA.escala, 'agua').setOrigin(0, 0).setScale(1 / iA.escala).setDepth(-3000).setLighting(true);
    this.add.image(0, 0, 'chao').setOrigin(0, 0).setScale(1 / iC.escala).setDepth(-2900).setLighting(true);

    // cascata
    const cq = [0, 1, 2, 3].map((i) => `cascata_${i}`).filter((k) => this.tem(k));
    if (cq.length) {
      this.anims.create({ key: 'cascata', frames: cq.map((key) => ({ key })), frameRate: 9, repeat: -1 });
      const i = this.info[cq[0]!]!;
      this.add.sprite(CASCATA.x, CASCATA.y, cq[0]!).setOrigin(i.ax, i.ay).setScale(1 / i.escala).setDepth(-2500).setLighting(true).play('cascata');
    }
    // ponte: chão por baixo dos bonecos, grade da frente por cima
    const px = (MUNDO.rioX0 + MUNDO.rioX1) / 2;
    const pInfo = this.info['ponte_chao'];
    const ponteBase = MUNDO.ponteY + 50;
    if (pInfo) this.peca({ k: 'ponte_chao', x: px, y: ponteBase, plana: true }, -2400);
    if (this.tem('ponte_grade_frente')) this.peca({ k: 'ponte_grade_frente', x: px, y: ponteBase, plana: true }, ponteBase + 4);

    for (const p of PECAS) if (this.tem(p.k)) this.peca(p);

    // o rio bloqueia, menos o tabuleiro da ponte
    const faixa = pInfo ? [ponteBase - pInfo.h * 0.68, ponteBase - pInfo.h * 0.17] : [MUNDO.ponteY - 30, MUNDO.ponteY + 30];
    this.bloqueios.push(new Phaser.Geom.Rectangle(MUNDO.rioX0 + 8, 0, MUNDO.rioX1 - MUNDO.rioX0 - 16, faixa[0]!));
    this.bloqueios.push(new Phaser.Geom.Rectangle(MUNDO.rioX0 + 8, faixa[1]!, MUNDO.rioX1 - MUNDO.rioX0 - 16, H));

    // bonecos
    for (const n of NPCS) {
      const b = this.boneco(n.k, n.x, n.y);
      if (b) b.olhar(n.dir, n.flip);
    }
    for (const d of DRONES) this.drone(d.k, d.x, d.y);
    this.elite = this.drone(ELITE.k, ELITE.x, ELITE.y);
    const av = this.add.image(ELITE.aviso.x, ELITE.aviso.y, 'aviso').setScale(0.42).setDepth(-2300).setAlpha(0.9);
    const en = this.add.image(ELITE.aviso.x, ELITE.aviso.y, 'aviso_enche').setScale(0).setDepth(-2299);
    this.tweens.add({ targets: en, scale: 0.42, duration: 1300, repeat: -1 });
    this.tweens.add({ targets: av, alpha: 0.55, duration: 260, yoyo: true, repeat: -1 });
    if (this.elite) {
      this.add.image(ELITE.x, ELITE.y, 'marcador').setScale(0.42).setDepth(-2290);
      this.vidaElite = this.add.graphics().setDepth(9000);
    }
    this.peao = this.boneco('peao', JOGADOR.x, JOGADOR.y)!;

    this.particulas();

    const cam = this.cameras.main;
    // ~520 u de largura num celular de 390 px: boneco com ~16% da largura, como no alvo
    cam.setZoom(DPR * (Number(q.get('zoom')) || 0.75));
    cam.setBounds(0, 0, W, H);
    if (this.peao) cam.startFollow(this.peao.c, false, 0.12, 0.12, 0, 30);
    else cam.centerOn(JOGADOR.x, JOGADOR.y - 30);
    if (q.get('bloom') !== '0') Phaser.Actions.AddEffectBloom(cam, { threshold: 0.9, blurRadius: 3, blurSteps: 3, blendAmount: 0.4 });

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,N,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    this.keys['N']!.on('down', () => (this.hora = (this.hora + 2) % 24));
    this.keys['SPACE']!.on('down', () => this.peao?.atacar());

    this.hud = montarHud(document.getElementById('hud')!);
    this.retrato();
    this.time.addEvent({ delay: 250, loop: true, callback: () => this.mapa() });
    this.mapa();
    this.aplicarCeu(0);
    (window as unknown as { __pronto: boolean }).__pronto = true;
  }

  peca(p: Peca, depth?: number) {
    const i = this.info[p.k]!;
    const d = depth ?? p.y + (p.z ?? 0);
    const img = this.add.image(p.x, p.y, p.k).setOrigin(i.ax, i.ay).setScale(1 / i.escala).setDepth(d).setLighting(true).setFlipX(!!p.flip);
    if (!p.plana) {
      // mancha de contato e sombra projetada
      this.add.image(p.x, p.y - 2, 'sombra').setDisplaySize(Math.min(i.w * 0.95, 260), Math.min(i.w * 0.3, 60)).setDepth(-2200).setAlpha(0.55);
      if (i.h > 34) {
        const sk = this.sombraProjetada(p.k, !!p.flip);
        if (sk) {
          const left = p.x - i.w * i.ax;
          this.add.image(left - 24 / i.escala, p.y - 24 / i.escala, sk).setOrigin(0, 0).setScale(1 / i.escala).setDepth(-2210).setAlpha(0.42);
        }
      }
    }
    // falta de energia: peça apagada não acende; a que pisca falha de vez em quando
    const fase = Math.random() * 10;
    if (i.e && this.tem(p.k + '_e') && p.energia !== 'apagado') {
      const e = this.add.image(p.x, p.y, p.k + '_e').setOrigin(i.ax, i.ay).setScale(1 / i.escala).setDepth(d + 0.2).setBlendMode(Phaser.BlendModes.ADD).setFlipX(!!p.flip);
      if (p.k.startsWith('pedra_runa')) e.setData('fator', 0.4);
      this.emissivos.push(e);
      if (p.energia === 'pisca') this.piscantes.push({ e, fase });
    }
    if (p.bloqueia) this.bloqueios.push(new Phaser.Geom.Rectangle(p.x + p.bloqueia[0], p.y + p.bloqueia[1], p.bloqueia[2], p.bloqueia[3]));
    if (p.luz && p.energia !== 'apagado') {
      const [dx, dy, r, c, int] = p.luz;
      this.luzes.push({ l: this.lights.addLight(p.x + (p.flip ? -dx : dx), p.y + dy, r, c, int), i: int, fase, pisca: p.energia === 'pisca' });
    }
    return img;
  }

  boneco(k: string, x: number, y: number): Boneco | null {
    const rig = this.rigs[k];
    if (!rig) return null;
    const b = new Boneco(this, rig, this.info, x, y, this.emissivos);
    b.c.setDepth(y);
    const sb = this.add.image(x, y, 'sombra').setDisplaySize(rig.altura * 0.62, rig.altura * 0.2).setDepth(-2100).setAlpha(0.7);
    b.c.setData('sombra', sb);
    this.bonecos.push(b);
    return b;
  }

  drone(k: string, x: number, y: number): Boneco | null {
    const rig = this.rigs[k];
    if (!rig) return null;
    const b = new Boneco(this, rig, this.info, x, y, this.emissivos);
    b.c.setDepth(y);
    const sb = this.add.image(x, y, 'sombra').setDisplaySize(rig.altura * 0.8, rig.altura * 0.25).setDepth(-2100).setAlpha(0.45);
    this.drones.push({ b, sb, y, fase: Math.random() * 6 });
    this.bonecos.push(b);
    this.luzes.push({ l: this.lights.addLight(x, y - 40, 80, 0xff3030, 1), i: 1, fase: Math.random() * 10 });
    return b;
  }

  particulas() {
    // guerra ao fundo: colunas de fumaça escura longe, fuligem no ar e brasas subindo
    for (const [x, y] of [[90, 420], [960, 330], [700, 120]] as const)
      this.add.particles(x, y, 'fumaca', {
        x: { min: -20, max: 20 }, lifespan: 9000, frequency: 260, speedY: { min: -30, max: -18 }, speedX: { min: 6, max: 16 },
        scale: { start: 1.2, end: 4.5 }, alpha: { start: 0.5, end: 0 }, tint: 0x2a2630,
      }).setDepth(7000);
    this.add.particles(0, 0, 'ponto', {
      x: { min: 0, max: 1000 }, y: { min: 500, max: 1600 }, lifespan: 7000, frequency: 70,
      speedX: { min: 8, max: 22 }, speedY: { min: 4, max: 14 }, scale: { min: 0.08, max: 0.16 }, alpha: { start: 0.55, end: 0 }, tint: 0x2e2a30,
    }).setDepth(8002);
    this.add.particles(0, 0, 'ponto', {
      x: { min: 0, max: 1000 }, y: { min: 700, max: 1700 }, lifespan: 3000, frequency: 600,
      speedX: { min: 4, max: 16 }, speedY: { min: -40, max: -20 }, scale: { start: 0.18, end: 0 }, tint: [0xff8a3a, 0xffc060], blendMode: 'ADD',
    }).setDepth(8003);
    // poucos vaga-lumes na Esquerda (a vida que resiste)
    this.add.particles(0, 0, 'ponto', {
      x: { min: 20, max: 440 }, y: { min: 650, max: 1500 }, lifespan: 4200, frequency: 450, quantity: 1,
      speedX: { min: -8, max: 8 }, speedY: { min: -12, max: 4 }, scale: { start: 0.35, end: 0.15 },
      alpha: { start: 0, end: 0, ease: (t: number) => Math.sin(t * Math.PI) }, tint: [0xd8ff70, 0xa8ff9a, 0xfff08a], blendMode: 'ADD',
    }).setDepth(8000);
    // pétalas da árvore roxa
    this.add.particles(230, 900, 'petala', {
      x: { min: -90, max: 90 }, y: { min: -40, max: 20 }, lifespan: 5000, frequency: 900, speedX: { min: 6, max: 22 }, speedY: { min: 10, max: 22 },
      rotate: { min: 0, max: 360 }, scale: { min: 0.7, max: 1 }, alpha: { start: 1, end: 0 },
    }).setDepth(8001);
    // vapor dos prédios e do bueiro
    for (const [x, y, f] of [[700, 640, 420], [820, 1000, 600], [980, 400, 500]] as const)
      this.add.particles(x, y, 'fumaca', {
        lifespan: 2600, frequency: f, speedY: { min: -26, max: -14 }, speedX: { min: -4, max: 10 }, scale: { start: 0.4, end: 1.3 }, alpha: { start: 0.55, end: 0 },
      }).setDepth(y + 1);
    // névoa na cascata
    this.add.particles(CASCATA.x, CASCATA.y + 6, 'fumaca', {
      x: { min: -45, max: 45 }, lifespan: 1600, frequency: 90, speedY: { min: -18, max: -4 }, speedX: { min: -14, max: 14 }, scale: { start: 0.5, end: 1.2 }, alpha: { start: 0.5, end: 0 },
    }).setDepth(-2400);
    // faíscas do neon
    this.add.particles(760, 760, 'ponto', {
      x: { min: -90, max: 90 }, lifespan: 700, frequency: 380, speedY: { min: 20, max: 60 }, speedX: { min: -30, max: 30 }, gravityY: 120,
      scale: { start: 0.25, end: 0 }, tint: [0xff60e0, 0x60f0ff], blendMode: 'ADD',
    }).setDepth(905);
  }

  retrato() {
    const n = this.rigs['peao']?.dirs.baixo?.find((p) => p.papel === 'cabeca');
    if (!n || !this.tem(n.img)) return;
    const src = this.textures.get(n.img).getSourceImage() as HTMLImageElement;
    const s = Math.max(src.width, src.height);
    this.hud.setRetrato(src, (src.width - s) / 2, (src.height - s) / 2 + s * 0.04, s, s);
  }

  aplicarCeu(t: number) {
    const { amb, luz } = ceu(this.hora);
    this.lights.setAmbientColor(amb);
    for (const L of this.luzes) L.l.intensity = L.i * luz * (1 + Math.sin(t / 170 + L.fase) * 0.04 + Math.sin(t / 53 + L.fase * 3) * 0.03) * (L.pisca ? falha(t, L.fase) : 1);
    const a = Math.min(0.8, 0.4 + luz * 0.4);
    for (const e of this.emissivos) e.setAlpha(a * ((e.getData('fator') as number | undefined) ?? 1));
    for (const p of this.piscantes) p.e.setAlpha(a * falha(t, p.fase));
    this.hud?.setHora(this.hora);
  }

  livre(x: number, y: number) {
    if (x < 10 || y < 30 || x > MUNDO.w - 10 || y > MUNDO.h - 10) return false;
    for (const r of this.bloqueios) if (r.contains(x - 10, y) || r.contains(x + 10, y) || r.contains(x, y - 4)) return false;
    return true;
  }

  update(t: number, dtMs: number) {
    const dt = Math.min(0.05, dtMs / 1000);
    if (q.get('ciclo') === '1') this.hora = (this.hora + dt * (24 / 90)) % 24;
    this.aplicarCeu(t);
    this.agua.tilePositionY -= dt * 40 * this.info['agua']!.escala;

    const k = this.keys;
    let vx = this.hud.joy.x + ((k['D']!.isDown || k['RIGHT']!.isDown ? 1 : 0) - (k['A']!.isDown || k['LEFT']!.isDown ? 1 : 0));
    let vy = this.hud.joy.y + ((k['S']!.isDown || k['DOWN']!.isDown ? 1 : 0) - (k['W']!.isDown || k['UP']!.isDown ? 1 : 0));
    const auto = (window as unknown as { __andar?: { x: number; y: number } }).__andar;
    if (auto) { vx = auto.x; vy = auto.y; }
    const m = Math.hypot(vx, vy);
    if (m > 1) { vx /= m; vy /= m; }
    const p = this.peao;
    if (p) {
      const c = p.c;
      p.anda = m > 0.1;
      if (p.anda) {
        const v = 130;
        const nx = c.x + vx * v * dt, ny = c.y + vy * v * dt;
        if (this.livre(nx, c.y - 1)) c.x = nx;
        if (this.livre(c.x, ny - 1)) c.y = ny;
        if (Math.abs(vx) > Math.abs(vy) * 1.1) p.olhar('lado', vx < 0);
        else p.olhar(vy < 0 ? 'cima' : 'baixo', false);
      }
      c.setDepth(c.y);
    }
    for (const b of this.bonecos) {
      b.update(t, dt);
      const sb = b.c.getData('sombra') as Phaser.GameObjects.Image | undefined;
      sb?.setPosition(b.c.x, b.c.y);
    }
    for (const d of this.drones) d.sb.setPosition(d.b.c.x, d.y);
    if (this.elite) {
      const g = this.vidaElite.clear();
      const x = this.elite.c.x - 30, y = this.elite.c.y - 78;
      g.fillStyle(0x1a0a10).fillRoundedRect(x - 3, y - 3, 66, 12, 5);
      g.fillStyle(0x4a1018).fillRoundedRect(x, y, 60, 6, 3);
      g.fillStyle(0xff4a3a).fillRoundedRect(x, y, 40, 6, 3);
      g.fillStyle(0xffa090).fillRect(x + 3, y + 1, 34, 1.5);
      g.fillStyle(0xffd23a).fillCircle(x - 6, y + 3, 6);
      g.lineStyle(2, 0x3a2008).strokeCircle(x - 6, y + 3, 6);
    }
  }

  mapa() {
    const p = this.peao?.c;
    if (!p) return;
    const chao = this.textures.get('chao').getSourceImage() as HTMLImageElement;
    const es = this.info['chao']!.escala;
    const R = 300, S = 312;
    this.hud.desenharMapa((c) => {
      c.fillStyle = '#2a8fc0';
      c.fillRect(0, 0, S, S);
      c.drawImage(chao, (p.x - R) * es, (p.y - R) * es, R * 2 * es, R * 2 * es, 0, 0, S, S);
      const pt = (x: number, y: number, cor: string, s = 14) => {
        const X = ((x - p.x + R) / (R * 2)) * S, Y = ((y - p.y + R) / (R * 2)) * S;
        c.fillStyle = '#1a1020'; c.beginPath(); c.arc(X, Y, s / 2 + 3, 0, Math.PI * 2); c.fill();
        c.fillStyle = cor; c.beginPath(); c.arc(X, Y, s / 2, 0, Math.PI * 2); c.fill();
      };
      for (const n of NPCS) pt(n.x, n.y, '#ffd23a');
      for (const d of this.drones) pt(d.b.c.x, d.y, '#ff4a3a');
      pt(p.x, p.y, '#ffffff', 18);
    });
  }
}

async function json<T>(f: string): Promise<T | null> {
  try {
    const r = await fetch(BASE + f, { cache: 'no-store' });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

async function iniciar() {
  const partes = await Promise.all(['pecas-chao.json', 'pecas-cenario.json', 'pecas-bonecos.json', 'pecas-icones.json'].map((f) => json<Manif>(f)));
  const info = Object.assign({}, ...partes.filter(Boolean)) as Manif;
  const rigs = (await json<Record<string, Rig>>('rigs.json')) ?? {};
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: 'jogo',
    backgroundColor: '#0d0b10',
    antialias: true,
    scale: { mode: Phaser.Scale.NONE, width: Math.round(innerWidth * DPR), height: Math.round(innerHeight * DPR) },
    fps: { target: 60 },
    banner: false,
    scene: [],
  });
  const css = () => {
    game.canvas.style.width = innerWidth + 'px';
    game.canvas.style.height = innerHeight + 'px';
  };
  game.events.once('ready', css);
  game.scene.add('ponte', Ponte, true, { info, rigs });
  addEventListener('resize', () => {
    game.scale.resize(Math.round(innerWidth * DPR), Math.round(innerHeight * DPR));
    css();
  });
}
void iniciar();
