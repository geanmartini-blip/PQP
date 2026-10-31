/**
 * Carregador tipado dos JSON de config (packages/shared/data).
 *
 * Importa cada arquivo, valida com o esquema do domínio na primeira chamada de getData() e expõe
 * os dados já parseados (com os padrões do zod aplicados) e mapas por id. Funciona em Vite,
 * Vitest e tsx, porque os JSON entram por import estático (sem fs).
 */
import type { z } from 'zod';
import {
  AbilitiesArchetypeFile,
  AbilitiesBasicFile,
  AbilitiesClassFile,
  AbilitiesSpecialFile,
  AppearanceFile,
  ArchetypesFile,
  BalanceFile,
  ClassesFile,
  ConsumablesFile,
  DungeonsFile,
  EconomyFile,
  EndgameFile,
  EnemiesFile,
  EnemyAbilitiesFile,
  FactionAiFile,
  FurnitureFile,
  GuidesFile,
  HousingFile,
  InstitutionsFile,
  ItemsFile,
  LessonsFile,
  LootFile,
  MissionsFile,
  NpcsFile,
  OutfitsFile,
  PlacesFile,
  ProgressionFile,
  PropagandaFile,
  RegionsFile,
  RolesFile,
  SetsFile,
  ShopsFile,
  SocietiesFile,
  StoryFlagsFile,
  StructuresFile,
  SummonsFile,
  TalentsFile,
  TrainersFile,
  UniquesFile,
} from '../schema';
import type {
  Ability,
  Archetype,
  ClassDef,
  Consumable,
  Dungeon,
  Enemy,
  Guide,
  Hq,
  Institution,
  Item,
  ItemSet,
  Lesson,
  LootTable,
  Mission,
  Movel,
  Npc,
  PersonagemIa,
  Place,
  Region,
  Shop,
  StoryFlag,
  StructureKind,
  Summon,
  Talent,
  Trainer,
  Unique,
} from '../schema';

import abilitiesClassJson from '../../data/abilities_class.json';
import abilitiesArchetypeJson from '../../data/abilities_archetype.json';
import abilitiesSpecialJson from '../../data/abilities_special.json';
import abilitiesBasicJson from '../../data/abilities_basic.json';
import abilitiesEnemyJson from '../../data/abilities_enemy.json';
import summonsJson from '../../data/summons.json';
import appearanceJson from '../../data/appearance.json';
import archetypesJson from '../../data/archetypes.json';
import balanceJson from '../../data/balance.json';
import classesJson from '../../data/classes.json';
import consumablesJson from '../../data/consumables.json';
import dungeonsJson from '../../data/dungeons.json';
import economyJson from '../../data/economy.json';
import endgameJson from '../../data/endgame.json';
import enemiesJson from '../../data/enemies.json';
import factionAiJson from '../../data/faction_ai.json';
import furnitureJson from '../../data/furniture.json';
import guidesJson from '../../data/guides.json';
import housingJson from '../../data/housing.json';
import institutionsJson from '../../data/institutions.json';
import itemsJson from '../../data/items.json';
import lessonsJson from '../../data/lessons.json';
import lootJson from '../../data/loot.json';
import missionsJson from '../../data/missions.json';
import npcsJson from '../../data/npcs.json';
import outfitsJson from '../../data/outfits.json';
import placesJson from '../../data/places.json';
import progressionJson from '../../data/progression.json';
import propagandaJson from '../../data/propaganda.json';
import regionsJson from '../../data/regions.json';
import rolesJson from '../../data/roles.json';
import setsJson from '../../data/sets.json';
import shopsJson from '../../data/shops.json';
import societiesJson from '../../data/societies.json';
import storyFlagsJson from '../../data/story_flags.json';
import structuresJson from '../../data/structures.json';
import talentsJson from '../../data/talents.json';
import trainersJson from '../../data/trainers.json';
import uniquesJson from '../../data/uniques.json';

/** Cada arquivo de data/ com o seu esquema. A chave é o nome do arquivo sem .json. */
export const DATA_FILES = {
  abilities_class: { schema: AbilitiesClassFile, raw: abilitiesClassJson as unknown },
  abilities_archetype: { schema: AbilitiesArchetypeFile, raw: abilitiesArchetypeJson as unknown },
  abilities_special: { schema: AbilitiesSpecialFile, raw: abilitiesSpecialJson as unknown },
  abilities_basic: { schema: AbilitiesBasicFile, raw: abilitiesBasicJson as unknown },
  abilities_enemy: { schema: EnemyAbilitiesFile, raw: abilitiesEnemyJson as unknown },
  summons: { schema: SummonsFile, raw: summonsJson as unknown },
  appearance: { schema: AppearanceFile, raw: appearanceJson as unknown },
  archetypes: { schema: ArchetypesFile, raw: archetypesJson as unknown },
  balance: { schema: BalanceFile, raw: balanceJson as unknown },
  classes: { schema: ClassesFile, raw: classesJson as unknown },
  consumables: { schema: ConsumablesFile, raw: consumablesJson as unknown },
  dungeons: { schema: DungeonsFile, raw: dungeonsJson as unknown },
  economy: { schema: EconomyFile, raw: economyJson as unknown },
  endgame: { schema: EndgameFile, raw: endgameJson as unknown },
  enemies: { schema: EnemiesFile, raw: enemiesJson as unknown },
  faction_ai: { schema: FactionAiFile, raw: factionAiJson as unknown },
  furniture: { schema: FurnitureFile, raw: furnitureJson as unknown },
  guides: { schema: GuidesFile, raw: guidesJson as unknown },
  housing: { schema: HousingFile, raw: housingJson as unknown },
  institutions: { schema: InstitutionsFile, raw: institutionsJson as unknown },
  items: { schema: ItemsFile, raw: itemsJson as unknown },
  lessons: { schema: LessonsFile, raw: lessonsJson as unknown },
  loot: { schema: LootFile, raw: lootJson as unknown },
  missions: { schema: MissionsFile, raw: missionsJson as unknown },
  npcs: { schema: NpcsFile, raw: npcsJson as unknown },
  outfits: { schema: OutfitsFile, raw: outfitsJson as unknown },
  places: { schema: PlacesFile, raw: placesJson as unknown },
  progression: { schema: ProgressionFile, raw: progressionJson as unknown },
  propaganda: { schema: PropagandaFile, raw: propagandaJson as unknown },
  regions: { schema: RegionsFile, raw: regionsJson as unknown },
  roles: { schema: RolesFile, raw: rolesJson as unknown },
  sets: { schema: SetsFile, raw: setsJson as unknown },
  shops: { schema: ShopsFile, raw: shopsJson as unknown },
  societies: { schema: SocietiesFile, raw: societiesJson as unknown },
  story_flags: { schema: StoryFlagsFile, raw: storyFlagsJson as unknown },
  structures: { schema: StructuresFile, raw: structuresJson as unknown },
  talents: { schema: TalentsFile, raw: talentsJson as unknown },
  trainers: { schema: TrainersFile, raw: trainersJson as unknown },
  uniques: { schema: UniquesFile, raw: uniquesJson as unknown },
} as const;

export type DataFileName = keyof typeof DATA_FILES;
type Parsed<K extends DataFileName> = z.output<(typeof DATA_FILES)[K]['schema']>;

/** Erro de validação de um arquivo de dados, com o nome do arquivo e os problemas do zod. */
export class DataValidationError extends Error {
  constructor(
    readonly file: string,
    readonly issues: readonly { path: PropertyKey[]; message: string }[],
  ) {
    super(
      `data/${file}.json inválido:\n` +
        issues
          .slice(0, 20)
          .map((i) => `  - ${i.path.map(String).join('.') || '(raiz)'}: ${i.message}`)
          .join('\n'),
    );
    this.name = 'DataValidationError';
  }
}

/** Valida um arquivo pelo nome. Lança DataValidationError com a lista de problemas. */
export function parseDataFile<K extends DataFileName>(name: K): Parsed<K> {
  const { schema, raw } = DATA_FILES[name];
  const r = (schema as z.ZodType).safeParse(raw);
  if (!r.success) throw new DataValidationError(name, r.error.issues);
  return r.data as Parsed<K>;
}

function byId<T extends { id: string }>(list: readonly T[], what: string): ReadonlyMap<string, T> {
  const m = new Map<string, T>();
  for (const x of list) {
    if (m.has(x.id)) throw new Error(`${what}: id repetido ${x.id}`);
    m.set(x.id, x);
  }
  return m;
}

export interface GameData {
  // arquivos inteiros, já validados
  abilitiesClass: Parsed<'abilities_class'>;
  abilitiesArchetype: Parsed<'abilities_archetype'>;
  abilitiesSpecial: Parsed<'abilities_special'>;
  abilitiesBasic: Parsed<'abilities_basic'>;
  abilitiesEnemy: Parsed<'abilities_enemy'>;
  summons: Parsed<'summons'>;
  appearance: Parsed<'appearance'>;
  archetypes: Parsed<'archetypes'>;
  balance: Parsed<'balance'>;
  classes: Parsed<'classes'>;
  consumables: Parsed<'consumables'>;
  dungeons: Parsed<'dungeons'>;
  economy: Parsed<'economy'>;
  endgame: Parsed<'endgame'>;
  enemies: Parsed<'enemies'>;
  factionAi: Parsed<'faction_ai'>;
  furniture: Parsed<'furniture'>;
  guides: Parsed<'guides'>;
  housing: Parsed<'housing'>;
  institutions: Parsed<'institutions'>;
  items: Parsed<'items'>;
  lessons: Parsed<'lessons'>;
  loot: Parsed<'loot'>;
  missions: Parsed<'missions'>;
  npcs: Parsed<'npcs'>;
  outfits: Parsed<'outfits'>;
  places: Parsed<'places'>;
  progression: Parsed<'progression'>;
  propaganda: Parsed<'propaganda'>;
  regions: Parsed<'regions'>;
  roles: Parsed<'roles'>;
  sets: Parsed<'sets'>;
  shops: Parsed<'shops'>;
  societies: Parsed<'societies'>;
  storyFlags: Parsed<'story_flags'>;
  structures: Parsed<'structures'>;
  talents: Parsed<'talents'>;
  trainers: Parsed<'trainers'>;
  uniques: Parsed<'uniques'>;

  /** todas as habilidades: classe, marca, Especial/virada, básico, inimigo, consumível e único */
  abilities: ReadonlyMap<string, Ability>;
  summonsById: ReadonlyMap<string, Summon>;
  classesById: ReadonlyMap<string, ClassDef>;
  archetypesById: ReadonlyMap<string, Archetype>;
  institutionsById: ReadonlyMap<string, Institution>;
  hqsById: ReadonlyMap<string, Hq>;
  trainersById: ReadonlyMap<string, Trainer>;
  /** personagens da história, líderes, Mirante e NPCs menores (npcs.json) */
  npcsById: ReadonlyMap<string, Npc>;
  guidesById: ReadonlyMap<string, Guide>;
  talentsById: ReadonlyMap<string, Talent>;
  /** itens-base (comum e raro) */
  itemsById: ReadonlyMap<string, Item>;
  uniquesById: ReadonlyMap<string, Unique>;
  setsById: ReadonlyMap<string, ItemSet>;
  consumablesById: ReadonlyMap<string, Consumable>;
  shopsById: ReadonlyMap<string, Shop>;
  lootTablesById: ReadonlyMap<string, LootTable>;
  enemiesById: ReadonlyMap<string, Enemy>;
  regionsById: ReadonlyMap<string, Region>;
  placesById: ReadonlyMap<string, Place>;
  structureKindsById: ReadonlyMap<string, StructureKind>;
  missionsById: ReadonlyMap<string, Mission>;
  dungeonsById: ReadonlyMap<string, Dungeon>;
  storyFlagsById: ReadonlyMap<string, StoryFlag>;
  lessonsById: ReadonlyMap<string, Lesson>;
  factionCharactersById: ReadonlyMap<string, PersonagemIa>;
  furnitureById: ReadonlyMap<string, Movel>;
}

let cache: GameData | undefined;

function build(): GameData {
  const abilitiesClass = parseDataFile('abilities_class');
  const abilitiesArchetype = parseDataFile('abilities_archetype');
  const abilitiesSpecial = parseDataFile('abilities_special');
  const abilitiesBasic = parseDataFile('abilities_basic');
  const abilitiesEnemy = parseDataFile('abilities_enemy');
  const summons = parseDataFile('summons');
  const appearance = parseDataFile('appearance');
  const archetypes = parseDataFile('archetypes');
  const balance = parseDataFile('balance');
  const classes = parseDataFile('classes');
  const consumables = parseDataFile('consumables');
  const dungeons = parseDataFile('dungeons');
  const economy = parseDataFile('economy');
  const endgame = parseDataFile('endgame');
  const enemies = parseDataFile('enemies');
  const factionAi = parseDataFile('faction_ai');
  const furniture = parseDataFile('furniture');
  const guides = parseDataFile('guides');
  const housing = parseDataFile('housing');
  const institutions = parseDataFile('institutions');
  const items = parseDataFile('items');
  const lessons = parseDataFile('lessons');
  const loot = parseDataFile('loot');
  const missions = parseDataFile('missions');
  const npcs = parseDataFile('npcs');
  const outfits = parseDataFile('outfits');
  const places = parseDataFile('places');
  const progression = parseDataFile('progression');
  const propaganda = parseDataFile('propaganda');
  const regions = parseDataFile('regions');
  const roles = parseDataFile('roles');
  const sets = parseDataFile('sets');
  const shops = parseDataFile('shops');
  const societies = parseDataFile('societies');
  const storyFlags = parseDataFile('story_flags');
  const structures = parseDataFile('structures');
  const talents = parseDataFile('talents');
  const trainers = parseDataFile('trainers');
  const uniques = parseDataFile('uniques');

  const allAbilities: Ability[] = [
    ...abilitiesClass,
    ...abilitiesArchetype,
    ...abilitiesSpecial,
    ...abilitiesBasic,
    ...abilitiesEnemy,
    ...consumables.habilidades,
    ...uniques.unicos.flatMap((u) => (u.habilidadeLiberada ? [u.habilidadeLiberada] : [])),
  ];

  return {
    abilitiesClass,
    abilitiesArchetype,
    abilitiesSpecial,
    abilitiesBasic,
    abilitiesEnemy,
    summons,
    appearance,
    archetypes,
    balance,
    classes,
    consumables,
    dungeons,
    economy,
    endgame,
    enemies,
    factionAi,
    furniture,
    guides,
    housing,
    institutions,
    items,
    lessons,
    loot,
    missions,
    npcs,
    outfits,
    places,
    progression,
    propaganda,
    regions,
    roles,
    sets,
    shops,
    societies,
    storyFlags,
    structures,
    talents,
    trainers,
    uniques,

    abilities: byId(allAbilities, 'habilidades'),
    summonsById: byId(summons, 'summons'),
    classesById: byId(classes, 'classes'),
    archetypesById: byId(archetypes, 'archetypes'),
    institutionsById: byId(institutions.instituicoes, 'institutions'),
    hqsById: byId(institutions.qgs, 'institutions.qgs'),
    trainersById: byId(trainers, 'trainers'),
    npcsById: byId(npcs.personagens, 'npcs'),
    guidesById: byId(guides.guias, 'guides'),
    talentsById: byId(talents.talentos, 'talents'),
    itemsById: byId(items.itens, 'items'),
    uniquesById: byId(uniques.unicos, 'uniques'),
    setsById: byId(sets.sets, 'sets'),
    consumablesById: byId(consumables.consumiveis, 'consumables'),
    shopsById: byId(shops.lojas, 'shops'),
    lootTablesById: byId(loot.tabelas, 'loot'),
    enemiesById: byId(enemies.inimigos, 'enemies'),
    regionsById: byId(regions.regioes, 'regions'),
    placesById: byId(places, 'places'),
    structureKindsById: byId(structures.estruturas, 'structures'),
    missionsById: byId(missions.missoes, 'missions'),
    dungeonsById: byId(dungeons.masmorras, 'dungeons'),
    storyFlagsById: byId(storyFlags, 'story_flags'),
    lessonsById: byId(lessons.licoes, 'lessons'),
    factionCharactersById: byId(factionAi.personagens, 'faction_ai'),
    furnitureById: byId(furniture, 'furniture'),
  };
}

/** Todos os dados do jogo, validados na primeira chamada e guardados em cache. */
export function getData(): GameData {
  cache ??= build();
  return cache;
}

function must<T>(m: ReadonlyMap<string, T>, id: string, what: string): T {
  const x = m.get(id);
  if (x === undefined) throw new Error(`${what} não existe: ${id}`);
  return x;
}

export const abilityById = (id: string): Ability => must(getData().abilities, id, 'habilidade');
export const summonById = (id: string): Summon => must(getData().summonsById, id, 'invocação');
export const classById = (id: string): ClassDef => must(getData().classesById, id, 'classe');
export const archetypeById = (id: string): Archetype => must(getData().archetypesById, id, 'arquétipo');
export const institutionById = (id: string): Institution => must(getData().institutionsById, id, 'instituição');
export const trainerById = (id: string): Trainer => must(getData().trainersById, id, 'treinador');
export const npcById = (id: string): Npc => must(getData().npcsById, id, 'NPC');
export const guideById = (id: string): Guide => must(getData().guidesById, id, 'guia');
export const talentById = (id: string): Talent => must(getData().talentsById, id, 'talento');
export const itemById = (id: string): Item => must(getData().itemsById, id, 'item');
export const uniqueById = (id: string): Unique => must(getData().uniquesById, id, 'único');
export const consumableById = (id: string): Consumable => must(getData().consumablesById, id, 'consumível');
export const enemyById = (id: string): Enemy => must(getData().enemiesById, id, 'inimigo');
export const lootTableById = (id: string): LootTable => must(getData().lootTablesById, id, 'tabela de saque');
export const regionById = (id: string): Region => must(getData().regionsById, id, 'região');
export const placeById = (id: string): Place => must(getData().placesById, id, 'lugar');
export const missionById = (id: string): Mission => must(getData().missionsById, id, 'missão');
export const dungeonById = (id: string): Dungeon => must(getData().dungeonsById, id, 'masmorra');
export const storyFlagById = (id: string): StoryFlag => must(getData().storyFlagsById, id, 'story_flag');

/** Atributos da tabela de balanceamento de um arquétipo. */
export const archetypeStats = (id: string) => {
  const s = getData().balance.atributosArquetipo[id];
  if (!s) throw new Error(`atributos do arquétipo não existem: ${id}`);
  return s;
};

/** Os 24 arquétipos de uma instituição, de uma classe ou de uma margem. */
export const archetypesOf = (filter: { instituicao?: string; classe?: string; margem?: string }): Archetype[] =>
  getData().archetypes.filter(
    (a) =>
      (filter.instituicao === undefined || a.instituicao === filter.instituicao) &&
      (filter.classe === undefined || a.classe === filter.classe) &&
      (filter.margem === undefined || a.margem === filter.margem),
  );

/** Treinador da ala de um arquétipo. */
export const trainerOfArchetype = (archetypeId: string): Trainer => trainerById(archetypeById(archetypeId).treinador);
