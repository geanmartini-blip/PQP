/**
 * Galeria da arte gerada (abra com ?gallery=1): bonecos nas 4 direções animando, tiers do Peão
 * Brabo e do Idol, paletas, treinadores, personagens, inimigos (normal, elite, chefe), invocações,
 * tiles (água e neon animados), efeitos, ícones, emblemas e retratos.
 *
 * As folhas são geradas aos poucos (alguns ms por quadro), com "gerando N/M" no topo: no celular a
 * tela não fica parada. Arraste para rolar. Toque no botão do topo para trocar a animação.
 */
import * as Phaser from 'phaser';
import { getData } from '@pqp/shared';
import { archetypeLook, type ArtLook, defaultLook } from './character';
import { ANIMS, type AnimName, type CharacterLook } from './contract';
import { ENEMY_ART_IDS } from './creatures';
import { buildFx, coneKeyFor, FONT_KEY, fontText } from './fx';
import { Tile } from '@pqp/shared/map';
import { asciiSource, DEMO_CITY_ROWS, DEMO_ROWS } from './demoMap';
import { createArt, pendingSheets, propsTexture, sheetMeta, uploadPix } from './index';
import { facadeFrame, facadeIds, PROP_VARIANTS, propsByGroup } from './landmarks';
import { hashInt } from './noise';
import { STORY_NPC_IDS } from './npcs';
import { MATO_FRAMES, OVERLAY_FRAMES, overlayKind, renderTerrain, type TerrainSource, TREE_BASE_Y, TREE_H, TREE_W } from './terrain';
import { TILE_ANIM_MS, TILE_KEY, TILE_VALUES, TILE_VARIANTS, ANIMATED_TILES, tileFrame, treeFrame, TREE_SUBS } from './tiles';
import { furnitureByStyle, furnitureRots } from './furniture';
import { UI_ICON_IDS } from './uiIcons';

// SUGESTÃO: tempo de geração por quadro na galeria.
const BUDGET_MS = 12;

interface AnimSprite {
  sprite: Phaser.GameObjects.Sprite;
  key: string;
  dir: number;
}

export class GalleryScene extends Phaser.Scene {
  private art = createArt();
  /** escala da arte (2 px de CSS por pixel da arte, inteiro em pixels de canvas) e folga */
  private S = 2;
  private GAP = 6;
  private cursorX = 6;
  private cursorY = 40;
  private rowH = 0;
  private animSprites: AnimSprite[] = [];
  private anim: AnimName = 'andando';
  private animLabel?: Phaser.GameObjects.BitmapText;
  private tileSprites: { s: Phaser.GameObjects.Image; tile: number; x: number; y: number }[] = [];
  private warnSprites: { s: Phaser.GameObjects.Image; frames: number }[] = [];
  private ovSprites: { s: Phaser.GameObjects.Image; frames: string[]; phase: number }[] = [];
  private demoSeq = 0;
  private tasks: (() => void)[] = [];
  private doneTasks = 0;
  private finished = false;

  constructor() {
    super('GalleryScene');
  }

  create(): void {
    const px = (this.registry.get('px') as number | undefined) ?? 1;
    const Z = Math.max(1, Math.round(px));
    this.S = 2 * Z;
    this.GAP = 6 * Z;
    this.cursorX = this.GAP;
    this.cursorY = 40 * Z;
    this.cameras.main.setBackgroundColor('#2e3a2e');
    this.art.fx(this);
    this.art.tileset(this);
    const W = this.scale.width;
    const t = (fn: () => void) => this.tasks.push(fn);

    // ---------------- bonecos
    t(() => this.title('BONECOS (4 DIRECOES)'));
    const ap = getData().appearance;
    const zoeiros: CharacterLook[] = [
      defaultLook(),
      { ...defaultLook(), body: 'barrigudo', skin: 'vermelho_de_sol', hair: 'black_power', hairColor: 'ruivo', face: 'sobrancelha_de_vilao', details: ['bigode', 'dente_de_ouro'] },
      { ...defaultLook(), body: 'alto_e_magrelo', skin: 'cinza_de_quem_nao_dorme', hair: 'liso_comprido', hairColor: 'rosa_neon', face: 'cara_de_sono', details: ['olheira', 'oculos'], outfit: { tier: 'delta', palette: 2 } },
      { ...defaultLook(), body: 'baixinho', skin: 'marca_de_regata', hair: 'mullet', hairColor: 'loiro_de_farmacia', face: 'piscadinha', details: ['tatuagem_nome_errado', 'cicatriz'], outfit: { tier: 'delta', palette: 4 } },
      { ...defaultLook(), body: 'fortao', skin: ap.peles[10]!.id, hair: 'moicano', hairColor: 'azul_eletrico', face: 'cara_fechada', details: ['barba'], outfit: { tier: 'delta', palette: 3 } },
    ];
    for (const lk of zoeiros) t(() => this.character(lk));
    t(() => this.newline());
    t(() => this.title('PEAO BRABO: BASE, APRENDIZ, VETERANO E ITENS RAROS'));
    for (const tier of ['base', 'aprendiz', 'veterano'] as const) t(() => this.character(archetypeLook('peao_brabo', tier)));
    t(() => this.character({ ...archetypeLook('peao_brabo', 'veterano'), items: [{ slot: 'adorno', rarity: 'raro' }, { slot: 'cabeca', rarity: 'raro' }] }));
    t(() => this.newline());
    t(() => this.title('IDOL: BASE, APRENDIZ, VETERANO'));
    for (const tier of ['base', 'aprendiz', 'veterano'] as const) t(() => this.character(archetypeLook('idol', tier)));
    t(() => this.newline());
    t(() => this.title('PALETAS DA ALA (3)'));
    for (const a of ['peao_brabo', 'idol']) for (let p = 0; p < 3; p++) t(() => this.single(this.art.characterSheet(this, archetypeLook(a, 'veterano', p)), 'parado_0_0'));
    t(() => this.newline());

    // ---------------- os 24 arquétipos: base da instituição, aprendiz e veterano nas 3 paletas
    for (const a of getData().archetypes) {
      t(() => this.title(`${a.id.replace(/_/g, ' ').toUpperCase()}: BASE, APRENDIZ, VETERANO X3, COSTAS`));
      t(() => this.single(this.art.characterSheet(this, archetypeLook(a.id, 'base')), 'parado_0_0'));
      for (let p = 0; p < 3; p++) t(() => this.single(this.art.characterSheet(this, archetypeLook(a.id, 'aprendiz', p)), 'parado_0_0'));
      for (let p = 0; p < 3; p++) t(() => this.single(this.art.characterSheet(this, archetypeLook(a.id, 'veterano', p)), 'parado_0_0'));
      t(() => this.single(this.art.characterSheet(this, archetypeLook(a.id, 'veterano')), 'parado_2_0'));
      t(() => this.single(this.art.characterSheet(this, archetypeLook(a.id, 'veterano')), 'parado_1_0'));
      t(() => this.newline());
    }
    t(() => this.title('BASES DAS 8 INSTITUICOES'));
    for (const i of getData().institutions.instituicoes) {
      const lk: CharacterLook = { ...defaultLook(), outfit: { tier: 'base', institutionId: i.id, palette: 0 } };
      t(() => {
        this.single(this.art.characterSheet(this, lk), 'parado_0_0');
        this.single(this.art.characterSheet(this, lk), 'parado_2_0');
      });
    }
    t(() => this.newline());

    // ---------------- NPCs
    t(() => this.title('TREINADORES (VISUAL DE MESTRE)'));
    for (const tr of getData().trainers) t(() => this.animated(this.art.npcSheet(this, tr.id), 0));
    t(() => this.newline());
    t(() => this.title('TREINADORES DA BASE DAS 8 INSTITUICOES'));
    for (const i of getData().institutions.instituicoes)
      t(() => {
        this.place((x, y) => this.add.image(x, y, this.art.emblem(this, i.id)).setOrigin(0).setScale(this.S / 4), 16 * this.S, 16 * this.S);
        this.animated(this.art.npcSheet(this, i.baseTrainer), 0);
      });
    t(() => this.newline());
    t(() => this.title('PERSONAGENS'));
    for (const id of STORY_NPC_IDS) t(() => this.animated(this.art.npcSheet(this, id), 0));
    t(() => this.newline());

    // ---------------- inimigos
    for (const tier of ['normal', 'elite', 'chefe'] as const) {
      t(() => this.title(`INIMIGOS ${tier.toUpperCase()}`));
      for (const id of ENEMY_ART_IDS) t(() => this.animated(this.art.enemySheet(this, id, tier), 0));
      t(() => this.newline());
    }
    t(() => this.title('INVOCACOES (ESQUERDA E DIREITA)'));
    for (const s of getData().summons) for (const side of ['esquerda', 'direita'] as const) t(() => this.animated(this.art.summonSheet(this, s.id, side), 0));
    t(() => this.newline());

    // ---------------- opções de aparência (tela de criação)
    const opt = (title: string, looks: CharacterLook[]) => {
      t(() => this.title(title));
      for (const lk of looks) t(() => this.single(this.art.characterSheet(this, lk), 'parado_0_0'));
      t(() => this.newline());
    };
    const base = defaultLook();
    opt('5 CORPOS', ap.corpos.map((c) => ({ ...base, body: c.id })));
    opt('15 PELES (3 ZOEIRAS)', ap.peles.map((p) => ({ ...base, skin: p.id })));
    opt('16 ROSTOS', ap.rostos.map((r) => ({ ...base, face: r.id })));
    opt('20 CORTES', ap.cortes.map((c) => ({ ...base, hair: c.id })));
    opt('12 CORES DE CABELO', ap.coresCabelo.map((c) => ({ ...base, hair: 'black_power', hairColor: c.id })));
    opt('DETALHES', ap.detalhes.map((x) => ({ ...base, details: [x.id] })));
    opt('TRAJE DO DELTA: 6 CORES', ap.roupaInicial.cores.map((_, i) => ({ ...base, outfit: { tier: 'delta' as const, palette: i } })));

    // ---------------- terreno
    t(() => this.terrainDemo('TERRENO DO DELTA: TRANSICOES, PALAFITA, MANGUE', asciiSource(DEMO_ROWS, 2)));
    t(() => this.terrainDemo('TERRENO DA ESQUERDA', asciiSource(DEMO_ROWS, 0)));
    t(() => this.terrainDemo('TERRENO DA DIREITA', asciiSource(DEMO_CITY_ROWS, 1)));
    t(() => {
      this.title('ARVORES 2X3 (ESQUERDA, DIREITA, MANGUE)');
      for (let st = 0; st < 3; st++)
        for (let sub = 0; sub < TREE_SUBS; sub++)
          this.place((x, y) => this.add.image(x, y, TILE_KEY, `arvore_${st}_${sub}`).setOrigin(0).setScale(this.S), TREE_W * this.S, TREE_H * this.S);
      this.newline();
    });

    // ---------------- props das margens e fachadas
    const groups = propsByGroup();
    const GROUP_TITLE: Record<string, string> = {
      esquerda: 'PROPS DA ESQUERDA',
      direita: 'PROPS DA DIREITA',
      usina: 'PROPS DA USINA',
      juncal: 'PROPS DO JUNCAL',
      geral: 'PROPS GERAIS',
    };
    for (const [g, names] of Object.entries(groups))
      t(() => {
        const key = propsTexture(this);
        this.title(GROUP_TITLE[g] ?? g.toUpperCase());
        for (const n of names)
          for (let v = 0; v < PROP_VARIANTS; v++) {
            const fr = this.textures.get(key).get(`prop_${n}_${v}`);
            this.place((x, y) => this.add.image(x, y, key, `prop_${n}_${v}`).setOrigin(0).setScale(this.S), fr.width * this.S, fr.height * this.S);
          }
        this.newline();
      });
    t(() => {
      const key = propsTexture(this);
      this.title('FACHADAS DAS SEDES E DOS QGS');
      for (const id of facadeIds()) this.place((x, y) => this.add.image(x, y, key, facadeFrame(id)).setOrigin(0).setScale(this.S), 64 * this.S, 64 * this.S);
      this.newline();
    });

    // ---------------- Fase 4: móveis em todas as rotações, interiores e ícones de UI
    const STYLE_TITLE = { esquerda: 'MOVEIS DA ESQUERDA (ROTACOES)', direita: 'MOVEIS DA DIREITA (ROTACOES)', delta: 'MOVEIS DO DELTA' } as const;
    for (const [style, ids] of Object.entries(furnitureByStyle()) as [keyof typeof STYLE_TITLE, string[]][]) {
      t(() => this.title(STYLE_TITLE[style]));
      for (const id of ids)
        t(() => {
          for (let r = 0; r < furnitureRots(id); r++) {
            const f = this.art.furniture(this, id, r);
            this.place((x, y) => this.add.image(x, y, f.key, f.frame).setOrigin(0).setScale(this.S), f.w * this.S, f.h * this.S);
          }
          this.cursorX += this.GAP;
        });
      t(() => this.newline());
    }
    const demo: Record<'mutirao' | 'capsula', [string, number, number, number][]> = {
      mutirao: [
        ['quadro_de_cotas', 1, 0, 0],
        ['retrato_da_nayra', 5, 0, 0],
        ['bandeira_do_raiz_fc', 6, 0, 0],
        ['estante_de_atas', 0, 0, 0],
        ['fogao_a_lenha', 3, 0, 0],
        ['altar_dos_espiritos', 6, 0, 0],
        ['tapete_de_retalhos', 3, 3, 0],
        ['mesa_da_roda', 3, 3, 0],
        ['cama_de_palha', 0, 2, 0],
        ['rede_de_varanda', 6, 6, 0],
        ['cadeira_de_balanco', 7, 3, 1],
        ['horta_em_vaso', 8, 1, 0],
        ['filtro_de_barro', 2, 1, 0],
        ['lamparina_benzida', 7, 2, 0],
        ['banco_de_madeira', 0, 6, 0],
        ['tambor_da_roda', 2, 7, 0],
        ['bau_entalhado', 0, 7, 0],
      ],
      capsula: [
        ['letreiro_neon_gratidao', 0, 0, 0],
        ['capsula_de_sono', 0, 0, 0],
        ['geladeira_inteligente', 2, 0, 0],
        ['planta_de_plastico_neon', 1, 1, 0],
        ['poltrona_ergonomica_led', 1, 3, 1],
        ['tapete_de_led', 0, 2, 1],
        ['robo_aspirador', 2, 3, 0],
        ['ring_light', 2, 4, 0],
        ['cafeteira_por_assinatura', 0, 4, 0],
      ],
    };
    for (const [style, title] of [
      ['mutirao', 'INTERIOR: CASA DE MUTIRAO (9X8)'],
      ['capsula', 'INTERIOR: CAPSULA (3X5)'],
    ] as const)
      t(() => {
        this.title(title);
        const room = this.art.interior(this, style === 'mutirao' ? 'casa_de_mutirao' : 'capsula');
        const S = Math.max(1, Math.min(this.S, Math.floor((this.scale.width - 2 * this.GAP) / room.w)));
        this.place((x, y) => {
          this.add.image(x, y, room.key).setOrigin(0).setScale(S);
          for (const [id, tx, ty, rot] of demo[style]) {
            const f = this.art.furniture(this, id, rot);
            this.add
              .image(x + (room.floorX + tx * 32) * S, y + (room.floorY + ty * 32 - f.up) * S, f.key, f.frame)
              .setOrigin(0)
              .setScale(S)
              .setDepth(f.flat ? 0.5 : 1 + (ty + f.footH) / 100);
          }
          return room;
        }, room.w * S, room.h * S);
        this.newline();
      });
    t(() => {
      this.title('ICONES DE UI: SEMENTE, CREDITO, CAMBIO, FEIRA, APP, CASA, DECORAR, GIRAR, TIRAR');
      for (const id of UI_ICON_IDS) this.place((x, y) => this.add.image(x, y, this.art.icon(this, id)).setOrigin(0).setScale(this.S / 2), 24 * this.S, 24 * this.S);
      this.newline();
    });

    // ---------------- tiles
    t(() => {
      const S = this.S;
      this.title('TILES');
      for (const tile of TILE_VALUES)
        for (let v = 0; v < (TILE_VARIANTS[tile] ?? 1); v++) {
          const img = this.place((x, y) => this.add.image(x, y, TILE_KEY, `${tile}_${v}`).setOrigin(0).setScale(S), 32 * S, 32 * S);
          if (ANIMATED_TILES.has(tile)) this.tileSprites.push({ s: img, tile, x: v, y: 0 });
        }
      this.newline();
    });

    // ---------------- efeitos
    t(() => {
      const S = this.S;
      this.title('EFEITOS');
      const { info } = buildFx();
      for (const [key, fi] of Object.entries(info)) {
        const w = fi.w * S;
        const h = fi.h * S;
        this.place((x, y) => {
          const s = this.add.sprite(x + w * fi.ox, y + h * fi.oy, key, '0').setOrigin(fi.ox, fi.oy).setScale(S);
          if (fi.fps > 0) s.play(`${key}:play:0`);
          else if (fi.frames > 1) this.warnSprites.push({ s, frames: fi.frames });
          return s;
        }, w, h);
      }
      this.newline();
      this.title(`CONE PARA 70 GRAUS: ${coneKeyFor(70)}`);
      this.newline();
      this.add.bitmapText(this.cursorX, this.cursorY, FONT_KEY, fontText('0123456789 +15 CRITICO! -42'), 7).setScale(S).setTint(0xffe23a);
      this.cursorY += 9 * S + this.GAP;
    });

    // ---------------- ícones, emblemas, retratos
    const d = getData();
    t(() => this.title('ICONES: 16 DE CLASSE, 48 MARCAS, ESPECIAIS, BASICOS E ITENS'));
    const iconIds = [
      ...d.abilitiesClass.map((a) => a.id),
      ...d.abilitiesArchetype.map((a) => a.id),
      ...d.abilitiesSpecial.filter((a) => a.slot === 'especial').map((a) => a.id),
      ...d.abilitiesBasic.map((a) => a.id),
      ...d.consumables.habilidades.map((a) => a.id),
      ...d.items.itens.filter((_, i) => i % 9 === 0).map((i) => i.id),
      ...d.uniques.unicos.slice(0, 2).map((u) => u.id),
    ];
    for (const id of iconIds) {
      t(() => {
        const s = this.S / 2;
        this.place((x, y) => this.add.image(x, y, this.art.icon(this, id)).setOrigin(0).setScale(s), 48 * s, 48 * s);
      });
    }
    t(() => this.newline());
    t(() => this.title('EMBLEMAS'));
    for (const i of [...d.institutions.instituicoes.map((x) => x.id), 'casa_da_assembleia', 'torre_do_consorcio'])
      t(() => this.place((x, y) => this.add.image(x, y, this.art.emblem(this, i)).setOrigin(0).setScale(this.S / 2), 32 * this.S, 32 * this.S));
    t(() => this.newline());
    t(() => this.title('RETRATOS'));
    for (const w of ['wesley', 'li_wei', 'seu_jaco', 'bruno_ferro', 'o_sombra', 'bruno_ferro_chefe', 'siri_do_mangue'])
      t(() => this.place((x, y) => this.add.image(x, y, this.art.portrait(this, w)).setOrigin(0).setScale(this.S / 2), 32 * this.S, 32 * this.S));
    t(() => this.place((x, y) => this.add.image(x, y, this.art.portrait(this, zoeiros[1]!)).setOrigin(0).setScale(this.S / 2), 32 * this.S, 32 * this.S));
    t(() => this.newline());

    // ---------------- interface
    const barH = 32 * Z;
    const bar = this.add.rectangle(0, 0, W, barH, 0x141018, 0.9).setOrigin(0).setScrollFactor(0).setDepth(10);
    bar.setInteractive().on('pointerup', () => this.finished && this.nextAnim());
    this.animLabel = this.add.bitmapText(8 * Z, 8 * Z, FONT_KEY, '', 7).setScrollFactor(0).setDepth(11);
    this.updateLabel();
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      this.cameras.main.scrollY -= p.y - p.prevPosition.y;
      this.cameras.main.scrollX -= p.x - p.prevPosition.x;
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
        const now = this.time.now;
        for (const ts of this.tileSprites) ts.s.setFrame(tileFrame(ts.tile, ts.x, ts.y, undefined, now));
        const step = Math.floor(now / TILE_ANIM_MS);
        for (const o of this.ovSprites) o.s.setFrame(o.frames[(step + o.phase) % o.frames.length]!);
        const k = Math.floor(now / 120);
        for (const w of this.warnSprites) w.s.setFrame(String(k % w.frames));
      },
    });
  }

  private lastPending = -1;

  override update(): void {
    if (this.finished) {
      // as folhas aparecem com a silhueta e ficam prontas aos poucos (art/index.ts)
      const n = pendingSheets();
      if (n !== this.lastPending) {
        this.lastPending = n;
        if (n > 0) this.setLabel(`DESENHANDO ${n} FOLHAS`);
        else this.updateLabel();
      }
      return;
    }
    const t0 = performance.now();
    while (this.doneTasks < this.tasks.length && performance.now() - t0 < BUDGET_MS) {
      this.tasks[this.doneTasks]!();
      this.doneTasks++;
    }
    if (this.doneTasks < this.tasks.length) {
      this.setLabel(`GERANDO ${this.doneTasks}/${this.tasks.length}`);
      return;
    }
    this.finished = true;
    this.newline();
    const maxY = this.cursorY + 40;
    this.cameras.main.setBounds(0, 0, Math.max(this.scale.width, 10), Math.max(maxY, this.scale.height));
    this.updateLabel();
    this.playAll();
  }

  // ---------------------------------------------------------------------------

  private title(text: string): void {
    this.newline();
    const s = this.fitScale(fontText(text), this.S);
    this.add.bitmapText(this.GAP, this.cursorY, FONT_KEY, fontText(text), 7).setScale(s).setTint(0xffe8a0);
    this.cursorY += 9 * s + 4;
  }

  private newline(): void {
    if (this.rowH > 0) this.cursorY += this.rowH + this.GAP;
    this.cursorX = this.GAP;
    this.rowH = 0;
  }

  private place<T>(make: (x: number, y: number) => T, w: number, h: number): T {
    if (this.cursorX + w > this.scale.width - this.GAP && this.cursorX > this.GAP) this.newline();
    const r = make(this.cursorX, this.cursorY);
    this.cursorX += w + this.GAP;
    this.rowH = Math.max(this.rowH, h);
    return r;
  }

  /** Terreno de demonstração: o bloco puro, as árvores por y e a camada animada por cima. */
  private terrainDemo(label: string, src: TerrainSource): void {
    this.title(label);
    const pix = renderTerrain(src, 0, 0, src.width, src.height);
    const key = `demo_terreno_${++this.demoSeq}`;
    uploadPix(this, key, pix);
    const s = Math.max(0.5, Math.min(this.S, (this.scale.width - 2 * this.GAP) / pix.w));
    const x0 = this.GAP;
    const y0 = this.cursorY;
    this.add.image(x0, y0, key).setOrigin(0).setScale(s);
    const T = 32 * s;
    for (let y = 0; y < src.height; y++)
      for (let x = 0; x < src.width; x++) {
        const tile = src.tile(x, y);
        const kind = overlayKind(tile);
        if (kind) {
          const phase = (x * 3 + y * 5) & 3;
          const v = hashInt(x, y, 81) & 3;
          const frames =
            kind === 'mato'
              ? Array.from({ length: MATO_FRAMES }, (_, f) => `ov_mato_${src.style(x, y)}_${v % 3}_${f}`)
              : kind === 'neon'
                ? [0, 1, 2, 3].map((f) => `ov_neon_${f}`)
                : Array.from({ length: OVERLAY_FRAMES }, (_, f) => `ov_${kind}_${v}_${f}`);
          const img = this.add.image(x0 + x * T, y0 + y * T, TILE_KEY, frames[0]).setOrigin(0).setScale(s).setDepth(1);
          this.ovSprites.push({ s: img, frames, phase });
        }
        if (tile === Tile.Arvore) {
          const img = this.add
            .image(x0 + (x * 32 + 16) * s, y0 + (y * 32 + 28 + TREE_H - TREE_BASE_Y) * s, TILE_KEY, treeFrame(src.style(x, y), x, y))
            .setOrigin(0.5, 1)
            .setScale(s)
            .setFlipX((hashInt(x, y, 83) & 1) === 1);
          img.setDepth(2 + y);
        }
      }
    this.cursorY += pix.h * s + this.GAP;
  }

  private character(look: CharacterLook | ArtLook): void {
    const key = this.art.characterSheet(this, look);
    for (let dir = 0; dir < 4; dir++) this.animated(key, dir);
    this.cursorX += this.GAP;
  }

  private animated(key: string, dir: number): void {
    const m = sheetMeta(key);
    if (!m) return;
    const S = this.S;
    const w = m.frameW * S;
    const h = m.frameH * S;
    this.place((x, y) => {
      const s = this.add.sprite(x + w / 2, y + h, key, `parado_${dir}_0`).setOrigin(m.originX, m.originY).setScale(S);
      s.on('animationcomplete', () => this.time.delayedCall(500, () => s.active && s.play(`${key}:${this.anim}:${dir}`)));
      this.animSprites.push({ sprite: s, key, dir });
      return s;
    }, w, h);
  }

  private single(key: string, frame: string): void {
    const m = sheetMeta(key);
    if (!m) return;
    const S = this.S;
    this.place((x, y) => this.add.image(x, y, key, frame).setOrigin(0).setScale(S), m.frameW * S, m.frameH * S);
  }

  private nextAnim(): void {
    const names = Object.keys(ANIMS) as AnimName[];
    this.anim = names[(names.indexOf(this.anim) + 1) % names.length]!;
    this.updateLabel();
    this.playAll();
  }

  /** Maior escala inteira (até `max`) em que o texto cabe na largura da tela. */
  private fitScale(text: string, max: number): number {
    const avail = this.scale.width - 2 * this.GAP;
    let s = max;
    while (s > 1 && text.length * 7 * s > avail) s--;
    return s;
  }

  private setLabel(text: string): void {
    const t = fontText(text);
    this.animLabel?.setText(t).setScale(this.fitScale(t, this.S));
  }

  private updateLabel(): void {
    // cabe numa linha: o texto curto em tela estreita
    const long = `ANIM: ${this.anim} (TOQUE PARA TROCAR)`;
    const short = `ANIM: ${this.anim} (TOQUE)`;
    const fits = fontText(long).length * 7 * Math.max(1, this.S - 1) <= this.scale.width - 2 * this.GAP;
    this.setLabel(fits ? long : short);
  }

  private playAll(): void {
    for (const a of this.animSprites) a.sprite.play(`${a.key}:${this.anim}:${a.dir}`);
  }
}

export default GalleryScene;
