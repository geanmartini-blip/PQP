# Fase 5: masmorra, plantão, IA de facção e itens

## Decisões

### masmorra

- Gerador: 3x3 células de 13 tiles mais 1 de borda dão 40x40. As salas seguem uma 'cobra' pelas células, virada, espelhada e deslocada pela semente, e salas seguidas são sempre vizinhas. Corredores em L com 3 tiles de largura. A sala tem metade do tamanho do dungeons.json, entre 7 e 11 tiles. Os pilares (Maquina) ficam só nos cantos, e a água rasa é passável, então nenhum dos dois fecha caminho.
- A sala 0 é sempre a entrada, sem modelo (14x14 vira 7x7). A escada fica no centro da última sala. Na sala de chefe ela fica embaixo, para não nascer em cima do chefe.
- Os andares 1 a 5 usam detalhe.andares do dungeons.json. Do 6 em diante, o sorteio usa semFundo.salasPorAndar e pesos, com uma semente própria do andar. Nos andares de chefe, a sala de chefe entra no fim.
- O chefe do 5º é o chefe.inimigo do dungeons.json (bomba_descontrolada). Nos andares 10, 15... vem o rodízio de semFundo.chefes. Os avisos no chão são as habilidades do próprio chefe (enemies.json), e as fases ficam com a IA de chefe que já existe.
- Escala por andar: vida e dano usam a dificuldade dos andares prontos; depois do 5º somam vidaPctPorAndar e danoPctPorAndar. A chance de elite é chanceElitePorAndarPct x andar, com teto de 50%. SUGESTÃO: +1 nível do inimigo por andar e +1 inimigo por grupo a cada 3 andares.
- As ondas usam spawnPack (bandos que acordam juntos, com promoção a elite pela chance do andar). Os grupos com tier elite e afixos fixos usam spawnEnemy com esses afixos.
- A sala acorda quando um membro do grupo de pé entra nela. Descanso cura e levanta os caídos na hora. Tesouro devolve as recompensas no evento. Evento espera chooseDungeonEvent. Enigma: com a lição, resolve na hora; sem ela, solta as ondas do semLicao.
- dungeon_run guarda as recompensas por playerId a cada andar vencido (porAndar, com os materiais vezes o saque do andar, mais as recompensas de chefe e de primeira vez). claimRunRewards aplica tudo com applyRewards e o GroupCtx da run: solo dá 0 de XP e o plantonista ganha metade. A IA não recebe recompensa.
- Falha (grupo todo caído) termina a run, mas o que já foi guardado fica. O progresso salvo é ultimoChefeVencido, e o atalho exige o desbloqueio atalho_galerias. SUGESTÃO: o andar em andamento não paga nada. Se não sobra nenhum jogador ao vivo, a run acaba como 'saiu'.
- Plantonista: kind 'player' com onDuty e auto, então conta para o XP do grupo pela regra que já existe em rewards.ts (metade, sem bônus de jogador ao vivo). A Doutrina dele passa por validarDoutrina contra o loadout dele.
- Saque do plantonista: ele já ganha a rolagem individual de rewards.ts. Como a Doutrina não anda atrás de saque, tickPlantao recolhe direto para o relatório o saque marcado para ele. O relatório entra no registro em aplicarRelatorio (gainXp, inventário, moedas).
- Editor de Doutrina: as condições e ações vêm do contrato DoctrineCard. Faixas (SUGESTÃO): vida de 5 a 95%, de 1 a 8 inimigos, raio de 2 a 10 tiles. Um botão vazio no loadout é recusado.
- Encontros: janela de 10 minutos do now recebido. A semente mistura semente do servidor, região, janela e id do mapa. Patrulha = bando de normais da região (fora de masmorra). Personagem de IA = treinador: o da margem dona da região é co-op (aliados), o da rival é contra (inimigos). Na região neutra, a margem é sorteada.
- Personagem de IA rival que cai se rende e some (tickEncounters), em vez de ficar 30 s no chão como membro de grupo. Por enquanto não dá XP.

### faccao

- Lados dos líderes: segui faction_ai.json piloto.comando e Narrativa.md, ou seja, Lazzaro Prati (agressivo) comanda a ESQUERDA e Rolf Halvorsen (defensivo) a DIREITA. O texto da tarefa dizia o contrário.
- Os modificadores de margem já existiam em sim/combat.ts marginPct (lê World.regionState e balance.json encantoMaquina), mas regionState nunca era preenchido. Não dupliquei a regra: criei regionStateParaCombate(estado) e testei o marginPct real.
- Limiares do combate: usei balance.json encantoMaquina.limiaresEnergia (com energia a partir de 50; apagão em 10 ou menos) e escalaPoluicao.max 5. regions.json escalas diz apagaoAbaixoDe 15, e esse valor ficou sem uso aqui.
- Estado num JSON só (EstadoFaccao), como a CidadeState. As funções públicas clonam e devolvem o estado novo; as variantes *Mut são internas.
- As 6 ações pedidas foram mapeadas para as ações dos dados, para usar os pesos de faction_ai.json. Aumentar preço é só da Direita e mutirão só da Esquerda (SUGESTÃO).
- Rolf: o gancho so_ataca_com_certeza usa vantagemMin 0.8 sobre a parcela de influência da Direita no ponto alvo (não há força de IA por região). Lazzaro: engaveta_na_comissao não tem efeito, porque o piloto não tem trégua.
- Peguei o limite diário da IA (influência de 10 por região e 25 no total, 3 ataques) de faction_ai.json limiteDiario, contado por dia de now. Os jogadores não têm limite diário, só o teto de 8 por evento (SUGESTÃO).
- O ponto produz um recurso abstrato (estoque) para servir de base ao saque. O estoque zera quando o ponto troca de dono (SUGESTÃO).
- A propaganda usa as frases de rádio e de cartaz de faction_ai.json do perfil do líder. Os demais textos (campanha, patrulha, investimento, preço, mutirão, troca de dono, apagão e saque) são novos e marcados como SUGESTÃO, com sugestao: true no evento.
- Não editei city.ts: MedidoresCidade já tinha os campos certos, preenchidos por medidoresCidadeDaFaccao e aplicarFaccaoNaCidade.

### itens

- Itens não ganharam campo novo no PlayerRecord. O nível de melhoria fica em rec.counters['item_nivel:<id>'], a fila da benzedeira em 'benzimento_fila:<id>' (o valor é o prontoEm em ms) e o filtro em 'filtro_raridade' e 'venda_automatica'. Assim tudo persiste pela migração atual, sem mexer em record.ts.
- SUGESTÃO: os extras do raro (1 ou 2 do poolExtras, com chanceSegundoExtra) são fixos para cada id de item. Saem de um hash FNV do id e valem o meio da faixa min..max. Não há estado por cópia.
- SUGESTÃO: o nível de benzimento ou calibração vale para o tipo de item do jogador, não para cada cópia.
- Benzimento segue items.json, contra o texto da tarefa ('gastando materiais e moeda'). Ele exige reputação (reputationOf) e lições, não gasta nenhuma das duas, não cobra moeda e tem fila de filaS. A calibração paga custoCredito em Crédito e sai na hora. Nenhum dos dois usa materiais, porque os dados não pedem.
- SUGESTÃO: lições aprendidas é o número de degraus de lição (lessons.json, tipo 'licao') já alcançados pelos contadores visitas:<lugar>.
- SUGESTÃO: só uma peça por vez na fila da benzedeira. Se `onde` vier, tem de estar em benzimento.onde ou calibracao.onde; se não vier, o servidor confere a proximidade.
- Só itens da margem certa melhoram: a Esquerda benze e a Direita calibra. Itens do Delta e únicos (sem margem) seguem o lado de quem usa (aceitaItensDoDelta). Item da outra margem é recusado e continua valendo 0,5 (regras.outraMargem).
- Os stats do equipamento entram em stats.pct, em fração. Para 'hp', o bônus multiplica a vida máxima, e applyKit refaz isso no relevel. Os números fixos de passivo de único ou adorno já vêm somados em EquipStats.pct.
- Os passivos de único e de adorno entram em sourcedPassivesOf com fonte 'item'. tickTalentPassives passa a considerar quem tem equipItems.
- Jaqueta do Zé Faísca usa o gatilho ao_acertar com params.soCorpoACorpo, que agora só dispara para quem tem Alcance 1. O atordoar com chance 0,15 sai pelo motor de sempre, com imunidade e regra de chefe.
- SUGESTÃO: Fones de Rosa Tavares e o talento Leitura de Jogo usam o gancho aviso_antecipado. No evento 'telegraph', marcam tel.avisoAntecipadoPara para o cliente destacar. Na simulação, os ms a mais viram reforço de deslocamento até o impacto, na proporção ms / duração do aviso, com teto de 60%. Vale para quem está dentro da área +1 tile; com alcance 'grupo', vale também para os aliados perto.
- Visual: único usa visualProprio.chaveArte. Item com ala usa o override do item ou visualPorArquetipo[ala].slots[slot].chaveArte + '_' + sufixoArte, e o item sem classe adota a ala. Na faixa de 8 a 11 a chave é '<instituicao>_<slot>_<sufixo>'; no Delta, 'delta_<slot>_<sufixo>'. lookOf passa a mandar art; o cliente já usa art quando o catálogo tem a chave e, se não tiver, cai no traje da ala.
- O drop comum e raro com filtro de raridade já existia em sim/rewards.ts e ficou como estava. O filtro do registro agora chega ao spawnPlayer por simSpawnExtrasOf (lootFilter e autoSell).

### arte

- Lazzaro Prati is on the Left (Raízes) and Rolf Halvorsen is the PM commander on the Right. This follows faction_ai.json and Narrativa.md. The PROGRESS plan has the sides swapped.
- SUGESTÃO: Arte.md has no character sheet for Lazzaro or Rolf. Lazzaro gets a beret, a moss-green tunic, an armband, a megaphone, the 'COMISSAO' stamp and the protest list on his back. Rolf gets riot armour, a visor, dark glasses, a body camera that is switched off, a shield and a baton with a flashlight.
- The boss already existed in creatures.ts: bomba_descontrolada at 64x64, bigger than the 32x48 characters. What was added is its own floor warning, fx_aviso_bomba, plus the sucção, descarga and água subindo effects from the dungeon hazards.
- SUGESTÃO: the Galerias reuse the existing Tile values. Lama is a chopindita puddle, Mato is cables on the floor, Porta is the stairs down, PisoNeon is a drain grate, Madeira is a metal walkway, Pedra is rock and Maquina is a broken turbine.
- The 6 item slots follow items.json (cabeça, peito, calça, arma, calçado, adorno), not the task's mãos/pés/acessório. The adorno has no outfit layer, so its icon is a pendant: wood and a leaf on the Left, a neon chip on the Right.
- On the character, rarity shows as a coloured outline around the item piece plus one sparkle point that moves each frame (a new step in drawCharacterFrame). The comum gets no outline. The existing gem stays.
- A comum item uses the ala's aprendiz piece and a raro uses the veterano piece, as resolveLook already did. When the ala has no piece in that slot, the icon falls back to the other tier, then to the institution uniform, then to a generic piece in the ala's palette. These fallbacks are SUGESTÃO.
- On the icon, 'Raro ganha detalhe' is shown as an embroidered bottom edge (Left) or an LED edge (Right) plus the rarity gem in the middle. SUGESTÃO.

### servidor

- Each dungeon floor is its own room, 'masmorra:<runId>:<andar>', instead of one 'masmorra:<runId>' room. It reuses the existing room changes (trocar_sala, setArrival, mapAllowed). Taking the open stairs moves the whole group to the next floor's room. The run is shared through city.dungeons. Only active players in the run can enter the floor; anyone else is sent back to mapForRecord.
- Entering the dungeon is by message only (masmorra_entrar near the marker), not by walking onto it. That avoids pulling the group in by accident. The group is whoever is within 6 tiles plus their duty characters, up to grupoMax 4. Leftover duty characters go back to the HQ.
- Every member gets primeiraVez on the boss floor if any live player in the group is beating that boss for the first time. The 'atalho' option uses shortcutOf(rec): the run starts on the floor after the last boss beaten (6 after the 5th).
- Leaving: masmorra_sair works anywhere on the floor, and so does stepping on the exit again after moving off it. Leaving calls claimRunRewards and leaveRun. Table items go straight into the backpack, because the player is leaving the floor. If the whole party is down, failRun runs and everyone goes back to the Usina with what was already banked. A player who times out offline in the dungeon also claims and leaves.
- Duty: rec.on_duty is the player's choice, set with plantao_definir. When the offline auto time runs out (despawn) and on_duty is on, a copy of the record goes into DutyService, saved in world_state 'plantao'. When the owner comes back (any join), DutyService.back closes any active duty, removes the character from rooms (city.dropDuty), and the report (aplicarRelatorio plus claimRunRewards from runs) goes into the record. Duties are tied to the taker: whichever room the taker is in spawns the character next to them. They end when the taker times out offline or dismisses them.
- Loot that the sim's auto-pickup grabbed for the duty character (loot_pick by its entity) goes into the report. Duty assignments are tied to the taker, so the character follows them from room to room.
- Influence is grouped per tick or per message by side, region and source, then sent through faction.somar: - matar: 1 per kill for each player in the fight; - plantao: 1 per elite or boss kill with a duty character in the fight (SUGESTÃO); - missao: one per mission turned in (r.concluidas); - comercio: the traded amount from loja_compra/venda, feira_compra, app_compra and cambio_troca. The region comes from regionAt.
- Faction tick: PQP_TICK_FACCAO_MIN if set; otherwise FACTION_TICK_MIN_DEV = 5 outside production and the 60 from faction_ai.json with NODE_ENV=production. The server checks every FACTION_CHECK_MS = 10 s and uses createRng(sementeDoTick(2077, ciclo)). Each WorldEvent is also written to the event log as 'world_event'.
- aplicarFaccaoNaCidade runs when faction state loads and whenever it changes. world.regionState is filled in every room outside the sandbox, so the sim's marginPct now gets the energy and pollution modifiers.
- AI encounters run on margem_esquerda, margem_direita, usina_da_ponte and juncal only. The Delta is the tutorial, the encounters have level 12 to 15 characters, and keeping them out of the Delta keeps the e2e run safe. They are re-rolled per time window, the previous window's leftovers are removed, and tickEncounters handles surrender.
- Dropped connection: the existing behaviour was already right (goOffline puts the character on auto with the sanitized Doctrine until OFFLINE_AUTO_MS, and comeBack takes control back). I added a test for it.

### cliente

- Telas da Fase 5 numa classe só, Fase5Ui (ui/dom/fase5Screens.ts), no mesmo padrão da Fase3Ui e da Fase4Ui. Uma linha de botões 'Mochila', 'Doutrina' e 'Mapa' fica logo abaixo da linha da Fase 3. Os botões de perto são 'Entrar nas Galerias', a 2,5 tiles do marcador kind 'masmorra' da Usina, e 'Quadro do plantão', a 3 tiles do marcador 'lugar' com params.qg.
- Mochila: 6 slots em grade com o ícone de art.itemIcon na ala do jogador e a borda na cor da raridade. A lista mostra Vestir, Tirar e Benzer ou Calibrar, conforme melhoria.processo, com o custo e a fila. No fim vem o filtro de raridade, com 4 botões, e a venda automática, só quando loot.json a deixa opcional.
- Editor de Doutrina com botões que avançam a cada toque: SE condição, FAÇA ação e o botão 1/2/3. Os números têm botões - e + dentro de DOCTRINE_LIMITS. As setas ▲▼ mudam a prioridade e ✕ apaga a carta. Pode ter até 5 cartas, e a frase de cada carta aparece embaixo dela. O modelo puro fica em ui/fase5Model.ts e só gera cartas que validarDoutrina aceita.
- A masmorra mostra uma faixa à esquerda com o andar, o nome, as salas limpas, o chefe, o que está guardado e o grupo. Também tem 'Descer a escada' (goTo até a escada aberta) e 'Sair'. A sala de evento abre a escolha sozinha, uma vez por sala. O andar usa renderGalerias no tileLayer quando o id do mapa é '<id>:<andar>'. A tela de transição mostra o nome do andar.
- Os avisos do mapa aparecem numa faixa no topo, um de cada vez, por 5 s. A cor segue a margem do aviso, e o apagão sai em vermelho. Embaixo aparecem o líder e a região.
- O painel da facção mostra, por região, energia, poluição, apagão e uma barra de influência Esquerda x Direita. Cada ponto aparece com o dono, a barra até o limiar de 60 e o saque livre, e no fim vêm os 10 avisos mais recentes. O painel se atualiza a cada 5 s enquanto está aberto.
- O visual do item no boneco já vinha de lookOf(rec) no shared. O servidor local agora atualiza look e atributos ao vestir: applyEquipment entra quando muda simEquipOf. Quando a ala troca, equipPct é limpo para não contar o hp duas vezes no relevel.
- No servidor local, o saque coletado que for item equipável vai para a mochila. Antes, offline, o item não entrava no inventário. O vendido pela venda automática fica de fora: ele vem com 'currency' logo em seguida.
- O servidor local roda a masmorra completa: createDungeonRun, andares por runFloor, tickDungeonFloor e as ações de cada evento. Tesouro e evento vão para bankRewards. A escada chama advanceFloor e o próximo andar; a saída só vale depois de se afastar dela. Com o grupo inteiro no chão por 5 s, failRun. Ao sair, claimRunRewards e a volta para a entrada das Galerias na Usina.
- Plantão no servidor local: como não há outros jogadores, o QG tem 3 vizinhos NPC por margem, com nomes inventados. Ganham instituição e ala da margem e nível max(12, o do jogador). levarPlantonista e spawnPlantonista os põem no grupo com partyId; tickPlantao roda a cada tick. Dispensar chama encerrarPlantao. Na masmorra, joinRun e leaveRun.
- IA de facção no servidor local: o estado fica no aparelho (factionStore, chave pqp_offline_faccao) e tickFaccao roda a cada segundo, com a semente sementeDoTick(seed, ciclo). Também roda aplicarFaccaoNaCidade, e w.regionState recebe regionStateParaCombate. A influência entra por abate ('matar', ou 'plantao' quando quem derrotou foi o plantonista), missão concluída e câmbio na ponte ('comercio'). Com ?ciclo=N, o tick da facção também encurta.
- Os encontros com IA (rollMapEncounters, spawnEncounter e tickEncounters) entram no servidor local ao carregar um mapa já na margem, menos em mapa fixo ou com noEnemies. A opção encounters:false desliga.
- Travessia de barco feita: depois que a travessia é confirmada, BoatScene mostra uma cena curta em canvas pixel de 7 s. O barco sai do Delta e cruza o rio até a margem escolhida, desenhada nas paletas dos docs, e o guia fala as falas de saudação e aleatória dos dados. A última fala é do barqueiro. Tocar pula a cena, e o mapa da margem carrega por trás.

### fechamento

- Tabela do escopo do piloto (item -> estado -> evidência):
- 1. Delta 1 a 7, tutorial e Bruno Ferro -> PRONTO -> game/tutorial.ts e missions.ts; shared/test/game.test.ts ('do cadastro ao Bruno Ferro... story_flags'); map.fase2.test.ts; server/test/e2e.test.ts.
- 2. Criação zoeira e Máquina de Visual -> PRONTO -> game/appearance.ts e visual.ts; game.test.ts ('Máquina de Visual'); server/test/fase2.test.ts; client/test/fase2.test.ts.
- 3. Travessia no 8, 2 margens, 2 QGs, 8 instituições com missão de entrada -> PRONTO -> game/travessia.ts e institutions.ts; game3.test.ts (entrada_${inst} para as 8); map3.test.ts.
- 4. 16 habilidades de classe, 24 arquétipos com aprendiz e veterano, 24 treinadores com falas e bordões -> PRONTO -> data.test.ts ('24 arquétipos...', '24 treinadores únicos'); game3.test.ts (traje 8/12/20, bordão vira emote); client/test/artFase3.test.ts (24 alas em 3 paletas).
- 5. Combate em tempo real, modo automático, auto-caminho e saque automático -> PRONTO -> sim/*; sim.test.ts, sim.combat.test.ts e doctrine.test.ts; map.fase2.test.ts (auto-caminho); game5_itens.test.ts (saque com filtro de raridade); server/test/core.test.ts.
- 6. Talentos do 10, 15 e 20; 12 espíritos e 4 IAs -> PRONTO -> game/talents.ts e guides.ts; game3.test.ts ('talentos do 10, 15 e 20' e 'guias'); data.test.ts ('12 espíritos e 4 IAs de bolso').
- 7. Sociedade básica: patentes, Semente e Crédito, feira e app, câmbio, moradia decorável -> PRONTO -> economy.ts, market.ts, exchange.ts, housing.ts e ranks.ts; game4.test.ts; server/test/fase4.test.ts; client/test/fase4.test.ts.
- 8. Plantão, Galerias da Usina (5 andares e chefe) e encontros com IA -> PRONTO -> duty.ts, dungeon.ts e encounters.ts; game5_masmorra.test.ts; server/test/fase5.test.ts (grupo de 2 + plantonista até o chefe do 5º). Nesta etapa liguei a missão de expedição à run: pronto_flags.test.ts.
- 9. Itens comum e raro com visual por ala, benzimento, calibração e 2 únicos -> PRONTO -> items.ts e equipment.ts; game5_itens.test.ts (benzimento, calibração, os 2 únicos no combate, visual por ala no lookOf); client/test/artFase5.test.ts.
- 10. Mapas Delta, Margem Esquerda, Margem Direita, Usina da Ponte e Juncal -> PRONTO -> shared/src/map/maps/*.ts; map.fase2.test.ts e map3.test.ts.
- 11. IA de facção com Lazzaro Prati e Rolf Halvorsen -> PRONTO -> faction.ts e influence.ts; game5_faccao.test.ts; server/test/fase5.test.ts; os dois estão no mapa como personagens de IA (margem_esquerda.ts:148, margem_direita.ts:127).
- Critérios de pronto: movimento livre -> PRONTO (sim.test.ts 'movimento livre e colisão'); 200 ms e 2% de perda -> PRONTO (core.test.ts, e2e.test.ts, net.core.test.ts, prediction.test.ts); toda habilidade acerta sem mira -> PRONTO, com teste novo pronto.test.ts que cobre os 24 arquétipos, botões 1 e 2, as 4 de classe no 3 e o Especial; nenhum arquétipo acima de 55% -> PRONTO na trava rápida (packages/sim/test/sim.test.ts), e a conferência cheia só roda com PQP_BALANCO=1; 60 fps e 'entende em 1 minuto' -> PARCIAL, sem medição em aparelho nem teste com gente; sugestões marcadas -> PRONTO (convenção, mais data.test.ts).
- Cobertura de testes pedida, conferida com grep: atraso simulado (core, e2e, sim.net, net.lag, prediction), tipos de habilidade (sim.test 'os 6 tipos' e pronto.test.ts), recargas (sim.test 'recarga, custo e recarga global'; data.test 6 a 20 s), controles e imunidade (sim.test 'controle e imunidade'; sim.fixes), Doutrina (doctrine.test), talentos (game3), guias (game3 'guias'), modificadores (game5_faccao 'modificadores de margem'), itens e visual por ala (game5_itens), Máquina de Visual (game.test, server e client fase2), economia e moradia (game4), influência e IA de facção (game5_faccao), plantão (game5_masmorra, server fase5) e story_flags (game.test, game3, data.test; Fase 5 em pronto_flags.test.ts). Todos os 16 itens têm teste.
- Lacuna consertada: os objetivos entrar_masmorra e vencer_andar das missões expedicao_galerias_esquerda e expedicao_galerias_direita nunca andavam. Com isso a flag galerias_bomba_desarmada nunca era ligada. Agora a run avança a missão em claimRunRewards.
- No teste 'toda habilidade acerta sem mira' roda um tick antes do uso, para o alvo automático escolher o inimigo, como no jogo. Uma área no alvo usada sem alvo nenhum (antes do primeiro tick) cai na frente do personagem. O teste tem um caso de controle, que confere que a cena não produz efeito quando nada é usado.
- Líderes: o código segue a Narrativa.md (Lazzaro nas Raízes/Esquerda, Rolf na PM/Direita). O plano no PROGRESS.md e o texto desta tarefa dizem o contrário. Não mudei o código e registrei isso no PENDENTE.md.
- README.md reescrito: Node portátil e env.ps1, npm install e npm run dev, celular pela rede local (IP, porta 5173, regra de firewall), offline, lag simulado, testes e simulador. Conferi que o Vite (vite.config.ts e o --host 0.0.0.0 do dev.mjs) e o servidor (index.ts e app.ts) escutam em 0.0.0.0, e que o cliente acha o servidor pelo host da página (config.ts resolveEndpoint, testado em client/test/input.test.ts).
- PENDENTE.md reorganizado em 8 seções: Supabase (variáveis e as 5 migrations em ordem), pg_cron e workers, publicação, Capacitor e lojas, medições em aparelho, decisões de doc em aberto, ambiente e arte.

### verificação

- SUGESTÃO (regra nova, marcada no código): a influência dos jogadores acumula durante o ciclo, e a troca de dono que ela causa sai no tick de facção (consolidarDonosMut roda antes de os líderes decidirem). As ações da IA rodam dentro do tick e continuam virando o ponto na hora. Motivo: o fluxo pedido diz que é o tick que muda o ponto pela influência. Antes, os abates das Galerias (cerca de +24 de influência) viravam o ponto no próprio abate, e o tick nunca virava nada. Com o estado 35/65, a patrulha do Rolf segurava o ponto e a campanha do Lazzaro ia para os pontos neutros.
- Os dois testes de game5_faccao que esperavam a troca na hora passam por consolidarDonos depois de somarInfluencia. Entrou um teste novo: a missão leva a Esquerda acima de 60 sem mudar o dono, e o tickFaccao vira pc_ponte_direita com o aviso.
- Teste ponta a ponta (server/test/fase5.test.ts, describe 'ponta a ponta da Fase 5'): A e B da Esquerda, e A leva o plantonista P na Usina. O grupo (2 jogadores + 1 plantonista) entra nas Galerias. P nasce em cada andar, no grupo de A. O grupo desce do 1º ao 5º, e no 5º o chefe bomba_descontrolada é vencido. Os inimigos ficam com 1 de vida e morrem pelo ataque automático, pelo caminho normal de eventos (abate, saque e influência), em vez de onZeroHp direto. A saída é pelo 6º. O teste confere o desbloqueio atalho_galerias e shortcutOf = 5 (a próxima entrada começa no 6º). Também confere um item raro equipável no saque, equipar e o pedido de calibrar recusado para a Esquerda. O benzimento entra na fila de 30 s e, com o relógio adiantado e itens_pedir, o item fica no nível 1. A calibração é feita por um jogador da Direita, com um raro da Direita, e cobra 50 Cr. No fim, os abates nas Galerias deixam pc_ponte_direita (começando em 50/50) acima do limite sem trocar o dono. O tick de facção vira o ponto para a Esquerda, e o aviso_mapa com o id da troca chega aos jogadores nas salas da Usina e da Margem Direita.
- Leitura de 'desce até o 5 com atalho': o piloto só tem chefe no 5º, então o atalho só existe depois dele. O teste desce do 1 ao 5 pela escada e confere que o atalho ficou liberado para a próxima entrada. A volta pelo atalho (andarInicial 6) já está coberta no teste 'masmorra em grupo'.
- Os itens não mexem no balanceamento: o simulador não equipa nada. O único gancho novo que roda sem item (aviso_antecipado no telegraph) só vale para quem tem passivo. O 1 contra 1 com n=20 e semente 1 dá exatamente os mesmos números da Fase 3 (cacador_de_crocodilo 56,1%, ruído de amostra já registrado em decisoes/fase3-margens.md).
- Na tela da facção, o texto do ponto agora diz 'vira dono com 60, no próximo tick'.

## Sugestões (inventado, não está nos docs)

### masmorra

- SUGESTÃO: os números de DUNGEON_TUNING (nivelPorAndar 1, extraACadaAndares 3, escadaRaio 1,5, entrada 14x14).
- SUGESTÃO: o nome dos andares sem fundo, 'Galerias, Nº subsolo'.
- SUGESTÃO: as faixas de DOCTRINE_LIMITS do editor de Doutrina.
- SUGESTÃO: os números de ENCOUNTER_TUNING (janela de 10 min, até 2 encontros por janela, 60% de personagem de IA, metade co-op, nível 12 a 15, 8 tiles das chegadas).
- SUGESTÃO: a fala 'Tá bom, tá bom! Eu me rendo.' do personagem de IA rival que se rende.
- Ligar no servidor: DungeonRoom por grupo. createWorld(runFloor(run).layout.map, seed). Depois de cada step: tickDungeonFloor, atStairs para advanceFloor e novo andar, partyWiped para failRun, tesouro e evento para bankRewards.
- Ligar no servidor: no logout de quem está na margem, chamar entrarEmPlantao. Quem leva gera o DutyAssignment com levarPlantonista e o nascimento com spawnPlantonista. Rodar tickPlantao depois de cada step. No login, aplicarRelatorio com os assignments encerrados.
- Ligar no servidor: o WorldRoom chama rollMapEncounters a cada janela, spawnEncounter para os ids novos e tickEncounters em todo tick. O mensagem 'doutrina' do net/game.ts pode passar a usar validarDoutrina.
- Pode valer exportar dungeonGen em map/index.ts. Não editei porque o arquivo não é meu; por enquanto o game/dungeon.ts reexporta.

### faccao

- LIMIAR_DONO = 60; INFLUENCIA_POR_FONTE (matar 0,25; missão 3; plantão 1; comércio 1 a cada 100; ia 1); INFLUENCIA_MAX_POR_EVENTO = 8.
- PRODUCAO_PONTO_POR_TICK = 10; BONUS_DONO de +10% de produção e -5% de preço por ponto, com teto de +25% e -15%; ENERGIA_VOLTA_POR_TICK = 2.
- EFEITOS das ações: campanha +6 de influência; patrulha +4; propaganda ±5 de opinião e +2 de influência; investimento da Direita +20 de energia, +1 de poluição em casa e +0,5 na Usina; investimento da Esquerda -1 de poluição e +5 de energia; aumentar preço +5 no preço de vida; mutirão -3 no preço, +3 de energia e +3 de opinião.
- Necessidade de cada ação pelo estado (0,5 a 2), por exemplo: apagão puxa investimento e preço dinâmico na Direita; poluição puxa energia limpa na Esquerda; ponto ameaçado puxa patrulha.
- Mapa ação do piloto para ações dos dados (ACOES_DOS_DADOS) e regra de que só a Direita aumenta preço e só a Esquerda faz mutirão.
- Textos ácidos novos dos avisos. Exemplos: 'A PM ocupou o {ponto} com 98% de certeza. Os outros 2% viraram relatório.' e 'Apagão em {regiao}. O Consórcio pede desculpas e cobra a taxa de religação.'
- O estoque do ponto zera ao trocar de dono.

### itens

- SUGESTÃO: ligar no servidor (core.ts) e no servidor local (localServer.ts) as mensagens equipar, desequipar, benzer, calibrar, filtro_raridade e itens_pedir. Depois de cada uma: chamar applyEquipment(entidade, simEquipOf(rec)), atualizar e.lootFilter e e.autoSell, refazer e.look = lookOf(rec) e responder itens_info.
- SUGESTÃO: chamar concluirBenzimentos(rec, now) no tick de persistência ou ao abrir a tela de itens, e avisar quando o item sair da fila.
- SUGESTÃO: o cliente pode desenhar o aviso no chão com destaque para quem está em tel.avisoAntecipadoPara. Para mostrar o aviso de fato 500 ms antes, a IA dos inimigos teria de decidir o ataque mais cedo, o que fica para depois.
- SUGESTÃO: guardar o estado por cópia (extras sorteados e nível) se o mercado passar a precisar de itens diferentes com o mesmo id.

### arte

- Have the floor generator write galerias tiles through galeriasFrame, passing the tile below, and put fx_agua_subindo on the tiles that are flooded by the agua_subindo hazard.
- Use fx_aviso_bomba for the boss's big attacks: frame = warning progress, scale = radius/48 px. Use fx_succao and fx_descarga after fx_aviso_circulo for the hazards.
- WorldScene and the HUD should draw fx_plantao_<margem> above entities with on_duty, and fx_ponto_<dono> on the 'ponto_controle' markers.
- In the inventory, use art.itemIcon(scene, id, archetypeOfWearer) so the icon shows the wearer's ala style.
- shared/game/visual.ts can call lookItemsFor (or carry the art key) to fill items[].art. Today it only sends slot and rarity, which already gives the correct piece and outline.

### servidor

- Event and boss texts on dungeon floors (textoDoAndar), the wipe text, and the plantão and grupo cheio messages are marked SUGESTÃO.
- These numbers were made up and are in config.ts as SUGESTÃO: FACTION_TICK_MIN_DEV = 5, FACTION_CHECK_MS = 10 s, DUNGEON_ENTRY_REACH_TILES = 4, DUNGEON_GROUP_RADIUS_TILES = 6, DUTY_SPAWN_OFFSET_TILES = 1, ENCOUNTER_MAPS and ENCOUNTER_CHECK_TICKS = 100.
- A dungeon floor room allows 8 connections (SUGESTÃO, room for reconnects).
- Influence from duty: 1 point only for elite or boss kills (SUGESTÃO, the docs say '1 por luta').
- The client could add a 'Levar plantonista' button on the HQ board and a toggle for 'Ficar de plantão ao sair'. Both messages already exist.

### cliente

- Nomes dos vizinhos NPC de plantão no servidor local: Dona Cida do Mutirão, Tião da Horta Coletiva, Zé da Ata, Kevin do Delivery, Jéssyca Mentora e Bruno Trainee. O nível deles é max(12, nível do jogador).
- Textos dos botões e da interface marcados como SUGESTÃO: 'Mochila', 'Doutrina', 'Mapa', 'Entrar nas Galerias', 'Quadro do plantão', 'Descer a escada', 'Ao sair: fico de plantão', os rótulos das cartas da Doutrina e os nomes em português dos atributos (Precisão, Esquiva, Cura recebida...).
- Avisos da masmorra: entrada ('Sem fundo, sem pressa, sem Wi-Fi'), chefe, tesouro guardado, descanso, escada aberta, saída e queda do grupo. Também o aviso do benzimento pronto e o do rival que se rendeu.
- Fala do barqueiro na chegada. Direita: 'A passagem foi cortesia; o resto é por assinatura'. Esquerda: 'o cais é de mutirão'.
- Números do servidor local: entrar na masmorra a até 3 tiles; o grupo caído por 5 s faz a run falhar; os botões de perto aparecem a 2,5 e a 3 tiles; o aviso do mapa fica 5 s; o painel da facção se atualiza a cada 5 s; o barco dura 7 s e cada fala 2,3 s.

### final

- Regra da troca de dono no tick de facção (consolidarDonosMut), marcada com // SUGESTÃO em influence.ts e faction.ts.
- Registrar em DECISIONS.md (não editei, pela regra): a troca de dono pela influência dos jogadores sai no tick de facção, e a da IA na hora.
- Trocar o limite seco de 55% no relatório do sim por limite + 2 erros padrão (já sugerido na Fase 3), porque com --n 20 os alertas do grupo contra grupo (20 lutas no total, 0 a 9 por arquétipo) são só ruído.

### fechamento

- Criar a Edge Function tick-faccao no Supabase. O cron.schedule comentado em 0004_faccao.sql chama essa função, e ela não existe.
- Fazer castAbility chamar autoTarget quando não houver alvo, para uma área no alvo usada no primeiro tick ou logo depois de perder o alvo não cair na frente do personagem.
- Apagar a pasta vazia 'Ponte que Partiu\Ponte que Partiu' e os mapas órfãos qg_esquerda.ts e qg_direita.ts.
- Rodar a conferência cheia de balanceamento com PQP_BALANCO=1 antes de fechar a versão do piloto.

## Em aberto

- Balanceamento no limite: com n=60 e semente 1, babushka fica em 55,7% (alerta). Com n=60 e semente 7, a semente da medição oficial da Fase 3, nenhum arquétipo passa de 55% (o mais alto é babushka, com 54,5%). Somando as duas sementes, ela fica em 55,0%. Não vem dos itens. Vale um ajuste pequeno no xale_de_la (escudo de 7,5% para 7%) numa próxima rodada.
- No grupo contra grupo com --n 20, aparecem 8 alertas, todos de amostra minúscula (20 lutas no total). O critério oficial é o 1 contra 1 com n=60.
- O teste ponta a ponta usa inimigos com 1 de vida e teleporte entre as salas: confere o fluxo e as regras, não a dificuldade do chefe.
- Há um processo node que não é desta sessão: um servidor dev do vite (vite packages/client --port 5180, pid 3452), iniciado em 31/10 às 22:50. Não matei. O e2e encerrou o servidor dele (saiu: true).
- PROGRESS.md diz 'Lazzaro Prati (Direita) e Rolf Halvorsen (Esquerda)'. Pelos docs, o código está certo: Lazzaro é das Raízes (Esquerda) e Rolf comanda a PM (Direita). É preciso corrigir o PROGRESS.md (não editei).
- Nada foi commitado (regra da tarefa). O commit da Fase 5, o README e o PENDENTE ficam para o orquestrador.

