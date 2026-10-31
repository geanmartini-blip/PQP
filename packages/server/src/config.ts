/**
 * Números do servidor que não estão nos docs. Tudo aqui é sugestão do protótipo da Fase 1 e pode
 * ser trocado pelos autores. Os números de combate continuam em balance.json.
 */

/** Porta padrão do servidor (express + Colyseus). */
export const DEFAULT_PORT = 2567;

/** Mapa do protótipo. */
export const DEFAULT_MAP_ID = 'prototipo_delta';

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

/** Entradas: no máximo 3 na fila (o cliente repete as 3 últimas); mais que isso, as velhas caem. */
export const INPUT_BACKLOG_MAX = 3;

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
