# Ponte que Partiu (piloto)

Action RPG online para celular, 2D em pixel art. Monorepo: `packages/shared` (regras, dados e
simulação), `packages/server` (Colyseus), `packages/client` (Phaser + Vite) e `packages/sim`
(simulador de balanceamento). Detalhes em `ARQUITETURA.md`; o que depende de vocês em `PENDENTE.md`.

## Rodar no PC

Precisa de Node 20 ou mais novo. No Windows, no PowerShell, na pasta do projeto:

```powershell
. .\scripts\env.ps1      # põe Node e Git no PATH (só na máquina do projeto)
npm install              # só na primeira vez
npm run dev              # servidor (2567) + Vite (5173); Ctrl+C encerra
```

Abra http://localhost:5173. Sem servidor: http://localhost:5173/?offline=1.

Para jogar como num servidor de verdade (um processo só, porta 2567):

```powershell
npm start                # compila o cliente e serve tudo em http://localhost:2567
```

## Abrir no celular pela rede local

1. Celular e PC no mesmo Wi-Fi.
2. Rode `npm run dev` (ou `npm start`). O servidor mostra o IP do PC, algo como `192.168.0.10`.
3. No navegador do celular: `http://192.168.0.10:5173` (com `npm run dev`) ou
   `http://192.168.0.10:2567` (com `npm start`). Segure o celular em pé.
4. Na primeira vez, o Firewall do Windows pergunta: libere o Node na rede privada.

## Testar com internet ruim

- No servidor: `npm run dev -- --lag 200 --loss 0.02` (ou `PQP_LAG_MS=200` e `PQP_LOSS=0.02`).
- No cliente: `?lag=200&loss=0.02&jitter=20` na URL. `?debug=1` mostra ping e fps.

## Testes

```powershell
npm test                 # Vitest (regras, simulação, rede, servidor, cliente)
npm run e2e              # robô contra um servidor real com 200 ms e 2% de perda (~1 min)
npm run typecheck
npm run sim -- --modo 1v1 --n 500 --a peao_brabo --b idol
```
