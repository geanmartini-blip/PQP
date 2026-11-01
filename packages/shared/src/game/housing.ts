/**
 * Fase 4: moradia (housing.json) e móveis (furniture.json), estado em rec.home.
 *
 * - Esquerda: ao chegar, rede no galpão e lista de espera da Assembleia (listaDeEspera.ciclosBase
 *   ciclos); a casa da lista sai quando a espera chega a zero (ou com avancarListaDeEspera, o
 *   atalho dos testes). Ajudar no mutirão tira mutiraoReduzCiclos. Quem puxa o Mutirão da Casa
 *   Própria (desbloqueio 'casa_propria') recebe a casa de mutirão na hora.
 * - Direita: ao chegar, a cápsula do primeiro ciclo já paga (o desconto da travessia). O aluguel é
 *   debitado a cada ciclo da cidade (housing.json aluguel.formula). Sem saldo, o ciclo vira dívida
 *   e atraso (score cai); com 3 ciclos de atraso vem o despejo leve: os móveis vão para o
 *   inventário (não para o depósito, como no doc; // SUGESTÃO do piloto) e a casa some. Para voltar,
 *   quita a dívida e aluga de novo (alugarCapsula).
 * - Interior em grade do tamanho do tipo. Móvel ocupa w × h tiles (trocados nas rotações 1 e 3),
 *   não empilha; móvel de parede fica numa camada própria, encostado na parede do fundo (y = 0).
 *   Limite: moveisMax do tipo, contando os de parede.
 * - Visitas: so_eu, grupo, margem (padrão) ou todos; a outra margem só entra a convite. A visita é
 *   só leitura (casaView com somenteLeitura).
 * - Móvel guardado fica no inventário como 'movel:<id>'.
 */
import { getData } from '../data';
import type { Movel, Moradia } from '../schema/housing';
import { economiaOf, movelInvId, nomeMoeda, pagar, scoreEvento } from './economy';
import { rankOrder } from './ranks';
import type { Check, HomeState, Moeda, MovelColocado, PermissaoVisita, PlayerRecord, Rotacao } from './types';

export const tipoMoradia = (id: string): Moradia | undefined => getData().housing.tipos.find((t) => t.id === id);

export const homeIdOf = (rec: PlayerRecord): string => `casa_${rec.id}`;

export function novaCasa(tipo: string): HomeState {
  return { tipo, moveis: [], seq: 1, visitas: getData().housing.comum.visitas.padrao, convidados: [], espera: null };
}

function instalar(rec: PlayerRecord, h: HomeState): void {
  rec.home = h;
  rec.home_id = homeIdOf(rec);
  economiaOf(rec).moradiaDada = true;
}

/** Patente da margem do jogador alcança `patente`? (patente de outra margem: não) */
export function patenteAlcanca(rec: PlayerRecord, patente: string | undefined): boolean {
  if (!patente) return true;
  const soc = rec.side ? getData().societies.sociedades.find((s) => s.side === rec.side) : undefined;
  const p = soc?.patentes.find((x) => x.id === patente);
  return p !== undefined && p.ordem <= rankOrder(rec);
}

/**
 * Moradia inicial da margem, uma vez só (chamada depois da travessia e ao sincronizar com a
 * cidade). Esquerda: rede no galpão + lista de espera. Direita: cápsula com o 1º ciclo pago.
 */
export function darMoradiaInicial(rec: PlayerRecord): string[] {
  const H = getData().housing;
  const e = economiaOf(rec);
  if (!rec.side || rec.stage !== 'margem' || e.moradiaDada || rec.home) return [];
  if (rec.side === 'esquerda') {
    const h = novaCasa(H.listaDeEspera.moradiaProvisoria);
    h.espera = { ciclosRestantes: H.listaDeEspera.ciclosBase, final: H.listaDeEspera.moradiaFinal };
    instalar(rec, h);
    return [`Você está na lista de espera da Assembleia: ${H.listaDeEspera.ciclosBase} ciclos. Até lá, a rede no galpão é sua.`];
  }
  const cap = H.tipos.find((t) => t.side === 'direita' && t.acesso === 'aluguel' && !t.foraDoPiloto)!;
  const h = novaCasa(cap.id);
  h.atraso = 0;
  h.aluguelUltimo = cap.aluguel!.porCiclo;
  instalar(rec, h);
  return [`${cap.name} alugada. O primeiro ciclo já foi descontado. Somos uma família!`];
}

// ---------------------------------------------------------------------------
// grade

export function pegada(m: Movel, rot: Rotacao): { w: number; h: number } {
  return rot % 2 === 1 ? { w: m.tamanho.h, h: m.tamanho.w } : { w: m.tamanho.w, h: m.tamanho.h };
}

const ehParede = (m: Movel): boolean => m.parede === true;

/** O móvel cabe nessa posição? (dentro da grade, sem bater em outro da mesma camada) */
export function cabe(home: HomeState, movelId: string, x: number, y: number, rot: Rotacao, ignorarUid?: number): Check {
  const D = getData();
  const t = tipoMoradia(home.tipo);
  const m = D.furnitureById.get(movelId);
  if (!t || !m) return { ok: false, erro: 'Móvel ou casa desconhecidos.' };
  if (![0, 1, 2, 3].includes(rot)) return { ok: false, erro: 'Rotação inválida.' };
  if (!Number.isInteger(x) || !Number.isInteger(y)) return { ok: false, erro: 'Posição inválida.' };
  const p = pegada(m, rot);
  if (x < 0 || y < 0 || x + p.w > t.tamanho.w || y + p.h > t.tamanho.h) return { ok: false, erro: 'Não cabe aí: passa da parede.' };
  if (ehParede(m) && y !== 0) return { ok: false, erro: 'Esse vai na parede do fundo.' };
  for (const o of home.moveis) {
    if (o.uid === ignorarUid) continue;
    const om = D.furnitureById.get(o.id);
    if (!om || ehParede(om) !== ehParede(m)) continue;
    const op = pegada(om, o.rot);
    if (x < o.x + op.w && o.x < x + p.w && y < o.y + op.h && o.y < y + p.h) return { ok: false, erro: `Bate em ${om.name}.` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// móveis

/** Compra um móvel do catálogo: vai para o inventário ('movel:<id>'). */
export function comprarMovel(rec: PlayerRecord, movelId: string, moeda?: Moeda): Check & { moeda?: Moeda; valor?: number } {
  const m = getData().furnitureById.get(movelId);
  if (!m) return { ok: false, erro: 'Móvel desconhecido.' };
  if (m.patenteMin && !patenteAlcanca(rec, m.patenteMin)) return { ok: false, erro: 'Sua patente ainda não libera esse móvel.' };
  const margem: Moeda | undefined = rec.side === 'direita' ? 'credito' : rec.side === 'esquerda' ? 'semente' : undefined;
  const p = m.preco.find((x) => x.moeda === moeda) ?? m.preco.find((x) => x.moeda === margem) ?? m.preco[0]!;
  const pg = pagar(rec, p.moeda, p.valor);
  if (!pg.ok) return pg;
  rec.inventory.push(movelInvId(m.id));
  return { ok: true, moeda: p.moeda, valor: p.valor };
}

/** Coloca um móvel guardado na casa. */
export function colocarMovel(rec: PlayerRecord, movelId: string, x: number, y: number, rot: Rotacao = 0): Check & { movel?: MovelColocado } {
  const h = rec.home;
  if (!h) return { ok: false, erro: 'Você não tem casa.' };
  const t = tipoMoradia(h.tipo)!;
  const inv = rec.inventory.lastIndexOf(movelInvId(movelId));
  if (inv < 0) return { ok: false, erro: 'Esse móvel não está no seu inventário.' };
  if (h.moveis.length >= t.moveisMax) return { ok: false, erro: `Limite de ${t.moveisMax} móveis nesta casa.` };
  const c = cabe(h, movelId, x, y, rot);
  if (!c.ok) return c;
  rec.inventory.splice(inv, 1);
  const mv: MovelColocado = { uid: h.seq++, id: movelId, x, y, rot };
  h.moveis.push(mv);
  return { ok: true, movel: mv };
}

/** Move (e opcionalmente gira) um móvel já colocado. */
export function moverMovel(rec: PlayerRecord, uid: number, x: number, y: number, rot?: Rotacao): Check & { movel?: MovelColocado } {
  const mv = rec.home?.moveis.find((m) => m.uid === uid);
  if (!rec.home || !mv) return { ok: false, erro: 'Móvel não encontrado.' };
  const r = rot ?? mv.rot;
  const c = cabe(rec.home, mv.id, x, y, r, uid);
  if (!c.ok) return c;
  mv.x = x;
  mv.y = y;
  mv.rot = r;
  return { ok: true, movel: mv };
}

/** Gira 90 graus no lugar. Se não couber girado, não gira. */
export function girarMovel(rec: PlayerRecord, uid: number): Check & { movel?: MovelColocado } {
  const mv = rec.home?.moveis.find((m) => m.uid === uid);
  if (!mv) return { ok: false, erro: 'Móvel não encontrado.' };
  return moverMovel(rec, uid, mv.x, mv.y, ((mv.rot + 1) % 4) as Rotacao);
}

/** Tira o móvel da casa e guarda no inventário. */
export function tirarMovel(rec: PlayerRecord, uid: number): Check {
  const h = rec.home;
  const i = h ? h.moveis.findIndex((m) => m.uid === uid) : -1;
  if (!h || i < 0) return { ok: false, erro: 'Móvel não encontrado.' };
  const [mv] = h.moveis.splice(i, 1);
  rec.inventory.push(movelInvId(mv!.id));
  return { ok: true };
}

/** Muda de casa: leva os móveis que couberem na mesma posição; o resto vai para o inventário. */
export function mudarCasa(rec: PlayerRecord, tipo: string): string[] {
  const t = tipoMoradia(tipo);
  if (!t) return [];
  const antigos = rec.home?.moveis ?? [];
  const h = novaCasa(tipo);
  if (rec.home) {
    h.visitas = rec.home.visitas;
    h.convidados = [...rec.home.convidados];
  }
  const guardados: string[] = [];
  for (const m of antigos) {
    if (h.moveis.length < t.moveisMax && cabe(h, m.id, m.x, m.y, m.rot).ok) h.moveis.push({ ...m, uid: h.seq++ });
    else {
      rec.inventory.push(movelInvId(m.id));
      guardados.push(m.id);
    }
  }
  if (t.acesso === 'aluguel') {
    h.atraso = 0;
    h.aluguelUltimo = t.aluguel!.porCiclo;
  }
  instalar(rec, h);
  const av = [`Mudança para ${t.name}.${t.piada ? ` ${t.piada}` : ''}`];
  if (guardados.length) av.push(`${guardados.length} móveis não couberam e foram para o inventário.`);
  return av;
}

// ---------------------------------------------------------------------------
// Esquerda: lista de espera e mutirão

export function entrarNaListaDeEspera(rec: PlayerRecord): Check & { ciclos?: number } {
  const L = getData().housing.listaDeEspera;
  if (rec.side !== 'esquerda') return { ok: false, erro: 'A lista de espera é da Assembleia.' };
  if (rec.home?.espera) return { ok: false, erro: `Você já está na lista: faltam ${rec.home.espera.ciclosRestantes} ciclos.` };
  const t = rec.home ? tipoMoradia(rec.home.tipo) : undefined;
  if (t && t.acesso !== 'provisoria') return { ok: false, erro: 'Você já tem casa. A Assembleia viu.' };
  if (!rec.home) instalar(rec, novaCasa(L.moradiaProvisoria));
  rec.home!.espera = { ciclosRestantes: L.ciclosBase, final: L.moradiaFinal };
  return { ok: true, ciclos: L.ciclosBase };
}

/** Anda a fila `ciclos` vezes (atalho de teste: sem número, sai a casa na hora). */
export function avancarListaDeEspera(rec: PlayerRecord, ciclos = Number.POSITIVE_INFINITY): string[] {
  const esp = rec.home?.espera;
  if (!esp) return [];
  esp.ciclosRestantes = Math.max(0, esp.ciclosRestantes - ciclos);
  if (esp.ciclosRestantes > 0) return [`Lista de espera: faltam ${esp.ciclosRestantes} ciclos.`];
  return mudarCasa(rec, esp.final);
}

/** Ajudou no mutirão de outro jogador: a própria espera anda. */
export function ajudouNoMutirao(rec: PlayerRecord): string[] {
  return avancarListaDeEspera(rec, getData().housing.listaDeEspera.mutiraoReduzCiclos);
}

/** Quem puxou o Mutirão da Casa Própria recebe a casa de mutirão (desbloqueio 'casa_propria'). */
export function receberCasaDeMutirao(rec: PlayerRecord): string[] {
  const t = getData().housing.tipos.find((x) => x.acesso === 'mutirao' && !x.foraDoPiloto);
  if (!t || rec.side !== 'esquerda' || rec.home?.tipo === t.id) return [];
  return mudarCasa(rec, t.id);
}

// ---------------------------------------------------------------------------
// Direita: aluguel e despejo

/** Aluguel do ciclo (housing.json aluguel.formula). */
export function valorAluguel(tipo: string, precoDeVida?: number): number {
  const A = getData().housing.aluguel;
  const t = tipoMoradia(tipo);
  if (!t?.aluguel) return 0;
  const mult = Math.max(A.multMin, Math.min(A.multMax, (precoDeVida ?? A.precoDeVidaReferencia) / A.precoDeVidaReferencia));
  return Math.ceil(t.aluguel.porCiclo * mult);
}

/** Aluga uma cápsula (paga o primeiro ciclo). Exige estar sem dívida. */
export function alugarCapsula(rec: PlayerRecord, tipo = 'capsula', precoDeVida?: number): Check & { avisos?: string[] } {
  const t = tipoMoradia(tipo);
  if (rec.side !== 'direita') return { ok: false, erro: 'Cápsula é coisa do Consórcio.' };
  if (!t || t.acesso !== 'aluguel' || t.foraDoPiloto) return { ok: false, erro: 'Essa moradia não se aluga.' };
  if (!patenteAlcanca(rec, t.patenteMin)) return { ok: false, erro: 'Sua patente ainda não libera essa cápsula.' };
  if (rec.home?.tipo === tipo) return { ok: false, erro: 'Você já mora aí.' };
  if (economiaOf(rec).divida > 0) return { ok: false, erro: `Quite a dívida de ${economiaOf(rec).divida} Créditos antes.` };
  const v = valorAluguel(tipo, precoDeVida);
  const pg = pagar(rec, 'credito', v);
  if (!pg.ok) return pg;
  const av = mudarCasa(rec, tipo);
  rec.home!.aluguelUltimo = v;
  return { ok: true, avisos: av };
}

/** Despejo leve: móveis para o inventário, a casa some, score despenca. */
export function despejar(rec: PlayerRecord): string[] {
  if (!rec.home) return [];
  for (const m of rec.home.moveis) rec.inventory.push(movelInvId(m.id));
  rec.home = null;
  rec.home_id = null;
  scoreEvento(rec, 'despejo');
  const av = getData().housing.despejo.avisos;
  return [av[2] ?? 'Despejo.', 'Os móveis foram para o seu inventário.'];
}

/** Cobra o aluguel de um ciclo. */
export function cobrarAluguel(rec: PlayerRecord, precoDeVida?: number): string[] {
  const h = rec.home;
  const t = h ? tipoMoradia(h.tipo) : undefined;
  if (!h || !t || t.acesso !== 'aluguel') return [];
  const e = economiaOf(rec);
  const v = valorAluguel(h.tipo, precoDeVida);
  h.aluguelUltimo = v;
  e.divida += v;
  const pago = Math.min(e.divida, rec.credito);
  rec.credito -= pago;
  e.divida -= pago;
  if (e.divida === 0) {
    h.atraso = 0;
    scoreEvento(rec, 'aluguel_em_dia');
    return [`Aluguel de ${v} ${nomeMoeda('credito')} debitado. Obrigado por fazer parte!`];
  }
  h.atraso = (h.atraso ?? 0) + 1;
  scoreEvento(rec, 'atraso_aluguel');
  scoreEvento(rec, 'no_negativo');
  const D = getData().housing.despejo;
  if (h.atraso >= D.ciclosDeAtraso) return despejar(rec);
  return [D.avisos[h.atraso - 1] ?? `Aluguel atrasado: ${h.atraso} ciclos.`, `Dívida: ${e.divida} Créditos.`];
}

// ---------------------------------------------------------------------------
// visitas

export function definirVisitas(rec: PlayerRecord, p: PermissaoVisita): Check {
  if (!rec.home) return { ok: false, erro: 'Você não tem casa.' };
  if (!getData().housing.comum.visitas.permissoes.includes(p)) return { ok: false, erro: 'Permissão inválida.' };
  rec.home.visitas = p;
  return { ok: true };
}

export function convidar(rec: PlayerRecord, playerId: string, sim = true): Check {
  if (!rec.home) return { ok: false, erro: 'Você não tem casa.' };
  rec.home.convidados = rec.home.convidados.filter((x) => x !== playerId);
  if (sim) rec.home.convidados.push(playerId);
  return { ok: true };
}

export interface MovelView extends MovelColocado {
  name: string;
  w: number;
  h: number;
  parede: boolean;
  artKey: string;
  interacao: string;
}

export interface CasaView {
  dono: string;
  donoNome: string;
  tipo: string;
  name: string;
  side: string;
  w: number;
  h: number;
  moveis: MovelView[];
  moveisMax: number;
  descansoPct: number;
  visitas: PermissaoVisita;
  somenteLeitura: boolean;
  artKey: string;
  /** só para o dono */
  espera?: number | null;
  atraso?: number;
  aluguel?: number;
  /** móveis guardados no inventário (só para o dono) */
  guardados?: string[];
}

export function casaView(dono: PlayerRecord, somenteLeitura = false): CasaView | null {
  const h = dono.home;
  const t = h ? tipoMoradia(h.tipo) : undefined;
  if (!h || !t) return null;
  const D = getData();
  const cap = D.housing.comum.descanso.capPct;
  const moveis = h.moveis.map((m): MovelView => {
    const mv = D.furnitureById.get(m.id)!;
    const p = pegada(mv, m.rot);
    return { ...m, name: mv.name, w: p.w, h: p.h, parede: mv.parede === true, artKey: mv.artKey, interacao: mv.interacao };
  });
  const descanso = Math.min(cap, t.descansoPct + h.moveis.reduce((s, m) => s + (D.furnitureById.get(m.id)?.descansoPct ?? 0), 0));
  return {
    dono: dono.id,
    donoNome: dono.name,
    tipo: t.id,
    name: t.name,
    side: t.side,
    w: t.tamanho.w,
    h: t.tamanho.h,
    moveis,
    moveisMax: t.moveisMax,
    descansoPct: descanso,
    visitas: h.visitas,
    somenteLeitura,
    artKey: t.artKey,
    ...(somenteLeitura
      ? {}
      : {
          espera: h.espera?.ciclosRestantes ?? null,
          atraso: h.atraso ?? 0,
          ...(t.aluguel ? { aluguel: h.aluguelUltimo ?? t.aluguel.porCiclo } : {}),
          guardados: dono.inventory.filter((x) => x.startsWith('movel:')).map((x) => x.slice(6)),
        }),
  };
}

/** Visitar a casa de outro jogador (só leitura), conforme a permissão do dono. */
export function visitarCasa(dono: PlayerRecord, visitante: PlayerRecord, ctx: { mesmoGrupo?: boolean } = {}): Check & { casa?: CasaView } {
  if (!dono.home) return { ok: false, erro: `${dono.name} não tem casa.` };
  if (dono.id === visitante.id) return { ok: true, casa: casaView(dono, false)! };
  const h = dono.home;
  const convidado = h.convidados.includes(visitante.id);
  const outraMargem = dono.side !== null && visitante.side !== null && dono.side !== visitante.side;
  let pode = convidado;
  if (!pode && !outraMargem) {
    if (h.visitas === 'todos' || h.visitas === 'margem') pode = true;
    else if (h.visitas === 'grupo') pode = ctx.mesmoGrupo === true;
  }
  if (!pode) return { ok: false, erro: outraMargem ? 'Da outra margem, só a convite.' : 'A porta está trancada para você.' };
  return { ok: true, casa: casaView(dono, true)! };
}
