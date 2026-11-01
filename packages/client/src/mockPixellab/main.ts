/**
 * Mock do caminho "PixelLab com a referência" (abre em /mock-pixellab.html). Usa a arte de referência
 * que já temos como se fosse a saída do PixelLab: a tela docs/alvo-tela.png de fundo (sem o caubói
 * pintado) e os quadros de docs/alvo-personagens.png, recortados por tools/art/mock-pixellab.mjs.
 * O Peão anda pelo joystick (ou WASD) nas 4 direções; a Idol, o PM e a Benzedeira do fundo ficam
 * parados; o drone tem o aviso de área no chão. Não é saída do PixelLab: é o alvo, rodando no motor.
 * Exceção: o Peão controlável agora é o gerado pelo PixelLab (pl_<dir>_<i>, de
 * tools/art/mock-pixellab-pl.mjs), com andar nas 4 direções. `?peao=ref` volta ao recortado e
 * `?comparar=1` põe o Peão da referência parado ao lado, para comparar.
 */
import * as Phaser from 'phaser4';
import { montarHud, type Hud } from '../testeVisual/hud';

const BASE = import.meta.env.BASE_URL;
const q = new URLSearchParams(location.search);
const DPR = Math.min(3, Number(q.get('dpr')) || window.devicePixelRatio || 1);
interface Man { quadros: Record<string, { w: number; h: number }>; fundo: [number, number]; pl?: { w: number; h: number; quadros: string[] } }
// direção do jogo → direção do PixelLab (que desenha leste e oeste, sem espelhar)
const PL_DIR: Record<string, string> = { baixo: 'south', cima: 'north', direita: 'east', esquerda: 'west' };

class Mock extends Phaser.Scene {
  man!: Man;
  hud!: Hud;
  peao!: Phaser.GameObjects.Sprite;
  sombra!: Phaser.GameObjects.Ellipse;
  dir = 'baixo';
  pl = false;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  constructor() {
    super('mock');
  }
  init(d: { man: Man }) {
    this.man = d.man;
  }
  preload() {
    this.load.image('fundo', BASE + 'mock-pixellab/fundo.png');
    for (const k of Object.keys(this.man.quadros)) this.load.image(k, BASE + 'mock-pixellab/' + k + '.png');
    this.pl = !!this.man.pl && q.get('peao') !== 'ref';
    for (const k of this.man.pl?.quadros ?? []) this.load.image(k, BASE + 'mock-pixellab/' + k + '.png');
    for (const k of ['icone_laco', 'icone_chifre', 'icone_chapeu', 'icone_especial', 'icone_garrafada']) this.load.image(k, BASE + 'teste-visual/' + k + '.png');
  }
  create() {
    const [W, H] = this.man.fundo;
    this.add.image(0, 0, 'fundo').setOrigin(0, 0);
    for (const dir of ['baixo', 'cima', 'lado']) {
      const fr = [0, 1, 2, 3].map((i) => `peao_${dir}_${i}`).filter((k) => this.textures.exists(k));
      this.anims.create({ key: `andar_${dir}`, frames: fr.map((key) => ({ key })), frameRate: 7, repeat: -1 });
    }
    for (const [dir, pd] of Object.entries(PL_DIR)) {
      const fr = (this.man.pl?.quadros ?? []).filter((k) => k.startsWith(`pl_${pd}_`));
      if (fr.length) this.anims.create({ key: `pl_andar_${dir}`, frames: fr.map((key) => ({ key })), frameRate: 9, repeat: -1 });
    }
    // aviso de área do drone (pulsando) e sombra do Peão
    const av = this.add.ellipse(255, 410, 92, 34, 0xff3020, 0.18).setStrokeStyle(2, 0xff5040, 0.9);
    this.tweens.add({ targets: av, alpha: 0.45, duration: 280, yoyo: true, repeat: -1 });
    this.sombra = this.add.ellipse(0, 0, 40, 12, 0x000000, 0.35);
    const alt = 127; // altura do caubói na tela-alvo
    const f0 = this.man.quadros['peao_baixo_0']!;
    if (q.get('comparar') === '1') {
      // Peão da referência parado ao lado, na mesma escala, para comparar
      this.add.ellipse(196, 430, 40, 12, 0x000000, 0.35);
      this.add.sprite(196, 432, 'peao_baixo_0').setOrigin(0.5, 0.97).setScale(alt / f0.h);
    }
    if (this.pl) {
      // mesma altura de boneco da referência (o quadro dela tem 2 px de folga em cima e embaixo)
      const h = this.man.pl!.h - 2, hRef = (f0.h - 4) * (alt / f0.h);
      this.peao = this.add.sprite(q.get('comparar') === '1' ? 268 : 238, 432, 'pl_south_0').setOrigin(0.5, 1).setScale(hRef / h);
    } else this.peao = this.add.sprite(238, 432, 'peao_baixo_0').setOrigin(0.5, 0.97).setScale(alt / f0.h);

    const cam = this.cameras.main;
    const s = Math.max(innerWidth / W, innerHeight / H);
    cam.setZoom(DPR * s);
    cam.setBounds(0, 0, W, H);
    cam.startFollow(this.peao, true, 0.1, 0.1);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    this.hud = montarHud(document.getElementById('hud')!);
    const f = this.textures.get(this.peao.texture.key).getSourceImage() as HTMLImageElement;
    this.hud.setRetrato(f, f.width * 0.18, 0, f.width * 0.64, f.width * 0.64);
    for (const k of ['icone_laco', 'icone_chifre', 'icone_chapeu', 'icone_especial', 'icone_garrafada'])
      if (this.textures.exists(k)) this.hud.setIcone(k, this.textures.get(k).getSourceImage() as CanvasImageSource);
    const fundo = this.textures.get('fundo').getSourceImage() as HTMLImageElement;
    this.time.addEvent({ delay: 250, loop: true, callback: () => this.hud.desenharMapa((c) => {
      const R = 120;
      c.drawImage(fundo, this.peao.x - R, this.peao.y - R, R * 2, R * 2, 0, 0, 52, 52);
      c.fillStyle = '#fff';
      c.fillRect(25, 25, 3, 3);
    }) });
    (window as unknown as { __pronto: boolean }).__pronto = true;
  }
  livre(x: number, y: number) {
    const [W, H] = this.man.fundo;
    if (x < 10 || x > W - 10 || y < 60 || y > H - 10) return false;
    const rio = x > 150 && x < 300;
    const ponte = y > 352 && y < 446;
    return !rio || ponte;
  }
  update(_t: number, dtMs: number) {
    const dt = Math.min(0.05, dtMs / 1000);
    const k = this.keys;
    let vx = this.hud.joy.x + ((k['D']!.isDown || k['RIGHT']!.isDown ? 1 : 0) - (k['A']!.isDown || k['LEFT']!.isDown ? 1 : 0));
    let vy = this.hud.joy.y + ((k['S']!.isDown || k['DOWN']!.isDown ? 1 : 0) - (k['W']!.isDown || k['UP']!.isDown ? 1 : 0));
    const auto = (window as unknown as { __andar?: { x: number; y: number } }).__andar;
    if (auto) { vx = auto.x; vy = auto.y; }
    const m = Math.hypot(vx, vy);
    if (m > 1) { vx /= m; vy /= m; }
    const p = this.peao;
    if (m > 0.1) {
      const v = 70;
      const nx = p.x + vx * v * dt, ny = p.y + vy * v * dt;
      if (this.livre(nx, p.y)) p.x = nx;
      if (this.livre(p.x, ny)) p.y = ny;
      const lado = Math.abs(vx) > Math.abs(vy) * 1.1;
      if (this.pl) {
        this.dir = lado ? (vx > 0 ? 'direita' : 'esquerda') : vy < 0 ? 'cima' : 'baixo';
        if (this.anims.exists(`pl_andar_${this.dir}`)) p.play(`pl_andar_${this.dir}`, true);
        else p.setTexture(`pl_south_0`);
      } else {
        // a folha desenha o lado virado para a esquerda; a direita sai espelhada
        if (lado) { this.dir = 'lado'; p.setFlipX(vx > 0); } else { this.dir = vy < 0 ? 'cima' : 'baixo'; p.setFlipX(false); }
        p.play(`andar_${this.dir}`, true);
      }
    } else {
      p.stop();
      if (this.pl) {
        const k = `pl_${PL_DIR[this.dir]}_0`;
        p.setTexture(this.textures.exists(k) ? k : 'pl_south_0');
      } else p.setTexture(`peao_${this.dir}_0`);
    }
    this.sombra.setPosition(p.x, p.y - 2);
  }
}

async function iniciar() {
  const man = (await (await fetch(BASE + 'mock-pixellab/manifest.json', { cache: 'no-store' })).json()) as Man;
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: 'jogo',
    backgroundColor: '#0d0b10',
    pixelArt: true,
    scale: { mode: Phaser.Scale.NONE, width: Math.round(innerWidth * DPR), height: Math.round(innerHeight * DPR) },
    banner: false,
    scene: [],
  });
  const css = () => {
    game.canvas.style.width = innerWidth + 'px';
    game.canvas.style.height = innerHeight + 'px';
  };
  game.events.once('ready', css);
  game.scene.add('mock', Mock, true, { man });
}
void iniciar();
