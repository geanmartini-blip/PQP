# Progresso do piloto

Se a sessão recomeçar: ler CLAUDE.md e este arquivo e continuar da primeira fase não concluída.
Comandos rodam com `. .\scripts\env.ps1` antes (Node e Git portáteis).

## Fase 0: plano, arquitetura, esquemas e JSON — EM ANDAMENTO

Plano:
1. Monorepo com workspaces `shared`, `server`, `client`, `sim`; dependências instaladas. (feito)
2. ARQUITETURA.md com pastas, convenções, rede e persistência. (feito)
3. Esquemas zod por domínio em `shared/src/schema`, incluindo a linguagem de efeitos das habilidades.
4. Todas as tabelas de Sistemas.md, Narrativa.md e Arte.md em JSON em `shared/data`.
5. Carregador tipado e teste que valida cada JSON e as referências entre eles.
6. Revisão de fidelidade contra os docs; números novos marcados como sugestão.
7. Testes passando, commit, PROGRESS.md atualizado.
