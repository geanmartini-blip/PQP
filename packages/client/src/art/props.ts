/**
 * Adereços que não estão no artCatalog: personagens da história (npcs.json), inimigos humanos
 * (enemies.json) e invocações humanas. As descrições vêm de Arte.md, npcs.json e enemies.json.
 */
import { microText } from './font';
import {
  armMark,
  backPrint,
  brimHat,
  capHat,
  cape,
  dome,
  type Drawer,
  floatSpot,
  glasses,
  handOf,
  handSliceOk,
  heldBox,
  heldStick,
  type LayerCtx,
  plate,
  shirt,
  vest,
} from './layers';
import { C, type Color, hex, light, shade, withAlpha } from './pixel';
import { headSpan, torsoSpan } from './rig';

const c0 = (c: LayerCtx) => c.cols[0]!;
const c1 = (c: LayerCtx) => c.cols[1] ?? shade(c.cols[0]!, 0.7);
const c2 = (c: LayerCtx) => c.cols[2] ?? light(c.cols[0]!, 0.35);
const dk = (x: Color) => shade(x, 0.72);
const fr = Math.floor;

function machine(c: LayerCtx, which: 'main' | 'off', screen: Color): void {
  heldBox(c, which, 3, 5, hex('#2a2a30'), (x, y) => {
    c.pix.put(x + 1, y + 1, screen);
    c.pix.put(x + 1, y + 3, C.metal);
  });
}

function sash(c: LayerCtx, col: Color): void {
  if (c.slice !== 'torso') return;
  const r = c.rig;
  if (r.view === 'side') {
    c.pix.vline(r.torsoL + 2, r.torsoTop, r.waistY, col);
    return;
  }
  const a = r.view === 'back' ? r.torsoR : r.torsoL;
  const b = r.view === 'back' ? r.torsoL : r.torsoR;
  c.pix.line(a, r.torsoTop, b, r.waistY, col);
  c.pix.line(a + (a < b ? 1 : -1), r.torsoTop, b + (a < b ? 1 : -1), r.waistY, dk(col));
}

function chain(c: LayerCtx, col: Color, thick: boolean): void {
  if (c.slice !== 'torso' || c.rig.view === 'back') return;
  const r = c.rig;
  if (r.view === 'side') {
    c.pix.box(r.torsoL, r.torsoTop + 3, r.torsoL + 1, r.torsoTop + 5, col);
    return;
  }
  for (let i = 0; i <= 6; i++) {
    const x = r.cx - 4 + i + (i > 3 ? 1 : 0);
    const y = r.torsoTop + Math.round(Math.sin((i / 6) * Math.PI) * 4);
    c.pix.put(x, y, i % 2 ? light(col, 0.3) : col);
    if (thick) c.pix.put(x, y + 1, dk(col));
  }
}

function floral(c: LayerCtx, opts: { len?: 'default' | 'hip' | 'thigh' | 'knee' | 'floor'; open?: number; sleeve?: 'short' | 'long' } = {}): void {
  shirt(c, { sleeve: opts.sleeve ?? 'short', len: opts.len, open: opts.open });
  if (c.slice !== 'torso') return;
  const r = c.rig;
  for (let y = r.torsoTop + 1; y < r.torsoBot + (opts.len === 'knee' ? 10 : 0); y += 3)
    for (let x = r.torsoL; x <= r.torsoR; x += 3) {
      const k = (x * 7 + y * 3) % 5;
      if (k < 2) c.pix.paint(x + (y % 2), y, k === 0 ? c1(c) : c2(c));
    }
}

/** Desenhistas extras, chave -> função. */
export const EXTRA_ART: Record<string, Drawer> = {
  // Seu Jacó
  chapeu_palha_furado: (c) => {
    brimHat(c, { brim: 20, crownW: 12, crownH: 4, at: 3, band: hex('#8a6a3a') }, c0(c));
    if (c.slice === 'head') {
      c.pix.set(c.rig.cx + 2, c.rig.headTop - 2, 0);
      c.pix.set(c.rig.cx - 6, c.rig.headTop + 3, 0);
    }
  },
  vara_remendada: (c) => {
    const s = heldStick(c, 24, c0(c), 'main', 3);
    if (!s) return;
    c.pix.put(fr((s.tx + s.bx) / 2), fr((s.ty + s.by) / 2), C.white); // remendo
    c.pix.line(s.tx, s.ty, s.tx - 2, s.ty + 12, withAlpha(C.white, 140)); // linha
  },
  balde_bagre: (c) =>
    heldBox(c, 'off', 5, 5, c0(c), (x, y) => {
      c.pix.hline(x, x + 4, y, dk(c0(c)));
      c.pix.box(x + 1, y - 2, x + 3, y - 1, hex('#7a8a6a')); // o bagre de estimação
      c.pix.put(x + 1, y - 2, C.eye);
      c.pix.put(x + 4, y - 3, hex('#7a8a6a'));
    }),
  dedo_em_riste: (c) => armMark(c, 'off', 1, (x, y) => c.pix.vline(x, y - 3, y - 1, c.skin.base)),
  // Bruno Ferro
  colete_couro: (c) => vest(c, c0(c), { openFront: true }),
  corrente_dourada: (c) => chain(c, c0(c), true),
  maquininha_semente: (c) => machine(c, 'main', hex('#5ec04a')),
  maquininha_credito: (c) => machine(c, 'off', C.neonCyan),
  // O Sombra e mercenários
  capa_preta_longa: (c) => cape(c, c0(c), 0.95),
  capa_preta_curta: (c) => cape(c, c0(c), 0.5),
  capuz: (c) => {
    if (c.slice !== 'head') return;
    const r = c.rig;
    const col = c0(c);
    for (let y = r.headTop - 2; y <= r.headBot + 1; y++) {
      const s = headSpan(r, Math.min(Math.max(y, r.headTop), r.headBot));
      if (!s) continue;
      const k = y < r.headTop ? (r.headTop - y) * 2 : 0;
      if (r.view === 'back') c.pix.hline(s[0] - 1 + k, s[1] + 1 - k, y, col);
      else if (y < r.eyeY - 2) c.pix.hline(s[0] - 1 + k, s[1] + 1 - k, y, col);
      else if (r.view === 'front') {
        c.pix.hline(s[0] - 1, s[0] + 1, y, col);
        c.pix.hline(s[1] - 1, s[1] + 1, y, dk(col));
      } else c.pix.hline(r.cx - 1, s[1] + 1, y, col);
    }
    if (r.view !== 'back') c.pix.hline(r.headL + 1, r.headR - 1, r.eyeY - 2, withAlpha(C.black, 140)); // sombra no rosto
  },
  dois_crachas: (c) => {
    if (c.slice !== 'torso' || c.rig.view === 'back') return;
    const r = c.rig;
    const xs = r.view === 'side' ? [r.torsoL] : [r.cx - 5, r.cx + 1];
    const cols = [hex('#5b8e3a'), C.neonCyan];
    xs.forEach((x, i) => {
      c.pix.line(r.cx - 1, r.torsoTop, x + 1, r.torsoTop + 4, C.metal);
      plate(c.pix, x, r.torsoTop + 4, 4, 4, cols[i]!, 'FUNCIONARIO DO MES', C.ink);
    });
  },
  // Dalva Rocha
  tailleur: (c) => {
    shirt(c, { sleeve: 'long', lapel: c1(c), len: 'hip', pattern: 'faded' });
  },
  faixa_prefeita: (c) => sash(c, c0(c)),
  agendas: (c) =>
    heldBox(c, 'off', 4, 6, c0(c), (x, y) => {
      c.pix.hline(x, x + 3, y + 2, C.paper);
      c.pix.hline(x, x + 3, y + 4, c1(c));
    }),
  carimbo: (c) =>
    heldBox(c, 'main', 3, 4, c0(c), (x, y) => {
      c.pix.hline(x - 1, x + 3, y + 3, C.ink);
      if (c.anim === 'basico' && c.frame === 1) c.pix.hline(x - 1, x + 3, y + 5, withAlpha(C.red, 90));
    }),
  carimbo_tijolo: (c) =>
    heldBox(c, 'main', 5, 4, c0(c), (x, y) => {
      c.pix.hline(x - 1, x + 5, y + 3, C.ink);
      c.pix.vline(x + 2, y - 3, y - 1, C.wood);
    }),
  prancheta_madeira: (c) =>
    heldBox(c, 'off', 4, 6, C.wood, (x, y) => {
      c.pix.box(x + 1, y + 1, x + 2, y + 4, C.paper);
      c.pix.hline(x + 1, x + 2, y, C.metal);
    }),
  // líderes em holograma
  moldura_flores: (c) => {
    if (c.slice !== 'under') return;
    const r = c.rig;
    const a = withAlpha(hex('#ffd070'), 120);
    c.pix.ring(r.cx, r.headTop + 6, 13, 13, 1, a); // auréola de sol nascente
    for (let i = 0; i < 10; i++) {
      const ang = Math.PI + (i / 9) * Math.PI;
      c.pix.put(r.cx + Math.round(Math.cos(ang) * 15), r.headTop + 6 + Math.round(Math.sin(ang) * 15), withAlpha(i % 2 ? C.leaf : hex('#ff8ac8'), 200));
    }
    c.pix.frame(r.cx - 15, r.headTop - 9, r.cx + 14, r.groundY, withAlpha(hex('#7ad86a'), 140));
  },
  grafico_subindo: (c) => {
    if (c.slice !== 'under') return;
    const r = c.rig;
    const base = r.torsoBot;
    for (let i = 0; i < 6; i++) {
      const h = 3 + i * 3 + ((i + c.frame) % 2);
      c.pix.box(r.cx - 15 + i * 5, base - h, r.cx - 13 + i * 5, base, withAlpha(C.neonCyan, 110));
    }
    c.pix.line(r.cx - 15, base - 2, r.cx + 13, base - 22, withAlpha(C.neonGreen, 200));
    c.pix.frame(r.cx - 16, r.headTop - 6, r.cx + 15, r.groundY, withAlpha(C.neonCyan, 140));
  },
  // Mirante
  luvas_brancas: (c) => armMark(c, 'both', 1, (x, y) => c.pix.box(x - 1, y - 1, x + 1, y + 1, C.pureWhite)),
  fone_transparente: (c) => {
    if (c.slice !== 'head' || c.rig.view === 'back') return;
    const r = c.rig;
    const x = r.view === 'side' ? r.cx + 2 : r.headR + 1;
    c.pix.vline(x, r.eyeY, r.mouthY + 2, withAlpha(C.pureWhite, 140));
    c.pix.put(x, r.mouthY + 3, withAlpha(C.pureWhite, 200));
  },
  fraque: (c) => {
    shirt(c, { sleeve: 'long', lapel: hex('#f0f0f0'), len: 'hip' });
    if (c.slice !== 'torso') return;
    const r = c.rig;
    // abas do fraque atrás
    if (r.view !== 'front') c.pix.box(r.cx - 3, r.torsoBot, r.cx + 2, r.torsoBot + 6, c0(c));
    else {
      c.pix.vline(r.torsoL, r.torsoBot, r.torsoBot + 5, c0(c));
      c.pix.vline(r.torsoR, r.torsoBot, r.torsoBot + 5, dk(c0(c)));
      c.pix.box(r.cx - 1, r.torsoTop, r.cx, r.torsoTop + 1, C.ink); // gravata-borboleta
    }
  },
  bandeja_prata: (c) => {
    if (!handSliceOk(c, 'off')) return;
    const h = handOf(c, 'off');
    const x = fr(h.x);
    const y = fr(h.y) - 1;
    c.pix.hline(x - 4, x + 3, y, C.silver);
    c.pix.hline(x - 3, x + 2, y + 1, shade(C.silver, 0.7));
    c.pix.box(x - 2, y - 2, x - 1, y - 1, hex('#e8c070')); // canapé
    c.pix.put(x + 1, y - 1, C.red);
  },
  cabeca_robo: (c) => {
    if (c.slice !== 'head') return;
    const r = c.rig;
    dome(c, 14, c0(c), { up: 0 });
    if (r.view !== 'back') {
      const ey = r.eyeY;
      if (r.view === 'front') {
        c.pix.box(r.cx - 5, ey, r.cx - 3, ey + 1, C.neonCyan);
        c.pix.box(r.cx + 2, ey, r.cx + 4, ey + 1, C.neonCyan);
        c.pix.hline(r.cx - 2, r.cx + 1, r.mouthY, C.ink);
      } else c.pix.box(r.headL + 1, ey, r.headL + 3, ey + 1, C.neonCyan);
    }
    c.pix.vline(r.cx, r.headTop - 4, r.headTop - 1, C.metalDark);
    c.pix.put(r.cx, r.headTop - 5, c.frame % 2 ? C.red : C.neonGreen);
  },
  // Delta e menores
  avental_lona: (c) => {
    if (c.slice !== 'torso' || c.rig.view === 'back') return;
    const r = c.rig;
    const col = c0(c);
    const x0 = r.view === 'side' ? r.torsoL - 1 : r.torsoL + 1;
    const x1 = r.view === 'side' ? r.torsoL + 3 : r.torsoR - 1;
    c.pix.box(x0, r.torsoTop + 3, x1, r.torsoBot + 6, col);
    c.pix.hline(x0, x1, r.torsoBot + 6, dk(col));
    c.pix.hline(x0, x1, r.waistY, dk(col));
  },
  bone_pescador: (c) => capHat(c, { base: c0(c), front: c1(c) }),
  camisa_florida: (c) => floral(c, { sleeve: 'short', open: 4 }),
  casaco_pedrinhas: (c) => {
    shirt(c, { sleeve: 'long', open: 14, len: 'hip' });
    if (c.slice !== 'torso' || c.rig.view === 'back') return;
    const r = c.rig;
    for (let y = r.torsoTop + 3; y < r.torsoBot; y += 3) {
      c.pix.put(r.torsoL + 1, y, C.gold);
      c.pix.put(r.torsoR - 1, y + 1, C.gold);
    }
  },
  regata_furada: (c) => {
    shirt(c, { sleeve: 'none', len: 'hip' });
    if (c.slice === 'torso') {
      const r = c.rig;
      c.pix.set(r.cx - 3, r.torsoTop + 6, c.skin.base);
      c.pix.set(r.cx + 2, r.torsoTop + 9, c.skin.base);
    }
  },
  remo: (c) => {
    const s = heldStick(c, 22, c0(c), 'main', 1);
    if (s) c.pix.ellipse(s.tx, s.ty, 1.6, 3.5, c0(c));
  },
  roupao_florido: (c) => floral(c, { len: 'knee', sleeve: 'long' }),
  caderninho: (c) =>
    heldBox(c, 'off', 3, 4, c0(c), (x, y) => {
      c.pix.line(x + 3, y, x + 5, y + 4, C.paper); // barbante da caneta
    }),
  mochila_termica: (c) => {
    if (c.slice !== 'back') return;
    const r = c.rig;
    const col = c0(c);
    const x = r.view === 'side' ? r.torsoR - 1 : r.cx - 7;
    const w = r.view === 'side' ? 7 : 14;
    c.pix.box(x, r.torsoTop - 6, x + w - 1, r.torsoTop + 9, col);
    c.pix.frame(x, r.torsoTop - 6, x + w - 1, r.torsoTop + 9, dk(col));
    if (r.view === 'back') c.pix.box(x + 4, r.torsoTop - 2, x + 9, r.torsoTop + 2, c1(c));
  },
  capacete_camera: (c) => {
    if (c.slice !== 'head') return;
    dome(c, 5, c0(c), { rim: dk(c0(c)) });
    const r = c.rig;
    c.pix.box(r.cx + 2, r.headTop - 3, r.cx + 4, r.headTop - 1, C.ink);
    c.pix.put(r.cx + 3, r.headTop - 2, C.red);
  },
  nota_flutuante: (c) => {
    if (c.slice !== 'front') return;
    const r = c.rig;
    const y = r.headTop - 8 + (c.frame % 2);
    for (let i = 0; i < 4; i++) c.pix.put(r.cx - 4 + i * 2, y, i < 2 ? C.warn : withAlpha(C.warn, 80)); // estrelas caindo
  },
  uniforme_neon: (c) => {
    shirt(c, { sleeve: 'long', len: 'hip' });
    if (c.slice === 'torso') {
      const r = c.rig;
      const s = torsoSpan(r, r.torsoTop + 4);
      if (s) c.pix.hline(s[0], s[1], r.torsoTop + 4, c1(c));
    }
  },
  tablet_termos: (c) => {
    heldBox(c, 'off', 5, 4, C.ink, (x, y) => c.pix.box(x + 1, y + 1, x + 3, y + 2, C.neonCyan));
    if (!handSliceOk(c, 'off')) return;
    const h = handOf(c, 'off');
    // rolo dos termos de uso arrastando no chão
    c.pix.box(fr(h.x) - 1, fr(h.y) + 2, fr(h.x) + 1, c.rig.groundY, C.paper);
    for (let y = fr(h.y) + 3; y < c.rig.groundY; y += 2) c.pix.put(fr(h.x), y, C.metal);
  },
  xale_croche: (c) => {
    if (c.slice !== 'torso') return;
    const r = c.rig;
    const col = c0(c);
    for (let y = r.torsoTop; y <= r.torsoTop + 6; y++) {
      const s = torsoSpan(r, y);
      if (!s) continue;
      const k = y - r.torsoTop;
      for (let x = s[0] - 1; x <= s[1] + 1; x++) if ((x + y) % 2 === 0 || k < 2) c.pix.put(x, y, col);
    }
    if (r.view !== 'back') c.pix.put(r.cx, r.torsoTop + 7, col);
  },
  ramo_arruda: (c) => {
    if (c.slice !== 'head') return;
    const r = c.rig;
    const x = r.view === 'side' ? r.cx + 3 : r.headR;
    c.pix.line(x, r.eyeY, x + 2, r.eyeY - 4, C.leafDark);
    c.pix.put(x + 1, r.eyeY - 2, C.leaf);
    c.pix.put(x + 2, r.eyeY - 4, C.leaf);
  },
  espelho_grande: (c) => {
    const p = floatSpot(c, 9, 20, 'ground', 'front');
    if (!p) return;
    c.pix.box(p.x, p.y - 4, p.x + 8, p.y + 19, C.woodDark);
    c.pix.box(p.x + 1, p.y - 3, p.x + 7, p.y + 17, hex('#b8d0d8'));
    c.pix.line(p.x + 2, p.y, p.x + 5, p.y + 6, C.pureWhite);
    c.pix.put(p.x + 4, p.y - 4, C.gold);
  },
  colete_duas_cores: (c) => {
    if (c.slice !== 'torso') return;
    const r = c.rig;
    for (let y = r.torsoTop + 1; y < r.torsoBot; y++) {
      const s = torsoSpan(r, y);
      if (!s) continue;
      for (let x = s[0]; x <= s[1]; x++) c.pix.put(x, y, x < r.cx ? hex('#5b6b2e') : C.neonCyan);
    }
  },
  calculadora_madeira: (c) =>
    heldBox(c, 'main', 3, 4, C.wood, (x, y) => {
      c.pix.put(x + 1, y + 1, C.paper);
      c.pix.put(x + 1, y + 3, C.woodDark);
    }),
  calculadora_holo: (c) =>
    heldBox(c, 'off', 3, 4, withAlpha(C.neonCyan, 150), (x, y) => {
      c.pix.put(x + 1, y + 1, C.pureWhite);
    }),
  placar_cotacao: (c) => {
    if (c.slice !== 'under') return;
    const r = c.rig;
    // SUGESTÃO: os números do placar de cotação mudam a cada quadro (não são o câmbio real)
    c.pix.box(r.cx - 9, r.headTop - 10, r.cx + 8, r.headTop - 4, C.ink);
    microText(c.pix, r.cx - 8, r.headTop - 9, 16, 2, `${(c.frame * 37) % 97} SEMENTE ${(c.frame * 53) % 89}`, c.frame % 2 ? C.neonGreen : C.warn);
  },
  // inimigos humanos
  porrete: (c) => {
    const s = heldStick(c, 10, c0(c), 'main', 2);
    if (s) c.pix.disk(s.tx, s.ty, 1.6, c0(c));
  },
  cracha_mao: (c) => {
    if (c.slice !== 'torso' || c.rig.view === 'back') return;
    const r = c.rig;
    // SUGESTÃO: o texto do crachá escrito à mão
    plate(c.pix, r.view === 'side' ? r.torsoL : r.cx + 1, r.torsoTop + 3, 4, 3, C.paper, 'CAPANGA', C.ink);
  },
  camisa_social_suada: (c) => {
    shirt(c, { sleeve: 'long', collar: C.pureWhite });
    if (c.slice !== 'torso' || c.rig.view === 'back') return;
    const r = c.rig;
    c.pix.paint(r.torsoL + 1, r.torsoTop + 4, hex('#a8b8c8'));
    c.pix.paint(r.torsoR - 1, r.torsoTop + 4, hex('#a8b8c8'));
  },
  maquininha_pescoco: (c) => {
    if (c.slice !== 'torso' || c.rig.view === 'back') return;
    const r = c.rig;
    const x = r.view === 'side' ? r.torsoL : r.cx - 1;
    c.pix.line(r.cx - 3, r.torsoTop, x, r.torsoTop + 5, C.ink);
    c.pix.line(r.cx + 2, r.torsoTop, x + 2, r.torsoTop + 5, C.ink);
    c.pix.box(x, r.torsoTop + 5, x + 2, r.torsoTop + 8, hex('#2a2a30'));
    c.pix.put(x + 1, r.torsoTop + 6, C.neonGreen);
  },
  mochila_pedras: (c) => {
    if (c.slice !== 'back') return;
    const r = c.rig;
    const x = r.view === 'side' ? r.torsoR : r.cx - 5;
    const w = r.view === 'side' ? 4 : 10;
    c.pix.box(x, r.torsoTop, x + w - 1, r.torsoTop + 10, c0(c));
    for (let i = 0; i < 4; i++) c.pix.put(x + 1 + ((i * 3) % w), r.torsoTop - 1 - (i % 2), hex('#e0a526')); // chopindita
  },
  lenco_rosto: (c) => {
    if (c.slice !== 'head') return;
    const r = c.rig;
    for (let y = r.eyeY + 2; y <= r.headBot + 1; y++) {
      const s = headSpan(r, Math.min(y, r.headBot));
      if (!s) continue;
      if (r.view === 'back') {
        if (y === r.eyeY + 2) c.pix.hline(s[0], s[1], y, c0(c));
        continue;
      }
      c.pix.hline(r.view === 'side' ? s[0] - 1 : s[0], r.view === 'side' ? r.cx + 2 : s[1], y, (x0(y) ? c0(c) : dk(c0(c))));
    }
    function x0(y: number) {
      return y % 2 === 0;
    }
  },
  garrucha: (c) => {
    if (!handSliceOk(c, 'main')) return;
    const h = handOf(c, 'main');
    const x = fr(h.x);
    const y = fr(h.y);
    if (c.rig.view === 'side') {
      c.pix.hline(x - 6, x, y - 1, C.metalDark);
      c.pix.box(x - 1, y - 1, x + 1, y + 1, C.wood);
      c.pix.put(x - 3, y - 1, C.white); // remendo
    } else {
      c.pix.vline(x, y, y + 5, C.metalDark);
      c.pix.box(x - 1, y - 1, x + 1, y, C.wood);
    }
  },
  bracadeira_fiscal: (c) => armMark(c, 'off', 0.25, (x, y) => c.pix.box(x - 1, y - 1, x + 1, y + 1, c0(c))),
  // invocações humanas e hologramas
  nota_oficial: (c) =>
    heldBox(c, 'main', 4, 5, C.paper, (x, y) => {
      for (let j = 1; j < 5; j += 2) c.pix.hline(x + 1, x + 2, y + j, C.metal);
    }),
  marca_dagua: (c) => {
    if (c.slice !== 'front') return;
    const r = c.rig;
    microText(c.pix, r.cx - 5, r.torsoTop + 6, 10, 1, 'VERSAO DE TESTE', withAlpha(C.pureWhite, 160));
  },
  espirito_translucido: (c) => {
    if (c.slice !== 'under') return;
    const r = c.rig;
    c.pix.ellipse(r.cx, r.torsoTop + 6, 11, 16, withAlpha(c0(c), 60));
  },
  backprint: (c) => backPrint(c, c0(c)),
  oculos_escuros_extra: (c) => glasses(c, 'dark', c0(c)),
};
