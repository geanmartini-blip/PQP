/**
 * Entrada do servidor: `npm run dev -w @pqp/server` (tsx watch) ou `npm start -w @pqp/server`.
 *
 * Ambiente:
 * - PORT (padrão 2567) e HOST (padrão 0.0.0.0, para o celular na rede local);
 * - PQP_LAG_MS, PQP_LOSS, PQP_LOSS_MODE (travada | descarte), PQP_STALL_MS, PQP_JITTER_MS,
 *   PQP_NET_SEED: rede ruim simulada (ver netsim.ts; por padrão a perda vira travada, como no TCP);
 * - PQP_COMPANHEIRO=1: cada jogador ganha um companheiro de IA;
 * - PQP_SEED: semente do mundo;
 * - SUPABASE_URL e SUPABASE_SERVICE_KEY: usa o Supabase; senão grava em .data/players.json;
 * - PQP_DATA_DIR: outra pasta para o players.json;
 * - PQP_SERVE_CLIENT=0: não serve o build do cliente (o npm run dev liga isso; o jogo vem do Vite).
 * - Fase 4: PQP_CICLO_CIDADE_MIN (duração do ciclo da cidade em minutos, padrão 10) e PQP_DEV=1
 *   (aceita o atalho casa_avancar_fila). A cidade fica em .data/world.json e o log de economia em
 *   .data/events.jsonl (ou nas tabelas world_state e event_log do Supabase).
 */
import { lanAddresses, startServer } from './app';
import type { WorldRoomOptions } from './rooms/WorldRoom';

const env = process.env;
const port = Number(env['PORT'] ?? 2567) || 2567;
const host = env['HOST'] ?? '0.0.0.0';
const room: WorldRoomOptions = {};
if (env['PQP_COMPANHEIRO'] === '1' || env['PQP_COMPANHEIRO'] === 'true') room.companions = true;
if (env['PQP_SEED'] && Number.isFinite(Number(env['PQP_SEED']))) room.seed = Number(env['PQP_SEED']);

// PQP_SERVE_CLIENT=0: não serve packages/client/dist (o npm run dev usa o Vite na 5173, e um dist
// velho na 2567 só confundiria)
const serveClient = !(env['PQP_SERVE_CLIENT'] === '0' || env['PQP_SERVE_CLIENT'] === 'false');
const running = await startServer({ port, host, room, serveClient });

const ips = lanAddresses();
console.log('');
console.log('Ponte que Partiu: servidor no ar');
console.log(`  persistência: ${running.store.kind}`);
console.log(`  saúde:        http://localhost:${running.port}/health`);
if (running.clientDist) {
  console.log(`  no PC:        http://localhost:${running.port}`);
  for (const ip of ips) console.log(`  no celular:   http://${ip}:${running.port}`);
} else {
  console.log(serveClient ? '  o cliente não está compilado aqui; com o Vite (npm run dev), abra:' : '  o jogo vem do Vite (npm run dev); abra:');
  console.log('  no PC:        http://localhost:5173');
  for (const ip of ips) console.log(`  no celular:   http://${ip}:5173   (servidor de jogo em ws://${ip}:${running.port})`);
}
if (ips.length === 0) console.log('  (não achei IP de rede local: confira o Wi-Fi)');
console.log('  o celular precisa estar no mesmo Wi-Fi; libere a porta no Firewall do Windows na primeira vez.');
console.log('');

let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  console.log('desligando e salvando...');
  await running.close();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
