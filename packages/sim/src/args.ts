/**
 * Leitura dos argumentos do simulador.
 *
 * Opções: --modo 1v1|um_contra_um|grupo|grupo_contra_grupo, --n N, --a ID, --b ID, --todos,
 * --arquetipos id1,id2,..., --seed S, --nivel L, --tempo S (máximo por luta), --distancia D,
 * --grupo K (tamanho do grupo), --json (relatório em JSON).
 *
 * Desde a integração da Fase 1, o script "sim" da raiz repassa as opções com "--"
 * (npm run sim -- --modo 1v1 --n 500). Continua aceitando a forma antiga, em que o npm comia os
 * nomes das opções e repassava só os valores: os valores soltos são lidos pela forma: modo (1v1,
 * grupo...), número (n e depois seed) e ids de arquétipo (a e depois b); --todos e --json chegam
 * pelo ambiente (npm_config_todos, npm_config_json).
 */
import { getData } from '@pqp/shared';
import type { Modo } from './tournament';

export interface SimArgs {
  modo?: Modo;
  n?: number;
  a?: string;
  b?: string;
  todos?: boolean;
  arquetipos?: string[];
  seed?: number;
  nivel?: number;
  tempo?: number;
  distancia?: number;
  grupo?: number;
  json?: boolean;
}

export const MODOS: Readonly<Record<string, Modo>> = {
  '1v1': 'um_contra_um',
  um_contra_um: 'um_contra_um',
  grupo: 'grupo_contra_grupo',
  grupo_contra_grupo: 'grupo_contra_grupo',
  gvg: 'grupo_contra_grupo',
};

const numArg = (k: string, v: string | undefined): number => {
  const n = Number(v);
  if (v === undefined || !Number.isFinite(n)) throw new Error(`--${k} precisa de um número`);
  return n;
};

export function parseArgs(argv: readonly string[], env: Record<string, string | undefined> = {}): SimArgs {
  const out: SimArgs = {};
  const loose: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!;
    if (!tok.startsWith('--')) {
      loose.push(tok);
      continue;
    }
    const eq = tok.indexOf('=');
    const k = eq >= 0 ? tok.slice(2, eq) : tok.slice(2);
    const inline = eq >= 0 ? tok.slice(eq + 1) : undefined;
    const val = () => inline ?? argv[++i];
    switch (k) {
      case 'modo': {
        const v = val() ?? '';
        const m = MODOS[v];
        if (!m) throw new Error(`modo desconhecido: ${v} (use 1v1 ou grupo)`);
        out.modo = m;
        break;
      }
      case 'n':
        out.n = numArg(k, val());
        break;
      case 'a':
        out.a = val();
        break;
      case 'b':
        out.b = val();
        break;
      case 'todos':
        out.todos = true;
        break;
      case 'arquetipos':
        out.arquetipos = (val() ?? '').split(',').filter(Boolean);
        break;
      case 'seed':
        out.seed = numArg(k, val());
        break;
      case 'nivel':
        out.nivel = numArg(k, val());
        break;
      case 'tempo':
        out.tempo = numArg(k, val());
        break;
      case 'distancia':
        out.distancia = numArg(k, val());
        break;
      case 'grupo':
        out.grupo = numArg(k, val());
        break;
      case 'json':
        out.json = true;
        break;
      default:
        throw new Error(`opção desconhecida: --${k}`);
    }
  }
  // valores soltos (npm run sim da raiz sem "--"): lidos pela forma
  const arch = getData().archetypesById;
  const nums: number[] = [];
  for (const tok of loose) {
    const m = MODOS[tok];
    if (m) {
      out.modo ??= m;
    } else if (tok === 'todos') out.todos = true;
    else if (/^\d+$/.test(tok)) nums.push(Number(tok));
    else if (arch.has(tok)) {
      if (!out.a) out.a = tok;
      else if (!out.b) out.b = tok;
    } else if (tok.includes(',') && tok.split(',').every((x) => arch.has(x))) out.arquetipos = tok.split(',');
    else throw new Error(`argumento desconhecido: ${tok}`);
  }
  if (out.n === undefined && nums.length > 0) out.n = nums.shift();
  if (out.seed === undefined && nums.length > 0) out.seed = nums.shift();
  if (env['npm_config_todos'] === 'true') out.todos = true;
  if (env['npm_config_json'] === 'true') out.json = true;
  for (const id of [out.a, out.b, ...(out.arquetipos ?? [])]) if (id && !arch.has(id)) throw new Error(`arquétipo não existe: ${id}`);
  return out;
}
