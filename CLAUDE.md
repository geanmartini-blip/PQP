# Briefing v17: Ponte que Partiu (nome provisório), action RPG online para celular,
# 2D pixel, público 30+

## Papel e objetivo
Você é o desenvolvedor principal de um action RPG online para celular, num servidor
persistente aberto a vários jogadores, feito por quatro amigos. O objetivo do piloto é um
jogo que rode no navegador do celular, divertido de jogar com o polegar e com internet
ruim. Trabalhe sozinho do começo ao fim, em fases pequenas, sem esperar aprovação entre
elas. As decisões abaixo estão fechadas: siga-as. Não pare para perguntar: decida,
registre a suposição em DECISIONS.md e siga.

## Fontes
Em docs/: Narrativa.md (história, lugares, personagens, treinadores, jornada),
Sistemas.md (regras, tabelas e números, com o resumo do que está decidido no topo) e
Arte.md (fichas de sprite, trajes, kit de criação e piadas visuais). Transforme as tabelas
em JSON de config: habilidades da classe e dos arquétipos, treinadores, espíritos e IAs,
talentos, itens, sets, trajes por nível, balanceamento, instituições, patentes, cargos,
estruturas, missões, lugares e masmorras. Os números de Sistemas.md são a fonte do
balanceamento.

## Stack
- Cliente: Phaser 3 + TypeScript + Vite, navegador do celular, tela em retrato, 60 fps
  num celular médio. Movimento com física arcade do Phaser, sem grade.
- Servidor de jogo em tempo real: Node + TypeScript com Colyseus, salas autoritativas a
  20 ticks por segundo para mapa, masmorras, arenas e colossos.
- Supabase: login, Postgres, persistência, economia e eventos; Realtime só para chat e
  avisos do mapa. Ticks de produção e IA de facção via pg_cron e workers.
- Capacitor para Android e iOS depois do piloto.
- Vitest para regras; simulador de combate sem interface para balanceamento.

## Controles e combate (ARPG fácil no celular)
- Joystick analógico que aparece onde o polegar toca, na metade esquerda. Movimento livre
  em qualquer direção e suave, nunca de quadrado em quadrado. Tocar no chão leva até lá.
- Alvo automático no inimigo mais perto que esteja à vista (nunca atrás de parede).
  Tocar perto de um inimigo, num raio de 1,5 tile, troca o alvo. Marcador sob o alvo.
- Ataque básico automático no alvo, inclusive andando.
- Na tela, só 3 habilidades, 1 Especial (brilha quando pronto) e 1 item, com botões
  grandes e posição ajustável. Botões 1 e 2: habilidades marca do arquétipo. Botão 3: 1
  das 4 habilidades da classe. Nos níveis 8 a 11, os 3 botões são habilidades da classe.
- Tocar usa a habilidade no alvo ou em volta. Segurar e arrastar só posiciona áreas, com
  guia de alcance. Nenhuma habilidade de mira livre.
- Tipos de habilidade: travada, em volta, área no alvo, cone (virado sozinho), campo e em
  aliado. Projéteis teleguiados; avanços vão sozinhos até o alvo; nada de ficar parado
  mirando nem segurar para carregar.
- Habilidades e talentos são de ARPG: recarga, aura, gatilho (ao acertar, ao derrotar,
  ao apanhar, com pouca vida) ou número. Nunca "uma vez por luta".
- Áreas com raio mínimo de 2 tiles e duração no chão. Ataques grandes de inimigos com
  aviso no chão de pelo menos 0,8 s.
- Recarga global de 1 s; recargas de 6 a 20 s; Especial carrega batendo, apanhando e
  curando, em 45 a 90 s; controles de 1 a 2 s com imunidade de 4 s; chefes só ficam
  lentos.
- Inimigos em bandos, elites com afixos e chefes com avisos no chão. Saque coletado
  sozinho, com filtro de raridade. Auto-caminho ao tocar numa missão.
- Aliado caído fica 30 s no chão; quem ficar 3 s ao lado o levanta.
- Modo automático pela Doutrina (até 5 cartas de regra), usado também no plantão e na
  queda de conexão.
- Rede: servidor decide dano, acerto, recarga e posição; cliente prevê movimento e
  animação; acerto com tolerância de 1 tile e compensação de até 250 ms. Jogável com
  200 ms de ping e 2% de perda de pacote.
- Só luta em grupo dá XP (plantonistas e IA contam); +15% por jogador ao vivo a mais.
  Solo dá itens e materiais. Grupo de até 4 no mapa e nas masmorras.

## Personagem e aparência
- O jogador cria o próprio personagem, em camadas como no Habbo e bem zoeiro: 5 corpos,
  15 tons de pele (3 zoeiros), 16 rostos, 20 cortes e 12 cores de cabelo, detalhes como
  dente de ouro e tatuagem com o nome errado. Os treinadores são NPCs, nunca jogáveis.
- Máquina de Visual grátis e sem limite em cada QG e no Delta (Espelho da Benzedeira e
  Cabine Neon): muda corpo, pele, rosto, cabelo, detalhes, a paleta do traje (3 por ala)
  e qual visual liberado mostrar. Nunca tira a silhueta da ala.
- Itens de classe mandam no visual: o traje da ala é a base, e cada item muda a sua parte
  dentro do estilo da ala. Itens sem classe adotam o estilo da ala. A raridade aparece.
- O visual evolui: Delta (1), uniforme da instituição (8), aprendiz (12), veterano (20),
  virada (30), mestre igual ao treinador (40) e lendário com aura (60).

## Visual
- 2D em pixel art, câmera de cima levemente inclinada. A arte lembra o Tibia, mas o
  movimento é livre e moderno. Bonecos no estilo Tibia e Habbo Hotel, cabeça grande.
- Tile de 32 px, boneco de 32x48 px, 4 direções, andar com 6 quadros por direção.
- Fichas em Arte.md: uniforme da base e os 3 treinadores de cada instituição.
- Efeitos em pixel, legíveis e sem exagero; aviso de área no chão; marcador no alvo.
- Interface simples e old school, botões grandes para o polegar, acabamento caprichado.
- Paletas: Esquerda em verde, terra e madeira; Direita em neon sobre concreto.
- Moradias com móveis em pixel decoráveis, como no Habbo.

## Tom
Público 30+. Humor ácido e crítica social para os dois lados e para a elite: na Esquerda,
burocracia, culto ao líder e vizinho fiscal; na Direita, boleto, meta, preço dinâmico e
"somos uma família"; acima dos dois, o Mirante. A piada mira manias e poder, nunca um povo.
Palavrão moderado. Textos em português do Brasil.

## O jogo em uma frase
Em 2077, Duas Margens, uma cidade de gente do mundo inteiro, está partida pelo Rio Claro.
Na Margem Esquerda, a nação das Raízes é mística, sustentável e coletiva. Na Margem
Direita, o Consórcio Neon é tecnológico, de mercado e polui o rio. A energia vem da Usina
da Ponte e da chopindita, mineral cor de chope da Serra. Cada lado culpa o outro pela
falta de energia, até descobrir que a elite das duas nações mora no Mirante e tem as
duas coisas. Não existe final.

## Regra Esquerda x Direita
- Esquerda = mística (Encanto, espíritos, totens, máscaras). Direita = tecnológica
  (máquina, implantes, robôs, hologramas). No mapa, a Esquerda fica à esquerda do rio.
- Atributos base iguais. A Direita ganha +10% com energia e perde 20% no apagão; a
  Esquerda ganha +10% com poluição 0 e perde 10% por ponto de poluição; Esquerda +5% na
  natureza, Direita +5% na cidade.
- Itens da Esquerda crescem com benzimento; os da Direita, com calibração.

## Sociedades
- Raízes: Assembleia e Conselho; patentes Membro, Militante, Conselheiro, Comissário;
  moeda Semente; feira de troca; casas de mutirão por lista de espera; Guarda
  Comunitária; posto de saúde grátis com fila; Rádio do Povo.
- Consórcio Neon: Acionistas e Diretoria; patentes Colaborador, Parceiro, Gerente,
  Diretor; moeda Crédito com score; shopping e app com taxa; cápsulas de aluguel; PM;
  planos de saúde; Agência e telões.
- Câmbio na ponte; contrabando pelo Juncal; moradia decorável para cada jogador.

## Etapas do jogador
(v0.3, a pedido do usuário; detalhes em docs/Jornada.md)
- 1 a 4: Delta. Cria o personagem e começa sem lado e sem classe; introdução e tutorial
  dos controles; chefe Bruno Ferro no 4.
- 5: a balsa do Seu Jacó; escolhe a margem e entra numa instituição, que define a
  classe; recebe o guia (espírito ou IA de bolso).
- 10: escolhe a ala, que é o arquétipo, treina com o treinador dela e ganha a 1ª peça
  do conjunto da classe.
- 11 a 19: a história chega cada vez mais perto da Ponte, sem acontecer nela. No 19, a
  cabeceira da Ponte dá a última peça do conjunto (vira a versão inicial da ala) e
  libera a troca de lado.
- 20: Arena da Ponte, Noite Escura e Acordo. Depois: invasões ao Mirante, masmorras,
  colossos e arenas nos níveis 40 e 60.

## Instituições, classes e treinadores
Cada margem tem um QG (Casa da Assembleia e Torre do Consórcio) e 4 instituições, cada
uma um prédio com quem treina a base, loja, treino, quadro de missões e patentes.
- Combatente: Brigada Popular / Torcida Fúria Neon. Peão Brabo / Sumô Cibernético,
  Iogue Furioso / O Fiel, Cidadão Revolucionário / Monstro da Academia.
- Atirador: Guarda Comunitária / PM do Consórcio. Babushka / Tropa de Choque, Arqueiro
  das Estepes / Cowboy Cromado, Caçador de Crocodilo / Diretor de Nollywood.
- Elemental: Escola dos Saberes / Universidade Neon. Druida Rabugento / Engenheira de
  Gambiarra, Bruxa do Trovão / Doktor Klaus, Curandeira dos Andes / Coach de Bem-Estar.
- Mascarado: Trupe do Povo / Agência Neon. Luchador Sagrado / Atendente Imortal, Diva da
  Ópera / Hacker da Aldeia, Malandro / Idol.
Cada classe tem 4 habilidades comuns e cada arquétipo 2 habilidades marca, todas com tipo
definido (tabelas em Sistemas.md). Cada ala tem um treinador NPC, gente do mundo inteiro,
que treina o jogador, dá as missões da ala e fala os bordões, que o jogador ganha como
emote. Espíritos guias e IAs de bolso dão bônus pequenos e falam nas missões.

## Talentos: um a cada 5 níveis
Sempre uma escolha entre opções, e todo talento pesa. 10 e 40: instituição; 15 e 50:
papel; 20: talento-chave; 25 e 45: margem; 30: virada (vira o Especial); 35: chave de
outra ala; 55: guia; 60: lenda; depois, um a mais a cada 5 níveis. Listas em Sistemas.md.

## Mundo e conteúdo
- Mapa aberto contínuo; encontros com IA e co-op primeiro, interação livre depois.
- Plantão: offline, o personagem fica no QG e luta pela Doutrina quando alguém o leva.
- Masmorras sem fundo, em tempo real, chefe a cada 5 andares.
- Colossos e alas do Mirante com vida compartilhada por dias, fase nova a cada hora,
  instâncias de até 20.
- Guerra só em arenas (níveis 20, 40 e 60), das 21h às 23h, temporada mensal.
- 5 slots de item (capacete, armadura com a calça, arma, calçado, adereço); comum, raro, único e set. Cargos por margem no ciclo semanal; IA de
  personalidade nas vagas. Pontos de controle por influência; saque máximo de 20%.

## Modelo de dados mínimo
- player: id, name, appearance {body, skin, face, hair, hair_color, details[],
  palette}, shown_visual_tier, stage, side, institution, class, archetype, rank,
  guide_id, level, xp, talent_picks[], loadout {slot3_ability}, equipment, inventory,
  doctrine[], on_duty, home_id, semente, credito, score
- ability: id, owner_key, slot, type (travada | em_volta | area_alvo | cone | campo |
  aliado), range, radius, cooldown, cost, telegraph_ms, effects[]
- item: id, slot, rarity, class_lock, visual_by_archetype{}, stats, unique_effect, set_id
- outfit_tier: archetype, level, layers[]
- institution (base_trainer_npc), archetype (trainer_npc), talent, guide, home, shop,
  listing, exchange_rate, set, region, structure, depot, control_point
- combat_room, combat_event, duty_assignment, dungeon_run, colossus, colossus_post
- arena_match, npc_leader, mirante_wing, ai_character, faction_role, mission, place,
  lesson, story_flag, cycle, world_event, event_log

## Escopo do piloto
1. Delta (1 a 4) com tutorial dos controles e o chefe Bruno Ferro.
2. Criação de personagem zoeira e Máquina de Visual.
3. Balsa no 5, duas margens, 2 QGs e as 8 instituições com missão de entrada.
4. As 16 habilidades de classe, os 24 arquétipos com trajes de aprendiz e veterano, e
   os 24 treinadores NPC com falas e bordões, tudo dirigido por dados.
5. Combate em tempo real completo, com modo automático, auto-caminho e saque
   automático.
6. Talentos dos níveis 10, 15 e 20; os 12 espíritos e as 4 IAs.
7. Sociedade básica: patentes iniciais, Semente e Crédito, feira e app, câmbio,
   moradia decorável.
8. Plantão, uma masmorra (Galerias da Usina, 5 andares e chefe) e encontros com IA.
9. Itens comum e raro com visual por ala, benzimento e calibração, 2 únicos.
10. Mapa: Delta, Margem Esquerda, Margem Direita, Usina da Ponte e Juncal.
11. IA de facção com Lazzaro Prati e Rolf Halvorsen.
Fora do piloto: talentos acima do 20, trajes acima do 20, arenas, Mirante, colossos,
troca de lado, interação livre, sets, cargos eleitos, ciclo semanal e comboios.

## Fases de trabalho
0. Plano: arquitetura, pastas, esquema dos JSON e DECISIONS.md.
1. Protótipo de movimento e combate: um mapa pequeno, movimento livre, um personagem
   template que alterna entre as alas do Peão Brabo e do Idol, os NPCs Wesley e Li Wei,
   alvo automático com linha de visão, 3 habilidades e Especial, dois tipos de inimigo,
   um elite e um chefe com avisos no chão, servidor autoritativo, teste com 200 ms de
   atraso simulado.
2. Criação de personagem, Máquina de Visual, Delta completo, tutorial e travessia.
3. As duas margens, as 8 instituições, os 24 arquétipos e os treinadores.
4. Sociedade, moradia e economia básica.
5. Masmorra, plantão e IA de facção.
Não pare entre as fases. Antes de cada uma, escreva o plano em 5 a 10 linhas no
PROGRESS.md e siga. No fim de cada fase: testes passando, commit no git, build que
abra no navegador do celular e PROGRESS.md atualizado com o que ficou pronto e o
próximo passo. Se a sessão recomeçar, leia o PROGRESS.md e continue de onde parou.
O que depender de nós (conta ou chaves do Supabase, publicação, lojas) não trava nada:
use Postgres local ou mock, deixe a integração pronta e anote em PENDENTE.md.
No fim, escreva um README curto: como rodar no PC e como abrir no celular pela rede
local.

## Critérios de pronto
- Quem nunca jogou entende os controles em 1 minuto, sem texto longo.
- Movimento fluido em qualquer direção, sem travar em grade.
- Jogável com 200 ms de ping e 2% de perda de pacote; 60 fps num celular médio.
- Toda habilidade acerta sem mira manual.
- Nenhum arquétipo acima de 55% de vitória contra a média no simulador.
- Testes cobrem combate com atraso simulado, tipos de habilidade, recargas, controles e
  imunidade, Doutrina, talentos, guias, modificadores, itens e visual por ala, Máquina
  de Visual, economia, moradia, influência, IA de facção, plantão e story_flags.
- Lore, fala ou número novo que não esteja nos docs vai marcado como sugestão.
