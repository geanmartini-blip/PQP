# Arte

Fichas para criar os bonecos, no formato da referência do Pregador de Rua: cada instituição tem uma ficha com o uniforme da base e os 3 treinadores das alas, que são NPCs. A estética pode ser mais zoeira que a referência. O que importa é a piada aparecer no pixel.

## Regras de arte

- **Formato da ficha:** uma linha para a base e uma para cada evolução. À esquerda, o boneco em 4 direções (frente, lado, costas e outro lado). À direita, 3 poses com equipamento ou habilidade marca. Na coluna Detalhes, retrato de rosto, emblema da instituição e paleta de 5 cores.
- **Tamanho:** tile de 32 px; boneco de 32×48 px, que sobe meio tile; o movimento é livre e suave, sem andar de quadrado em quadrado; retrato e emblema de 64×64 px.
- **Animações:** parado (2 quadros), andando (6 por direção, para o movimento livre ficar suave), ataque básico (3), cada habilidade marca (4), Especial (6), vitória (3) e derrota (3). O ataque básico precisa funcionar andando, para o combate em tempo real não travar.
- **Proporção:** cabeça grande, cerca de 2,5 cabeças de altura, entre o Tibia e o Habbo. A silhueta precisa ser reconhecível mesmo em miniatura.
- **A piada mora no adereço:** cada boneco tem um adereço exagerado, uma cara característica e uma piada nas costas (estampa, etiqueta ou adesivo), porque as costas são o que mais aparece andando pelo mapa.
- **Evoluir é ficar mais forte e mais ridículo:** a base é modesta, o arquétipo exagera a mania e a virada do nível 30 ganha uma variante de sprite. Cada evolução da ficha é o visual completo do treinador da ala; o jogador começa numa versão mais simples e completa o visual com itens e com a virada.
- **Efeitos:** Encanto em folhas, brilho verde e espíritos translúcidos; máquina em faíscas, glitch, neon e notificações pipocando. Tudo em pixel, legível e sem exagero. Ataques em área mostram no chão um aviso (círculo ou cone) antes de cair, e o alvo travado ganha um marcador embaixo dos pés.
- **Paletas:** Esquerda em verde, terra e madeira; Direita em concreto e neon. Cada instituição tem a sua cor de destaque.
- **Limite da zoeira:** a piada é com a mania, a profissão e o poder, nunca com um povo. Sem marcas reais nem pessoas reais.

## Personagem do jogador

O jogador cria o próprio boneco e veste o que aprende. Os treinadores são NPCs com sprite próprio.

- **Template em camadas, como no Habbo, e zoeiro:** 5 corpos (baixinho, médio, alto e magrelo, fortão e barrigudo), 12 tons de pele mais 3 zoeiros (vermelho de sol, marca de regata e cinza de quem não dorme), 16 rostos (com cara de sono, sorriso amarelo e sobrancelha de vilão), 20 cortes de cabelo (de mullet a calvície com cabelo penteado por cima) e detalhes como dente de ouro, olheira e tatuagem com o nome errado.
- **Máquina de Visual:** troca tudo isso de graça, a qualquer hora. Na Esquerda é o Espelho da Benzedeira; na Direita, a Cabine Neon.
- **Trajes por nível:** cada ala tem 5 trajes, que precisam ser desenhados: aprendiz (12), veterano (20), virada (30), mestre (40, igual ao treinador) e lendário (60, além do treinador, com aura).
- **Itens de classe mandam no visual:** cada item da ala tem desenho próprio por slot e por raridade, e a silhueta da ala nunca some.
- **Nas fichas:** a linha Base mostra o uniforme da instituição num corpo genérico; as linhas de evolução mostram o treinador de cada ala, que é o visual de mestre.
- **Kit de criação:** cada camada em 4 direções, com as mesmas animações do boneco.

Prompt para o kit de criação:

```
Pixel art character creator kit for a 2D top-down online RPG in the style of Tibia and
Habbo Hotel, funny and satirical. Chibi proportions (about 2.5 heads tall), 32x48 px
characters, 4 directions. Separate rows: 5 body types (short, medium, tall and skinny,
buff, potbellied) in a plain tank top and shorts; 15 skin tones including sunburnt red,
tank-top tan lines and sleepless grey; 16 faces with fight, victory and defeat
expressions, including sleepy face, awkward smile and villain eyebrows; 20 hairstyles
(including bald, mullet, comb-over, afro, mohawk and a cap); beard, moustache, goatee,
glasses, scar, mole, gold tooth, dark circles and a tattoo with a misspelled name; the
starter outfit (t-shirt printed "Lembrança do Delta", shorts, flip-flops). Every part on a
transparent background, aligned to the same anchor so the layers stack. At the end, three
assembled silly characters on a dark tiled floor. No real brands, no text except row
labels and the t-shirt print.
```

## Prompt para gerar uma ficha

Troque o que está entre chaves pelo conteúdo da ficha da instituição. O prompt está em inglês porque os geradores de imagem costumam acertar mais assim.

```
Pixel art character sprite sheet for a 2D top-down online RPG in the style of Tibia and
Habbo Hotel. Clean, high-quality pixel art, chibi proportions (about 2.5 heads tall),
bold readable silhouettes, satirical and funny, dark tiled floor background.

Layout: 4 rows. Row 1 titled "BASE – {base}", rows 2 to 4 titled "EVOLUÇÃO – {arquétipo}".
In each row: the character in 4 directions (front, side, back, other side) on the left,
and 3 action poses with signature props on the right. Right column titled "DETALHES":
close-up pixel portrait, the institution emblem ({emblema}) and 5 palette swatches.
Section titles on dark plaques with small icons, serif font.

Characters (keep the joke visible in props, faces and back prints):
- Base: {visual da base}
- {arquétipo 1}: {visual}; poses: {3 poses}
- {arquétipo 2}: {visual}; poses: {3 poses}
- {arquétipo 3}: {visual}; poses: {3 poses}

Palette: {paleta}. Effects: {green leaves and translucent spirits | sparks, glitch, neon}.
No real brands, no real people, no text except the titles and the printed jokes.
```

Exemplo pronto, da Agência Neon:

```
Pixel art character sprite sheet for a 2D top-down online RPG in the style of Tibia and
Habbo Hotel. Clean, high-quality pixel art, chibi proportions (about 2.5 heads tall),
bold readable silhouettes, satirical and funny, dark tiled floor background.

Layout: 4 rows. Row 1 "BASE – TRAINEE", row 2 "EVOLUÇÃO – ATENDENTE IMORTAL", row 3
"EVOLUÇÃO – HACKER DA ALDEIA", row 4 "EVOLUÇÃO – IDOL". In each row: 4 directions on the
left, 3 action poses on the right. Right column "DETALHES": portrait of the Idol, emblem
(a star with a hologram eye) and 5 palette swatches.

- Base: cheap suit one size too big, giant "TALENTO" badge, headset, ring light clipped
  to the shoulder, forced smile. Poses: unrolling a contract down to the floor, selfie,
  pointing at the ring light. A long exclusivity contract drags behind him.
- Atendente Imortal: headset, rolling office chair she rides around, mug "MELHOR
  ATENDENTE DO MÊS 2071", hologram shield "AGUARDE". Poses: sliding on the chair, a
  loading bar stuck at 99% over an enemy, shield up. Customer-service smile that never
  changes.
- Hacker da Aldeia: hoodie with pixel village patterns, headphones, laptop with sticker
  "FIBRA ÓTICA NA ALDEIA", a hammock with a router hanging from it. Poses: typing with
  green code rising, pixel-bug viruses swarming, a billionaire's server on fire behind
  him. When idle he fights lying in the hammock.
- Idol: pastel hair with a perfect fringe, sparkly jacket, headset mic, flying speaker
  drones, holographic stage. Poses: dance choreography, fanchant with hearts and sound
  waves, encore with confetti rain. Hologram fan lightsticks pop up behind him.

Palette: neon pink, cyan, white, silver, black. Effects: sparks, glitch, neon.
No real brands, no real people, no text except the titles and the printed jokes.
```

## Margem Esquerda

### Brigada Popular (Combatente)

Emblema: punho segurando uma muda de planta numa coroa de trigo. Paleta: vermelho desbotado, verde-musgo, bege, marrom e creme.

| Linha | Visual | 3 poses | Piada |
| --- | --- | --- | --- |
| Base: Brigadista Novato | Camiseta desbotada da "Assembleia de 2071", bermuda de tactel, chinelo com meia, braçadeira e mochila estourando de panfleto | Megafone de lata reciclada; cabo de enxada; tampa de panela como escudo | Costas: "COMISSÃO DE FRENTE", pintado à mão e torto |
| Peão Brabo | Chapéu maior que o corpo, fivela do tamanho de um prato escrita TOURO, camisa xadrez aberta, bigode e botina, com um touro-espírito translúcido bufando atrás | Laço benzido girando; peito estufado com uma seta piscando "VEM NI MIM"; montado no inimigo, em rodeio | Costas: adesivo "100% MACHO" descascando. Com Desconstruído, vira "100% PARCEIRO" e ele ganha um avental |
| Iogue Furioso | Coque, roupa de linho, olheira funda, tapetinho de yoga enrolado nas costas e uma veia pulsando na testa | Lótus flutuando com aura azul; meio virado, com um braço de tigre e o resto ainda zen; tigre inteiro, ainda de coque | Medidor de calma em cima da cabeça, do verde ao vermelho; garrafinha de kombucha na cintura |
| Cidadão Revolucionário | Boina, bigode fino, cachecol de três cores, camisa listrada e xícara de café sempre na mão | Em cima de uma barricada de cadeiras de bistrô; discurso no megafone com a xícara erguida; fincando a placa GREVE no chão | Costas: lista de reivindicações enrolada que arrasta no chão e cresce a cada nível |

### Guarda Comunitária (Atirador)

Emblema: olho dentro de uma casinha com cerca. Paleta: verde-oliva, amarelo refletivo, cinza, marrom e branco.

| Linha | Visual | 3 poses | Piada |
| --- | --- | --- | --- |
| Base: Vigia de Quarteirão | Colete refletivo, braçadeira, chinelo, binóculo no pescoço e prancheta "QUEM ENTROU / QUEM SAIU" | Olhando de binóculo; apitando de bochecha cheia; estilingue | Costas: "ESTOU DE OLHO", com um olho bordado torto |
| Babushka | Lenço florido, casaco de pele falsa enorme, sacola de feira com pão e espingarda benzida com um ramo de flores no cano | Atirando apoiada na sacola; Xale de Lã aberto como escudo gigante; oferecendo um prato de sopa ao inimigo | Rolo de massa na cintura, mira de crochê e olhar de julgamento no retrato |
| Arqueiro das Estepes | Chapéu de pele pontudo, arco recurvo e um cavalo-espírito que é um pônei pequeno demais para ele | Tiro girando, com linhas de movimento; galope com os pés arrastando no chão; parado no pônei, que bufa | O pônei-espírito tem cara de quem quer pedir demissão |
| Caçador de Crocodilo | Chapéu safári com dentes de crocodilo, bermuda cáqui, camisa de 14 bolsos e curativo pelo corpo todo | Armando o laço; apontando com olhos brilhando e o balão "Crikey!"; abraçado a um crocodilo que morde o chapéu dele | Os curativos aumentam a cada nível |

### Escola dos Saberes (Elemental)

Emblema: árvore com um livro aberto no lugar da copa. Paleta: verde-folha, marrom-casca, ocre, azul-água e creme.

| Linha | Visual | 3 poses | Piada |
| --- | --- | --- | --- |
| Base: Aprendiz | Túnica de saco de estopa, mochila escolar, óculos tortos e um cajado que é cabo de vassoura com uma folha | Lendo um livro maior que ele; plantando um totem que ainda é muda; regador | Crachá "ESTAGIÁRIO DO SABER (HÁ 7 ANOS)" |
| Druida Rabugento | Barba que arrasta no chão, túnica de musgo, sandália de pedra e cajado com a placa "SAIA DA GRAMA" | Fincando um menir-totem; apontando bravo com um "!" em cima; cochilando em pé no círculo de pedras | Um passarinho fez ninho na barba e reclama junto |
| Bruxa do Trovão | Tranças, capacete de chifres com etiqueta "RÉPLICA" e um chifre de beber transbordando faísca | Brinde que faz cair um raio; Fim de Festa, com tempestade e confete; soluço que solta faísca | Bochechas sempre vermelhas; o chifre nunca esvazia |
| Curandeira dos Andes | Poncho colorido, chapéu de aba e um totem de lhama de madeira | Balde de Água da Nascente; lhama cuspindo num inimigo; mostrando a senha de fila "Nº 347" | Uma fila de pacientes em miniatura atrás dela |

### Trupe do Povo (Mascarado)

Emblema: máscara sorrindo com uma lágrima pintada. Paleta: vinho, dourado-velho, preto, creme e verde-musgo.

| Linha | Visual | 3 poses | Piada |
| --- | --- | --- | --- |
| Base: Figurante | Malha preta de teatro, chapéu-coco e máscara de comédia de um lado e tragédia do outro | Reverência exagerada; trocando de máscara; levando um tomate na cara | Tomate esmagado permanente no ombro |
| Luchador Sagrado | Máscara de luchador com raio dourado, capa feita de cortina de teatro, cinturão de papelão e botas brilhantes | Voadora; braços cruzados em pose heroica; segurando a máscara com as duas mãos para não cair | Um olho de espírito que pisca na testa da máscara |
| Diva da Ópera | Vestido que ocupa dois tiles, máscara veneziana, leque e peruca alta com um passarinho dentro | Nota aguda com ondas e vidro estilhaçando; recebendo flores numa reverência; desmaio dramático | O vestido arrasta os aliados que passam perto |
| Malandro | Terno branco impecável, chapéu de palha, sapato bicolor, palito e cordão | Gingado; dando uma rasteira e catando a Semente que cai; encostado num poste | O terno nunca suja, nem no esgoto |

## Margem Direita

### Torcida Fúria Neon (Combatente)

Emblema: caveira de neon com coroa de louros e uma bola. Paleta: preto, roxo-neon, verde-limão, cinza-concreto e branco.

| Linha | Visual | 3 poses | Piada |
| --- | --- | --- | --- |
| Base: Torcedor Organizado | Camisa do Neon FC patrocinada por casa de aposta, bermuda, tênis de mola, pochete e bandeira enrolada | Batendo bumbo; erguendo sinalizador; girando a bandeira | Tatuagem de QR code do sócio-torcedor no braço |
| Sumô Cibernético | Barriga hidráulica cromada com manômetro, coque com antena e mawashi de LED | Barrigada; pisada de sumô com vapor saindo dos pistões; sentado tomando energético | Aviso na barriga: "MANTENHA DISTÂNCIA" |
| O Fiel | Regata, viseira, cicatriz na sobrancelha, cachecol e manoplas pintadas nas cores do Neon FC | Invasão de Campo, correndo; sinalizador na mão; com Consciência, levantando um torcedor do Raiz FC | Costas da regata: "FIEL ATÉ O BOLETO" |
| Monstro da Academia | Braços gigantes, pernas finas de quem pulou o treino de perna, pau de selfie com a live ligada e galão de água | Bíceps com contador de curtidas subindo; grito de "BORA" com corações; selfie no meio da luta | Pernas de palito em todas as poses |

### PM do Consórcio (Atirador)

Emblema: escudo com cifrão estilizado e uma câmera. Paleta: cinza-chumbo, azul-neon, preto, amarelo-alerta e branco.

| Linha | Visual | 3 poses | Piada |
| --- | --- | --- | --- |
| Base: Soldado Terceirizado | Farda cinza com "PROTEÇÃO PREMIUM", colete com QR code, câmera corporal, cassetete-lanterna e maquininha de cartão no cinto | Lanterna na cara de alguém; apito; cobrando "taxa de proteção" na maquininha | A luz da câmera corporal está sempre apagada |
| Tropa de Choque | Armadura de choque, óculos escuros à noite, escudo escrito "HOJE NÃO" e prancheta da lista | Escudo em bloqueio; conferindo a lista; braços cruzados | Cordão de isolamento de veludo vermelho, de balada |
| Cowboy Cromado | Chapéu com GPS piscando, braço cromado, revólver com mira laser e espora de LED | Saque rápido; duelo ao meio-dia com uma planta seca de holograma rolando; girando o revólver | Ele carrega o próprio projetor de planta seca de faroeste |
| Diretor de Nollywood | Boné virado, claquete, megafone e dois drones-câmera em órbita | "Corta!" com flash; brigando com um drone; filmando o inimigo de perto | Cadeira de diretor dobrável com o nome escrito errado |

### Universidade Neon (Elemental)

Emblema: capelo de formatura com um plugue de tomada. Paleta: azul-elétrico, branco, cinza, laranja de segurança e preto.

| Linha | Visual | 3 poses | Piada |
| --- | --- | --- | --- |
| Base: Calouro | Moletom "UNIVERSIDADE NEON — MENSALIDADE EM ATRASO", rosto pintado do trote, mochila e notebook cheio de adesivo | Digitando no notebook; montando um robô de copo plástico; segurando o boleto da mensalidade | O livro da mochila tem cadeado de assinatura |
| Engenheira de Gambiarra | Macacão sujo de graxa, óculos de solda, fita prata em tudo e um robô feito de geladeira com rodinhas de skate | Chave de fenda soltando faísca; robô-geladeira abrindo a porta com luz saindo; levantando a barreira de sucata | Lacre "GARANTIA VIOLADA" em todas as peças |
| Doktor Klaus | Jaleco chamuscado, cabelo arrepiado de eletricidade, óculos de proteção e uma bobina de Tesla nas costas | Raio em cadeia; experimento explodindo com o cabelo pegando fogo; mostrando a patente carimbada | Placa nas costas: "0 DIAS SEM ACIDENTE" |
| Coach de Bem-Estar | Legging, viseira, garrafa d'água gigante e uma aura de nanobots rosa | Pose de yoga com nanobots; cura com coração rosa; oferecendo o cartão dourado do plano Ouro | Crachá "COACH QUÂNTICA CERTIFICADA" |

### Agência Neon (Mascarado)

Emblema: estrela com um olho de holograma no meio. Paleta: rosa-neon, ciano, branco, prata e preto.

| Linha | Visual | 3 poses | Piada |
| --- | --- | --- | --- |
| Base: Trainee | Terno barato um número maior, crachá gigante "TALENTO", headset e ring light presa no ombro | Desenrolando um contrato até o chão; selfie; sorriso forçado apontando para a ring light | O contrato de exclusividade arrasta atrás dele |
| Atendente Imortal | Headset, cadeira de escritório com rodinhas em que ela anda, caneca "MELHOR ATENDENTE DO MÊS — 2071" e escudo holográfico "AGUARDE" | Deslizando de cadeira; barra de carregamento travada em 99% em cima do inimigo; escudo erguido | Sorriso de atendimento que nunca muda, nem apanhando |
| Hacker da Aldeia | Moletom com grafismo da aldeia em pixel, fones, notebook com adesivo "FIBRA ÓTICA NA ALDEIA" e uma rede de dormir com roteador pendurado | Digitando com código verde subindo; vírus em forma de insetos de pixel; servidor de bilionário pegando fogo ao fundo | Parado, ele luta deitado na rede |
| Idol | Cabelo pastel de franja perfeita, jaqueta brilhante, microfone de headset, caixas de som voadoras e palco holográfico | Coreografia; Fanchant com corações e ondas sonoras; Encore puxando os inimigos para o palco, com chuva de confete | Bastões de luz de fãs-holograma aparecem atrás dele a cada combo |

## Rostos da história

| Personagem | Visual | Piada |
| --- | --- | --- |
| Seu Jacó | Pescador de chapéu de palha furado, vara remendada e um bagre de estimação num balde | Reclama de tudo com o dedo em riste |
| Bruno Ferro, o Capataz | Colete de couro, corrente dourada falsa e duas maquininhas, uma de Semente e outra de Crédito | Sorriso de vendedor que não fecha nunca |
| O Sombra | Capa preta com dois crachás pendurados, um de cada margem | Os dois crachás dizem "FUNCIONÁRIO DO MÊS" |
| Nayra Sundaram | Holograma de telão com moldura de flores e auréola de sol nascente | Quando cai, vira pixels quebrados e uma tela de "SEM SINAL" |
| Kenji Albrecht | Holograma de telão com um gráfico subindo atrás | Quando cai, o gráfico despenca junto e ele trava numa pose de palestra |
| Seguranças do Mirante | Terno branco, luvas brancas e um fone transparente | Limpam o chão por onde os invasores passaram |
| Mordomo-robô do Mirante | Robô de fraque com bandeja de prata | Oferece canapé até no meio da luta |
