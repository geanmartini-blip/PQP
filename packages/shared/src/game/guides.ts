/**
 * Fase 3: guias (12 espíritos na Esquerda, 4 IAs de bolso na Direita). O bônus pequeno no combate
 * vem de guides.json (bonus) e vale pela simulação (Entity.guideId, sim/passives.ts). Aqui ficam as
 * falas: o guia fala nas missões, na conversa e quando o bônus dispara. As falas giram em ordem
 * (contador no registro), sem sorteio.
 */
import { getData } from '../data';
import type { Guide, GuideLineSituation } from '../schema/guide';
import type { PlayerRecord } from './types';

export const guideOf = (rec: Pick<PlayerRecord, 'guide_id'>): Guide | undefined => (rec.guide_id ? getData().guidesById.get(rec.guide_id) : undefined);

export interface GuideLineOut {
  guia: string;
  nome: string;
  situacao: string;
  texto: string;
}

/**
 * Próxima fala do guia na situação (com {nome} e as variáveis trocadas). Sem fala na situação,
 * cai na 'aleatoria'. Devolve null sem guia.
 */
export function guideLine(rec: PlayerRecord, situacao: GuideLineSituation, vars: Record<string, string | number> = {}): GuideLineOut | null {
  const g = guideOf(rec);
  if (!g) return null;
  let lines = g.falas.filter((f) => f.situacao === situacao);
  let sit: string = situacao;
  if (lines.length === 0) {
    lines = g.falas.filter((f) => f.situacao === 'aleatoria');
    sit = 'aleatoria';
  }
  if (lines.length === 0) return null;
  const k = `guia:${g.id}:${sit}`;
  const i = rec.counters[k] ?? 0;
  rec.counters[k] = i + 1;
  let texto = lines[i % lines.length]!.texto.replaceAll('{nome}', rec.name);
  for (const [v, x] of Object.entries(vars)) texto = texto.replaceAll(`{${v}}`, String(x));
  // variáveis que o jogo ainda não preenche ficam com um valor neutro
  // SUGESTÃO: '?' no lugar de {chance}, {meta} e {inimigos} sem valor.
  texto = texto.replace(/\{[a-zA-Z]+\}/g, '?');
  return { guia: g.id, nome: g.name, situacao: sit, texto };
}

/** Resumo do guia para o perfil e para a tela do guia. */
export function guideSummary(rec: PlayerRecord): { id: string; name: string; tipo: string; bonusTexto: string; jeitoDeFalar: string } | null {
  const g = guideOf(rec);
  return g ? { id: g.id, name: g.name, tipo: g.tipo, bonusTexto: g.bonusTexto, jeitoDeFalar: g.jeitoDeFalar } : null;
}
