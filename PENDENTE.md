# Pendente: o que depende de vocês

O jogo roda localmente sem nada desta lista. Cada item diz o que falta e onde a integração já está pronta.

## Contas e chaves
- **Supabase.** Criar o projeto, rodar os SQL de `supabase/migrations/` e pôr no `.env` do servidor:
  `SUPABASE_URL` e `SUPABASE_SERVICE_KEY`. Sem isso, o servidor usa `FileStore` (JSON em `.data/`).
- **Supabase Auth.** O login hoje é de convidado (token guardado no aparelho). Trocar por e-mail ou
  provedor quando houver projeto.
- **pg_cron.** Os jobs de tick de produção, IA de facção e plantão estão em SQL prontos; no local eles
  rodam num worker do servidor.

## Publicação
- **Hospedagem do servidor** (Node + WebSocket) com HTTPS/WSS.
- **Capacitor** para Android e iOS (depois do piloto): contas de desenvolvedor da Google e da Apple.

## Ambiente
- **OneDrive.** A pasta do projeto está no OneDrive. Pausar a sincronização desta pasta ou mover o
  projeto para fora (ex.: `C:\dev\ponte-que-partiu`) deixa `npm install` e o Vite bem mais rápidos.
- **Firewall do Windows.** Na primeira vez que o servidor abrir a porta 2567 (e o Vite a 5173), o
  Windows pergunta se libera na rede privada. Libere para o celular conseguir entrar.

## Arte
- A arte do piloto é desenhada por código (pixel art gerada em canvas). Os prompts de Arte.md podem
  gerar folhas de sprite finais; o gerador tem um ponto de troca por PNG quando elas existirem.
