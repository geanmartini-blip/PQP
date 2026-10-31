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
