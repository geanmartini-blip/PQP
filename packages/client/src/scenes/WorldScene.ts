/**
 * Cena do mundo: chão, bonecos, avisos no chão, zonas, marcador do alvo, números e falas.
 * Roda o laço do GameClient (rede, previsão) e desenha a 60 fps:
 * - o próprio personagem na posição prevista, interpolada entre os passos de 50 ms;
 * - os outros INTERP_DELAY_MS no passado, pelo buffer de snapshots;
 * - avisos no chão no tick em que uma entrada feita agora vai andar no servidor (o mesmo tempo do
 *   próprio boneco previsto): a borda enche junto com a chance real de sair do círculo.
 * A câmera tem zoom inteiro (pixels de canvas por pixel da arte) para mostrar ~12 tiles de largura.
 */
import * as Phaser from 'phaser';
import { getData } from '@pqp/shared';
import { hasLineOfSight } from '@pqp/shared/map';
import { SIM_TUNING, type CombatEvent, type Vec } from '@pqp/shared/sim';
import { archetypeLook, asCharacterLook, coneKeyFor, defaultLook, sheetMeta, TILE_PX } from '../art/index';
import { lookKey, type ArtLook } from '../art/character';
import type { CharacterLook } from '../art/contract';
import { FL, type ClientEnt } from '../game/clientWorld';
import { getRuntime, type Runtime } from '../game/runtime';
import type { Sample } from '../net/interpolation';
import { DEPTH } from '../render/depth';
import { Balloons, FloatTextPool, FxPool, ImagePool } from '../render/effects';
import { EntityView, shouldRevive } from '../render/entityView';
import { buildTileLayer, type TileLayerView } from '../render/tileLayer';
import { computeZoom, worldTextScale } from '../ui/layout';

const T = TILE_PX;
// SUGESTÃO: cores dos números.
const NUM = { selfHurt: 0xff5a4a, dealt: 0xffffff, crit: 0xffe23a, other: 0xc8c0d0, heal: 0x6aff6a, xp: 0xc890ff, info: 0x9ad0ff, gold: 0xffd060 };
// SUGESTÃO: margem de culling (px) em volta da câmera.
const CULL_MARGIN = 96;
// SUGESTÃO: inimigos "à vista" para as dicas e o Tab: até 8 tiles com linha de visão.
const VIEW_TILES = SIM_TUNING.ACQUIRE_RADIUS;
// SUGESTÃO: o toque no mundo mede também até 0,6 tile acima dos pés (o corpo fica acima deles).
const TAP_BODY_UP_TILES = 0.6;
// SUGESTÃO: tocar a até 1,2 tile de um NPC abre a conversa.
const NPC_TAP_TILES = 1.2;
// SUGESTÃO: no máximo uma folha de boneco nova gerada por quadro (as outras esperam com o visual padrão).
const NEW_SHEETS_PER_FRAME = 1;

export interface Guide {
  /** alcance da habilidade em tiles (círculo em volta do personagem) */
  range: number;
  /** área no ponto escolhido */
  radius: number;
  at?: Vec;
  /** o dedo voltou para o botão: soltar cancela (guia cinza) */
  cancel?: boolean;
}

interface TelView {
  img: Phaser.GameObjects.Sprite;
  frames: number;
  seen: number;
}

export class WorldScene extends Phaser.Scene {
  rt!: Runtime;
  private tiles: TileLayerView | undefined;
  private mapId = '';
  readonly views = new Map<number, EntityView>();
  private lookSig = new Map<number, string>();
  private telViews = new Map<number, TelView>();
  private zoneViews = new Map<number, { s: Phaser.GameObjects.Sprite; seen: number }>();
  private targetMarker!: Phaser.GameObjects.Sprite;
  private destMarker!: Phaser.GameObjects.Sprite;
  private guideG!: Phaser.GameObjects.Graphics;
  private guide: Guide | null = null;
  private floats!: FloatTextPool;
  private fxPool!: FxPool;
  private balloons!: Balloons;
  private sample: Sample = { t: 0, x: 0, y: 0 };
  private selfPos: Vec = { x: 0, y: 0 };
  private combatEvents: CombatEvent[] = [];
  private frameNo = 0;
  private lastLocalCast = -Infinity;
  private zoom = 1;
  /** escala dos textos do mundo (nomes e números), inteira */
  private textScale = 2;
  private telPool!: ImagePool;
  private zonePool!: ImagePool;
  private sheetsThisFrame = 0;
  /** posição desenhada do próprio personagem (tiles); null antes do primeiro snapshot */
  selfTile: Vec | null = null;
  fps = 60;

  constructor() {
    super('WorldScene');
  }

  create(): void {
    this.rt = getRuntime();
    this.cameras.main.setBackgroundColor('#0d0b10');
    this.targetMarker = this.add.sprite(0, 0, 'fx_alvo', '0').setDepth(DEPTH.marker).setVisible(false);
    this.targetMarker.play('fx_alvo:play:0');
    this.destMarker = this.add.sprite(0, 0, 'fx_alvo_aliado', '0').setDepth(DEPTH.marker).setVisible(false).setAlpha(0.6).setScale(0.6);
    this.destMarker.play('fx_alvo_aliado:play:0');
    this.guideG = this.add.graphics().setDepth(DEPTH.guide);
    this.floats = new FloatTextPool(this, 48);
    this.fxPool = new FxPool(this);
    this.balloons = new Balloons(this, 6);
    this.telPool = new ImagePool(this);
    this.zonePool = new ImagePool(this);
    this.applyZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.applyZoom());
  }

  private get px(): number {
    return (this.registry.get('px') as number | undefined) ?? 1;
  }

  private applyZoom(): void {
    this.zoom = computeZoom(this.scale.width, this.scale.height);
    this.cameras.main.setZoom(this.zoom);
    this.cameras.main.setSize(this.scale.width, this.scale.height);
    const ts = worldTextScale(this.px, this.zoom);
    const changed = ts !== this.textScale;
    this.textScale = ts;
    this.floats.setScale(ts);
    this.balloons.setDensity(this.px, this.zoom);
    // os rótulos já criados mudam de escala junto
    if (changed) for (const v of this.views.values()) v.setTextScale(ts);
  }

  // ---------------------------------------------------------------------------

  override update(_time: number, delta: number): void {
    const now = performance.now();
    const gc = this.rt.gc;
    gc.update(delta, now);
    this.frameNo++;
    this.sheetsThisFrame = 0;
    if (delta > 0) this.fps += (1000 / delta - this.fps) * 0.05;
    if (!gc.welcomed || !gc.map) return;
    if (gc.world.mapId !== this.mapId) this.buildMap();
    this.tiles?.update(now);

    // próprio personagem (previsto)
    const sp = gc.selfRender(this.selfPos);
    this.selfTile = sp ? this.selfPos : null;

    // outros (interpolados)
    const rtime = gc.clock.renderTime(now);
    const world = gc.world;
    for (const e of world.ents.values()) {
      if (e.defId === undefined && e.kind !== 'p' && e.id !== world.you) continue;
      let v = this.views.get(e.id);
      if (!v) {
        v = this.createView(e);
        if (!v) continue;
      }
      v.lastSeen = this.frameNo;
      this.syncView(v, e, rtime, now);
    }
    for (const [id, v] of this.views) {
      if (v.lastSeen !== this.frameNo) {
        v.destroy();
        this.views.delete(id);
        this.lookSig.delete(id);
      }
    }

    this.syncTelegraphs(now);
    this.syncZones();
    this.syncMarkers();
    this.drawGuide();
    this.handleEvents(now);
    // Fase 3: bordão usado como emote vira balão em cima de quem fez
    for (const em of gc.game.takeEmotes()) this.balloons.say(em.entity, em.texto, now);
    this.floats.update(now);
    this.balloons.update(now, (id) => {
      const v = this.views.get(id);
      return v ? { x: v.px, y: v.headY, visible: v.visible } : null;
    });

    // câmera no personagem
    if (sp) {
      const cam = this.cameras.main;
      cam.centerOn(Math.round(sp.x * T), Math.round(sp.y * T - 16));
    }
    this.cull();
  }

  private buildMap(): void {
    const gc = this.rt.gc;
    this.tiles?.destroy();
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
    this.lookSig.clear();
    const map = gc.map!;
    this.tiles = buildTileLayer(this, map);
    this.mapId = gc.world.mapId;
    this.cameras.main.setBounds(0, 0, map.width * T, map.height * T);
  }

  // ---------------------------------------------------------------------------
  // entidades

  private selfLook(e: ClientEnt): CharacterLook {
    const hud = this.rt.gc.world.hud;
    const lk = asCharacterLook(e.lk);
    const arch = hud?.arch;
    if (!arch) return lk ?? defaultLook();
    if (lk && lk.outfit.archetypeId === arch) return lk;
    // o servidor não mandou o visual novo depois da troca de ala: monta pela ala atual
    const tier = lk?.outfit.tier === 'veterano' ? 'veterano' : 'aprendiz';
    return archetypeLook(arch, tier, lk?.outfit.palette ?? 0, lk ? { body: lk.body, skin: lk.skin, face: lk.face, hair: lk.hair, hairColor: lk.hairColor, details: lk.details } : {});
  }

  private playerLook(e: ClientEnt): CharacterLook {
    if (e.id === this.rt.gc.world.you) return this.selfLook(e);
    const lk = asCharacterLook(e.lk);
    if (lk) return lk;
    if (e.defId && getData().archetypesById.has(e.defId)) return archetypeLook(e.defId, 'aprendiz');
    return defaultLook();
  }

  /** a última folha pedida ficou com o visual padrão (gerar a de verdade num próximo quadro) */
  private sheetPending = false;

  /**
   * Folha de um jogador: gera na hora só uma folha nova por quadro (cada uma leva dezenas de ms no
   * celular); as outras usam o visual padrão e são refeitas nos quadros seguintes.
   */
  private playerSheet(look: CharacterLook): string {
    const art = this.rt.art;
    if (!this.textures.exists(lookKey(look as ArtLook))) {
      if (this.sheetsThisFrame >= NEW_SHEETS_PER_FRAME) {
        this.sheetPending = true;
        return art.characterSheet(this, defaultLook());
      }
      this.sheetsThisFrame++;
    }
    return art.characterSheet(this, look);
  }

  private sheetFor(e: ClientEnt): string | undefined {
    const art = this.rt.art;
    const id = e.defId ?? '';
    this.sheetPending = false;
    switch (e.kind) {
      case 'p':
        return this.playerSheet(this.playerLook(e));
      case 'n':
        return art.npcSheet(this, id);
      case 'e':
        return art.enemySheet(this, id, e.fl & FL.chefe ? 'chefe' : e.fl & FL.elite ? 'elite' : 'normal');
      case 's': {
        const side = (e.lk as { side?: string } | undefined)?.side === 'direita' ? 'direita' : 'esquerda';
        return art.summonSheet(this, id, side);
      }
      case 'l':
        return lootKey(id, e.lk);
    }
  }

  private lookSignature(e: ClientEnt): string {
    return e.kind === 'p' ? `${e.lkVersion}|${e.id === this.rt.gc.world.you ? (this.rt.gc.world.hud?.arch ?? '') : ''}` : '';
  }

  private createView(e: ClientEnt): EntityView | undefined {
    const key = this.sheetFor(e);
    if (!key) return undefined;
    const D = getData();
    const isSelf = e.id === this.rt.gc.world.you;
    const elite = (e.fl & (FL.elite | FL.chefe)) !== 0;
    const enemyDef = e.kind === 'e' ? D.enemiesById.get(e.defId ?? '') : undefined;
    const radius = enemyDef?.raioCorpoTiles ?? (e.kind === 'l' ? SIM_TUNING.LOOT_RADIUS : SIM_TUNING.PLAYER_RADIUS);
    let label: string | undefined;
    let labelColor: number | undefined;
    if (e.kind === 'p' && !isSelf) {
      label = `${e.name ?? ''} ${e.lv ?? ''}`.trim();
      labelColor = EntityView.colors.nameAlly;
    } else if (e.kind === 'n') {
      label = e.name ?? e.defId;
      labelColor = EntityView.colors.nameNpc;
    } else if (e.kind === 'e' && !(e.fl & FL.chefe)) {
      label = elite ? `${e.name ?? ''} ${e.lv ?? ''}` : `${e.lv ?? ''}`;
      labelColor = elite ? EntityView.colors.nameElite : EntityView.colors.nameEnemy;
    }
    const v = new EntityView(this, {
      id: e.id,
      kind: e.kind,
      sheetKey: key,
      radius,
      isSelf,
      bar: e.kind === 'e' && !(e.fl & FL.chefe) ? 'enemy' : e.kind === 'p' || e.kind === 's' ? 'ally' : e.kind === 'n' ? 'auto' : 'none',
      ...(e.kind === 'l' ? { glow: 'fx_saque' } : {}),
      ...(e.kind === 'e' && affixFx(e.lk) ? { aura: affixFx(e.lk)! } : {}),
      ...(label ? { label } : {}),
      ...(labelColor !== undefined ? { labelColor } : {}),
      elite,
      textScale: this.textScale,
    });
    this.views.set(e.id, v);
    // folha provisória: assinatura vazia força refazer no próximo quadro
    this.lookSig.set(e.id, this.sheetPending ? '' : this.lookSignature(e));
    return v;
  }

  private syncView(v: EntityView, e: ClientEnt, rtime: number, now: number): void {
    const gc = this.rt.gc;
    const isSelf = v.isSelf;
    // visual mudou (troca de ala, item)
    if (e.kind === 'p') {
      const sig = this.lookSignature(e);
      if (sig !== this.lookSig.get(e.id)) {
        const key = this.sheetFor(e);
        this.lookSig.set(e.id, this.sheetPending ? '' : sig);
        if (key) v.setSheet(key);
      }
    }
    let x: number, y: number, moving: boolean, facing: number;
    if (isSelf && this.selfTile) {
      x = this.selfTile.x;
      y = this.selfTile.y;
      const p = gc.pred!;
      const localMove = p.vx !== 0 || p.vy !== 0;
      moving = localMove || (e.fl & FL.movendo) !== 0;
      facing = localMove ? facingOf(p.vx, p.vy, e.f) : e.f;
    } else {
      if (!e.buf.sample(rtime, this.sample)) return;
      x = this.sample.x;
      y = this.sample.y;
      moving = (e.fl & FL.movendo) !== 0;
      facing = e.f;
    }
    v.place(x * T, y * T);
    v.setHp(e.h, e.sh, (e.fl & (FL.atacando | FL.movendo)) !== 0);
    v.setShieldBubble(e.sh > 0);
    if (e.kind === 'e' && e.h <= 0) v.die(now);
    // jogador que voltou ao QG depois de caído: o servidor manda 'death', mas ele continua no mundo
    else if (shouldRevive(e.kind, e.h, e.fl, v.dying)) v.revive();
    v.animate(now, facing, moving, e.fl);
  }

  private cull(): void {
    const view = this.cameras.main.worldView;
    const x0 = view.x - CULL_MARGIN, y0 = view.y - CULL_MARGIN, x1 = view.right + CULL_MARGIN, y1 = view.bottom + CULL_MARGIN + 48;
    for (const v of this.views.values()) v.setVisible(v.px > x0 && v.px < x1 && v.py > y0 && v.py < y1);
    this.tiles?.cull(view);
  }

  // ---------------------------------------------------------------------------
  // avisos no chão e zonas

  private syncTelegraphs(_now: number): void {
    const gc = this.rt.gc;
    // tempo da ação do jogador (RTT à frente do último snapshot): ver actionTick em interpolation.ts
    const tickNow = gc.actionTickNow();
    const stamp = this.frameNo;
    for (const t of gc.world.tel) {
      let tv = this.telViews.get(t.id);
      if (!tv) {
        const key = t.shape === 'cone' ? coneKeyFor(t.angleDeg ?? 90) : t.shape === 'linha' ? 'fx_aviso_linha' : 'fx_aviso_circulo';
        const meta = sheetMeta(key)?.fx;
        const img = this.telPool.get(key, '0', DEPTH.telegraph);
        img.setOrigin(meta?.ox ?? 0.5, meta?.oy ?? 0.5).setRotation(0).setAlpha(1);
        const w = meta?.w ?? 64;
        const len = t.radius * T;
        if (t.shape === 'circulo') img.setScale((len * 2) / w);
        else if (t.shape === 'cone') img.setScale(len / w);
        // SUGESTÃO: a linha tem 1 tile de largura (o Telegraph não diz a largura)
        else img.setScale(len / w, T / (meta?.h ?? 16));
        if (t.dir !== undefined && t.shape !== 'circulo') img.setRotation(t.dir);
        tv = { img, frames: meta?.frames ?? 1, seen: stamp };
        this.telViews.set(t.id, tv);
      }
      tv.seen = stamp;
      tv.img.setPosition(t.x * T, t.y * T);
      const span = Math.max(1, t.impactTick - t.startTick);
      // nunca passa do impacto (o aviso some quando o servidor resolve)
      const u = Math.max(0, Math.min(1, (Math.min(tickNow, t.impactTick) - t.startTick) / span));
      if (tv.frames > 1) tv.img.setFrame(String(Math.min(tv.frames - 1, Math.floor(u * tv.frames))));
    }
    for (const [id, tv] of this.telViews) {
      if (tv.seen !== stamp) {
        this.telPool.release(tv.img);
        this.telViews.delete(id);
      }
    }
  }

  private zoneKey(team: string, abilityId: string): string {
    if (team === 'inimigos') return 'fx_zona_inimiga';
    const D = getData();
    const owner = D.abilities.get(abilityId)?.ownerKey;
    const side = (owner && D.archetypesById.get(owner)?.margem) || (this.rt.gc.world.hud?.arch && D.archetypesById.get(this.rt.gc.world.hud.arch)?.margem) || 'esquerda';
    return side === 'direita' ? 'fx_zona_direita' : 'fx_zona_esquerda';
  }

  /** Zonas no chão (x, y e r em tiles). Cone que acompanha quem lançou: textura do cone, girada. */
  private syncZones(): void {
    const gc = this.rt.gc;
    const stamp = this.frameNo;
    for (const z of gc.world.zones) {
      let zv = this.zoneViews.get(z.i);
      const cone = z.s === 'cone';
      if (!zv) {
        let s: Phaser.GameObjects.Sprite;
        if (cone) {
          const key = coneKeyFor(z.ang ?? 90);
          const meta = sheetMeta(key)?.fx;
          s = this.zonePool.get(key, String(Math.max(0, (meta?.frames ?? 1) - 1)), DEPTH.zone).setAlpha(0.45).setRotation(0);
          s.setOrigin(meta?.ox ?? 0, meta?.oy ?? 0.5);
          s.setScale(((z.rg ?? z.r) * T) / (meta?.w ?? 64));
          // cone aliado em verde ou ciano; inimigo fica no vermelho do aviso
          if (z.team !== 'inimigos') s.setTint(this.zoneKey(z.team, z.a) === 'fx_zona_direita' ? 0x60e8ff : 0x80ff80);
        } else {
          const key = this.zoneKey(z.team, z.a);
          const meta = sheetMeta(key)?.fx;
          s = this.zonePool.get(key, '0', DEPTH.zone).setAlpha(0.85).setRotation(0).setOrigin(0.5);
          if (this.anims.exists(`${key}:play:0`)) s.play(`${key}:play:0`);
          s.setScale((z.r * 2 * T) / (meta?.w ?? 64));
        }
        zv = { s, seen: stamp };
        this.zoneViews.set(z.i, zv);
      }
      zv.seen = stamp;
      zv.s.setPosition(z.x * T, z.y * T);
      if (cone && z.dir !== undefined) zv.s.setRotation(z.dir);
    }
    for (const [id, zv] of this.zoneViews) {
      if (zv.seen !== stamp) {
        this.zonePool.release(zv.s);
        this.zoneViews.delete(id);
      }
    }
  }

  private syncMarkers(): void {
    const gc = this.rt.gc;
    const tid = gc.currentTarget();
    const tv = tid !== undefined ? this.views.get(tid) : undefined;
    if (tv && tv.visible && !tv.dying) {
      this.targetMarker.setVisible(true).setPosition(tv.px, tv.py);
      const s = Math.max(0.8, (tv.radius * 2.6 * T) / (this.targetMarker.width || 32));
      this.targetMarker.setScale(s);
    } else this.targetMarker.setVisible(false);
    const dest = gc.pred?.destination;
    if (dest && gc.pred?.following) this.destMarker.setVisible(true).setPosition(dest.x * T, dest.y * T);
    else this.destMarker.setVisible(false);
  }

  /** O HUD mostra a guia de alcance enquanto arrasta uma área (null apaga). */
  setGuide(g: Guide | null): void {
    this.guide = g;
  }

  private drawGuide(): void {
    const g = this.guideG;
    g.clear();
    const gd = this.guide;
    if (!gd || !this.selfTile) return;
    const cx = this.selfTile.x * T, cy = this.selfTile.y * T;
    g.lineStyle(2, 0xffffff, 0.55);
    g.strokeCircle(cx, cy, gd.range * T);
    g.fillStyle(0xffffff, 0.06);
    g.fillCircle(cx, cy, gd.range * T);
    if (gd.at) {
      // cinza: soltar aqui cancela
      const c = gd.cancel ? 0x9a9aa0 : 0xffe23a;
      g.lineStyle(2, c, 0.9);
      g.strokeCircle(gd.at.x * T, gd.at.y * T, gd.radius * T);
      g.fillStyle(c, gd.cancel ? 0.1 : 0.18);
      g.fillCircle(gd.at.x * T, gd.at.y * T, gd.radius * T);
    }
  }

  // ---------------------------------------------------------------------------
  // eventos de combate

  private handleEvents(now: number): void {
    const gc = this.rt.gc;
    const you = gc.world.you;
    this.combatEvents.length = 0;
    gc.drainEvents(this.combatEvents);
    for (const ev of this.combatEvents) {
      switch (ev.t) {
        case 'hit': {
          const v = this.views.get(ev.dst);
          if (!v || !v.visible) break;
          const color = ev.dst === you ? NUM.selfHurt : ev.src === you ? (ev.crit ? NUM.crit : NUM.dealt) : NUM.other;
          this.floats.spawn(v.px, v.headY, String(Math.round(ev.amount)), color, now, ev.crit === true);
          let fx = 'fx_faisca';
          if (ev.ability && !ev.ability.startsWith('basico')) {
            const src = gc.world.ents.get(ev.src);
            const side = src?.kind === 'e' ? undefined : sideOf(src?.defId, gc.world.hud?.arch, ev.src === you);
            if (side) fx = side === 'direita' ? 'fx_golpe_direita' : 'fx_golpe_esquerda';
          }
          this.fxPool.play(fx, v.px, v.py - 14, DEPTH.entity + v.py + 5);
          break;
        }
        case 'miss': {
          const v = this.views.get(ev.dst);
          // SUGESTÃO: texto do erro
          if (v?.visible) this.floats.spawn(v.px, v.headY, 'errou', NUM.other, now);
          break;
        }
        case 'heal': {
          const v = this.views.get(ev.dst);
          if (!v?.visible) break;
          this.floats.spawn(v.px, v.headY, `+${Math.round(ev.amount)}`, NUM.heal, now);
          this.fxPool.play('fx_cura', v.px, v.py, DEPTH.entity + v.py + 5);
          break;
        }
        case 'cc_slow': {
          const v = this.views.get(ev.dst);
          if (v?.visible) this.floats.spawn(v.px, v.headY, 'lento', NUM.info, now);
          break;
        }
        case 'revive': {
          const v = this.views.get(ev.dst);
          // SUGESTÃO: texto de quem levanta
          if (v?.visible) this.floats.spawn(v.px, v.headY, 'de pe!', NUM.heal, now);
          break;
        }
        case 'death':
          this.views.get(ev.dst)?.die(now);
          break;
        case 'cast': {
          const v = this.views.get(ev.src);
          if (!v) break;
          if (ev.src === you && now - this.lastLocalCast < 800) break;
          v.playAction(isSpecial(ev.ability) ? 'especial' : 'habilidade', now, isSpecial(ev.ability) ? 600 : 400);
          break;
        }
        case 'xp':
          if (ev.dst === you && this.selfTile) this.floats.spawn(this.selfTile.x * T, this.selfTile.y * T - 52, `+${Math.round(ev.amount)} xp`, NUM.xp, now);
          break;
        case 'level':
          if (ev.dst === you) {
            if (this.selfTile) this.floats.spawn(this.selfTile.x * T, this.selfTile.y * T - 60, `nivel ${ev.level}!`, NUM.gold, now, true);
            // Fase 2: o banner de nível vem do perfil (com os desbloqueios)
            if (!gc.game.active) gc.pushNotice(`Nível ${ev.level}!`);
          }
          break;
        case 'currency':
          if (ev.dst === you && this.selfTile) {
            const parts = [ev.semente ? `+${ev.semente} semente` : '', ev.credito ? `+${ev.credito} credito` : ''].filter(Boolean).join(' ');
            if (parts) this.floats.spawn(this.selfTile.x * T, this.selfTile.y * T - 52, parts, NUM.gold, now);
          }
          break;
        case 'loot_pick':
          if (ev.by === you && this.selfTile) {
            const l = gc.world.ents.get(ev.id);
            const name = l?.name && l.name !== 'moeda' ? (getData().itemsById.get(l.defId ?? '')?.name ?? l.name) : '';
            if (name) this.floats.spawn(this.selfTile.x * T, this.selfTile.y * T - 60, `+ ${name}`, NUM.gold, now);
          }
          break;
        case 'say':
          this.balloons.say(ev.src, ev.text, now);
          break;
        default:
          break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // API para o HUD

  /** Toque no mundo (px de tela): inimigo troca o alvo, NPC conversa, chão leva até lá. */
  tapWorld(sx: number, sy: number): 'alvo' | 'falar' | 'andar' | null {
    const gc = this.rt.gc;
    if (!gc.welcomed) return null;
    const p = this.cameras.main.getWorldPoint(sx, sy);
    const tx = p.x / T, ty = p.y / T;
    const R = getData().balance.combate.raioTrocaAlvoTiles;
    let best: EntityView | undefined;
    let bestD = Infinity;
    let bestNpc: EntityView | undefined;
    let bestNpcD = Infinity;
    for (const v of this.views.values()) {
      if (!v.visible || v.dying || v.isSelf) continue;
      // o corpo fica acima dos pés: mede até o meio do boneco também
      const vx = v.px / T, vy = v.py / T;
      const d = Math.min(Math.hypot(tx - vx, ty - vy), Math.hypot(tx - vx, ty - (vy - TAP_BODY_UP_TILES)));
      if (v.kind === 'e' && d <= R + v.radius && d < bestD) {
        best = v;
        bestD = d;
      } else if (v.kind === 'n' && d <= NPC_TAP_TILES && d < bestNpcD) {
        bestNpc = v;
        bestNpcD = d;
      }
    }
    if (best) {
      gc.tapTarget(best.px / T, best.py / T, best.id);
      this.rt.tips.mark('alvo', performance.now());
      gc.tutorialControl('trocar_alvo', 'alvo');
      return 'alvo';
    }
    if (bestNpc) {
      this.talkTo(bestNpc.id);
      return 'falar';
    }
    const dest = gc.goTo(tx, ty);
    if (dest) {
      this.rt.tips.mark('andar', performance.now());
      gc.tutorialControl('tocar_no_chao', 'andar');
    }
    return dest ? 'andar' : null;
  }

  talkTo(id: number): void {
    const gc = this.rt.gc;
    const e = gc.world.ents.get(id);
    if (gc.interact(id) && e?.defId && getData().trainersById.has(e.defId)) this.rt.tips.mark('estilo', performance.now());
  }

  /** NPC mais perto ao alcance da conversa (para o botão Falar). */
  nearestTalkNpc(): { id: number; name: string } | undefined {
    const gc = this.rt.gc;
    let best: { id: number; name: string } | undefined;
    let bestD = Infinity;
    if (!this.selfTile) return undefined;
    for (const e of gc.world.ents.values()) {
      if (e.kind !== 'n' || e.defId === undefined) continue;
      if (!gc.inTalkRange(e.x, e.y)) continue;
      const d = Math.hypot(e.x - this.selfTile.x, e.y - this.selfTile.y);
      if (d < bestD) {
        bestD = d;
        best = { id: e.id, name: e.name ?? e.defId };
      }
    }
    return best;
  }

  /** Inimigos vivos à vista (até 8 tiles, com linha de visão), do mais perto ao mais longe. */
  visibleEnemies(): ClientEnt[] {
    const gc = this.rt.gc;
    const me = this.selfTile;
    if (!me || !gc.map) return [];
    const out: { e: ClientEnt; d: number }[] = [];
    for (const e of gc.world.ents.values()) {
      if (e.kind !== 'e' || e.h <= 0) continue;
      const d = Math.hypot(e.x - me.x, e.y - me.y);
      if (d > VIEW_TILES || !hasLineOfSight(gc.map, me.x, me.y, e.x, e.y)) continue;
      out.push({ e, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out.map((o) => o.e);
  }

  /** Tab: próximo inimigo à vista. */
  cycleTarget(): void {
    const list = this.visibleEnemies();
    if (list.length === 0) return;
    const cur = this.rt.gc.currentTarget();
    const i = list.findIndex((e) => e.id === cur);
    const next = list[(i + 1) % list.length]!;
    const v = this.views.get(next.id);
    this.rt.gc.tapTarget(v ? v.px / T : next.x, v ? v.py / T : next.y, next.id);
    this.rt.tips.mark('alvo', performance.now());
  }

  /** Animação local de habilidade na hora do toque (o servidor confirma depois). */
  localCast(slot: 1 | 2 | 3 | 'especial'): void {
    const v = this.views.get(this.rt.gc.world.you);
    if (!v) return;
    const now = performance.now();
    this.lastLocalCast = now;
    v.playAction(slot === 'especial' ? 'especial' : 'habilidade', now, slot === 'especial' ? 600 : 400);
  }

  /** Converte tiles para px de tela (para o HUD). */
  toScreen(x: number, y: number, out: Vec): Vec {
    const cam = this.cameras.main;
    out.x = (x * T - cam.worldView.x) * cam.zoom;
    out.y = (y * T - cam.worldView.y) * cam.zoom;
    return out;
  }
}

function facingOf(vx: number, vy: number, fallback: number): number {
  if (Math.abs(vx) < 1e-6 && Math.abs(vy) < 1e-6) return fallback;
  if (Math.abs(vx) > Math.abs(vy)) return vx > 0 ? 3 : 1;
  return vy > 0 ? 0 : 2;
}

function isSpecial(abilityId: string): boolean {
  const a = getData().abilities.get(abilityId);
  return a?.slot === 'especial' || a?.slot === 'virada';
}

/** Margem de quem bateu: pelo arquétipo (jogador) ou pela ala atual (o próprio). */
function sideOf(defId: string | undefined, selfArch: string | undefined, isSelf: boolean): 'esquerda' | 'direita' | undefined {
  const D = getData();
  const id = isSelf ? (selfArch ?? defId) : defId;
  if (!id) return undefined;
  const a = D.archetypesById.get(id);
  if (a) return a.margem;
  const t = D.trainersById.get(id);
  if (t) return D.archetypesById.get(t.archetype)?.margem;
  return undefined;
}

/** Textura do saque: moeda pelo lk.currency, item pela raridade (lk.rarity ou items.json). */
function lootKey(defId: string, lk: unknown): string {
  const o = (lk && typeof lk === 'object' ? lk : {}) as { rarity?: string; currency?: string };
  if (o.currency === 'credito') return 'loot_credito';
  if (o.currency === 'semente' || o.currency === 'ambas' || defId === 'moeda') return 'loot_semente';
  const rarity = o.rarity ?? getData().itemsById.get(defId)?.rarity ?? (getData().uniquesById.has(defId) ? 'unico' : 'comum');
  return rarity === 'raro' ? 'loot_raro' : rarity === 'unico' ? 'loot_unico' : rarity === 'set' ? 'loot_set' : 'loot_comum';
}

/** Efeito do afixo de elite (o primeiro que tiver desenho). */
export function affixFx(lk: unknown): string | undefined {
  const list = (lk && typeof lk === 'object' ? (lk as { affixes?: unknown }).affixes : undefined) as string[] | undefined;
  if (!Array.isArray(list)) return undefined;
  for (const a of list) {
    if (a === 'rapido') return 'fx_poeira';
    if (a === 'cura_os_outros') return 'fx_cruz_verde';
    if (a === 'explode_ao_morrer') return 'fx_pavio';
  }
  return undefined;
}
