# Arquitetura do piloto

Monorepo npm com workspaces. Tudo em TypeScript. O pacote compartilhado é consumido como
fonte TS (sem build): Vite, Vitest e tsx entendem TS direto.

```
packages/
  shared/            regras, dados e núcleo da simulação (usado por servidor, cliente e simulador)
    data/            JSON de config gerados a partir de docs/ (fonte do balanceamento: Sistemas.md)
    src/schema/      esquemas zod por domínio; os tipos TS saem deles (z.infer)
    src/data/        carregador tipado: importa os JSON, valida e expõe getData()
    src/rules/       regras puras: atributos, modificadores, talentos, guias, itens, visual,
                     economia, moradia, influência, IA de facção, plantão, story_flags, Doutrina, XP
    src/sim/         simulação determinística em passo fixo (20 ticks/s): mundo, entidades,
                     movimento, colisão com tiles, linha de visão, alvo automático, executor de
                     habilidades, efeitos de status, IA de inimigos, avisos no chão, saque, reanimar
    src/net/         protocolo cliente-servidor (tipos das mensagens, quantização)
    src/map/         mapas em tiles, regiões e pathfinding A* (auto-caminho)
    test/            Vitest
  server/            Node + Colyseus: salas autoritativas, persistência, workers (ticks)
    src/rooms/       WorldRoom (mapa aberto), DungeonRoom (masmorra)
    src/persistence/ Store (interface), FileStore (padrão, .data/), SupabaseStore (quando houver chaves)
    src/workers/     tick de produção, IA de facção, plantão, ciclo (equivalente local do pg_cron)
  client/            Phaser 3 + Vite, retrato, pixel art gerada por código
    src/art/         gerador de pixel art em camadas (bonecos 32x48, tiles 32, efeitos)
    src/scenes/      Boot, Criação, Mundo, HUD, Máquina de Visual, Moradia
    src/input/       joystick flutuante, botões grandes, toque no chão e no inimigo
    src/net/         conexão, previsão do próprio movimento, interpolação dos outros
  sim/               simulador de combate sem interface (balanceamento, relatório de vitória)
supabase/migrations/ SQL do Postgres (Supabase) e jobs do pg_cron, prontos para quando houver conta
docs/                Narrativa, Sistemas e Arte (fonte de tudo; não editar aqui)
```

## Convenções

- **Unidade da simulação:** 1,0 = 1 tile = 32 px. O cliente multiplica por 32 para desenhar.
- **IDs:** snake_case ASCII sem acento (`peao_brabo`, `brigada_popular`, `segura_o_peao`).
  Nomes exibidos ficam em `name`, em português do Brasil, com acento.
- **Sugestão:** tudo que não está nos docs (fala, lore, número) é marcado. No JSON: `"sugestao": true`
  quando a entrada inteira é inventada, ou `"sugestaoCampos": ["cooldown", ...]` quando só alguns
  campos são. No código: comentário `// SUGESTÃO:`. DECISIONS.md resume as sugestões.
- **Margens:** `esquerda` (Raízes, Encanto) e `direita` (Consórcio Neon, máquina). No mapa, a
  Esquerda fica à esquerda do rio (x menor).
- **Textos do jogo:** português do Brasil. Identificadores de código em inglês.
- **Determinismo:** a simulação recebe um RNG semeado (nunca `Math.random` dentro de `sim/`) e um
  passo fixo de 50 ms, para o servidor, o simulador e os testes darem o mesmo resultado.

## Rede (servidor autoritativo)

- O servidor roda a simulação a 20 ticks/s e decide dano, acerto, recarga e posição final.
- O cliente manda `input` a cada tick com o vetor do joystick quantizado e um número de sequência;
  cada mensagem repete as 3 últimas entradas, para que 2% de perda não apague movimento.
- Comandos discretos (habilidade, troca de alvo, item, ir até um ponto) têm id e são reenviados até
  o servidor confirmar no snapshot, sem efeito duplicado.
- O servidor manda a cada tick um snapshot completo das entidades no raio de interesse (sem delta),
  com posições quantizadas e a última entrada processada. Snapshot perdido não estraga nada.
- O cliente prevê o próprio movimento com o mesmo código de movimento de `shared` e reconcilia;
  os outros são interpolados cerca de 100 ms no passado.
- Compensação de atraso: o servidor guarda 250 ms de histórico de posições e confere toques e
  habilidades travadas na posição que o jogador via, com tolerância de 1 tile.
- Simulação de rede ruim: `PQP_LAG_MS` e `PQP_LOSS` no servidor e `?lag=200&loss=0.02` no cliente.
  Os testes usam um transporte em memória com atraso e perda.

## Persistência

- Interface `Store` no servidor. Padrão: `FileStore`, JSON em `.data/` (funciona sem nada instalado).
- `SupabaseStore` liga quando `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` existirem. O SQL está em
  `supabase/migrations/`. Login de convidado por token do aparelho até o Supabase Auth entrar.
- Ticks de produção, IA de facção e plantão rodam num worker do servidor; o equivalente em pg_cron
  fica pronto no SQL.

## Como rodar

No Windows, abra o PowerShell na pasta do projeto e rode `. .\scripts\env.ps1` antes (põe Node e
Git no PATH).

- `npm run dev` (scripts/dev.mjs): servidor de jogo com `tsx watch` (porta 2567) e Vite (porta 5173),
  os dois em 0.0.0.0, com os logs prefixados por `[server]` e `[client]`. Ctrl+C encerra os dois.
  Rede ruim no servidor: `PQP_LAG_MS`/`PQP_LOSS`/`PQP_JITTER_MS` no ambiente, ou
  `npm run dev -- --lag 200 --loss 0.02 [--jitter 20] [--companheiro]`.
  No PC: http://localhost:5173. No celular (mesmo Wi-Fi): http://IP-do-PC:5173 (o cliente acha o
  servidor na porta 2567 do mesmo host).
- `npm start`: compila o cliente e o servidor serve tudo (jogo, assets e WebSocket) na porta 2567:
  http://localhost:2567 no PC e http://IP-do-PC:2567 no celular. `PORT` troca a porta.
- Parâmetros da URL do cliente: `?offline=1` (servidor local no navegador, sem rede), `?debug=1`
  (ping e fps), `?lag=200&loss=0.02&jitter=20` (rede ruim do lado do cliente), `?server=host:porta`,
  `?gallery=1` (galeria da arte), `?nome=Fulano&ala=idol`.
- `npm test`: Vitest (inclui o ponta a ponta curto em `packages/server/test/e2e.test.ts`).
- `npm run e2e`: ponta a ponta completo. Sobe o servidor em outro processo numa porta livre, com
  200 ms e 2% de perda, conecta um robô com `@colyseus/sdk`, anda até um bando, mata um inimigo com
  os botões, vai até o chefe e espera o aviso no chão; encerra o servidor no fim (~1 min).
- `npm run typecheck`, `npm run build`.
- `npm run sim -- --modo 1v1 --n 500 --a peao_brabo --b idol` (ou `--todos`, `--json`): simulador.
- `npm run bot -w @pqp/server -- 8 ws://localhost:2567 60`: carga com 8 robôs por 60 s.
- Servidor: `PQP_COMPANHEIRO=1` (companheiro de IA), `PQP_SEED`, `PQP_DATA_DIR` (pasta do
  players.json), `PQP_SERVE_CLIENT=0` (não serve o build; o `npm run dev` liga), `SUPABASE_URL` e
  `SUPABASE_SERVICE_KEY` (ver PENDENTE.md).
