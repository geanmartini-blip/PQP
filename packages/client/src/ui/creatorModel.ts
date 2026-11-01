/**
 * Modelo do editor de visual (puro, testável): a tela de criação do Delta e a Máquina de Visual
 * usam o mesmo editor. Abas, opções de cada aba, escolha com as regras dos detalhes (um por grupo,
 * grupos que se excluem, no máximo 4), sorteio e o CharacterLook da prévia.
 *
 * A regra de verdade é do servidor (shared/game: validateAppearance, applyVisualMachine); aqui só
 * se evita mandar o que ele vai recusar, e a prévia mostra o mesmo visual que o servidor vai montar.
 */
import { getData } from '@pqp/shared';
import { randomAppearance, validateAppearance } from '@pqp/shared/game/appearance';
import { lookOf, paletteOptions, unlockedVisualTiers } from '@pqp/shared/game/visual';
import type { Appearance, CharacterLook, PlayerRecord, VisualTierId } from '@pqp/shared/game/types';
import type { PlayerProfile } from '@pqp/shared/game/record';
import type { Rng } from '@pqp/shared/sim';

export type CreatorTab = 'corpo' | 'pele' | 'rosto' | 'cabelo' | 'cor_cabelo' | 'detalhes' | 'camiseta' | 'visual';

export interface TabDef {
  id: CreatorTab;
  /** rótulo curto do botão da aba */
  label: string;
}

// SUGESTÃO: rótulos das abas (curtos, para caber no celular em retrato).
export const CREATION_TABS: readonly TabDef[] = [
  { id: 'corpo', label: 'Corpo' },
  { id: 'pele', label: 'Pele' },
  { id: 'rosto', label: 'Rosto' },
  { id: 'cabelo', label: 'Cabelo' },
  { id: 'cor_cabelo', label: 'Cor' },
  { id: 'detalhes', label: 'Detalhes' },
  { id: 'camiseta', label: 'Camiseta' },
];

export interface CreatorOption {
  id: string;
  name: string;
  /** cor da amostra (#rrggbb), quando a opção é uma cor */
  color?: string;
  /** cores extras da amostra (paletas do traje) */
  colors?: string[];
  /** escolhida agora */
  on: boolean;
  /** travada (pele zoeira ainda não liberada) e por quê */
  locked?: string;
  descricao?: string;
}

export type EditorMode = { kind: 'criacao' } | { kind: 'maquina'; maquina: string; termos: boolean };

/** Perfil mínimo que o editor precisa (o 'perfil' do servidor serve). */
export type EditorProfile = Pick<PlayerProfile, 'level' | 'institution' | 'archetype' | 'appearance' | 'shown_visual_tier' | 'unlocks' | 'stage'>;

export interface EditorState {
  mode: EditorMode;
  tab: CreatorTab;
  look: Appearance;
  /** visual liberado mostrado (só na máquina); null = o mais alto */
  shown: VisualTierId | null;
  name: string;
  unlocks: string[];
  profile: EditorProfile | null;
}

/** Registro de mentira com o que lookOf/paletteOptions leem (para a prévia bater com o servidor). */
function fakeRecord(s: EditorState): PlayerRecord {
  const p = s.profile;
  return {
    level: p?.level ?? 1,
    institution: p?.institution ?? null,
    archetype: p?.archetype ?? null,
    appearance: s.look,
    shown_visual_tier: s.shown,
    equipment: {},
    unlocks: s.unlocks,
  } as unknown as PlayerRecord;
}

export function newEditor(mode: EditorMode, profile: EditorProfile | null, look?: Appearance): EditorState {
  const base = look ?? profile?.appearance ?? { ...getData().appearance.padrao, details: [...getData().appearance.padrao.details] };
  return {
    mode,
    tab: 'corpo',
    look: { ...base, details: [...base.details] },
    shown: mode.kind === 'maquina' ? (profile?.shown_visual_tier ?? null) : null,
    name: '',
    unlocks: [...(profile?.unlocks ?? [])],
    profile,
  };
}

/** Abas do editor: na máquina entra a aba dos visuais liberados quando há mais de um. */
export function tabsOf(s: EditorState): TabDef[] {
  const tabs = CREATION_TABS.map((t) => (t.id === 'camiseta' && s.mode.kind === 'maquina' && s.profile?.institution ? { ...t, label: 'Traje' } : t));
  if (s.mode.kind === 'maquina' && unlockedVisualTiers(fakeRecord(s)).length > 1) tabs.push({ id: 'visual', label: 'Visual' });
  return tabs;
}

/** Paletas do traje no visual mostrado agora (Delta: 6 cores da camiseta; ala: 3). */
export function paletteIds(s: EditorState): string[] {
  if (s.mode.kind === 'criacao') return [...getData().appearance.roupaInicial.cores];
  return paletteOptions(fakeRecord(s));
}

/** Nome e cores de uma paleta (Delta, base da instituição ou ala). */
export function paletteInfo(id: string): { name: string; cores: string[] } {
  const D = getData();
  for (const t of D.outfits.tiers) for (const p of t.paletas ?? []) if (p.id === id) return { name: p.name, cores: [...p.cores] };
  for (const a of D.archetypes) for (const p of a.paletasTraje ?? []) if (p.id === id) return { name: p.name, cores: [...p.cores] };
  return { name: id, cores: ['#888888'] };
}

// SUGESTÃO: nomes curtos dos visuais por nível.
const TIER_NAMES: Record<VisualTierId, string> = {
  delta: 'Delta',
  uniforme: 'Uniforme',
  aprendiz: 'Aprendiz',
  veterano: 'Veterano',
  virada: 'Virada',
  mestre: 'Mestre',
  lendario: 'Lendário',
};

/** Opções da aba. */
export function optionsOf(s: EditorState, tab: CreatorTab = s.tab): CreatorOption[] {
  const A = getData().appearance;
  const l = s.look;
  switch (tab) {
    case 'corpo':
      return A.corpos.map((c) => ({ id: c.id, name: c.name, on: l.body === c.id, ...(c.descricao ? { descricao: c.descricao } : {}) }));
    case 'pele':
      return A.peles.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.hex,
        on: l.skin === p.id,
        ...(p.zoeiro && !s.unlocks.includes(p.id) ? { locked: p.desbloqueio?.descricao ?? 'Libera jogando' } : {}),
        ...(p.descricao ? { descricao: p.descricao } : {}),
      }));
    case 'rosto':
      return A.rostos.map((r) => ({ id: r.id, name: r.name, on: l.face === r.id, ...(r.descricao ? { descricao: r.descricao } : {}) }));
    case 'cabelo':
      return A.cortes.map((c) => ({ id: c.id, name: c.name, on: l.hair === c.id, ...(c.descricao ? { descricao: c.descricao } : {}) }));
    case 'cor_cabelo':
      return A.coresCabelo.map((c) => ({ id: c.id, name: c.name, color: c.hex, on: l.hair_color === c.id }));
    case 'detalhes':
      return A.detalhes.map((d) => ({ id: d.id, name: d.name, on: l.details.includes(d.id), ...(d.descricao ? { descricao: d.descricao } : {}) }));
    case 'camiseta':
      return paletteIds(s).map((id) => {
        const p = paletteInfo(id);
        return { id, name: p.name, color: p.cores[0]!, colors: p.cores.slice(0, 3), on: l.palette === id };
      });
    case 'visual': {
      const rec = fakeRecord(s);
      const tiers = unlockedVisualTiers(rec);
      const cur = s.shown ?? tiers[tiers.length - 1];
      return tiers.map((t) => ({ id: t, name: TIER_NAMES[t], on: cur === t }));
    }
  }
}

/** Toque numa opção. Devolve false se não mudou (opção travada). */
export function choose(s: EditorState, tab: CreatorTab, id: string): boolean {
  const A = getData().appearance;
  const l = s.look;
  switch (tab) {
    case 'corpo':
      l.body = id;
      return true;
    case 'pele': {
      const p = A.peles.find((x) => x.id === id);
      if (!p || (p.zoeiro && !s.unlocks.includes(p.id))) return false;
      l.skin = id;
      return true;
    }
    case 'rosto':
      l.face = id;
      return true;
    case 'cabelo':
      l.hair = id;
      return true;
    case 'cor_cabelo':
      l.hair_color = id;
      return true;
    case 'detalhes':
      l.details = toggleDetail(l.details, id);
      return true;
    case 'camiseta':
      if (!paletteIds(s).includes(id)) return false;
      l.palette = id;
      return true;
    case 'visual': {
      s.shown = id as VisualTierId;
      // trocou o visual: a paleta precisa ser uma do visual novo
      const pals = paletteIds(s);
      if (!pals.includes(l.palette)) l.palette = pals[0] ?? l.palette;
      return true;
    }
  }
}

/**
 * Liga ou desliga um detalhe com as regras de appearance.regras: um por grupo (o novo troca o do
 * mesmo grupo), grupos que se excluem saem, no máximo maxDetalhes (sai o mais antigo).
 */
export function toggleDetail(details: readonly string[], id: string): string[] {
  const A = getData().appearance;
  if (details.includes(id)) return details.filter((d) => d !== id);
  const def = A.detalhes.find((d) => d.id === id);
  if (!def) return [...details];
  const defOf = (d: string) => A.detalhes.find((x) => x.id === d);
  let out = details.filter((d) => {
    const o = defOf(d);
    if (!o) return false;
    if (A.regras.umPorGrupo && o.grupo === def.grupo) return false;
    if (def.excluiGrupos.includes(o.grupo) || o.excluiGrupos.includes(def.grupo)) return false;
    return true;
  });
  out.push(id);
  if (out.length > A.regras.maxDetalhes) out = out.slice(out.length - A.regras.maxDetalhes);
  return out;
}

/** Sorteio (botão "Sortear"): o mesmo sorteio das regras; na máquina, mantém a paleta se ela não valer. */
export function randomize(s: EditorState, rng: Rng): void {
  const a = randomAppearance(rng, { unlocks: s.unlocks });
  if (s.mode.kind === 'maquina') {
    const pals = paletteIds(s);
    a.palette = pals.length > 0 ? rng.pick(pals) : s.look.palette;
  }
  s.look = a;
}

/** Visual da prévia (o mesmo que o servidor monta depois). */
export function previewLook(s: EditorState): CharacterLook {
  if (s.mode.kind === 'criacao') {
    const pals = getData().appearance.roupaInicial.cores;
    const l = s.look;
    return { body: l.body, skin: l.skin, face: l.face, hair: l.hair, hairColor: l.hair_color, details: [...l.details], outfit: { tier: 'delta', palette: Math.max(0, pals.indexOf(l.palette)) } };
  }
  return lookOf(fakeRecord(s));
}

/** Confere antes de mandar (os mesmos erros que o servidor daria). */
export function checkEditor(s: EditorState): string[] {
  const pals = paletteIds(s);
  return validateAppearance(s.look, { unlocks: s.unlocks, palettes: pals }).erros;
}

/** Mudança para a mensagem maquina_visual: só os campos que mudaram (mais o aceite dos termos). */
export function visualChange(s: EditorState): Record<string, unknown> {
  const before = s.profile?.appearance;
  const l = s.look;
  const out: Record<string, unknown> = {};
  if (!before || before.body !== l.body) out['body'] = l.body;
  if (!before || before.skin !== l.skin) out['skin'] = l.skin;
  if (!before || before.face !== l.face) out['face'] = l.face;
  if (!before || before.hair !== l.hair) out['hair'] = l.hair;
  if (!before || before.hair_color !== l.hair_color) out['hair_color'] = l.hair_color;
  if (!before || before.details.join(',') !== l.details.join(',')) out['details'] = [...l.details];
  if (!before || before.palette !== l.palette) out['palette'] = l.palette;
  if ((s.profile?.shown_visual_tier ?? null) !== s.shown) out['shown_visual_tier'] = s.shown;
  if (s.mode.kind === 'maquina' && s.mode.termos) out['aceitouTermos'] = true;
  return out;
}

/** Rng simples para o sorteio da tela (fora da simulação: semente do relógio). */
export function uiRng(seed: number): Rng {
  let a = seed >>> 0 || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(arr: readonly T[]) => arr[Math.floor(next() * arr.length)]!,
    state: () => a,
  };
}
