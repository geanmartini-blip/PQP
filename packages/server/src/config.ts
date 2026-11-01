/**
 * Números do servidor que não estão nos docs. Tudo aqui é sugestão do protótipo da Fase 1 e pode
 * ser trocado pelos autores. Os números de combate continuam em balance.json.
 */

/** Porta padrão do servidor (express + Colyseus). */
export const DEFAULT_PORT = 2567;

/**
 * Mapa padrão do GameServerCore sem opção: o do protótipo (os testes de combate e de rede usam).
 * A sala do protótipo é a sandbox (SANDBOX_MAPS): personagem template, sem registro nem missões.
 */
export const DEFAULT_MAP_ID = 'prototipo_delta';

/** Mapas em modo sandbox (o template da Fase 1, que troca de ala com Wesley e Li Wei). */
export const SANDBOX_MAPS: readonly string[] = ['prototipo_delta'];

// ---- Fase 2 (regras de jogo no servidor). Tudo SUGESTÃO: os docs não dão esses números. ----

// SUGESTÃO: o jogador "chegou" num lugar a até 4 tiles do marcador e "saiu" depois de 5,5 tiles.
export const PLACE_RADIUS_TILES = 4;
export const PLACE_LEAVE_RADIUS_TILES = 5.5;

// SUGESTÃO: marcador com params.interagir (a fila do posto) conta a até 1,8 tile.
export const INTERACT_MARKER_RADIUS_TILES = 1.8;

// SUGESTÃO: a travessia sai com o Seu Jacó por perto ou a até 4 tiles da saída do cais.
export const TRAVESSIA_REACH_TILES = 4;

// SUGESTÃO: lugares, regiões e marcadores conferidos a cada 5 ticks (250 ms).
export const AREA_CHECK_TICKS = 5;

// SUGESTÃO: no objetivo "Seu Jacó caiu!", o Seu Jacó que acompanha cai de novo 15 s depois de levantar sozinho.
export const JACO_DOWN_COOLDOWN_MS = 15_000;

// SUGESTÃO: semente padrão do mundo (RNG da simulação).
export const DEFAULT_WORLD_SEED = 2077;

// SUGESTÃO: personagem template da Fase 1 começa como Peão Brabo (troca para Idol falando com o Li Wei).
export const DEFAULT_ARCHETYPE = 'peao_brabo';

// SUGESTÃO: nome de quem entra sem nome.
export const DEFAULT_PLAYER_NAME = 'Visitante';

// SUGESTÃO: tamanho máximo do nome exibido.
export const MAX_NAME_LENGTH = 20;

/**
 * Queda de conexão (Sistemas.md: "Se a conexão cair, o personagem entra no modo automático até
 * voltar"). SUGESTÃO: depois de 120 s sem voltar, o personagem sai do mapa (o progresso fica salvo).
 */
export const OFFLINE_AUTO_MS = 120_000;

// SUGESTÃO: o Colyseus segura a mesma sessão por 20 s para a reconexão automática do SDK.
export const COLYSEUS_RECONNECT_S = 20;

// SUGESTÃO: inimigos renascem 30 s depois que o bando inteiro caiu (elite 60 s, chefe 120 s).
export const RESPAWN_MS = { normal: 30_000, elite: 60_000, chefe: 120_000 } as const;

// SUGESTÃO: não renasce inimigo com jogador a menos de 8 tiles do ponto (não aparece na cara).
export const RESPAWN_SAFE_RADIUS = 8;

// SUGESTÃO: membros de um bando nascem num círculo de 1 tile em volta do marcador.
export const BAND_SPREAD_TILES = 1;

// SUGESTÃO: progresso dos jogadores é salvo a cada 10 s (e ao sair).
export const SAVE_EVERY_MS = 10_000;

/**
 * Entradas do joystick (ver core.ts, cabeçalho). O cliente prevê um passo por entrada, então o
 * servidor também anda um passo por entrada e o ack (lastSeq) anda junto com a posição. Fila vazia:
 * não anda (sem extrapolar com a entrada velha).
 *
 * SUGESTÃO: sobrou entrada na fila depois do tick: até 2 entradas extras por tick andam na hora,
 * para o atraso não ficar para sempre depois de uma rajada (a fila volta a 0).
 */
export const INPUT_TARGET_BACKLOG = 0;
export const INPUT_CATCHUP_PER_TICK = 2;

// SUGESTÃO: crédito de entradas: +1,05 por tick, até 20 (1 s de rajada). Cada entrada consumida
// (ou suposta) gasta 1. Quem manda entrada mais rápido que 20 por segundo não anda mais rápido.
export const INPUT_CREDIT_PER_TICK = 1.05;
export const INPUT_CREDIT_MAX = 20;

// SUGESTÃO: fila de entradas com no máximo 40 (2 s); passou disso, as mais velhas caem.
export const INPUT_QUEUE_MAX = 40;

/**
 * @deprecated a fila agora é drenada (INPUT_TARGET_BACKLOG, INPUT_CATCHUP_PER_TICK) e só corta em
 * INPUT_QUEUE_MAX. Fica exportado para quem importava.
 */
export const INPUT_BACKLOG_MAX = 3;

// SUGESTÃO: comando com afterSeq espera o servidor consumir essa entrada por no máximo 10 ticks (0,5 s).
export const CMD_HOLD_MAX_TICKS = 10;

// SUGESTÃO: d/n/lk/lv de uma entidade nova (ou que mudou) se repetem a cada 4 ticks até o ack,
// não em todo tick (o 'need' cobre o resto).
export const INFO_REPEAT_TICKS = 4;

// SUGESTÃO: comandos lidos por mensagem e ids lembrados para a deduplicação.
export const MAX_CMDS_PER_MSG = 16;
export const RECENT_CMD_IDS = 128;

// SUGESTÃO: 'gone' é repetido até o cliente confirmar o tick (no máximo 2 s).
export const GONE_REPEAT_TICKS = 40;

// SUGESTÃO: eventos valem até 2 tiles além do raio de interesse.
export const EVENT_MARGIN_TILES = 2;

// SUGESTÃO: RTT informado pelo cliente é limitado a 2 s.
export const MAX_CLIENT_RTT_MS = 2000;

// SUGESTÃO: o servidor roda no máximo 4 ticks de recuperação quando o processo engasga.
export const MAX_CATCHUP_TICKS = 4;
