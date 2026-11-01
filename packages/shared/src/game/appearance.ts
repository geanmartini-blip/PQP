/**
 * Criação de personagem em camadas (estilo Habbo): validação da aparência pelas opções de
 * appearance.json, sorteio e regras de nome.
 */
import { getData } from '../data';
import type { Rng } from '../sim/types';
import type { Appearance, Check } from './types';

export interface AppearanceCheckOpts {
  /** opções zoeiras liberadas (peles zoeiras): sem estar aqui, a pele zoeira é recusada */
  unlocks?: readonly string[];
  /** paletas aceitas; padrão: as 6 cores da roupa do Delta */
  palettes?: readonly string[];
}

export interface AppearanceCheck {
  ok: boolean;
  erros: string[];
}

/** Ids das 6 cores da camiseta do Delta (appearance.roupaInicial.cores). */
export const deltaPalettes = (): string[] => [...getData().appearance.roupaInicial.cores];

/**
 * Confere uma aparência: 5 corpos, 15 tons de pele (3 zoeiros, só se liberados), 16 rostos,
 * 20 cortes, 12 cores de cabelo, detalhes (no máximo regras.maxDetalhes, um por grupo, sem
 * grupos que se excluem) e a paleta.
 */
export function validateAppearance(look: unknown, opts: AppearanceCheckOpts = {}): AppearanceCheck {
  const A = getData().appearance;
  const erros: string[] = [];
  if (typeof look !== 'object' || look === null) return { ok: false, erros: ['aparência ausente'] };
  const l = look as Partial<Record<keyof Appearance, unknown>>;
  const one = (field: keyof Appearance, list: readonly { id: string }[], nome: string) => {
    const v = l[field];
    if (typeof v !== 'string' || !list.some((x) => x.id === v)) erros.push(`${nome} inválido`);
  };
  one('body', A.corpos, 'corpo');
  one('skin', A.peles, 'pele');
  one('face', A.rostos, 'rosto');
  one('hair', A.cortes, 'corte de cabelo');
  one('hair_color', A.coresCabelo, 'cor do cabelo');
  const pele = A.peles.find((p) => p.id === l.skin);
  if (pele?.zoeiro && !(opts.unlocks ?? []).includes(pele.id)) erros.push(`pele ${pele.name} ainda não liberada: ${pele.desbloqueio?.descricao ?? ''}`.trim());
  // detalhes
  const det = l.details;
  if (!Array.isArray(det)) erros.push('detalhes inválidos');
  else {
    if (det.length > A.regras.maxDetalhes) erros.push(`no máximo ${A.regras.maxDetalhes} detalhes`);
    const grupos = new Set<string>();
    const vistos = new Set<string>();
    const defs = [];
    for (const d of det) {
      const def = typeof d === 'string' ? A.detalhes.find((x) => x.id === d) : undefined;
      if (!def) {
        erros.push(`detalhe inválido: ${String(d)}`);
        continue;
      }
      if (vistos.has(def.id)) erros.push(`detalhe repetido: ${def.name}`);
      vistos.add(def.id);
      if (A.regras.umPorGrupo && grupos.has(def.grupo)) erros.push(`um detalhe por grupo: ${def.grupo}`);
      grupos.add(def.grupo);
      defs.push(def);
    }
    for (const def of defs) for (const g of def.excluiGrupos) if (grupos.has(g)) erros.push(`${def.name} não combina com ${g}`);
  }
  const palettes = opts.palettes ?? deltaPalettes();
  if (typeof l.palette !== 'string' || !palettes.includes(l.palette)) erros.push('cor do traje inválida');
  return { ok: erros.length === 0, erros: [...new Set(erros)] };
}

/** Aparência padrão (appearance.padrao), como objeto novo. */
export function defaultAppearance(): Appearance {
  const p = getData().appearance.padrao;
  return { body: p.body, skin: p.skin, face: p.face, hair: p.hair, hair_color: p.hair_color, details: [...p.details], palette: p.palette };
}

/**
 * Sorteio da criação (botão "sortear"): só peles não zoeiras (as zoeiras se liberam jogando),
 * 0 a 2 detalhes respeitando os grupos e uma das 6 cores do Delta.
 * SUGESTÃO: 0 a 2 detalhes no sorteio, para o boneco não sair carregado demais.
 */
export function randomAppearance(rng: Rng, opts: { unlocks?: readonly string[] } = {}): Appearance {
  const A = getData().appearance;
  const unlocked = opts.unlocks ?? [];
  const peles = A.peles.filter((p) => !p.zoeiro || unlocked.includes(p.id));
  const n = rng.int(0, 2);
  const details: string[] = [];
  const grupos = new Set<string>();
  const pool = [...A.detalhes];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const k = rng.int(0, pool.length - 1);
    const d = pool.splice(k, 1)[0]!;
    if (grupos.has(d.grupo) || d.excluiGrupos.some((g) => grupos.has(g))) continue;
    if (details.some((id) => A.detalhes.find((x) => x.id === id)?.excluiGrupos.includes(d.grupo))) continue;
    grupos.add(d.grupo);
    details.push(d.id);
  }
  return {
    body: rng.pick(A.corpos).id,
    skin: rng.pick(peles).id,
    face: rng.pick(A.rostos).id,
    hair: rng.pick(A.cortes).id,
    hair_color: rng.pick(A.coresCabelo).id,
    details,
    palette: rng.pick(A.roupaInicial.cores),
  };
}

// ---------------------------------------------------------------------------
// Nome

/** Minúsculas, sem acento, sem espaço e pontuação, com o leetspeak trocado (appearance.nome.normalizacao). */
export function normalizeName(name: string): string {
  const trocas = getData().appearance.nome.normalizacao.trocas;
  let s = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = Array.from(s)
    .map((c) => trocas[c] ?? c)
    .join('');
  return s.replace(/[^a-z0-9]/g, '');
}

/** Nome limpo: tira as pontas e junta espaços repetidos. */
export const cleanDisplayName = (name: string): string => name.trim().replace(/\s+/g, ' ');

/**
 * Nome livre de 3 a 16 caracteres (letras com acento, números, espaço, apóstrofo, ponto e hífen),
 * nem só números nem só espaços, com filtro simples de ofensa no nome normalizado.
 */
export function validateName(raw: unknown): Check & { nome?: string } {
  const R = getData().appearance.nome;
  if (typeof raw !== 'string') return { ok: false, erro: 'Escreva um nome.' };
  const nome = cleanDisplayName(raw);
  const len = Array.from(nome).length;
  if (len < R.minCaracteres || len > R.maxCaracteres) return { ok: false, erro: `O nome precisa ter de ${R.minCaracteres} a ${R.maxCaracteres} letras.` };
  if (!new RegExp(R.permitido).test(nome)) return { ok: false, erro: 'Use só letras, números, espaço, apóstrofo, ponto e hífen.' };
  if (/^[0-9 '.-]+$/.test(nome)) return { ok: false, erro: 'O nome precisa ter alguma letra.' };
  let norm = normalizeName(nome);
  for (const ex of R.excecoes) norm = norm.split(normalizeName(ex)).join('');
  if (R.padroesOfensa.some((p) => norm.includes(normalizeName(p)))) return { ok: false, erro: R.mensagemRecusa };
  return { ok: true, nome };
}
