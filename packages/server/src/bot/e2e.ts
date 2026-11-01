/**
 * Cenário ponta a ponta com um robô de verdade (@colyseus/sdk, WebSocket do Node 24) contra um
 * servidor rodando. Faz o que o cliente faz:
 * - uma entrada do joystick por tick fixo de 50 ms (acumulador, não setInterval(50), que no Windows
 *   roda perto de 16 Hz), com as 3 últimas entradas e os comandos sem ack;
 * - ping a cada 1 s (RTT informado ao servidor) e 'need' para entidades sem defId;
 * - auto-caminho (ir_ate) como o toque no chão, e luta só com o alvo automático e os botões.
 *
 * Passos conferidos:
 *  0. Fase 2: cadastro de um jogador novo (perfil criado=false → criar_personagem → welcome no Delta);
 *     o combate abaixo roda na sala do protótipo (sandbox, template Peão Brabo com os botões);
 *  1. welcome e snapshots a ~20 por segundo (com a perda simulada, um pouco menos);
 *  2. anda até o bando mais perto do spawn (auto-caminho) e o servidor trava um alvo;
 *  3. mata um inimigo apertando os botões (cast de habilidade dos botões + morte do inimigo);
 *  4. vai até a arena e o chefe solta um aviso no chão (tel com o chefe como fonte, >= 0,8 s).
 *
 * Usado por test/e2e.test.ts (servidor no mesmo processo) e por e2e-run.ts (npm run e2e: servidor
 * em outro processo, com PQP_LAG_MS e PQP_LOSS no ambiente).
 */
import { Client, type Room } from '@colyseus/sdk';
import { getMap } from '@pqp/shared/map';
import { GAME_MSG, MSG, SALA_MUNDO, type S2C_Info, type S2C_Pong, type S2C_Snapshot, type S2C_Welcome, type EntSnap } from '@pqp/shared/net';
import { defaultAppearance } from '@pqp/shared/game/appearance';
import { TICK_MS, type Telegraph } from '@pqp/shared/sim';
import { fightBrain, RobotClient } from './robot';

export interface E2EStep {
  name: string;
  ok: boolean;
  /** ms desde o começo do cenário */
  atMs: number;
  info: string;
}

export interface E2EReport {
  ok: boolean;
  steps: E2EStep[];
  durationMs: number;
  snapsPerS: number;
  inputsPerS: number;
  rttMs: number;
  snapsReceived: number;
  /** maior intervalo entre dois snapshots aceitos (ms) */
  maxGapMs: number;
}

export interface E2EOptions {
  /** endpoint http(s) do Colyseus, ex.: http://127.0.0.1:2567 */
  url: string;
  archetypeId?: string;
  log?: (m: string) => void;
  /** tempo máximo de cada passo (ms) */
  stepTimeoutMs?: number;
  /** pula o passo do chefe */
  skipBoss?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const FL_CHEFE = 512;

/** Sala do protótipo (sandbox): o template da Fase 1 com os botões, para o combate. */
const SANDBOX_MAP = 'prototipo_delta';

/**
 * Cadastro de um jogador novo pela rede, como o cliente faz: entra sem mapId, segue 'trocar_sala'
 * se vier, recebe 'perfil' com criado=false, manda 'criar_personagem' e espera o welcome e o
 * próprio personagem no snapshot (com o visual em lk).
 */
async function createCharacterStep(client: Client, token: string, timeoutMs: number): Promise<{ ok: boolean; info: string }> {
  const t0 = performance.now();
  let mapId: string | undefined;
  for (let hop = 0; hop < 3; hop++) {
    const r = new RobotClient(token, 'Robô E2E');
    const room: Room = mapId ? await client.joinOrCreate(SALA_MUNDO, { mapId }) : await client.joinOrCreate(SALA_MUNDO);
    for (const t of [MSG.welcome, ...Object.values(GAME_MSG)]) room.onMessage(t, (m: unknown) => r.onGame(t, m));
    room.onMessage(MSG.snap, (s: S2C_Snapshot) => {
      const need = r.onSnapshot(s);
      if (need.length > 0) room.send(MSG.need, { ids: need });
    });
    room.onMessage(MSG.info, (info: S2C_Info) => r.onInfo(info));
    room.onMessage(MSG.pong, () => undefined);
    room.send(MSG.hello, r.hello());
    const until = async (cond: () => boolean) => {
      while (!cond()) {
        if (performance.now() - t0 > timeoutMs) return false;
        await sleep(20);
      }
      return true;
    };
    try {
      if (!(await until(() => r.perfil !== undefined || r.trocarSala !== undefined || r.you !== undefined))) return { ok: false, info: 'sem perfil, welcome ou trocar_sala' };
      if (r.trocarSala) {
        mapId = r.trocarSala.mapId;
        continue;
      }
      if (r.perfil?.criado === false) {
        room.send(GAME_MSG.criarPersonagem, { name: 'Robo de Teste', appearance: defaultAppearance() });
      }
      const ok = await until(() => r.you !== undefined && r.me()?.lk !== undefined && r.perfil?.criado === true);
      const lk = r.me()?.lk as { outfit?: { tier?: string } } | undefined;
      return {
        ok: ok && r.welcome?.mapId === 'delta',
        info: `mapa ${r.welcome?.mapId ?? '-'}, perfil ${r.perfil?.name ?? '-'} (criado ${r.perfil?.criado}), traje ${lk?.outfit?.tier ?? '-'}, missão ${r.missao?.ativas[0]?.id ?? '-'}`,
      };
    } finally {
      await room.leave(true).catch(() => undefined);
    }
  }
  return { ok: false, info: 'trocar_sala em laço' };
}

export async function runE2E(opts: E2EOptions): Promise<E2EReport> {
  const log = opts.log ?? (() => undefined);
  const stepTimeout = opts.stepTimeoutMs ?? 45_000;
  const t0 = performance.now();
  const at = () => Math.round(performance.now() - t0);
  const steps: E2EStep[] = [];
  const mark = (name: string, ok: boolean, info: string) => {
    steps.push({ name, ok, atMs: at(), info });
    log(`${ok ? 'OK  ' : 'FALHOU'} ${name}: ${info} (${at()} ms)`);
  };

  // token novo a cada rodada (fora da simulação, Date é permitido)
  const token = `e2e-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const client = new Client(opts.url);

  // 0. Fase 2: cria o personagem como um jogador novo (sala sem mapId → Delta → perfil → cadastro)
  const created = await createCharacterStep(client, token, Math.min(stepTimeout, 20_000));
  mark('criar personagem', created.ok, created.info);

  // o combate do protótipo roda na sala sandbox (template Peão Brabo, com os botões)
  const robot = new RobotClient(token, 'Robô E2E', opts.archetypeId ?? 'peao_brabo');
  const room: Room = await client.joinOrCreate(SALA_MUNDO, { mapId: SANDBOX_MAP });

  // ---- estado observado
  const kindOf = new Map<number, EntSnap['k']>();
  const lastHp = new Map<number, number>();
  const myCasts: string[] = [];
  const hitByButtons = new Set<number>();
  const enemyDeaths: number[] = [];
  const goneAfterHit: number[] = [];
  let bossTel: Telegraph | undefined;
  let lastSnapAt = 0;
  let maxGap = 0;
  let firstSnapAt = 0;
  let inputsSent = 0;

  room.onMessage(MSG.welcome, (w: S2C_Welcome) => robot.onWelcome(w));
  room.onMessage(MSG.info, (info: S2C_Info) => robot.onInfo(info));
  room.onMessage(MSG.pong, (p: S2C_Pong) => {
    robot.rtt = performance.now() - p.t;
  });
  room.onMessage(MSG.snap, (s: S2C_Snapshot) => {
    const before = robot.snapsReceived;
    const need = robot.onSnapshot(s);
    if (robot.snapsReceived === before) return; // velho, fora de ordem
    const now = performance.now();
    if (lastSnapAt > 0) maxGap = Math.max(maxGap, now - lastSnapAt);
    else firstSnapAt = now;
    lastSnapAt = now;
    if (need.length > 0) room.send(MSG.need, { ids: need });
    const buttons = new Set(s.hud.ab.slice(0, 4).filter((x): x is string => !!x));
    for (const e of s.ents) {
      kindOf.set(e.i, e.k);
      lastHp.set(e.i, e.h);
    }
    for (const id of s.gone ?? []) if (hitByButtons.has(id) && (lastHp.get(id) ?? 1000) <= 400) goneAfterHit.push(id);
    for (const ev of s.ev) {
      if (ev.t === 'cast' && ev.src === robot.you && buttons.has(ev.ability)) myCasts.push(ev.ability);
      if (ev.t === 'hit' && ev.src === robot.you && ev.ability && buttons.has(ev.ability) && kindOf.get(ev.dst) === 'e') hitByButtons.add(ev.dst);
      if (ev.t === 'death' && kindOf.get(ev.dst) === 'e') enemyDeaths.push(ev.dst);
      if (ev.t === 'telegraph' && isBoss(ev.tel.sourceId)) bossTel ??= ev.tel;
    }
    for (const t of s.tel) if (isBoss(t.sourceId)) bossTel ??= t;
  });
  const isBoss = (id: number) => {
    const e = robot.ents.get(id);
    return !!e && ((e.fl & FL_CHEFE) !== 0 || e.d === 'bruno_ferro_chefe');
  };

  // ---- laço de entrada: tick fixo de 50 ms com acumulador
  let brain: (() => void) | undefined;
  let acc = 0;
  let lastLoop = performance.now();
  let lastPing = -Infinity;
  const loop = setInterval(() => {
    const now = performance.now();
    acc += now - lastLoop;
    lastLoop = now;
    if (acc > TICK_MS * 4) acc = TICK_MS * 4; // engasgou: não corre atrás
    while (acc >= TICK_MS) {
      acc -= TICK_MS;
      if (robot.you === undefined) continue;
      brain?.();
      room.send(MSG.input, robot.makeInput());
      inputsSent++;
    }
    if (now - lastPing >= 1000) {
      lastPing = now;
      room.send(MSG.ping, { t: now });
    }
  }, 5);

  const waitFor = async (cond: () => boolean, ms = stepTimeout): Promise<boolean> => {
    const start = performance.now();
    while (!cond()) {
      if (performance.now() - start > ms) return false;
      await sleep(20);
    }
    return true;
  };

  const fight = fightBrain(1.2);
  const dist = (a?: { x: number; y: number }, b?: { x: number; y: number }) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity);
  const targetEnemy = () => {
    const id = robot.hud?.target;
    return id !== undefined && robot.ents.get(id)?.k === 'e' ? id : undefined;
  };

  /** Vai até (x, y) pelo auto-caminho; luta com quem o alvo automático travar no caminho. */
  const travel = (x: number, y: number, fightNear = 5) => {
    let lastGo = -100;
    // preso brigando com um alvo do outro lado da água (o joystick vai reto): depois de 3 s sem
    // sair do lugar, ignora a briga por 3 s e volta ao auto-caminho
    let anchor = { x: 0, y: 0, t: -1 };
    let ignoreUntil = -1;
    return () => {
      const me = robot.pos(robot.you);
      const tgt = targetEnemy();
      if (tgt !== undefined && dist(me, robot.pos(tgt)) <= fightNear && robot.lastTick >= ignoreUntil) {
        if (me && (anchor.t < 0 || dist(me, anchor) > 0.5)) anchor = { x: me.x, y: me.y, t: robot.lastTick };
        else if (robot.lastTick - anchor.t > 60 && (robot.hud?.hp ?? 0) >= (robot.hud?.hpMax ?? 1)) {
          ignoreUntil = robot.lastTick + 60;
          anchor = { x: 0, y: 0, t: -1 };
        }
        fight(robot);
        lastGo = -100;
        return;
      }
      robot.setStick(0, 0);
      // (re)manda o ir_ate quando não há um pendente e já faz 2 s (a luta cancela o caminho)
      if (!robot.hasPending('ir_ate') && robot.lastTick - lastGo >= 40 && dist(me, { x, y }) > 1.5) {
        robot.command({ c: 'ir_ate', x, y });
        lastGo = robot.lastTick;
      }
    };
  };

  let ok = true;
  try {
    // 1. welcome e taxa de snapshots
    robot.setStick(0, 0);
    room.send(MSG.hello, robot.hello());
    const welcomed = await waitFor(() => robot.you !== undefined && robot.me()?.d !== undefined, 10_000);
    if (!welcomed) {
      mark('entrar', false, 'sem welcome ou sem o próprio personagem no snapshot em 10 s');
      ok = false;
      throw new Error('stop');
    }
    mark('entrar', true, `welcome: entidade ${robot.you}, mapa ${robot.welcome?.mapId}, ala ${robot.hud?.arch}, nível ${robot.hud?.level}`);
    const n0 = robot.snapsReceived;
    const w0 = performance.now();
    await sleep(3000);
    const rate = ((robot.snapsReceived - n0) * 1000) / (performance.now() - w0);
    const rateOk = rate >= 16 && rate <= 22;
    mark('snapshots ~20/s', rateOk, `${rate.toFixed(1)} snapshots/s em 3 s, RTT ${Math.round(robot.rtt)} ms, maior intervalo ${Math.round(maxGap)} ms`);
    ok &&= rateOk;

    // 2. anda até o bando mais perto do spawn
    const map = getMap(robot.welcome!.mapId);
    const me0 = robot.pos(robot.you)!;
    const bands = map.markers.filter((m) => m.kind === 'bando').sort((a, b) => dist(me0, a) - dist(me0, b));
    const band = bands[0];
    if (!band) throw new Error('mapa sem bando');
    brain = travel(band.x, band.y, 4);
    const reached = await waitFor(() => targetEnemy() !== undefined && dist(robot.pos(robot.you), band) <= 7);
    const meB = robot.pos(robot.you);
    mark(
      'andar até um bando',
      reached,
      `${band.id} em (${band.x.toFixed(1)}, ${band.y.toFixed(1)}); robô saiu de (${me0.x.toFixed(1)}, ${me0.y.toFixed(1)}) e está a ${dist(meB, band).toFixed(1)} tiles, alvo ${robot.hud?.target ?? '-'} (${robot.ents.get(robot.hud?.target ?? -1)?.d ?? '-'})`,
    );
    ok &&= reached;

    // 3. mata um inimigo com os botões
    brain = travel(band.x, band.y, 8);
    const killed = await waitFor(() => myCasts.length > 0 && hitByButtons.size > 0 && (enemyDeaths.some((id) => hitByButtons.has(id)) || goneAfterHit.length > 0 || enemyDeaths.length > 0));
    mark(
      'matar um inimigo com os botões',
      killed,
      `${myCasts.length} habilidades dos botões (${[...new Set(myCasts)].join(', ') || '-'}), ${hitByButtons.size} inimigos acertados por elas, ${enemyDeaths.length} mortes de inimigo vistas, nível ${robot.hud?.level}, vida ${robot.hud?.hp}/${robot.hud?.hpMax}`,
    );
    ok &&= killed;

    // 4. o chefe e o aviso no chão
    if (!opts.skipBoss) {
      const bm = map.markers.find((m) => m.kind === 'chefe');
      if (!bm) throw new Error('mapa sem chefe');
      // chega pela frente da clareira (3 tiles ao sul do marcador) e luta quando o chefe vira o alvo
      brain = travel(bm.x, bm.y + 3, 6);
      const telSeen = await waitFor(() => bossTel !== undefined, stepTimeout * 2);
      const tel = bossTel;
      const warnMs = tel ? (tel.impactTick - tel.startTick) * TICK_MS : 0;
      const telOk = telSeen && warnMs >= 800;
      mark(
        'chefe solta aviso no chão',
        telOk,
        tel
          ? `${tel.abilityId} (${tel.shape}, raio ${tel.radius}) em (${tel.x}, ${tel.y}), aviso de ${warnMs} ms; robô nível ${robot.hud?.level}, vida ${robot.hud?.hp}/${robot.hud?.hpMax}`
          : `nenhum aviso do chefe; robô em (${robot.pos(robot.you)?.x.toFixed(1)}, ${robot.pos(robot.you)?.y.toFixed(1)}), vida ${robot.hud?.hp}/${robot.hud?.hpMax}`,
      );
      ok &&= telOk;
    }
  } catch (err) {
    if (!(err instanceof Error && err.message === 'stop')) {
      mark('erro', false, String(err));
      ok = false;
    }
  } finally {
    brain = undefined;
    clearInterval(loop);
    await room.leave(true).catch(() => undefined);
  }

  const durMs = performance.now() - t0;
  const span = lastSnapAt > firstSnapAt ? lastSnapAt - firstSnapAt : 1;
  return {
    ok: ok && steps.every((s) => s.ok),
    steps,
    durationMs: Math.round(durMs),
    snapsPerS: Math.round(((robot.snapsReceived - 1) * 10000) / span) / 10,
    inputsPerS: Math.round((inputsSent * 10000) / durMs) / 10,
    rttMs: Math.round(robot.rtt),
    snapsReceived: robot.snapsReceived,
    maxGapMs: Math.round(maxGap),
  };
}
