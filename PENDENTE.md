# Pendente: o que depende de vocês

O piloto roda inteiro no PC e no celular pela rede local sem nada desta lista. Cada item diz o que
falta e onde a integração já está pronta.

## 1. Supabase: conta, chaves e migrations
- **Criar o projeto** no Supabase. Pode ser o plano grátis no piloto.
- **Variáveis de ambiente do servidor**, só no servidor e nunca no cliente:
  - `SUPABASE_URL`: a URL do projeto (`https://<projeto>.supabase.co`);
  - `SUPABASE_SERVICE_KEY`: a chave `service_role`.

  Com as duas, o servidor troca o `FileStore` pelo `SupabaseStore`
  (`packages/server/src/persistence/store.ts`). O `FileStore` grava em `.data/players.json`,
  `.data/world.json` e `.data/events.jsonl`. O cliente não fala com o Supabase direto, então não
  precisa de chave `anon` no piloto.
- **Migrations, nesta ordem**, pelo SQL Editor ou pela CLI (`supabase db push`), todas em
  `supabase/migrations/`:
  1. `0001_players.sql`: tabela `players`, com o registro em JSON e o token de convidado.
  2. `0002_player_record_v2.sql`: colunas geradas e índices por estágio e margem.
  3. `0003_economia.sql`: `world_state`, `event_log` e as views de economia e moradia.
  4. `0004_faccao.sql`: `npc_leader`, pontos de controle, influência, avisos do mapa
     (`world_event`) e a função `espelhar_faccao()`.
  5. `0005_masmorra_plantao.sql`: `duty_assignment`, `duty_roster` e a view `dungeon_run_log`.
- **Conferir contra um projeto de verdade.** Nada foi rodado num Supabase real, porque ainda não há
  conta. Primeiro teste sugerido: subir o servidor com as duas variáveis, criar um personagem e ver a
  linha em `players`.
- **Supabase Auth.** O login hoje é de convidado, com um token guardado no aparelho. Falta trocar por
  e-mail ou por um provedor. O ponto de troca é o token em `players.token`.
- **Realtime** para o chat e os avisos do mapa: ligar a publicação da tabela `world_event`. Hoje os
  avisos vão pela sala do Colyseus.

## 2. pg_cron e workers
- No local, os ticks rodam em workers do próprio servidor:
  - ciclo da cidade: `city_service.ts`, `PQP_CICLO_CIDADE_MIN`, padrão 10 min;
  - IA de facção e produção dos pontos: `faction_service.ts`, `PQP_TICK_FACCAO_MIN`, padrão 60 min;
  - plantão: `duty_service.ts`.
- No Supabase, ligar as extensões `pg_cron` e `pg_net` e descomentar os `cron.schedule` que já
  estão escritos:
  - `0003_economia.sql`: `pqp_ciclo_cidade`;
  - `0004_faccao.sql`: `pqp_tick_faccao` e `pqp_limpa_world_event`.
- **Falta a Edge Function `tick-faccao`.** O `pqp_tick_faccao` chama essa função, que rodaria o
  mesmo `tickFaccao` do TypeScript. Ela não foi escrita. Enquanto o servidor Node estiver no ar, o
  worker dele faz esse trabalho, e o pg_cron pode ficar desligado.

## 3. Publicação
- **Hospedar o servidor** (Node + WebSocket) com HTTPS e WSS: Fly.io, Render, Railway ou uma VPS.
  O `npm start` já serve o cliente compilado e o WebSocket na mesma porta (`PORT`).
- **Domínio e certificado.** O navegador do celular só deixa o jogo em tela cheia e instalável em
  HTTPS.
- **Uma instância só.** As salas, as runs da masmorra e o estado da cidade vivem na memória de um
  processo. Para mais de uma instância, falta o `presence` e o `driver` do Colyseus (Redis).

## 4. Capacitor e lojas (depois do piloto)
- Nada de Capacitor foi instalado ainda. Os passos:
  1. `npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios -w @pqp/client`;
  2. `npx cap init`, com `webDir` = `packages/client/dist`;
  3. `npx cap add android`;
  4. `npx cap add ios`, que pede um Mac.
- Contas de desenvolvedor: Google Play (taxa única) e Apple Developer (anual).
- Ícone, splash, política de privacidade e classificação etária. O público é 30+, com palavrão
  moderado.

## 5. Medições que pedem aparelho e gente
- **60 fps num celular médio.** Não foi medido num aparelho de verdade. Para medir: `npm start`,
  abrir `http://<IP do PC>:2567/?debug=1` no celular e olhar os fps numa luta com bando e chefe. O
  risco conhecido é a arte gerada por código: uma folha nova leva cerca de 30 ms no PC. O
  `BootScene` pré-gera as folhas principais.
- **Rede ruim de verdade.** Os testes e o `npm run e2e` simulam 200 ms e 2% de perda. Falta jogar
  com o 4G de um celular contra o servidor hospedado.
- **"Entende os controles em 1 minuto".** Falta testar com alguém que nunca jogou. O tutorial do
  Delta mostra as dicas curtas, mas ninguém de fora experimentou.
- **Tamanho do cliente.** São cerca de 780 kB com gzip, dos quais o Phaser tem 320 kB e os dados
  260 kB. Pode pesar no 3G.

## 6. Decisões de doc em aberto
- **Orçamento de poder dos arquétipos.** No `balance.json` ele ficou entre 43 e 60,5, fora da faixa
  de 52,5 a 56 do Sistemas.md. Foi o ajuste que deixou todos os arquétipos abaixo de 55% de vitória
  no simulador; o maior ficou em 54,3% com n=60. Opções: atualizar o Sistemas.md com a tabela
  calibrada, ou trocar o critério de pronto. Detalhe em `decisoes/fase3-margens.md`.
- **Balanceamento de grupo.** O 1 contra 1 foi conferido com n grande. O grupo contra grupo só passou
  na trava rápida (`packages/sim/test/sim.test.ts`). A conferência cheia é a de
  `$env:PQP_BALANCO='1'; npx vitest run packages/sim`.
- **Líderes da IA de facção.** O código segue a Narrativa.md: Lazzaro Prati comanda as Raízes
  (Esquerda, agressivo) e Rolf Halvorsen comanda a PM do Consórcio (Direita, defensivo). O plano da
  Fase 5 no PROGRESS.md diz o contrário. Basta confirmar.
- **Sugestões.** Os números, falas e lore que não estão nos docs levam `sugestao`/`sugestaoCampos`
  nos JSON e `// SUGESTÃO:` no código. A lista por fase está em `DECISIONS.md` e em `decisoes/`. Entre
  elas estão os 4 Especiais de classe, as recargas e os custos, as falas novas, as flags das Galerias
  e as missões de expedição.
- **Pontos menores** registrados em `decisoes/`:
  - o Delta não tem travessia de barco jogável (a escolha é na tela);
  - levantar aliado zera o progresso quando ninguém está do lado, e o doc não diz se zera ou pausa;
  - os arquivos órfãos `packages/shared/src/map/maps/qg_esquerda.ts` e `qg_direita.ts` podem ser
    removidos.

## 7. Ambiente
- **OneDrive.** O projeto está numa pasta do OneDrive. Pausar a sincronização ou mover o projeto para
  fora (por exemplo, `C:\dev\ponte-que-partiu`) deixa o `npm install` e o Vite bem mais rápidos.
- **Pasta vazia.** Existe uma pasta vazia `Ponte que Partiu\Ponte que Partiu` dentro do projeto. Pode
  apagar.
- **Firewall do Windows.** Liberar as portas 5173 e 2567 na rede privada. O comando está no README.
- **Node portátil.** `scripts/env.ps1` aponta para `C:\Users\gnmar\tools\node`. Em outra máquina,
  troque o caminho ou instale o Node LTS.

## 8. Arte
- A arte do piloto é desenhada por código, em pixel art gerada em canvas (`packages/client/src/art`).
  Os prompts do Arte.md podem gerar as folhas de sprite finais. O gerador tem um ponto de troca por
  PNG para quando elas existirem.
