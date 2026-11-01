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
