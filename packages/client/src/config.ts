/**
 * Configuração do cliente lida da URL (puro, testável).
 *
 * Parâmetros:
 * - ?server=host:porta   servidor de jogo (sem isso: porta 2567 no dev, mesma origem no build)
 * - ?lag=200&loss=0.02&jitter=20   rede ruim simulada nos dois sentidos (metade do lag em cada um)
 * - ?debug=1             ping e fps na tela
 * - ?gallery=1           galeria da arte
 * - ?offline=1           servidor local no próprio navegador (a simulação de shared), sem rede
 * - ?nome=Fulano&ala=idol   nome e ala de entrada (protótipo)
 */

export interface LocationLike {
  protocol: string;
  hostname: string;
  host: string;
  port: string;
}

export interface ClientConfig {
  /** endpoint http(s) do Colyseus */
  endpoint: string;
  /** RTT simulado total em ms (metade em cada sentido) */
  lag: number;
  /** chance de perda de cada mensagem, em cada sentido (0..1) */
  loss: number;
  /** variação total do atraso em ms (±jitter/2 em cada sentido) */
  jitter: number;
  debug: boolean;
  gallery: boolean;
  offline: boolean;
  name?: string;
  archetypeId?: string;
}

/** Porta do servidor de jogo (ARQUITETURA.md). */
export const SERVER_PORT = 2567;
/** Porta do Vite no dev. */
export const DEV_PORT = '5173';

const num = (v: string | null, def: number, min: number, max: number): number => {
  if (v === null || v.trim() === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
};

const flag = (v: string | null): boolean => v !== null && v !== '0' && v !== 'false';

/**
 * Endpoint do servidor:
 * - `server` explícito (host:porta, ou URL com protocolo);
 * - página no Vite (porta 5173): mesmo host na porta 2567;
 * - build servido pelo próprio servidor: mesma origem.
 */
export function resolveEndpoint(server: string | undefined | null, loc: LocationLike): string {
  const secure = loc.protocol === 'https:';
  const http = secure ? 'https:' : 'http:';
  if (server && server.trim() !== '') {
    const s = server.trim();
    if (/^(https?|wss?):\/\//i.test(s)) return s.replace(/^ws:/i, 'http:').replace(/^wss:/i, 'https:').replace(/\/$/, '');
    return `${http}//${s}`;
  }
  if (loc.port === DEV_PORT) return `${http}//${loc.hostname}:${SERVER_PORT}`;
  return `${http}//${loc.host}`;
}

export function parseConfig(search: string, loc: LocationLike): ClientConfig {
  const q = new URLSearchParams(search);
  const cfg: ClientConfig = {
    endpoint: resolveEndpoint(q.get('server'), loc),
    lag: num(q.get('lag'), 0, 0, 5000),
    loss: num(q.get('loss'), 0, 0, 0.9),
    jitter: num(q.get('jitter'), 0, 0, 2000),
    debug: flag(q.get('debug')),
    gallery: flag(q.get('gallery')),
    offline: flag(q.get('offline')),
  };
  const name = q.get('nome') ?? q.get('name');
  if (name && name.trim()) cfg.name = name.trim().slice(0, 20);
  const arch = q.get('ala') ?? q.get('arch');
  if (arch && /^[a-z_]+$/.test(arch)) cfg.archetypeId = arch;
  return cfg;
}
