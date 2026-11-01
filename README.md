# Ponte que Partiu (piloto)

Action RPG online para celular, 2D em pixel art, tela em pé. Monorepo com `packages/shared`
(regras, dados e simulação), `packages/server` (Colyseus), `packages/client` (Phaser + Vite) e
`packages/sim` (simulador de balanceamento). A arquitetura está em `ARQUITETURA.md`, o andamento em
`PROGRESS.md` e o que depende de vocês em `PENDENTE.md`.

## Rodar no PC

Precisa de Node 20 ou mais novo. Nesta máquina o Node é portátil (`C:\Users\gnmar\tools\node`):
o `scripts\env.ps1` põe Node e Git no PATH da sessão do PowerShell. Em outra máquina, instale o
Node LTS (ou descompacte o zip do nodejs.org) e troque o caminho no `env.ps1`, ou pule essa linha
se o Node já estiver no PATH.

No PowerShell, na pasta do projeto:

```powershell
. .\scripts\env.ps1      # Node e Git no PATH desta sessão
npm install              # só na primeira vez
npm run dev              # servidor de jogo (porta 2567) + Vite (porta 5173); Ctrl+C encerra os dois
```

Abra http://localhost:5173.

Para rodar como num servidor de verdade, num processo só:

```powershell
npm start                # compila o cliente e serve jogo + WebSocket em http://localhost:2567
```

## Abrir no celular pela rede local

1. Deixe o celular e o PC no mesmo Wi-Fi.
2. Rode `npm run dev`. O IP do PC aparece no log do servidor, ou rode `ipconfig` e procure o
   "Endereço IPv4" do Wi-Fi (algo como `192.168.0.10`).
3. No navegador do celular, abra `http://192.168.0.10:5173`. Com `npm start`, use a porta `2567`.
   Segure o celular em pé.
4. O Vite e o servidor escutam em `0.0.0.0`. O cliente acha o servidor pelo host da página: no dev
   ele usa a porta 2567 do mesmo IP, e no build usa a mesma origem. `?server=host:porta` força outro
   endereço.
5. **Firewall.** Na primeira vez, o Windows pergunta se libera o Node: marque "Redes privadas". Se não
   perguntou, ou se o celular não abre a página, rode uma vez num PowerShell de administrador:

   ```powershell
   New-NetFirewallRule -DisplayName "Ponte que Partiu" -Direction Inbound -Protocol TCP -LocalPort 5173,2567 -Action Allow -Profile Private
   ```

   O Wi-Fi do PC tem que estar marcado como rede **privada**.

## Modo offline

`http://localhost:5173/?offline=1` roda o servidor dentro do navegador, com as mesmas regras de
`shared` e sem rede. Serve para jogar e testar sem subir o servidor. No `npm run dev`, com o offline,
`?dev_nivel=12&dev_mapa=margem_direita` já prepara o personagem e nasce no mapa (ver
`packages/client/src/config.ts`).

## Publicar uma versão e instalar no celular

O app do celular é o build "app": offline e solo, instalável (PWA), com o save no próprio aparelho.
Ele fica em **https://geanmartini-blip.github.io/PQP/**.

1. **Publicar:** faça o commit e clique em **Push origin** no GitHub Desktop. O GitHub Actions
   (`.github/workflows/pages.yml`) monta o app e publica em uns 2 minutos; o andamento aparece na aba
   **Actions** do repositório.
2. **Só na 1ª vez:** no GitHub, em **Settings → Pages → Source**, escolha **GitHub Actions**. Se o
   primeiro push foi antes disso, rode de novo em **Actions → Publicar no GitHub Pages → Run workflow**.
3. **iPhone:** abra o link no **Safari** → **Compartilhar** → **Adicionar à Tela de Início**. Jogue
   **sempre pelo ícone**: o save do ícone é separado do save do Safari.
4. **Android:** abra o link no **Chrome** → menu (⋮) → **Instalar app** (ou "Adicionar à tela inicial").
5. **Atualizar:** depois de publicar uma versão nova, abra o app com internet. Quando aparecer a faixa
   **"Versão nova: toque para atualizar"**, toque nela. As novidades da versão aparecem uma vez, e
   vêm do `NOVIDADES.md` (suba a versão em `packages/client/package.json` e escreva a seção `## vX.Y`).
6. **Saves:** ficam no aparelho (no navegador ou no ícone). Apagar os dados do site, ou desinstalar o
   ícone, apaga o save. Depois da 1ª abertura o jogo abre sem internet.

No PC, para conferir antes de publicar: `npm run check` (typecheck, testes e build) e
`$env:VITE_BASE='/PQP/'; npm run build:app` (o app vai para `packages/client/dist`). Os ícones saem de
`npm run icones` (`scripts/gerar-icones.mjs`, pixel art desenhada por código).

## Lag simulado

- No servidor: `npm run dev -- --lag 200 --loss 0.02 --jitter 20`. As mesmas opções existem como
  variáveis de ambiente: `PQP_LAG_MS`, `PQP_LOSS` e `PQP_JITTER_MS`.
- No cliente: `?lag=200&loss=0.02&jitter=20` na URL.
- `?debug=1` mostra o ping e os fps na tela.

## Testes e simulador

```powershell
npm run check            # typecheck + testes + build, antes de publicar
npm test                 # Vitest: regras, simulação, rede com atraso, servidor e cliente
npm run typecheck        # tsc nos 4 pacotes
npm run e2e              # robô contra um servidor real, com 200 ms e 2% de perda (cerca de 1 min)
npm run sim -- --modo 1v1 --n 500 --a peao_brabo --b idol     # um par de arquétipos
npm run sim -- --todos --n 200                                 # torneio: % de vitória contra a média
```

A conferência cheia do critério de 55% é lenta e roda à parte:
`$env:PQP_BALANCO='1'; npx vitest run packages/sim`.

Outros parâmetros da URL do cliente: `?gallery=1` (galeria da arte) e `?nome=Fulano&ala=idol`.
