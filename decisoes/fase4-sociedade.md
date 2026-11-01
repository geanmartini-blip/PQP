# Fase 4: sociedade, moradia e economia

## Decisões

### regras

- Saldo nunca fica negativo. O aluguel que não se paga vira rec.economia.divida, e é isso que conta como 'ficar no negativo': o score cai com atraso_aluguel e com 'no_negativo' (-20 por ciclo, SUGESTÃO).
- O score só existe para quem é da Direita. Fora dela, as contas que dependem dele (taxa do app, faixa) usam o score inicial, 500. SUGESTÃO.
- Ganho de missão em moeda da outra margem entra na moeda da margem pela cotação base, 2 Créditos por Semente, com arredondamento e mínimo de 1. No Delta entra como veio. A mudança fica em applyRewards (missions.ts); o saque da simulação já usava 'da_margem'.
- Loja de NPC. A tabelada cobra o preço da tabela. A dinâmica cobra preço × fórmula de economy.json app.precoDinamico, com a variação limitada a ±variacaoPct da loja, × (1 + (taxaPct + taxaAppPp da faixa)/100). A faixa do score de quem compra mexer na taxa é SUGESTÃO. A poção vai para item_count, material que é recurso vai para resources e o resto vai para o inventário.
- A loja compra qualquer bem que tenha preço de referência, por 40% (compraDoJogadorPct) do preço da tabela dela ou do precoBase. Vender para loja dinâmica soma oferta; comprar soma procura.
- Feira. Item de precosTabelados sai pelo preço da tabela e entra na fila de retirada, com 20 s por pessoa à frente e até 180 s; o resto sai na hora. O preço livre tem teto de tetoLivreMult × referência. A troca direta vai até maxItensPorLado. Não há taxa. Só a Esquerda anuncia na feira.
- App. A taxa é taxaConsorcioPct + taxaAppPp do vendedor, fixada ao anunciar, mais taxaConveniencia. A venda gera venda_no_app. Só a Direita anuncia no app. Leilão, frete e assinaturas ficaram de fora.
- Quem vende pode estar offline: o que recebe (moeda, itens de troca, item vencido, eventos de score) fica em MarketState.pendencias até receberPendencias. O bem anunciado sai do registro na hora e fica guardado no anúncio.
- Câmbio. A cotação segue a fórmula de economy.json × um efeito de volume determinístico: cada 1000 Sementes líquidas vendidas tiram 5%, limitado a ±25% (SUGESTÃO: CAMBIO_K_VOLUME, CAMBIO_VOLUME_ESCALA, CAMBIO_VOLUME_MAX). A troca usa a cotação de antes dela. O limite de 2000 Sementes por ciclo fica em rec.economia.cambioCiclo. O volume zera a cada ciclo.
- A lista de espera fica no próprio registro (home.espera.ciclosRestantes), não na cidade: cada ciclo aplicado ao registro desconta 1. Ao zerar, o jogador muda da rede no galpão para a casa da lista e leva os móveis que couberem. O desbloqueio 'casa_propria' da missão do mutirão dá a casa de mutirão.
- Cápsula. O primeiro ciclo já vem pago, pelo desconto da travessia. O aluguel é porCiclo × preço de vida / 130, limitado a [1, 1,9]. Três ciclos de atraso dão despejo leve: os móveis vão para o inventário (e não para o depósito do doc, SUGESTÃO do piloto), a casa some e o score cai 150. Para morar de novo é preciso quitar a dívida e chamar alugarCapsula. A moradia inicial é dada uma vez só (economia.moradiaDada).
- Grade. O móvel ocupa w×h, que trocam nas rotações 1 e 3, e móveis não empilham. Móvel de parede fica numa camada própria, encostado na parede do fundo (y=0). O limite moveisMax conta também os de parede. Girar falha se o móvel girado não couber.
- Visitas. O padrão é 'margem'. Na permissão 'grupo', o servidor informa se o visitante está no grupo (mesmoGrupo). A outra margem só entra a convite. A visita é só leitura, sem o inventário e os dados de aluguel.
- O ciclo da cidade é sincronizado por registro (rec.economia.ciclo). tickCidade aplica o ciclo nos registros que o servidor passar; quem estava offline acerta no login com sincronizarComCidade, com no máximo 6 ciclos de uma vez (SUGESTÃO).
- Não precisei acrescentar nada em packages/shared/data: furniture.json (61 móveis), housing.json e economy.json já tinham tudo.

### arte

- Furniture ids are exactly the 47 in data/furniture.json: 20 Esquerda, 20 Direita, 7 Delta. The task's suggested list differs from the catalog (no letreiro 'somos uma família', pufe, armário, cadeira de praia or exercise treadmill), so the catalog wins, as the task required.
- Each item has 1, 2 or 4 rotations. Chairs, armchairs, beds, megaphone and fan get 4. Long items get 2 (hammock, bench, chest, stove, shelf, altar, solar panel, sleeping pod, aquarium, rugs). Square symmetric items get 1. Wall items get 1 and do not swap their footprint.
- Frame size: width = footprint × 32, height = footprint × 32 + up. Wall items draw on the wall above their footprint row, so the floor part of the frame stays empty.
- Three drawing layers: the body gets a selective outline, a shadow and floor-glow layer sits underneath, and a glow layer without outline sits on top (neon, flames, holograms).
- Each interior is a single texture: back wall 48 px tall, side walls 8 px, front edge 6 px. Mutirão has a plank floor, mud walls with brick showing through, a beam, a little window and the neighbors' signatures (one crossed out). Cápsula has a concrete floor with seams, stains and a drain, metal panel walls with rivets, cyan neon at the top, pink neon at the baseboard, and a rent-notice screen.
- UI icons are routed through the existing buildIcon with the ui_ prefix, so ArtApi.icon serves them with no new method.
- The art is pseudo-random only through prng with a fixed seed: no Math.random or Date, and the result is deterministic (covered by a test).
- Every drawing is marked SUGESTÃO in its module header (furniture.ts, interiors.ts, uiIcons.ts), because the docs do not describe the drawings.

### servidor

- SUGESTÃO: o ciclo da cidade do servidor dura 10 minutos por padrão (PQP_CICLO_CIDADE_MIN), seguindo a tarefa. housing.json diz que no piloto a duração vem da configuração. A cidade é conferida a cada 5 s.
- Há uma CityService por processo, compartilhada por todas as salas (mapas e casas), como o handoff.ts. Um core sem city cria uma só dele, e assim os testes antigos não mudaram.
- SUGESTÃO: a loja pede o balcão a 5 tiles. Feira e câmbio pedem o lugar a 8 tiles. App, carteira, dívida, catálogo de móveis, decoração e aluguel de cápsula valem de qualquer lugar (o app e o catálogo ficam no celular).
- A casa é uma sala do mesmo tipo 'mundo', com mapId 'casa:<id>' (filterBy mapId). Assim o cliente reusa joinOrCreate('mundo', {mapId}) e o mesmo protocolo de welcome e snapshot. O mapa é montado pelo tamanho do tipo da moradia, sem conteúdo nem ondas de inimigo.
- SUGESTÃO: os móveis não bloqueiam o movimento dentro da casa; são só visual e descanso.
- Andar até o marcador 'moradia' leva sempre para a própria casa. Para a casa de outro jogador, usa-se casa_visitar perto da porta (a até 4 tiles). Longe da porta, a casa só aparece para ver.
- A permissão de visita é conferida na sala de origem, que sabe do grupo pela partyId, e vira um passe de uso único. A sala da casa aceita esse passe ou confere visitarCasa de novo.
- Quem vende recebe na hora se estiver online em qualquer sala (deliverPending). Se estiver fora, recebe ao entrar na margem, porque o syncRecord chama receberPendencias.
- A sincronização com a cidade (ciclos, moradia inicial) só roda para registros na etapa margem. Registros do Delta ficam iguais.
- Os erros de economia vão só em 'economia_resultado' e não se repetem como 'aviso', como diz o contrato de net/game.ts. Os avisos do ciclo (aluguel, despejo, lista de espera) e as vendas recebidas saem como 'aviso' do tipo info.
- O pg_cron fica comentado e só alinha o ciclo no banco. Quem aplica aluguel e lista de espera nos registros é o servidor.

### cliente

- O inventário não tem mensagem própria e o contrato shared não é meu. Por isso o cliente lê um campo a mais, `inventario`, na mensagem 'carteira' (CarteiraInfo). O servidor local manda; o online precisa mandar também.
- A tela da loja mostra o preço da tabela na moeda da loja (a mesma regra de moedaDaLoja). Nas lojas dinâmicas aparece '~', porque o preço final com dinâmico e taxa sai no caixa do servidor. A estimativa de venda usa a mesma conta de precoVenda: 40% da tabela ou da referência.
- Lugares que abrem telas, por raio (SUGESTÃO): loja e porta de casa a 2,2 tiles; feira, shopping (app) e câmbio a 4 tiles. A porta só vale no mapa da própria margem, a feira só para a Esquerda e o app só para a Direita.
- O app do Consórcio também abre pela carteira, de qualquer lugar da Direita, porque é um app no celular (SUGESTÃO). A feira só abre no lugar dela ou pela vizinha ou pelo Yusuf.
- A casa abre pela porta do mapa (marcador 'moradia') ou pelo Teodoro no mutirão. Ela é desenhada num canvas do DOM com art.interior e art.furniture, em escala 2x, na ordem da pegada. Sem textura, cai numa grade simples.
- Modo decorar: tocar num móvel guardado escolhe; tocar no chão coloca (o de parede vai para y=0). Tocar num móvel colocado seleciona e mostra os botões Girar e Tirar; tocar no chão com um selecionado move. O catálogo mostra o estilo da margem e o do Delta.
- O botão de teste 'Andar a fila' só aparece com ?offline ou ?dev. O servidor local aceita esse atalho, a não ser com devTools: false.
- Servidor local (SUGESTÃO): vizinhos NPC repõem pelo menos 3 anúncios na feira (Vizinha da Braçadeira) e no app (Entregador de App) com as regras normais (anunciarFeira e anunciarApp), para haver o que comprar jogando sozinho. O que eles ganham é descartado.
- No servidor local, casa_visitar só abre a própria casa. Como só há um jogador, a casa de outro responde 'Ninguém em casa.'.
- O texto de cada operação vai só no economia_resultado (vira aviso no cliente), para não repetir o aviso. Os avisos do ciclo (aluguel, lista de espera) e das pendências do mercado continuam saindo como 'aviso'.

### verificação

- Causa do e2e instável: no caminho até a arena, o robô parava para brigar com cada bando de capangas e com o Cobrador, num raio de 6 tiles. Isso levava uns 45 s dos 90 s do passo. Quando ele caía, eram 30 s no chão mais a volta desde o spawn em (27.5, 72.5), e o tempo estourava. O ponto (30.5, 67.2) fica na passarela logo ao norte do spawn: é onde o robô estava, voltando, quando o tempo acabou. Conferi com o A* (findPath) que o caminho existe dali e do spawn com qualquer raio, entre 520 e 615 nós.
- Conserto, só no robô: no passo do chefe ele não para para lutar no caminho (o ataque básico automático continua) e luta só com o chefe ou perto da arena. O passo caiu de cerca de 57 s para cerca de 15 s, sem nenhuma queda. O jogo, o mapa e o balanceamento não mudaram.
- Ponta a ponta da Esquerda em código, todo pelas mensagens do servidor (GAME_MSG):   - ganha Semente com saque de moedas no chão, coletado sozinho;   - compra na loja da Brigada, no balcão;   - anuncia na feira e outro jogador, de outra sala, compra; o vendedor recebe o preço cheio, sem taxa;   - entra na lista de espera da Assembleia com casa_lista_espera; o segundo pedido é recusado;   - vai à Usina pela saída do mapa, numa troca de sala de verdade, e troca 100 Sementes no câmbio;   - a lista anda um ciclo por vez com city.tick até sair a casa_da_lista;   - compra o banco_de_madeira e põe na casa;   - outro jogador visita e vê o banco.
- Ponta a ponta da Direita: começa sem casa, aluga a cápsula com casa_alugar e paga o 1º ciclo. O ciclo seguinte cobra em dia. Sem saldo, os atrasos vão a 1 e 2 e no 3º vem o despejo: casa null e dívida de 3 aluguéis. Despejado com dívida, o novo aluguel é recusado.
- O registro de teste da Direita recebe rank 'colaborador', porque a cápsula pede patente colaborador. A travessia de verdade já dá patentes[0] (travessia.ts:164); o margemRecord dos testes não dava.

## Sugestões (inventado, não está nos docs)

### regras

- SUGESTÃO: limites de anúncio por jogador: 6 na feira e 10 no app. Até 5 lugares na fila da feira.
- SUGESTÃO: evento de score 'no_negativo', de -20, no ciclo que termina com dívida.
- SUGESTÃO: efeito de volume no câmbio, com k = 0,05 por 1000 Sementes líquidas e limite de ±25%.
- SUGESTÃO: no máximo 6 ciclos aplicados de uma vez quando o jogador volta.
- SUGESTÃO: despejo leve, com os móveis indo para o inventário em vez do depósito da Torre.
- SUGESTÃO: textos de erro com piada, por exemplo 'Comprar de você mesmo é coisa de acionista.', 'Especulação é coisa da outra margem.' e 'Assine o Plano Lojista para mais. (Brincadeira. Por enquanto.)'.

### arte

- Visual jokes added (all SUGESTÃO): a folded ata (meeting minutes) under the bench's short leg; the quota board with a huge VIZINHO (neighbor) bar; Nayra's portrait hung crooked; the smart fridge screen advertising milk; the plastic plant still wearing its price tag; KENJI +300% on the wall TV; a BET patch on the Neon FC flag; duct tape on the stilt-house fan; a boleto (bill) caught in the fishing net.
- If the catalog grows, items from the task list missing from furniture.json (letreiro 'somos uma família', pufe, armário, cadeira de praia, totem pequeno, rádio do povo, exercise treadmill) can get their own drawings. Until then they fall back to the crate.

### servidor

- Mover buildHouseMap (server/src/house.ts) para shared/map. Assim o cliente monta o mesmo TileMap da casa para a previsão de movimento, em vez de copiar o layout.
- Acrescentar ao contrato uma mensagem 'casa_sair' ou 'casa_entrar' explícita, para o botão de porta no celular, além de andar até a porta.
- Fazer a sala da casa expulsar a visita quando o dono muda a permissão para 'so_eu' ou quando a casa some num despejo.
- Atualizar os medidores da cidade (precoDeVidaDir, energiaDir, influenciaEsq, apagaoDir) a partir da IA de facção e do mapa na Fase 5. Hoje ficam vazios, que é o estado normal.
- Quando a lista de espera tirar o jogador da rede no galpão, a sala de casa aberta continua com o mapa do tipo antigo até esvaziar. Reabrir a sala ao mudar de tipo.

### cliente

- // SUGESTÃO: a linha de resultado fica 4 s dentro da tela (RESULT_MS).
- // SUGESTÃO: textos das telas: títulos 'Feira de troca', 'App do Consórcio' e 'Câmbio da Ponte'; 'Sem moradia. Os prédios de cápsulas têm vaga (sempre têm).'; 'Nada para anunciar. Vá caçar, colega.'; 'Ninguém em casa.'; 'Avalie com 5 estrelas!' na compra do app; e as falas de fila e retirada da feira.
- // SUGESTÃO: os raios SPOT_RADIUS=2,2, PLACE_SPOT_RADIUS=4 e NPC_SHOP_RADIUS=6, e a tabela NPC_SPOTS (quem abre o quê no diálogo).
- // SUGESTÃO: NPC_SELLERS e NPC_LISTINGS_MIN=3, com os bens e preços dos vizinhos NPC no servidor local.
- // SUGESTÃO: CITY_TICK_TICKS=20 (a cidade anda 1 vez por segundo no servidor local).

### final

- Mudar o margemRecord dos testes da Fase 4 para já dar a patente inicial da margem, como faz a travessia.
- Ter um teste de ponta a ponta com o mutirão em grupo (ajudouNoMutirao e receberCasaDeMutirao). Hoje só a lista de espera tem esse teste.
- Ter um passo no e2e de rede, com 200 ms e 2% de perda, que exercite uma mensagem de economia, como uma compra na loja, pelo Colyseus de verdade.

## Em aberto

- Há um vite de desenvolvimento rodando na porta 5180 (node, pid 3452, packages/client). Não fui eu que subi e não mexi nele; os processos que eu iniciei, o servidor do e2e, saíram sozinhos (saiu: true).
- Nada foi commitado (por regra). PROGRESS.md e DECISIONS.md não foram atualizados (fora da minha posse): falta registrar o conserto do e2e e o fim da Fase 4.
- No ponta a ponta, o jogador ganha a Semente por um saque posto direto no mundo (spawnLoot), não por um inimigo morto: o saque de inimigo é aleatório e já tem teste próprio.
- A visita do ponta a ponta mostra a casa só de leitura, sem passar pela porta; a entrada na sala casa:<id> já tem teste no describe 'decorar e visitar a casa'.

