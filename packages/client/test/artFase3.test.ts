/**
 * Arte da Fase 3: folhas sob demanda (silhueta e desenho em fatias), os 24 arquétipos nas 3 paletas,
 * treinadores de mestre, props das margens, fachadas e ícones das 16 habilidades de classe e 48 marcas.
 */
import { describe, expect, it } from 'vitest';
import { getData } from '@pqp/shared';
import { Deco, getMap } from '@pqp/shared/map';
import { archetypeLook, buildCharacterSheet, clearCharacterCache, defaultLook, drawCharacterFrame, resolveLook } from '../src/art/character';
import { buildEnemySheet } from '../src/art/creatures';
import { abilityMotif, buildIcon } from '../src/art/icons';
import { buildFacade, buildPropSheet, facadeFrame, facadeIds, PROP_VARIANTS, propForDeco, PROPS } from '../src/art/landmarks';
import { MARK_ABILITY_MOTIF, MARK_MOTIFS } from '../src/art/markIcons';
import { trainerLook } from '../src/art/npcs';
import { hex, type Pix } from '../src/art/pixel';
import { completeSheet, drawPending, frameOf, isPendingSheet, pendingProgress, placeholderFrame, withDeferredDraw } from '../src/art/sheet';

const d = getData();

function sig(p: Pix): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < p.data.length; i++) {
    h ^= p.data[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return `${p.w}x${p.h}:${(h >>> 0).toString(16)}`;
}

describe('folhas sob demanda', () => {
  it('a folha adiada nasce com a silhueta em todos os quadros e termina igual à síncrona', () => {
    clearCharacterCache();
    const look = archetypeLook('idol', 'veterano', 1);
    const sync = buildCharacterSheet(look, 'teste_sync');
    const shell = withDeferredDraw(() => buildCharacterSheet(look, 'teste_adiada'));
    expect(isPendingSheet(shell.pix)).toBe(true);
    expect(shell.frames.map((f) => f.name)).toEqual(sync.frames.map((f) => f.name));
    expect([shell.frameW, shell.frameH]).toEqual([sync.frameW, sync.frameH]);
    // silhueta visível antes de desenhar
    const f0 = shell.frames[0]!;
    expect(shell.pix.crop(f0.x, f0.y, f0.w, f0.h).countOpaque()).toBeGreaterThan(80);
    // fatia de tempo: cada chamada com prazo vencido desenha um quadro só
    let t = 0;
    const clock = () => t++;
    expect(drawPending(shell.pix, 0, clock)).toBe(false);
    expect(pendingProgress(shell.pix)).toBeGreaterThan(0);
    expect(pendingProgress(shell.pix)).toBeLessThan(0.05);
    expect(drawPending(shell.pix)).toBe(true);
    expect(isPendingSheet(shell.pix)).toBe(false);
    expect(sig(shell.pix)).toBe(sig(sync.pix));
  });

  it('inimigos também saem adiados e frameOf termina a folha na hora', () => {
    const sh = withDeferredDraw(() => buildEnemySheet('siri_do_mangue', 'elite'));
    const f = frameOf(sh, 'andando_1_3');
    expect(isPendingSheet(sh.pix)).toBe(false);
    expect(f.countOpaque()).toBeGreaterThan(30);
    expect(completeSheet(sh)).toBe(sh);
  });

  it('a silhueta tem o tamanho do quadro e fica no chão', () => {
    for (const [w, h] of [
      [32, 48],
      [40, 56],
      [48, 32],
    ] as const) {
      const p = placeholderFrame(w, h);
      expect([p.w, p.h]).toEqual([w, h]);
      const b = p.bounds()!;
      expect(b[3]).toBeGreaterThanOrEqual(h - 14);
      expect(p.countOpaque()).toBeGreaterThan(40);
    }
  });
});

describe('24 alas: base, aprendiz e veterano nas 3 paletas', () => {
  it('cada ala tem silhueta própria e as 3 paletas mudam o boneco', () => {
    const vets = new Set<string>();
    for (const a of d.archetypes) {
      const fr = (tier: 'base' | 'aprendiz' | 'veterano', p = 0) => drawCharacterFrame(resolveLook(archetypeLook(a.id, tier, p)), 'parado', 0, 0);
      const base = sig(fr('base'));
      const apr = sig(fr('aprendiz'));
      const vet = [0, 1, 2].map((p) => sig(fr('veterano', p)));
      expect(new Set(vet).size, `${a.id}: paletas`).toBe(3);
      expect(apr, `${a.id}: aprendiz x veterano`).not.toBe(vet[0]);
      expect(base, `${a.id}: base x aprendiz`).not.toBe(apr);
      vets.add(vet[0]!);
    }
    expect(vets.size).toBe(24);
  });

  it('a base de cada instituição é o uniforme dela (8 diferentes)', () => {
    const seen = new Set<string>();
    for (const i of d.institutions.instituicoes) seen.add(sig(drawCharacterFrame(resolveLook({ ...defaultLook(), outfit: { tier: 'base', institutionId: i.id, palette: 0 } }), 'parado', 2, 0)));
    expect(seen.size).toBe(8);
  });
});

describe('treinadores', () => {
  it('os 24 treinadores e os 8 da base têm visual de mestre com brilho dourado', () => {
    const gold = hex('#e8a33a');
    const seen = new Set<string>();
    for (const t of d.trainers) {
      const rl = resolveLook(trainerLook(t.id)!);
      expect(rl.gems.some((g) => g.color === gold), t.id).toBe(true);
      seen.add(sig(drawCharacterFrame(rl, 'parado', 0, 0)));
    }
    expect(seen.size).toBe(24);
    for (const i of d.institutions.instituicoes) expect(trainerLook(i.baseTrainer), i.id).toBeDefined();
  });
});

describe('props das margens e fachadas', () => {
  it('a folha tem todos os props nas variações e as 10 fachadas', () => {
    const sh = buildPropSheet();
    const names = new Set(sh.frames.map((f) => f.name));
    for (const p of Object.keys(PROPS)) for (let v = 0; v < PROP_VARIANTS; v++) expect(names.has(`prop_${p}_${v}`), p).toBe(true);
    for (const id of facadeIds()) expect(names.has(facadeFrame(id)), id).toBe(true);
    for (const f of sh.frames) expect(sh.pix.crop(f.x, f.y, f.w, f.h).countOpaque(), f.name).toBeGreaterThan(40);
  });

  it('cada margem tem os props pedidos', () => {
    for (const p of ['totem', 'horta', 'bandeirola', 'casa_mutirao', 'telao', 'capsula', 'letreiro', 'turbina', 'cabo', 'ponte_metal', 'junco', 'barco']) expect(PROPS[p], p).toBeDefined();
  });

  it('as fachadas das 8 sedes e dos 2 QGs são diferentes entre si', () => {
    const seen = new Set(facadeIds().map((id) => sig(buildFacade(id))));
    expect(seen.size).toBe(10);
  });

  it('a decoração do mapa vira prop pelo nome (Flor, Concha e Tábua ficam no terreno)', () => {
    for (const k of ['Totem', 'Horta', 'Holograma', 'Letreiro', 'Lixo', 'Barco', 'Junco', 'Toldo', 'Lanterna', 'Caixote', 'Rede'] as const) expect(propForDeco(Deco[k]), k).toBeDefined();
    for (const k of ['Flor', 'Concha', 'Tabua'] as const) expect(propForDeco(Deco[k])).toBeUndefined();
  });

  it('as sedes dos QGs das duas margens têm fachada', () => {
    const ids = new Set(facadeIds());
    for (const mapId of ['qg_esquerda', 'qg_direita']) {
      const sedes = getMap(mapId).markers.filter((m) => m.kind === 'lugar' && typeof (m.params as Record<string, unknown> | undefined)?.['instituicao'] === 'string');
      expect(sedes.length, mapId).toBe(4);
      for (const m of sedes) expect(ids.has(String((m.params as Record<string, unknown>)['instituicao']))).toBe(true);
    }
  });
});

describe('ícones das habilidades', () => {
  it('as 16 de classe e as 48 marcas têm motivo próprio e ícones diferentes', () => {
    const ids = [...d.abilitiesClass.map((a) => a.id), ...d.abilitiesArchetype.map((a) => a.id)];
    expect(d.abilitiesClass.length).toBe(16);
    expect(d.abilitiesArchetype.length).toBe(48);
    for (const id of ids) expect(abilityMotif(id), id).toBeDefined();
    for (const m of Object.values(MARK_ABILITY_MOTIF)) if (!MARK_MOTIFS[m]) expect(['sopa', 'laco', 'bota', 'nota', 'chapeu', 'onda', 'coracao', 'raio', 'escudo']).toContain(m);
    const sigs = new Set(ids.map((id) => sig(buildIcon(id))));
    expect(sigs.size).toBe(ids.length);
  });
});
