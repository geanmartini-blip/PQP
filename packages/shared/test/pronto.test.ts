/**
 * Critério de pronto "toda habilidade acerta sem mira manual": cada um dos 24 arquétipos usa os
 * botões 1, 2 e 3 (com as 4 habilidades da classe no 3) e o Especial sem alvo escolhido, sem ponto
 * e sem direção. A habilidade tem que sair e fazer efeito (dano, status, cura, escudo, campo ou
 * invocação, empurrão ou puxão) em até 5 s, contando o tempo de andar até o alcance. Antes do uso
 * roda um tick, como no jogo: quem escolhe o alvo é o alvo automático, ninguém toca.
 */
import { describe, expect, it } from 'vitest';
import { getData } from '../src/data';
import { castAbility, createWorld, spawnEnemy, spawnPlayer, step, type CombatEvent } from '../src/sim';
import { arena } from '../src/sim/testkit';

function tryAbility(archetypeId: string, slot3: string, button: 'b1' | 'b2' | 'b3' | 'especial' | 'nada'): { id: string; cast: boolean; effect: boolean } {
  const w = createWorld(arena(), 7);
  const p = spawnPlayer(w, { name: 'Teste', archetypeId, x: 10, y: 15, slot3 });
  // aliado perto, para as habilidades em aliado; e um aliado ferido, para as curas
  const amigo = spawnPlayer(w, { name: 'Amigo', archetypeId: 'peao_brabo', x: 9, y: 16 });
  amigo.hp = amigo.stats.hpMax * 0.5;
  p.hp = p.stats.hpMax * 0.6;
  const foe = spawnEnemy(w, 'capanga_do_capataz', 11.6, 15); // perto: as "em volta" saem em volta de quem lança
  foe.hp = foe.stats.hpMax = 50000;
  // boneco de treino: o inimigo não anda nem ataca, para todo efeito na cena vir de quem testa
  // (sem freeze: imóvel não pode ser empurrado, e empurrar é efeito)
  foe.stats.moveSpeed = 0;
  foe.ai = { ...foe.ai!, abilities: [] };
  foe.nextBasicTick = Number.MAX_SAFE_INTEGER;
  amigo.nextBasicTick = Number.MAX_SAFE_INTEGER;
  const id = button === 'nada' ? '' : p.loadout![button];
  if (button === 'especial') p.special = 1;
  p.gcdUntil = 0;
  // só a habilidade: sem ataque básico nem regeneração mexendo nos eventos
  p.nextBasicTick = Number.MAX_SAFE_INTEGER;
  // um tick, como no jogo: o alvo automático escolhe o inimigo à vista (ninguém toca em nada)
  step(w);
  p.gcdUntil = 0;
  const entitiesBefore = w.entities.size;
  const foeAt = { x: foe.x, y: foe.y };
  const amigoAt = { x: amigo.x, y: amigo.y };
  let maxZones = 0;
  const evs: CombatEvent[] = [];
  let cast = button === 'nada' ? false : castAbility(w, p, id);
  evs.push(...w.events);
  for (let i = 0; i < 100; i++) {
    maxZones = Math.max(maxZones, w.zones.length);
    step(w);
    evs.push(...w.events);
    if (!cast && evs.some((e) => e.t === 'cast' && e.src === p.id)) cast = true;
  }
  if (evs.some((e) => e.t === 'cast' && e.src === p.id)) cast = true;
  const effect =
    evs.some((e) => (e.t === 'hit' && e.src === p.id && e.ability !== undefined) || e.t === 'status' || e.t === 'heal' || e.t === 'shield' || e.t === 'cc_slow') ||
    w.entities.size > entitiesBefore ||
    maxZones > 0 ||
    Math.hypot(foe.x - foeAt.x, foe.y - foeAt.y) > 0.5 || // empurrar e puxar
    Math.hypot(amigo.x - amigoAt.x, amigo.y - amigoAt.y) > 0.5;
  return { id, cast, effect };
}

describe('critério de pronto: toda habilidade acerta sem mira manual', () => {
  const d = getData();
  it('controle: sem usar nada, a mesma cena não tem efeito (o teste abaixo não passa à toa)', () => {
    for (const a of d.archetypes) {
      const r = tryAbility(a.id, d.classesById.get(a.classe)!.abilities[0]!, 'nada');
      expect(r.cast, a.id).toBe(false);
      expect(r.effect, a.id).toBe(false);
    }
  });

  for (const a of d.archetypes) {
    it(`${a.id}: botões 1, 2, as 4 da classe no 3 e o Especial saem sem mira e fazem efeito`, () => {
      const cls = d.classesById.get(a.classe)!;
      const falhas: string[] = [];
      const casos: [string, 'b1' | 'b2' | 'b3' | 'especial'][] = [
        [cls.abilities[0]!, 'b1'],
        [cls.abilities[0]!, 'b2'],
        ...cls.abilities.map((s): [string, 'b3'] => [s, 'b3']),
        [cls.abilities[0]!, 'especial'],
      ];
      for (const [slot3, b] of casos) {
        const r = tryAbility(a.id, slot3, b);
        if (!r.cast || !r.effect) falhas.push(`${b}=${r.id} (saiu: ${r.cast}, efeito: ${r.effect})`);
      }
      expect(falhas).toEqual([]);
    });
  }
});
