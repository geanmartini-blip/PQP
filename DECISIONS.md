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

## Sugestões (o que não está nos docs)
Lista mantida por fase. Tudo aqui pode ser trocado pelos autores.
