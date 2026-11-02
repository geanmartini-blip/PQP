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

// SUGESTÃO: inimigos renascem 90 s depois que o bando inteiro caiu (elite 3 min, chefe 5 min), para
// dar tempo de falar com NPC, ler a missão e pegar o saque.
export const RESPAWN_MS = { normal: 90_000, elite: 180_000, chefe: 300_000 } as const;

// SUGESTÃO: não renasce inimigo com jogador a menos de 12 tiles do ponto (não aparece na cara).
export const RESPAWN_SAFE_RADIUS = 12;

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

// ---- Fase 3. Tudo SUGESTÃO: os docs não dão esses números. ----

// SUGESTÃO: a saída do mapa ('saida') leva para a outra sala a até 1,5 tile do marcador.
export const EXIT_RADIUS_TILES = 1.5;

// SUGESTÃO: quem acabou de nascer espera 2 s antes de uma saída valer (não volta sem querer).
export const EXIT_GRACE_MS = 2000;

// SUGESTÃO: escolher a ala pela mensagem direta pede o treinador da ala ou quem recebe a base a até 4 tiles.
export const ALA_TRAINER_REACH_TILES = 4;

// SUGESTÃO: um emote a cada 2 s por jogador; vai para quem está no raio de interesse.
export const EMOTE_COOLDOWN_MS = 2000;

// SUGESTÃO: parado num quadro ou papel (kind 'quadro_missoes') que o objetivo pede, conta de novo a cada 2 s
// ("responda 3 perguntas" sem sair e voltar 3 vezes).
export const INTERACT_REPEAT_MS = 2000;

// SUGESTÃO: no objetivo 'sobreviver', as ondas da missão nascem a 5 tiles do jogador, espalhadas
// pela duração (a onda i em i × duração / ondas); fora do raio (naoSairDoRaio) o tempo não conta.
export const SURVIVE_SPAWN_TILES = 5;

// ---- Fase 4. Tudo SUGESTÃO: os docs não dão esses números. ----

// SUGESTÃO: o ciclo da cidade do servidor dura 10 minutos (PQP_CICLO_CIDADE_MIN muda); o doc fala
// em semana, e o housing.json diz que no piloto a duração vem da configuração.
export const CITY_CYCLE_MIN_DEFAULT = 10;

// SUGESTÃO: o servidor confere a cidade (anúncios vencidos, virada do ciclo) a cada 5 s.
export const CITY_TICK_MS = 5000;

// SUGESTÃO: comprar e vender na loja de NPC pede estar a até 5 tiles do balcão (marcador 'loja').
export const SHOP_REACH_TILES = 5;

// SUGESTÃO: feira e câmbio pedem estar a até 8 tiles do lugar (marcador 'lugar' da feira ou do câmbio).
export const MARKET_REACH_TILES = 8;

// SUGESTÃO: a porta da moradia (marcador 'moradia') leva para a casa a até 1,2 tile; visitar pela
// mensagem casa_visitar entra na casa a até 4 tiles da porta (mais longe, só mostra a casa).
export const DOOR_RADIUS_TILES = 1.2;
export const DOOR_REACH_TILES = 4;

// SUGESTÃO: até 20 pessoas na sala de uma casa.
export const HOUSE_MAX_CLIENTS = 20;

// SUGESTÃO: o servidor guarda os últimos 500 eventos de economia na memória (o resto vai para o Store).
export const EVENT_LOG_MEMORY = 500;

// ---- Fase 5. Tudo SUGESTÃO: os docs não dão esses números. ----

// SUGESTÃO: fora de produção, o tick de facção dura 5 minutos (PQP_TICK_FACCAO_MIN muda; em
// produção, sem a variável, vale o cicloProducaoMin de faction_ai.json, 60).
export const FACTION_TICK_MIN_DEV = 5;

// SUGESTÃO: o servidor confere se o tick de facção venceu a cada 10 s.
export const FACTION_CHECK_MS = 10_000;

// SUGESTÃO: 'masmorra_entrar' pede estar a até 4 tiles da entrada das Galerias, e o grupo é quem
// está a até 6 tiles de quem entrou (jogadores ao vivo) mais os plantonistas levados, até 4.
export const DUNGEON_ENTRY_REACH_TILES = 4;
export const DUNGEON_GROUP_RADIUS_TILES = 6;

// SUGESTÃO: na masmorra, a escada e a saída esperam 2 s depois de nascer (EXIT_GRACE_MS).

// SUGESTÃO: plantonista nasce a 1 tile de quem levou.
export const DUTY_SPAWN_OFFSET_TILES = 1;

// SUGESTÃO: encontros com IA nas margens, na Usina e no Juncal (o Delta é o tutorial e fica sem).
export const ENCOUNTER_MAPS: readonly string[] = ['margem_esquerda', 'margem_direita', 'usina_da_ponte', 'juncal'];

// SUGESTÃO: os encontros da janela são conferidos a cada 100 ticks (5 s).
export const ENCOUNTER_CHECK_TICKS = 100;
