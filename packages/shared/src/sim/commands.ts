/**
 * Entradas do jogador: joystick (todo tick) e comandos discretos.
 *
 * DEDUPLICAÇÃO: applyCommand NÃO deduplica por cmd.id. O cliente reenvia cada comando até o
 * servidor confirmar (S2C_Snapshot.cack), então o servidor precisa guardar o maior id processado
 * por jogador e só chamar applyCommand para ids novos. Aplicar o mesmo comando duas vezes aqui
 * repete o pedido: na maioria dos casos o segundo é recusado sozinho (recarga global, recarga,
 * custo, Especial já gasto, consumível) ou não muda nada (alvo, ir_ate, auto, doutrina), mas
 * não há garantia geral (ex.: 'item' depois que a recarga do item passou).
 */
import { getData } from '../data';
import { dequantizeAxis } from '../net/protocol';
import { castAbility } from './abilities';
import { bal, INTERACT_RADIUS, JOYSTICK_DEADZONE, TRAINER_SWITCH_RADIUS } from './constants';
import { getEnt, isUp } from './entity';
import { dist } from './geom';
import { setArchetype } from './spawn';
import { retargetTap } from './targeting';
import { msToTicks, type CommandContext, type Entity, type PlayerCommand, type PlayerInput, type World } from './types';
import { emit } from './world';

/** Joystick dequantizado vira moveIntent. Joystick fora da zona morta cancela ir_ate e o caminho. */
export function applyInput(_w: World, e: Entity, input: PlayerInput): void {
  const x = dequantizeAxis(input.mx), y = dequantizeAxis(input.my);
  e.moveIntent = { x, y };
  if (Math.hypot(x, y) >= JOYSTICK_DEADZONE) {
    e.moveTo = undefined;
    e.path = undefined;
  }
}

/** Treinador da ala que cada NPC ensina no protótipo (interagir troca de ala). */
const TRAINER_ARCHETYPE = (npcId: string): string | undefined => getData().trainersById.get(npcId)?.archetype;

/**
 * Comando discreto. Devolve true se teve efeito. Com ctx.rewindTicks (o servidor passa o atraso
 * do jogador em ticks, até 250 ms), habilidade e toque no alvo conferem a posição que ele via.
 */
export function applyCommand(w: World, e: Entity, cmd: PlayerCommand, ctx: CommandContext = {}): boolean {
  const rewind = Math.max(0, Math.min(ctx.rewindTicks ?? 0, Math.round(bal().combate.compensacaoMaxMs / 50)));
  switch (cmd.c) {
    case 'habilidade': {
      const L = e.loadout;
      if (!L) return false;
      const id = cmd.botao === 'especial' ? L.especial : cmd.botao === 1 ? L.b1 : cmd.botao === 2 ? L.b2 : L.b3;
      if (!id) return false;
      return castAbility(w, e, id, { ...(cmd.at ? { at: cmd.at } : {}), ...(rewind > 0 ? { rewindTicks: rewind } : {}) });
    }
    case 'alvo':
      return retargetTap(w, e, cmd.x, cmd.y, rewind) !== undefined;
    case 'item': {
      const L = e.loadout;
      if (!L?.item || (L.itemCount ?? 0) <= 0) return false;
      const c = getData().consumablesById.get(L.item);
      return c ? castAbility(w, e, c.habilidade) : false;
    }
    case 'ir_ate': {
      if (!isUp(e)) return false;
      e.moveIntent = { x: 0, y: 0 };
      e.moveTo = { x: cmd.x, y: cmd.y };
      e.path = undefined;
      if (w.pathfinder) {
        const p = w.pathfinder(w.map, { x: e.x, y: e.y }, { x: cmd.x, y: cmd.y }, e.radius);
        if (p && p.length > 0) e.path = p;
      }
      return true;
    }
    case 'auto':
      e.auto = cmd.on;
      return true;
    case 'interagir':
      return interact(w, e, cmd.entity);
    case 'trocar_arquetipo':
      if (!switchTrainer(w, e, cmd.archetypeId)) return false;
      if (e.archetypeId !== cmd.archetypeId) setArchetype(w, e, cmd.archetypeId);
      return true;
    case 'doutrina':
      e.doctrine = cmd.cards.slice(0, bal().combate.doutrinaCartasMax);
      return true;
    case 'filtro_saque':
      return setLootFilter(e, cmd.raridade, cmd.vendaAutomatica);
  }
}

/**
 * Fase 2: NPC que `e` alcança para conversar (mesmo raio do 'interagir'), por id de entidade ou,
 * sem id, o mais perto com esse id de dados (npcs.json/trainers.json). O servidor usa antes de
 * chamar game/dialog.ts talkTo.
 */
export function npcInReach(w: World, e: Entity, q: { entity?: number; npcId?: string }): Entity | undefined {
  if (!isUp(e)) return undefined;
  const ok = (n: Entity) => n.kind === 'npc' && !n.dead && n.id !== e.id && dist(e.x, e.y, n.x, n.y) <= INTERACT_RADIUS + n.radius + e.radius;
  if (q.entity !== undefined) {
    const n = getEnt(w, q.entity);
    return n && ok(n) && (q.npcId === undefined || n.defId === q.npcId) ? n : undefined;
  }
  let best: Entity | undefined;
  let bd = Infinity;
  for (const n of w.entities.values()) {
    if (n.defId !== q.npcId || !ok(n)) continue;
    const d = dist(e.x, e.y, n.x, n.y);
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}

/** Em combate: bateu ou apanhou há menos de regenForaDeCombate.aposMs (5 s). */
export function inCombat(w: World, e: Entity): boolean {
  return e.lastCombatTick !== undefined && w.tick - e.lastCombatTick < msToTicks(bal().combate.regenForaDeCombate.aposMs);
}

/**
 * Treinador que deixa `e` trocar para a ala `archetypeId` agora: um NPC treinador dessa ala a até
 * TRAINER_SWITCH_RADIUS (borda a borda), com `e` jogador, de pé e fora de combate. No protótipo,
 * Wesley ensina Peão Brabo e Li Wei ensina Idol; sem o treinador por perto, não troca.
 */
export function switchTrainer(w: World, e: Entity, archetypeId: string): Entity | undefined {
  if (e.kind !== 'player' || !isUp(e) || !getData().archetypesById.has(archetypeId) || inCombat(w, e)) return undefined;
  let best: Entity | undefined;
  let bd = Infinity;
  for (const n of w.entities.values()) {
    if (n.kind !== 'npc' || n.dead || TRAINER_ARCHETYPE(n.defId) !== archetypeId) continue;
    const d = dist(e.x, e.y, n.x, n.y) - n.radius - e.radius;
    if (d <= TRAINER_SWITCH_RADIUS && d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}

/** Filtro de raridade da coleta automática e venda automática (loot.json, coleta e vendaAutomatica). */
function setLootFilter(e: Entity, raridade: string, venda: boolean | undefined): boolean {
  const L = getData().loot;
  if (!(L.coleta.filtros as readonly string[]).includes(raridade)) return false;
  e.lootFilter = raridade as NonNullable<Entity['lootFilter']>;
  if (venda !== undefined) {
    if (!L.vendaAutomatica.opcional && venda !== L.vendaAutomatica.padraoLigada) return false;
    e.autoSell = venda;
  }
  return true;
}

/**
 * Conversa com um NPC (neutro ou companheiro). No protótipo, falar com o Wesley vira Peão Brabo e
 * falar com o Li Wei vira Idol (qualquer treinador troca para a ala dele), só fora de combate; em
 * combate o treinador só fala, sem trocar. Solta um 'say' com uma
 * fala de trainers.json (treino) ou npcs.json, trocando {nome} pelo nome do jogador.
 */
function interact(w: World, e: Entity, entityId: number): boolean {
  const npc = getEnt(w, entityId);
  if (!npc || npc.kind !== 'npc' || npc.id === e.id || !isUp(e)) return false;
  if (dist(e.x, e.y, npc.x, npc.y) > INTERACT_RADIUS + npc.radius + e.radius) return false;
  const D = getData();
  const tr = D.trainersById.get(npc.defId);
  const arch = TRAINER_ARCHETYPE(npc.defId);
  let lines: string[] = [];
  if (tr) {
    // troca de ala só fora de combate; em combate o treinador só fala. Fase 2: só quem já tem ala
    // troca (o protótipo de Wesley e Li Wei); no Delta e antes do 12 o treinador só conversa.
    if (arch && e.kind === 'player' && e.archetypeId && e.archetypeId !== arch && !inCombat(w, e)) setArchetype(w, e, arch);
    lines = tr.falas.treino.length > 0 ? tr.falas.treino : tr.falas.saudacao;
  } else {
    const n = D.npcsById.get(npc.defId);
    lines = n?.falas[0]?.linhas ?? [];
  }
  if (lines.length > 0) {
    const text = lines[w.rng.int(0, lines.length - 1)]!.replaceAll('{nome}', e.name);
    emit(w, { t: 'say', src: npc.id, text });
  }
  return true;
}
