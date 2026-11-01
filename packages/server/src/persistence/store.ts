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

export interface Store {
  readonly kind: 'memoria' | 'arquivo' | 'supabase';
  /** jogador do token; cria um novo (com `name`, ainda sem personagem: criado=false) se não existir */
  getOrCreatePlayer(token: string, name?: string): Promise<StoredPlayer>;
  /** grava (cria ou substitui) o registro */
  savePlayer(rec: StoredPlayer): Promise<void>;
  /** grava o que estiver pendente agora */
  flush(): Promise<void>;
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
      if (!this.dirty) return;
      this.dirty = false;
      const body: FileShape = { version: FILE_VERSION, players: Array.from(this.byToken.values()) };
      const json = JSON.stringify(body, null, 1);
      await fsp.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, json, 'utf8');
      for (let attempt = 0; ; attempt++) {
        try {
          await fsp.rename(tmp, this.file);
          break;
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (attempt >= 5 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) {
            this.dirty = true; // tenta de novo na próxima
            throw err;
          }
          await sleep(50 * (attempt + 1));
        }
      }
      this.writes++;
    }).catch((err) => {
      console.warn(`[store] falha ao gravar ${this.file}: ${String(err)}`);
    });
    return this.writing;
  }

  async flush(): Promise<void> {
    await this.load();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    await this.writeNow();
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
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, this.debounceMs);
    this.timer.unref?.();
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.pending.size === 0) return;
    const rows = Array.from(this.pending.values()).map((r) => ({ id: r.id, token: r.token, name: r.name, data: r.data, updated_at: new Date().toISOString() }));
    this.pending.clear();
    const sb = await this.client;
    const res = await sb.from(this.table).upsert(rows, { onConflict: 'id' });
    if (res.error) console.warn(`[store] supabase upsert falhou: ${res.error.message}`);
  }
}

/** O pedaço do cliente do supabase-js que usamos (evita depender dos tipos genéricos dele). */
interface SupabaseLike {
  from(table: string): {
    select(cols: string): { eq(col: string, v: string): { maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }> } };
    insert(row: unknown): { select(cols: string): { single(): Promise<{ data: unknown; error: { message: string } | null }> } };
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
