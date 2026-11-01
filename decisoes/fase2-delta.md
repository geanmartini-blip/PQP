# Fase 2: decisões e sugestões

## Decisões

### regras

- No Delta, o Seu Jacó acompanha o novato. Toda luta de quem está no estágio 'delta' conta como grupo para o XP (Entity.deltaRookie na simulação, e groupXp com delta:true). Assim o tutorial não trava mesmo sem companheiro na tela. Fora do Delta vale a regra do doc: 2 ou mais personagens, contando IA e plantonistas, +15% por jogador ao vivo a mais e plantonista com metade.
- Teto de nível: no Delta o nível para no 7 até ligar delta_bruno_ferro_derrotado. Derrotar o Bruno (concluir a delta_07) leva direto ao nível 8, completando o XP que faltar, e o estágio vira 'travessia'. Na travessia o teto é 8 até escolher a margem. O XP que passa do teto fica guardado no nível. Na simulação isso é Entity.levelCap, respeitado por grantXp.
- As cadeias delta_1_a_7 e travessia andam sozinhas: ao concluir uma missão, a próxima disponível já entra ativa, e o cadastro já liga a delta_01. O nível das missões do Delta é só recomendação, quem manda são as flags. Fora do Delta a missão aceita até 2 níveis abaixo do nível dela (NIVEL_TOLERANCIA, marcado como SUGESTÃO).
- Objetivos são cumpridos em ordem. O evento conta para o objetivo atual e para os opcionais que faltam, no máximo um objetivo por missão a cada evento. Objetivo de controle já usado, ou de ir até o lugar onde o jogador já está, se completa sozinho quando vira o atual, mas só se ainda estiver zerado.
- Quando a missão pede um controle antes do nível em que ele aparece na tela (por exemplo o modo automático no delta_06, de nível 5, contra o desbloqueio no 6), o objetivo atual libera esse controle (controlesLiberados). Não mexi no nivel das missões.
- Dados do Delta corrigidos, porque contradiziam a decisão da Fase 0 (no Delta não há botões de habilidade nem Especial): - delta_03 perdeu o objetivo 'botão 1'; - delta_04 trocou os botões 2 e 3 e o Especial por 'Picada demais? Toque na poção' (item, liberado no nível 3, marcado como sugestão); - as descrições das flags delta_aprendeu_lutar e delta_aprendeu_habilidades foram ajustadas, e os ids continuam os mesmos.
- Máquina de Visual: só aceita mudar body, skin, face, hair, hair_color, details, palette e shown_visual_tier (appearance.maquinas.muda). Qualquer outro campo é recusado com o texto silhuetaDaAlaFixa. Ela não tem custo nem limite. A máquina do Delta atende todo mundo; o Espelho só atende a Esquerda e a Cabine só a Direita. A Cabine pede aceitouTermos:true, porque mostra os termos antes de abrir. É preciso estar a até 2,5 tiles do marcador (SUGESTÃO).
- Visual liberado: quem já tem ala só pode mostrar trajes de ala (aprendiz em diante). Mostrar o Delta ou o uniforme tiraria a silhueta. O uniforme pede instituição. Só entram tiers do piloto (até o veterano). shown_visual_tier = null mostra o mais alto liberado. A paleta é guardada como id e lookOf converte para índice: as 6 cores no Delta, as paletas da base no uniforme e as 3 paletasTraje na ala.
- Travessia: - a classe vem da instituição; os botões dos níveis 8 a 11 vêm de classes.loadoutPreAla; o slot3_ability é o slot3Padrao da classe; - patente da margem = societies.patentes[0] (membro ou colaborador); patente da instituição = institutions.patentes[0]; - dinheiro de economy.saldoInicial.travessia: a Direita recebe 200 - 80 = 120 de Crédito, já com o desconto automático da cápsula, e score 500; - a paleta passa a ser a oficial da base, e os trocados do Delta ficam; - liga as flags travessia_feita e margem_<lado>, que são exclusivas; - conclui a travessia_08 e tenta aceitar a primeira missão da cadeia da margem e a missão de entrada, se os requisitos estiverem cumpridos.
- Diálogo determinístico: as falas giram em ordem por um contador no registro (counters 'fala:<npc>:<contexto>'), sem RNG. O contexto do Seu Jacó vem da missão ativa (cadastro_ficha, tutorial_remar, tutorial_lutar, tutorial_item, aviso_chopindita_barata, tutorial_reanimar, antes_do_chefe, travessia_partida), depois_do_chefe ou travessia_despedida. Para treinador vale treino se a ala é a dele, entregaMissao se ele tem missão disponível, ou saudacao. A escolha das missões (o 'escolher' do delta_05) aparece como opção em qualquer diálogo.
- Na simulação, falar com um treinador só troca a ala de quem já tem ala, para manter o protótipo do Wesley e do Li Wei. No Delta e antes do nível 12 o treinador só conversa.
- Peles zoeiras: liberadas por contadores no registro. - 'contador': inimigos_derrotados_mapa, que conta os kills fora de masmorra; - 'licao': visitas:<lugar>, que conta a entrada no lugar; - 'masmorra': masmorra:<id>, para o servidor da Fase 5; - também 'nivel' e 'story_flag'. A validação recusa pele zoeira não liberada, e o sorteio nunca usa uma.
- Migração da Fase 1: - jogador com ala ou classe vira 'margem', com margem, classe e instituição tiradas do arquétipo; patente inicial; flags do Bruno, da travessia e da margem; cadeia do Delta concluída; guia nulo; nível pelo menos 12 (ou 8); - jogador 'delta' continua no Delta, com nível até 7 e criado=false para passar pela criação; - aparência em camelCase (hairColor) e paleta numérica são convertidas, e o que for inválido cai no padrão.

### mapa

- Delta, 90x140 in portrait. North is the river toward the bridge. From the spawn outward: the stilt-house village in the middle (y 84-107), the mangrove to the south (y 108-137) for levels 1-3, the port to the north (y 58-83) for levels 3-5, the Capataz's camp (y 31-57) for level 6, and the walled arena with two gates and the jetty with the neighbor's boat (y 2-30) for Bruno Ferro at level 7.
- The cais_do_delta place sits by the village (the level-1 mission goes there). The boss arena is at the far north end, so difficulty climbs with distance. Level-7 mission: run to the dock, then auto-path to the boss.
- The spawn is at the door of the Cadastro do Delta. Seu Jacó and the Espelho do Cadastro are inside, which matches the order of mission delta_01.
- Two seu_jaco markers: one at the registry office and one at the dock. places.json puts him in both places, and the dock missions (levels 1, 7 and 8) ask to talk to him there.
- The fila do posto has no place id, so it is a 'lugar' marker with ref posto_do_delta and id fila_do_posto_do_delta. This avoids changing MapMarker.kind in types.ts.
- No NPC body in the Delta for eco (she is the voice of the pirate radio, broadcasting from Ilha do Farol) or bruno_ferro (in the Delta he is the boss, bruno_ferro_chefe). Every other Delta NPC from npcs.json that is in the pilot appears.
- Band levels: - siri 1, 1, 2; - mosquito 2, 3, 3; - capanga 3, 4, 5, 6. n always stays within the min and max in enemies.json.
- Elites: - siri rapido, level 3, at the bottom of the mangrove; - capanga blindado, level 4, at the flea market (mission delta_05); - Cobrador blindado, level 6, in the camp.
- Normal cobradores for mission delta_06 (tier 'normal', with the escort from enemies.json): two near the posto at level 5 and one by the shed at level 6.
- QG maps, 40x50: the boat arrives at the pier at the bottom (spawn). A street or avenue runs between the 4 institutions, two on each side with the door facing the street. The Máquina de Visual and its attendant are on the plaza, and the QG is at the top.
- QG palettes: - Esquerda uses earth, grass, wood, trees, vegetable plots and totems, with no concrete, asphalt or neon. - Direita uses concrete, asphalt, neon floor, fences, generators, holograms, signs and trash, with no trees.
- The map ASCII was written as run-length text in a scratch file, expanded by a node script and pasted into the .ts files with Write. Every row is checked at exactly 90 or 40 columns.
- Everything new here is marked SUGESTÃO in the file headers and comments: the layout, positions, band size and level, elite affixes, the second Seu Jacó and the new decorations.

### arte

- O chão saiu do Tilemap tile a tile e passou a ser desenhado por blocos de 8x8 tiles (256 px). Cada bloco é feito uma vez pelo renderTerrain e vira uma CanvasTexture com uma Image. Os blocos são gerados quando a câmera chega perto: os visíveis no primeiro quadro, depois um por quadro na margem. Os de fora da tela saem por LRU, com no máximo 40 blocos (uns 10 MB). Cada bloco leva uns 15 ms no Node.
- A transição entre materiais é feita por pixel, com um campo suave para cada nível de prioridade: bilinear com smoothstep entre os centros dos 4 tiles em volta, mais ruído, comparado a um limiar. A ordem de prioridade é funda < rasa < lama < areia < terra < grama/mato. Assim os 47 casos de borda e canto saem arredondados e irregulares sem tabela de autotile. Madeira, concreto, asfalto e neon ficam de borda reta.
- A textura usa um campo de ruído fbm 512x512 periódico, em coordenadas do mundo, mais hash por pixel e pontilhado Bayer entre rampas de 4 a 6 tons. O padrão não se repete de tile em tile. Dois blocos vizinhos emendam pixel a pixel, e isso está testado.
- Mato e grama usam o mesmo chão. A diferença do mato são os tufos animados que balançam na camada de animação. Antes, a mistura ':' e ';' do mapa formava um xadrez de quadrados.
- Água: espuma na beira da terra e uma faixa mais clara logo depois. A rasa avança sobre a funda como uma plataforma, com degradê. A areia fica molhada e mais escura na beira. Brilhos animados de 4 quadros ficam numa camada Tilemap por cima, redesenhados a cada 260 ms, e o neon pulsa do mesmo jeito.
- Palafita: tábuas com fresta, pregos com brilho e nós da madeira. Embaixo do deque aparecem a borda da frente, estacas com espuma no pé e sombra na água. Paredes seguem o estilo Tibia: topo quando há parede ao sul, face da frente quando não há. Por região: taipa e tijolo com trepadeira na Esquerda, vidro e faixa neon na Direita, tábua em pé com telhado de zinco e ferrugem no Delta. O ruído das paredes usa a posição no mundo.
- Árvores grandes de 64x96 (2x3 tiles) em 3 estilos com 2 variações cada, espelhadas pelo hash. São a mata com frutas, a árvore de canteiro da cidade e o mangue com raízes em arco e cipós. A copa é feita de cachos com sombreamento, oclusão e textura de folha. A profundidade vem do y do tronco, então a copa cobre quem passa atrás. As árvores do meio da mata vão para um Blitter por bloco. A sombra das árvores é desenhada no chão do bloco.
- A decoração é escolhida pelo hash do tile. Na grama: flores, pedrinhas e cogumelos. Na areia: conchas, caranguejinhos perto da água e estrelas-do-mar. Na lama: pegadas, tábuas soltas e junco. No deque: tábua solta, rede de pesca, lampião com luz quente e balde. Na água rasa: vitória-régia e junco. O TileMap.deco do mapa também é respeitado: Flor, Concha e Tabua.
- Bonecos: - A cabeça agora é um mapa de pixels ASCII por vista (frente, lado e costas), com highlight, luz, base, sombra e sombra funda, e luz vindo de cima à esquerda. A silhueta continua a do headSpan para não quebrar chapéus e máscaras. - O corpo continua no rig, porque as 108 KB de camadas do artCatalog dependem dele. Cada parte e cada camada de roupa ganham sombreamento em 3 tons pela própria forma (shadeDiff): luz quente em cima e à esquerda, duas faixas de sombra fria embaixo e à direita, e traço de 1 px intacto. Nas bordas internas isso vira o contorno colorido; por fora fica o contorno seletivo escuro (outlineSelective). - Há dobras na cintura da camisa e atrás do joelho da calça. O cabelo é desenhado num buffer próprio e ganha volume, brilho e mechas (shadeHair). Os olhos são 2x2 com brilho e pálpebra; o nariz tem luz e sombra; a tatuagem virou um coração com a faixa do nome. - O balanço de 1 px ao andar já existia (bob nos quadros 1 e 4).
- Sombra no chão: fx_sombra tem 9 larguras em escala 1, sem esticar pixel. A EntityView escolhe a largura por 2,2 raios.
- Bruno Ferro chefe agora é desenhado em resolução nativa com giantLook: 10 px mais alto, 3 px mais largo e fortão, num quadro de 36x60. Antes era o boneco esticado 1,25x por vizinho mais próximo. O siri foi redesenhado com carapaça com volume, olhos de palito com brilho, pernas com junta e pinças com fenda. O mosquito ganhou barriga listrada, olhos compostos e asas com veio. Todo bicho passa pelo sombreamento da silhueta e pelo contorno seletivo.
- Clima, em art/ambient.ts, criado pelo tileLayer e atualizado dentro de cull(), sem mexer no WorldScene. É um retângulo do tamanho da vista em MULTIPLY: dourado no Delta, verde quente na Esquerda, frio na Direita, com troca suave entre regiões. Por cima vão uma vinheta leve de 64x64 com filtro linear e 16 partículas em ADD: vagalumes na Esquerda e no Delta, poeira neon na Direita. A profundidade fica entre os bonecos e as barras.
- Avisos no chão: a borda alterna forte e quente a cada quadro (o quadro anda com o progresso do aviso) e o tracejado de dentro gira, então o aviso pulsa sem código por quadro. Os números de dano já tinham contorno; agora a parte de baixo da letra é mais escura e o número tingido ganha volume.
- A GalleryScene ganhou seções novas: - todas as opções de aparência: 5 corpos, 15 peles, 16 rostos, 20 cortes, 12 cores de cabelo, os detalhes e as 6 cores do traje do Delta; - 3 terrenos de demonstração (Delta, Esquerda e Direita) com árvores e a camada animada; - as 6 árvores.
- Fora do pedido: o shadeDiff, os olhos e o contorno seletivo valem para todos os 24 arquétipos, treinadores e NPCs, porque passam pelo mesmo caminho do boneco. Uniformes, treinadores, peao_brabo e idol melhoraram por esse sombreamento geral, não por redesenho camada a camada.

### servidor

- Salas: uma por mapa, todas com o nome 'mundo' e a opção mapId (filterBy). Foi o caminho mais simples no Colyseus 0.18. O cliente só passa { mapId } no joinOrCreate e reage a 'trocar_sala'. A sala do Delta é criada primeiro, então quem entra sem mapId cai nela.
- O mapa do personagem sai do registro. Estágios delta e travessia (e quem ainda não foi criado) ficam no START_MAP 'delta'. Margem vai para ARRIVAL_MAP_BY_SIDE[side]. Nenhuma posição ou mapa é gravado no piloto: quem volta nasce no spawn do mapa do estágio.
- A sala prototipo_delta virou sandbox. Tem o personagem template da Fase 1 (hello.archetypeId, troca de ala com Wesley e Li Wei), não usa o Store e não roda regras de jogo. Os testes de combate e rede e o combate do e2e rodam nela. Quem entra lá sem pedir mapId é mandado para o mapa do registro.
- Sem personagem criado, o servidor não manda welcome nem cria entidade. Manda 'perfil' com criado=false e espera 'criar_personagem'. O welcome vem depois, com o token gerado, se o hello veio sem token.
- Divisão da fonte de verdade: o registro manda em nível, XP, teto, estágio, missões, flags e visual. A entidade manda em moedas, inventário, poções, Doutrina e automático. Antes de cada regra, os campos da entidade são copiados para o registro (pull). Depois, o registro é copiado para a entidade (push): kit via setArchetype, relevel, xp, levelCap, deltaRookie, look, moedas.
- Eventos da simulação que alimentam onGameEvent: - xp vai para gainXp; - level; - death de inimigo dá kill para quem participou: bateu nele nos últimos 30 s, estava a até 10 tiles ou deu o golpe; o contexto de grupo vai junto; - cast de um botão vira ability mais o controle habilidade, especial ou item; - loot_pick vira pickup (moeda, item ou recurso) mais o controle saque; material que é um Resource vai para rec.resources; - revive feito por um jogador vira o controle reanimar.
- Controles detectados pelo servidor: o joystick apertado vira andar_joystick, o ir_ate vira tocar_no_chao, o alvo vira trocar_alvo, auto on vira modo_automatico, e travar um inimigo pela primeira vez vira alvo_automatico. auto_caminho e desviar_aviso vêm do cliente pelo tutorial_passo.
- Lugares, regiões e interação são conferidos a cada 5 ticks. Conta como arrive a até 4 tiles de um marcador 'lugar'; sai depois de 5,5 tiles. Regiões viram arrive {regionId} quando mudam. Um marcador com params.interagir, como a fila do posto, dispara interact a até 1,8 tile, com a ação tirada do objetivo ativo. Os números são SUGESTÃO em config.ts.
- XP em grupo no Delta: além do deltaRookie da simulação, o Seu Jacó nasce como companheiro de IA (spawnAlly 'seu_jaco', kit delta, no nível do jogador, no mesmo grupo) para quem não está na margem. Opção CoreOptions.jaco, ligada por padrão só na sala do Delta.
- No objetivo 'Seu Jacó caiu!' (usar_controle reanimar), o Seu Jacó companheiro cai ao lado do jogador, para o objetivo poder ser cumprido. Se ninguém levantá-lo, ele cai de novo depois de 15 s. Marcado como SUGESTÃO.
- itensParaRolar: a tabela de saque é rolada com w.rng e o item cai no chão, só para o dono, e a coleta automática pega. Sempre cai 1 item por quantidade. Único e set viram raro no piloto (SUGESTÃO).
- Travessia: só sai perto do Seu Jacó ou a até 4 tiles da saida_travessia (SUGESTÃO). O servidor grava antes de mandar trocar_sala, tira o personagem e o companheiro deste mapa, e a sala da margem lê o registro do Store.
- Gravação: o registro é salvo a cada mudança, e o Store faz o debounce (FileStore 1 s, Supabase 2 s). Também salva a cada 10 s e ao sair. Sem Store, o núcleo guarda um cache em memória.
- Supabase: o esquema continua com data jsonb, agora guardando o PlayerRecord v2. A 0002 só acrescenta colunas geradas (record_version, stage, side, level, criado) e um índice.
- Testes da Fase 1 que dependiam do Store migraram para o fluxo real no Delta: o de progresso depois de reiniciar foi para fase2.test.ts, e o da Doutrina gravada mudou em guard.test.ts. room.test e bot/run.ts agora entram na sandbox com { mapId: 'prototipo_delta' }.

### cliente

- A interface da Fase 2 (criação, máquina, diálogo, travessia, rastreador, dicas, avisos) é DOM por cima do canvas, e não objetos do Phaser. Motivos: campo de nome nativo, listas que rolam, botões grandes e menos código. A arte continua vindo da ArtApi, porque a prévia e o retrato copiam quadros das texturas do Phaser para um <canvas>.
- Com uma tela cheia aberta, o HUD do Phaser ignora toques. Os toques cujo alvo não é o canvas também são ignorados: o Phaser recebe toques de fora do canvas pelos listeners de window. Nesse caso o teclado do Phaser fica desligado, com disableGlobalCapture, para o espaço funcionar no campo de nome.
- index.html: o preventDefault de touchmove agora pula elementos dentro de '.rola', para as listas da interface rolarem.
- O modo de conversa (mensagem 'falar') vale quando o servidor manda perfil e não há ?ala=. Com ?ala= continua o comando 'interagir', que troca a ala com Wesley e Li Wei, e o botão ALA só aparece nesse modo.
- Os controles detectados no cliente vão por tutorial_passo: andar_joystick e tocar_no_chao com o passo 'andar', trocar_alvo com 'alvo', auto_caminho com 'botao', e modo_automatico. Cada um vai uma vez por sessão. O servidor local também detecta, pelos comandos e pela simulação, estes controles: habilidade, especial, item, modo_automatico, trocar_alvo, tocar_no_chao, alvo_automatico, saque, desviar_aviso e reanimar.
- Dicas: com perfil, as dicas do protótipo e a seta do 'rumo' somem. A dica vem de TUTORIAL_STEPS (shared) e só aparece no Delta. A seta da borda aponta para o alvo da missão, e tocar nela liga o auto-caminho, como o rastreador.
- Botões liberados: o de item só aparece com o controle 'item' em controlesLiberados, e o AUTO só com 'modo_automatico' (ou se já estiver ligado). Sem perfil (modo de teste), tudo fica liberado.
- Máquina de Visual: aparece um botão quando o jogador está a até 2,5 tiles de um marcador 'maquina_visual' que ele pode usar. A máquina também abre pela opção 'maquina:<id>' do atendente. Se o 'Pronto' for apertado longe do espelho, o personagem anda até ele e a mudança é mandada ao chegar, com até 10 s. A Cabine Neon mostra os termosDeUso de institutions.json antes de abrir.
- Opções do diálogo: 'tchau' fecha na hora e avisa o servidor. As demais mandam dialogo_opcao e fecham a caixa. O que o servidor abrir em seguida (máquina ou travessia) chega por dialogo.abrir ou por travessia_opcoes. Um diálogo sem fala e sem opções não aparece.
- Banner de nível: sai do aumento de nível no perfil. Os desbloqueios que chegam por aviso entram no banner. Desbloqueio de nível já alcançado (cadastro, travessia) vira aviso 'Novo: ...'.
- Servidor local, decisões que só valem no modo offline: - chegada num lugar: marcador 'lugar' a até 3 tiles, conferido a cada 5 ticks; - alvo de 'interagir': chegar a até 1,6 tile do marcador cujo id (ou params.interagir) é o alvo do objetivo atual; - saída da travessia a até 1,6 tile: com canCross, manda arrive {regionId, deBarco} e travessia_opcoes; - 'reanimar' do tutorial: 3 s ao lado do Seu Jacó; - 'desviar_aviso': o aviso no chão termina perto do jogador sem ele dentro; - itens de tabela da recompensa: um comum ou raro aleatório, da margem e até o nível + 2; - mapa ao carregar: Delta, ou o QG da margem para quem já atravessou; - kill: o cache do tick anterior guarda defId e tier, porque o inimigo morto sai do mundo no mesmo step; - 'alvo' e 'level' dos inimigos: o 'level' entra para inimigo e chefe, e não para bando, igual ao spawner do servidor.
- O HUD mostra o nome do perfil em vez do nome da entidade, porque o snapshot só manda o nome quando a entidade aparece. O aviso 'Nível N!' do WorldScene some quando há perfil (o banner substitui). O BootScene pré-gera as folhas de START_MAP (ou do protótipo com ?ala=).

### verificação

- Quando comecei, nada estava quebrado. typecheck, os 500 testes, o build e o e2e (200 ms de atraso e 2% de perda) já passavam, então não precisei consertar a integração entre a arte nova e o cliente. Abri o cliente em ?offline=1 numa tela de 375x812: a criação de personagem renderiza com a arte nova e, depois de tocar em Pronto, entra no Delta com o rastreador ('Faça o cadastro com o Seu Jacó') e a dica do joystick. Não houve erro de JS no console.
- O teste ponta a ponta passa pelo GameServerCore, com o Harness a 200 ms de RTT e 2% de perda. Ele cria o personagem e faz as missões delta_01 a delta_07 com eventos reais do servidor: conversa, Máquina de Visual, joystick, comando ir_ate, troca de alvo, saque, poção, modo automático, fila do posto, levantar o Seu Jacó caído e lutas pelo alvo automático. Depois vem o Bruno Ferro (o teste exige pelo menos um aviso no chão, telegraph), o nível 8, a travessia aberta pelo diálogo com o Seu Jacó, a troca de sala para qg_esquerda e a chegada ao QG. No QG o teste confere o registro gravado (margem, instituição, classe, guia, nível 8 e flags), o ponto de nascimento e o traje 'base' no snapshot.
- Atalhos de teste, todos comentados: teleporte do jogador e do Seu Jacó; vida dos inimigos cortada para 1, e a do Bruno para 400 para dar tempo de ele soltar o aviso no chão; vida do jogador recarregada durante as lutas; auto_caminho enviado por tutorial_passo, como o cliente faz; 3 saques criados com spawnLoot; e XP dado para chegar ao 7, porque só os inimigos pedidos pelas missões, sem os bandos do mapa, levam o novato ao nível 6.
- Comportamento confirmado e registrado como esperado: depois do Bruno Ferro, o levelCap fica em 8 enquanto o estágio é 'travessia' e só some na margem. Com XP sobrando, o nível não passa do 7 antes do chefe. Cada missão com objetivo de poção gasta uma poção (item_count cai 2 entre as missões 4 e 5).
- Mantive os testes da Fase 2 que já estavam no arquivo e acrescentei um describe novo antes de 'reconexão'.
- Medi a geração de arte no Node: cerca de 30 ms por folha de boneco no regime normal, 270 ms na primeira (aquecimento do JIT), 7 ms o siri e 63 ms o Bruno Ferro. No painel o carregamento parecia levar 2 s por folha, mas era o painel do navegador limitado a 1 fps no requestAnimationFrame, e não o jogo. Por isso não mudei a arte.
- Parei os servidores de preview, o meu (cliente-dist, porta 4190) e o cliente-galeria (porta 5180) que outro agente tinha deixado aberto. Limpei o localStorage de teste e apaguei o arquivo de medição temporário. Não ficou nenhum processo node rodando.

## Sugestões (inventado, não está nos docs)

### regras

- // SUGESTÃO: VISUAL_MACHINE_RADIUS = 2,5 tiles do marcador da máquina.
- // SUGESTÃO: NIVEL_TOLERANCIA = 2 níveis abaixo do nível da missão, fora do Delta.
- // SUGESTÃO: os 6 textos curtos do tutorial do primeiro minuto (TUTORIAL_STEPS). - 'Arraste o polegar para andar' - 'A marca no chão é o seu alvo' - 'Chegue perto: o ataque é sozinho' - 'Toque na missão para ir sozinho' - 'Toque no Seu Jacó para falar' - 'Termine a primeira missão'
- // SUGESTÃO: sorteio da criação com 0 a 2 detalhes.
- // SUGESTÃO: START_ITEM_COUNT = 3 poções no registro novo (igual ao START_POTIONS da simulação).
- // SUGESTÃO: textos de botão e de aviso que não estão nos docs: - 'Até mais' - 'Embarcar na travessia' - 'Aceitar: <missão>' - 'Missão: X' e 'Missão concluída: X' - 'Nível N!' - 'O Seu Jacó está esperando no cais: hora da travessia.' - 'Primeiro, o Bruno Ferro. O barco não sai com dívida no cais.' - 'Pele liberada: X' - 'Bem-vindo à <instituição>. Patente: ...'
- missions.json delta_04: novo objetivo 'Picada demais? Toque na poção', marcado com sugestao:true. A descrição do objetivo dos mosquitos virou 'Espante a nuvem. Ande batendo: o ataque é sozinho' (a missão inteira já era sugestao:true).
- story_flags.json: as descrições novas de delta_aprendeu_lutar (marcada com sugestaoCampos ['descricao']) e de delta_aprendeu_habilidades (que já era sugestao:true).

### mapa

- Server and offline mode: when a 'bando' marker has params.level, pass it to spawnPack ({ level }). Spawner.populate (packages/server/src/spawner.ts) and LocalServer.populate (packages/client/src/net/localServer.ts) ignore it today, so Delta bands spawn at the enemy's base level. Markers of kind 'inimigo' already use level.
- Mission engine: resolve 'ir_ate' and 'visitar_lugar' by the 'lugar' marker with ref = place, 'falar' by the 'npc' marker with ref = npc (prefer params.lugar equal to the mission's lugar when there are two Seu Jacós), and 'interagir' by the marker id = alvo.
- Server: maybe spawn only one Seu Jacó, depending on the active mission (cadastro vs dock), or keep both.
- Art: draw deco_4 to deco_14 (boat, net, crate, lantern, reed, awning, vegetable plot, totem, hologram, neon sign, trash) in client/src/art/tiles.ts.
- Crossing: when the 'saida_travessia' marker is used, change to ARRIVAL_MAP_BY_SIDE[side] and spawn the player at that map's spawn_jogador. A new character starts on START_MAP ('delta').
- Phase 3: add a 'saida' marker from the QGs back to the bridge, and the base trainers inside each institution.

### arte

- SUGESTÃO: as paletas do terreno, as larguras e limiares de transição, os estilos por região (REGION_STYLE), a frequência e a escolha da decoração (cogumelo, balde de isca, caranguejinho, rede, lampião), as cores da luz ambiente, a força da vinheta, o número de partículas e o tamanho dos blocos (8 tiles, até 40 na memória) não estão nos docs. Estão marcados no código.
- SUGESTÃO: a sombra do boneco com 2,2 raios de largura, o Bruno Ferro com +10 px de altura e +3 de largura, as cores do siri e do mosquito, a cor de hue-shift da luz (#fff2c8) e da sombra (#2a1e46) e os 260 ms de animação do mato.
- Para ganhar mais desempenho no celular: gerar os blocos de terreno num Web Worker, já que renderTerrain é puro e só devolve um buffer, para tirar os 15 ms do quadro em celular fraco.
- Próxima rodada de arte: - redesenhar à mão, como mapa ASCII, o tronco e os braços de cada quadro, o que exige adaptar as camadas do layers.ts; - criar quadros de copa balançando; - ligar o fx_vagalume e as bolhas da lama ao estado da missão.

### servidor

- config.ts tem números SUGESTÃO novos: PLACE_RADIUS_TILES 4, PLACE_LEAVE_RADIUS_TILES 5,5, INTERACT_MARKER_RADIUS_TILES 1,8, TRAVESSIA_REACH_TILES 4, AREA_CHECK_TICKS 5 e JACO_DOWN_COOLDOWN_MS 15000.
- Falas novas, SUGESTÃO: - 'Chegue perto de uma Máquina de Visual.' - 'Chegue mais perto para conversar.' - 'Vá até o cais: o Seu Jacó leva no barco.' - 'Personagem já cadastrado. Para mudar o visual, use a Máquina de Visual.' (a mesma das regras)
- O Seu Jacó companheiro no Delta e a queda dele, feita por script, no objetivo de reanimar não estão nos docs.
- As recompensas de missão dão sempre 1 item por quantidade da tabela.
- Nome do robô do e2e: 'Robo de Teste'.

### cliente

- Rótulos das abas (Corpo, Pele, Rosto, Cabelo, Cor, Detalhes, Camiseta/Traje, Visual) e os nomes curtos dos visuais por nível.
- Textos de apoio: - 'Monte o seu boneco. O Seu Jacó não repara.'; - 'Grátis e sem limite. A silhueta da ala fica.'; - placeholder 'Seu nome'; - 'Escreva o seu nome.'; - botão 'ACEITO' da Cabine Neon.
- Textos da travessia: - 'De que margem você vai ser?' (pergunta de missions.json); - 'Onde você vai entrar?'; - 'Escolha a sua IA de bolso' e 'Escolha o seu espírito guia'; - 'Tudo certo?'; - 'Não tem volta no piloto: a margem é para valer.'; - 'Agora não' e 'Atravessar'.
- Avisos: - '+N XP' com 'Luta em grupo: o Seu Jacó está junto' ou 'Luta em grupo (+15% por jogador a mais)'; - 'Visual novo salvo!'; - 'Indo até o espelho...'; - 'Esse objetivo é em outro lugar.'; - 'Sem resposta do servidor. Tente de novo.'; - 'toque para continuar'.
- Números: - avisos ficam 3,2 s, com no máximo 3 na tela; - banner de nível dura 3 s; - XP somado em janelas de 1,2 s; - 45 letras por segundo na fala; - prévia gira a cada 1,4 s, andando a 8 quadros por segundo; - espera de 8 s pela resposta do servidor; - 10 s andando até a máquina.
- Servidor local: - raio de lugar de 3 tiles; - raio de interagir e de saída de 1,6 tile; - lugares conferidos a cada 5 ticks; - 'reanimar' do tutorial com 3 s a 1,8 tile do Seu Jacó; - item de recompensa sorteado da margem e até o nível + 2.
- Sugestão de produto: mostrar um botão de 'interagir' perto de alvos como a fila do posto, em vez de contar só por proximidade. E deixar o rastreador abrir a lista de missões quando houver mais de uma ativa.

### final

- // SUGESTÃO: criar a região usina_da_ponte, ou uma cena curta de barco, para cumprir o objetivo 'ir_ate regiao usina_da_ponte deBarco' da travessia_08. Hoje esse objetivo nunca se completa no mapa do Delta; quem fecha a missão é a applyTravessia.
- // SUGESTÃO: conferir a curva de XP do Delta. Com os bandos do mapa o jogador provavelmente chega ao 7, mas só com os inimigos das missões fica no 6. Um teste com os bandos de verdade, usando content: true, fecharia a dúvida.
- // SUGESTÃO: o servidor (core.ts) não detecta o controle 'desviar_aviso', só o localServer detecta. Como ele só aparece em 'ensina', não trava missão, mas o tutorial do servidor nunca o marca.
- // SUGESTÃO: dar um retorno visual quando a poção é recusada por recarga. Hoje o comando 'item' falha em silêncio.

## Em aberto

- Fim de fase pelo CLAUDE.md: falta o commit no git (não pude fazer), atualizar o PROGRESS.md com o que ficou pronto e o próximo passo, e registrar as decisões da Fase 2 no DECISIONS.md (não posso editar esses arquivos).
- A travessia_08 tem o objetivo 'Atravesse até a ponte', do tipo ir_ate na região usina_da_ponte de barco, que não existe no mapa do Delta. Não há travessia de barco jogável: o jogador escolhe na tela e é mandado direto para o QG.
- O nível 7 antes do chefe não foi verificado só com o jogo normal. No teste, as missões e os inimigos pedidos deixam o jogador no 6. Falta medir com os bandos do mapa se o Delta leva naturalmente ao 7.
- Os 60 fps num celular médio não foram medidos: o painel do navegador estava limitado a 1 fps. A arte gera cerca de 30 ms por folha nova no PC (270 ms na primeira), o que pode travar um pouco no celular quando aparece um tipo novo de entidade fora da pré-geração do BootScene.
- Não verifiquei o QG da Direita no navegador, que vem de um registro salvo por outro agente no localStorage. Na única captura, o boneco do jogador não aparecia, a parte de baixo da tela estava preta e os botões e o joystick do HUD não apareciam. Tenho só essa captura, sem diagnóstico.
- Detalhe de interface: no HUD, o nome do personagem sai cortado em maiúsculas ('TESTE FASE.' para 'Teste Fase Dois').
- O critério 'quem nunca jogou entende os controles em 1 minuto' não foi testado com pessoas. Só confirmei que a dica 'Arraste o polegar para andar' e o rastreador aparecem.
- Fora do escopo da Fase 2, mas ainda em aberto da Fase 1: o balanceamento, com 10 arquétipos acima de 55% no simulador.

