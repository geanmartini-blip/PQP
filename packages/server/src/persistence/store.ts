/**
 * Persistência dos jogadores.
 *
 * - Store: interface usada pelo servidor (o núcleo não sabe onde os dados moram).
 * - MemoryStore: só na memória (testes).
 * - FileStore: JSON em .data/players.json na raiz do projeto. Escrita atômica (arquivo temporário +
 *   rename) e com debounce. É o padrão: funciona sem nada instalado.
 * - SupabaseStore: liga quando SUPABASE_URL e SUPABASE_SERVICE_KEY existem. Usa a tabela `players`.
 *   Não foi testado contra um Supabase de verdade (não há conta ainda; ver PENDENTE.md).
 *
 * SQL da tabela para o Supabase (Postgres):
 *
 *   create table if not exists public.players (
 *     id uuid primary key default gen_random_uuid(),
 *     token text not null unique,
 *     name text not null,
 *     data jsonb not null default '{}'::jsonb,
 *     created_at timestamptz not null default now(),
 *     updated_at timestamptz not null default now()
 *   );
 *
 * O token é o login de convidado: gerado no aparelho (ou pelo servidor) até o Supabase Auth entrar.
 */
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DoctrineCard } from '@pqp/shared/sim';

/** Dados do personagem guardados entre sessões (subconjunto do modelo `player` do CLAUDE.md). */
export interface PlayerData {
  /** arquétipo, classe ou 'delta' */
  archetypeId?: string;
  slot3?: string;
  level?: number;
  xp?: number;
  semente?: number;
  credito?: number;
  inventory?: string[];
  /** poções no botão de item */
  itemCount?: number;
  doctrine?: DoctrineCard[];
  auto?: boolean;
  /** aparência em camadas (body, skin, face, hair, hairColor, details); a criação de personagem é da Fase 2 */
  appearance?: Record<string, unknown>;
  /** paleta do traje (0..2) */
  palette?: number;
  [key: string]: unknown;
}

export interface PlayerRecord {
  id: string;
  token: string;
  name: string;
  data: PlayerData;
}

export interface Store {
  readonly kind: 'memoria' | 'arquivo' | 'supabase';
  /** jogador do token; cria um novo (com `name`) se não existir */
  getOrCreatePlayer(token: string, name?: string): Promise<PlayerRecord>;
  /** grava (cria ou substitui) o registro */
  savePlayer(rec: PlayerRecord): Promise<void>;
  /** grava o que estiver pendente agora */
  flush(): Promise<void>;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const newRecord = (token: string, name?: string): PlayerRecord => ({
  id: randomUUID(),
  token,
  name: name ?? 'Visitante',
  data: {},
});

// ---------------------------------------------------------------------------

/** Só na memória: testes e servidor sem disco. */
export class MemoryStore implements Store {
  readonly kind = 'memoria' as const;
  readonly byToken = new Map<string, PlayerRecord>();
  saves = 0;

  async getOrCreatePlayer(token: string, name?: string): Promise<PlayerRecord> {
    let r = this.byToken.get(token);
    if (!r) {
      r = newRecord(token, name);
      this.byToken.set(token, r);
    }
    return clone(r);
  }

  async savePlayer(rec: PlayerRecord): Promise<void> {
    this.saves++;
    this.byToken.set(rec.token, clone(rec));
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

interface FileShape {
  version: 1;
  players: PlayerRecord[];
}

/**
 * JSON em disco. Lê uma vez, guarda na memória e grava o arquivo inteiro com debounce. A gravação
 * escreve num temporário e troca pelo rename (atômico no mesmo disco), com novas tentativas quando o
 * Windows ou o OneDrive seguram o arquivo (EPERM/EBUSY).
 */
export class FileStore implements Store {
  readonly kind = 'arquivo' as const;
  private byToken = new Map<string, PlayerRecord>();
  private loaded: Promise<void> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private dirty = false;
  private writing: Promise<void> = Promise.resolve();
  writes = 0;

  constructor(
    readonly file: string = defaultPlayersFile(),
    readonly debounceMs = 1000,
  ) {}

  private load(): Promise<void> {
    this.loaded ??= (async () => {
      try {
        const txt = await fsp.readFile(this.file, 'utf8');
        const parsed = JSON.parse(txt) as Partial<FileShape>;
        for (const p of parsed.players ?? []) if (p && typeof p.token === 'string') this.byToken.set(p.token, p);
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

  async getOrCreatePlayer(token: string, name?: string): Promise<PlayerRecord> {
    await this.load();
    let r = this.byToken.get(token);
    if (!r) {
      r = newRecord(token, name);
      this.byToken.set(token, r);
      this.schedule();
    }
    return clone(r);
  }

  async savePlayer(rec: PlayerRecord): Promise<void> {
    await this.load();
    this.byToken.set(rec.token, clone(rec));
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
      const body: FileShape = { version: 1, players: Array.from(this.byToken.values()) };
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
 * Supabase (Postgres). Tabela `players` (SQL no topo deste arquivo). As gravações ficam numa fila
 * por token e saem a cada `debounceMs`, para não mandar um upsert por tick.
 * Sem teste real: não há projeto Supabase ainda.
 */
export class SupabaseStore implements Store {
  readonly kind = 'supabase' as const;
  private pending = new Map<string, PlayerRecord>();
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

  async getOrCreatePlayer(token: string, name?: string): Promise<PlayerRecord> {
    const sb = await this.client;
    const found = await sb.from(this.table).select('id, token, name, data').eq('token', token).maybeSingle();
    if (found.error) throw new Error(`supabase: ${found.error.message}`);
    if (found.data) return found.data as PlayerRecord;
    const created = await sb
      .from(this.table)
      .insert({ token, name: name ?? 'Visitante', data: {} })
      .select('id, token, name, data')
      .single();
    if (created.error) throw new Error(`supabase: ${created.error.message}`);
    return created.data as PlayerRecord;
  }

  async savePlayer(rec: PlayerRecord): Promise<void> {
    this.pending.set(rec.token, clone(rec));
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
