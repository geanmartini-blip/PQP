/**
 * Conteúdo do mapa pelos marcadores: bandos, elite, chefe e NPCs de conversa. Renasce os inimigos
 * depois que o grupo inteiro caiu (RESPAWN_MS) e ninguém está perto do ponto.
 *
 * O núcleo da simulação não forma bandos sozinho: o spawner chama spawnPack (sim/ai_pack.ts) para
 * os bandos de um inimigo só (packId = id do marcador, escolta e promoção a elite pela
 * promocaoElite.chancePorBando). Bando misto no marcador nasce um por slot. Marcador 'inimigo' ou
 * 'chefe' de um inimigo com escolta (enemies.json) nasce com a escolta em volta, no mesmo bando
 * ("inimigos vêm em bandos"); o spawnPack não recebe afixos, por isso o líder nasce aqui.
 */
import { getData } from '@pqp/shared/data';
import { circleFree, isSolidTile } from '@pqp/shared/map';
import type { MapMarker } from '@pqp/shared/map';
import { msToTicks, spawnEnemy, spawnNpc, spawnPack, type EnemyTier, type Entity, type SpawnEnemyOpts, type World } from '@pqp/shared/sim';
import { enemyMind } from '@pqp/shared/sim/ai_state';
import { BAND_SPREAD_TILES, RESPAWN_MS, RESPAWN_SAFE_RADIUS } from './config';
import { npcDisplayName } from './handoff';

interface SpawnSlot {
  enemyId: string;
  x: number;
  y: number;
  opts: SpawnEnemyOpts;
  entityId?: number;
}

/** Um grupo que nasce e renasce junto (um bando, uma elite ou um chefe). */
export interface SpawnGroup {
  markerId: string;
  tier: EnemyTier;
  slots: SpawnSlot[];
  /** tick em que o grupo pode renascer (definido quando todos caíram) */
  respawnAt?: number;
  /**
   * Bando de um inimigo só: nasce por spawnPack (sim/ai_pack.ts), com packId = id do marcador,
   * escolta de enemies.json e a chance de um membro virar elite (promocaoElite.chancePorBando).
   * Os slots são refeitos a cada nascimento.
   */
  pack?: { enemyId: string; x: number; y: number; n: number };
  /**
   * Marcador 'inimigo' ou 'chefe' com escolta em enemies.json (ex.: o Cobrador do Capataz anda com
   * 2 capangas): o líder nasce com o tier, os afixos e o nível do marcador, e a escolta nasce em
   * volta, com o mesmo packId (id do marcador) e leaderId = líder, como no spawnPack. Os slots são
   * refeitos a cada nascimento.
   */
  lead?: { enemyId: string; x: number; y: number; opts: SpawnEnemyOpts };
}

export interface SpawnerOptions {
  respawnMs?: Partial<Record<EnemyTier, number>>;
  safeRadius?: number;
  log?: (msg: string) => void;
}

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

export class Spawner {
  readonly groups: SpawnGroup[] = [];
  readonly npcIds = new Map<string, number>(); // id do marcador -> entidade
  private respawnTicks: Record<EnemyTier, number>;
  private safeRadius: number;
  private log: (msg: string) => void;

  constructor(
    private w: World,
    opts: SpawnerOptions = {},
  ) {
    const r = { ...RESPAWN_MS, ...(opts.respawnMs ?? {}) };
    this.respawnTicks = { normal: msToTicks(r.normal), elite: msToTicks(r.elite), chefe: msToTicks(r.chefe) };
    this.safeRadius = opts.safeRadius ?? RESPAWN_SAFE_RADIUS;
    this.log = opts.log ?? (() => undefined);
  }

  /** Lê os marcadores do mapa e põe tudo no mundo. */
  populate(): void {
    const D = getData();
    for (const m of this.w.map.markers) {
      try {
        if (m.kind === 'npc' && m.ref) {
          const e = spawnNpc(this.w, m.ref, m.x, m.y);
          e.facing = 0;
          // Fase 3: IA de facção (faction_ai.json) e guia (guides.json) também têm nome nos dados
          const nome = npcDisplayName(m.ref);
          if (nome) e.name = nome;
          this.npcIds.set(m.id, e.id);
        } else if (m.kind === 'bando') {
          const ids = asStrings(m.params?.['inimigos']);
          if (ids.length === 0) continue;
          const def = D.enemiesById.get(ids[0]!);
          const nRaw = Number(m.params?.['n']);
          const n = Number.isFinite(nRaw) && nRaw > 0 ? Math.round(nRaw) : (def?.bando?.min ?? 1);
          if (ids.length === 1 && def) {
            this.addGroup({ markerId: m.id, tier: 'normal', slots: [], pack: { enemyId: def.id, x: m.x, y: m.y, n } });
            continue;
          }
          // bando misto (vários inimigos no marcador): um por slot, sem escolta nem promoção
          const slots: SpawnSlot[] = [];
          for (let i = 0; i < n; i++) {
            const enemyId = ids[i % ids.length]!;
            const r = D.enemiesById.get(enemyId)?.raioCorpoTiles ?? 0.4;
            const [x, y] = this.spreadPoint(m, i, n, r);
            slots.push({ enemyId, x, y, opts: {} });
          }
          this.addGroup({ markerId: m.id, tier: 'normal', slots });
        } else if ((m.kind === 'inimigo' || m.kind === 'chefe') && m.ref) {
          const def = D.enemiesById.get(m.ref);
          if (!def) {
            this.log(`[spawner] inimigo desconhecido no marcador ${m.id}: ${m.ref}`);
            continue;
          }
          const opts: SpawnEnemyOpts = {};
          const tier = m.params?.['tier'];
          if (tier === 'normal' || tier === 'elite' || tier === 'chefe') opts.tier = tier;
          const affixes = asStrings(m.params?.['affixes']);
          if (affixes.length > 0) opts.affixes = affixes;
          const lv = Number(m.params?.['level']);
          if (Number.isFinite(lv) && lv > 0) opts.level = lv;
          const tierOf = opts.tier ?? def.tier;
          if ((def.escolta ?? []).length > 0) {
            this.addGroup({ markerId: m.id, tier: tierOf, slots: [], lead: { enemyId: def.id, x: m.x, y: m.y, opts } });
            continue;
          }
          this.addGroup({ markerId: m.id, tier: tierOf, slots: [{ enemyId: def.id, x: m.x, y: m.y, opts }] });
        }
      } catch (err) {
        this.log(`[spawner] falha no marcador ${m.id}: ${String(err)}`);
      }
    }
  }

  private addGroup(g: SpawnGroup): void {
    this.groups.push(g);
    this.spawnGroup(g);
  }

  /** Ponto do i-ésimo membro de um bando: círculo em volta do marcador, só em chão livre. */
  private spreadPoint(m: Pick<MapMarker, 'x' | 'y'>, i: number, n: number, r: number): [number, number] {
    if (n <= 1) return [m.x, m.y];
    const ang = (i / n) * Math.PI * 2;
    for (const k of [1, 0.6, 0.3]) {
      const x = m.x + Math.cos(ang) * BAND_SPREAD_TILES * k;
      const y = m.y + Math.sin(ang) * BAND_SPREAD_TILES * k;
      if (!isSolidTile(this.w.map, Math.floor(x), Math.floor(y)) && circleFree(this.w.map, x, y, r)) return [x, y];
    }
    return [m.x, m.y];
  }

  private spawnGroup(g: SpawnGroup): void {
    if (g.pack) {
      const es = spawnPack(this.w, g.pack.enemyId, g.pack.x, g.pack.y, { n: g.pack.n, packId: g.markerId, spread: BAND_SPREAD_TILES });
      g.slots = es.map((e) => ({ enemyId: e.defId, x: e.x, y: e.y, opts: {}, entityId: e.id }));
      g.respawnAt = undefined;
      return;
    }
    if (g.lead) {
      this.spawnLed(g, g.lead);
      g.respawnAt = undefined;
      return;
    }
    for (const s of g.slots) {
      const e = spawnEnemy(this.w, s.enemyId, s.x, s.y, s.opts);
      s.entityId = e.id;
    }
    g.respawnAt = undefined;
  }

  /**
   * Líder com escolta: o líder no marcador, com as opções dele; a escolta (enemies.json, escolta[])
   * num anel em volta, quantidade sorteada pelo RNG do mundo entre min e max, no nível do marcador.
   */
  private spawnLed(g: SpawnGroup, lead: NonNullable<SpawnGroup['lead']>): void {
    const D = getData();
    const def = D.enemiesById.get(lead.enemyId)!;
    const leader = spawnEnemy(this.w, lead.enemyId, lead.x, lead.y, lead.opts);
    const all: Entity[] = [leader];
    const escorts: { id: string; r: number }[] = [];
    for (const esc of def.escolta ?? []) {
      const edef = D.enemiesById.get(esc.inimigo);
      if (!edef) continue;
      const q = this.w.rng.int(esc.min, esc.max);
      for (let i = 0; i < q; i++) escorts.push({ id: edef.id, r: edef.raioCorpoTiles });
    }
    escorts.forEach((esc, i) => {
      // anel em volta do líder (o líder fica no centro do marcador)
      const [x, y] = this.spreadPoint(lead, i, Math.max(2, escorts.length), esc.r);
      const m = spawnEnemy(this.w, esc.id, x, y, lead.opts.level !== undefined ? { level: lead.opts.level } : {});
      enemyMind(m).leaderId = leader.id;
      all.push(m);
    });
    for (const e of all) enemyMind(e).packId = g.markerId;
    g.slots = all.map((e) => ({ enemyId: e.defId, x: e.x, y: e.y, opts: {}, entityId: e.id }));
  }

  private alive(s: SpawnSlot): boolean {
    if (s.entityId === undefined) return false;
    const e = this.w.entities.get(s.entityId);
    return !!e && !e.dead;
  }

  private playerNear(g: SpawnGroup): boolean {
    const r2 = this.safeRadius * this.safeRadius;
    for (const e of this.w.entities.values()) {
      if (e.kind !== 'player' || e.dead || e.downedUntil !== undefined) continue;
      for (const s of g.slots) {
        const dx = e.x - s.x, dy = e.y - s.y;
        if (dx * dx + dy * dy <= r2) return true;
      }
    }
    return false;
  }

  /** Chamado depois de cada step: marca quando o grupo inteiro caiu e renasce no tempo. */
  tick(): void {
    for (const g of this.groups) {
      if (g.slots.some((s) => this.alive(s))) {
        g.respawnAt = undefined;
        continue;
      }
      if (g.respawnAt === undefined) {
        g.respawnAt = this.w.tick + this.respawnTicks[g.tier];
        continue;
      }
      if (this.w.tick < g.respawnAt || this.playerNear(g)) continue;
      // inimigo morto que ainda não saiu do mundo (recompensa pendente) sai agora
      for (const s of g.slots) if (s.entityId !== undefined && this.w.entities.get(s.entityId)?.dead) this.w.entities.delete(s.entityId);
      try {
        this.spawnGroup(g);
      } catch (err) {
        this.log(`[spawner] falha ao renascer ${g.markerId}: ${String(err)}`);
        g.respawnAt = this.w.tick + this.respawnTicks[g.tier];
      }
    }
  }

  /** Força o renascimento agora (testes e ferramentas). */
  respawnAllNow(): void {
    for (const g of this.groups) if (!g.slots.some((s) => this.alive(s))) g.respawnAt = this.w.tick;
  }
}
