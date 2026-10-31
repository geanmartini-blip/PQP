/**
 * Visuais prontos de NPCs: os 24 treinadores (visual de mestre, a partir do traje de veterano da
 * ala, mais os adereços do doc), os personagens de npcs.json e os inimigos humanos.
 *
 * SUGESTÃO: corpo, tom de pele, rosto e cabelo dos treinadores e NPCs não estão nos docs (só a
 * roupa e os adereços estão). Wesley e Li Wei seguem Arte.md; os outros saem de um sorteio
 * estável pelo id, entre os tons e cortes de appearance.json.
 */
import { getData } from '@pqp/shared';
import type { ArtLook, ExtraLayer } from './character';
import { hashString } from './pixel';

const L = (part: string, arte: string, cols: (number | string)[], text?: string, translucent?: boolean): ExtraLayer => ({ part, arte, cols, text, translucent });

function pickStable<T>(id: string, salt: string, list: readonly T[]): T {
  const h = parseInt(hashString(`${id}:${salt}`), 16);
  return list[h % list.length]!;
}

/** Visual neutro de base para NPCs montados só com camadas extras. */
function npc(id: string, base: Partial<ArtLook>, layers: ExtraLayer[], extra: Partial<ArtLook> = {}): ArtLook {
  const ap = getData().appearance;
  return {
    body: base.body ?? pickStable(id, 'corpo', ap.corpos).id,
    skin: base.skin ?? pickStable(id, 'pele', ap.peles.filter((p) => !p.zoeiro)).id,
    face: base.face ?? pickStable(id, 'rosto', ap.rostos).id,
    hair: base.hair ?? pickStable(id, 'corte', ap.cortes).id,
    hairColor: base.hairColor ?? pickStable(id, 'cor', ap.coresCabelo.slice(0, 8)).id,
    details: base.details ?? [],
    outfit: { tier: 'delta', palette: 0 },
    dropParts: ['torso', 'pernas', 'pes'],
    extraLayers: layers,
    fxSide: 'neutro',
    ...extra,
  };
}

/** Ajustes por treinador (SUGESTÃO, menos o que Arte.md descreve). */
const TRAINER_BASE: Record<string, Partial<ArtLook>> = {
  // Arte.md: bigode, chapéu maior que o corpo e o touro-espírito bufando atrás
  wesley: { body: 'fortao', skin: 'tom_5', face: 'sorriso_de_canto', hair: 'curtinho_social', hairColor: 'castanho_escuro', details: ['bigode'], extras: ['touro'] },
  // Arte.md: cabelo pastel de franja perfeita e palco holográfico
  li_wei: { body: 'medio', skin: 'tom_3', face: 'sorridente', hair: 'franja_reta', hairColor: 'preto', details: [], extras: ['palco'] },
  dev_kumar: { details: ['olheira'] },
  jacques: { details: ['bigode'], face: 'nariz_empinado' },
  olga: { body: 'barrigudo', face: 'desconfiado', hair: 'coque', hairColor: 'grisalho' },
  seamus: { hairColor: 'branco', face: 'cara_fechada', hair: 'careca' },
  sigrid: { hair: 'trancas', hairColor: 'loiro' },
  el_relampago: { body: 'fortao' },
  donna_valentina: { body: 'barrigudo', face: 'nariz_empinado' },
  tiao: { face: 'sorriso_de_canto', details: ['dente_de_ouro'] },
  takeshi: { body: 'barrigudo' },
  edson: { body: 'fortao', face: 'cara_fechada' },
  thalysson: { body: 'fortao', face: 'sorridente' },
  big_mo: { body: 'fortao', face: 'cara_de_paisagem' },
  klaus: { hairColor: 'branco', face: 'olho_arregalado' },
  katia: { face: 'sorriso_amarelo', hair: 'coque' },
  kaua_ferreira: { face: 'cara_de_sono', hair: 'liso_comprido', hairColor: 'preto' },
  brooke: { face: 'sorridente', hair: 'rabo_de_cavalo', hairColor: 'loiro' },
  batu: { body: 'alto_e_magrelo' },
};

/** Visual de mestre de um treinador: traje de veterano da ala, paleta 0, adereços do doc. */
export function trainerLook(trainerId: string): ArtLook | undefined {
  const d = getData();
  const t = d.trainersById.get(trainerId);
  if (!t) return undefined;
  const ap = d.appearance;
  const b = TRAINER_BASE[trainerId] ?? {};
  return {
    body: b.body ?? pickStable(trainerId, 'corpo', ap.corpos).id,
    skin: b.skin ?? pickStable(trainerId, 'pele', ap.peles.filter((p) => !p.zoeiro)).id,
    face: b.face ?? pickStable(trainerId, 'rosto', ap.rostos).id,
    hair: b.hair ?? pickStable(trainerId, 'corte', ap.cortes).id,
    hairColor: b.hairColor ?? pickStable(trainerId, 'cor', ap.coresCabelo).id,
    details: b.details ?? [],
    outfit: { tier: 'mestre', archetypeId: t.archetype, institutionId: t.institution, palette: 0 },
    extras: b.extras,
  };
}

/** Personagens de npcs.json. */
const NPC_LOOKS: Record<string, () => ArtLook> = {
  seu_jaco: () =>
    npc('seu_jaco', { body: 'baixinho', skin: 'tom_7', face: 'cara_fechada', hair: 'careca', hairColor: 'grisalho', details: ['barba'] }, [
      L('torso', 'camiseta_lisa', ['#c8c0a8']),
      L('pernas', 'bermuda_lisa', ['#4a5a6a']),
      L('pes', 'chinelo', ['#3a6e8c']),
      L('cabeca', 'chapeu_palha_furado', ['#d8b860']),
      L('mao_principal', 'vara_remendada', ['#8a5a32']),
      L('mao_secundaria', 'balde_bagre', ['#6a7a8a']),
    ]),
  bruno_ferro: () => brunoFerro(),
  o_sombra: () =>
    npc('o_sombra', { skin: 'tom_8', face: 'cara_de_paisagem', hair: 'careca' }, [
      L('torso', 'malha_teatro', ['#1e1a22']),
      L('torso', 'dois_crachas', ['#5b8e3a']),
      L('pernas', 'calca_social', ['#1e1a22']),
      L('pes', 'sapato_social_gasto', ['#111014']),
      L('costas', 'capa_preta_longa', ['#141018']),
      L('cabeca', 'capuz', ['#1a141e']),
    ]),
  // SUGESTÃO: a Eco não tem visual nos docs; uma figura de capuz com fones de rádio
  eco: () =>
    npc('eco', { face: 'olhar_perdido' }, [
      L('torso', 'moletom_grafismo_simples', ['#3a4a5a', '#e8c040']),
      L('pernas', 'calca_moletom', ['#2a2a30']),
      L('pes', 'tenis_basico', ['#e8e8e8', '#2a2a30']),
      L('rosto', 'fones_grandes', ['#2a2a30', '#e8c040']),
    ]),
  dalva_rocha: () =>
    npc('dalva_rocha', { hair: 'chanel', hairColor: 'grisalho', face: 'cara_de_boleto' }, [
      L('torso', 'tailleur', ['#7a5a7a', '#5a3e5a']),
      L('torso', 'faixa_prefeita', ['#c8a848']),
      L('pernas', 'saia_longa', ['#4a3e4a']),
      L('pes', 'sapato_salto', ['#222024']),
      L('mao_secundaria', 'agendas', ['#3a5a8a', '#a83a3a']),
      L('mao_principal', 'carimbo', ['#6a4a2a']),
    ]),
  nayra_sundaram: () =>
    npc(
      'nayra_sundaram',
      { face: 'sorridente', hair: 'liso_comprido', hairColor: 'preto' },
      [
        L('torso', 'tunica_linho', ['#e8dcc0', '#5b6b2e']),
        L('pernas', 'calca_linho', ['#e8dcc0', '#5b6b2e']),
        L('pes', 'sandalia_couro', ['#6b4429']),
        L('aura', 'moldura_flores', ['#7ad86a'], undefined, true),
      ],
      { hologram: '#8af07a', fxSide: 'esquerda' },
    ),
  kenji_albrecht: () =>
    npc(
      'kenji_albrecht',
      { face: 'sorriso_de_canto', hair: 'topete_de_gala', hairColor: 'castanho_escuro' },
      [
        L('torso', 'blazer_corporativo', ['#2a2e3a', '#2ee6f0']),
        L('pernas', 'calca_social', ['#2a2e3a']),
        L('pes', 'sapato_social_gasto', ['#111014']),
        L('aura', 'grafico_subindo', ['#2ee6f0'], undefined, true),
      ],
      { hologram: '#5ae8ff', fxSide: 'direita' },
    ),
  seguranca_do_mirante: () =>
    npc('seguranca_do_mirante', { body: 'fortao', face: 'cara_de_paisagem', hair: 'raspado' }, [
      L('torso', 'terno_branco_impecavel', ['#f4f4f2', '#d8d8d8']),
      L('pernas', 'calca_branca', ['#f4f4f2']),
      L('pes', 'sapato_social_gasto', ['#f0f0f0']),
      L('bracos', 'luvas_brancas', ['#ffffff']),
      L('rosto', 'fone_transparente', ['#ffffff']),
      L('rosto', 'oculos_escuros', ['#141414']),
    ]),
  mordomo_robo_do_mirante: () =>
    npc('mordomo_robo_do_mirante', { skin: 'cinza_de_quem_nao_dorme', hair: 'careca', face: 'cara_de_paisagem' }, [
      L('cabeca', 'cabeca_robo', ['#a8b0b8']),
      L('torso', 'fraque', ['#1a1a22']),
      L('pernas', 'calca_social', ['#1a1a22']),
      L('pes', 'sapato_social_gasto', ['#0e0e12']),
      L('bracos', 'luvas_brancas', ['#ffffff']),
      L('mao_secundaria', 'bandeja_prata', ['#c4cad2']),
    ]),
  vendedor_do_delta: () =>
    npc('vendedor_do_delta', { face: 'sorridente' }, [
      L('torso', 'camiseta_lisa', ['#e8e4d6']),
      L('torso', 'avental_lona', ['#c8b890']),
      L('pernas', 'bermuda_lisa', ['#5a6a7a']),
      L('pes', 'chinelo', ['#e07a2e']),
      L('cabeca', 'bone_pescador', ['#3e6e8c', '#f0f0f0']),
    ]),
  vendedor_de_chopindita_barata: () =>
    npc('vendedor_de_chopindita_barata', { face: 'sorriso_de_canto', details: ['dente_de_ouro'] }, [
      L('torso', 'camisa_florida', ['#e85a3a', '#f0d040', '#3ab0a0']),
      L('torso', 'casaco_pedrinhas', ['#6a5a4a']),
      L('pernas', 'calca_social', ['#4a4a4a']),
      L('pes', 'sapato_social_gasto', ['#2a2018']),
      L('rosto', 'oculos_escuros', ['#141414']),
    ]),
  toninho_do_barco: () =>
    npc('toninho_do_barco', { skin: 'marca_de_regata', face: 'tranquilo' }, [
      L('torso', 'regata_furada', ['#e8e4d6']),
      L('pernas', 'bermuda_caqui', ['#6a7a5a']),
      L('pes', 'chinelo', ['#3a6e8c']),
      L('mao_principal', 'remo', ['#8a5a32']),
    ]),
  vizinha_da_bracadeira: () =>
    npc('vizinha_da_bracadeira', { hair: 'coque', hairColor: 'grisalho', face: 'desconfiado', body: 'barrigudo' }, [
      L('torso', 'roupao_florido', ['#d88aa8', '#f0e0a0', '#8ac0d0']),
      L('pes', 'chinelo', ['#e8e8e8']),
      L('bracos', 'bracadeira', ['#e5e234']),
      L('mao_secundaria', 'caderninho', ['#3a5a8a']),
    ]),
  entregador_de_app: () =>
    npc('entregador_de_app', { face: 'cara_de_sono', details: ['olheira'] }, [
      L('torso', 'camiseta_lisa', ['#2a2a30']),
      L('pernas', 'bermuda_lisa', ['#3a3a40']),
      L('pes', 'tenis_basico', ['#e8e8e8']),
      L('cabeca', 'capacete_camera', ['#ff6a13']),
      L('costas', 'mochila_termica', ['#ff6a13', '#f4f4f4']),
      L('acompanhante', 'nota_flutuante', ['#ffc21a']),
    ]),
  funcionario_da_cabine_neon: () =>
    npc('funcionario_da_cabine_neon', { face: 'sorriso_amarelo' }, [
      L('torso', 'uniforme_neon', ['#2ee6f0', '#ff3ea5']),
      L('torso', 'cracha_pendurado', ['#ffffff'], 'ESPECIALISTA EM EXPERIÊNCIA'),
      L('pernas', 'calca_social', ['#1a1a22']),
      L('pes', 'tenis_basico', ['#ffffff', '#ff3ea5']),
      L('mao_secundaria', 'tablet_termos', ['#111015']),
    ]),
  benzedeira_do_espelho: () =>
    npc('benzedeira_do_espelho', { body: 'baixinho', hair: 'coque', hairColor: 'branco', face: 'sorriso_de_canto', skin: 'tom_9' }, [
      L('torso', 'camiseta_lisa', ['#6a4a6a']),
      L('torso', 'xale_croche', ['#e8dcc8']),
      L('pernas', 'saia_longa', ['#3a5a3a']),
      L('pes', 'chinelo', ['#6b4429']),
      L('cabeca', 'ramo_arruda', ['#2e6e2a']),
      L('acompanhante', 'espelho_grande', ['#5a3a20']),
    ]),
  cambista_da_ponte: () =>
    npc('cambista_da_ponte', { face: 'desconfiado' }, [
      L('torso', 'camisa_social_branca', ['#f0f0ec']),
      L('torso', 'colete_duas_cores', ['#5b6b2e']),
      L('pernas', 'calca_social', ['#3a3a40']),
      L('pes', 'sapato_social_gasto', ['#2a2018']),
      L('mao_principal', 'calculadora_madeira', ['#8a5a32']),
      L('mao_secundaria', 'calculadora_holo', ['#2ee6f0']),
      L('aura', 'placar_cotacao', ['#111015']),
    ]),
};

function brunoFerro(): ArtLook {
  return npc('bruno_ferro', { body: 'fortao', skin: 'tom_4', face: 'sorridente', hair: 'topete_de_gala', hairColor: 'preto', details: ['dente_de_ouro'] }, [
    L('torso', 'camiseta_lisa', ['#3a3a40']),
    L('torso', 'colete_couro', ['#7a4a2a']),
    L('torso', 'corrente_dourada', ['#e0b030']),
    L('pernas', 'calca_jeans_surrada', ['#3a5a8a']),
    L('pes', 'botina', ['#5a3a22']),
    L('mao_principal', 'maquininha_semente', ['#2a2a30']),
    L('mao_secundaria', 'maquininha_credito', ['#2a2a30']),
  ]);
}

/** Visual de um NPC: treinador, personagem de npcs.json, ou nada. */
export function npcLook(id: string): ArtLook | undefined {
  return trainerLook(id) ?? NPC_LOOKS[id]?.();
}

export const STORY_NPC_IDS = Object.keys(NPC_LOOKS);

/** Inimigos humanos desenhados com o boneco em camadas (enemies.json, campo visual). */
export const HUMAN_ENEMY_LOOKS: Record<string, () => ArtLook> = {
  capanga_do_capataz: () =>
    npc('capanga_do_capataz', { body: 'fortao', face: 'cara_fechada', hair: 'raspado' }, [
      L('torso', 'regata_cavada', ['#e8e4d6']),
      L('torso', 'cracha_mao', ['#f0e8d0']),
      L('pernas', 'calca_jeans_surrada', ['#3a4a6a']),
      L('pes', 'tenis_basico', ['#e8e8e8']),
      L('cabeca', 'bone_virado', ['#a8463f', '#f0f0f0']),
      L('mao_principal', 'porrete', ['#8a5a32']),
    ]),
  cobrador_do_capataz: () =>
    npc('cobrador_do_capataz', { face: 'sorriso_amarelo', hair: 'calvicie_penteada', hairColor: 'castanho_claro' }, [
      L('torso', 'camisa_social_suada', ['#e8ecf0']),
      L('torso', 'maquininha_pescoco', ['#2a2a30']),
      L('pernas', 'calca_social', ['#3a3a40']),
      L('pes', 'sapato_social_gasto', ['#2a2018']),
      // SUGESTÃO: o texto "JUROS" da prancheta do cobrador
      L('mao_secundaria', 'prancheta_quem_entrou', ['#8a5a32', '#c4cad2'], 'JUROS'),
    ]),
  contrabandista: () =>
    npc('contrabandista', { face: 'desconfiado' }, [
      L('torso', 'camisa_bolsos_simples', ['#5a5a3a']),
      L('pernas', 'calca_cargo', ['#4a4a32']),
      L('pes', 'bota_trilha', ['#4a3a28']),
      L('costas', 'mochila_pedras', ['#6a5a3a']),
      L('rosto', 'lenco_rosto', ['#a8463f']),
      L('mao_principal', 'garrucha', ['#5a5e66']),
    ]),
  fiscal_da_comissao: () =>
    npc('fiscal_da_comissao', { face: 'cara_de_assembleia', details: ['oculos'] }, [
      L('torso', 'camisa_listrada', ['#c8c0a0', '#8a7a5a']),
      L('bracos', 'bracadeira_fiscal', ['#e5e234']),
      L('pernas', 'calca_social_surrada', ['#5a4a3a']),
      L('pes', 'chinelo_com_meia', ['#6b4429', '#f0f0f0']),
      L('mao_secundaria', 'prancheta_madeira', ['#8a5a32']),
      L('mao_principal', 'carimbo_tijolo', ['#8a3a2a']),
    ]),
  mercenario_do_sombra: () =>
    npc('mercenario_do_sombra', { face: 'cara_fechada' }, [
      L('torso', 'malha_teatro', ['#24202a']),
      L('torso', 'dois_crachas', ['#5b8e3a']),
      L('pernas', 'calca_farda', ['#24202a']),
      L('pes', 'coturno', ['#111014']),
      L('costas', 'capa_preta_curta', ['#141018']),
      L('mao_principal', 'porrete', ['#3a3a40']),
    ]),
  bruno_ferro_chefe: brunoFerro,
};
