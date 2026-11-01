/**
 * Arte da Fase 5: tiles das Galerias da Usina, chefe com aviso no chão, Lazzaro e Rolf, itens no
 * boneco por ala com a raridade visível, ícones de item, crachá de plantão e pontos de controle.
 */
import { describe, expect, it } from 'vitest';
import { getData } from '@pqp/shared';
import { Tile } from '@pqp/shared/map';
import { archetypeLook, buildCharacterSheet, drawCharacterFrame, resolveLook } from '../src/art/character';
import { buildEnemySheet } from '../src/art/creatures';
import { buildFx, controlPointFxKey, FX_KEYS, plantaoFxKey } from '../src/art/fx';
import { buildGaleriasTileset, GALERIAS_ANIMATED, GALERIAS_VARIANTS, galeriasFrame, galeriasPix, renderGalerias } from '../src/art/galerias';
import { buildIcon } from '../src/art/icons';
import { buildItemIcon, itemArchetype, itemArtKey, itemLayerPix, lookItemsFor, rarityColor } from '../src/art/itemArt';
import { npcLook, STORY_NPC_IDS } from '../src/art/npcs';
import { B, G, type Pix, R } from '../src/art/pixel';
import { frameOf } from '../src/art/sheet';

const d = getData();

function sig(p: Pix): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < p.data.length; i++) {
    h ^= p.data[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return `${p.w}x${p.h}:${(h >>> 0).toString(16)}`;
}

/** Quantos pixels têm (quase) a cor dada. */
function countColor(p: Pix, c: number, tol = 40): number {
  let n = 0;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const v = p.get(x, y);
      if ((v & 255) < 200) continue;
      if (Math.abs(R(v) - R(c)) + Math.abs(G(v) - G(c)) + Math.abs(B(v) - B(c)) <= tol) n++;
    }
  return n;
}

describe('tiles das Galerias da Usina', () => {
  it('a folha tem todas as famílias, com desenho visível e sem quadro repetido', () => {
    const sh = buildGaleriasTileset();
    const names = new Set(sh.frames.map((f) => f.name));
    for (const [fam, n] of Object.entries(GALERIAS_VARIANTS)) for (let v = 0; v < n; v++) expect(names.has(`gal_${fam}_${v}`), `${fam}_${v}`).toBe(true);
    for (const n of ['gal_grelha', 'gal_passarela', 'gal_vazio']) expect(names.has(n)).toBe(true);
    const sigs = new Set<string>();
    for (const f of sh.frames) {
      const p = galeriasPix(f.name)!;
      expect(p.countOpaque(), f.name).toBeGreaterThan(200);
      sigs.add(sig(p));
    }
    expect(sigs.size).toBe(sh.frames.length);
    expect(galeriasPix('gal_turbina_grande_0')!.w).toBe(64);
    expect(sh.pix.w).toBeLessThanOrEqual(1024);
  });

  it('todo valor de Tile vira um quadro que existe; parede mostra a face quando embaixo é chão', () => {
    const names = new Set(buildGaleriasTileset().frames.map((f) => f.name));
    for (const t of Object.values(Tile).filter((v): v is number => typeof v === 'number'))
      for (let x = 0; x < 6; x++) expect(names.has(galeriasFrame(t, x, 3, x * 300, Tile.Concreto)), `${t}`).toBe(true);
    expect(galeriasFrame(Tile.Parede, 1, 1, 0, Tile.Concreto)).toMatch(/^gal_parede_face_/);
    expect(galeriasFrame(Tile.Parede, 1, 1, 0, Tile.Parede)).toMatch(/^gal_parede_topo_/);
    expect(galeriasFrame(Tile.Lama, 0, 0)).toMatch(/^gal_poca_/);
    expect(galeriasFrame(Tile.Porta, 0, 0)).toMatch(/^gal_escada_/);
    expect(galeriasFrame(Tile.Grade, 0, 0)).toMatch(/^gal_grade_/);
    expect(galeriasFrame(Tile.Maquina, 0, 0)).toMatch(/^gal_maquina_/);
    expect(galeriasFrame(Tile.Mato, 0, 0)).toMatch(/^gal_cabos_/);
  });

  it('poça, água e escada animam com o tempo; a poça brilha cor de chope', () => {
    for (const t of GALERIAS_ANIMATED) {
      const seen = new Set([0, 220, 440, 660].map((ms) => galeriasFrame(t, 2, 2, ms)));
      expect(seen.size, `${t}`).toBe(4);
    }
    const poca = galeriasPix('gal_poca_0')!;
    expect(countColor(poca, 0xf6c040ff, 60)).toBeGreaterThan(20);
  });

  it('o bloco do andar sai do tamanho pedido e é determinístico', () => {
    const src = { width: 4, height: 3, tile: (x: number, y: number) => (y === 0 ? Tile.Parede : x === 2 ? Tile.Lama : Tile.Concreto) };
    const a = renderGalerias(src, 0, 0, 4, 3);
    expect([a.w, a.h]).toEqual([128, 96]);
    expect(a.countOpaque()).toBe(128 * 96);
    expect(sig(renderGalerias(src, 0, 0, 4, 3))).toBe(sig(a));
  });
});

describe('chefe das Galerias e avisos', () => {
  it('a Bomba Descontrolada é maior que o boneco e tem aviso no chão próprio', () => {
    const boss = buildEnemySheet('bomba_descontrolada', 'chefe');
    expect(boss.frameW).toBeGreaterThan(32);
    expect(boss.frameH).toBeGreaterThan(48);
    const { info, sheets } = buildFx();
    expect(info['fx_aviso_bomba']).toMatchObject({ frames: 8, w: 96, h: 96 });
    // o aviso tem pelo menos 0,8 s em 8 quadros de progresso e muda a cada quadro
    const sh = sheets.find((s) => s.key === 'fx_aviso_bomba')!;
    const sigs = new Set(Array.from({ length: 8 }, (_, i) => sig(frameOf(sh, String(i)))));
    expect(sigs.size).toBe(8);
    for (const k of ['fx_succao', 'fx_descarga', 'fx_agua_subindo']) expect(FX_KEYS).toContain(k);
    expect(d.dungeonsById.get('galerias_da_usina')!.chefe.inimigo).toBe('bomba_descontrolada');
  });
});

describe('Lazzaro Prati e Rolf Halvorsen', () => {
  it('os dois comandantes da IA de facção têm visual próprio e diferente', () => {
    const cmd = d.factionAi.piloto.comando;
    const ids = [cmd.esquerda, cmd.direita];
    expect(ids).toEqual(['lazzaro_prati', 'rolf_halvorsen']);
    const sigs = new Set<string>();
    for (const id of ids) {
      expect(STORY_NPC_IDS).toContain(id);
      const lk = npcLook(id)!;
      const f = frameOf(buildCharacterSheet(lk), 'parado_0_0');
      expect(f.countOpaque(), id).toBeGreaterThan(250);
      sigs.add(sig(f));
    }
    expect(sigs.size).toBe(2);
    // Lazzaro de boina e megafone; Rolf de armadura de choque e escudo
    expect(resolveLook(npcLook('lazzaro_prati')!).layers.map((l) => l.arte)).toEqual(expect.arrayContaining(['boina_revolucionaria', 'megafone_direcao']));
    expect(resolveLook(npcLook('rolf_halvorsen')!).layers.map((l) => l.arte)).toEqual(expect.arrayContaining(['armadura_choque_leve', 'escudo_choque_simples']));
  });
});

describe('itens no boneco por ala', () => {
  it('a chave de arte segue visualPorArquetipo + sufixo da raridade', () => {
    const peaoCabeca = d.items.itens.find((i) => i.classLock === 'combatente' && i.margem === 'esquerda' && i.slot === 'cabeca' && i.rarity === 'raro')!;
    expect(itemArtKey(peaoCabeca.id, 'peao_brabo')).toBe('peao_brabo_cabeca_raro');
    expect(itemArchetype(peaoCabeca.id)).toBeDefined();
    const items = lookItemsFor({ cabeca: peaoCabeca.id }, 'peao_brabo');
    expect(items).toEqual([{ slot: 'cabeca', rarity: 'raro', art: 'peao_brabo_cabeca_raro' }]);
  });

  it('cada slot com camada muda só a sua parte, no estilo da ala; comum e raro mudam a peça', () => {
    for (const a of ['peao_brabo', 'idol']) {
      const arch = d.archetypesById.get(a)!;
      let layered = 0;
      let differ = 0;
      for (const slot of ['cabeca', 'peito', 'calca', 'arma', 'calcado']) {
        const c = itemLayerPix(a, slot, 'comum');
        const r = itemLayerPix(a, slot, 'raro');
        if (!c || !r) continue;
        layered++;
        if (sig(c) !== sig(r)) differ++;
      }
      expect(layered, a).toBeGreaterThanOrEqual(4);
      // onde aprendiz e veterano têm a mesma peça, o raro se distingue pelo contorno (teste abaixo)
      expect(differ, a).toBeGreaterThanOrEqual(2);
      // item raro de peito no aprendiz troca a camada do torso pela do veterano da ala
      const it = d.items.itens.find((i) => i.classLock === arch.classe && i.margem === arch.margem && i.slot === 'peito' && i.rarity === 'raro')!;
      const lk = { ...archetypeLook(a, 'aprendiz'), items: lookItemsFor([it.id], a) };
      const vet = d.outfits.tiers.find((t) => t.arquetipo === a && t.tier === 'veterano')!;
      const vetTorso = vet.camadas.filter((l) => l.parte === 'torso').map((l) => l.arte);
      const got = resolveLook(lk).layers.filter((l) => l.part === 'torso');
      expect(got.map((l) => l.arte)).toEqual(vetTorso);
      expect(got.every((l) => l.rarity === 'raro')).toBe(true);
    }
  });

  it('a raridade aparece no boneco: o raro ganha contorno azul, o comum não', () => {
    const base = archetypeLook('idol', 'aprendiz');
    const its = d.items.itens.filter((i) => i.classLock === 'mascarado' && i.margem === 'direita');
    const comum = drawCharacterFrame(resolveLook({ ...base, items: lookItemsFor(its.filter((i) => i.rarity === 'comum').map((i) => i.id), 'idol') }), 'parado', 0, 0);
    const raro = drawCharacterFrame(resolveLook({ ...base, items: lookItemsFor(its.filter((i) => i.rarity === 'raro').map((i) => i.id), 'idol') }), 'parado', 0, 0);
    const blue = rarityColor('raro');
    expect(countColor(raro, blue, 90)).toBeGreaterThan(countColor(comum, blue, 90) + 15);
  });
});

describe('ícones de item', () => {
  it('48x48 cheios, diferentes entre comum e raro e entre alas; a moldura tem a cor da raridade', () => {
    const sigs = new Set<string>();
    const sample = d.items.itens.filter((_, i) => i % 5 === 0);
    for (const it of sample) {
      const p = buildItemIcon(it.id);
      expect([p.w, p.h]).toEqual([48, 48]);
      expect(p.countOpaque(), it.id).toBeGreaterThan(1500);
      sigs.add(sig(p));
      if (it.rarity === 'raro') expect(countColor(p, rarityColor('raro'), 40), it.id).toBeGreaterThan(150);
    }
    expect(sigs.size).toBe(sample.length);
    // todos os itens-base têm ícone próprio
    expect(new Set(d.items.itens.map((i) => sig(buildItemIcon(i.id)))).size).toBe(d.items.itens.length);
    // o mesmo item sem classe desenhado em duas alas da margem muda de estilo
    const geral = d.items.itens.find((i) => i.id === 'peito_geral_esquerda_raro')!;
    const left = d.archetypes.filter((a) => a.margem === 'esquerda');
    expect(sig(buildItemIcon(geral.id, left[0]!.id))).not.toBe(sig(buildItemIcon(geral.id, left[3]!.id)));
    // buildIcon (ArtApi.icon) usa o mesmo ícone
    expect(sig(buildIcon(geral.id))).toBe(sig(buildItemIcon(geral.id)));
    // únicos do piloto em dourado
    for (const u of d.uniques.unicos.filter((x) => x.piloto)) expect(countColor(buildItemIcon(u.id), rarityColor('unico'), 40), u.id).toBeGreaterThan(150);
  });
});

describe('plantão e pontos de controle', () => {
  it('crachá de plantão e pontos de controle por margem existem e são diferentes', () => {
    const { info, sheets } = buildFx();
    const keys = [plantaoFxKey('esquerda'), plantaoFxKey('direita'), plantaoFxKey(null), controlPointFxKey('esquerda'), controlPointFxKey('direita'), controlPointFxKey(null), controlPointFxKey('esquerda', true)];
    expect(new Set(keys).size).toBe(7);
    const sigs = new Set<string>();
    for (const k of keys) {
      expect(info[k], k).toBeDefined();
      const f = frameOf(sheets.find((s) => s.key === k)!, '0');
      expect(f.countOpaque(), k).toBeGreaterThan(100);
      sigs.add(sig(f));
    }
    expect(sigs.size).toBe(7);
  });
});
