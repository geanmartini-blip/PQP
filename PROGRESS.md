# Progresso do piloto

Se a sessão recomeçar: ler CLAUDE.md e este arquivo e continuar da primeira fase não concluída.
Comandos rodam com `. .\scripts\env.ps1` antes (Node e Git portáteis).

## Fase 0: plano, arquitetura, esquemas e JSON — CONCLUÍDA
- Monorepo com os workspaces `shared`, `server`, `client` e `sim`. A estrutura está em ARQUITETURA.md.
- `shared/src/schema` tem 21 esquemas zod, um por domínio. Isso inclui a linguagem de efeitos das
  habilidades.
- `shared/data` tem 38 JSON com as tabelas dos três docs. Os números inventados estão marcados como
  sugestão.
- `getData()` valida tudo e monta mapas por id.
- `data.test.ts` confere esquemas e referências cruzadas (110 testes passando).
- Revisão de fidelidade em três frentes: combate, pessoas e mundo. O detalhe está em
  `decisoes/fase0-dados.md`.
- Contratos da Fase 1: `shared/src/map/types.ts`, `shared/src/sim/types.ts`,
  `shared/src/net/protocol.ts` e `client/src/art/contract.ts`.

## Fase 5: masmorra, plantão e IA de facção — EM ANDAMENTO
Plano:
1. Galerias da Usina: masmorra sem fundo, em tempo real, com andares gerados por semente. Este piloto
   tem 5 andares e chefe no 5º. A sala é por grupo, para até 4.
2. Plantão: offline, o personagem fica no QG e luta pela Doutrina quando outro jogador o leva. Há
   editor de Doutrina com até 5 cartas.
3. Encontros com IA no mapa: patrulhas e personagens de IA que lutam junto ou contra.
4. IA de facção:
   - Lazzaro Prati (Direita) e Rolf Halvorsen (Esquerda) decidem a cada ciclo;
   - pontos de controle por influência, com saque máximo de 20%;
   - avisos no mapa.
5. Itens comum e raro com visual por ala, benzimento e calibração, e 2 únicos.
6. SQL do pg_cron e workers. Testes, build e commit. Por fim, README e PENDENTE.

## Fase 4: sociedade, moradia e economia básica — CONCLUÍDA
- Regras:
  - carteira com Semente, Crédito, score e dívida;
  - loja de NPC com preço dinâmico;
  - feira sem taxa e app com taxa;
  - câmbio com cotação por volume;
  - mutirão por lista de espera;
  - cápsula com aluguel e despejo;
  - móveis em grade;
  - visitas;
  - ciclo da cidade.
- O servidor guarda mercado e câmbio. A casa tem sala própria (`casa:<id>`). Há SQL do Supabase.
- Cliente: telas de loja, feira e app, câmbio e casa com modo decorar. Há 30 móveis em pixel.
- Verificação:
  - 658 testes passando;
  - build ok;
  - e2e consertado: 3 rodadas seguidas passaram em cerca de 28 s;
  - fluxo completo em `server/test/fase4.test.ts`.
- Detalhe em `decisoes/fase4-sociedade.md`.

Plano original:
1. Regras em `shared/src/game`: carteira com Semente e Crédito; score do Crédito; patentes iniciais
   já existem e só ganham ligação com a economia.
2. Feira de troca da Esquerda (anúncios entre jogadores, sem taxa) e app do Consórcio (taxa e preço
   dinâmico).
3. Câmbio na ponte com taxa variável; contrabando pelo Juncal fica como sugestão simples.
4. Moradia: casa de mutirão por lista de espera e cápsula de aluguel. Móveis em grade, colocar,
   girar e tirar. O estado é salvo no registro.
5. Servidor com mensagens novas. O cliente ganha telas de loja, feira/app, câmbio e o modo de decorar
   a casa.
6. SQL do Supabase para economia e moradia. Testes, build e commit.

## Fase 3: margens, instituições, arquétipos e treinadores — CONCLUÍDA
- Regras:
  - ala no 12;
  - talentos do 10, 15 e 20 com habilidades derivadas e passivos;
  - guias com falas;
  - bordão vira emote;
  - patentes por reputação;
  - loja e quadro por instituição;
  - missões de entrada das 8.
- Mapas: `margem_esquerda`, `margem_direita`, `usina_da_ponte` e `juncal`, com saídas. Os `qg_*`
  viraram apelidos.
- Arte: os 24 arquétipos e os treinadores, tiles das margens, emblemas e ícones. A geração de sprites
  agora é assíncrona.
- Balanceamento: com n=60 no 1 contra 1, nenhum arquétipo passa de 55%. O maior é 54,3%.
- Verificação:
  - typecheck ok;
  - 596 testes passando;
  - build ok;
  - e2e passou com 200 ms e 2% de perda;
  - fluxo completo em `server/test/fase3.test.ts`.
- Detalhe em `decisoes/fase3-margens.md`. Em aberto:
  - o e2e é instável: o robô às vezes não chega ao chefe;
  - Diva e Druida estão fracos, com cerca de 42%;
  - o grupo contra grupo foi conferido com amostra pequena.

Plano original:
1. Mapas das duas margens com os 2 QGs e as 8 instituições, cada uma com quem treina a base, loja,
   treino, quadro de missões e patentes. Também a Usina da Ponte e o Juncal.
2. Os 24 arquétipos jogáveis:
   - escolha da ala no nível 12, que libera o treinador;
   - trajes de aprendiz e veterano;
   - talentos dos níveis 10, 15 e 20;
   - guia com bônus e falas.
3. Os 24 treinadores como NPCs com falas e bordões; o bordão vira emote.
4. Missões de entrada das 8 instituições.
5. Balanceamento no simulador até nenhum arquétipo passar de 55%.
6. Testes, build, commit.

## Fase 2: criação, Máquina de Visual, Delta, tutorial e travessia — CONCLUÍDA
- `shared/src/game`:
  - registro do jogador;
  - criação e Máquina de Visual;
  - XP só em grupo, com +15%;
  - missões do Delta até o Bruno Ferro;
  - tutorial, diálogo e travessia.
- Mapas `delta`, `qg_esquerda` e `qg_direita`. Uma sala por mapa.
- Cliente:
  - tela de criação;
  - Máquina de Visual;
  - diálogo;
  - rastreador com seta e auto-caminho;
  - tela da travessia.
- Arte refeita com sombreamento, autotile, água com espuma, árvores e deco.
- Verificação: 501 testes passando e build ok. O e2e passou com 200 ms e 2% de perda. O fluxo
  completo, da criação até a chegada ao QG, está em `server/test/fase2.test.ts`.
- Detalhe em `decisoes/fase2-delta.md`. Em aberto:
  - a travessia de barco não é jogável: a escolha leva direto ao QG;
  - o carregamento das folhas de sprite é lento;
  - o HUD no QG da Direita teve uma captura sem botões.

1. Regras em `shared`:
   - registro do jogador, com aparência, estágio, nível, XP, missões e story_flags;
   - progressão de 1 a 8, em que só luta em grupo dá XP;
   - motor de missões: falar, ir, derrotar, coletar, com auto-caminho;
   - Máquina de Visual, que nunca tira a silhueta;
   - travessia: margem, instituição, classe e guia.
2. Mapa do Delta completo pelos lugares de `places.json`:
   - Seu Jacó;
   - Espelho do Cadastro, a Máquina de Visual do Delta;
   - cais e barco;
   - arena do Bruno Ferro no nível 7.
3. Servidor:
   - salva o jogador;
   - mensagens de criação, visual, missão, conversa e travessia;
   - troca de mapa.
4. Cliente:
   - tela de criação em camadas com botão de sortear;
   - Máquina de Visual;
   - diálogo;
   - rastreador de missão com seta;
   - tutorial do primeiro minuto;
   - tela da travessia.
5. Arte refeita com mais capricho: bonecos com sombreamento, tiles com transição, sombras, árvores e
   água. Isso responde ao retorno de que a arte do protótipo ficou feia.
6. Testes, build no celular, commit.

## Fase 1: protótipo de movimento e combate — CONCLUÍDA
- Simulação determinística em `shared/src/sim`:
  - os 6 tipos de habilidade e toda a linguagem de efeitos;
  - controle com imunidade, e chefe que fica lento em vez de controlado;
  - caído e levantar, saque e XP;
  - compensação de 250 ms.
- IA dos inimigos com bandos, elite com afixos e chefe com avisos no chão. A Doutrina cuida do modo
  automático. O simulador de balanceamento está em `packages/sim`.
- Servidor Colyseus autoritativo:
  - snapshots por raio de interesse;
  - entradas repetidas e comandos com ack;
  - `PQP_LAG_MS` e `PQP_LOSS`;
  - FileStore.
- Cliente Phaser em retrato:
  - joystick, botões e toque para trocar de alvo;
  - previsão e interpolação;
  - HUD;
  - Wesley e Li Wei trocam a ala;
  - `?offline=1`, `?lag=`, `?gallery=1`.
- Verificação: typecheck ok, 406 testes passando e build ok. O e2e passou com 200 ms de atraso e 2% de
  perda: 20 snapshots/s, andar, matar com os 3 botões e o aviso do chefe.
- Em aberto, que passa para a Fase 3:
  - balanceamento: 10 arquétipos acima de 55% no simulador;
  - Peão Brabo × Idol dá 100% para o Peão.
- Detalhe em `decisoes/fase1-prototipo.md`.

Plano:
1. Simulação compartilhada (`shared/src/sim`), determinística a 20 ticks:
   - movimento livre com colisão;
   - linha de visão e alvo automático;
   - básico, 3 botões e Especial;
   - controle com imunidade, caído e levantar.
2. Mapa do protótipo com paredes, água, mato, Wesley e Li Wei, bandos, uma elite e uma arena de chefe.
   A* para tocar no chão.
3. IA dos inimigos com aviso no chão, e Doutrina para o modo automático e os companheiros.
4. Servidor Colyseus autoritativo:
   - snapshots por raio de interesse;
   - entradas repetidas e comandos com ack;
   - compensação de 250 ms;
   - atraso e perda simulados por `PQP_LAG_MS` e `PQP_LOSS`.
5. Arte em pixel desenhada por código: bonecos 32x48 em camadas, tiles, efeitos e ícones.
6. Cliente Phaser em retrato:
   - joystick, botões e toque para trocar de alvo;
   - previsão do próprio movimento e interpolação dos outros;
   - HUD;
   - troca Peão Brabo ↔ Idol falando com Wesley e Li Wei;
   - `?lag=200&loss=0.02`.
7. Testes de combate com atraso de 200 ms e 2% de perda. Revisão por especificação, rede, bugs e
   celular. Build aberto em tela de celular, commit.
