/**
 * Estilo da interface em DOM (criação, Máquina de Visual, diálogo, travessia, rastreador, avisos):
 * old school, de borda grossa em degraus, botões grandes para o polegar e texto com sombra dura.
 * Paletas: Esquerda em verde, terra e madeira; Direita em neon sobre concreto.
 */
const CSS = `
#pqp-ui { position: fixed; inset: 0; z-index: 4; pointer-events: none; font-family: 'Trebuchet MS', Verdana, sans-serif;
  color: #fff6e0; -webkit-user-select: none; user-select: none; touch-action: none; }
#pqp-ui * { box-sizing: border-box; }
#pqp-ui .px { image-rendering: pixelated; image-rendering: crisp-edges; }
#pqp-ui .sombra { text-shadow: 2px 2px 0 #140c16; }
#pqp-ui .painel { background: #2a1e30; border: 3px solid #140c16; box-shadow: inset 0 0 0 3px #6a4a70, inset 0 0 0 6px #140c16, 0 4px 0 #0008; }
#pqp-ui .btn { pointer-events: auto; min-height: 48px; min-width: 48px; padding: 8px 14px; border: 3px solid #140c16; background: #ffe8a0; color: #140c16;
  font: bold 16px 'Trebuchet MS', Verdana, sans-serif; box-shadow: inset -3px -3px 0 #c8a050, inset 3px 3px 0 #fff8d0, 0 3px 0 #0009; cursor: pointer; touch-action: manipulation; }
#pqp-ui .btn:active, #pqp-ui .btn.on { transform: translateY(2px); box-shadow: inset 3px 3px 0 #c8a050, 0 1px 0 #0009; }
#pqp-ui .btn.sec { background: #c8c0d0; box-shadow: inset -3px -3px 0 #8a8098, inset 3px 3px 0 #f0ecf4, 0 3px 0 #0009; }
#pqp-ui .btn.ok { background: #7ad070; box-shadow: inset -3px -3px 0 #3a8a3a, inset 3px 3px 0 #c8f8b8, 0 3px 0 #0009; }
#pqp-ui .btn:disabled { opacity: 0.45; }
#pqp-ui .modal { position: absolute; inset: 0; pointer-events: auto; display: flex; flex-direction: column; background: #0d0b10f6;
  padding: calc(env(safe-area-inset-top, 0px) + 8px) 10px calc(env(safe-area-inset-bottom, 0px) + 10px); gap: 8px; }
#pqp-ui h1 { margin: 0; font-size: 20px; color: #ffe8a0; text-align: center; letter-spacing: 1px; }
#pqp-ui h2 { margin: 0; font-size: 16px; color: #ffe8a0; }
#pqp-ui .sub { font-size: 13px; color: #c8c0d0; text-align: center; }
#pqp-ui .erro { color: #ffb0a0; font-size: 14px; text-align: center; min-height: 18px; }

/* editor de visual */
#pqp-ui .ed-topo { display: flex; gap: 8px; align-items: stretch; }
#pqp-ui .ed-previa { flex: 0 0 auto; width: 140px; height: 204px; position: relative; display: flex; align-items: flex-end; justify-content: center;
  overflow: hidden; background: repeating-linear-gradient(45deg, #3a2a40 0 8px, #34253a 8px 16px); }
#pqp-ui .ed-previa canvas { position: relative; width: 128px; height: 192px; margin-bottom: 4px; }
#pqp-ui .ed-chao { position: absolute; bottom: 8px; left: 34px; right: 34px; height: 12px; background: #0006; border-radius: 50%; }
#pqp-ui .ed-lado { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
#pqp-ui .ed-nome { pointer-events: auto; width: 100%; height: 48px; font: bold 18px 'Trebuchet MS', Verdana, sans-serif; padding: 6px 10px;
  background: #fff6e0; color: #140c16; border: 3px solid #140c16; box-shadow: inset 3px 3px 0 #c8b890; user-select: text; -webkit-user-select: text; touch-action: manipulation; }
#pqp-ui .ed-abas { display: flex; gap: 4px; overflow-x: auto; pointer-events: auto; padding-bottom: 2px; touch-action: pan-x; scrollbar-width: none; }
#pqp-ui .ed-abas .btn { flex: 0 0 auto; min-height: 44px; padding: 6px 10px; font-size: 14px; background: #6a4a70; color: #fff6e0;
  box-shadow: inset -3px -3px 0 #4a3050, inset 3px 3px 0 #8a6a90, 0 3px 0 #0009; }
#pqp-ui .ed-abas .btn.on { background: #ffe8a0; color: #140c16; }
#pqp-ui .ed-ops { flex: 1; overflow-y: auto; pointer-events: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px;
  align-content: start; padding: 6px; touch-action: pan-y; }
#pqp-ui .ed-ops.cores { grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); }
#pqp-ui .op { pointer-events: auto; min-height: 52px; padding: 6px; border: 3px solid #140c16; background: #4a3a52; color: #fff6e0; font: bold 13px 'Trebuchet MS', Verdana, sans-serif;
  box-shadow: inset -3px -3px 0 #34283a, inset 3px 3px 0 #6a5a72; cursor: pointer; text-align: center; touch-action: manipulation; position: relative; }
#pqp-ui .op.on { background: #ffe8a0; color: #140c16; box-shadow: inset -3px -3px 0 #c8a050, inset 3px 3px 0 #fff8d0, 0 0 0 3px #ffe8a0; }
#pqp-ui .op.travada { opacity: 0.55; }
#pqp-ui .op .amostra { display: block; height: 30px; border: 2px solid #140c16; margin-bottom: 3px; }
#pqp-ui .op .cadeado { position: absolute; top: 2px; right: 4px; font-size: 14px; }
#pqp-ui .ed-baixo { display: flex; gap: 8px; }
#pqp-ui .ed-baixo .btn { flex: 1; }
#pqp-ui .termos { pointer-events: auto; margin: auto; max-width: 420px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
#pqp-ui .termos .letra { font-size: 9px; color: #9a90a8; max-height: 120px; overflow: hidden; }

/* diálogo */
#pqp-ui .dlg { position: absolute; left: 8px; right: 8px; bottom: calc(env(safe-area-inset-bottom, 0px) + 10px); pointer-events: auto;
  padding: 10px; display: flex; flex-direction: column; gap: 8px; max-height: calc(50% - 30px - env(safe-area-inset-bottom, 0px)); }
/* o quadro para logo abaixo dos pés do boneco (centro da tela + 24 px): em tela baixa as opções rolam */
#pqp-ui .dlg-ops { overflow-y: auto; min-height: 48px; flex: 0 1 auto; }
#pqp-ui .dlg-topo { display: flex; gap: 10px; align-items: flex-start; }
#pqp-ui .dlg-retrato { flex: 0 0 auto; width: 72px; height: 72px; background: #140c16; border: 3px solid #6a4a70; }
#pqp-ui .dlg-retrato canvas { width: 66px; height: 66px; }
#pqp-ui .dlg-nome { font-weight: bold; font-size: 16px; color: #ffe8a0; }
#pqp-ui .dlg-fala { font-size: 16px; line-height: 1.35; overflow-y: auto; }
#pqp-ui .dlg-ops { display: flex; flex-direction: column; gap: 6px; }
#pqp-ui .dlg-ops .btn { text-align: left; }
#pqp-ui .dlg-toque { font-size: 12px; color: #c8c0d0; text-align: right; }

/* Z1: rastreador de missão compacto (uma linha, entre a engrenagem e o MENU) */
#pqp-ui .rastreador { position: absolute; pointer-events: auto; cursor: pointer; height: 32px; display: flex; align-items: center; gap: 6px;
  padding: 0 8px 0 6px; background: #140c16cc; border: 2px solid #c8a050; box-shadow: 0 2px 0 #0008; touch-action: manipulation; overflow: hidden; }
#pqp-ui .rastreador .obj { flex: 1; min-width: 0; font-size: 13px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#pqp-ui .rastreador .pe { flex: 0 0 auto; width: 14px; height: 14px; background: #ffe8a0;
  clip-path: polygon(0 35%, 55% 35%, 55% 0, 100% 50%, 55% 100%, 55% 65%, 0 65%); }
#pqp-ui .rastreador.pisca { animation: pqpPisca 0.9s ease-in-out infinite alternate; border-color: #ffe8a0; }
@keyframes pqpPisca { from { box-shadow: 0 0 0 0 #ffe8a0aa, 0 3px 0 #0009; } to { box-shadow: 0 0 0 6px #ffe8a000, 0 3px 0 #0009; } }

/* dica do andar: perto do polegar esquerdo (Z7) */
#pqp-ui .dica { position: absolute; padding: 6px 10px; background: #140c16cc; color: #fff6e0; border: 2px solid #ffe8a0;
  font-weight: bold; font-size: 14px; box-shadow: 0 2px 0 #0008; max-width: 46vw; }

/* Z2: faixa de mensagens (uma por vez: avisos, dica do tutorial, fala do guia, nível) */
#pqp-ui .faixa { position: absolute; left: 50%; transform: translateX(-50%); width: max-content; max-width: min(92vw, 420px); text-align: center;
  padding: 5px 12px; background: #140c16e0; border: 2px solid #6a4a70; box-shadow: 0 2px 0 #0008; font-weight: bold; font-size: 14px; line-height: 1.25; }
#pqp-ui .faixa .t { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
#pqp-ui .faixa.entra { animation: pqpFaixa 0.2s ease-out; }
#pqp-ui .faixa.missao { border-color: #ffd060; color: #ffe8a0; }
#pqp-ui .faixa.erro { border-color: #d84a3a; color: #ffb0a0; }
#pqp-ui .faixa.saque, #pqp-ui .faixa.xp { border-color: #c8a050; color: #ffe8a0; font-size: 13px; }
#pqp-ui .faixa.mapa.esquerda { border-color: #8ac060; color: #e0f0b0; background: #1e2a14ee; }
#pqp-ui .faixa.mapa.direita { border-color: #40e8ff; color: #b0f8ff; background: #14142aee; }
#pqp-ui .faixa.mapa.apagao { border-color: #d84a3a; color: #ffb0a0; }
#pqp-ui .faixa.guia { text-align: left; background: #fff6e0; color: #140c16; border-color: #140c16; font-weight: normal; font-size: 13px; }
#pqp-ui .faixa.guia .t { -webkit-line-clamp: 3; }
#pqp-ui .faixa.guia b { display: block; font-size: 11px; color: #6a3a70; }
#pqp-ui .faixa.dica2 { background: #140c16cc; border-color: #ffe8a0; color: #fff6e0; }
#pqp-ui .faixa.dica2 .t:before { content: '\\25B6\\00a0'; color: #ffd060; }
#pqp-ui .faixa.nivel { border: 3px solid #ffd060; box-shadow: 0 0 0 3px #140c16, 0 4px 0 #0009; padding: 6px 18px; }
#pqp-ui .faixa.nivel .n { font-size: 24px; color: #ffd060; }
#pqp-ui .faixa.nivel small { display: block; font-size: 12px; font-weight: normal; color: #fff6e0; }
#pqp-ui .faixa small.sub { display: block; font-size: 11px; font-weight: normal; color: #c8c0d0; }
@keyframes pqpFaixa { from { transform: translate(-50%, -6px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
@keyframes pqpEntra { from { transform: translateY(-8px); opacity: 0; } to { transform: none; opacity: 1; } }

/* Z6: botões de perto (loja, feira, câmbio, máquina, plantão, masmorra), numa coluna à direita do FALAR */
#pqp-ui .perto-col { position: absolute; display: flex; flex-direction: column-reverse; align-items: stretch; gap: 6px; pointer-events: none; }
#pqp-ui .perto-col > div { display: flex; flex-direction: column-reverse; gap: 6px; }
#pqp-ui .perto-col .btn { pointer-events: auto; min-height: 44px; min-width: 0; padding: 4px 8px; font-size: 13px; line-height: 1.15; white-space: normal; }

/* Z5: MENU (os botões do topo juntos) e a gaveta */
#pqp-ui .menu-btn { position: absolute; pointer-events: auto; border-radius: 50%; padding: 0; min-width: 0; min-height: 0; background: #30223a; color: #ffe8a0;
  font-size: 22px; line-height: 1; box-shadow: inset -3px -3px 0 #1e1424, inset 3px 3px 0 #4e3a5a, 0 3px 0 #0009; }
#pqp-ui .menu-btn .selo { position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px; padding: 0 4px; border-radius: 10px; background: #ffd060;
  color: #140c16; border: 2px solid #140c16; font-size: 12px; line-height: 16px; animation: pqpPisca 0.9s ease-in-out infinite alternate; }
#pqp-ui .gaveta-fundo { position: absolute; inset: 0; pointer-events: auto; background: #0008; }
#pqp-ui .gaveta { position: absolute; top: 0; right: 0; bottom: 0; width: min(72vw, 300px); pointer-events: auto; display: flex; flex-direction: column; gap: 8px;
  padding: calc(env(safe-area-inset-top, 0px) + 10px) 10px calc(env(safe-area-inset-bottom, 0px) + 10px); overflow-y: auto; animation: pqpGaveta 0.18s ease-out; }
#pqp-ui .gaveta .btn { text-align: left; position: relative; }
#pqp-ui .gaveta .btn.pisca { background: #ffd060; animation: pqpPisca 0.9s ease-in-out infinite alternate; }
#pqp-ui .gaveta .btn .selo { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); padding: 0 6px; background: #d84a3a; color: #fff; font-size: 12px; }
#pqp-ui .gaveta .btn.alerta { background: #ffb0a0; }
@keyframes pqpGaveta { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }

/* cartão de habilidade da primeira vez (ao lado do arco, sem pegar toque) */
#pqp-ui .hab-cartao { position: absolute; pointer-events: none; display: flex; gap: 8px; align-items: flex-start; padding: 6px 8px; background: #140c16ee;
  border: 2px solid #ffd060; box-shadow: 0 3px 0 #0009; animation: pqpCartao 0.2s ease-out; }
#pqp-ui .hab-cartao canvas { flex: 0 0 auto; width: 36px; height: 36px; image-rendering: pixelated; background: #2a1e30; border: 2px solid #6a4a70; }
#pqp-ui .hab-cartao .col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
#pqp-ui .hab-cartao b { font-size: 13px; color: #ffe8a0; }
#pqp-ui .hab-cartao .tag { display: inline-block; margin-left: 4px; padding: 0 4px; background: #3a2a40; color: #ffd060; font-size: 10px; font-weight: bold; vertical-align: 1px; }
#pqp-ui .hab-cartao .l { font-size: 12px; color: #fff6e0; line-height: 1.2; }
#pqp-ui .hab-cartao .n { font-size: 11px; color: #c8c0d0; }
#pqp-ui .hab-cartao .g { font-size: 11px; color: #9ad0ff; }
#pqp-ui .hab-cartao:after { content: ''; position: absolute; right: -12px; top: var(--seta, 50%); transform: translateY(-50%); border: 6px solid transparent; border-left-color: #ffd060; }
@keyframes pqpCartao { from { transform: translateX(-10px); opacity: 0; } to { transform: none; opacity: 1; } }

/* travessia */
#pqp-ui .tv-margens { flex: 1; display: flex; gap: 8px; min-height: 0; }
#pqp-ui .tv-margem { flex: 1; pointer-events: auto; cursor: pointer; display: flex; flex-direction: column; gap: 6px; padding: 10px; border: 3px solid #140c16; overflow-y: auto; touch-action: pan-y; }
#pqp-ui .tv-margem.esquerda { background: linear-gradient(#3a5a2a, #2a3a1e); box-shadow: inset 0 0 0 3px #8a6a3a; }
#pqp-ui .tv-margem.direita { background: linear-gradient(#2a2a3a, #18182a); box-shadow: inset 0 0 0 3px #40e8ff, 0 0 12px #ff40c860; }
#pqp-ui .tv-margem h2 { font-size: 17px; }
#pqp-ui .tv-margem.direita h2 { color: #60f0ff; text-shadow: 0 0 6px #40e8ff, 2px 2px 0 #140c16; }
#pqp-ui .tv-margem.esquerda h2 { color: #d8e8a0; }
#pqp-ui .tv-fala { font-size: 13px; font-style: italic; color: #fff6e0; }
#pqp-ui .tv-cores { display: flex; gap: 3px; flex-wrap: wrap; }
#pqp-ui .tv-cores span { width: 18px; height: 18px; border: 2px solid #140c16; }
#pqp-ui .tv-lista { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; pointer-events: auto; touch-action: pan-y; }
#pqp-ui .tv-cartao { pointer-events: auto; cursor: pointer; padding: 10px; border: 3px solid #140c16; background: #3a2a40; text-align: left; color: #fff6e0;
  font: 14px 'Trebuchet MS', Verdana, sans-serif; box-shadow: inset -3px -3px 0 #24182a, inset 3px 3px 0 #5a4a62; display: flex; gap: 10px; align-items: center; touch-action: manipulation; }
#pqp-ui .tv-cartao.esquerda { background: #34442a; box-shadow: inset -3px -3px 0 #22301a, inset 3px 3px 0 #56703e; }
#pqp-ui .tv-cartao.direita { background: #262636; box-shadow: inset -3px -3px 0 #16162a, inset 3px 3px 0 #3a5a7a; }
#pqp-ui .tv-cartao b { color: #ffe8a0; font-size: 15px; }
#pqp-ui .tv-cartao .cl { display: inline-block; margin-left: 6px; padding: 1px 6px; background: #140c16; color: #ffd060; font-size: 11px; font-weight: bold; }
#pqp-ui .tv-cartao canvas { flex: 0 0 auto; width: 48px; height: 48px; }
#pqp-ui .tv-cartao p { margin: 3px 0 0; font-size: 12px; color: #d8d0e0; }
`;

let injected = false;

/** Põe o estilo na página (uma vez) e devolve a raiz da interface. */
export function uiRoot(): HTMLDivElement {
  if (!injected) {
    const st = document.createElement('style');
    st.id = 'pqp-ui-css';
    st.textContent = CSS;
    document.head.appendChild(st);
    injected = true;
  }
  let root = document.getElementById('pqp-ui') as HTMLDivElement | null;
  if (!root) {
    root = document.createElement('div');
    root.id = 'pqp-ui';
    document.body.appendChild(root);
  }
  return root;
}

/** Cria um elemento com classe e texto. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Botão grande que responde ao toque (pointerup) sem o atraso do click. */
export function button(text: string, cls: string, onTap: () => void): HTMLButtonElement {
  const b = el('button', `btn ${cls}`.trim(), text);
  b.type = 'button';
  b.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    onTap();
  });
  return b;
}
