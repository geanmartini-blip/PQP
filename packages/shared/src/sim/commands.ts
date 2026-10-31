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
import { bal, INTERACT_RADIUS, JOYSTICK_DEADZONE } from './constants';
import { getEnt, isUp } from './entity';
import { dist } from './geom';
import { setArchetype } from './spawn';
import { retargetTap } from './targeting';
import type { CommandContext, Entity, PlayerCommand, PlayerInput, World } from './types';
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
      if (!getData().archetypesById.has(cmd.archetypeId)) return false;
      setArchetype(w, e, cmd.archetypeId);
      return true;
    case 'doutrina':
      e.doctrine = cmd.cards.slice(0, bal().combate.doutrinaCartasMax);
      return true;
  }
}

/**
 * Conversa com um NPC (neutro ou companheiro). No protótipo, falar com o Wesley vira Peão Brabo e
 * falar com o Li Wei vira Idol (qualquer treinador troca para a ala dele). Solta um 'say' com uma
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
    if (arch && e.kind === 'player' && e.archetypeId !== arch) setArchetype(w, e, arch);
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
