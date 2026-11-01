/**
 * Passa um estado do afinador (tune.ts) para os JSON de dados, arredondado, sem mexer na
 * formatação: troca só os números que mudaram, na ordem em que aparecem no arquivo, e soma o
 * caminho de cada campo mudado em sugestaoCampos. Escreve as cópias numa pasta de saída
 * (quem copia para packages/shared/data é a pessoa).
 *
 *   npx tsx packages/sim/src/emit.ts estado.json pasta_de_saida
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getData } from '@pqp/shared';
import { computeBudget } from '@pqp/shared/schema/balance';
import { makeTuner, type TuneState } from './tune';
import { runTournament } from './tournament';
import { formatReport } from './report';

type J = Record<string, unknown>;

/** Arredondamento por campo (para o dado ficar legível). */
export function roundField(key: string, v: number): number {
  const r = (step: number) => Math.round(v / step) * step;
  const fix = (x: number) => Math.round(x * 1000) / 1000;
  switch (key) {
    case 'cooldownS':
      return fix(r(0.5));
    case 'duracaoMs':
      return fix(r(100));
    case 'pct':
    case 'danoRecebidoPct':
    case 'hpPct':
      return fix(r(1));
    case 'pctVidaMax':
      return fix(r(0.5));
    case 'vida':
      return fix(r(1));
    case 'ataque':
      return fix(r(0.5));
    default:
      return fix(r(0.05));
  }
}

/** Arredonda em memória tudo o que o afinador mexe (e recalcula o orçamento das linhas). */
export function roundInMemory(t: ReturnType<typeof makeTuner>): void {
  // mudança de menos de 5% não vale o ruído: fica o número do doc
  const keep = (orig: number, v: number) => (Math.abs(v / orig - 1) < 0.05 ? orig : v);
  for (const snaps of t.power.values()) for (const s of snaps) s.obj[s.key] = roundField(s.key, keep(s.orig, s.obj[s.key] as number));
  for (const cds of t.cds.values()) for (const c of cds) c.obj['cooldownS'] = roundField('cooldownS', keep(c.orig, c.obj['cooldownS'] as number));
  const b = getData().balance;
  for (const [id, s] of Object.entries(b.atributosArquetipo)) {
    const o = t.origStat[id]!;
    s.vida = roundField('vida', keep(o.vida, s.vida));
    s.ataque = roundField('ataque', keep(o.ataque, s.ataque));
    s.defesa = roundField('ataque', keep(o.defesa, s.defesa));
    s.orcamento = Math.round(computeBudget(s, b.orcamento.pesos) * 1000) / 1000;
  }
}

/** Folhas numéricas de um objeto cru, na ordem do arquivo, com o caminho de chaves (sem índices). */
function leaves(node: unknown, path: (string | number)[], out: { path: (string | number)[]; v: number }[]): void {
  if (Array.isArray(node)) node.forEach((x, i) => leaves(x, [...path, i], out));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node as J)) leaves(v, [...path, k], out);
  else if (typeof node === 'number') out.push({ path, v: node });
}

const get = (o: unknown, path: (string | number)[]) => path.reduce<unknown>((x, k) => (x == null ? undefined : (x as J)[k as string]), o);

/** Caminho de sugestaoCampos: chaves com o kind no lugar do índice (effects.campo.efeitos.dano.mult). */
function sugPath(raw: unknown, path: (string | number)[]): string {
  const parts: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const k = path[i]!;
    if (typeof k === 'number') {
      const kind = (get(raw, path.slice(0, i + 1)) as J | undefined)?.['kind'];
      if (typeof kind === 'string') parts.push(kind);
    } else parts.push(k);
  }
  return parts.join('.');
}

/** Troca a i-ésima ocorrência de número no texto do bloco, na ordem das folhas. */
function patchBlock(text: string, raw: J, live: J): { text: string; changed: string[]; pcts: [number, number][] } {
  const ls: { path: (string | number)[]; v: number }[] = [];
  leaves(raw, [], ls);
  const changed: string[] = [];
  const pcts: [number, number][] = [];
  let i = 0;
  const re = /("[^"]+"\s*:\s*|[[,]\s*)(-?\d+(?:\.\d+)?(?:e-?\d+)?)(?=\s*[,}\]\n])/g;
  const outText = text.replace(re, (m, pre: string, num: string) => {
    const leaf = ls[i++];
    if (!leaf) return m;
    if (Math.abs(Number(num) - leaf.v) > 1e-9) throw new Error(`desalinhado em ${leaf.path.join('.')}: ${num} != ${leaf.v}`);
    const nv = get(live, leaf.path);
    if (typeof nv !== 'number' || Math.abs(nv - leaf.v) < 1e-9) return m;
    const key = leaf.path[leaf.path.length - 1];
    if (key !== 'orcamento') changed.push(sugPath(raw, leaf.path));
    if (key === 'pct' || key === 'pctVidaMax' || key === 'danoRecebidoPct') pcts.push([leaf.v, nv]);
    return pre + String(nv);
  });
  if (i !== ls.length) throw new Error(`contagem de números diferente: ${i} no texto, ${ls.length} no JSON`);
  return { text: outText, changed, pcts };
}

/** Atualiza os "N%" da descrição que mudaram (ex.: "Escudo de 25% da vida" vira "Escudo de 20% da vida"). */
function patchDescription(block: string, pcts: [number, number][]): { text: string; touched: boolean } {
  const pt = (v: number) => String(v).replace('.', ',');
  let touched = false;
  const text = block.replace(/("description": ")((?:[^"\\]|\\.)*)"/, (_m, pre: string, desc: string) => {
    let d = desc;
    for (const [o, n] of pcts) {
      const re = new RegExp(`(^|[^\\d,])${pt(o).replace(',', '\\,')}%`, 'g');
      if (re.test(d)) {
        d = d.replace(re, (_x, a: string) => `${a}${pt(n)}%`);
        touched = true;
      }
    }
    return `${pre}${d}"`;
  });
  return { text, touched };
}

/** Soma caminhos no sugestaoCampos do bloco (ou cria a lista antes do fecho). */
function addSug(block: string, pathsIn: string[]): string {
  const paths = [...new Set(pathsIn)];
  if (paths.length === 0) return block;
  const m = /"sugestaoCampos": \[([^\]]*)\]/.exec(block);
  if (m) {
    const have = m[1]!.split(',').map((s) => s.trim().replace(/"/g, '')).filter(Boolean);
    const all = [...have, ...paths.filter((p) => !have.includes(p))];
    return block.replace(m[0], `"sugestaoCampos": [${all.map((s) => `"${s}"`).join(', ')}]`);
  }
  const at = block.lastIndexOf('}');
  const head = block.slice(0, at).replace(/\s+$/, '');
  const inline = !block.slice(0, at).includes('\n');
  const list = `"sugestaoCampos": [${[...new Set(paths)].map((s) => `"${s}"`).join(', ')}]`;
  return inline ? `${head}, ${list} ${block.slice(at)}` : `${head},\n    ${list}\n  ${block.slice(at)}`;
}

/** Arquivo de lista de objetos com id (habilidades, invocações): bloco a bloco. */
function patchListFile(file: string, live: ReadonlyMap<string, unknown>): { text: string; changed: Record<string, string[]> } {
  const text = readFileSync(file, 'utf8');
  const raw = JSON.parse(text) as J[];
  // blocos de topo: "  {" até "  }"
  const starts: number[] = [];
  const re = /^ {2}\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) starts.push(m.index);
  if (starts.length !== raw.length) throw new Error(`${file}: ${starts.length} blocos para ${raw.length} itens`);
  let out = text.slice(0, starts[0]);
  const changed: Record<string, string[]> = {};
  starts.forEach((s, idx) => {
    const end = idx + 1 < starts.length ? starts[idx + 1]! : text.lastIndexOf(']');
    const block = text.slice(s, end);
    const item = raw[idx]!;
    const lv = live.get(item['id'] as string) as J | undefined;
    if (!lv) {
      out += block;
      return;
    }
    const p = patchBlock(block, item, lv);
    if (p.changed.length) changed[item['id'] as string] = p.changed;
    const d = patchDescription(p.text, p.pcts);
    out += addSug(d.text, [...p.changed, ...(d.touched ? ['description'] : [])]);
  });
  out += text.slice(text.lastIndexOf(']'));
  return { text: out, changed };
}

/** balance.json: linhas de atributosArquetipo (uma por linha). */
function patchBalance(file: string): { text: string; changed: Record<string, string[]> } {
  const b = getData().balance.atributosArquetipo as unknown as Record<string, J>;
  const changed: Record<string, string[]> = {};
  const text = readFileSync(file, 'utf8').replace(/^( {4})"([a-z_]+)": (\{ "classe".*\}),?$/gm, (line, ind: string, id: string, obj: string) => {
    const raw = JSON.parse(obj) as J;
    const p = patchBlock(obj, raw, b[id]!);
    if (p.changed.length) changed[id] = p.changed;
    const comma = line.trimEnd().endsWith(',') ? ',' : '';
    return `${ind}"${id}": ${addSug(p.text, p.changed.length ? [...p.changed, 'orcamento'] : [])}${comma}`;
  });
  return { text, changed };
}

const isMain = typeof process !== 'undefined' && process.argv[1] && /emit\.ts$/.test(process.argv[1]);
if (isMain) {
  const [stateFile, outDir] = process.argv.slice(2);
  const s = JSON.parse(readFileSync(stateFile!, 'utf8').replace(/^﻿/, '')) as Partial<TuneState>;
  const t = makeTuner();
  // Vida e Ataque de todos × o mesmo fator não mudam nada (tempo para derrubar = vida × (K + defesa) ÷
  // (ataque × K)): normaliza P pela média geométrica para a tabela ficar na escala do doc
  const ps = Object.values(s.P ?? {});
  const g = ps.length ? Math.exp(ps.reduce((a, b) => a + Math.log(b), 0) / ps.length) : 1;
  const P = Object.fromEntries(Object.entries(s.P ?? {}).map(([k, v]) => [k, v / g]));
  const R = Object.fromEntries(Object.entries(s.R ?? {}).map(([k, v]) => [k, v / g]));
  console.error(`fator de normalização de P: ${g.toFixed(3)}`);
  t.apply({ P, Qs: s.Qs ?? {}, Qg: s.Qg ?? {}, R, V: s.V ?? {} });
  roundInMemory(t);
  const D = getData();
  const dataDir = join('packages', 'shared', 'data');
  mkdirSync(outDir!, { recursive: true });
  const report: Record<string, unknown> = {};
  const ab = patchListFile(join(dataDir, 'abilities_archetype.json'), D.abilities);
  writeFileSync(join(outDir!, 'abilities_archetype.json'), ab.text);
  report['abilities_archetype'] = ab.changed;
  const su = patchListFile(join(dataDir, 'summons.json'), D.summonsById);
  writeFileSync(join(outDir!, 'summons.json'), su.text);
  report['summons'] = su.changed;
  const ba = patchBalance(join(dataDir, 'balance.json'));
  writeFileSync(join(outDir!, 'balance.json'), ba.text);
  report['balance'] = ba.changed;
  const rows = Object.entries(D.balance.atributosArquetipo).map(([id, r]) => `${id}: vida ${r.vida} ataque ${r.ataque} orçamento ${r.orcamento}`);
  console.log(JSON.stringify(report, null, 1));
  console.log(rows.join('\n'));
  if (process.env['PQP_EMIT_EVAL']) {
    // confere os números já arredondados (n por par no 1 contra 1, 200 × n lutas de grupo, semente 3)
    const n = Number(process.env['PQP_EMIT_EVAL']);
    const seed = Number(process.env['PQP_EMIT_SEED'] ?? 3);
    console.log(formatReport(runTournament({ modo: 'um_contra_um', n, seed })));
    console.log(formatReport(runTournament({ modo: 'grupo_contra_grupo', n: 200 * n, seed })));
  }
}
