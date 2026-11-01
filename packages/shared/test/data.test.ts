import { describe, expect, it } from 'vitest';
import {
  DATA_FILES,
  checkEnemyRefs,
  computeBudget,
  crossCheckAppearance,
  crossCheckArchetypes,
  getData,
  PatenteId,
  type DataFileName,
  type Effect,
} from '../src';

/**
 * Validação dos JSON de config e integridade entre arquivos.
 * Cada teste junta todos os problemas numa lista, para o erro mostrar tudo de uma vez.
 */

const CLASSES = ['combatente', 'atirador', 'elemental', 'mascarado'];
const ROLES = ['tanque', 'dano', 'suporte', 'cura'];
const INSTITUTIONS = [
  'brigada_popular',
  'guarda_comunitaria',
  'escola_dos_saberes',
  'trupe_do_povo',
  'torcida_furia_neon',
  'pm_do_consorcio',
  'universidade_neon',
  'agencia_neon',
];
const SPIRITS = ['valquiria', 'golem', 'curupira', 'tengu', 'chupacabra', 'fenix', 'dragao', 'djinn', 'kitsune', 'anansi', 'saci', 'baba_yaga'];
const POCKET_AIS = ['capita', 'mira', 'faisca', 'byte'];
const PILOT_REGIONS = ['delta', 'margem_esquerda', 'margem_direita', 'usina_da_ponte', 'juncal'];
const PLAYER_SLOTS = new Set(['basico', 'classe', 'marca_1', 'marca_2', 'especial', 'virada']);
/** papéis aceitos em `dadaPor` das missões (mission.ts) */
const MISSION_GIVER_ROLES = ['guia', 'treinador_da_ala', 'treinador_da_base', 'quadro_de_missoes', 'ia_de_faccao'];

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Percorre qualquer valor e chama fn em cada objeto, com o caminho. */
function walk(x: unknown, fn: (o: Obj, path: string) => void, path = ''): void {
  if (Array.isArray(x)) x.forEach((v, i) => walk(v, fn, `${path}[${i}]`));
  else if (isObj(x)) {
    fn(x, path);
    for (const [k, v] of Object.entries(x)) walk(v, fn, path ? `${path}.${k}` : k);
  }
}

/** Todos os efeitos de uma lista, entrando nos campos. */
function flatEffects(effs: readonly Effect[] | undefined): Effect[] {
  const out: Effect[] = [];
  for (const e of effs ?? []) {
    out.push(e);
    if (e.kind === 'campo') out.push(...flatEffects(e.efeitos));
  }
  return out;
}

const d = getData();

describe('cada JSON valida no esquema do arquivo', () => {
  for (const name of Object.keys(DATA_FILES) as DataFileName[]) {
    it(name, () => {
      const { schema, raw } = DATA_FILES[name];
      const r = schema.safeParse(raw);
      const issues = r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      expect(issues).toEqual([]);
    });
  }

  it('getData() carrega tudo e junta as habilidades sem id repetido', () => {
    expect(d.abilities.size).toBe(
      d.abilitiesClass.length +
        d.abilitiesArchetype.length +
        d.abilitiesSpecial.length +
        d.abilitiesBasic.length +
        d.abilitiesEnemy.length +
        d.consumables.habilidades.length +
        d.uniques.unicos.filter((u) => u.habilidadeLiberada).length,
    );
  });
});

describe('nenhum id duplicado dentro de um arquivo', () => {
  for (const name of Object.keys(DATA_FILES) as DataFileName[]) {
    it(name, () => {
      const dups: string[] = [];
      const check = (arr: unknown[], path: string) => {
        const seen = new Set<string>();
        for (const x of arr) {
          if (!isObj(x) || typeof x.id !== 'string') continue;
          if (seen.has(x.id)) dups.push(`${path}: ${x.id}`);
          seen.add(x.id);
        }
      };
      const raw = DATA_FILES[name].raw;
      if (Array.isArray(raw)) check(raw, '(raiz)');
      walk(raw, (o, p) => {
        for (const [k, v] of Object.entries(o)) if (Array.isArray(v)) check(v, p ? `${p}.${k}` : k);
      });
      expect(dups).toEqual([]);
    });
  }
});

describe('classes e habilidades', () => {
  it('4 classes com 4 habilidades cada, 16 únicas, do slot classe e da própria classe', () => {
    const problems: string[] = [];
    expect(d.classes.map((c) => c.id).sort()).toEqual([...CLASSES].sort());
    const all = d.classes.flatMap((c) => c.abilities);
    expect(all.length).toBe(16);
    expect(new Set(all).size).toBe(16);
    expect(d.abilitiesClass.length).toBe(16);
    for (const c of d.classes) {
      for (const id of c.abilities) {
        const a = d.abilities.get(id);
        if (!a) problems.push(`${c.id}: habilidade ${id} não existe`);
        else if (a.slot !== 'classe' || a.ownerKey !== c.id) problems.push(`${c.id}: ${id} com slot ${a.slot} e dono ${a.ownerKey}`);
      }
      const basic = d.abilities.get(c.basicAttack);
      if (!basic || basic.slot !== 'basico') problems.push(`${c.id}: básico ${c.basicAttack} inválido`);
      const special = d.abilities.get(c.special);
      if (!special || special.slot !== 'especial') problems.push(`${c.id}: Especial ${c.special} inválido`);
      for (const side of ['esquerda', 'direita'] as const) {
        const inst = d.institutionsById.get(c.institution[side]);
        if (!inst || inst.classe !== c.id || inst.margem !== side) problems.push(`${c.id}: instituição ${c.institution[side]} inválida`);
      }
      for (const w of c.wings) {
        for (const side of ['esquerda', 'direita'] as const) {
          const a = d.archetypesById.get(w[side]);
          if (!a || a.classe !== c.id || a.papel !== w.papel || a.margem !== side) problems.push(`${c.id}: ala ${w[side]} inválida`);
        }
      }
    }
    for (const [cls, p] of Object.entries(d.progression.padraoPorClasse)) {
      const c = d.classesById.get(cls)!;
      if (p.basico !== c.basicAttack || p.especial !== c.special) problems.push(`progression.padraoPorClasse.${cls}: básico/Especial diferente de classes.json`);
      if (JSON.stringify(p.habilidades) !== JSON.stringify(c.abilities)) problems.push(`progression.padraoPorClasse.${cls}: habilidades diferentes de classes.json`);
      for (const id of [p.basico, p.especial, ...p.habilidades, ...p.botoesNivel8a11, p.botao3Padrao]) {
        if (!d.abilities.has(id)) problems.push(`progression.padraoPorClasse.${cls}: ${id} não existe`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('24 arquétipos com marcas certas, treinador, instituição da mesma margem e classe', () => {
    const problems: string[] = [];
    expect(d.archetypes.length).toBe(24);
    for (const a of d.archetypes) {
      for (const slot of ['marca_1', 'marca_2'] as const) {
        const id = a.habilidadesMarca[slot];
        const ab = d.abilities.get(id);
        if (!ab) problems.push(`${a.id}: ${slot} ${id} não existe`);
        else if (ab.slot !== slot || ab.ownerKey !== a.id) problems.push(`${a.id}: ${id} com slot ${ab.slot} e dono ${ab.ownerKey}`);
      }
      const v = d.abilities.get(a.virada.id);
      if (!v || v.slot !== 'virada' || v.ownerKey !== a.id) problems.push(`${a.id}: virada ${a.virada.id} inválida`);
      const t = d.trainersById.get(a.treinador);
      if (!t) problems.push(`${a.id}: treinador ${a.treinador} não existe`);
      else if (t.archetype !== a.id || t.institution !== a.instituicao || t.side !== a.margem || t.classId !== a.classe || t.role !== a.papel) {
        problems.push(`${a.id}: treinador ${t.id} não bate com a ala`);
      }
      const inst = d.institutionsById.get(a.instituicao);
      if (!inst) problems.push(`${a.id}: instituição ${a.instituicao} não existe`);
      else {
        if (inst.margem !== a.margem || inst.classe !== a.classe) problems.push(`${a.id}: instituição de outra margem ou classe`);
        if (!inst.alas.includes(a.id)) problems.push(`${a.id}: fora das alas de ${inst.id}`);
      }
    }
    expect(d.abilitiesArchetype.length).toBe(48);
    expect(crossCheckArchetypes(d.archetypes, d.institutions, d.outfits)).toEqual([]);
    expect(problems).toEqual([]);
  });

  it('orçamento de cada arquétipo bate com a fórmula e fica na faixa de balance.json', () => {
    const problems: string[] = [];
    const w = d.balance.orcamento.pesos;
    for (const a of d.archetypes) {
      const s = d.balance.atributosArquetipo[a.id];
      if (!s) {
        problems.push(`${a.id}: sem atributos em balance.json`);
        continue;
      }
      if (s.classe !== a.classe || s.papel !== a.papel || s.margem !== a.margem) problems.push(`${a.id}: classe/papel/margem diferente em balance.json`);
      const calc = computeBudget(s, w);
      if (Math.abs(calc - s.orcamento) > 1e-6) problems.push(`${a.id}: orçamento ${s.orcamento} != ${calc}`);
      // a faixa vem de balance.json: o doc dava 52,5 a 56; a calibração da Fase 3 no simulador abriu a faixa (sugestaoCampos)
      const { min, max } = d.balance.orcamento;
      if (calc < min - 1e-9 || calc > max + 1e-9) problems.push(`${a.id}: orçamento ${calc} fora de ${min} a ${max}`);
    }
    expect(Object.keys(d.balance.atributosArquetipo).sort()).toEqual(d.archetypes.map((a) => a.id).sort());
    expect(problems).toEqual([]);
  });

  it('toda área tem raio >= 2 tiles', () => {
    const problems: string[] = [];
    const all: { id: string; radius: number; type?: string; effects: readonly Effect[] }[] = [...d.abilities.values(), ...d.summons.map((s) => ({ ...s, type: undefined }))];
    for (const a of all) {
      if ((a.type === 'area_alvo' || a.type === 'campo' || a.type === 'em_volta') && a.radius < 2) problems.push(`${a.id}: raio ${a.radius}`);
      if (a.type === undefined && a.radius > 0 && a.radius < 2) problems.push(`invocação ${a.id}: raio ${a.radius}`);
      for (const e of flatEffects(a.effects)) {
        if (e.radius !== undefined && e.radius < 2) problems.push(`${a.id}: efeito ${e.kind} com raio ${e.radius}`);
        if (e.kind === 'explode_ao_morrer' && e.raio < 2) problems.push(`${a.id}: explosão com raio ${e.raio}`);
      }
    }
    walk([d.missions.perigos, d.dungeons.masmorras], (o, p) => {
      if (typeof o.raio === 'number' && o.raio < 2) problems.push(`${p}: raio ${o.raio}`);
    });
    expect(problems).toEqual([]);
  });

  it('recargas de 6 a 20 s nas habilidades de jogador (classe e marca)', () => {
    const problems: string[] = [];
    for (const a of d.abilities.values()) {
      if (a.slot === 'classe' || a.slot === 'marca_1' || a.slot === 'marca_2') {
        if (a.cooldownS < 6 || a.cooldownS > 20) problems.push(`${a.id}: recarga ${a.cooldownS} s`);
      }
      if ((a.slot === 'especial' || a.slot === 'virada') && (a.cargaS === undefined || a.cargaS < 45 || a.cargaS > 90)) {
        problems.push(`${a.id}: carga do Especial ${a.cargaS} s fora de 45 a 90`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('controles de 1 a 2 s nas habilidades de jogador (provocar até provocarMaxMs)', () => {
    const problems: string[] = [];
    const { controleMs, provocarMaxMs } = d.balance.combate;
    for (const a of d.abilities.values()) {
      if (!PLAYER_SLOTS.has(a.slot)) continue;
      for (const e of flatEffects(a.effects)) {
        if (e.kind !== 'controle') continue;
        // Controle que quebra no primeiro golpe (Protocolo Infinito) não prende de verdade: sem teto.
        if (e.quebraAoApanhar) continue;
        if (e.cc === 'provocar') {
          if (e.duracaoMs < controleMs.min || e.duracaoMs > provocarMaxMs) problems.push(`${a.id}: provocar ${e.duracaoMs} ms`);
        } else if (e.duracaoMs < controleMs.min || e.duracaoMs > controleMs.max) problems.push(`${a.id}: ${e.cc} ${e.duracaoMs} ms`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('ataques de inimigo grandes (raio >= 3) ou de chefe têm aviso >= 800 ms', () => {
    const problems: string[] = [];
    const bossAbilities = new Set<string>();
    for (const e of d.enemies.inimigos) {
      if (e.tier !== 'chefe') continue;
      for (const id of [...e.habilidades, ...(e.fases ?? []).flatMap((f) => f.habilidades)]) if (id !== e.ataqueBasico) bossAbilities.add(id);
    }
    for (const a of d.abilitiesEnemy) {
      const dano = flatEffects(a.effects).some((x) => x.kind === 'dano' || x.kind === 'dano_continuo');
      const grande = a.radius >= 3 && a.type !== 'travada';
      if ((grande || (bossAbilities.has(a.id) && a.type !== 'travada')) && dano && a.telegraphMs < 800) {
        problems.push(`${a.id}: aviso ${a.telegraphMs} ms`);
      }
    }
    expect(checkEnemyRefs(d.enemies, d.abilitiesEnemy)).toEqual([]);
    expect(problems).toEqual([]);
  });
});

describe('instituições, treinadores e guias', () => {
  it('8 instituições com 3 alas cada, treinador de base e missão de entrada', () => {
    const problems: string[] = [];
    expect(d.institutions.instituicoes.map((i) => i.id).sort()).toEqual([...INSTITUTIONS].sort());
    for (const i of d.institutions.instituicoes) {
      if (i.alas.length !== 3) problems.push(`${i.id}: ${i.alas.length} alas`);
      const t = d.trainersById.get(i.baseTrainer);
      if (!t || !t.recebeBase || t.institution !== i.id) problems.push(`${i.id}: treinador de base ${i.baseTrainer} inválido`);
      if (!d.missionsById.has(i.missaoEntrada.id)) problems.push(`${i.id}: missão de entrada ${i.missaoEntrada.id} não existe`);
      if (!d.shopsById.has(i.loja)) problems.push(`${i.id}: loja ${i.loja} não existe`);
      if (i.masmorra && !d.dungeonsById.has(i.masmorra)) problems.push(`${i.id}: masmorra ${i.masmorra} não existe`);
    }
    for (const q of d.institutions.qgs) {
      if (!d.shopsById.has(q.loja)) problems.push(`${q.id}: loja ${q.loja} não existe`);
      if (q.masmorra && !d.dungeonsById.has(q.masmorra)) problems.push(`${q.id}: masmorra ${q.masmorra} não existe`);
    }
    expect(problems).toEqual([]);
  });

  it('24 treinadores únicos, com bordão, ala e instituição existentes', () => {
    const problems: string[] = [];
    expect(d.trainers.length).toBe(24);
    expect(new Set(d.trainers.map((t) => t.id)).size).toBe(24);
    for (const t of d.trainers) {
      if (!t.bordao.trim()) problems.push(`${t.id}: sem bordão`);
      const a = d.archetypesById.get(t.archetype);
      if (!a || a.treinador !== t.id) problems.push(`${t.id}: ala ${t.archetype} não aponta para ele`);
      if (!d.institutionsById.has(t.institution)) problems.push(`${t.id}: instituição ${t.institution} não existe`);
      if (t.iaFaccao && !d.factionCharactersById.has(t.iaFaccao)) problems.push(`${t.id}: IA de facção ${t.iaFaccao} não existe`);
      if (t.bordaoVirada && !d.abilities.has(t.bordaoVirada.virada)) problems.push(`${t.id}: virada ${t.bordaoVirada.virada} não existe`);
    }
    expect(problems).toEqual([]);
  });

  it('12 espíritos e 4 IAs de bolso', () => {
    const spirits = d.guides.guias.filter((g) => g.tipo === 'espirito').map((g) => g.id);
    const ais = d.guides.guias.filter((g) => g.tipo === 'ia_de_bolso').map((g) => g.id);
    expect(spirits.sort()).toEqual([...SPIRITS].sort());
    expect(ais.sort()).toEqual([...POCKET_AIS].sort());
  });
});

describe('talentos do piloto', () => {
  const byOwner = (grupo: string, key: (t: (typeof d.talents.talentos)[number]) => string | undefined) => {
    const m = new Map<string, string[]>();
    for (const t of d.talents.talentos) {
      if (t.grupo !== grupo) continue;
      const k = key(t);
      if (k === undefined) continue;
      m.set(k, [...(m.get(k) ?? []), t.id]);
    }
    return m;
  };

  it('nível 10: 3 por instituição', () => {
    const m = byOwner('instituicao', (t) => (t.dono.tipo === 'instituicao' ? t.dono.instituicao : undefined));
    for (const i of INSTITUTIONS) expect(m.get(i)?.length, i).toBe(3);
    expect([...m.keys()].sort()).toEqual([...INSTITUTIONS].sort());
  });

  it('nível 15: 3 por papel', () => {
    const m = byOwner('papel', (t) => (t.dono.tipo === 'papel' ? t.dono.papel : undefined));
    for (const r of ROLES) expect(m.get(r)?.length, r).toBe(3);
  });

  it('nível 20: 2 por par de arquétipos', () => {
    const problems: string[] = [];
    const m = byOwner('chave', (t) => (t.dono.tipo === 'arquetipos' ? [...t.dono.arquetipos].sort().join('+') : undefined));
    const pairs = new Set<string>();
    for (const [id, s] of Object.entries(d.balance.atributosArquetipo)) pairs.add([id, s.par].sort().join('+'));
    expect(pairs.size).toBe(12);
    for (const p of pairs) if (m.get(p)?.length !== 2) problems.push(`${p}: ${m.get(p)?.length ?? 0} talentos-chave`);
    for (const p of d.talents.paresChave) {
      const k = [...p.arquetipos].sort().join('+');
      if (!pairs.has(k)) problems.push(`paresChave ${k}: não é par da tabela`);
      for (const tid of [p.talentoA, p.talentoB]) if (!m.get(k)?.includes(tid)) problems.push(`paresChave ${k}: ${tid} não é talento do par`);
    }
    expect(problems).toEqual([]);
  });

  it('talentos do piloto completos e com referências válidas', () => {
    const problems: string[] = [];
    for (const t of d.talents.talentos) {
      const piloto = t.niveis.some((n) => n === 10 || n === 15 || n === 20);
      if (piloto && !t.emPiloto) problems.push(`${t.id}: emPiloto falso`);
      const efs = [t.efeito, ...Object.values(t.efeitoPorArquetipo ?? {})].filter((x) => x !== undefined);
      if (efs.length === 0) problems.push(`${t.id}: sem efeito`);
      for (const ef of efs) {
        for (const m of ef.modificacoes ?? []) if (!d.abilities.has(m.habilidade)) problems.push(`${t.id}: modifica ${m.habilidade}, que não existe`);
        if (ef.substituiEspecial && !d.abilities.has(ef.substituiEspecial)) problems.push(`${t.id}: virada ${ef.substituiEspecial} não existe`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('cada modificação de habilidade acha o efeito que ela muda (na habilidade, nos campos ou na invocação)', () => {
    const problems: string[] = [];
    for (const t of d.talents.talentos) {
      const efs = [t.efeito, ...Object.values(t.efeitoPorArquetipo ?? {})].filter((x) => x !== undefined);
      for (const ef of efs) {
        for (const m of ef.modificacoes ?? []) {
          const a = d.abilities.get(m.habilidade);
          if (!a || !m.efeito) continue;
          const own = flatEffects(a.effects);
          const fromSummons = own.flatMap((e) => (e.kind === 'invocar' ? flatEffects(d.summonsById.get(e.invocacao)?.effects) : []));
          const hit = [...own, ...fromSummons].some((e) => e.kind === m.efeito && (!m.stat || (e.kind === 'reforco' && e.stat === m.stat)));
          if (!hit) problems.push(`${t.id}: ${m.habilidade} não tem efeito ${m.efeito}${m.stat ? `/${m.stat}` : ''}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('talentos citados por itens, únicos e sets existem', () => {
    const problems: string[] = [];
    walk({ items: d.items, uniques: d.uniques, sets: d.sets, guides: d.guides }, (o, p) => {
      if (typeof o.talento === 'string' && !d.talentsById.has(o.talento)) problems.push(`${p}: talento ${o.talento}`);
    });
    for (const e of d.guides.evolucoes) if (!d.talentsById.has(e.talento)) problems.push(`guides.evolucoes: talento ${e.talento}`);
    expect(problems).toEqual([]);
  });
});

describe('itens, mundo e masmorra', () => {
  it('14 únicos e exatamente 2 marcados piloto', () => {
    expect(d.uniques.unicos.length).toBe(14);
    expect(d.uniques.unicos.filter((u) => u.piloto).length).toBe(2);
  });

  it('5 regiões emPiloto', () => {
    expect(d.regions.regioes.filter((r) => r.emPiloto).map((r) => r.id).sort()).toEqual([...PILOT_REGIONS].sort());
  });

  it('galerias_da_usina com 5 andares e chefe bomba_descontrolada', () => {
    const g = d.dungeonsById.get('galerias_da_usina');
    expect(g?.emPiloto).toBe(true);
    expect(g?.detalhe?.andares.length).toBe(5);
    expect(g?.chefe.inimigo).toBe('bomba_descontrolada');
    const ultimo = g!.detalhe!.andares[4]!;
    const salas = ultimo.salas.map((s) => g!.detalhe!.salas.find((x) => x.id === s));
    expect(salas.some((s) => s?.tipo === 'chefe' && s.chefe?.inimigo === 'bomba_descontrolada')).toBe(true);
    expect(d.enemiesById.get('bomba_descontrolada')?.tier).toBe('chefe');
  });
});

describe('toda referência entre arquivos existe', () => {
  const regions = new Set(d.regions.regioes.map((r) => r.id));
  const places = new Set(d.places.map((p) => p.id));
  const people = new Set<string>([
    ...d.npcs.personagens.map((n) => n.id),
    ...d.npcs.herois.map((n) => n.id),
    ...d.trainers.map((t) => t.id),
    ...d.guides.guias.map((g) => g.id),
    ...d.factionAi.personagens.map((p) => p.id),
  ]);
  const flags = new Set(d.storyFlags.map((f) => f.id));
  const materials = new Set<string>([...d.economy.recursos.map((r) => r.id), ...d.economy.feira.precosTabelados.map((r) => r.id)]);

  it('habilidades', () => {
    const problems: string[] = [];
    const need = (id: string, where: string) => {
      if (!d.abilities.has(id)) problems.push(`${where}: habilidade ${id}`);
    };
    need(d.balance.personagemDelta.ataqueBasico, 'balance.personagemDelta');
    for (const it of d.items.itens) if (it.ataqueBasico) need(it.ataqueBasico, `items/${it.id}`);
    for (const c of d.consumables.consumiveis) need(c.habilidade, `consumables/${c.id}`);
    for (const m of d.missions.missoes)
      for (const o of m.objetivos) if (o.tipo === 'usar_habilidade' && o.habilidade) need(o.habilidade, `missions/${m.id}`);
    expect(problems).toEqual([]);
  });

  it('invocações', () => {
    const problems: string[] = [];
    walk(
      Object.fromEntries(Object.entries(DATA_FILES).map(([k, v]) => [k, v.raw])),
      (o, p) => {
        if (o.kind === 'invocar' && typeof o.invocacao === 'string' && !d.summonsById.has(o.invocacao)) problems.push(`${p}: ${o.invocacao}`);
        if (o.kind === 'gancho' || typeof o.gancho === 'string') {
          const inv = isObj(o.params) ? o.params.invocacao : undefined;
          if (typeof inv === 'string' && !d.summonsById.has(inv)) problems.push(`${p}: ${inv}`);
        }
      },
    );
    expect(problems).toEqual([]);
  });

  it('inimigos', () => {
    const problems: string[] = [];
    walk({ missions: d.missions, dungeons: d.dungeons }, (o, p) => {
      if (typeof o.inimigo === 'string' && !d.enemiesById.has(o.inimigo)) problems.push(`${p}: ${o.inimigo}`);
    });
    for (const g of d.dungeons.masmorras) {
      if (g.chefe.inimigo && !d.enemiesById.has(g.chefe.inimigo)) problems.push(`${g.id}: chefe ${g.chefe.inimigo}`);
      const det = g.detalhe;
      if (!det) continue;
      for (const id of [...det.inimigos.normais, ...det.inimigos.elites, ...det.inimigos.chefes, ...det.semFundo.chefes]) {
        if (!d.enemiesById.has(id)) problems.push(`${g.id}: inimigo ${id}`);
      }
      const salas = new Set(det.salas.map((s) => s.id));
      const perigos = new Set(det.perigos.map((h) => h.id));
      for (const a of det.andares) {
        for (const s of a.salas) if (!salas.has(s)) problems.push(`${g.id} andar ${a.andar}: sala ${s}`);
        if (a.aguaSubindo && !perigos.has(a.aguaSubindo.perigo)) problems.push(`${g.id} andar ${a.andar}: perigo ${a.aguaSubindo.perigo}`);
      }
      for (const s of det.salas) {
        for (const h of [...(s.perigos ?? []), ...(s.chefe?.fases ?? []).flatMap((f) => f.perigos)]) {
          if (!perigos.has(h)) problems.push(`${g.id}/${s.id}: perigo ${h}`);
        }
        for (const l of s.enigma?.licoes ?? []) if (!d.lessonsById.has(l)) problems.push(`${g.id}/${s.id}: lição ${l}`);
      }
    }
    for (const n of d.npcs.personagens) if (n.inimigo && !d.enemiesById.has(n.inimigo)) problems.push(`npcs/${n.id}: inimigo ${n.inimigo}`);
    for (const e of d.enemies.inimigos) {
      if (e.masmorra && !d.dungeonsById.has(e.masmorra.id)) problems.push(`enemies/${e.id}: masmorra ${e.masmorra.id}`);
    }
    expect(problems).toEqual([]);
  });

  it('tabelas de saque', () => {
    const problems: string[] = [];
    const need = (id: string, where: string) => {
      if (!d.lootTablesById.has(id)) problems.push(`${where}: tabela ${id}`);
    };
    for (const e of d.enemies.inimigos) need(e.tabelaSaque, `enemies/${e.id}`);
    need(d.enemies.promocaoElite.tabelaSaque, 'enemies.promocaoElite');
    for (const u of d.uniques.unicos) for (const t of u.ondeCai) need(t, `uniques/${u.id}`);
    for (const g of d.dungeons.masmorras) {
      const t = g.detalhe?.recompensas.tabelas;
      if (t) for (const id of [t.normal, t.elite, t.chefe]) need(id, `dungeons/${g.id}`);
    }
    walk({ missions: d.missions, dungeons: d.dungeons, lessons: d.lessons, endgame: d.endgame }, (o, p) => {
      if (o.kind === 'item' && typeof o.tabela === 'string') need(o.tabela, p);
      if (isObj(o.tesouro) && typeof o.tesouro.tabela === 'string') need(o.tesouro.tabela, p);
    });
    for (const t of d.loot.tabelas) {
      for (const u of t.unicos) if (!d.uniquesById.has(u)) problems.push(`loot/${t.id}: único ${u}`);
      for (const c of t.consumiveis) if (!d.consumablesById.has(c.id)) problems.push(`loot/${t.id}: consumível ${c.id}`);
      for (const m of t.materiais) if (!materials.has(m.id)) problems.push(`loot/${t.id}: material ${m.id}`);
      if (t.regiao && !regions.has(t.regiao)) problems.push(`loot/${t.id}: região ${t.regiao}`);
      if (t.masmorra && !d.dungeonsById.has(t.masmorra)) problems.push(`loot/${t.id}: masmorra ${t.masmorra}`);
    }
    expect(problems).toEqual([]);
  });

  it('missões', () => {
    const problems: string[] = [];
    const chains = new Set(d.missions.cadeias.map((c) => c.id));
    const hazards = new Set(d.missions.perigos.map((h) => h.id));
    for (const i of INSTITUTIONS) if (!d.missionsById.has(`entrada_${i}`)) problems.push(`falta entrada_${i}`);
    for (const c of d.missions.cadeias) for (const m of c.missoes) if (!d.missionsById.has(m)) problems.push(`cadeia ${c.id}: missão ${m}`);
    for (const m of d.missions.missoes) {
      if (m.cadeia && !chains.has(m.cadeia)) problems.push(`${m.id}: cadeia ${m.cadeia}`);
      if (m.instituicao && !d.institutionsById.has(m.instituicao)) problems.push(`${m.id}: instituição ${m.instituicao}`);
      for (const o of m.objetivos) {
        if (o.tipo === 'sobreviver' && o.perigo && !hazards.has(o.perigo)) problems.push(`${m.id}: perigo ${o.perigo}`);
        if ((o.tipo === 'entrar_masmorra' || o.tipo === 'vencer_andar') && !d.dungeonsById.has(o.masmorra)) problems.push(`${m.id}: masmorra ${o.masmorra}`);
        if (o.tipo === 'construir' && !d.structureKindsById.has(o.estrutura)) problems.push(`${m.id}: estrutura ${o.estrutura}`);
      }
    }
    // o mutirão da casa é o tipo de missão 'mutirao' (repetível para cada casa), ou uma missão específica
    const tipos = new Set(d.missions.tipos.map((t) => t.id));
    const mut = d.housing.mutirao.missao;
    if (!d.missionsById.has(mut) && !tipos.has(mut)) problems.push(`housing.mutirao: missão ${mut}`);
    for (const m of d.missions.missoes) if (m.tipo && !tipos.has(m.tipo)) problems.push(`${m.id}: tipo ${m.tipo}`);
    expect(problems).toEqual([]);
  });

  it('regiões', () => {
    const problems: string[] = [];
    const need = (id: string | undefined, where: string) => {
      if (id !== undefined && !regions.has(id)) problems.push(`${where}: região ${id}`);
    };
    for (const r of d.regions.regioes) for (const v of r.vizinhas) need(v, `regions/${r.id}.vizinhas`);
    for (const p of d.places) need(p.regiao, `places/${p.id}`);
    for (const i of d.institutions.instituicoes) need(i.predio.regiao, `institutions/${i.id}`);
    for (const q of d.institutions.qgs) need(q.predio.regiao, `institutions/${q.id}`);
    for (const m of d.missions.missoes) {
      need(m.regiao, `missions/${m.id}`);
      for (const o of m.objetivos) if ('regiao' in o) need(o.regiao, `missions/${m.id} objetivo`);
    }
    for (const e of d.enemies.inimigos) for (const r of e.regioes) need(r, `enemies/${e.id}`);
    for (const n of d.npcs.personagens) for (const r of n.regioes) need(r, `npcs/${n.id}`);
    for (const s of d.structures.instancias) need(s.regiao, `structures/${s.id}`);
    for (const s of d.shops.lojas) need(s.regiao, `shops/${s.id}`);
    for (const g of d.dungeons.masmorras) for (const r of g.regioes) need(r, `dungeons/${g.id}`);
    need(d.economy.contrabando.regiao, 'economy.contrabando');
    for (const c of d.endgame.colossos.lista) for (const r of c.regioes) need(r, `endgame/${c.id}`);
    for (const a of d.endgame.arenas.lista) need(a.regiao, `endgame/${a.id}`);
    walk({ missions: d.missions, dungeons: d.dungeons, lessons: d.lessons }, (o, p) => {
      if (o.kind === 'medidor') need(o.regiao as string | undefined, p);
    });
    expect(problems).toEqual([]);
  });

  it('lugares', () => {
    const problems: string[] = [];
    const need = (id: string | undefined, where: string) => {
      if (id !== undefined && !places.has(id)) problems.push(`${where}: lugar ${id}`);
    };
    for (const r of d.regions.regioes) {
      for (const l of r.lugares) need(l, `regions/${r.id}`);
      for (const g of r.masmorras) if (!d.dungeonsById.has(g)) problems.push(`regions/${r.id}: masmorra ${g}`);
    }
    for (const m of d.missions.missoes) {
      need(m.lugar, `missions/${m.id}`);
      for (const o of m.objetivos) {
        if (o.tipo === 'ir_ate' || o.tipo === 'visitar_lugar' || o.tipo === 'interagir') need(o.lugar, `missions/${m.id} objetivo`);
      }
    }
    for (const g of d.dungeons.masmorras) for (const l of g.lugaresDeEntrada) need(l, `dungeons/${g.id}`);
    for (const l of d.lessons.licoes) need(l.lugar, `lessons/${l.id}`);
    for (const s of d.structures.instancias) {
      need(s.lugar, `structures/${s.id}`);
      if (!d.structureKindsById.has(s.estrutura)) problems.push(`structures/${s.id}: estrutura ${s.estrutura}`);
    }
    for (const p of d.places) {
      if (p.cena && !d.lessonsById.has(p.cena.licao)) problems.push(`places/${p.id}: lição ${p.cena.licao}`);
      if (p.masmorra && !d.dungeonsById.has(p.masmorra)) problems.push(`places/${p.id}: masmorra ${p.masmorra}`);
      if (p.instituicao && !d.institutionsById.has(p.instituicao)) problems.push(`places/${p.id}: instituição ${p.instituicao}`);
      if (p.qg && !d.hqsById.has(p.qg)) problems.push(`places/${p.id}: QG ${p.qg}`);
    }
    need(d.economy.feira.local, 'economy.feira');
    need(d.economy.cambio.local, 'economy.cambio');
    // lugar, QG (também é lugar) ou região
    const somewhere = (id: string, where: string) => {
      if (!places.has(id) && !regions.has(id) && !d.hqsById.has(id)) problems.push(`${where}: local ${id}`);
    };
    // a Máquina de Visual e a roupa do Delta têm uma fonte só (institutions.json e outfits.json)
    problems.push(...crossCheckAppearance(d.appearance, d.outfits, d.institutions, d.npcs));
    for (const m of d.institutions.maquinasVisual) somewhere(m.local, `institutions.maquinasVisual/${m.id}`);
    somewhere(d.housing.despejo.deposito.local, 'housing.despejo.deposito');
    const moradias = new Set(d.housing.tipos.map((t) => t.id));
    for (const id of [d.housing.listaDeEspera.moradiaProvisoria, d.housing.listaDeEspera.moradiaFinal]) {
      if (!moradias.has(id)) problems.push(`housing.listaDeEspera: moradia ${id}`);
    }
    walk(d.appearance, (o, p) => {
      if (o.tipo === 'licao' && typeof o.chave === 'string' && !places.has(o.chave) && !d.lessonsById.has(o.chave)) problems.push(`${p}: lição ${o.chave}`);
      if (o.tipo === 'masmorra' && typeof o.chave === 'string' && !d.dungeonsById.has(o.chave)) problems.push(`${p}: masmorra ${o.chave}`);
    });
    for (const i of d.institutions.instituicoes) {
      if (i.quadroMissoes !== `quadro_${i.id}`) problems.push(`${i.id}: quadro ${i.quadroMissoes}`);
      if (i.salaTreino !== `treino_${i.id}`) problems.push(`${i.id}: treino ${i.salaTreino}`);
    }
    expect(problems).toEqual([]);
  });

  it('NPCs e treinadores', () => {
    const problems: string[] = [];
    const need = (id: string | undefined, where: string) => {
      if (id !== undefined && !people.has(id)) problems.push(`${where}: NPC ${id}`);
    };
    for (const m of d.missions.missoes) {
      if (!MISSION_GIVER_ROLES.includes(m.dadaPor)) need(m.dadaPor, `missions/${m.id}.dadaPor`);
      for (const a of m.aliadosIA ?? []) if (!MISSION_GIVER_ROLES.includes(a)) need(a, `missions/${m.id}.aliadosIA`);
      for (const o of m.objetivos) {
        if (o.tipo === 'falar' || o.tipo === 'entregar' || o.tipo === 'escoltar') {
          if (!MISSION_GIVER_ROLES.includes(o.npc)) need(o.npc, `missions/${m.id} objetivo ${o.tipo}`);
        }
      }
    }
    for (const p of d.places) for (const n of p.npcs ?? []) need(n, `places/${p.id}`);
    for (const s of d.shops.lojas) if (s.npc) need(s.npc, `shops/${s.id}`);
    need(d.economy.cambio.npc, 'economy.cambio');
    need(d.economy.contrabando.npc, 'economy.contrabando');
    for (const list of [d.propaganda.cartazes, d.propaganda.radioDoPovo, d.propaganda.teloesAgencia, d.propaganda.eco, d.propaganda.lideres]) {
      for (const f of list) need(f.autor, `propaganda/${f.id}`);
    }
    for (const t of d.trainers) for (const e of t.arco?.etapas ?? []) need(e.salvoPor, `trainers/${t.id}.arco`);
    for (const p of d.factionAi.personagens) {
      if (p.tambemTreinador && !d.trainersById.has(p.tambemTreinador)) problems.push(`faction_ai/${p.id}: treinador ${p.tambemTreinador}`);
    }
    for (const side of ['esquerda', 'direita'] as const) {
      const id = d.factionAi.piloto.comando[side];
      if (!d.factionCharactersById.has(id)) problems.push(`faction_ai.piloto.comando.${side}: ${id}`);
    }
    for (const c of d.roles.cargos) if (!d.factionCharactersById.has(c.iaPadrao)) problems.push(`roles/${c.id}: IA ${c.iaPadrao}`);
    expect(problems).toEqual([]);
  });

  it('story_flags', () => {
    const problems: string[] = [];
    const need = (id: string | undefined, where: string) => {
      if (id !== undefined && !flags.has(id)) problems.push(`${where}: flag ${id}`);
    };
    walk({ missions: d.missions, dungeons: d.dungeons, endgame: d.endgame }, (o, p) => {
      for (const k of ['requerFlags', 'bloqueadaPorFlags', 'ligaFlags']) {
        const v = o[k];
        if (Array.isArray(v)) for (const f of v) need(f as string, `${p}.${k}`);
      }
    });
    for (const list of [d.propaganda.cartazes, d.propaganda.radioDoPovo, d.propaganda.teloesAgencia, d.propaganda.eco, d.propaganda.lideres]) {
      for (const f of list) need(f.depoisDe, `propaganda/${f.id}`);
    }
    for (const t of d.trainers) for (const e of t.arco?.etapas ?? []) need(e.gatilho.storyFlag, `trainers/${t.id}.arco.${e.id}`);
    walk(d.appearance, (o, p) => {
      if (o.tipo === 'story_flag') need(o.chave as string, p);
    });
    expect(problems).toEqual([]);
  });

  it('patentes, moradias, cargos, estruturas e recompensas de item', () => {
    const problems: string[] = [];
    const patentes = new Set(PatenteId.options as readonly string[]);
    const pat = (id: string, where: string) => {
      if (!patentes.has(id)) problems.push(`${where}: patente ${id}`);
    };
    for (const s of d.shops.lojas) for (const e of s.itens) if (e.patenteMin) pat(e.patenteMin, `shops/${s.id}/${e.item}`);
    for (const c of d.economy.plano.cotas) {
      pat(c.patente, 'economy.plano');
      for (const r of c.recursos) if (!materials.has(r.recurso)) problems.push(`economy.plano: recurso ${r.recurso}`);
    }
    for (const c of d.economy.trabalhoDireita.metas.porPatente) pat(c.patente, 'economy.trabalhoDireita');
    pat(d.economy.empresa.patenteMin, 'economy.empresa');
    for (const p of d.economy.saude.clinica.planos) pat(p.patenteMin, `economy.saude/${p.id}`);
    const est = d.structureKindsById;
    for (const n of d.economy.empresa.negocios) if (n.estrutura && !est.has(n.estrutura)) problems.push(`economy.empresa/${n.id}: estrutura ${n.estrutura}`);
    for (const t of d.housing.tipos) for (const r of t.materiais ?? []) if (!materials.has(r.recurso)) problems.push(`housing/${t.id}: recurso ${r.recurso}`);
    for (const m of d.furniture) {
      if (m.requerAssinatura && !d.economy.app.assinaturas.some((a) => a.id === m.requerAssinatura)) problems.push(`furniture/${m.id}: assinatura ${m.requerAssinatura}`);
    }
    for (const s of d.societies.sociedades) {
      for (const i of s.instituicoes) if (!d.institutionsById.has(i)) problems.push(`societies/${s.id}: instituição ${i}`);
      for (const p of s.patentes) {
        for (const mo of p.libera.moradias) if (!d.housing.tipos.some((t) => t.id === mo)) problems.push(`societies/${s.id}/${p.id}: moradia ${mo}`);
        for (const c of p.libera.cargos) if (!d.roles.cargos.some((x) => x.id === c)) problems.push(`societies/${s.id}/${p.id}: cargo ${c}`);
      }
    }
    for (const p of d.factionAi.personagens) {
      if (p.tambemTreinador && d.trainersById.get(p.tambemTreinador)?.iaFaccao !== p.id) problems.push(`faction_ai/${p.id}: treinador sem iaFaccao recíproca`);
    }
    for (const t of d.trainers) {
      if (t.iaFaccao && d.factionCharactersById.get(t.iaFaccao)?.tambemTreinador !== t.id) problems.push(`trainers/${t.id}: IA sem tambemTreinador recíproco`);
    }
    walk({ missions: d.missions, dungeons: d.dungeons, lessons: d.lessons, endgame: d.endgame }, (o, p) => {
      if (o.kind === 'planta' && typeof o.estrutura === 'string' && !est.has(o.estrutura)) problems.push(`${p}: estrutura ${o.estrutura}`);
      if (o.kind === 'item' && typeof o.item === 'string') {
        if (!d.itemsById.has(o.item) && !d.uniquesById.has(o.item) && !d.consumablesById.has(o.item) && !materials.has(o.item)) problems.push(`${p}: item ${o.item}`);
      }
      if (o.kind === 'reputacao' && typeof o.instituicao === 'string' && !d.institutionsById.has(o.instituicao)) problems.push(`${p}: instituição ${o.instituicao}`);
    });
    expect(problems).toEqual([]);
  });

  it('itens das lojas', () => {
    const problems: string[] = [];
    for (const s of d.shops.lojas) {
      for (const e of s.itens) {
        const ok =
          e.tipo === 'equipamento'
            ? d.itemsById.has(e.item) || d.uniquesById.has(e.item)
            : e.tipo === 'consumivel'
              ? d.consumablesById.has(e.item)
              : materials.has(e.item);
        if (!ok) problems.push(`shops/${s.id}: ${e.tipo} ${e.item}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
