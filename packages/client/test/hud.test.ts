/** Regras puras do HUD e do desenho: recarga prevista, trava de saída, boneco que renasce, ?dpr=. */
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config';
import { FL } from '../src/game/clientWorld';
import { LOCAL_LOCK_SLACK_MS, LocalCooldowns } from '../src/game/localCooldowns';
import { shouldRevive } from '../src/render/viewRules';
import { EXIT_CONFIRM_MS, EXIT_TEXT, ExitGuard } from '../src/ui/exitGuard';

describe('LocalCooldowns (recarga prevista no cliente)', () => {
  const idle = { cd: [0, 0, 0, 0, 0], gcd: 0 };

  it('depois do toque o botão fica travado até o HUD confirmar a recarga', () => {
    const c = new LocalCooldowns();
    c.onCast(0, 1000, 1000, 200, 7);
    // o HUD ainda é o de antes do toque (um RTT atrás): travado
    c.sync(idle, 6, 1050);
    expect(c.blocked(0, 1050)).toBe(true);
    // a recarga global trava os outros botões também
    expect(c.blocked(1, 1050)).toBe(true);
    expect(c.gcdTicks(1050)).toBe(19);
    // o servidor confirmou: o botão segue a recarga do servidor, a global local continua até 1 s
    c.sync({ cd: [120, 0, 0, 0, 0], gcd: 18 }, 7, 1250);
    expect(c.blocked(1, 1250)).toBe(true);
    expect(c.blocked(1, 2001)).toBe(false);
  });

  it('o servidor recusou (processou o comando sem recarga nenhuma): destrava na hora', () => {
    const c = new LocalCooldowns();
    c.onCast(2, 1000, 1000, 200, 9);
    c.sync(idle, 9, 1220);
    expect(c.blocked(2, 1220)).toBe(false);
    expect(c.blocked(0, 1220)).toBe(false);
    expect(c.gcdTicks(1220)).toBe(0);
  });

  it('sem resposta, a trava do botão não passa de RTT + folga', () => {
    const c = new LocalCooldowns();
    c.onCast(1, 0, 0, 300);
    expect(c.blocked(1, 300 + LOCAL_LOCK_SLACK_MS - 1)).toBe(true);
    c.sync(idle, 0, 300 + LOCAL_LOCK_SLACK_MS);
    expect(c.blocked(1, 300 + LOCAL_LOCK_SLACK_MS)).toBe(false);
  });
});

describe('ExitGuard (voltar do Android)', () => {
  const fake = () => {
    const calls: string[] = [];
    const warns: string[] = [];
    const g = new ExitGuard({ pushState: () => void calls.push('push'), back: () => void calls.push('back') }, (t) => void warns.push(t));
    return { g, calls, warns };
  };

  it('o primeiro voltar é engolido e avisa; o segundo logo depois sai', () => {
    const { g, calls, warns } = fake();
    g.arm();
    g.arm();
    expect(calls).toEqual(['push']);
    expect(g.onPop(1000)).toBe(false);
    expect(warns).toEqual([EXIT_TEXT]);
    expect(calls).toEqual(['push', 'push']);
    expect(g.onPop(1000 + EXIT_CONFIRM_MS - 1)).toBe(true);
    expect(calls).toEqual(['push', 'push', 'back']);
  });

  it('voltar muito depois do aviso pede de novo', () => {
    const { g, warns } = fake();
    g.arm();
    expect(g.onPop(0)).toBe(false);
    expect(g.onPop(EXIT_CONFIRM_MS + 10)).toBe(false);
    expect(warns.length).toBe(2);
  });

  it('sem armar (antes de entrar no mundo) não segura nada', () => {
    const { g, calls } = fake();
    expect(g.onPop(0)).toBe(true);
    expect(calls).toEqual([]);
  });
});

describe('shouldRevive', () => {
  it("jogador de pé depois de um 'death' (voltou ao QG) volta a aparecer", () => {
    expect(shouldRevive('p', 1000, 0, true)).toBe(true);
    expect(shouldRevive('p', 1000, FL.movendo, true)).toBe(true);
    // ainda caído, sem vida, ou nem morreu: não
    expect(shouldRevive('p', 1000, FL.caido, true)).toBe(false);
    expect(shouldRevive('p', 0, 0, true)).toBe(false);
    expect(shouldRevive('p', 1000, 0, false)).toBe(false);
    // inimigo morto não volta (some do snapshot)
    expect(shouldRevive('e', 1000, 0, true)).toBe(false);
    expect(shouldRevive('l', 1000, 0, true)).toBe(false);
  });
});

describe('?dpr=', () => {
  const loc = { protocol: 'http:', hostname: 'localhost', host: 'localhost:5173', port: '5173' };
  it('lê a densidade pedida, entre 1 e 4', () => {
    expect(parseConfig('?dpr=2', loc).dpr).toBe(2);
    expect(parseConfig('?dpr=9', loc).dpr).toBe(4);
    expect(parseConfig('?dpr=0', loc).dpr).toBe(1);
    expect(parseConfig('?dpr=abc', loc).dpr).toBeUndefined();
    expect(parseConfig('', loc).dpr).toBeUndefined();
  });
});
