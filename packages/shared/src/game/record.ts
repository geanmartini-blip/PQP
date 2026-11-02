/**
 * PlayerRecord: criação, migração de registros antigos (Fase 1) e o perfil resumido que vai ao
 * cliente.
 */
import { getData } from '../data';
import { xpDaFormula } from '../schema/progression';
import type { Resource } from '../schema/world';
import type { DoctrineCard } from '../sim/types';
import { defaultAppearance } from './appearance';
import { lookOf } from './visual';
import { ALA_LEVEL, canChooseArchetype, loadoutOf, type LoadoutView } from './ala';
import { DELTA_MAX_LEVEL, TRAVESSIA_LEVEL } from './progression';
import { pendingTalentLevels } from './talents';
import { unlockedEmotes } from './trainers';
import { faixaScore } from './economy';
import type { Appearance, CharacterLook, HomeState, PlayerRecord, PlayerStage, Rotacao, SideId, VisualTierId } from './types';

export const RECORD_VERSION = 2;

/** SUGESTÃO: poções no botão de item ao criar o personagem (igual ao START_POTIONS da simulação). */
export const START_ITEM_COUNT = 3;

/** Registro novo: Delta, nível 1, sem lado, aparência padrão e ainda não criado (falta nome e visual). */
export function newPlayerRecord(id: string, name: string): PlayerRecord {
  const ini = getData().economy.saldoInicial.delta;
  return {
    version: RECORD_VERSION,
    id,
    name,
    criado: false,
    appearance: defaultAppearance(),
    shown_visual_tier: null,
    stage: 'delta',
    side: null,
    institution: null,
    class: null,
    archetype: null,
    rank: null,
    institution_rank: null,
    guide_id: null,
    level: 1,
    xp: 0,
    talent_picks: [],
    loadout: { slot3_ability: null, botoes: [] },
    equipment: {},
    inventory: [],
    resources: {},
    item_count: START_ITEM_COUNT,
    doctrine: [],
    auto: false,
    on_duty: false,
    home_id: null,
    semente: ini.semente,
    credito: ini.credito,
    score: 0,
    story_flags: [],
    missions: { ativas: [], concluidas: [], progresso: {} },
    tutorial: { feitos: [], controles: [] },
    unlocks: [],
    counters: {},
    lugar_atual: null,
    home: null,
    economia: { ciclo: 0, divida: 0, scoreCiclo: {}, cambioCiclo: 0, moradiaDada: false },
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Campo de aparência válido ou o padrão. */
function migrateAppearance(raw: unknown, fallback: Appearance, palettes: string[]): Appearance {
  const A = getData().appearance;
  const r = isObj(raw) ? raw : {};
  const pick = (v: unknown, list: readonly { id: string }[], d: string) => (typeof v === 'string' && list.some((x) => x.id === v) ? v : d);
  const details = strArr(r['details']).filter((d) => A.detalhes.some((x) => x.id === d)).slice(0, A.regras.maxDetalhes);
  const pal = str(r['palette']);
  return {
    body: pick(r['body'], A.corpos, fallback.body),
    skin: pick(r['skin'], A.peles.filter((p) => !p.zoeiro), fallback.skin),
    face: pick(r['face'], A.rostos, fallback.face),
    hair: pick(r['hair'], A.cortes, fallback.hair),
    hair_color: pick(r['hair_color'] ?? r['hairColor'], A.coresCabelo, fallback.hair_color),
    details,
    palette: pal && palettes.includes(pal) ? pal : (palettes[0] ?? fallback.palette),
  };
}

/** Ids das missões do Delta e da travessia (cadeias delta_1_a_7 e travessia). */
export const deltaChainMissions = (): string[] => {
  const c = getData().missions.cadeias;
  return [...(c.find((x) => x.id === 'delta_1_a_7')?.missoes ?? []), ...(c.find((x) => x.id === 'travessia')?.missoes ?? [])];
};

/**
 * Lê um registro de qualquer versão. Aceita:
 * - o registro da Fase 2 (version 2), completando campos que faltarem;
 * - o registro do servidor da Fase 1 ({ id, token, name, data: { archetypeId, level, xp, ... } });
 * - o PlayerData da Fase 1 solto.
 * Jogador da Fase 1 com ala vira 'margem' com classe, instituição e margem do arquétipo, com o
 * Delta e a travessia dados como feitos (sem guia: escolhe depois). Jogador 'delta' continua no
 * Delta e passa pela criação de personagem.
 */
export function migratePlayerRecord(raw: unknown, fallbackId = 'jogador'): PlayerRecord {
  const D = getData();
  const r = isObj(raw) ? raw : {};
  const data = isObj(r['data']) ? (r['data'] as Record<string, unknown>) : r;
  const id = str(r['id']) ?? fallbackId;
  const name = str(r['name']) ?? str(data['name']) ?? 'Visitante';
  const rec = newPlayerRecord(id, name);

  if (num(r['version']) !== undefined && num(r['version'])! >= 2) {
    // registro da Fase 2: copia o que existir e completa o resto
    const base = rec as unknown as Record<string, unknown>;
    for (const k of Object.keys(base)) if (r[k] !== undefined) base[k] = r[k];
    rec.version = RECORD_VERSION;
    rec.missions = {
      ativas: strArr(isObj(r['missions']) ? r['missions']['ativas'] : []),
      concluidas: strArr(isObj(r['missions']) ? r['missions']['concluidas'] : []),
      progresso: isObj(r['missions']) && isObj(r['missions']['progresso']) ? (r['missions']['progresso'] as Record<string, number[][]>) : {},
    };
    rec.tutorial = {
      feitos: strArr(isObj(r['tutorial']) ? r['tutorial']['feitos'] : []),
      controles: strArr(isObj(r['tutorial']) ? r['tutorial']['controles'] : []),
    };
    rec.loadout = isObj(r['loadout'])
      ? { slot3_ability: str(r['loadout']['slot3_ability']) ?? null, botoes: strArr(r['loadout']['botoes']) }
      : rec.loadout;
    rec.appearance = migrateAppearance(r['appearance'], defaultAppearance(), allPalettes());
    for (const k of ['story_flags', 'inventory', 'talent_picks', 'unlocks'] as const) rec[k] = strArr(r[k]);
    rec.counters = isObj(r['counters']) ? (r['counters'] as Record<string, number>) : {};
    rec.equipment = isObj(r['equipment']) ? (r['equipment'] as Record<string, string>) : {};
    // v0.3: a calça entrou na armadura; item que não existe mais sai do save
    delete rec.equipment['calca'];
    rec.inventory = rec.inventory.filter((id) => !/^calca_.*_(comum|raro)$/.test(id));
    rec.resources = isObj(r['resources']) ? (r['resources'] as Partial<Record<Resource, number>>) : {};
    // Fase 4: casa e carteira (registro sem esses campos ganha os padrões)
    rec.home = isObj(r['home']) && typeof r['home']['tipo'] === 'string' ? migrateHome(r['home']) : null;
    const ec = isObj(r['economia']) ? r['economia'] : {};
    rec.economia = {
      ciclo: num(ec['ciclo']) ?? 0,
      divida: Math.max(0, num(ec['divida']) ?? 0),
      scoreCiclo: isObj(ec['scoreCiclo']) ? (ec['scoreCiclo'] as Record<string, number>) : {},
      cambioCiclo: Math.max(0, num(ec['cambioCiclo']) ?? 0),
      moradiaDada: ec['moradiaDada'] === true || rec.home !== null,
    };
    return rec;
  }

  // Fase 1
  rec.level = Math.max(1, Math.floor(num(data['level']) ?? 1));
  rec.xp = Math.max(0, num(data['xp']) ?? 0);
  rec.semente = Math.max(0, num(data['semente']) ?? rec.semente);
  rec.credito = Math.max(0, num(data['credito']) ?? rec.credito);
  rec.inventory = strArr(data['inventory']);
  rec.item_count = Math.max(0, Math.floor(num(data['itemCount']) ?? rec.item_count));
  rec.doctrine = Array.isArray(data['doctrine']) ? (data['doctrine'] as DoctrineCard[]) : [];
  rec.auto = data['auto'] === true;
  const archId = str(data['archetypeId']);
  const arch = archId ? D.archetypesById.get(archId) : undefined;
  const cls = !arch && archId ? D.classesById.get(archId) : undefined;
  if (arch || cls) {
    const side: SideId = (arch?.margem as SideId | undefined) ?? 'esquerda';
    const inst = arch ? D.institutionsById.get(arch.instituicao) : D.institutions.instituicoes.find((i) => i.classe === cls!.id && i.margem === side);
    const society = D.societies.sociedades.find((s) => s.side === side);
    rec.stage = 'margem';
    rec.side = side;
    rec.archetype = arch?.id ?? null;
    rec.class = arch?.classe ?? cls?.id ?? null;
    rec.institution = inst?.id ?? null;
    rec.rank = society?.patentes[0]?.id ?? null;
    rec.institution_rank = inst?.patentes[0] ?? null;
    const c = rec.class ? D.classesById.get(rec.class) : undefined;
    const slot3 = str(data['slot3']);
    rec.loadout = {
      slot3_ability: slot3 && c?.abilities.includes(slot3) ? slot3 : (c?.slot3Padrao ?? null),
      botoes: c ? [...c.loadoutPreAla.botoes] : [],
    };
    rec.level = Math.max(rec.level, arch ? ALA_LEVEL : TRAVESSIA_LEVEL);
    rec.criado = true;
    rec.story_flags = ['delta_bruno_ferro_derrotado', 'travessia_feita', `margem_${side}`];
    rec.missions.concluidas = deltaChainMissions();
  } else {
    // ainda no Delta: o teto do Delta é o 4 (o 5 só vem com o Bruno Ferro)
    rec.level = Math.min(rec.level, DELTA_MAX_LEVEL);
  }
  // aparência da Fase 1 (camelCase) e paleta por número (0..2 na ala, 0..5 no Delta)
  const pals = paletteListFor(rec);
  const appRaw = isObj(data['appearance']) ? { ...(data['appearance'] as Record<string, unknown>) } : {};
  const palN = num(data['palette']);
  if (palN !== undefined && pals[palN] !== undefined) appRaw['palette'] = pals[palN];
  rec.appearance = migrateAppearance(appRaw, defaultAppearance(), pals);
  return rec;
}

/** Casa salva (Fase 4): confere os campos e descarta móvel malformado. */
function migrateHome(h: Record<string, unknown>): HomeState {
  const moveis = (Array.isArray(h['moveis']) ? h['moveis'] : [])
    .filter(isObj)
    .filter((m) => typeof m['id'] === 'string' && num(m['uid']) !== undefined && num(m['x']) !== undefined && num(m['y']) !== undefined)
    .map((m) => ({ uid: m['uid'] as number, id: m['id'] as string, x: m['x'] as number, y: m['y'] as number, rot: (((num(m['rot']) ?? 0) % 4) as Rotacao) }));
  const vis = str(h['visitas']);
  const esp = isObj(h['espera']) && typeof h['espera']['final'] === 'string' ? { ciclosRestantes: Math.max(0, num(h['espera']['ciclosRestantes']) ?? 0), final: h['espera']['final'] as string } : null;
  return {
    tipo: h['tipo'] as string,
    moveis,
    seq: Math.max(num(h['seq']) ?? 1, ...moveis.map((m) => m.uid + 1)),
    visitas: vis === 'so_eu' || vis === 'grupo' || vis === 'margem' || vis === 'todos' ? vis : 'margem',
    convidados: strArr(h['convidados']),
    ...(num(h['atraso']) !== undefined ? { atraso: num(h['atraso'])! } : {}),
    ...(num(h['aluguelUltimo']) !== undefined ? { aluguelUltimo: num(h['aluguelUltimo'])! } : {}),
    espera: esp,
  };
}

/** Todas as paletas conhecidas (Delta, bases e alas). */
function allPalettes(): string[] {
  const D = getData();
  const out = [...D.appearance.roupaInicial.cores];
  for (const t of D.outfits.tiers) for (const p of t.paletas ?? []) out.push(p.id);
  for (const a of D.archetypes) for (const p of a.paletasTraje ?? []) out.push(p.id);
  return out;
}

/** Paletas do visual que o registro mostra hoje (sem depender de visual.ts para não criar ciclo de import na migração). */
function paletteListFor(rec: PlayerRecord): string[] {
  const D = getData();
  if (rec.archetype) return (D.archetypesById.get(rec.archetype)?.paletasTraje ?? []).map((p) => p.id);
  if (rec.institution) return (D.outfits.tiers.find((t) => t.tier === 'base' && t.instituicao === rec.institution)?.paletas ?? []).map((p) => p.id);
  return [...D.appearance.roupaInicial.cores];
}

/** Perfil resumido que vai ao cliente na mensagem 'perfil'. */
export interface PlayerProfile {
  id: string;
  name: string;
  criado: boolean;
  stage: PlayerStage;
  side: SideId | null;
  institution: string | null;
  class: string | null;
  archetype: string | null;
  rank: string | null;
  institution_rank: string | null;
  guide_id: string | null;
  level: number;
  xp: number;
  xpParaProximo: number;
  semente: number;
  credito: number;
  score: number;
  appearance: Appearance;
  shown_visual_tier: VisualTierId | null;
  look: CharacterLook;
  story_flags: string[];
  unlocks: string[];
  tutorial: { feitos: string[]; controles: string[] };
  /** controles da tela já liberados pelo tutorial (desbloqueioTutorial + o que a missão atual ensina) */
  controlesLiberados: string[];
  resources: Partial<Record<Resource, number>>;
  // ---- Fase 3 ----
  /** emotes liberados (bordões dos treinadores) */
  emotes?: string[];
  /** talentos escolhidos */
  talentos?: string[];
  /** níveis de talento (10, 15, 20) alcançados e ainda sem escolha */
  talentosPendentes?: number[];
  /** botões pela regra dos docs, com as opções do botão 3 */
  loadout?: LoadoutView | null;
  /** pode escolher a ala agora */
  podeEscolherAla?: boolean;
  // ---- Fase 4 ----
  /** faixa do score de Crédito (economy.json score.faixas) */
  faixaScore?: { id: string; name: string };
  /** Crédito devido (aluguel atrasado) */
  divida?: number;
  home_id?: string | null;
  /** tipo da moradia (housing.json) e ciclos que faltam na lista de espera */
  casa?: { tipo: string; espera: number | null; atraso: number } | null;
}

export function xpForLevel(level: number): number {
  return xpDaFormula(getData().progression.xp.formula, level);
}

export function profileOf(rec: PlayerRecord, controlesLiberados: string[] = []): PlayerProfile {
  return {
    id: rec.id,
    name: rec.name,
    criado: rec.criado,
    stage: rec.stage,
    side: rec.side,
    institution: rec.institution,
    class: rec.class,
    archetype: rec.archetype,
    rank: rec.rank,
    institution_rank: rec.institution_rank,
    guide_id: rec.guide_id,
    level: rec.level,
    xp: rec.xp,
    xpParaProximo: xpForLevel(rec.level),
    semente: rec.semente,
    credito: rec.credito,
    score: rec.score,
    appearance: { ...rec.appearance, details: [...rec.appearance.details] },
    shown_visual_tier: rec.shown_visual_tier,
    look: lookOf(rec),
    story_flags: [...rec.story_flags],
    unlocks: [...rec.unlocks],
    tutorial: { feitos: [...rec.tutorial.feitos], controles: [...rec.tutorial.controles] },
    controlesLiberados,
    resources: { ...rec.resources },
    emotes: unlockedEmotes(rec),
    talentos: [...rec.talent_picks],
    talentosPendentes: pendingTalentLevels(rec),
    loadout: loadoutOf(rec),
    podeEscolherAla: canChooseArchetype(rec).ok,
    faixaScore: (({ id, name }) => ({ id, name }))(faixaScore(rec)),
    divida: rec.economia?.divida ?? 0,
    home_id: rec.home_id,
    casa: rec.home ? { tipo: rec.home.tipo, espera: rec.home.espera?.ciclosRestantes ?? null, atraso: rec.home.atraso ?? 0 } : null,
  };
}

/**
 * Kit da simulação para o registro (opção archetypeId de spawnPlayer): arquétipo (12+), classe
 * (8 a 11) ou 'delta'.
 */
export const simKitOf = (rec: PlayerRecord): string => rec.archetype ?? rec.class ?? 'delta';
