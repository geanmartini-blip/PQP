/**
 * Primeira cena: gera as texturas fixas (efeitos, fonte e tileset), cria o cliente de rede, conecta
 * e, enquanto conecta, gera aos poucos (uma folha por quadro, atrás do "Preparando") as folhas que o
 * mapa vai pedir logo: o visual padrão, as duas alas do protótipo em aprendiz e veterano, os NPCs e
 * os inimigos dos marcadores. Assim o primeiro inimigo de cada tipo não trava o combate.
 * Depois abre o mundo e o HUD.
 */
import * as Phaser from 'phaser';
import { getMap, hasMap } from '@pqp/shared/map';
import { getData } from '@pqp/shared';
import { archetypeLook, createArt, defaultLook } from '../art/index';
import type { ArtApi } from '../art/contract';
import type { ClientConfig } from '../config';
import type { GameClient } from '../game/GameClient';
import { createRuntime, makeBaseTransport } from '../game/runtime';
import { installExitGuard } from '../ui/exitGuard';

// SUGESTÃO: mapa e alas pré-geradas (os do protótipo da Fase 1) e o tempo de geração por quadro.
const PREGEN_MAP = 'prototipo_delta';
const PREGEN_ALAS = ['peao_brabo', 'idol'] as const;
const PREGEN_BUDGET_MS = 10;

export class BootScene extends Phaser.Scene {
  private tasks: (() => void)[] = [];
  private done = 0;
  private ready = false;
  private started = false;
  private label?: Phaser.GameObjects.Text;

  constructor(private readonly cfg: ClientConfig) {
    super('BootScene');
  }

  create(): void {
    const art = createArt();
    art.fx(this);
    art.tileset(this);
    const px = (this.registry.get('px') as number | undefined) ?? 1;
    this.label = this.add
      .text(this.scale.width / 2, this.scale.height * 0.45, 'Preparando...', { fontFamily: '"Trebuchet MS", Verdana, sans-serif', fontSize: `${Math.round(16 * px)}px`, color: '#ffe8a0', align: 'center' })
      .setOrigin(0.5);
    this.tasks = pregenTasks(this, art);
    const ref: { gc?: GameClient } = {};
    void makeBaseTransport(this.cfg, () => ref.gc?.joinOptions() ?? {}).then(
      (base) => {
        const rt = createRuntime(this.cfg, art, base, ref);
        const guard = installExitGuard(
          (text) => rt.gc.pushNotice(text),
          () => rt.gc.welcomed && rt.gc.live,
        );
        rt.gc.onWelcome(() => guard?.arm());
        rt.gc.connect();
        this.ready = true;
      },
      (err) => {
        this.label?.setText(`Falhou ao carregar: ${String(err)}`);
      },
    );
  }

  override update(): void {
    if (this.started) return;
    const t0 = performance.now();
    while (this.done < this.tasks.length && performance.now() - t0 < PREGEN_BUDGET_MS) {
      try {
        this.tasks[this.done]!();
      } catch {
        // folha que falhou é gerada de novo quando a entidade aparecer
      }
      this.done++;
    }
    if (this.done < this.tasks.length) {
      this.label?.setText(`Preparando os bonecos ${this.done}/${this.tasks.length}`);
      return;
    }
    if (!this.ready) return;
    this.started = true;
    this.scene.start('WorldScene');
    this.scene.launch('HudScene');
    this.scene.bringToTop('HudScene');
  }
}

/** Folhas que o mapa do protótipo vai pedir logo (cada uma é uma tarefa de um quadro). */
function pregenTasks(scene: Phaser.Scene, art: ArtApi): (() => void)[] {
  const tasks: (() => void)[] = [() => void art.characterSheet(scene, defaultLook())];
  for (const a of PREGEN_ALAS) for (const tier of ['aprendiz', 'veterano'] as const) tasks.push(() => void art.characterSheet(scene, archetypeLook(a, tier)));
  if (!hasMap(PREGEN_MAP)) return tasks;
  const D = getData();
  const enemies = new Map<string, Set<'normal' | 'elite' | 'chefe'>>();
  const npcs = new Set<string>();
  const addEnemy = (id: string, tier: 'normal' | 'elite' | 'chefe') => {
    if (!D.enemiesById.has(id)) return;
    let s = enemies.get(id);
    if (!s) enemies.set(id, (s = new Set()));
    s.add(tier);
  };
  for (const m of getMap(PREGEN_MAP).markers) {
    if (m.kind === 'npc' && m.ref) npcs.add(m.ref);
    if (m.kind !== 'bando' && m.kind !== 'inimigo' && m.kind !== 'chefe') continue;
    const params = (m.params ?? {}) as Record<string, unknown>;
    const ids = [m.ref, ...(Array.isArray(params['inimigos']) ? params['inimigos'].map(String) : [])].filter((x): x is string => typeof x === 'string' && x.length > 0);
    const tier = m.kind === 'chefe' ? 'chefe' : params['tier'] === 'elite' ? 'elite' : 'normal';
    for (const id of ids) {
      addEnemy(id, tier);
      // bandos podem promover um membro a elite (spawnPack)
      if (m.kind === 'bando') addEnemy(id, 'elite');
    }
  }
  for (const id of npcs) tasks.push(() => void art.npcSheet(scene, id));
  for (const [id, tiers] of enemies) for (const t of tiers) tasks.push(() => void art.enemySheet(scene, id, t));
  return tasks;
}
