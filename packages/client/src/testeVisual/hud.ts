/**
 * HUD da cena de teste no estilo da referência: painéis escuros com borda dourada, Alegreya nos
 * nomes e Pixelify Sans nos números, retrato, vida e XP, minimapa, joystick à esquerda, botões
 * redondos à direita e o Especial brilhando. Em DOM (texto nítido); ícones em pixel art ampliados.
 */
import '@fontsource/alegreya/700.css';
import '@fontsource/pixelify-sans/500.css';

const CSS = `
#hud { position: fixed; inset: 0; pointer-events: none; font-family: 'Pixelify Sans', monospace; color: #f4e6c0; }
#hud .painel { position: absolute; background: linear-gradient(#221a24ee, #140f18ee); border: 2px solid #c9a24a;
  box-shadow: 0 0 0 2px #2a1c0c, inset 0 0 0 1px #6b5226, 0 3px 0 2px #0008; border-radius: 6px; }
#hud .retrato { left: calc(10px + env(safe-area-inset-left)); top: calc(10px + env(safe-area-inset-top)); width: 64px; height: 64px; padding: 0; overflow: hidden;
  background: radial-gradient(circle at 40% 35%, #5a3a2a, #1a1012); }
#hud .retrato canvas { width: 64px; height: 64px; image-rendering: pixelated; display: block; }
#hud .nivel { position: absolute; left: calc(56px + env(safe-area-inset-left)); top: calc(58px + env(safe-area-inset-top)); width: 26px; height: 22px; border-radius: 11px;
  background: #3a1a10; border: 2px solid #e8c060; font-size: 13px; text-align: center; line-height: 21px; color: #ffe8a0; }
#hud .status { left: calc(84px + env(safe-area-inset-left)); top: calc(12px + env(safe-area-inset-top)); width: 150px; padding: 5px 8px 7px; }
#hud .nome { font-family: 'Alegreya', serif; font-weight: 700; font-size: 16px; color: #ffe2a0; text-shadow: 0 1px 0 #000; }
#hud .sub { font-family: 'Alegreya', serif; font-size: 11px; color: #c8b088; margin-top: -2px; }
#hud .barra { position: relative; height: 12px; margin-top: 4px; background: #1a0c0e; border: 1px solid #000; border-radius: 3px; overflow: hidden; box-shadow: inset 0 0 0 1px #4a3020; }
#hud .barra i { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(#ff7a5a, #d8302a 55%, #9a1a1a); }
#hud .barra.xp { height: 6px; }
#hud .barra.xp i { background: linear-gradient(#ffe890, #e8b030 60%, #a07018); }
#hud .barra b { position: absolute; inset: 0; font-weight: 500; font-size: 10px; line-height: 12px; text-align: center; color: #fff; text-shadow: 1px 1px 0 #000; }
#hud .mapa { right: calc(10px + env(safe-area-inset-right)); top: calc(10px + env(safe-area-inset-top)); width: 104px; height: 104px; padding: 0; overflow: hidden; border-radius: 50%; }
#hud .mapa canvas { width: 104px; height: 104px; image-rendering: pixelated; }
#hud .hora { position: absolute; right: calc(28px + env(safe-area-inset-right)); top: calc(110px + env(safe-area-inset-top)); padding: 1px 8px; font-size: 13px; }
#hud .lugar { position: absolute; left: 50%; transform: translateX(-50%); top: calc(88px + env(safe-area-inset-top)); padding: 3px 12px 4px; text-align: center; }
#hud .lugar .t { font-family: 'Alegreya', serif; font-weight: 700; font-size: 15px; color: #ffe2a0; }
#hud .lugar .s { font-family: 'Alegreya', serif; font-size: 11px; color: #b8a888; }
#hud .botoes { position: absolute; right: calc(14px + env(safe-area-inset-right)); bottom: calc(22px + env(safe-area-inset-bottom)); width: 186px; height: 186px; pointer-events: auto; }
#hud .bt { position: absolute; width: 58px; height: 58px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #3a2e3a, #140e16 75%);
  border: 3px solid #c9a24a; box-shadow: 0 0 0 2px #2a1c0c, inset 0 2px 0 #fff2, 0 3px 0 2px #0009; display: flex; align-items: center; justify-content: center; }
#hud .bt canvas { width: 40px; height: 40px; image-rendering: pixelated; }
#hud .bt .rec { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(#000a var(--p), transparent 0); }
#hud .bt .num { position: absolute; font-size: 22px; color: #fff; text-shadow: 2px 2px 0 #000; }
#hud .bt.esp { width: 78px; height: 78px; right: 0; bottom: 0; border-color: #ffd860;
  background: radial-gradient(circle at 45% 40%, #3a6a8a, #0e1a2a 75%); animation: brilho 1.2s ease-in-out infinite alternate; }
#hud .bt.esp canvas { width: 52px; height: 52px; }
@keyframes brilho { from { box-shadow: 0 0 0 2px #2a1c0c, 0 0 8px 2px #ffd86088, 0 3px 0 2px #0009; } to { box-shadow: 0 0 0 2px #2a1c0c, 0 0 22px 8px #ffe080cc, 0 3px 0 2px #0009; } }
#hud .bt.item { width: 44px; height: 44px; }
#hud .bt.item canvas { width: 30px; height: 30px; }
#hud .bt .qtd { position: absolute; right: -2px; bottom: -4px; font-size: 12px; background: #1a0c0e; border: 1px solid #c9a24a; border-radius: 6px; padding: 0 3px; }
#hud .joy { position: absolute; left: 0; top: 40%; width: 50%; bottom: 0; pointer-events: auto; touch-action: none; }
#hud .joyb { position: absolute; width: 112px; height: 112px; margin: -56px 0 0 -56px; border-radius: 50%;
  background: radial-gradient(circle, #0000 55%, #00000055 56%, #0000 70%), radial-gradient(circle, #1a1420aa, #1a142066);
  border: 3px solid #c9a24acc; box-shadow: 0 0 0 2px #2a1c0c99, inset 0 0 12px #0008; opacity: .75; }
#hud .joyk { position: absolute; width: 48px; height: 48px; margin: -24px 0 0 -24px; border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, #f8e0a0, #c9a24a 50%, #7a5a20); border: 2px solid #2a1c0c; box-shadow: 0 3px 0 #0008; }
`;

export interface Hud {
  joy: { x: number; y: number };
  setRetrato(src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number): void;
  setIcone(id: string, src: CanvasImageSource): void;
  desenharMapa(f: (ctx: CanvasRenderingContext2D) => void): void;
  setHora(h: number): void;
}

function icone(id: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 20;
  c.height = 20;
  c.dataset['icone'] = id;
  return c;
}

export function montarHud(root: HTMLElement): Hud {
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  root.innerHTML = `
    <div class="joy"><div class="joyb"></div><div class="joyk"></div></div>
    <div class="painel retrato"><canvas width="24" height="24"></canvas></div>
    <div class="nivel">12</div>
    <div class="painel status">
      <div class="nome">Peão Brabo</div>
      <div class="sub">Brigada Popular · Combatente</div>
      <div class="barra"><i style="width:86%"></i><b>275 / 320</b></div>
      <div class="barra xp"><i style="width:42%"></i></div>
    </div>
    <div class="painel mapa"><canvas width="52" height="52"></canvas></div>
    <div class="painel hora">18:40</div>
    <div class="painel lugar"><div class="t">Ponte do Rio Claro</div><div class="s">Fronteira entre as Margens</div></div>
    <div class="botoes">
      <div class="bt" style="right:92px;bottom:0"></div>
      <div class="bt" style="right:84px;bottom:66px"></div>
      <div class="bt" style="right:18px;bottom:96px"></div>
      <div class="bt esp"></div>
      <div class="bt item" style="right:118px;bottom:126px"><span class="qtd">3</span></div>
    </div>`;
  const bts = root.querySelectorAll<HTMLElement>('.bt');
  const ids = ['icone_laco', 'icone_chifre', 'icone_chapeu', 'icone_especial', 'icone_garrafada'];
  bts.forEach((b, k) => b.prepend(icone(ids[k]!)));
  // recarga de exemplo no botão 2
  const rec = document.createElement('div');
  rec.className = 'rec';
  rec.style.setProperty('--p', '62%');
  const num = document.createElement('span');
  num.className = 'num';
  num.textContent = '4';
  bts[1]!.append(rec, num);

  // joystick que aparece onde o polegar toca (metade esquerda)
  const zona = root.querySelector<HTMLElement>('.joy')!;
  const base = root.querySelector<HTMLElement>('.joyb')!;
  const knob = root.querySelector<HTMLElement>('.joyk')!;
  const joy = { x: 0, y: 0 };
  const repouso = () => {
    const r = zona.getBoundingClientRect();
    const x = 76, y = r.height - 96;
    for (const el of [base, knob]) { el.style.left = x + 'px'; el.style.top = y + 'px'; }
    base.style.opacity = '.55';
  };
  repouso();
  let id = -1, ox = 0, oy = 0;
  zona.addEventListener('pointerdown', (e) => {
    if (id !== -1) return;
    id = e.pointerId;
    zona.setPointerCapture(id);
    const r = zona.getBoundingClientRect();
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    for (const el of [base, knob]) { el.style.left = ox + 'px'; el.style.top = oy + 'px'; }
    base.style.opacity = '.85';
  });
  zona.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const r = zona.getBoundingClientRect();
    let dx = e.clientX - r.left - ox, dy = e.clientY - r.top - oy;
    const d = Math.hypot(dx, dy), m = 44;
    if (d > m) { dx = (dx / d) * m; dy = (dy / d) * m; }
    knob.style.left = ox + dx + 'px';
    knob.style.top = oy + dy + 'px';
    const k = d < 6 ? 0 : 1 / m;
    joy.x = dx * k;
    joy.y = dy * k;
  });
  const solta = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = -1;
    joy.x = joy.y = 0;
    repouso();
  };
  zona.addEventListener('pointerup', solta);
  zona.addEventListener('pointercancel', solta);

  const retrato = root.querySelector<HTMLCanvasElement>('.retrato canvas')!;
  const mapa = root.querySelector<HTMLCanvasElement>('.mapa canvas')!;
  const hora = root.querySelector<HTMLElement>('.hora')!;
  return {
    joy,
    setRetrato(src, sx, sy, sw, sh) {
      const c = retrato.getContext('2d')!;
      c.imageSmoothingEnabled = false;
      c.clearRect(0, 0, 24, 24);
      c.drawImage(src, sx, sy, sw, sh, 0, 0, 24, 24);
    },
    setIcone(idIcone, src) {
      root.querySelectorAll<HTMLCanvasElement>(`canvas[data-icone="${idIcone}"]`).forEach((c) => {
        const g = c.getContext('2d')!;
        g.imageSmoothingEnabled = false;
        g.drawImage(src, 0, 0);
      });
    },
    desenharMapa(f) {
      const c = mapa.getContext('2d')!;
      c.imageSmoothingEnabled = false;
      f(c);
    },
    setHora(h) {
      const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60);
      hora.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    },
  };
}
