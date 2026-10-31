/**
 * Galeria da arte gerada (abra com ?gallery=1): bonecos nas 4 direções animando, tiers do Peão
 * Brabo e do Idol, paletas, treinadores, personagens, inimigos (normal, elite, chefe), invocações,
 * tiles (água e neon animados), efeitos, ícones, emblemas e retratos.
 *
 * Arraste para rolar. Toque no botão do topo para trocar a animação dos bonecos.
 */
import * as Phaser from 'phaser';
import { getData } from '@pqp/shared';
import { archetypeLook, type ArtLook, defaultLook } from './character';
import { ANIMS, type AnimName, type CharacterLook } from './contract';
import { ENEMY_ART_IDS } from './creatures';
import { buildFx, coneKeyFor, FONT_KEY, fontText } from './fx';
import { createArt, sheetMeta } from './index';
import { STORY_NPC_IDS } from './npcs';
import { TILE_KEY, TILE_VALUES, TILE_VARIANTS, ANIMATED_TILES, tileFrame } from './tiles';

const SCALE = 2;
const GAP = 6;

interface AnimSprite {
  sprite: Phaser.GameObjects.Sprite;
  key: string;
  dir: number;
}

export class GalleryScene extends Phaser.Scene {
  private art = createArt();
  private cursorX = GAP;
  private cursorY = 40;
  private rowH = 0;
  private animSprites: AnimSprite[] = [];
  private anim: AnimName = 'andando';
  private animLabel?: Phaser.GameObjects.BitmapText;
  private tileSprites: { s: Phaser.GameObjects.Image; tile: number; x: number; y: number }[] = [];
  private warnSprites: { s: Phaser.GameObjects.Image; frames: number }[] = [];

  constructor() {
    super('GalleryScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#2e3a2e');
    this.art.fx(this);
    this.art.tileset(this);
    const W = this.scale.width;

    // ---------------- bonecos
    this.title('BONECOS (4 DIRECOES)');
    const ap = getData().appearance;
    const zoeiros: CharacterLook[] = [
      defaultLook(),
      { ...defaultLook(), body: 'barrigudo', skin: 'vermelho_de_sol', hair: 'black_power', hairColor: 'ruivo', face: 'sobrancelha_de_vilao', details: ['bigode', 'dente_de_ouro'] },
      { ...defaultLook(), body: 'alto_e_magrelo', skin: 'cinza_de_quem_nao_dorme', hair: 'liso_comprido', hairColor: 'rosa_neon', face: 'cara_de_sono', details: ['olheira', 'oculos'], outfit: { tier: 'delta', palette: 2 } },
      { ...defaultLook(), body: 'baixinho', skin: 'marca_de_regata', hair: 'mullet', hairColor: 'loiro_de_farmacia', face: 'piscadinha', details: ['tatuagem_nome_errado', 'cicatriz'], outfit: { tier: 'delta', palette: 4 } },
      { ...defaultLook(), body: 'fortao', skin: ap.peles[10]!.id, hair: 'moicano', hairColor: 'azul_eletrico', face: 'cara_fechada', details: ['barba'], outfit: { tier: 'delta', palette: 3 } },
    ];
    for (const lk of zoeiros) this.character(lk);
    this.newline();
    this.title('PEAO BRABO: BASE, APRENDIZ, VETERANO E ITENS RAROS');
    for (const t of ['base', 'aprendiz', 'veterano'] as const) this.character(archetypeLook('peao_brabo', t));
    this.character({ ...archetypeLook('peao_brabo', 'veterano'), items: [{ slot: 'adorno', rarity: 'raro' }, { slot: 'cabeca', rarity: 'raro' }] });
    this.newline();
    this.title('IDOL: BASE, APRENDIZ, VETERANO');
    for (const t of ['base', 'aprendiz', 'veterano'] as const) this.character(archetypeLook('idol', t));
    this.newline();
    this.title('PALETAS DA ALA (3)');
    for (const a of ['peao_brabo', 'idol']) for (let p = 0; p < 3; p++) this.single(this.art.characterSheet(this, archetypeLook(a, 'veterano', p)), 'parado_0_0');
    this.newline();

    // ---------------- os 24 arquétipos (aprendiz e veterano)
    this.title('24 ALAS: APRENDIZ E VETERANO');
    for (const a of getData().archetypes) {
      this.single(this.art.characterSheet(this, archetypeLook(a.id, 'aprendiz')), 'parado_0_0');
      this.single(this.art.characterSheet(this, archetypeLook(a.id, 'veterano')), 'parado_2_0');
    }
    this.newline();
    this.title('BASES DAS 8 INSTITUICOES');
    for (const i of getData().institutions.instituicoes) {
      const lk: CharacterLook = { ...defaultLook(), outfit: { tier: 'base', institutionId: i.id, palette: 0 } };
      this.single(this.art.characterSheet(this, lk), 'parado_0_0');
      this.single(this.art.characterSheet(this, lk), 'parado_2_0');
    }
    this.newline();

    // ---------------- NPCs
    this.title('TREINADORES (VISUAL DE MESTRE)');
    for (const t of getData().trainers) this.animated(this.art.npcSheet(this, t.id), 0);
    this.newline();
    this.title('PERSONAGENS');
    for (const id of STORY_NPC_IDS) this.animated(this.art.npcSheet(this, id), 0);
    this.newline();

    // ---------------- inimigos
    for (const tier of ['normal', 'elite', 'chefe'] as const) {
      this.title(`INIMIGOS ${tier.toUpperCase()}`);
      for (const id of ENEMY_ART_IDS) this.animated(this.art.enemySheet(this, id, tier), 0);
      this.newline();
    }
    this.title('INVOCACOES (ESQUERDA E DIREITA)');
    for (const s of getData().summons) for (const side of ['esquerda', 'direita'] as const) this.animated(this.art.summonSheet(this, s.id, side), 0);
    this.newline();

    // ---------------- tiles
    this.title('TILES');
    for (const t of TILE_VALUES)
      for (let v = 0; v < (TILE_VARIANTS[t] ?? 1); v++) {
        const img = this.place((x, y) => this.add.image(x, y, TILE_KEY, `${t}_${v}`).setOrigin(0).setScale(SCALE), 32 * SCALE, 32 * SCALE);
        if (ANIMATED_TILES.has(t)) this.tileSprites.push({ s: img, tile: t, x: v, y: 0 });
      }
    for (let v = 0; v < 3; v++) this.place((x, y) => this.add.image(x, y, TILE_KEY, `copa_21_${v}`).setOrigin(0).setScale(SCALE), 48 * SCALE, 40 * SCALE);
    this.newline();

    // ---------------- efeitos
    this.title('EFEITOS');
    const { info } = buildFx();
    for (const [key, fi] of Object.entries(info)) {
      const w = fi.w * SCALE;
      const h = fi.h * SCALE;
      this.place((x, y) => {
        const s = this.add.sprite(x + w * fi.ox, y + h * fi.oy, key, '0').setOrigin(fi.ox, fi.oy).setScale(SCALE);
        if (fi.fps > 0) s.play(`${key}:play:0`);
        else if (fi.frames > 1) this.warnSprites.push({ s, frames: fi.frames });
        return s;
      }, w, h);
    }
    this.newline();
    this.title(`CONE PARA 70 GRAUS: ${coneKeyFor(70)}`);
    this.newline();
    this.add.bitmapText(this.cursorX, this.cursorY, FONT_KEY, fontText('0123456789 +15 CRITICO! -42'), 7).setScale(SCALE).setTint(0xffe23a);
    this.cursorY += 9 * SCALE + GAP;

    // ---------------- ícones, emblemas, retratos
    this.title('ICONES');
    const d = getData();
    const iconIds = [
      ...d.abilitiesArchetype.filter((a) => a.ownerKey === 'peao_brabo' || a.ownerKey === 'idol').map((a) => a.id),
      ...d.abilitiesClass.map((a) => a.id),
      ...d.abilitiesSpecial.filter((a) => a.slot === 'especial').map((a) => a.id),
      ...d.abilitiesBasic.map((a) => a.id),
      ...d.consumables.habilidades.map((a) => a.id),
      ...d.items.itens.filter((_, i) => i % 9 === 0).map((i) => i.id),
      ...d.uniques.unicos.slice(0, 2).map((u) => u.id),
    ];
    for (const id of iconIds) this.place((x, y) => this.add.image(x, y, this.art.icon(this, id)).setOrigin(0).setScale(SCALE / 2 + 0.5), 48 * (SCALE / 2 + 0.5), 48 * (SCALE / 2 + 0.5));
    this.newline();
    this.title('EMBLEMAS');
    for (const i of [...d.institutions.instituicoes.map((x) => x.id), 'casa_da_assembleia', 'torre_do_consorcio'])
      this.place((x, y) => this.add.image(x, y, this.art.emblem(this, i)).setOrigin(0).setScale(1.5), 96, 96);
    this.newline();
    this.title('RETRATOS');
    for (const w of ['wesley', 'li_wei', 'seu_jaco', 'bruno_ferro', 'o_sombra', 'bruno_ferro_chefe', 'siri_do_mangue'])
      this.place((x, y) => this.add.image(x, y, this.art.portrait(this, w)).setOrigin(0).setScale(1.5), 96, 96);
    this.place((x, y) => this.add.image(x, y, this.art.portrait(this, zoeiros[1]!)).setOrigin(0).setScale(1.5), 96, 96);
    this.newline();

    // ---------------- interface
    const bar = this.add.rectangle(0, 0, W, 32, 0x141018, 0.9).setOrigin(0).setScrollFactor(0).setDepth(10);
    bar.setInteractive().on('pointerup', () => this.nextAnim());
    this.animLabel = this.add.bitmapText(8, 8, FONT_KEY, '', 7).setScale(SCALE).setScrollFactor(0).setDepth(11);
    this.updateLabel();
    const maxY = this.cursorY + 40;
    this.cameras.main.setBounds(0, 0, Math.max(W, 10), Math.max(maxY, this.scale.height));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      this.cameras.main.scrollY -= (p.y - p.prevPosition.y);
      this.cameras.main.scrollX -= (p.x - p.prevPosition.x);
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, dx: number, dy: number) => {
      this.cameras.main.scrollY += dy;
      this.cameras.main.scrollX += dx;
    });
    // água, piso neon e avisos andando
    this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        const t = this.time.now;
        for (const ts of this.tileSprites) ts.s.setFrame(tileFrame(ts.tile, ts.x, ts.y, undefined, t));
        const k = Math.floor(t / 120);
        for (const w of this.warnSprites) w.s.setFrame(String(k % w.frames));
      },
    });
    this.playAll();
  }

  // ---------------------------------------------------------------------------

  private title(text: string): void {
    this.newline();
    this.add.bitmapText(GAP, this.cursorY, FONT_KEY, fontText(text), 7).setScale(SCALE).setTint(0xffe8a0);
    this.cursorY += 9 * SCALE + 4;
  }

  private newline(): void {
    if (this.rowH > 0) this.cursorY += this.rowH + GAP;
    this.cursorX = GAP;
    this.rowH = 0;
  }

  private place<T>(make: (x: number, y: number) => T, w: number, h: number): T {
    if (this.cursorX + w > this.scale.width - GAP && this.cursorX > GAP) this.newline();
    const r = make(this.cursorX, this.cursorY);
    this.cursorX += w + GAP;
    this.rowH = Math.max(this.rowH, h);
    return r;
  }

  private character(look: CharacterLook | ArtLook): void {
    const key = this.art.characterSheet(this, look);
    for (let dir = 0; dir < 4; dir++) this.animated(key, dir);
    this.cursorX += GAP;
  }

  private animated(key: string, dir: number): void {
    const m = sheetMeta(key);
    if (!m) return;
    const w = m.frameW * SCALE;
    const h = m.frameH * SCALE;
    this.place((x, y) => {
      const s = this.add.sprite(x + w / 2, y + h, key, `parado_${dir}_0`).setOrigin(m.originX, m.originY).setScale(SCALE);
      s.on('animationcomplete', () => this.time.delayedCall(500, () => s.active && s.play(`${key}:${this.anim}:${dir}`)));
      this.animSprites.push({ sprite: s, key, dir });
      return s;
    }, w, h);
  }

  private single(key: string, frame: string): void {
    const m = sheetMeta(key);
    if (!m) return;
    this.place((x, y) => this.add.image(x, y, key, frame).setOrigin(0).setScale(SCALE), m.frameW * SCALE, m.frameH * SCALE);
  }

  private nextAnim(): void {
    const names = Object.keys(ANIMS) as AnimName[];
    this.anim = names[(names.indexOf(this.anim) + 1) % names.length]!;
    this.updateLabel();
    this.playAll();
  }

  private updateLabel(): void {
    this.animLabel?.setText(fontText(`ANIM: ${this.anim} (TOQUE PARA TROCAR)`));
  }

  private playAll(): void {
    for (const a of this.animSprites) a.sprite.play(`${a.key}:${this.anim}:${a.dir}`);
  }
}

export default GalleryScene;
