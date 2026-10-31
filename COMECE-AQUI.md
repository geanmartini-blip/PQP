# Ponte que Partiu — como começar

Precisa ter instalado: Node.js (versão LTS), Git e o Claude Code.

1. Abra um terminal nesta pasta (Ponte que Partiu).
2. Rode `claude`. O modelo já vem configurado (Opus 5.5) em `.claude/settings.json`.
3. Ponha o esforço em alto (high) e mande só esta mensagem:

```
Leia o CLAUDE.md e os docs e construa o piloto inteiro, sem parar entre as fases.
```

Ele trabalha sozinho, fase por fase, e anota o andamento em `PROGRESS.md`. Se a sessão cair ou acabar o limite, abra de novo e mande a mesma frase: ele continua de onde parou.

Edição de arquivos e os comandos comuns (npm, node, git) já estão liberados. Se ainda aparecer algum pedido de permissão, escolha a opção de sempre permitir.

O que depender de vocês (conta do Supabase, publicação, lojas) fica listado em `PENDENTE.md`; o jogo roda localmente sem isso. No fim, o `README.md` explica como abrir no celular pela rede de casa.

Arquivos desta pasta: `CLAUDE.md` é o briefing (o Claude Code lê sozinho ao abrir); `docs/` tem Narrativa, Sistemas e Arte, que são a fonte de tudo. Para mudar alguma regra, edite o doc no claude.ai e substitua o arquivo em `docs/`.
