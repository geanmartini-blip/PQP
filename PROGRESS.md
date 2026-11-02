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

## PILOTO: as 5 fases estão concluídas
O que falta depende dos autores ou de aparelho: ver PENDENTE.md. Para rodar, ver README.md.

### v0.4: early game mais longo, com áreas e missões novas — CONCLUÍDA (falta o push)
Pronto: os 3 mapas, 8 inimigos (2 chefes), 30 missões, 3 NPCs, a faixa de XP do 5 ao 10, a arte
do PixelLab e `test/v04.test.ts` (as missões cabem nos mapas e as cadeias se jogam até o fim). Detalhe
em DECISIONS.md. Versão 0.4.0. Próximo passo: o chão das Galerias e a troca de lado.
Meta: umas 2 horas até o nível 10, com algo para fazer em cada nível. Plano:
1. Mapas novos: Planalto do Trigo (acima da Esquerda, 6 a 10), Vale das Chaminés (abaixo da
   Direita, 6 a 10) e Ilha do Farol (no rio, neutra, 9 a 12, pequena), com saídas a partir das margens.
2. Inimigos novos de cada área e um chefe no Planalto e outro no Vale (nível 9).
3. Missões: +5 no Delta, cadeias do 5 ao 9 com 8 missões por lado (cobrindo o 8), 2 por
   instituição e bicos repetíveis num quadro de tarefas por margem.
4. Curva de XP um pouco mais lenta do 5 ao 10, com as missões como fonte principal.
5. Arte do PixelLab com as gerações que sobram: chão do Planalto e do Vale, inimigos e NPCs parados.
6. Testes, simulador, build, conferência no navegador, versão 0.4.0, NOVIDADES e commit, sem push.

### v0.3: jornada nova do 1 ao 20, conjunto da classe, ritmo do combate e arte nova — CONCLUÍDA
Plano:
1. **Jornada** (pronta). A história e as missões estão em `docs/Jornada.md`:
   - Delta do 1 ao 4, com o Bruno Ferro no 4;
   - balsa no 5, com a escolha da margem, da instituição e do guia;
   - missões do 5 ao 9;
   - ala no 10;
   - A Licença e A Mata Fechada do 11 ao 13;
   - O Rio Turvo e Siga o Dinheiro do 15 ao 17;
   - a cabeceira da Ponte no 19, que libera a troca de lado.
   As missões do 11 ao 17 eram esboço e ficaram jogáveis com objetivos que o motor já tem.
2. **Itens** (pronto):
   - 5 slots: capacete, armadura (com a calça), arma, calçado e adereço;
   - as missões dão as 5 peças da classe;
   - `conjuntoDaClasse` diz quando o boneco vira a versão inicial da ala.
3. **Combate** (pronto):
   - ritmo do começo: o básico é 1,4x mais lento e mais forte até o 10 e volta ao normal no 20;
   - o Especial e o recurso por acerto foram compensados;
   - animação de golpe em qualquer folha (preparo, bote e impacto);
   - a Engenheira de Gambiarra perdeu um pouco nas invocações.
4. **Arte do PixelLab** (plano Pixel Apprentice desde 2026-11-01, 2.000 gerações por mês):
   - pronto: boneco base com andar e golpe (`public/pl/base`); golpe do Peão e da Idol;
   - pronto: chão do Delta e da balsa, 15 tilesets Wang de 32 px em grade dupla (`art/plChao.ts`,
     `tools/art/pl-chao.mjs`), e 2 árvores do mangue;
   - pronto: o jogador sem o conjunto completo é o boneco base; com as 5 peças, o boneco da ala
     (`look.outfit.conjunto`), quando a ala já tem boneco do PixelLab;
   - pronto: paredes das palafitas (tileset baixo de tábua e zinco), Seu Jacó, Bruno Ferro, capanga e
     cobrador (andar e golpe), siri e mosquito (desenho único, sem direção);
   - pronto: enfeites do Delta (barco, rede, caixote, toldo, lanterna, junco), tufos de mato no
     lugar do mato procedural, Toninho e os dois vendedores. O Delta está fechado;
   - pronto: as duas margens. Chão da Direita (concreto, asfalto, piso neon), parede de cada margem
     (taipa com trepadeira na Esquerda, concreto com neon na Direita), as 10 fachadas, enfeites
     (horta, totem, lixo, letreiro, holograma), fiscal, contrabandista e drone de cobrança;
   - pronto: os 39 NPCs das margens. Os 22 treinadores, os 9 da IA de facção, Nayra e Kenji em
     holograma e 4 avulsos são bonecos parados, só com as 4 direções (`PL_PARADOS`), no tamanho de
     112 px, que custa 15 e dá a mesma altura. O Wesley e o Li Wei usam o boneco do Peão e da Idol;
   - pronto: Usina e Juncal. O Juncal usa o chão e a palafita do Delta; a Usina ganhou 5 tilesets
     (grama e madeira com a parede da Direita, rio fundo com grama, grama e madeira com concreto). A
     pedra pega o chão em volta. Mercenário do Sombra com andar e golpe; o Sombra, a Dalva, o
     Cambista e o Curupira parados; turbina, enguia, cobra, cão e a Bomba Descontrolada (chefe das
     Galerias) como desenho único;
   - pronto: os 22 treinadores andam e têm golpe (soco nos Combatentes e Mascarados, arremesso nos
     Atiradores, magia nos Elementais) e viraram o boneco da ala em `PL_ARCHETYPES`: as 24 alas têm
     boneco para quem completa o conjunto;
   - falta: o chão das Galerias (masmorra, ainda procedural) e os estágios do conjunto.
   Gasto até aqui: 1.712 gerações (tileset "pro" custa 15, boneco "pro" 25 em 128 px e 15 em 112).
5. Pronto para o launch: inimigos com 20% menos vida e 25% menos ataque (`dificuldade` em
   enemies.json), respawn de 90 s (elite 3 min, chefe 5 min) e nunca com o jogador a menos de 12
   tiles, no servidor e no modo offline. Versão 0.3.0, NOVIDADES da v0.3, testes e build:app
   passando. Falta só o push, que publica no GitHub Pages.

Visual dos itens:
- O jogador nasce com o **boneco base** do PixelLab, um corpo neutro com variações de pele e cabelo
  por paleta.
- Cada peça muda a sua parte no estilo da ala:
  - o capacete e a arma são camadas por cima do boneco base, com `edit_image` nas 4 direções e
    acompanhando a cabeça e a mão quadro a quadro;
  - a armadura muda o corpo, por isso vira um estado do boneco (`create_character_state` ou
    `transfer_outfit`).
- Com as 5 peças, o boneco vira o **líder da ala**, que é o mesmo sprite do treinador, reaproveitado.

Assets do PixelLab, em estimativa de gerações (~12 por boneco com 8 direções e andar, +4 de golpe):

| O quê | Gerações |
|---|---|
| Boneco base (8 direções, andar, golpe) | ~16 |
| 24 líderes de ala, que também servem de treinador (12 + 4 de golpe cada) | ~384 (Peão e Idol já feitos: ~360) |
| 24 estágios de "meio conjunto", a armadura vestida | ~288 |
| Camadas de capacete e arma por ala (4 direções × 2 slots) | ~192 |
| NPCs da história (~15) | ~180 |
| Inimigos (~20) e chefes (3) | ~290 |
| Cenário: tilesets (~10), props (~80) e prédios (~20) | ~150 |
| **Total do jogo inteiro** | **~1.450** |
| **Mínimo para a v0.3 ficar na arte nova no começo**: boneco base, golpe do Peão e da Idol, tilesets e props do Delta e da balsa | **~75** |

### v0.1: app instalável offline (PWA) no GitHub Pages — CONCLUÍDA
- `npm run build:app` (base `VITE_BASE`, `/PQP/` no Pages): offline e solo por padrão, manifest,
  ícones em pixel art (`scripts/gerar-icones.mjs`), service worker escrito à mão com pré-cache de
  todo o build e cache versionado (`packages/client/vite.pwa.ts`), faixa "Versão nova".
- Versão 0.1.0 na engrenagem e no MENU; "Novidades da v0.1" uma vez por versão (NOVIDADES.md);
  "Mandar opinião" no MENU; atalhos `?dev_nivel=` e `?dev_mapa=` no dev offline.
- Publicação: `.github/workflows/pages.yml`. Conferência: `npm run check`.
- Verificação: 832 testes passando, build e build:app ok; Chrome headless com SW ativo, 14 arquivos no cache,
  abre sem o servidor e atualiza pela faixa. Falta aparelho de verdade (PENDENTE.md).

### Depois do piloto: travessia de barco jogável — CONCLUÍDA
- No nível 8, depois do Bruno Ferro, o Seu Jacó leva o jogador num mapa jogável, `barco_travessia`,
  com uma sala por jogador (`barco:<id>`). As margens passam rolando pelos lados.
- Na ponte, por volta dos 12 s, abre a escolha de margem, instituição e guia.
- Aula: 2 ondas no convés. O guia ensina os botões 1, 2 e 3 e o Especial, que começa carregado só ali.
  No fim, o jogador desembarca no cais da margem.
- As regras ficam em `shared/src/game/barco.ts`. O servidor e o offline fazem igual.
- Atalho de dev: `?offline=1&dev_travessia=1`.
- Verificação: 793 testes passando, build ok, e2e ok. O fluxo foi conferido no navegador em tela de
  celular, de ponta a ponta nas duas margens.

## Fase 5: masmorra, plantão, IA de facção e itens — CONCLUÍDA
- Galerias da Usina:
  - andares de 40x40 gerados por semente;
  - salas com ondas, elite, descanso, tesouro e evento;
  - chefe no 5º (Bomba Descontrolada), e sem fundo depois;
  - `dungeon_run` com grupo de até 4;
  - sala `masmorra:<runId>`.
- Plantão:
  - o plantonista é levado do QG e luta pela Doutrina;
  - editor de até 5 cartas;
  - relatório de ganhos.
- Encontros com IA no mapa: patrulhas e treinadores. São co-op na margem dona e contra na rival.
- IA de facção:
  - os líderes são Lazzaro Prati (Raízes, Esquerda, agressivo) e Rolf Halvorsen (PM, Direita,
    defensivo);
  - pontos de controle por influência, com saque máximo de 20%;
  - `world_event` com aviso no mapa;
  - modificadores de margem por energia e poluição.
- Itens:
  - 6 slots, comum e raro;
  - `class_lock`;
  - visual por ala no `lookOf`;
  - benzimento e calibração;
  - 2 únicos funcionando no combate;
  - filtro de raridade.
- Verificação:
  - 771 testes passando;
  - build ok;
  - e2e passou com 200 ms e 2% de perda;
  - `server/test/fase5.test.ts` com o grupo e o plantonista até o chefe;
  - `pronto.test.ts`, em que os 24 arquétipos acertam tudo sem mira.
- Fechamento:
  - README.md;
  - PENDENTE.md reorganizado;
  - tabela do escopo, com os 11 itens prontos, em `decisoes/fase5-masmorra.md`.
- Em aberto:
  - 60 fps e "entende em 1 minuto" só se medem em aparelho e com pessoas;
  - a travessia de barco ainda é uma tela de escolha (resolvido depois: ver acima).

Plano original:
1. Galerias da Usina: masmorra sem fundo, em tempo real, com andares gerados por semente. Este piloto
   tem 5 andares e chefe no 5º. A sala é por grupo, para até 4.
2. Plantão: offline, o personagem fica no QG e luta pela Doutrina quando outro jogador o leva. Há
   editor de Doutrina com até 5 cartas.
3. Encontros com IA no mapa: patrulhas e personagens de IA que lutam junto ou contra.
4. IA de facção:
   - Lazzaro Prati (Esquerda) e Rolf Halvorsen (Direita) decidem a cada ciclo;
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
