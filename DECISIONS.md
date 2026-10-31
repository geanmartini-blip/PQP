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
