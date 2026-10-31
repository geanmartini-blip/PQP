/**
 * Testes do gerador de pixel art (funções puras, sem Phaser).
 */
import { describe, expect, it } from 'vitest';
import { getData } from '@pqp/shared';
import { Tile } from '@pqp/shared/map';
import { ANIMS, SPRITE_H, SPRITE_W } from '../src/art/contract';
import { archetypeLook, artCatalog, buildCharacterSheet, clearCharacterCache, defaultLook, lookKey, resolveLook } from '../src/art/character';
import { buildEnemySheet, buildSummonSheet, enemyHasArt, ENEMY_ART_IDS } from '../src/art/creatures';
import { buildFontPix, buildFx, coneKeyFor, FX_KEYS } from '../src/art/fx';
import { buildEmblem, buildIcon, buildPortrait, ICON_PX } from '../src/art/icons';
import { ART } from '../src/art/layers';
import { npcLook, STORY_NPC_IDS, trainerLook } from '../src/art/npcs';
import { luma, Pix } from '../src/art/pixel';
import { frameOf, type SheetData, TOTAL_FRAMES_PER_DIR } from '../src/art/sheet';
import { buildTileset, TILE_VALUES, TILE_VARIANTS, tileFrame } from '../src/art/tiles';

const d = getData();

/** Assinatura FNV dos pixels (o tsconfig do cliente não tem os tipos do Node, então nada de Buffer). */
function sig(d: Uint8ClampedArray): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < d.length; i++) {
    h ^= d[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return `${d.length}:${(h >>> 0).toString(16)}`;
}

function same(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function frameNames(sheet: SheetData): string[] {
  return sheet.frames.map((f) => f.name);
}

/** Todo pixel opaco com vizinho transparente (4 direções) deve ser contorno escuro. */
function edgesAreDark(p: Pix, maxLuma = 90): { ok: boolean; edges: number; bad: number } {
  let edges = 0;
  let bad = 0;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (p.alphaAt(x, y) !== 255) continue;
      const open = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => p.inside(x + dx!, y + dy!) && p.alphaAt(x + dx!, y + dy!) === 0);
      if (!open) continue;
      edges++;
      if (luma(p.get(x, y)) > maxLuma) bad++;
    }
  return { ok: bad === 0, edges, bad };
}

describe('boneco em camadas', () => {
  it('folha padrão tem quadros de 32x48 em 4 direções com todas as animações de ANIMS', () => {
    const sh = buildCharacterSheet(defaultLook());
    expect(sh.frameW).toBe(SPRITE_W);
    expect(sh.frameH).toBe(SPRITE_H);
    expect(sh.frames.length).toBe(TOTAL_FRAMES_PER_DIR * 4);
    for (const [anim, n] of Object.entries(ANIMS))
      for (let dir = 0; dir < 4; dir++)
        for (let i = 0; i < n; i++) {
          const f = sh.frames.find((r) => r.name === `${anim}_${dir}_${i}`);
          expect(f, `${anim}_${dir}_${i}`).toBeDefined();
          expect(f!.w).toBe(32);
          expect(f!.h).toBe(48);
          expect(frameOf(sh, f!.name).countOpaque()).toBeGreaterThan(200);
        }
  });

  it('camadas largas e altas do artCatalog aumentam o quadro (larguraPx e overflowTopoPx)', () => {
    expect(buildCharacterSheet(archetypeLook('peao_brabo', 'veterano')).frameW).toBe(40); // chapéu de 40 px
    expect(buildCharacterSheet(archetypeLook('peao_brabo', 'aprendiz')).frameW).toBe(32);
    const diva = buildCharacterSheet(archetypeLook('diva_da_opera', 'veterano'));
    expect(diva.frameW).toBe(64); // vestido de dois tiles
    expect(diva.frameH).toBe(48 + 8); // peruca com passarinho
  });

  it('contorno escuro de 1 px em volta do boneco', () => {
    const looks = [defaultLook(), archetypeLook('peao_brabo', 'aprendiz'), archetypeLook('idol', 'aprendiz'), archetypeLook('idol', 'base')];
    for (const lk of looks) {
      const sh = buildCharacterSheet(lk);
      for (const name of ['parado_0_0', 'parado_1_0', 'parado_2_1', 'andando_3_2', 'basico_0_1', 'derrota_0_2']) {
        const r = edgesAreDark(frameOf(sh, name));
        expect(r.edges, `${sh.key} ${name}`).toBeGreaterThan(40);
        expect(r.bad, `${sh.key} ${name}`).toBe(0);
      }
    }
  });

  it('determinismo: o mesmo visual gera os mesmos pixels e a mesma chave', () => {
    const a = { ...archetypeLook('idol', 'veterano', 2), details: ['oculos', 'dente_de_ouro'] };
    const b = JSON.parse(JSON.stringify({ outfit: a.outfit, details: a.details, hairColor: a.hairColor, hair: a.hair, face: a.face, skin: a.skin, body: a.body }));
    expect(lookKey(a)).toBe(lookKey(b));
    const s1 = buildCharacterSheet(a);
    clearCharacterCache();
    const s2 = buildCharacterSheet(b);
    expect(s1).not.toBe(s2);
    expect(same(s1.pix.data, s2.pix.data)).toBe(true);
    expect(lookKey({ ...a, palette: undefined } as never)).toBe(lookKey(a));
    expect(lookKey({ ...a, outfit: { ...a.outfit, palette: 1 } })).not.toBe(lookKey(a));
  });

  it('toda chave do artCatalog tem desenhista próprio', () => {
    const missing = [...artCatalog().keys()].filter((k) => !ART[k]);
    expect(missing).toEqual([]);
  });

  it('silhueta: Peão Brabo e Idol em todos os tiers do piloto são diferentes entre si e do Delta', () => {
    const keys = new Set<string>();
    const sums = new Set<string>();
    for (const a of ['peao_brabo', 'idol'])
      for (const t of ['base', 'aprendiz', 'veterano'] as const) {
        const sh = buildCharacterSheet(archetypeLook(a, t));
        keys.add(sh.key);
        sums.add(sig(frameOf(sh, 'parado_0_0').data));
      }
    sums.add(sig(frameOf(buildCharacterSheet(defaultLook()), 'parado_0_0').data));
    expect(keys.size).toBe(6);
    expect(sums.size).toBe(7);
    // o chapéu do peão sai da cabeça; a franja pastel do Idol é a cor clara da paleta
    const rl = resolveLook(archetypeLook('peao_brabo', 'veterano'));
    expect(rl.layers.some((l) => l.arte === 'chapeu_peao_gigante' && l.hides)).toBe(true);
    const idol = resolveLook(archetypeLook('idol', 'veterano'));
    expect(idol.layers.some((l) => l.arte === 'caixas_som_voadoras_duas')).toBe(true);
  });

  it('os 24 arquétipos têm aprendiz e veterano desenháveis, e as 3 paletas mudam a cor', () => {
    for (const a of d.archetypes)
      for (const t of ['aprendiz', 'veterano'] as const) {
        const sh = buildCharacterSheet(archetypeLook(a.id, t));
        expect(frameOf(sh, 'parado_0_0').countOpaque(), `${a.id} ${t}`).toBeGreaterThan(250);
      }
    const p0 = buildCharacterSheet(archetypeLook('idol', 'aprendiz', 0));
    const p1 = buildCharacterSheet(archetypeLook('idol', 'aprendiz', 1));
    expect(same(p0.pix.data, p1.pix.data)).toBe(false);
  });

  it('as camadas do jogador mudam o desenho: corpo, pele, rosto, cabelo, detalhes e itens', () => {
    const base = defaultLook();
    const ref = frameOf(buildCharacterSheet(base), 'parado_0_0').data;
    const variants = [
      { ...base, body: 'barrigudo' },
      { ...base, skin: 'vermelho_de_sol' },
      { ...base, face: 'sobrancelha_de_vilao' },
      { ...base, hair: 'black_power' },
      { ...base, hairColor: 'rosa_neon' },
      { ...base, details: ['bigode'] },
      { ...base, outfit: { tier: 'delta' as const, palette: 3 } },
    ];
    for (const v of variants) expect(same(frameOf(buildCharacterSheet(v), 'parado_0_0').data, ref), JSON.stringify(v)).toBe(false);
    // item raro de cabeça aparece (pedrinha da raridade) e adorno raro do peão chama o touro-espírito
    const peao = archetypeLook('peao_brabo', 'aprendiz');
    const comItem = { ...peao, items: [{ slot: 'cabeca', rarity: 'raro' as const }] };
    expect(resolveLook(comItem).layers.some((l) => l.arte === 'chapeu_peao_gigante')).toBe(true);
    expect(resolveLook({ ...peao, items: [{ slot: 'adorno', rarity: 'raro' as const }] }).extras).toContain('touro');
  });
});

describe('NPCs', () => {
  it('os 24 treinadores e os personagens da história têm folha', () => {
    for (const t of d.trainers) {
      const lk = trainerLook(t.id);
      expect(lk, t.id).toBeDefined();
      expect(frameOf(buildCharacterSheet(lk!), 'parado_0_0').countOpaque()).toBeGreaterThan(250);
    }
    for (const id of STORY_NPC_IDS) expect(frameOf(buildCharacterSheet(npcLook(id)!), 'parado_0_0').countOpaque(), id).toBeGreaterThan(150);
    for (const p of d.npcs.personagens) expect(npcLook(p.id), p.id).toBeDefined();
  });

  it('Wesley tem o touro-espírito translúcido e Li Wei o palco holográfico', () => {
    expect(resolveLook(trainerLook('wesley')!).extras).toContain('touro');
    expect(resolveLook(trainerLook('li_wei')!).extras).toContain('palco');
    const f = frameOf(buildCharacterSheet(trainerLook('wesley')!), 'parado_0_0');
    let translucent = 0;
    for (let i = 3; i < f.data.length; i += 4) if (f.data[i]! > 0 && f.data[i]! < 255) translucent++;
    expect(translucent).toBeGreaterThan(30);
  });
});

describe('inimigos e invocações', () => {
  it('todo inimigo de enemies.json tem desenho, nos 3 tiers', () => {
    for (const e of d.enemies.inimigos) {
      expect(enemyHasArt(e.id), e.id).toBe(true);
      for (const tier of ['normal', 'elite', 'chefe'] as const) {
        const sh = buildEnemySheet(e.id, tier);
        // chefe até 64x64 (com a aura); os outros cabem folgados
        expect(sh.frameW, `${e.id} ${tier}`).toBeLessThanOrEqual(64);
        expect(sh.frameH, `${e.id} ${tier}`).toBeLessThanOrEqual(64);
        for (const n of ['parado_0_0', 'andando_1_3', 'basico_2_1', 'derrota_3_2']) expect(frameOf(sh, n).countOpaque(), `${e.id} ${tier} ${n}`).toBeGreaterThan(20);
      }
    }
  });

  it('os inimigos do Delta têm desenho próprio', () => {
    for (const id of ['siri_do_mangue', 'capanga_do_capataz', 'mosquito_do_delta', 'cobrador_do_capataz', 'cao_de_guarda_do_capataz', 'bruno_ferro_chefe']) expect(ENEMY_ART_IDS).toContain(id);
  });

  it('elite tem contorno colorido e chefe é maior', () => {
    const n = buildEnemySheet('siri_do_mangue', 'normal');
    const e = buildEnemySheet('siri_do_mangue', 'elite');
    const c = buildEnemySheet('siri_do_mangue', 'chefe');
    const fe = frameOf(e, 'parado_0_0');
    let orange = 0;
    for (let i = 0; i < fe.data.length; i += 4) if (fe.data[i + 3] === 255 && fe.data[i]! > 200 && fe.data[i + 1]! > 140 && fe.data[i + 2]! < 80) orange++;
    expect(orange).toBeGreaterThan(20);
    expect(c.frameW).toBeGreaterThan(n.frameW);
    expect(buildEnemySheet('bruno_ferro_chefe').frameH).toBeGreaterThan(48);
    expect(buildEnemySheet('bomba_descontrolada').frameW).toBe(64);
    expect(buildEnemySheet('bomba_descontrolada').frameH).toBeLessThanOrEqual(64);
  });

  it('toda invocação tem desenho nos dois lados', () => {
    for (const s of d.summons)
      for (const side of ['esquerda', 'direita'] as const) {
        const sh = buildSummonSheet(s.id, side);
        expect(frameOf(sh, 'parado_0_0').countOpaque(1), `${s.id} ${side}`).toBeGreaterThan(30);
      }
    const totem = buildSummonSheet('totem_ou_robo', 'esquerda');
    const robo = buildSummonSheet('totem_ou_robo', 'direita');
    expect(same(totem.pix.data, robo.pix.data)).toBe(false);
  });
});

describe('tiles', () => {
  it('todo valor de Tile tem quadro, com as variações declaradas', () => {
    const ts = buildTileset();
    const names = new Set(frameNames(ts));
    const enumValues = Object.values(Tile).filter((v) => typeof v === 'number');
    expect(TILE_VALUES.sort()).toEqual([...enumValues].sort());
    for (const t of TILE_VALUES) {
      const n = TILE_VARIANTS[t];
      expect(n, `variantes de ${t}`).toBeGreaterThanOrEqual(1);
      for (let v = 0; v < n!; v++) {
        expect(names.has(`${t}_${v}`), `${t}_${v}`).toBe(true);
        const f = frameOf(ts, `${t}_${v}`);
        expect(f.w).toBe(32);
        expect(f.h).toBe(32);
        expect(f.countOpaque()).toBeGreaterThan(300);
      }
    }
    expect(TILE_VARIANTS[Tile.AguaRasa]).toBeGreaterThanOrEqual(2);
    expect(TILE_VARIANTS[Tile.AguaFunda]).toBeGreaterThanOrEqual(2);
    expect(names.has(`copa_${Tile.Arvore}_0`)).toBe(true);
  });

  it('tileFrame sempre devolve um quadro que existe, e a água anda com o tempo', () => {
    const names = new Set(frameNames(buildTileset()));
    for (const t of TILE_VALUES)
      for (const region of [undefined, 'delta', 'margem_esquerda', 'margem_direita', 'juncal', 'usina_da_ponte'])
        for (let k = 0; k < 6; k++) expect(names.has(tileFrame(t, k * 7, k * 3, region, k * 300))).toBe(true);
    expect(tileFrame(Tile.AguaRasa, 1, 1, undefined, 0)).not.toBe(tileFrame(Tile.AguaRasa, 1, 1, undefined, 300));
    expect(tileFrame(Tile.Parede, 3, 3, 'margem_esquerda')).not.toBe(tileFrame(Tile.Parede, 3, 3, 'margem_direita'));
  });
});

describe('efeitos, ícones, retratos e emblemas', () => {
  it('efeitos com os quadros declarados', () => {
    const { sheets, info } = buildFx();
    expect(sheets.map((s) => s.key).sort()).toEqual([...FX_KEYS].sort());
    for (const s of sheets) {
      expect(s.frames.length, s.key).toBe(info[s.key]!.frames);
      for (const f of s.frames) expect(frameOf(s, f.name).countOpaque(), `${s.key} ${f.name}`).toBeGreaterThan(0);
    }
    for (const k of ['fx_alvo', 'fx_aviso_circulo', 'fx_aviso_linha', 'fx_faisca', 'fx_folhas', 'fx_glitch', 'fx_saque', 'fx_anel_carga']) expect(FX_KEYS).toContain(k);
    expect(coneKeyFor(70)).toBe('fx_aviso_cone_70');
    expect(coneKeyFor(90)).toBe('fx_aviso_cone_90');
    expect(coneKeyFor(100)).toBe('fx_aviso_cone_90');
    // o aviso enche: o último quadro tem mais miolo forte que o primeiro
    const circ = sheets.find((s) => s.key === 'fx_aviso_circulo')!;
    const strong = (p: Pix) => {
      let n = 0;
      for (let i = 3; i < p.data.length; i += 4) if (p.data[i]! >= 120) n++;
      return n;
    };
    expect(strong(frameOf(circ, '7'))).toBeGreaterThan(strong(frameOf(circ, '0')));
    expect(buildFontPix().countOpaque()).toBeGreaterThan(500);
  });

  it('ícone 48x48 para cada habilidade do Peão Brabo e do Idol (marca, classe, Especial, básico e virada)', () => {
    const unknown = buildIcon('id_que_nao_existe').data;
    const ids = [
      ...[...d.abilities.values()].filter((a) => a.ownerKey === 'peao_brabo' || a.ownerKey === 'idol').map((a) => a.id),
      ...[...d.abilities.values()].filter((a) => a.ownerKey === 'combatente' || a.ownerKey === 'mascarado').map((a) => a.id),
    ];
    expect(ids.length).toBeGreaterThanOrEqual(4 + 2 + 8 + 2 + 2);
    const seen = new Set<string>();
    for (const id of ids) {
      const p = buildIcon(id);
      expect(p.w).toBe(ICON_PX);
      expect(p.h).toBe(ICON_PX);
      expect(same(p.data, unknown), id).toBe(false);
      seen.add(sig(p.data));
    }
    expect(seen.size).toBe(ids.length);
  });

  it('ícones de itens, únicos e consumíveis', () => {
    for (const id of [d.items.itens[0]!.id, d.uniques.unicos[0]!.id, 'pocao', 'usar_granada']) {
      const p = buildIcon(id);
      expect(p.w).toBe(48);
      expect(p.countOpaque()).toBeGreaterThan(1500);
    }
  });

  it('retratos e emblemas de 64x64', () => {
    for (const w of ['wesley', 'li_wei', 'seu_jaco', 'siri_do_mangue', 'idol']) {
      const p = buildPortrait(w);
      expect([p.w, p.h]).toEqual([64, 64]);
    }
    expect(buildPortrait(defaultLook()).w).toBe(64);
    const seen = new Set<string>();
    for (const i of d.institutions.instituicoes) {
      const p = buildEmblem(i.id);
      expect([p.w, p.h]).toEqual([64, 64]);
      seen.add(sig(p.data));
    }
    expect(seen.size).toBe(8);
  });
});
