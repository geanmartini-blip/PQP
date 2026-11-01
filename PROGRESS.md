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

## Fase 2: criação, Máquina de Visual, Delta, tutorial e travessia — PLANO

1. Regras em `shared`:
   - registro do jogador, com aparência, estágio, nível, XP, missões e story_flags;
   - progressão de 1 a 8, em que só luta em grupo dá XP;
   - motor de missões: falar, ir, derrotar, coletar, com auto-caminho;
   - Máquina de Visual, que nunca tira a silhueta;
   - travessia: margem, instituição, classe e guia.
2. Mapa do Delta completo pelos lugares de `places.json`:
   - Seu Jacó;
   - Espelho do Cadastro, a Máquina de Visual do Delta;
   - cais e barco;
   - arena do Bruno Ferro no nível 7.
3. Servidor:
   - salva o jogador;
   - mensagens de criação, visual, missão, conversa e travessia;
   - troca de mapa.
4. Cliente:
   - tela de criação em camadas com botão de sortear;
   - Máquina de Visual;
   - diálogo;
   - rastreador de missão com seta;
   - tutorial do primeiro minuto;
   - tela da travessia.
5. Arte refeita com mais capricho: bonecos com sombreamento, tiles com transição, sombras, árvores e
   água. Isso responde ao retorno de que a arte do protótipo ficou feia.
6. Testes, build no celular, commit.

## Fase 1: protótipo de movimento e combate — CONCLUÍDA
- Simulação determinística em `shared/src/sim`:
  - os 6 tipos de habilidade e toda a linguagem de efeitos;
  - controle com imunidade, e chefe que fica lento em vez de controlado;
  - caído e levantar, saque e XP;
  - compensação de 250 ms.
- IA dos inimigos com bandos, elite com afixos e chefe com avisos no chão. A Doutrina cuida do modo
  automático. O simulador de balanceamento está em `packages/sim`.
- Servidor Colyseus autoritativo:
  - snapshots por raio de interesse;
  - entradas repetidas e comandos com ack;
  - `PQP_LAG_MS` e `PQP_LOSS`;
  - FileStore.
- Cliente Phaser em retrato:
  - joystick, botões e toque para trocar de alvo;
  - previsão e interpolação;
  - HUD;
  - Wesley e Li Wei trocam a ala;
  - `?offline=1`, `?lag=`, `?gallery=1`.
- Verificação: typecheck ok, 406 testes passando e build ok. O e2e passou com 200 ms de atraso e 2% de
  perda: 20 snapshots/s, andar, matar com os 3 botões e o aviso do chefe.
- Em aberto, que passa para a Fase 3:
  - balanceamento: 10 arquétipos acima de 55% no simulador;
  - Peão Brabo × Idol dá 100% para o Peão.
- Detalhe em `decisoes/fase1-prototipo.md`.

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
