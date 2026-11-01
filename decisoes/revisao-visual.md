# Revisão visual: centro livre e cartões de habilidade

## Decisões

### audit


### fix

- LAYOUT FINAL DAS ZONAS em px de CSS para 375x812, medido no navegador com DPR 2. A câmera centra o boneco: corpo de y 374 a 422, pés em ~422.
- Z0, zona livre: x 127 a 247, y 300 a 500 (centerZone). Nada de interface de tela fica parado ali. Só passam o marcador do alvo, os avisos no chão, os números e os balões do mundo. O teste 'zona livre do centro' em ui.test.ts reprova botões, quadros, rastreador, faixa de mensagens, dicas e barra do chefe que cruzem Z0. O FALAR é contextual: em tela baixa (360x740 e tablet) ele pode encostar na borda de Z0, mas nunca no boneco; em 375x812 fica fora.
- Z1, topo: quadro do jogador x 8 a 184, y 8 a 85; quadro do alvo x 191 a 367, y 8 a 85. Engrenagem em x 8 a 64, y 93 a 149. MENU no lugar da ALA (x 303 a 359, y 80 a 136); no modo de teste, com a ALA na tela, ele vai para logo abaixo dela.
- Z1, rastreador compacto: uma linha de 32 px em y 92 a 124, centralizado na faixa x 76 a 293, entre a engrenagem e o MENU. Mostra seta e objetivo cortado com '…'; tocar liga o auto-caminho. A barra do chefe entra no lugar dele (nome em cima, barra em ~y 112 a 130, x 76 a 293), e só quando o chefe está perto. Na masmorra, a linha do andar ocupa essa faixa.
- Z2, faixa de mensagens: começa em y 163 (bannerY), uma mensagem por vez, centralizada, até 92vw. Ocupa 1 a 2 linhas (~34 a 52 px); a fala do guia vai a até 3 linhas (até ~233). Duração: 2,5 s; 1,2 s quando há fila; erro 3 s; fala do guia 2,5 a 6 s. Aviso com mais de 8 s na fila é descartado. O banner de nível usa essa mesma faixa, dourado, por 2,5 s (medido em y 157 a 220). Sem aviso na fila, a faixa mostra a dica do tutorial ('▶ Toque no botão 1'). Avisos do mapa (antes .f5-faixa), notices do servidor, saque e moeda entram nessa mesma fila.
- Dicas do protótipo (alvo, estilo, rumo) e texto 'Caído': bannerY + 52 a 56, ou seja y ~215 a 262. O aviso de nível do protótipo (noticeText) fica em bannerY.
- Z6, polegar direito: o arco fica como estava. b1 em (230,745), b2 em (253,688), b3 em (315,660), Especial em (313,747), item em (233,620), AUTO em (339,596) e FALAR em (225,548), com r de 28 a 42. A coluna de perto (loja, feira, câmbio, casa, Máquina de Visual, plantão, masmorra, Descer e Sair da masmorra) fica à direita do FALAR: x 261 a 367, com a base em y 560 (acima do AUTO e do 3), e cresce para cima. Saíram as âncoras centrais .f4-perto 46%, .f5-perto 54% e .acao 38%.
- Cartão de habilidade de primeira vez: à esquerda do arco, em x 8 a ~185 (para 14 px antes do b1). Fica na altura do botão citado, mas nunca acima de y 508 (Z0 + 8) nem abaixo da tela. Tem uma seta para o arco e pointer-events none.
- Z7, polegar esquerdo: a dica do andar fica em left 12, bottom 30% (y ~530 a 568). O joystick continua igual.
- Z8, modais: o diálogo com NPC fica embaixo (y ~558 a 800), cobre o arco enquanto está aberto e não toca em Z0. Enquanto ele está aberto, o MENU, o rastreador e a coluna de perto somem.
- Mundo, nomes e números: escala ~1,2 px de CSS por pixel da fonte, o que dá escala 1 e ~10 px de altura (antes 1,75, escala 2, ~20 px). Os números sobem 30 px em 600 ms (antes 22 px em 750 ms). O pool tem 8 números vivos, e golpes no mesmo alvo dentro de 200 ms se somam. O inimigo comum só mostra o nome quando vira alvo; não mostra mais o nível. O elite mostra só o nome. Saiu o nome duplicado acima do FALAR. '+N xp', 'nivel N!' e '+2 semente +8 credito' saíram de cima do boneco: o XP virou '+N XP' colado na barra de XP do quadro por 1,5 s; moeda e item viraram um aviso 'saque' somado na faixa Z2.
- Balões no mundo: no máximo 120 px de CSS de largura, fonte de 11 px, 2 linhas com '…', de 2,5 a 3,5 s, no máximo 2 balões de inimigo e um por pessoa. Quem fala a menos de 1,5 tile do jogador tem o balão erguido acima da cabeça do jogador. O balão do guia (.f3-guia) virou mensagem da faixa Z2, com o nome do guia em cima.
- MENU (☰) único: substituiu as linhas f3-linha e f5-linha (carteira, Escolher ala/Talento, Perfil, Bordão, Mochila, Doutrina, Mapa). Abre uma gaveta pela direita com botões grandes, que conta como modal. Ganhou o item 'Habilidades'. Um selo '!' no MENU avisa escolha pendente, novidade não vista ou dívida. No Delta, o MENU mostra Perfil e Habilidades.
- Desbloqueios: os 'Novo:' que chegam juntos viram UM aviso. Se for um só desbloqueio com até 44 letras, sai 'Novo: …'; senão, 'N coisas novas: veja no MENU, em Perfil'. O texto inteiro vai para o bloco 'Novidades' do Perfil.
- Habilidades, com a forma escolhida pela auditoria e sem toque longo nem modo '?'. (1) O cartão de primeira vez é automático e não pega toque. Mostra ícone, nome, tipo em palavra simples, o que faz em 1 linha (primeira frase da description, até 70 letras), recarga e custo com o nome do recurso, e 'Segure e arraste para posicionar' em área e campo. Vai um por vez, por 4 s ou até usar o botão; o tempo pausa com diálogo ou tela aberta; é guardado em localStorage 'pqp_habs_vistas' e espera o passo 'andar' do Delta. (2) A tela MENU > Habilidades e o bloco 'Habilidades dos botões' no Perfil mostram 4 cartões (ícone 48, Botão N, nome, tipo, recarga, custo, description inteira e gesto). (3) No celular, o número 1, 2 ou 3 aparece no canto do botão. (4) A dica do tutorial que cita um botão ganha uma seta piscando que chega por um lado livre do arco: o 1 pela esquerda, o 2 e o 3 por cima à esquerda, o Especial por baixo à esquerda.
- Rastreador: depois do Delta (no barco e na margem), as missões do Delta de nível abaixo de 8 que ficaram ativas não aparecem. A travessia_08, que também é do Delta, continua. Causa da missão do Delta na margem: o servidor mantém delta_01_cadastro ativa quando se usa dev_travessia ou se atravessa antes de fechar a cadeia. O cliente filtra; o servidor (shared) não foi alterado.
- Os ícones das habilidades não foram redesenhados: a auditoria não apontou ícones parecidos, só o glifo de tipo ilegível, e o cartão resolve isso.

### verificação

- FALAR some com a conversa aberta. Antes ele aparecia cortado pela borda de cima do quadro de conversa (y ~548 contra o topo do quadro em ~558).
- Com a conversa aberta, o arco inteiro sai: 1, 2, 3, Especial, item e AUTO. Em 360x640, o item e o AUTO ficavam meio cobertos pelo quadro. Ao fechar, eles voltam. O toque continua testando b.visible, então botão escondido não pega toque.
- O quadro de conversa vai no máximo até a metade da tela menos 30 px, ou seja, para logo abaixo dos pés do boneco. As opções rolam se não couberem. Em 360x640, o max-height antigo de 62% podia subir até y ~233 e cobrir o boneco (288 a 336). Agora o topo medido ficou em 388. Em 375x812 nada muda: o quadro tem ~290 px e o limite é ~376.
- A dica de tutorial 'A marca no chão é o seu alvo' só aparece quando há alvo marcado. No Delta ela ficava na faixa Z2 no cais, sem nenhum inimigo, e confundia.
- Objetivo de luta sem lugar no Delta, como 'Toque num inimigo para trocar o alvo': com nenhum inimigo à vista, a seta da borda aponta o bando mais fraco que esteja a mais de 8 tiles. Antes não havia seta nenhuma e tocar no rastreador não fazia nada. Tocar no rastreador agora anda até lá. Vale só no estágio 'delta'. Na primeira versão a seta mirava o bando mais perto, e isso levou o personagem de nível 2 a 7 mosquitos de nível 3, por isso passou a ser o mais fraco.
- O nome do inimigo alvo vai para baixo dos pés quando ele está colado logo abaixo do jogador (|dx| < 1,25 tile e dy entre -0,25 e 1,75 tile). Antes o nome 'SIRI DO MANGUE' passava em cima do corpo do jogador.
- Silhueta de oclusão: quando uma entidade fica na frente do próprio boneco (pés até 40 px abaixo e |dx| < 18 px), a silhueta clara dele é desenhada por cima. Era o caso do Bruno Ferro de pé na frente do jogador. Não liga atrás de árvores nem de props.
- A dica 'Seus golpes miram sozinhos' saiu de cima do FALAR, onde ia de x ~200 a 332 e y ~458 a 508 e cruzava Z0 (x ≤ 247). Agora fica na coluna à direita de Z0, com 2 a 3 linhas. O teste de ui.test.ts passou a exigir isso em 6 tamanhos de tela.
- A seta piscando do tutorial espera enquanto o cartão de habilidade está na tela. O cartão já tem a própria seta, e no botão 1 as duas setas se cruzavam em cima do texto do cartão ('Recarga 16 s · Custo').
- O cartão de primeira vez também espera enquanto o polegar está no joystick (ele fica no canto de baixo à esquerda, em cima do joystick) e enquanto a dica 'Arraste aqui para andar' do protótipo está na tela. Os dois se sobrepunham em 360x640.
- Na travessia, o cartão do guia mostrava a variável crua: 'Sua chance de morrer hoje é de {chance}%'. Agora a variável sem valor vira '?', a mesma regra das falas do guia em shared/guides.ts.
- Nada mudou no arco de botões, no rastreador, no MENU nem na faixa Z2: no navegador ficaram como o consertador descreveu.

## Sugestões (inventado, não está nos docs)

### fix

- SUGESTÃO, textos novos: 'N coisas novas: veja no MENU, em Perfil', 'Controle novo: veja no MENU, em Perfil', 'Novidades', 'Habilidades dos botões', 'Toda habilidade mira sozinha. As de área: segure e arraste o botão para posicionar.', 'Segure e arraste para posicionar', 'Toque, ou segure e arraste para posicionar', 'Carrega batendo, apanhando e curando', 'Menu', 'Carteira · N', 'Sair da masmorra', a linha curta do andar ('2º andar · salas 3/5 · chefe: X') e o aviso de saque ('+2 Semente · +8 Crédito · + Item').
- SUGESTÃO, números: as durações, tamanhos e limites desta revisão (aviso 2,5 s / 1,2 s com fila / descarte em 8 s; nível 2,5 s; cartão 4 s; balão 2,5 a 3,5 s, 120 px, 2 linhas, 2 de inimigo; números 600 ms, 30 px, 8 vivos, soma em 200 ms; +XP 1,5 s; escala de texto do mundo 1,2; Z0 de 120x200).
- Opcional: um campo `curta` em abilities_*.json para o cartão de 1 linha. Hoje ele usa a primeira frase da description, cortada em 70 letras com '…'. A maioria das descrições do Especial e algumas de arquétipo saem cortadas.
- Em telas baixas (360x740), descer o FALAR uns 30 px ou trocá-lo pelo botão de perto quando os dois aparecem juntos, para ele não encostar na borda de Z0.
- Os números de dano saem em escala 1 (~10 px) e ficaram legíveis no teste. Se o grupo achar pequeno, WORLD_NUMBER_CSS = 1.6 dá escala 2 só nos críticos e nos números de zoom baixo.

### final

- Silhueta de oclusão: cor 0xfff2c8, alpha 0,45 e gatilho de 40x18 px são números novos (SUGESTÃO).
- A seta para o bando mais fraco em objetivo de luta sem lugar, com distância mínima de 8 tiles (COMPASS_MIN_TILES + 3), é regra nova (SUGESTÃO).
- '?' no lugar de {chance} no cartão do guia na travessia segue a SUGESTÃO que já estava em shared/guides.ts.

## Em aberto

- No navegador, o HP passou do máximo em dois momentos: 211/210 (Peão Brabo) e 154/153 (Idol), no protótipo. Não investiguei, porque é cura ou regeneração em shared/servidor.
- Em dev_travessia, o servidor mantém delta_01_cadastro ativa, e o missions.alvo do servidor continua sendo essa missão do Delta. Na margem, o rastreador mostra 'Vá até a Torre do Consórcio', mas tocar nele não liga o auto-caminho: o alvo com coordenadas é o da missão do Delta. Na travessia, sem a travessia_08 ativa, o rastreador nem aparece. O conserto é no servidor/shared (missionStatus), que não é meu.
- Delta: o objetivo 'Toque num inimigo para trocar o alvo (0/2)' contou só 1 de 2 depois de vários toques e trocas de alvo por JS (tapTarget + tutorialControl). tutorialControl manda 'trocar_alvo' uma vez por sessão (sentControls), e o servidor local parece contar só o primeiro comando 'alvo'. Por isso não cheguei ao passo dos botões no Delta: vi o passo dos botões na aula do barco, que usa o mesmo cartão e a mesma seta.
- No Delta, 3 siris ou 7 mosquitos de nível 3 derrubam um jogador de nível 2 parado. É balanceamento, não interface.
- A dica do convés 'Ande pelo convés: a ponte já vem' (Z7, embaixo à esquerda) cobre o Seu Jacó na popa do barco enquanto está na tela. Deixei como está, porque é a posição combinada do polegar esquerdo.
- Logo depois do cadastro aparece o aviso '3 coisas novas: veja no MENU, em Perfil', que é ruído para quem acabou de chegar.
- Com 0 itens, o botão de item ainda mostra o número da recarga em cima do 'x0'.
- O cartão de habilidade some em 4 s, e com fala do guia e tutorial ao mesmo tempo é pouco tempo para ler 4 linhas. A lista completa fica em MENU > Habilidades.
- Ambiente: com o painel do navegador escondido, o requestAnimationFrame não roda. Para testar, religuei o loop do Phaser por JS (game.loop.raf.start(step, true, 16)), e não é bug do jogo. O watcher do Vite (OneDrive) perdeu uma edição de uniforme.ts até eu salvar o arquivo de novo. Não testei em aparelho de verdade nem com ?lag=200&loss=0.02. A masmorra e a coluna de perto com vários botões também não foram vistas.

