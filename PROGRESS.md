# Progresso do piloto

Se a sessão recomeçar: ler CLAUDE.md e este arquivo e continuar da primeira fase não concluída.
Comandos rodam com `. .\scripts\env.ps1` antes (Node e Git portáteis).

## Fase 0: plano, arquitetura, esquemas e JSON — CONCLUÍDA
- Monorepo com os workspaces `shared`, `server`, `client` e `sim`. A estrutura está em ARQUITETURA.md.
- `shared/src/schema` tem 21 esquemas zod, um por domínio. Isso inclui a linguagem de efeitos das
  habilidades.
- `shared/data` tem 38 JSON com as tabelas dos três docs. Os números inventados estão marcados como
  sugestão.
- `getData()` valida tudo e monta mapas por id.
- `data.test.ts` confere esquemas e referências cruzadas (110 testes passando).
- Revisão de fidelidade em três frentes: combate, pessoas e mundo. O detalhe está em
  `decisoes/fase0-dados.md`.
- Contratos da Fase 1: `shared/src/map/types.ts`, `shared/src/sim/types.ts`,
  `shared/src/net/protocol.ts` e `client/src/art/contract.ts`.

## Fase 1: protótipo de movimento e combate — EM ANDAMENTO

Plano:
1. Simulação compartilhada (`shared/src/sim`), determinística a 20 ticks:
   - movimento livre com colisão;
   - linha de visão e alvo automático;
   - básico, 3 botões e Especial;
   - controle com imunidade, caído e levantar.
2. Mapa do protótipo com paredes, água, mato, Wesley e Li Wei, bandos, uma elite e uma arena de chefe.
   A* para tocar no chão.
3. IA dos inimigos com aviso no chão, e Doutrina para o modo automático e os companheiros.
4. Servidor Colyseus autoritativo:
   - snapshots por raio de interesse;
   - entradas repetidas e comandos com ack;
   - compensação de 250 ms;
   - atraso e perda simulados por `PQP_LAG_MS` e `PQP_LOSS`.
5. Arte em pixel desenhada por código: bonecos 32x48 em camadas, tiles, efeitos e ícones.
6. Cliente Phaser em retrato:
   - joystick, botões e toque para trocar de alvo;
   - previsão do próprio movimento e interpolação dos outros;
   - HUD;
   - troca Peão Brabo ↔ Idol falando com Wesley e Li Wei;
   - `?lag=200&loss=0.02`.
7. Testes de combate com atraso de 200 ms e 2% de perda. Revisão por especificação, rede, bugs e
   celular. Build aberto em tela de celular, commit.
