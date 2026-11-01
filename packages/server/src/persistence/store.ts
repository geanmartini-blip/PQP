/**
 * Persistência dos jogadores.
 *
 * - Store: interface usada pelo servidor (o núcleo não sabe onde os dados moram).
 * - MemoryStore: só na memória (testes).
 * - FileStore: JSON em .data/players.json na raiz do projeto. Escrita atômica (arquivo temporário +
 *   rename) e com debounce. É o padrão: funciona sem nada instalado.
 * - SupabaseStore: liga quando SUPABASE_URL e SUPABASE_SERVICE_KEY existem. Usa a tabela `players`
 *   (supabase/migrations/0001_players.sql e 0002_player_record_v2.sql). Não foi testado contra um
 *   Supabase de verdade (não há conta ainda; ver PENDENTE.md).
 *
 * Fase 2: a linha guarda o PlayerRecord inteiro das regras (shared/game, version 2) em `data`;
 * `id` e `name` repetem rec.id e rec.name para consulta. Toda linha lida passa por migrateRow, que
 * aceita a linha da Fase 1 ({ id, token, name, data: { archetypeId, level, xp, ... } }) e a da Fase 2.
 *
 * O token é o login de convidado: gerado no aparelho (ou pelo servidor) até o Supabase Auth entrar.
 *
 * Fase 4 (métodos opcionais da interface): findPlayerById (visitas de casa), loadWorld/saveWorld
 * (a cidade: mercado e câmbio; FileStore em .data/world.json, Supabase na tabela world_state) e
 * logEvents (log de economia; FileStore em .data/events.jsonl, Supabase na tabela event_log, ver
 * supabase/migrations/0003_economia.sql).
 */
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePlayerRecord, newPlayerRecord } from '@pqp/shared/game/record';
import type { PlayerRecord as GameRecord } from '@pqp/shared/game/types';

/** Linha de um jogador: token (login de convidado) e o registro das regras. */
export interface StoredPlayer {
  id: string;
  token: string;
  name: string;
  /** PlayerRecord da Fase 2 (shared/game/types.ts), sempre version 2 depois de migrateRow */
  data: GameRecord;
}

/** Fase 4: evento do log de economia (event_log). `at` em ms. */
export interface EconomyLogEvent {
  at: number;
  tipo: string;
  jogador?: string;
  mapa?: string;
  dados?: Record<string, unknown>;
}

export interface Store {
  readonly kind: 'memoria' | 'arquivo' | 'supabase';
  /** jogador do token; cria um novo (com `name`, ainda sem personagem: criado=false) se não existir */
  getOrCreatePlayer(token: string, name?: string): Promise<StoredPlayer>;
  /** grava (cria ou substitui) o registro */
  savePlayer(rec: StoredPlayer): Promise<void>;
  /** grava o que estiver pendente agora */
  flush(): Promise<void>;
  // ---- Fase 4 (opcionais: um Store antigo continua valendo) ----
  /** jogador pelo id do registro (visitas de casa); undefined se não existir */
  findPlayerById?(id: string): Promise<StoredPlayer | undefined>;
  /** estado global (a cidade: mercado e câmbio) por chave */
  loadWorld?(key: string): Promise<unknown>;
  saveWorld?(key: string, data: unknown): Promise<void>;
  /** acrescenta eventos ao log de economia */
  logEvents?(events: EconomyLogEvent[]): Promise<void>;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// SUGESTÃO: nome de quem entra sem nome (o cadastro do Delta troca).
const DEFAULT_NAME = 'Visitante';

/** Linha nova: registro da Fase 2 no Delta, nível 1, sem personagem criado. */
export function newStoredPlayer(token: string, name?: string): StoredPlayer {
  const id = randomUUID();
  const rec = newPlayerRecord(id, name ?? DEFAULT_NAME);
  return { id, token, name: rec.name, data: rec };
}

/**
 * Lê uma linha de qualquer fase e devolve a linha da Fase 2 (ou undefined, sem token).
 * - Fase 2: data.version >= 2, passa por migratePlayerRecord (completa campos que faltarem);
 * - Fase 1: { id, token, name, data: PlayerData }, migratePlayerRecord converte (ala vira margem).
 */
export function migrateRow(raw: unknown): StoredPlayer | undefined {
  if (!isObj(raw)) return undefined;
  const token = raw['token'];
  if (typeof token !== 'string' || token.length === 0) return undefined;
  const id = typeof raw['id'] === 'string' && raw['id'].length > 0 ? raw['id'] : randomUUID();
  const d = raw['data'];
  const v2 = isObj(d) && typeof d['version'] === 'number' && d['version'] >= 2;
  const rec = migratePlayerRecord(v2 ? d : { id, name: raw['name'], data: isObj(d) ? d : {} }, id);
  rec.id = id;
  return { id, token, name: rec.name, data: rec };
}

/** Linha pronta para gravar: id e name iguais aos do registro. */
function normalizeRow(rec: StoredPlayer): StoredPlayer {
  const c = clone(rec);
  c.data.id = c.id;
  c.name = c.data.name;
  return c;
}

// ---------------------------------------------------------------------------

/** Só na memória: testes e servidor sem disco. */
export class MemoryStore implements Store {
  readonly kind = 'memoria' as const;
  readonly byToken = new Map<string, StoredPlayer>();
  saves = 0;

  async getOrCreatePlayer(token: string, name?: string): Promise<StoredPlayer> {
    let r = this.byToken.get(token);
    if (!r) {
      r = newStoredPlayer(token, name);
      this.byToken.set(token, r);
    }
    return clone(r);
  }

  async savePlayer(rec: StoredPlayer): Promise<void> {
    this.saves++;
    this.byToken.set(rec.token, normalizeRow(rec));
  }

  async flush(): Promise<void> {}

  readonly world = new Map<string, unknown>();
  readonly events: EconomyLogEvent[] = [];

  async findPlayerById(id: string): Promise<StoredPlayer | undefined> {
    for (const r of this.byToken.values()) if (r.id === id) return clone(r);
    return undefined;
  }

  async loadWorld(key: string): Promise<unknown> {
    const v = this.world.get(key);
    return v === undefined ? undefined : clone(v);
  }

  async saveWorld(key: string, data: unknown): Promise<void> {
    this.world.set(key, clone(data));
  }

  async logEvents(events: EconomyLogEvent[]): Promise<void> {
    this.events.push(...clone(events));
  }
}

// ---------------------------------------------------------------------------

/** Raiz do projeto (packages/server/src/persistence → ../../../..). */
export function projectRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', '..', '..');
}

/** Caminho padrão: PQP_DATA_DIR/players.json ou <raiz>/.data/players.json. */
export function defaultPlayersFile(): string {
  const dir = process.env['PQP_DATA_DIR'] ? path.resolve(process.env['PQP_DATA_DIR']) : path.join(projectRoot(), '.data');
  return path.join(dir, 'players.json');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Versão do arquivo: 1 = linhas da Fase 1, 2 = linhas com o PlayerRecord da Fase 2. */
export const FILE_VERSION = 2;

interface FileShape {
  version: number;
  players: StoredPlayer[];
}

/**
 * JSON em disco. Lê uma vez (migrando cada linha), guarda na memória e grava o arquivo inteiro com
 * debounce. A gravação escreve num temporário e troca pelo rename (atômico no mesmo disco), com
 * novas tentativas quando o Windows ou o OneDrive seguram o arquivo (EPERM/EBUSY).
 */
export class FileStore implements Store {
  readonly kind = 'arquivo' as const;
  private byToken = new Map<string, StoredPlayer>();
  private loaded: Promise<void> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private dirty = false;
  private writing: Promise<void> = Promise.resolve();
  writes = 0;
  /** linhas que vieram de uma versão antiga e foram migradas na leitura */
  migrated = 0;

  constructor(
    readonly file: string = defaultPlayersFile(),
    readonly debounceMs = 1000,
  ) {}

  private load(): Promise<void> {
    this.loaded ??= (async () => {
      try {
        const txt = await fsp.readFile(this.file, 'utf8');
        const parsed = JSON.parse(txt) as Partial<FileShape>;
        for (const p of parsed.players ?? []) {
          const old = !isObj(p) || !isObj(p['data']) || typeof p['data']['version'] !== 'number' || (p['data']['version'] as number) < 2;
          const row = migrateRow(p);
          if (!row) continue;
          if (old) this.migrated++;
          this.byToken.set(row.token, row);
        }
        // grava já no formato novo (sem perder o original: o rename só troca depois de escrever)
        if (this.migrated > 0 || parsed.version !== FILE_VERSION) this.schedule();
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') {
          // arquivo corrompido: guarda uma cópia e começa vazio, sem perder o original
          const bak = `${this.file}.corrompido-${process.pid}`;
          await fsp.copyFile(this.file, bak).catch(() => undefined);
          console.warn(`[store] não consegui ler ${this.file} (${String(err)}); cópia em ${bak}`);
        }
      }
    })();
    return this.loaded;
  }

  async getOrCreatePlayer(token: string, name?: string): Promise<StoredPlayer> {
    await this.load();
    let r = this.byToken.get(token);
    if (!r) {
      r = newStoredPlayer(token, name);
      this.byToken.set(token, r);
      this.schedule();
    }
    return clone(r);
  }

  async savePlayer(rec: StoredPlayer): Promise<void> {
    await this.load();
    this.byToken.set(rec.token, normalizeRow(rec));
    this.schedule();
  }

  private schedule(): void {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.writeNow();
    }, this.debounceMs);
    this.timer.unref?.();
  }

  /** Grava agora (em fila: uma gravação de cada vez). */
  private writeNow(): Promise<void> {
    this.writing = this.writing.then(async () => {
      if (this.dirty) {
        this.dirty = false;
        const body: FileShape = { version: FILE_VERSION, players: Array.from(this.byToken.values()) };
        try {
          await atomicWrite(this.file, JSON.stringify(body, null, 1));
        } catch (err) {
          this.dirty = true; // tenta de novo na próxima
          throw err;
        }
        this.writes++;
      }
      if (this.worldDirty) {
        this.worldDirty = false;
        try {
          await atomicWrite(this.worldFile, JSON.stringify({ version: 1, world: Object.fromEntries(this.world) }));
        } catch (err) {
          this.worldDirty = true;
          throw err;
        }
      }
    }).catch((err) => {
      console.warn(`[store] falha ao gravar ${this.file}: ${String(err)}`);
    });
    return this.writing;
  }

  async flush(): Promise<void> {
    await this.load();
    await this.loadWorldFile();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    await this.writeNow();
    await this.appending;
  }

  // ---- Fase 4: estado global (world.json) e log de economia (events.jsonl), na mesma pasta ----

  private world = new Map<string, unknown>();
  private worldLoaded: Promise<void> | undefined;
  private worldDirty = false;
  private appending: Promise<void> = Promise.resolve();

  get worldFile(): string {
    return path.join(path.dirname(this.file), 'world.json');
  }

  get eventsFile(): string {
    return path.join(path.dirname(this.file), 'events.jsonl');
  }

  private loadWorldFile(): Promise<void> {
    this.worldLoaded ??= (async () => {
      try {
        const parsed = JSON.parse(await fsp.readFile(this.worldFile, 'utf8')) as { world?: Record<string, unknown> };
        for (const [k, v] of Object.entries(parsed.world ?? {})) this.world.set(k, v);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') {
          const bak = `${this.worldFile}.corrompido-${process.pid}`;
          await fsp.copyFile(this.worldFile, bak).catch(() => undefined);
          console.warn(`[store] não consegui ler ${this.worldFile} (${String(err)}); cópia em ${bak}`);
        }
      }
    })();
    return this.worldLoaded;
  }

  async findPlayerById(id: string): Promise<StoredPlayer | undefined> {
    await this.load();
    for (const r of this.byToken.values()) if (r.id === id) return clone(r);
    return undefined;
  }

  async loadWorld(key: string): Promise<unknown> {
    await this.loadWorldFile();
    const v = this.world.get(key);
    return v === undefined ? undefined : clone(v);
  }

  async saveWorld(key: string, data: unknown): Promise<void> {
    await this.loadWorldFile();
    this.world.set(key, clone(data));
    this.worldDirty = true;
    this.schedule();
  }

  async logEvents(events: EconomyLogEvent[]): Promise<void> {
    if (events.length === 0) return;
    const lines = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    this.appending = this.appending
      .then(async () => {
        await fsp.mkdir(path.dirname(this.eventsFile), { recursive: true });
        await fsp.appendFile(this.eventsFile, lines, 'utf8');
      })
      .catch((err) => console.warn(`[store] falha ao gravar ${this.eventsFile}: ${String(err)}`));
    return this.appending;
  }
}

/** Escreve num temporário e troca pelo rename, com novas tentativas (Windows e OneDrive seguram o arquivo). */
async function atomicWrite(file: string, json: string): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, json, 'utf8');
  for (let attempt = 0; ; attempt++) {
    try {
      await fsp.rename(tmp, file);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= 5 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw err;
      await sleep(50 * (attempt + 1));
    }
  }
}

// ---------------------------------------------------------------------------

/**
 * Supabase (Postgres). Tabela `players` (supabase/migrations). As gravações ficam numa fila por
 * token e saem a cada `debounceMs`, para não mandar um upsert por tick. A leitura confere a fila
 * antes do banco: a travessia grava e o jogador entra na sala da margem logo em seguida.
 * Sem teste real: não há projeto Supabase ainda.
 */
export class SupabaseStore implements Store {
  readonly kind = 'supabase' as const;
  private pending = new Map<string, StoredPlayer>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private client: Promise<SupabaseLike>;

  constructor(
    url: string,
    serviceKey: string,
    readonly table = 'players',
    readonly debounceMs = 2000,
  ) {
    this.client = import('@supabase/supabase-js').then(
      (m) => m.createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as SupabaseLike,
    );
  }

  async getOrCreatePlayer(token: string, name?: string): Promise<StoredPlayer> {
    const queued = this.pending.get(token);
    if (queued) return clone(queued);
    const sb = await this.client;
    const found = await sb.from(this.table).select('id, token, name, data').eq('token', token).maybeSingle();
    if (found.error) throw new Error(`supabase: ${found.error.message}`);
    if (found.data) {
      const row = migrateRow(found.data);
      if (row) return row;
    }
    const fresh = newStoredPlayer(token, name);
    const created = await sb.from(this.table).insert({ id: fresh.id, token, name: fresh.name, data: fresh.data }).select('id, token, name, data').single();
    if (created.error) throw new Error(`supabase: ${created.error.message}`);
    return migrateRow(created.data) ?? fresh;
  }

  async savePlayer(rec: StoredPlayer): Promise<void> {
    this.pending.set(rec.token, normalizeRow(rec));
    this.scheduleFlush();
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    const sb = await this.client;
    if (this.pending.size > 0) {
      const rows = Array.from(this.pending.values()).map((r) => ({ id: r.id, token: r.token, name: r.name, data: r.data, updated_at: new Date().toISOString() }));
      this.pending.clear();
      const res = await sb.from(this.table).upsert(rows, { onConflict: 'id' });
      if (res.error) console.warn(`[store] supabase upsert falhou: ${res.error.message}`);
    }
    // Fase 4: estado global e log de economia
    if (this.worldPending.size > 0) {
      const rows = Array.from(this.worldPending, ([key, data]) => ({ key, data, updated_at: new Date().toISOString() }));
      this.worldPending.clear();
      const res = await sb.from('world_state').upsert(rows, { onConflict: 'key' });
      if (res.error) console.warn(`[store] supabase world_state falhou: ${res.error.message}`);
    }
    if (this.eventsPending.length > 0) {
      const rows = this.eventsPending.splice(0).map((e) => ({ at: new Date(e.at).toISOString(), tipo: e.tipo, player_id: e.jogador ?? null, map_id: e.mapa ?? null, data: e.dados ?? {} }));
      const res = await sb.from('event_log').insert(rows);
      if (res.error) console.warn(`[store] supabase event_log falhou: ${res.error.message}`);
    }
  }

  // ---- Fase 4 ----

  private worldPending = new Map<string, unknown>();
  private eventsPending: EconomyLogEvent[] = [];

  private scheduleFlush(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, this.debounceMs);
    this.timer.unref?.();
  }

  async findPlayerById(id: string): Promise<StoredPlayer | undefined> {
    for (const r of this.pending.values()) if (r.id === id) return clone(r);
    const sb = await this.client;
    const found = await sb.from(this.table).select('id, token, name, data').eq('id', id).maybeSingle();
    if (found.error) throw new Error(`supabase: ${found.error.message}`);
    return found.data ? migrateRow(found.data) : undefined;
  }

  async loadWorld(key: string): Promise<unknown> {
    if (this.worldPending.has(key)) return clone(this.worldPending.get(key));
    const sb = await this.client;
    const found = await sb.from('world_state').select('data').eq('key', key).maybeSingle();
    if (found.error) throw new Error(`supabase: ${found.error.message}`);
    return isObj(found.data) ? found.data['data'] : undefined;
  }

  async saveWorld(key: string, data: unknown): Promise<void> {
    this.worldPending.set(key, clone(data));
    this.scheduleFlush();
  }

  async logEvents(events: EconomyLogEvent[]): Promise<void> {
    this.eventsPending.push(...clone(events));
    this.scheduleFlush();
  }
}

type SbResult = Promise<{ data: unknown; error: { message: string } | null }>;

/** O pedaço do cliente do supabase-js que usamos (evita depender dos tipos genéricos dele). */
interface SupabaseLike {
  from(table: string): {
    select(cols: string): { eq(col: string, v: string): { maybeSingle(): SbResult } };
    insert(row: unknown): PromiseLike<{ error: { message: string } | null }> & { select(cols: string): { single(): SbResult } };
    upsert(rows: unknown, opts: { onConflict: string }): Promise<{ error: { message: string } | null }>;
  };
}

// ---------------------------------------------------------------------------

/** Escolhe o Store pelo ambiente: Supabase com as duas chaves, senão FileStore. */
export function createStore(env: NodeJS.ProcessEnv = process.env): Store {
  const url = env['SUPABASE_URL'];
  const key = env['SUPABASE_SERVICE_KEY'];
  if (url && key) return new SupabaseStore(url, key);
  return new FileStore();
}
