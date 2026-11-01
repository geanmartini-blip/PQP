/**
 * v0.1, app instalável: versão e novidades (NOVIDADES.md), texto do "Mandar opinião", offline por
 * padrão no build "app", atalhos de dev (?dev_nivel, ?dev_mapa) no servidor local e o plugin do PWA
 * (base, lista do pré-cache e o sw.js).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getData } from '@pqp/shared';
import { getMap } from '@pqp/shared/map';
import { GAME_MSG, MSG } from '@pqp/shared/net';
import { feedbackText, mapLabel, markNewsSeen, NEWS_SEEN_KEY, parseNovidades, shortUserAgent, shortVersion, shouldShowNews, versionLabel } from '../src/app/appInfo';
import { parseConfig } from '../src/config';
import { devPrepOf } from '../src/game/runtime';
import { DEV_MAPS, LocalServer, type Outgoing, type RecordStore } from '../src/net/localServer';
import { cacheName, listFiles, normalizeBase, swSource } from '../vite.pwa';

const D = getData();
const okLook = () => ({ ...D.appearance.padrao, details: [] as string[] });
const memStore = (): RecordStore => {
  const data = new Map<string, string>();
  return { load: (id) => (data.has(id) ? JSON.parse(data.get(id)!) : null), save: (id, rec) => void data.set(id, JSON.stringify(rec)) };
};
const memStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const loc = { protocol: 'https:', hostname: 'geanmartini-blip.github.io', host: 'geanmartini-blip.github.io', port: '' };
const lastWelcome = (out: Outgoing[]) => out.filter(([t]) => t === MSG.welcome).map(([, m]) => m as { mapId: string }).at(-1);

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

describe('versão e novidades', () => {
  it('versão curta e rótulo', () => {
    expect(shortVersion('0.1.0')).toBe('0.1');
    expect(shortVersion('1.12.3')).toBe('1.12');
    expect(versionLabel('0.1.0')).toBe('v0.1');
  });

  it('o NOVIDADES.md da raiz tem a v0.1 com 3 a 5 itens curtos', () => {
    const md = readFileSync(new URL('../../../NOVIDADES.md', import.meta.url), 'utf8');
    const n = parseNovidades(md, '0.1.0');
    expect(n?.titulo).toBe('v0.1');
    expect(n!.itens.length).toBeGreaterThanOrEqual(3);
    expect(n!.itens.length).toBeLessThanOrEqual(5);
    for (const it of n!.itens) expect(it.length).toBeLessThan(110);
    // a versão do package.json do cliente é a 0.1.0
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(pkg.version).toBe('0.1.0');
  });

  it('só a seção da versão; versão sem seção não mostra nada', () => {
    const md = '# Novidades\n\n## v0.2\n- dois\n\n## v0.1\n- um\n- outro\n';
    expect(parseNovidades(md, '0.1.0')?.itens).toEqual(['um', 'outro']);
    expect(parseNovidades(md, '0.2.5')?.itens).toEqual(['dois']);
    expect(parseNovidades(md, '0.3.0')).toBeUndefined();
  });

  it('aparece uma vez por versão (e sobrevive a storage que lança)', () => {
    const st = memStorage();
    const n = parseNovidades('## v0.1\n- a\n', '0.1.0');
    expect(shouldShowNews(st, '0.1.0', n)).toBe(true);
    markNewsSeen(st, '0.1.0');
    expect(st.getItem(NEWS_SEEN_KEY)).toBe('0.1');
    expect(shouldShowNews(st, '0.1.3', n)).toBe(false);
    expect(shouldShowNews(st, '0.2.0', parseNovidades('## v0.2\n- b\n', '0.2.0'))).toBe(true);
    const ruim = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(shouldShowNews(ruim, '0.1.0', n)).toBe(true);
    expect(() => markNewsSeen(ruim, '0.1.0')).not.toThrow();
    expect(shouldShowNews(undefined, '0.1.0', undefined)).toBe(false);
  });
});

describe('Mandar opinião', () => {
  it('aparelho em poucas palavras', () => {
    expect(shortUserAgent(IPHONE)).toBe('iPhone, iOS 17.4, Safari 17');
    expect(shortUserAgent(ANDROID)).toBe('Android 14, Chrome 124');
    expect(shortUserAgent(WINDOWS)).toBe('Windows, Chrome 124');
  });

  it('nome dos mapas', () => {
    expect(mapLabel('margem_direita')).toBe('Margem Direita');
    expect(mapLabel('barco:tok')).toBe('Barco do Seu Jacó');
    expect(mapLabel(undefined)).toBe('carregando');
  });

  it('texto pronto com versão, nível, mapa, margem e aparelho; nada além disso', () => {
    const t = feedbackText({ version: '0.1.0', level: 12, mapId: 'juncal', side: 'esquerda', userAgent: IPHONE, standalone: true });
    expect(t).toBe('Ponte que Partiu v0.1 — nível 12, mapa Juncal, margem Margem Esquerda, aparelho iPhone, iOS 17.4, Safari 17, pelo ícone — O que achei: ');
    const d = feedbackText({ version: '0.1.0', level: 3, mapId: 'delta', side: null, userAgent: ANDROID });
    expect(d).toContain('nível 3, mapa Delta, margem sem margem');
    expect(d.endsWith('O que achei: ')).toBe(true);
  });
});

describe('build "app": offline por padrão', () => {
  it('sem ?offline, vale o padrão do build; ?offline=0 desliga', () => {
    expect(parseConfig('', loc).offline).toBe(false);
    expect(parseConfig('', loc, { offline: true }).offline).toBe(true);
    expect(parseConfig('?offline=0', loc, { offline: true }).offline).toBe(false);
    expect(parseConfig('?offline=1', loc).offline).toBe(true);
  });

  it('atalhos de dev: lidos da URL, mas só valem no dev e no offline', () => {
    const c = parseConfig('?offline=1&dev_nivel=12&dev_mapa=margem_direita', loc);
    expect(c.devNivel).toBe(12);
    expect(c.devMapa).toBe('margem_direita');
    expect(parseConfig('?dev_nivel=abc&dev_mapa=../x', loc).devNivel).toBeUndefined();
    expect(parseConfig('?dev_nivel=99', loc).devNivel).toBe(60);
    expect(devPrepOf(c, true)).toEqual({ level: 12, mapId: 'margem_direita' });
    // build de produção (o app do Pages): ignorado
    expect(devPrepOf(c, false)).toBeUndefined();
    // online: ignorado
    expect(devPrepOf(parseConfig('?dev_nivel=12', loc), true)).toBeUndefined();
  });
});

describe('atalhos de dev no servidor local', () => {
  const start = (devPrep: { level?: number; mapId?: string }, token: string, store = memStore()) => {
    const s = new LocalServer({ store, noEnemies: true, encounters: false, devPrep });
    s.receive(MSG.hello, { token, name: 'Zé' });
    s.take();
    s.receive(GAME_MSG.criarPersonagem, { name: 'Zé Dev', appearance: okLook() });
    return { s, out: s.take(), store };
  };

  it('os mapas aceitos existem', () => {
    for (const id of DEV_MAPS) expect(getMap(id).id).toBe(id);
  });

  it('?dev_nivel=12&dev_mapa=margem_direita: atravessa pela Direita e nasce lá', () => {
    const { s, out, store } = start({ level: 12, mapId: 'margem_direita' }, 'tok_dev_dir');
    const rec = s.rec!;
    expect(rec.stage).toBe('margem');
    expect(rec.side).toBe('direita');
    expect(rec.level).toBe(12);
    const inst = D.institutionsById.get(rec.institution!);
    expect(inst?.margem).toBe('direita');
    expect(D.guidesById.get(rec.guide_id!)?.margem).toBe('direita');
    expect(rec.class).toBe(inst!.classe);
    expect(s.mapId).toBe('margem_direita');
    expect(lastWelcome(out)?.mapId).toBe('margem_direita');
    // recarregar com o mesmo atalho: nada quebra, continua no mesmo mapa e nível
    const s2 = new LocalServer({ store, noEnemies: true, encounters: false, devPrep: { level: 12, mapId: 'margem_direita' } });
    s2.receive(MSG.hello, { token: 'tok_dev_dir', name: 'Zé' });
    expect(lastWelcome(s2.take())?.mapId).toBe('margem_direita');
    expect(s2.rec!.level).toBe(12);
  });

  it('?dev_mapa=juncal sozinho: margem Esquerda, nível 8, nasce no Juncal', () => {
    const { s } = start({ mapId: 'juncal' }, 'tok_dev_juncal');
    expect(s.rec!.stage).toBe('margem');
    expect(s.rec!.side).toBe('esquerda');
    expect(s.rec!.level).toBe(8);
    expect(s.mapId).toBe('juncal');
  });

  it('?dev_nivel=5: continua no Delta, no nível 5', () => {
    const { s } = start({ level: 5 }, 'tok_dev_delta');
    expect(s.rec!.stage).toBe('delta');
    expect(s.rec!.level).toBe(5);
    expect(s.mapId).toBe('delta');
  });

  it('mapa desconhecido é ignorado', () => {
    const { s } = start({ mapId: 'mirante' }, 'tok_dev_x');
    expect(s.rec!.stage).toBe('delta');
    expect(s.mapId).toBe('delta');
  });
});

describe('plugin do PWA', () => {
  it('base do VITE_BASE', () => {
    expect(normalizeBase('/PQP/')).toBe('/PQP/');
    expect(normalizeBase('/PQP')).toBe('/PQP/');
    expect(normalizeBase('PQP')).toBe('/PQP/');
    expect(normalizeBase('/')).toBe('/');
    expect(normalizeBase('./')).toBe('./');
  });

  it('lista todos os arquivos do build e o cache muda quando o conteúdo muda', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pqp-pwa-'));
    try {
      mkdirSync(join(dir, 'assets'));
      mkdirSync(join(dir, 'icons'));
      writeFileSync(join(dir, 'index.html'), '<html></html>');
      writeFileSync(join(dir, 'assets', 'index-abc.js'), 'console.log(1)');
      writeFileSync(join(dir, 'icons', 'icon-192.png'), 'png');
      const files = listFiles(dir);
      expect(files).toEqual(['assets/index-abc.js', 'icons/icon-192.png', 'index.html']);
      const c1 = cacheName('0.1.0', dir, files);
      expect(c1).toMatch(/^pqp-0\.1\.0-[0-9a-f]{10}$/);
      writeFileSync(join(dir, 'assets', 'index-abc.js'), 'console.log(2)');
      expect(cacheName('0.1.0', dir, files)).not.toBe(c1);
      const sw = swSource(c1, files);
      expect(sw).toContain(JSON.stringify(c1));
      for (const f of files) expect(sw).toContain(JSON.stringify(f));
      // a versão nova espera o toque do jogador; os caches velhos saem na ativação
      expect(sw).toContain("'pular_espera'");
      expect(sw).toContain('caches.delete');
      // o sw.js é JavaScript válido
      expect(() => new Function(sw)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
