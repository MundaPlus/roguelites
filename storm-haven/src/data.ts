/** Static game data: goods, buildings, species, biomes, curses, glade events, perks. */

export type GoodId =
  | 'wood'
  | 'planks'
  | 'stone'
  | 'clay'
  | 'bricks'
  | 'grain'
  | 'flour'
  | 'bread'
  | 'berries'
  | 'mushrooms'
  | 'herbs'
  | 'stew'
  | 'tea'
  | 'ale'
  | 'tools'
  | 'coins';

export type Bag = Partial<Record<GoodId, number>>;

export interface GoodDef {
  name: string;
  icon: string;
  /** Trade value in coins per unit. */
  value: number;
  food?: 'raw' | 'complex';
  lux?: boolean;
}

export const GOODS: Record<GoodId, GoodDef> = {
  wood: { name: 'Wood', icon: '🪵', value: 1 },
  planks: { name: 'Planks', icon: '🪜', value: 3 },
  stone: { name: 'Stone', icon: '🪨', value: 2 },
  clay: { name: 'Clay', icon: '🏺', value: 2 },
  bricks: { name: 'Bricks', icon: '🧱', value: 4 },
  grain: { name: 'Grain', icon: '🌾', value: 1 },
  flour: { name: 'Flour', icon: '🥣', value: 2 },
  bread: { name: 'Bread', icon: '🍞', value: 3, food: 'complex' },
  berries: { name: 'Berries', icon: '🫐', value: 1, food: 'raw' },
  mushrooms: { name: 'Mushrooms', icon: '🍄', value: 1, food: 'raw' },
  herbs: { name: 'Herbs', icon: '🌿', value: 2 },
  stew: { name: 'Stew', icon: '🍲', value: 3, food: 'complex' },
  tea: { name: 'Tea', icon: '🍵', value: 4, lux: true },
  ale: { name: 'Ale', icon: '🍺', value: 4, lux: true },
  tools: { name: 'Tools', icon: '🔨', value: 8 },
  coins: { name: 'Coins', icon: '🪙', value: 1 },
};

export const GOOD_IDS = Object.keys(GOODS) as GoodId[];
export const FOODS: GoodId[] = ['bread', 'stew', 'berries', 'mushrooms'];
export const LUXURIES: GoodId[] = ['tea', 'ale'];

/** Resource node kinds that sit on glade tiles. */
export type ResId = 'berries' | 'mushrooms' | 'herbs' | 'stone' | 'clay';
export const RES_IDS: ResId[] = ['berries', 'mushrooms', 'herbs', 'stone', 'clay'];
export const RES_ICON: Record<ResId, string> = { berries: '🫐', mushrooms: '🍄', herbs: '🌿', stone: '🪨', clay: '🏺' };

export type BuildingId =
  | 'hearth'
  | 'road'
  | 'shelter'
  | 'house'
  | 'woodcutter'
  | 'gatherer'
  | 'quarry'
  | 'farm'
  | 'lumber'
  | 'warehouse'
  | 'mill'
  | 'bakery'
  | 'brickyard'
  | 'teahouse'
  | 'brewery'
  | 'cookhouse'
  | 'toolsmith'
  | 'trading'
  | 'shrine';

export type Kind = 'core' | 'house' | 'gather' | 'craft' | 'storage' | 'special';

export interface BuildingDef {
  name: string;
  icon: string;
  kind: Kind;
  cost: Bag;
  /** Construction time in seconds. 0 means instant. */
  build: number;
  workers: number;
  /** Houses: number of residents. */
  cap?: number;
  /** Gather buildings: what they collect and how far. */
  gathers?: ('wood' | ResId)[];
  radius?: number;
  /** Craft buildings: one recipe. */
  input?: Bag;
  output?: Bag;
  /** Work time in seconds for one gather or one recipe cycle. */
  time?: number;
  color: string;
  text: string;
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  hearth: { name: 'Hearth', icon: '🔥', kind: 'core', cost: {}, build: 0, workers: 0, color: '#c0392b', text: 'The heart of the town. Storage for all goods.' },
  road: { name: 'Road', icon: '🛤️', kind: 'core', cost: { wood: 1 }, build: 0, workers: 0, color: '#a68a64', text: 'Villagers walk 70% faster on roads.' },
  shelter: { name: 'Shelter', icon: '🛖', kind: 'house', cost: { wood: 8 }, build: 6, workers: 0, cap: 3, color: '#8d6e4a', text: 'Simple home for 3 villagers. +1 resolve.' },
  house: { name: 'House', icon: '🏡', kind: 'house', cost: { planks: 6, bricks: 4 }, build: 12, workers: 0, cap: 5, color: '#b5651d', text: 'Good home for 5 villagers. +3 resolve.' },
  woodcutter: { name: "Woodcutters' Camp", icon: '🪓', kind: 'gather', cost: { planks: 3 }, build: 8, workers: 2, gathers: ['wood'], radius: 7, time: 4, color: '#6b8e23', text: 'Cuts the forest nearby. Clearing the forest opens glades.' },
  gatherer: { name: "Gatherers' Hut", icon: '🧺', kind: 'gather', cost: { wood: 8 }, build: 8, workers: 2, gathers: ['berries', 'mushrooms', 'herbs'], radius: 8, time: 5, color: '#7a9e3a', text: 'Collects berries, mushrooms and herbs from nodes nearby.' },
  quarry: { name: 'Quarry', icon: '⛏️', kind: 'gather', cost: { wood: 8, planks: 4 }, build: 10, workers: 2, gathers: ['stone', 'clay'], radius: 8, time: 6, color: '#7f8c8d', text: 'Collects stone and clay from nodes nearby.' },
  farm: { name: 'Farm', icon: '🌾', kind: 'craft', cost: { wood: 6, planks: 4 }, build: 10, workers: 2, input: {}, output: { grain: 2 }, time: 8, color: '#c9a227', text: 'Grows grain. Fast in drizzle, stops in the storm.' },
  lumber: { name: 'Lumber Mill', icon: '🪚', kind: 'craft', cost: { wood: 12 }, build: 10, workers: 2, input: { wood: 3 }, output: { planks: 2 }, time: 6, color: '#a0522d', text: 'Saws wood into planks.' },
  warehouse: { name: 'Warehouse', icon: '📦', kind: 'storage', cost: { wood: 10, planks: 4 }, build: 10, workers: 0, color: '#6d4c41', text: 'A second drop point for goods. Shortens hauling.' },
  mill: { name: 'Mill', icon: '⚙️', kind: 'craft', cost: { planks: 8, stone: 4 }, build: 12, workers: 2, input: { grain: 3 }, output: { flour: 2 }, time: 6, color: '#d4a373', text: 'Grinds grain into flour.' },
  bakery: { name: 'Bakery', icon: '🥖', kind: 'craft', cost: { planks: 8, stone: 4 }, build: 12, workers: 2, input: { flour: 2, wood: 1 }, output: { bread: 4 }, time: 8, color: '#e9c46a', text: 'Bakes bread from flour. Uses wood as fuel.' },
  brickyard: { name: 'Brickyard', icon: '🏭', kind: 'craft', cost: { planks: 6, stone: 6 }, build: 12, workers: 2, input: { clay: 2, wood: 1 }, output: { bricks: 2 }, time: 8, color: '#b23a48', text: 'Fires clay into bricks. Uses wood as fuel.' },
  teahouse: { name: 'Tea House', icon: '🍵', kind: 'craft', cost: { planks: 8, clay: 4 }, build: 12, workers: 2, input: { herbs: 2 }, output: { tea: 2 }, time: 7, color: '#2a9d8f', text: 'Brews tea from herbs. A luxury.' },
  brewery: { name: 'Brewery', icon: '🍺', kind: 'craft', cost: { planks: 8, stone: 4 }, build: 12, workers: 2, input: { grain: 3 }, output: { ale: 2 }, time: 8, color: '#bc6c25', text: 'Brews ale from grain. A luxury.' },
  cookhouse: { name: 'Cookhouse', icon: '🍲', kind: 'craft', cost: { planks: 8, stone: 4 }, build: 12, workers: 2, input: { mushrooms: 2, herbs: 1 }, output: { stew: 3 }, time: 8, color: '#9c6644', text: 'Cooks stew from mushrooms and herbs.' },
  toolsmith: { name: 'Toolsmith', icon: '🔨', kind: 'craft', cost: { planks: 10, stone: 6 }, build: 14, workers: 2, input: { planks: 1, stone: 2 }, output: { tools: 1 }, time: 10, color: '#5c6770', text: 'Makes tools from planks and stone.' },
  trading: { name: 'Trading Post', icon: '⚖️', kind: 'special', cost: { planks: 12, bricks: 4 }, build: 14, workers: 0, color: '#e0a526', text: 'A caravan visits in each clearance. Sell goods, buy goods, pay tribute to the Queen.' },
  shrine: { name: 'Shrine', icon: '⛩️', kind: 'special', cost: { bricks: 8, tools: 2 }, build: 16, workers: 0, color: '#d1495b', text: '+2 resolve for every villager.' },
};

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
export const BASE_BLUEPRINTS: BuildingId[] = ['road', 'shelter', 'woodcutter', 'gatherer', 'quarry', 'farm', 'lumber', 'warehouse'];
export const BLUEPRINT_POOL: BuildingId[] = ['house', 'mill', 'bakery', 'brickyard', 'teahouse', 'brewery', 'cookhouse', 'toolsmith', 'trading', 'shrine'];

export type SpeciesId = 'human' | 'beaver' | 'fox' | 'lizard';

export interface SpeciesDef {
  name: string;
  icon: string;
  color: string;
  likes: GoodId[];
  lux: GoodId;
  skills: BuildingId[];
  base: number;
  /** Factor on the storm resolve penalty. */
  storm: number;
}

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  human: { name: 'Human', icon: '🧑', color: '#f4a261', likes: ['bread', 'berries'], lux: 'ale', skills: ['farm', 'mill', 'bakery', 'brewery'], base: 4, storm: 1 },
  beaver: { name: 'Beaver', icon: '🦫', color: '#a47148', likes: ['bread', 'mushrooms'], lux: 'tea', skills: ['woodcutter', 'lumber', 'toolsmith'], base: 4, storm: 1 },
  fox: { name: 'Fox', icon: '🦊', color: '#e76f51', likes: ['berries', 'stew'], lux: 'tea', skills: ['gatherer', 'cookhouse', 'teahouse'], base: 3, storm: 1 },
  lizard: { name: 'Lizard', icon: '🦎', color: '#80b918', likes: ['stew', 'mushrooms'], lux: 'ale', skills: ['quarry', 'brickyard', 'toolsmith'], base: 3, storm: 0.5 },
};

export type BiomeId = 'woods' | 'marsh' | 'highlands' | 'orchard' | 'vale';

export interface BiomeDef {
  name: string;
  icon: string;
  species: SpeciesId[];
  res: Record<ResId, number>;
  farm: number;
  danger: number;
  stormLen: number;
  ground: string;
  forest: string;
  text: string;
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  woods: { name: 'Royal Woodlands', icon: '🌳', species: ['human', 'beaver', 'fox'], res: { berries: 3, herbs: 2, mushrooms: 2, stone: 2, clay: 2 }, farm: 1, danger: 1, stormLen: 1, ground: '#5d7a3a', forest: '#24452a', text: 'Balanced. A good first home.' },
  marsh: { name: 'Clay Marshes', icon: '🐸', species: ['beaver', 'lizard', 'fox'], res: { berries: 1, herbs: 2, mushrooms: 4, stone: 1, clay: 4 }, farm: 0.75, danger: 1, stormLen: 1, ground: '#4f6b48', forest: '#1f3d33', text: 'Much clay and mushrooms. Farms grow 25% slower.' },
  highlands: { name: 'Stone Highlands', icon: '⛰️', species: ['human', 'lizard', 'beaver'], res: { berries: 2, herbs: 1, mushrooms: 1, stone: 4, clay: 2 }, farm: 1, danger: 1, stormLen: 1.3, ground: '#6b6f4a', forest: '#2e3d2a', text: 'Rich in stone. Storms last 30% longer.' },
  orchard: { name: 'Scarlet Orchard', icon: '🍎', species: ['human', 'fox', 'beaver'], res: { berries: 4, herbs: 3, mushrooms: 1, stone: 1, clay: 1 }, farm: 1.25, danger: 1.4, stormLen: 1, ground: '#6e7d3a', forest: '#3d2a24', text: 'Fertile. Farms grow 25% faster. More dangerous glades.' },
  vale: { name: 'Blightstorm Vale', icon: '⛈️', species: ['human', 'beaver', 'fox', 'lizard'], res: { berries: 2, herbs: 2, mushrooms: 2, stone: 2, clay: 2 }, farm: 1, danger: 1.6, stormLen: 1.25, ground: '#4a5a46', forest: '#1c2b2a', text: 'The final settlement at the eye of the storm.' },
};

export type CurseId = 'longStorm' | 'hungry' | 'restless' | 'impatient' | 'hardwood' | 'haunted' | 'thin' | 'rot';

export interface CurseDef {
  name: string;
  icon: string;
  text: string;
}

export const CURSES: Record<CurseId, CurseDef> = {
  longStorm: { name: 'Endless Rain', icon: '🌧️', text: 'Storms last 40% longer.' },
  hungry: { name: 'Hungry Mouths', icon: '🍽️', text: 'Villagers eat 35% more often.' },
  restless: { name: 'Restless Spirits', icon: '👻', text: '−1 resolve for every villager.' },
  impatient: { name: 'Impatient Queen', icon: '👑', text: 'Impatience grows 20% faster.' },
  hardwood: { name: 'Hardwood', icon: '🌲', text: 'Cutting trees takes 40% longer.' },
  haunted: { name: 'Haunted Glades', icon: '💀', text: '2 more dangerous glades.' },
  thin: { name: 'Thin Caravan', icon: '🐴', text: 'Start with 1 villager less.' },
  rot: { name: 'Rot', icon: '🦠', text: 'Start with half the food.' },
};
export const CURSE_IDS = Object.keys(CURSES) as CurseId[];

export type EventId = 'ghouls' | 'altar' | 'wolves' | 'ruins' | 'cache' | 'spring';

export interface EventDef {
  name: string;
  icon: string;
  danger: boolean;
  /** While active: resolve change for all villagers, extra impatience rate, work speed change. */
  resolve?: number;
  imp?: number;
  work?: number;
  cost: Bag;
  /** Seconds to solve after paying. */
  time: number;
  reward: string;
  weight: number;
}

export const EVENTS: Record<EventId, EventDef> = {
  ghouls: { name: 'Rotting Den', icon: '🧟', danger: true, resolve: -2, cost: { planks: 10, herbs: 4 }, time: 15, reward: '+1 reputation', weight: 3 },
  altar: { name: 'Storm Altar', icon: '🌀', danger: true, imp: 0.35, cost: { stone: 10, wood: 12 }, time: 15, reward: '+1 reputation', weight: 3 },
  wolves: { name: 'Wolf Lair', icon: '🐺', danger: true, resolve: -1, work: -0.15, cost: { wood: 20, berries: 10 }, time: 15, reward: '+1 reputation', weight: 3 },
  ruins: { name: 'Ancient Ruins', icon: '🏛️', danger: false, cost: { planks: 6 }, time: 12, reward: '1 blueprint pick', weight: 2 },
  cache: { name: 'Lost Cache', icon: '🎁', danger: false, cost: {}, time: 8, reward: 'free goods', weight: 2 },
  spring: { name: 'Silver Spring', icon: '💧', danger: false, cost: { wood: 10 }, time: 12, reward: '+1 resolve for all villagers', weight: 2 },
};
export const EVENT_IDS = Object.keys(EVENTS) as EventId[];

/** Capital upgrades picked during a run after each won settlement. */
export type PerkId = 'axes' | 'seeds' | 'guild' | 'settlers' | 'wagon' | 'envoy' | 'cozy' | 'archive' | 'scouts' | 'festival';

export interface PerkDef {
  name: string;
  icon: string;
  text: string;
}

export const PERKS: Record<PerkId, PerkDef> = {
  axes: { name: 'Sharp Axes', icon: '🪓', text: 'Woodcutters and gatherers work 30% faster.' },
  seeds: { name: 'Seed Stock', icon: '🌱', text: 'Farms grow 30% faster.' },
  guild: { name: 'Craft Guild', icon: '🛠️', text: 'Craft buildings work 20% faster.' },
  settlers: { name: 'Extra Settlers', icon: '👥', text: 'Start each settlement with 2 more villagers.' },
  wagon: { name: 'Supply Wagon', icon: '🛒', text: 'Start with 15 more planks and 20 more berries.' },
  envoy: { name: 'Royal Envoy', icon: '📜', text: 'Impatience grows 12% slower.' },
  cozy: { name: 'Cozy Homes', icon: '🛋️', text: 'Housed villagers get +1 resolve.' },
  archive: { name: 'Archive Copies', icon: '📚', text: 'One more blueprint pick at the start.' },
  scouts: { name: 'Scouts', icon: '🧭', text: 'Glade events cost 40% less and take half the time.' },
  festival: { name: 'Festivals', icon: '🎉', text: 'Luxuries give +2 more resolve.' },
};
export const PERK_IDS = Object.keys(PERKS) as PerkId[];

/** Permanent capital upgrades bought with crowns on the title screen. */
export type MetaId = 'stores' | 'charter' | 'patience' | 'lore' | 'library' | 'favor';

export interface MetaDef {
  name: string;
  icon: string;
  text: string;
  costs: number[];
}

export const METAS: Record<MetaId, MetaDef> = {
  stores: { name: 'Capital Stores', icon: '🏚️', text: '+8 wood and +8 berries at the start of each settlement per level.', costs: [3, 5, 8] },
  charter: { name: 'Settler Charter', icon: '📃', text: '+1 villager at the start of each settlement per level.', costs: [5, 10] },
  patience: { name: 'Royal Patience', icon: '⏳', text: 'Impatience grows 6% slower per level.', costs: [4, 7, 11] },
  lore: { name: 'Storm Lore', icon: '🌩️', text: 'The storm resolve penalty is 1 smaller per level.', costs: [6, 12] },
  library: { name: 'Royal Library', icon: '📖', text: 'Blueprint picks show 4 options instead of 3.', costs: [8] },
  favor: { name: 'Queen’s Favor', icon: '💠', text: 'Start each run with 1 more favor.', costs: [12] },
};
export const META_IDS = Object.keys(METAS) as MetaId[];

export const SEASONS = {
  drizzle: { name: 'Drizzle', icon: '🌦️', len: 100, text: 'Farms grow fast.' },
  clearance: { name: 'Clearance', icon: '☀️', len: 70, text: 'The caravan visits.' },
  storm: { name: 'Storm', icon: '⛈️', len: 50, text: '−2 resolve, farms stop, work is slower, dangers are worse.' },
} as const;
export type SeasonId = keyof typeof SEASONS;
