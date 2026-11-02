# Decisões e suposições

Decisões tomadas sem perguntar, como pede o CLAUDE.md. Cada uma diz o que foi decidido e por quê.

## Ambiente
- **Node e Git portáteis.** A máquina não tinha Node nem Git. Instalei Node 24 LTS em
  `C:\Users\gnmar\tools\node` (no PATH do usuário) e o MinGit pelo winget. `scripts/env.ps1` põe os
  dois no PATH de um PowerShell aberto antes da mudança.
- **TypeScript 5.9 em vez do 7.** O 7 (compilador nativo) é recente demais para o resto das
  ferramentas; o 5.9 é estável com Vite, Vitest e tsx.
- **Versões:** Phaser 3.90.0 (o briefing pede Phaser 3; a linha 4 existe e foi evitada), Colyseus
  0.18 com `@colyseus/sdk`, Vite 8, Vitest 5, zod 4.
- **O projeto está no OneDrive.** `node_modules` dentro do OneDrive deixa a sincronização lenta. Funciona,
  mas vale pausar a sincronização desta pasta ou excluir `node_modules` dela (ver PENDENTE.md).

## Arquitetura
- **Pacote compartilhado como fonte TS.** Regras, dados e simulação ficam em `packages/shared` e
  rodam iguais no servidor, no cliente (previsão) e no simulador de balanceamento.
- **"Física arcade do Phaser" no servidor.** O Phaser não roda no servidor autoritativo. O movimento
  e a colisão são do estilo arcade (velocidade livre, corpo contra tiles sólidos, resolução por eixo),
  implementados em `shared/src/sim` e usados dos dois lados, para a previsão bater com o servidor.
- **Snapshots por mensagem.** O estado vai em mensagens próprias a cada tick, em vez do estado
  sincronizado do Colyseus, para controlar quantização, interesse por raio, perda e compensação.

## Convenções de dados
- IDs em snake_case ASCII; nomes exibidos com acento. Sugestões marcadas com `sugestao` ou
  `sugestaoCampos` (ver ARQUITETURA.md).

## Fase 0: dados
O registro completo, domínio por domínio, está em `decisoes/fase0-dados.md`. As regras que valem
para todo o código:
- **Invocações têm fonte única** em `summons.json`. Talentos e guias só apontam para elas.
- **Máquina de Visual** tem fonte única em `institutions.maquinasVisual`. O Delta tem uma máquina neutra
  (`maquina_visual_delta`, atendida pelo Seu Jacó). A roupa inicial vem só de `outfits.tiers[delta]`.
- **Percentuais** ficam em pontos percentuais (15 = +15%).
- **Controle** dura de 1 a 2 s, e provocar até 4 s. Provocar não dá imunidade a controle. Um controle
  com `quebraAoApanhar` pode chegar a 6 s (Protocolo Infinito). Depois de bônus de talento ou ala, o teto
  é 4 s (`balance.combate.controleComBonusMaxMs`). Em chefe, controle vira lentidão.
- **Alcance** em tiles: Alcance 1 = 1, 2 = 4, 3 = 7. Com `rangeDoAlcance`, a habilidade usa o Alcance
  de quem lança (Arqueiro e Cowboy 7, outros atiradores 4).
- **Carga do Especial e da virada**: `cargaS` de 45 a 90 s. A carga necessária escala por
  `cargaS ÷ balance.especial.cargaReferenciaS` (60).
- **Escudo reaplicado** pela mesma fonte só renova a duração. Efeitos de campo reaplicam a cada tick.
- **Velocidade por eixo**: `speed` soma em movimento, ataque e recarga. `moveSpeed`, `attackSpeed` e
  `cooldownSpeed` somam só no seu eixo.
- **Delta (níveis 1 a 7)** usa `basico_combatente` (o remo), não tem botões de habilidade nem Especial.
  Habilidades e Especial são ensinados no nível 8, no barco.
- **Ciclos**: `economy.ciclos` separa o ciclo da cidade (semanal) do ciclo de produção (60 min). O
  piloto não tem ciclo semanal real. Na Fase 4 o servidor roda o ciclo da cidade num intervalo curto
  configurável (`PQP_CICLO_CIDADE_MIN`).
- **Ids corrigidos na integração**: `noite_escura_vivida`, `feira_da_esquerda`, `cambio_da_ponte`,
  `chave_mira_firme`, `arquivo_da_ilha_do_farol`. Encontros e competição entre margens vivem em
  `regions.json`.
- **Precedência dos retângulos do mapa**: a Usina avança sobre as duas margens de propósito. Ordem:
  ilha do farol, mirante, usina, juncal, rio claro.

## Fase 1: protótipo
O registro completo está em `decisoes/fase1-prototipo.md`. Os pontos principais:
- **Distâncias** são medidas de borda a borda (centro menos os raios).
- **Alvo automático:** inimigo visível mais perto, a até 8 tiles. O alvo manual cai depois de 2 s fora
  de vista.
- **Habilidade fora do alcance:** o personagem anda sozinho até o alcance. Custo e recarga só são pagos
  quando a habilidade sai.
- **Histórico de posições:** 8 ticks.
- **Modo offline** (`?offline=1`): roda a simulação no navegador para jogar sem servidor. Não substitui
  o servidor autoritativo.
- **Códigos de fechamento:** 4101 quando o mesmo token entra em outro aparelho e 4102 quando o tempo no
  automático acaba.

## Fase 3: margens e arquétipos
O registro completo está em `decisoes/fase3-margens.md`. Os pontos principais:
- **Ala:** pede o nível 12 e a entrada na instituição, e precisa ser da mesma classe e instituição. No
  piloto, a ala não pode ser trocada.
- **Talentos:**
  - o 10 é de instituição, o 15 de papel e o 20 é a chave;
  - quando um talento muda uma habilidade, ela vira uma habilidade derivada com id
    `<base>@<arquétipo>:<talentos>`;
  - refazer talento fica para depois.
- **Emote:** fica salvo em `rec.unlocks` como `emote:<id>`.
- **Orçamento de poder:** o dos arquétipos ficou entre 43 e 60,5, fora da faixa de 52,5 a 56 de
  Sistemas.md. O ajuste está em `balance.json`. É preciso decidir se o doc muda.

## Fase 4: sociedade e economia
O registro completo está em `decisoes/fase4-sociedade.md`. Os pontos principais:
- **Saldo nunca negativo.** O aluguel que não se paga vira dívida, e o score do Crédito cai. Só a
  Direita tem score.
- **Ganho em moeda da outra margem** entra pela cotação base, de 2 Créditos por Semente.
- **Anúncios:** só a Esquerda anuncia na feira, e só a Direita anuncia no app.
- **Estado de cidade no servidor:** mercado e câmbio são estado global. O ciclo da cidade fica em
  `PQP_CICLO_CIDADE_MIN`.

## Fase 5: masmorra, plantão, facção e itens
O registro completo está em `decisoes/fase5-masmorra.md`. Os pontos principais:
- **Galerias:** o andar é gerado com um gerador de cobra em grade 3x3 (40x40). O chefe do 5º vem de
  `dungeons.json`. Se o grupo inteiro cair, a run acaba, mas o que já foi guardado fica.
- **Plantonista:** é um `player` com `onDuty` e `auto`. Ganha metade do XP, sem o bônus de jogador ao
  vivo.
- **Encontros:** há uma janela de 10 minutos. O treinador da margem dona é co-op e o da rival é contra.
  O rival que cai se rende.
- **Líderes:** seguem a Narrativa. Lazzaro Prati é das Raízes (Esquerda) e Rolf Halvorsen é da PM
  (Direita).
- **Balanceamento:** o escudo do Xale de Lã da Babushka caiu de 7,5% para 7%, porque ela estava no
  limite de 55%.

## Travessia de barco
- **Barco solo:** cada jogador tem a sua sala `barco:<playerId>`; o grupo ficou de fora.
- **Ponte:** chega por tempo, aos 12 s. Quem fecha a escolha reabre falando com o Seu Jacó. A mensagem
  `travessia` só vale no barco, na fase de escolha.
- **Aula:**
  - o Especial começa cheio e só vale no barco: ao chegar à margem ele volta a 0;
  - o automático fica desligado;
  - as ondas nascem no convés, de 4 a 7 tiles à frente do jogador;
  - a aula tem teto de 90 s;
  - solo não dá XP.
- **Reconexão:** antes da escolha, o jogador volta ao barco, e a viagem recomeça. Depois da escolha,
  vai direto para o cais e pula a aula.
- **Câmera:** no barco o zoom aceita meio passo, para mostrar cerca de 16 tiles e as margens caberem
  num celular de 750 px. O mapa tem rio a mais atrás da popa, para o rodapé não ficar preto.
- Os números e as falas novas estão marcados como sugestão (`BOAT_TUNING`, dicas da aula, falas do
  guia).

## Revisão visual: nova direção de arte (2026-11-01)
- **Mudança:** o jogo passa a seguir `docs/referencia-estilo.png`, com `docs/alvo-tela.png` e
  `docs/alvo-personagens.png` como alvo. É pixel art hi-bit em câmera 3/4:
  - contorno escuro colorido e 3 a 4 tons por material, com hue shift;
  - luz de cima à esquerda;
  - Esquerda mística e Direita neon.
  Os sistemas de jogo não mudam.
- **Etapa 1, a cena de teste:**
  - Abre em `/teste-visual.html`, com o código em `packages/client/src/testeVisual/`.
  - A arte provisória é gerada por script em `tools/art/` (`chao`, `cenario`, `personagens`, `icones`,
    `manifesto`) e vai para `packages/client/public/teste-visual/`.
  - Os prints saem de `node tools/art/print-teste.mjs`, em 390x844 com dpr 3.
  - O jogo principal ainda não foi tocado.
- **Phaser 4 só na cena de teste:** ele entrou como o pacote `phaser4` (alias de `phaser@4.2.1`), ao
  lado do 3.90 do jogo. A pasta `src/testeVisual` fica fora do `tsconfig` do cliente porque os tipos
  globais dos dois colidem. A migração do jogo todo para o Phaser 4 fica para a etapa 3.
- **Zoom:** cada pixel de arte vira um bloco inteiro de pixels físicos, de no mínimo 2x:
  - 2x em telas de dpr 2 e 3x em dpr 3;
  - o `?px=` da URL força o valor.
  Assim a tela de 390 px de CSS mostra cerca de 390 px de arte, como o alvo. Com 2x fixo num celular de
  dpr 3, os bonecos ficariam com 2/3 do tamanho do alvo. O canvas tem o tamanho em pixels de arte e o
  CSS estica com `pixelated`. Por isso a quantização com dither e a luz trabalham no pixel da arte.
- **Luz:**
  - Phaser 4 com normal map, gerado pelo script a partir da forma (bisel do alfa mais o brilho).
  - O ambiente segue um ciclo de dia e noite. O padrão é o fim de tarde (`?hora=18.6`); `?ciclo=1` roda
    o ciclo e a tecla N avança 2 horas.
- **Bloom:** só no que brilha (neon, magia, janela, chama). Cada sprite pode ter um `<chave>_e.png`
  emissivo, desenhado em ADD, mais um halo desfocado criado uma vez na carga. Não há filtro de bloom em
  tela cheia, para poupar o celular.
- **Quantização:** a câmera usa `Quantize` com 28 passos por canal e dither leve.
- **HUD em DOM:**
  - painéis escuros com borda dourada;
  - fontes Alegreya e Pixelify Sans pelo `@fontsource`, que funciona offline;
  - ícones em pixel art ampliados.
- **Animação:** o lado é desenhado virado para a direita e a esquerda sai por flipX. Os quadros seguem
  o padrão `<animacao>_<direcao>_<i>`.

## Revisão visual, v2: cartoon 2D liso (2026-11-01)
- **O que aconteceu:** o usuário reprovou a cena em pixel art ("ambiente muito pobre e simples",
  bonecos sem qualidade) e pediu inspiração em Ravenswatch e Brawl Stars.
- **Escolha dele:** cartoon 2D liso no lugar do pixel art. Continua 2D, no Phaser 4, com arte gerada
  por script. Antes ele tinha escolhido bonecos de 48x64; no cartoon, eles têm ~80 a 90 u de altura.
  Isto substitui as regras de pixel art da seção anterior: zoom inteiro, quantização com dither, normal
  map e tile de 32 px.
- **Pipeline:**
  - Cada peça é um SVG montado por código em `tools/art/cartoon/`: `lib.mjs`, `kit.mjs`, `boneco.mjs`,
    `chao.mjs`, `cenario.mjs`, `personagens.mjs` e `icones.mjs`.
  - O estilo tem formas cheias, contorno grosso colorido escuro, cel shading em faixas com luz de cima
    à esquerda e brilhos.
  - O Chromium do Playwright rasteriza em 3x (o chão em 1,5x).
  - A saída vai para `packages/client/public/teste-cartoon/`, com um manifesto de âncoras
    (`pecas-*.json`).
- **Unidade:** 1 u = 1 px de CSS. O canvas tem a resolução física da tela e a câmera usa zoom de
  dpr × 0,75. Assim a tela de 390 px mostra ~520 u, e o boneco ocupa ~16% da largura, como no alvo.
  O `?zoom=` da URL muda o valor.
- **Bonecos articulados:** cada direção é feita de peças separadas, com a âncora na junta:
  - as peças são tronco, cabeça, braços, pernas, cabelo e itens;
  - a montagem segue o `rigs.json`, e o filho herda a transformação do pai;
  - a animação é por código: respiração, passo com balanço, golpe (espaço) e hélice;
  - a esquerda é o lado espelhado.
- **Luz:**
  - Phaser 4 com ambiente de fim de tarde e luzes pontuais, sem normal map, porque o sombreamento já
    vem pintado.
  - O emissivo (`_e.png`) é desenhado em ADD.
  - A câmera tem bloom leve com limiar alto (0,9), para pegar só neon, magia e janela. O `?bloom=0`
    desliga.
- **Sombras:** cada peça tem uma mancha suave no pé e uma sombra projetada para baixo à direita. A
  sombra projetada é feita uma vez na carga, a partir da silhueta.
- **Partículas:** vaga-lumes, pétalas, vapor, névoa na cascata e faíscas do neon.
- **Cena:** abre em `/teste-cartoon.html`, com o código em `packages/client/src/testeCartoon/`. A cena
  em pixel art (`/teste-visual.html`) ficou como histórico.
- **Tom (revisão do usuário):** a primeira versão cartoon ficou "muito meme, tipo Club Penguin".
  - **Fundo:** sério. Há uma guerra, e os dois lados sofrem com falta de energia e carestia. Isso
    aparece no cenário: neon com letras mortas, velas, postes quebrados, gambiarra de fios, geradores,
    sacos de areia, posto de controle, prateleiras vazias e preço remarcado.
  - **Luz:** lampiões e neon apagados ou falhando (`energia` no layout), fumaça ao longe, fuligem e
    brasas no ar.
  - **Bonecos:** proporção adulta e paleta madura. O humor flui natural nos detalhes de cada um (recibos
    no bolso, headset com fita, bateria no fim, sacola de troca), sem cota de piada.
- **Sugestão (não está nos docs), na primeira versão cartoon:** os textos de piada nas peças. São "CÁPSULA R$ 999/h",
  "PREÇO DINÂMICO +37%", "TAXA 30%", "SCORE 742", "SOMOS UMA FAMÍLIA *sujeito a meta",
  "ASSEMBLEIA HOJE!!" e "100% MACHO".

## Revisão visual, v3: teste do PixelLab (2026-11-01)
- **Contexto:** a arte por script (pixel e cartoon) não chegou ao nível da referência. O mock
  `/mock-pixellab.html` roda a própria referência no motor. Agora testamos o PixelLab de verdade, pelo
  servidor MCP `pixellab` (`.mcp.json`, fora do git).
- **Como foi gerado o Peão Brabo:**
  - `create_character_pro_flash` em 128x128, com 8 direções e câmera `low top-down`;
  - como âncora de estilo, um recorte 128x128 de `pixellab/referencia-peao-frente.png` (o recorte
    está em `pixellab/resultados/estilo-recorte-128.png`);
  - andar com o modelo `walking` (6 quadros) nas 4 direções, uma por vez, porque o trial só roda uma
    geração por vez.
- **Custo:** 12 gerações no total, 8 do boneco e 4 do andar. Das 40 do trial, sobram 28. Cada etapa
  leva de 2 a 4 minutos.
- **Arquivos:**
  - `pixellab/resultados/rotacoes/` (8 direções) e `pixellab/resultados/andar/` (24 quadros);
  - `tools/art/mock-pixellab-pl.mjs` recorta os quadros num retângulo comum e grava `pl_*` no mock;
  - `tools/art/print-mock-pl.mjs` tira os prints em 390x844 (`tools/art/saida/pl-*.png`).
- **No mock:** o Peão controlável agora é o do PixelLab, andando nas 4 direções, com leste e oeste
  desenhados, sem espelhar. `?peao=ref` volta ao recortado. `?comparar=1` põe os dois lado a lado.
- **Avaliação:**
  - **O que deu certo:** o PixelLab pegou o estilo (contorno, sombreado e paleta) e todos os elementos
    pedidos (chapéu, xadrez aberto, fivela, bigode, laço, botina). As 4 direções são consistentes e o
    andar de lado ficou bom.
  - **O que ficou abaixo da referência:**
    - o cabelo saiu branco, quando na referência é castanho;
    - a cabeça ficou menor que a da referência, e o boneco ficou menos "cabeçudo";
    - de lado, o corpo afina;
    - no andar de frente e de costas, as pernas mexem pouco.
  - Tudo isso dá para corrigir com texto (cabelo castanho, proporção) ou refazendo uma direção, sem
    redesenhar.
- **v2, a correção:** o Peão foi gerado de novo com o mesmo recorte de estilo. O texto pediu cabelo e
  bigode castanho-escuros e cabeça grande, com cerca de 1/3 da altura. Saiu com cabelo castanho, cabeça
  maior e corpo mais parrudo, e no andar de frente os pés alternam melhor.
  - Custou mais 12 gerações. No total foram 24, e restam 16 no trial.
  - Os arquivos estão em `pixellab/resultados/v2/`. O mock usa a v2, e a v1 ficou em
    `pixellab/resultados/` como histórico.
  - O id da v2 no PixelLab é `67d1586d-f0c3-41d5-bc5e-ddd9f3391fa7`. É ela que vai como
    `style_image` do elenco.
- **Decisão (2026-11-01):** o usuário testou o mock e aprovou. O PixelLab passa a ser o caminho da
  arte de todos os bonecos e do cenário. Ele substitui a arte por script (`tools/art/cartoon`), que
  fica como histórico.
  - **Próximos passos sugeridos:**
    - usar o Peão aprovado como `style_image` de todos os bonecos, para o elenco ficar coerente;
    - usar 128 px como padrão;
    - assinar um plano com mais de uma geração por vez. Com 24 arquétipos, 24 treinadores e NPCs,
      são cerca de 12 gerações por boneco só para andar.

## Revisão visual, v3 no jogo: v0.2 de teste (2026-11-01)
- **O que foi feito:** o usuário autorizou seguir com o estilo do PixelLab e pediu o jogo nessa arte
  para teste, gastando pouco.
  - **Idol:** gerada com o Peão v2 como `style_image`, para os dois parecerem do mesmo elenco. Custou
    12 gerações. O id é `b0c70150-cd12-4e30-a3b2-c1099189d1b3`.
  - **Consumo:** as 40 gerações do trial ficaram em 4.
- **No jogo:**
  - `art/pixellab.ts` monta a folha do contrato (`${anim}_${dir}_${i}`) com os quadros de
    `public/pl/<pasta>/`.
  - Por enquanto só existe o andar. Parado usa o 1º passo, e golpe, habilidade e derrota repetem
    passos.
  - A folha tem escala 0,5: o boneco tem ~97 px e o mundo usa 48 px. O `EntityView` aplica
    `SheetMeta.scale`.
  - O `WorldScene` usa essa folha quando o arquétipo do jogador está em `PL_ARCHETYPES` (Peão Brabo e
    Idol). Os outros continuam com as camadas.
- **Câmera:** a largura alvo caiu de 12 para ~8 tiles, e o mínimo foi para 6,5 tiles. Assim os bonecos
  aparecem maiores, mais perto do alvo de tela.
- **Para gerar um boneco novo:**
  1. Gere no PixelLab e baixe o andar para `pixellab/resultados/<boneco>/andar/`.
  2. Rode `node tools/art/mock-pixellab-pl.mjs <pasta-andar> packages/client/public/pl/<pasta>`.
  3. Acrescente o arquétipo em `PL_ARCHETYPES`.
- **O que falta (precisa de um plano pago do PixelLab):**
  - Os outros 22 arquétipos, os 24 treinadores, os NPCs, os inimigos e os chefes. São ~12 gerações por
    boneco só para o andar, mais as poses de golpe.
  - Os tiles e os props do cenário.
  - O visual da criação de personagem: as camadas tipo Habbo não combinam com bonecos prontos, então
    a criação precisa de uma decisão própria.

## v0.3: jornada do 1 ao 20, conjunto da classe e ritmo (2026-11-01)
- **Pedido do usuário:**
  - Delta e criação do 1 ao 5, com a balsa no fim;
  - ala e 1º item da classe no 10;
  - a história vai chegando perto da Ponte até o 20;
  - perto do 20, a troca de lado e o último item do conjunto.
- **Marcos:** o Delta vai até o 4 (Bruno Ferro no 4), a balsa é no 5 e a ala no 10.
  - Os níveis antigos foram remapeados nas missões, nos inimigos, nos bandos dos mapas e nos itens:
    7→4, 8→5, 12→10, 19→18.
  - O nível de referência dos atributos continua 8, que é só uma conta de tabela.
- **Missões do 11 ao 17:** eram esboço e ficaram jogáveis.
  - "Debater", objetos que não existem e regiões fora do mapa (Rio Claro, Serra) viraram objetivos que
    o motor já tem: ir até um lugar, derrotar, sobreviver, escolher e masmorra.
  - Os Líderes (18) continuam esboço.
  - A missão nova "A Cabeceira da Ponte" (19), uma para cada margem, dá a armadura e o desbloqueio
    `troca_de_lado`.
  - A troca de lado em si (mudar de margem, instituição e ala) fica para a v0.4. Está em PENDENTE.md.
- **Slots:** a calça entrou no peito, agora "Armadura". Cada armadura somou os atributos e o preço da
  calça do mesmo par, então o balanceamento não muda.
  - Cabeça virou Capacete e Adorno virou Adereço. Os ids continuam os mesmos (`cabeca`, `peito`,
    `adorno`).
  - Os sets perderam a peça de calça, e o bônus maior passou para o novo total de peças.
  - Os 2 únicos de calça viraram armadura.
  - Save antigo perde a calça equipada.
- **Recompensa `slotDaClasse`:** dá a peça `${slot}_${classe}_${margem}_${raridade}`.
  `conjuntoDaClasse(rec)` diz quando as 5 estão vestidas. O cliente ainda usa o boneco do líder
  sempre que ele existe (Peão e Idol), porque o boneco base do PixelLab não foi gerado.
- **Ritmo:** em `balance.combate.ritmoInicial`, o básico é 1,4x mais lento e 1,4x mais forte até o 10 e
  cai em linha até 1 no 20. Vale para jogador e inimigo.
  - Para a conta do Especial e do recurso por acerto não mudar, cada acerto vale 1,4x.
  - Testei 1,6, mas os tanques e a cura passavam de 55%.
  - A Engenheira de Gambiarra já passava de 55% no nível 10 antes do ritmo. Ela ficou com:
    - Barreira com 5% de vida (era 8%) e 13 s para se refazer;
    - Robô com 7% de vida (era 12%), provocar a cada 8 s em raio 2.
- **Animação de golpe:** feita por código no `EntityView`, para qualquer folha. O boneco recua, dá o
  bote na direção do alvo e achata no impacto (380 ms no básico). Os quadros de golpe do PixelLab
  substituem isso quando houver gerações.
- **Simulador (nível 8):**
  - 1 contra 1, n=60: no máximo 55,4% (Babushka), dentro do ruído da amostra; com n=60 e ritmo 1,35,
    nenhum passou.
  - A trava do teste (grupo, semente 3) passa.
  - O modo grupo com n=60 no terminal já tinha alertas antes do ritmo.
- **PixelLab:** o trial tem 4 gerações. O cenário e os bonecos novos esperam o plano pago; a estimativa
  está em PROGRESS.md.

## v0.4: early game mais longo (2026-11-02)
Pedido do usuário: mais áreas e missões iniciais para o jogo durar mais no começo. Tudo abaixo é
sugestão; os docs só descrevem o Planalto, o Vale e a Ilha do Farol em uma linha cada.
- **Áreas:** Planalto do Trigo (saída no noroeste da Margem Esquerda), Vale das Chaminés (saída no
  leste da Margem Direita) e Ilha do Farol (barco no píer da barragem da Usina). Ficam nas regiões
  de regions.json, que viraram `emPiloto`.
- **Missões (30, `tools/content/v04.mjs`):** 5 extras no Delta, as cadeias A Colheita e O Turno da
  Noite (6 a 9, com chefe no 9), uma missão de cada instituição no 7, 4 bicos repetíveis e O Sinal da
  Eco (10 e 11, para os dois lados, dada pela Dalva). Só usam objetivos que já funcionam no jogo
  (ir até, derrotar, falar, interagir, escolher).
- **Inimigos:** gafanhoto, espantalho benzido, fiscal da cota e o Espantalho-Mor no Planalto; rato de
  duto, robô de linha, supervisor de meta e o Relógio de Ponto no Vale. A Ilha usa a enguia e o
  mercenário do Sombra. Os chefes ficam longe do caminho das missões do 7.
- **Curva de XP:** `formula.faixas` em progression.json multiplica por 1,5 o XP pedido do 5 ao 10
  (um helper só, `xpDaFormula`, no lugar das quatro cópias da fórmula). Do 1 ao 20 o total passa de
  49.474 para 53.336.
- **Arte:** 2 tilesets de trigo e 15 bonecos e bichos do PixelLab (198 gerações). O Vale e a Ilha
  usam os tilesets que já existiam. Depois, 2 tilesets das Galerias (chão de pedra molhada e parede
  de concreto do túnel, 30 gerações): os andares da masmorra usam o chão do PixelLab.
- **Uma folha por boneco:** os quadros soltos (quase 2.000 PNG) foram para `art-src/pl`;
  `tools/art/pl-folhas.mjs` junta cada boneco em `public/pl/<boneco>/folha.png`, com o tamanho em
  `art/plBonecos.json`. No servidor de desenvolvimento o jogo passou de mais de 2 min para uns 25 s
  para abrir, e o cache do app offline caiu de 982 para uns 560 arquivos.
- **Troca de lado (`game/trocaDeLado.ts`):** com o Seu Jacó, depois da flag da cabeceira (19), uma vez
  por temporada (o mês, pelo relógio de quem chama). Mantém o nível e a classe; a instituição vira a
  da mesma classe na outra margem e a ala vira o par dela (a mesma posição na lista de alas, que bate
  com os pares do briefing). Perde a patente e a moradia (Sistemas.md); o guia vira o primeiro da
  outra margem; talentos que não valem do outro lado voltam a ficar pendentes; missões ativas da
  margem antiga são largadas. A metade do bônus dos itens já era a regra de item da outra margem.

## Sugestões (o que não está nos docs)
Lista mantida por fase. Tudo aqui pode ser trocado pelos autores.

- **Fase 0.** A lista completa está em `decisoes/fase0-dados.md`, seção "Sugestões". Os pontos maiores:
  - os 4 Especiais de classe;
  - todos os números de recarga, custo, raio e multiplicador;
  - vida e ataque das invocações;
  - falas novas ou reescritas;
  - números dos encontros e da competição;
  - o preço da chopindita do Capataz.
  
  Nos JSON, cada item inventado está marcado com `sugestao` ou `sugestaoCampos`.
