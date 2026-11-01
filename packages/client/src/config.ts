/**
 * Configuração do cliente lida da URL (puro, testável).
 *
 * Parâmetros:
 * - ?server=host:porta   servidor de jogo (sem isso: porta 2567 no dev, mesma origem no build)
 * - ?lag=200&loss=0.02&jitter=20   rede ruim simulada nos dois sentidos (metade do lag em cada um)
 * - ?debug=1             ping e fps na tela
 * - ?gallery=1           galeria da arte
 * - ?offline=1           servidor local no próprio navegador (a simulação de shared), sem rede.
 *                        No build "app" (npm run build:app, o do GitHub Pages) o offline já vem
 *                        ligado; ?offline=0 desliga.
 * - ?nome=Fulano&ala=idol   nome e ala de entrada (protótipo)
 * - ?dpr=2               densidade do canvas (padrão: a do aparelho, até 3; 1 = mais leve)
 * - ?dev_travessia=1     (com ?offline=1) Bruno derrotado e nível 8 no Delta: testar o barco
 *                        (lido em game/runtime.ts)
 *
 * Atalhos de desenvolvimento: só no `npm run dev` (import.meta.env.DEV) e no modo offline; o build
 * de produção e o app ignoram. Valem para o personagem já criado (num aparelho novo, crie e ele
 * entra pronto). Mexem no save offline deste navegador.
 * - ?dev_nivel=N         leva o personagem ao nível N (1 a 60). Do 8 em diante faz a travessia pelas
 *                        regras de shared (applyTravessia): margem, instituição da 1ª da lista e o
 *                        1º guia. A ala do 12 fica pendente no MENU, como no jogo.
 * - ?dev_mapa=<mapId>    nasce no mapa: delta, margem_esquerda, margem_direita, usina_da_ponte ou
 *                        juncal. Um mapa das margens faz a travessia (nível 8 no mínimo) e escolhe a
 *                        margem dele; usina e juncal usam a Esquerda.
 *   Ex.: http://localhost:5173/?offline=1&dev_nivel=12&dev_mapa=margem_direita
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
  /** densidade do canvas pedida na URL (sem isso, a do aparelho) */
  dpr?: number;
  /** dev: ?dev_nivel=N (só vale no dev e no offline, ver runtime.ts) */
  devNivel?: number;
  /** dev: ?dev_mapa=<mapId> (só vale no dev e no offline, ver runtime.ts) */
  devMapa?: string;
}

export interface ConfigDefaults {
  /** build "app": offline sem precisar do ?offline=1 */
  offline?: boolean;
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

export function parseConfig(search: string, loc: LocationLike, defaults: ConfigDefaults = {}): ClientConfig {
  const q = new URLSearchParams(search);
  const cfg: ClientConfig = {
    endpoint: resolveEndpoint(q.get('server'), loc),
    lag: num(q.get('lag'), 0, 0, 5000),
    loss: num(q.get('loss'), 0, 0, 0.9),
    jitter: num(q.get('jitter'), 0, 0, 2000),
    debug: flag(q.get('debug')),
    gallery: flag(q.get('gallery')),
    // ?offline= manda; sem ele, o padrão do build (o app é offline)
    offline: q.has('offline') ? flag(q.get('offline')) : defaults.offline === true,
  };
  const nivel = q.get('dev_nivel');
  if (nivel !== null && /^\d+$/.test(nivel.trim())) cfg.devNivel = num(nivel, 1, 1, 60);
  const mapa = q.get('dev_mapa');
  if (mapa && /^[a-z_]+$/.test(mapa)) cfg.devMapa = mapa;
  const name = q.get('nome') ?? q.get('name');
  if (name && name.trim()) cfg.name = name.trim().slice(0, 20);
  const arch = q.get('ala') ?? q.get('arch');
  if (arch && /^[a-z_]+$/.test(arch)) cfg.archetypeId = arch;
  const dpr = q.get('dpr');
  if (dpr !== null && dpr.trim() !== '' && Number.isFinite(Number(dpr))) cfg.dpr = num(dpr, 1, 1, 4);
  return cfg;
}
