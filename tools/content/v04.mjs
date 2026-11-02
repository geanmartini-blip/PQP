// v0.4: conteúdo do early game (Planalto do Trigo, Vale das Chaminés, Ilha do Farol, missões extras do
// Delta, missões de instituição e bicos). Acrescenta nos JSON de packages/shared/data só o que ainda não
// existe (pelo id), então pode rodar de novo. Tudo aqui é SUGESTÃO: nada disso está nos docs.
// Uso: node tools/content/v04.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const D = 'packages/shared/data';
const S = true; // sugestao

// ---------------------------------------------------------------------------- ajudantes
const xp = (q) => ({ kind: 'xp', quantidade: q });
const rec = (recurso, quantidade) => ({ kind: 'recurso', recurso, quantidade });
const item = (tabela) => ({ kind: 'item', tabela, quantidade: 1 });
const rep = (instituicao, quantidade) => ({ kind: 'reputacao', quantidade, instituicao });
const mata = (inimigo, quantidade, tier = 'normal', afixos) => ({ inimigo, quantidade, tier, ...(afixos ? { afixos } : {}) });
const derrotar = (descricao, ...inimigos) => ({ tipo: 'derrotar', inimigos, descricao });
const irLugar = (lugar, descricao) => ({ tipo: 'ir_ate', lugar, descricao });
const irRegiao = (regiao, descricao) => ({ tipo: 'ir_ate', regiao, descricao });
const falar = (npc, descricao) => ({ tipo: 'falar', npc, descricao });
const interagir = (alvo, acao, quantidade, descricao) => ({ tipo: 'interagir', alvo, acao, quantidade, descricao });
const escolher = (pergunta, descricao, ...opcoes) => ({ tipo: 'escolher', pergunta, opcoes: opcoes.map(([id, texto]) => ({ id, texto, ligaFlags: [], sugestao: S })), descricao });

function missao(o) {
  return {
    id: o.id,
    name: o.name,
    ...(o.tipo ? { tipo: o.tipo } : {}),
    ...(o.cadeia ? { cadeia: o.cadeia } : {}),
    dadaPor: o.dadaPor,
    nivel: o.nivel,
    ...(o.nivelMax ? { nivelMax: o.nivelMax } : {}),
    regiao: o.regiao,
    ...(o.lugar ? { lugar: o.lugar } : {}),
    ...(o.margem ? { margem: o.margem } : {}),
    ...(o.instituicao ? { instituicao: o.instituicao } : {}),
    modo: o.modo ?? 'grupo',
    aliadosIA: o.aliadosIA ?? ['treinador_da_base'],
    resumo: o.resumo,
    objetivos: o.objetivos,
    recompensas: { solo: o.solo ?? [], grupo: [xp(o.xp)] },
    requerFlags: o.requer ?? [],
    bloqueadaPorFlags: o.bloqueada ?? [],
    ligaFlags: o.liga ?? [],
    ...(o.repetivel ? { repetivel: true } : {}),
    emPiloto: true,
    sugestao: S,
  };
}

// ---------------------------------------------------------------------------- missões
const MISSOES = [
  // Delta: 5 missões curtas entre as da cadeia, com o Seu Jacó junto
  missao({
    id: 'delta_extra_rede_furada', name: 'Rede Furada', dadaPor: 'toninho_do_barco', nivel: 1, nivelMax: 4, regiao: 'delta', lugar: 'cais_do_delta', modo: 'solo', aliadosIA: ['seu_jaco'],
    resumo: 'Os siris cortaram a rede do Toninho. De novo. Ele jura que é perseguição.',
    objetivos: [derrotar('Espante os siris do cais', mata('siri_do_mangue', 8)), falar('toninho_do_barco', 'Conte ao Toninho')],
    solo: [item('loot_normal_missao_delta'), rec('comida', 3)], xp: 120, requer: ['delta_aprendeu_remar'], liga: ['delta_extra_rede'],
  }),
  missao({
    id: 'delta_extra_fiado', name: 'O Fiado da Feira', dadaPor: 'vendedor_do_delta', nivel: 2, nivelMax: 4, regiao: 'delta', lugar: 'feira_de_pulgas', modo: 'solo', aliadosIA: ['seu_jaco'],
    resumo: 'Os capangas do Capataz compraram fiado na feira e mandaram cobrar do vendedor.',
    objetivos: [irLugar('feira_de_pulgas', 'Vá à feira de pulgas'), derrotar('Tire os capangas da feira', mata('capanga_do_capataz', 4)), falar('vendedor_do_delta', 'Avise o vendedor')],
    solo: [item('loot_normal_missao_delta'), rec('semente', 10)], xp: 250, requer: ['delta_aprendeu_lutar'], liga: ['delta_extra_fiado'],
  }),
  missao({
    id: 'delta_extra_chopindita_batizada', name: 'Chopindita Batizada', dadaPor: 'vendedor_de_chopindita_barata', nivel: 3, nivelMax: 4, regiao: 'delta', modo: 'solo', aliadosIA: ['seu_jaco'],
    resumo: 'O vendedor jura que esta chopindita é legítima. Os mosquitos em volta dela discordam.',
    objetivos: [
      derrotar('Espante a nuvem em volta do caixote', mata('mosquito_do_delta', 10)),
      escolher('O que você faz com a chopindita?', 'Decida o que fazer com a garrafa', ['provar', 'Prova um gole. É água do rio com corante.'], ['devolver', 'Devolve e pede o dinheiro de volta. Ele finge que não ouviu.']),
    ],
    solo: [rec('comida', 4)], xp: 400, requer: ['delta_aprendeu_habilidades'], liga: ['delta_extra_chopindita'],
  }),
  missao({
    id: 'delta_extra_juros_do_juros', name: 'Juros do Juros', dadaPor: 'seu_jaco', nivel: 3, nivelMax: 4, regiao: 'delta', lugar: 'palafitas_do_delta', modo: 'solo', aliadosIA: ['seu_jaco'],
    resumo: 'O cobrador do Capataz descobriu os juros compostos e está aplicando nas palafitas.',
    objetivos: [derrotar('Expulse o cobrador e a turma dele', mata('capanga_do_capataz', 5), mata('cobrador_do_capataz', 1, 'elite'))],
    solo: [item('loot_normal_missao_delta'), rec('semente', 15)], xp: 450, requer: ['delta_aprendeu_habilidades'], liga: ['delta_extra_juros'],
  }),
  missao({
    id: 'delta_extra_mutirao_do_mangue', name: 'Mutirão do Mangue', dadaPor: 'seu_jaco', nivel: 4, nivelMax: 4, regiao: 'delta', lugar: 'palafitas_do_delta', modo: 'solo', aliadosIA: ['seu_jaco'],
    resumo: 'Antes de enfrentar o Capataz, o Delta faz um mutirão. Sem ata, sem quórum, só mangue.',
    objetivos: [derrotar('Limpe o mangue', mata('siri_do_mangue', 10), mata('mosquito_do_delta', 10)), falar('toninho_do_barco', 'Avise o Toninho que o cais está limpo')],
    solo: [item('loot_normal_missao_delta'), rec('comida', 5)], xp: 600, requer: ['delta_boleto_chegou'], bloqueada: ['delta_bruno_ferro_derrotado'], liga: ['delta_extra_mutirao'],
  }),

  // Esquerda: A Colheita, no Planalto do Trigo
  missao({
    id: 'colheita_01_subir_o_planalto', name: 'Subir o Planalto', cadeia: 'esquerda_a_colheita', dadaPor: 'yusuf_adeyemi', nivel: 6, regiao: 'planalto_do_trigo', margem: 'esquerda',
    resumo: 'O trigo da margem inteira vem do Planalto, e o Planalto parou de mandar trigo. Yusuf quer saber por quê.',
    objetivos: [irRegiao('planalto_do_trigo', 'Suba a trilha até o Planalto do Trigo'), falar('presidenta_da_colheita', 'Fale com a presidenta da Comissão da Colheita')],
    solo: [rec('semente', 20)], xp: 900, requer: ['entrou_instituicao', 'margem_esquerda'], liga: ['colheita_planalto_chegou'],
  }),
  missao({
    id: 'colheita_02_gafanhoto_sem_cota', name: 'Gafanhoto Sem Cota', cadeia: 'esquerda_a_colheita', dadaPor: 'presidenta_da_colheita', nivel: 7, regiao: 'planalto_do_trigo', lugar: 'roca_coletiva', margem: 'esquerda',
    resumo: 'Os gafanhotos comem acima da cota e ninguém abre comissão contra eles.',
    objetivos: [irLugar('roca_coletiva', 'Vá à roça coletiva'), derrotar('Espante os gafanhotos da roça', mata('gafanhoto_da_safra', 12), mata('gafanhoto_da_safra', 1, 'elite', ['rapido']))],
    solo: [item('loot_normal'), rec('comida', 10)], xp: 1300, requer: ['colheita_planalto_chegou'], liga: ['colheita_gafanhotos'],
  }),
  missao({
    id: 'colheita_03_espantalho_benzido', name: 'Benzido Demais', cadeia: 'esquerda_a_colheita', dadaPor: 'presidenta_da_colheita', nivel: 8, regiao: 'planalto_do_trigo', lugar: 'roca_coletiva', margem: 'esquerda',
    resumo: 'A comissão benzeu os espantalhos para vigiar a cota. Agora eles vigiam todo mundo.',
    objetivos: [interagir('espantalho', 'desbenzer', 3, 'Desbenza os 3 espantalhos-mestres'), derrotar('Derrube os espantalhos que acordaram', mata('espantalho_benzido', 6))],
    solo: [item('loot_normal'), rec('semente', 25)], xp: 1700, requer: ['colheita_gafanhotos'], liga: ['colheita_espantalhos'],
  }),
  missao({
    id: 'colheita_04_fiscal_da_cota', name: 'A Cota do Fiscal', cadeia: 'esquerda_a_colheita', dadaPor: 'presidenta_da_colheita', nivel: 8, regiao: 'planalto_do_trigo', lugar: 'silos_do_planalto', margem: 'esquerda',
    resumo: 'Os fiscais da cota trancaram os silos até a próxima reunião, que ainda não tem data.',
    objetivos: [
      irLugar('silos_do_planalto', 'Vá aos silos'),
      derrotar('Tire os fiscais da porta dos silos', mata('fiscal_da_cota', 8)),
      escolher('O que fazer com o relatório da cota?', 'Decida o destino do trigo', ['assembleia', 'Leva para a Assembleia. Entra na pauta de 2079.'], ['silo', 'Abre o silo e divide o trigo agora.']),
    ],
    solo: [item('loot_normal'), rec('comida', 10)], xp: 1800, requer: ['colheita_espantalhos'], liga: ['colheita_cota_resolvida'],
  }),
  missao({
    id: 'colheita_05_espantalho_mor', name: 'O Espantalho-Mor', cadeia: 'esquerda_a_colheita', dadaPor: 'presidenta_da_colheita', nivel: 9, regiao: 'planalto_do_trigo', lugar: 'roca_coletiva', margem: 'esquerda',
    resumo: 'O espantalho mais antigo leu o estatuto da comissão e se elegeu presidente vitalício.',
    objetivos: [derrotar('Derrube o Espantalho-Mor no meio da roça', mata('espantalho_mor', 1, 'chefe')), falar('presidenta_da_colheita', 'Volte à presidenta')],
    solo: [item('loot_elite'), rec('semente', 60)], xp: 2600, requer: ['colheita_cota_resolvida'], liga: ['colheita_salva'],
  }),

  // Direita: O Turno da Noite, no Vale das Chaminés
  missao({
    id: 'turno_01_descer_o_vale', name: 'Descer o Vale', cadeia: 'direita_o_turno_da_noite', dadaPor: 'mateo_silva_park', nivel: 6, regiao: 'vale_das_chamines', margem: 'direita',
    resumo: 'A produção de baterias caiu e o frete dinâmico subiu. Mateo quer um colaborador lá embaixo.',
    objetivos: [irRegiao('vale_das_chamines', 'Desça até o Vale das Chaminés'), falar('gerente_de_turno', 'Apresente-se à gerente de turno')],
    solo: [rec('credito', 20)], xp: 900, requer: ['entrou_instituicao', 'margem_direita'], liga: ['turno_vale_chegou'],
  }),
  missao({
    id: 'turno_02_rato_no_duto', name: 'Rato no Duto', cadeia: 'direita_o_turno_da_noite', dadaPor: 'gerente_de_turno', nivel: 7, regiao: 'vale_das_chamines', lugar: 'fabrica_de_baterias', margem: 'direita',
    resumo: 'Os ratos dos dutos roem o cabo e a culpa sai no relatório do turno da noite.',
    objetivos: [irLugar('fabrica_de_baterias', 'Vá à fábrica de baterias'), derrotar('Limpe os dutos', mata('rato_de_duto', 12), mata('rato_de_duto', 1, 'elite', ['rapido']))],
    solo: [item('loot_normal'), rec('credito', 25)], xp: 1300, requer: ['turno_vale_chegou'], liga: ['turno_ratos'],
  }),
  missao({
    id: 'turno_03_linha_de_montagem', name: 'Linha de Montagem', cadeia: 'direita_o_turno_da_noite', dadaPor: 'gerente_de_turno', nivel: 8, regiao: 'vale_das_chamines', lugar: 'fabrica_de_baterias', margem: 'direita',
    resumo: 'Os robôs da linha aprenderam a fazer hora extra sozinhos e não querem parar.',
    objetivos: [interagir('esteira', 'desligar', 3, 'Desligue as 3 esteiras'), derrotar('Pare os robôs da linha', mata('robo_de_linha', 6))],
    solo: [item('loot_normal'), rec('credito', 30)], xp: 1700, requer: ['turno_ratos'], liga: ['turno_esteiras'],
  }),
  missao({
    id: 'turno_04_meta_batida', name: 'Meta Batida', cadeia: 'direita_o_turno_da_noite', dadaPor: 'gerente_de_turno', nivel: 8, regiao: 'vale_das_chamines', lugar: 'refeitorio_do_turno', margem: 'direita',
    resumo: 'Os supervisores dobraram a meta e trancaram o refeitório até alguém bater.',
    objetivos: [
      irLugar('refeitorio_do_turno', 'Vá ao refeitório do turno'),
      derrotar('Tire os supervisores da porta', mata('supervisor_de_meta', 6)),
      escolher('A meta do mês dobrou. E agora?', 'Responda à meta', ['bater', 'Bate a meta. Ganha um bóton escrito COLABORADOR DESTAQUE.'], ['aumento', 'Pede aumento. Ganha uma reunião sobre cultura da empresa.']),
    ],
    solo: [item('loot_normal'), rec('credito', 30)], xp: 1800, requer: ['turno_esteiras'], liga: ['turno_meta'],
  }),
  missao({
    id: 'turno_05_relogio_de_ponto', name: 'O Relógio de Ponto', cadeia: 'direita_o_turno_da_noite', dadaPor: 'gerente_de_turno', nivel: 9, regiao: 'vale_das_chamines', lugar: 'fabrica_de_baterias', margem: 'direita',
    resumo: 'O relógio de ponto ganhou autonomia e desconta o atraso de quem passa na frente dele.',
    objetivos: [derrotar('Quebre o Relógio de Ponto', mata('relogio_de_ponto', 1, 'chefe')), falar('gerente_de_turno', 'Volte à gerente de turno')],
    solo: [item('loot_elite'), rec('credito', 60)], xp: 2600, requer: ['turno_meta'], liga: ['turno_ponto_quebrado'],
  }),

  // Uma missão de cada instituição, com o treinador da base
  ...[
    ['brigada_popular', 'esquerda', 'Colheita Armada', 'Jacques quer a Brigada no Planalto antes que a comissão aprove a colheita em 2080.', [irRegiao('planalto_do_trigo', 'Suba ao Planalto'), derrotar('Defenda a roça', mata('gafanhoto_da_safra', 10), mata('espantalho_benzido', 3))]],
    ['guarda_comunitaria', 'esquerda', 'Ronda no Planalto', 'A Olga desconfia que os fiscais da cota estão levando trigo para casa.', [irLugar('silos_do_planalto', 'Vá aos silos'), derrotar('Fiscalize os fiscais', mata('fiscal_da_cota', 6))]],
    ['escola_dos_saberes', 'esquerda', 'Aula de Campo', 'Seamus leva a turma para ver como se desbenze um espantalho. A turma é você.', [irLugar('roca_coletiva', 'Vá à roça coletiva'), interagir('espantalho', 'desbenzer', 2, 'Desbenza 2 espantalhos'), derrotar('Afaste os gafanhotos', mata('gafanhoto_da_safra', 8))]],
    ['trupe_do_povo', 'esquerda', 'Espetáculo na Roça', 'Tião marcou um espetáculo no barracão da colheita. O público inclui espantalhos.', [irLugar('barracao_da_comissao', 'Vá ao barracão da comissão'), derrotar('Segure a plateia', mata('espantalho_benzido', 6))]],
    ['torcida_furia_neon', 'direita', 'Pelada do Turno da Noite', 'O Edson marcou uma pelada no refeitório. Os robôs da linha querem jogar.', [irLugar('refeitorio_do_turno', 'Vá ao refeitório do turno'), derrotar('Ganhe a pelada', mata('robo_de_linha', 4), mata('rato_de_duto', 6))]],
    ['pm_do_consorcio', 'direita', 'Ronda Patrocinada', 'A PM vende ronda no Vale, com patrocínio da fábrica. O Dusty quer resultado no vídeo.', [irRegiao('vale_das_chamines', 'Desça ao Vale'), derrotar('Faça a ronda', mata('rato_de_duto', 10), mata('supervisor_de_meta', 2))]],
    ['universidade_neon', 'direita', 'Estágio Não Remunerado', 'O Klaus arrumou um estágio para você na fábrica. Paga em experiência.', [interagir('esteira', 'desligar', 2, 'Desligue 2 esteiras'), derrotar('Teste os robôs', mata('robo_de_linha', 6))]],
    ['agencia_neon', 'direita', 'Conteúdo do Chão de Fábrica', 'A Kátia quer vídeo de bastidor no Vale. Engajamento acima de tudo, inclusive da segurança.', [irLugar('fabrica_de_baterias', 'Vá à fábrica de baterias'), derrotar('Grave a briga', mata('supervisor_de_meta', 3), mata('rato_de_duto', 6))]],
  ].map(([inst, lado, name, resumo, objetivos]) =>
    missao({
      id: `inst_${inst}_v04`, name, dadaPor: 'treinador_da_base', nivel: 7, regiao: lado === 'esquerda' ? 'planalto_do_trigo' : 'vale_das_chamines', margem: lado, instituicao: inst,
      resumo, objetivos, solo: [rep(inst, 80), rec(lado === 'esquerda' ? 'semente' : 'credito', 30)], xp: 1500, requer: [`entrou_${inst}`],
    }),
  ),

  // Bicos repetíveis do quadro de missões
  missao({
    id: 'bico_planalto_safra', name: 'Bico: Safra', dadaPor: 'quadro_de_missoes', nivel: 6, nivelMax: 19, regiao: 'planalto_do_trigo', margem: 'esquerda', modo: 'qualquer', repetivel: true,
    resumo: 'Mutirão da safra: quem espanta gafanhoto leva trigo.',
    objetivos: [derrotar('Espante os gafanhotos do Planalto', mata('gafanhoto_da_safra', 15))],
    solo: [rec('comida', 10), rec('semente', 15)], xp: 700, requer: ['entrou_instituicao', 'margem_esquerda'],
  }),
  missao({
    id: 'bico_planalto_espantalhos', name: 'Bico: Espantalhos', dadaPor: 'quadro_de_missoes', nivel: 7, nivelMax: 19, regiao: 'planalto_do_trigo', margem: 'esquerda', modo: 'qualquer', repetivel: true,
    resumo: 'A comissão paga por espantalho derrubado. Em Semente, depois da reunião.',
    objetivos: [derrotar('Derrube espantalhos benzidos', mata('espantalho_benzido', 8))],
    solo: [rec('semente', 20)], xp: 800, requer: ['entrou_instituicao', 'margem_esquerda'],
  }),
  missao({
    id: 'bico_vale_dedetizacao', name: 'Bico: Dedetização', dadaPor: 'quadro_de_missoes', nivel: 6, nivelMax: 19, regiao: 'vale_das_chamines', margem: 'direita', modo: 'qualquer', repetivel: true,
    resumo: 'Dedetização por demanda. Pagamento por rato, com taxa do app.',
    objetivos: [derrotar('Limpe os dutos do Vale', mata('rato_de_duto', 15))],
    solo: [rec('credito', 15)], xp: 700, requer: ['entrou_instituicao', 'margem_direita'],
  }),
  missao({
    id: 'bico_vale_hora_extra', name: 'Bico: Hora Extra', dadaPor: 'quadro_de_missoes', nivel: 7, nivelMax: 19, regiao: 'vale_das_chamines', margem: 'direita', modo: 'qualquer', repetivel: true,
    resumo: 'Hora extra no Vale: desligar robô que não quer bater o ponto.',
    objetivos: [derrotar('Desligue os robôs da linha', mata('robo_de_linha', 8))],
    solo: [rec('credito', 20)], xp: 800, requer: ['entrou_instituicao', 'margem_direita'],
  }),

  // Ilha do Farol: O Sinal da Eco, para os dois lados
  missao({
    id: 'farol_01_um_sinal_no_rio', name: 'Um Sinal no Rio', cadeia: 'ilha_do_farol', dadaPor: 'dalva_rocha', nivel: 10, regiao: 'ilha_do_farol',
    resumo: 'A Dalva ouviu uma rádio que não devia existir, vinda da Ilha do Farol. Ela não tem poder para ir, mas tem você.',
    objetivos: [irRegiao('ilha_do_farol', 'Pegue o barco da barragem até a Ilha do Farol'), falar('faroleiro_aposentado', 'Fale com o faroleiro')],
    solo: [rec('semente', 20), rec('credito', 20)], xp: 2000, requer: ['entrou_instituicao'], liga: ['farol_chegou'],
  }),
  missao({
    id: 'farol_02_a_eco', name: 'A Eco', cadeia: 'ilha_do_farol', dadaPor: 'faroleiro_aposentado', nivel: 10, regiao: 'ilha_do_farol',
    resumo: 'As antenas da rádio velha apontam para todo lado. A Eco fala quando as três apontam para a Ponte.',
    objetivos: [interagir('antena_do_farol', 'sintonizar', 3, 'Aponte as 3 antenas para a Ponte'), derrotar('Afaste as enguias das antenas', mata('enguia_eletrica', 8))],
    solo: [item('loot_normal')], xp: 2200, requer: ['farol_chegou'], liga: ['farol_eco_ouvida'],
  }),
  missao({
    id: 'farol_03_arquivo_molhado', name: 'Arquivo Molhado', cadeia: 'ilha_do_farol', dadaPor: 'faroleiro_aposentado', nivel: 11, regiao: 'ilha_do_farol', lugar: 'arquivo_da_ilha_do_farol',
    resumo: 'Os homens do Sombra querem as fitas da rádio antes que alguém escute o que a cidade unida dizia.',
    objetivos: [irLugar('arquivo_da_ilha_do_farol', 'Vá ao arquivo da rádio'), derrotar('Tire os homens do Sombra do arquivo', mata('mercenario_do_sombra', 6), mata('mercenario_do_sombra', 1, 'elite', ['blindado']))],
    solo: [item('loot_elite')], xp: 2400, requer: ['farol_eco_ouvida'], liga: ['farol_arquivo_salvo'],
  }),
];

const CADEIAS = [
  { id: 'esquerda_a_colheita', name: 'A Colheita', nivelMin: 6, nivelMax: 9, textoDoc: 'SUGESTÃO: no Planalto do Trigo, a comissão da colheita se reúne mais do que colhe; gafanhotos, espantalhos benzidos demais e fiscais da cota travam o trigo da margem.', missoes: MISSOES.filter((m) => m.cadeia === 'esquerda_a_colheita').map((m) => m.id), emPiloto: true },
  { id: 'direita_o_turno_da_noite', name: 'O Turno da Noite', nivelMin: 6, nivelMax: 9, textoDoc: 'SUGESTÃO: no Vale das Chaminés, o colaborador do turno da noite paga a própria máscara de ar; ratos de duto, robôs de linha e supervisores de meta, até o relógio de ponto.', missoes: MISSOES.filter((m) => m.cadeia === 'direita_o_turno_da_noite').map((m) => m.id), emPiloto: true },
  { id: 'ilha_do_farol', name: 'O Sinal da Eco', nivelMin: 10, nivelMax: 11, textoDoc: 'SUGESTÃO: na Ilha do Farol, a antiga rádio da cidade unida, a Eco transmite, ninguém sabe como.', missoes: MISSOES.filter((m) => m.cadeia === 'ilha_do_farol').map((m) => m.id), emPiloto: true },
];

const flag = (id, descricao, cadeia) => ({ id, descricao, escopo: 'jogador', ...(cadeia ? { cadeia } : {}), emPiloto: true, sugestao: S });
const FLAGS = [
  flag('delta_extra_rede', 'Espantou os siris da rede do Toninho.'),
  flag('delta_extra_fiado', 'Tirou os capangas do Capataz da feira de pulgas.'),
  flag('delta_extra_chopindita', 'Descobriu que a chopindita batizada era água do rio.'),
  flag('delta_extra_juros', 'Expulsou o cobrador dos juros compostos das palafitas.'),
  flag('delta_extra_mutirao', 'Fez o mutirão do mangue antes de enfrentar o Capataz.'),
  flag('colheita_planalto_chegou', 'Subiu ao Planalto do Trigo e conheceu a Comissão da Colheita.', 'esquerda_a_colheita'),
  flag('colheita_gafanhotos', 'Espantou os gafanhotos da roça coletiva.', 'esquerda_a_colheita'),
  flag('colheita_espantalhos', 'Desbenzeu os espantalhos-mestres.', 'esquerda_a_colheita'),
  flag('colheita_cota_resolvida', 'Resolveu a cota trancada nos silos.', 'esquerda_a_colheita'),
  flag('colheita_salva', 'Derrubou o Espantalho-Mor e salvou a colheita.', 'esquerda_a_colheita'),
  flag('turno_vale_chegou', 'Desceu ao Vale das Chaminés e conheceu a gerente de turno.', 'direita_o_turno_da_noite'),
  flag('turno_ratos', 'Limpou os ratos dos dutos da fábrica.', 'direita_o_turno_da_noite'),
  flag('turno_esteiras', 'Desligou as esteiras e parou os robôs da linha.', 'direita_o_turno_da_noite'),
  flag('turno_meta', 'Respondeu à meta dobrada dos supervisores.', 'direita_o_turno_da_noite'),
  flag('turno_ponto_quebrado', 'Quebrou o Relógio de Ponto do Vale.', 'direita_o_turno_da_noite'),
  flag('farol_chegou', 'Chegou à Ilha do Farol.', 'ilha_do_farol'),
  flag('farol_eco_ouvida', 'Ouviu a Eco pelas antenas da rádio velha.', 'ilha_do_farol'),
  flag('farol_arquivo_salvo', 'Salvou as fitas da rádio dos homens do Sombra.', 'ilha_do_farol'),
];

// ---------------------------------------------------------------------------- inimigos
const hab = (id, name, ownerKey, type, range, radius, cooldownS, telegraphMs, effects, description) => ({
  id, name, ownerKey, slot: 'inimigo', type, range, radius, cooldownS, cost: 0, castMs: 0, telegraphMs, effects, description, sugestao: S,
});
const dano = (mult, target = 'alvo') => ({ kind: 'dano', mult, target });
const empurrar = (tiles) => ({ kind: 'empurrar', tiles, target: 'inimigos_area' });
const reforco = (stat, pct, duracaoMs) => ({ kind: 'reforco', stat, pct, duracaoMs, target: 'self' });
const silenciar = (duracaoMs) => ({ kind: 'controle', cc: 'silenciar', duracaoMs, target: 'alvo' });
const escudo = (pctVidaMax) => ({ kind: 'escudo', pctVidaMax, duracaoMs: 4000, target: 'aliados_area_sem_self' });

const HABILIDADES = [
  hab('gafanhoto_da_safra_mordida', 'Mordida de Safra', 'gafanhoto_da_safra', 'travada', 1, 0, 1.3, 0, [dano(1)], 'Morde o que estiver na frente. Na dúvida, morde a cota.'),
  hab('gafanhoto_da_safra_revoada', 'Revoada', 'gafanhoto_da_safra', 'em_volta', 0, 2, 9, 800, [dano(1.3, 'inimigos_area')], 'O bando levanta voo em volta de você: aviso de 0,8 s e uma chuva de asa.'),
  hab('espantalho_benzido_vassourada', 'Vassourada', 'espantalho_benzido', 'travada', 1, 0, 1.6, 0, [dano(1)], 'Bate com a vassoura que alguém esqueceu na mão dele.'),
  hab('espantalho_benzido_benzimento_torto', 'Benzimento Torto', 'espantalho_benzido', 'em_volta', 0, 3, 11, 1000, [dano(1.6, 'inimigos_area'), empurrar(2)], 'Benze tudo em volta com força demais: aviso de 1 s, e quem estiver perto é benzido para longe.'),
  hab('fiscal_da_cota_regua', 'Régua da Cota', 'fiscal_da_cota', 'travada', 5, 0, 1.6, 0, [dano(0.9)], 'Mede você com a régua da cota. Você está acima.'),
  hab('fiscal_da_cota_corte_na_cota', 'Corte na Cota', 'fiscal_da_cota', 'area_alvo', 5, 2, 11, 900, [dano(1.6, 'inimigos_area')], 'Corta a sua cota e o chão embaixo de você: aviso de 0,9 s.'),
  hab('fiscal_da_cota_multa', 'Multa por Excesso', 'fiscal_da_cota', 'travada', 4, 0, 14, 0, [silenciar(1000)], 'Multa por excesso de habilidade: 1 s sem usar nenhuma.'),
  hab('espantalho_mor_foicada', 'Foicada', 'espantalho_mor', 'travada', 1, 0, 1.6, 0, [dano(1)], 'Golpe de foice cerimonial. A foice tem placa de patrimônio.'),
  hab('espantalho_mor_rodamoinho_de_palha', 'Rodamoinho de Palha', 'espantalho_mor', 'em_volta', 0, 3, 10, 1000, [dano(2, 'inimigos_area'), empurrar(2)], 'Gira e solta palha para todo lado: aviso de 1 s no chão.'),
  hab('espantalho_mor_chamado_da_cota', 'Chamado da Cota', 'espantalho_mor', 'area_alvo', 6, 2.5, 9, 1200, [dano(2.2, 'inimigos_area')], 'Aponta para você e lê a sua cota em voz alta: círculo no chão por 1,2 s.'),
  hab('espantalho_mor_mandato_vitalicio', 'Mandato Vitalício', 'espantalho_mor', 'em_volta', 0, 2, 20, 0, [reforco('attackSpeed', 25, 8000), reforco('moveSpeed', 15, 8000)], 'Prorroga o próprio mandato: por 8 s, bate 25% e anda 15% mais rápido.'),
  hab('rato_de_duto_mordida', 'Mordida no Cabo', 'rato_de_duto', 'travada', 1, 0, 1.2, 0, [dano(1)], 'Morde o primeiro cabo que encontra. Às vezes é a sua perna.'),
  hab('rato_de_duto_guincho', 'Guincho', 'rato_de_duto', 'em_volta', 0, 2, 9, 800, [dano(1.2, 'inimigos_area')], 'Guincha e chama os primos do duto: aviso de 0,8 s.'),
  hab('robo_de_linha_prensa', 'Prensa', 'robo_de_linha', 'travada', 1, 0, 1.7, 0, [dano(1.1)], 'Prensa o que estiver na esteira. Hoje é você.'),
  hab('robo_de_linha_parafusadeira', 'Parafusadeira', 'robo_de_linha', 'em_volta', 0, 2, 10, 900, [dano(1.8, 'inimigos_area')], 'Gira os braços de parafusar: aviso de 0,9 s.'),
  hab('robo_de_linha_hora_extra', 'Hora Extra', 'robo_de_linha', 'em_volta', 0, 2, 16, 0, [reforco('attackSpeed', 30, 6000)], 'Entra em hora extra sem perguntar: 6 s batendo 30% mais rápido.'),
  hab('supervisor_de_meta_caneta_laser', 'Caneta Laser', 'supervisor_de_meta', 'travada', 5, 0, 1.6, 0, [dano(0.9)], 'Aponta a caneta laser para o seu desempenho.'),
  hab('supervisor_de_meta_feedback_construtivo', 'Feedback Construtivo', 'supervisor_de_meta', 'em_volta', 0, 4, 10, 0, [escudo(15)], 'Dá feedback construtivo aos colegas: escudo de 15% da vida por 4 s. Para você, um plano de melhoria.'),
  hab('supervisor_de_meta_meta_dobrada', 'Meta Dobrada', 'supervisor_de_meta', 'travada', 4, 0, 14, 0, [silenciar(1000)], 'Dobra a sua meta: 1 s sem usar habilidades, ocupado calculando.'),
  hab('relogio_de_ponto_batida', 'Batida de Ponto', 'relogio_de_ponto', 'travada', 6, 0, 1.6, 0, [dano(1)], 'Bate o seu ponto à distância. Com atraso.'),
  hab('relogio_de_ponto_desconto_em_folha', 'Desconto em Folha', 'relogio_de_ponto', 'area_alvo', 7, 2.5, 9, 1200, [dano(2.2, 'inimigos_area')], 'Desconta direto do chão onde você está: círculo por 1,2 s.'),
  hab('relogio_de_ponto_banco_de_horas', 'Banco de Horas', 'relogio_de_ponto', 'em_volta', 0, 4, 11, 1000, [dano(2, 'inimigos_area'), empurrar(2)], 'Cobra o banco de horas de todo mundo em volta: aviso de 1 s.'),
  hab('relogio_de_ponto_turno_dobrado', 'Turno Dobrado', 'relogio_de_ponto', 'em_volta', 0, 2, 20, 0, [reforco('attackSpeed', 30, 8000)], 'Dobra o próprio turno: 8 s batendo 30% mais rápido.'),
];

function inimigo(o) {
  return {
    id: o.id, name: o.name, description: o.description, tier: o.tier ?? 'normal', nivel: o.nivel, regioes: [o.regiao],
    vida: o.vida, ataque: o.ataque, defesa: o.defesa, velocidade: o.velocidade, alcance: o.alcance, comportamento: o.comportamento, raioCorpoTiles: o.raio,
    bando: o.bando, afixosPossiveis: o.afixos ?? [], tabelaSaque: o.loot ?? 'loot_normal', xp: o.xp, ataqueBasico: o.basico, habilidades: o.habilidades,
    ...(o.fases ? { fases: o.fases, controleViraLentidaoPct: 40, vidaPorJogadorExtraPct: 50 } : {}),
    falas: o.falas, visual: o.visual, sugestao: S,
  };
}
const INIMIGOS = [
  inimigo({ id: 'gafanhoto_da_safra', name: 'Gafanhoto da Safra', description: 'Come acima da cota e não responde a nenhuma comissão. Vem em nuvem, porque sozinho ninguém dá quórum.', nivel: 6, regiao: 'planalto_do_trigo', vida: 30, ataque: 5, defesa: 2, velocidade: 13, alcance: 1, comportamento: 'enxame', raio: 0.3, bando: { min: 4, max: 6 }, afixos: ['rapido', 'explode_ao_morrer'], xp: 5, basico: 'gafanhoto_da_safra_mordida', habilidades: ['gafanhoto_da_safra_revoada'], falas: { aoAparecer: ['Bzzz... cota? Que cota?'] }, visual: 'Gafanhoto do tamanho de um gato, com um crachá da comissão grudado na asa.' }),
  inimigo({ id: 'espantalho_benzido', name: 'Espantalho Benzido', description: 'A comissão benzeu os espantalhos para vigiar a cota. Benzeu demais: agora vigiam quem passa e cobram ata.', nivel: 7, regiao: 'planalto_do_trigo', vida: 110, ataque: 8, defesa: 9, velocidade: 7, alcance: 1, comportamento: 'corpo_a_corpo', raio: 0.45, bando: { min: 2, max: 3 }, afixos: ['blindado', 'rapido'], xp: 16, basico: 'espantalho_benzido_vassourada', habilidades: ['espantalho_benzido_benzimento_torto'], falas: { aoAparecer: ['Quem autorizou essa colheita?'], aoCair: ['Registra... em... ata...'] }, visual: 'Espantalho de palha com chapéu de comissão, braçadeira e um galho de arruda no bolso.' }),
  inimigo({ id: 'fiscal_da_cota', name: 'Fiscal da Cota', description: 'Mede o trigo, o vizinho e o tamanho da sua fome. O relatório sai em três vias, e nenhuma volta.', nivel: 8, regiao: 'planalto_do_trigo', vida: 75, ataque: 9, defesa: 6, velocidade: 9, alcance: 3, comportamento: 'a_distancia', raio: 0.4, bando: { min: 2, max: 3 }, afixos: ['rapido', 'blindado', 'cura_os_outros'], xp: 17, basico: 'fiscal_da_cota_regua', habilidades: ['fiscal_da_cota_corte_na_cota', 'fiscal_da_cota_multa'], falas: { aoAparecer: ['Isso aí passou da cota, companheiro.'], aoCair: ['A cota... era de todos...'] }, visual: 'Colete de comissão, régua de madeira de dois metros e um saco de trigo que ninguém sabe de quem é.' }),
  inimigo({
    id: 'espantalho_mor', name: 'O Espantalho-Mor', description: 'O espantalho mais antigo do Planalto leu o estatuto da Comissão da Colheita e se elegeu presidente vitalício. A pauta é ele.', tier: 'chefe', nivel: 9, regiao: 'planalto_do_trigo',
    vida: 1600, ataque: 11, defesa: 10, velocidade: 8, alcance: 1, comportamento: 'corpo_a_corpo', raio: 0.8, bando: { min: 1, max: 1 }, loot: 'loot_chefe', xp: 350, basico: 'espantalho_mor_foicada',
    habilidades: ['espantalho_mor_rodamoinho_de_palha', 'espantalho_mor_chamado_da_cota', 'espantalho_mor_mandato_vitalicio'],
    fases: [
      { id: 'abertura_da_sessao', name: 'Abertura da Sessão', vidaAbaixoPct: 100, habilidades: ['espantalho_mor_rodamoinho_de_palha'], fala: 'Está aberta a sessão. A pauta sou eu.', sugestao: S },
      { id: 'votacao_simbolica', name: 'Votação Simbólica', vidaAbaixoPct: 65, habilidades: ['espantalho_mor_rodamoinho_de_palha', 'espantalho_mor_chamado_da_cota'], reforcos: [{ inimigo: 'gafanhoto_da_safra', quantidade: 4 }], fala: 'Quem estiver de acordo permaneça como está. Aprovado.', sugestao: S },
      { id: 'mandato_vitalicio', name: 'Mandato Vitalício', vidaAbaixoPct: 30, habilidades: ['espantalho_mor_rodamoinho_de_palha', 'espantalho_mor_chamado_da_cota', 'espantalho_mor_mandato_vitalicio'], reforcos: [{ inimigo: 'espantalho_benzido', quantidade: 1 }], reforcosACadaS: 20, fala: 'Prorrogo meu mandato até a próxima colheita. E a próxima.', sugestao: S },
    ],
    falas: { aoAparecer: ['Quem pediu a palavra? Ninguém. Ótimo.'], aoCair: ['Sessão... suspensa... por falta... de quórum...'], aoDerrotarJogador: ['Encaminhado para a comissão de recursos.'] },
    visual: 'Espantalho alto de palha velha, faixa de presidente, foice cerimonial e uma coroa de trigo seco.',
  }),
  inimigo({ id: 'rato_de_duto', name: 'Rato de Duto', description: 'Mora nos dutos das fábricas e rói o cabo. A culpa sai no relatório do turno da noite.', nivel: 6, regiao: 'vale_das_chamines', vida: 28, ataque: 5, defesa: 2, velocidade: 14, alcance: 1, comportamento: 'enxame', raio: 0.3, bando: { min: 4, max: 6 }, afixos: ['rapido', 'explode_ao_morrer'], xp: 5, basico: 'rato_de_duto_mordida', habilidades: ['rato_de_duto_guincho'], falas: { aoAparecer: ['Iiii!'] }, visual: 'Rato cinza de rabo pelado, com uma máscara de ar pequena demais e um fio roído na boca.' }),
  inimigo({ id: 'robo_de_linha', name: 'Robô de Linha', description: 'Robô de montagem que aprendeu a fazer hora extra sozinho e não aceita ser desligado antes de bater a meta.', nivel: 7, regiao: 'vale_das_chamines', vida: 120, ataque: 8, defesa: 10, velocidade: 7, alcance: 1, comportamento: 'corpo_a_corpo', raio: 0.45, bando: { min: 2, max: 3 }, afixos: ['blindado', 'rapido'], xp: 16, basico: 'robo_de_linha_prensa', habilidades: ['robo_de_linha_parafusadeira', 'robo_de_linha_hora_extra'], falas: { aoAparecer: ['META. NÃO. BATIDA.'], aoCair: ['Bater... o... ponto...'] }, visual: 'Braço mecânico amarelo de fábrica com esteira no lugar dos pés e um contador de peças piscando.' }),
  inimigo({ id: 'supervisor_de_meta', name: 'Supervisor de Meta', description: 'Supervisiona a meta, o café e o tempo de banheiro. Somos uma família, e ele é o tio que cobra.', nivel: 8, regiao: 'vale_das_chamines', vida: 80, ataque: 8, defesa: 7, velocidade: 9, alcance: 3, comportamento: 'suporte', raio: 0.4, bando: { min: 2, max: 3 }, afixos: ['rapido', 'blindado', 'cura_os_outros'], xp: 17, basico: 'supervisor_de_meta_caneta_laser', habilidades: ['supervisor_de_meta_feedback_construtivo', 'supervisor_de_meta_meta_dobrada'], falas: { aoAparecer: ['Vamos alinhar as expectativas?'], aoCair: ['Vou... levar... pro RH...'] }, visual: 'Camisa social com crachá, tablet com gráfico, caneta laser e um apito de chão de fábrica.' }),
  inimigo({
    id: 'relogio_de_ponto', name: 'O Relógio de Ponto', description: 'O relógio de ponto do Vale ganhou autonomia e desconta o atraso de quem passa na frente dele, inclusive o seu.', tier: 'chefe', nivel: 9, regiao: 'vale_das_chamines',
    vida: 1600, ataque: 11, defesa: 10, velocidade: 7, alcance: 3, comportamento: 'a_distancia', raio: 0.9, bando: { min: 1, max: 1 }, loot: 'loot_chefe', xp: 350, basico: 'relogio_de_ponto_batida',
    habilidades: ['relogio_de_ponto_desconto_em_folha', 'relogio_de_ponto_banco_de_horas', 'relogio_de_ponto_turno_dobrado'],
    fases: [
      { id: 'expediente', name: 'Expediente', vidaAbaixoPct: 100, habilidades: ['relogio_de_ponto_desconto_em_folha'], fala: 'Bom dia, colaborador. Você está 3 minutos atrasado.', sugestao: S },
      { id: 'banco_de_horas', name: 'Banco de Horas', vidaAbaixoPct: 65, habilidades: ['relogio_de_ponto_desconto_em_folha', 'relogio_de_ponto_banco_de_horas'], reforcos: [{ inimigo: 'robo_de_linha', quantidade: 2 }], fala: 'Seu banco de horas está negativo. Iniciando cobrança.', sugestao: S },
      { id: 'turno_dobrado', name: 'Turno Dobrado', vidaAbaixoPct: 30, habilidades: ['relogio_de_ponto_desconto_em_folha', 'relogio_de_ponto_banco_de_horas', 'relogio_de_ponto_turno_dobrado'], reforcos: [{ inimigo: 'supervisor_de_meta', quantidade: 1 }], reforcosACadaS: 20, fala: 'Turno dobrado autorizado. Pela família.', sugestao: S },
    ],
    falas: { aoAparecer: ['Bata o ponto. Bata o ponto. BATA O PONTO.'], aoCair: ['Ponto... registrado... às... vinte e...'], aoDerrotarJogador: ['Falta não justificada.'] },
    visual: 'Relógio de ponto do tamanho de uma geladeira, com pernas de esteira, leitor de crachá piscando vermelho e um rolo de cartão de ponto saindo.',
  }),
];

// ---------------------------------------------------------------------------- NPCs e lugares
const npc = (id, name, lado, regiao, quemE, descricao, piada, linhas) => ({
  id, name, categoria: 'menor', lado, quemE, apresentacao: 'presencial',
  visual: { descricao, piada, artKey: `npc_${id}`, sugestao: S }, regioes: [regiao], noPiloto: true,
  falas: [{ contexto: 'aleatoria', linhas, sugestao: S }], sugestao: S,
});
const NPCS = [
  npc('presidenta_da_colheita', 'Presidenta da Comissão da Colheita', 'esquerda', 'planalto_do_trigo',
    'Preside a Comissão da Colheita do Planalto há onze safras. Colheu em três delas.',
    'Lenço de chita, avental de feira, chapéu de palha largo e uma pasta de atas debaixo do braço', 'A pasta de atas pesa mais que um saco de trigo',
    ['A colheita está na pauta. A pauta está atrasada.', 'Trigo tem. O que falta é quórum.', 'Aqui ninguém passa fome. A fome é que passa da cota.']),
  npc('gerente_de_turno', 'Gerente de Turno', 'direita', 'vale_das_chamines',
    'Gerencia o turno da noite no Vale das Chaminés. Está no turno desde que o turno existe.',
    'Macacão cinza com colete refletivo, máscara de ar no pescoço, prancheta digital e olheira até o queixo', 'O crachá dela diz COLABORADORA HÁ 0 DIAS SEM FOLGA',
    ['Somos uma família. A família trabalha à noite.', 'A máscara de ar é por sua conta, mas o ar é cortesia.', 'Meta é meta. Gente é gente. A meta vem primeiro.']),
  npc('faroleiro_aposentado', 'Faroleiro Aposentado', 'neutro', 'ilha_do_farol',
    'Cuidava do farol quando a cidade era uma só. Ficou na ilha porque ninguém lembrou de buscar.',
    'Capa de chuva amarela velha, barba branca, cachimbo apagado e uma lanterna que não acende', 'Ele conversa com a lanterna e a lanterna parece responder',
    ['A Eco fala de madrugada. Fala igual a Rosa Tavares.', 'Do farol dá para ver as duas margens. De longe, são iguais.', 'Ninguém vem aqui. Por isso aqui ainda funciona.']),
];
const lugar = (id, name, regiao, tipo, margem, descricao, pos, npcs) => ({ id, name, regiao, tipo, margem, emPiloto: true, descricao, pos, ...(npcs ? { npcs } : {}), sugestao: S });
const LUGARES = [
  lugar('roca_coletiva', 'Roça Coletiva', 'planalto_do_trigo', 'natureza', 'esquerda', 'Os campos de trigo que alimentam a margem inteira, quando a comissão deixa.', { x: 24, y: 70 }),
  lugar('barracao_da_comissao', 'Barracão da Comissão da Colheita', 'planalto_do_trigo', 'servico', 'esquerda', 'Onde a comissão da colheita se reúne mais do que colhe.', { x: 66, y: 98 }, ['presidenta_da_colheita']),
  lugar('silos_do_planalto', 'Silos do Planalto', 'planalto_do_trigo', 'infraestrutura', 'esquerda', 'Os silos da cota, trancados até a próxima reunião.', { x: 82, y: 96 }),
  lugar('fabrica_de_baterias', 'Fábrica de Baterias', 'vale_das_chamines', 'infraestrutura', 'direita', 'A fábrica de baterias do Consórcio, que nunca desliga as chaminés.', { x: 170, y: 226 }),
  lugar('refeitorio_do_turno', 'Refeitório do Turno da Noite', 'vale_das_chamines', 'servico', 'direita', 'O refeitório onde o turno da noite almoça às três da manhã.', { x: 200, y: 250 }, ['gerente_de_turno']),
  lugar('estacao_de_mascaras', 'Estação de Máscaras', 'vale_das_chamines', 'comercio', 'direita', 'Onde o colaborador compra a própria máscara de ar, em doze vezes.', { x: 150, y: 250 }),
  lugar('farol_da_ilha', 'Farol da Ilha', 'ilha_do_farol', 'historico', 'neutra', 'O farol da cidade unida, que ainda acende quando ninguém olha.', { x: 118, y: 232 }, ['faroleiro_aposentado']),
];

// ---------------------------------------------------------------------------- gravação
const ler = (f) => readFileSync(`${D}/${f}.json`, 'utf8');
const json = (o) => JSON.stringify(o, null, 2) + '\n';
const novos = (lista, existentes) => lista.filter((x) => !existentes.has(x.id));

// missions, enemies e story_flags voltam iguais pelo JSON.stringify
{
  const m = JSON.parse(ler('missions'));
  const ids = new Set(m.missoes.map((x) => x.id));
  m.missoes.push(...novos(MISSOES, ids));
  const cids = new Set(m.cadeias.map((x) => x.id));
  m.cadeias.push(...novos(CADEIAS, cids));
  writeFileSync(`${D}/missions.json`, json(m));
}
{
  const e = JSON.parse(ler('enemies'));
  e.inimigos.push(...novos(INIMIGOS, new Set(e.inimigos.map((x) => x.id))));
  writeFileSync(`${D}/enemies.json`, json(e));
}
{
  const f = JSON.parse(ler('story_flags'));
  f.push(...novos(FLAGS, new Set(f.map((x) => x.id))));
  writeFileSync(`${D}/story_flags.json`, json(f));
}
// nos outros, insere o texto no fim da lista, sem reformatar o arquivo
// (nivel 1 = lista no topo do arquivo; 2 = lista dentro de um objeto)
function acrescenta(arquivo, lista, fimDaLista, nivel) {
  const t = ler(arquivo);
  const ids = new Set([...t.matchAll(/"id":\s*"([^"]+)"/g)].map((x) => x[1]));
  const add = novos(lista, ids);
  if (!add.length) return;
  const i = fimDaLista(t);
  const pad = '  '.repeat(nivel);
  const corpo = add.map((x) => JSON.stringify(x, null, 2).replace(/^/gm, pad)).join(',\n');
  writeFileSync(`${D}/${arquivo}.json`, t.slice(0, i).replace(/\s*$/, '') + ',\n' + corpo + '\n' + '  '.repeat(nivel - 1) + t.slice(i));
}
acrescenta('abilities_enemy', HABILIDADES, (t) => t.lastIndexOf(']'), 1);
acrescenta('places', LUGARES, (t) => t.lastIndexOf(']'), 1);
acrescenta('npcs', NPCS, (t) => t.lastIndexOf(']', t.indexOf('"herois"')), 2);
console.log(`missões ${MISSOES.length}, inimigos ${INIMIGOS.length}, habilidades ${HABILIDADES.length}, NPCs ${NPCS.length}, lugares ${LUGARES.length}, flags ${FLAGS.length}`);
