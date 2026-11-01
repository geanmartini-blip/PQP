/**
 * Boneco articulado (rig 2D): peças separadas (tronco, cabeça, braços, pernas, cabelo, item) com a
 * âncora na junta, montadas pelo rigs.json gerado em tools/art/cartoon/personagens.mjs e animadas
 * por código (parado respirando, andar com passo e balanço, ataque, hélice). Uma pose por direção
 * (baixo, cima, lado); a esquerda é o lado espelhado.
 */
import * as Phaser from 'phaser4';

export type Dir = 'baixo' | 'cima' | 'lado';
export interface ParteRig { parte: string; img: string; papel: string; pai?: string; x: number; y: number }
export interface Rig { altura: number; dirs: Partial<Record<Dir, ParteRig[]>> }
export interface InfoPeca { w: number; h: number; ax: number; ay: number; e: boolean; escala: number }

interface Viva { def: ParteRig; img: Phaser.GameObjects.Image; e?: Phaser.GameObjects.Image; rot: number; dx: number; dy: number; sx: number; sy: number }

export class Boneco {
  readonly c: Phaser.GameObjects.Container;
  private poses = new Map<Dir, { g: Phaser.GameObjects.Container; partes: Viva[] }>();
  dir: Dir = 'baixo';
  flip = false;
  anda = false;
  private fase = 0;
  private ataqueT = -1;
  private t0 = Math.random() * 10;

  constructor(scene: Phaser.Scene, rig: Rig, info: Record<string, InfoPeca>, x: number, y: number, emissivos: Phaser.GameObjects.Image[]) {
    this.c = scene.add.container(x, y);
    for (const [dir, partes] of Object.entries(rig.dirs) as [Dir, ParteRig[]][]) {
      const g = scene.add.container(0, 0);
      const vivas: Viva[] = [];
      for (const def of partes) {
        const inf = info[def.img];
        if (!inf || !scene.textures.exists(def.img)) continue;
        const img = scene.add.image(0, 0, def.img).setOrigin(inf.ax, inf.ay).setScale(1 / inf.escala).setLighting(true).setData('base', 1 / inf.escala);
        g.add(img);
        let e: Phaser.GameObjects.Image | undefined;
        if (inf.e && scene.textures.exists(def.img + '_e')) {
          e = scene.add.image(0, 0, def.img + '_e').setOrigin(inf.ax, inf.ay).setScale(1 / inf.escala).setBlendMode(Phaser.BlendModes.ADD).setData('base', 1 / inf.escala);
          g.add(e);
          emissivos.push(e);
        }
        vivas.push({ def, img, e, rot: 0, dx: 0, dy: 0, sx: 1, sy: 1 });
      }
      g.setVisible(false);
      this.c.add(g);
      this.poses.set(dir, { g, partes: vivas });
    }
    this.mostrar();
  }

  private mostrar() {
    const d = this.poses.has(this.dir) ? this.dir : this.poses.has('baixo') ? 'baixo' : ([...this.poses.keys()][0] as Dir);
    for (const [k, p] of this.poses) p.g.setVisible(k === d);
    this.c.scaleX = this.flip ? -1 : 1;
  }

  olhar(dir: Dir, flip: boolean) {
    if (dir === this.dir && flip === this.flip) return;
    this.dir = dir;
    this.flip = flip;
    this.mostrar();
  }

  atacar() {
    this.ataqueT = 0;
  }

  update(t: number, dt: number, velocidade = 1) {
    const s = t / 1000 + this.t0;
    if (this.anda) this.fase += dt * 9.5 * velocidade;
    const f = this.fase;
    const pose = this.poses.get(this.dir) ?? this.poses.get('baixo');
    if (!pose) return;
    if (this.ataqueT >= 0) {
      this.ataqueT += dt;
      if (this.ataqueT > 0.45) this.ataqueT = -1;
    }
    const lado = this.dir === 'lado';
    const sw = Math.sin(f);
    const passo = this.anda ? 1 : 0;
    const resp = Math.sin(s * 2.4);
    for (const v of pose.partes) {
      v.rot = 0; v.dx = 0; v.dy = 0; v.sx = 1; v.sy = 1;
      switch (v.def.papel) {
        case 'tronco':
        case 'corpo':
          v.dy = passo ? -Math.abs(Math.cos(f)) * 3.2 : 0;
          v.sy = passo ? 1 - 0.035 * Math.sin(f * 2 + 1) : 1 + resp * 0.018;
          v.sx = passo ? 1 + 0.025 * Math.sin(f * 2 + 1) : 1 - resp * 0.01;
          if (v.def.papel === 'corpo') v.dy += Math.sin(s * 3) * 2.5;
          break;
        case 'cabeca':
          v.rot = passo ? Math.sin(f) * 0.05 : Math.sin(s * 1.3) * 0.035;
          v.dy = passo ? Math.cos(f * 2) * 0.8 : resp * 0.5;
          break;
        case 'perna_e':
        case 'perna_d': {
          const sinal = v.def.papel === 'perna_e' ? 1 : -1;
          if (lado) v.rot = sw * 0.55 * sinal * passo;
          else {
            const lev = Math.max(0, sw * sinal) * passo;
            v.dy = -lev * 5;
            v.sy = 1 - lev * 0.08;
          }
          break;
        }
        case 'braco_e':
        case 'braco_d': {
          const sinal = v.def.papel === 'braco_e' ? -1 : 1;
          if (passo) v.rot = lado ? sw * 0.7 * sinal : sw * 0.28 * sinal;
          else v.rot = Math.sin(s * 1.8 + (sinal > 0 ? 0 : 1.5)) * 0.06 * sinal;
          if (this.ataqueT >= 0 && v.def.papel === 'braco_d') {
            const k = this.ataqueT / 0.45;
            v.rot = k < 0.35 ? -2.4 * (k / 0.35) : -2.4 + 3.2 * Math.min(1, (k - 0.35) / 0.25);
          }
          break;
        }
        case 'balanco':
          v.rot = passo ? -Math.sin(f - 0.8) * 0.12 : Math.sin(s * 1.4) * 0.05;
          break;
        case 'helice':
          v.sx = Math.max(0.15, Math.abs(Math.cos(s * 38)));
          v.dy = Math.sin(s * 3) * 2.5;
          break;
      }
    }
    // compõe as transformações (filho segue a junta do pai), mantendo a ordem de desenho plana
    // o pai pode vir depois do filho na lista: resolve pela hierarquia, desenha pela ordem
    type T = { x: number; y: number; r: number; sx: number; sy: number };
    const mundo = new Map<string, T>();
    const porNome = new Map(pose.partes.map((v) => [v.def.parte, v]));
    const resolver = (v: Viva): T => {
      const feito = mundo.get(v.def.parte);
      if (feito) return feito;
      const pv = v.def.pai ? porNome.get(v.def.pai) : undefined;
      const pai = pv ? resolver(pv) : undefined;
      let x = v.def.x + v.dx, y = v.def.y + v.dy, r = v.rot;
      if (pai) {
        const lx = x * pai.sx, ly = y * pai.sy;
        const c = Math.cos(pai.r), sn = Math.sin(pai.r);
        x = pai.x + lx * c - ly * sn;
        y = pai.y + lx * sn + ly * c;
        r += pai.r;
      }
      const t = { x, y, r, sx: v.sx, sy: v.sy };
      mundo.set(v.def.parte, t);
      return t;
    };
    for (const v of pose.partes) {
      const { x, y, r } = resolver(v);
      for (const o of [v.img, v.e]) {
        if (!o) continue;
        const base = o.getData('base') as number;
        o.setPosition(x, y).setRotation(r).setScale(base * v.sx, base * v.sy);
      }
    }
  }
}
