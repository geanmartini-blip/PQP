# Fase 1: decisões e sugestões

Registro completo do protótipo de combate. O resumo fica em DECISIONS.md.

## Decisões

### simulação

- w.tick começa em 0 e step() soma 1 antes de processar, então os comandos aplicados entre dois steps usam o tick do último step.
- Todos os alcances e raios são medidos de borda a borda: distância − raio de quem age − raio do alvo. As áreas exigem linha de visão do centro (ou da ponta do cone) até cada alvo.
- Compensação de atraso: a tolerância HIT_TOLERANCE_TILES só vale para comando com ctx.rewindTicks. A conta usa a posição atual de quem lança e a posição histórica do alvo, com rewind de no máximo 5 ticks (250 ms). Passando, a travada acerta o alvo onde ele está agora (projétil teleguiado).
- Fora do alcance (travada, area_alvo e campo com alcance), castAbility devolve true e cria um pendingCast de 3 s. O personagem anda sozinho até o alcance quando o joystick está parado; custo, recarga e carga do Especial só são cobrados quando a habilidade sai. Joystick não cancela o pendente.
- Recarga global de 1 s vale para os botões 1 a 3 e para o Especial. Não vale para o básico nem para o item. O item gasta 1 consumível quando sai.
- Recarga: o contrato guarda o tick de 'pronta'. A cada tick ele é corrigido por (taxa − 1), com taxa = fator da Velocidade × (1 + (speed + cooldownSpeed)/100). A recarga efetiva fica cooldown ÷ taxa: o Peão (Velocidade 7) leva cerca de 8,8 s para os 8 s do Pancadão.
- Carga do Especial: os pontos do balance vão para um banco (specialBank). A cada tick sai min(banco, teto/20); com atividade nos últimos 3 s, sai no mínimo piso/20. Teto e piso são multiplicados por cargaS/60. specialCharge multiplica os pontos, o teto e o piso. Resultado: só batendo enche em cerca de 89 s, e com pontos de sobra nunca antes de 45,5 s.
- Controle: a imunidade é marcada na aplicação (fim do controle + 4 s), então protege durante o controle e nos 4 s seguintes. Provocar não dá nem respeita imunidade. Bônus de ccDuration tem teto em controleComBonusMaxMs, e a duração base dos dados nunca é cortada. ccResist reduz a duração. Atordoar, derrubar e silenciar cancelam a carga curta.
- Chefe: todo controle, inclusive provocar, vira lentidão de controleViraLentidaoPct do inimigo (padrão chefeLentidaoPct) pela mesma duração, e solta cc_slow.
- Escudo: reaplicado pela mesma fonte e habilidade, só renova o fim. Escudo quebrado fica com valor 0 até expirar, para o campo não recarregá-lo (regra do Xale). seguraProjeteis absorve qualquer dano; o sinal fica guardado em data para os talentos. devolvePct devolve a parte absorvida.
- Lentidões não somam: vale a mais forte, com teto de 90%. Reduções de dano somam até 80%. Marcas somam: valem para o time de quem marcou, ou só para quem marcou quando soDoLancador. O dano final é arredondado para inteiro, com mínimo 1.
- Dano contínuo: o primeiro golpe sai 1 tickMs depois de aplicar e o último cai no próprio endTick (6 s com tick de 1 s dão 6 golpes). Não tem crítico. pulaAoMorrer passa a duração que sobrou ao inimigo mais perto dentro de pulaAlcance. pulaEntreProximos espalha para um vizinho a cada golpe.
- Rodeio (questão em aberto da Fase 0): numa travada, o empurrão com raio próprio não pega o alvo travado, só quem está em volta dele. O atordoar da Voadora continua pegando o alvo.
- Não são empurrados nem puxados: chefe, inimigo imóvel, afixo Blindado (imune_empurrao), 'imune' com aEmpurrao (Yokozuna), invocações e NPCs neutros.
- Avanço e salto são instantâneos e param encostados no alvo; o cliente anima. O salto aterrissa direto se o destino estiver livre. O avanço comum anda com colisão e guarda o caminho para o seletor inimigos_caminho, num corredor de 0,5 tile além do raio. Tiro que atravessa (perfura) usa a reta de quem lança até o fim do alcance.
- Aviso no chão: a área fica presa onde foi lançada. O efeito 'alvo' só pega o alvo se ele continuou dentro. Se quem lançou morre antes, o aviso é cancelado; a exceção é o afixo Explode ao Morrer, que guarda a força no próprio aviso.
- Campo: zona no chão com o primeiro tick na hora. Com segueLancador acompanha quem lançou; num cone, vira sozinho para o alvo a cada tick. Some quando quem lançou morre ou sai do mundo.
- Caído: vale para jogadores e companheiros de IA com loadout. Fica 30 s no chão, perde estados e alvo, e nenhum inimigo mira nele. Um aliado de pé a até levantarRaioTiles por 3 s o levanta com 30%. Ao expirar, volta para spawnX/spawnY com vida e recurso cheios e perde XP pela regra progression.morte.
- XP: participa quem bateu no inimigo nos últimos 30 s ou estava a até 10 tiles quando ele caiu. É grupo com 2 ou mais participantes; companheiros de IA contam, mas só jogadores recebem XP. Bônus de +15% por jogador ao vivo a mais; plantonista ganha ×0,5 e não conta no bônus. Saque é individual (forPlayerId) e cai também em luta solo.
- Tabela de saque: o motor tenta primeiro a variante da masmorra (loot_*_galerias) e da região (loot_*_delta) e só depois a tabela base do inimigo. Assim os inimigos do Delta usam loot_normal_delta, loot_elite_delta e loot_chefe_delta.
- Coleta: raio de balance.combate.raioColetaSaqueTiles (1,5 + raio do corpo). Moeda vai para semente/credito; consumível igual ao do botão soma em itemCount; o resto vai para inventory.
- A regeneração fora de combate (4%/s depois de 5 s) mexe direto na vida, sem evento 'heal' e sem contar como 'curou' para o Especial. Sem isso, o Especial carregava parado.
- Básico automático no alvo travado, no alcance e à vista, inclusive andando, para jogadores, companheiros e inimigos. Transformado (Fim da Paz e outras), o básico vira cone, em volta ou golpe mais forte. tirosExtras dispara golpes a mais. Confuso ou tonto, bate num alvo aleatório perto, de qualquer time.
- Turnê Mundial (interpretação): durante o show, cada Fanchant dá o reforço ao grupo inteiro e zera as recargas do grupo, menos o próprio Fanchant de quem lançou, para ele não virar spam a cada 1 s.
- Desconstruído: enquanto dura, cada golpe recebido cura o aliado mais ferido a até 8 tiles (o próprio Peão entra) em 5% da vida máxima desse aliado, e o bordão sai como 'say'.
- Para separar quem leva dano à distância (Muralha de Escudos), ranged = habilidade travada, area_alvo ou campo com alcance efetivo de 2 ou mais.
- applyCommand('interagir') com qualquer treinador troca o jogador para a ala desse treinador. Só vale para jogador (kind 'player') e a até 2,5 tiles mais os raios.
- Delta: o básico é basico_combatente (balance.personagemDelta.ataqueBasico), sem botões, sem Especial e sem recurso. Acima do nível 7 sem escolher classe, a fórmula linear do balance continua valendo.
- applyKit troca stats.pct inteiro a cada troca de arquétipo ou de nível. Bônus fixos de item, talento e guia precisam ser reaplicados depois por quem cuida das regras.
- IA, Doutrina e cliente leem o estado de inimigos e invocações em entity.ai, com tipos EnemyAi e SummonAi exportados de spawn.ts. Isso evitou mexer no contrato além das adições.
- hud.ts (hudSnapshot e entityFlags) é ajudante opcional para o servidor. Usa as mesmas regras do HUD (mv, canMove, recargas em ticks, special 0..1000).

### mapa

- O retorno de findPath não inclui a partida e termina no destino exato: o ponto tocado quando o círculo cabe ali, senão o centro da célula livre escolhida. Mesma célula devolve [destino].
- Custo do A* = distância ÷ velocidade do tile. O auto-caminho prefere contornar lama e água rasa quando o desvio é curto. Na suavização, um atalho não pode entrar em tile mais lento que o pior tile do trecho original, para não desfazer esse desvio.
- Para destino sólido ou apertado demais para o raio, a busca procura num quadrado de até 6 tiles a célula andável mais perto do ponto tocado; no empate, fica a mais perto de quem anda. Se essa célula não for alcançável, findPath devolve null (destino fechado).
- Uma célula é andável quando não é sólida e circleFree(centro, raio) é verdadeiro. O raio usado é no mínimo 0,001, porque circleFree com raio 0 não enxerga o tile sólido onde o ponto está. A célula de partida vale sempre, mesmo se o corpo estiver encostado na parede.
- Limite de 4000 nós expandidos. No protótipo, o pior caso (cais até o chefe) expande 720 nós e leva cerca de 0,37 ms.
- O cache do registro é compartilhado e somente leitura. buildMap(id) dá uma cópia mutável para portas e testes.
- O mapa ASCII é desenhado de baixo para cima: palafitas e cais no sul (o Delta fica rio abaixo), mangue com 2 bandos de siri, acampamento do Capataz com 2 bandos de capanga e o Cobrador, um muro com dois portões (caminhos alternativos) e a arena do chefe no norte. A arena é uma clareira de cerca de 40 x 20 tiles.
- Inimigos dos bandos: siri_do_mangue e capanga_do_capataz, os dois tier normal e com região delta no enemies.json. A elite é o cobrador_do_capataz, que já é tier elite nos dados, com o afixo blindado, que está em afixosPossiveis dele.
- Acrescentei Seu Jacó (npc_seu_jaco, dentro do cadastro) e o marcador lugar de palafitas_do_delta, além do cais pedido, porque os dois existem em npcs.json e places.json.
- Cada caractere de marcador só pode aparecer uma vez no mapa, e o conversor confere isso. Marcadores repetidos com posição livre vão em extraMarkers.

### arte

- Nenhum contrato foi alterado: contract.ts, map/types.ts, sim/types.ts e protocol.ts seguem iguais. Tudo o que acrescentei é exportação nova em arquivos meus (index.ts e módulos puros).
- Uso `import * as Phaser from 'phaser'`. O build ESM do Phaser 3.90 (dist/phaser.esm.js, o campo `module` do pacote) não tem export default, então `import Phaser from 'phaser'` pode quebrar no Vite. O contract.ts usa `import type`, que continua valendo.
- O desenho é feito num Pix puro (Uint8ClampedArray) e sobe como CanvasTexture, via createCanvas, putImageData e tex.add de cada quadro, com filtro NEAREST. Testei num navegador com um harness Vite de rascunho: 286 texturas, 4.985 animações, fonte bitmap e quadros de cone e de tile funcionando, sem erro no console, cerca de 15 ms por folha de boneco e 0,26 ms de CPU por quadro.
- Layout da folha de animação: uma linha por (anim, dir), até 6 colunas, com quadros nomeados `${anim}_${dir}_${i}` como manda o contrato. São 27 quadros por direção, 108 por boneco.
- O boneco é montado num esqueleto paramétrico (rig.ts): cabeça de 16x15 px, membros como cápsulas e pés na linha 46, para o contorno de baixo caber no quadro. A grade 0-19/20-33/34-43/44-47 de outfits.gradeBoneco é seguida com 1 px de folga. Os corpos usam offsetCabecaPx e larguraExtraPx de appearance.json; fortão tem braço grosso, barrigudo tem barriga, magrelo tem braço fino.
- As camadas são desenhadas em fatias de profundidade (under, back, farArm, legs, torso, arms, head, front), na ordem de ordemDesenho de outfits.json. Assim a manga fica sobre o braço da frente de lado e a mochila fica atrás de frente. De costas, a fatia 'costas' vem por último, como pede a regra do doc. A exceção é liso_comprido, que de costas cobre a estampa (a piada do doc).
- O contorno escuro de 1 px é aplicado depois de compor as camadas opacas. Camadas translúcidas (espíritos, hologramas, touro, palco, aura) ficam em buffers separados, atrás ou na frente, e não ganham contorno.
- Todas as 254 chaves do artCatalog têm desenhista próprio em layers.ts (há um teste para isso); as medidas seguem as descrições. Também desenhei adereços fora do catálogo para NPCs e inimigos humanos em props.ts.
- Tiers virada, mestre e lendário (fora do piloto, sem camadas) caem no veterano. O visual de mestre dos treinadores é o veterano da ala mais os extras do doc: o Wesley ganha bigode e o touro-espírito translúcido; a Li Wei ganha o palco holográfico.
- Itens do CharacterLook: com `art` que existe no catálogo, a peça troca a camada daquela parte. Sem `art`, a raridade comum usa a camada do aprendiz e as outras usam a do veterano. A raridade aparece como uma pedrinha de cor (raro azul, único dourado, set roxo), e o adorno raro do Peão Brabo liga o touro-espírito.
- As expressões dos rostos (briga, vitória, derrota) são derivadas do rosto-base: briga no básico, na habilidade e no Especial; vitória e derrota nas animações de mesmo nome. A atendente imortal mantém o sorriso fixo mesmo na derrota.
- Animações: o Especial faz um giro pelas 4 vistas, com pulo e anel de aura; a habilidade tem brilho nas mãos (folhas verdes na Esquerda, faíscas de neon na Direita); a derrota agacha e tomba a cabeça. A cadeira de escritório desliza sentada no andar, e a rede aparece no parado.
- Inimigos: siri, mosquito, cão de guarda, cobra, drone, turbina, enguia e bomba têm desenho próprio nas 4 direções. Capanga, cobrador, contrabandista, fiscal, mercenário e Bruno Ferro usam o boneco em camadas. O chefe humano sai 1,25x; um inimigo comum pedido como chefe sai até 1,5x, sempre até 64x64. A elite ganha contorno laranja mais aura translúcida e pulsante; o chefe ganha vermelho.
- Invocações: desenho próprio por lado onde o doc diferencia (totem ou robô, cópia como máscara vazia ou holograma, manifestação do guia como espírito ou holograma). Quando não há desenho, um genérico pelo behavior de summons.json.
- Tileset: quadros de 32x32 para os 19 valores de Tile, com 1 a 4 variações; água rasa, água funda e piso neon são animados (a variante é o quadro). Parede, porta, cerca, árvore e máquina mudam de estilo por região: taipa/madeira na Esquerda, concreto/neon na Direita, palafita no Delta. A copa grande sai como quadro separado para desenhar por cima. A decoração usa os nomes de Deco de map/maps/deco.ts e tem reserva genérica.
- Os cones de aviso vêm prontos em 60, 70, 90 e 120 graus (os dados usam 60, 70 e 90); coneKeyFor escolhe o mais próximo.
- A tatuagem com o nome errado usa a primeira entrada de appearance.tatuagemNomesErrados, porque o CharacterLook não diz qual nome foi escolhido.
- Não há nenhum Math.random nem Date: as texturas de tile usam um prng semeado por string, e tudo é determinístico (há um teste de determinismo).

### IA e simulador

- IA e Doutrina guardam a memória em entity.ai, nas chaves 'mente' (inimigo), 'doutrina' e 'caminho'. Nenhum campo do contrato mudou. Nenhuma das mudanças em contrato: types.ts, map, rng, protocol e art ficaram intactos.
- Os ganchos para o spawner são o packId lido de e.ai.packId e a função spawnPack.
- Estados novos, só por código: 'afixo:<id>', 'voltando' e 'imune' com abilityId 'ia:voltando'.
- Chefe provocado: o motor transforma a provocação em lentidão com abilityId '<habilidade>:cc' e não guarda o tipo do controle. A IA reconhece a provocação por essa convenção e consulta as habilidades e invocações que têm controle provocar. Enquanto a lentidão durar, o chefe persegue quem provocou.
- Quem apanha acorda e chama o bando todo quando há packId. Sem packId, chama quem estiver a até 6 tiles. Quem foi chamado não chama mais ninguém, para o mapa não acordar em cadeia.
- Inimigo à distância recua no máximo a cada 3 s, para não ficar fugindo o tempo todo. O jogador automático à distância não recua: só para no alcance. Assim o simulador não vira um teste de quem foge melhor.
- Na Doutrina, só o Especial fica guardado por uma carta com condição. Exemplo do doc: 'use o Especial no chefe' guarda o Especial para o chefe. Botões citados em cartas ganham prioridade, mas a rotina continua usando: as recargas são curtas, e reservar botões travava o tanque no 1 contra 1.
- Fugir dura até 3 s e depois espera 8 s. Usa recuo, sumiço ou defesa e vai para perto do líder. Sozinho, o personagem volta atrás do último inimigo à vista a até 30 tiles. Sem isso, dois personagens fugindo ficavam se curando nas paredes, e as lutas terminavam em empate.
- A poção automática só entra na Doutrina padrão se consumables.pocao.usoAutomatico.padraoLigado for verdadeiro, e hoje é falso, como diz o doc ('se você ligar'). O simulador começa com 0 poções.
- Simulador: as lutas são no nível de referência do balance (ganhoPorNivel.nivelReferenciaClasse = 8, onde a tabela vale), com a Doutrina padrão, num mapa aberto de 40x40 só com borda, começando a 8 tiles (o alcance da trava automática), até 120 s; passou disso, é empate. Os lados trocam a cada luta. A semente de cada luta vem de (seed, a, b, k). Sem nenhum número do balance mexido.
- Grupo contra grupo: grupos de 3 sorteados (opção --grupo). Os grupos de papel único de calibracao.gruposDePapelUnico (tanque e dano) lutam contra grupos misturados, com max(4, n/4) lutas por papel.
- --todos roda os dois modos de balance.calibracao.modos. Em 1 contra 1, --n é o número de lutas por par: 276 pares × 200 = 55.200 lutas. A rodada inteira levou cerca de 4 min (uns 7 ms por luta).
- RESULTADO de npm run sim -- --todos --n 200 (semente 1, nível 8), 1 contra 1. 55.200 lutas, 2 empates, luta média de 15,4 s.
- Acima de 55% no 1 contra 1, com o tempo médio de luta: cowboy_cromado 97,9% (4,7 s); arqueiro_das_estepes 88,6%; diva_da_opera 84,3%; doktor_klaus 82,7%; bruxa_do_trovao 81,9%; o_fiel 80,8%; iogue_furioso 79,4%; hacker_da_aldeia 70,8%; engenheira_de_gambiarra 62,6%; cidadao_revolucionario 59,8%.
- Os outros no 1 contra 1: druida_rabugento 52,7%; curandeira 44,2%; monstro_da_academia 40,3%; babushka 40,2%; luchador 38,0%; atendente 36,3%; peao_brabo 35,5%; sumo 32,8%; tropa_de_choque 26,6%; diretor_de_nollywood 20,5%; coach 19,3%; cacador_de_crocodilo 11,2%; idol 8,3%; malandro 5,5%. Os dez de dano dominam; suporte e cura perdem quase tudo no 1 contra 1.
- RESULTADO grupo contra grupo (200 lutas, grupos de 3, 2 empates, luta média de 22,4 s). Acima de 55%: cowboy_cromado 78,0%; doktor_klaus 72,2%; bruxa_do_trovao 68,0%; arqueiro_das_estepes 64,2%; diva_da_opera 61,1%; engenheira 60,2%; hacker 55,4%; iogue 55,2%. O mais fraco foi idol, com 22,0%.
- Grupos de papel único contra misturados: só tanque venceu 28,0%; só dano venceu 68,0% (ALERTA). Conclusão para a Fase 3: o papel dano está forte demais, com o Cowboy à frente (Duelo ao Meio-Dia dobra o dano por 6 s, mais o Yeehaw.exe de 2,6×), e suporte e cura estão fracos sem talentos.
- Exemplo de série: npm run sim -- --modo 1v1 --n 500 --a peao_brabo --b idol deu peao_brabo com 100% (500 a 0, luta média de 19,9 s).

### servidor

- Contrato: edição aditiva em packages/shared/src/net/protocol.ts — S2C_Welcome.token? (pedido), mais C2S_Need {ids} e S2C_Info {ents} (formatos do 'need'/'info', iguais aos que o cliente já usa) e campos opcionais de cone nas zonas (s, dir, ang, rg). Nada existente mudou; tsc do shared passa e sim.net.test continua verde.
- Colyseus 0.18 conferido nos .d.ts e no build: importo Room, Server, WebSocketTransport e matchMaker de 'colyseus'; uso define('mundo', WorldRoom), listen(port, host), express no ServerOptions, onDrop/onReconnect/allowReconnection e setSimulationInterval (o alias de setTimestep).
- O clock da sala do Colyseus é avançado por outro intervalo quando patchRate = null, e o deltaTime vinha ~16 ms (a sala rodava ~7 ticks/s). O laço agora mede o tempo com performance.now() e patchRate = null é posto depois do setSimulationInterval.
- A sala 'mundo' é criada no boot (matchMaker.createRoom) e tem autoDispose false: o mapa é persistente, os inimigos e quem caiu da conexão continuam rodando sem ninguém conectado.
- Estado vai só por mensagens (sem Schema do Colyseus), como DECISIONS.md pede.
- O núcleo consome UMA PlayerInput por tick (a previsão do cliente anda um tick por entrada); fila máx. 3, as mais velhas caem; sem entrada nova o último joystick se mantém, e depois de 0,5 s sem nada ele zera.
- Comandos aplicados no começo do tick, antes do step. O step() zera w.events no início, então o core guarda os eventos soltos pelos comandos (cast, hit, morte por habilidade) e junta com os do step. Sem isso os 'cast' dos botões sumiam.
- d/n/lk/lv vão quando a entidade é nova ou mudou e se repetem até o ackTick do cliente passar do tick em que foram mandados; 'gone' também se repete até o ack. Com 2% de perda isso quase nunca precisa do 'need', que continua respondido.
- Mensagens de controle (hello, welcome, ping, pong, need, info) sofrem o atraso simulado mas não a perda; entradas e snapshots sofrem os dois. Atraso = PQP_LAG_MS/2 em cada sentido + jitter opcional; RNG semeado (PQP_NET_SEED).
- Saque de outro jogador (forPlayerId) e inimigo invisível não vão no snapshot; loot_drop alheio também é filtrado.
- Queda de conexão: personagem entra no automático (regra de Sistemas.md) e sai do mapa depois de OFFLINE_AUTO_MS, salvando. O mesmo token retoma a mesma entidade enquanto ela existe; depois, nasce no spawn com nível, XP, moedas, inventário, poções e Doutrina do registro.
- Mesmo token em outra sessão derruba a antiga (takeKicked; o WorldRoom fecha com código 4001).
- Jogador volta ao spawn quando o caído expira pela própria simulação (respawnAtHq usa spawnX/spawnY, que é o marcador spawn_jogador).
- Spawner próprio com spawnEnemy (n fixo do marcador, círculo de 1 tile, elite com tier/afixos do marcador). Não usei spawnPack de sim/ai_pack.ts porque ele ainda está sendo escrito por outro agente e não está no index.
- Traje no lk pelo nível, como no CLAUDE.md: sem classe = delta, classe sem ala = base, arquétipo = aprendiz (12) ou veterano (20+).
- Nível salvo é respeitado, mas com piso do kit (arquétipo 12, classe 8), para um registro antigo de Delta não nascer arquétipo no nível 1.
- Persistência em packages/server/src/persistence/store.ts (como ARQUITETURA.md) e sala em src/rooms/WorldRoom.ts; o core não depende do Store para funcionar (testes sem disco).
- Robô e canal em memória ficam em src/ (bot/robot.ts e netsim.ts) para o script de carga reaproveitar; o banco de testes fica em test/harness.ts.
- Testes reais do WorldRoom e do estático em arquivos separados (cada arquivo tem o seu matchMaker global).

### cliente

- Desenho em px de CSS com Scale.RESIZE, sem multiplicar pelo devicePixelRatio, e image-rendering pixelated. A GPU do celular desenha de 4 a 9 vezes menos pixels, o que ajuda a manter 60 fps. O zoom é escolhido para dar ~12 tiles de largura: 1 de 360 a 430 px, 2 no tablet.
- Na tela de 430 px nenhum zoom meio-inteiro cai na faixa de 11 a 13 tiles. Fica o mais perto, 13,4 tiles com zoom 1.
- Chão: Tilemap estático do Phaser numa textura de grade 'tiles_grid' montada a partir dos quadros da arte. A água e o piso neon têm uma célula por (tile, fase), redesenhada a cada TILE_ANIM_MS, sem mexer no mapa.
- Copas das árvores perto de chão andável viram Image com profundidade pelo y. As do meio da mata vão num Blitter abaixo dos bonecos.
- Toda a entrada passa pela HudScene, em coordenadas de tela, com toque testado a mão em cada ponteiro: - habilidade comum dispara ao encostar; - area_alvo e campo com alcance > 0 disparam ao soltar, e arrastar posiciona a área (até o alcance, na direção do arrasto, a partir do personagem); - sem arrasto, a área vai no alvo travado.
- Toque rápido na metade esquerda vale como toque no mundo, mesmo começando um joystick.
- Toque no inimigo manda 'alvo' com a posição interpolada do inimigo (o que o jogador viu), não o ponto exato do dedo.
- Toque num NPC longe anda até ele e conversa ao chegar.
- Toque no chão calcula o A* no cliente e manda ir_ate para o último ponto do caminho. Assim o servidor não fica empurrando contra a parede quando o destino é sólido.
- A previsão reaplica o joystick com o hud.mv atual e, no auto-caminho, o ponto seguido em cada passo.
- Quando o servidor move o personagem sozinho (modo automático, avanço, habilidade pendente, empurrão), as entradas são zero e o cliente segue a posição do servidor, suavizada.
- A posição quantizada do snapshot pode ficar até 0,005 tile dentro da parede. unstick() desloca o ponto antes de reaplicar as entradas, porque senão o boneco grudaria na parede.
- A seq das entradas e o id dos comandos nunca voltam, nem numa reconexão. É seguro se o servidor lembrar do ack antigo.
- Perda simulada só em in, snap, ping e pong, igual ao netsim do servidor.
- O jitter da URL é a variação total do RTT: ±jitter/4 em cada sentido.
- Servidor local no navegador (?offline=1) com a simulação de shared. Serve para jogar sem servidor e para os testes de integração. A tela de conexão oferece o modo offline depois de 2 falhas.
- Visual do próprio personagem: se o lk não bate com hud.arch (troca de ala), o cliente monta archetypeLook(hud.arch).
- Barra de vida: - NPC: tipo 'auto', só aparece quando apanha ou luta (separa companheiro de NPC neutro); - inimigo normal: mostra só o nível; - elite: nome e nível em laranja; - chefe: barra no topo da tela.
- lk do saque ({rarity, currency}) e do inimigo ({affixes}) seguem o que está documentado em server/src/snapshot.ts. Os afixos viram efeito: rápido = poeira, cura os outros = cruz, explode ao morrer = pavio.
- Texto dos números e rótulos na fonte de pixel 5x7 (maiúsculas sem acento). Balões, dicas e o aviso de caído usam Phaser.Text, com acento.

### integração

- Códigos de fechamento novos, CLOSE_CODE.outroAparelho = 4101 e tempoEsgotado = 4102. O servidor usava 4001 e 4002, que no Colyseus 0.18 são SERVER_SHUTDOWN e WITH_ERROR. Por isso o leave iniciado pelo servidor caía em onDrop/allowReconnection, e o cliente reconectava e derrubava o outro aparelho, em ciclo. Agora o WorldRoom.onDrop não reserva reconexão para esses códigos nem para sessões que o núcleo já soltou. O ColyseusTransport para de tentar quando recebe o 4101 e mostra o motivo no banner do HUD. Coberto em room.test.ts.
- HudSnap.canAct?: boolean (aditivo), vindo de canAct(e). Silenciado agora deixa os botões cinza. Coberto em sim.test.ts.
- Os bandos do mapa que têm um inimigo só nascem por spawnPack, tanto no servidor (spawner.ts) quanto no servidor local do cliente (?offline=1). Ganham packId igual ao id do marcador, escolta e a chance de promoção a elite de enemies.promocaoElite.chancePorBando, hoje 0,12, que já é sugestão nos dados. Os bandos mistos continuam um por slot. Coberto em core.test.ts.
- E2E em duas formas. A completa, com o chefe, vira `npm run e2e` (cerca de 67 s, lenta demais para o vitest) e sobe o servidor em outro processo. A curta, sem o chefe, roda no vitest em packages/server/test/e2e.test.ts com o servidor no mesmo processo (cerca de 12 s).
- O processo filho do e2e roda como `node --import tsx src/index.ts`, um processo só, para que child.kill() encerre o servidor certo no Windows. O cli do tsx teria um neto.
- O dev.mjs chama o node direto nos CLIs do tsx e do Vite, sem shell. No Windows, o Ctrl+C chega aos filhos pelo console; se eles demorarem mais de 4 s, taskkill /T /F derruba a árvore. O plano B é npm.cmd com shell. Ele também liga PQP_SERVE_CLIENT=0 (variável nova do servidor), para não servir um dist velho na 2567.
- O script "sim" da raiz passou a ser 'npm run sim -w @pqp/sim --', e as opções com nome funcionam. O args.ts continua aceitando a forma antiga, com valores soltos.
- Os testes de tempo do findPath em map.test.ts agora medem a melhor média entre lotes de 5 e têm retry: 2. Sozinho, o findPath leva cerca de 1,3 ms; com a suíte inteira em paralelo, uma rodada chegou a passar de 5 ms. O limite de 5 ms continua o mesmo.
- Copiei o SQL da tabela players de store.ts para supabase/migrations/0001_players.sql, com RLS ligado, porque o servidor usa a service key. O PENDENTE.md foi atualizado.
- Escrevi um README.md curto: rodar no PC, abrir no celular pela rede local, rede ruim e testes. Na ARQUITETURA.md, só a seção de execução mudou: agora se chama 'Como rodar', com os comandos e parâmetros novos.
- Documentei no cabeçalho do step.ts que ele zera w.events no começo. O core.ts e o localServer.ts já guardam os eventos de applyCommand, e o simulador não chama applyCommand, então não mudei o comportamento.

### correção shared-sim

- Achado 1 (tournament.ts:253, 55% no simulador) — PARCIAL: a parte da simulação está corrigida e a calibração é de outra área (dados). Confirmei: no 1 contra 1 com n 2 há 10 alertas (cowboy 95,7%, idol 4,3%); no grupo com n 200 há 8 alertas e o grupo só de dano vence 68%. No sim: (a) teste de regressão em packages/sim/test/sim.test.ts, um 1 contra 1 de n 1 e semente 3 que falha se algum arquétipo fora da lista atual passar de 55% (a lista só pode diminuir); (b) trava rígida sem nenhum alerta nos dois modos, que liga com PQP_BALANCO=1; (c) opção specialStart / --especial 1 para começar com o Especial carregado. Com ela o resultado continua dominado pelo papel. Os números ficam em balance.json e abilities*.json, fora da minha posse; ver openIssues.
- Achado 2 (spawn.ts:145, troca de ala zera recargas) — CORRIGIDO: setArchetype mantém e.cooldowns e aplica a recarga global (gcdUntil = max(atual, tick + recargaGlobalMs)). trocar_arquetipo agora exige switchTrainer: jogador de pé, fora de combate e com o treinador daquela ala (Wesley para Peão Brabo, Li Wei para Idol) a até 5 tiles. Recusa cowboy_cromado e qualquer ala sem treinador por perto. interact() em combate só fala. Testes de regressão em sim.test.ts.
- Achado 3 (targeting.ts:61, alvo automático preso no inimigo de longe) — CORRIGIDO: com o alvo não manual fora do alcance do básico, autoTarget passa para o inimigo visível mais perto se ele estiver no alcance do básico, ou se estiver RETARGET_CLOSER_TILES (2, SUGESTÃO) mais perto. Com o alvo no alcance, não troca. O alvo escolhido por toque e a provocação continuam mandando. Testes em sim.fixes.test.ts.
- Achado 4 (rewards.ts:150, saque sem filtro de raridade) — CORRIGIDO: tickPickup usa pickupAction. Item abaixo do filtro fica no chão; com a venda automática ligada, comum vira moeda da margem (precoBase × fracaoDoPrecoBase; em Crédito, × economy.cambio.base). Moedas, materiais e consumíveis passam sempre. Novo comando 'filtro_saque'. Testes em sim.fixes.test.ts.
- Achado 5 (números sem SUGESTÃO) — CORRIGIDO: o alcance 8 do cone virou ACQUIRE_RADIUS. Foram para constants.ts, com a marca: RETREAT_SCAN_TILES, SELECTOR_FALLBACK_RANGE, SUMMON_SPAWN_TILES, SUMMON_RING_TILES, SUMMON_FREE_RADIUS, DESCONSTRUIDO_RANGE_TILES, DESCONSTRUIDO_HEAL_PCT_DEFAULT, PATH_WAYPOINT_TILES e MOVE_TO_ARRIVE_TILES. REINFORCE_RING_TILES e REINFORCE_FREE_RADIUS ficaram em ai_boss.ts. Os pesos e limiares de scoreAbility e de position/idle (ai.ts) e de priority/tryUse (doctrine.ts) ganharam um bloco // SUGESTÃO listando cada número.
- Achado 6 (ai.ts:45, chefe que volta pela coleira não reinicia) — CORRIGIDO: tickAi não chama bossPhases enquanto o estado for 'voltando'. resetBoss também manda embora os reforços vivos. Teste: Bruno a 20% levado para fora da coleira não fala nenhuma fala de fase e chega dormindo, na fase 1, com vida cheia, sem reforço pendente e sozinho.
- Achado 7 (ai_boss.ts:34, reforços sem teto) — CORRIGIDO: o reforço que repete só repõe até reinforcementCap, a soma dos reforços das fases até a atual (3 no Bruno, SUGESTÃO). Cada reforço guarda reinforcementOf. Quando o chefe morre, some ou volta pela coleira, o reforço que sai de combate vai embora (dead + rewarded, sem XP nem saque). Teste: 3 minutos na fase 3, no máximo 3 capangas vivos.
- Achado 8 (tournament.ts:176, alcance 3 e suportes) — OUTRA ÁREA (dados), já confirmado no achado 1. Conferi a distância inicial: com --distancia 5 e com 12 continuam 11 alertas, e cowboy e arqueiro ficam acima de 91%. A distância de 8 tiles não é a causa, então ficou como está. O desequilíbrio vem dos números de ataque e das habilidades.
- Achado 9 (abilities.ts:349, groupOf no mapa inteiro) — CORRIGIDO: sem partyId, o grupo implícito é quem também está sem grupo a até IMPLICIT_GROUP_TILES (12, SUGESTÃO). Com partyId nada mudou. O teste da Turnê Mundial e o 'companheiro segue o líder' agora usam partyId. Novos testes: estranho a 105 tiles fica fora, e a curandeira no automático não anda atrás de estranho ferido a 100 tiles.
- Achado 10 (ai.ts:251, confusão não impede habilidades) — CORRIGIDO: useAbilities não lança nada com confundir ou tontura; só sai o básico a esmo. O tryUse da Doutrina recusa do mesmo jeito para o jogador confuso. Teste em sim.fixes.test.ts.
- Achado 11 (abilities.ts:182, cone soltava no vazio) — CORRIGIDO: com um alvo (travado ou o mais perto a até 8 tiles) fora do alcance, planCast de 'cone' devolve 'approach'. O personagem anda até lá e só então paga recarga e custo; sem inimigo nenhum, sai na direção em que olha. Achei e corrigi um defeito junto: o cone mede do centro de quem lança e o alcance borda a borda não. Daí approachRange, usado em step.ts e em ai.ts. A IA também não conta mais como lançada uma habilidade que virou 'andar até o alcance'.
- Achado 12 (ai_boss.ts:22, fase pulada) — CORRIGIDO: bossPhases percorre as fases do meio uma a uma, com fala, reforços e aoEntrar de cada. Teste: de 66% para 26%, saem as duas falas e 2 + 1 reforços.
- Achado 13 (spawn.ts:83, applyKit apagava stats.pct e o hpAdd) — CORRIGIDO: applyKit mantém stats.pct e refaz o hpAdd de cada reforco:hp ativo sobre a vida máxima nova. Teste: relevel com o reforço ativo e, quando ele acaba, a vida máxima volta à base do nível.
- Achado 14 (combat.ts:249, imunidade contava a duração nominal) — CORRIGIDO: quando removeStatuses tira um controle antes da hora (quebraAoApanhar, limpar) e não sobra outro, ccImmuneUntil = min(atual, tick + imunidadeControleMs). Teste: prender de 6 s quebrado no primeiro golpe deixa exatamente 4 s de imunidade.
- Achado 15 (combat.ts:390, attackers sem poda) — CORRIGIDO: pruneAttackers no resourcePhase a cada 20 ticks tira quem não bate há mais de XP_PARTICIPATION_MS (30 s). Teste incluído.
- Achado 16 (abilities.ts:652, empurrão do aviso no chão saía de onde o lançador está agora) — CORRIGIDO: Ctx.fixedOrigin. Em volta e cone resolvidos por aviso no chão empurram, e puxam sem paraCentro, a partir da origem marcada no lançamento. Área, campo e travada não mudaram. Teste: a Cobrança Amigável com o capanga passando para o outro lado ainda empurra o jogador para longe da origem.

### correção server

- Achado 1 (spawner: elite nascia sozinho): CORRIGIDO no servidor. Confirmado: o marcador 'inimigo' passava direto por spawnEnemy. Marcador 'inimigo' ou 'chefe' cujo inimigo tem escolta em enemies.json vira um grupo com 'lead'. O líder nasce no marcador com tier, afixos e nível do marcador; a escolta nasce em anel em volta (quantidade sorteada por world.rng), com enemyMind.leaderId = líder e packId = id do marcador; o grupo renasce junto. Não usei spawnPack porque ele não recebe afixos e fica em shared, que não é da minha posse. Testes: o de conteúdo agora espera 7 capangas, e um novo confere escolta, leaderId, packId, packMates e renascimento. O localServer do cliente é de outra área (ver openIssues).
- Achado 2 (fila de entradas: movimento contado duas vezes e atraso para sempre): CORRIGIDO no servidor. Reproduzi com o experimento do revisor, que usa o GameClient de verdade. Escolhi a opção 'não extrapolar + drenar': - Fila vazia: o personagem não anda. Isso vale para o joystick velho e também para o caminho do ir_ate, que fica estacionado durante o step. Assim o ack anda junto com a posição. - Sobrando entrada: até 2 extras por tick andam na hora (moveNow, a mesma conta de moveVelocity/stepMovement/velocityToward do step). - Um crédito de 1,05 entrada por tick, com teto de 20, impede andar mais rápido mandando mais de 20 entradas por segundo. - O corte das mais velhas só acontece acima de 40. Testei antes uma extrapolação com 'entradas supostas' e descartei: com a travada nos dois sentidos, os snapshots da travada levavam posições supostas e davam puxão de 0,26 a 0,53 tile quando o joystick mudava. Medido no experimento do revisor (GameClient de verdade, 200 ms de RTT): - travada de 250 ms a cada 2,5 s: p99 caiu de 0,548 para 0,006 tile, fila média 0,08; - 2% de perda: erro máximo 0,009 tile. No teste novo prediction.test.ts, o erro máximo ficou abaixo de 0,02 tile (é só o arredondamento de 0,01) em todos os cenários: 2% de travadas, travada periódica, travada de 600 ms, variação de 40 ms e ir_ate com travadas.
- Achado 3 (simulador de rede modelava perda como descarte e embaralhava a ordem): CORRIGIDO. LinkSim e MemoryChannel agora mantêm a ordem (no LinkSim, uma fila por cliente). A perda padrão virou travada de 250 ms seguida de rajada. O descarte ficou como opção (PQP_LOSS_MODE=descarte ou lossMode). O embaralhamento só acontece com reorder:true. Os testes antigos de robustez (duplicação, perda de 10% e embaralhamento) agora pedem lossMode 'descarte' ou reorder explicitamente.
- Achado 4 (comandos sem amarra com a seq): CORRIGIDO no servidor, falta a parte do cliente. O servidor aceita um afterSeq opcional em cada comando e só o roda depois de ter andado essa entrada (posição e A* iguais aos do cliente). O teste mostra a posição no comando a menos de 0,12 tile da prevista, com travadas. Comando sem afterSeq continua como antes. Com a fila drenada, o caso do revisor ('falar com o Wesley' com travada) já deu fala em 6 de 6 tentativas no experimento com o GameClient de verdade, mesmo sem afterSeq. Mandar afterSeq e a folga no raio do interagir são de outras áreas (openIssues).
- Achado 5 (rewind subestimado): CORRIGIDO. rewindTicks = round(min(250, rtt + 100 + 25) / 50), porque o desenho fica uma ida + 100 ms atrás e o comando leva mais uma ida e meio tick. Com 200 ms de RTT dá 5 ticks, e com RTT 0 dá 3. O teste de compensação foi ajustado: o alvo sai do alcance 4 ticks antes do comando. A mesma fórmula no localServer do cliente é de outra área.
- Achado 6 (banda): CORRIGIDO EM PARTE no servidor. d/n/lk/lv repetem a cada 4 ticks até o ack, em vez de todo tick, e o 'need' cobre o resto (teste em guard.test.ts). HUD só quando muda, deltas de posição e entidades distantes a 10 Hz mudam o protocolo e a interpolação do cliente: são de shared e client (openIssues).
- Achado 7 (eventos só no snapshot do tick): FALSO no transporte de verdade. WebSocket/TCP não perde snapshot; a premissa vinha do simulador, que agora modela travada por padrão (achado 3). Repetir eventos sem o cliente descartar repetidos por (tick, índice) duplicaria números de dano e falas, então não fiz. Documentei no cabeçalho do core.ts.
- Achado 8 (Doutrina com carta desconhecida trava o mundo): CORRIGIDO no servidor. Confirmado em rascunho: sem o filtro, step() lança. Escrevi uma validação fechada (doctrine_guard.ts), usada no comando 'doutrina' e ao carregar d.doctrine do Store. O teste repete o cenário do revisor: com o cliente 'a' mandando cartas ruins e ligando o automático, o cliente 'b' anda, saem 40 de 40 snapshots e nenhum erro; a Doutrina ruim gravada no Store sai limpa. A defesa na simulação (default em act/cond, try/catch por entidade) é de shared (openIssues).
- Achado 9 (cache do index.html e assets velhos devolvendo HTML): CORRIGIDO. index.html (e o fallback do SPA) vai com 'no-cache', /assets/* com 'public, max-age=31536000, immutable' e o resto com 1 h. Caminho com extensão ou sob /assets/ que não existe responde 404 em texto, nunca o index. Teste em static.test.ts.

### correção client

- F1 botões de posição fixa: CORRIGIDO. Há uma engrenagem (botão 'ajuste', abaixo do quadro do jogador) que abre o modo de ajuste. Nele dá para arrastar b1, b2, b3, Especial, item, AUTO e Falar, presos na metade direita, abaixo de 30% da altura e acima da área segura. Soltar em cima de outro botão desfaz o arrasto. OK guarda os deslocamentos em px de CSS em localStorage 'pqp_layout' (com safeSet). 'Padrão' volta ao original. Conferido no navegador: o b2 movido foi gravado e reaplicado depois do restart. Testes em ui.test.ts.
- F2/F14 AUTO e ALA com 44 px: CORRIGIDO. rSmall = max(28, 30·ui), o que dá 60 px de diâmetro. O AUTO é preso na borda direita, e a ALA e a engrenagem ficam abaixo dos quadros. O teste confere ≥56 px e nenhuma sobreposição de 360 a 768 px em dpr 1 a 3.
- F3 números sem SUGESTÃO: CORRIGIDO. Viraram constantes nomeadas: TAP_BODY_UP_TILES 0,6, NPC_TAP_TILES 1,2 (WorldScene) e BOSS_BAR_TILES 14 (HudScene).
- F4 aviso no chão no tempo do servidor atrasado: CORRIGIDO no cliente. Os avisos agora são desenhados em actionTick = (serverNow + RTT)/50 + 1 tick de fila, limitado a impactTick. É o mesmo tempo em que o próprio boneco previsto aparece. Escolha para DECISIONS: a compensação ficou no desenho; o servidor não ganhou tolerância a favor de quem desvia (isso seria da área sim/server).
- F5 LocalServer com regras diferentes do núcleo: CORRIGIDO. Agora segue as regras do núcleo: - seq maior que a última e sem repetidas, fila ordenada; - drenagem de até 2 extras por tick, que andam na hora, com crédito; - fila de 40 e joystick ao centro sem entrada; - comandos com dedupe por conjunto de recentes, aplicados no tick; - rewind = RTT + 100 + 25 ms. Também há um teste novo, net.core.test.ts, que liga o GameClient de verdade ao GameServerCore de verdade com 200 ms de RTT, variação e 2% de perda: p99 do erro de previsão < 0,1 tile, nenhum teletransporte, comandos confirmados e queda/volta. O núcleo entra por import() dinâmico com caminho em variável, para o tsc do cliente não conferir o código Node. A extração de InputQueue/CommandDeduper para shared/net não foi feita (é de outra área).
- F6 boneco movido só pelo servidor anda em pulsos: CORRIGIDO. Sem joystick, sem caminho próprio, sem entrada sem ack que ande e com FL.movendo, o boneco é desenhado pelo buffer de snapshots, 50 ms atrás, com mistura de ~35 ms na troca. Medido: o passo máximo por quadro caiu de 1,71× para ~1,1× a média, e o mínimo subiu de 0,52× para ~0,94×. A previsão do próprio avanço (começar antes de um RTT) não foi feita.
- F7 previsão durante a queda: CORRIGIDO. fixedTick para (Predictor.hold) e não manda entradas enquanto status != 'conectado'. onOpen(false) limpa o histórico do Predictor e lastInputs. Testado com o LocalTransport e com o GameServerCore (dropClient/resumeClient).
- F8 recarga não prevista: CORRIGIDO com LocalCooldowns: - o toque aceito trava o botão até o HUD confirmar a recarga, ou até o servidor processar o comando (cack ≥ id) sem recarga, que é a recusa; - a trava dura no máximo RTT + 200 ms; - a recarga global local é de 1 s (balance.recargaGlobalMs) e aparece na pizza; - localCast só toca sem trava. O comando continua sendo enviado.
- F9 jogador invisível depois de voltar ao QG: CORRIGIDO no cliente. syncView chama EntityView.revive() quando shouldRevive(kind p/n/s, h>0, sem FL.caido, dying). Não foi criado o evento 'respawn' na simulação (é mudança de contrato de outra área).
- F10 texto de 7 px: CORRIGIDO. - HUD: a fonte de pixel usa escala inteira ts = round(2·ui·dpr), ou seja, células de 14 px de CSS. Os quadros foram refeitos com medidas calculadas no layout e o texto é cortado por quantas letras cabem. - Mundo: nomes e números com worldTextScale (~2 px de CSS por pixel da fonte); o crítico é uma escala maior. - Balões em resolução nativa. Observação: a fonte já tinha contorno escuro de 1 px. O achado errou nesse ponto, mas na escala 1 o contorno ficava fino demais.
- F11 Graphics refeitos a cada quadro: CORRIGIDO. Botões, pizza, anel de carga, disco cinza, joystick, painéis e a seta são texturas geradas uma vez, e as barras são Rectangle com escala. A HudScene ficou com 0 Graphics. Medido no navegador: o custo do HUD caiu de ~0,9 ms para ~0,06 ms por quadro.
- F12 DPR não inteiro: CORRIGIDO. O canvas fica em pixels físicos (Scale.NONE, zoom 1/dpr, dpr até 3, ?dpr= para forçar) e o zoom da câmera é inteiro em pixels físicos. O HUD trabalha em px de CSS × dpr. Conferido no navegador: em 375x812 com dpr 2, o canvas tem 750x1624 e o estilo 375x812.
- F13 zoom só pela largura: CORRIGIDO. O zoom é inteiro, o mais perto de 12 tiles, com mínimo de 9,5 tiles de largura e 14 de altura. Em 1280x720 o zoom é 1 (40x22 tiles); no tablet em pé, 2.
- F15 pacote único de 2,8 MB: CORRIGIDO em parte: - 'Carregando...' em HTML, que sai quando o Phaser abre; - LocalTransport/LocalServer e a galeria entram por import() dinâmico; - o build foi separado em pedaços: phaser 1,2 MB, colyseus 225 kB, dados+zod 1,0 MB e jogo 366 kB. Pular o zod em produção e carregar sob demanda os JSON que o protótipo não usa depende de shared/src/data (OUTRA ÁREA).
- F16 sem rumo no primeiro minuto: CORRIGIDO. Até o primeiro alvo travado, uma seta na borda da tela aponta o bando mais perto pelos marcadores do mapa, com a dica 'Inimigos para lá. Toque na seta para ir'. Tocar na seta usa o auto-caminho (goTo). Conferido no navegador: a seta apontou para (12,5; 56,5) e o toque levou o boneco até lá.
- F17 voltar do Android fecha o jogo: CORRIGIDO. - ExitGuard: pushState ao entrar no mundo; o 1º voltar avisa e o 2º, em até 3 s, sai. - beforeunload enquanto conectado. - O joystick não nasce nos primeiros 16 px da borda esquerda; ali o toque vale só como toque no mundo.
- F18 folhas geradas no meio do combate: CORRIGIDO. - A BootScene gera, uma por quadro e atrás de 'Preparando os bonecos N/M', o visual padrão, peao_brabo e idol em aprendiz e veterano, os NPCs e os inimigos dos marcadores (normal, elite e chefe). - A WorldScene gera no máximo 1 folha de boneco nova por quadro; as outras usam o visual padrão até a vez delas.
- F19 fps sem teto: CORRIGIDO, mas não com 'limit: 60'. Com limit 60, numa tela de 60 Hz o Phaser pularia todo quadro com delta < 16,67 ms. A taxa da tela é medida antes de abrir o jogo e fpsLimitFor dá 61 em 120 Hz, 73 em 144 Hz e nenhum teto em 60/90 Hz.
- F20 alocação por quadro: CORRIGIDO. - Os textos só mudam quando o valor muda (cache). - A assinatura com join e o Graphics das barras saíram. - A chave do ícone fica em cache. - setDepth só roda quando o y arredondado muda (também em stun, aura e bolha).
- F21 Blitter sem recorte: CORRIGIDO. As copas da mata ficam em Blitters por bloco de 16x16 tiles, e cull() liga só os blocos perto da câmera.
- F22 avisos e zonas sem pool: CORRIGIDO com ImagePool (Sprite: soltar esconde; pegar troca a textura e zera animação, tinta, giro e escala).
- F23 dica da mira sobre o Falar: CORRIGIDO. A âncora da dica 'mira' fica acima do Falar (origem embaixo) e dentro da metade direita. Há teste para várias telas.
- F24 galeria parada e cabeçalho cortado: CORRIGIDO. A geração é feita em lotes de 12 ms por quadro, com 'GERANDO N/M'. O cabeçalho usa escala inteira que caiba ou o texto curto, e a escala acompanha o dpr.
- Teste da troca de ala no net.prediction.test.ts: a correção da sim agora exige o treinador a até 5 tiles (TRAINER_SWITCH_RADIUS). Pus o Li Wei a 3,6 tiles do spawn na arena desse teste.
- Arraste de área (achado do HudScene:380): o curso caiu para 60 px de CSS × ui, que cabe abaixo do b1. Arrastar e voltar o dedo para cima do botão cancela: a guia fica cinza e soltar não lança.
- O quadro do jogador não mostra mais o nome do recurso (só a cor da barra) e mostra 'NV n' com a barra de XP ao lado: na letra de 14 px não cabia tudo.

## Sugestões (inventado, não está nos docs)

### simulação

- PLAYER_RADIUS 0,35, NPC_RADIUS 0,35, SUMMON_RADIUS 0,4, LOOT_RADIUS 0,25 (raios de corpo em tiles).
- JOYSTICK_DEADZONE 0,15.
- ACQUIRE_RADIUS 8 tiles (trava automática), DROP_RADIUS 11 (o alvo automático cai), MANUAL_TARGET_LOSE_MS 2000 (o alvo do toque cai depois de 2 s fora de vista).
- VIEW_RADIUS 10 tiles para 'inimigos à vista' das viradas.
- IA: AGGRO_RADIUS 7 tiles, AGGRO_RADIUS_BOSS 10, LEASH_RADIUS 15 e REPATH_TICKS 10 (refaz o caminho a cada 0,5 s). Inimigo à distância fica 0,5 tile antes do alcance máximo.
- PENDING_CAST_MS 3000: tempo que a habilidade pedida fora do alcance espera.
- LANE_HALF_WIDTH 0,5 tile: corredor de inimigos_caminho além do raio do corpo.
- INTERACT_RADIUS 2,5 tiles para conversar com NPC.
- XP_PARTICIPATION_MS 30000 e XP_PARTICIPATION_RADIUS 10 tiles.
- LOOT_LIFETIME_MS 60000: saque some do chão em 60 s.
- MAX_DAMAGE_REDUCTION_PCT 80, e lentidão com teto de 90%.
- SPECIAL_BANK_MAX_S 10: o banco de carga guarda no máximo 10 s de teto.
- START_POTIONS 3: poções no botão de item do personagem template.
- HISTORY_TICKS 8: 400 ms de histórico.
- ENEMY_SEPARATION_PER_TICK 0,04: separação suave entre inimigos do bando.
- Chefe não é empurrado nem puxado (combat.canBeDisplaced).
- Culatra do Für Wissenschaft!: acerta quem lançou e os aliados dele em volta, com culatra.mult, sem crítico.
- Levantar: o progresso zera quando ninguém está ao lado. O doc não diz se pausa ou zera.
- Classe sem ala (spawnPlayer com id de classe) assume a margem esquerda quando side não é passado.
- Níveis padrão por etapa: Delta 1, classe 8, arquétipo 12.
- Puxão contínuo (Encore, Sucção): velocidade = distância até o centro ÷ duração, com mínimo de 1 tile/s.
- Explosão da Derrubada: sai na hora em que o alvo cai, sem aviso no chão. Explosão do afixo: aviso de janelaMs.
- Desconstruído: aliado mais ferido a até 8 tiles.
- Raios saltando (Skål!, Experimento Instável): precisam de linha de visão entre um alvo e o próximo.
- Afixo com regra 'intervalo' (Cura os Outros): o primeiro pulso sai depois de intervaloS, não ao nascer.
- Básico de invocação: as invocações sem tickMs não batem.

### mapa

- prototipo_delta.ts: o desenho inteiro do mapa e a posição de cada coisa (palafitas, cadastro oco com porta, duas passarelas, canal com ponte de tábua, lagoa funda, curral do Capataz com porteiras, galpão, muro com dois portões, arena e trapiche do barco do vizinho). Marcado com // SUGESTÃO: no cabeçalho.
- prototipo_delta.ts: o tamanho de cada bando (siri 3 e 4, capanga 2 e 3), dentro do mínimo e do máximo de enemies.json. Marcado com // SUGESTÃO:.
- prototipo_delta.ts: o afixo da elite (blindado). Marcado com // SUGESTÃO:.
- deco.ts: a lista de decorações (Flor, Concha, Tabua) e os valores 1 a 3. Marcado com // SUGESTÃO:.
- path.ts: PATH_MAX_NODES = 4000 e PATH_SNAP_RADIUS = 6 tiles. Marcados com // SUGESTÃO:.
- Ideia para o cliente: desenhar o barco do vizinho como decoração no trapiche, perto do chefe (mais ou menos x 26 a 29, y 2 a 5). Não está no código.

### arte

- Corpo, tom de pele, rosto e cabelo dos 22 treinadores sem descrição física e dos NPCs de npcs.json. Saem de uma escolha estável pelo id, com alguns ajustes manuais (npcs.ts).
- Visual da Eco, que não tem visual nos docs: uma figura com fones de rádio e moletom (npcs.ts).
- Cores de classe dos ícones: combatente vermelho, atirador amarelo, elemental azul, mascarado roxo. Molduras dos ícones: madeira e verde na Esquerda, preto e ciano na Direita (icons.ts).
- Cores da aura de tier (elite laranja, chefe vermelho) e escala do chefe (humano 1,25x, comum promovido 1,5x) em creatures.ts.
- Textos inventados: 'JUROS' na prancheta do cobrador, 'CAPANGA' no crachá escrito à mão, '312 SCORE' na tela do drone, números do placar de cotação do cambista.
- Cores da regata e da bermuda do kit de criação (character.ts).
- Número de variações por tile, estilo de parede, porta, cerca, árvore e máquina por região, e velocidade da água (tiles.ts).
- fps de cada animação de boneco: parado 2, andando 10, básico 12, habilidade 10, Especial 10, vitória 6, derrota 6. Os fps dos efeitos também são escolha minha (index.ts ANIM_FPS e fx.ts).
- Lista de efeitos extras além dos pedidos: zonas no chão por margem, corações, notas, ondas, confete, atordoado, escudo, cura, poeira, cruz e pavio dos afixos, saquinhos de saque por raridade e moedas de Semente e Crédito.
- Cones de aviso em 120 graus, a mais dos ângulos dos dados.
- Emblemas dos QGs (Casa da Assembleia com colunas, Torre do Consórcio de vidro), que o doc não descreve.

### IA e simulador

- ai_state.ts AI_TUNING (todos marcados como // SUGESTÃO:), parte 1, sono e percepção: dormindo, pensa a cada 5 ticks; raio ativo de 24 tiles; percepção de 7 tiles (chefe 10), a do núcleo.
- AI_TUNING, parte 2, perseguição: chamado do bando a 6 tiles; coleira de 15 tiles (chefe 22); na volta, cura de 20%/s, imune e vida cheia na chegada; desiste depois de 3 s sem ver o alvo.
- AI_TUNING, parte 3, caminho e posição: 6 buscas de caminho por tick; refaz o caminho a cada 0,5 s ou quando o destino anda 1,5 tile; à distância, recua 2,5 tiles quando a folga fica abaixo de 1,6, a cada 3 s; suporte a até 3 tiles do ferido; chefe faz pausa de 400 ms depois do impacto; voador ziguezagueia 0,6 tile.
- AI_TUNING, parte 4, Doutrina: fugir por 3 s, esperar 8 s, fugir 4 tiles; companheiro preso a 12 tiles do líder; seguir a 2,5 tiles (a carta seguir_grupo vale a partir de 4); procurar caído a até 10 tiles; procurar inimigo a até 16 tiles, ou o último inimigo a até 30; curar_aliado sem carta de vida vale abaixo de 70%; a rotina cura abaixo de 85%.
- ai.ts: estados 'permanentes' de 10^9 ms (afixos e volta para casa).
- ai.ts: nota das habilidades do inimigo (100 apoio, 80 controle, 40 + 10 × dano, +20 se grande, +15 para avanço de longe, +25 para puxar de longe, 55 marca, 35 reforço, −25 para o chefe repetir).
- ai.ts: enxame cerca o alvo, cada um na sua vaga. Elite com cura_os_outros se posiciona como suporte.
- ai.ts: estados visíveis 'afixo:<id>' e 'voltando' (nomes novos para o cliente desenhar).
- ai_pack.ts: bando afastado 1,2 tile entre membros, em anéis.
- ai_boss.ts: reforços nascem a raio do chefe + 1,8 tile, já acordados no mesmo alvo, e entram no bando do chefe. Ao reiniciar pela coleira, o chefe volta à fase 1.
- doctrine.ts: as cartas padrão por papel (os docs só dão exemplos). Tanque: levantar_aliado; vida < 50% usa o botão de defesa; 2+ inimigos a 3 tiles usa o botão de área com controle; especial_pronto; sempre focar_mais_perto. Cura: aliado < 40% curar_aliado (do doc); levantar; vida < 25% fugir (do doc); especial; seguir_grupo. Suporte: levantar; aliado < 50% curar (se tem cura ou escudo); fugir; especial; seguir_grupo. Dano: fugir 25%; levantar; especial; focar_mais_fraco.
- doctrine.ts: prioridades da rotina por papel. Defesa em si quando a vida está abaixo de 70% ou com 2 ou mais atacantes em 2 s. Avanço colado ao alvo não é usado. Controle em alvo imune a controle não é usado.
- packages/sim/src/match.ts MATCH_DEFAULTS: luta de até 120 s, começo a 8 tiles, mapa de 40x40, 0 poções. Empate vale meia vitória no relatório.
- packages/sim/src/tournament.ts: grupos de 3 por padrão e max(4, n/4) lutas por papel único.

### servidor

- OFFLINE_AUTO_MS = 120 s no automático depois da queda de conexão antes de sair do mapa (config.ts).
- COLYSEUS_RECONNECT_S = 20 s de espera pela reconexão da mesma sessão (config.ts).
- RESPAWN_MS: bando normal 30 s, elite 60 s, chefe 120 s depois que o grupo inteiro caiu (config.ts).
- RESPAWN_SAFE_RADIUS = 8 tiles: não renasce com jogador perto (config.ts).
- BAND_SPREAD_TILES = 1: membros do bando num círculo de 1 tile (config.ts).
- SAVE_EVERY_MS = 10 s: gravação periódica do progresso (config.ts).
- DEFAULT_ARCHETYPE = peao_brabo para o template da Fase 1 (config.ts).
- DEFAULT_PLAYER_NAME = 'Visitante' e MAX_NAME_LENGTH = 20 (config.ts; o mesmo 'Visitante' no store.ts).
- DEFAULT_WORLD_SEED = 2077 (config.ts).
- MAX_CMDS_PER_MSG = 16, RECENT_CMD_IDS = 128, GONE_REPEAT_TICKS = 40, EVENT_MARGIN_TILES = 2, MAX_CLIENT_RTT_MS = 2000, MAX_CATCHUP_TICKS = 4 (config.ts).
- STALE_INPUT_TICKS = 10 (0,5 s sem entrada zera o joystick) e MAX_NEED_IDS = 64 (core.ts).
- maxClients = 200 na sala do mapa (WorldRoom.ts).
- Companheiro de IA opcional = o treinador da outra ala do template (Peão Brabo anda com Li Wei como Idol e vice-versa), mesmo nível, grupo próprio (partyId grupo_<id>) (core.ts spawnCompanion).
- Formato do lk de inimigo, saque e invocação ({affixes}, {rarity, currency}, {side}) documentado em snapshot.ts lookOf.

### cliente

- Textos das dicas (ui/tips.ts): 'Arraste aqui para andar', 'Seus golpes miram sozinhos', 'Toque no inimigo para trocar o alvo', 'Fale com Wesley ou Li Wei para trocar de estilo'.
- Tempos das dicas (ui/tips.ts): a da mira some sozinha em 10 s; a de estilo aparece 6 s depois de andar, só fora da briga; no máximo 2 dicas na tela.
- Texto do aviso de queda: 'Conexão caiu. Reconectando... (seu personagem luta sozinho)'.
- Textos flutuantes: 'errou', 'lento', 'de pe!' (levantou), '+N xp', 'nivel N!'.
- Joystick: raio de 56 px e zona morta de 8 px. Toque: até 260 ms e 12 px.
- Arrasto de área: máximo de 90 px × escala da interface, mínimo de 14 px.
- Tamanhos dos botões: habilidade com raio 31, Especial 42, item 28, AUTO e ALA 22, Falar 30 (× escala da interface).
- Teclas de teste F (AUTO) e T (ALA).
- Números de rede: - extrapolação de até 150 ms; - salto de 4 tiles ou mais é teletransporte na interpolação; - erro de previsão acima de 2 tiles teletransporta; - correção com τ de 33 ms; - 60 entradas guardadas sem ack; - ping a cada 1 s e need a cada 0,3 s; - alvo local vale por RTT + 300 ms; - ir até o NPC desiste em 8 s; - teto de 24 comandos esperando ack.
- Reconexão do ColyseusTransport com espera de 0,5 s a 5 s.
- Visual: cores de barras, nomes, números e recursos; fala no balão por 4 s + 40 ms por letra, até 7 s.
- Servidor local: - bando volta em 30 s e chefe em 60 s; - ala inicial do servidor local é peao_brabo.
- O aviso no chão em linha tem 1 tile de largura (o Telegraph não diz a largura).
- As duas alas do botão ALA de teste: peao_brabo e idol.

### integração e correções

- Nenhum número, fala ou lore de jogo novo nesta integração.
- Os valores 4101 e 4102 de CLOSE_CODE são técnicos (escolhidos fora da faixa do Colyseus) e estão comentados em protocol.ts.
- As tolerâncias do e2e são critério de teste, não de jogo: 16 a 22 snapshots por segundo, RTT de pelo menos 150 ms, aviso do chefe de pelo menos 0,8 s (este último vem do CLAUDE.md).
- O texto de tela novo 'Você entrou em outro aparelho. Recarregue para jogar aqui.' (colyseusTransport.ts) é interface, não lore.
- A promoção a elite nos bandos do mapa passa a valer em jogo, com chancePorBando 0,12. Esse número já estava marcado como sugestão em enemies.json.
- TRAINER_SWITCH_RADIUS = 5 tiles, borda a borda (constants.ts): o botão ALA (trocar_arquetipo) só vale com o treinador da ala a essa distância. No mapa do protótipo, o spawn fica a uns 3,4 tiles do Wesley e do Li Wei. O 'fora de combate' reaproveita regenForaDeCombate.aposMs, que já está nos dados.
- RETARGET_CLOSER_TILES = 2 (constants.ts): folga para o alvo automático trocar de inimigo quando o atual está fora do alcance do básico.
- IMPLICIT_GROUP_TILES = 12 (constants.ts): grupo implícito de quem está sem partyId.
- RETREAT_SCAN_TILES = 10, SELECTOR_FALLBACK_RANGE = 4, SUMMON_SPAWN_TILES = 1, SUMMON_RING_TILES = 1,2, SUMMON_FREE_RADIUS = 0,4, DESCONSTRUIDO_RANGE_TILES = 8, DESCONSTRUIDO_HEAL_PCT_DEFAULT = 5, PATH_WAYPOINT_TILES = 0,15 e MOVE_TO_ARRIVE_TILES = 0,1 (constants.ts): eram números soltos no código e agora levam a marca.
- REINFORCE_RING_TILES = 1,8 e REINFORCE_FREE_RADIUS = 0,5 (ai_boss.ts): onde nasce o reforço do chefe.
- Teto de reforços vivos do chefe = soma dos reforços das fases até a atual (3 no Bruno Ferro). Os docs não dão teto.
- Reforço de chefe vai embora, sem XP nem saque, quando o chefe reinicia pela coleira, morre ou some e o reforço sai de combate. Os docs não dizem o que acontece com os capangas depois da luta.
- Venda automática: no Delta, sem margem, paga em Semente; arredonda para baixo, com mínimo de 1; em Crédito, multiplica pela cotação base do câmbio (economy.cambio.base = 2).
- ATTACKERS_PRUNE_EVERY_TICKS = 20 (step.ts): poda da lista de quem bateu a cada 1 s, com janela de 30 s.
- Pesos e limiares da IA dos inimigos (ai.ts: scoreAbility, position, idle, mostHurtMate) e da rotina da Doutrina (doctrine.ts: priority, tryUse, flee) agora têm a marca // SUGESTÃO com a lista dos números.
- Simulador: opção specialStart / --especial F (carga inicial do Especial) e lista de alertas conhecidos no 1 contra 1 (packages/sim/test/sim.test.ts), que só pode diminuir.
- Ponto de partida para a calibração (experimento só em memória, fator só no ataque, 10 iterações, rascunho em C:\Users\gnmar\AppData\Local\Temp\claude\pqp-scratch\shared-sim-fix\calib_out.txt): cowboy_cromado ×0,53, engenheira_de_gambiarra ×0,57, iogue_furioso ×0,70, doktor_klaus ×0,72, arqueiro_das_estepes ×0,75, bruxa_do_trovao ×0,76, diva_da_opera ×0,79, o_fiel ×0,82, idol ×1,82, malandro ×1,82, cacador_de_crocodilo ×1,82, tropa_de_choque ×1,53, coach_de_bem_estar ×1,44, diretor_de_nollywood ×1,40. Com isso, o pior caso caiu de 97,8% para uns 67-74% no 1 contra 1 e de 82% para uns 68% no grupo, mas não converge: alguns arquétipos vão bem num modo e mal no outro (iogue 74% no 1 contra 1 e 37% no grupo; engenheira 29% e 67%). Precisa de ajuste por habilidade, além do ataque.
- config.ts: INPUT_TARGET_BACKLOG = 0 e INPUT_CATCHUP_PER_TICK = 2: até 2 entradas extras por tick drenam a rajada depois da travada.
- config.ts: INPUT_CREDIT_PER_TICK = 1,05 e INPUT_CREDIT_MAX = 20: crédito de entradas contra quem manda mais de 20 por segundo; aceita 5% de deriva de relógio e 1 s de rajada.
- config.ts: INPUT_QUEUE_MAX = 40 (2 s); passou disso, as entradas mais velhas caem.
- core.ts: crédito inicial de 5 entradas por sessão.
- config.ts: CMD_HOLD_MAX_TICKS = 10: comando com afterSeq espera no máximo 0,5 s.
- config.ts: INFO_REPEAT_TICKS = 4: d/n/lk/lv se repetem a cada 4 ticks até o ack.
- netsim.ts: DEFAULT_STALL_MS = 250, travada que imita o RTO do TCP com 200 ms de RTT.
- doctrine_guard.ts: faixas aceitas nas cartas (pct de 1 a 99, n de 1 a 20, raio até 12 tiles).
- app.ts: arquivos estáticos fora de /assets/ e do index ficam 1 h no cache (já era assim; agora o valor é explícito).
- Removi do core.ts a constante STALE_INPUT_TICKS (sugestão antiga, 0,5 s), que deixou de ser usada: agora o personagem para já no primeiro tick sem entrada.
- Constantes novas marcadas com // SUGESTÃO no código: - layout.ts: ZOOM_TARGET 12, ZOOM_MIN 9,5 de largura e 14 de altura, MAX_DPR 3, HUD_TEXT_CSS_SCALE 2, rSmall 30·ui, fpsLimitFor (taxa da tela dividida para ficar entre 55 e 75 fps). - worldTextScale: ~1,75 px de CSS por pixel da fonte. - HudScene: DRAG_MAX_CSS 60, DRAG_MIN_CSS 14, EDGE_GUARD_CSS 16, BOSS_BAR_TILES 14, textos do modo de ajuste. - WorldScene: TAP_BODY_UP_TILES 0,6, NPC_TAP_TILES 1,2, NEW_SHEETS_PER_FRAME 1. - GameClient: SELF_INTERP_DELAY_MS 50, SELF_BLEND_TAU_MS 35. - interpolation.ts: INPUT_QUEUE_TICKS 1. - localCooldowns.ts: LOCAL_LOCK_SLACK_MS 200. - compass.ts: COMPASS_MIN_TILES 5. - exitGuard.ts: EXIT_CONFIRM_MS 3000. - tileLayer.ts: CANOPY_CHUNK 16. - hudTextures.ts: PIE_FRAMES 24, RING_FRAMES 40. - BootScene: PREGEN_MAP, PREGEN_ALAS, PREGEN_BUDGET_MS 10. - GalleryScene: BUDGET_MS 12. - entityView: LONG_LABEL_CHARS 10. - localServer: os números de entrada copiados de server/src/config.ts.
- Textos de tela novos (sugestão): - dica 'Inimigos para lá. Toque na seta para ir'; - aviso 'Sair do jogo? Volte de novo para sair'; - modo de ajuste: 'Arraste os botões para onde preferir', 'OK' e 'Padrão'; - 'Preparando os bonecos N/M'; - 'Carregando...' no index.html; - 'GERANDO N/M' na galeria.
- Para DECISIONS.md: - O cliente desenha em pixels físicos (dpr até 3), ao contrário da decisão anterior de desenhar em px de CSS. Com os Graphics trocados por texturas, o custo medido do quadro ficou menor que antes. - Avisos no chão no tempo da ação (RTT à frente). - O próprio boneco movido só pelo servidor é desenhado pelos snapshots.
- Sugestão para a área server/sim: um evento aditivo { t: 'respawn'; dst } em vez de 'death' no respawnAtHq. O cliente já se defende com shouldRevive, mas a intenção ficaria clara no protocolo.

## Em aberto ao fim da fase

- BALANCEAMENTO, o critério de pronto não passa: no torneio 1 contra 1 (npm run sim -- --todos --n 2), 10 arquétipos passam de 55% contra a média. São eles: cowboy_cromado 95,7%, arqueiro_das_estepes 91,3%, doktor_klaus 87,0%, bruxa_do_trovao 82,6%, diva_da_opera 82,6%, o_fiel 82,6%, iogue_furioso 78,3%, hacker_da_aldeia 71,7%, cidadao_revolucionario 60,9% e engenheira_de_gambiarra 60,9%. No grupo contra grupo, com só 10 lutas, coach_de_bem_estar, curandeira_dos_andes e o_fiel ficam em 100%, e o grupo só de dano vence 75% contra grupos misturados. O teste de regressão aceita essa lista fixa (ALERTA_CONHECIDO_1V1), e a trava real está desligada (it.runIf PQP_BALANCO=1).
- Peão Brabo contra Idol, o par do protótipo, dá 200 vitórias a 0 (100%). O Idol (suporte) nunca vence o Peão Brabo (tanque) no 1 contra 1. Pode ser esperado num duelo de tanque contra suporte, mas falta conferir se o dano e a cura do Idol estão funcionando no simulador.
- 60 fps num celular médio não foi medido num aparelho de verdade. Só o build foi conferido, e a abertura no navegador do celular pela rede local não foi testada nesta verificação.
- O critério 'quem nunca jogou entende os controles em 1 minuto' não foi validado com uma pessoa.
- Falta o commit da Fase 1 e a atualização do PROGRESS.md marcando a Fase 1 como concluída (a seção ainda diz EM ANDAMENTO). Isso fica com o orquestrador.
- No e2e, o robô chega ao aviso do chefe com 21/189 de vida, e o cenário não testa derrotar o chefe. A luta contra o chefe com o grupo e o modo automático não tem teste de ponta a ponta.
- Bundle do cliente grande para internet ruim: cerca de 2,8 MB sem compressão e uns 777 kB com gzip somando os blocos. Só o Phaser tem 1,2 MB (319 kB com gzip) e os dados 1 MB (259 kB com gzip).

