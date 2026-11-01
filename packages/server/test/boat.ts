/**
 * Ajudantes dos testes da travessia de barco (não é arquivo de teste): embarcar no Delta, entrar na
 * sala do barco pelo Store, viajar até a ponte e fazer a aula lutando com os botões.
 */
import { GAME_MSG } from '@pqp/shared/net';
import { fightBrain } from '../src/bot/robot';
import type { Store } from '../src/persistence/store';
import { Harness, type Bot } from './harness';

/** Deixa as promessas (a gravação antes do trocar_sala) andarem. */
export const nextTask = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** No Delta: fala com o Seu Jacó e escolhe "Embarcar". Devolve a sala do barco do trocar_sala. */
export async function embark(h: Harness, bot: Bot): Promise<string | undefined> {
  h.game(bot, GAME_MSG.falar, { npcId: 'seu_jaco' });
  h.game(bot, GAME_MSG.dialogoOpcao, { npcId: 'seu_jaco', opcao: 'travessia' });
  await nextTask();
  h.tick(1);
  const t = bot.robot.trocarSala;
  return t?.motivo === 'travessia' ? t.mapId : undefined;
}

/** Abre a sala do barco (como o WorldRoom) e conecta o robô pelo Store. */
export async function boardRoom(roomId: string, store: Store, token: string, seed = 400, offlineAutoMs?: number): Promise<{ h: Harness; bot: Bot }> {
  const h = new Harness({ mapId: roomId, store, ...(offlineAutoMs !== undefined ? { offlineAutoMs } : {}) });
  const bot = await h.connectAsync({ token, seed });
  return { h, bot };
}

/** Viaja até a ponte (a escolha abre). Devolve os ticks, ou -1. */
export function sailToBridge(h: Harness, bot: Bot, maxTicks = 600): number {
  return h.runUntil(() => bot.robot.barco?.fase === 'escolha', maxTicks);
}

/**
 * Aula: luta com o alvo automático e os botões (o robô aperta 1, 2, 3 e o Especial quando brilha)
 * até o barco chegar e o personagem sair da sala. Atalho de teste: a vida do jogador não cai.
 */
export async function doAula(h: Harness, bot: Bot, maxTicks = 2400): Promise<number> {
  const brain = fightBrain();
  bot.brain = (r) => {
    const e = h.core.entityOf(bot.sid);
    if (e && !e.dead && e.downedUntil === undefined) e.hp = e.stats.hpMax;
    brain(r);
  };
  const took = h.runUntil(() => h.core.entityOf(bot.sid) === undefined, maxTicks);
  bot.brain = undefined;
  bot.robot.setStick(0, 0);
  await nextTask();
  h.tick(1);
  return took;
}
